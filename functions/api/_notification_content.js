// Rendered private links are encrypted, never stored as plaintext in history/settings.
import {seal,unseal,keyReady} from './_deposit_refunds.js';
import {now} from './_lib.js';
const key=(engine,id)=>'notification_content:'+engine+':'+id;
export function noticeButtons(raw){let value=raw;if(typeof value==='string'){try{value=JSON.parse(value);}catch{return [];}}const buttons=Array.isArray(value)?value:value?.button||[];return buttons.map(b=>({name:b.name||'',linkType:b.linkType||'WL',linkMo:b.linkMo||b.linkM||'',linkPc:b.linkPc||b.linkP||''}));}
export async function saveNotificationContent(env,engine,id,content){
 if(!keyReady(env))return;
 const k=key(engine,id),value=await seal(env,k,'notification-content',{...content,requested_at:content.requested_at||now()});
 await env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(k,value,now()).run();
}
export async function readNotificationContent(env,engine,id){
 if(!keyReady(env))return null;const k=key(engine,id),row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(k).first();if(!row)return null;
 try{return await unseal(env,k,'notification-content',row.value);}catch{return null;}
}
