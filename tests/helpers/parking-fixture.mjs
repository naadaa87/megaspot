import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {onRequest} from '../../functions/api/parking/[[path]].js';
import {parkingInput,plateOf,POLICY,arrivalWindow} from '../../functions/api/_parking.js';
import {sha256,kstToday} from '../../functions/api/_lib.js';import {kstStamp} from '../../functions/api/_payapp.js';
const ORIGIN='https://megaspot.test';
export function fixture(t){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
 const DB={prepare(sql){const st=db.prepare(sql);let a=[];return{bind(...v){a=v;return this;},async first(){return st.get(...a)||null;},async all(){return{results:st.all(...a)};},async run(){return{meta:{changes:Number(st.run(...a).changes)}};},exec(){return{meta:{changes:Number(st.run(...a).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const out=stmts.map(s=>s.exec());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,ADMIN_KEY:'test-admin',PAYAPP_USERID:'test-seller',PAYAPP_LINKKEY:'test-link',PAYAPP_LINKVAL:'test-value',PAYAPP_REQUESTKEY:'test-request'};let sent,n=123;
 t.mock.method(globalThis,'fetch',async(url,o)=>{assert.equal(url,'https://api.payapp.kr/oapi/v2');sent=new URLSearchParams(o.body);return new Response(new URLSearchParams({state:'1',mul_no:String(n++),payurl:'https://payapp.kr/test-payment'}));});
 t.mock.method(Date,'now',()=>Date.parse('2026-11-03T14:00:00+09:00'));
 function call(path,method='GET',body,key,admin=false,origin=ORIGIN){return onRequest({env,params:{path:path.split('?')[0].split('/')},request:new Request(ORIGIN+'/api/parking/'+path,{method,headers:{origin,'content-type':path==='feedback'?'application/x-www-form-urlencoded':'application/json',...(key?{Authorization:'Bearer '+key}:{}),...(admin?{'x-admin-key':'test-admin'}:{})},...(body===undefined?{}:{body:path==='feedback'?new URLSearchParams(body).toString():JSON.stringify(body)})})});}
 const admin=(path,body)=>call('admin/'+path,body?'POST':'GET',body,null,true);
 async function enable(){const r=await call('admin/settings','PUT',{enabled:true},null,true);assert.equal(r.status,200);}
 const input=(extra={})=>({ticket:'2h',plate:'123가4567',plate_confirm:'123가4567',date:'2026-11-03',name:'주차 테스트',phone:'01000000000',policy:POLICY,agree_terms:true,agree_privacy:true,agree_refund:true,confirmed:true,...extra});
 async function buy(extra={}){await enable();const r=await call('prepare','POST',input(extra));const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j;}
 async function feedback(p,state='4',extra={}){const row=db.prepare('SELECT o.*,p.nonce,p.mul_no FROM orders o JOIN payapp_payments p ON p.oid=o.oid WHERE o.oid=?').get(p.oid),stamp=kstStamp();return call('feedback','POST',{userid:env.PAYAPP_USERID,linkkey:env.PAYAPP_LINKKEY,linkval:env.PAYAPP_LINKVAL,responsedate:stamp,hash:await sha256(env.PAYAPP_USERID+stamp+env.PAYAPP_REQUESTKEY),var1:row.oid,var2:row.nonce,mul_no:row.mul_no,price:String(row.price),pay_state:state,...extra});}
 const get=async p=>(await (await call('orders/'+p.oid,'GET',undefined,p.key)).json()).order;
 const claim=(p,extra={})=>admin('orders/'+p.oid+'/claim',{entry_id:'ENTRY-001',entry_at:'2026-11-03T13:00',plate_confirm:'123가4567',confirm_entry:true,...extra});
 const complete=p=>admin('orders/'+p.oid+'/complete',{cost:0,confirm_applied:true});
 return{db,env,call,admin,input,buy,get,claim,complete,feedback,sent:()=>sent};
}
