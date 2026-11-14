/* Calendar month shared with reservation list and daily date boundaries. */
(function(){
 'use strict';var key='megaspot.admin.reservation-month.v1',month='';
 function clean(value){return typeof value==='string'&&/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(value)?value:'';}
 function bounds(value){value=clean(value);return value?{from:value+'-01',to:value+'-'+new Date(Number(value.slice(0,4)),Number(value.slice(5,7)),0).getDate()}:null;}
 function apply(value,keepDates){month=clean(value);['bk-month-filter','rs-month-filter'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=month;});var range=bounds(month);if(!range&&!keepDates){document.getElementById('rs-from').value='';document.getElementById('rs-to').value='';}if(range){document.getElementById('rs-from').value=range.from;document.getElementById('rs-to').value=range.to;document.querySelectorAll('#view-resv [data-range]').forEach(function(el){el.classList.remove('on');});}var option=document.querySelector('#bk-filter option[value="upcoming"]');if(option)option.textContent=month?'예약 확정':'예정';return month;}
 function set(value,keepDates){apply(value,keepDates);try{localStorage.setItem(key,month);}catch(e){}return month;}
 try{month=clean(localStorage.getItem(key));}catch(e){}apply(month);
 window.MEGASPOT_RESERVATION_PERIOD={get:function(){return month;},set:set,bounds:bounds};
 document.addEventListener('change',function(e){if(['bk-month-filter','rs-month-filter'].indexOf(e.target.id)>=0)set(e.target.value);},true);
 window.addEventListener('storage',function(e){if(e.key!==key&&e.key!==null)return;var next=clean(e.newValue);if(next===month)return;apply(next);var X=window.MEGASPOT_ADMIN,view=document.querySelector('.adm-view:not([hidden])');if(view&&view.id==='view-calendar'&&!next)return;if(X&&view&&['view-bookings','view-resv','view-calendar'].indexOf(view.id)>=0)X.loadView(view.id.slice(5));});
})();
