import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
function bookingForm(){
  const pricing=vm.createContext({window:{}});
  for(const file of ['data/holidays-kr.js','data/pricing-gundae.js','data/pricing-gundae2.js','pricing-engine.js'])
    vm.runInContext(readFileSync(new URL('../assets/js/'+file,import.meta.url),'utf8'),pricing);
  const engine=pricing.window.MEGASPOT_PRICE,elements={};
  function element(){return {value:'',innerHTML:'',connected:true,events:{},classList:{toggle(){}},addEventListener(type,fn){this.events[type]=fn;}};}
  function $(selector){
    if(elements[selector])return elements[selector];
    const el=elements[selector]=element();
    if(selector==='#bk-amount-hint'){
      let html='';Object.defineProperty(el,'innerHTML',{get(){return html;},set(value){
        html=value;const old=elements['#bk-use-calc'];if(old)old.connected=false;
        if(value.includes('bk-use-calc'))elements['#bk-use-calc']=element();
      }});
    }
    return el;
  }
  for(const [id,value] of Object.entries({'bk-space':'megaspot-gundae-2','bk-start':'13','bk-end':'17','bk-date':'2026-11-18','bk-people':'200'}))$('#'+id).value=value;
  const ctx=vm.createContext({$,esc:String,ADMIN_HOURS:{from:0,to:47},E:engine,D:engine.data(),nwHourOpts:()=>'',won:n=>n.toLocaleString('ko-KR')+'원'});
  ctx.useSpace=id=>{ctx.E=engine.forSpace(id);ctx.D=ctx.E.data();};
  vm.runInContext(source.slice(source.indexOf('  function bkTimes('),source.indexOf('  function settlementSummary(')),ctx);
  return {ctx,$,engine,input(people){$('#bk-people').value=String(people);const handler=$('#bk-people').events.input;assert.equal(typeof handler,'function','인원 입력 중에도 재계산해야 함');handler();},hint(){return $('#bk-amount-hint').innerHTML;},apply(){const target=$('#bk-use-calc');assert.equal(typeof target.events.click,'function');/* 포인터 클릭은 입력칸 blur/change 뒤에 전달됩니다. */$('#bk-people').events.change?.();if(target.connected)target.events.click();return $('#bk-amount').value;}};
}
test('2호점 200명 → 300명 입력 즉시 금액을 갱신하고 넣기도 300명 금액을 적용',()=>{
  const f=bookingForm(),old=f.hint();assert.match(old,/1,959,000원/);
  f.input(300);assert.match(f.hint(),/2,959,000원/);assert.match(f.hint(),/300명 기준/);assert.notEqual(f.hint(),old);assert.equal(f.apply(),2959000);
});
test('2호점 201·250·300·350명은 각 인원 요금으로 계산하고 다른 화면의 1호점 계산기 상태를 사용하지 않음',()=>{
  const f=bookingForm();
  for(const date of ['2026-11-18','2026-12-18'])for(const people of [201,250,300,350]){
    f.$('#bk-date').value=date;f.ctx.useSpace('megaspot-gundae');f.input(people);
    const expected=f.engine.forSpace('megaspot-gundae-2').quote({date,start:13,end:17,people,adminHours:true});
    assert.equal(expected.people,people);assert.match(f.hint(),new RegExp(people+'명 기준'));assert.equal(f.apply(),expected.total);
  }
});
test('1호점으로 바꾸면 200명 한도로, 다시 2호점이면 300명으로 계산',()=>{
  const f=bookingForm();f.input(300);
  f.$('#bk-space').value='megaspot-gundae';f.$('#bk-space').events.change.call(f.$('#bk-space'));
  const one=f.engine.quote({date:'2026-11-18',start:13,end:17,people:300,adminHours:true});
  assert.equal(one.people,200);assert.match(f.hint(),/200명 기준/);assert.equal(f.apply(),one.total);
  f.$('#bk-space').value='megaspot-gundae-2';f.$('#bk-space').events.change.call(f.$('#bk-space'));
  assert.match(f.hint(),/300명 기준/);assert.equal(f.apply(),2959000);
});
