/* 행사 인원별 필요 평수 계산기 (/event-guide/capacity/)
   면적 기준은 tools/seo-pages/capacity.mjs 의 값을 페이지에 심어 둔 것(#cc 의 data-calc)을 그대로 씁니다. */
(function(){
  var box=document.getElementById('cc'); if(!box) return;
  var D; try{ D=JSON.parse(box.getAttribute('data-calc')); }catch(e){ return; }
  var $=function(id){ return document.getElementById(id); };
  var n=$('cc-n'), label=$('cc-n-label'), sel=$('cc-layout'), buf=$('cc-buffer'), out=$('cc-out'), mode='area';
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function num(v){ return Number(v).toLocaleString('ko-KR'); }
  function range(a, unit){ return a[0]===a[1] ? '약 '+num(a[0])+unit : num(a[0])+'~'+num(a[1])+unit; }
  function layout(){ for(var i=0;i<D.layouts.length;i++) if(D.layouts[i].id===sel.value) return D.layouts[i]; return D.layouts[0]; }
  function render(){
    var L=layout(), v=Math.floor(Number(n.value)), extra=1+Number(buf.value||0)/100, note=Number(buf.value)>0?' · 여유 '+buf.value+'% 포함':' · 좌석 면적';
    if(!(v>0)){ out.innerHTML='<small>'+(mode==='area'?'참석 인원':'공간 면적')+'을 입력해 주세요</small><strong>–</strong>'; return; }
    if(v>99999) v=99999;
    if(mode==='area'){
      var m2=L.sqft.map(function(s){ return v*s*D.sqft*extra; }), py=m2.map(function(x){ return Math.round(x/D.pyeong); });
      out.innerHTML='<small>'+num(v)+'명 · '+esc(L.label)+note+'</small><strong>'+range(py,'평')+'</strong>'
        +'<p>'+range(m2.map(Math.round),'㎡')+'입니다. '+(Number(buf.value)>0?'바, 무대처럼 따로 자리를 차지하는 것이 있으면 그만큼 더 필요합니다.':'무대와 통로, 음식 테이블 자리는 따로 더해야 합니다.')+'</p>'
        +'<div class="row"><a class="btn btn-primary btn-sm" href="/spaces/?people='+v+'">'+num(v)+'명이 들어가는 공간 찾기 →</a></div>';
    } else {
      var usable=v*D.pyeong/extra, ppl=[L.sqft[1], L.sqft[0]].map(function(s){ return Math.floor(usable/(s*D.sqft)); });
      out.innerHTML='<small>'+num(v)+'평 · '+esc(L.label)+(Number(buf.value)>0?' · 여유 '+buf.value+'% 남기고':' · 전체를 좌석으로 쓸 때')+'</small><strong>'+range(ppl,'명')+'</strong>'
        +'<p>'+num(Math.round(v*D.pyeong))+'㎡ 기준입니다. 공간 전체 면적을 넣었다면 준비 공간과 통로를 뺀 홀 면적으로 다시 계산해 보세요. 실제 인원은 공간이 안내하는 최대 인원을 넘을 수 없습니다.</p>'
        +'<div class="row"><a class="btn btn-primary btn-sm" href="/spaces/?people='+ppl[0]+'">'+num(ppl[0])+'명이 들어가는 공간 찾기 →</a></div>';
    }
  }
  Array.prototype.forEach.call(box.querySelectorAll('[data-mode]'), function(b){
    b.addEventListener('click', function(){
      if(mode===b.getAttribute('data-mode')) return; mode=b.getAttribute('data-mode');
      Array.prototype.forEach.call(box.querySelectorAll('[data-mode]'), function(x){ x.setAttribute('aria-pressed', x===b?'true':'false'); });
      label.textContent=mode==='area'?'참석 인원 (명)':'공간 면적 (평)'; n.value=100; render();
    });
  });
  [n, sel, buf].forEach(function(el){ el.addEventListener('input', render); el.addEventListener('change', render); });
  render();
})();
