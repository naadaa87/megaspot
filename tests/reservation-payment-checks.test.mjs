import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,DAY} from './helpers/admin-fixture.mjs';import {PAYMENT_CHECKS} from '../functions/api/_reservation_payment_checks.js';
const path='reservation-payment-checks/booking/BK-TEST';
function setup(t,options={booking:true}){const f=fixture(options);t.after(()=>f.db.close());return f;}
async function rows(f){return (await f.api('reservations?from='+DAY+'&to='+DAY)).items;}
test('결제 열의 모든 상태를 각각 저장하면 새 목록 요청에도 같은 값과 버전으로 유지된다',async t=>{
 const f=setup(t);assert.equal((await rows(f))[0].payment_status,'unpaid');let revision=0;
 for(const status of Object.keys(PAYMENT_CHECKS)){const saved=await f.api(path,'PUT',{status,expected_revision:revision});assert.equal(saved.payment_revision,++revision);const current=(await rows(f))[0];assert.equal(current.payment_status,status);assert.equal(current.payment_revision,revision);assert.equal(current.payment_source,'manual');}
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='reservation.payment_check'").get().n,Object.keys(PAYMENT_CHECKS).length);
});
test('결제 확인 표시만 바꾸어도 수납·환불·보증금·확정 상태나 고객 알림은 생성하거나 바꾸지 않는다',async t=>{
 const f=setup(t);const counts=()=>['booking_payment_entries','payapp_refunds','deposit_notifications','booking_guide_messages','transaction_notifications','booking_deposit_checks'].map(t=>f.db.prepare('SELECT COUNT(*) n FROM '+t).get().n),before=counts(),b=f.db.prepare('SELECT status,amount,confirm_doc FROM bookings').get();
 await f.api(path,'PUT',{status:'fully_paid',expected_revision:0});assert.deepEqual(counts(),before);assert.deepEqual({...f.db.prepare('SELECT status,amount,confirm_doc FROM bookings').get()},{...b});
});
test('기존 실제 수납은 금액에 따라 예약금·전액 상태로 보이며 보증금 입금은 예약금으로 오인하지 않는다',async t=>{
 const f=setup(t);f.db.prepare("INSERT INTO inquiry_checks VALUES('MS-TEST','{\"guarantee_paid\":true}',datetime('now'))").run();assert.equal((await rows(f))[0].payment_status,'unpaid');
 f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','partial','receipt',100000,datetime('now'))").run();assert.equal((await rows(f))[0].payment_status,'partial_paid');
 f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','rest','receipt',400000,datetime('now'))").run();assert.equal((await rows(f))[0].payment_status,'venue_fully_paid');
});
test('예약금 입금 체크를 해 둔 기존 문의는 그대로 반영하고 새 예약 확정에도 선택값을 이어받는다',async t=>{
 const f=setup(t,{booking:false});f.db.prepare("INSERT INTO inquiry_checks VALUES('MS-TEST','{\"deposit_paid\":true}',datetime('now'))").run();assert.equal((await rows(f))[0].payment_status,'reservation_paid');
 await f.api('reservation-payment-checks/inquiry/MS-TEST','PUT',{status:'venue_paid',expected_revision:0});
 const r=await f.api('inquiries/MS-TEST/confirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:500000});const row=(await rows(f)).find(x=>x.code===r.booking_code);assert.equal(row.payment_status,'venue_paid');assert.equal(row.payment_revision,1);
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
test('이전 잔금 기록은 범위 확인 필요로 이관하고 전액 기록·버전·시각을 보존한다',async t=>{
 const f=setup(t);const {readFileSync}=await import('node:fs');
 f.db.exec("INSERT INTO reservation_payment_checks VALUES('booking','BK-TEST','balance_paid',3,'2026-11-12 01:02:03'); INSERT INTO reservation_payment_checks VALUES('inquiry','MS-TEST','fully_paid',4,'2026-11-12 01:02:04')");
 const migration=readFileSync(new URL('../migrations/20261118_reservation_payment_scopes.sql',import.meta.url),'utf8');f.db.exec(migration);f.db.exec(readFileSync(new URL('../migrations/20261118_payment_completion_scope.sql',import.meta.url),'utf8'));
 let item=(await rows(f))[0];assert.equal(item.payment_status,'needs_review');assert.equal(item.payment_revision,3);assert.equal(item.payment_updated_at,'2026-11-12 01:02:03');assert.equal(f.db.prepare("SELECT status FROM reservation_payment_scopes_v2 WHERE target_type='inquiry'").get().status,'venue_fully_paid');
 await f.api(path,'PUT',{status:'food_paid',expected_revision:3});f.db.exec(migration);f.db.exec(readFileSync(new URL('../migrations/20261118_payment_completion_scope.sql',import.meta.url),'utf8'));item=(await rows(f))[0];assert.equal(item.payment_status,'food_paid');assert.equal(item.payment_revision,4);assert.equal(f.db.prepare("SELECT status FROM reservation_payment_checks WHERE target_type='booking'").get().status,'balance_paid');
});
test('상태 편집을 열 때 최신 값·버전·선택지를 읽으며 읽기 자체는 입금 기록을 변경하지 않는다',async t=>{
 const f=setup(t),before=f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n;
 let r=await f.api(path);assert.equal(r.payment_status,'unpaid');assert.equal(r.payment_revision,0);assert.equal(r.editable,true);assert.equal(Object.keys(r.choices).length,8);
 await f.api(path,'PUT',{status:'venue_paid',expected_revision:0});r=await f.api(path);assert.equal(r.payment_status,'venue_paid');assert.equal(r.payment_revision,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n,before);
 await f.api(path,'PUT',{status:'food_paid',expected_revision:0},409);assert.equal((await f.api(path)).payment_status,'venue_paid');
 f.db.exec("UPDATE bookings SET status='cancelled'");assert.equal((await f.api(path)).editable,false);
 assert.equal((await f.handle(new Request('https://local.test/api/admin/'+path))).status,401);
 await f.api('reservation-payment-checks/booking/MISSING','GET',undefined,404);
});
test('문의용 상태 편집도 목록과 동일한 예약금 추론과 최신 저장값을 읽는다',async t=>{
 const f=setup(t,{booking:false});f.db.exec("INSERT INTO inquiry_checks VALUES('MS-TEST','{\"deposit_paid\":true}',datetime('now'))");const path='reservation-payment-checks/inquiry/MS-TEST';assert.equal((await f.api(path)).payment_status,'reservation_paid');await f.api(path,'PUT',{status:'food_paid',expected_revision:0});assert.equal((await f.api(path)).payment_status,'food_paid');
});
test('대관 약정 예약금은 수납·환불로 자동 판정되며 반환 보증금과 확정서에서 구분된다',async t=>{
 const f=setup(t,{booking:false}),inquiry='inquiries/MS-TEST',terms='reservation-payment-terms/',check='reservation-payment-checks/';
 await f.api(terms+'inquiry/MS-TEST','PUT',{reservation_fee:200000,version:0});
 await f.api(terms+'inquiry/MS-TEST','PUT',{reservation_fee:300000,version:0},409);
 await f.api(check+'inquiry/MS-TEST','PUT',{status:'reservation_paid',expected_revision:0});
 assert.equal((await rows(f))[0].payment_status,'unpaid');
 let ledger=await f.api(inquiry+'/settlement');
 await f.api(inquiry+'/settlement','POST',{kind:'receipt',amount:100000,note:'계좌이체',expected_revision:ledger.settlement.revision,request_id:crypto.randomUUID()});
 assert.equal((await rows(f))[0].payment_status,'partial_paid');
 const {booking_code:code}=await f.api(inquiry+'/confirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:500000});
 const booking='bookings/'+code;
 let doc=await f.api(booking+'/confirm-doc');
 assert.equal(doc.preview.reservation_fee,200000);
 assert.equal(doc.preview.reservation_paid,false);
 assert.equal(doc.settlement.net,100000);
 assert.equal((await rows(f)).find(r=>r.code===code).payment_status,'partial_paid');
 await f.api(booking+'/confirm-doc','PUT',{doc:{show_amount:true,deposit:150000},conditions_revision:doc.conditions_revision,settlement_revision:doc.settlement.revision});
 const {onRequestGet}=await import('../functions/api/confirm.js'),{confirmToken}=await import('../functions/api/_confirm.js');
 const request=new Request('https://local.test/api/confirm?c='+code+'&k='+await confirmToken(f.env,code));
 async function published(){return (await (await onRequestGet({env:f.env,request})).json()).doc;}
 async function payment(kind,amount){
  ledger=await f.api(booking+'/settlement');
  await f.api(booking+'/settlement','POST',{kind,amount,note:'계좌이체',expected_revision:ledger.settlement.revision,request_id:crypto.randomUUID()});
 }
 await payment('receipt',100000);
 assert.equal((await rows(f)).find(r=>r.code===code).payment_status,'reservation_paid');
 assert.equal((await published()).reservation_paid,true);
 assert.equal((await published()).deposit,150000);
 await payment('refund',50000);
 assert.equal((await rows(f)).find(r=>r.code===code).payment_status,'partial_paid');
 assert.equal((await published()).reservation_paid,false);
 await f.api(terms+'booking/'+code,'PUT',{reservation_fee:120000,version:1});
 assert.equal((await published()).reservation_fee,120000);
 assert.equal((await published()).reservation_paid,true);
 await f.api(terms+'booking/'+code,'PUT',{reservation_fee:null,version:2});
 assert.equal((await published()).reservation_fee,undefined);
 assert.equal((await published()).deposit,150000);
});
