import { err, hasDb, json, log, now, randomToken, readJson } from '../_lib.js';
import {
  spacecloudLeaseKey as leaseKey, spacecloudReviewPrefix as reviewPrefix,
  spacecloudStatusKey as statusKey, requiresManualSpacecloudBlock, spacecloudRecord, spacecloudWorklist
} from '../_spacecloud_blocks.js';

// The bearer token only allows scheduling work on the current confirmed-booking worklist.
const phases = new Set(['ready','login_required','paused','budget_wait','review']);
const reasons = new Set(['conflict','unknown_result','host_unavailable','public_unverified','booking_changed']);
const leaseWhere = "key=? AND json_extract(value,'$.token')=?";
const currentLease = "SELECT 1 FROM settings WHERE "+leaseWhere;
const changes = result => Number(result?.meta?.changes ?? result?.changes);
function constantEqual(a,b) {
  let mismatch=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return mismatch===0;
}
async function getLease(env) {
  const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(leaseKey).first();
  return row?JSON.parse(row.value):null;
}
function clearLease(env,lease) {
  return env.DB.prepare('DELETE FROM settings WHERE '+leaseWhere).bind(leaseKey,lease.token);
}
function noteReview(env,lease,reason) {
  return env.DB.prepare(`INSERT INTO settings(key,value,updated_at)
    SELECT ?,?,? WHERE EXISTS(${currentLease})
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(reviewPrefix+lease.entry.id+':'+lease.entry.action,JSON.stringify({reason}),now(),leaseKey,lease.token);
}
async function claim(env,instant) {
  const old=await getLease(env);
  if(old?.expires>instant)return null;
  if(old)await env.DB.batch([noteReview(env,old,'unknown_result'),clearLease(env,old)]);
  const {items}=await spacecloudWorklist(env,instant);
  const pending=items.filter(x=>['block','release'].includes(x.action)&&!x.automation_review&&!x.automatic_processing
    &&!requiresManualSpacecloudBlock(x.product));
  const entry=pending.find(row=>row.action==='block')||pending[0];
  if(!entry)return null;
  const lease={token:randomToken(24),expires:instant+180000,entry};
  const result=await env.DB.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)')
    .bind(leaseKey,JSON.stringify(lease),now()).run();
  return changes(result)?lease:null;
}
async function reportStatus(env,phase,instant) {
  if(!phases.has(phase))return err('상태 값이 올바르지 않습니다.');
  await env.DB.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(statusKey,JSON.stringify({phase,at:instant}),now()).run();
  return json({ok:true});
}
export async function onRequest({env,request}) {
  if(request.method!=='POST')return err('지원하지 않는 방식입니다.',405);
  const secret=String(env.SPACECLOUD_WORKER_TOKEN||'');
  if(secret.length<32||!hasDb(env))return err('자동 연동이 연결되지 않았습니다.',503,'NOT_CONFIGURED');
  const auth=request.headers.get('authorization')||'';
  if(auth.length>256||!constantEqual(auth,'Bearer '+secret))return err('자동 작업 인증을 확인해 주세요.',401);
  let body;try{body=await readJson(request,4096);}catch{return err('요청 형식을 확인해 주세요.');}
  const instant=Date.now();
  if(body?.action==='status')return reportStatus(env,body.phase,instant);
  if(body?.action==='claim')return json({ok:true,job:await claim(env,instant)});
  if(!['check','complete','defer'].includes(body?.action))return err('지원하지 않는 작업입니다.');
  const lease=await getLease(env);
  if(!lease||lease.token!==body.token||lease.entry.id!==body.id||lease.expires<=instant)return err('자동 작업이 만료됐습니다.',409,'LEASE_LOST');
  const entry=lease.entry;
  if(body.action==='defer'){
    await clearLease(env,lease).run();
    return json({ok:true});
  }
  if(body.action==='check'){
    const {items}=await spacecloudWorklist(env,instant);
    if(!items.some(row=>row.id===entry.id&&row.action===entry.action))return err('예약 일정이 변경됐습니다.',409,'BOOKING_CHANGED');
    return json({ok:true});
  }
  if(body.result==='verified'){
    const state=entry.action==='block'?'blocked':'released';
    const receipts=await env.DB.batch([spacecloudRecord(env,entry,state,lease.token),clearLease(env,lease)]);
    if(!changes(receipts[1]))return err('자동 작업이 만료됐습니다.',409,'LEASE_LOST');
    await log(env,'spacecloud.'+state,entry.code,'system',{product:entry.product,date:entry.date,start:entry.start,end:entry.end});
    return json({ok:true});
  }
  if(body.result!=='review'||!reasons.has(body.reason))return err('작업 결과를 확인해 주세요.');
  await env.DB.batch([noteReview(env,lease,body.reason),clearLease(env,lease)]);
  return json({ok:true});
}
