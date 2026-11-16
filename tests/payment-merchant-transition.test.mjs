import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {fixture as parkingFixture} from './helpers/parking-fixture.mjs';
import {onRequest as pay} from '../functions/api/pay/[[path]].js';
import {kstStamp} from '../functions/api/_payapp.js';
import {sha256} from '../functions/api/_lib.js';

const NEXT={PAYAPP_JIYU_USERID:'jiyu-fixture',PAYAPP_JIYU_LINKKEY:'jiyu-link',PAYAPP_JIYU_LINKVAL:'jiyu-value',PAYAPP_JIYU_REQUESTKEY:'jiyu-request',PAYAPP_ACTIVE_ACCOUNT:'jiyu'};
const ORIGIN='https://local.test';
async function signed(env,row,state='4',extra={},account='legacy'){
 const prefix=account==='jiyu'?'PAYAPP_JIYU_':'PAYAPP_',stamp=kstStamp(),userid=env[prefix+'USERID'];
 return {userid,linkkey:env[prefix+'LINKKEY'],linkval:env[prefix+'LINKVAL'],responsedate:stamp,hash:await sha256(userid+stamp+env[prefix+'REQUESTKEY']),var1:row.oid,var2:row.nonce,mul_no:row.mul_no,price:String(row.price),pay_state:state,pay_type:'1',...extra};
}
function fixture(t){
 const f=payappFixture({booking:false});t.after(()=>f.db.close());
 const prepare=f.env.DB.prepare;
 f.env.DB.prepare=sql=>{const s=prepare(sql),run=s.run;s.run=async()=>{const r=await run.call(s);return {...r,meta:{changes:r.changes}};};return s;};
 const call=(path,body)=>pay({env:f.env,params:{path:[path]},request:new Request(ORIGIN+'/api/pay/'+path,{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify(body)})});
 const request=()=>call('prepare',{product_id:'payapp-check-1000',buyer:{name:'전환 검증',phone:'01012345678'},agree_terms:true,agree_privacy:true,agree_refund:true});
 const row=oid=>f.db.prepare('SELECT o.*,p.nonce,p.mul_no,p.merchant_userid FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(oid);
 return {...f,request,row};
}

test('신규 요청은 전환된 판매자 계정을 먼저 저장하고 응답보다 빠른 통보도 같은 계정으로 검증한다',async t=>{
 const f=fixture(t);Object.assign(f.env,NEXT);let sent;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  assert.equal(url,'https://api.payapp.kr/oapi/v2');sent=new URLSearchParams(opts.body);
  const row=f.row(sent.get('var1'));assert.equal(row.merchant_userid,NEXT.PAYAPP_JIYU_USERID);assert.equal(row.mul_no,null);
  await f.feedback(await signed(f.env,{...row,mul_no:'800001'},'4',{},'jiyu'));
  return new Response('state=1&mul_no=800001&payurl=https%3A%2F%2Fpayapp.kr%2Fnew-account');
 });
 const response=await f.request(),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
 assert.equal(sent.get('userid'),NEXT.PAYAPP_JIYU_USERID);assert.equal(f.row(body.oid).status,'paid');assert.equal(f.row(body.oid).merchant_userid,NEXT.PAYAPP_JIYU_USERID);
 for(const key of Object.values(NEXT))assert.ok(!JSON.stringify(body).includes(key));
 const row=f.row(body.oid);await f.feedback(await signed(f.env,row,'9',{},'jiyu'));assert.equal(f.row(body.oid).status,'refunded');
});

test('전환 전 NULL 계정 거래의 입금대기·승인·부분취소·전체취소는 전환 후에도 보존한다',async t=>{
 const f=fixture(t),old=f.seed({status:'created'});Object.assign(f.env,NEXT);
 await f.feedback(await signed(f.env,old,'10'));assert.equal(f.row(old.oid).status,'pending');
 await f.feedback(await signed(f.env,old));assert.equal(f.row(old.oid).status,'paid');assert.equal(f.row(old.oid).merchant_userid,f.env.PAYAPP_USERID);
 const part=await signed(f.env,old,'70',{mul_no:'800101',orig_mul_no:old.mul_no,orig_price:String(old.price),price:'20000'});
 await f.feedback(part);await f.feedback(part);assert.equal(f.db.prepare('SELECT SUM(amount) total FROM payapp_refunds WHERE oid=?').get(old.oid).total,20000);
 await f.feedback(await signed(f.env,old,'9'));assert.equal(f.row(old.oid).status,'refunded');
 await f.feedback(await signed(f.env,old));assert.equal(f.row(old.oid).status,'refunded');
});

test('유효한 다른 판매자 서명과 같은 거래번호·nonce라도 다른 계정의 주문을 바꾸지 못한다',async t=>{
 const f=fixture(t),old=f.seed({status:'created'}),next=f.seed({status:'created'});Object.assign(f.env,NEXT);
 f.db.prepare('UPDATE payapp_payments SET merchant_userid=? WHERE oid=?').run(NEXT.PAYAPP_JIYU_USERID,next.oid);
 await f.feedback(await signed(f.env,old,'4',{},'jiyu'),403);await f.feedback(await signed(f.env,next),403);
 assert.equal(f.row(old.oid).status,'created');assert.equal(f.row(next.oid).status,'created');
 await f.feedback(await signed(f.env,next,'4',{},'jiyu'));assert.equal(f.row(next.oid).status,'paid');
 await f.feedback(await signed(f.env,next,'9'),403);assert.equal(f.row(next.oid).status,'paid');
});

test('새 설정이 불완전하거나 신규 결제를 중단해도 기존 계정의 환불은 계속 처리한다',async t=>{
 const f=fixture(t),old=f.seed();Object.assign(f.env,NEXT);delete f.env.PAYAPP_JIYU_REQUESTKEY;
 t.mock.method(globalThis,'fetch',async()=>{assert.fail('불완전한 계정으로 결제를 요청하면 안 됩니다.');});
 assert.equal((await f.request()).status,503);await f.feedback(await signed(f.env,old,'9'));assert.equal(f.row(old.oid).status,'refunded');
 Object.assign(f.env,NEXT,{PAYAPP_ENABLED:'0'});const another=f.seed();await f.feedback(await signed(f.env,another,'9'));assert.equal(f.row(another.oid).status,'refunded');
});

test('계정 전환 진단은 관리자에게 준비 여부만 보여 주고 계정 ID·키를 반환하지 않는다',async t=>{
 const f=fixture(t);Object.assign(f.env,NEXT,{ADMIN_KEY:'transition-admin'});
 const call=key=>pay({env:f.env,params:{path:['accounts']},request:new Request(ORIGIN+'/api/pay/accounts',{headers:key?{'x-admin-key':key}:{}})});
 assert.equal((await call()).status,401);const r=await call('transition-admin'),body=await r.json();
 assert.equal(r.status,200);assert.deepEqual(body,{ok:true,active_account:'jiyu',configured:true,enabled:true,accounts:{legacy:{configured:true},jiyu:{configured:true}}});
 assert.equal(r.headers.get('cache-control'),'no-store');
 for(const [name,value] of Object.entries(f.env))if(name.startsWith('PAYAPP_')&&name!=='PAYAPP_ACTIVE_ACCOUNT')assert.ok(!JSON.stringify(body).includes(value));
});

for(const batch of [false,true])test('주차 '+(batch?'묶음':'단일')+' 결제도 판매자를 저장하고 구계정 환불·신계정 승인을 구분한다',async t=>{
 const f=parkingFixture(t),old=await f.buy();assert.equal((await f.feedback(old)).status,200);Object.assign(f.env,NEXT);
 const input=batch?{vehicles:[f.input({plate:'321나7654',plate_confirm:'321나7654'}),f.input({plate:'456다1234',plate_confirm:'456다1234'})]}:{plate:'321나7654',plate_confirm:'321나7654'};
 const response=await f.call('prepare','POST',f.input(input)),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(f.sent().get('userid'),NEXT.PAYAPP_JIYU_USERID);
 const row=f.db.prepare('SELECT o.*,p.nonce,p.mul_no,p.merchant_userid FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(body.oid);
 assert.equal(row.merchant_userid,NEXT.PAYAPP_JIYU_USERID);
 assert.equal((await f.call('feedback','POST',await signed(f.env,row))).status,403);
 assert.equal((await f.call('feedback','POST',await signed(f.env,row,'4',{},'jiyu'))).status,200);
 assert.equal((await f.feedback(old,'9')).status,200);assert.equal((await f.get(old)).payment_status,'refunded');
 const paid=f.db.prepare('SELECT status FROM orders WHERE oid=?').get(body.oid);assert.equal(paid.status,'paid');
});
