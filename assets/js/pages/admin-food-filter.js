/* Non-sensitive reservation filters shared by calendar, bookings and daily views. */
(function(){
 'use strict';
 var groups=[
  {key:'megaspot.admin.food-filter.v1',allowed:['','confirmed','catering','reception','cocktail'],ids:['bk-service-filter','rs-service-filter','cal-service-filter']},
  {key:'megaspot.admin.space-filter.v1',allowed:['','megaspot-gundae','megaspot-gundae-2'],ids:['bk-space-filter','rs-space','cal-filter']}
 ];
 function valid(group,value){return group.allowed.indexOf(value)>=0?value:'';}
 function apply(group,value){value=valid(group,value);group.controls.forEach(function(control){control.value=value;});return value;}
 groups.forEach(function(group){group.controls=group.ids.map(function(id){return document.getElementById(id);}).filter(Boolean);var initial='';try{initial=localStorage.getItem(group.key)||'';}catch(e){}apply(group,initial);});
 function reset(){
  groups.forEach(function(group){apply(group,'');try{localStorage.setItem(group.key,'');}catch(e){}});
  var period=window.MEGASPOT_RESERVATION_PERIOD;if(period)period.set(new Date(Date.now()+9*3600e3).toISOString().slice(0,7));
  var X=window.MEGASPOT_ADMIN,view=document.querySelector('.adm-view:not([hidden])');if(X&&view&&['view-bookings','view-resv','view-calendar'].indexOf(view.id)>=0)X.loadView(view.id.slice(5));
  if(window.MEGASPOT&&window.MEGASPOT.toast)window.MEGASPOT.toast('이번 달 · 전체 호점 · 전체 식음료로 초기화했습니다.');
 }
 window.MEGASPOT_RESERVATION_FILTERS={reset:reset};
 document.addEventListener('click',function(e){if(!e.target.closest('[data-reservation-filter-reset]'))return;e.preventDefault();reset();});
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
