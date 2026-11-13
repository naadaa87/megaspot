import {saveNotificationContent,noticeButtons} from './_notification_content.js';
import {approvedCustomerTemplate,customerFallback,reviewCustomerTemplate} from './_customer_alimtalk.js';
import {CUSTOMER_ALIMTALK} from './_customer_alimtalk_templates.js';
import {JOIN} from './_parking.js';
import {json,err,now,sha256,readJson,str} from './_lib.js';
import {equalSecret} from './_payapp.js';
import {PARKING_TEMPLATES as T,PARKING_BUTTONS as B} from './_parking_templates.js';

const CUSTOMER_KIND={paid:'parking_paid',arrival_received:'parking_arrival'};
const SUBJECT='메가스팟 주차권 안내';
const RELAY='https://relay.naranhistory.com/megaspot/aligo',KEY='parking_alimtalk';
const parse=s=>{try{return JSON.parse(s||'{}');}catch{return {};}};
const changes=r=>Number(r?.meta?.changes??r?.changes??0);
const normalize=s=>String(s||'').replace(/\r\n/g,'\n');
const phone=s=>String(s||'').replace(/\D/g,'');
const utc=s=>Date.parse(String(s||'').replace(' ','T')+'Z');
const kst=s=>new Date(utc(s)).toLocaleString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,16);
const format=n=>Number(n||0).toLocaleString('ko-KR');
export async function parkingSign(secret,raw){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function config(env){const s=parse((await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(KEY).first())?.value);return {enabled:s.enabled===true,hash:s.hash||''};}
function configured(env){return env.ALIGO_RELAY_URL===RELAY && String(env.ALIGO_RELAY_SECRET||'').length>=32 && !!env.ALIGO_SENDER_KEY && !!env.ALIGO_SENDER;}
async function fingerprint(env){return sha256(JSON.stringify([T,B,env.ALIGO_RELAY_SECRET||'',env.ALIGO_SENDER_KEY||'',env.ALIGO_SENDER||'']));}
async function provider(env,path,data,id=crypto.randomUUID()){
 if(!configured(env))throw Error('기존 알리고 연결 설정이 필요합니다.');
 const body=JSON.stringify({path,data,request_id:id,time:Date.now()});
 const r=await fetch(RELAY,{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':await parkingSign(env.ALIGO_RELAY_SECRET,body)},body,redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('연결 결과 확인 필요');
 return r.json();
}
export function parkingTemplateMatches(kind,t){
 if(!T[kind] || !t)return false;
 const buttons=t.buttons||[];
 return normalize(t.templtContent)===T[kind].content && buttons.length===B.length && B.every((b,i)=>buttons[i].name===b.name && buttons[i].linkType==='WL' && (buttons[i].linkMo||buttons[i].linkM)===b.linkM && (buttons[i].linkPc||buttons[i].linkP)===b.linkP);
}
async function template(env,kind){
 const r=await provider(env,'template/list',{tpl_code:T[kind].code});
 if(Number(r.code)!==0)throw Error('템플릿 조회 실패');
 return (r.list||[]).find(t=>t.templtCode===T[kind].code);
}
function usable(kind,t){return t?.inspStatus==='APR' && ['A','R'].includes(t.status) && parkingTemplateMatches(kind,t);}
async function approvals(env){
 const items=[];
 for(const [kind,t] of Object.entries(T)){
  if(CUSTOMER_KIND[kind]){
   const {code,name,review,matches,ready}=await reviewCustomerTemplate(env,(path,data)=>provider(env,path,data),CUSTOMER_KIND[kind]);
   items.push({kind,code,name,review,matches,ready});
   continue;
  }
  const actual=await template(env,kind);
  items.push({kind,name:t.name,code:t.code,review:actual?.inspStatus||'missing',matches:parkingTemplateMatches(kind,actual),ready:usable(kind,actual)});
 }
 return items;
}
async function tested(env,hash){return !!await env.DB.prepare("SELECT id FROM parking_notifications WHERE mode='test' AND kind='paid' AND config_hash=? AND status IN ('delivered','sms_delivered') LIMIT 1").bind(hash).first();}
export async function parkingNoticeAccess(env,oid,key){
 return !!await env.DB.prepare('SELECT notification_id FROM parking_notification_links WHERE oid=? AND token_hash=? AND expires_at>?').bind(oid,await sha256(key),Date.now()).first();
}
export function parkingNoticeVariables(p,e,key){
 const payload=parse(e.payload),amount=Math.min(Number(p.price),Number(payload.refunded_amount??p.refunded_amount??0));
 return {주문번호:p.oid,차량끝번호:p.plate.slice(-4),이용일:p.visit_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1년 $2월 $3일'),주차권:({'1h':'1시간권','2h':'2시간권','3h':'3시간권',daily:'일일권'})[p.ticket],결제금액:format(p.price),접수일시:kst(e.occurred_at),등록일시:kst(e.occurred_at),환불금액:format(payload.refund_amount),누적환불금액:format(amount),남은결제금액:format(p.price-amount),구매내역키:key};
}
export function parkingNoticeRender(text,vars){return text.replace(/#\{([^}]+)\}/g,(_,k)=>{if(vars[k]==null)throw Error('알림 변수 누락');return vars[k];});}
export function parkingNoticeObsolete(p,e,at=Date.now()){
 if(!p)return true;
 if(['paid','arrival_received','applied','issue'].includes(e.kind) && (p.payment_status!=='paid'||Number(p.refunded_amount)>0||p.refund_hold))return true;
 if(['arrival_received','issue'].includes(e.kind) && p.status==='applied')return true;
 if(e.kind==='paid' && p.status!=='waiting')return true;
 if(e.kind==='issue' && p.status!=='issue')return true;
 if(['paid','arrival_received','applied','issue'].includes(e.kind) && p.refund_requested_at && !p.refund_reviewed_at)return true;
 if(e.kind==='partially_refunded' && p.payment_status==='refunded')return true;
 if(e.kind==='cancel_requested' && (p.payment_status==='refunded'||Number(p.refunded_amount)>0||p.refund_reviewed_at))return true;
 const age=at-utc(e.occurred_at);
 return age>(['arrival_received','issue'].includes(e.kind)?10*60000:24*3600000);
}
async function order(env,oid){return env.DB.prepare(JOIN+' WHERE p.oid=?').bind(oid).first();}
async function state(env,id,status,error='',extra={}){
 await env.DB.prepare('UPDATE parking_notifications SET status=?,error=?,provider_mid=COALESCE(?,provider_mid),sms_mid=COALESCE(?,sms_mid),updated_at=? WHERE id=?').bind(status,error,extra.mid||null,extra.sms||null,now(),id).run();
}
async function sendingTemplate(env,kind){
 const upgraded=CUSTOMER_KIND[kind];
 if(upgraded){
  const approved=await approvedCustomerTemplate(env,(path,data)=>provider(env,path,data),upgraded);
  if(!approved)return null;
  return {...approved,sms:customerFallback(SUBJECT,approved.content,approved.buttons).fmessage_1};
 }
 const actual=await template(env,kind);
 return usable(kind,actual)?{...T[kind],content:actual.templtContent,buttons:B.map(b=>({
  name:b.name,linkType:b.linkType,linkMo:b.linkM,linkPc:b.linkP
 }))}:null;
}
async function dispatch(env,e){
 const p=await order(env,e.oid);
 if(e.mode!=='test' && parkingNoticeObsolete(p,e)){await state(env,e.id,'cancelled','현재 상태 또는 안내 유효시간 변경');return;}
 if(!p){await state(env,e.id,'failed','주문 없음');return;}
 // Approval is checked before taking a sending lock. Rejected/pending templates never send.
 const notice=await sendingTemplate(env,e.kind);
 if(!notice){
  await env.DB.prepare("UPDATE parking_notifications SET error=? WHERE id=? AND status='queued'")
   .bind('승인된 알림톡 본문·버튼 확인 대기',e.id).run();
  return;
 }
 const hash=await fingerprint(env),settings=await config(env);
 if(e.mode!=='test' && (env.ALIGO_LIVE_ENABLED!=='true' || !settings.enabled || settings.hash!==hash || !await tested(env,hash)))return;
 const receiver=phone(e.mode==='test'?parse(e.payload).test_phone:p.buyer_phone);
 if(!/^01[016789]\d{7,8}$/.test(receiver)){await state(env,e.id,'failed','수신 번호 확인 필요');return;}
 const id=crypto.randomUUID();
 const claimed=await env.DB.prepare("UPDATE parking_notifications SET status='sending',request_id=?,phone_hash=?,config_hash=?,updated_at=? WHERE id=? AND status='queued'").bind(id,await sha256(receiver),hash,now(),e.id).run();
 if(!changes(claimed))return;
 try{
  const key=await parkingSign(env.ALIGO_RELAY_SECRET,'parking-link-v1:'+id);
  const expires=Math.max(Date.now(),Date.parse(p.visit_date+'T23:59:59+09:00'))+7*86400000;
  await env.DB.prepare('INSERT INTO parking_notification_links(notification_id,oid,token_hash,expires_at) VALUES(?,?,?,?)').bind(e.id,p.oid,await sha256(key),expires).run();
  const vars=parkingNoticeVariables(p,e,key),message=parkingNoticeRender(notice.content,vars);
  const buttons=notice.buttons.map(b=>({...b,linkMo:parkingNoticeRender(b.linkMo,vars),linkPc:parkingNoticeRender(b.linkPc,vars)}));
  const sms=parkingNoticeRender(notice.sms,vars);
  await saveNotificationContent(env,'parking',e.id,{receiver,message,buttons,template_code:notice.code,fallback_message:sms});
  const r=await provider(env,'alimtalk/send',{tpl_code:notice.code,receiver_1:receiver,subject_1:SUBJECT,message_1:message,
   button_1:JSON.stringify({button:buttons}),failover:'Y',fsubject_1:SUBJECT,fmessage_1:sms},id);
  if(Number(r.code)!==0){await state(env,e.id,'failed','알리고 접수 거절 '+String(r.code).slice(0,20));return;}
  if(!r.info?.mid || Number(r.info.scnt)!==1){await state(env,e.id,'unknown','전송 접수 결과 확인 필요');return;}
  await state(env,e.id,'accepted','',{mid:CUSTOMER_KIND[e.kind]?'at:'+notice.code+':'+r.info.mid:String(r.info.mid)});
 }catch{await state(env,e.id,'unknown','응답 확인 필요 · 자동 재발송 중지');}
}
async function refresh(env,e){
 if(!e.provider_mid || e.config_hash!==await fingerprint(env))return;
 if(String(e.provider_mid).startsWith('sms:')){
  const r=await provider(env,'sms/detail',{mid:e.sms_mid,page_size:'50'});if(Number(r.result_code)!==1)return;
  for(const x of r.list||[]){if(/^20\d{2}-\d{2}-\d{2} /.test(x.send_date||'') && await sha256(phone(x.receiver))===e.phone_hash && !/중|대기|예약|접수/.test(x.sms_state||'')){
   const label=e.kind==='arrival_received'?'입차 접수':'결제 안내';
   await state(env,e.id,x.sms_state==='발송완료'?'sms_delivered':'failed',x.sms_state==='발송완료'?label+' 문자 도착':label+' 문자 전송 실패');return;
  }}return;
 }
 const atRef=/^at:([^:]+):(\d+)$/.exec(e.provider_mid);
 const code=atRef?.[1]||T[e.kind].code;
 const r=await provider(env,'history/detail',{mid:atRef?.[2]||e.provider_mid,limit:'50'});
 if(Number(r.code)!==0)return;
 const rows=r.list||[];let at;
 for(const x of rows){if(x.type==='AT' && x.tpl_code===code && x.senderKey===env.ALIGO_SENDER_KEY && await sha256(phone(x.phone))===e.phone_hash){at=x;break;}}
 const reported=x=>/^20\d{2}-\d{2}-\d{2} /.test(x?.rsltdate||'') && !String(x?.msgid||'').startsWith('Q');
 if(!reported(at))return;
 if(String(at.rslt)==='0'){await state(env,e.id,'delivered');return;}
 const smid=String(at.smid||e.sms_mid||'');
 if(/^\d+$/.test(smid) && Number(smid)>0){
  const sr=await provider(env,'sms/detail',{mid:smid,page_size:'50'});
  if(Number(sr.result_code)!==1)return;
  for(const x of sr.list||[]){if(['SMS','LMS'].includes(x.type) && /^20\d{2}-\d{2}-\d{2} /.test(x.send_date||'') && await sha256(phone(x.receiver))===e.phone_hash && !/중|대기|예약|접수/.test(x.sms_state||'')){
   const success=x.sms_state==='발송완료';await state(env,e.id,success?'sms_delivered':'failed',success?'':'알림톡·대체문자 전송 실패',{sms:smid});return;
  }}
  if(Date.now()-utc(e.occurred_at)>86400000){await state(env,e.id,'unknown','대체 문자 최종 결과 확인 필요',{sms:smid});return;}
  await state(env,e.id,'accepted','SMS 대체 발송 결과 대기',{sms:smid});
 }else if(Date.now()-utc(e.occurred_at)>86400000)await state(env,e.id,'unknown','알리고 SMS 대체 발송 결과 확인 필요');
}
export async function parkingNoticeTick(env,send=true){
 // A process killed during provider I/O must never make the same event eligible again.
 await env.DB.prepare("UPDATE parking_notifications SET status='unknown',error='발송 중 응답 확인 필요' WHERE status='sending' AND updated_at<datetime('now','-5 minutes')").run();
 await env.DB.prepare('DELETE FROM parking_notification_links WHERE expires_at<?').bind(Date.now()).run();
 await env.DB.prepare("UPDATE parking_notifications SET payload=json_remove(payload,'$.test_phone') WHERE mode='test' AND (status<>'queued' OR occurred_at<datetime('now','-1 day'))").run();
 const settings=await config(env),active=env.ALIGO_LIVE_ENABLED==='true' && settings.enabled && settings.hash===await fingerprint(env) && await tested(env,settings.hash);
 if(!active)await env.DB.prepare("UPDATE parking_notifications SET status='cancelled',error='고객 발송 중지' WHERE status='queued' AND mode='live'").run();
 const {results:pending}=await env.DB.prepare("SELECT * FROM parking_notifications WHERE status='accepted' ORDER BY id LIMIT 10").all();
 for(const e of pending||[]){try{await refresh(env,e);}catch{}}
 if(active&&send){const {results}=await env.DB.prepare("SELECT * FROM parking_notifications WHERE status='queued' AND mode='live' ORDER BY id LIMIT 5").all();for(const e of results||[]){try{await dispatch(env,e);}catch{}}}
 return {ok:true,enabled:!!active};
}
export async function parkingNoticeCron(request,env,readOnly=false){
 if(request.method!=='POST'||!configured(env))return err('허용되지 않은 요청입니다.',403);
 const raw=await request.text();if(raw.length>1024)return err('허용되지 않은 요청입니다.',403);
 const data=parse(raw),expected=await parkingSign(env.ALIGO_RELAY_SECRET,raw);
 if(!Number.isFinite(data.time)||Math.abs(Date.now()-data.time)>60000||!equalSecret(request.headers.get('X-Megaspot-Signature')||'',expected))return err('허용되지 않은 요청입니다.',403);
 if(readOnly){const s=await config(env);return json({ok:true,enabled:s.enabled,live_allowed:env.ALIGO_LIVE_ENABLED==='true',configured:configured(env),test_delivered:await tested(env,await fingerprint(env)),...(data.check_templates===true?{templates:await approvals(env)}:{})});}
 return json(await parkingNoticeTick(env));
}
export async function parkingNoticeAdmin(request,env,path){
 const method=request.method,hash=await fingerprint(env),s=await config(env);
 if(path==='admin/notifications' && method==='GET'){
  const {results}=await env.DB.prepare('SELECT id,oid,kind,mode,status,provider_mid,sms_mid,error,occurred_at,updated_at FROM parking_notifications ORDER BY id DESC LIMIT 100').all();
  const templates=Object.entries(T).map(([kind,previous])=>{
   const current=CUSTOMER_ALIMTALK[CUSTOMER_KIND[kind]];
   const {name,code,content}=current||previous;
   return {kind,name,code,content,sms:current?customerFallback(SUBJECT,content,current.buttons).fmessage_1:previous.sms};
  });
  return json({ok:true,enabled:s.enabled,live_allowed:env.ALIGO_LIVE_ENABLED==='true',configured:configured(env),
   test_delivered:await tested(env,hash),items:results||[],sms_fallback:true,paid_notice_channel:'alimtalk',
   arrival_notice_channel:'alimtalk',templates});
 }
 if(path==='admin/notifications/check' && method==='POST')return json({ok:true,items:await approvals(env)});
 if(path==='admin/notifications/settings' && method==='PUT'){
  const d=await readJson(request),enabled=d.enabled===true;
  if(enabled && env.ALIGO_LIVE_ENABLED!=='true')return err('서버의 고객 발송 잠금이 켜져 있습니다. 승인·시험 수신 후 운영 발송을 허용해 주세요.',409);
  if(enabled && (!configured(env)||!await tested(env,hash)||(await approvals(env)).some(t=>!t.ready)))return err('7종 승인·본문·버튼 확인과 운영자 시험 수신을 먼저 완료해 주세요.',409);
  await env.DB.batch([
   env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(KEY,JSON.stringify({enabled,hash}),now()),
   env.DB.prepare("UPDATE parking_notifications SET status='cancelled',error='운영 설정 변경' WHERE status='queued' AND mode='live'")
  ]);
  return json({ok:true,enabled});
 }
 if(path==='admin/notifications/test' && method==='POST'){
  const d=await readJson(request),receiver=phone(d.phone),kind=d.kind;
  if(d.confirm_test!==true||!/^01[016789]\d{7,8}$/.test(receiver)||!Object.hasOwn(T,kind))return err('운영자 시험 번호·안내 종류·유료 시험 발송 확인이 필요합니다.');
  const p=await order(env,str(d.oid,40));if(!p)return err('시험에 사용할 본인 주차 주문을 확인해 주세요.');
  if(!await sendingTemplate(env,kind))return err('승인된 본문·버튼이 확인된 뒤 시험 발송할 수 있습니다.',409);
  const recent=await env.DB.prepare("SELECT id FROM parking_notifications WHERE mode='test' AND occurred_at>=datetime('now','-1 minute') LIMIT 1").first();if(recent)return err('시험 발송은 1분 간격으로 가능합니다.',429);
  const key='test:'+crypto.randomUUID();
  await env.DB.prepare("INSERT INTO parking_notifications(oid,kind,event_key,occurred_at,payload,mode) VALUES(?,?,?,?,?,'test')").bind(p.oid,kind,key,now(),JSON.stringify({test_phone:receiver})).run();
  const e=await env.DB.prepare('SELECT * FROM parking_notifications WHERE event_key=?').bind(key).first();await dispatch(env,e);
  // The recipient is needed only during dispatch, never in durable delivery logs.
  await env.DB.prepare("UPDATE parking_notifications SET payload='{}' WHERE id=?").bind(e.id).run();
  return json({ok:true,id:e.id});
 }
 if(path==='admin/notifications/refresh' && method==='POST')return json(await parkingNoticeTick(env,false));
 return err('경로를 찾을 수 없습니다.',404);
}
