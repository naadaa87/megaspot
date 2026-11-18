import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {revenueAdmin,revenueMovement} from '../functions/api/_revenue.js';
import {revenueBookingSummary} from '../functions/api/_revenue_bookings.js';

const first='megaspot-gundae',second='megaspot-gundae-2',day='2026-11-20',stamp='2026-11-01 03:00:00';
const range='revenue?from=2026-11-01&to=2026-11-30';
function setup(t,booking=false) {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-01T00:00:00Z')});
  const f=fixture({booking,date:day});t.after(()=>f.db.close());return f;
}
function booking(db,code,{name='최준원',date=day,space=first,status='confirmed',amount=100000,inquiry=null,legacy=0}={}) {
  db.prepare(`INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,amount,confirm_doc,created_at)
    VALUES(?,?,?,?,'01012345678','5678',?,?,?,?,?)`)
    .run(code,space,inquiry,name,date,status,amount,legacy?JSON.stringify({paid:legacy,updated_at:stamp}):null,stamp);
}
function inquiry(db,ref,{date=day,space=first}={}) {
  db.prepare(`INSERT INTO inquiries(ref,space_id,status,name,event_date,data,created_at)
    VALUES(?,?,'예약 확정','원본 문의 고객',?,'{}',?)`).run(ref,space,date,stamp);
}
function payment(db,code,amount,kind='receipt') {
  return db.prepare('INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES(?,?,?,?,?)')
    .run(code,crypto.randomUUID(),kind,amount,stamp).lastInsertRowid;
}
function order(db,id,{code=null,inquiry=null,date=day,amount=10000,product='pass-day-wdfri',status='paid',name='최준원'}={}) {
  db.prepare(`INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,inquiry_ref,test,created_at,paid_at,updated_at)
    VALUES(?,?,?, ?,?,?,'01012345678','{}',?,?,?,0,?,?,?)`)
    .run(id,product,id,date,amount,name,status,code,inquiry,stamp,stamp,stamp);
}
const originalRows=db=>JSON.stringify(['bookings','orders','booking_payment_entries','booking_payment_revisions','payapp_refunds','inquiries','settings']
  .map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));

test('지정된 테스트 예약의 수기·기존 확정서·온라인·문의 수납과 환불은 매출의 모든 집계에서만 제외한다',async t=>{
  const {db,api,env}=setup(t,true);payment(db,'BK-TEST',250000);
  order(db,'REAL-PARK',{product:'parking-batch',amount:20000});
  order(db,'REAL-PASS',{amount:30000,name:'최시준'});
  const queries=[range,range+'&space='+first,range+'&space='+second,range+'&space=unassigned',
    range+'&day='+day,range+'&category=food',range+'&channel=payapp',range+'&component=cleaning',range+'&page=2'];
  const before=[];for(const query of queries)before.push(await api(query));

  inquiry(db,'MS-EXCLUDED');inquiry(db,'MS-EXCLUDED-SECOND',{date:'2026-11-27',space:second});
  booking(db,'BK-EXCLUDED',{inquiry:'MS-EXCLUDED',status:'completed',amount:900000});
  booking(db,'BK-EXCLUDED-SECOND',{name:'\t 최시준　',inquiry:'MS-EXCLUDED-SECOND',date:'2026-11-27',space:second,amount:700000,legacy:200000});
  booking(db,'BK-EXCLUDED-UNPAID',{name:'최시준',date:'2026-11-28',space:second});
  booking(db,'BK-EXCLUDED-CANCELLED',{status:'cancelled'});
  const entry=payment(db,'BK-EXCLUDED',100000);payment(db,'BK-EXCLUDED',10000,'refund');
  payment(db,'BK-EXCLUDED-CANCELLED',30000);payment(db,'BK-EXCLUDED-CANCELLED',30000,'refund');
  db.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,reason,created_at)
    VALUES('BK-EXCLUDED',?,'test-correction',0,'correct','receipt',80000,'원본 정정 유지',?)`).run(entry,stamp);
  order(db,'EXCLUDED-PG',{code:'BK-EXCLUDED',amount:200000});
  order(db,'EXCLUDED-PARK',{code:'BK-EXCLUDED',product:'parking-batch',amount:25000});
  order(db,'EXCLUDED-REFUNDED',{code:'BK-EXCLUDED-SECOND',status:'refunded',amount:60000});
  db.prepare('INSERT INTO payapp_refunds VALUES(?,?,?,?)').run('EXCLUDED-PARTIAL','EXCLUDED-PG',50000,stamp);
  payment(db,'inquiry:MS-EXCLUDED',30000);payment(db,'inquiry:MS-EXCLUDED',5000,'refund');
  order(db,'EXCLUDED-INQUIRY',{inquiry:'MS-EXCLUDED',amount:50000});
  order(db,'EXCLUDED-INQUIRY-ADDON',{inquiry:'MS-EXCLUDED',date:null,product:'addon-cleaning',amount:40000});
  db.prepare(`INSERT INTO revenue_payment_metadata(movement_id,channel,components,version,updated_at)
    VALUES('paid:EXCLUDED-PG','payapp','[{"id":"catering","amount":200000}]',1,?)`).run(stamp);

  const originals=originalRows(db),changes=db.prepare('SELECT total_changes() AS n').get().n;
  for(let index=0;index<queries.length;index++)assert.deepEqual(await api(queries[index]),before[index],queries[index]);
  const custom=await revenueAdmin({env,url:new URL('https://local.test/api/admin/'+range),method:'GET',operationalBookingSql:'1=1 OR 1=1'});
  assert.deepEqual(await custom.json(),before[0],'호출자가 운영 조건을 바꿔도 보고서 제외 조건은 유지한다');
  assert.deepEqual(await revenueBookingSummary({env,from:'2026-11-01',to:'2026-11-30',operationalBookingSql:'1=1 OR 1=1'}),before[0].bookingSummary);
  assert.equal((await revenueMovement(env,'paid:EXCLUDED-PG')).amount,200000,'원본 분류 편집에는 계속 접근할 수 있다');
  assert.equal((await revenueMovement(env,'entry:'+entry)).amount,80000);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes,'조회 과정에서 원본 금전 내역을 변경하지 않는다');
  assert.equal(originalRows(db),originals);
});

test('테스트 제외는 2026년 11월의 앞뒤 공백을 정리한 정확한 이름에만 적용한다',async t=>{
  const {db,api}=setup(t);
  const rows=[
    ['EXCLUDED-A','최준원','2026-11-01',true],['EXCLUDED-B','　최시준\n','2026-11-30',true],
    ['REAL-SUFFIX','최준원 고객','2026-11-20',false],['REAL-PREFIX','고객 최시준','2026-11-20',false],
    ['REAL-INNER-SPACE','최 준원','2026-11-20',false],['REAL-OCT','최준원','2026-10-31',false],
    ['REAL-DEC','최시준','2026-12-01',false],['REAL-NEXT-NOV','최준원','2027-11-20',false]
  ];
  for(const [code,name,date] of rows){booking(db,code,{name,date,amount:1000});payment(db,code,100);order(db,'PG-'+code,{code,date,amount:200});}
  for(const [from,to] of [['2026-11-01','2026-11-30'],['2026-10-01','2026-10-31'],['2026-12-01','2026-12-31'],['2027-11-01','2027-11-30']]) {
    const expected=rows.filter(([, ,date,excluded])=>!excluded&&date>=from&&date<=to).map(([code])=>code).sort();
    const r=await api('revenue?'+new URLSearchParams({from,to}));
    assert.deepEqual([...new Set(r.items.map(item=>item.booking_code))].sort(),expected);
    assert.equal(r.bookingSummary.bookingCount,expected.length);assert.equal(r.bookingSummary.booked,expected.length*1000);
    assert.equal(r.bookingSummary.netReceived,expected.length*300);assert.equal(r.bookingSummary.balance,expected.length*700);
    assert.equal(r.total.net,expected.length*300);assert.equal(r.bookingSummary.monthly[0].booked,expected.length*1000);
  }
});

test('문의만 연결된 결제는 해당 이용일의 테스트 예약을 따르고 명시된 실제 예약과 다른 날짜의 형제 예약은 보존한다',async t=>{
  const {db,api}=setup(t);
  booking(db,'EXCLUDED',{inquiry:'MS-TEST'});
  booking(db,'REAL-SIBLING',{name:'실제 고객',inquiry:'MS-TEST',date:'2026-11-21'});
  payment(db,'inquiry:MS-TEST',3000);
  order(db,'EXCLUDED-INQUIRY',{inquiry:'MS-TEST',amount:10000});
  order(db,'REAL-SIBLING-INQUIRY',{inquiry:'MS-TEST',date:'2026-11-21',amount:20000});
  order(db,'REAL-EXPLICIT',{code:'REAL-SIBLING',inquiry:'MS-TEST',amount:30000});
  order(db,'REAL-INDEPENDENT',{amount:40000});
  const r=await api(range);
  assert.deepEqual(r.items.map(item=>item.ref).sort(),['REAL-EXPLICIT','REAL-INDEPENDENT','REAL-SIBLING-INQUIRY']);
  assert.equal(r.total.received,90000);assert.equal(r.bookingSummary.bookingCount,1);
  assert.equal(r.bookingSummary.received,30000);assert.equal(r.bookingSummary.balance,70000);
  assert.ok(r.upcoming.every(item=>item.booking_code!=='EXCLUDED'));
});
