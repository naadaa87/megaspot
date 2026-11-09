import {err,hasDb} from '../_lib.js';
import {depositNoticeCron} from '../_deposit_notifications.js';
import {guideTick} from '../_guide_messages.js';
import {transactionNoticeStatus,transactionNoticeTick} from '../_transaction_notifications.js';
export async function onRequest({request,env,params}){
 if(!hasDb(env))return err('준비 중입니다.',503);
 const p=(params.path||[]).join('/');if(!['tick','status'].includes(p))return err('경로를 찾을 수 없습니다.',404);
 try{
  const response=await depositNoticeCron(request,env,p==='status');
  // Reuse the existing authenticated schedule. A status probe remains strictly read-only.
  if(response.ok&&p==='tick')await Promise.allSettled([guideTick(env),transactionNoticeTick(env)]);
  if(response.ok&&p==='status'){
   const query=new URL(request.url).searchParams;
   if(query.get('transactions')==='1')return await transactionNoticeStatus(env,{checkCustomerTemplates:query.get('customer_templates')==='1'});
  }
  return response;
 }catch{return err('알림 처리 결과를 확인해 주세요.',500);}
}
