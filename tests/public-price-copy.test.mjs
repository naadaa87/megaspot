import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readFoodPricing,publicFoodPricing} from '../functions/api/_food_pricing.js';
import {foodHtml} from '../functions/api/_food_html.js';
import C from '../assets/js/reception-calc.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('changed selling prices reach shared FAQ, structured FAQ and cross-service recommendations',async()=>{
 const catering=await readFoodPricing(null,'catering'),reception=await readFoodPricing(null,'reception');
 catering.rows=catering.rows.map(row=>({...row,sale_price:row.sale_price+10000}));
 // The new minimum comes from premium, and equals classic's old price.
 // A second numeric substitution must not turn this minimum into 41,000.
 const prices={'course.light':47000,'course.classic':41000,'course.premium':35000,'course.signature':56000};
 reception.rows=reception.rows.map(row=>({...row,sale_price:prices[row.id]??row.sale_price}));
 const rates={catering:publicFoodPricing(catering),reception:publicFoodPricing(reception)};
 const guide=foodHtml(source('guide/index.html'),'/guide/',rates);
 assert(guide.includes('코스별 1인 가격(45,000원부터, 부가세 별도)'));
 const graph=JSON.parse(guide.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
 const food=graph.find(item=>item['@type']==='FAQPage').mainEntity.find(item=>item.name==='음식과 주류를 가져가도 되나요?');
 assert(food.acceptedAnswer.text.includes('45,000원부터'));
 for(const page of ['guide','catering','reception']){
  const html=foodHtml(source(page+'/index.html'),'/'+page+'/',rates);
  assert(html.includes('35,000원부터 · 핑거푸드·파티'),page+' navigation');
  assert(!html.includes('@@FOODPRICE'),page+' placeholders');
  assert(!html.includes('25,000원부터'),page+' stale reception minimum');
  if(page==='catering')assert(html.includes('출장 케이터링. 35,000원부터'),page+' cross-service card');
  if(page==='reception'){
   assert(html.includes('<span><b>35,000</b>원부터'),page+' hero minimum');
   assert(html.includes('빌라 엠 비앙코</span><b>35,000원</b>'),'unrelated drinks price');
  }
 }
});

test('public reception copy uses the customer request voice for both clipboard and fallback',async()=>{
 for(const clipboardWorks of [true,false]){
  const listeners={},captured=[],fallback=[];
  const input={value:'50',setAttribute(){},addEventListener(){}},format={value:'table',setAttribute(){},addEventListener(){}},course={value:'classic',addEventListener(){}};
  const out={innerHTML:'',appendChild(node){fallback.push(node.textContent);}},menu={};
  const box={querySelector(selector){return {'[name=reception_people]':input,'[name=reception_format]':format,'[name=reception_course]':course,'[data-reception-result]':out,'[data-reception-menu]':menu}[selector];},querySelectorAll(){return [];},addEventListener(type,fn){listeners[type]=fn;}};
  const document={getElementById(){return box;},querySelectorAll(){return [];},createElement(){return {};}};
  const window={MEGASPOT:{esc:String,copy(text){captured.push(text);return Promise.resolve(clipboardWorks);},toast(){}},MEGASPOT_RECEPTION_CALC:C};
  vm.runInNewContext(source('assets/js/pages/reception.js'),{window,document,URLSearchParams,location:{search:'?reception=premium&reception_people=51&reception_format=box'}});
  listeners.click({target:{closest(selector){return selector==='[data-reception-copy]'?{}:null;}}});
  await Promise.resolve();
  const expected=C.inquiryText(51,'box','premium');
  assert.equal(captured[0],expected);
  assert.match(captured[0],/안내해 주세요/);
  assert.doesNotMatch(captured[0],/메가스팟입니다|문의하신|안내드립니다/);
  assert(out.innerHTML.includes('문의 내용 복사'));
  assert.deepEqual(fallback,clipboardWorks?[]:[expected]);
 }
});
