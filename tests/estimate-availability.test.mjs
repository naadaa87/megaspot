import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../assets/js/reservation-calendar.js',import.meta.url),'utf8');
const ONE='megaspot-gundae',TWO='megaspot-gundae-2',date='2026-11-24';
const interval=(space,start,end,d=date)=>({space,start:d+'T'+start+':00+09:00',end:d+'T'+end+':00+09:00'});
function setup(intervals=[],unknownDates=[]){
  let fail=false,calls=0;
  const M={esc:s=>String(s)};
  class Clock extends Date{static now(){return Date.parse('2026-11-04T12:00:00+09:00');}}
  vm.runInNewContext(code,{window:{MEGASPOT:M},document:{readyState:'loading',addEventListener(){}},Date:Clock,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:async()=>{calls++;return {ok:!fail,json:async()=>({ok:true,timezone:'Asia/Seoul',range:{from:'2026-11-01',to:'2026-12-31'},updatedAt:'2026-11-04T12:00:00+09:00',spaces:[{id:ONE},{id:TWO}],intervals,unknownDates,pendingDates:[]})};}});
  return {inspect:M.reservations.inspectRange,check:M.reservations.checkRange,fail:v=>{fail=v;},calls:()=>calls};
}
const choice={space:ONE,date,start:13,end:17};
test('overlap reports the occupied interval and suggests same-duration, nonoverlapping alternatives in either room',async()=>{
  const f=setup([interval(ONE,'10:00','17:00'),interval(ONE,'18:00','23:00')]);
  const r=await f.inspect(choice);assert.equal(r.status.conflict,true);assert.equal(r.conflicts.length,1);
  assert.equal(r.suggestions[0].space,TWO);assert.equal(r.suggestions[0].start,13);
  assert.equal(r.suggestions.length,4);
  for(const c of r.suggestions){assert.equal(c.end-c.start,4);const s=await f.check(c);assert.equal(s.conflict||s.closed||s.invalid||s.unknown,false);}
});
test('touching reservation endpoints are permitted and no alternatives are offered for a clear selection',async()=>{
  const f=setup([interval(ONE,'10:00','17:00')]);
  for(const c of [{...choice,start:6,end:10},{...choice,start:17,end:21}]){const r=await f.inspect(c);assert.equal(r.status.conflict,false);assert.equal(r.suggestions.length,0);}
});
test('overnight occupancy blocks the next morning and alternatives respect next-day limits',async()=>{
  const f=setup([{space:ONE,start:'2026-11-23T18:00:00+09:00',end:date+'T07:00:00+09:00'},{space:TWO,start:date+'T18:00:00+09:00',end:'2026-11-25T07:00:00+09:00'}]);
  const r=await f.inspect({...choice,start:5,end:9});assert.equal(r.status.conflict,true);
  assert.equal(r.suggestions.find(c=>c.space===ONE).start,7);
  const night=await f.inspect({...choice,space:TWO,start:23,end:31});assert.equal(night.status.conflict,true);
  for(const c of night.suggestions){assert.ok(c.start>=5&&c.end<=31);assert.equal((await f.check(c)).conflict,false);}
});
test('unknown hours exclude that room from suggested times, and a fully occupied pair offers no automatic choice',async()=>{
  let f=setup([],[{space:ONE,date}]);let r=await f.inspect(choice);assert.equal(r.status.unknown,true);assert.equal(r.suggestions.length,1);assert.equal(r.suggestions[0].space,TWO);
  f=setup([ONE,TWO].map(space=>({space,start:date+'T00:00:00+09:00',end:'2026-11-26T00:00:00+09:00'})));r=await f.inspect(choice);assert.equal(r.suggestions.length,0);
});
test('an unopened room and invalid ranges are never suggested',async()=>{
  const f=setup([interval(ONE,'10:00','17:00','2026-11-12')]);const r=await f.inspect({...choice,date:'2026-11-12'});assert.equal(r.suggestions.some(c=>c.space===TWO),false);
  const bad=await f.inspect({...choice,end:13});assert.equal(bad.status.invalid,true);assert.equal(bad.suggestions.length,0);
  await assert.rejects(f.inspect({...choice,date:'2026-02-30'}));
});
test('fresh revalidation detects changed occupancy and server failures reject instead of returning availability',async()=>{
  const intervals=[],f=setup(intervals);assert.equal((await f.inspect(choice)).status.conflict,false);
  intervals.push(interval(ONE,'13:00','17:00'));assert.equal((await f.inspect(choice,true)).status.conflict,true);assert.equal(f.calls(),2);
  f.fail(true);await assert.rejects(f.inspect(choice,true));
});
