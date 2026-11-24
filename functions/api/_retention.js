// 고객 데이터 보관 방침 (2026-11-24)
//
// 운영 결정: 수집한 고객 데이터는 기간이 지났다고 자동으로 지우지 않고 DB에 계속 보관합니다.
// 아래 자동 정리 작업은 모두 이 스위치를 거칩니다.
//   - 모임 초대장 · 참석 응답 · 초대장 알림 기록 (_invites.js purge)
//   - 공간대관 계약서 · 계약서 알림 기록 (_contracts.js purgeContracts)
//   - 보증금 환급 계좌 (_deposit_refunds.js purgeAccounts)
//   - 지운 커뮤니티 글·댓글과 그 사진 (_community.js purgeDeleted)
//   - 방문 통계 (stats.js)
//
// 다시 기간별 삭제를 켜려면 Cloudflare 환경 변수 CUSTOMER_DATA_PURGE 를 'on' 으로 둡니다.
// 이용자가 직접 지우는 것(회원 탈퇴, 주최자의 초대장·응답 삭제)과 운영자가 지우는 것은 이 스위치와 관계없이 그대로 동작합니다.
// 로그인 세션·시도 횟수·만료된 임시 링크처럼 고객 데이터가 아닌 기술 기록의 정리도 그대로 둡니다.
export function purgeEnabled(env) {
  return String((env && env.CUSTOMER_DATA_PURGE) || '').trim().toLowerCase() === 'on';
}
