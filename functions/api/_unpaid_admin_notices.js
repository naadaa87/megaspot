import {mobilePhone} from './_contacts.js';
import {refundBooking,initialDepositAmount} from './_deposit_refunds.js';
import {SPACES,now} from './_lib.js';
import {dayAt,paymentSchedule,shiftDay} from './_booking_payment_schedule.js';
import {settlementFor} from './_settlement.js';

export const unpaidAdminTitles={
 balance_overdue_admin:'잔금 미납 확인',
 deposit_unpaid_admin:'보증금 미납 확인'
};

export async function unpaidAdminPhones(env){
 const {results}=await env.DB.prepare(`SELECT j.value AS phone FROM settings s,
  json_each(CASE WHEN json_valid(s.value) THEN s.value ELSE '{}' END,'$.phones') j
  WHERE s.key='parking_admin_alerts'`).all();
 return [...new Set((results||[]).map(row=>mobilePhone(row.phone)).filter(Boolean))];
}

async function depositAmountUnpaid(env,code){
 const b=await refundBooking(env,code);
 if(!b||b.status!=='confirmed'||Number(b.deposit_paid)!==0)return 0;
 return b.deposit_amount??initialDepositAmount(b);
}

export async function unpaidAdminCandidates(env,b,settlement,schedule,today){
 if(b.status!=='confirmed'||!SPACES[b.space_id]||b.date<today)return [];
 const result=[];
 if(settlement?.amount!=null&&settlement.balance>0&&schedule.due_date===shiftDay(today,-1)){
  result.push({kind:'balance_overdue_admin',basis:schedule.due_date,amount:settlement.balance});
 }
 if(b.date===shiftDay(today,1)){
  const amount=await depositAmountUnpaid(env,b.booking_code);
  if(amount>0)result.push({kind:'deposit_unpaid_admin',basis:b.date,amount});
 }
 return result;
}

const eventKey=(b,notice)=>[notice.kind,b.booking_code,b.confirm_version,notice.basis].join(':');

export async function queueUnpaidAdminNotices(env,b,settlement,schedule,today,phones){
 if(!phones.length)return;
 for(const notice of await unpaidAdminCandidates(env,b,settlement,schedule,today)){
  for(const phone of phones){
   await env.DB.prepare(`INSERT OR IGNORE INTO transaction_notifications
    (event_key,kind,audience,ref,booking_code,receiver,amount,occurred_at)
    VALUES(?,?,'admin',?,?,?,?,?)`).bind(eventKey(b,notice),notice.kind,b.booking_code,b.booking_code,phone,notice.amount,now()).run();
  }
 }
}

export async function currentUnpaidAdminNotice(env,row,receiver){
 const b=await env.DB.prepare(`SELECT b.*,j.confirm_version,j.confirmed_at FROM bookings b
  JOIN booking_journey_state j ON j.booking_code=b.booking_code WHERE b.booking_code=?`).bind(row.booking_code).first();
 if(!b||row.audience!=='admin'||!(await unpaidAdminPhones(env)).includes(receiver))return null;
 const today=dayAt(Date.now());
 const settlement=row.kind==='balance_overdue_admin'?await settlementFor(env,b.booking_code):null;
 const schedule=settlement?await paymentSchedule(env,b):null;
 const notices=await unpaidAdminCandidates(env,b,settlement,schedule,today);
 const notice=notices.find(x=>x.kind===row.kind&&eventKey(b,x)===row.event_key);
 return notice?{...notice,visit_date:b.date}:null;
}

export function unpaidAdminTrial(row){
 return row.booking_code==null&&row.audience==='admin'&&/^TEST-UNPAID-[A-F0-9]{32}$/.test(row.ref||'')
  &&row.event_key==='operator-test:'+row.ref+':'+row.kind&&Object.hasOwn(unpaidAdminTitles,row.kind);
}
