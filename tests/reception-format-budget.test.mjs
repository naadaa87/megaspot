import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import C from '../assets/js/reception-calc.js';
import {receptionCustomer} from '../functions/api/_reception.js';
import {publicDoc} from '../functions/api/_confirm.js';
import Calculation from '../assets/js/quote-calculation.js';
import {fixture,saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
const amounts=[10000,15000,20000,25000,30000],packed=['snackbox','sandwichbox','fusionbox'];
const ctx={window:{}};vm.runInNewContext(readFileSync(new URL('../assets/js/confirm-doc.js',import.meta.url),'utf8'),ctx);const X=ctx.window.MEGASPOT_CONFIRM;
test('format-specific choices separate table/box references from the five approved budget targets',()=>{
 for(const f of ['table','box']){assert.deepEqual(C.activeCourses(f).map(c=>c.id),['cf-light','cf-classic','cf-premium','cf-signature','cf-custom']);for(const b of amounts)assert.equal(C.quote(50,f,'cf-budget-'+b).ok,false);}
 for(const f of packed){assert.deepEqual(C.activeCourses(f).filter(c=>c.id!=='cf-custom').map(c=>c.price),amounts);for(const c of ['cf-light','cf-classic','cf-premium','cf-signature']){assert.equal(C.quote(50,f,c).ok,false);assert.equal(receptionCustomer({course:c,people:50,format:f}),null);}}
});
for(const format of packed)for(const unit of amounts)test(`${format} · ${unit}: canonical budget, delivery and VAT cannot be replaced by forged submitted amounts`,()=>{
 for(const people of [1,30,50,100,350,1000]){const r=receptionCustomer({course:'cf-budget-'+unit,people,format,total:1,food:1,fee:1,budget_per_person:999999,price_basis:'course'});assert.equal(r.unitPrice,unit);assert.equal(r.budget_per_person,unit);assert.equal(r.food,unit*people);assert.equal(r.fee,30000);assert.equal(r.supply,unit*people+30000);assert.equal(r.vat,Math.round(r.supply/10));assert.equal(r.total,r.supply+r.vat);assert.equal(r.price_basis,'budget');assert.equal(r.status,'pending');assert.match(C.requestText(r),/예산 기준 예상 금액|예산 기준의 예상 금액/);}
});
test('budget selections reach quote snapshots, booking, cancellation/restoration and customer confirmation without a stale course label',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());const q=C.selection({course:'cf-classic',people:50,format:'table'}),row={kind:'reception',label:q.summary,amount:q.total,reception:q};await saveQuote(f.api,{total:500000+q.total,input:quoteInput({extras:[row]}),extras:[row]});
 const cases=[['cf-budget-20000',50,'snackbox','confirmed',1133000],['cf-budget-15000',51,'sandwichbox','confirmed',874500],['cf-budget-15000',51,'sandwichbox','cancelled',0],['cf-budget-15000',51,'fusionbox','confirmed',874500],['cf-premium',31,'box','confirmed',1567500]];
 for(const [course,people,format,status,service]of cases){await f.api('inquiries/MS-TEST','PATCH',{reception:{course,people,format,status,menu_ids:['cf-menu-79']}});const detail=await f.api('inquiries/MS-TEST'),it=detail.item;assert.equal(it.effective_amount,500000+service);assert.equal((await f.api('bookings')).items[0].amount,it.effective_amount);assert.equal(it.data.quote_input.extras.filter(x=>x.kind==='reception').length,status==='cancelled'?0:1);assert.equal(it.data.estimate,Calculation.inquiry(it,detail.quotes).text);
  await saveQuote(f.api,{total:it.effective_amount,input:it.data.quote_input,extras:it.data.quote_input.extras});const latest=(await f.api('inquiries/MS-TEST')).quotes[0];assert.equal(latest.total,it.effective_amount);
  const r=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:it.effective_amount}});assert.equal(r.doc.reception.included,status!=='cancelled');assert.equal(r.doc.reception.price_basis,C.isBudget(course)?'budget':'course');const text=X.receptionRows(r.doc).flat().join(' ');if(C.isBudget(course))assert.match(text,/予算|예산/);if(status!=='cancelled'){assert(text.includes(C.won(service)));assert(text.includes('배송비 30,000원'));}if(C.isBudget(course)&&status!=='cancelled')assert.match(text,/메뉴·제공량 상담 후 확정/);
 }
});
test('hiding amounts also hides a budget embedded in its name, ID and auto-generated item line',()=>{
 const r=C.forDocument(receptionCustomer({course:'cf-budget-15000',people:50,format:'sandwichbox'}));r.included=true;const doc=publicDoc({booking_code:'BK-X'},{show_amount:false,reception:r,items:['예산 기준 · 1인 예산 15,000원 50명 · 샌드위치 도시락']});assert.equal(doc.reception.course,'cf-custom');assert.equal(doc.reception.courseName,'예산 기준 맞춤 구성');assert.equal(doc.reception.total,null);assert.equal(doc.reception.budget_per_person,null);assert.deepEqual(doc.items,[]);assert.doesNotMatch(JSON.stringify(doc.reception)+X.receptionRows(doc).flat().join(' '),/15,000|15000|858,000|858000/);
});
test('previously agreed course-plus-lunchbox records preserve their amount and can be cancelled, but cannot be newly repriced with an incompatible selection',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());const old={course:'cf-classic',courseName:'클래식',people:50,format:'snackbox',formatName:'다과박스',provider:'cafefriends',status:'confirmed',unitPrice:35000,food:1750000,fee:30000,feeName:'배송비',supply:1780000,vat:178000,vat_excluded:true,total:1958000,price_basis:'course',menu_ids:[],menuNames:[],budget_per_person:null,note:'이전 합의'};
 const data={...f.data,reception:old,reception_in_quote:true,included_reception_amount:old.total,total:500000+old.total,amount_mode:'quote'};f.db.prepare("UPDATE inquiries SET data=? WHERE ref='MS-TEST'").run(JSON.stringify(data));f.db.prepare("UPDATE bookings SET amount=? WHERE booking_code='BK-TEST'").run(data.total);
 const extra={kind:'reception',label:'이전 합의 구성',amount:old.total,reception:old};await saveQuote(f.api,{total:data.total,input:quoteInput({extras:[extra]}),extras:[extra]});assert.equal((await f.api('bookings')).items[0].amount,data.total);
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:old.course,people:50,format:old.format,status:'confirmed',note:'참고 메모 정정'}});assert.equal((await f.api('inquiries/MS-TEST')).item.data.reception.total,old.total);
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:old.course,people:51,format:old.format,status:'confirmed'}},400);assert.equal((await f.api('bookings')).items[0].amount,data.total);
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:old.course,people:50,format:old.format,status:'cancelled'}});assert.equal((await f.api('bookings')).items[0].amount,500000);
});
test('the actual quote print renderer labels budget pricing and prints one delivery fee and VAT',()=>{
 const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8'),start=source.indexOf('  function renderSheet(){'),end=source.indexOf('  function loadRecentQuotes(){',start);const rec=C.selection({course:'cf-budget-20000',people:50,format:'sandwichbox'}),print={innerHTML:''};
 const context=vm.createContext({window:{MEGASPOT_RECEPTION_CALC:C,MEGASPOT_FOOD_SERVICES:{rows(){return [];}}},R:{q:{date:'2026-11-25',day:{},colLabel:'월–목',range:'10:00–17:00',people:30},lines:[{label:'공간료',desc:'',amount:400000}],extras:[{kind:'reception',amount:rec.total,reception:rec}],total:1533000,deposit:150000,refund:[],validUntil:'2026-11-26'},Q:{space:'megaspot-gundae',quoteNo:'Q-TEST',customer:'검증 고객',purpose:'',note:''},M:{CONFIG:{}},D:{deposit:{label:'보증금'},included:[]},E:{kdateY:v=>v,kdate:v=>v},PUR:{},savedQuoteCreatedAt:'',quoteHistorical:false,quoteSettlement:null,spaceName:()=> '메가스팟 건대 1호',esc:String,won:C.won,quoteVatNote:()=> '부가세 포함',quoteSettlementHtml:()=> '',$:()=>print});
 vm.runInContext(source.slice(source.indexOf('  function quoteBuffet('),source.indexOf('  function kakaoText(){'))+source.slice(start,end),context);context.renderSheet();assert.match(print.innerHTML,/예산 기준 예상 금액 · 메뉴·제공량 상담 후 확정/);assert.match(print.innerHTML,/배송비 30,000원/);assert.match(print.innerHTML,/공급가액 1,030,000원 \+ 부가세 10% 103,000원/);assert.match(print.innerHTML,/1,133,000원/);assert.match(print.innerHTML,/1,533,000원/);
});
