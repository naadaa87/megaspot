import assert from 'node:assert/strict';
import {fixture,DAY} from './admin-fixture.mjs';
import {onRequest} from '../../functions/api/pay/[[path]].js';
import {kstStamp} from '../../functions/api/_payapp.js';
import {sha256} from '../../functions/api/_lib.js';
export function payappFixture(options={}){
 const f=fixture({booking:true,...options});Object.assign(f.env,{PAYAPP_USERID:'local-seller',PAYAPP_LINKKEY:'local-link',PAYAPP_LINKVAL:'local-value',PAYAPP_REQUESTKEY:'local-request'});
 const batch=f.env.DB.batch.bind(f.env.DB);let queue=Promise.resolve(),counter=100000;
 f.env.DB.batch=ss=>{const p=queue.then(()=>batch(ss));queue=p.catch(()=>{});return p;};
 function seed(values={}){
  counter++;const oid='PG-'+counter,mul_no=String(counter),nonce='fixture-order-'+counter;
  f.db.prepare('INSERT INTO orders(oid,product_id,title,event_date,people,price,buyer_name,buyer_phone,data,status,booking_code,inquiry_ref,test,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(oid,'room','검증용 온라인 이용료',DAY,30,values.price??1000000,'검증 고객','010-1234-5678',JSON.stringify({provider:'payapp',...(values.slot?{slot:values.slot}:{})}),values.status||'paid',values.linked===false?null:'BK-TEST',values.inquiry_ref===undefined?'MS-TEST':values.inquiry_ref,values.test||0,'2026-11-03 10:00:00',values.status==='created'||values.status==='pending'?null:'2026-11-03 10:00:00');
  f.db.prepare('INSERT INTO payapp_payments(oid,mul_no,nonce,created_at) VALUES(?,?,?,?)').run(oid,mul_no,nonce,'2026-11-03 10:00:00');return {oid,mul_no,nonce,price:values.price??1000000};
 }
 async function form(order,state,values={}){
  const stamp=kstStamp();return {userid:f.env.PAYAPP_USERID,linkkey:f.env.PAYAPP_LINKKEY,linkval:f.env.PAYAPP_LINKVAL,responsedate:stamp,hash:await sha256(f.env.PAYAPP_USERID+stamp+f.env.PAYAPP_REQUESTKEY),var1:order.oid,var2:order.nonce,mul_no:order.mul_no,price:String(order.price),pay_state:state,pay_type:'1',...values};
 }
 async function feedback(body,status=200){
  const response=await onRequest({env:f.env,params:{path:['feedback']},request:new Request('https://local.test/api/pay/feedback',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)})});
  const text=await response.text();assert.equal(response.status,status,text);assert.equal(text,status===200?'SUCCESS':'FAIL');return text;
 }
 return {...f,seed,form,feedback};
}
