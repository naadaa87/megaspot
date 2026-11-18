import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/js/pages/admin-revenue-profit.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const scope={from:'2026-11-01',to:'2026-11-30',space:'megaspot-gundae'};
function report(overrides={}) {
  return {ok:true,scope,policy:{label:'현재 운영 마진 기준 예상이익',vatBasis:'included',vatLabel:'부가세 포함 금액 기준',bartenderTreatment:'retained',bartenderLabel:'출장·제조 청구액 전액 마진 · 원가 0원',scopeNote:'현재 기준을 저장된 단가와 수량에 적용한 예상치입니다.',rules:[{kind:'catering',label:'출장뷔페',description:'1인 마진 10,000원 + 세팅 마진 100,000원'},{kind:'reception',label:'실속',description:'실속 A·B·C 마진 30%'}],cocktailTable:[{cups:100,sale_price:1200000,vendor_supply:800000,bartender_fee:200000,margin:400000}]},
    summary:{bookingCount:2,contractAmount:300000,amountUnknownCount:0,completeBookingCount:1,unknownBookingCount:1,knownContractAmount:100000,knownServiceCost:110000,knownProfit:-10000,totalCost:null,totalProfit:null,coverage:0.5},
    services:[{kind:'other',label:'기타·확인 필요',knownSale:100000,knownCost:110000,knownProfit:-10000,unknownCount:1}],
    items:[{booking_code:'BK-LOSS',customer_name:'<고객 & 손실>',date:'2026-11-20',space_id:'megaspot-gundae',status:'confirmed',contractAmount:100000,serviceCost:110000,profit:-10000,complete:true,reasons:[],lines:[{kind:'other',label:'직접 입력',sale:100000,cost:110000,profit:-10000,basis:'저장 원가',quantity:1,reasons:[]}]},
      {booking_code:'BK-UNKNOWN',customer_name:'원가 미확인',date:'2026-11-21',space_id:'megaspot-gundae',status:'completed',contractAmount:200000,serviceCost:null,profit:null,complete:false,reasons:[{code:'unknown',message:'매니저 원가 <확인>'}],lines:[{kind:'other',label:'현장 매니저',sale:200000,cost:null,profit:null,basis:'원가 미입력',quantity:null,reasons:[{code:'unknown',message:'매니저 원가 <확인>'}]}]}],
    monthly:[],detailCount:2,page:1,pageSize:50,...overrides};
}
function ui(api,initialScope=null) {
  const nodes=new Map();
  function node(id) {
    if(nodes.has(id))return nodes.get(id);
    const attrs=new Map(),listeners={};
    const n={id,innerHTML:'',textContent:'',hidden:false,disabled:false,listeners,
      addEventListener:(event,fn)=>listeners[event]=fn,setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key),removeAttribute:key=>attrs.delete(key),
      querySelector(selector){const childId=selector.slice(1);assert.ok(n.innerHTML.includes('id="'+childId+'"'),childId);return node(childId);}};
    nodes.set(id,n);return n;
  }
  const panel=node('revenue-profit-panel'),esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const X={A:api,esc,guard:()=>false,revenueProfitScope:initialScope};
  vm.runInNewContext(source,{window:{MEGASPOT_ADMIN:X},document:{getElementById:id=>id==='revenue-profit-panel'?panel:null},URLSearchParams,Date});
  return {node,panel,load:(...args)=>X.loadRevenueProfit(...args)};
}

test('원가 미확인을 0원으로 확정하지 않고 계산 완료 예약의 손실과 정책을 별도 표시한다',async()=>{
  const calls=[];const f=ui(async path=>{calls.push(path);return report();});
  const input={...scope,category:'food',channel:'payapp',component:'catering',day:'2026-11-21'};
  const before=JSON.stringify(input);await f.load(input);
  assert.equal(JSON.stringify(input),before);
  const q=new URL(calls[0],'https://local.test').searchParams;
  for(const [key,value] of Object.entries(scope))assert.equal(q.get(key),value);
  for(const key of ['category','channel','component','day'])assert.equal(q.has(key),false);
  const metrics=f.node('revenue-profit-metrics').innerHTML;
  assert.match(metrics,/분석 매출/);assert.match(metrics,/300,000원/);
  assert.equal((metrics.match(/>확인 필요<\/strong>/g)||[]).length,2);
  assert.match(metrics,/계산 완료 1건의 원가 합계 110,000원/);
  assert.match(metrics,/계산 완료 1건의 이익 합계 -10,000원/);
  assert.match(f.node('revenue-profit-coverage').innerHTML,/계산 완료 1 \/ 2건 · 50%/);
  const list=f.node('revenue-profit-list').innerHTML;
  assert.match(list,/&lt;고객 &amp; 손실&gt;/);assert.match(list,/매니저 원가 &lt;확인&gt;/);
  assert.match(list,/class="revenue-profit-negative">-10,000원/);
  assert.match(list,/원가 미입력/);assert.match(list,/>확인 필요<\/dd>/);
  const policy=f.node('revenue-profit-policy').innerHTML;
  assert.match(policy,/부가세 포함 금액 기준/);assert.match(policy,/원가 0원/);
  assert.match(policy,/부가세 별도 금액/);assert.match(policy,/800,000원/);assert.match(policy,/마진 30%/);
  assert.match(f.panel.innerHTML,/임대료·관리비·결제수수료/);
});

test('매출 요약보다 모듈이 늦게 로드되어도 확정된 조회 범위로 원가 분석을 시작한다',async()=>{
  const calls=[];const initial={...scope,space:'megaspot-gundae-2',category:'food'};
  const f=ui(async path=>{calls.push(path);return report();},initial);await tick();
  assert.equal(calls.length,1);
  const q=new URL(calls[0],'https://local.test').searchParams;
  assert.equal(q.get('from'),scope.from);assert.equal(q.get('to'),scope.to);assert.equal(q.get('space'),'megaspot-gundae-2');assert.equal(q.has('category'),false);
  assert.match(f.node('revenue-profit-scope').textContent,/건대 2호점/);
  assert.match(f.node('revenue-profit-metrics').innerHTML,/300,000원/);
});

test('계산이 완료된 전체 예상 손실은 음수 그대로 표시하고 같은 범위는 중복 조회하지 않는다',async()=>{
  let calls=0;const all=report();all.summary={...all.summary,bookingCount:1,contractAmount:100000,completeBookingCount:1,unknownBookingCount:0,totalCost:110000,totalProfit:-10000,coverage:1};all.items=all.items.slice(0,1);all.detailCount=1;
  const f=ui(async()=>{calls++;return all;});await f.load(scope);
  assert.match(f.node('revenue-profit-metrics').innerHTML,/class="revenue-profit-negative">-10,000원/);
  await f.load({...scope,category:'parking'});assert.equal(calls,1,'수납 분석 조건만 바뀌면 원가를 다시 좁히지 않는다');
  await f.load(scope,{force:true});assert.equal(calls,2);
  assert.doesNotMatch(f.node('revenue-profit-coverage').innerHTML,/보류/);
});

test('이전 범위의 늦은 응답과 오류가 최신 원가 요약을 덮지 않으며 재시도로 복구한다',async()=>{
  const pending=[];const f=ui(path=>new Promise((resolve,reject)=>pending.push({path,resolve,reject})));
  const first=f.load(scope),duplicate=f.load({...scope,channel:'payapp'});assert.equal(first,duplicate,'같은 범위의 진행 중 조회를 합친다');
  const second=f.load({...scope,space:'megaspot-gundae-2'});
  const latest=report();latest.summary={...latest.summary,contractAmount:222222};pending[1].resolve(latest);await second;
  const html=f.node('revenue-profit-metrics').innerHTML;assert.match(html,/222,222원/);
  pending[0].resolve(report());await first;assert.equal(f.node('revenue-profit-metrics').innerHTML,html);
  const failed=f.load({...scope,space:'megaspot-gundae-2'},{force:true});pending[2].reject(Error('원가 조회 오류'));await failed;
  assert.equal(f.node('revenue-profit-retry').hidden,false);assert.equal(f.node('revenue-profit-metrics').innerHTML,'');
  f.node('revenue-profit-retry').listeners.click();pending[3].resolve(latest);await tick();
  assert.equal(f.node('revenue-profit-retry').hidden,true);assert.match(f.node('revenue-profit-metrics').innerHTML,/222,222원/);
  assert.equal(f.panel.getAttribute('aria-busy'),undefined);
});

test('예약별 페이지 이동과 마지막 페이지 보정 중에도 전체 원가·이익 합계를 유지한다',async()=>{
  const calls=[];let shrink=false;
  const f=ui(async path=>{calls.push(path);const page=Number(new URL(path,'https://local.test').searchParams.get('page'));return report({page,detailCount:shrink?2:51});});
  await f.load(scope);const total=f.node('revenue-profit-metrics').innerHTML;
  f.node('revenue-profit-next').listeners.click();await tick();assert.equal(f.node('revenue-profit-page').textContent,'2 / 2');
  assert.equal(f.node('revenue-profit-metrics').innerHTML,total);
  shrink=true;f.node('revenue-profit-reload').listeners.click();await tick();await tick();
  assert.equal(f.node('revenue-profit-page').textContent,'1 / 1');assert.equal(f.node('revenue-profit-pagination').hidden,true);
  assert.deepEqual(calls.slice(-2).map(path=>new URL(path,'https://local.test').searchParams.get('page')),['2','1']);
});
