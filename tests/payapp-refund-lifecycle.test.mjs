import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import {onRequestGet} from '../functions/api/confirm.js';
import {confirmToken} from '../functions/api/_confirm.js';
const setup=t=>{const f=payappFixture();t.after(()=>f.db.close());return f;};
const read=async f=>(await f.api('bookings/BK-TEST/settlement'));
const part=(f,o,id,amount,state='70')=>f.form(o,state,{mul_no:id,orig_mul_no:o.mul_no,orig_price:String(o.price),price:String(amount)});
const total=(f,o)=>f.db.prepare('SELECT COALESCE(SUM(amount),0) n FROM payapp_refunds WHERE oid=?').get(o.oid).n;
async function issue(f){const r=await f.api('bookings/BK-TEST/confirm-doc');return f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:r.booking.amount},settlement_revision:r.settlement.revision,reception_revision:r.inquiry.reception_revision});}

test('부분 취소 → 전체 환불은 남은 금액만 반영하고 원장·정산·이력 합계 일치',async t=>{
 const f=setup(t),o=f.seed();await saveQuote(f.api,{total:600000,input:quoteInput()});await issue(f);await f.feedback(await part(f,o,'900001',200000));let r=await read(f);assert.equal(r.entries.length,0);assert(!JSON.stringify(r.online).includes('processing_token'));assert.equal(total(f,o),200000);assert.equal(r.settlement.received,1000000);assert.equal(r.settlement.refunded,200000);assert.equal(r.settlement.net,800000);assert.equal(r.settlement.refund_due,200000);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);
 await f.feedback(await f.form(o,'9'));r=await read(f);assert.equal(total(f,o),1000000);assert.equal(r.settlement.received,1000000);assert.equal(r.settlement.refunded,1000000);assert.equal(r.settlement.net,0);assert.equal(r.settlement.balance,0);assert.equal(r.settlement.refund_due,0);assert.equal(r.settlement.status,'refunded');assert.equal(r.settlement.amount,0);assert.equal(r.online[0].events.reduce((n,e)=>n+e.effective_amount,0),1000000);assert.equal(r.online[0].events.find(e=>e.event_type==='full').effective_amount,800000);assert.equal((await f.api('inquiries/MS-TEST')).item.data.total,600000);
});
test('전체 환불 → 늦은 부분 취소·승인·재전송도 환불 누계와 예약 상태를 되돌리지 않음',async t=>{
 const f=setup(t),o=f.seed();await f.feedback(await f.form(o,'64'));await f.feedback(await part(f,o,'900002',200000,'71'));await f.feedback(await f.form(o,'4'));await f.feedback(await f.form(o,'9'));assert.equal(total(f,o),1000000);const r=await read(f);assert.equal(r.settlement.net,0);assert.equal(r.settlement.refunded,1000000);assert.equal(r.online[0].events.find(e=>e.event_type==='partial').effective_amount,0);assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'cancelled');assert.equal(f.db.prepare('SELECT status FROM orders WHERE oid=?').get(o.oid).status,'refunded');
});
test('부분 취소 70·71 중복과 동시 통보는 같은 취소번호에 한 번만 반영',async t=>{
 const f=setup(t),o=f.seed(),a=await part(f,o,'900003',200000),b=await part(f,o,'900003',200000,'71');await Promise.all([f.feedback(a),f.feedback(b),f.feedback(a)]);assert.equal(total(f,o),200000);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM payapp_refund_events WHERE event_type='partial'").get().n,1);assert.equal((await read(f)).settlement.net,800000);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='order.partial_refund'").get().n,1);
});
test('동시 전체·부분 환불 순서가 바뀌어도 원금보다 더 합산하지 않음',async t=>{
 for(const fullFirst of [true,false]){const f=payappFixture(),o=f.seed();try{const a=()=>f.feedback(awaitable.full),b=()=>f.feedback(awaitable.partial),awaitable={full:await f.form(o,'9'),partial:await part(f,o,'900004',200000)};await Promise.all(fullFirst?[a(),b()]:[b(),a()]);assert.equal(total(f,o),1000000);assert.equal((await read(f)).settlement.net,0);assert.equal((await read(f)).online[0].events.reduce((n,e)=>n+e.effective_amount,0),1000000);}finally{f.db.close();}}
});
test('이미 처리한 전체 환불 재전송은 관리자가 다시 확정한 예약을 취소하지 않음',async t=>{
 const f=setup(t),o=f.seed();await f.feedback(await f.form(o,'9'));f.db.prepare("UPDATE bookings SET status='confirmed',confirm_doc=?").run(JSON.stringify({issued_at:'2026-11-03',amount:500000}));f.db.prepare("UPDATE inquiries SET status='예약 확정'").run();await f.feedback(await f.form(o,'64'));assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'confirmed');assert.ok(f.db.prepare('SELECT confirm_doc FROM bookings').get().confirm_doc);assert.equal(f.db.prepare('SELECT status FROM inquiries').get().status,'예약 확정');
});
test('중복 부분 통보는 새로 발급한 확정서를 다시 무효화하지 않음',async t=>{
 const f=setup(t),o=f.seed();const body=await part(f,o,'900005',200000);await f.feedback(body);await issue(f);const before=(await read(f)).settlement.revision;await f.feedback({...body,pay_state:'71'});assert.equal((await read(f)).settlement.revision,before);assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);
});
test('취소번호 재사용의 금액 변경·다른 주문 연결은 거절하고 원장을 유지',async t=>{
 const f=setup(t),o=f.seed(),other=f.seed();await f.feedback(await part(f,o,'900006',200000));await f.feedback(await part(f,o,'900006',300000),400);await f.feedback(await part(f,other,'900006',200000),400);assert.equal(total(f,o),200000);assert.equal(total(f,other),0);
});
test('원금보다 큰 누적 부분 취소를 거절하고 예약·발급본·정산을 유지',async t=>{
 const f=setup(t),o=f.seed();await f.feedback(await part(f,o,'900007',800000));await issue(f);await f.feedback(await part(f,o,'900008',300000),400);assert.equal(total(f,o),800000);assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'confirmed');assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);
});
test('환불 반영 중 DB 오류는 통보 이력과 원장·예약을 함께 롤백하고 재시도 가능',async t=>{
 const f=setup(t),o=f.seed();await issue(f);const body=await part(f,o,'900009',200000);f.db.exec("CREATE TRIGGER refund_failure BEFORE INSERT ON payapp_refunds BEGIN SELECT RAISE(ABORT,'fixture failure'); END");await f.feedback(body,500);assert.equal(total(f,o),0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payapp_refund_events').get().n,0);assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);f.db.exec('DROP TRIGGER refund_failure');await f.feedback(body);assert.equal(total(f,o),200000);
});
test('부분 환불이 승인보다 먼저 와도 기존 예약에 연결되고 늦은 승인이 수납을 중복하지 않음',async t=>{
 const f=setup(t),o=f.seed({status:'created',linked:false});await f.feedback(await part(f,o,'900010',200000));assert.equal(f.db.prepare('SELECT booking_code FROM orders WHERE oid=?').get(o.oid).booking_code,'BK-TEST');assert.equal((await read(f)).settlement.net,800000);await f.feedback(await f.form(o,'4'));assert.equal((await read(f)).settlement.net,800000);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
});
test('추가 결제 승인도 이미 연결된 예약 또는 단일 문의 예약을 유지',async t=>{
 for(const linked of [true,false]){const f=payappFixture();try{const o=f.seed({status:'created',linked,slot:'pkg-day'});await f.feedback(await f.form(o,'4'));assert.equal(f.db.prepare('SELECT booking_code FROM orders WHERE oid=?').get(o.oid).booking_code,'BK-TEST');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);assert.equal((await read(f)).settlement.net,1000000);}finally{f.db.close();}}
});
test('다른 결제와 정정한 계좌 예약금이 남으면 추가 PG 주문 전액 환불 후에도 예약 유지',async t=>{
 const f=setup(t),o=f.seed();let r=await read(f);await f.api('bookings/BK-TEST/settlement','POST',{kind:'receipt',amount:200000,note:'계좌',request_id:'bank-receipt-123',expected_revision:r.settlement.revision});r=await read(f);const e=r.entries[0];await f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action:'correct',kind:'receipt',amount:100000,note:'계좌',reason:'정정',request_id:'bank-correct-123',entry_version:e.version,expected_revision:r.settlement.revision});await f.feedback(await f.form(o,'9'));r=await read(f);assert.equal(r.settlement.net,100000);assert.equal(r.settlement.balance,400000);assert.equal(r.settlement.refund_due,0);assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'confirmed');
});
test('테스트 결제 환불은 실제 수납·예약 상태·문서에 영향을 주지 않음',async t=>{
 const f=setup(t),o=f.seed({test:1});await issue(f);await f.feedback(await f.form(o,'9'));assert.equal((await read(f)).settlement.received,0);assert.equal((await read(f)).online.length,0);assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'confirmed');assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);
});
test('예전 원장의 부분+전체 중복 합계도 읽기 전용 PG 누계에는 원금만 표시',async t=>{
 const f=setup(t),o=f.seed({status:'refunded'});for(const [id,amount] of [['old-part',200000],['full-'+o.mul_no,1000000]])f.db.prepare('INSERT INTO payapp_refunds(mul_no,oid,amount,created_at) VALUES(?,?,?,?)').run(id,o.oid,amount,'2026-11-03');let r=await read(f);assert.equal(r.settlement.refunded,1000000);assert.equal(r.online[0].events[0].effective_amount,1000000);await f.feedback(await f.form(o,'9'));r=await read(f);assert.equal(r.online[0].events.reduce((n,e)=>n+e.effective_amount,0),1000000);assert.equal(r.settlement.refunded,1000000);
});
test('환불 자체가 계약 금액을 다시 차감하지 않고 변경된 견적 기준으로 잔금 계산',async t=>{
 const f=setup(t),o=f.seed();await saveQuote(f.api,{total:1000000,input:quoteInput()});await f.feedback(await part(f,o,'900011',200000));assert.equal((await read(f)).settlement.balance,200000);assert.equal((await read(f)).settlement.amount,1000000);await saveQuote(f.api,{total:800000,input:quoteInput()});assert.equal((await read(f)).settlement.balance,0);assert.equal((await read(f)).settlement.refund_due,0);
});
test('새 견적·재발급 확정서·고객 조회는 PG 환불 후 순수납을 사용하고 이전 견적 원본은 보존',async t=>{
 const f=setup(t),o=f.seed(),old=await saveQuote(f.api,{total:600000,input:quoteInput()});await issue(f);await f.feedback(await part(f,o,'900012',200000));let r=await read(f);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:600000},settlement_revision:JSON.stringify([600000,1000000,0,0,0,0,'confirmed'])},409);const next=await saveQuote(f.api,{total:600000,input:quoteInput()});const issued=await issue(f),q=(await f.api('inquiries/MS-TEST')).quotes;assert.equal(q.find(x=>x.quote_no===old.quote_no).data.settlement.net,1000000);assert.equal(q.find(x=>x.quote_no===next.quote_no).data.settlement.net,800000);assert.equal(issued.doc.settlement.net,800000);assert.equal(issued.doc.settlement.refund_due,200000);const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});assert.equal((await response.json()).doc.settlement.net,800000);
});
test('전액 환불로 예약이 취소되면 기존 고객 확정서를 열거나 다시 발급할 수 없음',async t=>{
 const f=setup(t),o=f.seed();await issue(f);const token=await confirmToken(f.env,'BK-TEST');await f.feedback(await f.form(o,'9'));const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+token)});assert.equal(response.status,410);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000}},409);const s=(await read(f)).settlement;assert.equal(s.balance,0);assert.equal(s.refund_due,0);assert.equal(s.status,'refunded');
});

test('환불 원장 행이 없는 예전 전액 환불도 주문 목록과 수납 조회의 환불액이 같음',async t=>{const f=setup(t),o=f.seed({status:'refunded'});assert.equal((await read(f)).online[0].refunded,1000000);assert.equal((await f.api('orders')).items.find(x=>x.oid===o.oid).refunded_amount,1000000);assert.equal((await f.api('orders/'+o.oid)).item.refunded_amount,1000000);});
