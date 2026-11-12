/* 호스트센터 로그인(/host/login/)
   ① 메가스팟 회원 계정으로 로그인 → 연결된 호스트가 있으면 호스트센터, 없으면 호스트 등록 안내
   ② 회원 계정이 아니면 예전 호스트 전용 계정으로 로그인 (회원으로 로그인한 상태였다면 두 계정을 연결) */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, form=$('#hl-form'); if(!form) return;
  var next=S.qs().get('next')||'/host/center/'; if(!/^\/host\/center\/[^\s]*$/.test(next)) next='/host/center/';   // 호스트센터 안의 주소로만 돌아갑니다
  // 이미 회원으로 로그인해 있으면 바로 전환해 봅니다
  if(M.account.loggedIn()) S.hostSwitch().then(function(r){ if(r==='ok') location.replace(next); else if(r==='not_host') location.replace('/host/register/'); });
  form.addEventListener('submit', function(e){
    e.preventDefault(); var m=$('#hl-msg'); m.hidden=true; if(!M.validate(form)) return;
    var b=$('#hl-submit'); b.disabled=true;
    var cred={ email:form.elements.email.value.trim(), password:form.elements.password.value };
    function hostOnly(){ return M.api('/hosts/login', { method:'POST', body:cred }).then(function(){ location.href=next; }); }
    M.api('/auth/login', { method:'POST', body:cred }).then(function(){
      return S.hostSwitch().then(function(r){
        if(r==='ok'){ location.href=next; return; }
        if(r==='blocked') throw new Error('이용이 중지된 호스트 계정입니다. 메가스팟 운영팀에 문의해 주세요.');
        // 회원이지만 아직 호스트가 아님 — 같은 이메일·비밀번호의 예전 호스트 계정이 있으면 연결하고, 없으면 등록 안내로
        return hostOnly().catch(function(){ location.href='/host/register/'; });
      });
    }, function(x){
      if(x && (x.code==='BAD_LOGIN' || x.status===401)) return hostOnly().catch(function(){ throw x; });
      throw x;
    }).catch(function(x){ m.textContent=x.code==='NO_API'?'지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.':x.message; m.hidden=false; }).finally(function(){ b.disabled=false; });
  });
})();
