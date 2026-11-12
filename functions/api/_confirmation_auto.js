// Prepare the latest confirmation before the financial transaction commits.
import {SPACES} from './_lib.js';
import {cleanDoc,parseDoc} from './_confirm.js';
import {cateringOrderFor} from './_catering_orders.js';
import {confirmationFoodData,foodDocuments,stripFoodItems} from './_food_services.js';
import {receptionDocument,withoutReceptionItems} from './_reception.js';
import S from '../../assets/js/settlement.js';
const PURPOSES={seminar:'강연·세미나',workshop:'워크숍·팀빌딩',networking:'네트워킹·리셉션',community:'커뮤니티 정기 모임',class:'원데이 클래스·멘토링',culture:'공연·상영회',party:'단체 파티·기념행사',popup:'팝업·마켓·전시',shooting:'촬영·콘텐츠','year-end':'송년회'};
const OPTIONS={manager:'현장 매니저',cleaning:'뒷정리·청소',disposable:'1회용 세트',banner:'현수막',xbanner:'X배너'};
const parse=raw=>{try{return JSON.parse(raw||'{}')||{};}catch{return {};}};
// Compare every document source again inside the financial transaction; never overwrite
// another operator's simultaneous document, privacy preference or food-service changes.
export const confirmationSourceSQL=`json_array(b.headcount,b.slot,b.confirm_doc,b.updated_at,(SELECT data FROM inquiries WHERE ref=b.inquiry_ref),(SELECT data FROM quotes WHERE inquiry_ref=b.inquiry_ref ORDER BY id DESC LIMIT 1),(SELECT show_amount FROM booking_reconfirmations WHERE booking_code=b.booking_code ORDER BY id DESC LIMIT 1),(SELECT json_array(id,data,status,total,people,meal_time,updated_at) FROM catering_orders WHERE (b.inquiry_ref IS NOT NULL AND inquiry_ref=b.inquiry_ref) OR booking_code=b.booking_code ORDER BY id DESC LIMIT 1),(SELECT value FROM settings WHERE key='food_revision:'||b.booking_code),(SELECT amount FROM booking_refunds WHERE booking_code=b.booking_code),(SELECT amount_visible FROM booking_journey_state WHERE booking_code=b.booking_code))`;
function defaultRefund(){
 // Same relative fee bands as the shared cancellation calculator.
 return [{k:'예약 후 2시간 이내',rate:1},...[['이용일 15일 이상 전',15],['이용일 8~14일 전',8],['이용일 6~7일 전',6],['이용일 4~5일 전',4],['이용일 3일 전~당일',0]].map(([k,days])=>({k,rate:S.cancellationPolicy('2099-02-01',new Date(Date.parse('2099-02-01T00:00:00+09:00')-days*864e5).toISOString()).rate/10000}))];
}
export function receivedSettlement(s,fee){
 const revision=JSON.parse(s.revision);revision[3]+=fee;
 return {...s,...S.calculate({...s,received:s.received+fee}),manual_received:s.manual_received+fee,revision:JSON.stringify(revision)};
}
export async function prepareCombinedConfirmation(env,code,settlement,fee,deposit,time){
 return prepareSettlementConfirmation(env,code,receivedSettlement(settlement,fee),deposit,time);
}
export async function prepareSettlementConfirmation(env,code,after,deposit,time){
 const row=await env.DB.prepare(`SELECT b.*,(SELECT amount FROM booking_refunds WHERE booking_code=b.booking_code) AS stored_deposit,(SELECT amount_visible FROM booking_journey_state WHERE booking_code=b.booking_code) AS amount_visible,i.data AS idata,(SELECT data FROM quotes WHERE inquiry_ref=b.inquiry_ref ORDER BY id DESC LIMIT 1) AS quote_data,(SELECT show_amount FROM booking_reconfirmations WHERE booking_code=b.booking_code ORDER BY id DESC LIMIT 1) AS show_amount_preference,${confirmationSourceSQL} AS document_revision FROM bookings b LEFT JOIN inquiries i ON i.ref=b.inquiry_ref WHERE b.booking_code=?`).bind(code).first();
 const previous=parseDoc(row.confirm_doc),data=await confirmationFoodData(env,row,await cateringOrderFor(env,row.inquiry_ref||'',code)),quote=parse(row.quote_data),name=data.name||row.customer_name||'',hours=row.start_h!=null&&row.end_h!=null?row.end_h-row.start_h:null;
 if(deposit==null)deposit=row.stored_deposit??previous?.deposit??quote.deposit??150000;
 const items=[(SPACES[row.space_id]||'공간')+' 공간 전체 대관'+(hours?' '+hours+'시간':'')];
 for(const [key,value] of Object.entries(data.options||{}))if(value)items.push((OPTIONS[key]||key)+(typeof value==='object'?' '+(value.count||1)+'명 × '+(value.hours||1)+'시간':''));
 const defaults={customer:name+(data.org&&!name.includes(data.org)?' ('+data.org+')':''),event:PURPOSES[data.purpose]||'',show_amount:row.show_amount_preference==null?row.amount_visible!==0:!!row.show_amount_preference,deposit,items,refund:Array.isArray(quote.refund)?quote.refund:defaultRefund()};
 const doc={...cleanDoc({...defaults,...previous}),issued_at:previous?.issued_at||time,updated_at:time,issue_no:(Number(previous?.issue_no)||0)+1,amount:after.amount,paid:after.net,pay_status:after.status==='unpriced'?'pending':after.status,deposit,settlement:after};
 doc.reception=receptionDocument(data,after.amount);doc.food_services=foodDocuments(data,after.amount);
 doc.items=stripFoodItems(withoutReceptionItems(doc.items));
 return {doc,revision:row.document_revision,previously_issued:!!previous?.issued_at};
}
