import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/parking-fixture.mjs';
import view from '../assets/js/pages/admin-parking-view.js';
async function buy(f){await f.call('admin/settings','PUT',{enabled:true},null,true);const r=await f.call('prepare','POST',f.input({vehicles:[{plate:'123가4567',plate_confirm:'123가4567',ticket:'1h'},{plate:'234나5678',plate_confirm:'234나5678',ticket:'2h'}]}));const p=await r.json();assert.equal(r.status,200);await f.feedback(p);return p;}
async function list(f,q){const r=await f.call('admin/orders?'+q,'GET',undefined,null,true);assert.equal(r.status,200);return r.json();}
test('처리 대기 필터와 한 차량 검색에도 통합 결제의 완료 차량을 함께 반환하고 부모 총액은 한 번 집계한다',async t=>{
 const f=fixture(t),p=await buy(f);f.db.prepare("UPDATE parking_orders SET status='applied',applied_at=datetime('now') WHERE plate='123가4567'").run();
 const r=await list(f,'filter=queue');assert.equal(r.items.length,2);assert.equal(r.matched_count,1);assert.equal(r.payment_count,1);assert.equal(r.items.find(p=>p.plate==='123가4567').matched,false);assert.ok(r.items.every(x=>x.payment_total===12000));assert.equal(view.groups(r.items)[0].total,12000);
 for(const q of ['filter=all&q=234나5678','filter=all&q='+p.oid,'filter=applied']){const x=await list(f,q);assert.equal(x.items.length,2);assert.equal(x.payment_count,1);}
 const empty=await list(f,'filter=all&q=없는차량');assert.equal(empty.items.length,0);assert.equal(empty.payment_count,0);
});
test('결제 알림은 통합 결제 수와 차량 수를 구분하고 묶음 열기는 모든 차량을 확인 처리한다',async t=>{
 const f=fixture(t),p=await buy(f);let r=await(await f.call('admin/payment-alerts','GET',undefined,null,true)).json();assert.equal(r.count,2);assert.equal(r.payment_count,1);assert.ok(r.items.every(x=>x.payment_oid===p.oid&&x.payment_total===12000));
 assert.equal((await f.call('admin/payment-alerts/'+p.oid+'/read-group','POST',{},null,false)).status,401);
 assert.equal((await f.call('admin/payment-alerts/'+p.oid+'/read-group','POST',{},null,true,'https://evil.test')).status,403);
 assert.equal((await f.call('admin/payment-alerts/'+p.oid+'/read-group','POST',{},null,true)).status,200);assert.equal((await f.call('admin/payment-alerts/'+p.oid+'/read-group','POST',{},null,true)).status,200);
 r=await(await f.call('admin/payment-alerts','GET',undefined,null,true)).json();assert.equal(r.count,0);assert.equal(r.payment_count,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM admin_parking_payment_reads').get().n,2);assert.equal((await f.call('admin/payment-alerts/MSNONE/read-group','POST',{},null,true)).status,404);
});
test('기존 단일 차량 결제는 독립 묶음으로 조회하고 확인 처리할 수 있다',async t=>{
 const f=fixture(t),p=await f.buy();await f.feedback(p);const r=await list(f,'filter=all');assert.equal(r.items.length,1);const g=view.groups(r.items)[0];assert.equal(g.oid,p.oid);assert.equal(g.total,8000);assert.equal((await f.call('admin/payment-alerts/'+p.oid+'/read-group','POST',{},null,true)).status,200);
});
test('관리자 요약은 여러 차량의 결제 총액을 중복 합산하지 않고 취소·환불은 완료로 오인하지 않는다',()=>{
 const base={oid:'MSCAR1',payment_oid:'MSPAY',payment_total:12000,payment_status:'paid',plate:'123가4567',status:'applied',price:4000,ticket_label:'1시간권',visit_date:'2026-11-06',name:'테스트',phone:'01000000000'};
 const items=[base,{...base,oid:'MSCAR2',plate:'234나5678',status:'requested',price:8000,matched:true}];let g=view.groups(items);assert.equal(g.length,1);assert.equal(g[0].total,12000);assert.equal(g[0].items[0].plate,'234나5678');
 const html=view.render(items,()=>'<button data-pact="copy">복사</button>');assert.ok(html.includes('등록 완료 1대'));assert.ok(html.includes('등록 대기 1대'));assert.ok(html.includes('12,000원'));assert.ok(html.includes('data-pact="copy"'));assert.ok(!html.includes(' open>'));
 const cancelled=view.render(items.map(p=>({...p,refund_hold:true})),()=> '');assert.ok(!cancelled.includes('등록 완료 1대'));assert.ok(cancelled.includes('취소 확인 중 2대'));
 const unsafe=view.render([{...base,name:'<img onerror=alert(1)>',plate:'<script>x</script>'}],()=> '');assert.ok(!unsafe.includes('<img'));assert.ok(!unsafe.includes('<script>'));assert.ok(unsafe.includes('&lt;img'));
});
test('검색된 차량만으로 합계를 추정하지 않고 부모 총액이 없으면 확인 필요로 표시한다',()=>{const g=view.groups([{oid:'MSCHILD',payment_oid:'MSPARENT',price:4000}])[0];assert.equal(g.total,null);});
