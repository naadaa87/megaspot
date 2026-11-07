import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,DAY} from './helpers/admin-fixture.mjs';
import {onRequestGet} from '../functions/api/reservation-calendar.js';
import {onRequest as middleware} from '../functions/api/_middleware.js';
const add=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*864e5).toISOString().slice(0,10);
function setup(t){const f=fixture();t.after(()=>f.db.close());let n=0;return {...f,insert({space='megaspot-gundae',date=DAY,start=10,end=17,status='confirmed'}={}){f.db.prepare('INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,start_h,end_h,status,memo,amount,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('PRIVATE-CODE-'+(++n),space,'PRIVATE-NAME','01099998888','8888',date,start,end,status,'PRIVATE-MEMO',987654,'now');return 'PRIVATE-CODE-'+n;},async get(from=DAY,to=DAY,env=f.env){const r=await onRequestGet({request:new Request('https://megaspot.kr/api/reservation-calendar?'+new URLSearchParams({from,to})),env});return {status:r.status,cache:r.headers.get('cache-control'),data:await r.json()};}};}
test('public calendar exposes only confirmed room/date/time, not identities, amounts, inquiry or held dates',async t=>{const f=setup(t);f.insert();f.insert({space:'megaspot-gundae-2',start:18,end:23});f.insert({status:'cancelled',start:6,end:8});f.insert({status:'completed',start:8,end:9});f.insert({space:'external-secret'});f.db.prepare("INSERT INTO calendar_blocks(space_id,date,state) VALUES('megaspot-gundae',?,'hold')").run(DAY);const r=await f.get();assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.data.intervals.length,2);assert.deepEqual(Object.keys(r.data.intervals[0]),['space','start','end']);const body=JSON.stringify(r.data);for(const secret of ['PRIVATE','01099998888','8888','987654','external-secret','hold','booking_code','customer_name'])assert.ok(!body.includes(secret),secret);assert.equal(r.data.timezone,'Asia/Seoul');assert.equal(r.data.spaces[1].opensOn,'2026-11-13');});
test('overnight and next-day-start reservations appear on adjacent calendar dates and month boundaries',async t=>{const f=setup(t);f.insert({date:add(DAY,-1),start:18,end:31});f.insert({start:25,end:31});const r=await f.get(DAY,add(DAY,1));assert.equal(r.data.intervals.length,2);assert.equal(r.data.intervals[0].start,add(DAY,-1)+'T18:00:00+09:00');assert.equal(r.data.intervals[0].end,DAY+'T07:00:00+09:00');assert.equal(r.data.intervals[1].start,add(DAY,1)+'T01:00:00+09:00');f.insert({date:add(DAY,-2),start:23,end:48});assert.equal((await f.get()).data.intervals.length,1);});
test('overlapping or adjacent confirmed ranges merge without exposing the number of customers',async t=>{const f=setup(t);f.insert({start:10,end:14});f.insert({start:13,end:17});f.insert({start:17,end:18});const {data}=await f.get();assert.deepEqual(data.intervals,[{space:'megaspot-gundae',start:DAY+'T10:00:00+09:00',end:DAY+'T18:00:00+09:00'}]);});
test('legacy unknown or malformed hours remain explicit; never pretend those dates are empty',async t=>{const f=setup(t);for(const hours of [[null,null],[null,18],[18,12],[-1,12],[10,49]])f.insert({start:hours[0],end:hours[1]});const {data}=await f.get();assert.equal(data.intervals.length,0);assert.deepEqual(data.unknownDates,[{space:'megaspot-gundae',date:DAY}]);});
test('cancellations and date/hour changes immediately update the public read model',async t=>{const f=setup(t);f.insert();assert.equal((await f.get()).data.intervals.length,1);f.db.prepare('UPDATE bookings SET date=?,start_h=18,end_h=22').run(add(DAY,1));assert.equal((await f.get()).data.intervals.length,0);assert.equal((await f.get(add(DAY,1),add(DAY,1))).data.intervals[0].end,add(DAY,1)+'T22:00:00+09:00');f.db.exec("UPDATE bookings SET status='cancelled'");assert.equal((await f.get(add(DAY,1),add(DAY,1))).data.intervals.length,0);});
test('strict date validation and bounded ranges reject invalid and excessive queries',async t=>{const f=setup(t);for(const [from,to]of[['2026-02-30',DAY],[DAY,add(DAY,-1)],[DAY,add(DAY,62)],['2020-01-01','2020-01-02'],[DAY,add(DAY,500)],['bad',DAY]])assert.equal((await f.get(from,to)).status,400);assert.equal((await f.get(DAY,DAY,{})).status,503);const broken={DB:{prepare(){throw Error('PRIVATE SQL');}}};const r=await f.get(DAY,DAY,broken);assert.equal(r.status,503);assert.ok(!JSON.stringify(r.data).includes('SQL'));assert.equal(r.data.intervals,undefined);});
test('public calendar reads do not schedule notification or outbound-message jobs',async t=>{const f=setup(t),jobs=[];for(const suffix of ['', '/'])await middleware({env:f.env,request:new Request('https://megaspot.kr/api/reservation-calendar'+suffix+'?from='+DAY+'&to='+DAY),next:async()=>new Response('ok'),waitUntil:p=>jobs.push(p)});assert.equal(jobs.length,0);});

test('legacy confirmed reservations reuse linked hour data only when both booking hours are absent',async t=>{const f=setup(t),code=f.insert({start:null,end:null});f.db.prepare('UPDATE bookings SET inquiry_ref=? WHERE booking_code=?').run('MS-TEST',code);let r=await f.get();assert.equal(r.data.unknownDates.length,0);assert.equal(r.data.intervals[0].start,DAY+'T10:00:00+09:00');f.db.prepare('UPDATE bookings SET start_h=18,end_h=22 WHERE booking_code=?').run(code);r=await f.get();assert.equal(r.data.intervals[0].start,DAY+'T18:00:00+09:00');f.db.prepare('UPDATE bookings SET end_h=NULL WHERE booking_code=?').run(code);assert.equal((await f.get()).data.unknownDates.length,1);});
test('a public range with too many intervals fails explicitly instead of silently truncating availability',async t=>{const f=setup(t),env={DB:{prepare(){return {bind(){return this;},async all(){return {results:Array(5001).fill({space_id:'megaspot-gundae',date:DAY,start_h:10,end_h:17})};}};}}};const r=await f.get(DAY,DAY,env);assert.equal(r.status,503);assert.equal(r.data.code,'TOO_MANY_INTERVALS');assert.equal(r.data.intervals,undefined);});

test('한 달력 응답 안에서 확정 전의 대기와 확정 후의 예약이 동시에 사라지지 않는다',async t=>{
 const f=setup(t);
 const prepare=f.env.DB.prepare;
 let confirmed=false;
 f.env.DB.prepare=sql=>{
  const statement=prepare(sql),all=statement.all;
  statement.all=async()=>{
   const snapshot=await all();
   if(!confirmed){
    confirmed=true;
    const code=f.insert();
    f.db.prepare("UPDATE bookings SET inquiry_ref='MS-TEST' WHERE booking_code=?").run(code);
    f.db.exec("UPDATE inquiries SET status='예약 확정' WHERE ref='MS-TEST'");
   }
   return snapshot;
  };
  return statement;
 };
 const before=await f.get();
 assert.equal(before.data.pendingDates[0]?.count,1);
 assert.equal(before.data.intervals.length,0);
 const after=await f.get();
 assert.deepEqual(after.data.pendingDates,[]);
 assert.equal(after.data.intervals.length,1);
});
