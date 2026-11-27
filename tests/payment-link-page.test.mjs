import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/pages/payment-link.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../payment/index.html',import.meta.url),'utf8');
const token='a'.repeat(43),flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
const open={id:'PL-20261127-123456',title:'건대 2호 대관 예약금',description:'안내받은 일정과 구성을 확인해 주세요.\n추가 안내는 담당자에게 문의해 주세요.',amount:300000,service:'rental',purpose:'deposit',event_date:'2026-12-12',space_name:'메가스팟 건대 2호',headcount:80,start_h:18,end_h:25,booking_code:'BK-TEST',expires_at:'2026-11-28 04:00:00',state:'open',payment_enabled:true};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(link={...open},search='?link='+token){
 const nodes=new Map(),events=new Map(),calls=[],redirects=[],getReplies=[],postReplies=[];
 function node(id){if(!nodes.has(id)){
  const handlers=new Map();nodes.set(id,{hidden:false,disabled:false,value:'',checked:false,indeterminate:false,textContent:'',innerHTML:'',dataset:{},attributes:{},focus(){this.focused=true;},reportValidity(){return true;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){handlers.set(k,fn);},emit(k,event={}){return handlers.get(k)?.call(this,{preventDefault(){},...event});}});
 }return nodes.get(id);}
 const ctx=vm.createContext({document:{getElementById:node},window:{addEventListener:(k,fn)=>events.set(k,fn)},location:{search,assign:url=>redirects.push(url)},URL,URLSearchParams,AbortController,Intl,Date,setTimeout,clearTimeout,
  fetch:async(path,options)=>{calls.push({path,options});const queue=options.method==='POST'?postReplies:getReplies;const reply=queue.length?await queue.shift():{ok:true,link};if(reply instanceof Error)throw reply;if(reply instanceof Response)return reply;return Response.json(reply);}
 });
 vm.runInContext(source,ctx);
 function fill(){node('pl-name').value='결제자';node('pl-phone').value='010-1234-5678';node('pl-email').value='buyer@example.invalid';for(const id of ['terms','privacy','refund'])node('pl-agree-'+id).checked=true;}
 return {node,calls,redirects,fill,flush,submit:()=>node('pl-form').emit('submit'),refresh:()=>node('pl-refresh').emit('click'),get:reply=>getReplies.push(reply),post:reply=>postReplies.push(reply),pageShow:()=>events.get('pageshow')?.({persisted:true})};
}

test('고객 안내 GET은 결제를 생성하지 않고 설명을 텍스트로 표시하며 한국 시간으로 고정한다',async()=>{
 const f=fixture({...open,description:'<img src=x onerror=alert(1)>\n두 번째 줄'});await f.flush();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'GET');assert.equal(f.calls[0].path,'/api/payment-links/'+token);
 assert.equal(f.calls[0].options.cache,'no-store');assert.equal(f.calls[0].options.referrerPolicy,'no-referrer');assert.equal(f.calls[0].options.redirect,'error');
 assert.equal(f.node('pl-description').textContent,'<img src=x onerror=alert(1)>\n두 번째 줄');assert.equal(f.node('pl-description').innerHTML,'');
 assert.equal(f.node('pl-expiry').textContent,'2026.11.28 13:00 (한국 시간)');assert.equal(f.node('pl-date').textContent,'2026.12.12 (토)');assert.equal(f.node('pl-time').textContent,'18:00 – 다음 날 01:00 (한국 기준)');
 assert.equal(f.node('pl-pay').disabled,false);assert.equal(f.redirects.length,0);
});

test('서버의 숫자 만료시각도 한국 시간으로 표시하고 서비스 안내는 기존 페이지로 연결한다',async()=>{
 const f=fixture({...open,expires_at:Date.parse('2026-11-28T14:59:59.999Z'),service:'catering'});await f.flush();
 assert.equal(f.node('pl-expiry').textContent,'2026.11.28 23:59 (한국 시간)');assert.equal(f.node('pl-service-guide').href,'/catering/');
 const review=fixture({...open,state:'paid',needs_review:true});await review.flush();assert.match(review.node('pl-status-title').textContent,/담당자 확인 중/);assert.match(review.node('pl-status-detail').textContent,/다시 결제하지/);assert.equal(review.node('pl-checkout').hidden,true);
});

test('금액·예약번호를 고객 입력으로 보내지 않고 필수 동의 뒤 한 번만 결제 요청한다',async()=>{
 const f=fixture();await f.flush();f.fill();const wait=deferred();f.post(wait.promise);
 const first=f.submit();f.submit();await f.flush();
 const posts=f.calls.filter(x=>x.options.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/payment-links/'+token+'/checkout');
 assert.deepEqual(JSON.parse(posts[0].options.body),{buyer:{name:'결제자',phone:'01012345678',email:'buyer@example.invalid'},agree_terms:true,agree_privacy:true,agree_refund:true});
 assert.equal(f.node('pl-pay').disabled,true);wait.resolve({ok:true,oid:'MS-TEST',payurl:'https://payapp.kr/mock-checkout'});await first;
 assert.deepEqual(f.redirects,['https://payapp.kr/mock-checkout']);
});

test('이름·휴대폰·이메일·필수 동의가 잘못되면 POST를 만들지 않는다',async()=>{
 for(const invalid of ['name','phone','email','terms','privacy','refund']){
  const f=fixture();await f.flush();f.fill();
  if(invalid==='name')f.node('pl-name').value=' ';
  else if(invalid==='phone')f.node('pl-phone').value='0101';
  else if(invalid==='email')f.node('pl-email').value='bad@';
  else f.node('pl-agree-'+invalid).checked=false;
  await f.submit();assert.equal(f.calls.filter(x=>x.options.method==='POST').length,0,invalid);assert.equal(f.node('pl-error').hidden,false);
 }
});

test('서버와 동일하게 국내 휴대폰 번호만 허용하고 유선·잘못된 식별번호는 차단한다',async()=>{
 for(const phone of ['02-1234-5678','012-1234-5678','013-1234-5678','+82 10-1234-5678','010-123-456','010-12345-6789']){
  const f=fixture();await f.flush();f.fill();f.node('pl-phone').value=phone;await f.submit();
  assert.equal(f.calls.filter(x=>x.options.method==='POST').length,0,phone);assert.match(f.node('pl-error').textContent,/휴대폰 번호/);
 }
 const valid=fixture();await valid.flush();valid.fill();valid.node('pl-phone').value='011-123-4567';valid.post({ok:true,payurl:'https://payapp.kr/mock-checkout'});await valid.submit();
 assert.equal(JSON.parse(valid.calls.find(x=>x.options.method==='POST').options.body).buyer.phone,'0111234567');
});

test('페이앱 HTTPS 외부 이동 검증에 실패하면 이동·자동 재요청을 막는다',async()=>{
 for(const bad of ['http://payapp.kr/x','https://payapp.kr.evil.test/x','https://user:pass@payapp.kr/x','https://payapp.kr:8443/x','javascript:alert(1)','/payment/']){
  const f=fixture();await f.flush();f.fill();f.post({ok:true,payurl:bad});await f.submit();await f.submit();
  assert.equal(f.redirects.length,0,bad);assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1,bad);assert.equal(f.node('pl-pay').disabled,true,bad);
 }
});

test('응답 유실 뒤 자동 재결제 없이 조회만 허용하고 processing은 명시적 재개로 처리한다',async()=>{
 const f=fixture();await f.flush();f.fill();f.post(Error('Network unavailable'));await f.submit();await f.submit();
 assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1);assert.equal(f.node('pl-pay').disabled,true);assert.match(f.node('pl-status-detail').textContent,/다시 결제하지/);
 f.get({ok:true,link:{...open,state:'processing',oid:'MS-ORIGINAL'}});await f.refresh();
 assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1);assert.equal(f.node('pl-pay-label').textContent,'기존 결제 이어가기');assert.equal(f.node('pl-order').textContent,'MS-ORIGINAL');
 f.post({ok:true,oid:'MS-ORIGINAL',payurl:'https://api.payapp.kr/resume'});await f.submit();
 assert.equal(f.calls.filter(x=>x.options.method==='POST').length,2);assert.deepEqual(f.redirects,['https://api.payapp.kr/resume']);
});

test('결제·환불·종료·만료·확인 필요 상태에서는 결제 요청을 만들지 않는다',async()=>{
 for(const state of ['paid','refunded','closed','expired','attention','unexpected']){
  const f=fixture({...open,state,refunded_amount:state==='refunded'?300000:0});await f.flush();f.fill();await f.submit();
  assert.equal(f.node('pl-checkout').hidden,true,state);assert.equal(f.node('pl-pay').disabled,true,state);assert.equal(f.calls.filter(x=>x.options.method==='POST').length,0,state);
  if(state==='paid')assert.match(f.node('pl-status-detail').textContent,/담당자 안내/);
  if(state==='refunded')assert.equal(f.node('pl-refund').textContent,'300,000원');
 }
 const paused=fixture({...open,payment_enabled:false});await paused.flush();paused.fill();await paused.submit();assert.equal(paused.calls.length,1);assert.equal(paused.node('pl-checkout').hidden,true);
});

test('조회 실패나 잘못된 토큰에서는 금액을 추정하지 않고 결제를 차단한다',async()=>{
 const missing=fixture(open,'?link=bad');await missing.flush();assert.equal(missing.calls.length,0);assert.equal(missing.node('pl-load-error').hidden,false);
 const f=fixture();await f.flush();f.fill();f.get(Error('Read unavailable'));await f.refresh();await f.submit();
 assert.equal(f.node('pl-checkout').hidden,true);assert.equal(f.node('pl-status').dataset.state,'error');assert.equal(f.calls.filter(x=>x.options.method==='POST').length,0);
});

test('개인 결제 페이지는 추적 스크립트와 외부 폰트 없이 noindex·no-referrer·no-store를 유지한다',()=>{
 assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/);assert.match(html,/<meta name="referrer" content="no-referrer">/);
 const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(scripts,['/assets/js/pages/payment-link.js?v=20261127']);
 assert.doesNotMatch(html,/googletag|google-analytics|choisijun\.com\/k1|cdn\.jsdelivr|fonts\.google/);assert.doesNotMatch(source,/localStorage|sessionStorage|console\./);
 const headers=readFileSync(new URL('../_headers',import.meta.url),'utf8');assert.match(headers,/\/payment\/\*[\s\S]*?Referrer-Policy: no-referrer[\s\S]*?Cache-Control: no-store/);
 const robots=readFileSync(new URL('../robots.txt',import.meta.url),'utf8');for(const block of robots.split('User-agent: ').slice(1))assert.match(block,/Disallow: \/payment\//);
});
