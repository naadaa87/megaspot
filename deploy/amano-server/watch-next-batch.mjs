import {createHmac,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {amanoStore} from './server.mjs';
import {parkingSite} from './site.mjs';
import {auditBatch} from './audit-next-batch.mjs';

const KEY='next-batch-watch',LINK='https://megaspot.kr/admin/#parking';
const label=t=>({'1h':'1시간권','2h':'2시간권','3h':'3시간권',daily:'일일권'})[t]||'주차권';
const idFor=s=>{const h=createHash('sha256').update('parking-watch-v1:'+s).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
export function verificationMessage(result,final=false){
 const ok=result.status==='verified',items=result.batch?.items||[];
 const lines=['[메가스팟 주차권 '+(ok?'검증 완료':'검증 확인 필요')+']'];
 if(result.batch){
  lines.push('통합주문: '+result.batch.oid,'차량 '+items.length+'대 · 결제 '+Number(result.batch.total).toLocaleString('ko-KR')+'원');
  for(const p of items)lines.push('끝'+p.plate_last4+' '+label(p.ticket)+': '+(p.site_status==='applied'&&p.free_first_verified?(p.free_existing?'기존 무료 확인':'무료1시간 먼저')+' · 차감 '+Number(p.actual_cost).toLocaleString('ko-KR')+'원':p.site_status==='issue'?'등록 확인 필요':'완료 미확인'));
  if(ok)lines.push('아마노·메가스팟 등록 완료','고객 결제·등록 안내: 전달 확인','관리자 결제 문자: 두 번호 전달 확인','아마노 총 차감: '+items.reduce((n,p)=>n+p.actual_cost,0).toLocaleString('ko-KR')+'원');
  else{lines.push(final?'해당 주문의 최종 확인 결과입니다.':'중간 확인입니다. 남은 처리·전달 결과를 계속 확인합니다.');for(const p of (result.problems||[]).slice(0,2))lines.push(p.replace(/^MS[A-Z0-9]+: /,'').slice(0,72));}
 }else lines.push('검증 조회가 반복 실패해 결과를 확인할 수 없습니다.','기존 자동 등록과 별도로 검증 서버 상태를 확인해 주세요.');
 lines.push(LINK);const msg=lines.join('\n');if(msg.length>600)throw Error('검증 결과 문자 길이 확인 필요');return msg;
}

export async function runWatch({env,store,since,site=(action,data)=>parkingSite(env.ALIGO_RELAY_SECRET,action,data),upstream=fetch,at=Date.now()}){
 let s=store.read(KEY)||{version:1,since,phase:'watching',messages:{},errors:0};
 if(!/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(since||'')||s.since!==since)throw Error('검증 시작 시각 변경은 허용하지 않습니다.');
 if(s.phase==='completed')return {ok:true,phase:'completed',target:s.target};
 const receivers=[...new Set((env.ALIGO_PARKING_ADMIN_RECEIVERS||'').split(',').map(x=>x.trim()))];
 if(receivers.length!==2||receivers.some(x=>!/^01[016789]\d{7,8}$/.test(x))||!['1886','9580'].every(t=>receivers.some(x=>x.endsWith(t))))throw Error('승인된 두 관리자 수신 설정 확인 필요');
 if(String(env.ALIGO_RELAY_SECRET||'').length<32)throw Error('기존 서버 연결 설정 확인 필요');
 const save=()=>store.save(KEY,s);
 const enqueue=(kind,result,final=false)=>{
  for(const receiver of receivers){const key=kind+':'+receiver;if(!s.messages[key])s.messages[key]={key,receiver,message:verificationMessage(result,final),request_id:idFor(since+':'+(s.target||'system')+':'+key),status:'queued',attempts:0};}
  save();
 };
 let result=null;
 if(!s.final_kind){
  try{
   const data=await site('audit-batch',{since,...(s.target?{oid:s.target}:{})});
   if(!data.ok)throw Error('검증 응답 확인 필요');
   if(s.target&&!data.batch)throw Error('선택한 통합 주문 조회 미확인');
   if(data.batch){if(s.target&&s.target!==data.batch.oid)throw Error('다른 통합 주문으로 검증 대상이 바뀌었습니다.');s.target=data.batch.oid;}
   result=auditBatch(data.batch,store.read('operations')||{},store.read('alert-journal')||{},at);
   s.errors=0;delete s.error;s.last_result=result;s.checked_at=new Date(at).toISOString();
   const final=result.status==='verified'||result.status==='attention'&&!result.pending;
   if(final){s.final_kind=result.status==='verified'?'verified':'final_attention';s.phase='reporting';enqueue(s.final_kind,result,true);}
   else if(result.status==='attention')enqueue('attention',result,false);
   save();
  }catch{s.errors=(s.errors||0)+1;s.error='다음 통합 주문 검증 조회 실패';s.checked_at=new Date(at).toISOString();if(s.errors>=3)enqueue('system',{status:'attention'});save();}
 }
 async function rpc(path,data,id){const body=JSON.stringify({path,data,request_id:id,time:Date.now()});const r=await upstream('http://127.0.0.1:8787/v1/aligo',{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':createHmac('sha256',env.ALIGO_RELAY_SECRET).update(body).digest('hex')},body,redirect:'manual',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('문자 결과 확인 필요');return r.json();}
 // A stable request ID is durably saved before every provider call. The relay's
 // SQLite reservation prevents a second send even after an ambiguous response.
 for(const m of Object.values(s.messages)){
  if(m.status==='sending'){m.status='unknown';save();}
  if(m.status==='queued'||m.status==='unknown'&&m.attempts<3&&at-(m.updated_at||0)>=60000){
   m.status='sending';m.attempts++;m.updated_at=at;save();
   try{const r=await rpc('parking-admin/send',{receiver:m.receiver,msg:m.message},m.request_id);if(Number(r.result_code)!==1){m.status='failed';m.error='알리고 접수 거절';}else if(r.msg_id&&Number(r.success_cnt)===1&&Number(r.error_cnt)===0){m.status='accepted';m.mid=String(r.msg_id);delete m.error;}else{m.status='unknown';m.error='문자 접수 결과 불명';}}catch{m.status='unknown';m.error='접수 불명 · 동일 요청 ID로만 확인';}save();
  }
  if(m.status==='accepted'&&at-(m.last_check||m.updated_at||0)>=15000){
   m.last_check=at;save();
   try{const r=await rpc('sms/detail',{mid:m.mid,page_size:'50'},idFor('result:'+m.request_id+':'+at));if(Number(r.result_code)===1){const x=(r.list||[]).find(x=>String(x.receiver||'').replace(/\D/g,'')===m.receiver);if(x&&/^20\d{2}-\d{2}-\d{2} /.test(x.send_date||'')&&!/중|대기|예약|접수/.test(x.sms_state||'')){m.status=x.sms_state==='발송완료'?'delivered':'failed';m.error=m.status==='failed'?'문자 전달 실패':'';}}}catch{}save();
  }
 }
 if(s.final_kind){const finalMessages=Object.values(s.messages).filter(m=>m.key.startsWith(s.final_kind+':'));if(finalMessages.length===2&&finalMessages.every(m=>m.status==='delivered')){s.phase='completed';s.completed_at=new Date(at).toISOString();save();}}
 return {ok:!s.error,phase:s.phase,target:s.target||null,result_status:s.last_result?.status||null,error:s.error||null,reports:Object.values(s.messages).map(m=>({kind:m.key.split(':')[0],receiver_last4:m.receiver.slice(-4),status:m.status}))};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const since=process.argv.find(x=>x.startsWith('--since='))?.slice(8),dir=process.env.AMANO_STATE_DIR||'/var/lib/megaspot-amano';
 if(!existsSync(dir+'/setup-key.pem'))throw Error('Existing encrypted state required');
 const r=await runWatch({env:process.env,store:amanoStore(dir,process.env.ALIGO_RELAY_SECRET),since});console.log(JSON.stringify(r));if(!r.ok)process.exitCode=1;
}
