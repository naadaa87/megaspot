import {depositMessageConfig,depositMessageHash,depositTemplateMatches} from './_deposit_notifications.js';
import {parkingNoticeCron,parkingSign} from './_parking_notifications.js';
// HMAC-authenticated, narrow operational migration; no arbitrary SQL or customer send endpoint.
import {json,err,now,sha256} from './_lib.js';
import {guideAdmin,aligoProvider,guidePhone} from './_guide_messages.js';
import {CUSTOMER_ALIMTALK} from './_customer_alimtalk_templates.js';
import {approvedCustomerTemplate} from './_customer_alimtalk.js';
const ARRIVAL='UN_6624';
async function guide(env,path,body){const url=new URL('https://megaspot.kr/api/admin/'+path);return guideAdmin({env,url,path,method:body?'POST':'GET',request:new Request(url,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})})});}
export async function notificationAudit(env){
 const g=await guide(env,'guide-messages/settings'),s=await g.json();
 const transactions=(await env.DB.prepare('SELECT kind,status,COUNT(*) count FROM transaction_notifications GROUP BY kind,status').all()).results||[];
 const deposits=(await env.DB.prepare("SELECT kind,status,COUNT(*) count FROM deposit_notifications WHERE mode='live' GROUP BY kind,status").all()).results||[];
 const legacyPending=await env.DB.prepare("SELECT COUNT(*) n FROM booking_guide_messages WHERE mode='live' AND status='queued' AND COALESCE(json_extract(snapshot,'$.template_code'),'')<>?").bind(ARRIVAL).first();
 return {manual_guide:{enabled:s.enabled,automatic:s.automatic,code:s.template_code,spaces:s.spaces,test_delivered:s.test_delivered},legacy_queued:legacyPending?.n||0,transaction_counts:transactions,deposit_counts:deposits};
}
export async function notificationOperations(env,d){
 if(d?.action==='audit_extended'){
  const deposit=await depositMessageConfig(env),templates=[];
  for(const [kind,code] of Object.entries(deposit.codes)){const result=await aligoProvider(env,'template/list',{tpl_code:code});const template=(result.list||[]).find(t=>t.templtCode===code);templates.push({kind,code,review:template?.inspStatus||'missing',matches:depositTemplateMatches(kind,template),ready:template?.inspStatus==='APR'&&['A','R'].includes(template.status)&&depositTemplateMatches(kind,template)});}
  const body=JSON.stringify({time:Date.now(),check_templates:true}),parking=await parkingNoticeCron(new Request('https://megaspot.kr/api/parking/notifications/status',{method:'POST',headers:{'X-Megaspot-Signature':await parkingSign(env.ALIGO_RELAY_SECRET,body)},body}),env,true);
  return json({ok:true,...await notificationAudit(env),deposit:{enabled:deposit.enabled,current_hash_matches:deposit.hash===await depositMessageHash(env,deposit),templates},parking:await parking.json()});
 }
 if(d?.action==='audit')return json({ok:true,...await notificationAudit(env)});
 if(d?.action==='test_current_arrival'){
  const phone=guidePhone(d.phone),id=d.test_id;
  if(d.confirm_test!==true||!phone||!/^[a-f0-9-]{36}$/.test(id||''))return err('운영자 시험 요청을 확인해 주세요.');
  const staff=JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key='parking_admin_alerts'").first())?.value||'{}');
  if(!(staff.phones||[]).some(p=>guidePhone(p)===phone))return err('등록된 운영자 번호로만 시험할 수 있습니다.',403);
  const key='notification-arrival-test:'+id,existing=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
  if(existing)return json({ok:true,duplicate:true,...JSON.parse(existing.value)});
  const claim=await env.DB.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)').bind(key,JSON.stringify({state:'sending',receiver_hash:await sha256(phone)}),now()).run();
  if(!Number(claim.meta?.changes??claim.changes))return err('시험 요청이 이미 진행 중입니다.',409);
  const settings=await (await guide(env,'guide-messages/settings')).json(),spaces=['megaspot-gundae'];
  const response=await guide(env,'guide-messages/test',{phone,confirm_test:true,candidate:{variant:'legacy',template_code:ARRIVAL,spaces}}),result=await response.clone().json();
  await env.DB.prepare('UPDATE settings SET value=?,updated_at=? WHERE key=?').bind(JSON.stringify({...result,state:response.ok?'accepted':'failed'}),now(),key).run();return response;
 }
 if(d?.action==='check_current_arrival'){
  if(!/^[a-f0-9-]{36}$/.test(d.message_id||''))return err('시험 메시지 번호를 확인해 주세요.');
  const row=await env.DB.prepare("SELECT id FROM booking_guide_messages WHERE id=? AND mode='test'").bind(d.message_id).first();if(!row)return err('시험 이력이 없습니다.',404);
  await guide(env,'guide-messages/'+row.id+'/refresh',{});
  const result=await env.DB.prepare("SELECT id,status,provider_result,error FROM booking_guide_messages WHERE id=?").bind(row.id).first();return json({ok:true,...result});
 }
 if(d?.action==='activate_approved_notifications'){
  const connected=[];
  for(const kind of Object.keys(CUSTOMER_ALIMTALK)){const template=await approvedCustomerTemplate(env,(path,data)=>aligoProvider(env,path,data),kind);if(!template)return err('승인·본문·버튼 확인이 필요합니다: '+kind,409);connected.push({kind,code:template.code});}
  const previous=await (await guide(env,'guide-messages/settings')).json(),spaces=['megaspot-gundae'];
  const url=new URL('https://megaspot.kr/api/admin/guide-messages/settings');
  const response=await guideAdmin({env,url,path:'guide-messages/settings',method:'PUT',request:new Request(url,{method:'PUT',body:JSON.stringify({variant:'legacy',enabled:true,automatic:false,template_code:ARRIVAL,spaces})})});if(!response.ok)return response;
  await env.DB.prepare("UPDATE booking_guide_messages SET status='cancelled',error='이전 이용 안내 종료 · 새 입실·주차 안내로 통합',updated_at=? WHERE mode='live' AND status='queued' AND COALESCE(json_extract(snapshot,'$.template_code'),'')<>?").bind(now(),ARRIVAL).run();
  await env.DB.prepare("UPDATE booking_guide_events SET status='cancelled' WHERE status='pending'").run();
  return json({ok:true,connected,...await notificationAudit(env)});
 }
 return err('지원하지 않는 운영 작업입니다.',400);
}
