import {now,sha256} from './_lib.js';
import {CUSTOMER_ALIMTALK as T} from './_customer_alimtalk_templates.js';

const normalized=value=>String(value||'').replace(/\r\n/g,'\n');
const utc=value=>Date.parse(String(value||'').replace(' ','T')+'Z');

export function customerFallback(subject,message,buttons=[]){
 const links=[...new Set(buttons.map(button=>button.linkMo||button.linkM).filter(Boolean))];
 return {failover:'Y',fsubject_1:subject,fmessage_1:[normalized(message),...links].join('\n')};
}

export async function approvedCustomerTemplate(env,provider,kind){
 const expected=T[kind];if(!expected)return null;
 for(const candidate of [expected,expected.fallback].filter(Boolean)){
  try{const approved=await approvedCandidate(env,provider,kind,candidate);if(approved)return approved;}catch(error){if(!expected.fallback)throw error;}
 }
 return null;
}
async function approvedCandidate(env,provider,kind,expected){
 const {code,content,buttons}=expected;
 const key='customer_alimtalk_ready:'+code;
 const signature=await sha256(JSON.stringify([env.ALIGO_SENDER_KEY,content,buttons]));
 const saved=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
 // Once approved, a transient template lookup outage must never downgrade delivery to direct SMS.
 if(saved?.value===signature)return expected;
 if(saved?.value===signature+':crlf')return {...expected,content:content.replace(/\n/g,'\r\n')};
 if(!provider)return null;
 const review=await reviewCustomerTemplate(env,provider,kind,expected);
 if(!review.ready)return null;
 const actual=review.template;
 await env.DB.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key)
  DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(key,signature+(actual.templtContent.includes('\r\n')?':crlf':''),now()).run();
 return {...expected,content:actual.templtContent};
}

export async function reviewCustomerTemplate(env,provider,kind,expected=T[kind]){
 const response=await provider('template/list',{tpl_code:expected.code});
 if(Number(response.code)!==0)throw Error('알림톡 승인 조회 실패');
 const template=(response.list||[]).find(item=>item.templtCode===expected.code);
 const buttons=template?.buttons||[];
 const matches=!!template&&template.senderKey===env.ALIGO_SENDER_KEY&&normalized(template.templtContent)===expected.content&&
  buttons.length===expected.buttons.length&&expected.buttons.every((button,i)=>
   button.name===buttons[i].name&&button.linkType===buttons[i].linkType&&
   button.linkMo===(buttons[i].linkMo||buttons[i].linkM)&&button.linkPc===(buttons[i].linkPc||buttons[i].linkP));
 return {code:expected.code,name:expected.name,review:template?.inspStatus||'missing',matches,
  ready:matches&&template.inspStatus==='APR'&&['A','R'].includes(template.status),template};
}

export async function customerTemplateStatus(env,provider){
 const entries=Object.keys(T),items=[];
 for(let index=0;index<entries.length;index+=4){
  const chunk=entries.slice(index,index+4);
  const results=await Promise.allSettled(chunk.map(kind=>reviewCustomerTemplate(env,provider,kind)));
  for(const [offset,entry] of results.entries()){
   const kind=chunk[offset];
   const item=entry.status==='fulfilled'?entry.value:{code:T[kind].code,review:'unavailable',matches:false,ready:false};
   items.push({kind,code:item.code,review:item.review,matches:item.matches,ready:item.ready});
  }
 }
 return items;
}

export async function customerFallbackResult(provider,detail,matchPhone,occurredAt){
 const expired=Date.now()-utc(occurredAt)>86400000;
 const smid=String(detail?.smid||'');
 if(/^\d{1,30}$/.test(smid)&&Number(smid)>0){
  let result;
  try{result=await provider('sms/detail',{mid:smid,page_size:'50'});}catch{}
  if(Number(result?.result_code)===1){
   for(const item of result.list||[]){
    if(!['SMS','LMS'].includes(item.type)||!/^20\d{2}-\d{2}-\d{2} /.test(item.send_date||'')||
       !item.sms_state||/중|대기|예약|접수/.test(item.sms_state)||!await matchPhone(item.receiver))continue;
    return item.sms_state==='발송완료'?{status:'delivered',note:'대체 문자 수신 성공',sms:true}:
     {status:'failed',note:'알림톡·대체 문자 전달 실패'};
   }
  }
 }
 return expired?{status:'unknown',note:'대체 문자 결과 확인 필요'}:{status:'accepted',note:'대체 문자 결과 대기'};
}
