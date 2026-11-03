import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import C from '../assets/js/reception-calc.js';
import O from '../assets/js/inquiry-overview.js';
const row=(course='classic',people=50,format='table')=>{const q=C.quote(people,format,course);return {kind:'reception',label:q.courseName,amount:q.total,reception:{course,people,format}};};
function setup(t,booking=true){const f=fixture({booking});t.after(()=>f.db.close());return f;}
async function current(f){return (await f.api('inquiries/MS-TEST')).item;}
for(const course of C.data.courses)for(const format of ['table','box','lunchbox'])test(`${course.name}·${format}: 인원 변경·취소 견적 저장·복원이 전체 금액에 반영`,async t=>{
 const f=setup(t);const first=row(course.id,50,format),extra={label:'별도 장비',amount:80000};await saveQuote(f.api,{total:580000+first.amount,extras:[first,extra],input:quoteInput({extras:[first,extra]})});const original=(await f.api('inquiries/MS-TEST')).quotes[0];
 for(const people of [51,100,101]){await f.api('inquiries/MS-TEST','PATCH',{reception:{course:course.id,people,format}});const it=await current(f),q=C.quote(people,format,course.id);assert.equal(it.effective_amount,580000+q.total);assert.equal(it.data.quote_input.extras.find(x=>x.kind==='reception').amount,q.total);assert.equal(it.data.quote_input.extras.find(x=>x.label==='별도 장비').amount,80000);assert.equal(it.data.quote_input.discVal,10);assert.equal((await f.api('bookings')).items[0].amount,it.effective_amount);assert.equal(O.build(it,{roomAmount:580000}).total,it.effective_amount);}
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:course.id,people:101,format,status:'cancelled'}});let it=await current(f);assert.equal(it.effective_amount,580000);assert.equal(it.data.quote_input.extras.filter(x=>x.kind==='reception').length,0);
 await saveQuote(f.api,{total:580000,extras:it.data.quote_input.extras,input:it.data.quote_input});it=await current(f);assert.equal(it.data.reception_in_quote,true);
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:course.id,people:50,format,status:'confirmed'}});it=await current(f);assert.equal(it.effective_amount,580000+first.amount);assert.equal(it.data.included_reception_amount,first.amount);assert.equal((await f.api('bookings')).items[0].amount,it.effective_amount);assert.equal(it.data.quote_input.extras.filter(x=>x.kind==='reception').length,1);
 const old=(await f.api('inquiries/MS-TEST')).quotes.find(x=>x.quote_no===original.quote_no);assert.equal(old.total,original.total);assert.equal(old.data.extras[0].reception.people,50);assert.equal(C.quoteCurrent(old.data.input,it.data),false);
});
test('명시적으로 견적에서 제외한 선택은 변경·취소·복원해도 다시 더하지 않음',async t=>{
 const f=setup(t);await saveQuote(f.api,{total:2450000,extras:[row()]});await saveQuote(f.api,{total:500000,extras:[],input:quoteInput({receptionExcluded:true})});for(const status of ['cancelled','confirmed'])await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'premium',people:51,format:'box',status}});const it=await current(f);assert.equal(it.effective_amount,500000);assert.equal(it.data.reception_in_quote,false);assert.equal(it.data.quote_input.extras.length,0);
});
test('오래 열린 견적·케이터링·확정서 화면의 저장은 이전 구성으로 덮어쓰지 못함',async t=>{
 const f=setup(t);await saveQuote(f.api,{total:2450000,extras:[row()],input:quoteInput({extras:[row()]})});const old=await current(f),draft=old.data.quote_input,oldRev=C.revision(old.data);
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'premium',people:50,format:'table'},reception_revision:oldRev});const rev=C.revision((await current(f)).data);
 await f.api('quotes','POST',{inquiry_ref:'MS-TEST',total:2450000,data:{input:draft,extras:[row()]}},409);
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'classic',people:50,format:'table'},reception_revision:oldRev},409);
 await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2450000},reception_revision:oldRev},409);
 await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2450000}},409);
 const it=await current(f);assert.equal(it.data.reception.course,'premium');assert.equal(it.effective_amount,2950000);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);
 await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2950000},reception_revision:rev});assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc.reception.course,'premium');
});
test('같은 금액의 방식 변경도 오래 열린 확정서를 차단하고, 변경 없는 저장은 발급본 유지',async t=>{
 const f=setup(t);const r=row('classic',50,'box');await saveQuote(f.api,{total:2350000,extras:[r]});let it=await current(f);const rev=C.revision(it.data);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2350000},reception_revision:rev});await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'classic',people:50,format:'box'},reception_revision:rev});assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);
 await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'classic',people:50,format:'lunchbox'},reception_revision:rev});await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2350000},reception_revision:rev},409);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);
});
test('대관 견적에 포함하지 않은 케이터링의 취소·복원은 예약 금액을 바꾸지 않음',async t=>{
 const f=setup(t);for(const status of ['pending','cancelled','confirmed']){await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'signature',people:50,format:'table',status}});assert.equal((await f.api('bookings')).items[0].amount,500000);}const d=(await f.api('bookings/BK-TEST/confirm-doc')).reception;assert.equal(d.included,false);
});
test('케이터링 금액이 올라도 이미 받은 금액은 실제 결제·환불 내역 기준',async t=>{
 const f=setup(t);await saveQuote(f.api,{total:2450000,extras:[row()]});f.db.prepare('INSERT INTO orders(oid,product_id,title,price,buyer_name,buyer_phone,data,status,booking_code,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('PAID-TEST','room','실제 결제',2450000,'검증','010-1234-5678','{}','paid','BK-TEST','2026-11-03');await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'signature',people:50,format:'table'}});let r=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(r.booking.amount,3450000);assert.equal(r.booking.paid_amount,2450000);f.db.prepare('INSERT INTO payapp_refunds(mul_no,oid,amount,created_at) VALUES(?,?,?,?)').run('REFUND-TEST','PAID-TEST',100000,'2026-11-03');r=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(r.booking.paid_amount,2350000);
});
test('코스·방식 미정 또는 301명 이상 문의도 가짜 인원을 넣지 않고 취소할 수 있음',async t=>{
 const f=setup(t);for(const selection of [{course:'all',people:301,format:''},{course:'signature',people:301,format:'table'},{course:'all',people:null,format:''}]){await f.api('inquiries/MS-TEST','PATCH',{reception:{...selection,status:'cancelled'}});const it=await current(f);assert.equal(it.data.reception.people,selection.people);assert.equal(it.data.reception.course,selection.course);assert.equal(it.data.reception.total,null);assert.equal(it.data.reception.status,'cancelled');assert.equal((await f.api('bookings')).items[0].amount,500000);await f.api('inquiries/MS-TEST','PATCH',{reception:{...selection,status:'pending'}});assert.equal((await current(f)).data.reception.people,selection.people);assert.equal((await current(f)).data.reception.total,null);}
});
test('상담 중인 구성을 포함한 견적을 저장한 뒤 조건을 정하면 금액이 자동 반영됨',async t=>{
 const f=setup(t);await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'all',people:301,format:'',status:'pending'}});let it=await current(f);const input=C.syncQuote(quoteInput(),it.data,true);assert.match(input.note,/상담 필요/);await saveQuote(f.api,{total:500000,input,extras:[]});it=await current(f);assert.equal(it.data.reception_in_quote,true);assert.match(it.data.quote_input.note,/상담 필요/);await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'light',people:50,format:'table'}});it=await current(f);assert.equal(it.effective_amount,1950000);assert.equal(it.data.quote_input.extras[0].amount,1450000);assert.doesNotMatch(it.data.quote_input.note,/상담 필요/);
});
test('취소 후 0원이 되는 견적도 0원을 유지하고 복원 시 정확히 재합산',async t=>{
 const f=setup(t);await saveQuote(f.api,{total:1950000,extras:[row()],input:quoteInput({discVal:100,extras:[row()]})});await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'classic',people:50,format:'table',status:'cancelled'}});let it=await current(f);assert.equal(it.effective_amount,0);await saveQuote(f.api,{total:0,input:it.data.quote_input,extras:[]});assert.equal((await f.api('bookings')).items[0].amount,0);await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'classic',people:50,format:'table',status:'confirmed'}});assert.equal((await current(f)).effective_amount,1950000);
});
