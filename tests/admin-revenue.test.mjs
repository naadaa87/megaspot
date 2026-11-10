import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {preserveLegacyPayments} from '../functions/api/_settlement.js';

const first = 'megaspot-gundae', second = 'megaspot-gundae-2';
const event = '2026-11-20', stamp = '2026-11-03 15:00:00';
const range = 'revenue?from=2026-11-01&to=2026-11-30';
function setup(t) {
  const f = fixture({booking:true,date:event});
  t.after(() => f.db.close());
  return f;
}
function order(db, id, {product='pass-day-wdfri', status='paid', booking=null, inquiry=null, test=0, paidAt=stamp, price=100000}={}) {
  db.prepare(`INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,
    inquiry_ref,test,created_at,paid_at,updated_at) VALUES(?,?,?,?,?,'고객','01012345678','{}',?,?,?,?,?,?,?)`)
    .run(id,product,'온라인 주문',product.startsWith('addon-')?null:event,price,status,booking,inquiry,test,stamp,paidAt,'2026-11-08 01:00:00');
}
function addBooking(db, code, space, status='confirmed') {
  db.prepare(`INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,created_at)
    VALUES(?,?,'검증 고객','01012345678','5678',?,?,?)`).run(code,space,event,status,stamp);
}
function amounts(received, refunded, count) { return {count,received,refunded,net:received-refunded}; }

test('매출은 합산 입금 중 이용료만 해당 지점의 이용일에 집계한다', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-03T15:30:00Z')});
  const {db,api} = setup(t);
  const {settlement,deposit} = await api('bookings/BK-TEST/settlement');
  const result = await api('bookings/BK-TEST/settlement','POST',{
    kind:'receipt',combined:true,confirm_combined:true,amount:650000,deposit_amount:deposit.amount,
    deposit_revision:deposit.revision,expected_revision:settlement.revision,request_id:crypto.randomUUID()
  });
  assert.equal(result.combined_receipt.deposit,150000);
  db.prepare("UPDATE booking_refunds SET state='completed' WHERE booking_code='BK-TEST'").run();
  addBooking(db,'BK-SECOND',second);
  order(db,'SECOND',{product:'addon-cleaning',booking:'BK-SECOND',price:200000});
  order(db,'PARK',{product:'parking-batch',price:20000});
  order(db,'MISSING',{product:'addon-banner',price:40000});
  order(db,'PASS',{price:30000});
  order(db,'TEST',{test:1});
  order(db,'VERIFY',{product:'payapp-check-1000'});
  order(db,'UNPAID',{status:'pending'});

  const report = await api(range);
  assert.deepEqual(report.total,amounts(750000,0,4));
  assert.deepEqual(report.branches[first],amounts(530000,0,2));
  assert.deepEqual(report.branches[second],amounts(200000,0,1));
  assert.deepEqual(report.branches.unassigned,amounts(20000,0,1));
  assert.deepEqual(report.daily.map(d=>d.day),[event]);
  assert.ok(report.items.every(r=>r.day===event && r.recorded_day==='2026-11-04' && !('buyer_phone' in r)));
  assert.deepEqual((await api(range+'&space='+second)).items.map(r=>r.ref),['SECOND']);
  assert.equal((await api(range+'&day='+event)).detailCount,4);
  assert.deepEqual((await api('revenue?from=2026-11-04&to=2026-11-04')).total,amounts(0,0,0));
});

test('환불은 원래 이용일에 집계하고 정정·무효 및 보관 처리된 취소 내역을 반영한다', async t => {
  const {db,api} = setup(t);
  db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-TEST'").run();
  db.prepare("UPDATE inquiries SET status='삭제됨'").run();
  addBooking(db,'BK-REAL',second,'cancelled');
  order(db,'ARCHIVED',{booking:'BK-TEST',status:'refunded'});
  order(db,'REAL',{booking:'BK-REAL',status:'refunded'});
  order(db,'LEGACY',{status:'refunded',paidAt:null,price:60000});
  db.prepare('INSERT INTO payapp_refunds VALUES(?,?,?,?)').run('PARTIAL','REAL',20000,'2026-11-05 15:00:00');
  db.prepare('INSERT INTO payapp_refunds VALUES(?,?,?,?)').run('FINAL','REAL',80000,'2026-11-09 14:00:00');
  const entry = db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES(?,?,'receipt',?,?)");
  entry.run('BK-TEST','archived-fee',70000,stamp);
  const corrected = entry.run('BK-REAL','corrected-fee',50000,stamp).lastInsertRowid;
  const voided = entry.run('BK-REAL','voided-fee',40000,stamp).lastInsertRowid;
  const revision = db.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,reason,created_at)
    VALUES('BK-REAL',?,?,0,?,'receipt',?,'확인','2026-11-10 01:00:00')`);
  revision.run(corrected,'correct','correct',30000);
  revision.run(voided,'void','void',40000);
  db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-REAL','manual-refund','refund',10000,?)")
    .run('2026-11-09 16:00:00');
  const report = await api(range+'&day='+event);
  assert.deepEqual(report.total,amounts(190000,170000,7));
  assert.deepEqual(report.branches[second],amounts(130000,110000,5));
  assert.equal(report.detailCount,7);
  assert.deepEqual(report.daily.map(d=>[d.day,d.net]),[[event,20000]]);
  assert.deepEqual(report.items.filter(r=>r.kind==='refund').map(r=>[r.recorded_day,r.amount]),[
    ['2026-11-10',10000],['2026-11-09',80000],['2026-11-08',60000],['2026-11-06',20000]
  ]);
  assert.ok(report.items.find(r=>r.ref==='LEGACY' && r.kind==='refund').estimated);
  assert.equal((await api(range+'&day=2026-11-06')).detailCount,0);
});

test('이전 확정서 수납을 읽기 전용으로 집계하며 실제 이관 전후에 중복되지 않는다', async t => {
  const {db,api,env} = setup(t);
  db.prepare('UPDATE bookings SET confirm_doc=?').run(JSON.stringify({paid:180000,deposit:150000,updated_at:stamp}));
  order(db,'PG',{booking:'BK-TEST'});
  const before = await api(range);
  assert.deepEqual(before.total,amounts(180000,0,2));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM booking_payment_entries').get().n,0);
  await preserveLegacyPayments(env);
  assert.deepEqual((await api(range)).total,before.total);
});

test('페이지를 넘겨도 합계가 고정되고 관리자 인증과 조회 조건을 검증한다', async t => {
  const {db,api,handle,env} = setup(t);
  for (let i=0; i<52; i++) order(db,'PG-'+i,{price:1000});
  const [p1,p2] = await Promise.all([api(range),api(range+'&page=2')]);
  assert.equal(p1.items.length,50);
  assert.equal(p2.items.length,2);
  assert.equal(new Set([...p1.items,...p2.items].map(r=>r.ref)).size,52);
  assert.deepEqual(p1.total,p2.total);
  assert.equal(p2.detailCount,52);
  for (const query of [{day:'2026-12-01'},{space:'other'},{basis:'payment'},{basis:'other'},{page:'-1'},{from:'2026-02-30'},{from:'2025-11-28'}]) {
    await api('revenue?'+new URLSearchParams({from:'2026-11-01',to:'2026-11-30',...query}),'GET',undefined,400);
  }
  await api(range,'POST',undefined,405);
  const url = 'https://local.test/api/admin/'+range;
  assert.equal((await handle(new Request(url))).status,401);
  const authenticated = await handle(new Request(url,{headers:{'x-admin-key':env.ADMIN_KEY}}));
  assert.equal(authenticated.headers.get('cache-control'),'no-store');
});
