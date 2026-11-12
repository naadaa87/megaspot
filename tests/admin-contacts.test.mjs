import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,DAY} from './helpers/admin-fixture.mjs';
import {contactPhones} from '../functions/api/_contacts.js';
import {SCHEMA} from '../functions/api/_schema.js';
function setup(t,options){const f=fixture(options);t.after(()=>f.db.close());return f;}
test('직접 문의의 두 연락처는 확인·편집·예약 확정 후에도 유지되고 대표 번호 뒷자리는 바뀌지 않는다',async t=>{
 const f=setup(t);const inquiry=await f.api('inquiries','POST',{name:'두 담당자',phone:'010-1111-2222',phone2:'+82 10-3333-4444',space_id:'megaspot-gundae',date:DAY,start_h:10,end_h:17});
 const detail=await f.api('inquiries/'+inquiry.ref);assert.equal(detail.item.data.phone2,'01033334444');
 const result=await f.api('inquiries/'+inquiry.ref+'/confirm','POST',{date:DAY,start_h:10,end_h:17,headcount:30,amount:500000});
 const c=await f.api('bookings/'+result.booking_code+'/contacts');assert.deepEqual(c.recipients,['01011112222','01033334444']);
 assert.equal(f.db.prepare('SELECT phone_last4 FROM bookings WHERE booking_code=?').get(result.booking_code).phone_last4,'2222');
 await f.api('inquiries/'+inquiry.ref,'PATCH',{edit:true,...detail.item.data,name:'두 담당자',phone:'010-1111-2222',phone2:'01055556666',date:DAY,start_h:10,end_h:17,headcount:30,amount_mode:'keep'});
 assert.equal((await f.api('bookings/'+result.booking_code+'/contacts')).phone2,'01055556666');
});
test('직접 예약의 추가 번호를 저장·변경·삭제하고 중복 번호는 하나로 정리한다',async t=>{
 const f=setup(t);const r=await f.api('bookings','POST',{customer_name:'두 번호',phone:'01011112222',phone2:'01033334444',space_id:'megaspot-gundae',date:DAY,start_h:18,end_h:22,amount:600000});
 let c=await f.api('bookings/'+r.booking_code+'/contacts');assert.equal(c.phone2,'01033334444');
 assert.equal((await f.api('bookings')).items.find(b=>b.booking_code===r.booking_code).phone2,'01033334444');
 c=await f.api('bookings/'+r.booking_code+'/contacts','PUT',{phone:'010-1111-2222',phone2:'+82 10 1111 2222'});assert.equal(c.phone2,'');assert.equal(c.recipients.length,1);
 await f.api('bookings/'+r.booking_code+'/contacts','PUT',{phone:'010-1111-2222',phone2:'잘못된번호'},400);
 assert.equal((await f.api('bookings/'+r.booking_code+'/contacts')).phone2,'');
 assert.equal(f.db.prepare('SELECT amount FROM bookings WHERE booking_code=?').get(r.booking_code).amount,600000);
});
test('연결 예약 연락처 관리는 문의와 다른 활성 예약에 동기화하고 추가 번호 삭제도 반영한다',async t=>{
 const f=setup(t,{booking:true});await f.api('bookings/BK-TEST/contacts','PUT',{phone:'01012345678',phone2:'01033334444'});
 let d=await f.api('inquiries/MS-TEST');assert.equal(d.item.data.phone2,'01033334444');assert.equal(d.item.phone,'010-1234-5678');
 await f.api('bookings/BK-TEST/contacts','PUT',{phone:'01012345678',phone2:''});d=await f.api('inquiries/MS-TEST');assert.equal(d.item.data.phone2,'');assert.equal((await f.api('bookings/BK-TEST/contacts')).phone2,'');
});
test('추가 연락처 API도 관리자 인증을 요구하며 자동 스키마 재적용은 기존 번호를 보존한다',async t=>{
 const f=setup(t,{booking:true});const r=await f.handle(new Request('https://local.test/api/admin/bookings/BK-TEST/contacts'));assert.equal(r.status,401);
 await f.api('bookings/BK-TEST/contacts','PUT',{phone:'01012345678',phone2:'01033334444'});for(const sql of SCHEMA)f.db.exec(sql);
 assert.equal((await f.api('bookings/BK-TEST/contacts')).phone2,'01033334444');
 assert.deepEqual(contactPhones({phone:'010-1234-5678',phone2:'+82 10 1234 5678'}),['01012345678']);
});

test('문의에서 예약 등록 화면으로 가져온 추가 번호도 확정 저장에 반영한다',async t=>{
 const f=setup(t);const r=await f.api('bookings','POST',{inquiry_ref:'MS-TEST',date:DAY,start_h:10,end_h:17,headcount:30,amount:500000,phone2:'01033334444'});
 assert.equal((await f.api('bookings/'+r.booking_code+'/contacts')).phone2,'01033334444');assert.equal((await f.api('inquiries/MS-TEST')).item.data.phone2,'01033334444');
});
