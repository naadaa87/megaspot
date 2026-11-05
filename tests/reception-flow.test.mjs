import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,quoteInput,DAY} from './helpers/admin-fixture.mjs';
import {onRequestPost} from '../functions/api/inquiry.js';
import C from '../assets/js/reception-calc.js';
import O from '../assets/js/inquiry-overview.js';
async function submit(f,reception,extra={},expected=200){
 const res=await onRequestPost({env:f.env,request:new Request('https://local.test/api/inquiry',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'10.0.0.'+(++submit.ip)},body:JSON.stringify({name:'고객 선택 검증',phone:'010-1234-5678',agree_privacy:true,date:DAY,space_id:'megaspot-gundae',headcount:30,total:500000,reserve:true,start_h:10,end_h:17,reception,...extra})})});
 const data=await res.json();assert.equal(res.status,expected,JSON.stringify(data));return data;
}submit.ip=0;
for(const course of C.activeCourses())for(const format of C.activeFormats().map(f=>f.id)){
 test(`고객 ${course.name}·${format}: 새 업체 상담 구성은 문의·견적에 보존하고 미확정 금액은 합산하지 않음`,async t=>{
  const f=fixture();t.after(()=>f.db.close());const {ref}=await submit(f,{course:course.id,format,people:50,total:1,fee:1,status:'cancelled',menu_ids:['cf-menu-79'],budget_per_person:30000});
  let item=(await f.api('inquiries/'+ref)).item,rec=item.data.reception;
  assert.equal(item.headcount,30);assert.equal(rec.people,50);assert.equal(rec.course,course.id);assert.equal(rec.format,format);assert.equal(rec.total,null);assert.equal(rec.fee,null);assert.equal(rec.by,'customer');assert.equal(rec.status,'pending');assert.equal(rec.provider,'cafefriends');assert.deepEqual(rec.menuNames,['훈제연어 카나페']);assert.equal(rec.budget_per_person,30000);
  assert.equal(O.build(item,{roomAmount:500000}).total,500000);
  const input=C.syncQuote(quoteInput({people:30}),item.data,true);
  await f.api('quotes','POST',{inquiry_ref:ref,customer:item.name,event_date:DAY,total:500000,data:{input,extras:[],total:500000}});
  const detail=await f.api('inquiries/'+ref);item=detail.item;assert.equal(item.effective_amount,500000);assert.equal(item.data.included_reception_amount,0);assert.equal(item.data.reception_in_quote,true);assert.equal(detail.quotes[0].data.input.reception_request.provider,'cafefriends');assert.deepEqual(detail.quotes[0].data.input.reception_request.menuNames,['훈제연어 카나페']);
 });
}
test('미정 방식·인원·대규모 상담도 기존 업체로 대체하지 않음',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 for(const choice of [{course:'all',people:50,format:'table'},{course:'cf-meal',people:50,format:''},{course:'cf-finger',people:1000,format:'box'},{course:'cf-snack',people:null,format:''}]){const {ref}=await submit(f,choice);const rec=(await f.api('inquiries/'+ref)).item.data.reception;assert.equal(rec.total,null);assert.equal(rec.people,choice.people);assert.equal(rec.course,choice.course==='all'?'cf-custom':choice.course);assert.equal(rec.provider,'cafefriends');}
});
test('잘못된 선택은 조용히 기본값으로 저장하지 않고 거절',async t=>{
 const f=fixture();t.after(()=>f.db.close());for(const reception of [{course:'vip',people:50,format:'table'},{course:'classic',people:0,format:'table'},{course:'light',people:50,format:'x'},{course:'classic',people:1.5,format:'box'},[]])await submit(f,reception,{},400);
});
test('기존 텍스트 문의에서도 식사 인원·코스·방식을 복원하며 과거 금액을 구별',()=>{
 for(const course of C.data.courses){const q=C.quote(50,'box',course.id),text=C.inquiryText(50,'box',course.id);const rec=C.fromInquiry({headcount:30,message:'고객 요청\n\n'+text});assert.equal(rec.course,course.id);assert.equal(rec.people,50);assert.equal(rec.format,'box');assert.equal(rec.total,q.total);assert.equal(rec.requested_total,q.total);}
 const old=C.fromInquiry({message:C.inquiryText(50,'table','classic').replace('2,145,000원','2,000,000원')});assert.equal(old.total,2145000);assert.equal(old.requested_total,2000000);
 const summary=C.fromInquiry({headcount:30,summary:'도시락·핑거푸드 시그니처 42명 · 박스 케이터링: 2,410,000원 (부가세 확인 전)'});assert.equal(summary.course,'signature');assert.equal(summary.people,42);assert.equal(summary.format,'box');
 assert.equal(C.fromInquiry({message:'라이트 케이터링을 원하지 않습니다.'}),null);
});
