/* Active supplier reception: choose a format, request menus and carry the same selection into inquiry. */
(function(){
 'use strict';
 var M=window.MEGASPOT,C=window.MEGASPOT_RECEPTION_CALC,box=document.getElementById('reception-calc');
 if(!M||!C||!box||!C.data.activeCatalog)return;
 var D=C.data.activeCatalog,$=function(s){return document.querySelector(s);},esc=M.esc,chosen=[],filter='all',expanded=false;
 var people=$('#reception-people'),format=$('#reception-format'),course=$('#reception-course'),budget=$('#reception-budget'),note=$('#reception-note'),out=$('[data-reception-result]');
 var query=new URLSearchParams(location.search);
 function selection(){return C.selection({course:course.value,format:format.value,people:people.value,budget_per_person:budget.value,menu_ids:chosen,request_note:note.value});}
 function inquiryUrl(r){var q=new URLSearchParams({reception:r.course,reception_people:r.people||'',reception_format:r.format});if(r.menu_ids.length)q.set('reception_menus',r.menu_ids.join(','));if(r.budget_per_person)q.set('reception_budget',r.budget_per_person);if(r.request_note)q.set('reception_note',r.request_note);return '/inquiry/?'+q.toString()+'#reserve';}
 function selectionHtml(r){return '<dl class="cf-selection"><dt>희망 구성</dt><dd>'+esc(r.courseName)+'</dd><dt>제공 방식 · 인원</dt><dd>'+esc(r.formatName)+' · '+(r.people?r.people+'명':'인원 상담')+'</dd><dt>희망 메뉴</dt><dd>'+(r.menuNames.length?'<div class="cf-chips">'+r.menu_ids.map(function(id,i){return '<button type="button" class="cf-chip" data-menu-remove="'+id+'" aria-label="'+esc(r.menuNames[i])+' 희망 목록에서 빼기">'+esc(r.menuNames[i])+' ×</button>';}).join('')+'</div>':'메뉴 상담 후 결정 · <a href="#catalog" style="text-decoration:underline">메뉴 골라 보기 ↓</a>')+'</dd>'+(r.budget_per_person?'<dt>희망 1인 예산</dt><dd>'+C.won(r.budget_per_person)+' <small>(확정 가격 아님)</small></dd>':'')+(r.request_note?'<dt>추가 요청</dt><dd class="cf-selection-note">'+esc(r.request_note)+'</dd>':'')+'</dl>';}
 function paint(){
  var r=selection(),q=C.quote(people.value,format.value,course.value);
  people.setAttribute('aria-invalid',String(!r));budget.setAttribute('aria-invalid',String(budget.value!==''&&(!Number.isSafeInteger(Number(budget.value))||Number(budget.value)<1||Number(budget.value)>10000000)));
  box.querySelectorAll('[data-reception-people]').forEach(function(b){var on=Number(people.value)===Number(b.dataset.receptionPeople);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
  document.querySelectorAll('[data-cf-price]').forEach(function(el){var co=C.course(el.dataset.cfPrice);el.textContent=co&&co.price!=null?'1인 '+C.won(co.price)+' · 부가세 별도':'상담 후 견적';});
  document.querySelectorAll('[data-menu-pick]').forEach(function(b){var on=chosen.indexOf(b.dataset.menuPick)>=0;b.setAttribute('aria-pressed',String(on));b.textContent=on?'선택 해제':'희망 메뉴에 담기';});
  if(!r){out.innerHTML='<h3>입력 내용을 확인해 주세요</h3><p class="mt-2" role="status">인원은 1명 이상의 정수, 희망 1인 예산은 1~10,000,000원으로 입력해 주세요. 예산은 비워 두어도 됩니다.</p>';return;}
  var amount=q.ok?C.won(q.total):'상담 후 견적';
  out.innerHTML='<div class="eyebrow">Your catering plan</div><div class="cc-total"><span>예상 금액<small>'+(q.ok?'부가세 10% 포함':'메뉴·제공량·가격 최종 협의')+'</small></span><b>'+amount+'</b></div>'+selectionHtml(r)
   +(q.ok?'<table class="est-lines"><tbody><tr><td>메뉴 '+C.won(q.unitPrice)+' × '+q.people+'명</td><td class="r">'+C.won(q.food)+'</td></tr><tr><td>'+esc(q.feeName)+'</td><td class="r">'+C.won(q.fee)+'</td></tr><tr><td>공급가액 (부가세 별도)</td><td class="r">'+C.won(q.supply)+'</td></tr><tr><td>부가세 10%</td><td class="r">'+C.won(q.vat)+'</td></tr><tr class="sum"><td>최종 합계</td><td class="r">'+C.won(q.total)+'</td></tr></tbody></table>':'<p class="cf-request-state">선택한 메뉴와 행사 조건을 확인한 뒤 최종 견적을 안내합니다. 미확정 금액은 합계에 포함하지 않습니다.</p>')
   +'<a class="btn btn-primary cc-go" href="'+esc(inquiryUrl(r))+'">이 구성으로 상담하기 →</a><div class="row mt-2"><button type="button" class="btn btn-light btn-sm" data-reception-copy>문의 내용 복사</button><a class="btn btn-ghost btn-sm" href="tel:01085401886">전화 상담</a></div><p class="tiny muted mt-2">메뉴·출장·세팅비는 부가세 별도이며 최종 공급가액에 부가세 10%를 더합니다. 공간 대관료와 반환 보증금은 별도입니다.</p>';
 }
 function menus(){var shown=0,total=0;document.querySelectorAll('[data-menu-card]').forEach(function(card){var match=filter==='all'||card.dataset.category===filter;var item=D.items.find(function(m){return m.id===card.dataset.menuCard;}),featured=D.items.filter(function(m){return m.category===item.category;}).indexOf(item)<3;var visible=match&&(filter!=='all'||expanded||featured);card.hidden=!visible;if(match)total++;if(visible)shown++;});$('[data-menu-count]').textContent=(filter==='all'?'대표 메뉴':D.categories.find(function(c){return c.id===filter;}).name)+' '+shown+'종'+(shown<total?' / 전체 '+total+'종':'')+' · 희망 메뉴 '+chosen.length+'종 선택';$('[data-menu-more]').hidden=filter!=='all'||expanded;document.querySelectorAll('[data-menu-filter]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.menuFilter===filter));});}
 $('#cf-form').addEventListener('submit',function(e){e.preventDefault();});box.addEventListener('input',paint);box.addEventListener('change',paint);
 document.addEventListener('click',function(e){var b=e.target.closest('[data-menu-pick],[data-menu-remove],[data-menu-filter],[data-menu-more],[data-reception-course],[data-reception-format],[data-reception-people],[data-reception-copy]');if(!b)return;
  if(b.dataset.menuPick||b.dataset.menuRemove){var id=b.dataset.menuPick||b.dataset.menuRemove,i=chosen.indexOf(id);if(i<0)chosen.push(id);else chosen.splice(i,1);paint();menus();return;}
  if(b.dataset.menuFilter){filter=b.dataset.menuFilter;menus();return;}
  if(b.hasAttribute('data-menu-more')){expanded=true;menus();return;}
  if(b.dataset.receptionCourse){course.value=b.dataset.receptionCourse;paint();return;}
  if(b.dataset.receptionFormat){format.value=b.dataset.receptionFormat;paint();return;}
  if(b.dataset.receptionPeople){people.value=b.dataset.receptionPeople;paint();return;}
  if(b.hasAttribute('data-reception-copy')){var r=selection();if(!r)return;var text=C.requestText(r);M.copy(text).then(function(ok){M.toast(ok?'문의 내용을 복사했습니다.':'아래 문의 내용을 선택해 복사해 주세요.');if(!ok){var pre=document.createElement('pre');pre.className='dr-pre mt-2';pre.textContent=text;out.appendChild(pre);}});}
 });
 var links=Array.from(document.querySelectorAll('[data-field-photo]'));links.forEach(function(link,index){link.addEventListener('click',function(e){if(!M.openLightbox||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();M.openLightbox(links.map(function(a){return {src:a.href,title:a.dataset.title,cap:'협력사 진행 사례 · 실제 메뉴·제공량·세팅 범위는 상담 후 확정합니다.'};}),index);});});
 if(C.isActive(query.get('reception')))course.value=query.get('reception');
 if(query.has('reception_people'))people.value=query.get('reception_people');
 if(D.formats.some(function(f){return f.id===query.get('reception_format');}))format.value=query.get('reception_format');
 if(query.has('reception_budget'))budget.value=query.get('reception_budget');
 if(query.has('reception_menus'))chosen=query.get('reception_menus').split(',').filter(function(id,i,a){return D.items.some(function(m){return m.id===id;})&&a.indexOf(id)===i;});
 paint();menus();
})();
