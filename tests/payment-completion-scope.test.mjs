import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {fixture} from './helpers/admin-fixture.mjs';
const migration=readFileSync(new URL('../migrations/20261118_payment_completion_scope.sql',import.meta.url),'utf8');
const cases=[
 ['식음료 미선택',{},'venue_fully_paid'],
 ['확정 식음료가 포함됨',{catering:{course:'classic',people:60,total:2750000,status:'confirmed'},included_catering_amount:2750000,total:4990000},'fully_paid'],
 ['포함 식음료가 예약 총액보다 큼',{catering:{course:'classic',people:60,total:2750000,status:'confirmed'},included_catering_amount:2750000},'needs_review'],
 ['상담 구성만 남음',{reception:{course:'classic',people:90,total:3795000,status:'pending'}},'needs_review'],
 ['확정했지만 금액 포함 근거 없음',{cocktail:{cups:100,total:1540000,vat_excluded:true,status:'confirmed'}},'needs_review'],
 ['원문에만 예전 식음료가 남음',{message:'출장 케이터링 클래식 50명 상담'},'needs_review'],
 ['견적 입력에만 식음료가 남음',{quote_input:{extras:[{kind:'reception',amount:100}]}},'needs_review'],
 ['취소한 구성만 남음',{reception:{status:'cancelled',total:100}},'venue_fully_paid']
];
for(const [name,delta,status] of cases)test('기존 완료 이관: '+name,async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());f.db.prepare('UPDATE inquiries SET data=?').run(JSON.stringify({...f.data,...delta}));if(delta.total)f.db.prepare('UPDATE bookings SET amount=?').run(delta.total);f.db.exec("INSERT INTO reservation_payment_scopes VALUES('booking','BK-TEST','fully_paid',3,'2026-11-18 01:02:03')");f.db.exec(migration);
 let row=(await f.api('bookings')).items[0];assert.equal(row.payment_status,status);assert.equal(row.payment_revision,4);assert.equal(row.payment_updated_at,'2026-11-18 01:02:03');
 await f.api('reservation-payment-checks/booking/BK-TEST','PUT',{status:'venue_fully_paid',expected_revision:4});f.db.exec(migration);row=(await f.api('bookings')).items[0];assert.equal(row.payment_status,'venue_fully_paid');assert.equal(row.payment_revision,5);
});
test('미연결 예약과 미동기화 뷔페 진행 건이 있는 예약은 확인 필요로 이관한다',async t=>{
 for(const external of [false,true]){const f=fixture({booking:true});t.after(()=>f.db.close());if(!external)f.db.exec("UPDATE bookings SET inquiry_ref=NULL");else f.db.exec("INSERT INTO catering_orders(ref,inquiry_ref,customer,status,total,data,created_at) VALUES('CO-TEST','MS-TEST','검증','confirmed',100,'{}',datetime('now'))");f.db.exec("INSERT INTO reservation_payment_scopes VALUES('booking','BK-TEST','fully_paid',1,datetime('now'))");f.db.exec(migration);assert.equal((await f.api('bookings')).items[0].payment_status,'needs_review');}
});
test('두 전체 완료 선택은 매출·예약 금액·실제 수납을 변경하지 않는다',async t=>{
 const f=fixture({booking:true,date:'2026-11-28'});t.after(()=>f.db.close());f.db.exec("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','receipt','receipt',100000,datetime('now'))");const path='revenue?from=2026-11-01&to=2026-11-30',before=await f.api(path),amount=(await f.api('bookings')).items[0].amount;
 for(const [i,status] of ['venue_fully_paid','fully_paid'].entries()){await f.api('reservation-payment-checks/booking/BK-TEST','PUT',{status,expected_revision:i});assert.deepEqual(await f.api(path),before);assert.equal((await f.api('bookings')).items[0].amount,amount);}
});
