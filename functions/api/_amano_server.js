import {json,err,readJson} from './_lib.js';
import {parkingSign} from './_parking_notifications.js';
const RELAY='https://relay.naranhistory.com/megaspot/amano';
export async function amanoAdmin(request,env,path){
 let action,data={};
 if(path==='admin/amano/status'&&request.method==='GET')action='status';
 else if(path==='admin/amano/setup'&&request.method==='POST'){
  action='setup';const d=await readJson(request);
  if(d.confirm_storage!==true||typeof d.encrypted_credentials!=='string'||d.encrypted_credentials.length>2000)return err('계정 암호화와 서버 보관 동의를 확인해 주세요.');
  data={encrypted_credentials:d.encrypted_credentials,confirm_storage:true};
 }else if(path==='admin/amano/check'&&request.method==='POST')action='check';
 else if(path==='admin/amano/settings'&&request.method==='PUT'){const d=await readJson(request);action='settings';data={enabled:d.enabled===true,confirm_policy:d.confirm_policy===true};}
 else return err('경로를 찾을 수 없습니다.',404);
 if(String(env.ALIGO_RELAY_SECRET||'').length<32)return err('기존 서버 연결 설정을 확인해 주세요.',503);
 const body=JSON.stringify({action,...data,time:Date.now()});
 try{const r=await fetch(RELAY,{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':await parkingSign(env.ALIGO_RELAY_SECRET,body)},body,redirect:'manual',signal:AbortSignal.timeout(25000)});if(r.status>=300&&r.status<400)return err('서버 주소를 확인해 주세요.',502);const d=await r.json();return json(d,r.status);}catch{return err('아마노 서버 연결을 확인해 주세요.',502);}
}

// This endpoint is reserved for the user's authenticated parking server.
import {equalSecret} from './_payapp.js';
import {kstToday} from './_lib.js';
import {parkingDate,parkingAdmin,JOIN} from './_parking.js';
import {parkingBatchAudit} from './_parking_audit.js';
export function amanoOperating(at=Date.now()){
 const kst=new Date(at+9*36e5).toISOString();return parkingDate(kst.slice(0,10))&&Number(kst.slice(11,13))>=10;
}
export async function amanoAutomation(request,env){
 if(request.method!=='POST'||String(env.ALIGO_RELAY_SECRET||'').length<32)return err('허용되지 않은 요청입니다.',403);
 const raw=await request.text();if(raw.length>8000)return err('허용되지 않은 요청입니다.',403);
 let d;try{d=JSON.parse(raw);}catch{return err('허용되지 않은 요청입니다.',403);}
 const sig=await parkingSign(env.ALIGO_RELAY_SECRET,raw);
 if(!Number.isFinite(d.time)||Math.abs(Date.now()-d.time)>60000||!equalSecret(request.headers.get('X-Megaspot-Signature')||'',sig))return err('허용되지 않은 요청입니다.',403);
 if(d.action==='audit-batch')return parkingBatchAudit(env,d.since);
 const operating=amanoOperating();
 if(d.action==='orders'){
  if(!operating)return json({ok:true,operating:false,date:kstToday(),items:[]});
  const {results}=await env.DB.prepare("SELECT oid,plate,visit_date,ticket,hours,status,price FROM ("+JOIN+") WHERE payment_status='paid' AND test=0 AND visit_date=? AND status IN ('waiting','requested') AND (refund_requested_at IS NULL OR refund_reviewed_at IS NOT NULL) AND refunded_amount=0 AND refund_hold=0 ORDER BY created_at,oid LIMIT 50").bind(kstToday()).all();return json({ok:true,operating:true,date:kstToday(),items:results||[]});
 }
 if(!['claim','complete','issue','order'].includes(d.action)||!/^MS[A-Z0-9]{1,38}$/.test(d.oid||''))return err('허용되지 않은 작업입니다.',400);
 const p=await env.DB.prepare(JOIN+' WHERE p.oid=? AND o.test=0').bind(d.oid).first();if(!p||p.test||p.visit_date!==kstToday())return err('당일 주차권 주문만 처리할 수 있습니다.',409);
 if(d.action==='order')return json({ok:true,order:{oid:p.oid,plate:p.plate,visit_date:p.visit_date,ticket:p.ticket,status:p.status,price:p.price,payment_status:p.payment_status,refunded_amount:p.refunded_amount,refund_pending:!!(p.refund_hold||p.refund_requested_at&&!p.refund_reviewed_at),free_hours:p.free_hours,paid_hours:p.paid_hours,entry_id:p.entry_id,entry_at:p.entry_at}});
 if(!operating)return err('주차 등록 운영시간이 아닙니다.',409);
 if(d.action!=='issue'&&(p.payment_status!=='paid'||p.refunded_amount||p.refund_hold||p.refund_requested_at&&!p.refund_reviewed_at))return err('결제·환불 상태가 변경되었습니다.',409);
 const data=d.data||{};
 if(d.action==='claim'){
  if(!['waiting','requested'].includes(p.status)||data.entry_at?.slice(0,10)!==p.visit_date||data.confirm_overnight)return err('당일의 미등록 입차 건만 자동 처리합니다.',409);
  if(data.free_used!==true&&data.confirm_no_free!==true)return err('무료 1시간 사용 이력을 확인해 주세요.',400);
 }
 if(d.action==='complete'){
  const expected=p.ticket==='daily'?20000:Number(p.paid_hours)*3000;
  if(data.cost!==expected||expected>p.price||data.confirm_paid_applied!==true||p.free_hours===1&&data.confirm_free_applied!==true)return err('무료 우선 적용·등록 이력·승인 원가를 확인해 주세요.',409);
 }
 const result=await parkingAdmin(new Request('https://megaspot.kr/api/parking/admin/orders/'+p.oid+'/'+d.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,confirm_applied:d.action==='complete',memo:'서버 자동 처리 · '+String(data.memo||'').slice(0,950)})}),env,'admin/orders/'+p.oid+'/'+d.action);
 return result;
}
