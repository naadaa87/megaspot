import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {onRequest as customer} from '../functions/api/deposit-refunds/[[path]].js';
import {refundDate,eventTime,cleanAccount,seal,unseal,CONSENT_VERSION,purgeAccounts} from '../functions/api/_deposit_refunds.js';
const PATH='deposit-refunds/bookings/BK-TEST';
function setup(t){
 const f=fixture({booking:true,date:'2026-11-01'});t.after(()=>f.db.close());f.env.DEPOSIT_ACCOUNT_KEY='12'.repeat(32);t.mock.method(Date,'now',()=>Date.parse('2026-11-03T14:00:00+09:00'));
 let token;const input=(extra={})=>({bank:'081',account:'001234567890',account_confirm:'001234567890',holder:'홍길동',agree:true,consent_version:CONSENT_VERSION,version:0,...extra});
 async function call(method='GET',body,key=token,origin='https://megaspot-guide.pages.dev'){
  return customer({env:f.env,params:{path:['customer']},request:new Request('https://local.test/api/deposit-refunds/customer',{method,headers:{origin,'CF-Connecting-IP':'127.0.0.1','content-type':'application/json',...(key?{authorization:'Bearer '+key}:{})},...(body?{body:JSON.stringify(body)}:{})})});
 }
 const item=async()=>(await f.api(PATH)).item;
 async function link(){const r=await f.api(PATH+'/link','POST',{});token=r.url.split('=')[1];return r;}
 async function register(extra={}){const r=await call('POST',input(extra));assert.equal(r.status,200,await r.clone().text());return r.json();}
 async function ready(){await link();await register();await f.api('bookings/BK-TEST/deposit-paid','PUT',{paid:true});let b=await item();await f.api(PATH+'/settlement','POST',{revision:b.revision,amount:150000,deduction:0,operator:'검증 담당자',inspected:true});return item();}
 async function claim(){const b=await item();return f.api(PATH+'/claim','POST',{revision:b.revision,confirm_start:true});}
 async function complete(){const b=await item();return f.api(PATH+'/complete','POST',{revision:b.revision,paid_amount:b.refund_amount,confirm_transfer:true,confirm_payee:true});}
 return {...f,input,call,item,link,register,ready,claim,complete,token:()=>token};
}
test('다음 주 수요일 계산은 이용 종료일·자정·익일·연말 기준',()=>{
 for(const [date,end,expected]of [['2026-11-01',17,'2026-11-04'],['2026-11-02',17,'2026-11-11'],['2026-11-04',17,'2026-11-11'],['2026-11-08',24,'2026-11-18'],['2026-12-31',31,'2027-01-06']])assert.equal(refundDate({date,start_h:10,end_h:end}),expected);
 assert.equal(eventTime({date:'2026-11-01',slot:'pkg-allnight'}).end_date,'2026-11-02');assert.equal(refundDate({date:'2026-11-01'}),null);
});
test('형식·동의·확인 계좌·은행 코드·금액 변조 검증',()=>{
 const valid={bank:'081',account:'00123456789',account_confirm:'00123456789',holder:'주식회사 테스트',agree:true,consent_version:CONSENT_VERSION,version:0};assert.equal(cleanAccount(valid).account,valid.account);
 for(const d of [{bank:'__proto__'},{account:'123abc45678'},{agree:'true'},{holder:'<script>'},{account_confirm:'999999999'},{version:'0'},{consent_version:'old'}])assert.ok(cleanAccount({...valid,...d}).error);
});
test('관리자 인증·동일 출처·암호화 미설정·시간 미정·취소 예약 차단',async t=>{
 const f=setup(t);const response=await f.handle(new Request('https://local.test/api/admin/deposit-refunds'));assert.equal(response.status,401);
 const bad=await f.handle(new Request('https://local.test/api/admin/'+PATH+'/link',{method:'POST',headers:{origin:'https://evil.test','x-admin-key':f.env.ADMIN_KEY},body:'{}'}));assert.equal(bad.status,403);
 delete f.env.DEPOSIT_ACCOUNT_KEY;await f.api(PATH+'/link','POST',{},503);f.env.DEPOSIT_ACCOUNT_KEY='12'.repeat(32);
 f.db.exec("UPDATE bookings SET start_h=NULL,end_h=NULL,slot=NULL");await f.api(PATH+'/link','POST',{},409);f.db.exec("UPDATE bookings SET status='cancelled'");await f.api(PATH+'/link','POST',{},409);
});
test('전용 토큰만 허용·CORS 제한·응답 마스킹·계좌 원문 암호화·계좌 변경 CAS',async t=>{
 const f=setup(t),r=await f.link();assert.match(r.url,/^https:\/\/megaspot-guide.pages.dev\/#refund-account=[A-Za-z0-9_-]{43}$/);assert.equal((await f.link()).url,r.url);
 assert.equal((await f.call('GET',null,'wrong')).status,403);assert.equal((await f.call('GET',null,undefined,'https://evil.test')).status,403);
 const preflight=await f.call('OPTIONS');assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://megaspot-guide.pages.dev');assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
 await f.register();const row=f.db.prepare('SELECT * FROM booking_refunds').get();assert.ok(!row.account_cipher.includes('001234567890'));assert.ok(!JSON.stringify(row).includes('홍길동'));assert.ok(!JSON.stringify(row).includes(f.token()));
 const data=await(await f.call()).json();assert.equal(data.item.account_mask,'•••• 7890');for(const s of ['001234567890','홍길동','account_cipher','token_hash'])assert.ok(!JSON.stringify(data).includes(s));
 const rv=await f.api(PATH+'/reveal','POST',{revision:(await f.item()).revision});assert.equal(rv.account.account,'001234567890');assert.equal(rv.account.holder,'홍길동');
 assert.equal((await f.call('POST',f.input())).status,409);await f.register({version:1,account:'009876543210',account_confirm:'009876543210'});assert.equal((await f.item()).account_version,2);
 const logs=JSON.stringify(f.db.prepare('SELECT detail FROM event_log').all());assert.ok(!logs.includes('001234567890'));assert.ok(!logs.includes(f.token()));
});
test('암호문은 다른 예약·용도에 재사용 불가',async t=>{const f=setup(t),c=await seal(f.env,'BK-TEST','account',{value:'secret'});assert.deepEqual(await unseal(f.env,'BK-TEST','account',c),{value:'secret'});await assert.rejects(()=>unseal(f.env,'BK-OTHER','account',c));await assert.rejects(()=>unseal(f.env,'BK-TEST','link',c));});
test('링크 재발급은 기존 링크 폐기·계좌 보존·다른 예약 계좌 접근 차단',async t=>{
 const f=setup(t);await f.link();await f.register();const old=f.token(),b=await f.item();const r=await f.api(PATH+'/rotate-link','POST',{revision:b.revision,confirm_revoke:true});assert.notEqual(r.url.split('=')[1],old);assert.equal((await f.call('GET',null,old)).status,403);assert.equal((await f.item()).registered,true);
});
test('차감 사전 안내·입금·시설·이용 종료 없이는 처리 불가',async t=>{
 const f=setup(t);await f.link();await f.register();let b=await f.item();await f.api(PATH+'/claim','POST',{revision:b.revision,confirm_start:true},409);
 await f.api(PATH+'/settlement','POST',{revision:b.revision,amount:150000,deduction:20000,operator:'담당자',inspected:true},400);
 await f.api(PATH+'/settlement','POST',{revision:b.revision,amount:150000,deduction:200000,operator:'담당자',inspected:true},400);
 f.db.exec("UPDATE bookings SET date='2026-12-01'");await f.api(PATH+'/settlement','POST',{revision:b.revision,amount:150000,deduction:0,operator:'담당자',inspected:true},409);
});
test('동시 처리 시작은 한 번만 성공·고객 수정 잠금·다른 로그인 완료 금지',async t=>{
 const f=setup(t),b=await f.ready();const req=()=>f.handle(new Request('https://local.test/api/admin/'+PATH+'/claim',{method:'POST',headers:{origin:'https://local.test','x-admin-key':f.env.ADMIN_KEY},body:JSON.stringify({revision:b.revision,confirm_start:true})}));
 const r=await Promise.all([req(),req()]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
 assert.equal((await f.call('POST',f.input({version:1}))).status,409);
 const p=await f.item();const other=await f.handle(new Request('https://local.test/api/admin/'+PATH+'/complete',{method:'POST',headers:{origin:'https://local.test','x-admin-key':f.env.ADMIN_KEY,cookie:'ms_admin=different-session'},body:JSON.stringify({revision:p.revision,paid_amount:150000,confirm_transfer:true,confirm_payee:true})}));assert.equal(other.status,409);
});
test('환급 완료는 송금액 재확인·시설 변경 재검사·기존 체크 보존·재처리 차단',async t=>{
 const f=setup(t);await f.ready();await f.claim();let b=await f.item();
 await f.api(PATH+'/complete','POST',{revision:b.revision,paid_amount:1,confirm_transfer:true,confirm_payee:true},400);
 f.db.exec("UPDATE bookings SET end_h=18");await f.api(PATH+'/complete','POST',{revision:b.revision,paid_amount:150000,confirm_transfer:true,confirm_payee:true},409);f.db.exec('UPDATE bookings SET end_h=17');
 await f.complete();b=await f.item();assert.equal(b.state,'completed');assert.equal(b.refund_amount,150000);const checks=JSON.parse(f.db.prepare('SELECT checks FROM inquiry_checks').get().checks);assert.ok(checks.guarantee_paid);assert.ok(checks.guarantee_returned);
 await f.api(PATH+'/complete','POST',{revision:b.revision,paid_amount:150000,confirm_transfer:true,confirm_payee:true},409);await f.api('inquiries/MS-TEST/checks','PUT',{checks:{guarantee_returned:false}},409);
});
test('보류 상태 잠금·미송금 확인 없는 복구 거부·복구 후 시설 재확인',async t=>{
 const f=setup(t);await f.ready();await f.claim();let b=await f.item();await f.api(PATH+'/hold','POST',{revision:b.revision,reason:'은행 송금 결과 확인 중'});assert.equal((await f.call('POST',f.input({version:1}))).status,409);
 b=await f.item();await f.api(PATH+'/release','POST',{revision:b.revision,reason:'미송금 확인'},400);await f.api(PATH+'/release','POST',{revision:b.revision,reason:'은행 이체 미처리 확인',confirm_not_transferred:true});assert.equal((await f.item()).inspected,false);
});
test('기존 반환 완료 예약은 다시 등록·송금하지 않음',async t=>{
 const f=setup(t);f.db.prepare('INSERT INTO inquiry_checks(ref,checks,updated_at) VALUES(?,?,?)').run('MS-TEST','{"guarantee_returned":true}','old');await f.api(PATH+'/link','POST',{},409);const l=await f.api('deposit-refunds?filter=due');assert.equal(l.items.length,0);
});
test('완료 30일·미완료 90일 후 계좌와 링크 삭제·송금 기록 보존',async t=>{
 const f=setup(t);await f.ready();await f.claim();await f.complete();const cutoff=f.db.prepare('SELECT account_expires_at FROM booking_refunds').get().account_expires_at;
 t.mock.method(Date,'now',()=>cutoff);await purgeAccounts(f.env);const b=f.db.prepare('SELECT * FROM booking_refunds').get();assert.equal(b.account_cipher,null);assert.equal(b.link_cipher,null);assert.equal(b.token_hash,null);assert.equal(b.account_mask,null);assert.equal(b.paid_amount,150000);assert.ok(b.completed_at);assert.equal((await f.call()).status,403);
});
test('최초 보증금은 확정서·최근 견적 기준, 프론트 입력으로 바뀌지 않음',async t=>{
 const f=setup(t);f.db.prepare('UPDATE bookings SET confirm_doc=?').run('{"deposit":200000}');await f.link();assert.equal((await f.item()).amount,200000);await f.register({amount:1});assert.equal((await f.item()).amount,200000);
});
test('2호 계좌 등록은 1호 출입 안내로 연결하지 않음',async t=>{const f=setup(t);f.db.exec("UPDATE bookings SET space_id='megaspot-gundae-2'");const r=await f.link();assert.match(r.url,/^https:\/\/local.test\/deposit\/#refund-account=/);});
test('같은 문의에 여러 예약이 있으면 마지막 환급까지 반환 체크를 완료하지 않는다',async t=>{
 const f=setup(t);f.db.exec("INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,start_h,end_h,created_at) SELECT 'BK-OTHER',space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,start_h,end_h,created_at FROM bookings");
 await f.ready();await f.claim();await f.complete();const checks=JSON.parse(f.db.prepare('SELECT checks FROM inquiry_checks').get().checks);assert.ok(!checks.guarantee_returned);
 await f.api('deposit-refunds/bookings/BK-OTHER/link','POST',{});
 const list=await f.api('deposit-refunds?filter=due');assert.ok(list.items.some(b=>b.code==='BK-OTHER'));
});
test('전액 차감은 계좌 없이 정산하되 사전 안내·0원 확인·중복 잠금을 적용',async t=>{
 const f=setup(t);await f.link();await f.api('bookings/BK-TEST/deposit-paid','PUT',{paid:true});let b=await f.item();await f.api(PATH+'/settlement','POST',{revision:b.revision,amount:150000,deduction:150000,deduction_reason:'시설 복구 비용 사전 협의',deduction_notified:true,operator:'담당자',inspected:true});await f.claim();await f.complete();assert.equal((await f.item()).refund_amount,0);
});
test('일일 정리 Worker는 만료된 계좌만 삭제하고 환급 처리 기록은 유지',async t=>{
 const f=setup(t);await f.link();await f.register();const at=f.db.prepare('SELECT account_expires_at FROM booking_refunds').get().account_expires_at;
 await purgeAccounts(f.env);assert.ok(f.db.prepare('SELECT account_cipher FROM booking_refunds').get().account_cipher);t.mock.method(Date,'now',()=>at);await purgeAccounts(f.env);const row=f.db.prepare('SELECT * FROM booking_refunds').get();assert.equal(row.account_cipher,null);assert.ok(row.submitted_at);await purgeAccounts(f.env);assert.equal(f.db.prepare('SELECT purged_at FROM booking_refunds').get().purged_at,row.purged_at);
});

test('일일 작업은 DB 접근 없이 서버의 만료 전용 경로만 호출',async t=>{
 const {triggerCleanup}=await import('../deploy/deposit-retention/worker.js');let calls=0;t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://megaspot.kr/api/deposit-refunds/cleanup');assert.equal(options.method,'POST');assert.equal(options.body,'{}');calls++;return new Response(null,{status:204});});await triggerCleanup();assert.equal(calls,1);
});
test('정리 경로는 임의 예약·만료 시각을 무시하고 실제 만료 계좌만 삭제',async t=>{
 const f=setup(t);await f.link();await f.register();const req=()=>customer({env:f.env,params:{path:['cleanup']},request:new Request('https://local.test/api/deposit-refunds/cleanup',{method:'POST',body:JSON.stringify({code:'BK-TEST',cutoff:9999999999999})})});assert.equal((await req()).status,204);assert.ok(f.db.prepare('SELECT account_cipher FROM booking_refunds').get().account_cipher);
 const at=f.db.prepare('SELECT account_expires_at FROM booking_refunds').get().account_expires_at;t.mock.method(Date,'now',()=>at);assert.equal((await req()).status,204);assert.equal(f.db.prepare('SELECT account_cipher FROM booking_refunds').get().account_cipher,null);
});
test('로그인 만료·담당자 변경 후 은행 결과 대조를 거쳐 잠금 유지한 채 이어받기',async t=>{
 const f=setup(t);await f.ready();await f.claim();let b=await f.item();await f.api(PATH+'/hold','POST',{revision:b.revision,reason:'이체 결과 확인 후 담당자 변경'});b=await f.item();assert.equal(b.can_resume,true);
 await f.api(PATH+'/resume','POST',{revision:b.revision,reason:'은행 결과 확인',operator:'다음 담당자'},400);
 const r=await f.handle(new Request('https://local.test/api/admin/'+PATH+'/resume',{method:'POST',headers:{origin:'https://local.test','x-admin-key':f.env.ADMIN_KEY,cookie:'ms_admin=next-session'},body:JSON.stringify({revision:b.revision,reason:'은행 송금 성공 대조 완료',operator:'다음 담당자',confirm_reconciled:true})}));assert.equal(r.status,200);assert.equal((await f.item()).state,'processing');assert.equal((await f.call('POST',f.input({version:1}))).status,409);
 b=await f.item();const complete=await f.handle(new Request('https://local.test/api/admin/'+PATH+'/complete',{method:'POST',headers:{origin:'https://local.test','x-admin-key':f.env.ADMIN_KEY,cookie:'ms_admin=next-session'},body:JSON.stringify({revision:b.revision,paid_amount:150000,confirm_payee:true,confirm_transfer:true})}));assert.equal(complete.status,200);
});
