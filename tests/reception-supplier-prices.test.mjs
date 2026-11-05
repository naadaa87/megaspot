import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/admin-fixture.mjs';
import {definitions,publicFoodPricing,foodPricingData} from '../functions/api/_food_pricing.js';
import {RECEPTION_MENU_SUPPLY,receptionMenuSupply} from '../functions/api/_reception_supplier_prices.js';
import ITEMS from '../assets/js/data/reception-items.js';
import C from '../assets/js/reception-calc.js';
import {buildFoodPdf} from '../functions/api/_food_pdf.js';

test('all 43 supplier PDF menu prices match the existing selling price and unit',()=>{
 assert.equal(RECEPTION_MENU_SUPPLY.length,43);assert.equal(new Set(RECEPTION_MENU_SUPPLY.map(r=>r.id)).size,43);
 for(const item of ITEMS){const row=RECEPTION_MENU_SUPPLY.find(r=>r.id===item.id);assert.equal(row.name,item.name);assert.equal(row.unit,item.unit);assert(row.vendor_supply>0);assert.equal(Math.ceil(row.vendor_supply*13/1000)*100,item.price,item.name);assert.equal(row.source_page,Number(item.id.slice(5))<=24?4:5);}
 assert.equal(receptionMenuSupply({...ITEMS[0],name:'다른 메뉴'}),null);
 assert.equal(receptionMenuSupply({...ITEMS[0],unit:'1BOX'}),null);
});
test('all 57 reception costs are filled, margins calculated and fees use user-confirmed costs',async()=>{
 const f=fixture(),r=await f.api('reception/pricing');assert.equal(r.rows.filter(r=>!r.provider).length,57);assert(r.rows.filter(r=>!r.provider).every(row=>Number.isSafeInteger(row.vendor_supply)&&row.margin!==null&&row.margin_rate!==null));
 for(const [id,cost,sale,margin] of [['course.classic',30000,35000,5000],['menu.01',2800,3700,900],['menu.15',2600,3400,800],['menu.16',60000,78000,18000],['menu.24',12000,15600,3600],['menu.39',70000,91000,21000],['menu.42',120000,156000,36000],['fee.table.50',200000,200000,0]]){const row=r.rows.find(r=>r.id===id);assert.equal(row.vendor_supply,cost,id);assert.equal(row.sale_price,sale,id);assert.equal(row.margin,margin,id);assert.equal(row.margin_rate,margin/sale,id);}
 for(const row of r.rows.filter(r=>r.id.startsWith('fee.')&&!r.provider))assert.equal(row.margin,0,row.id);
 const pub=publicFoodPricing({service:'reception',rows:r.rows});assert(!/vendor_supply|source_page|마진|margin/.test(JSON.stringify(pub)));
 const data=foodPricingData('reception',{service:'reception',rows:r.rows}),quote=C.create(data).quote(50,'table','classic');assert.equal(quote.total,2145000);
 const template=readFileSync(new URL('../assets/docs/megaspot-reception-pricing-template.pdf',import.meta.url));const snapshot=readFileSync(new URL('../assets/docs/megaspot-reception-guide.pdf',import.meta.url));assert.deepEqual(Buffer.from(buildFoodPdf(template,'reception',pub)),snapshot);
});
test('manually saved supplier and sale prices (including zero/blank costs) remain editable and persist',async()=>{
 const f=fixture();let r=await f.api('reception/pricing');r.rows.find(r=>r.id==='menu.01').vendor_supply=2900;r.rows.find(r=>r.id==='menu.01').sale_price=4000;r.rows.find(r=>r.id==='menu.02').vendor_supply=0;r.rows.find(r=>r.id==='menu.03').vendor_supply=null;
 await f.api('reception/pricing','PUT',r);r=await f.api('reception/pricing');assert.equal(r.rows.find(r=>r.id==='menu.01').margin,1100);assert.equal(r.rows.find(r=>r.id==='menu.02').vendor_supply,0);assert.equal(r.rows.find(r=>r.id==='menu.03').vendor_supply,null);assert.equal(r.rows.find(r=>r.id==='menu.03').margin,null);
});
