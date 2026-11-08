import {json,err,str,now,randomToken,sha256,log,kstToday} from './_lib.js';
import {requestPayment} from './_payapp.js';
import {parkingInput,POLICY,arrivalWindow} from './_parking.js';
const makeOid=async()=> 'MS'+new Date(Date.now()+9*36e5).toISOString().replace(/[-:T]/g,'').slice(0,14)+(await sha256(randomToken())).slice(0,6).toUpperCase();
export async function prepareParkingBatch(request,env,settings,C,d){
 if(!Array.isArray(d.vehicles)||d.vehicles.length<1||d.vehicles.length>10)return err('차량은 한 번에 1~10대까지 구매할 수 있습니다.');
 const items=[],seen=new Set();
 for(const [i,item] of d.vehicles.entries()){
  if(!item||typeof item!=='object'||Array.isArray(item))return err('차량 정보를 확인해 주세요.');
  const v=parkingInput({...d,...item,date:d.date,name:d.name,phone:d.phone},{dailyAllowed:settings.daily_enabled});
  if(v.error)return err((i+1)+'번 차량: '+v.error);
  if(seen.has(v.plate))return err('같은 차량번호를 두 번 입력했습니다. 차량마다 한 번씩 입력해 주세요.');
  seen.add(v.plate);
  if(v.ticket==='daily'&&str(d.daily_terms,500)!==settings.daily_terms)return err('일일권 이용 조건이 변경되었습니다. 새로고침 후 확인해 주세요.',409);
  if(v.date===kstToday()&&!arrivalWindow())return err('당일 구매·입차 요청은 10:00부터 23:50 전까지 가능합니다. 다음 이용일을 선택하거나 문의해 주세요.');
  const duplicate=await env.DB.prepare("SELECT COUNT(*) AS n FROM parking_orders p JOIN orders o ON o.oid=COALESCE(p.payment_oid,p.oid) WHERE p.plate=? AND p.visit_date=? AND o.status='paid'").bind(v.plate,v.date).first();
  if(duplicate.n&&!d.confirm_extra)return err('입력한 차량 중 같은 이용일에 결제된 주차권이 있습니다. 추가 구매가 맞는지 확인해 주세요.',409,'EXTRA_CONFIRM');
  items.push({...v,oid:await makeOid()});
 }
 const oid=await makeOid(),key=await sha256(randomToken()),hash=await sha256(key),nonce=randomToken(),t=now(),total=items.reduce((n,v)=>n+v.price,0),title='메가스팟 주차권 '+items.length+'대';
 const statements=[
  env.DB.prepare("INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,test,created_at) VALUES(?,'parking-batch',?,?,?,?,?,?,'created',0,?)").bind(oid,title,d.date,total,items[0].name,items[0].phone,JSON.stringify({kind:'parking_batch',policy:POLICY,confirmed_at:t,lines:items.map(v=>({label:v.plate+' · '+v.label,desc:v.date,amount:v.price,qty:1})),agree_daily:d.agree_daily===true}),t),
  env.DB.prepare('INSERT INTO parking_batches(oid,token_hash,created_at) VALUES(?,?,?)').bind(oid,hash,t),
  env.DB.prepare('INSERT INTO payapp_payments(oid,nonce,created_at) VALUES(?,?,?)').bind(oid,nonce,t),
  ...items.map(v=>env.DB.prepare('INSERT INTO parking_orders(oid,payment_oid,vehicle_price,plate,visit_date,ticket,hours,daily_terms,token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(v.oid,oid,v.price,v.plate,v.date,v.ticket,v.hours,v.ticket==='daily'?settings.daily_terms:'',hash,t,t))
 ];
 await env.DB.batch(statements);
 const origin=new URL(request.url).origin;let r;
 try{r=await requestPayment(C,{goodname:title,price:String(total),recvphone:items[0].phone,reqaddr:'0',smsuse:'n',checkretry:'y',skip_cstpage:'y',feedbackurl:origin+'/api/parking/feedback',returnurl:origin+'/parking/purchase/?batch='+oid,var1:oid,var2:nonce});}
 catch{await env.DB.prepare("UPDATE orders SET result_msg='결제 요청 확인 필요',updated_at=? WHERE oid=?").bind(now(),oid).run();return json({ok:false,error:'결제 요청 결과를 확인 중입니다. 중복 결제하지 말고 구매 내역을 확인해 주세요.',oid,key,batch:true},502);}
 if(!r.ok){await env.DB.prepare("UPDATE orders SET status='failed',result_msg='페이앱 요청 거절',updated_at=? WHERE oid=? AND status='created'").bind(now(),oid).run();return json({ok:false,error:'결제창을 열지 못했습니다. 구매 내역을 확인해 주세요.',oid,key,batch:true},502);}
 const bound=await env.DB.prepare('UPDATE payapp_payments SET mul_no=? WHERE oid=? AND (mul_no IS NULL OR mul_no=?)').bind(r.mulNo,oid,r.mulNo).run();if(!bound.meta?.changes)throw Error('PAYMENT_BINDING');
 await log(env,'parking.batch.created',oid,'customer',{vehicles:items.length,total});
 return json({ok:true,oid,key,batch:true,payurl:r.payurl,total,vehicles:items.length});
}
