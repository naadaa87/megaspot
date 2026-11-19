import {bookingPhone2Sql,contactPhones,mobilePhone} from './_contacts.js';
import {eventTime} from './_deposit_refunds.js';
import {dayAt,paymentSchedule} from './_booking_payment_schedule.js';
import {settlementsFor} from './_settlement.js';
import {err,json,now,SPACES} from './_lib.js';

export const overdueBalancePrefix='overdue-balance:';
export const overdueBalanceEvent=(b,today,due)=>[overdueBalancePrefix.slice(0,-1),b.booking_code,b.confirm_version,today,due].join(':');
const blockingStatuses=new Set(['queued','sending','accepted','delivered','unknown','review']);

export async function overdueBalanceOperation(env,d){
 const today=dayAt(Date.now()),hour=new Date(Date.now()+9*3600000).getUTCHours();
 if(d.date!==today||hour<9||hour>=12)return err('지정한 한국시간 오전에만 미납 안내를 요청할 수 있습니다.',409);
 if(env.ALIGO_LIVE_ENABLED!=='true'||(await env.DB.prepare("SELECT json_extract(value,'$.enabled') AS enabled FROM settings WHERE key='booking_journey'").first())?.enabled!==1)return err('운영 고객 안내 연결을 확인해 주세요.',409);
 const send=d.action==='queue_overdue_balance';
 if(send&&(d.confirm_send!==true||!Array.isArray(d.codes)||!d.codes.length||d.codes.length>30||d.codes.some(code=>!/^[A-Z0-9-]{1,40}$/.test(code))))return err('발송을 확인한 예약번호 목록이 필요합니다.');
 const selected=send?[...new Set(d.codes)]:[];
 const {results:bookings}=await env.DB.prepare(`SELECT b.*, ${bookingPhone2Sql()} AS phone2,j.confirm_version,j.confirmed_at,j.amount_visible
  FROM bookings b JOIN booking_journey_state j ON j.booking_code=b.booking_code
  WHERE b.status='confirmed' AND b.date>=? AND b.booking_code NOT LIKE 'TEST-%'
  ${send?'AND b.booking_code IN ('+selected.map(()=>'?').join(',')+')':''} ORDER BY b.date,b.booking_code`).bind(today,...selected).all();
 const settlements=await settlementsFor(env,bookings.map(b=>b.booking_code)),items=[];
 for(const b of bookings){
  if(!Object.hasOwn(SPACES,b.space_id)||!(eventTime(b)?.end>Date.now())||b.amount_visible===0)continue;
  let doc;try{doc=JSON.parse(b.confirm_doc||'{}');}catch{continue;}
  if(doc?.show_amount===false)continue;
  const s=settlements[b.booking_code];
  if(s?.amount==null||!(s.balance>0))continue;
  const schedule=await paymentSchedule(env,b);
  if(schedule.due_date>=today)continue;
  const {results:history}=await env.DB.prepare("SELECT receiver,status FROM transaction_notifications WHERE booking_code=? AND kind='balance_reminder' AND audience='customer'").bind(b.booking_code).all();
  const recipients=contactPhones(b).filter(phone=>!history.some(r=>mobilePhone(r.receiver)===phone&&blockingStatuses.has(r.status)));
  if(!recipients.length)continue;
  const id=overdueBalanceEvent(b,today,schedule.due_date);
  let queued=0;
  if(send){
   for(const phone of recipients){
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,amount,occurred_at)
     SELECT ?,'balance_reminder','customer',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM transaction_notifications WHERE booking_code=?
     AND kind='balance_reminder' AND audience='customer' AND replace(receiver,'-','')=? AND status IN ('queued','sending','accepted','delivered','unknown','review'))`).bind(id,b.booking_code,b.booking_code,phone,s.balance,now(),b.booking_code,phone).run();
    queued+=Number(result.meta?.changes??result.changes??0);
   }
  }
  items.push({code:b.booking_code,name:b.customer_name,date:b.date,due_date:schedule.due_date,balance:s.balance,recipients:recipients.length,...(send?{queued}:{})});
 }
 return json({ok:true,items});
}
