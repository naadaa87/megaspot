import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/js/pages/admin-revenue-services.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function report(overrides={}) {
  return {ok:true,total:{received:215041,refunded:7521,net:207520},detailCount:2,page:1,pageSize:50,
    items:[{movement_id:'entry:1',event_date:'2026-11-20',recorded_day:'2026-11-18',branch:'megaspot-gundae',title:'<예약 & 청소>',booking_code:'BK-ONE',ref:'BK-ONE',source:'manual',kind:'receipt',amount:215041,original_amount:1000000,channel:'bank_corporate',account:'<블랭크>',allocation_basis:'견적 비례 배분',components:[{id:'cleaning',amount:215041}]},
      {movement_id:'refund:2',event_date:'2026-11-20',recorded_day:'2026-11-19',branch:'megaspot-gundae',title:'환불',booking_code:'BK-ONE',ref:'ORDER-ONE',source:'online',kind:'refund',amount:7521,original_amount:30000,channel:'payapp',account:'지유공간',allocation_basis:'직접 분류',components:[{id:'cleaning',amount:7521}]}],...overrides};
}
function ui(api) {
  const nodes=new Map();
  function node(id) {
    if(nodes.has(id))return nodes.get(id);
    const attrs=new Map(),listeners={};
    const n={id,innerHTML:'',textContent:'',hidden:false,disabled:false,open:false,isConnected:true,scrollTop:0,
      listeners,addEventListener:(event,fn)=>listeners[event]=fn,
      setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key),removeAttribute:key=>attrs.delete(key),
      showModal(){n.open=true;},close(){n.open=false;listeners.close?.();},focus(){n.focused=true;},
      appendChild(child){n.child=child;},querySelector(selector){const childId=selector.slice(1);assert.ok(n.innerHTML.includes('id="'+childId+'"'),childId);return node(childId);}};
    nodes.set(id,n);return n;
  }
  const opener=node('opener'),view=node('view-revenue');let dialog;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const X={A:api,esc,guard:()=>false};
  vm.runInNewContext(source,{window:{MEGASPOT_ADMIN:X},document:{activeElement:opener,getElementById:id=>id==='view-revenue'?view:null,
    createElement(tag){assert.equal(tag,'dialog');dialog=node('dialog');return dialog;}},URLSearchParams});
  return {node,dialog,opener,open:options=>X.openRevenueServices(options)};
}
const options={from:'2026-11-01',to:'2026-11-30',space:'megaspot-gundae',channel:'bank_corporate',category:'addons',component:'cleaning'};

test('서비스 내역은 별도 조회 조건으로 열리고 항목 배분액·환불·원거래·채널과 안전한 문자를 표시한다',async()=>{
  const calls=[];const f=ui(async path=>{calls.push(path);return report();});
  const input={...options,day:'2026-11-05',page:9};const before=JSON.stringify(input);
  assert.equal(f.open(input),true);await tick();
  assert.equal(f.dialog.open,true);assert.equal(JSON.stringify(input),before,'호출자의 조회 조건을 바꾸지 않는다');
  const q=new URL(calls[0],'https://local.test').searchParams;
  for(const [key,value] of Object.entries(options))assert.equal(q.get(key),value);
  assert.equal(q.has('day'),false);assert.equal(q.get('page'),'1');
  assert.equal(f.node('revenue-services-title').textContent,'청소지원 수납·환불 내역');
  assert.match(f.node('revenue-services-total').innerHTML,/215,041원/);
  assert.match(f.node('revenue-services-total').innerHTML,/7,521원/);
  assert.match(f.node('revenue-services-total').innerHTML,/207,520원/);
  const list=f.node('revenue-services-list').innerHTML;
  assert.match(list,/&lt;예약 &amp; 청소&gt;/);assert.match(list,/&lt;블랭크&gt;/);
  assert.match(list,/-7,521원/);assert.match(list,/원거래 1,000,000원 중 선택한 항목/);
  assert.match(list,/견적 비례 배분/);assert.match(list,/법인계좌/);
  assert.match(f.node('revenue-services-status').textContent,/거래 2건/);
  f.dialog.close();assert.equal(f.opener.focused,true);
});

test('항목 변경·닫기 후 늦은 응답을 무시하고 오류는 재시도로 복구한다',async()=>{
  const pending=[];const f=ui(path=>new Promise((resolve,reject)=>pending.push({path,resolve,reject})));
  f.open(options);f.open({...options,component:'manager'});
  pending[1].resolve(report({items:[]}));await tick();
  const current=f.node('revenue-services-list').innerHTML;
  pending[0].resolve(report());await tick();assert.equal(f.node('revenue-services-list').innerHTML,current);
  assert.equal(f.node('revenue-services-title').textContent,'현장 매니저 수납·환불 내역');
  f.open(options);pending[2].reject(Error('일시적인 서비스 조회 오류'));await tick();
  assert.equal(f.node('revenue-services-retry').hidden,false);
  f.node('revenue-services-retry').listeners.click();pending[3].resolve(report());await tick();
  assert.equal(f.node('revenue-services-retry').hidden,true);
  f.open(options);f.dialog.close();pending[4].resolve(report());await tick();
  assert.equal(f.dialog.open,false);assert.equal(f.node('revenue-services-list').innerHTML,'');
  assert.equal(f.node('revenue-services-list').getAttribute('aria-busy'),undefined);
});

test('서비스 페이지를 넘겨도 전체 합계를 유지하며 페이지 수와 입력 검증을 갱신한다',async()=>{
  const calls=[];let shrink=false;
  const f=ui(async path=>{
    calls.push(path);const page=Number(new URL(path,'https://local.test').searchParams.get('page'));
    return report({detailCount:shrink?1:51,page,items:page===2&&!shrink?report().items.slice(1):report().items});
  });
  f.open(options);await tick();assert.equal(f.node('revenue-services-pagination').hidden,false);
  const totals=f.node('revenue-services-total').innerHTML;
  f.node('revenue-services-next').listeners.click();await tick();
  assert.equal(f.node('revenue-services-total').innerHTML,totals);assert.equal(f.node('revenue-services-page').textContent,'2 / 2');
  assert.equal(new URL(calls.at(-1),'https://local.test').searchParams.get('page'),'2');
  shrink=true;f.node('revenue-services-prev').listeners.click();await tick();
  assert.equal(f.node('revenue-services-pagination').hidden,true);assert.equal(f.node('revenue-services-page').textContent,'1 / 1');
  assert.equal(f.open({...options,category:'invalid'}),false);
});
