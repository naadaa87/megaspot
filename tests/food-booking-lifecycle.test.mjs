import assert from 'node:assert/strict';
import test from 'node:test';
import {DAY,fixture} from './helpers/admin-fixture.mjs';
import {quoteUi} from './helpers/admin-quote-fixture.mjs';
import {receptionAdmin} from '../functions/api/_reception.js';
import {onRequestGet as publicConfirmation} from '../functions/api/confirm.js';
import {onRequestGet as publicCalendar} from '../functions/api/reservation-calendar.js';
import {confirmToken} from '../functions/api/_confirm.js';
import {waitList} from '../functions/api/_reservation_waitlist.js';
import {spacecloudWorklist} from '../functions/api/_spacecloud_blocks.js';

const reception = receptionAdmin({course:'cf-manual',unit_price:20000,people:45,format:'box'});
const agentNote = '2026-11-23 · 계좌이체';
function preparedQuote(extra={}) {
  const ui = quoteUi();
  Object.assign(ui.ctx.Q,ui.ctx.blankQ(true),{
    customer:'외부 행사 담당자',phone:'010-4567-8901',date:DAY,location:'외부 행사장 3층',
    foodStartTime:'18:35',foodEndTime:'00:05',people:45,extras:[{kind:'reception',reception,amount:reception.total}],...extra,
  });
  ui.ctx.calc();
  return ui.ctx.payload();
}
async function payment(f,code,kind,amount,opts={}) {
  const endpoint='bookings/'+code+'/settlement';
  const state=await f.api(endpoint);
  return f.api(endpoint,'POST',{kind,amount,note:agentNote,expected_revision:state.settlement.revision,request_id:crypto.randomUUID(),...opts});
}
const body = response => response.json();
async function publicDoc(f,code) {
  return publicConfirmation({env:f.env,request:new Request('https://local.test/api/confirm?c='+code+'&k='+await confirmToken(f.env,code))});
}

test('external food-only quote becomes one inquiry and booking and uses the shared receipt and confirmation lifecycle', async t => {
  const f=fixture();
  t.after(()=>f.db.close());
  for(const [key,value] of [
    ['deposit_alimtalk',{enabled:true,types:{payment:true,account:true}}],
    ['reservation_guide',{enabled:true,automatic:true}],
    ['booking_journey',{enabled:true}],
  ]) f.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run(key,JSON.stringify(value),DAY);
  const original = await f.api('quotes','POST',preparedQuote());
  const quoteBefore=(await f.api('quotes')).items[0];
  const request={quote_no:original.quote_no,confirm:true,reservation_fee:200000,balance_due:DAY};
  const batch=f.env.DB.batch.bind(f.env.DB);
  let serial=Promise.resolve();
  f.env.DB.batch=statements=>{
    const next=serial.then(()=>batch(statements));
    serial=next.catch(()=>{});
    return next;
  };
  const [made,retry]=await Promise.all([f.api('food-inquiries','POST',request),f.api('food-inquiries','POST',request)]);
  assert.equal(retry.booking_code,made.booking_code);
  assert.equal(retry.ref,made.ref);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM bookings WHERE space_id='food-only'").get().n,1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM calendar_blocks").get().n,0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM booking_guide_events").get().n,0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM deposit_notifications").get().n,0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM transaction_notifications WHERE kind='booking_confirmed'").get().n,0);
  const code=made.booking_code,path='bookings/'+code;
  const detail=await f.api('inquiries/'+made.ref);
  assert.equal(detail.item.space_id,'food-only');
  assert.equal(detail.item.effective_amount,reception.total);
  assert.equal(detail.item.data.reception.status,'confirmed');
  assert.deepEqual(detail.quotes[0].data,quoteBefore.data);
  assert.equal((await f.api('quotes')).items[0].inquiry_ref,null);
  const list=await f.api('reservations?from='+DAY+'&to='+DAY);
  assert.equal(list.items.find(x=>x.code===code).food_event.start,'18:35');
  assert.equal((await f.api('bookings?space=megaspot-gundae')).items.length,0);
  assert.ok(!(await spacecloudWorklist(f.env,Date.now())).items.some(x=>x.code===code));
  const calendar=await publicCalendar({env:f.env,request:new Request('https://local.test/api/reservation-calendar?from='+DAY+'&to='+DAY)});
  assert.equal(calendar.status,200);
  assert.deepEqual((await body(calendar)).intervals,[]);
  assert.equal((await publicDoc(f,code)).status,404);

  const preview=await f.api(path+'/confirm-doc');
  assert.equal(preview.preview.space.name,'외부 행사장 3층');
  assert.equal(preview.preview.food_event.end,'00:05');
  assert.equal(preview.preview.food_event.reservation_fee,200000);
  assert.equal(preview.preview.food_event.balance_due,DAY);
  assert.equal(preview.preview.reception.total,reception.total);
  assert.equal(preview.preview.deposit,null);
  await f.api(path+'/confirm-doc','PUT',{doc:{show_amount:true,deposit:150000},conditions_revision:preview.conditions_revision,settlement_revision:preview.settlement.revision});
  const before=await f.api(path+'/settlement');
  assert.equal(before.deposit.amount,0);
  assert.equal(before.schedule.due_date,DAY);
  await payment(f,code,'receipt',200000);
  let booking=(await f.api('reservations?from='+DAY+'&to='+DAY)).items.find(x=>x.code===code);
  assert.equal(booking.payment_status,'reservation_paid');
  assert.equal(booking.settlement.balance,reception.total-200000);
  await payment(f,code,'receipt',reception.total-200000);
  booking=(await f.api('bookings')).items[0];
  assert.equal(booking.payment_status,'food_paid');
  assert.equal(booking.settlement.balance,0);
  const current=(await body(await publicDoc(f,code))).doc;
  assert.equal(current.settlement.net,reception.total);
  assert.equal(current.food_event.location,'외부 행사장 3층');
  assert.equal(current.food_event.start,'18:35');
  assert.equal(current.deposit,null);
  assert.deepEqual(current.items,[]);
  await payment(f,code,'refund',30000);
  assert.equal((await body(await publicDoc(f,code))).doc.settlement.balance,30000);

  const cancelled=await f.api(path+'/cancellation');
  await f.api(path+'/cancellation','POST',{mode:'manual',fee:100000,reason:'고객 합의',cancelled_at:new Date().toISOString(),
    request_id:crypto.randomUUID(),expected_version:cancelled.version,expected_revision:cancelled.settlement.revision});
  const cs=await f.api(path+'/cancellation');
  assert.equal(cs.settlement.refund_due,reception.total-130000);
  const reconfirmed=await f.api(path+'/reconfirm','POST',{request_id:crypto.randomUUID(),expected_revision:cs.settlement.revision});
  assert.equal(reconfirmed.booking_code,code);
  assert.equal(reconfirmed.settlement.balance,30000);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM calendar_blocks").get().n,0);
});

test('food inquiry does not enter venue waitlist and updates a booking through a newly applied quote',async t=>{
  const f=fixture({booking:true});
  t.after(()=>f.db.close());
  const intake={name:'외부 식음료 문의',phone:'010-1111-7890',date:DAY,location:'회의실',start:'10:05',end:'12:10',headcount:45,request_id:'external-food-intake'};
  const inquiry=await f.api('food-inquiries','POST',intake);
  assert.equal((await f.api('food-inquiries','POST',intake)).ref,inquiry.ref);
  assert.ok(!(await waitList(f.env,DAY,'megaspot-gundae')).includes(inquiry.ref));
  assert.ok((await f.api('inquiries?type=food-only')).items.every(x=>x.ref===inquiry.ref));
  const reservations='reservations?from='+DAY+'&to='+DAY;
  const candidate=(await f.api(reservations)).items.find(x=>x.ref===inquiry.ref);
  assert.equal(candidate.kind,'pending');
  assert.equal(candidate.food_quote_ready,false);

  const first=await f.api('quotes','POST',{...preparedQuote(),food_inquiry_ref:inquiry.ref});
  assert.equal((await f.api(reservations)).items.find(x=>x.ref===inquiry.ref).food_quote_ready,true);
  const initial=(await f.api('inquiries/'+inquiry.ref)).item.data.food_event;
  const booking=await f.api('food-inquiries/'+inquiry.ref,'PUT',{version:initial.version,quote_no:first.quote_no,confirm:true});
  await f.api('inquiries/'+inquiry.ref+'/confirm','POST',{date:DAY,start_h:10,end_h:17},409);
  const path='bookings/'+booking.booking_code,current=await f.api(path+'/confirm-doc');
  await f.api(path+'/confirm-doc','PUT',{doc:{show_amount:true},conditions_revision:current.conditions_revision});
  const item=(await f.api('inquiries/'+inquiry.ref)).item;
  assert.equal(item.data.food_event.start,'10:05');
  const second=await f.api('quotes','POST',{...preparedQuote({foodStartTime:'11:10',foodEndTime:'14:25'}),food_inquiry_ref:inquiry.ref});
  const newer={version:item.data.food_event.version,quote_no:second.quote_no,start:'11:10',end:'14:25'};
  await f.api('food-inquiries/'+inquiry.ref,'PUT',newer);
  await f.api('food-inquiries/'+inquiry.ref,'PUT',newer,409);
  assert.equal((await publicDoc(f,booking.booking_code)).status,404);
  const changed=await f.api(path+'/confirm-doc');
  assert.equal(changed.preview.food_event.start,'11:10');
  assert.equal(changed.preview.food_event.end,'14:25');
  assert.equal((await f.api('inquiries/'+inquiry.ref)).quotes.length,2);
  assert.equal((await f.api('bookings?space=megaspot-gundae')).items[0].booking_code,'BK-TEST');
});

test('records a food reservation deposit before confirmation and carries that single receipt into the booking', async t => {
  const f=fixture();
  t.after(()=>f.db.close());
  const {ref}=await f.api('food-inquiries','POST',{
    name:'식음료 고객',phone:'010-3333-4444',date:DAY,request_id:'food-before-confirm',reservation_fee:200000,
  });
  const endpoint='reservation-payment-checks/inquiry/'+ref;
  const incoming=await f.api(endpoint);
  assert.deepEqual(Object.keys(incoming.choices),['unpaid','reservation_paid','partial_paid']);
  const draft={status:'reservation_paid',expected_revision:incoming.payment_revision,
    expected_settlement_revision:incoming.settlement.revision,request_id:'deposit-before-confirm'};
  await f.api(endpoint,'PUT',{...draft,received_total:50000},400);
  const receipt=await f.api(endpoint,'PUT',{...draft,received_total:200000});
  assert.equal(receipt.receipt_added,200000);
  await f.api(endpoint,'PUT',{...draft,received_total:200000});
  const quote=await f.api('quotes','POST',{...preparedQuote(),food_inquiry_ref:ref});
  const saved=await f.api('food-inquiries/'+ref,'PUT',{version:1,quote_no:quote.quote_no,confirm:true});
  const settlement=await f.api('bookings/'+saved.booking_code+'/settlement');
  assert.equal(settlement.entries.length,1);
  assert.equal(settlement.settlement.net,200000);
  assert.equal(settlement.deposit.reservation_fee,200000);
  const booking=(await f.api('bookings')).items[0];
  assert.equal(booking.payment_status,'reservation_paid');
  assert.equal(booking.settlement.balance,reception.total-200000);
});

test('changing a confirmed food order preserves receipts and uses the new total through cancellation', async t => {
  const f=fixture();
  t.after(()=>f.db.close());
  const quoteFor=(course,people,format)=> {
    const reception=receptionAdmin({course,people,format});
    return preparedQuote({people,extras:[{kind:'reception',reception,amount:reception.total}]});
  };
  const original=await f.api('quotes','POST',quoteFor('cf-classic',45,'table'));
  const {ref,booking_code:code}=await f.api('food-inquiries','POST',{quote_no:original.quote_no,confirm:true,reservation_fee:1500000});
  const path='bookings/'+code;
  await payment(f,code,'receipt',1500000);
  const issued=(await body(await publicDoc(f,code))).doc;
  assert.equal(issued.amount,2007500);
  assert.equal(issued.settlement.balance,507500);

  async function apply(course,people,format,reservation_fee=1500000,status=200) {
    const quote=await f.api('quotes','POST',{...quoteFor(course,people,format),food_inquiry_ref:ref});
    const {item}=await f.api('inquiries/'+ref);
    return f.api('food-inquiries/'+ref,'PUT',{quote_no:quote.quote_no,version:item.data.food_event.version,headcount:people,reservation_fee},status);
  }
  const higher=await apply('cf-classic',55,'table');
  assert.equal(higher.booking_code,code);
  let detail=await f.api('inquiries/'+ref);
  assert.equal(detail.item.headcount,55);
  assert.equal(detail.item.effective_amount,2447500);
  assert.equal(detail.bookings[0].settlement.balance,947500);
  assert.equal(detail.bookings[0].food_needs_reissue,1);
  assert.equal((await publicDoc(f,code)).status,404);

  await apply('cf-light',30,'box',1510000,400);
  await apply('cf-light',30,'box');
  detail=await f.api('inquiries/'+ref);
  assert.equal(detail.item.data.food_event.reservation_fee,1500000);
  assert.equal(detail.item.effective_amount,858000);
  assert.equal(detail.item.headcount,30);
  assert.equal(detail.bookings[0].settlement.net,1500000);
  assert.equal(detail.bookings[0].settlement.balance,0);
  assert.equal(detail.bookings[0].settlement.refund_due,642000);
  const calendar=(await f.api('bookings?from='+DAY+'&to='+DAY)).items.find(x=>x.booking_code===code);
  assert.deepEqual(calendar.services,[{kind:'reception',status:'confirmed',course:'라이트',people:30}]);
  assert.equal(calendar.settlement.refund_due,642000);
  const preview=await f.api(path+'/confirm-doc');
  assert.equal(preview.needs_reissue,true);
  assert.equal(preview.preview.headcount,30);
  assert.equal(preview.preview.reception.format,'box');
  assert.equal(preview.preview.reception.fee,30000);
  assert.equal(preview.preview.reception.vat,78000);
  assert.equal(preview.preview.settlement.refund_due,642000);
  await f.api(path+'/confirm-doc','PUT',{doc:{...preview.doc},conditions_revision:preview.conditions_revision,settlement_revision:preview.settlement.revision});
  let doc=(await body(await publicDoc(f,code))).doc;
  assert.equal(doc.headcount,30);
  assert.equal(doc.reception.course,'cf-light');
  assert.equal(doc.amount,858000);
  assert.equal(doc.settlement.refund_due,642000);
  assert.equal(doc.issue_no,issued.issue_no+1);

  await payment(f,code,'refund',200000);
  // A cancellation before reissue still replaces the previously sent link with a settlement document.
  await apply('cf-light',28,'box');
  assert.equal((await publicDoc(f,code)).status,404);
  const cancel=await f.api(path+'/cancellation');
  await f.api(path+'/cancellation','POST',{mode:'manual',fee:100000,reason:'고객 합의',cancelled_at:new Date().toISOString(),
    request_id:crypto.randomUUID(),expected_version:cancel.version,expected_revision:cancel.settlement.revision});
  detail=await f.api('inquiries/'+ref);
  assert.equal(detail.item.status,'취소·환불');
  assert.equal(detail.bookings[0].settlement.received,1500000);
  assert.equal(detail.bookings[0].settlement.refunded,200000);
  assert.equal(detail.bookings[0].settlement.balance,0);
  assert.equal(detail.bookings[0].settlement.refund_due,1200000);
  const cancelled=(await f.api('bookings?from='+DAY+'&to='+DAY)).items.find(x=>x.booking_code===code);
  assert.equal(cancelled.status,'cancelled');
  assert.equal(cancelled.headcount,28);
  assert.equal(cancelled.settlement.refund_due,1200000);
  doc=(await body(await publicDoc(f,code))).doc;
  assert.equal(doc.doc_type,'cancellation');
  assert.equal(doc.status,'cancelled');
  assert.equal(doc.amount,100000);
  assert.equal(doc.settlement.refund_due,1200000);
  const ledger=await f.api(path+'/settlement');
  assert.equal(ledger.entries.length,2);
  const originalSnapshot=(await f.api('quotes')).items.find(x=>x.quote_no===original.quote_no);
  assert.equal(originalSnapshot.total,2007500);
  assert.equal(originalSnapshot.data.input.people,45);
});

test('archives food-only inquiries and inactive reservations with records intact and restores their previous status',async t=>{
  const f=fixture();
  t.after(()=>f.db.close());
  const range='from='+DAY+'&to='+DAY;
  const {ref:pending}=await f.api('food-inquiries','POST',{
    name:'삭제 테스트',phone:'010-0000-4321',date:DAY,request_id:'food-archive-pending',
  });
  await f.api('inquiries/'+pending,'DELETE');
  await f.api('inquiries/'+pending,'DELETE');
  assert.ok(!(await f.api('reservations?'+range)).items.some(x=>x.ref===pending));
  assert.ok((await f.api('inquiries?type=food-only&status=deleted')).items.some(x=>x.ref===pending));
  assert.equal((await f.api('inquiries/'+pending+'/restore','POST')).status,'문의 접수');
  assert.ok((await f.api('reservations?'+range)).items.some(x=>x.ref===pending));

  const quote=await f.api('quotes','POST',preparedQuote());
  const {ref,booking_code:code}=await f.api('food-inquiries','POST',{quote_no:quote.quote_no,confirm:true});
  const path='bookings/'+code;
  assert.equal((await f.api('inquiries/'+ref,'DELETE',undefined,409)).code,'HAS_BOOKING');
  await payment(f,code,'receipt',300000);
  await f.api(path,'PATCH',{status:'completed'});
  await f.api('inquiries/'+ref,'DELETE');
  assert.ok(!(await f.api('reservations?'+range)).items.some(x=>x.code===code));
  assert.ok(!(await f.api('bookings?'+range)).items.some(x=>x.booking_code===code));
  assert.equal((await f.api('inquiries/'+ref+'/restore','POST')).status,'이용 완료');

  const cancel=await f.api(path+'/cancellation');
  await f.api(path+'/cancellation','POST',{mode:'manual',fee:100000,reason:'고객 합의',cancelled_at:new Date().toISOString(),
    request_id:crypto.randomUUID(),expected_version:cancel.version,expected_revision:cancel.settlement.revision});
  await payment(f,code,'refund',200000);
  await f.api('inquiries/'+ref,'DELETE');
  const archived=await f.api('inquiries/'+ref);
  assert.equal(archived.item.status,'삭제됨');
  assert.equal(archived.quotes[0].quote_no,quote.quote_no);
  assert.equal(archived.bookings[0].status,'cancelled');
  assert.equal(archived.bookings[0].settlement.net,100000);
  assert.equal((await f.api(path+'/settlement')).entries.length,2);
  assert.ok(!(await f.api('bookings?'+range)).items.some(x=>x.booking_code===code));
  const report=await f.api('revenue?'+range);
  assert.equal(report.total.received,300000);
  assert.equal(report.total.refunded,200000);
  assert.equal((await body(await publicDoc(f,code))).doc.doc_type,'cancellation');
  await f.api(path+'/reconfirm','POST',{request_id:crypto.randomUUID(),expected_revision:archived.bookings[0].settlement.revision},409);
  assert.equal((await f.api('inquiries/'+ref+'/restore','POST')).status,'취소·환불');
  assert.ok((await f.api('bookings?'+range)).items.some(x=>x.booking_code===code&&x.status==='cancelled'));
});

test('can archive a paid pending inquiry and link an independently saved quote without creating a second inquiry or receipt',async t=>{
  const f=fixture();
  t.after(()=>f.db.close());
  const inquiry=await f.api('food-inquiries','POST',{
    name:'외부 행사 담당자',phone:'010-4567-8901',date:DAY,request_id:'food-link-target',reservation_fee:200000,
  });
  const ref=inquiry.ref, paymentPath='reservation-payment-checks/inquiry/'+ref, inquiryPath='inquiries/'+ref;
  const incoming=await f.api(paymentPath);
  await f.api(paymentPath,'PUT',{status:'reservation_paid',received_total:200000,
    expected_revision:incoming.payment_revision,expected_settlement_revision:incoming.settlement.revision,request_id:'food-link-receipt'});
  const range='from='+DAY+'&to='+DAY;
  assert.equal((await f.api('revenue?'+range)).total.received,200000);
  await f.api(inquiryPath,'DELETE');
  assert.equal((await f.api('revenue?'+range)).total.received,200000);
  assert.ok(!(await f.api('reservations?'+range)).items.some(x=>x.ref===ref));
  const archived=await f.api(inquiryPath);
  assert.equal(archived.inquiry_settlement.received,200000);
  assert.equal((await f.api(paymentPath)).editable,false);
  assert.equal((await f.api(paymentPath)).entries.length,1);
  await f.api(inquiryPath+'/purge','POST',undefined,409);
  await f.api(inquiryPath+'/restore','POST');

  const quote=await f.api('quotes','POST',preparedQuote());
  const candidates=await f.api('food-inquiries/targets?q=01045678901&date='+DAY);
  assert.deepEqual(candidates.items.map(item=>item.ref),[ref]);
  const duplicate=await f.api('food-inquiries','POST',{quote_no:quote.quote_no,confirm:true},409);
  assert.equal(duplicate.code,'FOOD_EXISTING_INQUIRY');
  assert.equal((await f.api('inquiries?type=food-only')).items.length,1);
  const current=(await f.api(inquiryPath)).item;
  const connected=await f.api('food-inquiries/'+ref,'PUT',{
    version:current.data.food_event.version,quote_no:quote.quote_no,confirm:true,
  });
  assert.equal(connected.ref,ref);
  assert.equal((await f.api('inquiries?type=food-only')).items.length,1);
  const settlement=await f.api('bookings/'+connected.booking_code+'/settlement');
  assert.equal(settlement.entries.length,1);
  assert.equal(settlement.settlement.net,200000);
  assert.equal(settlement.settlement.balance,reception.total-200000);
  assert.equal((await f.api('quotes')).items.find(item=>item.quote_no===quote.quote_no).food_inquiry_ref,ref);
  assert.equal((await f.api('food-inquiries','POST',{quote_no:quote.quote_no,confirm:true})).ref,ref);

  const separate=await f.api('quotes','POST',preparedQuote({foodStartTime:'09:00',foodEndTime:'12:00'}));
  const separateBooking=await f.api('food-inquiries','POST',{quote_no:separate.quote_no,confirm:true,allow_new:true});
  assert.notEqual(separateBooking.ref,ref);
  assert.equal((await f.api('bookings/'+separateBooking.booking_code+'/settlement')).settlement.net,0);
});

test('marks a recorded food deposit as paid without another receipt and refuses to mark a short deposit',async t=>{
  const f=fixture();
  t.after(()=>f.db.close());
  const quote=await f.api('quotes','POST',preparedQuote());
  const {ref,booking_code:code}=await f.api('food-inquiries','POST',{quote_no:quote.quote_no,confirm:true});
  await payment(f,code,'receipt',200000);
  const path='reservation-payment-checks/booking/'+code, bookings='bookings/'+code;
  async function mark(receivedTotal=200000,expectedStatus=200){
    const current=await f.api(path);
    return f.api(path,'PUT',{status:'reservation_paid',received_total:receivedTotal,expected_revision:current.payment_revision,
      expected_settlement_revision:current.settlement.revision,request_id:crypto.randomUUID()},expectedStatus);
  }
  assert.equal((await f.api(path)).payment_status,'partial_paid');
  assert.equal((await body(await publicDoc(f,code))).doc.food_event.reservation_paid,false);

  const saved=await mark();
  assert.equal(saved.receipt_added,0);
  assert.equal((await f.api(path)).payment_status,'reservation_paid');
  const list=(await f.api('reservations?from='+DAY+'&to='+DAY)).items.find(item=>item.code===code);
  assert.equal(list.payment_status,'reservation_paid');
  assert.equal(list.settlement.balance,reception.total-200000);
  assert.equal((await f.api(bookings+'/settlement')).entries.length,1);
  assert.equal((await f.api(bookings+'/confirm-doc')).preview.food_event.reservation_paid,true);
  assert.equal((await body(await publicDoc(f,code))).doc.food_event.reservation_paid,true);

  const {item}=await f.api('inquiries/'+ref);
  await f.api('food-inquiries/'+ref,'PUT',{version:item.data.food_event.version,reservation_fee:300000});
  assert.equal((await f.api(path)).payment_status,'partial_paid');
  assert.match((await mark(200000,400)).error,/300,000원/);
  assert.equal((await f.api(bookings+'/settlement')).entries.length,1);
  const newMoney=await mark(300000);
  assert.equal(newMoney.receipt_added,100000);
  assert.equal(newMoney.settlement.received,300000);
  assert.equal((await f.api(path)).payment_status,'reservation_paid');
  assert.equal((await f.api(bookings+'/settlement')).entries.length,2);
});

test('식음료 견적의 전체 취소와 일부 변경 조건을 보존하고 적용 견적의 합의 수수료로 정산한다',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const originalTerms={fee:100000,cancellation:'전체 취소 시 위 합의 수수료 적용',change:'인원 변경은 최종 메뉴 확정 전에 협의'};
 const first=preparedQuote({cancellationTerms:originalTerms});
 await f.api('quotes','POST',preparedQuote({cancellationTerms:{fee:-1}}),400);
 const {quote_no:quote}=await f.api('quotes','POST',first);
 const made=await f.api('food-inquiries','POST',{quote_no:quote,confirm:true});
 const path='bookings/'+made.booking_code;
 const nextTerms={...originalTerms,fee:150000,change:'변경 메뉴는 재견적 후 적용'};
 const next=await f.api('quotes','POST',preparedQuote({foodInquiryRef:made.ref,cancellationTerms:nextTerms}));
 let detail=await f.api('inquiries/'+made.ref);
 assert.deepEqual(detail.item.data.food_event.cancellation_terms,originalTerms);
 const docs=quoteUi();Object.assign(docs.ctx.Q,docs.ctx.blankQ(true),first.data.input);
 const quoteDocs=docs.documents();
 assert.match(quoteDocs.text,/전체 취소 시 위 합의 수수료 적용/);
 assert.match(quoteDocs.html,/인원 변경은 최종 메뉴 확정 전에 협의/);
 const preview=await f.api(path+'/confirm-doc');
 assert.deepEqual(preview.preview.food_event.cancellation_terms,originalTerms);
 await f.api(path+'/confirm-doc','PUT',{doc:{show_amount:false},conditions_revision:preview.conditions_revision,settlement_revision:preview.settlement.revision});
 assert.equal((await body(await publicDoc(f,made.booking_code))).doc.food_event.cancellation_terms,undefined);
 await payment(f,made.booking_code,'receipt',300000);
 await f.api('food-inquiries/'+made.ref,'PUT',{version:detail.item.data.food_event.version,quote_no:next.quote_no});
 detail=await f.api('inquiries/'+made.ref);
 assert.equal(detail.bookings[0].status,'confirmed');
 assert.equal(detail.bookings[0].settlement.received,300000);
 assert.deepEqual(detail.item.data.food_event.cancellation_terms,nextTerms);
 const cancel=await f.api(path+'/cancellation');
 assert.deepEqual(cancel.food_agreement,{...nextTerms,quote_no:next.quote_no});
 const request={mode:'agreement',reason:'변경 견적의 전체 취소 조건 합의',cancelled_at:new Date().toISOString(),request_id:crypto.randomUUID(),expected_version:cancel.version,expected_revision:cancel.settlement.revision};
 await f.api(path+'/cancellation','POST',{...request,expected_quote_no:quote},409);
 const saved=await f.api(path+'/cancellation','POST',{...request,expected_quote_no:next.quote_no});
 assert.equal(saved.settlement.cancellation.fee,150000);
 assert.equal(saved.settlement.refund_due,150000);
 assert.equal((await f.api(path+'/cancellation','POST',{...request,expected_quote_no:next.quote_no})).duplicate,true);
 assert.deepEqual(JSON.parse(f.db.prepare('SELECT data FROM quotes WHERE quote_no=?').get(quote).data).input.cancellationTerms,originalTerms);
});
