import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import C from '../assets/js/reception-calc.js';
import {receptionAdmin} from '../functions/api/_reception.js';
import {fixture,quoteInput,DAY} from './helpers/admin-fixture.mjs';
import {quoteUi} from './helpers/admin-quote-fixture.mjs';

test('a saved standalone 20,000-won quote can repeatedly change actual headcount and table/box, preserving all previous snapshots and matching customer copy and PDF output',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const config={course:'cf-manual',unit_price:17000,people:31,format:'table',status:'confirmed',menu_ids:['cf-menu-48'],request_note:'협의 메뉴 유지'};
 const first=receptionAdmin(config),extras=[{kind:'reception',label:'직접 입력 구성',amount:first.total,reception:first},{label:'장비 협의',amount:12345}];
 const input=quoteInput({customer:'단독 인원·방식 변경 검증',people:31,extras,discType:'won',discVal:50000,discWhy:'기존 협의'});
 await f.api('quotes','POST',{inquiry_ref:'',customer:input.customer,event_date:DAY,total:512345+first.total,data:{input,date:DAY,range:'10:00–13:00',lines:[{label:'저장 당시 공간료',amount:550000}],subtotal:550000,discount:50000,discountLabel:'협의 할인',extras,total:512345+first.total,deposit:150000,validUntil:DAY}});
 const ui=quoteUi(),ctx=ui.ctx;ctx.go=()=>{};
 const code=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8'),start=code.indexOf('  function receptionToQuote(');
 vm.runInContext(code.slice(start,code.indexOf('  function foodToQuote(',start)),ctx);
 const original=(await f.api('quotes')).items[0],prior=new Map([[original.quote_no,JSON.stringify(original)]]);
 let current=original;
 const cases=[[31,'table',250000],[30,'table',200000],[30,'box',30000],[31,'box',30000],[31,'table',250000],[50,'table',250000],[51,'table',300000],[51,'box',30000],[100,'table',300000],[101,'table',350000],[101,'box',30000],[300,'table',500000],[301,'table',550000],[301,'box',30000],[31,'table',250000]];
 for(const [people,format,fee] of cases){
  // Reopen the previous saved record, as the Recent Quotes button does.
  await ctx.loadSavedQuote(current,'');
  const previousFood=ctx.Q.extras.find(x=>x.kind==='reception').reception;
  const next={course:previousFood.course,unit_price:20000,people,format,status:previousFood.status,menu_ids:previousFood.menu_ids,request_note:previousFood.request_note,note:previousFood.note};
  const value=C.selection(next),server=receptionAdmin(next),expectedFood=20000*people,supply=expectedFood+fee,vat=Math.round(supply/10),total=supply+vat;
  assert.equal(value.total,total);assert.equal(server.total,total);assert.equal(value.fee,fee);assert.equal(value.unit_price,20000);
  await ctx.receptionToQuote({ref:'',customer:input.customer,space:input.space,date:DAY},next,value);
  let docs=ui.documents();
  assert.equal(docs.total,512345+total);assert.equal(ctx.R.sub,550000);assert.equal(ctx.R.disc,50000);assert.equal(ctx.Q.people,31,'room headcount is preserved independently from catering headcount');
  const foodRows=docs.input.extras.filter(x=>x.kind==='reception');assert.equal(foodRows.length,1);assert.equal(foodRows[0].amount,total);
  for(const text of [C.customerReply(next),docs.text,docs.html]){
   for(const amount of [20000,expectedFood,supply,vat,total])assert(text.includes(C.won(amount)),`${people}/${format}: ${amount}`);
   assert(text.includes(people+'명'));assert(text.includes(C.formatLabel(format)));
  }
  const feeName=format==='table'?'출장세팅비':'배송비';
  assert(foodRows[0].label.includes('('+feeName+'·부가세 포함)'));assert(!docs.text.includes('(세팅비·부가세 포함)'));assert(docs.text.includes(feeName+': '+C.won(fee)));assert(docs.html.includes(feeName+' '+C.won(fee)));
  assert.equal((docs.html.match(new RegExp(feeName+' '+C.won(fee),'g'))||[]).length,1);
  assert(!docs.text.includes('1인 17,000원'));
  const savedResult=await f.api('quotes','POST',JSON.parse(JSON.stringify(ctx.payload())));
  const recent=(await f.api('quotes')).items;
  for(const [number,snapshot] of prior)assert.equal(JSON.stringify(recent.find(x=>x.quote_no===number)),snapshot,number+' unchanged');
  current=recent.find(x=>x.quote_no===savedResult.quote_no);assert(!prior.has(current.quote_no));prior.set(current.quote_no,JSON.stringify(current));
  assert.equal(current.inquiry_ref||'','');assert.equal(current.total,512345+total);
  await ctx.loadSavedQuote(current,'');docs=ui.documents();
  assert.equal(docs.total,current.total);const stored=docs.input.extras.find(x=>x.kind==='reception').reception;
  for(const [key,want] of Object.entries({unit_price:20000,people,format,fee,supply,vat,total}))assert.equal(stored[key],want);
 }
 await ctx.loadSavedQuote((await f.api('quotes')).items.find(x=>x.quote_no===original.quote_no),'');
 const old=ui.documents();assert.equal(old.total,512345+first.total);assert(old.html.includes('1인 17,000원'));assert(old.text.includes('1인 17,000원'));
});


test('an existing saved box quote uses the correct delivery label in copied guidance without mutating the original stored text',async()=>{
 const ui=quoteUi(),ctx=ui.ctx;
 const config={course:'cf-manual',unit_price:20000,people:51,format:'box',status:'confirmed'};
 const rec=receptionAdmin(config),label='도시락·핑거푸드 케이터링 · 박스 케이터링 직접 입력 구성 51명 (세팅비·부가세 포함)';
 const extra={kind:'reception',label,amount:rec.total,reception:rec};
 ctx.Q=Object.assign(ctx.blankQ(),{date:DAY,extras:[extra]});
 const before=JSON.stringify(ctx.Q.extras),text=ui.documents().text;
 assert(text.includes('(배송비·부가세 포함)'));assert(!text.includes('(세팅비·부가세 포함)'));assert(text.includes('배송비: 30,000원'));assert.equal(JSON.stringify(ctx.Q.extras),before);
});
