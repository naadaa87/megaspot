// 입점 공간 상세(/spaces/view/?id=SP-…) — 검색엔진·메신저 미리보기를 위해 제목·설명·대표 사진을 서버에서 채워 넣습니다.
// 화면은 정적 페이지와 assets/js/pages/venue.js 가 그리고, 여기서는 <head> 만 바꿉니다. 실패하면 정적 페이지를 그대로 내보냅니다.
import { hasDb, kstToday } from '../../api/_lib.js';
import { safeJson } from '../../api/_platform.js';
import { SPACE_REF, REGION_LABEL, TYPE_LABEL, visibleSql, safeArr, shortAddress, photoUrl, priceFromLabel } from '../../api/_hostplat.js';

const SITE = 'https://megaspot.kr';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function venueHead(html, row, cover) {
  const d = safeJson(row.data), types = safeArr(row.types).map(t => TYPE_LABEL[t] || t), url = `${SITE}/spaces/view/?id=${row.ref}`;
  const title = `${row.name} | ${[REGION_LABEL[row.region], row.capacity ? '최대 ' + row.capacity + '명' : '', row.area ? row.area + '평' : ''].filter(Boolean).join(' · ')} — 메가스팟`;
  const basis = { hourly: '시간당 ', daily: '하루 ', package: '패키지 ' }[priceFromLabel(d.price || {})] || '';
  const desc = [d.summary || '', [shortAddress(row.address), d.station].filter(Boolean).join(' · '), types.slice(0, 5).join('·'), row.price_from ? basis + Number(row.price_from).toLocaleString('ko-KR') + '원부터' : '견적 문의',
    '메가스팟에서 날짜와 인원을 넣어 예상 금액을 확인하고 예약을 요청하세요. 결제 수수료 없음.'].filter(Boolean).join(' · ').slice(0, 300);
  const image = cover ? SITE + photoUrl(cover) : `${SITE}/assets/img/brand/og-megaspot.jpg`;
  const ld = { '@context': 'https://schema.org', '@type': 'EventVenue', name: row.name, url, description: d.summary || d.intro || '', image, address: { '@type': 'PostalAddress', streetAddress: row.address || '', addressCountry: 'KR' },
    ...(row.capacity ? { maximumAttendeeCapacity: row.capacity } : {}) };
  const set = (h, re, v) => h.replace(re, v);
  let out = html;
  out = set(out, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  out = set(out, /(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
  out = set(out, /(<meta name="robots" content=")[^"]*(")/, '$1index,follow,max-image-preview:large,max-snippet:-1$2');
  out = set(out, /(<link rel="canonical" href=")[^"]*(")/, `$1${esc(url)}$2`);
  out = set(out, /(<meta property="og:title" content=")[^"]*(")/, `$1${esc(row.name)}$2`);
  out = set(out, /(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
  out = set(out, /(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`);
  out = set(out, /(<meta property="og:image" content=")[^"]*(")/, `$1${esc(image)}$2`);
  out = set(out, /(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(row.name)}$2`);
  out = set(out, /(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
  if (cover) out = out.replace(/<meta property="og:image:width" content="[^"]*">\s*<meta property="og:image:height" content="[^"]*">\s*/, '');
  return out.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
}
export async function onRequestGet(context) {
  const { request, env } = context;
  const page = await (typeof context.next === 'function' ? context.next() : env.ASSETS.fetch(request));
  try {
    const ref = (new URL(request.url).searchParams.get('id') || '').toUpperCase();
    if (!SPACE_REF.test(ref) || !hasDb(env) || page.status !== 200 || !(page.headers.get('content-type') || '').includes('text/html')) return page;
    const today = kstToday();
    const row = await env.DB.prepare(`SELECT s.*, (SELECT p.pid FROM host_photos p WHERE p.space_ref = s.ref ORDER BY p.sort, p.id LIMIT 1) AS cover FROM host_spaces s WHERE s.ref = ? AND ${visibleSql()}`).bind(ref, today, today).first();
    if (!row) return page;
    const headers = new Headers(page.headers); headers.delete('content-length'); headers.delete('etag'); headers.set('cache-control', 'public, max-age=300');
    return new Response(venueHead(await page.clone().text(), row, row.cover), { status: 200, headers });
  } catch (e) { console.error('venue head', e && e.message); return page; }
}
