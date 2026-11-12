/* 호스트센터 로그인(/host/login/) */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, form=$('#hl-form'); if(!form) return;
  var next=S.qs().get('next')||'/host/center/'; if(!/^\/host\/center\/[^\s]*$/.test(next)) next='/host/center/';   // 호스트센터 안의 주소로만 돌아갑니다
  form.addEventListener('submit', function(e){
    e.preventDefault(); var m=$('#hl-msg'); m.hidden=true; if(!M.validate(form)) return;
    var b=$('#hl-submit'); b.disabled=true;
    M.api('/hosts/login', { method:'POST', body:{ email:form.elements.email.value.trim(), password:form.elements.password.value } }).then(function(){ location.href=next; })
      .catch(function(x){ m.textContent=x.code==='NO_API'?'지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.':x.message; m.hidden=false; }).finally(function(){ b.disabled=false; });
  });
})();
