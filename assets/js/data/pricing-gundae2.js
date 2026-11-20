// 요금은 1호와 공통입니다. 2호의 오픈일과 인원 한도, 시설은 따로 정합니다.
(function(first){
'use strict';
window.MEGASPOT_PRICING['megaspot-gundae-2'] = {
  version: first.version,
  effectiveFrom: first.effectiveFrom,
  vatNote: first.vatNote,

  /* ---------- 공간 표시 (요금 화면·견적서·예약 신청서가 씁니다) ---------- */
  spaceId: 'megaspot-gundae-2',
  spaceName: '메가스팟 건대 2호',
  shortName: '건대 2호',
  page: '/spaces/megaspot-gundae-2/pricing/',
  address: '서울 광진구 화양동 10-1 한아름건물 2층 (1호와 같은 층 · 다른 호실)',
  fileTag: '메가스팟건대2호',
  onlinePass: false,          // 온라인 이용권(바로 결제)은 아직 1호만 — 2호는 예약 신청 뒤 담당자가 결제를 안내합니다
  opening: '2026-11-13',

  /* ---------- 인원 ---------- */
  // 신규 견적의 시작 인원은 공통 기준과 같은 50명입니다.
  people: { base: 50, extra: 10000, max: 350, picks: [50, 80, 100, 150, 200, 300, 350], examples: [60, 80, 100, 150, 200, 300, 350], defaultPick: 50,
    note: '기준 인원 50명이 공간료에 들어 있고, 51명째부터 1명당 1만 원을 더합니다. 최대 350명까지 이용할 수 있으며 성수기에도 기준 인원은 50명으로 같습니다.' },

  surcharge: first.surcharge,

  /* ---------- 요일 구분 (1호와 같음) ---------- */
  cols: [
    { id: 'wd',  label: '월–목', short: '월–목' },
    { id: 'fri', label: '금',    short: '금' },
    { id: 'sat', label: '토',    short: '토' },
    { id: 'sun', label: '일',    short: '일' }
  ],
  dayRule: [
    { col: 'wd',  when: '이용일도 다음 날도 평일',        ex: '보통의 월–목요일' },
    { col: 'fri', when: '이용일은 평일, 다음 날은 휴일',  ex: '금요일, 공휴일 전날' },
    { col: 'sat', when: '이용일도 다음 날도 휴일',        ex: '토요일, 연휴 가운데 날' },
    { col: 'sun', when: '이용일은 휴일, 다음 날은 평일',  ex: '일요일, 연휴 마지막 날, 하루짜리 공휴일' }
  ],

  /* ---------- 시간대와 시간당 요금 (원) ---------- */
  bands: [
    { id: 'morning', label: '아침',  time: '07–12시', from: 7,  to: 12 },
    { id: 'day',     label: '낮',    time: '12–17시', from: 12, to: 17 },
    { id: 'evening', label: '저녁',  time: '17–24시', from: 17, to: 24 },
    { id: 'night',   label: '심야',  time: '24–07시', from: 24, to: 31 }
  ],
  dawn: { from: 5, to: 7, band: 'night', note: '새벽 05–07시는 심야 시간대 요금으로 계산합니다.' },
  breakfastUntil: 9,
  hourly: first.hourly,
  openFrom: 5,
  openTo: 31,
  minHours: 1,

  /* ---------- 패키지 (기준 인원 50명) ---------- */
  packages: first.packages,
  fullDayOffer: first.fullDayOffer,

  /* ---------- 옵션 (1호와 같음) ---------- */
  options: [
    { id: 'manager',    group: '인력',   label: '현장 매니저',       price: 25000,  unit: '1인 · 1시간',  per: 'manager', desc: '안내, 행사 보조, 정리 보조' },
    { id: 'cleaning',   group: '인력',   label: '뒷정리·청소 지원',   price: 200000, unit: '1회',          per: 'flat',    desc: '행사 뒤 정리와 청소를 맡겨 두고 바로 퇴실' },
    { id: 'disposable', group: '소모품', label: '1회용 세트',         price: 5000,   unit: '1인당',        per: 'person',  desc: '수저·젓가락·그릇·컵 일체' },
    { id: 'banner',     group: '디자인', label: '현수막 제작',        price: 120000, unit: '1장',          per: 'flat',    desc: '디자인까지 포함 · 사전 문의' },
    { id: 'xbanner',    group: '디자인', label: 'X배너 제작',         price: 70000,  unit: '1개',          per: 'flat',    desc: '디자인까지 포함' }
  ],
  askOptions: [
    { group: '식음료', label: '케이터링·출장뷔페', desc: '구성·세팅·식사·정리 일체 · 1호와 같은 메뉴·금액' },
    { group: '기타',   label: '사전 짐 보관',      desc: '보관 창고 안내' },
    { group: '기타',   label: '사전 답사',          desc: '공사 진행 상황에 맞춰 일정 안내' },
    { group: '기타',   label: '사진 기사',          desc: '행사 촬영' },
    { group: '기타',   label: '강사·MC 섭외',       desc: '행사 진행' }
  ],

  /* ---------- 기본 제공 (무료) — 장비 구성은 공사가 끝난 뒤 확정 ---------- */
  included: [
    { label: '200인치 레이저 빔프로젝터 2대', big: true },
    { label: '무선마이크 2대' }, { label: '4웨이 앰프·스피커' }, { label: '테이블·의자 350명분' },
    { label: '레이저 미러볼' }, { label: '행사용품·레크리에이션 물품' }, { label: '싱크대·냉장고' },
    { label: '대형 창고' }, { label: '진행팀 카운터' }, { label: '최상급 와이파이·유선 랜' }, { label: '엘리베이터' }
  ],
  paidFacilities: [{ label: '건물 주차 120여 대', note: '유료 · 주차권 요금·운영 시간·차량 등록 조건은 주차 안내에서 확인해 주세요.', href: '/parking/' }],
  includedNote: '위 항목은 공간료에 들어 있습니다. 수량과 사용 방법은 예약 확정 뒤 현장 안내와 함께 알려 드리며, 강단 같은 그 밖의 장비는 상담으로 확인해 드립니다.',
  includedShort: '200인치 레이저 빔프로젝터 2대·무선마이크 2대·4웨이 앰프·스피커·레이저 미러볼은 공간료에 들어 있습니다.',

  /* ---------- 보증금·결제 (1호와 같음) ---------- */
  deposit: { amount: 150000, label: '이용 보증금', note: '기본 정리, 파손·오염, 부착물 제거 여부를 확인한 뒤 돌려 드립니다. 이용료와 따로 받습니다.' },
  corporate: '법인 결제·법인카드 결제가 필요하면 사전 예약금을 환급한 뒤 법인 결제로 진행할 수 있습니다.',

  /* ---------- 성수기 (1호 단가 · 2호 기준 인원 50명) ---------- */
  peak: {
    label: first.peak.label,
    periods: first.peak.periods.filter(function(period){ return period.to >= '2026-11-13'; }),
    dates: Object.fromEntries(Object.entries(first.peak.dates).filter(function(entry){ return entry[0] >= '2026-11-13'; })),
    months: first.peak.months,
    types: Object.fromEntries(Object.entries(first.peak.types).filter(function(entry){
      return entry[1].period !== 'oct';
    })),
    order: { dec: first.peak.order.dec, jan: first.peak.order.jan },
    peopleNote: '성수기에도 기준 인원 50명이 포함됩니다. 51명째부터 1명당 1만 원을 더합니다.',
    notes: [
      '성수기 시간제는 시간당 요금 × 이용 시간에 해당 날짜의 기본료를 1건당 한 번 더합니다. 기본료는 패키지 금액에 포함되어 있습니다.',
      '기준 인원 50명보다 적게 와도 공간료는 같고, 51명째부터 1명당 1만 원입니다. 옵션과 보증금은 평소와 같습니다.',
      '12월 24일은 12월 일요일, 12월 25일·31일은 12월 토요일 요금과 같습니다. 12월 31일 올나잇은 1월 1일 요금을 다시 더하지 않습니다.',
      '성수기에는 요일 구분을 실제 요일로 정하고, 자정을 넘어도 시작한 이용일의 요금입니다.'
    ]
  },

  /* ---------- 별도 협의 ---------- */
  special: [
    { id: 'breakfast', k: '조찬 모임',             en: 'Breakfast', d: '아침 일찍 시작하는 조찬 모임은 새벽 05시부터 잡을 수 있습니다. 따로 연락 주시면 추가 협찬과 할인을 안내해 드립니다.', cta: '조찬 모임 문의', href: '/inquiry/?space=megaspot-gundae-2&type=regular&purpose=seminar&start=7&end=10' },
    { id: 'regular',   k: '정기 모임',             en: 'Regulars',  d: '매주·격주·매월 여는 모임을 4회 이상 미리 예약하면 별도 할인을 안내하고, 따로 연락 주시면 추가 협찬까지 함께 안내해 드립니다.', cta: '정기 모임 문의', href: '/inquiry/?space=megaspot-gundae-2&type=regular' },
    { id: 'partner',   k: '제휴 모임',             en: 'Partners',  d: '기획·대행사, 학교·기관·커뮤니티, 브랜드와 함께 여는 제휴 모임은 조건을 듣고 따로 정합니다. 연락 주시면 추가 협찬과 할인을 안내해 드립니다.', cta: '제휴 모임 문의', href: '/inquiry/?space=megaspot-gundae-2&type=partner' },
    { id: 'popup',     k: '팝업·전시·행사·촬영',    en: 'Projects',  d: '행사 성격과 기간에 맞춰 별도 할인을 안내합니다. 기간과 규모를 알려 주세요.', cta: '조건 남기기', href: '/inquiry/?space=megaspot-gundae-2&purpose=popup' }
  ],
  specialNote: '조찬 모임 · 정기 모임 · 제휴 모임은 따로 연락 주시면 추가 협찬과 할인을 안내해 드립니다. 300명 이상 대형 행사는 조건을 듣고 따로 안내합니다.',
  peakMonths: [12, 1],

  /* ---------- 계산 예시 (요금 안내 페이지) — dow: 요일(0 일 … 6 토), min: 오늘부터 최소 며칠 뒤 ---------- */
  exampleCases: [
    { t: '평일 세미나 100명 · 낮 패키지',     dow: 4, s: 10, e: 17, p: 100, pu: 'seminar' },
    { t: '금요일 저녁 네트워킹 120명',        dow: 5, s: 19, e: 23, p: 120, pu: 'networking' },
    { t: '토요일 하루 종일 동문회 200명',     dow: 6, s: 10, e: 24, p: 200, pu: 'party', o: { cleaning: true } },
    { t: '평일 저녁 정기 모임 60명',          dow: 2, s: 19, e: 22, p: 60,  pu: 'community', regular: true },
    { t: '일요일 낮 원데이 클래스 50명',      dow: 0, s: 13, e: 16, p: 50,  pu: 'class' },
    { t: '금요일 밤샘 MT 80명',               dow: 5, min: 21, s: 18, e: 31, p: 80, pu: 'party', o: { disposable: true } }
  ],

  /* ---------- 목적별 요금 예시 시나리오 ---------- */
  purposeExamples: {
    seminar:    { date:'2026-11-19', start:10, end:17, people:100, title:'평일 낮 패키지 · 100명' },
    workshop:   { date:'2026-11-19', start:10, end:24, people:80,  title:'평일 올데이 패키지 · 80명' },
    networking: { date:'2026-11-20', start:19, end:23, people:120, title:'금요일 저녁 4시간 · 120명' },
    community:  { date:'2026-11-17', start:19, end:22, people:60,  title:'평일 저녁 3시간 · 60명 · 1회 기준', regular:true },
    class:      { date:'2026-11-18', start:13, end:16, people:50,  title:'평일 낮 3시간 · 50명' },
    culture:    { date:'2026-11-21', start:18, end:22, people:150, title:'토요일 저녁 4시간 · 150명' },
    party:      { date:'2026-11-21', start:10, end:17, people:120, title:'토요일 낮 패키지 · 120명' },
    popup:      { date:'2026-11-19', start:10, end:17, people:50,  title:'평일 낮 패키지 기준 · 팝업·전시는 별도 할인' },
    shooting:   { date:'2026-11-19', start:8,  end:12, people:50,  title:'평일 아침 4시간 기준 · 촬영은 별도 할인' }
  },

  /* ---------- 환불 규정 (1호와 같음) ---------- */
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
})(window.MEGASPOT_PRICING['megaspot-gundae']);
