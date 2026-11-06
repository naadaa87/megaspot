import {JOIN} from './_parking.js';
import {json,err,readJson,str,now,sha256} from './_lib.js';
import {parkingSign} from './_parking_notifications.js';
const KEY='parking_admin_alerts',RELAY='https://relay.naranhistory.com/megaspot/aligo';
const parse=s=>{try{return JSON.parse(s||'{}');}catch{return {};}};
const changed=r=>Number(r?.meta?.changes??r?.changes??0);
export const adminPhones=phones=>Array.isArray(phones)?[...new Set(phones.map(p=>String(p).replace(/\D/g,'')))]:[];
const configured=env=>env.ALIGO_RELAY_URL===RELAY&&String(env.ALIGO_RELAY_SECRET||'').length>=32;
async function config(env){const r=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(KEY).first();return {enabled:false,phones:[],...parse(r?.value)};}
async function hash(env,phones){return sha256(JSON.stringify(['parking-admin-sms-v1',phones.slice().sort(),env.ALIGO_RELAY_SECRET||'']));}
async function provider(env,path,data,id=crypto.randomUUID()){
 if(!configured(env))throw Error('알리고 연결 설정 필요');
 const body=JSON.stringify({path,data,request_id:id,time:Date.now()});
 const r=await fetch(RELAY,{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':await parkingSign(env.ALIGO_RELAY_SECRET,body)},body,redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('문자 연결 결과 확인 필요');return r.json();
}
export function adminPaymentMessage(p){
 return '[메가스팟 주차권 결제 완료]\n차량: '+p.plate+'\n이용일: '+p.visit_date+'\n주차권: '+({'1h':'1시간권','2h':'2시간권','3h':'3시간권',daily:'일일권'}[p.ticket]||'주차권')+'\n결제: '+Number(p.price).toLocaleString('ko-KR')+'원\n주문: '+p.oid+'\n아마노 등록 전입니다. 서버가 실제 입차를 확인해 자동 등록합니다. 관리자 화면에서 등록 상태를 확인해 주세요.\nhttps://megaspot.kr/admin/#parking';
}
const TEST_MESSAGE='[메가스팟 주차권 관리자 알림 시험]\n새 주차권 결제 완료 시 이 번호로 알림을 보냅니다.\n실제 결제나 아마노 등록은 발생하지 않았습니다.\nhttps://megaspot.kr/admin/#parking';
async function state(env,id,status,error='',mid=null){await env.DB.prepare('UPDATE parking_admin_sms SET status=?,error=?,provider_mid=COALESCE(?,provider_mid),updated_at=? WHERE id=?').bind(status,str(error,200),mid,now(),id).run();}
async function dispatch(env,e,s){
 if(!configured(env))return;
 if(!s.phones.includes(e.receiver)||e.config_hash!==s.hash||e.mode==='live'&&!s.enabled){await state(env,e.id,'cancelled','수신 설정 변경');return;}
 let message=TEST_MESSAGE;
 if(e.mode==='live'){
  const p=await env.DB.prepare(JOIN+' WHERE p.oid=?').bind(e.oid).first();
  if(!p||p.payment_status!=='paid'||p.test||(p.refunded_amount>0||p.refund_hold)){await state(env,e.id,'cancelled','결제 상태 변경');return;}
  message=adminPaymentMessage(p);
 }
 const id=crypto.randomUUID();
 const r=await env.DB.prepare("UPDATE parking_admin_sms SET status='sending',request_id=?,updated_at=? WHERE id=? AND status='queued'").bind(id,now(),e.id).run();if(!changed(r))return;
 try{
  const result=await provider(env,'parking-admin/send',{receiver:e.receiver,msg:message},id);
  if(Number(result.result_code)!==1){await state(env,e.id,'failed','알리고 거절: '+str(result.message||result.result_code,120));return;}
  if(!result.msg_id||Number(result.success_cnt)!==1||Number(result.error_cnt)!==0){await state(env,e.id,'unknown','전송 접수 결과 확인 필요');return;}
  await state(env,e.id,'accepted','',String(result.msg_id));
 }catch{await state(env,e.id,'unknown','응답 확인 필요 · 자동 재발송하지 않습니다.');}
}
async function refresh(env,e){
 if(!e.provider_mid)return;
 const r=await provider(env,'sms/detail',{mid:e.provider_mid,page_size:'50'});if(Number(r.result_code)!==1)return;
 const row=(r.list||[]).find(x=>String(x.receiver||'').replace(/\D/g,'')===e.receiver);
 if(!row||!/^20\d{2}-\d{2}-\d{2} /.test(row.send_date||'')||/중|대기|예약|접수/.test(row.sms_state||''))return;
 await state(env,e.id,row.sms_state==='발송완료'?'delivered':'failed',row.sms_state==='발송완료'?'':str(row.sms_state,100));
}
export async function parkingAdminSMSTick(env){
 if(!configured(env))return;
 await env.DB.prepare("UPDATE parking_admin_sms SET status='unknown',error='발송 중 응답 확인 필요',updated_at=datetime('now') WHERE status='sending' AND updated_at<datetime('now','-5 minutes')").run();
 const s=await config(env);
 const {results:pending}=await env.DB.prepare("SELECT * FROM parking_admin_sms WHERE status='accepted' AND updated_at<datetime('now','-15 seconds') ORDER BY id LIMIT 2").all();
 await Promise.allSettled((pending||[]).map(e=>refresh(env,e)));
 const {results}=await env.DB.prepare("SELECT * FROM parking_admin_sms WHERE status='queued' ORDER BY id LIMIT 2").all();
 await Promise.allSettled((results||[]).map(e=>dispatch(env,e,s)));
}
const FEED="FROM ("+JOIN+") p LEFT JOIN admin_parking_payment_reads r ON r.oid=p.oid WHERE r.oid IS NULL AND p.paid_at IS NOT NULL AND p.payment_status='paid' AND p.test=0 AND p.refunded_amount=0 AND p.refund_hold=0";
async function tested(env,phones,fingerprint){for(const phone of phones){if(!await env.DB.prepare("SELECT id FROM parking_admin_sms WHERE mode='test' AND receiver=? AND config_hash=? AND status='delivered' LIMIT 1").bind(phone,fingerprint).first())return false;}return !!phones.length;}
export async function parkingAdminAlerts(request,env,path){
 const method=request.method;
 if(path==='admin/payment-alerts'&&method==='GET'){
  const s=await config(env),count=await env.DB.prepare('SELECT COUNT(*) AS n '+FEED).first();
  const {results}=await env.DB.prepare('SELECT p.oid,p.payment_id AS payment_oid,p.payment_total,p.payment_status,p.status,p.plate,p.visit_date,p.ticket,p.price,p.paid_at '+FEED+' ORDER BY p.paid_at DESC,p.oid DESC LIMIT 50').all();
  const paymentCount=await env.DB.prepare('SELECT COUNT(DISTINCT p.payment_id) AS n '+FEED).first();
  const {results:history}=await env.DB.prepare('SELECT id,oid,receiver,mode,status,error,occurred_at,updated_at FROM parking_admin_sms ORDER BY id DESC LIMIT 20').all();
  return json({ok:true,count:count?.n||0,payment_count:paymentCount?.n||0,items:results||[],sms:{enabled:s.enabled,phones:s.phones,configured:configured(env),test_delivered:await tested(env,s.phones,s.hash),history:history||[]}});
 }
 const read=path.match(/^admin\/payment-alerts\/([A-Z0-9]+)\/read$/);
 const readGroup=path.match(/^admin\/payment-alerts\/([A-Z0-9]+)\/read-group$/);
 if(readGroup&&method==='POST'){
  const p=await env.DB.prepare('SELECT o.oid FROM orders o WHERE o.oid=? AND o.paid_at IS NOT NULL AND EXISTS(SELECT 1 FROM parking_orders p WHERE COALESCE(p.payment_oid,p.oid)=o.oid)').bind(readGroup[1]).first();if(!p)return err('결제 내역을 찾을 수 없습니다.',404);
  await env.DB.prepare('INSERT OR IGNORE INTO admin_parking_payment_reads(oid,read_at) SELECT p.oid,? FROM parking_orders p WHERE COALESCE(p.payment_oid,p.oid)=?').bind(now(),p.oid).run();return json({ok:true});
 }
 if(read&&method==='POST'){
  const p=await env.DB.prepare('SELECT p.oid FROM parking_orders p JOIN orders o ON o.oid=COALESCE(p.payment_oid,p.oid) WHERE p.oid=? AND o.paid_at IS NOT NULL').bind(read[1]).first();if(!p)return err('결제 내역을 찾을 수 없습니다.',404);
  await env.DB.prepare('INSERT INTO admin_parking_payment_reads(oid,read_at) VALUES(?,?) ON CONFLICT(oid) DO NOTHING').bind(read[1],now()).run();return json({ok:true});
 }
 if(path==='admin/payment-alerts/settings'&&method==='PUT'){
  const d=await readJson(request),phones=adminPhones(d.phones),enabled=d.enabled===true;
  if(!phones.length||phones.length>5||phones.some(p=>!/^01[016789]\d{7,8}$/.test(p)))return err('관리자 휴대폰 번호를 1~5개 입력해 주세요.');
  if(!configured(env))return err('알리고 연결 설정을 먼저 확인해 주세요.',409);
  const r=await provider(env,'parking-admin/status',{});if(!r.ready||phones.some(p=>!r.receivers.includes(p)))return err('서버에 승인된 관리자 수신 번호를 먼저 등록해 주세요.',409);
  const fingerprint=await hash(env,phones);
  if(enabled&&!await tested(env,phones,fingerprint))return err('모든 수신 번호의 시험 문자 도착을 확인한 뒤 켜 주세요.',409);
  const value={enabled,phones,hash:fingerprint};
  await env.DB.batch([
   env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(KEY,JSON.stringify(value),now()),
   env.DB.prepare("UPDATE parking_admin_sms SET status='cancelled',error='운영 설정 변경',updated_at=? WHERE status='queued' AND (config_hash<>? OR (?=0 AND mode='live'))").bind(now(),fingerprint,enabled?1:0)
  ]);return json({ok:true,...value});
 }
 if(path==='admin/payment-alerts/test'&&method==='POST'){
  const d=await readJson(request),s=await config(env);if(d.confirm_test!==true||!s.phones.length)return err('수신 번호를 저장하고 시험 문자 발송을 확인해 주세요.');
  if(await env.DB.prepare("SELECT id FROM parking_admin_sms WHERE mode='test' AND occurred_at>=datetime('now','-1 minute') LIMIT 1").first())return err('시험 문자는 1분 간격으로 보낼 수 있습니다.',429);
  const key=crypto.randomUUID();await env.DB.batch(s.phones.map(phone=>env.DB.prepare("INSERT INTO parking_admin_sms(receiver,mode,event_key,config_hash,occurred_at) VALUES(?,'test',?,?,?)").bind(phone,'test:'+key+':'+phone,s.hash,now())));
  await parkingAdminSMSTick(env);return json({ok:true});
 }
 if(path==='admin/payment-alerts/refresh'&&method==='POST'){await parkingAdminSMSTick(env);return json({ok:true});}
 return err('경로를 찾을 수 없습니다.',404);
}
