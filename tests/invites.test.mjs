// 모임 키트 초대장 점검 (2026-11-21)
//  · 확정 예약(예약번호 + 휴대폰 뒷 4자리)으로만 만들고, 예약 1건에 1장
//  · 참석자 화면에는 예약자 이름·연락처가 나가지 않고, 일시·공간은 예약에서 다시 읽는다
//  · 참석 응답: 동의 필수 · 같은 브라우저 키면 고치기 · 마감·지난 행사 거절 · 휴대폰 번호 없음
//  · 주최자 관리 링크·스크린 링크는 서로 다른 서명, 스크린에는 ‘참석’ 이름만
//  · 보관 기간(응답 30일 · 초대장 90일)이 지나면 지움
//   node --test tests/invites.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as api } from '../functions/api/invites/[[path]].js';
import { kstToday } from '../functions/api/_lib.js';
import { cleanInvite, cleanPlay, phaseOf, purge, THEMES, RSVP_STATUS } from '../functions/api/_invites.js';
import { buildAll } from '../tools/kit-pages/build.mjs';

const ORIGIN = 'https://megaspot.test';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const day = n => kstToday(n);
function fixture(t) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const env = { ADMIN_KEY: 'test-only', CONFIRM_SECRET: 'confirm-secret-for-tests-0123456789',
    DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  const booking = (code, o = {}) => db.prepare('INSERT INTO bookings (booking_code, space_id, customer_name, phone, phone_last4, date, slot, headcount, status, start_h, end_h, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(code, o.space || 'megaspot-gundae-2', '홍길동', '01012345678', '5678', o.date || day(20), 'custom', o.people || 100, o.status || 'confirmed', o.start ?? 18, o.end ?? 22, '2026-11-01 10:00:00');
  let ip = 0;
  const call = async (path, { method = 'GET', body, origin = ORIGIN, from } = {}) => {
    const headers = { 'content-type': 'application/json', origin, 'cf-connecting-ip': from || '10.0.0.' + (++ip % 200) };
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/invites/' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    return { status: res.status, json: await res.json() };
  };
  return { db, env, call, booking };
}
const CONTENT = { title: '2026 송년의 밤', host: '조직문화팀', message: '한 해 동안 고생 많으셨습니다.\n편하게 오세요.', entry: '18:00',
  schedule: [{ time: '18:30', text: '개회' }, { time: '19:00', text: '저녁 식사' }, { time: 'xx', text: '퀴즈·경품 추첨' }, { text: '' }],
  notice: '명함을 챙겨 오세요.', contact: '총무 김OO', contact_url: 'https://open.kakao.com/o/test', theme: 'cobalt',
  rsvp: { open: true, ask_party: true, ask_car: true, question: '못 드시는 음식이 있나요?' } };
const tok = n => 'tok-' + String(n).padStart(20, '0');

test('확정 예약으로만 만든다 — 뒷자리 틀림·취소·확정 전·지난 예약 거절, 예약 1건에 1장', async t => {
  const f = fixture(t);
  f.booking('BK-OK'); f.booking('BK-CANCEL', { status: 'cancelled' }); f.booking('BK-REVIEW', { status: 'payment_review' }); f.booking('BK-PAST', { date: day(-3), status: 'completed' });
  assert.equal((await f.call('verify', { method: 'POST', body: { booking_code: 'bk-ok', phone_last4: '0000' } })).status, 404);
  assert.equal((await f.call('verify', { method: 'POST', body: { booking_code: 'BK-CANCEL', phone_last4: '5678' } })).status, 410);
  assert.equal((await f.call('verify', { method: 'POST', body: { booking_code: 'BK-REVIEW', phone_last4: '5678' } })).status, 409);
  assert.equal((await f.call('verify', { method: 'POST', body: { booking_code: 'BK-PAST', phone_last4: '5678' } })).json.code, 'PAST');
  let r = await f.call('verify', { method: 'POST', body: { booking_code: 'bk-ok', phone_last4: '5678' } });
  assert.equal(r.status, 200); assert.equal(r.json.booking.space_name, '메가스팟 건대 2호'); assert.equal(r.json.existing, null);
  assert.ok(!JSON.stringify(r.json).includes('홍길동') && !JSON.stringify(r.json).includes('0101234'));
  assert.equal((await f.call('create', { method: 'POST', body: { booking_code: 'BK-OK', phone_last4: '5678', ...CONTENT, title: 'a' } })).status, 400);
  r = await f.call('create', { method: 'POST', body: { booking_code: 'BK-OK', phone_last4: '5678', ...CONTENT } });
  assert.equal(r.status, 200); assert.match(r.json.public_url, /^\/invite\/\?c=[a-z2-9]{10}$/); assert.match(r.json.manage_url, /^\/invite\/manage\/\?id=IV-\d{4}-[A-Z2-9]{4}&k=/);
  assert.match(r.json.screen_url, /^\/play\/\?ev=IV-/);
  const again = await f.call('create', { method: 'POST', body: { booking_code: 'BK-OK', phone_last4: '5678', ...CONTENT, title: '다른 제목' } });
  assert.equal(again.json.existing, true); assert.equal(again.json.manage_url, r.json.manage_url);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invites').get().n, 1);
  const v = await f.call('verify', { method: 'POST', body: { booking_code: 'BK-OK', phone_last4: '5678' } });
  assert.equal(v.json.existing.manage_url, r.json.manage_url);   // 관리 링크를 잃어버려도 예약 확인으로 다시 엽니다
  assert.equal((await f.call('create', { method: 'POST', body: { booking_code: 'BK-OK', phone_last4: '5678', ...CONTENT }, origin: 'https://evil.example' })).status, 403);
});

test('참석자 화면: 예약자 정보 없이 일시·공간을 예약에서 읽고, 날짜가 바뀌면 따라간다', async t => {
  const f = fixture(t); f.booking('BK-A', { space: 'megaspot-gundae', start: 18, end: 25 });
  const c = (await f.call('create', { method: 'POST', body: { booking_code: 'BK-A', phone_last4: '5678', ...CONTENT } })).json;
  const code = c.public_url.split('c=')[1];
  let v = await f.call('view?c=' + code);
  assert.equal(v.status, 200);
  const inv = v.json.invite;
  assert.equal(inv.title, '2026 송년의 밤'); assert.equal(inv.space.name, '메가스팟 건대 1호'); assert.equal(inv.start_h, 18); assert.equal(inv.end_h, 25);
  assert.deepEqual(inv.schedule, [{ time: '18:30', text: '개회' }, { time: '19:00', text: '저녁 식사' }, { time: '', text: '퀴즈·경품 추첨' }]);
  assert.equal(inv.place.road, '서울 광진구 능동로13길 39'); assert.equal(inv.phase, 'before'); assert.equal(inv.rsvp.open, true);
  const raw = JSON.stringify(v.json);
  for (const secret of ['홍길동', '5678', '01012345678', 'BK-A', 'IV-']) assert.ok(!raw.includes(secret), secret + ' 가 참석자 화면에 나갔습니다');
  f.db.prepare("UPDATE bookings SET date = ?, space_id = 'megaspot-gundae-2' WHERE booking_code = 'BK-A'").run(day(30));
  v = await f.call('view?c=' + code);
  assert.equal(v.json.invite.date, day(30)); assert.equal(v.json.invite.space.name, '메가스팟 건대 2호');
  assert.equal(f.db.prepare('SELECT event_date FROM invites').get().event_date, day(30));
  f.db.prepare("UPDATE bookings SET status = 'cancelled' WHERE booking_code = 'BK-A'").run();
  assert.equal((await f.call('view?c=' + code)).status, 410);
  assert.equal((await f.call('view?c=nothere123')).status, 404);
});

test('참석 응답: 동의 필수 · 같은 키면 고치기 · 인원·차량은 설정대로 · 마감과 끝난 행사는 거절', async t => {
  const f = fixture(t); f.booking('BK-R');
  const c = (await f.call('create', { method: 'POST', body: { booking_code: 'BK-R', phone_last4: '5678', ...CONTENT } })).json;
  const code = c.public_url.split('c=')[1];
  const send = (b, from) => f.call('rsvp', { method: 'POST', body: { c: code, agree: true, ...b }, from });
  assert.match((await send({ t: tok(1), name: '김참석', status: 'yes', agree: false })).json.error, /동의/);
  assert.equal((await send({ t: tok(1), name: '', status: 'yes' })).status, 400);
  assert.equal((await send({ t: tok(1), name: '김참석', status: 'maybe?' })).status, 400);
  let r = await send({ t: tok(1), name: '김참석', status: 'yes', party: 3, cars: 1, answer: '해산물' });
  assert.equal(r.status, 200); assert.equal(r.json.updated, false);
  r = await send({ t: tok(1), name: '김참석', status: 'yes', party: 99, cars: 99, answer: '없어요' });
  assert.equal(r.json.updated, true); assert.equal(r.json.mine.party, 20); assert.equal(r.json.mine.cars, 10);
  await send({ t: tok(2), name: '이불참', status: 'no', party: 5, cars: 2, answer: '무시' });
  await send({ t: tok(3), name: '박미정', status: 'maybe', party: 2 });
  const rows = f.db.prepare('SELECT name, status, party, cars, answer FROM invite_rsvps ORDER BY id').all().map(x => ({ ...x }));
  assert.deepEqual(rows, [{ name: '김참석', status: 'yes', party: 20, cars: 10, answer: '없어요' }, { name: '이불참', status: 'no', party: 0, cars: 0, answer: '' }, { name: '박미정', status: 'maybe', party: 2, cars: 0, answer: '' }]);
  assert.ok(!f.db.prepare('PRAGMA table_info(invite_rsvps)').all().some(c => /phone/.test(c.name)), '휴대폰 번호 칸이 없어야 합니다');
  const mine = await f.call('rsvp?c=' + code + '&t=' + tok(1));
  assert.equal(mine.json.mine.name, '김참석');
  assert.equal((await f.call('rsvp?c=' + code + '&t=' + tok(9))).json.mine, null);
  // 응답 설정을 끄면 인원·차량을 받지 않습니다
  const k = new URL(ORIGIN + c.manage_url).searchParams;
  await f.call('manage', { method: 'POST', body: { id: k.get('id'), k: k.get('k'), action: 'update', data: { ...CONTENT, rsvp: { open: true, ask_party: false, ask_car: false } } } });
  r = await send({ t: tok(4), name: '최하나', status: 'yes', party: 4, cars: 2, answer: 'x' });
  assert.deepEqual([r.json.mine.party, r.json.mine.cars, r.json.mine.answer], [1, 0, '']);
  // 마감일이 지나면 받지 않습니다
  await f.call('manage', { method: 'POST', body: { id: k.get('id'), k: k.get('k'), action: 'update', data: { ...CONTENT, rsvp: { open: true, deadline: day(-1) } } } });
  assert.equal((await send({ t: tok(5), name: '늦은이', status: 'yes' })).json.code, 'RSVP_CLOSED');
  await f.call('manage', { method: 'POST', body: { id: k.get('id'), k: k.get('k'), action: 'update', data: { ...CONTENT, rsvp: { open: false } } } });
  assert.equal((await f.call('view?c=' + code)).json.invite.rsvp.open, false);
  assert.equal((await send({ t: tok(6), name: '닫힘', status: 'yes' })).json.code, 'RSVP_CLOSED');
});

test('주최자 관리: 링크 서명 확인 · 응답 요약 · 응답 지우기 · 초대장 삭제', async t => {
  const f = fixture(t); f.booking('BK-M');
  const c = (await f.call('create', { method: 'POST', body: { booking_code: 'BK-M', phone_last4: '5678', ...CONTENT } })).json;
  const code = c.public_url.split('c=')[1], q = new URL(ORIGIN + c.manage_url).searchParams, id = q.get('id'), k = q.get('k');
  for (const [i, s, p, car] of [[1, 'yes', 2, 1], [2, 'yes', 1, 0], [3, 'maybe', 3, 0], [4, 'no', 1, 0]])
    await f.call('rsvp', { method: 'POST', body: { c: code, t: tok(i), name: '손님' + i, status: s, party: p, cars: car, agree: true } });
  assert.equal((await f.call(`manage?id=${id}&k=wrongwrongwrongwrong00`)).status, 403);
  const sk = new URL(ORIGIN + c.screen_url).searchParams.get('s');
  assert.notEqual(sk, k); assert.equal((await f.call(`manage?id=${id}&k=${sk}`)).status, 403);   // 스크린 링크로는 명단을 볼 수 없습니다
  let m = await f.call(`manage?id=${id}&k=${k}`);
  assert.equal(m.status, 200);
  assert.deepEqual({ ...m.json.summary }, { yes: 2, maybe: 1, no: 1, people: 3, maybe_people: 3, cars: 1, total: 4 });
  assert.equal(m.json.booking.headcount, 100); assert.equal(m.json.data.title, '2026 송년의 밤');
  await f.call('manage', { method: 'POST', body: { id, k, action: 'remove', rsvp_id: m.json.rsvps[3].id } });
  m = await f.call(`manage?id=${id}&k=${k}`); assert.equal(m.json.summary.total, 3);
  assert.equal((await f.call('manage', { method: 'POST', body: { id, k, action: 'update', data: { title: '' } } })).status, 400);
  assert.equal((await f.call('manage', { method: 'POST', body: { id, k, action: 'update', data: { ...CONTENT, contact_url: 'javascript:alert(1)' } } })).status, 400);
  const u = await f.call('manage', { method: 'POST', body: { id, k, action: 'update', data: { ...CONTENT, title: '송년의 밤 (장소 확정)', theme: 'nope' } } });
  assert.equal(u.json.data.theme, 'chalk');
  assert.equal((await f.call('view?c=' + code)).json.invite.title, '송년의 밤 (장소 확정)');
  await f.call('manage', { method: 'POST', body: { id, k, action: 'delete' } });
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invite_rsvps').get().n, 0);
  assert.equal((await f.call('view?c=' + code)).status, 404);
});

test('스크린: 참석 이름만 넘기고, 준비 내용은 정리해서 저장한다', async t => {
  const f = fixture(t); f.booking('BK-S');
  const c = (await f.call('create', { method: 'POST', body: { booking_code: 'BK-S', phone_last4: '5678', ...CONTENT } })).json;
  const code = c.public_url.split('c=')[1], q = new URL(ORIGIN + c.screen_url).searchParams, id = q.get('ev'), s = q.get('s');
  for (const [i, st] of [[1, 'yes'], [2, 'maybe'], [3, 'yes'], [4, 'no']]) await f.call('rsvp', { method: 'POST', body: { c: code, t: tok(i), name: '손님' + i, status: st, party: 2, agree: true, answer: '비밀 답변' } });
  assert.equal((await f.call(`screen?id=${id}&s=bad`)).status, 403);
  let r = await f.call(`screen?id=${id}&s=${s}`);
  assert.deepEqual(r.json.attendees, ['손님1', '손님3']); assert.equal(r.json.people, 4);
  assert.ok(!JSON.stringify(r.json).includes('비밀 답변'));
  assert.equal(r.json.play.welcome.theme, 'light'); assert.equal(r.json.play.bingo.max, 75);
  const play = { welcome: { title: '환영합니다', theme: 'dark', qr: 'custom', qr_url: 'javascript:x', schedule: [{ time: '18:30', text: '개회' }] },
    quiz: { title: '송년 퀴즈', points: 5000, teams: ['1팀', '2팀', ''], questions: [{ type: 'choice', q: '2호선 색은?', options: ['초록', '파랑', '주황', '보라'], answer: 7 }, { type: 'ox', q: '물은 100도에서 끓는다', answer: 'O' }, { type: 'weird', q: '' }] },
    wheel: { items: ['노래 한 소절', '', '패스'], remove: 'on' }, draw: { prizes: [{ name: '1등', count: 0 }] }, bingo: { max: 33 } };
  r = await f.call('screen', { method: 'POST', body: { id, s, play } });
  assert.equal(r.status, 200);
  const p = r.json.play;
  assert.equal(p.welcome.qr_url, ''); assert.equal(p.welcome.theme, 'dark'); assert.equal(p.quiz.points, 1000); assert.deepEqual(p.quiz.teams, ['1팀', '2팀']);
  assert.equal(p.quiz.questions.length, 2); assert.equal(p.quiz.questions[0].answer, 3); assert.deepEqual(p.wheel.items, ['노래 한 소절', '패스']); assert.equal(p.wheel.remove, true);
  assert.equal(p.draw.prizes[0].count, 1); assert.equal(p.bingo.max, 75);
  assert.equal((await f.call(`screen?id=${id}&s=${s}`)).json.play.quiz.title, '송년 퀴즈');
  const mk = new URL(ORIGIN + c.manage_url).searchParams.get('k');
  assert.equal((await f.call('screen', { method: 'POST', body: { id, s: mk, play } })).status, 403);
});

test('보관 기간: 응답은 행사일 30일 뒤, 초대장은 90일 뒤 지운다', async t => {
  const f = fixture(t);
  const add = (id, date) => { f.db.prepare("INSERT INTO invites (id, code, booking_code, space_id, event_date, data, status, created_at) VALUES (?,?,?,?,?,?,'active','x')").run(id, id.toLowerCase(), 'B-' + id, 'megaspot-gundae', date, '{}');
    f.db.prepare("INSERT INTO invite_rsvps (invite_id, token_hash, name, status, created_at) VALUES (?,?,?,?,'x')").run(id, 'h-' + id, 'n', 'yes'); };
  add('IV-NEW', day(-29)); add('IV-MID', day(-31)); add('IV-OLD', day(-91));
  await purge(f.env);
  assert.deepEqual(f.db.prepare('SELECT invite_id FROM invite_rsvps').all().map(r => r.invite_id), ['IV-NEW']);
  assert.deepEqual(f.db.prepare('SELECT id FROM invites ORDER BY id').all().map(r => r.id), ['IV-MID', 'IV-NEW']);
});

test('행사 단계·입력 정리', () => {
  assert.equal(phaseOf('2026-12-18', 22, '2026-12-17'), 'before');
  assert.equal(phaseOf('2026-12-18', 22, '2026-12-18'), 'today');
  assert.equal(phaseOf('2026-12-18', 22, '2026-12-19'), 'after');
  const c = cleanInvite({ title: '  모임\n이름  ', message: 'a\n\n\n\nb', entry: '25:00', theme: 'rust', rsvp: { deadline: '2026-12-31' } }, '2026-12-18');
  assert.equal(c.title, '모임 이름'); assert.equal(c.message, 'a\n\nb'); assert.equal(c.entry, '25:00'); assert.equal(c.theme, 'rust'); assert.equal(c.rsvp.deadline, '');
  assert.equal(cleanInvite({ title: '모임', entry: '31:00' }).entry, '');
  assert.deepEqual(Object.keys(THEMES), ['chalk', 'cobalt', 'graphite', 'rust']);
  assert.equal(cleanPlay({}).quiz.time, 15);
});

test('화면 파일이 서버 값과 같은 테마·상태를 쓴다', () => {
  const kit = read('assets/js/kit/kit-core.js');
  for (const [k, v] of Object.entries(THEMES)) assert.match(kit, new RegExp(`${k}: '${v}'`), '초대장 테마 ' + k);
  for (const [k, v] of Object.entries(RSVP_STATUS)) assert.match(kit, new RegExp(`${k}: '${v}'`), '응답 상태 ' + k);
  // 머리말·꼬리말이 기준 페이지와 같고, 참석자 화면은 검색에 나오지 않음
  assert.match(read('invite/index.html'), /noindex,nofollow/);
  assert.match(read('kit/index.html'), /index,follow/);
});

test('모임 키트 페이지가 저장소 파일과 같다 (node tools/kit-pages/build.mjs)', () => {
  const { files, pages } = buildAll();
  for (const [file, body] of Object.entries(files)) assert.equal(read(file), body, file + ' 가 최신이 아닙니다');
  const sitemap = read('sitemap.xml');
  for (const p of pages) assert.equal(sitemap.includes(`<loc>https://megaspot.kr${p.path}</loc>`), p.index, p.path);
});
