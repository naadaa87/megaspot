// Both manual and automatic arrival senders claim against the other's in-flight results.
const ACTIVE="('sending','accepted','unknown','delivered')";
export function noManualArrivalSql(alias='b'){
 return `NOT EXISTS(SELECT 1 FROM booking_guide_messages gm JOIN booking_guide_state gs ON gs.booking_code=gm.booking_code WHERE gm.booking_code=${alias}.booking_code AND gm.mode='live' AND gm.actor='admin' AND gm.status IN ${ACTIVE} AND json_extract(gm.snapshot,'$.phone')=? AND COALESCE(json_extract(gm.snapshot,'$.revision'),0)=gs.revision AND json_extract(gm.snapshot,'$.date')=${alias}.date AND datetime(gm.created_at)>=datetime(${alias}.date,'-1 day','-9 hours'))`;
}
export function noAutomaticArrivalSql(alias='b'){
 return `NOT EXISTS(SELECT 1 FROM transaction_notifications tn JOIN booking_journey_state js ON js.booking_code=tn.booking_code WHERE tn.booking_code=${alias}.booking_code AND tn.kind='booking_arrival' AND tn.audience='customer' AND replace(replace(tn.receiver,'-',''),' ','')=? AND tn.status IN ${ACTIVE} AND (tn.booking_snapshot=json_array(${alias}.space_id,${alias}.date,${alias}.start_h,${alias}.end_h,${alias}.slot,${alias}.customer_name) OR (tn.booking_snapshot IS NULL AND COALESCE((SELECT revision FROM booking_guide_state oldgs WHERE oldgs.booking_code=${alias}.booking_code),0)=0)) AND tn.event_key='journey-arrival:'||${alias}.booking_code||':'||js.confirm_version||':'||${alias}.date)`;
}
