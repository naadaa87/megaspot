import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {saveQuote,quoteInput,DAY,NEXT} from './helpers/admin-fixture.mjs';
import {onRequestGet} from '../functions/api/confirm.js';
import {confirmToken} from '../functions/api/_confirm.js';
import S from '../assets/js/settlement.js';
const setup=t=>{const f=payappFixture();t.after(()=>f.db.close());return f;};
const read=(f,code='BK-TEST')=>f.api('bookings/'+code+'/settlement');
async function bank(f,kind,amount,code='BK-TEST'){const r=await read(f,code);return f.api('bookings/'+code+'/settlement','POST',{kind,amount,note:'재확정 검증',request_id:crypto.randomUUID(),expected_revision:r.settlement.revision});}
async function cancel(f,fee=200000){const r=await f.api('bookings/BK-TEST/cancellation');return f.api('bookings/BK-TEST/cancellation','POST',{mode:'manual',fee,reason:'취소 수수료 합의 검증',cancelled_at:new Date().toISOString(),request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version});}
async function restore(f,extra={},status=200){const r=await read(f);return f.api('bookings/BK-TEST/reconfirm','POST',{amount:1000000,date:DAY,start_h:10,end_h:17,headcount:30,memo:'재확정 검증',block_calendar:false,request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,...extra},status);}
async function issue(f,extra={}){const r=await f.api('bookings/BK-TEST/confirm-doc');return f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{show_amount:true,...extra},settlement_revision:r.settlement.revision,reception_revision:r.inquiry.reception_revision});}
async function customer(f){const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});return {status:response.status,...await response.json()};}
async function paidCancelled(f,{received=1000000,refunded=800000,fee=200000}={}){await bank(f,'receipt',received);await saveQuote(f.api,{total:1000000,input:quoteInput()});await cancel(f,fee);if(refunded)await bank(f,'refund',refunded);}

test('문의관리의 재확정은 같은 예약번호와 수납·환불을 유지하며 취소 수수료를 중복 가산하지 않음',async t=>{
 const f=setup(t);await paidCancelled(f);const r=await f.api('inquiries/MS-TEST/confirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:1000000});assert.equal(r.booking_code,'BK-TEST');assert.equal(r.reconfirmed,true);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);const s=(await read(f)).settlement;assert.equal(s.amount,1000000);assert.equal(s.received,1000000);assert.equal(s.refunded,800000);assert.equal(s.net,200000);assert.equal(s.balance,800000);assert.equal(s.refund_due,0);assert.equal(s.cancellation,undefined);assert(s.reconfirmation);assert(S.rows(s).some(x=>x[0]==='다시 받아야 할 금액'&&x[1]==='800,000원'));assert.equal((await f.api('inquiries/MS-TEST')).bookings[0].settlement.balance,800000);
});
test('환불 진행 중 재확정은 미지급 환불 예정액을 차감하지 않고 실제 남은 수납만 충당',async t=>{
 const f=setup(t);await paidCancelled(f,{refunded:100000});assert.equal((await read(f)).settlement.refund_due,700000);await restore(f);const s=(await read(f)).settlement;assert.equal(s.net,900000);assert.equal(s.balance,100000);assert.equal(s.refund_due,0);assert.equal((await f.api('bookings/BK-TEST/cancellation')).terms,null);
});
test('전액 환불 뒤에는 전체 이용료를 다시 받고 미환불이면 기존 수납 전액을 충당',async t=>{
 for(const [refunded,fee,balance] of [[1000000,0,1000000],[0,200000,0]]){const f=payappFixture();try{await paidCancelled(f,{refunded,fee});await restore(f);assert.equal((await read(f)).settlement.balance,balance);}finally{f.db.close();}}
});
for(const amount of [1200000,100000,0,null])test('재확정 계약 총액 변경도 수수료와 별개로 계산: '+amount,async t=>{
 const f=setup(t);await paidCancelled(f);await restore(f,{amount});const s=(await read(f)).settlement;assert.equal(s.amount,amount);assert.equal(s.net,200000);assert.equal(s.balance,amount==null?null:Math.max(0,amount-200000));assert.equal(s.refund_due,amount==null?null:Math.max(0,200000-amount));
});
test('수납·환불 원장과 예전 취소 정산·견적은 재확정 뒤에도 원본 보존',async t=>{
 const f=setup(t);await paidCancelled(f);const before=await read(f),q=(await f.api('inquiries/MS-TEST')).quotes[0];await restore(f);const after=await read(f);assert.deepEqual(after.entries,before.entries);assert.deepEqual(after.history,before.history);const c=await f.api('bookings/BK-TEST/cancellation');assert.equal(c.terms,null);assert.equal(c.history[0].terms.fee,200000);assert.equal((await f.api('inquiries/MS-TEST')).quotes.find(x=>x.quote_no===q.quote_no).data.settlement.net,1000000);const history=await f.api('bookings/BK-TEST/reconfirm');assert.equal(history.history[0].snapshot.previous_cancellation.fee,200000);
});
test('PG 2건과 계좌 환불이 섞여도 실제 순수납만 재확정에 충당',async t=>{
 const f=setup(t),a=f.seed({price:600000});f.seed({price:400000});await bank(f,'receipt',200000);await cancel(f);await f.feedback(await f.form(a,'70',{mul_no:'840001',orig_mul_no:a.mul_no,orig_price:String(a.price),price:'300000'}));await bank(f,'refund',500000);await restore(f);const s=(await read(f)).settlement;assert.equal(s.received,1200000);assert.equal(s.refunded,800000);assert.equal(s.net,400000);assert.equal(s.balance,600000);assert.equal(s.pg_received,1000000);assert.equal(s.manual_received,200000);
});
test('늦게 도착한 기존 PG 전액 환불은 재확정을 다시 취소하지 않고 받아야 할 금액만 갱신',async t=>{
 const f=setup(t),o=f.seed();await cancel(f);await restore(f);await f.feedback(await f.form(o,'9'));const s=(await read(f)).settlement;assert.equal(s.booking_status,'confirmed');assert.equal(s.net,0);assert.equal(s.balance,1000000);assert.equal((await f.api('inquiries/MS-TEST')).item.status,'예약 확정');await f.feedback(await f.form(o,'64'));assert.equal((await read(f)).settlement.refunded,1000000);
});
test('재확정 뒤 새 계좌 입금·추가 PG 승인도 다시 받을 금액을 한 번씩 줄임',async t=>{
 const f=setup(t);await paidCancelled(f);await restore(f);await bank(f,'receipt',300000);assert.equal((await read(f)).settlement.balance,500000);const o=f.seed({status:'pending',price:500000});await f.feedback(await f.form(o,'4'));await f.feedback(await f.form(o,'4'));const s=(await read(f)).settlement;assert.equal(s.net,1000000);assert.equal(s.balance,0);assert.equal(s.received,1800000);assert.equal(s.refunded,800000);
});
test('재확정 요청 재전송·동시 클릭은 같은 예약에 이력과 정산을 한 번만 변경',async t=>{
 const f=setup(t);await paidCancelled(f);const before=(await read(f)).settlement,extra={request_id:'stable-reconfirmation-123',expected_revision:before.revision};const results=await Promise.all([restore(f,extra),restore(f,extra)]);assert(results.some(r=>r.duplicate));await issue(f);await restore(f,extra);assert((await f.api('bookings/BK-TEST/confirm-doc')).doc.issued_at);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_reconfirmations').get().n,1);await restore(f,{...extra,amount:1100000},409);
});
test('동시에 다른 요청으로 재확정해도 한 요청만 성공하고 새 예약 생성 없음',async t=>{
 const f=setup(t);await paidCancelled(f);const expected_revision=(await read(f)).settlement.revision;const results=await Promise.allSettled([1000000,1100000].map(amount=>restore(f,{expected_revision,amount})));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_reconfirmations').get().n,1);
});
test('재확정·다시 취소·재확정한 같은 금액도 이전 버전으로 문서를 발급할 수 없음',async t=>{
 const f=setup(t);await paidCancelled(f);await restore(f);const old=(await read(f)).settlement.revision;await cancel(f,100000);await restore(f);const r=await read(f);assert.notEqual(r.settlement.revision,old);assert.equal(r.settlement.net,200000);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{show_amount:true},settlement_revision:old},409);
});
test('재확정 중 환불이 바뀌면 오래된 정산으로 상태 변경을 차단',async t=>{
 const f=setup(t);await paidCancelled(f,{refunded:100000});const old=(await read(f)).settlement.revision;await bank(f,'refund',100000);await restore(f,{expected_revision:old},409);assert.equal((await f.api('bookings/BK-TEST/cancellation')).booking.status,'cancelled');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_reconfirmations').get().n,0);
});
test('취소 정산서 링크는 재확정 후 막고 재발급하면 정상 예약확정서와 새 잔금 표시',async t=>{
 const f=setup(t);await paidCancelled(f);let c=await f.api('bookings/BK-TEST/cancellation');await f.api('bookings/BK-TEST/cancellation/document','POST',{expected_version:c.version,expected_revision:c.settlement.revision});assert.equal((await customer(f)).doc.doc_type,'cancellation');await restore(f);assert.equal((await customer(f)).status,404);const issued=await issue(f);assert.equal(issued.doc.settlement.balance,800000);const current=await customer(f);assert.equal(current.doc.doc_type,'confirmation');assert.equal(current.doc.status,'confirmed');assert.equal(current.doc.settlement.cancellation,undefined);assert.equal(current.doc.settlement.balance,800000);
});
test('재확정도 취소 문서의 금액 비공개 기본 설정을 유지',async t=>{
 const f=setup(t);await paidCancelled(f);let c=await f.api('bookings/BK-TEST/cancellation');await f.api('bookings/BK-TEST/cancellation/document','POST',{expected_version:c.version,expected_revision:c.settlement.revision,show_amount:false});await restore(f);let r=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(r.document_preferences.show_amount,false);await bank(f,'receipt',100000);r=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(r.document_preferences.show_amount,false);
});
test('새 견적 저장은 최신 순수납·재확정 잔금을 사용하고 취소 정산을 복원하지 않음',async t=>{
 const f=setup(t);await paidCancelled(f);const old=await saveQuote(f.api,{total:1000000,input:quoteInput()});await restore(f);const next=await saveQuote(f.api,{total:1000000,input:quoteInput()});const qs=(await f.api('inquiries/MS-TEST')).quotes;assert.equal(qs.find(q=>q.quote_no===old.quote_no).data.settlement.cancellation.fee,200000);const data=qs.find(q=>q.quote_no===next.quote_no).data;assert.equal(data.settlement.cancellation,undefined);assert.equal(data.settlement.net,200000);assert.equal(data.settlement.balance,800000);assert(data.settlement.reconfirmation);
});
test('재확정 시간이 겹치면 기존 취소 정산·달력·상태를 보존',async t=>{
 const f=setup(t);await paidCancelled(f);f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,amount,start_h,end_h,created_at) VALUES('BK-OTHER','megaspot-gundae','다른 예약','010-1111-2222','2222',?,'confirmed',500000,10,17,?)").run(DAY,DAY);await restore(f,{},409);assert.equal((await f.api('bookings/BK-TEST/cancellation')).terms.fee,200000);assert.equal((await read(f)).settlement.booking_status,'cancelled');await restore(f,{force:true});assert.equal((await read(f)).settlement.booking_status,'confirmed');
});
test('다른 예약의 달력 마감을 덮어쓰지 않고 자신의 새 날짜만 마감 가능',async t=>{
 const f=setup(t);await paidCancelled(f);f.db.prepare("INSERT INTO calendar_blocks(space_id,date,state,memo) VALUES('megaspot-gundae',?,'hold','다른 임시 확보')").run(NEXT);await restore(f,{date:NEXT,block_calendar:true},409);assert.equal(f.db.prepare('SELECT memo FROM calendar_blocks').get().memo,'다른 임시 확보');await restore(f,{date:DAY,block_calendar:true});assert.equal(f.db.prepare('SELECT memo FROM calendar_blocks WHERE date=?').get(DAY).memo,'예약 BK-TEST');
});
test('취소 예약이 여러 개면 임의로 새 예약을 만들지 않고 복원 대상을 선택',async t=>{
 const f=setup(t);await paidCancelled(f);f.db.prepare("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,amount,created_at) SELECT 'BK-SECOND',space_id,inquiry_ref,customer_name,phone,phone_last4,date,'cancelled',amount,created_at FROM bookings").run();const r=await f.api('inquiries/MS-TEST/confirm','POST',{date:DAY,amount:1000000},409);assert.equal(r.code,'RECONFIRM_CHOOSE');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,2);await f.api('inquiries/MS-TEST/confirm','POST',{date:DAY,amount:1000000,reconfirm_booking_code:'BK-TEST'});assert.equal((await read(f)).settlement.net,200000);
});
test('기존 상태 변경 API와 문의 없는 직접 예약의 재확정도 원래 기록 유지',async t=>{
 const f=setup(t);await paidCancelled(f);f.db.prepare('UPDATE bookings SET inquiry_ref=NULL').run();await f.api('bookings/BK-TEST','PATCH',{status:'confirmed'});assert.equal((await read(f)).settlement.balance,800000);assert.equal((await read(f)).settlement.net,200000);assert((await read(f)).settlement.reconfirmation);
});
test('재확정 트랜잭션 실패는 취소 정산·예약·이력을 함께 롤백',async t=>{
 const f=setup(t);await paidCancelled(f);f.db.exec("CREATE TRIGGER fail_reconfirm BEFORE DELETE ON booking_cancellation_state BEGIN SELECT RAISE(ABORT,'fixture failure'); END");await restore(f,{},500);assert.equal((await read(f)).settlement.booking_status,'cancelled');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_reconfirmations').get().n,0);assert.equal((await f.api('bookings/BK-TEST/cancellation')).terms.fee,200000);f.db.exec('DROP TRIGGER fail_reconfirm');await restore(f);
});
