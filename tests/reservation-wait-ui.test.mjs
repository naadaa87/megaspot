import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ONE='megaspot-gundae',TWO='megaspot-gundae-2',date='2026-11-24';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function element(){return {innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',dataset:{},classList:{add(){},toggle(){}},setAttribute(){},scrollIntoView(){},focus(){},querySelectorAll(){return [];},insertAdjacentHTML(_where,html){this.innerHTML+=html;}};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function calendar({pendingDates,intervals=[],malformed=false}={}){
 const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},listeners={},filters=['all',ONE,TWO].map(filter=>({...element(),dataset:{filter}}));
 const root={innerHTML:'',classList:{add(){}},querySelector:node,querySelectorAll:selector=>selector==='[data-filter]'?filters:[],addEventListener(type,handler){listeners[type]=handler;},contains(){return true;}};
 node('[data-rc=room]').querySelectorAll=()=>[ONE,TWO].map(value=>({value}));node('[data-rc=end]').querySelectorAll=()=>Array.from({length:26},(_,i)=>({value:i+6}));
 class Clock extends Date{static now(){return Date.parse('2026-11-07T12:00:00+09:00');}}
 const payload={ok:true,timezone:'Asia/Seoul',range:{from:'2026-11-01',to:'2026-12-31'},spaces:[{id:ONE},{id:TWO}],intervals,unknownDates:[],updatedAt:'2026-11-07T12:00:00+09:00'};if(pendingDates)payload.pendingDates=pendingDates;if(malformed)delete payload.intervals;
 const M={esc:escape},selected=[];
 const ctx={window:{MEGASPOT:M},document:{readyState:'loading',hidden:false,addEventListener(){},removeEventListener(){}},Date:Clock,URLSearchParams,AbortController,setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},matchMedia:()=>({matches:false}),fetch:async()=>({ok:true,json:async()=>payload})};
 vm.runInNewContext(read('assets/js/reservation-calendar.js'),ctx);
 const panel=M.reservations.mount(root,{date,space:ONE,start:13,end:17,onSelect:value=>selected.push(value)});
 return {M,nodes,node,root,selected,panel,payload,click(dataset){listeners.click({target:{closest(){return {dataset};}}});}};
}

test('a legacy queue payload is ignored and a customer can continue with a normal inquiry',async()=>{
 const f=calendar({pendingDates:[{space:ONE,date,count:2,next_wait_no:3},{space:TWO,date,count:1,next_wait_no:2}]});await flush();
 for(const text of [f.root.innerHTML,f.node('.rc-grid').innerHTML,f.node('.rc-day-detail').innerHTML,f.node('.rc-selection-status').textContent,f.node('[data-rc=apply]').textContent])assert.doesNotMatch(text,/대기|순번/);
 assert.match(f.node('.rc-selection-status').textContent,/최종 이용 가능 여부는 상담 시 확인/);
 assert.equal(f.node('[data-rc=apply]').disabled,false);
 const state=await f.M.reservations.checkRange({space:ONE,date,start:18,end:22},true);
 assert.equal(state.conflict,false);assert.equal('pending_count' in state,false);
 f.click({rc:'apply'});await flush();assert.equal(f.selected.length,1);assert.equal(f.selected[0].space,ONE);assert.equal(f.selected[0].date,date);f.panel.destroy();
});
test('confirmed conflicts still disable calendar selection and malformed occupancy fails closed',async()=>{
 const f=calendar({intervals:[{space:ONE,start:date+'T10:00:00+09:00',end:date+'T17:00:00+09:00'}]});await flush();
 assert.match(f.node('.rc-grid').innerHTML,/건대 1호 확정 예약 있음/);
 assert.equal(f.node('[data-rc=apply]').disabled,true);assert.match(f.node('.rc-selection-status').textContent,/확정 예약/);f.panel.destroy();
 const missing=calendar({malformed:true});await flush();assert.equal(missing.node('[data-rc=apply]').disabled,true);assert.match(missing.node('.rc-error').textContent,/예약 현황을 확인할 수 없습니다/);missing.panel.destroy();
});
test('an overnight booking leaves the daytime range selectable and covers early hours the next morning',async()=>{
 const next='2026-11-25';
 const f=calendar({intervals:[{space:ONE,start:date+'T18:00:00+09:00',end:next+'T07:00:00+09:00'}]});await flush();
 const detail=f.node('.rc-day-detail');
 assert.match(detail.innerHTML,/18:00–다음 날 07:00<\/span><small class="rc-slot-confirmed">예약 확정/);
 assert.match(detail.innerHTML,/data-use-room="megaspot-gundae" data-start="5" data-end="18"/);
 f.click({useRoom:ONE,start:'5',end:'18'});
 assert.match(f.node('.rc-selected-date').textContent,/05:00–18:00/);
 f.click({rc:'apply'});await flush();assert.equal(f.selected[0]?.end,18);
 assert.equal((await f.M.reservations.checkRange({space:ONE,date,start:10,end:17})).conflict,false);
 assert.equal((await f.M.reservations.checkRange({space:ONE,date,start:18,end:31})).conflict,true);
 f.click({day:next});
 assert.match(detail.innerHTML,/05:00–07:00<\/span><small class="rc-slot-confirmed">예약 확정/);
 assert.match(detail.innerHTML,/data-use-room="megaspot-gundae" data-start="7" data-end="31"/);
 f.panel.destroy();
});
function pricingFunctions(names,ctx){const code=read('assets/js/pricing-ui.js');vm.createContext(ctx);for(const name of names){const start=code.indexOf('    function '+name+'('),end=code.indexOf('\n    function ',start+1);assert(start>=0,name);vm.runInContext(code.slice(start,end),ctx);}return ctx;}
function receipt({wait={no:1,total:1,date,space_id:ONE},unknown=false,live=true}={}){
 const nodes={result:element(),mini:element()},r={date,range:'10:00–17:00',people:30,total:400000,deposit:150000,pkg:{label:'낮 패키지'},...(unknown?{plan:{unknownDate:true,html:'일정 상담'}}:{})};
 const ctx={done:{wait,live,ref:'MS-OWN-REF',r,who:{name:'본인',phone:'010-1234-5678'},purpose:''},SPACE_ID:ONE,NAME:'건대 1호',D:{deposit:{label:'이용 보증금'}},KAKAO:'https://pf.kakao.com/_LnxbmX/chat',esc:escape,won:v=>Number(v).toLocaleString('ko-KR')+'원',E:{kdateY:v=>v,summaryText:()=> '공간 견적'},purLabel:()=>'',out:key=>nodes[key],syncMiniClass(){},paintAvailability(){},M:{},PLAN:null};
 pricingFunctions(['reserveText','paintDone'],ctx);ctx.paintDone();return {html:nodes.result.innerHTML,text:ctx.reserveText(r,ctx.done.who)};
}
test('estimate receipts show the next step and omit queue details even with a legacy response',()=>{
 for(const params of [{}, {unknown:true,wait:null}]){
  const f=receipt(params);
  assert.match(f.html,/상담 신청이 접수되었습니다/);
  assert.match(f.html,/금액 확인·결제 안내/);
  assert.doesNotMatch(f.html+f.text,/예약\s*대기|순번|\/order\/|바로 결제/);
 }
});
test('estimate permits a clear selection and blocks a confirmed conflict',()=>{
 const box=element(),message=element(),options=element(),summary=element(),buttons=['reserve','submit'].map(act=>({...element(),dataset:{act}}));
 box.querySelector=selector=>selector==='[data-availability-message]'?message:options;
 const ctx={availabilityState:'clear',availabilityMessage:'선택한 시간과 겹치는 확정 예약이 없습니다.',availabilityChoices:[],phase:'form',submitting:false,SPACE_ID:ONE,E:{},esc:escape,out:key=>key==='availability'?box:key==='availability-summary'?summary:null,el:{querySelectorAll:()=>buttons}};
 pricingFunctions(['paintAvailability'],ctx);ctx.paintAvailability();
 assert.equal(summary.hidden,true);assert.equal(box.dataset.state,'clear');assert(buttons.every(button=>!button.disabled));
 ctx.availabilityState='blocked';ctx.paintAvailability();assert.equal(summary.hidden,false);assert(buttons.every(button=>button.disabled));
});
function inquiryFunction(name){const code=read('assets/js/inquiry-form.js'),start=code.indexOf('  function '+name+'('),end=code.indexOf('\n  ',start+4);if(name==='donePanel')return code.slice(start,code.indexOf('\n  M.renderInquiry',start));return code.slice(start,code.indexOf('\n  function ',start+4));}
test('the simple inquiry receipt shows the reference and omits legacy queue details',()=>{
 const ctx={M:{CONFIG:{kakaoChannel:'',phone:'010-2384-9580'}},esc:escape,summary:()=> '문의 요약'};vm.createContext(ctx);vm.runInContext(inquiryFunction('donePanel'),ctx);
 const html=ctx.donePanel('MS-OWN',{space_id:TWO,date,inquiry_type:'event'},true,{no:4,total:4,date,space_id:TWO});
 assert.match(html,/문의가 접수되었습니다/);assert.match(html,/MS-OWN/);assert.match(html,/담당자가 문의 내용을 확인/);
 assert.doesNotMatch(html,/예약\s*대기|순번|4번|4건/);
});
