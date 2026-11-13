import {eventTime} from './_deposit_refunds.js';
import {noManualArrivalSql} from './_arrival_guard.js';
import {bookingPhone2Sql,contactPhones} from './_contacts.js';
import {now,SPACES} from './_lib.js';
import {prepareCombinedConfirmation,confirmationSourceSQL} from './_confirmation_auto.js';
import {settlementRevisionSql} from './_settlement.js';
import {settlementsFor,settlementFor} from './_settlement.js';
import {portalMessageLink} from './_booking_portal.js';
import {portalGuideMessage} from './_guide_portal.js';
import {paymentSchedule,dayAt,shiftDay} from './_booking_payment_schedule.js';
import {JOURNEY_TEMPLATES,journeyButtons} from './_booking_journey_templates.js';
export const journeyKind=kind=>Object.hasOwn(JOURNEY_TEMPLATES,kind);
export async function journeyEnabled(env){return (await env.DB.prepare("SELECT json_extract(value,'$.enabled') AS enabled FROM settings WHERE key='booking_journey'").first())?.enabled===1;}
const hour=h=>(h>=24?'다음날 ':'')+String(Math.floor(h%24)).padStart(2,'0')+':'+String(Math.round((h%1)*60)).padStart(2,'0');
export async function journeyContext(env,row,{preview=false}={}){
 if(!await journeyEnabled(env))return {hold:'예약 통합 알림 자동 발송 중지'};
 const b=await env.DB.prepare(`SELECT b.*,${bookingPhone2Sql()} AS phone2,s.amount_visible,s.confirmed_at,s.confirm_version FROM bookings b JOIN booking_journey_state s ON s.booking_code=b.booking_code WHERE b.booking_code=?`).bind(row.booking_code).first();
 const today=dayAt(Date.now());
 if(!b||b.status!=='confirmed'||b.date<today||!contactPhones(b).includes(String(row.receiver||'').replace(/\D/g,'')))return {cancel:'예약 상태 또는 연락처가 변경되었습니다.'};
 if(row.kind==='booking_confirmed'&&row.event_key!=='journey-confirm:'+b.booking_code+':'+b.confirm_version)return {cancel:'예약 확정 차수가 바뀌었습니다.'};
 const booking_revision=JSON.stringify([b.space_id,b.date,b.start_h,b.end_h,b.slot,b.customer_name]),range=eventTime(b);
 if(!SPACES[b.space_id]||!range)return {hold:'확정된 이용 시간을 확인해 주세요.'};
 if(range.end<=Date.now())return {cancel:'이용이 종료되어 예약 안내를 보내지 않습니다.'};
 [b.start_h,b.end_h]=range.hours;
 const s=await settlementFor(env,b.booking_code),schedule=await paymentSchedule(env,b);
 const hidden=b.amount_visible===0||(b.confirm_doc&&JSON.parse(b.confirm_doc).show_amount===false);
 if(['balance_reminder','rental_paid'].includes(row.kind)&&(hidden||s.amount==null))return {hold:'금액 공개 및 이용료 확정 확인 필요'};
 if(row.kind==='balance_reminder'&&(!(s.balance>0)||schedule.due_date<today||today<shiftDay(schedule.due_date,-1)||!row.event_key.endsWith(':'+schedule.due_date)))return {cancel:'잔금 또는 납부 기한이 변경되었습니다.'};
 if(row.kind==='rental_paid'&&(s.balance!==0||s.net<=0||s.over_refunded))return {cancel:'이용료 수납 상태가 변경되었습니다.'};
 if(row.kind==='booking_arrival'&&(b.date!==shiftDay(today,1)||b.confirmed_at?.slice(0,10)>=today||!row.event_key.endsWith(':'+b.date)))return {cancel:'방문 전날 안내 대상이 아닙니다.'};
 if(row.kind==='booking_arrival'&&!await env.DB.prepare(`SELECT 1 FROM bookings b WHERE booking_code=? AND ${noManualArrivalSql()}`).bind(b.booking_code,String(row.receiver).replace(/\D/g,'')).first())return {cancel:'현재 예약의 입실 안내가 수동 발송되어 자동 안내를 생략합니다.'};
 let link;try{link=await portalMessageLink(env,b.booking_code,{issue:true});}catch(error){link=await portalMessageLink(env,b.booking_code);if(!link)throw error;}
 if(!link)return {hold:'통합 링크를 준비하지 못했습니다.'};
 if(!preview&&row.kind==='booking_confirmed'&&!b.confirm_doc&&!s.legacy_pending){
  const deposit=await env.DB.prepare('SELECT amount FROM booking_refunds WHERE booking_code=?').bind(b.booking_code).first();
  const prepared=await prepareCombinedConfirmation(env,b.booking_code,s,0,deposit?.amount??150000,now());
  prepared.doc.show_amount=b.amount_visible!==0;
  await env.DB.prepare(`UPDATE bookings AS b SET confirm_doc=?,updated_at=? WHERE booking_code=? AND status='confirmed' AND confirm_doc IS NULL AND ${confirmationSourceSQL}=? AND ${settlementRevisionSql()}=?`).bind(JSON.stringify(prepared.doc),now(),b.booking_code,prepared.revision,s.revision).run();
 }
 const vars={고객명:String(b.customer_name||'').replace(/[\r\n]/g,' '),공간명:SPACES[b.space_id],예약번호:b.booking_code,이용일:b.date,이용시간:[b.start_h,b.end_h].map(hour).join('~'),잔금:Number(s.balance).toLocaleString('ko-KR'),수납액:Number(s.net).toLocaleString('ko-KR'),납부기한:schedule.due_date};
 const render=template=>row.kind==='booking_confirmed'?portalGuideMessage(b,[b.start_h,b.end_h]):template.content.replace(/#\{([^}]+)\}/g,(_,key)=>vars[key]);
 const buttonsFor=template=>journeyButtons(template,link.url),buttons=buttonsFor(JOURNEY_TEMPLATES[row.kind]);
 return {b,s,render,buttons,buttonsFor,link,booking_revision};
}
export async function bookingJourneyTick(env){
 if(!env.DB||!await journeyEnabled(env))return;
 const lease=Date.now()+110000;
 const claimed=await env.DB.prepare("INSERT INTO booking_guide_lease(name,until_at) VALUES('journey',?) ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE booking_guide_lease.until_at<?").bind(lease,Date.now()).run();
 if(!Number(claimed.meta?.changes??claimed.changes))return;
 try{
 await env.DB.prepare(`INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,amount,occurred_at) SELECT n.event_key,n.kind,'customer',n.ref,n.booking_code,${bookingPhone2Sql()},n.amount,n.occurred_at FROM transaction_notifications n JOIN bookings b ON b.booking_code=n.booking_code WHERE n.kind IN ('booking_confirmed','balance_reminder','rental_paid','booking_arrival') AND n.status='queued' AND b.status='confirmed' AND (${bookingPhone2Sql()})<>''`).run();
 const today=dayAt(Date.now()),hourKST=new Date(Date.now()+9*3600000).getUTCHours();
 const {results:rows}=await env.DB.prepare(`SELECT b.*,j.paid_state,j.paid_cycle,j.confirmed_at,j.confirm_version,(SELECT COUNT(*) FROM booking_payment_current e WHERE e.booking_code=b.booking_code AND e.state='active' AND e.kind='receipt')+(SELECT COUNT(*) FROM orders o WHERE o.booking_code=b.booking_code AND o.test=0 AND o.status IN ('paid','refunded')) AS receipt_count FROM bookings b JOIN booking_journey_state j ON j.booking_code=b.booking_code WHERE b.status='confirmed' AND b.date>=? ORDER BY j.checked_at,b.booking_code LIMIT 40`).bind(today).all();
 const settlements=await settlementsFor(env,(rows||[]).map(b=>b.booking_code));
 for(const b of rows||[]){
 const s=settlements[b.booking_code],full=s?.amount!=null&&s.balance===0&&s.net>0&&!s.over_refunded;
 const pendingConfirm=await env.DB.prepare("SELECT 1 FROM transaction_notifications WHERE booking_code=? AND kind='booking_confirmed' AND event_key=? AND status IN ('queued','sending','accepted')").bind(b.booking_code,'journey-confirm:'+b.booking_code+':'+b.confirm_version).first();
 // -1: partial payment observed; 0: no rental receipt; 1: fully paid.
 const partial=s?.amount!=null&&s.net>0&&s.balance>0;
 const wasPartial=b.paid_state===-1||b.receipt_count>1;
 const becameFull=full&&b.paid_state!==1;
 const updated=now();
 const update=env.DB.prepare('UPDATE booking_journey_state SET paid_state=?,paid_cycle=paid_cycle+?,checked_at=? WHERE booking_code=? AND paid_state=? AND paid_cycle=?').bind(full?1:partial?-1:0,becameFull?1:0,updated,b.booking_code,b.paid_state,b.paid_cycle);
 const statements=[update];
 if(becameFull&&wasPartial&&!pendingConfirm)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at) SELECT ?,'rental_paid','customer',?,?,?,? WHERE changes()>0`).bind('journey-paid:'+b.booking_code+':'+(b.paid_cycle+1),b.booking_code,b.booking_code,b.phone||'',updated));
 const changed=(await env.DB.batch(statements))[0];
 if(!Number(changed.meta?.changes??changed.changes))continue;
 const enqueue=async(kind,key)=>env.DB.prepare(`INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at) VALUES(?,?,'customer',?,?,?,?)`).bind(key,kind,b.booking_code,b.booking_code,b.phone||'',updated).run();
 if(hourKST<9||hourKST>=21)continue;
 const schedule=await paymentSchedule(env,b);
 if(s?.balance>0&&today>=shiftDay(schedule.due_date,-1)&&today<=schedule.due_date&&b.confirmed_at?.slice(0,10)<today)await enqueue('balance_reminder','journey-balance:'+b.booking_code+':'+b.confirm_version+':'+schedule.due_date);
 if(b.date===shiftDay(today,1)&&b.confirmed_at?.slice(0,10)<today)await enqueue('booking_arrival','journey-arrival:'+b.booking_code+':'+b.confirm_version+':'+b.date);
 }
 }finally{await env.DB.prepare("UPDATE booking_guide_lease SET until_at=? WHERE name='journey' AND until_at=?").bind(Date.now()+30000,lease).run();}
}
