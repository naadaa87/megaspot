import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fixture} from './admin-fixture.mjs';
import {feedbackCustomer} from '../../functions/api/_feedback.js';
const f=fixture({booking:true,date:'2026-10-01'});f.env.DEPOSIT_ACCOUNT_KEY='ab'.repeat(32);f.db.prepare("UPDATE bookings SET status='completed'").run();
globalThis.fetch=async()=>{throw Error('No external requests in preview');};
const origin='http://localhost:8797';const issued=await f.api('feedback/BK-TEST/prepare','POST',{});console.log('CUSTOMER_PREVIEW '+issued.url.replace('https://local.test',origin));
const root=resolve(import.meta.dirname,'../..');
http.createServer(async(req,res)=>{try{const url=new URL(req.url,origin);let body='';for await(const chunk of req)body+=chunk;let response;
if(url.pathname.startsWith('/api/')){const headers={...req.headers,'x-admin-key':f.env.ADMIN_KEY};const request=new Request(url,{method:req.method,headers,...(body?{body}:{})});response=url.pathname==='/api/feedback'?await feedbackCustomer({env:f.env,request}):await f.handle(request);}
else{const path=resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));if(!path.startsWith(root+'/'))throw Error('Path');const b=await readFile(path);response=new Response(b,{headers:{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'}});}
res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){res.writeHead(500);res.end(String(e));}}).listen(8797,'127.0.0.1',()=>console.log('PREVIEW_READY '+origin+'/admin/#feedback'));
