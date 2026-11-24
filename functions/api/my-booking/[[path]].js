// 나의 예약확인 API (2026-11-24) — 읽기 전용
//   POST /api/my-booking/lookup  { date, phone_last4 } 또는 { booking_code, phone_last4 } → 예약 화면 내용 + 다시 열 열쇠(c, k)
//                                 (같은 날 같은 뒷자리 예약이 여럿이면 { choose: [...] } 로 고르게 합니다)
//   GET  /api/my-booking/view?c=예약번호&k=열쇠                  → 예약 화면 내용
//   GET  /api/my-booking/mine                                     → 로그인한 회원의 예약 목록
//   POST /api/my-booking/proof   { c, k, kind, biz_no, company, ceo, email, cash_no, note } → 증빙 요청 (2026-11-25)
// 같은 IP에서 예약번호 맞추기를 막기 위해 lookup 은 10분에 10번, view 는 10분에 60번까지 받습니다.
import { json, err, hasDb, readJson, str, isDate, clientIp, tooMany, hit, getMember } from '../_lib.js';
import { respondView, memberBookings, keyOk, validCode, findByDate, chooseList, NO_STORE } from '../_my_booking.js';
import { createProof } from '../_proof_requests.js';

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('예약 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.', 503, 'NO_DB');
  const path = (params.path || []).join('/'), method = request.method.toUpperCase(), url = new URL(request.url);
  try {
    if (path === 'lookup' && method === 'POST') {
      let d; try { d = await readJson(request, 2048); } catch (e) { return err(e.message); }
      const code = str(d.booking_code, 20).toUpperCase().replace(/\s+/g, ''), last4 = str(d.phone_last4, 8).replace(/\D/g, ''), date = str(d.date, 10);
      // 두 가지로 찾습니다: ① 이용일 + 휴대폰 뒷 4자리(기본) ② 예약번호 + 휴대폰 뒷 4자리
      if (last4.length !== 4 || (!validCode(code) && !isDate(date))) return err(code ? '예약번호와 휴대폰 뒷 4자리를 확인해 주세요.' : '이용일과 휴대폰 뒷 4자리를 확인해 주세요.');
      const ipKey = 'myb:' + clientIp(request);
      if (await tooMany(env, ipKey, 10, 10)) return err('짧은 시간에 너무 많은 시도가 있었습니다. 10분 뒤 다시 시도해 주세요.', 429, 'TOO_MANY');
      await hit(env, ipKey, 10);
      if (validCode(code)) {
        const row = await env.DB.prepare('SELECT booking_code, phone_last4 FROM bookings WHERE booking_code = ?').bind(code).first();
        if (!row || row.phone_last4 !== last4) return err('예약 정보를 찾을 수 없습니다. 예약번호와 예약자 휴대폰 뒷 4자리를 확인해 주세요.', 404, 'NOT_FOUND');
        return respondView(env, row.booking_code);
      }
      // 이용일로 찾을 때는 날짜 하나에 여러 곳에서 틀린 시도가 몰리면 그 날짜만 1시간 쉬어 갑니다 (예약번호로는 계속 찾을 수 있음)
      const dayKey = 'mybd:' + date;
      if (await tooMany(env, dayKey, 30, 60)) return err('이 날짜로 확인하려는 시도가 많아 잠시 막아 두었습니다. 예약번호로 찾거나 카카오톡으로 문의해 주세요.', 429, 'DATE_LOCKED');
      const rows = await findByDate(env, date, last4);
      if (!rows.length) { await hit(env, dayKey, 60); return err('이 이용일에 해당 휴대폰 뒷 4자리로 된 예약을 찾지 못했습니다. 이용일과 예약자 휴대폰 뒷 4자리를 다시 확인해 주세요.', 404, 'NOT_FOUND'); }
      if (rows.length === 1) return respondView(env, rows[0].booking_code);
      return json({ ok: true, choose: await chooseList(env, rows) }, 200, NO_STORE);
    }
    if (path === 'view' && method === 'GET') {
      const c = str(url.searchParams.get('c'), 20).toUpperCase(), k = str(url.searchParams.get('k'), 64);
      const ipKey = 'mybv:' + clientIp(request);
      if (await tooMany(env, ipKey, 60, 10)) return err('짧은 시간에 너무 많은 요청이 있었습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
      if (!(await keyOk(env, c, k))) { await hit(env, ipKey, 10); return err('예약 확인 주소가 올바르지 않습니다. 예약번호와 휴대폰 뒷자리로 다시 찾아 주세요.', 403, 'BAD_KEY'); }
      return respondView(env, c);
    }
    if (path === 'proof' && method === 'POST') {
      let d; try { d = await readJson(request, 4096); } catch (e) { return err(e.message); }
      const c = str(d.c, 20).toUpperCase(), k = str(d.k, 64), ipKey = 'mybp:' + clientIp(request);
      if (await tooMany(env, ipKey, 10, 10)) return err('짧은 시간에 요청이 많았습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
      await hit(env, ipKey, 10);
      if (!(await keyOk(env, c, k))) return err('예약 확인 주소가 올바르지 않습니다. 다시 찾아 주세요.', 403, 'BAD_KEY');
      const b = await env.DB.prepare('SELECT status FROM bookings WHERE booking_code = ?').bind(c).first();
      if (!b || !['confirmed', 'completed'].includes(b.status)) return err('확정되었거나 이용을 마친 예약만 증빙을 요청할 수 있습니다.', 409, 'STATE');
      const r = await createProof(env, c, d);
      return r.error ? err(r.error) : json({ ok: true, proofs: r.items }, 200, NO_STORE);
    }
    if (path === 'mine' && method === 'GET') {
      const me = await getMember(request, env);
      if (!me) return json({ ok: true, login: false, items: [] }, 200, NO_STORE);
      return json({ ok: true, login: true, name: me.name || '', items: await memberBookings(env, me.id) }, 200, NO_STORE);
    }
    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) {
    console.error('my-booking', e && e.message);
    return err('예약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500, 'MY_BOOKING_ERROR');
  }
}
