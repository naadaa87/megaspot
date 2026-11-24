// 나의 예약확인 API (2026-11-24) — 읽기 전용
//   POST /api/my-booking/lookup  { booking_code, phone_last4 }   → 예약 화면 내용 + 다시 열 열쇠(c, k)
//   GET  /api/my-booking/view?c=예약번호&k=열쇠                  → 예약 화면 내용
//   GET  /api/my-booking/mine                                     → 로그인한 회원의 예약 목록
// 같은 IP에서 예약번호 맞추기를 막기 위해 lookup 은 10분에 10번, view 는 10분에 60번까지 받습니다.
import { json, err, hasDb, readJson, str, clientIp, tooMany, hit, getMember } from '../_lib.js';
import { respondView, memberBookings, keyOk, validCode, NO_STORE } from '../_my_booking.js';

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('예약 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.', 503, 'NO_DB');
  const path = (params.path || []).join('/'), method = request.method.toUpperCase(), url = new URL(request.url);
  try {
    if (path === 'lookup' && method === 'POST') {
      let d; try { d = await readJson(request, 2048); } catch (e) { return err(e.message); }
      const code = str(d.booking_code, 20).toUpperCase().replace(/\s+/g, ''), last4 = str(d.phone_last4, 8).replace(/\D/g, '');
      if (!validCode(code) || last4.length !== 4) return err('예약번호와 휴대폰 뒷 4자리를 확인해 주세요.');
      const ipKey = 'myb:' + clientIp(request);
      if (await tooMany(env, ipKey, 10, 10)) return err('짧은 시간에 너무 많은 시도가 있었습니다. 10분 뒤 다시 시도해 주세요.', 429, 'TOO_MANY');
      await hit(env, ipKey, 10);
      const row = await env.DB.prepare('SELECT booking_code, phone_last4 FROM bookings WHERE booking_code = ?').bind(code).first();
      if (!row || row.phone_last4 !== last4) return err('예약 정보를 찾을 수 없습니다. 예약번호와 예약자 휴대폰 뒷 4자리를 확인해 주세요.', 404, 'NOT_FOUND');
      return respondView(env, row.booking_code);
    }
    if (path === 'view' && method === 'GET') {
      const c = str(url.searchParams.get('c'), 20).toUpperCase(), k = str(url.searchParams.get('k'), 64);
      const ipKey = 'mybv:' + clientIp(request);
      if (await tooMany(env, ipKey, 60, 10)) return err('짧은 시간에 너무 많은 요청이 있었습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
      if (!(await keyOk(env, c, k))) { await hit(env, ipKey, 10); return err('예약 확인 주소가 올바르지 않습니다. 예약번호와 휴대폰 뒷자리로 다시 찾아 주세요.', 403, 'BAD_KEY'); }
      return respondView(env, c);
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
