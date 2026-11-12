import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,DAY} from './helpers/admin-fixture.mjs';import {PAYMENT_CHECKS} from '../functions/api/_reservation_payment_checks.js';
const path='reservation-payment-checks/booking/BK-TEST';
function setup(t,options={booking:true}){const f=fixture(options);t.after(()=>f.db.close());return f;}
async function rows(f){return (await f.api('reservations?from='+DAY+'&to='+DAY)).items;}
test('결제 열의 네 상태를 각각 저장하면 새 목록 요청에도 같은 값과 버전으로 유지된다',async t=>{
 const f=setup(t);assert.equal((await rows(f))[0].payment_status,'unpaid');let revision=0;
 for(const status of Object.keys(PAYMENT_CHECKS)){const saved=await f.api(path,'PUT',{status,expected_revision:revision});assert.equal(saved.payment_revision,++revision);const current=(await rows(f))[0];assert.equal(current.payment_status,status);assert.equal(current.payment_revision,revision);assert.equal(current.payment_source,'manual');}
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='reservation.payment_check'").get().n,4);
});
test('결제 확인 표시만 바꾸어도 수납·환불·보증금·확정 상태나 고객 알림은 생성하거나 바꾸지 않는다',async t=>{
 const f=setup(t);const counts=()=>['booking_payment_entries','payapp_refunds','deposit_notifications','booking_guide_messages','transaction_notifications','booking_deposit_checks'].map(t=>f.db.prepare('SELECT COUNT(*) n FROM '+t).get().n),before=counts(),b=f.db.prepare('SELECT status,amount,confirm_doc FROM bookings').get();
 await f.api(path,'PUT',{status:'fully_paid',expected_revision:0});assert.deepEqual(counts(),before);assert.deepEqual({...f.db.prepare('SELECT status,amount,confirm_doc FROM bookings').get()},{...b});
});
test('기존 실제 수납은 금액에 따라 예약금·전액 상태로 보이며 보증금 입금은 예약금으로 오인하지 않는다',async t=>{
 const f=setup(t);f.db.prepare("INSERT INTO inquiry_checks VALUES('MS-TEST','{\"guarantee_paid\":true}',datetime('now'))").run();assert.equal((await rows(f))[0].payment_status,'unpaid');
 f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','partial','receipt',100000,datetime('now'))").run();assert.equal((await rows(f))[0].payment_status,'reservation_paid');
 f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','rest','receipt',400000,datetime('now'))").run();assert.equal((await rows(f))[0].payment_status,'fully_paid');
});
test('예약금 입금 체크를 해 둔 기존 문의는 그대로 반영하고 새 예약 확정에도 선택값을 이어받는다',async t=>{
 const f=setup(t,{booking:false});f.db.prepare("INSERT INTO inquiry_checks VALUES('MS-TEST','{\"deposit_paid\":true}',datetime('now'))").run();assert.equal((await rows(f))[0].payment_status,'reservation_paid');
 await f.api('reservation-payment-checks/inquiry/MS-TEST','PUT',{status:'balance_paid',expected_revision:0});
 const r=await f.api('inquiries/MS-TEST/confirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:500000});const row=(await rows(f)).find(x=>x.code===r.booking_code);assert.equal(row.payment_status,'balance_paid');assert.equal(row.payment_revision,1);
});
test('다른 예약·호점·문의는 영향을 받지 않으며 다중 예약은 각각 다른 상태를 저장한다',async t=>{
 const f=setup(t);const r=await f.api('bookings','POST',{space_id:'megaspot-gundae-2',customer_name:'다른 예약',phone:'01000000001',date:DAY,start_h:10,end_h:17,amount:500000});
 await f.api(path,'PUT',{status:'fully_paid',expected_revision:0});let list=await rows(f);assert.equal(list.find(x=>x.code==='BK-TEST').payment_status,'fully_paid');assert.equal(list.find(x=>x.code===r.booking_code).payment_status,'unpaid');
});
test('동시 수정은 이전 버전을 덮어쓰지 않고 인증·출처·입력값·취소 상태를 확인한다',async t=>{
 const f=setup(t),url='https://local.test/api/admin/'+path;
 assert.equal((await f.handle(new Request(url,{method:'PUT',body:'{}'}))).status,401);
 assert.equal((await f.handle(new Request(url,{method:'PUT',headers:{'x-admin-key':f.env.ADMIN_KEY,origin:'https://foreign.test'},body:'{}'}))).status,403);
 await f.api(path,'PUT',{status:'wrong',expected_revision:0},400);await f.api(path,'PUT',{status:'unpaid',expected_revision:'0'},400);
 await f.api(path,'PUT',{status:'reservation_paid',expected_revision:0});await f.api(path,'PUT',{status:'fully_paid',expected_revision:0},409);assert.equal((await rows(f))[0].payment_status,'reservation_paid');
 f.db.prepare("UPDATE bookings SET status='cancelled'").run();await f.api(path,'PUT',{status:'fully_paid',expected_revision:1},409);
 await f.api('reservation-payment-checks/booking/MISSING','PUT',{status:'unpaid',expected_revision:0},404);
});
