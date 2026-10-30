// 페이앱: 서버에서 결제 요청 → payurl 이동 → 검증된 feedback만 주문·예약 확정.
import { json, err, hasDb, readJson, str, num, isDate, now, log, sha256, sameOrigin, clientIp, getMember, kstToday, tooMany, hit, randomToken, requireAdmin } from '../_lib.js';
import { PRODUCTS, HOLIDAYS, PRICING } from '../_catalog.js';

import { payappConfig, requestPayment, validFeedback, equalSecret } from '../_payapp.js';
const PKG_SLOT = { day: 'pkg-day', allday: 'pkg-allday', allnight: 'pkg-allnight' };
const PKG_LABEL = { day: '낮 패키지 10–17시', allday: '올데이 패키지 10–24시', allnight: '올나잇 패키지 18시–다음 날 07시' };

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
    const pk = peakOf(event_date);
    if (pk) return { error: `${kdate(event_date)}은(는) 성수기 요금(${pk.label} 기준${pk.people > P.people.base ? ' · 기준 ' + pk.people + '명 포함' : ''})이 적용되는 날이라 이용권으로 결제할 수 없습니다. '예약 신청 · 금액 확인'에서 그날 금액을 확인하고 신청해 주시면 결제 방법을 안내해 드립니다.`, code: 'PEAK', peak: pk.id };
    const col = dayCol(event_date), g = P.dayGroups[p.group];
    if (!g.cols.includes(col)) return { error: `${kdate(event_date)}은(는) ${COL_LABEL[col]} 요금이 적용되는 날이라 이 이용권(${g.label})으로 결제할 수 없습니다. 같은 패키지의 ${COL_LABEL[col]} 이용권을 골라 주세요.`, code: 'DAY_MISMATCH', col };
    people = num(input.people); if (people == null) people = P.people.base;
    if (people < 1 || people > P.people.max) return { error: `인원은 1~${P.people.max}명 사이로 입력해 주세요.` };
    lines.push({ id: p.id, label: p.name, desc: `${PKG_LABEL[p.pkg]} · ${p.hours}시간 · 기준 ${P.people.base}명`, qty: 1, amount: p.price });
    const extra = Math.max(0, people - P.people.base);
    if (extra) lines.push({ id: 'people', label: '인원 추가', desc: `${extra}명 × ${P.people.extra.toLocaleString('ko-KR')}원`, qty: extra, amount: extra * P.people.extra });
    slot = PKG_SLOT[p.pkg];
    const add = input.addons && typeof input.addons === 'object' ? input.addons : {};
    for (const a of P.items.filter(x => x.kind === 'addon')) {
      const v = add[a.opt]; if (!v) continue;
      const qty = Math.max(1, Math.min(10, parseInt(v, 10) || 1));
      lines.push({ id: a.id, label: a.name, desc: `${a.unit} × ${qty}`, qty, amount: a.price * qty });
    }
  } else {
    const qty = Math.max(1, Math.min(10, num(input.qty) || 1));
    lines.push({ id: p.id, label: p.name, desc: `${p.unit} × ${qty}`, qty, amount: p.price * qty });
    event_date = str(input.date, 10) || null; if (event_date && !isDate(event_date)) event_date = null;
    if (qty > 1) title = `${p.name} × ${qty}`;
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { product: p, lines, total, event_date, people, slot, title };
}

export async function onRequest({ request, env, params }) {
  const path = (params.path || []).join('/');
  const method = request.method.toUpperCase();
  const C = payappConfig(env);
  if (path === 'config' && method === 'GET') return json({ ok: true, provider: 'payapp', enabled: hasDb(env) && C.live, configured: C.configured, test: false });

  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  try {
    if (path === 'diagnostics' && method === 'GET') {
      const denied = await requireAdmin(request, env); if (denied) return denied;
      try {
        const r = await fetch('https://api.payapp.kr/oapi/v2', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'cmd=invalid_diagnostic', redirect: 'error', signal: AbortSignal.timeout(20000) });
        const body = await r.text(), q = new URLSearchParams(body);
        return json({ ok: true, http_status: r.status, content_type: r.headers.get('content-type'), response_format: q.has('state') ? 'query' : (/^\s*</.test(body) ? 'html' : 'other'), provider_code: q.get('errno'), abort_timeout_supported: typeof AbortSignal.timeout === 'function' });
      } catch (e) { return json({ ok: false, diagnostic_error: String(e?.message || '').slice(0, 180), error_name: e?.name, abort_timeout_supported: typeof AbortSignal.timeout === 'function' }); }
    }
    if (path === 'feedback' && method === 'POST') return await feedback(request, env, C);
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
      if (o.product.kind === 'pass') {
        const blk = await env.DB.prepare("SELECT state FROM calendar_blocks WHERE space_id = 'megaspot-gundae' AND date = ?").bind(o.event_date).first();
        // 같은 날 다른 시간대 예약은 괜찮고, 이용 시간이 겹치는 확정 예약(시간 미정 포함)이 있을 때만 막습니다
        const PH = { 'pkg-day': [10, 17], 'pkg-allday': [10, 24], 'pkg-allnight': [18, 31] }[o.slot] || [null, null];
        const { results: sameDay } = await env.DB.prepare("SELECT start_h, end_h FROM bookings WHERE space_id = 'megaspot-gundae' AND date = ? AND status = 'confirmed'").bind(o.event_date).all();
        const bk = (sameDay || []).some(x => x.start_h == null || x.end_h == null || PH[0] == null || (PH[0] < x.end_h && x.start_h < PH[1]));
        if ((blk && blk.state === 'full') || bk) return err(`${kdate(o.event_date)}은(는) 이미 예약이 있어 온라인 결제가 어렵습니다. 다른 날짜를 고르거나 카카오톡으로 문의해 주세요.`, 409, 'DATE_TAKEN');
        // 운영자가 다른 고객을 위해 임시로 잡아 둔 날은 온라인 결제 대신 상담으로 안내합니다(이중 예약 방지)
        if (blk && blk.state === 'hold') return err(`${kdate(o.event_date)}은(는) 다른 문의로 임시 확보 중이라 온라인 결제가 어렵습니다. 예약 신청이나 카카오톡으로 알려 주시면 가능 여부를 바로 확인해 드립니다.`, 409, 'DATE_TAKEN');
      }
      let member = null; try { member = await getMember(request, env); } catch {}
      const oid = makeOid(), t = now();
      // 접수번호는 같은 연락처(끝 4자리)로 들어온 문의일 때만 연결합니다(남의 문의를 결제로 바꾸지 못하게)
      let inquiryRef = str(o.product.kind === 'verification' ? '' : d.inquiry_ref, 20).toUpperCase().replace(/[^0-9A-Z-]/g, '');
      if (inquiryRef) {
        const iq = await env.DB.prepare('SELECT phone FROM inquiries WHERE ref = ?').bind(inquiryRef).first();
        const same = iq && String(iq.phone || '').replace(/\D/g, '').slice(-4) === phone.replace(/\D/g, '').slice(-4);
        if (!same) inquiryRef = '';
      }
      const data = { lines: o.lines, people: o.people, slot: o.slot, memo: str(d.memo, 500), inquiry_ref: inquiryRef, addons: o.product.kind === 'verification' ? {} : (d.addons || {}), qty: o.product.kind === 'verification' ? 1 : (num(d.qty) || 1), member_email: member ? member.email : '', ua: str(request.headers.get('user-agent'), 200), provider: 'payapp' };
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
      const refunds = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM payapp_refunds WHERE oid = ?').bind(row.oid).first();
      return json({ ok: true, order: { oid: row.oid, product_id: row.product_id, verification: PRODUCTS.get(row.product_id)?.kind === 'verification', title: row.title, event_date: row.event_date, people: row.people, price: row.price, status: row.status,
        buyer_name: row.buyer_name.slice(0, 1) + '*'.repeat(Math.max(1, row.buyer_name.length - 1)), buyer_phone: row.buyer_phone.replace(/(\d{3})\d{3,4}(\d{4})/, '$1-****-$2'), buyer_email: row.buyer_email ? row.buyer_email.replace(/^(.).*(@.*)$/, '$1***$2') : '',
        lines: data.lines || [], refunded_amount: Math.min(row.price, refunds?.total || 0), pay_method: row.pay_method, tid: row.tid ? row.tid.slice(-8) : '', appl_at: row.appl_at, result_msg: row.result_msg, booking_code: row.booking_code, test: !!row.test, created_at: row.created_at } });
    }
    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) { console.error('pay', e && e.message); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER_ERROR'); }
}
function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

function notice(text, status = 200) {
  return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
async function feedback(request, env, C) {
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
    const code = data.slot && row.event_date ? 'MS-' + oid.slice(4, 8) + '-' + (await sha256(oid)).slice(0, 12).toUpperCase() : null;
    const batch = [];
    if (code) {
      const sh = { 'pkg-day': [10, 17], 'pkg-allday': [10, 24], 'pkg-allnight': [18, 31] }[data.slot];
      if (!sh) return notice('FAIL', 400);
      const { results: bookings } = await env.DB.prepare("SELECT start_h, end_h FROM bookings WHERE space_id = 'megaspot-gundae' AND date = ? AND status = 'confirmed'").bind(row.event_date).all();
      const clash = (bookings || []).some(b => b.start_h == null || b.end_h == null || (sh[0] < b.end_h && b.start_h < sh[1]));
      const memo = ('온라인 결제 ' + oid + ' · ' + row.title + (data.memo ? ' · ' + data.memo : '') + (clash ? ' · ※ 같은 시간 다른 예약 확인 필요' : '')).slice(0, 2000);
      batch.push(sql("INSERT OR IGNORE INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, memo, status, amount, start_h, end_h, created_at) SELECT ?, 'megaspot-gundae', inquiry_ref, buyer_name, buyer_phone, substr(buyer_phone, -4), event_date, ?, people, ?, 'confirmed', price, ?, ?, ? FROM orders WHERE oid = ? AND status IN ('created','pending')", code, data.slot, memo, sh[0], sh[1], t, oid));
      if (row.inquiry_ref) batch.push(sql("UPDATE inquiries SET status = '예약 확정', updated_at = ? WHERE ref = ? AND EXISTS (SELECT 1 FROM orders WHERE oid = ? AND status IN ('created','pending'))", t, row.inquiry_ref, oid));
    }
    batch.push(sql("INSERT INTO event_log (kind,ref,actor,detail,created_at) SELECT 'order.paid',oid,'payapp','페이앱 승인 완료',? FROM orders WHERE oid = ? AND status IN ('created','pending')", t, oid));
    batch.push(sql("UPDATE orders SET status = 'paid', tid = ?, pay_method = ?, appl_at = ?, result_msg = '승인 완료', booking_code = ?, paid_at = ?, updated_at = ? WHERE oid = ? AND status IN ('created','pending')", originalNo, 'PayApp:' + (f.pay_type || ''), (f.pay_date || t).slice(0, 30), code, t, t, oid));
    // D1 batch는 트랜잭션입니다. 중복·동시 통보에서 예약 한 건만 만들어집니다.
    await env.DB.batch(batch);
  } else if (['9', '64'].includes(state)) {
    await env.DB.batch([
      sql("INSERT INTO event_log (kind,ref,actor,detail,created_at) SELECT 'order.refunded',oid,'payapp','페이앱 승인 취소',? FROM orders WHERE oid = ? AND status != 'refunded'", t, oid),
      sql("INSERT OR REPLACE INTO payapp_refunds (mul_no, oid, amount, created_at) VALUES (?,?,?,?)", 'full-' + originalNo, oid, row.price, t),
      sql("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE booking_code = (SELECT booking_code FROM orders WHERE oid = ?)", t, oid),
      sql("UPDATE inquiries SET status = '취소·환불', updated_at = ? WHERE ref = ? AND status = '예약 확정' AND EXISTS (SELECT 1 FROM orders WHERE oid = ? AND booking_code IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM orders WHERE inquiry_ref = ? AND oid != ? AND status = 'paid')", t, row.inquiry_ref || '', oid, row.inquiry_ref || '', oid),
      sql("UPDATE orders SET status = 'refunded', result_msg = '페이앱 승인 취소', updated_at = ? WHERE oid = ?", t, oid)
    ]);
  } else if (partial) {
    if (!/^\d+$/.test(f.price || '') || Number(f.price) <= 0 || Number(f.price) > row.price || f.mul_no === originalNo) return notice('FAIL', 400);
    await env.DB.batch([
      sql('INSERT OR IGNORE INTO payapp_refunds (mul_no, oid, amount, created_at) VALUES (?,?,?,?)', f.mul_no, oid, Number(f.price), t),
      sql("INSERT INTO event_log (kind,ref,actor,detail,created_at) SELECT 'order.partial_refund',?,'payapp',?,? WHERE changes() > 0", oid, '부분 환불 ' + f.price + '원', t),
      sql("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE booking_code = (SELECT booking_code FROM orders WHERE oid = ?) AND (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid = ?) >= ?", t, oid, oid, row.price),
      sql("UPDATE inquiries SET status = '취소·환불', updated_at = ? WHERE ref = ? AND status = '예약 확정' AND EXISTS (SELECT 1 FROM orders WHERE oid = ? AND booking_code IS NOT NULL AND price <= (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid = ?)) AND NOT EXISTS (SELECT 1 FROM orders WHERE inquiry_ref = ? AND oid != ? AND status = 'paid')", t, row.inquiry_ref || '', oid, oid, row.inquiry_ref || '', oid),
      sql("UPDATE orders SET status = CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid = ?) >= price THEN 'refunded' ELSE status END, result_msg = '부분 환불 · 페이앱 내역 확인', updated_at = ? WHERE oid = ?", oid, t, oid)
    ]);
  } else if (['8', '16', '31', '32'].includes(state)) {
    await sql("UPDATE orders SET status = 'cancelled', result_msg = '결제 요청 취소', updated_at = ? WHERE oid = ? AND status IN ('created','pending')", t, oid).run();
  } else if (state === '10') {
    await sql("UPDATE orders SET status = 'pending', result_msg = '입금 대기', updated_at = ? WHERE oid = ? AND status = 'created'", t, oid).run();
  }
  return notice('SUCCESS');
}
