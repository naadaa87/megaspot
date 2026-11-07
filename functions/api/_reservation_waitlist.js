import {spaceOk} from './_lib.js';

// One definition for the administrator's queue, public counts and payment guards.
export const PENDING_STATUSES_SQL="('문의 접수', '조건 확인', '견적 발송', '결제 대기')";
export const WAIT_ORDER_SQL="CASE WHEN json_extract(i.data, '$.wait_rank') IS NULL THEN 1 ELSE 0 END, CAST(json_extract(i.data, '$.wait_rank') AS INTEGER), COALESCE(json_extract(i.data, '$.wait_restored_at'), i.created_at), i.ref";
export const waitSpaceSql=alias=>`CASE WHEN ${alias}.space_id='megaspot-gundae-2' THEN 'megaspot-gundae-2' ELSE 'megaspot-gundae' END`;
export function pendingInquirySql({alias='waiting',date,space}){
 return `${alias}.status IN ${PENDING_STATUSES_SQL} AND ${alias}.event_date=${date} AND ${waitSpaceSql(alias)}=${space}
   AND NOT EXISTS(SELECT 1 FROM bookings wait_booking WHERE wait_booking.inquiry_ref=${alias}.ref AND wait_booking.status<>'cancelled')`;
}
// SQL expressions are provided by server code only and evaluated in the payment write transaction.
export function noPendingWaitSql({date,space}){
 return `NOT EXISTS(SELECT 1 FROM inquiries waiting WHERE ${pendingInquirySql({date,space})})`;
}
export async function waitList(env,date,space){
 const {results}=await env.DB.prepare(`SELECT i.ref FROM inquiries i WHERE ${pendingInquirySql({alias:'i',date:'?',space:'?'})} ORDER BY ${WAIT_ORDER_SQL}`).bind(date,spaceOk(space)).all();
 return (results||[]).map(row=>row.ref);
}
export async function waitSummary(env,date,space,ref=''){
 const space_id=spaceOk(space),list=await waitList(env,date,space_id),no=ref?list.indexOf(ref)+1:0;
 return {pending_count:list.length,next_wait_no:list.length+1,payment_blocked:list.length>0,wait:no?{no,total:list.length,date,space_id}:null};
}
// Filter dates here. Filter individual inquiries after ranking to preserve the full queue.
export function rankedWaitsSql(dateFilter = '1') {
 const space = waitSpaceSql('i');
 return `SELECT i.ref,i.event_date AS date,${space} AS space_id,
     ROW_NUMBER() OVER(PARTITION BY i.event_date,${space} ORDER BY ${WAIT_ORDER_SQL}) AS no,
     COUNT(*) OVER(PARTITION BY i.event_date,${space}) AS total
   FROM inquiries i
   WHERE ${pendingInquirySql({alias:'i',date:'i.event_date',space})} AND (${dateFilter})`;
}
