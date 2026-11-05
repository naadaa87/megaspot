import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import Calculation from '../assets/js/quote-calculation.js';
import {fixture,quoteInput} from './helpers/admin-fixture.mjs';
const ctx=vm.createContext({window:{}});
for(const file of ['data/holidays-kr.js','data/pricing-gundae.js','data/pricing-gundae2.js','pricing-engine.js'])vm.runInContext(readFileSync(new URL('../assets/js/'+file,import.meta.url),'utf8'),ctx);
const money=n=>Math.round(n).toLocaleString('ko-KR')+'원';
function calculated(space,{date='2026-11-18',start=13,end=17,people=60,discount=true,extras=[{label:'추가 장비',amount:30000}]}={}){
 const E=ctx.window.MEGASPOT_PRICE.forSpace(space),D=E.data(),input=quoteInput({space,date,start,end,people,discType:discount?'pct':'none',discVal:discount?10:0,extras,opts:{manager:{on:true,count:2,hours:3},cleaning:true}});
 const q=E.quote({date,start,end,people,adminHours:true,options:{manager:{count:2,hours:3},cleaning:true}}),lines=[];
 if(q.pkg)lines.push({label:'공간료 · '+q.pkg.label,desc:q.pkg.time,amount:q.pkg.price});
 else{for(const l of q.time.lines)lines.push({label:'공간료 · '+l.label,desc:E.hourLabel(l.from)+'–'+E.hourLabel(l.to)+' · '+l.hours+'시간 × '+money(l.rate),amount:l.sum});if(q.surcharge)lines.push({label:'기본 인원 가산액',desc:'기준 '+q.peopleBase+'명 포함',amount:q.surcharge});}
 lines.push({label:'인원',desc:q.people+'명 (기준 '+q.peopleBase+'명 포함)',amount:q.peopleFee});
 for(const o of q.options)lines.push({label:o.label,desc:o.qty,amount:o.amount});
 const disc=discount?Math.round(q.total*0.1/100)*100:0,total=q.total-disc+extras.reduce((n,x)=>n+x.amount,0);
 return {inquiry_ref:'MS-TEST',customer:input.customer,event_date:date,total,mark_sent:true,data:{input,space,spaceName:D.spaceName,version:D.version,date,range:q.range,people:q.people,colLabel:q.colLabel,lines,subtotal:q.total,discount:disc,discountLabel:'10% 할인',discountWhy:'재방문 할인',extras,total,deposit:150000,taxNote:D.vatNote}};
}
function seedEstimate(f,{source='admin',text='[메가스팟 건대 1호 예상 금액]\n옛 1호점 시간당 요금\n합계 450,000원'}={}){
 const d={...f.data,source,amount_mode:'auto',estimate:text};f.db.prepare('UPDATE inquiries SET data=? WHERE ref=?').run(JSON.stringify(d),'MS-TEST');return text;
}
test('1호 견적 → 2호 견적 저장 시 문의의 호점·금액·계산 행·할인·추가 금액을 함께 갱신',async t=>{
 const f=fixture();t.after(()=>f.db.close());seedEstimate(f);
 const one=calculated('megaspot-gundae'),two=calculated('megaspot-gundae-2');assert.notEqual(one.total,two.total);
 const first=await f.api('quotes','POST',one),original=f.db.prepare('SELECT data FROM quotes WHERE quote_no=?').get(first.quote_no).data;
 const saved=await f.api('quotes','POST',two),result=await f.api('inquiries/MS-TEST'),d=result.item.data;
 assert.equal(result.item.space_id,'megaspot-gundae-2');assert.equal(result.item.effective_amount,two.total);assert.equal(d.estimate_admin,true);assert.equal(d.estimate_quote_no,saved.quote_no);
 assert.match(d.estimate,/메가스팟 건대 2호/);assert.doesNotMatch(d.estimate,/메가스팟 건대 1호|옛 1호점/);assert.match(d.estimate,/기본 인원 가산액/);
 for(const row of two.data.lines){assert.ok(d.estimate.includes(row.label));assert.ok(d.estimate.includes(money(row.amount)));}
 assert.ok(d.estimate.includes('10% 할인 −'+money(two.data.discount)));assert.ok(d.estimate.includes('추가 장비 30,000원'));assert.ok(d.estimate.includes('합계 '+money(two.total)));
 assert.equal(f.db.prepare('SELECT data FROM quotes WHERE quote_no=?').get(first.quote_no).data,original,'기존 발행 견적 원본 보존');
});
test('2호에서 다시 1호로 바꾼 성수기·심야 패키지도 해당 견적 내역으로 갱신',async t=>{
 const f=fixture();t.after(()=>f.db.close());seedEstimate(f);
 for(const space of ['megaspot-gundae-2','megaspot-gundae']){
  const payload=calculated(space,{date:'2026-12-18',start:18,end:31,people:80});await f.api('quotes','POST',payload);const d=(await f.api('inquiries/MS-TEST')).item.data;
  assert.ok(d.estimate.includes(payload.data.spaceName));assert.ok(d.estimate.includes(payload.data.version));assert.ok(d.estimate.includes(payload.data.range));assert.ok(d.estimate.includes('합계 '+money(payload.total)));
 }
 assert.doesNotMatch((await f.api('inquiries/MS-TEST')).item.data.estimate,/메가스팟 건대 2호/);
});
test('고객 최초 예상 금액은 한 번만 보관하고 최신 관리자 계산과 구분',async t=>{
 const f=fixture();t.after(()=>f.db.close());const original=seedEstimate(f,{source:'web',text:'[고객 원문] 1호점 45만원 예상'});
 for(const space of ['megaspot-gundae-2','megaspot-gundae'])await f.api('quotes','POST',calculated(space));
 const r=await f.api('inquiries/MS-TEST'),view=Calculation.inquiry(r.item,r.quotes);
 assert.equal(r.item.data.estimate_customer,original);assert.equal(view.customerOriginal,original);assert.equal(view.admin,true);assert.equal(view.fromQuote,true);assert.match(view.text,/메가스팟 건대 1호/);
});
test('이미 저장된 2호 견적에 1호 계산 문구가 남아 있어도 상세 화면은 저장된 2호 행을 표시',async t=>{
 const f=fixture();t.after(()=>f.db.close());seedEstimate(f,{source:'web'});await f.api('quotes','POST',calculated('megaspot-gundae-2'));
 const old='[메가스팟 건대 1호 고객 원문]';f.db.prepare("UPDATE inquiries SET data=json_set(data,'$.estimate',?,'$.estimate_admin',json('false')) WHERE ref=?").run(old,'MS-TEST');
 const r=await f.api('inquiries/MS-TEST'),view=Calculation.inquiry(r.item,r.quotes);
 assert.equal(view.fromQuote,true);assert.match(view.text,/메가스팟 건대 2호/);assert.doesNotMatch(view.text,/메가스팟 건대 1호/);assert.ok(view.text.includes('합계 '+money(r.item.effective_amount)));
});
test('상세의 과거 견적 조회는 최신 요금표로 다시 계산하지 않으며 직접 수정 금액을 덮어쓰지 않음',()=>{
 const snapshot=calculated('megaspot-gundae-2').data;snapshot.lines=[{label:'발행 당시 공간료',desc:'과거 단가 유지',amount:123400}];snapshot.total=123400;snapshot.subtotal=123400;snapshot.discount=0;snapshot.extras=[];
 const view=Calculation.inquiry({data:{amount_mode:'quote',quote_no:'Q-OLD'}},[{quote_no:'Q-OLD',data:snapshot}]);assert.match(view.text,/발행 당시 공간료 123,400원/);assert.match(view.text,/합계 123,400원/);
 const manual=Calculation.inquiry({data:{amount_mode:'manual',quote_no:'Q-OLD',estimate:'직접 수정 참고 내역',source:'admin'}},[{quote_no:'Q-OLD',data:snapshot}]);assert.equal(manual.text,'직접 수정 참고 내역');assert.equal(manual.fromQuote,false);
 assert.equal(Calculation.text({lines:[],total:0}), '');
});
test('견적 호점 전환은 선택 옵션·매니저 수량을 보존하면서 옵션 단가·인원 한도를 다시 표시',()=>{
 const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8'),elements={};
 const values={'q-space':'megaspot-gundae-2','q-customer':'검증 고객','q-phone':'01012345678','q-email':'','q-date':'2026-11-18','q-start':'13','q-end':'17','q-people':'300','q-purpose':'','q-regular':false,'q-disc-type':'pct','q-disc-val':'10','q-disc-why':'단골 할인','q-deposit':'150000','q-valid':'1','q-note':'입력 유지'};
 for(const [key,value]of Object.entries(values))elements['#'+key]={value:String(value),checked:!!value};
 elements['#q-opts [data-mgr=count]']={value:'2'};elements['#q-opts [data-mgr=hours]']={value:'6'};
 const checked=[{dataset:{opt:'manager'},checked:true},{dataset:{opt:'cleaning'},checked:true},{dataset:{opt:'banner'},checked:false}];
 const $=selector=>elements[selector]||(elements[selector]={innerHTML:'',textContent:'',value:''});
 const context=vm.createContext({$,$$:selector=>selector==='#q-opts [data-opt]'?checked:[],esc:String,won:money,todayIso:()=> '2026-11-18',spaceOk:id=>id,Q:{space:'megaspot-gundae',quoteNo:'Q-OLD',opts:{manager:{on:false,count:1,hours:4}},extras:[]}});
 context.useSpace=id=>{context.E=ctx.window.MEGASPOT_PRICE.forSpace(id);context.D=context.E.data();};context.useSpace('megaspot-gundae');
 for(const [start,end]of [['  function qSpaceHint(', '  function fillForm('],['  function renderQuoteRates(', '  function renderExtras('],['  function readForm(', '  function compute(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context);
 context.readForm();const two=ctx.window.MEGASPOT_PRICE.forSpace('megaspot-gundae-2').data();
 assert.equal(context.Q.space,'megaspot-gundae-2');assert.equal(context.Q.quoteNo,'');assert.equal(elements['#q-people'].max,350);assert.equal(context.Q.people,300);
 assert.ok(elements['#q-opts'].innerHTML.includes(money(two.options.find(o=>o.id==='cleaning').price)));assert.ok(elements['#q-space-hint'].textContent.includes(two.version));
 assert.equal(context.Q.opts.manager.on,true);assert.equal(context.Q.opts.manager.count,2);assert.equal(context.Q.opts.manager.hours,6);assert.equal(context.Q.opts.cleaning,true);assert.equal(context.Q.note,'입력 유지');
 elements['#q-space'].value='megaspot-gundae';context.readForm();assert.equal(context.Q.space,'megaspot-gundae');assert.equal(elements['#q-people'].max,200);assert.equal(Number(elements['#q-people'].value),200);assert.equal(context.Q.opts.cleaning,true);
});
