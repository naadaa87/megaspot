import test from 'node:test';
import assert from 'node:assert/strict';
import {payappFixture} from './helpers/payapp-refund-fixture.mjs';
import {saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import {now} from '../functions/api/_lib.js';
import {onRequestGet} from '../functions/api/confirm.js';
import {confirmToken} from '../functions/api/_confirm.js';
const setup=t=>{const f=payappFixture();t.after(()=>f.db.close());return f;};
const read=async f=>(await f.api('bookings/BK-TEST/settlement'));
async function bank(f,kind,amount,extra={}){const r=await read(f);return f.api('bookings/BK-TEST/settlement','POST',{kind,amount,note:'계좌 처리 검증',request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,...extra});}
async function part(f,o,id,amount){return f.feedback(await f.form(o,'70',{mul_no:id,orig_mul_no:o.mul_no,orig_price:String(o.price),price:String(amount)}));}
async function correct(f,e,extra){const r=await read(f);return f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action:'correct',kind:e.kind,amount:e.amount,note:e.note,reason:'혼합 결제 기록 정정',request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,entry_version:e.version,...extra});}
async function issue(f,show_amount=true){const r=await f.api('bookings/BK-TEST/confirm-doc');return f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{show_amount},settlement_revision:r.settlement.revision,reception_revision:r.inquiry.reception_revision});}
async function amounts(f,expected){const s=(await read(f)).settlement;for(const [k,v] of Object.entries(expected))assert.equal(s[k],v,k);assert.equal(s.received,s.pg_received+s.manual_received);assert.equal(s.refunded,s.pg_refunded+s.manual_refunded);assert.equal(s.net,s.received-s.refunded);return s;}

test('한 예약의 페이앱 2건과 계좌 2건·각 방식의 여러 부분 환불을 정확히 합산',async t=>{
 const f=setup(t),a=f.seed({price:600000}),b=f.seed({price:400000});await saveQuote(f.api,{total:1000000,input:quoteInput()});await bank(f,'receipt',200000);await bank(f,'receipt',300000);await part(f,a,'880001',100000);await part(f,b,'880002',50000);await bank(f,'refund',100000);await bank(f,'refund',50000);
 const s=await amounts(f,{received:1500000,refunded:300000,net:1200000,balance:0,refund_due:200000,pg_received:1000000,pg_refunded:150000,manual_received:500000,manual_refunded:150000});assert.equal(s.booking_status,'confirmed');const r=await read(f);assert.equal(r.online.length,2);assert.equal(r.entries.length,4);assert.equal((await f.api('inquiries/MS-TEST')).bookings[0].settlement.net,1200000);assert.equal((await f.api('bookings')).items[0].settlement.refund_due,200000);
 await saveQuote(f.api,{total:1300000,input:quoteInput()});await amounts(f,{net:1200000,balance:100000,refund_due:0});
});
test('여러 결제 중 한 PG 주문만 전액 환불하면 나머지 수납과 예약 유지',async t=>{
 const f=setup(t),a=f.seed({price:600000});f.seed({price:400000});await bank(f,'receipt',200000);await part(f,a,'880003',100000);await f.feedback(await f.form(a,'9'));await f.feedback(await f.form(a,'64'));await amounts(f,{received:1200000,refunded:600000,net:600000,balance:0,refund_due:100000,booking_status:'confirmed'});
});
test('계좌로 PG 금액 일부를 반환해도 합계가 맞으면 채널별 음수만으로 오류 처리하지 않음',async t=>{
 const f=setup(t);f.seed({price:800000});await bank(f,'receipt',100000);await bank(f,'refund',300000);await amounts(f,{received:900000,refunded:300000,net:600000,manual_received:100000,manual_refunded:300000,review_required:false,refund_due:100000});
});
test('계좌 환불 뒤 PG 취소로 실제 환불 합계가 수납을 넘으면 자동 예약 취소 대신 정산 확인',async t=>{
 const f=setup(t),a=f.seed({price:600000});f.seed({price:400000});await bank(f,'receipt',200000);await bank(f,'refund',800000);await f.feedback(await f.form(a,'9'));await amounts(f,{received:1200000,refunded:1400000,net:-200000,over_refunded:200000,balance:null,refund_due:null,status:'payment_review',booking_status:'confirmed'});assert.equal((await f.api('inquiries/MS-TEST')).item.status,'예약 확정');
});
test('같은 시각의 기존 확정서 계좌 수납도 추가 PG 승인 전에 보존',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-03T12:30:00Z')});const f=setup(t),o=f.seed({status:'created',price:300000});f.db.prepare('UPDATE bookings SET confirm_doc=?').run(JSON.stringify({paid:200000,issued_at:now(),updated_at:now(),amount:500000}));await f.feedback(await f.form(o,'4'));await amounts(f,{pg_received:300000,manual_received:200000,net:500000,balance:0,refund_due:0});assert.equal((await read(f)).entries.filter(e=>e.request_id==='legacy-confirmation').length,1);
});
test('추가 PG 승인도 확정서를 갱신 대상으로 만들고 승인 재전송은 재발급본을 유지',async t=>{
 const f=setup(t);await bank(f,'receipt',200000);await issue(f);const o=f.seed({status:'pending',price:300000});await f.feedback(await f.form(o,'4'));assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);const issued=await issue(f);assert.equal(issued.doc.paid,500000);await f.feedback(await f.form(o,'4'));assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);await amounts(f,{received:500000,net:500000});
});
for(const last of ['bank','pg'])test('PG·계좌 전액 환불 완료 순서가 달라도 정산·예약 취소 결과 일치: 마지막 '+last,async t=>{
 const f=setup(t),o=f.seed({price:300000});await bank(f,'receipt',200000);if(last==='bank'){await f.feedback(await f.form(o,'9'));await bank(f,'refund',200000);}else{await bank(f,'refund',200000);await f.feedback(await f.form(o,'9'));}await amounts(f,{received:500000,refunded:500000,net:0,balance:0,refund_due:0,status:'refunded',booking_status:'cancelled'});
});
test('예약 금액이 빈 예전 예약도 여러 결제 중 마지막 결제액 대신 저장된 견적을 사용',async t=>{
 const f=setup(t);f.db.prepare('UPDATE bookings SET amount=NULL').run();f.db.prepare('INSERT INTO quotes(quote_no,inquiry_ref,total,data,created_at) VALUES(?,?,?,?,?)').run('Q-LEGACY','MS-TEST',1000000,'{}',now());f.seed({price:300000});f.seed({price:200000});await bank(f,'receipt',100000);await amounts(f,{amount:1000000,received:600000,balance:400000,refund_due:0});assert.equal((await f.api('inquiries/MS-TEST')).item.effective_amount,1000000);
});
test('견적·문의 금액까지 없는 혼합 결제 예약은 결제 1건으로 계약 총액을 추정하지 않음',async t=>{
 const f=setup(t);f.db.prepare('UPDATE bookings SET amount=NULL').run();f.db.prepare("UPDATE inquiries SET data=json_remove(data,'$.total')").run();f.seed({price:300000});f.seed({price:200000});await bank(f,'receipt',100000);await amounts(f,{amount:null,received:600000,balance:null,refund_due:null,status:'unpriced'});
});
test('테스트·미승인 주문은 계약 금액의 대체값도 실제 수납에도 사용하지 않음',async t=>{
 const f=setup(t);f.db.prepare('UPDATE bookings SET amount=NULL').run();f.seed({price:999000,test:1});f.seed({price:777000,status:'pending'});await amounts(f,{amount:450000,received:0,balance:450000,refund_due:0});
});
test('혼합 결제의 계좌 정정·취소·복원도 PG 원장을 바꾸지 않고 합계 갱신',async t=>{
 const f=setup(t),o=f.seed({price:600000});await bank(f,'receipt',200000);let e=(await read(f)).entries[0];await part(f,o,'880004',100000);await bank(f,'refund',50000);await correct(f,e,{amount:300000});await amounts(f,{received:900000,refunded:150000,net:750000,refund_due:250000});e=(await read(f)).entries.find(x=>x.id===e.id);await correct(f,e,{action:'void'});await amounts(f,{received:600000,refunded:150000,net:450000,balance:50000});e=(await read(f)).entries.find(x=>x.id===e.id);await correct(f,e,{amount:100000});await amounts(f,{received:700000,refunded:150000,net:550000,refund_due:50000});assert.equal(f.db.prepare('SELECT SUM(amount) n FROM payapp_refunds WHERE oid=?').get(o.oid).n,100000);
});
test('환불한 혼합 결제의 견적·확정서·고객 조회와 금액 숨김을 함께 검증',async t=>{
 const f=setup(t),a=f.seed({price:600000});f.seed({price:400000});await bank(f,'receipt',200000);const old=await saveQuote(f.api,{total:1000000,input:quoteInput()});await part(f,a,'880005',100000);await bank(f,'refund',50000);const next=await saveQuote(f.api,{total:1000000,input:quoteInput()});const q=(await f.api('inquiries/MS-TEST')).quotes;assert.equal(q.find(x=>x.quote_no===old.quote_no).data.settlement.net,1200000);assert.equal(q.find(x=>x.quote_no===next.quote_no).data.settlement.net,1050000);let doc=(await issue(f)).doc;assert.equal(doc.settlement.refund_due,50000);assert.equal(doc.paid,1050000);const request=new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'));let publicResult=await onRequestGet({env:f.env,request});assert.equal((await publicResult.json()).doc.settlement.net,1050000);await issue(f,false);publicResult=await onRequestGet({env:f.env,request});doc=(await publicResult.json()).doc;assert.equal(doc.settlement,null);assert.equal(doc.paid,null);assert.equal(doc.amount,null);
});
test('PG 환불과 동시에 오래된 계좌 환불 입력은 거절하고 새 합계로만 재입력',async t=>{
 const f=setup(t),o=f.seed({price:600000});await bank(f,'receipt',200000);const previous=(await read(f)).settlement;await part(f,o,'880006',100000);await bank(f,'refund',100000,{expected_revision:previous.revision}).then(()=>assert.fail('이전 정산 버전 거절')).catch(e=>assert.match(e.message,/409/));await amounts(f,{received:800000,refunded:100000,net:700000});await bank(f,'refund',100000);await amounts(f,{refunded:200000,net:600000});
});

test('자동 환불 취소는 해당 예약의 달력 표시만 해제하고 중복 통보는 재확정 예약을 유지',async t=>{
 const f=setup(t),o=f.seed({price:300000});await bank(f,'receipt',200000);f.db.prepare('INSERT INTO calendar_blocks(space_id,date,state,memo) VALUES(?,?,?,?)').run('megaspot-gundae',f.data.date,'full','예약 BK-TEST');f.db.prepare('INSERT INTO calendar_blocks(space_id,date,state,memo) VALUES(?,?,?,?)').run('megaspot-gundae-2',f.data.date,'full','다른 예약 표시');await f.feedback(await f.form(o,'9'));assert.equal(f.db.prepare("SELECT COUNT(*) n FROM calendar_blocks WHERE memo='예약 BK-TEST'").get().n,1);await bank(f,'refund',200000,{request_id:'last-bank-refund-123'});assert.equal(f.db.prepare("SELECT COUNT(*) n FROM calendar_blocks WHERE memo='예약 BK-TEST'").get().n,0);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM calendar_blocks WHERE memo='다른 예약 표시'").get().n,1);const s=(await read(f)).settlement;f.db.prepare("UPDATE bookings SET status='confirmed'").run();f.db.prepare("UPDATE inquiries SET status='예약 확정'").run();await bank(f,'refund',200000,{request_id:'last-bank-refund-123',expected_revision:s.revision});await f.feedback(await f.form(o,'64'));assert.equal(f.db.prepare('SELECT status FROM bookings').get().status,'confirmed');
});
test('최근 내역 90건 제한과 관계없이 모든 PG·계좌 수납은 전체 합계에 포함',async t=>{
 const f=setup(t);for(let i=0;i<95;i++){f.seed({price:1000});f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES('BK-TEST',?,'receipt',2000,'검증',?)").run('many-bank-'+i,now());}const r=await read(f);assert.equal(r.online.length,90);assert.equal(r.entries.length,90);assert.equal(r.has_more,true);await amounts(f,{pg_received:95000,manual_received:190000,received:285000,refunded:0,net:285000,balance:215000});
});
test('PG 부분 취소와 계좌 환불 동시 요청도 재시도 후 각각 한 번만 합산',async t=>{
 const f=setup(t),o=f.seed({price:600000});await bank(f,'receipt',200000);const before=(await read(f)).settlement,body={kind:'refund',amount:50000,note:'계좌 처리 검증',request_id:'concurrent-bank-refund-123',expected_revision:before.revision};const results=await Promise.allSettled([part(f,o,'880007',100000),f.api('bookings/BK-TEST/settlement','POST',body)]);assert.equal(results[0].status,'fulfilled');if(results[1].status==='rejected'){assert.match(results[1].reason.message,/409/);body.expected_revision=(await read(f)).settlement.revision;}await f.api('bookings/BK-TEST/settlement','POST',body);await f.feedback(await f.form(o,'71',{mul_no:'880007',orig_mul_no:o.mul_no,orig_price:String(o.price),price:'100000'}));await amounts(f,{received:800000,refunded:150000,net:650000,refund_due:150000});assert.equal((await read(f)).entries.filter(e=>e.kind==='refund').length,1);
});

test('추가 테스트 PG 승인은 실제 수납·기존 확정서·정산 버전을 바꾸지 않음',async t=>{
 const f=setup(t);await bank(f,'receipt',200000);await issue(f);const before=(await read(f)).settlement,o=f.seed({status:'pending',price:900000,test:1});await f.feedback(await f.form(o,'4'));await amounts(f,{received:200000,net:200000,pg_received:0,balance:300000});assert.equal((await read(f)).settlement.revision,before.revision);assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);
});

test('계약 금액 미정은 PG 1건과 계좌 분할 입금이 있어도 결제액으로 대체하지 않음',async t=>{
 const f=setup(t);f.db.prepare('UPDATE bookings SET amount=NULL').run();f.db.prepare("UPDATE inquiries SET data=json_remove(data,'$.total')").run();f.seed({price:300000});await amounts(f,{amount:null,received:300000,balance:null,refund_due:null,status:'unpriced'});await bank(f,'receipt',200000);await amounts(f,{amount:null,received:500000,balance:null,refund_due:null,status:'unpriced'});assert.equal((await f.api('inquiries/MS-TEST')).item.effective_amount,null);
});
