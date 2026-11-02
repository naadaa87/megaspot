import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import O from '../assets/js/inquiry-overview.js';
import RC from '../assets/js/reception-calc.js';

const context={window:{}};
vm.runInNewContext(readFileSync(new URL('../assets/js/cocktail-calc.js',import.meta.url),'utf8'),context);
const cocktailNames=context.window.MEGASPOT_COCKTAIL_CALC.names;
const opts={roomAmount:759000,spaceName:'메가스팟 건대 2호',conditions:'2026-11-16 · 13:00 – 17:00 · 80명',cocktailNames};
function all(){return {data:{total:759000,catering:{course:'classic',summary:'클래식 60명 · 생맥주 2통',people:60,beer:2,total:3014000},cocktail:{cups:200,price:1100000,menus:['mojito','blue_sapphire'],nonalcohol:true,note:'민트 적게'},summary:'도시락·핑거푸드 클래식 50명 · 박스 케이터링: 1,850,000원 (메뉴 1,750,000원 + 출장·세팅 비용 100,000원 · 부가세 확인 전)'}};}
test('공간과 세 식음료의 구성·가격을 합산하고 칵테일 상세 요청도 보여 준다',()=>{
 const m=O.build(all(),opts),html=O.render(m);
 assert.equal(m.rows.length,4);assert.equal(m.total,6723000);assert.equal(m.incomplete,true);
 for(const text of ['메가스팟 건대 2호','생맥주 2통','박스 케이터링','50명','모히토, 블루 사파이어','논알코올','민트 적게','6,723,000원'])assert.ok(html.includes(text),text);
 assert.match(html,/계산 가능한 소계/);assert.match(html,/반환 보증금은 합계에서 제외/);
});
test('예전 문의의 케이터링 본문에서도 인원·방식·당시 저장 금액을 복원한다',()=>{
 const d={message:'별도 고객 요청\n\n'+RC.inquiryText(50,'box')};
 const m=O.build({data:d},{...opts,roomAmount:0});assert.equal(m.rows[1].amount,1850000);assert.equal(m.total,1850000);
 assert.match(m.rows[1].detail,/박스 케이터링/);assert.match(m.rows[1].detail,/50명/);
});
test('상담 항목과 금액 미정은 무료로 취급하거나 소계에 더하지 않는다',()=>{
 const m=O.build({data:{catering:{total:0,summary:'코스 미정'},message:'도시락·핑거푸드 케이터링 코스 미정 · 50명 · 박스 케이터링'}},{...opts,roomAmount:null});
 assert.equal(m.hasAmount,false);assert.equal(m.total,0);assert.equal(m.pending.length,3);assert.match(O.render(m),/금액은 미정/);assert.doesNotMatch(O.render(m),/>0원</);
});
test('기존 구성 금액을 현재 운영 금액으로 바꾸면 합계도 바뀌고 0원은 유지된다',()=>{
 const it=all();assert.equal(O.build(it,{...opts,roomAmount:0}).total,5964000);
 assert.equal(O.build(it,{...opts,roomAmount:900000}).total,6864000);assert.equal(it.data.total,759000);
});
test('취소된 출장뷔페는 기록에 남기되 합계에서 제외한다',()=>{
 const it=all();it.data.catering.status='cancelled';const m=O.build(it,opts);
 assert.equal(m.total,3709000);assert.match(O.render(m),/취소 · 합계 제외/);
});
test('식음료 없는 이전 문의도 공간과 예상 합계만 간결하게 표시한다',()=>{
 const m=O.build({data:{}},opts);assert.equal(m.rows.length,1);assert.equal(m.total,759000);assert.equal(m.incomplete,false);assert.match(O.render(m),/선택한 식음료가 없습니다/);
});
test('고객 입력은 HTML로 실행되지 않고 텍스트로 표시된다',()=>{
 const it=all();it.data.cocktail.note='<img src=x onerror=alert(1)>';const html=O.render(O.build(it,opts));
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
});

test('일반 요청 본문의 서비스 언급은 선택한 케이터링으로 오인하지 않는다',()=>{
 const m=O.build({data:{message:'도시락·핑거푸드 케이터링은 원하지 않습니다.'}},opts);assert.equal(m.rows.length,1);
});
