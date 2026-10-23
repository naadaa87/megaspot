/* 홈 */
(function(){
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc;
  var SC=window.MEGASPOT_SCENES||[], PUR=window.MEGASPOT_PURPOSES||[];
  var purLabel={}; PUR.forEach(function(p){ purLabel[p.id]=p.label; });

  /* ---------- 목적 사진 카드 ---------- */
  var pg=$('#purpose-grid'); if(pg){ pg.innerHTML=PUR.map(function(p){ return M.purposeCard(p); }).join(''); }

  /* ---------- 지금 문의할 수 있는 공간 ---------- */
  // 1호(운영 중)를 먼저, 오픈 예정인 2호를 그 다음에 보여 줍니다
  var fs=$('#featured-space'); if(fs){ var open=(window.MEGASPOT_SPACES||[]).filter(function(s){return s.status==='open'||s.status==='opening';}); open.sort(function(a,b){ return (b.status==='open')-(a.status==='open'); }); fs.innerHTML=open.map(function(s){ return M.spaceCard(s,{wide:true}); }).join(''); }

  /* ---------- 히어로 슬라이드 ---------- */
  (function(){
    var box=$('#hero-slides'); if(!box) return;
    var slides=$$('.slide',box), dots=$('.hero-dots',box), cap=$('#hero-cap'), i=0, timer=null;
    var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function title(sl){ var sc=M.visual(sl.dataset.scene); return sc?sc.title:''; }
    dots.innerHTML=slides.map(function(sl,k){ return '<button type="button" aria-label="'+esc(title(sl))+' 장면 보기"'+(k===0?' class="on" aria-current="true"':'')+'></button>'; }).join('');
    var dbtn=$$('button',dots);
    function go(k){
      i=(k+slides.length)%slides.length;
      var img=$('img',slides[i]); if(img && !img.getAttribute('src') && img.dataset.src) img.src=img.dataset.src;
      slides.forEach(function(sl,n){ sl.classList.toggle('on',n===i); });
      dbtn.forEach(function(b,n){ b.classList.toggle('on',n===i); if(n===i) b.setAttribute('aria-current','true'); else b.removeAttribute('aria-current'); });
      if(cap) cap.textContent=title(slides[i]);
      var tg=$('.ph-tag',box), sid=slides[i].dataset.scene; if(tg){ tg.textContent=M.imgTag(sid); tg.classList.toggle('staged', M.isStaged(sid)); tg.classList.toggle('cg', M.isCG(sid)); }
    }
    function start(){ if(reduce||timer) return; timer=setInterval(function(){ go(i+1); }, 5200); }
    function stop(){ clearInterval(timer); timer=null; }
    dbtn.forEach(function(b,n){ b.addEventListener('click', function(){ stop(); go(n); start(); }); });
    box.addEventListener('mouseenter', stop); box.addEventListener('mouseleave', start);
    box.addEventListener('focusin', stop); box.addEventListener('focusout', start);
    // 첫 장면이 그려진 뒤 나머지 이미지를 불러옵니다
    window.addEventListener('load', function(){ slides.forEach(function(sl){ var img=$('img',sl); if(img && !img.getAttribute('src') && img.dataset.src) img.src=img.dataset.src; }); start(); });
    box.addEventListener('click', function(e){ if(e.target.closest('.hero-dots')) return; var items=slides.map(function(sl){ var sc=M.visual(sl.dataset.scene)||{id:sl.dataset.scene}; return {src:M.imgSrc(sc.id), title:sc.title, cap:sc.cap, tag:M.imgTag(sc.id)}; }); M.openLightbox(items, i); });
    box.style.cursor='zoom-in';
  })();

  /* ---------- 활용 장면 모자이크 ---------- */
  (function(){
    var box=$('#scene-mosaic'); if(!box||!SC.length) return;
    // 목적 카드·히어로에 쓰지 않은 장면 위주로 고릅니다
    var pick=['s06','s20','s21','s12','s19','s18','s10','s23'];
    var size=['big','','','','','wide','',''];
    var list=pick.map(function(id){ return window.MEGASPOT_SCENE(id); }).filter(Boolean);
    box.innerHTML=list.map(function(s,k){
      return '<button type="button" class="tile '+size[k]+'" data-i="'+k+'" aria-label="'+esc(s.title)+' 장면 크게 보기">'
        + '<img src="'+M.imgSrc(s.id,'m')+'" alt="'+esc(s.title)+' — 메가스팟 건대 1호" loading="lazy" decoding="async">'
        + M.tagHtml(s.id)
        + '<span class="lab">'+esc(purLabel[s.purpose]||'')+'<b>'+esc(s.title)+'</b></span></button>';
    }).join('');
    var items=M.sceneItems(list);
    box.addEventListener('click', function(e){ var b=e.target.closest('.tile'); if(b) M.openLightbox(items, +b.dataset.i); });
    var note=$('#scene-note'); if(note) note.textContent=window.MEGASPOT_SCENE_NOTE||'';
  })();
})();
