import assert from 'node:assert/strict';
import test from 'node:test';
import {memoFor,ReviewRequired,validatedEntry} from '../guard.mjs';
import {runJob} from '../job.mjs';

const draft={date:'2026-12-24',start:17,end:23,marker:'MSWEB-0123456789ABCDEF',product:140188,
  action:'block',host_url:'https://partner.spacecloud.kr/reservation-calendar?product=140188&space=81999',
  public_url:'https://www.spacecloud.kr/space/81999'};
const owned=(entry=draft)=>({date:entry.date,name:entry.marker,memo:memoFor(entry),manual:true,start_min:entry.start*60,end_min:entry.end*60});
function fixture(records=[]){
  const log=[];
  const host={
    openHost(){log.push('open');},
    recordsFor(){log.push('read');return records;},
    async createSegment(entry){await this.beforeWrite();log.push('create');records=[owned(entry),...records];},
    async removeSegment(_entry,record){await this.beforeWrite();log.push('remove');records=records.filter(x=>x!==record);}
  };
  return {host,log,check(){log.push('lease');},verify(){log.push('public');}};
}

test('opens precise product, checks before creating, then verifies host and customer view',async()=>{
  const f=fixture();
  assert.deepEqual(await runJob({entry:draft},f.host,f.check,f.verify),{result:'verified'});
  assert.deepEqual(f.log,['open','read','lease','lease','create','read','public']);
});
test('replay recognizes an exact record and does not register it again',async()=>{
  const f=fixture([owned()]);
  assert.deepEqual(await runJob({entry:draft},f.host,f.check,f.verify),{result:'verified'});
  assert.deepEqual(f.log,['open','read','read','public']);
});
test('external or ambiguous records are never overwritten and public uncertainty stays in review',async()=>{
  const overlapping=fixture([{...owned(),name:'someone else',memo:'',date:'2026-12-23',start_min:1380,end_min:2700}]);
  assert.deepEqual(await runJob({entry:draft},overlapping.host,overlapping.check,overlapping.verify),{result:'review',reason:'conflict'});
  assert.ok(!overlapping.log.includes('create'));
  const ambiguous=fixture([{...owned(),memo:'changed'}]);
  assert.deepEqual(await runJob({entry:draft},ambiguous.host,ambiguous.check,ambiguous.verify),{result:'review',reason:'unknown_result'});
  const f=fixture([owned()]);
  assert.deepEqual(await runJob({entry:draft},f.host,f.check,()=>{throw new ReviewRequired('public_unverified');}),{result:'review',reason:'public_unverified'});
});
test('release only removes exactly matching manual ownership and preserves a foreign overlap',async()=>{
  const release={...draft,action:'release'};
  const f=fixture([owned(),{...owned(),name:'another',memo:'',manual:false}]);
  assert.deepEqual(await runJob({entry:release},f.host,f.check,f.verify),{result:'verified'});
  assert.deepEqual(f.log,['open','read','lease','lease','remove','read']);
  const unrelated=fixture([{...owned(),manual:false}]);
  assert.deepEqual(await runJob({entry:release},unrelated.host,unrelated.check,unrelated.verify),{result:'review',reason:'unknown_result'});
  assert.ok(!unrelated.log.includes('remove'));
});
test('service session failure occurs before writes and mismatched URLs are rejected without navigation',async()=>{
  const f=fixture();
  f.host.openHost=()=>{throw new ReviewRequired('login_required');};
  await assert.rejects(runJob({entry:draft},f.host,f.check,f.verify),/login_required/);
  assert.deepEqual(f.log,[]);
  assert.throws(()=>validatedEntry({...draft,host_url:'https://partner.spacecloud.kr/reservation-calendar?product=110429&space=67179'}));
});
