/* Non-sensitive reservation filters shared by calendar, bookings and daily views. */
(function(){
 'use strict';
 var groups=[
  {key:'megaspot.admin.food-filter.v1',allowed:['','confirmed','catering','reception','cocktail'],ids:['bk-service-filter','rs-service-filter','cal-service-filter']},
  {key:'megaspot.admin.space-filter.v1',allowed:['','megaspot-gundae','megaspot-gundae-2'],ids:['bk-space-filter','rs-space','cal-filter']},
  {key:'megaspot.admin.status-filter.v1',allowed:['','active','confirmed','completed','cancelled','payment_review'],ids:['bk-filter','rs-status','cal-status-filter']},
  {key:'megaspot.admin.search-filter.v1',text:true,ids:['bk-q','rs-q','cal-q']},
  {key:'megaspot.admin.payment-filter.v1',allowed:['','outstanding','unpaid','reservation_paid','balance_paid','fully_paid'],ids:['bk-payment-filter','rs-payment-filter','cal-payment-filter']},
  {key:'megaspot.admin.channel-filter.v1',allowed:['','online','web','naver','spacecloud','sns','kakao','phone','email','visit','other'],ids:['bk-channel-filter','rs-ch','cal-channel-filter']}
 ];
 function valid(group,value){if(group.text)return typeof value==='string'?value.slice(0,120):'';return group.allowed.indexOf(value)>=0?value:'';}
 function apply(group,value){value=valid(group,value);group.controls.forEach(function(control){control.value=value;});return value;}
 groups.forEach(function(group){group.controls=group.ids.map(function(id){return document.getElementById(id);}).filter(Boolean);var initial='';try{initial=localStorage.getItem(group.key)||'';}catch(e){}apply(group,initial);});
 function reset(){
  groups.forEach(function(group){apply(group,'');try{localStorage.setItem(group.key,'');}catch(e){}});
  ['bk-filter','rs-status','rs-q'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var search=document.getElementById('rs-search'),hint=document.getElementById('rs-search-status'),summary=document.getElementById('rs-search-summary'),clear=document.getElementById('rs-search-clear');
  if(search&&search.classList)search.classList.remove('is-active');if(hint)hint.hidden=true;if(summary)summary.textContent='';if(clear)clear.disabled=true;
  var period=window.MEGASPOT_RESERVATION_PERIOD;if(period)period.set(new Date(Date.now()+9*3600e3).toISOString().slice(0,7));
  var X=window.MEGASPOT_ADMIN,view=document.querySelector('.adm-view:not([hidden])');if(X&&view&&['view-bookings','view-resv','view-calendar'].indexOf(view.id)>=0)X.loadView(view.id.slice(5));
  if(window.MEGASPOT&&window.MEGASPOT.toast)window.MEGASPOT.toast('이번 달 · 전체 호점 · 전체 식음료 · 전체 예약 상태 · 전체 결제 상태 · 전체 문의 경로로 초기화하고 검색어를 지웠습니다.');
 }
 window.MEGASPOT_RESERVATION_FILTERS={reset:reset};
 document.addEventListener('click',function(e){if(e.target.closest('#rs-search-clear')){var group=groups.find(function(g){return g.text;});apply(group,'');try{localStorage.setItem(group.key,'');}catch(error){}return;}if(!e.target.closest('[data-reservation-filter-reset]'))return;e.preventDefault();reset();});
 document.addEventListener('input',function(e){var group=groups.find(function(g){return g.text&&g.controls.indexOf(e.target)>=0;});if(!group)return;var value=apply(group,e.target.value);try{localStorage.setItem(group.key,value);}catch(error){}});
 document.addEventListener('change',function(e){
  var group=groups.find(function(g){return g.controls.indexOf(e.target)>=0;});if(!group)return;
  var value=apply(group,e.target.value);try{localStorage.setItem(group.key,value);}catch(error){}
 },true);
 window.addEventListener('storage',function(e){
  var changed=false;
  groups.forEach(function(group){if(e.key!==group.key&&e.key!==null)return;var value=valid(group,e.key===null?'':e.newValue);if(group.controls.some(function(control){return control.value!==value;}))changed=true;apply(group,value);});
  var X=window.MEGASPOT_ADMIN;if(!changed||!X)return;
  var view=document.querySelector('.adm-view:not([hidden])');
  if(view&&['view-bookings','view-resv','view-calendar'].indexOf(view.id)>=0)X.loadView(view.id.slice(5));
 });
})();
