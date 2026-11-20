import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,DAY} from './helpers/admin-fixture.mjs';
import {onRequest} from '../functions/api/internal/spacecloud-auto.js';

const secret='local-verification-token-with-32-characters';
function setup(t) {
  const f=fixture({booking:true,space:'megaspot-gundae-2'});
  f.env.SPACECLOUD_WORKER_TOKEN=secret;
  t.after(()=>f.db.close());
  const call=async (body,status=200,token=secret)=>{
    const response=await onRequest({env:f.env,request:new Request('https://local.test/api/internal/spacecloud-auto',{
      method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify(body)
    })});
    const value=await response.json();
    assert.equal(response.status,status,JSON.stringify(value));
    return value;
  };
  const claim=async()=>(await call({action:'claim'})).job;
  const work=(job,action,extra={})=>({action,id:job.entry.id,token:job.token,...extra});
  const finish=(job,extra={result:'verified'})=>call(work(job,'complete',extra));
  return {...f,call,claim,work,finish};
}
test('worker has scoped authentication and reports only its working status',async t=>{
  const f=setup(t);
  await f.call({action:'claim'},401,'wrong-token');
  await f.call({action:'status',phase:'ready'});
  const admin=await f.api('spacecloud-blocks');
  assert.deepEqual(admin.automation,{configured:true,login_available:false,status:'ready'});
  assert.equal(admin.items.length,3);
  assert.doesNotMatch(JSON.stringify(admin),new RegExp(secret));
});
test('concurrent runs lease only one product and keep the prior administrator ledger intact',async t=>{
  const f=setup(t);
  const leases=(await Promise.all([f.claim(),f.claim(),f.claim()])).filter(Boolean);
  assert.equal(leases.length,1);
  const first=leases[0];
  assert.equal(first.entry.date,DAY);
  assert.doesNotMatch(JSON.stringify(first),/1234-5678|검증 고객|amount/);
  assert.equal((await f.api('spacecloud-blocks')).items.find(x=>x.id===first.entry.id).automatic_processing,true);
  await f.api('spacecloud-blocks','POST',{id:first.entry.id,action:'block'},409);
  await f.call(f.work(first,'check'));
  await f.finish(first);
  await f.call(f.work(first,'complete',{result:'verified'}),409);
  await f.finish(await f.claim()); await f.finish(await f.claim());
  assert.equal(await f.claim(),null);
  assert.equal((await f.api('spacecloud-blocks')).items.filter(x=>x.action==='linked').length,3);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM event_log WHERE kind='spacecloud.blocked'").get().n,3);
});
test('a booking edit invalidates a pre-write check and queues the new slot before releasing prior holds',async t=>{
  const f=setup(t);
  const first=await f.claim();
  await f.finish(first); await f.finish(await f.claim()); await f.finish(await f.claim());
  f.db.prepare("UPDATE bookings SET start_h=18,end_h=23 WHERE booking_code='BK-TEST'").run();
  const replacing=await f.claim();
  assert.equal(replacing.entry.action,'block');
  assert.equal(replacing.entry.start,18);
  f.db.prepare("UPDATE bookings SET start_h=19,end_h=24 WHERE booking_code='BK-TEST'").run();
  await f.call(f.work(replacing,'check'),409);
  await f.call(f.work(replacing,'defer'));
  for(let i=0;i<3;i++){
    const job=await f.claim();
    assert.equal(job.entry.action,'block');
    assert.equal(job.entry.start,19);
    await f.finish(job);
  }
  const release=await f.claim();
  assert.equal(release.entry.action,'release');
  assert.equal(release.entry.start,10);
  await f.finish(release);
  f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-TEST'").run();
  let remaining=0;
  for(let job=await f.claim();job;job=await f.claim()){
    assert.equal(job.entry.action,'release');
    await f.finish(job);remaining++;
  }
  assert.equal(remaining,5);
});
test('uncertain or expired writes remain visible for operator review without automatic duplicate creation',async t=>{
  const f=setup(t);
  const job=await f.claim();
  f.db.prepare("UPDATE settings SET value=json_set(value,'$.expires',0) WHERE key='spacecloud_auto:lease'").run();
  const next=await f.claim();
  assert.notEqual(next.entry.id,job.entry.id);
  await f.finish(next,{result:'review',reason:'conflict'});
  await f.finish(await f.claim());
  assert.equal(await f.claim(),null);
  const list=(await f.api('spacecloud-blocks')).items;
  assert.equal(list.find(x=>x.id===job.entry.id).automation_review,'unknown_result');
  assert.equal(list.find(x=>x.id===next.entry.id).automation_review,'conflict');
  await f.api('spacecloud-blocks','POST',{id:job.entry.id,action:'cover'});
  assert.equal((await f.api('spacecloud-blocks')).items.find(x=>x.id===job.entry.id).action,'covered');
});
