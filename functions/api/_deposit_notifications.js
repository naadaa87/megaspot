// Information-only notices. DB triggers create an outbox in the booking transaction.
import {json,err,now,str,readJson,sha256,SPACES,log} from './_lib.js';
import {aligoProvider,guidePhone,guideDelivery} from './_guide_messages.js';
import {DEPOSIT_TEMPLATES as T,DEPOSIT_TEMPLATE_CODES as C} from './_deposit_templates.js';
import {refundAdmin,keyReady,eventTime,refundDate} from './_deposit_refunds.js';
import {parkingSign} from './_parking_notifications.js';
import {equalSecret} from './_payapp.js';
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
async function booking(env,code){return env.DB.prepare(`SELECT b.*,r.state AS refund_state,r.account_cipher,r.purged_at,r.completion_id,r.paid_amount,r.deduction,r.completed_at,r.account_version,
 COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000) AS deposit_amount,
 CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE(json_extract(ic.checks,'$.guarantee_paid'),0) ELSE COALESCE(dc.paid,0) END AS deposit_paid,
 COALESCE(json_extract(ic.checks,'$.guarantee_returned'),0) AS returned
 FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code LEFT JOIN inquiry_checks ic ON ic.ref=b.inquiry_ref LEFT JOIN booking_deposit_checks dc ON dc.booking_code=b.booking_code WHERE b.booking_code=?`).bind(code).first();}
export function noticeObsolete(b,e,at=Date.now()){
 if(!b||!Object.hasOwn(SPACES,b.space_id))return '예약 정보를 확인해 주세요.';
 const p=parse(e.payload),end=eventTime(b);
 if(clean(p.name)!==clean(b.customer_name)||guidePhone(p.phone)!==guidePhone(b.phone)||p.date!==b.date||p.space!==b.space_id)return '예약자·연락처·이용일·호점이 변경되었습니다.';
 if(!Number.isFinite(utc(e.occurred_at))||at-utc(e.occurred_at)>7*864e5)return '안내 발생 후 7일이 지나 자동 발송하지 않습니다.';
 if(e.kind==='refunded')return b.refund_state!=='completed'||!p.completion||p.completion!==b.completion_id||p.refund!==b.paid_amount||p.deduction!==(b.deduction||0)?'환급 완료 내역이 변경되었습니다.':'';
 if(!['confirmed','completed'].includes(b.status)||!end)return '취소되었거나 이용 시간이 확인되지 않은 예약입니다.';
 if(p.start!==b.start_h||p.end!==b.end_h||p.slot!==b.slot)return '예약 이용 시간이 변경되었습니다.';
 if(Number(p.amount)!==Number(b.deposit_amount)||b.deposit_amount<=0)return '보증금액이 변경되었거나 보증금이 없는 예약입니다.';
 if(b.returned||b.refund_state==='completed')return '보증금 반환이 완료되었습니다.';
 if(e.kind==='payment'){if(b.deposit_paid)return '이미 보증금 입금이 확인되었습니다.';if(end.end<=at)return '이용이 종료되어 입금 안내를 보내지 않습니다.';}
 if(e.kind==='account'){if(!b.deposit_paid)return '보증금 입금 확인이 취소되었습니다.';if(b.account_cipher)return '환급 계좌가 이미 등록되었습니다.';if(['processing','hold'].includes(b.refund_state)||b.purged_at)return '계좌 등록을 받을 수 없는 처리 상태입니다.';if(end.end+90*864e5<=at)return '계좌 등록 안내 유효기간이 지났습니다.';}
 if(at-utc(e.occurred_at)>7*864e5)return '안내 발생 후 7일이 지나 자동 발송하지 않습니다.';
 return '';
}
export function depositNoticeVariables(b,e,token=''){
 const p=parse(e.payload),d=new Date(b.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-3);let due=d.toISOString().slice(0,10);const occurred=new Date(utc(e.occurred_at)+9*36e5).toISOString().slice(0,10);if(due<occurred)due=occurred;
 return {고객명:clean(b.customer_name),공간명:SPACES[b.space_id],이용일:b.date,보증금액:format(p.amount??b.deposit_amount),입금기한:due,환급예정일:refundDate(b)||'관리자 확인 후 안내',등록코드:token,차감액:format(p.deduction??b.deduction),환급금액:format(p.refund??b.paid_amount),처리일:p.completed_at?new Date(utc(p.completed_at)+9*36e5).toISOString().slice(0,10):occurred};
}
export function depositNoticeRender(text,vars){return text.replace(/#\{([^}]+)\}/g,(_,k)=>{if(vars[k]==null)throw Error('안내 변수 누락');return String(vars[k]);});}
async function changedNoticeReview(env,e,s){
 const b=await booking(env,e.booking_code);if(!b)return {blocked:'예약을 찾을 수 없습니다.'};
 const payload={...parse(e.payload),name:b.customer_name,phone:b.phone,date:b.date,space:b.space_id,start:b.start_h,end:b.end_h,slot:b.slot,amount:b.deposit_amount};
 const next={...e,payload:JSON.stringify(payload),occurred_at:now()},blocked=noticeObsolete(b,next);
 const vars=depositNoticeVariables(b,next,'전용 링크는 발송 시 생성'),message=depositNoticeRender(T[e.kind].content,vars);
 const hash=await sha256(JSON.stringify([e.id,payload,message,blocked,await depositMessageHash(env,s),b.account_version,b.refund_state,b.deposit_paid]));
 return {name:b.customer_name,phone:guidePhone(b.phone),date:b.date,message,hash,blocked,payload};
}
async function state(env,id,status,error='',mid=null){await env.DB.prepare('UPDATE deposit_notifications SET status=?,error=?,provider_mid=COALESCE(?,provider_mid),updated_at=? WHERE id=?').bind(status,str(error,300),mid,now(),id).run();}
async function accountToken(env,code){
 // Reuse the same invitation issuer as the admin. Never persist the rendered link in outbox/history.
 const url=new URL('https://megaspot.kr/api/admin/deposit-refunds/bookings/'+code+'/link');
 const r=await refundAdmin({env,url,path:'deposit-refunds/bookings/'+code+'/link',method:'POST',request:new Request(url,{method:'POST',body:'{}'})});
 const j=await r.json();if(!r.ok||!j.url)throw Error('계좌 등록 링크를 준비하지 못했습니다.');return j.url.split('#refund-account=')[1];
}
async function dispatch(env,e){
 const s=await depositMessageConfig(env),hash=await depositMessageHash(env,s);let b;
 if(e.mode==='test')b={booking_code:'TEST',customer_name:'운영자 시험',phone:parse(e.payload).test_phone,space_id:'megaspot-gundae',date:'2099-01-05',start_h:10,end_h:17,deposit_amount:150000,paid_amount:150000,deduction:0};
 else {b=await booking(env,e.booking_code);const reason=noticeObsolete(b,e);if(reason)return state(env,e.id,'cancelled',reason);if(env.ALIGO_LIVE_ENABLED!=='true'||!s.enabled||!s.types[e.kind]||s.hash!==hash||!await tested(env,e.kind,hash))return;}
 const receiver=guidePhone(b.phone);if(!receiver)return state(env,e.id,'failed','알림톡 수신 가능한 휴대폰 번호를 확인해 주세요.');
 const t=await template(env,s,e.kind);if(!usable(e.kind,t)){await env.DB.prepare('UPDATE deposit_notifications SET error=? WHERE id=? AND status=\'queued\'').bind('승인·본문·버튼 확인 대기',e.id).run();return;}
 // A new configuration must be confirmed again immediately before any external delivery.
 const fresh=await depositMessageConfig(env);if(JSON.stringify(fresh)!==JSON.stringify(s))return;
 const id=crypto.randomUUID(),r=await env.DB.prepare("UPDATE deposit_notifications SET status='sending',request_id=?,phone_hash=?,config_hash=?,updated_at=? WHERE id=? AND status='queued'").bind(id,await sha256(receiver),hash,now(),e.id).run();if(!changes(r))return;
 let token='';try{if(e.kind==='account')token=e.mode==='test'?'DEMO':await accountToken(env,e.booking_code);}catch{return state(env,e.id,'failed','계좌 등록 링크 발급 실패 · 관리자 확인 필요');}
 // Recheck the booking after issuing the link and taking the sending lock.
 if(e.mode==='live'){const latest=await booking(env,e.booking_code),reason=noticeObsolete(latest,e);if(reason)return state(env,e.id,'cancelled',reason);b=latest;const latestSettings=await depositMessageConfig(env);if(!latestSettings.enabled||!latestSettings.types[e.kind]||latestSettings.hash!==hash||env.ALIGO_LIVE_ENABLED!=='true')return state(env,e.id,'cancelled','고객 발송 중지·설정 변경');}
 const vars=depositNoticeVariables(b,e,token),message=depositNoticeRender(t.templtContent,vars),buttons=T[e.kind].buttons.map(b=>({name:b.name,linkType:'WL',linkMo:depositNoticeRender(b.linkMo,vars),linkPc:depositNoticeRender(b.linkPc,vars)}));
 try{
  const response=await aligoProvider(env,'alimtalk/send',{senderkey:env.ALIGO_SENDER_KEY,tpl_code:s.codes[e.kind],sender:env.ALIGO_SENDER,receiver_1:receiver,recvname_1:clean(b.customer_name),subject_1:'메가스팟 보증금 안내',message_1:message,...(buttons.length?{button_1:JSON.stringify({button:buttons})}:{}),failover:'N',testMode:'N'},id);
  if(!response||!/^[-]?\d+$/.test(String(response.code)))return state(env,e.id,'unknown','접수 응답 확인 필요 · 자동 재발송 중지');
  if(Number(response.code)!==0)return state(env,e.id,'failed','알리고 접수 거절 '+str(response.code,20));
  if(!response.info?.mid||Number(response.info.scnt)!==1||Number(response.info.fcnt||0)>0)return state(env,e.id,'unknown','접수 건수 확인 필요');
  await state(env,e.id,'accepted','',String(response.info.mid));
 }catch{await state(env,e.id,'unknown','접수 결과 불명 · 알리고 확인 전 재발송하지 마세요.');}
}
async function refresh(env,e){
 const s=await depositMessageConfig(env);if(!e.provider_mid||e.config_hash!==await depositMessageHash(env,s))return;
 const r=await aligoProvider(env,'history/detail',{mid:e.provider_mid,limit:'50'});if(Number(r.code)!==0)return;
 let detail;for(const x of r.list||[])if(x.type==='AT'&&x.tpl_code===s.codes[e.kind]&&x.senderKey===env.ALIGO_SENDER_KEY&&await sha256(guidePhone(x.phone))===e.phone_hash){detail=x;break;}
 const status=guideDelivery(detail);if(status!=='accepted')await state(env,e.id,status,status==='delivered'?'':'알림톡 전송 실패 '+str(detail?.rslt,20));
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
  const h=new Date(Date.now()+9*36e5).getUTCHours();if(active&&send&&h>=9&&h<21){const {results}=await env.DB.prepare("SELECT * FROM deposit_notifications WHERE status='queued' AND mode='live' ORDER BY id LIMIT 3").all();for(const e of results||[])try{await dispatch(env,e);}catch{}}
  return {ok:true,enabled:active};
 }finally{await env.DB.prepare("UPDATE deposit_notification_lease SET until_at=? WHERE name='tick' AND until_at=?").bind(Date.now()+60000,leaseUntil).run();}
}
export async function depositNoticeCron(request,env,readOnly=false){
 if(request.method!=='POST'||!configured(env))return err('허용되지 않은 요청입니다.',403);
 const raw=await request.text();if(raw.length>1024)return err('허용되지 않은 요청입니다.',403);const d=parse(raw);
 if(!Number.isFinite(d.time)||Math.abs(Date.now()-d.time)>60000||!equalSecret(request.headers.get('X-Megaspot-Signature')||'',await parkingSign(env.ALIGO_RELAY_SECRET,raw)))return err('허용되지 않은 요청입니다.',403);
 if(readOnly){const s=await depositMessageConfig(env);return json({ok:true,configured:true,enabled:s.enabled,live_allowed:env.ALIGO_LIVE_ENABLED==='true',types:s.types});}
 return json(await depositNoticeTick(env));
}
export async function depositNoticeAdmin({request,env,path,method}){
 const s=await depositMessageConfig(env),hash=await depositMessageHash(env,s);
 if(path==='deposit-notifications'&&method==='GET'){
  const {results}=await env.DB.prepare('SELECT n.id,n.booking_code,n.kind,n.mode,n.status,n.provider_mid,n.error,n.occurred_at,n.updated_at,b.customer_name AS name,b.date FROM deposit_notifications n LEFT JOIN bookings b ON b.booking_code=n.booking_code ORDER BY n.id DESC LIMIT 100').all();
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
