/* 호스트센터(/host/center/) — 홈 · 문의·예약 · 일정 · 공간 정보 · 통계 · 정산 · 이용료 · 계정
   서버: /api/hosts/* (functions/api/hosts/[[path]].js). 결제는 고객에게 직접 받고, 여기서는 받은 금액을 기록합니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, $$=M.$$, esc=M.esc, P=S.P, api=S.hostApi, won=S.won, main=$('#hc-main'); if(!main) return;
  var ST={ host:null, spaces:[], cur:'', tab:'home', today:S.today() };
  var BST={ new:'새 문의', quoted:'견적 안내', pending:'예약 대기', confirmed:'예약 확정', done:'이용 완료', cancelled:'취소', declined:'진행 불가' };
  var PAYK={ deposit:'예약금', balance:'잔금', full:'전액', extra:'추가 결제', refund:'환불' }, PAYM={ bank:'계좌이체', card_link:'카드·간편결제', onsite:'현장 결제', cash:'현금', etc:'기타' };
  function oops(e){ if(e && e.code==='HOST_LOGIN') return; M.toast(e && e.code==='NO_API'?'서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.':(e&&e.message)||'처리하지 못했습니다.'); }
  function space(ref){ return ST.spaces.filter(function(s){ return s.ref===ref; })[0]||null; }
  function cur(){ return space(ST.cur)||ST.spaces[0]||null; }
  function q(extra){ return (ST.cur?'space='+encodeURIComponent(ST.cur):'')+(extra?(ST.cur?'&':'')+extra:''); }
  function head(title, sub, right){ return '<div class="hc-h"><div><h1>'+esc(title)+'</h1>'+(sub?'<p>'+sub+'</p>':'')+'</div>'+(right||'')+'</div>'; }
  function empty(t){ return '<div class="hc-empty">'+t+'</div>'; }
  function when(b){ return [b.date?S.kdate(b.date):'날짜 미정', S.timeRange(b.start,b.end), b.people?b.people+'명':''].filter(Boolean).join(' · '); }
  function v(form, name){ var el=form.elements[name]; return el?String(el.value||'').trim():''; }
  function telFmt(el){ el.addEventListener('input', function(){ var x=this.value.replace(/[^0-9]/g,'').slice(0,11); if(x.length>7) x=x.replace(/(\d{3})(\d{3,4})(\d{1,4})/,'$1-$2-$3'); else if(x.length>3) x=x.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=x; }); }

  /* ---------- 틀 ---------- */
  function drawer(title, html){ $('#hc-d-title').innerHTML=title; var b=$('#hc-d-body'); b.innerHTML=html; $('#hc-drawer').hidden=false; document.body.classList.add('hc-lock'); b.scrollTop=0; return b; }
  function closeDrawer(){ $('#hc-drawer').hidden=true; document.body.classList.remove('hc-lock'); if(/^#b=/.test(location.hash)) history.replaceState(null,'','#'+ST.tab); }
  $('#hc-drawer').addEventListener('click', function(e){ if(e.target.closest('[data-close]')) closeDrawer(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && !$('#hc-drawer').hidden) closeDrawer(); });
  function fillSpaces(){
    var sel=$('#hc-space');
    sel.innerHTML=(ST.spaces.length>1?'<option value="">전체 공간 ('+ST.spaces.length+'곳)</option>':'')+ST.spaces.map(function(s){ return '<option value="'+esc(s.ref)+'">'+esc(s.name)+' · '+esc(s.status_label)+'</option>'; }).join('')+'<option value="+">+ 공간 추가</option>';
    sel.value=ST.cur; var c=cur(), pub=$('#hc-public'); pub.hidden=!(c&&c.visible&&ST.cur); if(c) pub.href='/spaces/view/?id='+encodeURIComponent(c.ref);
    var n=0; ST.spaces.forEach(function(s){ if(!ST.cur||s.ref===ST.cur) n+=(s.counts&&s.counts.new)||0; }); var em=$('#hc-n-new'); em.textContent=n; em.hidden=!n;
  }
  $('#hc-space').addEventListener('change', function(){ if(this.value==='+'){ this.value=ST.cur; location.hash='#add'; return; } ST.cur=this.value; try{ sessionStorage.setItem('hc_space', ST.cur); }catch(e){} fillSpaces(); show(ST.tab); });
  $('#hc-logout').addEventListener('click', function(){ M.api('/hosts/logout',{method:'POST'}).catch(function(){}).then(function(){ location.href='/host/login/'; }); });
  function reload(){ return api('/me').then(function(r){ ST.host=r.host; ST.spaces=r.spaces||[]; ST.today=r.today||S.today(); if(ST.cur && !space(ST.cur)) ST.cur=''; if(!ST.cur && ST.spaces.length===1) ST.cur=ST.spaces[0].ref; fillSpaces(); return r; }); }
  var VIEWS={};
  function show(tab){
    if(!VIEWS[tab]) tab='home'; ST.tab=tab;
    $$('#hc-nav a').forEach(function(a){ var on=a.getAttribute('data-tab')===tab; a.classList.toggle('on', on); if(on){ a.setAttribute('aria-current','page'); a.scrollIntoView({block:'nearest', inline:'center'}); } else a.removeAttribute('aria-current'); });
    main.innerHTML='<div class="hc-empty">불러오는 중…</div>'; window.scrollTo(0,0); VIEWS[tab]();
  }
  function route(){
    var h=location.hash.replace(/^#/,''), m;
    if(!/^b=/.test(h) && !$('#hc-drawer').hidden){ $('#hc-drawer').hidden=true; document.body.classList.remove('hc-lock'); }
    if((m=/^space=(SP-[A-Z0-9-]+)$/.exec(h))){ if(space(m[1])){ ST.cur=m[1]; fillSpaces(); } return show('space'); }
    if((m=/^b=(HB-[A-Z0-9-]+)$/.exec(h))){ show('bookings'); return openBooking(m[1]); }
    if(h==='add') return addSpace();
    show(h||'home');
  }
  window.addEventListener('hashchange', route);
  // 주소가 이미 그 메뉴를 가리키고 있어도(상세를 닫은 직후 등) 메뉴를 누르면 다시 엽니다
  $('#hc-nav').addEventListener('click', function(e){ var a=e.target.closest('a[data-tab]'); if(a && location.hash==='#'+a.getAttribute('data-tab')){ e.preventDefault(); show(a.getAttribute('data-tab')); } });

  /* ---------- 홈 ---------- */
  function banner(s){
    var until=s.listed_until, left=s.days_left, kind='info', title='', body='', btn='';
    if(s.status==='draft'){ title='입점 신청이 접수되었습니다'; body='<p>아래 항목을 채우고 <b>심사 요청</b>을 누르면 메가스팟 운영팀이 확인합니다.</p><ul data-missing="'+esc(s.ref)+'"><li>확인하는 중…</li></ul>'; btn='<a class="btn btn-primary btn-sm" href="#space='+esc(s.ref)+'">공간 정보 채우기 →</a>'; }
    else if(s.status==='review'){ kind='warn'; title='메가스팟 운영팀이 등록 내용을 확인하고 있습니다'; body='<p>확인이 끝나면 이 화면에 결과가 표시됩니다. 기다리는 동안에도 공간 정보와 사진은 고칠 수 있습니다.</p>'; }
    else if(s.status==='fix'){ kind='bad'; title='보완 요청이 있습니다'; body='<p>'+esc(s.review_note||'')+'</p>'; btn='<a class="btn btn-primary btn-sm" href="#space='+esc(s.ref)+'">고치러 가기 →</a>'; }
    else if(s.status==='rejected'||s.status==='hidden'){ kind='bad'; title=s.status==='rejected'?'입점이 반려되었습니다':'운영팀이 공간을 숨겼습니다'; body='<p>'+esc(s.review_note||'자세한 내용은 운영팀에 문의해 주세요.')+'</p>'; }
    else if(s.status==='paused'){ kind='warn'; title='예약 받기를 잠시 멈췄습니다'; body='<p>검색과 상세 화면에 보이지 않습니다. 다시 받을 준비가 되면 켜 주세요.</p>'; btn='<button class="btn btn-primary btn-sm" type="button" data-resume="'+esc(s.ref)+'">다시 공개하기</button>'; }
    else if(s.status==='live' && !s.visible){ kind='bad'; title='등록 기간이 끝나 검색에서 내려갔습니다'; body='<p>'+esc(S.kdate(until))+'에 끝났습니다. 등록 기간을 고르면 다시 공개됩니다. 수수료는 없고 월 정액 이용료만 냅니다.</p>'; btn='<a class="btn btn-primary btn-sm" href="#billing">등록 기간 고르기 →</a>'; }
    else { kind=left!=null&&left<=14?'warn':'live'; var free=s.free_until && s.free_until>=(s.paid_until||''); title='공개 중'+(left!=null?' · '+(free?'무료 등록 ':'등록 ')+'D-'+Math.max(0,left):'');
      body='<p>'+(free?'무료 등록 기간':'등록 기간')+'은 <b>'+esc(S.kdate(until))+'</b>까지입니다.'+(left!=null&&left<=14?' 끝나기 전에 등록 기간을 골라 주세요.':'')+'</p>';
      btn='<a class="btn btn-light btn-sm" href="/spaces/view/?id='+encodeURIComponent(s.ref)+'" target="_blank" rel="noopener">내 공간 페이지 ↗</a>'+(left!=null&&left<=30?'<a class="btn btn-primary btn-sm" href="#billing">등록 기간 고르기 →</a>':''); }
    return '<div class="hc-banner '+kind+'"><h2>'+S.tierBadge(s.tier)+esc(s.name)+' <span class="pf-st '+esc(s.status)+'">'+esc(s.status_label)+'</span></h2><div><b>'+esc(title)+'</b></div>'+body+(btn?'<div class="hc-acts">'+btn+'</div>':'')+'</div>';
  }
  function bookingRow(b){
    var flags=(b.paid_notice?'<span class="hc-flag">입금 알림</span>':'')+(b.cancel_requested?'<span class="hc-flag">취소 요청</span>':'')+(b.last==='customer'&&b.status!=='new'?'<span class="hc-flag soft">고객 메시지</span>':'')
      +(b.source==='host'?'<span class="hc-flag soft">직접 등록</span>':'')+(b.addons||[]).map(function(a){ return '<span class="hc-flag hq">'+esc(a)+'</span>'; }).join('');
    return '<button type="button" class="hc-row" data-b="'+esc(b.code)+'"><div><div class="r1">'+S.st(b.status, BST[b.status])+'<b>'+esc(b.name)+'</b>'+flags+'</div><div class="r2">'+esc(when(b))+(ST.cur?'':' · '+esc(b.space_name||''))+(b.purpose_label?' · '+esc(b.purpose_label):'')+'</div></div>'
      +'<div class="amt">'+(b.amount!=null?esc(won(b.amount)):'금액 미정')+(b.amount!=null&&b.status!=='new'&&b.status!=='quoted'?'<small>'+(b.due?'받을 금액 '+esc(won(b.due)):'결제 완료')+'</small>':'')+'</div></button>';
  }
  VIEWS.home=function(){
    var list=ST.cur?[cur()]:ST.spaces, c={}; list.forEach(function(s){ Object.keys(s.counts||{}).forEach(function(k){ c[k]=(c[k]||0)+s.counts[k]; }); });
    main.innerHTML=head('안녕하세요, '+ST.host.name+' 님', '오늘 확인할 문의와 예약, 내 공간 상태를 모았습니다.')
      +list.map(banner).join('')
      +'<div class="hc-kpis">'+[['new','새 문의','답변을 기다리는 요청'],['quoted','견적 안내','고객 수락 대기'],['pending','예약 대기','결제 확인 대기'],['confirmed','예약 확정','다가오는 행사']].map(function(k){
          return '<button type="button" class="hc-kpi'+(k[0]==='new'&&c.new?' hot':'')+'" data-goto="bookings:'+k[0]+'"><small>'+k[1]+'</small><b>'+(c[k[0]]||0)+'</b><span>'+k[2]+'</span></button>'; }).join('')+'</div>'
      +'<div class="hc-grid c21" style="margin-top:14px"><div class="hc-card"><h2>먼저 볼 문의·예약 <a class="pf-link" href="#bookings" style="font-size:13.5px">전체 보기</a></h2><div id="hm-list" class="hc-list">'+empty('불러오는 중…')+'</div></div>'
      +'<div><div class="hc-card"><h2>최근 30일 <a class="pf-link" href="#stats" style="font-size:13.5px">통계</a></h2><div id="hm-stats"></div></div><div class="hc-card" id="hm-save"></div></div></div>';
    $$('[data-missing]', main).forEach(function(ul){ api('/spaces/'+ul.getAttribute('data-missing')).then(function(r){ ul.innerHTML=(r.missing||[]).length?r.missing.map(function(m){ return '<li>'+esc(m)+'</li>'; }).join(''):'<li>필요한 항목을 모두 채웠습니다. 공간 정보에서 심사를 요청해 주세요.</li>'; }).catch(function(){ ul.innerHTML=''; }); });
    api('/bookings?'+q('status=open')).then(function(r){ var it=(r.items||[]).filter(function(b){ return b.status!=='confirmed'||b.paid_notice||b.cancel_requested||(b.date&&S.ddays(b.date)<=7&&S.ddays(b.date)>=0); }).slice(0,6);
      $('#hm-list').innerHTML=it.length?it.map(bookingRow).join(''):empty('지금 확인할 문의가 없습니다. 새 문의가 들어오면 여기에 표시됩니다.'); }).catch(oops);
    api('/stats?'+q('days=30')).then(function(r){ var t=r.total;
      $('#hm-stats').innerHTML='<div class="hc-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">'+[['검색 노출',t.imp],['상세 조회',t.view],['연락·SNS 클릭',t.contact+t.sns],['문의·예약 요청',r.bookings.requests]].map(function(x){ return '<div class="hc-kpi"><small>'+x[0]+'</small><b>'+x[1].toLocaleString('ko-KR')+'</b></div>'; }).join('')+'</div>'; }).catch(function(){});
    api('/settlement?'+q('month='+ST.today.slice(0,7))).then(function(r){ var t=r.total;
      $('#hm-save').innerHTML='<h2>이번 달 확정 매출</h2><p style="font-size:24px;font-weight:800">'+esc(won(t.amount))+' <span class="small muted" style="font-weight:600">· '+t.count+'건</span></p><p class="small mt-1">메가스팟 수수료 <b style="color:var(--ok)">0원</b>'+(t.fee_if_10pct?' · 수수료 10% 방식이었다면 <b>'+esc(won(t.fee_if_10pct))+'</b>':'')+'</p><p class="mt-1"><a class="pf-link" href="#settlement" style="font-size:13.5px">정산표 보기</a></p>'; }).catch(function(){});
  };
  main.addEventListener('click', function(e){
    var g=e.target.closest('[data-goto]'); if(g){ var p=g.getAttribute('data-goto').split(':'); BK.status=p[1]||'open'; location.hash='#'+p[0]; if(ST.tab===p[0]) show(p[0]); return; }
    var r=e.target.closest('[data-resume]'); if(r){ api('/spaces/'+r.getAttribute('data-resume')+'/resume',{method:'POST'}).then(function(){ M.toast('다시 공개했습니다.'); return reload(); }).then(function(){ show(ST.tab); }).catch(oops); return; }
    var b=e.target.closest('[data-b]'); if(b){ openBooking(b.getAttribute('data-b')); }
  });

  /* ---------- 문의·예약 ---------- */
  var BK={ status:'open', q:'', items:[] };
  VIEWS.bookings=function(){
    main.innerHTML=head('문의·예약', '새 문의 → 견적 안내 → 예약 대기 → 예약 확정 순서로 진행합니다. 전화·카카오톡으로 받은 예약도 직접 등록해 함께 관리하세요.', '<button class="btn btn-primary btn-sm" type="button" id="bk-new">+ 예약 직접 등록</button>')
      +'<div class="hc-chips" id="bk-chips"></div><div class="row mt-1"><input class="input" id="bk-q" placeholder="이름·연락처·예약번호로 찾기" style="max-width:320px" value="'+esc(BK.q)+'"><button class="btn btn-light btn-sm" type="button" id="bk-csv">엑셀(CSV)</button></div><div class="hc-list" id="bk-list"></div>';
    $('#bk-new').addEventListener('click', manualBooking);
    var t; $('#bk-q').addEventListener('input', function(){ clearTimeout(t); var x=this.value.trim(); t=setTimeout(function(){ BK.q=x; loadBookings(); }, 250); });
    $('#bk-chips').addEventListener('click', function(e){ var c=e.target.closest('[data-st]'); if(c){ BK.status=c.getAttribute('data-st'); loadBookings(); } });
    $('#bk-csv').addEventListener('click', function(){ if(!BK.items.length) return M.toast('내려받을 내용이 없습니다.');
      S.csv('메가스팟_문의예약_'+ST.today+'.csv', [['예약번호','상태','공간','이름','연락처','이용일','시작','끝','인원','금액','받은 금액','받을 금액','본사 부가서비스','접수 경로','접수일']].concat(BK.items.map(function(b){ return [b.code, BST[b.status], b.space_name, b.name, b.phone, b.date, b.start, b.end, b.people||'', b.amount==null?'':b.amount, b.paid, b.due==null?'':b.due, (b.addons||[]).join(' / '), b.source==='host'?'직접 등록':'메가스팟', String(b.created_at).slice(0,10)]; }))); });
    loadBookings();
  };
  function loadBookings(){
    api('/bookings?'+q('status='+encodeURIComponent(BK.status==='all'?'':BK.status)+(BK.q?'&q='+encodeURIComponent(BK.q):''))).then(function(r){
      BK.items=r.items||[]; var c=r.counts||{}, open=(c.new||0)+(c.quoted||0)+(c.pending||0)+(c.confirmed||0), closed=(c.done||0)+(c.cancelled||0)+(c.declined||0);
      $('#bk-chips').innerHTML=[['open','진행 중',open],['new','새 문의',c.new||0],['quoted','견적 안내',c.quoted||0],['pending','예약 대기',c.pending||0],['confirmed','예약 확정',c.confirmed||0],['closed','끝난 건',closed]].map(function(x){
        return '<button type="button" class="chip'+(BK.status===x[0]?' on':'')+'" data-st="'+x[0]+'">'+x[1]+' <i>'+x[2]+'</i></button>'; }).join('');
      $('#bk-list').innerHTML=BK.items.length?BK.items.map(bookingRow).join(''):empty(BK.q?'찾는 문의·예약이 없습니다.':BK.status==='open'?'진행 중인 문의·예약이 없습니다. 공간이 공개되면 고객의 예약 요청이 여기로 들어옵니다.':'해당하는 건이 없습니다.');
    }).catch(oops);
  }
  function linesTable(lines, total, extra){ return '<table class="hc-lines"><tbody>'+lines.map(function(l){ return '<tr><td>'+esc(l.label)+(l.desc?'<small>'+esc(l.desc)+'</small>':'')+'</td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('')+(extra||'')+'<tr class="sum"><td>합계</td><td>'+esc(won(total))+'</td></tr></tbody></table>'; }
  function openBooking(code){
    api('/bookings/'+encodeURIComponent(code)).then(function(r){ drawBooking(r); if(location.hash!=='#b='+code) history.replaceState(null,'','#b='+code); }).catch(oops);
  }
  function act(code, body, okMsg){
    return api('/bookings/'+encodeURIComponent(code), { method:'PATCH', body:body }).then(function(r){ if(okMsg) M.toast(okMsg); drawBooking(r); reload().then(function(){ if(ST.tab==='bookings') loadBookings(); }); return r; }).catch(oops);
  }
  function drawBooking(r){
    var b=r.item, est=b.estimate, qt=b.quote, open=b.open, k=(r.customer_url.split('k=')[1]||'');
    var docs='/docs/?code='+encodeURIComponent(b.code)+'&k='+encodeURIComponent(k);
    var acts='';
    if(b.status==='new') acts=(b.amount!=null?'<button class="btn btn-primary btn-sm" data-act="approve">이 금액으로 승인 · 결제 안내</button>':'')+'<button class="btn '+(b.amount!=null?'btn-light':'btn-primary')+' btn-sm" data-act="quote-open">견적 보내기</button><button class="btn btn-ghost btn-sm" data-act="decline">진행 불가</button>';
    else if(b.status==='quoted') acts='<button class="btn btn-light btn-sm" data-act="quote-open">견적 다시 보내기</button><button class="btn btn-primary btn-sm" data-act="approve">고객 확답 받음 · 예약 대기로</button><button class="btn btn-ghost btn-sm" data-act="decline">진행 불가</button>';
    else if(b.status==='pending') acts='<button class="btn btn-primary btn-sm" data-act="pay-open">결제 기록하고 확정</button><button class="btn btn-light btn-sm" data-act="confirm">결제 기록 없이 확정</button><button class="btn btn-light btn-sm" data-act="quote-open">견적 고치기</button><button class="btn btn-ghost btn-sm" data-act="cancel">취소</button>';
    else if(b.status==='confirmed') acts='<button class="btn btn-primary btn-sm" data-act="pay-open">결제 기록</button><button class="btn btn-light btn-sm" data-act="done">이용 완료</button><button class="btn btn-ghost btn-sm" data-act="cancel">예약 취소</button>';
    else acts='<button class="btn btn-light btn-sm" data-act="reopen">다시 진행</button>';
    var html='<div class="hc-sec"><h3>'+S.st(b.status, BST[b.status])+' <span class="small muted">'+esc(b.space_name)+' · '+(b.source==='host'?'직접 등록':'메가스팟 접수')+' '+esc(String(b.created_at).slice(0,10))+'</span></h3>'
      +(b.paid_notice?'<p class="pf-msg ok">고객이 입금(결제)했다고 알렸습니다'+(b.paid_notice.note?' — '+esc(b.paid_notice.note):'')+'. 확인 후 결제를 기록해 주세요.</p>':'')+(b.cancel_requested?'<p class="pf-msg">고객이 예약 취소를 요청했습니다. 환불 규정을 확인하고 처리해 주세요.</p>':'')
      +(b.cancel?'<p class="pf-msg">'+(b.cancel.by==='customer'?'고객이 취소':'호스트가 처리')+(b.cancel.reason?' — '+esc(b.cancel.reason):'')+'</p>':'')
      +'<dl class="hc-kv"><dt>고객</dt><dd><b>'+esc(b.name)+'</b>'+(b.org?' · '+esc(b.org):'')+'</dd><dt>연락처</dt><dd><a class="pf-link" href="tel:'+esc(b.phone.replace(/[^0-9+]/g,''))+'">'+esc(b.phone)+'</a>'+(b.email?' · '+esc(b.email):'')+'</dd>'
      +'<dt>이용 일시</dt><dd>'+esc(when(b))+'</dd>'+(b.purpose_label?'<dt>모임</dt><dd>'+esc(b.purpose_label)+'</dd>':'')+(b.visit?'<dt>현장답사</dt><dd>답사를 먼저 원합니다</dd>':'')+(b.message?'<dt>요청 내용</dt><dd>'+esc(b.message)+'</dd>':'')+'</dl>'
      +'<div class="hc-acts">'+acts+'<button class="btn btn-light btn-sm" data-act="edit-open">일정·금액 고치기</button></div><div id="bd-panel"></div></div>';
    if(qt) html+='<div class="hc-sec"><h3>보낸 견적 <span class="small muted">'+esc(qt.sent_at)+' · '+esc(S.kdate(qt.valid_until))+'까지 유효'+(b.accepted_at?' · 고객 수락 '+esc(b.accepted_at):'')+'</span></h3>'+linesTable(qt.lines, qt.total)+(qt.note?'<p class="small muted">'+esc(qt.note)+'</p>':'')+'</div>';
    else if(est) html+='<div class="hc-sec"><h3>고객이 본 예상 금액 <span class="small muted">요금표로 자동 계산</span></h3>'+linesTable(est.lines, est.total, est.vat?'<tr><td>부가세 10%</td><td>'+esc(won(est.vat))+'</td></tr>':'')+(est.deposit?'<p class="small muted">보증금 '+esc(won(est.deposit))+' 별도</p>':'')+'</div>';
    else html+='<div class="hc-sec"><h3>금액</h3><p class="small muted">'+(b.amount!=null?'확정 금액 <b>'+esc(won(b.amount))+'</b>':'요금표로 계산되지 않은 요청입니다. 견적을 보내 금액을 알려 주세요.')+'</p></div>';
    if(b.status!=='new'||b.payments.length) html+='<div class="hc-sec"><h3>결제 기록 <span class="small muted">고객에게 직접 받은 금액</span></h3>'+(b.payments.length?'<table class="hc-lines"><tbody>'+b.payments.map(function(p){
        return '<tr><td>'+esc(PAYK[p.kind]||p.kind)+' · '+esc(PAYM[p.method]||p.method)+'<small>'+esc(p.date)+(p.note?' · '+esc(p.note):'')+' <button type="button" class="pf-link" data-pay-del="'+esc(p.id)+'" style="font-size:12px">삭제</button></small></td><td>'+(p.kind==='refund'?'-':'')+esc(won(p.amount))+'</td></tr>'; }).join('')
        +'<tr class="sum"><td>받은 금액'+(b.due?' · 받을 금액 '+esc(won(b.due)):'')+'</td><td>'+esc(won(b.paid))+'</td></tr></tbody></table>':'<p class="small muted">아직 기록한 결제가 없습니다.</p>')+'</div>';
    if((r.hq_addons||[]).length) html+='<div class="hc-sec"><h3>메가스팟 본사 부가서비스 <span class="small muted">본사가 고객과 직접 상담·준비합니다</span></h3><div class="hc-acts">'+r.hq_addons.map(function(a){ return '<span class="hc-flag hq">'+esc(a.label)+' · '+esc(a.status_label)+'</span>'; }).join('')+'</div>'+(b.addon_note?'<p class="small muted">'+esc(b.addon_note)+'</p>':'')+'</div>';
    html+='<div class="hc-sec"><h3>고객과 주고받은 메시지</h3><div class="hc-thread" id="bd-thread">'+(b.messages.length?b.messages.map(function(m){ return '<div class="hc-bubble'+(m.from==='host'?' me':'')+'">'+esc(m.text)+'<small>'+(m.from==='host'?'호스트':m.from==='customer'?'고객':'메가스팟')+' · '+esc(m.at)+'</small></div>'; }).join(''):'<p class="small muted">아직 메시지가 없습니다.</p>')+'</div>'
      +(open||b.status==='done'?'<div class="hc-send"><textarea class="textarea" id="bd-msg" maxlength="1000" placeholder="고객에게 보낼 메시지 (고객 예약 조회 화면에 표시됩니다)"></textarea><button class="btn btn-primary btn-sm" data-act="msg">보내기</button></div>':'')+'</div>';
    html+='<div class="hc-sec"><h3>고객에게 보낼 링크·문서</h3><div class="hc-acts"><button class="btn btn-light btn-sm" data-copy="'+esc(r.customer_url)+'">예약 조회 링크 복사</button><a class="btn btn-light btn-sm" href="'+esc(docs+'&type=quote')+'" target="_blank" rel="noopener">견적서 PDF</a><a class="btn btn-light btn-sm" href="'+esc(docs+'&type=plan')+'" target="_blank" rel="noopener">행사기획서 PDF</a></div><p class="pf-help">고객은 이 링크에서 진행 상태·견적·결제 안내를 보고, 견적 수락과 입금 알림, 메시지를 보낼 수 있습니다.</p></div>';
    html+='<div class="hc-sec"><h3>운영 메모 <span class="small muted">호스트만 봅니다</span></h3><textarea class="textarea" id="bd-memo" maxlength="2000" rows="3">'+esc(b.memo||'')+'</textarea><div><button class="btn btn-light btn-sm" data-act="memo">메모 저장</button></div></div>';
    var body=drawer(esc(b.name)+' <span class="small muted">'+esc(b.code)+'</span>', html), th=$('#bd-thread'); th.scrollTop=th.scrollHeight;
    function panel(h){ var p=$('#bd-panel'); p.innerHTML=h?'<div class="ap-box" style="margin-top:4px">'+h+'</div>':''; if(h) p.scrollIntoView({block:'nearest', behavior:'smooth'}); return p; }
    body.onclick=function(e){
      var c=e.target.closest('[data-copy]'); if(c){ M.copy(c.getAttribute('data-copy')).then(function(ok){ M.toast(ok?'링크를 복사했습니다. 카카오톡·문자로 보내 주세요.':'복사하지 못했습니다.'); }); return; }
      var pd=e.target.closest('[data-pay-del]'); if(pd){ if(confirm('이 결제 기록을 지울까요?')) act(b.code, { action:'payment_remove', id:pd.getAttribute('data-pay-del') }, '결제 기록을 지웠습니다.'); return; }
      var a=e.target.closest('[data-act]'); if(!a) return; var t=a.getAttribute('data-act');
      if(t==='approve'){ if(confirm('이 금액('+won(b.amount)+')으로 확정하고 고객에게 결제 안내를 보여 줄까요?')) act(b.code, { action:'approve' }, '승인했습니다. 고객에게 결제 안내가 표시됩니다.'); }
      else if(t==='confirm'){ if(confirm('예약을 확정할까요?')) act(b.code, { action:'confirm' }, '예약을 확정했습니다.'); }
      else if(t==='done') act(b.code, { action:'done' }, '이용 완료로 바꿨습니다.');
      else if(t==='reopen') act(b.code, { action:'reopen' }, '다시 진행합니다.');
      else if(t==='decline'||t==='cancel'){ var why=prompt(t==='decline'?'고객에게 알릴 사유 (선택)':'취소 사유 (선택)', ''); if(why===null) return; act(b.code, { action:t, reason:why }, t==='decline'?'진행 불가로 처리했습니다.':'예약을 취소했습니다.'); }
      else if(t==='msg'){ var tx=$('#bd-msg').value.trim(); if(!tx) return $('#bd-msg').focus(); act(b.code, { action:'message', text:tx }); }
      else if(t==='memo') act(b.code, { action:'memo', memo:$('#bd-memo').value }, '메모를 저장했습니다.');
      else if(t==='quote-open'){
        var src=(qt&&qt.lines)||(est?est.lines.concat(est.vat?[{label:'부가세 10%', amount:est.vat}]:[]):[{label:'공간 이용료', amount:''}]);
        panel('<b>견적 보내기</b><div id="q-rows">'+src.map(qRow).join('')+'</div><div class="hc-acts"><button class="btn btn-light btn-sm" type="button" data-act="q-add">+ 항목 추가</button><span class="small" id="q-sum" style="margin-left:auto;font-weight:800"></span></div>'
          +'<div class="f"><label for="q-note">안내 메모 (선택)</label><textarea class="textarea" id="q-note" rows="2" maxlength="1000" placeholder="예: 부가세 포함 금액입니다. 주차 2대 무료.">'+esc((qt&&qt.note)||'')+'</textarea></div>'
          +'<div class="row"><label class="small" for="q-valid">견적 유효기간</label><select class="select" id="q-valid" style="width:auto;min-height:38px"><option value="3">3일</option><option value="7" selected>7일</option><option value="14">14일</option><option value="30">30일</option></select><button class="btn btn-primary btn-sm" data-act="q-send" style="margin-left:auto">견적 보내기</button></div><p class="pf-help">할인은 금액을 음수로 넣으면 됩니다. 보내면 고객 조회 화면에 견적서가 표시되고, 고객이 수락하면 결제 안내가 보입니다.</p>');
        qSum();
      } else if(t==='q-add'){ $('#q-rows').insertAdjacentHTML('beforeend', qRow({label:'',amount:''})); }
      else if(t==='q-del'){ a.closest('.hc-q-row').remove(); qSum(); }
      else if(t==='q-send'){ var lines=$$('#q-rows .hc-q-row').map(function(row){ return { label:row.querySelector('[data-ql]').value.trim(), amount:row.querySelector('[data-qa]').value }; }).filter(function(l){ return l.label && l.amount!==''; });
        if(!lines.length) return M.toast('견적 항목과 금액을 적어 주세요.'); act(b.code, { action:'quote', lines:lines, note:$('#q-note').value, valid_days:$('#q-valid').value }, '견적을 보냈습니다.'); }
      else if(t==='pay-open'){
        panel('<b>결제 기록</b><div class="field-row two"><div class="f"><label for="p-kind">구분</label><select class="select" id="p-kind">'+S.opts(Object.keys(PAYK).map(function(k){ return [k,PAYK[k]]; }), b.paid?'balance':'deposit')+'</select></div><div class="f"><label for="p-amount">금액</label><div class="unit"><input class="input" id="p-amount" type="number" inputmode="numeric" min="0" value="'+(b.due||'')+'"><i>원</i></div></div></div>'
          +'<div class="field-row two"><div class="f"><label for="p-method">받은 방법</label><select class="select" id="p-method">'+S.opts(Object.keys(PAYM).map(function(k){ return [k,PAYM[k]]; }), 'bank')+'</select></div><div class="f"><label for="p-date">받은 날</label><input class="input" id="p-date" type="date" value="'+ST.today+'"></div></div>'
          +'<div class="f"><label for="p-note">메모 (선택)</label><input class="input" id="p-note" maxlength="200" placeholder="예: 세금계산서 발행"></div>'
          +(b.status!=='confirmed'?'<label class="chk"><input type="checkbox" id="p-confirm" checked><span>이 결제로 예약을 확정합니다</span></label>':'')+'<div><button class="btn btn-primary btn-sm" data-act="pay-save">기록 저장</button></div>');
      } else if(t==='pay-save'){ var amt=$('#p-amount').value; if(!+amt) return $('#p-amount').focus();
        act(b.code, { action:'payment', kind:$('#p-kind').value, amount:amt, method:$('#p-method').value, date:$('#p-date').value, note:$('#p-note').value, confirm:!!($('#p-confirm')&&$('#p-confirm').checked) }, '결제를 기록했습니다.'); }
      else if(t==='edit-open'){
        panel('<b>일정·금액 고치기</b><div class="field-row three"><div class="f"><label for="e-date">이용일</label><input class="input" id="e-date" type="date" value="'+esc(b.date)+'"></div><div class="f"><label for="e-start">시작</label><input class="input" id="e-start" type="time" step="1800" value="'+esc(b.start)+'"></div><div class="f"><label for="e-end">끝</label><input class="input" id="e-end" type="time" step="1800" value="'+esc(b.end)+'"></div></div>'
          +'<div class="field-row two"><div class="f"><label for="e-people">인원</label><div class="unit"><input class="input" id="e-people" type="number" min="1" value="'+(b.people||'')+'"><i>명</i></div></div><div class="f"><label for="e-amount">확정 금액</label><div class="unit"><input class="input" id="e-amount" type="number" min="0" value="'+(b.amount==null?'':b.amount)+'"><i>원</i></div></div></div><div><button class="btn btn-primary btn-sm" data-act="edit-save">저장</button></div>');
      } else if(t==='edit-save') act(b.code, { action:'edit', date:$('#e-date').value, start:$('#e-start').value, end:$('#e-end').value, people:$('#e-people').value, amount:$('#e-amount').value }, '고쳤습니다.');
    };
    body.oninput=function(e){ if(e.target.closest('#q-rows')) qSum(); };
  }
  function qRow(l){ return '<div class="hc-q-row"><input class="input" data-ql maxlength="60" placeholder="항목" value="'+esc(l.label||'')+'"><input class="input" data-qa type="number" inputmode="numeric" placeholder="금액" value="'+(l.amount===''||l.amount==null?'':l.amount)+'"><button type="button" data-act="q-del" aria-label="항목 삭제">✕</button></div>'; }
  function qSum(){ var el=$('#q-sum'); if(!el) return; var t=0; $$('#q-rows [data-qa]').forEach(function(i){ t+=(+i.value||0); }); el.textContent='합계 '+won(t); }
  function manualBooking(){
    if(!ST.spaces.length) return;
    var body=drawer('예약 직접 등록', '<form class="hc-form" id="mb-form" novalidate><p class="pf-help">전화·카카오톡·현장에서 받은 예약을 넣어 두면 일정·정산·통계에 함께 잡힙니다. 수수료는 없습니다.</p>'
      +'<div class="f"><label for="mb-space">공간</label><select class="select" id="mb-space" name="space">'+S.opts(ST.spaces.map(function(s){ return [s.ref, s.name]; }), ST.cur||ST.spaces[0].ref)+'</select></div>'
      +'<div class="field-row two"><div class="f"><label for="mb-name">고객 이름 <span class="pf-req">*</span></label><input class="input" id="mb-name" name="name" required maxlength="40"></div><div class="f"><label for="mb-phone">연락처 <span class="pf-req">*</span></label><input class="input" id="mb-phone" name="phone" type="tel" required></div></div>'
      +'<div class="field-row three"><div class="f"><label for="mb-date">이용일</label><input class="input" id="mb-date" name="date" type="date"></div><div class="f"><label for="mb-start">시작</label><input class="input" id="mb-start" name="start" type="time" step="1800"></div><div class="f"><label for="mb-end">끝</label><input class="input" id="mb-end" name="end" type="time" step="1800"></div></div>'
      +'<div class="field-row three"><div class="f"><label for="mb-people">인원</label><input class="input" id="mb-people" name="people" type="number" min="1"></div><div class="f"><label for="mb-amount">금액</label><input class="input" id="mb-amount" name="amount" type="number" min="0"></div><div class="f"><label for="mb-status">상태</label><select class="select" id="mb-status" name="status">'+S.opts([['confirmed','예약 확정'],['pending','예약 대기'],['quoted','견적 안내'],['new','새 문의']], 'confirmed')+'</select></div></div>'
      +'<div class="f"><label for="mb-memo">메모</label><textarea class="textarea" id="mb-memo" name="memo" rows="2" maxlength="2000"></textarea></div><p class="pf-msg" id="mb-msg" hidden></p><div><button class="btn btn-primary" type="submit">등록</button></div></form>');
    var f=$('#mb-form'); telFmt(f.elements.phone);
    f.addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(f)) return;
      api('/bookings', { method:'POST', body:{ space:v(f,'space'), name:v(f,'name'), phone:v(f,'phone'), date:v(f,'date'), start:v(f,'start'), end:v(f,'end'), people:v(f,'people'), amount:v(f,'amount'), status:v(f,'status'), memo:v(f,'memo') } })
        .then(function(r){ M.toast('예약을 등록했습니다.'); reload().then(function(){ if(ST.tab==='bookings') loadBookings(); else if(ST.tab==='calendar') show('calendar'); }); openBooking(r.code); })
        .catch(function(x){ var m=$('#mb-msg'); m.textContent=x.message; m.hidden=false; }); });
  }

  /* ---------- 일정 ---------- */
  var CAL={ ym:'' };
  VIEWS.calendar=function(){
    var s=cur(); if(!s) return main.innerHTML=empty('등록한 공간이 없습니다.');
    if(!CAL.ym) CAL.ym=ST.today.slice(0,7);
    var y=+CAL.ym.slice(0,4), m=+CAL.ym.slice(5,7), first=new Date(y, m-1, 1), days=new Date(y, m, 0).getDate(), from=CAL.ym+'-01', to=CAL.ym+'-'+M.pad2(days);
    main.innerHTML=head('일정', esc(s.name)+' · 날짜를 누르면 그날 예약을 보거나 예약 받지 않는 날로 닫을 수 있습니다. 닫은 날짜는 고객 검색에서 빠집니다.', '<button class="btn btn-primary btn-sm" type="button" id="cal-new">+ 예약 직접 등록</button>')
      +'<div class="hc-card"><h2><span><button class="btn btn-light btn-sm" type="button" data-cal="-1" aria-label="이전 달">←</button> <span style="margin:0 10px">'+y+'년 '+m+'월</span> <button class="btn btn-light btn-sm" type="button" data-cal="1" aria-label="다음 달">→</button></span><small>확정 <span class="pf-st confirmed">■</span> 대기 <span class="pf-st pending">■</span> 문의 <span class="pf-st quoted">■</span> · 빗금 = 닫은 날</small></h2><div class="hc-cal" id="cal-grid">'+empty('불러오는 중…')+'</div></div>';
    $('#cal-new').addEventListener('click', manualBooking);
    $$('[data-cal]', main).forEach(function(b){ b.addEventListener('click', function(){ var d=new Date(y, m-1+(+b.getAttribute('data-cal')), 1); CAL.ym=d.getFullYear()+'-'+M.pad2(d.getMonth()+1); show('calendar'); }); });
    api('/spaces/'+s.ref+'/calendar?from='+from+'&to='+to).then(function(r){
      var blk={}, bk={}; (r.blocks||[]).forEach(function(x){ blk[x.day]=x.note||' '; }); (r.bookings||[]).forEach(function(x){ (bk[x.date]=bk[x.date]||[]).push(x); });
      var html=['일','월','화','수','목','금','토'].map(function(d){ return '<div class="dow">'+d+'</div>'; }).join(''); for(var i=0;i<first.getDay();i++) html+='<div class="hc-day out"></div>';
      for(var d=1; d<=days; d++){ var iso=CAL.ym+'-'+M.pad2(d), dow=new Date(y, m-1, d).getDay(), list=bk[iso]||[];
        html+='<button type="button" class="hc-day'+(iso<ST.today?' past':'')+(iso===ST.today?' today':'')+(blk[iso]?' closed':'')+'" data-day="'+iso+'"><span class="n'+(dow===0?' sun':dow===6?' sat':'')+'">'+d+'</span>'+(blk[iso]?'<span class="cl">닫음</span>':'')
          +list.slice(0,3).map(function(x){ return '<span class="ev '+esc(x.status)+'">'+esc((x.start?x.start+' ':'')+x.name)+'</span>'; }).join('')+(list.length>3?'<span class="cl">+'+(list.length-3)+'</span>':'')+'</button>'; }
      $('#cal-grid').innerHTML=html;
      $('#cal-grid').onclick=function(e){ var b=e.target.closest('[data-day]'); if(!b) return; var iso=b.getAttribute('data-day'), list=bk[iso]||[], closed=!!blk[iso];
        var body=drawer(esc(S.kdate(iso)), '<div class="hc-sec"><h3>이날 예약</h3>'+(list.length?'<div class="hc-list" style="margin-top:0">'+list.map(function(x){ return '<button type="button" class="hc-row" data-b="'+esc(x.code)+'"><div><div class="r1">'+S.st(x.status, BST[x.status])+'<b>'+esc(x.name)+'</b></div><div class="r2">'+esc([S.timeRange(x.start,x.end), x.people?x.people+'명':''].filter(Boolean).join(' · '))+'</div></div></button>'; }).join('')+'</div>':'<p class="small muted">예약이 없습니다.</p>')+'</div>'
          +'<div class="hc-sec"><h3>예약 받기</h3>'+(closed?'<p class="small">이 날짜는 닫혀 있습니다'+(String(blk[iso]).trim()?' — '+esc(blk[iso]):'')+'. 고객 검색과 예약 요청에서 빠집니다.</p><div><button class="btn btn-primary btn-sm" id="day-open">다시 열기</button></div>'
            :'<div class="f"><label for="day-note">닫는 이유 (선택 · 호스트만 봅니다)</label><input class="input" id="day-note" maxlength="80" placeholder="예: 내부 행사, 공사"></div><div><button class="btn btn-ghost btn-sm" id="day-close">이 날짜 닫기</button></div>')+'</div>');
        body.onclick=function(ev){ var bb=ev.target.closest('[data-b]'); if(bb) return openBooking(bb.getAttribute('data-b'));
          if(ev.target.id==='day-open'||ev.target.id==='day-close'){ api('/spaces/'+s.ref+'/blocks', { method:'PUT', body:{ day:iso, on:ev.target.id==='day-close', note:($('#day-note')||{}).value||'' } }).then(function(){ closeDrawer(); show('calendar'); }).catch(oops); } };
      };
    }).catch(oops);
  };

  /* ---------- 공간 정보 ---------- */
  var SP={ space:null, photos:[], dirty:false };
  function money(name, val, ph){ return '<div class="unit"><input class="input" name="'+name+'" type="number" inputmode="numeric" min="0" step="1000" value="'+(val==null?'':val)+'" placeholder="'+(ph||'')+'"><i>원</i></div>'; }
  function pkgRow(p){ p=p||{}; return '<div class="ap-row" data-pkg><input class="input" data-k="name" maxlength="30" placeholder="이름 (예: 종일)" value="'+esc(p.name||'')+'"><input class="input" data-k="weekday" type="number" min="0" step="1000" placeholder="평일 금액" value="'+(p.weekday==null?'':p.weekday)+'"><input class="input" data-k="weekend" type="number" min="0" step="1000" placeholder="주말 금액" value="'+(p.weekend==null?'':p.weekend)+'"><button type="button" class="x" data-rm aria-label="삭제">✕</button><input class="input" data-k="time" maxlength="40" placeholder="시간 (예: 10:00~22:00)" value="'+esc(p.time||'')+'" style="grid-column:1 / -1"></div>'; }
  function optRow(o){ o=o||{}; return '<div class="ap-row opt" data-opt><input class="input" data-k="name" maxlength="40" placeholder="옵션 이름 (예: 무선 마이크 추가)" value="'+esc(o.name||'')+'"><input class="input" data-k="price" type="number" min="0" step="1000" placeholder="금액" value="'+(o.price==null?'':o.price)+'"><select class="select" data-k="unit">'+S.opts(P.optionUnits.map(function(u){ return [u,'/ '+u]; }), o.unit||'건')+'</select><button type="button" class="x" data-rm aria-label="삭제">✕</button></div>'; }
  VIEWS.space=function(){
    var s=cur(); if(!s) return main.innerHTML=empty('등록한 공간이 없습니다.');
    api('/spaces/'+s.ref).then(function(r){ SP.space=r.space; SP.photos=r.photos||[]; SP.dirty=false; drawSpace(r.missing||[]); }).catch(oops);
  };
  function drawSpace(missing){
    var s=SP.space, d=s.data||{}, pr=d.price||{}, modes=pr.modes||[], c=d.contact||{}, pay=d.payment||{}, bz=d.biz||{}, lay=d.layouts||{}, pk=d.parking||{}, ru=d.rules||{}, rf=d.refund||{}, bk=d.booking||{};
    var canSubmit=['draft','fix','rejected'].indexOf(s.status)>=0;
    main.innerHTML=head('공간 정보', esc(s.name)+' · '+esc(s.ref)+' · <span class="pf-st '+esc(s.status)+'">'+esc(s.status_label)+'</span>', s.visible?'<a class="btn btn-light btn-sm" href="/docs/?type=space&id='+encodeURIComponent(s.ref)+'" target="_blank" rel="noopener">공간소개서 PDF</a>':'')
      +(s.status==='fix'&&s.review_note?'<div class="hc-banner bad"><h2>보완 요청</h2><p>'+esc(s.review_note)+'</p></div>':'')
      +'<div class="hc-banner '+(missing.length?'info':'live')+'" id="sp-missing"></div>'
      +'<nav class="hc-toc" aria-label="공간 정보 바로가기">'+[['basic','기본 정보'],['price','요금'],['options','옵션'],['photos','사진'],['intro','소개·시설'],['contact','문의·연락'],['pay','결제 방법'],['biz','사업자 정보']].map(function(x){ return '<a href="#sp-'+x[0]+'" data-jump="sp-'+x[0]+'">'+x[1]+'</a>'; }).join('')+'</nav>'
      +'<form class="hc-form" id="sp-form" novalidate>'
      // 기본
      +'<div class="hc-card" id="sp-basic"><fieldset><legend>기본 정보</legend>'
      +'<div class="f"><label>공간 이름 <span class="pf-req">*</span></label><input class="input" name="name" maxlength="60" required value="'+esc(s.name)+'"></div>'
      +'<div class="f"><label>한 줄 소개</label><input class="input" name="summary" maxlength="80" placeholder="예: 성수역 3분, 층고 5m 단독 홀" value="'+esc(d.summary||'')+'"></div>'
      +'<div class="field-row two"><div class="f"><label>지역 <span class="pf-req">*</span></label><select class="select" name="region" required>'+S.opts(P.regions, s.region)+'</select><p class="pf-help">‘그 외 지역’은 공간이 늘어나는 대로 지역별로 나눌 예정입니다.</p></div><div class="f"><label>주소 <span class="pf-req">*</span></label><input class="input" name="address" maxlength="160" value="'+esc(s.address)+'"></div></div>'
      +'<div class="field-row three"><div class="f"><label>상세 주소·층</label><input class="input" name="address_detail" maxlength="80" placeholder="예: 3층 301호" value="'+esc(d.address_detail||'')+'"></div><div class="f"><label>가까운 역·정류장</label><input class="input" name="station" maxlength="80" placeholder="예: 성수역 3번 출구 3분" value="'+esc(d.station||'')+'"></div><div class="f"><label>운영 시간</label><input class="input" name="hours" maxlength="120" placeholder="예: 09:00~23:00" value="'+esc(d.hours||'')+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>최대 이용 인원 <span class="pf-req">*</span></label><div class="unit"><input class="input" name="capacity" type="number" min="1" value="'+(s.capacity||'')+'"><i>명</i></div></div><div class="f"><label>면적 <span class="pf-req">*</span></label><div class="unit"><input class="input" name="area" type="number" min="1" value="'+(s.area||'')+'"><i>평</i></div></div></div>'
      +'<div class="f"><span class="lbl">공간 유형 <span class="pf-req">*</span> <span class="pf-help" style="font-weight:400">— 최대 5가지</span></span>'+S.typePicker(s.types)+'</div></fieldset></div>'
      // 요금
      +'<div class="hc-card" id="sp-price"><fieldset><legend>요금</legend><p class="pf-help">받는 방식을 모두 고르세요. 고객은 이 요금표로 예상 금액을 바로 확인하고, 호스트가 확인한 뒤 금액이 확정됩니다. 금액을 정하기 어렵다면 ‘견적 문의’만 골라도 됩니다.</p>'
      +'<div class="ap-modes">'+[['hourly','시간 대관','시간당 요금 × 이용 시간'],['package','패키지','반일·종일처럼 묶음 요금'],['daily','하루 대관','하루 통째로'],['quote','견적 문의','조건을 듣고 금액 안내']].map(function(m){ return '<label class="ap-mode"><input type="checkbox" name="modes" value="'+m[0]+'"'+(modes.indexOf(m[0])>=0?' checked':'')+'><b>'+m[1]+'</b><small>'+m[2]+'</small></label>'; }).join('')+'</div>'
      +'<div class="ap-box" data-mode="hourly"><b>시간 대관 요금</b><div class="field-row three"><div class="f"><label>평일 시간당</label>'+money('h_weekday', (pr.hourly||{}).weekday)+'</div><div class="f"><label>주말·공휴일 시간당</label>'+money('h_weekend', (pr.hourly||{}).weekend)+'</div><div class="f"><label>최소 이용 시간</label><div class="unit"><input class="input" name="h_min" type="number" min="1" max="24" value="'+((pr.hourly||{}).min_hours||1)+'"><i>시간</i></div></div></div></div>'
      +'<div class="ap-box" data-mode="package"><b>패키지 요금</b><div class="ap-rows" id="sp-pkgs">'+((pr.packages||[]).length?pr.packages:[{}]).map(pkgRow).join('')+'</div><div><button class="btn btn-light btn-sm" type="button" data-add="pkg">+ 패키지 추가</button></div></div>'
      +'<div class="ap-box" data-mode="daily"><b>하루 대관 요금</b><div class="field-row two"><div class="f"><label>평일 하루</label>'+money('d_weekday', (pr.daily||{}).weekday)+'</div><div class="f"><label>주말·공휴일 하루</label>'+money('d_weekend', (pr.daily||{}).weekend)+'</div></div></div>'
      +'<div class="field-row three"><div class="f"><label>기준 인원 (선택)</label><div class="unit"><input class="input" name="base_people" type="number" min="1" value="'+(pr.base_people||'')+'"><i>명</i></div></div><div class="f"><label>기준 초과 1명당 (선택)</label>'+money('extra_per_person', pr.extra_per_person)+'</div><div class="f"><label>보증금 (선택)</label>'+money('deposit', pr.deposit)+'</div></div>'
      +'<div class="field-row two"><div class="f"><label>부가세</label><select class="select" name="vat">'+S.opts([['included','적은 금액에 부가세 포함'],['excluded','부가세 별도 (10% 더해 안내)']], pr.vat||'included')+'</select></div><div class="f"><label>요금 안내 (선택)</label><input class="input" name="price_note" maxlength="600" placeholder="예: 성수기(12월) 요금은 견적으로 안내" value="'+esc(pr.note||'')+'"></div></div></fieldset></div>'
      // 옵션
      +'<div class="hc-card" id="sp-options"><fieldset><legend>옵션 (호스트가 제공하는 부가서비스)</legend><p class="pf-help">장비 대여, 청소, 추가 테이블처럼 공간에서 직접 제공하는 항목입니다. 출장뷔페·케이터링·출장 칵테일·사회자/강연자 섭외·현장 매니저·디자인 제작물은 메가스팟 본사 서비스로 모든 공간에 자동으로 붙으니 따로 넣지 않아도 됩니다.</p>'
      +'<div class="ap-rows" id="sp-opts">'+((d.options||[]).length?d.options:[{}]).map(optRow).join('')+'</div><div><button class="btn btn-light btn-sm" type="button" data-add="opt">+ 옵션 추가</button></div></fieldset></div>'
      // 사진
      +'<div class="hc-card" id="sp-photos"><fieldset><legend>사진 <span class="pf-help" style="font-weight:400">— 3장 이상 · 최대 12장 · 첫 사진이 대표 사진</span></legend><div class="ap-photos" id="sp-ph"></div><input type="file" id="sp-file" accept="image/jpeg,image/png,image/webp" multiple hidden><p class="pf-help">가로 사진을 권합니다. 올릴 때 자동으로 크기를 줄입니다. 사진은 올리는 즉시 저장됩니다.</p></fieldset></div>'
      // 소개·시설
      +'<div class="hc-card" id="sp-intro"><fieldset><legend>소개 · 시설 · 이용 규정</legend>'
      +'<div class="f"><label>공간 소개 <span class="pf-req">*</span> <span class="pf-help" style="font-weight:400">— 20자 이상</span></label><textarea class="textarea" name="intro" rows="6" maxlength="3000" placeholder="어떤 행사에 잘 맞는지, 공간의 구조와 분위기, 찾아오는 길 등을 적어 주세요.">'+esc(d.intro||'')+'</textarea></div>'
      +'<div class="f"><span class="lbl">시설·장비</span><div class="checks">'+S.checks('facilities', P.facilities, d.facilities||[])+'</div></div>'
      +'<div class="f"><span class="lbl">배치별 수용 인원 (선택)</span><div class="field-row" style="grid-template-columns:repeat(2,minmax(0,1fr))">'+[['standing','스탠딩'],['theater','강연식'],['classroom','강의식(책상)'],['banquet','연회식(원탁)']].map(function(x){ return '<div class="unit"><input class="input" name="lay_'+x[0]+'" type="number" min="1" placeholder="'+x[1]+'" value="'+(lay[x[0]]||'')+'" aria-label="'+x[1]+' 수용 인원"><i>명</i></div>'; }).join('')+'</div></div>'
      +'<div class="field-row three"><div class="f"><label>층고 (선택)</label><div class="unit"><input class="input" name="ceiling" inputmode="decimal" maxlength="5" value="'+esc(d.ceiling||'')+'"><i>m</i></div></div><div class="f"><label>주차 가능 대수</label><div class="unit"><input class="input" name="park_count" type="number" min="0" value="'+(pk.count==null?'':pk.count)+'"><i>대</i></div></div><div class="f"><label>주차 안내</label><input class="input" name="park_note" maxlength="120" placeholder="예: 건물 주차장 2시간 무료" value="'+esc(pk.note||'')+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>외부 음식 반입</label><select class="select" name="rule_food">'+S.opts([['ok','가능'],['limited','일부 가능 (협의)'],['no','불가']], ru.food||'', '선택')+'</select></div><div class="f"><label>주류</label><select class="select" name="rule_alcohol">'+S.opts([['ok','가능'],['no','불가']], ru.alcohol||'', '선택')+'</select></div></div>'
      +'<div class="f"><label>이용 규정·주의사항 (선택)</label><textarea class="textarea" name="rule_note" rows="3" maxlength="1000" placeholder="예: 22시 이후 음향 제한, 실내 금연, 못·테이프 사용 금지">'+esc(ru.note||'')+'</textarea></div>'
      +'<div class="field-row two"><div class="f"><label>환불 규정</label><select class="select" name="refund_preset">'+S.opts(P.refundPresets, rf.preset||'standard')+'</select></div><div class="f"><label>환불 규정 보충 (직접 입력)</label><input class="input" name="refund_text" maxlength="1000" value="'+esc(rf.text||'')+'"></div></div></fieldset></div>'
      // 문의·연락
      +'<div class="hc-card" id="sp-contact"><fieldset><legend>문의 받는 방식 · 연락 채널</legend><p class="pf-help">메가스팟 예약 요청은 항상 받습니다. 여기에 전화·카카오톡·SNS를 더하면 고객이 편한 방법으로 연락합니다. 어느 쪽으로 예약되든 수수료는 없고, 클릭 수는 통계에 잡힙니다.</p>'
      +'<div class="field-row two"><div class="f"><label>문의 전화번호</label><input class="input" name="c_phone" type="tel" value="'+esc(c.phone||'')+'"></div><div class="f"><span class="lbl">전화번호 공개</span><label class="chk"><input type="checkbox" name="c_phone_public"'+(c.phone_public?' checked':'')+'><span>공간 페이지에 전화번호 보여 주기</span></label><p class="pf-help">끄면 예약이 진행되는 고객에게만 보입니다.</p></div></div>'
      +'<div class="field-row two"><div class="f"><label>카카오톡 채널·오픈채팅</label><input class="input" name="c_kakao" type="url" placeholder="https://pf.kakao.com/…" value="'+esc(c.kakao||'')+'"></div><div class="f"><label>인스타그램</label><input class="input" name="c_instagram" type="url" placeholder="https://www.instagram.com/…" value="'+esc(c.instagram||'')+'"></div></div>'
      +'<div class="field-row three"><div class="f"><label>네이버 플레이스·블로그</label><input class="input" name="c_naver" type="url" placeholder="https://naver.me/…" value="'+esc(c.naver||'')+'"></div><div class="f"><label>유튜브</label><input class="input" name="c_youtube" type="url" placeholder="https://www.youtube.com/…" value="'+esc(c.youtube||'')+'"></div><div class="f"><label>홈페이지</label><input class="input" name="c_homepage" type="url" placeholder="https://" value="'+esc(c.homepage||'')+'"></div></div>'
      +'<div class="field-row three"><div class="f"><label>예약 마감 (며칠 전까지)</label><div class="unit"><input class="input" name="lead_days" type="number" min="0" max="365" value="'+(bk.lead_days||0)+'"><i>일 전</i></div></div><div class="f"><label>평소 응답 시간 (선택)</label><input class="input" name="reply" maxlength="40" placeholder="예: 평일 2시간 안" value="'+esc(bk.reply||'')+'"></div><div class="f"><span class="lbl">현장답사</span><label class="chk"><input type="checkbox" name="visit"'+(bk.visit!==false?' checked':'')+'><span>답사 요청 받기</span></label></div></div></fieldset></div>'
      // 결제
      +'<div class="hc-card" id="sp-pay"><fieldset><legend>결제 방법</legend><p class="pf-help">결제는 고객이 호스트에게 직접 합니다. 일정을 확인한(예약 대기·확정) 고객에게만 아래 안내가 보입니다.</p>'
      +'<div class="checks">'+S.checks('pay_methods', P.payMethods, pay.methods||[])+'</div>'
      +'<div class="field-row three"><div class="f"><label>은행</label><input class="input" name="bank" maxlength="30" value="'+esc(pay.bank||'')+'"></div><div class="f"><label>계좌번호</label><input class="input" name="account" maxlength="40" inputmode="numeric" value="'+esc(pay.account||'')+'"></div><div class="f"><label>예금주</label><input class="input" name="holder" maxlength="40" value="'+esc(pay.holder||'')+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>카드·간편결제 링크 (선택)</label><input class="input" name="card_link" type="url" placeholder="https:// 호스트가 쓰는 결제 링크" value="'+esc(pay.card_link||'')+'"></div><div class="f"><label>예약금 비율</label><div class="unit"><input class="input" name="deposit_pct" type="number" min="0" max="100" placeholder="예: 30 (전액 선결제는 100)" value="'+(pay.deposit_pct==null?'':pay.deposit_pct)+'"><i>%</i></div></div></div>'
      +'<div class="field-row two"><div class="f"><span class="lbl">증빙</span><label class="chk"><input type="checkbox" name="tax_invoice"'+(pay.tax_invoice?' checked':'')+'><span>세금계산서 발행 가능</span></label></div><div class="f"><label>결제 안내 (선택)</label><input class="input" name="pay_note" maxlength="300" placeholder="예: 잔금은 이용 7일 전까지" value="'+esc(pay.note||'')+'"></div></div></fieldset></div>'
      // 사업자
      +'<div class="hc-card" id="sp-biz"><fieldset><legend>사업자 정보</legend><p class="pf-help">고객이 계약 상대방을 알 수 있도록 공간 페이지에 상호와 사업자등록번호를 표시합니다.</p>'
      +'<div class="field-row two"><div class="f"><label>구분</label><select class="select" name="biz_type">'+S.opts([['corp','법인사업자'],['personal','개인사업자'],['none','사업자 없음']], bz.type||'', '선택')+'</select></div><div class="f"><label>상호</label><input class="input" name="biz_name" maxlength="60" value="'+esc(bz.name||'')+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>사업자등록번호</label><input class="input" name="biz_no" maxlength="20" inputmode="numeric" placeholder="000-00-00000" value="'+esc(bz.no||'')+'"></div><div class="f"><label>대표자</label><input class="input" name="biz_ceo" maxlength="40" value="'+esc(bz.ceo||'')+'"></div></div></fieldset></div>'
      +'<div class="hc-savebar"><span class="small" id="sp-state">저장된 상태입니다.</span><span class="hc-acts">'+(s.status==='live'?'<button class="btn btn-ghost btn-sm" type="button" id="sp-pause">예약 받기 잠시 멈춤</button>':'')+'<button class="btn btn-light" type="submit" id="sp-save">저장</button>'+(canSubmit?'<button class="btn btn-primary" type="button" id="sp-submit">저장하고 심사 요청</button>':'')+'</span></div></form>';
    var f=$('#sp-form'); S.bindTypes(f); telFmt(f.elements.c_phone); drawMissing(missing); drawPhotos(); modeSync();
    function modeSync(){ $$('[data-mode]', f).forEach(function(b){ var on=f.querySelector('input[name=modes][value="'+b.getAttribute('data-mode')+'"]').checked; b.hidden=!on; }); }
    function mark(){ SP.dirty=true; $('#sp-state').innerHTML='<b style="color:var(--rust)">저장하지 않은 변경이 있습니다.</b>'; }
    f.addEventListener('input', mark); f.addEventListener('change', function(){ modeSync(); mark(); });
    f.addEventListener('click', function(e){
      var add=e.target.closest('[data-add]'); if(add){ if(add.getAttribute('data-add')==='pkg'){ if($$('#sp-pkgs [data-pkg]').length<6) $('#sp-pkgs').insertAdjacentHTML('beforeend', pkgRow()); } else if($$('#sp-opts [data-opt]').length<12) $('#sp-opts').insertAdjacentHTML('beforeend', optRow()); return; }
      var rm=e.target.closest('[data-rm]'); if(rm){ rm.closest('.ap-row').remove(); mark(); return; }
      var j=e.target.closest('[data-jump]');
    });
    $$('[data-jump]', main).forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); var el=document.getElementById(a.getAttribute('data-jump')); if(el) window.scrollTo({ top:el.getBoundingClientRect().top+window.scrollY-120, behavior:'smooth' }); }); });
    function collect(){
      var n=function(k){ return v(f,k); }, rows=function(sel, keys){ return $$(sel, f).map(function(r){ var o={}; keys.forEach(function(k){ o[k]=r.querySelector('[data-k="'+k+'"]').value.trim(); }); return o; }); };
      var ms=$$('input[name=modes]:checked', f).map(function(i){ return i.value; });
      return { name:n('name'), region:n('region'), address:n('address'), capacity:n('capacity'), area:n('area'), types:S.readTypes(f), summary:n('summary'), address_detail:n('address_detail'), station:n('station'), hours:n('hours'), intro:f.elements.intro.value, ceiling:n('ceiling'),
        layouts:{ standing:n('lay_standing'), theater:n('lay_theater'), classroom:n('lay_classroom'), banquet:n('lay_banquet') }, parking:{ count:n('park_count'), note:n('park_note') },
        facilities:$$('input[name=facilities]:checked', f).map(function(i){ return i.value; }), rules:{ food:n('rule_food'), alcohol:n('rule_alcohol'), note:f.elements.rule_note.value }, refund:{ preset:n('refund_preset'), text:n('refund_text') },
        price:{ modes:ms, vat:n('vat'), note:n('price_note'), hourly:{ weekday:n('h_weekday'), weekend:n('h_weekend'), min_hours:n('h_min') }, packages:rows('#sp-pkgs [data-pkg]', ['name','time','weekday','weekend']), daily:{ weekday:n('d_weekday'), weekend:n('d_weekend') },
          base_people:n('base_people'), extra_per_person:n('extra_per_person'), deposit:n('deposit') },
        options:rows('#sp-opts [data-opt]', ['name','price','unit']),
        contact:{ phone:n('c_phone'), phone_public:f.elements.c_phone_public.checked, kakao:n('c_kakao'), instagram:n('c_instagram'), naver:n('c_naver'), youtube:n('c_youtube'), homepage:n('c_homepage') },
        booking:{ lead_days:n('lead_days'), reply:n('reply'), visit:f.elements.visit.checked },
        payment:{ methods:$$('input[name=pay_methods]:checked', f).map(function(i){ return i.value; }), bank:n('bank'), account:n('account'), holder:n('holder'), card_link:n('card_link'), deposit_pct:n('deposit_pct'), tax_invoice:f.elements.tax_invoice.checked, note:n('pay_note') },
        biz:{ type:n('biz_type'), name:n('biz_name'), no:n('biz_no'), ceo:n('biz_ceo') } };
    }
    function save(){
      var b=$('#sp-save'); b.disabled=true;
      return api('/spaces/'+s.ref, { method:'PUT', body:collect() }).then(function(r){ SP.space=r.space; SP.dirty=false; $('#sp-state').textContent='저장했습니다.'; drawMissing(r.missing||[]); reload(); return r; }).finally(function(){ b.disabled=false; });
    }
    f.addEventListener('submit', function(e){ e.preventDefault(); save().then(function(){ M.toast('저장했습니다.'); }).catch(function(x){ oops(x); }); });
    var sb=$('#sp-submit'); if(sb) sb.addEventListener('click', function(){
      save().then(function(r){ if((r.missing||[]).length){ M.toast(r.missing[0]); $('#sp-missing').scrollIntoView({block:'center', behavior:'smooth'}); return; }
        return api('/spaces/'+s.ref+'/submit', { method:'POST' }).then(function(){ M.toast('심사를 요청했습니다. 확인이 끝나면 호스트센터에 표시됩니다.'); return reload(); }).then(function(){ location.hash='#home'; }); }).catch(oops); });
    var pz=$('#sp-pause'); if(pz) pz.addEventListener('click', function(){ if(!confirm('예약 받기를 잠시 멈출까요? 검색과 상세 화면에서 내려갑니다. 등록 기간은 그대로 흐릅니다.')) return; api('/spaces/'+s.ref+'/pause',{method:'POST'}).then(function(){ M.toast('잠시 멈췄습니다.'); return reload(); }).then(function(){ show('space'); }).catch(oops); });
    // 사진
    $('#sp-file').addEventListener('change', function(){ var files=Array.prototype.slice.call(this.files||[]); this.value=''; upload(files); });
    function upload(files){
      var add=$('#sp-add'); if(!files.length) return; if(add) add.classList.add('busy');
      var chain=Promise.resolve(); files.slice(0, 12-SP.photos.length).forEach(function(file){ chain=chain.then(function(){ return Promise.all([S.shrink(file, 1600, 0.84), S.shrink(file, 520, 0.78)]).then(function(x){
        return api('/spaces/'+s.ref+'/photos', { method:'POST', body:{ body:x[0].data, thumb:x[1].data, w:x[0].w, h:x[0].h } }).then(function(r){ SP.photos=r.photos; drawPhotos(); }); }); }); });
      chain.then(function(){ return api('/spaces/'+s.ref); }).then(function(r){ drawMissing(r.missing||[]); reload(); }).catch(oops).finally(function(){ var a=$('#sp-add'); if(a) a.classList.remove('busy'); });
    }
    $('#sp-ph').addEventListener('click', function(e){
      if(e.target.closest('#sp-add')) return $('#sp-file').click();
      var b=e.target.closest('[data-ph]'); if(!b) return; var id=b.getAttribute('data-id'), t=b.getAttribute('data-ph'), ids=SP.photos.map(function(p){ return p.id; }), i=ids.indexOf(id);
      if(t==='del'){ if(!confirm('이 사진을 지울까요?')) return; api('/spaces/'+s.ref+'/photos/'+id, { method:'DELETE' }).then(function(r){ SP.photos=r.photos; drawPhotos(); return api('/spaces/'+s.ref); }).then(function(r){ drawMissing(r.missing||[]); }).catch(oops); }
      else { if(t==='first'){ ids.splice(i,1); ids.unshift(id); } else if(t==='left'&&i>0){ ids.splice(i-1,0,ids.splice(i,1)[0]); } else return;
        api('/spaces/'+s.ref+'/photos', { method:'PUT', body:{ order:ids } }).then(function(r){ SP.photos=r.photos; drawPhotos(); reload(); }).catch(oops); }
    });
  }
  function drawMissing(missing){
    var el=$('#sp-missing'); if(!el) return; var s=SP.space, pre=['draft','fix','rejected'].indexOf(s.status)>=0;
    el.className='hc-banner '+(missing.length?'info':'live');
    el.innerHTML=missing.length?'<h2>'+(pre?'심사 요청까지 남은 항목':'채워야 할 항목')+'</h2><ul>'+missing.map(function(m){ return '<li>'+esc(m)+'</li>'; }).join('')+'</ul>'
      :'<h2>'+(pre?'필요한 항목을 모두 채웠습니다':'필수 항목이 모두 채워져 있습니다')+'</h2>'+(pre?'<p>아래 <b>저장하고 심사 요청</b>을 누르면 메가스팟 운영팀이 확인합니다.</p>':'<p>내용을 고치면 저장 즉시 공간 페이지에 반영됩니다.</p>');
  }
  function drawPhotos(){
    var el=$('#sp-ph'); if(!el) return;
    el.innerHTML=SP.photos.map(function(p, i){ return '<div class="ap-ph"><img src="'+esc(p.thumb)+'" alt="공간 사진 '+(i+1)+'" loading="lazy">'+(i===0?'<span class="cover">대표</span>':'')+'<span class="acts">'+(i>0?'<button type="button" data-ph="first" data-id="'+esc(p.id)+'" title="대표 사진으로" aria-label="대표 사진으로">★</button><button type="button" data-ph="left" data-id="'+esc(p.id)+'" title="앞으로" aria-label="앞으로 옮기기">←</button>':'')+'<button type="button" data-ph="del" data-id="'+esc(p.id)+'" title="삭제" aria-label="사진 삭제">✕</button></span></div>'; }).join('')
      +(SP.photos.length<12?'<button type="button" class="ap-add" id="sp-add">+ 사진 올리기<br><span class="pf-help">'+SP.photos.length+' / 12장</span></button>':'');
  }
  window.addEventListener('beforeunload', function(e){ if(SP.dirty && ST.tab==='space'){ e.preventDefault(); e.returnValue=''; } });
  function addSpace(){
    var body=drawer('공간 추가', '<form class="hc-form" id="as-form" novalidate><p class="pf-help">기본 정보를 넣으면 ‘작성 중’ 공간이 만들어집니다. 요금·사진·소개를 채워 심사를 요청하세요. 공간마다 따로 심사하고 이용료도 공간별로 계산합니다.</p>'
      +'<div class="f"><label for="as-name">공간 이름 <span class="pf-req">*</span></label><input class="input" id="as-name" name="name" required maxlength="60"></div>'
      +'<div class="field-row two"><div class="f"><label for="as-region">지역 <span class="pf-req">*</span></label><select class="select" id="as-region" name="region" required>'+S.opts(P.regions, '', '지역 선택')+'</select></div><div class="f"><label for="as-address">주소 <span class="pf-req">*</span></label><input class="input" id="as-address" name="address" required maxlength="160"></div></div>'
      +'<div class="field-row two"><div class="f"><label for="as-cap">최대 이용 인원</label><div class="unit"><input class="input" id="as-cap" name="capacity" type="number" min="1"><i>명</i></div></div><div class="f"><label for="as-area">면적</label><div class="unit"><input class="input" id="as-area" name="area" type="number" min="1"><i>평</i></div></div></div>'
      +'<div class="f"><span class="lbl">공간 유형 <span class="pf-req">*</span></span>'+S.typePicker([])+'</div><p class="pf-msg" id="as-msg" hidden></p><div><button class="btn btn-primary" type="submit">공간 만들기</button></div></form>');
    var f=$('#as-form'); S.bindTypes(f);
    f.addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(f)) return;
      api('/spaces', { method:'POST', body:{ name:v(f,'name'), region:v(f,'region'), address:v(f,'address'), capacity:v(f,'capacity'), area:v(f,'area'), types:S.readTypes(f) } }).then(function(r){ return reload().then(function(){ closeDrawer(); location.hash='#space='+r.ref; }); })
        .catch(function(x){ var m=$('#as-msg'); m.textContent=x.message; m.hidden=false; }); });
    if(location.hash==='#add') history.replaceState(null,'','#'+(ST.tab||'home')); if(main.innerHTML.indexOf('불러오는 중')>=0||!main.innerHTML) show(ST.tab||'home');
  }

  /* ---------- 통계 ---------- */
  var SD=30;
  VIEWS.stats=function(){
    api('/stats?'+q('days='+SD)).then(function(r){
      var t=r.total, b=r.bookings, max=Math.max.apply(null, r.series.map(function(x){ return x.view; }).concat([1])), pct=function(a,b){ return b?Math.round(a/b*1000)/10+'%':'–'; };
      var click=t.contact+t.sns, fmax=Math.max(t.imp, t.view, click, b.requests, b.confirmed, 1), bar=function(n){ return '<span style="width:'+Math.max(1, Math.round(n/fmax*100))+'%"></span>'; };
      main.innerHTML=head('통계', (ST.cur?esc(cur().name):'전체 공간')+' · 내 공간이 얼마나 노출되고, 조회되고, 연락과 예약으로 이어졌는지 봅니다.', '<select class="select" id="st-days" style="width:auto;min-height:38px">'+S.opts([[7,'최근 7일'],[30,'최근 30일'],[90,'최근 90일']], SD)+'</select>')
        +'<div class="hc-kpis c6">'+[['검색 노출',t.imp,'검색 결과에 나온 횟수'],['상세 조회',t.view,'공간 페이지를 연 횟수'],['연락처·카카오톡',t.contact,'전화·카카오톡 클릭'],['SNS·홈페이지',t.sns,'인스타그램 등 클릭'],['문의·예약 요청',b.requests,'메가스팟으로 접수'],['예약 확정',b.confirmed,'메가스팟 접수분 · '+won(b.amount)]].map(function(x){ return '<div class="hc-kpi"><small>'+x[0]+'</small><b>'+Number(x[1]).toLocaleString('ko-KR')+'</b><span>'+esc(x[2])+'</span></div>'; }).join('')+'</div>'
        +'<div class="hc-grid c21" style="margin-top:14px"><div class="hc-card"><h2>날짜별 상세 조회와 문의 <small>'+esc(S.kdate(r.from))+' ~ '+esc(S.kdate(r.to))+'</small></h2><div class="hc-bars">'+r.series.map(function(x){ var h=Math.round(x.view/max*100), ih=x.view?Math.min(100, Math.round(x.inquiry/x.view*100)):0;
            return '<div class="bar'+(x.view?'':' z')+'" style="height:'+h+'%" title="'+esc(x.day)+' · 조회 '+x.view+' · 문의 '+x.inquiry+'">'+(x.inquiry?'<i style="height:'+Math.max(8, ih)+'%"></i>':'')+'</div>'; }).join('')+'</div><div class="hc-axis"><span>'+esc(r.from.slice(5))+'</span><span>'+esc(r.to.slice(5))+'</span></div><div class="hc-legend"><span><i></i>상세 조회</span><span><i class="r"></i>문의·예약 요청</span></div></div>'
        +'<div class="hc-card"><h2>노출에서 예약까지</h2><div class="hc-funnel"><div>검색 노출'+bar(t.imp)+'<b>'+t.imp.toLocaleString('ko-KR')+'</b></div><div>상세 조회'+bar(t.view)+'<b>'+t.view.toLocaleString('ko-KR')+'</b></div><div>연락·SNS 클릭'+bar(click)+'<b>'+click.toLocaleString('ko-KR')+'</b></div><div>문의·예약 요청'+bar(b.requests)+'<b>'+b.requests+'</b></div><div>예약 확정'+bar(b.confirmed)+'<b>'+b.confirmed+'</b></div></div>'
        +'<dl class="hc-kv mt-2"><dt>노출 → 조회</dt><dd>'+pct(t.view,t.imp)+'</dd><dt>조회 → 문의</dt><dd>'+pct(b.requests,t.view)+'</dd><dt>문의 → 확정</dt><dd>'+pct(b.confirmed,b.requests)+'</dd><dt>찜</dt><dd>'+t.fav+'회</dd></dl><p class="pf-help mt-1">전화·카카오톡으로 바로 이어진 예약은 ‘예약 직접 등록’으로 넣어 두면 정산표에 함께 잡힙니다.</p></div></div>';
      $('#st-days').addEventListener('change', function(){ SD=+this.value; show('stats'); });
    }).catch(oops);
  };

  /* ---------- 정산 ---------- */
  var SM='';
  VIEWS.settlement=function(){
    if(!SM) SM=ST.today.slice(0,7);
    api('/settlement?'+q('month='+SM)).then(function(r){
      var t=r.total, months=r.months.indexOf(SM)<0?[SM].concat(r.months):r.months;
      main.innerHTML=head('정산', '이용일이 그 달인 확정·완료 예약을 모았습니다. 결제는 고객에게 직접 받으므로, 메가스팟이 떼거나 나중에 보내 드리는 돈은 없습니다.', '<span class="hc-acts"><select class="select" id="sm-month" style="width:auto;min-height:38px">'+S.opts(months.map(function(m){ return [m, m.slice(0,4)+'년 '+(+m.slice(5))+'월']; }), SM)+'</select><button class="btn btn-light btn-sm" type="button" id="sm-csv">엑셀(CSV)</button></span>')
        +'<div class="hc-kpis"><div class="hc-kpi"><small>확정 매출</small><b>'+esc(won(t.amount))+'</b><span>'+t.count+'건</span></div><div class="hc-kpi ok"><small>받은 금액</small><b>'+esc(won(t.paid))+'</b><span>호스트가 기록한 결제</span></div><div class="hc-kpi'+(t.due?' hot':'')+'"><small>받을 금액</small><b>'+esc(won(t.due))+'</b><span>잔금·미수금</span></div>'
        +'<div class="hc-kpi ok"><small>메가스팟 수수료</small><b>0원</b><span>'+(t.fee_if_10pct?'수수료 10% 방식이었다면 '+esc(won(t.fee_if_10pct)):'결제·관리 수수료 없음')+'</span></div></div>'
        +'<div class="hc-card" style="margin-top:14px"><h2>예약별 내역'+(Object.keys(r.by_method).length?' <small>'+Object.keys(r.by_method).map(function(k){ return esc(PAYM[k]||k)+' '+esc(won(r.by_method[k])); }).join(' · ')+'</small>':'')+'</h2>'
        +(r.rows.length?'<div class="hc-scroll"><table class="hc-table"><thead><tr><th>이용일</th><th>고객</th><th>공간</th><th>상태</th><th class="r">금액</th><th class="r">받은 금액</th><th class="r">받을 금액</th></tr></thead><tbody>'+r.rows.map(function(x){
            return '<tr><td>'+esc(S.kdate(x.date))+'</td><td><button type="button" class="pf-link" data-b="'+esc(x.code)+'">'+esc(x.name)+'</button>'+(x.source==='host'?' <span class="hc-flag soft">직접 등록</span>':'')+'</td><td>'+esc(x.space_name)+'</td><td>'+S.st(x.status, BST[x.status])+'</td><td class="r">'+esc(won(x.amount))+'</td><td class="r">'+esc(won(x.paid))+'</td><td class="r">'+(x.due?esc(won(x.due)):'–')+'</td></tr>'; }).join('')
            +'</tbody><tfoot><tr><td colspan="4">합계</td><td class="r">'+esc(won(t.amount))+'</td><td class="r">'+esc(won(t.paid))+'</td><td class="r">'+esc(won(t.due))+'</td></tr></tfoot></table></div>':empty('이 달에 확정된 예약이 없습니다.'))+'</div>';
      $('#sm-month').addEventListener('change', function(){ SM=this.value; show('settlement'); });
      $('#sm-csv').addEventListener('click', function(){ if(!r.rows.length) return M.toast('내려받을 내용이 없습니다.');
        S.csv('메가스팟_정산_'+SM+'.csv', [['예약번호','이용일','고객','공간','인원','상태','접수 경로','금액','받은 금액','받을 금액','결제 내역']].concat(r.rows.map(function(x){ return [x.code, x.date, x.name, x.space_name, x.people||'', BST[x.status], x.source==='host'?'직접 등록':'메가스팟', x.amount, x.paid, x.due, x.payments.map(function(p){ return p.date+' '+(PAYK[p.kind]||p.kind)+' '+(PAYM[p.method]||p.method)+' '+p.amount; }).join(' / ')]; }))); });
    }).catch(oops);
  };

  /* ---------- 이용료 ---------- */
  VIEWS.billing=function(){
    api('/billing').then(function(r){
      var list=ST.cur?r.spaces.filter(function(s){ return s.ref===ST.cur; }):r.spaces;
      main.innerHTML=head('이용료', '메가스팟은 결제 수수료 없이 등록 기간에 따른 월 정액만 받습니다. 입점·등록 비용은 없고, 등록이 끝난 날부터 '+r.free_months+'개월은 무료입니다.')
        +list.map(function(s){
          var pend=r.items.filter(function(b){ return b.space===s.ref && b.status==='requested'; })[0], can=s.status==='live'||s.status==='paused';
          return '<div class="hc-card"><h2><span>'+S.tierBadge(s.tier)+' '+esc(s.name)+' <span class="pf-st '+esc(s.status)+'">'+esc(s.status_label)+'</span></span><small>'+(s.listed_until?(s.visible?'공개 중 · ':'')+esc(S.kdate(s.listed_until))+'까지'+(s.days_left!=null&&s.days_left>=0?' (D-'+s.days_left+')':' · 기간 종료'):'등록 완료 후 시작')+'</small></h2>'
            +'<dl class="hc-kv"><dt>무료 등록</dt><dd>'+(s.free_until?esc(S.kdate(s.free_until))+'까지':'공개되는 날부터 '+r.free_months+'개월')+'</dd><dt>유료 등록</dt><dd>'+(s.paid_until?esc(S.kdate(s.paid_until))+'까지'+(s.plan&&S.PLAN[s.plan]?' · '+S.PLAN[s.plan].months+'개월 등록':''):'아직 없음')+'</dd></dl>'
            +(pend?'<p class="pf-msg ok mt-1">'+pend.months+'개월 등록('+esc(won(pend.amount))+')을 신청했습니다. 운영팀이 결제 방법을 안내하고, 입금이 확인되면 '+esc(S.kdate(pend.period_from))+' ~ '+esc(S.kdate(pend.period_to))+' 기간이 적용됩니다.</p>'
              :can?'<div class="hc-plan mt-2">'+r.plans.map(function(p, i){ return '<label class="ap-mode"><input type="radio" name="plan-'+esc(s.ref)+'" value="'+p.id+'"'+(i===0?' checked':'')+'><b>'+p.months+'개월 등록</b><small>하루 '+p.daily.toLocaleString('ko-KR')+'원 · 월 '+esc(S.man(p.monthly))+'<br>합계 '+esc(won(p.monthly*p.months))+'</small></label>'; }).join('')+'</div>'
                +'<div class="row mt-2"><label class="chk"><input type="checkbox" data-tax="'+esc(s.ref)+'"><span>세금계산서 발행 요청</span></label><button class="btn btn-primary btn-sm" type="button" data-bill="'+esc(s.ref)+'">이 기간으로 등록 신청</button></div><p class="pf-help mt-1">신청하면 운영팀이 결제 방법을 안내합니다. 자동으로 결제되지 않으며, 지금 기간이 끝난 다음 날부터 이어집니다.</p>'
              :'<p class="small muted mt-1">등록(공개)이 끝난 뒤에 등록 기간을 고를 수 있습니다.</p>')+'</div>'; }).join('')
        +'<div class="hc-card"><h2>신청·납부 내역</h2>'+(r.items.length?'<div class="hc-scroll"><table class="hc-table"><thead><tr><th>신청일</th><th>공간</th><th>등록 기간</th><th>적용 기간</th><th class="r">금액</th><th>상태</th></tr></thead><tbody>'+r.items.map(function(b){ var s=space(b.space);
            return '<tr><td>'+esc(String(b.created_at).slice(0,10))+'</td><td>'+esc(s?s.name:b.space)+'</td><td>'+b.months+'개월</td><td>'+esc(b.period_from)+' ~ '+esc(b.period_to)+'</td><td class="r">'+esc(won(b.amount))+'</td><td>'+S.st(b.status, b.status_label)+'</td></tr>'; }).join('')+'</tbody></table></div>':'<p class="small muted">아직 내역이 없습니다.</p>')+'</div>';
      main.querySelectorAll('[data-bill]').forEach(function(btn){ btn.addEventListener('click', function(){ var ref=btn.getAttribute('data-bill'), plan=(main.querySelector('input[name="plan-'+ref+'"]:checked')||{}).value, p=S.PLAN[plan]; if(!p) return;
        if(!confirm(p.months+'개월 등록('+won(p.monthly*p.months)+')을 신청할까요?')) return;
        api('/billing', { method:'POST', body:{ space:ref, plan:plan, tax_invoice:main.querySelector('[data-tax="'+ref+'"]').checked, tax_email:ST.host.email } }).then(function(){ M.toast('등록 기간을 신청했습니다. 운영팀이 결제 방법을 안내합니다.'); show('billing'); }).catch(oops); }); });
    }).catch(oops);
  };

  /* ---------- 계정 ---------- */
  VIEWS.account=function(){
    var h=ST.host, st=h.settings||{};
    main.innerHTML=head('계정', '담당자 정보와 새 문의 알림을 받을 연락처, 비밀번호를 관리합니다.')
      +'<div class="hc-grid c2"><form class="hc-card hc-form" id="ac-form" novalidate><h2>담당자 정보</h2><div class="f"><label>로그인 이메일</label><input class="input" value="'+esc(h.email)+'" disabled></div>'
      +'<div class="field-row two"><div class="f"><label>담당자 이름 <span class="pf-req">*</span></label><input class="input" name="name" required maxlength="40" value="'+esc(h.name)+'"></div><div class="f"><label>휴대폰 <span class="pf-req">*</span></label><input class="input" name="phone" type="tel" required value="'+esc(h.phone)+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>상호</label><input class="input" name="company" maxlength="60" value="'+esc(h.company)+'"></div><div class="f"><label>사업자등록번호</label><input class="input" name="biz_no" maxlength="20" value="'+esc(h.biz_no)+'"></div></div>'
      +'<h2 style="margin-top:6px">새 문의 알림 연락처</h2><div class="field-row two"><div class="f"><label>알림 받을 휴대폰</label><input class="input" name="notify_phone" type="tel" value="'+esc(st.notify_phone||h.phone)+'"></div><div class="f"><label>알림 받을 이메일</label><input class="input" name="notify_email" type="email" value="'+esc(st.notify_email||h.email)+'"></div></div>'
      +'<p class="pf-help">새 문의와 입금 알림은 호스트센터 홈과 문의·예약 메뉴에 표시됩니다. 문자·이메일 자동 알림은 준비되는 대로 이 연락처로 보내 드립니다.</p><div><button class="btn btn-primary" type="submit">저장</button></div></form>'
      +'<form class="hc-card hc-form" id="pw-form" novalidate><h2>비밀번호 바꾸기</h2><div class="f"><label>지금 비밀번호</label><input class="input" name="current" type="password" required autocomplete="current-password"></div><div class="f"><label>새 비밀번호 (8자 이상)</label><input class="input" name="next" type="password" required minlength="8" autocomplete="new-password"></div><p class="pf-msg" id="pw-msg" hidden></p><div><button class="btn btn-light" type="submit">비밀번호 바꾸기</button></div></form></div>';
    var f=$('#ac-form'); telFmt(f.elements.phone); telFmt(f.elements.notify_phone);
    f.addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(f)) return; api('/me', { method:'PUT', body:{ name:v(f,'name'), phone:v(f,'phone'), company:v(f,'company'), biz_no:v(f,'biz_no'), settings:{ notify_phone:v(f,'notify_phone'), notify_email:v(f,'notify_email') } } }).then(function(){ M.toast('저장했습니다.'); return reload(); }).then(function(){ $('#hc-who').textContent=ST.host.name+' 님'; }).catch(oops); });
    var pf=$('#pw-form'); pf.addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(pf)) return; var m=$('#pw-msg'); m.hidden=true;
      api('/password', { method:'POST', body:{ current:pf.elements.current.value, next:pf.elements.next.value } }).then(function(){ pf.reset(); M.toast('비밀번호를 바꿨습니다.'); }).catch(function(x){ m.textContent=x.message; m.hidden=false; }); });
  };

  /* 다른 창을 보다가 돌아오면 새 문의·입금 알림을 다시 불러옵니다 (작성 중인 내용은 건드리지 않습니다) */
  var lastSync=Date.now();
  document.addEventListener('visibilitychange', function(){
    if(document.hidden || !ST.host || Date.now()-lastSync<15000) return; lastSync=Date.now();
    var m=/^#b=(HB-[A-Z0-9-]+)$/.exec(location.hash), open=!$('#hc-drawer').hidden;
    reload().then(function(){
      if(open){ var pn=$('#bd-panel'), ms=$('#bd-msg'); if(m && pn && !pn.innerHTML && !(ms&&ms.value)) openBooking(m[1]); }
      else if(ST.tab==='home') VIEWS.home(); else if(ST.tab==='bookings') loadBookings();
    }).catch(function(){});
  });

  /* ---------- 시작 ---------- */
  try{ ST.cur=sessionStorage.getItem('hc_space')||''; }catch(e){}
  reload().then(function(){
    $('#hc-loading').hidden=true; $('#hc-app').hidden=false; $('#hc-who').textContent=ST.host.name+' 님';
    if(!ST.spaces.length){ main.innerHTML=empty('등록한 공간이 없습니다. 위 공간 선택에서 ‘+ 공간 추가’를 눌러 주세요.'); return addSpace(); }
    route();
  }).catch(function(e){ if(e && e.code==='HOST_LOGIN') return; $('#hc-loading').textContent=e&&e.code==='NO_API'?'서버에 연결하지 못했습니다. 잠시 후 다시 열어 주세요.':'호스트센터를 열지 못했습니다. 다시 로그인해 주세요.'; });
})();
