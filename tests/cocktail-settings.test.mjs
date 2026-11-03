import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {fixture,quoteInput,saveQuote} from './helpers/admin-fixture.mjs';
import {readCocktailPricing,publicCocktailPricing} from '../functions/api/_cocktail_pricing.js';
import {onRequestGet as publicPrices} from '../functions/api/cocktail/pricing.js';
import {cocktailHtml} from '../functions/api/_cocktail_html.js';
import {onRequestPost as inquiry} from '../functions/api/inquiry.js';
import F from '../assets/js/food-services.js';
const changed=rows=>rows.map((r,i)=>({cups:r.cups,vendor_supply:r.vendor_supply+123+i,sale_price:r.sale_price+100001+i}));

test('관리자 저장 가격은 새 요청에서도 유지되고 공개 API·HTML·서버 문의 계산이 같은 판매가를 쓴다',async t=>{
 const f=fixture();t.after(()=>f.db.close());const original=await f.api('cocktail/pricing'),packages=changed(original.packages);
 const saved=await f.api('cocktail/pricing','PUT',{revision:0,packages});assert.equal(saved.revision,1);
 const next=await readCocktailPricing(f.env);assert.equal(next.packages[0].sale_price,packages[0].sale_price);
 const response=await publicPrices({env:f.env}),publicData=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');assert(!/vendor_supply|margin/.test(JSON.stringify(publicData)));
 const html=cocktailHtml(readFileSync(new URL('../cocktail/index.html',import.meta.url),'utf8'),'/cocktail/',publicData);
 for(const row of packages){assert(html.includes('"price":"'+row.sale_price+'"'));assert(html.includes(row.sale_price.toLocaleString('ko-KR')));}
 assert(!/vendor_supply|margin_rate/.test(html));
 const result=await inquiry({env:f.env,request:new Request('https://local.test/api/inquiry',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'10.21.22.23'},body:JSON.stringify({name:'새 가격 검증',phone:'010-3333-4444',agree_privacy:true,cocktail:{cups:100,price:1,total:1}})})});assert.equal(result.status,200);
 const ref=(await result.json()).ref,data=JSON.parse(f.db.prepare('SELECT data FROM inquiries WHERE ref=?').get(ref).data);assert.equal(data.cocktail.price,packages[0].sale_price);assert.equal(data.cocktail.vat,Math.round(packages[0].sale_price/10));assert.equal(data.cocktail.pricing_revision,1);
});

test('가격 저장은 잘못된 값과 중복 패키지를 거절하고 다른 화면의 변경을 덮어쓰지 않는다',async t=>{
 const f=fixture();t.after(()=>f.db.close());const original=await f.api('cocktail/pricing');
 for(const invalid of [{packages:[]},{packages:original.packages.map((p,i)=>i? p:{...p,sale_price:0})},{packages:original.packages.map((p,i)=>i?p:{...p,vendor_supply:-1})},{packages:original.packages.map((p,i)=>i?p:{...p,sale_price:1.5})},{packages:original.packages.map((p,i)=>i===3?original.packages[0]:p)}])await f.api('cocktail/pricing','PUT',{revision:0,...invalid},400);
 const first=changed(original.packages);await f.api('cocktail/pricing','PUT',{revision:0,packages:first});await f.api('cocktail/pricing','PUT',{revision:0,packages:original.packages},409);
 const current=await f.api('cocktail/pricing');assert.equal(current.packages[0].sale_price,first[0].sale_price);assert.equal(current.revision,1);
 const noAuth=await f.handle(new Request('https://local.test/api/admin/cocktail/pricing',{method:'PUT',headers:{origin:'https://local.test','content-type':'application/json'},body:JSON.stringify({revision:1,packages:original.packages})}));assert.equal(noAuth.status,401);
});

test('전체 가격표를 바꿔도 기존 문의·예약·발행 견적 금액은 그대로 유지한다',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());await f.api('inquiries/MS-TEST','PATCH',{cocktail:{cups:100,menus:['mojito']}});let it=(await f.api('inquiries/MS-TEST')).item;
 const input=F.syncQuote(quoteInput(),it.data,true);await saveQuote(f.api,{input,extras:input.extras,total:500000+990000});it=(await f.api('inquiries/MS-TEST')).item;
 const before=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:1490000},reception_revision:it.data.reception_revision});
 const config=await f.api('cocktail/pricing');await f.api('cocktail/pricing','PUT',{revision:0,packages:changed(config.packages)});
 const after=(await f.api('inquiries/MS-TEST')).item;assert.equal(after.data.cocktail.price,900000);assert.equal(after.effective_amount,1490000);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc.amount,before.doc.amount);
 const existingInput=F.syncQuote(quoteInput(),after.data,true);await saveQuote(f.api,{input:existingInput,extras:existingInput.extras,total:1590000});const roomChanged=(await f.api('inquiries/MS-TEST')).item;assert.equal(roomChanged.data.cocktail.price,900000);assert.equal(roomChanged.data.included_cocktail_amount,990000);
});

test('PDF 숫자 교체는 바이트 길이·xref 위치를 유지하고 수정 판매가만 넣는다',async()=>{
 const {buildCocktailPdf}=await import('../functions/api/_cocktail_pdf.js');const template=readFileSync(new URL('../assets/docs/megaspot-cocktail-pricing-template.pdf',import.meta.url));
 const config={prices:{100:100000001-1,200:1500001,300:1800000,400:2200000}};const bytes=buildCocktailPdf(template,config),before=new TextDecoder('latin1').decode(template),after=new TextDecoder('latin1').decode(bytes);
 assert.equal(bytes.length,template.length);assert.equal(after.match(/startxref\s+(\d+)/)[1],before.match(/startxref\s+(\d+)/)[1]);
 assert(after.includes('100,000,000'));assert(after.includes('110,000,000'));assert(after.includes('1,500,001'));assert(!after.includes('vendor_supply'));
});
