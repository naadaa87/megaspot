/* 공간 상세의 이용 후기 칸 (건대 2호 · 2026-11-25)
   <section id="reviews" data-review-space="공간 id"> 안의 #review-list · #review-form 을 채웁니다. 1호 상세는 space.js 가 같은 일을 합니다. */
(function(){
  var M=window.MEGASPOT; if(!M) return;
  var $=M.$, esc=M.esc, sec=document.querySelector('[data-review-space]'); if(!sec) return;
  var space=sec.getAttribute('data-review-space'), list=$('#review-list'), form=$('#review-form'); if(!list) return;
  var rvType=$('#rv-type'); if(rvType){ rvType.insertAdjacentHTML('beforeend',(window.MEGASPOT_PURPOSES||[]).map(function(p){ return '<option>'+esc(p.label)+'</option>'; }).join('')+'<option>기타</option>'); }
  function stars(n){ var s=''; for(var i=1;i<=5;i++) s+=i<=n?'★':'☆'; return s; }
  function render(items){
    if(!items||!items.length){
      list.innerHTML='<div class="empty"><b>아직 등록된 이용 후기가 없습니다</b>이용을 마친 행사의 후기부터 차례로 게시합니다. 후기는 광고 문구가 아니라 다음 주최자가 참고할 실제 기록으로 운영합니다.</div>';
      return;
    }
    list.innerHTML=items.map(function(r){ return '<div class="review mb-2"><div class="rh"><div><b>'+esc(r.author)+'</b> <span class="badge badge-ok" style="margin-left:6px">이용 확인</span></div><span class="small muted">'+esc((r.event_type||'')+(r.headcount?' · '+r.headcount+'명':'')+(r.used_at?' · '+r.used_at:''))+'</span></div><div class="stars" aria-label="만족도 '+r.rating+'점">'+stars(r.rating)+'</div><b class="mt-1" style="display:block">'+esc(r.title)+'</b><p class="small mt-1">'+esc(r.body)+'</p>'+(r.reply?'<div class="reply small mt-1"><b>메가스팟 답변</b> '+esc(r.reply)+'</div>':'')+'</div>'; }).join('');
  }
  M.api('/reviews?space='+encodeURIComponent(space)).then(function(r){ render(r.reviews||[]); }).catch(function(){ render([]); });
  if(form) form.addEventListener('submit',function(e){
    e.preventDefault(); var msg=$('#review-msg'); msg.hidden=true;
    if(!M.validate(form)) return;
    var d=M.formData(form); d.space_id=space;
    M.api('/reviews',{method:'POST',body:d}).then(function(){ msg.textContent='후기가 접수되었습니다. 예약 확인 후 게시합니다.'; msg.hidden=false; form.reset(); })
      .catch(function(ex){ msg.textContent=ex.code==='NO_API'?'지금은 후기 저장 기능이 연결되어 있지 않습니다. 카카오톡으로 보내 주시면 같은 기준으로 게시합니다.':(ex.message||'접수에 실패했습니다.'); msg.hidden=false; });
  });
})();
