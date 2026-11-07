import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {onRequest as pay,buildOrder,dayCol,peakOf} from '../functions/api/pay/[[path]].js';
import {onRequest as auth} from '../functions/api/auth/[[path]].js';
import {PRODUCTS} from '../functions/api/_catalog.js';
import {kstToday,sha256} from '../functions/api/_lib.js';

const add=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*864e5).toISOString().slice(0,10);
function pass(pkg='day',from=10){
 for(let n=from;n<400;n++){
  const date=kstToday(n);if(peakOf(date))continue;
  const product=PRODUCTS.items.find(p=>p.kind==='pass'&&p.pkg===pkg&&PRODUCTS.dayGroups[p.group].cols.includes(dayCol(date)));
  if(product)return {product_id:product.id,date,people:30};
 }
 throw Error('No future pass available');
}
function setup(t,{booking=false}={}){
 const f=payappFixture({booking});t.after(()=>f.db.close());let calls=0;
 const prepare=f.env.DB.prepare;
 f.env.DB.prepare=sql=>{const statement=prepare(sql),run=statement.run;statement.run=async()=>{const r=await run.call(statement);return {...r,meta:{changes:r.changes}};};return statement;};
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'https://api.payapp.kr/oapi/v2');calls++;return new Response('state=1&mul_no='+(700000+calls)+'&payurl=https%3A%2F%2Fpayapp.kr%2Flocal-fixture');});
 async function call(path,method='GET',body){const response=await pay({env:f.env,params:{path:path.split('/')},request:new Request('https://local.test/api/pay/'+path,{method,headers:{origin:'https://local.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});return {status:response.status,body:await response.json()};}
 const order=input=>call('prepare','POST',{buyer:{name:'검증 고객',phone:'01012345678'},agree_terms:true,agree_privacy:true,agree_refund:true,...input});
 async function paid(oid){const row=f.db.prepare('SELECT o.oid,o.price,p.nonce,p.mul_no FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(oid);await f.feedback(await f.form(row,'4'));return f.db.prepare('SELECT o.*,b.status AS booking_status FROM orders o LEFT JOIN bookings b ON b.booking_code=o.booking_code WHERE o.oid=?').get(oid);}
 function occupied({code='BK-OCCUPIED',date,start=10,end=17,people=30,space='megaspot-gundae',ref=null}={}){f.db.prepare('INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,start_h,end_h,headcount,status,amount,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(code,space,ref,'검증 고객','010-1234-5678','5678',date,start,end,people,'confirmed',500000,'fixture');}
 return {...f,call,order,paid,occupied,calls:()=>calls};
}

test('KST 패키지 시작 전에는 결제 가능하고 시작 시각부터 차단한다',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-09T09:59:00+09:00')});
 const input={product_id:'pass-day-wdfri',date:'2026-11-09',people:20};
 assert.equal(buildOrder(input).error,undefined);t.mock.timers.tick(60000);assert.equal(buildOrder(input).code,'PACKAGE_STARTED');
 assert.equal(buildOrder({...input,product_id:'pass-allday-wd'}).code,'PACKAGE_STARTED');
 assert.equal(buildOrder({...input,product_id:'pass-allnight-wd'}).error,undefined);
 t.mock.timers.tick(8*3600e3);assert.equal(buildOrder({...input,product_id:'pass-allnight-wd'}).code,'PACKAGE_STARTED');
});

test('옵션은 이용일 필수·과거 금지이며 현수막과 X배너는 D-5 경계를 지킨다',t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-09T09:00:00+09:00')});
 assert.equal(buildOrder({product_id:'addon-cleaning'}).code,'DATE_REQUIRED');
 assert.equal(buildOrder({product_id:'addon-cleaning',date:'2026-02-30'}).code,'DATE_REQUIRED');
 assert.equal(buildOrder({product_id:'addon-cleaning',date:kstToday(-1)}).code,'PAST_DATE');
 for(const opt of ['banner','xbanner']){
  assert.equal(buildOrder({product_id:'addon-'+opt,date:kstToday(4)}).code,'PRODUCTION_DEADLINE');
  assert.equal(buildOrder({product_id:'addon-'+opt,date:kstToday(5)}).error,undefined);
  const input=pass('day',4);assert.equal(input.date,kstToday(4));assert.equal(buildOrder({...input,addons:{[opt]:1}}).code,'PRODUCTION_DEADLINE');
 }
 for(const qty of [0,11,1.5,'2x'])assert.equal(buildOrder({product_id:'addon-cleaning',date:kstToday(7),qty}).code,'BAD_OPTIONS');
 for(const people of [1.5,'20x'])assert.ok(buildOrder({...pass(),people}).error);
});

for(const scenario of [
 {name:'전날 예약이 이어지는 낮 패키지',pkg:'day',shift:-1,start:18,end:36},
 {name:'익일 예약과 겹치는 올나잇',pkg:'allnight',shift:1,start:6,end:10}
])test('결제창을 열기 전에 '+scenario.name+' 충돌을 차단한다',async t=>{
 const f=setup(t),input=pass(scenario.pkg);f.occupied({date:add(input.date,scenario.shift),start:scenario.start,end:scenario.end});
 const r=await f.order(input);assert.equal(r.status,409);assert.equal(r.body.code,'DATE_TAKEN');assert.equal(f.calls(),0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
});

test('인접한 시간과 다른 호점은 결제를 허용하고 임시 확보는 차단한다',async t=>{
 const f=setup(t),input=pass();f.occupied({date:input.date,start:7,end:10});f.occupied({code:'BK-OTHER',date:input.date,start:10,end:17,space:'megaspot-gundae-2'});
 assert.equal((await f.order(input)).status,200);f.db.prepare('INSERT INTO calendar_blocks(space_id,date,state) VALUES(?,?,?)').run('megaspot-gundae',input.date,'hold');
 const held=await f.order(input);assert.equal(held.status,409);assert.equal(f.calls(),1);
});

for(const change of [
 {name:'시간',start:18,end:31},
 {name:'호점',space:'megaspot-gundae-2'},
 {name:'인원',people:40}
])test('기존 예약과 '+change.name+'이 다르면 결제 전에 문의 연결을 거절한다',async t=>{
 const f=setup(t),input=pass();f.occupied({code:'BK-LINKED',date:input.date,ref:'MS-TEST',...change});
 const r=await f.order({...input,inquiry_ref:'MS-TEST'});assert.equal(r.status,409);assert.equal(r.body.code,'BOOKING_MISMATCH');assert.equal(f.calls(),0);
});

test('조건이 정확히 같은 기존 예약은 추가 결제를 연결하고 기존 환불 경로를 유지한다',async t=>{
 const f=setup(t),input=pass();f.occupied({code:'BK-LINKED',date:input.date,ref:'MS-TEST'});
 const prepared=await f.order({...input,inquiry_ref:'MS-TEST'});assert.equal(prepared.status,200);
 const paid=await f.paid(prepared.body.oid);assert.equal(paid.booking_code,'BK-LINKED');assert.equal(paid.booking_status,'confirmed');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
 assert.equal(f.db.prepare('SELECT amount FROM bookings').get().amount,500000);
 const source=f.db.prepare('SELECT o.*,p.nonce,p.mul_no FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(paid.oid);
 await f.feedback(await f.form(source,'70',{mul_no:'888991',orig_mul_no:source.mul_no,orig_price:String(source.price),price:'10000'}));
 assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'confirmed');
});

test('결제창을 연 후 기존 예약 조건이 바뀌면 기존 예약에 붙이지 않고 수납 검토로 보존한다',async t=>{
 const f=setup(t),input=pass();f.occupied({code:'BK-LINKED',date:input.date,ref:'MS-TEST'});
 const prepared=await f.order({...input,inquiry_ref:'MS-TEST'});assert.equal(prepared.status,200);
 f.db.prepare("UPDATE bookings SET start_h=18,end_h=31 WHERE booking_code='BK-LINKED'").run();
 const paid=await f.paid(prepared.body.oid);assert.notEqual(paid.booking_code,'BK-LINKED');assert.equal(paid.status,'paid');assert.equal(paid.booking_status,'payment_review');
 assert.deepEqual({...f.db.prepare("SELECT status,start_h,end_h FROM bookings WHERE booking_code='BK-LINKED'").get()},{status:'confirmed',start_h:18,end_h:31});
});

test('통보의 최종 트랜잭션 직전에 기존 예약이 변경돼도 연결하지 않는다',async t=>{
 const f=setup(t),input=pass();f.occupied({code:'BK-LINKED',date:input.date,ref:'MS-TEST'});
 const prepared=await f.order({...input,inquiry_ref:'MS-TEST'}),batch=f.env.DB.batch.bind(f.env.DB);let injected=false;
 f.env.DB.batch=ss=>{if(!injected){injected=true;f.db.prepare("UPDATE bookings SET headcount=99 WHERE booking_code='BK-LINKED'").run();}return batch(ss);};
 const paid=await f.paid(prepared.body.oid);assert.notEqual(paid.booking_code,'BK-LINKED');assert.equal(paid.booking_status,'payment_review');assert.equal(f.db.prepare("SELECT headcount FROM bookings WHERE booking_code='BK-LINKED'").get().headcount,99);
});

test('기존 불일치 주문의 뒤늦은 승인도 다른 시간대 예약에 붙이지 않는다',async t=>{
 const f=setup(t),input=pass('allnight');f.occupied({code:'BK-LINKED',date:input.date,ref:'MS-TEST'});
 const seeded=f.seed({status:'created',linked:false,slot:'pkg-allnight'});f.db.prepare('UPDATE orders SET event_date=? WHERE oid=?').run(input.date,seeded.oid);
 await f.feedback(await f.form(seeded,'4'));const order=f.db.prepare('SELECT o.booking_code,b.status FROM orders o JOIN bookings b ON b.booking_code=o.booking_code WHERE o.oid=?').get(seeded.oid);
 assert.notEqual(order.booking_code,'BK-LINKED');assert.equal(order.status,'payment_review');
});

test('실패한 주문만 안전한 선택 정보를 제공하며 재결제는 전화번호 검증 후 문의를 내부 복구한다',async t=>{
 const f=setup(t),input=pass(),source=f.seed({status:'failed',linked:false});
 const addons={manager:{count:2,hours:7},disposable:{people:40},cleaning:2};
 f.db.prepare('UPDATE orders SET product_id=?,event_date=?,data=? WHERE oid=?').run(input.product_id,input.date,JSON.stringify({addons,qty:1,memo:'노출하면 안 되는 메모',member_email:'private@example.invalid',arbitrary:'secret'}),source.oid);
 const detail=(await f.call('orders/'+source.oid)).body.order;
 assert.deepEqual(detail.retry,{...input,qty:1,addons});
 const publicRetry=JSON.stringify(detail.retry);for(const secret of ['MS-TEST','01012345678','private@example.invalid','노출하면'])assert.ok(!publicRetry.includes(secret));
 const wrong=await f.order({...detail.retry,retry_oid:source.oid,buyer:{name:'검증 고객',phone:'01099995678'}});assert.equal(wrong.body.code,'RETRY_NOT_ALLOWED');assert.equal(f.calls(),0);
 const prepared=await f.order({...detail.retry,retry_oid:source.oid});assert.equal(prepared.status,200);assert.equal(f.db.prepare('SELECT inquiry_ref FROM orders WHERE oid=?').get(prepared.body.oid).inquiry_ref,'MS-TEST');
 f.db.prepare("UPDATE orders SET status='paid' WHERE oid=?").run(source.oid);assert.equal((await f.call('orders/'+source.oid)).body.order.retry,null);assert.equal((await f.order({...input,retry_oid:source.oid})).body.code,'RETRY_NOT_ALLOWED');
});

test('예전 매니저·일회용품 단위도 재결제에서 금액을 보존한다',async t=>{
 const f=setup(t),input=pass(),source=f.seed({status:'failed',linked:false});f.db.prepare('UPDATE orders SET product_id=?,event_date=?,data=? WHERE oid=?').run(input.product_id,input.date,JSON.stringify({addons:{manager:2,disposable:2},qty:1}),source.oid);
 const retry=(await f.call('orders/'+source.oid)).body.order.retry;assert.deepEqual(retry.addons,{manager:{count:2,hours:4},disposable:{people:40}});
 assert.equal(buildOrder(retry).total,buildOrder({...input,addons:{manager:2,disposable:2}}).total);
});

async function member(f){
 f.db.prepare("INSERT INTO members(id,email,name,phone,pw_hash,status,agreed_at,created_at) VALUES(1,'member@example.invalid','회원','01012345678','unused','active','fixture','fixture')").run();
 f.db.prepare('INSERT INTO sessions(token_hash,member_id,created_at,expires_at) VALUES(?,?,?,?)').run(await sha256('member-fixture'),1,'2026-01-01','2099-01-01');
 f.db.prepare("UPDATE inquiries SET data=json_set(data,'$.member_id',1)").run();
 return async path=>{const r=await auth({env:f.env,params:{path:[path]},request:new Request('https://local.test/api/auth/'+path,{headers:{cookie:'ms_session=member-fixture'}})});assert.equal(r.status,200);return r.json();};
}

test('마이페이지는 원문의와 실제 확정 예약 조건을 구분하고 다른 회원 예약은 반환하지 않는다',async t=>{
 const f=setup(t),input=pass(),call=await member(f);f.occupied({code:'BK-ACTUAL',date:input.date,start:18,end:31,people:40,ref:'MS-TEST'});f.occupied({code:'BK-PRIVATE',date:input.date,start:10,end:17,ref:'MS-OTHER'});
 const result=await call('inquiries'),inquiry=result.items[0];assert.equal(inquiry.headcount,30);assert.equal(inquiry.confirmed_bookings.length,1);assert.equal(inquiry.confirmed_bookings[0].code,'BK-ACTUAL');assert.equal(inquiry.confirmed_bookings[0].headcount,40);assert.equal(inquiry.confirmed_bookings[0].start_h,18);assert.ok(!JSON.stringify(result).includes('BK-PRIVATE'));
 f.db.prepare("UPDATE bookings SET confirm_doc='{\"show_amount\":false}' WHERE booking_code='BK-ACTUAL'").run();assert.equal((await call('inquiries')).items[0].confirmed_bookings[0].amount,null);
});

test('마이페이지 주문 API는 결제 보류 상태를 확정과 구분해 전달한다',async t=>{
 const f=setup(t),call=await member(f),source=f.seed({status:'paid'});f.occupied({code:'BK-TEST',date:pass().date});f.db.prepare("UPDATE bookings SET status='payment_review' WHERE booking_code='BK-TEST'").run();f.db.prepare('UPDATE orders SET member_id=1 WHERE oid=?').run(source.oid);
 const result=await call('orders');assert.equal(result.items[0].booking_status,'payment_review');
});

test('마이페이지 화면은 확정 조건을 먼저 보여 주고 보류 주문에 확정서 링크를 노출하지 않는다',async()=>{
 const elements=new Map(),element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',value:'',hidden:false,addEventListener(){},setAttribute(){},parentNode:{appendChild(){}}});return elements.get(selector);};
 const inquiry={ref:'MS-TEST',space_id:'megaspot-gundae',status:'예약 확정',date:'2026-11-26',start_h:10,end_h:17,headcount:30,total:450000,reserve:true,confirmed_bookings:[{code:'BK-ACTUAL',space_id:'megaspot-gundae',date:'2026-11-09',start_h:18,end_h:31,headcount:40,amount:700000,status:'confirmed'}]};
 const M={$:selector=>['#signup-form','#login-form'].includes(selector)?null:element(selector),$$:()=>[],esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmtKDate:s=>s,checkApi:async()=>true,api:async path=>path==='/auth/me'?{member:{name:'검증 고객',email:'member@example.invalid'}}:path==='/auth/inquiries'?{items:[inquiry]}:{items:[{oid:'ORDER-REVIEW',title:'가상 이용권',status:'paid',booking_status:'payment_review',booking_code:'BK-REVIEW',price:700000}]}};
 runInNewContext(readFileSync(new URL('../assets/js/pages/account.js',import.meta.url),'utf8'),{window:{MEGASPOT:M},document:{createElement:()=>({setAttribute(){},innerHTML:''})},location:{search:''},URLSearchParams});
 await new Promise(resolve=>setImmediate(resolve));
 const inquiries=element('#my-inquiries').innerHTML,orders=element('#my-orders').innerHTML;
 assert.ok(inquiries.indexOf('2026-11-09')<inquiries.indexOf('2026-11-26'));assert.match(inquiries,/처음 신청한 조건/);assert.match(inquiries,/40명/);assert.match(inquiries,/확정 700,000원/);
 assert.match(orders,/예약 일정 확인 중/);assert.match(orders,/아직 공간 이용은 확정되지 않았습니다/);assert.ok(!orders.includes('/confirm/?c=BK-REVIEW'));
});

for(const elapsed of [60000,9*3600e3])test('시작 전 연 결제창의 '+(elapsed===60000?'시작시각':'종료 후')+' 승인도 신규 예약 확정·안내 없이 수납을 보존한다',async t=>{
 const f=setup(t),input=pass();t.mock.timers.enable({apis:['Date'],now:Date.parse(input.date+'T09:59:00+09:00')});
 for(const [key,value] of [['reservation_guide',{enabled:true,automatic:true,template_code:'UN_2584',spaces:['megaspot-gundae']}],['deposit_alimtalk',{enabled:true,types:{payment:true,account:true,refunded:true}}]])f.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run(key,JSON.stringify(value),'fixture');
 const prepared=await f.order({...input,inquiry_ref:'MS-TEST'});assert.equal(prepared.status,200);t.mock.timers.tick(elapsed);
 const paid=await f.paid(prepared.body.oid);assert.equal(paid.status,'paid');assert.equal(paid.price,prepared.body.total);assert.equal(paid.booking_status,'payment_review');assert.equal(f.db.prepare('SELECT status FROM inquiries WHERE ref=?').get('MS-TEST').status,'결제 대기');
 for(const table of ['booking_guide_events','booking_guide_messages','deposit_notifications'])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE booking_code=?').get(paid.booking_code).n,0);
 const row=f.db.prepare('SELECT o.*,p.nonce,p.mul_no FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(paid.oid);
 await f.feedback(await f.form(row,'9'));await f.feedback(await f.form(row,'4'));assert.equal(f.db.prepare('SELECT status FROM orders WHERE oid=?').get(paid.oid).status,'refunded');assert.equal(f.db.prepare('SELECT status FROM bookings WHERE booking_code=?').get(paid.booking_code).status,'cancelled');
});

test('최종 INSERT 직전 시작시각이 지나면 DB 시각 검사에서도 신규 확정을 막는다',async t=>{
 const f=setup(t),input=pass(),before=Date.parse(input.date+'T09:59:59+09:00');t.mock.timers.enable({apis:['Date'],now:before});let dbNow=before;
 f.db.function('julianday',value=>(value==='now'?dbNow:Date.parse(value))/864e5+2440587.5);
 const prepared=await f.order(input),batch=f.env.DB.batch.bind(f.env.DB);assert.equal(prepared.status,200);f.env.DB.batch=ss=>{dbNow=before+1000;return batch(ss);};
 const paid=await f.paid(prepared.body.oid);assert.equal(paid.status,'paid');assert.equal(paid.booking_status,'payment_review');
});

test('이미 정확히 일치한 확정 예약의 추가 수납은 시작 후에도 기존 예약을 유지한다',async t=>{
 const f=setup(t),input=pass();f.occupied({code:'BK-LINKED',date:input.date,ref:'MS-TEST'});t.mock.timers.enable({apis:['Date'],now:Date.parse(input.date+'T09:59:00+09:00')});
 const prepared=await f.order({...input,inquiry_ref:'MS-TEST'});assert.equal(prepared.status,200);t.mock.timers.tick(60000);
 const paid=await f.paid(prepared.body.oid);assert.equal(paid.status,'paid');assert.equal(paid.booking_code,'BK-LINKED');assert.equal(paid.booking_status,'confirmed');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
});

test('같은 문의의 신규 주문 두 건은 뒤늦은 승인을 새 예약의 추가 수납으로 오인하지 않는다',async t=>{
 const f=setup(t),input=pass(),a=await f.order({...input,inquiry_ref:'MS-TEST'}),b=await f.order({...input,inquiry_ref:'MS-TEST'});assert.equal(a.status,200);assert.equal(b.status,200);
 const first=await f.paid(a.body.oid),second=await f.paid(b.body.oid);assert.equal(first.booking_status,'confirmed');assert.equal(second.booking_status,'payment_review');assert.notEqual(first.booking_code,second.booking_code);
 const rows=f.db.prepare('SELECT o.*,p.nonce,p.mul_no FROM orders o JOIN payapp_payments p ON p.oid=o.oid ORDER BY o.oid').all();await Promise.all(rows.map(async row=>f.feedback(await f.form(row,'4'))));
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='confirmed'").get().n,1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='payment_review'").get().n,1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM orders WHERE status='paid'").get().n,2);
});
