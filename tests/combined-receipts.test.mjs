import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import R from '../assets/js/admin-save-recovery.js';
import {noticeObsolete} from '../functions/api/_deposit_notifications.js';
function setup(t){const f=fixture({booking:true});t.after(()=>f.db.close());f.db.prepare("INSERT INTO settings VALUES('deposit_alimtalk',?,datetime('now'))").run(JSON.stringify({enabled:true,types:{payment:true,account:true,refunded:true}}));return f;}
async function form(f,extra={}){const r=await f.api('bookings/BK-TEST/settlement');return {kind:'receipt',combined:true,confirm_combined:true,amount:r.settlement.balance+r.deposit.amount,deposit_amount:r.deposit.amount,deposit_revision:r.deposit.revision,expected_revision:r.settlement.revision,note:'합산 입금 확인',request_id:crypto.randomUUID(),...extra};}
const save=(f,d,status=200)=>f.api('bookings/BK-TEST/settlement','POST',d,status);
const count=(f,table)=>f.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
test('합산 입금은 이용료만 수납하고 보증금 확인과 계좌 알림 한 건을 같은 트랜잭션으로 준비한다',async t=>{
 const f=setup(t);const d=await form(f);const r=await save(f,d);assert.equal(r.settlement.received,500000);assert.equal(r.settlement.balance,0);assert.equal(r.settlement.refund_due,0);assert.equal(r.combined_receipt.total,650000);assert.equal(r.combined_receipt.deposit,150000);assert.equal(r.deposit_notice.status,'queued');
 assert.ok(JSON.parse(f.db.prepare('SELECT checks FROM inquiry_checks').get().checks).guarantee_paid);assert.match(f.db.prepare('SELECT memo FROM inquiries').get().memo,/650,000원.*500,000원.*150,000원/);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE kind='account'").get().n,1);assert.equal(count(f,'booking_payment_entries'),1);
 await save(f,{...d,request_id:crypto.randomUUID()},409);assert.equal(count(f,'booking_payment_entries'),1);
});
test('응답 유실 후 동일 요청 복구는 수납·보증금·메모·알림을 중복 생성하지 않는다',async t=>{
 const f=setup(t),d=await form(f),memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};let first=true;
 const api=async(path,opts)=>{const r=await f.api(path.slice(1),'POST',opts.body);if(first){first=false;throw Error('lost response');}return r;};
 await assert.rejects(R.create({storage,api}).submit('payment','BK-TEST','/bookings/BK-TEST/settlement',d));
 const r=await R.create({storage,api}).retry();assert.equal(r.duplicate,true);assert.equal(count(f,'booking_payment_entries'),1);assert.equal(count(f,'booking_combined_receipts'),1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM deposit_notifications WHERE kind='account'").get().n,1);assert.equal(f.db.prepare('SELECT memo FROM inquiries').get().memo.split('\n').length,1);
 await save(f,{...d,amount:d.amount+1},409);
});
test('동시 저장과 다른 요청번호의 중복 클릭도 보증금을 한 번만 반영한다',async t=>{
 const f=setup(t),d=await form(f),run=f.env.DB.batch.bind(f.env.DB),pending=[];
 f.env.DB.batch=ss=>new Promise((resolve,reject)=>{pending.push({ss,resolve,reject});if(pending.length===2){f.env.DB.batch=run;(async()=>{for(const x of pending)try{x.resolve(await run(x.ss));}catch(e){x.reject(e);}})();}});
 const request=body=>f.handle(new Request('https://local.test/api/admin/bookings/BK-TEST/settlement',{method:'POST',headers:{'x-admin-key':f.env.ADMIN_KEY,origin:'https://local.test','content-type':'application/json'},body:JSON.stringify(body)}));
 const responses=await Promise.all([request(d),request({...d,request_id:crypto.randomUUID()})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(count(f,'booking_payment_entries'),1);assert.equal(count(f,'booking_combined_receipts'),1);assert.equal(count(f,'booking_deposit_checks'),0);
});
test('중간 저장 실패는 수납·보증금·안내·메모 전체를 롤백한다',async t=>{
 const f=setup(t),d=await form(f),prepare=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=sql=>{const s=prepare(sql);if(sql.startsWith('INSERT INTO inquiry_checks'))s.run=async()=>{throw Error('injected failure');};return s;};
 await save(f,d,500);assert.equal(count(f,'booking_payment_entries'),0);assert.equal(count(f,'booking_combined_receipts'),0);assert.equal(count(f,'booking_refunds'),0);assert.equal(count(f,'deposit_notifications'),0);assert.equal(count(f,'inquiry_checks'),0);
});
test('부분 이용료와 보증금 합산도 잔금과 별도로 계산하며 초과 입금·금액 조작을 거절한다',async t=>{
 const f=setup(t),d=await form(f);for(const x of [{confirm_combined:false},{amount:150000},{amount:650001},{deposit_amount:140000}])await save(f,{...d,...x},x.deposit_amount?409:400);
 await save(f,{...d,amount:350000});assert.equal((await f.api('bookings/BK-TEST/settlement')).settlement.balance,300000);
});
test('미리보기 이후 이용료·보증금·예약자 변경은 저장을 차단한다',async t=>{
 for(const sql of ["UPDATE bookings SET amount=400000","UPDATE bookings SET phone='01099998888'","UPDATE bookings SET status='cancelled'","UPDATE bookings SET confirm_doc=json_object('deposit',250000)"]){const f=setup(t),d=await form(f);f.db.exec(sql);await save(f,d,409);assert.equal(count(f,'booking_payment_entries'),0);}
});
test('문의 없는 예약도 별도 보증금 체크와 계좌 알림으로 처리한다',async t=>{
 const f=setup(t);f.db.exec('UPDATE bookings SET inquiry_ref=NULL');const r=await save(f,await form(f));assert.equal(r.settlement.balance,0);assert.equal(f.db.prepare('SELECT paid FROM booking_deposit_checks').get().paid,1);assert.equal(count(f,'inquiry_checks'),0);assert.equal(r.deposit_notice.status,'queued');
});
test('문의에 여러 예약이 연결되거나 보증금이 없는 예약은 합산 처리를 막는다',async t=>{
 const f=setup(t);f.db.exec("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,created_at) SELECT 'BK-OTHER',space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,created_at FROM bookings WHERE booking_code='BK-TEST'");await save(f,await form(f),409);
 const g=setup(t);g.db.exec("UPDATE bookings SET confirm_doc=json_object('deposit',0)");const d=await form(g);assert.match((await g.api('bookings/BK-TEST/settlement')).deposit.reason,/보증금 금액/);await save(g,{...d,deposit_amount:150000},409);
});
test('확정서의 별도 보증금액을 보존하고 수납 후 재발급해도 대기 중 계좌 안내를 막지 않는다',async t=>{
 const f=setup(t);f.db.exec("UPDATE bookings SET confirm_doc=json_object('deposit',250000,'settlement',json_object('amount',500000))");const d=await form(f);assert.equal(d.deposit_amount,250000);await save(f,d);assert.equal(f.db.prepare('SELECT amount FROM booking_refunds').get().amount,250000);assert.equal(JSON.parse(f.db.prepare("SELECT payload FROM deposit_notifications WHERE kind='account'").get().payload).amount,250000);
 const s=await f.api('bookings/BK-TEST/confirm-doc');await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{deposit:250000,show_amount:true},settlement_revision:s.settlement.revision});assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE kind='account'").get().status,'queued');
});
test('기존 미발송 입금 요청은 중지하고 계좌가 이미 등록된 경우 재요청하지 않는다',async t=>{
 const f=setup(t);f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) VALUES('BK-TEST','payment','payment-test',datetime('now'),'{}')").run();
 await save(f,await form(f));assert.equal(f.db.prepare("SELECT status FROM deposit_notifications WHERE kind='payment'").get().status,'cancelled');
});

test('이미 등록된 환급 계좌에는 합산 입금 후에도 계좌 요청이 발송되지 않는다',async t=>{
 const f=setup(t);f.db.prepare("INSERT INTO booking_refunds(booking_code,amount,account_cipher,created_at,updated_at) VALUES('BK-TEST',150000,'existing-encrypted-account',datetime('now'),datetime('now'))").run();
 await save(f,await form(f));const b=f.db.prepare("SELECT *,booking_refunds.amount AS deposit_amount,1 AS deposit_paid,'pending' AS refund_state FROM bookings JOIN booking_refunds USING(booking_code)").get(),e=f.db.prepare("SELECT * FROM deposit_notifications WHERE kind='account'").get();assert.match(noticeObsolete(b,e),/이미 등록/);
});
test('자동 발송 OFF에서도 은행 입금은 기록하고 발송 준비 여부를 숨기지 않는다',async t=>{
 const f=setup(t);f.db.prepare("UPDATE settings SET value=? WHERE key='deposit_alimtalk'").run(JSON.stringify({enabled:false,types:{account:false}}));const r=await save(f,await form(f));assert.equal(r.deposit_notice,null);assert.equal(r.settlement.balance,0);assert.equal((await f.api('bookings/BK-TEST/settlement')).deposit.automatic,false);
});
test('동일 요청의 동시 재시도도 중복 수납과 확정서 무효화를 만들지 않는다',async t=>{
 const f=setup(t),d=await form(f),run=f.env.DB.batch.bind(f.env.DB),pending=[];
 f.env.DB.batch=ss=>new Promise((resolve,reject)=>{pending.push({ss,resolve,reject});if(pending.length===2){f.env.DB.batch=run;(async()=>{try{pending[0].resolve(await run(pending[0].ss));await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{deposit:150000},settlement_revision:(await f.api('bookings/BK-TEST/settlement')).settlement.revision});pending[1].resolve(await run(pending[1].ss));}catch(e){pending.forEach(x=>x.reject(e));}})();}});
 const r=await Promise.all([save(f,d),save(f,d)]);assert.equal(r.filter(x=>x.duplicate).length,1);assert.equal(count(f,'booking_payment_entries'),1);assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc.issued_at);
});
test('기존 데이터베이스 자동 초기화가 합산 입금 테이블과 안내 검토 트리거를 적용한다',async t=>{
 const f=setup(t),{SCHEMA}=await import('../functions/api/_schema.js');f.db.exec('DROP TABLE booking_combined_receipts');for(const sql of SCHEMA)f.db.exec(sql);const r=await save(f,await form(f));assert.equal(r.combined_receipt.deposit,150000);assert.equal(r.deposit_notice.status,'queued');
});
