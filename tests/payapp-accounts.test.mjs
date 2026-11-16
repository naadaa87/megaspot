import test from 'node:test';
import assert from 'node:assert/strict';
import { payappConfig, payappFeedbackConfig, payappMerchantMatches, validFeedback, kstStamp } from '../functions/api/_payapp.js';
import { sha256 } from '../functions/api/_lib.js';

function fixture() {
  return {
    PAYAPP_USERID: 'legacy-seller', PAYAPP_LINKKEY: 'legacy-link',
    PAYAPP_LINKVAL: 'legacy-value', PAYAPP_REQUESTKEY: 'legacy-request',
    PAYAPP_JIYU_USERID: 'jiyu-seller', PAYAPP_JIYU_LINKKEY: 'jiyu-link',
    PAYAPP_JIYU_LINKVAL: 'jiyu-value', PAYAPP_JIYU_REQUESTKEY: 'jiyu-request'
  };
}
async function feedback(C) {
  const responsedate = kstStamp();
  return { userid: C.userid, linkkey: C.linkkey, linkval: C.linkval, responsedate,
    hash: await sha256(C.userid + responsedate + C.requestkey) };
}

test('계정 선택이 없으면 기존 legacy 설정과 결제를 유지한다', () => {
  const env = fixture(), C = payappConfig(env);
  assert.equal(C.account, 'legacy'); assert.equal(C.configured, true); assert.equal(C.live, true);
  assert.equal(C.userid, env.PAYAPP_USERID); assert.equal(C.requestkey, env.PAYAPP_REQUESTKEY);
  env.PAYAPP_ENABLED = '0'; assert.equal(payappConfig(env).live, false);
});

test('jiyu 선택은 지유 계정의 네 값을 함께 사용하고 legacy 키를 섞지 않는다', () => {
  const env = { ...fixture(), PAYAPP_ACTIVE_ACCOUNT: 'jiyu' }, C = payappConfig(env);
  assert.equal(C.account, 'jiyu'); assert.equal(C.configured, true); assert.equal(C.live, true);
  for (const key of ['userid', 'linkkey', 'linkval', 'requestkey']) {
    assert.equal(C[key], env['PAYAPP_JIYU_' + key.toUpperCase()]);
    assert.notEqual(C[key], env['PAYAPP_' + key.toUpperCase()]);
  }
});

test('선택된 지유 설정이 불완전하면 기존 계정으로 대신 결제하지 않는다', () => {
  for (const missing of ['USERID', 'LINKKEY', 'LINKVAL', 'REQUESTKEY']) {
    const env = { ...fixture(), PAYAPP_ACTIVE_ACCOUNT: 'jiyu' };
    delete env['PAYAPP_JIYU_' + missing];
    const C = payappConfig(env);
    assert.equal(C.account, 'jiyu'); assert.equal(C.configured, false); assert.equal(C.live, false);
    assert.notEqual(C.userid, env.PAYAPP_USERID);
    assert.equal(payappFeedbackConfig(env, { userid: env.PAYAPP_JIYU_USERID }), null);
  }
});

test('알 수 없거나 잘못된 계정 선택은 키가 모두 있어도 결제를 끈다', () => {
  for (const selection of ['unknown', '', 'constructor', 'toString', 1, {}]) {
    const C = payappConfig({ ...fixture(), PAYAPP_ACTIVE_ACCOUNT: selection });
    assert.equal(C.configured, false); assert.equal(C.live, false); assert.equal(C.userid, '');
  }
});

test('결제가 꺼져 있거나 다른 계정이 활성화되어도 두 판매자의 통보를 원래 키로 검증한다', async () => {
  const env = { ...fixture(), PAYAPP_ENABLED: '0', PAYAPP_ACTIVE_ACCOUNT: 'jiyu' };
  for (const account of ['legacy', 'jiyu']) {
    const original = payappConfig({ ...env, PAYAPP_ACTIVE_ACCOUNT: account }), f = await feedback(original);
    const C = payappFeedbackConfig(env, f);
    assert.equal(C.account, account); assert.equal(C.configured, true); assert.equal(C.live, false);
    assert.equal(await validFeedback(C, f), true);
    assert.equal(await validFeedback(C, { ...f, linkkey: 'wrong-link' }), false);
  }
  env.PAYAPP_ACTIVE_ACCOUNT = 'unknown';
  assert.equal(payappFeedbackConfig(env, { userid: env.PAYAPP_USERID }).account, 'legacy');
});

test('등록되지 않은 판매자와 불완전한 통보 계정은 해석하지 않는다', () => {
  const env = fixture();
  for (const f of [null, {}, { userid: '' }, { userid: 'unknown' }, { userid: ' legacy-seller ' }, { userid: 1 }])
    assert.equal(payappFeedbackConfig(env, f), null);
  delete env.PAYAPP_LINKKEY;
  assert.equal(payappFeedbackConfig(env, { userid: env.PAYAPP_USERID }), null);
  assert.equal(payappFeedbackConfig(env, { userid: env.PAYAPP_JIYU_USERID }).account, 'jiyu');
});

test('두 계정에 같은 판매자 ID를 넣으면 모호한 통보를 거부한다', () => {
  const env = fixture(); env.PAYAPP_JIYU_USERID = env.PAYAPP_USERID;
  assert.equal(payappConfig(env).live, false);
  assert.equal(payappConfig({...env,PAYAPP_ACTIVE_ACCOUNT:'jiyu'}).live, false);
  assert.equal(payappFeedbackConfig(env, { userid: env.PAYAPP_USERID }), null);
  delete env.PAYAPP_JIYU_REQUESTKEY;
  assert.equal(payappFeedbackConfig(env, { userid: env.PAYAPP_USERID }), null);
});

test('구계정의 네 비밀값을 유지하지 않으면 새 계정으로 신규 결제를 시작하지 않는다', () => {
  for (const field of ['USERID','LINKKEY','LINKVAL','REQUESTKEY']) {
    const env={...fixture(),PAYAPP_ACTIVE_ACCOUNT:'jiyu'};delete env['PAYAPP_'+field];
    assert.equal(payappConfig(env).configured,false);assert.equal(payappConfig(env).live,false);
    // 이미 존재하는 신계정 거래의 통보는 신규 결제 가능 여부와 독립적으로 처리합니다.
    assert.equal(payappFeedbackConfig(env,{userid:env.PAYAPP_JIYU_USERID}).account,'jiyu');
  }
});

test('다른 계정의 서명된 통보도 저장된 판매자와 맞지 않으면 주문에 연결하지 않는다', () => {
  const env = fixture(), legacy = payappConfig(env), jiyu = payappConfig({ ...env, PAYAPP_ACTIVE_ACCOUNT: 'jiyu' });
  assert.equal(payappMerchantMatches(env, legacy.userid, legacy), true);
  assert.equal(payappMerchantMatches(env, jiyu.userid, jiyu), true);
  assert.equal(payappMerchantMatches(env, legacy.userid, jiyu), false);
  assert.equal(payappMerchantMatches(env, jiyu.userid, legacy), false);
  assert.equal(payappMerchantMatches(env, ' ' + legacy.userid, legacy), false);
  assert.equal(payappMerchantMatches(env, 1, legacy), false);
  assert.equal(payappMerchantMatches(env, legacy.userid, null), false);
});

test('판매자 미저장 과거 행은 활성 계정과 무관하게 legacy에만 귀속된다', () => {
  const env = { ...fixture(), PAYAPP_ACTIVE_ACCOUNT: 'jiyu' };
  const legacy = payappFeedbackConfig(env, { userid: env.PAYAPP_USERID }), jiyu = payappConfig(env);
  for (const stored of [null, undefined, '']) {
    assert.equal(payappMerchantMatches(env, stored, legacy), true);
    assert.equal(payappMerchantMatches(env, stored, jiyu), false);
  }
  delete env.PAYAPP_USERID;
  assert.equal(payappMerchantMatches(env, null, jiyu), false);
});
