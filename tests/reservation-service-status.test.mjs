import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './helpers/admin-fixture.mjs';
for(const kind of ['catering','cocktail','reception'])test(kind+' 상태만 변경하면 저장 가격 유지·취소 합계 제외·복원·오래된 요청 거절',async t=>{
 const f=fixture({booking:true});t.after(()=>f.db.close());
 if(kind==='catering')await f.api('catering/orders','POST',{inquiry_ref:'MS-TEST',config:{course:'classic',people:60},status:'pending'});
 else await f.api('inquiries/MS-TEST','PATCH',{[kind]:kind==='cocktail'?{cups:100,status:'pending'}:{people:50,format:'table',status:'pending'}});
 let data=JSON.parse(f.db.prepare("SELECT data FROM inquiries WHERE ref='MS-TEST'").get().data),saved=structuredClone(data[kind]);const amount=kind==='cocktail'?saved.total:saved.total;
 Object.assign(data,{total:500000+amount,amount_override:true,[kind+'_in_quote']:true,['included_'+kind+'_amount']:amount});f.db.prepare("UPDATE inquiries SET data=? WHERE ref='MS-TEST'").run(JSON.stringify(data));
 const path='reservation-services/booking/BK-TEST/'+kind,initial=await f.api(path);assert.equal(initial.can_confirm,true);
 for(const status of ['confirmed','cancelled','pending']){
  const current=await f.api(path);await f.api(path,'PUT',{status,expected_revision:current.revision});
  data=(await f.api('inquiries/MS-TEST')).item.data;const value={...data[kind]};delete value.status;delete value.status_label;delete value.confirmed_at;const before={...saved};delete before.status;delete before.status_label;delete before.confirmed_at;assert.deepEqual(value,before);
  assert.equal((await f.api('bookings')).items[0].amount,status==='cancelled'?500000:500000+amount);
 }
 await f.api(path,'PUT',{status:'confirmed',expected_revision:initial.revision},409);
});
test('미구성 확정과 취소된 예약 변경 차단',async t=>{const f=fixture({booking:true});t.after(()=>f.db.close());await f.api('inquiries/MS-TEST','PATCH',{catering:{summary:'상담 희망'}});const path='reservation-services/booking/BK-TEST/catering',info=await f.api(path);assert.equal(info.can_confirm,false);await f.api(path,'PUT',{status:'confirmed',expected_revision:info.revision},409);f.db.prepare("UPDATE bookings SET status='cancelled'").run();await f.api(path,'PUT',{status:'pending',expected_revision:info.revision},409);});
test('문의 없는 기존 예약도 뷔페 상태·합계·저장 구성을 함께 유지한다',async t=>{const f=fixture({booking:true});t.after(()=>f.db.close());f.db.prepare("UPDATE bookings SET inquiry_ref=NULL").run();const order=(await f.api('catering/orders','POST',{booking_code:'BK-TEST',config:{course:'classic',people:60},status:'pending',include_in_booking:true})).item;const path='reservation-services/booking/BK-TEST/catering';for(const status of ['confirmed','cancelled','pending']){const info=await f.api(path);await f.api(path,'PUT',{status,expected_revision:info.revision});assert.equal((await f.api('bookings')).items[0].amount,500000+(status==='cancelled'?0:order.total));assert.equal((await f.api('catering/orders/'+order.ref)).item.status,status);}});
