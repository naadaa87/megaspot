import {SPACES} from './_lib.js';
import {portalMessageLink,portalCustomer} from './_booking_portal.js';

// Registered separately on 2026-11-03; review pending. Never select this as the active default.
export const PORTAL_GUIDE_CODE='UN_2935';
export const PORTAL_GUIDE_VARIANT='booking-portal';
export const PORTAL_GUIDE_VERSION='reservation-portal-v1';
export const PORTAL_GUIDE_URL='https://megaspot.kr/booking/#booking=#{안내코드}';
export const PORTAL_GUIDE_BUTTON={name:'예약 안내 확인',linkType:'WL',linkTypeName:'웹링크',linkMo:PORTAL_GUIDE_URL,linkPc:PORTAL_GUIDE_URL};
export const PORTAL_GUIDE_TEMPLATE=`[메가스팟 예약 확정 안내]

#{고객명}님, 예약이 확정되었습니다.

■ 예약 공간: #{공간명}
■ 이용 날짜: #{이용일}
■ 이용 시간: #{이용시간}
■ 예약번호: #{예약번호}

아래 '예약 안내 확인'에서
예약확정서·보증금 안내·환급 계좌 등록·입실 안내를 확인해 주세요.

준비와 정리 시간도 예약하신 이용 시간에 포함됩니다.
예약 담당자 전용 링크이므로 다른 분께 공유하지 마세요.

예약 변경 및 이용 문의는 안내 페이지의
카카오톡 문의를 이용해 주세요.`;
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
