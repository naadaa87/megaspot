import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import C from '../assets/js/reception-calc.js';
import {readFoodPricing,adminFoodPricing,publicFoodPricing,foodPricingData} from '../functions/api/_food_pricing.js';
import {foodHtml} from '../functions/api/_food_html.js';
import {buildFoodPdf} from '../functions/api/_food_pdf.js';
import slots from '../functions/api/_pdf_reception_cafefriends_slots.js';
import {fixture,quoteInput,saveQuote} from './helpers/admin-fixture.mjs';
const table=[[1,200000],[30,200000],[31,250000],[50,250000],[51,300000],[100,300000],[101,350000],[150,350000],[151,400000],[200,400000],[201,450000],[250,450000],[251,500000],[300,500000],[301,550000],[350,550000],[351,600000],[400,600000],[401,650000]];
test('four published sets keep old sale tiers, use real supplier menu IDs, and all fee boundaries add VAT exactly once',()=>{
 const courses=C.activeCourses().filter(x=>x.id!=='cf-custom');assert.deepEqual(courses.map(c=>c.price),[25000,35000,45000,55000]);
 for(const co of courses){assert(co.menus.length>=9);assert.deepEqual(co.menus,co.example_ids.map(id=>C.data.activeCatalog.items.find(i=>i.id===id).name));assert.notDeepEqual(co.menus,C.course(co.id.replace('cf-','')).menus);
  for(const [n,fee] of table){const q=C.quote(n,'table',co.id);assert(q.ok);assert.equal(q.fee,fee);assert.equal(q.food,co.price*n);assert.equal(q.supply,co.price*n+fee);assert.equal(q.vat,Math.round(q.supply*.1));assert.equal(q.total,q.supply+q.vat);}
  for(const format of ['box'])for(const n of [1,30,50,100,200,300,301,350,1000]){const q=C.quote(n,format,co.id);assert(q.ok);assert.equal(q.fee,30000);assert.equal(q.total,co.price*n+30000+Math.round((co.price*n+30000)/10));}
 }
 assert.equal(C.quote(50,'table','cf-classic').total,2200000);assert.equal(C.quote(50,'box','cf-classic').total,1958000);
});
test('private supplier costs use a 5,000 per-person set margin and zero margin on every setup or delivery fee; public data excludes costs',async()=>{
 const cfg=await readFoodPricing({},'reception'),admin=adminFoodPricing(cfg);assert.equal(cfg.rows.length,106);
 for(const row of admin.rows.filter(x=>x.provider&&!x.retired&&!x.id.startsWith('cf-menu-'))){assert.equal(row.margin,row.id.startsWith('course.')?5000:0);assert.equal(row.vendor_supply,row.sale_price-(row.id.startsWith('course.')?5000:0));}
 assert.doesNotMatch(JSON.stringify(publicFoodPricing(cfg)),/vendor_supply|margin|price_policy/);
});
test('old saved 98-row settings pick up authorized defaults once, retain legacy prices and historical terms, and later explicit edits survive reload',async t=>{
 const f=fixture();t.after(()=>f.db.close());const cfg=await readFoodPricing(f.env,'reception');const old=cfg.rows.filter(x=>!['course.cf-light','course.cf-classic','course.cf-premium','course.cf-signature','fee.cf-table.30','fee.cf-table.150','fee.cf-table.250','fee.cf-table.step50'].includes(x.id)).map(({id,sale_price,vendor_supply})=>({id,sale_price:id.startsWith('fee.cf-')?(id==='fee.cf-table.50'?200000:null):id==='course.classic'?37890:sale_price,vendor_supply:id.startsWith('fee.cf-')?null:vendor_supply}));assert.equal(old.length,98);
 f.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run('reception_pricing',JSON.stringify({revision:4,rows:old}),'2026-11-05');const before=f.db.prepare("SELECT value FROM settings WHERE key='reception_pricing'").get().value;
 let current=await f.api('reception/pricing');assert.equal(current.revision,4);assert.equal(current.rows.find(x=>x.id==='course.classic').sale_price,37890);assert.equal(current.rows.find(x=>x.id==='fee.cf-table.50').sale_price,250000);assert.equal(current.rows.find(x=>x.id==='fee.cf-box.300').sale_price,30000);assert.equal(f.db.prepare("SELECT value FROM settings WHERE key='reception_pricing'").get().value,before);
 current.rows.find(x=>x.id==='fee.cf-table.50').sale_price=260000;current.rows.find(x=>x.id==='fee.cf-table.50').vendor_supply=260000;await f.api('reception/pricing','PUT',current);current=await f.api('reception/pricing');assert.equal(current.revision,5);assert.equal(current.rows.find(x=>x.id==='fee.cf-table.50').sale_price,260000);const persisted=JSON.parse(f.db.prepare("SELECT value FROM settings WHERE key='reception_pricing'").get().value);assert.equal(persisted.price_policy,C.data.activeCatalog.pricePolicy);
 const q=C.create(foodPricingData('reception',await readFoodPricing(f.env,'reception'))).quote(50,'table','cf-classic');assert.equal(q.total,2211000);
});
test('updated fee settings reach public fee table and every repeated PDF price slot without leaking supplier costs',async()=>{
 const cfg=await readFoodPricing({},'reception');cfg.rows.find(x=>x.id==='fee.cf-table.50').sale_price=267890;const rates={reception:publicFoodPricing(cfg),catering:publicFoodPricing(await readFoodPricing({},'catering'))};
 const html=foodHtml(readFileSync(new URL('../reception/index.html',import.meta.url),'utf8'),'/reception/',rates);assert.match(html,/data-cf-fee="fee.cf-table.50">267,890원/);assert.match(html,/data-cf-fee="fee.cf-box.300">30,000원/);assert(!html.includes('@@FOODPRICE'));
 const template=readFileSync(new URL('../assets/docs/megaspot-reception-pricing-template.pdf',import.meta.url)),pdf=Buffer.from(buildFoodPdf(template,'reception',rates.reception));assert.equal(slots.length,20);for(const slot of slots){const expected=rates.reception.prices[slot.key];assert.equal(pdf.subarray(slot.start,slot.start+16).toString().trim(),expected.toLocaleString('en-US'));}assert.equal(slots.filter(x=>x.key==='course.cf-signature').length,2);
});
test('new set saved at over 300 people reaches booking and confirmation, then changing, cancelling and restoring recomputes once',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());const choice={course:'cf-signature',format:'table',people:350,status:'confirmed',menu_ids:['cf-menu-21']};await f.api('inquiries/MS-TEST','PATCH',{reception:choice});let it=(await f.api('inquiries/MS-TEST')).item;const q=C.quote(350,'table','cf-signature');let input=C.syncQuote(quoteInput(),it.data,true);await saveQuote(f.api,{total:500000+q.total,input,extras:input.extras});
 for(const [format,status] of [['table','confirmed'],['box','confirmed'],['box','cancelled'],['table','confirmed']]){await f.api('inquiries/MS-TEST','PATCH',{reception:{...choice,format,status}});it=(await f.api('inquiries/MS-TEST')).item;const total=500000+(status==='cancelled'?0:C.quote(350,format,'cf-signature').total);assert.equal(it.effective_amount,total);assert.equal((await f.api('bookings')).items[0].amount,total);const doc=(await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:total}})).doc;assert.equal(doc.amount,total);assert.equal(doc.reception.courseName,'시그니처');assert.equal(doc.reception.people,350);assert.equal(doc.reception.fee,format==='box'?30000:550000);}
});
