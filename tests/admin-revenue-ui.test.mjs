import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/pages/admin-revenue.js',import.meta.url),'utf8');
const html = readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const first = 'megaspot-gundae', second = 'megaspot-gundae-2';
const tick = () => new Promise(resolve=>setImmediate(resolve));
const total = amount => ({count:amount?1:0,received:amount,refunded:0,net:amount});
function report(amount=120000) {
  const booking={bookingCount:1,booked:amount*2,received:amount+10000,refunded:10000,netReceived:amount,balance:amount,balanceCount:1,amountUnknownCount:0,balanceUnknownCount:0,excessPaid:0,excessPaidCount:0,reviewRequiredCount:0,overRefunded:0};
  return {
    bookingSummary:{...booking,scope:{from:'2026-11-01',to:'2026-11-30'},monthly:[{month:'2026-11',...booking}]},
    total:total(amount),branches:{[first]:total(amount),[second]:total(0),unassigned:total(0)},
    daily:[{day:'2026-11-20',...total(amount),branches:{[first]:total(amount)}}],
    upcoming:[{branch:second,day:'2026-11-21',customer_name:'<고객>',booking_code:'BK-NEXT',amount:null}],
    items:[{movement_id:'entry:1',branch:first,event_date:'2026-11-20',recorded_day:'2026-11-18',source:'manual',kind:'receipt',
      title:'이용료 수납·환불',booking_code:'BK-PAID',ref:'BK-PAID',amount,original_amount:amount,
      channel:'bank_corporate',account:'지유공간개발',components:[{id:'rental',amount}],allocation_basis:'직접 분류'}],
    categories:[{id:'rental',label:'대관',...total(amount)}],
    components:[{id:'rental',label:'공간 대관료',category:'rental',...total(amount)}],
    channels:[{id:'bank_corporate',label:'법인계좌',...total(amount),accounts:[{account:'지유공간개발',...total(amount)}]}],
    monthly:[{month:'2026-11',...total(amount)}],
    detailCount:1,page:1,pageSize:50
  };
}
function ui(api) {
  const nodes = new Map(),views = {},events = {};
  function node(id) {
    if(nodes.has(id)) return nodes.get(id);
    assert.ok(id==='detail-heading'||html.includes('id="'+id+'"'),'매출 화면에 필요한 요소: '+id);
    const attributes = new Map(),listeners = {};
    const value = {id,innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',listeners,
      addEventListener:(event,callback)=>{listeners[event]=callback;},
      setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key),
      removeAttribute:key=>attributes.delete(key),focus(){value.focused=true;},
      querySelector:selector=>selector==='h2'?node('detail-heading'):selector.startsWith('#')?node(selector.slice(1)):null};
    nodes.set(id,value);
    return value;
  }
  const form = node('revenue-form');
  form.elements = {space:node('revenue-space'),from:node('revenue-from'),to:node('revenue-to'),
    channel:node('revenue-channel'),category:node('revenue-category'),component:node('revenue-component')};
  class FormData {
    constructor(form) { this.values=Object.entries(form.elements).map(([name,input])=>[name,input.value]); }
    [Symbol.iterator]() { return this.values[Symbol.iterator](); }
  }
  const esc = value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const context = vm.createContext({document:{getElementById:node},URLSearchParams,FormData,Date,
    window:{MEGASPOT_ADMIN:{A:api,esc,guard:()=>false,register:(id,fn)=>views[id]=fn},
      addEventListener:(name,fn)=>events[name]=fn}});
  vm.runInContext(source,context);
  return {node,form,open:()=>views.revenue(),submit:()=>form.listeners.submit({preventDefault(){}}),events};
}

test('매출 첫 진입에서 합계·지점별 예정 예약·거래를 오류 없이 표시한다',async()=>{
  const calls = [];
  const f = ui(async path=>{calls.push(path);return report();});
  f.open();
  await tick();
  assert.equal(calls.length,2,'선택 기간과 연간 추이를 각각 조회한다');
  assert.equal(f.node('revenue-report').hidden,false);
  assert.equal(f.node('revenue-report').getAttribute('aria-busy'),undefined);
  assert.match(f.node('revenue-totals').innerHTML,/전체 합계/);
  assert.match(f.node('revenue-totals').innerHTML,/120,000원/);
  assert.match(f.node('revenue-totals').innerHTML,/class="adm-card revenue-total"/);
  assert.match(f.node('revenue-upcoming-items').innerHTML,/건대 2호점 · 1건/);
  assert.match(f.node('revenue-upcoming-items').innerHTML,/&lt;고객&gt;/);
  assert.match(f.node('revenue-upcoming-items').innerHTML,/금액 미정/);
  assert.match(f.node('revenue-items').innerHTML,/data-settlement-code="BK-PAID"/);
  assert.match(f.node('revenue-items').innerHTML,/data-revenue-classify="entry:1"/);
  assert.match(f.node('revenue-categories').innerHTML,/공간대관/);
  assert.match(f.node('revenue-channel-shares').innerHTML,/지유공간개발/);
  assert.match(f.node('revenue-trend').innerHTML,/월별 예약금액·수납·잔금 비교/);
  assert.match(f.node('revenue-status').textContent,/이용일 기준 · 보증금 제외/);
});

test('월별 막대 3종은 예약 요약과 같은 금액을 사용하고 Y축 금액 눈금 대신 각 막대 금액을 표시한다',async()=>{
  const calls=[];
  const f=ui(async path=>{calls.push(path);return report();});
  f.form.elements.from.value='2026-11-01';f.form.elements.to.value='2026-11-30';
  f.node('revenue-trend-year').value='2026';
  f.form.elements.space.value=second;
  f.form.elements.category.value='food';f.form.elements.component.value='catering';f.form.elements.channel.value='payapp';
  f.open();await tick();
  const annual=new URL(calls.find(path=>path.includes('to=2026-12-31')),'https://local.test').searchParams;
  assert.equal(annual.get('space'),second);
  for(const key of ['category','component','channel','day','page'])assert.equal(annual.has(key),false);
  const graph=f.node('revenue-trend').innerHTML;
  assert.equal((graph.match(/class="revenue-trend-bar"/g)||[]).length,36);
  assert.equal((graph.match(/class="revenue-bar-amount"/g)||[]).length,36);
  assert.equal((graph.match(/data-revenue-month=/g)||[]).length,12);
  assert.match(graph,/data-series="booked" data-value="240000"/);
  assert.match(graph,/data-series="netReceived" data-value="120000"/);
  assert.match(graph,/data-series="balance" data-value="120000"/);
  assert.match(graph,/>24만<\/text>/);
  assert.match(graph,/>12만<\/text>/);
  assert.doesNotMatch(graph,/text-anchor="end"|월별 순매출/);
  assert.match(graph,/<th[^>]*>전체 예약금액<\/th>/);
  assert.match(graph,/<th[^>]*>수납 완료 금액<\/th>/);
  assert.match(graph,/<th[^>]*>앞으로 받을 잔금<\/th>/);
  assert.match(graph,/240,000원/);
});

test('월별 미정·잔금 확인 금액을 0원으로 확정하지 않고 환불 후 음수 수납액을 유지한다',async()=>{
  const r=report();
  const unknown={...r.bookingSummary.monthly[0],booked:0,balance:0,amountUnknownCount:1,balanceUnknownCount:1,netReceived:-1000,received:0,refunded:1000,reviewRequiredCount:1,overRefunded:1000};
  r.bookingSummary.monthly=[unknown];
  const f=ui(async()=>r);
  f.form.elements.from.value='2026-11-01';f.form.elements.to.value='2026-11-30';f.node('revenue-trend-year').value='2026';
  f.open();await tick();
  const graph=f.node('revenue-trend').innerHTML;
  assert.match(graph,/data-series="netReceived" data-value="-1000"/);
  assert.match(graph,/>미정<\/text>/);
  assert.match(graph,/>확인 필요<\/text>/);
  assert.match(graph,/>-1,000원<\/text>/);
  assert.match(graph,/금액 미정 1건/);
  assert.match(graph,/초과 환불 1,000원/);
});

test('지점 조건을 바꾸는 동안 이전 응답이 도착해도 최신 지점의 매출을 유지한다',async()=>{
  const pending = [];
  const f = ui(path=>new Promise(resolve=>pending.push({path,resolve})));
  f.open();
  f.form.elements.space.value = second;
  f.submit();
  assert.equal(new URL(pending[3].path,'https://local.test').searchParams.get('space'),second);
  pending[3].resolve(report(250000));
  pending[2].resolve(report(250000));
  await tick();
  const rendered = f.node('revenue-totals').innerHTML;
  assert.match(rendered,/건대 2호점/);
  assert.doesNotMatch(rendered,/전체 합계|건대 1호점/);
  assert.match(rendered,/250,000원/);
  const trend=f.node('revenue-trend').innerHTML;
  pending[0].resolve(report(120000));
  pending[1].resolve(report(120000));
  await tick();
  assert.equal(f.node('revenue-totals').innerHTML,rendered);
  assert.equal(f.node('revenue-trend').innerHTML,trend);
  assert.equal(f.node('revenue-report').hidden,false);
});

test('조회 실패는 오류를 표시하고 이후 새로 조회하면 화면을 복구한다',async()=>{
  let fail = true;
  const f = ui(async()=>{if(fail)throw Error('일시적인 조회 오류');return report();});
  f.open();
  await tick();
  assert.equal(f.node('revenue-report').hidden,true);
  assert.equal(f.node('revenue-status').textContent,'일시적인 조회 오류');
  assert.equal(f.node('revenue-report').getAttribute('aria-busy'),undefined);
  fail = false;
  f.submit();
  await tick();
  assert.equal(f.node('revenue-report').hidden,false);
  assert.match(f.node('revenue-items').innerHTML,/BK-PAID/);
});
