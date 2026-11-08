import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {depositNoticeTick} from '../functions/api/_deposit_notifications.js';
import {DEPOSIT_TEMPLATES as T,DEPOSIT_TEMPLATE_CODES as C} from '../functions/api/_deposit_templates.js';
import {now} from '../functions/api/_lib.js';
async function setup(t){
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-05T12:00:00+09:00')});const f=fixture({booking:true});t.after(()=>f.db.close());Object.assign(f.env,{ALIGO_LIVE_ENABLED:'true',ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'test-reminder-secret-more-than-32-chars',ALIGO_SENDER_KEY:'test-profile',ALIGO_SENDER:'01000000000',DEPOSIT_ACCOUNT_KEY:'cd'.repeat(32)});
 const sent=[];let review='APR',delivery='0',resultDate=true,fallbackState=null;t.mock.method(globalThis,'fetch',async(url,opts)=>{assert.equal(url,f.env.ALIGO_RELAY_URL);const r=JSON.parse(opts.body),d=r.data;if(r.path==='template/list'){const k=Object.keys(C).find(k=>C[k]===d.tpl_code);return Response.json({code:0,list:[{templtCode:C[k],inspStatus:review,status:'R',templtContent:T[k].content,buttons:T[k].buttons}]});}if(r.path==='alimtalk/send'){sent.push(d);return Response.json({code:0,info:{mid:String(sent.length),scnt:1,fcnt:0}});}if(r.path==='history/detail'){const s=sent[Number(d.mid)-1];return Response.json({code:0,list:[{type:'AT',phone:s.receiver_1,tpl_code:s.tpl_code,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:resultDate?now():'',rslt:delivery,msgid:'123',smid:fallbackState?'999':'0'}]});}if(r.path==='sms/detail')return Response.json({result_code:1,list:[{type:'LMS',receiver:sent.at(-1).receiver_1,send_date:now(),sms_state:fallbackState}]});assert.fail(r.path);});
 const cfg={enabled:false,types:{payment:false,account:true,refunded:false},codes:C};await f.api('deposit-notifications/settings','PUT',cfg);f.db.prepare("INSERT INTO inquiry_checks VALUES('MS-TEST',?,?)").run(JSON.stringify({guarantee_paid:true}),now());await f.api('deposit-notifications/test','POST',{phone:'01011112222',kind:'account',confirm_test:true});
 const tick=async(send=true)=>{f.db.exec('DELETE FROM deposit_notification_lease');return depositNoticeTick(f.env,send);};await tick(false);await f.api('deposit-notifications/settings','PUT',{...cfg,enabled:true});
 const preview=(codes=['BK-TEST'])=>f.api('deposit-notifications/account-reminders/preview','POST',{codes});const send=(p,status=200)=>f.api('deposit-notifications/account-reminders/send','POST',{preview_id:p.preview_id,confirm_send:true},status);
 return {...f,sent,preview,send,tick,cfg,setReview:x=>review=x,setFallback:x=>fallbackState=x,setDelivery:(x,dated=true)=>{delivery=x;resultDate=dated;}};
}
test('입금 확인·계좌 미등록만 조회하며 미리보기는 링크·발송·환급 기록을 만들지 않는다',async t=>{
 const f=await setup(t),list=await f.api('deposit-notifications/account-reminders');assert.equal(list.items.length,1);assert.equal(list.items[0].reminder.eligible,true);const p=await f.preview();assert.equal(p.items.length,1);assert.match(p.items[0].message,/검증 고객/);assert.equal(f.sent.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_refunds').get().n,0);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE mode='live'").get().n,0);
 f.db.prepare("UPDATE inquiry_checks SET checks='{}'").run();assert.equal((await f.api('deposit-refunds?filter=missing')).items.length,0);
});
test('선택 재요청은 한 번만 준비하고 기존 링크를 쓰며 실제 수신 결과를 기록한다',async t=>{
 const f=await setup(t),p=await f.preview(),r=await f.send(p);assert.equal(r.items.length,1);assert.equal(r.items[0].status,'queued');assert.equal(f.sent.length,1);assert.equal((await f.send(p)).duplicate,true);await f.tick();await f.tick(false);assert.equal(f.sent.length,2);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE mode='live'").get().status,'delivered');assert.ok(JSON.parse(f.sent[1].button_1).button[0].linkMo.includes('#refund-account='));assert.equal((await f.preview()).items.length,0);
 t.mock.timers.tick(3600001);const p2=await f.preview();assert.equal(p2.items.length,1);const old=f.db.prepare('SELECT token_hash FROM booking_refunds').get().token_hash;await f.send(p2);await f.tick();assert.equal(f.db.prepare('SELECT token_hash FROM booking_refunds').get().token_hash,old);assert.equal(f.sent.length,3);
});
test('등록된 계좌·환급 완료·보류·전액 차감·보유기간 만료는 제외한다',async t=>{
 const f=await setup(t);for(const [sql,match] of [["INSERT INTO booking_refunds(booking_code,amount,account_cipher,created_at,updated_at) VALUES('BK-TEST',150000,'cipher','t','t')",/이미 등록/],["UPDATE booking_refunds SET account_cipher=NULL,state='completed'",/반환|완료/],["UPDATE booking_refunds SET state='hold'",/처리 상태/],["UPDATE booking_refunds SET state='pending',deduction=150000",/전액 차감/],["UPDATE booking_refunds SET deduction=0,purged_at='t'",/처리 상태/]]){f.db.exec(sql);assert.match((await f.preview()).excluded[0].reason,match);}assert.equal(f.sent.length,1);
});
for(const [name,change,pattern] of [
 ['계좌 등록',f=>f.db.exec("INSERT INTO booking_refunds(booking_code,amount,account_cipher,created_at,updated_at) VALUES('BK-TEST',150000,'registered','t','t')"),/이미 등록/],
 ['휴대폰 변경',f=>f.db.exec("UPDATE bookings SET phone='01099998888'"),/변경/],
 ['입금 취소',f=>f.db.exec("UPDATE inquiry_checks SET checks='{}'"),/입금 확인/],
 ['예약 취소',f=>f.db.exec("UPDATE bookings SET status='cancelled'"),/취소/],
 ['환급 보류',f=>f.db.exec("INSERT INTO booking_refunds(booking_code,amount,state,created_at,updated_at) VALUES('BK-TEST',150000,'hold','t','t')"),/처리 상태/],
 ['등록 유효기간 경과',f=>f.db.exec("UPDATE bookings SET date='2026-01-01'"),/유효기간/]
])test('미리보기 후 '+name+' 시 발송 직전 제외한다',async t=>{
 const f=await setup(t),p=await f.preview();change(f);const r=await f.send(p);assert.equal(r.items.length,0);assert.match(r.excluded[0].reason,pattern);assert.equal(f.sent.length,1);
});
test('서로 다른 미리보기를 동시에 보내도 같은 고객의 대기 요청은 한 건뿐이다',async t=>{
 const f=await setup(t),p=await f.preview(),p2=await f.preview();const r=await Promise.all([f.send(p),f.send(p2)]);assert.equal(r.flatMap(x=>x.items).length,1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE mode='live'").get().n,1);await f.tick();assert.equal(f.sent.length,2);
});
test('발송 대기 중 고객이 계좌를 등록하면 외부 발송하지 않는다',async t=>{
 const f=await setup(t);await f.send(await f.preview());f.db.prepare("INSERT INTO booking_refunds(booking_code,amount,account_cipher,created_at,updated_at) VALUES('BK-TEST',150000,'registered','t','t')").run();await f.tick();assert.equal(f.sent.length,1);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE mode='live'").get().status,'cancelled');
});
test('결과 불명·처리 중 이력은 재요청하지 않으며 분명한 실패만 새 미리보기를 허용한다',async t=>{
 const f=await setup(t);f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,status) VALUES('BK-TEST','account','old',?,'{}','unknown')").run(now());assert.equal((await f.preview()).items.length,0);f.db.exec("UPDATE deposit_notifications SET status='failed' WHERE mode='live'");assert.equal((await f.preview()).items.length,1);
});
test('미승인·설정 OFF·만료 미리보기·빈 선택·20명 초과 선택을 거절한다',async t=>{
 const f=await setup(t);await f.api('deposit-notifications/account-reminders/preview','POST',{codes:[]},400);await f.api('deposit-notifications/account-reminders/preview','POST',{codes:Array.from({length:21},(_,i)=>'BK-'+i)},400);f.setReview('REQ');await f.api('deposit-notifications/account-reminders/preview','POST',{codes:['BK-TEST']},409);f.setReview('APR');const p=await f.preview();t.mock.timers.tick(600001);await f.send(p,409);await f.api('deposit-notifications/settings','PUT',f.cfg);await f.api('deposit-notifications/account-reminders/preview','POST',{codes:['BK-TEST']},409);
});

test('선택하지 않은 예약은 발송 대기에 넣지 않는다',async t=>{
 const f=await setup(t);await f.api('deposit-notifications/settings','PUT',f.cfg);f.db.exec("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at) SELECT 'BK-OTHER',space_id,inquiry_ref,'선택하지 않은 고객',phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at FROM bookings WHERE booking_code='BK-TEST'");await f.api('deposit-notifications/settings','PUT',{...f.cfg,enabled:true});
 const list=await f.api('deposit-notifications/account-reminders');assert.equal(list.items.length,2);const p=await f.preview();assert.deepEqual(p.items.map(x=>x.code),['BK-TEST']);await f.send(p);await f.tick();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE mode='live' AND booking_code='BK-OTHER'").get().n,0);assert.equal(f.sent.length,2);
});
test('최근 실패보다 이전의 처리 중·최근 수신 성공 이력이 우선한다',async t=>{
 const f=await setup(t);const insert=f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,status,updated_at) VALUES('BK-TEST','account',?,?,'{}',?,?)");insert.run('earlier',now(),'unknown',now());insert.run('newest',now(),'failed',now());assert.equal((await f.preview()).items.length,0);f.db.exec("UPDATE deposit_notifications SET status='delivered' WHERE event_key='earlier'");assert.equal((await f.preview()).items.length,0);t.mock.timers.tick(3600001);assert.equal((await f.preview()).items.length,1);
});
test('로그인하지 않은 요청은 고객 조회·미리보기·재요청을 모두 거절한다',async t=>{
 const f=await setup(t);for(const [path,method] of [['','GET'],['/preview','POST'],['/send','POST'],['/refresh','POST']]){const r=await f.handle(new Request('https://local.test/api/admin/deposit-notifications/account-reminders'+path,{method,headers:{origin:'https://local.test','content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})}));assert.equal(r.status,401);}assert.equal(f.sent.length,1);
});

test('목록에 요청 시각·횟수·성공 횟수·최신 결과·실패 사유를 표시하며 시험/타 종류/취소는 요청 횟수에서 제외한다',async t=>{
 const f=await setup(t);let r=(await f.api('deposit-notifications/account-reminders')).items[0].reminder;assert.equal(r.request_count,0);assert.equal(r.last_requested_at,'');
 const add=f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode,status,error,updated_at) VALUES('BK-TEST',?,?,?,'{}',?,?,?,?)");
 add.run('account','delivered-old','2026-11-04 01:00:00','live','delivered','','2026-11-04 01:01:00');add.run('payment','other-kind',now(),'live','delivered','',now());add.run('account','cancelled-request',now(),'live','cancelled','등록 완료',now());add.run('account','latest-failure','2026-11-05 02:00:00','live','failed','알리고 접수 거절 -101','2026-11-05 02:01:00');
 r=(await f.api('deposit-notifications/account-reminders')).items[0].reminder;assert.equal(r.request_count,2);assert.equal(r.delivered_count,1);assert.equal(r.last_requested_at,'2026-11-05 02:00:00');assert.equal(r.last_at,'2026-11-05 02:01:00');assert.equal(r.last_status,'failed');assert.equal(r.last_error,'알리고 접수 거절 -101');
});

test('미발송·최근 실패 필터는 대기/성공/결과 미확인 및 다른 종류·시험 이력을 구분한다',async t=>{
 const f=await setup(t),list=s=>f.api('deposit-notifications/account-reminders?reminder_status='+s);
 assert.equal((await list('unsent')).items.length,1);assert.equal((await list('failed')).items.length,0);
 const add=f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode,status) VALUES('BK-TEST',?,?,?,'{}',?,?)");add.run('payment','payment',now(),'live','delivered');assert.equal((await list('unsent')).items.length,1);
 for(const state of ['cancelled','queued','sending','accepted','unknown','delivered','failed']){f.db.exec("DELETE FROM deposit_notifications WHERE kind='account' AND mode='live'");add.run('account','state',now(),'live',state);assert.equal((await list('unsent')).items.length,state==='cancelled'?1:0,state);assert.equal((await list('failed')).items.length,state==='failed'?1:0,state);}
 add.run('account','retry',now(),'live','queued');assert.equal((await list('failed')).items.length,0);assert.equal((await list('all')).items.length,1);
});

test('대기·확인 필요 필터는 미완료 이력을 조회하고 재발송을 막으며 시험·다른 종류는 제외한다',async t=>{
 const f=await setup(t),list=s=>f.api('deposit-notifications/account-reminders?reminder_status='+s),add=f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode,status) VALUES('BK-TEST',?,?,?,'{}',?,?)");
 assert.equal((await list('pending')).items.length,0);assert.equal((await list('needs_check')).items.length,0);
 for(const state of ['queued','sending','accepted','unknown','review','failed','delivered','cancelled']){f.db.exec("DELETE FROM deposit_notifications WHERE mode='live'");add.run('account','state',now(),'live',state);const pending=await list('pending'),check=await list('needs_check');assert.equal(pending.items.length,['queued','sending'].includes(state)?1:0,state);assert.equal(check.items.length,['accepted','unknown','review'].includes(state)?1:0,state);for(const p of [...pending.items,...check.items])assert.equal(p.reminder.eligible,false,state);}
 f.db.exec("DELETE FROM deposit_notifications WHERE mode='live'");add.run('payment','other',now(),'live','unknown');add.run('account','test',now(),'test','queued');assert.equal((await list('pending')).items.length,0);assert.equal((await list('needs_check')).items.length,0);
 add.run('account','old-unknown',now(),'live','unknown');add.run('account','latest-failed',now(),'live','failed');const rows=(await list('needs_check')).items;assert.equal(rows.length,1);assert.equal(rows[0].reminder.check_count,1);assert.equal(rows[0].reminder.pending_count,0);assert.equal(rows[0].reminder.last_status,'failed');
});

for(const status of ['accepted','unknown'])test('고객별 결과 재조회: '+status+'를 수신 성공으로 갱신하고 재발송하지 않는다',async t=>{
 const f=await setup(t);await f.send(await f.preview());await f.tick();f.db.prepare("UPDATE deposit_notifications SET status=? WHERE mode='live'").run(status);const count=f.sent.length;
 const r=await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'BK-TEST'});assert.equal(r.items[0].status,'delivered');assert.equal(r.items[0].updated,true);assert.equal(f.sent.length,count);assert.equal((await f.api('deposit-notifications/account-reminders?reminder_status=needs_check')).items.length,0);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE mode='live'").get().n,1);
});
test('접수번호 없는 불명·예약 변경은 직접 확인 안내만 하고 상태·링크·발송을 바꾸지 않는다',async t=>{
 const f=await setup(t);f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,status) VALUES('BK-TEST','account','unknown',?,'{}','unknown'),('BK-TEST','account','review',?,'{}','review')").run(now(),now());const r=await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'BK-TEST'});assert.equal(r.items.length,2);assert.equal(r.items[0].status,'unknown');assert.match(r.items[0].reason,/접수번호/);assert.equal(r.items[1].status,'review');assert.equal(f.sent.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_refunds').get().n,0);
});
test('조회 결과 실패는 실패로, 미확정 결과는 그대로 유지하고 갱신 오류는 재발송하지 않는다',async t=>{
 const f=await setup(t);await f.send(await f.preview());await f.tick();f.setDelivery('0',false);let r=await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'BK-TEST'});assert.equal(r.items[0].status,'accepted');f.setDelivery('500');r=await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'BK-TEST'});assert.equal(r.items[0].status,'accepted');f.setFallback('발송실패');r=await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'BK-TEST'});assert.equal(r.items[0].status,'failed');assert.equal(f.sent.length,2);
});
test('결과 조회는 로그인·예약번호를 검증하고 실패한 외부 조회나 불일치 수신 결과로 상태를 확정하지 않는다',async t=>{
 const f=await setup(t);await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'bad value'},400);await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'BK-NOTFOUND'},404);await f.send(await f.preview());await f.tick();f.db.exec("UPDATE deposit_notifications SET phone_hash='different' WHERE mode='live'");let r=await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'BK-TEST'});assert.equal(r.items[0].status,'accepted');t.mock.method(globalThis,'fetch',async()=>{throw Error('provider down');});r=await f.api('deposit-notifications/account-reminders/refresh','POST',{code:'BK-TEST'});assert.equal(r.items[0].status,'accepted');assert.equal(r.items[0].checked,false);assert.equal(f.sent.length,2);
});
