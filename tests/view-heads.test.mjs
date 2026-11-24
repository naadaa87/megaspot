// 글·모임 상세를 검색엔진이 읽을 수 있게 서버에서 채우기 (2026-11-25 · S4·S7)
//  · 공개 글·모임만 제목·설명·주소·H1·구조화 데이터를 채우고, 숨김·검토 중은 정적 화면(검색 제외)을 그대로 둔다
//  · 모임 소개의 전화·이메일, 모임 주최자 연락처는 HTML 에 넣지 않는다 · 조회수를 올리지 않는다
//  · 글 주소 목록(sitemap) · robots.txt · _routes.json 연결
//   node --test tests/view-heads.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { servePost, serveMeetup, communitySitemap, meetupSitemap, fitTitle, clip, coverUrl, TITLE_MAX, DESC_MAX } from '../functions/api/_view_heads.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fixture(t) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const env = { DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  const P = (ref, board, status, title, data, publish = '2026-11-20 03:00:00') => db.prepare("INSERT INTO community_posts (ref, board, status, category, title, author, data, publish_at, created_at, comments, likes) VALUES (?,?,?,?,?,?,?,?, '2026-11-20 03:00:00', 2, 5)")
    .run(ref, board, status, board === 'group' ? 'networking' : 'review', title, '모임장K', JSON.stringify(data), publish);
  P('CF-2611-AB12', 'free', 'published', '건대 1호에서 120명 송년회 해 본 후기 — 강연형에서 뷔페로 바꾼 이야기와 준비하면서 배운 것들', { body: '지난주 금요일에 회사 송년회를 1호에서 했습니다.\n<script>alert(1)</script> 동선이 넉넉했어요.' });
  P('CG-2611-CD34', 'group', 'published', '성수·건대 직장인 네트워킹 살롱', { summary: '격주 목요일 저녁 모임', region: '서울 광진구', cycle: 'biweekly', venue: 'megaspot-gundae', body: '주제 발표 30분, 자유 대화 1시간.', contact_phone: '010-1111-2222', contact_email: 'hidden@example.com', kakao_id: 'secretkid' });
  P('CF-2611-ZZ99', 'free', 'hidden', '숨긴 글', { body: '보이면 안 됨' });
  P('CF-2611-FU01', 'free', 'published', '예약 게시 글', { body: '아직' }, '2099-01-01 00:00:00');
  const M = (ref, status, venue, date, data) => db.prepare("INSERT INTO meetups (ref, status, title, category, venue, event_date, capacity, data, created_at) VALUES (?,?,?,?,?,?,?,?, '2026-11-20 03:00:00')").run(ref, status, '연말 보드게임 대잔치', 'social', venue, date, 40, JSON.stringify(data));
  M('MO-2612-EF56', 'open', 'megaspot-gundae-2', '2099-12-19', { summary: '보드게임 50종', start_time: '19:00', end_time: '23:00', fee_type: 'paid', fee: 15000, host_name: '보드게임 클럽', description: '초보 환영', cover: 's22', contact_phone: '010-9999-8888', contact_email: 'host@example.com' });
  M('MO-2612-CA00', 'cancelled', 'tbd', '2099-12-20', { summary: '취소된 모임' });
  M('MO-2612-PE00', 'pending', 'tbd', '2099-12-21', {});
  return { db, env };
}
const shell = p => read(p);
async function page(env, fn, path, url) {
  const res = await fn({ request: new Request('https://megaspot.kr' + url), env, next: async () => new Response(shell(path), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }) });
  return res.text();
}
const pick = (h, re) => (h.match(re) || [])[1];

test('정적 글·모임 상세는 검색 제외로 두고, 서버 함수와 주소 목록을 연결한다', () => {
  for (const p of ['community/free/view/index.html', 'community/groups/view/index.html', 'meetups/view/index.html']) assert.match(read(p), /<meta name="robots" content="noindex,follow">/, p);
  const r = JSON.parse(read('_routes.json')).include;
  for (const p of ['/community/free/view/', '/community/groups/view/', '/meetups/view/', '/community/sitemap.xml', '/meetups/sitemap.xml']) assert.ok(r.includes(p), p);
  assert.ok(r.length <= 100, 'Cloudflare 규칙 수 한도');
  const robots = read('robots.txt');
  assert.match(robots, /Sitemap: https:\/\/megaspot\.kr\/community\/sitemap\.xml/); assert.match(robots, /Sitemap: https:\/\/megaspot\.kr\/meetups\/sitemap\.xml/);
  assert.ok(!/Disallow: \/(community\/free|community\/groups|meetups)\/view/.test(robots));
});

test('자유게시판 글: 제목·설명·주소·H1·구조화 데이터를 채우고 본문은 글자로만 넣는다', async t => {
  const { db, env } = fixture(t);
  const h = await page(env, servePost('free'), 'community/free/view/index.html', '/community/free/view/?id=cf-2611-ab12');
  const title = pick(h, /<title>([^<]*)<\/title>/), desc = pick(h, /<meta name="description" content="([^"]*)"/);
  assert.ok(title.endsWith(' | 자유게시판 | 메가스팟')); assert.ok(title.length <= TITLE_MAX, title);
  assert.ok(desc.length <= DESC_MAX); assert.match(desc, /^지난주 금요일에/);
  assert.match(h, /<meta name="robots" content="index,follow/);
  assert.match(h, /<link rel="canonical" href="https:\/\/megaspot\.kr\/community\/free\/view\/\?id=CF-2611-AB12">/);
  assert.match(h, /<h1>건대 1호에서 120명/);
  assert.ok(!h.includes('<script>alert(1)</script>'), '본문 HTML 은 그대로 넣지 않습니다'); assert.ok(h.includes('&lt;script&gt;'));
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const g = lds.find(x => x['@graph'] && x['@graph'].some(n => n['@type'] === 'DiscussionForumPosting'));
  assert.ok(g, '글 구조화 데이터'); const post = g['@graph'].find(n => n['@type'] === 'DiscussionForumPosting');
  assert.equal(post.commentCount, 2); assert.equal(post.author.name, '모임장K'); assert.equal(post.datePublished, '2026-11-20T12:00:00+09:00');
  assert.ok(!lds.some(x => JSON.stringify(x).includes('"url":"https://megaspot.kr/community/free/view/"')), '정적 화면의 WebPage(글 없는 주소)는 바꿔 끼웁니다');
  assert.equal(db.prepare("SELECT views FROM community_posts WHERE ref='CF-2611-AB12'").get().views, 0, '조회수를 올리지 않습니다');
});

test('모임 소개: 연락처(전화·이메일·카카오 아이디)는 넣지 않는다 · 다른 게시판 번호·숨김·예약 게시 글은 정적 화면 그대로', async t => {
  const { env } = fixture(t);
  const h = await page(env, servePost('group'), 'community/groups/view/index.html', '/community/groups/view/?id=CG-2611-CD34');
  assert.match(h, /<h1 class="h-l mt-1">성수·건대 직장인 네트워킹 살롱<\/h1>/);
  assert.match(pick(h, /<meta name="description" content="([^"]*)"/), /격주 목요일 저녁 모임 · 활동 지역 서울 광진구/);
  for (const s of ['010-1111-2222', 'hidden@example.com', 'secretkid']) assert.ok(!h.includes(s), s);
  for (const [fn, path, url] of [[servePost('group'), 'community/groups/view/index.html', '/community/groups/view/?id=CF-2611-AB12'], [servePost('free'), 'community/free/view/index.html', '/community/free/view/?id=CF-2611-ZZ99'],
    [servePost('free'), 'community/free/view/index.html', '/community/free/view/?id=CF-2611-FU01'], [servePost('free'), 'community/free/view/index.html', '/community/free/view/?id=../../x'], [servePost('free'), 'community/free/view/index.html', '/community/free/view/']]) {
    const x = await page(env, fn, path, url);
    assert.equal(x, shell(path), url);
  }
});

test('모임 모집: Event 구조화 데이터(일시·장소·참가비·상태) · 주최자 연락처는 넣지 않는다', async t => {
  const { env } = fixture(t);
  const h = await page(env, serveMeetup, 'meetups/view/index.html', '/meetups/view/?id=MO-2612-EF56');
  assert.match(h, /<meta name="robots" content="index,follow/); assert.match(h, /<h1 class="h-l mt-2">연말 보드게임 대잔치<\/h1>/);
  const title = pick(h, /<title>([^<]*)<\/title>/); assert.ok(title.length <= TITLE_MAX); assert.match(title, /12월 19일 모임 \| 메가스팟$/);
  for (const s of ['010-9999-8888', 'host@example.com']) assert.ok(!h.includes(s), s);
  const ev = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])).flatMap(x => x['@graph'] || [x]).find(n => n['@type'] === 'Event');
  assert.ok(ev, 'Event');
  assert.equal(ev.startDate, '2099-12-19T19:00:00+09:00'); assert.equal(ev.endDate, '2099-12-19T23:00:00+09:00');
  assert.equal(ev.eventStatus, 'https://schema.org/EventScheduled'); assert.equal(ev.location.name, '메가스팟 건대 2호');
  assert.equal(ev.location.address.streetAddress, '능동로13길 39 한아름건물 2층');
  assert.equal(ev.offers.price, 15000); assert.equal(ev.offers.priceCurrency, 'KRW'); assert.equal(ev.offers.availability, 'https://schema.org/InStock');
  assert.equal(ev.image[0], 'https://megaspot.kr/assets/img/scenes/m/s22.jpg'); assert.match(h, /<img src="\/assets\/img\/scenes\/m\/s22\.jpg"/);
  const c = await page(env, serveMeetup, 'meetups/view/index.html', '/meetups/view/?id=MO-2612-CA00');
  assert.match(c, /EventCancelled/); assert.match(c, /메가스팟 건대 \(호실 협의 중\)/);
  assert.equal(await page(env, serveMeetup, 'meetups/view/index.html', '/meetups/view/?id=MO-2612-PE00'), shell('meetups/view/index.html'), '검토 중 모임은 그대로');
});

test('주소 목록: 공개 글과 다가오는 모임만', async t => {
  const { env } = fixture(t);
  const a = await (await communitySitemap(env)).text(), b = await (await meetupSitemap(env)).text();
  assert.match(a, /community\/free\/view\/\?id=CF-2611-AB12/); assert.match(a, /community\/groups\/view\/\?id=CG-2611-CD34/);
  for (const s of ['CF-2611-ZZ99', 'CF-2611-FU01']) assert.ok(!a.includes(s), s);
  assert.match(b, /MO-2612-EF56/); assert.match(b, /MO-2612-CA00/); assert.ok(!b.includes('MO-2612-PE00'));
  const empty = await (await communitySitemap({})).text(); assert.match(empty, /<loc>https:\/\/megaspot\.kr\/community\/<\/loc>/, 'DB 가 없어도 주소 하나는 있어야 합니다');
});

test('제목·설명 자르기와 대표 이미지 주소', () => {
  assert.equal(fitTitle('가'.repeat(80), ' | 메가스팟').length, TITLE_MAX);
  assert.equal(clip('a b  c', 10), 'a b c'); assert.equal(clip('가나다라마바사', 4), '가나다…');
  assert.equal(coverUrl('s22'), 'https://megaspot.kr/assets/img/scenes/m/s22.jpg'); assert.equal(coverUrl('p14'), 'https://megaspot.kr/assets/img/views/m/v10.jpg');
  assert.equal(coverUrl('/api/community/photo/ab'), 'https://megaspot.kr/api/community/photo/ab'); assert.equal(coverUrl('javascript:x'), 'https://megaspot.kr/assets/img/views/m/v10.jpg');
});
