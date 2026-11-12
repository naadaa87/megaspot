import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import {onRequestGet} from '../functions/api/confirm.js';
import {confirmToken} from '../functions/api/_confirm.js';
import S from '../assets/js/settlement.js';
function setup(t){const f=fixture({booking:true});t.after(()=>f.db.close());return f;}
async function read(f){return f.api('bookings/BK-TEST/settlement');}
async function add(f,kind,amount,note='원본'){const s=(await read(f)).settlement;await f.api('bookings/BK-TEST/settlement','POST',{kind,amount,note,request_id:crypto.randomUUID(),expected_revision:s.revision});return (await read(f)).entries[0];}
async function edit(f,e,changes={},expected=200){const r=await read(f);return f.api('bookings/BK-TEST/settlement/entries/'+e.id,'POST',{action:'correct',kind:e.kind,amount:e.amount,note:e.note,reason:'금액 오입력 정정',entry_version:e.version,request_id:crypto.randomUUID(),expected_revision:r.settlement.revision,...changes},expected);}
async function latest(f,id){return(await read(f)).entries.find(e=>e.id===id);}
async function issue(f){const r=await f.api('bookings/BK-TEST/confirm-doc');return f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:r.booking.amount},settlement_revision:r.settlement.revision,reception_revision:r.inquiry.reception_revision});}

test('입금 금액·메모 정정은 원본 보존, 잔금·환불 필요액·문의·예약·문서에 반영',async t=>{
 const f=setup(t),e=await add(f,'receipt',800000);await issue(f);const r=await edit(f,e,{amount:200000,note:'실제 입금은 20만원'});assert.equal(r.settlement.net,200000);assert.equal(r.settlement.balance,300000);assert.equal(r.settlement.refund_due,0);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc.paid,(await read(f)).settlement.net);
 const it=(await f.api('inquiries/MS-TEST')).bookings[0];assert.equal(it.settlement.net,200000);assert.equal((await f.api('bookings')).items[0].settlement.balance,300000);
 const original=f.db.prepare('SELECT * FROM booking_payment_entries WHERE id=?').get(e.id);assert.equal(original.amount,800000);assert.equal(original.note,'원본');const current=await latest(f,e.id);assert.equal(current.amount,200000);assert.equal(current.original_amount,800000);assert.equal(current.note,'실제 입금은 20만원');assert.equal((await read(f)).history[0].reason,'금액 오입력 정정');const doc=(await issue(f)).doc;assert.equal(doc.paid,200000);assert.equal(doc.settlement.balance,300000);
});
test('환불 기록 정정·취소는 환불 필요액을 다시 계산하며 실제 수납 원액은 유지',async t=>{
 const f=setup(t);await add(f,'receipt',800000);const refund=await add(f,'refund',200000);assert.equal((await read(f)).settlement.refund_due,100000);await edit(f,refund,{amount:100000});let s=(await read(f)).settlement;assert.equal(s.received,800000);assert.equal(s.refunded,100000);assert.equal(s.refund_due,200000);const current=await latest(f,refund.id);await edit(f,current,{action:'void',reason:'환불이 실제 처리되지 않아 취소'});s=(await read(f)).settlement;assert.equal(s.refunded,0);assert.equal(s.refund_due,300000);assert.equal((await latest(f,refund.id)).state,'void');
});
test('입금 기록 취소·복원은 실제 환불 기록을 만들지 않고 한 번씩만 합산',async t=>{
 const f=setup(t),e=await add(f,'receipt',800000);await edit(f,e,{action:'void',reason:'중복 입금 기록 취소'});let r=await read(f);assert.equal(r.settlement.received,0);assert.equal(r.settlement.refunded,0);assert.equal(r.settlement.balance,500000);assert.equal(r.entries.length,1);await edit(f,r.entries[0],{amount:600000,reason:'실제 입금 확인 후 복원'});r=await read(f);assert.equal(r.settlement.received,600000);assert.equal(r.settlement.refund_due,100000);assert.equal(r.history.length,2);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n,1);
});
test('입금과 환불을 잘못 선택한 기록도 종류를 정정할 수 있음',async t=>{
 const f=setup(t);await add(f,'receipt',800000);const e=await add(f,'receipt',100000);await edit(f,e,{kind:'refund',reason:'환불을 입금으로 잘못 선택'});const s=(await read(f)).settlement;assert.equal(s.received,800000);assert.equal(s.refunded,100000);assert.equal(s.net,700000);assert.equal(s.refund_due,200000);
});
test('정정 후 환불액이 수납보다 많으면 음수 실수납을 표시하고 정산 확인 대상으로 처리',async t=>{
 const f=setup(t),receipt=await add(f,'receipt',800000);await add(f,'refund',600000);await edit(f,receipt,{amount:500000});const s=(await read(f)).settlement;assert.equal(s.net,-100000);assert.equal(s.over_refunded,100000);assert.equal(s.status,'payment_review');assert.equal(s.balance,null);assert.equal(s.refund_due,null);assert(S.rows(s).some(r=>r[0]==='정산 확인'));const doc=(await issue(f)).doc;assert.equal(doc.pay_status,'payment_review');assert.equal(doc.settlement.net,-100000);
});
test('금액이 같은 메모 정정도 확정서를 갱신하고 오래 열린 화면의 저장을 차단',async t=>{
 const f=setup(t),e=await add(f,'receipt',200000),before=await f.api('bookings/BK-TEST/confirm-doc');await issue(f);await edit(f,e,{note:'입금자 이름 정정'});assert.equal((await read(f)).settlement.net,200000);assert.notEqual((await read(f)).settlement.revision,before.settlement.revision);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000},settlement_revision:before.settlement.revision},409);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc.paid,(await read(f)).settlement.net);await edit(f,e,{amount:300000},409);
});
test('금액을 바꿨다가 원래 값으로 되돌려도 이전 정산 버전을 다시 사용할 수 없음',async t=>{
 const f=setup(t),e=await add(f,'receipt',200000),before=(await read(f)).settlement;await edit(f,e,{amount:300000});await edit(f,await latest(f,e.id),{amount:200000});const s=(await read(f)).settlement;assert.equal(s.net,before.net);assert.notEqual(s.revision,before.revision);await edit(f,await latest(f,e.id),{expected_revision:before.revision,amount:400000},409);
});
test('정정·취소 재시도는 중복 이력을 만들지 않고 재발급 문서를 무효화하지 않음',async t=>{
 const f=setup(t),e=await add(f,'receipt',200000),request_id='repeat-correction-123',before=(await read(f)).settlement;const changes={request_id,expected_revision:before.revision,amount:300000};await edit(f,e,changes);await issue(f);const retry=await edit(f,e,changes);assert.equal(retry.duplicate,true);assert.equal((await read(f)).history.length,1);assert.ok((await f.api('bookings/BK-TEST/confirm-doc')).doc);await edit(f,e,{...changes,amount:400000},409);
 const current=await latest(f,e.id),s=(await read(f)).settlement,body={action:'void',reason:'중복 기록',request_id:'repeat-void-123',expected_revision:s.revision};await edit(f,current,body);assert.equal((await edit(f,current,body)).duplicate,true);assert.equal((await read(f)).history.length,2);
});
test('취소한 원본의 추가 기록 요청이 재전송돼도 취소가 풀리지 않음',async t=>{
 const f=setup(t),before=(await read(f)).settlement,body={kind:'receipt',amount:200000,note:'원본',request_id:'retry-original-123',expected_revision:before.revision};await f.api('bookings/BK-TEST/settlement','POST',body);const e=(await read(f)).entries[0];await edit(f,e,{action:'void'});await f.api('bookings/BK-TEST/settlement','POST',body);assert.equal((await read(f)).settlement.net,0);assert.equal((await latest(f,e.id)).state,'void');
});
test('다른 예약의 기록·없는 기록·잘못된 금액·빈 사유·지원하지 않는 종류를 거절',async t=>{
 const f=setup(t),e=await add(f,'receipt',200000);for(const changes of [{amount:-1},{amount:0},{amount:1.5},{kind:'pg'},{reason:'   '},{action:'delete'}])await edit(f,e,changes,400);await f.api('bookings/BK-TEST/settlement/entries/999999','POST',{},404);
 f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,amount,created_at) VALUES('BK-OTHER','megaspot-gundae','다른 고객','010-1111-2222','2222','2026-11-23','confirmed',500000,'2026-11-03')").run();await f.api('bookings/BK-OTHER/settlement/entries/'+e.id,'POST',{},404);assert.equal((await read(f)).history.length,0);
});
test('정정 이력과 원본 보존용 마이그레이션을 반복해도 금액·이력이 유지',async t=>{
 const f=setup(t),e=await add(f,'receipt',200000);await edit(f,e,{amount:300000});const sql=await import('node:fs').then(fs=>fs.readFileSync(new URL('../migrations/20261103_payment_corrections.sql',import.meta.url),'utf8'));f.db.exec(sql);f.db.exec(sql);assert.equal((await read(f)).settlement.net,300000);assert.equal((await read(f)).history.length,1);
});
test('기존 확정서에서 이관한 수납 기록도 정정·취소 뒤 다시 이관되지 않음',async t=>{
 const f=setup(t);f.db.prepare('UPDATE bookings SET confirm_doc=?').run(JSON.stringify({paid:200000,issued_at:'2026-11-03'}));await saveQuote(f.api,{total:500000,input:quoteInput()});const e=(await read(f)).entries[0];assert.equal(e.request_id,'legacy-confirmation');await edit(f,e,{action:'void'});await issue(f);await saveQuote(f.api,{total:500000,input:quoteInput()});assert.equal((await read(f)).settlement.net,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n,1);
});
test('정정 전 견적은 보존하고 새 견적·고객 확정서는 새 수납액으로 발급',async t=>{
 const f=setup(t),e=await add(f,'receipt',800000),old=await saveQuote(f.api,{total:500000,input:quoteInput()});await edit(f,e,{amount:200000});const next=await saveQuote(f.api,{total:500000,input:quoteInput()});const quotes=(await f.api('inquiries/MS-TEST')).quotes;assert.equal(quotes.find(q=>q.quote_no===old.quote_no).data.settlement.net,800000);assert.equal(quotes.find(q=>q.quote_no===next.quote_no).data.settlement.net,200000);const issued=await issue(f);const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});const doc=(await response.json()).doc;assert.equal(doc.settlement.balance,300000);assert.equal(doc.paid,200000);assert.equal(issued.doc.settlement.net,200000);
});
test('동시에 같은 기록을 정정해도 한 요청만 성공',async t=>{
 const f=setup(t),e=await add(f,'receipt',200000),before=(await read(f)).settlement,run=f.env.DB.batch.bind(f.env.DB);let queue=Promise.resolve();f.env.DB.batch=ss=>{const p=queue.then(()=>run(ss));queue=p.catch(()=>{});return p;};const r=await Promise.allSettled([300000,400000].map(amount=>edit(f,e,{amount,expected_revision:before.revision})));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((await read(f)).history.length,1);assert([300000,400000].includes((await read(f)).settlement.net));
});
test('90건이 넘는 원본과 각 원본의 정정 내역도 다음 페이지에서 조회',async t=>{
 const f=setup(t);for(let i=0;i<95;i++)f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES('BK-TEST',?,'receipt',1000,'페이지 검증','2026-11-03')").run('page-entry-'+i);const first=await read(f);assert.equal(first.entries.length,90);assert.equal(first.has_more,true);const second=await f.api('bookings/BK-TEST/settlement?before='+first.next_before);assert.equal(second.entries.length,5);assert.equal(second.has_more,false);await edit(f,second.entries[0],{amount:2000});const page=await f.api('bookings/BK-TEST/settlement?before='+first.next_before);assert.equal(page.history.length,1);assert.equal(page.entries[0].amount,2000);
});
