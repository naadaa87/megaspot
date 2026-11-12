import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/admin-fixture.mjs';
import {bookingUi} from './helpers/admin-booking-fixture.mjs';
import Recovery from '../assets/js/admin-save-recovery.js';
import {onRequestGet} from '../functions/api/confirm.js';
async function setup(t){
 const f=fixture({booking:true});t.after(()=>f.db.close());t.mock.method(globalThis,'fetch',async()=>assert.fail('No external sending during confirmation QA'));
 const ui=bookingUi(),c=ui.ctx,api=async(path,opts)=>f.api(path.slice(1),opts?.method,opts?.body),store=new Map();
 for(const id of ['customer','event','time-note','amount','amount-note','pay','paid','deposit','items','note']){const el=c.$('#cd-'+id);let value='';Object.defineProperty(el,'value',{get:()=>value,set:v=>{value=String(v);},configurable:true});}
 Object.assign(c,{crypto,CDS:await f.api('bookings/BK-TEST/confirm-doc'),cdState(){},cdPreview(){},refreshLists(){},drawerDirty:{},A:api});c.cdFill(ui.defaults(c.CDS));
 c.window.MEGASPOT_ADMIN_SAVE=Recovery.create({storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},api:(...args)=>c.A(...args)});
 return {...f,ui,c,paid:n=>ui.elements['#cd-paid'].value=String(n),settlement:()=>f.api('bookings/BK-TEST/settlement')};
}
test('confirmation receipt field is editable in whole won and its preview recalculates balance without writing',async t=>{
 const f=await setup(t),html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8'),field=html.match(/<input[^>]*id="cd-paid"[^>]*>/)[0];assert.doesNotMatch(field,/readonly/);assert.match(field,/step="1"/);
 f.paid(123456);const doc=f.c.cdDoc();assert.equal(doc.paid,123456);assert.equal(doc.pay_status,'deposit');assert.equal(doc.settlement.balance,500000-123456);assert.equal((await f.settlement()).settlement.net,0);
 for(const n of ['',-1,1.5,1000000001]){f.paid(n);assert.equal(f.c.cdSettings().paid,null);}
});
test('zero receipt → partial receipt → full receipt updates ledger, confirmation, customer link and reload without duplicates',async t=>{
 const f=await setup(t);for(const [target,entries]of [[123456,1],[500000,2],[500000,2]]){
  f.paid(target);await f.c.cdSave(true);const current=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(current.doc.paid,target);assert.equal(current.doc.settlement.balance,500000-target);assert.equal(current.doc.pay_status,target===500000?'paid':'deposit');assert.equal((await f.settlement()).entries.length,entries);
  const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+current.token)});const pub=await response.json();assert.equal(pub.doc.paid,target);assert.equal(pub.doc.settlement.net,target);assert.ok(f.ui.text(pub.doc).includes(target.toLocaleString('ko-KR')+'원'));
  f.c.CDS=current;f.c.cdFill(current.doc);assert.equal(f.c.cdSettings().paid,target);
 }
 const receipts=(await f.settlement()).entries;assert.equal(receipts[0].amount,500000-123456);assert.equal(receipts[1].amount,123456);
});
test('same-window concurrent save and download reuse one receipt write',async t=>{
 const f=await setup(t);f.paid(200000);await Promise.all([f.c.cdSave(true),f.c.cdSave(true)]);assert.equal((await f.settlement()).entries.length,1);assert.equal((await f.settlement()).settlement.net,200000);
});
test('lost receipt response retries the exact request and produces one receipt',async t=>{
 const f=await setup(t),normal=f.c.A;let dropped=false;f.c.A=async(path,opts)=>{const r=await normal(path,opts);if(!dropped&&path.endsWith('/settlement')&&opts?.method==='POST'){dropped=true;throw Error('response lost');}return r;};
 f.paid(200000);await assert.rejects(f.c.cdSave(true),/저장 결과/);assert.equal((await f.settlement()).settlement.net,200000);assert.ok(f.c.window.MEGASPOT_ADMIN_SAVE.current());
 await f.c.cdSave(true);assert.equal((await f.settlement()).entries.length,1);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc.paid,200000);assert.equal(f.c.window.MEGASPOT_ADMIN_SAVE.current(),null);
});
test('document failure after receipt success can be retried without another payment entry',async t=>{
 const f=await setup(t),normal=f.c.A;let failed=false;f.c.A=async(path,opts)=>{if(!failed&&opts?.method==='PUT'){failed=true;throw Error('document connection lost');}return normal(path,opts);};f.paid(200000);
 await assert.rejects(f.c.cdSave(true),/connection lost/);await f.c.cdSave(true);assert.equal((await f.settlement()).entries.length,1);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc.paid,200000);
});
test('receipt reductions require explicit correction or completed refund, and hidden amounts do not add receipts',async t=>{
 const f=await setup(t);f.paid(200000);await f.c.cdSave(true);f.paid(0);await assert.rejects(f.c.cdSave(true),/정정하거나 완료한 환불/);assert.equal((await f.settlement()).settlement.net,200000);
 f.paid(500000);f.ui.elements['#cd-show-amount'].checked=false;await f.c.cdSave(true);const r=await f.api('bookings/BK-TEST/confirm-doc');assert.equal(r.doc.show_amount,false);assert.equal(r.doc.paid,200000);assert.equal((await f.settlement()).entries.length,1);
});
test('concurrent payment changes stop receipt entry until latest amount is reviewed',async t=>{
 const f=await setup(t);f.paid(200000);const before=(await f.settlement()).settlement;await f.api('bookings/BK-TEST/settlement','POST',{kind:'receipt',amount:100000,note:'다른 관리자 입금 기록',request_id:crypto.randomUUID(),expected_revision:before.revision});
 await assert.rejects(f.c.cdSave(true),/최신 내용을 반영/);assert.equal(f.c.cdSettings().paid,100000);assert.equal((await f.settlement()).entries.length,1);assert.equal((await f.api('bookings/BK-TEST/confirm-doc')).doc,null);
});
test('pending schedule review blocks receipt changes before confirmation issuance',async t=>{
 const f=await setup(t);f.db.prepare("UPDATE bookings SET status='payment_review' WHERE booking_code='BK-TEST'").run();f.c.CDS=await f.api('bookings/BK-TEST/confirm-doc');f.paid(200000);await assert.rejects(f.c.cdSave(true),/일정 검토 후/);assert.equal((await f.settlement()).entries.length,0);
});
