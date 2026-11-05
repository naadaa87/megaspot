// Admin-selected reminders only. Previewing never issues links or sends messages.
import {json,err,now,readJson,sha256,log} from './_lib.js';
import {refundAdmin} from './_deposit_refunds.js';
import {guidePhone} from './_guide_messages.js';
import {DEPOSIT_TEMPLATES} from './_deposit_templates.js';
const PREFIX='deposit-notifications/account-reminders',active=['queued','sending','accepted','unknown','review'];
const utc=s=>Date.parse(String(s||'').replace(' ','T')+'Z');
const snapshot=b=>JSON.stringify([b.customer_name,b.phone,b.date,b.space_id,b.start_h,b.end_h,b.slot,b.deposit_amount,b.deduction,b.deposit_paid,b.account_version,b.refund_state,b.purged_at,b.account_cipher?1:0,b.returned,b.status]);
const SNAPSHOT_SQL="json_array(b.customer_name,b.phone,b.date,b.space_id,b.start_h,b.end_h,b.slot,b.deposit_amount,b.deduction,b.deposit_paid,b.account_version,b.refund_state,b.purged_at,b.account_cipher IS NOT NULL,b.returned,b.status)";
function payload(b){return {name:b.customer_name,phone:b.phone,date:b.date,space:b.space_id,start:b.start_h,end:b.end_h,slot:b.slot,amount:b.deposit_amount,deduction:b.deduction||0};}
async function latest(env,codes){const out={};for(let i=0;i<codes.length;i+=80){const group=codes.slice(i,i+80);if(!group.length)continue;const r=await env.DB.prepare("SELECT n.*,(SELECT COUNT(*) FROM deposit_notifications a WHERE a.booking_code=n.booking_code AND a.mode='live' AND a.kind='account' AND a.status<>'cancelled') AS request_count,(SELECT COUNT(*) FROM deposit_notifications a WHERE a.booking_code=n.booking_code AND a.mode='live' AND a.kind='account' AND a.status='delivered') AS delivered_count,EXISTS(SELECT 1 FROM deposit_notifications a WHERE a.booking_code=n.booking_code AND a.mode='live' AND a.kind='account' AND a.status IN ('queued','sending','accepted','unknown','review')) AS has_active,(SELECT MAX(updated_at) FROM deposit_notifications a WHERE a.booking_code=n.booking_code AND a.mode='live' AND a.kind='account' AND a.status='delivered') AS last_delivered_at FROM deposit_notifications n WHERE n.booking_code IN ("+group.map(()=>'?').join(',')+") AND n.kind='account' AND n.mode='live' AND n.id=(SELECT MAX(id) FROM deposit_notifications WHERE booking_code=n.booking_code AND kind='account' AND mode='live')").bind(...group).all();for(const n of r.results||[])out[n.booking_code]=n;}return out;}
function reason(b,last,d){
 if(!b)return '예약을 찾을 수 없습니다.';
 const blocked=d.obsolete(b,{kind:'account',occurred_at:now(),payload:JSON.stringify(payload(b))});if(blocked)return blocked;
 if(!guidePhone(b.phone))return '알림톡 수신 가능한 휴대폰 번호를 확인해 주세요.';
 if(b.deposit_amount-(b.deduction||0)<=0)return '전액 차감되어 환급 계좌 등록이 필요하지 않습니다.';
 if(last&&(last.has_active||active.includes(last.status)))return '기존 계좌 안내가 처리 중이거나 결과 확인이 필요합니다.';
 if(last?.last_delivered_at&&utc(last.last_delivered_at)>Date.now()-3600000)return '최근 1시간 내 계좌 안내 수신이 완료되었습니다.';
 return '';
}
const fingerprint=(b,last,d)=>sha256(JSON.stringify([snapshot(b),last?.id||0,last?.status||'',last?.updated_at||'',d.hash]));
function codesOf(raw){if(!Array.isArray(raw)||!raw.length||raw.length>20||raw.some(c=>typeof c!=='string'||!/^[A-Z0-9-]{1,40}$/.test(c)))return null;return [...new Set(raw)];}
async function results(env,id){const r=await env.DB.prepare("SELECT booking_code,status,error FROM deposit_notifications WHERE event_key LIKE ? ORDER BY id").bind('account-reminder:'+id+':%').all();return r.results||[];}
export async function accountReminderAdmin({request,env,path,method,url},d){
 if(path===PREFIX&&method==='GET'){
  const target=new URL(url);target.searchParams.set('filter','missing');const response=await refundAdmin({env,request,url:target,path:'deposit-refunds',method:'GET'});if(!response.ok)return response;const data=await response.json(),codes=data.items.map(x=>x.code),rows=Object.fromEntries((await d.bookings(env,codes)).map(b=>[b.booking_code,b])),last=await latest(env,codes);
  return json({...data,send_ready:d.ready,reminder_cooldown_minutes:60,items:data.items.map(p=>{const n=last[p.code],blocked=reason(rows[p.code],n,d);return {...p,reminder:{eligible:!blocked&&d.ready,reason:blocked||(!d.ready?'계좌 안내 자동 발송 설정·시험 수신을 확인해 주세요.':''),last_status:n?.status||'',last_at:n?.updated_at||'',last_requested_at:n?.occurred_at||'',request_count:Number(n?.request_count||0),delivered_count:Number(n?.delivered_count||0),last_error:n?.error||''}};})});
 }
 if(path===PREFIX+'/preview'&&method==='POST'){
  const input=await readJson(request),codes=codesOf(input.codes);if(!codes)return err('고객을 1~20명 선택해 주세요.');
  if(!d.ready)return err('계좌 등록 안내의 승인·시험 수신·자동 발송 설정을 확인해 주세요.',409);
  if(!await d.approve())return err('승인 템플릿의 본문·버튼을 확인해 주세요.',409);
  const rows=Object.fromEntries((await d.bookings(env,codes)).map(b=>[b.booking_code,b])),last=await latest(env,codes),items=[],stored=[],excluded=[];
  for(const code of codes){const b=rows[code],blocked=reason(b,last[code],d);if(blocked){excluded.push({code,reason:blocked});continue;}const e={kind:'account',payload:JSON.stringify(payload(b)),occurred_at:now()},vars=d.variables(b,e,'예약자 전용 링크는 발송 시 연결됩니다');items.push({code,name:b.customer_name,phone:guidePhone(b.phone),date:b.date,message:d.render(DEPOSIT_TEMPLATES.account.content,vars),button_name:DEPOSIT_TEMPLATES.account.buttons[0].name});stored.push({code,hash:await fingerprint(b,last[code],d)});}
  const id=crypto.randomUUID(),expires=Date.now()+600000;if(items.length)await env.DB.prepare('INSERT INTO deposit_account_reminder_previews(id,items,config_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(id,JSON.stringify(stored),d.hash,expires,now()).run();
  await env.DB.prepare('DELETE FROM deposit_account_reminder_previews WHERE expires_at<?').bind(Date.now()-86400000).run();return json({ok:true,preview_id:items.length?id:null,expires_at:expires,items,excluded});
 }
 if(path===PREFIX+'/send'&&method==='POST'){
  const input=await readJson(request);if(typeof input.preview_id!=='string'||!/^[a-f0-9-]{36}$/.test(input.preview_id)||input.confirm_send!==true)return err('고객과 수신번호·문구를 확인한 뒤 발송해 주세요.');
  const p=await env.DB.prepare('SELECT * FROM deposit_account_reminder_previews WHERE id=?').bind(input.preview_id).first();if(!p)return err('미리보기를 다시 만들어 주세요.',409);
  if(p.consumed_at)return json({ok:true,duplicate:true,items:await results(env,p.id),excluded:[]});
  if(p.expires_at<=Date.now()||p.config_hash!==d.hash||!d.ready)return err('미리보기 만료 또는 발송 설정 변경입니다. 다시 확인해 주세요.',409);
  if(!await d.approve())return err('승인된 계좌 안내 템플릿을 확인해 주세요.',409);
  const claimed=await env.DB.prepare('UPDATE deposit_account_reminder_previews SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?').bind(now(),p.id,Date.now()).run();if(!(claimed.meta?.changes??claimed.changes))return json({ok:true,duplicate:true,items:await results(env,p.id),excluded:[]});
  const excluded=[];
  for(const saved of JSON.parse(p.items)){
   const b=await d.booking(env,saved.code),last=(await latest(env,[saved.code]))[saved.code],blocked=reason(b,last,d);
   if(blocked||await fingerprint(b,last,d)!==saved.hash){excluded.push({code:saved.code,reason:blocked||'예약 또는 발송 이력이 변경됐습니다. 다시 미리보기해 주세요.'});continue;}
   const time=now(),eventKey='account-reminder:'+p.id+':'+saved.code;
   const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode) SELECT b.booking_code,'account',?,?,?,'live' FROM (${d.bookingSelect} WHERE b.booking_code=?) b WHERE ${SNAPSHOT_SQL}=? AND b.account_cipher IS NULL AND b.purged_at IS NULL AND b.deposit_paid<>0 AND b.returned=0 AND b.status IN ('confirmed','completed') AND COALESCE(b.refund_state,'pending')='pending' AND b.deposit_amount>COALESCE(b.deduction,0) AND COALESCE((SELECT MAX(id) FROM deposit_notifications WHERE booking_code=b.booking_code AND mode='live' AND kind='account'),0)=? AND NOT EXISTS(SELECT 1 FROM deposit_notifications WHERE booking_code=b.booking_code AND mode='live' AND kind='account' AND status IN ('queued','sending','accepted','unknown','review'))`).bind(eventKey,time,JSON.stringify(payload(b)),saved.code,snapshot(b),last?.id||0).run();
   if(!(inserted.meta?.changes??inserted.changes))excluded.push({code:saved.code,reason:'계좌 등록 또는 다른 발송 처리가 진행되어 제외했습니다.'});
  }
  const items=await results(env,p.id);await log(env,'deposit.account_reminder_requested','','admin',{preview_id:p.id,codes:items.map(x=>x.booking_code),excluded:excluded.map(x=>x.code)});return json({ok:true,items,excluded});
 }
 return err('경로를 찾을 수 없습니다.',404);
}
