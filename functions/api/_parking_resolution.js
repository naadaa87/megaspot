import {json,err,now} from './_lib.js';
export const PARKING_RESOLUTIONS={manual_registered:'아마노 수동 등록 완료',exited:'등록 전 출차 · 처리 확인',other:'기타 처리 완료'};
export async function resolveParkingOrder(env,p,d){
 if(p.status==='resolved')return json({ok:true,already_resolved:true});
 if(!['waiting','requested','issue'].includes(p.status))return err('등록 중인 건은 결과를 확인한 뒤 처리해 주세요. 이미 등록 완료된 건은 다시 완료 처리할 수 없습니다.',409);
 if(!['paid','refunded'].includes(p.payment_status))return err('결제 내역을 먼저 확인해 주세요.',409);
 if(p.refund_requested_at&&!p.refund_reviewed_at)return err('취소·정정 문의를 먼저 검토 완료한 뒤 확인 완료 처리해 주세요.',409);
 const type=d.resolution_type,reason=typeof d.resolution_memo==='string'?d.resolution_memo.trim():'';
 if(typeof type!=='string'||!Object.hasOwn(PARKING_RESOLUTIONS,type)||!reason||reason.length>500||d.confirm_resolved!==true)return err('처리 구분과 확인 사유를 입력하고 처리 결과 확인에 체크해 주세요.');
 if(d.expected_status!==p.status||d.expected_updated_at!==p.updated_at)return err('다른 요청에서 상태가 변경되었습니다. 새로고침 후 확인해 주세요.',409);
 const t=now(),id=crypto.randomUUID(),detail=JSON.stringify({resolution_id:id,type,label:PARKING_RESOLUTIONS[type],reason,previous:{status:p.status,memo:p.memo,session_id:p.session_id,entry_id:p.entry_id,free_hours:p.free_hours,paid_hours:p.paid_hours,cost:p.cost,applied_at:p.applied_at},confirmed_at:t});
 const memo=[p.memo,'[관리자 확인 완료 · '+PARKING_RESOLUTIONS[type]+'] '+reason].filter(Boolean).join('\n\n');
 const owns="EXISTS(SELECT 1 FROM event_log WHERE kind='parking.resolved' AND ref=? AND json_extract(detail,'$.resolution_id')=?)";
 const result=await env.DB.batch([
  env.DB.prepare("UPDATE parking_orders SET status='resolved',memo=?,updated_at=? WHERE oid=? AND status=? AND updated_at=? AND (refund_requested_at IS NULL OR refund_reviewed_at IS NOT NULL) AND EXISTS(SELECT 1 FROM orders WHERE oid=? AND status IN ('paid','refunded'))").bind(memo,t,p.oid,p.status,p.updated_at,p.payment_id),
  env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'parking.resolved',?,'admin',?,? WHERE changes()=1").bind(p.oid,detail,t),
  env.DB.prepare("INSERT OR IGNORE INTO admin_parking_payment_reads(oid,read_at) SELECT ?,? WHERE "+owns).bind(p.oid,t,p.oid,id),
  env.DB.prepare("UPDATE parking_notifications SET status='cancelled',error='관리자 확인 완료',updated_at=? WHERE oid=? AND mode='live' AND status='queued' AND kind IN ('paid','arrival_received','issue') AND "+owns).bind(t,p.oid,p.oid,id),
  env.DB.prepare("UPDATE parking_admin_sms SET status='cancelled',error='관리자 확인 완료',updated_at=? WHERE oid=? AND mode='live' AND status='queued' AND "+owns).bind(t,p.oid,p.oid,id)
 ]);
 if(!Number(result[0]?.meta?.changes??result[0]?.changes))return err('다른 요청에서 상태가 변경되었습니다. 새로고침 후 확인해 주세요.',409);
 return json({ok:true,status:'resolved'});
}
