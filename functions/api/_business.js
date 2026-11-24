// 고객 화면·문서에 쓰는 사업자·계좌 정보를 한곳에 (2026-11-24)
// 값을 바꾸면 예약 안내(/booking/)·나의 예약확인(/my-booking/) 화면이 함께 바뀝니다.
// 알림톡 원문(_deposit_templates.js 등)은 카카오 심사를 받은 글이라 여기서 바꾸지 않습니다 — 원문을 고칠 때는 템플릿 심사를 먼저 받아 주세요.
// 계약서의 운영자·계좌 기본값은 관리자 '대관 계약서 → 설정'에 저장된 값이 먼저입니다(assets/js/kit/contract-doc.js).
export const RENTAL_BANK = Object.freeze({ name: '하나은행', account: '298-910064-39104', holder: '주식회사 블랭크' });   // 이용료(대관료) 받는 계좌
export const DEPOSIT_BANK = Object.freeze({ name: '기업은행', account: '064-179058-04018', holder: '주식회사 지유공간개발' });   // 이용 보증금 받는 계좌
export const bankCopy = b => ({ name: b.name, account: b.account, holder: b.holder });
