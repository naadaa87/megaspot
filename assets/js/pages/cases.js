/* 행사 사례 (2026-11-25) — 목록(/cases/)과 상세(/cases/view/?id=EC-…)
   서버가 이미 채운 화면이면 목록은 공간 거르기만 붙이고, 상세는 같은 모양으로 다시 그립니다.
   카드·본문 모양은 functions/api/_case_pages.js 와 같습니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT; if(!M) return;
  var $=M.$, esc=M.esc;
  var SHORT={'megaspot-gundae':'건대 1호','megaspot-gundae-2':'건대 2호',both:'건대 1호·2호'};
  var LINK={catering:'/catering/',cocktail:'/cocktail/',reception:'/reception/',parking:'/parking/',invite:'/kit/'};
  function ym(m){ var x=/^(\d{4})-(\d{2})$/.exec(m||''); return x?x[1]+'년 '+(+x[2])+'월':''; }
  function meta(c){ return [ym(c.month), c.headcount?c.headcount+'명':'', c.layout].filter(Boolean).join(' · '); }
  function para(s){ return esc(s).replace(/\r?\n/g,'<br>'); }
  function card(c){
    var ph=c.photos&&c.photos[0];
    return '<a class="cs-card" href="/cases/view/?id='+esc(c.ref)+'" data-space="'+esc(c.space_id)+'">'
      +(ph?'<div class="cs-ph"><img src="'+esc(ph.src)+'" alt="'+esc(ph.alt||c.title)+'" loading="lazy" decoding="async"></div>':'<div class="cs-ph cs-noimg"><span>'+esc(c.purpose_label||'행사 사례')+'</span></div>')
      +'<div class="cs-bd"><div class="cs-tags">'+(c.purpose_label?'<span class="badge badge-cobalt">'+esc(c.purpose_label)+'</span>':'')+'<span class="badge badge-soft">'+esc(SHORT[c.space_id]||'')+'</span></div>'
      +'<h3>'+esc(c.title)+'</h3><p>'+esc(c.summary)+'</p><div class="cs-meta">'+esc(meta(c))+'</div></div></a>';
  }
  function empty(){
    return '<div class="card cs-empty"><b>아직 공개된 사례가 없습니다</b><p class="small muted mt-1">주최 측 동의를 받은 행사부터 하나씩 소개할 예정입니다. 그동안 실제 행사 준비 현장 사진과 이용 후기를 먼저 둘러보세요.</p>'
      +'<div class="row mt-2" style="gap:8px;flex-wrap:wrap"><a class="btn btn-light btn-sm" href="/spaces/megaspot-gundae/#event-gallery">현장 사진 보기</a><a class="btn btn-light btn-sm" href="/spaces/megaspot-gundae/#reviews">이용 후기 보기</a></div></div>';
  }

  // ---------- 목록 ----------
  var list=$('#cs-list');
  if(list){
    var items=null, space='';
    function draw(){
      var shown=(items||[]).filter(function(c){ return !space||c.space_id===space||c.space_id==='both'; });
      list.innerHTML=shown.length?shown.map(card).join(''):(items&&items.length?'<div class="card cs-empty"><p class="small muted">이 공간의 사례는 아직 없습니다.</p></div>':empty());
    }
    document.querySelectorAll('.cs-filter button').forEach(function(b){ b.addEventListener('click',function(){
      space=b.getAttribute('data-space')||''; document.querySelectorAll('.cs-filter button').forEach(function(x){ x.classList.toggle('on',x===b); });
      if(items) draw();
    }); });
    M.api('/cases').then(function(r){ items=r.items||[]; draw(); }).catch(function(){ if(!list.querySelector('.cs-card')) list.innerHTML=empty(); });
  }

  // ---------- 상세 ----------
  var view=$('#cs-view');
  if(view){
    var ref=String(new URLSearchParams(location.search).get('id')||'').toUpperCase().trim();
    function fail(){ view.innerHTML='<div class="card cs-empty"><b>사례를 찾지 못했습니다</b><p class="small muted mt-1">주소가 바뀌었거나 공개가 끝난 사례입니다.</p><div class="row mt-2"><a class="btn btn-primary btn-sm" href="/cases/">사례 목록</a></div></div>'; }
    if(!/^EC-\d{4}-[A-Z0-9]{4}$/.test(ref)){ fail(); return; }
    M.api('/cases/'+encodeURIComponent(ref)).then(function(r){
      var c=r.item; document.title=c.title+' | 행사 사례 | 메가스팟';
      var cr=$('#cs-crumb'); if(cr) cr.textContent=c.title;
      var spaceHref=c.space_id==='megaspot-gundae-2'?'/spaces/megaspot-gundae-2/':'/spaces/megaspot-gundae/';
      var q=new URLSearchParams(); if(c.space_id&&c.space_id!=='both') q.set('space',c.space_id); if(c.headcount) q.set('people',c.headcount);
      view.innerHTML='<article class="cs-article"><header class="cs-head"><div class="cs-tags">'+(c.purpose_label?'<span class="badge badge-cobalt">'+esc(c.purpose_label)+'</span>':'')+'<span class="badge badge-soft">'+esc(SHORT[c.space_id]||'')+'</span></div>'
        +'<h1 class="h-l mt-1">'+esc(c.title)+'</h1><p class="lead mt-1">'+esc(c.summary)+'</p></header>'
        +'<dl class="def cs-facts"><div><dt>공간</dt><dd><a href="'+spaceHref+'">'+esc(c.space_label)+'</a></dd></div>'+(c.month?'<div><dt>시기</dt><dd>'+esc(ym(c.month))+'</dd></div>':'')+(c.headcount?'<div><dt>인원</dt><dd>'+esc(c.headcount)+'명</dd></div>':'')+(c.layout?'<div><dt>배치</dt><dd>'+esc(c.layout)+'</dd></div>':'')
        +(c.services&&c.services.length?'<div><dt>함께 쓴 서비스</dt><dd>'+c.services.map(function(s){ return LINK[s.id]?'<a href="'+LINK[s.id]+'">'+esc(s.label)+'</a>':esc(s.label); }).join(' · ')+'</dd></div>':'')+'</dl>'
        +(c.photos&&c.photos.length?'<div class="cs-photos">'+c.photos.map(function(p,i){ return '<figure><img src="'+esc(p.src)+'" alt="'+esc(p.alt||c.title+' 사진 '+(i+1))+'" loading="'+(i?'lazy':'eager')+'" decoding="async">'+(p.alt?'<figcaption>'+esc(p.alt)+'</figcaption>':'')+'</figure>'; }).join('')+'</div>':'')
        +'<div class="cs-text">'+para(c.body)+'</div>'
        +(c.quote?'<blockquote class="cs-quote"><p>'+para(c.quote)+'</p>'+(c.org_label?'<cite>'+esc(c.org_label)+'</cite>':'')+'</blockquote>':(c.org_label?'<p class="small muted">주최 · '+esc(c.org_label)+'</p>':''))
        +'<p class="small muted cs-consent">주최 측 동의를 받아 소개하는 사례입니다.</p>'
        +'<div class="row mt-3 cs-cta" style="gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="/inquiry/?'+q+'">비슷한 행사 견적 문의</a><a class="btn btn-light" href="/visit/'+(c.space_id&&c.space_id!=='both'?'?space='+esc(c.space_id):'')+'">사전답사 신청</a><a class="btn btn-light" href="/cases/">다른 사례 보기</a></div></article>';
    }).catch(fail);
  }
})();
