// =====================================================================
//  메가스팟 건대 · 요금표 v2.1 (가격구조도 최종본 2026-10-11 + 성수기 요금편성표 2026-10-17)
//  - 숫자는 이 파일 한 곳에만 둡니다. 여기만 고치면 요금표·패키지·계산기·요금 달력·견적서·FAQ 예시가 함께 바뀝니다.
//  - 시간당 요금(원) × 요일 구분(월–목 / 금 / 토 / 일) + 인원 추가 + 옵션 방식입니다.
//  - 요일 구분은 공휴일에도 같은 규칙으로 정합니다 (아래 dayRule 참고).
//  - 성수기(2026-10-30·31, 2026년 12월, 2027년 1월)는 아래 peak 에 적힌 적용 구분의 요금을 대신 씁니다.
// =====================================================================
window.MEGASPOT_PRICING = window.MEGASPOT_PRICING || {};
window.MEGASPOT_PRICING['megaspot-gundae'] = {
  version: '요금표 v2.1 · 2026년 10월 17일 기준',
  effectiveFrom: '2026-10-17',
  vatNote: '표시 금액은 부가세 포함 기준입니다.',   // 가격구조도에 부가세 표기가 없어 이전 기준(부가세 포함)을 유지했습니다. 다르면 이 문장과 FAQ를 고쳐 주세요.

  /* ---------- 인원 ---------- */
  people: { base: 20, extra: 10000, max: 200, note: '기준 인원 20명이 시간 요금에 들어 있고, 21명째부터 1명당 1만 원을 더합니다. 최대 200명까지 이용할 수 있습니다. 성수기 주말·특정일은 기준 인원이 50명으로 늘어납니다(아래 성수기 요금 참고).' },

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
  // 새벽 05–07시(dawn)는 심야 시간대 요금으로 계산합니다. 조찬 모임은 따로 연락 주시면 추가 협찬·할인을 안내합니다.
  bands: [
    { id: 'morning', label: '아침',  time: '07–12시', from: 7,  to: 12 },
    { id: 'day',     label: '낮',    time: '12–17시', from: 12, to: 17 },
    { id: 'evening', label: '저녁',  time: '17–24시', from: 17, to: 24 },
    { id: 'night',   label: '심야',  time: '24–07시', from: 24, to: 31 }
  ],
  dawn: { from: 5, to: 7, band: 'night', note: '새벽 05–07시는 심야 시간대 요금으로 계산합니다.' },
  breakfastUntil: 9,   // 이 시각 전에 시작하면 '조찬 모임' 안내를 띄웁니다
  hourly: {
    wd:  { morning: 40000,  day: 60000,  evening: 100000, night: 40000 },
    fri: { morning: 60000,  day: 60000,  evening: 150000, night: 80000 },
    sat: { morning: 80000,  day: 150000, evening: 200000, night: 100000 },
    sun: { morning: 100000, day: 150000, evening: 150000, night: 60000 }
  },
  openFrom: 5,   // 선택 가능한 시작 시각 (새벽 05시)
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

  /* ---------- 성수기 요금 (요금편성표 2026-10-17) ----------
     - 적용 기간: 2026-10-30·31, 2026년 12월 전체, 2027년 1월 전체. 자정을 넘어도 '시작한 이용일'의 요금입니다.
     - 날짜 → 적용 구분: dates 에 적힌 특정일이 먼저, 그다음 months 의 실제 요일(월–목/금/토/일)로 정합니다. 공휴일 규칙은 쓰지 않습니다.
     - 시간제 = 시간당 요금 × 시간 + 1건당 가산액(surcharge). 패키지 금액에는 가산액이 이미 들어 있습니다.
     - people = 포함 인원. 그보다 적은 인원도 같은 공간료이고, 초과 인원은 1명당 1만 원입니다. 옵션·보증금은 그대로입니다. */
  peak: {
    label: '성수기',
    periods: [
      { id: 'oct',  label: '10월 30·31일', from: '2026-10-30', to: '2026-10-31' },
      { id: 'dec',  label: '12월',          from: '2026-12-01', to: '2026-12-31' },
      { id: 'jan',  label: '1월',           from: '2027-01-01', to: '2027-01-31' }
    ],
    dates: { '2026-10-30': 'oct30', '2026-10-31': 'oct31', '2026-12-24': 'dec24', '2026-12-25': 'dec25', '2026-12-31': 'dec31', '2027-01-01': 'jan1' },
    months: { '2026-12': { wd: 'dec_wd', fri: 'dec_fri', sat: 'dec_sat', sun: 'dec_sun' }, '2027-01': { wd: 'jan_wd', fri: 'jan_fri', sat: 'jan_sat', sun: 'jan_sun' } },
    // base: 비교 기준이 된 평소 요일 구분 · people: 포함 인원 · pct: 목표 인상률(%) · surcharge: 시간제 1건당 가산액
    types: {
      oct30:   { label: '10월 30일',  short: '10/30(금)',  period: 'oct', base: 'fri', people: 20, pct: 20,  surcharge: 0,      hourly: { morning: 70000,  day: 70000,  evening: 180000, night: 95000  }, pkg: { day: 360000,  allday: 1200000, allnight: 1320000 } },
      oct31:   { label: '10월 31일',  short: '10/31(토)',  period: 'oct', base: 'sat', people: 50, pct: 50,  surcharge: 450000, hourly: { morning: 120000, day: 225000, evening: 300000, night: 150000 }, pkg: { day: 1500000, allday: 2850000, allnight: 2700000 } },
      dec_wd:  { label: '12월 월–목', short: '월–목',      period: 'dec', base: 'wd',  people: 20, pct: 20,  surcharge: 0,      hourly: { morning: 50000,  day: 70000,  evening: 120000, night: 50000  }, pkg: { day: 360000,  allday: 960000,  allnight: 840000  } },
      dec_fri: { label: '12월 금요일', short: '금',        period: 'dec', base: 'fri', people: 20, pct: 40,  surcharge: 0,      hourly: { morning: 85000,  day: 85000,  evening: 210000, night: 110000 }, pkg: { day: 420000,  allday: 1400000, allnight: 1540000 } },
      dec_sat: { label: '12월 토요일', short: '토',        period: 'dec', base: 'sat', people: 50, pct: 100, surcharge: 600000, hourly: { morning: 160000, day: 300000, evening: 400000, night: 200000 }, pkg: { day: 2000000, allday: 3800000, allnight: 3600000 } },
      dec_sun: { label: '12월 일요일', short: '일',        period: 'dec', base: 'sun', people: 50, pct: 50,  surcharge: 450000, hourly: { morning: 150000, day: 225000, evening: 225000, night: 90000  }, pkg: { day: 1500000, allday: 2480000, allnight: 1950000 } },
      dec24:   { label: '12월 24일',  short: '12/24',      period: 'dec', base: 'sun', people: 50, pct: 50,  surcharge: 450000, hourly: { morning: 150000, day: 225000, evening: 225000, night: 90000  }, pkg: { day: 1500000, allday: 2480000, allnight: 1950000 }, same: 'dec_sun' },
      dec25:   { label: '12월 25일',  short: '12/25',      period: 'dec', base: 'sat', people: 50, pct: 100, surcharge: 600000, hourly: { morning: 160000, day: 300000, evening: 400000, night: 200000 }, pkg: { day: 2000000, allday: 3800000, allnight: 3600000 }, same: 'dec_sat' },
      dec31:   { label: '12월 31일',  short: '12/31',      period: 'dec', base: 'sat', people: 50, pct: 100, surcharge: 600000, hourly: { morning: 160000, day: 300000, evening: 400000, night: 200000 }, pkg: { day: 2000000, allday: 3800000, allnight: 3600000 }, same: 'dec_sat' },
      jan_wd:  { label: '1월 월–목',  short: '월–목',      period: 'jan', base: 'wd',  people: 20, pct: 10,  surcharge: 0,      hourly: { morning: 45000,  day: 65000,  evening: 110000, night: 45000  }, pkg: { day: 330000,  allday: 880000,  allnight: 770000  } },
      jan_fri: { label: '1월 금요일', short: '금',         period: 'jan', base: 'fri', people: 20, pct: 20,  surcharge: 0,      hourly: { morning: 70000,  day: 70000,  evening: 180000, night: 95000  }, pkg: { day: 360000,  allday: 1200000, allnight: 1320000 } },
      jan_sat: { label: '1월 토요일', short: '토',         period: 'jan', base: 'sat', people: 50, pct: 50,  surcharge: 450000, hourly: { morning: 120000, day: 225000, evening: 300000, night: 150000 }, pkg: { day: 1500000, allday: 2850000, allnight: 2700000 } },
      jan_sun: { label: '1월 일요일', short: '일',         period: 'jan', base: 'sun', people: 50, pct: 30,  surcharge: 390000, hourly: { morning: 130000, day: 195000, evening: 195000, night: 80000  }, pkg: { day: 1300000, allday: 2150000, allnight: 1690000 } },
      jan1:    { label: '1월 1일',    short: '1/1',        period: 'jan', base: 'fri', people: 50, pct: 30,  surcharge: 390000, hourly: { morning: 80000,  day: 80000,  evening: 195000, night: 105000 }, pkg: { day: 780000,  allday: 1690000, allnight: 1820000 } }
    },
    // 표에 보여 줄 순서 (기간별)
    order: { oct: ['oct30', 'oct31'], dec: ['dec_wd', 'dec_fri', 'dec_sat', 'dec_sun', 'dec24', 'dec25', 'dec31'], jan: ['jan_wd', 'jan_fri', 'jan_sat', 'jan_sun', 'jan1'] },
    notes: [
      '성수기에도 공간료 = 시간당 요금 × 이용 시간입니다. 포함 인원이 50명인 날은 시간제에 1건당 가산액을 한 번 더하고, 패키지 금액에는 이미 들어 있습니다.',
      '포함 인원보다 적게 와도 공간료는 같고, 초과 인원은 1명당 1만 원입니다. 옵션과 보증금은 평소와 같습니다.',
      '12월 24일은 12월 일요일, 12월 25일·31일은 12월 토요일 요금과 같습니다. 12월 31일 올나잇은 1월 1일 요금을 다시 더하지 않습니다.',
      '성수기에는 요일 구분을 실제 요일로 정하고, 자정을 넘어도 시작한 이용일의 요금입니다.'
    ]
  },

  /* ---------- 별도 협의 (따로 연락 주시면 추가 협찬·할인 안내) ---------- */
  special: [
    { id: 'breakfast', k: '조찬 모임',             en: 'Breakfast', d: '아침 일찍 시작하는 조찬 모임은 새벽 05시부터 잡을 수 있습니다. 따로 연락 주시면 추가 협찬과 할인을 안내해 드립니다.', cta: '조찬 모임 문의', href: '/inquiry/?type=regular&purpose=seminar&start=7&end=10' },
    { id: 'regular',   k: '정기 모임',             en: 'Regulars',  d: '매주·격주·매월 여는 모임을 4회 이상 미리 예약하면 별도 할인을 안내하고, 따로 연락 주시면 추가 협찬까지 함께 안내해 드립니다.', cta: '정기 모임 문의', href: '/inquiry/?type=regular' },
    { id: 'partner',   k: '제휴 모임',             en: 'Partners',  d: '기획·대행사, 학교·기관·커뮤니티, 브랜드와 함께 여는 제휴 모임은 조건을 듣고 따로 정합니다. 연락 주시면 추가 협찬과 할인을 안내해 드립니다.', cta: '제휴 모임 문의', href: '/inquiry/?type=partner' },
    { id: 'popup',     k: '팝업·전시·행사·촬영',    en: 'Projects',  d: '행사 성격과 기간에 맞춰 별도 할인을 안내합니다. 기간과 규모를 알려 주세요.', cta: '조건 남기기', href: '/inquiry/?purpose=popup' }
  ],
  specialNote: '조찬 모임 · 정기 모임 · 제휴 모임은 따로 연락 주시면 추가 협찬과 할인을 안내해 드립니다.',
  peakMonths: [12, 1],

  /* ---------- 목적별 요금 예시 시나리오 (어떤 모임 페이지·목적별 안내 페이지에서 계산) ---------- */
  purposeExamples: {
    seminar:    { date:'2026-11-05', start:10, end:17, people:50,  title:'평일 낮 패키지 · 50명' },
    workshop:   { date:'2026-11-05', start:10, end:24, people:40,  title:'평일 올데이 패키지 · 40명' },
    networking: { date:'2026-11-06', start:19, end:23, people:60,  title:'금요일 저녁 4시간 · 60명' },
    community:  { date:'2026-11-03', start:19, end:22, people:30,  title:'평일 저녁 3시간 · 30명 · 1회 기준', regular:true },
    class:      { date:'2026-11-04', start:13, end:16, people:25,  title:'평일 낮 3시간 · 25명' },
    culture:    { date:'2026-11-07', start:18, end:22, people:80,  title:'토요일 저녁 4시간 · 80명' },
    party:      { date:'2026-11-07', start:10, end:17, people:60,  title:'토요일 낮 패키지 · 60명' },
    popup:      { date:'2026-11-05', start:10, end:17, people:20,  title:'평일 낮 패키지 기준 · 팝업·전시는 별도 할인' },
    shooting:   { date:'2026-11-05', start:8,  end:12, people:20,  title:'평일 아침 4시간 기준 · 촬영은 별도 할인' }
  },

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
