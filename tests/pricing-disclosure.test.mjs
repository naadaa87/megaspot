import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {PRODUCTS,PRICING_ALL} from '../functions/api/_catalog.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function publicUi(){
 const print={innerHTML:''};
 const document={body:{dataset:{}},getElementById:id=>id==='quote-print'?print:null};
 const escape=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const M={esc:escape,$:()=>null,$$:()=>[],CONFIG:{},fmtNum:n=>Number(n).toLocaleString('ko-KR'),imgSrc:()=>'',tagHtml:()=>''};
 const ctx=vm.createContext({window:{MEGASPOT:M},document,location:{pathname:'/spaces/megaspot-gundae-2/pricing/',search:''},URLSearchParams});
 for(const path of ['quote-policy','data/products','data/spaces','data/pricing-gundae','data/pricing-gundae2','data/holidays-kr','pricing-engine','pricing-ui','cards'])vm.runInContext(read('assets/js/'+path+'.js'),ctx);
 return {M,window:ctx.window,print};
}

test('호점별 대표 가격은 시간당 요금이며 기준 인원과 2호 필수 가산액·총액을 함께 표시한다',()=>{
 const {M,window}=publicUi(),space=window.MEGASPOT_SPACES.find(s=>s.id==='megaspot-gundae-2'),ui=M.pricing.forSpace(space.id);
 const quote=ui.E.quote({date:'2026-11-16',start:7,end:8,people:50});
 assert.equal(quote.total,289000);
 assert.equal(space.price.minTotal,quote.total);
 assert.equal(space.price.minTotal,space.price.from+space.price.surcharge);
 const card=M.spaceCard(space);
 assert.match(card,/시간당 <b>3\.4<\/b>만 원부터/);
 assert.match(card,/기준 인원 <b>50<\/b>명 포함/);
 assert.match(card,/1시간 총 289,000원부터/);
 assert.match(card,/시간당 34,000원 \+ 1건당 기본 인원 가산액 255,000원/);
 const facts={classList:{add(){}},innerHTML:''};ui.R.facts(facts);
 assert.match(facts.innerHTML,/<small>시간당<\/small>3\.4만 원/);assert.match(facts.innerHTML,/기준 인원 50명/);assert.match(facts.innerHTML,/255,000원 별도/);assert.match(facts.innerHTML,/1시간 총 289,000원부터/);
 const one=M.spaceCard(window.MEGASPOT_SPACES.find(s=>s.id==='megaspot-gundae'));
 assert.match(one,/시간당 <b>4<\/b>만 원부터/);
 assert.match(one,/기준 인원 <b>20<\/b>명 포함/);
 for(const page of ['spaces/megaspot-gundae-2/index.html','spaces/megaspot-gundae-2/pricing/index.html']){
  const html=read(page),graphs=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  const venue=graphs.flatMap(x=>x['@graph']||[x]).find(x=>x['@id']==='https://megaspot.kr/spaces/megaspot-gundae-2/#venue');
  const offer=venue.makesOffer.find(x=>x.name.startsWith('1시간 공간료'));
  assert.equal(Number(offer.price),quote.total,page);assert.match(offer.description,/255,000원/);assert.match(venue.priceRange,/289,000/);
  assert(!html.includes('기준 50명 포함 시간당 3만 4천 원부터'),page);
 }
 const home=read('index.html').match(/<article class="home-venue-card" id="gundae2">[\s\S]*?<\/article>/)[0];
 assert.match(home,/<strong>시간당 3만 4천 원부터<\/strong>/);assert.match(home,/기준 인원 50명/);assert.match(home,/1시간 총 289,000원부터/);assert.match(home,/255,000원/);
 const homeOne=read('index.html').match(/<article class="home-venue-card" id="gundae">[\s\S]*?<\/article>/)[0];
 assert.match(homeOne,/<strong>시간당 4만 원부터<\/strong>/);assert.match(homeOne,/기준 인원 20명/);
});

test('2호 주차는 무료 시설 목록과 견적서에서 분리되어 유료로 안내된다',()=>{
 const {M,print}=publicUi(),ui=M.pricing.forSpace('megaspot-gundae-2');
 assert(!ui.D.included.some(x=>/주차/.test(x.label)));
 const included={innerHTML:''};ui.R.included(included);
 assert(!/<div class="inc[^>]*">[^<]*주차/.test(included.innerHTML));
 assert.match(included.innerHTML,/건물 주차 최대 140대 · 유료/);assert.match(included.innerHTML,/href="\/parking\/"/);
 ui.renderQuoteSheet(ui.E.quote({date:'2026-11-16',start:7,end:8,people:50}),'');
 const free=print.innerHTML.match(/<h3>기본 제공 \(무료\)<\/h3>([\s\S]*?)<h3>유료 시설<\/h3>/)[1];
 assert(!free.includes('주차'));assert.match(print.innerHTML,/<h3>유료 시설<\/h3>[\s\S]*주차 최대/);
});

test('제작 예외는 2시간 전액 환불을 유지하고 제작 상품에만 적용하며 정적 정책과 일치한다',()=>{
 const {window}=publicUi(),P=window.MEGASPOT_PRODUCTS;
 assert.match(P.exchange.lines[1],/제작 상품에도 먼저 적용/);
 assert.match(P.exchange.productionNote,/결제 후 2시간 이내에는 제작 상품도 전액 환불/);
 assert.match(P.exchange.productionNote,/해당 제작 상품만/);
 const pages=['products/index.html',...readdirSync(new URL('../products/',import.meta.url),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>'products/'+x.name+'/index.html')];
 for(const page of pages){const html=read(page);for(const line of P.delivery.lines.concat(P.exchange.lines))assert(html.includes(line),page+' missing policy: '+line);assert(!html.includes('제작에 들어간 뒤(이용일 5일 전 이후)'),page);}
 assert.match(read('terms/index.html'),/결제 후 2시간 이내 전액 환불 기준은 제작 상품에도 먼저 적용/);
});

test('서버 카탈로그는 변경한 표시 조건과 동일하고 실제 상품·공간 가격을 보존한다',()=>{
 const {window}=publicUi();
 assert.equal(JSON.stringify(PRODUCTS),JSON.stringify(window.MEGASPOT_PRODUCTS));
 assert.equal(JSON.stringify(PRICING_ALL),JSON.stringify(window.MEGASPOT_PRICING));
 assert.equal(PRODUCTS.get('addon-banner').price,120000);assert.equal(PRODUCTS.get('addon-xbanner').price,70000);
 assert.equal(PRICING_ALL['megaspot-gundae-2'].surcharge.amount,255000);
 assert.equal(PRICING_ALL['megaspot-gundae-2'].hourly.wd.morning,34000);
});

test('옵션 5종은 본문·검색·공유·구조화 데이터·RSS에서 주문번호와 별도 공간 예약을 안내한다',()=>{
 const {window}=publicUi(),P=window.MEGASPOT_PRODUCTS,rss=read('rss.xml');
 assert.match(P.delivery.lines[0],/옵션 단독 구매는 주문번호가 발급되며 새 공간 예약은 생성되지 않습니다/);
 for(const product of P.items.filter(x=>x.kind==='addon')){
  const html=read('products/'+product.id+'/index.html'),data=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const schema=data['@graph'].find(x=>x['@type']==='Product');
  for(const description of [...html.matchAll(/<meta (?:name="description"|property="og:description"|name="twitter:description") content="([^"]*)"/g)].map(x=>x[1]).concat(data['@graph'].filter(x=>x.description).map(x=>x.description))){
   assert.match(description,/옵션 단독 결제는 주문번호가 발급되며 새 공간 예약은 생성되지 않습니다/,product.id);
   assert(!description.includes('예약번호가 바로 발급'),product.id);
  }
  assert(!html.includes('결제가 끝나면 예약번호가 바로 발급'),product.id);assert.equal(Number(schema.offers.price),product.price);
  const item=[...rss.matchAll(/<item>[\s\S]*?<\/item>/g)].map(x=>x[0]).find(x=>x.includes('https://megaspot.kr/products/'+product.id+'/'));
  assert.match(item,/옵션 단독 결제는 주문번호가 발급/);assert(!item.includes('예약번호가 바로 발급'));
  if(['banner','xbanner'].includes(product.opt))assert(schema.offers.hasMerchantReturnPolicy.description.includes(P.exchange.productionNote));
 }
});
