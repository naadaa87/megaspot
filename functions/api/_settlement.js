import {paymentSchedule} from './_booking_payment_schedule.js';
import {onlinePaymentsFor} from './_payapp_refund_history.js';
import S from '../../assets/js/settlement.js';
import {json,err,now,str,readJson,log} from './_lib.js';
import {bookingAmountSql} from './_amounts.js';
import {batch} from './_admin_booking.js';
import {confirmationSourceSQL,prepareCombinedConfirmation} from './_confirmation_auto.js';
import {parseDoc} from './_confirm.js';
export {S};
// Test orders never count as real receipts. Full refunds remain visible in both totals.
const gross = code => `(SELECT COALESCE(SUM(o.price),0) FROM orders o WHERE o.booking_code=${code} AND o.test=0 AND o.status IN ('paid','refunded'))`;
const returned = code => `(SELECT COALESCE(SUM(CASE WHEN o.status='refunded' THEN o.price ELSE MIN(o.price,COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0)) END),0) FROM orders o WHERE o.booking_code=${code} AND o.test=0 AND o.status IN ('paid','refunded'))`;
const manual = (code,kind) => `(SELECT COALESCE(SUM(e.amount),0) FROM booking_payment_current e WHERE e.booking_code=${code} AND e.state='active' AND e.kind='${kind}')`;
const editVersion = code => `(SELECT COALESCE(MAX(id),0) FROM booking_payment_revisions WHERE booking_code=${code})`;
const reconfirmationVersion=code=>`COALESCE((SELECT MAX(id) FROM booking_reconfirmations WHERE booking_code=${code}),0)`;
const cancellationVersion = code=>`COALESCE((SELECT revision FROM booking_cancellation_state WHERE booking_code=${code}),0)`;
export const settlementRevisionSql = () => `json_array(CAST(${bookingAmountSql()} AS INTEGER),${gross('b.booking_code')},${returned('b.booking_code')},${manual('b.booking_code','receipt')},${manual('b.booking_code','refund')},${editVersion('b.booking_code')},b.status,${cancellationVersion('b.booking_code')},${reconfirmationVersion('b.booking_code')})`;
// Reconstruct the online net at issue time, so a later PG refund is never imported as a bank receipt.
const legacyStamp = `COALESCE(json_extract(b.confirm_doc,'$.updated_at'),json_extract(b.confirm_doc,'$.issued_at'),b.updated_at,b.created_at)`;
const legacyPgNet = `(SELECT COALESCE(SUM(MAX(0,o.price-MIN(o.price,COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid AND datetime(r.created_at)<=datetime(${legacyStamp})),CASE WHEN o.status='refunded' AND datetime(o.updated_at)<=datetime(${legacyStamp}) THEN o.price ELSE 0 END)))),0) FROM orders o WHERE o.booking_code=b.booking_code AND o.test=0 AND o.status IN ('paid','refunded') AND (o.paid_at IS NULL OR datetime(o.paid_at)<=datetime(${legacyStamp})))`;
// Preserve a legacy document's net received amount once, before any document invalidation.
export function legacyPaymentSourceSql(){return `SELECT b.booking_code,
 CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)-${legacyPgNet} AS amount,
 COALESCE(json_extract(b.confirm_doc,'$.updated_at'),b.created_at) AS created_at
 FROM bookings b WHERE json_valid(b.confirm_doc) AND CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)>0
 AND json_type(b.confirm_doc,'$.settlement') IS NULL AND NOT EXISTS(SELECT 1 FROM settings WHERE key='payment_legacy:'||b.booking_code)
 AND NOT EXISTS(SELECT 1 FROM booking_payment_entries e WHERE e.booking_code=b.booking_code)
 AND CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)>${legacyPgNet}`;}
export function legacyPaymentSql(){return `INSERT OR IGNORE INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at)
 SELECT booking_code,'legacy-confirmation','receipt',amount,'기존 확정서의 받은 금액 이관',created_at FROM (${legacyPaymentSourceSql()})`;}
export function legacyHandledSql(){return `INSERT OR IGNORE INTO settings(key,value,updated_at) SELECT 'payment_legacy:'||booking_code,'1',created_at FROM bookings WHERE json_valid(confirm_doc) AND json_type(confirm_doc,'$.settlement') IS NULL AND json_extract(confirm_doc,'$.paid') IS NOT NULL`;}
export async function preserveLegacyPayments(env){await env.DB.prepare(legacyPaymentSql()).run();await env.DB.prepare(legacyHandledSql()).run();}
const QUERY=`SELECT b.booking_code,b.status,b.confirm_doc,${reconfirmationVersion('b.booking_code')} AS reconfirmation_version,(SELECT created_at FROM booking_reconfirmations WHERE booking_code=b.booking_code ORDER BY id DESC LIMIT 1) AS reconfirmed_at,(SELECT snapshot FROM booking_reconfirmations WHERE booking_code=b.booking_code ORDER BY id DESC LIMIT 1) AS reconfirmation_snapshot,${cancellationVersion('b.booking_code')} AS cancellation_version,(SELECT r.terms FROM booking_cancellation_state c JOIN booking_cancellation_revisions r ON r.id=c.revision WHERE c.booking_code=b.booking_code) AS cancellation_terms,${legacyPgNet} AS legacy_pg_net,EXISTS(SELECT 1 FROM settings WHERE key='payment_legacy:'||b.booking_code) AS legacy_done,${bookingAmountSql()} AS amount,${gross('b.booking_code')} AS pg_received,${returned('b.booking_code')} AS pg_refunded,${manual('b.booking_code','receipt')} AS manual_received,${manual('b.booking_code','refund')} AS manual_refunded,(SELECT COUNT(*) FROM booking_payment_entries e WHERE e.booking_code=b.booking_code) AS entries,(SELECT MAX(id) FROM booking_payment_entries e WHERE e.booking_code=b.booking_code) AS last_id,${editVersion('b.booking_code')} AS edit_version FROM bookings b WHERE b.booking_code=?`;
export async function settlementsFor(env,codes){
 if(!codes.length)return {};if(codes.length>90){const parts=[];for(let i=0;i<codes.length;i+=90)parts.push(await settlementsFor(env,codes.slice(i,i+90)));return Object.assign({},...parts);}
 const {results}=await env.DB.prepare(QUERY.replace('b.booking_code=?','b.booking_code IN ('+codes.map(()=>'?').join(',')+')')).bind(...codes).all();const out={};for(const row of results||[]){
 let legacy=0;try{if(!row.entries&&!row.legacy_done&&!JSON.parse(row.confirm_doc||'{}').settlement)legacy=Math.max(0,(Number(JSON.parse(row.confirm_doc||'{}').paid)||0)-row.legacy_pg_net);}catch{}
 const received=row.pg_received+row.manual_received+legacy,refunded=row.pg_refunded+row.manual_refunded,closed=row.status==='cancelled'&&received>0&&received===refunded;
 let cancellation=null;try{if(row.status==='cancelled')cancellation=JSON.parse(row.cancellation_terms);}catch{}
 if(cancellation&&!cancellation.cycle&&row.reconfirmation_version){try{const snapshot=JSON.parse(row.reconfirmation_snapshot);cancellation={...cancellation,cycle:{id:row.reconfirmation_version,started_at:row.reconfirmed_at,refunded_before:snapshot.refunded}};}catch{}}
 const reconfirmation=row.status!=='cancelled'&&row.reconfirmation_version?{id:row.reconfirmation_version,at:row.reconfirmed_at}:null;
 const result=S.calculate({reconfirmation,amount:closed?0:row.amount,cancellation,fully_refunded:closed&&!cancellation,review_required:row.status==='cancelled'&&!closed&&!cancellation,received,refunded});
 out[row.booking_code]={...result,pg_received:row.pg_received,pg_refunded:row.pg_refunded,manual_received:row.manual_received+legacy,manual_refunded:row.manual_refunded,legacy_pending:legacy>0,revision:JSON.stringify([row.amount,row.pg_received,row.pg_refunded,row.manual_received+legacy,row.manual_refunded,row.edit_version,row.status,row.cancellation_version,row.reconfirmation_version]),booking_status:row.status};
 }return out;
}
export async function settlementFor(env,code){return (await settlementsFor(env,[code]))[code]||null;}
const depositAmountSql=alias=>`COALESCE((SELECT amount FROM booking_refunds WHERE booking_code=${alias}.booking_code),json_extract(${alias}.confirm_doc,'$.deposit'),(SELECT json_extract(data,'$.deposit') FROM quotes WHERE inquiry_ref=${alias}.inquiry_ref ORDER BY id DESC LIMIT 1),150000)`;
const depositPaidSql=alias=>`CASE WHEN ${alias}.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=${alias}.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=${alias}.booking_code),0) END`;
const depositContextSql=()=>`json_array(b.status,b.inquiry_ref,b.customer_name,b.phone,b.space_id,b.date,b.start_h,b.end_h,${depositAmountSql('b')},${depositPaidSql('b')},(SELECT state FROM booking_refunds WHERE booking_code=b.booking_code),(SELECT purged_at FROM booking_refunds WHERE booking_code=b.booking_code),(SELECT json_extract(checks,'$.guarantee_returned') FROM inquiry_checks WHERE ref=b.inquiry_ref),(SELECT COUNT(*) FROM bookings WHERE inquiry_ref=b.inquiry_ref AND status<>'cancelled'))`;
async function combinedContext(env,code){
 const b=await env.DB.prepare(`SELECT b.inquiry_ref,b.status,${depositAmountSql('b')} AS amount,${depositPaidSql('b')} AS paid,${depositContextSql()} AS revision,(SELECT state FROM booking_refunds WHERE booking_code=b.booking_code) AS refund_state,(SELECT purged_at FROM booking_refunds WHERE booking_code=b.booking_code) AS purged,(SELECT json_extract(checks,'$.guarantee_returned') FROM inquiry_checks WHERE ref=b.inquiry_ref) AS returned,(SELECT COUNT(*) FROM bookings WHERE inquiry_ref=b.inquiry_ref AND status<>'cancelled') AS siblings FROM bookings b WHERE booking_code=?`).bind(code).first();
 const settings=JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key='deposit_alimtalk'").first())?.value||'{}');
 const reason=b.status!=='confirmed'?'확정 예약에서 합산 입금을 처리해 주세요.':b.paid?'보증금 입금이 이미 확인되어 있습니다.':!Number.isSafeInteger(b.amount)||b.amount<=0||b.amount>10000000?'예약의 보증금 금액을 먼저 확인해 주세요.':b.inquiry_ref&&b.siblings!==1?'같은 문의에 연결된 예약이 여러 건입니다. 보증금을 예약별로 확인해 주세요.':b.purged||b.returned||(b.refund_state&&b.refund_state!=='pending')?'환급 처리 상태를 먼저 확인해 주세요.':'';
 return {...b,reason,automatic:settings.enabled===true&&settings.types?.account!==false&&env.ALIGO_LIVE_ENABLED==='true'};
}
async function combinedResult(env,code,receipt,duplicate=false){
 const notice=await env.DB.prepare("SELECT status,error FROM deposit_notifications WHERE booking_code=? AND kind='account' AND mode='live' ORDER BY id DESC LIMIT 1").bind(code).first();
 const settlement=await settlementFor(env,code),doc=parseDoc((await env.DB.prepare('SELECT confirm_doc FROM bookings WHERE booking_code=?').bind(code).first())?.confirm_doc);
 return json({ok:true,duplicate,combined_receipt:receipt,deposit_notice:notice||null,confirmation:{issued:!!doc?.issued_at,current:!!doc?.issued_at&&doc.settlement?.revision===settlement.revision,issue_no:doc?.issue_no||0},settlement});
}
async function combinedReceipt(env,code,d,settlement){
 const id=str(d.request_id,80),total=Number(d.amount),deposit=Number(d.deposit_amount),note=str(d.note,300);
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||d.kind!=='receipt'||d.confirm_combined!==true||!Number.isSafeInteger(total)||total<=0||total>1e9||!Number.isSafeInteger(deposit)||deposit<=0||deposit>=total)return err('합산 입금액과 이용료·보증금 구분을 확인해 주세요.');
 const existing=await env.DB.prepare('SELECT * FROM booking_combined_receipts WHERE booking_code=? AND request_id=?').bind(code,id).first();
 if(existing){if(existing.total!==total||existing.deposit!==deposit||existing.note!==note)return err('다른 합산 입금에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');return combinedResult(env,code,existing,true);}
 if(await env.DB.prepare('SELECT id FROM booking_payment_entries WHERE booking_code=? AND request_id=?').bind(code,id).first())return err('이미 다른 수납 기록에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');
 const c=await combinedContext(env,code),fee=total-deposit;
 if(c.reason)return err(c.reason,409,'DEPOSIT_CHANGED');
 if(d.expected_revision!==settlement.revision||d.deposit_revision!==c.revision||deposit!==c.amount)return err('수납 또는 보증금 정보가 바뀌었습니다. 새로고침 후 확인해 주세요.',409,'PAYMENT_CHANGED');
 if(settlement.balance==null||fee>settlement.balance)return err('보증금을 제외한 이용료가 남은 잔금보다 큽니다. 입금 내역을 다시 확인해 주세요.');
 if(typeof env.DB.batch!=='function')return err('합산 입금의 일괄 저장을 지원하지 않습니다.',503);
 const time=now(),summary=`합산 입금 ${total.toLocaleString('ko-KR')}원 (이용료 ${fee.toLocaleString('ko-KR')}원 + 반환 보증금 ${deposit.toLocaleString('ko-KR')}원)`,paymentNote=str(summary+(note?' · '+note:''),300);
 const confirmation=await prepareCombinedConfirmation(env,code,settlement,fee,deposit,time);
 const statements=[
  env.DB.prepare(`INSERT OR IGNORE INTO booking_combined_receipts(booking_code,request_id,total,fee,deposit,note,created_at) SELECT booking_code,?,?,?,?,?,? FROM bookings b WHERE booking_code=? AND ${settlementRevisionSql()}=? AND ${depositContextSql()}=? AND ${confirmationSourceSQL}=?`).bind(id,total,fee,deposit,note,time,code,d.expected_revision,d.deposit_revision,confirmation.revision),
  env.DB.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) SELECT booking_code,request_id,'receipt',fee,?,created_at FROM booking_combined_receipts WHERE booking_code=? AND request_id=? AND changes()>0").bind(paymentNote,code,id),
  env.DB.prepare('INSERT INTO booking_refunds(booking_code,amount,created_at,updated_at) SELECT ?,?,?,? WHERE changes()>0 ON CONFLICT(booking_code) DO UPDATE SET amount=booking_refunds.amount').bind(code,deposit,time,time),
  // The updated document and its audit record commit with the receipt, before the paid
  // flag creates the account invitation. Any failure rolls the entire operation back.
  env.DB.prepare('UPDATE bookings SET confirm_doc=?,updated_at=? WHERE booking_code=? AND changes()>0').bind(JSON.stringify(confirmation.doc),time,code),
  env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT ?,?,'admin',?,? WHERE changes()>0").bind(confirmation.previously_issued?'booking.confirm_doc.updated':'booking.confirm_doc.issued',code,JSON.stringify({issue_no:confirmation.doc.issue_no,request_id:id,source:'combined_receipt'}),time)
 ];
 if(c.inquiry_ref){
  statements.push(env.DB.prepare("INSERT INTO inquiry_checks(ref,checks,updated_at) SELECT ?,json_object('guarantee_paid',?),? WHERE changes()>0 ON CONFLICT(ref) DO UPDATE SET checks=json_set(inquiry_checks.checks,'$.guarantee_paid',?),updated_at=excluded.updated_at").bind(c.inquiry_ref,time,time,time));
  statements.push(env.DB.prepare("UPDATE inquiries SET memo=CASE WHEN COALESCE(memo,'')='' THEN ? ELSE memo||char(10)||? END,updated_at=? WHERE ref=? AND changes()>0").bind(time+' '+paymentNote,time+' '+paymentNote,time,c.inquiry_ref));
 }else{
  statements.push(env.DB.prepare('INSERT INTO booking_deposit_checks(booking_code,paid,updated_at) SELECT ?,1,? WHERE changes()>0 ON CONFLICT(booking_code) DO UPDATE SET paid=1,updated_at=excluded.updated_at').bind(code,time));
 }
 statements.push(env.DB.prepare("UPDATE deposit_notifications SET status='cancelled',error='합산 입금으로 보증금 확인 완료',updated_at=? WHERE booking_code=? AND kind='payment' AND mode='live' AND status IN ('queued','review') AND request_id IS NULL AND provider_mid IS NULL AND EXISTS(SELECT 1 FROM booking_combined_receipts WHERE booking_code=? AND request_id=?)").bind(time,code,code,id));
 const result=await env.DB.batch(statements),saved=await env.DB.prepare('SELECT * FROM booking_combined_receipts WHERE booking_code=? AND request_id=?').bind(code,id).first();
 if(!saved)return err('다른 관리자가 수납·보증금 정보를 변경했습니다. 새로고침 후 확인해 주세요.',409,'PAYMENT_CHANGED');
 if(saved.total!==total||saved.deposit!==deposit||saved.note!==note)return err('다른 합산 입금에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');
 const duplicate=!(result[0]?.meta?.changes??result[0]?.changes);
 if(!duplicate)await log(env,'booking.payment.combined',code,'admin',{request_id:id,total,fee,deposit,note});
 return combinedResult(env,code,saved,duplicate);
}
export async function settlementAdmin({env,request,path,method}){
 const match=path.match(/^bookings\/([A-Z0-9-]+)\/settlement(?:\/entries\/(\d+))?$/);if(!match)return null;const code=match[1];
 if(!['GET','POST'].includes(method))return err('지원하지 않는 요청입니다.',405,'METHOD');

 const settlement=await settlementFor(env,code);if(!settlement)return err('예약을 찾을 수 없습니다.',404,'NOT_FOUND');
 if(match[2]){if(method!=='POST')return err('지원하지 않는 요청입니다.',405,'METHOD');return correctEntry(env,request,code,Number(match[2]),settlement);}
 if(method==='GET'){
  const before=Number(new URL(request.url).searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
  if(!Number.isSafeInteger(before)||before<1)return err('이전 기록의 위치를 확인해 주세요.');
  const {results}=await env.DB.prepare('SELECT * FROM booking_payment_current WHERE booking_code=? AND id<? ORDER BY id DESC LIMIT 91').bind(code,before).all();
  const entries=(results||[]).slice(0,90),ids=entries.map(e=>e.id);
  const history=ids.length?(await env.DB.prepare('SELECT id,entry_id,request_id,previous_version,action,kind,amount,note,reason,created_at FROM booking_payment_revisions WHERE booking_code=? AND entry_id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id DESC LIMIT 1001').bind(code,...ids).all()).results||[]:[];
  return json({ok:true,settlement,schedule:await paymentSchedule(env,await env.DB.prepare('SELECT * FROM bookings WHERE booking_code=?').bind(code).first()),deposit:await combinedContext(env,code),entries,has_more:(results||[]).length>90,next_before:entries.at(-1)?.id||null,history:history.slice(0,1000),history_truncated:history.length>1000,online:await onlinePaymentsFor(env,code)});
 }
 const d=await readJson(request);if(d.combined===true)return combinedReceipt(env,code,d,settlement);
 const id=str(d.request_id,80),amount=Number(d.amount),kind=d.kind;
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||!['receipt','refund'].includes(kind)||!Number.isSafeInteger(amount)||amount<=0||amount>1e9)return err('입금·환불 종류와 실제 처리 금액을 확인해 주세요.');
 const existing=await env.DB.prepare('SELECT kind,amount,note FROM booking_payment_entries WHERE booking_code=? AND request_id=?').bind(code,id).first();
 if(existing){if(existing.kind!==kind||existing.amount!==amount||existing.note!==str(d.note,300))return err('다른 기록에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');return json({ok:true,duplicate:true,settlement:await settlementFor(env,code)});}
 if(d.expected_revision!==settlement.revision)return err('수납 내역이나 예약 금액이 바뀌었습니다. 최신 금액을 확인한 뒤 다시 기록해 주세요.',409,'PAYMENT_CHANGED');
 if(kind==='refund'&&amount>settlement.net)return err('환불 완료액은 현재 수납액보다 클 수 없습니다.');
 const time=now();const net=`${gross('b.booking_code')}-${returned('b.booking_code')}+${manual('b.booking_code','receipt')}-${manual('b.booking_code','refund')}`;
 const result=await batch(env,[env.DB.prepare(`INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) SELECT booking_code,?,?,?,?,? FROM bookings b WHERE booking_code=? AND ${settlementRevisionSql()}=? AND (?='receipt' OR ?<=(${net}))`).bind(id,kind,amount,str(d.note,300),time,code,d.expected_revision,kind,amount),env.DB.prepare('UPDATE bookings SET confirm_doc=NULL,updated_at=? WHERE booking_code=? AND changes()>0 AND EXISTS(SELECT 1 FROM booking_payment_entries WHERE booking_code=? AND request_id=?)').bind(time,code,code,id),...refundCompletionStatements(env,code,'EXISTS(SELECT 1 FROM booking_payment_entries WHERE booking_code=? AND request_id=?)',[code,id],time)]);
 const saved=await env.DB.prepare('SELECT id,kind,amount,note FROM booking_payment_entries WHERE booking_code=? AND request_id=?').bind(code,id).first();if(!saved)return err('수납 내역이 변경됐습니다. 다시 불러와 확인해 주세요.',409,'PAYMENT_CHANGED');
 if(saved.kind!==kind||saved.amount!==amount||saved.note!==str(d.note,300))return err('다른 기록에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');
 if(!(result?.[0]?.meta?.changes??result?.[0]?.changes))return json({ok:true,duplicate:true,settlement:await settlementFor(env,code)});
 await log(env,'booking.payment.'+kind,code,'admin',{amount,request_id:id,note:str(d.note,300)});
 return json({ok:true,settlement:await settlementFor(env,code)});
}
async function correctEntry(env,request,code,entryId,settlement){
 if(!Number.isSafeInteger(entryId)||entryId<1)return err('기록을 찾을 수 없습니다.',404,'NOT_FOUND');
 const entry=await env.DB.prepare('SELECT * FROM booking_payment_current WHERE booking_code=? AND id=?').bind(code,entryId).first();
 if(!entry)return err('이 예약의 수기 기록을 찾을 수 없습니다.',404,'NOT_FOUND');
 const d=await readJson(request),id=str(d.request_id,80),action=d.action,reason=str(d.reason,300);
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||!['correct','void'].includes(action)||!reason)return err('정정·취소 종류와 사유를 입력해 주세요.');
 const kind=action==='void'?entry.kind:d.kind,amount=action==='void'?entry.amount:Number(d.amount),note=action==='void'?entry.note:str(d.note,300);
 if(!['receipt','refund'].includes(kind)||!Number.isSafeInteger(amount)||amount<=0||amount>1e9)return err('올바른 종류와 금액을 입력해 주세요.');
 const existing=await env.DB.prepare('SELECT * FROM booking_payment_revisions WHERE booking_code=? AND request_id=?').bind(code,id).first();
 if(existing){if(existing.entry_id!==entryId||existing.action!==action||existing.reason!==reason||(action==='correct'&&(existing.kind!==kind||existing.amount!==amount||existing.note!==note)))return err('다른 정정에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');return json({ok:true,duplicate:true,settlement:await settlementFor(env,code)});}
 if(d.expected_revision!==settlement.revision||d.entry_version!==entry.version)return err('수납 내역이 변경됐습니다. 최신 기록을 다시 선택해 주세요.',409,'PAYMENT_CHANGED');
 if(action==='void'&&entry.state==='void')return err('이미 취소된 기록입니다.',409,'PAYMENT_CHANGED');
 const time=now();
 const result=await batch(env,[
  env.DB.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,note,reason,created_at)
   SELECT b.booking_code,e.id,?,?,?,?,?,?,?,? FROM bookings b JOIN booking_payment_current e ON e.booking_code=b.booking_code
   WHERE b.booking_code=? AND e.id=? AND e.version=? AND ${settlementRevisionSql()}=?`).bind(id,entry.version,action,kind,amount,note,reason,time,code,entryId,entry.version,d.expected_revision),
  env.DB.prepare('UPDATE bookings SET confirm_doc=NULL,updated_at=? WHERE booking_code=? AND changes()>0 AND EXISTS(SELECT 1 FROM booking_payment_revisions WHERE booking_code=? AND request_id=?)').bind(time,code,code,id),
  ...refundCompletionStatements(env,code,'EXISTS(SELECT 1 FROM booking_payment_revisions WHERE booking_code=? AND request_id=?)',[code,id],time)
 ]);
 const saved=await env.DB.prepare('SELECT * FROM booking_payment_revisions WHERE booking_code=? AND request_id=?').bind(code,id).first();
 if(!saved)return err('수납 내역이 변경됐습니다. 최신 기록을 다시 선택해 주세요.',409,'PAYMENT_CHANGED');
 if(saved.entry_id!==entryId||saved.action!==action||saved.reason!==reason||(action==='correct'&&(saved.kind!==kind||saved.amount!==amount||saved.note!==note)))return err('다른 정정에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');
 if(!(result?.[0]?.meta?.changes??result?.[0]?.changes))return json({ok:true,duplicate:true,settlement:await settlementFor(env,code)});
 await log(env,'booking.payment.'+action,code,'admin',{entry_id:entryId,request_id:id,reason,before:{kind:entry.kind,amount:entry.amount,note:entry.note,state:entry.state},after:{kind,amount,note,state:action==='void'?'void':'active'}});
 return json({ok:true,settlement:await settlementFor(env,code)});
}
// Refunding an additional food order must not cancel a booking with other receipts.
export function otherReceiptsSql(code,oid){return `((SELECT COALESCE(SUM(MAX(0,o.price-CASE WHEN o.status='refunded' THEN o.price ELSE MIN(o.price,COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0)) END)),0) FROM orders o WHERE o.booking_code=${code} AND o.oid<>${oid} AND o.test=0 AND o.status IN ('paid','refunded'))+${manual(code,'receipt')}-${manual(code,'refund')})`;}

// Complete a PG cancellation only when every online payment and the combined balance are fully returned.
// A negative combined balance needs review; a partial refund must leave the reservation active.
export function refundCompletionStatements(env,code,guard,args,time=now()){
 if(!code)return [];
 const received=gross('b.booking_code'),refunded=returned('b.booking_code');
 return [
  env.DB.prepare(`UPDATE bookings AS b SET status='cancelled',confirm_doc=NULL,updated_at=? WHERE b.booking_code=? AND b.status<>'cancelled' AND NOT EXISTS(SELECT 1 FROM booking_reconfirmations WHERE booking_code=b.booking_code)
   AND ${received}>0 AND ${received}=${refunded} AND ${manual('b.booking_code','receipt')}=${manual('b.booking_code','refund')} AND (${guard})`).bind(time,code,...args),
  env.DB.prepare(`UPDATE inquiries SET status='취소·환불',updated_at=? WHERE status='예약 확정'
   AND ref=(SELECT inquiry_ref FROM bookings WHERE booking_code=? AND status='cancelled')
   AND NOT EXISTS(SELECT 1 FROM bookings WHERE inquiry_ref=inquiries.ref AND status<>'cancelled') AND (${guard})`).bind(time,code,...args),
  env.DB.prepare(`DELETE FROM calendar_blocks WHERE memo=? AND EXISTS(SELECT 1 FROM bookings WHERE booking_code=? AND status='cancelled') AND (${guard})`).bind('예약 '+code,code,...args)
 ];
}
