/* 입점 안내(/host/) — 수수료 비교 계산, 이용료 표, 공간 유형, 본사 부가서비스 목록 */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, esc=M.esc, P=S.P, won=S.won;
  // 이용료 표
  $('#hl-plans').innerHTML=P.plans.map(function(p, i){
    return '<div class="hl-plan'+(i===0?' best':'')+'">'+(i===0?'<span class="tag-best">가장 저렴</span>':'')+'<h3>'+p.months+'개월 등록</h3>'
      +'<p class="day">하루 <b>'+p.daily.toLocaleString('ko-KR')+'</b>원</p><p class="mon">월 <b>'+esc(S.man(p.monthly))+'</b></p><p class="pf-help mt-1">'+p.months+'개월 합계 '+esc(won(p.monthly*p.months))+'</p></div>';
  }).join('');
  $('#hl-types').innerHTML=P.typeGroups.map(function(g){ return '<div><b>'+esc(g.label)+'</b>'+g.types.map(function(t){ return '<span>'+esc(t[1])+'</span>'; }).join('')+'</div>'; }).join('');
  $('#hl-addons').innerHTML=P.addons.map(function(a){ return '<li>'+esc(a.label)+'</li>'; }).join('');
  // 수수료 10% 방식과 비교
  var plan=$('#hc-plan'); plan.innerHTML=P.plans.map(function(p){ return '<option value="'+p.id+'">'+p.months+'개월 등록 · 월 '+esc(S.man(p.monthly))+'</option>'; }).join('');
  function calc(){
    var avg=Math.max(0, +$('#hc-avg').value||0), cnt=Math.max(0, Math.min(200, +$('#hc-cnt').value||0)), p=S.PLAN[plan.value]||P.plans[0];
    var sales=avg*cnt, fee=Math.round(sales*0.1), save=fee-p.monthly;
    $('#hc-out').innerHTML='<div class="hl-vs"><small>수수료 10% 방식이라면</small><b>월 '+esc(won(fee))+'</b><span>한 달 예약 금액 '+esc(won(sales))+'의 10%</span></div>'
      +'<div class="hl-vs us"><small>메가스팟</small><b>월 '+esc(won(p.monthly))+'</b><span>'+p.months+'개월 등록 · 예약이 늘어도 그대로</span></div>'
      +(save>0?'<div class="hl-save">한 달에 '+esc(won(save))+', 1년이면 '+esc(won(save*12))+'을 아낍니다.</div>'
        :'<div class="hl-save zero">'+(sales?'이 조건에서는 차이가 크지 않습니다. 예약 금액이나 건수가 늘면 차이가 벌어집니다.':'예약 금액과 건수를 넣어 보세요.')+'</div>');
  }
  ['#hc-avg','#hc-cnt','#hc-plan'].forEach(function(s){ $(s).addEventListener('input', calc); $(s).addEventListener('change', calc); });
  calc();
})();
