// Text and buttons are compared against the exact approved templates before use.
const parkingButtons=[
 {name:'주차권 내역 확인',linkType:'WL',linkMo:'https://megaspot.kr/parking/purchase/#oid=#{주문번호}&key=#{구매내역키}',linkPc:'https://megaspot.kr/parking/purchase/#oid=#{주문번호}&key=#{구매내역키}'},
 {name:'카카오톡 문의',linkType:'WL',linkMo:'https://pf.kakao.com/_LnxbmX/chat',linkPc:'https://pf.kakao.com/_LnxbmX/chat'}
];

export const CUSTOMER_ALIMTALK={
 inquiry:{code:'UN_4761',name:'메가스팟_문의접수_v1',buttons:[],content:`[메가스팟 문의 접수]
문의번호: #{번호}

문의가 접수되었습니다.
담당자가 내용을 확인한 후 안내드리겠습니다.`},
 reservation_request:{code:'UN_4762',name:'메가스팟_예약신청접수_v1',buttons:[],content:`[메가스팟 예약 신청 접수]
문의번호: #{번호}

예약 신청이 접수되었습니다.
담당자가 일정을 확인한 후 안내드리겠습니다.
현재 예약 확정 전입니다.`},
 payment_review:{code:'UN_4763',name:'메가스팟_결제완료_예약확정보류_v1',buttons:[],content:`[메가스팟 결제 완료 · 예약 확정 보류]
주문번호: #{번호}
결제 승인 금액: #{금액}원

결제가 완료되었습니다.
예약은 담당자가 일정을 확인한 후 확정됩니다.
다시 결제하지 않으셔도 됩니다.`},
 booking_cancelled:{code:'UN_4764',name:'메가스팟_공간예약취소_v1',buttons:[],content:`[메가스팟 공간 예약 취소]
예약번호: #{번호}

공간 예약이 취소되었습니다.
이용료 환불 대상인 경우 환불이 완료되면 안내드립니다.`},
 rental_refund:{code:'UN_4765',name:'메가스팟_이용료환불완료_v1',buttons:[],content:`[메가스팟 이용료 환불 완료]
예약 또는 주문번호: #{번호}
이번 이용료 환불 금액: #{금액}원

환불 처리가 완료되었습니다.
실제 입금이나 카드 한도 복원 시점은 결제수단에 따라 다를 수 있습니다.`},
 parking_partial_refund:{code:'UN_4766',name:'메가스팟_주차권_부분환불완료_v2',buttons:[],content:`[메가스팟 주차권 부분 환불 완료]
결제 주문번호: #{번호}
이번 부분 환불 금액: #{금액}원

주차권 결제의 일부 금액이 환불되었습니다.
차량별 등록 상태는 구매 내역에서 확인해 주세요.`},
 parking_paid:{code:'UN_4767',name:'메가스팟_주차권_결제완료_v3',buttons:parkingButtons,content:`[메가스팟 주차권 결제 완료]

주차권 결제가 완료되었습니다.

주문번호: #{주문번호}
차량 끝번호: #{차량끝번호}
이용일: #{이용일}
주차권: #{주차권}
이 차량 결제금액: #{결제금액}원

이용일의 실제 입차 기록을 확인해 차량별로 주차권을 자동 등록합니다.
결제만으로 주차 할인이 적용되지는 않습니다.
아래 구매 내역에서 등록 완료를 확인한 뒤 출차해 주세요.`},
 parking_arrival:{code:'UN_4768',name:'메가스팟_주차권_입차요청접수_v3',buttons:parkingButtons,content:`[메가스팟 주차 등록 요청 접수]

입차 알림이 접수되었습니다.

주문번호: #{주문번호}
차량 끝번호: #{차량끝번호}
이용일: #{이용일}
주차권: #{주차권}
접수일시: #{접수일시}

실제 입차 기록을 확인해 차량별로 주차권을 자동 등록합니다.
아래 구매 내역에서 등록 완료를 확인한 뒤 출차해 주세요.`}
};
