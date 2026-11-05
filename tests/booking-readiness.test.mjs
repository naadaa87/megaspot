import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,DAY,NEXT} from './helpers/admin-fixture.mjs';
import {onRequest as middleware} from '../functions/api/_middleware.js';
import {ensureSchema,kstToday} from '../functions/api/_lib.js';

function setup(t){
 const f=fixture({booking:true});t.after(()=>f.db.close());f.env.DEPOSIT_ACCOUNT_KEY='11'.repeat(32);
 t.mock.method(globalThis,'fetch',async()=>assert.fail('통합 목록에서 외부 발송·승인 조회 금지'));
 function add(code,overrides={}){
  const b={space_id:'megaspot-gundae',inquiry_ref:'MS-TEST',customer_name:'가상 고객 '+code,phone:'01012345678',date:DAY,start_h:10,end_h:17,status:'confirmed',...overrides};
  f.db.prepare('INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,start_h,end_h,status,amount,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(code,b.space_id,b.inquiry_ref,b.customer_name,b.phone,'5678',b.date,b.start_h,b.end_h,b.status,500000,'2026-11-04');
 }
 function message(code,status,{purpose='reservation-guide-v1',mode='live',at='2026-11-04 10:00:00'}={}){
  f.db.prepare('INSERT INTO booking_guide_messages(id,booking_code,purpose,mode,status,snapshot,config_hash,error,actor,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),code,purpose,mode,status,'{"private":"NO_SNAPSHOT_SECRET"}','fixture',status==='failed'?'가상 발송 실패 사유':'','fixture',at,at);
 }
 const list=(query='filter=all')=>f.api('booking-readiness?'+query);
 const one=async(code='BK-TEST')=>(await list()).items.find(x=>x.booking_code===code);
 const issue=(code='BK-TEST')=>f.api('bookings/'+code+'/confirm-doc','PUT',{doc:{show_amount:true,deposit:150000}});
 const link=(code='BK-TEST')=>f.api('bookings/'+code+'/portal-link','POST',{});
 return {...f,add,message,list,one,issue,link};
}

test('관리자만 조회 가능하고 저장 메서드는 거부',async t=>{
 const f=setup(t),r=await f.handle(new Request('https://local.test/api/admin/booking-readiness'));assert.equal(r.status,401);
 for(const method of ['POST','PUT','PATCH','DELETE'])await f.api('booking-readiness',method,{},405);
});

test('미안내·미발급·미준비가 하나의 예약 행으로 표시',async t=>{
 const f=setup(t),r=await f.list(),b=r.items[0];assert.equal(r.read_only,true);assert.equal(r.total,1);
 assert.equal(b.guide.status,'missing');assert.equal(b.confirmation.status,'missing');assert.equal(b.portal.status,'missing');
 assert.equal(b.needs_attention,true);assert.equal(r.summary.guide,1);assert.equal(r.summary.confirmation,1);assert.equal(r.summary.portal,1);
});

test('같은 문의의 복수 예약은 안내 완료를 상속하지 않음',async t=>{
 const f=setup(t);f.db.prepare("UPDATE booking_guide_state SET manual_sent='2026-11-04',manual_revision=revision WHERE booking_code='BK-TEST'").run();f.add('BK-SECOND');
 const first=await f.one(),second=await f.one('BK-SECOND');assert.equal(first.guide.status,'manual');assert.equal(first.guide.complete,true);assert.equal(second.guide.status,'missing');assert.equal(second.guide.complete,false);
});

test('운영자 시험 수신은 고객 안내 완료로 세지 않음',async t=>{
 const f=setup(t);f.message('BK-TEST','delivered',{mode:'test'});assert.equal((await f.one()).guide.complete,false);
 f.message('BK-TEST','delivered');assert.equal((await f.one()).guide.status,'delivered');assert.equal((await f.one()).guide.complete,true);
});

for(const status of ['queued','sending','accepted','unknown','failed','cancelled'])test('고객 안내 '+status+'는 수신 성공과 구분',async t=>{
 const f=setup(t);f.message('BK-TEST',status);const b=await f.one();assert.equal(b.guide.status,status);assert.equal(b.guide.complete,false);
 if(status==='failed')assert.match(b.guide.reason,/가상 발송 실패/);
});

test('변경 전 수신 성공은 현재 예약의 안내 완료가 아님',async t=>{
 const f=setup(t);f.message('BK-TEST','delivered');f.db.prepare("UPDATE bookings SET end_h=18 WHERE booking_code='BK-TEST'").run();
 const b=await f.one();assert.equal(b.revision,1);assert.equal(b.guide.status,'changed');assert.equal(b.guide.complete,false);
});

test('이전 예약 버전의 결과 불명은 재안내 전에 확인 필요',async t=>{
 const f=setup(t);f.message('BK-TEST','unknown');f.db.prepare("UPDATE bookings SET end_h=18 WHERE booking_code='BK-TEST'").run();
 assert.equal((await f.one()).guide.status,'unknown');assert.match((await f.one()).guide.label,/이전 안내 결과/);
});

test('수동 안내 체크로 변경 전 결과 불명 기록을 완료로 숨기지 않음',async t=>{
 const f=setup(t);f.message('BK-TEST','unknown');f.db.prepare("UPDATE bookings SET end_h=18 WHERE booking_code='BK-TEST'").run();
 f.db.prepare("UPDATE booking_guide_state SET manual_sent='2026-11-04',manual_revision=revision WHERE booking_code='BK-TEST'").run();
 assert.equal((await f.one()).guide.status,'unknown');assert.equal((await f.one()).guide.complete,false);
});

test('현재 예약·수납 내역의 확정서와 유효한 링크 준비를 확인',async t=>{
 const f=setup(t);await f.issue();await f.link();f.message('BK-TEST','delivered');const b=await f.one();
 assert.equal(b.confirmation.status,'issued');assert.equal(b.portal.status,'ready');assert.equal(b.ready,true);
 assert.equal((await f.list('filter=attention')).total,0);assert.equal((await f.list('filter=ready')).total,1);
});

test('기발급 확정서 무효화와 수납 변경은 재발급 필요로 표시',async t=>{
 const f=setup(t);await f.issue();
 f.db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','READINESS-PAID','receipt',50000,'2026-11-04')").run();
 assert.equal((await f.one()).confirmation.status,'outdated');
 f.db.prepare("UPDATE bookings SET confirm_doc=NULL WHERE booking_code='BK-TEST'").run();assert.equal((await f.one()).confirmation.status,'outdated');
});

test('만료·예약자 변경·암호화 키 변경을 링크 준비 완료로 표시하지 않음',async t=>{
 const f=setup(t);await f.link();assert.equal((await f.one()).portal.complete,true);
 const saved=f.db.prepare('SELECT expires_at FROM booking_portal_links').get().expires_at;
 f.db.prepare('UPDATE booking_portal_links SET expires_at=0').run();assert.equal((await f.one()).portal.status,'expired');
 f.db.prepare('UPDATE booking_portal_links SET expires_at=?').run(saved);f.env.DEPOSIT_ACCOUNT_KEY='22'.repeat(32);assert.equal((await f.one()).portal.status,'unavailable');
 f.env.DEPOSIT_ACCOUNT_KEY='11'.repeat(32);f.db.prepare("UPDATE bookings SET phone='01099998888' WHERE booking_code='BK-TEST'").run();assert.equal((await f.one()).portal.status,'changed');
});

test('정상 형식으로 복호화되지만 다른 토큰인 링크도 준비 완료가 아님',async t=>{
 const f=setup(t);await f.link();f.db.prepare("UPDATE booking_portal_links SET token_hash='wrong-token-hash'").run();assert.equal((await f.one()).portal.status,'unavailable');
});

test('결제 후 일정 확인·취소 예약은 발급과 링크 준비를 막음',async t=>{
 const f=setup(t);f.add('BK-REVIEW',{status:'payment_review'});f.add('BK-CANCEL',{status:'cancelled'});
 assert.equal((await f.list()).total,2);const b=await f.one('BK-REVIEW');assert.equal(b.blocked,true);assert.equal(b.confirmation.can_open,false);assert.equal(b.portal.can_open,false);
 assert.equal((await f.list('filter=blocked')).total,1);assert.equal((await f.list('scope=cancelled&filter=attention')).total,0);
 assert.equal((await f.list('scope=all&filter=all')).items.find(x=>x.booking_code==='BK-CANCEL').blocked,true);
});

test('상태 필터·검색·호점·기간은 예약 단위로 적용',async t=>{
 const f=setup(t);f.add('BK-SECOND',{space_id:'megaspot-gundae-2',customer_name:'행사팀2',date:NEXT});f.message('BK-TEST','delivered');
 assert.deepEqual((await f.list('filter=guide')).items.map(x=>x.booking_code),['BK-SECOND']);
 assert.equal((await f.list('filter=all&space=megaspot-gundae-2')).total,1);
 assert.equal((await f.list('filter=all&q='+encodeURIComponent('행사팀2'))).total,1);
 assert.equal((await f.list('filter=all&q=01012345678')).total,2);
 assert.equal((await f.list('filter=all&q='+encodeURIComponent("' OR 1=1 --"))).total,0);
 assert.equal((await f.list('filter=all&from='+NEXT+'&to='+NEXT)).total,1);
});

test('필터는 페이지를 자르기 전에 적용하고 집계는 전체 조회 범위 기준',async t=>{
 const f=setup(t);for(let n=0;n<51;n++)f.add('BK-'+String(n).padStart(3,'0'));
 const page0=await f.list(),page1=await f.list('filter=all&page=1');assert.equal(page0.total,52);assert.equal(page0.items.length,50);assert.equal(page0.has_more,true);assert.equal(page1.items.length,2);assert.equal(page1.has_more,false);
 f.message('BK-TEST','delivered');const only=await f.list('filter=guide&q=BK-TEST');assert.equal(only.total,0);assert.equal(only.summary.total,1);assert.equal(only.summary.guide,0);
});

test('잘못된 기간·필터·페이지는 거부',async t=>{
 const f=setup(t);for(const query of ['from=2026-02-30','from=2099-01-01&to=2098-12-31','from=2020-01-01&to=2099-01-01','space=unknown','scope=invalid','filter=invalid','page=-1','page=1x'])await f.api('booking-readiness?'+query,'GET',undefined,400);
});

test('원문 링크·암호문·이전 발송 본문·환급 계좌는 응답에 포함하지 않음',async t=>{
 const f=setup(t),link=await f.link();f.message('BK-TEST','delivered');const result=JSON.stringify(await f.list()),stored=f.db.prepare('SELECT * FROM booking_portal_links').get();
 for(const secret of [link.url,link.url.split('=')[1],stored.link_cipher,stored.token_hash,stored.recipient_hash,'NO_SNAPSHOT_SECRET'])assert.equal(result.includes(secret),false);
 for(const field of ['confirm_doc','link_cipher','account_cipher','provider_mid','token_hash','snapshot'])assert.equal(result.includes('"'+field+'"'),false);
});

test('조회는 SELECT만 실행하며 미들웨어의 발송 tick·링크 발급·설정 저장 없음',async t=>{
 const f=setup(t);await ensureSchema(f.env);await f.link();
 f.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('reservation_guide',?,?)").run(JSON.stringify({enabled:true,automatic:true,spaces:['megaspot-gundae']}),'UNCHANGED');
 f.db.prepare("INSERT INTO booking_guide_events(booking_code,revision,status) VALUES('BK-TEST',0,'pending')").run();
 const tables=['settings','bookings','booking_portal_links','booking_refunds','booking_guide_messages','booking_guide_events','booking_guide_previews','deposit_notifications'];
 const snapshot=()=>tables.map(name=>({name,rows:f.db.prepare('SELECT * FROM '+name).all()})),before=snapshot(),prepare=f.env.DB.prepare.bind(f.env.DB);
 f.env.DB.prepare=sql=>{assert.match(sql.trim(),/^(SELECT|WITH)\b/i,'조회 중 DB 변경 금지: '+sql.slice(0,80));return prepare(sql);};
 const jobs=[],response=await middleware({env:f.env,request:new Request('https://local.test/api/admin/booking-readiness'),waitUntil:p=>jobs.push(p),next:()=>f.handle(new Request('https://local.test/api/admin/booking-readiness?filter=all',{headers:{'x-admin-key':f.env.ADMIN_KEY}}))});
 assert.equal(response.status,200);assert.equal(jobs.length,0);assert.deepEqual(snapshot(),before);
});

test('기본 기간은 전날 시작한 익일 예약도 포함',async t=>{
 const f=setup(t);f.add('BK-OVERNIGHT',{date:kstToday(-1),start_h:18,end_h:31});assert.ok((await f.list()).items.some(x=>x.booking_code==='BK-OVERNIGHT'));
});
