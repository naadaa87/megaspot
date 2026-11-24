// =====================================================================
//  메가스팟 건대 1호 · 요금표 v3.0 (기준 50명 및 1·2호 요금 통일)
//  - 건대 2호의 공간 정보는 pricing-gundae2.js 에 있으며, 시간당 요금과 패키지는 이 파일에서 공유합니다.
//  - 숫자는 이 파일 한 곳에만 둡니다. 여기만 고치면 요금표·패키지·계산기·요금 달력·견적서·FAQ 예시가 함께 바뀝니다.
//  - 시간당 요금(원) × 이용 시간 + 시간제 1건당 기본료 + 인원 추가 + 옵션 방식입니다.
//  - 요일 구분은 공휴일에도 같은 규칙으로 정합니다 (아래 dayRule 참고).
//  - 성수기(2026-10-30·31, 2026년 12월, 2027년 1월)는 아래 peak 에 적힌 적용 구분의 요금을 대신 씁니다.
//  - 12월 할인일(5·6·13·24·25·26·27·31일)은 성수기 요금에서 20% 할인한 금액입니다(천 원 단위 올림, 2026-11-24 반영).
// =====================================================================
window.MEGASPOT_PRICING = window.MEGASPOT_PRICING || {};
window.MEGASPOT_PRICING['megaspot-gundae'] = {
  version: '요금표 v3.3 · 2026년 11월 24일 기준',
  effectiveFrom: '2026-11-24',
  vatNote: '표시 금액은 부가세 포함 기준입니다.',   // 가격구조도에 부가세 표기가 없어 이전 기준(부가세 포함)을 유지했습니다. 다르면 이 문장과 FAQ를 고쳐 주세요.

  /* ---------- 공간 표시 (요금 화면·견적서·예약 신청서가 씁니다) ---------- */
  spaceId: 'megaspot-gundae',
  spaceName: '메가스팟 건대 1호',
  shortName: '건대 1호',
  page: '/spaces/megaspot-gundae/pricing/',
  address: '서울 광진구 화양동 10-1 한아름건물 2층',
  fileTag: '메가스팟건대1호',
  onlinePass: true,           // 패키지 시간과 같으면 온라인 이용권(/products/)으로 바로 결제할 수 있습니다

  /* ---------- 인원 ---------- */
  people: { base: 50, extra: 10000, max: 200, picks: [20, 30, 50, 100, 150, 200], examples: [50, 100, 150, 200], defaultPick: 50, note: '기준 인원 50명이 공간료에 들어 있고, 51명째부터 1명당 1만 원을 더합니다. 최대 200명까지 이용할 수 있습니다.' },
  surcharge: { amount: 300000, label: '기본 인원 가산액', note: '평소 시간제는 시간당 요금 × 이용 시간에 기본료 30만 원을 예약 1건당 한 번 더합니다. 패키지는 기본료가 포함된 금액입니다.' },

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
  // regular(정상가)는 시간당 요금 합계에 예약 기본료를 더한 값과 같아야 합니다 (tools/test_pricing.js 에서 확인).
  packages: [
    { id: 'day',      label: '낮 패키지',     en: 'DAY',       start: 10, end: 17, hours: 7,  time: '10시–17시',
      price:   { wd: 600000, fri: 600000,  sat: 1000000,  sun: 1000000 },
      regular: { wd: 680000, fri: 720000,  sat: 1210000,  sun: 1250000 },
      fit: '세미나·클래스·워크숍·낮 모임' },
    { id: 'allday',   label: '올데이 패키지', en: 'ALL DAY',   start: 10, end: 24, hours: 14, time: '10시–24시',
      price:   { wd: 800000, fri: 1000000, sat: 1600000, sun: 1350000 },
      regular: { wd: 1380000, fri: 1770000, sat: 2610000, sun: 2300000 },
      referenceRegular: { wd: 1080000, fri: 1470000, sat: 2310000, sun: 2000000 },
      fit: '오전 10시부터 자정까지 이용하는 행사' },
    { id: 'allnight', label: '올나잇 패키지', en: 'ALL NIGHT', start: 18, end: 31, hours: 13, time: '18시–다음 날 07시',
      price:   { wd: 1000000, fri: 1400000, sat: 1800000, sun: 1300000 },
      regular: { wd: 1180000, fri: 1760000, sat: 2200000, sun: 1620000 },
      fit: '저녁부터 밤새 이어지는 파티·MT·동아리 모임' }
  ],

  /* ---------- 24시간 종일 대관 (한시적 별도 상품, 기준 50명) ---------- */
  fullDayOffer: {
    id: 'full-day', label: '종일 대관', en: '24 HOURS', start: 0, end: 24, hours: 24, time: '00:00–24:00',
    prices: {
      '2026-12': { wd: 1260000, fri: 1700000, sat: 3800000, sun: 2480000 },
      '2027-01': { wd: 1180000, fri: 1500000, sat: 2850000, sun: 2150000 },
      '2027-02': { wd: 1100000, fri: 1300000, sat: 1900000, sun: 1650000 }
    },
    // 12월 할인일은 특정일 목록에 들어가도 종일 대관 조회 금액을 바꾸지 않습니다(이미 발행한 종일 대관 견적·예약 보존).
    keepOnSpecial: { '2026-12-05': 1, '2026-12-06': 1, '2026-12-13': 1, '2026-12-26': 1, '2026-12-27': 1 },
    priceOn: function(date, holidays, specialDates){
      var rates = this.prices[date.slice(0, 7)];
      if (!rates || holidays[date] || (specialDates[date] && !this.keepOnSpecial[date])) return null;
      var day = new Date(date + 'T00:00:00Z');
      if (isNaN(day) || day.toISOString().slice(0, 10) !== date) return null;
      var dow = day.getUTCDay();
      day.setUTCDate(day.getUTCDate() + 1);
      if (holidays[day.toISOString().slice(0, 10)]) return null;
      return rates[dow === 0 ? 'sun' : dow === 6 ? 'sat' : dow === 5 ? 'fri' : 'wd'];
    }
  },

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
    { label: '200인치 레이저 빔프로젝터', big: true },
    { label: '무선마이크 2대' }, { label: '4웨이 앰프·스피커' }, { label: '테이블·의자 200명분' },
    { label: '강단' }, { label: '스모그머신' }, { label: '레이저 미러볼' }, { label: '와인잔·행사용품' },
    { label: '레크리에이션 물품' }, { label: '싱크대·냉장고' }, { label: '대형 창고' }, { label: '진행팀 별도 공간' },
    { label: '최상급 와이파이·유선 랜' }, { label: '엘리베이터' }
  ],
  paidFacilities: [{ label: '건물 주차 120여 대', note: '유료 · 주차권 요금·운영 시간·차량 등록 조건은 주차 안내에서 확인해 주세요.', href: '/parking/' }],
  includedNote: '위 항목은 공간료에 들어 있습니다. 수량과 사용 방법은 예약 확정 뒤 현장 안내와 함께 알려 드립니다.',
  includedShort: '200인치 레이저 빔프로젝터·무선마이크 2대·4웨이 앰프·스피커·강단은 공간료에 들어 있습니다.',

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
    // 12월 할인일(2026-11-24 반영): 5·26일(토)과 6·13·27일(일)은 할인 구분, 24·25·31일은 기존 특정일 구분에 할인 금액을 넣었습니다.
    dates: { '2026-10-30': 'oct30', '2026-10-31': 'oct31',
      '2026-12-05': 'dec_sat_sale', '2026-12-06': 'dec_sun_sale', '2026-12-13': 'dec_sun_sale', '2026-12-24': 'dec24', '2026-12-25': 'dec25',
      '2026-12-26': 'dec_sat_sale', '2026-12-27': 'dec_sun_sale', '2026-12-31': 'dec31', '2027-01-01': 'jan1' },
    months: { '2026-12': { wd: 'dec_wd', fri: 'dec_fri', sat: 'dec_sat', sun: 'dec_sun' }, '2027-01': { wd: 'jan_wd', fri: 'jan_fri', sat: 'jan_sat', sun: 'jan_sun' } },
    // base: 비교 기준이 된 평소 요일 구분 · people: 포함 인원 · pct: 목표 인상률(%) · surcharge: 시간제 1건당 가산액
    // sale: 할인율 · saleFrom: 할인 전 구분 · calTag: 요금 달력 날짜 아래 표시. 할인 금액 = 할인 전 금액 × 0.8, 천 원 단위 올림
    types: {
      oct30:   { label: '10월 30일',  short: '10/30(금)',  period: 'oct', base: 'fri', people: 50, pct: 20,  surcharge: 300000, hourly: { morning: 70000,  day: 70000,  evening: 180000, night: 95000  }, pkg: { day: 660000,  allday: 1200000, allnight: 1620000 } },
      oct31:   { label: '10월 31일',  short: '10/31(토)',  period: 'oct', base: 'sat', people: 50, pct: 50,  surcharge: 450000, hourly: { morning: 120000, day: 225000, evening: 300000, night: 150000 }, pkg: { day: 1500000, allday: 2850000, allnight: 2700000 } },
      dec_wd:  { label: '12월 월–목', short: '월–목',      period: 'dec', base: 'wd',  people: 50, pct: 20,  surcharge: 300000, hourly: { morning: 50000,  day: 70000,  evening: 120000, night: 50000  }, pkg: { day: 660000,  allday: 960000,  allnight: 1140000  } },
      dec_fri: { label: '12월 금요일', short: '금',        period: 'dec', base: 'fri', people: 50, pct: 40,  surcharge: 300000, hourly: { morning: 85000,  day: 85000,  evening: 210000, night: 110000 }, pkg: { day: 720000,  allday: 1400000, allnight: 1840000 } },
      dec_sat: { label: '12월 토요일', short: '토',        period: 'dec', base: 'sat', people: 50, pct: 100, surcharge: 600000, hourly: { morning: 160000, day: 300000, evening: 400000, night: 200000 }, pkg: { day: 2000000, allday: 3800000, allnight: 3600000 } },
      dec_sun: { label: '12월 일요일', short: '일',        period: 'dec', base: 'sun', people: 50, pct: 50,  surcharge: 450000, hourly: { morning: 150000, day: 225000, evening: 225000, night: 90000  }, pkg: { day: 1500000, allday: 2480000, allnight: 1950000 } },
      dec_sat_sale: { label: '12월 5·26일(토) 20% 할인', short: '12/5·12/26', period: 'dec', base: 'sat', people: 50, pct: 60, sale: 20, saleFrom: 'dec_sat', calTag: '20% 할인', surcharge: 480000, hourly: { morning: 128000, day: 240000, evening: 320000, night: 160000 }, pkg: { day: 1600000, allday: 3040000, allnight: 2880000 } },
      dec_sun_sale: { label: '12월 6·13·27일(일) 20% 할인', short: '12/6·12/13·12/27', period: 'dec', base: 'sun', people: 50, pct: 20, sale: 20, saleFrom: 'dec_sun', calTag: '20% 할인', surcharge: 360000, hourly: { morning: 120000, day: 180000, evening: 180000, night: 72000 }, pkg: { day: 1200000, allday: 1984000, allnight: 1560000 } },
      dec24:   { label: '12월 24일 20% 할인', short: '12/24',  period: 'dec', base: 'sun', people: 50, pct: 20,  sale: 20, saleFrom: 'dec_sun', calTag: '20% 할인', surcharge: 360000, hourly: { morning: 120000, day: 180000, evening: 180000, night: 72000  }, pkg: { day: 1200000, allday: 1984000, allnight: 1560000 }, same: 'dec_sun_sale' },
      dec25:   { label: '12월 25일 20% 할인', short: '12/25',  period: 'dec', base: 'sat', people: 50, pct: 60,  sale: 20, saleFrom: 'dec_sat', calTag: '20% 할인', surcharge: 480000, hourly: { morning: 128000, day: 240000, evening: 320000, night: 160000 }, pkg: { day: 1600000, allday: 3040000, allnight: 2880000 }, same: 'dec_sat_sale' },
      dec31:   { label: '12월 31일 20% 할인', short: '12/31',  period: 'dec', base: 'sat', people: 50, pct: 60,  sale: 20, saleFrom: 'dec_sat', calTag: '20% 할인', surcharge: 480000, hourly: { morning: 128000, day: 240000, evening: 320000, night: 160000 }, pkg: { day: 1600000, allday: 3040000, allnight: 2880000 }, same: 'dec_sat_sale' },
      jan_wd:  { label: '1월 월–목',  short: '월–목',      period: 'jan', base: 'wd',  people: 50, pct: 10,  surcharge: 300000, hourly: { morning: 45000,  day: 65000,  evening: 110000, night: 45000  }, pkg: { day: 630000,  allday: 880000,  allnight: 1070000  } },
      jan_fri: { label: '1월 금요일', short: '금',         period: 'jan', base: 'fri', people: 50, pct: 20,  surcharge: 300000, hourly: { morning: 70000,  day: 70000,  evening: 180000, night: 95000  }, pkg: { day: 660000,  allday: 1200000, allnight: 1620000 } },
      jan_sat: { label: '1월 토요일', short: '토',         period: 'jan', base: 'sat', people: 50, pct: 50,  surcharge: 450000, hourly: { morning: 120000, day: 225000, evening: 300000, night: 150000 }, pkg: { day: 1500000, allday: 2850000, allnight: 2700000 } },
      jan_sun: { label: '1월 일요일', short: '일',         period: 'jan', base: 'sun', people: 50, pct: 30,  surcharge: 390000, hourly: { morning: 130000, day: 195000, evening: 195000, night: 80000  }, pkg: { day: 1300000, allday: 2150000, allnight: 1690000 } },
      jan1:    { label: '1월 1일',    short: '1/1',        period: 'jan', base: 'fri', people: 50, pct: 30,  surcharge: 390000, hourly: { morning: 80000,  day: 80000,  evening: 195000, night: 105000 }, pkg: { day: 780000,  allday: 1690000, allnight: 1820000 } }
    },
    // 표에 보여 줄 순서 (기간별)
    order: { oct: ['oct30', 'oct31'], dec: ['dec_wd', 'dec_fri', 'dec_sat', 'dec_sun', 'dec_sat_sale', 'dec_sun_sale', 'dec24', 'dec25', 'dec31'], jan: ['jan_wd', 'jan_fri', 'jan_sat', 'jan_sun', 'jan1'] },
    peopleNote: '성수기에도 기준 인원은 50명입니다. 시간제 기본료는 날짜별로 다르며 1건당 한 번 더합니다.',
    notes: [
      '성수기 시간제는 시간당 요금 × 이용 시간에 해당 날짜의 기본료를 1건당 한 번 더합니다. 기본료는 패키지 금액에 포함되어 있습니다.',
      '포함 인원보다 적게 와도 공간료는 같고, 초과 인원은 1명당 1만 원입니다. 옵션과 보증금은 평소와 같습니다.',
      '12월 5·6·13·24·25·26·27·31일은 성수기 요금에서 20% 할인한 금액입니다(천 원 단위 올림). 12월 24일은 일요일 할인 요금, 25·31일은 토요일 할인 요금과 같습니다.',
      '12월 31일 올나잇은 1월 1일 요금을 다시 더하지 않습니다.',
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

  /* ---------- 계산 예시 (요금 안내 페이지) — dow: 요일(0 일 … 6 토), min: 오늘부터 최소 며칠 뒤 ---------- */
  exampleCases: [
    { t: '평일 세미나 50명',             dow: 4, s: 10, e: 17, p: 50, pu: 'seminar' },
    { t: '금요일 저녁 네트워킹 60명',    dow: 5, s: 19, e: 23, p: 60, pu: 'networking' },
    { t: '토요일 하루 종일 동문회 100명', dow: 6, s: 10, e: 24, p: 100, pu: 'party', o: { cleaning: true } },
    { t: '평일 저녁 정기 모임 30명',      dow: 2, s: 19, e: 22, p: 30, pu: 'community', regular: true },
    { t: '일요일 낮 원데이 클래스 25명',  dow: 0, s: 13, e: 16, p: 25, pu: 'class' },
    { t: '금요일 밤샘 MT 40명',           dow: 5, min: 21, s: 18, e: 31, p: 40, pu: 'party', o: { disposable: true } }
  ],

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
