// Retry only explicitly selected reads. Discount writes must never use this helper.
export const READ_ATTEMPTS=3,FAILURE_CYCLES=3;
export function transientReadError(error){
 const codes=['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET'];
 return ['TimeoutError','AbortError'].includes(error?.name)||codes.includes(error?.code)||codes.includes(error?.cause?.code)||/fetch failed|failed to fetch|network error|aborted due to timeout|HTTP (?:429|5\d\d)\b/i.test(error?.message||'');
}
export async function retryRead(read,{sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(let attempt=1;;attempt++){
  try{return await read();}catch(error){if(!transientReadError(error)||attempt>=READ_ATTEMPTS)throw error;await sleep(attempt===1?1000:3000);}
 }
}
export function readRecovered(store,scope){
 const health=store.read('read-health')||{},prior=health[scope];
 if(prior?.failures){health[scope]={...prior,failures:0,recovered_at:new Date().toISOString()};store.save('read-health',health);}
}
export function readFailed(store,scope,at=Date.now()){
 const health=store.read('read-health')||{},prior=health[scope],failures=(prior?.failures||0)+1;
 health[scope]={failures,first_failed_at:prior?.failures?prior.first_failed_at:new Date(at).toISOString(),last_failed_at:new Date(at).toISOString()};store.save('read-health',health);
 return {failures,notify:failures>=FAILURE_CYCLES,scope,incident:health[scope].first_failed_at};
}
export async function guardedRead(store,scope,label,read,options){
 try{const value=await retryRead(read,options);readRecovered(store,scope);return value;}
 catch(error){
  if(!transientReadError(error))throw error;
  const state=readFailed(store,scope),reason=error.name==='TimeoutError'||/timeout/i.test(error.message)?'응답 시간 초과':'일시적인 통신 오류';
  const deferred=new Error(label+'가 연속 '+FAILURE_CYCLES+'회 실패했습니다. ('+reason+')',{cause:error});
  Object.assign(deferred,{readDeferred:true,...state,scope});throw deferred;
 }
}
export function fallbackIssues(store){
 const active=Object.entries(store.read('operations')||{}).filter(([,e])=>!['completed','review'].includes(e.phase));
 if(active.length)return active.map(([oid])=>({oid,kind:'registration',message:'서버 처리 응답을 확인하지 못했습니다. 기존 할인 이력을 확인해 주세요.'}));
 const state=readFailed(store,'local-service');return state.notify?[{kind:'query',scope:state.scope,incident:state.incident,message:'자동 등록 서버 연결이 연속 '+FAILURE_CYCLES+'회 실패했습니다. 서비스 상태를 확인해 주세요.'}]:[];
}
