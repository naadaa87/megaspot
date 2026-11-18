import {json,err,now,str} from './_lib.js';
import {settlementFor,settlementRevisionSql,paymentConfirmation,paymentDocumentStatements} from './_settlement.js';
import {confirmationSourceSQL} from './_confirmation_auto.js';
const changed=r=>Number(r?.meta?.changes??r?.changes??0);
async function result(env,code,added,duplicate=false){
 const row=await env.DB.prepare("SELECT * FROM reservation_payment_scopes_v2 WHERE target_type='booking' AND target_ref=?").bind(code).first();
 return json({ok:true,duplicate,receipt_added:duplicate?0:added,payment_status:row.status,payment_revision:row.version,payment_updated_at:row.updated_at,payment_source:'manual',settlement:await settlementFor(env,code)});
}
export async function paymentReceiptAdmin(env,code,d){
 const id=str(d.request_id,80),total=d.received_total,note=str(d.receipt_note,300);
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||!Number.isSafeInteger(total)||total<0||total>1e9||typeof d.expected_settlement_revision!=='string')return err('누적 입금액과 수납 저장 정보를 확인해 주세요.');
 const existing=await env.DB.prepare('SELECT * FROM reservation_payment_receipt_requests WHERE booking_code=? AND request_id=?').bind(code,id).first();
 if(existing){if(existing.status!==d.status||existing.received_total!==total||existing.note!==note)return err('다른 수납 요청에 사용된 번호입니다.',409,'PAYMENT_CONFLICT');return result(env,code,0,true);}
 if(await env.DB.prepare('SELECT id FROM booking_payment_entries WHERE booking_code=? AND request_id=?').bind(code,id).first())return err('다른 수납 기록에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');
 const settlement=await settlementFor(env,code);if(!settlement)return err('예약을 찾을 수 없습니다.',404);
 if(!['confirmed','completed','payment_review'].includes(settlement.booking_status))return err('취소된 예약은 입금을 추가할 수 없습니다.',409,'PAYMENT_CHANGED');
 if(d.expected_settlement_revision!==settlement.revision)return err('수납 내역이 바뀌었습니다. 최신 내역을 확인한 뒤 다시 저장해 주세요.',409,'PAYMENT_CHANGED');
 if(total<settlement.received)return err('기존 누적 입금액보다 작습니다. 잘못된 기록 정정이나 실제 환불은 수납·환불 기록에서 처리해 주세요.');
 if(['fully_paid','venue_fully_paid'].includes(d.status)&&settlement.amount!=null&&total-settlement.refunded<settlement.amount)return err('전체 입금 완료로 저장하려면 환불 반영 후 남은 잔금이 0원이어야 합니다. 실제 누적 입금액이나 결제 상태를 확인해 주세요.');
 if(typeof env.DB.batch!=='function')return err('수납과 상태의 일괄 저장을 지원하지 않습니다.',503);
 const added=total-settlement.received,time=now(),prepared=added>0?await paymentConfirmation(env,code,settlement,added,0,time):null;
 const writes=[
  env.DB.prepare(`INSERT OR IGNORE INTO reservation_payment_receipt_requests(booking_code,request_id,status,received_total,added,note,payment_revision,settlement_revision,created_at)
   SELECT b.booking_code,?,?,?,?,?,?,?,? FROM bookings b WHERE b.booking_code=? AND b.status IN ('confirmed','completed','payment_review') AND ${settlementRevisionSql()}=?
   AND COALESCE((SELECT version FROM reservation_payment_scopes_v2 WHERE target_type='booking' AND target_ref=b.booking_code),0)=?${prepared?` AND ${confirmationSourceSQL}=?`:''}`)
   .bind(id,d.status,total,added,note,d.expected_revision,d.expected_settlement_revision,time,code,d.expected_settlement_revision,d.expected_revision,...(prepared?[prepared.revision]:[])),
  env.DB.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) SELECT booking_code,request_id,'receipt',added,?,created_at FROM reservation_payment_receipt_requests WHERE booking_code=? AND request_id=? AND added>0 AND changes()>0")
   .bind(str('결제 상태 변경 · 누적 이용료 '+total.toLocaleString('ko-KR')+'원'+(note?' · '+note:''),300),code,id),
  ...(added>0?paymentDocumentStatements(env,code,id,'entry',prepared,time):[]),
  env.DB.prepare(`INSERT INTO reservation_payment_scopes_v2(target_type,target_ref,status,version,updated_at)
   SELECT 'booking',b.booking_code,?,1,? FROM bookings b WHERE b.booking_code=? AND EXISTS(SELECT 1 FROM reservation_payment_receipt_requests WHERE booking_code=b.booking_code AND request_id=? AND payment_revision=?)
   ON CONFLICT(target_type,target_ref) DO UPDATE SET status=excluded.status,version=reservation_payment_scopes_v2.version+1,updated_at=excluded.updated_at WHERE reservation_payment_scopes_v2.version=?`)
   .bind(d.status,time,code,id,d.expected_revision,d.expected_revision),
  env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'reservation.payment_check',?,'admin',?,? WHERE changes()>0").bind(code,JSON.stringify({status:d.status,received_total:total,receipt_added:added,request_id:id}),time),
  env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'booking.payment.receipt',?,'admin',?,? WHERE changes()>0 AND ?>0").bind(code,JSON.stringify({amount:added,request_id:id,source:'payment_scope'}),time,added)
 ];
 const results=await env.DB.batch(writes),saved=await env.DB.prepare('SELECT * FROM reservation_payment_receipt_requests WHERE booking_code=? AND request_id=?').bind(code,id).first();
 if(!saved)return err('수납이나 결제 상태가 바뀌었습니다. 최신 내역을 확인해 주세요.',409,'PAYMENT_CHANGED');
 if(saved.status!==d.status||saved.received_total!==total||saved.note!==note)return err('다른 수납 요청에 사용된 번호입니다.',409,'PAYMENT_CONFLICT');
 return result(env,code,added,!changed(results[0]));
}
