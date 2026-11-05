// Local-only mobile QA: real handlers and an in-memory DB; all provider calls mocked.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fixture} from './admin-fixture.mjs';
import {onRequestGet as getConfirmation,onRequestPost as postConfirmation} from '../../functions/api/confirm.js';
import {depositNoticeTick} from '../../functions/api/_deposit_notifications.js';
import {DEPOSIT_TEMPLATES as templates,DEPOSIT_TEMPLATE_CODES as codes} from '../../functions/api/_deposit_templates.js';
import {now} from '../../functions/api/_lib.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=Number(process.env.QA_PORT||8769),f=fixture({booking:true}),messages=new Map();let mid=0;
// Keep the mock in customer sending hours, irrespective of the host's clock.
const RealDate=Date,fixed=RealDate.parse('2026-11-05T16:00:00+09:00');globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
Object.assign(f.env,{ALIGO_LIVE_ENABLED:'true',ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'local-preview-secret-longer-than-32-chars',ALIGO_SENDER_KEY:'local-profile',ALIGO_SENDER:'01000000000',DEPOSIT_ACCOUNT_KEY:'cd'.repeat(32)});
globalThis.fetch=async(url,opts)=>{
 if(String(url)!==f.env.ALIGO_RELAY_URL)throw Error('External network is disabled in the preview');
 const {path:operation,data:d}=JSON.parse(opts.body);
 if(operation==='template/list'){const kind=Object.keys(codes).find(k=>codes[k]===d.tpl_code);return Response.json({code:0,list:[{templtCode:codes[kind],inspStatus:'APR',status:'R',templtContent:templates[kind].content,buttons:templates[kind].buttons}]});}
 if(operation==='alimtalk/send'){const id=String(++mid);messages.set(id,d);return Response.json({code:0,info:{mid:id,scnt:1,fcnt:0}});}
 if(operation==='history/detail'){const d0=messages.get(String(d.mid));return Response.json({code:0,list:[{type:'AT',phone:d0.receiver_1,tpl_code:d0.tpl_code,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:now(),rslt:process.env.QA_RESULT==='failed'&&String(d.mid)!=='1'?'500':'0',msgid:'local-only'}]});}
 throw Error('Unexpected mock provider operation');
};
f.db.prepare('UPDATE bookings SET amount=2400000').run();const data=JSON.parse(f.db.prepare('SELECT data FROM inquiries').get().data);data.total=2400000;f.db.prepare('UPDATE inquiries SET data=?').run(JSON.stringify(data));
if(process.env.QA_REMINDERS==='1')f.db.prepare("INSERT INTO inquiry_checks VALUES('MS-TEST',?,?)").run(JSON.stringify({guarantee_paid:true}),now());
if(process.env.QA_HISTORY==='1')f.db.exec("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at) SELECT 'BK-UNSENT',space_id,inquiry_ref,'미발송 가상 고객',phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at FROM bookings WHERE booking_code='BK-TEST'");
const config={enabled:false,types:{payment:false,account:true,refunded:false},codes};await f.api('deposit-notifications/settings','PUT',config);await f.api('deposit-notifications/test','POST',{phone:'01011112222',kind:'account',confirm_test:true});f.db.exec('DELETE FROM deposit_notification_lease');await depositNoticeTick(f.env,false);await f.api('deposit-notifications/settings','PUT',{...config,enabled:true});
await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{customer:'모바일 가상 고객',event:'모바일 흐름 점검',deposit:150000,items:['기존 포함 내역 유지'],note:'가상 예약 · 실제 입금·외부 메시지 발송 없음'},settlement_revision:(await f.api('bookings/BK-TEST/settlement')).settlement.revision});
if(process.env.QA_HISTORY==='1'){
 const add=f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode,status,error,updated_at) VALUES('BK-TEST','account',?,?,'{}','live',?,?,?)");
 add.run('history-success','2026-11-04 01:00:00','delivered','','2026-11-04 01:01:00');add.run('history-failed','2026-11-05 02:00:00','failed','알리고 접수 거절 · 수신번호를 확인해 주세요.','2026-11-05 02:01:00');
}
if(process.env.QA_PENDING==='1'){
 f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,status,error) VALUES('BK-TEST','account','qa-newer-failure',?,'{}','failed','최근 요청 접수 거절')").run(now());
 f.db.exec("UPDATE deposit_notifications SET status='unknown',error='접수 결과 확인 필요 · 자동 재발송 중지' WHERE event_key='history-failed'");
 f.db.prepare("INSERT INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,status) VALUES('BK-UNSENT','account','qa-pending',?,'{}','queued')").run(now());
}
if(process.env.QA_REFRESH==='1'){
 const preview=await f.api('deposit-notifications/account-reminders/preview','POST',{codes:['BK-TEST']});
 await f.api('deposit-notifications/account-reminders/send','POST',{preview_id:preview.preview_id,confirm_send:true});f.db.exec('DELETE FROM deposit_notification_lease');await depositNoticeTick(f.env);
 f.db.exec("UPDATE deposit_notifications SET status='unknown' WHERE mode='live' AND status='accepted'");
}
const page=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>합산 입금 모바일 QA · 외부 발송 없음</title><link rel="stylesheet" href="/assets/css/site.css"><link rel="stylesheet" href="/assets/css/deposit-refunds.css"><link rel="stylesheet" href="/assets/css/admin-settlement.css"><body class="page-admin adm-on">${process.env.QA_HISTORY==='1'?'<style>.adm-main> :not(.adm-view){display:none}#adm-nav{display:none}#qa-mock-tick{margin:8px}</style><button class="btn btn-light" id="qa-mock-tick">모의 알림톡 발송·결과 갱신</button><p style="padding:8px">모바일 가상 고객 점검 · 실제 발송 없음</p>':''}<nav id="adm-nav"><button data-view="calendar">일정 달력</button></nav><main class="adm-main"><h1>합산 입금 모바일 점검</h1><p>로컬 가상 예약 · 실제 입금·외부 발송 없음</p><button class="btn btn-primary" data-settlement-code="BK-TEST">수납·환불 기록 열기</button><p><a id="qa-document" target="_blank">고객용 자동 재발급 확정서</a></p><button class="btn btn-light" id="qa-tick">가상 알림톡 발송·결과 확인</button><pre id="qa-state" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></main><script src="/assets/js/settlement.js"></script><script>
window.MEGASPOT={esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),toast:s=>console.log(s)};
const qaViews={};window.MEGASPOT_ADMIN={register:(v,fn)=>qaViews[v]=fn,guard:()=>false,go:view=>{location.hash=view;document.querySelectorAll('.adm-view').forEach(e=>e.hidden=e.id!=='view-'+view);if(qaViews[view])qaViews[view]();else document.querySelector('#qa-state').scrollIntoView();},A:async(p,o={})=>{const r=await fetch('/api/admin'+p,{method:o.method||'GET',headers:{'Content-Type':'application/json'},body:o.body?JSON.stringify(o.body):undefined});const j=await r.json();if(!r.ok)throw Object.assign(Error(j.error),{status:r.status,code:j.code});return j;}};
async function qaState(){const r=await (await fetch('/qa/state')).json();document.querySelector('#qa-state').textContent=JSON.stringify(r,null,2);document.querySelector('#qa-document').href=r.document_url;}window.addEventListener('admin-settlement-saved',qaState);window.addEventListener('admin-confirmation-open',()=>document.querySelector('#qa-document').click());document.querySelector('#qa-tick').onclick=async()=>{await fetch('/qa/tick',{method:'POST'});await qaState();};if(document.querySelector('#qa-mock-tick'))document.querySelector('#qa-mock-tick').onclick=async()=>{await fetch('/qa/tick',{method:'POST'});await qaState();document.querySelector('#rf-refresh').click();};qaState();
</script><script src="/assets/js/admin-save-recovery.js"></script><script src="/assets/js/pages/admin-settlement.js"></script><script src="/assets/js/pages/admin-deposit-refunds.js"></script><script>document.querySelector('#adm-nav').onclick=e=>{if(e.target.dataset.view)MEGASPOT_ADMIN.go(e.target.dataset.view);};</script></body></html>`;
const mime={'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:'+port);let result;
 if(url.pathname==='/qa/tick'){f.db.exec('DELETE FROM deposit_notification_lease');await depositNoticeTick(f.env);f.db.exec('DELETE FROM deposit_notification_lease');await depositNoticeTick(f.env,false);result=Response.json({ok:true});}
 else if(url.pathname==='/qa/state'){const s=await f.api('bookings/BK-TEST/settlement'),doc=await f.api('bookings/BK-TEST/confirm-doc');result=Response.json({settlement:s.settlement,deposit_paid:!!s.deposit.paid,confirmation:doc.doc,needs_reissue:doc.needs_reissue,notifications:f.db.prepare("SELECT kind,status FROM deposit_notifications WHERE mode='live'").all(),provider_calls:[...messages.values()].filter(x=>x.receiver_1==='01012345678').map(x=>({template:x.tpl_code,message:x.message_1,buttons:JSON.parse(x.button_1||'{}')})),document_url:doc.link.replace('https://local.test','http://127.0.0.1:'+port)});}
 else if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers(req.headers);headers.set('x-admin-key',f.env.ADMIN_KEY);const request=new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});if(url.pathname==='/api/confirm')result=await (req.method==='POST'?postConfirmation:getConfirmation)({env:f.env,request});else if(url.pathname.startsWith('/api/admin/'))result=await f.handle(request);else result=Response.json({ok:false,error:'Preview endpoint unavailable'},{status:404});}
 else if(url.pathname==='/'){result=new Response(page,{headers:{'content-type':'text/html; charset=utf-8'}});}
 else{const resource=url.pathname==='/confirm/'?'confirm/index.html':decodeURIComponent(url.pathname.slice(1)),filename=path.resolve(root,resource);if(!filename.startsWith(root)||!(/^(assets\/|confirm\/)/.test(resource)))throw Error('Not found');result=new Response(await readFile(filename),{headers:{'content-type':mime[path.extname(filename)]||'application/octet-stream'}});}
 res.writeHead(result.status,{'cache-control':'no-store',...Object.fromEntries(result.headers)});res.end(Buffer.from(await result.arrayBuffer()));
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
server.listen(port,'127.0.0.1',()=>console.log('Local-only combined payment QA: http://127.0.0.1:'+port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{f.db.close();process.exit();}));
