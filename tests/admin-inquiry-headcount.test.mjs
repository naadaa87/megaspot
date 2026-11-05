import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {fixture,DAY} from './helpers/admin-fixture.mjs';
const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
const pricing=vm.createContext({window:{}});
for(const file of ['data/holidays-kr.js','data/pricing-gundae.js','data/pricing-gundae2.js','pricing-engine.js'])vm.runInContext(readFileSync(new URL('../assets/js/'+file,import.meta.url),'utf8'),pricing);
const engine=pricing.window.MEGASPOT_PRICE;
function inquiryForm(){
 const elements={},state={mode:'keep'};
 const $=s=>elements[s]??=( {value:'',textContent:'',innerHTML:'',hidden:false,events:{},classList:{toggle(){}},addEventListener(k,fn){this.events[k]=fn;}} );
 for(const [s,value]of Object.entries({'#nw-start':'13','#nw-end':'17','#nw-people':'200','#nw-date':'2026-11-18','#nw-space':'megaspot-gundae-2','#nw-total':'1959000','#nw-disc-type':'none','#nw-disc-val':'0','#nw-disc-why':''}))$(s).value=value;
 $('#nw-form').space_id=$('#nw-space');$('#nw-form').date=$('#nw-date');$('#nw-form').start_h=$('#nw-start');$('#nw-form').end_h=$('#nw-end');$('#nw-form').headcount=$('#nw-people');$('#nw-form').purpose={value:''};
 Object.defineProperty($('#nw-form input[name=amount_mode][value=auto]'),'checked',{set(on){if(on)state.mode='auto';}});
 const ctx=vm.createContext({$,$$:()=>[],NW:{last:null},E:engine,D:engine.data(),ADMIN_HOURS:{from:0,to:47},nwMode:()=>state.mode,nwOptions:()=>({}),nwHourOpts:()=>'',esc:String,spaceShort:id=>id,won:n=>n.toLocaleString('ko-KR')+'원'});
 ctx.useSpace=id=>{ctx.E=engine.forSpace(id);ctx.D=ctx.E.data();};
 vm.runInContext(source.slice(source.indexOf('  function nwCalc('),source.indexOf('  function nwModeUi(')),ctx);
 const registration=source.split('\n').find(l=>l.startsWith("  $('#nw-reprice').addEventListener"));if(registration)vm.runInContext(registration,ctx);
 ctx.nwCalc();ctx.nwSyncMode();
 return {ctx,$,state,people(n){$('#nw-people').value=String(n);ctx.nwCalc();}};
}
test('문의 수정에서 현재 금액 유지 중에도 200→300명 새 계산을 표시하고 명시적으로 적용',()=>{
 const f=inquiryForm();f.people(300);
 assert.equal(f.ctx.NW.last.people,300);assert.equal(f.ctx.NW.last.total,2959000);assert.match(f.$('#nw-auto').innerHTML,/인원 300명/);
 assert.equal(f.$('#nw-auto').hidden,false);assert.equal(f.$('#nw-keep-reprice').hidden,false);assert.equal(f.$('#nw-total').value,'1959000','합의된 기존 금액은 유지');
 f.$('#nw-reprice').events.click();assert.equal(f.state.mode,'auto');assert.equal(f.$('#nw-keep-reprice').hidden,true);assert.match(f.$('#nw-discount-result').textContent,/2,959,000원/);
});
test('문의 등록·수정은 2호점 201~350명을 유지하고 1호점 계산기 상태와 섞이지 않음',()=>{
 const f=inquiryForm();
 for(const date of ['2026-11-18','2026-12-18'])for(const n of [201,250,300,350]){
  f.ctx.useSpace('megaspot-gundae');f.$('#nw-date').value=date;f.people(n);
  const q=engine.forSpace('megaspot-gundae-2').quote({adminHours:true,date,start:13,end:17,people:n});assert.equal(f.ctx.NW.last.people,n);assert.equal(f.ctx.NW.last.total,q.total);
 }
});
test('2호점 300명 자동 계산 문의의 등록·수정 저장과 다시 조회에서 인원·금액·계산 내역 일치',async t=>{
 const f=fixture();t.after(()=>f.db.close());const E=engine.forSpace('megaspot-gundae-2');
 const payload=n=>{const q=E.quote({adminHours:true,date:DAY,start:13,end:17,people:n});return {name:'인원 회귀 검증',space_id:'megaspot-gundae-2',channel:'phone',date:DAY,start_h:13,end_h:17,headcount:n,amount_mode:'auto',total:q.total,estimate:E.summaryText(q,'')};};
 const created=await f.api('inquiries','POST',payload(300));let r=(await f.api('inquiries/'+created.ref)).item;
 assert.equal(r.headcount,300);assert.equal(r.data.headcount,300);assert.equal(r.data.total,payload(300).total);assert.match(r.data.estimate,/300명/);
 await f.api('inquiries/'+created.ref,'PATCH',{...payload(200),edit:true});await f.api('inquiries/'+created.ref,'PATCH',{...payload(300),edit:true});r=(await f.api('inquiries/'+created.ref)).item;
 assert.equal(r.headcount,300);assert.equal(r.data.total,payload(300).total);assert.match(r.data.estimate,/300명/);
});
test('어드민 요금 데이터와 계산기는 내용에 맞는 캐시 버전으로 최신 파일을 요청',()=>{
 const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
 for(const file of ['data/pricing-gundae.js','data/pricing-gundae2.js','pricing-engine.js']){
  const hash=createHash('sha256').update(readFileSync(new URL('../assets/js/'+file,import.meta.url))).digest('hex').slice(0,12);
  assert.ok(html.includes('/assets/js/'+file+'?v='+hash),file+'의 오래된 캐시를 사용하지 않음');
 }
});
