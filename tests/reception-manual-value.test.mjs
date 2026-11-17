import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import C from '../assets/js/reception-calc.js';
import {receptionAdmin,receptionCustomer,receptionExtra} from '../functions/api/_reception.js';
import {publicDoc} from '../functions/api/_confirm.js';
import {fixture,saveQuote,quoteInput,DAY} from './helpers/admin-fixture.mjs';
import {quoteUi} from './helpers/admin-quote-fixture.mjs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const cfg=(unit=17000,people=31,format='table')=>({course:'cf-manual',unit_price:unit,people,format,status:'confirmed',menu_ids:['cf-menu-48'],request_note:'우유 제외'});
const docContext={window:{}};vm.runInNewContext(source('assets/js/confirm-doc.js'),docContext);const X=docContext.window.MEGASPOT_CONFIRM;

test('administrator arbitrary integer prices use canonical format fees and VAT, while public submissions cannot choose a manual price',()=>{
 for(const unit of [10000,15000,17000,20000,17333])for(const people of [1,30,31,50,51,100,301,351])for(const format of ['table','box','snackbox','sandwichbox','fusionbox']){
  const fee=format!=='table'?30000:people<=30?200000:people<=50?250000:250000+Math.ceil((people-50)/50)*50000;
  const expected=unit*people+fee+Math.round((unit*people+fee)/10),value={...cfg(unit,people,format),unitPrice:1,total:1,fee:1,supply:1,vat:0};
  const q=C.selection(value),saved=receptionAdmin(value);
  assert.equal(q.total,expected);assert.equal(saved.total,expected);assert.equal(saved.unit_price,unit);assert.equal(saved.unitPrice,unit);assert.equal(saved.price_basis,'manual');assert.equal(saved.fee,fee);
  assert.equal(receptionCustomer(value),null);
  assert(C.customerReply(value).startsWith('안녕하세요, 메가스팟입니다.'));assert(C.customerReply(value).includes(C.won(unit)));assert(!C.customerReply(value).includes('안내해 주세요'));assert(C.requestText(value).includes(C.won(unit)));assert(C.requestText(value).includes(C.won(expected)));
 }
 for(const bad of [0,-1,17000.5,'abc','17,000','1e4',10000001]){assert.equal(receptionAdmin(cfg(bad)),null);assert.equal(C.selection(cfg(bad)),null);}
 assert.equal(receptionAdmin(cfg('')),null);assert.equal(C.quote(31,'table','cf-manual').ok,false);
 assert.equal(receptionAdmin({...cfg(),course:'cf-light'}).unitPrice,25000);
 assert(!C.activeCourses('table').some(c=>c.id==='cf-manual'));
});

test('manual price changes, cancellation and restoration reach inquiry, booking and documents once without changing old issued quotes',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());
 let q=receptionAdmin(cfg()),row={kind:'reception',label:q.courseName,amount:q.total,reception:q};
 await saveQuote(f.api,{total:500000+q.total,input:quoteInput({extras:[row]}),extras:[row]});
 const first=(await f.api('inquiries/MS-TEST')).quotes[0];
 for(const value of [cfg(20000),cfg(17000,30),{...cfg(17000,30),status:'cancelled'},cfg(17000,30,'box'),cfg(20000,51,'snackbox')]){
  const before=(await f.api('inquiries/MS-TEST')).item.data.reception_revision;
  await f.api('inquiries/MS-TEST','PATCH',{reception:value,reception_revision:before});
  const detail=await f.api('inquiries/MS-TEST'),saved=detail.item.data.reception,food=value.status==='cancelled'?0:saved.total;
  assert.equal(saved.unit_price,value.unit_price);assert.equal(detail.item.effective_amount,500000+food);assert.equal((await f.api('bookings')).items[0].amount,500000+food);
  assert.equal(detail.item.data.quote_input.extras.filter(x=>x.kind==='reception').length,value.status==='cancelled'?0:1);
  const issued=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000+food}});
  const text=X.receptionRows(issued.doc).flat().join(' ');
  if(food){assert(text.includes(C.won(saved.unitPrice)));assert(text.includes(C.won(food)));assert(text.includes(saved.people+'명'));}
  else assert(text.includes('취소 · 합계 제외'));
  assert.deepEqual(detail.quotes.find(x=>x.quote_no===first.quote_no).data,first.data);
 }
 const it=(await f.api('inquiries/MS-TEST')).item;
 await f.api('inquiries/MS-TEST','PATCH',{reception:cfg(),reception_revision:it.data.reception_revision-1},409);
 const rec=it.data.reception;
 assert(receptionExtra([{kind:'reception',amount:rec.total,reception:{...rec,unit_price:18000}}],undefined,{reception:rec}).error);
 const hidden=publicDoc({booking_code:'BK-X'},{show_amount:false,reception:rec,items:[rec.summary]});
 assert.equal(hidden.reception.unit_price,null);assert.equal(hidden.reception.unitPrice,null);assert.equal(hidden.reception.summary,'');assert.deepEqual(hidden.items,[]);
});

test('standalone recent quote snapshots retain an arbitrary unit price through save, reopen, actual print and customer copy',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const ui=quoteUi(),ctx=ui.ctx;ctx.go=()=>{};
 const admin=source('assets/js/pages/admin.js'),start=admin.indexOf('  function receptionToQuote(');
 vm.runInContext(admin.slice(start,admin.indexOf('  function foodToQuote(',start)),ctx);
 let original;
 for(const unit of [17000,20000]){
  const config=cfg(unit,31,'box'),rec=receptionAdmin(config);
  await ctx.receptionToQuote({ref:'',customer:'직접 입력 검증',space:'megaspot-gundae',date:DAY},config,rec);
  ctx.Q.from=20;ctx.Q.to=26;ctx.Q.hireManager=false;ctx.calc();
  const payload=JSON.parse(JSON.stringify(ctx.payload()));
  const result=await f.api('quotes','POST',payload),saved=(await f.api('quotes')).items.find(x=>x.quote_no===result.quote_no);
  if(!original)original=saved;
  await ctx.loadSavedQuote(saved,'');
  const docs=ui.documents(),stored=docs.input.extras.find(x=>x.kind==='reception');
  assert.equal(stored.reception.unit_price,unit);assert.equal(stored.amount,rec.total);assert(docs.html.includes(C.won(rec.total)));assert(docs.html.includes(C.won(unit)));assert(docs.text.includes(C.won(rec.total)));
 }
 const old=(await f.api('quotes')).items.find(x=>x.quote_no===original.quote_no);assert.deepEqual(old.data,original.data);
});

test('the lower-priced references are available for table and box, with distinct course records and grouped web content',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 for(const unit of [10000,15000,20000])for(const format of ['table','box']){
  const id='cf-value-'+unit,q=C.quote(31,format,id),fee=format==='table'?250000:30000;
  assert.equal(q.total,Math.round((31*unit+fee)*1.1));assert.equal(receptionCustomer({course:id,people:31,format}).total,q.total);
  assert(C.course(id).menus.length>=3);
  const pricing=await f.api('reception/pricing'),row=pricing.rows.find(r=>r.id==='course.'+id);assert.equal(row.sale_price,unit);assert.equal(row.vendor_supply,unit-5000);
  await saveQuote(f.api,{total:500000+q.total,extras:[{kind:'reception',label:q.courseName,amount:q.total,reception:{course:id,people:31,format}}]});
 }
 const html=source('reception/index.html');assert.equal((html.match(/class="cf-value-package"/g)||[]).length,1);for(const unit of [10000,15000,20000])assert(html.includes('data-reception-course="cf-value-'+unit+'"'));
 assert(!html.includes('cf-manual'));assert(!C.activeCourses('snackbox').some(c=>c.group==='value'));
});

test('manual administrator choice survives switching all five formats while ordinary public choices cannot reveal it',()=>{
 const ctx={window:{MEGASPOT_RECEPTION_CALC:C}};vm.runInNewContext(source('assets/js/reception-choice-ui.js'),ctx);
 function element(value=''){return {value,innerHTML:'',addEventListener(){}};}
 for(const allowManual of [false,true]){
  const o={format:element('table'),course:element(),allowManual,budget:element(),budgetGroup:element(),label:element(),hint:element()};
  const choices=ctx.window.MEGASPOT_RECEPTION_CHOICES.bind(o);choices.load('cf-manual');
  assert.equal(o.course.value,allowManual?'cf-manual':'cf-custom');
  if(allowManual)for(const format of ['box','snackbox','sandwichbox','fusionbox','table']){o.format.value=format;choices.sync();assert.equal(o.course.value,'cf-manual');assert(o.hint.textContent.includes('直接')||o.hint.textContent.includes('직접 입력'));}
 }
});
