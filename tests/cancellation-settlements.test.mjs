import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import {cancellationPolicy} from '../functions/api/_cancellation.js';
import {confirmToken} from '../functions/api/_confirm.js';
import {onRequestGet} from '../functions/api/confirm.js';
import S from '../assets/js/settlement.js';
const setup=t=>{const f=payappFixture();t.after(()=>f.db.close());return f;};
const read=f=>f.api('bookings/BK-TEST/cancellation');
async function bank(f,kind,amount){const r=await read(f);return f.api('bookings/BK-TEST/settlement','POST',{kind,amount,note:'검증',request_id:crypto.randomUUID(),expected_revision:r.settlement.revision});}
async function save(f,extra={},status=200){const r=await read(f);return f.api('bookings/BK-TEST/cancellation','POST',{request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,expected_version:r.version,mode:'manual',fee:200000,cancelled_at:new Date().toISOString(),reason:'고객과 취소 수수료 합의',...extra},status);}
async function issue(f,extra={},status=200){const r=await read(f);return f.api('bookings/BK-TEST/cancellation/document','POST',{expected_version:r.version,expected_revision:r.settlement.revision,...extra},status);}
async function customer(f){const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});return {status:response.status,...await response.json()};}
const part=(f,o,id,amount)=>f.form(o,'70',{mul_no:id,orig_mul_no:o.mul_no,orig_price:String(o.price),price:String(amount)});

test('기본 환불 비율은 취소 접수 한국 날짜 기준으로 경계일·자정 계산',()=>{
 for(const [day,rate] of [[15,10000],[14,8000],[8,8000],[7,6000],[6,6000],[5,3000],[4,3000],[3,0],[0,0],[-1,0]]){const at=new Date(Date.parse('2026-11-23T00:00:00+09:00')-day*864e5).toISOString();assert.equal(cancellationPolicy('2026-11-23',at).rate,rate);}
 assert.equal(cancellationPolicy('2026-11-23','2026-11-08T14:59:59Z').rate,10000);assert.equal(cancellationPolicy('2026-11-23','2026-11-08T15:00:00Z').rate,8000);
});
test('취소 수수료와 이전 환불을 분리해 전체 목표·이미 환불·추가 환불 정확히 계산',async t=>{
 const f=setup(t);f.seed({price:600000});await bank(f,'receipt',400000);await bank(f,'refund',100000);await save(f);const r=await read(f),s=r.settlement;assert.equal(s.cancellation.fee,200000);assert.equal(s.refund_target,800000);assert.equal(s.refunded,100000);assert.equal(s.refund_due,700000);assert.equal(s.balance,0);assert.equal(s.net,900000);assert.equal(s.status,'cancellation_refund');assert.equal((await f.api('inquiries/MS-TEST')).item.status,'취소·환불');assert.equal((await f.api('inquiries/MS-TEST')).bookings[0].settlement.refund_due,700000);assert.equal((await f.api('bookings')).items[0].settlement.cancellation.fee,200000);
});
test('환불 이후 정책 비율을 적용하면 이미 반환한 금액에 수수료를 다시 매기지 않음',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-03T12:00:00Z')});const f=setup(t);f.db.prepare("UPDATE bookings SET date='2026-11-13',amount=1000000").run();await bank(f,'receipt',1000000);await bank(f,'refund',100000);await save(f,{mode:'policy'});const r=await read(f);assert.equal(r.terms.basis_net,900000);assert.equal(r.terms.fee,180000);assert.equal(r.settlement.refund_target,820000);assert.equal(r.settlement.refund_due,720000);
});
test('분할 PG 환불·계좌 환불 뒤 수수료만 남으면 잔금 없이 정산 완료',async t=>{
 const f=setup(t),o=f.seed({price:600000});await bank(f,'receipt',400000);await save(f);await f.feedback(await part(f,o,'860001',300000));await bank(f,'refund',500000);const r=await read(f);assert.equal(r.settlement.refunded,800000);assert.equal(r.settlement.net,200000);assert.equal(r.settlement.refund_due,0);assert.equal(r.settlement.balance,0);assert.equal(r.settlement.status,'cancellation_settled');assert.equal(r.booking.status,'cancelled');
});
test('전액 환불 예외는 수수료 0원이고 기존 환불을 추가 합산하지 않음',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await bank(f,'refund',100000);await save(f,{mode:'full',reason:'결제 후 2시간 이내 취소 확인'});let s=(await read(f)).settlement;assert.equal(s.cancellation.fee,0);assert.equal(s.refund_due,900000);await bank(f,'refund',900000);s=(await read(f)).settlement;assert.equal(s.refund_due,0);assert.equal(s.refunded,1000000);assert.equal(s.status,'cancellation_settled');
});
test('새 정산 저장은 기존 결제·환불 원장이나 계약 금액을 변경하지 않음',async t=>{
 const f=setup(t),o=f.seed();const original=(await f.api('inquiries/MS-TEST')).item.data;await save(f);assert.equal(f.db.prepare('SELECT price FROM orders WHERE oid=?').get(o.oid).price,1000000);assert.equal(f.db.prepare('SELECT amount FROM bookings').get().amount,500000);assert.equal((await f.api('inquiries/MS-TEST')).item.data.total,original.total);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payapp_refunds').get().n,0);assert.equal((await f.api('bookings/BK-TEST/settlement')).entries.length,0);
});
test('이후 환불 기록의 정정·취소는 취소 수수료를 보존하고 추가 환불액만 갱신',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await save(f);await bank(f,'refund',400000);let r=await f.api('bookings/BK-TEST/settlement'),e=r.entries[0];await f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action:'correct',kind:'refund',amount:300000,note:'정정',reason:'금액 오입력',request_id:crypto.randomUUID(),entry_version:e.version,expected_revision:r.settlement.revision});r=await f.api('bookings/BK-TEST/settlement');assert.equal(r.settlement.refund_due,500000);e=r.entries.find(x=>x.id===e.id);await f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action:'void',reason:'실제 미환불',request_id:crypto.randomUUID(),entry_version:e.version,expected_revision:r.settlement.revision});assert.equal((await read(f)).settlement.refund_due,800000);assert.equal((await read(f)).terms.fee,200000);
});
test('수수료보다 수납이 작아지거나 목표보다 더 환불하면 확인 대상으로 남김',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await save(f);await bank(f,'refund',900000);let r=await read(f);assert.equal(r.settlement.cancellation_over_refunded,100000);assert.equal(r.settlement.status,'payment_review');assert.equal(r.settlement.refund_due,null);assert(S.rows(r.settlement).some(x=>x[1].includes('100,000원 더 환불')));
});
test('수수료 합의 변경은 원본 이력을 보존하고 기존 환불 기준액에 비율 재적용',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await save(f);await bank(f,'refund',500000);await save(f,{fee:300000,reason:'수수료 30만원으로 합의 정정'});let r=await read(f);assert.equal(r.history.length,2);assert.equal(r.history[1].terms.fee,200000);assert.equal(r.terms.basis_net,1000000);assert.equal(r.settlement.refund_due,200000);await save(f,{mode:'full',reason:'운영 사정으로 전액 환불 합의'});r=await read(f);assert.equal(r.settlement.refund_due,500000);assert.equal(r.terms.basis_net,1000000);
});
test('취소 정산 재전송은 이력·재발급 문서·현재 상태를 중복 변경하지 않음',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);const r=await read(f),body={request_id:'stable-cancellation-123',expected_revision:r.settlement.revision,expected_version:0,mode:'manual',fee:200000,cancelled_at:new Date().toISOString(),reason:'수수료 합의'};await f.api('bookings/BK-TEST/cancellation','POST',body);await issue(f);await f.api('bookings/BK-TEST/cancellation','POST',body);assert.equal((await read(f)).history.length,1);assert.equal((await read(f)).issued,true);await f.api('bookings/BK-TEST/cancellation','POST',{...body,fee:300000},409);
});
test('오래 열린 취소 입력·문서 발급은 최신 수납이나 정산 변경 후 거절',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);let r=await read(f);await bank(f,'refund',100000);await save(f,{expected_revision:r.settlement.revision},409);await save(f);r=await read(f);await save(f,{fee:300000});await issue(f,{expected_version:r.version,expected_revision:r.settlement.revision},409);assert.equal((await read(f)).issued,false);
});
test('수수료·시각·사유 검증과 음수 수납의 취소 정산 생성 차단',async t=>{
 const f=setup(t);await bank(f,'receipt',100000);for(const extra of [{fee:-1},{fee:100001},{fee:1.5},{reason:''},{cancelled_at:'bad'},{cancelled_at:'2099-01-01T00:00:00Z'},{mode:'other'}])await save(f,extra,400);assert.equal((await read(f)).history.length,0);assert.equal((await read(f)).booking.status,'confirmed');
});
test('같은 예약에 동시 취소 정산은 최신 버전 하나만 저장',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);const r=await read(f);const outcomes=await Promise.allSettled([200000,300000].map(fee=>save(f,{fee,expected_revision:r.settlement.revision,expected_version:0})));assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal((await read(f)).history.length,1);
});
test('한 문의의 다른 예약과 보증금 정산은 취소 환불 계산에 섞지 않음',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);f.db.prepare("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,amount,created_at) SELECT 'BK-OTHER',space_id,inquiry_ref,customer_name,phone,phone_last4,date,'confirmed',500000,created_at FROM bookings").run();await save(f);assert.equal((await f.api('inquiries/MS-TEST')).item.status,'예약 확정');assert.equal(f.db.prepare("SELECT status FROM bookings WHERE booking_code='BK-OTHER'").get().status,'confirmed');assert.equal((await read(f)).settlement.received,1000000);
});
test('재확정은 이전 취소 정산·고객 정산서를 해제하고 이력은 보존',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await save(f);await issue(f);await f.api('bookings/BK-TEST','PATCH',{status:'confirmed'});const r=await read(f);assert.equal(r.terms,null);assert.equal(r.history.length,1);assert.equal(r.settlement.cancellation,undefined);assert.equal((await customer(f)).status,404);await save(f,{fee:100000});assert.equal((await read(f)).version>r.version,true);
});
test('고객 확정서 링크는 취소 사실을 명시한 정산서로 발급하고 환불 실적을 최신 표시',async t=>{
 const f=setup(t),o=f.seed();await save(f);assert.equal((await customer(f)).status,410);let issued=await issue(f);assert.equal(issued.doc.doc_type,'cancellation');assert.equal(issued.doc.status,'cancelled');assert.equal(issued.doc.settlement.refund_due,800000);await f.feedback(await part(f,o,'860002',300000));const current=await customer(f);assert.equal(current.status,200);assert.equal(current.doc.doc_type,'cancellation');assert.equal(current.doc.settlement.refunded,300000);assert.equal(current.doc.settlement.refund_due,500000);assert(!JSON.stringify(current.doc).includes('processing_token'));
});
test('취소 정산서 금액 숨김은 수수료·목표·환불실적·수납을 모두 제거',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await save(f);await issue(f,{show_amount:false});const r=await customer(f);assert.equal(r.doc.settlement,null);assert.equal(r.doc.amount,null);assert.equal(r.doc.paid,null);assert.deepEqual(S.documentRows(r.doc),[]);
});
test('취소 후 새 견적은 취소 정산을 저장하고 원 계약·식음료·기존 견적은 보존',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);const q=await saveQuote(f.api,{total:1000000,input:quoteInput()});await save(f);await bank(f,'refund',100000);const before=(await f.api('inquiries/MS-TEST')).item.data;const next=await saveQuote(f.api,{total:123000,input:quoteInput()});const r=await f.api('inquiries/MS-TEST');assert.deepEqual(r.item.data,before);assert.equal(r.item.status,'취소·환불');const saved=r.quotes.find(x=>x.quote_no===next.quote_no);assert.equal(saved.data.settlement.cancellation.fee,200000);assert.equal(saved.data.settlement.refunded,100000);assert.equal(saved.data.settlement.refund_due,700000);assert.equal(r.quotes.find(x=>x.quote_no===q.quote_no).data.settlement.net,1000000);
});
test('정산 표 생성과 UI 날짜 계산도 같은 환불 기준 사용하며 원 단위 반올림',async t=>{
 const f=setup(t);await bank(f,'receipt',1003);await save(f,{mode:'full'});assert.equal((await read(f)).terms.fee,0);for(const at of ['2026-11-08T14:59:00Z','2026-11-08T15:00:00Z'])assert.deepEqual(S.cancellationPolicy('2026-11-23',at),cancellationPolicy('2026-11-23',at));const terms={fee:201,basis_net:1003,original_amount:500000,cancelled_at:new Date().toISOString(),reason:'검증',policy_label:'80% 환불'};const value=S.calculate({received:1003,refunded:100,cancellation:terms});assert.equal(value.refund_target,802);assert.equal(value.refund_due,702);assert(S.rows(value).some(x=>x[0]==='취소 수수료'));
});

test('기존 확정서 링크는 취소 저장 후 취소 정산서로 전환하며 금액 숨김 설정 유지',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);let c=await f.api('bookings/BK-TEST/confirm-doc');await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{show_amount:false},settlement_revision:c.settlement.revision});await save(f);let r=await customer(f);assert.equal(r.status,200);assert.equal(r.doc.doc_type,'cancellation');assert.equal(r.doc.show_amount,false);assert.equal(r.doc.settlement,null);await issue(f,{show_amount:true});await save(f,{fee:300000,reason:'취소 수수료 재합의'});r=await customer(f);assert.equal(r.doc.settlement.cancellation.fee,300000);assert.equal(r.doc.settlement.refund_due,700000);
});
test('수수료 100%·0원 수납·추가 결제도 저장된 취소 기준과 실제 실적을 일관되게 계산',async t=>{
 const f=setup(t);await save(f,{fee:0,mode:'full'});let r=await read(f);assert.equal(r.settlement.balance,0);assert.equal(r.settlement.refund_due,0);f.seed({price:100000});r=await read(f);assert.equal(r.settlement.refund_due,100000);assert.equal(r.terms.fee,0);const other=setup(t);await bank(other,'receipt',100000);await save(other,{fee:100000});const full=(await read(other)).settlement;assert.equal(full.refund_target,0);assert.equal(full.refund_due,0);assert.equal(full.net,100000);assert.equal(full.status,'cancellation_settled');
});
test('취소 정산 저장 중 DB 실패는 정산·예약 상태·달력을 함께 롤백',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);f.db.exec("CREATE TRIGGER cancellation_failure BEFORE INSERT ON booking_cancellation_state BEGIN SELECT RAISE(ABORT,'fixture failure'); END");await save(f,{},500);let r=await read(f);assert.equal(r.booking.status,'confirmed');assert.equal(r.version,0);assert.equal(r.history.length,0);f.db.exec('DROP TRIGGER cancellation_failure');await save(f);assert.equal((await read(f)).booking.status,'cancelled');
});

test('같은 취소 요청번호의 동시 재전송은 한 이력만 만들고 다른 금액 충돌은 거절',async t=>{
 for(const same of [true,false]){const f=payappFixture();try{await bank(f,'receipt',1000000);const r=await read(f),body={request_id:'same-concurrent-cancellation-123',expected_revision:r.settlement.revision,expected_version:0,mode:'manual',fee:200000,cancelled_at:new Date().toISOString(),reason:'동시 합의 검증'};const result=await Promise.allSettled([f.api('bookings/BK-TEST/cancellation','POST',body),f.api('bookings/BK-TEST/cancellation','POST',{...body,fee:same?200000:300000})]);assert.equal(result.filter(x=>x.status==='fulfilled').length,same?2:1);assert.equal((await read(f)).history.length,1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM event_log WHERE kind='booking.cancellation.saved'").get().n,1);}finally{f.db.close();}}
});
test('기존 비공개 금액 설정은 기본 정산서 재발급으로 공개되지 않음',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await save(f);await issue(f,{show_amount:false});const next=await issue(f);assert.equal(next.doc.show_amount,false);assert.equal(next.doc.settlement,null);assert.equal((await customer(f)).doc.settlement,null);
});
test('취소 수수료를 남기기로 한 뒤 PG 전액 환불이 오면 수수료 누락으로 정산 확인',async t=>{
 const f=setup(t),o=f.seed();await save(f);await issue(f);await f.feedback(await f.form(o,'9'));const r=await read(f);assert.equal(r.terms.fee,200000);assert.equal(r.settlement.refunded,1000000);assert.equal(r.settlement.cancellation_over_refunded,200000);assert.equal(r.settlement.status,'payment_review');assert.equal((await customer(f)).doc.settlement.refund_due,null);await save(f,{mode:'full',reason:'전액 환불로 수수료 면제 합의 확인'});assert.equal((await read(f)).settlement.refund_due,0);assert.equal((await read(f)).settlement.status,'cancellation_settled');
});

test('이미 전액 환불한 뒤 늦게 확인한 합의 수수료도 기록하고 초과 환불을 확인 가능',async t=>{
 const f=setup(t);await bank(f,'receipt',1000000);await bank(f,'refund',1000000);await save(f,{fee:200000,reason:'기존 합의 수수료 뒤늦게 확인 · 환불 실적 대조'});const r=await read(f);assert.equal(r.terms.fee,200000);assert.equal(r.settlement.refund_target,800000);assert.equal(r.settlement.refunded,1000000);assert.equal(r.settlement.cancellation_over_refunded,200000);assert.equal(r.settlement.status,'payment_review');
});
test('기존 확정서에서 전환한 취소 정산서 발급일은 원 확정일이 아닌 전환일',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-03T12:00:00Z')});const f=setup(t);await bank(f,'receipt',1000000);f.db.prepare('UPDATE bookings SET confirm_doc=?').run(JSON.stringify({issued_at:'2026-10-01 00:00:00',paid:1000000,settlement:{net:1000000},customer:'검증 고객'}));await save(f);assert.equal((await customer(f)).doc.issued_at.slice(0,10),'2026-11-03');
});

test('원 계약보다 초과 입금한 금액에는 기본 취소 수수료를 부과하지 않음',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-03T12:00:00Z')});const f=setup(t);f.db.prepare("UPDATE bookings SET date='2026-11-13',amount=1000000").run();await bank(f,'receipt',1400000);await bank(f,'refund',300000);await save(f,{mode:'policy'});const r=await read(f);assert.equal(r.terms.basis_net,1100000);assert.equal(r.terms.basis_eligible,1000000);assert.equal(r.terms.fee,200000);assert.equal(r.settlement.refund_target,1200000);assert.equal(r.settlement.refund_due,900000);assert(S.rows(r.settlement).some(x=>x[0]==='수수료 적용 수납액'));
});
