import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import C from '../assets/js/reception-calc.js';
import {receptionAdmin} from '../functions/api/_reception.js';
import {fixture,quoteInput,DAY} from './helpers/admin-fixture.mjs';
import {quoteUi} from './helpers/admin-quote-fixture.mjs';
const code=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');

for(const format of ['table','box'])test(`standalone manual ${format}: remove, save/reopen and restore repeatedly without repricing room, duplicating food or modifying earlier quotes`,async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const config={course:'cf-manual',unit_price:20000,people:31,format,status:'confirmed',menu_ids:['cf-menu-48'],request_note:'알레르기 협의'};
 const initial=receptionAdmin(config),equipment={label:'장비 협의',amount:12345};
 const extras=[{kind:'reception',label:'직접 입력 구성',amount:initial.total,reception:initial},equipment];
 const input=quoteInput({customer:'삭제·재추가 검증',people:31,extras,discType:'won',discVal:50000,discWhy:'기존 협의'});
 await f.api('quotes','POST',{inquiry_ref:'',customer:input.customer,event_date:DAY,total:512345+initial.total,data:{input,date:DAY,range:'10:00–13:00',lines:[{label:'공간료 · 저장 당시 합의',amount:550000}],subtotal:550000,discount:50000,discountLabel:'협의 할인',extras,total:512345+initial.total,deposit:150000,validUntil:DAY}});
 const ui=quoteUi(),ctx=ui.ctx;ctx.go=()=>{};ctx.renderExtras=()=>{};
 const actions={};
 for(const selector of ['#q-extras','#q-reception'])ctx.$(selector).addEventListener=(type,fn)=>actions[selector]=fn;
 vm.runInContext(code.slice(code.indexOf("  $('#q-extras').addEventListener('click'"),code.indexOf("  $('#q-reset').addEventListener")),ctx);
 vm.runInContext(code.slice(code.indexOf("  $('#q-reception').addEventListener('click'"),code.indexOf('  function quoteFromInquiry(')),ctx);
 const start=code.indexOf('  function receptionToQuote(');vm.runInContext(code.slice(start,code.indexOf('  function foodToQuote(',start)),ctx);
 let restoredContext;ctx.window.MEGASPOT_ADMIN={openReception(ref,context){assert.equal(ref,'');restoredContext=JSON.parse(JSON.stringify(context));}};
 const prior=new Map();let current=(await f.api('quotes')).items[0];prior.set(current.quote_no,JSON.stringify(current));
 async function save(){
  const result=await f.api('quotes','POST',JSON.parse(JSON.stringify(ctx.payload()))),recent=(await f.api('quotes')).items;
  for(const [number,snapshot]of prior)assert.equal(JSON.stringify(recent.find(x=>x.quote_no===number)),snapshot);
  const saved=recent.find(x=>x.quote_no===result.quote_no);assert(!prior.has(saved.quote_no));prior.set(saved.quote_no,JSON.stringify(saved));return saved;
 }
 for(let round=0;round<3;round++){
  await ctx.loadSavedQuote(current,'');
  const previous=JSON.parse(JSON.stringify(ctx.Q.extras.find(x=>x.kind==='reception').reception));
  const index=ctx.Q.extras.findIndex(x=>x.kind==='reception');
  actions['#q-extras']({target:{closest(){return {dataset:{exDel:String(index)}};}}});
  let removed=ui.documents();assert.equal(removed.total,512345);assert.equal(ctx.R.sub,550000);assert.equal(ctx.R.disc,50000);
  assert.equal(removed.input.extras.length,1);assert.deepEqual(JSON.parse(JSON.stringify(removed.input.extras[0])),equipment);
  assert.equal(removed.input.receptionExcluded,true);assert(!removed.html.includes('1인 20,000원'));assert(!removed.text.includes(C.won(previous.total)));assert(!removed.html.includes('케이터링 · 직접 입력 구성'));
  if(round>0){current=await save();await ctx.loadSavedQuote(current,'');removed=ui.documents();assert.equal(removed.total,512345);}
  // Use the actual add button callback, including the deleted configuration it restores.
  actions['#q-reception']();const remembered=restoredContext.reception;
  assert.equal(remembered.unit_price,20000);assert.equal(remembered.people,previous.people);assert.equal(remembered.format,previous.format);assert.deepEqual(remembered.menu_ids,previous.menu_ids);
  const next={course:remembered.course,unit_price:remembered.unit_price,people:round===2?51:remembered.people,format:round===2?(remembered.format==='table'?'box':'table'):remembered.format,status:'confirmed',menu_ids:remembered.menu_ids,request_note:remembered.request_note};
  const food=C.selection(next);
  await ctx.receptionToQuote(restoredContext,next,food);
  // Repeatedly pressing Add replaces the one service row, rather than adding a second charge.
  await ctx.receptionToQuote(restoredContext,next,food);
  let added=ui.documents();assert.equal(added.total,512345+food.total);assert.equal(ctx.R.sub,550000);assert.equal(ctx.R.disc,50000);
  assert.equal(added.input.extras.filter(x=>x.kind==='reception').length,1);assert.equal(added.input.receptionExcluded,false);
  assert.deepEqual(JSON.parse(JSON.stringify(added.input.extras.find(x=>x.label==='장비 협의'))),equipment);
  for(const text of [added.html,added.text,C.customerReply(next)]){assert(text.includes('20,000원'));assert(text.includes(food.people+'명'));assert(text.includes(C.won(food.total)));}
  assert.equal((added.html.match(/케이터링 · 직접 입력 구성/g)||[]).length,1);
  current=await save();await ctx.loadSavedQuote(current,'');added=ui.documents();assert.equal(added.total,current.total);assert.equal(added.input.extras.filter(x=>x.kind==='reception').length,1);
 }
 const oldest=(await f.api('quotes')).items.find(x=>x.quote_no===[...prior.keys()][0]);await ctx.loadSavedQuote(oldest,'');const old=ui.documents();assert.equal(old.total,512345+initial.total);assert(old.html.includes(C.won(initial.total)));
});
