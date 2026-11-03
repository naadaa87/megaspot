import {err,hasDb,clientIp,sha256,tooMany,hit} from '../_lib.js';
import {refundCustomer,purgeAccounts} from '../_deposit_refunds.js';
const origins=['https://megaspot-guide.pages.dev','https://megaspot.kr','https://www.megaspot.kr'];
export async function onRequest({request,env,params}){
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(origin&&!origins.includes(origin)&&origin!==url.origin)return err('허용되지 않은 요청입니다.',403);
 const headers={'Vary':'Origin','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'};
 if(origin)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});
 const wrap=r=>{const out=new Response(r.body,r);for(const [k,v]of Object.entries(headers))out.headers.set(k,v);return out;};
 if(request.method==='OPTIONS')return wrap(new Response(null,{status:204}));
 if(!hasDb(env))return wrap(err('등록 서비스를 준비 중입니다. 관리자에게 문의해 주세요.',503));
 const route=(params.path||[]).join('/');
 if(!['customer','cleanup'].includes(route))return wrap(err('경로를 찾을 수 없습니다.',404));
 if(route==='cleanup'&&request.method!=='POST')return wrap(err('허용되지 않은 요청입니다.',405));
 try{
  const limitKey='refund:'+await sha256(clientIp(request));
  if(await tooMany(env,limitKey,60,10))return wrap(err('요청이 많습니다. 잠시 후 다시 시도해 주세요.',429));
  await hit(env,limitKey,10);await purgeAccounts(env);
  // This endpoint can only erase records past their existing server-side retention date.
  // It accepts no booking identifiers or client-supplied cutoff and exposes no records.
  if(route==='cleanup')return wrap(new Response(null,{status:204}));
  return wrap(await refundCustomer({env,request}));
 }catch{return wrap(err('처리하지 못했습니다. 새로고침 후 다시 시도하거나 관리자에게 문의해 주세요.',500,'REFUND_ERROR'));}
}
