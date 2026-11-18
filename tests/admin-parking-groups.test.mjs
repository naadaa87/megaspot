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

test('모든 관리자 필터는 입차·취소·적용 시각보다 최신 결제순을 우선한다',async t=>{
 const f=fixture(t),orders=[];
 for(const plate of ['123가4567','234나5678','345다6789']){const p=await f.buy({plate,plate_confirm:plate});await f.feedback(p);orders.push(p);}
 const payment=f.db.prepare('UPDATE orders SET paid_at=?,created_at=? WHERE oid=?');
 payment.run('2026-11-03T04:00:00Z','2026-11-03 03:00:00',orders[0].oid);
 payment.run('2026-11-03 03:00:00','2026-11-03 02:00:00',orders[1].oid);
 payment.run('2026-11-03 05:00:00','2026-11-03 01:00:00',orders[2].oid);
 f.db.prepare("UPDATE parking_orders SET status='applied',arrival_at='2026-11-03 02:00:00',applied_at='2026-11-03 15:00:00',refund_requested_at='2026-11-03 16:00:00' WHERE oid=?").run(orders[0].oid);
 f.db.prepare("UPDATE parking_orders SET status='resolved',arrival_at='2026-11-03 03:00:00',updated_at='2026-11-04 15:00:00',refund_requested_at='2026-11-03 17:00:00' WHERE oid=?").run(orders[1].oid);
 f.db.prepare("UPDATE parking_orders SET status='applied',arrival_at='2026-11-03 01:00:00',applied_at='2026-11-03 13:00:00',refund_requested_at='2026-11-03 18:00:00' WHERE oid=?").run(orders[2].oid);
 const expected=[orders[2].oid,orders[0].oid,orders[1].oid];
 for(const filter of ['all','applied','queue']){const r=await list(f,'filter='+filter);assert.equal(r.sort,'newest_desc');assert.deepEqual(view.groups(r.items,{sort:r.sort}).map(g=>g.oid),expected);}
 f.db.exec("UPDATE parking_orders SET status='requested'");
 const arrived=await list(f,'filter=arrived');assert.deepEqual(arrived.items.map(p=>p.oid),expected);
});
test('최신 통합 결제는 차량 상태와 관계없이 먼저 표시하고 검색해도 형제 차량을 유지한다',async t=>{
 const f=fixture(t),batch=await buy(f),single=await f.buy({plate:'345다6789',plate_confirm:'345다6789'});await f.feedback(single);
 f.db.prepare("UPDATE orders SET paid_at='2026-11-03 04:00:00' WHERE oid=?").run(single.oid);
 f.db.prepare("UPDATE orders SET paid_at='2026-11-03 05:00:00' WHERE oid=?").run(batch.oid);
 f.db.prepare("UPDATE parking_orders SET status='applied',applied_at='2026-11-03 10:00:00',created_at='2026-11-03 01:00:00' WHERE plate='123가4567'").run();
 f.db.prepare("UPDATE parking_orders SET status='resolved',updated_at='2026-11-03 15:00:00',created_at='2026-11-03 02:00:00' WHERE plate='234나5678'").run();
 f.db.prepare("UPDATE parking_orders SET status='applied',applied_at='2026-11-03 18:00:00' WHERE oid=?").run(single.oid);
 const r=await list(f,'filter=applied'),g=view.groups(r.items,{sort:r.sort});assert.equal(g[0].oid,batch.oid);assert.equal(g[1].oid,single.oid);assert.deepEqual(g[0].items.map(p=>p.plate),['123가4567','234나5678']);
 const html=view.render(r.items,()=>'',{sort:r.sort});assert.ok(html.indexOf(batch.oid)<html.indexOf(single.oid));
 const search=await list(f,'filter=all&q=234나5678');assert.equal(search.items.length,2);assert.equal(search.matched_count,1);assert.equal(view.groups(search.items,{sort:search.sort})[0].items[0].plate,'234나5678');
});
test('미결제는 주문 생성 시각을 사용하며 같은 시각에는 결제번호로 순서를 고정한다',async t=>{
 const f=fixture(t),orders=[];for(const plate of ['123가4567','234나5678','345다6789'])orders.push(await f.buy({plate,plate_confirm:plate}));
 const update=f.db.prepare('UPDATE orders SET paid_at=?,created_at=? WHERE oid=?');
 update.run(null,'2026-11-03T05:00:00Z',orders[0].oid);update.run('','2026-11-03 04:00:00',orders[1].oid);update.run(null,'2026-11-03 05:00:00',orders[2].oid);
 const tied=[orders[0].oid,orders[2].oid].sort().reverse(),r=await list(f,'filter=all');assert.deepEqual(r.items.map(p=>p.oid),[...tied,orders[1].oid]);
});
