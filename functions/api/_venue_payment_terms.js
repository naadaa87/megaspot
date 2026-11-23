import {FOOD_SPACE} from './_food_booking.js';
import {err,json,log,now,readJson} from './_lib.js';

const open = "status IN ('문의 접수','조건 확인','견적 발송','결제 대기')";
const revisionSql = "COALESCE(json_extract(data,'$.reservation_fee_version'),0)";
export const inquiryReservationFeeSql = (alias='i')=>`json_extract(${alias}.data,'$.reservation_fee')`;
export const venueTermsKeySql = (alias='b')=>`'venue_payment_terms:'||${alias}.booking_code`;
export const venueReservationFeeSql = (alias='b')=>`CASE WHEN EXISTS(SELECT 1 FROM settings WHERE key=${venueTermsKeySql(alias)})
  THEN (SELECT json_extract(value,'$.reservation_fee') FROM settings WHERE key=${venueTermsKeySql(alias)})
  ELSE (SELECT ${inquiryReservationFeeSql()} FROM inquiries i WHERE i.ref=${alias}.inquiry_ref) END`;
export const venueTermsVersionSql = (alias='b')=>`COALESCE((SELECT json_extract(value,'$.version') FROM settings WHERE key=${venueTermsKeySql(alias)}),
  (SELECT COALESCE(json_extract(data,'$.reservation_fee_version'),0) FROM inquiries WHERE ref=${alias}.inquiry_ref),0)`;

export function venuePaymentStatus(settlement,fee,complete){
  if(!(fee>0)||!settlement)return null;
  if(settlement.review_required)return 'needs_review';
  if(!(settlement.net>0))return 'unpaid';
  if(settlement.amount>0&&settlement.balance===0)return complete||'needs_review';
  return settlement.net>=fee?'reservation_paid':'partial_paid';
}

export async function venuePaymentTerms({env,request,path,method}){
  const match=path.match(/^reservation-payment-terms\/(booking|inquiry)\/([A-Z0-9-]{1,40})$/);
  if(!match)return null;
  if(method!=='PUT')return err('지원하지 않는 요청입니다.',405);
  const [,type,ref]=match,{reservation_fee:fee,version}=await readJson(request);
  if((fee!==null&&(!Number.isSafeInteger(fee)||fee<1||fee>1e9))||!Number.isSafeInteger(version)||version<0)return err('예약금 약정액과 저장 버전을 확인해 주세요.');
  const time=now();
  const write=type==='booking'?env.DB.prepare(`INSERT INTO settings(key,value,updated_at)
    SELECT ${venueTermsKeySql()},json_object('reservation_fee',?,'version',?),?
    FROM bookings b WHERE b.booking_code=? AND b.space_id<>? AND b.status IN ('confirmed','completed','payment_review') AND ${venueTermsVersionSql()}=?
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(fee,version+1,time,ref,FOOD_SPACE,version):
    env.DB.prepare(`UPDATE inquiries SET data=json_set(data,'$.reservation_fee',?,'$.reservation_fee_version',?),updated_at=?
    WHERE ref=? AND space_id<>? AND ${open} AND ${revisionSql}=?
    AND NOT EXISTS(SELECT 1 FROM bookings WHERE inquiry_ref=inquiries.ref AND status<>'cancelled')`).bind(fee,version+1,time,ref,FOOD_SPACE,version);
  const audit=env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'reservation.deposit_terms',?,'admin',?,? WHERE changes()>0")
    .bind(ref,JSON.stringify({target:type,reservation_fee:fee}),time);
  const [result]=await env.DB.batch([write,audit]);
  if(!(result.meta?.changes??result.changes))return err('예약이나 약정액이 변경되었습니다. 최신 내용을 다시 확인해 주세요.',409,'PAYMENT_TERMS_CHANGED');
  return json({ok:true,reservation_fee:fee,version:version+1});
}
