import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,DAY} from './helpers/admin-fixture.mjs';
import {onRequest as customer} from '../functions/api/booking-portal/[[path]].js';
import {confirmToken} from '../functions/api/_confirm.js';
import {CONSENT_VERSION,refundDate} from '../functions/api/_deposit_refunds.js';

function setup(t,{space='megaspot-gundae',issued=true,showAmount=true,deposit=230000}={}){
 const f=fixture({booking:true,space});t.after(()=>f.db.close());f.env.DEPOSIT_ACCOUNT_KEY='ab'.repeat(32);
 let token='',network=0;t.mock.method(globalThis,'fetch',async()=>{network++;throw Error('No external calls allowed in portal tests');});
 const issue=async(code='BK-TEST')=>{const r=await f.api('bookings/'+code+'/portal-link','POST',{});token=r.url.split('#booking=')[1];return r;};
 const call=async(path='view',{method='GET',body,key=token,origin='https://local.test'}={})=>{
  const response=await customer({env:f.env,params:{path:[path.split('?')[0]]},request:new Request('https://local.test/api/booking-portal/'+path,{method,headers:{origin,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
  return {status:response.status,headers:response.headers,json:await response.json()};
 };
 const input=(extra={})=>({bank:'081',account:'001234567890',account_confirm:'001234567890',holder:'가상 예금주',agree:true,consent_version:CONSENT_VERSION,version:0,...extra});
 const ready=async()=>{if(issued)f.db.prepare("INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,test,created_at) VALUES('PORTAL-FIXTURE','fixture','가상 공간',?,500000,'검증 고객','01012345678','{}','paid','BK-TEST',0,'now')").run(DAY);if(issued)await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000,deposit,show_amount:showAmount,pay_status:'paid'}});return issue();};
 return {...f,issue,call,input,ready,token:()=>token,network:()=>network};
}
test('전용 링크는 관리자·동일 출처만 발급하며 조회·설치만으로 기존 예약 링크나 발송을 만들지 않는다',async t=>{
 const f=setup(t);const unauth=await f.handle(new Request('https://local.test/api/admin/bookings/BK-TEST/portal-link',{method:'POST',body:'{}'}));assert.equal(unauth.status,401);
 const bad=await f.handle(new Request('https://local.test/api/admin/bookings/BK-TEST/portal-link',{method:'POST',headers:{'x-admin-key':f.env.ADMIN_KEY,origin:'https://evil.test'},body:'{}'}));assert.equal(bad.status,403);
 assert.equal((await f.api('bookings/BK-TEST/portal-link')).issued,false);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_portal_links').get().n,0);assert.equal((await f.call()).status,403);assert.equal(f.network(),0);
});
test('통합 링크는 별도 난수·암호화·해시를 사용하고 재복사는 같은 링크이며 기존 확정서·계좌 토큰은 접근하지 못한다',async t=>{
 const f=setup(t);const r=await f.ready(),token=f.token();assert.match(r.url,/^https:\/\/local.test\/booking\/#booking=[A-Za-z0-9_-]{43}$/);assert.equal((await f.issue()).url,r.url);
 const rows=JSON.stringify(f.db.prepare('SELECT * FROM booking_portal_links').all());assert.ok(!rows.includes(token));assert.equal((await f.call('view',{key:await confirmToken(f.env,'BK-TEST')})).status,403);
 const old=await f.api('deposit-refunds/bookings/BK-TEST/link','POST',{});assert.equal((await f.call('view',{key:old.url.split('#refund-account=')[1]})).status,403);
 assert.ok(!JSON.stringify(f.db.prepare('SELECT detail FROM event_log').all()).includes(token));assert.equal(f.network(),0);
});
test('예약별 최신 정보·보증금·기한·환급일을 통합하며 대관료 결제와 보증금 입금 확인을 구분한다',async t=>{
 const f=setup(t);await f.ready();const r=await f.call();assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
 assert.equal(r.json.booking.code,'BK-TEST');assert.equal(r.json.confirmation.pay_status,'paid');assert.equal(r.json.deposit.paid,false);assert.equal(r.json.deposit.amount,230000);assert.equal(r.json.deposit.bank.name,'하나은행');assert.equal(r.json.deposit.refund_date,refundDate({date:DAY,start_h:10,end_h:17}));
 assert.ok(!JSON.stringify(r.json).includes('010-1234-5678'));assert.equal(r.json.arrival.ready,true);
 f.db.prepare("INSERT INTO inquiry_checks VALUES('MS-TEST','{\"guarantee_paid\":true}','now')").run();const paid=await f.call();assert.equal(paid.json.deposit.paid,true);assert.equal(paid.json.deposit.bank,undefined);
});
test('확정서 미발급·금액 비공개·보증금 0원을 각각 처리하고 숨긴 금액을 다른 항목으로 노출하지 않는다',async t=>{
 const f=setup(t,{issued:false});await f.ready();assert.equal((await f.call()).json.confirmation,null);
 await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:987654,deposit:234567,show_amount:false}});const hidden=await f.call();assert.equal(hidden.json.deposit.amount,null);assert.equal(hidden.json.deposit.bank,undefined);assert.ok(!JSON.stringify(hidden.json).includes('987654'));assert.ok(!JSON.stringify(hidden.json).includes('500000'));assert.ok(!JSON.stringify(hidden.json).includes('234567'));
 f.db.prepare("UPDATE booking_refunds SET amount=0 WHERE booking_code='BK-TEST'").run();await f.api('bookings/BK-TEST/confirm-doc','PUT',{doc:{amount:500000,deposit:0,show_amount:true}});const zero=await f.call();assert.equal(zero.json.deposit.amount,0);assert.equal(zero.json.deposit.account.available,false);
});
test('2호는 전용 안내 준비 중으로 표시하고 1호 출입·와이파이·시설 링크를 반환하지 않는다',async t=>{
 const f=setup(t,{space:'megaspot-gundae-2'});await f.ready();const r=await f.call();assert.equal(r.json.arrival.ready,false);assert.match(r.json.arrival.message,/2호 전용/);assert.equal(r.json.arrival.door_code,undefined);assert.equal(r.json.arrival.wifi_password,undefined);assert.equal(r.json.arrival.equipment_url,undefined);assert.equal(r.json.deposit.account.available,true);
});
test('같은 문의의 다른 예약은 다른 전용 링크를 사용하고 임의 예약번호로 다른 계좌를 수정하지 못한다',async t=>{
 const f=setup(t);await f.ready();const first=f.token();
 f.db.prepare("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,start_h,end_h,status,created_at) VALUES('BK-SECOND','megaspot-gundae','MS-TEST','다른 예약','01099998888','8888',?,18,22,'confirmed','now')").run(DAY);
 await f.issue('BK-SECOND');assert.notEqual(f.token(),first);assert.equal((await f.call('view?code=BK-SECOND',{key:first})).json.booking.code,'BK-TEST');
 const r=await f.call('account',{method:'POST',key:first,body:f.input({booking_code:'BK-SECOND',amount:1})});assert.equal(r.status,200);assert.ok(f.db.prepare("SELECT account_cipher FROM booking_refunds WHERE booking_code='BK-TEST'").get().account_cipher);assert.equal(f.db.prepare("SELECT account_cipher FROM booking_refunds WHERE booking_code='BK-SECOND'").get().account_cipher,null);
});
test('계좌 등록은 기존 검증·동의·암호화·마스킹·버전을 재사용하고 원문·기존 초대 토큰을 반환하지 않는다',async t=>{
 const f=setup(t);await f.ready();const get=await f.call('account');assert.equal(get.status,200);assert.ok(get.json.banks.length>0);
 for(const invalid of [{agree:false},{account_confirm:'9999999999'},{version:9}])assert.notEqual((await f.call('account',{method:'POST',body:f.input(invalid)})).status,200);
 const r=await f.call('account',{method:'POST',body:f.input()});assert.equal(r.status,200);assert.equal(r.json.item.account_mask,'•••• 7890');assert.equal((await f.call()).json.deposit.account.registered,true);
 const row=f.db.prepare("SELECT * FROM booking_refunds WHERE booking_code='BK-TEST'").get();assert.ok(!JSON.stringify(row).includes('001234567890'));assert.ok(!JSON.stringify(row).includes('가상 예금주'));
 const response=JSON.stringify((await f.call()).json)+JSON.stringify(r.json);for(const s of ['001234567890','가상 예금주','link_cipher','token_hash'])assert.ok(!response.includes(s));
 assert.equal((await f.call('account',{method:'POST',body:f.input()})).status,409);assert.equal(f.network(),0);
});
test('링크 재발급은 이전 통합 링크만 폐기하고 계좌·기존 계좌 링크를 유지한다',async t=>{
 const f=setup(t);const first=await f.ready(),old=f.token();await f.call('account',{method:'POST',body:f.input()});const refundBefore=f.db.prepare('SELECT token_hash,account_cipher FROM booking_refunds').get();
 await f.api('bookings/BK-TEST/portal-link/rotate','POST',{confirm_revoke:false,version:first.version},409);
 const next=await f.api('bookings/BK-TEST/portal-link/rotate','POST',{confirm_revoke:true,version:first.version});assert.notEqual(next.url,first.url);assert.equal((await f.call('view',{key:old})).status,403);assert.equal((await f.call('view',{key:next.url.split('=')[1]})).status,200);assert.deepEqual(f.db.prepare('SELECT token_hash,account_cipher FROM booking_refunds').get(),refundBefore);
});
test('일정 변경은 같은 링크에서 최신 정보로 반영하고 연락처 변경·만료·취소는 접근을 차단한다',async t=>{
 const f=setup(t);await f.ready();const token=f.token();f.db.prepare("UPDATE bookings SET end_h=19 WHERE booking_code='BK-TEST'").run();assert.equal((await f.call()).json.booking.end_h,19);
 f.db.prepare("UPDATE bookings SET phone='01022223333' WHERE booking_code='BK-TEST'").run();assert.equal((await f.call()).status,403);await f.issue();assert.notEqual(f.token(),token);
 f.db.prepare('UPDATE booking_portal_links SET expires_at=?').run(Date.now()-1);assert.equal((await f.call()).status,403);await f.issue();f.db.prepare("UPDATE bookings SET status='cancelled' WHERE booking_code='BK-TEST'").run();assert.equal((await f.call()).status,403);assert.equal((await f.call('account',{method:'POST',body:f.input()})).status,403);
});
test('계좌 수정은 송금 처리·보류·완료·보유기간 만료 상태를 보존한다',async t=>{
 const f=setup(t);await f.ready();await f.call('account',{method:'POST',body:f.input()});
 for(const state of ['processing','hold']){f.db.prepare('UPDATE booking_refunds SET state=?').run(state);assert.equal((await f.call('account')).json.item.editable,false);assert.equal((await f.call('account',{method:'POST',body:f.input({version:1})})).status,409);}
 f.db.prepare("UPDATE booking_refunds SET state='completed',completed_at='2026-11-03 10:00:00'").run();assert.equal((await f.call()).json.deposit.returned,true);assert.equal((await f.call('account')).status,409);
 f.db.prepare("UPDATE booking_refunds SET state='pending',account_expires_at=?").run(Date.now()-1);assert.equal((await f.call()).json.deposit.account.registered,false);assert.equal((await f.call('account')).status,409);
});
test('등록 중 통합 링크가 폐기되거나 예약이 취소되면 같은 SQL 갱신 조건에서 계좌 저장을 거부한다',async t=>{
 const f=setup(t);await f.ready();const prepare=f.env.DB.prepare;let mode='rotate';
 f.env.DB.prepare=sql=>{const st=prepare(sql);if(sql.startsWith('UPDATE booking_refunds SET account_cipher=')){const run=st.run;st.run=async()=>{if(mode==='rotate')f.db.exec('UPDATE booking_portal_links SET version=version+1');else f.db.exec("UPDATE bookings SET status='cancelled'");return run.call(st);};}return st;};
 assert.equal((await f.call('account',{method:'POST',body:f.input()})).status,409);assert.equal(f.db.prepare('SELECT account_cipher FROM booking_refunds').get().account_cipher,null);
 mode='cancel';assert.equal((await f.call('account',{method:'POST',body:f.input()})).status,409);assert.equal(f.db.prepare('SELECT account_cipher FROM booking_refunds').get().account_cipher,null);
});
test('발급·조회·계좌 등록은 발송 설정과 고객 발송 이력을 변경하지 않는다',async t=>{
 const f=setup(t);f.db.prepare("INSERT INTO settings VALUES('reservation_guide','{\"enabled\":true,\"automatic\":true}','old')").run();f.db.prepare("INSERT INTO settings VALUES('deposit_alimtalk','{\"enabled\":false}','old')").run();const before=f.db.prepare('SELECT * FROM settings ORDER BY key').all();
 await f.ready();await f.call();await f.call('account',{method:'POST',body:f.input()});assert.deepEqual(f.db.prepare('SELECT * FROM settings ORDER BY key').all(),before);
 for(const table of ['booking_guide_messages','booking_guide_events','deposit_notifications','parking_notifications'])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);assert.equal(f.network(),0);
});
test('공용 페이지와 API는 토큰 없이 예약·출입·계좌 정보를 노출하지 않고 다른 출처 요청을 거부한다',async t=>{
 const f=setup(t);await f.ready();const invalid=await f.call('view',{key:'x'.repeat(43)});assert.equal(invalid.status,403);assert.ok(!JSON.stringify(invalid.json).includes('검증 고객'));assert.ok(!JSON.stringify(invalid.json).includes('door_code'));assert.equal((await f.call('view',{origin:'https://evil.test'})).status,403);
 const {readFileSync}=await import('node:fs');const html=readFileSync(new URL('../booking/index.html',import.meta.url),'utf8');assert.match(html,/noindex,nofollow,noarchive/);assert.ok(!html.includes('0105*'));assert.ok(!html.includes('#2CF96J5B5'));
});
test('통합 안내 경로는 기존 백그라운드 발송을 실행하지 않는다',async t=>{
 const f=setup(t),{onRequest:middleware}=await import('../functions/api/_middleware.js');let queued=0;
 for(const path of ['/api/booking-portal/view','/api/booking-portal/account','/api/admin/bookings/BK-TEST/portal-link'])await middleware({env:f.env,request:new Request('https://local.test'+path),next:async()=>new Response('ok'),waitUntil:()=>queued++});assert.equal(queued,0);assert.equal(f.network(),0);
});
test('링크 발급은 기존 예약의 수납 이력을 보정하거나 복제하지 않는다',async t=>{
 const f=setup(t);f.db.prepare("INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,test,created_at) VALUES('LEGACY-PORTAL','fixture','가상 공간',?,500000,'검증 고객','01012345678','{}','paid','BK-TEST',0,'now')").run(DAY);
 await f.issue();if(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='booking_payment_entries'").get())assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_entries').get().n,0);
});
test('통합 안내 스키마는 반복 적용해도 기존 설정·예약·발송 이력을 변경하지 않는다',async t=>{
 const f=setup(t),{readFileSync}=await import('node:fs');const before={bookings:f.db.prepare('SELECT * FROM bookings').all(),settings:f.db.prepare('SELECT * FROM settings').all(),messages:f.db.prepare('SELECT * FROM booking_guide_messages').all()};
 const sql=readFileSync(new URL('../migrations/20261103_booking_portal.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);
 assert.deepEqual(f.db.prepare('SELECT * FROM bookings').all(),before.bookings);assert.deepEqual(f.db.prepare('SELECT * FROM settings').all(),before.settings);assert.deepEqual(f.db.prepare('SELECT * FROM booking_guide_messages').all(),before.messages);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_portal_links').get().n,0);
});
