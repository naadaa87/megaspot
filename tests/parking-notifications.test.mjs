import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as base} from './helpers/admin-fixture.mjs';
import {onRequest} from '../functions/api/parking/[[path]].js';
import {PARKING_TEMPLATES as T,PARKING_BUTTONS as B} from '../functions/api/_parking_templates.js';
import {parkingSign,parkingNoticeAccess,parkingNoticeVariables,parkingNoticeRender,parkingNoticeObsolete,parkingNoticeTick} from '../functions/api/_parking_notifications.js';
import {now,kstToday} from '../functions/api/_lib.js';
const OID='MSPARKINGTEST001';
function fixture(t){
 const f=base();t.after(()=>f.db.close());
 Object.assign(f.env,{ALIGO_LIVE_ENABLED:'true',ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'test-parking-relay-secret-more-than-32',ALIGO_SENDER_KEY:'test-profile',ALIGO_SENDER:'01012345678'});
 f.db.prepare("INSERT INTO orders(oid,product_id,title,price,buyer_name,buyer_phone,data,status,created_at) VALUES(?,'parking-2h','주차 2시간',8000,'시험 고객','01012345678','{}','created',?)").run(OID,now());
 f.db.prepare("INSERT INTO parking_orders(oid,plate,visit_date,ticket,hours,token_hash,created_at,updated_at) VALUES(?,'123가4567',?,'2h',2,?,?,?)").run(OID,kstToday(),'b'.repeat(64),now(),now());
 let review='APR',result='0',sms=false,broken=false,reportDate=null;
 const sent=[];
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  assert.equal(url,f.env.ALIGO_RELAY_URL);assert.equal(opts.redirect,'manual');const r=JSON.parse(opts.body);
  assert.equal(opts.headers['X-Megaspot-Signature'],await parkingSign(f.env.ALIGO_RELAY_SECRET,opts.body));
  if(r.path==='template/list'){const t=Object.values(T).find(t=>t.code===r.data.tpl_code);return Response.json({code:0,list:[{templtCode:t.code,inspStatus:review,status:'R',templtContent:t.content,buttons:B.map(b=>({name:b.name,linkType:b.linkType,linkMo:b.linkM,linkPc:b.linkP}))}]});}
  if(r.path==='alimtalk/send'){sent.push(r);if(broken)throw Error('unknown outcome');return Response.json({code:0,info:{mid:String(sent.length),scnt:1}});}
  if(r.path==='history/detail'){
   const previous=sent[Number(r.data.mid)-1].data;
   return Response.json({code:0,list:[{type:'AT',phone:previous.receiver_1,tpl_code:previous.tpl_code,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:reportDate??now(),rslt:result,smid:sms?'999':'0'}]});
  }
  if(r.path==='sms/detail')return Response.json({result_code:1,list:[{type:'LMS',receiver:'01011112222',send_date:now(),sms_state:'발송완료'}]});
  assert.fail('Unexpected operation');
 });
 async function api(path,body,method=body?'POST':'GET',expected=200){const r=await onRequest({env:f.env,params:{path:('admin/notifications'+path).split('/')},request:new Request('https://megaspot.test/api/parking/admin/notifications'+path,{method,headers:{origin:'https://megaspot.test','Content-Type':'application/json','x-admin-key':f.env.ADMIN_KEY},...(body===undefined?{}:{body:JSON.stringify(body)})})});const j=await r.json();assert.equal(r.status,expected,JSON.stringify(j));return j;}
 async function enable(){await api('/test',{oid:OID,phone:'01011112222',kind:'paid',confirm_test:true});await api('/refresh',{});await api('/settings',{enabled:true},'PUT');}
 return {...f,api,enable,sent,setReview:v=>review=v,setReportDate:v=>reportDate=v,setSms:()=>{result='U';sms=true;},setBroken:()=>broken=true};
}
test('기본은 고객 발송 중지이며 이전 주문은 소급 적재하지 않는다',async t=>{
 const f=fixture(t);assert.equal((await f.api('')).enabled,false);f.db.prepare("UPDATE orders SET status='paid' WHERE oid=?").run(OID);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM parking_notifications').get().n,0);
 await f.enable();assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM parking_notifications WHERE mode='live'").get().n,0);
});
test('승인 전 시험 발송·시험 수신 전 고객 활성화를 차단',async t=>{
 const f=fixture(t);f.setReview('REQ');await f.api('/test',{oid:OID,phone:'01011112222',kind:'paid',confirm_test:true},'POST',409);await f.api('/settings',{enabled:true},'PUT',409);assert.equal(f.sent.length,0);
});
test('상태 변경과 같은 DB 트랜잭션으로 이벤트 기록·중복 결제와 입차 재요청은 한 번',async t=>{
 const f=fixture(t);await f.enable();
 f.db.prepare("UPDATE orders SET status='paid',paid_at=? WHERE oid=?").run(now(),OID);f.db.prepare("UPDATE orders SET status='paid' WHERE oid=?").run(OID);
 f.db.prepare("UPDATE parking_orders SET arrival_at=?,status='requested' WHERE oid=?").run(now(),OID);f.db.prepare('UPDATE parking_orders SET arrival_at=arrival_at WHERE oid=?').run(OID);
 const rows=f.db.prepare("SELECT kind FROM parking_notifications WHERE mode='live'").all();assert.deepEqual(rows.map(r=>r.kind),['paid','arrival_received']);
 f.db.exec('BEGIN');f.db.prepare("UPDATE parking_orders SET status='applied',updated_at=? WHERE oid=?").run(now(),OID);f.db.exec('ROLLBACK');assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM parking_notifications WHERE kind='applied'").get().n,0);
});
test('취소 문의는 환불 알림을 만들지 않고 같은 문의 재시도는 중복되지 않는다',async t=>{
 const f=fixture(t);await f.enable();const stamp=now();f.db.prepare('UPDATE parking_orders SET refund_requested_at=? WHERE oid=?').run(stamp,OID);f.db.prepare('UPDATE parking_orders SET refund_requested_at=? WHERE oid=?').run(stamp,OID);
 assert.deepEqual(f.db.prepare("SELECT kind FROM parking_notifications WHERE mode='live'").all().map(x=>x.kind),['cancel_requested']);
});
test('부분 환불 거래별 스냅샷과 최종 전체 환불을 구분하고 중복 콜백 방지',async t=>{
 const f=fixture(t);await f.enable();for(const [id,amount] of [['one',2000],['one',2000],['two',6000]])f.db.prepare('INSERT OR IGNORE INTO payapp_refunds VALUES(?,?,?,?)').run(id,OID,amount,now());
 const rows=f.db.prepare("SELECT kind,payload FROM parking_notifications WHERE mode='live'").all();assert.deepEqual(rows.map(x=>x.kind),['partially_refunded','refunded']);assert.equal(JSON.parse(rows[0].payload).refunded_amount,2000);assert.equal(JSON.parse(rows[1].payload).refunded_amount,8000);
});
test('발송 접수와 도착 구분·다른 기기의 보안 링크 조회·만료 검사',async t=>{
 const f=fixture(t);await f.enable();f.db.prepare("UPDATE orders SET status='paid',paid_at=? WHERE oid=?").run(now(),OID);await parkingNoticeTick(f.env);
 const e=f.db.prepare("SELECT * FROM parking_notifications WHERE mode='live'").get();assert.equal(e.status,'accepted');const sent=f.sent.at(-1).data;assert.equal(sent.receiver_1,'01012345678');assert.match(sent.message_1,/차량 끝번호: 4567/);assert.ok(!sent.message_1.includes('123가'));assert.ok(!/#\{/.test(sent.fmessage_1));
 const link=JSON.parse(sent.button_1).button[0].linkMo,key=link.split('&key=')[1];assert.equal(await parkingNoticeAccess(f.env,OID,key),true);assert.equal(await parkingNoticeAccess(f.env,'OTHER',key),false);
 f.db.prepare('UPDATE parking_notification_links SET expires_at=0 WHERE notification_id=?').run(e.id);assert.equal(await parkingNoticeAccess(f.env,OID,key),false);await parkingNoticeTick(f.env);assert.equal(f.db.prepare('SELECT status FROM parking_notifications WHERE id=?').get(e.id).status,'delivered');
});
test('알림톡 실패 후 대체 문자 성공은 별도 상태로 기록',async t=>{
 const f=fixture(t);await f.api('/test',{oid:OID,phone:'01011112222',kind:'paid',confirm_test:true});f.setSms();await f.api('/refresh',{});assert.equal(f.db.prepare('SELECT status FROM parking_notifications').get().status,'sms_delivered');assert.equal((await f.api('')).test_delivered,true);
});
test('통신 결과 불명은 재시도하지 않고 결제 처리는 계속된다',async t=>{
 const f=fixture(t);await f.enable();f.setBroken();f.db.prepare("UPDATE orders SET status='paid',paid_at=? WHERE oid=?").run(now(),OID);await parkingNoticeTick(f.env);await parkingNoticeTick(f.env);assert.equal(f.sent.length,2);assert.equal(f.db.prepare("SELECT status FROM parking_notifications WHERE mode='live'").get().status,'unknown');assert.equal(f.db.prepare('SELECT status FROM orders WHERE oid=?').get(OID).status,'paid');
});
test('중지하면 대기 메시지 취소·설정 변경은 이전 시험 성공으로 활성화 불가',async t=>{
 const f=fixture(t);await f.enable();f.db.prepare("UPDATE orders SET status='paid',paid_at=? WHERE oid=?").run(now(),OID);await f.api('/settings',{enabled:false},'PUT');await parkingNoticeTick(f.env);assert.equal(f.sent.length,1);assert.equal(f.db.prepare("SELECT status FROM parking_notifications WHERE mode='live'").get().status,'cancelled');f.env.ALIGO_SENDER='01099998888';await f.api('/settings',{enabled:true},'PUT',409);
});
test('이미 처리된 단계·오래된 입차 접수·부분취소 뒤 전체 환불의 낡은 메시지는 중지',()=>{
 const p={payment_status:'paid',status:'applied',refunded_amount:0},e={kind:'arrival_received',occurred_at:now()};assert.equal(parkingNoticeObsolete(p,e),true);assert.equal(parkingNoticeObsolete({...p,status:'waiting'},{...e,occurred_at:'2000-01-01 00:00:00'}),true);assert.equal(parkingNoticeObsolete({...p,payment_status:'refunded'},{...e,kind:'partially_refunded'}),true);
});
test('구매 내역 보안 키는 본문에 넣지 않고 환불 금액은 이벤트 확정값 사용',()=>{
 const p={oid:OID,plate:'123가4567',visit_date:'2026-11-03',ticket:'2h',price:8000,refunded_amount:8000},e={occurred_at:now(),payload:JSON.stringify({refund_amount:2000,refunded_amount:2000})};const v=parkingNoticeVariables(p,e,'secret-key');const text=parkingNoticeRender(T.partially_refunded.content,v);assert.match(text,/이번 취소금액: 2,000원/);assert.match(text,/남은 결제금액: 6,000원/);assert.ok(!text.includes('secret-key'));
});
test('서명 없는 공개 스케줄 요청은 발송 기능에 접근할 수 없다',async t=>{
 const f=fixture(t);const response=await onRequest({env:f.env,params:{path:['notifications','tick']},request:new Request('https://megaspot.test/api/parking/notifications/tick',{method:'POST',body:JSON.stringify({time:Date.now()})})});assert.equal(response.status,403);assert.equal(f.sent.length,0);
});
test('읽기 전용 서명 상태 조회는 대기 메시지가 있어도 발송하지 않는다',async t=>{
 const f=fixture(t);await f.enable();f.db.prepare("UPDATE orders SET status='paid',paid_at=? WHERE oid=?").run(now(),OID);
 const body=JSON.stringify({time:Date.now(),check_templates:true});const response=await onRequest({env:f.env,params:{path:['notifications','status']},request:new Request('https://megaspot.test/api/parking/notifications/status',{method:'POST',headers:{'X-Megaspot-Signature':await parkingSign(f.env.ALIGO_RELAY_SECRET,body)},body})});
 const r=await response.json();assert.equal(response.status,200);assert.equal(r.enabled,true);assert.equal(r.templates.length,7);assert.equal(f.sent.length,1);assert.equal(f.db.prepare("SELECT status FROM parking_notifications WHERE mode='live'").get().status,'queued');
});
test('0으로 채워진 결과 시각을 실제 도착으로 인정하지 않는다',async t=>{
 const f=fixture(t);await f.api('/test',{oid:OID,phone:'01011112222',kind:'paid',confirm_test:true});f.setReportDate('0000-00-00 00:00:00');await f.api('/refresh',{});assert.equal((await f.api('')).test_delivered,false);assert.equal(f.db.prepare('SELECT status FROM parking_notifications').get().status,'accepted');
});
test('서버 전역 발송 잠금은 활성화된 주차 설정보다 우선한다',async t=>{
 const f=fixture(t);await f.enable();f.db.prepare("UPDATE orders SET status='paid',paid_at=? WHERE oid=?").run(now(),OID);f.env.ALIGO_LIVE_ENABLED='false';await parkingNoticeTick(f.env);assert.equal(f.sent.length,1);assert.equal(f.db.prepare("SELECT status FROM parking_notifications WHERE mode='live'").get().status,'cancelled');
});
