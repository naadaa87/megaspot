import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {revenueBookingsAdmin} from '../functions/api/_revenue_bookings.js';
import {ensureSchema} from '../functions/api/_lib.js';
import {onRequest as middleware} from '../functions/api/_middleware.js';

const first='megaspot-gundae',second='megaspot-gundae-2',day='2026-11-20',stamp='2026-10-10 03:00:00';
const query='from=2026-11-01&to=2026-11-30',range='revenue/bookings?'+query;
function setup(t,{base=false}={}) {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-01T00:00:00Z')});
  const f=fixture({booking:base,date:day});t.after(()=>f.db.close());return f;
}
function booking(db,code,{amount=100000,space=first,date=day,status='confirmed',name=code,start=10,end=17,inquiry=null,legacy=0}={}) {
  db.prepare(`INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,amount,start_h,end_h,slot,confirm_doc,created_at)
    VALUES(?,?,?,?,'01012345678','5678',?,?,?,?,?,'custom',?,?)`)
    .run(code,space,inquiry,name,date,status,amount,start,end,legacy?JSON.stringify({paid:legacy,updated_at:stamp}):null,stamp);
}
function payment(db,code,amount,kind='receipt') {
  return db.prepare('INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES(?,?,?,?,?,?)')
    .run(code,crypto.randomUUID(),kind,amount,'원본 금전 내역 비공개 메모',stamp).lastInsertRowid;
}
function order(db,id,{code=null,amount=100000,status='paid',product='pass-day-wdfri',test=0}={}) {
  db.prepare(`INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,test,created_at,paid_at,updated_at)
    VALUES(?,?,?, ?,?,'온라인 결제 고객','01012345678','{}',?,?,?,?,?,?)`)
    .run(id,product,id,day,amount,status,code,test,stamp,stamp,stamp);
}
const codes=r=>r.items.map(row=>row.booking_code).sort();
const sum=(rows,key)=>rows.reduce((total,row)=>total+(row[key]??0),0);

test('카드별 예약 목록은 미수납·부분 수납·전액 환불·음수 수납·초과 수납을 포함해 상단 금액과 정확히 일치한다',async t=>{
  const {db,api}=setup(t);
  booking(db,'PARTIAL',{amount:1000000,name:'부분 수납 고객'});payment(db,'PARTIAL',300000);
  booking(db,'FULL',{amount:200000,space:second,status:'completed'});payment(db,'FULL',200000);
  booking(db,'OVER',{amount:100000});payment(db,'OVER',150000);
  booking(db,'UNPAID',{amount:400000});booking(db,'FREE',{amount:0});
  booking(db,'UNKNOWN',{amount:null});payment(db,'UNKNOWN',10000);
  booking(db,'FULL-REFUND',{amount:100000});payment(db,'FULL-REFUND',100000);payment(db,'FULL-REFUND',100000,'refund');
  booking(db,'NEGATIVE',{amount:50000});payment(db,'NEGATIVE',5000,'refund');
  const headline=(await api('revenue?'+query)).bookingSummary;
  const booked=await api(range+'&metric=booked'),received=await api(range+'&metric=received'),balance=await api(range+'&metric=balance');
  for(const r of [booked,received,balance])assert.deepEqual(r.summary,headline);
  assert.deepEqual(booked.total,{count:8,amount:1850000,unknownCount:1});
  assert.deepEqual(received.total,{count:6,amount:655000,unknownCount:0});
  assert.deepEqual(balance.total,{count:3,amount:1200000,unknownCount:2});
  assert.deepEqual(codes(booked),['FREE','FULL','FULL-REFUND','NEGATIVE','OVER','PARTIAL','UNKNOWN','UNPAID']);
  assert.deepEqual(codes(received),['FULL','FULL-REFUND','NEGATIVE','OVER','PARTIAL','UNKNOWN']);
  assert.deepEqual(codes(balance),['FULL-REFUND','PARTIAL','UNPAID']);
  assert.equal(sum(booked.items,'amount'),headline.booked);assert.equal(sum(received.items,'netReceived'),headline.netReceived);
  assert.equal(sum(balance.items,'balance'),headline.balance);assert.equal(headline.excessPaid,50000);
  const negative=received.items.find(row=>row.booking_code==='NEGATIVE');
  assert.equal(negative.netReceived,-5000);assert.equal(negative.balance,null);assert.equal(negative.review_required,true);
  assert.equal(negative.excessPaid,null);assert.equal(negative.overRefunded,5000);
  assert.equal(received.items.find(row=>row.booking_code==='FULL-REFUND').netReceived,0);
  assert.equal(booked.items.find(row=>row.booking_code==='FREE').amount,0);
  assert.equal(booked.items.find(row=>row.booking_code==='UNKNOWN').amount,null);
  assert.equal(received.items.find(row=>row.booking_code==='OVER').netReceived,150000,'초과 수납은 예약 금액으로 제한하지 않는다');
  assert.deepEqual(Object.keys(booked.items[0]).sort(),['booking_code','customer_name','date','space_id','status','start_h','end_h','slot',
    'amount','received','refunded','netReceived','balance','review_required','excessPaid','overRefunded'].sort());
  assert.doesNotMatch(JSON.stringify(booked),/01012345678|원본 금전 내역 비공개 메모|confirm_doc|inquiry_ref|order_data/);
  assert.doesNotMatch(JSON.stringify(headline),/customer_name|booking_code|부분 수납 고객/,'기존 매출 요약에는 식별 정보를 추가하지 않는다');
});

test('예약 목록은 기간·지점·확정 상태·테스트 제외를 상단과 공유하고 수납 분석 필터는 받지 않는다',async t=>{
  const {db,api,env}=setup(t);
  booking(db,'FIRST');payment(db,'FIRST',20000);
  booking(db,'SECOND',{space:second,status:'completed'});payment(db,'SECOND',30000);
  booking(db,'EXTERNAL',{space:'external-host'});payment(db,'EXTERNAL',40000);
  for(const [code,options] of [['CANCELLED',{status:'cancelled'}],['REVIEW',{status:'payment_review'}],
    ['OUTSIDE',{date:'2026-12-01'}],['EXCLUDED-ONE',{name:'최준원'}],['EXCLUDED-TWO',{name:'　최시준\t',status:'completed'}]]) {
    booking(db,code,options);payment(db,code,900000);order(db,'PG-'+code,{code});
  }
  payment(db,'inquiry:MS-TEST',70000);order(db,'PARKING',{product:'parking-batch',amount:12345});
  const base=await api(range+'&metric=booked');assert.deepEqual(codes(base),['EXTERNAL','FIRST','SECOND']);
  assert.deepEqual((await api(range+'&metric=booked&category=parking&channel=payapp&component=parking&day=2026-11-01')).summary,base.summary);
  for(const [space,expected] of [[first,['FIRST']],[second,['SECOND']],['unassigned',['EXTERNAL']]]) {
    const r=await api(range+'&metric=received&space='+space),s=(await api('revenue?'+query+'&space='+space)).bookingSummary;
    assert.deepEqual(codes(r),expected);assert.deepEqual(r.summary,s);assert.equal(r.total.amount,s.netReceived);
  }
  const custom=await revenueBookingsAdmin({env,url:new URL('https://local.test/api/admin/'+range+'&metric=booked'),method:'GET',operationalBookingSql:'1=1 OR 1=1'});
  assert.deepEqual(await custom.json(),base,'호출자가 운영 조건을 바꿔도 테스트 제외와 확정 상태 조건을 우회하지 못한다');
});

test('정정·기록 취소·온라인 부분 환불·기존 확정서 수납·금액 미정 override는 공통 정산을 그대로 사용한다',async t=>{
  const {db,api}=setup(t,{base:true});db.prepare('UPDATE bookings SET amount=1000000').run();
  const corrected=payment(db,'BK-TEST',100000),voided=payment(db,'BK-TEST',80000);
  const revision=db.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,reason,created_at)
    VALUES('BK-TEST',?,?,0,?,'receipt',?,'원본 정정',?)`);
  revision.run(corrected,'correct-receipt','correct',60000,stamp);revision.run(voided,'void-receipt','void',80000,stamp);
  order(db,'PG',{code:'BK-TEST',amount:200000});order(db,'TEST-PG',{code:'BK-TEST',amount:999000,test:1});
  db.prepare('INSERT INTO payapp_refunds VALUES(?,?,?,?)').run('PARTIAL','PG',50000,stamp);
  booking(db,'LEGACY',{amount:500000,legacy:150000});
  booking(db,'OVERRIDE-UNKNOWN',{amount:900000,inquiry:'MS-TEST'});
  db.prepare("UPDATE inquiries SET data=json_set(data,'$.amount_override',1,'$.total',NULL)").run();
  const changes=db.prepare('SELECT total_changes() AS n').get().n;
  const r=await api(range+'&metric=received'),headline=(await api('revenue?'+query)).bookingSummary;
  assert.deepEqual(r.summary,headline);assert.equal(r.total.amount,360000);
  assert.deepEqual(r.items.find(row=>row.booking_code==='BK-TEST'),{
    booking_code:'BK-TEST',customer_name:'검증 고객',date:day,space_id:first,status:'confirmed',start_h:10,end_h:17,slot:null,
    amount:null,received:260000,refunded:50000,netReceived:210000,balance:null,review_required:false,excessPaid:null,overRefunded:0
  });
  assert.equal(r.items.find(row=>row.booking_code==='LEGACY').received,150000);
  const booked=await api(range+'&metric=booked');assert.equal(booked.total.unknownCount,2);
  assert.equal(booked.items.find(row=>row.booking_code==='OVERRIDE-UNKNOWN').amount,null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM booking_payment_entries WHERE booking_code=?').get('LEGACY').n,0);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes,'기존 확정서 수납을 읽어도 원장 이관이나 쓰기를 하지 않는다');
});

test('50건 페이지와 90건 정산 배치를 넘어도 정렬·전체 건수·카드 금액을 유지한다',async t=>{
  const {db,api,env}=setup(t);
  for(let index=0;index<103;index++) {
    const code='BOOK-'+String(index).padStart(3,'0'),date=index<3?'2026-11-01':'2026-11-20';
    booking(db,code,{name:index===1?'가나다':index===2?'가나다':'동일 고객',date,start:index<3?9:index%2===0?null:10,amount:1000});
    payment(db,code,100);
  }
  const pages=[];for(let page=1;page<=3;page++)pages.push(await api(range+'&metric=balance&page='+page));
  assert.deepEqual(pages.map(r=>r.items.length),[50,50,3]);
  for(const r of pages){assert.deepEqual(r.total,{count:103,amount:92700,unknownCount:0});assert.equal(r.detailCount,103);assert.equal(r.pageSize,50);assert.deepEqual(r.summary,pages[0].summary);}
  const rows=pages.flatMap(r=>r.items);assert.equal(new Set(rows.map(row=>row.booking_code)).size,103);
  assert.deepEqual(rows.slice(0,3).map(row=>row.booking_code),['BOOK-001','BOOK-002','BOOK-000'],'같은 이용일에는 시작 시각·고객명·예약번호로 정렬한다');
  assert.equal(rows.slice(3,53).every(row=>row.start_h===10),true);assert.equal(rows.slice(53).every(row=>row.start_h===null),true);
  assert.equal(sum(rows,'balance'),pages[0].total.amount);
  let queries=0;const wrapped={...env,DB:{...env.DB,prepare(sql){queries++;return env.DB.prepare(sql);}}};
  const response=await revenueBookingsAdmin({env:wrapped,url:new URL('https://local.test/api/admin/'+range+'&metric=received&page=2'),method:'GET'});
  const received=await response.json();assert.equal(queries,3,'예약 집합 한 번과 90건 이하 공통 정산 두 번으로 모든 페이지 합계를 만든다');
  assert.equal(received.total.amount,10300);assert.equal(received.items.length,50);
  assert.equal((await api(range+'&metric=booked&page=4')).items.length,0);
});

test('예약 매출 상세는 관리자 인증·입력 검증을 거치고 미들웨어에서도 알림 작업이나 DB 쓰기를 실행하지 않는다',async t=>{
  const {db,api,env,handle}=setup(t);await ensureSchema(env);
  booking(db,'READ-ONLY',{legacy:10000});
  for(const invalid of [{metric:'other'},{metric:''},{space:'other'},{from:'2026-02-30'},{from:'2025-01-01'},
    {from:'2026-12-01'},{page:'0'},{page:'-1'},{page:'1.5'},{page:'100001'},{page:'NaN'}])
    await api('revenue/bookings?'+new URLSearchParams({from:'2026-11-01',to:'2026-11-30',metric:'booked',...invalid}),'GET',undefined,400);
  const url='https://local.test/api/admin/'+range+'&metric=booked';
  assert.equal((await handle(new Request(url))).status,401);
  assert.equal((await handle(new Request(url,{headers:{'x-admin-key':'incorrect'}}))).status,401);
  const snapshot=()=>['bookings','orders','booking_payment_entries','booking_payment_revisions','settings','event_log',
    'deposit_notifications','booking_guide_events','transaction_notifications'].map(table=>[table,db.prepare('SELECT * FROM '+table).all()]);
  const before=snapshot(),changes=db.prepare('SELECT total_changes() AS n').get().n,prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=sql=>{assert.match(sql.trim(),/^(SELECT|WITH)\b/i,'DB 변경 금지: '+sql.slice(0,70));return prepare(sql);};
  let jobs=0;
  for(const metric of ['booked','received','balance']) {
    const request=new Request(url.replace('metric=booked','metric='+metric),{headers:{'x-admin-key':env.ADMIN_KEY}});
    const response=await middleware({env,request,next:()=>handle(request),waitUntil:()=>jobs++});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  await api(range,'POST',{},405);
  assert.equal(jobs,0);assert.deepEqual(snapshot(),before);assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
  const defaults=await api('revenue/bookings');assert.equal(defaults.metric,'booked');
  assert.deepEqual(defaults.summary.scope,{from:'2026-11-01',to:'2026-11-30',space:'',statuses:['confirmed','completed'],filters:'period-space'});
});
