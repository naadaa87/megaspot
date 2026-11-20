import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture, DAY, NEXT} from './helpers/admin-fixture.mjs';
import {spacecloudSegments} from '../functions/api/_spacecloud_blocks.js';

test('external reservation dates use whole hours and split precisely at midnight', () => {
  assert.deepEqual(spacecloudSegments('2026-12-31',22,26),[
    {date:'2026-12-31',start:22,end:24},{date:'2027-01-01',start:0,end:2},
  ]);
  assert.deepEqual(spacecloudSegments(DAY,24,27),[{date:NEXT,start:0,end:3}]);
  assert.deepEqual(spacecloudSegments(DAY,21,24),[{date:DAY,start:21,end:24}]);
  for (const bad of [[null,24],[18,18],[19.5,24],[25,24],[22,49]]) assert.deepEqual(spacecloudSegments(DAY,...bad),[]);
});
test('confirmed bookings map to their own sale products and exclude marketplace bookings and customer data',async t=>{
  const f=fixture({booking:true,space:'megaspot-gundae-2'}); t.after(()=>f.db.close());
  f.db.prepare('UPDATE bookings SET start_h=22,end_h=26 WHERE booking_code=?').run('BK-TEST');
  let result=await f.api('spacecloud-blocks');
  assert.equal(result.items.length,6);
  assert.deepEqual([...new Set(result.items.map(x=>x.product))].sort(),[110429,110782,110785]);
  assert.deepEqual([...new Set(result.items.map(x=>x.date))],[DAY,NEXT]);
  assert.ok(result.items.every(x=>x.action==='block' && x.host_url.includes('space=67179')));
  assert.equal(new Set(result.items.map(x=>x.marker)).size,6);
  assert.doesNotMatch(JSON.stringify(result),/검증 고객|1234-5678|amount|phone/);
  f.db.prepare('UPDATE inquiries SET data=json_set(data,\'$.channel\',\'spacecloud\') WHERE ref=?').run('MS-TEST');
  result=await f.api('spacecloud-blocks');
  assert.deepEqual(result.items,[]);
});
test('linked blocks persist through reload, rescheduling keeps old holds until replacement, then cancelled bookings show release',async t=>{
  const f=fixture({booking:true}); t.after(()=>f.db.close());
  let result=await f.api('spacecloud-blocks');
  const original=result.items[0];
  assert.equal(original.product,140188);
  const record=action=>f.api('spacecloud-blocks','POST',{id:original.id,action});
  await record('block'); await record('block');
  assert.equal((await f.api('spacecloud-blocks')).items[0].action,'linked');
  assert.equal(f.db.prepare("SELECT count(*) n FROM event_log WHERE kind='spacecloud.blocked'").get().n,1);
  f.db.prepare('UPDATE bookings SET start_h=11,end_h=19 WHERE booking_code=?').run('BK-TEST');
  result=await f.api('spacecloud-blocks');
  assert.equal(result.items.find(x=>x.id===original.id).action,'hold');
  await f.api('spacecloud-blocks','POST',{id:original.id,action:'release'},409);
  const newBlock=result.items.find(x=>x.action==='block');
  await f.api('spacecloud-blocks','POST',{id:newBlock.id,action:'block'});
  assert.equal((await f.api('spacecloud-blocks')).items.find(x=>x.id===original.id).action,'release');
  await record('release');
  f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code=?").run('BK-TEST');
  result=await f.api('spacecloud-blocks');
  assert.deepEqual(result.items.map(x=>[x.id,x.action]),[[newBlock.id,'release']]);
});
test('missing times show a review row and keep any old block held without assuming an all-day closure',async t=>{
  const f=fixture({booking:true}); t.after(()=>f.db.close());
  const id=(await f.api('spacecloud-blocks')).items[0].id;
  await f.api('spacecloud-blocks','POST',{id,action:'block'});
  f.db.prepare('UPDATE bookings SET start_h=NULL,end_h=NULL WHERE booking_code=?').run('BK-TEST');
  assert.equal((await f.api('spacecloud-blocks')).items[0].action,'linked');
  f.db.prepare("UPDATE inquiries SET data=json_remove(data,'$.start_h','$.end_h') WHERE ref=?").run('MS-TEST');
  const result=await f.api('spacecloud-blocks');
  assert.equal(result.items[0].action,'hold');
  assert.deepEqual(result.review.map(x=>x.code),['BK-TEST']);
});
