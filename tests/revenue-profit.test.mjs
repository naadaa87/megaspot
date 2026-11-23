import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {ensureSchema} from '../functions/api/_lib.js';
import {onRequest as middleware} from '../functions/api/_middleware.js';
import {revenueProfitAdmin} from '../functions/api/_revenue_profit.js';

const first='megaspot-gundae',second='megaspot-gundae-2',day='2026-11-20',stamp='2026-10-10 03:00:00';
const query='from=2026-01-01&to=2026-12-31',path='revenue/profit?'+query;
const buffet={status:'confirmed',course:'classic',people:45,bill_people:50,fee:100000,supply:2100000,vat:210000,total:2310000};
const reception={status:'confirmed',course:'cf-classic',people:50,food:1750000,fee:200000,supply:1950000,vat:195000,total:2145000,vat_excluded:true};
const value={status:'confirmed',course:'cf-value-10000',people:50,food:500000,fee:30000,supply:530000,vat:53000,total:583000,vat_excluded:true};
const cocktail={status:'confirmed',cups:100,price:1200000,bartender_fee:200000,subtotal:1400000,vat:140000,total:1540000,vat_excluded:true};
function setup(t){t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-01T00:00:00Z')});const f=fixture();t.after(()=>f.db.close());return f;}
function booking(db,code,{rental=500000,extras=[],amount,space=first,date=day,name=code,status='confirmed',inquiryData={}}={}) {
  const total=amount===undefined?rental+extras.reduce((n,line)=>n+line.amount,0):amount,ref='MS-'+code;
  db.prepare(`INSERT INTO inquiries(ref,space_id,status,name,event_date,data,created_at) VALUES(?,?,'예약 확정',?,?,?,?)`)
    .run(ref,space,name,date,JSON.stringify(inquiryData),stamp);
  db.prepare(`INSERT INTO bookings(booking_code,inquiry_ref,space_id,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at)
    VALUES(?,?,?,?,'01012345678','5678',?,999,?,?,10,17,?)`).run(code,ref,space,name,date,status,total,stamp);
  db.prepare(`INSERT INTO quotes(quote_no,inquiry_ref,customer,event_date,total,data,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run('Q-'+code,ref,name,date,total??0,JSON.stringify({input:{space},subtotal:rental,discount:0,lines:[{label:'공간 대관료',amount:rental}],extras,total}),stamp);
  return ref;
}
const food=(kind,snapshot,amount=snapshot.total)=>({kind,label:kind==='catering'?'출장뷔페':kind==='reception'?'케이터링':'칵테일',amount,[kind]:snapshot});
function payment(db,code,amount,kind='receipt'){db.prepare('INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES(?,?,?,?,?)').run(code,crypto.randomUUID(),kind,amount,stamp);}
const row=(r,code)=>r.items.find(item=>item.booking_code===code);

test('부가세 포함 예약금액에서 사용자 확정 마진·칵테일 공급원가를 빼고 부분 수납과 무관한 예상이익을 계산한다',async t=>{
  const {db,api}=setup(t);
  booking(db,'BUFFET',{extras:[food('catering',buffet)]});booking(db,'CLASSIC',{extras:[food('reception',reception)]});
  booking(db,'VALUE',{extras:[food('reception',value)]});booking(db,'COCKTAIL',{extras:[food('cocktail',cocktail)]});booking(db,'VENUE');
  booking(db,'MIXED',{extras:[food('reception',value),food('cocktail',cocktail)]});
  const old={...cocktail,price:400000,subtotal:600000,vat:60000,total:660000};
  booking(db,'LOSS',{rental:0,extras:[food('cocktail',old)]});
  const r=await api(path);
  for(const [code,cost,profit] of [['BUFFET',1650000,1160000],['CLASSIC',1870000,775000],['VALUE',418000,665000],
    ['COCKTAIL',880000,1160000],['VENUE',0,500000],['MIXED',1298000,1325000],['LOSS',880000,-220000]]) {
    assert.equal(row(r,code).complete,true,code);assert.equal(row(r,code).serviceCost,cost,code);assert.equal(row(r,code).profit,profit,code);
  }
  assert.equal(r.summary.contractAmount,12361000);assert.equal(r.summary.totalCost,6996000);assert.equal(r.summary.totalProfit,5365000);
  assert.equal(r.summary.knownProfit,5365000);assert.equal(r.summary.coverage,1);
  assert.equal(row(r,'BUFFET').lines.find(line=>line.kind==='catering').quantity,50,'예약 인원999명이나 실제 인원45명이 아니라 저장된 계산 인원50명을 쓴다');
  assert.equal(r.policy.vatBasis,'included');assert.equal(r.policy.bartenderTreatment,'retained');assert.equal(r.policy.cocktailTable[0].margin,400000);
  const headline=(await api('revenue?'+query)).bookingSummary;assert.equal(r.summary.contractAmount,headline.booked);
  payment(db,'BUFFET',100000);payment(db,'BUFFET',200000,'refund');payment(db,'LOSS',9999999);
  assert.deepEqual(await api(path),r,'입금·환불·초과 수납은 계약금액 기준 예상이익을 바꾸지 않는다');
});

test('무료·할인 판매도 저장된 전체 서비스 원가를 유지하고 면제한 출장비에서 이익을 만들지 않는다',async t=>{
  const {db,api}=setup(t);
  booking(db,'FREE-FOOD',{rental:0,extras:[food('cocktail',cocktail,0)]});booking(db,'FREE-VENUE',{rental:0});
  const waived={...buffet,fee:0,supply:2000000,vat:200000,total:2200000};
  const reduced={...buffet,fee:50000,supply:2050000,vat:205000,total:2255000};
  booking(db,'WAIVED',{rental:0,extras:[food('catering',waived)]});booking(db,'REDUCED',{rental:0,extras:[food('catering',reduced)]});
  const r=await api(path);
  assert.equal(row(r,'FREE-FOOD').serviceCost,880000);assert.equal(row(r,'FREE-FOOD').profit,-880000);
  assert.equal(row(r,'FREE-VENUE').profit,0);assert.equal(row(r,'FREE-VENUE').complete,true);
  assert.equal(row(r,'WAIVED').serviceCost,1650000);assert.equal(row(r,'WAIVED').profit,550000);
  assert.equal(row(r,'REDUCED').serviceCost,1650000);assert.equal(row(r,'REDUCED').profit,605000);
});

test('인원·세금·포함 범위·기타 원가·변경 견적 미정은 0원으로 바꾸지 않고 전체 이익을 미정으로 둔다',async t=>{
  const {db,api}=setup(t);booking(db,'KNOWN');
  booking(db,'NO-PEOPLE',{extras:[food('catering',{...buffet,bill_people:null})]});
  booking(db,'LEGACY-TAX',{extras:[food('reception',{...reception,vat_excluded:false})]});
  const unpricedRef=booking(db,'UNPRICED',{amount:null});db.prepare('DELETE FROM quotes WHERE inquiry_ref=?').run(unpricedRef);
  booking(db,'CLEANING',{extras:[{label:'청소 지원',amount:0}]});
  booking(db,'BAD-COST',{extras:[food('catering',{...buffet,supply:100000,vat:10000,total:110000})]});
  booking(db,'OLD-FOOD',{extras:[food('catering',buffet)]});db.prepare("UPDATE bookings SET amount=100000 WHERE booking_code='OLD-FOOD'").run();
  const r=await api(path);
  assert.equal(r.summary.bookingCount,7);assert.equal(r.summary.completeBookingCount,1);assert.equal(r.summary.unknownBookingCount,6);
  assert.equal(r.summary.totalProfit,null);assert.equal(r.summary.totalCost,null);assert.equal(r.summary.knownProfit,500000);assert.equal(r.summary.amountUnknownCount,1);
  for(const code of ['NO-PEOPLE','LEGACY-TAX','UNPRICED','CLEANING','BAD-COST','OLD-FOOD']) {
    assert.equal(row(r,code).complete,false,code);assert.equal(row(r,code).profit,null,code);assert.ok(row(r,code).reasons.length,code);
  }
  assert.ok(row(r,'NO-PEOPLE').reasons.some(reason=>reason.code==='billed_people_unknown'));
  assert.ok(row(r,'LEGACY-TAX').reasons.some(reason=>reason.code==='service_tax_unknown'));
  assert.ok(row(r,'OLD-FOOD').reasons.some(reason=>reason.code==='contract_changed'));
  assert.equal(row(r,'UNPRICED').lines[0].cost,0);assert.equal(row(r,'UNPRICED').lines[0].profit,null);
});

test('현재 칵테일 공급가 설정만 읽어 과거 판매가와 구분하며 실제 공급원가가 없는 새 가격을 임의 소급하지 않는다',async t=>{
  const {db,api}=setup(t);booking(db,'COCKTAIL',{rental:0,extras:[food('cocktail',cocktail)]});
  db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run('cocktail_pricing',JSON.stringify({revision:3,packages:
    [100,200,300,400].map((cups,index)=>({cups,vendor_supply:[900000,1100000,1500000,1800000][index],sale_price:[2000000,1800000,2300000,2700000][index]}))}),stamp);
  const before=db.prepare('SELECT value FROM settings WHERE key=?').get('cocktail_pricing').value;
  const r=await api(path);assert.equal(row(r,'COCKTAIL').contractAmount,1540000);assert.equal(row(r,'COCKTAIL').serviceCost,990000);
  assert.equal(row(r,'COCKTAIL').profit,550000);assert.equal(r.policy.cocktailRevision,3);
  assert.equal(db.prepare('SELECT value FROM settings WHERE key=?').get('cocktail_pricing').value,before);
});

test('청소·매니저·현수막 마진은 부가세 포함이며 할인과 무료 판매에도 저장한 전체 원가를 유지한다',async t=>{
  const {db,api}=setup(t);
  function addon(code,{label,amount,option,discount=0,manager}) {
    const rental=500000,total=rental+amount-discount;
    booking(db,code,{amount:total});
    db.prepare('UPDATE quotes SET total=?,data=? WHERE inquiry_ref=?').run(total,JSON.stringify({input:{space:first,opts:{[option]:manager||true}},
      subtotal:rental+amount,discount,lines:[{label:'공간 대관료',amount:rental},{label,amount}],extras:[],total}),'MS-'+code);
  }
  addon('CLEAN',{label:'청소 지원',amount:200000,option:'cleaning'});
  addon('MANAGER',{label:'현장 매니저',amount:100000,option:'manager',manager:{on:true,count:1,hours:4}});
  addon('BANNER',{label:'현수막',amount:120000,option:'banner'});
  addon('DISCOUNT',{label:'청소 지원',amount:200000,option:'cleaning',discount:100001});
  addon('FREE-ADDON',{label:'청소 지원',amount:200000,option:'cleaning',discount:700000});
  addon('NO-QUANTITY',{label:'현장 매니저',amount:100000,option:'manager',manager:{on:true}});
  addon('XBANNER',{label:'X배너',amount:70000,option:'xbanner'});
  addon('HALF-HOUR',{label:'현장 매니저',amount:100000,option:'manager',manager:{on:true,count:1,hours:2.5}});
  addon('OPTION-NOT-IN-LINES',{label:'공간 인원',amount:100000,option:'cleaning'});
  const r=await api(path);
  for(const [code,cost,profit] of [['CLEAN',90000,610000],['MANAGER',60000,540000],['BANNER',80000,540000],
    ['DISCOUNT',90000,509999],['FREE-ADDON',90000,-90000],['HALF-HOUR',75000,525000]]) {
    assert.equal(row(r,code).complete,true,code);assert.equal(row(r,code).serviceCost,cost,code);assert.equal(row(r,code).profit,profit,code);
  }
  assert.equal(row(r,'MANAGER').lines.find(line=>line.kind==='manager').quantity,4,'예약시간7시간이 아니라 저장된 매니저 이용시간4시간을 적용한다');
  assert.equal(row(r,'DISCOUNT').lines.reduce((sum,line)=>sum+line.sale,0),599999,'할인 비례배분은 원 단위로 전체 계약금액과 일치한다');
  for(const code of ['NO-QUANTITY','XBANNER','OPTION-NOT-IN-LINES'])assert.equal(row(r,code).complete,false,code);
  assert.equal(row(r,'XBANNER').lines.some(line=>line.kind==='banner'),false,'X배너에 현수막 마진을 적용하지 않는다');
});

test('기간·지점·상태·테스트 제외와 월 합계는 상단 예약 집합을 공유하고 수납 필터·페이지와 독립적이다',async t=>{
  const {db,api,env}=setup(t);booking(db,'NOV');booking(db,'DEC',{date:'2026-12-01',space:second});booking(db,'EXTERNAL',{space:'external-host'});
  for(const [code,options] of [['TEST-A',{name:'최준원'}],['TEST-B',{name:' 최시준 '}],['CANCELLED',{status:'cancelled'}],['REVIEW',{status:'payment_review'}]])booking(db,code,options);
  booking(db,'OUTSIDE',{date:'2027-01-01'});
  const r=await api(path),headline=(await api('revenue?'+query)).bookingSummary;
  assert.equal(r.summary.bookingCount,3);assert.equal(r.summary.contractAmount,headline.booked);assert.equal(r.summary.totalProfit,1500000);
  assert.deepEqual(r.monthly.map(month=>month.month),Array.from({length:12},(_,index)=>'2026-'+String(index+1).padStart(2,'0')));
  assert.equal(r.monthly.reduce((n,month)=>n+month.knownProfit,0),r.summary.knownProfit);
  assert.equal(r.monthly[0].totalProfit,0);assert.equal(r.monthly[10].totalProfit,1000000);assert.equal(r.monthly[11].totalProfit,500000);
  assert.deepEqual((await api(path+'&category=food&channel=payapp&component=catering&day=2026-11-01')).summary,r.summary);
  assert.equal((await api(path+'&space='+second)).summary.totalProfit,500000);assert.equal((await api(path+'&space=unassigned')).items[0].booking_code,'EXTERNAL');
  const custom=await revenueProfitAdmin({env,url:new URL('https://local.test/api/admin/'+path),method:'GET',operationalBookingSql:'1=1 OR 1=1'});
  assert.equal((await custom.json()).summary.bookingCount,3);
});

test('견적 없는 포함 식음료는 명시된 예약·문의의 저장 범위만 사용하고 별도·형제 서비스는 이익에 섞지 않는다',async t=>{
  const {db,api}=setup(t);
  const directRef=booking(db,'DIRECT',{amount:2810000});
  const inquiryRef=booking(db,'INQUIRY',{amount:2645000,inquiryData:{}});
  db.prepare('UPDATE inquiries SET data=? WHERE ref=?').run(JSON.stringify({reception,included_reception_amount:2145000,reception_in_quote:true}),inquiryRef);
  const excludedRef=booking(db,'SEPARATE',{inquiryData:{}});
  db.prepare('UPDATE inquiries SET data=? WHERE ref=?').run(JSON.stringify({catering:buffet,included_catering_amount:0,catering_in_quote:false}),excludedRef);
  for(const ref of [directRef,inquiryRef,excludedRef])db.prepare('DELETE FROM quotes WHERE inquiry_ref=?').run(ref);
  db.prepare(`INSERT INTO catering_orders(ref,inquiry_ref,booking_code,space_id,event_date,customer,status,total,data,created_at)
    VALUES('C-DIRECT',?, 'DIRECT',?,?,'저장 고객','confirmed',?,?,?)`).run(directRef,first,day,buffet.total,
      JSON.stringify({...buffet,include_in_booking:true,included_amount:buffet.total}),stamp);
  booking(db,'SIBLING',{date:'2026-11-21',amount:2645000});db.prepare("UPDATE bookings SET inquiry_ref=? WHERE booking_code='SIBLING'").run(inquiryRef);
  db.prepare("DELETE FROM quotes WHERE inquiry_ref='MS-SIBLING'").run();
  booking(db,'MISMATCH',{extras:[{kind:'catering',label:'출장뷔페',amount:2310000}],inquiryData:{}});
  db.prepare("UPDATE inquiries SET data=? WHERE ref='MS-MISMATCH'").run(JSON.stringify({catering:{...buffet,total:2200000,supply:2000000,vat:200000}}));
  const r=await api(path);
  assert.equal(row(r,'DIRECT').profit,1160000);assert.equal(row(r,'INQUIRY').profit,775000);
  assert.equal(row(r,'SEPARATE').profit,500000);assert.equal(row(r,'SEPARATE').serviceCost,0);
  assert.equal(row(r,'SIBLING').profit,null,'다른 이용일의 문의 서비스 구성으로 비용을 확정하지 않는다');
  assert.equal(row(r,'MISMATCH').profit,null,'원래 구성이 없는 견적에 다른 판매금액의 최신 서비스를 대신 사용하지 않는다');
});

test('일치하는 대관 견적이라도 포함 표시된 활성 식음료가 빠지면 비용 미정이며 명시적 제외·취소·삭제는 보존한다',async t=>{
  const {db,api}=setup(t);
  booking(db,'FLAGGED',{inquiryData:{catering:buffet,catering_in_quote:true}});
  booking(db,'EXPLICIT-ZERO',{inquiryData:{catering:buffet,catering_in_quote:true,included_catering_amount:0}});
  booking(db,'CANCELLED-FOOD',{inquiryData:{catering:{...buffet,status:'cancelled'},catering_in_quote:true}});
  booking(db,'REMOVED-FOOD',{inquiryData:{catering:{...buffet,removed:true},catering_in_quote:true}});
  for(const [code,label] of [['BBQ-PACKAGE','바베큐 패키지'],['SNACK-PACKAGE','다과 패키지']]) {
    const ref=booking(db,code);db.prepare('UPDATE quotes SET data=? WHERE inquiry_ref=?').run(JSON.stringify({input:{space:first},
      subtotal:500000,discount:0,lines:[{label,amount:500000}],extras:[],total:500000}),ref);
  }
  const r=await api(path);
  assert.equal(row(r,'FLAGGED').complete,false);assert.equal(row(r,'FLAGGED').profit,null);
  assert.ok(row(r,'FLAGGED').reasons.some(reason=>reason.code==='included_service_not_in_quote'));
  for(const code of ['EXPLICIT-ZERO','CANCELLED-FOOD','REMOVED-FOOD'])assert.equal(row(r,code).profit,500000,code);
  for(const code of ['BBQ-PACKAGE','SNACK-PACKAGE'])assert.equal(row(r,code).profit,null,'식음료 패키지를 원가0원 대관으로 처리하지 않는다');
});

test('90건 배치를 넘는 구성 조회와 50건 페이지도 전체 합계를 유지하고 인증·미들웨어에서 금전 쓰기나 발송이 없다',async t=>{
  const {db,api,env,handle}=setup(t);await ensureSchema(env);
  for(let index=0;index<103;index++)booking(db,'BOOK-'+String(index).padStart(3,'0'),{rental:1000});
  const prepare=env.DB.prepare.bind(env.DB);let queries=0;env.DB.prepare=sql=>{queries++;assert.match(sql.trim(),/^(SELECT|WITH)\b/i);return prepare(sql);};
  const before=db.prepare('SELECT total_changes() AS n').get().n;
  const pages=[];for(let page=1;page<=3;page++){queries=0;pages.push(await api(path+'&page='+page));assert.equal(queries,6,'예약 집합1·정산2·구성2·가격설정1로 개별 예약마다 조회를 반복하지 않는다');}
  assert.deepEqual(pages.map(r=>r.items.length),[50,50,3]);assert.ok(pages.every(r=>r.summary.totalProfit===103000));
  assert.equal(new Set(pages.flatMap(r=>r.items.map(item=>item.booking_code))).size,103);
  assert.equal((await handle(new Request('https://local.test/api/admin/'+path))).status,401);
  for(const suffix of ['&page=0','&page=1.5','&page=100001','&space=other'])await api(path+suffix,'GET',undefined,400);
  await api(path,'POST',{},405);
  let jobs=0;const request=new Request('https://local.test/api/admin/'+path,{headers:{'x-admin-key':env.ADMIN_KEY}});
  assert.equal((await middleware({env,request,next:()=>handle(request),waitUntil:()=>jobs++})).status,200);assert.equal(jobs,0);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,before);
  assert.doesNotMatch(JSON.stringify(pages[0]),/01012345678|phone|confirm_doc|inquiry_data|quote_data/);
});


test('식음료 단독 원가는 적용된 서비스로 계산하고 미확인 차액을 대관 이익으로 잡지 않는다',async t=>{
  const {db,api}=setup(t),space='food-only';
  const inquiryData={reception,included_reception_amount:reception.total,reception_in_quote:true};
  booking(db,'FOOD-EXACT',{space,rental:0,amount:reception.total,inquiryData});
  booking(db,'FOOD-REMAINDER',{space,amount:reception.total+250000,inquiryData});
  booking(db,'FOOD-LEGACY',{space,amount:250000});
  booking(db,'VENUE',{rental:200000});
  const r=await api(path+'&space='+space);
  assert.equal(r.items.length,3);
  const exact=row(r,'FOOD-EXACT');
  assert.deepEqual([exact.complete,exact.serviceCost,exact.profit],[true,1870000,275000]);
  assert.deepEqual(exact.lines.map(line=>line.kind),['reception']);
  for(const code of ['FOOD-REMAINDER','FOOD-LEGACY']) {
    const item=row(r,code);
    assert.equal(item.complete,false);
    assert.equal(item.profit,null);
    assert.ok(item.reasons.some(reason=>reason.code==='food_composition_unknown'));
    assert.equal(item.lines.some(line=>line.kind==='rental'),false);
  }
});
