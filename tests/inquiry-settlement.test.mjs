import assert from 'node:assert/strict';
import test from 'node:test';
import S from '../assets/js/settlement.js';
import R from '../assets/js/admin-save-recovery.js';
import { DAY, fixture } from './helpers/admin-fixture.mjs';

const ledger = 'inquiries/MS-TEST/settlement';
const cumulative = 'reservation-payment-checks/inquiry/MS-TEST';
const confirmVenue = f => f.api('inquiries/MS-TEST/confirm', 'POST', {
  date: DAY, start_h: 10, end_h: 17, headcount: 30, amount: 500000,
});
const closeWith = (t, f) => { t.after(() => f.db.close()); return f; };

async function record(f, kind, amount, options = {}) {
  const view = await f.api(ledger);
  const payload = {
    kind, amount, note: S.manualPaymentNote('2026-11-23', '계좌이체', '실제 처리 완료'),
    expected_revision: view.settlement.revision, request_id: crypto.randomUUID(),
    ...options,
  };
  return f.api(ledger, 'POST', payload);
}

async function edit(f, id, action, patch = {}) {
  const view = await f.api(ledger);
  const current = view.entries.find(e => e.id === id);
  return f.api(ledger + '/entries/' + id, 'POST', {
    action, kind: current.kind, amount: current.amount, note: current.note,
    reason: '이체 내역 대조', entry_version: current.version,
    expected_revision: view.settlement.revision, request_id: crypto.randomUUID(),
    ...patch,
  });
}

function breakdown(s) {
  return [s.received, s.refunded, s.net, s.balance, s.refund_due];
}

for (const space of ['megaspot-gundae', 'food-only']) {
  test(space + ' · 수납·환불 정정, 취소, 복원과 원본 기록 보존', async t => {
    const f = closeWith(t, fixture({ space }));
    f.db.prepare('UPDATE inquiries SET data=json_set(data,?,?)')
      .run(space === 'food-only' ? '$.food_event.reservation_fee' : '$.reservation_fee', 200000);
    const before = await f.api(cumulative);
    await f.api(cumulative, 'PUT', {
      status: 'reservation_paid', received_total: 200000, receipt_note: '초기 예약금',
      expected_revision: before.payment_revision, expected_settlement_revision: before.settlement.revision,
      request_id: 'inquiry-initial-reservation-fee',
    });
    const original = f.db.prepare('SELECT * FROM booking_payment_entries').get();
    const notifications = f.db.prepare('SELECT COUNT(*) AS count FROM transaction_notifications').get().count;

    let result = await edit(f, original.id, 'correct', { amount: 240000 });
    assert.deepEqual(breakdown(result.settlement), [240000, 0, 240000, 210000, 0]);
    result = await record(f, 'refund', 30000);
    assert.deepEqual(breakdown(result.settlement), [240000, 30000, 210000, 240000, 0]);
    const refund = (await f.api(ledger)).entries.find(e => e.kind === 'refund');
    result = await edit(f, refund.id, 'correct', { amount: 55000 });
    assert.deepEqual(breakdown(result.settlement), [240000, 55000, 185000, 265000, 0]);
    assert.equal((await f.api(cumulative)).payment_status, 'partial_paid');
    result = await edit(f, refund.id, 'void');
    assert.deepEqual(breakdown(result.settlement), [240000, 0, 240000, 210000, 0]);
    result = await edit(f, refund.id, 'correct', { amount: 15000 });
    assert.deepEqual(breakdown(result.settlement), [240000, 15000, 225000, 225000, 0]);

    const view = await f.api(ledger);
    assert.equal(view.history.length, 4);
    assert.equal(view.entries.length, 2);
    assert.equal(view.entries.find(e => e.id === refund.id).original_amount, 30000);
    assert.deepEqual(f.db.prepare('SELECT * FROM booking_payment_entries WHERE id=?').get(original.id), original);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM transaction_notifications').get().count, notifications);
  });
}

test('페이앱은 읽기 전용이며 기존 온라인 환불과 수기 환불을 한 번만 합산한다', async t => {
  const f = closeWith(t, fixture());
  f.db.prepare(`INSERT INTO orders(oid,product_id,title,price,buyer_name,buyer_phone,inquiry_ref,event_date,data,status,test,created_at,paid_at)
    VALUES('PG-INQ','pass-day-wdfri','페이앱 예약금',200000,'검증','01012345678','MS-TEST',?,'{}','paid',0,datetime('now'),datetime('now'))`).run(DAY);
  f.db.prepare(`INSERT INTO payapp_refunds(oid,mul_no,amount,created_at) VALUES ('PG-INQ','PART-1',20000,datetime('now'))`).run();
  const before = await f.api(ledger);
  assert.equal(before.online[0].refunded, 20000);
  assert.equal(before.entries.length, 0);
  assert.deepEqual(breakdown(before.settlement), [200000, 20000, 180000, 270000, 0]);
  const saved = await record(f, 'refund', 50000);
  assert.deepEqual(breakdown(saved.settlement), [200000, 70000, 130000, 320000, 0]);
  const excessive = {
    kind: 'refund', amount: 130001, request_id: 'refund-above-net-value',
    expected_revision: saved.settlement.revision,
  };
  await f.api(ledger, 'POST', excessive, 400);
  assert.equal((await f.api(ledger)).online[0].refunded, 20000);
});

test('예약 확정 전 완료한 환불과 정정 이력이 예약 원장으로 옮겨지고 재시도해도 한 건으로 남는다', async t => {
  const f = closeWith(t, fixture());
  await record(f, 'receipt', 200000);
  const view = await f.api(ledger);
  const original = view.entries[0];
  await edit(f, original.id, 'correct', { amount: 240000 });

  const body = {
    kind: 'refund', amount: 24000, note: '완료한 입금 일부 반환', request_id: 'refund-before-confirm',
    expected_revision: (await f.api(ledger)).settlement.revision,
  };
  const store = new Map();
  const storage = { getItem: k => store.get(k), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  let responded = false;
  const api = async (path, opts) => {
    const result = await f.api(path.slice(1), opts.method, opts.body);
    if (!responded) { responded = true; throw new TypeError('response lost'); }
    return result;
  };
  await assert.rejects(R.create({ storage, api }).submit('inquiry-payment', 'MS-TEST', '/' + ledger, body),
    e => e.code === 'SAVE_UNCONFIRMED');
  const created = await confirmVenue(f);
  const recovery = R.create({ storage, api });
  assert.deepEqual(recovery.current().body, body);
  const retry = await recovery.retry();
  assert.equal(retry.duplicate, true);
  assert.equal(retry.booking_code, created.booking_code);
  assert.equal(recovery.current(), null);

  const after = await f.api('bookings/' + created.booking_code + '/settlement');
  assert.equal(after.entries.length, 2);
  assert.equal(after.entries.find(e => e.kind === 'receipt').id, original.id);
  assert.equal(after.history[0].entry_id, original.id);
  assert.deepEqual(breakdown(after.settlement), [240000, 24000, 216000, 284000, 0]);
  assert.equal((await f.api(ledger)).booking_code, created.booking_code);
  assert.equal((await f.api(ledger, 'POST', { ...body, request_id: 'new-inquiry-refund-after-confirm' }, 409)).code, 'PAYMENT_CHANGED');
  assert.equal((await f.api(ledger, 'POST', { ...body, amount: 30000 }, 409)).code, 'PAYMENT_CONFLICT');
});

test('같은 문의에 대한 동시 저장은 늦은 변경을 막고, 확정이 먼저 완료하면 이전 문의 수정을 막는다', async t => {
  const f = closeWith(t, fixture());
  await record(f, 'receipt', 200000);
  const loaded = await f.api(ledger);
  const run = f.env.DB.batch.bind(f.env.DB);
  const requests = [];
  f.env.DB.batch = ss => new Promise((resolve, reject) => {
    requests.push({ ss, resolve, reject });
    if (requests.length !== 2) return;
    f.env.DB.batch = run;
    (async () => {
      for (const request of requests) request.resolve(await run(request.ss));
    })().catch(e => requests.forEach(request => request.reject(e)));
  });
  const base = { kind: 'refund', amount: 20000, expected_revision: loaded.settlement.revision };
  await Promise.all([
    f.api(ledger, 'POST', { ...base, request_id: 'parallel-refund-first' }),
    f.api(ledger, 'POST', { ...base, request_id: 'parallel-refund-later' }, 409),
  ]);
  assert.equal((await f.api(ledger)).settlement.refunded, 20000);

  const before = await f.api(ledger);
  let reached, release;
  const requestStarted = new Promise(r => { reached = r; });
  f.env.DB.batch = ss => {
    f.env.DB.batch = run;
    reached();
    return new Promise((resolve, reject) => { release = () => run(ss).then(resolve, reject); });
  };
  const refund = f.api(ledger, 'POST', {
    ...base, expected_revision: before.settlement.revision, request_id: 'inquiry-race-confirmation',
  }, 409);
  await requestStarted;
  const created = await confirmVenue(f);
  await release();
  assert.equal((await refund).code, 'PAYMENT_CHANGED');
  assert.equal((await f.api('bookings/' + created.booking_code + '/settlement')).settlement.refunded, 20000);
});

test('취소된 미확정 문의는 완료 환불을 등록하고 이미 기록한 수납은 정정할 수 있다', async t => {
  const f = closeWith(t, fixture());
  const saved = await record(f, 'receipt', 200000);
  f.db.prepare("UPDATE inquiries SET status='대기 취소'").run();
  const view = await f.api(ledger);
  assert.equal(view.refund_only, true);
  assert.equal(view.settlement.balance, null);
  assert.equal(view.settlement.refund_due, null);
  const rejected = await f.api(ledger, 'POST', {
    kind: 'receipt', amount: 20000, expected_revision: view.settlement.revision, request_id: 'invalid-fresh-receipt',
  }, 400);
  assert.match(rejected.error, /취소/);
  assert.notEqual(view.settlement.revision, saved.settlement.revision);
  const refund = await record(f, 'refund', 30000);
  assert.equal(refund.settlement.refunded, 30000);
  const id = view.entries[0].id;
  assert.equal((await edit(f, id, 'correct', { amount: 150000 })).settlement.net, 120000);
});

test('확정 전 정정의 감사 이력이 저장되지 않으면 정산과 원본도 이전 상태를 유지한다', async t => {
  const f = closeWith(t, fixture());
  await record(f, 'receipt', 200000);
  const previous = await f.api(ledger);
  const entry = previous.entries[0];
  const payload = {
    action: 'correct', kind: 'receipt', amount: 150000, note: entry.note,
    entry_version: entry.version, expected_revision: previous.settlement.revision,
    reason: '원본 이체 대조', request_id: 'inquiry-history-rollback',
  };
  f.db.exec(`CREATE TRIGGER reject_inquiry_audit BEFORE INSERT ON event_log
    WHEN NEW.kind='inquiry.payment.correct' BEGIN SELECT RAISE(ABORT, 'qa inquiry audit failure'); END`);
  await f.api(ledger + '/entries/' + entry.id, 'POST', payload, 500);
  assert.deepEqual(await f.api(ledger), previous);
  f.db.exec('DROP TRIGGER reject_inquiry_audit');
  const saved = await f.api(ledger + '/entries/' + entry.id, 'POST', payload);
  assert.equal(saved.settlement.received, 150000);
  assert.equal((await f.api(ledger)).history.length, 1);
});

test('같은 요청번호를 수납과 정정에 겹쳐 쓰거나 잘못된 요청을 보내도 지급 기록을 변경하지 않는다', async t => {
  const f = closeWith(t, fixture());
  const request_id = 'inquiry-journal-request';
  await record(f, 'receipt', 200000, { request_id });
  const before = await f.api(ledger);
  const entry = before.entries[0];
  const conflict = await f.api(ledger + '/entries/' + entry.id, 'POST', {
    kind: 'receipt', amount: 190000, action: 'correct', note: '', reason: '입금 대조', request_id,
    entry_version: entry.version, expected_revision: before.settlement.revision,
  }, 409);
  assert.equal(conflict.code, 'PAYMENT_CONFLICT');
  await f.api(ledger, 'POST', { kind: 'refund', amount: 1000, action: 'void', request_id }, 400);
  await f.api(ledger, 'POST', null, 400);
  assert.deepEqual(await f.api(ledger), before);
});
