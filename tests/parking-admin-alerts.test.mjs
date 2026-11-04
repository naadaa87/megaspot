import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {parkingAdminSMSTick,adminPaymentMessage} from '../functions/api/_parking_admin_alerts.js';
import {onRequest} from '../functions/api/parking/[[path]].js';
const phones=['01011112222','01033334444'];
function fixture(t){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
 const DB={prepare(sql){const st=db.prepare(sql);let a=[];return {bind(...v){a=v;return this;},async first(){return st.get(...a)||null;},async all(){return {results:st.all(...a)};},async run(){return {meta:{changes:Number(st.run(...a).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const r=await Promise.all(stmts.map(s=>s.run()));db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,ADMIN_KEY:'test-admin',ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'test-relay-secret-with-32-characters'};
 const sent=[];let fail=false,delivered=false,seq=100;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  assert.equal(url,env.ALIGO_RELAY_URL);const v=JSON.parse(opts.body);
  if(v.path==='parking-admin/status')return Response.json({ready:true,receivers:phones});
  if(v.path==='sms/detail')return Response.json({result_code:1,list:delivered?[{receiver:phones[Number(v.data.mid)%2],sms_state:'발송완료',send_date:'2026-11-04 16:00:00'}]:[]});
  assert.equal(v.path,'parking-admin/send');sent.push(v);if(fail)throw Error('network timeout');return Response.json({result_code:1,msg_id:seq++,success_cnt:1,error_cnt:0});
 });
 async function api(path='',method='GET',body,auth=true,origin='https://megaspot.test'){
  const response=await onRequest({env,params:{path:('admin/payment-alerts'+path).split('/')},request:new Request('https://megaspot.test/api/parking/admin/payment-alerts'+path,{method,headers:{origin,'Content-Type':'application/json',...(auth?{'x-admin-key':'test-admin'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
  return {status:response.status,body:await response.json()};
 }
 function order(oid,extra={}){db.prepare("INSERT INTO orders(oid,product_id,title,price,buyer_name,buyer_phone,data,status,test,created_at) VALUES(?,'parking-1h','주차권',4000,'테스트','01099998888','{}','created',?,datetime('now'))").run(oid,extra.test||0);if(!extra.other)db.prepare("INSERT INTO parking_orders(oid,plate,visit_date,ticket,hours,token_hash,created_at,updated_at) VALUES(?,'123가4567','2026-11-04','1h',1,'hash',datetime('now'),datetime('now'))").run(oid);}
 function paid(oid){db.prepare("UPDATE orders SET status='paid',paid_at=datetime('now') WHERE oid=?").run(oid);}
 function enabled(value=true){db.prepare("UPDATE settings SET value=json_set(value,'$.enabled',?) WHERE key='parking_admin_alerts'").run(value?1:0);}
 return {db,env,api,order,paid,enabled,sent,fail:()=>fail=true,delivered:()=>delivered=true};
}
test('관리자 인증·동일 출처 요청만 결제 알림 확인 가능',async t=>{
 const f=fixture(t);assert.equal((await f.api('', 'GET',undefined,false)).status,401);assert.equal((await f.api('/settings','PUT',{phones,enabled:false},true,'https://evil.test')).status,403);
});
test('수신 번호는 서버 허용 목록·번호별 시험 도착 확인 후에만 운영 활성화',async t=>{
 const f=fixture(t);assert.equal((await f.api('/settings','PUT',{phones:['01055556666'],enabled:false})).status,409);
 assert.equal((await f.api('/settings','PUT',{phones,enabled:false})).status,200);assert.equal((await f.api('/settings','PUT',{phones,enabled:true})).status,409);
 await f.api('/test','POST',{confirm_test:true});assert.equal(f.sent.length,2);assert.ok(f.sent.every(x=>x.data.msg.includes('실제 결제나 아마노 등록은 발생하지 않았습니다.')));
 f.delivered();f.db.prepare("UPDATE parking_admin_sms SET updated_at=datetime('now','-20 seconds')").run();await parkingAdminSMSTick(f.env);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_admin_sms WHERE status='delivered'").get().n,2);
 assert.equal((await f.api('/settings','PUT',{phones,enabled:true})).status,200);
});
test('새 실제 주차 결제만 번호별 한 번 큐잉하며 과거·테스트·다른 상품 결제는 발송하지 않는다',async t=>{
 const f=fixture(t);f.order('MSOLD');f.paid('MSOLD');await f.api('/settings','PUT',{phones,enabled:false});f.enabled();
 f.order('MSNEW');f.paid('MSNEW');f.paid('MSNEW');f.order('MSTEST',{test:1});f.paid('MSTEST');f.order('MSOTHER',{other:true});f.paid('MSOTHER');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM parking_admin_sms').get().n,2);
 await Promise.all([parkingAdminSMSTick(f.env),parkingAdminSMSTick(f.env)]);assert.equal(f.sent.length,2);assert.deepEqual(f.sent.map(x=>x.data.receiver).sort(),phones);
 assert.ok(f.sent.every(x=>x.data.msg.includes('MSNEW')&&x.data.msg.includes('아마노 등록 전입니다.')&&!x.data.msg.includes('01099998888')));
 await parkingAdminSMSTick(f.env);assert.equal(f.sent.length,2);
});
test('결과 불명은 자동 재발송하지 않으며 환불된 결제 대기는 보내지 않는다',async t=>{
 const f=fixture(t);await f.api('/settings','PUT',{phones,enabled:false});f.enabled();f.order('MSTIMEOUT');f.paid('MSTIMEOUT');f.fail();await parkingAdminSMSTick(f.env);await parkingAdminSMSTick(f.env);assert.equal(f.sent.length,2);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_admin_sms WHERE status='unknown'").get().n,2);
 f.order('MSREFUND');f.paid('MSREFUND');f.db.prepare("UPDATE orders SET status='refunded' WHERE oid='MSREFUND'").run();await parkingAdminSMSTick(f.env);assert.equal(f.sent.length,2);
});
test('화면 알림은 결제 완료만 표시하고 확인 상태를 유지하며 미결제·환불은 제외',async t=>{
 const f=fixture(t);f.order('MSPAID');f.paid('MSPAID');f.order('MSUNPAID');f.order('MSREFUND');f.paid('MSREFUND');f.db.prepare("UPDATE orders SET status='refunded' WHERE oid='MSREFUND'").run();
 let r=await f.api();assert.equal(r.body.count,1);assert.equal(r.body.items[0].oid,'MSPAID');assert.ok(!JSON.stringify(r.body.items).includes('01099998888'));
 assert.equal((await f.api('/MSPAID/read','POST',{})).status,200);assert.equal((await f.api('/MSPAID/read','POST',{})).status,200);assert.equal((await f.api()).body.count,0);assert.equal((await f.api('/MSUNPAID/read','POST',{})).status,404);
});
