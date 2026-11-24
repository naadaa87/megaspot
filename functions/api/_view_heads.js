// 글·모임 상세 화면을 검색엔진이 읽을 수 있게 서버에서 채웁니다 (2026-11-25)
//  · 대상: 자유게시판 글(/community/free/view/?id=CF-…) · 모임 소개(/community/groups/view/?id=CG-…) · 모임 모집(/meetups/view/?id=MO-…)
//  · 공개된 글·모임이면 제목·설명·주소(canonical)·공유 미리보기를 그 글에 맞추고, 본문 첫 화면(H1 포함)을 HTML 에 넣습니다.
//    화면 스크립트가 불러오면 같은 자리를 더 자세한 화면으로 바꿉니다.
//  · 주소가 틀리거나 공개되지 않은 글이면 정적 페이지(검색 제외 표시)를 그대로 내보냅니다.
//  · 모임 소개의 전화·이메일, 모임 주최자 연락처, 참가 신청자 정보는 넣지 않습니다. 조회수도 올리지 않습니다.
import { hasDb, now, kstToday } from './_lib.js';
import { publicPost, POST_REF } from './_community.js';
import { publicMeetup, meetupCounts, MEETUP_REF, PUBLIC_STATUS, MEETUP_VENUES } from './_platform.js';
import { PLACE, POSTAL_ADDRESS, VENUE_NAME } from './_site_info.js';

const SITE = 'https://megaspot.kr', OG_DEFAULT = SITE + '/assets/img/brand/og-megaspot.jpg';
export const TITLE_MAX = 60, DESC_MAX = 160;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const one = s => String(s || '').replace(/\s+/g, ' ').trim();
export function clip(s, n) { s = one(s); return s.length > n ? s.slice(0, n - 1).replace(/[\s,.·:;!?-]+$/, '') + '…' : s; }
export const fitTitle = (main, suffix) => clip(main, TITLE_MAX - suffix.length) + suffix;
const para = s => esc(String(s || '').slice(0, 4000)).replace(/\r?\n/g, '<br>');
const ldJson = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const IMG_DIR = { p: 'gundae', s: 'scenes', v: 'views', a: 'aerial', r: 'gundae2' };
// 화면 스크립트(site.js coverSrc)와 같은 규칙으로 대표 이미지 주소를 만듭니다
export function coverUrl(c) {
  c = String(c || ''); if (c === 'p14') c = 'v10';
  if (/^https:\/\//.test(c)) return c;
  if (c.startsWith('/')) return SITE + c;
  const id = /^[a-z]\d{2}$/.test(c) ? c : 'v10';
  return `${SITE}/assets/img/${IMG_DIR[id[0]] || 'gundae'}/m/${id}.jpg`;
}
const rel = u => String(u).startsWith(SITE + '/') ? String(u).slice(SITE.length) : u;
const kdate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${+m[2]}월 ${+m[3]}일` : ''; };
const isoKst = (at) => { const t = Date.parse(String(at || '').replace(' ', 'T') + 'Z'); return isFinite(t) ? new Date(t + 9 * 3600e3).toISOString().slice(0, 19) + '+09:00' : undefined; };

// <head> 를 바꾸고 본문 자리를 채웁니다. 없는 태그는 건너뜁니다.
export function applyHead(html, h) {
  const set = (re, v) => { html = html.replace(re, v); };
  set(/<title>[^<]*<\/title>/, `<title>${esc(h.title)}</title>`);
  set(/(<meta name="description" content=")[^"]*(")/, `$1${esc(h.desc)}$2`);
  set(/(<meta name="robots" content=")[^"]*(")/, '$1index,follow,max-image-preview:large,max-snippet:-1$2');
  set(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(h.url)}$2`);
  set(/(<meta property="og:type" content=")[^"]*(")/, `$1${h.ogType || 'article'}$2`);
  set(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(h.ogTitle || h.title)}$2`);
  set(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(h.desc)}$2`);
  set(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(h.url)}$2`);
  set(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(h.ogTitle || h.title)}$2`);
  set(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(h.desc)}$2`);
  if (h.image && h.image !== OG_DEFAULT) {
    set(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(h.image)}$2`);
    set(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${esc(h.image)}$2`);
    set(/<meta property="og:image:width" content="[^"]*">\s*<meta property="og:image:height" content="[^"]*">\s*/, '');
  }
  // 정적 화면의 WebPage 구조화 데이터를 이 글의 것으로 바꿉니다
  const LD = /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@graph":\[\{"@type":"WebPage","@id":"https:\/\/megaspot\.kr\/[a-z/]+\/view\/#webpage"[\s\S]*?<\/script>/;
  if (LD.test(html)) set(LD, ldJson(h.ld)); else set('</head>', ldJson(h.ld) + '\n</head>');
  if (h.crumb) set(/(<span id="(?:cm|mv)-crumb">)[^<]*(<\/span>)/, `$1${esc(h.crumb)}$2`);
  if (h.body && h.slot) set(h.slot, `$1${h.body}`);
  return html;
}
const graph = (h, crumbs, main) => ({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', '@id': h.url + '#webpage', url: h.url, name: h.title, description: h.desc, inLanguage: 'ko', isPartOf: { '@id': SITE + '/#website' }, ...(h.image ? { primaryImageOfPage: h.image } : {}) },
  { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(item ? { item } : {}) })) },
  main
] });

// ---------- 커뮤니티 글 ----------
export function postHead(html, row) {
  const x = publicPost(row, { full: true }), group = x.board === 'group';
  const base = group ? '/community/groups/view/' : '/community/free/view/', url = `${SITE}${base}?id=${x.ref}`;
  const title = fitTitle(x.title, group ? ' | 모임 소개 | 메가스팟' : ' | 자유게시판 | 메가스팟');
  const lead = group ? [x.summary, x.region && '활동 지역 ' + x.region, x.cycle_label && x.cycle_label + ' 모임', x.venue_label].filter(Boolean).join(' · ') : '';
  const desc = clip(group ? (lead || x.body) : x.body || x.title, DESC_MAX) || clip(x.title, DESC_MAX);
  const image = group ? coverUrl(x.cover) : OG_DEFAULT;
  const published = isoKst(x.published_at);
  const main = { '@type': 'DiscussionForumPosting', '@id': url + '#post', headline: clip(x.title, 110), url, text: clip(group ? [x.summary, x.body].filter(Boolean).join('\n') : x.body, 500),
    author: { '@type': x.official ? 'Organization' : 'Person', name: x.official ? '메가스팟 운영팀' : x.author }, ...(published ? { datePublished: published } : {}),
    ...(group ? { image } : {}), commentCount: x.comments, interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: x.likes }],
    isPartOf: { '@type': 'WebPage', url: SITE + (group ? '/community/groups/' : '/community/free/') } };
  const crumbs = [['홈', SITE + '/'], ['커뮤니티', SITE + '/community/'], [group ? '모임 소개' : '자유게시판', SITE + (group ? '/community/groups/' : '/community/free/')], [x.title]];
  const meta = `<p class="small muted mt-1">${group ? '올린 사람 ' : ''}${esc(x.author)} · ${esc(String(x.published_at || '').slice(0, 10))}${x.comments ? ' · 댓글 ' + x.comments : ''}</p>`;
  const body = group
    ? `<div class="mv-layout"><div class="mv-main"><div class="mv-cover"><img src="${esc(rel(image))}" alt="${esc(x.title)} 대표 사진" decoding="async"></div>`
      + `<div class="mv-head"><div class="row" style="gap:6px"><span class="badge badge-cobalt">${esc(x.cat_label)}</span></div><h1 class="h-l mt-1">${esc(x.title)}</h1>${x.summary ? `<p class="lead mt-1">${esc(x.summary)}</p>` : ''}${meta}</div>`
      + `<section class="mv-sec"><h2>모임 소개</h2><div class="mv-text">${para(x.body)}</div></section></div></div>`
    : `<article class="cm-article"><header class="cm-ahead">${x.cat_label ? `<a class="cm-acat" href="/community/free/?cat=${esc(x.category)}">${esc(x.cat_label)}</a>` : ''}<h1>${esc(x.title)}</h1>${meta}</header><div class="cm-abody">${para(x.body)}</div></article>`;
  const h = { title, desc, url, image, ogTitle: x.title, crumb: x.title, body, slot: group ? /(<div id="cm-gview">)<div class="empty small">[^<]*<\/div>/ : /(<div class="cm-wrap" id="cm-fview">)<div class="empty small">[^<]*<\/div>/ };
  h.ld = graph(h, crumbs, main);
  return applyHead(html, h);
}

// ---------- 모임 모집 ----------
export function meetupLd(x, url, image) {
  const start = x.date ? (x.start_time ? `${x.date}T${x.start_time}:00+09:00` : x.date) : undefined;
  const end = x.date && x.end_time ? (x.end_time > (x.start_time || '') ? `${x.date}T${x.end_time}:00+09:00` : undefined) : undefined;
  const place = VENUE_NAME[x.venue] ? { '@type': 'Place', name: VENUE_NAME[x.venue], address: POSTAL_ADDRESS, geo: { '@type': 'GeoCoordinates', ...PLACE.geo } }
    : x.venue === 'tbd' ? { '@type': 'Place', name: '메가스팟 건대 (호실 협의 중)', address: POSTAL_ADDRESS }
    : x.venue_text ? { '@type': 'Place', name: x.venue_text, address: x.venue_text } : null;
  const full = x.capacity && x.seats >= x.capacity;
  const o = { '@type': 'Event', '@id': url + '#event', name: x.title, url, image: [image], description: clip([x.summary, x.description].filter(Boolean).join(' '), 500),
    ...(start ? { startDate: start } : {}), ...(end ? { endDate: end } : {}),
    eventStatus: x.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', ...(place ? { location: place } : {}),
    ...(x.host_name ? { organizer: { '@type': 'Organization', name: x.host_name, url } } : {}),
    ...(x.capacity ? { maximumAttendeeCapacity: x.capacity, remainingAttendeeCapacity: Math.max(0, x.capacity - (x.seats || 0)) } : {}),
    offers: { '@type': 'Offer', url, price: x.fee_type === 'paid' ? (x.fee || 0) : 0, priceCurrency: 'KRW', availability: x.status === 'open' && !full ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', ...(x.created_at ? { validFrom: x.created_at } : {}) } };
  if (x.fee_type === 'paid' && !x.fee) delete o.offers.price;   // 금액을 적지 않은 유료 모임은 가격을 넣지 않습니다
  return o;
}
export function meetupHead(html, row, counts) {
  const x = publicMeetup(row, counts), url = `${SITE}/meetups/view/?id=${x.ref}`, image = coverUrl(x.cover);
  const when = [kdate(x.date), x.start_time && (x.start_time + (x.end_time ? '~' + x.end_time : ''))].filter(Boolean).join(' ');
  const where = VENUE_NAME[x.venue] || (x.venue === 'other' ? x.venue_text : MEETUP_VENUES[x.venue]) || '';
  const title = fitTitle(x.title, (x.date ? ' · ' + kdate(x.date) : '') + ' 모임 | 메가스팟');
  const state = { open: '참가 신청 받는 중', closed: '모집 마감', cancelled: '취소된 모임', done: '지난 모임' }[x.status] || '';
  const desc = clip([x.summary, when, where, state, x.fee_type === 'paid' ? (x.fee ? '참가비 ' + Number(x.fee).toLocaleString('ko-KR') + '원' : '참가비 있음') : '참가비 무료'].filter(Boolean).join(' · '), DESC_MAX);
  const body = `<div class="mv-layout"><article class="mv-main"><div class="mv-cover"><img src="${esc(rel(image))}" alt="${esc(x.title)} 대표 이미지" decoding="async"></div>`
    + `<div class="mv-head"><div class="row" style="gap:6px"><span class="badge badge-cobalt">${esc(x.cat_label)}</span>${state ? `<span class="badge badge-soft">${esc(state)}</span>` : ''}</div><h1 class="h-l mt-2">${esc(x.title)}</h1>${x.summary ? `<p class="lead mt-1">${esc(x.summary)}</p>` : ''}</div>`
    + `<dl class="def mv-facts"><div><dt>날짜·시간</dt><dd>${esc(when || '날짜 협의 중')}</dd></div><div><dt>장소</dt><dd>${esc(where || '협의 중')}</dd></div>${x.capacity ? `<div><dt>모집 인원</dt><dd>정원 ${esc(x.capacity)}명</dd></div>` : ''}</dl>`
    + `<section class="mv-sec"><h2>모임 소개</h2><div class="mv-text">${para(x.description)}</div></section></article></div>`;
  const h = { title, desc, url, image, ogTitle: x.title, crumb: x.title, body, slot: /(<div id="mv-root">)<div class="empty small">[^<]*<\/div>/ };
  h.ld = graph(h, [['홈', SITE + '/'], ['모임 모집', SITE + '/meetups/'], [x.title]], meetupLd(x, url, image));
  return applyHead(html, h);
}

// ---------- 화면 함수 ----------
async function rewrite(context, find, render) {
  const { request, env } = context;
  const page = await (typeof context.next === 'function' ? context.next() : env.ASSETS.fetch(request));
  try {
    const ref = (new URL(request.url).searchParams.get('id') || '').toUpperCase().trim();
    if (!ref || !hasDb(env) || page.status !== 200 || !(page.headers.get('content-type') || '').includes('text/html')) return page;
    const data = await find(env, ref); if (!data) return page;
    const headers = new Headers(page.headers); headers.delete('content-length'); headers.delete('etag'); headers.set('cache-control', 'public, max-age=120');
    return new Response(render(await page.clone().text(), data), { status: 200, headers });
  } catch (e) { console.error('view head', e && e.message); return page; }
}
const COLS = 'id, ref, board, status, category, title, member_id, author, official, pinned, featured, views, likes, comments, reports, data, publish_at, created_at, updated_at';
export const findPost = board => async (env, ref) => {
  if (!POST_REF.test(ref) || ref[1] !== (board === 'group' ? 'G' : 'F')) return null;
  const r = await env.DB.prepare(`SELECT ${COLS} FROM community_posts WHERE ref = ? AND board = ? AND status = 'published' AND publish_at <= ?`).bind(ref, board, now()).first();
  return r || null;
};
export async function findMeetup(env, ref) {
  if (!MEETUP_REF.test(ref)) return null;
  const row = await env.DB.prepare('SELECT * FROM meetups WHERE ref = ?').bind(ref).first();
  if (!row || !PUBLIC_STATUS.includes(row.status)) return null;
  return { row, counts: await meetupCounts(env, ref) };
}
export const servePost = board => context => rewrite(context, findPost(board), postHead);
export const serveMeetup = context => rewrite(context, findMeetup, (html, d) => meetupHead(html, d.row, d.counts));

// ---------- 검색엔진용 주소 목록 ----------
const xml = (urls) => '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + urls.map(u => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.freq || 'weekly'}</changefreq><priority>${u.priority || '0.5'}</priority></url>`).join('\n') + '\n</urlset>\n';
const xmlResponse = body => new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
export async function communitySitemap(env) {
  const today = kstToday(), urls = [{ loc: SITE + '/community/', lastmod: today, freq: 'daily', priority: '0.6' }];
  try {
    if (hasDb(env)) {
      const { results } = await env.DB.prepare("SELECT ref, board, publish_at, updated_at FROM community_posts WHERE status = 'published' AND publish_at <= ? ORDER BY publish_at DESC LIMIT 5000").bind(now()).all();
      for (const r of results || []) urls.push({ loc: `${SITE}/community/${r.board === 'group' ? 'groups' : 'free'}/view/?id=${r.ref}`, lastmod: String(r.updated_at || r.publish_at || today).slice(0, 10), priority: r.board === 'group' ? '0.6' : '0.4' });
    }
  } catch {}
  return xmlResponse(xml(urls));
}
export async function meetupSitemap(env) {
  const today = kstToday(), urls = [{ loc: SITE + '/meetups/', lastmod: today, freq: 'daily', priority: '0.6' }];
  try {
    if (hasDb(env)) {
      // 다가오는 모임만 싣습니다 (지난 모임은 화면에는 남지만 검색엔진에 새로 알리지 않습니다)
      const { results } = await env.DB.prepare("SELECT ref, updated_at, created_at FROM meetups WHERE status IN ('open','closed','cancelled') AND (event_date IS NULL OR event_date >= ?) ORDER BY event_date LIMIT 2000").bind(today).all();
      for (const r of results || []) urls.push({ loc: `${SITE}/meetups/view/?id=${r.ref}`, lastmod: String(r.updated_at || r.created_at || today).slice(0, 10), freq: 'daily', priority: '0.6' });
    }
  } catch {}
  return xmlResponse(xml(urls));
}
