import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as parkingFixture} from './helpers/parking-fixture.mjs';
import {onRequest} from '../functions/api/parking/[[path]].js';
import {parkingSign,parkingNoticeAccess,parkingNoticeTick} from '../functions/api/_parking_notifications.js';
import {parkingAdminSMSTick} from '../functions/api/_parking_admin_alerts.js';
import {PARKING_TEMPLATES as T,PARKING_BUTTONS as B} from '../functions/api/_parking_templates.js';
import {AmanoClient,DISCOUNTS} from '../deploy/amano-server/client.mjs';
import {runCycle} from '../deploy/amano-server/worker.mjs';
import {notifyProblems} from '../deploy/amano-server/alerts.mjs';
import {now} from '../functions/api/_lib.js';

// The application, SQL triggers, signed automation API, worker and HTTP adapters
// are real. All three providers terminate at the mock below; unexpected I/O fails.
const phones=['01011112222','01033334444'];
const buyer='01000000000';
async function flow(t,{tickets=['1h','2h'],existingFree=[],balance=50000,missing=[],failPaid=false,appliedFallback=false}={}){
 const f=parkingFixture(t),payapp=globalThis.fetch;
 t.mock.method(Date,'now',()=>Date.parse('2026-11-03T22:10:00+09:00'));
 Object.assign(f.env,{ALIGO_LIVE_ENABLED:'true',ALIGO_RELAY_URL:'https://relay.naranhistory.com/megaspot/aligo',ALIGO_RELAY_SECRET:'parking-flow-test-secret-more-than-32',ALIGO_SENDER_KEY:'test-channel',ALIGO_SENDER:'01099990000'});
 const cars=tickets.map((ticket,i)=>({plate:['123가4567','234나5678','345다6789'][i],ticket}));
 const memory={},store={read:k=>memory[k]?structuredClone(memory[k]):null,save:(k,v)=>memory[k]=structuredClone(v)};
 const messages=[],registrations=[],paymentRequests=[];let mid=1000,chargeBalance=balance;
 const entries=cars.map((c,i)=>({id:String(100+i),plate:c.plate,cardType:'0',entryAt:'2026-11-03T21:00:00',discounts:existingFree.includes(i)?[{id:'EXISTING'+i,code:'1',memo:'',account:'another-shop'}]:[]}));
 const msgResponse=m=>Response.json({result_code:1,msg_id:m.mid,success_cnt:1,error_cnt:0});
 t.mock.method(globalThis,'fetch',async(url,opts={})=>{
  if(url==='https://api.payapp.kr/oapi/v2'){paymentRequests.push(new URLSearchParams(opts.body));return payapp(url,opts);}
  if(url===f.env.ALIGO_RELAY_URL||url==='http://127.0.0.1:8787/v1/aligo'){
   const r=JSON.parse(opts.body);assert.equal(opts.headers['X-Megaspot-Signature'],await parkingSign(f.env.ALIGO_RELAY_SECRET,opts.body));
   if(r.path==='template/list'){const v=Object.values(T).find(v=>v.code===r.data.tpl_code);assert.ok(v);return Response.json({code:0,list:[{templtCode:v.code,inspStatus:'APR',status:'R',templtContent:v.content,buttons:B.map(b=>({name:b.name,linkType:b.linkType,linkMo:b.linkM,linkPc:b.linkP}))}]});}
   if(r.path==='parking-admin/status')return Response.json({ready:true,receivers:phones});
   if(['parking-paid/send','parking-admin/send','alimtalk/send'].includes(r.path)){
    const m={...r,mid:String(++mid)};messages.push(m);
    return r.path==='alimtalk/send'?Response.json({code:0,info:{mid:m.mid,scnt:1}}):msgResponse(m);
   }
   if(r.path==='sms/detail'){const m=messages.find(m=>m.mid===String(r.data.mid));assert.ok(m);return Response.json({result_code:1,list:[{type:'LMS',receiver:m.data.receiver||m.data.receiver_1,send_date:now(),sms_state:'발송완료'}]});}
   if(r.path==='history/detail'){const m=messages.find(m=>m.mid===String(r.data.mid));assert.ok(m);const fallback=appliedFallback&&m.data.tpl_code===T.applied.code;return Response.json({code:0,list:[{type:'AT',phone:m.data.receiver_1,tpl_code:m.data.tpl_code,senderKey:f.env.ALIGO_SENDER_KEY,rsltdate:now(),rslt:fallback?'U':'0',smid:fallback?m.mid:'0'}]});}
   assert.fail('Unexpected Aligo path '+r.path);
  }
  assert.equal(new URL(url).origin,'https://a24188.pweb.kr');
  const path=new URL(url).pathname,data=new URLSearchParams(opts.body);
  if(path==='/login')return new Response('OK');
  if(path==='/discount/registration')return new Response('할인정보 등록 · 차량번호 조회');
  if(path==='/discount/registration/listForDiscount')return Response.json(entries.filter((e,i)=>!missing.includes(i)&&e.plate===data.get('carNo')).map(e=>({id:e.id,carNo:e.plate,iCardType:e.cardType,entryDateToString:e.entryAt.replace('T',' '),dtOutDate:''})));
  const e=entries.find(e=>e.id===data.get(path.endsWith('/save')?'peId':'id'));assert.ok(e);
  if(path==='/discount/registration/getForDiscount')return Response.json({flagCustomer:true,parkEntry:{iID:e.id,iLotArea:'24188',acPlate1:e.plate,iCardType:e.cardType,dtInDate:'20261103210000',dtOutDate:'',out:0},member:{userId:'test-operator',dcTimeRemainCharge:chargeBalance},listDiscountType:Object.entries(DISCOUNTS).map(([id,d])=>({id,discount_name:d.name,discount_price:d.price,discount_value:d.minutes})),parkVisitCar:e.discounts.map(h=>({idno:h.id,discountTypeId:h.code,discount_name:DISCOUNTS[h.code].name,dc_time:DISCOUNTS[h.code].minutes,discount_price:DISCOUNTS[h.code].price,used_charge:DISCOUNTS[h.code].price,tckttrns_id:e.id,memo:h.memo,account_no:h.account,create_tm:'2026-11-03 22:10:00',del_yn:'0'}))});
  assert.equal(path,'/discount/registration/save');const code=data.get('discountType');assert.ok(DISCOUNTS[code]);assert.equal(data.get('saveCnt'),'1');assert.equal(data.get('carNo'),e.plate);
  registrations.push({entry_id:e.id,plate:e.plate,code,oid:data.get('memo'),cost:DISCOUNTS[code].price});
  chargeBalance-=DISCOUNTS[code].price;e.discounts.push({id:'NEW'+registrations.length,code,memo:data.get('memo'),account:'test-operator'});
  if(failPaid&&code!=='1')throw Error('Mock provider committed discount but response was lost');
  return Response.json(true);
 });
 async function api(path,method='GET',body,key){const r=await f.call(path,method,body,key,path.startsWith('admin/'));const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j;}
 async function site(action,extra={}){const body=JSON.stringify({action,time:Date.now(),...extra});const r=await onRequest({env:f.env,params:{path:['automation','server']},request:new Request('https://megaspot.test/api/parking/automation/server',{method:'POST',headers:{'X-Megaspot-Signature':await parkingSign(f.env.ALIGO_RELAY_SECRET,body)},body})});const j=await r.json();if(!r.ok)throw Error(j.error);return j;}
 await api('admin/settings','PUT',{enabled:true});
 const p=await api('prepare','POST',f.input({vehicles:cars.map(c=>({...c,plate_confirm:c.plate}))}));
 let receipt=await api('batches/'+p.oid,'GET',undefined,p.key);
 await api('admin/notifications/test','POST',{oid:receipt.items[0].oid,kind:'paid',phone:phones[0],confirm_test:true});
 await api('admin/notifications/refresh','POST',{});
 await api('admin/notifications/settings','PUT',{enabled:true});
 await api('admin/payment-alerts/settings','PUT',{phones,enabled:false});
 await api('admin/payment-alerts/test','POST',{confirm_test:true});
 f.db.prepare("UPDATE parking_admin_sms SET updated_at=datetime('now','-1 hour')").run();await parkingAdminSMSTick(f.env);
 await api('admin/payment-alerts/settings','PUT',{phones,enabled:true});
 const setupMessages=messages.length;
 async function tick(){await parkingNoticeTick(f.env);await parkingAdminSMSTick(f.env);}
 async function drain(){for(let i=0;i<4;i++){f.db.prepare("UPDATE parking_admin_sms SET updated_at=datetime('now','-1 hour') WHERE status='accepted'").run();await tick();}}
 const paid=async()=>{assert.equal((await f.feedback(p)).status,200);assert.equal((await f.feedback(p)).status,200);};
 const client=new AmanoClient({username:'test-operator',passwordHash:'a'.repeat(64)});
 return {...f,p,cars,entries,registrations,messages,memory,store,site,api,paid,tick,drain,setupMessages,paymentRequests,run:()=>runCycle({site,client,store}),balance:()=>chargeBalance};
}

test('2대 통합 결제 → 차량별 무료 먼저 → 아마노 HTTP 등록 → 완료 알림·관리자 문자·재실행 중복 방지',async t=>{
 const f=await flow(t);assert.equal(f.paymentRequests.length,1);assert.equal(f.paymentRequests[0].get('price'),'12000');assert.equal((await f.site('orders')).items.length,0);
 await f.paid();await f.drain();
 let alerts=await f.api('admin/payment-alerts');assert.equal(alerts.count,2);
 for(const item of alerts.items)await f.api('admin/payment-alerts/'+item.oid+'/read','POST',{});
 assert.equal((await f.api('admin/payment-alerts')).count,0);
 let live=f.messages.slice(f.setupMessages);assert.equal(live.filter(m=>m.path==='parking-paid/send').length,2);assert.equal(live.filter(m=>m.path==='parking-admin/send').length,4);
 const receipt=await f.api('batches/'+f.p.oid,'GET',undefined,f.p.key);
 for(const p of receipt.items){const text=live.find(m=>m.path==='parking-paid/send'&&m.data.msg.includes(p.oid)).data.msg;assert.match(text,new RegExp(p.price.toLocaleString('ko-KR')+'원'));assert.ok(!text.includes('18:00'));const key=text.match(/&key=([a-f0-9]{64})/)[1];assert.equal(await parkingNoticeAccess(f.env,p.oid,key),true);assert.equal(await parkingNoticeAccess(f.env,receipt.items.find(x=>x.oid!==p.oid).oid,key),false);}
 const result=await f.run();assert.equal(result.processed,2);assert.deepEqual(result.issues,[]);
 for(const p of receipt.items){const actions=f.registrations.filter(r=>r.oid===p.oid);assert.deepEqual(actions.map(r=>r.code),p.ticket==='1h'?['1']:['1','6']);const row=f.db.prepare('SELECT * FROM parking_orders WHERE oid=?').get(p.oid);assert.equal(row.status,'applied');assert.equal(row.free_hours,1);assert.equal(row.paid_hours,Number(p.ticket[0])-1);const proof=f.memory.operations[p.oid].verification;assert.equal(proof.free_first_verified,true);assert.equal(proof.cost,p.ticket==='1h'?0:3000);assert.equal(proof.site_status,'applied');}
 assert.equal(f.balance(),47000);await f.drain();
 const notices=f.db.prepare("SELECT kind,status,COUNT(*) n FROM parking_notifications WHERE mode='live' GROUP BY kind,status ORDER BY kind").all();assert.deepEqual(notices.map(x=>({...x})),[{kind:'applied',status:'delivered',n:2},{kind:'paid',status:'sms_delivered',n:2}]);
 const applied=f.messages.filter(m=>m.path==='alimtalk/send'&&m.data.tpl_code===T.applied.code);assert.equal(applied.length,2);assert.ok(applied.every(m=>m.data.receiver_1===buyer&&m.data.fmessage_1&&!/#\{/.test(m.data.message_1+m.data.fmessage_1)));for(const p of receipt.items)assert.ok(applied.some(m=>m.data.message_1.includes(p.oid)&&m.data.message_1.includes(p.plate.slice(-4))));
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_admin_sms WHERE mode='live' AND status='delivered'").get().n,4);
 const after=await f.api('batches/'+f.p.oid,'GET',undefined,f.p.key);assert.ok(after.items.every(p=>p.status==='applied'));assert.equal(after.payment.price,12000);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
 const n=f.registrations.length,sent=f.messages.length;assert.equal((await f.run()).processed,0);await f.feedback(f.p);await f.drain();assert.equal(f.registrations.length,n);assert.equal(f.messages.length,sent);
});

test('한 차량의 기존 무료 사용은 확인하고 다른 차량의 무료 1시간은 별도로 선등록한다',async t=>{
 const f=await flow(t,{tickets:['2h','2h'],existingFree:[0]});await f.paid();await f.drain();assert.equal((await f.run()).processed,2);
 for(const [i,e] of f.entries.entries()){const codes=f.registrations.filter(r=>r.entry_id===e.id).map(r=>r.code);assert.deepEqual(codes,i===0?['7']:['1','6']);const row=f.db.prepare('SELECT * FROM parking_orders WHERE plate=?').get(e.plate);assert.equal(row.free_hours,i===0?0:1);assert.equal(f.memory.operations[row.oid].verification.free_existing,i===0);}
 assert.equal(f.balance(),41000);await f.drain();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_notifications WHERE kind='applied' AND status='delivered'").get().n,2);
});

test('한 차량이 미입차면 다른 차량만 완료하고 늦게 입차한 차량은 다음 주기에 무료부터 처리한다',async t=>{
 const missing=[1],f=await flow(t,{missing});await f.paid();await f.drain();let r=await f.run();assert.equal(r.processed,1);assert.equal(r.waiting,1);assert.equal(f.registrations.length,1);
 missing.length=0;r=await f.run();assert.equal(r.processed,1);assert.equal(r.waiting,0);assert.equal(f.registrations.length,3);await f.drain();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_orders WHERE status='applied'").get().n,2);
});

test('두 차량 모두 등록 완료 알림톡에 실패하면 대체 문자 전달 결과를 차량별로 확인한다',async t=>{
 const f=await flow(t,{appliedFallback:true});await f.paid();await f.drain();assert.equal((await f.run()).processed,2);await f.drain();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_notifications WHERE kind='applied' AND status='sms_delivered'").get().n,2);const sent=f.messages.length;await f.drain();assert.equal(f.messages.length,sent);
});

for(const failure of ['balance','response'])test('차량별 '+failure+' 실패는 완료로 표시하지 않고 두 관리자 오류 문자와 재등록 방지를 검증한다',async t=>{
 const f=await flow(t,{balance:failure==='balance'?0:50000,failPaid:failure==='response'});await f.paid();await f.drain();const r=await f.run();assert.equal(r.processed,1);assert.equal(r.issues.length,1);assert.equal(r.issues[0].kind,failure==='balance'?'balance':'registration');
 const issue=f.db.prepare("SELECT * FROM parking_orders WHERE status='issue'").get();assert.equal(issue.ticket,'2h');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_notifications WHERE kind='applied'").get().n,1);
 const env={ALIGO_RELAY_SECRET:f.env.ALIGO_RELAY_SECRET,ALIGO_PARKING_ADMIN_RECEIVERS:phones.join(',')};await notifyProblems(env,f.store,r.issues);await notifyProblems(env,f.store,r.issues,fetch,Date.now()+20000);
 const errors=f.messages.filter(m=>m.path==='parking-admin/send'&&/잔액 부족|자동 등록 오류/.test(m.data.msg));assert.equal(errors.length,2);assert.deepEqual(errors.map(m=>m.data.receiver).sort(),phones);assert.ok(Object.values(f.memory['alert-journal']).every(m=>m.status==='delivered'));
 const n=f.registrations.length;await f.run();await f.drain();assert.equal(f.registrations.length,n);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM parking_notifications WHERE kind='issue' AND status='delivered'").get().n,1);
});
