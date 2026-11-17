import test from 'node:test';import assert from 'node:assert/strict';
import {fixture as parkingFixture} from './helpers/parking-fixture.mjs';
import {parkingSign} from '../functions/api/_parking_notifications.js';
import {onRequest} from '../functions/api/parking/[[path]].js';
import {runOffhoursWatch,auditOffhours,offhoursMessage,OFFHOURS_KEY} from '../deploy/amano-server/watch-offhours.mjs';
const SINCE='2026-11-17 06:30:00',AT=Date.parse('2026-11-18T06:15:00+09:00'),secret='offhours-test-only-signature-secret-32-characters';
async function audit(f,{since=SINCE,oid,signed=true}={}){f.env.ALIGO_RELAY_SECRET=secret;const body=JSON.stringify({action:'audit-offhours',since,...(oid?{oid}:{}),time:Date.now()});const r=await onRequest({env:f.env,params:{path:['automation','server']},request:new Request('https://megaspot.test/api/parking/automation/server',{method:'POST',headers:signed?{'X-Megaspot-Signature':await parkingSign(secret,body)}:{},body})});return {status:r.status,body:await r.json()};}
function attach(f,p,entry,{status='applied',updated='2026-11-17 06:30:10'}={}){
 const id=Number(f.db.prepare('INSERT INTO parking_sessions(entry_id,plate,entry_at,created_at) VALUES(?,?,?,?)').run('E'+p.oid,'123가4567',entry,updated).lastInsertRowid);
 f.db.prepare('UPDATE parking_orders SET session_id=?,status=?,updated_at=? WHERE oid=?').run(id,status,updated,p.oid);
}
test('signed offhours audit selects a prepaid order only after a qualifying actual entry, and returns no buyer secrets or writes',async t=>{
 const f=parkingFixture(t),p=await f.buy({date:'2026-11-18'});await f.feedback(p);f.db.prepare('UPDATE orders SET paid_at=? WHERE oid=?').run('2026-11-17 01:00:00',p.oid);
 assert.equal((await audit(f)).body.batch,null);t.mock.method(Date,'now',()=>AT);assert.equal((await audit(f)).body.batch,null);
 attach(f,p,'2026-11-18 06:10',{updated:'2026-11-17 21:10:10'});const before=f.db.prepare('SELECT * FROM parking_orders').all();const r=await audit(f);assert.equal(r.body.batch.oid,p.oid);assert.equal(r.body.batch.items[0].offhours_reason,'오전 10시 이전');assert.deepEqual(f.db.prepare('SELECT * FROM parking_orders').all(),before);
 assert.equal((await audit(f,{oid:p.oid})).body.batch.oid,p.oid);assert.equal((await audit(f,{signed:false})).status,403);for(const s of ['buyer_phone','buyer_name','token_hash','123가4567'])assert.ok(!JSON.stringify(r.body).includes(s));
});
test('holiday entry after 10am qualifies, but an ordinary daytime entry and night-only prepayment do not',async t=>{
 const f=parkingFixture(t),p=await f.buy({date:'2026-11-18'});await f.feedback(p);f.db.prepare('UPDATE orders SET paid_at=? WHERE oid=?').run('2026-11-17 17:00:00',p.oid);t.mock.method(Date,'now',()=>Date.parse('2026-11-18T14:00:00+09:00'));attach(f,p,'2026-11-18 13:00',{updated:'2026-11-18 04:00:10'});assert.equal((await audit(f)).body.batch,null);
 const h=await f.buy({date:'2026-12-25',confirm_extra:true});await f.feedback(h);t.mock.method(Date,'now',()=>Date.parse('2026-12-25T14:00:00+09:00'));attach(f,h,'2026-12-25 13:00',{updated:'2026-12-25 04:00:10'});assert.equal((await audit(f)).body.batch.oid,h.oid);assert.equal((await audit(f)).body.batch.items[0].offhours_reason,'공휴일');
});
test('pre-baseline registrations, unpaid and test orders never become offhours targets',async t=>{
 const f=parkingFixture(t);t.mock.method(Date,'now',()=>Date.parse('2026-11-18T06:00:00+09:00'));const p=await f.buy({date:'2026-11-18'});await f.feedback(p);attach(f,p,'2026-11-18 05:00',{updated:'2026-11-17 20:00:10'});
 assert.equal((await audit(f,{since:'2026-11-17 21:00:00'})).body.batch,null);f.db.prepare('UPDATE orders SET test=1 WHERE oid=?').run(p.oid);assert.equal((await audit(f)).body.batch,null);f.db.prepare("UPDATE orders SET test=0,status='created' WHERE oid=?").run(p.oid);assert.equal((await audit(f)).body.batch,null);
});
test('a failed early-morning registration is eligible even when it failed before claiming an entry',async t=>{
 const f=parkingFixture(t),p=await f.buy({date:'2026-11-18'});await f.feedback(p);t.mock.method(Date,'now',()=>AT);f.db.prepare("UPDATE parking_orders SET status='issue',updated_at='2026-11-17 21:14:00' WHERE oid=?").run(p.oid);const r=await audit(f);assert.equal(r.body.batch.oid,p.oid);assert.match(r.body.batch.items[0].offhours_reason,/이전 등록 확인 필요/);
});
function ready(n=1){
 const phones=['1886','9580'],batch={oid:'MSOFFHOURS',paid_at:'2026-11-17 06:40:00',payment_status:'paid',price:8000*n,items:Array.from({length:n},(_,i)=>({oid:'MSCAR'+i,entry_id:'ENTRY'+i,plate_last4:String(4560+i),visit_date:'2026-11-18',ticket:'2h',hours:2,price:8000,status:'applied',free_hours:1,paid_hours:1,free_external:0,cost:3000,updated_at:'2026-11-17 21:10:12',offhours_reason:'오전 10시 이전',customer_notifications:[{kind:'paid',status:'cancelled'},{kind:'applied',status:'delivered',occurred_at:'2026-11-17 21:10:12'}],admin_payment_sms:phones.map(receiver_last4=>({receiver_last4,status:'delivered'}))}))};
 const operations=Object.fromEntries(batch.items.map(p=>[p.oid,{verification:{entry_id:p.entry_id,date:p.visit_date,free_confirmed:true,free_first_verified:true,free_existing:false,history_ids:['FREE'+p.oid,'PAID'+p.oid],site_status:'applied',cost:p.cost,steps:[{phase:'verified_1'},{phase:'request_6'}],first_checked_at:'2026-11-17T06:40:01Z',entry_at:'2026-11-18T06:10:00',completed_at:'2026-11-17T21:10:12Z'}}]));return {batch,operations};
}
function fixture(){
 const values={},store={read:k=>structuredClone(values[k]||null),save:(k,v)=>values[k]=structuredClone(v)},env={ALIGO_RELAY_SECRET:secret,ALIGO_PARKING_ADMIN_RECEIVERS:'01000001886,01000009580'},sent=[],calls=[],mids={};let data=null,at=AT,delivered=false;
 const site=async(action,args)=>{calls.push({action,args});return {ok:true,batch:data};};
 const upstream=async(url,o)=>{assert.equal(url,'http://127.0.0.1:8787/v1/aligo');const v=JSON.parse(o.body);if(v.path==='sms/detail')return Response.json({result_code:1,list:delivered?[{receiver:mids[v.data.mid],send_date:'2026-11-18 06:16:00',sms_state:'발송완료'}]:[]});assert.equal(v.path,'parking-admin/send');sent.push(v);const mid=String(sent.length);mids[mid]=v.data.receiver;return Response.json({result_code:1,msg_id:mid,success_cnt:1,error_cnt:0});};
 return {store,values,sent,calls,set:x=>{data=x.batch;store.save('operations',x.operations);},run:()=>runOffhoursWatch({env,store,since:SINCE,site,upstream,at}),deliver:()=>{delivered=true;at+=60000;}};
}
test('no qualifying real order stays quiet; a completed target reports once to each admin and stops only after both deliveries',async()=>{
 const f=fixture();await f.run();assert.equal(f.sent.length,0);const r=ready();f.set(r);let s=await f.run();assert.equal(s.phase,'reporting');assert.equal(f.sent.length,2);assert.deepEqual(f.sent.map(x=>x.data.receiver).sort(),['01000001886','01000009580']);for(const x of f.sent){assert.match(x.data.msg,/무료 1시간 먼저/);assert.match(x.data.msg,/고객 등록 안내: 전달 완료/);assert.match(x.data.msg,/관리자 결제 문자: 두 번호 전달 완료/);assert.ok(!x.data.msg.includes('고객 결제 안내: 전달 완료'));}
 await f.run();assert.equal(f.sent.length,2);f.deliver();assert.equal((await f.run()).phase,'completed');const calls=f.calls.length;await f.run();assert.equal(f.calls.length,calls);assert.equal(f.values[OFFHOURS_KEY].target,'MSOFFHOURS');assert.equal(f.values['next-batch-watch'],undefined);assert.equal(f.values['next-payment-immediate-watch'],undefined);assert.ok(f.calls.every(x=>x.action==='audit-offhours'));
});
test('registration proof alone cannot succeed while customer registration or either admin payment notice is unconfirmed',async()=>{
 for(const kind of ['customer','admin']){const x=ready();if(kind==='customer')x.batch.items[0].customer_notifications[1].status='accepted';else x.batch.items[0].admin_payment_sms[0]={receiver_last4:'1886',status:'accepted',occurred_at:'2026-11-17 21:10:12'};assert.equal(auditOffhours(x.batch,x.operations,{},AT).status,'waiting');}
 for(const change of [x=>x.batch.items[0].cost=6000,x=>x.operations.MSCAR0.verification.steps.reverse(),x=>x.batch.items[0].customer_notifications[1].status='failed',x=>x.batch.items[0].offhours_reason='']){const x=ready();change(x);const r=auditOffhours(x.batch,x.operations,{},AT);assert.equal(r.status,'attention');assert.ok(!offhoursMessage(r,true).includes('고객 등록 안내: 전달 완료'));}
});
test('ten-vehicle results stay within relay length and retain each vehicle and exact cost',()=>{
 const x=ready(10),r=auditOffhours(x.batch,x.operations,{},AT);assert.equal(r.status,'verified');const m=offhoursMessage(r,true);assert.ok(m.length<=600);assert.match(m,/끝4569/);assert.match(m,/3,000원/);
});
