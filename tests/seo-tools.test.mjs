// 검색 노출 점검 도구 (2026-11-23)
//  · 검색봇 구분과 방문 기록(날짜·봇별 1줄), 사람 방문은 기록하지 않음
//  · IndexNow: sitemap.xml 이 바뀐 주소만 알리고, 같은 내용은 다시 보내지 않으며, 미리보기 주소에서는 보내지 않음
//  · 공개 파일: IndexNow 열쇠, llms.txt 의 주소, 이용권 상세의 색인 제외, 미리보기 주소 색인 제외
//   node --test tests/seo-tools.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { botOf, logCrawler, crawlerSummary, indexNowTick, indexNowStatus, resetIndexNowThrottle, sitemapEntries, INDEXNOW_KEY, INDEXNOW_ENDPOINTS } from '../functions/api/_seo.js';
import { onRequestGet as seoApi } from '../functions/api/seo.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fixture(t, sitemap) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const state = { sitemap };
  const env = { DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } },
    ASSETS: { async fetch() { return new Response(state.sitemap, { status: 200 }); } } };
  return { db, env, state };
}
const UA = {
  yeti: 'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)',
  google: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  daum: 'Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html?faqId=28966)',
  bing: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  gpt: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  claude: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  person: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  naverApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.9.5; 15PRO)',
  daumApp: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 DaumApps/7.0'
};

test('검색봇을 이름으로 구분하고, 사람과 포털 앱 안 브라우저는 봇으로 보지 않는다', () => {
  assert.equal(botOf(UA.yeti), 'naver'); assert.equal(botOf(UA.google), 'google'); assert.equal(botOf(UA.daum), 'daum'); assert.equal(botOf(UA.bing), 'bing');
  assert.equal(botOf(UA.gpt), 'openai'); assert.equal(botOf(UA.claude), 'anthropic');
  for (const k of ['person', 'naverApp', 'daumApp']) assert.equal(botOf(UA[k]), '', k);
  assert.equal(botOf(''), ''); assert.equal(botOf(null), '');
});

test('방문 기록: 날짜·봇별로 1줄에 횟수를 더하고, 사람 방문은 남기지 않는다', async t => {
  const f = fixture(t, '');
  const hit = (ua, path = '/') => logCrawler(f.env, Object.assign(new Request('https://megaspot.kr' + path, { headers: { 'user-agent': ua } }), { cf: { asn: 23576, asOrganization: 'NAVER Cloud Corp.' } }));
  assert.equal(await hit(UA.yeti), true); assert.equal(await hit(UA.yeti, '/spaces/megaspot-gundae/'), true); assert.equal(await hit(UA.google, '/venues/'), true);
  assert.equal(await hit(UA.person), false);
  assert.equal(await logCrawler(f.env, new Request('https://megaspot.kr/', { method: 'POST', headers: { 'user-agent': UA.yeti } })), false);
  const rows = f.db.prepare('SELECT bot, hits, last_path, last_net FROM crawler_hits ORDER BY bot').all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ bot: 'google', hits: 1, last_path: '/venues/', last_net: 'AS23576 NAVER Cloud Corp.' }, { bot: 'naver', hits: 2, last_path: '/spaces/megaspot-gundae/', last_net: 'AS23576 NAVER Cloud Corp.' }]);
  const sum = await crawlerSummary(f.env, 30);
  assert.deepEqual(sum.bots.map(b => [b.bot, b.hits, b.label]), [['naver', 2, '네이버 (Yeti)'], ['google', 1, '구글']]);
  const res = await seoApi({ env: f.env, request: new Request('https://megaspot.kr/api/seo') }), body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.crawlers.bots[0].bot, 'naver'); assert.equal(body.indexnow, null);
  assert.equal(await logCrawler({}, new Request('https://megaspot.kr/', { headers: { 'user-agent': UA.yeti } })), false);   // DB가 없어도 오류 없이
});

const SM = (...rows) => '<?xml version="1.0"?><urlset>' + rows.map(([u, d]) => `<url><loc>https://megaspot.kr${u}</loc><lastmod>${d}</lastmod></url>`).join('\n') + '<url><loc>https://other.example/</loc></url></urlset>';
test('IndexNow: 처음엔 전체, 그다음엔 바뀐 주소만 알리고 같은 내용은 다시 보내지 않는다', async t => {
  const f = fixture(t, SM(['/', '2026-11-20'], ['/venues/', '2026-11-13']));
  const calls = [], fetcher = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('', { status: url.includes('naver') ? 200 : 202 }); };
  const req = new Request('https://megaspot.kr/api/stats');
  resetIndexNowThrottle();
  let r = await indexNowTick(f.env, req, fetcher);
  assert.equal(r.submitted, 2); assert.deepEqual(r.results, { naver: 200, indexnow: 202 });
  assert.deepEqual(calls.map(c => c.url), Object.values(INDEXNOW_ENDPOINTS));
  assert.deepEqual(calls[0].body, { host: 'megaspot.kr', key: INDEXNOW_KEY, keyLocation: `https://megaspot.kr/${INDEXNOW_KEY}.txt`, urlList: ['https://megaspot.kr/', 'https://megaspot.kr/venues/'] });
  assert.equal(await indexNowTick(f.env, req, fetcher), null, '10분 안에는 다시 확인하지 않습니다');
  resetIndexNowThrottle(); assert.equal(await indexNowTick(f.env, req, fetcher), null, '같은 sitemap 은 다시 보내지 않습니다'); assert.equal(calls.length, 2);
  f.state.sitemap = SM(['/', '2026-11-23'], ['/venues/', '2026-11-13'], ['/venues/gundae/', '2026-11-23']);
  resetIndexNowThrottle(); r = await indexNowTick(f.env, req, fetcher);
  assert.deepEqual(calls[2].body.urlList, ['https://megaspot.kr/', 'https://megaspot.kr/venues/gundae/']);
  assert.deepEqual(await indexNowStatus(f.env), { at: r.at, submitted: 2, total: 3, results: { naver: 200, indexnow: 202 } });
  // 주소가 빠지기만 한 변경은 알릴 것이 없습니다
  f.state.sitemap = SM(['/', '2026-11-23'], ['/venues/', '2026-11-13']);
  resetIndexNowThrottle(); r = await indexNowTick(f.env, req, fetcher); assert.equal(r.submitted, 0); assert.equal(calls.length, 4);
  // 미리보기 주소에서는 보내지 않습니다
  f.state.sitemap = SM(['/', '2026-12-01']);
  resetIndexNowThrottle(); assert.equal(await indexNowTick(f.env, new Request('https://megaspot.pages.dev/api/stats'), fetcher), null); assert.equal(calls.length, 4);
  // 알림 서버가 응답하지 않아도 멈추지 않고 결과만 남깁니다
  resetIndexNowThrottle(); r = await indexNowTick(f.env, req, async () => { throw new Error('down'); });
  assert.deepEqual(r.results, { naver: 'error', indexnow: 'error' });
});

test('공개 파일: IndexNow 열쇠 · llms.txt 주소 · 색인에서 빼는 화면', () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/); assert.equal(read(INDEXNOW_KEY + '.txt').trim(), INDEXNOW_KEY);
  const entries = sitemapEntries(read('sitemap.xml')), urls = Object.keys(entries);
  assert.ok(urls.length >= 60); assert.ok(urls.every(u => u.startsWith('https://megaspot.kr/')));
  // llms.txt 에 적은 주소는 모두 실제로 있는 화면
  const links = [...read('llms.txt').matchAll(/\]\((https:\/\/megaspot\.kr\/[^)]*)\)/g)].map(m => m[1]);
  assert.ok(links.length >= 40);
  for (const u of links) assert.ok(existsSync(new URL('../' + u.replace('https://megaspot.kr/', '') + 'index.html', import.meta.url)), u + ' 화면이 없습니다');
  // 이용권 상세(결제용 화면)는 색인에서 빼고 sitemap 에 싣지 않습니다. 목록(/products/)은 그대로 두고, RSS 의 상품 안내는 결제 고지 점검(pricing-disclosure) 때문에 그대로 둡니다
  const products = readdirSync(new URL('../products/', import.meta.url), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  assert.ok(products.length >= 10);
  for (const id of products) { assert.match(read(`products/${id}/index.html`), /<meta name="robots" content="noindex,follow">/, id); assert.ok(!urls.includes(`https://megaspot.kr/products/${id}/`), id); }
  assert.match(read('products/index.html'), /<meta name="robots" content="index,follow/); assert.ok(urls.includes('https://megaspot.kr/products/'));
  // 미리보기 주소는 검색에 잡히지 않게, 검색엔진 규칙은 공개 화면을 막지 않게
  assert.match(read('_headers'), /https:\/\/megaspot\.pages\.dev\/\*\n {2}X-Robots-Tag: noindex/);
  const robots = read('robots.txt');
  assert.ok(!/Disallow: \/(venues|event-guide|purpose|spaces\/megaspot|kit|play)\b/.test(robots)); assert.match(robots, /Sitemap: https:\/\/megaspot\.kr\/sitemap\.xml/);
  // 홈 제목은 브랜드로 시작
  assert.match(read('index.html'), /<title>메가스팟 \|/);
});
