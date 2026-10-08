/* 어떤 모임 — 목적별 상세 */
(function(){
  var M=window.MEGASPOT, esc=M.esc;
  var detail={
    seminar:{ want:'참석자가 발표를 잘 보고 잘 듣는 행사', quote:['좌석 수와 배치(강연형)','스크린·프로젝터와 뒤쪽 좌석 시야','마이크 수량·연결 지원','준비·리허설 시간'], photo:'p23', note:'메가스팟 건대: 200인치 스크린과 레이저 프로젝터, 무선마이크·스피커·앰프 구비. 수량과 연결 방식은 견적에서 안내합니다.' },
    workshop:{ want:'발표 뒤 대화와 팀 활동이 자연스럽게 이어지는 행사', quote:['책상형 배치와 팀 수','전원 위치와 멀티탭 제공 여부','진행 장비·화이트보드 등 반입','다과 동선과 정리 기준'], photo:'p08', note:'메가스팟 건대: 긴 우드 테이블을 팀 단위로 재배치할 수 있고, 스크린 뒤편 준비 공간에서 다과 동선을 분리합니다.' },
    community:{ want:'반복할수록 준비가 쉬워지는 모임', quote:['일정 우선 협의와 반복 견적','참석자 수 변화에 따른 배치 조정','물품 보관 가능 여부','이전 행사 조건 불러오기'], photo:'p14', note:'메가스팟 건대: 정기 모임은 이전 조건을 저장해 두고 변경사항만 확인하는 방식으로 진행합니다.' },
    party:{ want:'장식·음식·프로그램을 함께 하는 모임', quote:['음식·주류 반입 범위와 케이터링','장식·설치물과 철수 시간','소음 허용 범위와 종료 시각','청소·파손·보증금 기준'], photo:'p10', note:'메가스팟 건대: 샹들리에와 벽돌 벽, 라운지가 있어 분위기를 살리기 좋습니다. 연출 장비 사용 조건은 사전에 확인합니다.' },
    popup:{ want:'설치와 운영이 가능한 공간 활용', quote:['반입 동선·엘리베이터 규격','전력 용량과 콘센트 위치','설치·운영·철수 일정','외부 노출과 간판 가능 여부'], photo:'p12', note:'메가스팟 건대: 현장 적합성(전력·반입·외부 노출)을 확인한 뒤 별도 견적으로 진행합니다.' },
    shooting:{ want:'통제 가능한 촬영 환경', quote:['자연광 방향과 창 가림 가능 여부','소음·외부 간섭 차단','전력·장비 반입과 세팅 시간','초상권·공간 노출 범위'], photo:'p05', note:'메가스팟 건대: 연속창의 자연광과 인더스트리얼 배경을 쓸 수 있습니다. 촬영 조건은 사전 답사를 권합니다.' }
  };
  var host=M.$('#purpose-detail'); if(!host) return;
  host.innerHTML=(window.MEGASPOT_PURPOSES||[]).map(function(p,i){
    var d=detail[p.id]||{};
    return '<article class="card" style="display:grid;gap:20px;grid-template-columns:1fr" id="'+p.id+'">'
      + '<div class="grid grid-2" style="gap:24px;align-items:center">'
      + '<div><div class="eyebrow"><span class="idx">'+M.pad2(i+1)+'</span>'+esc(p.en)+'</div><h2 class="h-m mt-1">'+esc(p.label)+'</h2><p class="muted mt-2">'+esc(p.desc)+'</p>'
      + '<div class="mt-3"><div class="kicker">주최자가 원하는 결과</div><p class="mt-1" style="font-weight:600">'+esc(d.want||'')+'</p></div>'
      + '<div class="mt-3"><div class="kicker">견적에 적어야 할 조건</div><ul class="tags mt-1">'+(d.quote||[]).map(function(q){return '<li class="tag">'+esc(q)+'</li>';}).join('')+'</ul></div>'
      + '<div class="notice mt-3"><div>'+esc(d.note||'')+'</div></div>'
      + '<div class="row mt-3"><a class="btn btn-primary btn-sm" href="/inquiry/?purpose='+p.id+'">이 목적으로 견적 문의</a><a class="btn btn-light btn-sm" href="/spaces/?purpose='+p.id+'">공간 찾기</a></div></div>'
      + '<div class="photo-frame" style="aspect-ratio:4/3"><img src="'+M.photoSrc('megaspot-gundae', d.photo||'p14')+'" alt="'+esc(p.label)+' 참고 사진 — 메가스팟 건대" loading="lazy"><div class="cap">메가스팟 건대 현장 사진</div></div>'
      + '</div></article>';
  }).join('');
})();
