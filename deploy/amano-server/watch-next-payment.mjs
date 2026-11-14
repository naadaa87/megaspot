import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {amanoStore} from './server.mjs';
import {runWatch} from './watch-next-batch.mjs';
import {auditBatch} from './audit-next-batch.mjs';
export const PAYMENT_WATCH_KEY='next-payment-immediate-watch';
const epoch=(v,zone='Z')=>v?Date.parse(String(v).replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(v)?'':zone)):NaN;
const seconds=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=b-2000?Math.max(0,Math.ceil((a-b)/1000)):null;
export function auditPayment(batch,operations={},journal={},at=Date.now()){
 const result=auditBatch(batch,operations,journal,at,{minVehicles:1,checkNotifications:false});
 if(!batch)return result;
 const paid=epoch(batch.paid_at);
 for(const item of result.batch.items){
  const proof=operations[item.oid]?.verification,raw=batch.items.find(p=>p.oid===item.oid);
  const checked=epoch(proof?.first_checked_at),entry=epoch(proof?.entry_at,'+09:00'),complete=epoch(proof?.completed_at);
  item.first_check_seconds=seconds(checked,paid);
  item.registration_seconds=seconds(complete,Math.max(paid,entry));
  item.registration_basis=entry>paid?'입차':'결제';
  item.wake_observed=proof?.first_trigger==='wake';
  item.immediate_check_verified=item.wake_observed&&item.first_check_seconds!==null&&item.first_check_seconds<=10;
  item.customer_applied_delivered=(raw.customer_notifications||[]).some(n=>n.kind==='applied'&&['delivered','sms_delivered'].includes(n.status));
  if(item.site_status==='applied'&&(item.first_check_seconds===null||item.registration_seconds===null)){
   result.problems.push(item.oid+': 결제·최초 확인·입차·등록 완료 시각 증빙 확인 필요');
   result.status='attention';
  }
 }
 return result;
}
export function paymentVerificationMessage(result,final=false){
 const ok=result.status==='verified',batch=result.batch,items=batch?.items||[];
 const lines=['[메가스팟 주차권 '+(ok?'검증 완료':'검증 확인 필요')+']'];
 if(batch){
  lines.push('주문: '+batch.oid,'차량 '+items.length+'대 · 결제 '+Number(batch.total).toLocaleString('ko-KR')+'원');
  for(const p of items){
   const good=p.site_status==='applied'&&p.free_first_verified;
   lines.push('끝'+p.plate_last4+' '+(good?'등록 완료 · '+(p.free_existing?'기존 무료 확인':'무료1시간 먼저')+' · '+Number(p.actual_cost).toLocaleString('ko-KR')+'원':p.site_status==='issue'?'등록 확인 필요':'완료 미확인'));
   if(p.first_check_seconds!==null&&p.first_check_seconds!==undefined)lines.push('확인 '+p.first_check_seconds+'초 · '+p.registration_basis+'→완료 '+(p.registration_seconds??'미확인')+'초'+(p.immediate_check_verified?' · 즉시 확인':' · 즉시 신호 미확인'));
  }
  if(ok)lines.push('아마노 이력·무료 우선·차감액·메가스팟 완료 대조 완료',items.every(p=>p.customer_applied_delivered)?'고객 등록 안내: 전달 확인':'고객 등록 안내: 전달 확인 중');
  else{lines.push(final?'해당 주문 최종 검증 결과입니다.':'중간 확인입니다. 처리가 끝나면 다시 안내합니다.');for(const p of (result.problems||[]).slice(0,2))lines.push(p.replace(/^MS[A-Z0-9]+: /,'').slice(0,62));}
 }else lines.push('검증 조회 반복 실패 · 서버 확인 필요');
 const link='https://megaspot.kr/admin/#parking';
 let message=lines.join('\n');
 if(message.length+link.length+1>600){
  // Keep every vehicle and exact timing in encrypted last_result. The SMS gives
  // all vehicle outcomes plus the longest observed latency within relay limits.
  const compact=items.map(p=>'끝'+p.plate_last4+' '+(p.site_status==='applied'&&p.free_first_verified?'완료·무료확인·'+Number(p.actual_cost).toLocaleString('ko-KR')+'원':'확인 필요'));
  const known=items.filter(p=>p.registration_seconds!==null&&p.registration_seconds!==undefined);
  message=[lines[0],lines[1],lines[2],...compact,known.length?'입차·결제 확인 후 등록 최대 '+Math.max(...known.map(p=>p.registration_seconds))+'초':'등록 시간 증빙 확인 필요',ok?'무료 우선·차감액·등록 완료 대조 완료':'상세 검증 결과 관리자 확인 필요'].join('\n');
 }
 if(message.length+link.length+1>600)throw Error('검증 결과 문자 길이 확인 필요');
 return message+'\n'+link;
}
export function runPaymentWatch(options){return runWatch({...options,key:PAYMENT_WATCH_KEY,action:'audit-payment',audit:auditPayment,message:paymentVerificationMessage});}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const dir=process.env.AMANO_STATE_DIR||'/var/lib/megaspot-amano';
 if(!existsSync(dir+'/setup-key.pem'))throw Error('Existing encrypted state required');
 const store=amanoStore(dir,process.env.ALIGO_RELAY_SECRET),config=store.read('next-payment-watch-config');
 if(!config?.since)throw Error('Next real payment watch must be explicitly armed');
 const r=await runPaymentWatch({env:process.env,store,since:config.since});console.log(JSON.stringify(r));if(!r.ok)process.exitCode=1;
}
