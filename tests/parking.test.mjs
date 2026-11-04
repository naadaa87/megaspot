import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/api/parking/[[path]].js';
import {parkingInput,plateOf,POLICY,arrivalWindow} from '../functions/api/_parking.js';
import {sha256,kstToday} from '../functions/api/_lib.js';import {kstStamp} from '../functions/api/_payapp.js';
const ORIGIN='https://megaspot.test';
function fixture(t){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
 const DB={prepare(sql){const st=db.prepare(sql);let a=[];return{bind(...v){a=v;return this;},async first(){return st.get(...a)||null;},async all(){return{results:st.all(...a)};},async run(){return{meta:{changes:Number(st.run(...a).changes)}};},exec(){return{meta:{changes:Number(st.run(...a).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const out=stmts.map(s=>s.exec());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,ADMIN_KEY:'test-admin',PAYAPP_USERID:'test-seller',PAYAPP_LINKKEY:'test-link',PAYAPP_LINKVAL:'test-value',PAYAPP_REQUESTKEY:'test-request'};let sent,n=123;
 t.mock.method(globalThis,'fetch',async(url,o)=>{assert.equal(url,'https://api.payapp.kr/oapi/v2');sent=new URLSearchParams(o.body);return new Response(new URLSearchParams({state:'1',mul_no:String(n++),payurl:'https://payapp.kr/test-payment'}));});
 t.mock.method(Date,'now',()=>Date.parse('2026-11-03T14:00:00+09:00'));
 function call(path,method='GET',body,key,admin=false,origin=ORIGIN){return onRequest({env,params:{path:path.split('?')[0].split('/')},request:new Request(ORIGIN+'/api/parking/'+path,{method,headers:{origin,'content-type':path==='feedback'?'application/x-www-form-urlencoded':'application/json',...(key?{Authorization:'Bearer '+key}:{}),...(admin?{'x-admin-key':'test-admin'}:{})},...(body===undefined?{}:{body:path==='feedback'?new URLSearchParams(body).toString():JSON.stringify(body)})})});}
 const admin=(path,body)=>call('admin/'+path,body?'POST':'GET',body,null,true);
 async function enable(){const r=await call('admin/settings','PUT',{enabled:true},null,true);assert.equal(r.status,200);}
 const input=(extra={})=>({ticket:'2h',plate:'123가4567',plate_confirm:'123가4567',date:'2026-11-03',name:'주차 테스트',phone:'01000000000',policy:POLICY,agree_terms:true,agree_privacy:true,agree_refund:true,confirmed:true,...extra});
 async function buy(extra={}){await enable();const r=await call('prepare','POST',input(extra));const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j;}
 async function feedback(p,state='4',extra={}){const row=db.prepare('SELECT o.*,p.nonce,p.mul_no FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(p.oid),stamp=kstStamp();return call('feedback','POST',{userid:env.PAYAPP_USERID,linkkey:env.PAYAPP_LINKKEY,linkval:env.PAYAPP_LINKVAL,responsedate:stamp,hash:await sha256(env.PAYAPP_USERID+stamp+env.PAYAPP_REQUESTKEY),var1:row.oid,var2:row.nonce,mul_no:row.mul_no,price:String(row.price),pay_state:state,...extra});}
 const get=async p=>(await (await call('orders/'+p.oid,'GET',undefined,p.key)).json()).order;
 const claim=(p,extra={})=>admin('orders/'+p.oid+'/claim',{entry_id:'ENTRY-001',entry_at:'2026-11-03T13:00',plate_confirm:'123가4567',confirm_entry:true,...extra});
 const complete=p=>admin('orders/'+p.oid+'/complete',{cost:0,confirm_applied:true});
 return{db,env,call,admin,input,buy,get,claim,complete,feedback,sent:()=>sent};
}
test('차량번호 정규화·전체 재입력·정책 확인·판매 기간·일일권 미확정 검증',t=>{
 const f=fixture(t);assert.equal(plateOf(' 123 가-4567 '),'123가4567');assert.equal(plateOf('서울12가3456'),'서울12가3456');assert.equal(plateOf('4567'),null);
 for(const extra of [{plate_confirm:'123가4568'},{price:1,confirmed:false},{ticket:'daily'},{date:'2026-11-07'},{date:'2026-11-01'},{date:'2026-12-25'},{phone:'abc'},{agree_privacy:'false'},{ticket:['1h']},{ticket:'constructor'},{ticket:'__proto__'}])assert.ok(parkingInput(f.input(extra)).error,JSON.stringify(extra));
 assert.equal(parkingInput(f.input({price:1})).price,8000);
 assert.equal(arrivalWindow(Date.parse('2026-11-03T09:59:00+09:00')),false);assert.equal(arrivalWindow(Date.parse('2026-11-03T17:49:00+09:00')),true);assert.equal(arrivalWindow(Date.parse('2026-11-03T17:50:00+09:00')),false);
});
test('판매는 기본 준비 상태·관리자 인증·외부 출처 요청 거절',async t=>{
 const f=fixture(t);assert.equal((await(await f.call('config')).json()).enabled,false);assert.equal((await f.call('prepare','POST',f.input())).status,503);
 assert.equal((await(await f.call('config')).json()).daily_basis,'calendar');
 assert.equal((await f.call('admin/orders')).status,401);assert.equal((await f.call('admin/settings','PUT',{enabled:true},null,true,'https://evil.test')).status,403);
});
test('주차 결제는 서버 판매가·서명 통보만 사용하고 예약을 생성하지 않는다',async t=>{
 const f=fixture(t),p=await f.buy({price:1});assert.match(p.oid,/^MS[0-9A-F]{20}$/);assert.match(p.key,/^[0-9a-f]{64}$/);assert.equal(f.sent().get('price'),'8000');assert.equal(f.sent().get('feedbackurl'),ORIGIN+'/api/parking/feedback');assert.ok(!f.sent().get('returnurl').includes(p.key));
 assert.equal((await f.get(p)).payment_status,'created');assert.notEqual((await f.feedback(p,'4',{price:'1'})).status,200);
 assert.equal(await(await f.feedback(p)).text(),'SUCCESS');assert.equal(await(await f.feedback(p)).text(),'SUCCESS');assert.equal((await f.get(p)).payment_status,'paid');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,0);
 assert.equal((await f.call('orders/'+p.oid)).status,403);assert.equal((await f.call('orders/'+p.oid,'GET',undefined,'a'.repeat(64))).status,403);
 const publicData=await(await f.call('orders/'+p.oid,'GET',undefined,p.key)).json();for(const secret of ['token_hash','free_hours','buyer_phone','memo','test-link'])assert.ok(!JSON.stringify(publicData).includes(secret));
});
test('입차 알림은 운영일·운영시간·결제 확인 후에만 접수한다',async t=>{
 const f=fixture(t),p=await f.buy();assert.equal((await f.call('orders/'+p.oid+'/arrive','POST',{},p.key)).status,409);await f.feedback(p);
 assert.equal((await f.call('orders/'+p.oid+'/arrive','POST',{},p.key)).status,200);assert.equal((await f.get(p)).status,'requested');
 t.mock.method(Date,'now',()=>Date.parse('2026-11-03T19:00:00+09:00'));assert.equal((await f.call('orders/'+p.oid+'/arrive','POST',{},p.key)).status,409);
});
test('1·2·3시간권 각각 무료1+유료0·1·2 배정',async t=>{
 const f=fixture(t);let i=1;for(const ticket of ['1h','2h','3h']){const p=await f.buy({ticket,plate:'123가'+String(4500+i),plate_confirm:'123가'+String(4500+i)});await f.feedback(p);const r=await f.claim(p,{entry_id:'ENTRY-'+i,plate_confirm:'123가'+String(4500+i)});assert.equal(r.status,200,await r.text());const row=f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(p.oid);assert.equal(row.free_hours,1);assert.equal(row.paid_hours,i-1);i++;}
});
test('같은 입차ID 추가 구매는 무료1시간을 재사용하지 않고 동시 처리도 잠근다',async t=>{
 const f=fixture(t),a=await f.buy({ticket:'1h'});await f.feedback(a);
 assert.equal((await f.call('prepare','POST',f.input({ticket:'1h'}))).status,409);
 const b=await f.buy({ticket:'1h',confirm_extra:true});await f.feedback(b);
 assert.equal((await f.claim(a)).status,200);assert.equal((await f.claim(b)).status,409);assert.equal((await f.complete(a)).status,200);assert.equal((await f.claim(b)).status,200);
 const row=f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(b.oid);assert.equal(row.free_hours,0);assert.equal(row.paid_hours,1);
});
test('다른 업체에서 무료 사용된 입차 건에는 유료 전체 배정·다른 차량 입차ID 재사용 거절',async t=>{
 const f=fixture(t),a=await f.buy();await f.feedback(a);assert.equal((await f.claim(a,{free_used:true})).status,200);let row=f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(a.oid);assert.equal(row.free_hours,0);assert.equal(row.paid_hours,2);await f.complete(a);
 const b=await f.buy({plate:'123나7777',plate_confirm:'123나7777'});await f.feedback(b);assert.equal((await f.claim(b,{plate_confirm:'123나7777'})).status,409);
});
test('등록 결과 불확실은 무료 배정을 유지·미적용 확인 때만 복구',async t=>{
 const f=fixture(t),p=await f.buy();await f.feedback(p);await f.claim(p);await f.admin('orders/'+p.oid+'/issue',{memo:'등록 결과 불명확'});
 assert.equal(f.db.prepare('SELECT free_order FROM parking_sessions').get().free_order,p.oid);
 assert.equal((await f.admin('orders/'+p.oid+'/reset',{memo:'다시 시도'})).status,400);
 assert.equal((await f.admin('orders/'+p.oid+'/reset',{memo:'미적용 확인',confirm_not_applied:true})).status,200);assert.equal(f.db.prepare('SELECT free_order FROM parking_sessions').get().free_order,null);
});
test('취소 문의는 실제 환불과 구분·환불 전후 등록 차단·적용완료 기록 보존',async t=>{
 const f=fixture(t),p=await f.buy();await f.feedback(p);await f.call('orders/'+p.oid+'/cancel-request','POST',{reason:'차량번호 정정'},p.key);
 assert.equal((await f.get(p)).payment_status,'paid');assert.equal((await f.claim(p)).status,409);
 await f.admin('orders/'+p.oid+'/refund-reviewed',{memo:'구매자 확인 후 계속 진행'});assert.equal((await f.claim(p)).status,200);await f.complete(p);await f.feedback(p,'9');
 const item=await f.get(p);assert.equal(item.payment_status,'refunded');assert.equal(item.status,'applied');assert.equal((await f.claim(p)).status,409);
});
test('같은 주문의 입차ID 교체 재요청은 다른 입차 건 무료 시간을 예약하지 않는다',async t=>{
 const f=fixture(t),p=await f.buy();await f.feedback(p);await f.claim(p);assert.equal((await f.claim(p,{entry_id:'ENTRY-OTHER'})).status,409);
 assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM parking_sessions WHERE free_order=?").get(p.oid).n,1);
});

test('배포 시 자동 스키마 초기화로 주차 테이블·잠금 인덱스가 생성된다',async t=>{
 const {SCHEMA}=await import('../functions/api/_schema.js');const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const sql of SCHEMA)db.exec(sql);for(const sql of SCHEMA)db.exec(sql);
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='parking_orders'").get());
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='parking_one_processing_per_entry'").get());
});

test('일일권은 확인된 이용 조건 설정 후에만 판매하고 구매 시점 조건을 보존한다',async t=>{
 const f=fixture(t),settings={enabled:true,daily_enabled:true,daily_basis:'calendar',daily_details:'테스트 조건: 재입차 불가',daily_rollover:'테스트 조건: 자정 이후 현장 정산, 연속 적용 불가'};
 assert.equal((await(await f.call('config')).json()).tickets.daily.available,false);
 assert.equal((await f.call('admin/settings','PUT',settings,null,true)).status,400);
 assert.equal((await f.call('admin/settings','PUT',{...settings,confirm_daily:true},null,true)).status,200);
 const terms=(await(await f.call('config')).json()).daily_terms;
 assert.match(terms,/당일 23:59/);assert.match(terms,/자정 이후 현장 정산/);
 assert.equal((await(await f.call('config')).json()).tickets.daily.available,true);
 assert.equal((await f.call('prepare','POST',f.input({ticket:'daily',daily_terms:'다른 조건',agree_daily:true}))).status,409);
 assert.equal((await f.call('prepare','POST',f.input({ticket:'daily',daily_terms:terms}))).status,400);
 const p=await f.buy({ticket:'daily',daily_terms:terms,agree_daily:true});assert.equal(p.total,30000);await f.feedback(p);assert.equal((await f.get(p)).daily_terms,terms);
 assert.equal(JSON.parse(f.db.prepare('SELECT data FROM orders WHERE oid=?').get(p.oid).data).agree_daily,true);
 await f.call('admin/settings','PUT',{enabled:true,daily_enabled:false,daily_details:'미확정 내부 초안'},null,true);
 assert.equal((await(await f.call('config')).json()).daily_terms,'');assert.equal((await f.get(p)).daily_terms,terms);
 assert.equal((await f.claim(p)).status,200);const row=f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(p.oid);assert.equal(row.free_hours,1);assert.equal(row.paid_hours,0);assert.equal(f.db.prepare('SELECT free_order FROM parking_sessions').get().free_order,p.oid);
});

test('일일권 종료 기준과 익일 정산 미확인 상태는 활성화되지 않으며 초안은 공개하지 않는다',async t=>{
 const f=fixture(t),base={enabled:true,daily_enabled:true,daily_basis:'calendar',daily_details:'재입차 불가',daily_rollover:'익일 요금 현장 정산, 연속 적용 불가',confirm_daily:true};
 for(const extra of [{daily_basis:'unconfirmed'},{daily_basis:'constructor'},{daily_basis:'__proto__'},{daily_basis:[]},{daily_details:''},{daily_rollover:''},{confirm_daily:false}])assert.equal((await f.call('admin/settings','PUT',{...base,...extra},null,true)).status,400,JSON.stringify(extra));
 await f.call('admin/settings','PUT',{...base,daily_enabled:false},null,true);
 const c=await(await f.call('config')).json();assert.equal(c.daily_enabled,false);assert.equal(c.daily_terms,'');assert.equal(c.daily_basis,'calendar');assert.equal(c.daily_details,undefined);assert.equal(c.daily_rollover,undefined);
});

test('종료 기준 없는 구형 일일권 설정은 판매 보류하고 시간권 판매는 유지한다',async t=>{
 const f=fixture(t);
 f.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('parking',?,'2026-11-03 05:00:00')").run(JSON.stringify({enabled:true,daily_enabled:true,daily_terms:'미확인 구형 자유문구'}));
 const c=await(await f.call('config')).json();assert.equal(c.enabled,true);assert.equal(c.daily_enabled,false);assert.equal(c.tickets.daily.available,false);assert.equal(c.tickets['1h'].available,true);assert.equal(c.daily_terms,'');
});

test('24시간 기준도 별도 확인 후 판매하며 기존 주문 조건은 새 설정으로 바뀌지 않는다',async t=>{
 const f=fixture(t),base={enabled:true,daily_enabled:true,daily_basis:'24h',daily_details:'1회 입차 기준, 재입차 불가',daily_rollover:'24시간 초과분 현장 정산, 연속 적용 불가',confirm_daily:true};
 assert.equal((await f.call('admin/settings','PUT',base,null,true)).status,200);
 const c=await(await f.call('config')).json();assert.match(c.daily_terms,/입차 시각부터 24시간/);assert.doesNotMatch(c.daily_terms,/당일 23:59/);
 const p=await f.buy({ticket:'daily',daily_terms:c.daily_terms,agree_daily:true});await f.feedback(p);
 assert.equal((await f.call('admin/settings','PUT',{...base,daily_basis:'calendar',daily_rollover:'자정 초과분 현장 정산, 연속 적용 불가'},null,true)).status,200);
 assert.equal((await f.get(p)).daily_terms,c.daily_terms);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);assert.equal((await f.get(p)).price,30000);
});

test('익일 추가 시간권은 이용일 도래·운영자 확인 후 같은 입차ID에 연결하고 무료 시간을 재배정하지 않는다',async t=>{
 const f=fixture(t),first=await f.buy({ticket:'1h'});await f.feedback(first);assert.equal((await f.claim(first)).status,200);await f.complete(first);
 const next=await f.buy({ticket:'1h',date:'2026-11-04'});await f.feedback(next);
 assert.equal((await f.claim(next,{confirm_overnight:true})).status,409);
 t.mock.method(Date,'now',()=>Date.parse('2026-11-04T14:00:00+09:00'));
 assert.equal((await f.claim(next)).status,409);
 assert.equal((await f.claim(next,{confirm_overnight:true})).status,200);
 const row=f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(next.oid);
 assert.equal(row.session_id,f.db.prepare('SELECT session_id FROM parking_orders WHERE oid=?').get(first.oid).session_id);assert.equal(row.free_hours,0);assert.equal(row.paid_hours,1);assert.match(row.memo,/2026-11-04 이용분/);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM parking_sessions').get().n,1);
});

test('익일 일일권도 당일 등록 확인이 필요하며 과거 이용권에 더 늦은 입차를 연결할 수 없다',async t=>{
 const f=fixture(t);
 await f.call('admin/settings','PUT',{enabled:true,daily_enabled:true,daily_basis:'calendar',daily_details:'재입차는 사전 문의',daily_rollover:'익일 계속 주차 시 다음 날 시간권 또는 일일권 별도 구매',confirm_daily:true},null,true);
 const c=await(await f.call('config')).json(),p=await f.buy({ticket:'daily',date:'2026-11-04',daily_terms:c.daily_terms,agree_daily:true});await f.feedback(p);
 t.mock.method(Date,'now',()=>Date.parse('2026-11-04T14:00:00+09:00'));
 assert.equal((await f.claim(p,{entry_at:'2026-11-05T13:00',confirm_overnight:true})).status,400);
 assert.equal((await f.claim(p)).status,409);assert.equal((await f.claim(p,{confirm_overnight:true})).status,200);
 const row=f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(p.oid);assert.equal(row.free_hours,1);assert.equal(row.paid_hours,0);assert.match((await f.get(p)).daily_terms,/다음 날 시간권 또는 일일권 별도 구매/);
});

test('일일권도 무료1시간을 먼저 배정하고 같은 입차ID 추가 구매에는 중복 배정하지 않는다',async t=>{
 const f=fixture(t);await f.call('admin/settings','PUT',{enabled:true,daily_enabled:true,daily_basis:'calendar',daily_details:'당일 자정 종료',daily_rollover:'익일 별도 구매',confirm_daily:true},null,true);
 const terms=(await(await f.call('config')).json()).daily_terms;
 const daily=await f.buy({ticket:'daily',daily_terms:terms,agree_daily:true});await f.feedback(daily);await f.claim(daily);
 assert.equal(f.db.prepare('SELECT free_hours FROM parking_orders WHERE oid=?').get(daily.oid).free_hours,1);await f.complete(daily);
 const extra=await f.buy({ticket:'1h',confirm_extra:true});await f.feedback(extra);await f.claim(extra);
 const row=f.db.prepare('SELECT free_hours,paid_hours FROM parking_orders WHERE oid=?').get(extra.oid);assert.equal(row.free_hours,0);assert.equal(row.paid_hours,1);
});
