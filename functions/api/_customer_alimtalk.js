import {now,sha256} from './_lib.js';
import {CUSTOMER_ALIMTALK as T} from './_customer_alimtalk_templates.js';

const normalized=value=>String(value||'').replace(/\r\n/g,'\n');
const utc=value=>Date.parse(String(value||'').replace(' ','T')+'Z');

export function customerFallback(subject,message,buttons=[]){
 const links=[...new Set(buttons.map(button=>button.linkMo||button.linkM).filter(Boolean))];
 return {failover:'Y',fsubject_1:subject,fmessage_1:[normalized(message),...links].join('\n')};
}

export async function approvedCustomerTemplate(env,provider,kind){
 const expected=T[kind];
 if(!expected)return null;
 const {code,content,buttons}=expected;
 const key='customer_alimtalk_ready:'+code;
 const signature=await sha256(JSON.stringify([env.ALIGO_SENDER_KEY,content,buttons]));
 const saved=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
 // Once approved, a transient template lookup outage must never downgrade delivery to direct SMS.
 if(saved?.value===signature)return expected;
 if(saved?.value===signature+':crlf')return {...expected,content:content.replace(/\n/g,'\r\n')};
 if(!provider)return null;
 const response=await provider('template/list',{tpl_code:code});
 if(Number(response.code)!==0)throw Error('알림톡 승인 조회 실패');
 const actual=(response.list||[]).find(item=>item.templtCode===code);
 if(actual?.inspStatus!=='APR'||!['A','R'].includes(actual.status))return null;
 const actualButtons=actual.buttons||[];
 if(normalized(actual.templtContent)!==content||actualButtons.length!==buttons.length||
  !buttons.every((button,i)=>button.name===actualButtons[i].name&&button.linkType===actualButtons[i].linkType&&
   button.linkMo===(actualButtons[i].linkMo||actualButtons[i].linkM)&&button.linkPc===(actualButtons[i].linkPc||actualButtons[i].linkP)))
  throw Error('승인된 알림톡 본문이나 버튼을 확인해 주세요.');
 await env.DB.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key)
  DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(key,signature+(actual.templtContent.includes('\r\n')?':crlf':''),now()).run();
 return {...expected,content:actual.templtContent};
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
