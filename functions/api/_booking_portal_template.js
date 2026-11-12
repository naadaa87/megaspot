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
