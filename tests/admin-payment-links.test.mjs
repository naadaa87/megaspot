import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/js/pages/admin-payment-links.js',import.meta.url),'utf8');
const context=vm.createContext({module:{exports:{}},URL});
vm.runInContext(source,context);
const {clean,createFlow,safeUrl,preview,kstLabel}=context.module.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const input=extra=>({service:'rental',purpose:'deposit',title:'  대관비 예약금  ',description:'  행사 준비·공간 사용  ',amount:'300000',event_date:'2026-12-20',space_id:'megaspot-gundae',headcount:'50',start_h:'10',end_h:'17',booking_code:' bk-test ',expires_on:'2026-12-04',...extra});
const normalize=value=>clean(value,'2026-11-27','2027-02-25');

test('작성 값은 금액·선택 이용 정보·예약 연결을 정리하고 예약금 구분을 유지한다',()=>{
  const result=normalize(input());assert.equal(result.ok,true);
  assert.deepEqual(plain(result.body),{service:'rental',purpose:'deposit',title:'대관비 예약금',description:'행사 준비·공간 사용',amount:300000,event_date:'2026-12-20',space_id:'megaspot-gundae',headcount:50,start_h:10,end_h:17,booking_code:'BK-TEST',expires_on:'2026-12-04'});
  const optional=normalize(input({service:'catering',purpose:'balance',event_date:'',space_id:'',headcount:'',start_h:'',end_h:'',booking_code:''}));
  assert.equal(optional.ok,true);for(const key of ['event_date','space_id','headcount','start_h','end_h','booking_code'])assert.equal(Object.hasOwn(optional.body,key),false);
  assert.equal(normalize(input({amount:100000000,start_h:'0',end_h:'0.5'})).ok,true);
});

test('잘못된 금액·필드·만료일은 저장 전 해당 항목 오류로 차단한다',()=>{
  const invalid=[
    [{amount:999},'amount'],[{amount:100000001},'amount'],[{amount:1000.5},'amount'],[{amount:'invalid'},'amount'],
    [{service:'constructor'},'service'],[{purpose:'guarantee'},'purpose'],[{title:' '},'title'],[{title:'가'.repeat(101)},'title'],
    [{description:'가'.repeat(3001)},'description'],[{description:'  '},'description'],[{title:'https://example.test'},'title'],[{event_date:'2026-02-31'},'event_date'],[{space_id:'unknown'},'space_id'],
    [{headcount:'0'},'headcount'],[{headcount:1.5},'headcount'],[{start_h:'17',end_h:'10'},'start_h'],[{start_h:'',end_h:'17'},'start_h'],[{start_h:'10.25',end_h:'17'},'start_h'],
    [{booking_code:'<script>'},'booking_code'],[{booking_code:'B'.repeat(41)},'booking_code'],[{expires_on:'2026-11-26'},'expires_on'],[{expires_on:'2027-02-26'},'expires_on']
  ];
  for(const [extra,field] of invalid){const result=normalize(input(extra));assert.equal(result.ok,false,JSON.stringify(extra));assert.equal(result.field,field);}
});

test('통신 실패 재시도는 같은 요청번호를 쓰고 수정·새 양식은 새 요청번호를 쓴다',async()=>{
  let n=0,fail=true;const calls=[],busy=[];
  const flow=createFlow(async body=>{calls.push(body);if(fail){fail=false;throw Error('network');}return {ok:true,link:{id:'one'}};},()=>String(++n),value=>busy.push(value));
  const body=normalize(input()).body;
  await assert.rejects(flow.submit(body),/network/);
  await flow.submit(body);
  assert.equal(calls[0].request_id,calls[1].request_id);assert.deepEqual(busy,[true,false,true,false]);
  await flow.submit({...body,amount:400000});assert.notEqual(calls[2].request_id,calls[1].request_id);
  flow.reset();await flow.submit(body);assert.notEqual(calls[3].request_id,calls[0].request_id);
});

test('저장 중 연속 클릭과 재설정은 추가 생성 요청을 만들지 않는다',async()=>{
  let resolve,n=0;const calls=[],busy=[];
  const flow=createFlow(body=>{calls.push(body);return new Promise(done=>{resolve=done;});},()=>String(++n),value=>busy.push(value));
  const body=normalize(input()).body,first=flow.submit(body);
  flow.reset();assert.equal(await flow.submit(body),null);assert.equal(calls.length,1);assert.deepEqual(busy,[true]);
  resolve({ok:true});await first;assert.deepEqual(busy,[true,false]);assert.equal(n,1);
});

test('요청번호를 만들지 못한 오류도 처리 가능한 Promise로 반환하며 저장하지 않는다',async()=>{
  let calls=0;const busy=[];
  const flow=createFlow(()=>{calls++;},()=>{throw Error('uuid unavailable');},value=>busy.push(value));
  await assert.rejects(flow.submit(normalize(input()).body),/uuid unavailable/);assert.equal(calls,0);assert.deepEqual(busy,[]);
});

test('미리보기는 제목·상세 설명을 텍스트로 표시하고 예약금과 반환 보증금을 구분한다',()=>{
  const html=preview({...normalize(input()).body,title:'<img src=x onerror=alert(1)>',description:'첫째 줄\n<script>alert(1)</script>'});
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));
  assert.match(html,/300,000원/);assert.match(html,/메가스팟 건대 1호/);assert.match(html,/예약금은 이용료의 일부/);assert.match(html,/반환하는 보증금과 다릅니다/);
  assert.match(html,/megaspot-official-wordmark-transparent.png/);
  assert.ok(!preview({...normalize(input()).body,purpose:'balance'}).includes('apl-preview-note'));
});

test('고객 링크 복사·열기는 지정된 결제 안내 경로만 허용한다',()=>{
  const origin='https://admin.test';
  assert.equal(safeUrl('/payment/?link=opaque-token',origin),'https://admin.test/payment/?link=opaque-token');
  assert.equal(safeUrl('https://megaspot.kr/payment/?link=opaque-token',origin),'https://megaspot.kr/payment/?link=opaque-token');
  for(const url of ['https://evil.test/payment/?link=x','javascript:alert(1)','https://admin.test/admin/?link=x','https://admin.test/payment/','https://user:password@admin.test/payment/?link=x','https://admin.test/payment/?link=x#secret'])
    assert.equal(safeUrl(url,origin),'',url);
});

test('생성·만료 시각은 장치 시간대와 무관하게 한국시간으로 표시한다',()=>{
  assert.equal(kstLabel('2026-11-27T16:30:00Z',false),'2026-11-28 01:30');
  assert.equal(kstLabel('2026-11-27 16:30:00',true),'2026-11-28');
  assert.equal(kstLabel('2026-12-04T23:59:59+09:00',true),'2026-12-04');
  assert.equal(kstLabel(Date.parse('2026-12-04T23:59:59+09:00'),true),'2026-12-04');
  assert.equal(kstLabel('invalid',false),'—');
});

test('로그인 확인이 확장 스크립트보다 먼저 끝나도 결제링크 직접 주소를 대시보드로 바꾸지 않는다',()=>{
  const core=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
  const code=core.slice(core.indexOf('  var LOAD='),core.indexOf("  window.addEventListener('hashchange'"));
  let dashboard=0;const location={hash:'#payment-links'};
  const c={location,history:{replaceState(_a,_b,hash){location.hash=hash;}},window:{scrollTo(){}},$$:()=>[]};
  for(const match of code.matchAll(/:\s*(load[A-Z]\w*)/g))c[match[1]]=()=>{if(match[1]==='loadDash')dashboard++;};
  vm.createContext(c);vm.runInContext(code,c);c.go('payment-links');
  assert.equal(location.hash,'#payment-links');assert.equal(dashboard,0);
  let registered=0,opened='';
  vm.runInNewContext(source.slice(source.indexOf("  reset();X.register('payment-links'"),source.lastIndexOf('})(typeof window')),{
    reset(){},load(){},X:{register(id){assert.equal(id,'payment-links');registered++;},visible:()=>true,current:()=> 'payment-links',go(id){opened=id;}}
  });
  assert.equal(registered,1);assert.equal(opened,'payment-links');
});
