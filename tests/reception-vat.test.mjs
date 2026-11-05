import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import C from '../assets/js/reception-calc.js';
import O from '../assets/js/inquiry-overview.js';
import {fixture,saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import {receptionCustomer} from '../functions/api/_reception.js';
import {readFoodPricing,publicFoodPricing,foodPricingData} from '../functions/api/_food_pricing.js';
import {foodHtml} from '../functions/api/_food_html.js';
import {buildFoodPdf} from '../functions/api/_food_pdf.js';
import slots from '../functions/api/_pdf_reception_slots.js';
const ctx={window:{}};vm.runInNewContext(readFileSync(new URL('../assets/js/confirm-doc.js',import.meta.url),'utf8'),ctx);const X=ctx.window.MEGASPOT_CONFIRM;
const legacy={course:'classic',courseName:'클래식',people:50,format:'table',formatName:'테이블 세팅 케이터링',unitPrice:35000,food:1750000,fee:200000,total:1950000,status:'pending',note:'기존 합의',tax_pending:true};
function setup(t){const f=fixture({booking:true});t.after(()=>f.db.close());return f;}
function row(q){return {kind:'reception',label:'케이터링',amount:q.total,reception:q};}
test('all course/format/boundary amounts add exactly 10% on menu plus service fee',()=>{
 for(const co of C.data.courses)for(const fmt of Object.keys(C.data.feesByFormat))for(const n of [1,49,50,51,99,100,101,199,200,201,299,300]){
  const q=C.quote(n,fmt,co.id),fee=C.data.feesByFormat[fmt].find(b=>n<=b.upto).price;
  assert.equal(q.supply,co.price*n+fee);assert.equal(q.vat,Math.round(q.supply/10));assert.equal(q.total,q.supply+q.vat);assert.equal(q.vat_excluded,true);assert.equal(q.tax_pending,false);
  const d=C.forDocument(q);assert.equal(d.food+d.fee,d.supply);assert.equal(d.total,d.supply+d.vat);
 }
 assert.equal(receptionCustomer({course:'classic',people:50,format:'table',total:1}),null);const q=receptionCustomer({course:'cf-custom',people:50,format:'table',total:1,supply:1,vat:0});assert.equal(q.total,null);assert.equal(q.supply,null);
});
test('legacy agreed quote and booking survive opening, unrelated quote saves, and document reissue',async t=>{
 const f=setup(t),data={...f.data,reception:legacy,included_reception_amount:1950000,reception_in_quote:true,total:2450000};
 f.db.prepare("UPDATE inquiries SET data=? WHERE ref='MS-TEST'").run(JSON.stringify(data));f.db.prepare("UPDATE bookings SET amount=2450000 WHERE booking_code='BK-TEST'").run();
 const rec=C.fromInquiry(data);assert.equal(rec.total,1950000);assert.equal(rec.vat_excluded,false);assert.equal(rec.supply,null);assert.equal(rec.vat,null);
 const input=C.syncQuote(quoteInput(),data,true);await saveQuote(f.api,{total:2450000,input,extras:input.extras});
 const it=(await f.api('inquiries/MS-TEST')).item;assert.equal(it.effective_amount,2450000);assert.equal(it.data.reception.total,1950000);assert.equal(it.data.reception.vat_excluded,false);
 const r=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2450000,show_amount:true}});assert.equal(r.doc.reception.total,1950000);assert.equal(r.doc.reception.vat,null);assert.match(X.receptionRows(r.doc).flat().join(' '),/이전 저장 금액/);assert.equal((await f.api('bookings')).items[0].amount,2450000);
 // Explicit recalculation upgrades one service amount, rather than taxing the whole booking.
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'classic',people:50,format:'table',note:legacy.note}});
 const next=(await f.api('inquiries/MS-TEST')).item;assert.equal(next.effective_amount,2645000);assert.equal(next.data.included_reception_amount,2145000);assert.equal(next.data.reception.vat,195000);
 const old=(await f.api('inquiries/MS-TEST')).quotes[0];assert.equal(old.total,2450000);assert.equal(old.data.extras[0].reception.total,1950000);
});
test('updated price configuration rounds tax once and reaches HTML, PDF slots and server quotes',async()=>{
 const rates={};for(const s of ['catering','reception'])rates[s]=publicFoodPricing(await readFoodPricing({},s));
 rates.reception.prices['course.classic']=35111;rates.reception.prices['fee.table.50']=200003;
 const data=foodPricingData('reception',{rows:Object.entries(rates.reception.prices).map(([id,sale_price])=>({id,sale_price}))}),q=C.create(data).quote(50,'table','classic');assert.equal(q.supply,1955553);assert.equal(q.vat,195555);assert.equal(q.total,2151108);
 const html=foodHtml(readFileSync(new URL('../reception/index.html',import.meta.url),'utf8'),'/reception/',rates);assert(!html.includes(C.won(q.total)));assert(html.includes('data-reception-provider="cafefriends"'));assert(!html.includes('2,145,000원'));
 const template=readFileSync(new URL('../assets/docs/megaspot-reception-pricing-template.pdf',import.meta.url)),pdf=buildFoodPdf(template,'reception',rates.reception);
 assert.equal(pdf.length,template.length);
});
test('quote/booking/confirmation stay gross once across change, cancellation and restoration',async t=>{
 const f=setup(t),q=C.quote(50),extra=row(q);await saveQuote(f.api,{total:500000+q.total,input:quoteInput({extras:[extra]}),extras:[extra]});
 for(const [status,course] of [['confirmed','signature'],['cancelled','signature'],['confirmed','light'],['confirmed','classic']]){
  await f.api('inquiries/MS-TEST','PATCH',{reception:{people:50,format:'table',course,status}});const it=(await f.api('inquiries/MS-TEST')).item,rec=it.data.reception,expected=500000+(status==='cancelled'?0:rec.total);
  assert.equal(it.effective_amount,expected);assert.equal((await f.api('bookings')).items[0].amount,expected);assert.equal(O.build(it,{roomAmount:500000}).total,expected);
  const r=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:expected,show_amount:true}});assert.equal(r.doc.amount,expected);assert.equal(r.doc.reception.vat,rec.vat);
  if(status!=='cancelled'){assert.equal(r.doc.reception.included,true);const text=X.receptionRows(r.doc).flat().join(' ');for(const v of [C.won(rec.supply),C.won(rec.vat),C.won(rec.total),'부가세 10%'])assert(text.includes(v));}
 }
});
test('incomplete and hidden amounts do not expose a fabricated zero tax breakdown',()=>{
 const rec=C.selection({course:'all',people:50,format:''}),text=O.customerText(O.build({data:{reception:rec}},{roomAmount:500000}));assert.doesNotMatch(text,/공급가액 0원|부가세 10% 0원/);assert.match(text,/부가세 10% 추가/);
 const q=C.forDocument(C.quote(50),2000000);assert.equal(q.supply,null);assert.equal(q.vat,null);assert.equal(q.food,null);
 const rows=X.receptionRows({show_amount:false,reception:{...C.quote(50),included:true}}).flat().join(' ');assert.doesNotMatch(rows,/195,000|1,950,000|2,145,000/);
});
