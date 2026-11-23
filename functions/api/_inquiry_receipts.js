import {json,err,now,str} from './_lib.js';
import {inquiryAmountSql} from './_amounts.js';
import {refundAmountSql} from './_payapp_refund_history.js';
import {S,settlementFor} from './_settlement.js';
import {paymentReceiptAdmin} from './_reservation_payment_receipt.js';
export const inquiryLedger=ref=>'inquiry:'+ref;
const pending="i.status IN ('문의 접수','조건 확인','견적 발송','결제 대기')";
const noBooking="NOT EXISTS(SELECT 1 FROM bookings active WHERE active.inquiry_ref=i.ref AND active.status<>'cancelled')";
const owner="('inquiry:'||i.ref)";
const manual=kind=>`(SELECT COALESCE(SUM(p.amount),0) FROM booking_payment_current p WHERE p.booking_code=${owner} AND p.state='active' AND p.kind='${kind}')`;
const online=field=>`(SELECT COALESCE(SUM(${field}),0) FROM orders o WHERE o.inquiry_ref=i.ref AND o.booking_code IS NULL AND o.test=0 AND o.status IN ('paid','refunded'))`;
const gross=online('o.price'),refunds=online(refundAmountSql('o'));
export const inquiryReceiptRevisionSql=()=>`json_array('inquiry',i.ref,CAST(${inquiryAmountSql()} AS INTEGER),${manual('receipt')},${manual('refund')},${gross},${refunds},(SELECT COALESCE(MAX(id),0) FROM booking_payment_revisions WHERE booking_code=${owner}),i.status,(SELECT booking_code FROM inquiry_payment_owners WHERE inquiry_ref=i.ref))`;
export async function inquiryReceiptBooking(env,ref){
 const linked=await env.DB.prepare('SELECT booking_code FROM inquiry_payment_owners WHERE inquiry_ref=?').bind(ref).first();if(linked?.booking_code)return linked.booking_code;
 const {results}=await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref=? AND status<>'cancelled' LIMIT 2").bind(ref).all();return results?.length===1?results[0].booking_code:null;
}
export async function inquirySettlement(env,ref){
 const item=await env.DB.prepare(`SELECT i.status AS inquiry_status,i.space_id, json_extract(i.data,'$.food_event.reservation_fee') AS reservation_fee,${inquiryAmountSql()} AS amount,${manual('receipt')} AS manual_received,${manual('refund')} AS manual_refunded,${gross} AS pg_received,${refunds} AS pg_refunded,${inquiryReceiptRevisionSql()} AS revision FROM inquiries i WHERE i.ref=?`).bind(ref).first();
 if(!item)return null;
 return {...S.calculate({amount:item.amount,received:item.manual_received+item.pg_received,refunded:item.manual_refunded+item.pg_refunded}),...item,inquiry_status:item.inquiry_status};
}
export async function inquiryReceiptHistory(env,ref){return (await env.DB.prepare('SELECT id,kind,amount,note,state,created_at,version FROM booking_payment_current WHERE booking_code=? ORDER BY id DESC LIMIT 30').bind(inquiryLedger(ref)).all()).results||[];}
async function result(env,ref,added,duplicate=false){
 const code=await inquiryReceiptBooking(env,ref);
 if(code){const row=await env.DB.prepare("SELECT status,version,updated_at FROM reservation_payment_scopes_v2 WHERE target_type='booking' AND target_ref=?").bind(code).first();return json({ok:true,duplicate,receipt_added:duplicate?0:added,payment_status:row?.status||'reservation_paid',payment_revision:row?.version||0,payment_updated_at:row?.updated_at||'',payment_source:'manual',receipt_target:'booking/'+code,booking_code:code,settlement:await settlementFor(env,code)});}
 const row=await env.DB.prepare("SELECT * FROM reservation_payment_scopes_v2 WHERE target_type='inquiry' AND target_ref=?").bind(ref).first();return json({ok:true,duplicate,receipt_added:duplicate?0:added,payment_status:row.status,payment_revision:row.version,payment_updated_at:row.updated_at,payment_source:'manual',settlement:await inquirySettlement(env,ref)});
}
export async function inquiryReceiptAdmin(env,ref,d){
 const linked=await inquiryReceiptBooking(env,ref);if(linked)return paymentReceiptAdmin(env,linked,d);
 const ledger=inquiryLedger(ref),id=str(d.request_id,80),total=d.received_total,note=str(d.receipt_note,300);
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||!Number.isSafeInteger(total)||total<0||total>1e9||typeof d.expected_settlement_revision!=='string')return err('누적 입금액과 수납 저장 정보를 확인해 주세요.');
 const existing=await env.DB.prepare('SELECT * FROM reservation_payment_receipt_requests WHERE booking_code=? AND request_id=?').bind(ledger,id).first();
 if(existing){if(existing.status!==d.status||existing.received_total!==total||existing.note!==note)return err('다른 수납 요청에 사용된 번호입니다.',409,'PAYMENT_CONFLICT');return result(env,ref,0,true);}
 if(await env.DB.prepare('SELECT id FROM booking_payment_entries WHERE booking_code=? AND request_id=?').bind(ledger,id).first())return err('이미 사용한 수납 요청번호입니다.',409,'PAYMENT_CONFLICT');
 const s=await inquirySettlement(env,ref);if(!s)return err('문의를 찾을 수 없습니다.',404);
 if(!['문의 접수','조건 확인','견적 발송','결제 대기'].includes(s.inquiry_status))return err('문의 진행 상태나 연결된 예약을 확인해 주세요.',409,'PAYMENT_CHANGED');
 if(s.revision!==d.expected_settlement_revision)return err('수납이나 문의 금액이 바뀌었습니다. 최신 내역을 확인해 주세요.',409,'PAYMENT_CHANGED');
 if(total<s.received)return err('등록된 누적 입금액보다 작습니다. 기존 수납·환불 내역을 확인해 주세요.');
 if(s.space_id==='food-only'&&d.status==='reservation_paid'&&total-s.refunded<Math.max(1,s.reservation_fee||0))
  return err('실제 수납액이 예약금 약정액에 도달했는지 확인해 주세요.');
 if(['fully_paid','venue_fully_paid'].includes(d.status)&&(s.amount==null||total-s.refunded<s.amount))return err('전체 입금 완료는 견적 금액이 정해지고 잔금이 0원일 때 선택해 주세요.');
 if(typeof env.DB.batch!=='function')return err('수납과 상태의 일괄 저장을 지원하지 않습니다.',503);
 const time=now(),added=total-s.received,guard=`i.ref=? AND ${pending} AND ${noBooking} AND ${inquiryReceiptRevisionSql()}=? AND COALESCE((SELECT version FROM reservation_payment_scopes_v2 WHERE target_type='inquiry' AND target_ref=i.ref),0)=?`;
 const statements=[
  env.DB.prepare(`INSERT OR IGNORE INTO inquiry_payment_owners(inquiry_ref,ledger_code,created_at) SELECT i.ref,${owner},? FROM inquiries i WHERE ${guard}`).bind(time,ref,d.expected_settlement_revision,d.expected_revision),
  env.DB.prepare(`INSERT OR IGNORE INTO reservation_payment_receipt_requests(booking_code,request_id,status,received_total,added,note,payment_revision,settlement_revision,created_at) SELECT ${owner},?,?,?,?,?,?,?,? FROM inquiries i WHERE ${guard} AND EXISTS(SELECT 1 FROM inquiry_payment_owners WHERE inquiry_ref=i.ref AND booking_code IS NULL)`).bind(id,d.status,total,added,note,d.expected_revision,d.expected_settlement_revision,time,ref,d.expected_settlement_revision,d.expected_revision),
  env.DB.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) SELECT booking_code,request_id,'receipt',added,?,created_at FROM reservation_payment_receipt_requests WHERE booking_code=? AND request_id=? AND added>0 AND changes()>0").bind(str('문의 예약금 · 누적 이용료 '+total.toLocaleString('ko-KR')+'원'+(note?' · '+note:''),300),ledger,id),
  env.DB.prepare(`INSERT INTO reservation_payment_scopes_v2(target_type,target_ref,status,version,updated_at) SELECT 'inquiry',i.ref,?,1,? FROM inquiries i WHERE i.ref=? AND EXISTS(SELECT 1 FROM reservation_payment_receipt_requests WHERE booking_code=${owner} AND request_id=? AND payment_revision=?) ON CONFLICT(target_type,target_ref) DO UPDATE SET status=excluded.status,version=reservation_payment_scopes_v2.version+1,updated_at=excluded.updated_at WHERE reservation_payment_scopes_v2.version=?`).bind(d.status,time,ref,id,d.expected_revision,d.expected_revision),
  env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'inquiry.payment.receipt',?,'admin',?,? WHERE changes()>0").bind(ref,JSON.stringify({status:d.status,received_total:total,receipt_added:added,request_id:id}),time)
 ];
 const out=await env.DB.batch(statements),saved=await env.DB.prepare('SELECT * FROM reservation_payment_receipt_requests WHERE booking_code=? AND request_id=?').bind(ledger,id).first();
 if(!saved){const moved=await inquiryReceiptBooking(env,ref);if(moved)return paymentReceiptAdmin(env,moved,d);return err('문의가 확정되었거나 수납이 변경됐습니다. 최신 내역을 확인해 주세요.',409,'PAYMENT_CHANGED');}
 if(saved.status!==d.status||saved.received_total!==total||saved.note!==note)return err('다른 수납 요청에 사용된 번호입니다.',409,'PAYMENT_CONFLICT');
 return result(env,ref,added,!(out[1]?.meta?.changes??out[1]?.changes));
}
