// 달력 상태 조회 — 운영자가 등록한 마감/임시 확보 날짜 + 확정 예약이 있는 날(일부 시간 예약)
import { json, err, hasDb, str, isDate, spaceOk } from './_lib.js';
export async function onRequestGet({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const url = new URL(request.url);
  const space = spaceOk(url.searchParams.get('space'));
  const from = str(url.searchParams.get('from'), 10), to = str(url.searchParams.get('to'), 10);
  if (!isDate(from) || !isDate(to)) return err('기간을 확인해 주세요.');
  try {
    const { results } = await env.DB.prepare('SELECT date, state FROM calendar_blocks WHERE space_id = ? AND date BETWEEN ? AND ?').bind(space, from, to).all();
    const days = {}; (results || []).forEach(r => { days[r.date] = { state: r.state }; });
    // 확정 예약이 있는 날은 '일부 시간 예약'으로 알려 줍니다. 시간대가 다르면 같은 날 여러 팀을 받을 수 있어 마감으로 막지 않습니다.
    // (하루 전체를 닫으려면 관리자 일정 달력에서 '마감'으로 표시합니다)
    const { results: bks } = await env.DB.prepare("SELECT date FROM bookings WHERE space_id = ? AND status = 'confirmed' AND date BETWEEN ? AND ?").bind(space, from, to).all();
    (bks || []).forEach(b => { if (!days[b.date]) days[b.date] = { state: 'partial' }; });
    return json({ ok: true, space, days }, 200, { 'cache-control': 'public, max-age=60' });
  } catch (e) { return err('일정을 불러오지 못했습니다.', 500, 'DB_ERROR'); }
}
