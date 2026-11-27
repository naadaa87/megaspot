import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/pages/order.js',import.meta.url),'utf8');
const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function result(overrides={}){
 const nodes=new Map(),calls=[];const $=selector=>{if(selector==='#od-app')return null;if(!nodes.has(selector))nodes.set(selector,{hidden:false,textContent:'',innerHTML:'',insertAdjacentHTML(_,s){this.innerHTML+=s;}});return nodes.get(selector);};
 const order={oid:'MS-CUSTOM',product_id:'payment-link',title:'출장뷔페 예약금',price:300000,status:'paid',lines:[{label:'출장뷔페 예약금',amount:300000}],buyer_name:'결*',buyer_phone:'010-****-1234',pay_method:'PayApp:1',refunded_amount:0,payment_link:{service:'catering',purpose:'deposit'},...overrides};
 const M={$,$$:()=>[],esc,api:async path=>{calls.push(path);return {ok:true,order};}};
 vm.runInNewContext(source,{window:{MEGASPOT:M},location:{search:'?oid=MS-CUSTOM'},URLSearchParams,URL,setTimeout:()=>{},Date});await flush();return {$,calls,order};
}
test('전용 청구 결제 완료는 목적을 표시하고 옵션구매·예약자동확정 안내를 사용하지 않는다',async()=>{
 const f=await result();assert.equal(f.$('#oc-title').textContent,'예약금 결제가 완료되었습니다');assert.match(f.$('#oc-sub').textContent,/담당자 안내/);
 assert.match(f.$('#oc-card').innerHTML,/출장뷔페 · 예약금/);assert.doesNotMatch(f.$('#oc-sub').textContent,/옵션 구매|예약이 확정/);assert.doesNotMatch(f.$('#oc-card').innerHTML,/다른 상품 보기|\/order\/\?product=/);
 assert.deepEqual(f.calls,['/pay/orders/MS-CUSTOM']);
});
test('custom 실패·취소·진행중에서는 카탈로그 상품 재결제를 유도하지 않는다',async()=>{
 for(const status of ['failed','cancelled','created','pending']){
  const f=await result({status});assert.doesNotMatch(f.$('#oc-card').innerHTML,/다시 결제하기|\/order\/\?product=/);assert.match(f.$('#oc-card').innerHTML,/상태 다시 확인/);assert.match(f.$('#oc-card').innerHTML,/카카오톡 문의/);
 }
});
test('custom 부분·전체 환불과 담당자 확인 예약을 결제 결과와 구분해 표시한다',async()=>{
 const partial=await result({refunded_amount:100000,booking_code:'BK-TEST',booking_status:'payment_review'});assert.equal(partial.$('#oc-title').textContent,'부분 환불이 반영되었습니다');assert.match(partial.$('#oc-card').innerHTML,/100,000원/);assert.match(partial.$('#oc-card').innerHTML,/BK-TEST/);assert.match(partial.$('#oc-sub').textContent,/담당자 안내/);
 const refunded=await result({status:'refunded',refunded_amount:300000});assert.equal(refunded.$('#oc-title').textContent,'환불이 확인되었습니다');assert.match(refunded.$('#oc-card').innerHTML,/환불 금액/);
});
test('청구 제목·항목을 HTML로 실행하지 않고 기존 상품 완료 화면은 유지한다',async()=>{
 const malicious=await result({title:'<img src=x onerror=alert(1)>',lines:[{label:'<script>alert(1)</script>',amount:300000}]});assert.doesNotMatch(malicious.$('#oc-card').innerHTML,/<img|<script/);assert.match(malicious.$('#oc-card').innerHTML,/&lt;img/);
 const legacy=await result({payment_link:null,product_id:'addon-cleaning',title:'청소'});assert.match(legacy.$('#oc-sub').textContent,/옵션 구매가 완료/);assert.match(legacy.$('#oc-card').innerHTML,/다른 상품 보기/);
});
