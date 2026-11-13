import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {fixture as base} from './helpers/admin-fixture.mjs';import {onRequest as cron} from '../functions/api/deposit-notifications/[[path]].js';
import {DEPOSIT_TEMPLATES as T,DEPOSIT_TEMPLATE_CODES as C} from '../functions/api/_deposit_templates.js';
import {depositNoticeTick,depositMessageHash,depositMessageConfig,depositTemplateMatches,depositNoticeRender,depositNoticeVariables} from '../functions/api/_deposit_notifications.js';
import {parkingSign} from '../functions/api/_parking_notifications.js';import {now,kstToday} from '../functions/api/_lib.js';
function setup(t){
 t.mock.method(Date,'now',()=>Date.parse('2026-11-03T12:00:00+09:00'));const f=base({booking:true});t.after(()=>f.db.close());
 Object.assign(f.env,{ALIGO_LIVE_ENABLED:'true',ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'test-deposit-relay-secret-more-than-32',ALIGO_SENDER_KEY:'test-profile',ALIGO_SENDER:'01012345678',DEPOSIT_ACCOUNT_KEY:'cd'.repeat(32)});
 let review='APR',broken=false,result='0',onSend=null;const sent=[];
 t.mock.method(globalThis,'fetch',async(url,opts)=>{assert.equal(url,f.env.ALIGO_RELAY_URL);const request=JSON.parse(opts.body),d=request.data;assert.equal(opts.headers['X-Megaspot-Signature'],await parkingSign(f.env.ALIGO_RELAY_SECRET,opts.body));
  if(request.path==='template/list'){const k=Object.keys(C).find(k=>C[k]===d.tpl_code);return Response.json({code:0,list:[{templtCode:C[k],inspStatus:review,status:'R',templtContent:T[k].content,buttons:T[k].buttons}]});}
  if(request.path==='alimtalk/send'){sent.push(d);if(onSend)await onSend(d);if(broken)throw Error('transport unknown');return Response.json({code:0,info:{mid:String(sent.length),scnt:1,fcnt:0}});}
  if(request.path==='history/detail'){const previous=sent[Number(d.mid)-1];return Response.json({code:0,list:[{type:'AT',phone:previous.receiver_1,tpl_code:previous.tpl_code,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:now(),rslt:result,msgid:'12345'}]});}assert.fail(request.path);
 });
 const api=(path='',method='GET',data,expected=200)=>f.api('deposit-notifications'+path,method,data,expected);
 const cfg={enabled:false,types:{payment:true,account:true,refunded:true},codes:C};
 const tick=async(send=true)=>{f.db.exec('DELETE FROM deposit_notification_lease');return depositNoticeTick(f.env,send);};
 async function tests(){await api('/settings','PUT',cfg);for(const kind of Object.keys(T)){f.db.exec("UPDATE deposit_notifications SET occurred_at=datetime('now','-2 minutes') WHERE mode='test'");await api('/test','POST',{phone:'01011112222',kind,confirm_test:true});await tick(false);}}
 async function enable(){await tests();await api('/settings','PUT',{...cfg,enabled:true});}
 function booking(code='BK-NEW',extra={}){const p={date:kstToday(20),name:'보증금 시험 고객',ref:null,...extra};f.db.prepare('INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,start_h,end_h,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(code,'megaspot-gundae',p.ref,p.name,'01099998888','8888',p.date,'confirmed',10,17,now());}
 return {...f,api,cfg,tick,tests,enable,booking,sent,setReview:x=>review=x,setBroken:()=>broken=true,setResult:x=>result=x,onSend:f=>onSend=f};
}
test('기본 OFF·관리자 인증·서명 없는 cron 차단·승인과 종류별 시험 수신 필수',async t=>{
 const f=setup(t);assert.equal((await f.api()).enabled,false);f.booking();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications").get().n,0);
 await f.api('/settings','PUT',{...f.cfg,enabled:true},409);const response=await cron({env:f.env,params:{path:['tick']},request:new Request('https://local.test/api/deposit-notifications/tick',{method:'POST',body:'{}'})});assert.equal(response.status,403);assert.equal(f.sent.length,0);
 f.setReview('REQ');await f.api('/settings','PUT',f.cfg);await f.api('/test','POST',{phone:'01011112222',kind:'payment',confirm_test:true},409);assert.equal(f.sent.length,0);
});
test('운영자 시험은 접수·실제 도착 구분, 새 설정의 세 종류 모두 확인해야 자동 활성화',async t=>{
 const f=setup(t);await f.tests();const c=await f.api();for(const k of Object.keys(T))assert.equal(c.tested[k],true);assert.equal(f.sent.length,3);assert.ok(f.sent.every(d=>d.receiver_1==='01011112222'&&d.failover==='N'));
 await f.api('/settings','PUT',{...f.cfg,enabled:true});f.env.ALIGO_SENDER='01000000000';await f.api('/settings','PUT',{...f.cfg,enabled:true},409);
});
test('활성화는 기존 예약을 소급 등록하지 않고 새 예약 확정에만 입금 안내를 만든다',async t=>{
 const f=setup(t);await f.enable();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE mode='live'").get().n,0);f.booking();await f.tick();const rows=f.db.prepare("SELECT * FROM deposit_notifications WHERE mode='live'").all();assert.equal(rows.length,1);assert.equal(rows[0].kind,'payment');assert.equal(rows[0].status,'accepted');assert.match(f.sent.at(-1).message_1,/150,000원/);assert.equal(f.sent.at(-1).failover,'Y');assert.match(f.sent.at(-1).fmessage_1,/150,000원/);assert.ok(!f.sent.at(-1).message_1.includes('#{'));
});
test('입금 확인 후에는 미발송 입금 안내를 취소하고 계좌 요청을 단 한 번 생성',async t=>{
 const f=setup(t);await f.enable();f.booking();f.db.prepare('INSERT INTO booking_deposit_checks VALUES(?,?,?)').run('BK-NEW',1,now());f.db.prepare('UPDATE booking_deposit_checks SET paid=1 WHERE booking_code=?').run('BK-NEW');await f.tick();const rows=f.db.prepare("SELECT kind,status FROM deposit_notifications WHERE mode='live' ORDER BY id").all();assert.deepEqual(rows.map(r=>[r.kind,r.status]),[['payment','cancelled'],['account','accepted']]);
 const d=f.sent.at(-1),link=JSON.parse(d.button_1).button[0].linkMo;assert.ok(d.fmessage_1.includes(link));assert.match(link,/^https:\/\/megaspot.kr\/deposit\/#refund-account=[A-Za-z0-9_-]{43}$/);const outbox=JSON.stringify(f.db.prepare('SELECT * FROM deposit_notifications').all());assert.ok(!outbox.includes(link.split('=')[1]));assert.ok(!outbox.includes('account_cipher'));
});
test('문의를 통한 입금 확인·직접 예약·이미 입금된 신규 예약을 모두 연결',async t=>{
 const f=setup(t);await f.enable();f.db.prepare('INSERT INTO inquiry_checks VALUES(?,?,?)').run('MS-TEST','{"guarantee_paid":true}',now());f.booking('BK-LINKED',{ref:'MS-TEST'});f.db.prepare("UPDATE inquiry_checks SET checks=json_set(checks,'$.guide_sent',true) WHERE ref='MS-TEST'").run();const rows=f.db.prepare("SELECT booking_code,kind FROM deposit_notifications WHERE mode='live'").all();assert.ok(rows.some(r=>r.booking_code==='BK-TEST'&&r.kind==='account'));assert.ok(rows.some(r=>r.booking_code==='BK-LINKED'&&r.kind==='account'));assert.equal(rows.filter(r=>r.booking_code==='BK-TEST').length,1);
});
test('고객이 이미 계좌를 등록했거나 예약자·연락처가 달라지면 요청을 취소',async t=>{
 const f=setup(t);await f.enable();f.booking();f.db.prepare('INSERT INTO booking_deposit_checks VALUES(?,?,?)').run('BK-NEW',1,now());f.db.prepare("INSERT INTO booking_refunds(booking_code,amount,account_cipher,created_at,updated_at) VALUES('BK-NEW',150000,'cipher',?,?)").run(now(),now());await f.tick();assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE mode='live' AND kind='account'").get().status,'cancelled');
 f.booking('BK-CHANGED');f.db.prepare("UPDATE bookings SET phone='01033334444' WHERE booking_code='BK-CHANGED'").run();await f.tick();assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE booking_code='BK-CHANGED'").get().status,'review');
});
test('환급 완료 전환과 outbox가 원자적이며 확정 금액·차감액을 사용',async t=>{
 const f=setup(t);await f.enable();f.db.prepare("INSERT INTO booking_refunds(booking_code,amount,created_at,updated_at) VALUES('BK-TEST',150000,?,?)").run(now(),now());f.db.exec('BEGIN');f.db.prepare("UPDATE booking_refunds SET state='completed',paid_amount=130000,deduction=20000,completion_id='done',completed_at=? WHERE booking_code='BK-TEST'").run(now());f.db.exec('ROLLBACK');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE mode='live'").get().n,0);
 f.db.prepare("UPDATE booking_refunds SET state='completed',paid_amount=130000,deduction=20000,completion_id='done',completed_at=? WHERE booking_code='BK-TEST'").run(now());await f.tick();assert.match(f.sent.at(-1).message_1,/최종 환급액: 130,000원/);assert.match(f.sent.at(-1).message_1,/차감액: 20,000원/);assert.ok(!f.sent.at(-1).message_1.includes('298-910064'));
});
test('통신 결과 불명은 자동 재발송하지 않고 상태·계좌 잠금을 보존',async t=>{
 const f=setup(t);await f.enable();f.booking();f.setBroken();await f.tick();await f.tick();assert.equal(f.sent.length,4);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE mode='live'").get().status,'unknown');assert.equal(f.db.prepare("SELECT status FROM bookings WHERE booking_code='BK-NEW'").get().status,'confirmed');
});
test('야간은 대기하고 다음 주간에 발송하며 중지 시 대기 건 취소',async t=>{
 const f=setup(t);await f.enable();f.booking();t.mock.method(Date,'now',()=>Date.parse('2026-11-03T23:00:00+09:00'));await f.tick();assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE mode='live'").get().status,'queued');assert.equal(f.sent.length,3);
 await f.api('/settings','PUT',f.cfg);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE mode='live'").get().status,'cancelled');
});
test('서명 상태 조회는 고객 데이터 없이 읽기만 하며 메시지를 발송하지 않음',async t=>{
 const f=setup(t);await f.enable();f.booking();const body=JSON.stringify({time:Date.now()});const response=await cron({env:f.env,params:{path:['status']},request:new Request('https://local.test/api/deposit-notifications/status',{method:'POST',headers:{'X-Megaspot-Signature':await parkingSign(f.env.ALIGO_RELAY_SECRET,body)},body})});assert.equal(response.status,200);const raw=await response.text();assert.ok(!raw.includes('01099998888'));assert.equal(f.sent.length,3);
});
test('생성기와 자동 스키마는 outbox·모든 상태 전환 트리거를 재적용 가능',async t=>{
 const {SCHEMA}=await import('../functions/api/_schema.js');const db=new DatabaseSync(':memory:');t.after(()=>db.close());for(const sql of SCHEMA)db.exec(sql);for(const sql of SCHEMA)db.exec(sql);assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'deposit_notice_%'").get().n,7);
});

test('동시에 여러 처리기가 실행되어도 한 번만 접수한다',async t=>{
 const f=setup(t);await f.enable();f.booking();f.db.exec('DELETE FROM deposit_notification_lease');const r=await Promise.all([depositNoticeTick(f.env),depositNoticeTick(f.env)]);assert.ok(r.some(x=>x.busy));assert.equal(f.sent.length,4);
});
test('발송 도중 운영자가 중지하면 다음 고객은 즉시 제외된다',async t=>{
 const f=setup(t);await f.enable();f.booking('BK-ONE');f.booking('BK-TWO');f.onSend(d=>{if(d.receiver_1==='01099998888')f.db.exec("UPDATE settings SET value=json_set(value,'$.enabled',json('false')) WHERE key='deposit_alimtalk'");});await f.tick();assert.equal(f.sent.filter(x=>x.receiver_1==='01099998888').length,1);await f.tick();assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE booking_code='BK-TWO'").get().status,'cancelled');
});
test('기존 입금 확인 메모형 값도 입금 완료로 인식해 입금 안내 중복을 막는다',async t=>{
 const f=setup(t);await f.enable();f.db.prepare('INSERT INTO inquiry_checks VALUES(?,?,?)').run('MS-TEST','{"guarantee_paid":"입금확인"}',now());f.booking('BK-LEGACY',{ref:'MS-TEST'});const rows=f.db.prepare("SELECT kind FROM deposit_notifications WHERE booking_code='BK-LEGACY'").all();assert.deepEqual(rows.map(x=>x.kind),['account']);
});

test('미발송 보증금 안내는 예약 변경 후 검토 상태로 남고 최신 미리보기 확인으로만 새 안내를 만든다',async t=>{
 const f=setup(t);await f.enable();f.booking('BK-EDIT');const old=f.db.prepare("SELECT * FROM deposit_notifications WHERE booking_code='BK-EDIT'").get();
 f.db.prepare("UPDATE bookings SET end_h=18 WHERE booking_code='BK-EDIT'").run();await f.tick();assert.equal(f.sent.length,3);
 let row=(await f.api()).items.find(x=>x.id===old.id);assert.equal(row.status,'review');assert.ok(row.review.hash);assert.equal(row.review.blocked,'');
 await f.api('/'+old.id+'/retry','POST',{confirm_retry:true,reason:'최신 내용 확인'},409);
 const firstHash=row.review.hash;f.db.prepare("UPDATE bookings SET phone='01033334444' WHERE booking_code='BK-EDIT'").run();
 await f.api('/'+old.id+'/retry','POST',{confirm_retry:true,reason:'최신 내용 확인',review_hash:firstHash},409);
 row=(await f.api()).items.find(x=>x.id===old.id);assert.equal(row.review.phone,'01033334444');
 await f.api('/'+old.id+'/retry','POST',{confirm_retry:true,reason:'변경 수신번호·내용 확인',review_hash:row.review.hash});
 assert.equal(f.db.prepare('SELECT payload FROM deposit_notifications WHERE id=?').get(old.id).payload,old.payload);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE booking_code='BK-EDIT'").get().n,2);
 await f.api('/'+old.id+'/retry','POST',{confirm_retry:true,reason:'중복 클릭',review_hash:row.review.hash},409);
 await f.tick();assert.equal(f.sent.length,4);assert.equal(f.sent.at(-1).receiver_1,'01033334444');
});
test('예약 변경 검토는 이미 접수·결과 불명인 보증금 안내를 재발송 대상으로 만들지 않는다',async t=>{
 const f=setup(t);await f.enable();f.booking('BK-SENT');await f.tick();
 f.db.prepare("UPDATE bookings SET end_h=18 WHERE booking_code='BK-SENT'").run();assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE booking_code='BK-SENT'").get().status,'accepted');
 f.db.prepare("UPDATE deposit_notifications SET status='unknown' WHERE booking_code='BK-SENT'").run();f.db.prepare("UPDATE bookings SET end_h=19 WHERE booking_code='BK-SENT'").run();
 assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE booking_code='BK-SENT'").get().status,'unknown');assert.equal(f.sent.length,4);
});
test('변경 검토 중 입금·계좌 등록이 완료되면 불필요한 보증금 안내를 다시 준비할 수 없다',async t=>{
 const f=setup(t);await f.enable();f.booking('BK-PAID');f.db.prepare("UPDATE bookings SET end_h=18 WHERE booking_code='BK-PAID'").run();
 const row=(await f.api()).items.find(x=>x.booking_code==='BK-PAID');f.db.prepare('INSERT INTO booking_deposit_checks VALUES(?,?,?)').run('BK-PAID',1,now());
 await f.api('/'+row.id+'/retry','POST',{confirm_retry:true,reason:'변경 안내 확인',review_hash:row.review.hash},409);assert.equal(f.sent.length,3);
});

test('보증금 안내는 두 번호의 접수·도착 결과를 따로 기록하고 반복 tick은 재발송하지 않는다',async t=>{
 const f=setup(t);await f.enable();f.booking('BK-TWO-CONTACTS');await f.api('','GET');
 f.db.prepare("INSERT INTO booking_contacts VALUES('BK-TWO-CONTACTS','01033334444',datetime('now'))").run();
 await f.tick();await f.tick();await f.tick();
 const rows=f.db.prepare("SELECT status,phone_hash FROM deposit_notifications WHERE booking_code='BK-TWO-CONTACTS' ORDER BY id").all();assert.equal(rows.length,2);assert.ok(rows.every(x=>x.status==='delivered'));assert.notEqual(rows[0].phone_hash,rows[1].phone_hash);
 assert.deepEqual(f.sent.slice(3).map(x=>x.receiver_1).sort(),['01033334444','01099998888']);
 const history=(await f.api()).items.filter(x=>x.booking_code==='BK-TWO-CONTACTS');assert.deepEqual(history.map(x=>x.receiver).sort(),['01033334444','01099998888']);
});
test('보증금 추가 번호가 발송 전에 삭제되면 대기 중인 추가 안내는 전송하지 않는다',async t=>{
 const f=setup(t);await f.enable();f.booking('BK-REMOVE');f.db.prepare("INSERT INTO booking_contacts VALUES('BK-REMOVE','01033334444',datetime('now'))").run();await f.tick();
 f.db.prepare("UPDATE booking_contacts SET phone2='' WHERE booking_code='BK-REMOVE'").run();await f.tick();
 assert.equal(f.sent.filter(x=>x.receiver_1==='01033334444').length,0);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE booking_code='BK-REMOVE' AND event_key LIKE '%:to:%'").get().status,'cancelled');
});

async function timed(t){const f=setup(t);await f.enable();f.db.prepare("INSERT INTO settings VALUES('booking_journey','{\"enabled\":true}',?)").run(now());return f;}
function confirmedOn(f,code,date='2026-11-03'){f.db.prepare('UPDATE booking_journey_state SET confirmed_at=? WHERE booking_code=?').run(date+' 12:00:00',code);}
test('통합 안내 활성화 후 확정 직후에는 보증금 입금 안내가 나가지 않고 전날 미납일 때만 한 번 발송한다',async t=>{
 const f=await timed(t);f.booking('BK-DUE',{date:'2026-11-08'});confirmedOn(f,'BK-DUE');await f.tick();assert.equal(f.sent.length,3);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_confirmed' AND booking_code='BK-DUE'").get().n,1);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE booking_code='BK-DUE'").get().status,'queued');
 t.mock.method(Date,'now',()=>Date.parse('2026-11-04T09:00:00+09:00'));await f.tick();assert.equal(f.sent.length,4);assert.equal(f.sent.at(-1).tpl_code,C.payment);assert.match(f.sent.at(-1).message_1,/2026-11-05/);await f.tick();assert.equal(f.sent.length,4);
});
test('납부 기한 전날에 확정한 예약도 확정 당일에는 통합 안내 외 보증금 안내를 보내지 않는다',async t=>{
 const f=await timed(t);f.booking('BK-TODAY',{date:'2026-11-07'});confirmedOn(f,'BK-TODAY');await f.tick();assert.equal(f.sent.length,3);
});
test('한 달 뒤 기한을 기다린 보증금 안내는 기존 7일 유효기간으로 취소되지 않는다',async t=>{
 const f=await timed(t);f.booking('BK-MONTH',{date:'2026-12-08'});confirmedOn(f,'BK-MONTH');f.db.prepare("UPDATE deposit_notifications SET occurred_at='2026-11-03 03:00:00' WHERE booking_code='BK-MONTH'").run();await f.tick();assert.equal(f.sent.length,3);
 t.mock.method(Date,'now',()=>Date.parse('2026-12-04T09:00:00+09:00'));await f.tick();assert.equal(f.sent.length,4);assert.match(f.sent.at(-1).message_1,/2026-12-05/);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE booking_code='BK-MONTH'").get().status,'accepted');
});
test('전날 발송 전에 보증금 입금 확인 또는 예약 취소가 되면 입금 안내를 보내지 않는다',async t=>{
 const f=await timed(t);f.booking('BK-PAID-LATER',{date:'2026-11-08'});f.booking('BK-CANCEL-LATER',{date:'2026-11-08'});confirmedOn(f,'BK-PAID-LATER');confirmedOn(f,'BK-CANCEL-LATER');
 f.db.prepare('INSERT INTO booking_deposit_checks VALUES(?,?,?)').run('BK-PAID-LATER',1,now());f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-CANCEL-LATER'").run();t.mock.method(Date,'now',()=>Date.parse('2026-11-04T09:00:00+09:00'));await f.tick();
 assert.equal(f.sent.filter(d=>d.tpl_code===C.payment).length,1); // only the earlier operator fixture test
 const rows=f.db.prepare("SELECT status FROM deposit_notifications WHERE kind='payment' AND mode='live'").all();assert.ok(rows.length===2&&rows.every(r=>r.status==='cancelled'));
});
test('미래 보증금 대기가 앞에 쌓여도 계좌 요청·환급 완료 알림은 가로막지 않는다',async t=>{
 const f=await timed(t);for(let i=0;i<5;i++){f.booking('BK-FUTURE-'+i,{date:'2026-12-08'});confirmedOn(f,'BK-FUTURE-'+i);}
 f.db.prepare('INSERT INTO booking_deposit_checks VALUES(?,?,?)').run('BK-FUTURE-4',1,now());await f.tick();assert.equal(f.sent.length,4);assert.equal(f.sent.at(-1).tpl_code,C.account);
});
test('보증금을 이미 받은 신규 확정은 통합 링크에 계좌 등록을 모으고 별도 즉시 안내를 만들지 않는다',async t=>{
 const f=await timed(t);f.db.prepare('INSERT INTO booking_deposit_checks VALUES(?,?,?)').run('BK-ALREADY-PAID',1,now());f.booking('BK-ALREADY-PAID',{date:'2026-11-08'});confirmedOn(f,'BK-ALREADY-PAID');await f.tick();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE booking_code='BK-ALREADY-PAID'").get().n,0);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM transaction_notifications WHERE kind='booking_confirmed' AND booking_code='BK-ALREADY-PAID'").get().n,1);assert.equal(f.sent.length,3);
});
test('보증금 기한이 지난 대기와 취소 건은 새 메시지를 보내지 않고 발송 취소로 남긴다',async t=>{
 const f=await timed(t);f.booking('BK-PAST-DUE',{date:'2026-11-06'});confirmedOn(f,'BK-PAST-DUE','2026-11-01');t.mock.method(Date,'now',()=>Date.parse('2026-11-04T09:00:00+09:00'));await f.tick();assert.equal(f.sent.length,3);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE booking_code='BK-PAST-DUE'").get().status,'cancelled');
});
test('보증금 기한 전날에도 09시 이전에는 보내지 않고 스키마 재적용 후 중복 발송하지 않는다',async t=>{
 const f=await timed(t);f.booking('BK-MORNING',{date:'2026-11-08'});confirmedOn(f,'BK-MORNING');t.mock.method(Date,'now',()=>Date.parse('2026-11-04T08:59:00+09:00'));await f.tick();assert.equal(f.sent.length,3);
 f.db.exec((await import('node:fs')).readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.mock.method(Date,'now',()=>Date.parse('2026-11-04T09:00:00+09:00'));await f.tick();await f.tick();assert.equal(f.sent.length,4);
});
test('서명된 상태 조회는 지연 발송 정책만 보여 주며 예정일 전 고객에게 발송하지 않는다',async t=>{
 const f=await timed(t);f.booking('BK-READONLY',{date:'2026-12-08'});confirmedOn(f,'BK-READONLY');const body=JSON.stringify({time:Date.now()});const response=await cron({env:f.env,params:{path:['status']},request:new Request('https://local.test/api/deposit-notifications/status',{method:'POST',headers:{'X-Megaspot-Signature':await parkingSign(f.env.ALIGO_RELAY_SECRET,body)},body})});assert.equal(response.status,200);const j=await response.json();assert.equal(j.payment_schedule,'day_before_due');assert.equal(f.sent.length,3);
});
test('예전 예약의 UTC 확정 시각도 한국 날짜로 계산해 확정 당일 추가 발송을 막는다',async t=>{
 const f=await timed(t);f.booking('BK-UTC-BASELINE',{date:'2026-11-07'});f.db.prepare("UPDATE bookings SET created_at='2026-11-02 20:00:00' WHERE booking_code='BK-UTC-BASELINE'").run();f.db.prepare("UPDATE booking_journey_state SET confirm_version=0,confirmed_at='2026-11-02 20:00:00' WHERE booking_code='BK-UTC-BASELINE'").run();await f.tick();assert.equal(f.sent.length,3);
});
