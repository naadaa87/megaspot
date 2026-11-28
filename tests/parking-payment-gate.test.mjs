// 주차권: "결제 완료"가 아니면 아마노(주차 시스템)에 등록하지 않는다 (2026-11-28 점검)
//  · 페이앱 통보 → 사이트 주문 상태 → 서버 자동 등록 API → 등록 서버(worker.mjs)까지 실제 코드로 잇고,
//    아마노만 가짜로 두어 "등록 요청이 실제로 나갔는지"를 셉니다.
//  · 결제요청(1)·결제대기(10)·요청취소(8·16·31·32)·승인취소(9·64)·부분취소(70·71)는 어떤 순서로 와도 등록하지 않습니다.
//  · 선점 뒤 등록 직전에 취소돼도 등록을 보내지 않고, 고객 취소 문의는 "결제 유지"로 확인한 경우에만 다시 등록 대상이 됩니다.
//   node --test tests/parking-payment-gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/parking-fixture.mjs';
import {onRequest} from '../functions/api/parking/[[path]].js';
import {onRequest as adminApi} from '../functions/api/admin/[[path]].js';
import {parkingSign} from '../functions/api/_parking_notifications.js';
import {runCycle} from '../deploy/amano-server/worker.mjs';
import {DISCOUNTS} from '../deploy/amano-server/client.mjs';
import {kstStamp} from '../functions/api/_payapp.js';
import {sha256} from '../functions/api/_lib.js';
import view from '../assets/js/pages/admin-parking-view.js';

const SECRET='parking-payment-gate-secret-over-32-chars';

// 실제 사이트 + 실제 등록 서버 + 가짜 아마노
function setup(t){
 const f=fixture(t);f.env.ALIGO_RELAY_SECRET=SECRET;
 const payapp=globalThis.fetch;let wakes=0;
 t.mock.method(globalThis,'fetch',async(url,o)=>String(url).startsWith('https://relay.naranhistory.com/')?(wakes++,Response.json({ok:true,accepted:true})):payapp(url,o));
 const hooks={afterSite:{},beforeRegister:null};
 const site=async(action,extra={})=>{
  const body=JSON.stringify({action,time:Date.now(),...extra});
  const r=await onRequest({env:f.env,params:{path:['automation','server']},request:new Request('https://megaspot.test/api/parking/automation/server',{method:'POST',headers:{'X-Megaspot-Signature':await parkingSign(SECRET,body)},body})});
  const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'site '+r.status);
  if(hooks.afterSite[action])await hooks.afterSite[action](extra);
  return j;
 };
 // 아마노: 차량마다 오늘 13:00 입차 1건, 등록 요청은 registrations 에 쌓입니다
 const registrations=[],history={};let balance=100000;
 const entry=(plate,date)=>({id:'E'+plate.replace(/\D/g,''),plate:plate+'/XXXX'+plate.slice(-5),cardType:'0',entryAt:date+'T13:00:00',out:false});
 const client={credentials:{username:'operator'},login:async()=>{},
  entries:async(plate,date)=>[entry(plate,date)],
  detail:async(e)=>({entry:e,balance,types:Object.entries(DISCOUNTS).map(([id,v])=>({id,name:v.name,price:v.price,minutes:v.minutes})),discounts:structuredClone(history[e.id]||[])}),
  register:async(e,code,oid)=>{
   if(hooks.beforeRegister)await hooks.beforeRegister(code,oid);
   const v=DISCOUNTS[code];registrations.push({oid,code});balance-=v.price;
   (history[e.id]||=[]).push({id:'H'+registrations.length,code,name:v.name,minutes:v.minutes,price:v.price,charged:v.price,entryId:e.id,memo:oid,account:'operator',at:'2026-11-03 14:00:00'});
  }};
 const memory={},store={read:k=>memory[k]?structuredClone(memory[k]):null,save:(k,v)=>memory[k]=structuredClone(v)};
 const run=()=>runCycle({site,client,store});
 const pay=async(p,state,extra={})=>{const r=await f.feedback(p,state,extra);assert.equal(r.status,200,'페이앱 통보 '+state+' 처리');return r;};
 const mulNo=p=>f.db.prepare('SELECT mul_no FROM payapp_payments WHERE oid=?').get(p.oid).mul_no;
 const partial=(p,amount,no='777000')=>({mul_no:no,price:String(amount),orig_mul_no:mulNo(p),orig_price:String(f.db.prepare('SELECT price FROM orders WHERE oid=?').get(p.oid).price)});
 const order=oid=>f.db.prepare('SELECT o.status AS payment_status,p.status FROM parking_orders p JOIN orders o ON o.oid=COALESCE(p.payment_oid,p.oid) WHERE p.oid=?').get(oid);
 const cars=p=>f.db.prepare('SELECT oid FROM parking_orders WHERE COALESCE(payment_oid,oid)=? ORDER BY oid').all(p.oid).map(r=>r.oid);
 // 사이트·등록 서버·관리자·고객 어느 쪽에서도 등록이 시작되지 않는지 한 번에 확인합니다
 async function assertBlocked(p,label,{manual=true}={}){
  const feed=await site('orders');assert.deepEqual(feed.items.map(x=>x.oid),[],label+': 등록 서버 대상 목록');
  for(const oid of cars(p)){
   await assert.rejects(site('claim',{oid,data:{entry_id:'E-X',entry_at:'2026-11-03T13:00',plate_confirm:'123가4567',confirm_entry:true,confirm_no_free:true}}),label+': 서버 선점');
   if(manual)assert.equal((await f.admin('orders/'+oid+'/claim',{entry_id:'ENTRY-'+oid,entry_at:'2026-11-03T13:00',plate_confirm:'123가4567',confirm_entry:true})).status,409,label+': 관리자 선점');
  }
  const before=registrations.length,r=await run();
  assert.equal(registrations.length,before,label+': 아마노 등록 요청');assert.equal(r.processed,0,label);
 }
 return {...f,site,client,run,pay,partial,order,cars,registrations,hooks,assertBlocked,wakes:()=>wakes};
}
const twoCars=f=>f.buy({vehicles:[{plate:'123가4567',plate_confirm:'123가4567',ticket:'1h'},{plate:'234나5678',plate_confirm:'234나5678',ticket:'2h'}]});

test('결제 완료(4)만 등록 대상 — 결제요청·결제대기·요청취소·승인취소·부분취소는 노출·선점·등록 모두 막힌다',async t=>{
 for(const [state,label,status] of [['1','결제요청','created'],['10','결제대기(입금 전)','pending'],['8','요청취소','cancelled'],['16','요청취소','cancelled'],['31','요청취소','cancelled'],['32','요청취소','cancelled'],['9','승인취소','refunded'],['64','승인취소','refunded'],['70','부분취소','created'],['71','부분취소','created']]){
  await t.test(state+' '+label,async t=>{
   const f=setup(t),p=await f.buy();
   await f.pay(p,state,['70','71'].includes(state)?f.partial(p,4000):{});
   assert.equal(f.order(p.oid).payment_status,status);
   await f.assertBlocked(p,state+' '+label);
   // 고객의 입차 알림도 결제 완료 전에는 받지 않습니다
   assert.equal((await f.call('orders/'+p.oid+'/arrive','POST',{},p.key)).status,409);
   assert.equal(f.wakes(),0,'결제 완료 전에는 등록 서버를 깨우지 않습니다');
  });
 }
 await t.test('4 결제완료 (비교 기준)',async t=>{
  const f=setup(t),p=await f.buy();await f.pay(p,'4');
  assert.equal(f.wakes(),1);assert.deepEqual((await f.site('orders')).items.map(x=>x.oid),[p.oid]);
  assert.equal((await f.run()).processed,1);assert.deepEqual(f.registrations.map(r=>r.code),['1','6']);assert.equal(f.order(p.oid).status,'applied');
 });
});

test('통보 순서가 뒤섞여도 결제 완료 상태가 아니면 등록하지 않는다',async t=>{
 for(const [label,steps,blocked] of [
  ['승인취소 뒤 늦게 온 결제완료',['9','4'],true],
  ['요청취소 뒤 늦게 온 결제완료',['8','4'],true],
  ['결제대기 뒤 요청취소',['10','16'],true],
  ['결제완료 뒤 등록 전 승인취소',['4','9'],true],
  ['결제완료 뒤 등록 전 매입취소',['4','64'],true],
  ['결제완료 뒤 등록 전 부분취소',['4','70'],true],
  ['결제대기 뒤 입금 완료',['10','4'],false]
 ])await t.test(label,async t=>{
  const f=setup(t),p=await f.buy();
  for(const s of steps)await f.pay(p,s,['70','71'].includes(s)?f.partial(p,4000):{});
  if(blocked)return f.assertBlocked(p,label);
  assert.equal((await f.run()).processed,1);assert.deepEqual(f.registrations.map(r=>r.code),['1','6']);
 });
});

test('선점 뒤 등록 직전에 결제가 취소되면 아마노 등록을 보내지 않는다',async t=>{
 await t.test('선점 직후 승인취소',async t=>{
  const f=setup(t),p=await f.buy();await f.pay(p,'4');
  f.hooks.afterSite.claim=async()=>{f.hooks.afterSite.claim=null;await f.pay(p,'9');};
  const r=await f.run();
  assert.deepEqual(f.registrations,[]);assert.equal(r.processed,0);assert.equal(f.order(p.oid).status,'issue');assert.equal(f.order(p.oid).payment_status,'refunded');
 });
 await t.test('무료 1시간 등록 뒤 유료 등록 전 승인취소',async t=>{
  const f=setup(t),p=await f.buy();await f.pay(p,'4');
  f.hooks.beforeRegister=async code=>{if(code==='6')assert.fail('취소 뒤 유료 등록 요청');};
  let freeDone=false;
  const register=f.client.register;f.client.register=async(e,code,oid)=>{await register(e,code,oid);if(code==='1'&&!freeDone){freeDone=true;await f.pay(p,'9');}};
  await f.run();
  assert.deepEqual(f.registrations.map(r=>r.code),['1']);assert.equal(f.order(p.oid).status,'issue');
 });
 await t.test('등록 직전 고객 취소 문의',async t=>{
  const f=setup(t),p=await f.buy();await f.pay(p,'4');
  f.hooks.afterSite.claim=async()=>{f.hooks.afterSite.claim=null;assert.equal((await f.call('orders/'+p.oid+'/cancel-request','POST',{reason:'결제 취소 원함'},p.key)).status,200);};
  await f.run();assert.deepEqual(f.registrations,[]);assert.equal(f.order(p.oid).status,'issue');
 });
});

test('여러 대 통합 결제: 한 대라도 취소·환불되면 남은 차량도 자동 등록을 멈춘다',async t=>{
 for(const [label,step] of [['부분취소','70'],['전체 승인취소','9']])await t.test(label,async t=>{
  const f=setup(t),p=await twoCars(f);await f.pay(p,'4');assert.equal((await f.site('orders')).items.length,2);
  await f.pay(p,step,step==='70'?f.partial(p,4000):{});
  await f.assertBlocked(p,label);
  for(const oid of f.cars(p))assert.equal(f.order(oid).status,'issue');
 });
 await t.test('결제 전 통합 주문',async t=>{const f=setup(t),p=await twoCars(f);await f.assertBlocked(p,'결제 전');await f.pay(p,'10');await f.assertBlocked(p,'결제대기');});
});

test('고객 취소 문의는 "결제 유지"로 확인한 경우에만 다시 등록 대상이 되고, "취소 진행"은 환불이 반영될 때까지 계속 막는다',async t=>{
 const f=setup(t),p=await f.buy();await f.pay(p,'4');
 assert.equal((await f.call('orders/'+p.oid+'/cancel-request','POST',{reason:'일정 취소'},p.key)).status,200);
 await f.assertBlocked(p,'취소 문의 접수');
 // 결정 없이 "검토 완료"만 누르는 예전 방식은 받지 않습니다
 assert.equal((await f.admin('orders/'+p.oid+'/refund-reviewed',{memo:'검토'})).status,400);
 // 취소 진행: 메모만 남기고 등록 차단 유지
 const hold=await f.admin('orders/'+p.oid+'/refund-reviewed',{memo:'고객 요청으로 페이앱 취소 예정',decision:'refund'});assert.equal(hold.status,200);assert.equal((await hold.json()).registration,'held');
 await f.assertBlocked(p,'취소 진행 결정 뒤 · 페이앱 취소 전');
 // 페이앱에서 실제 취소 → 환불 반영 → 다시 기록하면 문의 종료(등록은 환불로 계속 막힘)
 await f.pay(p,'9');
 const closed=await f.admin('orders/'+p.oid+'/refund-reviewed',{memo:'페이앱 취소 완료 확인',decision:'refund'});assert.equal(closed.status,200);assert.equal((await closed.json()).registration,'refunded');
 await f.assertBlocked(p,'환불 반영 뒤');
 // 결제 유지는 확인 체크가 있어야 하고, 그때만 다시 등록 대상
 const g=setup(t),q=await g.buy();await g.pay(q,'4');await g.call('orders/'+q.oid+'/cancel-request','POST',{reason:'차량번호 확인'},q.key);
 assert.equal((await g.admin('orders/'+q.oid+'/refund-reviewed',{memo:'구매자와 통화 · 계속 이용',decision:'keep'})).status,400);
 assert.equal((await g.admin('orders/'+q.oid+'/refund-reviewed',{memo:'구매자와 통화 · 계속 이용',decision:'keep',confirm_keep:true})).status,200);
 assert.equal((await g.run()).processed,1);assert.deepEqual(g.registrations.map(r=>r.code),['1','6']);
 // 이미 환불된 결제는 "결제 유지"로 되살릴 수 없습니다
 const h=setup(t),r=await h.buy();await h.pay(r,'4');await h.call('orders/'+r.oid+'/cancel-request','POST',{reason:'취소'},r.key);await h.pay(r,'9');
 assert.equal((await h.admin('orders/'+r.oid+'/refund-reviewed',{memo:'x',decision:'keep',confirm_keep:true})).status,409);
});

test('관리자 주문 수정·위조 통보·시험 결제로는 주차 주문을 결제 완료로 만들거나 자동 등록할 수 없다',async t=>{
 const f=setup(t),p=await f.buy();
 const patch=await adminApi({env:f.env,params:{path:['orders',p.oid]},request:new Request('https://megaspot.test/api/admin/orders/'+p.oid,{method:'PATCH',headers:{origin:'https://megaspot.test','content-type':'application/json','x-admin-key':'test-admin'},body:JSON.stringify({status:'paid'})})});
 assert.equal(patch.status,409);assert.equal(f.order(p.oid).payment_status,'created');
 // 해시·주문별 비밀값·금액이 맞지 않는 결제완료 통보
 const row=f.db.prepare('SELECT o.price,p.nonce,p.mul_no FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(p.oid),stamp=kstStamp(),hash=await sha256(f.env.PAYAPP_USERID+stamp+f.env.PAYAPP_REQUESTKEY);
 const base={userid:f.env.PAYAPP_USERID,linkkey:f.env.PAYAPP_LINKKEY,linkval:f.env.PAYAPP_LINKVAL,responsedate:stamp,hash,var1:p.oid,var2:row.nonce,mul_no:row.mul_no,price:String(row.price),pay_state:'4'};
 for(const forged of [{hash:'0'.repeat(64)},{var2:'wrong-nonce'},{price:'100'},{linkval:'guess'},{mul_no:'999999'}])assert.notEqual((await f.call('feedback','POST',{...base,...forged})).status,200);
 await f.assertBlocked(p,'위조 통보');
 // 시험 결제는 결제 완료여도 자동 등록하지 않습니다
 await f.pay(p,'4');f.db.prepare('UPDATE orders SET test=1 WHERE oid=?').run(p.oid);await f.assertBlocked(p,'시험 결제',{manual:false});
});

test('관리자 주차 화면: 결제 완료가 아닌 주문은 아마노 등록 금지로 표시한다',()=>{
 const g=view.registrationGate;
 assert.deepEqual(g({payment_status:'paid',refunded_amount:0,refund_hold:false}),{ok:true,label:''});
 for(const [s,label] of [['created','결제 미완료'],['pending','입금 대기'],['cancelled','결제 취소'],['failed','결제 실패'],['refunded','환불 완료']]){const r=g({payment_status:s});assert.equal(r.ok,false);assert.match(r.label,new RegExp(label));assert.match(r.label,/아마노 등록 금지/);}
 assert.equal(g({payment_status:'paid',refunded_amount:4000}).ok,false);assert.equal(g({payment_status:'paid',refund_hold:true}).ok,false);
 assert.match(g({payment_status:'paid',refund_requested_at:'2026-11-03 05:00:00'}).label,/취소 문의/);
});
