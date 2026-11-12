import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {onRequest as portal} from '../functions/api/booking-portal/[[path]].js';
function setup(t){const f=fixture({booking:true});t.after(()=>f.db.close());f.env.DEPOSIT_ACCOUNT_KEY='ab'.repeat(32);t.mock.method(globalThis,'fetch',async()=>{throw Error('Financial saves must not send external test messages');});return f;}
async function input(f,amount,extra={}){return {kind:'receipt',amount,request_id:crypto.randomUUID(),expected_revision:(await f.api('bookings/BK-TEST/settlement')).settlement.revision,...extra};}
const save=(f,d,status=200)=>f.api('bookings/BK-TEST/settlement','POST',d,status);
const document=f=>JSON.parse(f.db.prepare("SELECT confirm_doc FROM bookings WHERE booking_code='BK-TEST'").get().confirm_doc);
async function view(f,url){const response=await portal({env:f.env,params:{path:['view']},request:new Request('https://local.test/api/booking-portal/view',{headers:{Authorization:'Bearer '+url.split('#booking=')[1]}})});assert.equal(response.status,200);return response.json();}
test('예약금과 잔금 저장 직후 같은 통합 링크의 확정서·수납·잔금을 함께 갱신한다',async t=>{
 const f=setup(t),link=await f.api('bookings/BK-TEST/portal-link','POST',{});
 const first=await save(f,await input(f,100000));assert.equal(first.confirmation.current,true);assert.equal(first.confirmation.issue_no,1);
 const partial=await view(f,link.url);assert.equal(partial.confirmation.paid,100000);assert.equal(partial.confirmation.settlement.balance,400000);assert.equal(partial.payment.balance,400000);assert.equal(partial.deposit.paid,false);
 const issuedAt=document(f).issued_at;
 const second=await save(f,await input(f,400000));assert.equal(second.confirmation.current,true);assert.equal(second.confirmation.issue_no,2);
 const full=await view(f,link.url);assert.equal(full.confirmation.paid,500000);assert.equal(full.confirmation.pay_status,'paid');assert.equal(full.confirmation.settlement.balance,0);assert.equal(full.payment.balance,0);assert.equal(full.deposit.paid,false);assert.equal(document(f).issued_at,issuedAt);assert.equal((await f.api('bookings/BK-TEST/portal-link','POST',{})).url,link.url);
});
test('확정서의 담당자·행사명·특약·환불 조건·별도 보증금·금액 비공개를 유지한다',async t=>{
 const f=setup(t);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{customer:'고객 담당자',event:'기존 행사',note:'합의한 특약',items:['특별 이용 조건'],refund:[{k:'별도 합의',v:'담당자 확인'}],deposit:230000,show_amount:false}});
 const before=document(f);await save(f,await input(f,100000));const after=document(f);
 for(const key of ['customer','event','note','items','refund','deposit','show_amount','issued_at'])assert.deepEqual(after[key],before[key],key);
 assert.equal(after.issue_no,before.issue_no+1);assert.equal(after.paid,100000);
 const link=await f.api('bookings/BK-TEST/portal-link','POST',{}),publicView=await view(f,link.url);assert.equal(publicView.confirmation.paid,null);assert.equal(publicView.payment.balance,null);assert.equal(publicView.deposit.amount,null);
});
test('동일 입금 재시도는 수납·발급 횟수·문서 갱신 이력을 늘리지 않는다',async t=>{
 const f=setup(t),d=await input(f,100000);await save(f,d);const before=document(f),logs=f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind LIKE 'booking.confirm_doc.%'").get().n;
 const duplicate=await save(f,d);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.confirmation.current,true);assert.deepEqual(document(f),before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n,1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind LIKE 'booking.confirm_doc.%'").get().n,logs);
});
test('입금 기록 정정·취소·복원도 장부와 일치하는 확정서를 즉시 보존한다',async t=>{
 const f=setup(t);await save(f,await input(f,100000));
 const edit=async(action,amount)=>{const r=await f.api('bookings/BK-TEST/settlement'),e=r.entries[0];return f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action,kind:'receipt',amount,reason:'검증용 정정',request_id:crypto.randomUUID(),entry_version:e.version,expected_revision:r.settlement.revision});};
 for(const [action,amount,expected] of [['correct',200000,200000],['void',200000,0],['correct',150000,150000]]){const r=await edit(action,amount);assert.equal(r.confirmation.current,true);assert.equal(document(f).paid,expected);assert.equal(document(f).settlement.revision,r.settlement.revision);}
});
test('확정서 저장 실패는 입금 기록까지 되돌려 부분 저장을 남기지 않는다',async t=>{
 const f=setup(t),d=await input(f,100000);f.db.exec("CREATE TRIGGER reject_auto_document BEFORE UPDATE OF confirm_doc ON bookings BEGIN SELECT RAISE(ABORT,'fixture reject'); END");
 await save(f,d,500);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n,0);assert.equal(document(f),null);
});
test('준비 중 확정서 조건이 바뀌면 입금을 덮어 저장하지 않고 충돌을 알린다',async t=>{
 const f=setup(t),d=await input(f,100000),batch=f.env.DB.batch;let once=false;
 f.env.DB.batch=async statements=>{if(!once){once=true;f.db.prepare("UPDATE bookings SET confirm_doc=? WHERE booking_code='BK-TEST'").run(JSON.stringify({note:'다른 관리자가 저장한 조건',show_amount:false}));}return batch(statements);};
 await save(f,d,409);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n,0);assert.equal(document(f).note,'다른 관리자가 저장한 조건');assert.equal(document(f).show_amount,false);
});

test('확정 보류·취소 예약은 입금 기록만으로 예약확정서를 발급하지 않는다',async t=>{
 const f=setup(t);for(const status of ['payment_review','cancelled']){f.db.prepare("UPDATE bookings SET status=?,confirm_doc=NULL WHERE booking_code='BK-TEST'").run(status);const r=await save(f,await input(f,100000));assert.equal(r.confirmation.issued,false);assert.equal(document(f),null);}
});
