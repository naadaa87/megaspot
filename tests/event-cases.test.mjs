// 행사 사례 (2026-11-25 · S6)
//  · 주최 측 동의 기록이 없으면 공개할 수 없고, 사진·주최 측 이름·한마디는 각각 동의 범위가 있어야 한다
//  · 공개 화면·API 에는 동의한 사람·예약번호·운영 메모가 나가지 않는다
//  · 한 번 공개한 사례는 지우지 않고 숨김으로 둔다 · 숨긴 사례는 공개 화면에서 빠진다
//  · 목록은 공개 사례가 있을 때만 검색 허용, 상세는 서버에서 제목·본문을 채운다
//  · 예약·문의 표는 건드리지 않는다
//   node --test tests/event-cases.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { eventCasesAdmin, casesPublic, checkPublish } from '../functions/api/_event_cases.js';
import { serveCaseList, serveCaseView, casesSitemap } from '../functions/api/_case_pages.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fixture(t) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const env = { DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  return { db, env };
}
async function admin(env, path, method = 'GET', body) {
  const url = new URL('https://megaspot.kr/api/admin/' + path);
  const request = new Request(url, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
  const r = await eventCasesAdmin({ request, env, path, method, url }); return r ? { status: r.status, body: await r.json() } : null;
}
const page = async (fn, env, path, url) => (await fn({ request: new Request('https://megaspot.kr' + url), env, next: async () => new Response(read(path), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }) })).text();
const CONSENT = { by: '홍길동 매니저', at: '2026-11-20', method: 'kakao', scope: ['story'], confirmed: true, memo: '카카오톡 대화' };
const BASE = { title: 'IT 스타트업 120명 연말 행사', summary: '강연으로 시작해 뷔페 네트워킹으로 이어진 연말 행사', body: '1부 발표 40분, 2부 뷔페와 자유 교류.\n음향은 무선 마이크 두 대로 충분했습니다.', space_id: 'megaspot-gundae', purpose: 'party', month: '2026-11', headcount: '120', layout: '연회형', services: ['catering', 'bogus'], booking_code: 'MS-2611-AB12', note: '내부 메모' };

test('동의 기록이 없으면 공개할 수 없고, 사진·이름·한마디는 각각 동의가 필요하다', async t => {
  const { db, env } = fixture(t);
  db.prepare("INSERT INTO inquiries (ref, space_id, data, created_at) VALUES ('MS-2611-AB12','megaspot-gundae','{}','2026-11-01 00:00:00')").run();
  const before = db.prepare('SELECT * FROM inquiries').all();
  const c = await admin(env, 'event-cases', 'POST', BASE); assert.equal(c.status, 200); const ref = c.body.ref; assert.match(ref, /^EC-\d{4}-[A-Z0-9]{4}$/);
  let r = await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'published' }); assert.equal(r.status, 400); assert.match(r.body.error, /동의 기록/);
  await admin(env, `event-cases/${ref}`, 'PUT', { consent: { ...CONSENT, confirmed: false } });
  assert.equal((await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'published' })).status, 400, '확인 체크가 없으면 안 됨');
  await admin(env, `event-cases/${ref}`, 'PUT', { consent: CONSENT, photos: [{ src: '/assets/img/events/20261102/photo-01.jpg', alt: '전체 배치' }] });
  r = await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'published' }); assert.equal(r.status, 400); assert.match(r.body.error, /사진 공개 동의/);
  await admin(env, `event-cases/${ref}`, 'PUT', { consent: { ...CONSENT, scope: ['story', 'photos'] }, org_label: 'OO협회' });
  r = await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'published' }); assert.match(r.body.error, /주최 측 이름/);
  await admin(env, `event-cases/${ref}`, 'PUT', { org_label: '', quote: '공간이 넓어 동선이 편했어요.' });
  r = await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'published' }); assert.match(r.body.error, /한마디/);
  await admin(env, `event-cases/${ref}`, 'PUT', { consent: { ...CONSENT, scope: ['story', 'photos', 'quote'] } });
  r = await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'published' }); assert.equal(r.status, 200);
  assert.equal(checkPublish({ ...BASE, consent: { ...CONSENT, at: '2999-01-01' } }), '동의 날짜가 오늘보다 뒤입니다.');
  assert.equal((await admin(env, 'event-cases', 'POST', { ...BASE, photos: [{ src: 'javascript:alert(1)' }] })).status, 400, '사진 주소 검사');
  assert.equal((await admin(env, 'event-cases', 'POST', { ...BASE, photos: [{ src: '/assets/img/../../x.jpg' }] })).status, 400);
  assert.deepEqual(db.prepare('SELECT * FROM inquiries').all(), before, '문의 표는 그대로');
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind LIKE 'event_case%'").get().n >= 2, '변경 기록');
});

test('공개 API·화면에는 동의한 사람·예약번호·운영 메모가 나가지 않는다 · 숨김은 빠진다 · 공개한 사례는 지우지 않는다', async t => {
  const { env } = fixture(t);
  const ref = (await admin(env, 'event-cases', 'POST', { ...BASE, consent: CONSENT })).body.ref;
  const draftRef = (await admin(env, 'event-cases', 'POST', { title: '초안' })).body.ref;
  assert.equal((await (await casesPublic({ env, path: '' })).json()).items.length, 0, '작성 중은 공개 안 됨');
  await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'published' });
  const list = await (await casesPublic({ env, path: '' })).json(); assert.equal(list.items.length, 1);
  const one = await (await casesPublic({ env, path: ref.toLowerCase() })).json();
  const raw = JSON.stringify([list, one]);
  for (const s of ['홍길동', 'MS-2611-AB12', '내부 메모', 'consent"', 'bogus']) assert.ok(!raw.includes(s), s);
  assert.deepEqual(one.item.services, [{ id: 'catering', label: '출장뷔페' }]); assert.equal(one.item.headcount, 120);
  // 화면
  const L = await page(serveCaseList, env, 'cases/index.html', '/cases/');
  assert.match(L, /<meta name="robots" content="index,follow/); assert.match(L, /class="cs-card" href="\/cases\/view\/\?id=EC-/); assert.match(L, /"@type":"ItemList"/);
  const V = await page(serveCaseView, env, 'cases/view/index.html', '/cases/view/?id=' + ref);
  assert.match(V, /<h1 class="h-l mt-1">IT 스타트업 120명 연말 행사<\/h1>/); assert.match(V, /<link rel="canonical" href="https:\/\/megaspot\.kr\/cases\/view\/\?id=EC-/);
  assert.match(V, /"@type":"Article"/); assert.match(V, /주최 측 동의를 받아 소개하는 사례입니다/);
  for (const s of ['홍길동', 'MS-2611-AB12', '내부 메모']) assert.ok(!V.includes(s), s);
  assert.match(V, /href="\/catering\/">출장뷔페<\/a>/);
  assert.match(await (await casesSitemap(env)).text(), new RegExp(ref));
  // 지우기·숨기기
  assert.equal((await admin(env, `event-cases/${ref}`, 'DELETE')).status, 409, '공개한 사례는 지우지 않음');
  assert.equal((await admin(env, `event-cases/${draftRef}`, 'DELETE')).status, 200, '작성 중 초안은 지울 수 있음');
  await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'hidden' });
  assert.equal((await (await casesPublic({ env, path: '' })).json()).items.length, 0);
  assert.equal((await casesPublic({ env, path: ref })).status, 404);
  assert.equal(await page(serveCaseView, env, 'cases/view/index.html', '/cases/view/?id=' + ref), read('cases/view/index.html'), '숨긴 사례는 정적 화면 그대로');
  assert.equal(await page(serveCaseList, env, 'cases/index.html', '/cases/'), read('cases/index.html'), '공개 사례가 없으면 검색 제외 그대로');
  assert.equal((await admin(env, `event-cases/${ref}/status`, 'POST', { status: 'draft' })).status, 200);
  assert.equal((await admin(env, `event-cases/${ref}`, 'DELETE')).status, 409, '한 번 공개했던 사례는 작성 중으로 돌려도 지우지 않음');
});

test('정적 화면·연결: 검색 제외로 시작 · 서버 함수·주소 목록·관리자 메뉴', () => {
  for (const p of ['cases/index.html', 'cases/view/index.html']) assert.match(read(p), /<meta name="robots" content="noindex,follow">/, p);
  const r = JSON.parse(read('_routes.json')).include; for (const p of ['/cases/', '/cases/view/', '/cases/sitemap.xml']) assert.ok(r.includes(p), p);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/megaspot\.kr\/cases\/sitemap\.xml/);
  const html = read('admin/index.html'); assert.ok(html.indexOf('admin-event-cases.js') < html.indexOf('admin-navigation.js'));
  assert.match(read('assets/js/pages/admin-navigation.js'), /view-event-cases/);
  assert.match(read('functions/api/admin/[[path]].js'), /path==='event-cases'\|\|path\.startsWith\('event-cases\/'\)/);
});
