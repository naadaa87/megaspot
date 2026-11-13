// 공간 모음(/venues/…) · 행사 준비 가이드(/event-guide/…) 점검 — 만든 페이지가 최신인지, 검색엔진에 넘기는 정보가 맞는지, 서버가 입점 공간을 제대로 채우는지
//   node --test tests/seo-pages.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { buildAll } from '../tools/seo-pages/build.mjs';
import { HUBS, NAV } from '../tools/seo-pages/venues.mjs';
import { GUIDES } from '../tools/seo-pages/guides.mjs';
import * as cap from '../tools/seo-pages/capacity.mjs';
import { hubFilter, hubSpaces, hostCardHtml, fillHub, serveHub } from '../functions/api/_hubpages.js';
import { PLATFORM } from '../functions/api/_hostplat.js';
import { kstToday } from '../functions/api/_lib.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const { pages, files } = buildAll();
const REBUILD = ' → node tools/seo-pages/build.mjs 를 실행해 다시 만드세요';

test('만든 페이지와 sitemap·rss 구간이 저장소 파일과 같다', () => {
  for (const [file, body] of Object.entries(files)) {
    assert.ok(existsSync(new URL(file, root)), file + ' 이 없습니다' + REBUILD);
    assert.ok(read(file) === body, file + ' 이 최신이 아닙니다 (공통 메뉴·공간 정보·문구가 바뀌었을 수 있습니다)' + REBUILD);
  }
  assert.equal(pages.length, 1 + HUBS.length + 1 + GUIDES.length);
});

test('페이지마다 제목·설명·대표 주소·큰 제목이 하나씩 있고 서로 겹치지 않는다', () => {
  const titles = new Set(), descs = new Set();
  for (const p of pages) {
    const h = p.html, title = (h.match(/<title>([^<]*)<\/title>/) || [])[1], desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    assert.ok(title && title.includes('메가스팟'), p.path);
    assert.ok(title.length >= 15 && title.length <= 60, p.path + ' 제목 길이 ' + title.length);
    assert.ok(desc.length >= 60 && desc.length <= 170, p.path + ' 설명 길이 ' + desc.length);
    assert.ok(!titles.has(title) && !descs.has(desc), p.path + ' 제목·설명이 다른 페이지와 같습니다'); titles.add(title); descs.add(desc);
    assert.equal((h.match(/<link rel="canonical" href="([^"]*)"/) || [])[1], 'https://megaspot.kr' + p.path);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, p.path + ' h1');
    assert.match(h, /<meta name="robots" content="index,follow/);
    assert.equal((h.match(/<meta property="og:url" content="([^"]*)"/) || [])[1], 'https://megaspot.kr' + p.path);
  }
});

test('구조화 데이터가 올바른 JSON 이고 경로·질문·글 정보가 들어 있다', () => {
  for (const p of pages) {
    const blocks = [...p.html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const graph = blocks.find(b => b['@graph'])['@graph'], types = graph.map(g => g['@type']);
    assert.ok(types.includes('BreadcrumbList'), p.path);
    const crumb = graph.find(g => g['@type'] === 'BreadcrumbList').itemListElement;
    assert.equal(crumb[crumb.length - 1].item, 'https://megaspot.kr' + p.path);
    const faq = graph.find(g => g['@type'] === 'FAQPage');
    if (faq) {   // 구조화 데이터의 질문·답은 화면에 보이는 내용과 같아야 합니다
      const shown = [...p.html.matchAll(/<details><summary>([^<]*)<\/summary><p>([^<]*)<\/p><\/details>/g)].map(m => [m[1], m[2]]);
      assert.equal(faq.mainEntity.length, shown.length, p.path);
      faq.mainEntity.forEach((q, i) => { assert.equal(esc(q.name), shown[i][0]); assert.equal(esc(q.acceptedAnswer.text), shown[i][1]); });
    }
    if (p.path.startsWith('/event-guide/') && p.path !== '/event-guide/') { const a = graph.find(g => g['@type'] === 'Article'); assert.ok(a && a.headline && a.datePublished && a.author && a.publisher, p.path); }
    if (p.path.startsWith('/venues/')) { const list = blocks.find(b => b['@type'] === 'ItemList'); assert.ok(list && list.itemListElement.length === list.numberOfItems && list.numberOfItems >= 1, p.path); }
  }
});
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

test('본문 안의 사이트 내부 링크가 모두 실제 페이지로 이어진다', () => {
  for (const p of pages) {
    const main = p.html.slice(p.html.indexOf('<main'), p.html.indexOf('</main>'));
    for (const m of main.matchAll(/href="(\/[^"#?]*)/g)) {
      const href = m[1]; if (href.startsWith('/api/')) continue;
      const target = href.endsWith('/') ? href + 'index.html' : href;
      assert.ok(existsSync(new URL('.' + target, root)), p.path + ' → ' + href);
    }
  }
});

test('공간 모음의 직영 공간 카드는 공간 정보 파일의 면적·최대 인원과 같다', () => {
  const ctx = { window: {} }; vm.runInNewContext(read('assets/js/data/spaces.js'), ctx);
  const byId = Object.fromEntries(ctx.window.MEGASPOT_SPACES.map(s => [s.id, s]));
  for (const h of HUBS) {
    const html = files['venues/' + h.slug + '/index.html'], cards = [...html.matchAll(/data-direct="([^"]+)" data-area="(\d+)" data-cap="(\d+)"/g)];
    assert.deepEqual(cards.map(c => c[1]), h.direct, h.slug);
    for (const [, id, area, capacity] of cards) {
      assert.equal(Number(area), byId[id].area.pyeong); assert.equal(Number(capacity), byId[id].capacity.max);
      if (h.people) assert.ok(byId[id].capacity.max >= h.people, h.slug + ' 에 ' + id + ' 은 인원이 모자랍니다');
    }
    assert.ok(html.includes('<!--hub:host-->') && html.includes('id="hub-count"'), h.slug);
    assert.deepEqual(hubFilter(html), { people: h.people, types: h.types, region: h.region }, h.slug + ' 조건');
  }
  for (const [slug] of NAV.flatMap(g => g.items)) assert.ok(HUBS.some(h => h.slug === slug), '메뉴에만 있는 모음: ' + slug);
});

test('면적 환산과 입점 이용료 문구가 기준값과 맞는다', () => {
  assert.equal(cap.need(100, 'standing'), '약 17평'); assert.equal(cap.need(100, 'round'), '31~34평'); assert.equal(cap.need(200, 'theater'), '34~45평'); assert.equal(cap.need(50, 'classroom'), '20~25평');
  assert.deepEqual(cap.m2Per(cap.layout('round')), [1.02, 1.11]); assert.deepEqual(cap.perPyeong(cap.layout('theater')), [4.4, 5.9]);
  const calc = JSON.parse(files['event-guide/capacity/index.html'].match(/data-calc="([^"]*)"/)[1].replace(/&quot;/g, '"'));
  assert.deepEqual(calc.layouts.map(l => [l.id, l.sqft]), cap.LAYOUTS.map(l => [l.id, l.sqft])); assert.equal(calc.pyeong, cap.PYEONG);
  const fee = files['event-guide/space-platform-fee/index.html'], p12 = PLATFORM.plans.find(p => p.months === 12);
  assert.ok(fee.includes(`공간이 공개된 날부터 ${PLATFORM.freeMonths}개월은 무료`)); assert.ok(fee.includes(`월 ${p12.monthly / 10000}만 원(12개월)`));
});

test('무료 기간은 어디서나 ‘공간 공개 후 2개월’로 안내한다', () => {
  const skip = new Set(['node_modules', '.git', 'tests', 'tools']), bad = /지금 입점하면\s*2개월|입점 ?등록 시 2개월|등록 후 2개월 무료|입점 후 2개월 무료/;
  const walk = dir => readdirSync(new URL(dir, root)).flatMap(n => { if (skip.has(n)) return []; const p = dir + n; return statSync(new URL(p, root)).isDirectory() ? walk(p + '/') : /\.(html|js|xml)$/.test(n) ? [p] : []; });
  for (const f of walk('./')) assert.ok(!bad.test(read(f)), f + ' 에 예전 무료 기간 문구가 남아 있습니다');
  for (const f of ['host/index.html', 'index.html']) assert.ok(read(f).includes('공간 공개 후 2개월 무료'), f);
});

test('검색엔진 안내 파일과 공통 메뉴에 새 페이지가 들어 있다', () => {
  const sitemap = read('sitemap.xml'), rss = read('rss.xml');
  for (const p of pages) { assert.ok(sitemap.includes(`<loc>https://megaspot.kr${p.path}</loc>`), p.path); assert.ok(rss.includes(`<link>https://megaspot.kr${p.path}</link>`), p.path); }
  assert.equal((sitemap.match(/<urlset/g) || []).length, 1); assert.ok(sitemap.trimEnd().endsWith('</urlset>')); assert.ok(rss.trimEnd().endsWith('</rss>'));
  assert.ok(JSON.parse(read('_routes.json')).include.includes('/venues/*'), '공간 모음은 서버 함수를 거쳐야 입점 공간이 채워집니다');
  for (const f of ['index.html', 'about/index.html', 'spaces/index.html', 'host/index.html', 'guide/index.html']) {
    const h = read(f); assert.ok(h.includes('href="/venues/"') && h.includes('href="/event-guide/"'), f + ' 메뉴');
  }
  assert.match(read('index.html'), /<title>메가스팟 \| 초대형 공간 예약 플랫폼/);
  assert.ok(!/Disallow: \/(venues|event-guide)/.test(read('robots.txt')));
});

// ---------- 서버: 입점 공간 채우기 ----------
function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql'));
  const env = { DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  const today = kstToday(), later = kstToday(30), past = kstToday(-1), now = new Date().toISOString();
  db.prepare("INSERT INTO hosts (code, email, pw_hash, name, phone, created_at) VALUES ('H-1','a@b.test','x','호스트','01000000000',?)").run(now);
  const add = (ref, o) => db.prepare('INSERT INTO host_spaces (ref, host_id, status, name, region, address, capacity, area, tier, types, price_from, data, free_until, boost, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(ref, 1, o.status || 'live', o.name, o.region || 'seoul', o.address || '서울 성동구 성수이로 100', o.capacity, o.area, o.capacity >= 100 || o.area >= 100 ? 'mega' : 'large', JSON.stringify(o.types), o.price ?? null, JSON.stringify(o.data || {}), o.until || later, o.boost || 0, now);
  add('SP-2611-AAAA', { name: '성수 <b>그랜드홀</b>', capacity: 180, area: 120, types: ['conference', 'banquet'], price: 150000, data: { summary: '성수역 3분 & 층고 5m', price: { modes: ['hourly'], vat: 'excluded', hourly: { weekday: 150000 } }, station: '성수역 3번 출구' } });
  add('SP-2611-BBBB', { name: '인천 컨벤션', region: 'incheon', address: '인천 연수구 센트럴로 1', capacity: 400, area: 300, types: ['conference', 'expo'] });
  add('SP-2611-CCCC', { name: '홍대 파티홀', capacity: 60, area: 55, types: ['partyroom'], price: 500000, data: { price: { modes: ['package'] } } });
  add('SP-2611-DDDD', { name: '심사 중인 공간', status: 'review', capacity: 500, area: 500, types: ['hall'] });
  add('SP-2611-EEEE', { name: '기간이 끝난 공간', capacity: 500, area: 500, types: ['hall'], until: past });
  db.prepare("INSERT INTO host_photos (pid, space_ref, host_id, sort, mime, body, created_at) VALUES ('abcdefghijklmnop1234','SP-2611-AAAA',1,0,'image/jpeg','x',?)").run(now);
  return { env, today };
}
const staticPage = slug => () => Promise.resolve(new Response(files['venues/' + (slug ? slug + '/' : '') + 'index.html'], { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
const get = (env, slug, next = staticPage(slug)) => serveHub({ env, request: new Request('https://megaspot.test/venues/' + (slug ? slug + '/' : '')), next });

test('조건에 맞는 공개 공간만 고른다 (인원·유형·지역, 심사 중·기간 만료 제외)', async () => {
  const { env } = fixture(), ids = async f => (await hubSpaces(env, f)).map(c => c.id);
  assert.deepEqual(await ids({ people: 0, types: [], region: '' }), ['SP-2611-BBBB', 'SP-2611-AAAA', 'SP-2611-CCCC']);   // 초대형 먼저, 인원 많은 순
  assert.deepEqual(await ids({ people: 100, types: [], region: '' }), ['SP-2611-BBBB', 'SP-2611-AAAA']);
  assert.deepEqual(await ids({ people: 300, types: [], region: '' }), ['SP-2611-BBBB']);
  assert.deepEqual(await ids({ people: 0, types: ['partyroom', 'banquet', 'hall'], region: '' }), ['SP-2611-AAAA', 'SP-2611-CCCC']);
  assert.deepEqual(await ids({ people: 0, types: [], region: 'seoul' }), ['SP-2611-AAAA', 'SP-2611-CCCC']);
  assert.deepEqual(await ids({ people: 1000, types: [], region: '' }), []);
});

test('공간 모음에 입점 공간 카드·공간 수·구조화 데이터가 채워진다', async () => {
  const { env } = fixture(), res = await get(env, '100-people'), html = await res.text();
  assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
  assert.ok(!html.includes('<!--hub:host-->'));
  assert.equal((html.match(/data-venue="/g) || []).length, 2);
  assert.ok(html.includes('성수 &lt;b&gt;그랜드홀&lt;/b&gt;') && !html.includes('<b>그랜드홀</b>'), '공간 이름은 그대로 글자로 보여야 합니다');
  assert.ok(html.includes('성수역 3분 &amp; 층고 5m') && html.includes('시간당 15만 원부터 (부가세 별도)') && html.includes('/api/venues/photo/abcdefghijklmnop1234?t=1'));
  assert.ok(html.includes('사진 준비 중') && html.includes('견적 문의'), '사진·요금이 없는 공간');
  assert.match(html, /id="hub-count">지금 볼 수 있는 공간 <b>4<\/b>곳/);
  const list = JSON.parse(html.match(/<script type="application\/ld\+json" id="hub-itemlist">([\s\S]*?)<\/script>/)[1]);
  assert.equal(list.numberOfItems, 4); assert.deepEqual(list.itemListElement.map(i => i.position), [1, 2, 3, 4]);
  assert.equal(list.itemListElement[3].url, 'https://megaspot.kr/spaces/view/?id=SP-2611-AAAA');
  // 인원이 모자란 공간은 300명 모음에 나오지 않고, 서울 모음에는 서울 공간만
  assert.equal(((await (await get(env, '300-people')).text()).match(/data-venue="/g) || []).length, 1);
  const seoul = await (await get(env, 'seoul')).text(); assert.ok(seoul.includes('홍대 파티홀') && !seoul.includes('인천 컨벤션'));
  assert.equal(((await (await get(env, '')).text()).match(/data-venue="/g) || []).length, 3);
});

test('채울 것이 없거나 조회에 실패하면 정적 페이지를 그대로 내보낸다', async () => {
  const { env } = fixture(), page = files['venues/100-people/index.html'];
  assert.equal(await (await get({}, '100-people')).text(), page, 'DB 없음');
  assert.equal(await (await get({ DB: { prepare() { throw new Error('down'); } } }, '100-people')).text(), page, '조회 실패');
  const notFound = await get(env, 'nope', () => Promise.resolve(new Response('없음', { status: 404, headers: { 'content-type': 'text/html' } }))); assert.equal(notFound.status, 404);
  const guide = files['event-guide/capacity/index.html']; assert.equal(hubFilter(guide), null);
  assert.equal(fillHub(guide, [{ id: 'SP-1', name: 'A' }]), guide, '자리 표시가 없는 문서는 건드리지 않음');
  assert.equal(fillHub(page, []), page);
  assert.ok(!hostCardHtml({ id: 'SP-1', name: '"><script>x</script>', type_labels: ['<i>'], summary: '', address: '', region_label: '' }).includes('<script>'));
});
