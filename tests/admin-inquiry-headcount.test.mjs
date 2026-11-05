import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {fixture,DAY} from './helpers/admin-fixture.mjs';
import Calculation from '../assets/js/quote-calculation.js';
const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
const pricing=vm.createContext({window:{}});
for(const file of ['data/holidays-kr.js','data/pricing-gundae.js','data/pricing-gundae2.js','pricing-engine.js'])vm.runInContext(readFileSync(new URL('../assets/js/'+file,import.meta.url),'utf8'),pricing);
const engine=pricing.window.MEGASPOT_PRICE;
function inquiryForm(){
 const elements={},state={mode:'keep'};
 const options=engine.data().options.map(o=>({dataset:{nwopt:o.id},checked:false}));
 const $=s=>elements[s]??=( {value:'',textContent:'',innerHTML:'',hidden:false,events:{},dataset:{},classList:{toggle(){}},addEventListener(k,fn){this.events[k]=fn;}} );
 for(const [s,value]of Object.entries({'#nw-start':'13','#nw-end':'17','#nw-people':'200','#nw-date':'2026-11-18','#nw-space':'megaspot-gundae-2','#nw-total':'1959000','#nw-disc-type':'none','#nw-disc-val':'0','#nw-disc-why':''}))$(s).value=value;
 $('#nw-form').space_id=$('#nw-space');$('#nw-form').date=$('#nw-date');$('#nw-form').start_h=$('#nw-start');$('#nw-form').end_h=$('#nw-end');$('#nw-form').headcount=$('#nw-people');$('#nw-form').purpose={value:''};$('#nw-form').regular={name:'regular',dataset:{},checked:false};
 for(const [key,value]of [['count','1'],['hours','4']])Object.assign($('#nw-opts [data-nwmgr='+key+']'),{value,dataset:{nwmgr:key}});
 Object.defineProperty($('#nw-form input[name=amount_mode][value=auto]'),'checked',{set(on){if(on)state.mode='auto';}});
 const ctx=vm.createContext({$,$$:selector=>selector==='#nw-opts [data-nwopt]'?options:[],NW:{last:null,edit:'MS-TEST',repriceAdjustment:{}},E:engine,D:engine.data(),ADMIN_HOURS:{from:0,to:47},nwMode:()=>state.mode,nwOptions:()=>({}),nwHourOpts:()=>'',esc:String,spaceShort:id=>id,won:n=>n.toLocaleString('ko-KR')+'원'});
 ctx.useSpace=id=>{ctx.E=engine.forSpace(id);ctx.D=ctx.E.data();};
 vm.runInContext(source.slice(source.indexOf('  function nwCalc('),source.indexOf('  function nwModeUi(')),ctx);
 vm.runInContext(source.slice(source.indexOf('  function nwOptions('),source.indexOf('  function nwMode(')),ctx);
 const priceInputStart=source.indexOf('  function nwPriceInput(');
 const handlerStart=priceInputStart>=0?priceInputStart:source.indexOf('  function nwAutoReprice(');
 vm.runInContext(source.slice(handlerStart>=0?handlerStart:source.indexOf("  $('#nw-form').addEventListener('change'"),source.indexOf("  $('#nw-pkgs').addEventListener")),ctx);
 for(const selector of ['#nw-reprice','#nw-pkgs']){const registration=source.split('\n').find(l=>l.startsWith("  $('"+selector+"').addEventListener"));if(registration)vm.runInContext(registration,ctx);}
 ctx.nwCalc();ctx.nwSyncMode();
 return {ctx,$,state,people(n){const target=$('#nw-people');target.value=String(n);target.name='headcount';$('#nw-form').events.input({target});},space(id){const target=$('#nw-space');target.value=id;target.name='space_id';$('#nw-form').events.change({target});},change(selector,name,value,event='change'){const target=$(selector);Object.assign(target,{name,value});$('#nw-form').events[event]({target});},option(id,on){const target=options.find(o=>o.dataset.nwopt===id);target.checked=on;$('#nw-form').events.change({target});}};
}
test('문의 수정에서 200→300명 입력 즉시 자동 계산으로 전환하고 저장 예정 금액을 갱신',()=>{
 const f=inquiryForm();assert.equal(f.state.mode,'keep');f.people(300);
 assert.equal(f.state.mode,'auto');assert.equal(f.ctx.NW.last.people,300);assert.equal(f.ctx.NW.last.total,2959000);assert.match(f.$('#nw-auto').innerHTML,/인원 300명/);
 assert.equal(f.$('#nw-auto').hidden,false);assert.equal(f.$('#nw-keep-reprice').hidden,true);assert.match(f.$('#nw-discount-result').textContent,/2,959,000원/);
});
test('문의 수정에서 호점을 바꾸면 해당 요금표로 자동 계산하며 2호점에서는 300명 유지',()=>{
 const f=inquiryForm();f.$('#nw-people').value='300';f.space('megaspot-gundae');
 assert.equal(f.state.mode,'auto');assert.equal(f.ctx.NW.last.people,200);assert.equal(f.ctx.NW.last.total,2040000);
 f.space('megaspot-gundae-2');assert.equal(f.ctx.NW.last.people,300);assert.equal(f.ctx.NW.last.total,2959000);
});
test('이름·운영 메모만 바꾸면 현재 금액 유지 선택과 저장 금액을 그대로 보존',()=>{
 const f=inquiryForm();
 for(const name of ['name','memo']){const target={name,dataset:{}};f.$('#nw-form').events.input({target});f.$('#nw-form').events.change({target});}
 assert.equal(f.state.mode,'keep');assert.equal(f.$('#nw-total').value,'1959000');
});
test('자동 재계산은 저장된 할인 비율을 새 원금에 적용하고 이후 직접 조정한 할인도 보존',()=>{
 const f=inquiryForm();f.ctx.NW.repriceAdjustment={type:'pct',value:10,reason:'정기 할인'};f.people(300);
 assert.equal(f.$('#nw-disc-type').value,'pct');assert.equal(f.$('#nw-disc-val').value,10);assert.equal(f.$('#nw-disc-why').value,'정기 할인');
 assert.match(f.$('#nw-discount-result').textContent,/2,663,100원/);
 f.$('#nw-disc-val').value='20';f.space('megaspot-gundae');assert.equal(f.$('#nw-disc-val').value,'20');assert.match(f.$('#nw-discount-result').textContent,/1,632,000원/);
});
test('날짜·시작·종료 변경은 현재 금액 유지에서 버튼 없이 자동 계산으로 전환',()=>{
 for(const [selector,name,value,event]of [['#nw-date','date','2026-12-18','input'],['#nw-start','start_h','11','change'],['#nw-end','end_h','20','change']]){
  const f=inquiryForm();const previous=f.ctx.NW.last.total;f.change(selector,name,value,event);
  const q=engine.forSpace('megaspot-gundae-2').quote({adminHours:true,date:f.$('#nw-date').value,start:+f.$('#nw-start').value,end:+f.$('#nw-end').value,people:200});
  assert.equal(f.state.mode,'auto');assert.equal(f.ctx.NW.last.total,q.total);assert.notEqual(q.total,previous);assert.ok(f.$('#nw-discount-result').textContent.includes(q.total.toLocaleString('ko-KR')+'원'));
 }
});
test('청소·인당 옵션 추가와 해제, 매니저 인원·시간 변경은 즉시 자동 재계산',()=>{
 for(const id of ['cleaning','disposable','manager']){
  const f=inquiryForm(),base=f.ctx.NW.last.total;f.option(id,true);assert.equal(f.state.mode,'auto');assert.ok(f.ctx.NW.last.total>base);
  if(id==='manager'){
   f.state.mode='keep';f.change('#nw-opts [data-nwmgr=count]','','2','input');f.change('#nw-opts [data-nwmgr=hours]','','6','input');
   assert.equal(f.state.mode,'auto');assert.equal(f.ctx.NW.last.options.find(o=>o.id==='manager').amount,300000);
  }
  f.option(id,false);assert.equal(f.ctx.NW.last.total,base);
 }
 const f=inquiryForm();const target=f.$('#nw-form').regular;target.checked=true;f.$('#nw-form').events.change({target});assert.equal(f.state.mode,'auto');
});
test('패키지 시간 버튼도 자동 계산으로 전환하고 날짜 변경 후 기존 할인을 유지',()=>{
 const f=inquiryForm();f.ctx.NW.repriceAdjustment={type:'pct',value:10,reason:'기존 할인'};
 const button={dataset:{nwpkg:'day'}};f.$('#nw-pkgs').events.click({target:{closest:()=>button}});
 assert.equal(f.state.mode,'auto');assert.equal(f.ctx.NW.last.pkg.id,'day');assert.equal(f.$('#nw-disc-val').value,10);
 f.change('#nw-date','date','2026-12-18','change');assert.equal(f.ctx.NW.last.pkg.id,'day');assert.equal(f.$('#nw-disc-val').value,10);assert.equal(f.$('#nw-disc-why').value,'기존 할인');
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

test('자동 재계산 수정 저장 후 재조회 금액과 상세 계산 합계·할인·옵션이 일치하고 이름만 다시 저장해도 유지',async t=>{
 const db=fixture();t.after(()=>db.db.close());const f=inquiryForm();
 f.ctx.NW.repriceAdjustment={type:'pct',value:10,reason:'기존 할인'};
 f.change('#nw-date','date','2026-12-18','input');f.people(300);f.option('cleaning',true);f.option('manager',true);
 f.change('#nw-opts [data-nwmgr=count]','','2','input');f.change('#nw-opts [data-nwmgr=hours]','','6','input');
 const q=f.ctx.NW.last,adjusted=f.ctx.nwAdjusted(q.total);let operation,sent;
 f.ctx.M={validate:()=>true,formData:()=>({...db.data,name:'저장 조회 검증',date:f.$('#nw-date').value,start_h:f.$('#nw-start').value,end_h:f.$('#nw-end').value,headcount:f.$('#nw-people').value,space_id:f.$('#nw-space').value,total:f.$('#nw-total').value}),toast(){}};
 f.ctx.spaceOk=id=>id;f.ctx.PUR={};f.ctx.closeDrawer=()=>{};f.ctx.refreshLists=()=>{};f.ctx.openInquiry=()=>{};f.ctx.note=()=>{};f.ctx.guard=()=>false;
 f.$('#nw-form').querySelector=()=>({disabled:false});
 f.ctx.A=(path,opts)=>{sent=opts.body;operation=db.api(path.replace(/^\//,''),opts.method,opts.body);return operation;};
 vm.runInContext(source.slice(source.indexOf("  $('#nw-form').addEventListener('submit'"),source.indexOf('  /* =================== 견적 계산')),f.ctx);
 f.$('#nw-form').events.submit({preventDefault(){},target:f.$('#nw-form')});await operation;
 let stored=await db.api('inquiries/MS-TEST'),view=Calculation.inquiry(stored.item,stored.quotes);
 assert.equal(sent.amount_mode,'auto');assert.equal(stored.item.data.total,adjusted.total);assert.equal(stored.item.headcount,300);assert.equal(stored.item.space_id,'megaspot-gundae-2');
 assert.equal(stored.item.data.price_adjustment.discount,adjusted.discount);assert.match(view.text,/300명/);assert.match(view.text,/2명 × 6시간/);assert.match(view.text,/청소/);
 assert.ok(view.text.includes('합계 '+adjusted.total.toLocaleString('ko-KR')+'원'),'상세의 합계도 할인 후 저장 금액이어야 함');
 assert.ok(view.text.includes(adjusted.discount.toLocaleString('ko-KR')+'원'),'상세에 적용한 할인 내역 표시');
 const original=view.text;f.state.mode='keep';f.$('#nw-form').events.submit({preventDefault(){},target:f.$('#nw-form')});await operation;
 stored=await db.api('inquiries/MS-TEST');assert.equal(stored.item.data.total,adjusted.total);assert.equal(Calculation.inquiry(stored.item,stored.quotes).text,original);
});
