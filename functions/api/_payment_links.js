import {json,err,readJson,str,isDate,isEmail,now,kstToday,SPACES,randomToken,sha256,sameOrigin,log,clientIp,tooMany,hit} from './_lib.js';
import {payappConfig,payappFeedbackConfig,requestPayment,payappUrl,equalSecret} from './_payapp.js';
import {recordPayappRefund} from './_payapp_refunds.js';
import {preserveLegacyPayments} from './_settlement.js';

const SERVICES={rental:'대관비',catering:'출장뷔페',other:'기타 이용료'},PURPOSES={deposit:'예약금',balance:'잔금',full:'전액'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,TOKEN=/^[A-Za-z0-9_-]{43}$/;
const changes=r=>Number(r?.meta?.changes??r?.changes??0),parse=s=>{try{return JSON.parse(s||'{}')||{};}catch{return {};}};
const snapshot=b=>JSON.stringify([b.booking_code,b.status,b.customer_name,b.phone,b.space_id,b.date,b.start_h,b.end_h,b.headcount,b.amount,b.inquiry_ref]);
const snapshotSql=a=>`json_array(${a}.booking_code,${a}.status,${a}.customer_name,${a}.phone,${a}.space_id,${a}.date,${a}.start_h,${a}.end_h,${a}.headcount,${a}.amount,${a}.inquiry_ref)`;
const SELECT=`SELECT l.*,o.status AS order_status,o.buyer_phone,o.result_msg,p.merchant_userid,
 (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds r WHERE r.oid=l.order_oid) AS refunded_amount
 FROM payment_links l LEFT JOIN orders o ON o.oid=l.order_oid LEFT JOIN payapp_payments p ON p.oid=l.order_oid`;
const pending=()=>err('이미 요청한 결제의 결과를 확인하고 있습니다. 중복 결제하지 말고 잠시 후 다시 확인하거나 운영팀에 문의해 주세요.',409,'PAYMENT_PENDING');
function text(value,max){return typeof value==='string'&&value.trim().length<=max?value.trim():'';}
function status(row){
 if(row.order_status==='paid')return 'paid';if(row.order_status==='refunded')return 'refunded';
 if(row.order_oid)return ['requesting','requested'].includes(row.attempt_state)&&['created','pending'].includes(row.order_status)?'processing':'attention';
 return row.status==='closed'?'closed':row.expires_at<=Date.now()?'expired':'open';
}
function paymentEnabled(env,row){return row.order_oid?env.PAYAPP_ENABLED!=='0'&&!!payappFeedbackConfig(env,{userid:row.merchant_userid}):payappConfig(env).live;}
function originFor(env,request){const origin=env.SITE_URL||new URL(request.url).origin;try{const u=new URL(origin);return u.origin;}catch{return new URL(request.url).origin;}}
function view(env,row,request,admin=false){
 const state=status(row),out={id:row.id,service:row.service,purpose:row.purpose,title:row.title,description:row.description,amount:row.amount,
  event_date:row.event_date,space_id:row.space_id,space_name:SPACES[row.space_id]||'',headcount:row.headcount,start_h:row.start_h,end_h:row.end_h,
  booking_code:row.booking_code,expires_at:row.expires_at,created_at:row.created_at,status:state,state,oid:row.order_oid,order_oid:row.order_oid,order_status:row.order_status,
  refunded_amount:Math.min(row.amount,row.refunded_amount||0),payment_enabled:paymentEnabled(env,row),can_close:state==='open'&&!row.order_oid,
  needs_review:row.order_status==='paid'&&String(row.result_msg||'').includes('확인 필요')};
 if(admin)out.url=originFor(env,request)+'/payment/?link='+row.token;
 return out;
}
function normalize(d){
 if(!UUID.test(d.request_id||''))return {error:'다시 불러온 뒤 결제 링크를 만들어 주세요.'};
 if(!Object.hasOwn(SERVICES,d.service)||!Object.hasOwn(PURPOSES,d.purpose))return {error:'결제 항목과 예약금·잔금·전액 구분을 선택해 주세요.'};
 const title=text(d.title,100),description=text(d.description,3000);
 if(!title||/[\r\n\u0000-\u001f]/.test(title)||/(?:\b[a-z][a-z\d+.-]*:|www\.)/i.test(title))return {error:'결제명은 링크 주소 없이 100자 이내로 입력해 주세요.'};
 if(!description||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(description))return {error:'고객에게 표시할 상세 설명을 3,000자 이내로 입력해 주세요.'};
 if(!Number.isSafeInteger(d.amount)||d.amount<1000||d.amount>100000000)return {error:'결제 금액은 1,000원부터 100,000,000원 사이의 정수로 입력해 주세요.'};
 const event_date=d.event_date||null,space_id=d.space_id||null,booking_code=d.booking_code||null,expires_on=d.expires_on||null;
 if(event_date&&!isDate(event_date))return {error:'이용일을 확인해 주세요.'};
 if(space_id&&!Object.hasOwn(SPACES,space_id))return {error:'메가스팟 건대 1호 또는 2호를 선택해 주세요.'};
 if(booking_code&&!/^[A-Z0-9-]{1,40}$/.test(booking_code))return {error:'연결할 예약번호를 확인해 주세요.'};
 const optionalInt=(v,min,max)=>v==null||v===''?null:Number.isSafeInteger(v)&&v>=min&&v<=max?v:NaN;
 const hour=(v,min,max)=>v==null||v===''?null:typeof v==='number'&&Number.isFinite(v)&&Number.isInteger(v*2)&&v>=min&&v<=max?v:NaN;
 const headcount=optionalInt(d.headcount,1,10000),start_h=hour(d.start_h,0,30.5),end_h=hour(d.end_h,0.5,31);
 if([headcount,start_h,end_h].some(Number.isNaN)||(start_h==null)!==(end_h==null)||(start_h!=null&&end_h<=start_h))return {error:'인원과 이용 시작·종료 시간을 확인해 주세요.'};
 if(expires_on&&!isDate(expires_on))return {error:'링크 사용 기한을 확인해 주세요.'};
 return {request_id:d.request_id.toLowerCase(),service:d.service,purpose:d.purpose,title,description,amount:d.amount,event_date,space_id,headcount,start_h,end_h,booking_code,expires_on};
}
export async function paymentLinksAdmin({env,request,path,method}){
 if(path==='payment-links'&&method==='GET'){
  const rows=await env.DB.prepare(SELECT+' ORDER BY l.created_at DESC,l.id DESC LIMIT 200').all(),C=payappConfig(env);
  return json({ok:true,items:(rows.results||[]).map(row=>view(env,row,request,true)),payment:{enabled:C.live,configured:C.configured}});
 }
 if(path==='payment-links'&&method==='POST'){
  const d=normalize(await readJson(request,16000));if(d.error)return err(d.error);
  const fingerprint=JSON.stringify(d),old=await env.DB.prepare(SELECT+' WHERE l.request_id=?').bind(d.request_id).first();
  if(old)return old.request_fingerprint===fingerprint?json({ok:true,duplicate:true,link:view(env,old,request,true)}):err('다른 내용의 결제 링크에 사용한 요청번호입니다. 새로 만들어 주세요.',409,'LINK_CONFLICT');
  if(d.expires_on&&(d.expires_on<kstToday()||d.expires_on>kstToday(90)))return err('링크 사용 기한은 오늘부터 90일 이내로 선택해 주세요.');
  let b=null;if(d.booking_code){b=await env.DB.prepare('SELECT * FROM bookings WHERE booking_code=?').bind(d.booking_code).first();
   if(!b||!['confirmed','completed'].includes(b.status))return err('확정 또는 이용 완료된 예약번호를 확인해 주세요.',409,'BOOKING_CHANGED');
   if(d.service==='rental'&&(!Object.hasOwn(SPACES,b.space_id)||['event_date','space_id','headcount','start_h','end_h'].some(k=>d[k]!=null&&d[k]!==b[k==='event_date'?'date':k])))return err('연결 예약의 공간·날짜·인원·시간과 입력 내용을 맞춰 주세요.',409,'BOOKING_CHANGED');
  }
  const id=crypto.randomUUID(),token=randomToken(),at=now(),expires=Date.parse((d.expires_on||kstToday(7))+'T23:59:59.999+09:00');
  const details=d.service==='rental'&&b?{event_date:d.event_date||b.date,space_id:d.space_id||b.space_id,headcount:d.headcount??b.headcount,start_h:d.start_h??b.start_h,end_h:d.end_h??b.end_h}:d;
  await env.DB.prepare(`INSERT OR IGNORE INTO payment_links(id,request_id,request_fingerprint,token,token_hash,service,purpose,title,description,amount,event_date,space_id,headcount,start_h,end_h,booking_code,booking_snapshot,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(id,d.request_id,fingerprint,token,await sha256(token),d.service,d.purpose,d.title,d.description,d.amount,details.event_date,details.space_id,details.headcount,details.start_h,details.end_h,d.booking_code,b?snapshot(b):null,expires,at,at).run();
  const saved=await env.DB.prepare(SELECT+' WHERE l.request_id=?').bind(d.request_id).first();
  if(!saved||saved.request_fingerprint!==fingerprint)return err('다른 내용의 링크가 먼저 만들어졌습니다.',409,'LINK_CONFLICT');
  if(saved.id===id)await log(env,'payment_link.created',id,'admin',{service:d.service,purpose:d.purpose,amount:d.amount,booking_code:d.booking_code});
  return json({ok:true,link:view(env,saved,request,true)});
 }
 const close=path.match(/^payment-links\/([0-9a-f-]{36})\/close$/i);
 if(close&&method==='POST'){
  const row=await env.DB.prepare(SELECT+' WHERE l.id=?').bind(close[1]).first();if(!row)return err('결제 링크를 찾을 수 없습니다.',404);
  if(row.order_oid)return err('이미 결제를 요청한 링크입니다. 실제 결제·취소 상태를 페이앱에서 확인해 주세요.',409,'PAYMENT_STARTED');
  await env.DB.prepare("UPDATE payment_links SET status='closed',updated_at=? WHERE id=? AND order_oid IS NULL").bind(now(),row.id).run();
  const saved=await env.DB.prepare(SELECT+' WHERE l.id=?').bind(row.id).first();if(saved.order_oid)return err('결제 요청이 먼저 시작되었습니다. 페이앱에서 확인해 주세요.',409,'PAYMENT_STARTED');
  return json({ok:true,link:view(env,saved,request,true)});
 }
 return err('경로를 찾을 수 없습니다.',404);
}
export async function paymentLinksPublic({env,request,params}){
 const parts=params.path||[],token=parts[0],checkout=parts.length===2&&parts[1]==='checkout',method=request.method.toUpperCase();
 if(!TOKEN.test(token||'')||parts.length>2||parts.length===2&&!checkout)return err('결제 링크를 확인해 주세요.',404);
 const row=await env.DB.prepare(SELECT+' WHERE l.token_hash=?').bind(await sha256(token)).first();if(!row)return err('결제 링크를 찾을 수 없습니다.',404);
 if(method==='GET'&&!checkout)return json({ok:true,link:view(env,row,request)},200,{'referrer-policy':'no-referrer'});
 if(method!=='POST'||!checkout)return err('허용되지 않은 요청입니다.',405);
 if(!sameOrigin(request))return err('허용되지 않은 요청입니다.',403);
 const ip='payment-link:'+clientIp(request);if(await tooMany(env,ip,20,10))return err('요청이 많습니다. 잠시 후 다시 시도해 주세요.',429);await hit(env,ip,10);
 const d=await readJson(request,12000),buyer=d.buyer||{},name=text(buyer.name,40),phone=typeof buyer.phone==='string'?buyer.phone.replace(/[-\s]/g,''):'',email=buyer.email?text(buyer.email,120):'';
 if(!name||/[\r\n\u0000-\u001f]/.test(name)||!/^01[016789]\d{7,8}$/.test(phone)||buyer.email&&!isEmail(email))return err('결제자 이름·휴대폰 번호·이메일을 확인해 주세요.');
 if(d.agree_terms!==true||d.agree_privacy!==true||d.agree_refund!==true)return err('이용약관·개인정보 처리·취소 및 환불 조건을 확인하고 동의해 주세요.');
 if(row.order_oid){
  if(['paid','refunded'].includes(row.order_status))return err('이미 처리된 결제입니다. 결제 상태를 확인해 주세요.',409,'ALREADY_PAID');
  if(!equalSecret(phone,row.buyer_phone))return err('처음 결제를 요청한 휴대폰 번호로 이어서 진행해 주세요.',409,'BUYER_MISMATCH');
  if(row.attempt_state==='requested'&&['created','pending'].includes(row.order_status)&&payappUrl(row.payurl)&&paymentEnabled(env,row))return json({ok:true,oid:row.order_oid,payurl:row.payurl});
  return pending();
 }
 if(status(row)!=='open')return err('사용 기한이 지났거나 종료된 결제 링크입니다. 담당자에게 문의해 주세요.',409,'LINK_UNAVAILABLE');
 const C=payappConfig(env);if(!C.live)return err('온라인 결제를 준비 중입니다. 담당자에게 문의해 주세요.',503,'PAYMENT_UNAVAILABLE');
 if(row.service==='rental'&&row.booking_code){const b=await env.DB.prepare('SELECT * FROM bookings WHERE booking_code=?').bind(row.booking_code).first();if(!b||snapshot(b)!==row.booking_snapshot)return err('연결 예약이 변경되었습니다. 담당자에게 새 결제 링크를 요청해 주세요.',409,'BOOKING_CHANGED');}
 const oid='MS'+new Date(Date.now()+9*36e5).toISOString().replace(/[-:T]/g,'').slice(0,14)+(await sha256(randomToken())).slice(0,6).toUpperCase(),nonce=randomToken(),at=now();
 const data=JSON.stringify({kind:'admin_payment_link',payment_link_id:row.id,service:row.service,purpose:row.purpose,description:row.description,provider:'payapp',lines:[{id:row.service,label:row.title,desc:row.description,amount:row.amount,qty:1}]});
 const bookingGuard=row.service==='rental'&&row.booking_code?` AND EXISTS(SELECT 1 FROM bookings b WHERE b.booking_code=? AND ${snapshotSql('b')}=?)`:'';
 const claimed=await env.DB.batch([
  env.DB.prepare("UPDATE payment_links SET order_oid=?,attempt_state='requesting',updated_at=? WHERE id=? AND status='open' AND order_oid IS NULL AND expires_at>?"+bookingGuard).bind(oid,at,row.id,Date.now(),...(bookingGuard?[row.booking_code,row.booking_snapshot]:[])),
  env.DB.prepare(`INSERT INTO orders(oid,product_id,title,event_date,people,price,buyer_name,buyer_phone,buyer_email,data,status,test,created_at) SELECT ?,'admin-payment-'||service,title,event_date,headcount,amount,?,?,?,?,'created',0,? FROM payment_links WHERE id=? AND order_oid=?`).bind(oid,name,phone,email,data,at,row.id,oid),
  env.DB.prepare('INSERT INTO payapp_payments(oid,nonce,merchant_userid,created_at) SELECT oid,?,?,? FROM orders WHERE oid=?').bind(nonce,C.userid,at,oid)
 ]);
 if(!changes(claimed[0]))return pending();
 let r;const origin=originFor(env,request);
 try{r=await requestPayment(C,{goodname:row.title,price:String(row.amount),recvphone:phone,...(email?{recvemail:email}:{}),memo:'메가스팟 '+SERVICES[row.service]+' '+PURPOSES[row.purpose],smsuse:'n',reqaddr:'0',checkretry:'y',skip_cstpage:'y',feedbackurl:origin+'/api/pay/feedback',returnurl:origin+'/api/pay/return?oid='+oid,var1:oid,var2:nonce});}
 catch{await env.DB.prepare("UPDATE payment_links SET attempt_state='unknown',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE oid=? AND status IN ('created','pending'))").bind(now(),row.id,oid).run();return err('결제 요청 결과를 확인하고 있습니다. 중복 결제하지 말고 담당자에게 문의해 주세요.',502,'PAYAPP_UNAVAILABLE');}
 if(!r.ok){await env.DB.batch([
  env.DB.prepare("UPDATE orders SET status='failed',result_msg='결제 요청 거절',updated_at=? WHERE oid=? AND status='created' AND EXISTS(SELECT 1 FROM payapp_payments WHERE oid=? AND mul_no IS NULL)").bind(now(),oid,oid),
  env.DB.prepare("UPDATE payment_links SET attempt_state=CASE WHEN EXISTS(SELECT 1 FROM orders WHERE oid=? AND status='failed') THEN 'rejected' ELSE attempt_state END,updated_at=? WHERE id=?").bind(oid,now(),row.id)
 ]);return err('결제 요청이 거절되었습니다. 담당자에게 새 결제 링크를 요청해 주세요.',502,'PAYAPP_REJECTED');}
 const bound=await env.DB.prepare('UPDATE payapp_payments SET mul_no=? WHERE oid=? AND (mul_no IS NULL OR mul_no=?)').bind(r.mulNo,oid,r.mulNo).run();
 if(!changes(bound))return pending();
 await env.DB.prepare("UPDATE payment_links SET payurl=?,attempt_state='requested',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE oid=? AND status IN ('created','pending')) AND attempt_state IN ('requesting','requested')").bind(r.payurl,now(),row.id,oid).run();
 return json({ok:true,oid,payurl:r.payurl});
}

// Called only after the shared signature, merchant, nonce, original number and amount checks.
export async function paymentLinkFeedback(env,row,f,partial){
 const data=parse(row.data),link=await env.DB.prepare('SELECT * FROM payment_links WHERE id=? AND order_oid=?').bind(data.payment_link_id||'',row.oid).first();
 if(!link||link.amount!==row.price||link.service!==data.service||link.purpose!==data.purpose)return new Response('FAIL',{status:400});
 const state=f.pay_state,at=now(),sql=(q,...v)=>env.DB.prepare(q).bind(...v);
 const b=link.service==='rental'&&link.booking_code?await env.DB.prepare('SELECT * FROM bookings WHERE booking_code=?').bind(link.booking_code).first():null;
 const bookingCode=b&&snapshot(b)===link.booking_snapshot?b.booking_code:null;
 if(state==='4'){
  if(!['created','pending','cancelled','failed'].includes(row.status))return new Response('SUCCESS');
  if(bookingCode)await preserveLegacyPayments(env);
  const token=randomToken(),guard=`EXISTS(SELECT 1 FROM payment_links WHERE id=? AND event_token=?)`;
  const bookingMatch=bookingCode?`EXISTS(SELECT 1 FROM bookings b WHERE b.booking_code=? AND ${snapshotSql('b')}=?)`:'0';
  await env.DB.batch([
   sql("UPDATE payment_links SET attempt_state='settled',event_token=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE oid=? AND status IN ('created','pending','cancelled','failed'))",token,at,link.id,row.oid),
   sql(`UPDATE orders SET status='paid',tid=?,pay_method=?,appl_at=?,booking_code=CASE WHEN ${bookingMatch} THEN ? ELSE NULL END,paid_at=?,result_msg=?,updated_at=? WHERE oid=? AND status IN ('created','pending','cancelled','failed') AND ${guard}`,row.payapp_no,'PayApp:'+(f.pay_type||''),(f.pay_date||at).slice(0,30),...(bookingCode?[bookingCode,link.booking_snapshot]:[]),bookingCode,at,['cancelled','failed'].includes(row.status)?'승인 완료 · 이전 취소·거절 상태 확인 필요':link.service==='rental'&&link.booking_code&&!bookingCode?'승인 완료 · 연결 예약 확인 필요':'승인 완료',at,row.oid,link.id,token),
   sql(`UPDATE orders SET result_msg='승인 완료 · 연결 예약 확인 필요' WHERE oid=? AND booking_code IS NULL AND ? IS NOT NULL AND ${guard}`,row.oid,link.service==='rental'?link.booking_code:null,link.id,token),
   sql(`UPDATE bookings SET confirm_doc=NULL,updated_at=? WHERE booking_code=(SELECT booking_code FROM orders WHERE oid=?) AND ${guard}`,at,row.oid,link.id,token),
   sql(`INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'order.paid',?,'payapp','담당자 결제 링크 승인',? WHERE ${guard}`,row.oid,at,link.id,token)
  ]);
 }else if(['9','64','70','71'].includes(state)){
  if(partial&&(!/^\d+$/.test(f.price||'')||Number(f.price)<=0||Number(f.price)>row.price||f.mul_no===row.payapp_no))return new Response('FAIL',{status:400});
  // A refund arriving before its approval never establishes a new reservation association.
  const result=await recordPayappRefund(env,row,f,partial);if(!result.ok)return new Response('FAIL',{status:400});
  await sql("UPDATE orders SET tid=COALESCE(tid,?),pay_method=COALESCE(pay_method,?),appl_at=COALESCE(appl_at,?) WHERE oid=? AND status IN ('paid','refunded')",row.payapp_no,'PayApp:'+(f.pay_type||''),(f.pay_date||at).slice(0,30),row.oid).run();
  if(link.service==='rental'&&link.booking_code&&!row.booking_code)await sql("UPDATE orders SET result_msg=result_msg||' · 연결 예약 확인 필요' WHERE oid=? AND result_msg NOT LIKE '%연결 예약 확인 필요%'",row.oid).run();
  await sql("UPDATE payment_links SET attempt_state='settled',updated_at=? WHERE id=?",at,link.id).run();
 }else if(['8','16','31','32'].includes(state)){
  await sql("UPDATE orders SET status='cancelled',result_msg='결제 요청 취소',updated_at=? WHERE oid=? AND status IN ('created','pending')",at,row.oid).run();
 }else if(state==='10')await sql("UPDATE orders SET status='pending',result_msg='입금 대기',updated_at=? WHERE oid=? AND status='created'",at,row.oid).run();
 return new Response('SUCCESS',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
}
