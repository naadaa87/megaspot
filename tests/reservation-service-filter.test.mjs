import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
function context(extra={}){const c=vm.createContext({esc:String,...extra});vm.runInContext(source.slice(source.indexOf('  function serviceChips('),source.indexOf('  var bkCache=')),c);return c;}
const rows=[
 {customer_name:'뷔페확정',status:'confirmed',date:'2026-12-01',services:[{kind:'catering',status:'confirmed'}]},
 {customer_name:'칵테일확정',status:'confirmed',date:'2026-12-02',services:[{kind:'cocktail',status:'confirmed'},{kind:'reception',status:'pending'}]},
 {customer_name:'상담취소',status:'confirmed',date:'2026-12-03',services:[{kind:'catering',status:'pending'},{kind:'cocktail',status:'cancelled'}]},
 {customer_name:'지난케이터링',status:'completed',date:'2026-10-01',services:[{kind:'reception',status:'confirmed'}]},
 {customer_name:'미선택',status:'confirmed',date:'2026-12-01',services:[]}
];
test('확정 전체는 서비스 중복 없이 모으고 서비스별로 상담·취소·미선택을 제외한다',()=>{
 const c=context();for(const [filter,names] of [['',rows.map(x=>x.customer_name)],['confirmed',['뷔페확정','칵테일확정','지난케이터링']],['catering',['뷔페확정']],['cocktail',['칵테일확정']],['reception',['지난케이터링']]])assert.deepEqual(rows.filter(x=>c.matchesConfirmedService(x,filter)).map(x=>x.customer_name),names);
 assert.equal(c.matchesConfirmedService({services:[{kind:'catering',status:'confirmed'},{kind:'cocktail',status:'confirmed'}]},'confirmed'),true);assert.equal(c.matchesConfirmedService({},'confirmed'),false);
});
test('예약 목록은 예약 상태와 식음료 필터를 함께 적용하고 건수·빈 결과를 갱신한다',()=>{
 const nodes={'#bk-space-filter':{value:''},'#bk-filter':{value:'upcoming'},'#bk-service-filter':{value:'confirmed',selectedOptions:[{textContent:'식음료 이용 확정 전체'}]},'#bk-service-summary':{},'#bk-list':{}};
 const c=context({$:s=>nodes[s],todayIso:()=> '2026-11-13',bkCache:rows,SLOT:{},spaceTag:()=>'',depositControl:()=>'',settlementSummary:()=>'',kd:String,hl:String,won:String,guideControl:()=>'',cdBtn:()=>'',emptyMsg:s=>s});
 vm.runInContext(source.slice(source.indexOf('  function drawBookings('),source.indexOf("  $('#bk-q').addEventListener")),c);
 c.drawBookings();assert.equal(nodes['#bk-service-summary'].textContent,'식음료 이용 확정 전체 · 2건');assert.match(nodes['#bk-list'].innerHTML,/뷔페확정/);assert.match(nodes['#bk-list'].innerHTML,/칵테일확정/);assert.doesNotMatch(nodes['#bk-list'].innerHTML,/지난케이터링|상담취소|미선택/);
 nodes['#bk-service-filter'].value='reception';c.drawBookings();assert.match(nodes['#bk-list'].innerHTML,/확정 건이 없습니다/);
 nodes['#bk-filter'].value='completed';c.drawBookings();assert.match(nodes['#bk-list'].innerHTML,/지난케이터링/);
 nodes['#bk-filter'].value='';nodes['#bk-service-filter'].value='';c.drawBookings();assert.equal(nodes['#bk-service-summary'].hidden,true);assert.match(nodes['#bk-list'].innerHTML,/미선택/);
});
