import { SpacecloudUI } from './host.mjs';
import { runJob } from './job.mjs';
import { targets } from './guard.mjs';
import { ensureStore,problem,saveState,loadState,lockRunner,assertLock,unlockRunner,reserveBudget,settleBudget,paidIncluded } from './store.mjs';

const origin='https://megaspot.kr';
const loginTime=300000;
const cleanupTime=60000;
const jobTime=110000;
const firstProduct=140188;
const response=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const errorMessage={
  'login-required':'스페이스클라우드 호스트 로그인을 완료해 주세요.',
  'host-access':'호스트 달력에서 메가스팟 상품 조회를 완료하지 못했습니다. 잠시 후 로그인 확인을 다시 눌러 주세요.',
  'session-save':'호스트 로그인 상태를 저장하지 못했습니다. 잠시 후 로그인 확인을 다시 눌러 주세요.',
  'browser-timeout':'전용 브라우저 응답 시간이 지났습니다.',
  'runner-busy':'다른 자동 작업이나 로그인이 진행 중입니다.',
  'login-expired':'로그인 시간이 지났습니다. 로그인 창을 다시 열어 주세요.',
};
function fail(code,status=503){return problem(code,errorMessage[code]||'전용 자동 연동 연결을 확인해 주세요.',status);}
function equal(a,b){
  if(a.length>256||b.length>256)return false;
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function deadline(task,ms,expire=()=>{}) {
  let timeout;
  const timer=new Promise((_,reject)=>{
    timeout=setTimeout(()=>{expire();reject(fail('browser-timeout'));},Math.max(1,ms));
  });
  return Promise.race([task,timer]).finally(()=>clearTimeout(timeout));
}
function readyConfig(env){
  if(!env.BROWSER||!env.STATE_DB||String(env.SESSION_ENCRYPTION_KEY||'').length<32||String(env.SPACECLOUD_WORKER_TOKEN||'').length<32){
    throw fail('configuration');
  }
  if(!(paidIncluded(env)||env.CLOUD_PLAN_CONFIRMED_FREE==='true'))throw fail('billing-configuration');
}
async function queue(env,body){
  const secret=String(env.SPACECLOUD_WORKER_TOKEN||'');
  if(secret.length<32)throw fail('queue-configuration');
  const result=await fetch(origin+'/api/internal/spacecloud-auto',{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(8500),
    headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body)
  });
  if(!result.ok)throw fail(result.status===409?'booking_changed':'queue-connection',result.status);
  return result.json();
}
function identity(job){return {id:job.entry.id,token:job.token};}
function probeEntry(product){
  const target=targets[product];
  return {product,date:new Date().toISOString().slice(0,10),start:0,end:1,action:'block',marker:'MSWEB-0000000000000000',
    host_url:`https://partner.spacecloud.kr/reservation-calendar?product=${product}&space=${target.space}`,
    public_url:`https://www.spacecloud.kr/space/${target.space}`};
}

export function createRunner({launch,connect,clock=Date.now}){
  async function closeRemote(env,id,browser){
    try{await deadline(env.BROWSER.closeSession(id),3500);}catch{}
    if(browser)try{await deadline(browser.close(),2000);}catch{}
    for(let attempt=0;attempt<3;attempt++){
      try{
        const session=await deadline(env.BROWSER.getSession(id),2500);
        if(!session||session.status==='closed')return true;
      }catch(error){
        if(error.status===404||error.statusCode===404||/Session not found \(status=404\)/.test(String(error.message)))return true;
      }
    }
    return false;
  }
  async function finish(env,table,row,browser,state='closed'){
    const closed=await closeRemote(env,row.session_id,browser);
    const budget=await env.STATE_DB.prepare('SELECT * FROM cloud_budget_reservations WHERE id=?').bind(row.budget_id).first();
    if(budget)await settleBudget(env,budget,{closed,now:clock()});
    await env.STATE_DB.prepare(`UPDATE ${table} SET state=? WHERE id=? AND state IN ('active','verifying')`)
      .bind(closed?state:'review',row.id).run();
    await unlockRunner(env,row.lock_token,{review:!closed});
    if(!closed)throw fail('browser-close-unconfirmed');
  }
  async function maintenance(env){
    await ensureStore(env);
    for(const table of ['cloud_login','cloud_browser_runs']){
      const {results}=await env.STATE_DB.prepare(`SELECT * FROM ${table} WHERE state IN ('active','verifying') AND expires_at<=? LIMIT 5`).bind(clock()).all();
      for(const row of results||[])await finish(env,table,row,null,'expired');
    }
    await env.STATE_DB.prepare('UPDATE cloud_runner_lock SET review=1 WHERE token IS NOT NULL AND expires_at<=?').bind(clock()).run();
  }
  async function checkedState(context){
    const host=new SpacecloudUI(context);
    // Continue in the tab that completed authentication so its page session is available.
    const loginPage=context.pages().find(page=>page.url().startsWith('https://partner.spacecloud.kr/'));
    await host.initialize(loginPage);
    try{
      for(const product of [firstProduct,...Object.keys(targets).map(Number).filter(id=>id!==firstProduct)]){
        try{await host.openHost(probeEntry(product),{accessOnly:true});}
        catch(error){
          const code=error.message==='login_required'?'login-required':'host-access';
          console.warn('megaspot-spacecloud login product check',{code,product});
          throw fail(code,409);
        }
      }
      try{return await context.storageState({indexedDB:true});}
      catch{throw fail('session-save');}
    }finally{
      if(!loginPage)await host.host.close();
    }
  }
  async function startLogin(env){
    readyConfig(env);await maintenance(env);
    const lock=await lockRunner(env,{duration:loginTime+cleanupTime+60000,now:clock()});
    if(!lock)throw fail('runner-busy',409);
    let budget,sessionId,browser,row,starting=false,expired=false,keep=false;
    try{
      budget=await reserveBudget(env,loginTime+cleanupTime,{now:clock()});
      return await deadline((async()=>{
        starting=true;
        const session=await env.BROWSER.acquire({keepAlive:240000,targets:true});
        sessionId=session.sessionId;
        if(expired){if(sessionId)await closeRemote(env,sessionId);throw fail('browser-timeout');}
        if(!sessionId)throw fail('session-id');
        row={id:crypto.randomUUID(),session_id:sessionId,lock_token:lock,budget_id:budget.id,expires_at:budget.started_at+loginTime};
        await env.STATE_DB.prepare('INSERT INTO cloud_login(id,session_id,lock_token,budget_id,started_at,expires_at) VALUES(?,?,?,?,?,?)')
          .bind(row.id,sessionId,lock,budget.id,budget.started_at,row.expires_at).run();
        browser=await connect(env.BROWSER,sessionId);
        const context=browser.contexts()[0];
        if(!context||expired)throw fail('login-required');
        const page=await context.newPage();
        await page.goto(probeEntry(firstProduct).host_url,{waitUntil:'domcontentloaded'});
        const cdp=await context.newCDPSession(page);
        const view=await cdp.send('Cloudflare.getLiveView',{mode:'full',expiresInMs:Math.max(1000,row.expires_at-clock())});
        if(expired||typeof view.devtoolsFrontendUrl!=='string'||!view.devtoolsFrontendUrl.startsWith('https://live.browser.run/'))throw fail('login-required');
        await browser.close();browser=null;keep=true;
        return {ok:true,login_id:row.id,expires_at:row.expires_at,live_view_url:view.devtoolsFrontendUrl};
      })(),30000,()=>{expired=true;});
    }finally{
      if(!keep){
        if(row)await finish(env,'cloud_login',row,browser,'failed');
        else{
          const closed=sessionId?await closeRemote(env,sessionId,browser):!starting;
          if(budget)await settleBudget(env,budget,{closed,notStarted:!starting,now:clock()});
          await unlockRunner(env,lock,{review:!closed});
        }
      }
    }
  }
  async function saveLogin(env,id,cancel){
    readyConfig(env);await maintenance(env);
    const row=await env.STATE_DB.prepare("SELECT * FROM cloud_login WHERE id=? AND state='active'").bind(id).first();
    if(!row||row.expires_at<=clock())throw fail('login-expired',409);
    await assertLock(env,row.lock_token,clock());
    const claimed=await env.STATE_DB.prepare("UPDATE cloud_login SET state='verifying' WHERE id=? AND state='active' AND expires_at>?")
      .bind(id,clock()).run();
    if(!Number(claimed.meta?.changes))throw fail('runner-busy',409);
    if(cancel){await finish(env,'cloud_login',row,null,'cancelled');return {ok:true};}
    let browser,expired=false,saved=false;
    try{
      const state=await deadline((async()=>{
        browser=await connect(env.BROWSER,row.session_id);
        if(expired){await browser.close();throw fail('browser-timeout');}
        const context=browser.contexts()[0];
        if(!context)throw fail('login-required',409);
        return checkedState(context);
      })(),Math.min(38000,row.expires_at-clock()),()=>{expired=true;});
      await assertLock(env,row.lock_token,clock());
      await saveState(env,state,{guard:()=>{if(expired||row.expires_at<=clock())throw fail('login-expired',409);}});
      saved=true;
      return {ok:true,saved:true};
    }catch(error){
      const known=['login-required','host-access','session-save','browser-timeout','login-expired'];
      const code=known.includes(error.code)?error.code:'session-save';
      console.warn('megaspot-spacecloud login verification',{code});
      throw fail(code,code==='login-required'||code==='host-access'||code==='login-expired'?409:503);
    }finally{
      if(saved||row.expires_at<=clock())await finish(env,'cloud_login',row,browser,saved?'saved':'expired');
      else{
        if(browser)await deadline(browser.close(),2500).catch(()=>{});
        await env.STATE_DB.prepare("UPDATE cloud_login SET state='active' WHERE id=? AND state='verifying'").bind(id).run();
      }
    }
  }
  async function tick(env){
    await maintenance(env);
    if(env.ENABLED!=='true'||env.ALLOW_WRITES!=='true'){
      await queue(env,{action:'status',phase:'paused'});return;
    }
    readyConfig(env);
    const storageState=await loadState(env);
    if(!storageState){await queue(env,{action:'status',phase:'login_required'});return;}
    const lock=await lockRunner(env,{duration:jobTime+cleanupTime+15000,now:clock()});
    if(!lock)return;
    let budget,job,browser,sessionId,row,started=false,expired=false,phase='ready';
    try{
      try{budget=await reserveBudget(env,jobTime+cleanupTime,{now:clock()});}
      catch(error){phase='budget_wait';throw error;}
      job=(await queue(env,{action:'claim'})).job;
      if(!job)return;
      const expires=budget.started_at+jobTime;
      const live=async()=>{
        if(expired||clock()>=expires||clock()>=job.expires)throw fail('browser-timeout');
        await assertLock(env,lock,clock());
        try{await queue(env,{action:'check',...identity(job)});}catch(error){throw new Error(error.code);}
        if(expired||clock()>=expires||clock()>=job.expires)throw fail('browser-timeout');
      };
      await deadline((async()=>{
        started=true;
        browser=await launch(env.BROWSER,{keep_alive:60000});sessionId=browser.sessionId();
        if(expired){if(sessionId)await closeRemote(env,sessionId,browser);throw fail('browser-timeout');}
        if(!sessionId)throw fail('session-id');
        row={id:budget.id,session_id:sessionId,lock_token:lock,budget_id:budget.id,expires_at:expires};
        await env.STATE_DB.prepare('INSERT INTO cloud_browser_runs(id,session_id,lock_token,budget_id,started_at,expires_at) VALUES(?,?,?,?,?,?)')
          .bind(row.id,sessionId,lock,budget.id,budget.started_at,expires).run();
        const context=await browser.newContext({storageState,locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1600,height:1100}});
        const host=new SpacecloudUI(context);await host.initialize();
        const outcome=await runJob(job,host,live);
        if(expired)return;
        const state=await context.storageState({indexedDB:true});
        await saveState(env,state,{guard:()=>{if(expired)throw fail('browser-timeout');}});
        await queue(env,{action:'complete',...identity(job),...outcome});
      })(),expires-clock(),()=>{expired=true;});
    }catch(error){
      if(job){
        if(error.message==='login_required'){
          phase='login_required';
          await env.STATE_DB.prepare("DELETE FROM cloud_session WHERE id='spacecloud'").run();
          await queue(env,{action:'defer',...identity(job)}).catch(()=>{});
        }else{
          await queue(env,{action:'complete',...identity(job),result:'review',reason:'unknown_result'}).catch(()=>{});
        }
      }
    }finally{
      try{
        if(row)await finish(env,'cloud_browser_runs',row,browser);
        else{
          const closed=sessionId?await closeRemote(env,sessionId,browser):!started;
          if(budget)await settleBudget(env,budget,{closed,notStarted:!started,now:clock()});
          await unlockRunner(env,lock,{review:!closed});
          if(!closed)phase='review';
        }
      }catch{phase='review';}
      await queue(env,{action:'status',phase}).catch(()=>{});
    }
  }
  return {
    tick,
    async fetch(request,env){
      const token=String(env.CLOUD_ADMIN_TOKEN||'');
      const url=new URL(request.url);
      if(request.method==='GET'&&url.pathname==='/health')return response({ok:true,service:'megaspot-spacecloud'});
      if(token.length<32||!equal(request.headers.get('authorization')||'','Bearer '+token))return response({ok:false},401);
      if(request.headers.has('origin'))return response({ok:false},403);
      try{
        if(request.method!=='POST')return response({ok:false},405);
        if(url.pathname==='/login/start')return response(await startLogin(env));
        if(!['/login/save','/login/cancel'].includes(url.pathname))return response({ok:false},404);
        const text=await request.text();
        if(text.length>1024)return response({ok:false},413);
        const {login_id}=JSON.parse(text);
        if(typeof login_id!=='string'||!/^[\da-f-]{36}$/.test(login_id))return response({ok:false},400);
        return response(await saveLogin(env,login_id,url.pathname==='/login/cancel'));
      }catch(error){
        return response({ok:false,code:error.code||'cloud-error',message:error.code?error.message:'자동 연동 상태를 확인해 주세요.'},error.status||503);
      }
    }
  };
}
