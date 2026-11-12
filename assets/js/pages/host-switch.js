/* 마이페이지 '호스트 전환' — 회원 계정으로 호스트센터를 쓰거나, 아직이면 호스트 등록 안내로 (2026-11-12)
   버튼([data-host-switch])은 /host/center/ 로 가고, 그곳에서 회원 계정에 연결된 호스트로 전환합니다. 여기서는 이름과 안내 문구만 바꿉니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT; if(!M || !M.account.loggedIn()) return;
  M.api('/hosts/status').then(function(st){
    if(!st || !st.member) return;
    document.querySelectorAll('[data-host-switch]').forEach(function(a){ a.textContent=st.host?'호스트센터로 전환':'호스트 전환'; });
    var t=document.getElementById('my-host-text');
    if(t) t.textContent=st.host?'호스트센터에서 등록한 공간과 문의·예약·정산·이용료를 관리합니다. 같은 계정이라 다시 로그인하지 않아도 됩니다.'
      :'큰 공간을 운영하고 있다면 호스트로 전환해 보세요. 이 회원 계정 그대로 공간을 등록하고, 문의·예약·정산을 호스트센터에서 관리할 수 있습니다. 등록은 무료이고 공개된 날부터 2개월은 이용료가 없습니다.';
    var c=document.getElementById('my-host-card'); if(c) c.hidden=false;
  }).catch(function(){});
})();
