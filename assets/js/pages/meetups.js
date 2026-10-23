/* 모임 모집 — 목록 · 분류/장소/정렬/검색 · 찜 · 목록 사이 광고 카드 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, esc=M.esc;
  var form=$('#mt-filters'); if(!form) return;
  var CATS=[['','전체'],['seminar','강연·세미나'],['networking','네트워킹·교류'],['community','동호회·정기 모임'],['class','클래스·스터디'],['culture','공연·상영회'],['party','파티·송년회'],['popup','마켓·전시'],['etc','기타']];
  var q=new URLSearchParams(location.search), st={ cat:q.get('cat')||'', venue:q.get('venue')||'', sort:q.get('sort')||'date', q:q.get('q')||'', past:q.get('past')==='1', fav:false };
  var box=$('#mt-list'), items=[], timer=null, seq=0;

  $('#mt-cats').innerHTML=CATS.map(function(c){ return '<button type="button" class="chip'+(c[0]===st.cat?' on':'')+'" data-cat="'+c[0]+'" aria-pressed="'+(c[0]===st.cat)+'">'+esc(c[1])+'</button>'; }).join('');
  $('#mt-venue').value=st.venue; $('#mt-sort').value=st.sort; $('#mt-q').value=st.q; $('#mt-past').checked=st.past;

  function sync(){ var u=new URLSearchParams(); if(st.cat) u.set('cat',st.cat); if(st.venue) u.set('venue',st.venue); if(st.sort!=='date') u.set('sort',st.sort); if(st.q) u.set('q',st.q); if(st.past) u.set('past','1'); history.replaceState(null,'',location.pathname+(u.toString()?'?'+u.toString():'')); }
  function draw(){
    var list=st.fav ? items.filter(function(m){ return M.fav.has('meetup', m.ref); }) : items;
    var html=list.map(function(m){ return '<div class="card-wrap">'+M.meetupCard(m)+M.fav.button('meetup', m.ref, m.title)+'</div>'; });
    // 목록 사이 광고 카드: 6개마다 한 자리 (모임이 1~5개면 맨 뒤에)
    if(list.length){ var at=Math.min(list.length, 5), n=0; for(var i=at;i<=html.length;i+=7){ html.splice(i,0,'<div class="ad-slot ad-in-grid" data-ad-slot="list-card" data-ad-index="'+(n++)+'"></div>'); } }
    box.innerHTML=html.join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-ad-slot]'), function(el){ M.ads.render(el); });
    $('#mt-empty').hidden=list.length>0;
    if(!list.length){ $('#mt-empty-title').textContent=st.fav?'찜한 모임이 없습니다':(st.cat||st.venue||st.q?'조건에 맞는 모임이 아직 없습니다':'지금 모집 중인 모임이 없습니다'); }
    $('#mt-count').textContent=list.length?(st.past?'지난 모임 포함 ':'')+list.length+'개 모임'+(st.fav?' (찜한 모임)':''):'';
  }
  function load(){
    var my=++seq; sync();
    var p=new URLSearchParams({ sort:st.sort, limit:'60' }); if(st.cat) p.set('cat',st.cat); if(st.venue) p.set('venue',st.venue); if(st.q) p.set('q',st.q); if(st.past) p.set('past','1');
    M.api('/meetups/list?'+p.toString()).then(function(j){ if(my!==seq) return; items=j.items||[]; draw(); })
    .catch(function(e){ if(my!==seq) return; items=[]; box.innerHTML=''; $('#mt-empty').hidden=false;
      $('#mt-empty-title').textContent=e.code==='NO_API'?'모임 목록을 준비하고 있습니다':'모임 목록을 불러오지 못했습니다';
      $('#mt-empty-text').textContent=e.code==='NO_API'?'지금은 서버 연결 전이라 모임을 보여 드릴 수 없습니다. 모임 등록이나 참가 문의는 카카오톡으로 남겨 주세요.':(e.message||'잠시 후 다시 시도해 주세요.'); $('#mt-count').textContent=''; });
  }
  $('#mt-cats').addEventListener('click', function(e){ var b=e.target.closest('[data-cat]'); if(!b) return; st.cat=b.dataset.cat; Array.prototype.forEach.call(this.querySelectorAll('.chip'), function(c){ var on=c===b; c.classList.toggle('on',on); c.setAttribute('aria-pressed',String(on)); }); load(); });
  $('#mt-venue').addEventListener('change', function(){ st.venue=this.value; load(); });
  $('#mt-sort').addEventListener('change', function(){ st.sort=this.value; load(); });
  $('#mt-past').addEventListener('change', function(){ st.past=this.checked; load(); });
  $('#mt-fav').addEventListener('change', function(){ st.fav=this.checked; draw(); });
  $('#mt-q').addEventListener('input', function(){ var v=this.value.trim(); clearTimeout(timer); timer=setTimeout(function(){ if(v!==st.q){ st.q=v; load(); } }, 350); });
  form.addEventListener('submit', function(e){ e.preventDefault(); st.q=$('#mt-q').value.trim(); load(); });
  document.addEventListener('ms:fav', function(){ if(st.fav) draw(); });
  load();
})();
