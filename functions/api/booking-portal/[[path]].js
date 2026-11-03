import {err,hasDb,clientIp,sha256,tooMany,hit} from '../_lib.js';
import {portalCustomer} from '../_booking_portal.js';
export async function onRequest({request,env,params}){
 const url=new URL(request.url),origin=request.headers.get('origin');
 const wrap=r=>{const response=new Response(r.body,r);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');return response;};
 if(origin&&origin!==url.origin)return wrap(err('허용되지 않은 요청입니다.',403));
 if(!hasDb(env))return wrap(err('예약 안내를 준비 중입니다.',503));
 const path=(params.path||[]).join('/');if(!['view','account'].includes(path))return wrap(err('경로를 찾을 수 없습니다.',404));
 try{
  const key='portal:'+await sha256(clientIp(request));if(await tooMany(env,key,60,10))return wrap(err('요청이 많습니다. 잠시 후 다시 확인해 주세요.',429));await hit(env,key,10);
  return wrap(await portalCustomer({env,request,path}));
 }catch{return wrap(err('예약 정보를 확인하지 못했습니다. 다시 시도하거나 운영팀에 문의해 주세요.',500,'PORTAL_ERROR'));}
}
