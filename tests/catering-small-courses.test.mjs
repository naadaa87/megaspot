import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {cateringQuote} from '../functions/api/_catering.js';
import {definitions,readFoodPricing,publicFoodPricing,foodPricingData,saveFoodPricing} from '../functions/api/_food_pricing.js';
import {foodHtml} from '../functions/api/_food_html.js';
import F from '../assets/js/food-services.js';
import {quoteUi} from './helpers/admin-quote-fixture.mjs';
import {fixture,saveQuote,quoteInput,DAY} from './helpers/admin-fixture.mjs';

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
function browser(pricing){
 const ctx=vm.createContext({window:{MEGASPOT_FOOD_RATES:pricing?{catering:pricing}:{}},URLSearchParams,location:{search:''},sessionStorage:{getItem(){return null;}}});
 for(const file of ['food-pricing','data/catering','catering-calc'])vm.runInContext(source('assets/js/'+file+'.js'),ctx);
 return ctx;
}

test('small Basic and Special use actual headcount in the selected 20/30 tier, including the intentional Basic 29-to-30 discount',()=>{
 const calc=browser().window.MEGASPOT_CATERING_CALC;
 for(const [course,twenty,thirty] of [['small-basic',52500,50000],['small-special',60000,60000]]){
  for(const people of [1,19,20,23,29,30,31,34,39]){
   const billed=Math.max(20,people),unit=billed<30?twenty:thirty;
   for(const fee of [0,75000,100000])for(const beer of [0,1]){
    const expected=(unit*billed+fee+beer*120000)*1.1;
    const client=calc.quote({course,people,fee,beer}),server=cateringQuote({course,people,beer},fee);
    assert.equal(client.total,Math.round(expected));
    assert.equal(server.total,client.total);
    assert.equal(client.billPeople,billed);
    assert.equal(server.tier_people,billed<30?20:30);
    assert.equal(client.course.tierPeople,server.tier_people);
   }
  }
  assert.equal(calc.quote({course,people:40}).requiresConsultation,true);
  assert.equal(cateringQuote({course,people:40}).requires_consultation,true);
 }
 assert.equal(calc.quote({course:'small-basic',people:23}).total,1438250);
 assert.equal(calc.quote({course:'small-special',people:23}).total,1628000);
 assert.equal(calc.quote({course:'small-basic',people:29}).total,1784750);
 assert.equal(calc.quote({course:'small-basic',people:30}).total,1760000);
 assert(!calc.courses().some(c=>c.id==='small'));
 assert(calc.courses('small').some(c=>c.id==='small'));
 assert.equal(calc.quote({course:'small',people:23}).total,1760000,'legacy saved quotes retain the old 30-meal tier');
});

test('existing persisted price tables acquire four small-course rows without overwriting other prices or exposing supplier costs',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const oldRows=definitions('catering').filter(r=>!/^course.small-(basic|special)\./.test(r.id));
 oldRows.find(r=>r.id==='course.classic').sale_price=47123;
 f.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run('catering_pricing',JSON.stringify({revision:7,updated_at:'2026-11-01',rows:oldRows}),'2026-11-01');
 const config=await readFoodPricing(f.env,'catering');
 assert.equal(config.revision,7);
 assert.equal(config.rows.find(r=>r.id==='course.classic').sale_price,47123);
 for(const [id,sale,cost] of [['small-basic.20',1050000,850000],['small-basic.30',1500000,1200000],['small-special.20',1200000,1050000],['small-special.30',1800000,1500000]]){
  const row=config.rows.find(r=>r.id==='course.'+id);assert.equal(row.sale_price,sale);assert.equal(row.vendor_supply,cost);
 }
 const publicPricing=publicFoodPricing(config);
 assert(!JSON.stringify(publicPricing).includes('vendor_supply'));
 const updated={...config,rows:config.rows.map(r=>r.id==='course.small-basic.20'?{...r,sale_price:1100000}:r)};
 assert.equal((await saveFoodPricing(f.env,'catering',updated)).config.revision,8);
 const next=await readFoodPricing(f.env,'catering');
 assert.equal(cateringQuote({course:'small-basic',people:23},undefined,foodPricingData('catering',next)).total,1501500);
 assert.equal(browser(publicFoodPricing(next)).window.MEGASPOT_CATERING_CALC.quote({course:'small-basic',people:23}).total,1501500);
 const html=foodHtml(source('catering/index.html'),'/catering/',{catering:publicFoodPricing(next),reception:publicFoodPricing(await readFoodPricing(f.env,'reception'))});
 assert(html.includes('course.small-basic.20" value="1100000">1,100,000'));
 assert(!html.includes('data-catering-price="course.small.20"'));
});

test('real administrator copies select the correct menu, tier and supplier amount for both small courses',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const pricing=await readFoodPricing(f.env,'catering'),settings=await f.api('settings/catering');
 const ctx=browser(publicFoodPricing(pricing));
 Object.assign(ctx,{CC:ctx.window.MEGASPOT_CATERING_CALC,CSET:settings.value,E:{kdateY:x=>x},spaceName:()=> '건대 1호',spaceOk:x=>x,M:{CONFIG:{}},custParts:x=>[x,'']});
 ctx.CD=ctx.CC.data;ctx.won=ctx.CC.won;ctx.window.MEGASPOT_FOOD_ADMIN_PRICES={catering:pricing.rows};
 const admin=source('assets/js/pages/admin.js');
 for(const name of ['ctVendorLines','ctCustText','ctMenuText','ctOrderText']){
  const start=admin.indexOf('  function '+name+'('),end=admin.indexOf('\n  function ',start+1);
  vm.runInContext(admin.slice(start,end),ctx);
 }
 for(const [course,baseCost,newCost] of [['small-basic',42500,40000],['small-special',52500,50000]])for(const people of [23,29,30,34,39]){
  ctx.CT={course,people,fee:100000,space:'megaspot-gundae',customer:'검증 고객'};
  ctx.CR=ctx.CC.quote(ctx.CT);
  const menu=ctx.ctMenuText(),customer=ctx.ctCustText(),order=ctx.ctOrderText(),vendor=ctx.ctVendorLines();
  assert.equal(vendor.unknown,undefined);
  assert.equal(vendor.lines.find(r=>r.key==='course').vendor,(people<30?baseCost:newCost)*people);
  assert(menu.includes(course==='small-basic'?'소규모 베이직':'소규모 스페셜'));
  assert(menu.includes('식사 '+people+'명'));
  assert(customer.includes(ctx.won(ctx.CR.total)));
  assert(customer.includes((people<30?20:30)+'인 코스 단가 × '+people+'명'));
  assert(order.includes((course==='small-basic'?'소수 베이직':'소수 스페셜')+' '+people+'명'));
  assert.doesNotMatch(order,/공급가 미입력|공급가 확인 필요/);
  if(course==='small-basic'){assert(menu.includes('로제햄버거스테이크'));assert(!menu.includes('장어데리야끼'));}
  else {
   assert(menu.includes('왕새우치즈구이'));assert(menu.includes('장어데리야끼구이'));
   assert(menu.includes(people<30?'계절과일모둠3종':'계절과일모둠4종'));
   assert.equal(menu.includes('연어스테이크&크림소스'),people>=30);
  }
 }
});

test('saving and changing new small courses updates inquiry, booking and confirmation once while historical quote snapshots remain intact',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());
 const original=cateringQuote({course:'small',people:30});
 const oldRow={kind:'catering',label:'이전 저장 식사',amount:original.total,catering:original};
 await saveQuote(f.api,{total:630000+original.total,input:quoteInput({extras:[oldRow]}),extras:[oldRow]});
 const old=(await f.api('inquiries/MS-TEST')).quotes[0];
 for(const [course,people] of [['small-basic',23],['small-special',23],['small-basic',29],['small-basic',30],['small-special',34],['small-special',39]]){
  const expected=cateringQuote({course,people});
  const saved=await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:{course,people},status:'confirmed'});
  assert.equal(saved.item.total,expected.total);
  assert.equal(saved.item.tier_people,people<30?20:30);
  const detail=await f.api('inquiries/MS-TEST');
  assert.equal(detail.item.effective_amount,630000+expected.total);
  assert.equal(detail.item.data.quote_input.extras.filter(r=>r.kind==='catering').length,1);
  assert.equal((await f.api('bookings')).items[0].amount,630000+expected.total);
  const confirmation=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:630000+expected.total}});
  const food=confirmation.doc.food_services.find(r=>r.kind==='catering');
  assert.equal(food.people,people);assert.equal(food.tier_people,people<30?20:30);assert.equal(food.total,expected.total);
  assert(F.rows(food,true).flat().join(' ').includes((people<30?20:30)+'인 코스 단가 × '+people+'명'));
  const oldAfter=detail.quotes.find(q=>q.quote_no===old.quote_no);assert.deepEqual(oldAfter.data,old.data);assert.equal(oldAfter.total,old.total);
 }
 const cancelled=await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:{course:'small-special',people:39},status:'cancelled'});
 assert.equal(cancelled.item.status,'cancelled');assert.equal((await f.api('bookings')).items[0].amount,630000);
});


test('recent standalone quotes can switch course and tier, save a new snapshot and print the exact same amounts after reopening',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const original=cateringQuote({course:'small-special',people:23});
 const extras=[{kind:'catering',label:'이름을 수정한 식사',amount:original.total,catering:original}];
 const input=quoteInput({customer:'단독 검증',extras,people:23});
 await f.api('quotes','POST',{inquiry_ref:'',customer:input.customer,event_date:DAY,total:630000+original.total,data:{input,date:DAY,lines:[{label:'공간료',amount:700000}],subtotal:700000,discount:70000,extras,total:630000+original.total,deposit:150000,validUntil:DAY}});
 const old=(await f.api('quotes')).items[0];
 const ui=quoteUi(),ctx=ui.ctx;
 ctx.go=()=>{};
 for(const file of ['data/catering','catering-calc'])vm.runInContext(source('assets/js/'+file+'.js'),ctx);
 ctx.CC=ctx.window.MEGASPOT_CATERING_CALC;
 const code=source('assets/js/pages/admin.js'),start=code.indexOf('  function ctToQuote(){');
 vm.runInContext(code.slice(start,code.indexOf('  /* ---- 예약·문의 불러오기',start)),ctx);
 for(const [course,people] of [['small-basic',29],['small-basic',30],['small-special',34],['small-special',23]]){
  ctx.loadSavedQuote(old,'');
  ctx.CT={course,people,fee:100000,ref:'',date:ctx.Q.date,customer:ctx.Q.customer,space:ctx.Q.space,standaloneQuote:ctx.Q};
  ctx.CR=ctx.CC.quote(ctx.CT);ctx.ctToQuote();
  const expected=630000+ctx.CR.total,doc=ui.documents();
  assert.equal(doc.total,expected);
  assert(doc.text.includes(people+'명'));assert(doc.html.includes((people<30?20:30)+'인 코스 단가 × '+people+'명'));
  const sent=JSON.parse(JSON.stringify(ctx.payload())),saved=await f.api('quotes','POST',sent);
  const next=(await f.api('quotes')).items.find(q=>q.quote_no===saved.quote_no);
  ctx.loadSavedQuote(next,'');const reopened=ui.documents();
  assert.equal(reopened.total,expected);assert(reopened.text.includes(ctx.won(expected)));assert(reopened.html.includes(people+'명'));
  const oldAfter=(await f.api('quotes')).items.find(q=>q.quote_no===old.quote_no);assert.deepEqual(oldAfter.data,old.data);
 }
});
