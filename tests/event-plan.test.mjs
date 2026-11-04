import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import RC from '../assets/js/reception-calc.js';
import { readFileSync } from 'node:fs';
function fixture(){
 let cat=null,ck=null,unknown=false,rec=null;
 const state=new Map();
 const M={esc:s=>String(s??'').replaceAll('<','&lt;')};
 const ctx={window:{MEGASPOT:M,MEGASPOT_RECEPTION_CALC:RC,MEGASPOT_CATERING_CALC:{read:()=>cat,quote:c=>c,parts:c=>c.summary},MEGASPOT_COCKTAIL_CALC:{read:()=>ck,names:{mojito:'모히토',blue_sapphire:'블루 사파이어'}}},URLSearchParams,location:{search:''},sessionStorage:{getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)},Date};
 vm.runInNewContext(readFileSync(new URL('../assets/js/event-plan.js',import.meta.url),'utf8'),ctx);
 return {plan:M.eventPlan,root:{querySelector:s=>{if(s.includes('event_date_unknown'))return unknown;const name=s.match(/name="([^"]+)"/);return rec&&name?rec[name[1]]||null:null;}},food(c,k){cat=c;ck=k;},unknown(){unknown=true;},reception(format,people=50,course='classic'){rec={reception_on:{checked:true},reception_course:{value:course},reception_format:{value:format},reception_people:{value:String(people)}};}};
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
test('칵테일 페이지에서 돌아와도 케이터링과 답사 선택을 유지한다',()=>{
 const f=fixture();const previous={reception_on:['1'],reception_course:'classic',reception_format:'box',rv_visit_on:['1'],rv_visit_date:'2026-11-06',cocktail_on:[]};
 const incoming={reception_on:[],reception_course:'all',rv_visit_on:[],cocktail_on:['1'],cocktail_cups:'200'};
 const merged=f.plan.mergeFields(previous,incoming,new URLSearchParams('cocktail=200'));
 assert.deepEqual(merged.reception_on,['1']);assert.equal(merged.reception_course,'classic');assert.equal(merged.reception_format,'box');assert.deepEqual(merged.rv_visit_on,['1']);assert.equal(merged.rv_visit_date,'2026-11-06');assert.equal(merged.cocktail_cups,'200');
});
test('뷔페만 새로 고르면 다른 서비스 선택을 덮어쓰지 않는다',()=>{
 const f=fixture();const merged=f.plan.mergeFields({rv_cat_course:'basic',cocktail_on:['1'],cocktail_cups:'300'},{rv_cat_course:'classic',cocktail_on:[],cocktail_cups:'100'},new URLSearchParams('catering=classic'));
 assert.equal(merged.rv_cat_course,'classic');assert.deepEqual(merged.cocktail_on,['1']);assert.equal(merged.cocktail_cups,'300');
});
test('통합 식음료 UI를 쓰는 모든 페이지는 칵테일 계산기를 먼저 불러온다',()=>{
 const pages=['index.html','guide/index.html','inquiry/index.html','spaces/megaspot-gundae/index.html','spaces/megaspot-gundae/pricing/index.html','spaces/megaspot-gundae-2/index.html','spaces/megaspot-gundae-2/pricing/index.html'];
 for(const page of pages){const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');const cocktail=html.indexOf('/assets/js/cocktail-calc.js?');const plan=html.indexOf('/assets/js/event-plan.js?');const pricing=html.indexOf('/assets/js/pricing-ui.js?');assert.ok(cocktail>=0&&cocktail<plan&&plan<pricing,page);}
});

test('통합 견적 소계와 접수 요약이 선택한 케이터링 방식별 출장·세팅비를 사용한다',()=>{
 for(const [format,fee] of [['lunchbox',100000],['box',100000],['table',200000]]){
  const f=fixture();f.reception(format);
  const rec=f.plan.reception(f.root,50);
  assert.equal(rec.total,1750000+fee+Math.round((1750000+fee)/10));assert.match(rec.note,/부가세 10%/);
  assert(rec.summary.includes(RC.won(fee)));
  assert(rec.summary.includes(RC.won(rec.total)));
  const q=f.plan.quote(f.root,{total:500000,deposit:150000,people:50});
  assert.equal(q.total,500000+rec.total);
  assert(q.text.includes(RC.won(rec.total)));
 }
 const f=fixture();f.reception('');
 assert.equal(f.plan.reception(f.root,50).total,null);
 assert.match(f.plan.reception(f.root,50).note,/제공 방식/);
 assert.equal(f.plan.quote(f.root,{total:500000,deposit:150000,people:50}).total,500000);
});

test('통합 견적과 견적서 요약에 칵테일 메뉴·논알코올·추가 요청이 포함된다',()=>{
 const f=fixture();f.food(null,{cups:200,price:1100000,menus:['mojito','blue_sapphire'],nonalcohol:true,note:'민트 적게'});
 const q=f.plan.quote(f.root,{total:500000,deposit:150000,people:60});
 for(const detail of ['모히토, 블루 사파이어','논알코올 구성 상담','민트 적게']){assert.ok(q.text.includes(detail));assert.ok(q.html.includes(detail));}
});


test('고객 통합 견적은 네 코스 모두 선택한 단가·인원·방식으로 계산해 문의 요약에 남긴다',()=>{
 for(const course of RC.data.courses)for(const format of ['table','box','lunchbox'])for(const people of [50,51,100,101,300]){
  const f=fixture();f.reception(format,people,course.id);const rec=f.plan.reception(f.root,people),expected=RC.quote(people,format,course.id);
  assert.equal(rec.total,expected.total);assert(rec.label.includes(course.name));assert(rec.summary.includes(RC.won(expected.total)));assert(rec.summary.includes(RC.won(expected.unitPrice)));
  assert.equal(f.plan.quote(f.root,{total:500000,deposit:150000,people}).total,500000+expected.total);
 }
 for(const course of RC.data.courses){const f=fixture();f.reception('table',301,course.id);const rec=f.plan.reception(f.root,301);assert.equal(rec.total,null);assert(rec.summary.includes(course.name));assert.match(rec.summary,/301명.*별도 견적/);}
 const f=fixture();f.reception('table',50,'all');assert.equal(f.plan.reception(f.root,50).total,null);
});

test('부가세 별도 칵테일은 세액을 포함한 합계를 대관 소계에 한 번만 더한다',()=>{
 const f=fixture();f.food(null,{cups:100,price:900000,vat:90000,total:990000,vat_excluded:true});
 const q=f.plan.quote(f.root,{total:500000,deposit:150000,people:60});
 assert.equal(q.total,1490000);assert.match(q.html,/900,000원.*90,000원/);
});


test('최대 인원으로 비교한 뒤 공간을 바꾸면 원래 요청 인원을 복구한다',()=>{
 const f=fixture();f.plan.saveSpace({people:200,requestedPeople:300,opt:{}},'megaspot-gundae');
 f.plan.keep({state:{people:200,requestedPeople:300,opt:{}},form:{},fields:{}});
 const next=f.plan.initial({people:'300'},'megaspot-gundae-2');assert.equal(next.people,300);assert.equal(next.requestedPeople,300);
});
test('다른 페이지에서 새 인원을 지정하면 과거의 초과 인원 요청보다 우선한다',()=>{
 const f=fixture();f.plan.saveSpace({people:200,requestedPeople:300,opt:{}},'megaspot-gundae');
 const next=f.plan.initial({people:'80'},'megaspot-gundae-2');assert.equal(next.people,'80');assert.equal(next.requestedPeople,'80');
});


test('식음료가 선택된 통합 견적은 상담 결제 대상으로 구분한다',()=>{
 const f=fixture();assert.equal(f.plan.quote(f.root,{total:500000,deposit:150000,people:30}).hasFood,false);
 f.food({summary:'뷔페 상담',total:0});assert.equal(f.plan.quote(f.root,{total:500000,deposit:150000,people:30}).hasFood,true);
 f.food(null,{cups:100,price:900000});assert.equal(f.plan.quote(f.root,{total:500000,deposit:150000,people:30}).hasFood,true);
 f.food(null,null);f.reception('',30,'all');assert.equal(f.plan.quote(f.root,{total:500000,deposit:150000,people:30}).hasFood,true);
});
