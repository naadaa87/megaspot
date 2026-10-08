// 달력 상태 조회 — 운영자가 등록한 마감/임시 확보 날짜
import { json, err, hasDb, str, isDate } from './_lib.js';
export async function onRequestGet({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const url = new URL(request.url);
  const space = str(url.searchParams.get('space'), 60) || 'megaspot-gundae';
  const from = str(url.searchParams.get('from'), 10), to = str(url.searchParams.get('to'), 10);
  if (!isDate(from) || !isDate(to)) return err('기간을 확인해 주세요.');
  try {
    const { results } = await env.DB.prepare('SELECT date, state FROM calendar_blocks WHERE space_id = ? AND date BETWEEN ? AND ?').bind(space, from, to).all();
    const days = {}; (results || []).forEach(r => { days[r.date] = { state: r.state }; });
    return json({ ok: true, space, days }, 200, { 'cache-control': 'public, max-age=60' });
  } catch (e) { return err('일정을 불러오지 못했습니다.', 500, 'DB_ERROR'); }
}
