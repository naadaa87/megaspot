import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {onRequest as pay,dayCol,peakOf} from '../functions/api/pay/[[path]].js';
import {onRequestPost as inquire} from '../functions/api/inquiry.js';
import {onRequest as auth} from '../functions/api/auth/[[path]].js';
import {onRequestGet as calendar} from '../functions/api/reservation-calendar.js';
import {onRequest as middleware} from '../functions/api/_middleware.js';
import {waitList,waitSummary} from '../functions/api/_reservation_waitlist.js';
import {PRODUCTS} from '../functions/api/_catalog.js';
import {kstToday,sha256} from '../functions/api/_lib.js';
const DAY=kstToday(20),OTHER=kstToday(21),SPACE='megaspot-gundae';
function pass(){
 for(let n=10;n<300;n++){const date=kstToday(n);if(peakOf(date))continue;const product=PRODUCTS.items.find(p=>p.kind==='pass'&&p.pkg==='day'&&PRODUCTS.dayGroups[p.group].cols.includes(dayCol(date)));if(product)return {product_id:product.id,date,people:30};}
 throw Error('No pass');
}
function setup(t){
 const f=payappFixture({booking:false});t.after(()=>f.db.close());f.db.prepare("UPDATE inquiries SET event_date=NULL WHERE ref='MS-TEST'").run();let calls=0,count=0;
 const prepare=f.env.DB.prepare;f.env.DB.prepare=sql=>{const s=prepare(sql),run=s.run;s.run=async()=>{const r=await run.call(s);return {...r,meta:{changes:r.changes}};};return s;};
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'https://api.payapp.kr/oapi/v2');return new Response('state=1&mul_no='+(++calls+800000)+'&payurl=https%3A%2F%2Fpayapp.kr%2Ffixture');});
 async function api(path,method='GET',body,cookie=''){
  const r=await pay({env:f.env,params:{path:path.split('?')[0].split('/')},request:new Request('https://local.test/api/pay/'+path,{method,headers:{origin:'https://local.test','content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})})});return {status:r.status,body:await r.json()};
 }
 const order=input=>api('prepare','POST',{buyer:{name:'검증 고객',phone:'01012345678'},agree_terms:true,agree_privacy:true,agree_refund:true,...input});
 function pending({ref='MS-WAIT-'+(++count),date=DAY,space=SPACE,status='문의 접수',data={},created='2026-11-01 10:00:00'}={}){f.db.prepare('INSERT INTO inquiries(ref,space_id,status,name,phone,email,event_date,headcount,data,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(ref,space,status,'PRIVATE CUSTOMER','01099998888','private@example.invalid',date,30,JSON.stringify({date,start_h:18,end_h:31,...data}),created);return ref;}
 function booking(ref,{date=DAY,space=SPACE,status='confirmed',code='BK-'+(++count),start=10,end=17,people=30}={}){f.db.prepare('INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,start_h,end_h,headcount,status,amount,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(code,space,ref,'검증 고객','01012345678','5678',date,start,end,people,status,500000,'fixture');return code;}
 async function paid(oid){const row=f.db.prepare('SELECT o.*,p.nonce,p.mul_no FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(oid);await f.feedback(await f.form(row,'4'));return f.db.prepare('SELECT o.*,b.status AS booking_status FROM orders o LEFT JOIN bookings b ON b.booking_code=o.booking_code WHERE o.oid=?').get(oid);}
 return {...f,api,order,pending,booking,paid,calls:()=>calls};
}

test('공개 대기 집계는 관리자와 같은 유효 상태·호점·날짜·연결예약 제외 규칙을 쓴다',async t=>{
 const f=setup(t),expected=[];
 for(const status of ['문의 접수','조건 확인','견적 발송','결제 대기'])expected.push(f.pending({status}));
 for(const status of ['대기 취소','삭제됨','취소·환불','예약 확정','이용 완료'])f.pending({status});
 for(const status of ['confirmed','completed','payment_review']){const ref=f.pending();f.booking(ref,{status});}
 const cancelled=f.pending();f.booking(cancelled,{status:'cancelled'});expected.push(cancelled);
 const request=f.pending({space:'request'});expected.push(request);f.pending({space:'megaspot-gundae-2'});f.pending({date:OTHER});
 assert.deepEqual((await waitList(f.env,DAY,SPACE)).sort(),expected.sort());
 const r=await f.api('availability?'+new URLSearchParams({date:DAY,space:SPACE,ref:expected[0]}));assert.equal(r.status,200);assert.equal(r.body.pending_count,6);assert.equal(r.body.next_wait_no,7);assert.equal(r.body.payment_blocked,true);assert.equal(r.body.wait,null);
 for(const secret of ['PRIVATE','01099998888','private@example.invalid','MS-WAIT','BK-'])assert.ok(!JSON.stringify(r.body).includes(secret));
 const two=await f.api('availability?'+new URLSearchParams({date:DAY,space:'megaspot-gundae-2'}));assert.equal(two.body.pending_count,1);
});

test('대기 순번은 저장 순번·복원 시각·접수시각·문의번호 기준으로 관리자와 일치한다',async t=>{
 const f=setup(t);f.pending({ref:'MS-C',data:{wait_rank:2}});f.pending({ref:'MS-B',data:{wait_rank:1}});f.pending({ref:'MS-D',data:{wait_restored_at:'2026-11-03'}});f.pending({ref:'MS-A',created:'2026-11-02'});
 assert.deepEqual(await waitList(f.env,DAY,SPACE),['MS-B','MS-C','MS-A','MS-D']);
 assert.deepEqual((await f.api('inquiries/MS-C')).body?.wait,undefined);
 const admin=await f.api('availability?date='+DAY);assert.equal(admin.body.next_wait_no,5);
 const detail=await f.handle(new Request('https://local.test/api/admin/inquiries/MS-C',{headers:{'x-admin-key':f.env.ADMIN_KEY}}));assert.deepEqual((await detail.json()).wait,(await waitSummary(f.env,DAY,SPACE,'MS-C')).wait);
});

test('로그인 소유 문의만 본인 현재 순번을 조회하고 마이페이지도 같은 순번을 반환한다',async t=>{
 const f=setup(t);f.pending({ref:'MS-FIRST',data:{wait_rank:1}});f.pending({ref:'MS-OWN',data:{wait_rank:2,member_id:1}});f.pending({ref:'MS-OTHER',data:{wait_rank:3,member_id:2}});
 for(const id of [1,2]){f.db.prepare("INSERT INTO members(id,email,name,phone,pw_hash,status,agreed_at,created_at) VALUES(?,?,?,?,?,'active','fixture','fixture')").run(id,'member'+id+'@example.invalid','회원'+id,'01012345678','unused');f.db.prepare('INSERT INTO sessions(token_hash,member_id,created_at,expires_at) VALUES(?,?,?,?)').run(await sha256('wait-member-'+id),id,'2026-01-01','2099-01-01');}
 const path='availability?'+new URLSearchParams({date:DAY,space:SPACE,ref:'MS-OWN'});
 assert.equal((await f.api(path)).body.wait,null);assert.equal((await f.api(path,'GET',undefined,'ms_in=1')).body.wait,null);assert.equal((await f.api(path,'GET',undefined,'ms_session=wait-member-2')).body.wait,null);
 const own=(await f.api(path,'GET',undefined,'ms_session=wait-member-1')).body;assert.deepEqual(own.wait,{no:2,total:3,date:DAY,space_id:SPACE});
 const passPath=path+'&product_id='+pass().product_id;
 assert.equal((await f.api(passPath)).body.wait,null);
 assert.deepEqual((await f.api(passPath,'GET',undefined,'ms_session=wait-member-1')).body.wait,own.wait);
 const res=await auth({env:f.env,params:{path:['inquiries']},request:new Request('https://local.test/api/auth/inquiries',{headers:{cookie:'ms_session=wait-member-1'}})});const items=(await res.json()).items;assert.deepEqual(items.map(x=>x.ref),['MS-OWN']);assert.deepEqual(items[0].wait,own.wait);
});

test('대기와 시간대 조회는 같은 스냅숏을 보며 마지막 문의가 확정돼도 겹친 시간이 열린 것으로 보이지 않는다',async t=>{
 const f=setup(t),input=pass(),ref=f.pending({date:input.date});
 const path='availability?'+new URLSearchParams({date:input.date,space:SPACE,product_id:input.product_id});
 const prepare=f.env.DB.prepare;let reads=0;
 f.env.DB.prepare=sql=>{
  const s=prepare(sql);
  for(const method of ['first','all']){
   const read=s[method];
   s[method]=async(...args)=>{
    const result=await read.apply(s,args);
    if(++reads===1)f.booking(ref,{date:input.date});
    return result;
   };
  }
  return s;
 };
 const before=await f.api(path);assert.equal(reads,1);assert.equal(before.status,200);assert.equal(before.body.pending_count,1);assert.equal(before.body.payment_blocked,true);assert.equal(before.body.slot_blocked,false);
 const after=await f.api(path);assert.equal(reads,2);assert.equal(after.body.pending_count,0);assert.equal(after.body.payment_blocked,false);assert.equal(after.body.slot_blocked,true);assert.equal(after.body.product_id,input.product_id);
 const dateOnly=(await f.api('availability?date='+input.date)).body;assert.equal(dateOnly.pending_count,0);assert.equal('slot_blocked' in dateOnly,false);assert.equal('product_id' in dateOnly,false);
 const r=await f.order(input);assert.equal(r.status,409);assert.equal(r.body.code,'DATE_TAKEN');assert.equal(f.calls(),0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
});

test('시간대 조회는 대기 취소와 맞닿는 예약을 허용하고 관리자 임시 확보는 결제와 동일하게 차단한다',async t=>{
 const f=setup(t),input=pass();f.pending({date:input.date,status:'대기 취소'});f.booking(null,{date:input.date,start:17,end:19});
 const path='availability?'+new URLSearchParams({date:input.date,product_id:input.product_id});
 const clear=(await f.api(path)).body;assert.equal(clear.pending_count,0);assert.equal(clear.slot_blocked,false);
 f.db.prepare('INSERT INTO calendar_blocks(space_id,date,state) VALUES(?,?,?)').run(SPACE,input.date,'hold');
 const held=(await f.api(path)).body;assert.equal(held.pending_count,0);assert.equal(held.slot_blocked,true);assert.equal((await f.order(input)).body.code,'DATE_TAKEN');assert.equal(f.calls(),0);
 for(const query of ['product_id=','product_id=addon-cleaning','product_id='+input.product_id+'&space=megaspot-gundae-2']){
  const r=await f.api('availability?date='+input.date+'&'+query);assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_PRODUCT');
 }
});

test('확정 예약과 겹친 공개 응답은 예약 정보를 숨기고 비회원 연결·재결제는 서버 일치 검증을 유지한다',async t=>{
 const f=setup(t),input=pass(),code=f.booking('MS-TEST',{date:input.date,code:'BK-LINKED'});
 const path='availability?'+new URLSearchParams({date:input.date,product_id:input.product_id,ref:'MS-TEST'});
 const state=(await f.api(path)).body;assert.equal(state.slot_blocked,true);assert.equal(state.wait,null);
 for(const privateValue of [code,'MS-TEST','01012345678','booking_code','customer_name'])assert.ok(!JSON.stringify(state).includes(privateValue));
 const wrong=await f.order({...input,inquiry_ref:'MS-TEST',buyer:{name:'모의 고객',phone:'01099995678'}});
 assert.equal(wrong.body.code,'BOOKING_MISMATCH');assert.equal(f.calls(),0);
 const linked=await f.order({...input,inquiry_ref:'MS-TEST'});assert.equal(linked.status,200);
 const previous=f.seed({status:'failed',linked:false});
 const retry=await f.order({...input,retry_oid:previous.oid});assert.equal(retry.status,200);assert.equal(f.calls(),2);
 for(const result of [linked,retry])assert.equal(JSON.parse(f.db.prepare('SELECT data FROM orders WHERE oid=?').get(result.body.oid).data).linked_booking_code,code);
});

test('유효 예약 대기 한 건이면 시간이 달라도 이용권 결제 요청·주문 생성을 차단한다',async t=>{
 const f=setup(t),input=pass();f.pending({date:input.date,data:{start_h:18,end_h:31}});
 const r=await f.order(input);assert.equal(r.status,409);assert.equal(r.body.code,'RESERVATION_PENDING');assert.equal(r.body.pending_count,1);assert.equal(r.body.next_wait_no,2);assert.equal(f.calls(),0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
});

test('본인만 대기 중이어도 결제 우회하지 못하며 기존 확정 예약 추가 이용권도 대기일에는 차단한다',async t=>{
 const f=setup(t),input=pass();f.db.prepare('UPDATE inquiries SET event_date=? WHERE ref=?').run(input.date,'MS-TEST');
 assert.equal((await f.order({...input,inquiry_ref:'MS-TEST'})).body.code,'RESERVATION_PENDING');
 f.booking('MS-TEST',{code:'BK-LINKED',date:input.date});f.pending({date:input.date});assert.equal((await f.order({...input,inquiry_ref:'MS-TEST'})).body.code,'RESERVATION_PENDING');assert.equal(f.calls(),0);
});

test('대기 취소·삭제·다른 날짜/호점 대기는 막지 않고 옵션 단독 결제는 영향을 받지 않는다',async t=>{
 const f=setup(t),input=pass();f.pending({date:input.date,status:'대기 취소'});f.pending({date:input.date,status:'삭제됨'});f.pending({date:input.date,space:'megaspot-gundae-2'});f.pending({date:OTHER});
 assert.equal((await f.order(input)).status,200);f.pending({date:input.date});assert.equal((await f.order({product_id:'addon-cleaning',date:input.date,qty:1})).status,200);assert.equal(f.calls(),2);
});

for(const linked of [false,true])test('결제창 이후 생긴 대기는 '+(linked?'기존 예약을 유지하고 추가 수납만':'신규 수납을')+' 검토로 보존한다',async t=>{
 const f=setup(t),input=pass();if(linked)f.booking('MS-TEST',{code:'BK-LINKED',date:input.date});
 const prepared=await f.order({...input,inquiry_ref:linked?'MS-TEST':''});assert.equal(prepared.status,200);f.pending({date:input.date});
 for(const [key,value] of [['reservation_guide',{enabled:true,automatic:true,template_code:'UN_2584',spaces:[SPACE]}],['deposit_alimtalk',{enabled:true,types:{payment:true,account:true,refunded:true}}]])f.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run(key,JSON.stringify(value),'fixture');
 const paid=await f.paid(prepared.body.oid);assert.equal(paid.status,'paid');assert.equal(paid.booking_status,'payment_review');if(linked){assert.notEqual(paid.booking_code,'BK-LINKED');assert.equal(f.db.prepare("SELECT status FROM bookings WHERE booking_code='BK-LINKED'").get().status,'confirmed');}
 for(const table of ['booking_guide_events','booking_guide_messages','deposit_notifications'])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE booking_code=?').get(paid.booking_code).n,0);
});

test('최종 결제 트랜잭션 직전에 들어온 대기도 원자 검사로 신규 확정을 막는다',async t=>{
 const f=setup(t),input=pass(),prepared=await f.order(input),batch=f.env.DB.batch.bind(f.env.DB);let inserted=false;
 f.env.DB.batch=ss=>{if(!inserted){inserted=true;f.pending({date:input.date});}return batch(ss);};const paid=await f.paid(prepared.body.oid);assert.equal(paid.booking_status,'payment_review');
});

test('문의 제출 응답은 방금 접수한 본인 정확 순번을 반환하고 미정 일정에는 순번을 붙이지 않는다',async t=>{
 const f=setup(t),input=pass();f.pending({date:input.date,data:{wait_rank:1}});
 async function submit(body){const r=await inquire({env:f.env,request:new Request('https://local.test/api/inquiry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'제출 고객',phone:'01012345678',agree_privacy:true,space_id:SPACE,...body})})});assert.equal(r.status,200);return r.json();}
 const result=await submit({date:input.date,reserve:true,start_h:10,end_h:17,headcount:30});assert.deepEqual(result.wait,{no:2,total:2,date:input.date,space_id:SPACE});assert.equal((await f.order({...input,inquiry_ref:result.ref})).body.code,'RESERVATION_PENDING');
 const undecided=await submit({});assert.equal(undecided.wait,null);
});

test('공개 예약 달력은 문의나 대기 건수를 제공하지 않는다',async t=>{
 const f=setup(t);f.pending();f.pending({space:'request'});f.pending({space:'megaspot-gundae-2'});f.pending({status:'대기 취소'});f.pending({date:OTHER});
 const response=await calendar({env:f.env,request:new Request('https://local.test/api/reservation-calendar?from='+DAY+'&to='+DAY)}),body=await response.json();assert.equal(response.status,200);
 assert.equal('pendingDates' in body,false);assert.deepEqual(body.intervals,[]);assert.deepEqual(body.unknownDates,[]);for(const secret of ['PRIVATE','01099998888','private@example.invalid','MS-WAIT'])assert.ok(!JSON.stringify(body).includes(secret));
});

test('대기 조회 API는 알림·가이드·주차 발송 작업을 예약하지 않는다',async t=>{
 const f=setup(t),jobs=[];for(const suffix of ['', '/'])await middleware({env:f.env,request:new Request('https://local.test/api/pay/availability'+suffix+'?date='+DAY),next:async()=>new Response('ok'),waitUntil:p=>jobs.push(p)});assert.equal(jobs.length,0);assert.equal(f.calls(),0);
 for(const query of ['date=2026-02-30','date='+kstToday(-1),'date='+DAY+'&space=evil'])assert.equal((await f.api('availability?'+query)).status,400);
});

test('검토 예약 생성으로 대기가 제외돼도 같은 트랜잭션의 수납 대상을 바꾸지 않는다',async t=>{
 const f=setup(t),seed=f.seed({status:'created',slot:'pkg-day'});f.booking('MS-OTHER',{code:'BK-TEST',date:DAY});f.db.prepare("UPDATE inquiries SET event_date=? WHERE ref='MS-TEST'").run(DAY);
 await f.feedback(await f.form(seed,'4'));const row=f.db.prepare('SELECT o.booking_code,b.status FROM orders o JOIN bookings b ON b.booking_code=o.booking_code WHERE o.oid=?').get(seed.oid);assert.notEqual(row.booking_code,'BK-TEST');assert.equal(row.status,'payment_review');assert.equal(f.db.prepare("SELECT status FROM bookings WHERE booking_code='BK-TEST'").get().status,'confirmed');
});

test('회원 문의는 최초 순번을 표시한 뒤 현재 탭·복귀·수동 갱신에서 최신 상태를 반영한다',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const nodes=new Map(),element=s=>{
  if(!nodes.has(s)) nodes.set(s,Object.assign(new EventTarget(),{innerHTML:'',textContent:'',value:'',setAttribute(){},parentNode:{appendChild(){}}}));
  return nodes.get(s);
 };
 let requests=0,draws=0,html='',next;
 let details={dataset:{inquiryDetail:'MS-OWN-estimate'},open:false};
 Object.defineProperty(element('#my-inquiries'),'innerHTML',{get:()=>html,set:value=>{html=value;draws++;details={dataset:{inquiryDetail:'MS-OWN-estimate'},open:false};}});
 const inquiry={ref:'MS-OWN',space_id:SPACE,status:'문의 접수',date:DAY,headcount:30,estimate:'고객이 보낸 견적',wait:{no:2,total:3,date:DAY,space_id:SPACE}};
 next=()=>({items:[inquiry]});
 const M={$:s=>['#signup-form','#login-form'].includes(s)?null:element(s),$$:s=>s.includes('[open]')?(details.open?[details]:[]):[details],esc:v=>String(v??''),fmtKDate:s=>s,checkApi:async()=>true,api:async p=>{
  if(p==='/auth/me')return {member:{name:'검증 고객'}};
  if(p==='/auth/inquiries'){requests++;return next();}
  return {items:[]};
 }};
 const window=Object.assign(new EventTarget(),{MEGASPOT:M,setInterval});
 const document=Object.assign(new EventTarget(),{hidden:false,createElement:()=>({innerHTML:'',setAttribute(){}})});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 runInNewContext(readFileSync(new URL('../assets/js/pages/account.js',import.meta.url),'utf8'),{window,document,location:{search:''},URLSearchParams});await flush();
 assert.match(html,/예약 대기 2번/);assert.match(html,/같은 날 3건 가운데 현재 2번째/);assert.match(html,/순서대로 예약 가능 여부와 결제 방법/);
 details.open=true;
 t.mock.timers.tick(30000);await flush();assert.equal(requests,2);assert.equal(draws,1);assert.equal(details.open,true);
 document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));t.mock.timers.tick(60000);await flush();assert.equal(requests,2);
 let resolvePending;next=()=>new Promise(resolve=>{resolvePending=resolve;});
 document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));
 assert.equal(requests,3,'동일 시점의 복귀 이벤트는 같은 요청을 사용');
 resolvePending({items:[{...inquiry,wait:{...inquiry.wait,no:1,total:2}}]});await flush();
 assert.match(html,/예약 대기 1번/);assert.equal(details.open,true,'순번이 바뀌어도 열어 둔 견적은 유지');
 next=()=>{throw Error('temporary failure');};
 element('#my-inquiry-refresh').dispatchEvent(new Event('click'));await flush();
 assert.match(html,/예약 대기 1번/);assert.match(element('#my-inquiry-status').textContent,/마지막으로 확인한 내용/);
 next=()=>({items:[{...inquiry,status:'예약 확정',wait:null,confirmed_bookings:[{code:'BK-ACTUAL',space_id:SPACE,date:DAY,status:'confirmed'}]}]});
 window.dispatchEvent(new Event('focus'));await flush();
 assert.doesNotMatch(html,/예약 대기 [12]번/);assert.match(html,/확정된 예약/);assert.equal(element('#my-inquiry-status').textContent,'');
});
