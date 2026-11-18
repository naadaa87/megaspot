import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './helpers/admin-fixture.mjs';
const path='reservation-payment-checks/booking/BK-TEST';
function setup(t){const f=fixture({booking:true,date:'2026-11-28'});t.after(()=>f.db.close());return f;}
async function form(f,total,status='partial_paid',id='scope-test-request'){const r=await f.api(path);return {status,received_total:total,receipt_note:'계좌 입금 확인',expected_revision:r.payment_revision,expected_settlement_revision:r.settlement.revision,request_id:id};}
const count=f=>f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n;
test('상태와 누적 입금 차액을 함께 저장하고 요청 재시도·기존 총액 재입력은 중복 수납을 만들지 않는다',async t=>{
 const f=setup(t),d=await form(f,100000);let r=await f.api(path,'PUT',d);assert.equal(r.receipt_added,100000);assert.equal(r.payment_status,'partial_paid');assert.equal(r.settlement.received,100000);assert.equal(count(f),1);
 r=await f.api(path,'PUT',d);assert.equal(r.duplicate,true);assert.equal(r.receipt_added,0);assert.equal(count(f),1);assert.equal(r.payment_revision,1);
 r=await f.api(path,'PUT',await form(f,100000,'reservation_paid','scope-same-total'));assert.equal(r.receipt_added,0);assert.equal(count(f),1);assert.equal(r.payment_status,'reservation_paid');
 r=await f.api(path,'PUT',await form(f,150000,'reservation_paid','scope-add-delta'));assert.equal(r.receipt_added,50000);assert.equal(r.settlement.received,150000);assert.equal(count(f),2);
 assert.equal((await f.api('revenue?from=2026-11-01&to=2026-11-30')).total.received,150000);
});
test('기존 온라인·수기·환불 기록은 그대로 합산하고 환불 전 누적 수납에서 차액만 추가한다',async t=>{
 const f=setup(t);f.db.exec("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','old-manual','receipt',200000,datetime('now')),('BK-TEST','old-refund','refund',50000,datetime('now'))");
 f.db.exec("INSERT INTO orders(oid,product_id,title,price,buyer_name,buyer_phone,data,status,booking_code,test,created_at,paid_at) VALUES('O-OLD','pass-day-wdfri','기존 온라인',100000,'검증','01012345678','{}','paid','BK-TEST',0,datetime('now'),datetime('now'))");
 let d=await form(f,350000);assert.equal((await f.api(path)).settlement.received,300000);let r=await f.api(path,'PUT',d);assert.equal(r.receipt_added,50000);assert.equal(r.settlement.received,350000);assert.equal(r.settlement.refunded,50000);assert.equal(r.settlement.net,300000);
 await f.api(path,'PUT',await form(f,300000,'partial_paid','scope-no-decrease'),400);assert.equal(count(f),3);
});
test('이전 버전 동시 요청은 하나만 성공하고 두 관리자가 같은 누적 총액을 적어도 중복되지 않는다',async t=>{
 const f=setup(t),d=await form(f,100000),run=f.env.DB.batch.bind(f.env.DB);let queue=Promise.resolve();f.env.DB.batch=ss=>{const p=queue.then(()=>run(ss));queue=p.catch(()=>{});return p;};
 const r=await Promise.allSettled(['scope-concurrent-a','scope-concurrent-b'].map(request_id=>f.api(path,'PUT',{...d,request_id})));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(count(f),1);assert.equal((await f.api(path)).settlement.received,100000);
});
test('같은 요청의 동시 재전송은 수납 1건과 상태 변경 1번만 만든다',async t=>{
 const f=setup(t),d=await form(f,100000),run=f.env.DB.batch.bind(f.env.DB);let queue=Promise.resolve();f.env.DB.batch=ss=>{const p=queue.then(()=>run(ss));queue=p.catch(()=>{});return p;};
 const r=await Promise.all([f.api(path,'PUT',d),f.api(path,'PUT',d)]);assert.equal(count(f),1);assert.equal((await f.api(path)).payment_revision,1);assert(r.some(x=>x.duplicate));
});
test('중간 오류는 상태·수납·요청번호·확정서 변경을 모두 롤백한다',async t=>{
 const f=setup(t),original=await f.api('bookings/BK-TEST/settlement');await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000},settlement_revision:original.settlement.revision});const before=f.db.prepare('SELECT confirm_doc FROM bookings').get().confirm_doc,d=await form(f,100000);f.db.exec("CREATE TRIGGER qa_fail_scope BEFORE INSERT ON event_log WHEN NEW.kind='reservation.payment_check' BEGIN SELECT RAISE(ABORT,'qa atomic failure'); END");
 await f.api(path,'PUT',d,500);assert.equal(count(f),0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM reservation_payment_receipt_requests').get().n,0);assert.equal((await f.api(path)).payment_revision,0);assert.equal(f.db.prepare('SELECT confirm_doc FROM bookings').get().confirm_doc,before);
 f.db.exec('DROP TRIGGER qa_fail_scope');assert.equal((await f.api(path,'PUT',d)).receipt_added,100000);
});
test('전체 완료는 실제 잔금 0일 때 저장하며 금액·버전·다른 요청번호 재사용을 검증한다',async t=>{
 const f=setup(t);await f.api(path,'PUT',await form(f,100000,'venue_fully_paid'),400);assert.equal(count(f),0);
 const d=await form(f,500000,'venue_fully_paid');await f.api(path,'PUT',d);assert.equal((await f.api(path)).settlement.balance,0);
 await f.api(path,'PUT',{...d,status:'fully_paid'},409);await f.api(path,'PUT',{...d,received_total:600000},409);
 for(const value of [-1,1.5,1000000001,'500000'])await f.api(path,'PUT',{...await form(f,500000,'fully_paid','scope-invalid'),received_total:value},400);
});
test('외부 수납이나 결제 상태가 바뀌면 이전 화면의 입금은 추가하지 않는다',async t=>{
 const f=setup(t),d=await form(f,100000);await f.api(path,'PUT',{status:'reservation_paid',expected_revision:0});await f.api(path,'PUT',d,409);assert.equal(count(f),0);
 const next=await form(f,100000,'partial_paid','scope-stale-ledger');f.db.exec("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','other-payment','receipt',100000,datetime('now'))");await f.api(path,'PUT',next,409);assert.equal(count(f),1);
});
test('미확정 문의는 입금을 가짜 예약에 넣지 않고 취소 예약의 입금도 거절한다',async t=>{
 const f=setup(t);assert.equal((await f.api('reservation-payment-checks/inquiry/MS-TEST')).receipt_available,false);await f.api('reservation-payment-checks/inquiry/MS-TEST','PUT',{status:'reservation_paid',expected_revision:0,received_total:100000},400);
 const d=await form(f,100000);f.db.exec("UPDATE bookings SET status='cancelled'");await f.api(path,'PUT',d,409);assert.equal(count(f),0);
});
test('실제 수납 저장은 보증금이나 고객 알림을 만들지 않고 현재 확정서를 갱신한다',async t=>{
 const f=setup(t),read=await f.api('bookings/BK-TEST/settlement');await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000,show_amount:true},settlement_revision:read.settlement.revision});
 const r=await f.api(path,'PUT',await form(f,100000));const doc=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(doc.doc.settlement.received,100000);assert.equal(doc.doc.settlement.revision,r.settlement.revision);
 for(const table of ['booking_deposit_checks','deposit_notifications','transaction_notifications'])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
});

test('예전 확정서에만 있던 입금액도 중복 이관 없이 차액만 기록한다',async t=>{
 const f=setup(t);f.db.prepare('UPDATE bookings SET confirm_doc=?').run(JSON.stringify({issued_at:'2026-11-01 01:00:00',paid:100000,amount:500000}));const d=await form(f,150000);assert.equal((await f.api(path)).settlement.received,100000);const r=await f.api(path,'PUT',d);assert.equal(r.receipt_added,50000);assert.equal(r.settlement.received,150000);assert.equal(count(f),2);await f.api(path,'PUT',d);assert.equal(count(f),2);
});
