import {json,err,readJson,str,now,log,randomToken,isDate} from './_lib.js';
import {S,settlementFor,settlementRevisionSql} from './_settlement.js';
import {bookingAmountSql} from './_amounts.js';
import {publicDoc,confirmToken} from './_confirm.js';

const parse=x=>{try{return JSON.parse(x);}catch{return null;}};
export function cancellationPolicy(date,at){
 return S.cancellationPolicy(date,at);
}
export async function cancellationState(env,code){
 const row=await env.DB.prepare('SELECT s.revision,s.document,r.terms,r.created_at FROM booking_cancellation_state s JOIN booking_cancellation_revisions r ON r.id=s.revision AND r.booking_code=s.booking_code WHERE s.booking_code=?').bind(code).first();
 return row?{version:row.revision,terms:parse(row.terms),document:parse(row.document),created_at:row.created_at}:null;
}
export function cancellationDocument(row,state,settlement){
 const issued=state?.document||{};
 return {...issued,doc_type:'cancellation',customer:issued.customer||row.customer_name||'',show_amount:issued.show_amount!==false,amount:settlement.amount,amount_note:'취소 정산',paid:settlement.net,pay_status:settlement.status,settlement,deposit:null,items:[],food_services:[],reception:null,refund:[],note:'예약이 취소되었습니다. 이 문서는 취소 수수료와 이용료 환불 정산을 안내하며, 공간 이용을 확정하지 않습니다. 반환 보증금은 별도 정산합니다.'};
}
const stale=()=>err('예약·수납·취소 정산이 변경됐습니다. 최신 내역을 다시 확인해 주세요.',409,'PAYMENT_CHANGED');
export async function cancellationAdmin({env,request,path,method,url}){
 const m=path.match(/^bookings\/([A-Z0-9-]+)\/cancellation(?:\/(document))?$/);if(!m)return null;
 const code=m[1],row=await env.DB.prepare(`SELECT b.*,${bookingAmountSql()} AS effective_amount FROM bookings b WHERE booking_code=?`).bind(code).first();if(!row)return err('예약을 찾을 수 없습니다.',404);
 const state=await cancellationState(env,code),settlement=await settlementFor(env,code);
 if(method==='GET'&&!m[2]){
  const history=(await env.DB.prepare('SELECT id,previous_version,terms,created_at FROM booking_cancellation_revisions WHERE booking_code=? ORDER BY id DESC LIMIT 50').bind(code).all()).results||[];
  const doc=state&&row.status==='cancelled'?cancellationDocument(row,state,settlement):null;
  return json({ok:true,booking:{code,name:row.customer_name,date:row.date,status:row.status,amount:row.effective_amount},version:state?.version||0,terms:state?.terms||null,settlement,history:history.map(r=>({...r,terms:parse(r.terms)})),preview:doc?publicDoc(row,doc):null,issued:!!state?.document?.issued_at});
 }
 if(method!=='POST')return err('지원하지 않는 요청입니다.',405);
 const d=await readJson(request),id=str(d.request_id,80);
 if(m[2]){
  if(row.status!=='cancelled'||!state)return err('먼저 취소 수수료와 환불 기준을 저장해 주세요.',409,'NO_CANCELLATION');
  if(d.expected_revision!==settlement.revision||d.expected_version!==state.version)return stale();
  const previous=state.document||{},t=now(),document={issued_at:previous.issued_at||t,updated_at:t,issue_no:(previous.issue_no||0)+1,show_amount:d.show_amount===undefined?previous.show_amount!==false:d.show_amount!==false,customer:previous.customer||row.customer_name};
  const result=await env.DB.prepare(`UPDATE booking_cancellation_state SET document=? WHERE booking_code=? AND revision=? AND EXISTS(SELECT 1 FROM bookings b WHERE booking_code=? AND status='cancelled' AND ${settlementRevisionSql()}=?)`).bind(JSON.stringify(document),code,state.version,code,settlement.revision).run();
  if(!(result.meta?.changes??result.changes))return stale();
  const fresh=await settlementFor(env,code);if(fresh.revision!==settlement.revision)return stale();
  await log(env,'booking.cancellation.document',code,'admin',{version:state.version,issue_no:document.issue_no});
  const base=env.SITE_URL||(/\.pages\.dev$/.test(url.hostname)?'https://megaspot.kr':url.origin),link=base+'/confirm/?c='+encodeURIComponent(code)+'&k='+await confirmToken(env,code);
  return json({ok:true,doc:publicDoc(row,cancellationDocument(row,{...state,document},fresh)),link});
 }
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(id))return err('저장 요청번호를 확인해 주세요.');
 const previous=await env.DB.prepare('SELECT terms FROM booking_cancellation_revisions WHERE booking_code=? AND request_id=?').bind(code,id).first();
 const reason=str(d.reason,500),at=String(d.cancelled_at||''),mode=d.mode;
 const original=state?.terms,basis=original?original.basis_net:Math.max(0,settlement.net),eligible=original?.basis_eligible??Math.min(basis,row.effective_amount==null?basis:row.effective_amount);
 if(!['policy','full','manual'].includes(mode)||!reason||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(at)||!isDate(at.slice(0,10))||!Number.isFinite(Date.parse(at))||Date.parse(at)>Date.now()+60000)return err('취소 접수 시각·정산 방식·사유를 확인해 주세요.');
 const policy=cancellationPolicy(row.date,at),refundRate=mode==='full'?10000:mode==='policy'?policy.rate:null;
 const fee=mode==='manual'?Number(d.fee):eligible-Math.round(eligible*refundRate/10000);
 const limit=mode==='manual'?(original?.basis_received??settlement.received):basis;
 if(!Number.isSafeInteger(fee)||fee<0||fee>limit)return err('수수료는 정산 기준으로 받은 이용료 이내의 정수로 입력해 주세요.');
 const signature={mode,cancelled_at:new Date(at).toISOString(),fee,reason};
 if(previous){const saved=parse(previous.terms);if(JSON.stringify(saved?.request)!==JSON.stringify(signature))return err('다른 취소 정산에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');return json({ok:true,duplicate:true,settlement});}
 if(d.expected_revision!==settlement.revision||d.expected_version!==(state?.version||0))return stale();
 if(!state&&settlement.net<0)return err('환불액이 수납액보다 많습니다. 수납·환불 기록을 먼저 확인해 주세요.',409,'PAYMENT_REVIEW');
 const t=now(),terms={...signature,request:signature,policy_version:'megaspot-refund-20261103',policy_label:mode==='policy'?policy.label+' · '+refundRate/100+'% 환불':mode==='full'?'전액 환불 · 수수료 없음':'별도 합의 수수료',refund_rate:refundRate,original_amount:original?original.original_amount:row.effective_amount,basis_received:original?.basis_received??settlement.received,basis_refunded:original?.basis_refunded??settlement.refunded,basis_net:basis,basis_eligible:eligible};
 const previousDoc=state?.document||parse(row.confirm_doc)||{},published=previousDoc.issued_at?JSON.stringify({issued_at:state?.document?.issued_at||t,updated_at:t,issue_no:(state?.document?.issue_no||0)+1,show_amount:previousDoc.show_amount!==false,customer:previousDoc.customer||row.customer_name}):null;
 const version=state?.version||0,financial=settlement.revision,token=randomToken();
 // The serialized revision includes the current terms version; stale writes never change status or publish a new plan.
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO booking_cancellation_revisions(booking_code,request_id,previous_version,terms,created_at,processing_token) SELECT booking_code,?,?,?,?,? FROM bookings b WHERE booking_code=? AND ${settlementRevisionSql()}=? AND COALESCE((SELECT revision FROM booking_cancellation_state WHERE booking_code=b.booking_code),0)=?`).bind(id,version,JSON.stringify(terms),t,token,code,financial,version),
  env.DB.prepare('INSERT INTO booking_cancellation_state(booking_code,revision,document) SELECT booking_code,id,? FROM booking_cancellation_revisions WHERE booking_code=? AND request_id=? AND processing_token=? ON CONFLICT(booking_code) DO UPDATE SET revision=excluded.revision,document=excluded.document').bind(published,code,id,token),
  env.DB.prepare("UPDATE bookings SET status='cancelled',confirm_doc=NULL,updated_at=? WHERE booking_code=? AND EXISTS(SELECT 1 FROM booking_cancellation_revisions WHERE booking_code=? AND request_id=? AND processing_token=?)").bind(t,code,code,id,token),
  env.DB.prepare("DELETE FROM calendar_blocks WHERE memo=? AND EXISTS(SELECT 1 FROM booking_cancellation_revisions WHERE booking_code=? AND request_id=? AND processing_token=?)").bind('예약 '+code,code,id,token),
  env.DB.prepare("UPDATE inquiries SET status='취소·환불',updated_at=? WHERE ref=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE inquiry_ref=inquiries.ref AND status<>'cancelled') AND EXISTS(SELECT 1 FROM booking_cancellation_revisions WHERE booking_code=? AND request_id=? AND processing_token=?)").bind(t,row.inquiry_ref||'',code,id,token)
 ]);
 const saved=await env.DB.prepare('SELECT id,terms,processing_token FROM booking_cancellation_revisions WHERE booking_code=? AND request_id=?').bind(code,id).first();if(!saved)return stale();
 if(JSON.stringify(parse(saved.terms)?.request)!==JSON.stringify(signature))return err('다른 취소 정산에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');
 if(saved.processing_token!==token)return json({ok:true,duplicate:true,settlement:await settlementFor(env,code),version:saved.id});
 await log(env,'booking.cancellation.saved',row.inquiry_ref||code,'admin',{booking_code:code,version:saved.id,fee,mode,reason});return json({ok:true,settlement:await settlementFor(env,code),version:saved.id});
}
