#!/usr/bin/env node
// 공간 모음(/venues/…)과 행사 준비 가이드(/event-guide/…) 페이지를 만듭니다.
//   node tools/seo-pages/build.mjs           HTML 을 다시 만들고 sitemap.xml · rss.xml 의 해당 구간을 고칩니다
//   node tools/seo-pages/build.mjs --check   저장된 파일이 최신인지 확인만 합니다 (다르면 종료 코드 1)
//  · 내용은 venues.mjs(공간 모음) · guides.mjs(가이드 글) · capacity.mjs(면적 기준)에 있습니다.
//  · 머리말·꼬리말과 자산 버전은 about/index.html · planning/index.html 에서 읽어 오므로, 공통 메뉴가 바뀌면 다시 실행하면 됩니다.
//  · 직영 공간의 면적·최대 인원은 assets/js/data/spaces.js, 입점 이용료는 functions/api/_hostplat.js 의 값을 씁니다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { HUBS, INDEX as HUB_INDEX, NAV, DIRECT_COPY, UPDATED as HUB_UPDATED } from './venues.mjs';
import { GUIDES, INDEX as GUIDE_INDEX, UPDATED as GUIDE_UPDATED } from './guides.mjs';
import * as cap from './capacity.mjs';
import { PLATFORM } from '../../functions/api/_hostplat.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://megaspot.kr', ASSET_V = '20261113seo1';
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = s => String(s).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
const man = n => { n = Number(n || 0); if (n >= 10000 && n % 1000 === 0) { const m = n / 10000; return (m % 1 === 0 ? m.toLocaleString('ko-KR') : m.toFixed(1)) + '만 원'; } return won(n); };
const ld = o => JSON.stringify(o).replace(/</g, '\\u003c');

// ---------- 공통 틀 ----------
function shell() {
  const about = read('about/index.html'), planning = read('planning/index.html');
  const v = (src, re, what) => { const m = src.match(re); if (!m) throw new Error('기준 페이지에서 ' + what + ' 을(를) 찾지 못했습니다'); return m[1]; };
  const hs = about.indexOf('<a class="skip-link"'), he = about.indexOf('<main'), fs = about.indexOf('<footer class="site-footer">'), fe = about.indexOf('</footer>');
  if (hs < 0 || he < 0 || fs < 0 || fe < 0) throw new Error('about/index.html 에서 머리말·꼬리말을 찾지 못했습니다');
  return { header: about.slice(hs, he).trimEnd(), footer: about.slice(fs, fe + '</footer>'.length),
    siteCss: v(about, /\/assets\/css\/site\.css\?v=([^"]+)"/, 'site.css 버전'), mobile: v(about, /\/assets\/css\/mobile-viewport\.css\?v=([^"]+)"/, 'mobile-viewport 버전'),
    siteJs: v(about, /\/assets\/js\/site\.js\?v=([^"]+)"/, 'site.js 버전'), platformCss: v(planning, /\/assets\/css\/platform\.css\?v=([^"]+)"/, 'platform.css 버전'),
    naver: (about.match(/<meta name="naver-site-verification" content="[^"]*">/) || [''])[0] };
}
function spaces() {
  const ctx = { window: {} }; vm.runInNewContext(read('assets/js/data/spaces.js'), ctx);
  const feat = Object.fromEntries((ctx.window.MEGASPOT_FEATURES || []).map(f => [f.id, f.label]));
  return { list: ctx.window.MEGASPOT_SPACES || [], feat };
}
const IMG_DIR = { p: 'gundae', s: 'scenes', v: 'views', a: 'aerial', r: 'gundae2' };
function thumb(id) { const p = `/assets/img/${IMG_DIR[String(id)[0]] || 'gundae'}/t/${id}.jpg`; if (!existsSync(path.join(ROOT, p))) throw new Error('대표 사진이 없습니다: ' + p); return p; }

function page(S, o) {
  const url = SITE + o.path, image = `${SITE}/assets/img/brand/og-megaspot.jpg`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="author" content="메가스팟 MEGASPOT">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="NaverBot" content="All">
<meta name="Yeti" content="All">
<meta name="theme-color" content="#F1EFEB">
<link rel="canonical" href="${url}">
<link rel="alternate" type="application/rss+xml" title="메가스팟 안내 페이지 RSS" href="${SITE}/rss.xml">
<meta property="og:type" content="${o.article ? 'article' : 'website'}">
<meta property="og:site_name" content="메가스팟 MEGASPOT">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(o.og)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="메가스팟 — 큰 모임에 맞는 공간을 찾다">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.og)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${image}">
${S.naver}
<link rel="icon" href="/assets/img/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Black+Han+Sans&display=swap">
<link rel="stylesheet" href="/assets/css/site.css?v=${S.siteCss}">
<link rel="stylesheet" href="/assets/css/platform.css?v=${S.platformCss}">
<link rel="stylesheet" href="/assets/css/hub.css?v=${ASSET_V}">
<link rel="stylesheet" href="/assets/css/mobile-viewport.css?v=${S.mobile}">
<script src="/assets/js/mobile-viewport.js?v=${S.mobile}" defer></script>
<script type="application/ld+json">${ld({ '@context': 'https://schema.org', '@graph': o.graph })}</script>
${o.headExtra || ''}</head>
<body class="${o.bodyClass}">
${S.header}
<main id="main">
${o.main.trim()}
</main>
${S.footer}
<script src="/assets/js/site.js?v=${S.siteJs}"></script>
${o.scripts || ''}</body>
</html>
`;
}
const crumbsLd = (url, trail) => ({ '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: trail.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + p })) });
const faqLd = (url, faq) => ({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const crumbs = trail => `<div class="crumbs"><a href="/">홈</a>${trail.map(([name, p], i) => `<span>/</span>${i < trail.length - 1 ? `<a href="${p}">${esc(name)}</a>` : `<span>${esc(name)}</span>`}`).join('')}</div>`;
const faqHtml = faq => `<div class="pf-faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;

// ---------- 면적 표 · 계산기 ----------
function areaTable(ns) {
  return `<div class="hub-table-wrap"><table class="hub-table n${ns.length}">
<thead><tr><th>배치</th><th>1명당 면적</th><th>1평에 들어가는 인원</th>${ns.map(n => `<th>${n}명 좌석 면적</th>`).join('')}</tr></thead>
<tbody>${cap.LAYOUTS.map(l => `<tr><th>${esc(l.label)}<small>${esc(l.note)}</small></th><td>${cap.range(cap.m2Per(l).map(x => x.toFixed(2)), '㎡')}</td><td>${cap.range(cap.perPyeong(l).map(x => x.toFixed(1)), '명')}</td>${ns.map(n => `<td><b>${cap.need(n, l.id)}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const areaSource = () => `<p class="hub-src">좌석 면적만 계산한 값입니다. 무대, 통로, 음식 테이블, 접수 자리는 따로 더해야 합니다. 기준 출처: ${esc(cap.SOURCE.name)}, “${esc(cap.SOURCE.title)}” (<a href="${cap.SOURCE.url}" target="_blank" rel="noopener">원문 보기</a>)를 ㎡·평으로 환산.</p>`;
function calc() {
  const data = { sqft: cap.SQFT, pyeong: cap.PYEONG, layouts: cap.LAYOUTS.map(l => ({ id: l.id, label: l.label, sqft: l.sqft })) }, d = cap.layout('theater'), py = cap.pyeongFor(100, d);
  return `<div class="cc-box" id="cc" data-calc="${esc(JSON.stringify(data))}">
<div class="cc-tabs" role="group" aria-label="계산 방식"><button type="button" data-mode="area" aria-pressed="true">인원으로 평수 계산</button><button type="button" data-mode="people" aria-pressed="false">평수로 인원 계산</button></div>
<div class="cc-in">
<div><label for="cc-n" id="cc-n-label">참석 인원 (명)</label><input class="input" id="cc-n" type="number" inputmode="numeric" min="1" max="99999" value="100"></div>
<div><label for="cc-layout">배치</label><select class="select" id="cc-layout">${cap.LAYOUTS.map(l => `<option value="${l.id}"${l.id === 'theater' ? ' selected' : ''}>${esc(l.label)} (${esc(l.note)})</option>`).join('')}</select></div>
<div><label for="cc-buffer">여유</label><select class="select" id="cc-buffer"><option value="0">좌석 면적만</option><option value="10">10% 더하기</option><option value="20">20% 더하기</option></select></div>
</div>
<div class="cc-out" id="cc-out" aria-live="polite"><small>100명 · ${esc(d.label)} · 좌석 면적</small><strong>${cap.range(py, '평')}</strong><p>약 ${Math.round(100 * d.sqft[0] * cap.SQFT)}~${Math.round(100 * d.sqft[1] * cap.SQFT)}㎡입니다. 무대와 통로, 음식 테이블 자리는 따로 더해야 합니다.</p><div class="row"><a class="btn btn-primary btn-sm" href="/spaces/?people=100">100명이 들어가는 공간 찾기 →</a></div></div>
</div>`;
}

// ---------- 공간 모음 ----------
const hubPath = slug => slug ? `/venues/${slug}/` : '/venues/';
const guidePath = slug => slug ? `/event-guide/${slug}/` : '/event-guide/';
function hubNav(current) {
  return `<nav class="hub-nav" aria-label="인원·목적·지역별 공간 모음">${NAV.map(g => `<div class="hub-nav-row"><b>${esc(g.group)}</b>${g.items.map(([slug, label]) => `<a href="${hubPath(slug)}"${slug === current ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</div>`).join('')}</nav>`;
}
function directCard(SP, id) {
  const s = SP.list.find(x => x.id === id); if (!s) throw new Error('직영 공간이 없습니다: ' + id);
  const c = DIRECT_COPY[id], tier = s.capacity.max >= 100 || s.area.pyeong >= 100 ? 'mega' : 'large';
  return `<a class="space-card" href="/spaces/${s.slug}/" data-direct="${esc(id)}" data-area="${s.area.pyeong}" data-cap="${s.capacity.max}">`
    + `<div class="ph"><img src="${thumb(s.cover)}" alt="${esc(s.name)} 대표 이미지" loading="lazy" width="640" height="480"><span class="badge badge-direct">직영 · 메가스팟 운영</span></div>`
    + `<div class="bd"><div class="row between"><h3>${esc(s.name)}</h3><span class="pf-tier t-${tier}">${tier === 'mega' ? '초대형' : '대형'}</span></div>`
    + `<div class="loc">${esc(c.loc)}</div><p class="mt-1 small muted">${esc(c.text)}</p>`
    + `<div class="specs"><span><b>${s.area.pyeong}</b>평</span><span>최대 <b>${s.capacity.max}</b>명</span>${s.parking && s.parking.spaces ? `<span>주차 최대 <b>${s.parking.spaces}</b>대</span>` : ''}</div>`
    + `<div class="tags mt-2">${(s.features || []).slice(0, 4).map(f => `<span class="tag">${esc(SP.feat[f] || f)}</span>`).join('')}</div>`
    + `<div class="foot"><span class="muted">${esc(c.foot)}</span><span style="font-weight:700;color:var(--cobalt)">자세히 보기 →</span></div></div></a>`;
}
function hubList(SP, h, heading, lead) {
  const items = h.direct.map(id => SP.list.find(x => x.id === id));
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', name: heading, numberOfItems: items.length, itemListElement: items.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${SITE}/spaces/${s.slug}/` })) };
  return { head: `<script type="application/ld+json" id="hub-itemlist">${ld(list)}</script>\n`, html: `
<section class="section" id="list">
  <div class="container">
    <div class="pf-sec-head">
      <div class="eyebrow">01 · Spaces</div>
      <h2 class="h-l mt-1">${esc(heading)}</h2>
      <p class="hub-count mt-2" id="hub-count">지금 볼 수 있는 공간 <b>${items.length}</b>곳${lead ? ' · ' + esc(lead) : ''}</p>
    </div>
    <div class="grid grid-3 hub-list" id="hub-list" data-people="${h.people || ''}" data-types="${(h.types || []).join(',')}" data-region="${h.region || ''}">
${h.direct.map(id => directCard(SP, id)).join('\n')}
<!--hub:host-->
    </div>
    <div class="hub-after">
      <p>입점 공간은 심사를 마치는 대로 이 목록에 올라옵니다. 찾는 조건의 공간이 보이지 않으면 날짜와 인원을 남겨 주세요. 맞는 공간을 찾아 연락드립니다.</p>
      <div class="row"><a class="btn btn-primary btn-sm" href="${h.search[0]}">${esc(h.search[1])} →</a><a class="btn btn-light btn-sm" href="/planning/">조건 남기고 추천받기</a></div>
    </div>
  </div>
</section>` };
}
const guideLinks = (slugs, cls = '') => `<div class="hub-links ${cls}">${slugs.map(slug => { const g = GUIDES.find(x => x.slug === slug); if (!g) throw new Error('가이드가 없습니다: ' + slug); return `<a href="${guidePath(slug)}"><small>${g.tool ? '계산기' : '가이드'}</small><b>${esc(text(g.h1))}</b><span>${esc(g.card)}</span></a>`; }).join('')}</div>`;
const hostStrip = () => `
<section class="section">
  <div class="container">
    <div class="pf-strip light">
      <div>
        <h2>이런 공간을 운영하고 계신가요</h2>
        <p>50명 이상 모일 수 있거나 50평이 넘는 공간이라면 메가스팟에 올려 보세요. 입점·등록 비용과 결제 수수료가 없고, 등록 기간에 따른 월 정액 이용료만 냅니다.</p>
        <ul><li>결제 수수료 0원</li><li>공간 공개 후 ${PLATFORM.freeMonths}개월 무료</li><li>50명 또는 50평 이상</li></ul>
      </div>
      <div class="row"><a class="btn btn-primary" href="/host/register/">입점 신청</a><a class="btn btn-light" href="/host/">입점 안내·이용료</a></div>
    </div>
  </div>
</section>`;

function renderHub(S, SP, h) {
  const p = hubPath(h.slug), url = SITE + p, navLabel = NAV.flatMap(g => g.items).find(i => i[0] === h.slug)[1], trail = [['공간 모음', '/venues/'], [navLabel, p]];
  const list = hubList(SP, h, h.listTitle, '');
  const others = NAV.flatMap(g => g.items).filter(i => i[0] !== h.slug);
  const main = `
<section class="hl-hero hub-hero">
  <div class="container">
    ${crumbs(trail)}
    <div class="eyebrow mt-2">${esc(h.eyebrow)}</div>
    <h1 class="h-xl mt-1">${h.h1}</h1>
    <p class="lead">${esc(h.lead)}</p>
    <div class="row">
      <a class="btn btn-primary btn-lg" href="${h.search[0]}">${esc(h.search[1])} <span class="arrow">→</span></a>
      <a class="btn btn-light btn-lg" href="#list">공간 목록 보기</a>
    </div>
    ${hubNav(h.slug)}
  </div>
</section>
${list.html}
${h.table ? `
<section class="section sec-white sec-line" id="area">
  <div class="container">
    <div class="pf-sec-head">
      <div class="eyebrow">02 · How much space</div>
      <h2 class="h-l mt-1">${h.table}명이면 몇 평이 필요할까</h2>
      <p class="lead">필요한 면적은 인원보다 배치가 정합니다. 아래는 ${h.table}명이 앉거나 서는 자리만 계산한 면적입니다.</p>
    </div>
    ${areaTable([h.table])}
    ${areaSource()}
    <p class="mt-2"><a class="pf-link" href="/event-guide/capacity/">다른 인원으로 계산해 보기 → 필요 평수 계산기</a></p>
  </div>
</section>` : ''}
<section class="section${h.table ? '' : ' sec-white sec-line'}" id="check">
  <div class="container">
    <div class="pf-sec-head">
      <div class="eyebrow">${h.table ? '03' : '02'} · Checklist</div>
      <h2 class="h-l mt-1">${esc(h.guideTitle)}</h2>
      <p class="lead">${esc(h.guideLead)}</p>
    </div>
    <ul class="hub-checks">${h.points.map(([b, t]) => `<li><b>${esc(b)}</b><span>${esc(t)}</span></li>`).join('')}</ul>
    ${h.after || ''}
  </div>
</section>
<section class="section sec-white sec-line" id="faq">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">${h.table ? '04' : '03'} · FAQ</div><h2 class="h-l mt-1">자주 묻는 질문</h2></div>
    ${faqHtml(h.faq)}
  </div>
</section>
<section class="section" id="more">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">${h.table ? '05' : '04'} · Read next</div><h2 class="h-l mt-1">함께 보면 좋은 글</h2></div>
    ${guideLinks(h.guides, 'c3')}
    <h3 class="mt-4" style="font-size:18px">다른 모음 보기</h3>
    <nav class="hub-nav" style="border-top:0;padding-top:0;margin-top:12px" aria-label="다른 공간 모음"><div class="hub-nav-row"><a href="/venues/">전체 모음</a>${others.map(([slug, label]) => `<a href="${hubPath(slug)}">${esc(label)}</a>`).join('')}<a href="/purpose/">건대 직영 공간 목적별 안내</a></div></nav>
  </div>
</section>
${hostStrip()}`;
  const graph = [
    { '@type': 'CollectionPage', '@id': url + '#webpage', url, name: h.title, description: h.desc, inLanguage: 'ko', dateModified: HUB_UPDATED, isPartOf: { '@id': SITE + '/#website' }, publisher: { '@id': SITE + '/#org' }, breadcrumb: { '@id': url + '#breadcrumb' } },
    crumbsLd(url, [['메가스팟', '/'], ...trail]), faqLd(url, h.faq)
  ];
  return page(S, { path: p, title: h.title, desc: h.desc, og: h.og, graph, headExtra: list.head, bodyClass: 'page-hub page-hub-' + h.slug, main });
}
function renderHubIndex(S, SP) {
  const I = HUB_INDEX, p = '/venues/', url = SITE + p, trail = [['공간 모음', p]];
  const list = hubList(SP, { people: 0, types: [], region: '', direct: SP.list.filter(s => s.type === 'direct').map(s => s.id), search: ['/spaces/', '지역·인원·날짜로 검색'] }, '메가스팟에 등록된 공간', '');
  const main = `
<section class="hl-hero hub-hero">
  <div class="container">
    ${crumbs(trail)}
    <div class="eyebrow mt-2">${esc(I.eyebrow)}</div>
    <h1 class="h-xl mt-1">${I.h1}</h1>
    <p class="lead">${esc(I.lead)}</p>
    <div class="row">
      <a class="btn btn-primary btn-lg" href="/spaces/">지역·인원·날짜로 검색 <span class="arrow">→</span></a>
      <a class="btn btn-light btn-lg" href="/planning/">조건 남기고 추천받기</a>
    </div>
  </div>
</section>
<section class="section" id="by-size">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">01 · By headcount</div><h2 class="h-l mt-1">몇 명이 모이나요</h2><p class="lead">가까운 인원을 고르면 그 인원 이상을 받는 공간만 나옵니다. 정확한 인원으로 찾으려면 공간 검색에 인원을 넣어 보세요.</p></div>
    <div class="hub-tiles">${I.sizeTiles.map(([slug, n, b, t]) => `<a class="hub-tile" href="${hubPath(slug)}"><span class="n">${n}<small>명+</small></span><b>${esc(b)}</b><span>${esc(t)}</span><em>공간 보기 →</em></a>`).join('')}</div>
  </div>
</section>
<section class="section sec-white sec-line" id="by-purpose">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">02 · By purpose</div><h2 class="h-l mt-1">어떤 모임인가요</h2><p class="lead">같은 인원이라도 파티와 세미나는 봐야 할 조건이 다릅니다. 목적별로 확인할 것을 함께 정리했습니다.</p></div>
    <div class="hub-tiles words">${I.purposeTiles.map(([slug, b, t]) => `<a class="hub-tile" href="${hubPath(slug)}"><b>${esc(b)}</b><span>${esc(t)}</span><em>공간 보기 →</em></a>`).join('')}</div>
  </div>
</section>
${list.html.replace('01 · Spaces', '03 · Spaces')}
<section class="section sec-white sec-line" id="why">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">04 · Why Megaspot</div><h2 class="h-l mt-1">큰 공간만 모으는 이유</h2><p class="lead">50명이 넘는 모임은 찾는 방법부터 다릅니다. 작은 공간 사이에서 큰 공간을 골라내는 수고를 없앴습니다.</p></div>
    <ul class="hub-checks">${I.why.map(([b, t]) => `<li><b>${esc(b)}</b><span>${esc(t)}</span></li>`).join('')}</ul>
  </div>
</section>
<section class="section" id="faq">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">05 · FAQ</div><h2 class="h-l mt-1">자주 묻는 질문</h2></div>
    ${faqHtml(I.faq)}
  </div>
</section>
<section class="section sec-white sec-line" id="more">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">06 · Event guide</div><h2 class="h-l mt-1">행사 준비 가이드</h2><p class="lead">필요한 평수 계산부터 견적 확인, 답사, 당일 점검까지. 큰 모임을 준비하는 담당자를 위한 글입니다.</p></div>
    ${guideLinks(I.guides, 'c3')}
    <p class="mt-3"><a class="pf-link" href="/event-guide/">가이드 전체 보기 →</a></p>
  </div>
</section>
${hostStrip()}`;
  const graph = [
    { '@type': 'CollectionPage', '@id': url + '#webpage', url, name: I.title, description: I.desc, inLanguage: 'ko', dateModified: HUB_UPDATED, isPartOf: { '@id': SITE + '/#website' }, publisher: { '@id': SITE + '/#org' }, breadcrumb: { '@id': url + '#breadcrumb' },
      hasPart: NAV.flatMap(g => g.items).map(([slug, label]) => ({ '@type': 'CollectionPage', name: label, url: SITE + hubPath(slug) })) },
    crumbsLd(url, [['메가스팟', '/'], ...trail]), faqLd(url, I.faq)
  ];
  return page(S, { path: p, title: I.title, desc: I.desc, og: I.og, graph, headExtra: list.head, bodyClass: 'page-hub page-hub-index', main });
}

// ---------- 행사 준비 가이드 ----------
function guideCtx() { return { areaTable, need: cap.need, calc, plans: PLATFORM.plans, freeMonths: PLATFORM.freeMonths, won, man, src: cap.SOURCE }; }
const guideFaq = (g, c) => (g.faq || []).map(([q, a]) => [q, typeof a === 'function' ? a(c) : a]);
function renderGuide(S, g) {
  const p = guidePath(g.slug), url = SITE + p, c = guideCtx(), headline = text(g.h1), trail = [['행사 준비 가이드', '/event-guide/'], [headline, p]], faq = guideFaq(g, c);
  const body = g.body(c).trim(), toc = [...body.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map(m => [m[1], m[2]]);
  const hubs = (g.hubs || []).map(slug => { const h = HUBS.find(x => x.slug === slug); if (!h) throw new Error('모음이 없습니다: ' + slug); return h; });
  const others = GUIDES.filter(x => x.slug !== g.slug && (g.host ? true : !x.host)).slice(0, 3);
  const main = `
<article>
<header class="hl-hero eg-hero">
  <div class="container eg-narrow">
    ${crumbs(trail)}
    <div class="eyebrow mt-2">Event guide · ${esc(g.cat)}</div>
    <h1 class="h-xl mt-1" style="font-size:clamp(30px,5vw,50px)">${g.h1}</h1>
    <p class="lead">${esc(g.lead)}</p>
    <div class="eg-meta"><span><b>메가스팟 운영팀</b></span><span>업데이트 <time datetime="${GUIDE_UPDATED}">${GUIDE_UPDATED.replace(/-/g, '.')}</time></span></div>
  </div>
</header>
<div class="container eg-narrow eg-body">
${toc.length > 3 && !g.tool ? `<nav class="eg-toc" aria-label="이 글의 순서"><b>이 글의 순서</b><ol>${toc.map(([id, t]) => `<li><a href="#${id}">${esc(t.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}</ol></nav>` : ''}
${body}
${faq.length ? `<h2 id="faq">자주 묻는 질문</h2>\n${faqHtml(faq)}` : ''}
<p class="eg-foot">이 글은 메가스팟이 대형 공간을 직접 운영하며 정리한 기준입니다. 공간마다 조건이 다르니 예약 전에 해당 공간의 안내를 확인하세요. 고칠 내용이 있으면 <a href="/inquiry/">문의</a>로 알려 주세요.</p>
</div>
</article>
<section class="section sec-white sec-line">
  <div class="container">
    ${hubs.length ? `<div class="pf-sec-head"><div class="eyebrow">Venues</div><h2 class="h-l mt-1">이 글과 관련된 공간 모음</h2></div>
    <div class="hub-links c3">${hubs.map(h => `<a href="${hubPath(h.slug)}"><small>공간 모음</small><b>${esc(h.og)}</b><span>${esc(h.listTitle)}을 한곳에서 봅니다.</span></a>`).join('')}</div>` : ''}
    <div class="pf-sec-head${hubs.length ? ' mt-4' : ''}"><div class="eyebrow">Read next</div><h2 class="h-l mt-1">이어서 읽기</h2></div>
    ${guideLinks(others.map(x => x.slug), 'c3')}
    <p class="mt-3"><a class="pf-link" href="/event-guide/">가이드 전체 보기 →</a></p>
  </div>
</section>
${g.host ? '' : hostStrip()}`;
  const graph = [
    { '@type': 'Article', '@id': url + '#article', headline, description: g.desc, inLanguage: 'ko', datePublished: GUIDE_UPDATED, dateModified: GUIDE_UPDATED, image: `${SITE}/assets/img/brand/og-megaspot.jpg`,
      author: { '@type': 'Organization', '@id': SITE + '/#org', name: '메가스팟 MEGASPOT', url: SITE + '/' }, publisher: { '@id': SITE + '/#org' }, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, articleSection: g.cat, isPartOf: { '@id': SITE + '/#website' } },
    crumbsLd(url, [['메가스팟', '/'], ...trail]), ...(faq.length ? [faqLd(url, faq)] : [])
  ];
  return page(S, { path: p, title: g.title, desc: g.desc, og: g.og, graph, article: true, bodyClass: 'page-guide-article page-guide-' + g.slug, main,
    scripts: g.tool ? `<script src="/assets/js/pages/capacity-calc.js?v=${ASSET_V}"></script>\n` : '' });
}
function renderGuideIndex(S) {
  const I = GUIDE_INDEX, p = '/event-guide/', url = SITE + p, trail = [['행사 준비 가이드', p]];
  const card = g => `<a class="eg-card${g.host ? ' host' : ''}" href="${guidePath(g.slug)}"><small>${esc(g.tool ? '계산기' : g.cat)}</small><b>${esc(text(g.h1))}</b><span>${esc(g.card)}</span><em>${g.tool ? '계산해 보기' : '읽어 보기'} →</em></a>`;
  const main = `
<section class="hl-hero eg-hero">
  <div class="container">
    ${crumbs(trail)}
    <div class="eyebrow mt-2">${esc(I.eyebrow)}</div>
    <h1 class="h-xl mt-1">${I.h1}</h1>
    <p class="lead" style="max-width:64ch">${esc(I.lead)}</p>
  </div>
</section>
<section class="section" id="planner">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">01 · For planners</div><h2 class="h-l mt-1">행사를 준비하는 분께</h2></div>
    <div class="eg-list">${GUIDES.filter(g => !g.host).map(card).join('')}</div>
  </div>
</section>
<section class="section sec-white sec-line" id="host">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">02 · For hosts</div><h2 class="h-l mt-1">대형 공간을 운영하는 분께</h2><p class="lead">50명 이상을 받는 공간은 작은 공간과 알리는 방법이 다릅니다. 플랫폼 비용을 계산하는 법과 공간 소개에 넣을 정보를 정리했습니다.</p></div>
    <div class="eg-list">${GUIDES.filter(g => g.host).map(card).join('')}</div>
  </div>
</section>
<section class="section" id="venues">
  <div class="container">
    <div class="pf-sec-head"><div class="eyebrow">03 · Venues</div><h2 class="h-l mt-1">인원·목적별 공간 모음</h2><p class="lead">읽은 기준으로 바로 공간을 찾아보세요.</p></div>
    ${hubNav('')}
  </div>
</section>`;
  const graph = [
    { '@type': 'CollectionPage', '@id': url + '#webpage', url, name: I.title, description: I.desc, inLanguage: 'ko', dateModified: GUIDE_UPDATED, isPartOf: { '@id': SITE + '/#website' }, publisher: { '@id': SITE + '/#org' }, breadcrumb: { '@id': url + '#breadcrumb' },
      hasPart: GUIDES.map(g => ({ '@type': 'Article', headline: text(g.h1), url: SITE + guidePath(g.slug) })) },
    crumbsLd(url, [['메가스팟', '/'], ...trail])
  ];
  return page(S, { path: p, title: I.title, desc: I.desc, og: I.og, graph, bodyClass: 'page-guide page-guide-index', main });
}

// ---------- 모으기 ----------
// 만든 페이지 목록: [{ path, file, html, title, desc, updated, priority }]
export function buildPages() {
  const S = shell(), SP = spaces(), out = [];
  const add = (p, html, title, desc, updated, priority) => out.push({ path: p, file: p.slice(1) + 'index.html', html, title, desc, updated, priority });
  add('/venues/', renderHubIndex(S, SP), HUB_INDEX.title, HUB_INDEX.desc, HUB_UPDATED, '0.9');
  for (const h of HUBS) add(hubPath(h.slug), renderHub(S, SP, h), h.title, h.desc, HUB_UPDATED, '0.8');
  add('/event-guide/', renderGuideIndex(S), GUIDE_INDEX.title, GUIDE_INDEX.desc, GUIDE_UPDATED, '0.7');
  for (const g of GUIDES) add(guidePath(g.slug), renderGuide(S, g), g.title, g.desc, GUIDE_UPDATED, '0.7');
  return out;
}
const START = 'seo-pages:start', END = 'seo-pages:end';
function block(src, body, before) {   // 표시된 구간을 바꾸고, 없으면 before 앞에 넣습니다
  const re = new RegExp(`[ \\t]*<!-- ${START}[^>]*-->[\\s\\S]*?<!-- ${END} -->\\n?`);
  const next = `  <!-- ${START} · tools/seo-pages/build.mjs 가 만드는 구간입니다. 손으로 고치지 마세요 -->\n${body}\n  <!-- ${END} -->\n`;
  if (re.test(src)) return src.replace(re, next);
  const i = src.lastIndexOf(before); if (i < 0) throw new Error(before + ' 를 찾지 못했습니다');
  return src.slice(0, i) + next + src.slice(i);
}
const rfc822 = d => { const t = new Date(d + 'T09:00:00+09:00'), k = new Date(t.getTime() + 9 * 3600e3); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][k.getUTCDay()]}, ${String(k.getUTCDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][k.getUTCMonth()]} ${k.getUTCFullYear()} 09:00:00 +0900`; };
export function buildFeeds(pages) {
  const sitemap = block(read('sitemap.xml'), pages.map(p => `  <url><loc>${SITE}${p.path}</loc><lastmod>${p.updated}</lastmod><changefreq>weekly</changefreq><priority>${p.priority}</priority></url>`).join('\n'), '</urlset>');
  const items = pages.map(p => `  <item>\n   <title>${esc(p.title)}</title>\n   <link>${SITE}${p.path}</link>\n   <guid isPermaLink="true">${SITE}${p.path}</guid>\n   <description>${esc(p.desc)}</description>\n   <pubDate>${rfc822(p.updated)}</pubDate>\n  </item>`).join('\n');
  const latest = pages.map(p => p.updated).sort().pop();
  let rss = block(read('rss.xml'), items, '</channel>');
  rss = rss.replace(/<lastBuildDate>([^<]*)<\/lastBuildDate>/, (m, d) => new Date(d).getTime() >= new Date(latest + 'T09:00:00+09:00').getTime() ? m : `<lastBuildDate>${rfc822(latest)}</lastBuildDate>`);
  return { 'sitemap.xml': sitemap, 'rss.xml': rss };
}
export function buildAll() {
  const pages = buildPages(), files = Object.fromEntries(pages.map(p => [p.file, p.html]));
  return { pages, files: { ...files, ...buildFeeds(pages) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'), { files } = buildAll(); let changed = 0;
  for (const [file, body] of Object.entries(files)) {
    const full = path.join(ROOT, file), cur = existsSync(full) ? readFileSync(full, 'utf8') : null;
    if (cur === body) continue; changed++;
    if (check) { console.log('다름: ' + file); continue; }
    mkdirSync(path.dirname(full), { recursive: true }); writeFileSync(full, body); console.log('씀: ' + file);
  }
  console.log(check ? (changed ? `${changed}개 파일이 최신이 아닙니다. node tools/seo-pages/build.mjs 를 실행하세요.` : '모두 최신입니다.') : `${Object.keys(files).length}개 가운데 ${changed}개를 고쳤습니다.`);
  if (check && changed) process.exit(1);
}
