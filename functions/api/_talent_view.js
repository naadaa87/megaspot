// 진행자 섭외 화면을 서버에서 채웁니다 (2026-11-25)
//  · /mc/        공개 중인 진행자 카드를 HTML 에 넣고 ItemList 구조화 데이터를 붙입니다.
//  · /mc/view/   진행자 한 명의 소개·이력·사진을 HTML 에 넣고 제목·설명·주소·Person 구조화 데이터를 맞춥니다.
//  · 연락처·출연료 기준·운영 메모(관리자 전용 칸)는 여기까지 오지 않습니다 — _talent.js 의 공개 쿼리가 그 칸을 읽지 않습니다.
//  · 화면 스크립트(assets/js/pages/talent.js)는 이 HTML 위에서 거르기·후보 담기만 합니다. DB 가 없을 때는 /api/talent?html=1 로 같은 HTML 을 받아 씁니다.
import { hasDb, kstToday } from './_lib.js';
import { listPublicTalents, getPublicTalent, ROLES, SLUG } from './_talent.js';
import { applyHead, clip, fitTitle, DESC_MAX } from './_view_heads.js';

const SITE = 'https://megaspot.kr';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const para = s => String(s || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('');
const abs = u => /^https:\/\//.test(u) ? u : SITE + u;
const ldJson = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const langLine = t => ['한국어'].concat(t.langs.map(l => l.label)).join(' · ');
export const priceText = t => t.price_from ? `${Math.round(t.price_from / 10000).toLocaleString('ko-KR')}만 원부터` : '상담 후 견적';

function picture(t, { eager = false, cls = '', sizes = '(max-width:719px) 50vw, 300px' } = {}) {
  const p = t.photo; if (!p) return `<div class="tl-noimg ${cls}" aria-hidden="true">${esc((t.name || '').slice(0, 1))}</div>`;
  const alt = `${t.title ? t.title.split('·')[0].trim() + ' ' : ''}${t.name} 프로필 사진`;
  const img = `<img src="${esc(p.src)}" alt="${esc(alt)}" width="720" height="900" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${cls ? ` class="${cls}"` : ''}>`;
  if (p.webp) return `<picture><source type="image/webp" srcset="${esc(p.small)} 360w, ${esc(p.webp)} 720w" sizes="${sizes}">${img}</picture>`;
  return img;
}
// 거르기용 글자 (이름·직함·분야·이력 제목과 항목)
const searchText = t => [t.name, t.title, t.headline, ...t.roles.map(r => r.label), ...t.langs.map(l => l.label), ...t.events.map(e => e.label), ...t.career.map(c => c.h + ' ' + c.items.join(' '))].join(' ').toLowerCase().slice(0, 2400);

export function card(t) {
  const roles = t.roles.map(r => `<span class="tl-role tl-r-${esc(r.id)}">${esc(r.label)}</span>`).join('');
  const stats = t.stats.slice(0, 3).map(s => `<li><b>${esc(s.v)}</b><span>${esc(s.k)}</span></li>`).join('');
  return `<article class="tl-card" data-slug="${esc(t.slug)}" data-name="${esc(t.name)}" data-roles="${esc(t.roles.map(r => r.id).join(' '))}" data-langs="${esc(t.langs.map(l => l.id).join(' '))}" data-events="${esc(t.events.map(e => e.id).join(' '))}" data-q="${esc(searchText(t))}">`
    + `<a class="tl-ph" href="${esc(t.url)}" tabindex="-1" aria-hidden="true">${picture(t)}${t.langs.length ? `<span class="tl-lang-badge">${esc(t.langs.map(l => l.label).join('·'))} 진행</span>` : ''}</a>`
    + `<div class="tl-bd"><div class="tl-roles">${roles}</div>`
    + `<h3 class="tl-name"><a href="${esc(t.url)}">${esc(t.name)}</a><small>${esc(t.title)}</small></h3>`
    + `<p class="tl-hl">${esc(t.headline)}</p>`
    + (stats ? `<ul class="tl-stats">${stats}</ul>` : '')
    + `<div class="tl-acts"><a class="btn btn-light btn-sm" href="${esc(t.url)}">프로필 보기</a><button type="button" class="btn btn-sm tl-pick" data-pick="${esc(t.slug)}" aria-pressed="false"><span class="tl-pick-off">후보 담기</span><span class="tl-pick-on">후보에 담음 ✓</span></button></div>`
    + `</div></article>`;
}

function careerBlock(c) {
  const head = c.items.slice(0, 6), rest = c.items.slice(6);
  return `<div class="tv-cg"><h3>${esc(c.h)}</h3><ul>${head.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
    + (rest.length ? `<details class="tv-more"><summary>${rest.length}개 더 보기</summary><ul>${rest.map(i => `<li>${esc(i)}</li>`).join('')}</ul></details>` : '') + `</div>`;
}
export function body(t, all = []) {
  const others = all.filter(x => x.slug !== t.slug).slice(0, 3);
  const stats = t.stats.map(s => `<li><b>${esc(s.v)}</b><span>${esc(s.k)}</span></li>`).join('');
  return `<article class="tv" data-slug="${esc(t.slug)}" data-name="${esc(t.name)}">`
    + `<div class="tv-top"><div class="tv-photo">${picture(t, { eager: true, sizes: '(max-width:719px) 100vw, 420px' })}</div>`
    + `<div class="tv-head"><div class="tl-roles">${t.roles.map(r => `<span class="tl-role tl-r-${esc(r.id)}">${esc(r.label)}</span>`).join('')}</div>`
    + `<h1 class="tv-name">${esc(t.name)}<small>${esc(t.title)}</small></h1>`
    + `<p class="tv-hl">${esc(t.headline)}</p>`
    + (stats ? `<ul class="tl-stats tv-stats">${stats}</ul>` : '')
    + `<dl class="tv-facts"><div><dt>진행 언어</dt><dd>${esc(langLine(t))}</dd></div><div><dt>잘 맞는 행사</dt><dd>${esc(t.events.map(e => e.label).join(' · ') || '상담에서 안내')}</dd></div><div><dt>출연료</dt><dd>${esc(priceText(t))}${t.price_note ? ` <span class="muted">· ${esc(t.price_note)}</span>` : ''}</dd></div></dl>`
    + `<div class="tv-cta"><a class="btn btn-primary btn-lg" href="/mc/?pick=${esc(t.slug)}#request">이 진행자로 섭외 요청</a><button type="button" class="btn btn-lg tl-pick" data-pick="${esc(t.slug)}" aria-pressed="false"><span class="tl-pick-off">후보에 담기</span><span class="tl-pick-on">후보에 담음 ✓</span></button></div>`
    + `<p class="tv-note">진행자 연락처는 공개하지 않습니다. 일정 확인부터 견적, 큐시트 협의까지 메가스팟이 함께 조율해 드려요.</p></div></div>`
    + `<div class="tv-grid"><div class="tv-main">`
    + `<section class="tv-sec"><h2>소개</h2><div class="tv-text">${para(t.intro)}</div></section>`
    + (t.strengths.length ? `<section class="tv-sec"><h2>이런 진행을 잘해요</h2><div class="tv-str">${t.strengths.map((s, i) => `<div class="tv-str-i"><span class="tv-n">${String(i + 1).padStart(2, '0')}</span><b>${esc(s.t)}</b><p>${esc(s.d)}</p></div>`).join('')}</div></section>` : '')
    + (t.photos.length ? `<section class="tv-sec"><h2>현장 사진</h2><div class="tv-gal" data-tv-gallery>${t.photos.map((p, i) => `<a href="${esc(p.src)}" data-tv-photo data-title="${esc(p.alt)}"><img src="${esc(p.thumb || p.src)}" alt="${esc(p.alt || t.name + ' 진행 사진 ' + (i + 1))}" loading="lazy" decoding="async">${p.alt ? `<span>${esc(p.alt)}</span>` : ''}</a>`).join('')}</div></section>` : '')
    + (t.career.length ? `<section class="tv-sec"><h2>대표 진행 이력</h2><div class="tv-career">${t.career.map(careerBlock).join('')}</div></section>` : '')
    + (t.quotes.length ? `<section class="tv-sec"><h2>행사 담당자 한마디</h2><div class="tv-quotes">${t.quotes.map(q => `<blockquote><p>${esc(q.q)}</p>${q.by ? `<cite>${esc(q.by)}</cite>` : ''}</blockquote>`).join('')}</div><p class="small muted mt-1">진행자 포트폴리오에 실린 행사 담당자 의견입니다.</p></section>` : '')
    + `</div><aside class="tv-side">`
    + (t.brief.length ? `<section class="tv-box"><h2>주요 활동</h2><ul>${t.brief.map(b => `<li>${esc(b)}</li>`).join('')}</ul></section>` : '')
    + (t.quals.length ? `<section class="tv-box"><h2>학력 · 자격</h2><ul>${t.quals.map(b => `<li>${esc(b)}</li>`).join('')}</ul></section>` : '')
    + (t.clients.length ? `<section class="tv-box"><h2>함께한 기관 · 기업</h2><ul class="tv-clients">${t.clients.map(b => `<li>${esc(b)}</li>`).join('')}</ul><p class="tiny muted">포트폴리오에 적힌 진행 이력 기준</p></section>` : '')
    + `<section class="tv-box tv-ask"><h2>섭외는 이렇게 진행돼요</h2><ol><li>요청서에 행사 날짜·장소·성격을 적어 보내 주세요.</li><li>운영팀이 진행자 일정과 조건을 확인합니다.</li><li>출연료와 진행 범위를 견적으로 안내드려요.</li><li>확정되면 큐시트와 진행 순서를 함께 맞춥니다.</li></ol><a class="btn btn-primary btn-block" href="/mc/?pick=${esc(t.slug)}#request">섭외 요청서 쓰기</a></section>`
    + `</aside></div>`
    + (others.length ? `<section class="tv-sec tv-others"><h2>다른 진행자도 함께 보세요</h2><div class="tl-grid tl-grid-3">${others.map(card).join('')}</div><p class="mt-2"><a class="btn btn-light" href="/mc/#list">진행자 전체 보기</a></p></section>` : '')
    + `</article>`;
}
export const VIEW = { card, body };

const pageHeaders = page => { const h = new Headers(page.headers); h.delete('content-length'); h.delete('etag'); h.set('cache-control', 'public, max-age=120'); return h; };
const htmlOk = page => page.status === 200 && (page.headers.get('content-type') || '').includes('text/html');

export async function serveTalentList(context) {
  const { request, env } = context;
  const page = await (typeof context.next === 'function' ? context.next() : env.ASSETS.fetch(request));
  try {
    if (!hasDb(env) || !htmlOk(page)) return page;
    const items = await listPublicTalents(env); if (!items.length) return page;
    let html = await page.clone().text();
    html = html.replace(/<!--talent:list-->[\s\S]*?<!--\/talent:list-->/, `<!--talent:list-->${items.map(card).join('')}<!--/talent:list-->`)
      .replace(/(<span id="tl-total">)[^<]*(<\/span>)/, `$1${items.length}$2`);
    const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: '메가스팟 행사 진행자 (MC·아나운서·강사·레크리에이션)', numberOfItems: items.length,
      itemListElement: items.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: `${t.name} ${t.title}`, url: `${SITE}${t.url}` })) };
    html = html.replace('</head>', ldJson(ld) + '\n</head>');
    return new Response(html, { status: 200, headers: pageHeaders(page) });
  } catch (e) { console.error('talent list', e && e.message); return page; }
}
export function talentHead(html, t, all) {
  const url = `${SITE}${t.url}`, image = t.photo ? abs(t.photo.src) : SITE + '/assets/img/brand/og-megaspot.jpg';
  const role = (t.title || '').split('·')[0].trim();
  const title = fitTitle(`${t.name} ${role} 섭외`, ' | MC·강사 섭외 | 메가스팟');
  const desc = clip([t.headline, t.roles.map(r => r.label).join('·'), t.langs.length ? langLine(t) + ' 진행' : '', '메가스팟에서 일정 확인부터 섭외까지 한 번에'].filter(Boolean).join(' · '), DESC_MAX);
  const person = { '@type': 'Person', '@id': url + '#person', name: t.name, jobTitle: t.title, description: t.headline, image, url,
    knowsLanguage: ['ko'].concat(t.langs.map(l => l.id)), ...(t.quals.length ? { hasCredential: t.quals.slice(0, 6).map(q => ({ '@type': 'EducationalOccupationalCredential', name: q })) } : {}) };
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'ProfilePage', '@id': url + '#webpage', url, name: title, description: desc, inLanguage: 'ko', isPartOf: { '@id': SITE + '/#website' }, mainEntity: { '@id': url + '#person' }, primaryImageOfPage: image },
    { '@type': 'BreadcrumbList', itemListElement: [['홈', SITE + '/'], ['MC·강사 섭외', SITE + '/mc/'], [t.name]].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(item ? { item } : {}) })) },
    person] };
  const h = { title, desc, url, image, ogType: 'profile', ogTitle: `${t.name} · ${t.title}`, body: body(t, all), slot: /(<div id="tv-view">)<div class="empty small">[^<]*<\/div>/, ld };
  return applyHead(html, h).replace(/(<span id="tv-crumb">)[^<]*(<\/span>)/, `$1${esc(t.name)}$2`);
}
export async function serveTalentView(context) {
  const { request, env } = context;
  const page = await (typeof context.next === 'function' ? context.next() : env.ASSETS.fetch(request));
  try {
    const slug = (new URL(request.url).searchParams.get('id') || '').toLowerCase().trim();
    if (!SLUG.test(slug) || !hasDb(env) || !htmlOk(page)) return page;
    const t = await getPublicTalent(env, slug); if (!t) return page;
    return new Response(talentHead(await page.clone().text(), t, await listPublicTalents(env)), { status: 200, headers: pageHeaders(page) });
  } catch (e) { console.error('talent view', e && e.message); return page; }
}
export async function talentSitemap(env) {
  const today = kstToday(); let rows = [];
  try { if (hasDb(env)) rows = await listPublicTalents(env); } catch {}
  const urls = [`  <url><loc>${SITE}/mc/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`]
    .concat(rows.map(t => `  <url><loc>${SITE}/mc/view/?id=${t.slug}</loc><lastmod>${String(t.updated_at || today).slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`));
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n',
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
export { ROLES };
