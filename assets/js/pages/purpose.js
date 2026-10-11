/* 어떤 모임 — 목적별 상세 (활용 장면 사진 포함) */
(function(){
  var M=window.MEGASPOT, $=M.$, esc=M.esc;
  var SC=window.MEGASPOT_SCENES||[];
  var detail={
    seminar:{ want:'참석자가 발표를 잘 보고 잘 듣는 행사', quote:['좌석 수와 배치(강연형·책상형)','스크린·프로젝터와 뒤쪽 좌석 시야','마이크 수량·노트북 연결','준비·리허설 시간'], note:'메가스팟 건대: 200인치 스크린과 레이저 프로젝터, 무선마이크·스피커·앰프를 갖추고 있습니다. 마이크 수량과 연결 방식은 견적에서 안내합니다.' },
    workshop:{ want:'팀별 토론과 활동이 끊기지 않고 이어지는 행사', quote:['팀 수와 테이블 배치','전원 위치와 멀티탭 제공 여부','진행 보드·교구 반입','다과 동선과 정리 기준'], note:'메가스팟 건대: 긴 우드 테이블을 팀 단위로 나눠 놓을 수 있고, 스크린 뒤편 준비 공간에서 다과 동선을 분리합니다.' },
    networking:{ want:'처음 만난 사람들이 자연스럽게 섞이는 교류 행사', quote:['접수 위치와 명찰·안내물','서서 대화하는 자리와 앉는 자리 비율','음료·다과 위치와 정리','종료 시각과 음향 크기'], note:'메가스팟 건대: 주출입구에서 메인 홀로 이어지는 통로에 접수 자리를 두고, 창가 쪽은 앉아서 대화하는 자리로 나눠 쓰기 좋습니다.' },
    community:{ want:'반복할수록 준비가 쉬워지는 모임', quote:['반복 주기와 기간','참석자 수 변화에 따른 테이블 조정','물품 보관 가능 여부','이전 행사 조건 불러오기'], note:'메가스팟 건대: 보드게임·독서 모임처럼 매번 인원이 달라지는 모임은 테이블 수만 조정하면 됩니다. 4회 이상 미리 예약하면 별도 할인을 안내하고, 횟수와 기간이 다른 반복 일정도 따로 협의합니다.', ask:'regular' },
    class:{ want:'모두가 같은 작업을 따라 하고 결과물을 가져가는 수업', quote:['작업 테이블 수와 한 사람당 작업 폭','물 사용과 재료 세척·정리','시연 화면 연결','재료 반입과 폐기물 처리'], note:'메가스팟 건대: 싱크 2곳이 있는 준비 공간이 메인 홀 바로 뒤에 있어 물을 쓰는 수업도 정리가 수월하고, 강사 시연은 200인치 스크린으로 함께 볼 수 있습니다.' },
    culture:{ want:'객석 어디서든 무대와 화면이 잘 보이고 잘 들리는 공연·상영', quote:['객석 배치와 무대 위치','음향 장비 연결과 사용 가능한 음량','상영 작품·음원의 공연권 확인','조명 조절과 종료 시각'], note:'메가스팟 건대: 천장고 4.3m의 트인 홀이라 스크린 앞을 작은 무대로 쓰기 좋습니다. 공연 음량과 종료 시각은 행사 성격에 따라 미리 합의합니다.' },
    party:{ want:'장식·음식·프로그램을 함께 하는 모임', quote:['음식·주류 반입 범위와 케이터링','장식·설치물과 철수 시간','소음 허용 범위와 종료 시각','청소·파손·보증금 기준'], note:'메가스팟 건대: 샹들리에와 벽돌 벽, 라운지가 있어 분위기를 살리기 좋고, 엘리베이터가 있어 어르신이 함께하는 가족 행사도 부담이 적습니다.' },
    popup:{ want:'판매와 전시, 관람 동선이 한 공간에서 정리되는 행사', quote:['반입 동선·엘리베이터 규격','부스 수와 전력 사용','설치·운영·철수 일정','외부 노출과 안내물 위치'], note:'메가스팟 건대: 창가와 벽면을 따라 부스를 두고 가운데를 관람 동선으로 비우는 배치가 가능합니다. 전력과 반입 조건을 확인한 뒤 별도 견적으로 진행합니다.' },
    shooting:{ want:'통제 가능한 촬영 환경', quote:['자연광 방향과 창 가림 가능 여부','소음·외부 간섭 차단','전력·장비 반입과 세팅 시간','초상권·공간 노출 범위'], note:'메가스팟 건대: 연속창으로 들어오는 자연광과 벽돌 라운지, 노출 천장 같은 인더스트리얼 배경을 쓸 수 있습니다. 촬영은 사전 답사를 권합니다.', photos:['p05','p12','p15','p16'] }
  };

  // 목적별 메가스팟 건대 요금 예시 — 요금 데이터(pricing-gundae.js)로 계산하므로 요금을 바꾸면 함께 바뀝니다
  var EX=(window.MEGASPOT_PRICING && window.MEGASPOT_PRICING['megaspot-gundae'] && window.MEGASPOT_PRICING['megaspot-gundae'].purposeExamples) || {};
  function priceHint(id){
    var E=window.MEGASPOT_PRICE; if(!E||!E.data()||!EX[id]) return '';
    var x=EX[id], q=E.quote({ date:x.date, start:x.start, end:x.end, people:x.people, purpose:id, regular:x.regular });
    var parts=[q.pkg ? q.pkg.label+' '+E.man(q.pkg.price) : '공간료 '+E.man(q.time.fee)]; if(q.peopleFee) parts.push('인원 추가 '+E.man(q.peopleFee));
    var url='/spaces/megaspot-gundae/pricing/#estimate';
    return '<div class="mt-3"><div class="kicker">메가스팟 건대 요금 예시</div><p class="mt-1 small" style="font-weight:600">'+esc(x.title)+' → <b style="color:var(--cobalt);font-size:16px">'+esc(E.man(q.total))+'</b> <span class="muted">('+esc(parts.join(' + '))+')</span></p><a class="tiny" style="color:var(--cobalt);font-weight:700" href="'+url+'">조건 바꿔서 예상 금액 계산하기 →</a></div>';
  }

  // 목적별 사진 목록: 활용 장면 → 없으면 공간 사진
  function photosOf(p){
    var list=SC.filter(function(s){ return s.purpose===p.id; }).map(function(s){ return { id:s.id, title:s.title, cap:s.cap }; });
    if(!list.length){
      var sp=window.MEGASPOT_GET_SPACE('megaspot-gundae'), byId={}; (sp?sp.photos:[]).forEach(function(ph){ byId[ph.id]=ph; });
      list=((detail[p.id]||{}).photos||[p.cover]).filter(Boolean).map(function(id){ var ph=byId[id]||{}; return { id:id, title:ph.title||'메가스팟 건대', cap:ph.cap||'' }; });
    }
    // 대표 사진(cover)을 맨 앞으로
    list.sort(function(a,b){ return (b.id===p.cover)-(a.id===p.cover); });
    return list;
  }
  function lbItems(list){ return list.map(function(x){ return { src:M.imgSrc(x.id), title:x.title, cap:x.cap, tag:M.imgTag(x.id) }; }); }

  var PUR=window.MEGASPOT_PURPOSES||[];
  var jump=$('#purpose-jump'); if(jump) jump.innerHTML=PUR.map(function(p){ return '<a href="#'+p.id+'">'+esc(p.label)+'</a>'; }).join('');

  var host=$('#purpose-detail'); if(!host) return;
  var cache={};
  host.innerHTML=PUR.map(function(p,i){
    var d=detail[p.id]||{}, list=photosOf(p); cache[p.id]=list;
    var main=list[0], rest=list.slice(1,4);
    var thumbs=rest.length? '<div class="thumbs-row">'+rest.map(function(x,k){ var more=(k===2 && list.length>4)?'<span class="more">+'+(list.length-4)+'</span>':''; return '<button type="button" data-p="'+p.id+'" data-i="'+(k+1)+'" aria-label="'+esc(x.title)+' 크게 보기"><img src="'+M.imgSrc(x.id,'t')+'" alt="'+esc(x.title)+' — '+M.imgTag(x.id)+'" loading="lazy">'+more+'</button>'; }).join('')+'</div>' : '';
    return '<article class="card" style="scroll-margin-top:140px" id="'+p.id+'">'
      + '<div class="grid grid-2" style="gap:28px;align-items:start">'
      + '<div><div class="eyebrow"><span class="idx">'+M.pad2(i+1)+'</span>'+esc(p.en)+'</div><h2 class="h-m mt-1"><a href="/purpose/'+p.id+'/" style="color:inherit">'+esc(p.label)+'</a></h2><p class="muted mt-2">'+esc(p.desc)+' <a href="/purpose/'+p.id+'/" style="color:var(--cobalt);font-weight:700;white-space:nowrap">안내 페이지 →</a></p>'
      + '<div class="mt-3"><div class="kicker">주최자가 원하는 결과</div><p class="mt-1" style="font-weight:600">'+esc(d.want||'')+'</p></div>'
      + '<div class="mt-3"><div class="kicker">견적에 적어야 할 조건</div><ul class="tags mt-1">'+(d.quote||[]).map(function(q){return '<li class="tag">'+esc(q)+'</li>';}).join('')+'</ul></div>'
      + '<div class="notice mt-3"><div>'+esc(d.note||'')+'</div></div>'
      + priceHint(p.id)
      + '<div class="row mt-3"><a class="btn btn-primary btn-sm" href="/inquiry/?purpose='+p.id+(d.ask?'&type='+d.ask:'')+'">'+(d.ask==='regular'?'반복 모임 상담':'이 목적으로 견적 문의')+'</a><a class="btn btn-light btn-sm" href="/spaces/?purpose='+p.id+'">공간 찾기</a>'+(SC.some(function(s){return s.purpose===p.id;})?'<a class="btn btn-light btn-sm" href="/spaces/megaspot-gundae/?scene='+list[0].id+'#scenes">빈 홀과 비교</a>':'')+'</div></div>'
      + '<div><button type="button" class="photo-btn" data-p="'+p.id+'" data-i="0" aria-label="'+esc(main.title)+' 크게 보기"><img src="'+M.imgSrc(main.id,'m')+'" alt="'+esc(p.label)+' — '+esc(main.title)+'" loading="lazy">'+M.tagHtml(main.id)+'<span class="cap"><b style="display:block;font-size:15px">'+esc(main.title)+'</b>메가스팟 건대</span></button>'+thumbs+'</div>'
      + '</div></article>';
  }).join('');
  host.addEventListener('click', function(e){ var b=e.target.closest('[data-p][data-i]'); if(!b) return; M.openLightbox(lbItems(cache[b.dataset.p]), +b.dataset.i); });
  var note=$('#purpose-note'); if(note) note.textContent=window.MEGASPOT_SCENE_NOTE||'';
})();
