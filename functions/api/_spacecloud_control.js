import { err,json,readJson } from './_lib.js';

function controlConfig(env) {
  const configured=String(env.SPACECLOUD_RUNNER_ORIGIN||'');
  const token=String(env.SPACECLOUD_CONTROL_TOKEN||'');
  if(token.length<32)return null;
  if(typeof env.SPACECLOUD_RUNNER?.fetch==='function'){
    return {origin:'https://spacecloud-runner.internal',token,send:request=>env.SPACECLOUD_RUNNER.fetch(request)};
  }
  try {
    const url=new URL(configured);
    if(url.protocol==='https:'&&url.origin===configured&&/^megaspot-spacecloud\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)&&token.length>=32){
      return {origin:url.origin,token,send:request=>fetch(request)};
    }
  }catch{}
  return null;
}
export function spacecloudControlReady(env){return !!controlConfig(env);}
export async function spacecloudControl({env,request,method,path}) {
  if(method!=='POST')return err('지원하지 않는 방식입니다.',405);
  const config=controlConfig(env);
  if(!config)return err('전용 로그인 연결이 아직 설정되지 않았습니다.',503,'NOT_CONFIGURED');
  const action=path.split('/').pop();
  if(!['start','save','cancel'].includes(action))return err('지원하지 않는 작업입니다.',404);
  const {login_id}=await readJson(request,1024);
  if(action!=='start'&&(typeof login_id!=='string'||!/^[\da-f-]{36}$/.test(login_id)))return err('로그인 창을 먼저 열어 주세요.');
  try{
    const remote=await config.send(new Request(config.origin+'/login/'+action,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
      headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},
      body:JSON.stringify(action==='start'?{}:{login_id})
    }));
    const result=await remote.json();
    if(!remote.ok||result.ok!==true)return err(String(result.message||'전용 브라우저 연결을 확인해 주세요.').slice(0,200),remote.ok?503:remote.status);
    if(action==='start'){
      const view=new URL(result.live_view_url);
      if(view.origin!=='https://live.browser.run'||!/^\/ui\//.test(view.pathname))return err('로그인 창 주소를 확인하지 못했습니다.',503);
      return json({ok:true,login_id:result.login_id,live_view_url:view.href,expires_at:result.expires_at},200,{'referrer-policy':'no-referrer'});
    }
    return json({ok:true});
  }catch{return err('전용 브라우저 연결에 실패했습니다. 잠시 후 다시 확인해 주세요.',503);}
}
