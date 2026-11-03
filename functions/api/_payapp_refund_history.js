const total=alias=>`(SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid=${alias}.oid)`;
export const refundAmountSql=(alias='o')=>`CASE WHEN ${alias}.status='refunded' THEN ${alias}.price ELSE MIN(${alias}.price,${total(alias)}) END`;
export async function onlinePaymentsFor(env,code){
 const {results}=await env.DB.prepare(`SELECT o.oid,o.title,o.price,o.status,o.paid_at,o.created_at,p.mul_no,${refundAmountSql('o')} AS refunded
  FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.booking_code=? AND o.test=0 AND o.status IN ('paid','refunded') ORDER BY o.id DESC LIMIT 90`).bind(code).all();
 const orders=results||[];if(!orders.length)return [];
 const ids=orders.map(o=>o.oid),events=(await env.DB.prepare('SELECT id,event_key,oid,event_type,original_no,refund_no,raw_amount,effective_amount,state_changed,provider_at,created_at FROM payapp_refund_events WHERE oid IN ('+ids.map(()=>'?').join(',')+') ORDER BY id').bind(...ids).all()).results||[];
 return orders.map(o=>{let history=events.filter(e=>e.oid===o.oid&&(e.event_type!=='baseline'||e.effective_amount>0));if(!history.length&&o.refunded>0)history=[{event_key:'legacy:'+o.oid,event_type:'baseline',raw_amount:o.refunded,effective_amount:o.refunded,created_at:o.created_at,provider_at:'',refund_no:''}];return {...o,events:history};});
}
