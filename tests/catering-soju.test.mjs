import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cateringQuote} from '../functions/api/_catering.js';
import {CATERING} from '../functions/api/_catalog.js';
import {F,foodExtras} from '../functions/api/_food_services.js';
import {fixture} from './helpers/admin-fixture.mjs';
import {readFoodPricing,publicFoodPricing,saveFoodPricing} from '../functions/api/_food_pricing.js';

test('legacy saved catering prices gain soju without changing existing prices or revision',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const initial=await readFoodPricing(f.env,'catering');
 const legacy={revision:4,updated_at:'2026-11-15T00:00:00Z',rows:initial.rows.filter(r=>r.id!=='soju').map(r=>({...r,sale_price:r.id==='beer'?135000:r.sale_price}))};
 f.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)').run('catering_pricing',JSON.stringify(legacy),legacy.updated_at);
 const current=await readFoodPricing(f.env,'catering');
 assert.equal(current.revision,4);assert.equal(current.updated_at,legacy.updated_at);
 assert.equal(current.rows.find(r=>r.id==='beer').sale_price,135000);
 assert.equal(current.rows.find(r=>r.id==='soju').sale_price,2000);
 assert.equal(current.rows.find(r=>r.id==='soju').vendor_supply,null);
 assert.equal(publicFoodPricing(current).prices.soju,2000);
 const saved=await saveFoodPricing(f.env,'catering',{...current,rows:current.rows.map(r=>r.id==='soju'?{...r,sale_price:2500,vendor_supply:1500}:r)});
 assert.equal(saved.config.revision,5);assert.equal((await readFoodPricing(f.env,'catering')).rows.find(r=>r.id==='soju').sale_price,2500);
});

test('soju count and recalculated amount survive order save, inquiry sync and reload',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const first=await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:{course:'classic',people:60,soju:12,total:1}});
 assert.equal(first.item.soju,12);assert.equal(first.item.supply,2824000);assert.equal(first.item.total,3106400);
 assert.match(first.item.summary,/소주 12병/);
 const loaded=await f.api('catering/orders/'+first.item.ref);assert.equal(loaded.item.soju,12);
 const inquiry=await f.api('inquiries/MS-TEST');assert.equal(inquiry.item.data.catering.soju,12);assert.equal(inquiry.item.data.catering.total,3106400);
 const changed=await f.api('catering/orders/'+first.item.ref,'PATCH',{config:{course:'classic',people:60,soju:0},reception_revision:inquiry.item.data.reception_revision});
 assert.equal(changed.item.soju,0);assert.equal(changed.item.total,3080000);
});

function browser(search=''){
 const saved=new Map(),ctx={window:{},URLSearchParams,location:{search},sessionStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)}};
 vm.createContext(ctx);
 for(const path of ['data/catering.js','catering-calc.js'])vm.runInContext(readFileSync(new URL('../assets/js/'+path,import.meta.url),'utf8'),ctx);
 return {calc:ctx.window.MEGASPOT_CATERING_CALC,ctx,saved};
}
test('soju quantity normalizes identically in browser and server and zero leaves the existing total unchanged',()=>{
 const {calc}=browser();
 for(const [input,count] of [[undefined,0],['',0],[-1,0],['invalid',0],[1,1],[12.6,13],[1000,999]]){
  const options={course:'classic',people:60,soju:input},client=calc.quote(options),server=cateringQuote(options);
  assert.equal(client.soju,count);assert.equal(server.soju,count);assert.equal(client.total,3080000+count*2200);assert.equal(client.total,server.total);
 }
 const only=calc.quote({soju:3});assert.equal(only.empty,false);assert.equal(only.total,116600);assert.match(calc.summary(only),/소주 3병/);
});
test('soju-only URL and session presets keep bottle count and inquiry form values',()=>{
 const {calc,ctx,saved}=browser('?catering=1&soju=12&cpeople=60');
 const preset=calc.preset();assert.equal(preset.soju,12);assert.equal(preset.on,true);assert.equal(JSON.parse(saved.get('ms_catering')).soju,12);
 assert.match(calc.formBlock('rv_cat'),/name="rv_cat_soju" value="12"/);
 ctx.location.search='';assert.equal(calc.preset().soju,12);
 calc.savePreset({soju:8},false);assert.equal(calc.preset(),null);
 calc.savePreset({soju:8},true);assert.equal(calc.preset().soju,8);
 const fields={rv_cat_on:{checked:true},rv_cat_course:{value:''},rv_cat_people:{value:''},rv_cat_bbq:{value:''},rv_cat_beer:{value:'0'},rv_cat_soju:{value:'8'}};
 const selected=calc.read({querySelector:selector=>fields[selector.match(/name="([^"]+)"/)[1]]||null},'rv_cat',60);
 assert.equal(selected.soju,8);assert.equal(selected.total,127600);assert.match(selected.summary,/소주 8병/);
});
test('zero bottles remain equivalent to legacy saved quotes without repricing their agreed amount',()=>{
 const saved={...cateringQuote({course:'classic',people:60}),status:'pending'};delete saved.soju;
 const explicitZero={...saved,soju:0};assert.equal(F.key('catering',saved),F.key('catering',explicitZero));
 const changedCatalog=structuredClone(CATERING);changedCatalog.courses.find(c=>c.id==='classic').price=50000;
 const result=foodExtras([{kind:'catering',amount:saved.total,catering:explicitZero}],{catering:saved},undefined,undefined,changedCatalog);
 assert.equal(result.error,undefined);assert.equal(result.selections.catering.total,saved.total);
 const docs=F.documents({catering:{...saved,soju:12}},saved.total),rows=F.documentRows({food_services:docs,show_amount:true});
 assert(rows.some(row=>row[1].includes('소주 12병')));
});
test('supplier totals multiply the configured soju cost by bottle count and keep unknown costs unresolved',()=>{
 const {calc}=browser(),admin=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
 const ctx={CR:calc.quote({soju:12}),CD:calc.data,window:{MEGASPOT_FOOD_ADMIN_PRICES:{catering:[{id:'soju',sale_price:2000,vendor_supply:1100},{id:'delivery',sale_price:100000,vendor_supply:100000}]}}};
 vm.createContext(ctx);vm.runInContext(admin.slice(admin.indexOf('  function ctVendorLines(){'),admin.indexOf('  function ctInternal(){')),ctx);
 assert.equal(ctx.ctVendorLines().lines.find(row=>row.key==='soju').vendor,13200);
 ctx.window.MEGASPOT_FOOD_ADMIN_PRICES.catering[0].vendor_supply=null;
 assert.equal(ctx.ctVendorLines().unknown,true);assert.equal(ctx.ctVendorLines().lines.find(row=>row.key==='soju').vendor,null);
});
