import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {GUIDE_TEMPLATE,GUIDE_BUTTON,GUIDE_MULTI_CODE,GUIDE_MULTI_TEMPLATE,GUIDE_MULTI_BUTTONS} from '../functions/api/_guide_messages.js';
function setup(t){
  const f=fixture({booking:true});t.after(()=>f.db.close());
  Object.assign(f.env,{ALIGO_API_KEY:'test-key',ALIGO_USERID:'test-user',ALIGO_SENDER_KEY:'test-channel',ALIGO_SENDER:'01012345678',ALIGO_LIVE_ENABLED:'true'});
  const old={variant:'legacy',template_code:'OLD',spaces:['megaspot-gundae','megaspot-gundae-2'],enabled:true,automatic:true};
  const candidate={variant:'legacy',template_code:GUIDE_MULTI_CODE,spaces:old.spaces};
  const sent=[];let approved=true,result='0';
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    const d=Object.fromEntries(new URLSearchParams(opts.body));
    if(url.endsWith('/template/list/'))return Response.json({code:0,list:[{templtCode:d.tpl_code,inspStatus:approved?'APR':'REQ',status:'R',templtContent:d.tpl_code===GUIDE_MULTI_CODE?GUIDE_MULTI_TEMPLATE:GUIDE_TEMPLATE,buttons:d.tpl_code===GUIDE_MULTI_CODE?GUIDE_MULTI_BUTTONS:[GUIDE_BUTTON]}]});
    if(url.endsWith('/alimtalk/send/')){sent.push(d);return Response.json({code:0,info:{mid:String(sent.length),scnt:1,fcnt:0}});}
    if(url.endsWith('/history/detail/')){const s=sent[Number(d.mid)-1];return Response.json({code:0,list:[{msgid:'123',type:'AT',phone:s.receiver_1,tpl_code:s.tpl_code,senderKey:'test-channel',rsltdate:'2026-11-04 03:00:00',rslt:result}]});}
    assert.fail(url);
  });
  async function enableOld(){await f.api('guide-messages/settings','PUT',{...old,enabled:false});const r=await f.api('guide-messages/test','POST',{phone:'01011112222',confirm_test:true});await f.api('guide-messages/'+r.id+'/refresh','POST',{});await f.api('guide-messages/settings','PUT',old);f.db.exec("UPDATE booking_guide_messages SET created_at='2020-01-01 00:00:00'");}
  return {...f,old,candidate,sent,enableOld,setApproval:v=>approved=v,setResult:v=>result=v};
}
test('새 3버튼 시험 수신과 검증 동안 기존 자동 발송 설정을 유지한 뒤 성공한 구성만 전환한다',async t=>{
  const f=setup(t);await f.enableOld();
  const r=await f.api('guide-messages/test','POST',{phone:'01011112222',confirm_test:true,candidate:f.candidate});
  assert.equal(f.sent.length,2);assert.equal(f.sent[1].tpl_code,GUIDE_MULTI_CODE);assert.deepEqual(JSON.parse(f.sent[1].button_1),{button:GUIDE_MULTI_BUTTONS});assert.match(f.sent[1].message_1,/식음료 서비스, 주차권 구매/);
  let s=await f.api('guide-messages/settings');assert.equal(s.template_code,'OLD');assert.equal(s.enabled,true);assert.equal(s.automatic,true);assert.equal(s.test_delivered,true);
  await f.api('guide-messages/settings','PUT',{...f.old,template_code:GUIDE_MULTI_CODE},409);
  await f.api('guide-messages/'+r.id+'/refresh','POST',{});
  assert.equal(f.db.prepare('SELECT status FROM booking_guide_messages WHERE id=?').get(r.id).status,'delivered');
  assert.equal((await f.api('guide-messages/settings')).template_code,'OLD');
  // A different branch selection cannot reuse this proof.
  await f.api('guide-messages/settings','PUT',{...f.old,template_code:GUIDE_MULTI_CODE,spaces:['megaspot-gundae']},409);
  await f.api('guide-messages/settings','PUT',{...f.old,template_code:GUIDE_MULTI_CODE});
  s=await f.api('guide-messages/settings');assert.equal(s.template_code,GUIDE_MULTI_CODE);assert.equal(s.enabled,true);assert.equal(s.automatic,true);assert.equal(s.test_delivered,true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM booking_guide_messages WHERE mode='live'").get().n,0);
});
test('미승인 또는 유효하지 않은 미저장 시험 구성은 실제 발송과 운영 설정을 변경하지 않는다',async t=>{
  const f=setup(t);await f.enableOld();f.setApproval(false);
  await f.api('guide-messages/test','POST',{phone:'01011112222',confirm_test:true,candidate:f.candidate},400);
  for(const candidate of [{...f.candidate,variant:'booking-portal'},{...f.candidate,spaces:[]},{...f.candidate,spaces:['unknown']},{...f.candidate,template_code:''}])await f.api('guide-messages/test','POST',{phone:'01011112222',confirm_test:true,candidate},400);
  assert.equal(f.sent.length,1);const s=await f.api('guide-messages/settings');assert.equal(s.template_code,'OLD');assert.equal(s.enabled,true);assert.equal(s.automatic,true);
});
test('실패한 새 템플릿 시험 수신은 활성화 증거가 되지 않으며 기존 자동 발송은 유지한다',async t=>{
  const f=setup(t);await f.enableOld();const r=await f.api('guide-messages/test','POST',{phone:'01011112222',confirm_test:true,candidate:f.candidate});f.setResult('3');await f.api('guide-messages/'+r.id+'/refresh','POST',{});
  await f.api('guide-messages/settings','PUT',{...f.old,template_code:GUIDE_MULTI_CODE},409);const s=await f.api('guide-messages/settings');assert.equal(s.template_code,'OLD');assert.equal(s.automatic,true);
});
