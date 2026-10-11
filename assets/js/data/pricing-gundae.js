// =====================================================================
//  메가스팟 건대 · 요금표 v2.0 (가격구조도 최종본, 2026-10-11)
//  - 숫자는 이 파일 한 곳에만 둡니다. 여기만 고치면 요금표·패키지·계산기·견적서·FAQ 예시가 함께 바뀝니다.
//  - 시간당 요금(원) × 요일 구분(월–목 / 금 / 토 / 일) + 인원 추가 + 옵션 방식입니다.
//  - 요일 구분은 공휴일에도 같은 규칙으로 정합니다 (아래 dayRule 참고).
// =====================================================================
window.MEGASPOT_PRICING = window.MEGASPOT_PRICING || {};
window.MEGASPOT_PRICING['megaspot-gundae'] = {
  version: '요금표 v2.0 · 2026년 10월 11일 기준',
  effectiveFrom: '2026-10-11',
  vatNote: '표시 금액은 부가세 포함 기준입니다.',   // 가격구조도에 부가세 표기가 없어 이전 기준(부가세 포함)을 유지했습니다. 다르면 이 문장과 FAQ를 고쳐 주세요.

  /* ---------- 인원 ---------- */
  people: { base: 20, extra: 10000, max: 150, note: '기준 인원 20명이 시간 요금에 들어 있고, 21명째부터 1명당 1만 원을 더합니다. 최대 150명까지 이용할 수 있습니다.' },

  /* ---------- 요일 구분 ---------- */
  cols: [
    { id: 'wd',  label: '월–목', short: '월–목' },
    { id: 'fri', label: '금',    short: '금' },
    { id: 'sat', label: '토',    short: '토' },
    { id: 'sun', label: '일',    short: '일' }
  ],
  // 휴일 = 토·일·공휴일. 이용일과 다음 날이 휴일인지로 요일 구분을 정합니다.
  dayRule: [
    { col: 'wd',  when: '이용일도 다음 날도 평일',        ex: '보통의 월–목요일' },
    { col: 'fri', when: '이용일은 평일, 다음 날은 휴일',  ex: '금요일, 공휴일 전날' },
    { col: 'sat', when: '이용일도 다음 날도 휴일',        ex: '토요일, 연휴 가운데 날' },
    { col: 'sun', when: '이용일은 휴일, 다음 날은 평일',  ex: '일요일, 연휴 마지막 날, 하루짜리 공휴일' }
  ],

  /* ---------- 시간대와 시간당 요금 (원) ---------- */
  // from/to: 시각(07=07시). 24 이상은 다음 날 새벽(24=자정, 31=다음 날 07시)
  bands: [
    { id: 'morning', label: '아침',  time: '07–12시', from: 7,  to: 12 },
    { id: 'day',     label: '낮',    time: '12–17시', from: 12, to: 17 },
    { id: 'evening', label: '저녁',  time: '17–24시', from: 17, to: 24 },
    { id: 'night',   label: '심야',  time: '24–07시', from: 24, to: 31 }
  ],
  hourly: {
    wd:  { morning: 40000,  day: 60000,  evening: 100000, night: 40000 },
    fri: { morning: 60000,  day: 60000,  evening: 150000, night: 80000 },
    sat: { morning: 80000,  day: 150000, evening: 200000, night: 100000 },
    sun: { morning: 100000, day: 150000, evening: 150000, night: 60000 }
  },
  openFrom: 7,   // 선택 가능한 시작 시각
  openTo: 31,    // 선택 가능한 종료 시각 (다음 날 07시)
  minHours: 1,

  /* ---------- 패키지 (시간 요금 묶음 할인) ---------- */
  // regular(정상가)는 시간당 요금을 더한 값과 같아야 합니다 (tools/test_pricing.js 에서 확인).
  packages: [
    { id: 'day',      label: '낮 패키지',     en: 'DAY',       start: 10, end: 17, hours: 7,  time: '10시–17시',
      price:   { wd: 300000, fri: 300000,  sat: 700000,  sun: 700000 },
      regular: { wd: 380000, fri: 420000,  sat: 910000,  sun: 950000 },
      fit: '세미나·클래스·워크숍·낮 모임' },
    { id: 'allday',   label: '올데이 패키지', en: 'ALL DAY',   start: 10, end: 24, hours: 14, time: '10시–24시',
      price:   { wd: 800000, fri: 1000000, sat: 1600000, sun: 1350000 },
      regular: { wd: 1080000, fri: 1470000, sat: 2310000, sun: 2000000 },
      fit: '하루 종일 쓰는 행사·행사 준비가 긴 모임' },
    { id: 'allnight', label: '올나잇 패키지', en: 'ALL NIGHT', start: 18, end: 31, hours: 13, time: '18시–다음 날 07시',
      price:   { wd: 700000, fri: 1100000, sat: 1500000, sun: 1000000 },
      regular: { wd: 880000, fri: 1460000, sat: 1900000, sun: 1320000 },
      fit: '저녁부터 밤새 이어지는 파티·MT·동아리 모임' }
  ],

  /* ---------- 옵션 (원하면 추가) ---------- */
  options: [
    { id: 'manager',    group: '인력',   label: '현장 매니저',       price: 25000,  unit: '1인 · 1시간',  per: 'manager', desc: '안내, 행사 보조, 정리 보조' },
    { id: 'cleaning',   group: '인력',   label: '뒷정리·청소 지원',   price: 200000, unit: '1회',          per: 'flat',    desc: '행사 뒤 정리와 청소를 맡겨 두고 바로 퇴실' },
    { id: 'disposable', group: '소모품', label: '1회용 세트',         price: 5000,   unit: '1인당',        per: 'person',  desc: '수저·젓가락·그릇·컵 일체' },
    { id: 'banner',     group: '디자인', label: '현수막 제작',        price: 120000, unit: '1장',          per: 'flat',    desc: '디자인까지 포함 · 사전 문의' },
    { id: 'xbanner',    group: '디자인', label: 'X배너 제작',         price: 70000,  unit: '1개',          per: 'flat',    desc: '디자인까지 포함' }
  ],
  // 금액을 상담에서 정하는 항목
  askOptions: [
    { group: '식음료', label: '케이터링·출장뷔페', desc: '구성·세팅·식사·정리 일체' },
    { group: '기타',   label: '사전 짐 보관',      desc: '보관 창고 안내' },
    { group: '기타',   label: '사전 답사',          desc: '가능 · 일정 문의' },
    { group: '기타',   label: '사진 기사',          desc: '행사 촬영' },
    { group: '기타',   label: '강사·MC 섭외',       desc: '행사 진행' }
  ],

  /* ---------- 기본 제공 (무료) ---------- */
  included: [
    { label: '200인치 빔프로젝터', big: true },
    { label: '마이크' }, { label: '스피커·앰프' }, { label: '강단' },
    { label: '스모그머신' }, { label: '미러볼·레이저' }, { label: '와인잔' }, { label: '행사용품' }
  ],
  includedNote: '위 항목은 공간료에 들어 있습니다. 수량과 사용 방법은 예약 확정 뒤 현장 안내와 함께 알려 드립니다.',

  /* ---------- 보증금·결제 ---------- */
  deposit: { amount: 150000, label: '이용 보증금', note: '기본 정리, 파손·오염, 부착물 제거 여부를 확인한 뒤 돌려 드립니다. 이용료와 따로 받습니다.' },
  corporate: '법인 결제·법인카드 결제가 필요하면 사전 예약금을 환급한 뒤 법인 결제로 진행할 수 있습니다.',

  /* ---------- 별도 협의 ---------- */
  special: [
    { id: 'regular', k: '정기 이용',            d: '4회 이상 미리 예약하면 별도 할인을 안내합니다.' },
    { id: 'popup',   k: '팝업·전시·행사·촬영',   d: '행사 성격과 기간에 맞춰 별도 할인을 안내합니다.' },
    { id: 'peak',    k: '성수기 12월·1월',       d: '성수기 요금은 따로 공지합니다. 문의 주시면 확정된 기준으로 안내합니다.' }
  ],
  peakMonths: [12, 1],

  /* ---------- 환불 규정 (이용료 기준 환불 비율) ---------- */
  refund: [
    { k: '예약 후 2시간 이내',    rate: 1,   note: '이용일과 관계없이 전액' },
    { k: '이용일 15일 이상 전',    rate: 1 },
    { k: '이용일 8~14일 전',       rate: 0.8 },
    { k: '이용일 6~7일 전',        rate: 0.6 },
    { k: '이용일 4~5일 전',        rate: 0.3 },
    { k: '이용일 3일 전~당일',     rate: 0 }
  ],
  refundNote: '환불 비율은 결제한 이용료 기준입니다. 취소 접수 시각을 기준으로 계산해 안내합니다.'
};
