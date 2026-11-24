// 행사 사례 화면을 서버에서 채웁니다 (2026-11-25 · S6)
//  · /cases/       공개 사례가 1건 이상이면 목록 카드를 HTML 에 넣고 검색 허용으로 바꿉니다. 없으면 정적 화면(검색 제외) 그대로.
//  · /cases/view/  공개 사례면 제목·설명·주소·H1·본문과 Article 구조화 데이터를 채웁니다.
//  · 카드·본문 모양은 assets/js/pages/cases.js 와 같게 맞춥니다.
import { hasDb, kstToday } from './_lib.js';
import { listPublicCases, getPublicCase, CASE_REF } from './_event_cases.js';
import { applyHead, clip, fitTitle, DESC_MAX } from './_view_heads.js';
import { POSTAL_ADDRESS } from './_site_info.js';

const SITE = 'https://megaspot.kr', OG_DEFAULT = SITE + '/assets/img/brand/og-megaspot.jpg';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ym = m => { const x = /^(\d{4})-(\d{2})$/.exec(m || ''); return x ? `${x[1]}년 ${+x[2]}월` : ''; };
const SHORT = { 'megaspot-gundae': '건대 1호', 'megaspot-gundae-2': '건대 2호', both: '건대 1호·2호' };
const abs = u => /^https:\/\//.test(u) ? u : SITE + u;
export const caseMeta = c => [ym(c.month), c.headcount ? c.headcount + '명' : '', c.layout].filter(Boolean).join(' · ');
export function caseCard(c) {
  const ph = c.photos && c.photos[0];
  return `<a class="cs-card" href="/cases/view/?id=${esc(c.ref)}" data-space="${esc(c.space_id)}">`
    + (ph ? `<div class="cs-ph"><img src="${esc(ph.src)}" alt="${esc(ph.alt || c.title)}" loading="lazy" decoding="async"></div>` : `<div class="cs-ph cs-noimg"><span>${esc(c.purpose_label || '행사 사례')}</span></div>`)
    + `<div class="cs-bd"><div class="cs-tags">${c.purpose_label ? `<span class="badge badge-cobalt">${esc(c.purpose_label)}</span>` : ''}<span class="badge badge-soft">${esc(SHORT[c.space_id] || '')}</span></div>`
    + `<h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><div class="cs-meta">${esc(caseMeta(c))}</div></div></a>`;
}
const SERVICE_LINK = { catering: '/catering/', cocktail: '/cocktail/', reception: '/reception/', parking: '/parking/', invite: '/kit/' };
export function caseBody(c) {
  const para = s => esc(s).replace(/\r?\n/g, '<br>');
  const spaceHref = c.space_id === 'megaspot-gundae-2' ? '/spaces/megaspot-gundae-2/' : '/spaces/megaspot-gundae/';
  const q = new URLSearchParams(); if (c.space_id && c.space_id !== 'both') q.set('space', c.space_id); if (c.headcount) q.set('people', c.headcount);
  return `<article class="cs-article"><header class="cs-head"><div class="cs-tags">${c.purpose_label ? `<span class="badge badge-cobalt">${esc(c.purpose_label)}</span>` : ''}<span class="badge badge-soft">${esc(SHORT[c.space_id] || '')}</span></div>`
    + `<h1 class="h-l mt-1">${esc(c.title)}</h1><p class="lead mt-1">${esc(c.summary)}</p></header>`
    + `<dl class="def cs-facts"><div><dt>공간</dt><dd><a href="${spaceHref}">${esc(c.space_label)}</a></dd></div>${c.month ? `<div><dt>시기</dt><dd>${esc(ym(c.month))}</dd></div>` : ''}${c.headcount ? `<div><dt>인원</dt><dd>${esc(c.headcount)}명</dd></div>` : ''}${c.layout ? `<div><dt>배치</dt><dd>${esc(c.layout)}</dd></div>` : ''}${c.services && c.services.length ? `<div><dt>함께 쓴 서비스</dt><dd>${c.services.map(s => SERVICE_LINK[s.id] ? `<a href="${SERVICE_LINK[s.id]}">${esc(s.label)}</a>` : esc(s.label)).join(' · ')}</dd></div>` : ''}</dl>`
    + (c.photos && c.photos.length ? `<div class="cs-photos">${c.photos.map((p, i) => `<figure><img src="${esc(p.src)}" alt="${esc(p.alt || c.title + ' 사진 ' + (i + 1))}" loading="${i ? 'lazy' : 'eager'}" decoding="async">${p.alt ? `<figcaption>${esc(p.alt)}</figcaption>` : ''}</figure>`).join('')}</div>` : '')
    + `<div class="cs-text">${para(c.body)}</div>`
    + (c.quote ? `<blockquote class="cs-quote"><p>${para(c.quote)}</p>${c.org_label ? `<cite>${esc(c.org_label)}</cite>` : ''}</blockquote>` : (c.org_label ? `<p class="small muted">주최 · ${esc(c.org_label)}</p>` : ''))
    + `<p class="small muted cs-consent">주최 측 동의를 받아 소개하는 사례입니다.</p>`
    + `<div class="row mt-3 cs-cta" style="gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="/inquiry/?${q}">비슷한 행사 견적 문의</a><a class="btn btn-light" href="/visit/${c.space_id && c.space_id !== 'both' ? '?space=' + esc(c.space_id) : ''}">사전답사 신청</a><a class="btn btn-light" href="/cases/">다른 사례 보기</a></div></article>`;
}

export async function serveCaseList(context) {
  const { request, env } = context;
  const page = await (typeof context.next === 'function' ? context.next() : env.ASSETS.fetch(request));
  try {
    if (!hasDb(env) || page.status !== 200 || !(page.headers.get('content-type') || '').includes('text/html')) return page;
    const items = await listPublicCases(env); if (!items.length) return page;
    let html = await page.clone().text();
    html = html.replace(/(<meta name="robots" content=")[^"]*(")/, '$1index,follow,max-image-preview:large,max-snippet:-1$2')
      .replace(/<!--cases:list-->[\s\S]*?<!--\/cases:list-->/, `<!--cases:list-->${items.map(caseCard).join('')}<!--/cases:list-->`);
    const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: '메가스팟 행사 사례', numberOfItems: items.length, itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, url: `${SITE}/cases/view/?id=${c.ref}` })) };
    html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
    const headers = new Headers(page.headers); headers.delete('content-length'); headers.delete('etag'); headers.set('cache-control', 'public, max-age=120');
    return new Response(html, { status: 200, headers });
  } catch (e) { console.error('cases list', e && e.message); return page; }
}
export function caseHead(html, c) {
  const url = `${SITE}/cases/view/?id=${c.ref}`, image = c.photos && c.photos[0] ? abs(c.photos[0].src) : OG_DEFAULT;
  const title = fitTitle(c.title, ' | 행사 사례 | 메가스팟');
  const desc = clip([c.summary, caseMeta(c), c.space_label].filter(Boolean).join(' · '), DESC_MAX);
  const main = { '@type': 'Article', '@id': url + '#article', headline: clip(c.title, 110), description: c.summary, url, image: (c.photos || []).map(p => abs(p.src)).slice(0, 5).concat((c.photos || []).length ? [] : [OG_DEFAULT]),
    ...(c.published_at ? { datePublished: String(c.published_at).slice(0, 10) } : {}), author: { '@type': 'Organization', '@id': SITE + '/#org', name: '메가스팟 MEGASPOT' }, publisher: { '@id': SITE + '/#org' },
    about: { '@type': 'EventVenue', name: c.space_label, address: POSTAL_ADDRESS } };
  const h = { title, desc, url, image, ogTitle: c.title, crumb: c.title, body: caseBody(c), slot: /(<div id="cs-view">)<div class="empty small">[^<]*<\/div>/ };
  h.ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': url + '#webpage', url, name: title, description: desc, inLanguage: 'ko', isPartOf: { '@id': SITE + '/#website' } },
    { '@type': 'BreadcrumbList', itemListElement: [['홈', SITE + '/'], ['행사 사례', SITE + '/cases/'], [c.title]].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(item ? { item } : {}) })) }, main] };
  // applyHead 는 '…/view/#webpage' 로 시작하는 정적 구조화 데이터를 바꿉니다. 사례 상세의 정적 화면도 같은 모양입니다.
  return applyHead(html, h).replace(/(<span id="cs-crumb">)[^<]*(<\/span>)/, `$1${esc(c.title)}$2`);
}
export async function serveCaseView(context) {
  const { request, env } = context;
  const page = await (typeof context.next === 'function' ? context.next() : env.ASSETS.fetch(request));
  try {
    const ref = (new URL(request.url).searchParams.get('id') || '').toUpperCase().trim();
    if (!CASE_REF.test(ref) || !hasDb(env) || page.status !== 200 || !(page.headers.get('content-type') || '').includes('text/html')) return page;
    const c = await getPublicCase(env, ref); if (!c) return page;
    const headers = new Headers(page.headers); headers.delete('content-length'); headers.delete('etag'); headers.set('cache-control', 'public, max-age=120');
    return new Response(caseHead(await page.clone().text(), c), { status: 200, headers });
  } catch (e) { console.error('case view', e && e.message); return page; }
}
export async function casesSitemap(env) {
  const today = kstToday(); let rows = [];
  try { if (hasDb(env)) rows = await listPublicCases(env, { limit: 2000 }); } catch {}
  const urls = [`  <url><loc>${SITE}/cases/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`]
    .concat(rows.map(c => `  <url><loc>${SITE}/cases/view/?id=${c.ref}</loc><lastmod>${String(c.published_at || today).slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`));
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n',
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
