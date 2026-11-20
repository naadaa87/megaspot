/* Keep frequent inquiry and parking actions visible, preserving original controls. */
(function(){
 'use strict';
 function menu(title){var d=document.createElement('details'),s=document.createElement('summary'),body=document.createElement('div');d.className='compact-more';s.textContent='더보기';s.setAttribute('aria-label',title);body.className='compact-more-body';d.append(s,body);d.addEventListener('toggle',function(){if(d.open)document.querySelectorAll('.compact-more[open]').forEach(function(other){if(other!==d)other.open=false;});});return d;}
 function inquiry(){
  var actions=document.querySelector('#dr-body .dr-actions');
  if(actions&&!actions.classList.contains('compact-action-set')){
   var secondary=Array.from(actions.children).filter(function(el){return !el.matches('#dr-quote,#dr-saved-quote,[data-payment-editor],#dr-book,a[href^="tel:"]');});
   if(secondary.length){var more=menu('문의 추가 작업 더보기');secondary.forEach(function(el){more.lastElementChild.appendChild(el);});actions.appendChild(more);actions.classList.add('compact-action-set');}
  }
  var bulk=document.getElementById('inq-bulk');
  if(bulk&&!bulk.querySelector('.compact-more')){var more=menu('선택한 문의 추가 작업 더보기');['inq-sel-del','inq-sel-restore'].forEach(function(id){var el=document.getElementById(id);if(el)more.lastElementChild.appendChild(el);});bulk.appendChild(more);}
 }
 function parking(){document.querySelectorAll('#pa-list .pa-order').forEach(function(card){
  if(card.querySelector(':scope>.compact-more'))return;
  var secondary=Array.from(card.children).filter(function(el){return el.matches('[data-pact="issue"],.pa-resolution')||el.tagName==='DETAILS'&&!!el.querySelector('[data-pact="reset"]');});
  if(!secondary.length)return;
  var more=menu('주차 주문 보류·처리 결과·오류 복구 더보기');more.classList.add('pa-more-actions');secondary.forEach(function(el){more.lastElementChild.appendChild(el);});card.appendChild(more);
 });}
 function sync(){inquiry();parking();}
 sync();['dr-body','pa-list'].forEach(function(id){var root=document.getElementById(id);if(root)new MutationObserver(sync).observe(root,{childList:true,subtree:true});});
 document.addEventListener('keydown',function(e){var d=e.target.closest('.compact-more');if(e.key==='Escape'&&d&&d.open){e.preventDefault();d.open=false;d.firstElementChild.focus({preventScroll:true});}});
})();
