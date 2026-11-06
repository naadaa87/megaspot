import test from 'node:test';
import assert from 'node:assert/strict';
import view from '../assets/js/pages/parking-receipt.js';
const base={oid:'MSCAR1',payment_oid:'MSBATCH',plate:'123가4567',visit_date:'2026-11-06',ticket:'2h',ticket_label:'2시간권',price:8000,payment_status:'paid',status:'waiting',refunded_amount:0};
const batch=items=>({batch:true,payment:{oid:'MSBATCH',price:items.reduce((s,p)=>s+p.price,0),status:'paid'},items,accepting_arrivals:true});
test('차량별 입차 대기·등록 대기·등록 중·완료·문제를 분리한다',()=>{
 for(const [status,label,tone] of [['waiting','입차 대기','waiting'],['requested','등록 대기','waiting'],['processing','등록 중','progress'],['applied','등록 완료','success'],['issue','확인 필요','attention']]){
  const s=view.state({...base,status});assert.equal(s.label,label);assert.equal(s.tone,tone);
 }
});
test('결제 미확정·환불·취소 검토를 적용 완료로 잘못 표시하지 않는다',()=>{
 for(const extra of [{payment_status:'created'},{payment_status:'pending'},{payment_status:'refunded'},{payment_status:'failed'},{refund_hold:true},{refunded_amount:1000},{refund_requested_at:'2026-11-06 01:00:00'}]){
  const p={...base,status:'applied',...extra};assert.notEqual(view.state(p).key,'applied');assert.ok(!view.render(batch([p])).includes('pk-tone-success'));
 }
});
test('여러 차량은 총액과 상태별 대수를 요약하고 주문번호·조건은 접어 둔다',()=>{
 const r=batch([{...base,status:'applied',price:4000},{...base,oid:'MSCAR2',plate:'234나5678',status:'requested'}]);
 const html=view.render(r,{today:'2026-11-06'});assert.ok(html.includes('12,000원'));assert.ok(html.includes('등록 완료 1대'));assert.ok(html.includes('등록 대기 1대'));assert.ok(html.includes('123가4567'));assert.ok(html.includes('234나5678'));assert.ok(html.includes('data-detail-key="MSCAR1:detail"'));assert.ok(!html.includes(' open>'));assert.equal((html.match(/class="pk-receipt-guidance"/g)||[]).length,1);
});
test('입차 요청은 정상 결제·미등록·당일 운영시간인 차량만 활성화한다',()=>{
 const render=p=>view.render(batch([p]),{today:'2026-11-06'});
 assert.match(render(base),/data-action="arrive">/);
 assert.match(view.render({...batch([base]),accepting_arrivals:false},{today:'2026-11-06'}),/data-action="arrive" disabled/);
 assert.match(view.render(batch([base]),{today:'2026-11-07'}),/data-action="arrive" disabled/);
 for(const extra of [{status:'requested'},{status:'processing'},{status:'applied'},{status:'issue'},{payment_status:'pending'},{refund_hold:true},{refund_requested_at:'now'}])assert.ok(!render({...base,...extra}).includes('data-action="arrive"'));
});
test('단일 차량 구매 링크·일일권 상세·취소 문의를 유지하고 외부 입력은 이스케이프한다',()=>{
 const p={...base,plate:'<img src=x onerror=alert(1)>',daily_terms:'<b>조건</b>',applied_at:'2026-11-06 04:00:00'},html=view.render({order:p,accepting_arrivals:true},{today:'2026-11-06',expanded:new Set(['MSCAR1:detail'])});
 assert.ok(html.includes('8,000원'));assert.ok(html.includes('1대'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;b&gt;조건'));assert.ok(html.includes('data-detail-key="MSCAR1:detail" open>'));assert.ok(html.includes('data-action="cancel"'));assert.ok(html.includes('data-reason'));
});
test('완료 후에는 등록 새로고침을 멈추되 취소 검토·등록 대기는 계속 갱신한다',()=>{
 assert.equal(view.needsRefresh({...base,status:'applied'}),false);assert.equal(view.needsRefresh({...base,status:'applied',refund_hold:true}),true);assert.equal(view.needsRefresh(base),true);assert.equal(view.needsRefresh({...base,payment_status:'refunded'}),false);
});
