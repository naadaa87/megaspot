// Immutable fingerprint input for the approved UN_2759 v1 template.
// Used only to validate unchanged notices and read historical delivery results.
export const LEGACY_DEPOSIT_PAYMENT_CODE='UN_2759';
export const LEGACY_DEPOSIT_PAYMENT_TEMPLATE=Object.freeze({
 name:'메가스팟_보증금_입금안내_v1',
 content:`[메가스팟 보증금 입금 안내]

#{고객명}님, 예약하신 공간의 이용 보증금을 안내드립니다.

■ 예약 공간: #{공간명}
■ 이용일: #{이용일}
■ 보증금: #{보증금액}원
■ 입금 기한: #{입금기한}
■ 하나은행 298-910064-39104
■ 예금주: 주식회사 블랭크

시설 상태와 청소·정리 여부를 확인한 뒤, 이용 종료일이 속한 주의 다음 주 수요일에 보증금을 환급해 드립니다.
문의: 메가스팟 카카오톡`,
 buttons:Object.freeze([])
});
