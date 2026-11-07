import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/js/pages/order.js',import.meta.url),'utf8');
const waiting=source.slice(source.indexOf('    function waitChoice('),source.indexOf('    function calc(){'));
const payStart=source.indexOf('    function pay(){');
const paying=source.slice(payStart,source.indexOf('\n\n  }\n',payStart));
const clear={pending_count:0,next_wait_no:1,payment_blocked:false};
const blocked={pending_count:2,next_wait_no:3,payment_blocked:true};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

function fixture(kind='pass'){
 const nodes=new Map(),calls=[],toasts=[],redirects=[],timers=new Map(),waitReplies=[],prepareReplies=[];
 let timerId=0;
 function node(selector){if(!nodes.has(selector))nodes.set(selector,{hidden:false,disabled:false,textContent:'',innerHTML:'',href:'',dataset:{}});return nodes.get(selector);}
 const ctx=vm.createContext({
  isPass:kind==='pass',isVerification:kind==='verification',prod:{id:kind==='pass'?'pass-day-wdfri':kind==='verification'?'payapp-check-1000':'addon-cleaning',pkg:'day'},
  waitState:'idle',waitKey:'',waitAt:0,waitSeq:0,waitTimer:null,waitInfo:null,checkoutWarn:'',payBusy:false,
  selection:{product_id:kind==='pass'?'pass-day-wdfri':kind==='verification'?'payapp-check-1000':'addon-cleaning',date:'2026-11-16',people:20,qty:1,addons:{},inquiry_ref:'',buyer:{name:'모의 고객',phone:'01012345678'},agree_terms:true,agree_privacy:true,agree_refund:true},
  $:node,esc:String,URL,URLSearchParams,todayIso:()=> '2026-11-07',dateError:()=>'',optionError:()=>'',
  location:{assign:url=>redirects.push(url)},
  setTimeout:callback=>{const id=++timerId;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  state:()=>JSON.parse(JSON.stringify(ctx.selection)),
  M:{validate:()=>true,toast:message=>toasts.push(message),api:(path,options)=>{
   calls.push({path,options:options?JSON.parse(JSON.stringify(options)):null});
   if(path.startsWith('/pay/availability?'))return Promise.resolve().then(()=>{const reply=waitReplies.shift();if(reply instanceof Error)throw reply;return reply===undefined?clear:reply;});
   if(path==='/pay/prepare')return Promise.resolve().then(()=>{const reply=prepareReplies.shift();if(reply instanceof Error)throw reply;return reply||{payurl:'https://payapp.kr/mock-checkout'};});
   throw Error('Unexpected API path: '+path);
  }},
  calc:()=>ctx.scheduleWait(ctx.state())
 });
 vm.runInContext(waiting+'\n'+paying,ctx);
 if(kind==='verification')node('#od-pay').textContent='1,000원 결제하기';
 return {ctx,node,calls,toasts,redirects,timers,queue:value=>waitReplies.push(value),queuePrepare:value=>prepareReplies.push(value),request:()=>ctx.requestWait(ctx.state()),schedule:()=>ctx.scheduleWait(ctx.state()),pay:()=>ctx.pay(),
  runTimers:async()=>{const pending=[...timers.values()];timers.clear();pending.forEach(callback=>callback());await tick();},
  change:value=>{Object.assign(ctx.selection,value);ctx.scheduleWait(ctx.state());},flush:async()=>{await tick();await tick();}};
}

test('로딩 동안 결제를 제한하고 먼저 접수된 건수·예상 대기 순번·문의 링크를 표시한다',async()=>{
 const f=fixture();f.queue(blocked);f.schedule();
 assert.equal(f.ctx.waitState,'loading');assert.equal(f.node('#od-pay').disabled,true);assert.match(f.node('#od-availability-message').textContent,/확인하고 있습니다/);assert.equal(f.calls.length,0);
 await f.runTimers();assert.equal(f.ctx.waitState,'blocked');assert.equal(f.node('#od-pay').disabled,true);
 assert.match(f.node('#od-availability-message').textContent,/예약 문의 2건/);assert.match(f.node('#od-availability-message').textContent,/예상 대기 3번/);
 const link=new URL(f.node('#od-wait-link').href,'https://megaspot.test');assert.equal(link.pathname,'/inquiry/');assert.equal(link.searchParams.get('date'),'2026-11-16');assert.equal(link.searchParams.get('people'),'20');assert.equal(link.searchParams.get('wait'),'1');assert.equal(link.hash,'#reserve');assert.equal(f.node('#od-wait-link').hidden,false);
 assert.equal(f.node('#od-availability-retry').hidden,true);
});

test('본인 대기 순번은 서버 응답만 사용하며 기존 문의는 카카오톡으로 이어간다',async()=>{
 const f=fixture();f.ctx.selection.inquiry_ref='MS-TEST';f.queue({...blocked,pending_count:4,next_wait_no:5,wait:{no:2}});await f.request();
 assert.match(f.node('#od-availability-message').textContent,/현재 대기 2번입니다\(총 4건\)/);assert.equal(f.node('#od-pay').disabled,true);
 assert.equal(f.node('#od-wait-link').href,'https://pf.kakao.com/_LnxbmX/chat');assert.match(f.node('#od-wait-link').textContent,/기존 예약 문의/);
 assert.equal(new URL(f.calls[0].path,'https://megaspot.test').searchParams.get('ref'),'MS-TEST');
});

test('대기가 없는 경우에만 활성화하고 기존 입력 오류·결제 진행 잠금은 유지한다',async()=>{
 const f=fixture();await f.request();assert.equal(f.ctx.waitState,'clear');assert.equal(f.node('#od-pay').disabled,false);assert.equal(f.node('#od-wait-link').hidden,true);
 f.ctx.checkoutWarn='인원 오류';f.ctx.paintWait();assert.equal(f.node('#od-pay').disabled,true);
 f.ctx.checkoutWarn='';f.ctx.payBusy=true;f.ctx.paintWait();assert.equal(f.node('#od-pay').disabled,true);
 const before=f.calls.length;f.schedule();await f.runTimers();assert.equal(f.calls.length,before);
});

test('조회 실패·잘못된 응답은 결제를 제한하고 재조회·문의 방법을 제공한다',async()=>{
 for(const value of [Error('Network unavailable'),{pending_count:'0',next_wait_no:1,payment_blocked:false},{pending_count:0,next_wait_no:0,payment_blocked:false},{pending_count:0,next_wait_no:1}]){
  const f=fixture();f.queue(value);await assert.rejects(f.request());assert.equal(f.ctx.waitState,'error');assert.equal(f.node('#od-pay').disabled,true);assert.equal(f.node('#od-availability-retry').hidden,false);assert.equal(f.node('#od-wait-link').hidden,false);assert.match(f.node('#od-availability-message').textContent,/결제를 잠시 제한/);
 }
});

test('다른 날짜로 바꾼 뒤 늦게 온 이전 응답·오류는 최신 대기 상태를 덮지 않는다',async()=>{
 for(const failure of [false,true]){
  const f=fixture(),old=deferred();f.queue(old.promise);const first=f.request();await tick();f.ctx.selection.date='2026-11-17';f.queue(clear);await f.request();
  if(failure){old.reject(Error('Old date failed'));await assert.rejects(first);}else{old.resolve(blocked);assert.equal(await first,null);}
  assert.equal(f.ctx.waitState,'clear');assert.equal(f.node('#od-pay').disabled,false);assert.match(f.node('#od-availability-message').textContent,/대기가 없습니다/);
 }
});

test('결제 직전 재조회에서 새 대기가 생기면 결제 생성 POST를 호출하지 않는다',async()=>{
 const f=fixture();await f.request();f.queue(blocked);f.pay();f.pay();await f.flush();
 assert.equal(f.calls.filter(x=>x.path==='/pay/prepare').length,0);assert.equal(f.calls.filter(x=>x.path.startsWith('/pay/availability?')).length,2);
 assert.equal(f.ctx.waitState,'blocked');assert.equal(f.node('#od-pay').disabled,true);assert.equal(f.redirects.length,0);assert.match(f.node('#od-error').innerHTML,/먼저 접수된 예약 문의/);
});

test('결제 직전 조회에 실패해도 결제 생성 POST와 외부 이동을 하지 않는다',async()=>{
 const f=fixture();await f.request();f.queue(Error('확인 실패'));f.pay();await f.flush();assert.equal(f.calls.filter(x=>x.path==='/pay/prepare').length,0);assert.equal(f.redirects.length,0);assert.equal(f.node('#od-pay').disabled,true);assert(['loading','error'].includes(f.ctx.waitState));
 f.queue(Error('재확인 실패'));await f.runTimers();assert.equal(f.ctx.waitState,'error');assert.equal(f.node('#od-pay').disabled,true);assert.equal(f.node('#od-availability-retry').hidden,false);
});

test('결제 직전 조회 중 날짜가 바뀌면 이전 날짜의 주문을 생성하지 않는다',async()=>{
 const f=fixture();await f.request();const final=deferred();f.queue(final.promise);f.pay();await tick();f.change({date:'2026-11-17'});final.resolve(clear);await f.flush();
 assert.equal(f.calls.filter(x=>x.path==='/pay/prepare').length,0);assert.equal(f.redirects.length,0);
});

test('결제 직전 조회 중 인원·옵션이 바뀌면 화면과 다른 옛 금액으로 주문하지 않는다',async()=>{
 for(const change of [{people:50},{addons:{cleaning:1}}]){
  const f=fixture();await f.request();const final=deferred();f.queue(final.promise);f.pay();await tick();f.change(change);final.resolve(clear);await f.flush();
  assert.equal(f.calls.filter(x=>x.path==='/pay/prepare').length,0,JSON.stringify(change));assert.equal(f.redirects.length,0);
 }
});

test('대기 확인이 끝난 결제만 한 번 생성하며 서버의 최종 대기 거절도 화면에 반영한다',async()=>{
 const f=fixture();await f.request();f.queue(clear);f.pay();f.pay();await f.flush();assert.equal(f.calls.filter(x=>x.path==='/pay/prepare').length,1);assert.equal(f.redirects.length,1);
 const denied=fixture();await denied.request();denied.queue(clear);denied.queuePrepare(Object.assign(Error('서버 최종 대기 확인'),{code:'RESERVATION_PENDING',detail:blocked}));denied.pay();await denied.flush();assert.equal(denied.ctx.waitState,'blocked');assert.equal(denied.redirects.length,0);assert.equal(denied.node('#od-pay').disabled,true);
});

test('옵션 단독·확인용 결제는 공간 대기 조회 없이 기존 결제 동작을 유지한다',async()=>{
 for(const kind of ['addon','verification']){
  const f=fixture(kind);f.schedule();assert.equal(f.node('#od-availability').hidden,true);assert.equal(f.node('#od-pay').disabled,false);assert.equal(f.calls.length,0);
  if(kind==='verification')assert.equal(f.node('#od-pay').textContent,'1,000원 결제하기');
  f.pay();await f.flush();assert.equal(f.calls.filter(x=>x.path.startsWith('/pay/availability?')).length,0);assert.equal(f.calls.filter(x=>x.path==='/pay/prepare').length,1);assert.equal(f.redirects.length,1);
 }
});

test('주문 HTML의 대기 안내는 이용권 영역에 있고 재확인 버튼은 결제를 제출하지 않는다',()=>{
 const html=readFileSync(new URL('../order/index.html',import.meta.url),'utf8');
 for(const id of ['od-availability','od-availability-message','od-wait-link','od-availability-retry'])assert(html.includes('id="'+id+'"'),id);
 assert.match(html,/<p id="od-availability-message" role="status" aria-live="polite">/);assert.match(html,/<button[^>]*id="od-availability-retry"[^>]*type="button"/);
 assert(html.indexOf('id="od-pass"')<html.indexOf('id="od-availability"'));assert(html.indexOf('id="od-availability"')<html.indexOf('id="od-addon-only"'));
});
