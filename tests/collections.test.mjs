// 관리자 '수납 관리' (2026-11-26)
//  · 이용일 20~16일 전 = 사전고지, 15일 전~당일 = 완납 확인, 지난 이용 = 이용 후 미수, 금액 없음 = 금액 미정
//  · 예외(현장·당일 결제, 별도 협의)는 독촉 목록에서 빠지고 비고가 남는다
//  · 예약·수납 원장은 읽기만 한다 — 새 표 두 개에만 쓴다
//   node --test tests/collections.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/admin-fixture.mjs';
import { kstToday } from '../functions/api/_lib.js';
import { bucketOf, dday } from '../functions/api/_collections.js';

function seed(f) {
  const add = (code, offset, amount, status = 'confirmed', space = 'megaspot-gundae') => f.db.prepare('INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(code, space, '고객 ' + code, '010-1111-' + String(1000 + offset + 100).slice(-4), '0000', kstToday(offset), 40, status, amount, 10, 16, kstToday(-30));
  const pay = (code, amount) => f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES(?,?,'receipt',?,'',?)").run(code, 'r-' + code, amount, kstToday(-1));
  add('BK-D18', 18, 600000); pay('BK-D18', 100000);
  add('BK-D16', 16, 300000);
  add('BK-D15', 15, 400000);
  add('BK-D10', 10, 500000); pay('BK-D10', 500000);
  add('BK-D3', 3, 700000); pay('BK-D3', 200000);
  f.db.prepare('INSERT INTO booking_payment_schedule(booking_code,due_date,updated_at) VALUES(?,?,?)').run('BK-D3', kstToday(-2), kstToday(-3));
  add('BK-D0', 0, 200000);
  add('BK-EX', 12, 900000);
  add('BK-PAST', -5, 350000, 'completed'); pay('BK-PAST', 50000);
  add('BK-OLD', -90, 350000, 'completed');
  add('BK-D25', 25, 500000);
  add('BK-D21', 21, 500000);
  add('BK-NULL', 14, null);
  add('BK-CXL', 9, 500000, 'cancelled');
}

test('묶음 규칙: 20~16일 전 사전고지, 15일 전~당일 완납 확인', () => {
  assert.equal(bucketOf({ d: 20, balance: 1, amount: 1 }), 'notice');
  assert.equal(bucketOf({ d: 16, balance: 1, amount: 1 }), 'notice');
  assert.equal(bucketOf({ d: 15, balance: 1, amount: 1 }), 'due');
  assert.equal(bucketOf({ d: 0, balance: 1, amount: 1 }), 'due');
  assert.equal(bucketOf({ d: -1, balance: 1, amount: 1 }), 'past');
  assert.equal(bucketOf({ d: 21, balance: 1, amount: 1 }), 'later');
  assert.equal(bucketOf({ d: 5, balance: 0, amount: 1 }), 'paid');
  assert.equal(bucketOf({ d: 5, balance: 1, amount: 1, exception: true }), 'exception');
  assert.equal(bucketOf({ d: 5, balance: null, amount: null }), 'unpriced');
  assert.equal(dday('2026-12-11', '2026-11-26'), 15);
});

test('수납 관리 목록: 남은 금액·납부 기한·기한 지남을 계산하고 기존 원장은 그대로', async () => {
  const f = fixture({ booking: true }); seed(f);
  const before = ['bookings', 'booking_payment_entries', 'booking_payment_schedule', 'inquiries'].map(t => f.db.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all());
  const r = await f.api('collections');
  const by = Object.fromEntries(r.items.map(x => [x.code, x]));
  assert.equal(by['BK-TEST'].bucket, 'notice'); assert.equal(by['BK-TEST'].d, 20);
  assert.equal(by['BK-D18'].bucket, 'notice'); assert.equal(by['BK-D18'].balance, 500000); assert.equal(by['BK-D18'].received, 100000);
  assert.equal(by['BK-D18'].due_date, kstToday(3), '기본 잔금 기한은 이용일 15일 전');
  assert.equal(by['BK-D16'].bucket, 'notice');
  assert.equal(by['BK-D15'].bucket, 'due'); assert.equal(by['BK-D15'].due_today, true); assert.equal(by['BK-D15'].overdue, false);
  assert.equal(by['BK-D10'].bucket, 'paid');
  assert.equal(by['BK-D3'].bucket, 'due'); assert.equal(by['BK-D3'].due_custom, true); assert.equal(by['BK-D3'].overdue, true); assert.equal(by['BK-D3'].balance, 500000);
  assert.equal(by['BK-D0'].bucket, 'due'); assert.equal(by['BK-D0'].d, 0);
  assert.equal(by['BK-PAST'].bucket, 'past'); assert.equal(by['BK-PAST'].balance, 300000);
  assert.equal(by['BK-NULL'].bucket, 'unpriced');
  for (const c of ['BK-OLD', 'BK-D25', 'BK-D21', 'BK-CXL']) assert.equal(by[c], undefined, c + ' 은 목록에 없음');
  assert.equal(r.counts.notice, 3); assert.equal(r.counts.due, 4); assert.equal(r.counts.overdue, 1);
  assert.equal(r.counts.notice_todo, 3); assert.equal(r.counts.todo, 4 + 3 + 1 + 1);
  assert.equal(r.totals.due, 400000 + 900000 + 500000 + 200000);
  assert.match(r.bank.account, /\d/);
  assert.deepEqual(['bookings', 'booking_payment_entries', 'booking_payment_schedule', 'inquiries'].map(t => f.db.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all()), before, '예약·수납 원장은 그대로');
});

test('예외 표시와 연락 기록: 독촉 목록에서 빠지고 비고·이력이 남는다', async () => {
  const f = fixture({ booking: true }); seed(f);
  const entries = f.db.prepare('SELECT * FROM booking_payment_entries').all(), books = f.db.prepare('SELECT * FROM bookings').all();
  await f.api('collections/BK-EX/exception', 'POST', { exception: true, type: 'other', note: '' }, 400);
  await f.api('collections/BK-EX/exception', 'POST', { exception: true, type: 'onsite', note: '행사 당일 현장 카드 결제', balance: 900000 });
  let r = await f.api('collections'), x = r.items.find(i => i.code === 'BK-EX');
  assert.equal(x.bucket, 'exception'); assert.equal(x.exception.type_label, '현장 결제'); assert.equal(x.exception.note, '행사 당일 현장 카드 결제');
  assert.equal(r.counts.exception, 1); assert.equal(r.counts.due, 3);
  // 연락 기록
  await f.api('collections/BK-TEST/logs', 'POST', { kind: 'notice', channel: 'kakao', memo: '사전고지', balance: 500000 });
  await f.api('collections/BK-D15/logs', 'POST', { kind: 'request', channel: 'sms' });
  await f.api('collections/BK-D15/logs', 'POST', { kind: 'memo', memo: '' }, 400);
  await f.api('collections/BK-D15/logs', 'POST', { kind: 'exception' }, 400);
  await f.api('collections/BK-NONE/logs', 'POST', { kind: 'memo', memo: '없음' }, 404);
  r = await f.api('collections');
  const t = r.items.find(i => i.code === 'BK-TEST'), d15 = r.items.find(i => i.code === 'BK-D15');
  assert.equal(t.last_notice.channel_label, '카카오톡'); assert.equal(r.counts.notice_todo, 2);
  assert.equal(d15.last_request.channel, 'sms');
  // 예외 해제: 다시 완납 확인 묶음으로, 이력은 남음
  await f.api('collections/BK-EX/exception', 'POST', { exception: false, note: '법인 결제로 바뀜' });
  r = await f.api('collections'); x = r.items.find(i => i.code === 'BK-EX');
  assert.equal(x.bucket, 'due'); assert.equal(x.exception, null); assert.equal(x.note, '법인 결제로 바뀜');
  assert.deepEqual(x.history.map(h => h.kind), ['exception', 'exception']);
  assert.deepEqual(f.db.prepare('SELECT * FROM booking_payment_entries').all(), entries, '입금 원장은 그대로');
  assert.deepEqual(f.db.prepare('SELECT * FROM bookings').all(), books, '예약은 그대로');
});

test('관리자 화면 연결: 메뉴·스크립트·표 정의', () => {
  const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
  const nav = readFileSync(new URL('../assets/js/pages/admin-navigation.js', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../assets/js/pages/admin-collections.js', import.meta.url), 'utf8');
  assert.ok(html.indexOf('admin-collections.js') > 0 && html.indexOf('admin-collections.js') < html.indexOf('admin-navigation.js'));
  assert.match(html, /admin-collections\.css\?v=[0-9a-f]{12}/);
  assert.match(nav, /\['collections','수납 관리'\]/);
  assert.match(js, /X\.register\('collections',load\)/);
  assert.match(js, /data-settlement-code=/, '입금 기록은 기존 수납·정산 창으로');
  for (const t of ['booking_collection_marks', 'booking_collection_logs']) {
    assert.match(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'), new RegExp('CREATE TABLE IF NOT EXISTS ' + t));
    assert.match(readFileSync(new URL('../functions/api/_schema.js', import.meta.url), 'utf8'), new RegExp(t));
    assert.match(readFileSync(new URL('../functions/api/_lib.js', import.meta.url), 'utf8'), new RegExp("'" + t + "'"));
  }
});
