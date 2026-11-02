(function(){
  'use strict';
  var M=window.MEGASPOT;
  if(!M||!M.openLightbox)return;
  document.querySelectorAll('[data-event-gallery]').forEach(function(gallery){
    var links=Array.from(gallery.querySelectorAll('[data-event-photo]'));
    gallery.addEventListener('click',function(e){
      var link=e.target.closest('[data-event-photo]');
      if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
      e.preventDefault();
      M.openLightbox(links.map(function(a){return {src:a.href,title:a.dataset.title,cap:'실제 행사 현장 · 참석자 얼굴 모자이크 및 밝기 보정'};}),links.indexOf(link));
    });
  });
})();
