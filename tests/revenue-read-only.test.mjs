import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {onRequest as middleware} from '../functions/api/_middleware.js';

function setup(t) {
  const f=fixture({booking:true,date:'2026-11-20'});
  t.after(()=>f.db.close());
  const id=f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','readonly-check','receipt',120000,'2026-11-18 01:00:00')").run().lastInsertRowid;
  return {...f,id:'entry:'+id};
}
async function call(f,path,method='GET',body) {
  const jobs=[],request=new Request('https://local.test/api/admin/'+path,{method,headers:{'x-admin-key':f.env.ADMIN_KEY,origin:'https://local.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const response=await middleware({env:f.env,request,next:()=>f.handle(request),waitUntil:job=>jobs.push(job)});
  await Promise.allSettled(jobs);
  return {response,jobs};
}

test('매출과 연간 추이 조회는 기존 알림 발송 작업을 시작하지 않는다',async t=>{
  const f=setup(t);
  for(const query of ['from=2026-11-01&to=2026-11-30','from=2026-01-01&to=2026-12-31']) {
    const {response,jobs}=await call(f,'revenue?'+query);
    assert.equal(response.status,200);
    assert.equal((await response.json()).total.net,120000);
    assert.equal(jobs.length,0);
  }
});

test('매출 분류 조회와 저장은 원거래 및 알림 작업에 영향을 주지 않는다',async t=>{
  const f=setup(t),before=f.db.prepare('SELECT * FROM booking_payment_entries').all();
  let result=await call(f,'revenue/classifications?movement_id='+f.id);
  assert.equal(result.response.status,200);assert.equal(result.jobs.length,0);
  result=await call(f,'revenue/classifications','PUT',{movement_id:f.id,expected_version:0,channel:'bank_corporate',account:'블랭크',components:[{id:'rental',amount:120000}]});
  assert.equal(result.response.status,200);assert.equal(result.jobs.length,0);
  assert.equal((await result.response.json()).metadata.account,'블랭크');
  assert.deepEqual(f.db.prepare('SELECT * FROM booking_payment_entries').all(),before);
});
