import {parkingSign} from './_parking_notifications.js';
// Only wakes the authenticated worker. Eligibility, free-first pricing and
// duplicate protection remain in the existing site/worker transaction flow.
export async function wakeParkingRegistration(env,{reason='payment',waitUntil}={},upstream=fetch){
 if(String(env.ALIGO_RELAY_SECRET||'').length<32)return {ok:false,configured:false};
 const task=(async()=>{
  try{
   const body=JSON.stringify({action:'wake',reason,time:Date.now()});
   const r=await upstream('https://relay.naranhistory.com/megaspot/amano',{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':await parkingSign(env.ALIGO_RELAY_SECRET,body)},body,redirect:'manual',signal:AbortSignal.timeout(5000)});
   if(!r.ok)return {ok:false};
   const d=await r.json();return {ok:d.ok===true,accepted:d.accepted===true};
  }catch{return {ok:false};}
 })();
 if(typeof waitUntil==='function'){waitUntil(task);return {scheduled:true};}
 return task;
}
