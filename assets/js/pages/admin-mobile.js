/* Fit all admin drawers and dialogs to the visible viewport, including keyboards. */
(function(){
 'use strict';
 if(!document.body.classList.contains('page-admin'))return;
 var root=document.documentElement,vv=window.visualViewport,queued=false,reveal=false;
 function update(){
  queued=false;
  var mobile=matchMedia('(max-width:767px), (pointer:coarse) and (max-height:600px)').matches;
  if(!mobile||vv&&Math.abs(vv.scale-1)>.05){root.style.removeProperty('--adm-visible-height');root.style.removeProperty('--adm-visible-top');reveal=false;return;}
  root.style.setProperty('--adm-visible-height',(vv?vv.height:innerHeight)+'px');
  root.style.setProperty('--adm-visible-top',(vv?vv.offsetTop:0)+'px');
  var e=document.activeElement;
  if(reveal&&e&&e.matches('input,select,textarea')&&e.closest('.adm-drawer:not([hidden]),dialog[open]')){
   requestAnimationFrame(function(){if(document.activeElement!==e)return;var r=e.getBoundingClientRect(),top=(vv?vv.offsetTop:0)+12,bottom=top+(vv?vv.height:innerHeight)-28;if(r.top<top||r.bottom>bottom)e.scrollIntoView({block:'nearest',behavior:'instant'});});
  }
  reveal=false;
 }
 function schedule(show){reveal=reveal||show===true;if(!queued){queued=true;requestAnimationFrame(update);}}
 document.addEventListener('focusin',function(){schedule(true);});
 window.addEventListener('resize',function(){schedule(true);});
 if(vv){vv.addEventListener('resize',function(){schedule(true);});vv.addEventListener('scroll',function(){schedule(false);});}
 schedule(false);
})();
