// 관리자 '검색 성과' (2026-11-25)
//  · 검색봇 방문 · IndexNow 상태 · sitemap 묶음 · 검색 유입 · 검색에서 온 문의를 한 번에 돌려준다
//  · 주간 기록(색인 수·검색어)은 같은 날짜면 고쳐 쓰고, 지울 수 있다
//  · 문의·예약 표는 읽기만 한다
//   node --test tests/search-perf.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { searchPerfAdmin } from '../functions/api/_search_perf.js';
import { kstToday } from '../functions/api/_lib.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fixture(t) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const env = { DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } },
    ASSETS: { async fetch() { return new Response(read('sitemap.xml'), { status: 200 }); } } };
  return { db, env };
}
const call = async (env, path, method = 'GET', body, host = 'megaspot.pages.dev') => {
  const url = new URL(`https://${host}/api/admin/${path}`);
  const request = new Request(url, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
  const res = await searchPerfAdmin({ request, env, path: path.split('?')[0], method, url });
  return res ? { status: res.status, body: await res.json() } : null;
};

test('검색 성과: 봇 방문 · 검색 유입 · 검색에서 온 문의를 모아 보여 준다', async t => {
  const { db, env } = fixture(t);
  const today = kstToday();
  db.prepare("INSERT INTO crawler_hits (day, bot, hits, last_at, last_path, last_ua, last_net) VALUES (?, 'naver', 5, '2026-11-24 01:00:00', '/', 'Yeti', '')").run(today);
  db.prepare("INSERT INTO crawler_hits (day, bot, hits, last_at, last_path, last_ua, last_net) VALUES (?, 'google', 2, '2026-11-24 01:00:00', '/venues/', 'Googlebot', '')").run(today);
  const hit = (pid, src, path) => db.prepare("INSERT INTO web_hits (pid, day, hour, vid, sid, path, src, device, new_visitor, created_at) VALUES (?, ?, 10, 'v', 's', ?, ?, 'mobile', 1, '2026-11-24 01:00:00')").run(pid, today, path, src);
  hit('p1', 'naver', '/spaces/megaspot-gundae/'); hit('p2', 'naver', '/'); hit('p3', 'google', '/'); hit('p4', 'instagram', '/'); hit('p5', null, '/venues/'); hit('p6', 'naver_place', '/');
  const inq = (ref, src) => db.prepare("INSERT INTO inquiries (ref, space_id, data, created_at) VALUES (?, 'megaspot-gundae', ?, ?)").run(ref, JSON.stringify({ came_from: { src } }), today + ' 01:00:00');
  inq('MS-1', 'naver'); inq('MS-2', 'google'); inq('MS-3', 'direct');
  const before = db.prepare('SELECT * FROM inquiries ORDER BY id').all();
  const r = await call(env, 'search-perf?days=30');
  assert.equal(r.status, 200); const b = r.body;
  assert.deepEqual(b.crawlers.bots.map(x => [x.bot, x.hits]), [['naver', 5], ['google', 2]]);
  assert.equal(b.inflow.visits, 4, '검색엔진·네이버 지도에서 온 방문만 셉니다'); assert.equal(b.inflow.all_visits, 5);
  assert.deepEqual(b.inflow.engines.map(x => [x.src, x.n]), [['naver', 2], ['google', 1], ['naver_place', 1]]);
  assert.equal(b.inflow.pages[0].path, '/'); assert.equal(b.inflow.pages[0].n, 3);
  assert.equal(b.inquiries.total, 3); assert.equal(b.inquiries.search_total, 2);
  assert.ok(b.sitemap.total >= 60); assert.ok(b.sitemap.groups.some(g => g.name === '공간 상세'));
  assert.equal(b.indexnow, null); assert.equal(b.live, false);
  assert.deepEqual(db.prepare('SELECT * FROM inquiries ORDER BY id').all(), before, '문의 표는 바뀌지 않습니다');
});

test('검색 성과: 주간 기록은 같은 날짜면 고쳐 쓰고 지울 수 있다 · 미리보기 주소에서는 IndexNow 를 보내지 않는다', async t => {
  const { env } = fixture(t);
  assert.equal((await call(env, 'search-perf/records', 'POST', { week: '2026-11-23' })).status, 400, '값이 하나도 없으면 저장하지 않습니다');
  assert.equal((await call(env, 'search-perf/records', 'POST', { week: '11/23', google_indexed: 3 })).status, 400);
  let r = await call(env, 'search-perf/records', 'POST', { week: '2026-11-16', google_indexed: '41', naver_indexed: '12', queries: '대형 파티룸, 건대 대관' });
  assert.equal(r.status, 200);
  r = await call(env, 'search-perf/records', 'POST', { week: '2026-11-23', google_indexed: '1,204', naver_clicks: 30, note: '<b>메모</b>' });
  assert.deepEqual(r.body.records.map(x => [x.week, x.google_indexed]), [['2026-11-23', 1204], ['2026-11-16', 41]], '최근 날짜가 위로 옵니다');
  r = await call(env, 'search-perf/records', 'POST', { week: '2026-11-23', google_indexed: 50 });
  assert.equal(r.body.records.length, 2); assert.equal(r.body.records[0].google_indexed, 50);
  r = await call(env, 'search-perf/records/2026-11-16', 'DELETE');
  assert.deepEqual(r.body.records.map(x => x.week), ['2026-11-23']);
  r = await call(env, 'search-perf/indexnow', 'POST', {});
  assert.equal(r.status, 409); assert.match(r.body.error, /미리보기/);
  assert.equal(await call(env, 'search-perf/unknown'), null);
});

test('검색 성과: 관리자 화면 연결 — 새 메뉴만 더하고 KPI 화면은 그대로', () => {
  const html = read('admin/index.html'), nav = read('assets/js/pages/admin-navigation.js'), router = read('functions/api/admin/[[path]].js');
  assert.match(html, /admin-search-perf\.js\?v=[0-9a-f]{12}/); assert.match(html, /admin-search-perf\.css\?v=[0-9a-f]{12}/);
  assert.ok(html.indexOf('admin-search-perf.js') < html.indexOf('admin-navigation.js'), '메뉴를 만들기 전에 화면이 먼저 생겨야 합니다');
  assert.match(nav, /getElementById\('view-search-perf'\)/);
  assert.match(router, /path==='search-perf'\|\|path\.startsWith\('search-perf\/'\)/);
  const js = read('assets/js/pages/admin-search-perf.js');
  assert.ok(!/\/api\/admin\/kpi|X\.A\('\/kpi/.test(js), 'KPI API 를 부르지 않습니다');
});
