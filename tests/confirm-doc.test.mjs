// 예약확정서 발급·고객 조회 점검 (Node 22.13+ · node:sqlite): node --test tests/confirm-doc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/admin/[[path]].js';
import { onRequestGet, onRequestPost } from '../functions/api/confirm.js';
import { cleanDoc, maskPhone, confirmToken } from '../functions/api/_confirm.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO bookings (booking_code,space_id,customer_name,phone,phone_last4,date,slot,headcount,status,amount,start_h,end_h,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('MS-2611-TEST', 'megaspot-gundae', '김민지', '010-2345-6789', '6789', '2026-11-14', 'custom', 80, 'confirmed', 1340000, 13, 19, '2026-10-22 10:00:00');
  const env = { ADMIN_KEY: 'test-only', DB: { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  async function admin(path, method = 'GET', body) {
    const res = await onRequest({ env, params: { path: path.split('/') }, request: new Request('https://megaspot.test/api/admin/' + path, {
      method, headers: { 'x-admin-key': 'test-only', origin: 'https://megaspot.test', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    return { status: res.status, json: await res.json() };
  }
  async function pub(q, body) {
    const req = new Request('https://megaspot.test/api/confirm' + (q || ''), body ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {});
    const res = body ? await onRequestPost({ request: req, env }) : await onRequestGet({ request: req, env });
    return { status: res.status, json: await res.json() };
  }
  return { db, env, admin, pub };
}

test('설정값 정리: 모르는 결제 상태·빈 줄·범위 밖 환불 비율', () => {
  const d = cleanDoc({ pay_status: 'x', items: ['a', '', ' b '], refund: [{ k: '당일', rate: 3 }], amount: '-1', evil: 1 });
  assert.equal(d.pay_status, 'paid'); assert.deepEqual(d.items, ['a', 'b']); assert.equal(d.refund[0].rate, 1); assert.equal(d.amount, null); assert.equal(d.evil, undefined);
  assert.equal(maskPhone('010-2345-6789'), '010-****-6789');
});

test('발급 전에는 고객 화면에서 열리지 않고, 발급 뒤에는 링크·예약번호+뒷자리로 열림', async () => {
  const { admin, pub, env } = fixture();
  let r = await admin('bookings/MS-2611-TEST/confirm-doc');
  assert.equal(r.status, 200); assert.equal(r.json.doc, null); assert.equal(r.json.booking.amount, 1340000);
  const k = await confirmToken(env, 'MS-2611-TEST'); assert.equal(r.json.token, k);
  assert.equal((await pub('?c=MS-2611-TEST&k=' + k)).json.code, 'NOT_ISSUED');
  r = await admin('bookings/MS-2611-TEST/confirm-doc', 'PUT', { doc: { customer: '김민지 (성수 러닝크루)', amount: 1340000, items: ['공간 전체 대관 6시간'] } });
  assert.equal(r.status, 200); assert.ok(r.json.doc.issued_at); assert.equal(r.json.link, 'https://megaspot.test/confirm/?c=MS-2611-TEST&k=' + k);
  r = await pub('?c=MS-2611-TEST&k=' + k);
  assert.equal(r.status, 200); assert.equal(r.json.doc.phone, '010-****-6789'); assert.ok(!JSON.stringify(r.json).includes('2345-6789'));
  assert.equal((await pub('?c=MS-2611-TEST&k=wrong')).status, 403);
  assert.equal((await pub('', { booking_code: 'ms-2611-test', phone_last4: '6789' })).json.doc.customer, '김민지 (성수 러닝크루)');
  assert.equal((await pub('', { booking_code: 'MS-2611-TEST', phone_last4: '0000' })).status, 404);
});

test('다시 저장해도 처음 발급일은 그대로, 취소된 예약은 열람·발급 불가', async () => {
  const { admin, pub, db, env } = fixture();
  const first = (await admin('bookings/MS-2611-TEST/confirm-doc', 'PUT', { doc: {} })).json.doc;
  const second = (await admin('bookings/MS-2611-TEST/confirm-doc', 'PUT', { doc: { show_amount: false } })).json.doc;
  assert.equal(second.issued_at, first.issued_at); assert.equal(second.issue_no, 2); assert.equal(second.show_amount, false);
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE booking_code = ?").run('MS-2611-TEST');
  assert.equal((await pub('?c=MS-2611-TEST&k=' + await confirmToken(env, 'MS-2611-TEST'))).status, 410);
  assert.equal((await admin('bookings/MS-2611-TEST/confirm-doc', 'PUT', { doc: {} })).status, 409);
});
