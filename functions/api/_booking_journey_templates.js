import {PORTAL_GUIDE_TEMPLATE,PORTAL_GUIDE_BUTTON} from './_booking_portal_template.js';
const button={...PORTAL_GUIDE_BUTTON};
const food={name:'뷔페·케이터링·칵테일 안내',linkType:'WL',linkMo:'https://megaspot.kr/catering/#food-compare',linkPc:'https://megaspot.kr/catering/#food-compare'};
const arrivalButtons=[{name:'입실 및 이용 안내',linkType:'WL',linkMo:'https://megaspot-guide.pages.dev/',linkPc:'https://megaspot-guide.pages.dev/'},{name:'주차권 구매',linkType:'WL',linkMo:'https://megaspot.kr/parking/purchase/',linkPc:'https://megaspot.kr/parking/purchase/'}];
export const JOURNEY_TEMPLATES={
 booking_confirmed:{code:'UN_6623',name:'메가스팟_예약확정_통합_식음료_v2',content:PORTAL_GUIDE_TEMPLATE,buttons:[button,food],fallback:{code:'UN_2935',name:'메가스팟_예약확정_통합안내',content:PORTAL_GUIDE_TEMPLATE,buttons:[button]}},
 balance_reminder:{code:'UN_6619',name:'메가스팟_이용료잔금안내_v1',buttons:[button],content:`[메가스팟 이용료 잔금 안내]

#{고객명}님, 예약하신 공간의 이용료 잔금을 안내드립니다.

예약번호: #{예약번호}
이용 날짜: #{이용일}
남은 이용료: #{잔금}원
납부 기한: #{납부기한}

반환 보증금은 위 이용료 잔금과 별도입니다.
이미 입금하셨다면 추가 입금하지 마시고 담당자의 확인을 기다려 주세요.
아래 예약 안내에서 최신 수납 내역과 보증금을 확인해 주세요.`},
 rental_paid:{code:'UN_6620',name:'메가스팟_이용료전액납부완료_v1',buttons:[button],content:`[메가스팟 이용료 납부 완료]

#{고객명}님, 예약하신 공간의 이용료 전액 납부가 확인되었습니다.

예약번호: #{예약번호}
이용 날짜: #{이용일}
확인된 이용료: #{수납액}원
남은 이용료: 0원

반환 보증금 입금 확인은 이용료와 별도로 처리됩니다.
아래 예약 안내에서 예약확정서와 보증금 상태를 확인해 주세요.`},
 booking_arrival:{code:'UN_6624',name:'메가스팟_입실전_이용_주차안내_v2',buttons:arrivalButtons,content:`[메가스팟 방문 전 안내]

#{고객명}님, 예약하신 공간의 방문 전 안내입니다.

예약 공간: #{공간명}
이용 날짜: #{이용일}
이용 시간: #{이용시간}
예약번호: #{예약번호}

아래 '입실 및 이용 안내'에서 오시는 길·출입 방법·장비 사용법과 퇴실 체크리스트를 확인해 주세요.
주차권은 '주차권 구매'에서 확인해 주세요.
준비와 정리 시간도 예약하신 이용 시간에 포함됩니다.
`}
};

// Only the private reservation button is personalized; public service links stay intact.
export function journeyButtons(template,url){return template.buttons.map(button=>({...button,linkMo:button.linkMo.includes('#{안내코드}')?url:button.linkMo,linkPc:button.linkPc.includes('#{안내코드}')?url:button.linkPc}));}
