// 입점 이용료 — 금액(공간 한 곳 기준 · 부가세 별도) · 적용 기간 · 온라인 결제(페이앱) · 계좌이체 입금 확인 · 중도 해지 환불 (2026-11-12)
//  · 금액: 월 정액 × 등록 개월 수 = 공급가액, 여기에 부가세 10%를 더한 합계를 host_billing.amount 에 둡니다.
//  · 결제: 서버가 페이앱에 결제를 요청해 받은 payurl 로 이동 → 검증된 통보(/api/hostpay/feedback)만 '결제 완료'로 바꾸고 등록 기간을 늘립니다.
//    결제 키·통보 원문은 브라우저나 로그에 보내지 않습니다 (_payapp.js 를 그대로 씁니다).
//  · 중도 해지: 유료 기간이 시작되기 전이면 전액, 시작한 뒤에는 남은 기간 금액(일할)의 50%를 환불합니다 (약관 제7조의6).
//    실제 취소·송금은 운영팀이 페이앱 판매자 화면이나 계좌이체로 처리하고, 여기서는 계산과 기록만 합니다.
import { now, kstToday, str, log, randomToken } from './_lib.js';
import { PLATFORM, PLAN, BILLING_STATUS, addMonths, addDays, listedUntil, safeJson } from './_hostplat.js';
import { payappConfig, requestPayment, validFeedback, equalSecret } from './_payapp.js';
import { notifyHost } from './_hostnotify.js';

export const BILL_REF = /^BL-\d{4}-[A-Z0-9]{4}$/;
export const BILL_METHODS = { online: '온라인 결제', bank: '계좌이체' };
export const CANCEL_STATUS = { requested: '해지 신청', done: '환불 완료', withdrawn: '신청 철회' };
const PAY_STATES = ['1', '4', '8', '16', '31', '32', '9', '64', '10', '70', '71'];
const PAYURL_MINUTES = 20;   // 이 시간 안에 만든 결제창은 다시 요청하지 않고 그대로 엽니다
const changed = r => Number(r?.meta?.changes ?? r?.changes ?? 0);
const digits = v => String(v || '').replace(/\D/g, '');
const dayNo = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 864e5);
const arr = s => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const tail = no => String(no || '').slice(-6);
async function tx(env, list) { if (typeof env.DB.batch === 'function') return env.DB.batch(list); const out = []; for (const s of list) out.push(await s.run()); return out; }
function notice(text, status = 200) { return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }); }

// 공급가액 · 부가세 · 합계
export function feeOf(plan) { const supply = plan.monthly * plan.months, vat = Math.round(supply * PLATFORM.fee.vatRate / 100); return { supply, vat, total: supply + vat }; }
// 적용 기간: 지금 등록 기간(무료·유료 가운데 늦은 날)이 남아 있으면 그 다음 날부터, 끝났으면 오늘부터
export function periodFor(space, months, today = kstToday()) {
  const until = listedUntil(space), from = until && until >= today ? addDays(until, 1) : today;
  return { from, to: addDays(addMonths(from, months), -1) };
}
// 중도 해지 환불 계산. 해지 신청일(base)까지는 이용한 것으로 봅니다.
//   잔여금액 = 결제 금액 × 남은 날수 ÷ 전체 날수 (원 미만 버림) · 환불액 = 잔여금액 × 50% (10원 미만 버림)
export function refundCalc(bill, base = kstToday()) {
  const total = bill.amount, days = dayNo(bill.period_to) - dayNo(bill.period_from) + 1;
  if (base < bill.period_from) return { base, started: false, total, days, used: 0, left: days, remain: total, rate: 100, refund: total };
  const used = Math.max(0, Math.min(days, dayNo(base) - dayNo(bill.period_from) + 1)), left = days - used;
  const remain = Math.floor(total * left / days), rate = PLATFORM.fee.refundRate;
  return { base, started: true, total, days, used, left, remain, rate, refund: Math.floor(remain * rate / 100 / 10) * 10 };
}

export function payOf(env, ref) { return env.DB.prepare('SELECT * FROM host_billing_pay WHERE ref = ?').bind(ref).first(); }
// 이 기능이 생기기 전에 만든 신청에는 결제 기록 줄이 없습니다 — 계좌이체 신청으로 보고 만들어 둡니다
export async function ensurePay(env, bill, method = 'bank') {
  const d = safeJson(bill.data);
  await env.DB.prepare('INSERT OR IGNORE INTO host_billing_pay (ref, method, supply, vat, updated_at) VALUES (?,?,?,?,?)').bind(bill.ref, method, d.supply ?? bill.amount, d.vat ?? 0, now()).run();
  return payOf(env, bill.ref);
}

// 화면용 한 줄 (호스트센터 · 본사 관리자 공통)
export function billView(b, p, today = kstToday()) {
  p = p || {}; const d = safeJson(b.data), active = b.status === 'paid' && (b.period_to || '') >= today;
  const v = { ref: b.ref, space: b.space_ref, plan: b.plan, months: b.months, supply: p.supply ?? d.supply ?? b.amount, vat: p.vat ?? d.vat ?? 0, amount: b.amount,
    status: b.status, status_label: BILLING_STATUS[b.status] || b.status, method: p.method || 'bank', method_label: BILL_METHODS[p.method || 'bank'],
    pay_type: p.pay_type || '', pg_pending: p.pg_state === 'pending', period_from: b.period_from || '', period_to: b.period_to || '', created_at: b.created_at, paid_at: b.paid_at || '',
    tax_invoice: !!d.tax_invoice, active, cancel: null, refund_amount: p.refund_amount ?? null, refunded_at: p.refunded_at || '' };
  if (p.cancel_status) v.cancel = { status: p.cancel_status, status_label: CANCEL_STATUS[p.cancel_status] || p.cancel_status, base: p.cancel_base || '', calc: safeJson(p.cancel_calc), reason: p.cancel_reason || '', requested_at: p.cancel_requested_at || '' };
  // 지금 해지하면 얼마가 환불되는지 (해지 신청 화면에 미리 보여 줍니다)
  if (active && !(v.cancel && v.cancel.status === 'requested')) v.refund_preview = refundCalc(b, today);
  return v;
}

// ---------- 결제 완료 처리: 신청 → 결제 완료 + 공간의 유료 등록 기간 연장 (한 번만) ----------
export async function markPaid(env, bill, { mulNo = null, payType = '', period = null, revive = false } = {}) {
  const space = await env.DB.prepare('SELECT * FROM host_spaces WHERE ref = ?').bind(bill.space_ref).first();
  if (!space) return { ok: false, error: '공간을 찾을 수 없습니다.' };
  const plan = PLAN[bill.plan], months = plan ? plan.months : bill.months, per = period || periodFor(space, months), t = now();
  await ensurePay(env, bill);
  const from = revive ? "('requested','cancelled')" : "('requested')", open = `EXISTS (SELECT 1 FROM host_billing WHERE ref = ? AND status IN ${from})`;
  const res = await tx(env, [
    env.DB.prepare(`UPDATE host_spaces SET paid_until = ?, plan = ?, updated_at = ? WHERE ref = ? AND ${open}`).bind(per.to, bill.plan, t, bill.space_ref, bill.ref),
    env.DB.prepare(`UPDATE host_billing_pay SET mul_no = COALESCE(?, mul_no), pay_type = ?, pg_state = 'paid', payurl = NULL, updated_at = ? WHERE ref = ? AND ${open}`).bind(mulNo, str(payType, 30), t, bill.ref, bill.ref),
    env.DB.prepare(`UPDATE host_billing SET status = 'paid', period_from = ?, period_to = ?, paid_at = ? WHERE ref = ? AND status IN ${from}`).bind(per.from, per.to, t, bill.ref)
  ]);
  if (!changed(res[res.length - 1])) return { ok: false, already: true };
  await log(env, 'hostbilling.paid', bill.ref, mulNo ? 'payapp' : 'admin', { space: bill.space_ref, plan: bill.plan, from: per.from, to: per.to });
  await notifyHost(env, bill.host_id, 'billing', { result: 'paid', ref: bill.ref, space: space.name, from: per.from, to: per.to, months, amount: bill.amount }, 'paid');
  return { ok: true, period_from: per.from, period_to: per.to };
}

// ---------- 해지·환불 마무리: 결제 완료 → 해지·환불 + 공간의 유료 등록 기간을 해지 기준일까지로 줄임 (한 번만) ----------
export async function finalizeRefund(env, bill, amount, { by = 'admin', memo = '' } = {}) {
  const pay = await ensurePay(env, bill), t = now(), base = pay.cancel_base || kstToday();
  const done = await env.DB.prepare("UPDATE host_billing SET status = 'refunded' WHERE ref = ? AND status = 'paid'").bind(bill.ref).run();
  if (!changed(done)) return { ok: false, already: true };
  await env.DB.prepare("UPDATE host_billing_pay SET cancel_status = 'done', cancel_base = ?, refund_amount = ?, refunded_at = ?, refund_memo = ?, updated_at = ? WHERE ref = ?").bind(base, amount, t, str(memo, 300), t, bill.ref).run();
  // 이 기간이 그 공간의 마지막 유료 기간일 때만 줄입니다 (뒤에 이어 붙인 기간이 있으면 그대로 둡니다)
  const until = base < bill.period_from ? addDays(bill.period_from, -1) : base;
  await env.DB.prepare('UPDATE host_spaces SET paid_until = ?, updated_at = ? WHERE ref = ? AND paid_until = ?').bind(until, t, bill.space_ref, bill.period_to).run();
  await log(env, 'hostbilling.refunded', bill.ref, by, { space: bill.space_ref, amount, base });
  const space = await env.DB.prepare('SELECT name FROM host_spaces WHERE ref = ?').bind(bill.space_ref).first();
  await notifyHost(env, bill.host_id, 'billing', { result: 'refund', ref: bill.ref, space: space ? space.name : '', amount }, 'refund');
  return { ok: true, refund_amount: amount, listed_until: until };
}

// ---------- 호스트: 중도 해지 신청 · 철회 ----------
export async function requestCancel(env, bill, d) {
  if (bill.status !== 'paid') return { error: '결제가 끝난 등록 기간만 해지를 신청할 수 있습니다.' };
  const today = kstToday(); if ((bill.period_to || '') < today) return { error: '이미 끝난 등록 기간입니다.' };
  if (!d || !d.agree) return { error: '환불 기준을 확인하고 동의해 주세요.' };
  if (await env.DB.prepare("SELECT 1 AS x FROM host_billing WHERE space_ref = ? AND status = 'paid' AND period_from > ?").bind(bill.space_ref, bill.period_to).first())
    return { error: '이 기간 뒤에 이어 붙인 등록 기간이 있습니다. 나중 기간부터 해지를 신청해 주세요.' };
  const pay = await ensurePay(env, bill); if (pay.cancel_status === 'requested') return { error: '이미 해지를 신청했습니다.', code: 'EXISTS' };
  const calc = refundCalc(bill, today), t = now();
  await env.DB.prepare("UPDATE host_billing_pay SET cancel_status = 'requested', cancel_base = ?, cancel_calc = ?, cancel_reason = ?, cancel_requested_at = ?, updated_at = ? WHERE ref = ?")
    .bind(today, JSON.stringify(calc), str(d.reason, 300), t, t, bill.ref).run();
  await log(env, 'hostbilling.cancel_requested', bill.ref, 'host', { space: bill.space_ref, refund: calc.refund });
  return { ok: true, calc };
}
export async function withdrawCancel(env, bill) {
  const r = await env.DB.prepare("UPDATE host_billing_pay SET cancel_status = 'withdrawn', updated_at = ? WHERE ref = ? AND cancel_status = 'requested'").bind(now(), bill.ref).run();
  if (!changed(r)) return { error: '철회할 해지 신청이 없습니다.' };
  await log(env, 'hostbilling.cancel_withdrawn', bill.ref, 'host', {});
  return { ok: true };
}

// ---------- 온라인 결제 요청 (페이앱) ----------
export function onlinePay(env) { return payappConfig(env).live; }
export async function payRequest(env, origin, host, bill, space) {
  const C = payappConfig(env);
  if (!C.live) return { error: '온라인 결제를 준비하고 있습니다. 계좌이체로 신청하거나 운영팀에 문의해 주세요.', status: 503, code: 'PAYMENT_UNAVAILABLE' };
  if (bill.status !== 'requested') return { error: '결제할 수 있는 신청이 아닙니다.', status: 409, code: 'NOT_PAYABLE' };
  if (!(bill.amount >= 1000)) return { error: '결제 금액을 확인해 주세요.', status: 400, code: 'BAD_AMOUNT' };
  const phone = digits(host.phone); if (phone.length < 9 || phone.length > 11) return { error: '계정에 등록한 휴대폰 번호를 확인해 주세요.', status: 400, code: 'BAD_PHONE' };
  let pay = await ensurePay(env, bill, 'online');
  if (pay.payurl && pay.requested_at && Date.parse(pay.requested_at.replace(' ', 'T') + 'Z') > Date.now() - PAYURL_MINUTES * 60e3) return { ok: true, payurl: pay.payurl };
  if (!pay.nonce) { await env.DB.prepare('UPDATE host_billing_pay SET nonce = ? WHERE ref = ? AND nonce IS NULL').bind(randomToken(), bill.ref).run(); pay = await payOf(env, bill.ref); }
  let r;
  try {
    r = await requestPayment(C, { goodname: `메가스팟 입점 이용료 ${bill.months}개월 · ${space.name}`.slice(0, 100), price: String(bill.amount), recvphone: phone, recvemail: host.email || '',
      reqaddr: '0', smsuse: 'n', checkretry: 'y', skip_cstpage: 'y', feedbackurl: origin + '/api/hostpay/feedback', returnurl: origin + '/api/hostpay/return?ref=' + bill.ref, var1: bill.ref, var2: pay.nonce });
  } catch { return { error: '결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.', status: 502, code: 'PAYAPP_UNAVAILABLE' }; }
  if (!r.ok) { await log(env, 'hostbilling.pay_rejected', bill.ref, 'payapp', { code: String(r.code).replace(/[^0-9A-Z_]/gi, '').slice(0, 40) }); return { error: '결제 요청이 거절되었습니다. 잠시 후 다시 시도하거나 운영팀에 문의해 주세요.', status: 502, code: 'PAYAPP_REJECTED' }; }
  const reqs = [...new Set([...arr(pay.reqs), r.mulNo])].slice(-10), t = now();
  await env.DB.prepare("UPDATE host_billing_pay SET method = 'online', reqs = ?, payurl = ?, requested_at = ?, updated_at = ? WHERE ref = ?").bind(JSON.stringify(reqs), r.payurl, t, t, bill.ref).run();
  return { ok: true, payurl: r.payurl };
}

// ---------- 페이앱 통보 (/api/hostpay/feedback) — 서명·주문별 확인값·금액·거래번호를 모두 확인한 통보만 반영 ----------
async function alert(env, bill, text) {
  await env.DB.prepare('UPDATE host_billing_pay SET alert = ?, updated_at = ? WHERE ref = ?').bind(str(text, 200), now(), bill.ref).run();
  await log(env, 'hostbilling.alert', bill.ref, 'payapp', text);
}
export async function billingFeedback(request, env) {
  const raw = await request.text(); if (raw.length > 32768) return notice('FAIL', 413);
  const f = Object.fromEntries(new URLSearchParams(raw));
  if (!await validFeedback(payappConfig(env), f)) return notice('FAIL', 403);
  const state = f.pay_state, partial = ['70', '71'].includes(state);
  if (!PAY_STATES.includes(state) || !/^\d{1,30}$/.test(f.mul_no || '') || !BILL_REF.test(f.var1 || '')) return notice('FAIL', 400);
  const bill = await env.DB.prepare('SELECT * FROM host_billing WHERE ref = ?').bind(f.var1).first(), pay = bill ? await payOf(env, bill.ref) : null;
  if (!bill || !pay || !pay.nonce || !equalSecret(f.var2, pay.nonce)) return notice('FAIL', 403);
  const price = partial ? f.orig_price : f.price, origNo = partial ? f.orig_mul_no : f.mul_no;
  if (!/^\d+$/.test(price || '') || Number(price) !== bill.amount || !/^\d{1,30}$/.test(origNo || '')) return notice('FAIL', 400);
  const reqs = arr(pay.reqs);
  // 우리가 요청해 받은 거래번호만 받습니다 (결제 요청 응답을 받지 못한 채 통보가 먼저 온 첫 거래는 예외)
  if (!(pay.mul_no === origNo || reqs.includes(origNo) || (!pay.mul_no && !reqs.length))) return notice('FAIL', 400);
  const t = now();
  if (state === '4') {
    if (bill.status === 'paid' && pay.mul_no === origNo) return notice('SUCCESS');   // 같은 통보가 다시 온 경우
    if (!['requested', 'cancelled'].includes(bill.status)) { await alert(env, bill, `같은 신청에 결제가 한 번 더 들어왔습니다 (거래번호 끝 ${tail(origNo)}). 페이앱에서 확인해 주세요.`); return notice('SUCCESS'); }
    // 호스트가 신청을 취소한 뒤에 열어 둔 결제창으로 결제한 경우에도, 낸 금액만큼 등록 기간을 적용합니다
    const r = await markPaid(env, bill, { mulNo: origNo, payType: 'PayApp:' + str(f.pay_type, 10), revive: true });
    if (!r.ok && !r.already) return notice('FAIL', 500);
  } else if (['9', '64'].includes(state)) {          // 전액 취소
    if (pay.mul_no !== origNo) return notice('SUCCESS');
    await env.DB.prepare('UPDATE host_billing_pay SET pg_refunded = ?, updated_at = ? WHERE ref = ?').bind(bill.amount, t, bill.ref).run();
    if (bill.status === 'paid') await finalizeRefund(env, bill, bill.amount, { by: 'payapp', memo: '페이앱 전액 취소' });
  } else if (partial) {                                // 부분 취소
    const amount = Number(f.price);
    if (!/^\d+$/.test(f.price || '') || amount <= 0 || amount > bill.amount || f.mul_no === origNo || pay.mul_no !== origNo) return notice('FAIL', 400);
    const nos = arr(pay.refund_nos); if (nos.includes(f.mul_no)) return notice('SUCCESS');
    const total = Math.min(bill.amount, (pay.pg_refunded || 0) + amount);
    await env.DB.prepare('UPDATE host_billing_pay SET pg_refunded = ?, refund_nos = ?, updated_at = ? WHERE ref = ?').bind(total, JSON.stringify([...nos, f.mul_no].slice(-20)), t, bill.ref).run();
    if (bill.status === 'paid') {
      if (pay.cancel_status === 'requested') { if (total >= (safeJson(pay.cancel_calc).refund || 0)) await finalizeRefund(env, bill, total, { by: 'payapp', memo: '페이앱 부분 취소' }); }
      else await alert(env, bill, `해지 신청 없이 페이앱에서 ${amount.toLocaleString('ko-KR')}원이 부분 취소되었습니다. 등록 기간을 확인해 주세요.`);
    }
  } else if (['8', '16', '31', '32'].includes(state)) {   // 결제 요청 취소 → 다시 결제할 수 있게 결제창 주소를 지웁니다
    if (bill.status === 'requested') await env.DB.prepare('UPDATE host_billing_pay SET payurl = NULL, pg_state = NULL, reqs = ?, updated_at = ? WHERE ref = ?').bind(JSON.stringify(reqs.filter(x => x !== origNo)), t, bill.ref).run();
  } else if (state === '10') {                         // 입금 대기 (가상계좌 등)
    if (bill.status === 'requested') await env.DB.prepare("UPDATE host_billing_pay SET pg_state = 'pending', updated_at = ? WHERE ref = ?").bind(t, bill.ref).run();
  }
  return notice('SUCCESS');
}
export { notice as feedbackNotice };
