// 관리자 '수납 관리' (2026-11-26) — 이용일이 다가오는데 이용료를 다 받지 못한 예약을 챙깁니다.
//  · 사전고지: 이용일 20~16일 전, 남은 이용료가 있는 예약 → 잔금 기한을 미리 알립니다
//  · 완납 확인: 이용일 15일 전 ~ 당일, 남은 이용료가 있는 예약 → 결제를 요청하고 입금을 확인합니다
//  · 이용 후 미수: 이용일이 지났는데 남은 이용료가 있는 예약 (최근 60일)
//  · 예외: 현장 결제·당일 결제·결제 일정 별도 협의 → 담당자가 '예외'로 표시하고 비고를 남기면 독촉 목록에서 빠집니다
// 받은 금액·남은 금액은 기존 정산 계산(settlementsFor)을 그대로 읽고, 납부 기한은 기존 잔금 기한(기본 이용일 15일 전)을 씁니다.
// 예약·문의·수납 원장은 읽기만 합니다. 이 화면이 쓰는 곳은 새 표 두 개(booking_collection_marks · booking_collection_logs)뿐이고,
// 입금 기록은 기존 '이용료 수납·정산' 창에서 합니다. 수납 장부(2026-11-28)의 받은 금액은 참고로 함께 보여 줍니다.
import { json, err, readJson, str, now, kstToday, SPACES, log } from './_lib.js';
import { settlementsFor } from './_settlement.js';
import { defaultBalanceDue, shiftDay } from './_booking_payment_schedule.js';
import { refundBooking, initialDepositAmount } from './_deposit_refunds.js';
import { RENTAL_BANK, bankCopy } from './_business.js';
import { ledgerSummaries } from './_ledger.js';   // 수납 장부 (2026-11-28) — 장부 기준 받은 금액을 함께 보여 줍니다

export const RULES = { notice_from: 20, notice_to: 16, due_days: 15, past_days: 60 };
export const EXCEPTION_TYPES = { onsite: '현장 결제', sameday: '당일 결제', schedule: '결제 일정 별도 협의', other: '기타' };
export const LOG_KINDS = { notice: '사전고지', request: '결제 요청', check: '입금 확인', memo: '메모', exception: '예외 변경' };
export const CHANNELS = { kakao: '카카오톡', sms: '문자', phone: '전화', email: '이메일', alimtalk: '알림톡', other: '기타' };
const CODE = /^[A-Z0-9][A-Z0-9-]{3,40}$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const dday = (date, today) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);

// 이용일 기준 묶음. 예외·완납·금액 미정은 기간과 상관없이 따로 묶습니다.
export function bucketOf({ d, balance, amount, exception }) {
  if (exception) return 'exception';
  if (amount == null) return d <= RULES.notice_from ? 'unpriced' : 'later';
  if (!(balance > 0)) return 'paid';
  if (d < 0) return 'past';
  if (d <= RULES.due_days) return 'due';
  if (d <= RULES.notice_from) return 'notice';
  return 'later';
}

async function inList(env, sql, codes) {
  if (!codes.length) return [];
  const out = [];
  for (let i = 0; i < codes.length; i += 90) {
    const part = codes.slice(i, i + 90);
    const { results } = await env.DB.prepare(sql.replace('(?)', '(' + part.map(() => '?').join(',') + ')')).bind(...part).all();
    out.push(...(results || []));
  }
  return out;
}

export async function collectionList(env, { today = kstToday() } = {}) {
  const from = shiftDay(today, -RULES.past_days), to = shiftDay(today, 45), spaces = Object.keys(SPACES);
  const { results } = await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.inquiry_ref, b.customer_name, b.phone, b.date, b.start_h, b.end_h, b.headcount, b.status, b.created_at,
      CASE WHEN json_valid(i.data) THEN json_extract(i.data, '$.org') END AS org
    FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref
    WHERE b.space_id IN (${spaces.map(() => '?').join(',')}) AND b.date BETWEEN ? AND ?
      AND (b.status = 'confirmed' OR (b.status = 'completed' AND b.date < ?))
    ORDER BY b.date, b.start_h, b.id`).bind(...spaces, from, to, today).all();
  const rows = results || [], codes = rows.map(r => r.booking_code);
  const [settle, sched, state, marks, logs, notes] = await Promise.all([
    settlementsFor(env, codes),
    inList(env, 'SELECT booking_code, due_date FROM booking_payment_schedule WHERE booking_code IN (?)', codes),
    inList(env, 'SELECT booking_code, confirmed_at FROM booking_journey_state WHERE booking_code IN (?)', codes),
    inList(env, 'SELECT * FROM booking_collection_marks WHERE booking_code IN (?)', codes),
    inList(env, 'SELECT * FROM booking_collection_logs WHERE booking_code IN (?) ORDER BY id DESC', codes),
    inList(env, "SELECT booking_code, status, occurred_at, updated_at, id FROM transaction_notifications WHERE kind = 'balance_reminder' AND audience = 'customer' AND booking_code IN (?) ORDER BY id DESC", codes)
  ]);
  const by = (list, key = 'booking_code') => { const m = {}; for (const r of list) if (!m[r[key]]) m[r[key]] = r; return m; };
  const ledger = await ledgerSummaries(env, codes, settle);
  const S = by(sched), J = by(state), K = by(marks), N = by(notes), L = {};
  for (const r of logs) (L[r.booking_code] = L[r.booking_code] || []).push(r);
  const items = [];
  for (const b of rows) {
    const s = settle[b.booking_code] || {}, mark = K[b.booking_code], d = dday(b.date, today);
    const due = S[b.booking_code]?.due_date || defaultBalanceDue({ ...b, confirmed_at: J[b.booking_code]?.confirmed_at || null });
    const amount = s.amount ?? null, balance = amount == null ? null : s.balance;
    const bucket = bucketOf({ d, balance, amount, exception: !!(mark && mark.exception) });
    if (bucket === 'later' || (bucket === 'paid' && (d < 0 || d > RULES.notice_from))) continue;   // 21일 넘게 남은 예약, 이미 끝났거나 아직 먼 완납 예약은 빼 둡니다
    let deposit = null;
    try { const r = await refundBooking(env, b.booking_code); if (r) deposit = { amount: r.deposit_amount ?? initialDepositAmount(r), paid: !!r.deposit_paid, method: r.deposit_method || '' }; } catch {}
    const history = (L[b.booking_code] || []).slice(0, 20).map(x => ({ id: x.id, kind: x.kind, kind_label: LOG_KINDS[x.kind] || x.kind, channel: x.channel, channel_label: CHANNELS[x.channel] || '', memo: x.memo, balance: x.balance, at: x.created_at }));
    const last = k => history.find(x => x.kind === k) || null;
    items.push({
      code: b.booking_code, inquiry_ref: b.inquiry_ref || '', name: b.customer_name, org: b.org || '', phone: b.phone, space_id: b.space_id, space: SPACES[b.space_id],
      date: b.date, start_h: b.start_h, end_h: b.end_h, headcount: b.headcount, status: b.status, d,
      amount, received: amount == null ? null : (s.net ?? null), balance, due_date: due, due_custom: !!S[b.booking_code]?.due_date,
      overdue: bucket === 'due' && today > due, due_today: bucket === 'due' && today === due,
      bucket, exception: mark && mark.exception ? { type: mark.exception_type, type_label: EXCEPTION_TYPES[mark.exception_type] || '예외', note: mark.note, at: mark.updated_at } : null,
      note: mark ? mark.note : '', deposit, auto_reminder: N[b.booking_code] ? { status: N[b.booking_code].status, at: N[b.booking_code].updated_at || N[b.booking_code].occurred_at } : null,
      last_notice: last('notice'), last_request: last('request'), history,
      ledger: (({ entries, billed, received, balance, status, status_label, sync, unrecorded }) => ({ entries, billed, received, balance, status, status_label, sync, unrecorded }))(ledger[b.booking_code])
    });
  }
  const counts = {};
  for (const x of items) counts[x.bucket] = (counts[x.bucket] || 0) + 1;
  counts.overdue = items.filter(x => x.overdue).length;
  counts.notice_todo = items.filter(x => x.bucket === 'notice' && !x.last_notice && !(x.auto_reminder && ['accepted', 'delivered', 'sending'].includes(x.auto_reminder.status))).length;
  counts.todo = (counts.due || 0) + counts.notice_todo + (counts.past || 0) + (counts.unpriced || 0);
  const sum = k => items.filter(x => x.bucket === k).reduce((a, x) => a + (x.balance || 0), 0);
  return { today, rules: RULES, counts, totals: { notice: sum('notice'), due: sum('due'), past: sum('past') }, items,
    options: { exception_types: EXCEPTION_TYPES, log_kinds: LOG_KINDS, channels: CHANNELS }, bank: bankCopy(RENTAL_BANK) };
}

export async function collectionsAdmin({ request, env, path, method }) {
  if (path === 'collections' && method === 'GET') return json({ ok: true, ...(await collectionList(env)) });
  const m = path.match(/^collections\/([A-Za-z0-9-]+)\/(exception|logs)$/);
  if (!m || method !== 'POST') return null;
  const code = m[1].toUpperCase(); if (!CODE.test(code)) return err('예약번호를 확인해 주세요.');
  const b = await env.DB.prepare('SELECT booking_code, status FROM bookings WHERE booking_code = ?').bind(code).first();
  if (!b) return err('예약을 찾지 못했습니다.', 404, 'NOT_FOUND');
  let d; try { d = await readJson(request, 4096); } catch (e) { return err(e.message); }
  const t = now(), balance = Number.isSafeInteger(d.balance) ? d.balance : null;
  if (m[2] === 'exception') {
    const on = d.exception === true, type = has(EXCEPTION_TYPES, d.type) ? d.type : (on ? 'other' : ''), note = str(d.note, 300);
    if (on && !note && type === 'other') return err("'기타' 예외는 비고에 내용을 적어 주세요.");
    await env.DB.prepare(`INSERT INTO booking_collection_marks (booking_code, exception, exception_type, note, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(booking_code) DO UPDATE SET exception = excluded.exception, exception_type = excluded.exception_type, note = excluded.note, updated_at = excluded.updated_at`).bind(code, on ? 1 : 0, on ? type : '', note, t).run();
    await env.DB.prepare('INSERT INTO booking_collection_logs (booking_code, kind, channel, memo, balance, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(code, 'exception', '', (on ? '예외 표시 · ' + EXCEPTION_TYPES[type] : '예외 해제') + (note ? ' · ' + note : ''), balance, t).run();
    await log(env, 'collection.exception', code, 'admin', { exception: on, type, note });
    return json({ ok: true });
  }
  const kind = has(LOG_KINDS, d.kind) && d.kind !== 'exception' ? d.kind : '', channel = has(CHANNELS, d.channel) ? d.channel : '', memo = str(d.memo, 300);
  if (!kind) return err('기록 종류를 골라 주세요.');
  if (kind === 'memo' && !memo) return err('메모 내용을 적어 주세요.');
  await env.DB.prepare('INSERT INTO booking_collection_logs (booking_code, kind, channel, memo, balance, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(code, kind, channel, memo, balance, t).run();
  if (kind !== 'memo') await log(env, 'collection.' + kind, code, 'admin', { channel, memo });
  return json({ ok: true });
}
