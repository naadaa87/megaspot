/* Shared reservation filter layout and compact per-reservation actions. */
(function(){
 'use strict';
 var $=function(s){return document.querySelector(s);};
 function wrapField(id,title){var el=$('#'+id);if(!el||el.closest('label'))return;var previous=el.previousElementSibling;if(previous&&previous.matches('label.sr-only')&&previous.htmlFor===id)previous.remove();var label=document.createElement('label'),text=document.createElement('span');label.className='adm-filter-field';text.textContent=title;el.before(label);label.append(text,el);}
 [['rs-from','시작일'],['rs-to','종료일'],['rs-space','호점'],['rs-ch','문의 경로'],['rs-status','예약 상태'],['rs-payment-filter','결제 상태'],['rs-service-filter','식음료']].forEach(function(x){wrapField(x[0],x[1]);});
 function panel(before,children){var box=document.createElement('div');box.className='adm-card adm-filter-panel';before.before(box);children.forEach(function(el){if(el)box.appendChild(el);});return box;}
 panel($('#view-resv .rs-bar'),[$('#view-resv .rs-bar'),$('#view-resv .rs-filters')]);
 panel($('#view-calendar .adm-calendar-toolbar'),[$('#view-calendar .adm-calendar-toolbar'),$('#view-calendar .adm-calendar-extra-filters')]);
 var search=$('#rs-search'),searchLabel=document.createElement('label');searchLabel.htmlFor='rs-q';searchLabel.textContent='고객·예약 검색';searchLabel.className='adm-filter-search-label';search.prepend(searchLabel);
 var revenue=$('#revenue-form');revenue.classList.add('adm-card','adm-filter-panel');$('#view-revenue .revenue-page-head').after(revenue);
 function groupActions(root){root.querySelectorAll('.rs-acts,.adm-row .r3>span:last-child').forEach(function(cell){
  if(cell.querySelector('.reservation-action-group'))return;
  var nodes=Array.from(cell.childNodes),buttons=nodes.filter(function(n){return n.nodeType===1&&n.matches('button,a');});
  if(buttons.length<2)return;
  var primary=buttons.filter(function(n){return n.matches('a[href^="tel:"],[data-portal-code],[data-rsconfirm],[data-bk="confirmed"],[data-rsact="confirmed"]');}),secondary=buttons.filter(function(n){return primary.indexOf(n)<0;});
  if(!secondary.length)return;
  var group=document.createElement('div'),main=document.createElement('div'),more=document.createElement('details'),summary=document.createElement('summary'),items=document.createElement('div');
  group.className='reservation-action-group';main.className='reservation-primary-actions';more.className='reservation-more';summary.textContent='더보기';summary.setAttribute('aria-label','예약 추가 작업 더보기');items.className='reservation-more-items';
  nodes.forEach(function(n){if(primary.indexOf(n)>=0)main.appendChild(n);else items.appendChild(n);});
  summary.addEventListener('click',function(e){e.stopPropagation();});
  more.append(summary,items);more.addEventListener('toggle',function(){if(more.open)document.querySelectorAll('.reservation-more[open]').forEach(function(other){if(other!==more)other.open=false;});});
  group.append(main,more);cell.appendChild(group);
 });}
 window.MEGASPOT_RESERVATION_ACTIONS=function(){['#rs-list','#bk-list'].forEach(function(selector){groupActions($(selector));});};
 ['#rs-list','#bk-list'].forEach(function(selector){var root=$(selector);groupActions(root);new MutationObserver(function(){groupActions(root);}).observe(root,{childList:true,subtree:true});});
 document.addEventListener('keydown',function(e){var more=e.target.closest('.reservation-more');if(e.key==='Escape'&&more&&more.open){e.preventDefault();more.open=false;more.querySelector('summary').focus({preventScroll:true});}});
})();
