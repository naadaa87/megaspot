// Operator payment checklist. Does not create receipts, refunds, booking confirmations or messages.
import {json,err,readJson,now} from './_lib.js';
export const PAYMENT_CHECKS={unpaid:'입금 전',reservation_paid:'예약금 입금 완료',balance_paid:'잔금 입금 완료',fully_paid:'전액 입금 완료'};
const key=(kind,ref)=>kind+':'+ref;
const changed=r=>Number(r?.meta?.changes??r?.changes??0);
export function inferredPaymentCheck(item,settlement,legacy=false){
 const net=Number(settlement?.net)||0,amount=settlement?.amount??item.amount;
 if(net>0&&Number.isFinite(amount)&&amount>0&&net>=amount)return 'fully_paid';
 return net>0||legacy?'reservation_paid':'unpaid';
}
export async function paymentChecksFor(env,items,settlements={}){
 const out={},refs=[...new Set(items.map(x=>x.kind==='booking'?x.code:x.ref).filter(Boolean))],linked=[...new Set(items.map(x=>x.ref).filter(Boolean))],saved={},legacy={};
 for(let i=0;i<refs.length;i+=80){const group=refs.slice(i,i+80),{results}=await env.DB.prepare(`SELECT * FROM reservation_payment_checks WHERE target_ref IN (${group.map(()=>'?').join(',')})`).bind(...group).all();for(const r of results||[])saved[key(r.target_type,r.target_ref)]=r;}
 for(let i=0;i<linked.length;i+=80){const group=linked.slice(i,i+80),{results}=await env.DB.prepare(`SELECT ref,json_extract(checks,'$.deposit_paid') AS paid FROM inquiry_checks WHERE ref IN (${group.map(()=>'?').join(',')})`).bind(...group).all();for(const r of results||[])legacy[r.ref]=r.paid!=null&&r.paid!==false&&r.paid!==0&&r.paid!==''&&r.paid!=='0';}
 for(const item of items){const type=item.kind==='booking'?'booking':'inquiry',ref=type==='booking'?item.code:item.ref,row=saved[key(type,ref)],s=type==='booking'?settlements[item.code]:null;
  out[key(type,ref)]={payment_status:row?.status||inferredPaymentCheck(item,s,!!legacy[item.ref]),payment_revision:row?.version||0,payment_updated_at:row?.updated_at||'',payment_source:row?'manual':s?.net>0?'ledger':legacy[item.ref]?'legacy':'default'};
 }
 return out;
}
export async function reservationPaymentAdmin({env,request,path,method}){
 const m=path.match(/^reservation-payment-checks\/(booking|inquiry)\/([A-Z0-9-]{1,40})$/);if(!m)return null;
 if(method!=='PUT')return err('지원하지 않는 요청입니다.',405);
 const d=await readJson(request),type=m[1],ref=m[2],revision=d.expected_revision;
 if(!Object.hasOwn(PAYMENT_CHECKS,d.status)||!Number.isSafeInteger(revision)||revision<0)return err('결제 상태와 저장 버전을 확인해 주세요.');
 const table=type==='booking'?'bookings':'inquiries',column=type==='booking'?'booking_code':'ref',allowed=type==='booking'?"status IN ('confirmed','completed','payment_review')":"status NOT IN ('취소·환불','대기 취소','삭제됨')";
 const target=await env.DB.prepare(`SELECT status FROM ${table} WHERE ${column}=?`).bind(ref).first();if(!target)return err('예약 또는 문의를 찾을 수 없습니다.',404);
 const t=now();
 const write=env.DB.prepare(`INSERT INTO reservation_payment_checks(target_type,target_ref,status,version,updated_at)
  SELECT ?,?,?,1,? FROM ${table} WHERE ${column}=? AND ${allowed}
   AND (?=0 OR EXISTS(SELECT 1 FROM reservation_payment_checks WHERE target_type=? AND target_ref=? AND version=?))
  ON CONFLICT(target_type,target_ref) DO UPDATE SET status=excluded.status,version=reservation_payment_checks.version+1,updated_at=excluded.updated_at
  WHERE reservation_payment_checks.version=?`).bind(type,ref,d.status,t,ref,revision,type,ref,revision,revision);
 const audit=env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'reservation.payment_check',?,'admin',?,? WHERE changes()>0").bind(ref,JSON.stringify({target_type:type,status:d.status}),t);
 const results=await env.DB.batch([write,audit]);
 if(!changed(results[0]))return err('다른 관리자가 상태를 바꿨거나 취소된 건입니다. 새로고침 후 확인해 주세요.',409,'PAYMENT_CHECK_CHANGED');
 const row=await env.DB.prepare('SELECT * FROM reservation_payment_checks WHERE target_type=? AND target_ref=?').bind(type,ref).first();
 return json({ok:true,payment_status:row.status,payment_revision:row.version,payment_updated_at:row.updated_at,payment_source:'manual'});
}
