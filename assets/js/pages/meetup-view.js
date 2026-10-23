/* 모임 상세 — 소개 · 신청 현황 · 참가 신청(대기 신청) · 신청 확인·취소 · 공유 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, esc=M.esc;
  var root=$('#mv-root'); if(!root) return;
  var ref=String(new URLSearchParams(location.search).get('id')||'').toUpperCase().trim();
  var MY_KEY='ms_my_apps', m=null;

  function myApps(){ try{ var v=JSON.parse(localStorage.getItem(MY_KEY)||'[]'); return Array.isArray(v)?v:[]; }catch(e){ return []; } }
  function rememberApp(aref){ try{ var l=myApps().filter(function(x){ return x.app!==aref; }); l.unshift({ meetup:ref, app:aref, t:Date.now() }); localStorage.setItem(MY_KEY, JSON.stringify(l.slice(0,30))); }catch(e){} }
  function text(s){ return esc(s).replace(/\n/g,'<br>'); }
  function timeRange(x){ return (x.start_time||'')+(x.end_time?'–'+x.end_time:''); }
  function spaceOf(id){ return (window.MEGASPOT_SPACES||[]).filter(function(s){ return s.id===id; })[0]; }
  function fail(title, body){ root.innerHTML='<div class="empty"><b>'+esc(title)+'</b>'+esc(body)+'<div class="row mt-3" style="justify-content:center"><a class="btn btn-primary" href="/meetups/">모임 목록 보기</a><a class="btn btn-light" href="/meetups/new/">모임 등록하기</a></div></div>'; }

  if(!/^MO-\d{4}-[A-Z0-9]{4}$/.test(ref)){ fail('모임 주소가 올바르지 않습니다', '모임 목록에서 다시 골라 주세요.'); return; }

  function venueBlock(x){
    var sp=spaceOf(x.venue);
    if(sp) return '<section class="mv-sec"><h2>장소</h2><a class="mv-venue" href="/spaces/'+esc(sp.slug)+'/"><img src="'+M.imgSrc(sp.cover,'t')+'" alt="" loading="lazy"><span><b>'+esc(sp.name)+'</b><small>'+esc(sp.addressShort||sp.address||'')+'</small><small>'+esc(sp.area.pyeong)+'평 · 최대 '+esc(sp.capacity.max)+'명'+(sp.status==='opening'?' · 11월 13일 오픈':'')+'</small></span><span class="go">공간 보기 →</span></a>'
      +'<p class="small muted mt-2">서울 광진구 화양동 10-1 한아름건물 2층 · 지하철 2·7호선 건대입구역 인근 · 차를 가져오신다면 <a href="/parking/" style="text-decoration:underline">주차 안내</a>를 먼저 확인해 주세요.</p></section>';
    if(x.venue==='tbd') return '<section class="mv-sec"><h2>장소</h2><p>메가스팟 건대 1호(190평·최대 200명) 또는 건대 2호(400평·최대 350명)에서 열 예정입니다. 신청 인원을 보고 주최자가 정하며, 정해지면 이 페이지의 공지로 알려 드립니다.</p><div class="row mt-2" style="gap:8px"><a class="btn btn-light btn-sm" href="/spaces/megaspot-gundae/">건대 1호 보기</a><a class="btn btn-light btn-sm" href="/spaces/megaspot-gundae-2/">건대 2호 보기</a></div></section>';
    return '<section class="mv-sec"><h2>장소</h2><p><b>'+esc(x.venue_text||'다른 장소')+'</b></p><p class="small muted mt-1">메가스팟이 운영하지 않는 장소입니다. 장소 정보는 주최자가 적은 내용이니 자세한 위치는 주최자 공지나 문의 링크로 확인해 주세요.</p></section>';
  }
  function statusLine(x){
    var left=x.capacity?x.capacity-(x.seats||0):null;
    if(x.status==='cancelled') return '<div class="mv-state off">주최자가 이 모임을 취소했습니다.</div>';
    if(x.status==='done') return '<div class="mv-state off">끝난 모임입니다.</div>';
    if(x.status==='closed') return '<div class="mv-state off">모집이 마감되었습니다.</div>';
    if(left!==null && left<=0) return '<div class="mv-state warn">정원이 모두 찼습니다.'+(x.waitlist?' 대기 신청을 하면 취소가 나올 때 순서대로 확정됩니다.':'')+'</div>';
    return '<div class="mv-state">'+(left!==null?'남은 자리 <b>'+left+'</b>명':'신청을 받고 있습니다')+(x.deadline?' · '+esc(M.fmtKDate(x.deadline))+' 마감':'')+'</div>';
  }
  function progress(x){
    if(!x.capacity) return '';
    var pct=Math.min(100, Math.round((x.seats||0)/x.capacity*100));
    var mk=x.min_people?'<i class="min" style="left:'+Math.min(100,Math.round(x.min_people/x.capacity*100))+'%"></i>':'';
    return '<div class="mv-progress"><div class="row between"><span>신청 <b>'+(x.seats||0)+'</b> / 정원 '+x.capacity+'명</span>'+(x.waiting?'<span>대기 '+x.waiting+'명</span>':'')+'</div><div class="mt-bar big"><i style="width:'+pct+'%"></i>'+mk+'</div>'
      +(x.min_people?'<p class="tiny muted mt-1">'+((x.seats||0)>=x.min_people?'최소 진행 인원 '+x.min_people+'명을 넘었습니다.':'최소 '+x.min_people+'명이 모이면 진행합니다. 지금 '+(x.min_people-(x.seats||0))+'명 남았어요.')+'</p>':'')+'</div>';
  }
  function applyForm(x){
    var open=x.status==='open', left=x.capacity?x.capacity-(x.seats||0):1, full=left<=0;
    if(!open || (full && !x.waitlist)) return '<p class="small muted">'+(x.status==='open'?'정원이 모두 찼고 대기 신청도 받지 않는 모임입니다.':'지금은 신청을 받지 않습니다.')+' 다른 모임을 둘러보거나 직접 모임을 열어 보세요.</p><div class="row mt-2" style="gap:8px"><a class="btn btn-light btn-sm" href="/meetups/">다른 모임 보기</a><a class="btn btn-light btn-sm" href="/meetups/new/">모임 등록하기</a></div>';
    var per=[]; for(var i=1;i<=(x.max_per||1);i++) per.push('<option value="'+i+'">'+i+'명'+(i===1?' (본인)':'')+'</option>');
    return '<form class="form mv-apply" id="mv-apply" novalidate><input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">'
      +'<div class="field-row"><div class="f"><label for="ap-name">이름 <span class="req">*</span></label><input class="input" id="ap-name" name="name" maxlength="40" autocomplete="name" required></div>'
      +'<div class="f"><label for="ap-phone">휴대폰 번호 <span class="req">*</span></label><input class="input" type="tel" id="ap-phone" name="phone" autocomplete="tel" placeholder="010-0000-0000" required></div></div>'
      +((x.max_per||1)>1?'<div class="f"><label for="ap-people">인원</label><select class="select" id="ap-people" name="people">'+per.join('')+'</select></div>':'')
      +(x.question?'<div class="f"><label for="ap-answer">'+esc(x.question)+' <span class="req">*</span></label><textarea class="textarea" id="ap-answer" name="answer" rows="2" maxlength="300" required></textarea></div>':'')
      +'<div class="f"><label for="ap-msg">주최자에게 남길 말 <span class="muted">(선택)</span></label><input class="input" id="ap-msg" name="message" maxlength="500"></div>'
      +'<label class="agree"><input type="checkbox" name="agree_privacy" required> <span>(필수) 참가 신청을 위해 이름·휴대폰 번호를 수집·이용하는 데 동의합니다. 모임이 끝나고 30일 뒤 지웁니다.</span></label>'
      +'<label class="agree"><input type="checkbox" name="agree_share" required> <span>(필수) 이름·휴대폰 번호·인원·답변·남길 말을 모임 주최자 <b>'+esc(x.host_name||'')+'</b>에게 제공하는 데 동의합니다. 주최자는 참가 확인과 모임 안내에만 쓰고, 모임이 끝나고 30일 안에 지웁니다.</span></label>'
      +'<div class="form-note" id="ap-msgbox" hidden></div>'
      +'<button class="btn '+(full?'btn-dark':'btn-primary')+' btn-lg btn-block" type="submit">'+(full?'대기 신청하기':(x.mode==='approve'?'참가 신청하기 (주최자 승인)':'참가 신청하기'))+' <span class="arrow">→</span></button>'
      +'<p class="tiny muted">'+(x.mode==='approve'?'주최자가 신청 내용을 보고 확정합니다. 확정 여부는 아래 \'신청 확인\'에서 볼 수 있어요.':'신청하면 바로 참가가 확정됩니다.')+(x.fee_type==='paid'?' 참가비는 주최자가 따로 안내합니다.':'')+'</p></form>';
  }
  function lookupBox(){
    var mine=myApps().filter(function(a){ return a.meetup===ref; })[0];
    return '<div class="card mv-box mt-3" id="mv-lookup"><h3 class="h-xs">신청 확인 · 취소</h3><form class="form" id="lk-form" novalidate><div class="field-row"><div class="f"><label for="lk-ref">신청번호</label><input class="input" id="lk-ref" name="app_ref" placeholder="AP-0000-XXXX" value="'+esc(mine?mine.app:'')+'" required></div><div class="f"><label for="lk-4">휴대폰 뒷 4자리</label><input class="input" id="lk-4" name="phone_last4" inputmode="numeric" maxlength="4" required></div></div><button class="btn btn-light btn-sm" type="submit">확인하기</button></form><div id="lk-result" class="mt-2" hidden></div></div>';
  }
  function render(x){
    m=x; document.title=x.title+' · 모임 모집 · 메가스팟';
    $('#mv-crumb').textContent=x.title;
    var fee=x.fee_type==='paid'?(x.fee?M.fmtNum(x.fee)+'원':'유료')+(x.fee_note?' · '+x.fee_note:''):'무료';
    var link=x.contact_url?'<a class="btn btn-light btn-sm" href="'+esc(x.contact_url)+'" target="_blank" rel="nofollow noopener noreferrer">주최자에게 문의 ↗</a>':'';
    root.innerHTML='<div class="mv-layout">'
      +'<article class="mv-main">'
      +'<div class="mv-cover"><img src="'+esc(M.coverSrc(x.cover,''))+'" alt="'+esc(x.title)+' 대표 이미지" referrerpolicy="no-referrer"></div>'
      +'<div class="mv-head"><div class="row" style="gap:6px"><span class="badge badge-cobalt">'+esc(x.cat_label)+'</span>'+M.meetupBadge(x)+(x.verified?'<span class="badge badge-direct" title="운영팀이 메가스팟 예약번호로 확인한 모임입니다">메가스팟 예약 확인</span>':'')+(x.featured?'<span class="badge badge-outline">추천 모임</span>':'')+'</div>'
      +'<h1 class="h-l mt-2">'+esc(x.title)+'</h1><p class="lead mt-1">'+esc(x.summary)+'</p>'
      +'<div class="row mt-2 mv-tools">'+M.fav.button('meetup', x.ref, x.title)+'<button class="btn btn-light btn-sm" type="button" id="mv-share">공유하기</button>'+link+'</div></div>'
      +'<dl class="def mv-facts">'
      +'<div><dt>날짜·시간</dt><dd><b>'+esc(M.fmtKDate(x.date))+'</b> '+esc(timeRange(x))+'</dd></div>'
      +'<div><dt>장소</dt><dd>'+esc(M.meetupWhere(x))+'</dd></div>'
      +'<div><dt>모집 인원</dt><dd>정원 '+esc(x.capacity)+'명'+(x.min_people?' · 최소 '+esc(x.min_people)+'명이 모이면 진행':'')+'</dd></div>'
      +'<div><dt>참가비</dt><dd>'+esc(fee)+'</dd></div>'
      +'<div><dt>신청 방식</dt><dd>'+(x.mode==='approve'?'주최자 승인 후 확정':'선착순 바로 확정')+' · 한 번에 '+esc(x.max_per||1)+'명까지'+(x.waitlist?' · 정원이 차면 대기 신청':'')+'</dd></div>'
      +(x.deadline?'<div><dt>모집 마감</dt><dd>'+esc(M.fmtKDate(x.deadline))+'까지</dd></div>':'')
      +'</dl>'
      +(x.notice?'<div class="notice mt-3"><div><b>주최자 공지</b><br>'+text(x.notice)+'</div></div>':'')
      +'<section class="mv-sec"><h2>모임 소개</h2><div class="mv-text">'+text(x.description)+'</div>'+(x.tags&&x.tags.length?'<div class="tags mt-2">'+x.tags.map(function(t){ return '<span class="tag">#'+esc(t)+'</span>'; }).join('')+'</div>':'')+'</section>'
      +(x.for_whom?'<section class="mv-sec"><h2>이런 분께 추천해요</h2><p>'+text(x.for_whom)+'</p></section>':'')
      +venueBlock(x)
      +'<section class="mv-sec"><h2>주최자</h2><p><b>'+esc(x.host_name)+'</b></p>'+(x.host_intro?'<p class="small muted mt-1">'+text(x.host_intro)+'</p>':'')+'<p class="tiny muted mt-2">모임 내용과 참가비 안내는 주최자가 작성했습니다. 메가스팟은 모임 페이지와 신청 접수를 제공하고, 참가비 결제·환불에는 관여하지 않습니다.</p></section>'
      +'<p class="tiny muted mt-3">모임 내용이 실제와 다르거나 부적절하다면 <a href="mailto:'+esc(M.CONFIG.email)+'?subject='+encodeURIComponent('[모임 신고] '+x.ref)+'" style="text-decoration:underline">운영팀에 알려 주세요</a>. 모임번호 '+esc(x.ref)+'</p>'
      +'</article>'
      +'<aside class="mv-side"><div class="card mv-box" id="mv-applybox"><div class="mv-when"><b>'+esc(M.fmtKDate(x.date))+'</b> '+esc(timeRange(x))+'</div>'+statusLine(x)+progress(x)+'<div class="mt-2" id="mv-applywrap">'+applyForm(x)+'</div></div>'+lookupBox()+'</aside>'
      +'</div>';
    bind();
    more();
    sticky('#mv-applybox', x.status==='open'?((x.capacity && x.capacity-(x.seats||0)<=0)?'대기 신청하기':'참가 신청하기'):'신청 확인 · 취소');
  }
  // 작은 화면: 신청 칸이 화면 밖에 있을 때 아래에 '참가 신청하기' 버튼을 띄웁니다
  function sticky(target, label){
    var old=document.querySelector('.mv-sticky'); if(old) old.remove();
    var box=$(target); if(!box) return;
    var a=document.createElement('a'); a.className='mv-sticky'; a.href=target; a.innerHTML=esc(label)+' <span class="arrow">↓</span>';
    a.addEventListener('click', function(e){ e.preventDefault(); box.scrollIntoView({ behavior:'smooth', block:'start' }); var f=box.querySelector('input:not(.hp)'); if(f) setTimeout(function(){ f.focus({ preventScroll:true }); }, 500); });
    document.body.appendChild(a);
    if('IntersectionObserver' in window) new IntersectionObserver(function(en){ a.classList.toggle('off', en[0].isIntersecting); }, { rootMargin:'0px 0px -30% 0px' }).observe(box);
  }
  function bind(){
    var sh=$('#mv-share'); if(sh) sh.addEventListener('click', function(){ M.share(location.origin+'/meetups/view/?id='+encodeURIComponent(ref), m.title); });
    var f=$('#mv-apply');
    if(f){
      var ph=$('#ap-phone'); ph.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });
      f.addEventListener('submit', function(e){
        e.preventDefault(); var box=$('#ap-msgbox'); box.hidden=true;
        if(!M.validate(f)){ box.textContent='표시된 항목을 확인해 주세요.'; box.hidden=false; return; }
        var b=f.querySelector('button[type=submit]'), label=b.innerHTML; b.disabled=true; b.textContent='신청하는 중…';
        M.api('/meetups/'+encodeURIComponent(ref)+'/apply',{ method:'POST', body:M.formData(f) }).then(function(r){
          rememberApp(r.ref);
          var msg=r.status==='confirmed'?'참가가 확정되었습니다.':r.status==='pending'?'신청을 받았습니다. 주최자가 확인한 뒤 확정합니다.':'대기 '+(r.wait_no||'')+'번으로 신청했습니다. 취소가 나오면 순서대로 확정됩니다.';
          $('#mv-applywrap').innerHTML='<div class="mv-done"><div class="eyebrow">'+esc(r.status_label)+'</div><b class="h-s">'+esc(msg)+'</b><p class="mt-1">신청번호 <b class="ref">'+esc(r.ref)+'</b> · '+esc(r.people)+'명</p><p class="tiny muted mt-1">신청번호와 휴대폰 뒷 4자리로 아래에서 상태를 확인하고 취소할 수 있습니다. 화면을 캡처해 두면 편해요. 이 브라우저에는 신청번호가 저장되어 다음에 자동으로 채워집니다.</p></div>';
          var lk=$('#lk-ref'); if(lk) lk.value=r.ref;
          load(true);
        }).catch(function(ex){
          box.innerHTML=ex.code==='NO_API'?'지금은 서버 연결 전이라 신청을 받을 수 없습니다. 카카오톡으로 문의해 주세요.':esc(ex.message||'신청하지 못했습니다.'); box.hidden=false;
          if(ex.code==='FULL'||ex.code==='CLOSED') load(true);
        }).finally(function(){ b.disabled=false; b.innerHTML=label; });
      });
    }
    var lf=$('#lk-form');
    if(lf) lf.addEventListener('submit', function(e){
      e.preventDefault(); var out=$('#lk-result'); if(!M.validate(lf)) return;
      var body=M.formData(lf); body.app_ref=String(body.app_ref||'').toUpperCase().trim();
      M.api('/meetups/'+encodeURIComponent(ref)+'/lookup',{ method:'POST', body:body }).then(function(r){ showApp(r.app, body); }).catch(function(ex){ out.innerHTML='<div class="form-note">'+esc(ex.message||'확인하지 못했습니다.')+'</div>'; out.hidden=false; });
    });
  }
  function showApp(a, body){
    var out=$('#lk-result'), can=['confirmed','pending','waitlist'].indexOf(a.status)>=0;
    out.innerHTML='<div class="mv-app st-'+esc(a.status)+'"><div class="row between"><b>'+esc(a.status_label)+(a.status==='waitlist'&&a.wait_no?' · '+a.wait_no+'번째':'')+'</b><span class="tiny muted">'+esc(a.ref)+'</span></div><p class="small mt-1">'+esc(a.name)+' · '+esc(a.people)+'명 · '+esc(a.created_at)+' 신청</p>'
      +(can?'<div class="mt-2" id="lk-cancel"><button class="btn btn-light btn-sm" type="button" data-step="1">신청 취소하기</button></div>':'')+'</div>';
    out.hidden=false;
    var c=$('#lk-cancel'); if(!c) return;
    c.addEventListener('click', function(e){
      var b=e.target.closest('button'); if(!b) return;
      if(b.dataset.step==='1'){ c.innerHTML='<p class="small">정말 취소할까요? 취소하면 자리가 다음 대기자에게 넘어갑니다.</p><div class="row mt-1" style="gap:6px"><button class="btn btn-dark btn-sm" type="button" data-step="2">네, 취소합니다</button><button class="btn btn-light btn-sm" type="button" data-step="0">아니요</button></div>'; return; }
      if(b.dataset.step==='0'){ showApp(a, body); return; }
      b.disabled=true;
      M.api('/meetups/'+encodeURIComponent(ref)+'/cancel',{ method:'POST', body:body }).then(function(r){ showApp(r.app, body); M.toast('신청을 취소했습니다.'); load(true); }).catch(function(ex){ M.toast(ex.message||'취소하지 못했습니다.'); b.disabled=false; });
    });
  }
  // 신청 뒤에는 신청 현황 숫자만 새로 그립니다 (입력 중인 확인 칸은 그대로)
  function load(refresh){
    M.api('/meetups/'+encodeURIComponent(ref)).then(function(j){
      if(!refresh){ render(j.item); return; }
      m=j.item; var box=$('#mv-applybox'); if(!box) return;
      var st=box.querySelector('.mv-state'), pg=box.querySelector('.mv-progress');
      var tmp=document.createElement('div'); tmp.innerHTML=statusLine(m)+progress(m);
      if(st) st.replaceWith(tmp.firstChild); if(pg && tmp.firstChild) pg.replaceWith(tmp.firstChild);
    }).catch(function(e){ if(refresh) return; if(e.code==='NO_API') fail('모임 정보를 준비하고 있습니다', '지금은 서버 연결 전이라 모임 정보를 보여 드릴 수 없습니다.'); else fail('모임을 찾을 수 없습니다', '아직 공개되지 않았거나 내려간 모임입니다. 모임 목록에서 다른 모임을 둘러보세요.'); });
  }
  function more(){
    M.api('/meetups/list?limit=8').then(function(j){
      var l=(j.items||[]).filter(function(x){ return x.ref!==ref; }).slice(0,3); if(!l.length) return;
      $('#mv-more').innerHTML=l.map(function(x){ return M.meetupCard(x); }).join(''); $('#mv-more-sec').hidden=false;
    }).catch(function(){});
  }
  load(false);
})();
