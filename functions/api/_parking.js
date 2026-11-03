import { HOLIDAYS } from './_catalog.js';
import { str, isDate, kstToday, now, json, err, readJson, log } from './_lib.js';
export const TICKETS = {
 '1h': {label:'1시간권', hours:1, price:4000},
 '2h': {label:'2시간권', hours:2, price:8000},
 '3h': {label:'3시간권', hours:3, price:12000},
 daily: {label:'일일권', hours:null, price:30000}
};
export function parkingDate(date){const day=new Date(date+'T12:00:00+09:00').getUTCDay();return isDate(date)&&day!==0&&day!==6&&!HOLIDAYS[date];}
export function arrivalWindow(ms=Date.now()){
 const date=new Date(ms+9*3600e3).toISOString(),minutes=+date.slice(11,13)*60+ +date.slice(14,16);
 return parkingDate(date.slice(0,10))&&minutes>=600&&minutes<1070;
}
export const POLICY = 'parking-20261103-v2';
export const DAILY_BASES = {
 calendar:'이용일 당일 23:59까지(한국시간). 입차 후 24시간권이 아닙니다.',
 '24h':'입차 시각부터 24시간(한국시간 기준).',
 other:'별도 이용시간 기준.'
};
export function plateOf(value) {
 const plate=String(value||'').normalize('NFKC').replace(/[\s-]/g,'');
 // Full ordinary, rental, electric and older regional plates. Exceptions go through customer support.
 return /^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/.test(plate)?plate:null;
}
export function parkingInput(d,options={}){
 const ticket=typeof d.ticket==='string'&&Object.hasOwn(TICKETS,d.ticket)?TICKETS[d.ticket]:null,plate=plateOf(d.plate),date=str(d.date,10);
 if(d.ticket==='daily'&&!options.dailyAllowed)return {error:'일일권의 종료 시각·재입차 조건을 주차장에 확인 중입니다. 카카오톡으로 문의해 주세요.'};
 if(!ticket)return {error:'주차권을 선택해 주세요.'};
 if(d.ticket==='daily'&&d.agree_daily!==true)return {error:'일일권 종료 기준과 익일·초과 정산 조건을 확인해 주세요.'};
 if(!plate)return {error:'차량번호 전체를 확인해 주세요. 예: 123가4567'};
 if(plateOf(d.plate_confirm)!==plate)return {error:'다시 입력한 차량번호가 일치하지 않습니다.'};
 if(!isDate(date)||date<kstToday()||date>new Date(Date.now()+366*86400000).toISOString().slice(0,10))return {error:'이용일을 확인해 주세요.'};
 if(!parkingDate(date))return {error:'주차 등록은 평일에만 가능합니다. 주말·공휴일 이용은 카카오톡으로 먼저 문의해 주세요.'};
 if(d.policy!==POLICY||d.agree_privacy!==true||d.agree_terms!==true||d.agree_refund!==true||d.confirmed!==true)return {error:'구매 내용과 이용·취소 안내를 확인해 주세요.'};
 const name=str(d.name,40),phone=str(d.phone,30).replace(/\D/g,'');
 if(!name||!/^01\d{8,9}$/.test(phone))return {error:'이름과 휴대폰 번호를 확인해 주세요.'};
 return {ticket:d.ticket,plate,date,name,phone,...ticket};
}
const safe=s=>{try{return JSON.parse(s||'{}');}catch{return {};}};
export async function parkingSettings(env){
 const row=await env.DB.prepare("SELECT value FROM settings WHERE key='parking'").first();
 const v=safe(row?.value);
 // Venue operator confirmed midnight expiry on 2026-11-03. This does not enable sales.
 const basis=typeof v.daily_basis==='string'&&Object.hasOwn(DAILY_BASES,v.daily_basis)?v.daily_basis:'calendar',details=str(v.daily_details??v.daily_terms,240),rollover=str(v.daily_rollover,160);
 const terms=DAILY_BASES[basis]+' '+details+' 익일·초과 정산: '+rollover;
 return {enabled:v.enabled===true,daily_enabled:v.daily_enabled===true&&basis!=='unconfirmed'&&!!details&&!!rollover,daily_basis:basis,daily_details:details,daily_rollover:rollover,daily_terms:terms,service_hours:'평일 10:00–18:00 (주말·공휴일 제외)',processing_notice:'입차 알림 후 최대 10분 이내 처리합니다. 당일 등록 접수는 17:50까지이며, 사전 결제만으로 할인이 적용되지 않습니다.'};
}
export const JOIN = `SELECT p.*,o.price,o.status AS payment_status,o.buyer_name,o.buyer_phone,o.paid_at,
 s.entry_id,s.entry_at,s.free_external,s.free_order,
 (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid=p.oid) AS refunded_amount
 FROM parking_orders p JOIN orders o ON o.oid=p.oid LEFT JOIN parking_sessions s ON s.id=p.session_id`;
export function publicParking(p){
 return {oid:p.oid,plate:p.plate,visit_date:p.visit_date,ticket:p.ticket,ticket_label:TICKETS[p.ticket]?.label||p.ticket,daily_terms:p.daily_terms,price:p.price,
 payment_status:p.payment_status,refunded_amount:p.refunded_amount,status:p.status,arrival_at:p.arrival_at,applied_at:p.applied_at,
 refund_requested_at:p.refund_requested_at,refund_reviewed_at:p.refund_reviewed_at,created_at:p.created_at};
}
function integer(v,max){return v!==''&&v!==null&&v!==undefined&&/^\d+$/.test(String(v))&&Number.isSafeInteger(+v)&&+v<=max?+v:null;}
export async function parkingAdmin(request,env,path){
 const method=request.method;
 if(path==='admin/settings'){
  if(method==='GET')return json({ok:true,...await parkingSettings(env)});
  if(method!=='PUT')return err('지원하지 않는 요청입니다.',405);
  const d=await readJson(request),prior=await parkingSettings(env),value={...prior,enabled:d.enabled===true,daily_enabled:d.daily_enabled===undefined?prior.daily_enabled:d.daily_enabled===true,daily_basis:d.daily_basis===undefined?prior.daily_basis:d.daily_basis,daily_details:d.daily_details===undefined?prior.daily_details:str(d.daily_details,240),daily_rollover:d.daily_rollover===undefined?prior.daily_rollover:str(d.daily_rollover,160)};
  const policyChanged=['daily_enabled','daily_basis','daily_details','daily_rollover','daily_terms'].some(k=>d[k]!==undefined);
  if(value.daily_enabled&&(!Object.hasOwn(DAILY_BASES,value.daily_basis||'')||!value.daily_details||!value.daily_rollover||policyChanged&&d.confirm_daily!==true))return err('확인된 종료 기준과 재입차·익일 추가 구매 안내를 입력하고 해당 조건으로 판매함을 확인해 주세요.');
  value.daily_terms=Object.hasOwn(DAILY_BASES,value.daily_basis||'')?DAILY_BASES[value.daily_basis]+' '+value.daily_details+' 익일·초과 정산: '+value.daily_rollover:'';
  if(value.enabled&&(!value.service_hours||!value.processing_notice))return err('판매 시작 전에 등록 처리 시간과 예상 소요 안내를 입력해 주세요.');
  await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES('parking',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(value),now()).run();
  await log(env,'parking.settings','parking','admin',{enabled:value.enabled,daily_enabled:value.daily_enabled,daily_basis:value.daily_basis,confirmed_daily:policyChanged&&d.confirm_daily===true});return json({ok:true,...value});
 }
 if(path==='admin/count'&&method==='GET'){
  const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM parking_orders p JOIN orders o ON o.oid=p.oid WHERE o.status='paid' AND (p.status<>'applied' OR (p.refund_requested_at IS NOT NULL AND p.refund_reviewed_at IS NULL))").first();return json({ok:true,count:r?.n||0});
 }
 if(path==='admin/orders'&&method==='GET'){
  const q=new URL(request.url).searchParams,filter=q.get('filter')||'queue',needle=str(q.get('q'),60),date=str(q.get('date'),10);
  let sql=JOIN+' WHERE 1=1',args=[];
  if(filter==='queue')sql+=" AND o.status='paid' AND (p.status<>'applied' OR (p.refund_requested_at IS NOT NULL AND p.refund_reviewed_at IS NULL))";
  if(filter==='arrived')sql+=" AND o.status='paid' AND p.arrival_at IS NOT NULL AND p.status<>'applied'";
  if(filter==='applied')sql+=" AND p.status='applied'";
  if(needle){sql+=' AND (p.plate LIKE ? OR o.buyer_name LIKE ? OR p.oid LIKE ?)';args.push('%'+needle+'%','%'+needle+'%','%'+needle+'%');}
  if(date&&isDate(date)){sql+=' AND p.visit_date=?';args.push(date);}
  const {results}=await env.DB.prepare(sql+' ORDER BY CASE WHEN p.refund_requested_at IS NOT NULL AND p.refund_reviewed_at IS NULL THEN 0 WHEN p.status=\'processing\' THEN 1 WHEN p.arrival_at IS NOT NULL THEN 2 ELSE 3 END,p.created_at LIMIT 200').bind(...args).all();
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM parking_orders p JOIN orders o ON o.oid=p.oid WHERE o.status='paid' AND (p.status<>'applied' OR (p.refund_requested_at IS NOT NULL AND p.refund_reviewed_at IS NULL))").first();
  return json({ok:true,items:(results||[]).map(p=>({...publicParking(p),name:p.buyer_name,phone:p.buyer_phone,entry_id:p.entry_id,entry_at:p.entry_at,free_hours:p.free_hours,paid_hours:p.paid_hours,cost:p.cost,memo:p.memo,refund_reason:p.refund_reason,session_id:p.session_id,free_external:p.free_external})),count:count?.n||0});
 }
 const m=path.match(/^admin\/orders\/([A-Z0-9]+)\/(claim|complete|issue|reset|refund-reviewed)$/);
 if(!m||method!=='POST')return err('경로를 찾을 수 없습니다.',404);
 const p=await env.DB.prepare(JOIN+' WHERE p.oid=?').bind(m[1]).first();if(!p)return err('주차 주문을 찾을 수 없습니다.',404);
 const d=await readJson(request),t=now(),memo=str(d.memo,1000),action=m[2];
 if(action==='claim'){
  if(p.payment_status!=='paid'||p.refunded_amount>0)return err('정상 결제가 완료된 주문만 등록할 수 있습니다.',409);
  if(!['waiting','requested'].includes(p.status)||p.refund_requested_at&&!p.refund_reviewed_at)return err('등록 상태 또는 취소 요청을 먼저 확인해 주세요.',409);
  const entry=str(d.entry_id,80),rawAt=str(d.entry_at,19),entryAt=rawAt.replace('T',' ').slice(0,16);
  if(!Number.isFinite(Date.parse(entryAt.replace(' ','T')+':00+09:00'))||!isDate(entryAt.slice(0,10))||entryAt.slice(0,10)>kstToday()||!/^[\w-]{1,80}$/.test(entry)||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(entryAt)||!d.confirm_entry||plateOf(d.plate_confirm)!==p.plate)return err('아마노 입차ID·입차시각·차량번호를 대조하고 확인해 주세요.');
  const overnight=entryAt.slice(0,10)<p.visit_date;
  if(entryAt.slice(0,10)>p.visit_date||overnight&&(p.visit_date>kstToday()||d.confirm_overnight!==true))return err('입차일과 이용일이 다릅니다. 익일 추가 구매 건은 이용일 당일부터 연속 주차와 해당 날짜의 등록 가능 여부를 확인하고 처리해 주세요.',409);
  const claimMemo=overnight?('익일 연속 주차 · '+p.visit_date+' 이용분 등록 가능 확인. '+memo).slice(0,1000):memo;
  const found=await env.DB.prepare('SELECT * FROM parking_sessions WHERE entry_id=?').bind(entry).first();
  if(found&&(found.plate!==p.plate||found.entry_at!==entryAt))return err('같은 입차ID에 다른 차량·입차시각이 연결되어 있습니다. 아마노 기록을 다시 확인해 주세요.',409);
  const sql=(s,...a)=>env.DB.prepare(s).bind(...a);
  try{await env.DB.batch([
   sql('INSERT OR IGNORE INTO parking_sessions(entry_id,plate,entry_at,free_external,created_at) VALUES(?,?,?,?,?)',entry,p.plate,entryAt,d.free_used?1:0,t),
   sql("UPDATE parking_orders SET session_id=(SELECT id FROM parking_sessions WHERE entry_id=? AND plate=? AND entry_at=?),status='processing',memo=?,updated_at=? WHERE oid=? AND status IN ('waiting','requested') AND (refund_requested_at IS NULL OR refund_reviewed_at IS NOT NULL) AND EXISTS(SELECT 1 FROM orders WHERE oid=? AND status='paid') AND NOT EXISTS(SELECT 1 FROM payapp_refunds WHERE oid=?) AND EXISTS(SELECT 1 FROM parking_sessions WHERE entry_id=? AND plate=? AND entry_at=?)",entry,p.plate,entryAt,claimMemo,t,p.oid,p.oid,p.oid,entry,p.plate,entryAt),
   sql("UPDATE parking_sessions SET free_external=1 WHERE entry_id=? AND free_order IS NULL AND ?=1 AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=? AND status='processing' AND session_id=parking_sessions.id)",entry,d.free_used?1:0,p.oid),
   sql("UPDATE parking_sessions SET free_order=? WHERE entry_id=? AND free_order IS NULL AND free_external=0 AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=? AND status='processing' AND ticket<>'daily' AND session_id=parking_sessions.id)",p.oid,entry,p.oid),
   sql("UPDATE parking_orders SET free_hours=CASE WHEN ticket<>'daily' AND (SELECT free_order FROM parking_sessions WHERE id=session_id)=oid THEN 1 ELSE 0 END,paid_hours=CASE WHEN ticket='daily' THEN 0 ELSE hours-CASE WHEN (SELECT free_order FROM parking_sessions WHERE id=session_id)=oid THEN 1 ELSE 0 END END WHERE oid=? AND status='processing'",p.oid)
  ]);}catch(e){if(/UNIQUE/.test(String(e)))return err('같은 입차 건을 다른 주문에서 처리 중입니다. 완료 후 다시 시도해 주세요.',409);throw e;}
  const after=await env.DB.prepare('SELECT p.status,p.session_id,s.entry_id FROM parking_orders p LEFT JOIN parking_sessions s ON s.id=p.session_id WHERE p.oid=?').bind(p.oid).first();
  if(after.status!=='processing'||!after.session_id||after.entry_id!==entry)return err('다른 요청에서 상태가 변경되었습니다. 새로고침해 주세요.',409);
 }else if(action==='complete'){
  const cost=integer(d.cost,1000000);
  if(p.status!=='processing'||p.payment_status!=='paid'||p.refunded_amount>0||!d.confirm_applied)return err('아마노의 실제 등록 성공 내역과 결제 상태를 확인해 주세요.',409);
  if(cost===null)return err('실제 차감 원가를 입력해 주세요. 무료 등록만 한 경우 0원입니다.');
  const result=await env.DB.prepare("UPDATE parking_orders SET status='applied',cost=?,memo=?,applied_at=?,updated_at=? WHERE oid=? AND status='processing' AND EXISTS(SELECT 1 FROM orders WHERE oid=? AND status='paid') AND NOT EXISTS(SELECT 1 FROM payapp_refunds WHERE oid=?)").bind(cost,memo,t,t,p.oid,p.oid,p.oid).run();
  if(!result.meta?.changes)return err('결제 또는 처리 상태가 변경되었습니다.',409);
 }else if(action==='issue'){
  if(!['processing','waiting','requested'].includes(p.status)||!memo)return err('확인 필요 사유를 입력해 주세요.');
  await env.DB.prepare("UPDATE parking_orders SET status='issue',memo=?,updated_at=? WHERE oid=? AND status=?").bind(memo,t,p.oid,p.status).run();
 }else if(action==='reset'){
  if(!['processing','issue'].includes(p.status)||!d.confirm_not_applied||!memo)return err('아마노에 전혀 적용되지 않았음을 확인하고 사유를 입력해 주세요.');
  await env.DB.batch([
   env.DB.prepare("UPDATE parking_sessions SET free_order=NULL WHERE free_order=? AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=? AND status IN ('processing','issue'))").bind(p.oid,p.oid),
   env.DB.prepare("UPDATE parking_orders SET status=CASE WHEN arrival_at IS NULL THEN 'waiting' ELSE 'requested' END,session_id=NULL,free_hours=0,paid_hours=0,memo=?,updated_at=? WHERE oid=? AND status IN ('processing','issue')").bind(memo,t,p.oid)
  ]);
 }else{
  if(!memo||!p.refund_requested_at)return err('취소 요청 검토 결과를 메모로 남겨 주세요.');
  await env.DB.prepare('UPDATE parking_orders SET refund_reviewed_at=?,memo=?,updated_at=? WHERE oid=?').bind(t,memo,t,p.oid).run();
 }
 await log(env,'parking.'+action,p.oid,'admin',{memo,entry_id:action==='claim'?str(d.entry_id,80):p.entry_id});
 return json({ok:true});
}
