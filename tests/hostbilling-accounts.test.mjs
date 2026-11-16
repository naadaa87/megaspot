import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { billingFeedback, payRequest } from '../functions/api/_hostbilling.js';
import { kstStamp } from '../functions/api/_payapp.js';
import { ensureSchema, now, sha256 } from '../functions/api/_lib.js';

const ORIGIN = 'https://megaspot.test', REF = 'BL-2611-ACCT';
const accounts = {
  legacy: { userid: 'old-seller', linkkey: 'old-link', linkval: 'old-value', requestkey: 'old-request' },
  jiyu: { userid: 'new-seller', linkkey: 'new-link', linkval: 'new-value', requestkey: 'new-request' }
};
function fixture({ legacy = false, paid = false, preTransitionSchema = false } = {}) {
  const db = new DatabaseSync(':memory:'); let schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  if (preTransitionSchema) schema = schema.replace(/^  merchant_userid TEXT,.*\n/gm, '').replace(/-- 계정 전환 전후의 요청[\s\S]*?(?=CREATE TABLE IF NOT EXISTS host_notifications)/, '');
  db.exec(schema);
  const DB = { prepare(sql) { const st = db.prepare(sql); let args = [];
    return { bind(...v) { args = v; return this; }, async first() { return st.get(...args) || null; }, async all() { return { results: st.all(...args) }; }, async run() { return this.exec(); }, exec() { return { meta: { changes: Number(st.run(...args).changes) } }; } };
  }, async batch(list) { db.exec('BEGIN'); try { const rows = list.map(s => s.exec()); db.exec('COMMIT'); return rows; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
  const env = { DB, PAYAPP_ACTIVE_ACCOUNT: 'jiyu' };
  for (const [name, values] of Object.entries(accounts)) for (const [key, value] of Object.entries(values)) env['PAYAPP_' + (name === 'jiyu' ? 'JIYU_' : '') + key.toUpperCase()] = value;
  db.prepare("INSERT INTO host_spaces(ref,host_id,status,name,region,data,created_at) VALUES('SP-2611-ACCT',1,'live','테스트 공간','seoul','{}',?)").run(now());
  db.prepare("INSERT INTO host_billing(ref,host_id,space_ref,plan,months,amount,status,period_from,period_to,data,created_at) VALUES(?,1,'SP-2611-ACCT','m1',1,275000,?,'2027-01-01','2027-01-31','{}',?)").run(REF, paid ? 'paid' : 'requested', now());
  db.prepare("INSERT INTO host_billing_pay(ref,method,nonce,reqs,payurl,requested_at,mul_no,pg_state,updated_at) VALUES(?,'online',?,?,?,?,?,?,?)")
    .run(REF, legacy ? 'legacy-nonce' : null, legacy ? '["81001"]' : null, legacy && !paid ? 'https://payapp.kr/legacy' : null, legacy ? now() : null, paid ? '81001' : null, paid ? 'paid' : null, now());
  const bill = () => db.prepare('SELECT * FROM host_billing WHERE ref=?').get(REF);
  const pay = () => db.prepare('SELECT * FROM host_billing_pay WHERE ref=?').get(REF);
  const attempt = account => db.prepare('SELECT * FROM host_billing_pay_requests WHERE ref=? AND merchant_userid=? ORDER BY rowid DESC LIMIT 1').get(REF, accounts[account].userid);
  const form = async (account, state = '4', extra = {}) => {
    const C = accounts[account], stamp = kstStamp(), req = attempt(account);
    return { userid: C.userid, linkkey: C.linkkey, linkval: C.linkval, responsedate: stamp, hash: await sha256(C.userid + stamp + C.requestkey), var1: REF, var2: req?.nonce || pay().nonce, mul_no: req?.mul_no || '81001', price: '275000', pay_type: '1', pay_state: state, ...extra };
  };
  const feedback = fields => billingFeedback(new Request(ORIGIN + '/api/hostpay/feedback', { method: 'POST', body: new URLSearchParams(fields) }), env);
  const request = () => payRequest(env, ORIGIN, { phone: '01012345678' }, bill(), { name: '테스트 공간' });
  return { db, env, bill, pay, attempt, form, feedback, request };
}
function mockPay(t, handler) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.payapp.kr/oapi/v2');
    const fields = Object.fromEntries(new URLSearchParams(options.body)); calls.push(fields);
    if (handler) await handler(fields);
    return new Response('state=1&mul_no=81001&payurl=https%3A%2F%2Fpayapp.kr%2Fnew');
  });
  return calls;
}

test('전환 전 미결제 링크는 새 계정으로 다시 결제시키지 않고, 기존 승인·환불 통보는 계속 반영', async t => {
  const f = fixture({ legacy: true }), calls = mockPay(t);
  assert.equal((await f.request()).code, 'PAYMENT_ACCOUNT_TRANSITION_PENDING'); assert.equal(calls.length, 0);
  const wrong = await f.form('jiyu', '4', { var2: 'legacy-nonce' });
  assert.equal((await f.feedback(wrong)).status, 403); assert.equal(f.bill().status, 'requested');
  assert.equal(await (await f.feedback(await f.form('legacy'))).text(), 'SUCCESS');
  assert.equal(f.bill().status, 'paid'); assert.equal(f.pay().merchant_userid, 'old-seller');
  assert.equal(await (await f.feedback(await f.form('legacy', '64'))).text(), 'SUCCESS');
  assert.equal(f.bill().status, 'refunded'); assert.equal(f.pay().pg_refunded, 275000);
});

test('기존 승인 거래의 NULL 계정은 기존 계정으로만 취소하며 새 계정의 같은 번호 통보는 거부', async t => {
  const f = fixture({ legacy: true, paid: true }); mockPay(t);
  assert.equal((await f.feedback(await f.form('jiyu', '64', { var2: 'legacy-nonce' }))).status, 403);
  assert.equal(f.bill().status, 'paid');
  assert.equal(await (await f.feedback(await f.form('legacy', '64'))).text(), 'SUCCESS');
  assert.equal(f.bill().status, 'refunded');
});

test('기존 계정 아이디를 제거한 상태에서도 미확인 구계정 요청을 새 계정으로 다시 결제시키지 않음', async t => {
  const f = fixture({ legacy: true }), calls = mockPay(t); delete f.env.PAYAPP_USERID;
  const result = await f.request();
  assert.equal(result.code, 'PAYMENT_UNAVAILABLE'); assert.equal(result.status, 503); assert.equal(calls.length, 0);
});

test('구계정 요청 취소 확인 후 새 계정으로 요청하고, 구계정의 늦은 통보는 새 링크·환불에 영향 없음', async t => {
  const f = fixture({ legacy: true }), calls = mockPay(t);
  await f.request(); const old = await f.form('legacy', '8');
  assert.equal(await (await f.feedback(old)).text(), 'SUCCESS');
  assert.equal((await f.request()).ok, true); assert.equal(calls.length, 1); assert.equal(calls[0].userid, 'new-seller');
  assert.notEqual(calls[0].var2, 'legacy-nonce'); assert.equal(f.pay().merchant_userid, 'new-seller');
  assert.equal(await (await f.feedback(old)).text(), 'SUCCESS'); assert.equal(f.pay().payurl, 'https://payapp.kr/new');
  assert.equal(await (await f.feedback(await f.form('jiyu'))).text(), 'SUCCESS'); assert.equal(f.bill().status, 'paid');
  assert.equal(await (await f.feedback(await f.form('legacy', '64'))).text(), 'SUCCESS'); assert.equal(f.bill().status, 'paid');
  assert.equal(await (await f.feedback(await f.form('jiyu', '70', { mul_no: '82001', orig_mul_no: '81001', orig_price: '275000', price: '10000' }))).text(), 'SUCCESS');
  assert.equal(f.pay().pg_refunded, 10000); assert.equal(f.bill().status, 'paid');
  assert.equal(await (await f.feedback(await f.form('jiyu', '64'))).text(), 'SUCCESS'); assert.equal(f.bill().status, 'refunded');
});

test('응답 전에 도착한 새 계정 승인도 요청별 nonce로 검증하며 응답이 완료 상태를 덮어쓰지 않음', async t => {
  const f = fixture();
  mockPay(t, async sent => {
    assert.equal(f.attempt('jiyu').status, 'requesting');
    assert.equal(await (await f.feedback(await f.form('jiyu', '4', { var2: sent.var2 }))).text(), 'SUCCESS');
  });
  assert.equal((await f.request()).ok, true); assert.equal(f.bill().status, 'paid');
  assert.equal(f.pay().payurl, null); assert.equal(f.pay().merchant_userid, 'new-seller'); assert.equal(f.attempt('jiyu').status, 'paid');
});

test('결제 요청 응답 유실 후에는 계정 전환·재시도 모두 중복 결제 요청을 만들지 않음', async t => {
  const f = fixture(); f.env.PAYAPP_ACTIVE_ACCOUNT = 'legacy';
  const calls = mockPay(t, async () => { throw Error('simulated timeout'); });
  assert.equal((await f.request()).code, 'PAYAPP_UNAVAILABLE');
  assert.equal((await f.request()).code, 'PAYMENT_PENDING');
  f.env.PAYAPP_ACTIVE_ACCOUNT = 'jiyu';
  assert.equal((await f.request()).code, 'PAYMENT_ACCOUNT_TRANSITION_PENDING'); assert.equal(calls.length, 1);
  assert.equal(await (await f.feedback(await f.form('legacy'))).text(), 'SUCCESS'); assert.equal(f.bill().status, 'paid');
});

test('이전 코드에서 요청 취소 후 재시도 응답이 유실된 경우에도 빈 링크를 취소 확인으로 추정하지 않음', async t => {
  const f = fixture({ legacy: true }), calls = mockPay(t);
  // 이전 구현은 A의 취소 때 reqs/payurl만 지우고, B의 응답 유실 때 nonce/requested_at을 그대로 두었습니다.
  f.db.prepare('UPDATE host_billing_pay SET reqs=?,payurl=NULL WHERE ref=?').run('[]', REF);
  assert.equal((await f.request()).code, 'PAYMENT_ACCOUNT_TRANSITION_PENDING'); assert.equal(calls.length, 0);
  assert.equal(f.attempt('legacy').status, 'legacy'); assert.equal(f.attempt('legacy').mul_no, null);
  assert.equal(await (await f.feedback(await f.form('legacy', '4', { mul_no: '81002' }))).text(), 'SUCCESS');
  assert.equal(f.bill().status, 'paid'); assert.equal(f.pay().mul_no, '81002'); assert.equal(f.pay().merchant_userid, 'old-seller');
});

test('구계정의 오래된 취소 재통보가 미확인 재시도 요청을 해제하거나 늦은 승인을 막지 않음', async t => {
  const f = fixture({ legacy: true }), calls = mockPay(t);
  f.db.prepare('UPDATE host_billing_pay SET reqs=?,payurl=NULL WHERE ref=?').run('[]', REF);
  assert.equal((await f.request()).code, 'PAYMENT_ACCOUNT_TRANSITION_PENDING');
  assert.equal(await (await f.feedback(await f.form('legacy', '8', { mul_no: '81001' }))).text(), 'SUCCESS');
  const unknown = f.db.prepare('SELECT * FROM host_billing_pay_requests WHERE ref=? AND mul_no IS NULL').get(REF);
  assert.equal(unknown.status, 'legacy');
  assert.equal((await f.request()).code, 'PAYMENT_ACCOUNT_TRANSITION_PENDING'); assert.equal(calls.length, 0);
  assert.equal(await (await f.feedback(await f.form('legacy', '4', { mul_no: '81002' }))).text(), 'SUCCESS');
  assert.equal(f.bill().status, 'paid'); assert.equal(f.pay().mul_no, '81002'); assert.equal(f.pay().merchant_userid, 'old-seller');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM host_billing_pay_requests WHERE ref=?').get(REF).n, 3);
});

test('동시 결제창 요청은 외부 결제를 한 번만 요청', async t => {
  const f = fixture(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const calls = mockPay(t, () => gate);
  const first = f.request(), second = f.request();
  while (!calls.length) await new Promise(resolve => setImmediate(resolve));
  release();
  const results = await Promise.all([first, second]);
  assert.equal(calls.length, 1); assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.code === 'PAYMENT_PENDING').length, 1);
});

test('동일한 거래번호라도 취소된 구계정의 늦은 승인은 별개 계정이며 중복 결제 경고를 남김', async t => {
  const f = fixture({ legacy: true }); mockPay(t);
  await f.request(); await f.feedback(await f.form('legacy', '8')); await f.request();
  await f.feedback(await f.form('jiyu'));
  const until = f.db.prepare('SELECT paid_until FROM host_spaces').get().paid_until;
  assert.equal(await (await f.feedback(await f.form('legacy'))).text(), 'SUCCESS');
  assert.equal(f.pay().merchant_userid, 'new-seller'); assert.match(f.pay().alert, /한 번 더/);
  assert.equal(f.db.prepare('SELECT paid_until FROM host_spaces').get().paid_until, until);
});

test('구·신계정 승인이 동시에 도착해도 등록은 한 번만 적용하고 중복 결제 경고를 남김', async t => {
  const f = fixture({ legacy: true }); mockPay(t);
  await f.request(); await f.feedback(await f.form('legacy', '8')); await f.request();
  const forms = await Promise.all([f.form('legacy'), f.form('jiyu')]);
  const results = await Promise.all(forms.map(form => f.feedback(form)));
  assert.deepEqual(await Promise.all(results.map(r => r.text())), ['SUCCESS', 'SUCCESS']);
  assert.equal(f.bill().status, 'paid'); assert.match(f.pay().alert, /한 번 더/);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM event_log WHERE kind=?').get('hostbilling.paid').n, 1);
});

test('기존 데이터베이스용 마이그레이션은 기존 거래·nonce를 보존하고 계정 필드를 NULL로 추가', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE payapp_payments(oid TEXT PRIMARY KEY,mul_no TEXT,nonce TEXT); CREATE TABLE host_billing_pay(ref TEXT PRIMARY KEY,nonce TEXT); INSERT INTO payapp_payments VALUES('O1','81001','private-nonce'); INSERT INTO host_billing_pay VALUES('B1','private-host-nonce');");
  db.exec(readFileSync(new URL('../migrations/20261116_payapp_accounts.sql', import.meta.url), 'utf8'));
  assert.deepEqual({ ...db.prepare('SELECT * FROM payapp_payments').get() }, { oid: 'O1', mul_no: '81001', nonce: 'private-nonce', merchant_userid: null });
  assert.deepEqual({ ...db.prepare('SELECT * FROM host_billing_pay').get() }, { ref: 'B1', nonce: 'private-host-nonce', merchant_userid: null });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM host_billing_pay_requests").get().n, 0);
});

test('실제 초기화 경로가 전환 전 데이터베이스를 업그레이드한 뒤 기존 계정 승인·취소 통보를 반영', async t => {
  const f = fixture({ legacy: true, preTransitionSchema: true }); mockPay(t);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('host_billing_pay') WHERE name='merchant_userid'").get().n, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('payapp_payments') WHERE name='merchant_userid'").get().n, 0);
  await ensureSchema(f.env);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('host_billing_pay') WHERE name='merchant_userid'").get().n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('payapp_payments') WHERE name='merchant_userid'").get().n, 1);
  assert.equal(f.pay().merchant_userid, null); assert.equal(f.pay().nonce, 'legacy-nonce');
  assert.equal((await f.request()).code, 'PAYMENT_ACCOUNT_TRANSITION_PENDING');
  assert.equal(await (await f.feedback(await f.form('legacy'))).text(), 'SUCCESS'); assert.equal(f.bill().status, 'paid');
  await ensureSchema(f.env);
  assert.equal(await (await f.feedback(await f.form('legacy', '64'))).text(), 'SUCCESS'); assert.equal(f.bill().status, 'refunded');
});
