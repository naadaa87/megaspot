// 고객용 예약확정서 조회 — /confirm/ 화면이 씁니다.
// GET  /api/confirm?c=예약번호&k=링크토큰       → 관리자가 보낸 링크로 바로 열기
// POST /api/confirm { booking_code, phone_last4 } → 예약번호와 휴대폰 뒷 4자리로 열기 (같은 IP 10분에 10번까지)
import { json, err, hasDb, readJson, str, clientIp, tooMany, hit } from './_lib.js';
import { confirmToken, tokenEq, parseDoc, publicDoc } from './_confirm.js';

const COLS = 'booking_code, space_id, customer_name, phone, phone_last4, date, slot, headcount, status, start_h, end_h, confirm_doc';
async function answer(env, row) {
  const doc = parseDoc(row.confirm_doc);
  if (row.status === 'cancelled') return err('취소된 예약입니다. 자세한 내용은 메가스팟으로 문의해 주세요.', 410, 'CANCELLED');
  if (!doc || !doc.issued_at) return err('아직 예약확정서가 발급되지 않았습니다. 메가스팟에 요청하시면 바로 보내 드립니다.', 404, 'NOT_ISSUED');
  return json({ ok: true, doc: publicDoc(row, doc), k: await confirmToken(env, row.booking_code) }, 200, { 'cache-control': 'no-store' });
}
export async function onRequestGet({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const url = new URL(request.url);
  const code = str(url.searchParams.get('c'), 20).toUpperCase(), k = str(url.searchParams.get('k'), 40);
  if (!code || !k) return err('확정서 주소를 다시 확인해 주세요.', 400, 'BAD_LINK');
  const ipKey = 'cfm:' + clientIp(request);
  try { if (await tooMany(env, ipKey, 30, 10)) return err('짧은 시간에 너무 많은 요청이 있었습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY'); } catch {}
  if (!tokenEq(k, await confirmToken(env, code))) { try { await hit(env, ipKey, 10); } catch {} return err('확정서 주소가 올바르지 않습니다. 예약번호와 휴대폰 뒷자리로 조회해 주세요.', 403, 'BAD_TOKEN'); }
  const row = await env.DB.prepare(`SELECT ${COLS} FROM bookings WHERE booking_code = ?`).bind(code).first();
  if (!row) return err('예약 정보를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  return answer(env, row);
}
export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
  const code = str(d.booking_code, 20).toUpperCase(), last4 = str(d.phone_last4, 4).replace(/\D/g, '');
  if (!code || last4.length !== 4) return err('예약번호와 휴대폰 뒷 4자리를 확인해 주세요.');
  const ipKey = 'cfm:' + clientIp(request);
  try { if (await tooMany(env, ipKey, 10, 10)) return err('짧은 시간에 너무 많은 시도가 있었습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY'); await hit(env, ipKey, 10); } catch {}
  const row = await env.DB.prepare(`SELECT ${COLS} FROM bookings WHERE booking_code = ?`).bind(code).first();
  if (!row || row.phone_last4 !== last4) return err('예약 정보를 찾을 수 없습니다. 예약번호와 휴대폰 뒷자리를 확인해 주세요.', 404, 'NOT_FOUND');
  return answer(env, row);
}
