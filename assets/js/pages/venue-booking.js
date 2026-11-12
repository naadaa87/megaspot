/* 입점 공간 예약 조회(/spaces/booking/?code=HB-…&k=…) — 진행 상태 · 견적 수락 · 결제 안내 · 입금 알림 · 메시지 · 취소 · 문서
   서버: GET/POST /api/venues/booking. 링크(k)가 없으면 예약번호와 휴대폰 뒷 4자리로 찾습니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, esc=M.esc, won=S.won, root=$('#vb'); if(!root) return;
  var q=S.qs(), AUTH={ code:(q.get('code')||'').toUpperCase(), k:q.get('k')||'', p:'' }, R=null;
  var STEPS=[['new','요청 접수'],['quoted','견적 안내'],['pending','예약 대기'],['confirmed','예약 확정'],['done','이용 완료']];
  function nl(t){ return esc(t).replace(/\n/g,'<br>'); }
  function lines(list, total, extra){ return '<table class="hc-lines"><tbody>'+list.map(function(l){ return '<tr><td>'+esc(l.label)+(l.desc?'<small>'+esc(l.desc)+'</small>':'')+'</td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('')+(extra||'')+'<tr class="sum"><td>합계</td><td>'+esc(won(total))+'</td></tr></tbody></table>'; }

  function finder(msg){
    $('#vb-loading').hidden=true; root.hidden=true; $('#vb-find').hidden=false;
    if(AUTH.code) $('#vb-code').value=AUTH.code; var er=$('#vb-err'); er.hidden=!msg; er.textContent=msg||'';
    var l=[]; try{ l=JSON.parse(localStorage.getItem('ms_venue_bookings')||'[]'); }catch(e){}
    $('#vb-recent').innerHTML=l.length?'<h2 class="h-s mt-4">이 기기에서 보낸 요청</h2><div class="hc-list">'+l.map(function(x){ return '<a class="hc-row" href="/spaces/booking/?code='+encodeURIComponent(x.code)+'&k='+encodeURIComponent(x.k)+'"><div><div class="r1"><b>'+esc(x.name||'')+'</b></div><div class="r2">'+esc([x.code, x.date?S.kdate(x.date):''].filter(Boolean).join(' · '))+'</div></div><div class="amt">보기 →</div></a>'; }).join('')+'</div>':'';
  }
  $('#vb-form').addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(this)) return; AUTH={ code:this.elements.code.value.trim().toUpperCase(), k:'', p:this.elements.p.value.trim() }; load(); });
  function load(){
    $('#vb-find').hidden=true; $('#vb-loading').hidden=false;
    var u=new URLSearchParams({ code:AUTH.code }); if(AUTH.k) u.set('k', AUTH.k); else u.set('p', AUTH.p);
    M.api('/venues/booking?'+u.toString()).then(show).catch(function(x){ finder(x&&x.code==='NO_API'?'서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.':(x&&x.message)||'예약을 찾지 못했습니다.'); });
  }
  function show(r){ R=r; AUTH.k=r.k; if(!q.get('k')) history.replaceState(null,'', '/spaces/booking/?code='+encodeURIComponent(r.booking.code)+'&k='+encodeURIComponent(r.k)); draw(); }
  function post(body, msg){
    body.code=AUTH.code; body.k=AUTH.k;
    return M.api('/venues/booking', { method:'POST', body:body }).then(function(r){ if(msg) M.toast(msg); show(r); }).catch(function(x){ M.toast((x&&x.message)||'처리하지 못했습니다.'); });
  }

  function payGuide(g, b){
    if(!g) return '';
    var m=g.methods||[], h='';
    if(g.deposit_amount && !b.paid) h+='<p><b>예약금 '+esc(won(g.deposit_amount))+'</b> ('+g.deposit_pct+'%)을 먼저 보내면 예약이 확정됩니다. 잔금 '+esc(won(b.amount-g.deposit_amount))+'은 호스트 안내에 따라 결제합니다.</p>';
    else if(b.due) h+='<p><b>결제할 금액 '+esc(won(b.due))+'</b></p>';
    if(m.indexOf('bank')>=0 && g.account) h+='<div class="vb-acct"><span>'+esc(g.bank)+' <b id="vb-acct">'+esc(g.account)+'</b><small>예금주 '+esc(g.holder)+'</small></span><button class="btn btn-light btn-sm" type="button" data-act="copy-acct">계좌 복사</button></div>';
    if(m.indexOf('card_link')>=0 && g.card_link) h+='<p><a class="btn btn-light btn-sm" href="'+esc(g.card_link)+'" target="_blank" rel="noopener">카드·간편결제로 결제하기 ↗</a></p>';
    if(m.indexOf('onsite')>=0) h+='<p class="small">현장 결제도 가능합니다.</p>';
    if(g.note) h+='<p class="small">'+nl(g.note)+'</p>';
    if(g.tax_invoice) h+='<p class="small">세금계산서가 필요하면 메시지로 사업자 정보를 알려 주세요.</p>';
    return h+'<p class="pf-help">결제는 호스트에게 직접 합니다. 메가스팟은 결제 수수료를 받지 않으며 결제 대금을 보관하지 않습니다.</p>';
  }
  function draw(){
    var b=R.booking, sp=R.space, qt=b.quote, est=b.estimate, g=b.pay_guide, idx=-1; STEPS.forEach(function(s, i){ if(s[0]===b.status) idx=i; });
    var dead=b.status==='cancelled'||b.status==='declined', docs='/docs/?code='+encodeURIComponent(b.code)+'&k='+encodeURIComponent(AUTH.k);
    var when=[b.date?S.kdate(b.date):'날짜 미정', S.timeRange(b.start,b.end), b.people?b.people+'명':''].filter(Boolean).join(' · ');
    var now='';
    if(b.status==='new') now='<h2>호스트가 일정과 금액을 확인하고 있습니다</h2><p>확인이 끝나면 이 화면에 견적이나 결제 안내가 표시됩니다. 궁금한 점은 아래 메시지로 남겨 주세요.</p>';
    else if(b.status==='quoted' && qt) now='<h2>견적이 도착했습니다</h2>'+lines(qt.lines, qt.total)+(qt.note?'<p class="small">'+nl(qt.note)+'</p>':'')+'<p class="small muted">'+esc(S.kdate(qt.valid_until))+'까지 유효한 견적입니다.</p>'
      +'<div class="hc-acts"><button class="btn btn-primary" type="button" data-act="accept">이 견적으로 진행하기</button><a class="btn btn-light" href="'+esc(docs+'&type=quote')+'" target="_blank" rel="noopener">견적서 PDF</a></div><p class="pf-help">진행하기를 누르면 결제 안내가 표시됩니다. 조정이 필요하면 메시지로 알려 주세요.</p>';
    else if(b.status==='pending') now='<h2>일정이 확인되었습니다. 결제하면 예약이 확정됩니다</h2><p>확정 금액 <b>'+esc(won(b.amount))+'</b></p>'+payGuide(g, b)
      +(b.paid_notice?'<p class="pf-msg ok">'+esc(b.paid_notice.at)+'에 입금(결제)했다고 알렸습니다. 호스트가 확인하면 예약이 확정됩니다.</p>'
        :'<div class="vb-notice"><label for="vb-note">결제했다면 호스트에게 알려 주세요</label><div class="row"><input class="input" id="vb-note" maxlength="200" placeholder="입금자명 등 (선택)"><button class="btn btn-primary" type="button" data-act="paid">입금(결제)했어요</button></div></div>');
    else if(b.status==='confirmed') now='<h2>예약이 확정되었습니다</h2><p><b>'+esc(when)+'</b> · '+esc(sp.name)+'</p>'+(b.due?payGuide(g, b):'<p class="pf-msg ok">결제가 모두 확인되었습니다.</p>')
      +(b.cancel_requested?'<p class="pf-msg warn">취소를 요청했습니다. 호스트가 환불 규정에 따라 처리합니다.</p>':'');
    else if(b.status==='done') now='<h2>이용이 끝났습니다</h2><p>메가스팟을 이용해 주셔서 고맙습니다. 다음 행사도 여기에서 준비해 보세요.</p><div class="hc-acts"><a class="btn btn-light" href="/spaces/">다른 공간 찾기</a></div>';
    else now='<h2>'+(b.status==='declined'?'호스트가 이 일정으로는 진행하기 어렵다고 알려 왔습니다':'취소된 요청입니다')+'</h2>'+(b.cancel&&b.cancel.reason?'<p>'+esc(b.cancel.reason)+'</p>':'')
      +'<div class="hc-acts"><a class="btn btn-primary" href="/spaces/">다른 공간 찾기</a><a class="btn btn-light" href="/planning/">행사 준비 맡기기</a></div>';
    var money=qt&&b.status!=='quoted'?'<h3>견적</h3>'+lines(qt.lines, qt.total)+(qt.note?'<p class="small">'+nl(qt.note)+'</p>':''):(!qt&&est?'<h3>요청할 때 본 예상 금액</h3>'+lines(est.lines, est.total, est.vat?'<tr><td>부가세 10%</td><td>'+esc(won(est.vat))+'</td></tr>':'')+(est.deposit?'<p class="pf-help">보증금 '+esc(won(est.deposit))+' 별도</p>':''):'');
    if(b.amount!=null && (b.status==='pending'||b.status==='confirmed'||b.status==='done')) money+='<dl class="hc-kv mt-2"><dt>확정 금액</dt><dd><b>'+esc(won(b.amount))+'</b></dd><dt>확인된 결제</dt><dd>'+esc(won(b.paid))+'</dd><dt>남은 금액</dt><dd>'+esc(won(b.due))+'</dd></dl>';
    root.innerHTML='<header class="vb-head"><div>'+S.st(b.status, b.status_label)+'<h1>'+esc(sp.name)+'</h1><p>'+esc(when)+'</p><p class="small muted">예약번호 '+esc(b.code)+' · '+esc(String(b.created_at).slice(0,10))+' 요청</p></div>'
      +(sp.cover?'<a href="/spaces/view/?id='+encodeURIComponent(sp.id)+'"><img src="'+esc(sp.cover)+'" alt="'+esc(sp.name)+'"></a>':'')+'</header>'
      +(dead?'':'<ol class="vb-steps">'+STEPS.map(function(s, i){ return '<li class="'+(i<idx?'past':i===idx?'now':'')+'"><i>'+(i<idx?'✓':i+1)+'</i><span>'+s[1]+'</span></li>'; }).join('')+'</ol>')
      +'<section class="hc-card vb-now">'+now+'</section>'
      +'<div class="hc-grid c2 mt-2"><section class="hc-card"><h2>요청 내용</h2><dl class="hc-kv"><dt>공간</dt><dd><a class="pf-link" href="/spaces/view/?id='+encodeURIComponent(sp.id)+'">'+esc(sp.name)+'</a></dd><dt>주소</dt><dd>'+esc(sp.address_full||sp.address)+'</dd><dt>이용 일시</dt><dd>'+esc(when)+'</dd>'
        +(b.purpose_label?'<dt>모임</dt><dd>'+esc(b.purpose_label)+'</dd>':'')+(b.options.length?'<dt>옵션</dt><dd>'+esc(b.options.map(function(o){ return o.name+' '+o.qty+o.unit; }).join(', '))+'</dd>':'')+(b.visit?'<dt>현장답사</dt><dd>답사를 먼저 요청했습니다</dd>':'')
        +'<dt>신청자</dt><dd>'+esc(b.name)+(b.org?' · '+esc(b.org):'')+'</dd></dl>'+money+'</section>'
      +'<section class="hc-card"><h2>호스트와 메시지</h2><div class="hc-thread" id="vb-thread">'+(b.messages.length?b.messages.map(function(m){ return '<div class="hc-bubble'+(m.from==='customer'?' me':'')+'">'+nl(m.text)+'<small>'+(m.from==='customer'?'나':m.from==='host'?'호스트':'메가스팟')+' · '+esc(m.at)+'</small></div>'; }).join(''):'<p class="small muted">아직 메시지가 없습니다.</p>')+'</div>'
        +(b.open||b.status==='done'?'<div class="hc-send"><textarea class="textarea" id="vb-msg" maxlength="1000" placeholder="호스트에게 보낼 메시지"></textarea><button class="btn btn-primary btn-sm" type="button" data-act="msg">보내기</button></div>':'')
        +(sp.contact&&(sp.contact.phone||sp.contact.kakao)?'<div class="hc-acts mt-2">'+(sp.contact.phone?'<a class="btn btn-light btn-sm" href="tel:'+esc(sp.contact.phone.replace(/[^0-9+]/g,''))+'">호스트 전화 '+esc(sp.contact.phone)+'</a>':'')+(sp.contact.kakao?'<a class="btn btn-light btn-sm" href="'+esc(sp.contact.kakao)+'" target="_blank" rel="noopener">카카오톡 문의</a>':'')+'</div>':'')+'</section></div>'
      +((R.hq_addons||[]).length?'<section class="hc-card mt-2"><h2>메가스팟 부가서비스 <small>메가스팟 본사가 준비합니다</small></h2><div class="hc-acts">'+R.hq_addons.map(function(a){ return '<span class="hc-flag hq">'+esc(a.label)+' · '+esc(a.status_label)+(a.amount?' · '+esc(won(a.amount)):'')+'</span>'; }).join('')+'</div>'
        +'<p class="pf-help mt-1">메가스팟 담당자가 따로 연락해 견적과 준비 내용을 안내합니다. 공간 이용료와는 별도로 메가스팟에 결제합니다. 문의 <a class="pf-link" href="tel:01023849580" data-phone>010-2384-9580</a></p></section>':'')
      +'<section class="hc-card mt-2"><h2>문서 내려받기</h2><div class="hc-acts"><a class="btn btn-light btn-sm" href="'+esc(docs+'&type=quote')+'" target="_blank" rel="noopener">견적서 PDF</a><a class="btn btn-light btn-sm" href="'+esc(docs+'&type=plan')+'" target="_blank" rel="noopener">행사기획서 PDF</a><a class="btn btn-light btn-sm" href="/docs/?type=space&id='+encodeURIComponent(sp.id)+'" target="_blank" rel="noopener">공간소개서 PDF</a><button class="btn btn-light btn-sm" type="button" data-act="copy-link">이 화면 링크 복사</button></div>'
        +'<p class="pf-help mt-1">사내 보고나 결재에 바로 쓸 수 있도록 지금 진행 상태 기준으로 만들어집니다.</p></section>'
      +'<section class="hc-card mt-2"><h2>환불 규정</h2><p class="small" style="line-height:1.7">'+nl(S.refundText(sp.refund))+'</p>'
        +(b.open&&!b.cancel_requested?'<div class="mt-2"><button class="btn btn-ghost btn-sm" type="button" data-act="cancel">'+(b.status==='confirmed'?'예약 취소 요청':'요청 취소')+'</button></div>':'')
        +(sp.seller&&sp.seller.company?'<p class="pf-help mt-2">계약 상대방: '+esc(sp.seller.company)+(sp.seller.biz_no?' (사업자등록번호 '+esc(sp.seller.biz_no)+')':'')+' · 메가스팟은 통신판매중개자이며 이용 계약의 당사자가 아닙니다.</p>':'')+'</section>';
    $('#vb-loading').hidden=true; $('#vb-find').hidden=true; root.hidden=false; var th=$('#vb-thread'); th.scrollTop=th.scrollHeight;
  }
  root.addEventListener('click', function(e){
    var a=e.target.closest('[data-act]'); if(!a) return; var t=a.getAttribute('data-act'), b=R.booking;
    if(t==='accept'){ if(confirm('이 견적('+won(b.quote.total)+')으로 진행할까요?')) post({ action:'accept' }, '견적을 수락했습니다. 결제 안내를 확인해 주세요.'); }
    else if(t==='paid') post({ action:'paid_notice', note:$('#vb-note').value }, '호스트에게 알렸습니다.');
    else if(t==='msg'){ var m=$('#vb-msg'); if(!m.value.trim()) return m.focus(); post({ action:'message', text:m.value }); }
    else if(t==='cancel'){ var why=prompt(b.status==='confirmed'?'취소 사유를 적어 주세요. 호스트가 환불 규정에 따라 처리합니다.':'취소 사유 (선택)', ''); if(why===null) return; post({ action:'cancel', reason:why }, b.status==='confirmed'?'취소를 요청했습니다.':'요청을 취소했습니다.'); }
    else if(t==='copy-acct') M.copy($('#vb-acct').textContent).then(function(ok){ M.toast(ok?'계좌번호를 복사했습니다.':'복사하지 못했습니다.'); });
    else if(t==='copy-link') M.copy(location.href).then(function(ok){ M.toast(ok?'링크를 복사했습니다.':'복사하지 못했습니다.'); });
  });
  if(/^HB-[A-Z0-9-]+$/.test(AUTH.code) && AUTH.k) load(); else finder('');
})();
