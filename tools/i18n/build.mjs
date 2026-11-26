// 외국어 화면 만들기 — 영어(/en/) · 일본어(/ja/) · 중국어 간체(/zh/) (2026-11-26)
//
//   node tools/i18n/build.mjs           → 외국어 화면 21개, 한국어 짝 화면의 hreflang 구간, sitemap.xml 구간을 고칩니다
//   node tools/i18n/build.mjs --check   → 고칠 곳이 있으면 목록을 보이고 1로 끝납니다 (테스트용)
//
// 글은 content/en.mjs · ja.mjs · zh.mjs 에 있고, 숫자(요금·인원·면적·주차권)는 한국어 화면과 같은 데이터에서 가져옵니다.
//   요금: assets/js/data/pricing-gundae.js · pricing-gundae2.js   공간: assets/js/data/spaces.js   주차권: functions/api/_parking.js
// 요금표를 고치면 이 도구를 다시 돌려 주세요 (테스트가 --check 로 확인합니다).
// 외국어 화면의 머리말·꼬리말은 이 도구가 만들므로 tools/site-chrome 이 건드리지 않습니다 (class 가 다릅니다).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { TICKETS } from '../../functions/api/_parking.js';
import { POSTAL_ADDRESS } from '../../functions/api/_site_info.js';
import en from './content/en.mjs';
import ja from './content/ja.mjs';
import zh from './content/zh.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const SITE = 'https://megaspot.kr';
export const LANGS = [en, ja, zh];
const read = p => readFileSync(join(ROOT, p), 'utf8');
const ver = p => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex').slice(0, 12);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KAKAO = 'https://pf.kakao.com/_LnxbmX/chat', EMAIL = 'spaceblank0100@gmail.com', PHONE = '+82 10-2384-9580', TEL = '+821023849580';
const ADDR_KO = '서울 광진구 능동로13길 39 한아름건물 2층';
const MAPS = {
  naver: 'https://map.naver.com/p/search/' + encodeURIComponent('서울 광진구 능동로13길 39'),
  kakao: 'https://map.kakao.com/link/search/' + encodeURIComponent('서울 광진구 능동로13길 39'),
  google: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('39 Neungdong-ro 13-gil, Gwangjin-gu, Seoul'),
};
const GEO = { lat: 37.5405, lng: 127.0695 };

// 화면 목록 · 한국어 짝 화면 (hreflang 은 내용이 같은 화면끼리만 잇습니다)
export const PAGES = [
  { key: 'home', slug: '', ko: '/' },
  { key: 'g1', slug: 'gundae-1/', ko: '/spaces/megaspot-gundae/' },
  { key: 'g2', slug: 'gundae-2/', ko: '/spaces/megaspot-gundae-2/' },
  { key: 'rates', slug: 'rates/', ko: '/spaces/megaspot-gundae/pricing/' },
  { key: 'access', slug: 'access/', ko: '/parking/' },
  { key: 'faq', slug: 'faq/' },
  { key: 'contact', slug: 'contact/' },
];
const KO_FILE = { '/': 'index.html', '/spaces/megaspot-gundae/': 'spaces/megaspot-gundae/index.html', '/spaces/megaspot-gundae-2/': 'spaces/megaspot-gundae-2/index.html', '/spaces/megaspot-gundae/pricing/': 'spaces/megaspot-gundae/pricing/index.html', '/parking/': 'parking/index.html' };
const UPDATED = '2026-11-26';

/* ---------- 데이터 ---------- */
function loadData() {
  const ctx = { window: {} }; vm.createContext(ctx);
  for (const f of ['assets/js/data/pricing-gundae.js', 'assets/js/data/pricing-gundae2.js', 'assets/js/data/spaces.js']) vm.runInContext(read(f), ctx, { filename: f });
  const P = ctx.window.MEGASPOT_PRICING, S = id => ctx.window.MEGASPOT_GET_SPACE(id);
  const p1 = P['megaspot-gundae'], p2 = P['megaspot-gundae-2'], s1 = S('megaspot-gundae'), s2 = S('megaspot-gundae-2');
  return { p1, p2, s1, s2 };
}
function vars(L, D) {
  const { p1, p2, s1, s2 } = D, m = L.money, opt = id => p1.options.find(o => o.id === id).price;
  return {
    fee: m(p1.surcharge.amount), extra: m(p1.people.extra), base: p1.people.base, nth: L.nth(p1.people.base + 1), deposit: m(p1.deposit.amount),
    from: m(p1.hourly.wd.morning + p1.surcharge.amount), max1: p1.people.max, max2: p2.people.max,
    m2_1: L.num(s1.area.m2), m2_2: L.num(s2.area.m2), py1: s1.area.pyeong, py2: s2.area.pyeong, park: s1.parking.spaces,
    cleaning: m(opt('cleaning')), disposable: m(opt('disposable')), banner: m(opt('banner')), xbanner: m(opt('xbanner')),
    park1h: m(TICKETS['1h'].price), parkDay: m(TICKETS.daily.price), email: EMAIL,
  };
}
const fill = (s, V) => String(s).replace(/\{(\w+)\}/g, (a, k) => (k in V ? V[k] : a));

/* ---------- 공통 조각 ---------- */
const GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const TALK = '<svg class="ico-talk" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.2C6.6 3.2 2.3 6.6 2.3 10.9c0 2.7 1.8 5.1 4.5 6.5l-.9 3.4c-.1.3.3.6.6.4l4-2.6c.5.1 1 .1 1.5.1 5.4 0 9.7-3.4 9.7-7.8S17.4 3.2 12 3.2z"/></svg>';
export const LANG_LIST = [['ko', 'ko', '한국어', 'KO'], ['en', 'en', 'English', 'EN'], ['ja', 'ja', '日本語', 'JA'], ['zh', 'zh-Hans', '简体中文', '中文']];
// 언어 고르기 단추 (한국어 화면 머리말에도 같은 모양을 씁니다 — tools/site-chrome/partials/header.html)
export function langSwitch(cur, hrefs, label) {
  const c = LANG_LIST.find(x => x[0] === cur);
  return `<div class="lang-sw" data-lang-sw>
      <button class="lang-btn" type="button" aria-expanded="false" aria-controls="lang-menu" aria-label="${esc(label)}: ${c[2]}">${GLOBE}<span>${c[3]}</span></button>
      <div class="lang-menu" id="lang-menu" hidden>${LANG_LIST.map(([code, hl, name]) => `<a href="${hrefs[code]}" lang="${hl}" hreflang="${hl}" data-lang="${code}"${code === cur ? ' aria-current="true"' : ''}>${name}</a>`).join('')}</div>
    </div>`;
}
function hrefsFor(page) {
  const h = { ko: page.ko || '/' };
  for (const L of LANGS) h[L.code] = `/${L.code}/${page.slug}`;
  return h;
}
function alternates(page) {
  const out = [];
  if (page.ko) out.push(['ko', SITE + page.ko]);
  for (const L of LANGS) out.push([L.hreflang, `${SITE}/${L.code}/${page.slug}`]);
  out.push(['x-default', page.ko ? SITE + page.ko : `${SITE}/en/${page.slug}`]);
  return out;
}

function header(L, page) {
  const u = L.ui, b = `/${L.code}/`, n = u.nav;
  const link = (slug, t) => `<a class="nav-primary" href="${b}${slug}"${page.slug === slug ? ' aria-current="page"' : ''}>${t}</a>`;
  return `<header class="site-header i18n-header">
  <div class="container">
    <a class="logo" href="${b}" aria-label="MEGASPOT ${esc(u.home)}"><span class="en">MEGA<b>SPOT</b></span><span class="ko">메가스팟</span></a>
    <nav class="nav" aria-label="MEGASPOT">
      ${link('gundae-1/', n.g1)}
      ${link('gundae-2/', n.g2)}
      ${link('rates/', n.rates)}
      ${link('access/', n.access)}
      ${link('faq/', n.faq)}
    </nav>
    <div class="header-cta">
      <a class="btn btn-kakao btn-sm hdr-kakao" href="${KAKAO}" target="_blank" rel="noopener" data-kakao>${TALK}${u.kakao}</a>
      <a class="btn btn-primary btn-sm" href="${b}contact/">${u.quote}</a>
    </div>
    ${langSwitch(L.code, hrefsFor(page), u.language)}
    <button class="menu-btn" aria-label="${esc(u.menuOpen)}" aria-expanded="false" aria-controls="mobile-nav"><svg class="menu-grid-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="4" cy="4" r="1.7"/><circle cx="12" cy="4" r="1.7"/><circle cx="20" cy="4" r="1.7"/><circle cx="4" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="20" cy="12" r="1.7"/><circle cx="4" cy="20" r="1.7"/><circle cx="12" cy="20" r="1.7"/><circle cx="20" cy="20" r="1.7"/></g></svg><svg class="menu-close-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
  </div>
</header>`;
}
function mobileNav(L, page) {
  const u = L.ui, b = `/${L.code}/`, n = u.nav, h = hrefsFor(page);
  return `<nav class="mobile-nav i18n-mnav" id="mobile-nav" aria-label="${esc(u.menu)}">
  <div class="mnav-sec">
    <div class="mnav-h">MEGASPOT</div>
    <a class="mnav-main" href="${b}gundae-1/">${n.g1}</a>
    <a class="mnav-main" href="${b}gundae-2/">${n.g2}</a>
    <div class="mnav-grid"><a href="${b}">${u.home}</a><a href="${b}rates/">${n.rates}</a><a href="${b}access/">${n.access}</a><a href="${b}faq/">${n.faq}</a></div>
  </div>
  <div class="mnav-sec">
    <div class="mnav-h">${u.language}</div>
    <div class="mnav-grid mnav-lang">${LANG_LIST.map(([code, hl, name]) => `<a href="${h[code]}" lang="${hl}" hreflang="${hl}" data-lang="${code}"${code === L.code ? ' aria-current="true"' : ''}>${name}</a>`).join('')}</div>
  </div>
  <a class="btn btn-primary btn-lg" href="${b}contact/">${u.quote}</a>
  <a class="btn btn-kakao" href="${KAKAO}" target="_blank" rel="noopener" data-kakao>${TALK}${u.kakao}</a>
  <a class="btn btn-light" href="mailto:${EMAIL}" data-email="inquiry">${EMAIL}</a>
  <a class="btn btn-ghost" href="tel:${TEL}" data-phone>${PHONE}</a>
</nav>`;
}
function footer(L, page) {
  const u = L.ui, F = L.footer, b = `/${L.code}/`, n = u.nav, h = hrefsFor(page);
  return `<footer class="site-footer i18n-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <a class="logo inv" href="${b}"><span class="en">MEGA<b>SPOT</b></span><span class="ko">메가스팟</span></a>
        <p class="mt-2" style="max-width:42ch">${esc(F.about)}</p>
        <a class="footer-kakao" href="${KAKAO}" target="_blank" rel="noopener" data-kakao aria-label="${esc(u.kakao)} ${esc(u.newTab)}">
          <img src="/assets/img/brand/kakao-qr.svg" width="80" height="80" alt="MEGASPOT KakaoTalk channel QR code" loading="lazy">
          <span><b>${u.kakao}</b>${esc(L.common.anyLang)}</span>
        </a>
      </div>
      <div>
        <h4>${F.halls}</h4>
        <ul><li><a href="${b}gundae-1/">${n.g1}</a></li><li><a href="${b}gundae-2/">${n.g2}</a></li><li><a href="${b}rates/">${n.rates}</a></li><li><a href="${b}access/">${n.access}</a></li></ul>
        <h4 class="mt-3">${F.info}</h4>
        <ul><li><a href="${b}faq/">${n.faq}</a></li><li><a href="${b}contact/">${u.quote}</a></li><li><a href="/" lang="ko" hreflang="ko">${F.korean} · 한국어</a></li></ul>
      </div>
      <div>
        <h4>${F.contact}</h4>
        <ul>
          <li>${u.email} <a href="mailto:${EMAIL}" data-email="inquiry">${EMAIL}</a></li>
          <li>${u.kakao} <a href="${KAKAO}" target="_blank" rel="noopener" data-kakao>pf.kakao.com/_LnxbmX/chat</a></li>
          <li>${u.phone} <a href="tel:${TEL}" data-phone>${PHONE}</a></li>
          <li>${esc(L.common.hours)}</li>
        </ul>
      </div>
    </div>
    <div class="footer-biz">
      <b>${F.company}</b> 주식회사 지유공간개발 · ${F.ceo} ${esc(F.ceoName)} · ${F.bizNo} 757-86-04159 · ${F.bizAddr} 경기도 화성시 병점구 경기대로 1014, 6층 603호 1023번<br>
      ${F.venue}: MEGASPOT Gundae 1 · 2 — 2F Hanareum Building, 39 Neungdong-ro 13-gil, Gwangjin-gu, Seoul (<span lang="ko">${ADDR_KO}</span>)<br>
      ${esc(F.note)}
    </div>
    <div class="footer-bottom">
      <div class="row i18n-foot-lang" style="gap:14px">${LANG_LIST.map(([code, hl, name]) => `<a href="${h[code]}" lang="${hl}" hreflang="${hl}"${code === L.code ? ' aria-current="true"' : ''}>${name}</a>`).join('')}</div>
      <div class="row" style="gap:16px"><a href="/terms/" lang="ko">${F.terms} ${u.ko}</a><a href="/privacy/" lang="ko">${F.privacy} ${u.ko}</a><a href="/products/#policy" lang="ko">${F.refund} ${u.ko}</a></div>
      <div>© <span data-year>2026</span> MEGASPOT. All rights reserved.</div>
    </div>
  </div>
</footer>`;
}

function head(L, page, T, ld) {
  const url = `${SITE}/${L.code}/${page.slug}`, title = esc(T.title), desc = esc(T.desc);
  const og = page.key === 'g2' ? '/assets/img/brand/og-gundae2-20261112.jpg' : page.key === 'g1' ? '/assets/img/brand/og-gundae.jpg' : page.key === 'rates' ? '/assets/img/brand/og-pricing.jpg' : '/assets/img/brand/og-megaspot.jpg';
  return `<!doctype html>
<html lang="${L.html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="theme-color" content="#FFFFFF">
<meta name="geo.region" content="KR-11">
<meta name="geo.position" content="${GEO.lat};${GEO.lng}">
<link rel="canonical" href="${url}">
${alternates(page).map(([hl, href]) => `<link rel="alternate" hreflang="${hl}" href="${href}">`).join('\n')}
<meta property="og:type" content="website">
<meta property="og:site_name" content="MEGASPOT">
<meta property="og:locale" content="${L.og}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${SITE}${og}">
<link rel="icon" href="/assets/img/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&display=swap">
<link rel="stylesheet" href="/assets/css/site.css?v=${ver('assets/css/site.css')}">
<link rel="stylesheet" href="/assets/css/i18n.css?v=${ver('assets/css/i18n.css')}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<link rel="stylesheet" href="/assets/css/mobile-viewport.css?v=20261104landscape2">
<script src="/assets/js/mobile-viewport.js?v=20261104landscape2" defer></script>
</head>`;
}

function shell(L, page, T, ld, main) {
  return `${head(L, page, T, ld)}
<body class="page-i18n page-i18n-${page.key}">
<a class="skip-link" href="#main">${esc(L.ui.skip)}</a>
${header(L, page)}
${mobileNav(L, page)}
<main id="main">
${main}
</main>
${footer(L, page)}
<script src="/assets/js/site.js?v=${ver('assets/js/site.js')}"></script>
<script src="/assets/js/i18n.js?v=${ver('assets/js/i18n.js')}" defer></script>
<script defer src="https://choisijun.com/k1.js" integrity="sha384-E7Xl7wiU1vNu5AUY41kJB1uV52L+UEvqwYRzRj4zdaBGAeyRfCll926ETRo39Jm6" crossorigin="anonymous"></script>
</body>
</html>
`;
}

/* ---------- 화면 조각 ---------- */
const ul = (items, cls = 'i-list') => `<ul class="${cls}">${items.map(x => `<li>${x}</li>`).join('')}</ul>`;
const crumbs = (L, T) => `<nav class="crumbs" aria-label="breadcrumb"><a href="/${L.code}/">${esc(L.ui.home)}</a><span>/</span><span aria-current="page">${esc(T.crumb)}</span></nav>`;
function pageHero(L, T, V, extra = '') {
  return `<section class="i-hero i-hero--sub">
  <div class="container">
    ${crumbs(L, T)}
    <p class="eyebrow mt-2">${esc(T.eyebrow)}</p>
    <h1 class="i-h1">${esc(fill(T.h1, V))}</h1>
    <p class="lead i-lead">${esc(fill(T.lead, V))}</p>${extra}
  </div>
</section>`;
}
function contactBand(L, V) {
  const u = L.ui, c = L.common, b = `/${L.code}/`;
  return `<section class="section i-band">
  <div class="container i-band-in">
    <div>
      <h2 class="i-h2">${esc(c.ctaTitle)}</h2>
      <p class="mt-1">${esc(c.ctaText)}</p>
      <p class="small muted mt-2">${esc(c.anyLang)} ${esc(c.hours)}</p>
    </div>
    <div class="i-cta">
      <a class="btn btn-primary" href="${b}contact/">${u.quote} <span class="arrow">→</span></a>
      <a class="btn btn-kakao" href="${KAKAO}" target="_blank" rel="noopener" data-kakao>${TALK}${u.kakao}</a>
      <a class="btn btn-light" href="mailto:${EMAIL}?subject=MEGASPOT%20inquiry" data-email="inquiry">${EMAIL}</a>
    </div>
  </div>
</section>`;
}
const img = (src, alt, w, h, extra = '') => `<img src="${src}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async"${extra}>`;
const PHOTO = {
  v01: ['/assets/img/views/m/v01.webp', '/assets/img/views/v01.jpg', 960, 540], v02: ['/assets/img/views/m/v02.webp', '/assets/img/views/v02.jpg', 960, 540],
  v03: ['/assets/img/views/m/v03.webp', '/assets/img/views/v03.jpg', 960, 540], v08: ['/assets/img/views/m/v08.webp', '/assets/img/views/v08.jpg', 960, 540],
  v04: ['/assets/img/views/m/v04.webp', '/assets/img/views/v04.jpg', 960, 540], v07: ['/assets/img/views/m/v07.webp', '/assets/img/views/v07.jpg', 960, 540],
  v09: ['/assets/img/views/m/v09.webp', '/assets/img/views/v09.jpg', 960, 540], v10: ['/assets/img/views/m/v10.webp', '/assets/img/views/v10.jpg', 960, 540],
  p18: ['/assets/img/gundae/m/p18.webp', '/assets/img/gundae/p18.jpg', 960, 720], p23: ['/assets/img/gundae/m/p23.webp', '/assets/img/gundae/p23.jpg', 960, 719],
  r22: ['/assets/img/gundae2/m/r22-matte-black.webp', '/assets/img/gundae2/r22-matte-black.jpg', 1200, 900], r23: ['/assets/img/gundae2/m/r23-matte-black.webp', '/assets/img/gundae2/r23-matte-black.jpg', 1200, 900],
  r24: ['/assets/img/gundae2/m/r24.webp', '/assets/img/gundae2/r24.jpg', 1200, 900], r25: ['/assets/img/gundae2/m/r25.webp', '/assets/img/gundae2/r25.jpg', 1200, 900],
  r26: ['/assets/img/gundae2/m/r26.webp', '/assets/img/gundae2/r26.jpg', 1200, 900], r27: ['/assets/img/gundae2/m/r27.webp', '/assets/img/gundae2/r27.jpg', 1200, 900],
  r28: ['/assets/img/gundae2/m/r28-matte-black.webp', '/assets/img/gundae2/r28-matte-black.jpg', 1200, 900], r32: ['/assets/img/gundae2/m/r32-bright-furniture-layout.webp', '/assets/img/gundae2/r32-bright-furniture-layout.jpg', 1200, 900],
};
function gallery(T) {
  const n = Object.keys(T.photos).length, big = n === 5 || n === 9;
  return `<div class="i-gallery" data-i-gallery>${Object.entries(T.photos).map(([id, cap], i) => {
    const [m, big, w, h] = PHOTO[id];
    return `<figure class="i-ph${i === 0 && big ? ' i-ph-lg' : ''}"><a href="${big}" data-full="${big}">${img(m, cap, w, h)}</a><figcaption>${esc(cap)}</figcaption></figure>`;
  }).join('')}</div>`;
}
const table = (head, rows, cls = '') => `<div class="i-tbl"><table class="i-table ${cls}"><thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

/* ---------- 화면별 본문 ---------- */
function homeMain(L, D, V) {
  const T = L.pages.home, b = `/${L.code}/`, u = L.ui;
  const hallCard = (k, slug, ph, max) => { const H = T[k]; const [m, , w, h] = PHOTO[ph];
    return `<article class="i-hall">
      <a class="i-hall-img" href="${b}${slug}">${img(m, H.alt, w, h)}</a>
      <div class="i-hall-body">
        <p class="i-tag">${esc(fill(H.tag, V))}</p>
        <h3 class="i-h3">${k === 'g1' ? u.nav.g1 : u.nav.g2}</h3>
        <p>${esc(fill(H.text, V))}</p>
        ${ul(H.specs.map(s => esc(fill(s, V))), 'i-specs')}
        <a class="btn btn-light btn-sm" href="${b}${slug}">${esc(H.link)} <span class="arrow">→</span></a>
      </div>
    </article>`; };
  const faq = L.pages.faq.items.slice(0, 4);
  return `<section class="i-hero">
  <div class="container i-hero-in">
    <div class="i-hero-text">
      <p class="eyebrow">${esc(T.eyebrow)}</p>
      <h1 class="i-h1 i-h1-xl">${esc(T.h1)}</h1>
      <p class="lead i-lead">${esc(T.lead)}</p>
      <div class="i-cta mt-3"><a class="btn btn-primary btn-lg" href="${b}contact/">${u.quote} <span class="arrow">→</span></a><a class="btn btn-light btn-lg" href="${b}rates/">${u.nav.rates}</a></div>
      <p class="small muted mt-2">${esc(L.common.anyLang)}</p>
    </div>
    <div class="i-hero-img">${img('/assets/img/views/m/v01.webp', T.heroAlt, 960, 540, ' fetchpriority="high"').replace(' loading="lazy"', '')}</div>
  </div>
  <div class="container"><dl class="i-facts">${T.facts.map(([k, v]) => `<div><dt>${esc(fill(k, V))}</dt><dd>${esc(fill(v, V))}</dd></div>`).join('')}</dl></div>
</section>

<section class="section">
  <div class="container">
    <div class="i-head"><h2 class="i-h2">${esc(T.hallsTitle)}</h2><p class="lead">${esc(T.hallsLead)}</p></div>
    <div class="i-halls">${hallCard('g1', 'gundae-1/', 'v08', V.max1)}${hallCard('g2', 'gundae-2/', 'r28', V.max2)}</div>
    <p class="i-note mt-3">${esc(T.both)}</p>
  </div>
</section>

<section class="section i-white">
  <div class="container i-cols">
    <div>
      <h2 class="i-h2">${esc(T.inclTitle)}</h2>
      ${ul(T.incl.map(esc), 'i-chips')}
      <p class="small muted mt-2">${esc(T.inclNote)}</p>
    </div>
    <div>
      <h2 class="i-h2">${esc(T.forTitle)}</h2>
      ${ul(T.for.map(esc), 'i-checks')}
    </div>
  </div>
</section>

<section class="section">
  <div class="container i-cols">
    <div class="i-box">
      <h2 class="i-h2">${esc(T.priceTitle)}</h2>
      ${ul(T.price.map(s => esc(fill(s, V))))}
      <a class="btn btn-primary btn-sm mt-2" href="${b}rates/">${esc(T.priceLink)} <span class="arrow">→</span></a>
    </div>
    <div>
      <h2 class="i-h2">${esc(T.stepsTitle)}</h2>
      <ol class="i-steps">${T.steps.map(([h, d]) => `<li><b>${esc(h)}</b><span>${esc(d)}</span></li>`).join('')}</ol>
      <p class="i-note mt-2">${esc(T.visit)}</p>
    </div>
  </div>
</section>

<section class="section i-white">
  <div class="container i-cols">
    <div>
      <h2 class="i-h2">${esc(T.accessTitle)}</h2>
      <p class="i-addr-line"><b>2F Hanareum Building, 39 Neungdong-ro 13-gil, Gwangjin-gu, Seoul</b><br><span lang="ko">${ADDR_KO}</span></p>
      ${ul(T.access.map(s => esc(fill(s, V))))}
      <div class="i-cta mt-2"><a class="btn btn-light btn-sm" href="${MAPS.naver}" target="_blank" rel="noopener">${u.naver} ↗</a><a class="btn btn-light btn-sm" href="${MAPS.google}" target="_blank" rel="noopener">${u.google} ↗</a><a class="btn btn-ghost btn-sm" href="${b}access/">${esc(T.accessLink)} <span class="arrow">→</span></a></div>
    </div>
    <div>
      <h2 class="i-h2">${esc(T.faqTitle)}</h2>
      <div class="i-faq">${faq.map(([q, a]) => `<details><summary>${esc(fill(q, V))}</summary><p>${esc(fill(a, V))}</p></details>`).join('')}</div>
      <a class="btn btn-ghost btn-sm mt-2" href="${b}faq/">${esc(T.faqLink)} <span class="arrow">→</span></a>
    </div>
  </div>
</section>
${contactBand(L, V)}`;
}

function hallMain(L, D, V, key) {
  const T = L.pages[key], b = `/${L.code}/`, ko = key === 'g1' ? '/spaces/megaspot-gundae/' : '/spaces/megaspot-gundae-2/';
  const compare = T.compare ? `<section class="section i-white"><div class="container"><h2 class="i-h2">${esc(T.compareTitle)}</h2>${table(T.compareHead.map(esc), T.compare.map(r => r.map(c => esc(fill(c, V)))), 'i-compare')}<p class="small muted mt-2">${esc(T.compareNote)}</p></div></section>` : '';
  return `${pageHero(L, T, V, `\n    <div class="i-cta mt-3"><a class="btn btn-primary" href="${b}contact/">${L.ui.quote} <span class="arrow">→</span></a><a class="btn btn-light" href="${b}rates/">${L.ui.nav.rates}</a></div>`)}
<section class="section section--tight">
  <div class="container">
    <dl class="i-spec">${T.specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(fill(v, V))}</dd></div>`).join('')}</dl>
  </div>
</section>
<section class="section i-white">
  <div class="container">
    <div class="i-head"><h2 class="i-h2">${esc(T.galleryTitle)}</h2><p class="small muted">${esc(T.galleryNote)}</p></div>
    ${gallery(T)}
  </div>
</section>
<section class="section">
  <div class="container i-cols">
    <div>
      <h2 class="i-h2">${esc(T.zonesTitle)}</h2>
      <dl class="i-zones">${T.zones.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </div>
    <div>
      <h2 class="i-h2">${esc(T.inclTitle)}</h2>
      ${ul(T.incl.map(s => esc(fill(s, V))), 'i-chips')}
      ${T.inclNote ? `<p class="small muted mt-2">${esc(T.inclNote)}</p>` : ''}
      <h2 class="i-h2 mt-4">${esc(T.forTitle)}</h2>
      ${ul(T.for.map(esc), 'i-checks')}
    </div>
  </div>
</section>
${compare}
<section class="section${compare ? '' : ' i-white'}">
  <div class="container">
    <h2 class="i-h2">${esc(T.rulesTitle)}</h2>
    <dl class="i-rules">${T.rules.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(fill(v, V))}</dd></div>`).join('')}</dl>
    <p class="mt-3"><a class="i-ko-link" href="${ko}" lang="ko" hreflang="ko">${esc(T.koLink)} →</a></p>
  </div>
</section>
${contactBand(L, V)}`;
}

function ratesMain(L, D, V) {
  const T = L.pages.rates, { p1, p2 } = D, m = L.money, cols = p1.cols.map(c => c.id), bands = p1.bands.map(x => x.id);
  const vr = p1.version.match(/v[\d.]+/)[0];
  const hourly = table(['', ...cols.map(c => esc(L.dayCols[c]))], bands.map(id => [`${esc(L.bands[id][0])}<small>${esc(L.bands[id][1])}</small>`, ...cols.map(c => m(p1.hourly[c][id]))]), 'i-rate');
  const pkgs = table(['', ...cols.map(c => esc(L.dayCols[c]))], p1.packages.map(p => { const t = L.pkg[p.id]; if (!t) throw new Error('패키지 번역 없음: ' + p.id); return [`${esc(t[0])}<small>${esc(t[1])} · ${esc(t[2])}</small>`, ...cols.map(c => m(p.price[c]))]; }), 'i-rate');
  // 계산 예시 — 요금표 숫자로 계산
  const ex = T.examples, sat = p1.packages.find(p => p.id === 'day').price.sat;
  const examples = [[fill(ex.morning1, V), `${m(p1.hourly.wd.morning)} × 1 + ${m(p1.surcharge.amount)}`, m(p1.hourly.wd.morning + p1.surcharge.amount)],
    [fill(ex.evening3, V), `${m(p1.hourly.wd.evening)} × 3 + ${m(p1.surcharge.amount)}`, m(p1.hourly.wd.evening * 3 + p1.surcharge.amount)],
    [fill(ex.satDay80, V), `${m(sat)} + ${m(p1.people.extra)} × ${80 - p1.people.base}`, m(sat + p1.people.extra * (80 - p1.people.base))]];
  // 성수기 — 2호 데이터(지난 기간을 뺀 것)를 씁니다. 요금은 1·2호 공통입니다.
  const pk = p2.peak, periods = pk.periods;
  const monthOf = id => { for (const [ym, map] of Object.entries(pk.months)) for (const [col, t] of Object.entries(map)) if (t === id) return { month: +ym.slice(5), col }; return null; };
  const peakRows = Object.values(pk.order).flat().map(id => {
    const t = pk.types[id]; if (!t) throw new Error('성수기 구분 없음: ' + id);
    const dates = Object.keys(pk.dates).filter(d => pk.dates[d] === id).sort(), mo = monthOf(id);
    if (!dates.length && !mo) throw new Error('성수기 구분 날짜를 찾지 못했습니다: ' + id);
    return [esc(L.peakLabel({ month: mo && mo.month, col: mo && mo.col, dates, sale: t.sale || 0 })), ...bands.map(bd => m(t.hourly[bd])), m(t.surcharge), ...p1.packages.map(p => m(t.pkg[p.id]))];
  });
  const opt = p1.options.map(o => { const t = L.options[o.id]; if (!t) throw new Error('옵션 번역 없음: ' + o.id); return [esc(t[0]), `${m(o.price)} <small>${esc(t[1])}</small>`, esc(t[2])]; });
  const refund = p1.refund.map(r => { const t = L.refund[r.k]; if (!t) throw new Error('환불 기준 번역 없음: ' + r.k); return [esc(t), L.pct(r.rate)]; });
  const rule = L.dayRule;
  return `${pageHero(L, T, { ...V, version: L.version(vr, p1.effectiveFrom) })}
<section class="section">
  <div class="container">
    <h2 class="i-h2">${esc(T.calcTitle)}</h2>
    <dl class="i-rules i-rules-2">${T.calc.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(fill(v, V))}</dd></div>`).join('')}</dl>
  </div>
</section>
<section class="section i-white" id="hourly">
  <div class="container">
    <div class="i-head"><h2 class="i-h2">${esc(T.hourlyTitle)}</h2><p class="small muted">${esc(fill(T.hourlyNote, V))}</p></div>
    ${hourly}
    <h3 class="i-h3 mt-4">${esc(rule.title)}</h3>
    <p class="small muted">${esc(rule.lead)}</p>
    ${table(rule.head.map(esc), cols.map(c => [esc(L.dayCols[c]), esc(rule.rows[c][0]), esc(rule.rows[c][1])]), 'i-dayrule')}
  </div>
</section>
<section class="section" id="packages">
  <div class="container">
    <div class="i-head"><h2 class="i-h2">${esc(T.pkgTitle)}</h2><p class="small muted">${esc(fill(T.pkgNote, V))}</p></div>
    ${pkgs}
    <h3 class="i-h3 mt-4">${esc(T.examplesTitle)}</h3>
    <ul class="i-examples">${examples.map(([t, f, r]) => `<li><span>${esc(t)}</span><small>${esc(f)}</small><b>${r}</b></li>`).join('')}</ul>
  </div>
</section>
<section class="section i-white" id="peak">
  <div class="container">
    <div class="i-head"><h2 class="i-h2">${esc(T.peakTitle)} · ${esc(L.peakRange(periods[0].from, periods[periods.length - 1].to))}</h2><p class="small muted">${esc(fill(T.peakLead, V))}</p></div>
    ${table(T.peakHead.map(esc), peakRows, 'i-peak')}
    ${ul(T.peakNotes.map(esc), 'i-list small muted mt-2')}
  </div>
</section>
<section class="section" id="options">
  <div class="container">
    <h2 class="i-h2">${esc(T.optTitle)}</h2>
    ${table(T.optHead.map(esc), opt, 'i-opt')}
    <h3 class="i-h3 mt-3">${esc(T.askTitle)}</h3>
    ${ul(L.askOptions.map(esc), 'i-chips')}
  </div>
</section>
<section class="section i-white" id="deposit">
  <div class="container i-cols">
    <div>
      <h2 class="i-h2">${esc(T.depositTitle)}</h2>
      ${ul(T.deposit.map(s => esc(fill(s, V))))}
    </div>
    <div id="refund">
      <h2 class="i-h2">${esc(T.refundTitle)}</h2>
      ${table(T.refundHead.map(esc), refund, 'i-refund')}
      <p class="small muted mt-1">${esc(T.refundNote)}</p>
      ${ul(T.refundMore.map(esc), 'i-list small mt-2')}
    </div>
  </div>
</section>
<section class="section">
  <div class="container i-cols">
    <div class="i-box"><h2 class="i-h3">${esc(T.specialTitle)}</h2><p>${esc(T.special)}</p></div>
    <div class="i-box"><h2 class="i-h3">${esc(T.foodTitle)}</h2><p>${esc(T.food)}</p></div>
  </div>
</section>
${contactBand(L, V)}`;
}

function accessMain(L, D, V) {
  const T = L.pages.access, u = L.ui;
  const tickets = Object.entries(TICKETS).map(([id, t]) => { const n = L.parking[id]; if (!n) throw new Error('주차권 번역 없음: ' + id); return [esc(n), L.money(t.price)]; });
  return `${pageHero(L, T, V)}
<section class="section">
  <div class="container i-cols">
    <div>
      <h2 class="i-h2">${esc(T.addrTitle)}</h2>
      <p class="i-addr-line"><b>${esc(T.addrEn)}</b><br><span class="small muted">${esc(T.addrLot)}</span></p>
      <div class="i-taxi">
        <p class="i-taxi-h">${esc(T.taxiTitle)}</p>
        <p class="i-taxi-addr" lang="ko" data-copy-src>${ADDR_KO}</p>
        <p class="small muted">${esc(T.taxiNote)}</p>
        <button class="btn btn-light btn-sm" type="button" data-copy="${ADDR_KO}" data-done="${esc(u.copied)}">${esc(u.copy)}</button>
      </div>
      <div class="i-cta mt-3"><a class="btn btn-primary btn-sm" href="${MAPS.naver}" target="_blank" rel="noopener">${u.naver} ↗</a><a class="btn btn-light btn-sm" href="${MAPS.kakao}" target="_blank" rel="noopener">${u.kakaoMap} ↗</a><a class="btn btn-light btn-sm" href="${MAPS.google}" target="_blank" rel="noopener">${u.google} ↗</a></div>
      <p class="small muted mt-1">${esc(T.mapsNote)}</p>
    </div>
    <div>
      <h2 class="i-h2">${esc(T.subwayTitle)}</h2>
      ${ul(T.subway.map(esc))}
      <h2 class="i-h2 mt-4">${esc(T.buildingTitle)}</h2>
      ${ul(T.building.map(esc))}
    </div>
  </div>
</section>
<section class="section i-white" id="parking">
  <div class="container i-cols">
    <div>
      <h2 class="i-h2">${esc(T.parkTitle)}</h2>
      ${ul(T.park.map(s => esc(fill(s, V))))}
      <a class="btn btn-light btn-sm mt-2" href="/parking/purchase/" lang="ko">${esc(T.parkBuy)} ↗</a>
    </div>
    <div>${table(T.parkHead.map(esc), tickets, 'i-park')}
      <h3 class="i-h3 mt-3">${esc(T.nearbyTitle)}</h3><p class="small">${esc(T.nearby)}</p>
    </div>
  </div>
</section>
<section class="section">
  <div class="container">
    <h2 class="i-h2">${esc(T.routeTitle)}</h2>
    <div class="i-gallery i-route" data-i-gallery>${Object.entries(T.route).map(([id, cap], i) => `<figure class="i-ph"><a href="/assets/img/parking-route-20261104/${id}.webp" data-full="/assets/img/parking-route-20261104/${id}.webp">${img(`/assets/img/parking-route-20261104/${id}.webp`, cap, 1280, 960)}</a><figcaption><b>${String(i + 1).padStart(2, '0')}</b> ${esc(cap)}</figcaption></figure>`).join('')}</div>
  </div>
</section>
${contactBand(L, V)}`;
}

function faqMain(L, D, V) {
  const T = L.pages.faq;
  return `${pageHero(L, T, V)}
<section class="section">
  <div class="container i-narrow">
    <div class="i-faq i-faq-all">${T.items.map(([q, a], i) => `<details${i < 2 ? ' open' : ''}><summary>${esc(fill(q, V))}</summary><p>${esc(fill(a, V))}</p></details>`).join('')}</div>
  </div>
</section>
${contactBand(L, V)}`;
}

function contactMain(L, D, V) {
  const T = L.pages.contact, f = T.f, u = L.ui, opts = [];
  for (let h = 5; h <= 31; h++) opts.push(`<option value="${h}">${String(h % 24).padStart(2, '0')}:00${h >= 24 ? ' ' + esc(f.nextDay) : ''}</option>`);
  const sel = (name, def) => `<select class="select" name="${name}" data-default="${def}">${opts.join('').replace(`value="${def}"`, `value="${def}" selected`)}</select>`;
  const req = `<em class="i-req" aria-hidden="true">*</em>`;
  const msgs = Object.fromEntries(Object.entries(T.err).map(([k, v]) => [k, fill(v, V)]));
  return `${pageHero(L, T, V)}
<section class="section">
  <div class="container i-contact">
    <form class="i-form card" id="i-form" novalidate data-lang="${L.code}" data-msgs="${esc(JSON.stringify({ ...msgs, done: T.done, sending: f.sending }))}">
      <h2 class="i-h3">${esc(T.formTitle)}</h2>
      <div class="i-grid">
        <label class="i-f"><span>${esc(f.name)} ${req}</span><input class="input" name="name" autocomplete="name" maxlength="80" required></label>
        <label class="i-f"><span>${esc(f.org)}</span><input class="input" name="org" autocomplete="organization" maxlength="120"></label>
        <label class="i-f"><span>${esc(f.email)} ${req}</span><input class="input" type="email" name="email" autocomplete="email" maxlength="120" required></label>
        <label class="i-f"><span>${esc(f.phone)} ${req}</span><input class="input" type="tel" name="phone" autocomplete="tel" maxlength="30" required placeholder="+"><small>${esc(f.phoneHint)}</small></label>
      </div>
      <fieldset class="i-f i-radios"><legend>${esc(f.pref)}</legend>${Object.entries(f.prefs).map(([k, v], i) => `<label><input type="radio" name="pref" value="${k}"${i === 0 ? ' checked' : ''}> ${esc(v)}</label>`).join('')}</fieldset>
      <fieldset class="i-f i-radios"><legend>${esc(f.hall)}</legend>${Object.entries(f.halls).map(([k, v], i) => `<label><input type="radio" name="hall" value="${k}"${i === 2 ? ' checked' : ''}> ${esc(fill(v, V))}</label>`).join('')}</fieldset>
      <div class="i-grid">
        <label class="i-f"><span>${esc(f.date)} ${req}</span><input class="input" type="date" name="date" required></label>
        <label class="i-f i-check-inline"><input type="checkbox" name="flex"> ${esc(f.flex)}</label>
        <label class="i-f"><span>${esc(f.start)}</span>${sel('start', 18)}</label>
        <label class="i-f"><span>${esc(f.end)}</span>${sel('end', 22)}</label>
        <label class="i-f"><span>${esc(f.guests)} ${req}</span><input class="input" type="number" name="guests" min="1" max="2000" inputmode="numeric" required></label>
        <label class="i-f"><span>${esc(f.purpose)}</span><select class="select" name="purpose">${Object.entries(f.purposes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      </div>
      <label class="i-f"><span>${esc(f.message)}</span><textarea class="input" name="message" rows="5" maxlength="2000" placeholder="${esc(f.messageHint)}"></textarea></label>
      <label class="i-check"><input type="checkbox" name="visit"> ${esc(f.visit)}</label>
      <label class="i-f i-visit-date" hidden><span>${esc(f.visitDate)}</span><input class="input" type="date" name="visit_date"></label>
      <label class="i-check i-consent"><input type="checkbox" name="consent" required> <span>${esc(f.consent)} <a href="/privacy/" target="_blank" rel="noopener" lang="ko">${esc(f.privacy)} ↗</a></span></label>
      <p class="i-err" role="alert" hidden></p>
      <button class="btn btn-primary btn-lg" type="submit">${esc(f.submit)} <span class="arrow">→</span></button>
      <p class="small muted">${req} ${esc(f.required)}</p>
    </form>
    <div class="i-done card" id="i-done" hidden tabindex="-1"></div>
    <aside class="i-aside">
      <div class="card">
        <h2 class="i-h3">${esc(T.directTitle)}</h2>
        <ul class="i-direct">
          <li><span>${u.email}</span><a href="mailto:${EMAIL}?subject=MEGASPOT%20inquiry" data-email="inquiry">${EMAIL}</a></li>
          <li><span>${u.kakao}</span><a href="${KAKAO}" target="_blank" rel="noopener" data-kakao>pf.kakao.com/_LnxbmX/chat</a></li>
          <li><span>${u.phone}</span><a href="tel:${TEL}" data-phone>${PHONE}</a></li>
        </ul>
        <a class="i-qr" href="${KAKAO}" target="_blank" rel="noopener" data-kakao><img src="/assets/img/brand/kakao-qr.svg" width="96" height="96" alt="MEGASPOT KakaoTalk channel QR code" loading="lazy"></a>
        <p class="small muted">${esc(L.common.hours)} ${esc(L.common.reply)}</p>
      </div>
      <div class="card mt-2">
        <h2 class="i-h3">${esc(T.tellTitle)}</h2>
        ${ul(T.tell.map(esc), 'i-checks')}
      </div>
    </aside>
  </div>
</section>`;
}

/* ---------- 구조화 데이터 ---------- */
function venue(L, D, key) {
  const s = key === 'g1' ? D.s1 : D.s2, p = key === 'g1' ? D.p1 : D.p2;
  return { '@type': 'EventVenue', '@id': `${SITE}/${L.code}/${key === 'g1' ? 'gundae-1' : 'gundae-2'}/#venue`, name: `MEGASPOT ${key === 'g1' ? 'Gundae 1' : 'Gundae 2'}`, url: `${SITE}/${L.code}/${key === 'g1' ? 'gundae-1' : 'gundae-2'}/`,
    address: POSTAL_ADDRESS,   // 한국어 화면과 같은 도로명 주소 (tests/nap.test.mjs)
    geo: { '@type': 'GeoCoordinates', latitude: GEO.lat, longitude: GEO.lng }, maximumAttendeeCapacity: p.people.max, floorSize: { '@type': 'QuantitativeValue', value: s.area.m2, unitCode: 'MTK' },
    telephone: PHONE, email: EMAIL, sameAs: [`${SITE}${key === 'g1' ? '/spaces/megaspot-gundae/' : '/spaces/megaspot-gundae-2/'}`] };
}
function ld(L, D, page, T, V) {
  const url = `${SITE}/${L.code}/${page.slug}`, graph = [{ '@type': 'WebPage', '@id': url + '#webpage', url, name: T.title, description: T.desc, inLanguage: L.html }];
  if (page.key !== 'home') graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: L.ui.home, item: `${SITE}/${L.code}/` }, { '@type': 'ListItem', position: 2, name: T.crumb, item: url }] });
  if (page.key === 'home') graph.push(venue(L, D, 'g1'), venue(L, D, 'g2'));
  if (page.key === 'g1' || page.key === 'g2') graph.push(venue(L, D, page.key));
  if (page.key === 'faq') graph.push({ '@type': 'FAQPage', mainEntity: T.items.map(([q, a]) => ({ '@type': 'Question', name: fill(q, V), acceptedAnswer: { '@type': 'Answer', text: fill(a, V) } })) });
  return { '@context': 'https://schema.org', '@graph': graph };
}

/* ---------- 만들기 ---------- */
const MAIN = { home: homeMain, g1: (L, D, V) => hallMain(L, D, V, 'g1'), g2: (L, D, V) => hallMain(L, D, V, 'g2'), rates: ratesMain, access: accessMain, faq: faqMain, contact: contactMain };
export function buildPages() {
  const D = loadData(), out = {};
  for (const L of LANGS) {
    const V = vars(L, D);
    for (const page of PAGES) {
      const T = L.pages[page.key]; if (!T) throw new Error(`${L.code}: ${page.key} 글이 없습니다`);
      out[`${L.code}/${page.slug}index.html`] = shell(L, page, T, ld(L, D, page, T, V), MAIN[page.key](L, D, V));
    }
  }
  return out;
}
// 한국어 짝 화면: <link rel="canonical"> 바로 아래에 hreflang 구간을 둡니다 (예전 hreflang 줄은 이 구간으로 바꿉니다)
export function koAlternates(src, page) {
  const block = `<!-- i18n:alternates · tools/i18n/build.mjs 가 고칩니다 -->\n${alternates(page).map(([hl, href]) => `<link rel="alternate" hreflang="${hl}" href="${href}">`).join('\n')}\n<!-- /i18n:alternates -->`;
  let s = src.replace(/<!-- i18n:alternates[^>]*-->[\s\S]*?<!-- \/i18n:alternates -->/, '\u0000');
  s = s.replace(/^<link rel="alternate" hreflang="[^"]+" href="[^"]+">\n/gm, '');
  if (s.includes('\u0000')) return s.replace('\u0000', block);
  const m = s.match(/<link rel="canonical" href="[^"]+">\n/); if (!m) throw new Error('canonical 을 찾지 못했습니다: ' + page.ko);
  return s.replace(m[0], m[0] + block + '\n');
}
export function sitemapBlock(src) {
  const urls = [];
  for (const page of PAGES) for (const L of LANGS) urls.push(`  <url><loc>${SITE}/${L.code}/${page.slug}</loc><lastmod>${UPDATED}</lastmod><changefreq>monthly</changefreq><priority>${page.key === 'home' ? '0.6' : '0.5'}</priority>\n${alternates(page).map(([hl, href]) => `    <xhtml:link rel="alternate" hreflang="${hl}" href="${href}"/>`).join('\n')}\n  </url>`);
  const body = `  <!-- i18n:start · tools/i18n/build.mjs 가 만드는 구간입니다. 손으로 고치지 마세요 -->\n${urls.join('\n')}\n  <!-- i18n:end -->\n`;
  let s = src.replace(/  <url><loc>https:\/\/megaspot\.kr\/en\/<\/loc>[^\n]*\n  <\/url>\n/, '');   // 예전 영어 화면 한 줄
  if (!/xmlns:xhtml=/.test(s)) s = s.replace('<urlset ', '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml" ');
  const re = /[ \t]*<!-- i18n:start[^>]*-->[\s\S]*?<!-- i18n:end -->\n?/;
  if (re.test(s)) return s.replace(re, body);
  const i = s.lastIndexOf('</urlset>'); return s.slice(0, i) + body + s.slice(i);
}
export function buildAll() {
  const files = buildPages();
  for (const page of PAGES) if (page.ko) files[KO_FILE[page.ko]] = koAlternates(read(KO_FILE[page.ko]), page);
  files['sitemap.xml'] = sitemapBlock(read('sitemap.xml'));
  return files;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const check = process.argv.includes('--check'), files = buildAll(), off = [];
  for (const [rel, html] of Object.entries(files)) {
    const p = join(ROOT, rel), cur = existsSync(p) ? readFileSync(p, 'utf8') : null;
    if (cur !== html) { off.push(rel); if (!check) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, html); } }
  }
  if (check) {
    if (off.length) { console.log('외국어 화면이 최신이 아닙니다 (node tools/i18n/build.mjs):\n' + off.join('\n')); process.exit(1); }
    console.log('외국어 화면이 모두 최신입니다.');
  } else console.log(off.length ? `파일 ${off.length}개를 고쳤습니다.` : '모두 최신입니다.');
}
