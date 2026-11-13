import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,DAY} from './helpers/admin-fixture.mjs';
import {reservationServices} from '../functions/api/_reservation_services.js';

async function lists(f,expected){
 for(const endpoint of ['bookings','reservations?from='+DAY+'&to='+DAY]){
  const row=(await f.api(endpoint)).items[0];assert.deepEqual(row.services,expected,endpoint);
  assert.equal('service_data' in row,false);assert.equal('cat_ord' in row,false);
 }
}
test('예약 목록은 공간 확정과 별개로 저장한 식음료 상태를 두 목록에 동일하게 반영한다',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());await lists(f,[]);
 await f.api('inquiries/MS-TEST','PATCH',{cocktail:{cups:100,status:'pending'}});
 await f.api('inquiries/MS-TEST','PATCH',{reception:{format:'table',people:50,status:'confirmed'}});
 const order=(await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:{course:'classic',people:60},status:'confirmed'})).item;
 await lists(f,[{kind:'catering',status:'confirmed'},{kind:'reception',status:'confirmed'},{kind:'cocktail',status:'pending'}]);
 await f.api('catering/orders/'+order.ref,'PATCH',{status:'cancelled'});
 await f.api('inquiries/MS-TEST','PATCH',{cocktail:{cups:100,status:'confirmed'}});
 await f.api('inquiries/MS-TEST','PATCH',{reception:{format:'table',people:50,status:'pending'}});
 await lists(f,[{kind:'catering',status:'cancelled'},{kind:'reception',status:'pending'},{kind:'cocktail',status:'confirmed'}]);
});
test('문의 단계와 문의 없는 기존 예약도 저장된 뷔페 상태를 표시한다',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 await f.api('inquiries/MS-TEST','PATCH',{catering:{summary:'뷔페 상담 희망'}});
 assert.deepEqual((await f.api('reservations')).items[0].services,[{kind:'catering',status:'pending'}]);
 f.db.prepare("INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,created_at) VALUES('BK-DIRECT','megaspot-gundae','직접 예약','010-1234-5678','5678',?,'confirmed','2026-01-01')").run(DAY);
 await f.api('catering/orders','POST',{booking_code:'BK-DIRECT',config:{course:'classic',people:60},status:'confirmed'});
 for(const endpoint of ['bookings','reservations'])assert.deepEqual((await f.api(endpoint)).items.find(x=>(x.booking_code||x.code)==='BK-DIRECT').services,[{kind:'catering',status:'confirmed'}]);
});
test('취소는 별도 표시하며 삭제·미선택 구성과 금액만으로 확정 칩을 만들지 않는다',()=>{
 assert.deepEqual(reservationServices({catering:{removed:true,status:'confirmed'},reception:null,cocktail:{price:1200000}}),[{kind:'cocktail',status:'pending'}]);
 assert.deepEqual(reservationServices({catering:{status:'confirmed'},cocktail:{status:'cancelled'}},{ref:'CO-LATEST',status:'pending'}),[{kind:'catering',status:'pending'},{kind:'cocktail',status:'cancelled'}]);
 for(const value of [null,'not json','{}',{catering:[],reception:{},cocktail:'confirmed'}])assert.deepEqual(reservationServices(value),[]);
});
