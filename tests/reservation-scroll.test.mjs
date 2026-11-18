import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
test('예약 갱신은 응답 시점의 현재 스크롤을 유지하고 부드러운 스크롤을 시작하지 않는다',()=>{
 const root={style:{overflowAnchor:'auto'}},calls=[],window={scrollX:3,scrollY:2400,scrollTo(v){calls.push(v);this.scrollY=v.top;}};
 const c=vm.createContext({window,document:{documentElement:root}});vm.runInContext(source.slice(source.indexOf('  function keepReservationScroll('),source.indexOf('  function drawBookings(')),c);
 c.keepReservationScroll(()=>{assert.equal(root.style.overflowAnchor,'none');window.scrollY=0;});assert.equal(window.scrollY,2400);assert.equal(calls[0].behavior,'instant');assert.equal(root.style.overflowAnchor,'auto');
 window.scrollY=3100;c.keepReservationScroll(()=>{window.scrollY=0;});assert.equal(window.scrollY,3100,'이전 요청 시작 위치로 되돌리지 않는다');
});
test('일자별 새로고침은 응답 전까지 기존 긴 목록을 지우지 않고 최신 결과만 그린다',async()=>{
 const box={children:[{}],innerHTML:'기존 예약 목록',setAttribute(k,v){this[k]=v;}},nodes={'#rs-list':box,'#rs-from':{value:'2026-11-01'},'#rs-to':{value:'2026-11-30'}},requests=[];let draws=0;
 const c=vm.createContext({RS:{request:0},reservationMonth:()=>'', $:s=>nodes[s],AList:()=>new Promise(resolve=>requests.push(resolve)),todayIso:()=> '2026-11-18',drawResv:()=>draws++,guard:()=>false,M:{toast(){}},fail:()=>()=>{}});
 vm.runInContext(source.slice(source.indexOf('  function loadResv('),source.indexOf('  var BST=')),c);c.loadResv();c.loadResv();assert.equal(box.innerHTML,'기존 예약 목록');assert.equal(box['aria-busy'],'true');requests[0]({items:[{ref:'old'}]});await new Promise(r=>setImmediate(r));assert.equal(draws,0);requests[1]({items:[{ref:'new'}]});await new Promise(r=>setImmediate(r));assert.equal(draws,1);assert.equal(c.RS.items[0].ref,'new');assert.equal(box['aria-busy'],'false');
});
