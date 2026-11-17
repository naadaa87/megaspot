import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/parking-fixture.mjs';
import {parkingSign} from '../functions/api/_parking_notifications.js';
import {arrivalWindow,parkingDate} from '../functions/api/_parking.js';
import {amanoOperating,amanoEligible} from '../functions/api/_amano_server.js';
import {runCycle} from '../deploy/amano-server/worker.mjs';
import {DISCOUNTS} from '../deploy/amano-server/client.mjs';
import {onRequest} from '../functions/api/parking/[[path]].js';
const secret='test-only-parking-all-hours-secret-32-characters';
async function site(f,action,extra={}){f.env.ALIGO_RELAY_SECRET=secret;const body=JSON.stringify({action,...extra,time:Date.now()});const r=await onRequest({env:f.env,params:{path:['automation','server']},request:new Request('https://megaspot.test/api/parking/automation/server',{method:'POST',headers:{'X-Megaspot-Signature':await parkingSign(secret,body)},body})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
test('early morning, midnight, weekend and holiday operating windows are open without allowing invalid dates',()=>{
 for(const at of ['2026-12-25T00:00:00+09:00','2026-12-25T05:30:00+09:00','2026-12-25T23:59:59+09:00','2026-12-26T09:00:00+09:00']){assert.equal(arrivalWindow(Date.parse(at)),true);assert.equal(amanoOperating(Date.parse(at)),true);}
 assert.equal(parkingDate('2026-12-25'),true);assert.equal(parkingDate('2026-02-30'),false);assert.equal(arrivalWindow(NaN),false);
});
function clientFor(p,entryAt){let balance=50000;const discounts=[],mutations=[],e={id:'ENTRY-ALL-HOURS',plate:p.plate,entryAt,cardType:'0',out:false};return {mutations,client:{credentials:{username:'test'},login:async()=>{},entries:async(plate,date)=>{assert.equal(date,entryAt.slice(0,10));return[e];},detail:async()=>({entry:e,balance,types:Object.entries(DISCOUNTS).map(([id,d])=>({id,...d})),discounts:structuredClone(discounts)}),register:async(entry,code,oid)=>{mutations.push(code);const d=DISCOUNTS[code];balance-=d.price;discounts.push({id:'H'+mutations.length,code,...d,charged:d.price,entryId:e.id,memo:oid,account:'test'});}}};}
const memory=()=>{const d={};return {read:k=>structuredClone(d[k]||null),save:(k,v)=>d[k]=structuredClone(v)};};
for(const [at,batch] of [['2026-12-25T05:30:00+09:00',false],['2026-12-25T23:59:00+09:00',true]])test('holiday '+at.slice(11,16)+' checkout, arrival and free-first automatic registration',async t=>{
 const f=fixture(t);t.mock.method(Date,'now',()=>Date.parse(at));const c=await(await f.call('config')).json();assert.deepEqual(c.holidays,[]);assert.equal(c.accepting_arrivals,true);assert.match(c.service_hours,/24시간/);
 const vehicle={ticket:'2h',plate:'123가4567',plate_confirm:'123가4567'},p=await f.buy({date:'2026-12-25',...vehicle,...(batch?{vehicles:[vehicle]}:{})});await f.feedback(p);
 const orders=(await site(f,'orders')).items;assert.equal(orders.length,1);assert.equal((await f.call('orders/'+orders[0].oid+'/arrive','POST',{},p.key)).status,200);
 const {client,mutations}=clientFor(orders[0],'2026-12-25T'+(batch?'23:58':'05:20')+':00');assert.equal((await runCycle({site:(a,d)=>site(f,a,d),client,store:memory()})).processed,1);assert.deepEqual(mutations,['1','6']);assert.equal((await site(f,'order',{oid:orders[0].oid})).order.status,'applied');
});
test('a future purchase is checked only on its visit date, including a holiday before 10am',async t=>{
 const f=fixture(t),p=await f.buy({date:'2026-12-25'});await f.feedback(p);assert.equal((await site(f,'orders')).items.length,0);
 t.mock.method(Date,'now',()=>Date.parse('2026-12-25T06:00:00+09:00'));assert.equal((await site(f,'orders')).items.length,1);
});
test('just-before-midnight hourly/24h orders can finish after midnight using the same original entry date',async t=>{
 const f=fixture(t);t.mock.method(Date,'now',()=>Date.parse('2026-12-25T23:59:00+09:00'));const p=await f.buy({date:'2026-12-25'});await f.feedback(p);
 t.mock.method(Date,'now',()=>Date.parse('2026-12-26T00:01:00+09:00'));const orders=(await site(f,'orders')).items;assert.equal(orders.length,1);const {client,mutations}=clientFor(orders[0],'2026-12-25T23:58:00');assert.equal((await runCycle({site:(a,d)=>site(f,a,d),client,store:memory()})).processed,1);assert.deepEqual(mutations,['1','6']);
 const at=Date.parse('2026-12-26T00:01:00+09:00');assert.equal(amanoEligible({visit_date:'2026-12-25',ticket:'24h',status:'waiting'},at),true);assert.equal(amanoEligible({visit_date:'2026-12-25',ticket:'daily',status:'waiting'},at),false);assert.equal(amanoEligible({visit_date:'2026-12-25',ticket:'1h'},Date.parse('2026-12-26T00:30:00+09:00')),false);assert.equal(amanoEligible({visit_date:'2026-12-24',ticket:'24h'},at),false);
});
