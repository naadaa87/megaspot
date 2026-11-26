// 모임 초대장 · 예약 정보로 찾기 · 카카오톡(알림톡) · 관리자 발송 · PDF (2026-11-24)
//  · 이용 날짜·시작 시간·예약자 이름·연락처로 확정 예약을 찾는다(띄어쓰기·'님'·추가 연락처·자정 넘긴 예약), 응답에 이름·번호를 싣지 않는다
//  · 카카오톡은 코드 저장 → 승인 확인 → 시험 수신 확인 전에는 보내지 않고, 예약에 등록된 번호로만 보낸다
//  · 고객 직접 받기는 관리자가 켜야 하고 초대장 하나에 하루 세 번까지
//  · PDF는 A5 쪽마다 이미지 1장 + 초대장 주소 링크, xref 위치가 맞다
//   node --test tests/invite-kakao.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { onRequest as api } from '../functions/api/invites/[[path]].js';
import { kstToday } from '../functions/api/_lib.js';
import { pickBooking, nameMatches, purge } from '../functions/api/_invites.js';
import { INVITE_TEMPLATE, TEMPLATE_VARS, renderInvite } from '../functions/api/_invite_kakao.js';

const ORIGIN = 'https://megaspot.test';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const day = n => kstToday(n);
const ALIGO = { ALIGO_API_KEY: 'k', ALIGO_USERID: 'u', ALIGO_SENDER_KEY: 'sender-profile', ALIGO_SENDER: '0212345678', ALIGO_LIVE_ENABLED: 'true' };
function fixture(t, extra = {}) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const env = { ADMIN_KEY: 'test-only', CONFIRM_SECRET: 'confirm-secret-for-tests-0123456789', ...extra,
    DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { const r = st.run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; } } };
  const booking = (code, o = {}) => db.prepare('INSERT INTO bookings (booking_code, space_id, customer_name, phone, phone_last4, date, slot, headcount, status, start_h, end_h, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(code, o.space || 'megaspot-gundae-2', o.name || '홍길동', o.phone || '010-1234-5678', (o.phone || '5678').slice(-4), o.date || day(20), 'custom', 100, o.status || 'confirmed', o.start ?? 18, o.end ?? 22, '2026-11-01 10:00:00');
  let ip = 0;
  const call = async (path, { method = 'GET', body, admin = false } = {}) => {
    const headers = { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.1.0.' + (++ip % 200) };
    if (admin) headers['x-admin-key'] = 'test-only';
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/invites/' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    return { status: res.status, json: await res.json() };
  };
  return { db, env, call, booking };
}
// 알리고 직접 연결을 흉내 냅니다 (실제 발송 없음)
const REAL_FETCH = globalThis.fetch;
function mockAligo(t, { review = 'APR', content = INVITE_TEMPLATE.content, status = 200 } = {}) {
  const real = REAL_FETCH, calls = []; let mid = 900;
  globalThis.fetch = async (url, opts) => {
    const u = String(url); if (!u.startsWith('https://kakaoapi.aligo.in/akv10/')) return real(url, opts);
    const path = u.slice(32).replace(/\/$/, ''), data = Object.fromEntries(new URLSearchParams(opts.body)); calls.push({ path, data });
    if (status !== 200) return new Response('{}', { status });
    if (path === 'template/list') return Response.json({ code: 0, list: [{ templtCode: data.tpl_code, templtContent: content, senderKey: 'sender-profile', inspStatus: review, status: 'R', buttons: INVITE_TEMPLATE.buttons }] });
    return Response.json({ code: 0, info: { mid: String(++mid), scnt: 1, fcnt: 0 } });
  };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}
const CONTENT = { title: '2026 송년의 밤', host: '조직문화팀', theme: 'chalk', rsvp: { open: true } };
async function readyKakao(f, code = 'UN_7001') {
  assert.equal((await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'save', code } })).status, 200);
  const c = await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'check' } });
  assert.equal(c.json.check.ready, true, c.json.check.message);
  assert.equal((await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'test', receiver: '010-2222-3333' } })).status, 200);
  const k = await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'confirm' } });
  assert.equal(k.json.admin_ready, true);
  return k.json;
}

test('예약 정보로 찾기 — 이름 띄어쓰기·님·덧붙인 이름, 추가 연락처, 자정 넘긴 예약, 시간 틀림·취소·확정 전', async t => {
  const f = fixture(t);
  f.booking('BK-A', { name: '홍길동(조직문화팀)', start: 18, end: 22 });
  f.booking('BK-N', { name: '김민지', phone: '01055556666', date: day(10), start: 25, end: 29, space: 'megaspot-gundae' });
  f.booking('BK-X', { name: '박철수', phone: '01077778888', date: day(12), status: 'cancelled' });
  f.booking('BK-R', { name: '이영희', phone: '01033334444', date: day(13), status: 'payment_review' });
  f.db.prepare("INSERT INTO booking_contacts (booking_code, phone2, updated_at) VALUES ('BK-A', '01099990000', '2026-11-01 10:00:00')").run();
  const v = body => f.call('verify', { method: 'POST', body });
  let r = await v({ date: day(20), time: '18:00', name: '홍 길동님', phone: '010-1234-5678' });
  assert.equal(r.status, 200); assert.equal(r.json.booking.code, 'BK-A'); assert.equal(r.json.kakao.ready, false);
  assert.ok(!JSON.stringify(r.json).includes('홍길동') && !JSON.stringify(r.json).includes('1234-5678'));
  assert.equal((await v({ date: day(20), time: '17:00', name: '홍길동', phone: '01099990000' })).json.booking.code, 'BK-A');   // 추가 연락처 · 입장 1시간 전
  assert.equal((await v({ date: day(20), time: '15:00', name: '홍길동', phone: '01012345678' })).status, 404);
  assert.equal((await v({ date: day(20), time: '18:00', name: '김철수', phone: '01012345678' })).status, 404);
  assert.equal((await v({ date: day(20), time: '18:00', name: '홍길동', phone: '01011112222' })).status, 404);
  assert.equal((await v({ date: day(11), time: '01:00', name: '김민지', phone: '01055556666' })).json.booking.code, 'BK-N');   // 전날 날짜 · 시작 25시
  assert.equal((await v({ date: day(12), time: '18:00', name: '박철수', phone: '01077778888' })).json.code, 'CANCELLED');
  assert.equal((await v({ date: day(13), time: '18:00', name: '이영희', phone: '01033334444' })).json.code, 'NOT_CONFIRMED');
  assert.equal((await v({ date: day(20), time: '', name: '홍길동', phone: '' })).status, 400);   // 연락처는 꼭
  assert.equal((await v({ date: '', phone: '01012345678' })).status, 400);   // 날짜도 꼭
  // 예약 정보로 만들고, 같은 예약으로 다시 확인하면 기존 초대장 주소를 돌려준다
  const c = await f.call('create', { method: 'POST', body: { date: day(20), time: '18:30', name: '홍길동', phone: '01012345678', ...CONTENT } });
  assert.equal(c.status, 200); assert.match(c.json.manage_url, /^\/invite\/manage\/\?id=IV-/);
  assert.equal((await v({ date: day(20), time: '18:00', name: '홍길동', phone: '01099990000' })).json.existing.manage_url, c.json.manage_url);
  assert.equal(nameMatches('홍', '홍길동'), false);
});

test('이용 날짜·연락처만으로 찾기 (2026-11-26) — 시작 시간·이름 없이, 추가 연락처·자정 넘긴 예약·취소·확정 전', async t => {
  const f = fixture(t);
  f.booking('BK-A', { name: '홍길동(조직문화팀)', start: 18, end: 22 });
  f.booking('BK-N', { name: '김민지', phone: '01055556666', date: day(10), start: 25, end: 29, space: 'megaspot-gundae' });
  f.booking('BK-X', { name: '박철수', phone: '01077778888', date: day(12), status: 'cancelled' });
  f.booking('BK-R', { name: '이영희', phone: '01033334444', date: day(13), status: 'payment_review' });
  f.db.prepare("INSERT INTO booking_contacts (booking_code, phone2, updated_at) VALUES ('BK-A', '01099990000', '2026-11-01 10:00:00')").run();
  const v = body => f.call('verify', { method: 'POST', body });
  let r = await v({ date: day(20), phone: '010-1234-5678' });
  assert.equal(r.status, 200); assert.equal(r.json.booking.code, 'BK-A');
  assert.ok(!JSON.stringify(r.json).includes('홍길동') && !JSON.stringify(r.json).includes('1234-5678'), '응답에 이름·번호를 싣지 않음');
  assert.equal((await v({ date: day(20), phone: '01099990000' })).json.booking.code, 'BK-A');   // 추가 연락처
  assert.equal((await v({ date: day(20), phone: '01011112222' })).status, 404);
  assert.equal((await v({ date: day(21), phone: '01012345678' })).status, 404);
  assert.equal((await v({ date: day(10), phone: '01055556666' })).json.booking.code, 'BK-N');   // 자정 넘겨 시작하는 예약은 예약 날짜로
  assert.equal((await v({ date: day(12), phone: '01077778888' })).json.code, 'CANCELLED');
  assert.equal((await v({ date: day(13), phone: '01033334444' })).json.code, 'NOT_CONFIRMED');
  // 두 칸으로 만들고, 같은 두 칸으로 다시 확인하면 기존 초대장
  const c = await f.call('create', { method: 'POST', body: { date: day(20), phone: '01012345678', ...CONTENT } });
  assert.equal(c.status, 200); assert.equal((await v({ date: day(20), phone: '01012345678' })).json.existing.manage_url, c.json.manage_url);
});

test('pickBooking: 날짜·연락처만이면 그날 확정 예약 가운데 이른 시작을 고른다', () => {
  const rows = [
    { booking_code: 'A', space_id: 'megaspot-gundae', customer_name: '홍길동', phone: '01012345678', date: '2026-12-01', start_h: 9, end_h: 12, status: 'cancelled' },
    { booking_code: 'B', space_id: 'megaspot-gundae-2', customer_name: '홍길동', phone: '01012345678', date: '2026-12-01', start_h: 13, end_h: 17, status: 'confirmed' },
    { booking_code: 'C', space_id: 'megaspot-gundae', customer_name: '홍길동', phone: '01012345678', date: '2026-12-01', start_h: 18, end_h: 22, status: 'confirmed' },
    { booking_code: 'P', space_id: 'megaspot-gundae', customer_name: '홍길동', phone: '01012345678', date: '2026-11-30', start_h: 25, end_h: 28, status: 'confirmed' }
  ];
  assert.equal(pickBooking(rows, { date: '2026-12-01', time: null, name: '', phone: '01012345678' }).r.booking_code, 'B');
  assert.equal(pickBooking(rows, { date: '2026-11-30', time: null, name: '', phone: '01012345678' }).r.booking_code, 'P');
  assert.equal(pickBooking(rows, { date: '2026-12-01', time: null, name: '', phone: '01000000000' }), null);
  assert.equal(pickBooking(rows, { date: '2026-12-01', time: '18:00', name: '', phone: '01012345678' }).r.booking_code, 'C');   // 시간을 적으면 예전처럼
});

test('pickBooking: 확정 예약을 먼저, 시작 시각이 가까운 예약을 고른다', () => {
  const rows = [
    { booking_code: 'A', space_id: 'megaspot-gundae', customer_name: '홍길동', phone: '01012345678', date: '2026-12-01', start_h: 10, end_h: 20, status: 'cancelled' },
    { booking_code: 'B', space_id: 'megaspot-gundae-2', customer_name: '홍길동', phone: '01012345678', date: '2026-12-01', start_h: 10, end_h: 14, status: 'confirmed' },
    { booking_code: 'C', space_id: 'megaspot-gundae', customer_name: '홍길동', phone: '01012345678', date: '2026-12-01', start_h: 13, end_h: 20, status: 'confirmed' },
    { booking_code: 'D', space_id: 'food-only', customer_name: '홍길동', phone: '01012345678', date: '2026-12-01', start_h: 13, end_h: 20, status: 'confirmed' }
  ];
  assert.equal(pickBooking(rows, { date: '2026-12-01', time: '13:00', name: '홍길동', phone: '01012345678' }).r.booking_code, 'C');
  assert.equal(pickBooking(rows, { date: '2026-12-01', time: '10:00', name: '홍길동', phone: '01012345678' }).r.booking_code, 'B');
  assert.equal(pickBooking(rows, { date: '2026-12-01', time: '21:00', name: '홍길동', phone: '01012345678' }), null);
});

test('카카오톡: 준비 전에는 보내지 않고, 코드가 바뀌면 승인·시험을 다시 해야 한다', async t => {
  const f = fixture(t, ALIGO), calls = mockAligo(t);
  f.booking('BK-A');
  const c = (await f.call('create', { method: 'POST', body: { booking_code: 'BK-A', phone_last4: '5678', ...CONTENT } })).json;
  const id = c.id, k = new URLSearchParams(c.manage_url.split('?')[1]).get('k');
  assert.equal((await f.call('admin/list')).status, 401);
  assert.equal((await f.call('kakao', { method: 'POST', body: { id, k } })).json.code, 'KAKAO_OFF');
  assert.equal((await f.call('admin/send', { method: 'POST', admin: true, body: { booking_code: 'BK-A', receivers: ['01012345678'] } })).json.code, 'KAKAO_OFF');
  assert.equal((await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'save', code: 'UN 1' } })).status, 400);
  await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'save', code: 'UN_7001' } });
  assert.equal((await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'test', receiver: '01022223333' } })).status, 409);   // 승인 확인 전
  assert.equal((await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'confirm' } })).status, 409);
  await readyKakao(f);
  assert.equal(calls.filter(x => x.path === 'alimtalk/send').length, 1);
  const test1 = calls.find(x => x.path === 'alimtalk/send').data;
  assert.equal(test1.receiver_1, '01022223333'); assert.match(test1.message_1, /운영자 시험님/);
  assert.match(JSON.parse(test1.button_1).button[0].linkMo, /\/invite\/#c=sample$/);
  // 코드를 바꾸면 처음부터
  const s = await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'save', code: 'UN_7002' } });
  assert.deepEqual([s.json.approved, s.json.tested, s.json.enabled, s.json.admin_ready], [false, false, false, false]);
});

test('카카오톡: 승인 안 됨·본문 다름·연결 서버 차단을 알려 준다', async t => {
  const f = fixture(t, ALIGO);
  await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'save', code: 'UN_7001' } });
  const g = mockAligo(t, { review: 'REQ' });
  let r = await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'check' } });
  assert.equal(r.json.check.ready, false); assert.match(r.json.check.message, /검수 중/);
  const f2 = fixture(t, ALIGO); mockAligo(t, { content: INVITE_TEMPLATE.content + ' ' });
  await f2.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'save', code: 'UN_7001' } });
  r = await f2.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'check' } });
  assert.match(r.json.check.message, /본문·버튼이 아래 내용과 다릅니다/);
  const f3 = fixture(t, ALIGO); mockAligo(t, { status: 403 });
  await f3.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'save', code: 'UN_7001' } });
  r = await f3.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'check' } });
  assert.match(r.json.check.message, /ALIGO_MEMBER_TEMPLATE_CODES/);
  assert.ok(g.length >= 1);
});

test('관리자 발송: 예약 연락처로만, 2분 안 같은 번호는 건너뛰고, 기록은 번호를 가린다', async t => {
  const f = fixture(t, ALIGO), calls = mockAligo(t);
  f.booking('BK-A', { name: '홍길동' }); f.booking('BK-B', { date: day(30), phone: '01088887777' });
  f.db.prepare("INSERT INTO booking_contacts (booking_code, phone2, updated_at) VALUES ('BK-A', '01099990000', '2026-11-01 10:00:00')").run();
  await readyKakao(f);
  // 관리자가 대신 만들기
  assert.equal((await f.call('admin/send', { method: 'POST', admin: true, body: { booking_code: 'BK-A', receivers: ['01012345678'] } })).json.code, 'NO_INVITE');
  const made = await f.call('admin/create', { method: 'POST', admin: true, body: { booking_code: 'BK-A', data: { title: '송년회', schedule: [{ time: '18:30', text: '저녁' }] } } });
  assert.equal(made.status, 200);
  assert.equal((await f.call('admin/create', { method: 'POST', admin: true, body: { booking_code: 'BK-A', data: { title: '다른 이름' } } })).json.existing, true);
  let list = await f.call('admin/list?has=with', { admin: true });
  assert.deepEqual(list.json.items.map(x => x.booking_code), ['BK-A']); assert.equal(list.json.counts.total, 2);
  assert.equal((await f.call('admin/list?q=8887', { admin: true })).json.items[0].booking_code, 'BK-B');
  // 다른 번호는 막는다
  assert.equal((await f.call('admin/send', { method: 'POST', admin: true, body: { booking_code: 'BK-A', receivers: ['01011112222'] } })).json.code, 'NOT_CONTACT');
  const r = await f.call('admin/send', { method: 'POST', admin: true, body: { booking_code: 'BK-A', receivers: ['010-1234-5678', '01099990000'] } });
  assert.deepEqual(r.json.results.map(x => [x.receiver, x.status]), [['010-****-5678', 'accepted'], ['010-****-0000', 'accepted']]);
  const sent = calls.filter(x => x.path === 'alimtalk/send').slice(-2).map(x => x.data);
  assert.equal(sent[0].tpl_code, 'UN_7001'); assert.equal(sent[0].recvname_1, '홍길동');
  assert.match(sent[0].message_1, /홍길동님, 예약하신 모임의 초대장이 준비되었습니다/); assert.match(sent[0].message_1, /모임 이름: 송년회/);
  assert.match(sent[0].message_1, /이용 시간: 18:00 ~ 22:00/); assert.doesNotMatch(sent[0].message_1, /#\{/);
  const btn = JSON.parse(sent[0].button_1).button;
  assert.match(btn[0].linkMo, /^https:\/\/megaspot\.kr\/invite\/#c=[a-z2-9]{10}$/); assert.match(btn[1].linkMo, /^https:\/\/megaspot\.kr\/invite\/manage\/#id=IV-[^&]+&k=[\w-]{22}$/);
  assert.equal(sent[0].fsubject_1, '메가스팟 모임 초대장'); assert.ok(sent[0].fmessage_1.includes(btn[0].linkMo));
  const again = await f.call('admin/send', { method: 'POST', admin: true, body: { booking_code: 'BK-A', receivers: ['01012345678'] } });
  assert.equal(again.json.results[0].status, 'skipped');
  const rows = f.db.prepare('SELECT receiver_mask, receiver_hash, actor, status FROM invite_messages WHERE invite_id IS NOT NULL').all();
  assert.equal(rows.length, 2); assert.ok(rows.every(x => x.actor === 'admin' && x.status === 'accepted' && !x.receiver_hash.includes('5678')));
  const d = await f.call('admin/detail?booking_code=BK-A', { admin: true });
  assert.deepEqual(d.json.booking.recipients, ['01012345678', '01099990000']); assert.equal(d.json.invite.messages.length, 2);
  assert.equal(d.json.invite.public.title, '송년회');
  list = await f.call('admin/list', { admin: true });
  assert.ok(list.json.items.find(x => x.booking_code === 'BK-A').invite.last_sent);
});

test('고객 직접 받기: 관리자가 켜야 하고, 예약 번호로만 하루 세 번까지', async t => {
  const f = fixture(t, ALIGO), calls = mockAligo(t);
  f.booking('BK-A');
  f.db.prepare("INSERT INTO booking_contacts (booking_code, phone2, updated_at) VALUES ('BK-A', '01099990000', '2026-11-01 10:00:00')").run();
  const c = (await f.call('create', { method: 'POST', body: { booking_code: 'BK-A', phone_last4: '5678', ...CONTENT } })).json;
  const id = c.id, k = new URLSearchParams(c.manage_url.split('?')[1]).get('k');
  await readyKakao(f);
  assert.equal((await f.call('kakao', { method: 'POST', body: { id, k } })).json.code, 'KAKAO_OFF');   // 관리자 준비는 끝났지만 고객 받기는 꺼짐
  const on = await f.call('admin/kakao', { method: 'POST', admin: true, body: { action: 'enable', enabled: true } });
  assert.equal(on.json.customer_ready, true);
  assert.equal((await f.call('verify', { method: 'POST', body: { booking_code: 'BK-A', phone_last4: '5678' } })).json.kakao.ready, true);
  assert.equal((await f.call('kakao', { method: 'POST', body: { id, k: 'x'.repeat(22) } })).status, 403);
  let r = await f.call('kakao', { method: 'POST', body: { id, k } });
  assert.equal(r.json.receiver, '010-****-5678');
  r = await f.call('kakao', { method: 'POST', body: { id, k, phone: '01099990000' } });
  assert.equal(r.json.receiver, '010-****-0000');
  r = await f.call('kakao', { method: 'POST', body: { id, k, phone: '01011112222' } });   // 예약에 없는 번호 → 대표 번호로
  assert.equal(r.json.receiver, '010-****-5678');
  assert.equal((await f.call('kakao', { method: 'POST', body: { id, k } })).status, 429);
  assert.equal(calls.filter(x => x.path === 'alimtalk/send').map(x => x.data.receiver_1).filter(p => p === '01011112222').length, 0);
  assert.deepEqual(f.db.prepare("SELECT actor FROM invite_messages WHERE invite_id = ?").all(id).map(x => x.actor), ['host', 'host', 'host']);
  // 초대장을 지우면 보낸 기록도 지운다
  assert.equal((await f.call('manage', { method: 'POST', body: { id, k, action: 'delete' } })).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invite_messages WHERE invite_id = ?').get(id).n, 0);
});

test('예시 초대장과 보관 기간 정리', async t => {
  const f = fixture(t);
  const s = await f.call('view?c=sample');
  assert.equal(s.status, 200); assert.equal(s.json.invite.sample, true); assert.equal(s.json.invite.rsvp.open, false);
  f.booking('BK-OLD', { date: day(-100), status: 'completed' });
  f.db.prepare("INSERT INTO invites (id, code, booking_code, space_id, event_date, data, status, created_at) VALUES ('IV-OLD', 'oldcode1234', 'BK-OLD', 'megaspot-gundae-2', ?, '{}', 'active', '2026-01-01 00:00:00')").run(day(-100));
  f.db.prepare("INSERT INTO invite_messages (invite_id, booking_code, receiver_mask, receiver_hash, actor, status, created_at) VALUES ('IV-OLD', 'BK-OLD', '010-****-5678', 'h', 'admin', 'accepted', '2026-01-01 00:00:00'), (NULL, NULL, '010-****-3333', 'h2', 'test', 'accepted', '2026-01-01 00:00:00')").run();
  await purge(f.env);   // 기본: 보관
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invites').get().n, 1);
  await purge({ ...f.env, CUSTOMER_DATA_PURGE: 'on' });
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invite_messages').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invites').get().n, 0);
});

test('알림톡 템플릿: 변수는 정해진 것만, 버튼은 megaspot.kr 주소, 채우면 빈칸이 없다', () => {
  const used = [...new Set([...INVITE_TEMPLATE.content.matchAll(/#\{([^}]+)\}/g), ...INVITE_TEMPLATE.buttons.flatMap(b => [...b.linkMo.matchAll(/#\{([^}]+)\}/g)])].map(m => m[1]))];
  assert.deepEqual(used.sort(), [...TEMPLATE_VARS].sort());
  assert.ok(INVITE_TEMPLATE.buttons.every(b => b.linkType === 'WL' && b.linkMo === b.linkPc && b.linkMo.startsWith('https://megaspot.kr/')));
  assert.ok(INVITE_TEMPLATE.content.length < 1000);
  const r = renderInvite(INVITE_TEMPLATE, Object.fromEntries(TEMPLATE_VARS.map(k => [k, 'x'])));
  assert.doesNotMatch(r.message + JSON.stringify(r.buttons), /#\{/);
});

test('PDF: A5 쪽마다 JPEG 1장 · 링크 · 제목, xref 위치가 맞다', () => {
  const require = createRequire(import.meta.url);
  require('../assets/js/kit/invite-pdf.js');
  const { buildPdf } = globalThis.KitInvitePrint;
  const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 0xFF, 0xD9]);
  const pdf = buildPdf([{ bytes: jpeg, w: 1240, h: 1759, links: [] }, { bytes: jpeg, w: 1240, h: 1759, links: [{ x: 100, y: 1200, w: 240, h: 240, url: 'https://megaspot.kr/invite/?c=abc(1)' }] }], '송년의 밤 초대장');
  const text = Buffer.from(pdf).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4') && text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Type \/Pages \/Kids \[\d+ 0 R \d+ 0 R\] \/Count 2/);
  assert.equal((text.match(/\/Subtype \/Image/g) || []).length, 2);
  assert.match(text, /\/MediaBox \[0 0 419\.53 595\.1\d?\]/);
  assert.ok(text.includes('/URI (https://megaspot.kr/invite/?c=abc\\(1\\))'));
  assert.match(text, /\/Title <FEFF[0-9A-F]+>/);
  const xref = text.slice(text.lastIndexOf('xref')).split('\n'), count = +xref[1].split(' ')[1];
  for (let i = 1; i < count; i++) { const off = +xref[2 + i].slice(0, 10); assert.ok(text.startsWith(i + ' 0 obj', off), '객체 ' + i + ' 위치'); }
  assert.equal(+text.slice(text.lastIndexOf('startxref') + 10).trim().split('\n')[0], text.lastIndexOf('xref\n0 '));
});

test('화면 연결: 만들기·관리 화면에 PDF 도구, 관리자 메뉴·스크립트, 개인정보처리방침 항목', () => {
  for (const p of ['invite/new/index.html', 'invite/manage/index.html']) assert.match(read(p), /\/assets\/js\/kit\/invite-pdf\.js\?v=/);
  const admin = read('admin/index.html');
  assert.ok(admin.includes('/assets/js/pages/admin-invites.js?v=') && admin.includes('/assets/js/kit/invite-pdf.js?v=') && admin.includes('/assets/css/admin-invites.css?v='));
  assert.match(read('assets/js/pages/admin-navigation.js'), /\['invites','모임 초대장'\]/);
  assert.match(read('privacy/index.html'), /id="invite-kakao"/);
  assert.match(read('terms/index.html'), /이용 날짜·예약자 연락처 또는 예약번호/);
  const js = read('assets/js/kit/invite-new.js');
  assert.ok(js.includes("K.api('kakao'") && js.includes('data-mode="info"'));
});
