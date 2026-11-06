import test from 'node:test';
import assert from 'node:assert/strict';
import {auditBatch} from '../deploy/amano-server/audit-next-batch.mjs';
function fixture(){
 const at=Date.parse('2026-11-06T12:00:00+09:00');
 const batch={oid:'MSBATCH',price:12000,items:[1,2].map((hours,i)=>({oid:'MSCAR'+i,entry_id:'E'+i,plate_last4:'456'+i,visit_date:'2026-11-06',ticket:hours+'h',hours,price:hours*4000,status:'applied',free_hours:1,free_external:0,paid_hours:hours-1,cost:(hours-1)*3000,customer_notifications:[{kind:'paid',status:'sms_delivered'},{kind:'applied',status:'delivered'}],admin_payment_sms:['1886','9580'].map(receiver_last4=>({receiver_last4,status:'delivered'}))}))};
 const operations=Object.fromEntries(batch.items.map(p=>[p.oid,{verification:{entry_id:p.entry_id,date:p.visit_date,free_confirmed:true,free_first_verified:true,free_existing:false,history_ids:['F'+p.oid],site_status:'applied',cost:p.cost,steps:[{phase:'verified_1'},...(p.paid_hours?[{phase:'request_6'}]:[])]}}]));
 return {batch,operations,at,audit:()=>auditBatch(batch,operations,{},at)};
}
test('주문 없음·아직 입차 전은 실제 검증 성공으로 표시하지 않는다',()=>{assert.equal(auditBatch(null).status,'no_order');const f=fixture();Object.assign(f.batch.items[0],{status:'waiting'});assert.equal(f.audit().status,'waiting');});
test('차량별 증빙·차감·고객 전달·관리자 두 번호를 모두 대조한 경우에만 검증 완료',()=>{const f=fixture();assert.equal(f.audit().status,'verified');for(const mutate of [p=>p.cost=1,p=>p.entry_id='OTHER',p=>p.paid_hours=2,p=>p.customer_notifications.pop(),p=>p.admin_payment_sms.pop()]){const g=fixture();mutate(g.batch.items[0]);assert.notEqual(g.audit().status,'verified');}});
test('무료 우선 증빙 플래그만 믿지 않고 실제 순서·기존 무료 이력도 확인한다',()=>{const f=fixture();f.operations.MSCAR1.verification.steps.reverse();assert.equal(f.audit().status,'attention');const g=fixture(),p=g.batch.items[1],proof=g.operations[p.oid].verification;Object.assign(p,{free_hours:0,free_external:1,paid_hours:2,cost:6000});Object.assign(proof,{free_existing:true,cost:6000,steps:[{phase:'request_7'}]});assert.equal(g.audit().status,'verified');p.free_external=0;assert.equal(g.audit().status,'attention');});
test('등록 오류 시 두 관리자 오류 문자 전달을 각각 구분하고 성공으로 표시하지 않는다',()=>{const f=fixture();f.batch.items[1].status='issue';const r=f.audit();assert.equal(r.status,'attention');assert.ok(r.problems.some(x=>x.includes('1886')));assert.ok(r.problems.some(x=>x.includes('9580')));});
