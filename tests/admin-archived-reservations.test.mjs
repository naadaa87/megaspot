import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';

test('archiving a cancelled inquiry removes it and its cancelled booking from operations but preserves history', async t => {
  const f = fixture({booking:true});
  t.after(() => f.db.close());
  const {api, db} = f;
  db.prepare("UPDATE inquiries SET status='취소·환불' WHERE ref='MS-TEST'").run();
  db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-TEST'").run();
  db.prepare(`INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,created_at)
    SELECT 'BK-OTHER',space_id,customer_name,phone,phone_last4,date,status,created_at
    FROM bookings WHERE booking_code='BK-TEST'`).run();

  const before = await api('dashboard');
  for (const path of ['bookings', 'reservations']) {
    assert.equal((await api(path)).items.length, 2);
  }
  const archived = await api('inquiries/delete','POST',{refs:['MS-TEST']});
  assert.deepEqual(archived.deleted,['MS-TEST']);
  assert.equal((await api('inquiries')).items.length,0);
  assert.equal((await api('dashboard')).month.inquiries,before.month.inquiries-1);
  assert.equal((await api('channels')).total,0);
  assert.deepEqual((await api('bookings')).items.map(b=>b.booking_code),['BK-OTHER']);
  assert.deepEqual((await api('reservations')).items.map(b=>b.code),['BK-OTHER']);

  const detail = await api('inquiries/MS-TEST');
  assert.equal(detail.item.status,'삭제됨');
  assert.equal(detail.item.data.deleted_from,'취소·환불');
  assert.equal(detail.bookings[0].booking_code,'BK-TEST');
  assert.equal(detail.bookings[0].status,'cancelled');
  assert.equal((await api('bookings/BK-TEST/cancellation')).booking.status,'cancelled');
});
