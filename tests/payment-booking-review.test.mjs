import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {DAY} from './helpers/admin-fixture.mjs';
import {onRequest as pay} from '../functions/api/pay/[[path]].js';
import {settlementFor} from '../functions/api/_settlement.js';
import {guideTick} from '../functions/api/_guide_messages.js';
import {depositNoticeTick} from '../functions/api/_deposit_notifications.js';
import {onRequestPost as customerConfirmation} from '../functions/api/confirm.js';

function setup(t){
  const f=payappFixture({booking:false});t.after(()=>f.db.close());
  // These cases isolate occupancy races; a dated pending inquiry is now a separate payment block.
  f.db.prepare("UPDATE inquiries SET event_date=NULL WHERE ref='MS-TEST'").run();
  t.mock.method(globalThis,'fetch',async()=>assert.fail('외부 결제·알림톡 전송 금지'));
  const occupied=({code='BK-OCCUPIED',date=DAY,start=10,end=17,space='megaspot-gundae',status='confirmed'}={})=>f.db.prepare('INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(code,space,'다른 가상 고객','01000000000','0000',date,start,end,status,'2026-11-04');
  function enabled(){
    f.env.ALIGO_LIVE_ENABLED='true';
    for(const [key,value] of [['reservation_guide',{enabled:true,automatic:true,template_code:'UN_2584',spaces:['megaspot-gundae']}],['deposit_alimtalk',{enabled:true,types:{payment:true,account:true,refunded:true}}]])f.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run(key,JSON.stringify(value),'fixture');
  }
  const seed=()=>f.seed({status:'created',linked:false,slot:'pkg-day'});
  const booking=oid=>f.db.prepare('SELECT b.* FROM bookings b JOIN orders o ON o.booking_code=b.booking_code WHERE o.oid=?').get(oid);
  async function publicOrder(oid){return (await(await pay({env:f.env,params:{path:['orders',oid]},request:new Request('https://local.test/api/pay/orders/'+oid)})).json()).order;}
  function noNotices(code){
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_events WHERE booking_code=?').get(code).n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_messages WHERE booking_code=?').get(code).n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM deposit_notifications WHERE booking_code=?').get(code).n,0);
  }
  return {...f,occupied,enabled,seed,booking,publicOrder,noNotices};
}

test('결제 중 새 예약이 생기면 수납은 보존하고 확정·문의 상태·안내를 보류',async t=>{
  const f=setup(t),order=f.seed();f.occupied();f.enabled();
  const settings=f.db.prepare('SELECT key,value,updated_at FROM settings ORDER BY key').all();
  await f.feedback(await f.form(order,'4'));
  const b=f.booking(order.oid),o=await f.publicOrder(order.oid);
  assert.equal(b.status,'payment_review');assert.equal(o.status,'paid');assert.equal(o.booking_status,'payment_review');
  assert.equal(o.price,order.price);assert.equal(f.db.prepare('SELECT tid FROM orders WHERE oid=?').get(order.oid).tid,order.mul_no);
  assert.equal((await settlementFor(f.env,b.booking_code)).net,order.price);
  assert.equal(f.db.prepare('SELECT status FROM inquiries WHERE ref=?').get('MS-TEST').status,'결제 대기');
  assert.equal(b.confirm_doc,null);f.noNotices(b.booking_code);
  await guideTick(f.env);await depositNoticeTick(f.env);f.noNotices(b.booking_code);
  assert.deepEqual(f.db.prepare('SELECT key,value,updated_at FROM settings ORDER BY key').all(),settings);
});

for(const scenario of [
  {name:'전날 시작해 이용 시간까지 이어지는 예약',shift:-1,start:18,end:36,held:true},
  {name:'다음 날 예약과 겹치는 올나잇',shift:1,start:6,end:10,slot:'pkg-allnight',held:true},
  {name:'같은 날 시간이 미정인 확정 예약',start:null,end:null,held:true},
  {name:'종료와 시작이 같은 인접 예약',start:7,end:10,held:false},
  {name:'시간이 다른 같은 날 예약',start:18,end:23,held:false},
  {name:'다른 호점 예약',space:'megaspot-gundae-2',held:false},
  {name:'취소된 예약',status:'cancelled',held:false}
])test(scenario.name,async t=>{
  const f=setup(t),order=f.seed(),date=new Date(DAY+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+(scenario.shift||0));
  if(scenario.slot)f.db.prepare('UPDATE orders SET data=? WHERE oid=?').run(JSON.stringify({slot:scenario.slot}),order.oid);
  f.occupied({...scenario,date:date.toISOString().slice(0,10)});f.enabled();await f.feedback(await f.form(order,'4'));
  assert.equal(f.booking(order.oid).status,scenario.held?'payment_review':'confirmed');
  if(scenario.held)f.noNotices(f.booking(order.oid).booking_code);
});

test('결제 승인 시 시간값을 문의에만 저장한 다음 날 확정 예약과도 겹치지 않게 한다',async t=>{
  const f=setup(t),order=f.seed(),next=new Date(Date.parse(DAY+'T00:00:00Z')+864e5).toISOString().slice(0,10);
  f.db.prepare("UPDATE orders SET data=?,inquiry_ref=NULL WHERE oid=?").run(JSON.stringify({slot:'pkg-allnight'}),order.oid);
  f.occupied({date:next,start:null,end:null});
  f.db.prepare("UPDATE inquiries SET data=? WHERE ref='MS-TEST'").run(JSON.stringify({start_h:6,end_h:10}));
  f.db.exec("UPDATE bookings SET inquiry_ref='MS-TEST' WHERE booking_code='BK-OCCUPIED'");
  await f.feedback(await f.form(order,'4'));
  assert.equal(f.booking(order.oid).status,'payment_review');
});

for(const state of ['hold','full'])test('결제 후 '+state+' 표시도 확정 보류',async t=>{
  const f=setup(t),o=f.seed();f.db.prepare('INSERT INTO calendar_blocks(space_id,date,state) VALUES(?,?,?)').run('megaspot-gundae',DAY,state);
  await f.feedback(await f.form(o,'4'));assert.equal(f.booking(o.oid).status,'payment_review');
});

test('저장 직전에 들어온 예약도 쓰기 트랜잭션 안에서 확인',async t=>{
  const f=setup(t),o=f.seed(),batch=f.env.DB.batch.bind(f.env.DB);let injected=false;
  f.env.DB.batch=ss=>{if(!injected){injected=true;f.occupied();}return batch(ss);};
  await f.feedback(await f.form(o,'4'));assert.equal(f.booking(o.oid).status,'payment_review');
});

test('같은 시간 두 주문의 동시 결제 완료는 하나만 확정',async t=>{
  const f=setup(t),a=f.seed(),b=f.seed();f.db.prepare('UPDATE orders SET inquiry_ref=NULL').run();f.enabled();
  await Promise.all([f.feedback(await f.form(a,'4')),f.feedback(await f.form(b,'4'))]);
  assert.deepEqual([f.booking(a.oid).status,f.booking(b.oid).status].sort(),['confirmed','payment_review']);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM orders WHERE status='paid'").get().n,2);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_events').get().n,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM deposit_notifications').get().n,1);
});

test('보류 결제의 중복·지연 통보는 충돌이 없어져도 자동 확정하지 않음',async t=>{
  const f=setup(t),o=f.seed();f.occupied();f.enabled();await f.feedback(await f.form(o,'4'));
  f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-OCCUPIED'").run();
  await Promise.all([f.feedback(await f.form(o,'4')),f.feedback(await f.form(o,'4'))]);
  const b=f.booking(o.oid);assert.equal(b.status,'payment_review');f.noNotices(b.booking_code);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,2);
});

test('검토 후 확정은 명시적 확인·최신 일정 검사 필요, 우회·확정서·링크 발급 차단',async t=>{
  const f=setup(t),o=f.seed();f.occupied();f.enabled();await f.feedback(await f.form(o,'4'));const code=f.booking(o.oid).booking_code;
  await f.api('bookings/'+code,'PATCH',{status:'confirmed'},409);
  await f.api('bookings/'+code,'PATCH',{status:'completed'},409);
  await f.api('inquiries/MS-TEST','PATCH',{status:'예약 확정'},409);
  await f.api('inquiries/MS-TEST','PATCH',{status:'이용 완료'},409);
  await f.api('bookings/'+code+'/confirm-doc','PUT',{doc:{}},409);
  const confirmation=await customerConfirmation({env:f.env,request:new Request('https://local.test/api/confirm',{method:'POST',body:JSON.stringify({booking_code:code,phone_last4:'5678'})})});
  assert.equal(confirmation.status,409);assert.equal((await confirmation.json()).code,'BOOKING_REVIEW');
  await f.api('bookings/'+code+'/portal-link','POST',{},409);
  await f.api('bookings/'+code,'PATCH',{status:'confirmed',confirm_review:true,force:true},409);
  assert.equal(f.booking(o.oid).status,'payment_review');f.noNotices(code);
  f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-OCCUPIED'").run();
  await f.api('bookings/'+code,'PATCH',{status:'confirmed',confirm_review:true});
  assert.equal(f.booking(o.oid).status,'confirmed');assert.equal((await f.publicOrder(o.oid)).booking_status,'confirmed');
  assert.doesNotMatch(f.booking(o.oid).memo,/예약 확정 보류/);
  assert.equal(f.db.prepare('SELECT status FROM inquiries WHERE ref=?').get('MS-TEST').status,'예약 확정');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_guide_events WHERE booking_code=?').get(code).n,1);
});

test('운영자 검토 중 새 충돌이 생겨도 확정·문의 상태·안내를 갱신하지 않음',async t=>{
  const f=setup(t),o=f.seed();f.occupied();await f.feedback(await f.form(o,'4'));const code=f.booking(o.oid).booking_code;
  f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-OCCUPIED'").run();f.enabled();
  const batch=f.env.DB.batch.bind(f.env.DB);let injected=false;
  f.env.DB.batch=ss=>{if(!injected){injected=true;f.occupied({code:'BK-NEW'});}return batch(ss);};
  await f.api('bookings/'+code,'PATCH',{status:'confirmed',confirm_review:true},409);
  assert.equal(f.booking(o.oid).status,'payment_review');assert.equal(f.db.prepare('SELECT status FROM inquiries WHERE ref=?').get('MS-TEST').status,'결제 대기');f.noNotices(code);
});

test('운영자 검토 중 시간이 미정으로 바뀌면 저장 직전 검사로 확정 차단',async t=>{
  const f=setup(t),o=f.seed();f.occupied();await f.feedback(await f.form(o,'4'));const code=f.booking(o.oid).booking_code;
  f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-OCCUPIED'").run();f.enabled();
  const batch=f.env.DB.batch.bind(f.env.DB);let injected=false;
  f.env.DB.batch=ss=>{if(!injected){injected=true;f.db.prepare('UPDATE bookings SET start_h=NULL,end_h=NULL WHERE booking_code=?').run(code);}return batch(ss);};
  await f.api('bookings/'+code,'PATCH',{status:'confirmed',confirm_review:true},409);
  assert.equal(f.booking(o.oid).status,'payment_review');f.noNotices(code);
});

test('보류 결제의 부분·전체 환불과 늦은 승인은 기존 수납·중복 방지 유지',async t=>{
  const f=setup(t),o=f.seed();f.occupied();f.enabled();await f.feedback(await f.form(o,'4'));const code=f.booking(o.oid).booking_code;
  await f.feedback(await f.form(o,'70',{mul_no:'999888',orig_mul_no:o.mul_no,orig_price:String(o.price),price:'200000'}));
  assert.equal(f.booking(o.oid).status,'payment_review');assert.equal((await settlementFor(f.env,code)).net,800000);
  await f.feedback(await f.form(o,'9'));assert.equal(f.booking(o.oid).status,'cancelled');
  assert.equal((await f.publicOrder(o.oid)).status,'refunded');assert.equal((await settlementFor(f.env,code)).net,0);
  await f.feedback(await f.form(o,'4'));assert.equal(f.booking(o.oid).status,'cancelled');f.noNotices(code);
});

test('보류 기록 저장 실패는 결제 상태까지 롤백하고 재통보로 복구',async t=>{
  const f=setup(t),o=f.seed();f.occupied();
  f.db.exec("CREATE TRIGGER fail_paid BEFORE UPDATE OF status ON orders WHEN NEW.status='paid' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
  await f.feedback(await f.form(o,'4'),500);assert.equal(f.booking(o.oid),undefined);
  assert.equal(f.db.prepare('SELECT status FROM orders WHERE oid=?').get(o.oid).status,'created');
  f.db.exec('DROP TRIGGER fail_paid');await f.feedback(await f.form(o,'4'));assert.equal(f.booking(o.oid).status,'payment_review');
});

test('고객 결제 결과 화면은 보류를 확정으로 표시하거나 재결제를 유도하지 않음',async()=>{
  const nodes=new Map();for(const id of ['oc-app','oc-missing','oc-title','oc-sub','oc-card'])nodes.set('#'+id,{hidden:true,textContent:'',innerHTML:''});
  const order={oid:'LOCAL-REVIEW',title:'가상 이용권',status:'paid',booking_status:'payment_review',booking_code:'BK-REVIEW',price:1000000,lines:[]};
  runInNewContext(readFileSync(new URL('../assets/js/pages/order.js',import.meta.url),'utf8'),{window:{MEGASPOT:{$:s=>nodes.get(s)||null,$$:()=>[],esc:s=>String(s||''),api:async()=>({order})}},URLSearchParams,location:{search:'?oid=LOCAL-REVIEW'},setTimeout:()=>assert.fail('보류 주문 자동 재시도 금지')});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(nodes.get('#oc-title').textContent,/일정 확인 중/);assert.match(nodes.get('#oc-sub').textContent,/다시 결제하지/);
  assert.match(nodes.get('#oc-card').innerHTML,/아직 공간 이용이 확정되지/);assert.doesNotMatch(nodes.get('#oc-card').innerHTML,/Confirmed|다시 결제하기/);
});
