import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/admin-fixture.mjs';
import {transactionNoticeTick} from '../functions/api/_transaction_notifications.js';
import {feedbackCustomer} from '../functions/api/_feedback.js';
import {FEEDBACK_TEMPLATE as T} from '../functions/api/_feedback_template.js';
import {relayLedger,relayRequest} from '../deploy/aligo-relay/server.mjs';
import {readNotificationContent} from '../functions/api/_notification_content.js';
function setup(t,{hour=12}={}){
 const f=fixture({booking:true,date:'2026-10-01'});t.after(()=>f.db.close());f.env.DEPOSIT_ACCOUNT_KEY='ab'.repeat(32);
 const today=new Date(Date.now()+9*36e5).toISOString().slice(0,10);let clock=Date.parse(today+'T'+String(hour).padStart(2,'0')+':00:00+09:00');t.mock.method(Date,'now',()=>clock);
 Object.assign(f.env,{ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'feedback-test-relay-secret-at-least32',ALIGO_LIVE_ENABLED:'true',ALIGO_SENDER_KEY:'test-profile'});
 const relayEnv={ALIGO_RELAY_SECRET:f.env.ALIGO_RELAY_SECRET,ALIGO_USERID:'test-user',ALIGO_API_KEY:'test-key',ALIGO_SENDER_KEY:f.env.ALIGO_SENDER_KEY,ALIGO_SENDER:'01011112222',ALIGO_TEMPLATE_CODES:'UN_8697'};
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const ledger=relayLedger(db);const calls=[];let fail=false,inspection='APR',mismatch=false,result='0',race=null;
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,f.env.ALIGO_RELAY_URL);return relayRequest(new Request('http://relay.local/v1/aligo',init),relayEnv,ledger,async(providerUrl,opts)=>{
  const v=new URLSearchParams(opts.body);
  if(providerUrl.endsWith('/template/list/')){if(race){const cb=race;race=null;cb();}return Response.json({code:0,list:[{templtCode:T.code,senderKey:f.env.ALIGO_SENDER_KEY,inspStatus:inspection,status:'R',templtContent:mismatch?'Changed content':T.content,buttons:T.buttons}]});}
  if(providerUrl.endsWith('/alimtalk/send/')){calls.push(Object.fromEntries(v));if(fail)throw Error('Timeout');return Response.json({code:0,info:{mid:'123456',scnt:1,fcnt:0}});}
  assert.ok(providerUrl.endsWith('/history/detail/'));return Response.json({code:0,list:[{type:'AT',tpl_code:T.code,senderKey:f.env.ALIGO_SENDER_KEY,phone:'01012345678',rsltdate:'2026-11-18 12:00:00',rslt:result,msgid:'123456'}]});
 });});
 return {...f,calls,complete:()=>f.api('bookings/BK-TEST','PATCH',{status:'completed'}),tick:()=>transactionNoticeTick(f.env),clock:h=>clock=Date.parse(today+'T'+String(h).padStart(2,'0')+':00:00+09:00'),failure:()=>fail=true,approval:s=>inspection=s,mismatch:()=>mismatch=true,delivery:s=>result=s,race:cb=>race=cb};
}
test('새 이용완료는 대표 연락처에 한 건만 큐 생성·스키마 재적용과 재클릭·재완료는 소급/중복 없음',async t=>{
 const f=setup(t);await f.complete();await f.complete();f.db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_feedback'").get().n,1);
 f.db.exec("UPDATE bookings SET status='confirmed';UPDATE bookings SET phone='01099998888';UPDATE bookings SET status='completed'");assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_feedback'").get().n,1);
 f.db.exec("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,created_at) VALUES('HISTORIC','megaspot-gundae','과거 완료','01011112222','2222','2026-10-01','completed',datetime('now'))");assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_feedback'").get().n,1);
});
test('승인 원문·버튼 검증 후 실제 예약별 설문 링크를 알림톡으로 보내며 동시 tick도 한 번만 전송',async t=>{
 const f=setup(t);f.db.exec("INSERT INTO booking_contacts VALUES('BK-TEST','01099998888',datetime('now'))");await f.complete();await Promise.all([f.tick(),f.tick()]);assert.equal(f.calls.length,1);
 const v=f.calls[0];assert.equal(v.tpl_code,'UN_8697');assert.equal(v.receiver_1,'01012345678');assert.equal(v.failover,'N');assert.equal(v.fmessage_1,undefined);assert.ok(!v.message_1.includes('#{'));assert.match(v.message_1,/건대 1호/);
 const buttons=JSON.parse(v.button_1).button;assert.equal(buttons.length,1);assert.equal(buttons[0].name,'이용 의견 남기기');assert.equal(buttons[0].linkMo,buttons[0].linkPc);assert.match(buttons[0].linkMo,/^https:\/\/megaspot.kr\/feedback\/#feedback=[A-Za-z0-9_-]{43}$/);
 const token=buttons[0].linkMo.split('=')[1];const view=await feedbackCustomer({env:f.env,request:new Request('https://megaspot.kr/api/feedback',{headers:{authorization:'Bearer '+token}})});assert.equal(view.status,200);assert.equal((await view.json()).submitted,false);
 const row=f.db.prepare("SELECT * FROM transaction_notifications WHERE kind='booking_feedback'").get();assert.equal(row.status,'accepted');assert.equal(row.provider_mid,'at:UN_8697:123456');assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM settings').all()).includes(token));const content=await readNotificationContent(f.env,'transaction',row.id);assert.equal(content.message,v.message_1);
 f.db.exec("UPDATE transaction_notifications SET updated_at=datetime('now','-1 minute')");await f.tick();assert.equal(f.db.prepare('SELECT status FROM transaction_notifications').get().status,'delivered');assert.equal(f.calls.length,1);
 const detail=await f.api('feedback/BK-TEST');assert.equal(detail.notice.status,'delivered');
});
test('야간은 대기 후 오전에 전송하며 실패·응답불명은 자동 재발송과 문자 대체 없음',async t=>{
 const f=setup(t,{hour:23});await f.complete();await f.tick();assert.equal(f.calls.length,0);f.clock(9);f.failure();await f.tick();assert.equal(f.calls.length,1);assert.equal(f.db.prepare('SELECT status FROM transaction_notifications').get().status,'unknown');await f.tick();await f.complete();await f.tick();assert.equal(f.calls.length,1);
});
test('예약 취소·예약자 변경·설문 제출 후에는 큐에 있더라도 보내지 않는다',async t=>{
 const f=setup(t);await f.complete();f.db.exec("UPDATE bookings SET phone='01022223333'");await f.tick();assert.equal(f.calls.length,0);assert.equal(f.db.prepare("SELECT status FROM transaction_notifications WHERE kind='booking_feedback'").get().status,'cancelled');
});
test('검수 미승인·원문 불일치 때 발송 보류 및 승인 확인 중 예약 변경 시 원자적으로 발송 차단',async t=>{
 const f=setup(t);await f.complete();f.approval('REQ');await f.tick();assert.equal(f.calls.length,0);f.approval('APR');f.mismatch();await f.tick();assert.equal(f.calls.length,0);assert.equal(f.db.prepare('SELECT status FROM transaction_notifications').get().status,'queued');
});
test('승인 조회와 동시에 예약이 취소되면 링크/발송 claim에서 차단한다',async t=>{
 const f=setup(t);await f.complete();f.race(()=>f.db.exec("UPDATE bookings SET status='cancelled'"));await f.tick();assert.equal(f.calls.length,0);
});
test('설문 응답이 이미 접수되면 알림을 취소하며 조회/미리보기는 발송하지 않는다',async t=>{
 const f=setup(t);await f.complete();const preview=await f.api('feedback/BK-TEST/prepare','POST',{});const token=preview.url.split('=')[1];const response=await feedbackCustomer({env:f.env,request:new Request('https://megaspot.kr/api/feedback',{method:'POST',headers:{authorization:'Bearer '+token,origin:'https://megaspot.kr'},body:JSON.stringify({rating:5,categories:['없음'],body:'',contact_requested:false,agree:true,consent_version:'feedback-20261117'})})});assert.equal(response.status,200);await f.tick();assert.equal(f.calls.length,0);assert.equal(f.db.prepare('SELECT status FROM transaction_notifications').get().status,'cancelled');
});
test('문의 상세의 이용완료 변경도 동일 큐를 생성하고 다른 상태 변경은 생성하지 않는다',async t=>{
 const f=setup(t);await f.api('inquiries/MS-TEST','PATCH',{status:'이용 완료'});assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_feedback'").get().n,1);await f.api('inquiries/MS-TEST','PATCH',{status:'이용 완료'});assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_feedback'").get().n,1);
});
test('2호 예약은 기존 전용 링크를 재사용하며 별도 추가 연락처로 복제하지 않는다',async t=>{
 const f=setup(t);f.db.exec("UPDATE bookings SET space_id='megaspot-gundae-2'");await f.complete();const prepared=await f.api('feedback/BK-TEST/prepare','POST',{});await f.tick();assert.equal(f.calls.length,1);assert.match(f.calls[0].message_1,/건대 2호/);assert.equal(JSON.parse(f.calls[0].button_1).button[0].linkMo,prepared.url.replace('https://local.test','https://megaspot.kr'));
});
test('알림톡 배송 실패는 실패로 기록하며 대체 문자 조회나 자동 재발송 없이 종료한다',async t=>{
 const f=setup(t);await f.complete();await f.tick();f.delivery('32');f.db.exec("UPDATE transaction_notifications SET updated_at=datetime('now','-1 minute')");await f.tick();assert.equal(f.db.prepare('SELECT status FROM transaction_notifications').get().status,'failed');await f.complete();await f.tick();assert.equal(f.calls.length,1);
});
