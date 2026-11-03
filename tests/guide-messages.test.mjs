import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, DAY } from './helpers/admin-fixture.mjs';
import { createHmac } from 'node:crypto';
import { GUIDE_TEMPLATE, GUIDE_BUTTON, GUIDE_URL, GUIDE_VERSION, guideMessage, guideEligibility, guideDelivery, automaticGuide } from '../functions/api/_guide_messages.js';

function setup(t,{booking=true}={}) {
  const f=fixture({booking});t.after(()=>f.db.close());
  Object.assign(f.env,{ALIGO_API_KEY:'fixture-secret',ALIGO_USERID:'fixture-user',ALIGO_SENDER_KEY:'fixture-profile',ALIGO_SENDER:'01012345678',ALIGO_LIVE_ENABLED:'true'});
  let template={templtCode:'TPL-TEST',inspStatus:'APR',status:'R',templtContent:GUIDE_TEMPLATE,buttons:[GUIDE_BUTTON]}, sendError=null, result='0';
  const sent=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    assert.equal(opts.redirect,'manual');
    const data=new URLSearchParams(opts.body);
    assert.equal(data.get('apikey'),'fixture-secret');
    if(url.endsWith('/template/list/'))return Response.json({code:0,list:[template]});
    if(url.endsWith('/alimtalk/send/')){
      assert.equal(data.get('failover'),'N');assert.equal(data.get('testMode'),'N');assert.deepEqual(JSON.parse(data.get('button_1')),{button:[GUIDE_BUTTON]});
      sent.push(Object.fromEntries(data));if(sendError instanceof Error)throw sendError;if(sendError)return Response.json(sendError);
      return Response.json({code:0,info:{mid:String(sent.length),scnt:1,fcnt:0}});
    }
    if(url.endsWith('/history/detail/')){const previous=sent[Number(data.get('mid'))-1];return Response.json({code:0,list:[{msgid:'123',type:'AT',phone:previous.receiver_1,tpl_code:'TPL-TEST',senderKey:'fixture-profile',rsltdate:'2026-11-03 03:00:00',rslt:result,rslt_message:result==='0'?'성공':'실패'}]});}
    assert.fail('Unexpected provider request: '+url);
  });
  const settings={template_code:'TPL-TEST',spaces:['megaspot-gundae'],enabled:false,automatic:false};
  async function prepare(){await f.api('guide-messages/settings','PUT',settings);const r=await f.api('guide-messages/test','POST',{phone:'01011112222',confirm_test:true});await f.api('guide-messages/'+r.id+'/refresh','POST',{});}
  async function enable(automatic=false){await prepare();await f.api('guide-messages/settings','PUT',{...settings,enabled:true,automatic});}
  const preview=(body={})=>f.api('guide-messages/preview','POST',{codes:['BK-TEST'],...body});
  const send=p=>f.api('guide-messages/send','POST',{preview_id:p.preview_id,confirm_send:true});
  return {...f,sent,settings,prepare,enable,preview,send,setTemplate:v=>template={...template,...v},setError:v=>sendError=v,setResult:v=>result=v};
}

test('운영 설정의 기본값은 발송 중지이며 인증 비밀값은 반환하지 않는다',async t=>{
  const f=setup(t),s=await f.api('guide-messages/settings');assert.equal(s.enabled,false);assert.equal(s.automatic,false);assert.deepEqual(s.spaces,[]);
  assert.ok(!JSON.stringify(s).includes('fixture-secret'));assert.equal(s.credentials.ALIGO_API_KEY,true);
  await f.api('guide-messages/settings','PUT',{...f.settings,enabled:true},409);assert.equal(f.sent.length,0);
});
test('미승인·본문 또는 링크 불일치 템플릿으로 시험/고객 발송 불가',async t=>{
  const f=setup(t);await f.api('guide-messages/settings','PUT',f.settings);
  for(const change of [{inspStatus:'REQ'},{inspStatus:'APR',templtContent:'다른 문구'},{templtContent:GUIDE_TEMPLATE,buttons:[{...GUIDE_BUTTON,linkPc:'https://wrong.test'}]}]){f.setTemplate(change);await f.api('guide-messages/test','POST',{phone:'01011112222',confirm_test:true},400);}
  assert.equal(f.sent.length,0);
});
test('시험 수신 성공과 서버 허용 전 고객 발송은 불가',async t=>{
  const f=setup(t);await f.api('guide-messages/settings','PUT',f.settings);await f.api('guide-messages/settings','PUT',{...f.settings,enabled:true},409);
  await f.prepare();f.env.ALIGO_LIVE_ENABLED='false';await f.api('guide-messages/settings','PUT',{...f.settings,enabled:true},409);
});
test('운영자 시험 수신은 고객 이력·현장 안내 체크·예약 중복 방지에서 제외',async t=>{
  const f=setup(t);await f.prepare();assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM inquiry_checks').get().n,0);
  const h=await f.api('guide-messages/history');assert.equal(h.items[0].mode,'test');assert.equal(h.items[0].booking_code,null);assert.equal(h.items[0].status,'delivered');
  const p=await f.preview();assert.equal(p.items.length,1);assert.equal(f.sent.length,1);
});
test('실제 발송에는 서버의 예약 정보를 사용하고 중복 미리보기·반복 클릭을 차단',async t=>{
  const f=setup(t);await f.enable();const p=await f.preview(),other=await f.preview();
  await f.send(p);await f.send(other);assert.equal(f.sent.length,2);assert.equal(f.sent[1].receiver_1,'01012345678');assert.match(f.sent[1].message_1,/검증 고객/);
  await f.api('guide-messages/send','POST',{preview_id:p.preview_id,confirm_send:true},409);
  const again=await f.preview();assert.equal(again.items.length,0);
});
test('발송 접수는 안내 체크가 되지 않고 실제 성공 이후 기존 체크를 보존해서 반영',async t=>{
  const f=setup(t);await f.enable();f.db.prepare('INSERT INTO inquiry_checks(ref,checks,updated_at) VALUES(?,?,?)').run('MS-TEST',JSON.stringify({guarantee_paid:'old',quote_sent:true}),'old');
  const r=await f.send(await f.preview()),id=r.items[0].id;let c=JSON.parse(f.db.prepare('SELECT checks FROM inquiry_checks').get().checks);assert.equal(c.guide_sent,undefined);
  await f.api('guide-messages/'+id+'/refresh','POST',{});c=JSON.parse(f.db.prepare('SELECT checks FROM inquiry_checks').get().checks);assert.ok(c.guide_sent);assert.equal(c.guarantee_paid,'old');assert.equal(c.quote_sent,true);
});
test('미리보기 후 날짜·연락처·시간·취소·기존 안내 체크 변경을 모두 재검사',async t=>{
  const f=setup(t);await f.enable();
  for(const sql of ["UPDATE bookings SET phone='01099998888'","UPDATE bookings SET end_h=18","UPDATE bookings SET date='2099-01-02'","UPDATE bookings SET status='cancelled'"]){
    f.db.prepare("UPDATE bookings SET phone='01012345678',start_h=10,end_h=17,date=?,status='confirmed'").run(DAY);
    const p=await f.preview();f.db.exec(sql);const r=await f.send(p);assert.equal(r.items[0].skipped,true);
  }
  assert.equal(f.sent.length,1);
});
test('미리보기 만료·설정 변경은 전체 발송을 차단',async t=>{
  const f=setup(t);await f.enable();let p=await f.preview();f.db.prepare('UPDATE booking_guide_previews SET expires_at=0').run();await f.api('guide-messages/send','POST',{preview_id:p.preview_id,confirm_send:true},409);
  p=await f.preview();await f.api('guide-messages/settings','PUT',{...f.settings,template_code:'CHANGED'});await f.api('guide-messages/send','POST',{preview_id:p.preview_id,confirm_send:true},409);assert.equal(f.sent.length,1);
});
test('응답 불명은 재발송을 잠그고 미발송 확인은 24시간 이후에만 가능',async t=>{
  const f=setup(t);await f.enable();f.setError(Error('timeout'));const r=await f.send(await f.preview()),id=r.items[0].id;assert.equal(r.items[0].status,'unknown');assert.equal((await f.preview()).items.length,0);
  await f.api('guide-messages/'+id+'/not-sent','POST',{confirm_not_sent:true,reason:'알리고 전송내역 미접수 확인'},409);
  f.db.prepare("UPDATE booking_guide_messages SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(id);await f.api('guide-messages/'+id+'/not-sent','POST',{confirm_not_sent:true,reason:'알리고 전송내역 미접수 확인'});
  assert.equal((await f.preview()).items.length,1);
});
test('명확한 API 거절과 실제 전송 실패는 이력을 남기고 재발송 가능',async t=>{
  const f=setup(t);await f.enable();f.setError({code:-99,message:'fixture-secret'});let r=await f.send(await f.preview());assert.equal(r.items[0].status,'failed');assert.ok(!JSON.stringify(r).includes('fixture-secret'));
  f.setError(null);r=await f.send(await f.preview());f.setResult('U');await f.api('guide-messages/'+r.items[0].id+'/refresh','POST',{});assert.equal((await f.preview()).items.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM inquiry_checks').get().n,0);
});
test('실패 목록에 최신 사유·코드를 표시하고 해당 고객 1명만 미리보기해 재발송한다',async t=>{
  const f=setup(t);await f.enable();f.setResult('U');
  const first=await f.send(await f.preview());await f.api('guide-messages/'+first.items[0].id+'/refresh','POST',{});
  const failed=(await f.api('guide-messages/candidates?status=failed')).items[0];
  assert.equal(failed.failure_reason,'실패');assert.equal(failed.failure_code,'U');assert.equal(failed.retry_allowed,true);
  f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES('BK-SECOND','megaspot-gundae','다른 고객','01022223333','3333',?,10,17,'confirmed','now')").run(DAY);
  const preview=await f.preview({codes:[failed.booking_code]});assert.deepEqual(preview.items.map(x=>x.booking_code),['BK-TEST']);
  f.setResult('0');const retry=await f.send(preview);assert.equal(f.sent.length,3);assert.equal(f.sent[2].receiver_1,'01012345678');
  let current=(await f.api('guide-messages/candidates')).items.find(x=>x.booking_code==='BK-TEST');
  assert.equal(current.message_status,'accepted');assert.equal(current.failure_reason,'');assert.equal(current.failure_code,'');assert.equal(current.retry_allowed,false);
  await f.api('guide-messages/'+retry.items[0].id+'/refresh','POST',{});
  assert.equal((await f.api('guide-messages/candidates?status=failed')).items.length,0);assert.equal((await f.preview()).items.length,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM booking_guide_messages WHERE mode='live' AND status='failed'").get().n,1);
});
test('취소·기존 안내 체크·중복 잠금 고객은 실패 사유가 있어도 개별 재발송을 허용하지 않는다',async t=>{
  const f=setup(t);await f.enable();f.setError({code:-99,message:'fixture-secret'});await f.send(await f.preview());
  let item=(await f.api('guide-messages/candidates?status=failed')).items[0];assert.match(item.failure_reason,/알리고 오류 -99/);assert.ok(!item.failure_reason.includes('fixture-secret'));
  f.db.prepare('INSERT INTO inquiry_checks(ref,checks,updated_at) VALUES(?,?,?)').run('MS-TEST','{"guide_sent":true}','now');
  assert.equal((await f.api('guide-messages/candidates?status=failed')).items[0].retry_allowed,false);
  f.db.prepare('DELETE FROM inquiry_checks WHERE ref=?').run('MS-TEST');f.db.prepare("UPDATE bookings SET status='cancelled'").run();
  assert.equal((await f.api('guide-messages/candidates?status=failed')).items[0].retry_allowed,false);
  f.db.prepare("UPDATE bookings SET status='confirmed'").run();
  f.db.prepare("INSERT INTO booking_guide_messages(id,booking_code,purpose,mode,status,snapshot,config_hash,actor,created_at,updated_at) VALUES('active-old','BK-TEST',?,'live','accepted','{}','fixture','admin','2000-01-01','2000-01-01')").run(GUIDE_VERSION);
  item=(await f.api('guide-messages/candidates?status=failed')).items[0];assert.equal(item.message_status,'failed');assert.equal(item.retry_allowed,false);
  assert.equal((await f.preview()).items.length,0);assert.equal(f.sent.length,2);
});
test('동시 요청에도 같은 예약의 알림톡을 한 번만 요청',async t=>{
  const f=setup(t);await f.enable();const a=await f.preview(),b=await f.preview();await Promise.all([f.send(a),f.send(b)]);assert.equal(f.sent.length,2);
});
test('같은 고객·번호라도 다른 예약은 각각 발송 가능',async t=>{
  const f=setup(t);await f.enable();f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES('BK-SECOND','megaspot-gundae','검증 고객','01012345678','5678','2099-02-01',10,17,'confirmed','now')").run();
  const p=await f.preview({codes:['BK-TEST','BK-SECOND']});assert.equal(p.items.length,2);await f.send(p);assert.equal(f.sent.length,3);
});
test('기존 현장 안내 체크 고객은 사유와 명시적 포함 없이는 제외',async t=>{
  const f=setup(t);await f.enable();f.db.prepare('INSERT INTO inquiry_checks(ref,checks,updated_at) VALUES(?,?,?)').run('MS-TEST','{"guide_sent":true}','now');
  assert.equal((await f.preview()).items.length,0);await f.api('guide-messages/preview','POST',{codes:['BK-TEST'],include_manual:true},400);
  const p=await f.preview({include_manual:true,reason:'시설 사용법 추가 안내'});assert.equal(p.items.length,1);await f.send(p);assert.equal(f.sent.length,2);
});
test('미발송 필터는 완료·처리 중·수동 안내를 제외하고 실패·취소·다른 목적의 이력은 구분한다',async t=>{
  const f=setup(t,{booking:false});await f.api('guide-messages/settings','PUT',f.settings);
  const add=f.db.prepare("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES(?,'megaspot-gundae',?,'필터 고객','01012345678','5678',?,10,17,'confirmed','now')");
  const message=f.db.prepare("INSERT INTO booking_guide_messages(id,booking_code,purpose,mode,status,snapshot,config_hash,actor,created_at,updated_at) VALUES(?,?,?,?,?,'{}','fixture','admin','now','now')");
  for(const status of ['queued','sending','accepted','unknown','delivered','failed','cancelled']){
    const code='BK-'+status.toUpperCase();add.run(code,null,DAY);message.run(code,code,GUIDE_VERSION,'live',status);
  }
  for(const code of ['BK-NEVER','BK-MANUAL','BK-TEST-ONLY','BK-OTHER-PURPOSE'])add.run(code,code==='BK-MANUAL'?'MS-TEST':null,DAY);
  f.db.prepare('INSERT INTO inquiry_checks(ref,checks,updated_at) VALUES(?,?,?)').run('MS-TEST','{"guide_sent":true}','now');
  message.run('test-only','BK-TEST-ONLY',GUIDE_VERSION,'test','delivered');
  message.run('other-purpose','BK-OTHER-PURPOSE','another-message','live','delivered');
  // Even if a later attempt was cancelled, a previous successful guide must stay excluded.
  message.run('later-cancel','BK-DELIVERED',GUIDE_VERSION,'live','cancelled');
  const unsent=await f.api('guide-messages/candidates?status=unsent');
  assert.deepEqual(unsent.items.map(x=>x.booking_code).sort(),['BK-CANCELLED','BK-FAILED','BK-NEVER','BK-OTHER-PURPOSE','BK-TEST-ONLY']);
  assert.equal((await f.api('guide-messages/candidates?status=all')).items.length,11);
  assert.equal((await f.api('guide-messages/candidates')).items.length,11);
  assert.deepEqual((await f.api('guide-messages/candidates?status=failed')).items.map(x=>x.booking_code),['BK-FAILED']);
  assert.deepEqual((await f.api('guide-messages/candidates?status=needs_review')).items.map(x=>x.booking_code).sort(),['BK-ACCEPTED','BK-QUEUED','BK-SENDING','BK-UNKNOWN']);
  assert.equal(f.sent.length,0);
});
test('오류 필터는 이전·취소 예약까지 최신 고객 발송 이력만 조회하고 재발송 보호를 유지한다',async t=>{
  const f=setup(t,{booking:false});await f.api('guide-messages/settings','PUT',f.settings);
  const add=f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES(?,?,'오류 확인 고객','01012345678','5678',?,10,17,?,'now')");
  const message=f.db.prepare("INSERT INTO booking_guide_messages(id,booking_code,purpose,mode,status,snapshot,config_hash,actor,created_at,updated_at) VALUES(?,?,?,?,?,'{}','fixture','admin','now','now')");
  for(const [code,space,date,status] of [
    ['BK-OLD-FAILED','megaspot-gundae','2000-01-01','cancelled'],['BK-OLD-UNKNOWN','megaspot-gundae','2000-01-01','completed'],
    ['BK-RETRIED','megaspot-gundae',DAY,'confirmed'],['BK-RESOLVED','megaspot-gundae',DAY,'confirmed'],
    ['BK-TEST-ONLY','megaspot-gundae',DAY,'confirmed'],['BK-OTHER-PURPOSE','megaspot-gundae',DAY,'confirmed'],
    ['BK-SECOND-FAILED','megaspot-gundae-2',DAY,'confirmed']])add.run(code,space,date,status);
  let n=0;const record=(code,status,mode='live',purpose=GUIDE_VERSION)=>message.run('review-'+n++,code,purpose,mode,status);
  record('BK-OLD-FAILED','failed');record('BK-OLD-UNKNOWN','unknown');record('BK-SECOND-FAILED','failed');
  record('BK-RETRIED','failed');record('BK-RETRIED','delivered');record('BK-RESOLVED','unknown');
  f.db.prepare("UPDATE booking_guide_messages SET status='cancelled' WHERE booking_code='BK-RESOLVED'").run();
  record('BK-TEST-ONLY','failed','test');record('BK-OTHER-PURPOSE','unknown','live','another-message');
  const failed=await f.api('guide-messages/candidates?status=failed');
  assert.deepEqual(failed.items.map(x=>x.booking_code),['BK-OLD-FAILED','BK-SECOND-FAILED']);assert.ok(failed.items[0].exclusion);
  assert.deepEqual((await f.api('guide-messages/candidates?status=needs_review')).items.map(x=>x.booking_code),['BK-OLD-UNKNOWN']);
  assert.deepEqual((await f.api('guide-messages/candidates?status=failed&space=megaspot-gundae-2&from='+DAY+'&to='+DAY)).items.map(x=>x.booking_code),['BK-SECOND-FAILED']);
  const p=await f.preview({codes:['BK-OLD-FAILED','BK-OLD-UNKNOWN','BK-RETRIED']});assert.equal(p.items.length,0);assert.equal(p.excluded.length,3);assert.equal(f.sent.length,0);
});
test('미발송 필터를 페이지 분할 전에 적용하고 날짜·호점 조건도 함께 유지한다',async t=>{
  const f=setup(t,{booking:false});
  const add=f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES(?,?,'페이지 고객','01012345678','5678',?,10,17,'confirmed','now')");
  const message=f.db.prepare("INSERT INTO booking_guide_messages(id,booking_code,purpose,mode,status,snapshot,config_hash,actor,created_at,updated_at) VALUES(?,?,?,'live',?,'{}','fixture','admin','now','now')");
  for(let n=0;n<220;n++){const code='BK-PAGE-'+n;add.run(code,'megaspot-gundae',DAY);message.run(code,code,GUIDE_VERSION,n<110?'delivered':'failed');}
  add.run('BK-SPACE-TWO','megaspot-gundae-2',DAY);
  const q='guide-messages/candidates?status=unsent&from='+DAY+'&to='+DAY+'&space=megaspot-gundae';
  const a=await f.api(q),b=await f.api(q+'&page=1');
  assert.equal(a.items.length,100);assert.equal(a.has_more,true);assert.equal(b.items.length,10);assert.equal(b.has_more,false);
  assert.equal(new Set([...a.items,...b.items].map(x=>x.booking_code)).size,110);
  assert.ok([...a.items,...b.items].every(x=>Number(x.booking_code.split('-').pop())>=110));
  const other=await f.api('guide-messages/candidates?status=unsent&space=megaspot-gundae-2&from='+DAY+'&to='+DAY);
  assert.deepEqual(other.items.map(x=>x.booking_code),['BK-SPACE-TWO']);assert.equal(f.sent.length,0);
  const failures=await f.api(q.replace('status=unsent','status=failed')),more=await f.api(q.replace('status=unsent','status=failed')+'&page=1');
  assert.equal(failures.items.length,100);assert.equal(failures.has_more,true);assert.equal(more.items.length,10);assert.equal(more.has_more,false);
  assert.equal(new Set([...failures.items,...more.items].map(x=>x.booking_code)).size,110);
});
test('설정 변경은 시험 수신 증명을 무효화한다',async t=>{
  const f=setup(t);await f.enable();await f.api('guide-messages/settings','PUT',{...f.settings,spaces:['megaspot-gundae','megaspot-gundae-2']});assert.equal((await f.api('guide-messages/settings')).test_delivered,false);
});
test('자동 발송은 새 확정에만 동작하고 조회·같은 상태 저장·배포 준비는 소급 발송하지 않는다',async t=>{
  const f=setup(t);await f.enable(true);await f.api('bookings');await f.api('bookings/BK-TEST','PATCH',{status:'confirmed'});await f.api('inquiries/MS-TEST','PATCH',{status:'예약 확정'});assert.equal(f.sent.length,1);
  const r=await f.api('bookings','POST',{space_id:'megaspot-gundae',customer_name:'직접 예약',phone:'01022223333',date:'2099-03-01',start_h:18,end_h:22});assert.ok(r.booking_code);assert.equal(f.sent.length,2);
  await automaticGuide(f.env,r.booking_code);assert.equal(f.sent.length,2);
});
test('문의에서 확정해도 자동 발송되며 메시지 서비스 장애는 예약 확정을 롤백하지 않는다',async t=>{
  const f=setup(t,{booking:false});await f.enable(true);f.setError(Error('connection lost'));const r=await f.api('inquiries/MS-TEST/confirm','POST',{date:DAY,start_h:10,end_h:17,amount:500000});assert.ok(r.booking_code);
  assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'confirmed');assert.equal(f.db.prepare("SELECT status FROM booking_guide_messages WHERE mode='live'").get().status,'unknown');
});
test('자정 이후 예약 종료와 호점·휴대폰·미정 시간 제외 조건',()=>{
  const b={status:'confirmed',space_id:'megaspot-gundae',customer_name:'홍길동',phone:'010-1111-2222',date:'2099-01-01',start_h:23,end_h:26},s={spaces:['megaspot-gundae']};
  assert.equal(guideEligibility(b,s,Date.parse('2099-01-02T01:00:00+09:00')),'');assert.match(guideMessage(b),/23:00~다음날 02:00/);assert.match(guideEligibility(b,s,Date.parse('2099-01-02T02:00:00+09:00')),/종료/);
  for(const patch of [{phone:'05012345678'},{space_id:'megaspot-gundae-2'},{start_h:null,end_h:null},{status:'completed'}])assert.ok(guideEligibility({...b,...patch},s,Date.parse('2098-01-01')));
});
test('전송중/결과 미수신은 성공으로 오인하지 않고 최종 성공 코드만 인정',()=>{
  assert.equal(guideDelivery({msgid:'Q123',rslt:'0',rsltdate:'2026-11-03 03:00:00'}),'accepted');assert.equal(guideDelivery({msgid:'123',rslt:'0'}),'accepted');assert.equal(guideDelivery({msgid:'123',rslt:'0',rsltdate:'2026-11-03 03:00:00'}),'delivered');assert.equal(guideDelivery({rslt:'5',rsltdate:'2026-11-03 03:00:00'}),'unknown');assert.equal(guideDelivery({rslt:'U',rsltdate:'2026-11-03 03:00:00'}),'failed');
});
test('관리자 인증과 동일 출처 보호가 모든 발송 API에도 적용',async t=>{
  const f=setup(t),call=(origin,key)=>f.handle(new Request('https://local.test/api/admin/guide-messages/test',{method:'POST',headers:{origin,'content-type':'application/json',...(key?{'x-admin-key':f.env.ADMIN_KEY}:{})},body:JSON.stringify({phone:'01011112222',confirm_test:true})}));
  assert.equal((await call('https://local.test',false)).status,401);assert.equal((await call('https://evil.test',true)).status,403);assert.equal(f.sent.length,0);assert.equal(GUIDE_URL,'https://megaspot-guide.pages.dev/');
});
test('고정 IP 서버로는 서명된 요청만 보내고 API 키를 전달하지 않는다',async t=>{
  const f=setup(t);delete f.env.ALIGO_API_KEY;delete f.env.ALIGO_USERID;f.env.ALIGO_RELAY_URL='https://relay.naranhistory.com/megaspot/aligo';f.env.ALIGO_RELAY_SECRET='fixture-relay-key-at-least-32-characters';
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    assert.equal(opts.redirect,'manual');
    assert.equal(url,f.env.ALIGO_RELAY_URL);assert.equal(opts.headers['X-Megaspot-Signature'],createHmac('sha256',f.env.ALIGO_RELAY_SECRET).update(opts.body).digest('hex'));
    assert.ok(!opts.body.includes('apikey'));const q=JSON.parse(opts.body);calls.push(q);
    if(q.path==='template/list')return Response.json({code:0,list:[{templtCode:'TPL-TEST',inspStatus:'APR',status:'A',templtContent:GUIDE_TEMPLATE,buttons:[GUIDE_BUTTON]}]});
    if(q.path==='history/detail')return Response.json({code:0,list:[{msgid:'1',type:'AT',phone:'01011112222',tpl_code:'TPL-TEST',senderKey:'fixture-profile',rslt:'0',rsltdate:'2026-11-03 03:00:00'}]});
    assert.equal(q.path,'alimtalk/send');return Response.json({code:0,info:{mid:'1',scnt:1,fcnt:0}});
  });
  await f.enable();const s=await f.api('guide-messages/settings');assert.equal(s.transport,'relay');assert.equal(s.test_delivered,true);assert.equal(s.credentials.ALIGO_API_KEY,undefined);assert.ok(calls.some(x=>x.path==='alimtalk/send'));
});
test('릴레이 리다이렉트는 따라가지 않고 발송 전에 중단한다',async t=>{
  const f=setup(t);f.env.ALIGO_RELAY_URL='https://relay.naranhistory.com/megaspot/aligo';f.env.ALIGO_RELAY_SECRET='fixture-relay-key-at-least-32-characters';
  let calls=0;t.mock.method(globalThis,'fetch',async(url,opts)=>{
    calls++;assert.equal(opts.redirect,'manual');
    return new Response(null,{status:302,headers:{Location:'https://other.example/'}});
  });
  const r=await f.api('guide-messages/check-template','POST',{},400);
  assert.match(r.error,/알리고 응답/);assert.equal(calls,1);assert.equal(f.sent.length,0);
});
test('관리자 결과 동기화로 실제 성공을 반영하고 일시 실패에도 재발송은 하지 않는다',async t=>{
  const f=setup(t);await f.enable();await f.send(await f.preview());await f.api('guide-messages/sync','POST',{});assert.equal(f.db.prepare("SELECT status FROM booking_guide_messages WHERE mode='live'").get().status,'delivered');assert.equal(f.sent.length,2);
});
test('잘못된 접수 응답은 실패로 단정하지 않고 이후 일괄 대상도 보류한다',async t=>{
  const f=setup(t);await f.enable();f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES('BK-SECOND','megaspot-gundae','검증 고객','01012345678','5678','2099-02-01',10,17,'confirmed','now')").run();
  f.setError({message:'unrecognized response'});const p=await f.preview({codes:['BK-TEST','BK-SECOND']}),r=await f.send(p);assert.equal(r.items[0].status,'unknown');assert.equal(r.items[1].skipped,true);assert.equal(f.sent.length,2);
});
test('일괄 발송 도중 고객 발송을 끄면 이후 대상은 실제 요청하지 않는다',async t=>{
  const f=setup(t);await f.enable();f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES('BK-SECOND','megaspot-gundae','검증 고객','01012345678','5678','2099-02-01',10,17,'confirmed','now')").run();
  const upstream=globalThis.fetch;t.mock.method(globalThis,'fetch',async(url,opts)=>{const r=await upstream(url,opts);if(url.endsWith('/alimtalk/send/'))f.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify({...f.settings,enabled:false}),'reservation_guide');return r;});
  const r=await f.send(await f.preview({codes:['BK-TEST','BK-SECOND']}));assert.equal(r.items[0].status,'accepted');assert.equal(r.items[1].status,'queued');assert.equal(f.sent.length,2);
});
test('0으로 채워진 미수신 결과 시각을 실제 성공으로 오인하지 않는다',()=>{
  assert.equal(guideDelivery({msgid:'123',rslt:'0',rsltdate:'0000-00-00 00:00:00'}),'accepted');
});
test('승인 템플릿의 CRLF 개행 형식을 실제 전송 내용에도 보존한다',async t=>{
  const f=setup(t);f.setTemplate({templtContent:GUIDE_TEMPLATE.replace(/\n/g,'\r\n')});await f.enable();await f.send(await f.preview());assert.ok(f.sent[1].message_1.includes('\r\n'));assert.doesNotMatch(f.sent[1].message_1,/(?<!\r)\n/);
});
