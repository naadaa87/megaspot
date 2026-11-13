import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {dayAt,shiftDay} from '../functions/api/_booking_payment_schedule.js';
function setup(t){
 const f=fixture({booking:true});t.after(()=>f.db.close());const today=dayAt(Date.now());t.mock.method(Date,'now',()=>Date.parse(today+'T12:00:00+09:00'));
 Object.assign(f.env,{ALIGO_LIVE_ENABLED:'true',ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'a'.repeat(32),DEPOSIT_ACCOUNT_KEY:'ab'.repeat(32)});
 f.db.prepare("INSERT INTO settings VALUES('booking_journey','{\"enabled\":true}',datetime('now'))").run();
 f.db.prepare("UPDATE booking_journey_state SET confirmed_at=? WHERE booking_code='BK-TEST'").run(shiftDay(today,-1)+' 12:00:00');
 f.db.exec("UPDATE bookings SET confirm_doc='{\"show_amount\":true}'");
 let sends=0;t.mock.method(globalThis,'fetch',async()=>{sends++;throw Error('Unexpected live request');});
 return {...f,today,sends:()=>sends};
}
const path='booking-notifications/BK-TEST';
test('예약별 조회는 기존 이용 안내와 통합 확정 안내를 구분하고 고객·관리자 이력을 함께 표시한다',async t=>{
 const f=setup(t);const list=await f.api('booking-notifications');assert.equal(list.items[0].booking_code,'BK-TEST');
 f.db.exec("INSERT INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,status,occurred_at) VALUES('a','inquiry','admin','MS-TEST',NULL,'01099998888','delivered',datetime('now'))");
 const r=await f.api(path);assert.equal(r.steps.length,7);assert.equal(r.history[0].audience,'admin');assert.equal(r.steps.find(x=>x.kind==='booking_confirmed').can_send,true);assert.equal(f.sends(),0);
});
test('미리보기는 발송하지 않고 확인한 단건 요청은 반복 실행해도 중복 큐를 만들지 않는다',async t=>{
 const f=setup(t),p=await f.api(path+'/preview','POST',{kind:'booking_confirmed'});assert.equal(f.sends(),0);assert.match(p.items[0].message,/검증 고객/);assert.equal(p.items[0].buttons.length,2);
 await f.api(path+'/send','POST',{preview_id:p.preview_id,confirm_send:true});
 await f.api(path+'/send','POST',{preview_id:p.preview_id,confirm_send:true},409);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_confirmed'").get().n,1);assert.equal(f.sends(),0);
});
test('미리보기 후 연락처·수납 내역 변경 시 기존 미리보기로 발송할 수 없다',async t=>{
 const f=setup(t),p=await f.api(path+'/preview','POST',{kind:'booking_confirmed'});
 f.db.exec("UPDATE bookings SET phone='01099991111' WHERE booking_code='BK-TEST'");
 await f.api(path+'/send','POST',{preview_id:p.preview_id,confirm_send:true},409);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM transaction_notifications').get().n,0);
});
test('이미 배송 성공했거나 결과가 불명확한 수신번호는 수동 발송 대상에서 제외한다',async t=>{
 const f=setup(t);f.db.exec("INSERT INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,status,occurred_at) VALUES('journey-confirm:BK-TEST:1','booking_confirmed','customer','BK-TEST','BK-TEST','01012345678','unknown',datetime('now'))");
 let r=await f.api(path);assert.equal(r.steps[0].can_send,false);assert.match(r.steps[0].recipients[0].reason,/불명확/);
 f.db.exec("UPDATE transaction_notifications SET status='delivered'");r=await f.api(path);assert.equal(r.steps[0].can_send,false);await f.api(path+'/preview','POST',{kind:'booking_confirmed'},409);
});
test('수신번호 2개 중 이미 받은 번호는 제외하고 미발송 번호만 미리보기한다',async t=>{
 const f=setup(t);f.db.exec("INSERT INTO booking_contacts VALUES('BK-TEST','01088887777',datetime('now')); INSERT INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,status,occurred_at) VALUES('journey-confirm:BK-TEST:1','booking_confirmed','customer','BK-TEST','BK-TEST','01012345678','delivered',datetime('now'))");
 const p=await f.api(path+'/preview','POST',{kind:'booking_confirmed'});assert.deepEqual(p.items.map(x=>x.phone),['01088887777']);
});
test('예약금·전액 납부·방문 전날·보증금 기한 전 시나리오에 맞게 수동 발송 가능 여부를 구분한다',async t=>{
 const f=setup(t);let r=await f.api(path);assert.match(r.steps.find(x=>x.kind==='balance_reminder').reason,/전날/);assert.equal(r.steps.find(x=>x.kind==='booking_arrival').can_send,false);assert.equal(r.steps.find(x=>x.kind==='payment').can_send,false);
 f.db.exec("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES('BK-TEST','full','receipt',500000,'전액',datetime('now'))");
 r=await f.api(path);assert.match(r.steps.find(x=>x.kind==='balance_reminder').reason,/남은 이용료/);assert.match(r.steps.find(x=>x.kind==='rental_paid').reason,/처음부터/);
 f.db.prepare("UPDATE bookings SET date=? WHERE booking_code='BK-TEST'").run(shiftDay(f.today,1));r=await f.api(path);assert.equal(r.steps.find(x=>x.kind==='booking_arrival').can_send,true);
});
test('접수 이력이 새로 생기면 이전 미리보기는 중복 발송을 거절한다',async t=>{
 const f=setup(t),p=await f.api(path+'/preview','POST',{kind:'booking_confirmed'});
 f.db.exec("INSERT INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,status,occurred_at) VALUES('journey-confirm:BK-TEST:1','booking_confirmed','customer','BK-TEST','BK-TEST','01012345678','accepted',datetime('now'))");
 await f.api(path+'/send','POST',{preview_id:p.preview_id,confirm_send:true},409);
});
test('예약별 API도 관리자 인증을 요구하며 임의 안내 종류와 만료 미리보기를 거절한다',async t=>{
 const f=setup(t),res=await f.handle(new Request('https://local.test/api/admin/'+path));assert.equal(res.status,401);
 await f.api(path+'/preview','POST',{kind:'arbitrary'},409);const p=await f.api(path+'/preview','POST',{kind:'booking_confirmed'});f.db.exec('UPDATE booking_guide_previews SET expires_at=0');await f.api(path+'/send','POST',{preview_id:p.preview_id,confirm_send:true},409);
});

test('명확히 실패한 취소·환불 등 기존 이벤트는 미리보기 후 같은 이력으로 재시도하고 새로운 취소나 환불은 만들지 않는다',async t=>{
 const f=setup(t);f.db.exec("INSERT INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,status,occurred_at) VALUES('inquiry:MS-TEST','inquiry','customer','MS-TEST','BK-TEST','01012345678','failed',datetime('now'))");
 const r=await f.api(path),stage=r.steps.find(x=>x.action_key.startsWith('event:'));assert.equal(stage.can_send,true);
 const p=await f.api(path+'/preview','POST',{kind:stage.action_key});assert.match(p.items[0].message,/MS-TEST/);await f.api(path+'/send','POST',{preview_id:p.preview_id,confirm_send:true});
 const rows=f.db.prepare("SELECT kind,status,event_key,audience FROM transaction_notifications WHERE audience='customer'").all();assert.equal(rows.length,1,JSON.stringify(rows));assert.equal(rows[0].kind,'inquiry');assert.equal(rows[0].status,'queued');
});
test('보증금 미납 안내는 기한 창과 승인·시험 설정을 충족한 경우에만 최신 예약 정보로 큐를 만든다',async t=>{
 const f=setup(t);Object.assign(f.env,{ALIGO_SENDER_KEY:'console-test',ALIGO_SENDER:'0212345678'});
 const {depositMessageHash}=await import('../functions/api/_deposit_notifications.js');const {DEPOSIT_TEMPLATE_CODES}=await import('../functions/api/_deposit_templates.js');
 f.db.prepare("UPDATE bookings SET date=? WHERE booking_code='BK-TEST'").run(shiftDay(f.today,4));
 const s={enabled:true,types:{payment:true,account:true,refunded:true},codes:DEPOSIT_TEMPLATE_CODES};s.hash=await depositMessageHash(f.env,s);
 f.db.prepare("INSERT INTO settings VALUES('deposit_alimtalk',?,datetime('now'))").run(JSON.stringify(s));
 for(const kind of Object.keys(s.types))f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,mode,status,config_hash) VALUES('TEST',?,?,datetime('now'),'test','delivered',?)").run(kind,'proof:'+kind,s.hash);
 const r=await f.api(path);assert.equal(r.steps.find(x=>x.kind==='payment').can_send,true);
 const p=await f.api(path+'/preview','POST',{kind:'payment'});assert.match(p.items[0].message,/150,000/);await f.api(path+'/send','POST',{preview_id:p.preview_id,confirm_send:true});
 const row=f.db.prepare("SELECT * FROM deposit_notifications WHERE mode='live'").get();assert.equal(row.kind,'payment');assert.equal(row.status,'queued');assert.equal(JSON.parse(row.payload).delivery_phone,'01012345678');
 assert.equal((await f.api(path)).steps.find(x=>x.kind==='payment').can_send,false);
});
