import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import S from '../assets/js/settlement.js';
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

test('입금 확인 전 예정 예약은 지점별로 표시하고 수납을 기록하면 이용월에만 집계한다', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-31T14:00:00Z')});
  const {db,api} = setup(t);
  addBooking(db,'BK-SECOND',second);
  addBooking(db,'BK-PAST',first);
  addBooking(db,'BK-CANCELLED',first,'cancelled');
  addBooking(db,'BK-FREE',first);
  addBooking(db,'BK-ONLINE',first);
  addBooking(db,'BK-LEGACY',first);
  db.prepare("UPDATE bookings SET date='2026-10-30',amount=100000 WHERE booking_code='BK-PAST'").run();
  db.prepare("UPDATE bookings SET amount=0 WHERE booking_code='BK-FREE'").run();
  db.prepare("UPDATE bookings SET confirm_doc=json_object('paid',10000,'updated_at',?) WHERE booking_code='BK-LEGACY'").run(stamp);
  order(db,'CHECKOUT-WAIT',{booking:'BK-TEST',status:'pending'});
  order(db,'ONLINE',{booking:'BK-ONLINE'});

  const before = await api(range);
  assert.deepEqual(before.upcoming.map(r=>[r.booking_code,r.branch,r.amount]),[
    ['BK-SECOND',second,null],['BK-TEST',first,500000]
  ]);
  assert.deepEqual(before.total,amounts(110000,0,2));
  assert.deepEqual((await api(range+'&space='+second)).upcoming.map(r=>r.booking_code),['BK-SECOND']);
  assert.equal((await api('revenue?from=2026-10-01&to=2026-10-31')).upcoming.length,0);

  const {settlement} = await api('bookings/BK-TEST/settlement');
  await api('bookings/BK-TEST/settlement','POST',{
    kind:'receipt',amount:200000,expected_revision:settlement.revision,request_id:crypto.randomUUID()
  });
  const after = await api(range);
  assert.deepEqual(after.upcoming.map(r=>r.booking_code),['BK-SECOND']);
  assert.deepEqual(after.total,amounts(310000,0,3));
  const receipt = after.items.find(r=>r.booking_code==='BK-TEST');
  assert.deepEqual([receipt.day,receipt.recorded_day,receipt.amount],[event,'2026-10-31',200000]);
  assert.deepEqual((await api('revenue?from=2026-10-01&to=2026-10-31')).total,amounts(0,0,0));
});


test('식음료 단독 수납 계좌와 처리 수단을 분류하고 실제 처리일로 조회한다', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-23T16:00:00Z')});
  const {db,api}=fixture({booking:true,date:event,space:'food-only'});
  t.after(()=>db.close());
  addBooking(db,'BK-VENUE',first);
  order(db,'PARK-TEST',{product:'parking-batch',price:1000});
  const url='bookings/BK-TEST/settlement';
  const save=async(kind,amount,note)=>{
    const {settlement}=await api(url);
    await api(url,'POST',{kind,amount,note,expected_revision:settlement.revision,request_id:crypto.randomUUID()});
  };
  await save('receipt',100000,S.describeManualPayment(S.manualPaymentNote('2026-10-31','계좌이체','입금 메모','bank_corporate'),'예약금'));
  await save('receipt',30000,S.manualPaymentNote('2026-11-02','현금',''));
  await save('receipt',20000,'메모만 남은 이전 기록');
  await save('refund',10000,S.manualPaymentNote('2026-11-05','계좌이체','','personal'));
  await save('receipt',40000,S.manualPaymentNote('2026-11-06','계좌이체','','blank'));
  await save('receipt',50000,S.manualPaymentNote('2026-11-07','계좌이체','','jiyu'));

  const day='revenue?from=2026-10-31&to=2026-10-31&space=food-only';
  const venueDate=await api(range+'&space=food-only');
  assert.equal(venueDate.basis,'event');
  assert.deepEqual(venueDate.total,amounts(240000,10000,6));
  assert.equal(venueDate.bookingSummary.booked,500000);
  assert.equal(venueDate.bookingSummary.netReceived,230000);
  assert.equal(venueDate.bookingSummary.balance,270000);
  assert.deepEqual((await api(range)).branches['food-only'],venueDate.total);
  assert.equal((await api(range+'&space=unassigned')).bookingSummary.bookingCount,0);
  assert.equal((await api(range+'&space=unassigned')).total.received,1000);
  assert.deepEqual((await api(range.replace('revenue?','revenue/bookings?')+'&space=food-only')).items.map(r=>r.booking_code),['BK-TEST']);

  const processed=await api(day+'&basis=processed');
  assert.equal(processed.basis,'processed');
  assert.deepEqual(processed.total,amounts(100000,0,1));
  const [receipt]=processed.items;
  assert.deepEqual([receipt.branch,receipt.day,receipt.event_date,receipt.recorded_day,receipt.processing_estimated],
    ['food-only','2026-10-31',event,'2026-11-24',0]);
  assert.deepEqual([receipt.channel,receipt.account,receipt.method],['bank_corporate','법인계좌','계좌이체']);
  assert.equal('note' in receipt,false);
  assert.equal(processed.bookingSummary.bookingCount,0);
  assert.deepEqual((await api(day)).total,amounts(0,0,0));

  const cash=await api(range+'&basis=processed&space=food-only&method='+encodeURIComponent('현금'));
  assert.deepEqual(cash.total,amounts(30000,0,1));
  assert.equal(cash.items[0].channel,'unknown');
  assert.equal(cash.bookingSummary.bookingCount,1);
  const personal=await api(range+'&basis=processed&space=food-only&channel=bank_personal');
  assert.deepEqual(personal.total,amounts(0,10000,1));
  assert.equal(personal.items[0].day,'2026-11-05');
  assert.equal(personal.items[0].account,'최준원개인');
  const corporate=(await api(range+'&channel=bank_corporate&space=food-only')).channels.find(channel=>channel.id==='bank_corporate');
  assert.deepEqual(corporate.accounts.map(a=>[a.account,a.received]).sort(),[
    ['법인계좌',100000],['블랭크',40000],['지유공간개발',50000]
  ]);
  const fallback=(await api(range+'&basis=processed&space=food-only')).items.find(r=>r.amount===20000);
  assert.deepEqual([fallback.day,fallback.processing_estimated,fallback.method],['2026-11-24',1,'']);

  await api('revenue/classifications','PUT',{movement_id:receipt.movement_id,expected_version:0,
    channel:'bank_personal',account:'직접 분류 계좌',components:null});
  const [overridden]=(await api(day+'&basis=processed')).items;
  assert.deepEqual([overridden.channel,overridden.account,overridden.method],['bank_personal','직접 분류 계좌','계좌이체']);

  const current=db.prepare("SELECT * FROM booking_payment_current WHERE id=?").get(Number(receipt.movement_id.split(':')[1]));
  db.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,note,reason,created_at)
    VALUES(?,?,?,?, 'correct','receipt',?,?,?,?)`).run(current.booking_code,current.id,'correct-revenue-processing-day',current.version,
    90000,S.manualPaymentNote('2026-11-04','계좌이체','정정','bank_corporate'),'실제 이체일 확인',stamp);
  assert.equal((await api(day+'&basis=processed')).detailCount,0);
  const [corrected]=(await api(range+'&basis=processed&space=food-only&day=2026-11-04')).items;
  assert.deepEqual([corrected.amount,corrected.day,corrected.account],[90000,'2026-11-04','직접 분류 계좌']);
});

test('실제 처리일 범위는 이전 결제와 환불의 배분을 사용하면서 기간 밖 거래는 집계하지 않는다', async t => {
  const {db,api}=setup(t);
  order(db,'PG-PROCESS',{booking:'BK-TEST',price:3,paidAt:'2026-10-31 10:00:00',status:'refunded'});
  db.prepare("UPDATE orders SET pay_method='PayApp:card',data=? WHERE oid='PG-PROCESS'").run(JSON.stringify({
    lines:[{id:'rental',amount:1},{id:'catering',amount:2}]
  }));
  const refund=db.prepare('INSERT INTO payapp_refunds VALUES(?,?,?,?)');
  refund.run('PART-OLD','PG-PROCESS',1,'2026-11-02 09:00:00');
  refund.run('full-ORIGIN','PG-PROCESS',2,'2026-12-01 02:00:00');
  const eventRow=db.prepare(`INSERT INTO payapp_refund_events(event_key,oid,event_type,original_no,refund_no,
    raw_amount,effective_amount,state_changed,fingerprint,processing_token,provider_at,created_at)
    VALUES(?,'PG-PROCESS',?,'ORIGIN',?,?,?,1,'fixture','fixture',?,?)`);
  eventRow.run('part:PART-OLD','partial','PART-OLD',1,1,'2026-10-31 20:00:00','2026-11-02 09:00:00');
  eventRow.run('full:ORIGIN','full','ORIGIN',2,2,'2026-11-29T18:00:00Z','2026-12-01 02:00:00');

  const report=await api(range+'&basis=processed&day=2026-11-30');
  assert.deepEqual(report.total,amounts(0,2,1));
  const [row]=report.items;
  assert.deepEqual([row.kind,row.channel,row.day,row.recorded_day,row.processing_estimated],['refund','payapp','2026-11-30','2026-12-01',0]);
  assert.deepEqual(row.components.map(part=>[part.id,part.amount]),[['rental',1],['catering',1]]);
  assert.deepEqual((await api(range)).total,amounts(3,3,3));
  assert.deepEqual(report.bookingSummary,(await api(range)).bookingSummary);
});
