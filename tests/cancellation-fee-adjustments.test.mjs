import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {saveQuote,DAY} from './helpers/admin-fixture.mjs';
import {onRequestGet} from '../functions/api/confirm.js';
import {confirmToken} from '../functions/api/_confirm.js';
import S from '../assets/js/settlement.js';
const setup=t=>{const f=payappFixture();t.after(()=>f.db.close());return f;};
const read=f=>f.api('bookings/BK-TEST/cancellation');
async function bank(f,kind,amount){const r=await read(f);return f.api('bookings/BK-TEST/settlement','POST',{kind,amount,note:'수수료 변경 검증',request_id:crypto.randomUUID(),expected_revision:r.settlement.revision});}
async function fee(f,amount,extra={},status=200){const r=await read(f);return f.api('bookings/BK-TEST/cancellation','POST',{mode:'manual',fee:amount,reason:'취소 수수료 변경 합의 확인',cancelled_at:r.terms?.cancelled_at||new Date().toISOString(),request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version,...extra},status);}
async function issue(f,extra={}){const r=await read(f);return f.api('bookings/BK-TEST/cancellation/document','POST',{expected_version:r.version,expected_revision:r.settlement.revision,...extra});}
async function customer(f){const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});return {status:response.status,...await response.json()};}
async function settled(f){await bank(f,'receipt',1000000);await saveQuote(f.api,{total:1000000});await fee(f,200000);await bank(f,'refund',800000);}

test('환불 완료 후 수수료 인상은 이미 환불한 돈을 보존하고 부족한 수수료만 다시 받을 금액으로 계산',async t=>{
 const f=setup(t);await settled(f);await fee(f,300000);const r=await read(f),s=r.settlement;assert.equal(s.received,1000000);assert.equal(s.refunded,800000);assert.equal(s.net,200000);assert.equal(s.cancellation.fee,300000);assert.equal(s.refund_target,700000);assert.equal(s.balance,100000);assert.equal(s.refund_due,0);assert.equal(s.status,'cancellation_receivable');assert.equal(s.review_required,false);assert.equal(r.history[1].terms.fee,200000);
});
test('수수료 감액은 추가 환불, 증액은 추가 수납으로 바뀌며 한쪽만 발생',async t=>{
 const f=setup(t);await settled(f);await fee(f,100000);let s=(await read(f)).settlement;assert.equal(s.balance,0);assert.equal(s.refund_due,100000);await fee(f,400000);s=(await read(f)).settlement;assert.equal(s.balance,200000);assert.equal(s.refund_due,0);assert.equal(s.refunded,800000);assert(S.rows(s).some(r=>r[0]==='다시 받아야 할 금액'&&r[1]==='200,000원'));
});
test('문의를 통한 정산·견적·고객 확정서 링크는 수정 수수료와 다시 받을 금액을 공유',async t=>{
 const f=setup(t);await settled(f);await issue(f);await fee(f,300000);let r=await f.api('inquiries/MS-TEST');assert.equal(r.bookings[0].settlement.balance,100000);await saveQuote(f.api,{total:123000});r=await f.api('inquiries/MS-TEST');assert.equal(r.quotes[0].data.settlement.balance,100000);const c=await customer(f);assert.equal(c.doc.doc_type,'cancellation');assert.equal(c.doc.amount,300000);assert.equal(c.doc.paid,200000);assert.equal(c.doc.settlement.balance,100000);assert.equal(c.doc.settlement.refunded,800000);
});

test('추가 수납을 나눠 기록하면 다시 받을 금액만 줄고 예약 취소 상태는 유지',async t=>{
 const f=setup(t);await settled(f);await fee(f,300000);await bank(f,'receipt',40000);let s=(await read(f)).settlement;assert.equal(s.balance,60000);assert.equal(s.refund_due,0);assert.equal(s.refunded,800000);await bank(f,'receipt',60000);s=(await read(f)).settlement;assert.equal(s.balance,0);assert.equal(s.refund_due,0);assert.equal(s.status,'cancellation_settled');assert.equal(s.booking_status,'cancelled');assert.equal((await f.api('inquiries/MS-TEST')).item.status,'취소·환불');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendar_blocks').get().n,0);
});
test('수수료 인상 후 추가 수납한 다음 감액하면 새 환불 필요액을 계산',async t=>{
 const f=setup(t);await settled(f);await fee(f,300000);await bank(f,'receipt',100000);await fee(f,100000);let s=(await read(f)).settlement;assert.equal(s.balance,0);assert.equal(s.refund_due,200000);assert.equal(s.refunded,800000);await bank(f,'refund',200000);s=(await read(f)).settlement;assert.equal(s.net,100000);assert.equal(s.refund_due,0);assert.equal(s.balance,0);assert.equal(s.refunded,1000000);
});
test('수수료를 0원·전액으로 수정해도 실제 수납·환불 원장은 바뀌지 않음',async t=>{
 const f=setup(t);await settled(f);const before=(await f.api('bookings/BK-TEST/settlement')).entries;await fee(f,0);let s=(await read(f)).settlement;assert.equal(s.refund_due,200000);assert.equal(s.balance,0);await fee(f,1000000);s=(await read(f)).settlement;assert.equal(s.refund_due,0);assert.equal(s.balance,800000);assert.deepEqual((await f.api('bookings/BK-TEST/settlement')).entries,before);
});
test('재확정·재취소 후 수수료 수정도 이전 회차 수수료·환불을 중복하지 않음',async t=>{
 const f=setup(t);await settled(f);let r=await read(f);await f.api('bookings/BK-TEST/reconfirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:1000000,request_id:crypto.randomUUID(),expected_revision:r.settlement.revision});await bank(f,'receipt',800000);await fee(f,100000);await bank(f,'refund',900000);await fee(f,300000);r=await read(f);assert.equal(r.settlement.balance,200000);assert.equal(r.settlement.refund_due,0);assert.equal(r.settlement.refunded,1700000);assert.equal(r.settlement.cycle_refunded,900000);assert.equal(r.settlement.prior_refunded,800000);assert.equal(r.settlement.cancellation.fee,300000);await fee(f,50000);assert.equal((await read(f)).settlement.refund_due,50000);
});
test('수수료 변경 중 페이앱 지연 환불과 중복 통보도 추가 수납에 한 번만 반영',async t=>{
 const f=setup(t),pg=f.seed({price:1000000});await fee(f,200000);const partial=await f.form(pg,'70',{mul_no:'850001',orig_mul_no:pg.mul_no,orig_price:'1000000',price:'800000'});await f.feedback(partial);await fee(f,300000);await f.feedback(partial);let s=(await read(f)).settlement;assert.equal(s.balance,100000);assert.equal(s.refunded,800000);await f.feedback(await f.form(pg,'9'));s=(await read(f)).settlement;assert.equal(s.refunded,1000000);assert.equal(s.balance,300000);assert.equal(s.refund_due,0);await bank(f,'receipt',300000);assert.equal((await read(f)).settlement.status,'cancellation_settled');
});
test('수납·환불 정정 뒤 수정 수수료 기준으로 추가 수납과 환불이 전환',async t=>{
 const f=setup(t);await settled(f);await fee(f,300000);let r=await f.api('bookings/BK-TEST/settlement'),e=r.entries.find(e=>e.kind==='refund');await f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action:'correct',kind:'refund',amount:600000,note:'수정',reason:'실제 환불액 대조',request_id:crypto.randomUUID(),entry_version:e.version,expected_revision:r.settlement.revision});let s=(await read(f)).settlement;assert.equal(s.balance,0);assert.equal(s.refund_due,100000);r=await f.api('bookings/BK-TEST/settlement');e=r.entries.find(e=>e.kind==='refund');await f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action:'void',reason:'미실행 환불 취소',request_id:crypto.randomUUID(),entry_version:e.version,expected_revision:r.settlement.revision});s=(await read(f)).settlement;assert.equal(s.refund_due,700000);assert.equal(s.balance,0);assert.equal(s.refunded,0);
});
test('잘못된 원장으로 환불이 총입금보다 많거나 총입금이 수수료보다 작으면 계속 확인 필요',()=>{
 for(const value of [{received:100000,refunded:200000},{received:100000,refunded:0}]){const s=S.calculate({...value,cancellation:{fee:300000}});assert.equal(s.status,'payment_review');assert.equal(s.balance,null);assert.equal(s.refund_due,null);assert.equal(s.review_required,true);}
});
test('이미 열린 과거 수수료 편집·발급 요청은 최신 변경을 덮어쓰지 못함',async t=>{
 const f=setup(t);await settled(f);const before=await read(f);await fee(f,300000);await fee(f,400000,{expected_revision:before.settlement.revision,expected_version:before.version},409);await f.api('bookings/BK-TEST/cancellation/document','POST',{expected_revision:before.settlement.revision,expected_version:before.version},409);assert.equal((await read(f)).terms.fee,300000);assert.equal((await read(f)).settlement.balance,100000);
});
test('수수료 변경 요청 재전송은 같은 이력 한 건만 만들고 과거 견적은 보존',async t=>{
 const f=setup(t);await settled(f);const old=await saveQuote(f.api,{total:1000000}),r=await read(f),body={mode:'manual',fee:300000,reason:'취소 수수료 재합의',cancelled_at:r.terms.cancelled_at,request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version};await f.api('bookings/BK-TEST/cancellation','POST',body);assert.equal((await f.api('bookings/BK-TEST/cancellation','POST',body)).duplicate,true);const next=await read(f);assert.equal(next.history.length,2);assert.equal(next.settlement.balance,100000);await saveQuote(f.api,{total:1000000});const qs=(await f.api('inquiries/MS-TEST')).quotes;assert.equal(qs[0].data.settlement.balance,100000);assert.equal(qs.find(q=>q.quote_no===old.quote_no).data.settlement.cancellation.fee,200000);assert.equal(qs.find(q=>q.quote_no===old.quote_no).data.settlement.balance,0);
});
test('비공개 정산서의 수수료 변경과 재발급은 수납·환불·추가 수납 금액을 노출하지 않음',async t=>{
 const f=setup(t);await settled(f);await issue(f,{show_amount:false});await fee(f,300000);await issue(f);const c=await customer(f);assert.equal(c.doc.show_amount,false);assert.equal(c.doc.settlement,null);assert.equal(c.doc.amount,null);assert.equal(c.doc.paid,null);assert.deepEqual(S.documentRows(c.doc),[]);
});
