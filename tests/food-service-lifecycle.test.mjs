import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,quoteInput,saveQuote,DAY} from './helpers/admin-fixture.mjs';
import F from '../assets/js/food-services.js';
import C from '../assets/js/reception-calc.js';
import {cateringAdmin} from '../functions/api/_catering.js';
import {cocktailAdmin} from '../functions/api/_food_services.js';
import {publicDoc} from '../functions/api/_confirm.js';
import O from '../assets/js/inquiry-overview.js';
function setup(t){const f=fixture({booking:true});t.after(()=>f.db.close());return f;}
async function item(f){return(await f.api('inquiries/MS-TEST')).item;}
const buffet=(o={})=>({...cateringAdmin({course:'classic',people:60,...o}),status:o.status||'pending',meal_time:o.meal_time||'18:30'});
const cocktail=(o={})=>cocktailAdmin({cups:100,menus:['mojito','highball'],nonalcohol:true,note:'얼음 요청',...o});
async function initial(f,values){for(const kind of ['catering','cocktail'])if(values[kind])await f.api('inquiries/MS-TEST','PATCH',{[kind]:values[kind]});let it=await item(f),input=C.syncQuote(F.syncQuote(quoteInput({extras:[{label:'추가 장비',amount:80000}]}),it.data,true),it.data,!!it.data.reception);const total=580000+input.extras.filter(x=>x.kind).reduce((n,x)=>n+x.amount,0);await saveQuote(f.api,{input,extras:input.extras,total});return item(f);}
async function issue(f){const it=await item(f);return f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:it.effective_amount,show_amount:true},reception_revision:it.data.reception_revision});}
for(const kind of ['catering','cocktail'])test(kind+' 선택·변경·취소·취소 견적 저장·복원은 문의/예약/견적/확정서에 한 번 반영',async t=>{
 const f=setup(t),first=kind==='catering'?buffet():cocktail(),other=kind==='catering'?'cocktail':'catering',values={catering:buffet(),cocktail:cocktail()};let it=await initial(f,values);const otherAmount=F.amount(other,it.data[other]),base=580000+otherAmount,oldQuote=(await f.api('inquiries/MS-TEST')).quotes[0];assert.equal(it.effective_amount,base+F.amount(kind,first));assert.equal(it.data.quote_input.discVal,10);
 for(const changed of kind==='catering'?[buffet({course:'premium',people:80,bbq:'kg40',beer:2,fee:150000,meal_time:'19:00'})]:[cocktail({cups:200,menus:['gin_tonic'],nonalcohol:false})]){await issue(f);await f.api('inquiries/MS-TEST','PATCH',{[kind]:changed,reception_revision:it.data.reception_revision});it=await item(f);assert.equal(it.effective_amount,base+F.amount(kind,changed));assert.equal((await f.api('bookings')).items[0].amount,it.effective_amount);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);assert.equal(it.data.quote_input.extras.filter(x=>x.kind===kind).length,1);assert.equal(it.data.quote_input.extras.find(x=>x.label==='추가 장비').amount,80000);}
 const selected=it.data[kind];await f.api('inquiries/MS-TEST','PATCH',{[kind]:{...selected,status:'cancelled'}});it=await item(f);assert.equal(it.effective_amount,base);assert.equal(it.data['included_'+kind+'_amount'],0);assert.equal(it.data.quote_input.extras.filter(x=>x.kind===kind).length,0);assert.match(it.data.quote_input.note,/취소/);await saveQuote(f.api,{total:base,input:it.data.quote_input,extras:it.data.quote_input.extras});assert.equal((await item(f)).data[kind+'_in_quote'],true);
 await f.api('inquiries/MS-TEST','PATCH',{[kind]:{...selected,status:'confirmed'}});it=await item(f);assert.equal(it.effective_amount,base+F.amount(kind,selected));assert.equal((await f.api('bookings')).items[0].amount,it.effective_amount);const doc=await issue(f),snapshot=doc.doc.food_services.find(x=>x.kind===kind);assert.equal(snapshot.included,true);assert.equal(snapshot.amount,F.amount(kind,selected));assert.equal(snapshot.status,'confirmed');assert.equal(F.current(oldQuote.data.input,it.data),false);assert.equal((await f.api('inquiries/MS-TEST')).quotes.find(x=>x.quote_no===oldQuote.quote_no).total,oldQuote.total);
 const model=O.build(it,{roomAmount:580000});assert.equal(model.total,it.effective_amount);
});
for(const kind of ['catering','cocktail'])test(kind+' 금액이 같은 세부 구성 변경도 확정서를 무효화하고 오래 열린 화면을 차단',async t=>{
 const f=setup(t);let it=await initial(f,{[kind]:kind==='catering'?buffet():cocktail()}),oldInput=it.data.quote_input,oldRev=it.data.reception_revision;await issue(f);await f.api('inquiries/MS-TEST','PATCH',{[kind]:it.data[kind],reception_revision:oldRev});assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);
 const changed={...it.data[kind],note:'알레르기 구성 변경',...(kind==='catering'?{meal_time:'19:30'}:{menus:['martini'],nonalcohol:false})};await f.api('inquiries/MS-TEST','PATCH',{[kind]:changed,reception_revision:oldRev});const next=await item(f);assert.equal(next.effective_amount,it.effective_amount);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);
 await f.api('inquiries/MS-TEST','PATCH',{[kind]:it.data[kind],reception_revision:oldRev},409);await f.api('quotes','POST',{inquiry_ref:'MS-TEST',total:it.effective_amount,data:{input:oldInput,extras:oldInput.extras}},409);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:it.effective_amount},reception_revision:oldRev},409);
 const doc=await issue(f),snapshot=doc.doc.food_services.find(x=>x.kind===kind);assert.equal(snapshot.note,changed.note);if(kind==='cocktail')assert.deepEqual(snapshot.menu_names,['마티니']);
});
for(const kind of ['catering','cocktail'])test(kind+' 견적에서 명시적으로 제외하면 변경·복원해도 예약 금액 유지',async t=>{
 const f=setup(t);let it=await initial(f,{[kind]:kind==='catering'?buffet():cocktail()});const input={...it.data.quote_input,extras:it.data.quote_input.extras.filter(x=>x.kind!==kind),[kind+'Excluded']:true};await saveQuote(f.api,{total:580000,input,extras:input.extras});for(const status of ['cancelled','confirmed'])await f.api('inquiries/MS-TEST','PATCH',{[kind]:{...it.data[kind],status}});it=await item(f);assert.equal(it.effective_amount,580000);assert.equal((await f.api('bookings')).items[0].amount,580000);assert.equal(it.data.quote_input.extras.filter(x=>x.kind===kind).length,0);assert.equal((await issue(f)).doc.food_services[0].included,false);
});
test('상담 중인 코스 미정 뷔페는 금액 미정으로 가져오고 구성이 정해지면 반영',async t=>{
 const f=setup(t);let it=await initial(f,{catering:buffet({course:'',people:50})});assert.equal(it.data.catering_in_quote,true);assert.match(it.data.quote_input.note,/금액 미정/);assert.equal(it.effective_amount,580000);await f.api('inquiries/MS-TEST','PATCH',{catering:buffet()});it=await item(f);assert.equal(it.effective_amount,580000+it.data.catering.total);
});
test('세 종류 식음료를 함께 저장하고 하나를 취소해도 다른 구성과 할인 유지',async t=>{
 const f=setup(t);await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'light',format:'table',people:50}});let it=await initial(f,{catering:buffet(),cocktail:cocktail()});await f.api('inquiries/MS-TEST','PATCH',{cocktail:{...it.data.cocktail,status:'cancelled'}});let next=await item(f);assert.equal(next.effective_amount,it.effective_amount-F.amount('cocktail',it.data.cocktail));assert.equal(next.data.quote_input.extras.find(x=>x.kind==='reception').amount,1595000);assert.equal(next.data.quote_input.extras.find(x=>x.kind==='catering').amount,it.data.catering.total);assert.equal(next.data.quote_input.discVal,10);const doc=await issue(f);assert.equal(doc.doc.reception.total,1595000);assert.equal(doc.doc.food_services.find(x=>x.kind==='cocktail').status,'cancelled');
});
test('칵테일·뷔페 가격 변조와 중복 항목은 저장되지 않음',async t=>{
 const f=setup(t);for(const [kind,value] of [['catering',buffet()],['cocktail',cocktail()]]){const row=F.extra(kind,value);await f.api('quotes','POST',{inquiry_ref:'MS-TEST',total:10000000,data:{input:quoteInput(),extras:[{...row,amount:1}]}},400);await f.api('quotes','POST',{inquiry_ref:'MS-TEST',total:10000000,data:{input:quoteInput(),extras:[row,row]}},400);}assert.equal((await f.api('inquiries/MS-TEST')).quotes.length,0);
});
test('뷔페 진행 건과 문의의 구성·금액·견적 입력이 동기화되고 삭제 뒤 복원 가능',async t=>{
 const f=setup(t);let it=await initial(f,{catering:buffet()}),order=(await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:it.data.catering,status:'confirmed',meal_time:'18:30',reception_revision:it.data.reception_revision})).item;it=await item(f);assert.equal(it.data.catering.order_ref,order.ref);await issue(f);order=(await f.api('catering/orders/'+order.ref,'PATCH',{config:{course:'premium',people:70,beer:2},status:'confirmed',meal_time:'19:00',reception_revision:it.data.reception_revision})).item;it=await item(f);assert.equal(it.effective_amount,580000+order.total);assert.equal(it.data.quote_input.extras.find(x=>x.kind==='catering').catering.meal_time,'19:00');assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);
 await f.api('catering/orders/'+order.ref,'DELETE',{reception_revision:it.data.reception_revision-1},409);await f.api('catering/orders/'+order.ref,'DELETE',{reception_revision:it.data.reception_revision});it=await item(f);assert.equal(it.effective_amount,580000);assert.equal(it.data.catering.removed,true);assert.equal(it.data.quote_input.extras.some(x=>x.kind==='catering'),false);await saveQuote(f.api,{total:580000,input:it.data.quote_input,extras:it.data.quote_input.extras});await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:buffet(),status:'pending',reception_revision:it.data.reception_revision});it=await item(f);assert.equal(it.effective_amount,580000+it.data.catering.total);
});
test('직접 예약의 뷔페 포함·변경·취소·복원·삭제는 금액과 확정서에 반영',async t=>{
 const f=setup(t);f.db.prepare('UPDATE bookings SET inquiry_ref=NULL WHERE booking_code=?').run('BK-TEST');let revision=0,order;
 for(const step of [{include_in_booking:false,status:'pending',people:60},{include_in_booking:true,status:'confirmed',people:60},{include_in_booking:true,status:'confirmed',people:80},{include_in_booking:true,status:'cancelled',people:80},{include_in_booking:true,status:'confirmed',people:50}]){order=(await f.api('catering/orders','POST',{booking_code:'BK-TEST',config:buffet({people:step.people}),...step,reception_revision:revision})).item;revision=order.reception_revision;const amount=500000+(step.include_in_booking&&step.status!=='cancelled'?order.total:0);assert.equal((await f.api('bookings')).items[0].amount,amount);const c=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(c.inquiry.reception_revision,revision);assert.equal(c.food_services[0].included,step.include_in_booking&&step.status!=='cancelled');await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount},reception_revision:revision});}
 const oldRev=revision;await f.api('catering/orders/'+order.ref,'DELETE',{reception_revision:revision});assert.equal((await f.api('bookings')).items[0].amount,500000);const c=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(c.doc,null);assert(c.inquiry.reception_revision>oldRev);assert.equal(c.food_services.length,0);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000},reception_revision:oldRev},409);
 await f.api('catering/orders','POST',{booking_code:'BK-TEST',config:buffet(),include_in_booking:true,reception_revision:oldRev},409);order=(await f.api('catering/orders','POST',{booking_code:'BK-TEST',config:buffet(),include_in_booking:true,reception_revision:c.inquiry.reception_revision})).item;assert(order.reception_revision>c.inquiry.reception_revision);
});
test('고객 확정서 금액 숨김은 식음료 내역의 금액과 기존 자동 요약도 숨김',async t=>{
 const f=setup(t);await initial(f,{catering:buffet(),cocktail:cocktail()});const issued=await issue(f),pub=publicDoc({booking_code:'BK-TEST'}, {...issued.doc,show_amount:false,items:['출장뷔페 · 예전 금액 3,000,000원','출장 칵테일 · 예전 금액 800,000원','마이크 포함']});assert.equal(pub.amount,null);assert.deepEqual(pub.items,['마이크 포함']);for(const value of pub.food_services){for(const field of ['amount','total','price','supply','fee','vat','unit'])assert(value[field]==null);assert.equal(value.summary,'');}assert(F.documentRows(pub).some(x=>x[1].includes('모히토')));assert(!F.documentRows(pub).some(x=>/원/.test(x[1])));
});
test('기존 발급본은 재발급 필요로 안내하고 식음료 스냅샷에 중복 자동 문구를 넣지 않음',async t=>{
 const f=setup(t);await initial(f,{catering:buffet(),cocktail:cocktail()});f.db.prepare('UPDATE bookings SET confirm_doc=?').run(JSON.stringify({issued_at:'2026-11-01',amount:500000,items:['출장뷔페 · 오래된 내역','출장 칵테일 · 오래된 내역','마이크']}));const c=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(c.needs_reissue,true);assert.equal(c.preview.food_services.length,2);assert.deepEqual(c.preview.items,['마이크']);const it=await item(f);const r=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:it.effective_amount,items:['출장뷔페 · 오래된 내역','출장 칵테일 · 오래된 내역','마이크']},reception_revision:it.data.reception_revision});assert.equal(r.doc.food_services.length,2);assert.deepEqual(r.doc.items,['마이크']);
});

test('기존 문의의 칵테일도 메뉴명을 보완하고 접수 당시 저장 가격을 유지',async t=>{const f=setup(t),old={cups:100,price:750000,menus:['mojito','gin_tonic'],nonalcohol:true};f.db.prepare("UPDATE inquiries SET data=json_set(data,'$.cocktail',json(?),'$.included_cocktail_amount',750000,'$.cocktail_in_quote',json('true'))").run(JSON.stringify(old));const doc=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(doc.food_services[0].amount,750000);assert.deepEqual(doc.food_services[0].menu_names,['모히토','진토닉']);});

test('문의 목록은 별도로 저장한 출장뷔페의 최신 예상 합계를 보여 주고 확정 금액은 그대로 둔다',async t=>{
 const f=setup(t);
 const {readFileSync}=await import('node:fs');
 const vm=await import('node:vm');
 const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
 const context=vm.createContext({window:{MEGASPOT_INQUIRY_OVERVIEW:O},won:value=>value.toLocaleString('ko-KR')+'원',esc:String});
 for(const name of ['currentAmount','inquiryRoomAmount','inquiryListAmount']){
  const start=source.indexOf('  function '+name+'(');
  vm.runInContext(source.slice(start,source.indexOf('\n  function ',start+1)),context);
 }
 const before=(await item(f)).effective_amount;
 for(const people of [60,80]){
  const saved=await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:{course:'classic',people},status:'confirmed'});
  const row=(await f.api('inquiries?q=MS-TEST')).items[0];
  const html=context.inquiryListAmount(row,row.data);
  assert.ok(html.includes(context.won(before+saved.item.total)));
  assert.ok(html.includes('출장뷔페 '+context.won(saved.item.total)));
  assert.equal(row.effective_amount,before);
 }
 const latest=(await item(f)).data.catering.total;
 const combined=before+latest;
 f.db.prepare('UPDATE bookings SET amount=? WHERE booking_code=?').run(combined,'BK-TEST');
 await saveQuote(f.api,{total:combined,extras:[{label:'출장뷔페 · 이전 견적',amount:latest}]});
 f.db.exec("UPDATE inquiries SET data=json_remove(data,'$.included_catering_amount') WHERE ref='MS-TEST'");
 const legacy=(await f.api('inquiries?q=MS-TEST')).items[0];
 assert.equal(legacy.legacy_quote_catering_amount,latest);
 assert.ok(context.inquiryListAmount(legacy,legacy.data).includes('<b>'+context.won(combined)+'</b>'));
});
