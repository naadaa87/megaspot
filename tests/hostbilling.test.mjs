// 입점 이용료(부가세 별도 · 공간 한 곳 기준) · 온라인 결제(페이앱) · 계좌이체 입금 확인 · 중도 해지 환불 · 호스트 문자 알림
//   node --test tests/hostbilling.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as hostsApi } from '../functions/api/hosts/[[path]].js';
import { onRequest as venuesApi } from '../functions/api/venues/[[path]].js';
import { onRequest as hqApi } from '../functions/api/hq/[[path]].js';
import { onRequest as hostpayApi } from '../functions/api/hostpay/[[path]].js';
import { PLATFORM, addMonths, addDays } from '../functions/api/_hostplat.js';
import { feeOf, refundCalc } from '../functions/api/_hostbilling.js';
import { hostNoticeText, HOST_NOTICE_HEAD } from '../functions/api/_hostnotify.js';
import { kstStamp } from '../functions/api/_payapp.js';
import { sha256, kstToday } from '../functions/api/_lib.js';
import { relayRequest, relayLedger } from '../deploy/aligo-relay/server.mjs';

const ORIGIN = 'https://megaspot.test', RELAY = 'https://relay.naranhistory.com/megaspot/aligo';
const day = n => kstToday(n);
const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const SPACE = { name: '성수 그랜드홀', region: 'seoul', address: '서울 성동구 성수이로 100', capacity: 180, area: 120, types: ['conference', 'banquet'] };
const FULL = { ...SPACE, summary: '성수역 3분, 층고 5m 단독 홀', intro: '성수역에서 걸어서 3분, 층고 5m의 단독 홀입니다. 컨퍼런스와 연회 모두 가능합니다.',
  price: { modes: ['hourly'], hourly: { weekday: 150000, weekend: 200000, min_hours: 3 } }, payment: { methods: ['bank'], bank: '국민', account: '123-45-6789', holder: '성수홀' } };
const SIGNUP = { email: 'host@example.com', password: 'host-pass-1234', name: '김호스트', phone: '010-5555-1111', company: '성수홀', agree_terms: true, agree_privacy: true, space: SPACE };
const CUSTOMER = { name: '박고객', phone: '010-7777-2222', date: day(20), start: '14:00', end: '18:00', people: 80, select: { mode: 'hourly' }, agree_privacy: true, agree_share: true };

function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return { meta: { changes: Number(st.run(...a).changes) } }; }, exec() { return { meta: { changes: Number(st.run(...a).changes) } }; } }; },
    async batch(list) { db.exec('BEGIN'); try { const r = list.map(s => s.exec()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
  const env = { ADMIN_KEY: 'test-only', DB, PAYAPP_USERID: 'seller-test', PAYAPP_LINKKEY: 'link-test', PAYAPP_LINKVAL: 'value-test', PAYAPP_REQUESTKEY: 'request-test' };
  let ip = 1; const jar = {};
  const call = async (api, base, path, method, body, headers, form) => {
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + base + path, { method, headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...(form ? {} : { origin: ORIGIN }), 'cf-connecting-ip': '10.9.0.' + (ip++ % 250), ...headers },
      ...(body === undefined ? {} : { body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) }) }) });
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, json: ct.includes('json') ? await res.json() : null, text: ct.includes('json') ? '' : await res.text(), res };
  };
  const host = name => async (path, method = 'GET', body) => {
    const r = await call(hostsApi, '/api/hosts/', path, method, body, jar[name] ? { cookie: jar[name] } : {});
    const c = (r.res.headers.getSetCookie ? r.res.headers.getSetCookie() : []).map(x => x.split(';')[0]).filter(x => x.startsWith('ms_host=')); if (c.length) jar[name] = c[0];
    return r;
  };
  const f = { db, env, host, venues: (path, method = 'GET', body) => call(venuesApi, '/api/venues/', path, method, body, {}), hq: (path, method = 'GET', body) => call(hqApi, '/api/hq/', path, method, body, { 'x-admin-key': 'test-only' }),
    feedback: body => call(hostpayApi, '/api/hostpay/', 'feedback', 'POST', body, {}, true),
    bill: ref => db.prepare('SELECT b.*, p.method, p.mul_no, p.pay_type, p.nonce, p.reqs, p.payurl, p.pg_refunded, p.cancel_status, p.refund_amount, p.alert FROM host_billing b LEFT JOIN host_billing_pay p ON p.ref = b.ref WHERE b.ref = ?').get(ref),
    space: ref => db.prepare('SELECT * FROM host_spaces WHERE ref = ?').get(ref), notices: () => db.prepare('SELECT * FROM host_notifications ORDER BY id').all() };
  // 가입 → 정보·사진 → 심사 요청 → 본사 승인까지 한 번에
  f.live = async (name = 'a', signup = SIGNUP) => {
    const h = host(name); let r = await h('signup', 'POST', signup); assert.equal(r.status, 200, JSON.stringify(r.json)); const ref = r.json.space;
    r = await h('spaces/' + ref, 'PUT', { ...FULL, name: signup.space.name }); assert.equal(r.status, 200, JSON.stringify(r.json));
    for (let i = 0; i < 3; i++) await h('spaces/' + ref + '/photos', 'POST', { body: 'data:image/jpeg;base64,' + JPEG, thumb: JPEG, w: 1600, h: 900 });
    r = await h('spaces/' + ref + '/submit', 'POST'); assert.equal(r.json.status, 'review', JSON.stringify(r.json));
    r = await f.hq('spaces/' + ref, 'PATCH', { action: 'approve' }); assert.equal(r.json.item.status, 'live');
    return { h, ref, free_until: r.json.item.free_until };
  };
  f.form = async (ref, state = '4', extra = {}) => { const b = f.bill(ref), stamp = kstStamp();
    return { userid: env.PAYAPP_USERID, linkkey: env.PAYAPP_LINKKEY, linkval: env.PAYAPP_LINKVAL, responsedate: stamp, hash: await sha256(env.PAYAPP_USERID + stamp + env.PAYAPP_REQUESTKEY), var1: ref, var2: b.nonce, mul_no: JSON.parse(b.reqs || '[]')[0] || '777001', price: String(b.amount), pay_type: '1', pay_state: state, ...extra }; };
  return f;
}
// 페이앱 결제 요청과 알리고 연결 서버를 흉내 냅니다 (실제 외부 호출 없음)
function mockNet(t, f, { relay = false } = {}) {
  const calls = { payapp: [], relay: [], sms: [] }; let mul = 777000;
  const ledgerDb = new DatabaseSync(':memory:'), ledger = relayLedger(ledgerDb), relayEnv = { ALIGO_RELAY_SECRET: 'test-relay-secret-at-least-32-characters', ALIGO_API_KEY: 'k', ALIGO_USERID: 'u', ALIGO_SENDER_KEY: 'p', ALIGO_SENDER: '01012345678' };
  if (relay) Object.assign(f.env, { ALIGO_LIVE_ENABLED: 'true', ALIGO_RELAY_URL: RELAY, ALIGO_RELAY_SECRET: relayEnv.ALIGO_RELAY_SECRET });
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    if (url === 'https://api.payapp.kr/oapi/v2') { calls.payapp.push(new URLSearchParams(opts.body)); return new Response(new URLSearchParams({ state: '1', mul_no: String(++mul), payurl: 'https://payapp.kr/pay-' + mul }).toString()); }
    if (url === RELAY) {   // 저장소의 연결 서버 코드로 그대로 검사합니다
      calls.relay.push(JSON.parse(opts.body));
      return relayRequest(new Request('https://relay.local/v1/aligo', { method: 'POST', headers: opts.headers, body: opts.body }), relayEnv, ledger,
        async (u, o) => { calls.sms.push({ url: u, body: new URLSearchParams(o.body) }); return Response.json({ result_code: 1, message: 'success', msg_id: String(9000 + calls.sms.length), success_cnt: 1, error_cnt: 0 }); });
    }
    throw new Error('unexpected fetch ' + url);
  });
  return calls;
}

test('이용료는 공간 한 곳 기준 · 부가세 별도: 공급가액에 부가세 10%를 더해 결제', () => {
  assert.deepEqual(PLATFORM.fee, { per: 'space', vat: 'excluded', vatRate: 10, refundRate: 50 });
  assert.deepEqual(PLATFORM.plans.map(p => feeOf(p)), [{ supply: 1200000, vat: 120000, total: 1320000 }, { supply: 900000, vat: 90000, total: 990000 }, { supply: 600000, vat: 60000, total: 660000 }, { supply: 250000, vat: 25000, total: 275000 }]);
});

test('중도 해지 환불 계산: 시작 전에는 전액, 시작한 뒤에는 남은 기간 금액(일할)의 50%', () => {
  const bill = { amount: 1320000, period_from: '2027-01-01', period_to: '2027-12-31' };
  assert.deepEqual(refundCalc(bill, '2026-12-15'), { base: '2026-12-15', started: false, total: 1320000, days: 365, used: 0, left: 365, remain: 1320000, rate: 100, refund: 1320000 });
  // 7월 2일에 해지: 183일 이용, 182일 남음 → 잔여금액 658,191원 → 50% = 329,095원 → 10원 미만 버림
  assert.deepEqual(refundCalc(bill, '2027-07-02'), { base: '2027-07-02', started: true, total: 1320000, days: 365, used: 183, left: 182, remain: 658191, rate: 50, refund: 329090 });
  assert.equal(refundCalc(bill, '2027-01-01').used, 1, '해지 신청일은 이용한 날로 계산');
  assert.equal(refundCalc(bill, '2027-12-31').refund, 0); assert.equal(refundCalc(bill, '2028-02-01').refund, 0);
});

test('온라인 결제: 신청 → 결제창 → 검증된 통보만 결제 완료 → 등록 기간 연장 (반복 통보는 한 번만 반영)', async t => {
  const f = fixture(), net = mockNet(t, f), { h, ref, free_until } = await f.live();
  let r = await h('billing'); assert.equal(r.json.online, true); assert.equal(r.json.plans[0].total, 1320000); assert.equal(r.json.fee.vat, 'excluded');
  r = await h('billing', 'POST', { space: ref, plan: 'm12', tax_invoice: true });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.deepEqual([r.json.supply, r.json.vat, r.json.amount], [1200000, 120000, 1320000]); assert.equal(r.json.payurl, 'https://payapp.kr/pay-777001');
  const bl = r.json.ref, sent = net.payapp[0];
  assert.equal(sent.get('price'), '1320000'); assert.equal(sent.get('feedbackurl'), ORIGIN + '/api/hostpay/feedback'); assert.equal(sent.get('returnurl'), ORIGIN + '/api/hostpay/return?ref=' + bl);
  assert.equal(sent.get('var1'), bl); assert.equal(sent.get('recvphone'), '01055551111'); assert.equal(sent.get('smsuse'), 'n'); assert.match(sent.get('goodname'), /입점 이용료 12개월 · 성수 그랜드홀/);
  for (const secret of ['link-test', 'value-test', 'request-test', sent.get('var2')]) assert.equal(JSON.stringify(r.json).includes(secret), false, '키·확인값은 브라우저로 가지 않음');
  assert.equal((await h('billing', 'POST', { space: ref, plan: 'm1' })).status, 409, '결제 대기 중에는 한 건만');
  r = await h('billing/' + bl + '/pay', 'POST'); assert.equal(r.json.payurl, 'https://payapp.kr/pay-777001'); assert.equal(net.payapp.length, 1, '방금 만든 결제창은 다시 요청하지 않음');
  assert.equal((await f.host('b')('billing/' + bl + '/pay', 'POST')).status, 401);
  // 위조·금액 불일치·모르는 거래번호 통보는 반영하지 않음
  for (const extra of [{ hash: 'bad' }, { linkval: 'bad' }, { var2: 'bad' }, { price: '1000' }, { mul_no: '999999' }, { responsedate: '20000101000000' }, { var1: 'BL-0000-XXXX' }]) {
    assert.notEqual((await f.feedback(await f.form(bl, '4', extra))).status, 200, JSON.stringify(extra)); assert.equal(f.bill(bl).status, 'requested'); }
  // 입금 대기(가상계좌) → 결제 완료
  assert.equal((await f.feedback(await f.form(bl, '10'))).text, 'SUCCESS'); assert.equal((await h('billing')).json.items[0].pg_pending, true);
  const paid = await f.feedback(await f.form(bl, '4')); assert.equal(paid.status, 200); assert.equal(paid.text, 'SUCCESS');
  const b = f.bill(bl); assert.equal(b.status, 'paid'); assert.equal(b.mul_no, '777001'); assert.equal(b.pay_type, 'PayApp:1'); assert.equal(b.payurl, null);
  assert.equal(b.period_from, addDays(free_until, 1), '무료 기간이 끝난 다음 날부터'); assert.equal(b.period_to, addDays(addMonths(b.period_from, 12), -1));
  assert.equal(f.space(ref).paid_until, b.period_to); assert.equal(f.space(ref).plan, 'm12');
  assert.equal((await f.feedback(await f.form(bl, '4'))).text, 'SUCCESS'); assert.equal(f.space(ref).paid_until, b.period_to, '같은 통보가 다시 와도 한 번만');
  r = await h('billing'); const it = r.json.items[0];
  assert.equal(it.status_label, '결제 완료'); assert.equal(it.method_label, '온라인 결제'); assert.equal(it.active, true); assert.equal(it.refund_preview.refund, 1320000, '유료 기간 시작 전에는 전액');
  assert.equal(JSON.stringify(r.json).includes(b.nonce), false);
  // 결제 확인 알림이 기록됨 (발송 설정이 꺼져 있어 문자는 나가지 않음)
  const n = f.notices().filter(x => x.kind === 'billing'); assert.equal(n.length, 1); assert.equal(n[0].status, 'held'); assert.match(n[0].msg, /이용료 결제가 확인되었습니다\.\n등록 기간 .+ \(12개월\)\n결제 금액 1,320,000원 \(부가세 포함\)/);
  // 결제창에서 돌아오는 주소는 화면만 옮기고 상태를 바꾸지 않음
  const back = await hostpayApi({ env: f.env, params: { path: ['return'] }, request: new Request(ORIGIN + '/api/hostpay/return?ref=' + bl, { method: 'POST' }) });
  assert.equal(back.status, 303); assert.equal(back.headers.get('location'), ORIGIN + '/host/center/?pay=' + bl + '#billing');
});

test('결제 전 취소 · 결제 요청 취소 통보 · 취소한 뒤 열어 둔 결제창으로 낸 결제도 등록 기간에 반영', async t => {
  const f = fixture(), net = mockNet(t, f), { h, ref } = await f.live();
  let r = await h('billing', 'POST', { space: ref, plan: 'm3' }); const bl = r.json.ref; assert.equal(r.json.amount, 660000);
  // 고객이 결제창에서 취소 → 결제창 주소를 지워 새로 요청할 수 있게
  assert.equal((await f.feedback(await f.form(bl, '8'))).text, 'SUCCESS'); assert.equal(f.bill(bl).payurl, null);
  r = await h('billing/' + bl + '/pay', 'POST'); assert.equal(r.json.payurl, 'https://payapp.kr/pay-777002'); assert.equal(net.payapp.length, 2);
  r = await h('billing/' + bl + '/withdraw', 'POST'); assert.equal(r.status, 200); assert.equal(f.bill(bl).status, 'cancelled');
  assert.equal((await h('billing/' + bl + '/withdraw', 'POST')).status, 409); assert.equal((await h('billing/' + bl + '/pay', 'POST')).status, 409);
  assert.equal((await f.feedback(await f.form(bl, '4', { mul_no: '777002' }))).text, 'SUCCESS'); assert.equal(f.bill(bl).status, 'paid'); assert.ok(f.space(ref).paid_until > day(100));
  // 이미 결제된 신청에 다른 거래번호의 결제 통보는 받지 않음
  assert.notEqual((await f.feedback(await f.form(bl, '4', { mul_no: '555555' }))).status, 200);
});

test('계좌이체 신청 → 본사 입금 확인 · 온라인 결제가 꺼져 있으면 계좌이체만', async t => {
  const f = fixture(); mockNet(t, f); const { h, ref } = await f.live();
  let r = await h('billing', 'POST', { space: ref, plan: 'm6', method: 'bank', tax_invoice: true }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.amount, 990000); assert.equal(r.json.payurl, '');
  assert.equal((await f.hq('summary')).json.billing_requested, 1);
  const item = (await f.hq('billing?status=todo')).json.items[0]; assert.equal(item.method, 'bank'); assert.deepEqual([item.supply, item.vat, item.amount], [900000, 90000, 990000]); assert.equal(item.tax_invoice, true);
  assert.equal((await f.hq('billing/' + item.ref, 'PATCH', { action: 'paid' })).status, 200); assert.equal((await f.hq('billing/' + item.ref, 'PATCH', { action: 'paid' })).status, 400, '두 번 확인 불가');
  assert.equal(f.bill(item.ref).status, 'paid'); assert.equal(f.bill(item.ref).pay_type, 'bank'); assert.equal((await f.hq('summary')).json.billing_requested, 0);
  delete f.env.PAYAPP_REQUESTKEY;
  const second = await f.live('b', { ...SIGNUP, email: 'b@example.com', space: { ...SPACE, name: '두 번째 공간' } });
  r = await second.h('billing'); assert.equal(r.json.online, false);
  assert.equal((await second.h('billing', 'POST', { space: second.ref, plan: 'm1' })).status, 503); assert.equal((await second.h('billing', 'POST', { space: second.ref, plan: 'm1', method: 'bank' })).status, 200);
});

test('중도 해지: 신청 → 철회 → 다시 신청 → 본사 환불 처리(잔여금액의 50%) → 등록 기간이 해지일까지로 줄어듦', async t => {
  const f = fixture(); mockNet(t, f); const { h, ref } = await f.live();
  let r = await h('billing', 'POST', { space: ref, plan: 'm12' }); const bl = r.json.ref; await f.feedback(await f.form(bl, '4'));
  // 유료 기간이 30일 전에 시작된 상태로 맞춤 (365일 가운데 31일 이용)
  f.db.prepare('UPDATE host_billing SET period_from = ?, period_to = ? WHERE ref = ?').run(day(-30), day(334), bl);
  f.db.prepare('UPDATE host_spaces SET free_until = ?, paid_until = ? WHERE ref = ?').run(day(-31), day(334), ref);
  const want = Math.floor(Math.floor(1320000 * 334 / 365) * 0.5 / 10) * 10;
  r = await h('billing'); assert.deepEqual([r.json.items[0].refund_preview.used, r.json.items[0].refund_preview.left, r.json.items[0].refund_preview.refund], [31, 334, want]);
  assert.equal((await h('billing/' + bl + '/cancel', 'POST', { reason: '폐업' })).status, 400, '환불 기준 동의 필요');
  r = await h('billing/' + bl + '/cancel', 'POST', { reason: '공간 리모델링', agree: true }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.calc.refund, want); assert.equal(r.json.calc.rate, 50);
  assert.equal((await h('billing/' + bl + '/cancel', 'POST', { agree: true })).status, 409);
  assert.equal((await h('billing', 'POST', { space: ref, plan: 'm1' })).json.code, 'CANCEL_PENDING', '해지 신청 중에는 새 등록 기간을 고를 수 없음');
  assert.equal((await f.hq('summary')).json.billing_requested, 1); assert.equal((await f.hq('billing?status=cancel')).json.items[0].cancel.reason, '공간 리모델링');
  assert.equal((await h('billing/' + bl + '/cancel-withdraw', 'POST')).status, 200); assert.equal((await h('billing')).json.items[0].cancel.status, 'withdrawn'); assert.equal((await f.hq('summary')).json.billing_requested, 0);
  await h('billing/' + bl + '/cancel', 'POST', { agree: true });
  assert.equal((await f.hq('billing/' + bl, 'PATCH', { action: 'refund_done', amount: 1320001 })).status, 400, '결제 금액보다 큰 환불 불가');
  assert.equal((await f.hq('billing/' + bl, 'PATCH', { action: 'refund_done', memo: '페이앱 부분 취소' })).status, 200);
  const b = f.bill(bl); assert.equal(b.status, 'refunded'); assert.equal(b.refund_amount, want); assert.equal(b.cancel_status, 'done');
  assert.equal(f.space(ref).paid_until, day(0), '해지 신청일까지 이용'); assert.equal((await f.hq('billing/' + bl, 'PATCH', { action: 'refund_done' })).status, 400);
  r = await h('billing'); assert.equal(r.json.items[0].status_label, '해지·환불'); assert.equal(r.json.items[0].refund_amount, want); assert.equal(r.json.items[0].refund_preview, undefined);
  assert.match(f.notices().pop().msg, /등록 해지와 환불 처리가 끝났습니다\.\n환불 금액 /);
  assert.equal((await f.venues('search')).json.items.length, 1, '해지 신청일 당일까지는 공개'); assert.equal((await h('billing/' + bl + '/cancel', 'POST', { agree: true })).status, 400);
});

test('유료 기간 시작 전 해지는 전액 환불 · 페이앱 취소 통보가 오면 자동으로 마무리', async t => {
  const f = fixture(); mockNet(t, f); const { h, ref, free_until } = await f.live();
  let r = await h('billing', 'POST', { space: ref, plan: 'm6' }); const bl = r.json.ref; await f.feedback(await f.form(bl, '4'));
  r = await h('billing/' + bl + '/cancel', 'POST', { agree: true }); assert.equal(r.json.calc.started, false); assert.equal(r.json.calc.refund, 990000);
  // 운영팀이 페이앱 판매자 화면에서 전액 취소 → 통보 → 해지·환불 완료
  assert.equal((await f.feedback(await f.form(bl, '9'))).text, 'SUCCESS');
  const b = f.bill(bl); assert.equal(b.status, 'refunded'); assert.equal(b.refund_amount, 990000); assert.equal(b.pg_refunded, 990000);
  assert.equal(f.space(ref).paid_until, free_until, '무료 기간까지만 남음');
  // 부분 취소 통보: 해지 신청 금액 이상이 취소되면 마무리, 같은 통보는 한 번만
  r = await h('billing', 'POST', { space: ref, plan: 'm12' }); const b2 = r.json.ref; await f.feedback(await f.form(b2, '4'));
  f.db.prepare('UPDATE host_billing SET period_from = ?, period_to = ? WHERE ref = ?').run(day(-9), day(355), b2); f.db.prepare('UPDATE host_spaces SET free_until = ?, paid_until = ? WHERE ref = ?').run(day(-10), day(355), ref);
  r = await h('billing/' + b2 + '/cancel', 'POST', { agree: true }); const refund = r.json.calc.refund; assert.ok(refund > 0 && refund < 660000);
  const part = async (no, price) => f.feedback(await f.form(b2, '70', { mul_no: no, price: String(price), orig_price: '1320000', orig_mul_no: f.bill(b2).mul_no }));
  assert.equal((await part('880001', 100000)).text, 'SUCCESS'); assert.equal(f.bill(b2).status, 'paid'); assert.equal(f.bill(b2).pg_refunded, 100000);
  assert.equal((await part('880001', 100000)).text, 'SUCCESS'); assert.equal(f.bill(b2).pg_refunded, 100000, '같은 취소 통보는 한 번만');
  assert.equal((await part('880002', refund - 100000)).text, 'SUCCESS'); assert.equal(f.bill(b2).status, 'refunded'); assert.equal(f.bill(b2).refund_amount, refund);
});

test('호스트 문자 알림: 새 문의 · 견적 수락 · 입금 알림 · 취소를 한 번씩, 고객 정보 없이 호스트센터 주소로', async t => {
  const f = fixture(), net = mockNet(t, f, { relay: true }), { h, ref } = await f.live();
  // 심사 승인 알림
  assert.equal(net.sms.length, 1); assert.match(net.sms[0].body.get('msg'), /^\[메가스팟 호스트 알림\]\n‘성수 그랜드홀’ 공간 심사가 끝나 검색에 공개되었습니다\./);
  let r = await f.venues('request', 'POST', { ref, ...CUSTOMER }); assert.equal(r.status, 200, JSON.stringify(r.json)); const code = r.json.code, k = r.json.k;
  const first = net.sms[1].body, msg = first.get('msg');
  assert.equal(net.relay[1].path, 'host/send'); assert.equal(first.get('receiver'), '01055551111'); assert.equal(first.get('msg_type'), 'LMS'); assert.equal(first.get('title'), '메가스팟 호스트 알림'); assert.equal(first.get('sender'), '01012345678');
  assert.ok(msg.startsWith(HOST_NOTICE_HEAD + '\n‘성수 그랜드홀’ 공간에 새 문의가 들어왔습니다.\n이용일 ')); assert.ok(msg.includes('14:00~18:00 · 80명\n예약번호 ' + code)); assert.ok(msg.endsWith('\nhttps://megaspot.kr/host/center/#b=' + code));
  assert.equal(/박고객|7777/.test(msg), false, '문자에는 고객 이름·연락처를 넣지 않음');
  assert.equal(f.notices()[1].status, 'accepted'); assert.equal(f.notices()[1].provider_mid, '9002');
  // 호스트 견적 → 고객 수락 → 입금 알림(하루에 한 번) → 메시지(한 시간에 한 번)
  await h('bookings/' + code, 'PATCH', { action: 'quote', lines: [{ label: '공간 이용료', amount: 600000 }] });
  const act = (action, extra = {}) => f.venues('booking', 'POST', { code, k, action, ...extra });
  assert.equal((await act('accept')).status, 200); assert.match(net.sms[2].body.get('msg'), /고객이 견적을 수락했습니다\./);
  await act('paid_notice'); await act('paid_notice'); assert.equal(net.sms.length, 4); assert.match(net.sms[3].body.get('msg'), /입금\(결제\)했다고 알려 왔습니다\./);
  await act('message', { text: '주차 가능한가요?' }); await act('message', { text: '답변 부탁드립니다.' }); assert.equal(net.sms.length, 5);
  await h('bookings/' + code, 'PATCH', { action: 'confirm' }); await act('cancel', { reason: '일정 변경' });
  assert.match(net.sms[5].body.get('msg'), /확정된 예약의 취소를 요청했습니다\./); assert.equal(net.sms.length, 6);
  for (const s of net.sms) assert.ok(s.body.get('msg').length <= 600);
  // 본사 관리자 발송 기록: 받는 번호는 뒤 4자리만
  r = await f.hq('notices'); assert.equal(r.json.live, true); assert.equal(r.json.items.length, 6); assert.equal(r.json.items[0].receiver_last4, '1111'); assert.equal(JSON.stringify(r.json).includes('01055551111'), false);
  // 알림을 끄면 보내지 않음 · 받을 번호를 바꾸면 그 번호로
  await h('me', 'PUT', { name: '김호스트', phone: '010-5555-1111', settings: { notify_phone: '010-9999-0000', notify_on: true } });
  await f.venues('request', 'POST', { ref, ...CUSTOMER, phone: '010-7777-3333' }); assert.equal(net.sms[6].body.get('receiver'), '01099990000');
  await h('me', 'PUT', { name: '김호스트', phone: '010-5555-1111', settings: { notify_phone: '010-9999-0000', notify_on: false } });
  await f.venues('request', 'POST', { ref, ...CUSTOMER, phone: '010-7777-4444' }); assert.equal(net.sms.length, 7);
});

test('호스트 문자 알림: 발송 설정이 꺼져 있거나 연결 서버가 받지 않으면 기록만 남고 예약 접수는 그대로', async t => {
  const f = fixture(); mockNet(t, f); const { ref } = await f.live();
  assert.equal((await f.venues('request', 'POST', { ref, ...CUSTOMER })).status, 200); assert.equal(f.notices().pop().status, 'held');
  Object.assign(f.env, { ALIGO_LIVE_ENABLED: 'true', ALIGO_RELAY_URL: RELAY, ALIGO_RELAY_SECRET: 'x'.repeat(40) });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Unsupported operation' }, { status: 400 }));
  assert.equal((await f.venues('request', 'POST', { ref, ...CUSTOMER, phone: '010-7777-5555' })).status, 200);
  const n = f.notices().pop(); assert.equal(n.status, 'failed'); assert.match(n.error, /host\/send/);
  assert.equal((await f.hq('notices?status=attention')).json.items.length, 3);
  // 본문 규칙: 종류를 모르면 만들지 않음
  assert.equal(hostNoticeText('nope', {}), ''); assert.ok(hostNoticeText('review', { result: 'fix', ref: 'SP-2611-ABCD', space: '홀' }).endsWith('/host/center/#space=SP-2611-ABCD'));
});
