(function(){
  'use strict';
  var M=window.MEGASPOT, url='https://megaspot.kr/parking/', address='서울 광진구 능동로13길 39, 한아름건물 2층';
  function copy(text, message){
    return (navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(function(){ M.toast(message); }).catch(function(){ window.prompt('아래 내용을 복사해 주세요.', text); });
  }
  document.querySelector('#parking-share').addEventListener('click', function(){
    if(navigator.share){ navigator.share({title:'메가스팟 건대 주차 안내',text:'건물 1층·4층 주차 · 차량번호 등록 시 최초 1시간 무료',url:url}).catch(function(e){ if(e.name!=='AbortError') copy(url,'주차 안내 링크를 복사했습니다.'); }); }
    else copy(url,'주차 안내 링크를 복사했습니다. 참석자에게 보내 주세요.');
  });
  document.querySelector('#parking-copy-address').addEventListener('click', function(){ copy(address,'메가스팟 주소를 복사했습니다.'); });
})();
