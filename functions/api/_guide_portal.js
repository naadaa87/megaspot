import {SPACES} from './_lib.js';
import {portalMessageLink,portalCustomer} from './_booking_portal.js';

import {PORTAL_GUIDE_CODE,PORTAL_GUIDE_VARIANT,PORTAL_GUIDE_VERSION,PORTAL_GUIDE_URL,PORTAL_GUIDE_BUTTON,PORTAL_GUIDE_TEMPLATE} from './_booking_portal_template.js';
export {PORTAL_GUIDE_CODE,PORTAL_GUIDE_VARIANT,PORTAL_GUIDE_VERSION,PORTAL_GUIDE_URL,PORTAL_GUIDE_BUTTON,PORTAL_GUIDE_TEMPLATE};
const clean=x=>String(x||'').replace(/[\r\n\t]/g,' ').trim();
const hour=h=>(h>=24?'다음날 ':'')+String(Math.floor(h%24)).padStart(2,'0')+':'+String(Math.round((h%1)*60)).padStart(2,'0');
export function portalGuideMessage(b,time){
 const vars={고객명:clean(b.customer_name),공간명:SPACES[b.space_id]||'',이용일:clean(b.date).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1년 $2월 $3일'),이용시간:time.map(hour).join('~'),예약번호:clean(b.booking_code)};
 return PORTAL_GUIDE_TEMPLATE.replace(/#\{([^}]+)\}/g,(_,key)=>vars[key]);
}
export async function portalGuideSnapshot(env,b,snapshot,issue=false){
 const link=await portalMessageLink(env,b.booking_code,{issue});
 if(!link)throw Error('통합 안내 링크가 만료되었거나 변경되었습니다. 새로 미리보기해 주세요.');
 // Persist only the version/hash reference. The capability must never enter queue/history JSON.
 return {...snapshot,message:portalGuideMessage(b,snapshot.time),delivery_variant:PORTAL_GUIDE_VARIANT,portal_reference:link.reference};
}
export async function portalGuideButton(env,snapshot){
 const link=await portalMessageLink(env,snapshot.booking_code,{expected:snapshot.portal_reference});
 if(!link)throw Error('통합 안내 링크가 만료되었거나 변경되었습니다. 새로 미리보기해 주세요.');
 return {...PORTAL_GUIDE_BUTTON,linkMo:link.url,linkPc:link.url};
}
export async function portalGuideSimulation(env,snapshot,button){
 const token=new URL(button.linkMo).hash.slice('#booking='.length);
 const response=await portalCustomer({env,path:'view',request:new Request('https://megaspot.kr/api/booking-portal/view',{headers:{Authorization:'Bearer '+token}})});
 const result=await response.json();
 if(!response.ok||result.booking?.code!==snapshot.booking_code)throw Error('통합 링크와 예약 정보가 일치하지 않습니다. 다시 확인해 주세요.');
 return {link_matches_booking:true,customer_api_ok:true,account_registration_available:result.deposit.account.available,arrival_ready:result.arrival.ready};
}
