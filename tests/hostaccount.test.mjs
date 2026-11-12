// 회원 계정 → 호스트 전환 · 무료 등록 종료 30일·7일 전 안내 · 호스트 알림톡(템플릿 승인 확인 후) (2026-11-12)
//   node --test tests/hostaccount.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { onRequest as authApi } from '../functions/api/auth/[[path]].js';
import { onRequest as hostsApi } from '../functions/api/hosts/[[path]].js';
import { onRequest as hqApi } from '../functions/api/hq/[[path]].js';
import { onRequest as venuesApi } from '../functions/api/venues/[[path]].js';
import { hostRenewalTick, hostRenewalDue } from '../functions/api/_hostrenewal.js';
import { HOST_TEMPLATES, HOST_BUTTONS, hostNoticeFromSms, hostNoticeText } from '../functions/api/_hostnotify.js';
import { kstToday } from '../functions/api/_lib.js';
import { relayRequest, relayLedger } from '../deploy/aligo-relay/server.mjs';

const ORIGIN = 'https://megaspot.test', RELAY = 'https://relay.naranhistory.com/megaspot/aligo', SECRET = 'test-relay-secret-at-least-32-characters';
const day = n => kstToday(n);
const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const SPACE = { name: '성수 그랜드홀', region: 'seoul', address: '서울 성동구 성수이로 100', capacity: 180, area: 120, types: ['conference', 'banquet'] };
const FULL = { ...SPACE, summary: '성수역 3분 단독 홀', intro: '성수역에서 걸어서 3분, 층고 5m의 단독 홀입니다. 컨퍼런스와 연회 모두 가능합니다.', price: { modes: ['hourly'], hourly: { weekday: 150000, weekend: 200000, min_hours: 3 } } };
const MEMBER = { email: 'kim@example.com', password: 'member-pass-1234', name: '김회원', phone: '010-4444-2222', agree_terms: true, agree_privacy: true, agree_age: true };
// 한국 시간 기준 오늘의 특정 시각(ms)
const kstAt = h => Date.parse(kstToday() + 'T' + String(h).padStart(2, '0') + ':00:00+09:00');

function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return { meta: { changes: Number(st.run(...a).changes) } }; }, exec() { return { meta: { changes: Number(st.run(...a).changes) } }; } }; },
    async batch(list) { db.exec('BEGIN'); try { const r = list.map(s => s.exec()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
  const env = { ADMIN_KEY: 'test-only', DB };
  let ip = 1;
  // 사람마다 쿠키 상자 하나 (회원 ms_session · 호스트 ms_host)
  const person = () => { const jar = {};
    const call = async (api, base, path, method = 'GET', body) => {
      const cookie = Object.entries(jar).filter(([, v]) => v).map(([k, v]) => k + '=' + v).join('; ');
      const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + base + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.7.0.' + (ip++ % 250), ...(cookie ? { cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
      for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const [kv] = c.split(';'), [k, v] = kv.split('='); if (['ms_session', 'ms_host'].includes(k)) jar[k] = v; }
      return { status: res.status, json: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
    };
    return { jar, auth: (p, m, b) => call(authApi, '/api/auth/', p, m, b), host: (p, m, b) => call(hostsApi, '/api/hosts/', p, m, b) };
  };
  const hq = async (path, method = 'GET', body) => { const res = await hqApi({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/hq/' + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-admin-key': 'test-only' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }); return { status: res.status, json: await res.json() }; };
  const venues = async (path, method = 'GET', body) => { const res = await venuesApi({ env, params: { path: path.split('/') }, request: new Request(ORIGIN + '/api/venues/' + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.8.0.' + (ip++ % 250) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }); return { status: res.status, json: await res.json() }; };
  // 회원 가입 → 호스트 등록 → 정보·사진 → 심사 요청 → 본사 승인
  const liveHost = async (p, email = MEMBER.email) => {
    await p.auth('signup', 'POST', { ...MEMBER, email });
    let r = await p.host('signup', 'POST', { member: true, phone: MEMBER.phone, agree_terms: true, agree_privacy: true, space: SPACE }); assert.equal(r.status, 200, JSON.stringify(r.json));
    const ref = r.json.space; await p.host('spaces/' + ref, 'PUT', FULL);
    for (let i = 0; i < 3; i++) await p.host('spaces/' + ref + '/photos', 'POST', { body: 'data:image/jpeg;base64,' + JPEG, thumb: JPEG, w: 1600, h: 900 });
    await p.host('spaces/' + ref + '/submit', 'POST'); r = await hq('spaces/' + ref, 'PATCH', { action: 'approve' }); assert.equal(r.json.item.status, 'live');
    return ref;
  };
  return { db, env, person, hq, venues, liveHost, notices: () => db.prepare('SELECT * FROM host_notifications ORDER BY id').all() };
}
function relayMock(t, f, { codes = '', templates = {} } = {}) {
  Object.assign(f.env, { ALIGO_LIVE_ENABLED: 'true', ALIGO_RELAY_URL: RELAY, ALIGO_RELAY_SECRET: SECRET, ALIGO_SENDER_KEY: 'p' });
  const ledger = relayLedger(new DatabaseSync(':memory:')), renv = { ALIGO_RELAY_SECRET: SECRET, ALIGO_API_KEY: 'k', ALIGO_USERID: 'u', ALIGO_SENDER_KEY: 'p', ALIGO_SENDER: '01012345678', ALIGO_HOST_TEMPLATE_CODES: codes };
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    if (url !== RELAY) throw new Error('unexpected fetch ' + url);
    return relayRequest(new Request('https://relay.local/v1/aligo', { method: 'POST', headers: opts.headers, body: opts.body }), renv, ledger, async (u, o) => {
      const body = new URLSearchParams(o.body); sent.push({ url: u, body });
      if (u.endsWith('/template/list/')) { const c = body.get('tpl_code'), tp = templates[c]; return Response.json({ code: 0, list: tp ? [{ templtCode: c, senderKey: 'p', templtContent: tp.content, inspStatus: tp.insp || 'APR', status: 'R', buttons: tp.buttons || HOST_BUTTONS }] : [] }); }
      if (u.endsWith('/alimtalk/send/')) return Response.json({ code: 0, info: { mid: String(7000 + sent.length), scnt: 1, fcnt: 0 } });
      return Response.json({ result_code: 1, msg_id: String(9000 + sent.length), success_cnt: 1, error_cnt: 0 });
    });
  });
  return sent;
}

test('회원가입 → 고객 화면 → 호스트 전환: 등록 전에는 안내로, 등록하면 같은 계정으로 호스트센터', async () => {
  const f = fixture(), p = f.person();
  assert.deepEqual((await p.host('status')).json, { ok: true, member: false, member_name: '', host: false, host_active: false, host_in: false });
  assert.equal((await p.host('switch', 'POST', {})).json.code, 'LOGIN_REQUIRED');
  assert.equal((await p.auth('signup', 'POST', MEMBER)).status, 200);
  let r = await p.host('status'); assert.equal(r.json.member, true); assert.equal(r.json.host, false);
  r = await p.host('switch', 'POST', {}); assert.equal(r.status, 404); assert.equal(r.json.code, 'NOT_HOST'); assert.equal(r.json.member.email, 'kim@example.com');
  assert.equal((await p.host('me')).json.code, 'HOST_LOGIN', '아직 호스트센터에 들어갈 수 없음');
  // 회원 계정으로 호스트 등록 (이메일·비밀번호 없이)
  assert.equal((await p.host('signup', 'POST', { member: true, space: SPACE, agree_terms: true })).status, 400, '동의 필요');
  r = await p.host('signup', 'POST', { member: true, name: '김호스트', phone: '010-4444-2222', company: '성수홀', agree_terms: true, agree_privacy: true, space: SPACE });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.host.member, true); assert.match(r.json.space, /^SP-/);
  r = await p.host('me'); assert.equal(r.json.host.email, 'kim@example.com'); assert.equal(r.json.host.member, true); assert.equal(r.json.host.member_email, 'kim@example.com'); assert.equal(r.json.spaces.length, 1);
  assert.equal((await p.host('signup', 'POST', { member: true, phone: '010-4444-2222', agree_terms: true, agree_privacy: true, space: SPACE })).json.code, 'ALREADY_HOST');
  assert.equal((await p.host('password', 'POST', { current: 'x', next: 'new-pass-1234' })).json.code, 'MEMBER_ACCOUNT', '비밀번호는 마이페이지에서');
  // 호스트 비밀번호로는 로그인할 수 없고, 회원 로그인 → 전환으로 들어갑니다
  const other = f.person(); assert.equal((await other.host('login', 'POST', { email: MEMBER.email, password: MEMBER.password })).status, 401);
  await other.auth('login', 'POST', { email: MEMBER.email, password: MEMBER.password });
  r = await other.host('switch', 'POST', {}); assert.equal(r.status, 200); assert.equal(r.json.host.member, true); assert.equal((await other.host('me')).json.spaces.length, 1);
  assert.equal((await other.host('status')).json.host_in, true);
  // 회원 로그아웃하면 호스트센터도 함께 로그아웃
  await other.auth('logout', 'POST', {}); assert.equal((await other.host('me')).json.code, 'HOST_LOGIN'); assert.equal((await other.host('switch', 'POST', {})).json.code, 'LOGIN_REQUIRED');
  // 호스트로 등록한 회원은 바로 탈퇴하지 않음
  assert.equal((await p.auth('withdraw', 'POST', { password: MEMBER.password })).json.code, 'HOST_LINKED');
  // 차단된 호스트는 전환 불가
  f.db.prepare("UPDATE hosts SET status = 'blocked'").run(); assert.equal((await p.host('switch', 'POST', {})).json.code, 'BLOCKED');
});

test('예전 호스트 전용 계정: 회원으로 로그인한 상태에서 호스트 비밀번호로 로그인하면 연결, 같은 이메일로 새 등록은 막음', async () => {
  const f = fixture(), old = f.person();
  assert.equal((await old.host('signup', 'POST', { email: 'old@example.com', password: 'old-host-pass', name: '박호스트', phone: '010-3333-1111', agree_terms: true, agree_privacy: true, space: SPACE })).status, 200);
  const p = f.person(); await p.auth('signup', 'POST', { ...MEMBER, email: 'old@example.com' });
  assert.equal((await p.host('signup', 'POST', { member: true, phone: '010-3333-1111', agree_terms: true, agree_privacy: true, space: SPACE })).json.code, 'HOST_EMAIL_TAKEN');
  let r = await p.host('login', 'POST', { email: 'old@example.com', password: 'old-host-pass' }); assert.equal(r.status, 200); assert.equal(r.json.host.member, true, '연결됨');
  const again = f.person(); await again.auth('login', 'POST', { email: 'old@example.com', password: MEMBER.password });
  r = await again.host('switch', 'POST', {}); assert.equal(r.status, 200); assert.equal((await again.host('me')).json.spaces.length, 1);
  // 다른 회원이 같은 호스트 비밀번호를 알아도 이미 연결된 호스트는 다시 연결되지 않음
  const third = f.person(); await third.auth('signup', 'POST', { ...MEMBER, email: 'third@example.com' });
  r = await third.host('login', 'POST', { email: 'old@example.com', password: 'old-host-pass' }); assert.equal(r.status, 200);
  assert.equal((await third.host('switch', 'POST', {})).json.code, 'NOT_HOST');
});

test('무료 등록 종료 30일 전·7일 전 안내: 단계별로 한 번씩, 결제했으면 보내지 않음, 10~20시에만', async t => {
  const f = fixture(), sent = relayMock(t, f), p = f.person(), ref = await f.liveHost(p);
  const setFree = n => f.db.prepare('UPDATE host_spaces SET free_until = ? WHERE ref = ?').run(day(n), ref);
  sent.length = 0;
  setFree(45); assert.equal((await hostRenewalDue(f.env)).length, 0, '30일보다 많이 남으면 대상 아님');
  setFree(30);
  assert.equal((await hostRenewalTick(f.env, { at: kstAt(8) })).skipped, 'hours', '이른 아침에는 보내지 않음');
  f.db.prepare("DELETE FROM settings WHERE key = 'host_renewal_tick'").run();
  let r = await hostRenewalTick(f.env, { at: kstAt(11) }); assert.equal(r.sent, 1);
  const n1 = f.notices().pop(); assert.equal(n1.kind, 'renewal'); assert.equal(n1.status, 'accepted');
  assert.match(n1.msg, /‘성수 그랜드홀’ 무료 등록 기간이 \d{4}년 \d+월 \d+일\(.\)에 끝납니다\. \(30일 남음\)/); assert.ok(n1.msg.endsWith('/host/center/#billing'));
  assert.equal(sent.at(-1).body.get('receiver'), '01044442222');
  assert.equal((await hostRenewalTick(f.env, { at: kstAt(11) + 60e3 })).skipped, 'recent', '15분에 한 번만 확인');
  assert.equal((await hostRenewalTick(f.env, { at: kstAt(12) })).sent, 0, '같은 단계는 다시 보내지 않음');
  setFree(7); r = await hostRenewalTick(f.env, { at: kstAt(13) }); assert.equal(r.sent, 1);
  assert.match(f.notices().pop().msg, /\(7일 남음\)\n기간이 끝나면 공간이 검색과 상세 화면에서 내려가/);
  assert.equal((await hostRenewalTick(f.env, { at: kstAt(14) })).sent, 0);
  // 운영팀이 무료 기간을 바꾸면 새 종료일 기준으로 다시 안내 · 이미 결제해 이어지는 기간이 있으면 보내지 않음
  setFree(20); assert.equal((await hostRenewalTick(f.env, { at: kstAt(15) })).sent, 1);
  f.db.prepare('UPDATE host_spaces SET free_until = ?, paid_until = ? WHERE ref = ?').run(day(6), day(200), ref);
  assert.equal((await hostRenewalDue(f.env)).length, 0); assert.equal((await hostRenewalTick(f.env, { at: kstAt(16) })).sent, 0);
  // 관리자 화면: 대상 목록 · 지금 확인
  f.db.prepare('UPDATE host_spaces SET free_until = ?, paid_until = NULL WHERE ref = ?').run(day(25), ref);
  r = await f.hq('notices'); assert.equal(r.json.renewal_due.length, 1); assert.equal(r.json.renewal_due[0].stage, 'd30');
  r = await f.hq('notices/renewal-run', 'POST', {}); assert.equal(r.json.sent, 1);
});

test('알림톡: 코드 저장 → 승인 확인(본문·버튼 일치) 통과한 종류만 알림톡, 나머지는 문자 · 연결 서버가 코드를 막으면 문자로', async t => {
  const f = fixture(), templates = { UN_9001: { content: HOST_TEMPLATES.inquiry.content }, UN_9002: { content: HOST_TEMPLATES.accepted.content + ' (다름)' } };
  const sent = relayMock(t, f, { codes: 'UN_9001,UN_9002', templates }), p = f.person(), ref = await f.liveHost(p);
  assert.equal((await f.hq('notices/templates', 'PUT', { codes: { inquiry: 'UN 9001' } })).status, 400);
  let r = await f.hq('notices/templates', 'PUT', { codes: { inquiry: 'UN_9001', accepted: 'UN_9002', renew_d30: 'UN_9003' } }); assert.equal(r.status, 200);
  r = await f.hq('notices/templates/check', 'POST', {});
  const by = Object.fromEntries(r.json.items.map(x => [x.key, x]));
  assert.equal(by.inquiry.ready, true); assert.equal(by.accepted.ready, false); assert.equal(by.accepted.matches, false); assert.equal(by.renew_d30.ready, false, '연결 서버에 없는 코드');
  sent.length = 0;
  r = await f.venues('request', 'POST', { ref, name: '박고객', phone: '010-7777-2222', date: day(20), start: '14:00', end: '18:00', people: 80, select: { mode: 'hourly' }, agree_privacy: true, agree_share: true });
  const at = sent.find(x => x.url.endsWith('/alimtalk/send/')); assert.ok(at, '새 문의는 알림톡으로');
  assert.equal(at.body.get('tpl_code'), 'UN_9001'); assert.equal(at.body.get('failover'), 'Y', '받지 못하면 문자로 대신');
  assert.ok(at.body.get('message_1').startsWith('[메가스팟 호스트 알림]\n‘성수 그랜드홀’ 공간에 새 문의가 들어왔습니다.')); assert.equal(at.body.get('message_1').includes('https://'), false, '알림톡 본문에는 주소 없이 버튼으로');
  assert.deepEqual(JSON.parse(at.body.get('button_1')).button, HOST_BUTTONS); assert.ok(at.body.get('fmessage_1').endsWith('/host/center/#b=' + r.json.code));
  assert.match(f.notices().pop().provider_mid, /^at:UN_9001:\d+$/);
  // 승인 확인을 통과하지 못한 종류(견적 수락)는 문자로
  await p.host('bookings/' + r.json.code, 'PATCH', { action: 'quote', lines: [{ label: '공간 이용료', amount: 600000 }] }); sent.length = 0;
  await f.venues('booking', 'POST', { code: r.json.code, k: r.json.k, action: 'accept' });
  assert.equal(sent.length, 1); assert.equal(sent[0].url, 'https://apis.aligo.in/send/'); assert.match(sent[0].body.get('msg'), /견적을 수락했습니다/);
  // 승인 뒤 본문이 바뀌면(코드 수정 배포) 다시 확인할 때까지 문자로
  f.db.prepare("UPDATE settings SET value = 'old' WHERE key = 'host_alimtalk_ready:inquiry'").run(); sent.length = 0;
  await f.venues('request', 'POST', { ref, name: '최고객', phone: '010-7777-3333', date: day(21), select: { mode: 'hourly' }, agree_privacy: true, agree_share: true });
  assert.equal(sent[0].url, 'https://apis.aligo.in/send/');
  // 관리자 목록에 보낸 길 표시
  r = await f.hq('notices'); assert.ok(r.json.items.some(x => x.channel === '알림톡')); assert.ok(r.json.items.some(x => x.channel === '문자'));
  assert.equal(r.json.templates.length, Object.keys(HOST_TEMPLATES).length);
});

test('발송 길이 막혀 있던 알림은 48시간 안에 길이 열리면 한 번 더 보냄 (아무것도 나가지 않은 건만)', async t => {
  const f = fixture(), p = f.person(); await f.liveHost(p);
  let n = f.notices(); assert.equal(n.at(-1).status, 'held', '발송 설정이 꺼져 있으면 기록만');
  const sent = relayMock(t, f);
  f.db.prepare("UPDATE host_notifications SET status = 'unknown' WHERE id = 1").run();   // 응답 불명은 다시 보내지 않음
  const r = await hostRenewalTick(f.env, { at: kstAt(11), force: true }); assert.equal(r.retried, n.length - 1);
  n = f.notices(); assert.equal(n[0].status, 'unknown'); assert.ok(n.slice(1).every(x => x.status === 'accepted'));
  assert.equal(sent.filter(x => x.url === 'https://apis.aligo.in/send/').length, n.length - 1);
  assert.equal((await hostRenewalTick(f.env, { at: kstAt(12), force: true })).retried, 0, '한 번만');
});

test('저장된 문자 본문에서 템플릿을 되찾고, 연결 서버는 허용한 호스트 템플릿 코드만 알림톡으로 보냄', async t => {
  for (const [kind, v] of [['inquiry', { space: '홀', code: 'HB-2611-ABCD', date: day(3), people: 60 }], ['renewal', { stage: 'd7', space: '홀', ref: 'SP-2611-ABCD', end: day(7), left: 7 }], ['review', { result: 'live', space: '홀', ref: 'SP-2611-ABCD', until: day(60) }]]) {
    const sms = hostNoticeText(kind, v), back = hostNoticeFromSms(sms); assert.ok(back, kind); assert.equal(back.content + '\n' + sms.split('\n').pop(), sms);
  }
  assert.equal(hostNoticeFromSms('[메가스팟 호스트 알림]\n다른 글\nhttps://megaspot.kr/host/center/'), null);
  const ledger = relayLedger(new DatabaseSync(':memory:')), calls = [];
  const env = { ALIGO_RELAY_SECRET: SECRET, ALIGO_API_KEY: 'k', ALIGO_USERID: 'u', ALIGO_SENDER_KEY: 'p', ALIGO_SENDER: '01012345678', ALIGO_HOST_TEMPLATE_CODES: 'UN_9001, bad code' };
  const send = data => { const raw = JSON.stringify({ path: 'alimtalk/send', data, request_id: randomUUID(), time: Date.now() });
    return relayRequest(new Request('https://relay.local/v1/aligo', { method: 'POST', headers: { 'X-Megaspot-Signature': createHmac('sha256', SECRET).update(raw).digest('hex') }, body: raw }), env, ledger, async (u, o) => { calls.push(new URLSearchParams(o.body)); return Response.json({ code: 0, info: { mid: '1', scnt: 1, fcnt: 0 } }); }); };
  const base = { receiver_1: '01011112222', subject_1: '메가스팟 호스트 알림', message_1: '[메가스팟 호스트 알림]\n안내', fsubject_1: '메가스팟 호스트 알림', fmessage_1: '[메가스팟 호스트 알림]\n안내\nhttps://megaspot.kr/host/center/' };
  assert.equal((await send({ ...base, tpl_code: 'UN_9999' })).status, 403);
  assert.equal((await send({ ...base, tpl_code: 'UN_9001' })).status, 200); assert.equal(calls[0].get('failover'), 'Y'); assert.equal(calls[0].get('senderkey'), 'p');
});
