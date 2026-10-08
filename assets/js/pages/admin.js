/* 운영자 페이지 */
(function(){
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc;
  var KEY=null;
  function A(path, opts){ opts=opts||{}; opts.adminKey=KEY; return M.api('/admin'+path, opts); }
  var STATUSES=['문의 접수','조건 확인','견적 발송','결제 대기','예약 확정','이용 완료','취소·환불'];
  var SLOT={am:'오전',pm:'오후',ev:'저녁',day:'종일',custom:'직접 입력'};
  var spaces=window.MEGASPOT_SPACES||[];

  function enter(){
    var k=$('#adm-key').value.trim(); if(!k){ $('#adm-status').textContent='키를 입력하세요.'; return; }
    KEY=k; $('#adm-status').textContent='확인 중…';
    A('/ping').then(function(){ sessionStorage.setItem('ms_admin_key',k); $('#admin-login').hidden=true; $('#admin-app').hidden=false; loadInquiries(); fillSpaces(); })
    .catch(function(e){ KEY=null; $('#adm-status').textContent = e.code==='NO_API' ? 'API가 연결되어 있지 않습니다. Cloudflare Pages에 D1 바인딩(DB)과 ADMIN_KEY를 설정했는지 확인하세요.' : (e.status===401?'키가 올바르지 않습니다.':(e.message||'접속 실패')); });
  }
  $('#adm-enter').addEventListener('click', enter);
  $('#adm-key').addEventListener('keydown', function(e){ if(e.key==='Enter') enter(); });
  $('#adm-logout').addEventListener('click', function(){ sessionStorage.removeItem('ms_admin_key'); location.reload(); });
  var saved=sessionStorage.getItem('ms_admin_key'); if(saved){ $('#adm-key').value=saved; enter(); }

  function fillSpaces(){ var o=spaces.map(function(s){ return '<option value="'+s.id+'">'+esc(s.name)+'</option>'; }).join(''); $('#bk-space').innerHTML=o; $('#cal-space').innerHTML=o; }

  // 탭
  $('#adm-tabs').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; $$('#adm-tabs button').forEach(function(x){x.classList.toggle('on',x===b);}); ['inquiries','bookings','reviews','calendar','hosts'].forEach(function(t){ $('#tab-'+t).hidden = t!==b.dataset.tab; }); ({inquiries:loadInquiries,bookings:loadBookings,reviews:loadReviews,calendar:loadCalendar,hosts:loadHosts})[b.dataset.tab](); });

  /* 문의함 */
  function loadInquiries(){
    var st=$('#inq-status-filter').value, q=$('#inq-q').value.trim();
    A('/inquiries?status='+encodeURIComponent(st)+'&q='+encodeURIComponent(q)).then(function(r){
      var list=r.items||[]; if(!list.length){ $('#inq-list').innerHTML='<div class="empty"><b>표시할 문의가 없습니다</b></div>'; return; }
      $('#inq-list').innerHTML=list.map(function(it){
        var d=it.data||{}; var sp=spaces.find(function(s){return s.id===it.space_id;});
        return '<div class="card pad-s"><div class="row between"><div class="row"><b style="font-family:var(--font-display);font-size:18px;letter-spacing:.02em;color:var(--cobalt)">'+esc(it.ref)+'</b><span class="badge badge-soft">'+esc(sp?sp.name:(it.space_id==='request'?'맞춤 공간 요청':it.space_id))+'</span><span class="small muted">'+esc((it.created_at||'').slice(0,16).replace('T',' '))+'</span></div>'
          + '<select class="select" data-ref="'+esc(it.ref)+'" data-act="status" style="min-height:36px;padding:6px 30px 6px 10px;font-size:13px;width:auto">'+STATUSES.map(function(s){return '<option'+(s===it.status?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div>'
          + '<div class="grid grid-2 mt-2 small" style="gap:4px 16px"><div><b>'+esc(d.name||'')+'</b> · <a href="tel:'+esc(d.phone||'')+'">'+esc(d.phone||'')+'</a>'+(d.email?' · '+esc(d.email):'')+'</div><div>'+esc(d.date||'')+(d.date_alt?' (대체 '+esc(d.date_alt)+')':'')+' · '+esc(SLOT[d.slot]||d.slot||'')+' · '+esc(d.headcount||'-')+'명</div></div>'
          + '<details class="mt-2"><summary class="small" style="cursor:pointer;color:var(--cobalt);font-weight:700">문의 내용 전체</summary><pre style="white-space:pre-wrap;font:13px/1.6 var(--font-body);background:var(--concrete-3);padding:10px;border-radius:4px;margin-top:8px">'+esc(d.summary||JSON.stringify(d,null,1))+'</pre></details>'
          + '<div class="row mt-2"><input class="input" data-ref="'+esc(it.ref)+'" data-act="memo" value="'+esc(it.memo||'')+'" placeholder="운영 메모 (견적 금액, 통화 내용 등)" style="min-height:38px;flex:1"><button class="btn btn-light btn-sm" data-ref="'+esc(it.ref)+'" data-act="save">메모 저장</button></div></div>';
      }).join('');
    }).catch(function(e){ $('#inq-list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
  }
  $('#inq-reload').addEventListener('click', loadInquiries); $('#inq-status-filter').addEventListener('change', loadInquiries); $('#inq-q').addEventListener('keydown', function(e){ if(e.key==='Enter') loadInquiries(); });
  $('#inq-list').addEventListener('change', function(e){ var el=e.target; if(el.dataset.act==='status'){ A('/inquiries/'+el.dataset.ref,{method:'PATCH', body:{status:el.value}}).then(function(){ M.toast('상태를 변경했습니다.'); }).catch(function(x){ M.toast(x.message); }); } });
  $('#inq-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-act=save]'); if(!b) return; var memo=$('#inq-list input[data-act=memo][data-ref="'+b.dataset.ref+'"]').value; A('/inquiries/'+b.dataset.ref,{method:'PATCH', body:{memo:memo}}).then(function(){ M.toast('메모를 저장했습니다.'); }).catch(function(x){ M.toast(x.message); }); });

  /* 예약 */
  function loadBookings(){
    A('/bookings').then(function(r){ var list=r.items||[]; $('#bk-list').innerHTML = list.length? list.map(function(b){ return '<div class="card pad-s"><div class="row between"><div class="row"><b style="font-family:var(--font-display);font-size:17px;color:var(--cobalt)">'+esc(b.booking_code)+'</b><span class="badge '+(b.status==='completed'?'badge-ok':'badge-cobalt')+'">'+(b.status==='completed'?'이용 완료':'예약 확정')+'</span></div><span class="small muted">'+esc(b.date)+' · '+esc(SLOT[b.slot]||b.slot)+'</span></div><div class="small mt-1">'+esc(b.customer_name)+' · '+esc(b.phone)+(b.headcount?' · '+b.headcount+'명':'')+(b.inquiry_ref?' · 문의 '+esc(b.inquiry_ref):'')+'</div>'+(b.memo?'<div class="tiny muted mt-1">'+esc(b.memo)+'</div>':'')+(b.status!=='completed'?'<button class="btn btn-light btn-sm mt-2" data-code="'+esc(b.booking_code)+'" data-act="complete">이용 완료 처리</button>':'')+'</div>'; }).join('') : '<div class="empty"><b>등록된 예약이 없습니다</b></div>'; }).catch(function(e){ $('#bk-list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
  }
  $('#bk-reload').addEventListener('click', loadBookings);
  $('#bk-form').addEventListener('submit', function(e){ e.preventDefault(); var f=e.target; if(!M.validate(f)) return; var d=M.formData(f); d.block_calendar=!!f.block_calendar.checked; A('/bookings',{method:'POST', body:d}).then(function(r){ var m=$('#bk-msg'); m.innerHTML='예약이 등록되었습니다. 예약번호 <b>'+esc(r.booking_code)+'</b> — 고객에게 안내해 주세요.'; m.hidden=false; f.reset(); fillSpaces(); loadBookings(); }).catch(function(x){ var m=$('#bk-msg'); m.textContent=x.message; m.hidden=false; }); });
  $('#bk-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-act=complete]'); if(!b) return; if(!confirm('이용 완료로 처리할까요? 처리 후 고객이 후기를 작성할 수 있습니다.')) return; A('/bookings/'+b.dataset.code,{method:'PATCH', body:{status:'completed'}}).then(loadBookings).catch(function(x){ M.toast(x.message); }); });

  /* 후기 */
  function loadReviews(){
    A('/reviews?status='+encodeURIComponent($('#rv-filter').value)).then(function(r){ var list=r.items||[]; $('#rv-list').innerHTML = list.length? list.map(function(v){ return '<div class="review"><div class="rh"><div><b>'+esc(v.author)+'</b> <span class="small muted">· '+esc(v.booking_code)+' · '+esc((v.created_at||'').slice(0,10))+'</span></div><span class="badge '+(v.status==='approved'?'badge-ok':v.status==='hidden'?'badge-soft':'badge-warn')+'">'+({approved:'게시 중',hidden:'숨김',pending:'승인 대기'}[v.status]||v.status)+'</span></div><div class="stars">'+'★'.repeat(+v.rating)+'☆'.repeat(5-v.rating)+'</div><h3 style="font-size:16px;margin:6px 0">'+esc(v.title)+'</h3><div class="rb">'+esc(v.body)+'</div><div class="row mt-2"><input class="input" data-id="'+v.id+'" data-act="reply" value="'+esc(v.reply||'')+'" placeholder="운영자 답변" style="min-height:38px;flex:1"><button class="btn btn-light btn-sm" data-id="'+v.id+'" data-act="approve">게시</button><button class="btn btn-light btn-sm" data-id="'+v.id+'" data-act="hide">숨김</button></div></div>'; }).join('') : '<div class="empty"><b>표시할 후기가 없습니다</b></div>'; }).catch(function(e){ $('#rv-list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
  }
  $('#rv-reload').addEventListener('click', loadReviews); $('#rv-filter').addEventListener('change', loadReviews);
  $('#rv-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-act]'); if(!b) return; var reply=$('#rv-list input[data-act=reply][data-id="'+b.dataset.id+'"]').value; A('/reviews/'+b.dataset.id,{method:'PATCH', body:{status:b.dataset.act==='approve'?'approved':'hidden', reply:reply}}).then(function(){ M.toast('저장했습니다.'); loadReviews(); }).catch(function(x){ M.toast(x.message); }); });

  /* 일정 */
  function loadCalendar(){
    A('/calendar').then(function(r){ var list=r.items||[]; $('#cal-list').innerHTML = list.length? list.map(function(c){ return '<div class="card pad-s row between"><div><b>'+esc(c.date)+'</b> <span class="badge '+(c.state==='full'?'badge-soft':'badge-warn')+'">'+(c.state==='full'?'마감':'임시 확보')+'</span> <span class="small muted">'+esc(c.memo||'')+'</span></div><button class="btn btn-light btn-sm" data-act="del" data-space="'+esc(c.space_id)+'" data-date="'+esc(c.date)+'">해제</button></div>'; }).join('') : '<div class="empty"><b>등록된 일정이 없습니다</b></div>'; }).catch(function(e){ $('#cal-list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
  }
  $('#cal-reload').addEventListener('click', loadCalendar);
  $('#cal-form').addEventListener('submit', function(e){ e.preventDefault(); var f=e.target; if(!M.validate(f)) return; var d=M.formData(f); A('/calendar',{method:'POST', body:d}).then(function(){ var m=$('#cal-msg'); m.textContent='저장했습니다.'; m.hidden=false; loadCalendar(); }).catch(function(x){ var m=$('#cal-msg'); m.textContent=x.message; m.hidden=false; }); });
  $('#cal-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-act=del]'); if(!b) return; A('/calendar',{method:'POST', body:{space_id:b.dataset.space, date:b.dataset.date, state:'open'}}).then(loadCalendar).catch(function(x){ M.toast(x.message); }); });

  /* 입점 */
  function loadHosts(){
    A('/hosts').then(function(r){ var list=r.items||[]; $('#host-list').innerHTML = list.length? list.map(function(h){ var d=h.data||{}; return '<div class="card pad-s"><div class="row between"><div><b>'+esc(d.space_name||'')+'</b> <span class="small muted">· '+esc(d.address||'')+' · '+esc(h.ref)+'</span></div><span class="small muted">'+esc((h.created_at||'').slice(0,10))+'</span></div><div class="small mt-1">'+esc(d.area||'-')+'평 · 최대 '+esc(d.capacity||'-')+'명 · '+esc(d.space_type||'-')+' · '+esc(d.role||'')+'</div><div class="small mt-1">'+esc(d.name||'')+' · <a href="tel:'+esc(d.phone||'')+'">'+esc(d.phone||'')+'</a>'+(d.email?' · '+esc(d.email):'')+(d.link?' · <a href="'+esc(d.link)+'" target="_blank" rel="noopener">링크</a>':'')+'</div>'+(d.message?'<div class="tiny muted mt-1">'+esc(d.message)+'</div>':'')+'</div>'; }).join('') : '<div class="empty"><b>입점 문의가 없습니다</b></div>'; }).catch(function(e){ $('#host-list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'; });
  }
  $('#host-reload').addEventListener('click', loadHosts);
})();
