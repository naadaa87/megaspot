(function(){
  'use strict';
  var M=window.MEGASPOT,C=window.MEGASPOT_RECEPTION_CALC,box=document.getElementById('reception-calc');
  var fieldPhotos=Array.from(document.querySelectorAll('[data-field-photo]'));
  fieldPhotos.forEach(function(link,index){
    link.addEventListener('click',function(e){
      if(!M||!M.openLightbox||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
      e.preventDefault();
      M.openLightbox(fieldPhotos.map(function(a){return {src:a.href,title:a.dataset.title,cap:'실제 현장 사진 · 메뉴와 세팅 포함 범위는 최종 견적에서 확인합니다.'};}),index);
    });
  });
  if(!M||!C||!box) return;
  var input=box.querySelector('[name=reception_people]'),out=box.querySelector('[data-reception-result]');
  var format=box.querySelector('[name=reception_format]'),course=box.querySelector('[name=reception_course]');
  var q0=new URLSearchParams(location.search),initial=q0.get('reception_people');
  if(C.course(q0.get('reception')))course.value=q0.get('reception')||'classic';
  if(initial!==null) input.value=initial;
  if(q0.has('reception_format'))format.value=C.formatLabel(q0.get('reception_format'))?q0.get('reception_format'):'';
  function paint(){
    var q=C.quote(input.value,format.value,course.value);
    box.querySelector('[data-reception-menu]').href='#course-'+course.value;
    var selected=C.formatLabel(format.value),formatQuery=selected?'&reception_format='+encodeURIComponent(format.value):'';
    box.querySelectorAll('[data-reception-people]').forEach(function(b){var on=q.ok&&q.people===Number(b.dataset.receptionPeople);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
    input.setAttribute('aria-invalid',String(!q.ok&&q.reason==='invalid'));
    format.setAttribute('aria-invalid',String(!q.ok&&q.reason==='format'));
    if(!q.ok){
      out.innerHTML='<div class="eyebrow">Estimate</div><p class="mt-2" role="status">'+M.esc(q.message)+'</p>'
        +(q.reason==='consult'?'<a class="btn btn-primary mt-3" href="/inquiry/?reception='+encodeURIComponent(course.value)+'&reception_people='+q.people+formatQuery+'#reserve">별도 견적 상담 →</a>':'');
      return;
    }
    out.innerHTML='<div class="eyebrow">Catering estimate</div>'
      +'<div class="cc-total"><span>예상 금액<small>부가세 적용 여부 확인 전</small></span><b>'+C.won(q.total)+'</b></div>'
      +'<p class="small muted">'+M.esc(q.courseName)+' '+q.people+'명 · '+M.esc(q.feeName)+' 포함</p>'
      +(selected?'<p class="small cc-format-selected">희망 제공 방식: <b>'+M.esc(selected)+'</b></p>':'')
      +'<table class="est-lines cc-lines"><tbody><tr><td>'+M.esc(q.courseName)+' '+C.won(q.unitPrice)+' × '+q.people+'명</td><td class="r">'+C.won(q.food)+'</td></tr>'
      +'<tr><td>'+M.esc(q.feeName)+' <small>('+q.feeLabel+')</small></td><td class="r">'+C.won(q.fee)+'</td></tr>'
      +'<tr class="sum"><td><b>합계</b></td><td class="r"><b>'+C.won(q.total)+'</b></td></tr></tbody></table>'
      +'<a class="btn btn-primary cc-go" href="/inquiry/?reception='+encodeURIComponent(course.value)+'&reception_people='+q.people+(q.people<=200?'&people='+q.people:'')+formatQuery+'#reserve">이 금액으로 상담하기 →</a>'
      +'<div class="row mt-2"><button type="button" class="btn btn-light btn-sm" data-reception-copy>고객 안내문 복사</button><a class="btn btn-ghost btn-sm" href="tel:01085401886">전화 상담</a></div>'
      +'<p class="tiny muted mt-2">제공 방식별 포장·기물·세팅 범위, 부가세 적용 여부·최소 주문 인원·코스 적용 가능 여부는 최종 견적에서 확인합니다. 공간 대관료는 별도입니다.</p>';
  }
  input.addEventListener('input',paint);
  format.addEventListener('change',paint);
  course.addEventListener('change',paint);
  document.querySelectorAll('[data-reception-course]').forEach(function(a){a.addEventListener('click',function(){if(C.course(a.dataset.receptionCourse)){course.value=a.dataset.receptionCourse;paint();}});});
  box.addEventListener('click',function(e){
    var b=e.target.closest('[data-reception-people]');if(b){input.value=b.dataset.receptionPeople;paint();return;}
    if(e.target.closest('[data-reception-copy]')){
      var q=C.quote(input.value,format.value,course.value);if(!q.ok)return;
      M.copy(C.customerText(input.value,format.value,course.value)).then(function(ok){M.toast(ok?'고객 안내문을 복사했습니다.':'복사하지 못했습니다. 아래 안내문을 선택해 복사해 주세요.');if(!ok){var pre=document.createElement('pre');pre.className='dr-pre mt-2';pre.textContent=C.customerText(input.value,format.value,course.value);out.appendChild(pre);}});
    }
  });
  paint();
})();
