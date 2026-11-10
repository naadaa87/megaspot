import {preserveLegacyPayments} from '../_settlement.js';
import {recordPayappRefund} from '../_payapp_refunds.js';
// 페이앱: 서버에서 결제 요청 → payurl 이동 → 검증된 feedback만 주문·예약 확정.
import { json, err, hasDb, readJson, str, num, isDate, now, log, sha256, sameOrigin, clientIp, getMember, kstToday, tooMany, hit, randomToken, requireAdmin,SPACES } from '../_lib.js';
import { PRODUCTS, HOLIDAYS, PRICING } from '../_catalog.js';

import { payappConfig, requestPayment, validFeedback, equalSecret } from '../_payapp.js';
import { confirmedGuide } from '../_guide_messages.js';
import { bookingAvailableSql } from '../_booking_availability.js';
import {noPendingWaitSql} from '../_reservation_waitlist.js';
const PKG_SLOT = { day: 'pkg-day', allday: 'pkg-allday', allnight: 'pkg-allnight' };
const PKG_LABEL = { day: '낮 패키지 10–17시', allday: '올데이 패키지 10–24시', allnight: '올나잇 패키지 18시–다음 날 07시' };
const PKG_HOURS = { 'pkg-day': [10, 17], 'pkg-allday': [10, 24], 'pkg-allnight': [18, 31] };
const PASS_AVAILABLE_SQL = bookingAvailableSql({space:"'megaspot-gundae'",date:'span.date',start:'span.start_h',end:'span.end_h',exclude:'span.exclude_code'});
const digits = v => String(v || '').replace(/\D/g, '');
const sqlText = v => "'" + String(v).replace(/'/g, "''") + "'";
function matchesPass(booking, row, slot) {
  const hours = PKG_HOURS[slot];
  return !!(booking && hours && booking.status === 'confirmed' && booking.space_id === 'megaspot-gundae'
    && booking.date === row.event_date && booking.start_h === hours[0] && booking.end_h === hours[1]
    && booking.headcount === row.people && digits(booking.phone) === digits(row.buyer_phone));
}
async function passSlotAvailable(env, date, slot, exclude = '') {
  const hours = PKG_HOURS[slot];
  const occupancy = await env.DB.prepare(`SELECT ${PASS_AVAILABLE_SQL} AS available FROM (SELECT ? AS date,? AS start_h,? AS end_h,? AS exclude_code) span`)
    .bind(date,hours[0],hours[1],exclude).first();
  return !!occupancy?.available;
}
async function passAvailabilitySummary(env, date, product) {
  const [start,end] = PKG_HOURS[PKG_SLOT[product.pkg]];
  // Read the payment guard and slot together, including during confirmation.
  const noPending = noPendingWaitSql({date:'span.date',space:"'megaspot-gundae'"});
  const row = await env.DB.prepare(`SELECT ${PASS_AVAILABLE_SQL} AS available, NOT ${noPending} AS payment_blocked
    FROM (SELECT ? AS date, ? AS start_h, ? AS end_h, '' AS exclude_code) span`).bind(date,start,end).first();
  return {payment_blocked:!!row.payment_blocked,product_id:product.id,slot_blocked:!row.available};
}
async function paymentBlocked(env,date,space){
  const noPending=noPendingWaitSql({date:'?',space:'?'});
  const row=await env.DB.prepare(`SELECT NOT ${noPending} AS blocked`).bind(date,space).first();
  return !!row.blocked;
}
function retrySelection(row, data) {
  if (row.status !== 'failed' || !PRODUCTS.get(row.product_id)) return null;
  const addons = {};
  for (const product of PRODUCTS.items.filter(x => x.kind === 'addon')) {
    const value = data.addons?.[product.opt];
    if (product.opt === 'manager' && value && typeof value === 'object') {
      if (Number.isSafeInteger(value.count) && value.count >= 1 && value.count <= 10 && Number.isSafeInteger(value.hours) && value.hours >= 1 && value.hours <= 24)
        addons.manager = {count:value.count,hours:value.hours};
    } else if (product.opt === 'disposable' && value && typeof value === 'object') {
      if (Number.isSafeInteger(value.people) && value.people >= 1 && value.people <= PRODUCTS.people.max) addons.disposable = {people:value.people};
    } else if (Number.isSafeInteger(value) && value >= 1 && value <= 10) {
      if (product.opt === 'manager') addons.manager = {count:value,hours:4};
      else if (product.opt === 'disposable') addons.disposable = {people:value*20};
      else addons[product.opt] = value;
    }
  }
  return {product_id:row.product_id,date:row.event_date || '',people:row.people,qty:Math.max(1,Math.min(10,num(data.qty)||1)),addons};
}

// 요일 구분 — pricing-engine.js 의 dayInfo 와 같은 규칙 (당일·다음 날이 쉬는 날인지로 월–목/금/토/일)
function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return dt.toISOString().slice(0, 10); }
function isOff(iso) { const [y, m, d] = iso.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return dow === 0 || dow === 6 || !!HOLIDAYS[iso]; }
export function dayCol(iso) { const off = isOff(iso), next = isOff(addDays(iso, 1)); return !off ? (next ? 'fri' : 'wd') : (next ? 'sat' : 'sun'); }
const COL_LABEL = { wd: '월–목', fri: '금요일', sat: '토요일', sun: '일요일' };
// 성수기(요금편성표 2026-10-17): 이용권 고정 금액과 달라 온라인 이용권으로는 결제하지 않고 예약 신청으로 안내합니다. 기간은 pricing-gundae.js 의 peak 에서 읽습니다.
export function peakOf(iso) {
  const pk = PRICING && PRICING.peak; if (!pk) return null;
  let id = pk.dates && pk.dates[iso];
  if (!id && pk.months) { const m = pk.months[iso.slice(0, 7)]; if (m) { const [y, mo, d] = iso.split('-').map(Number); const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); id = m[dow === 0 ? 'sun' : dow === 6 ? 'sat' : dow === 5 ? 'fri' : 'wd']; } }
  const t = id && pk.types[id]; return t ? { id, ...t } : null;
}
function kdate(iso) { const [y, m, d] = iso.split('-').map(Number); const dow = '일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; return `${y}년 ${m}월 ${d}일(${dow})`; }
function makeOid() { const d = new Date(Date.now() + 9 * 3600e3).toISOString().replace(/[-:T]/g, '').slice(0, 14); const r = crypto.getRandomValues(new Uint8Array(3)); return 'MS' + d + [...r].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
// ---------- 주문 금액 계산 (서버가 다시 계산해 금액 위변조를 막습니다) ----------
export function buildOrder(input) {
  const P = PRODUCTS, p = P.get(str(input.product_id, 40));
  if (!p) return { error: '상품을 찾을 수 없습니다.' };
  const lines = [], today = kstToday();
  let event_date = null, people = null, title = p.name, slot = null;
  if (p.kind === 'verification') {
    // 운영 확인용은 입력값과 무관하게 1건 1,000원. 예약·옵션·문의 연결을 받지 않습니다.
    lines.push({ id: p.id, label: p.name, desc: '실제 결제 · 확인 후 전액 취소', qty: 1, amount: p.price });
  } else if (p.kind === 'pass') {
    event_date = str(input.date, 10);
    if (!isDate(event_date)) return { error: '이용일을 선택해 주세요.' };
    if (event_date < today) return { error: '지난 날짜는 선택할 수 없습니다.' };
    if (Date.parse(event_date + 'T00:00:00+09:00') + p.start * 36e5 <= Date.now())
      return { error: '이미 시작한 패키지는 온라인으로 구매할 수 없습니다. 다른 날짜를 고르거나 운영팀에 이용 시간을 문의해 주세요.', code: 'PACKAGE_STARTED' };
    const pk = peakOf(event_date);
    if (pk) return { error: `${kdate(event_date)}은(는) 성수기 요금(${pk.label} 기준${pk.people > P.people.base ? ' · 기준 ' + pk.people + '명 포함' : ''})이 적용되는 날이라 이용권으로 결제할 수 없습니다. '예약 신청 · 금액 확인'에서 그날 금액을 확인하고 신청해 주시면 결제 방법을 안내해 드립니다.`, code: 'PEAK', peak: pk.id };
    const col = dayCol(event_date), g = P.dayGroups[p.group];
    if (!g.cols.includes(col)) return { error: `${kdate(event_date)}은(는) ${COL_LABEL[col]} 요금이 적용되는 날이라 이 이용권(${g.label})으로 결제할 수 없습니다. 같은 패키지의 ${COL_LABEL[col]} 이용권을 골라 주세요.`, code: 'DAY_MISMATCH', col };
    people = input.people == null || input.people === '' ? P.people.base : Number(input.people);
    if (!Number.isSafeInteger(people) || people < 1 || people > P.people.max) return { error: `인원은 1~${P.people.max}명 사이의 정수로 입력해 주세요.` };
    lines.push({ id: p.id, label: p.name, desc: `${PKG_LABEL[p.pkg]} · ${p.hours}시간 · 기준 ${P.people.base}명`, qty: 1, amount: p.price });
    const extra = Math.max(0, people - P.people.base);
    if (extra) lines.push({ id: 'people', label: '인원 추가', desc: `${extra}명 × ${P.people.extra.toLocaleString('ko-KR')}원`, qty: extra, amount: extra * P.people.extra });
    slot = PKG_SLOT[p.pkg];
    const add = input.addons && typeof input.addons === 'object' ? input.addons : {};
    for (const a of P.items.filter(x => x.kind === 'addon')) {
      const v = add[a.opt]; if (!v) continue;
      const rate = PRICING.options.find(x => x.id === a.opt);
      if (a.opt === 'manager' && typeof v === 'object') {
        const count = Number(v.count), hours = Number(v.hours);
        if (!Number.isSafeInteger(count) || count < 1 || count > 10 || !Number.isSafeInteger(hours) || hours < 1 || hours > 24)
          return { error: '매니저는 1~10명, 1~24시간 사이의 정수로 입력해 주세요.', code: 'BAD_OPTIONS' };
        lines.push({ id: a.id, label: rate.label, desc: `${count}명 × ${hours}시간 × ${rate.price.toLocaleString('ko-KR')}원`, qty: count * hours, amount: rate.price * count * hours });
      } else if (a.opt === 'disposable' && typeof v === 'object') {
        const count = Number(v.people);
        if (!Number.isSafeInteger(count) || count < 1 || count > P.people.max)
          return { error: `1회용 세트는 1~${P.people.max}명 사이의 정수로 입력해 주세요.`, code: 'BAD_OPTIONS' };
        lines.push({ id: a.id, label: rate.label, desc: `${count}명 × ${rate.price.toLocaleString('ko-KR')}원`, qty: count, amount: rate.price * count });
      } else {
        if (typeof v === 'object') return { error: '옵션 수량을 확인해 주세요.', code: 'BAD_OPTIONS' };
        const qty = Number(v);
        if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10) return {error:'옵션 수량은 1~10 사이의 정수로 입력해 주세요.',code:'BAD_OPTIONS'};
        lines.push({ id: a.id, label: a.name, desc: `${a.unit} × ${qty}`, qty, amount: a.price * qty });
      }
    }
  } else {
    const qty = input.qty == null || input.qty === '' ? 1 : Number(input.qty);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10) return {error:'수량은 1~10 사이의 정수로 입력해 주세요.',code:'BAD_OPTIONS'};
    lines.push({ id: p.id, label: p.name, desc: `${p.unit} × ${qty}`, qty, amount: p.price * qty });
    event_date = str(input.date, 10);
    if (!isDate(event_date)) return {error:'옵션을 제공받을 이용일을 선택해 주세요.',code:'DATE_REQUIRED'};
    if (event_date < today) return {error:'지난 날짜에는 옵션을 신청할 수 없습니다.',code:'PAST_DATE'};
    if (qty > 1) title = `${p.name} × ${qty}`;
  }
  if (lines.some(line => ['addon-banner','addon-xbanner'].includes(line.id)) && event_date < addDays(today, 5))
    return {error:'현수막·X배너는 제작 기간이 필요해 이용일 5일 전까지 결제할 수 있습니다. 가까운 일정은 운영팀에 제작 가능 여부를 문의해 주세요.',code:'PRODUCTION_DEADLINE'};
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { product: p, lines, total, event_date, people, slot, title };
}

export async function onRequest({ request, env, params, waitUntil }) {
  const path = (params.path || []).join('/');
  const method = request.method.toUpperCase();
  const C = payappConfig(env);
  if (path === 'config' && method === 'GET') return json({ ok: true, provider: 'payapp', enabled: hasDb(env) && C.live, configured: C.configured, test: false });

  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  try {
    if(path==='availability'&&method==='GET'){
      const q=new URL(request.url).searchParams,date=q.get('date')||'',space=q.get('space')||'megaspot-gundae';
      if(!isDate(date)||date<kstToday()||!Object.hasOwn(SPACES,space))return err('공간과 이용일을 확인해 주세요.',400,'INVALID_DATE');
      let product;
      if(q.has('product_id')){
        product=PRODUCTS.get(q.get('product_id'));
        if(space!=='megaspot-gundae'||product?.kind!=='pass'||!Object.hasOwn(PKG_SLOT,product.pkg))return err('확인할 공간 이용권을 선택해 주세요.',400,'INVALID_PRODUCT');
      }
      const summary=product?await passAvailabilitySummary(env,date,product):{payment_blocked:await paymentBlocked(env,date,space)};
      return json({ok:true,date,space,...summary,code:summary.payment_blocked?'RESERVATION_PENDING':null},200,{'cache-control':'no-store'});
    }
    if (path === 'diagnostics' && method === 'GET') {
      const denied = await requireAdmin(request, env); if (denied) return denied;
      try {
        const r = await fetch('https://api.payapp.kr/oapi/v2', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'cmd=invalid_diagnostic', redirect: 'manual', signal: AbortSignal.timeout(20000) });
        const body = await r.text(), q = new URLSearchParams(body);
        return json({ ok: true, http_status: r.status, content_type: r.headers.get('content-type'), response_format: q.has('state') ? 'query' : (/^\s*</.test(body) ? 'html' : 'other'), provider_code: q.get('errno'), abort_timeout_supported: typeof AbortSignal.timeout === 'function' });
      } catch (e) { return json({ ok: false, diagnostic_error: String(e?.message || '').slice(0, 180), error_name: e?.name, abort_timeout_supported: typeof AbortSignal.timeout === 'function' }); }
    }
    if (path === 'feedback' && method === 'POST') return await feedback(request, env, C, waitUntil);
    // return은 화면 이동 전용이며 결제 상태는 절대 바꾸지 않습니다.
    if (path === 'return' && ['GET', 'POST'].includes(method)) {
      const oid = new URL(request.url).searchParams.get('oid') || '';
      if (!/^MS[0-9A-F]{20}$/.test(oid)) return err('주문번호를 확인해 주세요.');
      return Response.redirect(new URL('/order/complete/?oid=' + oid, request.url).href, 303);
    }
    // ---- 주문 생성 ----
    if (path === 'prepare' && method === 'POST') {
      if (!C.live) return err('온라인 결제를 준비 중입니다. 카카오톡으로 문의해 주세요.', 503, 'PAYMENT_UNAVAILABLE');
      if (!sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN');
      const ip = clientIp(request);
      if (await tooMany(env, 'pay:' + ip, 30, 10)) return err('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429, 'RATE_LIMIT');
      await hit(env, 'pay:' + ip, 10);
      const d = await readJson(request);
      const b = d.buyer || {};
      const name = str(b.name, 40), phone = str(b.phone, 30).replace(/[^0-9]/g, ''), email = str(b.email, 120);
      if (!name) return err('예약자 이름을 적어 주세요.');
      if (phone.length < 9 || phone.length > 11) return err('휴대폰 번호를 확인해 주세요.');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('이메일 주소를 확인해 주세요.');
      if (!d.agree_terms || !d.agree_privacy || !d.agree_refund) return err('이용약관·개인정보·환불 기준에 동의해 주세요.');
      const o = buildOrder(d); if (o.error) return err(o.error, 400, o.code || 'BAD_ORDER');
      if (o.total < 1000) return err('결제 금액은 1,000원 이상이어야 합니다.');
      let member = null; try { member = await getMember(request, env); } catch {}
      const oid = makeOid(), t = now();
      let retry = null;
      if (d.retry_oid) {
        const retryId = str(d.retry_oid, 40);
        retry = /^[A-Z0-9-]{1,40}$/.test(retryId) ? await env.DB.prepare('SELECT status,buyer_phone,inquiry_ref FROM orders WHERE oid=?').bind(retryId).first() : null;
        if (!retry || retry.status !== 'failed' || digits(retry.buyer_phone) !== phone)
          return err('실패한 주문의 원래 휴대폰 번호로 다시 결제해 주세요. 완료되거나 처리 중인 주문은 다시 결제할 수 없습니다.',409,'RETRY_NOT_ALLOWED');
      }
      // 접수번호는 같은 연락처(끝 4자리)로 들어온 문의일 때만 연결합니다(남의 문의를 결제로 바꾸지 못하게)
      let inquiryRef = str(o.product.kind === 'verification' ? '' : (d.inquiry_ref || retry?.inquiry_ref), 20).toUpperCase().replace(/[^0-9A-Z-]/g, '');
      if (inquiryRef) {
        const iq = await env.DB.prepare('SELECT phone, data FROM inquiries WHERE ref = ?').bind(inquiryRef).first();
        const same = iq && String(iq.phone || '').replace(/\D/g, '').slice(-4) === phone.replace(/\D/g, '').slice(-4);
        if (!same) inquiryRef = '';
        else if (o.product.kind === 'pass') {
          const detail = safe(iq.data);
          if (detail.catering || detail.cocktail || detail.reception)
            return err('식음료가 포함된 신청은 담당자가 전체 구성과 최종 금액을 확인한 뒤 결제를 안내합니다. 카카오톡으로 문의번호를 알려 주세요.', 409, 'CONSULTATION_REQUIRED');
        }
      }
      let linkedBooking = null;
      if (o.product.kind === 'pass') {
        if(await paymentBlocked(env,o.event_date,'megaspot-gundae'))return err('선택한 일정은 담당자 확인이 필요합니다. 예약 상담을 남겨 주시면 이용 가능 여부와 결제 방법을 안내드립니다.',409,'RESERVATION_PENDING');
        const candidate = inquiryRef ? await existingBooking(env,{inquiry_ref:inquiryRef,event_date:o.event_date}) : null;
        if (candidate && !matchesPass(candidate,{event_date:o.event_date,people:o.people,buyer_phone:phone},o.slot))
          return err('기존 예약과 공간·시간·인원이 다릅니다. 예약을 변경하려면 운영팀에 문의해 주세요.',409,'BOOKING_MISMATCH');
        linkedBooking = candidate;
        if (!(await passSlotAvailable(env,o.event_date,o.slot,linkedBooking?.booking_code)))
          return err(`${kdate(o.event_date)}의 선택한 시간은 이미 예약되었거나 임시 확보 중입니다. 다른 일정을 고르거나 운영팀에 문의해 주세요.`,409,'DATE_TAKEN');
      }
      const data = { lines: o.lines, people: o.people, slot: o.slot, memo: str(d.memo, 500), inquiry_ref: inquiryRef, linked_booking_code:linkedBooking?.booking_code||null, addons: o.product.kind === 'verification' ? {} : (d.addons || {}), qty: o.product.kind === 'verification' ? 1 : (num(d.qty) || 1), member_email: member ? member.email : '', ua: str(request.headers.get('user-agent'), 200), provider: 'payapp' };
      await env.DB.prepare('INSERT INTO orders (oid, product_id, title, event_date, people, price, buyer_name, buyer_phone, buyer_email, data, status, inquiry_ref, member_id, test, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(oid, o.product.id, o.title, o.event_date, o.people, o.total, name, phone, email, JSON.stringify(data), 'created', data.inquiry_ref || null, member ? member.id : null, C.live ? 0 : 1, t).run();
      await log(env, 'order.created', oid, member ? 'member:' + member.id : 'customer', { product: o.product.id, total: o.total, date: o.event_date });
      const nonce = randomToken();
      await env.DB.prepare('INSERT INTO payapp_payments (oid, nonce, created_at) VALUES (?,?,?)').bind(oid, nonce, t).run();
      const origin = new URL(request.url).origin;
      let r;
      try {
        r = await requestPayment(C, { goodname: o.title.slice(0, 100), price: String(o.total), recvphone: phone,
          recvemail: email, reqaddr: '0', smsuse: 'n', checkretry: 'y', skip_cstpage: 'y',
          feedbackurl: origin + '/api/pay/feedback', returnurl: origin + '/api/pay/return?oid=' + oid,
          var1: oid, var2: nonce });
      } catch {
        // 타임아웃은 요청이 접수됐을 수도 있습니다. 통보 수신을 위해 주문을 유지합니다.
        await env.DB.prepare("UPDATE orders SET result_msg = '결제 요청 확인 필요', updated_at = ? WHERE oid = ? AND status = 'created'").bind(now(), oid).run();
        return err('결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.', 502, 'PAYAPP_UNAVAILABLE');
      }
      if (!r.ok) {
        await env.DB.prepare("UPDATE orders SET status = 'failed', result_msg = ?, updated_at = ? WHERE oid = ? AND status = 'created'")
          .bind('결제 요청 실패 (' + r.code.replace(/[^0-9A-Z_]/gi, '').slice(0, 40) + ')', now(), oid).run();
        return err('페이앱 결제 요청이 거절되었습니다. 잠시 후 다시 시도하거나 문의해 주세요.', 502, 'PAYAPP_REJECTED');
      }
      // 최초 통보가 API 응답보다 먼저 도착해도 같은 거래번호만 연결됩니다.
      const bound = await env.DB.prepare('UPDATE payapp_payments SET mul_no = ? WHERE oid = ? AND (mul_no IS NULL OR mul_no = ?)').bind(r.mulNo, oid, r.mulNo).run();
      if (!bound.meta?.changes) throw new Error('PAYMENT_BINDING');
      return json({ ok: true, provider: 'payapp', oid, total: o.total, lines: o.lines, test: false, payurl: r.payurl });
    }

    // ---- 주문 조회 ----
    const mO = path.match(/^orders\/([A-Z0-9-]+)$/);
    if (mO && method === 'GET') {
      const row = await env.DB.prepare('SELECT oid, product_id, title, event_date, people, price, buyer_name, buyer_phone, buyer_email, data, status, pay_method, tid, appl_at, result_msg, booking_code, test, created_at FROM orders WHERE oid = ?').bind(mO[1]).first();
      if (!row) return err('주문을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const data = safe(row.data);
      const reservation = row.booking_code ? await env.DB.prepare('SELECT status FROM bookings WHERE booking_code=?').bind(row.booking_code).first() : null;
      const refunds = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM payapp_refunds WHERE oid = ?').bind(row.oid).first();
      return json({ ok: true, order: { oid: row.oid, product_id: row.product_id, verification: PRODUCTS.get(row.product_id)?.kind === 'verification', title: row.title, event_date: row.event_date, people: row.people, price: row.price, status: row.status,
        buyer_name: row.buyer_name.slice(0, 1) + '*'.repeat(Math.max(1, row.buyer_name.length - 1)), buyer_phone: row.buyer_phone.replace(/(\d{3})\d{3,4}(\d{4})/, '$1-****-$2'), buyer_email: row.buyer_email ? row.buyer_email.replace(/^(.).*(@.*)$/, '$1***$2') : '',
        lines: data.lines || [], retry:retrySelection(row,data), refunded_amount: row.status==='refunded'?row.price:Math.min(row.price, refunds?.total || 0), pay_method: row.pay_method, tid: row.tid ? row.tid.slice(-8) : '', appl_at: row.appl_at, result_msg: row.result_msg, booking_code: row.booking_code, booking_status:reservation?.status||null, test: !!row.test, created_at: row.created_at } });
    }
    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) { console.error('pay', e && e.message); if(path==='feedback')return notice('FAIL',500); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER_ERROR'); }
}
function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

function notice(text, status = 200) {
  return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
async function existingBooking(env,row){
 if(row.booking_code)return env.DB.prepare('SELECT * FROM bookings WHERE booking_code=?').bind(row.booking_code).first();
 if(!row.inquiry_ref)return null;
 const rows=(await env.DB.prepare("SELECT * FROM bookings WHERE inquiry_ref=? AND status<>'cancelled' AND (? IS NULL OR date=?) ORDER BY id DESC LIMIT 2").bind(row.inquiry_ref,row.event_date,row.event_date).all()).results||[];
 return rows.length===1?rows[0]:null;
}
async function feedback(request, env, C, waitUntil) {
  const raw = await request.text();
  if (raw.length > 32768) return notice('FAIL', 413);
  const f = Object.fromEntries(new URLSearchParams(raw));
  if (!await validFeedback(C, f)) return notice('FAIL', 403);
  const state = f.pay_state, partial = ['70', '71'].includes(state);
  if (!['1', '4', '8', '16', '31', '32', '9', '64', '10', '70', '71'].includes(state)) return notice('FAIL', 400);
  if (!/^\d{1,30}$/.test(f.mul_no || '')) return notice('FAIL', 400);
  const row = await env.DB.prepare('SELECT o.*, p.nonce, p.mul_no AS payapp_no FROM orders o JOIN payapp_payments p ON p.oid = o.oid WHERE o.oid = ?').bind(f.var1 || '').first();
  if (!row || !equalSecret(f.var2, row.nonce)) return notice('FAIL', 403);
  const price = partial ? f.orig_price : f.price, originalNo = partial ? f.orig_mul_no : f.mul_no;
  if (!/^\d+$/.test(price || '') || Number(price) !== row.price || !/^\d{1,30}$/.test(originalNo || '')) return notice('FAIL', 400);
  if (row.payapp_no && row.payapp_no !== originalNo) return notice('FAIL', 400);
  // 해시와 주문별 nonce를 모두 검증한 통보만 최초 거래번호를 연결할 수 있습니다.
  await env.DB.prepare('UPDATE payapp_payments SET mul_no = ? WHERE oid = ? AND mul_no IS NULL').bind(originalNo, row.oid).run();
  const bound = await env.DB.prepare('SELECT mul_no FROM payapp_payments WHERE oid = ?').bind(row.oid).first();
  if (bound.mul_no !== originalNo) return notice('FAIL', 400);
  const t = now(), oid = row.oid, data = safe(row.data);
  const sql = (q, ...args) => env.DB.prepare(q).bind(...args);
  if (state === '4') {
    if(!['created','pending'].includes(row.status))return notice('SUCCESS');
    const generated = data.slot && row.event_date ? 'MS-' + oid.slice(4, 8) + '-' + (await sha256(oid)).slice(0, 12).toUpperCase() : null;
    const candidate=await existingBooking(env,row);
    const intendedLink=Object.hasOwn(data,'linked_booking_code');
    const linked=data.slot ? (matchesPass(candidate,row,data.slot)&&(!intendedLink||data.linked_booking_code===candidate.booking_code)?candidate:null) : candidate;
    let selectedCode=sqlText(linked?.booking_code||generated||''),match='0';
    const forceReview=!!data.slot&&((!!candidate&&!linked)||(!!data.linked_booking_code&&!linked));
    if(data.slot&&linked){
      const hours=PKG_HOURS[data.slot];
      // Repeat the exact match in the write transaction: a reservation can change while the payment window is open.
      match=`${noPendingWaitSql({space:"'megaspot-gundae'",date:'o.event_date'})} AND EXISTS(SELECT 1 FROM bookings exact WHERE exact.booking_code=${sqlText(linked.booking_code)} AND exact.status='confirmed'
        AND exact.space_id='megaspot-gundae' AND exact.date=o.event_date AND exact.start_h=${hours[0]} AND exact.end_h=${hours[1]}
        AND exact.headcount=o.people AND REPLACE(REPLACE(REPLACE(exact.phone,'-',''),' ',''),'+','')=REPLACE(REPLACE(REPLACE(o.buyer_phone,'-',''),' ',''),'+',''))`;
      // Preserve the INSERT's decision even when adding a review booking removes its inquiry from the queue.
      selectedCode=`CASE WHEN EXISTS(SELECT 1 FROM bookings chosen WHERE chosen.booking_code=${sqlText(generated)}) THEN ${sqlText(generated)} ELSE ${sqlText(linked.booking_code)} END`;
    }
    if(!row.test)await preserveLegacyPayments(env);
    const batch = [];
    if(linked&&!row.test)batch.push(sql(`UPDATE bookings SET confirm_doc=NULL,updated_at=? WHERE booking_code=? AND EXISTS(SELECT 1 FROM orders o WHERE oid=? AND status IN ('created','pending') AND ${data.slot?match:'1'})`,t,linked.booking_code,oid));
    if (generated) {
      const sh = PKG_HOURS[data.slot];
      if (!sh) return notice('FAIL', 400);
      const memo = ('온라인 결제 ' + oid + ' · ' + row.title + (data.memo ? ' · ' + data.memo : '')).slice(0, 1900);
      const started=Date.parse(row.event_date+'T00:00:00+09:00')+sh[0]*36e5<=Date.now();
      // New reservations must still be in the future when written. Late payment remains received for manual review.
      const available=forceReview||linked||started?'0':`(${bookingAvailableSql({space:"'megaspot-gundae'",date:'o.event_date',start:'span.start_h',end:'span.end_h'})})
        AND ${noPendingWaitSql({space:"'megaspot-gundae'",date:'o.event_date'})}
        AND julianday(o.event_date||'T00:00:00+09:00')+span.start_h/24.0>julianday('now')`;
      batch.push(sql(`INSERT OR IGNORE INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, memo, status, amount, start_h, end_h, created_at)
        SELECT ?, 'megaspot-gundae', o.inquiry_ref, buyer_name, buyer_phone, substr(buyer_phone, -4), event_date, ?, people, ?,
          CASE WHEN ${available} THEN 'confirmed' ELSE 'payment_review' END, price, span.start_h, span.end_h, ?
        FROM orders o CROSS JOIN (SELECT ? AS start_h,? AS end_h) span WHERE oid=? AND status IN ('created','pending') AND NOT(${match})`,generated,data.slot,memo,t,sh[0],sh[1],oid));
      batch.push(sql("UPDATE bookings SET memo=memo||' · ※ 결제 완료 · 일정 확인 필요 · 예약 확정 보류' WHERE booking_code=? AND status='payment_review' AND EXISTS(SELECT 1 FROM orders WHERE oid=? AND status IN ('created','pending'))",generated,oid));
      if (row.inquiry_ref) batch.push(sql(`UPDATE inquiries SET status=(SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE booking_code=(${selectedCode}) AND status='payment_review') THEN '결제 대기' ELSE '예약 확정' END FROM orders o WHERE oid=?),updated_at=? WHERE ref=? AND EXISTS(SELECT 1 FROM orders WHERE oid=? AND status IN ('created','pending'))`,oid,t,row.inquiry_ref,oid));
    }
    batch.push(sql("INSERT INTO event_log (kind,ref,actor,detail,created_at) SELECT 'order.paid',oid,'payapp','페이앱 승인 완료',? FROM orders WHERE oid = ? AND status IN ('created','pending')", t, oid));
    batch.push(sql(`UPDATE orders AS o SET status='paid',tid=?,pay_method=?,appl_at=?,result_msg=CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE booking_code=(${selectedCode}) AND status='payment_review') THEN '승인 완료 · 일정 확인 필요 · 예약 확정 보류' ELSE '승인 완료' END,booking_code=NULLIF((${selectedCode}),''),paid_at=?,updated_at=? WHERE oid=? AND status IN ('created','pending')`,originalNo,'PayApp:'+(f.pay_type||''),(f.pay_date||t).slice(0,30),t,t,oid));
    // D1 batch is a transaction; the chosen booking and its current conditions are resolved inside it.
    const changed=await env.DB.batch(batch),last=changed.at(-1);
    if(generated&&!linked&&(last?.meta?.changes||last?.changes)){
      const created=await env.DB.prepare('SELECT status FROM bookings WHERE booking_code=?').bind(generated).first();
      if(created?.status==='confirmed')await confirmedGuide(env,generated,waitUntil);
    }
  } else if (['9','64'].includes(state)||partial) {
    if(partial&&(!/^\d+$/.test(f.price||'')||Number(f.price)<=0||Number(f.price)>row.price||f.mul_no===originalNo))return notice('FAIL',400);
    const linked=await existingBooking(env,row);
    const result=await recordPayappRefund(env,{...row,booking_code:linked?.booking_code||row.booking_code,payapp_no:originalNo},f,partial);
    if(!result.ok)return notice('FAIL',400);
  } else if (['8', '16', '31', '32'].includes(state)) {
    await sql("UPDATE orders SET status = 'cancelled', result_msg = '결제 요청 취소', updated_at = ? WHERE oid = ? AND status IN ('created','pending')", t, oid).run();
  } else if (state === '10') {
    await sql("UPDATE orders SET status = 'pending', result_msg = '입금 대기', updated_at = ? WHERE oid = ? AND status = 'created'", t, oid).run();
  }
  return notice('SUCCESS');
}
