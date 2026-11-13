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

test('첫 미리보기에서도 예약확정서나 수납 내역을 생성·변경하지 않는다',async t=>{
 const f=setup(t);f.db.exec("UPDATE bookings SET confirm_doc=NULL WHERE booking_code='BK-TEST'");
 const p=await f.api(path+'/preview','POST',{kind:'booking_confirmed'});assert.equal(p.items.length,1);
 assert.equal(f.db.prepare("SELECT confirm_doc FROM bookings WHERE booking_code='BK-TEST'").get().confirm_doc,null);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n,0);assert.equal(f.sends(),0);
});

test('월간 달력은 20건을 넘는 예약과 취소 예약을 빠짐없이 표시하고 월 경계를 구분한다',async t=>{
 const f=setup(t),month=f.today.slice(0,7);f.db.prepare("UPDATE bookings SET date=? WHERE booking_code='BK-TEST'").run(month+'-20');
 for(let i=0;i<35;i++)f.db.prepare('INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,start_h,end_h,created_at) VALUES(?,?,?,?,5678,?,?,?,?,?)').run('CAL-'+i,i%2?'megaspot-gundae':'megaspot-gundae-2','달력 고객 '+i,'01012345678',month+'-'+String(i%28+1).padStart(2,'0'),i===1?'cancelled':'confirmed',10,17,f.today);
 f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,start_h,end_h,created_at) VALUES('OUTSIDE','megaspot-gundae','다른 달','01012345678','5678','2099-01-01','confirmed',10,17,?)").run(f.today);
 const original=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=sql=>{const statement=original(sql),bind=statement.bind.bind(statement);statement.bind=(...args)=>{assert.ok(args.length<=100,'D1 bind limit');return bind(...args);};return statement;};
 const r=await f.api('booking-notifications?calendar=1&month='+month);assert.equal(r.items.length,36);assert.equal(r.has_more,false);assert.ok(r.items.some(b=>b.status==='cancelled'));assert.ok(!r.items.some(b=>b.booking_code==='OUTSIDE'));
 const filtered=await f.api('booking-notifications?calendar=1&month='+month+'&space=megaspot-gundae-2');assert.ok(filtered.items.every(b=>b.space_id==='megaspot-gundae-2'));
 await f.api('booking-notifications?calendar=1&month=2026-13','GET',undefined,400);assert.equal(f.sends(),0);
});
test('예약번호로 달력을 검색하면 예약이 속한 달로 이동한다',async t=>{
 const f=setup(t);f.db.exec("UPDATE bookings SET date='2027-01-05'");const r=await f.api('booking-notifications?calendar=1&q=BK-TEST');assert.equal(r.month,'2027-01');assert.equal(r.items.length,1);
});
test('발송 원문은 암호화해 보관하고 현재 예약 정보가 바뀌어도 당시 본문과 버튼을 그대로 조회한다',async t=>{
 const f=setup(t);const {saveNotificationContent}=await import('../functions/api/_notification_content.js');
 f.db.exec("INSERT INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,status,occurred_at) VALUES('journey-confirm:BK-TEST:1','booking_confirmed','customer','BK-TEST','BK-TEST','01012345678','delivered',datetime('now'))");const id=f.db.prepare("SELECT id FROM transaction_notifications WHERE kind='booking_confirmed'").get().id;
 const privateUrl='https://megaspot.kr/booking/#booking=private-historical-key';await saveNotificationContent(f.env,'transaction',id,{receiver:'01012345678',message:'과거 고객님, 확정되었습니다.',buttons:[{name:'예약 안내 확인',linkMo:privateUrl}],fallback_message:'실패 시 대체 문자 내용'});
 assert.ok(!f.db.prepare("SELECT value FROM settings WHERE key LIKE 'notification_content:%'").get().value.includes('private-historical-key'));
 f.db.exec("UPDATE bookings SET customer_name='현재 변경된 고객'");const r=await f.api(path+'/content?kind=booking_confirmed');assert.equal(r.content.source,'saved');assert.equal(r.content.message,'과거 고객님, 확정되었습니다.');assert.equal(r.content.buttons[0].linkMo,privateUrl);assert.match(r.current.message,/현재 변경된 고객/);assert.equal(f.sends(),0);
});
test('기존 발송은 공급사 원문을 조회하고 다른 예약 이력 접근과 원문 없는 기록의 추측 표시를 막는다',async t=>{
 const f=setup(t);f.env.ALIGO_SENDER_KEY='history-profile';let lookups=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{const req=JSON.parse(init.body);assert.equal(req.path,'history/detail');lookups++;return Response.json({code:0,list:[{type:'AT',phone:'01012345678',senderKey:'history-profile',tpl_code:'UN_6623',message:'공급사에 저장된 실제 발송 원문',button_json:JSON.stringify({button:[{name:'당시 버튼',linkM:'https://megaspot.kr/booking/'}]})}]});});
 f.db.exec("INSERT INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,status,provider_mid,occurred_at) VALUES('journey-confirm:BK-TEST:1','booking_confirmed','customer','BK-TEST','BK-TEST','01012345678','delivered','at:UN_6623:123',datetime('now'))");
 let r=await f.api(path+'/content?kind=booking_confirmed');assert.equal(r.content.source,'provider');assert.equal(r.content.message,'공급사에 저장된 실제 발송 원문');assert.equal(r.content.buttons[0].name,'당시 버튼');await f.api(path+'/content?kind=booking_confirmed');assert.equal(lookups,1);
 await f.api(path+'/content?kind=booking_confirmed&engine=transaction&id=9999','GET',undefined,404);
 f.db.exec("DELETE FROM settings WHERE key LIKE 'notification_content:%';UPDATE transaction_notifications SET provider_mid=NULL");r=await f.api(path+'/content?kind=booking_confirmed');assert.equal(r.content.source,'unavailable');assert.equal(r.content.message,'');assert.ok(r.current.message);
});
