import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {fixture} from './helpers/parking-fixture.mjs';
import {wakeParkingRegistration} from '../functions/api/_parking_wake.js';
import {createAmanoWake} from '../deploy/amano-server/wake.mjs';
const secret='test-only-registration-wake-secret-32-characters';
function wakeFixture(t){
 const f=fixture(t);f.env.ALIGO_RELAY_SECRET=secret;const paymentFetch=globalThis.fetch,wakes=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url!=='https://relay.naranhistory.com/megaspot/amano')return paymentFetch(url,options);
  const d=JSON.parse(options.body);assert.equal(options.headers['X-Megaspot-Signature'],createHmac('sha256',secret).update(options.body).digest('hex'));
  wakes.push({body:d,paid:f.db.prepare("SELECT COUNT(*) n FROM orders WHERE status='paid'").get().n});
  return Response.json({ok:true,accepted:true},{status:202});
 });return {...f,wakes};
}
test('single and multi-car verified payment wakes only after commit, duplicate callback does not wake again',async t=>{
 const f=wakeFixture(t);
 for(const extra of [{},{vehicles:[{plate:'234나5678',plate_confirm:'234나5678',ticket:'2h'},{plate:'345다6789',plate_confirm:'345다6789',ticket:'1h'}]}]){
  const p=await f.buy(extra),before=f.wakes.length;
  assert.equal(await(await f.feedback(p,'10')).text(),'SUCCESS');assert.equal(f.wakes.length,before);
  assert.equal(await(await f.feedback(p,'4',{var2:'invalid'})).text(),'FAIL');assert.equal(f.wakes.length,before);
  assert.equal(await(await f.feedback(p)).text(),'SUCCESS');assert.equal(f.wakes.length,before+1);assert.equal(f.wakes.at(-1).body.reason,'payment');assert.ok(f.wakes.at(-1).paid>0);
  assert.equal(await(await f.feedback(p)).text(),'SUCCESS');assert.equal(f.wakes.length,before+1);
 }
});
test('arrival wakes requested vehicle, pending refund and test payment do not start registration',async t=>{
 const f=wakeFixture(t),p=await f.buy();await f.feedback(p);f.wakes.length=0;
 assert.equal((await f.call('orders/'+p.oid+'/arrive','POST',{},p.key)).status,200);assert.equal(f.wakes.length,1);assert.equal(f.wakes[0].body.reason,'arrival');
 f.db.prepare('UPDATE parking_orders SET refund_requested_at=? WHERE oid=?').run('2026-11-03 05:00:00',p.oid);
 assert.equal((await f.call('orders/'+p.oid+'/arrive','POST',{},p.key)).status,409);assert.equal(f.wakes.length,1);
 const q=await f.buy({plate:'234나5678',plate_confirm:'234나5678'});f.db.prepare('UPDATE orders SET test=1 WHERE oid=?').run(q.oid);await f.feedback(q);assert.equal(f.wakes.length,1);
});
test('wake outage never reverses or rejects an accepted payment',async t=>{
 const f=fixture(t);f.env.ALIGO_RELAY_SECRET=secret;const p=await f.buy();
 // The fixture rejects all non-PayApp requests, simulating a failed wake transport.
 assert.equal(await(await f.feedback(p)).text(),'SUCCESS');assert.equal((await f.get(p)).payment_status,'paid');
});
test('background wake is bounded, authenticated and handles relay failures without throwing',async()=>{
 const pending=[];let calls=0;
 const r=await wakeParkingRegistration({ALIGO_RELAY_SECRET:secret},{reason:'arrival',waitUntil:p=>pending.push(p)},async(url,opts)=>{calls++;assert.equal(opts.redirect,'manual');assert.ok(opts.signal);return new Response('unavailable',{status:503});});
 assert.deepEqual(r,{scheduled:true});assert.deepEqual(await pending[0],{ok:false});assert.equal(calls,1);
 assert.deepEqual(await wakeParkingRegistration({}, {},async()=>{throw Error('must not call');}),{ok:false,configured:false});
});
function memory(){const values=new Map();return {read:k=>structuredClone(values.get(k)),save:(k,v)=>values.set(k,structuredClone(v))};}
test('immediate queue coalesces signals, waits for shared lock and drains a new signal during registration without overlap',async()=>{
 const store=memory(),jobs=[];let calls=0,active=0,maxActive=0,release;
 const gate=new Promise(r=>release=r);
 const q=createAmanoWake({store,schedule:fn=>jobs.push(fn),sleep:async()=>{},run:async()=>{calls++;active++;maxActive=Math.max(maxActive,active);try{if(calls===1)return {busy:true};if(calls===2)await gate;return {ok:true};}finally{active--;}}});
 q.enqueue('payment');q.enqueue('payment');assert.equal(calls,0);
 const running=jobs.shift()();await Promise.resolve();await Promise.resolve();
 assert.equal(calls,2);q.enqueue('arrival');await jobs.shift()();release();await running;
 assert.equal(calls,3);assert.equal(maxActive,1);assert.equal(store.read('registration-wake').pending,false);assert.equal(store.read('registration-wake').reason,'arrival');
});
test('disabled worker does not register; failure retains durable wake for fallback recovery',async()=>{
 const store=memory(),jobs=[];let enabled=false,calls=0;
 const q=createAmanoWake({store,enabled:()=>enabled,schedule:fn=>jobs.push(fn),run:async()=>{calls++;throw Error('offline');}});
 q.enqueue('payment');await jobs.shift()();assert.equal(calls,0);assert.equal(store.read('registration-wake').pending,true);
 enabled=true;await q.drain();assert.equal(calls,1);assert.equal(store.read('registration-wake').pending,true);assert.ok(store.read('registration-wake').last_error_at);
});
