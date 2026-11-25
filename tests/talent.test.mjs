// MC·아나운서·강사·레크리에이션 섭외 (2026-11-25)
//  · 처음 한 번 진행자 4명이 공개 상태로 들어가고, 다시 불러도 두 번 들어가지 않는다
//  · 관리자 전용 칸(휴대폰·이메일·카카오톡·출연료 기준·메모)은 공개 API·공개 화면 HTML·사이트맵·상태 조회 어디에도 나가지 않는다
//  · 공개 칸에 전화번호·이메일·카카오톡 주소를 적으면 저장되지 않는다
//  · 섭외 요청: 필수값·지난 날짜·희망 진행자(공개 중인 사람만, 최대 3명)·자동 입력 막기
//  · 관리자: 상태·배정·견적·출연료 저장과 진행 기록, 고객 상태 조회는 휴대폰 뒷 4자리가 맞아야 한다
//  · 문의·예약 표는 건드리지 않는다
//   node --test tests/talent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { talentPublic, talentAdmin, cleanProfile, hasContact, ensureSeed } from '../functions/api/_talent.js';
import { VIEW, serveTalentList, serveTalentView, talentSitemap } from '../functions/api/_talent_view.js';
import { SEED } from '../functions/api/_talent_seed.js';
import { SCHEMA } from '../functions/api/_schema.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fixture(t, { fromSchemaJs = false } = {}) {
  const db = new DatabaseSync(':memory:');
  if (fromSchemaJs) for (const s of SCHEMA) db.exec(s); else db.exec(read('schema.sql'));
  t.after(() => db.close());
  const env = { DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  return { db, env };
}
const IP = { 'cf-connecting-ip': '203.0.113.7', 'content-type': 'application/json' };
async function pub(env, path, method = 'GET', body, ip = IP) {
  const request = new Request('https://megaspot.kr/api/talent/' + path, { method, headers: ip, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await talentPublic({ request, env, path: path.split('?')[0] }, VIEW); return { status: r.status, body: r.headers.get('content-type').includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
}
async function admin(env, path, method = 'GET', body) {
  const url = new URL('https://megaspot.kr/api/admin/' + path);
  const request = new Request(url, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
  const r = await talentAdmin({ request, env, path: path.split('?')[0], method, url }); return r ? { status: r.status, body: await r.json() } : null;
}
const page = async (fn, env, file, url) => (await fn({ request: new Request('https://megaspot.kr' + url), env, next: async () => new Response(read(file), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }) })).text();
const future = (days = 20) => new Date(Date.now() + 9 * 36e5 + days * 864e5).toISOString().slice(0, 10);
const SECRET = { phone: '010-9876-5432', email: 'kimsol.private@example.com', kakao: 'sol_kakao_id', agency: '비공개 매니지먼트', fee_basis: '2시간 기준 비공개 금액', settle: '정산 메모', memo: '내부 메모 XYZ' };
const REQ = { name: '홍길동', phone: '010-1234-5678', email: 'hong@example.com', agree_privacy: true, event_type: 'party', event_date: future(), start_t: '18:00', end_t: '21:00', place: 'megaspot-gundae-2', headcount: 150, roles: ['mc', 'recreation', 'bogus'], langs: ['ja'], picks: ['yoo-gahee', 'kim-sol', 'nope-person', 'kim-sol'], budget: 'b100', needs: ['script'], message: '송년회 2부 레크리에이션까지 부탁드립니다.' };

test('처음 한 번 진행자 4명이 공개 상태로 들어가고 두 번 들어가지 않는다 · 첫 등록분은 연락처 검사를 통과한다', async t => {
  const { db, env } = fixture(t, { fromSchemaJs: true });
  const r = await pub(env, ''); assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map(x => x.slug), ['kim-sol', 'yoo-gahee', 'kim-eunkyung', 'yeon-juhae']);
  await ensureSeed(env); await ensureSeed({ DB: env.DB });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM talents').get().n, 4);
  db.exec("DELETE FROM talents"); const again = await pub(env, ''); assert.equal(again.body.items.length, 0, '한 번 넣은 뒤에는 다시 넣지 않음');
  for (const s of SEED) { const c = cleanProfile(s.data); assert.equal(c.error, undefined, s.slug + ' ' + c.error); for (const p of [s.data.photo, ...s.data.photos.flatMap(x => [x.src, x.thumb])]) assert.ok(readFileSync(new URL('..' + p, import.meta.url)).length > 1000, p); }
});

test('관리자 전용 칸은 공개 API·목록·상세 HTML·사이트맵 어디에도 나가지 않는다', async t => {
  const { env } = fixture(t);
  await pub(env, '');
  const before = await admin(env, 'talent/profiles/kim-sol');
  assert.equal((await admin(env, 'talent/profiles/kim-sol', 'PUT', { data: before.body.item.raw, private: SECRET })).status, 200);
  const got = await admin(env, 'talent/profiles/kim-sol'); assert.equal(got.body.item.private.phone, SECRET.phone, '관리자에게는 보임');
  const leaks = s => Object.values(SECRET).filter(v => s.includes(v)).concat(/9876|5432/.test(s) ? ['phone digits'] : []);
  const list = await pub(env, '?html=1'), one = await pub(env, 'kim-sol?html=1');
  assert.deepEqual(leaks(JSON.stringify(list.body)), []); assert.deepEqual(leaks(JSON.stringify(one.body)), []);
  assert.equal(one.body.item.private, undefined); assert.equal(one.body.item.raw, undefined);
  const listHtml = await page(serveTalentList, env, 'mc/index.html', '/mc/'), viewHtml = await page(serveTalentView, env, 'mc/view/index.html', '/mc/view/?id=kim-sol');
  assert.deepEqual(leaks(listHtml), []); assert.deepEqual(leaks(viewHtml), []);
  assert.match(listHtml, /data-slug="kim-sol"/); assert.match(listHtml, /"@type":"ItemList"/);
  assert.match(viewHtml, /<title>김솔 아나운서 섭외 \| MC·강사 섭외 \| 메가스팟<\/title>/); assert.match(viewHtml, /<h1 class="tv-name">김솔/);
  assert.match(viewHtml, /<link rel="canonical" href="https:\/\/megaspot\.kr\/mc\/view\/\?id=kim-sol">/); assert.match(viewHtml, /"@type":"Person"/);
  assert.match(viewHtml, /<meta name="robots" content="index,follow/);
  assert.deepEqual(leaks(await (await talentSitemap(env)).text()), []);
  // 숨긴 진행자는 공개에서 빠진다
  await admin(env, 'talent/profiles/kim-sol/status', 'POST', { status: 'hidden' });
  assert.equal((await pub(env, 'kim-sol')).status, 404);
  assert.doesNotMatch(await page(serveTalentList, env, 'mc/index.html', '/mc/'), /data-slug="kim-sol"/);
  assert.doesNotMatch(await page(serveTalentView, env, 'mc/view/index.html', '/mc/view/?id=kim-sol'), /tv-name/);
});

test('공개 칸에 전화번호·이메일·카카오톡 주소를 적으면 저장되지 않는다', async t => {
  const { env } = fixture(t);
  await pub(env, '');
  for (const bad of [{ intro: '문의 010-2222-3333 으로 주세요' }, { headline: '메일 me@test.co.kr' }, { brief: ['오픈채팅 https://open.kakao.com/o/abc'] }, { career: [{ h: '연락', items: ['카톡 아이디: hello'] }] }]) {
    const r = await admin(env, 'talent/profiles/yoo-gahee', 'PUT', { data: bad }); assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(r.body.code, 'CONTACT_IN_PUBLIC');
  }
  assert.ok(!hasContact('2019~2024, 6년 연속 · 2026.11.18 · 연 150건 · 1,500명'), '연도·날짜·숫자는 연락처로 보지 않음');
  const r = await admin(env, 'talent/profiles/yoo-gahee', 'PUT', { data: { intro: '소개를 고쳤습니다.' }, private: { phone: '010-2222-3333' } }); assert.equal(r.status, 200, '연락처는 관리자 전용 칸에는 저장됨');
});

test('섭외 요청: 필수값·지난 날짜·희망 진행자 검사, 자동 입력 막기, 문의·예약 표는 그대로', async t => {
  const { db, env } = fixture(t);
  await pub(env, '');
  const before = JSON.stringify([db.prepare('SELECT * FROM inquiries').all(), db.prepare('SELECT * FROM bookings').all()]);
  assert.equal((await pub(env, 'request', 'POST', { ...REQ, agree_privacy: false })).status, 400);
  assert.equal((await pub(env, 'request', 'POST', { ...REQ, name: '' })).status, 400);
  assert.equal((await pub(env, 'request', 'POST', { ...REQ, phone: '12' })).status, 400);
  assert.equal((await pub(env, 'request', 'POST', { ...REQ, event_date: '2020-01-01' })).status, 400, '지난 날짜');
  assert.equal((await pub(env, 'request', 'POST', { ...REQ, place: 'other', place_detail: '' })).status, 400, '다른 장소는 지역 필요');
  const spam = await pub(env, 'request', 'POST', { ...REQ, website: 'x' }); assert.equal(spam.body.ref, 'TR-0000-SPAM');
  const ok = await pub(env, 'request', 'POST', REQ); assert.equal(ok.status, 200); assert.match(ok.body.ref, /^TR-\d{4}-[A-Z0-9]{4}$/);
  assert.deepEqual(ok.body.picks, ['유가희', '김솔'], '공개 중인 사람만 · 중복 제거');
  const row = db.prepare('SELECT * FROM talent_requests WHERE ref = ?').get(ok.body.ref), d = JSON.parse(row.data);
  assert.deepEqual(d.roles, ['mc', 'recreation']); assert.equal(d.recommend, false); assert.equal(row.status, 'new');
  const tbd = await pub(env, 'request', 'POST', { ...REQ, picks: [], date_tbd: true, event_date: future(), phone: '01011112222' });
  const t2 = db.prepare('SELECT * FROM talent_requests WHERE ref = ?').get(tbd.body.ref); assert.equal(t2.event_date, null); assert.equal(JSON.parse(t2.data).recommend, true, '희망 진행자가 없으면 추천 요청');
  for (let i = 0; i < 4; i++) await pub(env, 'request', 'POST', { ...REQ, picks: [] });
  assert.equal((await pub(env, 'request', 'POST', REQ)).status, 429, '같은 곳에서 10분에 6건 넘게는 막음');
  assert.equal(JSON.stringify([db.prepare('SELECT * FROM inquiries').all(), db.prepare('SELECT * FROM bookings').all()]), before);
});

test('관리자: 배정·견적·상태 저장과 진행 기록 · 고객 상태 조회는 뒷 4자리가 맞아야 하고 출연료·연락처는 나가지 않는다', async t => {
  const { env } = fixture(t);
  await pub(env, '');
  await admin(env, 'talent/profiles/yoo-gahee', 'PUT', { data: {}, private: SECRET });
  const ref = (await pub(env, 'request', 'POST', REQ)).body.ref;
  let list = await admin(env, 'talent/requests'); assert.equal(list.body.items[0].ref, ref); assert.equal(list.body.counts.new, 1);
  assert.deepEqual(list.body.items[0].picks_label, ['유가희', '김솔']);
  assert.equal((await admin(env, 'talent/requests?q=5678')).body.items.length, 1, '휴대폰 번호로 찾기');
  assert.equal((await admin(env, `talent/requests/${ref}`, 'PUT', { quote_amount: 'abc' })).status, 400);
  const up = await admin(env, `talent/requests/${ref}`, 'PUT', { status: 'quoted', assigned: ['yoo-gahee', 'ghost'], quote_amount: '880,000', talent_fee: 600000, vat: 'excl', memo: '2부 게임 30분' });
  assert.equal(up.status, 200); assert.deepEqual(up.body.item.admin.assigned, ['yoo-gahee']); assert.equal(up.body.item.admin.quote_amount, 880000);
  assert.ok(up.body.item.admin.history.some(h => /견적 안내/.test(h.text)) && up.body.item.admin.history.some(h => /유가희/.test(h.text)));
  const sum = await admin(env, 'talent/summary'); assert.equal(sum.body.counts.quoted, 1);
  assert.equal((await pub(env, 'status', 'POST', { ref, phone4: '0000' }, { ...IP, 'cf-connecting-ip': '198.51.100.1' })).status, 404);
  const st = await pub(env, 'status', 'POST', { ref: ref.toLowerCase(), phone4: '5678' }, { ...IP, 'cf-connecting-ip': '198.51.100.1' });
  assert.equal(st.status, 200); assert.equal(st.body.status_label, '견적 안내'); assert.deepEqual(st.body.assigned, ['유가희']); assert.equal(st.body.quote.amount, 880000);
  const s = JSON.stringify(st.body); assert.ok(!s.includes('600000') && !s.includes(SECRET.phone) && !s.includes('2부 게임'), '출연료·연락처·운영 메모는 고객 조회에 없음');
  // 직접 등록 (전화로 받은 요청)
  const manual = await admin(env, 'talent/requests', 'POST', { name: '김담당', phone: '02-555-1234', event_date: '2026-01-05', place: 'tbd', memo: '전화 문의' });
  assert.equal(manual.status, 200, '관리자는 지난 날짜·장소 미정도 등록 가능');
});

test('프로필 새로 만들기·공개 조건·지우기 · 사진 올리기', async t => {
  const { env } = fixture(t);
  await pub(env, '');
  assert.equal((await admin(env, 'talent/profiles', 'POST', { slug: 'Bad Slug', data: { name: '새 진행자' } })).status, 400);
  assert.equal((await admin(env, 'talent/profiles', 'POST', { slug: 'kim-sol', data: { name: '중복' } })).status, 409);
  const c = await admin(env, 'talent/profiles', 'POST', { slug: 'new-mc', data: { name: '새 진행자', title: '행사 MC' }, private: { phone: '010-1111-2222' } });
  assert.equal(c.status, 200);
  assert.equal((await pub(env, 'new-mc')).status, 404, '준비 중은 공개 안 됨');
  assert.match((await admin(env, 'talent/profiles/new-mc/status', 'POST', { status: 'published' })).body.error, /대표 사진/);
  const jpg = readFileSync(new URL('../assets/img/talent/kim-sol/main-s.webp', import.meta.url)).toString('base64');
  assert.equal((await admin(env, 'talent/photos', 'POST', { body: 'not-an-image' })).status, 400);
  const ph = await admin(env, 'talent/photos', 'POST', { body: jpg, thumb: jpg, w: 360, h: 450 }); assert.equal(ph.status, 200);
  const img = await pub(env, 'photo/' + ph.body.id + '?t=1'); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/webp');
  await admin(env, 'talent/profiles/new-mc', 'PUT', { data: { headline: '밝은 진행', roles: ['mc'], photo: ph.body.src } });
  assert.equal((await admin(env, 'talent/profiles/new-mc/status', 'POST', { status: 'published' })).status, 200);
  const one = await pub(env, 'new-mc'); assert.equal(one.body.item.photo.small, ph.body.src + '?t=1');
  assert.equal((await admin(env, 'talent/profiles/new-mc', 'DELETE')).status, 409, '공개한 적이 있으면 지우지 않음');
  assert.equal((await admin(env, 'talent/profiles', 'POST', { slug: 'temp-one', data: { name: '임시' } })).status, 200);
  assert.equal((await admin(env, 'talent/profiles/temp-one', 'DELETE')).status, 200);
});

test('화면 연결: 서버 함수 경로 · robots 사이트맵 · 머리말·꼬리말 링크 · 관리자 메뉴', () => {
  const routes = JSON.parse(read('_routes.json')).include; for (const p of ['/mc/', '/mc/view/', '/mc/sitemap.xml']) assert.ok(routes.includes(p), p);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/megaspot\.kr\/mc\/sitemap\.xml/);
  for (const f of ['tools/site-chrome/partials/header.html', 'tools/site-chrome/partials/mobile-nav.html', 'tools/site-chrome/partials/footer.html', 'index.html']) assert.match(read(f), /href="\/mc\/"/, f);
  const admin = read('admin/index.html'); assert.ok(admin.indexOf('admin-talent.js') > 0 && admin.indexOf('admin-talent.js') < admin.indexOf('admin-navigation.js'), '메뉴 버튼은 메뉴 정리 전에 만들어야 함');
  assert.match(read('assets/js/pages/admin-navigation.js'), /\['talent','MC·강사 섭외'\]/);
  // 공개 화면 스크립트·HTML 에는 관리자 전용 칸 이름이 없다
  for (const f of ['assets/js/pages/talent.js', 'mc/index.html', 'mc/view/index.html', 'functions/api/_talent_view.js']) assert.doesNotMatch(read(f), /\bprivate\b|fee_basis|p_phone/, f);
});
