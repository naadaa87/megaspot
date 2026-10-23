// 배너 광고 — 화면의 광고 자리([data-ad-slot])가 게재 중인 배너를 받아 갑니다.
//  GET  /api/ads/list?slots=home-mid,list-top   자리별 게재 중 배너 (우선순위 높은 순, 같으면 무작위)
//  POST /api/ads/imp  { ids:[…] }                 노출 수 기록
//  GET  /api/ads/go/12                            클릭 수 기록 후 관리자가 저장한 주소로 이동
import { json, err, hasDb, readJson, str, num, kstToday, clientIp, tooMany, hit } from '../_lib.js';
import { AD_SLOTS, AD_ACTIVE, publicAd } from '../_platform.js';

export async function onRequest({ request, env, params }) {
  const parts = params.path || [], method = request.method.toUpperCase(), url = new URL(request.url);
  if (parts[0] === 'go' && method === 'GET') {
    const id = num(parts[1]);
    if (!hasDb(env) || !id) return Response.redirect(new URL('/', url).href, 302);
    try {
      const today = kstToday();
      const row = await env.DB.prepare(`SELECT id, link FROM ads WHERE id = ? AND ${AD_ACTIVE}`).bind(id, today, today).first();
      if (!row) return Response.redirect(new URL('/', url).href, 302);
      try { await env.DB.prepare('UPDATE ads SET clicks = clicks + 1 WHERE id = ?').bind(id).run(); } catch {}
      // 주소는 관리자가 저장할 때 https:// 또는 /경로 만 받았습니다
      return new Response(null, { status: 302, headers: { location: new URL(row.link, url).href, 'cache-control': 'no-store', 'referrer-policy': 'strict-origin-when-cross-origin' } });
    } catch { return Response.redirect(new URL('/', url).href, 302); }
  }
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  try {
    if (parts[0] === 'list' && method === 'GET') {
      const slots = String(url.searchParams.get('slots') || '').split(',').map(s => str(s, 30)).filter(s => Object.prototype.hasOwnProperty.call(AD_SLOTS, s)).slice(0, 6);
      if (!slots.length) return json({ ok: true, items: [] });
      const today = kstToday();
      const { results } = await env.DB.prepare(`SELECT id, slot, kind, title, advertiser, link, data FROM ads WHERE slot IN (${slots.map(() => '?').join(',')}) AND ${AD_ACTIVE} ORDER BY priority DESC, RANDOM() LIMIT 30`).bind(...slots, today, today).all();
      return json({ ok: true, items: (results || []).map(publicAd) }, 200, { 'cache-control': 'public, max-age=60' });
    }
    if (parts[0] === 'imp' && method === 'POST') {
      let d; try { d = await readJson(request, 2048); } catch (e) { return err(e.message); }
      const ids = [...new Set((Array.isArray(d.ids) ? d.ids : []).map(num).filter(n => n && n > 0))].slice(0, 8);
      if (!ids.length) return json({ ok: true });
      const key = 'adimp:' + clientIp(request);
      try { if (await tooMany(env, key, 150, 10)) return json({ ok: true, skipped: true }); await hit(env, key, 10); } catch {}
      await env.DB.prepare(`UPDATE ads SET imps = imps + 1 WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
      return json({ ok: true });
    }
    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) { console.error('ads', e && e.message); return err('처리 중 오류가 발생했습니다.', 500, 'SERVER_ERROR'); }
}
