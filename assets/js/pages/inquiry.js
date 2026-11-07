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
  var SPACES=(window.MEGASPOT_PRICING||{}); var space=SPACES[q.get('space')] ? q.get('space') : (M.eventPlan&&SPACES[M.eventPlan.space()]?M.eventPlan.space():'megaspot-gundae');
  var sw=$('#space-switch'), est=$('#estimator');
  function markSpace(id){ if(!sw) return; sw.querySelectorAll('[data-space]').forEach(function(b){ var on=b.dataset.space===id; b.setAttribute('aria-selected',String(on)); b.classList.toggle('on',on); }); var hid=document.querySelector('#inquiry-form [name=space_id]'); if(hid && hid.value!=='request'){hid.value=id;hid.dispatchEvent(new Event('change',{bubbles:true}));} }
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
  document.addEventListener('megaspot:calendar-selection',function(e){
    var c=e.detail;if(!c||!SPACES[c.space])return;
    if(c.space!==space){space=c.space;markSpace(space);if(M.pricing&&M.pricing.rerender){var fresh=M.pricing.rerender(est,space);if(fresh)est=fresh;}}
    var unknown=est&&est.querySelector('[name=event_date_unknown]');if(unknown&&unknown.checked){unknown.checked=false;unknown.dispatchEvent(new Event('change',{bubbles:true}));}
    if(M.pricing&&M.pricing.estimator)M.pricing.estimator.set(c);
    var u=new URL(location.href);u.searchParams.set('space',space);u.searchParams.set('date',c.date);u.searchParams.set('start',c.start);u.searchParams.set('end',c.end);u.searchParams.delete('pkg');history.replaceState(null,'',u.pathname+u.search+u.hash);
    M.toast('선택한 공간·날짜·시간을 신청서에 반영했습니다.');
  });
  var root=$('#inquiry-root');
  if(root && M.renderInquiry){
    M.renderInquiry(root,{ spaceId: mode==='request'?'request':space, mode:mode, type:type, prefill:{ purpose:q.get('purpose')||'', people:q.get('people')||'', region:q.get('region')||'', date:q.get('date')||'' } });
    var reception=q.get('reception'),receptionCalc=window.MEGASPOT_RECEPTION_CALC;
    if(reception&&receptionCalc){
      var active=receptionCalc.isActive(reception)?reception:'cf-custom',fmt=q.get('reception_format')||'';if(fmt==='lunchbox')fmt='sandwichbox';
      var raw={course:active,people:q.get('reception_people')||q.get('people')||null,format:fmt,menu_ids:(q.get('reception_menus')||'').split(',').filter(Boolean),budget_per_person:q.get('reception_budget')||null,request_note:q.get('reception_note')||''};
      var selected=receptionCalc.selection(raw);if(!selected)selected=receptionCalc.selection({course:'cf-custom',people:null,format:''});
      M.receptionSelection=selected;var receptionMessage=receptionCalc.requestText(selected);M.receptionMessage=receptionMessage;
      var rm=document.querySelector('#iq-msg');if(rm&&!rm.value)rm.value=receptionMessage;
      document.querySelectorAll('[name=rv_message]').forEach(function(el){if(!el.value)el.value=receptionMessage;});
      var rt=document.querySelector('#iq-title');if(rt)rt.textContent='출장 케이터링 상담';
      var rs=document.querySelector('#iq-sub');if(rs)rs.textContent='희망 구성·제공 방식·메뉴·인원·예산을 함께 안내해 주세요. 최종 메뉴와 금액은 상담 후 확정합니다.';
    }
    var cocktail=q.get('cocktail');
    if(['100','200','300','400'].indexOf(cocktail)>=0){
      var msg=document.querySelector('#iq-msg');
      if(msg) msg.value='출장 칵테일 '+cocktail+'잔 패키지를 상담받고 싶습니다. 행사 날짜·장소와 희망 메뉴를 함께 안내해 주세요.';
      var title=document.querySelector('#iq-title'); if(title) title.textContent='출장 칵테일 상담';
      var sub=document.querySelector('#iq-sub'); if(sub) sub.textContent='날짜, 장소, 잔 수와 선호하는 메뉴를 알려 주세요.';

    }
    var grid=$('#inq-grid'); var mq=window.matchMedia('(min-width:960px)'); function lay(e){ grid.style.gridTemplateColumns=e.matches?'1.4fr .7fr':'1fr'; } lay(mq); mq.addEventListener('change',lay);
  }
  if(mode!=='request'&&type==='event'){var extra=$('#other');if(extra) extra.hidden=true;}
  if(q.has('catering')||q.has('reception')||q.has('cocktail')||q.has('visit')) setTimeout(function(){var target=document.querySelector(q.has('visit')?'.plan-visit':'.plan-services');if(target)target.scrollIntoView({block:'start',behavior:'smooth'});},200);
  var HEAD={
    request:['조건에 맞는 공간을<br>찾아 드립니다','원하는 날짜·인원·지역에 맞는 공간이 아직 목록에 없다면 아래 간단 문의에 조건을 남겨 주세요. 확인 가능한 공간을 찾아 연락드립니다.'],
    regular:['정기·반복 모임<br>상담 신청','매주·격주·매월 여는 모임이라면 아래 간단 문의에 반복 주기와 기간을 알려 주세요. 4회 이상 미리 예약하면 별도 할인을 안내합니다.'],
    partner:['제휴·협력·파트너<br>제안','행사 기획·대행사, 케이터링·장비·인력 협력사, 브랜드·기관 제휴처럼 함께 일할 방법이 있다면 아래 간단 문의로 알려 주세요. 요금표와 별도로 조건을 협의합니다.']
  };
  var h=HEAD[mode==='request'?'request':type];
  if(h){ $('#inq-title').innerHTML=h[0]; $('#inq-lead').textContent=h[1]; var other=$('#other'); if(other) setTimeout(function(){ other.scrollIntoView({behavior:'smooth',block:'start'}); }, 150); }
})();
