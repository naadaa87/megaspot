import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {preserveLegacyPayments} from '../functions/api/_settlement.js';
import {revenueMovement} from '../functions/api/_revenue.js';

const first='megaspot-gundae',second='megaspot-gundae-2',date='2026-11-20',stamp='2026-10-15 03:00:00';
const range='revenue?from=2026-10-01&to=2026-12-31';
function setup(t) { const f=fixture({booking:true,date});t.after(()=>f.db.close());return f; }
function entry(db,amount,kind='receipt',code='BK-TEST') {
  return 'entry:'+db.prepare('INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES(?,?,?,?,?)')
    .run(code,crypto.randomUUID(),kind,amount,stamp).lastInsertRowid;
}
function classify(db,id,{channel='unknown',account='',components=null}={}) {
  db.prepare('INSERT INTO revenue_payment_metadata(movement_id,channel,account,components,version,updated_at) VALUES(?,?,?,?,1,?)')
    .run(id,channel,account,components?JSON.stringify(components):null,stamp);
}
function order(db,id,{product='pass-day-wdfri',amount=100000,lines=[],provider='payapp',booking=null,event=date,status='paid'}={}) {
  db.prepare(`INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,created_at,paid_at,updated_at)
    VALUES(?,?,?,?,?,'고객','01012345678',?,?,?,?,?,?)`)
    .run(id,product,'온라인 주문',event,amount,JSON.stringify({provider,lines}),status,booking,stamp,stamp,stamp);
}
const find=(rows,id)=>rows.find(row=>row.id===id);
function conserves(report) {
  for(const rows of [Object.values(report.branches),report.monthly,report.categories,report.components,report.channels]) {
    for(const field of ['received','refunded','net'])assert.equal(rows.reduce((n,row)=>n+row[field],0),report.total[field],field);
  }
  for(const item of report.items)assert.equal(item.components.reduce((n,row)=>n+row.amount,0),item.amount);
}

test('견적 할인·F&B·청소·현수막을 부분 수납·환불에 비례 배분하고 이용월로 합산한다',async t=>{
  const {db,api}=setup(t);
  const quote={subtotal:1000,discount:100,total:1300,
    lines:[{label:'공간료',amount:600},{label:'뒷정리·청소 지원',amount:200},{label:'인원',amount:200}],
    extras:[{kind:'catering',label:'출장뷔페',amount:100},{kind:'reception',label:'케이터링',amount:100},
      {kind:'cocktail',label:'칵테일',amount:100},{label:'현수막 제작',amount:100}]};
  db.prepare("INSERT INTO quotes(quote_no,inquiry_ref,event_date,total,data,created_at) VALUES('Q-BREAKDOWN','MS-TEST',?,?,?,?)")
    .run(date,1300,JSON.stringify(quote),stamp);
  entry(db,650);entry(db,65,'refund');
  const report=await api(range);
  assert.deepEqual(report.monthly.map(row=>[row.month,row.received,row.refunded,row.net]),[
    ['2026-10',0,0,0],['2026-11',650,65,585],['2026-12',0,0,0]
  ]);
  assert.deepEqual(report.components.filter(row=>row.received).map(row=>[row.id,row.received,row.refunded]),[
    ['rental',270,27],['people',90,9],['catering',50,5],['reception',50,5],['cocktail',50,5],['cleaning',90,9],['banner',50,5]
  ]);
  assert.equal(find(report.categories,'rental').net,324);
  assert.equal(find(report.categories,'food').net,135);
  assert.equal(find(report.categories,'addons').net,126);
  assert.ok(report.items.every(item=>item.allocation_basis==='견적 비례 배분'));
  assert.equal(report.monthly[1].branches[first].net,585);
  conserves(report);
});

test('조회 조건은 구성별 금액과 거래에 함께 적용하고 원래 거래액을 보존한다',async t=>{
  const {db,api}=setup(t),id=entry(db,1001);
  classify(db,id,{channel:'bank_corporate',account:'지유공간개발',components:[
    {id:'rental',amount:400},{id:'catering',amount:301},{id:'cleaning',amount:200},{id:'banner',amount:100}
  ]});
  const filtered=await api(range+'&category=addons&channel=bank_corporate');
  assert.equal(filtered.total.received,300);
  assert.equal(filtered.items[0].amount,300);
  assert.equal(filtered.items[0].original_amount,1001);
  assert.equal(filtered.items[0].all_components.length,4);
  assert.deepEqual(filtered.items[0].components.map(row=>row.id),['cleaning','banner']);
  assert.equal(filtered.items[0].metadata_version,1);
  assert.equal(filtered.upcoming.length,0);
  conserves(filtered);
  const component=await api(range+'&component=banner');
  assert.equal(component.total.net,100);
  assert.equal(component.items[0].amount,100);
  assert.equal((await api(range+'&category=food&component=banner')).total.received,0);
  assert.equal((await api(range+'&channel=bank_personal')).detailCount,0);
  for(const invalid of ['category=untrusted','component=sql','channel=other'])await api(range+'&'+invalid,'GET',undefined,400);
});

test('계좌·현장결제·스페이스클라우드 비중을 수납 기준으로 계산하고 문의 경로로 추정하지 않는다',async t=>{
  const {db,api}=setup(t);
  db.prepare("UPDATE inquiries SET data=json_set(data,'$.channel','spacecloud')").run();
  const a=entry(db,100),b=entry(db,200),c=entry(db,300),d=entry(db,400),e=entry(db,500);
  classify(db,a,{channel:'bank_corporate',account:'블랭크'});
  classify(db,b,{channel:'bank_corporate',account:'지유공간개발'});
  classify(db,c,{channel:'bank_personal',account:'최준원'});
  classify(db,d,{channel:'toss_terminal'});
  classify(db,e,{channel:'spacecloud'});
  entry(db,500);
  const refund=entry(db,50,'refund');classify(db,refund,{channel:'spacecloud'});
  const report=await api(range);
  assert.equal(find(report.channels,'bank_corporate').share,15);
  assert.deepEqual(find(report.channels,'bank_corporate').accounts.map(row=>[row.account,row.received]).sort(),[
    ['블랭크',100],['지유공간개발',200]
  ]);
  assert.equal(find(report.channels,'spacecloud').received,500);
  assert.equal(find(report.channels,'spacecloud').refunded,50);
  assert.equal(find(report.channels,'spacecloud').share,25);
  assert.equal(find(report.channels,'unknown').received,500);
  assert.equal(find(report.categories,'unclassified').received,2000);
  conserves(report);
});

test('온라인 주문 구성과 환불의 직접 분류를 상속하고 판매자 ID를 노출하지 않는다',async t=>{
  const {db,api,env}=setup(t);
  env.PAYAPP_JIYU_USERID='private-jiyu-merchant';
  order(db,'ONLINE',{amount:1001,lines:[{id:'pass-day-wdfri',amount:600},{id:'people',amount:200},{id:'addon-cleaning',amount:201}]});
  db.prepare('INSERT INTO payapp_payments(oid,nonce,merchant_userid,created_at) VALUES(?,?,?,?)')
    .run('ONLINE','private-nonce',env.PAYAPP_JIYU_USERID,stamp);
  db.prepare('INSERT INTO payapp_refunds(mul_no,oid,amount,created_at) VALUES(?,?,?,?)').run('PART','ONLINE',333,stamp);
  order(db,'PARKING',{product:'parking-batch',amount:500});
  let report=await api(range);
  assert.equal(find(report.components,'cleaning').received,201);
  assert.equal(find(report.categories,'parking').received,500);
  assert.equal(find(report.channels,'payapp').received,1501);
  assert.ok(find(report.channels,'payapp').accounts.some(row=>row.account==='지유공간개발'));
  assert.doesNotMatch(JSON.stringify(report),/private-jiyu-merchant|private-nonce/);
  classify(db,'paid:ONLINE',{channel:'spacecloud',components:[{id:'rental',amount:500},{id:'reception',amount:501}]});
  report=await api(range);
  const refunded=report.items.find(item=>item.movement_id==='refund:PART');
  assert.equal(refunded.channel,'spacecloud');
  assert.deepEqual(refunded.components.map(row=>[row.id,row.amount]),[['rental',166],['reception',167]]);
  assert.equal(refunded.metadata_version,0);
  assert.equal(refunded.allocation_basis,'직접 분류');
  conserves(report);
  classify(db,'refund:PART',{channel:'bank_personal',account:'최준원',components:[{id:'rental',amount:333}]});
  const override=(await api(range)).items.find(item=>item.movement_id==='refund:PART');
  assert.equal(override.channel,'bank_personal');
  assert.deepEqual(override.components.map(row=>row.id),['rental']);
});

test('이전 확정서 수납을 이관해도 분류를 유지하고 정정된 금액의 구성은 재확인한다',async t=>{
  const {db,api,env}=setup(t);
  db.prepare("UPDATE bookings SET confirm_doc=json_object('paid',1000,'updated_at',?)").run(stamp);
  classify(db,'legacy:BK-TEST',{channel:'bank_corporate',account:'블랭크',components:[{id:'rental',amount:800},{id:'cleaning',amount:200}]});
  const before=await api(range);
  assert.equal(before.items[0].channel,'bank_corporate');
  await preserveLegacyPayments(env);
  const after=await api(range);
  assert.deepEqual(after.categories,before.categories);
  assert.equal(after.items[0].channel,'bank_corporate');
  assert.equal(after.items[0].metadata_version,0);
  const id=Number(after.items[0].movement_id.slice(6));
  db.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,reason,created_at)
    VALUES('BK-TEST',?,'corrected',0,'correct','receipt',900,'금액 정정',?)`).run(id,stamp);
  const changed=(await api(range)).items[0];
  assert.equal(changed.amount,900);
  assert.equal(changed.classification_stale,true);
  assert.equal(changed.allocation_basis,'구성 재확인 필요');
  assert.equal(changed.channel,'bank_corporate');
  assert.equal((await revenueMovement(env,changed.movement_id)).amount,900);
});

test('다음 페이지와 거래일 선택은 전체 기간의 구성·채널·월별 합계를 바꾸지 않는다',async t=>{
  const {db,api}=setup(t);
  for(let i=0;i<52;i++)order(db,'PAGE-'+i,{product:'addon-banner',amount:1000,event:i===0?'2026-12-20':date});
  const a=await api(range),b=await api(range+'&page=2'),day=await api(range+'&day=2026-12-20');
  assert.equal(a.items.length,50);assert.equal(b.items.length,2);assert.equal(day.items.length,1);
  for(const key of ['total','categories','channels','components','monthly']) {
    assert.deepEqual(a[key],b[key]);assert.deepEqual(a[key],day[key]);
  }
  assert.equal(a.monthly[2].received,1000);
  assert.equal(find(a.components,'banner').received,52000);
  conserves(a);
});

test('여러 번 나눈 온라인 전액환불은 정수 반올림 후에도 원래 구성별 수납액을 정확히 상쇄한다',async t=>{
  const {db,api}=setup(t);
  order(db,'TINY',{amount:2,lines:[{id:'pass-day-wdfri',amount:1},{id:'addon-cleaning',amount:1}]});
  for(const id of ['FIRST','SECOND'])db.prepare('INSERT INTO payapp_refunds(mul_no,oid,amount,created_at) VALUES(?,?,1,?)')
    .run(id,'TINY',stamp);
  const result=await api(range);
  assert.equal(result.total.net,0);
  assert.equal(find(result.components,'rental').net,0);
  assert.equal(find(result.components,'cleaning').net,0);
  assert.deepEqual(result.items.filter(item=>item.kind==='refund').map(item=>item.components[0].id).sort(),['cleaning','rental']);
  const filtered=await api(range+'&component=cleaning');
  assert.equal(filtered.total.received,1);
  assert.equal(filtered.total.refunded,1);
  conserves(result);conserves(filtered);
});
