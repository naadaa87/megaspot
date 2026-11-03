import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture, saveQuote} from './helpers/admin-fixture.mjs';
import C from '../assets/js/reception-calc.js';
import {receptionAdmin} from '../functions/api/_reception.js';
const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
const context=vm.createContext({module:{exports:{}}});vm.runInContext(readFileSync(new URL('../assets/js/inquiry-overview.js',import.meta.url),'utf8'),context);
const overview=context.module.exports;
function state(t,options){const f=fixture(options);t.after(()=>f.db.close());return f;}
function extra(people=50,format='table'){const q=C.quote(people,format);return {kind:'reception',label:'도시락·핑거푸드 케이터링 · 테스트',amount:q.total,reception:{course:'classic',people,format}};}

for(const [people,fee,total] of [[1,200000,235000],[50,200000,1950000],[51,250000,2035000],[100,250000,3750000],[101,300000,3835000]]){
  test(`관리자 저장도 고객용 계산과 동일한 비용: ${people}명`,async t=>{const {api}=state(t);await api('inquiries/MS-TEST','PATCH',{reception:{format:'table',people,fee:1,total:1}});const r=(await api('inquiries/MS-TEST')).item.data.reception;assert.equal(r.fee,fee);assert.equal(r.total,total);assert.equal(r.tax_pending,true);assert.equal(r.total,C.quote(people,'table').total);});
}
test('도시락·박스는 테이블 비용과 섞이지 않음',()=>{for(const format of ['box','lunchbox']){const q=receptionAdmin({people:50,format});assert.equal(q.fee,100000);assert.equal(q.total,1850000);}});
test('저장·조회·고객 안내에 구조화된 테이블 케이터링 금액이 표시됨',async t=>{
  const {api}=state(t);await api('inquiries/MS-TEST','PATCH',{reception:{people:50,format:'table',note:'견과류 제외'}});const it=(await api('inquiries/MS-TEST')).item;
  const model=overview.build(it,{roomAmount:450000});assert.equal(model.rows.filter(x=>x.title==='도시락·핑거푸드 케이터링').length,1);assert.equal(model.total,2400000);assert.match(overview.customerText(model),/1,950,000원/);assert.match(overview.customerText(model),/견과류 제외/);assert.match(overview.customerText(model),/부가세/);
});
test('견적에 넣고 저장해도 식음료를 두 번 더하지 않음',async t=>{
  const {api}=state(t);await saveQuote(api,{total:2450000,extras:[extra()]});const it=(await api('inquiries/MS-TEST')).item;
  assert.equal(it.effective_amount,2450000);assert.equal(it.data.included_reception_amount,1950000);assert.equal(it.data.reception.fee,200000);
  const ctx=vm.createContext({window:{MEGASPOT_INQUIRY_OVERVIEW:overview},cur:{quotes:[]},currentAmount:x=>x.effective_amount,spaceName:()=>'',DEFAULT_SPACE:'megaspot-gundae',kd:x=>x,timeText:()=>'',optText:()=>''});
  vm.runInContext(source.slice(source.indexOf('  function inquiryOverviewModel('),source.indexOf('  function amountSection(')),ctx);
  const model=ctx.inquiryOverviewModel(it,it.data);assert.equal(model.rows[0].amount,500000);assert.equal(model.total,2450000);
});
test('저장 후 인원 변경·취소·복원은 연결 예약 금액에도 한 번씩 반영됨',async t=>{
  const {api}=state(t,{booking:true});await saveQuote(api,{total:2450000,extras:[extra()]});
  for(const [people,status,expected]of [[51,'confirmed',2535000],[51,'cancelled',500000],[50,'pending',2450000]]){await api('inquiries/MS-TEST','PATCH',{reception:{people,format:'table',status}});const it=(await api('inquiries/MS-TEST')).item;assert.equal(it.effective_amount,expected);assert.equal((await api('bookings')).items[0].amount,expected);const room=it.effective_amount-it.data.included_reception_amount;assert.equal(overview.build(it,{roomAmount:room}).total,expected);}
});
test('잘못된 구성·인원·코스는 저장하지 않음',async t=>{const {api}=state(t);for(const reception of [{people:0,format:'table'},{people:301,format:'table'},{people:50,format:'x'},{people:50,format:'table',course:'vip'}])await api('inquiries/MS-TEST','PATCH',{reception},400);assert.equal((await api('inquiries/MS-TEST')).item.data.reception,undefined);});
test('견적 추가 항목의 금액 변조·중복은 거절함',async t=>{const {api}=state(t);for(const extras of [[{...extra(),amount:1}],[extra(),extra()]])await api('quotes','POST',{inquiry_ref:'MS-TEST',total:5000000,data:{extras}},400);assert.equal((await api('inquiries/MS-TEST')).quotes.length,0);});
test('공간 금액 직접 수정 후에는 이전 케이터링 포함액을 차감하지 않음',async t=>{const {api}=state(t);await saveQuote(api,{total:2450000,extras:[extra()]});await api('inquiries/MS-TEST','PATCH',{total:600000});const it=(await api('inquiries/MS-TEST')).item;assert.equal(it.data.included_reception_amount,0);assert.equal(overview.build(it,{roomAmount:it.effective_amount}).total,2550000);});
test('옛 문의 원문이 있어도 저장한 최신 테이블 구성은 한 번만 표시',()=>{const model=overview.build({data:{reception:receptionAdmin({people:50,format:'table'}),message:C.inquiryText(50,'table')}},{roomAmount:500000});assert.equal(model.rows.length,2);assert.equal(model.total,2450000);});
