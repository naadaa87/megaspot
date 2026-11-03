// Fixed-IP relay for Cloudflare Pages, behind the existing relay.naranhistory.com TLS host.
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const FIELDS={
  'template/list':['tpl_code'],
  'history/detail':['mid','page','limit'],
  'alimtalk/send':['tpl_code','receiver_1','recvname_1','subject_1','message_1','button_1']
};
export function relayLedger(db){
  db.exec('CREATE TABLE IF NOT EXISTS relay_requests(id TEXT PRIMARY KEY,hash TEXT NOT NULL,response TEXT,created_at INTEGER NOT NULL)');
  db.exec("CREATE INDEX IF NOT EXISTS relay_requests_mid ON relay_requests(CAST(json_extract(response,'$.info.mid') AS TEXT))");
  return {
    get:id=>db.prepare('SELECT * FROM relay_requests WHERE id=?').get(id),
    ownsMid:mid=>!!db.prepare("SELECT id FROM relay_requests WHERE CAST(json_extract(response,'$.info.mid') AS TEXT)=? LIMIT 1").get(String(mid)),
    claim(id,hash){try{db.prepare('INSERT INTO relay_requests(id,hash,created_at) VALUES(?,?,?)').run(id,hash,Date.now());return true;}catch{return false;}},
    complete:(id,response)=>db.prepare('UPDATE relay_requests SET response=? WHERE id=?').run(JSON.stringify(response),id)
  };
}
export async function relayRequest(request,env,ledger,upstream=fetch){
  if(new URL(request.url).pathname!=='/v1/aligo' || request.method!=='POST')return json({error:'Not found'},404);
  if(!env.ALIGO_RELAY_SECRET || env.ALIGO_RELAY_SECRET.length<32)return json({error:'Relay unavailable'},503);
  const raw=await request.text();if(raw.length>16000)return json({error:'Payload too large'},413);
  const actual=request.headers.get('X-Megaspot-Signature') || '',expected=createHmac('sha256',env.ALIGO_RELAY_SECRET).update(raw).digest('hex');
  if(!/^[a-f0-9]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return json({error:'Unauthorized'},401);
  let v;try{v=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
  if(!Number.isFinite(v.time) || Math.abs(Date.now()-v.time)>60000 || !/^[a-f0-9-]{36}$/.test(v.request_id || ''))return json({error:'Expired request'},400);
  if(!Object.hasOwn(FIELDS,v.path) || !v.data || typeof v.data!=='object' || Array.isArray(v.data))return json({error:'Unsupported operation'},400);
  if(!env.ALIGO_API_KEY || !env.ALIGO_USERID || !env.ALIGO_SENDER_KEY || !env.ALIGO_SENDER)return json({error:'Provider not configured'},503);
  const data=Object.fromEntries(FIELDS[v.path].filter(k=>v.data[k]!=null).map(k=>[k,String(v.data[k])]));
  if(v.path==='history/detail' && !/^\d{1,30}$/.test(data.mid || ''))return json({error:'Invalid message ID'},400);
  if(v.path==='history/detail' && !ledger.ownsMid(data.mid))return json({error:'Message not owned by this relay'},403);
  if(v.path!=='history/detail' && !(env.ALIGO_TEMPLATE_CODES || 'UN_2584').split(',').map(s=>s.trim()).includes(data.tpl_code))return json({error:'Template not allowed'},403);
  const hash=createHash('sha256').update(JSON.stringify([v.path,data,env.ALIGO_USERID,env.ALIGO_SENDER_KEY])).digest('hex');
  if(v.path==='alimtalk/send'){
    if(!/^01[016789]\d{7,8}$/.test(data.receiver_1 || '') || !data.message_1 || data.message_1.length>1000 || !data.subject_1)return json({error:'Invalid recipient/message'},400);
    const old=ledger.get(v.request_id);
    if(old){if(old.hash!==hash)return json({error:'Request ID reused'},409);return old.response?json(JSON.parse(old.response)):json({error:'Delivery outcome requires review'},409);}
    // Durable reservation survives process restarts and uncertain HTTP outcomes.
    if(!ledger.claim(v.request_id,hash))return json({error:'Delivery outcome requires review'},409);
    Object.assign(data,{sender:env.ALIGO_SENDER,failover:'N',testMode:'N'});
  }
  const body=new URLSearchParams({...data,apikey:env.ALIGO_API_KEY,userid:env.ALIGO_USERID});
  if(v.path!=='history/detail')body.set('senderkey',env.ALIGO_SENDER_KEY);
  try{
    const response=await upstream('https://kakaoapi.aligo.in/akv10/'+v.path+'/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(9000),redirect:'error'});
    if(!response.ok)throw Error('Upstream unavailable');
    const result=await response.json();
    if(v.path==='template/list' && Array.isArray(result.list))result.list=result.list.filter(t=>t.templtCode===data.tpl_code);
    if(v.path==='alimtalk/send')ledger.complete(v.request_id,result);
    return json(result);
  }catch{return json({error:'Upstream outcome unknown; do not retry sending'},502);}
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
  for(const k of ['ALIGO_API_KEY','ALIGO_USERID','ALIGO_SENDER_KEY','ALIGO_SENDER','ALIGO_RELAY_SECRET'])if(!process.env[k])throw Error('Missing server setting: '+k);
  const dbPath=process.env.ALIGO_RELAY_DB || './data/aligo-relay.sqlite';mkdirSync(dirname(dbPath),{recursive:true});const ledger=relayLedger(new DatabaseSync(dbPath));
  createServer(async(req,res)=>{
    try{
      let body='';for await(const chunk of req){body+=chunk;if(body.length>16000){res.writeHead(413);res.end();return;}}
      const response=await relayRequest(new Request('http://relay.local'+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body})}),process.env,ledger);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
    }catch{res.writeHead(500);res.end('Relay unavailable');}
  }).listen(Number(process.env.PORT || 8787),'127.0.0.1');
}
