// 입점 공간 예약 — 고객 요청 접수 · 호스트 처리(견적·승인·확정·결제 기록·메시지) · 고객 처리(견적 수락·입금 알림·취소) · 화면별 보기
//  결제는 고객이 호스트에게 직접 합니다. 여기서는 호스트가 받은 금액을 기록만 합니다.
//  고객이 고른 본사 부가서비스(출장뷔페·케이터링·출장 칵테일·사회자/강연자·현장 매니저·디자인)는 hq_addons 로 본사에 따로 넘어갑니다.
import { str, num, isDate, isEmail, now, kstToday, uniqueRef, log } from './_lib.js';
import { phoneOk, last4, timeOk, safeJson } from './_platform.js';
import { BOOKING_STATUS, BOOKING_OPEN, ADDON_LABEL, ADDON_STATUS, PURPOSE_LABEL, PLATFORM, estimate, bump } from './_hostplat.js';

const KST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const amt = v => { const n = num(v); return n === null || n < 0 ? null : Math.min(n, 999999999); };
const MAX_MSG = 200;
export const PAY_KINDS = { deposit: '예약금', balance: '잔금', full: '전액', extra: '추가 결제', refund: '환불' };
export const PAY_METHODS = { bank: '계좌이체', card_link: '카드·간편결제', onsite: '현장 결제', cash: '현금', etc: '기타' };

function push(data, what, by) { (data.log = data.log || []).push({ at: KST(), what, by }); if (data.log.length > 80) data.log = data.log.slice(-80); }
function message(data, from, text) { (data.messages = data.messages || []).push({ from, text: str(text, 1000), at: KST() }); if (data.messages.length > MAX_MSG) data.messages = data.messages.slice(-MAX_MSG); }
function paidSum(data) { return (data.payments || []).reduce((a, p) => a + (p.kind === 'refund' ? -p.amount : p.amount), 0); }

// 고객이 보낸 예약 요청·문의 → host_bookings + (고른 것이 있으면) hq_addons
export async function createBooking(env, space, d, { source = 'web' } = {}) {
  const sd = safeJson(space.data), name = str(d.name, 40), phone = phoneOk(d.phone), email = str(d.email, 120).toLowerCase();
  if (!name) return { error: '이름을 적어 주세요.' };
  if (!phone) return { error: '연락처를 확인해 주세요.' };
  if (email && !isEmail(email)) return { error: '이메일 형식을 확인해 주세요.' };
  const date = str(d.date, 10); if (date && !isDate(date)) return { error: '이용일을 확인해 주세요.' };
  if (source === 'web' && date && date < kstToday()) return { error: '지난 날짜는 신청할 수 없습니다.' };
  const start = timeOk(d.start), end = timeOk(d.end), people = num(d.people) > 0 ? Math.min(num(d.people), 100000) : null;
  if (source === 'web' && people && space.capacity && people > space.capacity) return { error: `이 공간은 최대 ${space.capacity}명까지 이용할 수 있습니다.` };
  const sel = d.select && typeof d.select === 'object' ? d.select : {};
  const est = estimate(sd, { mode: sel.mode, date, start, end, pkg: sel.pkg, people, options: sel.options });
  const addons = (Array.isArray(d.addons) ? d.addons : []).map(x => str(x, 20)).filter((x, i, l) => ADDON_LABEL[x] && l.indexOf(x) === i);
  const data = { purpose: PURPOSE_LABEL[d.purpose] ? d.purpose : '', message: str(d.message, 2000), select: { mode: ['hourly', 'package', 'daily'].includes(sel.mode) ? sel.mode : '', pkg: num(sel.pkg) },
    options: est.options || [], addons, addon_note: str(d.addon_note, 600), visit: !!d.visit, estimate: est.ok ? { lines: est.lines, subtotal: est.subtotal, vat: est.vat, vat_mode: est.vat_mode, total: est.total, deposit: est.deposit } : null,
    org: str(d.org, 60), agreed_at: now() };
  if (source === 'web') message(data, 'customer', data.message || '예약 가능 여부와 금액을 확인해 주세요.');
  push(data, source === 'web' ? '고객이 예약 요청을 보냈습니다' : '호스트가 예약을 직접 등록했습니다', source === 'web' ? 'customer' : 'host');
  const code = await uniqueRef(env, 'host_bookings', 'code', 'HB'), t = now();
  let status = 'new', amount = est.ok ? est.total : null, confirmed_at = null;
  if (source === 'host') {   // 전화·카톡·현장에서 받은 예약을 호스트가 직접 넣는 경우
    status = BOOKING_STATUS[d.status] ? d.status : 'confirmed'; amount = amt(d.amount) ?? amount; data.memo = str(d.memo, 2000); if (status === 'confirmed') confirmed_at = t;
  }
  await env.DB.prepare('INSERT INTO host_bookings (code, space_ref, host_id, status, source, name, phone, phone_last4, email, event_date, start_time, end_time, people, amount, paid, data, created_at, updated_at, confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)')
    .bind(code, space.ref, space.host_id, status, source, name, phone, last4(phone), email, date || null, start || null, end || null, people, amount, JSON.stringify(data), t, t, confirmed_at).run();
  for (const service of addons) {
    const ref = await uniqueRef(env, 'hq_addons', 'ref', 'AO');
    await env.DB.prepare('INSERT INTO hq_addons (ref, booking_code, space_ref, service, status, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(ref, code, space.ref, service, 'new', JSON.stringify({ name, phone, email, date, start, end, people, space_name: space.name, region: space.region, address: space.address, note: data.addon_note }), t, t).run();
  }
  if (source === 'web') await bump(env, space.ref, 'inquiry');
  await log(env, 'hostbooking.created', code, source, { space: space.ref, addons });
  return { code, status, addons };
}
export async function addonsFor(env, code) {
  const { results } = await env.DB.prepare('SELECT ref, service, status, amount, memo, updated_at FROM hq_addons WHERE booking_code = ? ORDER BY id').bind(code).all();
  return (results || []).map(a => ({ ref: a.ref, service: a.service, label: ADDON_LABEL[a.service] || a.service, status: a.status, status_label: ADDON_STATUS[a.status] || a.status, amount: a.amount }));
}

// 화면별 보기. role: host(호스트 센터) · customer(고객 조회) · hq(본사 관리자)
export function viewBooking(row, role, space) {
  const d = safeJson(row.data), paid = row.paid || 0, due = row.amount != null ? Math.max(0, row.amount - paid) : null;
  const v = { code: row.code, space: row.space_ref, status: row.status, status_label: BOOKING_STATUS[row.status] || row.status, open: BOOKING_OPEN.includes(row.status), source: row.source,
    name: row.name, phone: row.phone, email: row.email || '', org: d.org || '', date: row.event_date || '', start: row.start_time || '', end: row.end_time || '', people: row.people,
    purpose: d.purpose || '', purpose_label: PURPOSE_LABEL[d.purpose] || '', message: d.message || '', options: d.options || [], addons: d.addons || [], addon_labels: (d.addons || []).map(a => ADDON_LABEL[a] || a), addon_note: d.addon_note || '',
    visit: !!d.visit, estimate: d.estimate || null, quote: d.quote || null, amount: row.amount, paid, due, accepted_at: d.accepted_at || '', paid_notice: d.paid_notice || null, cancel: d.cancel || null,
    cancel_requested: !!d.cancel_requested, messages: d.messages || [], created_at: row.created_at, updated_at: row.updated_at || '', confirmed_at: row.confirmed_at || '' };
  if (role !== 'customer') { v.payments = d.payments || []; v.memo = d.memo || ''; v.log = d.log || []; }
  if (role === 'customer' && space) {
    // 결제 안내(계좌 등)는 호스트가 일정을 확인한 뒤(예약 대기·확정)에만 보여 줍니다
    const sd = safeJson(space.data), pay = sd.payment || {}, shown = ['pending', 'confirmed'].includes(row.status);
    v.pay_guide = shown ? { methods: pay.methods || [], bank: pay.bank || '', account: pay.account || '', holder: pay.holder || '', card_link: pay.card_link || '', deposit_pct: pay.deposit_pct ?? null, tax_invoice: !!pay.tax_invoice, note: pay.note || '',
      deposit_amount: row.amount != null && pay.deposit_pct ? Math.round(row.amount * pay.deposit_pct / 100) : null } : null;
  }
  return v;
}
async function save(env, row, data, set = {}) {
  const f = { status: row.status, amount: row.amount, event_date: row.event_date, start_time: row.start_time, end_time: row.end_time, people: row.people, name: row.name, phone: row.phone, confirmed_at: row.confirmed_at, ...set };
  const paid = paidSum(data);
  await env.DB.prepare('UPDATE host_bookings SET status = ?, amount = ?, paid = ?, event_date = ?, start_time = ?, end_time = ?, people = ?, name = ?, phone = ?, phone_last4 = ?, confirmed_at = ?, data = ?, updated_at = ? WHERE code = ?')
    .bind(f.status, f.amount, paid, f.event_date, f.start_time, f.end_time, f.people, f.name, f.phone, last4(f.phone), f.confirmed_at, JSON.stringify(data), now(), row.code).run();
}

// 호스트 처리
export async function hostAction(env, row, d) {
  const data = safeJson(row.data), a = str(d.action, 20), set = {};
  if (a === 'quote') {            // 견적 보내기
    const lines = (Array.isArray(d.lines) ? d.lines : []).map(l => ({ label: str(l && l.label, 60), desc: str(l && l.desc, 120), amount: num(l && l.amount) })).filter(l => l.label && l.amount !== null).slice(0, 20);
    if (!lines.length) return { error: '견적 항목과 금액을 한 줄 이상 적어 주세요.' };
    const total = lines.reduce((s, l) => s + l.amount, 0); if (total < 0) return { error: '견적 합계를 확인해 주세요.' };
    const days = Math.max(1, Math.min(60, num(d.valid_days) || 7));
    data.quote = { lines, total, note: str(d.note, 1000), valid_until: new Date(Date.now() + 9 * 3600e3 + days * 864e5).toISOString().slice(0, 10), sent_at: KST(), no: (data.quote ? (data.quote.no || 1) + 1 : 1) };
    set.amount = total; if (['new', 'quoted', 'pending'].includes(row.status)) set.status = 'quoted'; delete data.accepted_at;
    message(data, 'host', `견적을 보내 드렸습니다. 합계 ${total.toLocaleString('ko-KR')}원` + (data.quote.note ? '\n' + data.quote.note : '')); push(data, '견적 발송 ' + total.toLocaleString('ko-KR') + '원', 'host');
  } else if (a === 'approve') {   // 고객이 본 예상 금액 그대로 받기 → 예약 대기(결제 안내)
    if (!['new', 'quoted'].includes(row.status)) return { error: '이미 처리한 요청입니다.' };
    const total = amt(d.amount) ?? row.amount; if (total === null || total === undefined) return { error: '금액을 정해 주세요. 견적을 보내거나 금액을 직접 적을 수 있습니다.' };
    set.amount = total; set.status = 'pending'; data.accepted_at = data.accepted_at || KST();
    message(data, 'host', '일정을 확인했습니다. 아래 결제 안내를 확인해 주세요. 결제가 확인되면 예약이 확정됩니다.'); push(data, '요청 승인 · 예약 대기', 'host');
  } else if (a === 'confirm') {   // 예약 확정
    if (['done', 'cancelled', 'declined'].includes(row.status)) return { error: '끝난 예약은 확정할 수 없습니다.' };
    if (amt(d.amount) !== null) set.amount = amt(d.amount);
    set.status = 'confirmed'; set.confirmed_at = row.confirmed_at || now(); message(data, 'host', '예약이 확정되었습니다. 이용일에 뵙겠습니다.'); push(data, '예약 확정', 'host');
  } else if (a === 'decline') {
    if (!BOOKING_OPEN.includes(row.status)) return { error: '이미 끝난 요청입니다.' };
    set.status = 'declined'; data.cancel = { by: 'host', reason: str(d.reason, 300), at: KST() }; message(data, 'host', '죄송합니다. 요청하신 일정은 진행이 어렵습니다.' + (data.cancel.reason ? '\n' + data.cancel.reason : '')); push(data, '진행 불가 처리', 'host');
  } else if (a === 'cancel') {
    if (['cancelled', 'declined'].includes(row.status)) return { error: '이미 취소한 예약입니다.' };
    set.status = 'cancelled'; data.cancel = { by: 'host', reason: str(d.reason, 300), at: KST() }; delete data.cancel_requested; push(data, '예약 취소', 'host');
  } else if (a === 'done') {
    if (row.status !== 'confirmed') return { error: '확정된 예약만 이용 완료로 바꿀 수 있습니다.' };
    set.status = 'done'; push(data, '이용 완료', 'host');
  } else if (a === 'reopen') {
    if (!['cancelled', 'declined', 'done'].includes(row.status)) return { error: '진행 중인 예약입니다.' };
    set.status = row.confirmed_at ? 'confirmed' : 'new'; delete data.cancel; push(data, '다시 진행', 'host');
  } else if (a === 'payment') {   // 받은 돈 기록 (고객 → 호스트 직접 결제)
    const amount = amt(d.amount), kind = PAY_KINDS[d.kind] ? d.kind : 'full', method = PAY_METHODS[d.method] ? d.method : 'bank', date = isDate(str(d.date, 10)) ? str(d.date, 10) : kstToday();
    if (!amount) return { error: '받은 금액을 적어 주세요.' };
    if ((data.payments || []).length >= 40) return { error: '결제 기록이 너무 많습니다.' };
    (data.payments = data.payments || []).push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, amount, method, date, note: str(d.note, 200), at: KST() });
    delete data.paid_notice; push(data, `${PAY_KINDS[kind]} ${amount.toLocaleString('ko-KR')}원 기록`, 'host');
    if (d.confirm && BOOKING_OPEN.includes(row.status)) { set.status = 'confirmed'; set.confirmed_at = row.confirmed_at || now(); if (row.status !== 'confirmed') { message(data, 'host', '결제를 확인했습니다. 예약이 확정되었습니다.'); push(data, '예약 확정', 'host'); } }
  } else if (a === 'payment_remove') {
    const n = (data.payments || []).length; data.payments = (data.payments || []).filter(p => p.id !== str(d.id, 30));
    if (data.payments.length === n) return { error: '결제 기록을 찾을 수 없습니다.' }; push(data, '결제 기록 삭제', 'host');
  } else if (a === 'message') {
    const t = str(d.text, 1000); if (!t) return { error: '보낼 내용을 적어 주세요.' }; message(data, 'host', t);
  } else if (a === 'memo') { data.memo = str(d.memo, 2000);
  } else if (a === 'edit') {      // 일정·인원·금액·고객 정보 고치기
    if (d.date !== undefined) { const v = str(d.date, 10); if (v && !isDate(v)) return { error: '이용일을 확인해 주세요.' }; set.event_date = v || null; }
    if (d.start !== undefined) set.start_time = timeOk(d.start) || null;
    if (d.end !== undefined) set.end_time = timeOk(d.end) || null;
    if (d.people !== undefined) set.people = num(d.people) > 0 ? Math.min(num(d.people), 100000) : null;
    if (d.amount !== undefined) set.amount = d.amount === '' || d.amount === null ? null : amt(d.amount);
    if (d.name !== undefined) { const v = str(d.name, 40); if (!v) return { error: '이름을 적어 주세요.' }; set.name = v; }
    if (d.phone !== undefined) { const v = phoneOk(d.phone); if (!v) return { error: '연락처를 확인해 주세요.' }; set.phone = v; }
    push(data, '예약 내용 수정', 'host');
  } else return { error: '처리할 수 없는 요청입니다.' };
  await save(env, row, data, set);
  await log(env, 'hostbooking.' + a, row.code, 'host', { status: set.status || row.status });
  return { ok: true };
}

// 고객 처리 (조회 링크 또는 예약번호 + 휴대폰 뒷 4자리로 확인된 뒤)
export async function customerAction(env, row, d) {
  const data = safeJson(row.data), a = str(d.action, 20), set = {};
  if (a === 'accept') {
    if (row.status !== 'quoted' || !data.quote) return { error: '수락할 견적이 없습니다.' };
    if (data.quote.valid_until && data.quote.valid_until < kstToday()) return { error: '견적 유효기간이 지났습니다. 호스트에게 다시 요청해 주세요.' };
    set.status = 'pending'; data.accepted_at = KST(); message(data, 'customer', '견적을 수락했습니다. 결제 안내에 따라 진행하겠습니다.'); push(data, '고객이 견적 수락', 'customer');
  } else if (a === 'paid_notice') {
    if (!['pending', 'confirmed'].includes(row.status)) return { error: '결제 안내를 받은 뒤에 알릴 수 있습니다.' };
    data.paid_notice = { at: KST(), note: str(d.note, 200) }; message(data, 'customer', '입금(결제)했습니다.' + (data.paid_notice.note ? ' ' + data.paid_notice.note : '')); push(data, '고객이 입금 알림', 'customer');
  } else if (a === 'cancel') {
    if (['new', 'quoted', 'pending'].includes(row.status)) { set.status = 'cancelled'; data.cancel = { by: 'customer', reason: str(d.reason, 300), at: KST() }; push(data, '고객이 요청 취소', 'customer'); }
    else if (row.status === 'confirmed') { data.cancel_requested = true; message(data, 'customer', '예약 취소를 요청합니다.' + (d.reason ? ' ' + str(d.reason, 300) : '')); push(data, '고객이 취소 요청', 'customer'); }
    else return { error: '이미 끝난 예약입니다.' };
  } else if (a === 'message') {
    const t = str(d.text, 1000); if (!t) return { error: '보낼 내용을 적어 주세요.' };
    if (!BOOKING_OPEN.includes(row.status) && row.status !== 'done') return { error: '끝난 요청에는 메시지를 남길 수 없습니다.' };
    message(data, 'customer', t);
  } else return { error: '처리할 수 없는 요청입니다.' };
  await save(env, row, data, set);
  await log(env, 'hostbooking.customer.' + a, row.code, 'customer', {});
  return { ok: true };
}
export { PLATFORM };
