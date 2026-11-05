import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture,saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import {readFoodPricing,publicFoodPricing,foodPricingData,saveFoodPricing} from '../functions/api/_food_pricing.js';
import {foodHtml} from '../functions/api/_food_html.js';
import {cateringQuote} from '../functions/api/_catering.js';
import {receptionAdmin} from '../functions/api/_reception.js';
import {buildFoodPdf} from '../functions/api/_food_pdf.js';
import {onRequestGet as cateringPublic} from '../functions/api/catering/pricing.js';
import {onRequestGet as receptionPublic} from '../functions/api/reception/pricing.js';
function change(config,id,price,cost){return {...config,rows:config.rows.map(r=>r.id===id?{...r,sale_price:price,...(cost===undefined?{}:{vendor_supply:cost})}:r)};}
for(const service of ['catering','reception']){
 test(service+': private supplier editor, validation, persistence, conflicts and public price privacy',async()=>{
  const f=fixture(),initial=await f.api(service+'/pricing');assert.equal(initial.revision,0);assert(initial.rows.length>20);
  const input=change(initial,'course.classic',41234,31234),saved=await f.api(service+'/pricing','PUT',input);assert.equal(saved.revision,1);const row=saved.rows.find(r=>r.id==='course.classic');assert.equal(row.margin,10000);assert.equal(row.margin_rate,10000/41234);assert.equal(row.vat,4123);
  assert.equal((await f.api(service+'/pricing')).rows.find(r=>r.id==='course.classic').sale_price,41234);
  await f.api(service+'/pricing','PUT',input,409);
  for(const invalid of [{...saved,rows:saved.rows.slice(1)},change(saved,'course.classic',-1),change(saved,'course.classic',1.5),change(saved,'course.classic',10000001),change(saved,'course.classic',50000,-1)])await f.api(service+'/pricing','PUT',invalid,400);
  const response=await (service==='catering'?cateringPublic:receptionPublic)({env:f.env}),text=await response.text();assert.equal(response.headers.get('cache-control'),'no-store');assert(!/vendor_supply|margin|31234/.test(text));assert.equal(JSON.parse(text).prices['course.classic'],41234);
  const unauth=await f.handle(new Request('https://local.test/api/admin/'+service+'/pricing'));assert.equal(unauth.status,401);
  const current=await readFoodPricing(f.env,service),a=change(current,'course.classic',42222),b=change(current,'course.classic',43333),r=await Promise.all([saveFoodPricing(f.env,service,a),saveFoodPricing(f.env,service,b)]);assert.equal(r.filter(x=>x.conflict).length,1);
 });
}
test('legacy buffet supplier markup initializes correct item costs without changing sales',async()=>{const f=fixture();await f.api('settings/catering','PUT',{value:{markup:7000}});const c=await readFoodPricing(f.env,'catering');assert.equal(c.rows.find(r=>r.id==='course.classic').vendor_supply,33000);assert.equal(c.rows.find(r=>r.id==='course.small.20').vendor_supply,960000);assert.equal(c.rows.find(r=>r.id==='bbq.half').vendor_supply,500000);assert.equal(publicFoodPricing(c).prices['course.classic'],45000);});
test('browser, server, public HTML and all guide slots use the same new prices',async()=>{
 const f=fixture(),rates={};for(const service of ['catering','reception']){let c=await readFoodPricing(f.env,service);c={...c,rows:c.rows.map((r,i)=>({...r,sale_price:r.sale_price+101+i}))};const saved=await saveFoodPricing(f.env,service,c);rates[service]=publicFoodPricing(saved.config);
 const pdf=buildFoodPdf(readFileSync(new URL('../assets/docs/megaspot-'+service+'-pricing-template.pdf',import.meta.url)),service,rates[service]);assert.equal(pdf.length,readFileSync(new URL('../assets/docs/megaspot-'+service+'-pricing-template.pdf',import.meta.url)).length);assert(!Buffer.from(pdf).includes(Buffer.from('vendor_supply')));
 }
 const ctx={window:{MEGASPOT_FOOD_RATES:rates}};vm.createContext(ctx);for(const path of ['food-pricing','data/catering','catering-calc','data/reception-quote','reception-calc'])vm.runInContext(readFileSync(new URL('../assets/js/'+path+'.js',import.meta.url),'utf8'),ctx);
 const cb=ctx.window.MEGASPOT_CATERING_CALC.quote({course:'classic',people:60,bbq:'kg40',beer:2}),cs=cateringQuote({course:'classic',people:60,bbq:'kg40',beer:2},undefined,foodPricingData('catering',await readFoodPricing(f.env,'catering')));assert.equal(cb.total,cs.total);
 const rb=ctx.window.MEGASPOT_RECEPTION_CALC.quote(51,'box','classic'),rs=receptionAdmin({course:'classic',people:51,format:'box',status:'confirmed'},foodPricingData('reception',await readFoodPricing(f.env,'reception')));assert.equal(rb.total,rs.total);
 for(const service of ['catering','reception']){const html=foodHtml(readFileSync(new URL('../'+service+'/index.html',import.meta.url),'utf8'),'/'+service+'/',rates);assert(!html.includes('@@FOODPRICE'));assert(!/vendor_supply|margin_rate/.test(html));if(service==='catering')assert(html.includes(rates[service].prices['course.classic'].toLocaleString('ko-KR')+'원'));else assert(html.includes('data-reception-provider="cafefriends"')); }
 // Server clones prevent one concurrent request's prices leaking into another.
 assert.equal(cateringQuote({course:'classic',people:60}).supply,2800000);assert.equal(receptionAdmin({course:'classic',people:50,format:'table'}).total,2145000);
});
test('new buffet orders and reception saves use persisted prices; stored quotes keep their snapshots',async()=>{
 const f=fixture();let bc=await f.api('catering/pricing');await f.api('catering/pricing','PUT',change(bc,'course.classic',41000));
 const order=await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:{course:'classic',people:60},status:'pending'});assert.equal(order.item.supply,2560000);assert.equal(order.item.total,2816000);
 let rc=await f.api('reception/pricing');await f.api('reception/pricing','PUT',change(rc,'course.classic',36000));
 const rec=await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'classic',people:50,format:'table',status:'confirmed'}});assert.equal(rec.reception.total,2200000);
 const data=JSON.parse(f.db.prepare("SELECT data FROM inquiries WHERE ref='MS-TEST'").get().data),r=data.reception,c=data.catering;
 const extras=[{kind:'reception',label:'케이터링',amount:r.total,reception:r},{kind:'catering',label:'출장뷔페',amount:c.total,catering:c}];
 await saveQuote(f.api,{total:6000000,input:quoteInput({extras}),extras});
 bc=await f.api('catering/pricing');rc=await f.api('reception/pricing');await f.api('catering/pricing','PUT',change(bc,'course.classic',50000));await f.api('reception/pricing','PUT',change(rc,'course.classic',45000));
 await saveQuote(f.api,{total:6000000,input:quoteInput({extras,reception_revision:JSON.parse(f.db.prepare("SELECT data FROM inquiries WHERE ref='MS-TEST'").get().data).reception_revision}),extras});
 const after=JSON.parse(f.db.prepare("SELECT data FROM inquiries WHERE ref='MS-TEST'").get().data);assert.equal(after.reception.total,2200000);assert.equal(after.catering.total,2816000);
});
