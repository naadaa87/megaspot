import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {notificationOperations,notificationAudit} from '../functions/api/_notification_operations.js';
import {CUSTOMER_ALIMTALK as T} from '../functions/api/_customer_alimtalk_templates.js';
import {bookingJourneyTick} from '../functions/api/_booking_journey.js';
import {transactionNoticeTick} from '../functions/api/_transaction_notifications.js';
import {dayAt,shiftDay} from '../functions/api/_booking_payment_schedule.js';
import {onRequest as cron} from '../functions/api/deposit-notifications/[[path]].js';
function setup(t){
 const f=fixture({booking:true});t.after(()=>f.db.close());const today=dayAt(Date.now());t.mock.method(Date,'now',()=>Date.parse(today+'T12:00:00+09:00'));
 Object.assign(f.env,{ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'notification-audit-secret-minimum-32-characters',ALIGO_SENDER_KEY:'audit-profile',ALIGO_SENDER:'0212345678',ALIGO_LIVE_ENABLED:'true',DEPOSIT_ACCOUNT_KEY:'ab'.repeat(32)});
 f.db.prepare("INSERT INTO settings VALUES('booking_journey','{\"enabled\":true}',datetime('now'))").run();
 f.db.prepare("INSERT INTO settings VALUES('parking_admin_alerts',?,datetime('now'))").run(JSON.stringify({phones:['01011112222']}));
 f.db.prepare("INSERT INTO settings VALUES('reservation_guide',?,datetime('now'))").run(JSON.stringify({variant:'legacy',enabled:true,automatic:false,template_code:'UN_3115',spaces:['megaspot-gundae']}));
 const sent=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,f.env.ALIGO_RELAY_URL);const {path,data:d}=JSON.parse(init.body);
  if(path==='transaction/status')return Response.json({ready:true});
  if(path==='template/list'){const template=Object.values(T).find(t=>t.code===d.tpl_code);assert.ok(template,'supported approved template '+d.tpl_code);return Response.json({code:0,list:[{templtCode:template.code,senderKey:f.env.ALIGO_SENDER_KEY,inspStatus:'APR',status:'A',templtContent:template.content,buttons:template.buttons}]});}
  if(path==='alimtalk/send'){sent.push(d);return Response.json({code:0,info:{mid:String(sent.length),scnt:1,fcnt:0}});}
  if(path==='history/detail'){const item=sent[Number(d.mid)-1];return Response.json({code:0,list:[{type:'AT',phone:item.receiver_1,tpl_code:item.tpl_code,senderKey:f.env.ALIGO_SENDER_KEY,msgid:'fixture',rsltdate:new Date().toISOString().slice(0,19).replace('T',' '),rslt:'0'}]});}
  throw Error('unexpected '+path);
 });
 const op=async body=>{const r=await notificationOperations(f.env,body);return {status:r.status,...await r.json()};};
 const activate=async()=>{const r=await op({action:'test_current_arrival',phone:'01011112222',confirm_test:true,test_id:crypto.randomUUID()});assert.equal(r.status,200);const checked=await op({action:'check_current_arrival',message_id:r.id});assert.equal(checked.status,'delivered');const activated=await op({action:'activate_approved_notifications'});assert.equal(activated.status,200);return activated;};
 const priorDayBooking=()=>{f.db.prepare("UPDATE bookings SET date=? WHERE booking_code='BK-TEST'").run(shiftDay(today,1));f.db.prepare("UPDATE booking_journey_state SET confirmed_at=? WHERE booking_code='BK-TEST'").run(shiftDay(today,-1)+' 12:00:00');f.db.exec("UPDATE booking_guide_state SET needs_review=0");};
 const plan=async()=>{f.db.exec('DELETE FROM booking_guide_lease');await bookingJourneyTick(f.env);};
 const manual=async()=>{const p=await f.api('guide-messages/preview','POST',{codes:['BK-TEST']});assert.equal(p.excluded.length,0);return f.api('guide-messages/send','POST',{preview_id:p.preview_id,confirm_send:true});};
 return {...f,op,activate,priorDayBooking,plan,manual,sent,today};
}
test('운영 전환은 승인된 공통 템플릿을 연결하고 수동 안내도 두 버튼으로 바꾸며 이전 자동·세 버튼 경로를 재활성화하지 못한다',async t=>{
 const f=setup(t),r=await f.activate();assert.equal(r.connected.length,Object.keys(T).length);assert.equal(r.manual_guide.code,'UN_7028');assert.equal(r.manual_guide.automatic,false);assert.equal(r.manual_guide.test_delivered,true);
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].receiver_1,'01011112222');assert.deepEqual(JSON.parse(f.sent[0].button_1).button.map(b=>b.name),['입실 및 이용 안내','주차권 구매']);assert.ok(!/#\{/.test(f.sent[0].message_1));
 await f.api('guide-messages/settings','PUT',{variant:'legacy',enabled:true,automatic:true,template_code:'UN_3115',spaces:['megaspot-gundae']},409);
 const audit=await notificationAudit(f.env);assert.equal(audit.legacy_queued,0);assert.ok(!JSON.stringify(audit).includes('01011112222'));
});
test('운영자 시험은 등록 번호로만 허용하고 같은 요청은 실제 발송을 반복하지 않는다',async t=>{
 const f=setup(t),test_id=crypto.randomUUID(),body={action:'test_current_arrival',phone:'01011112222',confirm_test:true,test_id};
 const r=await f.op(body);assert.equal(r.status,200);const duplicate=await f.op(body);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.id,r.id);assert.equal(f.sent.length,1);
 const denied=await f.op({...body,test_id:crypto.randomUUID(),phone:'01099998888'});assert.equal(denied.status,403);assert.equal(f.sent.length,1);
});
test('서명 없는 운영 연결 요청은 설정·발송을 변경하지 않는다',async t=>{
 const f=setup(t);const response=await cron({env:f.env,params:{path:['journey-operations']},request:new Request('https://local.test/api/deposit-notifications/journey-operations',{method:'POST',body:JSON.stringify({time:Date.now(),action:'activate_approved_notifications'})})});assert.equal(response.status,403);assert.equal(f.sent.length,0);assert.equal((await notificationAudit(f.env)).manual_guide.code,'UN_3115');
});
test('자동 입실 안내가 먼저 접수되면 같은 예약의 수동 입실 안내를 중복 발송하지 않는다',async t=>{
 const f=setup(t);await f.activate();f.priorDayBooking();await f.plan();await transactionNoticeTick(f.env);assert.equal(f.sent.length,2);assert.equal(f.sent[1].tpl_code,'UN_7028');await f.manual();assert.equal(f.sent.length,2);assert.equal(f.db.prepare("SELECT status FROM booking_guide_messages WHERE mode='live'").get().status,'cancelled');
});
test('수동 입실 안내가 먼저 접수되면 자동 입실 안내를 수신자별로 생략한다',async t=>{
 const f=setup(t);await f.activate();f.priorDayBooking();await f.manual();assert.equal(f.sent.length,2);await f.plan();await transactionNoticeTick(f.env);assert.equal(f.sent.length,2);assert.equal(f.db.prepare("SELECT status FROM transaction_notifications WHERE kind='booking_arrival'").get().status,'cancelled');
});
test('운영 전환 전 접수된 안내의 결과도 보존된 당시 설정으로 조회하며 재발송하지 않는다',async t=>{
 const f=setup(t);await f.activate();f.priorDayBooking();await f.manual();const old=f.db.prepare("SELECT * FROM booking_guide_messages WHERE mode='live'").get();
 // A metadata-compatible configuration change archives the actual connection fingerprint.
 await f.api('guide-messages/settings','PUT',{variant:'legacy',enabled:false,automatic:false,template_code:'UN_3115',spaces:['megaspot-gundae']});
 await f.api('guide-messages/'+old.id+'/refresh','POST',{});assert.equal(f.db.prepare('SELECT status FROM booking_guide_messages WHERE id=?').get(old.id).status,'delivered');assert.equal(f.sent.length,2);
});
test('자동 입실 안내 접수 후 이용 시간이 바뀌면 최신 조건으로 수동 재안내할 수 있다',async t=>{
 const f=setup(t);await f.activate();f.priorDayBooking();await f.plan();await transactionNoticeTick(f.env);assert.equal(f.sent.length,2);f.db.prepare("UPDATE bookings SET end_h=18 WHERE booking_code='BK-TEST'").run();await f.manual();assert.equal(f.sent.length,3);assert.match(f.sent.at(-1).message_1,/18:00/);
});
test('자동 입실 안내 결과도 예약 관리의 안내 현황에 반영된다',async t=>{
 const f=setup(t);await f.activate();f.priorDayBooking();await f.plan();await transactionNoticeTick(f.env);const b=(await f.api('bookings')).items.find(b=>b.booking_code==='BK-TEST');assert.equal(b.guide_status,'accepted');
});

test('기존 예약 통합 안내는 정확한 예약·수신자만 허용하며 재요청도 한 건만 대기시킨다',async t=>{
 const f=setup(t);f.db.exec("DELETE FROM transaction_notifications");
 f.db.prepare("UPDATE bookings SET space_id='megaspot-gundae-2',date=?,phone='01012342304',status='confirmed' WHERE booking_code='BK-TEST'").run(shiftDay(f.today,20));
 f.db.exec("DELETE FROM transaction_notifications");
 const d={action:'queue_existing_confirmation',booking_code:'BK-TEST',space_id:'megaspot-gundae-2',date:shiftDay(f.today,20),phone:'01012342304',confirm_send:true};
 assert.equal((await f.op({...d,phone:'01099999999'})).status,409);
 const a=await f.op(d);assert.equal(a.items.length,1);assert.equal(a.items[0].status,'queued');
 const b=await f.op(d);assert.equal(b.items.length,1);assert.equal(b.items[0].id,a.items[0].id);assert.equal(f.sent.length,0);
});

test('실제 전송 함수는 개인화된 확정 알림 본문·버튼과 대체 문자 내용을 암호화해 저장한다',async t=>{
 const f=setup(t);f.priorDayBooking();f.db.exec("INSERT INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at) VALUES('journey-confirm:BK-TEST:1','booking_confirmed','customer','BK-TEST','BK-TEST','01012345678',datetime('now'))");
 await transactionNoticeTick(f.env);assert.equal(f.sent.length,1);const row=f.db.prepare("SELECT id,status FROM transaction_notifications WHERE kind='booking_confirmed'").get();assert.equal(row.status,'accepted');
 const {readNotificationContent}=await import('../functions/api/_notification_content.js');const content=await readNotificationContent(f.env,'transaction',row.id);assert.equal(content.message,f.sent[0].message_1);assert.deepEqual(content.buttons,JSON.parse(f.sent[0].button_1).button);assert.equal(content.fallback_message,f.sent[0].fmessage_1);
 const cipher=f.db.prepare("SELECT value FROM settings WHERE key=?").get('notification_content:transaction:'+row.id).value;assert.ok(!cipher.includes('booking='));
});
