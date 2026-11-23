import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest as pay} from '../functions/api/pay/[[path]].js';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';

const base='deposit-refunds/bookings/BK-TEST';
function fixture(t){
 const f=payappFixture();
 t.after(()=>f.db.close());
 Object.assign(f.env,{DEPOSIT_ACCOUNT_KEY:'12'.repeat(32),
  PAYAPP_JIYU_USERID:'local-jiyu',PAYAPP_JIYU_LINKKEY:'jiyu-link',PAYAPP_JIYU_LINKVAL:'jiyu-value',PAYAPP_JIYU_REQUESTKEY:'jiyu-request'});
 const get=async()=>(await f.api(base)).item;
 async function save(data={},status=200,code='BK-TEST'){
  const path='deposit-refunds/bookings/'+code,b=(await f.api(path)).item;
  return f.api(path+'/payment-method','POST',{revision:b.revision,method_version:b.payment_method_version,
   payment_method:'card',payapp_account:'legacy',transaction_no:'870125',confirm_transaction:true,...data},status);
 }
 const form=(state='9',extra={})=>f.form({oid:'',nonce:'',mul_no:'870125',price:150000},state,{feedbacktype:'1',...extra});
 async function notify(form,status=200,path='deposit-feedback'){
  const r=await pay({env:f.env,params:{path:[path]},request:new Request('https://local.test/api/pay/'+path,{method:'POST',body:new URLSearchParams(form)})});
  assert.equal(r.status,status);
  assert.equal(await r.text(),status===200?'SUCCESS':'FAIL');
 }
 return {...f,get,save,form,notify};
}
test('관리자가 기록한 카드와 계좌이체는 양쪽 예약 목록에 표시하고 기존 데이터는 미기록',async t=>{
 const f=fixture(t);
 assert.equal((await f.get()).payment_method,'');
 assert.equal((await f.api('bookings')).items[0].deposit_method,null);
 await f.save({payment_method:'bank'});
 assert.equal((await f.api('bookings')).items[0].deposit_method,'bank');
 await f.save();
 for(const path of ['bookings','reservations']){
  const row=(await f.api(path)).items.find(x=>(x.booking_code||x.code)==='BK-TEST');
  assert.equal(row.deposit_method,'card');
  assert.equal(row.deposit_refunded,0);
 }
 assert.equal((await f.get()).transaction_no,'870125');
 assert.equal((await f.api(base+'/link','POST',{},409)).code,'CARD_DEPOSIT');
 await f.api('bookings/BK-TEST/deposit-paid','PUT',{paid:true});
 assert.ok(!(await f.api('deposit-refunds?filter=missing')).items.some(p=>p.code==='BK-TEST'));
 const context=await f.api('bookings/BK-TEST/settlement');
 assert.match(context.deposit.reason,/카드/);
});
test('검증된 카드 취소만 보증금을 완료하고 같은 문의의 예약과 이용료는 유지',async t=>{
 const f=fixture(t);
 f.db.exec("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,start_h,end_h,created_at) SELECT 'BK-OTHER',space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,start_h,end_h,created_at FROM bookings");
 const rental=f.seed({price:150000});
 await f.save({transaction_no:rental.mul_no},409);
 await f.save({confirm_transaction:false},400);
 await f.save();
 await f.save({},409,'BK-OTHER');
 const full=await f.form('9');
 await f.notify({...full,hash:'0'.repeat(64)},403);
 for(const bad of [{mul_no:'870126'},{price:'149999'},{pay_state:'8'},{pay_type:'6'}])await f.notify({...full,...bad});
 assert.equal((await f.get()).state,'pending');
 await Promise.all([f.notify(full),f.notify(full,200,'feedback')]);
 const rows=(await f.api('bookings')).items;
 assert.equal(rows.find(b=>b.booking_code==='BK-TEST').deposit_refunded,1);
 assert.equal(rows.find(b=>b.booking_code==='BK-TEST').status,'confirmed');
 assert.equal(rows.find(b=>b.booking_code==='BK-OTHER').deposit_refunded,0);
 assert.equal(f.db.prepare('SELECT status FROM orders WHERE oid=?').get(rental.oid).status,'paid');
 assert.equal((await f.get()).refund_amount,150000);
 assert.equal((await f.get()).method_editable,false);
 assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='deposit.card_cancelled'").get().n,1);
 await f.save({payment_method:'bank'},409);
});

test('부분취소 중복은 건너뛰고 전액에 도달하면 환급을 한 번만 완료',async t=>{
 const f=fixture(t);
 await f.save();
 const part=await f.form('70',{orig_mul_no:'870125',orig_price:'150000',mul_no:'870126',price:'50000'});
 await f.notify(part);
 await f.notify({...part,pay_state:'71'});
 assert.equal((await f.get()).state,'pending');
 assert.ok((await f.get()).card_cancellation_received);
 await f.notify({...part,mul_no:'870127',price:'100000'});
 assert.equal((await f.get()).state,'completed');
 await f.notify(await f.form('64'));
 assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='deposit.card_cancelled'").get().n,1);
});
test('일치하는 원거래라도 다른 판매자의 통보와 이미 완료된 계좌 환급은 반영하지 않음',async t=>{
 const f=fixture(t);
 await f.save({payapp_account:'jiyu'});
 await f.notify(await f.form());
 assert.equal((await f.get()).state,'pending');
 await f.save({payment_method:'bank'});
 f.db.exec("INSERT INTO booking_refunds(booking_code,amount,state,paid_amount,created_at,updated_at) VALUES('BK-TEST',150000,'completed',150000,'2026-11-01','2026-11-01')");
 await f.notify(await f.form());
 assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='deposit.card_cancelled'").get().n,0);
});
