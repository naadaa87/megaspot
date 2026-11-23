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
  assert.equal((await f.api('reservations?from='+DAY+'&to='+DAY)).items.find(x=>x.ref===inquiry.ref).kind,'pending');

  const first=await f.api('quotes','POST',{...preparedQuote(),food_inquiry_ref:inquiry.ref});
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
