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
function ui(api,{storedMode=null,blockedStorage=false,profitLoader=false,chartWidth=0}={}) {
  const nodes = new Map(),views = {},events = {},serviceCalls=[],profitCalls=[];
  const storage=new Map(storedMode==null?[]:[['megaspot.admin.revenue.chart-view.v1',storedMode]]);
  function node(id) {
    if(nodes.has(id)) return nodes.get(id);
    assert.ok(id==='detail-heading'||html.includes('id="'+id+'"'),'매출 화면에 필요한 요소: '+id);
    const attributes = new Map(),listeners = {};
    const value = {id,innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',listeners,open:false,isConnected:true,
      addEventListener:(event,callback)=>{listeners[event]=callback;},
      setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key),
      removeAttribute:key=>attributes.delete(key),focus(){value.focused=true;},
      showModal(){value.open=true;},close(){value.open=false;listeners.close?.();},
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
  node('revenue-trend').clientWidth=chartWidth;
  const esc = value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const context = vm.createContext({document:{getElementById:node},URLSearchParams,FormData,Date,
    window:{MEGASPOT_ADMIN:{A:api,esc,guard:()=>false,register:(id,fn)=>views[id]=fn,openRevenueServices:options=>serviceCalls.push(options),...(profitLoader?{loadRevenueProfit:(scope,options)=>profitCalls.push({scope,options})}:{})},
      localStorage:{getItem:key=>{if(blockedStorage)throw Error('storage blocked');return storage.get(key);},setItem:(key,value)=>{if(blockedStorage)throw Error('storage blocked');storage.set(key,value);}},
      addEventListener:(name,fn)=>events[name]=fn}});
  vm.runInContext(source,context);
  return {node,form,open:()=>views.revenue(),submit:()=>form.listeners.submit({preventDefault(){}}),events,storage,serviceCalls,profitCalls,
    detail:code=>{const button={dataset:{revenueBookingDetail:code},isConnected:true,focus(){button.focused=true;}};node('revenue-booking-list').listeners.click({target:{closest:()=>button}});return button;},
    mode:id=>node('revenue-mode-'+id).listeners.click({}),
    bookings:metric=>{const button={dataset:{revenueBookingMetric:metric},isConnected:true,focus(){button.focused=true;}};node('revenue-booking-cards').listeners.click({target:{closest:()=>button}});return button;}};
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

function bookingList(metric='booked',overrides={}) {
  const summary=report().bookingSummary;
  return {ok:true,metric,summary,total:{count:1,amount:metric==='booked'?240000:120000,unknownCount:0},
    items:[{booking_code:'BK-LIST',customer_name:'<고객 & 단체>',date:'2026-11-20',space_id:first,status:'confirmed',start_h:9.5,end_h:18,
      amount:240000,received:130000,refunded:10000,netReceived:120000,balance:120000,review_required:false,excessPaid:0,overRefunded:0}],
    detailCount:1,page:1,pageSize:50,...overrides};
}

test('요약 카드 클릭은 기간·지점만 적용한 예약 목록을 열고 이름·예약별 금액을 안전하게 표시한다',async()=>{
  const calls=[];
  const f=ui(async path=>{calls.push(path);return path.startsWith('/revenue/bookings?')?bookingList(new URL(path,'https://local.test').searchParams.get('metric')):report();});
  f.form.elements.from.value='2026-11-01';f.form.elements.to.value='2026-11-30';f.node('revenue-trend-year').value='2026';
  f.form.elements.channel.value='payapp';f.form.elements.category.value='food';f.form.elements.component.value='catering';
  f.open();await tick();
  for(const metric of ['booked','received','balance'])assert.match(f.node('revenue-booking-cards').innerHTML,new RegExp('data-revenue-booking-metric="'+metric+'"'));
  const opener=f.bookings('received');await tick();
  assert.equal(f.node('revenue-booking-dialog').open,true);
  const query=new URL(calls.at(-1),'https://local.test').searchParams;
  assert.equal(query.get('metric'),'received');assert.equal(query.get('from'),'2026-11-01');assert.equal(query.get('to'),'2026-11-30');
  for(const key of ['channel','category','component','day'])assert.equal(query.has(key),false);
  assert.match(f.node('revenue-booking-list').innerHTML,/&lt;고객 &amp; 단체&gt;/);
  assert.match(f.node('revenue-booking-list').innerHTML,/09:30 ~ 18:00/);
  assert.match(f.node('revenue-booking-list-total').textContent,/1건 · 수납 완료 금액 120,000원/);
  assert.match(f.node('revenue-booking-list-note').textContent,/일부 수납/);
  f.node('revenue-booking-list-close').listeners.click();assert.equal(f.node('revenue-booking-dialog').open,false);assert.equal(opener.focused,true);
});

test('예약 목록의 늦은 응답·닫힌 창의 응답을 무시하며 조회 오류는 재시도로 복구한다',async()=>{
  const pending=[];
  const f=ui(path=>path.startsWith('/revenue/bookings?')?new Promise((resolve,reject)=>pending.push({resolve,reject})):Promise.resolve(report()));
  f.open();await tick();f.bookings('booked');f.bookings('balance');
  pending[1].resolve(bookingList('balance'));await tick();const latest=f.node('revenue-booking-list').innerHTML;
  pending[0].resolve(bookingList('booked',{items:[]}));await tick();assert.equal(f.node('revenue-booking-list').innerHTML,latest);
  f.bookings('received');pending[2].reject(Error('목록 조회 오류'));await tick();
  assert.equal(f.node('revenue-booking-list-status').textContent,'목록 조회 오류');assert.equal(f.node('revenue-booking-list-retry').hidden,false);
  f.node('revenue-booking-list-retry').listeners.click();pending[3].resolve(bookingList('received'));await tick();
  assert.equal(f.node('revenue-booking-list-status').textContent,'');assert.equal(f.node('revenue-booking-list-retry').hidden,true);
  f.bookings('booked');f.node('revenue-booking-dialog').close();pending[4].resolve(bookingList('booked',{items:[]}));await tick();
  assert.equal(f.node('revenue-booking-dialog').open,false);assert.equal(f.node('revenue-booking-list').innerHTML,'');
});

function bookingDetail() {
  const row=bookingList().items[0];
  return {ok:true,booking:{...row,phone:'01012345678',phone2:'',headcount:30,inquiry_ref:'MS-ONE',memo:'<예약 메모>'},
    settlement:{...row},inquiry:{ref:'MS-ONE',org:'검증 단체',email:'qa@example.test',purpose:'행사',options:['청소지원'],needs:[],estimate:'저장한 계산',message:'<문의 내용>',memo:'메모'},
    quote:{quote_no:'Q-ONE',created_at:'2026-11-01',total:240000,discount:0,lines:[{label:'공간대관',amount:200000}],extras:[{label:'청소지원',amount:40000}]},services:[]};
}

test('예약 상세를 조회하고 목록으로 돌아오면 원래 목록·페이지·스크롤과 초점을 복원한다',async()=>{
  const calls=[];
  const f=ui(async path=>{calls.push(path);return path.startsWith('/revenue/bookings/BK-LIST?')?bookingDetail():path.startsWith('/revenue/bookings?')?bookingList():report();});
  f.open();await tick();f.bookings('booked');await tick();
  const list=f.node('revenue-booking-list').innerHTML;f.node('revenue-booking-dialog').scrollTop=321;
  const row=f.detail('BK-LIST');await tick();
  assert.match(calls.at(-1),/^\/revenue\/bookings\/BK-LIST\?/);
  assert.equal(f.node('revenue-booking-list-pane').hidden,true);assert.equal(f.node('revenue-booking-detail-pane').hidden,false);
  assert.match(f.node('revenue-booking-detail-body').innerHTML,/01012345678|&lt;예약 메모&gt;/);
  assert.match(f.node('revenue-booking-detail-body').innerHTML,/Q-ONE|240,000원|40,000원/);
  assert.doesNotMatch(f.node('revenue-booking-detail-body').innerHTML,/<예약 메모>|<문의 내용>/);
  const requests=calls.length;f.node('revenue-booking-detail-back').listeners.click();
  assert.equal(calls.length,requests,'돌아갈 때 목록을 새로 조회하지 않는다');
  assert.equal(f.node('revenue-booking-list').innerHTML,list);assert.equal(f.node('revenue-booking-dialog').scrollTop,321);
  assert.equal(f.node('revenue-booking-list-pane').hidden,false);assert.equal(f.node('revenue-booking-detail-pane').hidden,true);assert.equal(row.focused,true);
});

test('상세 오류는 재시도로 복구하고 목록으로 돌아간 뒤의 늦은 상세 응답은 무시한다',async()=>{
  const pending=[];
  const f=ui(path=>path.startsWith('/revenue/bookings/BK-LIST?')?new Promise((resolve,reject)=>pending.push({resolve,reject})):Promise.resolve(path.startsWith('/revenue/bookings?')?bookingList():report()));
  f.open();await tick();f.bookings('booked');await tick();f.detail('BK-LIST');
  pending[0].reject(Error('상세 조회 오류'));await tick();assert.equal(f.node('revenue-booking-detail-retry').hidden,false);
  f.node('revenue-booking-detail-retry').listeners.click();pending[1].resolve(bookingDetail());await tick();assert.equal(f.node('revenue-booking-detail-status').textContent,'');
  f.node('revenue-booking-detail-back').listeners.click();f.detail('BK-LIST');
  let cancelled=false;f.node('revenue-booking-dialog').listeners.cancel({preventDefault(){cancelled=true;}});
  assert.equal(cancelled,true);assert.equal(f.node('revenue-booking-dialog').open,true);assert.equal(f.node('revenue-booking-list-pane').hidden,false);
  pending[2].resolve(bookingDetail());await tick();assert.equal(f.node('revenue-booking-detail-body').innerHTML,'');
});

test('서비스 카드와 세부 항목은 현재 페이지 조건을 바꾸지 않고 내역 모달을 요청한다',async()=>{
  const f=ui(async()=>report());f.open();await tick();
  const before=f.node('revenue-totals').innerHTML,graph=f.node('revenue-trend').innerHTML;
  f.form.elements.category.value='food';f.form.elements.component.value='catering';
  const snapshot=JSON.stringify(Object.entries(f.form.elements).map(([id,node])=>[id,node.value]));
  f.node('revenue-categories').listeners.click({target:{closest:()=>({dataset:{revenueCategory:'addons'}})}});
  f.node('revenue-components').listeners.click({target:{closest:()=>({dataset:{category:'addons',revenueComponent:'cleaning'}})}});
  assert.equal(f.serviceCalls.length,2);assert.equal(f.serviceCalls[0].category,'addons');assert.equal(f.serviceCalls[0].component,'');assert.equal(f.serviceCalls[1].component,'cleaning');
  assert.equal(JSON.stringify(Object.entries(f.form.elements).map(([id,node])=>[id,node.value])),snapshot);
  assert.equal(f.node('revenue-totals').innerHTML,before);assert.equal(f.node('revenue-trend').innerHTML,graph);
});

test('원가·이익 분석은 표시된 예약 요약의 기간·지점만 사용하고 수납 필터를 넘기지 않는다',async()=>{
  const r=report();r.bookingSummary.scope={from:'2026-11-01',to:'2026-11-30',space:second};
  const f=ui(async()=>r,{profitLoader:true});
  f.form.elements.from.value='2026-11-01';f.form.elements.to.value='2026-11-30';f.node('revenue-trend-year').value='2026';
  f.form.elements.channel.value='payapp';f.form.elements.category.value='food';f.form.elements.component.value='catering';
  f.open();await tick();
  const call=f.profitCalls[0];
  assert.equal(JSON.stringify(call.scope),JSON.stringify({from:'2026-11-01',to:'2026-11-30',space:second}));
  assert.equal(call.options.force,true);
  f.node('revenue-daily').listeners.click({target:{closest:()=>({dataset:{revenueDay:'2026-11-20'}})}});await tick();
  assert.equal(f.profitCalls.at(-1).options.force,false,'명세 날짜 변경은 원가 분석 범위를 줄이지 않는다');
  assert.equal(JSON.stringify(f.profitCalls.at(-1).scope),JSON.stringify(call.scope));
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
  assert.equal((graph.match(/<svg /g)||[]).length,1,'기본 보기에서는 하나의 그래프에 1~12월을 배치한다');
  for(let month=1;month<=12;month++)assert.ok(graph.includes('data-revenue-month="2026-'+String(month).padStart(2,'0')+'"'));
  assert.doesNotMatch(graph,/revenue-trend-scroll|좌우로 이동|data-chart-center/);
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

test('모바일은 하나의 12개월 그래프와 회전하지 않은 월별 금액 표를 함께 표시한다',async()=>{
  const f=ui(async()=>report(),{chartWidth:280});
  f.form.elements.from.value='2026-11-01';f.form.elements.to.value='2026-11-30';f.node('revenue-trend-year').value='2026';
  f.open();await tick();const graph=f.node('revenue-trend').innerHTML;
  assert.equal((graph.match(/<svg /g)||[]).length,1);
  assert.equal((graph.match(/data-revenue-month=/g)||[]).length,12);
  assert.equal((graph.match(/class="revenue-trend-bar"/g)||[]).length,36);
  assert.equal((graph.match(/<td class="revenue-bar-amount"/g)||[]).length,36);
  assert.match(graph,/class="revenue-chart-month-values"/);
  assert.match(graph,/>24만<\/td>/);
  assert.match(graph,/title="전체 예약금액 240,000원"/);
  assert.doesNotMatch(graph,/rotate\(|revenue-trend-scroll/);
  assert.match(f.node('revenue-components').innerHTML,/data-label="수납액"/);
  assert.match(f.node('revenue-components').innerHTML,/class="revenue-cell-label" aria-hidden="true"/);
  assert.match(f.node('revenue-components').innerHTML,/class="revenue-cell-value"/);
});

test('그래프 보기를 즉시 바꾸고 선택한 보기를 조회와 새 진입에서도 유지한다',async()=>{
  let calls=0;
  const f=ui(async()=>{calls++;return report();});f.open();await tick();
  assert.equal(f.node('revenue-trend').getAttribute('data-mode'),'single');
  assert.equal(f.node('revenue-mode-single').getAttribute('aria-pressed'),'true');
  const before=calls;
  f.mode('grid');
  assert.equal(calls,before,'보기 변경은 다시 API를 조회하지 않는다');
  assert.equal(f.node('revenue-trend').getAttribute('data-mode'),'grid');
  assert.equal(f.node('revenue-mode-grid').getAttribute('aria-pressed'),'true');
  assert.equal(f.node('revenue-mode-single').getAttribute('aria-pressed'),'false');
  assert.equal((f.node('revenue-trend').innerHTML.match(/<button type="button" class="revenue-trend-month"/g)||[]).length,12);
  const key='megaspot.admin.revenue.chart-view.v1';assert.equal(f.storage.get(key),'grid');
  f.form.elements.space.value=second;f.submit();await tick();
  assert.equal(f.node('revenue-trend').getAttribute('data-mode'),'grid');
  const reopened=ui(async()=>report(),{storedMode:f.storage.get(key)});reopened.open();await tick();
  assert.equal(reopened.node('revenue-trend').getAttribute('data-mode'),'grid');
  reopened.mode('single');
  assert.equal((reopened.node('revenue-trend').innerHTML.match(/<svg /g)||[]).length,1);
  assert.equal(reopened.storage.get(key),'single');
  const blocked=ui(async()=>report(),{blockedStorage:true});blocked.open();await tick();blocked.mode('grid');
  assert.equal(blocked.node('revenue-trend').getAttribute('data-mode'),'grid','저장소를 쓸 수 없어도 보기 변경은 동작한다');
});

test('연간 조회 실패나 잘못된 연도 후 보기 전환으로 이전 그래프가 다시 나타나지 않는다',async()=>{
  let fail=false;
  const f=ui(async path=>{if(fail&&new URL(path,'https://local.test').searchParams.get('to')==='2026-12-31')throw Error('연간 조회 오류');return report();});
  f.form.elements.from.value='2026-11-01';f.form.elements.to.value='2026-11-30';f.node('revenue-trend-year').value='2026';
  f.open();await tick();assert.match(f.node('revenue-trend').innerHTML,/revenue-trend-bar/);
  fail=true;f.submit();await tick();
  assert.equal(f.node('revenue-trend').innerHTML,'');f.mode('grid');
  assert.equal(f.node('revenue-trend').innerHTML,'');
  assert.equal(f.node('revenue-trend-status').textContent,'연간 조회 오류');
  fail=false;f.submit();await tick();assert.match(f.node('revenue-trend').innerHTML,/revenue-trend-bar/);
  f.node('revenue-trend-year').value='1900';f.node('revenue-trend-year').listeners.change();
  f.mode('single');assert.equal(f.node('revenue-trend').innerHTML,'');
  assert.equal(f.node('revenue-trend').getAttribute('aria-busy'),undefined);
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
