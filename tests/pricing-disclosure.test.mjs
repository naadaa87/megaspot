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

test('두 호점은 50명을 포함하고 시간 단가와 기본료를 함께 표시한다',()=>{
 const {M,window}=publicUi();
 for(const id of ['megaspot-gundae','megaspot-gundae-2']){
  const space=window.MEGASPOT_SPACES.find(s=>s.id===id),ui=M.pricing.forSpace(id);
  const quote=ui.E.quote({date:'2026-11-23',start:7,end:8,people:50});
  assert.equal(quote.total,340000);
  assert.equal(space.price.from,quote.time.fee);
  assert.equal(space.price.minTotal,quote.total);
  assert.equal(quote.surcharge,300000);
  assert.equal(quote.peopleBase,50);
  const card=M.spaceCard(space);
  assert.match(card,/시간당 <b>4<\/b>만 원부터/);
  assert.match(card,/기준 인원 <b>50<\/b>명 포함/);
  assert.match(card,/1건당 기본료 300,000원.*1시간 총 340,000원/);
  const facts={classList:{add(){}},innerHTML:''};ui.R.facts(facts);
  assert.match(facts.innerHTML,/<small>시간당<\/small>4만 원/);
  assert.match(facts.innerHTML,/기준 인원 50명.*1건당 기본료 300,000원.*1시간 총 340,000원/);
  for(const page of ['spaces/'+id+'/index.html','spaces/'+id+'/pricing/index.html']){
   const html=read(page),graphs=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
   const venue=graphs.flatMap(x=>x['@graph']||[x]).find(x=>x['@id']==='https://megaspot.kr/spaces/'+id+'/#venue');
   assert.match(venue.priceRange,/340,000/);
   for(const offer of venue.makesOffer||[]){
    if(offer.name.startsWith('1시간 공간료'))assert.equal(Number(offer.price),quote.total,page);
   }
   assert.doesNotMatch(html,/3만 4천 원부터|289,000원|255,000원/,page);
  }
 }
 const home=read('index.html');
 for(const id of ['gundae','gundae2']){
  const card=home.match(new RegExp('<article class="home-venue-card" id="'+id+'">[\\s\\S]*?<\/article>'))[0];
  assert.match(card,/<strong>1시간 총 34만 원부터<\/strong>/);
  assert.match(card,/기준 인원 50명/);
 }
});

test('일반 시간제 기본료를 한 번 부과하고 별도 종일 대관은 양 호점 모두 행사 요금표와 일치한다',()=>{
 const {M}=publicUi();
 const dayRates=[
  ['2026-12-07',2260000],['2026-12-04',2700000],['2026-12-05',4800000],['2026-12-06',3480000],
  ['2027-01-04',2180000],['2027-01-08',2500000],['2027-01-02',3850000],['2027-01-03',3150000],
  ['2027-02-01',2100000],['2027-02-19',2300000],['2027-02-20',2900000],['2027-02-21',2650000],
 ];
 for(const id of ['megaspot-gundae','megaspot-gundae-2']){
  const {D,E,R}=M.pricing.forSpace(id);
  const quote=(date,start,end,people,packageId)=>E.quote({date,start,end,people,packageId});
  assert.equal(quote('2026-11-23',7,10,50).total,420000);
  assert.equal(quote('2026-11-23',7,10,51).total,430000);
  assert.equal(quote('2026-12-05',7,10,50).surcharge,600000);
  assert.equal(quote('2026-11-23',10,17,50).total,600000);
  for(const [date,total] of dayRates){
   const promo=quote(date,0,24,150,'full-day');
   assert.equal(promo.total,total,date+' '+id);
   assert.equal(promo.pkg.label,'종일 대관');assert.equal(promo.start,0);assert.equal(promo.end,24);assert.equal(promo.hours,24);
   assert.equal(quote(date,0,24,200,'full-day').total,total+500000,date+' '+id);
   assert.equal(quote(date,10,24,150).pkg.id,'allday');
   assert.equal(quote(date,10,24,150,'full-day').pkg.id,'allday');
   assert.notEqual(quote(date,0,24,150).pkg?.id,'full-day');
   assert.notEqual(quote(date,null,24,150,'full-day').pkg?.id,'full-day');
  }
  for(const date of ['2026-12-24','2026-12-25','2026-12-31','2027-01-01'])
   assert.equal(quote(date,10,24,150).peak.id,D.peak.dates[date]);
  for(const date of ['2026-11-30','2026-12-24','2026-12-25','2026-12-31','2027-01-01','2027-02-05','2027-02-06','2027-03-02']){
   assert.equal(E.pkgPrice(E.dayInfo(date),'full-day'),null,date);
   assert.notEqual(quote(date,0,24,150,'full-day').pkg?.id,'full-day');
  }
  if(E.todayIso()<='2027-02-28'){
   const box={innerHTML:''};R['all-day-offer'](box);
   assert.match(box.innerHTML,/종일 대관 할인가/);
   assert.match(box.innerHTML,/기준 50명 포함/);
   assert.match(box.innerHTML,/00:00–24:00/);
   assert.match(box.innerHTML,/pkg=full-day/);
   for(const total of dayRates.flatMap(([,x])=>[x,x+500000]))
    assert.ok(box.innerHTML.includes(total.toLocaleString('ko-KR')+'원'),String(total));
  }
 }
});

test('2호 주차는 무료 시설 목록과 견적서에서 분리되어 유료로 안내된다',()=>{
 const {M,print}=publicUi(),ui=M.pricing.forSpace('megaspot-gundae-2');
 assert(!ui.D.included.some(x=>/주차/.test(x.label)));
 const included={innerHTML:''};ui.R.included(included);
 assert(!/<div class="inc[^>]*">[^<]*주차/.test(included.innerHTML));
 assert.match(included.innerHTML,/건물 주차 120여 대 · 유료/);assert.match(included.innerHTML,/href="\/parking\/"/);
 ui.renderQuoteSheet(ui.E.quote({date:'2026-11-16',start:7,end:8,people:50}),'');
 const free=print.innerHTML.match(/<h3>기본 제공 \(무료\)<\/h3>([\s\S]*?)<h3>유료 시설<\/h3>/)[1];
 assert(!free.includes('주차'));assert.match(print.innerHTML,/<h3>유료 시설<\/h3>[\s\S]*건물 주차 120여 대/);
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

test('서버 카탈로그는 두 호점의 표시 요금과 일치하고 옵션 가격을 보존한다',()=>{
 const {window}=publicUi();
 assert.equal(JSON.stringify(PRODUCTS),JSON.stringify(window.MEGASPOT_PRODUCTS));
 assert.equal(JSON.stringify(PRICING_ALL),JSON.stringify(window.MEGASPOT_PRICING));
 assert.equal(PRODUCTS.get('addon-banner').price,120000);assert.equal(PRODUCTS.get('addon-xbanner').price,70000);
 const first=PRICING_ALL['megaspot-gundae'],second=PRICING_ALL['megaspot-gundae-2'];
 assert.deepEqual(second.surcharge,first.surcharge);
 assert.equal(first.surcharge.amount,300000);
 assert.deepEqual(second.hourly,first.hourly);
 const baseRules=d=>d.packages.filter(p=>p.id!=='allday');
 assert.deepEqual(baseRules(second),baseRules(first));
 assert.equal(second.fullDayOffer,first.fullDayOffer);
 for(const [day,rate] of Object.entries(second.peak.types)){
  assert.deepEqual(rate.hourly,first.peak.types[day].hourly);
  assert.equal(rate.surcharge,first.peak.types[day].surcharge);
  assert.equal(rate.people,50);
 }
});

test('올데이는 지점별 11월 19일 판매가와 할인 비교 기준을 복원하고 종일 대관과 구분한다',()=>{
 const {M}=publicUi();
 const ids=['megaspot-gundae','megaspot-gundae-2'];
 const expected=[{wd:800000,fri:1000000,sat:1600000,sun:1350000},{wd:935000,fri:1105000,sat:1615000,sun:1403000}];
 const refs=[{wd:1080000,fri:1470000,sat:2310000,sun:2000000},{wd:1173000,fri:1508000,sat:2221000,sun:1961000}];
 for(const [i,id] of ids.entries()){
  const {E,R}=M.pricing.forSpace(id);
  const pkg=E.findPkg('allday');
  assert.deepEqual({...pkg.price},expected[i]);
  assert.deepEqual({...pkg.referenceRegular},refs[i]);
  const box={innerHTML:'',addEventListener(){}};R.packages(box);
  assert.match(box.innerHTML,/올데이 할인율은 11\/19 요금표 기준/);
  for(const [col,date] of Object.entries({wd:'2026-11-23',fri:'2026-11-27',sat:'2026-11-28',sun:'2026-11-29'})){
   const q=E.quote({date,start:10,end:24,people:50});
   assert.equal(q.total,expected[i][col]);assert.equal(q.pkg.regular,q.time.total);assert.equal(q.peopleBase,50);
   if(i===0){
    const id='pass-allday-'+col,product=PRODUCTS.get(id);
    assert.equal(product.price,q.total);
    const schema=JSON.parse(read('products/'+id+'/index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(Number(schema['@graph'].find(x=>x['@type']==='Product').offers.price),q.total);
   }
  }
  assert.equal(E.quote({date:'2026-12-07',start:10,end:24,people:50}).total,i===0?960000:1071000);
  assert.equal(E.quote({date:'2026-12-25',start:10,end:24,people:50}).total,i===0?3800000:3230000);
  assert.equal(E.quote({date:'2027-01-04',start:10,end:24,people:50}).total,i===0?880000:1003000);
 }
 assert.equal(PRODUCTS.items.some(p=>p.pkg==='full-day'),false);
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
