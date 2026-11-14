import {json,err} from './_lib.js';
import {JOIN} from './_parking.js';

// Called only after the automation endpoint's HMAC and expiry checks. This path
// reads the first real, multi-vehicle paid checkout after the watch baseline.
// No credentials, buyer details, full plates or purchase-access keys are exposed.
export async function parkingBatchAudit(env,since,oid,single=false){
 if(typeof since!=='string'||!/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(since)||!Number.isFinite(Date.parse(since.replace(' ','T')+'Z')))return err('검증 시작 시각을 확인해 주세요.',400);
 if(oid!==undefined&&!/^MS[A-Z0-9]{1,38}$/.test(oid))return err('검증 주문번호를 확인해 주세요.',400);
 const batch=await env.DB.prepare(`SELECT o.oid,o.price,o.paid_at,o.status AS payment_status,
  (SELECT COALESCE(SUM(r.amount),0) FROM payapp_refunds r WHERE r.oid=o.oid) AS refunded_amount
  FROM ${single?'orders o':'parking_batches b JOIN orders o ON o.oid=b.oid'} WHERE o.test=0 AND o.paid_at>=?
  ${oid?'AND o.oid=?':"AND o.status='paid' AND NOT EXISTS(SELECT 1 FROM payapp_refunds r WHERE r.oid=o.oid)"}
  AND (SELECT COUNT(*) FROM parking_orders p WHERE COALESCE(p.payment_oid,p.oid)=o.oid)>=${single?1:2} ORDER BY o.paid_at,o.oid LIMIT 1`).bind(since,...(oid?[oid]:[])).first();
 if(!batch)return json({ok:true,batch:null});
 const {results:cars}=await env.DB.prepare(`SELECT oid,substr(plate,-4) AS plate_last4,visit_date,ticket,hours,price,status,
  entry_id,entry_at,free_hours,paid_hours,free_external,cost,applied_at,updated_at,refund_requested_at,refund_reviewed_at
  FROM (`+JOIN+`) WHERE payment_id=? ORDER BY oid`).bind(batch.oid).all();
 const items=[];
 for(const car of cars||[]){
  const {results:notices}=await env.DB.prepare("SELECT kind,status,error,occurred_at,updated_at FROM parking_notifications WHERE oid=? AND mode='live' ORDER BY id").bind(car.oid).all();
  const {results:admins}=await env.DB.prepare("SELECT substr(receiver,-4) AS receiver_last4,status,error,occurred_at,updated_at FROM parking_admin_sms WHERE oid=? AND mode='live' ORDER BY id").bind(car.oid).all();
  items.push({...car,customer_notifications:notices||[],admin_payment_sms:admins||[]});
 }
 return json({ok:true,batch:{...batch,items}});
}
