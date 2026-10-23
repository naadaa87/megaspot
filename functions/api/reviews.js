// 이용 확인 후기 — 조회(게시 승인분) / 작성(예약번호 검증 후 승인 대기)
import { json, err, hasDb, readJson, str, num, now, log, clientIp, tooMany, hit, spaceOk } from './_lib.js';
export async function onRequestGet({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const url = new URL(request.url); const space = spaceOk(url.searchParams.get('space'));
  try {
    const { results } = await env.DB.prepare("SELECT id, author, rating, title, body, event_type, headcount, reply, substr(created_at,1,10) AS created_at, (SELECT substr(b.date,1,7) FROM bookings b WHERE b.booking_code = r.booking_code) AS used_at FROM reviews r WHERE space_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 100").bind(space).all();
    return json({ ok: true, reviews: results || [] }, 200, { 'cache-control': 'public, max-age=60' });
  } catch (e) { return err('후기를 불러오지 못했습니다.', 500, 'DB_ERROR'); }
}
export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
  const code = str(d.booking_code, 20).toUpperCase(), last4 = str(d.phone_last4, 4).replace(/\D/g, '');
  const rating = num(d.rating), title = str(d.title, 60), body = str(d.body, 1500), author = str(d.author, 40);
  const space_id = spaceOk(d.space_id);
  if (!code || last4.length !== 4) return err('예약번호와 휴대폰 뒷 4자리를 확인해 주세요.');
  // 예약번호+뒷자리 맞추기 시도를 막기 위해 같은 IP는 10분에 10번까지만 받습니다
  const ipKey = 'rev:' + clientIp(request);
  try { if (await tooMany(env, ipKey, 10, 10)) return err('짧은 시간에 너무 많은 시도가 있었습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY'); await hit(env, ipKey, 10); } catch {}
  if (!rating || rating < 1 || rating > 5 || !title || !body || !author) return err('필수 항목을 확인해 주세요.');
  if (!d.agree) return err('게시 기준 동의가 필요합니다.');
  try {
    const bk = await env.DB.prepare('SELECT booking_code, phone_last4, status, space_id FROM bookings WHERE booking_code = ?').bind(code).first();
    if (!bk || bk.phone_last4 !== last4) return err('예약 정보를 찾을 수 없습니다. 예약번호와 휴대폰 뒷자리를 확인해 주세요.', 404, 'NOT_FOUND');
    if (bk.status !== 'completed') return err('이용이 완료된 예약만 후기를 작성할 수 있습니다. 이용 후 운영팀이 완료 처리하면 작성이 가능합니다.', 403, 'NOT_COMPLETED');
    const dup = await env.DB.prepare('SELECT 1 AS x FROM reviews WHERE booking_code = ?').bind(code).first();
    if (dup) return err('이 예약에는 이미 후기가 등록되어 있습니다.', 409, 'DUPLICATE');
    await env.DB.prepare('INSERT INTO reviews (space_id, booking_code, author, rating, title, body, event_type, headcount, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(bk.space_id || space_id, code, author, rating, title, body, str(d.event_type, 40), num(d.headcount), 'pending', now()).run();
    await log(env, 'review.created', code, 'customer', { rating });
    return json({ ok: true });
  } catch (e) { console.error('review', e && e.message); return err('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'DB_ERROR'); }
}
