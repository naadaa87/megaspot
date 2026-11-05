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
 const prices={'course.cf-light':47000,'course.cf-classic':41000,'course.cf-premium':35000,'course.cf-signature':55000};
 reception.rows=reception.rows.map(row=>({...row,sale_price:prices[row.id]??row.sale_price}));
 const rates={catering:publicFoodPricing(catering),reception:publicFoodPricing(reception)};
 const guide=foodHtml(source('guide/index.html'),'/guide/',rates);
 assert(guide.includes('코스별 1인 가격(50,000원부터, 부가세 별도)'));
 const graph=JSON.parse(guide.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
 const food=graph.find(item=>item['@type']==='FAQPage').mainEntity.find(item=>item.name==='음식과 주류를 가져가도 되나요?');
 assert(food.acceptedAnswer.text.includes('50,000원부터'));
 for(const page of ['guide','catering','reception']){
  const html=foodHtml(source(page+'/index.html'),'/'+page+'/',rates);
  assert(html.includes('맞춤 구성 · 식사·다과·핑거푸드'),page+' navigation');
  assert(!html.includes('@@FOODPRICE'),page+' placeholders');
  assert(!html.includes('25,000원부터'),page+' stale reception minimum');
  if(page==='catering')assert(html.includes('다과·도시락의 1인 예산 선택'),page+' cross-service card');
  if(page==='reception'){
   assert(html.includes('1인 35,000원 · 부가세 별도'),page+' active package price');
   assert(!html.includes('라이트25,000원'),'former supplier package removed');
  }
 }
});

test('public reception copy preserves requested supplier, menu and budget in clipboard and fallback',async()=>{
 for(const clipboardWorks of [true,false]){
  const listeners={},captured=[],fallback=[],windowListeners={},storage=new Map();
  const field=value=>({value,setAttribute(){},addEventListener(){}}),input=field('50'),format=field('table'),course=field('cf-custom'),budget=field(''),note=field('');
  const out={innerHTML:'',appendChild(node){fallback.push(node.textContent);}},map={'#reception-people':input,'#reception-format':format,'#reception-course':course,'#reception-budget':budget,'#reception-note':note,'[data-reception-result]':out,'#cf-form':field(''),'[data-menu-count]':{},'[data-menu-more]':{}};
  const box={querySelectorAll(){return [];},addEventListener(){}};
  const document={getElementById(){return box;},querySelector(s){return map[s];},querySelectorAll(){return [];},addEventListener(t,fn){listeners[t]=fn;},createElement(){return {};}};
  const window={addEventListener(t,fn){windowListeners[t]=fn;},MEGASPOT:{esc:String,copy(text){captured.push(text);return Promise.resolve(clipboardWorks);},toast(){}},MEGASPOT_RECEPTION_CALC:C,MEGASPOT_RECEPTION_CHOICES:{bind(){return {sync(){},load(id){course.value=id;}};}}};
  vm.runInNewContext(source('assets/js/pages/reception.js'),{window,document,URLSearchParams,sessionStorage:{setItem(k,v){storage.set(k,v);},getItem(k){return storage.get(k);}},location:{search:'?reception=cf-classic&reception_people=51&reception_format=box&reception_menus=cf-menu-79&reception_budget=30000'}});
  listeners.click({target:{closest(){return {dataset:{},hasAttribute(n){return n==='data-reception-copy';}};}}});await Promise.resolve();
  const expected=C.requestText({course:'cf-classic',people:51,format:'box',menu_ids:['cf-menu-79'],budget_per_person:30000});assert.equal(captured[0],expected);assert.match(captured[0],/안내해 주세요/);assert.match(captured[0],/훈제연어 카나페/);assert.match(captured[0],/30,000원.*확정 가격 아님/);assert.doesNotMatch(captured[0],/메가스팟입니다|문의하신|안내드립니다/);assert(out.innerHTML.includes('문의 내용 복사'));assert.deepEqual(fallback,clipboardWorks?[]:[expected]);
  for(const [id,fmt,b] of [['cf-classic','box',30000],['cf-budget-20000','fusionbox',20000]]){course.value=id;format.value=fmt;budget.value=b;input.value='51';windowListeners.pagehide();course.value='cf-light';format.value='table';input.value='1';budget.value='';windowListeners.pageshow({persisted:true});assert.equal(course.value,id);assert.equal(format.value,fmt);assert.equal(input.value,51);assert.equal(budget.value,b);assert.match(out.innerHTML,new RegExp(C.won(C.quote(51,fmt,id).total)));}
 }
});
