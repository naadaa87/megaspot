import test from 'node:test';import assert from 'node:assert/strict';
import {retryRead,guardedRead,readFailed,readRecovered,fallbackIssues,transientReadError} from '../deploy/amano-server/read-retry.mjs';
import {runCycle} from '../deploy/amano-server/worker.mjs';
import {DISCOUNTS} from '../deploy/amano-server/client.mjs';
const memory=()=>{const data={};return {read:k=>structuredClone(data[k]||null),save:(k,v)=>data[k]=structuredClone(v)};};
const timeout=()=>new DOMException('The operation was aborted due to timeout','TimeoutError');
test('read retries are bounded, delayed, and only for transient errors',async()=>{
 let attempts=0;const delays=[];assert.equal(await retryRead(async()=>{if(++attempts<3)throw timeout();return 42;},{sleep:async ms=>delays.push(ms)}),42);assert.equal(attempts,3);assert.deepEqual(delays,[1000,3000]);
 attempts=0;await assert.rejects(()=>retryRead(async()=>{attempts++;throw Error('아마노 잔액 부족');},{sleep:async()=>{}}),/잔액/);assert.equal(attempts,1);
 assert.equal(transientReadError(Error('메가스팟 서버 API 응답 확인 필요 HTTP 503')),true);assert.equal(transientReadError(Error('HTTP 403')),false);
});
test('only three exhausted query cycles notify; recovery resets the durable streak',async()=>{
 const store=memory();for(let i=1;i<=3;i++)await assert.rejects(()=>guardedRead(store,'orders','주문 조회',async()=>{throw timeout();},{sleep:async()=>{}}),e=>e.readDeferred&&e.failures===i&&e.notify===(i===3));
 assert.equal(await guardedRead(store,'orders','주문 조회',async()=>({ok:true})).then(x=>x.ok),true);assert.equal(store.read('read-health').orders.failures,0);
 await assert.rejects(()=>guardedRead(store,'orders','주문 조회',async()=>{throw timeout();},{sleep:async()=>{}}),e=>e.failures===1&&!e.notify);
});
test('local service failures stay quiet twice, but uncertain registration is immediate',()=>{
 const store=memory();assert.deepEqual(fallbackIssues(store),[]);assert.deepEqual(fallbackIssues(store),[]);assert.equal(fallbackIssues(store).length,1);readRecovered(store,'local-service');assert.deepEqual(fallbackIssues(store),[]);
 store.save('operations',{MS001:{phase:'request_1'}});assert.equal(fallbackIssues(store)[0].oid,'MS001');
});
function fixture(){
 const store=memory(),p={oid:'MSTESTRETRY',plate:'123가4567',visit_date:'2026-11-17',ticket:'2h',hours:2,price:8000},entry={id:'E1',plate:p.plate,cardType:'0',entryAt:'2026-11-17T12:00:00',out:false};
 let status='waiting',balance=50000;const history=[],writes=[],events=[];
 const site=async(action,data={})=>{if(action==='orders')return {operating:true,date:p.visit_date,items:status==='waiting'?[p]:[]};if(action==='order')return {order:{...p,status,payment_status:'paid',entry_id:'E1',free_hours:1,paid_hours:1}};if(action==='claim')status='processing';if(action==='issue')status='issue';if(action==='complete')status='applied';return {ok:true};};
 const client={credentials:{username:'test'},login:async()=>{},entries:async()=>[entry],detail:async()=>({entry,balance,types:Object.entries(DISCOUNTS).map(([id,d])=>({id,...d})),discounts:structuredClone(history)}),register:async(e,code,oid)=>{writes.push(code);balance-=DISCOUNTS[code].price;history.push({id:'H'+writes.length,code,...DISCOUNTS[code],entryId:entry.id,memo:oid,account:'test',charged:DISCOUNTS[code].price});}};
 return {p,store,client,site,writes,events,status:()=>status,run:()=>runCycle({store,client,site,onIssue:async e=>events.push(e)})};
}
async function fast(t,work){t.mock.timers.enable({apis:['setTimeout']});let done=false;const result=work().finally(()=>done=true);for(let i=0;i<100&&!done;i++){await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(5000);}return result;}
test('order-feed timeout retries silently, then escalates only at the third exhausted cycle',async t=>fast(t,async()=>{
 const f=fixture();let calls=0;const site=async()=>{calls++;throw timeout();};
 for(let i=1;i<=3;i++){const r=await runCycle({store:f.store,client:f.client,site,onIssue:async e=>f.events.push(e)});assert.equal(r.retry_pending,true);assert.equal(r.issues.length,i===3?1:0);}
 assert.equal(calls,9);assert.equal(f.events.length,1);assert.deepEqual(f.writes,[]);assert.equal(f.status(),'waiting');
}));
test('a pre-registration read timeout leaves the order retryable, and recovery applies free first once',async t=>fast(t,async()=>{
 const f=fixture(),original=f.client.entries;let calls=0;f.client.entries=async()=>{calls++;throw timeout();};
 const first=await f.run();assert.equal(calls,3);assert.equal(first.retry_pending,true);assert.equal(first.issues.length,0);assert.equal(f.status(),'waiting');assert.equal(f.store.read('operations'),null);assert.deepEqual(f.writes,[]);
 f.client.entries=original;assert.equal((await f.run()).processed,1);assert.equal(f.status(),'applied');assert.deepEqual(f.writes,['1','6']);assert.equal(f.store.read('read-health')['entry:'+f.p.oid].failures,0);
}));
test('repeated entry-query failures notify with the affected order, rather than a generic first-time alert',async t=>fast(t,async()=>{
 const f=fixture();f.client.entries=async()=>{throw timeout();};for(let i=1;i<=3;i++)await f.run();assert.equal(f.events.length,1);assert.equal(f.events[0].oid,f.p.oid);assert.equal(f.status(),'issue');assert.deepEqual(f.writes,[]);
}));
test('a timeout after a discount write is never retried or hidden by read-error suppression',async()=>{
 const f=fixture();f.client.register=async()=>{f.writes.push('1');throw timeout();};await f.run();await f.run();assert.deepEqual(f.writes,['1']);assert.equal(f.events.length,1);assert.equal(f.status(),'issue');assert.equal(f.store.read('operations')[f.p.oid].phase,'review');
});
test('balance and plate validation still report immediately',async()=>{
 const f=fixture();f.client.detail=async()=>({entry:{id:'E1',plate:f.p.plate,cardType:'0',entryAt:'2026-11-17T12:00:00',out:false},balance:0,types:Object.entries(DISCOUNTS).map(([id,d])=>({id,...d})),discounts:[]});await f.run();assert.equal(f.events.length,1);assert.equal(f.events[0].kind,'balance');assert.deepEqual(f.writes,[]);
});
test('an unfinished discount operation escalates immediately even if the feed query times out',async t=>fast(t,async()=>{
 const f=fixture();f.store.save('operations',{[f.p.oid]:{phase:'request_1'}});const r=await runCycle({store:f.store,client:f.client,site:async()=>{throw timeout();},onIssue:async e=>f.events.push(e)});assert.equal(r.issues.length,1);assert.equal(f.events[0].oid,f.p.oid);assert.equal(f.events[0].kind,'registration');assert.deepEqual(f.writes,[]);
}));
