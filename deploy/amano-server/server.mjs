import {createHmac,timingSafeEqual,createHash,randomBytes,generateKeyPairSync,privateDecrypt,constants,createCipheriv,createDecipheriv} from 'node:crypto';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {AmanoClient} from './client.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function amanoStore(dir,secret){
 mkdirSync(dir,{recursive:true,mode:0o700});
 const keyPath=join(dir,'setup-key.pem');
 if(!existsSync(keyPath)){const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});writeFileSync(keyPath,keys.privateKey,{mode:0o600});writeFileSync(join(dir,'setup-public.pem'),keys.publicKey,{mode:0o600});}
 const key=createHash('sha256').update('megaspot-amano-state-v1:'+secret).digest();
 const save=(name,value)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);const path=join(dir,name+'.enc');writeFileSync(path+'.tmp',Buffer.concat([iv,c.getAuthTag(),data]),{mode:0o600});renameSync(path+'.tmp',path);};
 const read=name=>{const p=join(dir,name+'.enc');if(!existsSync(p))return null;const b=readFileSync(p),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());};
 return {save,read,publicKey:()=>readFileSync(join(dir,'setup-public.pem'),'utf8'),decrypt:payload=>JSON.parse(privateDecrypt({key:readFileSync(keyPath),oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(payload,'base64')).toString('utf8'))};
}
export async function amanoRequest(request,env,store,clientFactory=c=>new AmanoClient(c)){
 if(request.method!=='POST'||new URL(request.url).pathname!=='/v1/amano')return json({error:'Not found'},404);
 if(String(env.ALIGO_RELAY_SECRET||'').length<32)return json({error:'Server not configured'},503);
 const raw=await request.text();if(raw.length>12000)return json({error:'Payload too large'},413);
 const sig=request.headers.get('X-Megaspot-Signature')||'',expected=createHmac('sha256',env.ALIGO_RELAY_SECRET).update(raw).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return json({error:'Unauthorized'},401);
 let v;try{v=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
 if(!Number.isFinite(v.time)||Math.abs(Date.now()-v.time)>60000)return json({error:'Expired request'},400);
 try{
  if(v.action==='status')return json({ok:true,configured:!!store.read('credentials'),enabled:false,adapter_ready:false,public_key:store.publicKey(),last_run:store.read('last-run')});
  if(v.action==='setup'){
   if(v.confirm_storage!==true)return json({error:'서버에 계정 저장 동의가 필요합니다.'},400);
   let c;try{c=store.decrypt(v.encrypted_credentials);}catch{return json({error:'계정 암호화 요청을 확인해 주세요.'},400);}
   if(typeof c.username!=='string'||!c.username.trim()||c.username.length>100||!/^[a-f0-9]{64}$/.test(c.passwordHash||''))return json({error:'계정 정보를 확인해 주세요.'},400);
   c.username=c.username.trim();await clientFactory(c).login();store.save('credentials',c);store.save('connection',{checked_at:new Date().toISOString()});return json({ok:true,configured:true,enabled:false});
  }
  if(v.action==='check'){
   const c=store.read('credentials');if(!c)return json({error:'아마노 계정을 먼저 연결해 주세요.'},409);await clientFactory(c).login();return json({ok:true,configured:true,enabled:false});
  }
  return json({error:'허용되지 않은 작업입니다.'},400);
 }catch(e){const safe=/^아마노/.test(e.message)?e.message:'서버 연결을 확인해 주세요.';return json({error:safe},502);}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const env=process.env,store=amanoStore(env.AMANO_STATE_DIR||'/var/lib/megaspot-amano',env.ALIGO_RELAY_SECRET);
 createServer(async(req,res)=>{try{let body='';for await(const chunk of req){body+=chunk;if(body.length>12000){res.writeHead(413);res.end();return;}}const r=await amanoRequest(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}:{})}),env,store);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());}catch{res.writeHead(500);res.end('Unavailable');}}).listen(Number(env.PORT||8790),'127.0.0.1');
}
