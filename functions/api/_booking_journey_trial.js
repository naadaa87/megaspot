// Isolated operator fixture: no bookings, orders, receipts, calendar blocks or bank transfers.
import {err,json,now,sha256,randomToken,SPACES,kstToday} from './_lib.js';
import {seal,unseal,keyReady} from './_deposit_refunds.js';
import {cleanDoc,publicDoc} from './_confirm.js';
import S from '../../assets/js/settlement.js';
import {portalGuideMessage} from './_guide_portal.js';
import {approvedCustomerTemplate,customerFallback} from './_customer_alimtalk.js';
import {aligoProvider,guidePhone} from './_guide_messages.js';

export async function trialPortalResponse(env,request,path){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const row=await env.DB.prepare('SELECT payload FROM booking_journey_trials WHERE token_hash=? AND expires_at>?').bind(await sha256(token),Date.now()).first();
 if(!row)return null;
 if(path!=='view'||request.method!=='GET')return err('시험 예약에서는 실제 계좌 등록이나 입금을 처리하지 않습니다.',409);
 return json(JSON.parse(row.payload));
}
export async function bookingJourneyTrial(env,d){
 const receiver=guidePhone(d?.receiver),id=d?.test_id;
 if(d?.action!=='send_booking_deposit_test'||d?.confirm_test!==true||!receiver||!/^[a-f0-9-]{36}$/.test(id||''))return err('운영자 시험 수신 번호와 시험 요청을 확인해 주세요.');
 const staff=await env.DB.prepare("SELECT value FROM settings WHERE key='parking_admin_alerts'").first();
 const allowed=JSON.parse(staff?.value||'{}').phones||[];
 if(!allowed.some(phone=>guidePhone(phone)===receiver))return err('등록된 운영자 본인 번호로만 시험할 수 있습니다.',403);
 if(!keyReady(env)||env.ALIGO_LIVE_ENABLED!=='true')return err('통합 링크와 운영 발송 설정을 확인해 주세요.',409);
 const saved=await env.DB.prepare('SELECT t.*,n.status,n.error FROM booking_journey_trials t JOIN transaction_notifications n ON n.id=t.notification_id WHERE t.id=?').bind(id).first();
 if(saved){
  const phone=await env.DB.prepare('SELECT receiver FROM transaction_notifications WHERE id=?').bind(saved.notification_id).first();
  if(phone.receiver!==receiver)return err('다른 수신자에게 사용한 시험 요청번호입니다.',409);
  return json({ok:true,duplicate:true,id,notification_id:saved.notification_id,status:saved.status,error:saved.error,url:'https://megaspot.kr/booking/#booking='+await unseal(env,id,'booking-trial',saved.link_cipher)});
 }
 if(await env.DB.prepare("SELECT id FROM booking_journey_trials WHERE created_at>=datetime('now','-1 minute') LIMIT 1").first())return err('실제 시험 발송은 1분 뒤 다시 요청해 주세요.',429);
 const provider=(path,data,requestId)=>aligoProvider(env,path,data,requestId);
 const template=await approvedCustomerTemplate(env,provider,'booking_confirmed');
 if(!template)return err('예약 확정 알림톡 승인을 확인해 주세요.',409);
 const code='TEST-'+id.slice(0,8).toUpperCase(),date=kstToday(35),at=now(),token=randomToken();
 const b={booking_code:code,space_id:'megaspot-gundae',customer_name:'운영자 시험 예약',phone:receiver,date,start_h:10,end_h:17,headcount:20,status:'confirmed'};
 const settlement=S.calculate({amount:500000,received:100000,refunded:0});
 const document={...cleanDoc({customer:b.customer_name,event:'알림톡·통합 링크 시험',amount:500000,paid:100000,deposit:150000,pay_status:'deposit',show_amount:true,items:['운영자 시험용 · 실제 예약이 아닙니다.'],note:'가상 수납 내역입니다. 실제 입금하지 마세요.'}),issued_at:at,updated_at:at,issue_no:1,settlement};
 const payload={ok:true,booking:{code,name:b.customer_name,phone:'010-****-'+receiver.slice(-4),space:{name:SPACES[b.space_id]},date,start_h:10,end_h:17,headcount:20,status:'confirmed',ended:false,test:true,updated_at:at},confirmation:publicDoc(b,document),payment:{amount_visible:true,total:500000,received:100000,refunded:0,paid:100000,balance:400000,refund_due:0,due_date:kstToday(32),complete:false},deposit:{amount:150000,amount_visible:true,paid:false,returned:false,due_date:kstToday(32),refund_date:null,account:{registered:false,state:'pending',available:false,purged:false}},arrival:{space:SPACES[b.space_id],address:'서울시 광진구 능동로13길 39, 2층',checkin:'예약 시작 시간부터',checkout:'예약 종료 시간까지',ready:false,message:'운영자 시험 예약입니다. 실제 공간 예약과 입실은 처리하지 않습니다.',note:'가상 수납 내역입니다. 실제 입금하지 마세요.'}};
 const cipher=await seal(env,id,'booking-trial',token),key='journey-trial:'+id,url='https://megaspot.kr/booking/#booking='+token;
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO transaction_notifications(event_key,kind,audience,ref,receiver,status,request_id,error,occurred_at) VALUES(?,'booking_confirmed_test','customer',?,?,'sending',?,'운영자 시험 발송',?)").bind(key,code,receiver,id,at),
   env.DB.prepare('INSERT INTO booking_journey_trials(id,token_hash,link_cipher,payload,notification_id,expires_at,created_at) SELECT ?,?,?,?,id,?,? FROM transaction_notifications WHERE event_key=?').bind(id,await sha256(token),cipher,JSON.stringify(payload),Date.now()+86400000,at,key)
  ]);
 }catch{return err('시험이 이미 요청되었거나 저장하지 못했습니다. 같은 시험 요청번호로 상태를 확인해 주세요.',409);}
 const notification=await env.DB.prepare('SELECT notification_id FROM booking_journey_trials WHERE id=?').bind(id).first();
 let status='unknown',mid=null,error='접수 결과 확인 필요 · 같은 요청을 다시 보내도 중복 발송하지 않습니다.';
 try{
  const buttons=template.buttons.map(button=>({...button,linkMo:url,linkPc:url})),message=portalGuideMessage(b,[10,17]);
  const result=await provider('alimtalk/send',{tpl_code:template.code,receiver_1:receiver,subject_1:'메가스팟 예약 확정 시험',message_1:message.replace(/\n/g,template.content.includes('\r\n')?'\r\n':'\n'),button_1:JSON.stringify({button:buttons}),...customerFallback('메가스팟 예약 확정 시험',message,buttons)},id);
  if(result?.code!=null&&/^-?\d+$/.test(String(result.code))){
   if(Number(result.code)!==0){status='failed';error='알림톡 접수 거절 ('+Number(result.code)+')';}
   else if(/^\d{1,30}$/.test(String(result.info?.mid||''))&&Number(result.info?.scnt)===1&&Number(result.info?.fcnt||0)===0){status='accepted';mid='at:'+template.code+':'+result.info.mid;error='운영자 시험 · 수신 결과 확인 중';}
  }
 }catch{}
 await env.DB.prepare('UPDATE transaction_notifications SET status=?,provider_mid=?,error=?,updated_at=? WHERE id=?').bind(status,mid,error,now(),notification.notification_id).run();
 return json({ok:true,id,notification_id:notification.notification_id,status,url,trial:true,amount:500000,paid:100000,balance:400000,deposit:150000});
}
