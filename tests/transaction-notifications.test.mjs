import {CUSTOMER_ALIMTALK} from '../functions/api/_customer_alimtalk_templates.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/parking-fixture.mjs';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {onRequestPost as inquire} from '../functions/api/inquiry.js';
import {transactionNoticeTick} from '../functions/api/_transaction_notifications.js';
import {relayLedger,relayRequest} from '../deploy/aligo-relay/server.mjs';
import {kstToday} from '../functions/api/_lib.js';

const numbers=['01011112222','01033334444'];
function setStaff(db){
 db.prepare("INSERT INTO settings VALUES('parking_admin_alerts',?,datetime('now'))").run(JSON.stringify({enabled:true,phones:numbers}));
}

test('신규 문의·예약 신청을 저장할 때 고객과 관리자별 알림을 함께 기록하고 재적용 시 소급 발송하지 않는다',async t=>{
 const f=payappFixture({booking:false});
 t.after(()=>f.db.close());
 setStaff(f.db);
 const before=f.db.prepare('SELECT COUNT(*) AS n FROM transaction_notifications').get().n;
 for(const reserve of [false,true]){
  const response=await inquire({env:f.env,request:new Request('https://local.test/api/inquiry',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({name:'가상 고객',phone:'010-2345-6789',agree_privacy:true,reserve,date:kstToday(10)})
  })});
  assert.equal(response.status,200);
  const {ref}=await response.json();
  const notices=f.db.prepare('SELECT kind,audience,receiver FROM transaction_notifications WHERE ref=? ORDER BY id').all(ref);
  assert.deepEqual(notices.map(n=>n.kind),Array(3).fill(reserve?'reservation_request':'inquiry'));
  assert.deepEqual(notices.map(n=>[n.audience,n.receiver]),[['customer','010-2345-6789'],...numbers.map(phone=>['admin',phone])]);
 }
 f.db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM transaction_notifications').get().n,before+6);
});

test('검증된 결제 후 일정 확인 보류는 양쪽, 공간 취소와 이용료 환불 완료는 고객에게 각각 한 번 기록한다',async t=>{
 const f=payappFixture();
 t.after(()=>f.db.close());
 setStaff(f.db);
 const pending=f.seed({status:'created'});
 f.db.exec("UPDATE bookings SET status='payment_review' WHERE booking_code='BK-TEST'");
 const approved=await f.form(pending,'4');
 await f.feedback(approved);
 await f.feedback(approved);
 const review=f.db.prepare("SELECT audience FROM transaction_notifications WHERE kind='payment_review' AND ref=? ORDER BY id").all(pending.oid);
 assert.deepEqual(review.map(x=>x.audience),['customer','admin','admin']);
 f.db.exec("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-TEST'; UPDATE bookings SET status='cancelled' WHERE booking_code='BK-TEST'");
 assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM transaction_notifications WHERE kind='booking_cancelled' AND audience='customer'").get().n,1);
 const paid=f.seed();
 const refund=await f.form(paid,'9');
 await f.feedback(refund);
 await f.feedback(refund);
 f.db.exec("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','manual-notice','refund',50000,datetime('now'))");
 const items=f.db.prepare("SELECT audience,amount FROM transaction_notifications WHERE kind='rental_refund' ORDER BY id").all();
 assert.deepEqual(items.map(x=>[x.audience,x.amount]),[['customer',paid.price],['customer',50000]]);
});

test('현재 주차 결제의 1대와 다차량 주문 모두 고객 결제자에게만 부분 환불 이벤트를 한 번 기록한다',async t=>{
 const f=fixture(t);
 setStaff(f.db);
 for(const vehicles of [
  [{plate:'123가4567',plate_confirm:'123가4567',ticket:'1h'}],
  [{plate:'234나5678',plate_confirm:'234나5678',ticket:'1h'},{plate:'345다6789',plate_confirm:'345다6789',ticket:'2h'}]
 ]){
  const p=await f.buy({vehicles});
  await f.feedback(p);
  const refund=f.db.prepare("INSERT OR IGNORE INTO payapp_refunds VALUES(?,?,?,datetime('now'))");
  refund.run('partial-'+p.oid,p.oid,1000);
  refund.run('partial-'+p.oid,p.oid,1000);
  refund.run('full-'+p.oid,p.oid,p.total-1000);
  const rows=f.db.prepare('SELECT audience,kind,amount FROM transaction_notifications WHERE ref=? ORDER BY id').all(p.oid);
  assert.deepEqual(rows.map(x=>[x.audience,x.kind,x.amount]),[['customer','parking_partial_refund',1000]]);
 }
});

test('서명된 릴레이 전송, 관리자 수신자 제한, 중복 잠금과 마스킹된 발송 결과를 검증한다',async t=>{
 const f=payappFixture({booking:false});
 const ledgerDb=new DatabaseSync(':memory:');
 t.after(()=>{f.db.close();ledgerDb.close();});
 const secret='transaction-relay-test-secret-at-least-32';
 Object.assign(f.env,{ALIGO_RELAY_SECRET:secret,ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_LIVE_ENABLED:'true'});
 const relayEnv={ALIGO_RELAY_SECRET:secret,ALIGO_API_KEY:'fixture-key',ALIGO_USERID:'fixture-user',ALIGO_SENDER_KEY:'fixture-profile',ALIGO_SENDER:'01099990000',ALIGO_PARKING_ADMIN_RECEIVERS:numbers[0]};
 const ledger=relayLedger(ledgerDb),recipients=new Map();
 t.mock.method(globalThis,'fetch',async (url,init)=>{
  assert.equal(url,f.env.ALIGO_RELAY_URL);
  return relayRequest(new Request('http://relay.local/v1/aligo',init),relayEnv,ledger,async (providerUrl,options)=>{
   const fields=new URLSearchParams(options.body);
   if(providerUrl.endsWith('/template/list/'))return Response.json({code:0,list:[{templtCode:fields.get('tpl_code'),inspStatus:'REQ',status:'R'}]});
   if(providerUrl.endsWith('/send/')){
    assert.equal(fields.get('msg_type'),'LMS');
    const id=String(recipients.size+1);
    recipients.set(id,fields.get('receiver'));
    return Response.json({result_code:1,msg_id:id,success_cnt:1,error_cnt:0});
   }
   assert.equal(providerUrl,'https://apis.aligo.in/sms_list/');
   return Response.json({result_code:1,list:[{receiver:recipients.get(fields.get('mid')),send_date:'2026-11-08 19:00:00',sms_state:'발송완료'}]});
  });
 });
 setStaff(f.db);
 f.db.exec("INSERT INTO inquiries(ref,space_id,status,name,phone,data,created_at) VALUES('MS-VALID','megaspot-gundae','문의 접수','테스트','01022223333','{}',datetime('now'))");
 f.db.exec("UPDATE transaction_notifications SET status='cancelled' WHERE ref<>'MS-VALID'");
 await Promise.all([transactionNoticeTick(f.env),transactionNoticeTick(f.env)]);
 assert.deepEqual([...recipients.values()],[numbers[0]]);
 f.db.exec("UPDATE transaction_notifications SET updated_at=datetime('now','-1 minute') WHERE status='accepted'");
 await transactionNoticeTick(f.env);
 const url='https://local.test/api/admin/transaction-notifications';
 assert.equal((await f.handle(new Request(url))).status,401);
 const list=await (await f.handle(new Request(url,{headers:{'x-admin-key':f.env.ADMIN_KEY}}))).json();
 const current=list.items.filter(x=>x.ref==='MS-VALID');
 assert.deepEqual(current.map(x=>x.status).sort(),['delivered','failed','queued']);
 assert.ok(current.every(x=>!('receiver' in x)&&!('provider_mid' in x)&&x.receiver_last4.length===4));
});

test('승인된 고객 거래는 알림톡을 먼저 보내고 실패 시 확인된 대체 문자 결과만 기록한다',async t=>{
 const f=payappFixture({booking:false});
 const ledgerDb=new DatabaseSync(':memory:');
 t.after(()=>{f.db.close();ledgerDb.close();});
 const secret='transaction-relay-test-secret-at-least-32';
 Object.assign(f.env,{ALIGO_RELAY_SECRET:secret,ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_LIVE_ENABLED:'true',ALIGO_SENDER_KEY:'fixture-profile'});
 const relayEnv={ALIGO_RELAY_SECRET:secret,ALIGO_API_KEY:'fixture-key',ALIGO_USERID:'fixture-user',ALIGO_SENDER_KEY:f.env.ALIGO_SENDER_KEY,ALIGO_SENDER:'01099990000',ALIGO_PARKING_ADMIN_RECEIVERS:numbers.join(',')};
 const ledger=relayLedger(ledgerDb),customer='01022223333',template=CUSTOMER_ALIMTALK.inquiry;
 let sends=0,lookups=0,smsLookups=0;
 t.mock.method(globalThis,'fetch',async (url,init)=>{
  assert.equal(url,f.env.ALIGO_RELAY_URL);
  return relayRequest(new Request('http://relay.local/v1/aligo',init),relayEnv,ledger,async (providerUrl,options)=>{
   const fields=new URLSearchParams(options.body);
   if(providerUrl.endsWith('/template/list/')){
    lookups++;
    return Response.json({code:0,list:[{templtCode:template.code,inspStatus:'APR',status:'R',senderKey:f.env.ALIGO_SENDER_KEY,templtContent:template.content,buttons:[]}]});
   }
   if(providerUrl.endsWith('/alimtalk/send/')){
    sends++;
    assert.equal(fields.get('receiver_1'),customer);
    assert.equal(fields.get('failover'),'Y');
    assert.match(fields.get('message_1'),/문의번호: MS-ALIM/);
    assert.match(fields.get('fmessage_1'),/MS-ALIM/);
    return Response.json({code:0,info:{mid:'100',scnt:1,fcnt:0}});
   }
   if(providerUrl.endsWith('/history/detail/'))return Response.json({code:0,list:[
    {type:'AT',phone:customer,tpl_code:template.code,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:'2026-11-08 19:00:00',rslt:'U',smid:'200'}
   ]});
   assert.equal(providerUrl,'https://apis.aligo.in/sms_list/');
   smsLookups++;
   return Response.json({result_code:1,list:[{type:'LMS',receiver:customer,send_date:'2026-11-08 19:01:00',sms_state:'발송완료'}]});
  });
 });
 setStaff(f.db);
 f.db.exec("INSERT INTO inquiries(ref,space_id,status,name,phone,data,created_at) VALUES('MS-ALIM','megaspot-gundae','문의 접수','테스트','01022223333','{}',datetime('now'))");
 f.db.exec("UPDATE transaction_notifications SET status='cancelled' WHERE ref<>'MS-ALIM' OR audience='admin'");
 await transactionNoticeTick(f.env);
 assert.equal(f.db.prepare("SELECT provider_mid FROM transaction_notifications WHERE ref='MS-ALIM' AND audience='customer'").get().provider_mid,'at:'+template.code+':100');
 f.db.exec("UPDATE transaction_notifications SET updated_at=datetime('now','-1 minute') WHERE status='accepted'");
 await transactionNoticeTick(f.env);
 const row=f.db.prepare("SELECT status,error FROM transaction_notifications WHERE ref='MS-ALIM' AND audience='customer'").get();
 assert.deepEqual({...row},{status:'delivered',error:'대체 문자 수신 성공'});
 await transactionNoticeTick(f.env);
 assert.deepEqual([sends,lookups,smsLookups],[1,1,1]);
});
