// Daily privacy cleanup, through the existing application's expiry-only endpoint.
// No database binding, customer data, credentials, or public Worker route.
export async function triggerCleanup(){
 const r=await fetch('https://megaspot.kr/api/deposit-refunds/cleanup',{method:'POST',headers:{'content-type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(30000)});
 if(r.status!==204)throw Error('Deposit retention cleanup failed: HTTP '+r.status);
}
export default {async scheduled(controller,env,ctx){ctx.waitUntil(triggerCleanup());},async fetch(){return new Response('Not found',{status:404});}};
