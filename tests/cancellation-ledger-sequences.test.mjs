import test from 'node:test';
import assert from 'node:assert/strict';
import {ledgerScenario,repeatedLedgerSteps} from './helpers/cancellation-ledger-scenario.mjs';

test('한 예약의 38단계 수수료 증감·수납·환불·정정·취소·복원을 각 화면·문서와 독립 원장으로 대조',async t=>{
 const s=await ledgerScenario();t.after(()=>s.close());for(let i=0;i<repeatedLedgerSteps.length;i++){await s.apply(repeatedLedgerSteps[i]);await s.check({quote:i%5===0||i===repeatedLedgerSteps.length-1});if(i%6===0)await s.replay();}
 assert.deepEqual(s.totals(),{received:1450000,refunded:1350000,net:100000,balance:200000,refund_due:0,status:'cancellation_receivable'});
});
for(const seed of [17,271,20261104])test('반복 조합 80단계 · 고정 난수 '+seed+' · 원본 보존·재전송·문서 합계',async t=>{
 const s=await ledgerScenario();t.after(()=>s.close());let n=seed,count=0;const random=max=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n%max;};await s.apply({type:'fee',amount:200000});
 for(let i=0;i<80;i++){
  const mode=random(5),keys=[...s.entries.keys()].filter(k=>k!=='base');let op;
  if(mode===0)op={type:'fee',amount:random(61)*10000};
  else if(mode===1||!keys.length){const net=s.totals().net,refund=net>0&&random(2)===0;op={type:'entry',key:'generated'+(++count),kind:refund?'refund':'receipt',amount:refund?Math.min(net,(random(10)+1)*10000):(random(10)+1)*10000};}
  else{const key=keys[random(keys.length)],e=s.entries.get(key);op=mode===2&&e.active?{type:'void',key}:{type:'edit',key,kind:e.kind,amount:(random(12)+1)*10000};}
  await s.apply(op);await s.check({quote:i%16===0||i===79});if(i%11===0)await s.replay();
 }
});
test('수수료·수납을 여러 번 되돌려 같은 금액이 되어도 이전 편집·문서 발급은 재사용 불가',async t=>{
 const s=await ledgerScenario();t.after(()=>s.close());await s.apply({type:'fee',amount:200000});const before=await s.cancellation();await s.apply({type:'fee',amount:300000});await s.apply({type:'fee',amount:200000});await s.f.api('bookings/BK-TEST/cancellation/document','POST',{expected_revision:before.settlement.revision,expected_version:before.version},409);await s.check({quote:true});
});
