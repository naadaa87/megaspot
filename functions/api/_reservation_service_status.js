// Status-only changes preserve agreed food prices and configurations.
import {json,err,readJson,now} from './_lib.js';
import {inquiryAmountSql} from './_amounts.js';
import {F,updateFood,directFoodRevision} from './_food_services.js';
import {syncReceptionInput} from './_reception.js';
import Calculation from '../../assets/js/quote-calculation.js';
const statuses=['pending','confirmed','cancelled'];
const safe=v=>{try{return JSON.parse(v||'{}')||{};}catch{return {};}};
const count=r=>Number(r?.meta?.changes??r?.changes??0);
const active="status NOT IN ('cancelled','취소·환불','대기 취소','삭제됨')";
function ready(kind,value){
 if(!value||value.removed)return false;
 if(kind==='reception')return Number(value.people)>0&&!!value.format&&value.total!=null&&Number(value.total)>0;
 if(kind==='cocktail')return [100,200,300,400].includes(Number(value.cups))&&F.amount(kind,{...value,status:'pending'})>0;
 return F.amount(kind,{...value,status:'pending'})>0&&!!(value.course||value.bbq||value.beer);
}
export async function reservationServiceStatus({env,request,path,method}){
 const m=path.match(/^reservation-services\/(booking|inquiry)\/([A-Z0-9-]{1,40})\/(catering|reception|cocktail)$/);if(!m)return null;
 if(!['GET','PUT'].includes(method))return err('지원하지 않는 요청입니다.',405);
 const [,type,ref,kind]=m;
 let booking=null,inquiry=null;
 if(type==='booking'){
  booking=await env.DB.prepare('SELECT booking_code,inquiry_ref,customer_name,amount,status FROM bookings WHERE booking_code=?').bind(ref).first();
  if(!booking)return err('예약을 찾을 수 없습니다.',404);
 }
 const inquiryRef=type==='inquiry'?ref:booking.inquiry_ref;
 if(inquiryRef)inquiry=await env.DB.prepare(`SELECT ref,name,status,data,${inquiryAmountSql()} AS effective_amount FROM inquiries i WHERE ref=?`).bind(inquiryRef).first();
 if((inquiryRef&&!inquiry)||(!booking&&!inquiry))return err('문의를 찾을 수 없습니다.',404);
 if([booking?.status,inquiry?.status].some(s=>['cancelled','취소·환불','대기 취소','삭제됨'].includes(s)))return err('취소·삭제된 예약이나 문의는 복원한 뒤 변경해 주세요.',409,'TARGET_CANCELLED');
 const data=safe(inquiry?.data);
 const order=kind==='catering'?await env.DB.prepare("SELECT * FROM catering_orders WHERE (?<>'' AND inquiry_ref=?) OR (?<>'' AND booking_code=?) ORDER BY id DESC LIMIT 1").bind(inquiryRef||'',inquiryRef||'',booking?.booking_code||'',booking?.booking_code||'').first():null;
 const value=order?{...safe(order.data),total:order.total,status:order.status,order_ref:order.ref,meal_time:order.meal_time||''}:data[kind];
 if(!value||typeof value!=='object'||Array.isArray(value)||value.removed||!Object.keys(value).length)return err('저장된 식음료 구성이 없습니다. 식음료 서비스에서 먼저 구성해 주세요.',404,'SERVICE_MISSING');
 const revision=inquiry?Number(data.reception_revision)||0:await directFoodRevision(env,ref),status=statuses.includes(value.status)?value.status:'pending';
 const info={kind,status,revision,can_confirm:ready(kind,value),name:inquiry?.name||booking?.customer_name||'',inquiry_ref:inquiryRef||'',configuration_view:{catering:'catering',reception:'reception',cocktail:'cocktail'}[kind]};
 if(method==='GET')return json({ok:true,...info});
 const d=await readJson(request);
 if(!statuses.includes(d.status)||!Number.isSafeInteger(d.expected_revision)||d.expected_revision<0)return err('진행 상태와 저장 버전을 확인해 주세요.');
 if(d.expected_revision!==revision)return err('다른 화면에서 식음료 구성이 변경됐습니다. 최신 내용을 확인한 뒤 다시 변경해 주세요.',409,'SERVICE_CHANGED');
 if(d.status==='confirmed'&&!info.can_confirm)return err('코스·인원·금액을 먼저 정한 뒤 확정해 주세요. 식음료 서비스에서 구성을 확인할 수 있습니다.',409,'SERVICE_INCOMPLETE');
 if(d.status===status)return json({ok:true,...info,unchanged:true});
 const time=now(),nextValue={...value,status:d.status},statements=[];
 if(kind==='catering')nextValue.status_label={pending:'대기',confirmed:'확정',cancelled:'취소'}[d.status];
 let next,guard,guardArgs;
 if(inquiry){
  const included=Number(data['included_'+kind+'_amount'])||0,include=included>0||!!data[kind+'_in_quote'];
  if(kind==='reception'){
   next={...data,reception:nextValue,reception_revision:revision+1};
   if(include&&inquiry.effective_amount!=null){const amount=d.status==='cancelled'?0:Number(value.total)||0;next.total=Math.max(0,inquiry.effective_amount-included+amount);next.amount_override=true;next.included_reception_amount=amount;}
   if(data.quote_input)next.quote_input=F.syncQuote(syncReceptionInput(data.quote_input,next,include),next);
  }else{
   const base={...data};if(include&&inquiry.effective_amount!=null)base.total=inquiry.effective_amount;
   next=updateFood(base,kind,nextValue).data;next.reception_revision=revision+1;
  }
  if(next.quote_input&&data.amount_mode==='quote'&&data.quote_no){
   const quote=await env.DB.prepare('SELECT quote_no,data FROM quotes WHERE quote_no=? AND inquiry_ref=?').bind(data.quote_no,inquiry.ref).first();
   const text=quote&&Calculation.inquiry({data:next,effective_amount:next.total??inquiry.effective_amount},[{...quote,data:safe(quote.data)}]).text;
   if(text)Object.assign(next,{estimate:text,estimate_admin:true,estimate_quote_no:data.quote_no});
  }
  const encoded=JSON.stringify(next),bookingGuard=booking?` AND EXISTS(SELECT 1 FROM bookings WHERE booking_code=? AND ${active})`:'';
  statements.push(env.DB.prepare(`UPDATE inquiries SET data=?,updated_at=? WHERE ref=? AND data IS ? AND ${active}${bookingGuard}`).bind(encoded,time,inquiry.ref,inquiry.data,...(booking?[ref]:[])));
  guard='EXISTS(SELECT 1 FROM inquiries WHERE ref=? AND data=?)';guardArgs=[inquiry.ref,encoded];
  statements.push(env.DB.prepare(`UPDATE bookings SET confirm_doc=NULL,updated_at=?${include&&inquiry.effective_amount!=null?',amount=?':''} WHERE inquiry_ref=? AND status<>'cancelled' AND ${guard}`).bind(time,...(include&&inquiry.effective_amount!=null?[next.total]:[]),inquiry.ref,...guardArgs));
  if(order)statements.push(env.DB.prepare(`UPDATE catering_orders SET status=?,data=?,updated_at=? WHERE ref=? AND ${guard}`).bind(d.status,JSON.stringify({...safe(order.data),status:d.status}),time,order.ref,...guardArgs));
 }else{
  // Legacy direct bookings can have a buffet order without an inquiry.
  if(!order||kind!=='catering')return err('연결된 식음료 진행 건을 찾을 수 없습니다.',404);
  const previous=safe(order.data),include=!!previous.include_in_booking,oldAmount=Number(previous.included_amount)||0,newAmount=include&&d.status!=='cancelled'?Number(order.total)||0:0;
  const orderData=JSON.stringify({...previous,status:d.status,included_amount:newAmount,food_revision:revision+1});
  statements.push(env.DB.prepare(`UPDATE catering_orders SET status=?,data=?,updated_at=? WHERE ref=? AND status=? AND data IS ? AND EXISTS(SELECT 1 FROM bookings WHERE booking_code=? AND amount IS ? AND ${active}) AND COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key=?),0)=?`).bind(d.status,orderData,time,order.ref,order.status,order.data,ref,booking.amount,'food_revision:'+ref,revision));
  guard='EXISTS(SELECT 1 FROM catering_orders WHERE ref=? AND data=?)';guardArgs=[order.ref,orderData];
  statements.push(env.DB.prepare(`UPDATE bookings SET confirm_doc=NULL,updated_at=?${include||oldAmount>0?',amount=?':''} WHERE booking_code=? AND ${guard}`).bind(time,...(include||oldAmount>0?[Math.max(0,Number(booking.amount)-oldAmount+newAmount)]:[]),ref,...guardArgs));
  statements.push(env.DB.prepare(`INSERT INTO settings(key,value,updated_at) SELECT ?,?,? WHERE ${guard} ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind('food_revision:'+ref,String(revision+1),time,...guardArgs));
 }
 statements.push(env.DB.prepare(`INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'reservation.service_status',?,'admin',?,? WHERE ${guard}`).bind(inquiryRef||ref,JSON.stringify({target_type:type,target_ref:ref,kind,from:status,status:d.status}),time,...guardArgs));
 const result=await env.DB.batch(statements);
 if(!count(result[0]))return err('다른 화면에서 예약이나 식음료를 변경했습니다. 최신 내용을 확인한 뒤 다시 변경해 주세요.',409,'SERVICE_CHANGED');
 return json({ok:true,...info,status:d.status,revision:revision+1,confirm_doc_invalidated:true});
}
