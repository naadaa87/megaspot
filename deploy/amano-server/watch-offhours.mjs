import {pathToFileURL} from 'node:url';
import {existsSync,writeFileSync} from 'node:fs';
import {amanoStore} from './server.mjs';
import {runWatch} from './watch-next-batch.mjs';
import {auditBatch} from './audit-next-batch.mjs';
import {auditPayment} from './watch-next-payment.mjs';
export const OFFHOURS_KEY='next-offhours-watch',OFFHOURS_CONFIG='offhours-watch-config';
const delivered=s=>['delivered','sms_delivered'].includes(s);
export function auditOffhours(batch,operations={},journal={},at=Date.now()){
 const result=auditBatch(batch,operations,journal,at,{minVehicles:1,checkNotifications:'registration'});
 if(!batch)return result;
 const timing=auditPayment(batch,operations,journal,at);
 for(const item of result.batch.items){const t=timing.batch.items.find(p=>p.oid===item.oid),raw=batch.items.find(p=>p.oid===item.oid);Object.assign(item,{offhours_reason:raw.offhours_reason||'',registration_seconds:t.registration_seconds,customer_applied_delivered:(raw.customer_notifications||[]).some(n=>n.kind==='applied'&&delivered(n.status))});}
 result.problems=[...new Set([...result.problems,...timing.problems])];
 if(!result.batch.items.some(p=>p.offhours_reason))result.problems.push('새벽·공휴일의 실제 입차·등록 대상인지 확인 필요');
 if(result.problems.length)result.status='attention';
 return result;
}
export function offhoursMessage(result,final=false){
 const ok=result.status==='verified',batch=result.batch,items=batch?.items||[],lines=['[메가스팟 주차권 '+(ok?'검증 완료':'검증 확인 필요')+']','새벽·공휴일 실주문 검증'];
 if(batch){
  lines.push('주문: '+batch.oid+' · '+items.length+'대');
  const reasons=[...new Set(items.map(p=>p.offhours_reason).filter(Boolean))];if(reasons.length)lines.push('대상: '+reasons.join('·'));
  for(const p of items)lines.push('끝'+p.plate_last4+' '+(p.site_status==='applied'&&p.free_first_verified?(p.free_existing?'기존 무료 1시간 확인':'무료 1시간 먼저')+' · 차감 '+Number(p.actual_cost).toLocaleString('ko-KR')+'원':'등록 확인 필요'));
  if(ok){lines.push('아마노 이력·차감·메가스팟 반영 확인','고객 등록 안내: 전달 완료','관리자 결제 문자: 두 번호 전달 완료');const times=items.map(p=>p.registration_seconds).filter(Number.isFinite);if(times.length)lines.push('입차·결제 확인 후 등록 최대 '+Math.max(...times)+'초');}
  else{lines.push(final?'해당 실주문 최종 검증 결과입니다.':'중간 확인입니다. 처리·전달 결과를 계속 확인합니다.');for(const p of (result.problems||[]).slice(0,2))lines.push(p.replace(/^MS[A-Z0-9]+: /,'').slice(0,60));}
 }else lines.push('검증 조회가 반복 실패했습니다. 서버 확인이 필요합니다.');
 const message=lines.join('\n')+'\nhttps://megaspot.kr/admin/#parking';if(message.length>600)throw Error('검증 결과 문자 길이 확인 필요');return message;
}
export function runOffhoursWatch(options){return runWatch({...options,key:OFFHOURS_KEY,action:'audit-offhours',audit:auditOffhours,message:offhoursMessage});}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const dir=process.env.AMANO_STATE_DIR||'/var/lib/megaspot-amano';if(!existsSync(dir+'/setup-key.pem'))throw Error('Existing encrypted state required');
 const store=amanoStore(dir,process.env.ALIGO_RELAY_SECRET),config=store.read(OFFHOURS_CONFIG);if(!config?.since)throw Error('Offhours watch must be explicitly armed');
 const result=await runOffhoursWatch({env:process.env,store,since:config.since});
 if(result.phase==='completed')writeFileSync(dir+'/offhours-watch.done',new Date().toISOString(),{mode:0o600});
 console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}
