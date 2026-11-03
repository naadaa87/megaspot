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
for(const course of C.data.courses)for(const format of ['table','box','lunchbox']){
 test(`고객 ${course.name}·${format}: 접수→문의관리→견적 저장까지 선택·금액 보존`,async t=>{
  const f=fixture();t.after(()=>f.db.close());const q=C.quote(50,format,course.id);
  const {ref}=await submit(f,{course:course.id,format,people:50,total:1,fee:1,status:'cancelled'});
  let item=(await f.api('inquiries/'+ref)).item;const rec=item.data.reception;
  assert.equal(item.headcount,30);assert.equal(rec.people,50);assert.equal(rec.course,course.id);assert.equal(rec.format,format);assert.equal(rec.total,q.total);assert.equal(rec.fee,q.fee);assert.equal(rec.by,'customer');assert.equal(rec.status,'pending');assert.equal(C.fromInquiry(item.data).total,q.total);
  assert.equal(O.build(item,{roomAmount:500000}).total,500000+q.total);
  const row={kind:'reception',label:rec.summary,amount:rec.total,reception:rec};
  await f.api('quotes','POST',{inquiry_ref:ref,customer:item.name,event_date:DAY,total:500000+q.total,data:{input:quoteInput({people:30,extras:[row]}),extras:[row],total:500000+q.total}});
  item=(await f.api('inquiries/'+ref)).item;assert.equal(item.effective_amount,500000+q.total);assert.equal(item.data.included_reception_amount,q.total);assert.equal(item.data.reception.people,50);assert.equal(item.headcount,30);assert.equal(O.build(item,{roomAmount:item.effective_amount-item.data.included_reception_amount}).total,500000+q.total);
 });
}
test('미정 코스·방식·인원·301명 이상은 선택을 보존하고 금액 미정으로 접수',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 for(const selection of [{course:'all',people:50,format:'table'},{course:'signature',people:50,format:''},{course:'premium',people:301,format:'box'},{course:'light',people:null,format:''}]){
  const {ref}=await submit(f,selection);const item=(await f.api('inquiries/'+ref)).item,rec=item.data.reception;
  assert.equal(rec.total,null);assert.equal(rec.people,selection.people);assert.equal(rec.course,selection.course);assert.equal(rec.format,selection.format);assert.equal(O.build(item,{roomAmount:500000}).total,500000);
 }
});
test('잘못된 선택은 조용히 기본값으로 저장하지 않고 거절',async t=>{
 const f=fixture();t.after(()=>f.db.close());for(const reception of [{course:'vip',people:50,format:'table'},{course:'classic',people:0,format:'table'},{course:'light',people:50,format:'x'},{course:'classic',people:1.5,format:'box'},[]])await submit(f,reception,{},400);
});
test('기존 텍스트 문의에서도 식사 인원·코스·방식을 복원하며 과거 금액을 구별',()=>{
 for(const course of C.data.courses){const q=C.quote(50,'box',course.id),text=C.inquiryText(50,'box',course.id);const rec=C.fromInquiry({headcount:30,message:'고객 요청\n\n'+text});assert.equal(rec.course,course.id);assert.equal(rec.people,50);assert.equal(rec.format,'box');assert.equal(rec.total,q.total);assert.equal(rec.requested_total,q.total);}
 const old=C.fromInquiry({message:C.inquiryText(50,'table','classic').replace('1,950,000원','2,000,000원')});assert.equal(old.total,1950000);assert.equal(old.requested_total,2000000);
 const summary=C.fromInquiry({headcount:30,summary:'도시락·핑거푸드 시그니처 42명 · 박스 케이터링: 2,410,000원 (부가세 확인 전)'});assert.equal(summary.course,'signature');assert.equal(summary.people,42);assert.equal(summary.format,'box');
 assert.equal(C.fromInquiry({message:'라이트 케이터링을 원하지 않습니다.'}),null);
});
