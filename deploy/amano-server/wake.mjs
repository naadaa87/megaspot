// One coalescing queue per server store. It uses the existing cycle lock and
// durable operation ledger, including when a timer and payment arrive together.
const queues=new WeakMap();
export function createAmanoWake({store,run,enabled=()=>true,schedule=fn=>setTimeout(fn,0),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxBusyRetries=240}){
 let running=false;
 const drain=async()=>{
  if(running)return;running=true;let retries=0;
  try{
   while(store.read('registration-wake')?.pending&&enabled()){
    const current=store.read('registration-wake');
    try{
     const result=await run();
     if(result.busy){if(++retries>=maxBusyRetries)return;await sleep(1000);continue;}
     retries=0;
     const latest=store.read('registration-wake');
     if(latest.version===current.version)store.save('registration-wake',{...latest,pending:false,finished_at:new Date().toISOString(),ok:result.ok===true});
    }catch{const latest=store.read('registration-wake');store.save('registration-wake',{...latest,last_error_at:new Date().toISOString()});return;}
   }
  }finally{running=false;}
 };
 return {enqueue(reason){const old=store.read('registration-wake');store.save('registration-wake',{version:(old?.version||0)+1,pending:true,requested_at:new Date().toISOString(),reason:reason==='arrival'?'arrival':'payment'});schedule(drain);},drain};
}
export function queueAmanoWake(options,reason){
 let q=queues.get(options.store);if(!q){q=createAmanoWake(options);queues.set(options.store,q);}
 q.enqueue(reason);
}
