import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac,randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { relayRequest,relayLedger } from '../deploy/aligo-relay/server.mjs';
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());const ledger=relayLedger(db),env={ALIGO_RELAY_SECRET:'test-relay-secret-at-least-32-characters',ALIGO_API_KEY:'server-only-key',ALIGO_USERID:'server-user',ALIGO_SENDER_KEY:'megaspot-profile',ALIGO_SENDER:'01012345678'};
  const calls=[];let failure=false;
  async function upstream(url,opts){calls.push({url,body:new URLSearchParams(opts.body)});if(failure)throw Error('connection lost');return Response.json({code:0,info:{mid:'100',scnt:1,fcnt:0}});}
  function request(v,secret=env.ALIGO_RELAY_SECRET){const raw=JSON.stringify(v);return new Request('https://aligo.megaspot.kr/v1/aligo',{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':createHmac('sha256',secret).update(raw).digest('hex')},body:raw});}
  const send=(v,secret)=>relayRequest(request(v,secret),env,ledger,upstream);
  const input=(overrides={})=>({path:'alimtalk/send',data:{tpl_code:'UN_2584',receiver_1:'01011112222',subject_1:'안내',message_1:'예약 안내',button_1:'{}'},request_id:randomUUID(),time:Date.now(),...overrides});
  return {db,env,ledger,calls,request,send,input,fail:()=>failure=true};
}
test('알리고 인증정보는 서버 값만 사용하고 대체 문자·다른 채널 입력은 무시',async t=>{
  const f=fixture(t),v=f.input();Object.assign(v.data,{apikey:'attacker',userid:'other',senderkey:'other-profile',sender:'other',failover:'Y',receiver_2:'01099998888'});assert.equal((await f.send(v)).status,200);
  const b=f.calls[0].body;assert.equal(b.get('apikey'),'server-only-key');assert.equal(b.get('senderkey'),'megaspot-profile');assert.equal(b.get('sender'),'01012345678');assert.equal(b.get('failover'),'N');assert.equal(b.get('receiver_2'),null);
});
test('HMAC 서명·요청 유효시간·허용 API와 템플릿을 검사',async t=>{
  const f=fixture(t);assert.equal((await f.send(f.input(),'wrong')).status,401);assert.equal((await f.send(f.input({time:Date.now()-120000}))).status,400);assert.equal((await f.send(f.input({path:'template/del'}))).status,400);
  const v=f.input();v.data.tpl_code='OTHER';assert.equal((await f.send(v)).status,403);assert.equal(f.calls.length,0);
});
test('같은 요청 ID는 지속 원장에서 기존 결과를 반환하고 재시작 후에도 다시 전송하지 않는다',async t=>{
  const f=fixture(t),v=f.input();await f.send(v);const r=await f.send(v);assert.equal((await r.json()).info.mid,'100');
  assert.equal((await relayRequest(f.request(v),f.env,relayLedger(f.db),()=>assert.fail('duplicate'))).status,200);assert.equal(f.calls.length,1);
  v.data.message_1='다른 내용';assert.equal((await f.send(v)).status,409);
});
test('응답 불명은 원장 잠금을 유지하고 같은 ID 재요청으로 발송하지 않는다',async t=>{
  const f=fixture(t),v=f.input();f.fail();assert.equal((await f.send(v)).status,502);assert.equal((await f.send(v)).status,409);assert.equal(f.calls.length,1);
});
test('결과·템플릿 조회만 허용하고 임의 URL·추가 수신자 전달은 불가',async t=>{
  const f=fixture(t);await f.send(f.input());await f.send(f.input({path:'history/detail',data:{mid:'100',apikey:'wrong',url:'https://evil.test'}}));assert.equal(f.calls[1].url,'https://kakaoapi.aligo.in/akv10/history/detail/');assert.equal(f.calls[1].body.get('url'),null);
  assert.equal((await f.send(f.input({path:'history/detail',data:{mid:'not-a-mid'}}))).status,400);
  await f.send(f.input({path:'template/list',data:{tpl_code:'UN_2584'}}));assert.equal(f.calls[2].body.get('senderkey'),'megaspot-profile');
});
test('이 연결 서버에서 생성하지 않은 다른 서비스의 전송 내역은 조회하지 않는다',async t=>{
  const f=fixture(t);assert.equal((await f.send(f.input({path:'history/detail',data:{mid:'999999'}}))).status,403);assert.equal(f.calls.length,0);
});
test('승인된 주차 7종만 대체 문자를 켜며 본문 누락·변수 미치환 요청은 차단',async t=>{
 const f=fixture(t);f.env.ALIGO_TEMPLATE_CODES='UN_2584,UN_2583';const v=f.input();v.data.tpl_code='UN_2583';assert.equal((await f.send(v)).status,400);
 v.data.fmessage_1='주차권 안내 #{주문번호}';assert.equal((await f.send(v)).status,400);
 v.data.fmessage_1='주차권 결제 완료 MS001';v.data.fsubject_1='메가스팟';assert.equal((await f.send(v)).status,200);assert.equal(f.calls[0].body.get('failover'),'Y');assert.equal(f.calls[0].body.get('fmessage_1'),v.data.fmessage_1);
});
test('이 서버의 알림톡 결과에서 확인된 SMS 대체 메시지 ID만 결과 조회 허용',async t=>{
 const f=fixture(t);await f.send(f.input());const request=f.request(f.input({path:'history/detail',data:{mid:'100'}}));
 await relayRequest(request,f.env,f.ledger,async()=>Response.json({code:0,list:[{type:'AT',smid:'555'}]}));assert.equal(f.ledger.ownsSmsMid('555'),true);assert.equal(f.ledger.ownsSmsMid('777'),false);
 assert.equal((await f.send(f.input({path:'sms/detail',data:{mid:'100'}}))).status,403);
 await f.send(f.input({path:'sms/detail',data:{mid:'555'}}));const q=f.calls.at(-1);assert.equal(q.url,'https://apis.aligo.in/sms_list/');assert.equal(q.body.get('key'),'server-only-key');assert.equal(q.body.get('user_id'),'server-user');assert.equal(q.body.get('apikey'),null);
});
