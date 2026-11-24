/* 회원 편의 기능 화면 (2026-11-25) — 로그인 · 회원가입 · 비밀번호 재설정 · 마이페이지
   · 카카오 간편 로그인 단추 (서버에 카카오 키가 있을 때만 보임)
   · 비밀번호 재설정 메일 받기 (메일 발송이 연결되어 있을 때만, 아니면 기존 카카오톡 안내)
   · 카카오로 처음 오신 분 가입 마무리 (/signup/?kakao=1#k=…)
   · 마이페이지: 예약 직접 연결(이용일 또는 예약번호 + 휴대폰 뒷 4자리), 카카오 연결
   기존 account.js 는 그대로 두고 이 파일이 더합니다. */
(function(){
  var M=window.MEGASPOT; if(!M) return;
  var $=M.$, esc=M.esc, body=document.body, q=new URLSearchParams(location.search);
  var KAKAO_ICON='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3.2C6.6 3.2 2.3 6.6 2.3 10.9c0 2.7 1.8 5.1 4.5 6.5l-.9 3.4c-.1.3.3.6.6.4l4-2.6c.5.1 1 .1 1.5.1 5.4 0 9.7-3.4 9.7-7.8S17.4 3.2 12 3.2z"/></svg>';
  var providers=M.api('/auth/providers').catch(function(){ return {kakao:false,reset_email:false}; });
  function next(){ var n=q.get('next'); return n&&/^\/(?!\/)/.test(n)?n:'/mypage/'; }
  function kakaoBtn(label,href){ return '<a class="btn btn-kakao btn-lg ax-kakao" href="'+esc(href)+'">'+KAKAO_ICON+esc(label)+'</a>'; }
  var KMSG={off:'카카오 로그인은 아직 준비 중입니다. 이메일로 로그인해 주세요.',cancel:'카카오 로그인을 취소하셨습니다.',fail:'카카오 로그인을 마치지 못했습니다. 다시 시도해 주세요.',suspended:'이용이 제한된 계정입니다. 운영팀에 문의해 주세요.'};

  // ---------- 로그인 ----------
  var li=$('#login-form');
  if(li){
    providers.then(function(p){
      if(p.kakao) li.insertAdjacentHTML('afterbegin','<div class="ax-social">'+kakaoBtn('카카오로 로그인','/api/auth/kakao/start?next='+encodeURIComponent(next()))+'<div class="ax-or"><span>또는 이메일로 로그인</span></div></div>');
      if(q.get('kakao')&&KMSG[q.get('kakao')]) li.insertAdjacentHTML('afterbegin','<div class="notice">'+esc(KMSG[q.get('kakao')])+'</div>');
      var box=$('#li-forgot-box');
      if(p.reset_email&&box){
        box.innerHTML='<div style="width:100%"><b>비밀번호 재설정</b><p class="small mt-1">가입한 이메일을 넣으면 새 비밀번호를 정하는 링크를 보내 드립니다.</p><div class="ax-reset-row mt-1"><input class="input" type="email" id="ax-reset-email" placeholder="가입한 이메일" autocomplete="email"><button type="button" class="btn btn-primary btn-sm" id="ax-reset-go">링크 받기</button></div><p class="small mt-1" id="ax-reset-msg" hidden></p></div>';
        $('#ax-reset-go').addEventListener('click',function(){ var e=$('#ax-reset-email').value.trim(), msg=$('#ax-reset-msg'), b=this; if(!e){ $('#ax-reset-email').focus(); return; } b.disabled=true;
          M.api('/auth/reset-request',{method:'POST',body:{email:e}}).then(function(r){ msg.textContent=r.message; msg.hidden=false; }).catch(function(x){ msg.textContent=x.message; msg.hidden=false; }).then(function(){ b.disabled=false; }); });
        var em=$('#li-email'); if(em&&em.value) $('#ax-reset-email').value=em.value;
      }
    });
  }

  // ---------- 회원가입 ----------
  var su=$('#signup-form');
  if(su){
    var h=new URLSearchParams(location.hash.slice(1)), ktoken=q.get('kakao')==='1'?h.get('k'):'';
    if(ktoken){
      // 카카오로 처음 오신 분: 비밀번호 칸 없이 연락처·약관만
      try{ history.replaceState(null,'',location.pathname+'?kakao=1'); }catch(e){}
      ['#su-pw','#su-pw2'].forEach(function(id){ var x=$(id); if(x){ x.required=false; var row=x.closest('.f'); if(row) row.hidden=true; } });
      su.insertAdjacentHTML('afterbegin','<div class="notice ax-kakao-note"><div><b>카카오로 시작하기</b><br>마지막으로 연락처와 약관 동의만 확인해 주세요. 비밀번호 없이 다음부터 카카오로 로그인할 수 있습니다.</div></div>');
      M.api('/auth/kakao/pending?k='+encodeURIComponent(ktoken)).then(function(p){ if(p.email&&!$('#su-email').value) $('#su-email').value=p.email; if(p.name&&!$('#su-name').value) $('#su-name').value=p.name; })
        .catch(function(x){ su.insertAdjacentHTML('afterbegin','<div class="err">'+esc(x.message)+' <a href="/login/" style="text-decoration:underline">로그인 화면으로</a></div>'); });
      su.addEventListener('submit',function(e){
        e.preventDefault(); e.stopImmediatePropagation();
        var d=M.formData(su), er=$('#su-error'); er.hidden=true;
        var btn=su.querySelector('button[type=submit]'); if(btn) btn.disabled=true;
        M.api('/auth/kakao/complete',{method:'POST',body:{token:ktoken,email:d.email,name:d.name,phone:d.phone,org:d.org,agree_age:!!d.agree_age,agree_terms:!!d.agree_terms,agree_privacy:!!d.agree_privacy,agree_marketing:!!d.agree_marketing}})
          .then(function(r){ location.href=r.next||'/mypage/'; })
          .catch(function(x){ er.textContent=x.message||'가입하지 못했습니다.'; er.hidden=false; if(btn) btn.disabled=false; });
      },true);
    } else {
      providers.then(function(p){ if(p.kakao) su.insertAdjacentHTML('afterbegin','<div class="ax-social">'+kakaoBtn('카카오로 3초 만에 시작하기','/api/auth/kakao/start?next='+encodeURIComponent(next()))+'<div class="ax-or"><span>또는 이메일로 가입</span></div></div>'); });
    }
  }

  // ---------- 비밀번호 재설정 화면 ----------
  var rs=$('#reset-form');
  if(rs){
    var t=new URLSearchParams(location.hash.slice(1)).get('t')||'';
    try{ history.replaceState(null,'',location.pathname); }catch(e){}
    if(!t){ $('#rs-error').textContent='링크가 올바르지 않습니다. 로그인 화면에서 재설정 메일을 다시 받아 주세요.'; $('#rs-error').hidden=false; }
    rs.addEventListener('submit',function(e){
      e.preventDefault(); var a=$('#rs-pw').value, b=$('#rs-pw2').value, er=$('#rs-error'); er.hidden=true;
      if(!(a.length>=8&&/[A-Za-z]/.test(a)&&/\d/.test(a))){ er.textContent='비밀번호는 8자 이상, 영문과 숫자를 함께 넣어 주세요.'; er.hidden=false; return; }
      if(a!==b){ er.textContent='비밀번호 확인이 일치하지 않습니다.'; er.hidden=false; return; }
      M.api('/auth/reset',{method:'POST',body:{token:t,password:a}}).then(function(){ location.href='/mypage/?reset=1'; }).catch(function(x){ er.textContent=x.message; er.hidden=false; });
    });
  }

  // ---------- 마이페이지 ----------
  var my=$('#my-app');
  if(my){
    var side=my.querySelector('.my-grid > div:last-child'); if(!side) return;
    var card=document.createElement('div'); card.className='card ax-link';
    card.innerHTML='<h2 class="h-s">예약 연결하기</h2><p class="small muted mt-1">전화·카카오톡으로 하신 예약이나 로그인 전에 신청한 예약도 이 계정에 연결해 두면 ‘나의 예약확인’에서 바로 열립니다. 예약 자료는 바뀌지 않습니다.</p>'
      +'<form class="form mt-2" id="ax-link-form" novalidate><div class="field-row"><div class="f"><label for="ax-date">이용일</label><input class="input" type="date" id="ax-date"></div><div class="f"><label for="ax-l4">휴대폰 뒷 4자리</label><input class="input" id="ax-l4" inputmode="numeric" maxlength="4"></div></div>'
      +'<div class="f"><label for="ax-code">또는 예약번호 <span class="muted">(선택)</span></label><input class="input" id="ax-code" maxlength="20" placeholder="예: MS-2612-AB12"></div>'
      +'<p class="small" id="ax-link-msg" hidden></p><button class="btn btn-primary btn-sm" type="submit">연결하기</button> <a class="btn btn-light btn-sm" href="/my-booking/">나의 예약확인</a></form>'
      +'<div class="ax-social-my mt-3" id="ax-social-my" hidden></div>';
    side.insertBefore(card, side.children[1]||null);
    $('#ax-l4').addEventListener('input',function(){ this.value=this.value.replace(/\D/g,'').slice(0,4); });
    $('#ax-link-form').addEventListener('submit',function(e){
      e.preventDefault(); var msg=$('#ax-link-msg'), b=this.querySelector('button'), code=$('#ax-code').value.trim().toUpperCase();
      var bodyD={phone_last4:$('#ax-l4').value}; if(code) bodyD.booking_code=code; else bodyD.date=$('#ax-date').value;
      b.disabled=true;
      M.api('/auth/link-booking',{method:'POST',body:bodyD}).then(function(r){ msg.innerHTML='예약 '+r.linked+'건을 연결했습니다. <a href="/my-booking/" style="text-decoration:underline">나의 예약확인에서 보기</a>'; msg.className='small ok'; msg.hidden=false; this && 0; })
        .catch(function(x){ msg.textContent=x.message; msg.className='small err'; msg.hidden=false; }).then(function(){ b.disabled=false; });
    });
    if(q.get('reset')==='1') M.toast&&M.toast('새 비밀번호로 바꿨습니다.');
    var KM={linked:'카카오 계정을 연결했습니다. 다음부터 카카오로 로그인할 수 있습니다.',taken:'그 카카오 계정은 다른 회원 계정에 이미 연결되어 있습니다.'};
    M.api('/auth/social').then(function(r){
      if(r.password_set===false){   // 카카오로만 가입: 비밀번호 대신 '탈퇴' 입력, 비밀번호 바꾸기 대신 안내
        var wd=$('#my-withdraw'), pwIn=wd&&wd.querySelector('input[type=password]'); if(pwIn){ pwIn.type='text'; pwIn.placeholder='탈퇴'; var lb=wd.querySelector('label[for="'+pwIn.id+'"]'); if(lb) lb.textContent='확인을 위해 ‘탈퇴’라고 입력해 주세요'; }
        var pf=$('#my-password'); if(pf) pf.innerHTML='<h2 class="h-s">비밀번호</h2><p class="small muted mt-1">카카오로 가입해 비밀번호가 없습니다. 이메일로도 로그인하려면 로그인 화면의 ‘비밀번호를 잊으셨나요?’에서 재설정 메일을 받아 비밀번호를 정해 주세요.</p>';
      }
      var box=$('#ax-social-my'); if(!r.kakao_ready) return;
      var on=(r.items||[]).some(function(x){ return x.provider==='kakao'; });
      box.hidden=false; box.innerHTML='<b class="small">간편 로그인</b><p class="small muted mt-1">'+(on?'카카오 계정이 연결되어 있습니다.':'카카오 계정을 연결하면 다음부터 비밀번호 없이 로그인할 수 있어요.')+'</p>'+(on?'':kakaoBtn('카카오 연결하기','/api/auth/kakao/start?link=1&next=/mypage/'))+(q.get('kakao')&&KM[q.get('kakao')]?'<p class="small mt-1">'+esc(KM[q.get('kakao')])+'</p>':'');
    }).catch(function(){});
  }
})();
