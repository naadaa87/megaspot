// 관리자 '회원 관리' 점검 (2026-11-14)
//  · 목록 조건·요약·정렬·쪽 · 상세(문의·예약·호스트·동의 기록) · 메모 · 엑셀(CSV)
//  · 보내기: 정보성/광고성 대상 고르기, 광고 문구·수신거부 링크·야간 제한, 문자·알림톡·이메일 보내기와 결과, 보내기 직전 동의 재확인
//  · 수신거부 링크 · 연결 서버(member/send) 규칙
//   node --test tests/member-crm.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { onRequest as crmApi } from '../functions/api/crm/[[path]].js';
import { onRequestPost as unsubPost } from '../functions/api/unsubscribe.js';
import { unsubUrl, MEMBER_TEMPLATE, smsBytes } from '../functions/api/_membercrm.js';
import { relayRequest, relayLedger } from '../deploy/aligo-relay/server.mjs';

const ORIGIN = 'https://megaspot.test', RELAY = 'https://relay.naranhistory.com/megaspot/aligo';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const NOON = Date.parse('2026-11-14T03:00:00Z'), NIGHT = Date.parse('2026-11-14T13:30:00Z');   // 한국 12시 · 22시 30분
function fixture(t, { relay = 'ok', email = true } = {}) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const env = { ADMIN_KEY: 'test-only', CONFIRM_SECRET: 'confirm-secret-for-tests-0123456789', ALIGO_LIVE_ENABLED: 'true', ALIGO_RELAY_URL: RELAY, ALIGO_RELAY_SECRET: 'relay-secret-at-least-32-characters-long', ALIGO_SENDER_KEY: 'k',
    ...(email ? { RESEND_API_KEY: 're_test', MAIL_FROM: '메가스팟 <hello@megaspot.kr>' } : {}),
    DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  const sent = [], orig = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url) === RELAY) {
      const v = JSON.parse(opts.body); sent.push({ kind: 'relay', path: v.path, data: v.data });
      if (v.path === 'member/status') return relay === 'old' ? new Response('{"error":"Unsupported operation"}', { status: 400 }) : Response.json({ ready: true });
      if (v.path === 'member/send') return Response.json({ result_code: 1, msg_id: String(1000 + sent.length), success_cnt: 1, error_cnt: 0 });
      if (v.path === 'template/list') return Response.json({ code: 0, list: [{ templtCode: v.data.tpl_code, templtContent: MEMBER_TEMPLATE.content, inspStatus: 'APR', status: 'R', buttons: MEMBER_TEMPLATE.buttons }] });
      if (v.path === 'alimtalk/send') return Response.json({ code: 0, info: { mid: String(2000 + sent.length), scnt: 1, fcnt: 0 } });
    }
    if (String(url) === 'https://api.resend.com/emails') { const b = JSON.parse(opts.body); sent.push({ kind: 'email', ...b }); return Response.json({ id: 'em_' + sent.length }); }
    throw new Error('unexpected fetch ' + url);
  };
  t.after(() => { globalThis.fetch = orig; });
  const api = async (path, method = 'GET', body) => {
    const res = await crmApi({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/crm/' + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-admin-key': 'test-only' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    const ct = res.headers.get('content-type') || ''; return { status: res.status, json: ct.includes('json') ? await res.json() : null, text: ct.includes('json') ? '' : await res.text(), res };
  };
  const member = (id, o = {}) => db.prepare('INSERT INTO members (id, email, name, phone, org, pw_hash, agree_marketing, agreed_at, status, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, o.email ?? `m${id}@example.com`, o.name ?? `회원${id}`, o.phone ?? `010-1000-${String(1000 + id)}`, o.org ?? null, 'x', o.mkt ? 1 : 0, '2026-01-01 00:00:00', o.status ?? 'active', o.created ?? '2026-11-01 01:00:00', o.login ?? null);
  return { db, env, api, member, sent };
}
function seed(f) {
  f.member(1, { name: '김단골', mkt: 1, org: '성수회사', login: '2026-11-13 01:00:00', created: '2026-10-01 01:00:00' });
  f.member(2, { name: '이광고거부', mkt: 0 });
  f.member(3, { name: '박제한', mkt: 1, status: 'suspended' });
  f.member(4, { name: '최번호없음', mkt: 1, phone: '' });
  f.member(5, { name: '정중복', mkt: 1, phone: '010-1000-1001' });   // 1번과 같은 번호
  f.member(6, { name: '=CMD()', mkt: 1, email: 'six@example.com' });
  f.db.prepare("INSERT INTO inquiries (ref, space_id, status, name, phone, event_date, headcount, data, created_at) VALUES ('MS-1','megaspot-gundae','예약 확정','김단골','010','2026-11-20',40,?, '2026-11-02 00:00:00')").run(JSON.stringify({ member_id: 1 }));
  f.db.prepare("INSERT INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, status, created_at) VALUES ('BK-1','megaspot-gundae','MS-1','김단골','010','1001','2026-11-20','pm',40,'confirmed','2026-11-02 00:00:00')").run();
  f.db.prepare("INSERT INTO hosts (id, code, email, pw_hash, name, phone, status, settings, created_at) VALUES (9,'H-1','h@example.com','x','호스트','01000000000','active','{}','2026-11-01')").run();
  f.db.prepare("INSERT INTO member_hosts (member_id, host_id, created_at) VALUES (2, 9, '2026-11-01')").run();
}

test('목록: 조건·요약·정렬·쪽, 휴대폰 숫자로 찾기', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  const f = fixture(t); seed(f);
  let r = (await f.api('members')).json;
  assert.equal(r.count, 6); assert.equal(r.summary.total, 6); assert.equal(r.summary.mkt, 4, '이용 중이고 동의한 회원'); assert.equal(r.summary.hosts, 1); assert.equal(r.summary.suspended, 1); assert.equal(r.summary.recent, 1);
  const one = r.items.find(x => x.id === 1); assert.equal(one.inquiries, 1); assert.equal(one.bookings, 1);
  assert.equal(r.items.find(x => x.id === 2).host_code, 'H-1');
  assert.deepEqual((await f.api('members?mkt=1&status=active')).json.items.map(x => x.id).sort(), [1, 4, 5, 6]);
  assert.deepEqual((await f.api('members?host=1')).json.items.map(x => x.id), [2]);
  assert.deepEqual((await f.api('members?act=booking')).json.items.map(x => x.id), [1]);
  assert.deepEqual((await f.api('members?q=01010001003')).json.items.map(x => x.id), [3]);
  assert.deepEqual((await f.api('members?from=2026-10-01&to=2026-10-31')).json.items.map(x => x.id), [1]);
  r = (await f.api('members?sort=old&size=10&page=1')).json; assert.equal(r.items[0].id, 1);
  assert.equal((await f.api('members?size=10&page=2')).json.items.length, 0);
});

test('상세·메모·관리자 동의 변경 기록·엑셀', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  const f = fixture(t); seed(f);
  assert.equal((await f.api('members/1/note', 'PUT', { memo: '연말 행사 담당', tags: ['vip', 'corp', 'nope'] })).status, 200);
  let d = (await f.api('members/1')).json;
  assert.equal(d.member.memo, '연말 행사 담당'); assert.deepEqual(d.member.tags, ['vip', 'corp']); assert.equal(d.inquiries[0].booking_code, 'BK-1');
  assert.deepEqual((await f.api('members?tag=vip')).json.items.map(x => x.id), [1]);
  await f.api('members/1/consent', 'PUT', { value: false });
  d = (await f.api('members/1')).json; assert.equal(d.member.agree_marketing, false); assert.equal(d.consent[0].source, 'admin');
  assert.equal((await f.api('members/2')).json.host.code, 'H-1');
  assert.equal((await f.api('members/99')).status, 404);
  const csv = await f.api('export?mkt=1');
  assert.match(csv.res.headers.get('content-disposition'), /attachment; filename="megaspot-members-/);
  assert.ok(csv.text.replace(/^\ufeff/, '').startsWith('회원번호,이름,이메일'), csv.text.slice(0, 40));
  assert.match(csv.text, /"'=CMD\(\)"/, '수식으로 열리지 않게 막음');
  assert.ok(!/김단골/.test(csv.text), '동의 철회한 회원은 빠짐');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind = 'member.export'").get().n, 1);
});

test('미리보기: 광고성은 동의 회원만, 정지·번호 없음·중복 제외, 광고 문구와 수신거부 링크', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  const f = fixture(t); seed(f);
  let r = (await f.api('preview', 'POST', { channel: 'sms', purpose: 'ad', body: '{이름}님, 12월 평일 오후 20% 할인 소식입니다.', target: { filter: {} } })).json;
  assert.equal(r.count, 2, '1번과 6번'); assert.deepEqual(r.excluded, { suspended: 1, no_consent: 1, no_contact: 1, duplicate: 1 });
  assert.match(r.sample.text, /^\(광고\)\[메가스팟\] 김단골님, 12월/); assert.match(r.sample.text, /메가스팟 010-2384-9580\n수신거부 https:\/\/megaspot\.kr\/unsubscribe\/\?m=1&k=/);
  assert.equal(r.sample.type, '장문(LMS)'); assert.equal(r.night, false); assert.equal(r.optout_missing, true);
  r = (await f.api('preview', 'POST', { channel: 'sms', purpose: 'info', body: '설 연휴 휴무 안내', target: { ids: [1, 2, 3] } })).json;
  assert.equal(r.count, 2); assert.equal(r.excluded.suspended, 1); assert.equal(r.sample.text, '[메가스팟] 설 연휴 휴무 안내'); assert.equal(r.sample.type, '단문(SMS)');
  assert.equal((await f.api('preview', 'POST', { channel: 'kakao', purpose: 'ad', body: '할인 소식', target: { ids: [1] } })).status, 400);
  assert.equal((await f.api('preview', 'POST', { channel: 'email', purpose: 'info', body: '내용입니다', target: { ids: [1] } })).json.error, '이메일 제목을 적어 주세요.');
  // 080 번호를 넣으면 그 번호로 안내
  await f.api('settings', 'PUT', { optout_080: '080-123-4567' });
  r = (await f.api('preview', 'POST', { channel: 'sms', purpose: 'ad', body: '할인 소식', target: { ids: [1] } })).json; assert.match(r.sample.text, /무료수신거부 080-123-4567$/);
  assert.equal(smsBytes('[메가스팟] 설 연휴'), 18);
});

test('문자 보내기: 끝까지 이어 보내고, 보내기 직전 동의를 다시 확인한다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  const f = fixture(t); seed(f);
  for (let i = 10; i < 30; i++) f.member(i, { mkt: 1 });
  const c = (await f.api('campaigns', 'POST', { channel: 'sms', purpose: 'ad', body: '{이름}님 할인 소식', target: { filter: { mkt: '1' } } })).json;
  assert.equal(c.total, 22); assert.match(c.ref, /^MC-/);
  f.db.prepare('UPDATE members SET agree_marketing = 0 WHERE id = 25').run();   // 보내는 사이에 수신거부
  let r, rounds = 0; do { r = (await f.api('campaigns/' + c.ref + '/send', 'POST', {})).json; rounds++; } while (r.status !== 'done' && rounds < 10);
  assert.equal(rounds, 3); assert.equal(r.sent, 21); assert.equal(r.skipped, 1); assert.equal(r.left, 0);
  const sms = f.sent.filter(x => x.path === 'member/send'); assert.equal(sms.length, 21);
  assert.ok(sms.every(x => x.data.msg.startsWith('(광고)[메가스팟]') && /수신거부/.test(x.data.msg)));
  assert.equal(new Set(sms.map(x => x.data.receiver)).size, 21);
  const list = (await f.api('campaigns')).json.items; assert.equal(list[0].status, 'done'); assert.equal(list[0].sent, 21);
  const tg = (await f.api('campaigns/' + c.ref)).json.items; assert.equal(tg.find(x => x.member_id === 25).status, 'skipped');
  assert.equal((await f.api('members/10')).json.messages[0].status, 'sent');
  assert.equal((await f.api('campaigns/' + c.ref + '/send', 'POST', {})).json.status, 'done', '끝난 뒤 다시 불러도 더 보내지 않음');
  assert.equal(f.sent.filter(x => x.path === 'member/send').length, 21);
});

test('광고 문자는 밤 9시~아침 8시에 막고, 연결 서버가 경로를 모르면 보내지 않는다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  const f = fixture(t); seed(f);
  const c = (await f.api('campaigns', 'POST', { channel: 'sms', purpose: 'ad', body: '할인 소식', target: { ids: [1] } })).json;
  t.mock.timers.setTime(NIGHT);
  assert.equal((await f.api('campaigns/' + c.ref + '/send', 'POST', {})).json.code, 'NIGHT');
  assert.equal((await f.api('preview', 'POST', { channel: 'sms', purpose: 'ad', body: '할인 소식', target: { ids: [1] } })).json.night, true);
  // 정보성은 밤에도 보냄
  const info = (await f.api('campaigns', 'POST', { channel: 'sms', purpose: 'info', body: '내일 공사 안내', target: { ids: [1] } })).json;
  assert.equal((await f.api('campaigns/' + info.ref + '/send', 'POST', {})).json.sent, 1);
  const g = fixture(t, { relay: 'old' }); seed(g);
  const s = (await g.api('settings')).json; assert.equal(s.channels.sms.ready, false); assert.match(s.channels.sms.reason, /member\/send/);
  assert.equal((await g.api('campaigns', 'POST', { channel: 'sms', purpose: 'info', body: '안내입니다', target: { ids: [1] } })).json.code, 'CHANNEL_OFF');
});

test('이메일: 광고는 제목에 (광고), 수신거부 링크와 List-Unsubscribe 머리글', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  const f = fixture(t); seed(f);
  const c = (await f.api('campaigns', 'POST', { channel: 'email', purpose: 'ad', subject: '{이름}님께 12월 소식', body: '평일 오후 할인 <안내>', target: { ids: [1, 2, 6] } })).json;
  assert.equal(c.total, 2);
  const r = (await f.api('campaigns/' + c.ref + '/send', 'POST', {})).json; assert.equal(r.sent, 2);
  const m = f.sent.filter(x => x.kind === 'email'); assert.equal(m[0].subject, '(광고) 김단골님께 12월 소식'); assert.equal(m[0].from, '메가스팟 <hello@megaspot.kr>');
  assert.match(m[0].headers['List-Unsubscribe'], /^<https:\/\/megaspot\.kr\/unsubscribe\/\?m=1&k=/); assert.match(m[0].html, /평일 오후 할인 &lt;안내&gt;/); assert.match(m[0].text, /더 받지 않으려면/);
  // 시험 보내기
  assert.equal((await f.api('test', 'POST', { channel: 'email', purpose: 'info', subject: '시험', body: '시험 메일입니다', to: 'me@example.com' })).status, 200);
  assert.equal(f.sent.at(-1).to[0], 'me@example.com'); assert.equal(f.sent.at(-1).subject, '[메가스팟] 시험');
  const g = fixture(t, { email: false }); assert.equal((await g.api('settings')).json.channels.email.ready, false);
});

test('카카오 알림톡: 승인 확인을 통과한 회원 안내 템플릿으로 보내고, 실패 시 대체 문자를 함께 보낸다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  const f = fixture(t); seed(f);
  assert.equal((await f.api('settings')).json.channels.kakao.ready, false);
  await f.api('settings', 'PUT', { kakao_code: 'UN_9001' });
  assert.equal((await f.api('settings/kakao-check', 'POST', {})).json.ready, true);
  assert.equal((await f.api('settings')).json.channels.kakao.ready, true);
  const c = (await f.api('campaigns', 'POST', { channel: 'kakao', purpose: 'info', body: '12월 24일은 휴무입니다.', target: { ids: [1] } })).json;
  assert.equal((await f.api('campaigns/' + c.ref + '/send', 'POST', {})).json.sent, 1);
  const at = f.sent.find(x => x.path === 'alimtalk/send').data;
  assert.equal(at.tpl_code, 'UN_9001'); assert.match(at.message_1, /^\[메가스팟 회원 안내\]\n김단골님, 메가스팟에서 알려 드립니다\.\n\n12월 24일은 휴무입니다\./); assert.equal(at.fmessage_1, '[메가스팟] 12월 24일은 휴무입니다.');
  await f.api('settings', 'PUT', { kakao_code: 'UN_9002' }); assert.equal((await f.api('settings')).json.channels.kakao.ready, false, '코드를 바꾸면 다시 확인');
});

test('수신거부 링크: 서명이 맞을 때만 동의를 끄고 기록을 남긴다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  const f = fixture(t); seed(f);
  const url = new URL(await unsubUrl(f.env, 1)), k = url.searchParams.get('k');
  const post = body => unsubPost({ env: f.env, request: new Request(ORIGIN + '/api/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.1.1.1' }, body: JSON.stringify(body) }) });
  assert.equal((await post({ m: 1, k: 'wrong-token-xxxxxxxxxx' })).status, 400);
  assert.equal((await post({ m: 6, k })).status, 400, '다른 회원 번호로는 안 됨');
  assert.equal((await (await post({ m: 1, k, check: true })).json()).subscribed, true);
  assert.equal((await post({ m: 1, k })).status, 200);
  assert.equal(f.db.prepare('SELECT agree_marketing FROM members WHERE id = 1').get().agree_marketing, 0);
  assert.equal(f.db.prepare('SELECT source FROM member_consent_log WHERE member_id = 1').get().source, 'unsubscribe_link');
  assert.match(read('unsubscribe/index.html'), /noindex/);
});

test('연결 서버 member/send: 머리말·수신거부 문구·야간 제한·단문/장문', async t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  const env = { ALIGO_RELAY_SECRET: 'test-relay-secret-at-least-32-characters', ALIGO_API_KEY: 'k', ALIGO_USERID: 'u', ALIGO_SENDER_KEY: 's', ALIGO_SENDER: '01012345678', ALIGO_MEMBER_TEMPLATE_CODES: 'UN_9001' };
  const ledger = relayLedger(db), calls = [];
  const up = async (url, o) => { calls.push({ url, body: new URLSearchParams(o.body) }); return Response.json({ result_code: 1, msg_id: '77', success_cnt: 1, error_cnt: 0, code: 0, info: { mid: '5', scnt: 1 } }); };
  const send = (path, data) => { const raw = JSON.stringify({ path, data, request_id: randomUUID(), time: Date.now() }); return relayRequest(new Request('https://relay.local/v1/aligo', { method: 'POST', headers: { 'X-Megaspot-Signature': createHmac('sha256', env.ALIGO_RELAY_SECRET).update(raw).digest('hex') }, body: raw }), env, ledger, up); };
  t.mock.timers.enable({ apis: ['Date'], now: NOON });
  assert.equal((await (await send('member/status', {})).json()).ready, true);
  assert.equal((await send('member/send', { receiver: '01011112222', msg: '[메가스팟] 휴무 안내' })).status, 200);
  assert.equal(calls[0].body.get('msg_type'), 'SMS'); assert.equal(calls[0].body.get('sender'), '01012345678');
  assert.equal((await send('member/send', { receiver: '01011112222', msg: '할인 소식' })).status, 400, '머리말 없음');
  assert.equal((await send('member/send', { receiver: '01011112222', msg: '(광고)[메가스팟] 할인' })).status, 403, '수신거부 문구 없음');
  assert.equal((await send('member/send', { receiver: '01011112222', msg: '(광고)[메가스팟] 할인 소식입니다. 이번 달만 평일 오후 20% 할인합니다.\n수신거부 https://megaspot.kr/unsubscribe/?m=1&k=x' })).status, 200);
  assert.equal(calls[1].body.get('msg_type'), 'LMS'); assert.equal(calls[1].body.get('title'), '(광고) 메가스팟');
  t.mock.timers.setTime(NIGHT);
  assert.equal((await send('member/send', { receiver: '01011112222', msg: '(광고)[메가스팟] 할인\n수신거부 x' })).status, 403, '야간 광고');
  assert.equal((await send('member/send', { receiver: '01011112222', msg: '[메가스팟] 밤에도 보내는 정보성 안내' })).status, 200);
  assert.equal((await send('alimtalk/send', { tpl_code: 'UN_9001', receiver_1: '01011112222', subject_1: '안내', message_1: '본문', fsubject_1: '안내', fmessage_1: '[메가스팟] 본문' })).status, 200);
  assert.equal(calls.at(-1).body.get('failover'), 'Y');
});

test('관리자 화면 연결: 회원 메뉴 파일과 스크립트 순서', () => {
  const html = read('admin/index.html');
  assert.match(html, /admin-members\.js\?v=/); assert.match(html, /admin-members\.css\?v=/);
  assert.ok(html.indexOf('admin-members.js') > html.indexOf('/assets/js/pages/admin.js'), '기존 관리자 스크립트 뒤에서 회원 화면을 바꿈');
  const js = read('assets/js/pages/admin-members.js'); assert.match(js, /X\.register\('members'/); assert.match(js, /id="mem-q"/, '기존 회원 불러오기가 오류 없이 돌도록 자리를 남김');
});
