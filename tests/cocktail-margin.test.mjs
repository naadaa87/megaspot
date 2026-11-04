import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,quoteInput,saveQuote} from './helpers/admin-fixture.mjs';
import {cocktailFrom} from '../functions/api/_cocktail.js';
import {cocktailPricing} from '../functions/api/_cocktail_pricing.js';
import {publicDoc} from '../functions/api/_confirm.js';
import F from '../assets/js/food-services.js';
const packages=[[100,800000,1200000,1540000],[200,1100000,1800000,2200000],[300,1500000,2300000,2750000],[400,1800000,2700000,3190000]];

test('패키지별 공급가·판매가·마진 API는 관리자 인증이 필요하고 캐시하지 않는다',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const denied=await f.handle(new Request('https://local.test/api/admin/cocktail/pricing'));
 assert.equal(denied.status,401);
 const response=await f.handle(new Request('https://local.test/api/admin/cocktail/pricing',{headers:{'x-admin-key':f.env.ADMIN_KEY}}));
 assert.equal(response.headers.get('cache-control'),'no-store');
 const data=await response.json();assert.equal(data.packages.length,4);
 for(let i=0;i<packages.length;i++){const [cups,cost,sale,total]=packages[i],row=data.packages[i];assert.equal(row.cups,cups);assert.equal(row.vendor_supply,cost);assert.equal(row.sale_price,sale);assert.equal(row.total,total);assert.equal(row.vat,(sale+200000)/10);assert.equal(row.margin,sale-cost);assert.equal(row.margin_rate,(sale-cost)/sale);}
 assert.deepEqual(data.packages,cocktailPricing());
});

test('판매가와 부가세는 견적·예약에 한 번 반영되고 원가·마진은 고객 확정서에서 제외된다',async t=>{
 for(const [cups,cost,sale,total] of packages){
  const f=fixture({booking:true});t.after(()=>f.db.close());
  await f.api('inquiries/MS-TEST','PATCH',{cocktail:{cups,menus:['mojito'],vendor_supply:cost,margin:sale-cost,price:1,vat:1,total:1}});
  let it=(await f.api('inquiries/MS-TEST')).item,q=it.data.cocktail;
  assert.equal(q.price,sale);assert.equal(q.total,total);assert.equal(q.vendor_supply,undefined);assert.equal(q.margin,undefined);
  const input=F.syncQuote(quoteInput(),it.data,true);assert.equal(input.extras[0].amount,total);
  await saveQuote(f.api,{input,extras:input.extras,total:500000+total});
  it=(await f.api('inquiries/MS-TEST')).item;assert.equal(it.data.included_cocktail_amount,total);assert.equal((await f.api('bookings')).items[0].amount,500000+total);
  const issued=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000+total},reception_revision:it.data.reception_revision});
  const publicValue=publicDoc({booking_code:'BK-TEST'},issued.doc).food_services[0];
  assert.equal(publicValue.price,sale);assert.equal(publicValue.bartender_fee,200000);assert.equal(publicValue.vat,(sale+200000)/10);assert.equal(publicValue.amount,total);
  const rows=F.rows(publicValue,true).map(r=>r.join(':')).join('\n');assert(rows.includes(sale.toLocaleString('ko-KR')+'원'));assert(rows.includes(((sale+200000)/10).toLocaleString('ko-KR')+'원'));assert(!/업체 공급가|마진/.test(rows));
  assert(!/vendor_supply|margin|vendor_cost/.test(JSON.stringify(publicValue)));
 }
});

test('기존 저장 금액은 소급 변경하지 않고 고객 문서는 내부 필드를 허용하지 않는다',()=>{
 const old={cups:100,price:1000000,menus:['mojito'],vendor_supply:800000,margin:200000,cost:800000};
 assert.equal(F.amount('cocktail',old),1000000);
 const legacy=F.documents({cocktail:old,included_cocktail_amount:1000000},1500000)[0];assert.equal(legacy.amount,1000000);assert(!('vendor_supply' in legacy));
 const value=publicDoc({booking_code:'BK-TEST'},{food_services:[{...old,kind:'cocktail'}]}).food_services[0];
 for(const k of ['vendor_supply','margin','cost'])assert.equal(value[k],undefined);
 const current=cocktailFrom({cups:100});const hidden=publicDoc({booking_code:'BK-TEST'},{show_amount:false,food_services:[{...current,kind:'cocktail',amount:current.total,vendor_supply:800000,margin:100000}]}).food_services[0];
 for(const k of ['price','vat','total','amount'])assert.equal(hidden[k],null);assert.equal(hidden.vendor_supply,undefined);assert.equal(hidden.margin,undefined);
});
