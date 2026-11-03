import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {saveQuote,DAY} from './helpers/admin-fixture.mjs';
import {onRequestGet} from '../functions/api/confirm.js';
import {confirmToken} from '../functions/api/_confirm.js';
const setup=t=>{const f=payappFixture();t.after(()=>f.db.close());return f;};
const read=f=>f.api('bookings/BK-TEST/settlement');
async function bank(f,kind,amount){const r=await read(f);await f.api('bookings/BK-TEST/settlement','POST',{kind,amount,note:'추가 수수료 검증',request_id:crypto.randomUUID(),expected_revision:r.settlement.revision});return (await read(f)).entries[0];}
async function fee(f,amount){const r=await f.api('bookings/BK-TEST/cancellation');return f.api('bookings/BK-TEST/cancellation','POST',{mode:'manual',fee:amount,reason:'취소 수수료 재합의',cancelled_at:r.terms?.cancelled_at||new Date().toISOString(),request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version});}
async function edit(f,id,extra={},status=200){const r=await read(f),e=r.entries.find(x=>x.id===id);return f.api('bookings/BK-TEST/settlement/entries/'+id,'POST',{action:'correct',kind:e.kind,amount:e.amount,note:e.note,reason:'추가 수수료 수납 기록 대조',request_id:crypto.randomUUID(),entry_version:e.version,expected_revision:r.settlement.revision,...extra},status);}
async function issue(f,extra={}){const r=await f.api('bookings/BK-TEST/cancellation');return f.api('bookings/BK-TEST/cancellation/document','POST',{expected_revision:r.settlement.revision,expected_version:r.version,...extra});}
async function customer(f){const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});assert.equal(response.status,200);return (await response.json()).doc;}
async function scenario(f){await bank(f,'receipt',1000000);await saveQuote(f.api,{total:1000000});await fee(f,200000);await bank(f,'refund',800000);await fee(f,300000);return bank(f,'receipt',100000);}
function amounts(s,received,refunded,balance,due){assert.equal(s.received,received);assert.equal(s.refunded,refunded);assert.equal(s.net,received-refunded);assert.equal(s.balance,balance);assert.equal(s.refund_due,due);assert.equal(s.cancellation.fee,300000);assert.equal(s.booking_status,'cancelled');}

test('추가 취소 수수료 10만원 수납을 4만원으로 정정하면 환불80만원 보존·다시 받을6만원',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{amount:40000});const r=await read(f);amounts(r.settlement,1040000,800000,60000,0);assert.equal(r.entries.find(x=>x.id===e.id).original_amount,100000);assert.equal(r.history[0].reason,'추가 수수료 수납 기록 대조');assert.equal((await f.api('inquiries/MS-TEST')).bookings[0].settlement.balance,60000);assert.equal((await f.api('bookings')).items[0].settlement.balance,60000);
});
test('추가 수납 원본 취소는 환불 기록을 만들지 않고 다시 받을10만원을 복원',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{action:'void'});const r=await read(f);amounts(r.settlement,1000000,800000,100000,0);assert.equal(r.entries.length,3);assert.equal(r.entries.find(x=>x.id===e.id).state,'void');assert.equal(r.entries.filter(x=>x.kind==='refund').length,1);assert.equal((await f.api('inquiries/MS-TEST')).item.status,'취소·환불');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendar_blocks').get().n,0);
});
test('정정·취소한 추가 수납을 복원해도 원장 원본 한 건만 합산',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{amount:40000});await edit(f,e.id,{action:'void'});await edit(f,e.id,{amount:100000,reason:'실제 입금 확인 후 복원'});const r=await read(f);amounts(r.settlement,1100000,800000,0,0);assert.equal(r.settlement.status,'cancellation_settled');assert.equal(r.entries.length,3);assert.equal(r.history.length,3);
});
test('추가 수납을 더 큰 실제 금액으로 정정하면 초과분만 추가 환불',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{amount:200000});amounts((await read(f)).settlement,1200000,800000,0,100000);await edit(f,e.id,{amount:150000});amounts((await read(f)).settlement,1150000,800000,0,50000);
});
test('추가 수납 정정 뒤 수수료 감액과 원본 취소는 추가 환불·추가 수납을 일관되게 전환',async t=>{
 const f=setup(t),e=await scenario(f);await edit(f,e.id,{amount:40000});await fee(f,100000);let s=(await read(f)).settlement;assert.equal(s.refund_due,140000);assert.equal(s.balance,0);await edit(f,e.id,{action:'void'});s=(await read(f)).settlement;assert.equal(s.refund_due,100000);assert.equal(s.balance,0);assert.equal(s.refunded,800000);
});
test('문의·새 견적·고객 정산서는 정정·취소 수납을 반영하고 기존 견적은 보존',async t=>{
 const f=setup(t),e=await scenario(f);await issue(f);const old=await saveQuote(f.api,{total:1000000});await edit(f,e.id,{amount:40000});await saveQuote(f.api,{total:1000000});let r=await f.api('inquiries/MS-TEST'),doc=await customer(f);assert.equal(r.quotes[0].data.settlement.balance,60000);assert.equal(r.quotes.find(q=>q.quote_no===old.quote_no).data.settlement.balance,0);assert.equal(doc.settlement.balance,60000);assert.equal(doc.settlement.refunded,800000);await edit(f,e.id,{action:'void'});await saveQuote(f.api,{total:1000000});r=await f.api('inquiries/MS-TEST');doc=await customer(f);assert.equal(r.bookings[0].settlement.balance,100000);assert.equal(r.quotes[0].data.settlement.balance,100000);assert.equal(doc.settlement.balance,100000);assert.equal(doc.settlement.refunded,800000);assert.equal(doc.doc_type,'cancellation');
});
test('금액 비공개 정산서는 추가 수납 정정·취소·재발급 후에도 금액을 숨김',async t=>{
 const f=setup(t),e=await scenario(f);await issue(f,{show_amount:false});for(const change of [{amount:40000},{action:'void'}]){await edit(f,e.id,change);await issue(f);const doc=await customer(f);assert.equal(doc.show_amount,false);assert.equal(doc.settlement,null);assert.equal(doc.paid,null);assert.equal(doc.amount,null);}
});
test('오래 열린 수납 편집·취소 정산서 발급은 다른 정정 후 차단',async t=>{
 const f=setup(t),e=await scenario(f),old=await read(f),c=await f.api('bookings/BK-TEST/cancellation');await edit(f,e.id,{amount:60000});await edit(f,e.id,{amount:40000,entry_version:e.version,expected_revision:old.settlement.revision},409);await f.api('bookings/BK-TEST/cancellation/document','POST',{expected_version:c.version,expected_revision:old.settlement.revision},409);amounts((await read(f)).settlement,1060000,800000,40000,0);
});
test('정정·취소 요청 중복 재전송과 취소된 원본 입금 재전송도 합계·이력 중복 없음',async t=>{
 const f=setup(t),e=await scenario(f),s=(await read(f)).settlement,change={request_id:'extra-fee-edit-idempotent',amount:40000,entry_version:e.version,expected_revision:s.revision};await edit(f,e.id,change);assert.equal((await edit(f,e.id,change)).duplicate,true);let r=await read(f),current=r.entries.find(x=>x.id===e.id);const v={action:'void',request_id:'extra-fee-void-idempotent',entry_version:current.version,expected_revision:r.settlement.revision};await edit(f,e.id,v);assert.equal((await edit(f,e.id,v)).duplicate,true);await f.api('bookings/BK-TEST/settlement','POST',{kind:e.original_kind,amount:e.original_amount,note:e.original_note,request_id:e.request_id,expected_revision:s.revision});r=await read(f);amounts(r.settlement,1000000,800000,100000,0);assert.equal(r.history.length,2);
});
test('재확정·재취소 후 추가 수납 정정·취소도 이전 환불과 이번 환불을 분리',async t=>{
 const f=setup(t);await scenario(f);let s=(await read(f)).settlement;await f.api('bookings/BK-TEST/reconfirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:1000000,request_id:crypto.randomUUID(),expected_revision:s.revision});await bank(f,'receipt',700000);await fee(f,100000);await bank(f,'refund',900000);await fee(f,300000);const e=await bank(f,'receipt',200000);await edit(f,e.id,{amount:50000});s=(await read(f)).settlement;assert.equal(s.balance,150000);assert.equal(s.refunded,1700000);assert.equal(s.prior_refunded,800000);assert.equal(s.cycle_refunded,900000);await edit(f,e.id,{action:'void'});s=(await read(f)).settlement;assert.equal(s.balance,200000);assert.equal(s.refund_due,0);assert.equal(s.refunded,1700000);
});
test('PG 환불·계좌 추가 수납이 섞여도 계좌 기록 정정·취소는 PG 실적을 보존',async t=>{
 const f=setup(t),pg=f.seed({price:1000000});await fee(f,200000);const body=await f.form(pg,'70',{mul_no:'870001',orig_mul_no:pg.mul_no,orig_price:'1000000',price:'800000'});await f.feedback(body);await fee(f,300000);const e=await bank(f,'receipt',100000);await edit(f,e.id,{amount:40000});await f.feedback(body);let s=(await read(f)).settlement;assert.equal(s.pg_refunded,800000);assert.equal(s.manual_received,40000);assert.equal(s.balance,60000);await edit(f,e.id,{action:'void'});s=(await read(f)).settlement;assert.equal(s.pg_refunded,800000);assert.equal(s.balance,100000);assert.equal(s.refund_due,0);
});
