import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture,saveQuote,quoteInput} from './helpers/admin-fixture.mjs';
import C from '../assets/js/reception-calc.js';
import {onRequestGet} from '../functions/api/confirm.js';
import {publicDoc} from '../functions/api/_confirm.js';
const ctx={window:{}};vm.runInNewContext(readFileSync(new URL('../assets/js/confirm-doc.js',import.meta.url),'utf8'),ctx);const X=ctx.window.MEGASPOT_CONFIRM;
function extra(course='classic',people=50,format='table'){const q=C.quote(people,format,course);return {kind:'reception',label:q.courseName,amount:q.total,reception:{course,people,format}};}
async function published(f,k){const r=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+k)});return {status:r.status,body:await r.json()};}
for(const course of C.data.courses)for(const format of ['table','box','lunchbox'])test(`${course.name}·${format}: 견적 스냅샷과 확정서·고객 조회의 구성·금액 일치`,async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());const row=extra(course.id,50,format),total=500000+row.amount;
 await saveQuote(f.api,{total,extras:[row],input:quoteInput({extras:[row]})});const it=(await f.api('inquiries/MS-TEST')).item,quote=(await f.api('inquiries/MS-TEST')).quotes[0];assert.equal(quote.data.extras[0].reception.fee,format==='table'?200000:100000);assert.equal(quote.data.input.extras[0].reception.total,row.amount);
 const r=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(r.reception.people,50);assert.equal(r.reception.included,true);
 const saved=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:total,items:[it.data.reception.summary],reception:{course:'vip',total:1}}});
 assert.equal(saved.doc.reception.course,course.id);assert.equal(saved.doc.reception.total,row.amount);assert.equal(saved.doc.reception.format,format);assert.equal(saved.doc.items.length,0);assert.equal(saved.doc.amount,total);
 const pub=await published(f,r.token);assert.equal(pub.status,200);assert.equal(pub.body.doc.reception.total,row.amount);assert.equal(pub.body.doc.headcount,30);assert.equal(pub.body.doc.reception.people,50);
 const text=X.receptionRows(pub.body.doc).map(x=>x.join(': ')).join('\n');for(const value of [course.name,'50명',C.formatLabel(format),C.won(row.amount),'확정 금액에 포함'])assert(text.includes(value),value);
});
test('아직 대관 견적에 넣지 않은 케이터링은 확정서에서도 별도임을 표시',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'premium',people:42,format:'box'}});const r=await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000}});assert.equal(r.doc.reception.included,false);assert.equal(r.doc.amount,500000);assert.match(X.receptionRows(r.preview).map(x=>x[1]).join('\n'),/확정 금액과 별도 · 합계 미포함/);
});
test('금액을 숨기면 고객 조회·그림·공유문에서 케이터링 금액도 노출하지 않음',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());const row=extra();await saveQuote(f.api,{total:2645000,extras:[row]});const token=(await f.api('bookings/BK-TEST/confirm-doc')).token;
 await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2645000,paid:100000,deposit:150000,show_amount:false}});const doc=(await published(f,token)).body.doc;
 assert.equal(doc.amount,null);assert.equal(doc.paid,null);assert.equal(doc.deposit,null);for(const k of ['unitPrice','food','fee','supply','vat','total'])assert.equal(doc.reception[k],null);const text=X.kakaoText(doc,'https://local.test/confirm');assert.match(text,/클래식.*50명/);assert.doesNotMatch(text,/1,950,000|200,000|35,000/);
 const old=publicDoc({},{show_amount:false,items:['클래식 50명 · 테이블 세팅 케이터링 · 메뉴 1,750,000원 + 세팅비 200,000원']});assert.equal(old.items.length,0);
});
test('같은 금액의 방식·코스 변경도 이미 발급한 확정서를 무효화함',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());const row=extra('classic',50,'box');await saveQuote(f.api,{total:2535000,extras:[row]});
 for(const reception of [{course:'classic',people:50,format:'lunchbox'},{course:'light',people:70,format:'box'}]){await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2535000}});await f.api('inquiries/MS-TEST','PATCH',{reception});assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);assert.equal((await f.api('bookings')).items[0].amount,2535000);}
 await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2535000}});await saveQuote(f.api,{total:2535000,extras:[extra('classic',50,'box')]});assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);
});
test('이전 확정서는 재발급 필요 상태로 표시하고 발급 후 상세 스냅샷 보존',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());await f.api('inquiries/MS-TEST','PATCH',{reception:{course:'signature',people:50,format:'table'}});f.db.prepare('UPDATE bookings SET confirm_doc=? WHERE booking_code=?').run(JSON.stringify({issued_at:'2026-11-01',items:['시그니처 50명 · 테이블 세팅 케이터링 · 메뉴 2,750,000원 + 출장·세팅·철수 비용 200,000원']}),'BK-TEST');
 let r=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(r.needs_reissue,true);assert.equal(r.preview.items.length,0);assert.equal(r.reception.total,3245000);await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000,items:r.doc.items}});r=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(r.needs_reissue,false);assert.equal(r.doc.reception.total,3245000);assert.equal(r.doc.reception.included,false);
});
test('과거 견적의 상세 가격이 없으면 현재 요금을 임의로 덧씌우지 않음',()=>{
 const rec=C.forDocument({course:'classic',people:50,format:'table'},2000000);assert.equal(rec.total,2000000);assert.equal(rec.fee,null);assert.equal(rec.unitPrice,null);assert.equal(rec.courseName,'클래식');
});
test('총액이 같아도 견적에서 케이터링 포함 여부를 바꾸면 확정서를 재발급해야 함',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());await saveQuote(f.api,{total:2645000,extras:[extra()]});await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:2645000}});await saveQuote(f.api,{total:2645000,extras:[]});assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);
});
