import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {saveQuote,DAY} from './helpers/admin-fixture.mjs';
import {onRequestGet} from '../functions/api/confirm.js';
import {confirmToken} from '../functions/api/_confirm.js';
const setup=t=>{const f=payappFixture();t.after(()=>f.db.close());return f;};
const read=f=>f.api('bookings/BK-TEST/settlement');
async function bank(f,kind,amount){const r=await read(f);await f.api('bookings/BK-TEST/settlement','POST',{kind,amount,note:'감액 후 추가 환불 검증',request_id:crypto.randomUUID(),expected_revision:r.settlement.revision});return (await read(f)).entries[0];}
async function fee(f,amount){const r=await f.api('bookings/BK-TEST/cancellation');return f.api('bookings/BK-TEST/cancellation','POST',{mode:'manual',fee:amount,reason:'취소 수수료 감액 합의',cancelled_at:r.terms?.cancelled_at||new Date().toISOString(),request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version});}
async function edit(f,id,extra={},status=200){const r=await read(f),e=r.entries.find(x=>x.id===id);return f.api('bookings/BK-TEST/settlement/entries/'+id,'POST',{action:'correct',kind:e.kind,amount:e.amount,note:e.note,reason:'추가 환불 실제 처리 내역 대조',request_id:crypto.randomUUID(),entry_version:e.version,expected_revision:r.settlement.revision,...extra},status);}
async function issue(f,extra={}){const r=await f.api('bookings/BK-TEST/cancellation');return f.api('bookings/BK-TEST/cancellation/document','POST',{expected_revision:r.settlement.revision,expected_version:r.version,...extra});}
async function customer(f){const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});assert.equal(response.status,200);return (await response.json()).doc;}
async function scenario(f){await bank(f,'receipt',1000000);await saveQuote(f.api,{total:1000000});await fee(f,300000);await bank(f,'refund',700000);await fee(f,100000);return bank(f,'refund',200000);}
function amounts(s,refunded,balance,due){assert.equal(s.received,1000000);assert.equal(s.refunded,refunded);assert.equal(s.net,1000000-refunded);assert.equal(s.balance,balance);assert.equal(s.refund_due,due);assert.equal(s.cancellation.fee,100000);assert.equal(s.booking_status,'cancelled');}

test('감액 후 추가 환불20만원을10만원으로 정정하면 받은100만원 보존·추가 환불10만원',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{amount:100000});const r=await read(f);amounts(r.settlement,800000,0,100000);assert.equal(r.entries.find(x=>x.id===e.id).original_amount,200000);assert.equal(r.entries.find(x=>x.id===e.id).original_kind,'refund');assert.equal(r.history[0].reason,'추가 환불 실제 처리 내역 대조');assert.equal((await f.api('inquiries/MS-TEST')).bookings[0].settlement.refund_due,100000);assert.equal((await f.api('bookings')).items[0].settlement.refund_due,100000);
});
test('추가 환불 기록 취소는 기존 환불70만원을 남기고 추가 환불20만원을 복원',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{action:'void'});const r=await read(f);amounts(r.settlement,700000,0,200000);assert.equal(r.entries.length,3);assert.equal(r.entries.filter(x=>x.kind==='receipt').length,1);assert.equal(r.entries.find(x=>x.id===e.id).state,'void');assert.equal((await f.api('inquiries/MS-TEST')).item.status,'취소·환불');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendar_blocks').get().n,0);
});
test('추가 환불을30만원으로 정정하면 초과 환불10만원만 다시 받을 금액으로 전환',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{amount:300000});const r=await read(f);amounts(r.settlement,1000000,100000,0);assert.equal(r.settlement.status,'cancellation_receivable');assert.equal(r.settlement.review_required,false);assert.equal(r.settlement.cancellation_over_refunded,100000);
});
test('정정·취소한 추가 환불을 복원하면 원본 한 건만 합산하고 정산 완료',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{amount:100000});await edit(f,e.id,{action:'void'});await edit(f,e.id,{amount:200000,reason:'실제 추가 환불20만원 확인 후 복원'});const r=await read(f);amounts(r.settlement,900000,0,0);assert.equal(r.entries.length,3);assert.equal(r.history.length,3);assert.equal(r.settlement.status,'cancellation_settled');
});
test('새 견적·문의·고객 정산서는 추가 환불 정정·취소를 반영하고 예전 견적 원본은 유지',async t=>{
 const f=setup(t),e=await scenario(f);await issue(f);const old=await saveQuote(f.api,{total:1000000});await edit(f,e.id,{amount:100000});await saveQuote(f.api,{total:1000000});let r=await f.api('inquiries/MS-TEST'),doc=await customer(f);assert.equal(r.quotes[0].data.settlement.refund_due,100000);assert.equal(r.quotes.find(q=>q.quote_no===old.quote_no).data.settlement.refunded,900000);assert.equal(doc.settlement.refund_due,100000);assert.equal(doc.settlement.received,1000000);await edit(f,e.id,{action:'void'});await saveQuote(f.api,{total:1000000});r=await f.api('inquiries/MS-TEST');doc=await customer(f);assert.equal(r.bookings[0].settlement.refund_due,200000);assert.equal(r.quotes[0].data.settlement.refund_due,200000);assert.equal(doc.settlement.refunded,700000);assert.equal(doc.settlement.refund_due,200000);assert.equal(doc.doc_type,'cancellation');
});
test('초과 환불 정정 뒤 다시 받을 금액도 견적·고객 문서에 최신 반영',async t=>{
 const f=setup(t),e=await scenario(f);await issue(f);await edit(f,e.id,{amount:300000});await saveQuote(f.api,{total:1000000});const r=await f.api('inquiries/MS-TEST'),doc=await customer(f);assert.equal(r.bookings[0].settlement.balance,100000);assert.equal(r.quotes[0].data.settlement.balance,100000);assert.equal(doc.settlement.balance,100000);assert.equal(doc.settlement.refund_due,0);assert.equal(doc.settlement.refunded,1000000);
});
test('금액 비공개 설정은 추가 환불 정정·취소·재발급 후에도 보존',async t=>{
 const f=setup(t),e=await scenario(f);await issue(f,{show_amount:false});for(const extra of [{amount:100000},{action:'void'}]){await edit(f,e.id,extra);await issue(f);const doc=await customer(f);assert.equal(doc.show_amount,false);assert.equal(doc.settlement,null);assert.equal(doc.paid,null);assert.equal(doc.amount,null);}
});
test('다른 창의 정정 이후 과거 환불 편집·문서 발급은 최신 결과를 덮어쓰지 못함',async t=>{
 const f=setup(t),e=await scenario(f),old=await read(f),c=await f.api('bookings/BK-TEST/cancellation');await edit(f,e.id,{amount:100000});await edit(f,e.id,{amount:300000,entry_version:e.version,expected_revision:old.settlement.revision},409);await f.api('bookings/BK-TEST/cancellation/document','POST',{expected_version:c.version,expected_revision:old.settlement.revision},409);amounts((await read(f)).settlement,800000,0,100000);
});
test('정정·취소 및 원본 환불 요청 재전송도 환불을 중복하거나 취소 기록을 복원하지 않음',async t=>{
 const f=setup(t),e=await scenario(f),s=(await read(f)).settlement,change={request_id:'extra-refund-edit-idempotent',amount:100000,entry_version:e.version,expected_revision:s.revision};await edit(f,e.id,change);assert.equal((await edit(f,e.id,change)).duplicate,true);let r=await read(f),current=r.entries.find(x=>x.id===e.id);const v={action:'void',request_id:'extra-refund-void-idempotent',entry_version:current.version,expected_revision:r.settlement.revision};await edit(f,e.id,v);assert.equal((await edit(f,e.id,v)).duplicate,true);await f.api('bookings/BK-TEST/settlement','POST',{kind:e.original_kind,amount:e.original_amount,note:e.original_note,request_id:e.request_id,expected_revision:s.revision});r=await read(f);amounts(r.settlement,700000,0,200000);assert.equal(r.history.length,2);
});
test('페이앱 기존 환불과 추가 계좌 환불의 정정·취소는 결제 방식별 합계와 일치',async t=>{
 const f=setup(t),pg=f.seed({price:1000000});await fee(f,300000);const body=await f.form(pg,'70',{mul_no:'880001',orig_mul_no:pg.mul_no,orig_price:'1000000',price:'700000'});await f.feedback(body);await fee(f,100000);const e=await bank(f,'refund',200000);await edit(f,e.id,{amount:100000});await f.feedback(body);let s=(await read(f)).settlement;amounts(s,800000,0,100000);assert.equal(s.pg_refunded,700000);assert.equal(s.manual_refunded,100000);await edit(f,e.id,{action:'void'});s=(await read(f)).settlement;amounts(s,700000,0,200000);assert.equal(s.pg_refunded,700000);assert.equal(s.manual_refunded,0);
});
test('재확정·재취소 후 감액 추가 환불을 바꿔도 이전 회차 수수료·환불 중복 없음',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await fee(f,200000);await bank(f,'refund',800000);let s=(await read(f)).settlement;await f.api('bookings/BK-TEST/reconfirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:1000000,request_id:crypto.randomUUID(),expected_revision:s.revision});await bank(f,'receipt',800000);await fee(f,300000);await bank(f,'refund',700000);await fee(f,100000);const e=await bank(f,'refund',200000);await edit(f,e.id,{amount:100000});s=(await read(f)).settlement;assert.equal(s.received,1800000);assert.equal(s.refunded,1600000);assert.equal(s.prior_refunded,800000);assert.equal(s.cycle_refunded,800000);assert.equal(s.refund_due,100000);await edit(f,e.id,{action:'void'});s=(await read(f)).settlement;assert.equal(s.refunded,1500000);assert.equal(s.refund_due,200000);assert.equal(s.balance,0);assert.equal(s.cancellation.fee,100000);
});
test('추가 환불 정정이 총수납보다 커지면 원본은 보존하고 확인 필요 상태로 표시',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{amount:400000});const r=await read(f);assert.equal(r.settlement.received,1000000);assert.equal(r.settlement.refunded,1100000);assert.equal(r.settlement.net,-100000);assert.equal(r.settlement.balance,null);assert.equal(r.settlement.refund_due,null);assert.equal(r.settlement.status,'payment_review');assert.equal(r.entries.find(x=>x.id===e.id).original_amount,200000);
});
