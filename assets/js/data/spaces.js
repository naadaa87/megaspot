// =====================================================================
//  메가스팟 · 공간 데이터
//  - 플랫폼에 노출되는 모든 공간은 이 파일의 형식을 따릅니다.
//  - 새 공간(직영·외부 호스트)을 추가할 때는 아래 객체를 복사해 채우고,
//    확인되지 않은 값은 비워 두거나 note에 "확인 필요"로 적습니다.
//  - type: 'direct'(직영) | 'managed'(운영 위탁) | 'host'(외부 호스트)
// =====================================================================

window.MEGASPOT_PURPOSES = [
  { id:'seminar',   label:'강연·세미나',     en:'SEMINAR',     desc:'발표가 잘 보이고 잘 들리는 행사. 좌석·화면·마이크·연결 지원이 핵심입니다.' },
  { id:'workshop',  label:'워크숍·기업 교류', en:'WORKSHOP',   desc:'발표 뒤 대화와 팀 활동이 이어지는 행사. 책상 배치와 동선, 다과 정리가 중요합니다.' },
  { id:'community', label:'커뮤니티 정기 모임', en:'COMMUNITY', desc:'반복할수록 준비가 쉬워야 하는 모임. 일정 협의와 반복 견적이 필요합니다.' },
  { id:'party',     label:'단체 파티·기념행사', en:'CELEBRATION', desc:'장식·음식·프로그램을 함께 하는 모임. 반입·주류·소음·정리 조건을 먼저 확인합니다.' },
  { id:'popup',     label:'팝업·브랜드 행사',  en:'POP-UP',     desc:'설치와 운영이 필요한 행사. 반입 동선·전력·설치·철수 조건을 견적에 담습니다.' },
  { id:'shooting',  label:'촬영·콘텐츠',      en:'SHOOTING',   desc:'통제 가능한 촬영 환경. 자연광·소음·전력과 초상권 관리를 확인합니다.' }
];

window.MEGASPOT_REGIONS = [
  { id:'seoul-east',  label:'서울 동부권 (광진·성동·동대문)', active:true },
  { id:'seoul-north', label:'서울 북부권', active:false },
  { id:'seoul-south', label:'서울 남부권', active:false },
  { id:'seoul-west',  label:'서울 서부권', active:false },
  { id:'gyeonggi',    label:'경기·인천', active:false }
];

window.MEGASPOT_FEATURES = [
  { id:'screen',   label:'대형 화면·프로젝터' },
  { id:'sound',    label:'음향·무선마이크' },
  { id:'kitchen',  label:'싱크·냉장고 준비 공간' },
  { id:'parking',  label:'주차 가능' },
  { id:'elevator', label:'엘리베이터' },
  { id:'wifi',     label:'와이파이' },
  { id:'lounge',   label:'라운지·창가 좌석' },
  { id:'booth',    label:'진행부스' },
  { id:'stage',    label:'무대 설치 가능' },
  { id:'outdoor',  label:'야외 공간' }
];

window.MEGASPOT_THEMES = [
  { id:'industrial', label:'인더스트리얼' },
  { id:'bright',     label:'밝은 홀' },
  { id:'lounge',     label:'라운지형' },
  { id:'rooftop',    label:'루프탑·야외' },
  { id:'classic',    label:'클래식·연회장' }
];

window.MEGASPOT_SPACES = [
  {
    id: 'megaspot-gundae',
    slug: 'megaspot-gundae',
    name: '메가스팟 건대',
    nameEn: 'MEGASPOT GUNDAE',
    type: 'direct',
    typeLabel: '직영',
    status: 'open',
    tagline: '건대 한아름건물 2층을 통째로 쓰는 150평 개방형 홀',
    summary: '기둥 사이로 긴 테이블을 길게 놓아도 통로가 남는 넓은 홀에 200인치 스크린, 진행부스, 싱크·냉장고 준비 공간, 창가와 안쪽 라운지가 한 층에 이어져 있습니다. 발표와 교류를 한 공간에서 진행하는 50~130명 규모 행사에 맞춰 메가스팟이 직접 운영합니다.',
    address: '서울 광진구 화양동 10-1, 한아름건물 2층',
    addressShort: '광진구 화양동 10-1 · 한아름건물 2F',
    building: '한아름건물',
    floor: '2층',
    region: 'seoul-east',
    regionLabel: '서울 광진구',
    nearby: '건대입구역 인근 · 화양동',
    mapQuery: '서울 광진구 화양동 10-1',
    area: { pyeong: 150, m2: 496, note: '약 150평은 운영자 제공 기준이며 실제 행사 가능 면적은 배치 안내 시 함께 확인합니다.' },
    capacity: { max: 130, note: '최대 130명은 운영자 확인 기준입니다. 배치별 착석 인원은 행사 조건을 확인한 뒤 확정해 안내합니다.', recommended: '50~130명' },
    ceiling: { mm: 4300, note: '실측 도면 기준 바닥~천장 높이. 보·설비 아래 유효 높이는 별도 안내' },
    purposes: ['seminar','workshop','community','party','popup','shooting'],
    purposeFit: { seminar:'적합', workshop:'적합', community:'적합', party:'조건 확인', popup:'조건 확인', shooting:'조건 확인' },
    features: ['screen','sound','kitchen','parking','elevator','wifi','lounge','booth'],
    themes: ['industrial','lounge'],
    cover: 'p14',
    highlights: [
      { k:'약 150평', v:'개방형 홀', d:'기둥 4개 외에 시야를 막는 벽이 없는 한 층 통짜 공간' },
      { k:'최대 130명', v:'운영자 확인', d:'배치별 착석 인원은 행사 조건 확인 후 확정' },
      { k:'H 4.3m', v:'천장고', d:'노출 천장과 보, 콘크리트 기둥의 인더스트리얼 마감' },
      { k:'200인치', v:'스크린 + 레이저 프로젝터', d:'메인 홀을 향한 대형 화면, 연결 방법 현장 안내' },
      { k:'무선마이크', v:'스피커·앰프', d:'진행자가 있는 세미나·모임용 음향, 수량은 견적 시 안내' },
      { k:'준비 공간', v:'싱크 2곳·냉장고 2대', d:'전자레인지 2대, 잔·컵 비품 선반. 음식 반입 범위는 별도 안내' },
      { k:'엘리베이터·주차', v:'와이파이·화장실', d:'주차 대수·요금·등록 방법은 예약 시 안내' }
    ],
    photos: [
      { id:'p14', title:'메인 홀 전경',               cap:'스크린 앞으로 긴 테이블을 길게 놓은 메인 홀. 창을 따라 바 테이블이 이어집니다.', zone:'hall' },
      { id:'p01', title:'스크린 옆에서 본 메인 홀',    cap:'200인치 스크린 옆에서 좌석과 창가 방향을 바라본 모습입니다.', zone:'screen' },
      { id:'p13', title:'스크린과 행사 좌석',          cap:'스크린 앞 긴 테이블 배치. 사진의 현수막은 촬영 당시 행사물입니다.', zone:'screen' },
      { id:'p10', title:'샹들리에와 공간 중심',        cap:'로프 장식 샹들리에와 콘크리트 기둥, 낮은 벽돌 벽이 홀의 중심을 잡습니다.', zone:'hall' },
      { id:'p12', title:'연속창을 따라 이어지는 홀',    cap:'검정 창틀의 큰 창이 홀 한쪽 면을 따라 이어집니다.', zone:'windows' },
      { id:'p02', title:'메인 홀과 전신거울',          cap:'홀 안쪽 통로와 전신거울, 천장의 프로젝터가 보입니다.', zone:'hall' },
      { id:'p07', title:'진행부스 방향',               cap:'메인 홀에서 진행부스 쪽을 바라본 모습입니다.', zone:'booth' },
      { id:'p05', title:'창가 좌석과 메인 홀',          cap:'창가 바 테이블 좌석에서 홀 안쪽을 바라본 모습입니다.', zone:'windows' },
      { id:'p04', title:'창가 좌석',                   cap:'거리 풍경이 들어오는 창가 좌석 구역입니다.', zone:'windows' },
      { id:'p03', title:'창가 테이블',                 cap:'창을 따라 놓인 테이블과 의자. 교류형 행사에서 대화 자리로 씁니다.', zone:'windows' },
      { id:'p08', title:'긴 테이블과 좌석',             cap:'목재 상판의 긴 테이블과 검정 좌석 배치입니다.', zone:'hall' },
      { id:'p09', title:'조명과 테이블',               cap:'펜던트 조명 아래 테이블 배치. 조명 조작 범위는 현장에서 안내합니다.', zone:'hall' },
      { id:'p06', title:'행거와 메인 홀',               cap:'외투 보관용 행거가 있는 홀 가장자리입니다.', zone:'hall' },
      { id:'p11', title:'행사 소품과 보조 테이블',       cap:'룰렛과 접이식 보조 테이블. 소품의 고객 제공 여부는 견적에서 확인합니다.', zone:'hall' },
      { id:'p15', title:'벽돌 벽면의 라운지',           cap:'벽돌 벽과 간접조명, 벤치 좌석이 있는 라운지 구역입니다.', zone:'lounge' },
      { id:'p16', title:'라운지 다른 각도',             cap:'소형 테이블과 벤치가 있어 소규모 대화 자리로 쓰기 좋습니다.', zone:'lounge' },
      { id:'p17', title:'공간을 잇는 통로',             cap:'메인 홀과 안쪽 공간을 연결하는 통로와 보조 테이블입니다.', zone:'entrance' },
      { id:'p22', title:'200인치 스크린 (측면)',         cap:'레이저 프로젝터로 투사한 200인치 화면을 측면에서 본 모습입니다.', zone:'screen' },
      { id:'p23', title:'200인치 스크린 (정면)',         cap:'정면에서 본 투사 화면. 발표 자료와 영상 상영에 씁니다.', zone:'screen' },
      { id:'p21', title:'진행부스와 장비',               cap:'노트북·마우스와 행사 소품이 놓인 진행 카운터입니다.', zone:'booth' },
      { id:'p18', title:'싱크대와 준비 공간',            cap:'싱크·수전 2곳과 스테인리스 작업대가 있는 준비 공간입니다.', zone:'service' },
      { id:'p19', title:'냉장고 구역',                  cap:'냉장고 2대와 안내판 스탠드. 고객 사용 가능 공간은 예약 시 안내합니다.', zone:'service' },
      { id:'p20', title:'잔·컵 비품 선반',              cap:'와인잔·유리잔·컵류를 보관하는 비품 선반입니다. 제공 수량은 견적에서 확인합니다.', zone:'service' }
    ],
    // 3D 뷰어와 같은 좌표계(m). 평면도 SVG와 주요 지점 안내에 사용
    zones: [
      { id:'hall',     n:'01', label:'메인 홀',        en:'MAIN HALL',   desc:'기둥 4개 사이로 긴 테이블을 길게 놓는 개방형 홀. 발표·식사·교류를 한 자리에서 진행합니다.', photo:'p14' },
      { id:'screen',   n:'02', label:'200인치 스크린', en:'SCREEN',      desc:'메인 홀을 향한 대형 화면. 레이저 프로젝터로 투사하며 연결 방법은 현장에서 안내합니다.', photo:'p23' },
      { id:'booth',    n:'03', label:'진행부스',       en:'OPERATION',   desc:'행사 진행자와 장비가 자리하는 카운터. 노트북·음향 조작 위치입니다.', photo:'p21' },
      { id:'service',  n:'04', label:'싱크·냉장고',    en:'SERVICE',     desc:'스크린 뒤편 준비 공간. 싱크 2곳, 냉장고 2대, 전자레인지 2대와 비품 선반이 있습니다.', photo:'p18' },
      { id:'storage',  n:'05', label:'창고',           en:'STORAGE',     desc:'도면상 창고. 고객 보관·출입 가능 여부는 예약 시 확인합니다.', photo:'p19' },
      { id:'entrance', n:'06', label:'주출입구',       en:'ENTRANCE',    desc:'엘리베이터에서 홀로 이어지는 진입 동선. 반입 경로와 문 규격은 현장 확인 후 안내합니다.', photo:'p17' },
      { id:'windows',  n:'07', label:'창가 좌석',      en:'WINDOW SIDE', desc:'검정 프레임 연속창을 따라 놓인 바 테이블 좌석. 거리 풍경이 들어옵니다.', photo:'p04' },
      { id:'lounge',   n:'08', label:'라운지',         en:'LOUNGE',      desc:'벽돌 벽과 벤치 좌석의 라운지 구역. 접수·휴식·대화 자리로 분리해 쓸 수 있습니다.', photo:'p15' }
    ],
    layouts: [
      { id:'lecture',  label:'강연형',   en:'THEATER',  fit:'강연·세미나·발표회', desc:'스크린을 향해 좌석을 열로 배치합니다. 무대 폭과 통로를 확보하면 가장 많은 인원이 앉습니다.', check:'좌석 수·시야·마이크 수량·준비 시간', capacityNote:'행사 조건 확인 후 확정' },
      { id:'classroom',label:'책상형',   en:'CLASSROOM',fit:'워크숍·교육·기업 교류', desc:'긴 테이블을 스크린 방향으로 두고 팀별로 앉습니다. 필기와 노트북 사용, 팀 활동에 맞습니다.', check:'테이블 수·전원 위치·다과 동선', capacityNote:'행사 조건 확인 후 확정' },
      { id:'banquet',  label:'연회형',   en:'BANQUET',  fit:'단체 식사·기념행사·동문회', desc:'긴 테이블을 마주 보게 놓고 식사와 프로그램을 함께 진행합니다. 준비 공간과 가까운 쪽에 음식 동선을 둡니다.', check:'음식 반입 범위·정리 기준·소음', capacityNote:'행사 조건 확인 후 확정' },
      { id:'standing', label:'교류형',   en:'STANDING', fit:'네트워킹·파티·팝업', desc:'바 테이블과 라운지 좌석을 중심으로 서서 이동하며 대화하는 배치입니다. 활동 면적이 가장 넓습니다.', check:'음료 동선·연출 장비·철수 시간', capacityNote:'행사 조건 확인 후 확정' }
    ],
    hours: { note:'운영 시간과 판매 가능 시간대는 예약 상담 시 안내합니다. 하루 2개 행사 슬롯을 기본으로 운영하며, 장시간 행사와 설치형 행사는 별도로 견적합니다.' },
    booking: {
      unit: '기본 이용 시간 + 준비·철수 시간 + 옵션',
      slots: [
        { id:'am', label:'오전', time:'09:00–13:00' },
        { id:'pm', label:'오후', time:'14:00–18:00' },
        { id:'ev', label:'저녁', time:'19:00–23:00' },
        { id:'day', label:'종일', time:'협의' }
      ],
      flow: ['문의 접수','조건 확인','견적 발송','결제 대기','예약 확정','이용','이용 후기'],
      response: '영업시간 내 접수 문의는 2시간 이내 첫 답변, 조건이 갖춰진 문의는 1영업일 안에 견적을 드리는 것을 운영 목표로 합니다.'
    },
    pricing: {
      note: '요금은 요일·시간대·이용 범위·장비·인력에 따라 달라 견적으로 안내합니다. 인원이 많다는 이유만으로 요금을 더하지 않고, 늘어나는 비용과 제공 범위를 항목별로 설명합니다.',
      items: [
        { k:'공간 이용료', d:'기본 이용 시간 기준. 준비·철수 시간을 포함해 산정' },
        { k:'장비·비품', d:'기본 포함 장비와 선택 장비(연출 조명·스모그머신 등)를 구분' },
        { k:'인력·청소', d:'현장 담당자, 정리·청소 범위에 따라 산정' },
        { k:'초과 시간', d:'사전 합의한 단가로 안내. 임의 추가 요금 없음' },
        { k:'보증금', d:'이용료와 구분해 금액·반환 시점·공제 기준을 명시' },
        { k:'세금', d:'부가세 별도 여부를 견적서에 표기' }
      ]
    },
    rules: [
      { k:'준비·철수', d:'행사 앞뒤 준비와 철수 시간은 이용 시간에 포함해 예약합니다. 숨은 초과 요금을 만들지 않기 위해서입니다.' },
      { k:'음식·음료', d:'외부 음식 반입과 케이터링은 가능 범위를 견적 때 확인합니다. 조리 범위, 냉장고 사용 공간, 온수 사용은 현장에서 안내합니다.' },
      { k:'주류·소음', d:'주류 반입과 음향 사용 가능 음량은 행사 성격에 따라 사전에 합의합니다.' },
      { k:'연출 장비', d:'스모그머신·LED 효과 조명은 감지기·환기·현장 운영 조건을 확인한 뒤 사용 규칙에 따라 제공합니다.' },
      { k:'반입·설치', d:'설치물과 장비 반입은 엘리베이터 규격과 동선을 확인한 뒤 진행합니다. 팝업·촬영은 전력과 설치 조건을 별도 견적합니다.' },
      { k:'정리·원상복구', d:'퇴실 시 사용 시간·분실·파손·쓰레기·원상복구를 함께 확인합니다. 보증금은 일괄 몰수하지 않고 근거를 안내합니다.' },
      { k:'취소·변경', d:'취소·변경 정책은 견적서에 적용 버전을 명시합니다. 법정 청약철회와 계약상 취소 정책을 구분해 안내합니다.' }
    ],
    access: {
      transit: '지하철 2·7호선 건대입구역 인근. 역에서의 도보 소요 시간은 경로 기준으로 상담 시 안내합니다.',
      parking: '건물 주차 가능. 주차 가능 대수·요금·등록 방법은 예약 시 안내합니다.',
      elevator: '엘리베이터 이용 가능. 탑승 위치와 짐 반입 조건은 현장 안내',
      note: '화장실·와이파이 접속 정보는 이용 당일 현장에서 안내합니다.'
    },
    docs: {
      floorplanPdf: '/assets/docs/megaspot-gundae-floorplan-v01.pdf',
      floorplanImg: '/assets/docs/floorplan-dimensions.png',
      floorplanBasic: '/assets/docs/floorplan-basic.png',
      sketch: '/assets/docs/floorplan-hand-sketch.png',
      glb: '/spaces/megaspot-gundae/3d/MEGASPOT_2F.glb',
      viewer: '/spaces/megaspot-gundae/3d/'
    },
    operator: { label:'메가스팟 직영', contract:'메가스팟 운영사가 계약 상대방이며 현장 운영을 직접 맡습니다.' }
  }
];

window.MEGASPOT_GET_SPACE = function(id){ return window.MEGASPOT_SPACES.find(function(s){ return s.id===id || s.slug===id; }); };
