import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/parking-fixture.mjs';
import {onRequest} from '../functions/api/parking/[[path]].js';
import {parkingSign,parkingNoticeObsolete} from '../functions/api/_parking_notifications.js';
import receipt from '../assets/js/pages/parking-receipt.js';
import view from '../assets/js/pages/admin-parking-view.js';
import {auditPayment} from '../deploy/amano-server/watch-next-payment.mjs';
async function setup(t,{claimed=false}={}){const f=fixture(t),p=await f.buy();await f.feedback(p);if(claimed)await f.claim(p);await f.admin('orders/'+p.oid+'/issue',{memo:'원래 확인 필요 사유'});const row=()=>f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(p.oid);const input=()=>({resolution_type:'exited',resolution_memo:'등록 전 출차 확인, 고객과 처리 안내 완료',confirm_resolved:true,expected_status:row().status,expected_updated_at:row().updated_at});const resolve=(extra={})=>f.admin('orders/'+p.oid+'/resolve',{...input(),...extra});return{...f,p,row,input,resolve};}
test('관리자 확인 완료는 양쪽 알림 집계에서 빠지고 처리 완료·전체 기록에 남는다',async t=>{
 const f=await setup(t);assert.equal((await(await f.admin('count')).json()).count,1);assert.equal((await(await f.admin('payment-alerts')).json()).count,1);
 assert.equal((await f.resolve()).status,200);assert.equal(f.row().status,'resolved');assert.equal((await(await f.admin('count')).json()).count,0);assert.equal((await(await f.admin('payment-alerts')).json()).count,0);
 assert.equal((await(await f.admin('orders?filter=queue')).json()).items.length,0);assert.equal((await(await f.admin('orders?filter=arrived')).json()).items.length,0);assert.equal((await(await f.admin('orders?filter=applied')).json()).items[0].status,'resolved');
 assert.equal((await(await f.admin('orders?filter=all')).json()).items.length,1);
});
test('등록 이력·무료 예약·차감·결제·환불은 유지하고 원래 메모와 확인 사유를 감사 기록에 보존한다',async t=>{
 const f=await setup(t,{claimed:true}),old=f.row(),session=f.db.prepare('SELECT * FROM parking_sessions').get();const before=JSON.stringify(f.db.prepare('SELECT * FROM orders').all());
 assert.equal((await f.resolve({resolution_type:'manual_registered'})).status,200);const after=f.row();for(const key of ['session_id','free_hours','paid_hours','cost','applied_at'])assert.equal(after[key],old[key]);assert.deepEqual(f.db.prepare('SELECT * FROM parking_sessions').get(),session);assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM orders').all()),before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payapp_refunds').get().n,0);
 assert.match(after.memo,/원래 확인 필요 사유/);assert.match(after.memo,/아마노 수동 등록 완료/);const event=f.db.prepare("SELECT * FROM event_log WHERE kind='parking.resolved'").get(),detail=JSON.parse(event.detail);assert.equal(detail.previous.memo,old.memo);assert.equal(detail.previous.status,'issue');assert.equal(detail.type,'manual_registered');assert.equal(event.actor,'admin');
});
test('유형·선택 사유 형식·확인 체크·화면 상태·관리자 인증·동일 출처를 검증한다',async t=>{
 const f=await setup(t);for(const invalid of [{resolution_type:'constructor'},{resolution_type:'invalid'},{resolution_memo:'x'.repeat(501)},{resolution_memo:123},{resolution_memo:{}},{confirm_resolved:false},{expected_status:'waiting'},{expected_updated_at:'old'}])assert.ok((await f.resolve(invalid)).status>=400);
 const path='admin/orders/'+f.p.oid+'/resolve';assert.equal((await f.call(path,'POST',f.input(),null,false)).status,401);assert.equal((await f.call(path,'POST',f.input(),null,true,'https://evil.test')).status,403);assert.equal(f.row().status,'issue');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='parking.resolved'").get().n,0);
});
test('실제 등록 처리 중에는 확인 완료로 바꾸지 않고 취소 문의는 먼저 검토한다',async t=>{
 const f=fixture(t),p=await f.buy();await f.feedback(p);await f.claim(p);const base={resolution_type:'other',resolution_memo:'처리 확인',confirm_resolved:true};assert.equal((await f.admin('orders/'+p.oid+'/resolve',base)).status,409);assert.equal((await f.get(p)).status,'processing');
 await f.admin('orders/'+p.oid+'/issue',{memo:'결과 확인 필요'});await f.call('orders/'+p.oid+'/cancel-request','POST',{reason:'고객 취소 문의'},p.key);const current=()=>f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(p.oid);let row=current();assert.equal((await f.admin('orders/'+p.oid+'/resolve',{...base,expected_status:row.status,expected_updated_at:row.updated_at})).status,409);
 await f.admin('orders/'+p.oid+'/refund-reviewed',{memo:'고객 안내 및 정산 내용 확인 완료',decision:'keep',confirm_keep:true});row=current();assert.equal((await f.admin('orders/'+p.oid+'/resolve',{...base,expected_status:row.status,expected_updated_at:row.updated_at})).status,200);
});
test('반복·동시 확인 완료는 감사 이벤트와 확인 이력을 한 번만 기록한다',async t=>{
 const f=await setup(t),input=f.input();const responses=await Promise.all([f.admin('orders/'+f.p.oid+'/resolve',input),f.admin('orders/'+f.p.oid+'/resolve',input)]);assert.ok(responses.some(r=>r.status===200));assert.equal((await f.resolve()).status,200);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='parking.resolved'").get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM admin_parking_payment_reads').get().n,1);assert.equal((f.row().memo.match(/관리자 확인 완료/g)||[]).length,1);
});
test('읽기 이후 등록 상태가 바뀌면 트랜잭션은 기록·알림을 함께 건드리지 않는다',async t=>{
 const f=await setup(t),original=f.env.DB.batch;f.env.DB.batch=async stmts=>{f.db.prepare("UPDATE parking_orders SET status='processing' WHERE oid=?").run(f.p.oid);return original(stmts);};
 assert.equal((await f.resolve()).status,409);assert.equal(f.row().status,'processing');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='parking.resolved'").get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM admin_parking_payment_reads').get().n,0);
});
test('실제 등록 성공 알림을 새로 만들지 않고 오래된 대기 안내만 취소한다',async t=>{
 const f=await setup(t);f.db.prepare("INSERT INTO parking_notifications(oid,kind,event_key,status,mode,occurred_at) VALUES(?,'issue','waiting-issue','queued','live','2026-11-03 05:00:00')").run(f.p.oid);f.db.prepare("INSERT INTO parking_admin_sms(oid,receiver,event_key,mode,status,config_hash,occurred_at) VALUES(?,'01000001886','queued-admin','live','queued','test','2026-11-03 05:00:00')").run(f.p.oid);
 await f.resolve();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_notifications WHERE kind='applied'").get().n,0);assert.equal(f.db.prepare("SELECT status FROM parking_notifications WHERE event_key='waiting-issue'").get().status,'cancelled');assert.equal(f.db.prepare("SELECT status FROM parking_admin_sms WHERE event_key='queued-admin'").get().status,'cancelled');
 const p=await f.get(f.p);assert.equal(receipt.state(p).label,'관리자 확인 완료');assert.equal(receipt.needsRefresh(p),false);assert.equal(p.applied_at,null);assert.ok(!JSON.stringify(p).includes('고객과 처리 안내'));assert.equal(parkingNoticeObsolete(p,{kind:'arrival_received',occurred_at:'2026-11-03 05:00:00'}),true);
});
test('확인 완료 주문은 서명된 자동 등록 큐에서 제외되며 복구·재배정도 거절된다',async t=>{
 const f=await setup(t);await f.resolve();f.env.ALIGO_RELAY_SECRET='test-only-resolution-secret-32-characters';const body=JSON.stringify({action:'orders',time:Date.now()});const r=await onRequest({env:f.env,params:{path:['automation','server']},request:new Request('https://megaspot.test/api/parking/automation/server',{method:'POST',headers:{'X-Megaspot-Signature':await parkingSign(f.env.ALIGO_RELAY_SECRET,body)},body})});assert.equal((await r.json()).items.length,0);assert.equal((await f.claim(f.p)).status,409);assert.equal((await f.admin('orders/'+f.p.oid+'/reset',{confirm_not_applied:true,memo:'다시 시도'})).status,400);
});
test('고객이 나중에 새 취소 문의를 접수하면 다시 처리 대상에 잡힌다',async t=>{
 const f=await setup(t);await f.resolve();await f.call('orders/'+f.p.oid+'/cancel-request','POST',{reason:'환불 상담 요청'},f.p.key);assert.equal((await(await f.admin('count')).json()).count,1);assert.equal(receipt.state(await f.get(f.p)).key,'cancel');assert.equal(receipt.needsRefresh(await f.get(f.p)),true);
});
test('여러 차량 결제 중 한 대만 확인하면 다른 차량의 상태·알림은 유지한다',async t=>{
 const f=fixture(t),p=await f.buy({vehicles:[{plate:'123가4567',plate_confirm:'123가4567',ticket:'1h'},{plate:'234나5678',plate_confirm:'234나5678',ticket:'2h'}]});await f.feedback(p);const rows=f.db.prepare('SELECT * FROM parking_orders ORDER BY plate').all(),target=rows[0];
 const data={resolution_type:'exited',resolution_memo:'첫 차량 출차 및 고객 안내 확인',confirm_resolved:true,expected_status:target.status,expected_updated_at:target.updated_at};assert.equal((await f.admin('orders/'+target.oid+'/resolve',data)).status,200);assert.equal((await(await f.admin('count')).json()).count,1);assert.equal((await(await f.admin('payment-alerts')).json()).count,1);assert.equal(f.db.prepare('SELECT status FROM parking_orders WHERE oid=?').get(rows[1].oid).status,'waiting');const list=await(await f.admin('orders?filter=queue')).json();assert.equal(list.items.length,2);assert.equal(list.matched_count,1);const html=view.render(list.items,()=>'',{});assert.ok(html.includes('관리자 확인 완료'));assert.ok(html.includes('처리 완료'));
});
test('수동 확인 건은 자동 등록 성공 검증으로 오인하지 않고 종료할 결과로 분류한다',()=>{
 const result=auditPayment({oid:'MSPAID',price:4000,paid_at:'2026-11-03 05:00:00',payment_status:'paid',items:[{oid:'MSCAR',price:4000,visit_date:'2026-11-03',status:'resolved',customer_notifications:[],admin_payment_sms:[]}]},{},{},Date.parse('2026-11-03T06:00:00Z'));assert.equal(result.status,'attention');assert.equal(result.pending,false);assert.ok(result.problems.some(s=>s.includes('관리자 확인 완료')));
});
test('감사 기록 저장 실패 시 확인 완료와 읽음 처리도 함께 롤백한다',async t=>{
 const f=await setup(t),before=f.row();f.db.exec("CREATE TRIGGER reject_resolution BEFORE INSERT ON event_log WHEN NEW.kind='parking.resolved' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");assert.equal((await f.resolve()).status,500);assert.deepEqual(f.row(),before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM admin_parking_payment_reads').get().n,0);
});
test('환불된 건의 관리자 확인 완료는 환불 원장과 고객의 환불 상태를 보존한다',async t=>{
 const f=await setup(t);await f.feedback(f.p,'9');const before=f.db.prepare('SELECT * FROM payapp_refunds').all();assert.equal((await f.resolve()).status,200);assert.deepEqual(f.db.prepare('SELECT * FROM payapp_refunds').all(),before);assert.equal((await f.get(f.p)).payment_status,'refunded');assert.equal(receipt.state(await f.get(f.p)).label,'환불 완료');assert.equal((await f.get(f.p)).status,'resolved');
});
test('사유 없이도 처리 구분·확인 체크로 저장하고 감사 기록·알림 집계는 유지한다',async t=>{
 for(const reason of [undefined,null,'','   '])await t.test(String(reason),async t=>{
  const f=await setup(t),before=f.row(),payments=f.db.prepare('SELECT * FROM orders').all();assert.equal((await f.resolve({resolution_memo:reason})).status,200);assert.equal(f.row().status,'resolved');assert.equal((await(await f.admin('count')).json()).count,0);assert.equal((await(await f.admin('payment-alerts')).json()).count,0);
  const event=f.db.prepare("SELECT detail FROM event_log WHERE kind='parking.resolved'").get(),detail=JSON.parse(event.detail);assert.equal(detail.reason,'');assert.equal(detail.type,'exited');assert.match(f.row().memo,/원래 확인 필요 사유/);assert.ok(f.row().memo.endsWith('[관리자 확인 완료 · 등록 전 출차 · 처리 확인]'));assert.deepEqual(f.db.prepare('SELECT * FROM orders').all(),payments);for(const k of ['session_id','free_hours','paid_hours','cost','applied_at'])assert.equal(f.row()[k],before[k]);
 });
});
