import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest as adminApi} from '../functions/api/admin/[[path]].js';
import {onRequest as publicApi} from '../functions/api/payment-links/[[path]].js';
import {onRequest as payApi} from '../functions/api/pay/[[path]].js';
import {payappConfig,kstStamp} from '../functions/api/_payapp.js';
import {sha256,kstToday,now} from '../functions/api/_lib.js';
import {SCHEMA} from '../functions/api/_schema.js';

const ORIGIN='https://megaspot.test',BUYER={name:'결제 고객',phone:'01012345678',email:'buyer@example.com'};
const request=extra=>({buyer:BUYER,agree_terms:true,agree_privacy:true,agree_refund:true,...extra});
function fixture(t){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
 let beforeBatch=null;
 const DB={prepare(sql){const st=db.prepare(sql);let a=[];return {bind(...v){a=v;return this;},async first(){return st.get(...a)||null;},async all(){return {results:st.all(...a)};},async run(){return this.exec();},exec(){return {meta:{changes:Number(st.run(...a).changes)}};}};},async batch(stmts){if(beforeBatch){const fn=beforeBatch;beforeBatch=null;fn();}db.exec('BEGIN');try{const out=stmts.map(s=>s.exec());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,ADMIN_KEY:'test-only-admin',PAYAPP_USERID:'old-seller',PAYAPP_LINKKEY:'old-link',PAYAPP_LINKVAL:'old-value',PAYAPP_REQUESTKEY:'old-request',PAYAPP_JIYU_USERID:'new-seller',PAYAPP_JIYU_LINKKEY:'new-link',PAYAPP_JIYU_LINKVAL:'new-value',PAYAPP_JIYU_REQUESTKEY:'new-request'};
 const handle=async(api,base,path,method='GET',body,headers={})=>{
  const form=path==='feedback',res=await api({env,params:{path:path.split('/')},request:new Request(ORIGIN+base+path,{method,headers:{origin:ORIGIN,'content-type':form?'application/x-www-form-urlencoded':'application/json','cf-connecting-ip':'1.2.3.4',...headers},...(body===undefined?{}:{body:form?new URLSearchParams(body):JSON.stringify(body)})})});
  return {status:res.status,data:(res.headers.get('content-type')||'').includes('json')?await res.json():await res.text(),headers:res.headers};
 };
 const admin=(path='payment-links',method='GET',body,headers={})=>handle(adminApi,'/api/admin/',path,method,body,{'x-admin-key':env.ADMIN_KEY,...headers});
 const pub=(token,suffix='',body)=>handle(publicApi,'/api/payment-links/',token+suffix,body===undefined?'GET':'POST',body);
 const row=id=>db.prepare('SELECT * FROM payment_links WHERE id=?').get(id);
 const order=oid=>db.prepare('SELECT o.*,p.nonce,p.mul_no,p.merchant_userid FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(oid);
 const feedback=async(oid,state='4',extra={})=>{
  const o=order(oid),prefix=o.merchant_userid===env.PAYAPP_JIYU_USERID?'PAYAPP_JIYU_':'PAYAPP_',stamp=kstStamp();
  const f={userid:env[prefix+'USERID'],linkkey:env[prefix+'LINKKEY'],linkval:env[prefix+'LINKVAL'],responsedate:stamp,hash:await sha256(env[prefix+'USERID']+stamp+env[prefix+'REQUESTKEY']),var1:oid,var2:o.nonce,mul_no:o.mul_no||'10001',price:String(o.price),pay_type:'1',pay_state:state,...extra};
  return handle(payApi,'/api/pay/','feedback','POST',f);
 };
 const input=(extra={})=>({request_id:crypto.randomUUID(),service:'rental',purpose:'deposit',title:'공간 대관 예약금',description:'행사 대관 예약금입니다.\n잔금은 별도 안내합니다. https://megaspot.kr/terms/',amount:50000,...extra});
 const create=async extra=>{const payload=input(extra),r=await admin('payment-links','POST',payload);assert.equal(r.status,200,JSON.stringify(r.data));return {link:r.data.link,token:new URL(r.data.link.url).searchParams.get('link'),payload};};
 const booking=(code='BK-TEST')=>{db.prepare("INSERT INTO inquiries(ref,space_id,status,name,phone,event_date,data,created_at) VALUES('MS-LINK','megaspot-gundae','예약 확정','예약자','01011112222',?,'{}',?)").run(kstToday(7),now());db.prepare("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at) VALUES(?,'megaspot-gundae','MS-LINK','예약자','01011112222','2222',?,20,'confirmed',100000,10,17,?)").run(code,kstToday(7),now());db.prepare("INSERT INTO calendar_blocks(space_id,date,state,memo) VALUES('megaspot-gundae',?,'full',?)").run(kstToday(7),'예약 '+code);return code;};
 let network=[];
 const mock=fn=>t.mock.method(globalThis,'fetch',async(url,opts)=>{assert.equal(url,'https://api.payapp.kr/oapi/v2');const fields=Object.fromEntries(new URLSearchParams(opts.body));network.push(fields);return fn?await fn(fields):new Response('state=1&mul_no=10001&payurl=https%3A%2F%2Fpayapp.kr%2Fpayment-test');});
 return {db,env,admin,pub,row,order,feedback,input,create,booking,mock,network,race:fn=>{beforeBatch=fn;},checkout:(token,extra)=>pub(token,'/checkout',request(extra)),pay:(path)=>handle(payApi,'/api/pay/',path)};
}

test('생성·조회는 PG호출 없이 멱등 링크만 만들고 같은 요청번호의 다른 내용은 거부',async t=>{
 const f=fixture(t);f.mock();const {link,token,payload}=await f.create();assert.equal(f.network.length,0);assert.equal(link.status,'open');assert.equal(link.can_close,true);
 const repeated=await f.admin('payment-links','POST',payload);assert.equal(repeated.data.link.url,link.url);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payment_links').get().n,1);
 assert.equal((await f.admin('payment-links','POST',{...payload,amount:9999})).status,409);
 assert.equal((await f.admin()).data.items[0].url,link.url);
 const result=await f.pub(token);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('referrer-policy'),'no-referrer');
 const raw=JSON.stringify(result.data);for(const forbidden of [token,'old-link','old-request','buyer_phone','booking_snapshot'])assert.equal(raw.includes(forbidden),false);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);assert.equal(f.network.length,0);
});

test('관리자 인증·출처와 입력 금액·길이·URI·날짜를 검증',async t=>{
 const f=fixture(t);f.mock();assert.equal((await f.admin('payment-links','POST',f.input(),{'x-admin-key':''})).status,401);
 assert.equal((await f.admin('payment-links','POST',f.input(),{origin:'https://evil.test'})).status,403);
 for(const extra of [{amount:999},{amount:1.5},{amount:100000001},{amount:'5000'},{service:'bad'},{purpose:'guarantee'},{title:'https://evil.test'},{title:'mailto:test@example.com'},{title:'a'.repeat(101)},{description:'a'.repeat(3001)},{expires_on:kstToday(91)},{event_date:'2026-02-31'},{space_id:'unknown'},{headcount:0},{start_h:17,end_h:10}])assert.equal((await f.admin('payment-links','POST',f.input(extra))).status,400,JSON.stringify(extra));
 assert.equal(f.network.length,0);
 assert.equal((await f.admin('payment-links','POST',f.input({title:'Rental dinner full',description:'Text with returns\nand a normal URL https://megaspot.kr/'}))).status,200);
 assert.equal((await f.admin('payment-links','POST',f.input({title:'잘못된\n제목'}))).status,400);
 assert.equal((await f.admin('payment-links','POST',f.input({start_h:10.5,end_h:17.5}))).status,200);
 assert.equal((await f.admin('payment-links','POST',f.input({start_h:10.25,end_h:17.5}))).status,400);
});

test('고객 결제는 서버 고정금액·merchant·nonce로 요청하고 상세설명·URL은 PG메모에 넣지 않음',async t=>{
 const f=fixture(t);f.mock();const x=await f.create();const r=await f.checkout(x.token,{amount:1,price:1});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(f.network.length,1);
 const sent=f.network[0],o=f.order(r.data.oid);assert.equal(sent.price,'50000');assert.equal(sent.smsuse,'n');assert.equal(sent.var2,o.nonce);assert.equal(o.merchant_userid,'old-seller');assert.equal(o.booking_code,null);assert.equal(o.inquiry_ref,null);
 assert.equal(sent.feedbackurl,ORIGIN+'/api/pay/feedback');assert.match(sent.returnurl,/api\/pay\/return\?oid=/);assert.equal(sent.skip_cstpage,'y');assert.doesNotMatch(sent.memo,/https:|행사 대관/);
 assert.deepEqual(JSON.parse(o.data).lines.map(x=>x.id),['rental']);assert.equal((await f.admin('payment-links/'+x.link.id+'/close','POST',{})).status,409);
 for(const secret of [o.nonce,'old-request','old-link'])assert.equal(JSON.stringify(r.data).includes(secret),false);
});

test('동시 결제 요청·동일번호 재개·활성계정 전환에도 하나의 기존 PG링크만 사용',async t=>{
 const f=fixture(t);f.mock();const x=await f.create();const results=await Promise.all([f.checkout(x.token),f.checkout(x.token)]);assert.equal(f.network.length,1);assert.equal(results.filter(x=>x.status===200).length,1);
 const first=results.find(x=>x.status===200);f.env.PAYAPP_ACTIVE_ACCOUNT='jiyu';const again=await f.checkout(x.token);assert.deepEqual(again.data,first.data);assert.equal(f.network.length,1);
 assert.equal((await f.checkout(x.token,{buyer:{...BUYER,phone:'01099998888'}})).status,409);assert.equal(f.network.length,1);
 assert.equal((await f.pub(x.token)).data.link.status,'processing');
});

test('응답 유실은 새 요청을 만들지 않고 늦은 검증된 승인은 반영',async t=>{
 const f=fixture(t);f.mock(async()=>{throw Error('timeout');});const x=await f.create();assert.equal((await f.checkout(x.token)).status,502);
 const oid=f.row(x.link.id).order_oid;assert.equal((await f.pub(x.token)).data.link.status,'attention');assert.equal((await f.checkout(x.token)).status,409);assert.equal(f.network.length,1);
 assert.equal((await f.feedback(oid)).status,200);assert.equal(f.order(oid).status,'paid');assert.equal(f.order(oid).tid,'10001');assert.equal((await f.pub(x.token)).data.link.status,'paid');
});

test('API 응답 전 승인 통보는 원거래번호를 저장하고 API응답이 paid 상태·링크를 덮어쓰지 않음',async t=>{
 const f=fixture(t);f.mock(async sent=>{assert.equal((await f.feedback(sent.var1)).status,200);return new Response('state=1&mul_no=10001&payurl=https%3A%2F%2Fpayapp.kr%2Fpayment-test');});
 const x=await f.create(),r=await f.checkout(x.token);assert.equal(r.status,200);assert.equal(f.order(r.data.oid).tid,'10001');assert.equal(f.order(r.data.oid).status,'paid');assert.equal(f.row(x.link.id).payurl,null);assert.equal((await f.checkout(x.token)).status,409);assert.equal(f.network.length,1);
});

test('명시적 rental예약만 일치스냅샷에 수납연결하고 전체환불도 예약·문의·달력을 취소하지 않음',async t=>{
 const f=fixture(t);f.mock();const code=f.booking();const x=await f.create({booking_code:code}),r=await f.checkout(x.token);
 await f.feedback(r.data.oid);assert.equal(f.order(r.data.oid).booking_code,code);
 await f.feedback(r.data.oid);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='order.paid' AND ref=?").get(r.data.oid).n,1);
 await f.feedback(r.data.oid,'64');assert.equal(f.order(r.data.oid).status,'refunded');assert.equal(f.db.prepare('SELECT status FROM bookings WHERE booking_code=?').get(code).status,'confirmed');
 assert.equal(f.db.prepare("SELECT status FROM inquiries WHERE ref='MS-LINK'").get().status,'예약 확정');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendar_blocks').get().n,1);
 assert.equal((await f.pub(x.token)).data.link.refunded_amount,50000);assert.equal((await f.pay('orders/'+r.data.oid)).data.order.payment_link.purpose,'deposit');
});

test('출장뷔페·기타의 예약번호는 참고만 하며 기존 문의를 자동 추론하거나 수납·달력을 바꾸지 않음',async t=>{
 for(const service of ['catering','other']){
  const f=fixture(t);f.mock();const code=f.booking();const x=await f.create({service,booking_code:code}),r=await f.checkout(x.token);await f.feedback(r.data.oid);
  assert.equal(f.order(r.data.oid).booking_code,null);assert.equal(f.order(r.data.oid).inquiry_ref,null);assert.equal(JSON.parse(f.order(r.data.oid).data).lines[0].id,service);
  await f.feedback(r.data.oid,'64');assert.equal(f.db.prepare('SELECT status FROM bookings WHERE booking_code=?').get(code).status,'confirmed');
 }
});

test('예약 변경은 checkout 전에 차단하고, 요청 후 변경되면 결제는 보존하되 수납 연결은 보류',async t=>{
 const f=fixture(t);f.mock();const code=f.booking(),x=await f.create({booking_code:code});f.db.prepare('UPDATE bookings SET amount=110000 WHERE booking_code=?').run(code);
 assert.equal((await f.checkout(x.token)).status,409);assert.equal(f.network.length,0);
 f.db.prepare('UPDATE bookings SET amount=100000 WHERE booking_code=?').run(code);const r=await f.checkout(x.token);f.db.prepare('UPDATE bookings SET phone=? WHERE booking_code=?').run('01099999999',code);
 await f.feedback(r.data.oid);assert.equal(f.order(r.data.oid).status,'paid');assert.equal(f.order(r.data.oid).booking_code,null);assert.match(f.order(r.data.oid).result_msg,/확인 필요/);
});

test('예약 검사와 원자적 checkout claim 사이 변경도 외부결제 요청을 만들지 않음',async t=>{
 const f=fixture(t);f.mock();const code=f.booking(),x=await f.create({booking_code:code});f.race(()=>f.db.prepare('UPDATE bookings SET amount=99999 WHERE booking_code=?').run(code));
 assert.equal((await f.checkout(x.token)).status,409);assert.equal(f.network.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
});

test('승인 처리의 원자적 batch 직전 예약 변경도 실제 결제만 보존하고 예약 연결은 보류',async t=>{
 const f=fixture(t);f.mock();const code=f.booking(),x=await f.create({booking_code:code}),r=await f.checkout(x.token);
 f.race(()=>f.db.prepare('UPDATE bookings SET amount=99999 WHERE booking_code=?').run(code));
 await f.feedback(r.data.oid);assert.equal(f.order(r.data.oid).status,'paid');assert.equal(f.order(r.data.oid).booking_code,null);assert.match(f.order(r.data.oid).result_msg,/확인 필요/);
});

test('취소·거절 표시 뒤 늦은 승인도 같은 검증 거래의 수납으로 보존하고 환불 뒤 늦은 승인은 되살리지 않음',async t=>{
 const f=fixture(t);f.mock();const x=await f.create(),r=await f.checkout(x.token);await f.feedback(r.data.oid,'8');assert.equal(f.order(r.data.oid).status,'cancelled');
 await f.feedback(r.data.oid);assert.equal(f.order(r.data.oid).status,'paid');assert.match(f.order(r.data.oid).result_msg,/확인 필요/);
 await f.feedback(r.data.oid,'64');await f.feedback(r.data.oid);assert.equal(f.order(r.data.oid).status,'refunded');assert.equal(f.network.length,1);
});

test('전액·부분 환불은 중복 원장 방지하고 승인보다 먼저 온 부분환불도 독립결제로 기록',async t=>{
 const f=fixture(t);f.mock();const x=await f.create(),r=await f.checkout(x.token),partial={mul_no:'20001',orig_mul_no:'10001',orig_price:'50000',price:'10000'};
 assert.equal((await f.feedback(r.data.oid,'70',partial)).status,200);assert.equal(f.order(r.data.oid).status,'paid');assert.equal(f.order(r.data.oid).booking_code,null);assert.equal(f.order(r.data.oid).tid,'10001');
 await f.feedback(r.data.oid,'70',partial);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payapp_refunds').get().n,1);assert.equal((await f.pub(x.token)).data.link.refunded_amount,10000);
 await f.feedback(r.data.oid,'64');assert.equal(f.order(r.data.oid).status,'refunded');assert.equal(f.db.prepare('SELECT SUM(amount) n FROM payapp_refunds').get().n,50000);
});

test('취소·거절 뒤 승인보다 먼저 온 부분환불도 잔여 수납을 보존하고 예약 연결은 보류',async t=>{
 for(const previous of ['cancelled','failed'])await t.test(previous,async t=>{
  const f=fixture(t);f.mock(previous==='failed'?async()=>new Response('state=0&errno=REJECTED'):null);
  const code=f.booking(),x=await f.create({booking_code:code}),r=await f.checkout(x.token),oid=r.data.oid||f.row(x.link.id).order_oid;
  if(previous==='cancelled')assert.equal((await f.feedback(oid,'8')).status,200);
  assert.equal(f.order(oid).status,previous);assert.equal(f.order(oid).paid_at,null);
  const partial={mul_no:'20001',orig_mul_no:'10001',orig_price:'50000',price:'10000'};
  assert.equal((await f.feedback(oid,'70',partial)).status,200);
  const paid=f.order(oid);assert.equal(paid.status,'paid');assert.ok(paid.paid_at);assert.equal(paid.tid,'10001');assert.equal(paid.booking_code,null);assert.equal(paid.inquiry_ref,null);assert.match(paid.result_msg,/연결 예약 확인 필요/);
  assert.equal((await f.pub(x.token)).data.link.refunded_amount,10000);assert.equal(paid.price-f.db.prepare('SELECT SUM(amount) n FROM payapp_refunds WHERE oid=?').get(oid).n,40000);
  assert.equal(f.db.prepare('SELECT status FROM bookings WHERE booking_code=?').get(code).status,'confirmed');assert.equal(f.db.prepare("SELECT status FROM inquiries WHERE ref='MS-LINK'").get().status,'예약 확정');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendar_blocks').get().n,1);
  assert.equal((await f.feedback(oid,'64')).status,200);assert.equal(f.order(oid).status,'refunded');assert.equal(f.db.prepare('SELECT SUM(amount) n FROM payapp_refunds WHERE oid=?').get(oid).n,50000);
  await f.feedback(oid,'70',partial);await f.feedback(oid);assert.equal(f.order(oid).status,'refunded');assert.equal(f.network.length,1);
 });
});

test('위조·다른계정·금액·nonce 통보는 결제 상태를 바꾸지 않음',async t=>{
 const f=fixture(t);f.mock();const x=await f.create(),r=await f.checkout(x.token);
 for(const extra of [{hash:'bad'},{var2:'bad'},{price:'1'},{userid:'new-seller'},{mul_no:'99999'}]){assert.notEqual((await f.feedback(r.data.oid,'4',extra)).status,200);assert.equal(f.order(r.data.oid).status,'created');}
});

test('미진행 링크만 종료·만료 처리하며 실패 요청도 재청구하지 않음',async t=>{
 const f=fixture(t);f.mock(async()=>new Response('state=0&errno=REJECTED'));const closed=await f.create();await f.admin('payment-links/'+closed.link.id+'/close','POST',{});
 assert.equal((await f.pub(closed.token)).data.link.status,'closed');assert.equal((await f.checkout(closed.token)).status,409);
 const expired=await f.create();f.db.prepare('UPDATE payment_links SET expires_at=0 WHERE id=?').run(expired.link.id);assert.equal((await f.pub(expired.token)).data.link.status,'expired');assert.equal((await f.checkout(expired.token)).status,409);
 const failed=await f.create();assert.equal((await f.checkout(failed.token)).status,502);assert.equal((await f.checkout(failed.token)).status,409);assert.equal(f.network.length,1);
 assert.equal((await f.pub(failed.token)).data.link.status,'attention');assert.equal((await f.pub('invalid')).status,404);
});

test('동의·휴대폰·외부 출처가 잘못되면 PG요청·주문을 만들지 않음',async t=>{
 const f=fixture(t);f.mock();const x=await f.create();assert.equal((await f.checkout(x.token,{agree_refund:false})).status,400);assert.equal((await f.checkout(x.token,{buyer:{...BUYER,phone:'invalid'}})).status,400);assert.equal(f.network.length,0);
});

test('주문 생성 batch 실패는 링크 잠금·주문도 롤백하고 PG를 호출하지 않음',async t=>{
 const f=fixture(t);f.mock();const x=await f.create();f.db.exec("CREATE TRIGGER fail_link_order BEFORE INSERT ON payapp_payments BEGIN SELECT RAISE(ABORT,'test rollback'); END");
 assert.equal((await f.checkout(x.token)).status,500);assert.equal(f.row(x.link.id).order_oid,null);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);assert.equal(f.network.length,0);
 f.db.exec('DROP TRIGGER fail_link_order');assert.equal((await f.checkout(x.token)).status,200);assert.equal(f.network.length,1);
});

test('승인 batch 실패도 결제·링크·감사를 함께 롤백하고 같은 통보 재시도로 복구',async t=>{
 const f=fixture(t);f.mock();const x=await f.create(),r=await f.checkout(x.token);f.db.exec("CREATE TRIGGER fail_link_approval BEFORE INSERT ON event_log WHEN NEW.kind='order.paid' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
 assert.equal((await f.feedback(r.data.oid)).status,500);assert.equal(f.order(r.data.oid).status,'created');assert.equal(f.row(x.link.id).attempt_state,'requested');assert.equal(f.row(x.link.id).event_token,null);
 f.db.exec('DROP TRIGGER fail_link_approval');assert.equal((await f.feedback(r.data.oid)).status,200);assert.equal(f.order(r.data.oid).status,'paid');assert.equal(f.network.length,1);
});

test('스키마와 추가 마이그레이션은 재적용 가능하고 같은 payment_links 정의를 생성',()=>{
 const db=new DatabaseSync(':memory:');for(const s of SCHEMA)db.exec(s);for(const s of SCHEMA)db.exec(s);db.exec(readFileSync(new URL('../migrations/20261127_payment_links.sql',import.meta.url),'utf8'));
 assert.equal(db.prepare("SELECT COUNT(*) n FROM pragma_table_info('payment_links') WHERE name='order_oid'").get().n,1);db.close();
});
