import {onlinePaymentsFor} from './_payapp_refund_history.js';
import S from '../../assets/js/settlement.js';
import {json,err,now,str,readJson,log} from './_lib.js';
import {bookingAmountSql} from './_amounts.js';
import {batch} from './_admin_booking.js';
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
export function legacyPaymentSql(){return `INSERT OR IGNORE INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at)
 SELECT b.booking_code,'legacy-confirmation','receipt',MAX(0,CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)-${legacyPgNet}),'기존 확정서의 받은 금액 이관',COALESCE(json_extract(b.confirm_doc,'$.updated_at'),b.created_at)
 FROM bookings b WHERE json_valid(b.confirm_doc) AND CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)>0
 AND json_type(b.confirm_doc,'$.settlement') IS NULL AND NOT EXISTS(SELECT 1 FROM settings WHERE key='payment_legacy:'||b.booking_code)
 AND NOT EXISTS(SELECT 1 FROM booking_payment_entries e WHERE e.booking_code=b.booking_code)
 AND CAST(json_extract(b.confirm_doc,'$.paid') AS INTEGER)>${legacyPgNet}`;}
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
  return json({ok:true,settlement,entries,has_more:(results||[]).length>90,next_before:entries.at(-1)?.id||null,history:history.slice(0,1000),history_truncated:history.length>1000,online:await onlinePaymentsFor(env,code)});
 }
 const d=await readJson(request),id=str(d.request_id,80),amount=Number(d.amount),kind=d.kind;
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
