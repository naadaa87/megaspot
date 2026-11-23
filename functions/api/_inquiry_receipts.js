import {FOOD_SPACE,foodReservationDepositError} from './_food_booking.js';
import {json,err,now,str,readJson} from './_lib.js';
import {inquiryAmountSql} from './_amounts.js';
import {refundAmountSql,onlinePaymentsFor} from './_payapp_refund_history.js';
import {S,settlementFor} from './_settlement.js';
import {paymentReceiptAdmin} from './_reservation_payment_receipt.js';
export const inquiryLedger=ref=>'inquiry:'+ref;
const pendingStatuses=['문의 접수','조건 확인','견적 발송','결제 대기'];
const refundStatuses=['취소·환불','대기 취소'];
const statusFilter=statuses=>`i.status IN (${statuses.map(status=>"'"+status+"'").join(',')})`;
const pending=statusFilter(pendingStatuses),refundable=statusFilter(refundStatuses);
const scopeVersion="COALESCE((SELECT version FROM reservation_payment_scopes_v2 WHERE target_type='inquiry' AND target_ref=i.ref),0)";
const inquiryFee="CASE WHEN i.space_id='food-only' THEN json_extract(i.data,'$.food_event.reservation_fee') ELSE json_extract(i.data,'$.reservation_fee') END";
const noBooking="NOT EXISTS(SELECT 1 FROM bookings active WHERE active.inquiry_ref=i.ref AND active.status<>'cancelled')";
const owner="('inquiry:'||i.ref)";
const manual=kind=>`(SELECT COALESCE(SUM(p.amount),0) FROM booking_payment_current p WHERE p.booking_code=${owner} AND p.state='active' AND p.kind='${kind}')`;
const online=field=>`(SELECT COALESCE(SUM(${field}),0) FROM orders o WHERE o.inquiry_ref=i.ref AND o.booking_code IS NULL AND o.test=0 AND o.status IN ('paid','refunded'))`;
const gross=online('o.price'),refunds=online(refundAmountSql('o'));
export const inquiryReceiptRevisionSql=()=>`json_array('inquiry',i.ref,CAST(${inquiryAmountSql()} AS INTEGER),${manual('receipt')},${manual('refund')},${gross},${refunds},(SELECT COALESCE(MAX(id),0) FROM booking_payment_revisions WHERE booking_code=${owner}),i.status,(SELECT booking_code FROM inquiry_payment_owners WHERE inquiry_ref=i.ref),${inquiryFee},${scopeVersion})`;
export async function inquiryReceiptBooking(env,ref){
 const linked=await env.DB.prepare('SELECT booking_code FROM inquiry_payment_owners WHERE inquiry_ref=?').bind(ref).first();if(linked?.booking_code)return linked.booking_code;
 const {results}=await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref=? AND status<>'cancelled' LIMIT 2").bind(ref).all();return results?.length===1?results[0].booking_code:null;
}
const inquirySettlementsSql=`SELECT i.ref,i.status AS inquiry_status,i.space_id,${inquiryFee} AS reservation_fee,
 ${inquiryAmountSql()} AS amount,${manual('receipt')} AS manual_received,${manual('refund')} AS manual_refunded,
 ${gross} AS pg_received,${refunds} AS pg_refunded,${inquiryReceiptRevisionSql()} AS revision
 FROM inquiries i WHERE i.ref IN`;
export async function inquirySettlements(env,refs){
 const out=Object.create(null);
 for(let start=0;start<refs.length;start+=80){
  const group=refs.slice(start,start+80);
  const {results}=await env.DB.prepare(inquirySettlementsSql+' ('+group.map(()=>'?').join(',')+')').bind(...group).all();
  for(const {ref,...item} of results||[])out[ref]={
   ...S.calculate({amount:item.amount,received:item.manual_received+item.pg_received,refunded:item.manual_refunded+item.pg_refunded,
    review_required:refundStatuses.includes(item.inquiry_status)}),...item
  };
 }
 return out;
}
export async function inquirySettlement(env,ref){return (await inquirySettlements(env,[ref]))[ref]||null;}
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
 if(!pendingStatuses.includes(s.inquiry_status))return err('문의 진행 상태나 연결된 예약을 확인해 주세요.',409,'PAYMENT_CHANGED');
 if(s.revision!==d.expected_settlement_revision)return err('수납이나 문의 금액이 바뀌었습니다. 최신 내역을 확인해 주세요.',409,'PAYMENT_CHANGED');
 if(total<s.received)return err('등록된 누적 입금액보다 작습니다. 기존 수납·환불 내역을 확인해 주세요.');
 if((s.space_id===FOOD_SPACE||s.reservation_fee>0)&&d.status==='reservation_paid'){
  const issue=foodReservationDepositError(total-s.refunded,s.reservation_fee);
  if(issue)return err(issue);
 }
 if(['fully_paid','venue_fully_paid'].includes(d.status)&&(s.amount==null||total-s.refunded<s.amount))return err('전체 입금 완료는 견적 금액이 정해지고 잔금이 0원일 때 선택해 주세요.');
 if(typeof env.DB.batch!=='function')return err('수납과 상태의 일괄 저장을 지원하지 않습니다.',503);
 const time=now(),added=total-s.received,guard=`i.ref=? AND ${pending} AND ${noBooking} AND ${inquiryReceiptRevisionSql()}=? AND COALESCE((SELECT version FROM reservation_payment_scopes_v2 WHERE target_type='inquiry' AND target_ref=i.ref),0)=?`;
 const statements=[
  env.DB.prepare(`INSERT OR IGNORE INTO inquiry_payment_owners(inquiry_ref,ledger_code,created_at) SELECT i.ref,${owner},? FROM inquiries i WHERE ${guard}`).bind(time,ref,d.expected_settlement_revision,d.expected_revision),
  env.DB.prepare(`INSERT OR IGNORE INTO reservation_payment_receipt_requests(booking_code,request_id,status,received_total,added,note,payment_revision,settlement_revision,created_at) SELECT ${owner},?,?,?,?,?,?,?,? FROM inquiries i WHERE ${guard} AND EXISTS(SELECT 1 FROM inquiry_payment_owners WHERE inquiry_ref=i.ref AND booking_code IS NULL)`).bind(id,d.status,total,added,note,d.expected_revision,d.expected_settlement_revision,time,ref,d.expected_settlement_revision,d.expected_revision),
  env.DB.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) SELECT booking_code,request_id,'receipt',added,?,created_at FROM reservation_payment_receipt_requests WHERE booking_code=? AND request_id=? AND added>0 AND changes()>0").bind(str(S.describeManualPayment(note,'문의 예약금 · 누적 이용료 '+total.toLocaleString('ko-KR')+'원'),300),ledger,id),
  env.DB.prepare(`INSERT INTO reservation_payment_scopes_v2(target_type,target_ref,status,version,updated_at) SELECT 'inquiry',i.ref,?,1,? FROM inquiries i WHERE i.ref=? AND EXISTS(SELECT 1 FROM reservation_payment_receipt_requests WHERE booking_code=${owner} AND request_id=? AND payment_revision=?) ON CONFLICT(target_type,target_ref) DO UPDATE SET status=excluded.status,version=reservation_payment_scopes_v2.version+1,updated_at=excluded.updated_at WHERE reservation_payment_scopes_v2.version=?`).bind(d.status,time,ref,id,d.expected_revision,d.expected_revision),
  env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'inquiry.payment.receipt',?,'admin',?,? WHERE changes()>0").bind(ref,JSON.stringify({status:d.status,received_total:total,receipt_added:added,request_id:id}),time)
 ];
 const out=await env.DB.batch(statements),saved=await env.DB.prepare('SELECT * FROM reservation_payment_receipt_requests WHERE booking_code=? AND request_id=?').bind(ledger,id).first();
 if(!saved){const moved=await inquiryReceiptBooking(env,ref);if(moved)return paymentReceiptAdmin(env,moved,d);return err('문의가 확정되었거나 수납이 변경됐습니다. 최신 내역을 확인해 주세요.',409,'PAYMENT_CHANGED');}
 if(saved.status!==d.status||saved.received_total!==total||saved.note!==note)return err('다른 수납 요청에 사용된 번호입니다.',409,'PAYMENT_CONFLICT');
 return result(env,ref,added,!(out[1]?.meta?.changes??out[1]?.changes));
}

const changes = result => Number(result?.meta?.changes ?? result?.changes ?? 0);
const editableInquiry = status => pendingStatuses.includes(status)||refundStatuses.includes(status);
const moved = () => err('예약이 연결되었습니다. 최신 문의나 예약을 열어 수납 내역을 확인해 주세요.',409,'PAYMENT_CHANGED');
const stale = () => err('문의나 수납 내역이 변경되었습니다. 최신 내역을 다시 확인해 주세요.',409,'PAYMENT_CHANGED');
const conflict = () => err('다른 수납 기록에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');
const linkedLedger = 'booking_code IN (?,(SELECT booking_code FROM inquiry_payment_owners WHERE inquiry_ref=?))';

async function inquiryLedgerEntry(env,ledger,ref,requestId,correction){
 const table=correction?'booking_payment_revisions':'booking_payment_entries';
 return env.DB.prepare(`SELECT * FROM ${table} WHERE ${linkedLedger} AND request_id=?`).bind(ledger,ref,requestId).first();
}

async function inquiryLedgerResult(env,ref,duplicate){
 const booking_code=await inquiryReceiptBooking(env,ref);
 return json({ok:true,duplicate,...(booking_code?{booking_code}:{}),
  settlement:booking_code?await settlementFor(env,booking_code):await inquirySettlement(env,ref)});
}

function scopeAfterEdit(settlement,previous,remaining){
 if(remaining<0)return 'needs_review';
 if(remaining===0)return 'unpaid';
 if(previous&&remaining===settlement.net)return previous;
 if(['venue_fully_paid','fully_paid'].includes(previous) && settlement.amount!=null && remaining>=settlement.amount)return previous;
 if(settlement.reservation_fee>0)return remaining>=settlement.reservation_fee?'reservation_paid':'partial_paid';
 if(previous==='reservation_paid'&&remaining>=settlement.net)return previous;
 return remaining<settlement.net&&['venue_fully_paid','fully_paid','venue_paid','food_paid'].includes(previous)?'needs_review':'partial_paid';
}

export async function inquirySettlementAdmin({env,request,url,path,method}){
 const match=path.match(/^inquiries\/([A-Z0-9-]+)\/settlement(?:\/entries\/(\d+))?$/);
 if(!match)return null;
 const ref=match[1],ledger=inquiryLedger(ref),correction=!!match[2],entryId=Number(match[2]);
 if(!['GET','POST'].includes(method)||method==='GET'&&correction)return err('지원하지 않는 요청입니다.',405,'METHOD');
 if(correction&&(!Number.isSafeInteger(entryId)||entryId<1))return err('수납 기록을 찾을 수 없습니다.',404,'NOT_FOUND');
 if(method==='GET'){
  const booking_code=await inquiryReceiptBooking(env,ref);
  if(booking_code)return json({ok:true,booking_code});
  const settlement=await inquirySettlement(env,ref);
  if(!settlement)return err('문의를 찾을 수 없습니다.',404,'NOT_FOUND');
  const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
  if(!Number.isSafeInteger(before)||before<1)return err('이전 기록의 위치를 확인해 주세요.');
  const {results}=await env.DB.prepare('SELECT * FROM booking_payment_current WHERE booking_code=? AND id<? ORDER BY id DESC LIMIT 91').bind(ledger,before).all();
  const entries=(results||[]).slice(0,90),ids=entries.map(entry=>entry.id);
  const history=ids.length?(await env.DB.prepare(`SELECT * FROM booking_payment_revisions WHERE booking_code=? AND entry_id IN (${ids.map(()=>'?').join(',')}) ORDER BY id DESC LIMIT 1001`).bind(ledger,...ids).all()).results||[]:[];
  return json({ok:true,settlement,editable:editableInquiry(settlement.inquiry_status),
   refund_only:refundStatuses.includes(settlement.inquiry_status),
   entries,history:history.slice(0,1000),history_truncated:history.length>1000,
   has_more:(results||[]).length>90,next_before:entries.at(-1)?.id||null,online:await onlinePaymentsFor(env,ref,{inquiry:true})});
 }

 let d;
 try { d=await readJson(request); } catch(e){return err(e.message);}
 if(!d||typeof d!=='object'||Array.isArray(d))return err('수납 기록 저장 내용을 확인해 주세요.');
 const id=str(d.request_id,80),reason=str(d.reason,300),amount=Number(d.amount),note=str(d.note,300),voidEntry=correction&&d.action==='void';
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(id))return err('수납 기록 요청번호를 확인해 주세요.');
 if(correction?(!['correct','void'].includes(d.action)||!reason):(d.action!=null||!['receipt','refund'].includes(d.kind)))
  return err(correction?'정정·취소 종류와 사유를 입력해 주세요.':'실제 완료된 입금이나 환불을 선택해 주세요.');
 if(!voidEntry&&(!['receipt','refund'].includes(d.kind)||!Number.isSafeInteger(amount)||amount<=0||amount>1e9))
  return err('입금·환불 금액을 확인해 주세요.');
 const matchesRequest = row=>correction?row.entry_id===entryId&&row.action===d.action&&row.reason===reason&&
   (voidEntry||row.kind===d.kind&&row.amount===amount&&row.note===note):row.kind===d.kind&&row.amount===amount&&row.note===note;
 const existing=await inquiryLedgerEntry(env,ledger,ref,id,correction);
 if(existing)return matchesRequest(existing)?inquiryLedgerResult(env,ref,true):conflict();
 if(await inquiryReceiptBooking(env,ref))return moved();
 const settlement=await inquirySettlement(env,ref);
 if(!settlement)return err('문의를 찾을 수 없습니다.',404,'NOT_FOUND');
 if(!editableInquiry(settlement.inquiry_status)||d.expected_revision!==settlement.revision)return stale();

 let entry=null;
 if(correction){
  entry=await env.DB.prepare('SELECT * FROM booking_payment_current WHERE booking_code=? AND id=?').bind(ledger,entryId).first();
  if(!entry)return err('이 문의의 수기 기록을 찾을 수 없습니다.',404,'NOT_FOUND');
  if(d.entry_version!==entry.version||voidEntry&&entry.state==='void')return stale();
 }else{
  if(d.kind==='receipt'&&refundStatuses.includes(settlement.inquiry_status))return err('취소된 문의에 새 수납을 추가할 수 없습니다.');
  if(d.kind==='refund'&&amount>settlement.net)return err('환불 완료액은 현재 수납액보다 클 수 없습니다.');
 }
 const kind=voidEntry?entry.kind:d.kind;
 const storedAmount=voidEntry?entry.amount:amount, storedNote=voidEntry?entry.note:note;
 const previousNet=entry?.state==='active'?(entry.kind==='receipt'?entry.amount:-entry.amount):0;
 const nextNet=voidEntry?0:kind==='receipt'?storedAmount:-storedAmount;
 const previousScope=(await env.DB.prepare("SELECT status FROM reservation_payment_scopes_v2 WHERE target_type='inquiry' AND target_ref=?").bind(ref).first())?.status;
 const scope=scopeAfterEdit(settlement,previousScope,settlement.net-previousNet+nextNet);
 const time=now();
 const guard=`i.ref=? AND (${pending}${correction||kind==='refund'?` OR ${refundable}`:''}) AND ${noBooking}
  AND ${inquiryReceiptRevisionSql()}=?
  AND NOT EXISTS(SELECT 1 FROM inquiry_payment_owners WHERE inquiry_ref=i.ref AND booking_code IS NOT NULL)`;
 const noOtherRequest=`NOT EXISTS(SELECT 1 FROM reservation_payment_receipt_requests WHERE booking_code=${owner} AND request_id=?)
  AND NOT EXISTS(SELECT 1 FROM ${correction?'booking_payment_entries':'booking_payment_revisions'} WHERE booking_code=${owner} AND request_id=?)`;
 const statements=[
  env.DB.prepare(`INSERT OR IGNORE INTO inquiry_payment_owners(inquiry_ref,ledger_code,created_at)
   SELECT i.ref,${owner},? FROM inquiries i WHERE ${guard}`).bind(time,ref,d.expected_revision)
 ];
 if(correction){
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,note,reason,created_at)
   SELECT ${owner},e.id,?,?,?,?,?,?,?,? FROM inquiries i JOIN booking_payment_current e ON e.booking_code=${owner}
   WHERE ${guard} AND e.id=? AND e.version=? AND ${noOtherRequest}`)
   .bind(id,entry.version,d.action,kind,storedAmount,storedNote,reason,time,ref,d.expected_revision,entryId,entry.version,id,id));
 }else{
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at)
   SELECT ${owner},?,?,?,?,? FROM inquiries i WHERE ${guard} AND ${noOtherRequest}`)
   .bind(id,kind,storedAmount,storedNote,time,ref,d.expected_revision,id,id));
 }
 const audit={request_id:id,kind,amount:storedAmount,note:storedNote};
 if(correction)Object.assign(audit,{entry_id:entryId,reason,action:d.action,
  before:{kind:entry.kind,amount:entry.amount,state:entry.state,note:entry.note},
  after:{kind,amount:storedAmount,state:voidEntry?'void':'active',note:storedNote}});
 statements.push(
  env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT ?,?,'admin',?,? WHERE changes()>0")
   .bind('inquiry.payment.'+(correction?d.action:kind),ref,JSON.stringify(audit),time),
  env.DB.prepare(`INSERT INTO reservation_payment_scopes_v2(target_type,target_ref,status,version,updated_at)
   SELECT 'inquiry',?,?,1,? WHERE changes()>0
   ON CONFLICT(target_type,target_ref) DO UPDATE SET status=excluded.status,version=reservation_payment_scopes_v2.version+1,updated_at=excluded.updated_at
   WHERE reservation_payment_scopes_v2.status<>excluded.status`).bind(ref,scope,time)
 );
 const results=await env.DB.batch(statements);
 const saved=await inquiryLedgerEntry(env,ledger,ref,id,correction);
 if(!saved){
  const used=await env.DB.prepare(`SELECT 1 FROM reservation_payment_receipt_requests WHERE ${linkedLedger} AND request_id=?
   UNION ALL SELECT 1 FROM ${correction?'booking_payment_entries':'booking_payment_revisions'} WHERE ${linkedLedger} AND request_id=? LIMIT 1`)
   .bind(ledger,ref,id,ledger,ref,id).first();
  return used?conflict():stale();
 }
 if(!matchesRequest(saved))return conflict();
 return inquiryLedgerResult(env,ref,!changes(results[1]));
}
