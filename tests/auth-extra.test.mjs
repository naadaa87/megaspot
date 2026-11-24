// 카카오 간편 로그인 · 비밀번호 재설정 메일 · 예약 직접 연결 (2026-11-25)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, DAY } from './helpers/admin-fixture.mjs';
import { onRequest as auth } from '../functions/api/auth/[[path]].js';
import { onRequest as myBooking } from '../functions/api/my-booking/[[path]].js';
import { hashPassword } from '../functions/api/_lib.js';

function setup(t, env = {}) {
  const f = fixture({ booking: true }); t.after(() => f.db.close());
  Object.assign(f.env, { CONFIRM_SECRET: 'test-confirm-secret-0123456789abcdef' }, env);
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const u = String(url);
    if (u === 'https://api.resend.com/emails') { sent.push(JSON.parse(opts.body)); return Response.json({ id: 'mail-1' }); }
    if (u === 'https://kauth.kakao.com/oauth/token') return Response.json({ access_token: 'kakao-access' });
    if (u === 'https://kapi.kakao.com/v2/user/me') return Response.json(f.kakaoUser);
    throw Error('외부 호출 금지: ' + u);
  });
  f.kakaoUser = { id: 9001, kakao_account: { email: 'new@kakao.test', is_email_valid: true, is_email_verified: true, profile: { nickname: '카카오 고객' } } };
  let jar = {};
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const headers = { origin: 'https://local.test', 'cf-connecting-ip': '10.2.0.' + Math.floor(Math.random() * 250) };
    if (body) headers['content-type'] = 'application/json';
    const c = cookie !== undefined ? cookie : Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (c) headers.cookie = c;
    const r = await auth({ request: new Request('https://local.test/api/auth/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env: f.env, params: { path: path.split('?')[0].split('/') } });
    for (const sc of r.headers.getSetCookie ? r.headers.getSetCookie() : []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    let j = null; try { j = await r.clone().json(); } catch {}
    return { status: r.status, json: j, location: r.headers.get('location'), headers: r.headers };
  };
  return { ...f, call, sent, jar: () => jar, clearJar: () => { jar = {}; }, setKakao: u => { f.kakaoUser = u; } };
}

test('켜지지 않은 기능은 꺼진 것으로 알려 주고 카카오 시작은 로그인 화면으로 돌려보낸다', async t => {
  const f = setup(t);
  assert.deepEqual((await f.call('providers')).json, { ok: true, kakao: false, reset_email: false });
  assert.equal((await f.call('kakao/start')).location, '/login/?kakao=off');
  assert.equal((await f.call('reset-request', { method: 'POST', body: { email: 'a@test.kr' } })).json.code, 'MAIL_OFF');
});

test('비밀번호 재설정: 가입 여부와 관계없이 같은 답, 링크는 한 번만, 바꾸면 로그인', async t => {
  const f = setup(t, { RESEND_API_KEY: 're_test', MAIL_FROM: '메가스팟 <no-reply@megaspot.kr>' });
  f.db.prepare("INSERT INTO members (email,name,phone,pw_hash,agreed_at,status,created_at) VALUES ('me@test.kr','회원','01011112222',?, 'now','active','now')").run(await hashPassword('oldpass123'));
  const none = await f.call('reset-request', { method: 'POST', body: { email: 'nobody@test.kr' } });
  const mine = await f.call('reset-request', { method: 'POST', body: { email: 'me@test.kr' } });
  assert.equal(none.json.message, mine.json.message);
  assert.equal(f.sent.length, 1);
  const token = /#t=([A-Za-z0-9_-]+)/.exec(f.sent[0].text)[1];
  assert.equal((await f.call('reset', { method: 'POST', body: { token, password: 'short' } })).status, 400);
  const ok = await f.call('reset', { method: 'POST', body: { token, password: 'newpass456' } });
  assert.equal(ok.status, 200); assert.ok(f.jar().ms_session);
  assert.equal((await f.call('reset', { method: 'POST', body: { token, password: 'again789x' } })).json.code, 'BAD_TOKEN');
  f.clearJar();
  assert.equal((await f.call('login', { method: 'POST', body: { email: 'me@test.kr', password: 'newpass456' } })).status, 200);
});

test('카카오로 처음 오면 가입 마무리 후 연결되고, 다음부터는 바로 로그인한다', async t => {
  const f = setup(t, { KAKAO_REST_API_KEY: 'kakao-rest-key' });
  const start = await f.call('kakao/start?next=/my-booking/');
  assert.match(start.location, /^https:\/\/kauth\.kakao\.com\/oauth\/authorize\?client_id=kakao-rest-key/);
  const state = new URL(start.location).searchParams.get('state');
  assert.equal((await f.call('kakao/callback?code=c1&state=wrong')).location, '/login/?kakao=fail');
  const start2 = await f.call('kakao/start?next=/my-booking/'), state2 = new URL(start2.location).searchParams.get('state');
  const cb = await f.call('kakao/callback?code=c1&state=' + state2);
  assert.match(cb.location, /^\/signup\/\?kakao=1#k=/);
  const k = cb.location.split('#k=')[1];
  assert.deepEqual((await f.call('kakao/pending?k=' + k)).json, { ok: true, email: 'new@kakao.test', name: '카카오 고객' });
  assert.equal((await f.call('kakao/complete', { method: 'POST', body: { token: k, email: 'new@kakao.test', name: '카카오 고객', phone: '010-3333-4444' } })).status, 400, '약관 동의 필요');
  const done = await f.call('kakao/complete', { method: 'POST', body: { token: k, email: 'new@kakao.test', name: '카카오 고객', phone: '010-3333-4444', agree_terms: true, agree_privacy: true, agree_age: true } });
  assert.equal(done.status, 200); assert.equal(done.json.next, '/my-booking/');
  const m = f.db.prepare("SELECT id, pw_hash FROM members WHERE email = 'new@kakao.test'").get();
  assert.equal(m.pw_hash, 'social$kakao');
  assert.equal(f.db.prepare("SELECT member_id FROM member_social WHERE provider='kakao' AND sub='9001'").get().member_id, m.id);
  // 두 번째: 바로 로그인
  f.clearJar();
  const s3 = await f.call('kakao/start'), st3 = new URL(s3.location).searchParams.get('state');
  const again = await f.call('kakao/callback?code=c2&state=' + st3);
  assert.equal(again.location, '/mypage/'); assert.ok(f.jar().ms_session);
  assert.equal((await f.call('social')).json.password_set, false);
  // 카카오로만 가입한 회원은 '탈퇴' 입력으로 탈퇴
  assert.equal((await f.call('withdraw', { method: 'POST', body: { password: '아니요' } })).status, 401);
  assert.equal((await f.call('withdraw', { method: 'POST', body: { password: '탈퇴' } })).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM member_social').get().n, 0);
});

test('카카오 확인 이메일이 기존 회원과 같으면 그 계정에 연결해 로그인한다', async t => {
  const f = setup(t, { KAKAO_REST_API_KEY: 'kakao-rest-key' });
  f.db.prepare("INSERT INTO members (email,name,phone,pw_hash,agreed_at,status,created_at) VALUES ('new@kakao.test','기존 회원','01011112222','x','now','active','now')").run();
  const s = await f.call('kakao/start'), st = new URL(s.location).searchParams.get('state');
  assert.equal((await f.call('kakao/callback?code=c&state=' + st)).location, '/mypage/');
  f.setKakao({ id: 9002, kakao_account: { email: 'new@kakao.test', is_email_valid: true, is_email_verified: false } });
  f.clearJar();
  const s2 = await f.call('kakao/start'), st2 = new URL(s2.location).searchParams.get('state');
  assert.match((await f.call('kakao/callback?code=c&state=' + st2)).location, /^\/signup\//, '확인되지 않은 이메일은 자동 연결하지 않음');
});

test('회원이 이용일과 휴대폰 뒷자리로 예약을 연결하면 나의 예약확인 회원 목록에 나온다 (예약 자료는 그대로)', async t => {
  const f = setup(t);
  f.db.prepare("INSERT INTO members (email,name,phone,pw_hash,agreed_at,status,created_at) VALUES ('me@test.kr','회원','01011112222',?, 'now','active','now')").run(await hashPassword('pass12345'));
  await f.call('login', { method: 'POST', body: { email: 'me@test.kr', password: 'pass12345' } });
  const before = JSON.stringify(f.db.prepare('SELECT * FROM bookings').all()) + JSON.stringify(f.db.prepare('SELECT * FROM inquiries').all());
  assert.equal((await f.call('link-booking', { method: 'POST', body: { date: DAY, phone_last4: '0000' } })).status, 404);
  const r = await f.call('link-booking', { method: 'POST', body: { date: DAY, phone_last4: '5678' } });
  assert.equal(r.json.linked, 1);
  const cookie = Object.entries(f.jar()).map(([k, v]) => k + '=' + v).join('; ');
  const mine = await myBooking({ request: new Request('https://local.test/api/my-booking/mine', { headers: { cookie } }), env: f.env, params: { path: ['mine'] } });
  assert.deepEqual((await mine.json()).items.map(x => x.code), ['BK-TEST']);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM bookings').all()) + JSON.stringify(f.db.prepare('SELECT * FROM inquiries').all()), before);
  f.clearJar();
  assert.equal((await f.call('link-booking', { method: 'POST', body: { date: DAY, phone_last4: '5678' } })).status, 401);
});
