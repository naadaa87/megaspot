import {err,hasDb} from '../_lib.js';
import {depositNoticeCron} from '../_deposit_notifications.js';
import {approvedCustomerTemplate} from '../_customer_alimtalk.js';
import {aligoProvider} from '../_guide_messages.js';
import {keyReady} from '../_deposit_refunds.js';
import {json,now} from '../_lib.js';
import {bookingJourneyTick} from '../_booking_journey.js';
import {guideTick} from '../_guide_messages.js';
import {transactionNoticeStatus,transactionNoticeTick} from '../_transaction_notifications.js';
export async function onRequest({request,env,params}){
 if(!hasDb(env))return err('준비 중입니다.',503);
 const p=(params.path||[]).join('/');if(!['tick','status','journey-setup'].includes(p))return err('경로를 찾을 수 없습니다.',404);
 try{
  const setup=p==='journey-setup'?await request.clone().json().catch(()=>null):null;
  const response=await depositNoticeCron(request,env,p!=='tick');
  if(response.ok&&p==='journey-setup'){
   if(setup?.action!=='enable_booking_journey')return err('서명된 설정 작업을 확인해 주세요.',400);
   if(!keyReady(env)||!await approvedCustomerTemplate(env,(path,data)=>aligoProvider(env,path,data),'booking_confirmed'))return err('통합 링크 암호화·예약 확정 템플릿 승인을 확인해 주세요.',409);
   await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES('booking_journey','{\"enabled\":true}',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(now()).run();
   await env.DB.prepare("UPDATE booking_guide_messages SET status='cancelled',error='예약 확정은 통합 링크로 안내합니다.',updated_at=? WHERE mode='live' AND actor='automatic' AND status='queued'").bind(now()).run();
   return json({ok:true,enabled:true});
  }
  // Reuse the existing authenticated schedule. A status probe remains strictly read-only.
  if(response.ok&&p==='tick'){await bookingJourneyTick(env);await Promise.allSettled([guideTick(env),transactionNoticeTick(env)]);}
  if(response.ok&&p==='status'){
   const query=new URL(request.url).searchParams;
   if(query.get('transactions')==='1')return await transactionNoticeStatus(env,{checkCustomerTemplates:query.get('customer_templates')==='1'});
  }
  return response;
 }catch{return err('알림 처리 결과를 확인해 주세요.',500);}
}
