import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,quoteInput,saveQuote} from './helpers/admin-fixture.mjs';
import {quoteUi} from './helpers/admin-quote-fixture.mjs';
function editedInput(ui,{percent=10}={}){
 const E=ui.ctx.E0.forSpace('megaspot-gundae-2'),date='2026-12-18',q=E.quote({date,start:10,end:17,people:300,adminHours:true,options:{cleaning:true,manager:{count:2,hours:6}}});
 const discount=Math.round(q.total*percent/100);
 return {edit:true,name:'문서 검증 고객',phone:'',space_id:'megaspot-gundae-2',date,start_h:10,end_h:17,headcount:300,purpose:'party',options:{cleaning:true,manager:{count:2,hours:6}},amount_mode:'auto',total:q.total-discount,price_adjustment:{type:'pct',value:percent,reason:'기존 할인',discount,base_total:q.total,total:q.total-discount},estimate:E.summaryText(q,'단체 파티·기념행사',{type:'pct',value:percent,reason:'기존 할인',discount,base_total:q.total,total:q.total-discount})};
}
test('문의 수정 저장 → 최신 문의 견적의 PDF 출력 양식과 고객 안내문에 조건·옵션·할인·총액 반영',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=quoteUi(),input=editedInput(ui);await f.api('inquiries/MS-TEST','PATCH',input);const r=await f.api('inquiries/MS-TEST');ui.open(r.item,r.quotes);const doc=ui.documents();
 assert.equal(doc.total,input.total);for(const expected of ['메가스팟 건대 2호','300명','기존 할인',input.total.toLocaleString('ko-KR')+'원','뒷정리·청소 지원','현장 매니저']){assert.ok(doc.html.includes(expected),expected);assert.ok(doc.text.includes(expected),expected);}
 assert.match(doc.html,/2026년 12월 18일/);assert.match(doc.html,/10:00.*17:00/);assert.match(doc.html,/2명 × 6시간/);
});
test('원의 자리까지 적용된 문의 할인 금액이 PDF·안내문으로 이동해도 달라지지 않음',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=quoteUi(),input=editedInput(ui,{percent:17.3});await f.api('inquiries/MS-TEST','PATCH',input);const r=await f.api('inquiries/MS-TEST');ui.open(r.item,r.quotes);assert.equal(ui.documents().total,input.total);
});
test('문의에서 직접 확정한 금액도 최신 조건의 PDF·고객 안내문에서 유지',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=quoteUi(),input=editedInput(ui);await f.api('inquiries/MS-TEST','PATCH',input);await f.api('inquiries/MS-TEST','PATCH',{total:900000});const r=await f.api('inquiries/MS-TEST');ui.open(r.item,r.quotes);const doc=ui.documents();assert.equal(doc.total,900000);assert.match(doc.text,/합계 900,000원/);assert.match(doc.html,/300명/);
});
test('수정 전 저장 견적을 열면 변경을 알리고 최신 문의로 문서를 만들며 기존 발행 원본은 보존',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=quoteUi();await saveQuote(f.api,{input:quoteInput()});const before=await f.api('inquiries/MS-TEST'),old=before.quotes[0],original=JSON.stringify(old.data);
 const input=editedInput(ui);await f.api('inquiries/MS-TEST','PATCH',input);const current=await f.api('inquiries/MS-TEST');await ui.saved(old,current.item);const doc=ui.documents();assert.equal(doc.total,input.total);assert.equal(doc.input.people,300);assert.ok(ui.messages.some(x=>/변경/.test(x)));assert.equal(JSON.stringify((await f.api('inquiries/MS-TEST')).quotes[0].data),original);
});
test('수동 협의 금액·할인·옵션을 견적으로 저장하고 다시 열어도 동일',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ui=quoteUi(),input={...editedInput(ui),amount_mode:'manual',total:900000,price_adjustment:{type:'pct',value:10,reason:'협의 할인',base_total:1000000,discount:100000,total:900000}};
 await f.api('inquiries/MS-TEST','PATCH',input);let r=await f.api('inquiries/MS-TEST');ui.open(r.item,r.quotes);let doc=ui.documents();assert.equal(doc.total,900000);assert.match(doc.html,/공간 이용료 \(협의 금액\)/);assert.match(doc.text,/현장 매니저.*2명 × 6시간.*협의 금액에 포함/);assert.match(doc.text,/10% 할인\(협의 할인\) -100,000원/);
 ui.ctx.invalidateQuote(false);assert.equal(ui.documents().total,900000);ui.ctx.invalidateQuote(true);assert.equal(ui.documents().total,900000);
 await f.api('quotes','POST',ui.ctx.payload());r=await f.api('inquiries/MS-TEST');const reopened=quoteUi();await reopened.saved(r.quotes[0],r.item);assert.equal(reopened.documents().total,900000);assert.equal(reopened.ctx.quoteHistorical,false);
 reopened.ctx.invalidateQuote(true,true);assert.equal(reopened.ctx.Q.roomAgreement,undefined);assert.notEqual(reopened.documents().total,900000);
});
test('자동 계산으로 수정하면 이전 견적의 임의 추가 항목과 할인은 다시 붙지 않음',async t=>{
 const f=fixture();t.after(()=>f.db.close());await saveQuote(f.api,{input:quoteInput({extras:[{label:'이전 협의 추가',amount:123000}]})});const ui=quoteUi(),input={...editedInput(ui),price_adjustment:null};input.total=ui.ctx.E0.forSpace(input.space_id).quote({date:input.date,start:10,end:17,people:300,adminHours:true,options:input.options}).total;await f.api('inquiries/MS-TEST','PATCH',input);const r=await f.api('inquiries/MS-TEST');ui.open(r.item,r.quotes);const doc=ui.documents();assert.equal(doc.total,input.total);assert.doesNotMatch(doc.text,/이전 협의 추가|10% 할인/);
});
for(const [field,value]of [['date','2026-12-19'],['start_h',11],['end_h',18],['headcount',301],['space_id','megaspot-gundae-2'],['options',{cleaning:true}]])test(`총액이 같아도 문의 ${field} 변경은 예전 견적에서 감지`,async t=>{
 const f=fixture();t.after(()=>f.db.close());await saveQuote(f.api);const before=await f.api('inquiries/MS-TEST'),old=before.quotes[0];const input={edit:true,...before.item.data,[field]:value,amount_mode:'manual',total:old.total};await f.api('inquiries/MS-TEST','PATCH',input);const r=await f.api('inquiries/MS-TEST'),ui=quoteUi();await ui.saved(old,r.item);assert.ok(ui.messages.some(x=>/변경/.test(x)));assert.equal(ui.documents().total,old.total);
 const original=ui.elements['#q-msg'].child;await original.onclick();assert.equal(ui.ctx.quoteHistorical,true);const doc=ui.documents();assert.equal(doc.total,old.total);assert.match(doc.html,/변경 전 견적 원본/);assert.match(doc.text,/변경 전 견적 원본/);
});
