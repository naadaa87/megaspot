/* 예약 신청 · 금액 확인 페이지
   - 위쪽: 계산기 + 예약 신청(pricing-ui.js 가 [data-price=estimator] 를 그립니다)
     ?date= ?start= ?end= ?pkg=day|allday|allnight ?people= ?purpose= ?reserve=1 로 값을 미리 넣을 수 있습니다.
   - 아래쪽: 정기·반복 모임 / 제휴·협력 / 조건에 맞는 공간 찾기 간단 문의 (?type=regular|partner, ?mode=request 로 열면 그쪽으로 이동) */
(function(){
  var M=window.MEGASPOT, $=M.$;
  var q=new URLSearchParams(location.search);
  var mode=q.get('mode')==='request'?'request':'space';
  var type=['event','regular','partner'].indexOf(q.get('type'))>=0 ? q.get('type') : 'event';
  // 공간 선택: ?space=megaspot-gundae-2 로 열면 2호 계산기부터 보여 줍니다 (pricing-ui.js 가 data-space-query 자리를 보고 고릅니다)
  var SPACES=(window.MEGASPOT_PRICING||{}); var space=SPACES[q.get('space')] ? q.get('space') : 'megaspot-gundae';
  var sw=$('#space-switch'), est=$('#estimator');
  function markSpace(id){ if(!sw) return; sw.querySelectorAll('[data-space]').forEach(function(b){ var on=b.dataset.space===id; b.setAttribute('aria-selected',String(on)); b.classList.toggle('on',on); }); var hid=document.querySelector('#inquiry-form [name=space_id]'); if(hid && hid.value!=='request') hid.value=id; }
  markSpace(space);
  if(sw && est){
    sw.addEventListener('click', function(e){
      var b=e.target.closest('[data-space]'); if(!b || b.dataset.space===space) return;
      space=b.dataset.space; markSpace(space);
      if(M.pricing && M.pricing.rerender){ var fresh=M.pricing.rerender(est, space); if(fresh) est=fresh; }
      var u=new URL(location.href); u.searchParams.set('space', space); history.replaceState(null,'',u.pathname+u.search+u.hash);
      var d=SPACES[space]||{}; M.toast((d.spaceName||'')+' 요금표로 다시 계산합니다.'+(d.opening&&d.opening>new Date().toISOString().slice(0,10)?' 오픈일('+d.opening.replace(/-/g,'. ')+') 이후 날짜로 잡아 주세요.':''));
    });
  }
  var root=$('#inquiry-root');
  if(root && M.renderInquiry){
    M.renderInquiry(root,{ spaceId: mode==='request'?'request':space, mode:mode, type:type, prefill:{ purpose:q.get('purpose')||'', people:q.get('people')||'', region:q.get('region')||'', date:q.get('date')||'' } });
    var grid=$('#inq-grid'); var mq=window.matchMedia('(min-width:960px)'); function lay(e){ grid.style.gridTemplateColumns=e.matches?'1.4fr .7fr':'1fr'; } lay(mq); mq.addEventListener('change',lay);
  }
  var HEAD={
    request:['조건에 맞는 공간을<br>찾아 드립니다','원하는 날짜·인원·지역에 맞는 공간이 아직 목록에 없다면 아래 간단 문의에 조건을 남겨 주세요. 확인 가능한 공간을 찾아 연락드립니다.'],
    regular:['정기·반복 모임<br>상담 신청','매주·격주·매월 여는 모임이라면 아래 간단 문의에 반복 주기와 기간을 알려 주세요. 4회 이상 미리 예약하면 별도 할인을 안내합니다.'],
    partner:['제휴·협력·파트너<br>제안','행사 기획·대행사, 케이터링·장비·인력 협력사, 브랜드·기관 제휴처럼 함께 일할 방법이 있다면 아래 간단 문의로 알려 주세요. 요금표와 별도로 조건을 협의합니다.']
  };
  var h=HEAD[mode==='request'?'request':type];
  if(h){ $('#inq-title').innerHTML=h[0]; $('#inq-lead').textContent=h[1]; var other=$('#other'); if(other) setTimeout(function(){ other.scrollIntoView({behavior:'smooth',block:'start'}); }, 150); }
})();
