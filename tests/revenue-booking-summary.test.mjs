import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {preserveLegacyPayments} from '../functions/api/_settlement.js';
import {revenueBookingSummary} from '../functions/api/_revenue_bookings.js';

const first='megaspot-gundae',second='megaspot-gundae-2',day='2026-11-20',stamp='2026-10-10 03:00:00';
const range='revenue?from=2026-11-01&to=2026-11-30';
function setup(t){const f=fixture({booking:true,date:day});t.after(()=>f.db.close());return f;}
function booking(db,code,{amount=100000,space=first,date=day,status='confirmed'}={}){
  db.prepare(`INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,amount,created_at)
    VALUES(?,?,'추가 예약','01012345678','5678',?,?,?,?)`).run(code,space,date,status,amount,stamp);
}
function payment(db,code,amount,kind='receipt'){
  return db.prepare('INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES(?,?,?,?,?,?)')
    .run(code,crypto.randomUUID(),kind,amount,'검증용 원본 메모',stamp).lastInsertRowid;
}
function order(db,id,{amount=100000,code='BK-TEST',product='pass-day-wdfri',status='paid',test=0}={}){
  db.prepare(`INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,test,created_at,paid_at,updated_at)
    VALUES(?,?,?, ?,?,'온라인 예약','01012345678','{}',?,?,?,?,?,?)`)
    .run(id,product,id,day,amount,status,code,test,stamp,stamp,stamp);
}
const values=s=>({bookings:s.bookingCount,booked:s.booked,received:s.received,refunded:s.refunded,net:s.netReceived,balance:s.balance,balanceCount:s.balanceCount});

test('100만원 확정 예약에 30만원 수납이면 예약금액 100만원·현재 수납 30만원·잔금 70만원이다',async t=>{
  const {db,api}=setup(t);db.prepare('UPDATE bookings SET amount=1000000').run();payment(db,'BK-TEST',300000);
  const r=await api(range),s=r.bookingSummary;
  assert.deepEqual(values(s),{bookings:1,booked:1000000,received:300000,refunded:0,net:300000,balance:700000,balanceCount:1});
  assert.deepEqual(s.scope,{from:'2026-11-01',to:'2026-11-30',space:'',statuses:['confirmed','completed'],filters:'period-space'});
  assert.equal(r.total.net,300000);
  assert.equal(s.amountUnknownCount,0);assert.equal(s.reviewRequiredCount,0);
});

test('미수납·입금 완료·이용 완료 예약을 같은 기준으로 합산하며 다른 예약의 초과 수납으로 잔금을 줄이지 않는다',async t=>{
  const {db,api}=setup(t);db.prepare('UPDATE bookings SET amount=10000').run();payment(db,'BK-TEST',15000);
  booking(db,'BK-PARTIAL',{amount:10000});payment(db,'BK-PARTIAL',2000);payment(db,'BK-PARTIAL',1000,'refund');
  booking(db,'BK-UNPAID',{amount:30000});booking(db,'BK-DONE',{amount:20000,status:'completed'});payment(db,'BK-DONE',20000);
  const s=(await api(range)).bookingSummary;
  assert.deepEqual(values(s),{bookings:4,booked:70000,received:37000,refunded:1000,net:36000,balance:39000,balanceCount:2});
  assert.equal(s.excessPaid,5000);assert.equal(s.excessPaidCount,1);
  assert.equal(s.booked+s.excessPaid,s.netReceived+s.balance);
  assert.notEqual(s.balance,Math.max(0,s.booked-s.netReceived));
});

test('기간·지점별 확정 및 이용 완료 예약만 포함하고 미확정 문의·취소·검토 대기·공용 주차 거래는 제외한다',async t=>{
  const {db,api}=setup(t);payment(db,'BK-TEST',100000);
  booking(db,'BK-SECOND',{space:second,amount:700000,date:'2026-11-21'});payment(db,'BK-SECOND',200000);
  booking(db,'BK-OUTSIDE',{date:'2026-12-01',amount:900000});payment(db,'BK-OUTSIDE',900000);
  booking(db,'BK-CANCELLED',{status:'cancelled',amount:300000});payment(db,'BK-CANCELLED',300000);
  booking(db,'BK-REVIEW',{status:'payment_review',amount:400000});payment(db,'BK-REVIEW',400000);
  db.prepare(`INSERT INTO inquiries(ref,space_id,status,name,phone,event_date,data,created_at)
    VALUES('MS-UNCONFIRMED',?,'결제 대기','미확정 고객','01012345678',?,'{"total":800000}',?)`).run(first,day,stamp);
  payment(db,'inquiry:MS-UNCONFIRMED',50000);
  order(db,'PARK',{code:null,product:'parking-batch',amount:30000});
  const all=await api(range);
  assert.deepEqual(values(all.bookingSummary),{bookings:2,booked:1200000,received:300000,refunded:0,net:300000,balance:900000,balanceCount:2});
  assert.ok(all.total.received>all.bookingSummary.received,'기존 수납 분석은 취소·미확정 문의·공용 주차 기록도 유지한다');
  assert.deepEqual(values((await api(range+'&space='+second)).bookingSummary),{bookings:1,booked:700000,received:200000,refunded:0,net:200000,balance:500000,balanceCount:1});
  assert.equal((await api(range+'&space=unassigned')).bookingSummary.bookingCount,0);
  assert.equal((await api('revenue?from=2026-12-01&to=2026-12-31')).bookingSummary.booked,900000);
});

test('서비스·결제 채널·세부 항목·상세 날짜·페이지 조건이 미수납 예약 요약을 줄이지 않는다',async t=>{
  const {db,api}=setup(t);payment(db,'BK-TEST',200000);booking(db,'BK-UNPAID',{amount:300000});
  const before=(await api(range)).bookingSummary;
  const filtered=await api(range+'&category=food&component=catering&channel=toss_terminal&day=2026-11-02&page=2');
  assert.deepEqual(filtered.bookingSummary,before);
  assert.equal(filtered.total.received,0);assert.equal(filtered.items.length,0);
  assert.equal(filtered.bookingSummary.balance,600000);
});

test('금액 미정·무료 예약·수납 초과 환불은 구분하고 확인할 수 없는 잔금은 임의 계산하지 않는다',async t=>{
  const {db,api}=setup(t);
  booking(db,'BK-ZERO',{amount:0});payment(db,'BK-ZERO',10000);
  booking(db,'BK-UNKNOWN',{amount:null});payment(db,'BK-UNKNOWN',5000);
  booking(db,'BK-OVER-REFUNDED',{amount:10000});payment(db,'BK-OVER-REFUNDED',1500,'refund');
  const s=(await api(range)).bookingSummary;
  assert.deepEqual(values(s),{bookings:4,booked:510000,received:15000,refunded:1500,net:13500,balance:500000,balanceCount:1});
  assert.equal(s.amountUnknownCount,1);assert.equal(s.balanceUnknownCount,2);
  assert.equal(s.excessPaid,10000);assert.equal(s.excessPaidCount,1);
  assert.equal(s.reviewRequiredCount,1);assert.equal(s.overRefunded,1500);
});

test('온라인 부분 환불·유효 수납 정정·기록 취소·기존 확정서 이관을 원장과 같은 기준으로 읽고 조회로 변경하지 않는다',async t=>{
  const {db,api,env}=setup(t);db.prepare('UPDATE bookings SET amount=1000000').run();
  order(db,'PG',{amount:200000});order(db,'TEST',{amount:999000,test:1});
  db.prepare('INSERT INTO payapp_refunds VALUES(?,?,?,?)').run('PARTIAL','PG',50000,stamp);
  const corrected=payment(db,'BK-TEST',100000),voided=payment(db,'BK-TEST',80000);
  db.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,note,reason,created_at)
    VALUES('BK-TEST',?,?,0,?,'receipt',?,'정정 메모','검증',?)`).run(corrected,'correct-payment','correct',60000,stamp);
  db.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,note,reason,created_at)
    VALUES('BK-TEST',?,?,0,?,'receipt',?,'취소 메모','검증',?)`).run(voided,'void-payment','void',80000,stamp);
  booking(db,'BK-LEGACY',{amount:500000});db.prepare('UPDATE bookings SET confirm_doc=? WHERE booking_code=?').run(JSON.stringify({paid:150000,updated_at:stamp}),'BK-LEGACY');
  const changes=db.prepare('SELECT total_changes() AS n').get().n;
  const before=(await api(range)).bookingSummary;
  assert.deepEqual(values(before),{bookings:2,booked:1500000,received:410000,refunded:50000,net:360000,balance:1140000,balanceCount:2});
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes,'조회는 원장·알림·분류를 변경하지 않는다');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_payment_entries WHERE booking_code='BK-LEGACY'").get().n,0);
  await preserveLegacyPayments(env);
  assert.deepEqual((await api(range)).bookingSummary,before,'확정서 수납 이관 전후에도 한 번만 집계한다');
});

test('예약이 90건을 넘어도 정산 조회를 나눠 빠짐없이 합산하고 노출할 고객 정보는 반환하지 않는다',async t=>{
  const {db,env}=setup(t);db.prepare('UPDATE bookings SET amount=1000').run();
  for(let i=0;i<96;i++)booking(db,'BK-MANY-'+i,{amount:1000});
  payment(db,'BK-MANY-95',1000);
  const s=await revenueBookingSummary({env,from:'2026-11-01',to:'2026-11-30'});
  assert.deepEqual(values(s),{bookings:97,booked:97000,received:1000,refunded:0,net:1000,balance:96000,balanceCount:96});
  assert.ok(!JSON.stringify(s).includes('01012345678'));
  assert.ok(!Object.hasOwn(s,'items'));
});
