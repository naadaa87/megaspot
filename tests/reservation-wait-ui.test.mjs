import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ONE='megaspot-gundae',TWO='megaspot-gundae-2',date='2026-11-24';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function element(){return {innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',dataset:{},classList:{add(){},toggle(){}},setAttribute(){},scrollIntoView(){},focus(){},querySelectorAll(){return [];},insertAdjacentHTML(_where,html){this.innerHTML+=html;}};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function calendar({pendingDates=[],intervals=[],malformed=false}={}){
 const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},listeners={},filters=['all',ONE,TWO].map(filter=>({...element(),dataset:{filter}}));
 const root={innerHTML:'',classList:{add(){}},querySelector:node,querySelectorAll:selector=>selector==='[data-filter]'?filters:[],addEventListener(type,handler){listeners[type]=handler;},contains(){return true;}};
 node('[data-rc=room]').querySelectorAll=()=>[ONE,TWO].map(value=>({value}));node('[data-rc=end]').querySelectorAll=()=>Array.from({length:26},(_,i)=>({value:i+6}));
 class Clock extends Date{static now(){return Date.parse('2026-11-07T12:00:00+09:00');}}
 const payload={ok:true,timezone:'Asia/Seoul',range:{from:'2026-11-01',to:'2026-12-31'},spaces:[{id:ONE},{id:TWO}],intervals,unknownDates:[],pendingDates,updatedAt:'2026-11-07T12:00:00+09:00'};if(malformed)delete payload.pendingDates;
 const M={esc:escape},selected=[];
 const ctx={window:{MEGASPOT:M},document:{readyState:'loading',hidden:false,addEventListener(){},removeEventListener(){}},Date:Clock,URLSearchParams,AbortController,setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},matchMedia:()=>({matches:false}),fetch:async()=>({ok:true,json:async()=>payload})};
 vm.runInNewContext(read('assets/js/reservation-calendar.js'),ctx);
 const panel=M.reservations.mount(root,{date,space:ONE,start:13,end:17,onSelect:value=>selected.push(value)});
 return {M,nodes,node,root,selected,panel,payload,click(dataset){listeners.click({target:{closest(){return {dataset};}}});}};
}

test('public calendar shows anonymous room/day queue counts and lets a customer continue to a waiting inquiry',async()=>{
 const f=calendar({pendingDates:[{space:ONE,date,count:2,next_wait_no:3},{space:TWO,date,count:1,next_wait_no:2}]});await flush();
 assert.match(f.node('.rc-grid').innerHTML,/건대 1호 예약대기 2건/);assert.match(f.node('.rc-grid').innerHTML,/건대 2호 예약대기 1건/);
 assert.match(f.node('.rc-day-detail').innerHTML,/예약대기 2건 · 다음 접수 예상 3번/);assert.match(f.node('.rc-day-detail').innerHTML,/온라인 결제는 제한/);
 assert.match(f.node('.rc-selection-status').textContent,/예약대기 2건.*예상 3번/);assert.equal(f.node('[data-rc=apply]').disabled,false);assert.match(f.node('[data-rc=apply]').textContent,/예약 대기 신청/);
 const state=await f.M.reservations.checkRange({space:ONE,date,start:18,end:22},true);assert.equal(state.conflict,false);assert.equal(state.payment_blocked,true);assert.equal(state.pending_count,2);assert.equal(state.next_wait_no,3);
 f.click({rc:'apply'});await flush();assert.equal(f.selected.length,1);assert.equal(f.selected[0].space,ONE);assert.equal(f.selected[0].date,date);f.panel.destroy();
});
test('waiting counts apply for the whole selected room/day and refresh independently of confirmed occupancy',async()=>{
 const f=calendar({pendingDates:[{space:ONE,date,count:4,next_wait_no:5}]});await flush();
 const first=await f.M.reservations.inspectRange({space:ONE,date,start:5,end:9});assert.equal(first.status.pending_count,4);assert.equal(first.status.conflict,false);
 assert.equal((await f.M.reservations.checkRange({space:TWO,date,start:5,end:9})).pending_count,0);
 f.payload.pendingDates=[];f.M.reservations.invalidate();assert.equal((await f.M.reservations.checkRange({space:ONE,date,start:5,end:9})).pending_count,0);f.panel.destroy();
});
test('a waiting count never overrides a confirmed-time conflict, and a missing queue payload never implies an empty queue',async()=>{
 const f=calendar({pendingDates:[{space:ONE,date,count:2,next_wait_no:3}],intervals:[{space:ONE,start:date+'T10:00:00+09:00',end:date+'T17:00:00+09:00'}]});await flush();
 assert.equal(f.node('[data-rc=apply]').disabled,true);assert.match(f.node('.rc-selection-status').textContent,/확정 예약/);f.panel.destroy();
 const missing=calendar({malformed:true});await flush();assert.equal(missing.node('[data-rc=apply]').disabled,true);assert.match(missing.node('.rc-error').textContent,/예약 현황을 확인할 수 없습니다/);missing.panel.destroy();
});
function pricingFunctions(names,ctx){const code=read('assets/js/pricing-ui.js');vm.createContext(ctx);for(const name of names){const start=code.indexOf('    function '+name+'('),end=code.indexOf('\n    function ',start+1);assert(start>=0,name);vm.runInContext(code.slice(start,end),ctx);}return ctx;}
function receipt({wait={no:1,total:1,date,space_id:ONE},unknown=false,live=true}={}){
 const nodes={result:element(),mini:element()},r={date,range:'10:00–17:00',people:30,total:400000,deposit:150000,pkg:{label:'낮 패키지'},...(unknown?{plan:{unknownDate:true,html:'일정 상담'}}:{})};
 const ctx={done:{wait,live,ref:'MS-OWN-REF',r,who:{name:'본인',phone:'010-1234-5678'},purpose:''},SPACE_ID:ONE,NAME:'건대 1호',D:{deposit:{label:'이용 보증금'}},KAKAO:'https://pf.kakao.com/_LnxbmX/chat',esc:escape,won:v=>Number(v).toLocaleString('ko-KR')+'원',E:{kdateY:v=>v,summaryText:()=> '공간 견적'},purLabel:()=>'',out:key=>nodes[key],syncMiniClass(){},paintAvailability(){},M:{},PLAN:null};
 pricingFunctions(['reserveText','paintDone'],ctx);ctx.paintDone();return {html:nodes.result.innerHTML,text:ctx.reserveText(r,ctx.done.who)};
}
test('first and later inquiry receipts show only the caller’s exact submitted queue place and never offer immediate checkout',()=>{
 for(const no of [1,3]){const f=receipt({wait:{no,total:3,date,space_id:ONE}});assert.match(f.html,new RegExp('내 예약대기 <strong>'+no+'번</strong>'));assert.match(f.html,/1번도 예약 확정은 아니며/);assert.match(f.html,/온라인 결제는 제한/);assert.match(f.text,new RegExp('접수 시점 예약대기 '+no+'번'));assert.doesNotMatch(f.html,/\/order\/|바로 결제|지금 바로 결제/);}
 const unknown=receipt({unknown:true,wait:null});assert.doesNotMatch(unknown.html,/내 예약대기 <strong>|예약대기 접수/);
 const stale=receipt({wait:{no:8,total:8,date:'2026-11-25',space_id:TWO}});assert.doesNotMatch(stale.html,/내 예약대기 <strong>8번/);assert.match(stale.html,/순번은 담당자가 확인/);assert.doesNotMatch(stale.text,/예약대기 8번/);
});
test('estimate guidance changes the action to a waiting inquiry while keeping submission available',()=>{
 const box=element(),message=element(),options=element(),summary=element(),buttons=['reserve','submit'].map(act=>({...element(),dataset:{act}}));
 box.querySelector=selector=>selector==='[data-availability-message]'?message:options;
 const ctx={availabilityState:'waiting',availabilityMessage:'예약대기 2건 · 예상 3번',availabilityChoices:[],phase:'form',submitting:false,SPACE_ID:ONE,E:{},esc:escape,out:key=>key==='availability'?box:key==='availability-summary'?summary:null,el:{querySelectorAll:()=>buttons}};
 pricingFunctions(['paintAvailability'],ctx);ctx.paintAvailability();
 assert.equal(summary.hidden,false);assert.equal(box.dataset.state,'waiting');assert(buttons.every(button=>!button.disabled));assert(buttons.every(button=>button.innerHTML.includes('예약 대기 신청')));
 ctx.availabilityState='blocked';ctx.paintAvailability();assert(buttons.every(button=>button.disabled));
});
function inquiryFunction(name){const code=read('assets/js/inquiry-form.js'),start=code.indexOf('  function '+name+'('),end=code.indexOf('\n  ',start+4);if(name==='donePanel')return code.slice(start,code.indexOf('\n  M.renderInquiry',start));return code.slice(start,code.indexOf('\n  function ',start+4));}
test('the simple inquiry receipt uses the server’s own place and keeps unknown-date/other-room replies from being presented as this queue',()=>{
 const ctx={M:{CONFIG:{kakaoChannel:'',phone:'010-2384-9580'}},esc:escape,summary:()=> '문의 요약'};vm.createContext(ctx);vm.runInContext(inquiryFunction('donePanel'),ctx);
 const data={space_id:TWO,date,inquiry_type:'event'};
 const html=ctx.donePanel('MS-OWN',data,true,{no:4,total:4,date,space_id:TWO});assert.match(html,/내 예약대기 <strong>4번/);assert.match(html,/온라인 결제가 제한/);assert.match(html,/건대 2호/);assert.doesNotMatch(html,/바로 신청할 수도/);
 assert.doesNotMatch(ctx.donePanel('MS-OWN',data,true,{no:4,total:4,date,space_id:ONE}),/내 예약대기/);
 assert.doesNotMatch(ctx.donePanel('MS-OWN',{...data,date:''},true,null),/내 예약대기/);
});
test('simple inquiry queue lookups cannot let a stale date response overwrite a later date selection',async()=>{
 const code=read('assets/js/inquiry-form.js'),start=code.indexOf('    function refreshWait('),end=code.indexOf('\n    dateIn.addEventListener',start),pending=new Map(),dateIn={value:date},space={value:ONE},waitBox=element(),form={hidden:false};
 const ctx={waitSequence:0,waitTimer:null,waitBox,dateIn,form,$f:()=>space,clearTimeout(){},setTimeout(fn){fn();return 1;},URLSearchParams,M:{api:url=>new Promise(resolve=>pending.set(new URL('https://local.test'+url).searchParams.get('date'),resolve))}};
 vm.createContext(ctx);vm.runInContext(code.slice(start,end),ctx);ctx.refreshWait();dateIn.value='2026-11-25';ctx.refreshWait();
 pending.get('2026-11-25')({date:'2026-11-25',space:ONE,pending_count:1,next_wait_no:2});await flush();pending.get(date)({date,space:ONE,pending_count:8,next_wait_no:9});await flush();
 assert.match(waitBox.textContent,/예약대기 1건.*예상 2번/);assert.doesNotMatch(waitBox.textContent,/8건|9번/);
});
