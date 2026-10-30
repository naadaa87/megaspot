import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/pay/[[path]].js';
import { kstStamp, payappUrl, requestPayment, payappConfig } from '../functions/api/_payapp.js';
import { sha256, kstToday } from '../functions/api/_lib.js';
import { PRODUCTS } from '../functions/api/_catalog.js';
import { dayCol, peakOf } from '../functions/api/pay/[[path]].js';
const ORIGIN='https://megaspot.test';
function fixture(){
  const db=new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const DB={prepare(sql){const st=db.prepare(sql);let a=[];return {bind(...args){a=args;return this;},async first(){return st.get(...a)||null;},async all(){return {results:st.all(...a)};},async run(){return {meta:{changes:Number(st.run(...a).changes)}};},exec(){return {meta:{changes:Number(st.run(...a).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.exec());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const env={DB,PAYAPP_USERID:'seller-test',PAYAPP_LINKKEY:'link-test',PAYAPP_LINKVAL:'value-test',PAYAPP_REQUESTKEY:'request-test'};
  const call=(path,method='GET',body)=>onRequest({env,params:{path:path.split('?')[0].split('/')},request:new Request(ORIGIN+'/api/pay/'+path,{method,headers:{origin:ORIGIN,'content-type':path==='feedback'?'application/x-www-form-urlencoded':'application/json'},...(body===undefined?{}:{body:path==='feedback'?new URLSearchParams(body).toString():JSON.stringify(body)})})});
  const seed=(suffix='ABCDEF',pass=false)=>{const oid='MS20261030120000'+suffix,nonce='order-secret-'+suffix;let product=PRODUCTS.items.find(x=>x.kind==='addon'),date=null,data={lines:[],provider:'payapp'};
    if(pass){for(let n=1;n<100;n++){date=kstToday(n);if(peakOf(date))continue;product=PRODUCTS.items.find(x=>x.kind==='pass'&&PRODUCTS.dayGroups[x.group].cols.includes(dayCol(date)));if(product)break;}data.slot='pkg-'+product.pkg;}
    db.prepare('INSERT INTO orders (oid,product_id,title,event_date,people,price,buyer_name,buyer_phone,data,status,test,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(oid,product.id,product.name,date,20,100000,'테스트','01012345678',JSON.stringify(data),'created',0,'2026-10-30 12:00:00');
    db.prepare('INSERT INTO payapp_payments (oid,mul_no,nonce,created_at) VALUES (?,?,?,?)').run(oid,'100'+String(parseInt(suffix,16)),nonce,'2026-10-30');return db.prepare('SELECT o.*,p.mul_no,p.nonce FROM orders o JOIN payapp_payments p ON o.oid=p.oid WHERE o.oid=?').get(oid);};
  const form=async(row,state='4',extra={})=>{const stamp=kstStamp();return {userid:env.PAYAPP_USERID,linkkey:env.PAYAPP_LINKKEY,linkval:env.PAYAPP_LINKVAL,responsedate:stamp,hash:await sha256(env.PAYAPP_USERID+stamp+env.PAYAPP_REQUESTKEY),var1:row.oid,var2:row.nonce,mul_no:row.mul_no,price:String(row.price),pay_type:'1',pay_state:state,...extra};};
  const order=oid=>db.prepare('SELECT * FROM orders WHERE oid=?').get(oid);
  return {db,env,call,seed,form,order};
}
test('설정은 비밀값을 노출하지 않고 키 없으면 주문 생성 차단',async()=>{
  const f=fixture();delete f.env.PAYAPP_REQUESTKEY;
  const c=await(await f.call('config')).json();assert.equal(c.enabled,false);assert.equal(c.test,false);assert.equal(c.provider,'payapp');assert.equal(JSON.stringify(c).includes('link-test'),false);
  assert.equal((await f.call('prepare','POST',{})).status,503);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
});
test('결제 요청은 서버 금액·서명·주문 nonce로 만들어지고 키가 브라우저에 전달되지 않음',async(t)=>{
  const f=fixture(),product=PRODUCTS.items.find(x=>x.kind==='addon');let sent;
  t.mock.method(globalThis,'fetch',async(url,opts)=>{assert.equal(url,'https://api.payapp.kr/oapi/v2');sent=new URLSearchParams(opts.body);return new Response(new URLSearchParams({state:'1',mul_no:'12345',payurl:'https://payapp.kr/test-payment'}));});
  const r=await f.call('prepare','POST',{product_id:product.id,qty:2,price:1,buyer:{name:'테스트',phone:'01012345678'},agree_terms:true,agree_privacy:true,agree_refund:true});
  const result=await r.json();assert.equal(r.status,200);assert.equal(result.total,product.price*2);assert.equal(sent.get('price'),String(product.price*2));assert.equal(sent.get('smsuse'),'n');assert.equal(sent.get('checkretry'),'y');assert.equal(sent.get('feedbackurl'),ORIGIN+'/api/pay/feedback');
  assert.equal(sent.get('hash'),await sha256(f.env.PAYAPP_USERID+sent.get('requestdate')+f.env.PAYAPP_REQUESTKEY));assert.equal(sent.has('requestkey'),false);
  assert.equal(f.order(result.oid).status,'created');assert.equal(f.db.prepare('SELECT mul_no FROM payapp_payments WHERE oid=?').get(result.oid).mul_no,'12345');
  const serialized=JSON.stringify(result);for(const secret of ['link-test','value-test','request-test',sent.get('var2')])assert.equal(serialized.includes(secret),false);
});
test('위조·오래된 통보·잘못된 금액·거래번호·주문 nonce 거절',async()=>{
  const f=fixture(),o=f.seed();
  for(const extra of [{hash:'bad'},{linkval:'bad'},{var2:'bad'},{price:'1'},{price:'100000x'},{mul_no:'999999'},{responsedate:'20000101000000'}]){assert.notEqual((await f.call('feedback','POST',await f.form(o,'4',extra))).status,200);assert.equal(f.order(o.oid).status,'created');}
});
test('동시·반복 완료 통보는 예약 한 건만 생성, DB 오류 시 롤백 후 재시도 가능',async()=>{
  const f=fixture(),o=f.seed('ABCDEF',true),form=await f.form(o);
  f.db.exec("CREATE TRIGGER fail_payment BEFORE UPDATE OF status ON orders WHEN NEW.status = 'paid' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.equal((await f.call('feedback','POST',form)).status,500);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,0);assert.equal(f.order(o.oid).status,'created');f.db.exec('DROP TRIGGER fail_payment');
  for(const r of await Promise.all([f.call('feedback','POST',form),f.call('feedback','POST',form)]))assert.equal(await r.text(),'SUCCESS');
  assert.equal(f.order(o.oid).status,'paid');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,1);
  assert.equal(await(await f.call('feedback','POST',form)).text(),'SUCCESS');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,1);
  await f.call('feedback','POST',await f.form(o,'10'));assert.equal(f.order(o.oid).status,'paid');
});
test('return URL은 화면 이동만 수행하며 승인으로 처리하지 않음',async()=>{
  const f=fixture(),o=f.seed();assert.equal((await f.call('return?oid='+o.oid,'POST',{resultCode:'0000'})).status,303);assert.equal(f.order(o.oid).status,'created');
});
test('입금 대기 → 결제 완료 → 전체 취소, 늦은 승인 통보로 예약이 살아나지 않음',async()=>{
  const f=fixture(),o=f.seed('ABCDEF',true);
  await f.call('feedback','POST',await f.form(o,'10'));assert.equal(f.order(o.oid).status,'pending');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,0);
  await f.call('feedback','POST',await f.form(o,'4'));await f.call('feedback','POST',await f.form(o,'9'));assert.equal(f.order(o.oid).status,'refunded');assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'cancelled');
  await f.call('feedback','POST',await f.form(o,'4'));assert.equal(f.order(o.oid).status,'refunded');assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'cancelled');
});
test('부분 취소는 원거래 검증·중복 제거하고 예약 유지, 고객에게 환불 금액 표시',async()=>{
  const f=fixture(),o=f.seed('ABCDEF',true);await f.call('feedback','POST',await f.form(o));
  const partial=await f.form(o,'70',{mul_no:'999001',orig_mul_no:o.mul_no,orig_price:String(o.price),price:'20000'});
  for(let i=0;i<2;i++)assert.equal(await(await f.call('feedback','POST',partial)).text(),'SUCCESS');
  assert.equal(f.order(o.oid).status,'paid');assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'confirmed');assert.equal((await(await f.call('orders/'+o.oid)).json()).order.refunded_amount,20000);
  assert.equal((await f.call('feedback','POST',{...partial,orig_price:'1'})).status,400);
});
test('API 응답보다 먼저 도착한 통보도 같은 거래로 연결',async()=>{
  const f=fixture(),o=f.seed();f.db.prepare('UPDATE payapp_payments SET mul_no=NULL WHERE oid=?').run(o.oid);
  assert.equal(await(await f.call('feedback','POST',await f.form(o))).text(),'SUCCESS');assert.equal(f.order(o.oid).status,'paid');
});
test('결제 요청 실패·통신 실패는 완료 처리하지 않음',async(t)=>{
  const f=fixture(),product=PRODUCTS.items.find(x=>x.kind==='addon'),body={product_id:product.id,buyer:{name:'테스트',phone:'01012345678'},agree_terms:true,agree_privacy:true,agree_refund:true};
  t.mock.method(globalThis,'fetch',async()=>new Response('state=0&errno=70060&errorMessage=secret'));
  assert.equal((await f.call('prepare','POST',body)).status,502);assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'failed');
});
test('payurl은 페이앱 HTTPS 주소만 허용',()=>{for(const u of ['http://payapp.kr/test','https://payapp.kr.evil.test/x','https://user:pass@payapp.kr/x','javascript:alert(1)'])assert.equal(payappUrl(u),null);assert.equal(payappUrl('https://payapp.kr/x'),'https://payapp.kr/x');});
test('부분 취소 누적액이 원금에 도달하면 예약을 취소하고 환불로 표시',async()=>{
  const f=fixture(),o=f.seed('ABCDEF',true);await f.call('feedback','POST',await f.form(o));
  for(const [id,amount] of [['998001',40000],['998002',60000]])await f.call('feedback','POST',await f.form(o,'70',{mul_no:id,orig_mul_no:o.mul_no,orig_price:String(o.price),price:String(amount)}));
  assert.equal(f.order(o.oid).status,'refunded');assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'cancelled');assert.equal((await(await f.call('orders/'+o.oid)).json()).order.refunded_amount,100000);
});
test('서로 다른 원거래와 nonce는 다른 주문을 갱신할 수 없음',async()=>{
  const f=fixture(),o=f.seed(),other=f.seed('FEDCBA');
  assert.equal((await f.call('feedback','POST',await f.form(o,'4',{var1:other.oid}))).status,403);assert.equal(f.order(other.oid).status,'created');
});
test('결제 요청 타임아웃은 확정하지 않으며 뒤늦은 통보를 받을 수 있게 유지',async(t)=>{
  const f=fixture(),p=PRODUCTS.items.find(x=>x.kind==='addon');t.mock.method(globalThis,'fetch',async()=>{throw new Error('timeout');});
  const r=await f.call('prepare','POST',{product_id:p.id,buyer:{name:'테스트',phone:'01012345678'},agree_terms:true,agree_privacy:true,agree_refund:true});assert.equal(r.status,502);assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'created');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM payapp_payments').get().n,1);
});
test('관리자는 페이앱 주문 상태를 수동 덮어쓸 수 없고 환불 차감액을 조회',async()=>{
  const {onRequest:adminApi}=await import('../functions/api/admin/[[path]].js');
  const f=fixture(),o=f.seed();f.env.ADMIN_KEY='test-admin';
  await f.call('feedback','POST',await f.form(o));await f.call('feedback','POST',await f.form(o,'70',{mul_no:'995001',orig_mul_no:o.mul_no,orig_price:String(o.price),price:'20000'}));
  const admin=(path,method='GET',body)=>adminApi({env:f.env,params:{path:path.split('/')},request:new Request(ORIGIN+'/api/admin/'+path,{method,headers:{'x-admin-key':'test-admin',origin:ORIGIN,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
  assert.equal((await admin('orders/'+o.oid,'PATCH',{status:'refunded'})).status,409);assert.equal(f.order(o.oid).status,'paid');
  const listed=(await(await admin('orders')).json()).items[0];assert.equal(listed.payapp,1);assert.equal(listed.refunded_amount,20000);
  const dash=await(await admin('dashboard')).json();assert.equal(dash.month.orders_amount,80000);
});
test('이용권 승인·환불은 연결 문의도 기존 운영 상태로 반영',async()=>{
  for(const partial of [false,true]){
    const f=fixture(),o=f.seed('ABCDEF',true),ref='MS-2610-TEST';
    f.db.prepare("INSERT INTO inquiries (ref,space_id,status,data,created_at) VALUES (?,'megaspot-gundae','결제 대기','{}',?)").run(ref,new Date().toISOString());f.db.prepare('UPDATE orders SET inquiry_ref=? WHERE oid=?').run(ref,o.oid);
    await f.call('feedback','POST',await f.form(o));assert.equal(f.db.prepare('SELECT status FROM inquiries').get().status,'예약 확정');
    await f.call('feedback','POST',await f.form(o,partial?'70':'9',partial?{mul_no:'994001',orig_mul_no:o.mul_no,orig_price:String(o.price),price:String(o.price)}:{}));
    assert.equal(f.db.prepare('SELECT status FROM inquiries').get().status,'취소·환불');
  }
});
test('1,000원 확인용 결제는 금액·수량 조작과 예약 연결을 무시하고 승인·취소 가능',async(t)=>{
  const f=fixture();let sent;
  t.mock.method(globalThis,'fetch',async(url,opts)=>{sent=new URLSearchParams(opts.body);return new Response('state=1&mul_no=1000999&payurl=https%3A%2F%2Fpayapp.kr%2Fverification');});
  const r=await f.call('prepare','POST',{product_id:'payapp-check-1000',price:1,qty:10,date:kstToday(1),people:200,addons:{cleaning:10},inquiry_ref:'MS-2610-TEST',buyer:{name:'확인용','phone':'01012345678'},agree_terms:true,agree_privacy:true,agree_refund:true});
  const result=await r.json();assert.equal(r.status,200);assert.equal(result.total,1000);assert.equal(sent.get('price'),'1000');assert.equal(result.test,false);
  const row=f.db.prepare('SELECT o.*,p.mul_no,p.nonce FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(result.oid);
  assert.equal(row.event_date,null);assert.equal(row.inquiry_ref,null);assert.equal(row.people,null);assert.equal(row.test,0);assert.equal(JSON.parse(row.data).qty,1);assert.deepEqual(JSON.parse(row.data).addons,{});
  assert.equal(await(await f.call('feedback','POST',await f.form(row))).text(),'SUCCESS');assert.equal(f.order(row.oid).status,'paid');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,0);
  const paid=(await(await f.call('orders/'+row.oid)).json()).order;assert.equal(paid.verification,true);assert.equal(paid.price,1000);
  assert.equal(await(await f.call('feedback','POST',await f.form(row,'9'))).text(),'SUCCESS');const cancelled=(await(await f.call('orders/'+row.oid)).json()).order;assert.equal(cancelled.status,'refunded');assert.equal(cancelled.refunded_amount,1000);assert.equal(cancelled.booking_code,null);
});
test('페이앱 연결 진단은 관리자만 실행하고 결제·키 전송 없이 연결만 확인',async(t)=>{
  const f=fixture();f.env.ADMIN_KEY='test-admin';
  assert.equal((await f.call('diagnostics')).status,401);
  t.mock.method(globalThis,'fetch',async(url,opts)=>{assert.equal(String(opts.body),'cmd=invalid_diagnostic');return new Response('state=0&errno=70040');});
  const r=await onRequest({env:f.env,params:{path:['diagnostics']},request:new Request(ORIGIN+'/api/pay/diagnostics',{headers:{'x-admin-key':'test-admin'}})});
  const d=await r.json();assert.equal(d.http_status,200);assert.equal(d.provider_code,'70040');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
});

test('Workers에서 지원하는 manual redirect로 요청하며 외부 리다이렉트를 따라가지 않음',async(t)=>{
  const f=fixture();let calls=0;
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    calls++;assert.equal(url,'https://api.payapp.kr/oapi/v2');
    if(opts.redirect==='error') throw new TypeError('Invalid redirect value in Workers');
    assert.equal(opts.redirect,'manual');
    return new Response('',{status:302,headers:{location:'https://other.test/collect'}});
  });
  await assert.rejects(requestPayment(payappConfig(f.env),{goodname:'확인용',price:'1000',recvphone:'01000000000'}),/PAYAPP_HTTP/);
  assert.equal(calls,1,'키나 고객 정보를 리다이렉트 주소에 재전송하지 않음');
});
