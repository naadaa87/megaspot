// 메가스팟 건대 1호·2호 위치 표기 한곳 (2026-11-25)
//  · 화면 표기는 도로명 주소를 먼저, 지번은 괄호로 함께 적습니다.
//  · 구조화 데이터(검색엔진용)도 같은 도로명 주소를 씁니다.
//  · 1호와 2호는 같은 건물 같은 층의 다른 호실입니다.
export const PLACE = {
  road: '서울 광진구 능동로13길 39',
  jibun: '서울 광진구 화양동 10-1',
  building: '한아름건물 2층',
  full: '서울 광진구 능동로13길 39 한아름건물 2층',
  withJibun: '서울 광진구 능동로13길 39 한아름건물 2층 (화양동 10-1)',
  transit: '지하철 2·7호선 건대입구역 인근',
  geo: { latitude: '37.5405', longitude: '127.0695' }
};
export const POSTAL_ADDRESS = { '@type': 'PostalAddress', streetAddress: '능동로13길 39 한아름건물 2층', addressLocality: '광진구', addressRegion: '서울특별시', addressCountry: 'KR' };
export const VENUE_NAME = { 'megaspot-gundae': '메가스팟 건대 1호', 'megaspot-gundae-2': '메가스팟 건대 2호' };
export const CONTACT_EMAIL = 'spaceblank0100@gmail.com';   // 예약·이용 문의 (회사 메일 guspacedev@gmail.com 은 사업자 정보에만)
