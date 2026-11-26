// 검색·AI 답변을 위한 글 보강 점검 (2026-11-27)
//  · 가이드마다 ‘한눈에 보기’가 있고, 갈래가 목록에 있으며, 글에 적힌 금액은 요금표에서 계산한 값이다
//  · 용어 사전의 구조화 데이터(DefinedTermSet)는 화면에 보이는 용어·뜻과 같다
//  · 소개 화면의 ‘한눈에 보는 메가스팟’, 첫 화면의 가이드 구역, 서비스 화면의 ‘함께 읽으면 좋은 글’이 최신이다
//  · 새 공간 모음(네트워킹·기념식·출판기념회·상영회·가족 행사·조찬·밤샘·성수 근처)이 메뉴와 첫 화면, llms.txt 에 들어 있다
//  · 플레이 도구는 무료 웹 도구(WebApplication)로 알린다
//   node --test tests/seo-content.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { buildAll } from '../tools/seo-pages/build.mjs';
import { GUIDES, INDEX, RELATED } from '../tools/seo-pages/guides.mjs';
import { HUBS, NAV, INDEX as HUB_INDEX } from '../tools/seo-pages/venues.mjs';
import { TOOLS } from '../tools/kit-pages/build.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const { files } = buildAll();
const ld = html => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(m => { const j = JSON.parse(m[1]); return j['@graph'] || [j]; });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = h => String(h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const P = (() => { const ctx = { window: {} }; vm.runInNewContext(read('assets/js/data/pricing-gundae.js'), ctx); return ctx.window.MEGASPOT_PRICING['megaspot-gundae']; })();
const man = n => (n / 10000).toLocaleString('ko-KR') + '만 원';
const NEW_HUBS = ['networking', 'ceremony', 'launch', 'screening', 'family-party', 'breakfast', 'overnight', 'seongsu'];

test('가이드: 모든 글에 한눈에 보기가 있고 갈래가 목록에 있다', () => {
  const cats = INDEX.cats.map(c => c[0]);
  assert.ok(GUIDES.length >= 22);
  for (const g of GUIDES) {
    const html = files[`event-guide/${g.slug}/index.html`], box = (html.match(/<div class="eg-answer"><b>한눈에 보기<\/b><ul>([\s\S]*?)<\/ul><\/div>/) || [])[1];
    assert.ok(box, g.slug + ' 한눈에 보기');
    const items = [...box.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => plain(m[1]));
    assert.ok(items.length >= 2 && items.length <= 3, g.slug + ' 한눈에 보기는 두세 문장');
    for (const t of items) assert.ok(t.length >= 30 && t.length <= 170 && !/\$\{|undefined|NaN/.test(t), g.slug + ' → ' + t);
    if (!g.host) assert.ok(cats.includes(g.cat), g.slug + ' 갈래: ' + g.cat);
    assert.ok(html.includes('<a href="/about/">메가스팟 운영팀</a>'), g.slug + ' 글쓴이');
    assert.match(html, /<meta property="article:published_time" content="2026-11-\d\dT09:00:00\+09:00">/);
    const art = ld(html).find(x => x['@type'] === 'Article');
    assert.ok(art.datePublished <= art.dateModified, g.slug + ' 날짜'); assert.equal(art.articleSection, g.cat);
    assert.ok(!/undefined|NaN|\$\{/.test(plain(html.slice(html.indexOf('<main'), html.indexOf('</main>')))), g.slug + ' 채우지 않은 자리');
  }
  // 목록 화면: 갈래마다 묶음이 있고 글이 빠지지 않는다
  const idx = files['event-guide/index.html'];
  for (const g of GUIDES) assert.ok(idx.includes(`href="/event-guide/${g.slug}/"`), g.slug);
  assert.equal((idx.match(/<div class="eg-cat" id="cat-/g) || []).length, cats.filter(c => GUIDES.some(g => !g.host && g.cat === c)).length);
});

test('가이드에 적힌 금액은 요금표에서 계산한 값이다', () => {
  const total = (c, b, hours, people) => P.hourly[c][b] * hours + P.surcharge.amount + Math.max(0, people - P.people.base) * P.people.extra;
  const budget = plain(files['event-guide/event-budget/index.html']);
  assert.ok(budget.includes(`금요일 저녁 4시간, 100명이면 ${man(total('fri', 'evening', 4, 100))}`));
  assert.ok(budget.includes(`= ${man(total('wd', 'evening', 3, 50))}`));
  const pkg = P.packages.find(p => p.id === 'day');
  assert.ok(budget.includes(`= ${man(pkg.price.sat + (120 - P.people.base) * P.people.extra)}`));
  assert.ok(budget.includes(`이용 보증금 ${man(P.deposit.amount)}`));
  const timing = plain(files['event-guide/booking-timing/index.html']);
  for (const c of ['wd', 'fri', 'sat', 'sun']) for (const b of ['morning', 'day', 'evening', 'night']) assert.ok(timing.includes(man(P.hourly[c][b])), `${c} ${b}`);
  const refund = files['event-guide/contract-deposit-refund/index.html'];
  for (const r of P.refund) assert.ok(refund.includes(`<th scope="row">${esc(r.k)}</th><td>${Math.round(r.rate * 100)}%</td>`), r.k);
  // 식음료 가격은 글에 적지 않는다 (출장뷔페 안내로 보냄)
  const catering = plain(files['event-guide/event-catering/index.html'].split('<h2 id="faq">')[0]);
  assert.ok(!/1인 \d[\d,]*원|[\d,]+원부터/.test(catering.replace(/1명당 [\d,]+원/, '')), '식음료 가격을 글에 적지 않습니다');
});

test('용어 사전: 구조화 데이터와 화면의 용어·뜻이 같다', () => {
  const html = files['event-guide/glossary/index.html'], set = ld(html).find(x => x['@type'] === 'DefinedTermSet');
  const shown = [...html.matchAll(/<div id="(t-\d+)"><dt>([^<]*)<\/dt><dd>([^<]*)/g)].map(m => [m[1], m[2], m[3].trim()]);
  assert.ok(shown.length >= 60); assert.equal(set.hasDefinedTerm.length, shown.length);
  set.hasDefinedTerm.forEach((t, i) => { assert.equal(esc(t.name), shown[i][1]); assert.equal(esc(t.description), shown[i][2]); assert.ok(t['@id'].endsWith('#' + shown[i][0])); });
  const names = shown.map(s => s[1]); assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ko')), '가나다순');
  assert.equal(new Set(names).size, names.length, '같은 용어가 두 번 나오지 않는다');
  for (const m of html.matchAll(/<nav class="eg-idx"[^>]*>([\s\S]*?)<\/nav>/g)) for (const a of m[1].matchAll(/href="#(t-\d+)"/g)) assert.ok(shown.some(s => s[0] === a[1]));
});

test('소개 화면의 요약 표와 첫 화면의 가이드 구역', () => {
  const ctx = { window: {} }; vm.runInNewContext(read('assets/js/data/spaces.js'), ctx);
  const about = read('about/index.html'), facts = about.slice(about.indexOf('<!-- seo-pages:facts'), about.indexOf('<!-- /seo-pages:facts -->'));
  assert.ok(facts.includes('한눈에 보는 메가스팟'));
  for (const id of ['megaspot-gundae', 'megaspot-gundae-2']) { const s = ctx.window.MEGASPOT_SPACES.find(x => x.id === id); assert.ok(facts.includes(`${s.area.pyeong}평`) && facts.includes(`최대 ${s.capacity.max}명`), id); }
  assert.ok(facts.includes(`1시간 총 ${man(P.hourly.wd.morning + P.surcharge.amount)}부터`)); assert.ok(facts.includes(man(P.deposit.amount)));
  assert.ok(ld(about).some(x => x['@type'] === 'AboutPage'));
  const home = read('index.html'), guides = home.slice(home.indexOf('<!-- seo-pages:guides'), home.indexOf('<!-- /seo-pages:guides -->'));
  for (const [slug, label] of INDEX.home) assert.ok(guides.includes(`href="/event-guide/${slug}/"><b>${esc(label)} →</b>`), slug);
  assert.equal((home.match(/<!-- seo-pages:guides/g) || []).length, 1); assert.equal((home.match(/<h1[\s>]/g) || []).length, 1);
  for (const slug of NEW_HUBS) assert.ok(home.includes(`href="/venues/${slug}/"`), '첫 화면 → ' + slug);
});

test('서비스·공간 화면 아래 ‘함께 읽으면 좋은 글’이 한 번씩 있고 글로 이어진다', () => {
  for (const [file, slugs] of Object.entries(RELATED)) {
    const h = read(file); assert.equal((h.match(/<!-- seo-pages:related/g) || []).length, 1, file);
    const block = h.slice(h.indexOf('<!-- seo-pages:related'), h.indexOf('<!-- /seo-pages:related -->'));
    assert.ok(h.indexOf('<!-- /seo-pages:related -->') < h.indexOf('</main>'), file + ' 본문 안');
    for (const slug of slugs) { assert.ok(GUIDES.some(g => g.slug === slug), slug); assert.ok(block.includes(`href="/event-guide/${slug}/"`), file + ' → ' + slug); }
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, file + ' h1');
  }
  for (const f of ['kit/index.html', 'play/index.html']) assert.equal((read(f).match(/<nav class="read-next"/g) || []).length, 1, f);
  assert.match(read('assets/css/site.css'), /\.read-next\{/);
});

test('새 공간 모음: 메뉴·모음 첫 화면·llms.txt 에 있고, 성수 모음은 위치를 정확히 적는다', () => {
  const nav = NAV.flatMap(g => g.items).map(i => i[0]), llms = read('llms.txt');
  for (const slug of NEW_HUBS) {
    assert.ok(HUBS.some(h => h.slug === slug) && nav.includes(slug), slug);
    assert.ok(HUB_INDEX.purposeTiles.some(t => t[0] === slug), '모음 첫 화면 → ' + slug);
    assert.ok(existsSync(new URL(`venues/${slug}/index.html`, root)), slug);
  }
  for (const h of HUBS) assert.ok(llms.includes(`(https://megaspot.kr/venues/${h.slug}/)`), 'llms.txt → ' + h.slug);
  for (const g of GUIDES) assert.ok(llms.includes(`(https://megaspot.kr/event-guide/${g.slug}/)`), 'llms.txt → ' + g.slug);
  const seongsu = plain(files['venues/seongsu/index.html']);
  assert.ok(seongsu.includes('성수동이 아니라 건대입구역 인근') && seongsu.includes('한 정거장'));
  assert.ok(!/성수동에 있는|성수동 소재|성수역 도보/.test(seongsu));
  for (const slug of ['seongsu', 'breakfast', 'overnight']) assert.equal(HUBS.find(h => h.slug === slug).directOnly, true, slug + ' 는 직영 공간만');
  const night = P.packages.find(p => p.id === 'allnight'); assert.equal(night.time, '18시–다음 날 07시'); assert.equal(night.hours, 13); assert.equal(P.openFrom, 5);   // 모음 글에 적은 시간과 요금표가 같다
});

test('플레이 도구는 무료 웹 도구로 알린다', () => {
  for (const t of TOOLS) {
    const app = ld(read(t.path.slice(1) + 'index.html')).find(x => x['@type'] === 'WebApplication');
    assert.ok(app, t.path); assert.equal(app.offers.price, 0); assert.equal(app.isAccessibleForFree, true); assert.equal(app.url, 'https://megaspot.kr' + t.path);
  }
  assert.ok(ld(read('planning/index.html')).some(x => x['@type'] === 'Service'));
});
