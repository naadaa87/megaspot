// 관리자 '수납 장부' (2026-11-28) — 고객(예약)마다 받은 돈을 수납일자·수납방법별로 적어 두고, 받을 돈과 맞춰 봅니다.
//
//  · 받을 돈(청구 금액) = 예약 금액(기존 정산 계산을 읽기만 함, 필요하면 장부에서 따로 지정) + 추가 청구 − 할인·감액
//  · 받은 돈 = 장부에 적은 수납 − 환불.  보증금(입금·반환)은 따로 셉니다.
//  · 수납방법: 계좌이체(법인) · 계좌이체(개인) · 온라인(페이앱) · 현장결제(포스기) · 현금 · 기타(직접 입력)
//  · 기존 시스템에 남은 결제 기록(페이앱 온라인 결제·결제링크·이용료 수납·정산 기록)은 '참고'로만 보여 주고,
//    담당자가 확인한 뒤 [장부에 옮기기]로 한 건씩 적습니다. 같은 기록은 두 번 옮겨지지 않습니다.
//
//  ※ 이 파일이 쓰는 곳은 새 표 세 개(ledger_entries · ledger_bookings · ledger_revisions)뿐입니다.
//    예약·문의·주문·결제·정산·보증금 표는 읽기만 하고, 확정서·알림·상태도 바꾸지 않습니다.
import { json, err, readJson, str, now, kstToday, SPACES } from './_lib.js';
import { settlementsFor } from './_settlement.js';
import { defaultBalanceDue, shiftDay } from './_booking_payment_schedule.js';
import { onlinePaymentsFor, refundAmountSql } from './_payapp_refund_history.js';
import { refundBooking, initialDepositAmount } from './_deposit_refunds.js';

export const METHODS = { bank_corp: '계좌이체(법인)', bank_personal: '계좌이체(개인)', payapp: '온라인(페이앱)', pos: '현장결제(포스기)', cash: '현금', other: '기타' };
export const KINDS = { receipt: '수납', refund: '환불', deposit_in: '보증금 입금', deposit_out: '보증금 반환', charge: '추가 청구', discount: '할인·감액' };
export const ITEMS = { rental: '이용료', food: '식음료', service: '부가서비스', extra: '추가 요금', other: '기타' };
export const PROOFS = { tax_invoice: '세금계산서', cash_receipt: '현금영수증', card: '카드 매출전표', none: '발행 안 함' };
export const STATUS = { unpaid: '미수', partial: '일부 수납', paid: '완납', over: '초과 수납', unbilled: '금액 미정' };
const BOOKING_STATUS = { confirmed: '예약 확정', completed: '이용 완료', cancelled: '취소', payment_review: '결제 확인 중', pending: '대기' };
const MONEY = ['receipt', 'refund', 'deposit_in', 'deposit_out'];
const SPACE_NAMES = { ...SPACES, 'food-only': '식음료 단독' };
const CODE = /^[A-Z0-9][A-Z0-9-]{3,40}$/, DATE = /^\d{4}-\d{2}-\d{2}$/, REQ = /^[a-zA-Z0-9_-]{8,80}$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const changed = r => (r?.meta?.changes ?? r?.changes ?? 0) > 0;   // D1·로컬 sqlite 둘 다
const validDate = d => DATE.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
// 저장 시각(UTC 'YYYY-MM-DD HH:MM:SS') → 한국 날짜
export const kstDay = at => { const t = Date.parse(String(at || '').replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(String(at || '')) ? '' : 'Z')); return isFinite(t) ? new Date(t + 9 * 36e5).toISOString().slice(0, 10) : ''; };
export const dday = (date, today) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);

async function inList(env, sql, codes, extra = []) {
  if (!codes.length) return [];
  const out = [];
  for (let i = 0; i < codes.length; i += 90) {
    const part = codes.slice(i, i + 90);
    const { results } = await env.DB.prepare(sql.replace('(?)', '(' + part.map(() => '?').join(',') + ')')).bind(...part, ...extra).all();
    out.push(...(results || []));
  }
  return out;
}

// 합계 → 청구·받은 금액·남은 금액·상태
//  장부 입력 필요(sync): 시스템에 남은 받은 금액이 장부보다 많거나, 온라인(페이앱) 결제가 장부의 온라인(페이앱) 기록보다 많을 때.
//  '옮기기 확인 완료'를 표시한 예약은 차이가 있어도 더 묻지 않습니다.
export function summarize({ base = null, sums = {}, systemNet = 0, onlineNet = 0, ledgerOnline = 0, checked = false }) {
  const s = k => Number(sums[k] || 0);
  const charge = s('charge'), discount = s('discount'), receipt = s('receipt'), refund = s('refund');
  const billed = base == null && !charge && !discount ? null : Math.max(0, (base || 0) + charge - discount);
  const received = receipt - refund, balance = billed == null ? null : billed - received;
  const status = billed == null ? 'unbilled' : balance < 0 ? 'over' : balance === 0 ? 'paid' : received > 0 ? 'partial' : 'unpaid';
  const unrecorded = Math.max(0, (systemNet || 0) - received, (onlineNet || 0) - (ledgerOnline || 0));
  return { base, charge, discount, billed, receipt, refund, received, balance, status, status_label: STATUS[status],
    deposit: { in: s('deposit_in'), out: s('deposit_out'), held: s('deposit_in') - s('deposit_out') },
    system_net: systemNet || 0, unrecorded, sync: !checked && unrecorded > 0 };
}

// 결제링크로 받은 온라인 결제 (주문에 예약번호가 붙지 않는 결제라 따로 읽습니다)
async function linkPayments(env, codes) {
  return inList(env, `SELECT l.booking_code, l.title AS link_title, o.oid, o.title, o.price, o.status, o.paid_at, o.created_at, o.pay_method, p.mul_no, ${refundAmountSql('o')} AS refunded
    FROM payment_links l JOIN orders o ON o.oid = l.order_oid LEFT JOIN payapp_payments p ON p.oid = o.oid
    WHERE l.booking_code IN (?) AND o.booking_code IS NULL AND o.test = 0 AND o.status IN ('paid','refunded') ORDER BY o.id`, codes);
}

// 예약번호 목록 → 장부 요약 (수납 관리 화면도 이 함수를 씁니다)
export async function ledgerSummaries(env, codes, settle = null) {
  if (!codes.length) return {};
  const [S, sums, meta, links] = await Promise.all([
    settle ? Promise.resolve(settle) : settlementsFor(env, codes),
    inList(env, "SELECT booking_code, kind, method, SUM(amount) AS total, COUNT(*) AS n FROM ledger_entries WHERE state = 'active' AND booking_code IN (?) GROUP BY booking_code, kind, method", codes),
    inList(env, 'SELECT * FROM ledger_bookings WHERE booking_code IN (?)', codes),
    linkPayments(env, codes)
  ]);
  const last = await inList(env, "SELECT booking_code, paid_on, method, method_note, amount FROM ledger_entries WHERE state = 'active' AND kind = 'receipt' AND booking_code IN (?) ORDER BY paid_on DESC, id DESC", codes);
  const out = {};
  for (const code of codes) {
    const m = meta.find(r => r.booking_code === code) || null, st = S[code] || {};
    const own = {}; let n = 0, ledgerOnline = 0;
    for (const r of sums) if (r.booking_code === code) {
      own[r.kind] = (own[r.kind] || 0) + r.total; n += r.n;
      if (r.method === 'payapp') ledgerOnline += r.kind === 'receipt' ? r.total : r.kind === 'refund' ? -r.total : 0;
    }
    const linkNet = links.filter(r => r.booking_code === code).reduce((a, r) => a + Math.max(0, r.price - (r.refunded || 0)), 0);
    const base = m && m.base_override != null ? m.base_override : (st.amount ?? null);
    const lr = last.find(r => r.booking_code === code);
    const onlineNet = (st.pg_received || 0) - (st.pg_refunded || 0) + linkNet;
    out[code] = { ...summarize({ base, sums: own, systemNet: (st.net || 0) + linkNet, onlineNet, ledgerOnline, checked: !!(m && m.checked_at) }),
      entries: n, system_received: (st.received || 0) + links.filter(r => r.booking_code === code).reduce((a, r) => a + r.price, 0), base_source: m && m.base_override != null ? 'ledger' : 'booking', booking_amount: st.amount ?? null,
      checked_at: m ? m.checked_at || null : null, memo: m ? m.memo : '',
      last_receipt: lr ? { paid_on: lr.paid_on, method: lr.method, method_label: lr.method === 'other' ? (lr.method_note || '기타') : METHODS[lr.method] || '', amount: lr.amount } : null };
  }
  return out;
}

function bookingRow(b, today) {
  return { code: b.booking_code, inquiry_ref: b.inquiry_ref || '', name: b.customer_name, org: b.org || '', phone: b.phone, space_id: b.space_id, space: SPACE_NAMES[b.space_id] || b.space_id,
    date: b.date, start_h: b.start_h, end_h: b.end_h, headcount: b.headcount, booking_status: b.status, booking_status_label: BOOKING_STATUS[b.status] || b.status, d: dday(b.date, today) };
}
const BOOKING_SELECT = `SELECT b.booking_code, b.space_id, b.inquiry_ref, b.customer_name, b.phone, b.date, b.start_h, b.end_h, b.headcount, b.status, b.created_at,
  CASE WHEN json_valid(i.data) THEN json_extract(i.data, '$.org') END AS org FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref`;

// 고객별 장부 목록 (이용일 기간)
export async function ledgerList(env, { from, to, today = kstToday() } = {}) {
  from = validDate(from) ? from : shiftDay(today, -365); to = validDate(to) ? to : shiftDay(today, 180);
  if (from > to) [from, to] = [to, from];
  const { results } = await env.DB.prepare(BOOKING_SELECT + ' WHERE b.date BETWEEN ? AND ? ORDER BY b.date DESC, b.start_h, b.id LIMIT 3001').bind(from, to).all();
  const rows = (results || []).slice(0, 3000), codes = rows.map(r => r.booking_code);
  const [sum, sched, journey] = await Promise.all([
    ledgerSummaries(env, codes),
    inList(env, 'SELECT booking_code, due_date FROM booking_payment_schedule WHERE booking_code IN (?)', codes),
    inList(env, 'SELECT booking_code, confirmed_at FROM booking_journey_state WHERE booking_code IN (?)', codes)
  ]);
  const items = [];
  for (const b of rows) {
    const l = sum[b.booking_code];
    // 취소된 예약은 돈이 오갔거나 받을 돈(취소 수수료)이 남은 것만 보여 줍니다
    if (b.status === 'cancelled' && !l.entries && !l.system_received && !(l.billed > 0)) continue;
    const due = sched.find(r => r.booking_code === b.booking_code)?.due_date || defaultBalanceDue({ ...b, confirmed_at: journey.find(r => r.booking_code === b.booking_code)?.confirmed_at || null });
    const x = { ...bookingRow(b, today), ...l, due_date: due };
    x.overdue = x.balance > 0 && (today > due || x.d < 0);   // 납부 기한이 지났거나 이용일이 지난 미수
    x.after = x.balance > 0 && x.d < 0;
    x.todo = x.sync || x.status === 'over' || (x.balance > 0 && (x.overdue || x.d <= 15)) || (x.status === 'unbilled' && x.d >= 0 && x.d <= 20 && b.status !== 'cancelled');
    items.push(x);
  }
  const count = f => items.filter(f).length, total = f => items.filter(f).reduce((a, x) => a + (x.balance || 0), 0);
  const counts = { all: items.length, todo: count(x => x.todo), due: count(x => x.balance > 0), sync: count(x => x.sync), overdue: count(x => x.overdue), after: count(x => x.after) };
  for (const k of Object.keys(STATUS)) counts[k] = count(x => x.status === k);
  const month = today.slice(0, 7);
  const { results: monthRows } = await env.DB.prepare("SELECT kind, method, SUM(amount) AS total, COUNT(*) AS n FROM ledger_entries WHERE state = 'active' AND paid_on BETWEEN ? AND ? GROUP BY kind, method")
    .bind(month + '-01', month + '-31').all();
  const mr = monthRows || [], net = mr.reduce((a, r) => a + (r.kind === 'receipt' ? r.total : r.kind === 'refund' ? -r.total : 0), 0);
  return { today, from, to, counts, truncated: (results || []).length > 3000,
    totals: { outstanding: total(x => x.balance > 0), overdue: total(x => x.overdue), after: total(x => x.after), unrecorded: items.filter(x => x.sync).reduce((a, x) => a + x.unrecorded, 0) },
    month: { month, net, count: mr.filter(r => r.kind === 'receipt').reduce((a, r) => a + r.n, 0) },
    items, options: options() };
}
const options = () => ({ methods: METHODS, kinds: KINDS, items: ITEMS, proofs: PROOFS, status: STATUS });

// 수납 내역 (수납일자 기준, 모든 고객)
export async function ledgerJournal(env, { from, to, method = '', kind = '', today = kstToday() } = {}) {
  const month = today.slice(0, 7);
  from = validDate(from) ? from : month + '-01'; to = validDate(to) ? to : today;
  if (from > to) [from, to] = [to, from];
  const where = ["e.state = 'active'", 'e.paid_on BETWEEN ? AND ?'], args = [from, to];
  if (has(METHODS, method)) { where.push('e.method = ?'); args.push(method); }
  if (has(KINDS, kind)) { where.push('e.kind = ?'); args.push(kind); }
  const { results } = await env.DB.prepare(`SELECT e.*, b.customer_name, b.phone, b.date AS booking_date, b.space_id, b.status AS booking_status,
      CASE WHEN json_valid(i.data) THEN json_extract(i.data, '$.org') END AS org
    FROM ledger_entries e LEFT JOIN bookings b ON b.booking_code = e.booking_code LEFT JOIN inquiries i ON i.ref = b.inquiry_ref
    WHERE ${where.join(' AND ')} ORDER BY e.paid_on DESC, e.id DESC LIMIT 3001`).bind(...args).all();
  const rows = (results || []).slice(0, 3000).map(r => ({ ...entryOut(r), name: r.customer_name || '', org: r.org || '', phone: r.phone || '', booking_date: r.booking_date || '', space: SPACE_NAMES[r.space_id] || r.space_id || '' }));
  const byMethod = {};
  for (const k of [...Object.keys(METHODS), '']) byMethod[k] = { receipt: 0, refund: 0, deposit_in: 0, deposit_out: 0, net: 0, n: 0 };
  const byKind = {}; for (const k of Object.keys(KINDS)) byKind[k] = 0;
  for (const r of rows) {
    byKind[r.kind] += r.amount;
    if (!MONEY.includes(r.kind)) continue;
    const m = byMethod[r.method] || byMethod['']; m[r.kind] += r.amount; m.n++;
    m.net = m.receipt - m.refund;
  }
  return { from, to, method: has(METHODS, method) ? method : '', kind: has(KINDS, kind) ? kind : '', truncated: (results || []).length > 3000, entries: rows, by_method: byMethod, by_kind: byKind,
    net: byKind.receipt - byKind.refund, options: options() };
}

function entryOut(r) {
  return { id: r.id, booking_code: r.booking_code, kind: r.kind, kind_label: KINDS[r.kind] || r.kind, item: r.item, item_label: ITEMS[r.item] || '',
    amount: r.amount, method: r.method, method_note: r.method_note, method_label: r.method === 'other' ? (r.method_note ? '기타 · ' + r.method_note : '기타') : METHODS[r.method] || '',
    paid_on: r.paid_on, payer: r.payer, proof: r.proof, proof_label: PROOFS[r.proof] || '', ref_no: r.ref_no, source_ref: r.source_ref || '', memo: r.memo,
    recorded_by: r.recorded_by, state: r.state, void_reason: r.void_reason, version: r.version, created_at: r.created_at, updated_at: r.updated_at };
}

// 기존 시스템에 남은 결제 기록 → 장부에 옮길 수 있는 줄 (읽기만 함)
async function references(env, code, settle) {
  const out = [], [online, links, manual] = await Promise.all([
    onlinePaymentsFor(env, code),
    linkPayments(env, [code]),
    env.DB.prepare("SELECT id, kind, amount, note, created_at FROM booking_payment_current WHERE booking_code = ? AND state = 'active' ORDER BY id").bind(code).all().then(r => r.results || [])
  ]);
  for (const o of online) {
    out.push({ source: 'order:' + o.oid, group: '온라인 결제(페이앱)', kind: 'receipt', amount: o.price, date: kstDay(o.paid_at || o.created_at), method: 'payapp', ref_no: o.mul_no || o.oid, label: o.title || '온라인 결제', note: '주문번호 ' + o.oid });
    for (const e of o.events || []) if (e.effective_amount > 0)
      out.push({ source: 'refund:' + e.event_key, group: '온라인 결제(페이앱)', kind: 'refund', amount: e.effective_amount, date: kstDay(e.provider_at || e.created_at), method: 'payapp', ref_no: e.refund_no || o.mul_no || o.oid, label: (o.title || '온라인 결제') + ' 취소', note: '주문번호 ' + o.oid });
  }
  for (const o of links) {
    out.push({ source: 'link:' + o.oid, group: '결제링크(페이앱)', kind: 'receipt', amount: o.price, date: kstDay(o.paid_at || o.created_at), method: 'payapp', ref_no: o.mul_no || o.oid, label: o.title || o.link_title || '결제링크', note: '주문번호 ' + o.oid });
    if (o.refunded > 0) out.push({ source: 'link-refund:' + o.oid, group: '결제링크(페이앱)', kind: 'refund', amount: o.refunded, date: kstDay(o.paid_at || o.created_at), method: 'payapp', ref_no: o.mul_no || o.oid, label: (o.title || '결제링크') + ' 취소', note: '주문번호 ' + o.oid });
  }
  let manualReceipts = 0;
  for (const e of manual) {
    if (e.kind === 'receipt') manualReceipts += e.amount;
    out.push({ source: 'manual:' + e.id, group: '이용료 수납·정산 기록', kind: e.kind, amount: e.amount, date: kstDay(e.created_at), method: '', ref_no: '', label: e.kind === 'receipt' ? '입금 기록' : '환불 기록', note: e.note || '' });
  }
  // 예전 확정서에만 적혀 있고 수납·정산 기록으로 옮겨지기 전인 받은 금액
  const legacy = settle && settle.legacy_pending ? Math.max(0, (settle.manual_received || 0) - manualReceipts) : 0;
  if (legacy > 0) out.push({ source: 'legacy:' + code, group: '이용료 수납·정산 기록', kind: 'receipt', amount: legacy, date: '', method: '', ref_no: '', label: '예전 확정서에 적힌 받은 금액', note: '수납·정산 기록으로 옮겨지기 전 금액' });
  return out;
}

// 예약 1건 장부
export async function ledgerDetail(env, code, today = kstToday()) {
  const b = await env.DB.prepare(BOOKING_SELECT + ' WHERE b.booking_code = ?').bind(code).first();
  if (!b) return null;
  const settle = (await settlementsFor(env, [code]))[code] || {};
  const [sum, entries, revisions, meta, refs, sched, journey, deposit, others] = await Promise.all([
    ledgerSummaries(env, [code], { [code]: settle }),
    env.DB.prepare('SELECT * FROM ledger_entries WHERE booking_code = ? ORDER BY paid_on DESC, id DESC').bind(code).all().then(r => r.results || []),
    env.DB.prepare('SELECT * FROM ledger_revisions WHERE booking_code = ? ORDER BY id DESC LIMIT 200').bind(code).all().then(r => r.results || []),
    env.DB.prepare('SELECT * FROM ledger_bookings WHERE booking_code = ?').bind(code).first(),
    references(env, code, settle),
    env.DB.prepare('SELECT due_date FROM booking_payment_schedule WHERE booking_code = ?').bind(code).first(),
    env.DB.prepare('SELECT confirmed_at FROM booking_journey_state WHERE booking_code = ?').bind(code).first(),
    refundBooking(env, code).catch(() => null),
    env.DB.prepare(BOOKING_SELECT + " WHERE REPLACE(REPLACE(b.phone, '-', ''), ' ', '') = ? AND b.booking_code <> ? ORDER BY b.date DESC LIMIT 12").bind(String(b.phone || '').replace(/[^\d]/g, ''), code).all().then(r => r.results || [])
  ]);
  const active = new Map(entries.filter(e => e.state === 'active' && e.source_ref).map(e => [e.source_ref, e.id]));
  const otherSum = await ledgerSummaries(env, others.map(o => o.booking_code));
  const due = sched?.due_date || defaultBalanceDue({ ...b, confirmed_at: journey?.confirmed_at || null });
  const l = sum[code];
  return {
    booking: { ...bookingRow(b, today), due_date: due, overdue: l.balance > 0 && (today > due || dday(b.date, today) < 0) },
    ledger: l, meta: meta ? { base_override: meta.base_override, base_reason: meta.base_reason, checked_at: meta.checked_at, memo: meta.memo, updated_at: meta.updated_at } : null,
    entries: entries.map(entryOut),
    history: revisions.map(r => ({ id: r.id, entry_id: r.entry_id, action: r.action, reason: r.reason, before: safeJson(r.before), after: safeJson(r.after), recorded_by: r.recorded_by, at: r.created_at })),
    // 시스템 기준 받은 금액: 기존 정산(온라인 결제·이용료 수납·정산 기록) + 예약에 연결된 결제링크 결제
    system: { amount: settle.amount ?? null, received: l.system_received, refunded: l.system_received - l.system_net, net: l.system_net, legacy_pending: !!settle.legacy_pending,
      references: refs.map(x => ({ ...x, done: active.has(x.source), entry_id: active.get(x.source) || null })) },
    deposit: deposit ? { amount: deposit.deposit_amount ?? initialDepositAmount(deposit), state: deposit.state || '', method: deposit.deposit_method || '' } : null,
    others: others.map(o => ({ ...bookingRow(o, today), billed: otherSum[o.booking_code]?.billed ?? null, received: otherSum[o.booking_code]?.received ?? 0, balance: otherSum[o.booking_code]?.balance ?? null, status: otherSum[o.booking_code]?.status, status_label: otherSum[o.booking_code]?.status_label })),
    options: options(), today
  };
}
const safeJson = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// 입력값 확인 (새 기록·수정 공통)
function clean(d, today) {
  const kind = has(KINDS, d.kind) ? d.kind : '';
  if (!kind) return { error: '종류(수납·환불·보증금·추가 청구·할인)를 골라 주세요.' };
  const amount = Number(d.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1e9) return { error: '금액을 원 단위 숫자로 적어 주세요.' };
  const paid_on = String(d.paid_on || '');
  if (!validDate(paid_on) || paid_on < '2020-01-01') return { error: (MONEY.includes(kind) ? '수납일자' : '청구일') + '를 확인해 주세요.' };
  if (paid_on > today) return { error: '오늘 이후 날짜로는 적을 수 없습니다. 실제로 받은(돌려준) 날짜를 적어 주세요.' };
  const money = MONEY.includes(kind);
  const method = money ? (has(METHODS, d.method) ? d.method : '') : '';
  if (money && !method) return { error: '수납방법을 골라 주세요.' };
  const method_note = method === 'other' ? str(d.method_note, 40) : '';
  if (method === 'other' && !method_note) return { error: "'기타' 수납방법은 내용을 직접 적어 주세요. 예: 상품권, 상계 처리" };
  const memo = str(d.memo, 300);
  if (!money && !memo) return { error: (kind === 'charge' ? '추가 청구' : '할인·감액') + ' 사유를 메모에 적어 주세요.' };
  return { value: { kind, amount, paid_on, method, method_note,
    item: money && kind.startsWith('deposit') ? 'deposit' : has(ITEMS, d.item) ? d.item : (kind === 'charge' ? 'extra' : 'rental'),
    payer: money ? str(d.payer, 60) : '', proof: money && has(PROOFS, d.proof) ? d.proof : '', ref_no: money ? str(d.ref_no, 80) : '',
    memo, recorded_by: str(d.recorded_by, 30) } };
}
const FIELDS = ['kind', 'item', 'amount', 'method', 'method_note', 'paid_on', 'payer', 'proof', 'ref_no', 'memo'];
const pick = e => Object.fromEntries(FIELDS.concat(['source_ref', 'state', 'void_reason']).map(k => [k, e[k] ?? null]));

// 바꾼 뒤에도 환불이 받은 돈을, 보증금 반환이 받은 보증금을 넘지 않는지
async function guardTotals(env, code, change) {
  const { results } = await env.DB.prepare("SELECT id, kind, amount FROM ledger_entries WHERE booking_code = ? AND state = 'active'").bind(code).all();
  const s = { receipt: 0, refund: 0, deposit_in: 0, deposit_out: 0 };
  for (const e of results || []) if (e.id !== change.id && has(s, e.kind)) s[e.kind] += e.amount;
  if (change.value && has(s, change.value.kind)) s[change.value.kind] += change.value.amount;
  if (s.refund > s.receipt) return '환불 금액이 장부에 적힌 받은 금액보다 큽니다. 받은 기록을 먼저 적어 주세요.';
  if (s.deposit_out > s.deposit_in) return '보증금 반환 금액이 장부에 적힌 보증금 입금보다 큽니다. 보증금 입금을 먼저 적어 주세요.';
  return '';
}

async function createEntry(env, code, d) {
  const id = str(d.request_id, 80);
  if (!REQ.test(id)) return err('저장 요청번호가 올바르지 않습니다. 화면을 새로고침해 주세요.');
  const existing = await env.DB.prepare('SELECT * FROM ledger_entries WHERE request_id = ?').bind(id).first();
  if (existing) {
    if (existing.booking_code !== code || existing.amount !== Number(d.amount) || existing.kind !== d.kind) return err('다른 기록에 쓰인 저장 요청번호입니다. 화면을 새로고침해 주세요.', 409, 'LEDGER_CONFLICT');
    return json({ ok: true, duplicate: true, entry: entryOut(existing) });
  }
  const today = kstToday(), c = clean(d, today);
  if (c.error) return err(c.error);
  const v = c.value;
  let source = null;
  if (d.source_ref) {
    source = str(d.source_ref, 120);
    const settle = (await settlementsFor(env, [code]))[code] || {};
    const ref = (await references(env, code, settle)).find(x => x.source === source);
    if (!ref) return err('옮길 결제 기록을 찾지 못했습니다. 새로고침 후 다시 골라 주세요.', 409, 'LEDGER_SOURCE');
    if (ref.kind !== v.kind || ref.amount !== v.amount) return err('옮기는 결제 기록과 종류·금액이 같아야 합니다. 금액이 다르면 [장부에 옮기기] 대신 직접 기록해 주세요.');
    if (await env.DB.prepare("SELECT id FROM ledger_entries WHERE source_ref = ? AND state = 'active'").bind(source).first()) return err('이미 장부에 옮긴 결제 기록입니다.', 409, 'LEDGER_SOURCE');
  }
  const bad = await guardTotals(env, code, { value: v });
  if (bad) return err(bad);
  const t = now();
  await env.DB.prepare(`INSERT INTO ledger_entries (booking_code, kind, item, amount, method, method_note, paid_on, payer, proof, ref_no, source_ref, memo, recorded_by, request_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(code, v.kind, v.item, v.amount, v.method, v.method_note, v.paid_on, v.payer, v.proof, v.ref_no, source, v.memo, v.recorded_by, id, t, t).run();
  const saved = await env.DB.prepare('SELECT * FROM ledger_entries WHERE request_id = ?').bind(id).first();
  await env.DB.prepare('INSERT INTO ledger_revisions (booking_code, entry_id, action, before, after, reason, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(code, saved.id, 'create', null, JSON.stringify(pick(saved)), source ? '시스템 결제 기록에서 옮김' : '', v.recorded_by, t).run();
  return json({ ok: true, entry: entryOut(saved) });
}

async function changeEntry(env, code, entryId, d) {
  const e = await env.DB.prepare('SELECT * FROM ledger_entries WHERE id = ? AND booking_code = ?').bind(entryId, code).first();
  if (!e) return err('장부 기록을 찾지 못했습니다.', 404, 'NOT_FOUND');
  if (e.state !== 'active') return err('이미 취소한 기록입니다.', 409, 'LEDGER_CHANGED');
  if (d.version !== e.version) return err('다른 화면에서 이 기록이 바뀌었습니다. 새로고침 후 다시 확인해 주세요.', 409, 'LEDGER_CHANGED');
  const t = now(), by = str(d.recorded_by, 30), reason = str(d.reason, 300);
  if (d.action === 'void') {
    if (!reason) return err('기록을 취소하는 사유를 적어 주세요.');
    const bad = await guardTotals(env, code, { id: e.id });
    if (bad) return err('이 기록을 취소하면 환불·반환 금액이 받은 금액보다 많아집니다. 환불·반환 기록을 먼저 정리해 주세요.');
    const r = await env.DB.prepare("UPDATE ledger_entries SET state = 'void', void_reason = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = 'active'").bind(reason, t, e.id, e.version).run();
    if (!changed(r)) return err('다른 화면에서 이 기록이 바뀌었습니다. 새로고침 후 다시 확인해 주세요.', 409, 'LEDGER_CHANGED');
    await env.DB.prepare('INSERT INTO ledger_revisions (booking_code, entry_id, action, before, after, reason, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(code, e.id, 'void', JSON.stringify(pick(e)), JSON.stringify({ ...pick(e), state: 'void', void_reason: reason }), reason, by, t).run();
    return json({ ok: true });
  }
  if (d.action !== 'edit') return err('수정 또는 취소를 골라 주세요.');
  const c = clean({ ...d, recorded_by: by }, kstToday());
  if (c.error) return err(c.error);
  const v = c.value;
  if (e.source_ref && (v.kind !== e.kind || v.amount !== e.amount)) return err('시스템 결제에서 옮긴 기록은 종류·금액을 바꿀 수 없습니다. 이 기록을 취소한 뒤 다시 적어 주세요.');
  const bad = await guardTotals(env, code, { id: e.id, value: v });
  if (bad) return err(bad);
  const r = await env.DB.prepare(`UPDATE ledger_entries SET kind = ?, item = ?, amount = ?, method = ?, method_note = ?, paid_on = ?, payer = ?, proof = ?, ref_no = ?, memo = ?, version = version + 1, updated_at = ?
    WHERE id = ? AND version = ? AND state = 'active'`).bind(v.kind, v.item, v.amount, v.method, v.method_note, v.paid_on, v.payer, v.proof, v.ref_no, v.memo, t, e.id, e.version).run();
  if (!changed(r)) return err('다른 화면에서 이 기록이 바뀌었습니다. 새로고침 후 다시 확인해 주세요.', 409, 'LEDGER_CHANGED');
  const after = await env.DB.prepare('SELECT * FROM ledger_entries WHERE id = ?').bind(e.id).first();
  await env.DB.prepare('INSERT INTO ledger_revisions (booking_code, entry_id, action, before, after, reason, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(code, e.id, 'edit', JSON.stringify(pick(e)), JSON.stringify(pick(after)), reason, by, t).run();
  return json({ ok: true, entry: entryOut(after) });
}

// 예약별 설정: 청구 기준 금액 직접 지정 · 기존 결제 옮기기 끝(확인 완료) · 장부 메모
async function saveMeta(env, code, d) {
  const before = await env.DB.prepare('SELECT * FROM ledger_bookings WHERE booking_code = ?').bind(code).first();
  const t = now(), by = str(d.recorded_by, 30);
  let base = before ? before.base_override : null, reason = before ? before.base_reason : '', checked = before ? before.checked_at : null, memo = before ? before.memo : '';
  if (has(d, 'base_override')) {
    if (d.base_override === null || d.base_override === '') { base = null; reason = ''; }
    else {
      const n = Number(d.base_override);
      if (!Number.isSafeInteger(n) || n < 0 || n > 1e9) return err('청구 기준 금액을 원 단위 숫자로 적어 주세요.');
      reason = str(d.base_reason, 200);
      if (!reason) return err('예약 금액과 다르게 정하는 이유를 적어 주세요.');
      base = n;
    }
  }
  if (has(d, 'checked')) checked = d.checked === true ? (checked || t) : null;
  if (has(d, 'memo')) memo = str(d.memo, 500);
  await env.DB.prepare(`INSERT INTO ledger_bookings (booking_code, base_override, base_reason, checked_at, memo, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(booking_code) DO UPDATE SET base_override = excluded.base_override, base_reason = excluded.base_reason, checked_at = excluded.checked_at, memo = excluded.memo, updated_at = excluded.updated_at`)
    .bind(code, base, reason, checked, memo, t).run();
  const after = { base_override: base, base_reason: reason, checked_at: checked, memo };
  await env.DB.prepare('INSERT INTO ledger_revisions (booking_code, entry_id, action, before, after, reason, recorded_by, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)')
    .bind(code, 'meta', before ? JSON.stringify({ base_override: before.base_override, base_reason: before.base_reason, checked_at: before.checked_at, memo: before.memo }) : null, JSON.stringify(after), reason || '', by, t).run();
  return json({ ok: true, meta: after });
}

export async function ledgerAdmin({ request, env, path, method, url }) {
  const q = url ? new URL(url).searchParams : new URL(request.url).searchParams;
  if (path === 'ledger' && method === 'GET') return json({ ok: true, ...(await ledgerList(env, { from: q.get('from'), to: q.get('to') })) });
  if (path === 'ledger/entries' && method === 'GET') return json({ ok: true, ...(await ledgerJournal(env, { from: q.get('from'), to: q.get('to'), method: q.get('method') || '', kind: q.get('kind') || '' })) });
  const m = path.match(/^ledger\/([A-Za-z0-9-]+)(?:\/(entries|meta)(?:\/(\d+))?)?$/);
  if (!m) return null;
  const code = m[1].toUpperCase();
  if (!CODE.test(code)) return err('예약번호를 확인해 주세요.');
  if (!m[2]) {
    if (method !== 'GET') return err('지원하지 않는 요청입니다.', 405, 'METHOD');
    const detail = await ledgerDetail(env, code);
    return detail ? json({ ok: true, ...detail }) : err('예약을 찾지 못했습니다.', 404, 'NOT_FOUND');
  }
  if (method !== 'POST') return err('지원하지 않는 요청입니다.', 405, 'METHOD');
  if (!(await env.DB.prepare('SELECT 1 FROM bookings WHERE booking_code = ?').bind(code).first())) return err('예약을 찾지 못했습니다.', 404, 'NOT_FOUND');
  let d; try { d = await readJson(request, 8192); } catch (e) { return err(e.message); }
  if (m[2] === 'meta') return m[3] ? err('지원하지 않는 요청입니다.', 405, 'METHOD') : saveMeta(env, code, d);
  if (m[3]) return changeEntry(env, code, Number(m[3]), d);
  return createEntry(env, code, d);
}
