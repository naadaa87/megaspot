import {depositDueDate,depositPaymentWindow,depositConfirmedSql,depositDueSql} from './_deposit_due.js';
import {contactPhones,bookingPhone2Sql} from './_contacts.js';
import {customerFallback,customerFallbackResult} from './_customer_alimtalk.js';
// Information-only notices. DB triggers create an outbox in the booking transaction.
import {json,err,now,str,readJson,sha256,SPACES,log} from './_lib.js';
import {aligoProvider,guidePhone,guideDelivery} from './_guide_messages.js';
import {DEPOSIT_TEMPLATES as T,DEPOSIT_TEMPLATE_CODES as C} from './_deposit_templates.js';
import {refundAdmin,keyReady,eventTime,refundDate} from './_deposit_refunds.js';
import {parkingSign} from './_parking_notifications.js';
import {equalSecret} from './_payapp.js';
import {accountReminderAdmin} from './_deposit_reminders.js';
const KEY='deposit_alimtalk',parse=s=>{try{return JSON.parse(s||'{}')||{};}catch{return {};}};
const changes=r=>Number(r?.meta?.changes??r?.changes??0),normalize=s=>String(s||'').replace(/\r\n/g,'\n');
const kinds=Object.keys(T),format=n=>Number(n||0).toLocaleString('ko-KR');
const clean=s=>String(s||'').replace(/[\r\n\t]/g,' ').trim();
const utc=s=>Date.parse(String(s||'').replace(' ','T')+'Z');
export async function depositMessageConfig(env){const s=parse((await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(KEY).first())?.value);return {enabled:s.enabled===true,types:Object.fromEntries(kinds.map(k=>[k,s.types?.[k]!==false])),codes:Object.fromEntries(kinds.map(k=>[k,str(s.codes?.[k]??C[k],60)])),hash:s.hash||''};}
const configured=env=>env.ALIGO_RELAY_URL==='https://relay.naranhistory.com/megaspot/aligo'&&String(env.ALIGO_RELAY_SECRET||'').length>=32&&!!env.ALIGO_SENDER_KEY&&!!env.ALIGO_SENDER&&keyReady(env);
export async function depositMessageHash(env,s){return sha256(JSON.stringify([T,s.codes,env.ALIGO_RELAY_URL||'',env.ALIGO_RELAY_SECRET||'',env.ALIGO_SENDER_KEY||'',env.ALIGO_SENDER||'',await sha256(env.DEPOSIT_ACCOUNT_KEY||'')]));}
export function depositTemplateMatches(kind,t){if(!Object.hasOwn(T,kind)||!t)return false;const want=T[kind].buttons,bs=t.buttons||[];return normalize(t.templtContent)===T[kind].content&&bs.length===want.length&&want.every((b,i)=>bs[i].name===b.name&&bs[i].linkType==='WL'&&(bs[i].linkMo||bs[i].linkM)===b.linkMo&&(bs[i].linkPc||bs[i].linkP)===b.linkPc);}
async function template(env,s,kind){if(!configured(env)||!s.codes[kind])throw Error('서버 연결과 템플릿 코드를 먼저 확인해 주세요.');const r=await aligoProvider(env,'template/list',{senderkey:env.ALIGO_SENDER_KEY,tpl_code:s.codes[kind]});if(Number(r.code)!==0)throw Error('템플릿 조회 결과를 확인해 주세요.');return (r.list||[]).find(t=>t.templtCode===s.codes[kind]);}
const usable=(kind,t)=>t?.inspStatus==='APR'&&['A','R'].includes(t.status)&&depositTemplateMatches(kind,t);
async function approvals(env,s){const out=[];for(const kind of kinds){try{const t=await template(env,s,kind);out.push({kind,name:T[kind].name,code:s.codes[kind],review:t?.inspStatus||'missing',matches:depositTemplateMatches(kind,t),ready:usable(kind,t)});}catch{out.push({kind,name:T[kind].name,code:s.codes[kind],review:'unavailable',matches:false,ready:false});}}return out;}
async function tested(env,kind,hash){return !!await env.DB.prepare("SELECT id FROM deposit_notifications WHERE mode='test' AND kind=? AND status='delivered' AND config_hash=? LIMIT 1").bind(kind,hash).first();}
const BOOKING_SELECT=`SELECT b.*,${depositConfirmedSql()} AS confirmed_day,${bookingPhone2Sql()} AS phone2,r.state AS refund_state,r.account_cipher,r.purged_at,r.completion_id,r.paid_amount,r.deduction,r.completed_at,r.account_version,
 COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000) AS deposit_amount,
 CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE(json_extract(ic.checks,'$.guarantee_paid'),0) ELSE COALESCE(dc.paid,0) END AS deposit_paid,
 COALESCE(json_extract(ic.checks,'$.guarantee_returned'),0) AS returned
 FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code LEFT JOIN inquiry_checks ic ON ic.ref=b.inquiry_ref LEFT JOIN booking_deposit_checks dc ON dc.booking_code=b.booking_code`;
async function booking(env,code){return env.DB.prepare(BOOKING_SELECT+' WHERE b.booking_code=?').bind(code).first();}
async function bookings(env,codes){const out=[];for(let i=0;i<codes.length;i+=80){const group=codes.slice(i,i+80);const r=await env.DB.prepare(BOOKING_SELECT+' WHERE b.booking_code IN ('+group.map(()=>'?').join(',')+')').bind(...group).all();out.push(...r.results||[]);}return out;}
export function noticeObsolete(b,e,at=Date.now(),scheduledPayment=false){
 if(!b||!Object.hasOwn(SPACES,b.space_id))return '예약 정보를 확인해 주세요.';
 const p=parse(e.payload),end=eventTime(b);
 if(p.delivery_phone&&!contactPhones(b).includes(p.delivery_phone))return '수신 연락처가 변경되었습니다.';
 if(clean(p.name)!==clean(b.customer_name)||guidePhone(p.phone)!==guidePhone(b.phone)||p.date!==b.date||p.space!==b.space_id)return '예약자·연락처·이용일·호점이 변경되었습니다.';
 if(!Number.isFinite(utc(e.occurred_at))||(!scheduledPayment&&at-utc(e.occurred_at)>7*864e5))return '안내 발생 후 7일이 지나 자동 발송하지 않습니다.';
 if(e.kind==='refunded')return b.refund_state!=='completed'||!p.completion||p.completion!==b.completion_id||p.refund!==b.paid_amount||p.deduction!==(b.deduction||0)?'환급 완료 내역이 변경되었습니다.':'';
 if(!['confirmed','completed'].includes(b.status)||!end)return '취소되었거나 이용 시간이 확인되지 않은 예약입니다.';
 if(p.start!==b.start_h||p.end!==b.end_h||p.slot!==b.slot)return '예약 이용 시간이 변경되었습니다.';
 if(Number(p.amount)!==Number(b.deposit_amount)||b.deposit_amount<=0)return '보증금액이 변경되었거나 보증금이 없는 예약입니다.';
 if(b.returned||b.refund_state==='completed')return '보증금 반환이 완료되었습니다.';
 if(e.kind==='payment'){if(b.deposit_paid)return '이미 보증금 입금이 확인되었습니다.';if(end.end<=at)return '이용이 종료되어 입금 안내를 보내지 않습니다.';}
 if(e.kind==='account'){if(!b.deposit_paid)return '보증금 입금 확인이 취소되었습니다.';if(b.account_cipher)return '환급 계좌가 이미 등록되었습니다.';if(['processing','hold'].includes(b.refund_state)||b.purged_at)return '계좌 등록을 받을 수 없는 처리 상태입니다.';if(end.end+90*864e5<=at)return '계좌 등록 안내 유효기간이 지났습니다.';}
 if(!scheduledPayment&&at-utc(e.occurred_at)>7*864e5)return '안내 발생 후 7일이 지나 자동 발송하지 않습니다.';
 return '';
}
export function depositNoticeVariables(b,e,token=''){
 const p=parse(e.payload),occurred=new Date(utc(e.occurred_at)+9*36e5).toISOString().slice(0,10),due=depositDueDate(b)||occurred;
 return {고객명:clean(b.customer_name),공간명:SPACES[b.space_id],이용일:b.date,보증금액:format(p.amount??b.deposit_amount),입금기한:due,환급예정일:refundDate(b)||'관리자 확인 후 안내',등록코드:token,차감액:format(p.deduction??b.deduction),환급금액:format(p.refund??b.paid_amount),처리일:p.completed_at?new Date(utc(p.completed_at)+9*36e5).toISOString().slice(0,10):occurred};
}
export function depositNoticeRender(text,vars){return text.replace(/#\{([^}]+)\}/g,(_,k)=>{if(vars[k]==null)throw Error('안내 변수 누락');return String(vars[k]);});}
async function changedNoticeReview(env,e,s){
 const b=await booking(env,e.booking_code);if(!b)return {blocked:'예약을 찾을 수 없습니다.'};
 const payload={...parse(e.payload),name:b.customer_name,phone:b.phone,date:b.date,space:b.space_id,start:b.start_h,end:b.end_h,slot:b.slot,amount:b.deposit_amount};
 const next={...e,payload:JSON.stringify(payload),occurred_at:now()},blocked=noticeObsolete(b,next);
 const vars=depositNoticeVariables(b,next,'전용 링크는 발송 시 생성'),message=depositNoticeRender(T[e.kind].content,vars);
 const hash=await sha256(JSON.stringify([e.id,payload,message,blocked,await depositMessageHash(env,s),b.account_version,b.refund_state,b.deposit_paid]));
 return {name:b.customer_name,phone:guidePhone(payload.delivery_phone||b.phone),date:b.date,message,hash,blocked,payload};
}
async function state(env,id,status,error='',mid=null){await env.DB.prepare('UPDATE deposit_notifications SET status=?,error=?,provider_mid=COALESCE(?,provider_mid),updated_at=? WHERE id=?').bind(status,str(error,300),mid,now(),id).run();}
async function accountToken(env,code){
 // Reuse the same invitation issuer as the admin. Never persist the rendered link in outbox/history.
 const url=new URL('https://megaspot.kr/api/admin/deposit-refunds/bookings/'+code+'/link');
 const r=await refundAdmin({env,url,path:'deposit-refunds/bookings/'+code+'/link',method:'POST',request:new Request(url,{method:'POST',body:'{}'})});
 const j=await r.json();if(!r.ok||!j.url)throw Error('계좌 등록 링크를 준비하지 못했습니다.');return j.url.split('#refund-account=')[1];
}
// A guarantee check saved in the same confirmation action is covered by the unified link.
const initialConfirmationSql=(alias='n',states="('queued','sending','accepted','unknown','delivered')")=>`SELECT tn.status FROM transaction_notifications tn JOIN booking_journey_state js ON js.booking_code=tn.booking_code WHERE tn.booking_code=${alias}.booking_code AND tn.kind='booking_confirmed' AND tn.event_key='journey-confirm:'||tn.booking_code||':'||js.confirm_version AND js.confirm_version>0 AND tn.status IN ${states} AND abs((julianday(js.confirmed_at)-julianday(${alias}.occurred_at,'+9 hours'))*86400)<=120 LIMIT 1`;
async function dispatch(env,e){
 const s=await depositMessageConfig(env),hash=await depositMessageHash(env,s);let b;
 const scheduled=e.mode==='live'&&e.kind==='payment'&&(await env.DB.prepare("SELECT json_extract(value,'$.enabled') AS enabled FROM settings WHERE key='booking_journey'").first())?.enabled===1;
 if(e.mode==='test')b={booking_code:'TEST',customer_name:'운영자 시험',phone:parse(e.payload).test_phone,space_id:'megaspot-gundae',date:'2099-01-05',start_h:10,end_h:17,deposit_amount:150000,paid_amount:150000,deduction:0};
 else {b=await booking(env,e.booking_code);const reason=noticeObsolete(b,e,Date.now(),scheduled);if(reason)return state(env,e.id,'cancelled',reason);if(env.ALIGO_LIVE_ENABLED!=='true'||!s.enabled||!s.types[e.kind]||s.hash!==hash||!await tested(env,e.kind,hash))return;}
 if(scheduled&&!depositPaymentWindow(b))return;
 if(e.mode==='live'&&e.kind==='account'&&e.event_key===e.booking_code+':account'&&(await env.DB.prepare("SELECT json_extract(value,'$.enabled') AS enabled FROM settings WHERE key='booking_journey'").first())?.enabled===1){const initial=await env.DB.prepare(`SELECT (${initialConfirmationSql()}) AS status FROM deposit_notifications n WHERE n.id=?`).bind(e.id).first();if(initial?.status){if(['accepted','delivered'].includes(initial.status))return state(env,e.id,'cancelled','확정 통합 안내에 환급 계좌 등록 링크를 함께 제공했습니다.');return;}}

 if(e.mode==='live'&&!parse(e.payload).delivery_phone){for(const phone of contactPhones(b).filter(p=>p!==guidePhone(b.phone)))await env.DB.prepare("INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode) VALUES(?,?,?,?,?,'live')").bind(e.booking_code,e.kind,e.event_key+':to:'+phone,e.occurred_at,JSON.stringify({...parse(e.payload),delivery_phone:phone})).run();}
 const receiver=guidePhone(parse(e.payload).delivery_phone||b.phone);if(!receiver)return state(env,e.id,'failed','알림톡 수신 가능한 휴대폰 번호를 확인해 주세요.');
 const t=await template(env,s,e.kind);if(!usable(e.kind,t)){await env.DB.prepare('UPDATE deposit_notifications SET error=? WHERE id=? AND status=\'queued\'').bind('승인·본문·버튼 확인 대기',e.id).run();return;}
 // A new configuration must be confirmed again immediately before any external delivery.
 const fresh=await depositMessageConfig(env);if(JSON.stringify(fresh)!==JSON.stringify(s))return;
 const id=crypto.randomUUID(),r=await env.DB.prepare("UPDATE deposit_notifications SET status='sending',request_id=?,phone_hash=?,config_hash=?,updated_at=? WHERE id=? AND status='queued'").bind(id,await sha256(receiver),hash,now(),e.id).run();if(!changes(r))return;
 let token='';try{if(e.kind==='account')token=e.mode==='test'?'DEMO':await accountToken(env,e.booking_code);}catch{return state(env,e.id,'failed','계좌 등록 링크 발급 실패 · 관리자 확인 필요');}
 // Recheck the booking after issuing the link and taking the sending lock.
 if(e.mode==='live'){const latest=await booking(env,e.booking_code),reason=noticeObsolete(latest,e,Date.now(),scheduled);if(reason)return state(env,e.id,'cancelled',reason);b=latest;if(scheduled&&!depositPaymentWindow(b))return state(env,e.id,'cancelled','보증금 안내 발송 시점 또는 납부 기한이 변경되었습니다.');const latestSettings=await depositMessageConfig(env);if(!latestSettings.enabled||!latestSettings.types[e.kind]||latestSettings.hash!==hash||env.ALIGO_LIVE_ENABLED!=='true')return state(env,e.id,'cancelled','고객 발송 중지·설정 변경');}
 if(e.kind==='account'&&e.mode==='live'&&e.event_key.startsWith('account-reminder:')){const other=await env.DB.prepare("SELECT id FROM deposit_notifications WHERE booking_code=? AND mode='live' AND kind='account' AND id<>? AND COALESCE(json_extract(payload,'$.delivery_phone'),json_extract(payload,'$.phone'))=? AND (status IN ('queued','sending','accepted','unknown','review') OR (status='delivered' AND updated_at>?)) LIMIT 1").bind(e.booking_code,e.id,parse(e.payload).delivery_phone||parse(e.payload).phone,new Date(Date.now()-3600000).toISOString().slice(0,19).replace('T',' ')).first();if(other)return state(env,e.id,'cancelled','다른 계좌 안내가 처리 중이거나 최근 수신 완료되었습니다.');}
 const fallback=e.mode==='live';
 const vars=depositNoticeVariables(b,e,token),message=depositNoticeRender(t.templtContent,vars),buttons=T[e.kind].buttons.map(b=>({name:b.name,linkType:'WL',linkMo:depositNoticeRender(b.linkMo,vars),linkPc:depositNoticeRender(b.linkPc,vars)}));
 try{
  const response=await aligoProvider(env,'alimtalk/send',{senderkey:env.ALIGO_SENDER_KEY,tpl_code:s.codes[e.kind],sender:env.ALIGO_SENDER,receiver_1:receiver,recvname_1:clean(b.customer_name),subject_1:'메가스팟 보증금 안내',message_1:message,...(buttons.length?{button_1:JSON.stringify({button:buttons})}:{}),failover:'N',testMode:'N',...(fallback?customerFallback('메가스팟 보증금 안내',message,buttons):{})},id);
  if(!response||!/^[-]?\d+$/.test(String(response.code)))return state(env,e.id,'unknown','접수 응답 확인 필요 · 자동 재발송 중지');
  if(Number(response.code)!==0)return state(env,e.id,'failed','알리고 접수 거절 '+str(response.code,20));
  if(!response.info?.mid||Number(response.info.scnt)!==1||Number(response.info.fcnt||0)>0)return state(env,e.id,'unknown','접수 건수 확인 필요');
  await state(env,e.id,'accepted','',(fallback?'fallback:':'')+response.info.mid);
 }catch{await state(env,e.id,'unknown','접수 결과 불명 · 알리고 확인 전 재발송하지 마세요.');}
}
async function refresh(env,e){
 if(!['accepted','unknown'].includes(e.status))return {checked:false,reason:'예약 변경 건은 보증금 안내 내역에서 내용을 확인해 주세요.'};
 const s=await depositMessageConfig(env);
 if(!e.provider_mid)return {checked:false,reason:'접수번호가 없어 자동 조회할 수 없습니다. 알리고 발송 내역을 직접 확인해 주세요.'};
 if(e.config_hash!==await depositMessageHash(env,s))return {checked:false,reason:'발송 당시 설정과 현재 설정이 달라 직접 확인이 필요합니다.'};
 const fallback=e.provider_mid.startsWith('fallback:');
 const r=await aligoProvider(env,'history/detail',{mid:e.provider_mid.replace(/^fallback:/,''),limit:'50'});
 if(Number(r.code)!==0)return {checked:false,reason:'알리고 결과 조회에 실패했습니다. 잠시 후 다시 조회해 주세요.'};
 let detail;for(const x of r.list||[])if(x.type==='AT'&&x.tpl_code===s.codes[e.kind]&&x.senderKey===env.ALIGO_SENDER_KEY&&await sha256(guidePhone(x.phone))===e.phone_hash){detail=x;break;}
 const primary=guideDelivery(detail);
 const alternate=fallback&&primary!=='accepted'&&primary!=='delivered'
  ?await customerFallbackResult((path,data)=>aligoProvider(env,path,data),detail,async phone=>await sha256(guidePhone(phone))===e.phone_hash,e.occurred_at):null;
 const status=alternate?.status||primary;
 if(status==='accepted')return {checked:true,reason:'수신 결과가 아직 확정되지 않았습니다. 잠시 후 다시 조회해 주세요.'};
 const updated=await env.DB.prepare("UPDATE deposit_notifications SET status=?,error=?,updated_at=? WHERE id=? AND status IN ('accepted','unknown') AND provider_mid=? AND config_hash=?").bind(status,alternate?.note||(status==='delivered'?'':'알림톡 전송 실패 '+str(detail?.rslt,20)),now(),e.id,e.provider_mid,e.config_hash).run();
 return {checked:true,updated:!!changes(updated),reason:alternate?.note||(status==='delivered'?'수신 성공으로 갱신했습니다.':'발송 실패로 갱신했습니다.')};
}
export async function depositNoticeTick(env,send=true){
 if(!configured(env))return {ok:true,enabled:false};
 const leaseUntil=Date.now()+120000;
 const lease=await env.DB.prepare("INSERT INTO deposit_notification_lease(name,until_at) VALUES('tick',?) ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE deposit_notification_lease.until_at<?").bind(leaseUntil,Date.now()).run();if(!changes(lease))return {ok:true,busy:true};
 try{
  await env.DB.prepare("UPDATE deposit_notifications SET status='unknown',error='발송 중 결과 확인 필요' WHERE status='sending' AND updated_at<datetime('now','-5 minutes')").run();
  await env.DB.prepare("UPDATE deposit_notifications SET payload=json_remove(payload,'$.test_phone') WHERE mode='test' AND (status<>'queued' OR occurred_at<datetime('now','-1 day'))").run();
  const s=await depositMessageConfig(env),hash=await depositMessageHash(env,s),active=env.ALIGO_LIVE_ENABLED==='true'&&s.enabled&&s.hash===hash;
  if(!active)await env.DB.prepare("UPDATE deposit_notifications SET status='cancelled',error='고객 발송 중지·설정 변경' WHERE mode='live' AND status='queued'").run();
  const {results:pending}=await env.DB.prepare("SELECT * FROM deposit_notifications WHERE status='accepted' ORDER BY updated_at,id LIMIT 3").all();for(const e of pending||[])try{await refresh(env,e);}catch{}
  // Korea local 09:00–21:00. Operator test sends bypass quiet hours explicitly.
  const h=new Date(Date.now()+9*36e5).getUTCHours();
  if(active&&send&&h>=9&&h<21){
   const scheduled=(await env.DB.prepare("SELECT json_extract(value,'$.enabled') AS enabled FROM settings WHERE key='booking_journey'").first())?.enabled===1;
   const today=new Date(Date.now()+9*36e5).toISOString().slice(0,10),tomorrow=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
   if(scheduled)await env.DB.prepare(`UPDATE deposit_notifications SET status='cancelled',error='납부 기한 경과 또는 예약·보증금 입금 상태 변경',updated_at=? WHERE kind='payment' AND mode='live' AND status='queued' AND request_id IS NULL AND provider_mid IS NULL AND EXISTS(SELECT 1 FROM bookings b WHERE b.booking_code=deposit_notifications.booking_code AND (b.status<>'confirmed' OR ${depositDueSql()}<? OR CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END<>0))`).bind(now(),today).run();
   const {results}=await env.DB.prepare(`SELECT n.* FROM deposit_notifications n WHERE n.status='queued' AND n.mode='live' AND (?=0 OR n.kind<>'payment' OR EXISTS(SELECT 1 FROM bookings b WHERE b.booking_code=n.booking_code AND ${depositDueSql()} BETWEEN ? AND ? AND COALESCE(${depositConfirmedSql()},'')<?)) AND (?=0 OR n.kind<>'account' OR n.event_key<>n.booking_code||':account' OR NOT EXISTS(${initialConfirmationSql('n',"('queued','sending','unknown')")})) ORDER BY n.id LIMIT 3`).bind(scheduled?1:0,today,tomorrow,today,scheduled?1:0).all();
   for(const e of results||[])try{await dispatch(env,e);}catch{}
  }
  return {ok:true,enabled:active};
 }finally{await env.DB.prepare("UPDATE deposit_notification_lease SET until_at=? WHERE name='tick' AND until_at=?").bind(Date.now()+60000,leaseUntil).run();}
}
export async function depositNoticeCron(request,env,readOnly=false){
 if(request.method!=='POST'||!configured(env))return err('허용되지 않은 요청입니다.',403);
 const raw=await request.text();if(raw.length>1024)return err('허용되지 않은 요청입니다.',403);const d=parse(raw);
 if(!Number.isFinite(d.time)||Math.abs(Date.now()-d.time)>60000||!equalSecret(request.headers.get('X-Megaspot-Signature')||'',await parkingSign(env.ALIGO_RELAY_SECRET,raw)))return err('허용되지 않은 요청입니다.',403);
 if(readOnly){const s=await depositMessageConfig(env),scheduled=(await env.DB.prepare("SELECT json_extract(value,'$.enabled') AS enabled FROM settings WHERE key='booking_journey'").first())?.enabled===1;return json({ok:true,configured:true,enabled:s.enabled,live_allowed:env.ALIGO_LIVE_ENABLED==='true',types:s.types,payment_schedule:scheduled?'day_before_due':'on_confirmation',send_hours:'09:00–21:00'});}
 return json(await depositNoticeTick(env));
}
export async function depositNoticeAdmin({request,env,path,method}){
 const s=await depositMessageConfig(env),hash=await depositMessageHash(env,s);
 if(path.startsWith('deposit-notifications/account-reminders'))return accountReminderAdmin({request,env,path,method,url:new URL(request.url)},{booking,bookings,bookingSelect:BOOKING_SELECT,hash,refresh:async e=>configured(env)?refresh(env,e):{checked:false,reason:'알리고 서버 연결 설정을 확인해 주세요.'},ready:configured(env)&&env.ALIGO_LIVE_ENABLED==='true'&&s.enabled&&s.types.account&&s.hash===hash&&await tested(env,'account',hash),approve:async()=>usable('account',await template(env,s,'account')),obsolete:noticeObsolete,render:depositNoticeRender,variables:depositNoticeVariables});
 if(path==='deposit-notifications'&&method==='GET'){
  const {results}=await env.DB.prepare(`SELECT COALESCE(json_extract(n.payload,'$.delivery_phone'),json_extract(n.payload,'$.phone'),'') AS receiver,n.id,n.booking_code,n.kind,n.mode,n.status,n.provider_mid,n.error,n.occurred_at,n.updated_at,b.customer_name AS name,b.date FROM deposit_notifications n LEFT JOIN bookings b ON b.booking_code=n.booking_code ORDER BY n.id DESC LIMIT 100`).all();
  const items=[];for(const e of results||[]){if(e.status==='review'){const original=await env.DB.prepare('SELECT payload FROM deposit_notifications WHERE id=?').bind(e.id).first();const {payload,...review}=await changedNoticeReview(env,{...e,payload:original?.payload},s);items.push({...e,review});}else items.push(e);}
  return json({ok:true,...s,configured:configured(env),live_allowed:env.ALIGO_LIVE_ENABLED==='true',tested:Object.fromEntries(await Promise.all(kinds.map(async k=>[k,await tested(env,k,hash)]))),templates:Object.fromEntries(kinds.map(k=>[k,{...T[k],code:s.codes[k]}])),items});
 }
 if(path==='deposit-notifications/check'&&method==='POST')return json({ok:true,items:await approvals(env,s)});
 if(path==='deposit-notifications/settings'&&method==='PUT'){
  const d=await readJson(request),next={enabled:d.enabled===true,types:Object.fromEntries(kinds.map(k=>[k,d.types?.[k]===true])),codes:Object.fromEntries(kinds.map(k=>[k,str(d.codes?.[k],60)]))};next.hash=await depositMessageHash(env,next);
  if(next.enabled){if(!configured(env)||env.ALIGO_LIVE_ENABLED!=='true')return err('서버의 고객 발송 허용과 연결 설정을 먼저 확인해 주세요.',409);for(const k of kinds)if(next.types[k]&&(!usable(k,await template(env,next,k))||!await tested(env,k,next.hash)))return err(T[k].name+' 승인·본문·버튼 일치와 현재 설정의 운영자 시험 수신이 필요합니다.',409);if(!kinds.some(k=>next.types[k]))return err('자동 발송할 안내를 선택해 주세요.');}
  await env.DB.batch([env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(KEY,JSON.stringify(next),now()),env.DB.prepare("UPDATE deposit_notifications SET status='cancelled',error='운영 설정 변경' WHERE mode='live' AND status='queued'")]);await log(env,'deposit.notifications_settings','','admin',{enabled:next.enabled,types:next.types});return json({ok:true});
 }
 if(path==='deposit-notifications/test'&&method==='POST'){
  const d=await readJson(request),phone=guidePhone(d.phone),kind=d.kind;if(!phone||d.confirm_test!==true||!Object.hasOwn(T,kind))return err('운영자 시험 수신 번호와 안내 종류를 확인해 주세요.');if(!usable(kind,await template(env,s,kind)))return err('승인된 본문·버튼을 먼저 확인해 주세요.',409);
  if(await env.DB.prepare("SELECT id FROM deposit_notifications WHERE mode='test' AND occurred_at>=datetime('now','-1 minute') LIMIT 1").first())return err('시험 발송은 1분 뒤 다시 요청해 주세요.',429);
  const key='test:'+crypto.randomUUID();await env.DB.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode) VALUES('TEST',?,?,?,?, 'test')").bind(kind,key,now(),JSON.stringify({test_phone:phone,amount:150000,deduction:0,refund:150000})).run();const e=await env.DB.prepare('SELECT * FROM deposit_notifications WHERE event_key=?').bind(key).first();await dispatch(env,e);await env.DB.prepare("UPDATE deposit_notifications SET payload=json_remove(payload,'$.test_phone') WHERE id=? AND status<>'queued'").bind(e.id).run();return json({ok:true,id:e.id});
 }
 if(path==='deposit-notifications/refresh'&&method==='POST')return json(await depositNoticeTick(env,false));
 const m=path.match(/^deposit-notifications\/(\d+)\/(retry|not-sent)$/);
 if(m&&method==='POST'){
  const d=await readJson(request),e=await env.DB.prepare('SELECT * FROM deposit_notifications WHERE id=?').bind(Number(m[1])).first();if(!e||e.mode!=='live')return err('고객 발송 이력을 확인해 주세요.',404);
  if(!str(d.reason,300))return err('알리고에서 확인한 내용과 사유를 입력해 주세요.');
  if(m[2]==='not-sent'){if(!['unknown','sending'].includes(e.status)||d.confirm_not_sent!==true||Date.now()-utc(e.updated_at)<864e5)return err('요청 후 24시간 경과와 알리고 미접수 확인이 필요합니다.',409);await state(env,e.id,'failed','미발송 확인 · '+str(d.reason,200));}
  else if(e.status==='review'){
   if(d.confirm_retry!==true||e.request_id||e.provider_mid)return err('미발송 변경 안내를 확인해 주세요.',409);
   const review=await changedNoticeReview(env,e,s);if(review.blocked)return err(review.blocked,409);
   if(!d.review_hash||d.review_hash!==review.hash)return err('예약·안내 내용이 바뀌었습니다. 최신 미리보기를 다시 확인해 주세요.',409);
   if(!s.enabled||env.ALIGO_LIVE_ENABLED!=='true'||!s.types[e.kind]||s.hash!==hash||!await tested(env,e.kind,hash))return err('현재 설정의 승인·시험 수신·고객 발송 허용을 먼저 확인해 주세요.',409);
   const at=now(),eventKey='review:'+e.id+':'+review.hash;
   await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode) SELECT booking_code,kind,?,?,?,'live' FROM deposit_notifications WHERE id=? AND status='review'").bind(eventKey,at,JSON.stringify(review.payload),e.id),
    env.DB.prepare("UPDATE deposit_notifications SET status='cancelled',error='변경 내용 확인 후 새 안내 준비',updated_at=? WHERE id=? AND status='review'").bind(at,e.id)
   ]);
  }
  else {if(e.status!=='failed'||d.confirm_retry!==true)return err('명확한 실패·미발송 확인 후에만 재시도할 수 있습니다.',409);await env.DB.prepare("UPDATE deposit_notifications SET status='queued',request_id=NULL,provider_mid=NULL,updated_at=?,error=NULL WHERE id=? AND status='failed'").bind(now(),e.id).run();}
  await log(env,'deposit.notification_'+m[2],e.booking_code,'admin',{id:e.id,reason:str(d.reason,300)});return json({ok:true});
 }
 return err('경로를 찾을 수 없습니다.',404);
}

// Shared read-only context for the reservation notification console.
export async function depositConsoleContext(env,code){
 const s=await depositMessageConfig(env),hash=await depositMessageHash(env,s),b=await booking(env,code);
 const ready=Object.fromEntries(await Promise.all(kinds.map(async kind=>[kind,configured(env)&&env.ALIGO_LIVE_ENABLED==='true'&&s.enabled&&s.types[kind]&&s.hash===hash&&await tested(env,kind,hash)])));
 return {b,ready,hash};
}
