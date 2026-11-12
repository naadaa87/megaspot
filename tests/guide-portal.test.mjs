import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture,DAY,NEXT} from './helpers/admin-fixture.mjs';
import {GUIDE_VERSION,GUIDE_TEMPLATE,GUIDE_BUTTON,GUIDE_URL,automaticGuide} from '../functions/api/_guide_messages.js';
import {PORTAL_GUIDE_TEMPLATE,PORTAL_GUIDE_BUTTON} from '../functions/api/_guide_portal.js';
import {portalCustomer} from '../functions/api/_booking_portal.js';
const digest=v=>createHash('sha256').update(v).digest('hex');
function setup(t){
 const f=fixture({booking:true});t.after(()=>f.db.close());Object.assign(f.env,{DEPOSIT_ACCOUNT_KEY:'ab'.repeat(32),ALIGO_API_KEY:'fixture-secret',ALIGO_USERID:'fixture-user',ALIGO_SENDER_KEY:'fixture-profile',ALIGO_SENDER:'01012345678',ALIGO_LIVE_ENABLED:'true'});
 const legacy={enabled:true,automatic:true,template_code:'LEGACY-TEST',spaces:['megaspot-gundae','megaspot-gundae-2']};
 f.db.prepare('INSERT INTO settings VALUES(?,?,?)').run('reservation_guide',JSON.stringify(legacy),'unchanged');
 const oldHash=digest(JSON.stringify([GUIDE_VERSION,GUIDE_TEMPLATE,GUIDE_BUTTON,legacy.template_code,legacy.spaces.slice().sort(),'fixture-user','fixture-secret','fixture-profile','01012345678','','']));
 f.db.prepare("INSERT INTO booking_guide_messages(id,purpose,mode,status,snapshot,config_hash,actor,created_at,updated_at) VALUES('old-test',?,'test','delivered','{}',?,'admin','2000-01-01 00:00:00','2000-01-01 00:00:00')").run(GUIDE_VERSION,oldHash);
 let calls=0,allow=false,template={templtCode:'PORTAL-TEST',inspStatus:'APR',status:'R',templtContent:PORTAL_GUIDE_TEMPLATE,buttons:[PORTAL_GUIDE_BUTTON]};const sent=[];
 t.mock.method(globalThis,'fetch',async(url,opts)=>{calls++;assert.ok(allow,'Draft preview/simulation must not call external APIs');assert.ok(url.startsWith('https://kakaoapi.aligo.in/akv10/'));const d=Object.fromEntries(new URLSearchParams(opts.body));
  if(url.endsWith('/template/list/'))return Response.json({code:0,list:[template]});
  if(url.endsWith('/alimtalk/send/')){assert.equal(d.failover,'N');assert.equal(d.testMode,'N');sent.push(d);return Response.json({code:0,info:{mid:String(sent.length),scnt:1,fcnt:0}});}
  if(url.endsWith('/history/detail/'))return Response.json({code:0,list:[{msgid:'123',type:'AT',phone:sent[Number(d.mid)-1].receiver_1,tpl_code:template.templtCode,senderKey:'fixture-profile',rsltdate:'2026-11-03 03:00:00',rslt:'0'}]});
  assert.fail('Unexpected external request');
 });
 const draft=(simulation=false,extra={})=>f.api('guide-messages/'+(simulation?'portal-test':'portal-preview'),'POST',{codes:['BK-TEST'],confirm_prepare_links:true,...(simulation?{confirm_simulation:true}:{}),...extra});
 const view=async url=>{const r=await portalCustomer({env:f.env,path:'view',request:new Request('https://local.test/api/booking-portal/view',{headers:{Authorization:'Bearer '+new URL(url).hash.slice('#booking='.length)}})});return {status:r.status,json:await r.json()};};
 const settings={variant:'booking-portal',template_code:'PORTAL-TEST',spaces:legacy.spaces,enabled:false,automatic:false};
 const enable=async(automatic=false)=>{allow=true;await f.api('guide-messages/settings','PUT',settings);const op=await f.api('guide-messages/test','POST',{phone:'01012345678',booking_code:'BK-TEST',confirm_private_preview:true,confirm_test:true});await f.api('guide-messages/'+op.id+'/refresh','POST',{});await f.api('guide-messages/settings','PUT',{...settings,enabled:true,automatic});};
 const preview=()=>f.api('guide-messages/preview','POST',{codes:['BK-TEST']});
 const send=p=>f.api('guide-messages/send','POST',{preview_id:p.preview_id,confirm_send:true});
 return {...f,draft,view,enable,preview,send,sent,settings,oldHash,calls:()=>calls,allow:()=>allow=true,setTemplate:x=>template={...template,...x}};
}
test('기존 고정 링크·시험 성공·자동 설정을 유지하고 통합 안내 명세 조회만으로 링크나 발송을 만들지 않는다',async t=>{
 const f=setup(t),before=f.db.prepare('SELECT * FROM settings').all(),s=await f.api('guide-messages/settings'),spec=await f.api('guide-messages/portal-template');
 await f.api('guide-messages/settings','PUT',{...f.settings,variant:'unknown'},400);
 assert.equal(s.variant,'legacy');assert.equal(s.test_delivered,true);assert.equal(s.guide_url,GUIDE_URL);assert.equal(spec.active_variant,'legacy');assert.equal(spec.button.linkMo,'https://megaspot.kr/booking/#booking=#{안내코드}');assert.deepEqual(f.db.prepare('SELECT * FROM settings').all(),before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_portal_links').get().n,0);assert.equal(f.calls(),0);
});
test('새 미리보기·모의시험은 인증·동일 출처·명시적 링크 준비·예약 수 제한을 확인한다',async t=>{
 const f=setup(t);const path='https://local.test/api/admin/guide-messages/portal-test';assert.equal((await f.handle(new Request(path,{method:'POST',body:'{}'}))).status,401);assert.equal((await f.handle(new Request(path,{method:'POST',headers:{'x-admin-key':f.env.ADMIN_KEY,origin:'https://wrong.test'},body:'{}'}))).status,403);
 for(const extra of [{codes:[]},{codes:['invalid/code']},{codes:Array.from({length:21},(_,i)=>'BK-'+i)},{confirm_prepare_links:false}])await f.api('guide-messages/portal-preview','POST',{codes:['BK-TEST'],confirm_prepare_links:true,...extra},400);
 await f.api('guide-messages/portal-test','POST',{codes:['BK-TEST'],confirm_prepare_links:true},400);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_portal_links').get().n,0);assert.equal(f.calls(),0);
});
test('통합 미리보기는 예약별 실제 버튼을 만들고 모의시험은 고객 API까지 확인하지만 실제 발송을 만들지 않는다',async t=>{
 const f=setup(t),before=f.db.prepare('SELECT * FROM settings').all(),p=await f.draft(),r=await f.draft(true);assert.equal(p.sendable,false);assert.equal(p.preview_id,undefined);assert.equal(r.passed,true);assert.equal(r.actual_delivery_tested,false);assert.equal(r.provider_approval_verified,false);assert.equal(p.items[0].guide_url,r.items[0].guide_url);assert.equal(r.items[0].checks.link_matches_booking,true);assert.equal(r.items[0].checks.external_send_called,false);assert.equal(r.items[0].provider_payload.senderkey,undefined);assert.equal(r.items[0].provider_payload.failover,'N');assert.match(r.items[0].message,/BK-TEST/);assert.match(r.items[0].message,/예약확정서·보증금 안내·환급 계좌 등록·입실 안내/);
 assert.equal((await f.view(p.items[0].guide_url)).json.booking.code,'BK-TEST');assert.deepEqual(f.db.prepare('SELECT * FROM settings').all(),before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_previews').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_messages').get().n,1);assert.equal(f.calls(),0);
 await f.api('guide-messages/send','POST',{confirm_send:true,preview_id:'simulation'},409);
});
test('같은 문의의 복수 예약은 다른 통합 버튼으로 이어지고 2호는 준비 중 안내를 유지한다',async t=>{
 const f=setup(t);f.db.prepare("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES('BK-SECOND','megaspot-gundae-2','MS-TEST','가상 두번째','01099998888','8888',?,18,31,'confirmed','now')").run(NEXT);
 const p=await f.draft(true,{codes:['BK-TEST','BK-SECOND']});assert.equal(p.passed,true);assert.notEqual(p.items[0].guide_url,p.items[1].guide_url);for(const item of p.items)assert.equal((await f.view(item.guide_url)).json.booking.code,item.booking_code);assert.equal(p.items[1].checks.arrival_ready,false);assert.equal((await f.view(p.items[1].guide_url)).json.arrival.door_code,undefined);
});
test('기존 고정 버튼·미승인·본문 불일치 템플릿은 새 통합 안내 승인 검사에서 거절하고 설정을 저장하지 않는다',async t=>{
 const f=setup(t);f.allow();const before=f.db.prepare('SELECT * FROM settings').all();for(const patch of [{inspStatus:'REQ'},{inspStatus:'APR',buttons:[GUIDE_BUTTON]},{buttons:[PORTAL_GUIDE_BUTTON],templtContent:GUIDE_TEMPLATE}]){f.setTemplate(patch);await f.api('guide-messages/portal-check-template','POST',{template_code:'PORTAL-TEST'},400);}
 f.setTemplate({templtContent:PORTAL_GUIDE_TEMPLATE});const r=await f.api('guide-messages/portal-check-template','POST',{template_code:'PORTAL-TEST'});assert.equal(r.approved,true);assert.deepEqual(f.db.prepare('SELECT * FROM settings').all(),before);assert.equal(f.sent.length,0);
});
test('새 방식은 승인·운영자 본인 예약 시험 수신 성공 전 활성화할 수 없다',async t=>{
 const f=setup(t);f.allow();await f.api('guide-messages/settings','PUT',f.settings);await f.api('guide-messages/settings','PUT',{...f.settings,enabled:true},409);
 for(const extra of [{booking_code:'UNKNOWN'},{phone:'01011112222'},{confirm_private_preview:false}])await f.api('guide-messages/test','POST',{phone:'01012345678',booking_code:'BK-TEST',confirm_private_preview:true,confirm_test:true,...extra},409);assert.equal(f.sent.length,0);
});
test('별도로 승인·시험 완료한 새 방식은 미리보기와 같은 예약별 버튼을 발송 본문에 연결한다',async t=>{
 const f=setup(t);await f.enable();const p=await f.preview(),url=p.items[0].guide_url,r=await f.send(p);assert.equal(r.items[0].status,'accepted');assert.equal(f.sent.length,2);const sent=f.sent[1],button=JSON.parse(sent.button_1).button[0];assert.equal(button.linkMo,url);assert.equal(button.linkPc,url);assert.equal(sent.subject_1,'메가스팟 예약 확정 안내');assert.ok(!sent.message_1.includes('#{'));assert.equal((await f.view(button.linkMo)).json.booking.code,'BK-TEST');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM inquiry_checks').get().n,0);
 const token=new URL(url).hash.slice('#booking='.length);for(const table of ['booking_guide_previews','booking_guide_messages','event_log'])assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM '+table).all()).includes(token),table);assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM booking_portal_links').all()).includes(token));
});
test('미리보기 후 링크 재발급·취소·연락처 변경 시 새 링크로 몰래 바꾸지 않고 발송을 제외한다',async t=>{
 const f=setup(t);await f.enable();let p=await f.preview();await f.api('bookings/BK-TEST/portal-link/rotate','POST',{confirm_revoke:true,version:1});let r=await f.send(p);assert.equal(r.items[0].skipped,true);assert.equal(f.sent.length,1);
 p=await f.preview();f.db.prepare("UPDATE bookings SET phone='01022223333' WHERE booking_code='BK-TEST'").run();r=await f.send(p);assert.equal(r.items[0].skipped,true);assert.equal(f.sent.length,1);
 p=await f.draft();assert.equal(p.items.length,1);const again=await f.preview();f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-TEST'").run();r=await f.send(again);assert.equal(r.items[0].skipped,true);assert.equal(f.sent.length,1);
});
test('발송 직전 링크 폐기 경합은 동일 SQL 조건에서 차단하며 고객 전송 요청을 만들지 않는다',async t=>{
 const f=setup(t);await f.enable();const p=await f.preview(),prepare=f.env.DB.prepare;f.env.DB.prepare=sql=>{const st=prepare(sql);if(sql.startsWith("UPDATE booking_guide_messages SET status='sending'")){const run=st.run;st.run=async()=>{f.db.exec('UPDATE booking_portal_links SET version=version+1');return run.call(st);};}return st;};
 const r=await f.send(p);assert.equal(r.items[0].status,'cancelled');assert.equal(f.sent.length,1);
});
test('새 방식 자동 경로는 설정 이후의 새 확정에만 전용 링크를 연결하고 기존 예약에 소급 생성하지 않는다',async t=>{
 const f=setup(t);await f.enable(true);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_events').get().n,0);assert.equal(f.sent.length,1);
 const b=await f.api('bookings','POST',{space_id:'megaspot-gundae-2',customer_name:'가상 새 예약',phone:'01022223333',date:NEXT,start_h:10,end_h:11,amount:0});assert.equal(f.sent.length,2);const link=JSON.parse(f.sent[1].button_1).button[0].linkMo;assert.equal((await f.view(link)).json.booking.code,b.booking_code);assert.equal(f.sent[1].receiver_1,'01022223333');
 await automaticGuide(f.env,b.booking_code);assert.equal(f.sent.length,2);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_messages WHERE booking_code=?').get('BK-TEST').n,0);
});
test('CRLF 승인 본문도 발송 시 같은 개행으로 맞추며 링크 변수는 버튼에서만 치환한다',async t=>{
 const f=setup(t);f.setTemplate({templtContent:PORTAL_GUIDE_TEMPLATE.replace(/\n/g,'\r\n')});await f.enable();await f.send(await f.preview());assert.match(f.sent[1].message_1,/\r\n/);assert.ok(!/(?<!\r)\n/.test(f.sent[1].message_1));assert.ok(!f.sent[1].message_1.includes('#booking='));assert.ok(!f.sent[1].button_1.includes('#{안내코드}'));
});
test('암호화 키가 없거나 취소된 예약의 모의시험은 실패하며 새 발송·설정 변경을 만들지 않는다',async t=>{
 const f=setup(t),before=f.db.prepare('SELECT * FROM settings').all();delete f.env.DEPOSIT_ACCOUNT_KEY;let r=await f.draft(true);assert.equal(r.passed,false);assert.equal(r.items.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_portal_links').get().n,0);f.db.prepare("UPDATE bookings SET status='cancelled'").run();r=await f.draft(true);assert.equal(r.passed,false);assert.deepEqual(f.db.prepare('SELECT * FROM settings').all(),before);assert.equal(f.calls(),0);
});
test('새 준비 경로는 기존 백그라운드 고객 발송을 깨우지 않는다',async t=>{
 const f=setup(t),{onRequest}=await import('../functions/api/_middleware.js');let tasks=0;for(const path of ['portal-template','portal-preview','portal-test','portal-check-template'])await onRequest({env:f.env,request:new Request('https://local.test/api/admin/guide-messages/'+path),next:async()=>new Response('ok'),waitUntil:()=>tasks++});assert.equal(tasks,0);assert.equal(f.calls(),0);
});
test('새 미리보기 이후에도 기존 자동 확정 경로는 기존 승인 템플릿과 고정 버튼을 그대로 사용한다',async t=>{
 const f=setup(t);await f.draft(true);f.allow();f.setTemplate({templtCode:'LEGACY-TEST',templtContent:GUIDE_TEMPLATE,buttons:[GUIDE_BUTTON]});const b=await f.api('bookings','POST',{space_id:'megaspot-gundae',customer_name:'가상 기존 방식',phone:'01022223333',date:NEXT,start_h:10,end_h:11,amount:0});assert.equal(f.sent.length,1);assert.equal(f.sent[0].tpl_code,'LEGACY-TEST');assert.equal(JSON.parse(f.sent[0].button_1).button[0].linkMo,GUIDE_URL);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_portal_links WHERE booking_code=?').get(b.booking_code).n,0);const s=await f.api('guide-messages/settings');assert.equal(s.variant,'legacy');assert.equal(s.automatic,true);assert.equal(s.test_delivered,true);
});

test('통합 예약 안내는 등록한 두 번호에 각각 보내며 각 번호의 버튼은 같은 예약만 연다',async t=>{
 const f=setup(t);await f.enable();await f.api('bookings/BK-TEST/contacts','PUT',{phone:'010-1234-5678',phone2:'01033334444'});
 const p=await f.preview();assert.deepEqual(p.items.map(x=>x.phone),['01012345678','01033334444']);
 for(const item of p.items){const v=await f.view(item.button.linkMo);assert.equal(v.status,200);assert.equal(v.json.booking.code,'BK-TEST');}
 const sent=await f.send(p);assert.equal(sent.items.length,2);assert.ok(sent.items.every(x=>x.status==='accepted'));
 assert.deepEqual(f.sent.slice(1).map(x=>x.receiver_1),['01012345678','01033334444']);
 for(const d of f.sent.slice(1)){const button=JSON.parse(d.button_1).button[0];assert.equal((await f.view(button.linkMo)).json.booking.code,'BK-TEST');}
 const raw=JSON.stringify(f.db.prepare("SELECT snapshot FROM booking_guide_messages WHERE mode='live'").all());assert.ok(!raw.includes(new URL(p.items[0].button.linkMo).hash.slice('#booking='.length)));
});
