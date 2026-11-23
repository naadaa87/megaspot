import {inquiryReservationFeeSql,venuePaymentStatus,venueReservationFeeSql,venueTermsVersionSql} from './_venue_payment_terms.js';
import {FOOD_SPACE,foodEvent,foodPaymentStatus,foodEventSql} from './_food_booking.js';
// Operator payment scopes; optional cumulative receipts are committed with status in the booking ledger.
import {json,err,readJson,now} from './_lib.js';
import {completionScopeSql} from './_payment_completion_scope.js';
import {settlementsFor} from './_settlement.js';
import {paymentReceiptAdmin} from './_reservation_payment_receipt.js';
import {inquiryReceiptAdmin,inquiryReceiptBooking,inquirySettlement,inquirySettlements,inquiryReceiptHistory} from './_inquiry_receipts.js';
export const PAYMENT_CHECKS={unpaid:"입금 전",reservation_paid:"예약금 입금 완료",venue_paid:"대관비용 입금 완료",food_paid:"식음료 입금 완료",venue_fully_paid:"전체 입금 완료(대관)",fully_paid:"전체 입금 완료(대관+식음료)",partial_paid:"일부 입금·잔금 확인 필요",needs_review:"입금 범위 확인 필요"};
const FOOD_PENDING={unpaid:PAYMENT_CHECKS.unpaid,reservation_paid:PAYMENT_CHECKS.reservation_paid,partial_paid:'일부 입금'};
const key=(kind,ref)=>kind+':'+ref;
const changed=r=>Number(r?.meta?.changes??r?.changes??0);
export function inferredPaymentCheck(item,settlement,legacy=false){
 const net=Number(settlement?.net)||0,amount=settlement?.amount??item.amount;
 if(net>0&&Number.isFinite(amount)&&amount>0&&net>=amount)return item.completion_status||'needs_review';
 return legacy?'reservation_paid':net>0?'partial_paid':'unpaid';
}
export async function paymentChecksFor(env,items,settlements={}){
 const out={},refs=[...new Set(items.map(x=>x.kind==='booking'?x.code:x.ref).filter(Boolean))],linked=[...new Set(items.map(x=>x.ref).filter(Boolean))],saved={},legacy={},completion={};
 for(let i=0;i<refs.length;i+=80){const group=refs.slice(i,i+80),{results}=await env.DB.prepare(`SELECT * FROM reservation_payment_scopes_v2 WHERE target_ref IN (${group.map(()=>'?').join(',')})`).bind(...group).all();for(const r of results||[])saved[key(r.target_type,r.target_ref)]=r;}
 for(let i=0;i<linked.length;i+=80){const group=linked.slice(i,i+80),{results}=await env.DB.prepare(`SELECT ref,json_extract(checks,'$.deposit_paid') AS paid FROM inquiry_checks WHERE ref IN (${group.map(()=>'?').join(',')})`).bind(...group).all();for(const r of results||[])legacy[r.ref]=r.paid!=null&&r.paid!==false&&r.paid!==0&&r.paid!==''&&r.paid!=='0';}
 const pendingRefs=[...new Set(items.filter(x=>x.kind!=='booking'&&x.ref&&x.space_id!==FOOD_SPACE).map(x=>x.ref))],withFee=[];
 for(let i=0;i<pendingRefs.length;i+=80){
  const group=pendingRefs.slice(i,i+80);
  const {results}=await env.DB.prepare(`SELECT i.ref,${completionScopeSql('i.data','i.ref','NULL','NULL')} AS scope
    FROM inquiries i WHERE i.space_id<>? AND ${inquiryReservationFeeSql()}>0 AND i.ref IN (${group.map(()=>'?').join(',')})`).bind(FOOD_SPACE,...group).all();
  for(const row of results||[]){withFee.push(row.ref);completion[key('inquiry',row.ref)]=row.scope;}
 }
 const pendingMoney=await inquirySettlements(env,withFee);
 const bookingRefs=[...new Set(items.filter(x=>x.kind==='booking'&&x.code&&(!saved[key('booking',x.code)]||settlements[x.code]?.venue_reservation_fee>0)&&(settlements[x.code]?.net||0)>0).map(x=>x.code))];
 for(let i=0;i<bookingRefs.length;i+=80){
  const group=bookingRefs.slice(i,i+80);
  const {results}=await env.DB.prepare(`SELECT b.booking_code AS target_ref,${completionScopeSql()} AS scope
    FROM bookings b LEFT JOIN inquiries i ON i.ref=b.inquiry_ref WHERE b.booking_code IN (${group.map(()=>'?').join(',')})`).bind(...group).all();
  for(const row of results||[])completion[key('booking',row.target_ref)]=row.scope;
 }
 for(const item of items){const type=item.kind==='booking'?'booking':'inquiry',ref=type==='booking'?item.code:item.ref,row=saved[key(type,ref)],s=type==='booking'?settlements[item.code]:pendingMoney[ref];
  const scope=completion[key(type,ref)],fee=s?.venue_reservation_fee??s?.reservation_fee;
  const automatic=venuePaymentStatus(s,fee,scope);
  out[key(type,ref)]={payment_status:automatic||row?.status||inferredPaymentCheck({...item,completion_status:scope},s,!!legacy[item.ref]),payment_revision:row?.version||0,payment_updated_at:row?.updated_at||'',payment_source:automatic?'ledger':row?'manual':s?.net>0?'ledger':legacy[item.ref]?'legacy':'default'};
 }
 return out;
}
export async function reservationPaymentAdmin({env,request,path,method}){
 const m=path.match(/^reservation-payment-checks\/(booking|inquiry)\/([A-Z0-9-]{1,40})$/);if(!m)return null;
 if(m[1]==='inquiry'){const code=await inquiryReceiptBooking(env,m[2]);if(code){m[1]='booking';m[2]=code;}}
 if(method==='GET'){
  const type=m[1],ref=m[2],item=type==='booking'?await env.DB.prepare(`SELECT booking_code AS code,inquiry_ref AS ref,customer_name AS name,status,amount,space_id,${foodEventSql()} AS food_event,${venueReservationFeeSql()} AS venue_fee,${venueTermsVersionSql()} AS terms_version FROM bookings b WHERE booking_code=?`).bind(ref).first():await env.DB.prepare("SELECT ref,name,status,space_id,json_extract(data,'$.food_event') AS food_event,json_extract(data,'$.reservation_fee') AS venue_fee,COALESCE(json_extract(data,'$.reservation_fee_version'),0) AS terms_version FROM inquiries WHERE ref=?").bind(ref).first();
  if(!item)return err('예약 또는 문의를 찾을 수 없습니다.',404);
  item.kind=type==='booking'?'booking':'pending';
  const settlements=type==='booking'?await settlementsFor(env,[ref]):{},checks=await paymentChecksFor(env,[item],settlements);
  const foodOnly=item.space_id===FOOD_SPACE, result=checks[key(type,ref)],event=foodEvent(item.food_event)||{};
  if(foodOnly&&type==='booking')result.payment_status=foodPaymentStatus(settlements[ref],event,result.payment_status);
  const choices=foodOnly?{...FOOD_PENDING,...(type==='booking'?{food_paid:'잔금 입금 완료'}:{})}:PAYMENT_CHECKS;
  return json({ok:true,...result,food_only:foodOnly,reservation_fee:foodOnly?(event.reservation_fee??null):item.venue_fee,terms_version:foodOnly?null:item.terms_version,name:item.name||ref,settlement:type==='booking'?settlements[ref]:await inquirySettlement(env,ref),receipt_available:true,receipt_target:type+'/'+ref,entries:type==='inquiry'?await inquiryReceiptHistory(env,ref):(await env.DB.prepare('SELECT id,kind,amount,note,state,created_at,version FROM booking_payment_current WHERE booking_code=? ORDER BY id DESC LIMIT 30').bind(ref).all()).results||[],editable:type==='booking'?['confirmed','completed','payment_review'].includes(item.status):['문의 접수','조건 확인','견적 발송','결제 대기'].includes(item.status),choices});
 }
 if(method!=='PUT')return err('지원하지 않는 요청입니다.',405);
 const d=await readJson(request);if(d.status==='balance_paid')d.status='needs_review';const type=m[1],ref=m[2],revision=d.expected_revision;
 if(!Object.hasOwn(PAYMENT_CHECKS,d.status)||!Number.isSafeInteger(revision)||revision<0)return err('결제 상태와 저장 버전을 확인해 주세요.');
 const table=type==='booking'?'bookings':'inquiries',column=type==='booking'?'booking_code':'ref',allowed=type==='booking'?"status IN ('confirmed','completed','payment_review')":"status NOT IN ('취소·환불','대기 취소','삭제됨')";
 const target=await env.DB.prepare(`SELECT status,space_id FROM ${table} WHERE ${column}=?`).bind(ref).first();if(!target)return err('예약 또는 문의를 찾을 수 없습니다.',404);
 if(target.space_id===FOOD_SPACE&&type==='inquiry'&&(!Object.hasOwn(FOOD_PENDING,d.status)||d.received_total===undefined))return err('식음료 문의의 실제 입금액을 함께 입력해 주세요.');
 if(d.received_total!==undefined){return type==='booking'?paymentReceiptAdmin(env,ref,d):inquiryReceiptAdmin(env,ref,d);}
 const t=now();
 const write=env.DB.prepare(`INSERT INTO reservation_payment_scopes_v2(target_type,target_ref,status,version,updated_at)
  SELECT ?,?,?,1,? FROM ${table} WHERE ${column}=? AND ${allowed}
   AND (?=0 OR EXISTS(SELECT 1 FROM reservation_payment_scopes_v2 WHERE target_type=? AND target_ref=? AND version=?))
  ON CONFLICT(target_type,target_ref) DO UPDATE SET status=excluded.status,version=reservation_payment_scopes_v2.version+1,updated_at=excluded.updated_at
  WHERE reservation_payment_scopes_v2.version=?`).bind(type,ref,d.status,t,ref,revision,type,ref,revision,revision);
 const audit=env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'reservation.payment_check',?,'admin',?,? WHERE changes()>0").bind(ref,JSON.stringify({target_type:type,status:d.status}),t);
 const results=await env.DB.batch([write,audit]);
 if(!changed(results[0]))return err('다른 관리자가 상태를 바꿨거나 취소된 건입니다. 새로고침 후 확인해 주세요.',409,'PAYMENT_CHECK_CHANGED');
 const row=await env.DB.prepare('SELECT * FROM reservation_payment_scopes_v2 WHERE target_type=? AND target_ref=?').bind(type,ref).first();
 return json({ok:true,payment_status:row.status,payment_revision:row.version,payment_updated_at:row.updated_at,payment_source:'manual'});
}
