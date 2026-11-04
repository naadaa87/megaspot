import {json,err,hasDb,readJson,str,now,randomToken,sha256,sameOrigin,requireAdmin,tooMany,hit,clientIp,log,kstToday} from '../_lib.js';
import {payappConfig,requestPayment,equalSecret} from '../_payapp.js';
import {HOLIDAYS} from '../_catalog.js';
import {onRequest as payRequest} from '../pay/[[path]].js';
import {TICKETS,POLICY,parkingInput,parkingSettings,parkingAdmin,JOIN,publicParking,arrivalWindow} from '../_parking.js';
import {parkingNoticeAdmin,parkingNoticeCron,parkingNoticeAccess} from '../_parking_notifications.js';
import {amanoAdmin,amanoAutomation} from '../_amano_server.js';
import {parkingAdminAlerts} from '../_parking_admin_alerts.js';
export async function onRequest({request,env,params}){
 const path=(params.path||[]).join('/'),method=request.method;
 if(!hasDb(env))return err('서버를 준비 중입니다.',503);
 try{
  if(path==='automation/server')return await amanoAutomation(request,env);
  if(path==='notifications/tick')return await parkingNoticeCron(request,env);
  if(path==='notifications/status')return await parkingNoticeCron(request,env,true);
  if(path==='feedback'&&method==='POST')return await payRequest({request,env,params:{path:['feedback']}});
  if(path.startsWith('admin/')){
   const denied=await requireAdmin(request,env);if(denied)return denied;
   if(method!=='GET'&&!sameOrigin(request))return err('허용되지 않은 요청입니다.',403);
   if(path.startsWith('admin/amano/'))return await amanoAdmin(request,env,path);
   if(path.startsWith('admin/payment-alerts'))return await parkingAdminAlerts(request,env,path);
   if(path.startsWith('admin/notifications'))return await parkingNoticeAdmin(request,env,path);
   return await parkingAdmin(request,env,path);
  }
  const settings=await parkingSettings(env),C=payappConfig(env),publicSettings={enabled:settings.enabled,daily_enabled:settings.daily_enabled,daily_basis:settings.daily_enabled?settings.daily_basis:'calendar',daily_terms:settings.daily_enabled?settings.daily_terms:'',service_hours:settings.service_hours,processing_notice:settings.processing_notice};
  if(path==='config'&&method==='GET')return json({ok:true,...publicSettings,enabled:settings.enabled&&C.live,tickets:Object.fromEntries(Object.entries(TICKETS).map(([id,t])=>[id,{...t,available:id!=='daily'||settings.daily_enabled}])),policy:POLICY,holidays:Object.keys(HOLIDAYS),accepting_arrivals:arrivalWindow()});
  if(method==='POST'&&!sameOrigin(request))return err('허용되지 않은 요청입니다.',403);
  if(method==='POST'){
   const key='parking:'+clientIp(request);if(await tooMany(env,key,30,10))return err('요청이 많습니다. 잠시 후 다시 시도해 주세요.',429);await hit(env,key,10);
  }
  if(path==='prepare'&&method==='POST'){
   if(!settings.enabled||!C.live)return err('주차권 온라인 판매를 준비 중입니다. 카카오톡으로 문의해 주세요.',503);
   const d=await readJson(request),v=parkingInput(d,{dailyAllowed:settings.daily_enabled});if(v.error)return err(v.error);
   if(v.ticket==='daily'&&str(d.daily_terms,500)!==settings.daily_terms)return err('일일권 이용 조건이 변경되었습니다. 새로고침 후 확인해 주세요.',409);
   if(v.date===kstToday()&&!arrivalWindow())return err('당일 주차권은 평일 10:00–17:50에 구매·입차 알림이 가능합니다. 다른 날짜를 선택하거나 카카오톡으로 문의해 주세요.');
   // The UI requires an explicit extra-purchase confirmation. Do not reveal other buyers' orders.
   const duplicate=await env.DB.prepare("SELECT COUNT(*) AS n FROM parking_orders p JOIN orders o ON o.oid=p.oid WHERE p.plate=? AND p.visit_date=? AND o.status='paid'").bind(v.plate,v.date).first();
   if(duplicate.n&&!d.confirm_extra)return err('동일 차량·이용일에 결제된 주차권이 있습니다. 추가 구매가 맞는지 확인해 주세요.',409,'EXTRA_CONFIRM');
   const oid='MS'+new Date(Date.now()+9*3600e3).toISOString().replace(/[-:T]/g,'').slice(0,14)+(await sha256(randomToken())).slice(0,6).toUpperCase(),t=now(),key=await sha256(randomToken()),nonce=randomToken();
   const title='메가스팟 주차 '+v.label;
   await env.DB.batch([
    env.DB.prepare("INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,test,created_at) VALUES(?,?,?,?,?,?,?,?,'created',0,?)").bind(oid,'parking-'+v.ticket,title,v.date,v.price,v.name,v.phone,JSON.stringify({kind:'parking',policy:POLICY,daily_terms:v.ticket==='daily'?settings.daily_terms:'',agree_daily:v.ticket==='daily'&&d.agree_daily===true,confirmed_at:t,lines:[{label:title,desc:v.date,amount:v.price,qty:1}]}),t),
    env.DB.prepare('INSERT INTO parking_orders(oid,plate,visit_date,ticket,hours,daily_terms,token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(oid,v.plate,v.date,v.ticket,v.hours,v.ticket==='daily'?settings.daily_terms:'',await sha256(key),t,t),
    env.DB.prepare('INSERT INTO payapp_payments(oid,nonce,created_at) VALUES(?,?,?)').bind(oid,nonce,t)
   ]);
   const origin=new URL(request.url).origin;let payment;
   try{payment=await requestPayment(C,{goodname:title,price:String(v.price),recvphone:v.phone,reqaddr:'0',smsuse:'n',checkretry:'y',skip_cstpage:'y',feedbackurl:origin+'/api/parking/feedback',returnurl:origin+'/parking/purchase/?oid='+oid,var1:oid,var2:nonce});}
   catch{await env.DB.prepare("UPDATE orders SET result_msg='결제 요청 확인 필요',updated_at=? WHERE oid=?").bind(now(),oid).run();return json({ok:false,error:'결제 요청 결과를 확인 중입니다. 주문 상태를 확인해 주세요.',oid,key},502);}
   if(!payment.ok){await env.DB.prepare("UPDATE orders SET status='failed',result_msg='페이앱 요청 거절',updated_at=? WHERE oid=? AND status='created'").bind(now(),oid).run();return err('결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.',502);}
   const bound=await env.DB.prepare('UPDATE payapp_payments SET mul_no=? WHERE oid=? AND (mul_no IS NULL OR mul_no=?)').bind(payment.mulNo,oid,payment.mulNo).run();
   if(!bound.meta?.changes)throw Error('PAYMENT_BINDING');
   await log(env,'parking.created',oid,'customer',{ticket:v.ticket,date:v.date,price:v.price});
   return json({ok:true,oid,key,payurl:payment.payurl,total:v.price});
  }
  const m=path.match(/^orders\/([A-Z0-9]+)(?:\/(arrive|cancel-request))?$/);
  if(!m)return err('경로를 찾을 수 없습니다.',404);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^[0-9a-f]{64}$/.test(token))return err('구매 내역 확인 링크가 필요합니다.',403);
  const p=await env.DB.prepare(JOIN+' WHERE p.oid=?').bind(m[1]).first();
  if(!p||(!equalSecret(await sha256(token),p.token_hash)&&!await parkingNoticeAccess(env,p.oid,token)))return err('구매 내역을 확인할 수 없습니다.',403);
  if(!m[2]&&method==='GET')return json({ok:true,order:publicParking(p),...publicSettings,accepting_arrivals:arrivalWindow()});
  if(method!=='POST')return err('지원하지 않는 요청입니다.',405);
  if(p.payment_status!=='paid'||p.refunded_amount>0)return err('결제·환불 상태를 먼저 확인해 주세요.',409);
  if(m[2]==='arrive'){
   if(p.visit_date!==kstToday()||!arrivalWindow())return err('이용일의 평일 10:00–17:50에 입차 후 알려 주세요. 그 외 시간은 카카오톡으로 문의해 주세요.',409);
   if(p.refund_requested_at&&!p.refund_reviewed_at)return err('취소 요청 검토 중입니다.',409);
   await env.DB.prepare("UPDATE parking_orders SET arrival_at=COALESCE(arrival_at,?),status=CASE WHEN status='waiting' THEN 'requested' ELSE status END,updated_at=? WHERE oid=? AND status IN ('waiting','requested') AND (refund_requested_at IS NULL OR refund_reviewed_at IS NOT NULL)").bind(now(),now(),p.oid).run();
  }else{
   const d=await readJson(request),reason=str(d.reason,300);if(!reason)return err('취소 문의 사유를 입력해 주세요.');
   await env.DB.prepare('UPDATE parking_orders SET refund_requested_at=?,refund_reason=?,refund_reviewed_at=NULL,updated_at=? WHERE oid=?').bind(now(),reason,now(),p.oid).run();
  }
  await log(env,'parking.'+m[2],p.oid,'customer',{});return json({ok:true});
 }catch(e){console.error('parking',String(e?.message||e));return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',500);}
}
