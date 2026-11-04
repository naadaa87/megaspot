/* Keep focused fields and scrollable dialogs inside the visible mobile viewport. */
(function(){
  'use strict';
  function init(){
    if(document.body.classList.contains('page-admin'))return;
    var root=document.documentElement,vv=window.visualViewport,queued=false,reveal=false,open=false;
    function field(){var e=document.activeElement;return e&&(e.isContentEditable||e.matches('textarea,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset])'))?e:null;}
    function set(name,value){if(root.style.getPropertyValue(name)!==value)root.style.setProperty(name,value);}
    function bringIntoView(e,top,bottom){
      var r=e.getBoundingClientRect(),header=document.querySelector('.site-header');
      if(header&&/fixed|sticky/.test(getComputedStyle(header).position))top=Math.max(top,header.getBoundingClientRect().bottom+12);
      var delta=r.top<top?r.top-top:r.bottom>bottom?Math.min(r.top-top,r.bottom-bottom):0;
      if(Math.abs(delta)<1)return;
      // Consume scrolling in the dialog first, then in the document.
      for(var p=e.parentElement;p&&p!==document.body;p=p.parentElement){
        if(/auto|scroll/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight){
          var before=p.scrollTop;p.scrollBy({top:delta,behavior:'instant'});delta-=p.scrollTop-before;
          if(Math.abs(delta)<1)return;
        }
      }
      window.scrollBy({top:delta,behavior:'instant'});
    }
    function update(){
      queued=false;
      var mobile=matchMedia('(max-width:999px)').matches,scaled=vv&&Math.abs(vv.scale-1)>.05;
      var height=mobile&&!scaled&&vv?vv.height:innerHeight,top=mobile&&!scaled&&vv?vv.offsetTop:0;
      var inset=mobile&&!scaled?Math.max(0,document.documentElement.clientHeight-height):0,e=field();
      open=mobile&&!scaled&&inset>120&&!!(e||open);
      set('--mobile-visible-height',height+'px');set('--mobile-visible-top',top+'px');set('--mobile-keyboard-inset',open?Math.ceil(inset)+'px':'0px');
      root.classList.toggle('mobile-keyboard-open',open);
      if(reveal&&mobile&&!scaled&&e){requestAnimationFrame(function(){if(document.activeElement===e)bringIntoView(e,top+12,top+height-16);});}
      reveal=false;
    }
    function schedule(show){reveal=reveal||show===true;if(!queued){queued=true;requestAnimationFrame(update);}}
    document.addEventListener('focusin',function(){schedule(true);});
    document.addEventListener('focusout',function(){schedule(false);});
    window.addEventListener('resize',function(){schedule(true);});
    if(vv){vv.addEventListener('resize',function(){schedule(true);});vv.addEventListener('scroll',function(){schedule(false);});}
    schedule(false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
