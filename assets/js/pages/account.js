/* 회원가입 · 로그인 · 마이페이지 */
(function(){
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc;
  var PUR={}; (window.MEGASPOT_PURPOSES||[]).forEach(function(p){ PUR[p.id]=p.label; });
  var STEPS=['문의 접수','조건 확인','견적 발송','결제 대기','예약 확정','이용 완료'];
  var TYPE={event:'행사 대관',regular:'정기·반복 모임',partner:'제휴·협력'};
  var SPACE={'megaspot-gundae':'메가스팟 건대', request:'맞춤 공간 요청'};

  function nextUrl(){
    var n=new URLSearchParams(location.search).get('next')||'';
    return /^\/(?!\/)/.test(n) ? n : '/mypage/';   // 같은 사이트 안의 주소만 허용
  }
  function showErr(el, msg){ el.textContent=msg; el.hidden=false; }
  function busy(btn, on, label){ btn.disabled=on; if(on){ btn.dataset.label=btn.innerHTML; btn.textContent=label||'처리 중…'; } else if(btn.dataset.label){ btn.innerHTML=btn.dataset.label; } }
  function pwOk(p){ return p.length>=8 && /[A-Za-z]/.test(p) && /\d/.test(p); }
  function phoneFmt(el){ el.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; }); }
  function offline(form){ var n=$('#acc-offline'); if(n) n.hidden=false; $$('input,button', form).forEach(function(el){ if(!el.closest('#acc-offline')) el.disabled=true; }); }

  /* ---------- 회원가입 ---------- */
  var su=$('#signup-form');
  if(su){
    var nx=new URLSearchParams(location.search).get('next'); if(nx) $('#su-to-login').href='/login/?next='+encodeURIComponent(nx);
    if(M.account.loggedIn()){ M.account.me().then(function(m){ if(m) location.replace(nextUrl()); }); }
    M.checkApi().then(function(live){ if(!live) offline(su); });
    phoneFmt($('#su-phone'));
    var all=$('#su-all'), boxes=$$('.agree-box input[type=checkbox]:not(#su-all)', su);
    all.addEventListener('change', function(){ boxes.forEach(function(b){ b.checked=all.checked; b.classList.remove('invalid'); }); });
    boxes.forEach(function(b){ b.addEventListener('change', function(){ all.checked=boxes.every(function(x){ return x.checked; }); }); });
    su.addEventListener('submit', function(e){
      e.preventDefault(); var er=$('#su-error'); er.hidden=true;
      if(!M.validate(su)) return showErr(er,'필수 항목과 동의 여부를 확인해 주세요.');
      var d=M.formData(su);
      if(!pwOk(d.password)){ $('#su-pw').classList.add('invalid'); $('#su-pw').focus(); return showErr(er,'비밀번호는 8자 이상, 영문과 숫자를 함께 넣어 주세요.'); }
      if(d.password!==d.password2){ $('#su-pw2').classList.add('invalid'); $('#su-pw2').focus(); return showErr(er,'비밀번호 확인이 일치하지 않습니다.'); }
      delete d.password2; ['agree_age','agree_terms','agree_privacy','agree_marketing'].forEach(function(k){ d[k]=!!d[k]; });
      var btn=$('#su-submit'); busy(btn,true,'가입하는 중…');
      M.api('/auth/signup',{method:'POST', body:d}).then(function(){ M.toast('가입을 마쳤습니다. 환영합니다!'); location.href=nextUrl(); })
      .catch(function(x){ busy(btn,false); if(x.code==='NO_API') { offline(su); return showErr(er,'지금은 회원가입을 할 수 없습니다. 예약 신청이나 카카오톡으로 문의해 주세요.'); }
        showErr(er, x.message||'가입하지 못했습니다. 잠시 후 다시 시도해 주세요.'); if(x.code==='EMAIL_TAKEN'){ er.innerHTML=esc(x.message)+' <a href="/login/" style="text-decoration:underline;font-weight:700">로그인하기</a>'; } });
    });
  }

  /* ---------- 로그인 ---------- */
  var li=$('#login-form');
  if(li){
    var nx2=new URLSearchParams(location.search).get('next'); if(nx2) $('#li-to-signup').href='/signup/?next='+encodeURIComponent(nx2);
    if(M.account.loggedIn()){ M.account.me().then(function(m){ if(m) location.replace(nextUrl()); }); }
    M.checkApi().then(function(live){ if(!live) offline(li); });
    $('#li-forgot').addEventListener('click', function(){ var b=$('#li-forgot-box'); b.hidden=!b.hidden; });
    li.addEventListener('submit', function(e){
      e.preventDefault(); var er=$('#li-error'); er.hidden=true;
      if(!M.validate(li)) return showErr(er,'이메일과 비밀번호를 입력해 주세요.');
      var btn=$('#li-submit'); busy(btn,true,'확인 중…');
      M.api('/auth/login',{method:'POST', body:M.formData(li)}).then(function(){ location.href=nextUrl(); })
      .catch(function(x){ busy(btn,false); if(x.code==='NO_API'){ offline(li); return showErr(er,'지금은 로그인할 수 없습니다.'); } showErr(er, x.message||'로그인하지 못했습니다.'); });
    });
  }

  /* ---------- 마이페이지 ---------- */
  var app=$('#my-app');
  if(app){
    M.checkApi().then(function(live){
      if(!live){ $('#my-offline').hidden=false; $('#my-logout').hidden=true; return; }
      M.api('/auth/me').then(function(j){
        var m=j.member; if(!m){ location.replace('/login/?next=/mypage/'); return; }
        app.hidden=false; fillProfile(m); loadInquiries();
      }).catch(function(){ location.replace('/login/?next=/mypage/'); });
    });
    $('#my-logout').addEventListener('click', function(){ M.account.logout().then(function(){ location.href='/'; }); });
    phoneFmt($('#mp-phone'));

    function fillProfile(m){
      $('#my-hello').textContent=m.name+'님의 마이페이지';
      $('#my-sub').textContent='가입일 '+String(m.created_at||'').slice(0,10)+' · '+m.email;
      $('#mp-email').value=m.email; $('#mp-name').value=m.name; $('#mp-phone').value=m.phone; $('#mp-org').value=m.org; $('#mp-mkt').checked=!!m.agree_marketing;
    }
    function steps(st){
      if(st==='취소·환불') return '<div class="my-steps"><span class="cancel">취소·환불</span></div>';
      var at=STEPS.indexOf(st);
      return '<ol class="my-steps">'+STEPS.map(function(s,i){ return '<li class="'+(i<at?'done':i===at?'now':'')+'">'+s+'</li>'; }).join('')+'</ol>';
    }
    function loadInquiries(){
      M.api('/auth/inquiries').then(function(j){
        var list=j.items||[]; $('#my-count').textContent=list.length?list.length+'건':'';
        if(!list.length){ $('#my-inquiries').innerHTML='<div class="empty"><b>아직 회원으로 보낸 예약 신청·문의가 없습니다</b><p class="small muted mt-1">시간·날짜·인원을 골라 금액을 확인하고 그 자리에서 예약을 신청해 보세요.</p><div class="row mt-2" style="justify-content:center;gap:8px"><a class="btn btn-primary btn-sm" href="/inquiry/">예약 신청 · 금액 확인</a><a class="btn btn-light btn-sm" href="/inquiry/?type=regular">정기 모임 상담</a></div></div>'; return; }
        $('#my-inquiries').innerHTML=list.map(function(it){
          var hl=function(h){ return (h>=24?'다음 날 ':'')+('0'+(h%24)).slice(-2)+':00'; }; var when=[it.date?M.fmtKDate(it.date):'', (it.start_h&&it.end_h)?hl(+it.start_h)+'–'+hl(+it.end_h)+' ('+(it.end_h-it.start_h)+'시간)':((it.t_start&&it.t_end)?it.t_start+'–'+it.t_end:''), it.headcount?it.headcount+'명':'', it.total?'예상 '+Number(it.total).toLocaleString('ko-KR')+'원':''].filter(Boolean).join(' · ');
          return '<div class="card pad-s my-inq"><div class="row between"><div class="row" style="gap:8px"><b class="ref">'+esc(it.ref)+'</b><span class="badge badge-soft">'+esc(it.reserve?'예약 신청':(TYPE[it.inquiry_type]||'문의'))+'</span>'+(it.purpose&&PUR[it.purpose]?'<span class="badge badge-cobalt">'+esc(PUR[it.purpose])+'</span>':'')+'</div><span class="small muted">'+esc(String(it.created_at||'').slice(0,10))+' 접수</span></div>'
            + '<div class="small mt-1"><b>'+esc(SPACE[it.space_id]||it.space_id)+'</b>'+(when?' · '+esc(when):'')+'</div>'
            + steps(it.status)
            + (it.estimate?'<details class="mt-2"><summary class="small" style="cursor:pointer;color:var(--cobalt);font-weight:700">함께 보낸 예상 금액</summary><pre class="my-est">'+esc(it.estimate)+'</pre></details>':'')
            + '</div>';
        }).join('');
      }).catch(function(x){ $('#my-inquiries').innerHTML='<div class="empty">'+esc(x.message||'문의 목록을 불러오지 못했습니다.')+'</div>'; });
    }
    function note(id, msg, ok){ var n=$(id); n.textContent=msg; n.hidden=false; n.classList.toggle('ok', !!ok); }
    $('#my-profile').addEventListener('submit', function(e){
      e.preventDefault(); var f=e.target; if(!M.validate(f)) return;
      var d={ name:$('#mp-name').value, phone:$('#mp-phone').value, org:$('#mp-org').value, agree_marketing:$('#mp-mkt').checked };
      M.api('/auth/me',{method:'PATCH', body:d}).then(function(j){ fillProfile(j.member); note('#mp-msg','저장했습니다.',true); }).catch(function(x){ note('#mp-msg', x.message); });
    });
    $('#my-password').addEventListener('submit', function(e){
      e.preventDefault(); var f=e.target; if(!M.validate(f)) return;
      var n=$('#pw-new').value; if(!pwOk(n)) return note('#pw-msg','새 비밀번호는 8자 이상, 영문과 숫자를 함께 넣어 주세요.');
      if(n!==$('#pw-new2').value) return note('#pw-msg','새 비밀번호 확인이 일치하지 않습니다.');
      M.api('/auth/password',{method:'POST', body:{ current:$('#pw-cur').value, next:n }}).then(function(){ f.reset(); note('#pw-msg','비밀번호를 바꿨습니다. 다른 기기에서는 다시 로그인해야 합니다.',true); }).catch(function(x){ note('#pw-msg', x.message); });
    });
    $('#my-withdraw').addEventListener('submit', function(e){
      e.preventDefault(); var f=e.target; if(!M.validate(f)) return;
      if(!confirm('정말 탈퇴할까요? 회원 정보는 바로 삭제되고 되돌릴 수 없습니다.')) return;
      M.api('/auth/withdraw',{method:'POST', body:{ password:$('#wd-pw').value }}).then(function(){ document.cookie='ms_in=; Max-Age=0; Path=/'; alert('탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.'); location.href='/'; }).catch(function(x){ note('#wd-msg', x.message); });
    });
  }
})();
