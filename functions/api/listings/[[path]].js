// 등록 공간 (외부 호스트 공간 · 문의형) — 관리자가 '공개'로 바꾼 공간만 보입니다.
//  GET /api/listings/list        공개 공간 목록
//  GET /api/listings/L-2610-AB12 공개 공간 상세
// 이 공간에 대한 문의는 /api/inquiry 로 받습니다 (space_id 'request' + listing 정보).
import { json, err, hasDb, str } from '../_lib.js';
import { LISTING_REF, publicListing } from '../_platform.js';

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  if (request.method.toUpperCase() !== 'GET') return err('허용되지 않은 요청입니다.', 405, 'METHOD');
  const parts = params.path || [];
  try {
    if (parts[0] === 'list') {
      const { results } = await env.DB.prepare("SELECT slug, status, name, region, address, area, capacity, data FROM listings WHERE status = 'published' ORDER BY sort DESC, capacity DESC LIMIT 100").all();
      return json({ ok: true, items: (results || []).map(publicListing) }, 200, { 'cache-control': 'public, max-age=60' });
    }
    const slug = str(parts[0], 20).toUpperCase();
    if (!LISTING_REF.test(slug)) return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    const row = await env.DB.prepare("SELECT slug, status, name, region, address, area, capacity, data FROM listings WHERE slug = ? AND status = 'published'").bind(slug).first();
    if (!row) return err('공간을 찾을 수 없거나 아직 공개되지 않았습니다.', 404, 'NOT_FOUND');
    return json({ ok: true, item: publicListing(row) });
  } catch (e) { console.error('listings', e && e.message); return err('처리 중 오류가 발생했습니다.', 500, 'SERVER_ERROR'); }
}
