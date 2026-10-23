/* 등록 공간 상세 (외부 호스트 공간 · 문의형) — 사진 · 기본 정보 · 시설 · 요금 안내 · 호스트 정보 · 문의 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, esc=M.esc;
  var root=$('#ls-root'); if(!root) return;
  var id=String(new URLSearchParams(location.search).get('id')||'').toUpperCase().trim();
  var FEAT={}, PUR={}, THE={}, REG={};
  (window.MEGASPOT_FEATURES||[]).forEach(function(f){ FEAT[f.id]=f.label; }); (window.MEGASPOT_PURPOSES||[]).forEach(function(p){ PUR[p.id]=p.label; });
  (window.MEGASPOT_THEMES||[]).forEach(function(t){ THE[t.id]=t.label; }); (window.MEGASPOT_REGIONS||[]).forEach(function(r){ REG[r.id]=r.label; });
  function text(s){ return esc(s).replace(/\n/g,'<br>'); }
  function fail(t, b){ root.innerHTML='<div class="empty"><b>'+esc(t)+'</b>'+esc(b)+'<div class="row mt-3" style="justify-content:center"><a class="btn btn-primary" href="/spaces/">공간 찾기</a><a class="btn btn-light" href="/inquiry/?mode=request">맞춤 공간 요청</a></div></div>'; }
  if(!/^L-\d{4}-[A-Z0-9]{4}$/.test(id)){ fail('공간 주소가 올바르지 않습니다', '공간 찾기에서 다시 골라 주세요.'); return; }

  function render(l){
    document.title=l.name+' · 공간 찾기 · 메가스팟'; $('#ls-crumb').textContent=l.name;
    var photos=(l.photos||[]).map(function(u){ return M.coverSrc(u); });
    var gal=photos.length?'<div class="ls-gallery'+(photos.length===1?' one':' n'+Math.min(5,photos.length))+'">'+photos.slice(0,5).map(function(u,i){ return '<button type="button" data-i="'+i+'" aria-label="사진 '+(i+1)+' 크게 보기"><img src="'+esc(u)+'" alt="'+esc(l.name)+' 사진 '+(i+1)+'" loading="'+(i?'lazy':'eager')+'" referrerpolicy="no-referrer"></button>'; }).join('')+(photos.length>5?'<span class="more">+'+(photos.length-5)+'</span>':'')+'</div>'
      :'<div class="ls-gallery none"><span class="ph-blank"><b>'+esc(l.name)+'</b><small>사진은 호스트에게 받는 대로 올립니다</small></span></div>';
    var list=function(arr, map){ return (arr||[]).map(function(x){ return '<span class="tag">'+esc(map[x]||x)+'</span>'; }).join(''); };
    root.innerHTML=gal
      +'<div class="mv-layout ls-layout"><article class="mv-main">'
      +'<div class="row" style="gap:6px"><span class="badge badge-host">외부 호스트</span><span class="badge badge-soft">문의형</span>'+(l.space_type?'<span class="badge badge-outline">'+esc(l.space_type)+'</span>':'')+'</div>'
      +'<h1 class="h-l mt-2">'+esc(l.name)+'</h1><p class="small muted mt-1">'+esc([REG[l.region]||'', l.address, l.station].filter(Boolean).join(' · '))+'</p>'
      +(l.summary?'<p class="lead mt-2">'+esc(l.summary)+'</p>':'')
      +'<div class="row mt-2 mv-tools">'+M.fav.button('space', l.id, l.name)+'<button class="btn btn-light btn-sm" type="button" id="ls-share">공유하기</button></div>'
      +'<dl class="def mv-facts">'+(l.area?'<div><dt>면적</dt><dd>'+esc(l.area)+'평</dd></div>':'')+(l.capacity?'<div><dt>최대 인원</dt><dd>'+esc(l.capacity)+'명</dd></div>':'')+(l.hours?'<div><dt>이용 시간</dt><dd>'+esc(l.hours)+'</dd></div>':'')+(l.price_note?'<div><dt>요금 안내</dt><dd>'+esc(l.price_note)+'</dd></div>':'')+'</dl>'
      +(l.description?'<section class="mv-sec"><h2>공간 소개</h2><div class="mv-text">'+text(l.description)+'</div></section>':'')
      +((l.purposes||[]).length?'<section class="mv-sec"><h2>잘 맞는 모임</h2><div class="tags">'+list(l.purposes, PUR)+'</div></section>':'')
      +((l.features||[]).length?'<section class="mv-sec"><h2>시설</h2><div class="tags">'+list(l.features, FEAT)+'</div></section>':'')
      +((l.themes||[]).length?'<section class="mv-sec"><h2>분위기</h2><div class="tags">'+list(l.themes, THE)+'</div></section>':'')
      +(l.rules?'<section class="mv-sec"><h2>이용 규칙</h2><p>'+text(l.rules)+'</p></section>':'')
      +'<section class="mv-sec"><h2>호스트</h2><p><b>'+esc(l.host_name||'호스트')+'</b></p>'+(l.host_biz?'<p class="small muted mt-1">'+esc(l.host_biz)+'</p>':'')
      +'<p class="tiny muted mt-2">이 공간은 메가스팟이 직접 운영하지 않는 외부 호스트 공간입니다. 메가스팟은 문의를 연결하는 통신판매중개자이며, 이용 계약의 상대방은 위 호스트입니다. 면적·인원·요금은 호스트가 알려 준 정보를 운영팀이 확인한 범위에서 적었고, 최종 조건은 견적 단계에서 확정합니다.</p></section>'
      +'</article>'
      +'<aside class="mv-side"><form class="card mv-box form" id="ls-form" novalidate><input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"><h3 class="h-s">이 공간 문의하기</h3><p class="small muted">날짜·인원·행사 내용을 남기면 메가스팟 운영팀이 호스트에게 가능 여부와 견적을 확인해 연락드립니다.</p>'
      +'<div class="field-row"><div class="f"><label for="ls-name">이름 <span class="req">*</span></label><input class="input" id="ls-name" name="name" maxlength="80" required autocomplete="name"></div><div class="f"><label for="ls-phone">연락처 <span class="req">*</span></label><input class="input" type="tel" id="ls-phone" name="phone" required placeholder="010-0000-0000" autocomplete="tel"></div></div>'
      +'<div class="field-row"><div class="f"><label for="ls-date">희망 날짜</label><input class="input" type="date" id="ls-date" name="date"></div><div class="f"><label for="ls-head">인원</label><input class="input" type="number" id="ls-head" name="headcount" min="1" inputmode="numeric"></div></div>'
      +'<div class="f"><label for="ls-msg">행사 내용</label><textarea class="textarea" id="ls-msg" name="message" rows="3" maxlength="2000" placeholder="시간대, 행사 종류, 필요한 장비"></textarea></div>'
      +'<label class="agree"><input type="checkbox" name="agree_privacy" required> <span>(필수) 문의 답변을 위해 이름·연락처를 수집·이용하고, 가능 여부 확인을 위해 문의 내용을 호스트에게 전달하는 데 동의합니다.</span></label>'
      +'<div class="form-note" id="ls-note" hidden></div><button class="btn btn-primary btn-block" type="submit">문의 보내기 <span class="arrow">→</span></button></form>'
      +'<div class="card mv-box mt-3"><b>비슷한 조건의 직영 공간</b><p class="small muted mt-1">바로 금액을 확인하고 예약을 신청할 수 있습니다.</p><div class="ls-direct mt-2"><a href="/spaces/megaspot-gundae/">메가스팟 건대 1호<small>190평 · 최대 200명</small></a><a href="/spaces/megaspot-gundae-2/">메가스팟 건대 2호<small>400평 · 최대 350명 · 11/13 오픈</small></a></div></div>'
      +'</aside></div>';
    var form0=$('#ls-form'), st=document.createElement('a'); st.className='mv-sticky'; st.href='#ls-form'; st.innerHTML='이 공간 문의하기 <span class="arrow">↓</span>';
    st.addEventListener('click', function(e){ e.preventDefault(); form0.scrollIntoView({ behavior:'smooth', block:'start' }); }); document.body.appendChild(st);
    if('IntersectionObserver' in window) new IntersectionObserver(function(en){ st.classList.toggle('off', en[0].isIntersecting); }, { rootMargin:'0px 0px -30% 0px' }).observe(form0);
    var gb=root.querySelector('.ls-gallery'); if(gb && photos.length) gb.addEventListener('click', function(e){ var b=e.target.closest('button[data-i]'); if(b) M.openLightbox(photos.map(function(u,i){ return { src:u, title:l.name, cap:'사진 '+(i+1)+' / '+photos.length }; }), +b.dataset.i); });
    $('#ls-share').addEventListener('click', function(){ M.share(location.href, l.name); });
    var f=$('#ls-form'), ph=$('#ls-phone');
    ph.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });
    $('#ls-date').min=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
    f.addEventListener('submit', function(e){
      e.preventDefault(); var n=$('#ls-note'); n.hidden=true; if(!M.validate(f)){ n.textContent='이름과 연락처를 확인해 주세요.'; n.hidden=false; return; }
      var d=M.formData(f); d.space_id='request'; d.inquiry_type='event'; d.listing={ id:l.id, name:l.name }; d.came_from=M.source(); d.source=location.pathname+location.search;
      d.summary='[등록 공간 문의] '+l.name+' ('+l.id+')\n이름: '+d.name+'\n연락처: '+d.phone+(d.date?'\n희망 날짜: '+d.date:'')+(d.headcount?'\n인원: '+d.headcount+'명':'')+(d.message?'\n내용: '+d.message:'');
      var b=f.querySelector('button[type=submit]'); b.disabled=true;
      M.api('/inquiry',{ method:'POST', body:d }).then(function(r){ f.innerHTML='<div class="mv-done"><div class="eyebrow">Sent</div><b class="h-s">문의를 보냈습니다</b><p class="mt-1">문의번호 <b class="ref">'+esc(r.ref)+'</b> · 호스트에게 가능 여부를 확인해 영업일 기준 1~2일 안에 연락드립니다.</p></div>'; })
      .catch(function(ex){ n.innerHTML=ex.code==='NO_API'?'지금은 서버 연결 전이라 문의를 저장하지 못했습니다. 카카오톡이나 전화('+esc(M.CONFIG.phone)+')로 공간 이름을 알려 주세요.':esc(ex.message||'보내지 못했습니다.'); n.hidden=false; })
      .finally(function(){ b.disabled=false; });
    });
  }
  M.api('/listings/'+encodeURIComponent(id)).then(function(j){ render(j.item); }).catch(function(e){ if(e.code==='NO_API') fail('공간 정보를 준비하고 있습니다', '지금은 서버 연결 전이라 공간 정보를 보여 드릴 수 없습니다.'); else fail('공간을 찾을 수 없습니다', '공개가 끝났거나 아직 준비 중인 공간입니다.'); });
})();
