import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './helpers/admin-fixture.mjs';
const path='reservation-payment-checks/inquiry/MS-TEST',day='2026-11-28',range='revenue?from=2026-11-01&to=2026-11-30';
function setup(t){const f=fixture({booking:false,date:day});t.after(()=>f.db.close());return f;}
async function form(f,total=100000,id='inquiry-receipt-first'){const r=await f.api(path);return {status:'reservation_paid',received_total:total,receipt_note:'확정 전 예약금',request_id:id,expected_revision:r.payment_revision,expected_settlement_revision:r.settlement.revision};}
const confirm=f=>f.api('inquiries/MS-TEST/confirm','POST',{date:day,start_h:10,end_h:17,headcount:30,amount:500000});
const entries=f=>f.db.prepare('SELECT id,booking_code,request_id,kind,amount,note,created_at FROM booking_payment_entries ORDER BY id').all();
test('미확정 문의의 실제 예약금을 기록하고 상태·매출에 한 번만 반영한다',async t=>{
 const f=setup(t),r=await f.api(path);assert.equal(r.receipt_available,true);assert.equal(r.settlement.received,0);const d=await form(f);let saved=await f.api(path,'PUT',d);assert.equal(saved.receipt_added,100000);assert.equal(saved.settlement.received,100000);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);assert.equal(entries(f).length,1);
 await f.api(path,'PUT',d);assert.equal(entries(f).length,1);assert.equal((await f.api(range)).total.received,100000);assert.equal((await f.api('reservations?from='+day+'&to='+day)).items[0].payment_status,'reservation_paid');
});
test('예약 확정 시 원본 입금 ID·시각·메모와 매출 분류를 유지하고 총액을 중복 합산하지 않는다',async t=>{
 const f=setup(t),d=await form(f);await f.api(path,'PUT',d);const before=entries(f)[0],movement='entry:'+before.id;
 await f.api('revenue/classifications','PUT',{movement_id:movement,channel:'bank_corporate',account:'법인',components:[{id:'rental',amount:100000}],expected_version:0});
 const created=await confirm(f),after=entries(f)[0];assert.equal(after.booking_code,created.booking_code);for(const k of ['id','request_id','kind','amount','note','created_at'])assert.equal(after[k],before[k]);assert.equal(entries(f).length,1);
 const booking=await f.api('bookings/'+created.booking_code+'/settlement');assert.equal(booking.settlement.received,100000);assert.equal(booking.settlement.balance,400000);
 const revenue=await f.api(range);assert.equal(revenue.total.received,100000);assert.equal(revenue.items.length,1);assert.equal(revenue.items[0].movement_id,movement);assert.equal(revenue.items[0].channel,'bank_corporate');
 const reopened=await f.api(path);assert.equal(reopened.receipt_target,'booking/'+created.booking_code);assert.equal(reopened.entries[0].id,before.id);assert.equal(reopened.payment_status,'reservation_paid');
 await f.api(path,'PUT',d);assert.equal(entries(f).length,1);assert.equal((await f.api(range)).total.received,100000);
});
test('확정 이후 누적 입금을 늘리면 기존 예약금 차액만 추가하고 같은 총액 재저장은 중복되지 않는다',async t=>{
 const f=setup(t);await f.api(path,'PUT',await form(f));const b=await confirm(f);const d=await form(f,150000,'after-confirm-receipt');await f.api(path,'PUT',d);assert.equal(entries(f).length,2);assert.equal((await f.api('bookings/'+b.booking_code+'/settlement')).settlement.received,150000);await f.api(path,'PUT',await form(f,150000,'after-same-total'));assert.equal(entries(f).length,2);assert.equal((await f.api(range)).total.received,150000);
});
test('예약 확정과 겹친 오래 열린 문의 입금은 자동으로 중복 등록하지 않는다',async t=>{
 const f=setup(t),d=await form(f);await confirm(f);await f.api(path,'PUT',d,409);assert.equal(entries(f).length,0);
});
test('문의 입금 저장 직후 확정이 일어나도 응답 재시도는 같은 원본 거래 한 건만 유지한다',async t=>{
 const f=setup(t),d=await form(f),run=f.env.DB.batch.bind(f.env.DB);let booking;
 f.env.DB.batch=async ss=>{f.env.DB.batch=run;const r=await run(ss);booking=await confirm(f);return r;};
 await f.api(path,'PUT',d);await f.api(path,'PUT',d);assert.equal(entries(f).length,1);assert.equal(entries(f)[0].booking_code,booking.booking_code);assert.equal((await f.api(range)).total.received,100000);
});
test('확정 연결 중 실패하면 예약 생성과 수납 소유권 변경이 모두 롤백된다',async t=>{
 const f=setup(t);await f.api(path,'PUT',await form(f));const before=entries(f)[0];f.db.exec("CREATE TRIGGER fail_inquiry_link BEFORE UPDATE ON inquiry_payment_owners WHEN NEW.booking_code IS NOT NULL BEGIN SELECT RAISE(ABORT,'qa link failure'); END");
 await f.api('inquiries/MS-TEST/confirm','POST',{date:day,start_h:10,end_h:17,amount:500000},500);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);assert.deepEqual(entries(f)[0],before);assert.equal((await f.api(range)).total.received,100000);
});
test('같은 문의의 두 번째 예약은 이미 연결된 예약금을 다시 가져가지 않는다',async t=>{
 const f=setup(t);await f.api(path,'PUT',await form(f));const first=await confirm(f);f.db.prepare("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,amount,created_at) VALUES('SECOND-BOOKING','megaspot-gundae-2','MS-TEST','추가 예약','01012345678','5678',?,'confirmed',500000,datetime('now'))").run(day);const second={booking_code:'SECOND-BOOKING'};assert.equal(entries(f)[0].booking_code,first.booking_code);assert.equal((await f.api('bookings/'+second.booking_code+'/settlement')).settlement.received,0);assert.equal((await f.api(range)).total.received,100000);
});
test('미확정 단계의 기존 온라인 결제도 총액에 포함하고 확정 후 두 원장이 중복되지 않는다',async t=>{
 const f=setup(t);f.db.exec("INSERT INTO orders(oid,product_id,title,price,buyer_name,buyer_phone,inquiry_ref,event_date,data,status,test,created_at,paid_at) VALUES('ONLINE-INQ','pass-day-wdfri','기존 입금',100000,'검증','01012345678','MS-TEST','2026-11-28','{}','paid',0,datetime('now'),datetime('now'))");assert.equal((await f.api(path)).settlement.received,100000);await f.api(path,'PUT',await form(f,150000));assert.equal(entries(f)[0].amount,50000);assert.equal((await f.api(range)).total.received,150000);const b=await confirm(f);assert.equal((await f.api('bookings/'+b.booking_code+'/settlement')).settlement.received,150000);assert.equal((await f.api(range)).total.received,150000);
});
test('일자 미정 문의도 입금 기록일 기준으로 집계하며 확정 뒤에는 이용일 기준 한 건으로 이동한다',async t=>{
 const f=setup(t);f.db.exec("UPDATE inquiries SET event_date=NULL,data=json_set(data,'$.date','')");await f.api(path,'PUT',await form(f));const stamp=entries(f)[0].created_at.slice(0,10);const before=await f.api('revenue?from='+stamp.slice(0,7)+'-01&to='+stamp.slice(0,7)+'-30');assert.equal(before.total.received,100000);await confirm(f);assert.equal((await f.api(range)).total.received,100000);
});
test('미확정 문의의 동시 입력·오류·삭제는 이미 받은 예약금을 복제하거나 지우지 않는다',async t=>{
 const f=setup(t),d=await form(f),run=f.env.DB.batch.bind(f.env.DB);let queue=Promise.resolve();f.env.DB.batch=ss=>{const p=queue.then(()=>run(ss));queue=p.catch(()=>{});return p;};const result=await Promise.allSettled(['pending-one','pending-two'].map(request_id=>f.api(path,'PUT',{...d,request_id})));assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(entries(f).length,1);
 const deletion=await f.api('inquiries/MS-TEST','DELETE',{},409);assert.equal(deletion.code,'HAS_RECEIPTS');assert.equal((await f.api(range)).total.received,100000);
});
test('문의 입금 저장 중 오류는 원장·소유권·요청번호·결제 상태를 함께 롤백한다',async t=>{
 const f=setup(t),d=await form(f);f.db.exec("CREATE TRIGGER fail_pending_payment BEFORE INSERT ON event_log WHEN NEW.kind='inquiry.payment.receipt' BEGIN SELECT RAISE(ABORT,'qa inquiry receipt failure'); END");await f.api(path,'PUT',d,500);for(const table of ['booking_payment_entries','inquiry_payment_owners','reservation_payment_receipt_requests','reservation_payment_scopes_v2'])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);f.db.exec('DROP TRIGGER fail_pending_payment');await f.api(path,'PUT',d);assert.equal(entries(f).length,1);
});
test('입금 요청을 처리하는 사이 예약 확정이 먼저 끝나도 이전 문의 원장에는 돈을 새로 쓰지 않는다',async t=>{
 const f=setup(t),d=await form(f),run=f.env.DB.batch.bind(f.env.DB);let reached,release;const ready=new Promise(r=>reached=r);f.env.DB.batch=ss=>{f.env.DB.batch=run;reached();return new Promise((resolve,reject)=>{release=()=>run(ss).then(resolve,reject);});};const receipt=f.api(path,'PUT',d,409);await ready;await confirm(f);await release();await receipt;assert.equal(entries(f).length,0);assert.equal((await f.api(range)).total.received,0);
});
test('원장 정정 이력도 동일한 거래 ID로 예약에 연결되어 실제 정정 금액만 집계된다',async t=>{
 const f=setup(t);await f.api(path,'PUT',await form(f));const entry=entries(f)[0];f.db.prepare("INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,note,reason,created_at) VALUES(?,?, 'pending-correction',0,'correct','receipt',80000,'정정 메모','실입금 재확인',datetime('now'))").run(entry.booking_code,entry.id);assert.equal((await f.api(path)).settlement.received,80000);const b=await confirm(f);assert.equal(f.db.prepare('SELECT booking_code FROM booking_payment_revisions').get().booking_code,b.booking_code);assert.equal((await f.api('bookings/'+b.booking_code+'/settlement')).settlement.received,80000);assert.equal((await f.api(range)).total.received,80000);assert.equal(entries(f)[0].id,entry.id);
});
test('확정 금액이 올라 이미 받은 전액보다 커지면 입금은 유지하고 완료 표시는 확인 필요로 바뀐다',async t=>{
 const f=setup(t);const d=await form(f,450000);d.status='venue_fully_paid';await f.api(path,'PUT',d);const created=await f.api('inquiries/MS-TEST/confirm','POST',{date:day,start_h:10,end_h:17,amount:600000});const p=await f.api('reservation-payment-checks/booking/'+created.booking_code);assert.equal(p.payment_status,'needs_review');assert.equal(p.settlement.received,450000);assert.equal(p.settlement.balance,150000);assert.equal((await f.api(range)).total.received,450000);
});
test('일자 미정 수납이 다른 달 예약에 연결돼도 원본 기록은 그대로이며 매출은 한 달에만 집계된다',async t=>{
 const f=setup(t);f.db.exec("UPDATE inquiries SET event_date=NULL,data=json_set(data,'$.date','')");await f.api(path,'PUT',await form(f));f.db.exec("UPDATE booking_payment_entries SET created_at='2026-11-18 01:00:00'");assert.equal((await f.api(range)).total.received,100000);await f.api('inquiries/MS-TEST/confirm','POST',{date:'2026-12-28',start_h:10,end_h:17,amount:500000});assert.equal((await f.api(range)).total.received,0);assert.equal((await f.api('revenue?from=2026-12-01&to=2026-12-31')).total.received,100000);assert.equal(entries(f)[0].created_at,'2026-11-18 01:00:00');
});
