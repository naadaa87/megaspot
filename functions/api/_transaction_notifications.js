import {contactPhones,bookingContacts} from './_contacts.js';
import {settlementRevisionSql} from './_settlement.js';
import {bookingPhone2Sql} from './_contacts.js';
import {journeyKind,journeyContext} from './_booking_journey.js';
import {approvedCustomerTemplate,customerFallback,customerFallbackResult,customerTemplateStatus} from './_customer_alimtalk.js';
import {err,json,now} from './_lib.js';
import {aligoProvider,guidePhone,guideDelivery} from './_guide_messages.js';

const RELAY='https://relay.naranhistory.com/megaspot/aligo';
const ADMIN_URL='https://megaspot.kr/admin/#transaction-notifications';
const HELP_URL='https://pf.kakao.com/_LnxbmX/chat';
const TITLES={
 booking_confirmed:'예약 확정 안내',balance_reminder:'이용료 잔금 안내',rental_paid:'이용료 납부 완료',booking_arrival:'방문 전 안내',
 inquiry:'문의 접수',reservation_request:'예약 신청 접수',payment_review:'결제 완료 · 예약 확정 보류',
 booking_cancelled:'공간 예약 취소',rental_refund:'이용료 환불 완료',parking_partial_refund:'주차권 부분 환불 완료'
};

function configured(env){
 return env.ALIGO_RELAY_URL===RELAY&&String(env.ALIGO_RELAY_SECRET||'').length>=32;
}

export function transactionMessage(row){
 const amount=row.amount==null?'':Number(row.amount).toLocaleString('ko-KR')+'원';
 const ref='번호: '+row.ref;
 let body;
 switch(row.kind){
  case 'inquiry':
  case 'reservation_request':
   body=row.audience==='admin'?'새 '+(row.kind==='inquiry'?'문의':'예약 신청')+'가 접수되었습니다. 내용을 확인해 주세요.':
    row.kind==='inquiry'?'문의가 접수되었습니다. 담당자가 내용을 확인한 후 안내드리겠습니다.':
    '예약 신청이 접수되었습니다. 일정 확인 후 안내드리며, 현재 예약 확정 전입니다.';
   break;
  case 'payment_review':
   body='결제 승인 금액: '+amount+'\n예약 확정은 일정 확인 후 진행됩니다.\n'+
    (row.audience==='admin'?'결제 건과 예약 일정을 확인해 주세요.':'담당자가 확인 후 안내드리겠습니다. 다시 결제하지 않으셔도 됩니다.');
   break;
  case 'booking_cancelled':
   body='공간 예약이 취소되었습니다. 이용료 환불이 진행되는 경우 완료 시 별도로 안내드립니다.';
   break;
  case 'rental_refund':
   body='이번 이용료 환불 금액: '+amount+'\n환불 처리가 완료되었습니다. 실제 입금이나 카드 한도 복원 시점은 결제수단에 따라 다를 수 있습니다.';
   break;
  case 'parking_partial_refund':
   body='이번 결제 부분 환불 금액: '+amount+'\n주차권 결제의 일부 금액이 환불되었습니다. 차량별 등록 상태는 구매 내역에서 확인해 주세요.';
   break;
  default: throw Error('지원하지 않는 알림 종류');
 }
 return '[메가스팟 '+TITLES[row.kind]+']\n'+ref+'\n'+body+'\n'+
  (row.audience==='admin'?ADMIN_URL:'문의: '+HELP_URL);
}

function state(env,id,status,error='',mid=null){
 return env.DB.prepare(`UPDATE transaction_notifications SET status=?,error=?,provider_mid=COALESCE(?,provider_mid),updated_at=?
   WHERE id=? AND status IN ('queued','sending','accepted')`).bind(status,error,mid,now(),id).run();
}

async function dispatch(env,row){
 if(row.audience==='customer'){
  let contacts=null;
  if(row.booking_code)contacts=await bookingContacts(env,row.booking_code);
  if(!contacts&&['inquiry','reservation_request'].includes(row.kind))contacts=await env.DB.prepare("SELECT phone,json_extract(data,'$.phone2') AS phone2 FROM inquiries WHERE ref=?").bind(row.ref).first();
  if(!contacts){const order=await env.DB.prepare('SELECT booking_code,buyer_phone FROM orders WHERE oid=?').bind(row.ref).first();if(order)contacts=order.booking_code?await bookingContacts(env,order.booking_code):{phone:order.buyer_phone};}
  if(contacts){
   if(guidePhone(row.receiver)===guidePhone(contacts.phone))for(const phone of contactPhones(contacts).filter(p=>p!==guidePhone(contacts.phone)))await env.DB.prepare(`INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,amount,occurred_at) VALUES(?,?,?,?,?,?,?,?)`).bind(row.event_key,row.kind,'customer',row.ref,row.booking_code,phone,row.amount,row.occurred_at).run();
   if(!contactPhones(contacts).includes(guidePhone(row.receiver)))return state(env,row.id,'cancelled','수신 연락처가 변경되었습니다.');
  }
 }
 const receiver=guidePhone(row.receiver);
 if(!receiver)return state(env,row.id,'failed',row.audience==='admin'?'관리자 문자 수신 번호를 확인해 주세요.':'문자 수신 가능한 휴대폰 번호를 확인해 주세요.');
 if(row.kind==='payment_review'){
  const pending=await env.DB.prepare(`SELECT 1 FROM orders o JOIN bookings b ON b.booking_code=o.booking_code
   WHERE o.oid=? AND o.status='paid' AND b.status='payment_review'`).bind(row.ref).first();
  if(!pending)return state(env,row.id,'cancelled','결제 또는 예약 검토 상태가 바뀌었습니다.');
 }
 if(row.kind==='booking_cancelled'){
  const booking=await env.DB.prepare(`SELECT status,phone,'cancel:'||booking_code||':'||COALESCE(
   (SELECT MAX(id) FROM booking_reconfirmations WHERE booking_code=b.booking_code),0) AS event_key
   FROM bookings b WHERE booking_code=?`).bind(row.booking_code).first();
  if(booking?.status!=='cancelled'||booking.event_key!==row.event_key||!contactPhones(await bookingContacts(env,row.booking_code)).includes(receiver))
   return state(env,row.id,'cancelled','예약 상태 또는 연락처가 바뀌었습니다.');
 }
 if(row.event_key.startsWith('manual-refund:')){
  const entry=await env.DB.prepare(`SELECT e.kind,e.amount,e.state,b.phone FROM booking_payment_current e
   JOIN bookings b ON b.booking_code=e.booking_code WHERE e.id=?`).bind(Number(row.event_key.slice('manual-refund:'.length))).first();
  if(entry?.kind!=='refund'||entry.state!=='active'||!contactPhones(await bookingContacts(env,row.booking_code)).includes(receiver))return state(env,row.id,'cancelled','환불 기록 또는 연락처가 바뀌었습니다.');
  row={...row,amount:entry.amount};
 }
 let journey=null;
 if(journeyKind(row.kind)){
  journey=await journeyContext(env,row);
  if(journey.cancel)return state(env,row.id,'cancelled',journey.cancel);
  if(journey.hold){await env.DB.prepare("UPDATE transaction_notifications SET error=?,updated_at=datetime('now') WHERE id=? AND status='queued'").bind(journey.hold,row.id).run();return;}
  if(row.kind!=='booking_confirmed'){const h=new Date(Date.now()+9*3600000).getUTCHours();if(h<9||h>=21)return;}
 }
 const provider=(path,data,id)=>aligoProvider(env,path,data,id);
 const template=row.audience==='customer'?await approvedCustomerTemplate(env,provider,row.kind):null;
 if(row.audience==='customer'&&!template){
  await env.DB.prepare("UPDATE transaction_notifications SET error=?,updated_at=datetime('now') WHERE id=? AND status='queued'")
   .bind('승인된 알림톡 본문·버튼 확인 대기',row.id).run();
  return;
 }
 const msg=journey?'':transactionMessage(row),requestId=crypto.randomUUID();
 const claim=await env.DB.prepare(`UPDATE transaction_notifications SET status='sending',request_id=?,amount=?,updated_at=?
  WHERE id=? AND status='queued'${journey?` AND EXISTS(SELECT 1 FROM bookings b JOIN booking_portal_links pl ON pl.booking_code=b.booking_code WHERE b.booking_code=? AND b.status='confirmed' AND b.phone IS ? AND (${bookingPhone2Sql()})=? AND ${settlementRevisionSql()}=? AND pl.token_hash=? AND pl.version=? AND pl.recipient_hash=? AND pl.expires_at>?)`:''}`).bind(requestId,row.amount,now(),row.id,...(journey?[row.booking_code,journey.b.phone,journey.b.phone2,journey.s.revision,journey.link.reference.token_hash,journey.link.reference.version,journey.link.reference.recipient_hash,Date.now()]:[])).run();
 if(!Number(claim.meta?.changes??claim.changes))return;
 try{
  if(template){
   const message=journey?journey.render(template):template.content.replace(/#\{번호\}/g,row.ref).replace(/#\{금액\}/g,Number(row.amount).toLocaleString('ko-KR'));
   const subject=TITLES[row.kind];
   const r=await provider('alimtalk/send',{tpl_code:template.code,receiver_1:receiver,subject_1:subject,message_1:message,
    ...(journey?{button_1:JSON.stringify({button:journey.buttons})}:{}),
    ...customerFallback(subject,journey?message:msg,journey?.buttons||[])},requestId);
   if(r?.code==null||!/^[-]?\d+$/.test(String(r.code)))return state(env,row.id,'unknown','알림톡 접수 결과 확인 필요');
   if(Number(r.code)!==0)return state(env,row.id,'failed','알리고 접수 거절 ('+Number(r.code)+')');
   if(!/^\d{1,30}$/.test(String(r.info?.mid||''))||Number(r.info?.scnt)!==1||Number(r.info?.fcnt||0)!==0)
    return state(env,row.id,'unknown','알림톡 접수 결과 확인 필요');
   return state(env,row.id,'accepted','','at:'+template.code+':'+r.info.mid);
  }
  const r=await provider('transaction/admin/send',{receiver,msg},requestId);
  if(r?.result_code==null||!/^[-]?\d+$/.test(String(r.result_code)))return state(env,row.id,'unknown','문자 접수 결과 확인 필요');
  if(Number(r.result_code)!==1)return state(env,row.id,'failed','알리고 접수 거절 ('+Number(r.result_code)+')');
  if(!/^\d{1,30}$/.test(String(r.msg_id||''))||Number(r.success_cnt)!==1||Number(r.error_cnt)!==0)return state(env,row.id,'unknown','문자 접수 결과 확인 필요');
  return state(env,row.id,'accepted','',String(r.msg_id));
 }catch(error){
  if([400,401,403].includes(error.status))return state(env,row.id,'failed','발송 서버가 요청을 거절했습니다 ('+error.status+').');
  return state(env,row.id,'unknown','발송 응답 불명 · 알리고에서 결과를 확인해 주세요.');
 }
}

async function reconcile(env,row){
 const at=/^at:([^:]+):(\d+)$/.exec(row.provider_mid);
 if(at){
  const provider=(path,data)=>aligoProvider(env,path,data);
  const result=await provider('history/detail',{mid:at[2],limit:'50'});
  if(Number(result.code)!==0)return;
  const match=phone=>guidePhone(phone)===guidePhone(row.receiver);
  const detail=(result.list||[]).find(item=>item.type==='AT'&&item.tpl_code===at[1]&&
   item.senderKey===env.ALIGO_SENDER_KEY&&match(item.phone));
  const status=guideDelivery(detail);
  if(status==='delivered')return state(env,row.id,'delivered');
  if(status==='accepted')return;
  const alternate=await customerFallbackResult(provider,detail,match,row.occurred_at);
  return state(env,row.id,alternate.status,alternate.note);
 }
 const r=await aligoProvider(env,'sms/detail',{mid:row.provider_mid,page_size:'50'});
 if(Number(r.result_code)!==1)return;
 const found=(r.list||[]).find(item=>guidePhone(item.receiver)===guidePhone(row.receiver));
 if(!found||!/^20\d{2}-\d{2}-\d{2} /.test(found.send_date||'')||/중|대기|예약|접수/.test(found.sms_state||''))return;
 const delivered=found.sms_state==='발송완료';
 await state(env,row.id,delivered?'delivered':'failed',delivered?'':'알리고 문자 전달 실패');
}

export async function transactionNoticeTick(env){
 if(!configured(env))return;
 await env.DB.prepare(`UPDATE transaction_notifications SET status='unknown',error='문자 처리 결과 확인 필요',updated_at=datetime('now')
  WHERE (status='sending' AND updated_at<datetime('now','-5 minutes'))
     OR (status='accepted' AND occurred_at<datetime('now','-2 days'))`).run();
 const {results:pending}=await env.DB.prepare(`SELECT * FROM transaction_notifications WHERE status='accepted'
  AND updated_at<datetime('now','-15 seconds') ORDER BY updated_at,id LIMIT 10`).all();
 await Promise.allSettled((pending||[]).map(async row=>{
  await env.DB.prepare(`UPDATE transaction_notifications SET updated_at=datetime('now')
    WHERE id=? AND status='accepted' AND updated_at=?`).bind(row.id,row.updated_at).run();
  await reconcile(env,row);
 }));
 if(env.ALIGO_LIVE_ENABLED!=='true')return;
 await env.DB.prepare(`UPDATE transaction_notifications SET status='cancelled',error='알림 유효기간 경과',updated_at=datetime('now')
  WHERE status='queued' AND occurred_at<datetime('now','-1 day') AND kind NOT IN ('booking_confirmed','rental_paid')`).run();
 const scheduleHour=new Date(Date.now()+9*3600000).getUTCHours();
 const {results:queued}=await env.DB.prepare("SELECT * FROM transaction_notifications WHERE status='queued' AND (kind NOT IN ('balance_reminder','rental_paid','booking_arrival') OR ?=1) ORDER BY CASE WHEN error LIKE '승인된 알림톡%' THEN 1 ELSE 0 END,updated_at,id LIMIT 12").bind(scheduleHour>=9&&scheduleHour<21?1:0).all();
 if(!queued?.length)return;
 const ready=await aligoProvider(env,'transaction/status');
 if(!ready?.ready)return;
 await Promise.allSettled(queued.map(row=>dispatch(env,row)));
}

export async function transactionNoticeStatus(env,{checkCustomerTemplates=false}={}){
 const schema=await env.DB.prepare(`SELECT COUNT(*) AS n FROM sqlite_master
  WHERE name='transaction_notifications' OR (type='trigger' AND name GLOB 'transaction_notify_*')`).first();
 const staff=await env.DB.prepare(`SELECT COUNT(DISTINCT j.value) AS n FROM settings s,json_each(s.value,'$.phones') j
  WHERE s.key='parking_admin_alerts'`).first();
 let relayReady=false;
 if(configured(env)){
  try{relayReady=(await aligoProvider(env,'transaction/status')).ready===true;}catch{}
 }
 const customer=checkCustomerTemplates?{customer_channel:'alimtalk',sms_fallback:true,
  templates:await customerTemplateStatus(env,(path,data)=>aligoProvider(env,path,data))}:{};
 const journey=await env.DB.prepare("SELECT json_extract(value,'$.enabled') AS enabled FROM settings WHERE key='booking_journey'").first();
 return json({ok:true,booking_journey_enabled:journey?.enabled===1,schema_ready:schema?.n===7,enabled:env.ALIGO_LIVE_ENABLED==='true'&&configured(env),
  relay_ready:relayReady,admin_recipients:staff?.n||0,...customer});
}

export async function transactionNoticeAdmin(env,request){
 if(request.method!=='GET')return err('조회 전용입니다.',405);
 const params=new URL(request.url).searchParams;
 const before=Number(params.get('before')||Number.MAX_SAFE_INTEGER);
 const filter=params.get('status')||'all';
 if(!Number.isSafeInteger(before)||before<1||!['all','pending','attention','delivered'].includes(filter))return err('조회 조건을 확인해 주세요.');
 const where={all:'1',pending:"status IN ('queued','sending','accepted')",attention:"status IN ('unknown','failed')",delivered:"status='delivered'"}[filter];
 const {results}=await env.DB.prepare(`SELECT id,kind,audience,ref,booking_code,amount,status,error,occurred_at,updated_at,
   CASE WHEN provider_mid LIKE 'at:%' THEN 'alimtalk' WHEN provider_mid IS NOT NULL THEN 'sms' END AS channel,
   CASE WHEN LENGTH(receiver)>=4 THEN substr(receiver,-4) ELSE '' END AS receiver_last4
   FROM transaction_notifications WHERE id<? AND ${where} ORDER BY id DESC LIMIT 51`).bind(before).all();
 const items=(results||[]).slice(0,50);
 return json({ok:true,enabled:env.ALIGO_LIVE_ENABLED==='true'&&configured(env),items,next_before:results?.length>50?items.at(-1).id:null});
}
