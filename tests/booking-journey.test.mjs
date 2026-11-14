import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,DAY} from './helpers/admin-fixture.mjs';
import {bookingJourneyTick,journeyContext} from '../functions/api/_booking_journey.js';
import {transactionNoticeTick} from '../functions/api/_transaction_notifications.js';
import {automaticGuide} from '../functions/api/_guide_messages.js';
import {JOURNEY_TEMPLATES} from '../functions/api/_booking_journey_templates.js';
import {dayAt,shiftDay} from '../functions/api/_booking_payment_schedule.js';
import {onRequest as portal} from '../functions/api/booking-portal/[[path]].js';
function setup(t,{existing=false}={}){
 const f=fixture({booking:existing});t.after(()=>f.db.close());
 Object.assign(f.env,{DEPOSIT_ACCOUNT_KEY:'ab'.repeat(32),ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'journey-regression-secret-at-least-32',ALIGO_SENDER_KEY:'fixture-profile',ALIGO_SENDER:'0212345678',ALIGO_LIVE_ENABLED:'true'});
 f.db.prepare("INSERT INTO settings VALUES('booking_journey','{\"enabled\":true}',datetime('now'))").run();
 const sends=[];let pending=false,onTemplate=null;
 t.mock.method(Date,'now',()=>Date.parse(dayAt(new Date().getTime())+'T12:00:00+09:00'));
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  assert.equal(url,f.env.ALIGO_RELAY_URL);const req=JSON.parse(init.body),d=req.data;
  if(req.path==='transaction/status')return Response.json({ready:true});
  if(req.path==='template/list'){if(onTemplate)onTemplate();const t=Object.values(JOURNEY_TEMPLATES).flatMap(t=>[t,t.fallback].filter(Boolean)).find(t=>t.code===d.tpl_code);assert.ok(t);return Response.json({code:0,list:[{templtCode:t.code,senderKey:f.env.ALIGO_SENDER_KEY,inspStatus:pending?'REQ':'APR',status:'R',templtContent:t.content,buttons:t.buttons}]});}
  if(req.path==='alimtalk/send'){sends.push(d);return Response.json({code:0,info:{mid:String(sends.length),scnt:1,fcnt:0}});}
  throw Error('Unexpected '+req.path);
 });
 const create=(date=DAY)=>f.db.prepare("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,start_h,end_h,status,amount,created_at) VALUES('BK-NEW','megaspot-gundae','MS-TEST','테스트 고객','01012345678','5678',?,10,17,'confirmed',500000,datetime('now'))").run(date);
 const receipt=(code,amount,id)=>f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES(?,?,'receipt',?,'',datetime('now'))").run(code,id,amount);
 const resetLease=()=>f.db.exec("UPDATE booking_guide_lease SET until_at=0");
 const tick=async()=>{resetLease();await bookingJourneyTick(f.env);};
 const row=(kind='booking_confirmed')=>f.db.prepare('SELECT * FROM transaction_notifications WHERE kind=? ORDER BY id DESC LIMIT 1').get(kind);
 return {...f,create,receipt,tick,row,sends,pending:value=>pending=value,onTemplate:value=>onTemplate=value};
}
test('예약금만 받은 확정은 통합 링크를 1회 발송하며 기존 시설 자동 안내는 보내지 않는다',async t=>{
 const f=setup(t);f.create();f.receipt('BK-NEW',100000,'first');await f.tick();
 await automaticGuide(f.env,'BK-NEW');await Promise.all([transactionNoticeTick(f.env),transactionNoticeTick(f.env)]);
 assert.equal(f.sends.length,1);const d=f.sends[0];assert.equal(d.tpl_code,JOURNEY_TEMPLATES.booking_confirmed.code);assert.equal(d.failover,'Y');assert.match(d.message_1,/예약이 확정/);
 const button=JSON.parse(d.button_1).button[0];assert.match(button.linkMo,/\/booking\/#booking=[\w-]{43}$/);assert.ok(d.fmessage_1.includes(button.linkMo));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_messages').get().n,0);
 const token=button.linkMo.split('#booking=')[1];const response=await portal({env:f.env,params:{path:['view']},request:new Request('https://local.test/api/booking-portal/view',{headers:{Authorization:'Bearer '+token}})});const view=await response.json();assert.ok(view.confirmation?.issued_at);assert.equal(view.payment.total,500000);assert.equal(view.payment.paid,100000);assert.equal(view.payment.balance,400000);assert.equal(view.deposit.paid,false);assert.equal(view.deposit.amount,150000);
 const records=JSON.stringify(f.db.prepare('SELECT * FROM transaction_notifications').all());assert.ok(!records.includes(token));
});
test('설치 전 예약에는 확정·전액 납부를 소급 발송하지 않는다',async t=>{
 const f=setup(t,{existing:true});f.receipt('BK-TEST',500000,'old-full');f.db.exec("DELETE FROM booking_journey_state WHERE booking_code='BK-TEST'");f.db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));await f.tick();assert.equal(f.row(),undefined);assert.equal(f.row('rental_paid'),undefined);
});
test('잔금 완납만 1회 기록하고 보증금 미납 상태는 별도로 유지한다',async t=>{
 const f=setup(t);f.create();f.receipt('BK-NEW',100000,'deposit');await f.tick();await transactionNoticeTick(f.env);
 f.db.exec("UPDATE transaction_notifications SET status='delivered'");f.receipt('BK-NEW',400000,'balance');await f.tick();await f.tick();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='rental_paid'").get().n,1);
 await transactionNoticeTick(f.env);assert.equal(f.sends[1].tpl_code,'UN_6620');assert.match(f.sends[1].message_1,/500,000원/);assert.match(f.sends[1].message_1,/보증금 입금 확인은 이용료와 별도/);
});
test('처음부터 전액 납부한 확정에 확정·완납 알림을 중복하지 않는다',async t=>{
 const f=setup(t);f.create();f.receipt('BK-NEW',500000,'full');await f.tick();assert.ok(f.row());assert.equal(f.row('rental_paid'),undefined);
});
test('잔금 기한을 수정하고 납부·기한 변경 시 과거 안내를 취소한다',async t=>{
 const f=setup(t);f.create();f.receipt('BK-NEW',100000,'part');
 const initial=await f.api('bookings/BK-NEW/payment-schedule');assert.equal(initial.due_date,shiftDay(DAY,-3));
 const due=shiftDay(dayAt(Date.now()),1);let saved=await f.api('bookings/BK-NEW/payment-schedule','PUT',{due_date:due,version:0});assert.equal(saved.version,1);
 f.db.exec("UPDATE booking_journey_state SET confirmed_at='2020-01-01' WHERE booking_code='BK-NEW'");await f.tick();assert.ok(f.row('balance_reminder'));
 await f.api('bookings/BK-NEW/payment-schedule','PUT',{due_date:DAY,version:0},409);
 await f.api('bookings/BK-NEW/payment-schedule','PUT',{due_date:'2026-02-30',version:1},400);
 saved=await f.api('bookings/BK-NEW/payment-schedule','PUT',{due_date:DAY,version:1});assert.equal(saved.version,2);
 assert.match((await journeyContext(f.env,f.row('balance_reminder'))).cancel,/기한/);
});
test('방문 전날에만 안내를 만들고 날짜 변경·취소 후 발송을 중지한다',async t=>{
 const f=setup(t);const tomorrow=shiftDay(dayAt(Date.now()),1);f.create(tomorrow);f.db.exec("UPDATE booking_journey_state SET confirmed_at='2020-01-01' WHERE booking_code='BK-NEW'");await f.tick();await f.tick();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_arrival'").get().n,1);
 f.db.prepare("UPDATE bookings SET date=? WHERE booking_code='BK-NEW'").run(DAY);assert.ok((await journeyContext(f.env,f.row('booking_arrival'))).cancel);
 f.db.exec("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-NEW'");assert.ok((await journeyContext(f.env,f.row())).cancel);
});
test('미승인 템플릿은 문자로 우회하지 않고 발송 대기로 남긴다',async t=>{
 const f=setup(t);f.create();f.pending(true);await transactionNoticeTick(f.env);assert.equal(f.sends.length,0);assert.equal(f.row().status,'queued');assert.match(f.row().error,/승인/);
 f.pending(false);await transactionNoticeTick(f.env);assert.equal(f.sends.length,1);
});
test('금액 비공개는 수납 변경으로 확정서가 무효화돼도 유지된다',async t=>{
 const f=setup(t);f.create();f.db.exec("UPDATE bookings SET confirm_doc='{\"show_amount\":false}' WHERE booking_code='BK-NEW'");f.db.exec("UPDATE bookings SET confirm_doc=NULL WHERE booking_code='BK-NEW'");
 const issued=await f.api('bookings/BK-NEW/portal-link','POST',{});const token=issued.url.split('#booking=')[1];f.receipt('BK-NEW',100000,'hidden');const r=await portal({env:f.env,params:{path:['view']},request:new Request('https://local.test/api/booking-portal/view',{headers:{Authorization:'Bearer '+token}})});const j=await r.json();assert.equal(j.payment.amount_visible,false);assert.equal(j.payment.balance,null);assert.equal(j.deposit.amount,null);assert.ok(!JSON.stringify(j).includes('500000'));
});
test('연락처 2도 같은 통합 링크로 개별 안내하고 변경된 번호에는 발송하지 않는다',async t=>{
 const f=setup(t);f.create();await f.api('bookings/BK-NEW/contacts','PUT',{phone:'01012345678',phone2:'01087654321'});await f.tick();await transactionNoticeTick(f.env);await transactionNoticeTick(f.env);assert.deepEqual(f.sends.map(d=>d.receiver_1).sort(),['01012345678','01087654321'],JSON.stringify(f.db.prepare('SELECT status,error,receiver FROM transaction_notifications').all()));assert.equal(f.sends[0].button_1,f.sends[1].button_1);await f.api('bookings/BK-NEW/contacts','PUT',{phone:'01012345678',phone2:''});const old=f.db.prepare("SELECT * FROM transaction_notifications WHERE booking_code='BK-NEW' AND receiver='01087654321'").get();assert.ok((await journeyContext(f.env,old)).cancel);
});

test('확정 안내가 도착한 뒤 첫 전액 입금이 반영돼도 별도 완납 안내를 보내지 않는다',async t=>{
 const f=setup(t);f.create();await f.tick();await transactionNoticeTick(f.env);f.db.exec("UPDATE transaction_notifications SET status='delivered'");
 f.receipt('BK-NEW',500000,'delayed-upfront-full');await f.tick();assert.equal(f.row('rental_paid'),undefined);assert.equal(f.row('balance_reminder'),undefined);
});

test('운영자 실제 발송 시험은 별도 전용 링크와 이력만 만들며 예약·수납·일정에 영향을 주지 않는다',async t=>{
 const f=setup(t);f.db.prepare("INSERT INTO settings VALUES('parking_admin_alerts',?,datetime('now'))").run(JSON.stringify({phones:['01012345678']}));
 const {bookingJourneyTrial}=await import('../functions/api/_booking_journey_trial.js');
 const before=['bookings','orders','booking_payment_entries','calendar_blocks'].map(table=>f.db.prepare('SELECT COUNT(*) n FROM '+table).get().n);
 const d={action:'send_booking_deposit_test',test_id:crypto.randomUUID(),receiver:'01012345678',confirm_test:true};
 const r=await bookingJourneyTrial(f.env,d),j=await r.json();assert.equal(r.status,200);assert.equal(j.status,'accepted');assert.equal(f.sends.length,1);assert.equal(f.sends[0].failover,'Y');assert.ok(f.sends[0].fmessage_1.includes(j.url));
 const repeat=await (await bookingJourneyTrial(f.env,d)).json();assert.equal(repeat.duplicate,true);assert.equal(repeat.url,j.url);assert.equal(f.sends.length,1);
 const response=await portal({env:f.env,params:{path:['view']},request:new Request('https://local.test/api/booking-portal/view',{headers:{Authorization:'Bearer '+j.url.split('#booking=')[1]}})});const view=await response.json();assert.equal(view.booking.test,true);assert.ok(view.confirmation.issued_at);assert.equal(view.confirmation.pay_status,'deposit');assert.equal(view.payment.balance,400000);assert.equal(view.deposit.amount,150000);assert.equal(view.deposit.account.available,false);
 assert.deepEqual(['bookings','orders','booking_payment_entries','calendar_blocks'].map(table=>f.db.prepare('SELECT COUNT(*) n FROM '+table).get().n),before);
 assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM booking_journey_trials').all()).includes(j.url.split('#booking=')[1]));
 const denied=await bookingJourneyTrial(f.env,{...d,test_id:crypto.randomUUID(),receiver:'01099998888'});assert.equal(denied.status,403);assert.equal(f.sends.length,1);
 f.db.exec('UPDATE booking_journey_trials SET expires_at=0');assert.equal((await portal({env:f.env,params:{path:['view']},request:new Request('https://local.test/api/booking-portal/view',{headers:{Authorization:'Bearer '+j.url.split('#booking=')[1]}})})).status,403);
});

test('확정 안내의 두 버튼은 전용 예약 링크와 식음료 링크를 구분하고 대체 문자에도 둘 다 남긴다',async t=>{
 const f=setup(t);f.create();f.receipt('BK-NEW',100000,'partial-buttons');await f.tick();await transactionNoticeTick(f.env);
 const payload=f.sends[0],buttons=JSON.parse(payload.button_1).button;
 assert.deepEqual(buttons.map(b=>b.name),['예약 안내 확인','뷔페·케이터링·칵테일 안내']);assert.match(buttons[0].linkMo,/\/booking\/#booking=/);assert.equal(buttons[1].linkMo,'https://megaspot.kr/catering/#food-compare');assert.ok(payload.fmessage_1.includes(buttons[0].linkMo));assert.ok(payload.fmessage_1.includes(buttons[1].linkMo));
});
test('입실 전 안내는 입실·이용 안내와 주차권 구매만 보내고 식음료·전용 예약 버튼을 섞지 않는다',async t=>{
 const f=setup(t);f.create(shiftDay(dayAt(Date.now()),1));f.db.exec("UPDATE booking_journey_state SET confirmed_at='2020-01-01' WHERE booking_code='BK-NEW'");await f.tick();await transactionNoticeTick(f.env);await transactionNoticeTick(f.env);
 const payload=f.sends.find(d=>d.tpl_code===JOURNEY_TEMPLATES.booking_arrival.code),buttons=JSON.parse(payload.button_1).button;
 assert.deepEqual(buttons.map(b=>b.name),['입실 및 이용 안내','주차권 구매']);assert.equal(buttons[0].linkMo,'https://megaspot.kr/arrival/space1/');assert.equal(buttons[1].linkMo,'https://megaspot.kr/parking/purchase/');assert.ok(!payload.fmessage_1.includes('/catering/'));assert.ok(payload.fmessage_1.includes('/parking/purchase/'));assert.ok(!/#\{/.test(payload.message_1));
});
test('승인된 새 확정 템플릿은 승인 캐시를 사용하고 예전 한 버튼 템플릿으로 되돌아가지 않는다',async t=>{
 const f=setup(t);const {approvedCustomerTemplate}=await import('../functions/api/_customer_alimtalk.js');const expected=JOURNEY_TEMPLATES.booking_confirmed;assert.equal(expected.fallback,undefined);
 let approved=false;const provider=async(path,data)=>{assert.equal(path,'template/list');assert.equal(data.tpl_code,expected.code);return {code:0,list:[{templtCode:expected.code,senderKey:f.env.ALIGO_SENDER_KEY,inspStatus:approved?'APR':'REQ',status:'R',templtContent:expected.content,buttons:expected.buttons}]};};
 assert.equal(await approvedCustomerTemplate(f.env,provider,'booking_confirmed'),null);approved=true;assert.equal((await approvedCustomerTemplate(f.env,provider,'booking_confirmed')).code,expected.code);assert.equal((await approvedCustomerTemplate(f.env,async()=>{throw Error('temporary outage');},'booking_confirmed')).code,expected.code);
});

test('전날·당일 임박 예약은 확정 통합 안내만 보내고 입실 안내를 같은 시점에 추가하지 않는다',async t=>{
 const f=setup(t);f.create(shiftDay(dayAt(Date.now()),1));await f.tick();await transactionNoticeTick(f.env);assert.equal(f.sends.length,1);assert.equal(f.sends[0].tpl_code,'UN_6623');assert.equal(f.row('booking_arrival'),undefined);
});
test('2호 입실 안내는 같은 승인 템플릿의 지점별 변수로 2호 안내와 공통 주차권을 보낸다',async t=>{
 const f=setup(t);f.create(shiftDay(dayAt(Date.now()),1));f.db.exec("UPDATE bookings SET space_id='megaspot-gundae-2' WHERE booking_code='BK-NEW'; UPDATE booking_journey_state SET confirmed_at='2020-01-01' WHERE booking_code='BK-NEW'");await f.tick();await transactionNoticeTick(f.env);await transactionNoticeTick(f.env);
 const d=f.sends.find(d=>d.tpl_code==='UN_7028');assert.ok(d);const buttons=JSON.parse(d.button_1).button;assert.equal(buttons.length,2);assert.equal(buttons[0].linkMo,'https://megaspot.kr/arrival/space2/');assert.equal(buttons[1].linkMo,'https://megaspot.kr/parking/purchase/');assert.ok(!d.fmessage_1.includes('megaspot-guide.pages.dev'));assert.match(d.message_1,/건대 2호/);
});

test('시간 구간만 저장된 예전 예약도 기존 주간 시간으로 안내하고 모르는 구간은 확인 대기로 남긴다',async t=>{
 const f=setup(t);f.create();f.db.exec("UPDATE bookings SET start_h=NULL,end_h=NULL,slot='pkg-day' WHERE booking_code='BK-NEW'");await f.tick();await transactionNoticeTick(f.env);assert.equal(f.sends.length,1);assert.match(f.sends[0].message_1,/10:00~17:00/);
});
test('알림톡 승인 조회 중 예약 날짜가 바뀌면 예전 날짜를 보내지 않고 다음 처리에 최신 날짜를 보낸다',async t=>{
 const f=setup(t);f.create();const changed=shiftDay(DAY,1);let changedOnce=false;f.onTemplate(()=>{if(!changedOnce){changedOnce=true;f.db.prepare("UPDATE bookings SET date=?,confirm_doc=NULL WHERE booking_code='BK-NEW'").run(changed);}});await f.tick();await transactionNoticeTick(f.env);assert.equal(f.sends.length,0);await transactionNoticeTick(f.env);assert.equal(f.sends.length,1);assert.ok(f.sends[0].message_1.includes(changed.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1년 $2월 $3일')));
});
