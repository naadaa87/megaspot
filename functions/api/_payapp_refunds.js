import {refundAmountSql} from './_payapp_refund_history.js';
import {now,randomToken} from './_lib.js';
import {refundCompletionStatements,preserveLegacyPayments} from './_settlement.js';

const total = alias => `(SELECT COALESCE(SUM(r.amount),0) FROM payapp_refunds r WHERE r.oid=${alias}.oid)`;

const fingerprint = (row,type,refundNo,amount) => JSON.stringify([row.oid,type,row.payapp_no,refundNo,amount,row.price]);
const same = (event,fp) => event.fingerprint===fp;

export async function recordPayappRefund(env,row,f,partial){
 const amount=Number(f.price),type=partial?'partial':'full',refundNo=partial?f.mul_no:row.payapp_no;
 const key=(partial?'part:':'full:')+refundNo,fp=fingerprint(row,type,refundNo,amount);
 const existing=await env.DB.prepare('SELECT fingerprint FROM payapp_refund_events WHERE event_key=?').bind(key).first();
 if(existing)return {ok:same(existing,fp),duplicate:true};
 const old=partial?await env.DB.prepare('SELECT oid,amount FROM payapp_refunds WHERE mul_no=?').bind(refundNo).first():null;
 if(old&&(old.oid!==row.oid||old.amount!==amount))return {ok:false};
 // Keep manually entered legacy receipts before any document is invalidated.
 await preserveLegacyPayments(env);
 const time=now(),token=randomToken(),date=String(f.canceldate||'').slice(0,40);
 const sql=(q,...args)=>env.DB.prepare(q).bind(...args);
 const effective=partial?`CASE WHEN o.status='refunded' OR EXISTS(SELECT 1 FROM payapp_refunds r WHERE r.mul_no=? AND r.oid=o.oid) THEN 0 ELSE ? END`:`CASE WHEN o.status='refunded' THEN 0 ELSE MAX(0,o.price-MIN(o.price,${total('o')})) END`;
 const changed=partial?`CASE WHEN o.status<>'refunded' AND NOT EXISTS(SELECT 1 FROM payapp_refunds r WHERE r.mul_no=? AND r.oid=o.oid) THEN 1 ELSE 0 END`:`CASE WHEN o.status<>'refunded' THEN 1 ELSE 0 END`;
 const args=[key,type,row.payapp_no,refundNo,amount,...(partial?[refundNo,amount,refundNo]:[]),fp,token,date,time,row.oid,...(partial?[refundNo,amount,amount,refundNo]:[])];
 const mutation=`EXISTS(SELECT 1 FROM payapp_refund_events e WHERE e.event_key=? AND e.processing_token=? AND e.state_changed=1)`;
 await env.DB.batch([
  sql(`INSERT OR IGNORE INTO payapp_refund_events(event_key,oid,event_type,original_no,refund_no,raw_amount,effective_amount,state_changed,fingerprint,processing_token,created_at)
   SELECT 'baseline:'||o.oid,o.oid,'baseline',?, '',${refundAmountSql('o')},${refundAmountSql('o')},0,'legacy','legacy',?
   FROM orders o WHERE o.oid=?`,row.payapp_no,time,row.oid),
  sql(`INSERT OR IGNORE INTO payapp_refund_events(event_key,oid,event_type,original_no,refund_no,raw_amount,effective_amount,state_changed,fingerprint,processing_token,provider_at,created_at)
   SELECT ?,o.oid,?,?,?,?,${effective},${changed},?,?,?,? FROM orders o WHERE o.oid=?
   ${partial?`AND (o.status='refunded' OR EXISTS(SELECT 1 FROM payapp_refunds r WHERE r.mul_no=? AND r.oid=o.oid AND r.amount=?) OR (?<=MAX(0,o.price-MIN(o.price,${total('o')})) AND NOT EXISTS(SELECT 1 FROM payapp_refunds r WHERE r.mul_no=?)))`:''}`,...args),
  sql(`INSERT OR IGNORE INTO payapp_refunds(mul_no,oid,amount,created_at) SELECT ?,oid,effective_amount,created_at FROM payapp_refund_events WHERE event_key=? AND processing_token=? AND effective_amount>0`,partial?refundNo:'full-'+row.payapp_no,key,token),
  sql(`UPDATE orders SET status=CASE WHEN ?='full' OR ${total('orders')}>=price THEN 'refunded' WHEN status IN ('created','pending') AND ? IS NOT NULL THEN 'paid' ELSE status END,booking_code=COALESCE(booking_code,?),paid_at=CASE WHEN status IN ('created','pending') AND ? IS NOT NULL THEN COALESCE(paid_at,?) ELSE paid_at END,result_msg=?,updated_at=? WHERE oid=? AND ${mutation}`,
   type,row.booking_code||null,row.booking_code||null,row.booking_code||null,time,partial?'부분 환불 · 페이앱 내역 확인':'페이앱 승인 취소',time,row.oid,key,token),
  ...(row.test?[]:refundCompletionStatements(env,row.booking_code,mutation,[key,token],time)),
  sql(`UPDATE bookings SET confirm_doc=NULL,updated_at=? WHERE booking_code=(SELECT booking_code FROM orders WHERE oid=? AND test=0) AND ${mutation}`,time,row.oid,key,token),
  sql(`INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT ?,oid,'payapp',json_object('event',event_key,'amount',effective_amount,'raw_amount',raw_amount),created_at FROM payapp_refund_events WHERE event_key=? AND processing_token=? AND state_changed=1`,partial?'order.partial_refund':'order.refunded',key,token)
 ]);
 const saved=await env.DB.prepare('SELECT fingerprint,processing_token FROM payapp_refund_events WHERE event_key=?').bind(key).first();
 return {ok:!!saved&&same(saved,fp),duplicate:!!saved&&saved.processing_token!==token};
}
