import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {saveQuote,quoteInput,DAY} from './helpers/admin-fixture.mjs';
import {onRequestGet} from '../functions/api/confirm.js';
import {confirmToken} from '../functions/api/_confirm.js';
import S from '../assets/js/settlement.js';
const setup=t=>{const f=payappFixture();t.after(()=>f.db.close());return f;};
const read=f=>f.api('bookings/BK-TEST/cancellation');
async function bank(f,kind,amount){const r=await read(f);return f.api('bookings/BK-TEST/settlement','POST',{kind,amount,note:'재취소 검증',request_id:crypto.randomUUID(),expected_revision:r.settlement.revision});}
async function cancel(f,fee,extra={},expected=200){const r=await read(f);return f.api('bookings/BK-TEST/cancellation','POST',{mode:'manual',fee,reason:'새 취소 수수료 합의',cancelled_at:new Date().toISOString(),request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version,...extra},expected);}
async function restore(f,extra={}){const r=await read(f);return f.api('bookings/BK-TEST/reconfirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:1000000,memo:'재취소 검증',expected_revision:r.settlement.revision,request_id:crypto.randomUUID(),...extra});}
async function issue(f,extra={}){const r=await read(f);return f.api('bookings/BK-TEST/cancellation/document','POST',{expected_version:r.version,expected_revision:r.settlement.revision,...extra});}
async function customer(f){const r=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});return {status:r.status,...await r.json()};}
async function secondCycle(f,{topup=800000}={}){await bank(f,'receipt',1000000);await saveQuote(f.api,{total:1000000,input:quoteInput()});await cancel(f,200000);await bank(f,'refund',800000);await restore(f);if(topup)await bank(f,'receipt',topup);}

test('재확정 후 재취소는 이전 수수료를 더하지 않고 이번 환불 목표·실적을 분리',async t=>{
 const f=setup(t);await secondCycle(f);await cancel(f,100000);const r=await read(f),s=r.settlement;assert.equal(s.received,1800000);assert.equal(s.refunded,800000);assert.equal(s.net,1000000);assert.equal(s.cancellation.fee,100000);assert.equal(s.prior_refunded,800000);assert.equal(s.cycle_received,1000000);assert.equal(s.cycle_refunded,0);assert.equal(s.refund_target,900000);assert.equal(s.refund_due,900000);assert.equal(s.balance,0);assert(r.terms.cycle);assert.equal(r.history[1].terms.fee,200000);assert.equal((await f.api('inquiries/MS-TEST')).bookings[0].settlement.refund_due,900000);
});
test('재확정 뒤 추가 입금이 없으면 남아 있는 기존 수납액 안에서만 새 환불을 정산',async t=>{
 const f=setup(t);await secondCycle(f,{topup:0});await cancel(f,100000);const s=(await read(f)).settlement;assert.equal(s.cycle_received,200000);assert.equal(s.refund_target,100000);assert.equal(s.cycle_refunded,0);assert.equal(s.refund_due,100000);assert.equal(s.refunded,800000);
});
test('새 취소 수수료의 입력 상한에 이전에 이미 환불한 돈을 포함하지 않음',async t=>{
 const f=setup(t);await secondCycle(f,{topup:0});await cancel(f,300000,{},400);assert.equal((await read(f)).booking.status,'confirmed');assert.equal((await read(f)).terms,null);
});
test('재확정 후 다시 취소할 때 미발급 문서도 금액 비공개 기본값 유지',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await cancel(f,200000);await issue(f,{show_amount:false});await bank(f,'refund',800000);await restore(f);let r=await read(f);assert.equal(r.document_preferences.show_amount,false);await cancel(f,100000);r=await read(f);assert.equal(r.preview.show_amount,false);await issue(f);const current=await customer(f);assert.equal(current.doc.show_amount,false);assert.equal(current.doc.settlement,null);
});

test('재취소 후 분할 환불·3회차 재확정과 취소도 이전 환불을 한 번만 차감',async t=>{
 const f=setup(t);await secondCycle(f);await cancel(f,100000);await bank(f,'refund',300000);let s=(await read(f)).settlement;assert.equal(s.cycle_refunded,300000);assert.equal(s.refunded,1100000);assert.equal(s.refund_due,600000);await bank(f,'refund',600000);s=(await read(f)).settlement;assert.equal(s.net,100000);assert.equal(s.refund_due,0);assert.equal(s.status,'cancellation_settled');await restore(f);await cancel(f,50000);s=(await read(f)).settlement;assert.equal(s.cancellation.fee,50000);assert.equal(s.prior_refunded,1700000);assert.equal(s.cycle_received,100000);assert.equal(s.refund_target,50000);assert.equal(s.cycle_refunded,0);assert.equal(s.refund_due,50000);await bank(f,'refund',50000);assert.equal((await read(f)).settlement.refund_due,0);assert.equal((await read(f)).history.length,3);
});
test('같은 회차 수수료 변경은 현재 회차 기준과 환불 실적을 유지',async t=>{
 const f=setup(t);await secondCycle(f);await cancel(f,100000);await bank(f,'refund',300000);const first=(await read(f)).terms;await cancel(f,50000);const s=(await read(f)).settlement;assert.deepEqual(s.cancellation.cycle,first.cycle);assert.equal(s.refund_target,950000);assert.equal(s.cycle_refunded,300000);assert.equal(s.refund_due,650000);assert.equal(s.cancellation.basis_cycle_received,1000000);
});
test('재취소 전후 견적·고객 정산서는 새 수수료와 이번 환불을 표시하고 과거 견적은 보존',async t=>{
 const f=setup(t);await secondCycle(f);const before=await saveQuote(f.api,{total:1000000});await cancel(f,100000);await bank(f,'refund',300000);await issue(f);const current=await customer(f);assert.equal(current.doc.doc_type,'cancellation');assert.equal(current.doc.amount,100000);assert.equal(current.doc.settlement.refund_target,900000);assert.equal(current.doc.settlement.refund_due,600000);const rows=S.documentRows(current.doc);assert(rows.some(r=>r[0]==='이번 정산 환불 완료'&&r[1]==='300,000원'));assert(rows.some(r=>r[0]==='이전 환불 반영액'&&r[1].startsWith('800,000원')));await saveQuote(f.api,{total:1000000});const data=await f.api('inquiries/MS-TEST');assert.equal(data.quotes[0].data.settlement.refund_due,600000);assert.equal(data.quotes[0].data.settlement.cancellation.fee,100000);assert.equal(data.quotes.find(q=>q.quote_no===before.quote_no).data.settlement.cancellation,undefined);
});
test('이전 버전에서 저장한 재취소 데이터도 최신 재확정 시점으로 회차 구분',async t=>{
 const f=setup(t);await secondCycle(f);await cancel(f,100000);let r=await read(f);const terms={...r.terms};delete terms.cycle;delete terms.basis_cycle_received;delete terms.basis_cycle_refunded;f.db.prepare('UPDATE booking_cancellation_revisions SET terms=? WHERE id=?').run(JSON.stringify(terms),r.version);r=await read(f);assert.equal(r.terms.cycle.refunded_before,800000);assert.equal(r.settlement.refund_target,900000);assert.equal(r.settlement.refund_due,900000);assert.equal(r.history[0].terms.cycle,undefined);await cancel(f,50000);assert.equal((await read(f)).terms.basis_cycle_received,1000000);
});
test('페이앱·계좌 혼합 환불과 중복 콜백도 이번 회차 환불 실적에 한 번만 반영',async t=>{
 const f=setup(t),pg=f.seed({price:600000});await bank(f,'receipt',400000);await cancel(f,200000);const old=await f.form(pg,'70',{mul_no:'840001',orig_mul_no:pg.mul_no,orig_price:'600000',price:'400000'});await f.feedback(old);await bank(f,'refund',400000);await restore(f);await bank(f,'receipt',800000);await cancel(f,100000);const partial=await f.form(pg,'70',{mul_no:'840002',orig_mul_no:pg.mul_no,orig_price:'600000',price:'100000'});await f.feedback(partial);await f.feedback(partial);await f.feedback(old);await bank(f,'refund',200000);const s=(await read(f)).settlement;assert.equal(s.pg_refunded,500000);assert.equal(s.manual_refunded,600000);assert.equal(s.cycle_refunded,300000);assert.equal(s.refund_due,600000);assert.equal(s.received,1800000);assert.equal(s.refunded,1100000);
});
test('취소 저장 재시도와 과거 편집기는 새 회차 수수료·이력을 덮어쓰지 못함',async t=>{
 const f=setup(t);await secondCycle(f);const r=await read(f),body={mode:'manual',fee:100000,reason:'새 취소 수수료 합의',cancelled_at:new Date().toISOString(),request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version};await f.api('bookings/BK-TEST/cancellation','POST',body);const retry=await f.api('bookings/BK-TEST/cancellation','POST',body);assert.equal(retry.duplicate,true);assert.equal((await read(f)).history.length,2);await restore(f);await cancel(f,50000);await f.api('bookings/BK-TEST/cancellation','POST',{...body,request_id:crypto.randomUUID()},409);assert.equal((await read(f)).terms.fee,50000);
});
test('재확정 이후 늦게 도착한 기존 페이앱 환불도 실제 현재 수납액을 줄임',async t=>{
 const f=setup(t),pg=f.seed({price:1000000});await cancel(f,200000);await restore(f);await f.feedback(await f.form(pg,'70',{mul_no:'840003',orig_mul_no:pg.mul_no,orig_price:'1000000',price:'300000'}));await cancel(f,100000);const s=(await read(f)).settlement;assert.equal(s.prior_refunded,0);assert.equal(s.cycle_refunded,300000);assert.equal(s.refund_target,900000);assert.equal(s.refund_due,600000);assert.equal(s.net,700000);
});
test('재취소 전액 환불·과다 환불 검토·회차 금액 정정은 원장 차액과 일치',async t=>{
 const f=setup(t);await secondCycle(f,{topup:0});await cancel(f,0);assert.equal((await read(f)).settlement.refund_due,200000);await bank(f,'refund',200000);assert.equal((await read(f)).settlement.fully_refunded,true);await cancel(f,100000);let s=(await read(f)).settlement;assert.equal(s.review_required,true);assert.equal(s.refund_due,null);const e=(await f.api('bookings/BK-TEST/settlement')).entries.find(e=>e.kind==='refund'&&e.amount===800000);await f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action:'correct',kind:'refund',amount:700000,note:'정정',reason:'과거 환불 입력 확인',request_id:crypto.randomUUID(),entry_version:e.version,expected_revision:s.revision});s=(await read(f)).settlement;assert.equal(s.net,100000);assert.equal(s.cycle_received-s.cycle_refunded,s.net);assert.equal(s.refund_due,0);assert.equal(s.review_required,false);
});
test('새 이용일과 재확정 금액에 기본 환불 비율을 적용하고 초과 수납에는 수수료를 매기지 않음',async t=>{
 const f=setup(t);await secondCycle(f,{topup:1800000});const at=new Date().toISOString(),r=await read(f);await f.api('bookings/BK-TEST/cancellation','POST',{mode:'policy',reason:'새 날짜 기준',cancelled_at:at,request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version});const s=(await read(f)).settlement;assert.equal(s.cancellation.basis_net,2000000);assert.equal(s.cancellation.basis_eligible,1000000);assert.equal(s.cancellation.fee,0);assert.equal(s.refund_due,2000000);assert.equal(s.refund_target,2000000);
});
