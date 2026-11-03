import S from '../../assets/js/settlement.js';
import {json,err,now,str,readJson,log} from './_lib.js';
import {bookingAmountSql} from './_amounts.js';
import {batch} from './_admin_booking.js';
export {S};
// Test orders never count as real receipts. Full refunds remain visible in both totals.
const gross = code => `(SELECT COALESCE(SUM(o.price),0) FROM orders o WHERE o.booking_code=${code} AND o.test=0 AND o.status IN ('paid','refunded'))`;
const returned = code => `(SELECT COALESCE(SUM(CASE WHEN o.status='refunded' THEN o.price ELSE MIN(o.price,COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0)) END),0) FROM orders o WHERE o.booking_code=${code} AND o.test=0 AND o.status IN ('paid','refunded'))`;
const manual = (code,kind) => `(SELECT COALESCE(SUM(e.amount),0) FROM booking_payment_entries e WHERE e.booking_code=${code} AND e.kind='${kind}')`;
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
const QUERY=`SELECT b.booking_code,b.status,b.confirm_doc,${legacyPgNet} AS legacy_pg_net,EXISTS(SELECT 1 FROM settings WHERE key='payment_legacy:'||b.booking_code) AS legacy_done,${bookingAmountSql()} AS amount,${gross('b.booking_code')} AS pg_received,${returned('b.booking_code')} AS pg_refunded,${manual('b.booking_code','receipt')} AS manual_received,${manual('b.booking_code','refund')} AS manual_refunded,(SELECT COUNT(*) FROM booking_payment_entries e WHERE e.booking_code=b.booking_code) AS entries,(SELECT MAX(id) FROM booking_payment_entries e WHERE e.booking_code=b.booking_code) AS last_id FROM bookings b WHERE b.booking_code=?`;
export async function settlementsFor(env,codes){
 if(!codes.length)return {};if(codes.length>90){const parts=[];for(let i=0;i<codes.length;i+=90)parts.push(await settlementsFor(env,codes.slice(i,i+90)));return Object.assign({},...parts);}
 const {results}=await env.DB.prepare(QUERY.replace('b.booking_code=?','b.booking_code IN ('+codes.map(()=>'?').join(',')+')')).bind(...codes).all();const out={};for(const row of results||[]){
 let legacy=0;try{if(!row.entries&&!row.legacy_done&&!JSON.parse(row.confirm_doc||'{}').settlement)legacy=Math.max(0,(Number(JSON.parse(row.confirm_doc||'{}').paid)||0)-row.legacy_pg_net);}catch{}
 const result=S.calculate({amount:row.amount,review_required:row.status==='cancelled',received:row.pg_received+row.manual_received+legacy,refunded:row.pg_refunded+row.manual_refunded});
 out[row.booking_code]={...result,pg_received:row.pg_received,pg_refunded:row.pg_refunded,manual_received:row.manual_received+legacy,manual_refunded:row.manual_refunded,legacy_pending:legacy>0,revision:JSON.stringify([row.amount,row.pg_received,row.pg_refunded,row.manual_received+legacy,row.manual_refunded]),booking_status:row.status};
 }return out;
}
export async function settlementFor(env,code){return (await settlementsFor(env,[code]))[code]||null;}
export async function settlementAdmin({env,request,path,method}){
 const match=path.match(/^bookings\/([A-Z0-9-]+)\/settlement$/);if(!match)return null;const code=match[1];
 if(!['GET','POST'].includes(method))return err('지원하지 않는 요청입니다.',405,'METHOD');

 const settlement=await settlementFor(env,code);if(!settlement)return err('예약을 찾을 수 없습니다.',404,'NOT_FOUND');
 if(method==='GET'){const {results}=await env.DB.prepare('SELECT request_id,kind,amount,note,created_at FROM booking_payment_entries WHERE booking_code=? ORDER BY id DESC LIMIT 100').bind(code).all();return json({ok:true,settlement,entries:results||[]});}
 const d=await readJson(request),id=str(d.request_id,80),amount=Number(d.amount),kind=d.kind;
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||!['receipt','refund'].includes(kind)||!Number.isSafeInteger(amount)||amount<=0||amount>1e9)return err('입금·환불 종류와 실제 처리 금액을 확인해 주세요.');
 const existing=await env.DB.prepare('SELECT kind,amount,note FROM booking_payment_entries WHERE booking_code=? AND request_id=?').bind(code,id).first();
 if(existing){if(existing.kind!==kind||existing.amount!==amount||existing.note!==str(d.note,300))return err('다른 기록에 사용된 요청번호입니다.',409,'PAYMENT_CONFLICT');return json({ok:true,duplicate:true,settlement});}
 if(d.expected_revision!==settlement.revision)return err('수납 내역이나 예약 금액이 바뀌었습니다. 최신 금액을 확인한 뒤 다시 기록해 주세요.',409,'PAYMENT_CHANGED');
 if(kind==='refund'&&amount>settlement.net)return err('환불 완료액은 현재 수납액보다 클 수 없습니다.');
 const time=now();const net=`${gross('b.booking_code')}-${returned('b.booking_code')}+${manual('b.booking_code','receipt')}-${manual('b.booking_code','refund')}`;
 await batch(env,[env.DB.prepare(`INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) SELECT booking_code,?,?,?,?,? FROM bookings b WHERE booking_code=? AND json_array(CAST(${bookingAmountSql()} AS INTEGER),${gross('b.booking_code')},${returned('b.booking_code')},${manual('b.booking_code','receipt')},${manual('b.booking_code','refund')})=? AND (?='receipt' OR ?<=(${net}))`).bind(id,kind,amount,str(d.note,300),time,code,d.expected_revision,kind,amount),env.DB.prepare('UPDATE bookings SET confirm_doc=NULL,updated_at=? WHERE booking_code=? AND EXISTS(SELECT 1 FROM booking_payment_entries WHERE booking_code=? AND request_id=?)').bind(time,code,code,id)]);
 const saved=await env.DB.prepare('SELECT id FROM booking_payment_entries WHERE booking_code=? AND request_id=?').bind(code,id).first();if(!saved)return err('수납 내역이 변경됐습니다. 다시 불러와 확인해 주세요.',409,'PAYMENT_CHANGED');
 await log(env,'booking.payment.'+kind,code,'admin',{amount,request_id:id,note:str(d.note,300)});
 return json({ok:true,settlement:await settlementFor(env,code)});
}
// Refunding an additional food order must not cancel a booking with other receipts.
export function otherReceiptsSql(code,oid){return `((SELECT COALESCE(SUM(MAX(0,o.price-CASE WHEN o.status='refunded' THEN o.price ELSE MIN(o.price,COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0)) END)),0) FROM orders o WHERE o.booking_code=${code} AND o.oid<>${oid} AND o.test=0 AND o.status IN ('paid','refunded'))+${manual(code,'receipt')}-${manual(code,'refund')})`;}
