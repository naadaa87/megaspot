(function(){
  'use strict';
  var M=window.MEGASPOT,C=window.MEGASPOT_RECEPTION_CALC,box=document.getElementById('reception-calc');
  if(!M||!C||!box) return;
  var input=box.querySelector('[name=reception_people]'),out=box.querySelector('[data-reception-result]');
  var q0=new URLSearchParams(location.search),initial=q0.get('reception_people');
  if(initial!==null) input.value=initial;
  function paint(){
    var q=C.quote(input.value);
    box.querySelectorAll('[data-reception-people]').forEach(function(b){var on=q.ok&&q.people===Number(b.dataset.receptionPeople);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
    input.setAttribute('aria-invalid',String(!q.ok));
    if(!q.ok){
      out.innerHTML='<div class="eyebrow">Estimate</div><p class="mt-2" role="status">'+M.esc(q.message)+'</p>'
        +(q.reason==='consult'?'<a class="btn btn-primary mt-3" href="/inquiry/?reception=classic&reception_people='+q.people+'#other">별도 견적 상담 →</a>':'');
      return;
    }
    out.innerHTML='<div class="eyebrow">Classic estimate</div>'
      +'<div class="cc-total"><span>예상 금액<small>부가세 적용 여부 확인 전</small></span><b>'+C.won(q.total)+'</b></div>'
      +'<p class="small muted">클래식 '+q.people+'명 · 출장·세팅·철수 비용 포함</p>'
      +'<table class="est-lines cc-lines"><tbody><tr><td>클래식 '+C.won(q.unitPrice)+' × '+q.people+'명</td><td class="r">'+C.won(q.food)+'</td></tr>'
      +'<tr><td>출장·세팅·철수 <small>('+q.feeLabel+')</small></td><td class="r">'+C.won(q.fee)+'</td></tr>'
      +'<tr class="sum"><td><b>합계</b></td><td class="r"><b>'+C.won(q.total)+'</b></td></tr></tbody></table>'
      +'<a class="btn btn-primary cc-go" href="/inquiry/?reception=classic&reception_people='+q.people+(q.people<=200?'&people='+q.people:'')+'#other">이 금액으로 상담하기 →</a>'
      +'<div class="row mt-2"><button type="button" class="btn btn-light btn-sm" data-reception-copy>고객 안내문 복사</button><a class="btn btn-ghost btn-sm" href="tel:01085401886">전화 상담</a></div>'
      +'<p class="tiny muted mt-2">부가세 적용 여부·최소 주문 인원·메뉴 제공 가능 여부는 상담에서 확인합니다. 공간 대관료는 별도입니다.</p>';
  }
  input.addEventListener('input',paint);
  box.addEventListener('click',function(e){
    var b=e.target.closest('[data-reception-people]');if(b){input.value=b.dataset.receptionPeople;paint();return;}
    if(e.target.closest('[data-reception-copy]')){
      var q=C.quote(input.value);if(!q.ok)return;
      M.copy(C.customerText(input.value)).then(function(ok){M.toast(ok?'고객 안내문을 복사했습니다.':'복사하지 못했습니다. 아래 안내문을 선택해 복사해 주세요.');if(!ok){var pre=document.createElement('pre');pre.className='dr-pre mt-2';pre.textContent=C.customerText(input.value);out.appendChild(pre);}});
    }
  });
  paint();
})();
