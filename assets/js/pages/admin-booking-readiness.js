(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT,view=document.querySelector('#view-booking-readiness');if(!X||!M||!view)return;
  var $=function(s){return view.querySelector(s);},esc=M.esc,filter='attention',page=0,sequence=0,result=null;
  var labels={confirmed:'예약 확정',completed:'이용 완료',cancelled:'취소',payment_review:'일정 확인 필요'};
  view.innerHTML='<header class="adm-head"><div><h1>미안내·미발급 예약</h1><p class="small muted">예약별 안내 발송·확정서·통합 링크 준비 상태를 한곳에서 확인합니다.</p></div><button type="button" class="btn btn-light btn-sm" id="br-reload">새로고침</button></header>'
    +'<p class="br-note">이 목록 조회로 발송·발급·링크 생성·설정 변경을 하지 않습니다. 통합 링크의 준비 완료는 고객 전달 완료와 별개입니다.</p>'
    +'<form class="adm-card br-filters" id="br-form"><label>시작일<input class="input" type="date" id="br-from" required></label><label>종료일<input class="input" type="date" id="br-to" required></label>'
    +'<label>공간<select class="select" id="br-space"><option value="">전체 공간</option><option value="megaspot-gundae">건대 1호</option><option value="megaspot-gundae-2">건대 2호</option></select></label>'
    +'<label>예약 상태<select class="select" id="br-scope"><option value="active">확정·일정 확인 필요</option><option value="confirmed">예약 확정</option><option value="payment_review">일정 확인 필요</option><option value="completed">이용 완료</option><option value="cancelled">취소</option><option value="all">전체 상태</option></select></label>'
    +'<label class="br-search">예약 검색<input class="input" id="br-q" maxlength="60" placeholder="예약번호·문의번호·이름·연락처"></label><button class="btn btn-primary btn-sm" type="submit">조회</button></form>'
    +'<div class="br-summary" id="br-summary" aria-label="조회 기간 내 처리 현황"></div><div class="br-tabs" role="group" aria-label="미완료 항목 필터">'
    +[['attention','미완료 전체'],['guide','미안내'],['confirmation','미발급·재발급'],['portal','통합 링크 미준비'],['blocked','예약 처리 보류'],['ready','세 항목 완료'],['all','전체']].map(function(v){return '<button class="btn btn-light btn-sm" type="button" data-br-filter="'+v[0]+'" aria-pressed="'+(v[0]===filter)+'">'+v[1]+'</button>';}).join('')+'</div>'
    +'<p id="br-error" class="form-note" role="alert" hidden></p><p id="br-status" class="small muted" role="status" aria-live="polite"></p><div id="br-list" class="adm-card br-list" aria-busy="false"></div>'
    +'<div class="br-pager"><button class="btn btn-light btn-sm" id="br-prev" type="button" disabled>이전</button><span id="br-page" class="small"></span><button class="btn btn-light btn-sm" id="br-next" type="button" disabled>다음</button></div>';
  function day(offset){return new Date(Date.now()+9*3600000+offset*86400000).toISOString().slice(0,10);}
  $('#br-from').value=day(-1);$('#br-to').value=day(365);
  function time(h){return h==null?'미정':(h>=24?'다음 날 ':'')+String(Math.floor(h%24)).padStart(2,'0')+':'+String(Math.round((h%1)*60)).padStart(2,'0');}
  function stageCell(it,key,title){var s=it[key],action='';
    if(s.can_open){
      if(key==='guide')action='<button type="button" class="btn btn-light btn-xs" data-br-guide="'+esc(it.booking_code)+'">안내 이력 확인</button>';
      if(key==='confirmation')action='<button type="button" class="btn btn-light btn-xs" data-cdoc="'+esc(it.booking_code)+'">'+(s.complete?'확정서 확인':'확정서 발급 화면')+'</button>';
      if(key==='portal')action='<button type="button" class="btn btn-light btn-xs" data-portal-code="'+esc(it.booking_code)+'">통합 링크 준비 화면</button>';
    }
    return '<td data-label="'+title+'"><span class="br-badge '+(s.complete?'br-good':s.status==='blocked'?'br-muted':'br-pending')+'">'+esc(s.label)+'</span>'+(s.reason?'<p class="br-reason">'+esc(s.reason)+'</p>':'')+action+'</td>';
  }
  function draw(r){
    var s=r.summary;$('#br-summary').innerHTML=[['조회 예약',s.total],['미완료',s.attention],['미안내',s.guide],['미발급·재발급',s.confirmation],['링크 미준비',s.portal]].map(function(v){return '<div><small>'+v[0]+'</small><strong>'+v[1]+'<em>건</em></strong></div>';}).join('');
    $('#br-status').textContent='선택한 기간·예약 상태·검색 조건에서 '+r.total+'건 · 통합 링크는 준비 여부만 표시합니다.';
    $('#br-page').textContent=r.total?(r.page+1)+' / '+Math.ceil(r.total/r.page_size)+' 페이지':'0건';$('#br-prev').disabled=!page;$('#br-next').disabled=!r.has_more;
    $('#br-list').innerHTML=r.items.length?'<table class="br-table"><thead><tr><th scope="col">예약</th><th scope="col">이용 안내</th><th scope="col">예약확정서</th><th scope="col">통합 링크</th></tr></thead><tbody>'+r.items.map(function(it){return '<tr><td data-label="예약"><strong>'+esc(it.name)+'</strong><span class="br-booking-status">'+esc(labels[it.status]||it.status)+'</span><p>'+(it.space_id==='megaspot-gundae-2'?'건대 2호':'건대 1호')+' · '+esc(it.date)+'<br>'+esc(time(it.start_h)+'–'+time(it.end_h))+'</p><small>'+esc(it.booking_code)+(it.inquiry_ref?'<br>문의 '+esc(it.inquiry_ref):'')+'<br>'+esc(it.phone)+'</small>'+(it.blocked?'<p class="br-reason">예약 상태를 먼저 확인해 주세요.</p><button type="button" class="btn btn-light btn-xs" data-go="bookings">예약 목록 확인</button>':'')+'</td>'+stageCell(it,'guide','이용 안내')+stageCell(it,'confirmation','예약확정서')+stageCell(it,'portal','통합 링크')+'</tr>';}).join('')+'</tbody></table>':'<div class="empty"><b>해당 조건의 예약이 없습니다.</b><p class="small muted">기간·예약 상태·미완료 필터를 확인해 주세요.</p></div>';
  }
  function load(){
    var id=++sequence;$('#br-error').hidden=true;$('#br-list').setAttribute('aria-busy','true');$('#br-status').textContent='예약별 상태를 확인하고 있습니다.';
    // Remove old rows while refreshing so a previous reservation cannot be acted on.
    $('#br-list').innerHTML='<p class="empty small">불러오는 중…</p>';$('#br-prev').disabled=true;$('#br-next').disabled=true;
    var query=new URLSearchParams({from:$('#br-from').value,to:$('#br-to').value,space:$('#br-space').value,scope:$('#br-scope').value,q:$('#br-q').value,filter:filter,page:String(page)});
    return X.A('/booking-readiness?'+query).then(function(r){if(id!==sequence)return;if(page>0&&!r.items.length){page=r.total?Math.floor((r.total-1)/r.page_size):0;return load();}result=r;draw(r);}).catch(function(e){if(id!==sequence||X.guard(e))return;result=null;$('#br-error').textContent=e.message||'목록을 불러오지 못했습니다.';$('#br-error').hidden=false;$('#br-list').innerHTML='';$('#br-summary').innerHTML='';$('#br-status').textContent='조회하지 못했습니다. 조건을 확인한 뒤 다시 시도해 주세요.';$('#br-page').textContent='';}).finally(function(){if(id===sequence)$('#br-list').setAttribute('aria-busy','false');});
  }
  $('#br-form').onsubmit=function(e){e.preventDefault();if(!this.reportValidity())return;page=0;load();};$('#br-reload').onclick=function(){load();};
  $('#br-prev').onclick=function(){if(page>0){page--;load();}};$('#br-next').onclick=function(){if(result?.has_more){page++;load();}};
  view.addEventListener('click',function(e){var f=e.target.closest('[data-br-filter]');if(f){filter=f.dataset.brFilter;page=0;view.querySelectorAll('[data-br-filter]').forEach(function(b){b.setAttribute('aria-pressed',String(b===f));});load();return;}var b=e.target.closest('[data-br-guide]');if(b){document.dispatchEvent(new CustomEvent('admin-guide-history-open',{detail:{code:b.dataset.brGuide}}));}});
  document.addEventListener('close',function(e){if(e.target.id==='portal-dialog'&&X.current()==='booking-readiness'&&X.visible())load();},true);
  var confirmationDrawer=document.querySelector('#adm-cdoc');if(confirmationDrawer)new MutationObserver(function(records){if(confirmationDrawer.hidden&&records.some(function(r){return r.attributeName==='hidden';})&&X.current()==='booking-readiness'&&X.visible())load();}).observe(confirmationDrawer,{attributes:true,attributeFilter:['hidden']});
  X.register('booking-readiness',load);if(X.current()==='booking-readiness'&&X.visible())X.go('booking-readiness');
})();
