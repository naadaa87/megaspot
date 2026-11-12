// 공개 중인 입점 공간 주소 목록 — robots.txt 에 Sitemap 으로 함께 적어 둡니다 (정적 sitemap.xml 은 그대로 둡니다)
import { hasDb, kstToday } from '../api/_lib.js';
import { visibleSql } from '../api/_hostplat.js';
export async function onRequestGet({ env }) {
  let rows = [];
  try { if (hasDb(env)) { const t = kstToday(); rows = (await env.DB.prepare(`SELECT s.ref, s.updated_at, s.approved_at FROM host_spaces s WHERE ${visibleSql()} ORDER BY s.id LIMIT 5000`).bind(t, t).all()).results || []; } } catch (e) { rows = []; }
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + rows.map(r => `  <url><loc>https://megaspot.kr/spaces/view/?id=${r.ref}</loc><lastmod>${String(r.updated_at || r.approved_at || kstToday()).slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join('\n')
    + '\n</urlset>\n';
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
