// =====================================================================
//  메가스팟 건대 · 활용 장면 데이터
//  - 사진을 바꿀 때는 같은 id의 파일(s01.jpg 등)을 교체하면 됩니다.
//  - 이미지 위치: /assets/img/scenes/ (원본 1440px), m/ (960px), t/ (480px)
//  - view: 같은 각도에서 찍은 빈 홀 사진과 비교할 때 쓰는 '자리'
//  - purpose: 문의서 '행사 목적'과 연결 (spaces.js의 MEGASPOT_PURPOSES id)
//  - layout: 문의서 '배치 형태'와 연결 (lecture | classroom | banquet | standing)
// =====================================================================

window.MEGASPOT_SCENE_NOTE = '';

window.MEGASPOT_SCENE_VIEWS = [
  { id:'screen',     label:'스크린 정면',   real:'p13', desc:'가운데 통로 끝으로 200인치 스크린이 보이는 자리입니다. 강연이나 상영처럼 모두가 한 방향을 보는 행사가 여기서 펼쳐집니다.' },
  { id:'side',       label:'기둥 쪽 객석',  real:'p14', desc:'기둥과 벽돌 장식벽 너머로 스크린을 비스듬히 바라보는 자리입니다. 공연, 토크, 게임처럼 무대와 객석이 함께 움직이는 행사에 어울립니다.' },
  { id:'mirror',     label:'거울 벽 쪽',    real:'p02', desc:'물결 모양 전신거울과 긴 벽면이 보이는 홀 안쪽입니다. 테이블을 팀별로 나누면 워크숍 자리가 되고, 한 줄로 이으면 식사 자리가 됩니다.' },
  { id:'window',     label:'연속창 쪽',     real:'p11', desc:'검정 프레임 연속창을 따라 거리 풍경이 들어오는 쪽입니다. 서서 움직이는 리셉션이나 부스를 세우는 마켓처럼 바닥이 넓게 필요한 행사에 씁니다.' },
  { id:'chandelier', label:'샹들리에 아래', real:'p09', desc:'로프 샹들리에 아래로 긴 테이블이 이어지는 자리입니다. 스크린이 한쪽에 있어 시연을 보며 따라 하는 클래스에 잘 맞습니다.' },
  { id:'brick',      label:'벽돌 라운지',   real:'p15', desc:'벽돌 벽과 펜던트 조명이 있는 안쪽 라운지입니다. 소그룹으로 나눠 앉는 토론이나 멘토링 자리로 쓰기 좋습니다.' }
];

window.MEGASPOT_SCENES = [
  // 강연·세미나
  { id:'s01', purpose:'seminar',    view:'screen',     layout:'lecture',   staged:false, title:'지식 세미나',          cap:'의자만 스크린 쪽으로 줄지어 놓은 강연형 배치입니다. 가운데 통로를 비워 두면 뒷자리에서도 발표 화면이 가리지 않습니다.', src:'도시와 혁신을 잇는 지식 세미나-1.png' },
  { id:'s09', purpose:'seminar',    view:'screen',     layout:'classroom', staged:false, title:'전문가 강연',          cap:'긴 테이블을 스크린 방향으로 놓은 책상형 배치입니다. 노트북과 자료를 펼쳐 두고 듣는 강연이나 사내 교육에 맞습니다.', src:'메가스팟 전문가 강연 현장-2.png' },
  { id:'s20', purpose:'seminar',    view:'side',       layout:'lecture',   staged:false, title:'패널 토크와 질의응답', cap:'스크린 앞에 패널 자리를 마련하고, 객석에서 바로 마이크를 받아 질문하는 토크 형식입니다.', src:'산업 공간의 패널 토론과 관객 질의응답-3.png' },
  // 워크숍·팀빌딩
  { id:'s05', purpose:'workshop',   view:'mirror',     layout:'classroom', staged:false, title:'기업 전략 워크숍',     cap:'팀마다 테이블 하나씩 나눠 앉아 토론하는 워크숍입니다. 테이블 사이 간격이 넉넉해 진행자가 팀 사이를 오가며 이끌기 편합니다.', src:'메가스팟 기업 전략 워크숍-1.png' },
  { id:'s18', purpose:'workshop',   view:'mirror',     layout:'classroom', staged:false, title:'팀 워크숍',            cap:'포스트잇과 노트북을 펼쳐 놓고 아이디어를 모으는 팀 워크숍입니다. 팀별 결과는 보드에 모아 붙이고 전체 공유로 이어 갑니다.', src:'산업 공간에서 펼쳐진 팀 워크숍-2.png' },
  { id:'s21', purpose:'workshop',   view:'side',       layout:'classroom', staged:false, title:'팀 대항 퀴즈',         cap:'스크린에 문제를 띄우고 팀별로 답판을 드는 팀빌딩 프로그램입니다. 화면이 커서 뒤쪽 테이블에서도 문제를 함께 볼 수 있습니다.', src:'산업풍 공간의 활기찬 팀워크 퀴즈-12.png' },
  // 네트워킹·리셉션
  { id:'s04', purpose:'networking', view:'window',     layout:'standing',  staged:false, title:'글로벌 네트워킹',      cap:'입구 쪽에 접수 테이블을 두고, 홀 앞쪽은 서서 대화하는 자리로, 창가 쪽은 앉아서 이야기하는 자리로 나눈 네트워킹 행사입니다.', src:'메가스팟 글로벌 네트워킹 공간-3.png' },
  { id:'s14', purpose:'networking', view:'window',     layout:'standing',  staged:false, title:'저녁 리셉션',          cap:'테이블을 대부분 비우고 스탠딩 테이블 몇 개만 둔 리셉션입니다. 해 질 무렵에는 연속창 너머 거리 불빛이 실내 조명과 어우러집니다.', src:'블루 아워 오픈 플로어 리셉션-4.png' },
  { id:'s06', purpose:'networking', view:'window',     layout:'banquet',   staged:false, title:'동문 연말 모임',       cap:'한 해를 마무리하는 동문 모임입니다. 식사 테이블을 창가 쪽으로 길게 잇고, 앞쪽 빈자리에서 인사말과 경품 추첨을 진행합니다.', src:'메가스팟 동문 연말 교류 모임-8.png' },
  // 커뮤니티 정기 모임
  { id:'s13', purpose:'community',  view:'side',       layout:'',          staged:false, title:'보드게임 나이트',      cap:'테이블마다 다른 게임을 펼쳐 두고 자유롭게 자리를 옮기는 보드게임 모임입니다. 스크린에 진행 순서나 규칙을 띄워 두면 처음 온 사람도 금방 어울립니다.', src:'보드게임 취미 모임 공간-4.png' },
  { id:'s23', purpose:'community',  view:'mirror',     layout:'',          staged:false, title:'보드게임 정기 모임',   cap:'네 명씩 테이블을 나눠 앉는 정기 모임입니다. 참석 인원이 매번 달라도 테이블 수만 조정하면 되어 반복 모임을 꾸리기 편합니다.', src:'정돈된 벽면의 보드게임 모임-13.png' },
  { id:'s12', purpose:'community',  view:'brick',      layout:'',          staged:false, title:'독서 토론 모임',       cap:'벽돌 벽과 펜던트 조명이 있는 안쪽 라운지에서 소그룹으로 나눠 앉은 독서 모임입니다. 메인 홀과 이어져 있어 큰 행사 중간에 분과 토론 자리로 써도 좋습니다.', src:'벽돌 라운지의 독서 토론 모임-6.png' },
  // 원데이 클래스·멘토링
  { id:'s11', purpose:'class',      view:'chandelier', layout:'classroom', staged:false, title:'플라워 원데이 클래스', cap:'긴 테이블에 꽃과 재료를 펼쳐 두고 강사의 시연을 스크린으로 함께 보는 수업입니다. 싱크가 있는 준비 공간이 가까워 물을 쓰는 클래스도 정리가 수월합니다.', src:'메가스팟 플라워 원데이 클래스-5.png' },
  { id:'s15', purpose:'class',      view:'chandelier', layout:'classroom', staged:false, title:'보태니컬 수채화 클래스', cap:'테이블마다 이젤과 물감을 두고 스크린에 띄운 시범 그림을 따라 그리는 수업입니다. 샹들리에 아래로 테이블이 길게 이어져 수강생이 많아도 한 공간에서 진행할 수 있습니다.', src:'산업 공간 속 보태니컬 수채화 클래스-5.png' },
  { id:'s10', purpose:'class',      view:'brick',      layout:'',          staged:false, title:'커리어 멘토링',        cap:'멘토 한 명과 참가자 서너 명이 한 테이블에 둘러앉는 소그룹 멘토링입니다. 라운지 테이블을 그룹 수에 맞춰 나눠 쓰면 됩니다.', src:'메가스팟 청년 커리어 멘토링-10.png' },
  // 공연·상영회
  { id:'s07', purpose:'culture',    view:'side',       layout:'',          staged:false, title:'어쿠스틱 공연',        cap:'스크린 앞을 작은 무대로 쓰고 객석 테이블마다 촛불을 켠 어쿠스틱 공연입니다. 공연 제목이나 곡 정보는 스크린에 띄워 둡니다.', src:'메가스팟 어쿠스틱 공연 현장-7.png' },
  { id:'s17', purpose:'culture',    view:'side',       layout:'',          staged:false, title:'어쿠스틱 트리오 라이브', cap:'보컬과 기타, 콘트라베이스가 함께 서는 저녁 라이브입니다. 객석을 테이블 좌석으로 꾸리면 식사와 공연을 함께 즐기는 자리가 됩니다.', src:'산업 공간 속 어쿠스틱 라이브-10.png' },
  { id:'s08', purpose:'culture',    view:'screen',     layout:'classroom', staged:false, title:'영화 감상 모임',       cap:'200인치 스크린을 정면에 두고 긴 테이블에 나눠 앉는 감상 모임입니다. 상영이 끝나면 자리를 옮기지 않고 바로 이야기를 나눌 수 있습니다.', src:'메가스팟 영화감상 모임-6.png' },
  { id:'s19', purpose:'culture',    view:'screen',     layout:'classroom', staged:false, title:'저녁 상영회',          cap:'조명을 낮추고 가운데 통로를 비워 둔 상영회입니다. 테이블에 간식과 음료를 올려 두고 편하게 보는 분위기를 만들 수 있습니다.', src:'산업 공간의 저녁 영화 상영-9.png' },
  // 단체 파티·기념행사
  { id:'s02', purpose:'party',      view:'mirror',     layout:'banquet',   staged:false, title:'가족 기념 만찬',       cap:'긴 테이블 하나에 온 가족이 마주 앉는 연회형 배치입니다. 테이블 바깥으로 여유 공간이 넉넉해 인사말과 단체 사진 찍기가 편합니다.', src:'따뜻한 가족 기념연 만찬-11.png' },
  { id:'s22', purpose:'party',      view:'mirror',     layout:'banquet',   staged:false, title:'가족 생일 파티',       cap:'풍선과 가랜드로 벽면을 꾸미고 케이크를 가운데 둔 생일 파티입니다. 엘리베이터로 오르내릴 수 있어 어르신과 아이가 함께하는 가족 행사도 부담이 적습니다.', src:'세대가 모인 가족 생일 파티-9.png' },
  // 팝업·마켓·전시
  { id:'s16', purpose:'popup',      view:'window',     layout:'standing',  staged:false, title:'수공예 전시 마켓',     cap:'창가와 벽면을 따라 판매 테이블과 전시 이젤을 두고 가운데를 관람 동선으로 비운 마켓입니다. 부스 수와 전력 사용은 견적 때 함께 확인합니다.', src:'산업 공간 속 수공예 전시 마켓-7.png' }
];

window.MEGASPOT_SCENE = function(id){ return (window.MEGASPOT_SCENES||[]).find(function(s){ return s.id===id; }); };
window.MEGASPOT_SCENE_SRC = function(id, size){ return '/assets/img/scenes/'+(size?size+'/':'')+id+'.jpg'; };
