import test from 'node:test';import assert from 'node:assert/strict';
import {AmanoClient,PlateMatchError} from '../deploy/amano-server/client.mjs';
import {runCycle} from '../deploy/amano-server/worker.mjs';import {notifyProblems} from '../deploy/amano-server/alerts.mjs';
const row=(plate,id='8668')=>({id,carNo:plate,iCardType:'0',entryDateToString:'2026-11-06 18:29:18',dtOutDate:null});
function fixture(direct=[],suffix=[]){const queries=[],c=new AmanoClient({},async(url,opts)=>{assert.ok(url.endsWith('/discount/registration/listForDiscount'));const q=opts.body.get('carNo');queries.push(q);return Response.json(q==='1704'?suffix:direct);});return {c,queries};}
test('전체 번호가 일치하는 정상 입차는 기존 조회 한 번으로 처리한다',async()=>{const f=fixture([row('36하1704')]);assert.equal((await f.c.entries('36하1704','2026-11-06'))[0].id,'8668');assert.deepEqual(f.queries,['36하1704']);});
test('전체 조회가 비어도 끝 네 자리 후보의 전체 번호가 정확히 맞으면 처리한다',async()=>{const f=fixture([],[row('36하1704')]);assert.equal((await f.c.entries('36하1704','2026-11-06'))[0].plate,'36하1704');assert.deepEqual(f.queries,['36하1704','1704']);});
test('입차 후보가 전혀 없으면 번호 오류로 단정하지 않고 대기한다',async()=>{const f=fixture();assert.deepEqual(await f.c.entries('36하1704','2026-11-06'),[]);});
for(const shown of ['XXXX36XX1704','XXXX1704','36허1704'])test('불완전·상이한 번호 '+shown+'는 입차 대기와 구분해 확인 필요 오류를 낸다',async()=>{const f=fixture([],[row(shown)]);await assert.rejects(()=>f.c.entries('36하1704','2026-11-06'),e=>e instanceof PlateMatchError&&e.code==='PLATE_MATCH_REQUIRED'&&e.message.includes('36하1704')&&e.message.includes(shown));});
test('끝 네 자리만 같고 앞 숫자가 다른 별도 차량은 고객 입차로 오인하지 않는다',async()=>{const f=fixture([],[row('123가1704'),row('XXXX99XX1704','other')]);assert.deepEqual(await f.c.entries('36하1704','2026-11-06'),[]);});
test('정확한 번호 외에 번호가 불완전한 동일 숫자 후보가 있으면 임의 선택하지 않는다',async()=>{const f=fixture([],[row('36하1704'),row('XXXX36XX1704','other')]);await assert.rejects(()=>f.c.entries('36하1704','2026-11-06'),PlateMatchError);});
test('전체 번호 조회가 번호 확인 불가 자료를 반환해도 조용히 대기하지 않는다',async()=>{const f=fixture([row('번호 확인 불가')]);await assert.rejects(()=>f.c.entries('36하1704','2026-11-06'),PlateMatchError);assert.equal(f.queries.length,1);});
test('잘못된 목록 응답과 잘못된 주문 번호 형식은 확인 필요로 차단한다',async()=>{const c=new AmanoClient({},async()=>Response.json({error:'unexpected'}));await assert.rejects(()=>c.entries('36하1704','2026-11-06'),/입차 목록/);await assert.rejects(()=>c.entries('1704','2026-11-06'),/조회 차량번호/);});
test('불완전 번호 조회부터 주문 보류·두 관리자 문자·반복 방지까지 연결된다',async()=>{
 const {c}=fixture([],[row('XXXX36XX1704')]);c.login=async()=>{};
 const data={},store={read:k=>data[k]?structuredClone(data[k]):null,save:(k,v)=>data[k]=structuredClone(v)};
 const p={oid:'MSPLATE',plate:'36하1704',visit_date:'2026-11-06',ticket:'2h',hours:2,price:8000};let status='waiting';const actions=[],messages=[];
 const site=async(action)=>{actions.push(action);if(action==='orders')return {operating:true,items:status==='waiting'?[p]:[]};assert.equal(action,'issue');status='issue';return {ok:true};};
 const env={ALIGO_RELAY_SECRET:'test-only-secret-longer-than-32-characters',ALIGO_PARKING_ADMIN_RECEIVERS:'01011112222,01033334444'};
 const sms=async(url,opts)=>{const v=JSON.parse(opts.body);assert.equal(v.path,'parking-admin/send');messages.push(v.data);return Response.json({result_code:1,msg_id:String(messages.length),success_cnt:1,error_cnt:0});};
 const r=await runCycle({site,client:c,store,onIssue:i=>notifyProblems(env,store,[i],sms)});await notifyProblems(env,store,r.issues,sms);await runCycle({site,client:c,store,onIssue:i=>notifyProblems(env,store,[i],sms)});
 assert.equal(status,'issue');assert.equal(r.waiting,0);assert.equal(r.processed,0);assert.equal(r.issues[0].kind,'plate');assert.deepEqual(actions,['orders','issue','orders']);assert.equal(messages.length,2);assert.deepEqual(messages.map(x=>x.receiver).sort(),['01011112222','01033334444']);assert.ok(messages.every(x=>x.msg.includes('36하1704')&&x.msg.includes('XXXX36XX1704')));
});
