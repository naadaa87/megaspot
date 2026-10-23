// =====================================================================
//  메가스팟 건대 2호 · 요금표 v1.1 (2026-10-23 · MEGASPOT_2호점_가격표_v1.1 기준)
//  - 2호 요금은 이 파일 한 곳에만 둡니다. 계산 방식은 1호(pricing-gundae.js)와 같고 숫자와 기준 인원만 다릅니다.
//  - 기준 인원 50명(평소·성수기 모든 날) · 51명째부터 1명당 1만 원 · 최대 350명
//  - 시간제 = 시간당 요금 × 이용 시간 + 기본 인원 가산액 255,000원(예약 1건당 한 번). 패키지 금액에는 가산액이 이미 들어 있습니다.
//  - 금액 기준: 1호 요금을 50명 기준으로 바꾼 뒤(1호 요금 + 30명 × 1만 원) 15% 낮추고 천 원 미만 올림. 옵션·보증금·환불·출장뷔페는 1호와 같습니다.
//  - 성수기(2026년 12월, 2027년 1월)는 아래 peak 의 금액을 대신 씁니다. 10월 30·31일은 오픈(11월 13일) 전이라 없습니다.
// =====================================================================
window.MEGASPOT_PRICING = window.MEGASPOT_PRICING || {};
window.MEGASPOT_PRICING['megaspot-gundae-2'] = {
  version: '요금표 v1.1 · 2026년 10월 23일 기준',
  effectiveFrom: '2026-11-13',
  vatNote: '표시 금액은 부가세 포함 기준입니다.',

  /* ---------- 공간 표시 (요금 화면·견적서·예약 신청서가 씁니다) ---------- */
  spaceId: 'megaspot-gundae-2',
  spaceName: '메가스팟 건대 2호',
  shortName: '건대 2호',
  page: '/spaces/megaspot-gundae-2/pricing/',
  address: '서울 광진구 화양동 10-1 한아름건물 2층 (1호와 같은 층 · 다른 호실)',
  fileTag: '메가스팟건대2호',
  onlinePass: false,          // 온라인 이용권(바로 결제)은 아직 1호만 — 2호는 예약 신청 뒤 담당자가 결제를 안내합니다
  opening: '2026-11-13',
  openingNote: '2026년 11월 13일 정식 오픈 예정입니다. 오픈일 이후 이용분을 지금 사전 예약으로 받고 있습니다.',

  /* ---------- 인원 ---------- */
  people: { base: 50, extra: 10000, max: 350, picks: [50, 80, 100, 150, 200, 300, 350], examples: [60, 80, 100, 150, 200, 300, 350], defaultPick: 80,
    note: '기준 인원 50명이 공간료에 들어 있고, 51명째부터 1명당 1만 원을 더합니다. 최대 350명까지 이용할 수 있으며 성수기에도 기준 인원은 50명으로 같습니다.' },
  // 시간제 예약 1건당 한 번 더하는 기본 인원 가산액 (50명 포함분). 패키지에는 들어 있습니다.
  surcharge: { amount: 255000, label: '기본 인원 가산액', note: '시간제 예약은 시간당 요금 × 이용 시간에 기본 인원 가산액 255,000원을 1건당 한 번 더합니다(기준 50명 포함, 인원이 적어도 같음). 패키지 금액에는 이미 들어 있습니다.' },

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
  hourly: {
    wd:  { morning: 34000, day: 51000,  evening: 85000,  night: 34000 },
    fri: { morning: 51000, day: 51000,  evening: 128000, night: 68000 },
    sat: { morning: 68000, day: 128000, evening: 170000, night: 85000 },
    sun: { morning: 85000, day: 128000, evening: 128000, night: 51000 }
  },
  openFrom: 5,
  openTo: 31,
  minHours: 1,

  /* ---------- 패키지 (50명 포함 · regular = 같은 시간을 시간제로 계산한 금액 + 가산액) ---------- */
  packages: [
    { id: 'day',      label: '낮 패키지',     en: 'DAY',       start: 10, end: 17, hours: 7,  time: '10시–17시',
      price:   { wd: 510000, fri: 510000,  sat: 850000,  sun: 850000 },
      regular: { wd: 578000, fri: 612000,  sat: 1031000, sun: 1065000 },
      fit: '세미나·클래스·워크숍·낮 모임' },
    { id: 'allday',   label: '올데이 패키지', en: 'ALL DAY',   start: 10, end: 24, hours: 14, time: '10시–24시',
      price:   { wd: 935000,  fri: 1105000, sat: 1615000, sun: 1403000 },
      regular: { wd: 1173000, fri: 1508000, sat: 2221000, sun: 1961000 },
      fit: '하루 종일 쓰는 행사·행사 준비가 긴 모임' },
    { id: 'allnight', label: '올나잇 패키지', en: 'ALL NIGHT', start: 18, end: 31, hours: 13, time: '18시–다음 날 07시',
      price:   { wd: 850000,  fri: 1190000, sat: 1530000, sun: 1105000 },
      regular: { wd: 1003000, fri: 1499000, sat: 1870000, sun: 1380000 },
      fit: '저녁부터 밤새 이어지는 파티·MT·동아리 모임' }
  ],

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
    { label: '200인치 레이저 빔프로젝터', big: true, sub: '설치 예정 · 무료' },
    { label: '와이파이' }, { label: '엘리베이터' }, { label: '건물 주차 최대 140대' }
  ],
  includedNote: '200인치 레이저 빔프로젝터 외의 기본 제공 장비(마이크·스피커·강단·연출 장비 등)는 인테리어 공사가 끝난 뒤 확정해 안내합니다. 1호와 같은 구성을 목표로 준비하고 있으며, 확정 전에는 상담에서 장비 조건을 먼저 안내해 드립니다.',
  includedShort: '200인치 레이저 빔프로젝터는 공간료에 들어 있고, 그 밖의 기본 제공 장비는 공사가 끝난 뒤 확정해 안내합니다.',

  /* ---------- 보증금·결제 (1호와 같음) ---------- */
  deposit: { amount: 150000, label: '이용 보증금', note: '기본 정리, 파손·오염, 부착물 제거 여부를 확인한 뒤 돌려 드립니다. 이용료와 따로 받습니다.' },
  corporate: '법인 결제·법인카드 결제가 필요하면 사전 예약금을 환급한 뒤 법인 결제로 진행할 수 있습니다.',

  /* ---------- 성수기 요금 (2026년 12월 · 2027년 1월 · 모든 날 50명 포함) ---------- */
  peak: {
    label: '성수기',
    periods: [
      { id: 'dec',  label: '12월', from: '2026-12-01', to: '2026-12-31' },
      { id: 'jan',  label: '1월',  from: '2027-01-01', to: '2027-01-31' }
    ],
    dates: { '2026-12-24': 'dec24', '2026-12-25': 'dec25', '2026-12-31': 'dec31', '2027-01-01': 'jan1' },
    months: { '2026-12': { wd: 'dec_wd', fri: 'dec_fri', sat: 'dec_sat', sun: 'dec_sun' }, '2027-01': { wd: 'jan_wd', fri: 'jan_fri', sat: 'jan_sat', sun: 'jan_sun' } },
    types: {
      dec_wd:  { label: '12월 월–목',  short: '월–목', period: 'dec', base: 'wd',  people: 50, surcharge: 255000, hourly: { morning: 43000,  day: 60000,  evening: 102000, night: 43000  }, pkg: { day: 561000,  allday: 1071000, allnight: 969000  } },
      dec_fri: { label: '12월 금요일', short: '금',    period: 'dec', base: 'fri', people: 50, surcharge: 255000, hourly: { morning: 73000,  day: 73000,  evening: 179000, night: 94000  }, pkg: { day: 612000,  allday: 1445000, allnight: 1564000 } },
      dec_sat: { label: '12월 토요일', short: '토',    period: 'dec', base: 'sat', people: 50, surcharge: 510000, hourly: { morning: 136000, day: 255000, evening: 340000, night: 170000 }, pkg: { day: 1700000, allday: 3230000, allnight: 3060000 } },
      dec_sun: { label: '12월 일요일', short: '일',    period: 'dec', base: 'sun', people: 50, surcharge: 383000, hourly: { morning: 128000, day: 192000, evening: 192000, night: 77000  }, pkg: { day: 1275000, allday: 2108000, allnight: 1658000 } },
      dec24:   { label: '12월 24일',   short: '12/24', period: 'dec', base: 'sun', people: 50, surcharge: 383000, hourly: { morning: 128000, day: 192000, evening: 192000, night: 77000  }, pkg: { day: 1275000, allday: 2108000, allnight: 1658000 }, same: 'dec_sun' },
      dec25:   { label: '12월 25일',   short: '12/25', period: 'dec', base: 'sat', people: 50, surcharge: 510000, hourly: { morning: 136000, day: 255000, evening: 340000, night: 170000 }, pkg: { day: 1700000, allday: 3230000, allnight: 3060000 }, same: 'dec_sat' },
      dec31:   { label: '12월 31일',   short: '12/31', period: 'dec', base: 'sat', people: 50, surcharge: 510000, hourly: { morning: 136000, day: 255000, evening: 340000, night: 170000 }, pkg: { day: 1700000, allday: 3230000, allnight: 3060000 }, same: 'dec_sat' },
      jan_wd:  { label: '1월 월–목',   short: '월–목', period: 'jan', base: 'wd',  people: 50, surcharge: 255000, hourly: { morning: 39000,  day: 56000,  evening: 94000,  night: 39000  }, pkg: { day: 536000,  allday: 1003000, allnight: 910000  } },
      jan_fri: { label: '1월 금요일',  short: '금',    period: 'jan', base: 'fri', people: 50, surcharge: 255000, hourly: { morning: 60000,  day: 60000,  evening: 153000, night: 81000  }, pkg: { day: 561000,  allday: 1275000, allnight: 1377000 } },
      jan_sat: { label: '1월 토요일',  short: '토',    period: 'jan', base: 'sat', people: 50, surcharge: 383000, hourly: { morning: 102000, day: 192000, evening: 255000, night: 128000 }, pkg: { day: 1275000, allday: 2423000, allnight: 2295000 } },
      jan_sun: { label: '1월 일요일',  short: '일',    period: 'jan', base: 'sun', people: 50, surcharge: 332000, hourly: { morning: 111000, day: 166000, evening: 166000, night: 68000  }, pkg: { day: 1105000, allday: 1828000, allnight: 1437000 } },
      jan1:    { label: '1월 1일',     short: '1/1',   period: 'jan', base: 'fri', people: 50, surcharge: 332000, hourly: { morning: 68000,  day: 68000,  evening: 166000, night: 90000  }, pkg: { day: 663000,  allday: 1437000, allnight: 1547000 } }
    },
    order: { dec: ['dec_wd', 'dec_fri', 'dec_sat', 'dec_sun', 'dec24', 'dec25', 'dec31'], jan: ['jan_wd', 'jan_fri', 'jan_sat', 'jan_sun', 'jan1'] },
    peopleNote: '성수기에도 기준 인원은 50명으로 같습니다. 시간당 요금과 시간제 가산액, 패키지 금액만 성수기 요금표를 따릅니다.',
    notes: [
      '성수기에도 공간료 = 시간당 요금 × 이용 시간 + 1건당 가산액입니다. 패키지 금액에는 가산액이 이미 들어 있습니다.',
      '기준 인원 50명보다 적게 와도 공간료는 같고, 51명째부터 1명당 1만 원입니다. 옵션과 보증금은 평소와 같습니다.',
      '12월 24일은 12월 일요일, 12월 25일·31일은 12월 토요일 요금과 같습니다. 12월 31일 올나잇은 1월 1일 요금을 다시 더하지 않습니다.',
      '성수기에는 요일 구분을 실제 요일로 정하고, 자정을 넘어도 시작한 이용일의 요금입니다. 2027년 2월 이후 성수기는 정해지면 안내합니다.'
    ]
  },

  /* ---------- 별도 협의 ---------- */
  special: [
    { id: 'breakfast', k: '조찬 모임',             en: 'Breakfast', d: '아침 일찍 시작하는 조찬 모임은 새벽 05시부터 잡을 수 있습니다. 따로 연락 주시면 추가 협찬과 할인을 안내해 드립니다.', cta: '조찬 모임 문의', href: '/inquiry/?space=megaspot-gundae-2&type=regular&purpose=seminar&start=7&end=10' },
    { id: 'regular',   k: '정기 모임',             en: 'Regulars',  d: '매주·격주·매월 여는 모임을 4회 이상 미리 예약하면 별도 할인을 안내하고, 따로 연락 주시면 추가 협찬까지 함께 안내해 드립니다.', cta: '정기 모임 문의', href: '/inquiry/?space=megaspot-gundae-2&type=regular' },
    { id: 'partner',   k: '제휴 모임',             en: 'Partners',  d: '기획·대행사, 학교·기관·커뮤니티, 브랜드와 함께 여는 제휴 모임은 조건을 듣고 따로 정합니다. 연락 주시면 추가 협찬과 할인을 안내해 드립니다.', cta: '제휴 모임 문의', href: '/inquiry/?space=megaspot-gundae-2&type=partner' },
    { id: 'popup',     k: '팝업·전시·행사·촬영',    en: 'Projects',  d: '행사 성격과 기간에 맞춰 별도 할인을 안내합니다. 기간과 규모를 알려 주세요.', cta: '조건 남기기', href: '/inquiry/?space=megaspot-gundae-2&purpose=popup' }
  ],
  specialNote: '조찬 모임 · 정기 모임 · 제휴 모임은 따로 연락 주시면 추가 협찬과 할인을 안내해 드립니다. 오픈 기념 행사와 300명 이상 대형 행사는 조건을 듣고 따로 안내합니다.',
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
