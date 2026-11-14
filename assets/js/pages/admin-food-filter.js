/* One non-sensitive food-service filter shared by the three reservation views. */
(function(){
 'use strict';
 var key='megaspot.admin.food-filter.v1',allowed=['','confirmed','catering','reception','cocktail'];
 var controls=['bk-service-filter','rs-service-filter','cal-service-filter'].map(function(id){return document.getElementById(id);}).filter(Boolean);
 function valid(value){return allowed.indexOf(value)>=0?value:'';}
 function apply(value){value=valid(value);controls.forEach(function(control){control.value=value;});return value;}
 var initial='';try{initial=localStorage.getItem(key)||'';}catch(e){}apply(initial);
 document.addEventListener('change',function(e){
  if(controls.indexOf(e.target)<0)return;
  var value=apply(e.target.value);try{localStorage.setItem(key,value);}catch(error){}
 },true);
 window.addEventListener('storage',function(e){
  if(e.key!==key&&e.key!==null)return;
  var value=valid(e.key===null?'':e.newValue),changed=controls.some(function(control){return control.value!==value;});apply(value);
  var X=window.MEGASPOT_ADMIN;if(!changed||!X)return;
  var view=document.querySelector('.adm-view:not([hidden])');
  if(view&&['view-bookings','view-resv','view-calendar'].indexOf(view.id)>=0)X.loadView(view.id.slice(5));
 });
})();
