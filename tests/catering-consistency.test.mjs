import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {cateringQuote,cateringFrom,cateringAdmin} from '../functions/api/_catering.js';
import {foodExtras,syncFoodInput} from '../functions/api/_food_services.js';
import {foodHtml} from '../functions/api/_food_html.js';
import {readFoodPricing,publicFoodPricing,foodPricingData,saveFoodPricing} from '../functions/api/_food_pricing.js';
import {onRequestPost as inquire} from '../functions/api/inquiry.js';
import {fixture,DAY,saveQuote,quoteInput} from './helpers/admin-fixture.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function browser(){
 const ctx={window:{MEGASPOT:{esc:String}},URLSearchParams,location:{search:''},sessionStorage:{getItem(){return null;},setItem(){}}};
 vm.createContext(ctx);
 for(const path of ['data/catering.js','catering-calc.js','event-plan.js'])vm.runInContext(source('assets/js/'+path),ctx);
 return {calc:ctx.window.MEGASPOT_CATERING_CALC,plan:ctx.window.MEGASPOT.eventPlan};
}
test('31–39 meal prices use the live 30-person tier, with one setup fee and VAT on the full supply', async t => {
 const {calc}=browser();
 for (const [people,meal] of [[20,1200000],[21,1500000],[29,1500000],[30,1500000],[31,1550000],[34,1700000],[39,1950000]]) {
  for (const fee of [0,75000,100000]) {
   const expected=Math.round((meal+fee)*1.1),input={course:'small',people,fee};
   const client=calc.quote(input),server=cateringAdmin(input);
   assert.equal(client.total,expected);
   assert.equal(server.total,expected);
   assert.equal(client.billPeople,server.bill_people);
   if (people>30) {
    assert.equal(client.billPeople,people);
    assert.match(client.lines[0].label,new RegExp('50,000원 × '+people+'명'));
    assert.match(server.summary,new RegExp(people+'명'));
    assert.equal(foodExtras([{kind:'catering',amount:expected,catering:server}],{}).amount,expected);
   }
  }
 }
 const f=fixture();t.after(()=>f.db.close());
 const config=await readFoodPricing(f.env,'catering');
 await saveFoodPricing(f.env,'catering',{...config,rows:config.rows.map(row=>row.id==='course.small.30'?{...row,sale_price:1800000}:row)});
 const live=foodPricingData('catering',await readFoodPricing(f.env,'catering'));
 calc.course('small').tiers[1].price=1800000;
 assert.equal(calc.quote({course:'small',people:34}).total,2354000);
 assert.equal(cateringQuote({course:'small',people:34},undefined,live).total,2354000);
});

test('extended small buffet survives quote save, booking changes and confirmation without rewriting an older quote', async t => {
 const f=fixture({booking:true});t.after(()=>f.db.close());
 const original=cateringQuote({course:'small',people:30});
 const extra={kind:'catering',label:'출장뷔페',amount:original.total,catering:original};
 await saveQuote(f.api,{total:700000+original.total,input:quoteInput({extras:[extra]}),extras:[extra]});
 const oldQuote=(await f.api('inquiries/MS-TEST')).quotes[0];
 for (const [people,amount] of [[34,1980000],[39,2255000],[30,1760000]]) {
  const saved=await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:{course:'small',people},status:'confirmed'});
  assert.equal(saved.item.total,amount);
  assert.equal(saved.item.bill_people,people);
  const detail=await f.api('inquiries/MS-TEST');
  assert.equal(detail.item.data.catering.total,amount);
  assert.equal(detail.item.effective_amount,700000+amount);
  assert.equal((await f.api('bookings')).items[0].amount,700000+amount);
  const confirmation=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:700000+amount}});
  const buffet=confirmation.doc.food_services.find(row=>row.kind==='catering');
  assert.equal(buffet.people,people);
  assert.equal(buffet.total,amount);
  const old=detail.quotes.find(row=>row.quote_no===oldQuote.quote_no);
  assert.equal(old.total,oldQuote.total);
  assert.equal(old.data.extras[0].catering.people,30);
 }
});

test('small buffet from 40 guests keeps preferences and requires a different course',()=>{
 const {calc}=browser();
 for(const people of [40,60,200]){
  const input={on:true,course:'small',people,bbq:'kg40',beer:2,total:1};
  const publicQuote=calc.quote(input),server=cateringFrom(input);
  assert.equal(publicQuote.requiresConsultation,true);assert.equal(server.requires_consultation,true);
  for(const key of ['supply','vat','total','fee']){assert.equal(publicQuote[key],null);assert.equal(server[key],null);}
  assert.equal(publicQuote.lines.length,0);assert.equal(server.people,people);assert.equal(server.bbq,'kg40');assert.equal(server.beer,2);
  assert.match(calc.summary(publicQuote),/상담 후 견적/);assert.doesNotMatch(calc.summary(publicQuote),/1,760,000|0원|null명/);
  assert.equal(cateringAdmin(input),null);
  assert.match(foodExtras([{kind:'catering',amount:1760000,catering:input}],{}).error,/구성과 금액/);
  assert.equal(syncFoodInput({extras:[]},{catering:server},true).extras.length,0);
 }
 for(const people of [20,30])assert.equal(calc.quote({course:'small',people}).total,cateringQuote({course:'small',people}).total);
 assert.equal(calc.quote({course:'small',people:30}).total,1760000);
});
test('combined inquiry subtotal excludes an oversized small buffet and carries the consultation request',()=>{
 const {calc,plan}=browser(),fields={rv_cat_on:{checked:true},rv_cat_course:{value:'small'},rv_cat_people:{value:'200'},rv_cat_bbq:{value:''},rv_cat_beer:{value:'0'}};
 const root={querySelector(selector){const name=selector.match(/name="([^"]+)"/);return name?fields[name[1]]||null:null;}};
 const selected=calc.read(root,'rv_cat',200);assert.equal(selected.total,null);assert.equal(selected.requires_consultation,true);
 const quote=plan.quote(root,{total:500000,deposit:150000,people:200});
 assert.equal(quote.total,500000);assert.equal(quote.incomplete,true);assert.match(quote.html,/코스 상담 필요 · 합계 미포함/);assert.match(quote.text,/출장뷔페.*상담 후 안내/);assert.doesNotMatch(quote.html,/1,760,000/);
});
test('customer consultation is saved without a price and administrator cannot convert it into a priced order',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const response=await inquire({env:f.env,request:new Request('https://local.test/api/inquiry',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'10.4.0.31'},body:JSON.stringify({name:'코스 상담',phone:'010-1234-5678',agree_privacy:true,space_id:'megaspot-gundae',date:DAY,headcount:200,message:'200명 식사 코스 상담',catering:{on:true,course:'small',people:200,total:1760000}})})});
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
 const saved=JSON.parse(f.db.prepare('SELECT data FROM inquiries WHERE ref=?').get(result.ref).data).catering;
 assert.equal(saved.total,null);assert.equal(saved.people,200);assert.equal(saved.requires_consultation,true);
 await f.api('catering/orders','POST',{inquiry_ref:result.ref,config:{course:'small',people:200},status:'confirmed'},400);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM catering_orders').get().n,0);
});
test('admin calculator, customer prose, order prose and quote actions cannot turn an unpriced request into zero won',()=>{
 const {calc}=browser(),code=source('assets/js/pages/admin.js');
 const actual=name=>{const start=code.indexOf('  function '+name+'('),end=code.indexOf('\n  function ',start+1);assert(start>=0);return code.slice(start,end);};
 const boxes={'#ct-result':{},'#ct-internal':{},'#ct-msg':{}},messages=[],Q={extras:[]};let writes=0;
 const ctx={CC:calc,CT:{course:'small',people:200,status:'pending',target:{ref:'MS-TEST'}},CR:null,Q,M:{toast(message){messages.push(message);}},esc:String,$:selector=>boxes[selector],ctRead(){},A(){writes++;},window:{}};
 vm.createContext(ctx);
 for(const name of ['ctCalc','ctCustText','ctOrderText','ctToQuote','ctSave'])vm.runInContext(actual(name),ctx);
 ctx.ctCalc();assert.match(boxes['#ct-result'].innerHTML,/상담 후 견적 · 합계 미포함/);assert.doesNotMatch(boxes['#ct-result'].innerHTML,/0원|null명/);
 assert.match(ctx.ctCustText(),/상담 후 견적/);assert.equal(ctx.ctOrderText(),'');ctx.ctToQuote();ctx.ctSave();
 assert.equal(writes,0);assert.equal(Q.extras.length,0);assert.equal(messages.length,2);assert(messages.every(message=>message.includes('39인까지')));
});
test('catalog IDs keep classic, galbi, other foods and bottle drinks independent across HTML, metadata and structured FAQs',async()=>{
 const catering=publicFoodPricing(await readFoodPricing(null,'catering')),reception=publicFoodPricing(await readFoodPricing(null,'reception'));
 Object.assign(catering.prices,{'course.classic':46000,'course.galbi':47000,'course.partyB':37000,'course.basic':41000,delivery:150000,beer:130000});
 const html=foodHtml(source('catering/index.html'),'/catering/',{catering,reception}),text=html.replace(/<[^>]*>/g,'');
 const field=id=>[...html.matchAll(new RegExp('<data data-catering-price="'+id.replaceAll('.','\\.')+'" value="(\\d+)">([^<]+)</data>','g'))];
 for(const [id,price] of [['course.classic',46000],['course.galbi',47000],['course.partyB',37000],['delivery',150000],['beer',130000]]){const fields=field(id);assert(fields.length>0,id);assert(fields.every(match=>Number(match[1])===price&&match[2]===price.toLocaleString('ko-KR')),id);}
 assert.match(text,/특선 갈비탕 상차림\(1인 47,000원\)/);assert.match(text,/식사 46,000원 × 60명/);
 assert.match(html,/<title>메가스팟 출장뷔페 \| 1인 41,000원부터/);assert.doesNotMatch(html,/3만 5천/);
 assert.match(html,/빌라 엠 비앙코<\/span><b>35,000원/);
 const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
 const offers=graph.find(item=>item['@type']==='Service').offers;assert.equal(offers.lowPrice,'33000');assert.equal(offers.highPrice,'90000');assert.equal(offers.offerCount,'9');
 const faq=graph.find(item=>item['@type']==='FAQPage').mainEntity.find(item=>item.name.startsWith('식사 말고'));
 assert.match(faq.acceptedAnswer.text,/갈비탕 상차림\(1인 47,000원\)/);assert.match(faq.acceptedAnswer.text,/B\(1인 37,000원\)/);assert.doesNotMatch(faq.acceptedAnswer.text,/<data|46,000/);
});
test('published PDF snapshots and live-price templates both contain the course-specific live-station and cancellation conditions',t=>{
 const extract=(file,page)=>{const result=spawnSync('pdftotext',['-layout','-f',String(page),'-l',String(page),fileURLToPath(new URL('../'+file,import.meta.url)),'-'],{encoding:'utf8'});if(result.error?.code==='ENOENT'){t.skip('pdftotext is not installed');return null;}assert.equal(result.status,0,result.stderr);return result.stdout;};
 for(const suffix of ['guide','pricing-template']){
  const regular=extract('assets/docs/megaspot-catering-'+suffix+'.pdf',4);if(regular===null)return;
  assert.match(regular,/즉석 코너\s*·\s*100인 이상/);
  assert.match(extract('assets/docs/megaspot-catering-'+suffix+'.pdf',9),/즉석 코너\s*·\s*50인 이상/);
  assert.match(extract('assets/docs/megaspot-reception-'+suffix+'.pdf',17),/변경·취소[\s\S]*인원 변경·취소 가능 시점[\s\S]*발생 비용/);
 }
});
