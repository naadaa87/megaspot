import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as base} from './helpers/admin-fixture.mjs';
import {DEPOSIT_TEMPLATES as T,DEPOSIT_TEMPLATE_CODES as C} from '../functions/api/_deposit_templates.js';
import {LEGACY_DEPOSIT_PAYMENT_CODE as OLD_CODE,LEGACY_DEPOSIT_PAYMENT_TEMPLATE as OLD_TEMPLATE} from '../functions/api/_deposit_template_legacy.js';
import {depositNoticeTick,depositMessageConfig,depositMessageHash,depositLegacyMessageHash,depositConsoleContext} from '../functions/api/_deposit_notifications.js';
import {now,sha256} from '../functions/api/_lib.js';
import {parkingSign} from '../functions/api/_parking_notifications.js';
import {onRequest as depositCron} from '../functions/api/deposit-notifications/[[path]].js';

async function setup(t){
 t.mock.method(Date,'now',()=>Date.parse('2026-11-16T12:00:00+09:00'));
 const f=base({booking:true,date:'2026-12-06'});t.after(()=>f.db.close());
 Object.assign(f.env,{ALIGO_LIVE_ENABLED:'true',ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'local-only-deposit-migration-secret-32',ALIGO_SENDER_KEY:'test-profile',ALIGO_SENDER:'01000000000',DEPOSIT_ACCOUNT_KEY:'cd'.repeat(32)});
 const oldCodes={...C,payment:OLD_CODE},legacyHash=await depositLegacyMessageHash(f.env,{codes:oldCodes});
 const saved={enabled:true,types:{payment:true,account:true,refunded:true},codes:oldCodes,hash:legacyHash};
 const put=s=>f.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('deposit_alimtalk',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(JSON.stringify(s),now());
 put(saved);
 let serial=0,review='APR';const sent=[],history=new Map(),queries=[];
 const prove=(kind,hash=legacyHash,status='delivered')=>f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode,status,config_hash) VALUES('TEST',?,?,?,'{}','test',?,?)").run(kind,'proof:'+kind+':'+(++serial),now(),status,hash);
 for(const kind of Object.keys(T))prove(kind);
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  assert.equal(url,f.env.ALIGO_RELAY_URL);const {path,data:d}=JSON.parse(opts.body);
  if(path==='template/list'){
   const kind=Object.keys(C).find(k=>C[k]===d.tpl_code),value=d.tpl_code===OLD_CODE?OLD_TEMPLATE:T[kind];
   return Response.json({code:0,list:value?[{templtCode:d.tpl_code,inspStatus:review,status:'A',templtContent:value.content,buttons:value.buttons}]:[]});
  }
  if(path==='alimtalk/send'){
   sent.push(d);const mid=String(100+sent.length);
   history.set(mid,{type:'AT',phone:d.receiver_1,tpl_code:d.tpl_code,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:now(),rslt:'0',msgid:'123'});
   return Response.json({code:0,info:{mid,scnt:1,fcnt:0}});
  }
  if(path==='history/detail'){queries.push(d.mid);return Response.json({code:0,list:history.has(d.mid)?[history.get(d.mid)]:[]});}
  assert.fail('Unexpected mocked operation '+path);
 });
 const tick=async(send=true)=>{f.db.exec('DELETE FROM deposit_notification_lease');return depositNoticeTick(f.env,send);};
 function booking(code,{paid=false,refunded=false}={}){
  if(paid)f.db.prepare('INSERT INTO booking_deposit_checks VALUES(?,1,?)').run(code,now());
  f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,start_h,end_h,created_at) VALUES(?,'megaspot-gundae','시험 고객','01099998888','8888','2026-12-06','confirmed',10,17,?)").run(code,now());
  if(refunded){f.db.prepare('INSERT INTO booking_refunds(booking_code,amount,created_at,updated_at) VALUES(?,150000,?,?)').run(code,now(),now());f.db.prepare("UPDATE booking_refunds SET state='completed',paid_amount=150000,deduction=0,completion_id='completed',completed_at=? WHERE booking_code=?").run(now(),code);}
 }
 return {...f,legacyHash,saved,put,prove,tick,booking,sent,history,queries,setReview:value=>{review=value;},api:(path='',method='GET',data,status=200)=>f.api('deposit-notifications'+path,method,data,status)};
}

test('기존 입금 템플릿 지문은 고정하고 저장된 UN_2759만 새 기본 코드로 해석하며 설정은 수정하지 않음',async t=>{
 const f=await setup(t),before=f.db.prepare("SELECT value FROM settings WHERE key='deposit_alimtalk'").get().value;
 assert.ok(Object.isFrozen(OLD_TEMPLATE));assert.ok(Object.isFrozen(OLD_TEMPLATE.buttons));assert.match(OLD_TEMPLATE.content,/하나은행 298-910064-39104/);
 assert.equal(await sha256(JSON.stringify(OLD_TEMPLATE)),'9503ccb0b6bef29f714f5d37576d072dc83d80a4f956997dc059820030274ebe');
 assert.notEqual(C.payment,OLD_CODE);assert.match(T.payment.content,/기업은행 064-179058-04018/);assert.match(T.payment.content,/주식회사 지유공간개발/);
 const cfg=await depositMessageConfig(f.env);assert.equal(cfg.codes.payment,C.payment);assert.equal(cfg.codes.account,C.account);assert.equal(cfg.codes.refunded,C.refunded);
 assert.notEqual(await depositMessageHash(f.env,cfg),f.legacyHash);
 assert.equal(f.db.prepare("SELECT value FROM settings WHERE key='deposit_alimtalk'").get().value,before);
 f.put({...f.saved,codes:{...f.saved.codes,payment:'UN_CUSTOM'}});assert.equal((await depositMessageConfig(f.env)).codes.payment,'UN_CUSTOM');
});

test('입금 안내 변경은 기존 환급 계좌·환급 완료의 시험 증명을 유지하고 이전 입금 시험은 인정하지 않음',async t=>{
 const f=await setup(t),out=await f.api(),context=await depositConsoleContext(f.env,'BK-TEST');
 assert.deepEqual(out.tested,{payment:false,account:true,refunded:true});assert.deepEqual(context.ready,{payment:false,account:true,refunded:true});
 await f.api('/settings','PUT',{...f.saved,codes:C},409);
});

test('새 입금 시험은 실제 도착 결과와 새 설정 지문이 모두 있어야 유효',async t=>{
 const f=await setup(t),cfg=await depositMessageConfig(f.env),hash=await depositMessageHash(f.env,cfg);
 f.prove('payment',hash,'accepted');assert.equal((await f.api()).tested.payment,false);
 f.prove('payment',hash);assert.equal((await f.api()).tested.payment,true);
 assert.equal((await depositConsoleContext(f.env,'BK-TEST')).ready.payment,true);
});

test('미검증 입금 대기가 여러 건이어도 계좌 요청·환급 완료는 발송하며 대기와 기존 설정을 보존',async t=>{
 const f=await setup(t);for(let i=0;i<4;i++)f.booking('BK-PAY-'+i);f.booking('BK-ACCOUNT',{paid:true});f.booking('BK-REFUND',{refunded:true});
 const before=f.db.prepare("SELECT value FROM settings WHERE key='deposit_alimtalk'").get().value;
 assert.equal((await f.tick()).enabled,true);assert.deepEqual(f.sent.map(x=>x.tpl_code).sort(),[C.account,C.refunded].sort());
 const payment=f.db.prepare("SELECT status FROM deposit_notifications WHERE mode='live' AND kind='payment'").all();assert.equal(payment.length,5);assert.ok(payment.every(x=>x.status==='queued'));
 assert.equal(f.db.prepare("SELECT value FROM settings WHERE key='deposit_alimtalk'").get().value,before);
 await f.tick(false);assert.equal(f.sent.length,2);
});

test('기존 입금 대기는 새 지문의 시험 수신과 승인 후 새 은행으로 한 번만 발송하며 이전 은행은 포함하지 않음',async t=>{
 const f=await setup(t);f.booking('BK-WAIT');await f.tick();assert.equal(f.sent.length,0);
 const hash=await depositMessageHash(f.env,await depositMessageConfig(f.env));f.prove('payment',hash);f.setReview('REQ');await f.tick();assert.equal(f.sent.length,0);
 f.setReview('APR');await f.tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].tpl_code,C.payment);
 assert.match(f.sent[0].message_1,/기업은행 064-179058-04018/);assert.match(f.sent[0].message_1,/주식회사 지유공간개발/);assert.doesNotMatch(f.sent[0].message_1,/하나은행|298-910064-39104|블랭크/);
 assert.match(f.sent[0].fmessage_1,/기업은행 064-179058-04018/);await f.tick();assert.equal(f.sent.length,1);
});

for(const status of ['accepted','unknown'])test('변경 전 입금 '+status+' 결과는 이전 UN_2759 코드로 확인하고 재발송하지 않음',async t=>{
 const f=await setup(t),mid='501';
 f.history.set(mid,{type:'AT',phone:'01011112222',tpl_code:OLD_CODE,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:now(),rslt:'0',msgid:'123'});
 f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode,status,config_hash,provider_mid,phone_hash) VALUES('TEST','payment',?,?,'{}','test',?,?,?,?)").run('old-result:'+status,now(),status,f.legacyHash,mid,await sha256('01011112222'));
 await f.tick(false);assert.equal(f.db.prepare('SELECT status FROM deposit_notifications WHERE event_key=?').get('old-result:'+status).status,'delivered');
 assert.deepEqual(f.queries,[mid]);assert.equal(f.sent.length,0);assert.equal((await f.api()).tested.payment,false);
});

test('변경 전 계좌·환급 완료 접수의 조회도 유지하며 재발송하지 않음',async t=>{
 const f=await setup(t);let id=600;
 for(const kind of ['account','refunded']){
  const mid=String(++id);f.history.set(mid,{type:'AT',phone:'01011112222',tpl_code:C[kind],senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:now(),rslt:'0',msgid:'123'});
  f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode,status,config_hash,provider_mid,phone_hash) VALUES('TEST',?,?,?,'{}','test','accepted',?,?,?)").run(kind,'old-result:'+kind,now(),f.legacyHash,mid,await sha256('01011112222'));
 }
 await f.tick(false);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM deposit_notifications WHERE event_key LIKE 'old-result:%' AND status='delivered'").get().n,2);assert.equal(f.sent.length,0);
});

for(const field of ['tpl_code','senderKey','phone'])test('이전 입금 결과 조회는 '+field+' 불일치 응답을 확정 결과로 적용하지 않음',async t=>{
 const f=await setup(t),mid='701';
 f.history.set(mid,{type:'AT',phone:'01011112222',tpl_code:OLD_CODE,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:now(),rslt:'0',msgid:'123',[field]:field==='phone'?'01033334444':'mismatched-value'});
 f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode,status,config_hash,provider_mid,phone_hash) VALUES('TEST','payment','wrong-result',?,'{}','test','accepted',?,?,?)").run(now(),f.legacyHash,mid,await sha256('01011112222'));
 await f.tick(false);assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE event_key='wrong-result'").get().status,'accepted');assert.equal(f.sent.length,0);
});

for(const key of ['ALIGO_RELAY_SECRET','ALIGO_SENDER_KEY','ALIGO_SENDER','DEPOSIT_ACCOUNT_KEY'])test('기존 지문 호환도 '+key+' 변경을 허용하지 않음',async t=>{
 const f=await setup(t);f.env[key]=key==='DEPOSIT_ACCOUNT_KEY'?'ef'.repeat(32):f.env[key]+'changed';
 assert.deepEqual((await f.api()).tested,{payment:false,account:false,refunded:false});assert.deepEqual((await depositConsoleContext(f.env,'BK-TEST')).ready,{payment:false,account:false,refunded:false});
});

test('환급 계좌 템플릿 코드가 변경되면 이전 통합 시험 지문을 우회해서 인정하지 않음',async t=>{
 const f=await setup(t);f.put({...f.saved,codes:{...f.saved.codes,account:'UN_CHANGED_ACCOUNT'}});
 assert.deepEqual((await f.api()).tested,{payment:false,account:false,refunded:false});assert.deepEqual((await depositConsoleContext(f.env,'BK-TEST')).ready,{payment:false,account:false,refunded:false});
});

test('환급 완료 본문이 변경되면 기존 시험을 새 본문에 대한 증명으로 인정하지 않음',async t=>{
 const f=await setup(t),previous=T.refunded;T.refunded={...previous,content:previous.content+'\n변경된 안내'};t.after(()=>{T.refunded=previous;});
 assert.deepEqual((await f.api()).tested,{payment:false,account:false,refunded:false});assert.deepEqual((await depositConsoleContext(f.env,'BK-TEST')).ready,{payment:false,account:false,refunded:false});
});

test('서명된 상태 조회는 종류별 설정·시험·발송 준비 상태만 반환하고 외부 요청·DB 쓰기·고객 노출이 없음',async t=>{
 const f=await setup(t);f.booking('BK-PENDING');
 t.mock.method(globalThis,'fetch',async()=>assert.fail('Read-only status must not contact the provider'));
 const changes=()=>f.db.prepare('SELECT total_changes() AS n').get().n,before=changes();
 const call=async signature=>{
  const body=JSON.stringify({time:Date.now()});
  return depositCron({env:f.env,params:{path:['status']},request:new Request('https://local.test/api/deposit-notifications/status',{method:'POST',body,headers:signature===false?{}:{'X-Megaspot-Signature':await parkingSign(f.env.ALIGO_RELAY_SECRET,body)}})});
 };
 assert.equal((await call(false)).status,403);
 const response=await call(true);assert.equal(response.status,200);const data=await response.json();
 assert.equal(data.enabled,true);assert.equal(data.live_allowed,true);assert.equal(data.settings_match,true);assert.deepEqual(data.codes,C);
 assert.deepEqual(data.tested,{payment:false,account:true,refunded:true});assert.deepEqual(data.ready,{payment:false,account:true,refunded:true});
 assert.equal(data.payment_schedule,'on_confirmation');assert.equal(data.send_hours,'09:00–21:00');
 const raw=JSON.stringify(data),currentHash=await depositMessageHash(f.env,await depositMessageConfig(f.env));
 for(const secret of [f.legacyHash,currentHash,f.env.ALIGO_RELAY_SECRET,f.env.ALIGO_SENDER_KEY,f.env.ALIGO_SENDER,f.env.DEPOSIT_ACCOUNT_KEY,'검증 고객','BK-PENDING','BK-TEST'])assert.equal(raw.includes(secret),false);
 f.env.ALIGO_LIVE_ENABLED='false';const stopped=await(await call(true)).json();assert.equal(stopped.enabled,true);assert.deepEqual(stopped.ready,{payment:false,account:false,refunded:false});
 assert.equal(changes(),before);assert.equal(f.sent.length,0);assert.equal(f.queries.length,0);
});
