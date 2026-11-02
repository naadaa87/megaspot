import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function fixture(){
 let cat=null,ck=null,unknown=false;
 const state=new Map();
 const M={esc:s=>String(s??'').replaceAll('<','&lt;')};
 const ctx={window:{MEGASPOT:M,MEGASPOT_CATERING_CALC:{read:()=>cat,quote:c=>c,parts:c=>c.summary},MEGASPOT_COCKTAIL_CALC:{read:()=>ck}},URLSearchParams,location:{search:''},sessionStorage:{getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)},Date};
 vm.runInNewContext(readFileSync(new URL('../assets/js/event-plan.js',import.meta.url),'utf8'),ctx);
 return {plan:M.eventPlan,root:{querySelector:s=>s.includes('event_date_unknown')?unknown:null},food(c,k){cat=c;ck=k;},unknown(){unknown=true;}};
}
test('행사 소계는 대관·뷔페를 합산하고 반환 보증금을 제외한다',()=>{
 const f=fixture();f.food({summary:'클래식 60명',total:2750000});const q=f.plan.quote(f.root,{total:500000,deposit:150000,people:60});
 assert.equal(q.total,3250000);assert.equal(q.incomplete,false);assert.match(q.text,/반환 보증금 150,000원 별도/);
});
test('칵테일 표시 가격은 더하되 미확정 비용이 있음을 명시한다',()=>{
 const f=fixture();f.food(null,{cups:200,price:1100000});const q=f.plan.quote(f.root,{total:500000,deposit:150000,people:60});assert.equal(q.total,1600000);assert.equal(q.incomplete,true);assert.match(q.html,/현재 계산 가능한 소계/);
});
test('행사일 미정 답사에서는 예시 날짜의 공간료를 소계에 더하지 않는다',()=>{
 const f=fixture();f.unknown();const q=f.plan.quote(f.root,{total:500000,deposit:150000,people:60});assert.equal(q.total,0);assert.equal(q.unknownDate,true);assert.match(q.html,/상담 후 안내/);
});
test('공간을 바꿀 때 최신 시간·인원·옵션이 URL의 초기값보다 우선한다',()=>{
 const f=fixture();f.plan.keep({state:{date:'2026-12-20',start:18,end:23,people:80,opt:{cleaning:true}},form:{},fields:{}});const q=f.plan.initial({start:'13',end:'17'},'megaspot-gundae-2');assert.equal(q.start,18);assert.equal(q.end,23);assert.equal(q.people,80);assert.equal(q.opt.cleaning,true);
});
