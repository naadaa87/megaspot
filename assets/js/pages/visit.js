/* 사전답사 신청 (/visit/) — 2026-11-25
   ① 공간 → ② 날짜 → ③ 시간 → ④ 연락처 순서로 고르고 신청합니다. 확정 예약이 있는 시간과 마감한 날은 고를 수 없습니다.
   다른 답사 팀과는 시간이 겹쳐도 됩니다. 신청하면 운영팀이 확인해 확정합니다.
   신청 뒤 화면(#ref=답사번호&k=열쇠)에서 상태를 보고, 운영팀과 글을 주고받고, 취소할 수 있습니다.
   이 기기에는 최근 신청 5건의 확인 주소만 기억합니다(ms_visits). 휴대폰 번호는 저장하지 않습니다. */
(function(){
  var M=window.MEGASPOT; if(!M) return;
  var $=M.$, esc=M.esc, root=$('#vs-root'); if(!root) return;
  var KAKAO=(M.CONFIG&&M.CONFIG.kakaoChannel)||'https://pf.kakao.com/_LnxbmX/chat', PHONE=(M.CONFIG&&M.CONFIG.phone)||'010-2384-9580', STORE='ms_visits';
  var SP=[['megaspot-gundae','건대 1호','190평 · 최대 200명'],['megaspot-gundae-2','건대 2호','400평 · 최대 350명'],['both','1호·2호 함께','같은 층 두 공간을 한 번에']];
  var WHY={booking:'예약 있음',closed:'운영 마감',past:'신청 마감',off:'쉬는 날'};
  var st={space:'',from:'',date:'',time:'',days:[],duration:30};

  function mine(){ try{ var v=JSON.parse(localStorage.getItem(STORE)||'[]'); return Array.isArray(v)?v:[]; }catch(e){ return []; } }
  function keep(x){ try{ var l=mine().filter(function(y){ return y&&y.ref!==x.ref; }); l.unshift(x); localStorage.setItem(STORE,JSON.stringify(l.slice(0,5))); }catch(e){} }
  function forget(ref){ try{ localStorage.setItem(STORE,JSON.stringify(mine().filter(function(y){ return y&&y.ref!==ref; }))); }catch(e){} }
  function kdate(d){ return d?M.fmtKDate(d):''; }
  function kst(at){ var t=Date.parse(String(at||'').replace(' ','T')+'Z'); if(!isFinite(t)) return ''; var d=new Date(t+9*36e5).toISOString(); return (+d.slice(5,7))+'/'+(+d.slice(8,10))+' '+d.slice(11,16); }
  function todayK(){ return new Date(Date.now()+9*36e5).toISOString().slice(0,10); }
  function addDays(d,n){ return new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10); }

  // ---------- 신청 화면 ----------
  function showForm(){
    var q=new URLSearchParams(location.search), pre=q.get('space');
    st.space=SP.some(function(s){ return s[0]===pre; })?pre:'';
    st.from=todayK(); st.date=''; st.time='';
    root.innerHTML='<div class="vs-grid"><div class="vs-steps">'
      +'<section class="card vs-step" id="vs-s1"><h2 class="vs-h"><span>1</span>어느 공간을 보시겠어요?</h2><div class="vs-spaces">'+SP.map(function(s){ return '<button type="button" class="vs-space'+(st.space===s[0]?' on':'')+'" data-space="'+s[0]+'"><b>'+esc(s[1])+'</b><small>'+esc(s[2])+'</small></button>'; }).join('')+'</div></section>'
      +'<section class="card vs-step" id="vs-s2"><h2 class="vs-h"><span>2</span>날짜를 골라 주세요</h2><p class="small muted" id="vs-days-note">공간을 먼저 고르시면 날짜가 나옵니다.</p><div class="vs-days" id="vs-days"></div><div class="vs-days-nav" id="vs-days-nav" hidden><button type="button" class="btn btn-light btn-sm" data-move="-14">← 이전 2주</button><button type="button" class="btn btn-light btn-sm" data-move="14">다음 2주 →</button></div></section>'
      +'<section class="card vs-step" id="vs-s3"><h2 class="vs-h"><span>3</span>시간을 골라 주세요</h2><p class="small muted" id="vs-times-note">날짜를 고르시면 시간이 나옵니다. 행사(확정 예약)가 있는 시간은 고를 수 없어요.</p><div class="vs-times" id="vs-times"></div></section>'
      +'<form class="card vs-step" id="vs-form" novalidate><h2 class="vs-h"><span>4</span>연락처를 남겨 주세요</h2>'
        +'<div class="field-row"><div class="f"><label for="vs-name">이름 <span class="req">*</span></label><input class="input" id="vs-name" maxlength="40" autocomplete="name" required></div>'
        +'<div class="f"><label for="vs-phone">휴대폰 번호 <span class="req">*</span></label><input class="input" id="vs-phone" inputmode="tel" maxlength="13" autocomplete="tel" placeholder="010-0000-0000" required></div></div>'
        +'<div class="field-row"><div class="f"><label for="vs-people">방문 인원</label><select class="select" id="vs-people">'+[1,2,3,4,5,6].map(function(n){ return '<option value="'+n+'"'+(n===2?' selected':'')+'>'+n+'명'+(n===6?' 이상':'')+'</option>'; }).join('')+'</select></div>'
        +'<div class="f"><label for="vs-purpose">모임 성격 <span class="muted">(선택)</span></label><select class="select" id="vs-purpose"><option value="">선택 안 함</option><option>세미나·강연</option><option>워크숍·팀빌딩</option><option>네트워킹·리셉션</option><option>단체 파티·송년회</option><option>동문회·정기 모임</option><option>팝업·전시·마켓</option><option>촬영</option><option>기타</option></select></div></div>'
        +'<div class="field-row"><div class="f"><label for="vs-event">행사 예정일 <span class="muted">(선택)</span></label><input class="input" id="vs-event" type="date"></div>'
        +'<div class="f"><label for="vs-head">예상 인원 <span class="muted">(선택)</span></label><input class="input" id="vs-head" type="number" inputmode="numeric" min="1" max="1000" placeholder="예: 120 (명)"></div></div>'
        +'<div class="f"><label for="vs-memo">남기실 말 <span class="muted">(선택)</span></label><textarea class="textarea" id="vs-memo" rows="3" maxlength="500" placeholder="예: 강연형 배치로 볼 수 있을까요? 주차해서 갑니다."></textarea></div>'
        +'<input type="text" name="website" id="vs-hp" tabindex="-1" autocomplete="off" class="hp-field" aria-hidden="true">'
        +'<label class="agree small"><input type="checkbox" id="vs-agree" required> (필수) 답사 안내를 위해 이름·휴대폰 번호를 받는 데 동의합니다. <a href="/privacy/" target="_blank" rel="noopener">개인정보처리방침</a></label>'
        +'<button class="btn btn-primary btn-lg" type="submit" id="vs-go" disabled>사전답사 신청하기 <span class="arrow">→</span></button>'
        +'<div class="err" id="vs-err" role="alert" hidden></div>'
      +'</form></div>'
      +'<aside class="vs-side"><div class="card vs-sum" id="vs-sum"></div>'
        +'<div class="card vs-help"><b>바로 물어보고 싶으시면</b><p class="small muted mt-1">시간이 맞지 않거나 급하시면 카카오톡이나 전화로 편하게 말씀해 주세요.</p><div class="vs-help-row"><a class="btn btn-kakao btn-sm" href="'+esc(KAKAO)+'" target="_blank" rel="noopener">카톡문의</a><a class="btn btn-ghost btn-sm" href="tel:'+esc(PHONE.replace(/-/g,''))+'">전화 '+esc(PHONE)+'</a></div></div>'
        +mineHtml()+'</aside></div>';
    bindForm(); drawSum();
    if(st.space) loadDays();
  }
  function mineHtml(){
    var l=mine(); if(!l.length) return '';
    return '<div class="card vs-mine"><b>이 기기에서 신청한 사전답사</b><div class="vs-mine-list">'+l.map(function(x){ return '<a href="#ref='+encodeURIComponent(x.ref)+'&k='+encodeURIComponent(x.k)+'"><span>'+esc(x.label||'사전답사')+'</span><small>'+esc(kdate(x.date))+' '+esc(x.time||'')+' · '+esc(x.ref)+'</small></a>'; }).join('')+'</div></div>';
  }
  function drawSum(){
    var s=SP.filter(function(x){ return x[0]===st.space; })[0];
    $('#vs-sum').innerHTML='<div class="eyebrow">Site visit</div><h3 class="vs-sum-h">사전답사 신청</h3>'
      +'<dl class="vs-dl"><div><dt>공간</dt><dd>'+(s?esc(s[1]):'<span class="muted">고르는 중</span>')+'</dd></div><div><dt>날짜</dt><dd>'+(st.date?esc(kdate(st.date)):'<span class="muted">고르는 중</span>')+'</dd></div><div><dt>시간</dt><dd>'+(st.time?esc(st.time)+' <small class="muted">(약 '+st.duration+'분)</small>':'<span class="muted">고르는 중</span>')+'</dd></div></dl>'
      +'<p class="tiny muted mt-2">신청하면 운영팀이 확인해 확정 안내를 드립니다. 다른 팀 답사와 시간이 겹쳐도 함께 안내해 드려요. 답사는 무료입니다.</p>';
    var go=$('#vs-go'); if(go) go.disabled=!(st.space&&st.date&&st.time);
  }
  function bindForm(){
    root.querySelectorAll('.vs-space').forEach(function(b){ b.addEventListener('click',function(){ st.space=b.dataset.space; st.date=''; st.time=''; root.querySelectorAll('.vs-space').forEach(function(x){ x.classList.toggle('on',x===b); }); drawSum(); loadDays(); }); });
    $('#vs-days-nav').addEventListener('click',function(e){ var b=e.target.closest('[data-move]'); if(!b) return; var n=addDays(st.from,+b.dataset.move); if(n<todayK()) n=todayK(); st.from=n; loadDays(); });
    var ph=$('#vs-phone'); ph.addEventListener('input',function(){ var d=ph.value.replace(/\D/g,'').slice(0,11); ph.value=d.length>7?d.replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3'):d.length>3?d.slice(0,3)+'-'+d.slice(3):d; });
    $('#vs-form').addEventListener('submit',submit);
  }
  function loadDays(){
    var box=$('#vs-days'); box.innerHTML='<p class="small muted">빈 시간을 확인하는 중…</p>'; $('#vs-times').innerHTML='';
    M.api('/visit/slots?space='+encodeURIComponent(st.space)+'&from='+st.from+'&days=14').then(function(j){
      if(!j.enabled){ box.innerHTML='<p class="small">지금은 홈페이지에서 사전답사 신청을 받지 않습니다. 카카오톡이나 전화로 문의해 주세요.</p>'; return; }
      st.days=j.days; st.duration=j.duration||30; $('#vs-days-nav').hidden=false;
      $('#vs-days-note').textContent=(j.note?j.note+' ':'')+'오늘부터 '+j.days_ahead+'일 안에서 고르실 수 있습니다. 회색 날짜는 신청할 수 있는 시간이 없는 날입니다.';
      box.innerHTML=j.days.map(function(d){ var free=d.slots.filter(function(s){ return s.ok; }).length;
        return '<button type="button" class="vs-day'+(d.date===st.date?' on':'')+'" data-date="'+d.date+'"'+(d.open?'':' disabled')+'><small>'+esc(d.weekday)+'</small><b>'+(+d.date.slice(8,10))+'</b><em>'+(d.open?free+'칸':'불가')+'</em><i>'+(+d.date.slice(5,7))+'월</i></button>'; }).join('');
      box.querySelectorAll('.vs-day').forEach(function(b){ b.addEventListener('click',function(){ st.date=b.dataset.date; st.time=''; box.querySelectorAll('.vs-day').forEach(function(x){ x.classList.toggle('on',x===b); }); drawSum(); drawTimes(); if(window.innerWidth<900) $('#vs-s3').scrollIntoView({behavior:'smooth',block:'start'}); }); });
      if(st.date) drawTimes();
    }).catch(function(x){ box.innerHTML='<p class="small err">'+esc(x.code==='NO_API'?'지금은 빈 시간을 불러올 수 없습니다. 카카오톡으로 문의해 주세요.':x.message)+'</p>'; });
  }
  function drawTimes(){
    var day=st.days.filter(function(d){ return d.date===st.date; })[0], box=$('#vs-times'); if(!day){ box.innerHTML=''; return; }
    $('#vs-times-note').textContent=kdate(st.date)+' — 행사(확정 예약)가 있는 시간은 고를 수 없어요. 다른 팀 답사와는 겹쳐도 괜찮습니다.';
    box.innerHTML=day.slots.map(function(s){ return '<button type="button" class="vs-time'+(s.time===st.time?' on':'')+'" data-time="'+s.time+'"'+(s.ok?'':' disabled title="'+esc(WHY[s.why]||'불가')+'"')+'><b>'+s.time+'</b>'+(s.ok?'':'<small>'+esc(WHY[s.why]||'불가')+'</small>')+'</button>'; }).join('');
    box.querySelectorAll('.vs-time:not([disabled])').forEach(function(b){ b.addEventListener('click',function(){ st.time=b.dataset.time; box.querySelectorAll('.vs-time').forEach(function(x){ x.classList.toggle('on',x===b); }); drawSum(); if(window.innerWidth<900) $('#vs-form').scrollIntoView({behavior:'smooth',block:'start'}); }); });
  }
  function submit(e){
    e.preventDefault(); var er=$('#vs-err'); er.hidden=true;
    var name=$('#vs-name').value.trim(), phone=$('#vs-phone').value.trim();
    var msg=!st.space?'답사할 공간을 골라 주세요.':!st.date||!st.time?'날짜와 시간을 골라 주세요.':!name?'이름을 적어 주세요.':!/^01\d{8,9}$/.test(phone.replace(/\D/g,''))?'휴대폰 번호를 확인해 주세요.':!$('#vs-agree').checked?'개인정보 수집·이용에 동의해 주세요.':'';
    if(msg){ er.textContent=msg; er.hidden=false; return; }
    var b=$('#vs-go'); b.disabled=true; b.textContent='신청하는 중…';
    var body={space:st.space,date:st.date,time:st.time,name:name,phone:phone,people:+$('#vs-people').value,purpose:$('#vs-purpose').value,event_date:$('#vs-event').value,headcount:+$('#vs-head').value||null,memo:$('#vs-memo').value.trim(),agree:true,website:$('#vs-hp').value};
    M.api('/visit/request',{method:'POST',body:body}).then(function(j){
      var s=SP.filter(function(x){ return x[0]===st.space; })[0];
      keep({ref:j.ref,k:j.k,date:st.date,time:st.time,label:(s?s[1]:'')+' 사전답사'});
      location.hash='ref='+encodeURIComponent(j.ref)+'&k='+encodeURIComponent(j.k)+'&new=1';
    }).catch(function(x){
      er.textContent=x.code==='NO_API'?'지금은 온라인 신청을 받을 수 없습니다. 카카오톡이나 전화로 문의해 주세요.':x.message; er.hidden=false; b.disabled=false; b.innerHTML='사전답사 신청하기 <span class="arrow">→</span>';
      if(x.code==='SLOT_TAKEN'){ st.time=''; drawSum(); loadDays(); }
    });
  }

  // ---------- 신청 뒤 화면 ----------
  function showMine(ref,k,isNew){
    root.innerHTML='<div class="card">불러오는 중…</div>';
    M.api('/visit/view?ref='+encodeURIComponent(ref)+'&k='+encodeURIComponent(k)).then(function(j){ drawMine(j.item,ref,k,isNew); })
      .catch(function(x){ root.innerHTML='<div class="card"><p>'+esc(x.message||'불러오지 못했습니다.')+'</p><a class="btn btn-light btn-sm mt-2" href="/visit/">새로 신청하기</a></div>'; });
  }
  function drawMine(v,ref,k,isNew){
    var active=v.status==='requested'||v.status==='scheduled';
    keep({ref:ref,k:k,date:v.date,time:v.time,label:v.space_label+' 사전답사'});
    var lead=v.status==='requested'?'신청을 받았습니다. 운영팀이 일정을 확인한 뒤 확정해 드릴게요. 확정되면 이 화면과 연락드린 번호로 안내합니다.'
      :v.status==='scheduled'?'사전답사가 확정되었습니다. 도착하시면 2층 입구에서 연락 주세요.'
      :v.status==='cancelled'?'취소된 사전답사입니다. 다른 날짜가 필요하시면 새로 신청해 주세요.':'방문해 주셔서 감사합니다.';
    root.innerHTML=(isNew?'<div class="notice vs-done"><b>사전답사 신청이 접수되었습니다.</b> 이 화면 주소를 저장해 두시면 진행 상황을 다시 볼 수 있어요.</div>':'')
      +'<div class="vs-grid"><div class="vs-steps">'
      +'<section class="card vs-view"><div class="vs-view-top"><div><div class="eyebrow">Site visit · '+esc(v.ref)+'</div><h2 class="vs-view-h">'+esc(v.space_label)+' 사전답사</h2></div><em class="mb-chip vs-st-'+esc(v.status)+'">'+esc(v.status_label)+'</em></div>'
        +'<p class="mt-2">'+esc(lead)+'</p>'
        +'<dl class="vs-dl mt-2"><div><dt>일시</dt><dd>'+esc(kdate(v.date))+' '+esc(v.time)+' <small class="muted">(약 '+(v.duration||30)+'분)</small></dd></div><div><dt>신청하신 분</dt><dd>'+esc(v.name)+(v.people?' · '+v.people+'명':'')+'</dd></div>'+(v.purpose||v.event_date||v.headcount?'<div><dt>행사</dt><dd>'+esc([v.purpose,v.event_date?kdate(v.event_date):'',v.headcount?v.headcount+'명':''].filter(Boolean).join(' · '))+'</dd></div>':'')+'</dl>'
        +'<div class="vs-view-acts">'+(active?'<a class="btn btn-primary btn-sm" href="/parking/">주차 안내</a><a class="btn btn-light btn-sm" href="/spaces/'+(v.space==='megaspot-gundae-2'?'megaspot-gundae-2':'megaspot-gundae')+'/#access">오시는 길</a>':'<a class="btn btn-primary btn-sm" href="/visit/">새로 신청하기</a>')+'<a class="btn btn-kakao btn-sm" href="'+esc(KAKAO)+'" target="_blank" rel="noopener">카톡문의</a>'+(active?'<button type="button" class="btn btn-ghost btn-sm" id="vs-cancel">답사 취소</button>':'')+'</div>'
      +'</section>'
      +'<section class="card vs-chat"><h3 class="h-s">운영팀과 주고받은 글</h3><div class="vs-msgs" id="vs-msgs">'+msgsHtml(v.messages)+'</div>'
        +(active?'<form id="vs-msg-form" class="vs-msg-form"><label class="sr-only" for="vs-msg">운영팀에 남길 글</label><textarea class="textarea" id="vs-msg" rows="2" maxlength="1000" placeholder="시간 변경, 주차, 함께 오시는 분 등 궁금한 점을 남겨 주세요."></textarea><button class="btn btn-primary btn-sm" type="submit">보내기</button></form><p class="tiny muted">운영팀 답글은 이 화면에 표시됩니다. 급한 일은 카카오톡이 더 빠릅니다.</p>':'')
      +'</section></div>'
      +'<aside class="vs-side"><div class="card vs-help"><b>메가스팟 건대 · 한아름건물 2층</b><p class="small muted mt-1">서울 광진구 화양동 10-1. 지하철 2·7호선 건대입구역 인근이고 건물 주차장을 이용할 수 있습니다(유료).</p></div>'
        +'<div class="card vs-help"><b>예약까지 이어서 보시려면</b><div class="vs-help-row mt-1"><a class="btn btn-light btn-sm" href="/inquiry/'+(v.space&&v.space!=='both'?'?space='+v.space:'')+'">예약/견적 문의</a><a class="btn btn-ghost btn-sm" href="/help/?q=답사">자주 묻는 질문</a></div></div>'
        +'<div class="card vs-help"><button type="button" class="linkish small" id="vs-forget">이 기기에서 이 신청 지우기</button></div></aside></div>';
    var mf=$('#vs-msg-form'); if(mf) mf.addEventListener('submit',function(e){ e.preventDefault(); var t=$('#vs-msg').value.trim(); if(!t) return; var b=mf.querySelector('button'); b.disabled=true;
      M.api('/visit/message',{method:'POST',body:{ref:ref,k:k,body:t}}).then(function(j){ $('#vs-msgs').innerHTML=msgsHtml(j.item.messages); $('#vs-msg').value=''; b.disabled=false; }).catch(function(x){ M.toast(x.message||'보내지 못했습니다.'); b.disabled=false; }); });
    var cb=$('#vs-cancel'); if(cb) cb.addEventListener('click',function(){ if(!window.confirm('사전답사를 취소할까요?')) return; cb.disabled=true;
      M.api('/visit/cancel',{method:'POST',body:{ref:ref,k:k}}).then(function(j){ drawMine(j.item,ref,k,false); M.toast('사전답사를 취소했습니다.'); }).catch(function(x){ M.toast(x.message||'취소하지 못했습니다.'); cb.disabled=false; }); });
    $('#vs-forget').addEventListener('click',function(){ forget(ref); location.hash=''; });
  }
  function msgsHtml(list){
    if(!list||!list.length) return '<p class="small muted">아직 주고받은 글이 없습니다.</p>';
    return list.map(function(m){ return '<div class="vs-msg vs-msg-'+esc(m.sender)+'"><small>'+(m.sender==='admin'?'메가스팟 운영팀':'나')+' · '+esc(kst(m.at))+'</small><p>'+esc(m.body)+'</p></div>'; }).join('');
  }

  function route(){
    var h=new URLSearchParams(location.hash.slice(1));
    if(h.get('ref')&&h.get('k')) return showMine(h.get('ref'),h.get('k'),h.get('new')==='1');
    showForm();
  }
  window.addEventListener('hashchange',route);
  route();
})();
