import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,quoteInput,saveQuote} from './helpers/admin-fixture.mjs';
import {bookingUi} from './helpers/admin-booking-fixture.mjs';
import {onRequestGet} from '../functions/api/confirm.js';
function edit(ui,mode='auto'){
 const date='2026-12-18',options={cleaning:true,manager:{count:2,hours:6}},E=ui.ctx.E0.forSpace('megaspot-gundae-2'),base=E.quote({date,start:10,end:17,people:300,adminHours:true,options}).total,discount=Math.round(base*17.3/100),total=mode==='manual'?900000:mode==='zero'?0:base-discount;
 return {edit:true,name:'예약 전환 문서 검증 고객',phone:'010-1234-5678',space_id:'megaspot-gundae-2',date,start_h:10,end_h:17,headcount:300,purpose:'party',options,amount_mode:mode==='auto'?'auto':'manual',total,price_adjustment:mode==='auto'?{type:'pct',value:17.3,reason:'할인 검증',base_total:base,discount,total}:null};
}
async function convert(f,ui){const detail=await f.api('inquiries/MS-TEST'),form=ui.convert(detail);const result=await f.api('inquiries/MS-TEST/confirm','POST',{date:form.date,start_h:form.start_h,end_h:form.end_h,headcount:form.headcount,amount:form.amount,memo:form.memo,block_calendar:false});return {detail,form,code:result.booking_code};}
async function issue(f,ui,code){const r=await f.api('bookings/'+code+'/confirm-doc'),values=ui.defaults(r),issued=await f.api('bookings/'+code+'/confirm-doc','PUT',{doc:values,reception_revision:r.inquiry.reception_revision,settlement_revision:r.settlement.revision});return {...issued,values};}
async function customer(f,code,token){const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c='+code+'&k='+token)});return {status:response.status,...await response.json()};}
for(const mode of ['auto','manual','zero'])test(`문의 수정(${mode}) → 예약 전환 → 확정서 발급·고객 재조회에서 최신 금액·조건·옵션 유지`,async t=>{
 const f=fixture();t.after(()=>f.db.close());t.mock.method(globalThis,'fetch',async()=>assert.fail('검증 중 외부 발송 금지'));const ui=bookingUi();await saveQuote(f.api,{input:quoteInput()});const input=edit(ui,mode);await f.api('inquiries/MS-TEST','PATCH',input);const {form,code}=await convert(f,ui);
 assert.equal(form.space_id,input.space_id);assert.equal(form.amount,input.total);assert.equal(form.date,input.date);assert.equal(form.headcount,300);assert.equal(form.start_h,10);assert.equal(form.end_h,17);
 const b=(await f.api('bookings')).items.find(x=>x.booking_code===code);for(const [key,value]of Object.entries({space_id:input.space_id,date:input.date,headcount:300,start_h:10,end_h:17,amount:input.total}))assert.equal(b[key],value,key);
 const issued=await issue(f,ui,code);assert.equal(issued.doc.amount,input.total);assert.ok(issued.doc.items.includes('현장 매니저 2명 × 6시간'));assert.ok(issued.doc.items.includes('뒷정리·청소'));
 const r=await f.api('bookings/'+code+'/confirm-doc'),pub=await customer(f,code,r.token);assert.equal(pub.status,200);assert.equal(pub.doc.amount,input.total);assert.equal(pub.doc.headcount,300);assert.equal(pub.doc.start_h,10);assert.equal(pub.doc.end_h,17);assert.equal(pub.doc.date,input.date);assert.match(pub.doc.space.name,/2호/);assert.ok(pub.doc.items.includes('현장 매니저 2명 × 6시간'));assert.ok(pub.doc.items.includes('뒷정리·청소'));assert.match(ui.text(pub.doc),/300명/);
});
test('다음 날까지 이용하는 수정 조건도 예약·고객 확정서 시간 유지',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=bookingUi(),input={...edit(ui,'manual'),start_h:18,end_h:31};await f.api('inquiries/MS-TEST','PATCH',input);const {code}=await convert(f,ui);const issued=await issue(f,ui,code);assert.equal(issued.preview.end_h,31);assert.match(ui.text(issued.preview),/18:00 – 다음 날 07:00 \(13시간\)/);
});
test('확정서 발급 뒤 같은 금액으로 옵션·행사 목적만 수정해도 변경 전 확정서를 재사용하지 않음',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=bookingUi(),input=edit(ui,'manual');await f.api('inquiries/MS-TEST','PATCH',input);const {code}=await convert(f,ui);await issue(f,ui,code);const before=await f.api('bookings/'+code+'/confirm-doc');
 const changed={...input,options:{manager:{count:3,hours:5},banner:true},purpose:'seminar',amount_mode:'keep'};await f.api('inquiries/MS-TEST','PATCH',changed);const after=await f.api('bookings/'+code+'/confirm-doc');assert.equal(after.doc,null,'이전 옵션·행사 목적이 있는 확정서 무효화');assert.equal((await customer(f,code,before.token)).status,404);
 const next=await issue(f,ui,code);assert.equal(next.doc.amount,input.total);assert.ok(next.doc.items.includes('현장 매니저 3명 × 5시간'));assert.ok(next.doc.items.includes('현수막'));assert.ok(!next.doc.items.includes('뒷정리·청소'));
});
test('이전 조건의 확정서 발급 요청은 거절하고 최신 조건으로 다시 발급',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=bookingUi(),input=edit(ui,'manual');await f.api('inquiries/MS-TEST','PATCH',input);const {code}=await convert(f,ui);const before=await f.api('bookings/'+code+'/confirm-doc'),oldValues=ui.defaults(before);await f.api('inquiries/MS-TEST','PATCH',{...input,options:{banner:true},purpose:'seminar',amount_mode:'keep'});
 await f.api('bookings/'+code+'/confirm-doc','PUT',{doc:oldValues,conditions_revision:before.conditions_revision,reception_revision:before.inquiry.reception_revision,settlement_revision:before.settlement.revision},409);
 assert.equal((await f.api('bookings/'+code+'/confirm-doc')).doc,null);
 const after=await issue(f,ui,code);assert.match(after.doc.event,/세미나/);assert.ok(after.doc.items.includes('현수막'));assert.ok(!after.doc.items.some(x=>x.includes('매니저')));
});
test('저장 견적에서 금액이 같은 옵션 변경도 확정서 무효화',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=bookingUi(),input=edit(ui,'manual');await f.api('inquiries/MS-TEST','PATCH',input);const {code}=await convert(f,ui);await issue(f,ui,code);await saveQuote(f.api,{total:input.total,input:quoteInput({space:input.space_id,customer:input.name,date:input.date,people:300,purpose:'seminar',opts:{manager:{on:true,count:1,hours:5},banner:true}})});assert.equal((await f.api('bookings/'+code+'/confirm-doc')).doc,null);
});
test('확정서 화면을 열어 둔 상태에서 문의 조건이 바뀌면 발급 전에 최신 포함 내역으로 갱신',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=bookingUi(),input=edit(ui,'manual');await f.api('inquiries/MS-TEST','PATCH',input);const {code}=await convert(f,ui);const before=await f.api('bookings/'+code+'/confirm-doc');let values=ui.defaults(before),puts=0;Object.assign(ui.ctx,{CDS:before,cdSettings:()=>values,cdFill:v=>{values=v;},cdState(){},cdPreview(){},A:async(path,opts)=>{if(opts?.method==='PUT')puts++;return f.api(path.slice(1),opts?.method,opts?.body);}});
 await f.api('inquiries/MS-TEST','PATCH',{...input,options:{manager:{count:3,hours:5},banner:true},purpose:'seminar',amount_mode:'keep'});
 await assert.rejects(ui.ctx.cdSave(),/최신 내용을 반영/);assert.equal(puts,0);assert.match(values.event,/세미나/);assert.ok(values.items.includes('현장 매니저 3명 × 5시간'));assert.ok(values.items.includes('현수막'));assert.ok(!values.items.includes('뒷정리·청소'));assert.equal(values.amount,900000);
});
