import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import C from '../assets/js/reception-calc.js';
import Calculation from '../assets/js/quote-calculation.js';
import O from '../assets/js/inquiry-overview.js';
import {fixture,saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import {onRequestGet as publicConfirm} from '../functions/api/confirm.js';
const ctx={window:{}};vm.runInNewContext(readFileSync(new URL('../assets/js/confirm-doc.js',import.meta.url),'utf8'),ctx);const X=ctx.window.MEGASPOT_CONFIRM;
const base=710000,gear={label:'별도 장비',amount:80000};
const fee=n=>n<=30?200000:n<=50?250000:250000+Math.ceil((n-50)/50)*50000;
const gross=(unit,n,f)=>{const supply=unit*n+(f==='table'?fee(n):30000);return supply+Math.round(supply/10);};
const choices=[... [30,31,50,51,100,101,150,151,200,201,250,251,300,301,350].map(people=>({people,format:'table'})),...['box','snackbox','sandwichbox','fusionbox','table'].map(format=>({people:51,format})),{people:51,format:'table',status:'cancelled'},{people:51,format:'table',status:'confirmed'},{people:30,format:'box',status:'cancelled'},{people:30,format:'box',status:'confirmed'}];
async function seed(f,course,people=30,format='table'){
 const rec=C.selection({course,people,format,menu_ids:['cf-menu-79'],request_note:'알레르기 상담'}),extra={kind:'reception',label:rec.summary,amount:rec.total,reception:rec};
 await saveQuote(f.api,{total:base+rec.total,extras:[gear,extra],input:quoteInput({extras:[gear,extra]})});return (await f.api('inquiries/MS-TEST')).quotes[0];
}
for(const [course,unit] of [['cf-light',25000],['cf-classic',35000],['cf-premium',45000],['cf-signature',55000]])test(`${course}: every new fee boundary, same-price delivery switch, cancellation and repeated restore reaches all current documents`,async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());const original=await seed(f,course),originalBytes=f.db.prepare('SELECT data FROM quotes WHERE quote_no=?').get(original.quote_no).data;
 for(const choice of choices){
  const before=await f.api('inquiries/MS-TEST'),old=before.item.data.reception;const changed=['people','format','status'].some(k=>(choice[k]??'confirmed')!==old[k]);
  // A previous issued document must be invalidated even when delivery formats share one price.
  await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:before.item.effective_amount}});
  const priorToken=(await f.api('bookings/BK-TEST/confirm-doc')).token;
  const selectedCourse=C.formatMode(choice.format)==='budget'?'cf-budget-25000':course,selectedUnit=C.isBudget(selectedCourse)?25000:unit;
  const selection={course:selectedCourse,...choice,status:choice.status||'confirmed',menu_ids:['cf-menu-79'],request_note:'알레르기 상담'};
  await f.api('inquiries/MS-TEST','PATCH',{reception:selection,reception_revision:before.item.data.reception_revision});
  const detail=await f.api('inquiries/MS-TEST'),it=detail.item,r=it.data.reception,cancelled=r.status==='cancelled',serviceTotal=gross(selectedUnit,choice.people,choice.format),total=base+(cancelled?0:serviceTotal);
  assert.equal(it.effective_amount,total);assert.equal(r.fee,choice.format==='table'?fee(choice.people):30000);assert.equal(r.total,serviceTotal);assert.equal(r.feeName,choice.format==='table'?'출장세팅비':'배송비');assert.equal((await f.api('bookings')).items[0].amount,total);assert.equal(O.build(it,{roomAmount:base}).total,total);
  const draft=it.data.quote_input,extras=draft.extras.filter(x=>x.kind==='reception');assert.equal(extras.length,cancelled?0:1);assert.equal(draft.extras.find(x=>x.label===gear.label).amount,gear.amount);assert.equal(draft.discVal,10);
  const calculation=Calculation.inquiry(it,detail.quotes).text;assert.match(calculation,new RegExp('합계 '+C.won(total)));assert.equal(it.data.estimate,calculation);
  if(cancelled)assert.match(calculation,/케이터링 상태: 취소 · 합계 제외/);else{assert.equal(extras[0].amount,serviceTotal);assert.equal(extras[0].reception.fee,r.fee);assert(calculation.includes(r.summary));}
  if(changed){assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);const stale=await publicConfirm({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+priorToken)});assert.equal(stale.status,404);assert.equal((await stale.json()).code,'NOT_ISSUED');}
  // Saving a new quote must never reintroduce the cancelled line or add the fee twice.
  await saveQuote(f.api,{total,input:draft,extras:draft.extras});const latest=(await f.api('inquiries/MS-TEST')).quotes[0];assert.equal(latest.total,total);assert.equal(latest.data.extras.filter(x=>x.kind==='reception').length,cancelled?0:1);
  const issued=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:total}});assert.equal(issued.doc.amount,total);assert.equal(issued.doc.reception.fee,r.fee);assert.equal(issued.doc.reception.included,!cancelled);
  const text=X.receptionRows(issued.doc).flat().join(' ');assert(text.includes(r.courseName));assert(text.includes(choice.people+'명'));assert(text.includes(r.formatName));if(cancelled){assert.match(text,/취소 · 합계 제외/);assert.doesNotMatch(text,/산출 내역/);}else{assert(text.includes(r.feeName+' '+C.won(r.fee)));assert(text.includes(C.won(serviceTotal)));}
  const token=(await f.api('bookings/BK-TEST/confirm-doc')).token;const pub=await publicConfirm({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+token)});assert.equal(pub.status,200);const doc=(await pub.json()).doc;assert.equal(doc.amount,total);assert.equal(doc.reception.total,serviceTotal);assert.equal(doc.reception.included,!cancelled);
 }
 assert.equal(f.db.prepare('SELECT data FROM quotes WHERE quote_no=?').get(original.quote_no).data,originalBytes,'issued historical quote stays byte-for-byte unchanged');
});
test('changing course together with headcount and format never keeps a previous fee or stale calculation',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());await seed(f,'cf-light');
 for(const [course,n,format,total] of [['cf-classic',50,'table',2910000],['cf-premium',101,'table',6094500],['cf-signature',30,'box',2558000],['cf-budget-25000',31,'snackbox',1595500]]){
  await f.api('inquiries/MS-TEST','PATCH',{reception:{course,people:n,format,status:'confirmed'}});const d=await f.api('inquiries/MS-TEST');assert.equal(d.item.effective_amount,total);assert.equal(d.item.data.estimate,Calculation.inquiry(d.item,d.quotes).text);assert.match(d.item.data.estimate,new RegExp('합계 '+C.won(total)));
 }
});
test('an inquiry already changed before this fix repairs its display without rewriting history or customer original',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());const q=await seed(f,'cf-classic');await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'cf-classic',people:51,format:'box'}});const d=await f.api('inquiries/MS-TEST');
 d.item.data.estimate=q.data.total+' stale';d.item.data.estimate_customer='최초 고객 견적 원문';const view=Calculation.inquiry(d.item,d.quotes);assert(view.text.includes('배송비 30,000원'));assert(view.text.includes('합계 2,706,500원'));assert.doesNotMatch(view.text,/출장세팅비 200,000원/);assert.equal(view.customerOriginal,'최초 고객 견적 원문');assert.equal(Calculation.text(q.data).includes('출장세팅비 200,000원'),true);
});
test('stale quote and confirmation drafts cannot restore cancelled catering after a same-price format change',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());await seed(f,'cf-budget-25000',50,'snackbox');const first=(await f.api('inquiries/MS-TEST')).item,old=first.data.quote_input;await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:first.effective_amount}});
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'cf-budget-25000',people:50,format:'sandwichbox'}});await f.api('quotes','POST',{inquiry_ref:'MS-TEST',total:first.effective_amount,data:{input:old,extras:old.extras}},409);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:first.effective_amount},reception_revision:first.data.reception_revision},409);
 const current=(await f.api('inquiries/MS-TEST')).item;await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'cf-budget-25000',people:50,format:'sandwichbox',status:'cancelled'},reception_revision:current.data.reception_revision});assert.equal((await f.api('bookings')).items[0].amount,base);
});

test('a whole-booking cancellation amount never gets mixed into an original space quote',()=>{
 const snapshot={lines:[{label:'공간료',amount:500000}],total:700000,extras:[{label:'케이터링',amount:200000}],input:{extras:[{label:'케이터링',amount:200000}]}};
 const view=Calculation.inquiry({effective_amount:100000,data:{amount_mode:'quote',quote_no:'Q-ORIGINAL',quote_input:snapshot.input,total:100000}},[{quote_no:'Q-ORIGINAL',data:snapshot}]);assert.match(view.text,/합계 700,000원/);assert.doesNotMatch(view.text,/합계 100,000원/);
});
