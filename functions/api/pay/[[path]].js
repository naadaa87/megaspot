// 온라인 결제 — KG이니시스 웹표준결제(INIStdPay)
//   GET  /api/pay/config          결제 사용 가능 여부·테스트 모드 여부
//   POST /api/pay/prepare         주문 생성 + 결제창에 넘길 값(서명 포함) 발급
//   POST /api/pay/return          결제창이 돌아오는 주소 — 승인 요청 → 금액 검증 → 주문 저장 → 완료 페이지로 이동
//   GET  /api/pay/close           결제창 닫기 페이지
//   GET  /api/pay/orders/<oid>    주문 결과 조회 (완료 페이지용)
//
// Cloudflare 설정: INICIS_MID(상점아이디), INICIS_SIGNKEY(웹결제 signkey, Secret). 둘 다 없으면 이니시스 테스트 상점으로 동작합니다
// (결제창은 열리지만 실제 승인·출금은 되지 않음). 계약이 끝나면 두 값을 넣고 다시 배포하면 실결제로 바뀝니다.
import { json, err, hasDb, readJson, str, num, isDate, now, log, sha256, sameOrigin, clientIp, getMember, kstToday, tooMany, hit } from '../_lib.js';
import { PRODUCTS, HOLIDAYS } from '../_catalog.js';

const TEST_MID = 'INIpayTest', TEST_SIGNKEY = 'SU5JTElURV9UUklQTEVERVNfS0VZU1RS';
const PKG_SLOT = { day: 'pkg-day', allday: 'pkg-allday', allnight: 'pkg-allnight' };
const PKG_LABEL = { day: '낮 패키지 10–17시', allday: '올데이 패키지 10–24시', allnight: '올나잇 패키지 18시–다음 날 07시' };

function cfg(env) {
  const live = !!(env.INICIS_MID && env.INICIS_SIGNKEY) && env.INICIS_TEST !== '1';
  return { live, mid: live ? env.INICIS_MID : TEST_MID, signKey: live ? env.INICIS_SIGNKEY : TEST_SIGNKEY,
    script: live ? 'https://stdpay.inicis.com/stdjs/INIStdPay.js' : 'https://stgstdpay.inicis.com/stdjs/INIStdPay.js',
    closeScript: live ? 'https://stdpay.inicis.com/stdjs/INIStdPay_close.js' : 'https://stgstdpay.inicis.com/stdjs/INIStdPay_close.js' };
}
// 요일 구분 — pricing-engine.js 의 dayInfo 와 같은 규칙 (당일·다음 날이 쉬는 날인지로 월–목/금/토/일)
function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return dt.toISOString().slice(0, 10); }
function isOff(iso) { const [y, m, d] = iso.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return dow === 0 || dow === 6 || !!HOLIDAYS[iso]; }
export function dayCol(iso) { const off = isOff(iso), next = isOff(addDays(iso, 1)); return !off ? (next ? 'fri' : 'wd') : (next ? 'sat' : 'sun'); }
const COL_LABEL = { wd: '월–목', fri: '금요일', sat: '토요일', sun: '일요일' };
function kdate(iso) { const [y, m, d] = iso.split('-').map(Number); const dow = '일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; return `${y}년 ${m}월 ${d}일(${dow})`; }
function makeOid() { const d = new Date(Date.now() + 9 * 3600e3).toISOString().replace(/[-:T]/g, '').slice(0, 14); const r = crypto.getRandomValues(new Uint8Array(3)); return 'MS' + d + [...r].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
function html(body, status = 200) { return new Response('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>메가스팟 결제</title></head><body style="font-family:sans-serif;padding:24px;color:#1E2225">' + body + '</body></html>', { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
function redirectTop(url, msg) { return html(`<p>${msg || '처리 중입니다…'}</p><script>try{(window.top||window).location.href=${JSON.stringify(url)}}catch(e){location.href=${JSON.stringify(url)}}</script><noscript><a href="${url}">계속</a></noscript>`); }

// ---------- 주문 금액 계산 (서버가 다시 계산해 금액 위변조를 막습니다) ----------
export function buildOrder(input) {
  const P = PRODUCTS, p = P.get(str(input.product_id, 40));
  if (!p) return { error: '상품을 찾을 수 없습니다.' };
  const lines = [], today = kstToday();
  let event_date = null, people = null, title = p.name, slot = null;
  if (p.kind === 'pass') {
    event_date = str(input.date, 10);
    if (!isDate(event_date)) return { error: '이용일을 선택해 주세요.' };
    if (event_date < today) return { error: '지난 날짜는 선택할 수 없습니다.' };
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
  const C = cfg(env);
  if (path === 'config' && method === 'GET') return json({ ok: true, enabled: hasDb(env), test: !C.live, script: C.script });
  if (path === 'close' && method === 'GET') return html(`<script src="${C.closeScript}" charset="UTF-8"></script>`);
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  try {
    // ---- 주문 생성 ----
    if (path === 'prepare' && method === 'POST') {
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
        const bk = await env.DB.prepare("SELECT 1 AS x FROM bookings WHERE space_id = 'megaspot-gundae' AND date = ? AND status = 'confirmed'").bind(o.event_date).first();
        if ((blk && blk.state === 'full') || bk) return err(`${kdate(o.event_date)}은(는) 이미 예약이 있어 온라인 결제가 어렵습니다. 다른 날짜를 고르거나 카카오톡으로 문의해 주세요.`, 409, 'DATE_TAKEN');
      }
      let member = null; try { member = await getMember(request, env); } catch {}
      const oid = makeOid(), t = now();
      const data = { lines: o.lines, people: o.people, slot: o.slot, memo: str(d.memo, 500), inquiry_ref: str(d.inquiry_ref, 20).toUpperCase(), addons: d.addons || {}, qty: num(d.qty) || 1, member_email: member ? member.email : '', ua: str(request.headers.get('user-agent'), 200) };
      await env.DB.prepare('INSERT INTO orders (oid, product_id, title, event_date, people, price, buyer_name, buyer_phone, buyer_email, data, status, inquiry_ref, member_id, test, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(oid, o.product.id, o.title, o.event_date, o.people, o.total, name, phone, email, JSON.stringify(data), 'created', data.inquiry_ref || null, member ? member.id : null, C.live ? 0 : 1, t).run();
      await log(env, 'order.created', oid, member ? 'member:' + member.id : 'customer', { product: o.product.id, total: o.total, date: o.event_date });
      // 결제창 요청값 (INIStdPay)
      const origin = new URL(request.url).origin, timestamp = String(Date.now()), price = String(o.total);
      const fields = {
        version: '1.0', mid: C.mid, oid, price, timestamp, currency: 'WON', charset: 'UTF-8',
        goodname: o.title.slice(0, 40), buyername: name, buyertel: phone, buyeremail: email || '',
        signature: await sha256(`oid=${oid}&price=${price}&timestamp=${timestamp}`),
        verification: await sha256(`oid=${oid}&price=${price}&signKey=${C.signKey}&timestamp=${timestamp}`),
        mKey: await sha256(C.signKey), use_chkfake: 'Y',
        returnUrl: origin + '/api/pay/return', closeUrl: origin + '/api/pay/close',
        gopaymethod: 'Card:DirectBank:VBank', acceptmethod: 'HPP(1):below1000:va_receipt:centerCd(Y)', payViewType: 'overlay',
        merchantData: oid
      };
      return json({ ok: true, oid, total: o.total, lines: o.lines, test: !C.live, script: C.script, fields });
    }

    // ---- 결제창에서 돌아옴 ----
    if (path === 'return' && method === 'POST') {
      const form = await request.formData(); const f = k => str(form.get(k), 500);
      const oid = f('orderNumber') || f('merchantData'), resultCode = f('resultCode'), resultMsg = f('resultMsg');
      const row = oid ? await env.DB.prepare('SELECT oid, price, status, product_id, event_date, people, buyer_name, buyer_phone, data, inquiry_ref, member_id FROM orders WHERE oid = ?').bind(oid).first() : null;
      if (!row) return html('<h2>주문을 찾을 수 없습니다.</h2><p>잠시 후 다시 시도하거나 카카오톡으로 문의해 주세요.</p>', 404);
      const done = `/order/complete/?oid=${encodeURIComponent(oid)}`;
      if (row.status === 'paid') return redirectTop(done, '이미 결제가 완료된 주문입니다.');
      if (resultCode !== '0000') {
        await env.DB.prepare("UPDATE orders SET status = 'failed', result_msg = ?, updated_at = ? WHERE oid = ?").bind((resultCode + ' ' + resultMsg).slice(0, 200), now(), oid).run();
        await log(env, 'order.failed', oid, 'inicis', { resultCode, resultMsg });
        return redirectTop(done + '&fail=1', '결제가 완료되지 않았습니다.');
      }
      const authUrl = f('authUrl'), netCancelUrl = f('netCancelUrl'), authToken = f('authToken');
      let host = ''; try { host = new URL(authUrl).host; } catch {}
      if (!/^(fc|ks|stg)stdpay\.inicis\.com$/.test(host) || !authToken) {
        await env.DB.prepare("UPDATE orders SET status = 'failed', result_msg = ?, updated_at = ? WHERE oid = ?").bind('승인 주소 확인 실패', now(), oid).run();
        return redirectTop(done + '&fail=1', '결제 정보를 확인하지 못했습니다.');
      }
      const timestamp = String(Date.now());
      const body = new URLSearchParams({ mid: C.mid, authToken, timestamp, signature: await sha256(`authToken=${authToken}&timestamp=${timestamp}`), verification: await sha256(`authToken=${authToken}&signKey=${C.signKey}&timestamp=${timestamp}`), charset: 'UTF-8', format: 'JSON' });
      let r = null;
      try { const res = await fetch(authUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }); r = await res.json(); } catch (e) { r = { resultCode: 'ERR', resultMsg: '승인 요청 실패 ' + (e.message || '') }; }
      const paidOk = r && r.resultCode === '0000';
      const priceOk = paidOk && String(r.TotPrice) === String(row.price) && (!r.MOID || r.MOID === oid);
      if (paidOk && !priceOk) {
        // 금액이 다르면 망취소(승인 취소)로 되돌립니다.
        try { await fetch(netCancelUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }); } catch {}
        await env.DB.prepare("UPDATE orders SET status = 'failed', result_msg = ?, updated_at = ? WHERE oid = ?").bind('금액 불일치로 승인 취소', now(), oid).run();
        await log(env, 'order.netcancel', oid, 'system', { TotPrice: r.TotPrice, expected: row.price });
        return redirectTop(done + '&fail=1', '결제 금액이 일치하지 않아 승인을 취소했습니다.');
      }
      if (!paidOk) {
        await env.DB.prepare("UPDATE orders SET status = 'failed', result_msg = ?, updated_at = ? WHERE oid = ?").bind(((r && r.resultCode) || '') + ' ' + ((r && r.resultMsg) || ''), now(), oid).run();
        await log(env, 'order.failed', oid, 'inicis', r || {});
        return redirectTop(done + '&fail=1', '결제가 승인되지 않았습니다.');
      }
      // ---- 승인 완료: 주문 저장, 이용권이면 예약 등록 + 달력 마감 ----
      const t = now(), data = safe(row.data), applAt = (r.applDate && r.applTime) ? `${r.applDate.slice(0, 4)}-${r.applDate.slice(4, 6)}-${r.applDate.slice(6, 8)} ${r.applTime.slice(0, 2)}:${r.applTime.slice(2, 4)}:${r.applTime.slice(4, 6)}` : t;
      let bookingCode = null;
      if (row.event_date && data.slot) {
        const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', rb = crypto.getRandomValues(new Uint8Array(4)); let rnd = ''; for (const x of rb) rnd += A[x % A.length];
        const d = new Date(); bookingCode = `MS-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${rnd}`;
        const clash = await env.DB.prepare("SELECT 1 AS x FROM bookings WHERE space_id = 'megaspot-gundae' AND date = ? AND status = 'confirmed'").bind(row.event_date).first();
        const memo = `온라인 결제 ${oid} · ${PRODUCTS.get(row.product_id).name}` + (data.memo ? ` · ${data.memo}` : '') + (clash ? ' · ※ 같은 날짜에 다른 예약이 있어 확인 필요' : '');
        await env.DB.prepare('INSERT INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, memo, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(bookingCode, 'megaspot-gundae', row.inquiry_ref || null, row.buyer_name, row.buyer_phone, row.buyer_phone.slice(-4), row.event_date, data.slot, row.people, memo.slice(0, 2000), 'confirmed', t).run();
        await env.DB.prepare("INSERT INTO calendar_blocks (space_id, date, state, memo) VALUES ('megaspot-gundae', ?, 'full', ?) ON CONFLICT(space_id, date) DO UPDATE SET state = 'full', memo = excluded.memo").bind(row.event_date, '예약 ' + bookingCode).run();
        if (row.inquiry_ref) await env.DB.prepare("UPDATE inquiries SET status = '예약 확정', updated_at = ? WHERE ref = ?").bind(t, row.inquiry_ref).run();
      }
      await env.DB.prepare("UPDATE orders SET status = 'paid', tid = ?, pay_method = ?, appl_at = ?, result_msg = ?, booking_code = ?, paid_at = ?, updated_at = ? WHERE oid = ?")
        .bind(str(r.tid, 60), str(r.payMethod, 20), applAt, '승인 완료', bookingCode, t, t, oid).run();
      await log(env, 'order.paid', oid, 'inicis', { tid: r.tid, payMethod: r.payMethod, TotPrice: r.TotPrice, booking: bookingCode });
      return redirectTop(done, '결제가 완료되었습니다.');
    }

    // ---- 주문 조회 ----
    const mO = path.match(/^orders\/([A-Z0-9-]+)$/);
    if (mO && method === 'GET') {
      const row = await env.DB.prepare('SELECT oid, product_id, title, event_date, people, price, buyer_name, buyer_phone, buyer_email, data, status, pay_method, tid, appl_at, result_msg, booking_code, test, created_at FROM orders WHERE oid = ?').bind(mO[1]).first();
      if (!row) return err('주문을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const data = safe(row.data);
      return json({ ok: true, order: { oid: row.oid, product_id: row.product_id, title: row.title, event_date: row.event_date, people: row.people, price: row.price, status: row.status,
        buyer_name: row.buyer_name.slice(0, 1) + '*'.repeat(Math.max(1, row.buyer_name.length - 1)), buyer_phone: row.buyer_phone.replace(/(\d{3})\d{3,4}(\d{4})/, '$1-****-$2'), buyer_email: row.buyer_email ? row.buyer_email.replace(/^(.).*(@.*)$/, '$1***$2') : '',
        lines: data.lines || [], pay_method: row.pay_method, tid: row.tid ? row.tid.slice(-8) : '', appl_at: row.appl_at, result_msg: row.result_msg, booking_code: row.booking_code, test: !!row.test, created_at: row.created_at } });
    }
    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) { return err('처리 중 오류가 발생했습니다. (' + (e.message || '') + ')', 500, 'SERVER_ERROR'); }
}
function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
