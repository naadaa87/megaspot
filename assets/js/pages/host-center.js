/* 호스트센터(/host/center/) — 홈 · 문의·예약 · 일정 · 고객 · 공간 정보 · 통계 · 정산 · 이용료 · 계정
   서버: /api/hosts/* (functions/api/hosts/[[path]].js). 결제는 고객에게 직접 받고, 여기서는 받은 금액을 기록합니다.
   2026-11-13: 메가스팟 밖(전화·카카오톡·다른 예약 플랫폼 등)에서 받은 예약도 접수 경로와 함께 넣어 한곳에서 관리합니다.
               휴대폰 홈 화면에 추가하면 앱처럼 열립니다(/host/manifest.webmanifest · /host/sw.js). 화면이 좁으면 아래쪽 메뉴를 씁니다.
   2026-11-14: 공간 등록 대행 요청 — 자료만 보내면 본사가 공간 정보를 대신 채웁니다. 본사가 대신 연 화면(AS.acting)은 공간 정보만 보입니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, $$=M.$$, esc=M.esc, P=S.P, api=S.hostApi, won=S.won, main=$('#hc-main'); if(!main) return;
  var ST={ host:null, spaces:[], cur:'', tab:'home', today:S.today(), channels:null, ctags:null, chNames:[] };
  var CONF=M.CONFIG||{}, KAKAO=CONF.kakaoChannel||'';
  var CHN={ megaspot:'메가스팟', phone:'전화', kakao:'카카오톡', sms:'문자', email:'이메일', walkin:'방문·현장', homepage:'자체 홈페이지·SNS', platform:'다른 예약 플랫폼', etc:'기타' };
  var CTAGS={ regular:'단골', corp:'기업·단체', followup:'다시 연락', caution:'주의 필요' };
  var TALK='<svg class="ico-talk" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.2C6.6 3.2 2.3 6.6 2.3 10.9c0 2.7 1.8 5.1 4.5 6.5l-.9 3.4c-.1.3.3.6.6.4l4-2.6c.5.1 1 .1 1.5.1 5.4 0 9.7-3.4 9.7-7.8S17.4 3.2 12 3.2z"/></svg>';
  // 메가스팟 카카오톡 채널 문의 — 입력하다 막히는 곳마다 둡니다
  function kakao(label, cls){ return KAKAO?'<a class="btn btn-kakao btn-sm hc-kakao'+(cls?' '+cls:'')+'" href="'+esc(KAKAO)+'" target="_blank" rel="noopener">'+TALK+esc(label||'카카오톡 문의')+'</a>':''; }
  function help(text, ref){ return KAKAO?'<div class="hc-help"><p>'+text+(ref?' 문의할 때 공간 번호 <b class="nowrap">'+esc(ref)+'</b>를 알려 주시면 바로 확인합니다.':'')+'</p>'+kakao('카카오톡으로 묻기')+'</div>':''; }
  function chLabel(k){ return (ST.channels||CHN)[k]||k; }
  function wday(iso){ return ['일','월','화','수','목','금','토'][new Date(iso+'T00:00:00').getDay()]; }
  function dayLabel(iso){ var n=S.ddays(iso); return (n===0?'오늘':n===1?'내일':n===-1?'어제':'')+(n>=-1&&n<=1?' · ':'')+(+iso.slice(5,7))+'월 '+(+iso.slice(8,10))+'일 ('+wday(iso)+')'; }
  function addD(iso, n){ var d=new Date(iso+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
  function store(k, v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){} return null; }
  function wide(){ return window.matchMedia?matchMedia('(min-width: 761px)').matches:true; }
  var BST={ new:'새 문의', quoted:'견적 안내', pending:'예약 대기', confirmed:'예약 확정', done:'이용 완료', cancelled:'취소', declined:'진행 불가' };
  var PAYK={ deposit:'예약금', balance:'잔금', full:'전액', extra:'추가 결제', refund:'환불' }, PAYM={ bank:'계좌이체', card_link:'카드·간편결제', onsite:'현장 결제', cash:'현금', platform:'플랫폼 결제', etc:'기타' };
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
    var n=0, all=0; ST.spaces.forEach(function(s){ var k=(s.counts&&s.counts.new)||0; all+=k; if(!ST.cur||s.ref===ST.cur) n+=k; });
    [$('#hc-n-new'), $('#hc-tb-new')].forEach(function(em){ if(em){ em.textContent=n; em.hidden=!n; } });
    // 홈 화면 아이콘에 새 문의 수 표시 (지원하는 휴대폰·브라우저에서만)
    try{ if(navigator.setAppBadge){ if(all) navigator.setAppBadge(all); else navigator.clearAppBadge(); } }catch(e){}
  }
  $('#hc-space').addEventListener('change', function(){ if(this.value==='+'){ this.value=ST.cur; location.hash='#add'; return; } ST.cur=this.value; try{ sessionStorage.setItem('hc_space', ST.cur); }catch(e){} fillSpaces(); show(ST.tab); });
  // 로그아웃: 회원 계정으로 들어온 경우 회원 로그인도 함께 끝냅니다
  $('#hc-logout').addEventListener('click', function(){ var member=ST.host&&ST.host.member;
    M.api('/hosts/logout',{method:'POST'}).catch(function(){}).then(function(){ return member?M.account.logout():null; }).then(function(){ location.href=member?'/':'/host/login/'; }); });
  function reload(){ return api('/me').then(function(r){ ST.host=r.host; ST.spaces=r.spaces||[]; ST.today=r.today||S.today(); ST.channels=r.channels||CHN; ST.ctags=r.customer_tags||CTAGS; ST.chNames=r.channel_names||[];
    if(ST.cur && !space(ST.cur)) ST.cur=''; if(!ST.cur && ST.spaces.length===1) ST.cur=ST.spaces[0].ref; fillSpaces(); return asLoad().then(function(){ return r; }); }); }
  var VIEWS={}, VT=0;
  // 화면을 바꾼 뒤 늦게 도착한 응답이 새 화면을 덮어쓰지 않게 합니다
  function fresh(){ var my=VT; return function(){ return my===VT; }; }
  function show(tab){
    if(!VIEWS[tab]) tab='home'; if(AS.acting) tab='space'; ST.tab=tab; VT++;   // 본사가 대신 연 화면은 공간 정보만
    $$('#hc-nav a, #hc-tabbar a').forEach(function(a){ var on=a.getAttribute('data-tab')===tab; a.classList.toggle('on', on); if(on){ a.setAttribute('aria-current','page'); if(a.closest('#hc-nav') && wide()) a.scrollIntoView({block:'nearest', inline:'center'}); } else a.removeAttribute('aria-current'); });
    var more=$('#hc-more'); if(more) more.classList.toggle('on', ['space','stats','settlement','billing','account'].indexOf(tab)>=0);
    var fab=$('#hc-fab'); if(fab) fab.hidden=['home','bookings','calendar','customers'].indexOf(tab)<0;
    main.innerHTML='<div class="hc-empty">불러오는 중…</div>'; window.scrollTo(0,0); VIEWS[tab]();
  }
  function route(){
    var h=location.hash.replace(/^#/,''), m;
    if(!/^b=/.test(h) && !$('#hc-drawer').hidden){ $('#hc-drawer').hidden=true; document.body.classList.remove('hc-lock'); }
    if((m=/^space=(SP-[A-Z0-9-]+)$/.exec(h))){ if(space(m[1])){ ST.cur=m[1]; fillSpaces(); } return show('space'); }
    if((m=/^b=(HB-[A-Z0-9-]+)$/.exec(h))){ show('bookings'); return openBooking(m[1]); }
    if(h==='add') return addSpace();
    if(h==='new'){ history.replaceState(null,'','#bookings'); show('bookings'); return manualBooking(); }   // 홈 화면 바로가기 ‘예약 등록’
    show(h||'home');
  }
  window.addEventListener('hashchange', route);
  // 주소가 이미 그 메뉴를 가리키고 있어도(상세를 닫은 직후 등) 메뉴를 누르면 다시 엽니다
  ['#hc-nav', '#hc-tabbar'].forEach(function(id){ var nav=$(id); if(nav) nav.addEventListener('click', function(e){ var a=e.target.closest('a[data-tab]'); if(a && location.hash==='#'+a.getAttribute('data-tab')){ e.preventDefault(); show(a.getAttribute('data-tab')); } }); });
  var fabBtn=$('#hc-fab'); if(fabBtn) fabBtn.addEventListener('click', function(){ manualBooking(ST.tab==='calendar'&&CAL.pick?{ date:CAL.pick }:{}); });
  // 좁은 화면의 ‘더보기’ — 아래쪽 메뉴에 없는 화면과 도움말
  var moreBtn=$('#hc-more'); if(moreBtn) moreBtn.addEventListener('click', function(){
    var items=[['space','공간 정보','소개·요금·사진 고치기, 심사 요청'],['stats','통계','노출·조회·문의 흐름'],['settlement','정산','월별 매출·받을 금액·접수 경로별'],['billing','이용료','등록 기간·결제 내역'],['account','계정','담당자·알림 연락처·비밀번호']];
    var body=drawer('더보기', '<div class="hc-more">'+items.map(function(x){ return '<a href="#'+x[0]+'" data-close><b>'+x[1]+'</b><span>'+x[2]+'</span></a>'; }).join('')+'</div>'
      +(INST.standalone()?'':'<div class="hc-sec"><h3>홈 화면에 추가</h3><p class="small">휴대폰 홈 화면에 아이콘을 만들어 두면 앱처럼 바로 열립니다.</p><div><button class="btn btn-primary btn-sm" type="button" data-install>방법 보기</button></div></div>')
      +help('호스트센터 사용법이나 입점 절차가 궁금하면 메가스팟 카카오톡 채널로 물어보세요.', ST.cur||'')
      +'<div class="hc-acts"><a class="btn btn-light btn-sm" href="/host/">입점 안내·이용료</a><a class="btn btn-light btn-sm" href="'+(ST.host&&ST.host.member?'/mypage/':'/')+'">고객 화면으로</a><button class="btn btn-ghost btn-sm" type="button" data-logout>로그아웃</button></div>');
    body.onclick=function(e){ if(e.target.closest('[data-install]')) return INST.guide(); if(e.target.closest('[data-logout]')) return $('#hc-logout').click(); var a=e.target.closest('a[href^="#"]'); if(a){ e.preventDefault(); closeDrawer(); location.hash=a.getAttribute('href'); if(ST.tab===a.getAttribute('href').slice(1)) show(ST.tab); } };
  });
  document.addEventListener('click', function(e){ if(e.target.closest('[data-install]') && !e.target.closest('#hc-d-body')) INST.guide(); });

  /* ---------- 홈 화면에 추가 (앱처럼 쓰기) ---------- */
  var INST=(function(){
    var deferred=null, ua=navigator.userAgent||'';
    var ios=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1), android=/Android/i.test(ua);
    var inapp=/KAKAOTALK/i.test(ua)?'kakao':/NAVER\(inapp|DaumApps|Instagram|FBAN|FBAV|Line\/|everytimeApp|BAND\//i.test(ua)?'other':'';
    var samsung=/SamsungBrowser/i.test(ua);
    function standalone(){ return !!((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true); }
    window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferred=e; $$('[data-install-quick]').forEach(function(b){ b.hidden=false; }); });
    window.addEventListener('appinstalled', function(){ deferred=null; store('hc_inst_off', String(Date.now())); M.toast('홈 화면에 추가했습니다. 다음부터는 아이콘을 눌러 바로 여세요.'); $$('.hc-install').forEach(function(x){ x.remove(); }); });
    function step(list){ return '<ol class="hc-isteps">'+list.map(function(t){ return '<li>'+t+'</li>'; }).join('')+'</ol>'; }
    function guide(){
      var url=location.origin+'/host/center/', h='';
      if(standalone()) h='<p>지금 홈 화면 앱으로 열려 있습니다. 따로 할 일은 없습니다.</p>';
      else if(inapp==='kakao') h='<p class="pf-msg">카카오톡 안에서 연 화면은 홈 화면에 추가할 수 없습니다. 먼저 휴대폰 기본 브라우저로 열어 주세요.</p><div class="hc-acts"><a class="btn btn-primary" href="kakaotalk://web/openExternal?url='+encodeURIComponent(url)+'">다른 브라우저로 열기</a></div><p class="small muted">열린 브라우저에서 이 메뉴(더보기 → 홈 화면에 추가)를 다시 눌러 주세요.</p>';
      else if(inapp) h='<p class="pf-msg">앱 안에서 연 화면은 홈 화면에 추가할 수 없습니다.</p>'+step(['오른쪽 위나 아래의 <b>⋮</b> 또는 <b>⋯</b> 메뉴를 누릅니다.','<b>다른 브라우저로 열기</b>(또는 ‘Safari로 열기’, ‘Chrome으로 열기’)를 고릅니다.','열린 브라우저에서 이 안내를 다시 봅니다.'])+'<div class="hc-acts"><button class="btn btn-light btn-sm" type="button" data-copy-url>호스트센터 주소 복사</button></div>';
      else if(deferred) h='<p>버튼을 누르면 휴대폰이 설치를 묻습니다. <b>설치</b>(또는 ‘추가’)를 누르면 홈 화면에 아이콘이 생깁니다.</p><div class="hc-acts"><button class="btn btn-primary" type="button" data-install-now>홈 화면에 추가</button></div>';
      else if(ios) h=step(['Safari 화면 아래(또는 위)의 <b>공유 버튼(□↑)</b>을 누릅니다. 공유 버튼이 보이지 않으면 <b>⋯</b> 버튼을 먼저 누르세요.','목록을 올려 <b>홈 화면에 추가</b>를 누릅니다.','이름이 ‘메가스팟 호스트’인지 확인하고 <b>추가</b>를 누릅니다.'])+'<p class="small muted">아이폰은 홈 화면 아이콘으로 처음 열 때 로그인을 한 번 더 해야 합니다. 사파리와 로그인 정보를 따로 보관하기 때문입니다. 크롬을 쓰고 있다면 주소창 옆 공유 버튼에서 같은 메뉴를 찾을 수 있습니다.</p>';
      else if(samsung) h=step(['화면 아래의 <b>메뉴(≡)</b>를 누릅니다.','<b>현재 페이지 추가</b>를 누릅니다.','<b>홈 화면</b>을 고르면 아이콘이 생깁니다.']);
      else if(android) h=step(['크롬 오른쪽 위의 <b>⋮</b> 메뉴를 누릅니다.','<b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누릅니다.','<b>설치</b>(또는 ‘추가’)를 누르면 아이콘이 생깁니다.']);
      else h='<p>컴퓨터에서는 주소창 오른쪽의 <b>설치 아이콘(⊕)</b>이나 브라우저 메뉴의 <b>앱 설치</b>로 바탕화면에 바로가기를 만들 수 있습니다.</p><p>휴대폰에 추가하려면 휴대폰에서 아래 주소를 열고 이 안내를 다시 보세요.</p><div class="hc-acts"><button class="btn btn-light btn-sm" type="button" data-copy-url>호스트센터 주소 복사</button></div>';
      var body=drawer('홈 화면에 추가하기', '<div class="hc-sec hc-install-why"><img src="/assets/img/brand/host-app-192.png" alt="" width="56" height="56"><div><b>메가스팟 호스트</b><p class="small">아이콘을 누르면 호스트센터가 바로 열립니다. 새 문의 확인, 예약 등록, 오늘 일정, 고객 메모를 앱처럼 쓸 수 있습니다. 따로 내려받는 앱은 없고, 휴대폰 저장 공간도 거의 쓰지 않습니다.</p></div></div><div class="hc-sec">'+h+'</div>'+help('추가가 잘 안 되면 쓰는 휴대폰 기종을 알려 주세요. 방법을 안내해 드립니다.'));
      body.onclick=function(e){
        if(e.target.closest('[data-install-now]')&&deferred){ var d=deferred; deferred=null; d.prompt(); (d.userChoice||Promise.resolve({})).then(function(c){ if(c&&c.outcome==='accepted') closeDrawer(); }); return; }
        if(e.target.closest('[data-copy-url]')) M.copy(url).then(function(ok){ M.toast(ok?'주소를 복사했습니다. 휴대폰 브라우저에 붙여 넣어 열어 주세요.':'복사하지 못했습니다.'); });
      };
    }
    // 홈 화면 안내 카드 (좁은 화면 · 앱으로 열지 않았을 때 · 닫은 지 14일이 지났을 때)
    function card(){
      if(standalone() || wide()) return ''; var off=+store('hc_inst_off')||0; if(off && Date.now()-off<14*864e5) return '';
      return '<div class="hc-install"><img src="/assets/img/brand/host-app-192.png" alt="" width="48" height="48"><div><b>호스트센터를 앱처럼 쓰세요</b><p>홈 화면에 아이콘을 만들어 두면 새 문의와 오늘 일정을 바로 확인할 수 있습니다.</p></div><div class="hc-acts"><button class="btn btn-primary btn-sm" type="button" data-install>홈 화면에 추가</button><button class="btn btn-ghost btn-sm" type="button" data-install-off>다음에</button></div></div>';
    }
    document.addEventListener('click', function(e){ if(e.target.closest('[data-install-off]')){ store('hc_inst_off', String(Date.now())); var c=e.target.closest('.hc-install'); if(c) c.remove(); } });
    if(standalone()) document.documentElement.classList.add('hc-standalone');
    return { guide:guide, card:card, standalone:standalone, quick:function(){ return !!deferred; } };
  })();
  if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('/host/sw.js', { scope:'/host/' }).catch(function(){});

  /* ---------- 홈 ---------- */
  function banner(s){
    var until=s.listed_until, left=s.days_left, kind='info', title='', body='', btn='';
    if(s.status==='draft'){ var as=asFor(s.ref); title='입점 신청이 접수되었습니다'; body='<p>아래 항목을 채우고 <b>심사 요청</b>을 누르면 메가스팟 운영팀이 확인합니다.</p><ul data-missing="'+esc(s.ref)+'"><li>확인하는 중…</li></ul>'
        +(as?'<p class="hc-assist-line">공간 등록 대행 <b>'+esc(as.status_label)+'</b> · '+esc(asLead(as))+'</p>':'<p class="hc-assist-line">직접 채우기 번거로우면 공간소개서나 홈페이지 주소만 보내 주세요. 메가스팟이 대신 등록해 드립니다.</p>');
      btn='<a class="btn btn-primary btn-sm" href="#space='+esc(s.ref)+'">'+(as?'진행 상황 보기':'공간 정보 채우기')+' →</a>'+(as?'':'<button class="btn btn-light btn-sm" type="button" data-assist="'+esc(s.ref)+'">공간 등록 대행 요청</button>'); }
    else if(s.status==='review'){ kind='warn'; title='메가스팟 운영팀이 등록 내용을 확인하고 있습니다'; body='<p>확인이 끝나면 이 화면에 결과가 표시됩니다. 기다리는 동안에도 공간 정보와 사진은 고칠 수 있습니다.</p>'; }
    else if(s.status==='fix'){ kind='bad'; title='보완 요청이 있습니다'; body='<p>'+esc(s.review_note||'')+'</p>'; btn='<a class="btn btn-primary btn-sm" href="#space='+esc(s.ref)+'">고치러 가기 →</a>'; }
    else if(s.status==='rejected'||s.status==='hidden'){ kind='bad'; title=s.status==='rejected'?'입점이 반려되었습니다':'운영팀이 공간을 숨겼습니다'; body='<p>'+esc(s.review_note||'자세한 내용은 운영팀에 문의해 주세요.')+'</p>'; }
    else if(s.status==='paused'){ kind='warn'; title='예약 받기를 잠시 멈췄습니다'; body='<p>검색과 상세 화면에 보이지 않습니다. 다시 받을 준비가 되면 켜 주세요.</p>'; btn='<button class="btn btn-primary btn-sm" type="button" data-resume="'+esc(s.ref)+'">다시 공개하기</button>'; }
    else if(s.status==='live' && !s.visible){ kind='bad'; title='등록 기간이 끝나 검색에서 내려갔습니다'; body='<p>'+esc(S.kdate(until))+'에 끝났습니다. 등록 기간을 고르면 다시 공개됩니다. 수수료는 없고 월 정액 이용료만 냅니다.</p>'; btn='<a class="btn btn-primary btn-sm" href="#billing">등록 기간 고르기 →</a>'; }
    else { kind=left!=null&&left<=14?'warn':'live'; var free=s.free_until && s.free_until>=(s.paid_until||''); title='공개 중'+(left!=null?' · '+(free?'무료 등록 ':'등록 ')+'D-'+Math.max(0,left):'');
      body=free?'<p>무료 등록 기간은 <b>'+esc(S.kdate(until))+'</b>까지입니다. 이 기간 안에 등록 기간을 결제해 두면 무료 기간이 끝난 다음 날부터 끊기지 않고 이어집니다. 끝나기 30일 전과 7일 전에는 알림톡으로도 알려 드립니다.</p>'
        :'<p>등록 기간은 <b>'+esc(S.kdate(until))+'</b>까지입니다.'+(left!=null&&left<=14?' 끝나기 전에 등록 기간을 골라 주세요.':'')+'</p>';
      btn='<a class="btn btn-light btn-sm" href="/spaces/view/?id='+encodeURIComponent(s.ref)+'" target="_blank" rel="noopener">내 공간 페이지 ↗</a>'+(free||(left!=null&&left<=30)?'<a class="btn '+(left!=null&&left<=30?'btn-primary':'btn-ghost')+' btn-sm" href="#billing">'+(free?'등록 기간 미리 결제하기':'등록 기간 고르기')+' →</a>':''); }
    return '<div class="hc-banner '+kind+'"><h2>'+S.tierBadge(s.tier)+esc(s.name)+' <span class="pf-st '+esc(s.status)+'">'+esc(s.status_label)+'</span></h2><div><b>'+esc(title)+'</b></div>'+body+(btn?'<div class="hc-acts">'+btn+'</div>':'')+'</div>';
  }
  function bookingRow(b){
    var flags=(b.paid_notice?'<span class="hc-flag">입금 알림</span>':'')+(b.cancel_requested?'<span class="hc-flag">취소 요청</span>':'')+(b.last==='customer'&&b.status!=='new'?'<span class="hc-flag soft">고객 메시지</span>':'')
      +(b.source==='host'?'<span class="hc-flag soft ch">'+esc(b.channel_label||'직접 등록')+'</span>':'')+(b.visits>=2?'<span class="hc-flag soft">다시 찾은 고객</span>':'')+(b.conflict?'<span class="hc-flag warn">시간 겹침</span>':'')
      +(b.addons||[]).map(function(a){ return '<span class="hc-flag hq">'+esc(a)+'</span>'; }).join('');
    return '<button type="button" class="hc-row" data-b="'+esc(b.code)+'"><div><div class="r1">'+S.st(b.status, BST[b.status])+'<b>'+esc(b.name)+'</b>'+flags+'</div><div class="r2">'+esc(when(b))+(ST.cur?'':' · '+esc(b.space_name||''))+(b.purpose_label?' · '+esc(b.purpose_label):'')+'</div></div>'
      +'<div class="amt">'+(b.amount!=null?esc(won(b.amount)):'금액 미정')+(b.amount!=null&&b.status!=='new'&&b.status!=='quoted'?'<small>'+(b.due?'받을 금액 '+esc(won(b.due)):'결제 완료')+'</small>':'')+'</div></button>';
  }
  // 일정 한 줄 (홈 · 일정 목록 · 고객 이력에서 같이 씁니다)
  function agendaRow(b, opt){
    opt=opt||{};
    return '<button type="button" class="hc-ag'+(b.conflict?' clash':'')+(b.status==='new'||b.status==='quoted'?' soft':'')+'" data-b="'+esc(b.code)+'"><span class="t">'+(b.start?esc(b.start)+(b.end?'<small>~'+esc(b.end)+'</small>':''):'<small>시간 미정</small>')+'</span>'
      +'<span class="m"><span class="r1">'+S.st(b.status, BST[b.status])+'<b>'+esc(b.name)+'</b>'+(b.people?'<span class="muted">'+b.people+'명</span>':'')+(b.conflict?'<span class="hc-flag warn">시간 겹침</span>':'')+'</span>'
      +'<span class="r2">'+esc([!ST.cur||opt.space?b.space_name:'', b.channel_label, b.org].filter(Boolean).join(' · '))+'</span></span>'
      +'<span class="a">'+(b.due?'<small>받을 금액</small>'+esc(won(b.due)):b.amount!=null?esc(won(b.amount)):'')+'</span></button>';
  }
  function agendaHtml(items, blocks, opt){
    opt=opt||{}; var by={}, days=[];
    items.forEach(function(b){ if(!by[b.date]){ by[b.date]={ b:[], k:[] }; days.push(b.date); } by[b.date].b.push(b); });
    (blocks||[]).forEach(function(k){ if(!by[k.day]){ by[k.day]={ b:[], k:[] }; days.push(k.day); } by[k.day].k.push(k); });
    days.sort(); if(!days.length) return empty(opt.none||'이 기간에 잡힌 일정이 없습니다.');
    return days.map(function(d){ var x=by[d];
      return '<div class="hc-agday'+(d===ST.today?' today':'')+'"><h3>'+esc(dayLabel(d))+'</h3>'+x.k.map(function(k){ return '<div class="hc-agclosed">예약 받지 않는 날'+(ST.cur?'':' · '+esc(k.space_name))+(k.note?' · '+esc(k.note):'')+'</div>'; }).join('')+x.b.map(function(b){ return agendaRow(b, opt); }).join('')+'</div>'; }).join('');
  }
  VIEWS.home=function(){
    var list=ST.cur?[cur()]:ST.spaces, c={}; list.forEach(function(s){ Object.keys(s.counts||{}).forEach(function(k){ c[k]=(c[k]||0)+s.counts[k]; }); });
    main.innerHTML=head('안녕하세요, '+ST.host.name+' 님', '오늘 확인할 문의와 예약, 내 공간 상태를 모았습니다.')
      +'<div class="hc-quick"><button type="button" class="hc-q" data-quick="new"><b>+</b><span>예약 등록</span></button><a class="hc-q" href="#calendar"><b>일정</b><span>오늘·이번 주</span></a><a class="hc-q" href="#customers"><b>고객</b><span>연락처·이력</span></a><a class="hc-q" href="#space"><b>공간</b><span>정보 고치기</span></a></div>'
      +INST.card()
      +list.map(banner).join('')
      +'<div class="hc-kpis">'+[['new','새 문의','답변을 기다리는 요청'],['quoted','견적 안내','고객 수락 대기'],['pending','예약 대기','결제 확인 대기'],['confirmed','예약 확정','다가오는 행사']].map(function(k){
          return '<button type="button" class="hc-kpi'+(k[0]==='new'&&c.new?' hot':'')+'" data-goto="bookings:'+k[0]+'"><small>'+k[1]+'</small><b>'+(c[k[0]]||0)+'</b><span>'+k[2]+'</span></button>'; }).join('')+'</div>'
      +'<div class="hc-grid c21" style="margin-top:14px"><div><div class="hc-card"><h2>오늘부터 일주일 일정 <a class="pf-link" href="#calendar" style="font-size:13.5px">일정 전체</a></h2><div id="hm-ag">'+empty('불러오는 중…')+'</div></div>'
      +'<div class="hc-card"><h2>먼저 볼 문의·예약 <a class="pf-link" href="#bookings" style="font-size:13.5px">전체 보기</a></h2><div id="hm-list" class="hc-list">'+empty('불러오는 중…')+'</div></div></div>'
      +'<div><div class="hc-card"><h2>최근 30일 <a class="pf-link" href="#stats" style="font-size:13.5px">통계</a></h2><div id="hm-stats"></div></div><div class="hc-card" id="hm-save"></div>'
      +'<div class="hc-card"><h2>도움이 필요하면</h2><p class="small">공간 등록, 예약 처리, 이용료 결제가 헷갈리면 메가스팟 카카오톡 채널로 물어보세요. 확인하는 대로 답해 드립니다.</p><div class="hc-acts mt-1">'+kakao('카카오톡 문의')+(INST.standalone()?'':'<button class="btn btn-light btn-sm" type="button" data-install>홈 화면에 추가</button>')+'</div></div></div></div>';
    var ok=fresh(); api('/schedule?'+q('from='+ST.today+'&to='+addD(ST.today, 6))).then(function(r){ if(!ok()) return; var it=r.items.filter(function(b){ return b.status!=='new'&&b.status!=='quoted'; });
      $('#hm-ag').innerHTML=agendaHtml(it, r.blocks, { none:'앞으로 일주일 동안 확정·대기 중인 예약이 없습니다. 전화·카카오톡·다른 플랫폼에서 받은 예약도 ‘+ 예약 등록’으로 넣어 두면 여기에 함께 보입니다.' }); }).catch(function(){ $('#hm-ag').innerHTML=''; });
    $$('[data-missing]', main).forEach(function(ul){ api('/spaces/'+ul.getAttribute('data-missing')).then(function(r){ ul.innerHTML=(r.missing||[]).length?r.missing.map(function(m){ return '<li>'+esc(m)+'</li>'; }).join(''):'<li>필요한 항목을 모두 채웠습니다. 공간 정보에서 심사를 요청해 주세요.</li>'; }).catch(function(){ ul.innerHTML=''; }); });
    api('/bookings?'+q('status=open')).then(function(r){ if(!ok()) return; var it=(r.items||[]).filter(function(b){ return b.status!=='confirmed'||b.paid_notice||b.cancel_requested||(b.date&&S.ddays(b.date)<=7&&S.ddays(b.date)>=0); }).slice(0,6);
      $('#hm-list').innerHTML=it.length?it.map(bookingRow).join(''):empty('지금 확인할 문의가 없습니다. 새 문의가 들어오면 여기에 표시됩니다.'); }).catch(oops);
    api('/stats?'+q('days=30')).then(function(r){ if(!ok()) return; var t=r.total;
      $('#hm-stats').innerHTML='<div class="hc-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">'+[['검색 노출',t.imp],['상세 조회',t.view],['연락·SNS 클릭',t.contact+t.sns],['문의·예약 요청',r.bookings.requests]].map(function(x){ return '<div class="hc-kpi"><small>'+x[0]+'</small><b>'+x[1].toLocaleString('ko-KR')+'</b></div>'; }).join('')+'</div>'; }).catch(function(){});
    api('/settlement?'+q('month='+ST.today.slice(0,7))).then(function(r){ if(!ok()) return; var t=r.total;
      $('#hm-save').innerHTML='<h2>이번 달 확정 매출</h2><p style="font-size:24px;font-weight:800">'+esc(won(t.amount))+' <span class="small muted" style="font-weight:600">· '+t.count+'건</span></p><p class="small mt-1">메가스팟 수수료 <b style="color:var(--ok)">0원</b>'+(t.fee_if_10pct?' · 수수료 10% 방식이었다면 <b>'+esc(won(t.fee_if_10pct))+'</b>':'')+'</p><p class="mt-1"><a class="pf-link" href="#settlement" style="font-size:13.5px">정산표 보기</a></p>'; }).catch(function(){});
  };
  main.addEventListener('click', function(e){
    var g=e.target.closest('[data-goto]'); if(g){ var p=g.getAttribute('data-goto').split(':'); BK.status=p[1]||'open'; location.hash='#'+p[0]; if(ST.tab===p[0]) show(p[0]); return; }
    if(e.target.closest('[data-quick="new"]')) return manualBooking();
    var r=e.target.closest('[data-resume]'); if(r){ api('/spaces/'+r.getAttribute('data-resume')+'/resume',{method:'POST'}).then(function(){ M.toast('다시 공개했습니다.'); return reload(); }).then(function(){ show(ST.tab); }).catch(oops); return; }
    var b=e.target.closest('[data-b]'); if(b){ openBooking(b.getAttribute('data-b')); }
  });

  /* ---------- 문의·예약 ---------- */
  var BK={ status:'open', q:'', ch:'', items:[] };
  VIEWS.bookings=function(){
    main.innerHTML=head('문의·예약', '메가스팟으로 들어온 요청과 전화·카카오톡·다른 예약 플랫폼에서 받은 예약을 한곳에서 관리합니다. 새 문의 → 견적 안내 → 예약 대기 → 예약 확정 순서로 진행합니다.', '<button class="btn btn-primary btn-sm" type="button" id="bk-new">+ 예약 등록</button>')
      +'<div class="hc-chips" id="bk-chips"></div><div class="hc-chips sub" id="bk-chs"></div><div class="row mt-1"><input class="input" id="bk-q" type="search" placeholder="이름·연락처·예약번호로 찾기" style="max-width:320px" value="'+esc(BK.q)+'"><button class="btn btn-light btn-sm" type="button" id="bk-csv">엑셀(CSV)</button></div><div class="hc-list" id="bk-list"></div>';
    $('#bk-new').addEventListener('click', function(){ manualBooking(); });
    $('#bk-chs').addEventListener('click', function(e){ var c=e.target.closest('[data-ch]'); if(c){ BK.ch=c.getAttribute('data-ch'); loadBookings(); } });
    var t; $('#bk-q').addEventListener('input', function(){ clearTimeout(t); var x=this.value.trim(); t=setTimeout(function(){ BK.q=x; loadBookings(); }, 250); });
    $('#bk-chips').addEventListener('click', function(e){ var c=e.target.closest('[data-st]'); if(c){ BK.status=c.getAttribute('data-st'); loadBookings(); } });
    $('#bk-csv').addEventListener('click', function(){ if(!BK.items.length) return M.toast('내려받을 내용이 없습니다.');
      S.csv('메가스팟_문의예약_'+ST.today+'.csv', [['예약번호','상태','공간','이름','단체','연락처','이용일','시작','끝','인원','금액','받은 금액','받을 금액','플랫폼 수수료','본사 부가서비스','접수 경로','접수일']].concat(BK.items.map(function(b){ return [b.code, BST[b.status], b.space_name, b.name, b.org||'', b.phone, b.date, b.start, b.end, b.people||'', b.amount==null?'':b.amount, b.paid, b.due==null?'':b.due, b.ext_fee==null?'':b.ext_fee, (b.addons||[]).join(' / '), b.channel_label||(b.source==='host'?'직접 등록':'메가스팟'), String(b.created_at).slice(0,10)]; }))); });
    loadBookings();
  };
  function loadBookings(){
    var ok=fresh(); api('/bookings?'+q('status='+encodeURIComponent(BK.status==='all'?'':BK.status)+(BK.q?'&q='+encodeURIComponent(BK.q):'')+(BK.ch?'&channel='+encodeURIComponent(BK.ch):''))).then(function(r){
      if(!ok()||!$('#bk-list')) return; var chs=r.channels||[]; if(BK.ch && !chs.some(function(c){ return c.key===BK.ch; })) BK.ch='';
      $('#bk-chs').innerHTML=chs.length>1||BK.ch?'<span class="lbl">접수 경로</span><button type="button" class="chip'+(BK.ch?'':' on')+'" data-ch="">전체</button>'+chs.map(function(c){ return '<button type="button" class="chip'+(BK.ch===c.key?' on':'')+'" data-ch="'+esc(c.key)+'">'+esc(c.label)+' <i>'+c.n+'</i></button>'; }).join(''):'';
      BK.items=r.items||[]; var c=r.counts||{}, open=(c.new||0)+(c.quoted||0)+(c.pending||0)+(c.confirmed||0), closed=(c.done||0)+(c.cancelled||0)+(c.declined||0);
      $('#bk-chips').innerHTML=[['open','진행 중',open],['new','새 문의',c.new||0],['quoted','견적 안내',c.quoted||0],['pending','예약 대기',c.pending||0],['confirmed','예약 확정',c.confirmed||0],['closed','끝난 건',closed]].map(function(x){
        return '<button type="button" class="chip'+(BK.status===x[0]?' on':'')+'" data-st="'+x[0]+'">'+x[1]+' <i>'+x[2]+'</i></button>'; }).join('');
      $('#bk-list').innerHTML=BK.items.length?BK.items.map(bookingRow).join(''):empty(BK.q?'찾는 문의·예약이 없습니다.':BK.status==='open'?'진행 중인 문의·예약이 없습니다. 공간이 공개되면 고객의 예약 요청이 여기로 들어옵니다. 전화·카카오톡·다른 플랫폼에서 받은 예약은 ‘+ 예약 등록’으로 넣어 두세요.':'해당하는 건이 없습니다.');
    }).catch(oops);
  }
  function linesTable(lines, total, extra){ return '<table class="hc-lines"><tbody>'+lines.map(function(l){ return '<tr><td>'+esc(l.label)+(l.desc?'<small>'+esc(l.desc)+'</small>':'')+'</td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('')+(extra||'')+'<tr class="sum"><td>합계</td><td>'+esc(won(total))+'</td></tr></tbody></table>'; }
  function openBooking(code){
    api('/bookings/'+encodeURIComponent(code)).then(function(r){ drawBooking(r); if(location.hash!=='#b='+code) history.replaceState(null,'','#b='+code); }).catch(oops);
  }
  function act(code, body, okMsg){
    return api('/bookings/'+encodeURIComponent(code), { method:'PATCH', body:body }).then(function(r){ if(okMsg) M.toast(okMsg); drawBooking(r); reload().then(function(){ if(ST.tab==='bookings') loadBookings(); else if(ST.tab==='calendar'||ST.tab==='home') show(ST.tab); }); return r; })
      .catch(function(e){
        // 같은 시간에 다른 예약이 있거나 닫은 날이면 한 번 더 묻고 진행합니다
        if(e && e.code==='OVERLAP' && !body.force){ if(confirm(e.message+'\n\n그래도 진행할까요?')){ var b2={}; Object.keys(body).forEach(function(k){ b2[k]=body[k]; }); b2.force=true; return act(code, b2, okMsg); } return; }
        oops(e); });
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
    var tel=(b.phone||'').replace(/[^0-9+]/g,''), ckey=(b.phone||'').replace(/\D/g,'');
    var chRow='<dt>접수 경로</dt><dd>'+esc(b.channel_label||(b.source==='host'?'직접 등록':'메가스팟'))+(b.ext_ref?' · 예약번호 '+esc(b.ext_ref):'')+(b.ext_fee?' · 플랫폼 수수료 '+esc(won(b.ext_fee)):'')+'</dd>';
    var html='<div class="hc-sec"><h3>'+S.st(b.status, BST[b.status])+' <span class="small muted">'+esc(b.space_name)+' · '+esc(b.channel_label||(b.source==='host'?'직접 등록':'메가스팟'))+' · '+esc(String(b.created_at).slice(0,10))+' 접수</span></h3>'
      +(b.paid_notice?'<p class="pf-msg ok">고객이 입금(결제)했다고 알렸습니다'+(b.paid_notice.note?' — '+esc(b.paid_notice.note):'')+'. 확인 후 결제를 기록해 주세요.</p>':'')+(b.cancel_requested?'<p class="pf-msg">고객이 예약 취소를 요청했습니다. 환불 규정을 확인하고 처리해 주세요.</p>':'')
      +(b.cancel?'<p class="pf-msg">'+(b.cancel.by==='customer'?'고객이 취소':'호스트가 처리')+(b.cancel.reason?' — '+esc(b.cancel.reason):'')+'</p>':'')
      +'<dl class="hc-kv"><dt>고객</dt><dd><b>'+esc(b.name)+'</b>'+(b.org?' · '+esc(b.org):'')+(ckey.length>=9?' <button type="button" class="pf-link small" data-cust="'+esc(ckey)+'">고객 정보·이력</button>':'')+'</dd>'
      +'<dt>연락처</dt><dd>'+(tel?'<a class="pf-link" href="tel:'+esc(tel)+'">'+esc(b.phone)+'</a> · <a class="pf-link" href="sms:'+esc(tel)+'">문자</a>':'<span class="muted">연락처 없음</span>')+(b.email?' · '+esc(b.email):'')+'</dd>'
      +chRow+'<dt>이용 일시</dt><dd>'+esc(when(b))+'</dd>'+(b.purpose_label?'<dt>모임</dt><dd>'+esc(b.purpose_label)+'</dd>':'')+(b.visit?'<dt>현장답사</dt><dd>답사를 먼저 원합니다</dd>':'')+(b.message?'<dt>요청 내용</dt><dd>'+esc(b.message)+'</dd>':'')+'</dl>'
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
    html+='<div class="hc-sec"><h3>운영 메모 <span class="small muted">호스트만 봅니다</span></h3><textarea class="textarea" id="bd-memo" maxlength="2000" rows="3">'+esc(b.memo||'')+'</textarea><div><button class="btn btn-light btn-sm" data-act="memo">메모 저장</button></div></div>'
      +help('견적, 결제 기록, 취소 처리 방법이 궁금하면 물어보세요.', b.code);
    var body=drawer(esc(b.name)+' <span class="small muted">'+esc(b.code)+'</span>', html), th=$('#bd-thread'); th.scrollTop=th.scrollHeight;
    function panel(h){ var p=$('#bd-panel'); p.innerHTML=h?'<div class="ap-box" style="margin-top:4px">'+h+'</div>':''; if(h) p.scrollIntoView({block:'nearest', behavior:'smooth'}); return p; }
    body.onclick=function(e){
      var c=e.target.closest('[data-copy]'); if(c){ M.copy(c.getAttribute('data-copy')).then(function(ok){ M.toast(ok?'링크를 복사했습니다. 카카오톡·문자로 보내 주세요.':'복사하지 못했습니다.'); }); return; }
      var cu=e.target.closest('[data-cust]'); if(cu){ openCustomer(cu.getAttribute('data-cust')); return; }
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
        var host=b.source==='host';
        panel('<b>예약 내용 고치기</b><div class="field-row three"><div class="f"><label for="e-date">이용일</label><input class="input" id="e-date" type="date" value="'+esc(b.date)+'"></div><div class="f"><label for="e-start">시작</label><input class="input" id="e-start" type="time" step="1800" value="'+esc(b.start)+'"></div><div class="f"><label for="e-end">끝</label><input class="input" id="e-end" type="time" step="1800" value="'+esc(b.end)+'"></div></div>'
          +'<div class="field-row two"><div class="f"><label for="e-people">인원</label><div class="unit"><input class="input" id="e-people" type="number" min="1" value="'+(b.people||'')+'"><i>명</i></div></div><div class="f"><label for="e-amount">확정 금액</label><div class="unit"><input class="input" id="e-amount" type="number" min="0" value="'+(b.amount==null?'':b.amount)+'"><i>원</i></div></div></div>'
          +'<div class="field-row two"><div class="f"><label for="e-name">고객 이름</label><input class="input" id="e-name" maxlength="40" value="'+esc(b.name)+'"></div><div class="f"><label for="e-phone">연락처'+(host?' (모르면 비워 두세요)':'')+'</label><input class="input" id="e-phone" type="tel" value="'+esc(b.phone||'')+'"></div></div>'
          +'<div class="field-row two"><div class="f"><label for="e-org">단체·회사</label><input class="input" id="e-org" maxlength="60" value="'+esc(b.org||'')+'"></div><div class="f"><label for="e-email">이메일</label><input class="input" id="e-email" type="email" maxlength="120" value="'+esc(b.email||'')+'"></div></div>'
          +(host?'<div class="field-row two"><div class="f"><label for="e-ch">접수 경로</label><select class="select" id="e-ch">'+S.opts(Object.keys(ST.channels||CHN).filter(function(k){ return k!=='megaspot'; }).map(function(k){ return [k, chLabel(k)]; }), b.channel||'phone')+'</select></div><div class="f"><label for="e-chn">플랫폼·경로 이름</label><input class="input" id="e-chn" maxlength="30" list="hc-chnames" value="'+esc(b.channel_name||'')+'" placeholder="다른 플랫폼·기타일 때"></div></div>'
            +'<div class="field-row two"><div class="f"><label for="e-xref">플랫폼 예약번호</label><input class="input" id="e-xref" maxlength="40" value="'+esc(b.ext_ref||'')+'"></div><div class="f"><label for="e-xfee">플랫폼 수수료</label><div class="unit"><input class="input" id="e-xfee" type="number" min="0" value="'+(b.ext_fee==null?'':b.ext_fee)+'"><i>원</i></div></div></div>'+chDatalist():'')
          +'<div><button class="btn btn-primary btn-sm" data-act="edit-save">저장</button></div>');
        telFmt($('#e-phone'));
      } else if(t==='edit-save'){ var eb={ action:'edit', date:$('#e-date').value, start:$('#e-start').value, end:$('#e-end').value, people:$('#e-people').value, amount:$('#e-amount').value, name:$('#e-name').value, phone:$('#e-phone').value, org:$('#e-org').value, email:$('#e-email').value };
        if($('#e-ch')){ eb.channel=$('#e-ch').value; eb.channel_name=$('#e-chn').value; eb.ext_ref=$('#e-xref').value; eb.ext_fee=$('#e-xfee').value; }
        act(b.code, eb, '고쳤습니다.'); }
    };
    body.oninput=function(e){ if(e.target.closest('#q-rows')) qSum(); };
  }
  function qRow(l){ return '<div class="hc-q-row"><input class="input" data-ql maxlength="60" placeholder="항목" value="'+esc(l.label||'')+'"><input class="input" data-qa type="number" inputmode="numeric" placeholder="금액" value="'+(l.amount===''||l.amount==null?'':l.amount)+'"><button type="button" data-act="q-del" aria-label="항목 삭제">✕</button></div>'; }
  function qSum(){ var el=$('#q-sum'); if(!el) return; var t=0; $$('#q-rows [data-qa]').forEach(function(i){ t+=(+i.value||0); }); el.textContent='합계 '+won(t); }
  // 플랫폼 이름 고르기 목록 (이 호스트가 전에 적은 이름)
  function chDatalist(){ return '<datalist id="hc-chnames">'+(ST.chNames||[]).map(function(n){ return '<option value="'+esc(n)+'">'; }).join('')+'</datalist>'; }
  // 고객 이름·번호 자동 완성용 — 고객 목록을 한 번 불러와 둡니다
  var CUST={ list:null, at:0 };
  function customers(){ if(CUST.list && Date.now()-CUST.at<60000) return Promise.resolve(CUST.list); return api('/customers?sort=recent').then(function(r){ CUST.list=r.items||[]; CUST.at=Date.now(); return CUST.list; }); }
  // 예약 등록 — 메가스팟 밖에서 받은 예약(전화·카카오톡·문자·방문·다른 예약 플랫폼 등)을 넣어 일정·고객·정산에 함께 잡습니다
  function manualBooking(pre){
    if(!ST.spaces.length) return; pre=pre||{};
    var chs=Object.keys(ST.channels||CHN).filter(function(k){ return k!=='megaspot'; }), ch0=pre.channel&&chs.indexOf(pre.channel)>=0?pre.channel:'phone';
    var body=drawer('예약 등록', '<form class="hc-form" id="mb-form" novalidate><p class="pf-help">전화·카카오톡·현장이나 다른 예약 플랫폼에서 받은 예약을 넣어 두면 일정·고객·정산에 함께 잡히고, 같은 시간에 예약이 겹치면 미리 알려 드립니다. 확정한 예약 시간은 메가스팟 공간 페이지에도 ‘예약 있음’으로 표시됩니다.</p>'
      +'<div class="f"><span class="lbl">어디서 받은 예약인가요?</span><div class="hc-seg" role="radiogroup" aria-label="접수 경로">'+chs.map(function(k){ return '<label><input type="radio" name="channel" value="'+k+'"'+(k===ch0?' checked':'')+'><span>'+esc(chLabel(k))+'</span></label>'; }).join('')+'</div></div>'
      +'<div class="ap-box" id="mb-ext" hidden><div class="field-row three"><div class="f"><label for="mb-chn" id="mb-chn-l">플랫폼 이름</label><input class="input" id="mb-chn" name="channel_name" maxlength="30" list="hc-chnames" placeholder="예약을 받은 곳"></div><div class="f" data-plat><label for="mb-xref">플랫폼 예약번호 (선택)</label><input class="input" id="mb-xref" name="ext_ref" maxlength="40"></div><div class="f" data-plat><label for="mb-xfee">플랫폼 수수료 (선택)</label><div class="unit"><input class="input" id="mb-xfee" name="ext_fee" type="number" inputmode="numeric" min="0"><i>원</i></div></div></div><p class="pf-help" data-plat>수수료를 적어 두면 정산에서 실제로 남는 금액을 함께 보여 줍니다.</p>'+chDatalist()+'</div>'
      +(ST.spaces.length>1?'<div class="f"><label for="mb-space">공간</label><select class="select" id="mb-space" name="space">'+S.opts(ST.spaces.map(function(s){ return [s.ref, s.name]; }), pre.space||ST.cur||ST.spaces[0].ref)+'</select></div>':'<input type="hidden" name="space" value="'+esc(ST.spaces[0].ref)+'">')
      +'<div class="field-row two"><div class="f"><label for="mb-name">고객 이름 <span class="pf-req">*</span></label><input class="input" id="mb-name" name="name" required maxlength="40" autocomplete="off" value="'+esc(pre.name||'')+'"></div><div class="f"><label for="mb-phone">연락처 <span class="pf-req" id="mb-phone-req">*</span></label><input class="input" id="mb-phone" name="phone" type="tel" autocomplete="off" value="'+esc(pre.phone||'')+'"></div></div>'
      +'<div class="hc-suggest" id="mb-sug" hidden></div>'
      +'<div class="field-row two"><div class="f"><label for="mb-org">단체·회사 (선택)</label><input class="input" id="mb-org" name="org" maxlength="60" value="'+esc(pre.org||'')+'"></div><div class="f"><label for="mb-people">인원</label><div class="unit"><input class="input" id="mb-people" name="people" type="number" inputmode="numeric" min="1"><i>명</i></div></div></div>'
      +'<div class="field-row three"><div class="f"><label for="mb-date">이용일</label><input class="input" id="mb-date" name="date" type="date" value="'+esc(pre.date||'')+'"></div><div class="f"><label for="mb-start">시작</label><input class="input" id="mb-start" name="start" type="time" step="1800"></div><div class="f"><label for="mb-end">끝</label><input class="input" id="mb-end" name="end" type="time" step="1800"></div></div>'
      +'<div class="field-row two"><div class="f"><label for="mb-amount">예약 금액</label><div class="unit"><input class="input" id="mb-amount" name="amount" type="number" inputmode="numeric" min="0"><i>원</i></div></div><div class="f"><label for="mb-status">상태</label><select class="select" id="mb-status" name="status">'+S.opts([['confirmed','예약 확정'],['pending','예약 대기 (결제 전)'],['quoted','견적 안내'],['new','새 문의']], 'confirmed')+'</select></div></div>'
      +'<div class="field-row two"><div class="f"><label for="mb-paid">이미 받은 금액 (선택)</label><div class="unit"><input class="input" id="mb-paid" name="paid_amount" type="number" inputmode="numeric" min="0"><i>원</i></div></div><div class="f"><label for="mb-paidm">받은 방법</label><select class="select" id="mb-paidm" name="paid_method">'+S.opts(Object.keys(PAYM).map(function(k){ return [k,PAYM[k]]; }), 'bank')+'</select></div></div>'
      +'<div class="f"><label for="mb-memo">메모 (호스트만 봅니다)</label><textarea class="textarea" id="mb-memo" name="memo" rows="2" maxlength="2000" placeholder="예: 케이터링 따로 준비, 주차 3대"></textarea></div>'
      +'<div id="mb-clash" hidden></div><p class="pf-msg" id="mb-msg" hidden></p><div class="row"><button class="btn btn-primary" type="submit" id="mb-submit">등록</button><button class="btn btn-light" type="button" data-close>닫기</button></div>'
      +help('다른 플랫폼 예약을 어떻게 넣을지, 겹치는 예약은 어떻게 할지 궁금하면 물어보세요.')+'</form>');
    var f=$('#mb-form'); telFmt(f.elements.phone);
    function chSync(){ var k=(f.querySelector('input[name=channel]:checked')||{}).value, ext=k==='platform'||k==='etc', plat=k==='platform';
      $('#mb-ext').hidden=!ext; $('#mb-chn-l').textContent=plat?'플랫폼 이름':'어디서 받았나요?'; $$('[data-plat]', f).forEach(function(x){ x.hidden=!plat; });
      $('#mb-phone-req').hidden=plat; if(plat && f.elements.paid_method.value==='bank') f.elements.paid_method.value='platform'; else if(!plat && f.elements.paid_method.value==='platform') f.elements.paid_method.value='bank'; }
    f.addEventListener('change', function(e){ if(e.target.name==='channel') chSync(); }); chSync();
    // 이전에 예약한 고객이면 이름·번호로 찾아 채웁니다
    var sug=$('#mb-sug'), st;
    function suggest(){ var nm=f.elements.name.value.trim().toLowerCase(), dg=f.elements.phone.value.replace(/\D/g,'');
      if(nm.length<2 && dg.length<4){ sug.hidden=true; return; }
      customers().then(function(list){ var hit=list.filter(function(c){ return (dg.length>=4 && c.key.indexOf(dg)>=0) || (nm.length>=2 && c.names.some(function(n){ return n.toLowerCase().indexOf(nm)>=0; })); }).slice(0,4);
        if(!hit.length || (hit.length===1 && hit[0].key===dg)){ sug.hidden=true; return; }
        sug.innerHTML='<span class="small muted">이전에 예약한 고객</span>'+hit.map(function(c){ return '<button type="button" data-pick="'+esc(c.key)+'"><b>'+esc(c.name)+'</b> '+esc(c.phone)+(c.org?' · '+esc(c.org):'')+' <span class="muted">· '+c.bookings+'건</span></button>'; }).join(''); sug.hidden=false;
        sug.onclick=function(e){ var b=e.target.closest('[data-pick]'); if(!b) return; var c=hit.filter(function(x){ return x.key===b.getAttribute('data-pick'); })[0]; if(!c) return; f.elements.name.value=c.name; f.elements.phone.value=c.phone; if(c.org&&!f.elements.org.value) f.elements.org.value=c.org; sug.hidden=true; };
      }).catch(function(){ sug.hidden=true; }); }
    [f.elements.name, f.elements.phone].forEach(function(el){ el.addEventListener('input', function(){ clearTimeout(st); st=setTimeout(suggest, 220); }); });
    function send(force){
      var m=$('#mb-msg'), ch=(f.querySelector('input[name=channel]:checked')||{}).value||'phone', btn=$('#mb-submit'); m.hidden=true;
      if(!v(f,'name')){ m.textContent='고객 이름을 적어 주세요.'; m.hidden=false; return f.elements.name.focus(); }
      if(ch!=='platform' && !v(f,'phone')){ m.textContent='연락처를 적어 주세요. 다른 플랫폼 예약이라 번호를 모르면 접수 경로를 ‘다른 예약 플랫폼’으로 고르세요.'; m.hidden=false; return f.elements.phone.focus(); }
      if(v(f,'end') && !v(f,'start')){ m.textContent='시작 시각도 적어 주세요.'; m.hidden=false; return; }
      btn.disabled=true;
      api('/bookings', { method:'POST', body:{ space:v(f,'space'), channel:ch, channel_name:v(f,'channel_name'), ext_ref:v(f,'ext_ref'), ext_fee:v(f,'ext_fee'), name:v(f,'name'), phone:v(f,'phone'), org:v(f,'org'), date:v(f,'date'), start:v(f,'start'), end:v(f,'end'), people:v(f,'people'), amount:v(f,'amount'), status:v(f,'status'), paid_amount:v(f,'paid_amount'), paid_method:v(f,'paid_method'), memo:v(f,'memo'), force:!!force } })
        .then(function(r){ M.toast('예약을 등록했습니다.'); CUST.list=null; var nm=v(f,'channel_name'); if(nm && (ST.chNames||[]).indexOf(nm)<0) ST.chNames=(ST.chNames||[]).concat([nm]);
          reload().then(function(){ if(['bookings','calendar','home','customers'].indexOf(ST.tab)>=0) show(ST.tab); }); openBooking(r.code); })
        .catch(function(x){ btn.disabled=false;
          if(x && x.code==='OVERLAP'){ var d=x.detail||{}, box=$('#mb-clash');
            box.innerHTML='<div class="hc-clash"><b>'+(d.closed&&!(d.conflicts||[]).length?'이 날짜는 예약을 받지 않도록 닫아 둔 날입니다':'같은 시간에 이미 잡힌 예약이 있습니다')+'</b>'+(d.closed&&(d.conflicts||[]).length?'<p class="small">이 날짜는 닫아 둔 날이기도 합니다.</p>':'')
              +(d.conflicts||[]).map(function(c){ return '<div class="row small"><span>'+S.st(c.status, c.status_label)+'</span><b>'+esc(c.name)+'</b><span>'+esc(c.start?c.start+(c.end?'~'+c.end:''):'시간 미정')+'</span><span class="muted">'+esc(c.channel||'')+'</span></div>'; }).join('')
              +'<p class="small">시간을 고치거나, 정말 함께 받는 예약이면 그대로 등록하세요.</p><div class="row"><button class="btn btn-primary btn-sm" type="button" id="mb-force">그래도 등록</button><button class="btn btn-light btn-sm" type="button" id="mb-fix">시간 고치기</button></div></div>';
            box.hidden=false; box.scrollIntoView({ block:'nearest', behavior:'smooth' });
            $('#mb-force').onclick=function(){ box.hidden=true; send(true); }; $('#mb-fix').onclick=function(){ box.hidden=true; f.elements.start.focus(); };
            return; }
          m.textContent=(x&&x.message)||'등록하지 못했습니다.'; m.hidden=false; });
    }
    f.addEventListener('submit', function(e){ e.preventDefault(); send(false); });
    f.addEventListener('input', function(e){ if(e.target.closest('[name=date],[name=start],[name=end]')) $('#mb-clash').hidden=true; });
    if(wide()) setTimeout(function(){ (pre.name?f.elements.people:f.elements.name).focus({ preventScroll:true }); }, 60);
  }

  /* ---------- 일정 (목록 · 달력 · 휴대폰 캘린더 구독) ---------- */
  var CAL={ ym:'', mode:'', lf:'', pick:'' };
  VIEWS.calendar=function(){
    if(!CAL.mode) CAL.mode=store('hc_cal_mode')||(wide()?'month':'list');
    if(!CAL.ym) CAL.ym=ST.today.slice(0,7); if(!CAL.lf) CAL.lf=ST.today;
    var s=ST.cur?cur():null, name=s?s.name:'전체 공간 ('+ST.spaces.length+'곳)';
    main.innerHTML=head('일정', esc(name)+' · 메가스팟 예약과 직접 넣은 예약(전화·카카오톡·다른 플랫폼)을 함께 봅니다. 같은 시간에 겹치는 예약은 빨간색으로 표시합니다.',
        '<span class="hc-acts"><span class="hc-seg2" role="group" aria-label="보기 방식"><button type="button" data-cm="list" aria-pressed="'+(CAL.mode==='list')+'">목록</button><button type="button" data-cm="month" aria-pressed="'+(CAL.mode==='month')+'">달력</button></span><button class="btn btn-primary btn-sm" type="button" id="cal-new">+ 예약 등록</button></span>')
      +'<div id="cal-body">'+empty('불러오는 중…')+'</div>'
      +'<div class="hc-card" id="cal-sync" style="margin-top:14px"><h2>휴대폰 캘린더에서 보기</h2><p class="small">아이폰 캘린더나 구글 캘린더에 구독해 두면 예약이 휴대폰 기본 캘린더에도 표시됩니다. 고객 연락처는 넣지 않습니다.</p><div class="hc-acts mt-1"><button class="btn btn-light btn-sm" type="button" id="ical-show">구독 주소 받기</button></div><div id="ical-box"></div></div>';
    $('#cal-new').addEventListener('click', function(){ manualBooking({ date:CAL.pick||'' }); });
    $$('[data-cm]', main).forEach(function(b){ b.addEventListener('click', function(){ CAL.mode=b.getAttribute('data-cm'); store('hc_cal_mode', CAL.mode); show('calendar'); }); });
    $('#ical-show').addEventListener('click', icalBox);
    if(CAL.mode==='list') calList(); else calMonth();
  };
  function calList(){
    var from=CAL.lf, to=addD(from, 30), box=$('#cal-body'), ok=fresh();
    api('/schedule?'+q('from='+from+'&to='+to)).then(function(r){ if(!ok()||!document.body.contains(box)) return;
      box.innerHTML='<div class="hc-card"><div class="hc-calnav"><button class="btn btn-light btn-sm" type="button" data-lf="-30" aria-label="이전 30일">←</button><b>'+esc(r.from.slice(5).replace('-','.'))+' ~ '+esc(r.to.slice(5).replace('-','.'))+(from!==ST.today?' <button class="pf-link small" type="button" data-lf="0">오늘부터</button>':'')+'</b><button class="btn btn-light btn-sm" type="button" data-lf="30" aria-label="다음 30일">→</button></div>'
        +agendaHtml(r.items, r.blocks, { none:'이 기간에 잡힌 일정이 없습니다. 다른 곳에서 받은 예약도 ‘+ 예약 등록’으로 넣어 두면 여기에 보입니다.' })+'</div>';
      box.onclick=function(e){ var l=e.target.closest('[data-lf]'); if(l){ var n=+l.getAttribute('data-lf'); CAL.lf=n?addD(CAL.lf, n):ST.today; calList(); } };
    }).catch(oops);
  }
  function calMonth(){
    var y=+CAL.ym.slice(0,4), m=+CAL.ym.slice(5,7), first=new Date(y, m-1, 1), days=new Date(y, m, 0).getDate(), from=CAL.ym+'-01', to=CAL.ym+'-'+M.pad2(days), box=$('#cal-body'), all=!ST.cur;
    box.innerHTML='<div class="hc-card"><div class="hc-calnav"><button class="btn btn-light btn-sm" type="button" data-cal="-1" aria-label="이전 달">←</button><b>'+y+'년 '+m+'월</b><button class="btn btn-light btn-sm" type="button" data-cal="1" aria-label="다음 달">→</button></div><p class="hc-legend2">확정 <span class="pf-st confirmed">■</span> 대기 <span class="pf-st pending">■</span> 문의 <span class="pf-st quoted">■</span> · 빗금 = 닫은 날 · 빨간 줄 = 시간 겹침</p><div class="hc-cal" id="cal-grid">'+empty('불러오는 중…')+'</div><p class="pf-help mt-1">날짜를 누르면 그날 예약을 보고, 예약을 넣거나 예약 받지 않는 날로 닫을 수 있습니다. 닫은 날짜는 고객 검색에서 빠집니다.</p></div>';
    $$('[data-cal]', box).forEach(function(b){ b.addEventListener('click', function(){ var d=new Date(y, m-1+(+b.getAttribute('data-cal')), 1); CAL.ym=d.getFullYear()+'-'+M.pad2(d.getMonth()+1); calMonth(); }); });
    var ok=fresh(); api('/schedule?'+q('from='+from+'&to='+to)).then(function(r){
      if(!ok()||!$('#cal-grid')) return; var blk={}, bk={}; (r.blocks||[]).forEach(function(x){ (blk[x.day]=blk[x.day]||[]).push(x); }); (r.items||[]).forEach(function(x){ (bk[x.date]=bk[x.date]||[]).push(x); });
      var html=['일','월','화','수','목','금','토'].map(function(d){ return '<div class="dow">'+d+'</div>'; }).join(''); for(var i=0;i<first.getDay();i++) html+='<div class="hc-day out"></div>';
      for(var d=1; d<=days; d++){ var iso=CAL.ym+'-'+M.pad2(d), dow=new Date(y, m-1, d).getDay(), list=bk[iso]||[], cl=blk[iso]||[], clash=list.some(function(x){ return x.conflict; }), shut=all?cl.length&&cl.length>=ST.spaces.length:cl.length;
        html+='<button type="button" class="hc-day'+(iso<ST.today?' past':'')+(iso===ST.today?' today':'')+(shut?' closed':'')+(clash?' clash':'')+'" data-day="'+iso+'"><span class="n'+(dow===0?' sun':dow===6?' sat':'')+'">'+d+'</span>'+(cl.length?'<span class="cl">'+(all&&!shut?'닫음 '+cl.length+'곳':'닫음')+'</span>':'')
          +list.slice(0,3).map(function(x){ return '<span class="ev '+esc(x.status)+(x.conflict?' clash':'')+'">'+esc((x.start?x.start+' ':'')+x.name)+'</span>'; }).join('')+(list.length>3?'<span class="cl">+'+(list.length-3)+'</span>':'')+'</button>'; }
      $('#cal-grid').innerHTML=html;
      $('#cal-grid').onclick=function(e){ var b=e.target.closest('[data-day]'); if(!b) return; dayDrawer(b.getAttribute('data-day'), bk[b.getAttribute('data-day')]||[], blk[b.getAttribute('data-day')]||[]); };
    }).catch(oops);
  }
  function dayDrawer(iso, list, cl){
    CAL.pick=iso; var spaces=ST.cur?[cur()]:ST.spaces, closed={}; cl.forEach(function(k){ closed[k.space]=k.note||' '; });
    var body=drawer(esc(dayLabel(iso)), '<div class="hc-sec"><h3>이날 예약 <button class="btn btn-primary btn-sm" type="button" id="day-new">+ 이 날 예약 등록</button></h3>'+(list.length?'<div class="hc-aglist">'+list.map(function(x){ return agendaRow(x, { space:true }); }).join('')+'</div>':'<p class="small muted">예약이 없습니다.</p>')+'</div>'
      +'<div class="hc-sec"><h3>예약 받기</h3>'+spaces.map(function(sp){ var c=closed[sp.ref];
        return '<div class="hc-dayrow"><div><b>'+esc(sp.name)+'</b><span class="small muted">'+(c!==undefined?'닫음'+(String(c).trim()?' · '+esc(c):'')+' · 고객 검색과 예약 요청에서 빠집니다':'예약 받는 중')+'</span></div>'
          +(c!==undefined?'<button class="btn btn-light btn-sm" type="button" data-open="'+esc(sp.ref)+'">다시 열기</button>':'<button class="btn btn-ghost btn-sm" type="button" data-shut="'+esc(sp.ref)+'">이 날짜 닫기</button>')+'</div>'; }).join('')
        +'<div class="f"><label for="day-note">닫는 이유 (선택 · 호스트만 봅니다)</label><input class="input" id="day-note" maxlength="80" placeholder="예: 내부 행사, 공사, 다른 플랫폼 예약"></div></div>');
    body.onclick=function(ev){ var bb=ev.target.closest('[data-b]'); if(bb) return openBooking(bb.getAttribute('data-b'));
      if(ev.target.id==='day-new'){ return manualBooking({ date:iso }); }
      var o=ev.target.closest('[data-open],[data-shut]'); if(!o) return; var ref=o.getAttribute('data-open')||o.getAttribute('data-shut'), on=o.hasAttribute('data-shut');
      api('/spaces/'+ref+'/blocks', { method:'PUT', body:{ day:iso, on:on, note:($('#day-note')||{}).value||'' } }).then(function(){ M.toast(on?'이 날짜를 닫았습니다.':'다시 열었습니다.'); closeDrawer(); show('calendar'); }).catch(oops); };
  }
  function icalBox(){
    var box=$('#ical-box'); box.innerHTML='<p class="small muted mt-1">주소를 만드는 중…</p>';
    function draw(r){
      box.innerHTML='<div class="hc-ical"><div class="hc-acts"><a class="btn btn-primary btn-sm" href="'+esc(r.webcal)+'">아이폰·맥 캘린더에 추가</a><button class="btn btn-light btn-sm" type="button" data-ical-copy>구독 주소 복사</button></div>'
        +'<ol class="hc-isteps"><li><b>아이폰</b>: 위 버튼을 누르고 ‘구독’을 누르면 기본 캘린더에 ‘메가스팟 예약’이 생깁니다.</li><li><b>구글 캘린더</b>: 컴퓨터에서 구글 캘린더를 열고 왼쪽 ‘다른 캘린더’ 옆 <b>+</b> → <b>URL로 추가</b>에 복사한 주소를 붙여 넣습니다. 안드로이드 휴대폰의 구글 캘린더에도 함께 보입니다.</li></ol>'
        +'<p class="pf-help">캘린더 앱이 몇 시간마다 새로 읽어 와서 바로 반영되지 않을 수 있습니다(구글 캘린더는 더 늦기도 합니다). 이 주소를 아는 사람은 일정을 볼 수 있으니 다른 사람에게 보내지 마세요. 주소가 알려졌다면 <button type="button" class="pf-link" data-ical-reset>새 주소 만들기</button>를 누르면 예전 주소는 더 이상 열리지 않습니다.</p></div>';
      box.onclick=function(e){ if(e.target.closest('[data-ical-copy]')) M.copy(r.url).then(function(ok){ M.toast(ok?'구독 주소를 복사했습니다.':'복사하지 못했습니다.'); });
        if(e.target.closest('[data-ical-reset]') && confirm('새 주소를 만들까요? 예전 주소로 구독한 캘린더는 더 이상 새로 고쳐지지 않습니다.')) api('/ical', { method:'POST', body:{ reset:true } }).then(function(x){ M.toast('새 주소를 만들었습니다. 캘린더에 다시 추가해 주세요.'); draw(x); }).catch(oops); };
    }
    api('/ical').then(draw).catch(function(e){ box.innerHTML=''; oops(e); });
  }

  /* ---------- 고객 (연락처로 묶은 예약 이력 · 메모) ---------- */
  var CU={ q:'', tag:'', sort:'recent', items:[] };
  VIEWS.customers=function(){
    main.innerHTML=head('고객', '메가스팟으로 들어온 요청과 직접 넣은 예약(전화·카카오톡·다른 플랫폼)을 연락처로 묶었습니다. 단골 표시와 메모를 남겨 두면 다음 예약 때 바로 확인할 수 있습니다.', '<span class="hc-acts"><button class="btn btn-primary btn-sm" type="button" id="cu-new">+ 예약 등록</button><button class="btn btn-light btn-sm" type="button" id="cu-csv">엑셀(CSV)</button></span>')
      +'<div class="hc-kpis" id="cu-kpis"></div>'
      +'<div class="row mt-2"><input class="input" id="cu-q" type="search" placeholder="이름·연락처·단체·메모로 찾기" style="max-width:320px" value="'+esc(CU.q)+'"><select class="select" id="cu-sort" style="width:auto;min-height:40px">'+S.opts([['recent','최근 예약 순'],['next','다가오는 예약 순'],['count','예약 많은 순'],['total','매출 높은 순'],['name','이름 순']], CU.sort)+'</select></div>'
      +'<div class="hc-chips mt-1" id="cu-tags"></div><div class="hc-list" id="cu-list">'+empty('불러오는 중…')+'</div>'
      +'<p class="pf-help mt-2">연락처 없이 넣은 예약(다른 플랫폼 예약 등)은 고객 목록에 묶이지 않습니다. 같은 사람이 다른 번호로 예약하면 따로 보입니다.</p>';
    $('#cu-new').addEventListener('click', function(){ manualBooking(); });
    var t; $('#cu-q').addEventListener('input', function(){ clearTimeout(t); var x=this.value.trim(); t=setTimeout(function(){ CU.q=x; loadCustomers(); }, 250); });
    $('#cu-sort').addEventListener('change', function(){ CU.sort=this.value; loadCustomers(); });
    $('#cu-tags').addEventListener('click', function(e){ var c=e.target.closest('[data-tag]'); if(c){ CU.tag=c.getAttribute('data-tag'); loadCustomers(); } });
    $('#cu-list').addEventListener('click', function(e){ var c=e.target.closest('[data-cust]'); if(c) openCustomer(c.getAttribute('data-cust')); });
    $('#cu-csv').addEventListener('click', function(){ if(!CU.items.length) return M.toast('내려받을 내용이 없습니다.');
      S.csv('메가스팟_고객_'+ST.today+'.csv', [['이름','연락처','단체','이메일','예약','확정·완료','확정 매출','받을 금액','마지막 이용일','다음 예약일','접수 경로','표시','메모']].concat(CU.items.map(function(c){ return [c.name, c.phone, c.org, c.email, c.bookings, c.used, c.total, c.due, c.last_date, c.next_date, c.channels.join(' / '), c.tags.map(function(k){ return (ST.ctags||CTAGS)[k]||k; }).join(' / '), c.memo]; }))); });
    loadCustomers();
  };
  function loadCustomers(){
    var ok=fresh(); api('/customers?q='+encodeURIComponent(CU.q)+'&sort='+encodeURIComponent(CU.sort)+'&tag='+encodeURIComponent(CU.tag)).then(function(r){
      if(!ok()||!$('#cu-list')) return; CU.items=r.items||[]; var tags=r.tags||ST.ctags||CTAGS;
      $('#cu-kpis').innerHTML='<div class="hc-kpi"><small>전체 고객</small><b>'+r.total+'</b><span>연락처 기준</span></div><div class="hc-kpi"><small>다시 찾은 고객</small><b>'+r.repeat+'</b><span>예약 2건 이상</span></div>';
      $('#cu-tags').innerHTML=[['','전체'],['repeat','다시 찾은 고객'],['due','받을 금액 있음']].concat(Object.keys(tags).map(function(k){ return [k, tags[k]]; })).map(function(x){ return '<button type="button" class="chip'+(CU.tag===x[0]?' on':'')+'" data-tag="'+esc(x[0])+'">'+esc(x[1])+'</button>'; }).join('');
      $('#cu-list').innerHTML=CU.items.length?CU.items.map(function(c){
        return '<button type="button" class="hc-row" data-cust="'+esc(c.key)+'"><div><div class="r1"><b>'+esc(c.name)+'</b>'+(c.org&&c.org!==c.name?'<span class="muted">'+esc(c.org)+'</span>':'')+c.tags.map(function(k){ return '<span class="hc-flag soft tag-'+esc(k)+'">'+esc(tags[k]||k)+'</span>'; }).join('')+(c.bookings>=2?'<span class="hc-flag soft">다시 찾은 고객</span>':'')+'</div>'
          +'<div class="r2">'+esc(c.phone)+' · 예약 '+c.bookings+'건'+(c.used?' · 확정 '+c.used+'건':'')+(c.next_date?' · 다음 예약 '+esc(S.kdate(c.next_date)):c.last_date?' · 마지막 이용 '+esc(S.kdate(c.last_date)):'')+' · '+esc(c.channels.join(', '))+'</div>'+(c.memo?'<div class="r2 memo">'+esc(c.memo.slice(0,90))+'</div>':'')+'</div>'
          +'<div class="amt">'+esc(won(c.total))+'<small>'+(c.due?'받을 금액 '+esc(won(c.due)):'확정 매출')+'</small></div></button>'; }).join('')
        :empty(CU.q||CU.tag?'조건에 맞는 고객이 없습니다.':'아직 고객이 없습니다. 메가스팟 요청이 들어오거나 예약을 등록하면 연락처별로 여기에 모입니다.');
    }).catch(oops);
  }
  function openCustomer(key){
    api('/customers/'+encodeURIComponent(key)).then(function(r){
      var c=r.customer, tags=r.tags||ST.ctags||CTAGS, tel=(c.phone||'').replace(/[^0-9+]/g,'');
      var body=drawer(esc(c.name)+(c.org&&c.org!==c.name?' <span class="small muted">'+esc(c.org)+'</span>':''), '<div class="hc-sec"><dl class="hc-kv"><dt>연락처</dt><dd><a class="pf-link" href="tel:'+esc(tel)+'">'+esc(c.phone)+'</a> · <a class="pf-link" href="sms:'+esc(tel)+'">문자</a>'+(c.email?' · '+esc(c.email):'')+'</dd>'
          +(c.names.length>1?'<dt>다른 이름</dt><dd>'+esc(c.names.slice(1).join(', '))+'</dd>':'')+'<dt>예약</dt><dd>'+c.bookings+'건 · 확정·완료 '+c.used+'건</dd><dt>확정 매출</dt><dd><b>'+esc(won(c.total))+'</b>'+(c.due?' · 받을 금액 '+esc(won(c.due)):'')+'</dd>'
          +'<dt>접수 경로</dt><dd>'+esc(c.channels.join(', '))+'</dd><dt>처음 접수</dt><dd>'+esc(String(c.first_at).slice(0,10))+'</dd>'+(c.next_date?'<dt>다음 예약</dt><dd>'+esc(S.kdate(c.next_date))+'</dd>':'')+'</dl>'
          +'<div class="hc-acts"><button class="btn btn-primary btn-sm" type="button" id="cu-book">+ 이 고객으로 예약 등록</button></div></div>'
        +'<div class="hc-sec"><h3>표시 · 메모 <span class="small muted">호스트만 봅니다</span></h3><div class="checks">'+Object.keys(tags).map(function(k){ return '<label class="chk"><input type="checkbox" name="cu-tag" value="'+esc(k)+'"'+(c.tags.indexOf(k)>=0?' checked':'')+'><span>'+esc(tags[k])+'</span></label>'; }).join('')+'</div>'
          +'<textarea class="textarea" id="cu-memo" rows="3" maxlength="2000" placeholder="예: 매년 12월 송년회, 세금계산서 필요, 음향 담당자 따로 옴">'+esc(c.memo||'')+'</textarea><div><button class="btn btn-light btn-sm" type="button" id="cu-save">저장</button></div></div>'
        +'<div class="hc-sec"><h3>예약 이력</h3><div class="hc-aglist">'+c.history.map(function(h){ return '<button type="button" class="hc-ag'+(['cancelled','declined'].indexOf(h.status)>=0?' soft':'')+'" data-b="'+esc(h.code)+'"><span class="t">'+(h.date?esc(h.date.slice(2).replace(/-/g,'.')):'<small>날짜 미정</small>')+'</span><span class="m"><span class="r1">'+S.st(h.status, h.status_label)+(h.people?'<span class="muted">'+h.people+'명</span>':'')+'</span><span class="r2">'+esc([h.space_name, h.channel_label, h.start?h.start+(h.end?'~'+h.end:''):''].filter(Boolean).join(' · '))+'</span></span><span class="a">'+(h.amount!=null?esc(won(h.amount)):'')+'</span></button>'; }).join('')+'</div></div>');
      body.onclick=function(e){
        var b=e.target.closest('[data-b]'); if(b) return openBooking(b.getAttribute('data-b'));
        if(e.target.id==='cu-book') return manualBooking({ name:c.name, phone:c.phone, org:c.org });
        if(e.target.id==='cu-save') api('/customers/'+encodeURIComponent(key), { method:'PUT', body:{ memo:$('#cu-memo').value, tags:$$('input[name=cu-tag]:checked', body).map(function(i){ return i.value; }) } }).then(function(){ M.toast('저장했습니다.'); CUST.list=null; if(ST.tab==='customers') loadCustomers(); }).catch(oops);
      };
    }).catch(oops);
  }

  /* ---------- 공간 정보 ---------- */
  var SP={ space:null, photos:[], dirty:false };
  function money(name, val, ph){ return '<div class="unit"><input class="input" name="'+name+'" type="number" inputmode="numeric" min="0" step="1000" value="'+(val==null?'':val)+'" placeholder="'+(ph||'')+'"><i>원</i></div>'; }
  function pkgRow(p){ p=p||{}; return '<div class="ap-row" data-pkg><input class="input" data-k="name" maxlength="30" placeholder="이름 (예: 종일)" value="'+esc(p.name||'')+'"><input class="input" data-k="weekday" type="number" min="0" step="1000" placeholder="평일 금액" value="'+(p.weekday==null?'':p.weekday)+'"><input class="input" data-k="weekend" type="number" min="0" step="1000" placeholder="주말 금액" value="'+(p.weekend==null?'':p.weekend)+'"><button type="button" class="x" data-rm aria-label="삭제">✕</button><input class="input" data-k="time" maxlength="40" placeholder="시간 (예: 10:00~22:00)" value="'+esc(p.time||'')+'" style="grid-column:1 / -1"></div>'; }
  function optRow(o){ o=o||{}; return '<div class="ap-row opt" data-opt><input class="input" data-k="name" maxlength="40" placeholder="옵션 이름 (예: 무선 마이크 추가)" value="'+esc(o.name||'')+'"><input class="input" data-k="price" type="number" min="0" step="1000" placeholder="금액" value="'+(o.price==null?'':o.price)+'"><select class="select" data-k="unit">'+S.opts(P.optionUnits.map(function(u){ return [u,'/ '+u]; }), o.unit||'건')+'</select><button type="button" class="x" data-rm aria-label="삭제">✕</button></div>'; }
  // ----- 공간 등록 안내 · 작성 Tip -----
  var TIPS={
    basic:'<ul><li><b>공간 이름</b>은 검색 결과에서 가장 먼저 보이는 이름입니다. 지역과 공간 성격이 드러나면 기억하기 쉽습니다. <span class="ex">예: 성수 그랜드홀, 판교 컨벤션 라운지</span></li>'
      +'<li><b>한 줄 소개</b>에는 다른 공간과 구별되는 점을 짧게 적습니다. <span class="ex">예: 성수역 3분 · 층고 5m · 한 층 단독 사용</span></li>'
      +'<li><b>주소</b>는 도로명 주소로, 층과 호수는 ‘상세 주소·층’ 칸에 따로 적습니다.</li>'
      +'<li><b>최대 이용 인원과 면적</b>은 실제로 받을 수 있는 인원과 전용 면적(평)입니다. 메가스팟은 50명 이상 또는 50평 이상 공간만 등록되고, 100명이나 100평을 넘으면 ‘초대형’으로 표시됩니다. 배치에 따라 인원이 달라지면 아래 ‘배치별 수용 인원’에 나눠 적어 주세요.</li>'
      +'<li><b>공간 유형</b>은 실제로 자주 여는 행사 위주로 최대 5가지를 고릅니다. 고객은 유형으로 공간을 걸러 봅니다.</li></ul>',
    price:'<ul><li>받는 방식을 여러 개 고를 수 있습니다. <b>시간 대관</b>은 시간당 요금 × 이용 시간, <b>패키지</b>는 반일·종일 같은 묶음 요금, <b>하루 대관</b>은 하루 통째로입니다.</li>'
      +'<li>여기 적은 금액으로 고객 화면에서 예상 금액이 바로 계산됩니다. 예약을 확정하기 전에 호스트가 금액을 확인하고 고칠 수 있으니, 평소 받는 기준 금액을 적어 두세요.</li>'
      +'<li>인원에 따라 금액이 달라지면 <b>기준 인원</b>과 <b>초과 1명당</b> 금액을 채웁니다. 비워 두면 인원과 상관없이 같은 금액으로 계산합니다.</li>'
      +'<li><b>부가세</b>는 견적을 낼 때와 같은 기준으로 정해 주세요. ‘별도’를 고르면 고객 화면에 10%를 더해 안내합니다.</li>'
      +'<li>금액을 정하기 어렵다면 ‘견적 문의’만 골라도 등록할 수 있습니다. 다만 예산을 정해야 하는 고객은 금액이 보이는 공간을 먼저 비교합니다.</li></ul>',
    options:'<ul><li>무선 마이크 추가, 청소, 테이블·의자 추가처럼 <b>공간에서 직접 제공하고 따로 받는 항목</b>만 적습니다.</li><li>단위(건·시간·개·명 등)를 고르면 고객이 고른 수량만큼 예상 금액에 더해집니다.</li><li>공간료에 이미 들어 있는 장비는 옵션이 아니라 ‘시설·장비’에 체크해 주세요.</li></ul>',
    photos:'<ul><li>최소 3장이 필요하고, <b>6장 이상</b>이면 공간을 훨씬 이해하기 쉽습니다.</li><li><b>첫 사진(대표 사진)</b>은 검색 결과 카드에 나옵니다. 공간 전체가 한눈에 들어오는 넓은 사진을 맨 앞에 두세요.</li>'
      +'<li>추천 순서: 전경 → 행사 때 테이블·의자를 놓은 모습 → 무대·화면 쪽 → 준비 공간·입구 → 건물 외관·주차장</li><li>가로 사진, 밝은 시간대, 정돈된 상태가 좋습니다. 참석자 얼굴이 크게 나온 사진은 동의를 받은 것만 올려 주세요.</li>'
      +'<li>휴대폰 사진도 괜찮습니다. 올릴 때 크기를 자동으로 줄입니다. ‘JPG·PNG·WebP만 올릴 수 있다’는 안내가 나오면 휴대폰 카메라 설정에서 사진 형식을 ‘호환성 우선(JPG)’으로 바꾸거나, 사진을 화면 캡처해서 올려 주세요.</li></ul>',
    intro:'<ul><li>공간 소개는 아래 순서로 쓰면 고객이 필요한 내용을 빨리 찾습니다. <button type="button" class="pf-link" data-tpl>예시 틀 넣기</button></li>'
      +'<li><b>시설·장비</b>는 공간료에 포함되어 바로 쓸 수 있는 것만 체크합니다.</li><li><b>배치별 수용 인원</b>을 모르겠다면 <a class="pf-link" href="/event-guide/capacity/" target="_blank" rel="noopener">필요 평수 계산기</a>로 가늠해 보세요.</li>'
      +'<li>음식·주류 반입과 이용 규정, 환불 규정은 고객이 예약 전에 가장 많이 묻는 내용입니다. 고객 화면에 그대로 보입니다.</li></ul>',
    contact:'<ul><li>메가스팟 예약 요청은 항상 받습니다. 전화·카카오톡을 더하면 급한 고객이 바로 연락할 수 있고, 어느 쪽으로 예약되든 수수료는 없습니다.</li><li>전화번호를 공개하지 않으면 예약이 진행되는 고객에게만 보입니다.</li><li>평소 응답 시간을 적어 두면 고객이 답을 기다리며 다른 곳을 찾는 일이 줄어듭니다.</li><li>준비 기간이 필요하면 며칠 전까지 예약을 받을지 정하세요.</li></ul>',
    pay:'<ul><li>결제는 고객이 호스트에게 직접 합니다. 메가스팟은 결제 금액에서 수수료를 떼지 않습니다.</li><li>계좌번호와 결제 링크는 호스트가 일정을 확인해 ‘예약 대기’로 바꾼 고객에게만 보입니다.</li><li>예약금 비율을 적으면 고객 화면에 예약금 금액이 함께 안내됩니다.</li></ul>',
    biz:'<ul><li>상호와 사업자등록번호는 공간 페이지에 표시됩니다. 고객이 계약 상대를 확인하는 정보입니다.</li><li>사업자가 없다면 ‘사업자 없음’을 고르세요.</li></ul>'
  };
  var INTRO_TPL='[공간 한눈에]\n층·면적·구조, 한 층 단독 사용 여부\n\n[이런 행사에 잘 맞습니다]\n세미나, 워크숍, 단체 파티, 송년회 등\n\n[기본으로 쓸 수 있는 것]\n빔프로젝터·스크린, 마이크·스피커, 테이블·의자 수량\n\n[오시는 길·주차]\n가까운 역과 출구, 걸어서 몇 분, 주차 대수와 요금\n\n[이용 안내]\n입·퇴실 시간, 준비·정리 시간 포함 여부, 음식·주류 반입';
  function tip(sec){ return '<details class="hc-tip"><summary>작성 Tip</summary><div>'+TIPS[sec]+help('이 항목이 헷갈리면 메가스팟에 물어보세요.')+'</div></details>'; }
  var SECS=[['basic','기본 정보'],['price','요금'],['options','옵션'],['photos','사진'],['intro','소개·시설'],['contact','문의·연락'],['pay','결제 방법'],['biz','사업자 정보']];
  // 지금 화면에 적힌 내용으로 필수·권장 항목을 확인합니다 (저장 전에도 바로 바뀝니다). 심사 요청 때는 서버가 다시 확인합니다.
  function spChecks(){
    var f=$('#sp-form'); if(!f) return [];
    var n=function(k){ return v(f,k); }, nm=function(k){ return +n(k)||0; }, has=function(sel){ return $$(sel, f).length>0; };
    var modes=$$('input[name=modes]:checked', f).map(function(i){ return i.value; }), on=function(m){ return modes.indexOf(m)>=0; };
    var pk=$$('#sp-pkgs [data-pkg]', f).some(function(r){ return r.querySelector('[data-k=name]').value.trim() && (r.querySelector('[data-k=weekday]').value || r.querySelector('[data-k=weekend]').value); });
    var priceOk=modes.length && (!on('hourly')||n('h_weekday')||n('h_weekend')) && (!on('package')||pk) && (!on('daily')||n('d_weekday')||n('d_weekend'));
    var cap=nm('capacity'), area=nm('area'), intro=f.elements.intro.value.trim(), ph=SP.photos.length, pay=$$('input[name=pay_methods]:checked', f).map(function(i){ return i.value; });
    return [
      ['basic','공간 이름',1,!!n('name')], ['basic','주소',1,!!n('address')], ['basic','최대 이용 인원',1,cap>0], ['basic','면적(평)',1,area>0],
      ['basic','50명 또는 50평 이상',1,cap>=50||area>=50], ['basic','공간 유형',1,S.readTypes(f).length>0],
      ['price','요금 방식과 금액',1,!!priceOk], ['photos','사진 3장 이상',1,ph>=3], ['intro','공간 소개 20자 이상',1,intro.length>=20],
      ['basic','한 줄 소개',0,!!n('summary')], ['basic','가까운 역·운영 시간',0,!!n('station')&&!!n('hours')], ['photos','사진 6장 이상',0,ph>=6], ['intro','소개 150자 이상',0,intro.length>=150],
      ['intro','시설·장비',0,has('input[name=facilities]:checked')], ['intro','음식·주류 규정',0,!!n('rule_food')&&!!n('rule_alcohol')], ['intro','주차 안내',0,n('park_count')!==''||!!n('park_note')],
      ['contact','전화 또는 카카오톡',0,!!n('c_phone')||!!n('c_kakao')], ['pay','결제 방법',0,pay.length>0&&(pay.indexOf('bank')<0||(!!n('bank')&&!!n('account')&&!!n('holder')))],
      ['biz','사업자 정보',0,n('biz_type')==='none'||(!!n('biz_type')&&!!n('biz_name')&&!!n('biz_no'))]
    ];
  }
  function guideDraw(){
    var el=$('#sp-guide'), s=SP.space; if(!el||!s) return;
    var c=spChecks(), req=c.filter(function(x){ return x[2]; }), rec=c.filter(function(x){ return !x[2]; }), rd=req.filter(function(x){ return x[3]; }).length, cd=rec.filter(function(x){ return x[3]; }).length;
    var pre=['draft','fix','rejected'].indexOf(s.status)>=0, pct=Math.round(rd/req.length*80+cd/rec.length*20), step=pre?(rd===req.length?1:0):s.status==='review'?2:3;
    var name={}; SECS.forEach(function(x){ name[x[0]]=x[1]; });
    var lead=s.status==='fix'?'운영팀의 보완 요청을 확인하고 고친 뒤 다시 심사를 요청해 주세요.':s.status==='rejected'?'반려 사유를 확인해 주세요. 고친 뒤 다시 심사를 요청할 수 있습니다.':s.status==='review'?'메가스팟 운영팀이 내용을 확인하고 있습니다. 기다리는 동안에도 내용과 사진은 고칠 수 있습니다.'
      :pre?'필수 항목을 채우고 맨 아래 <b>저장하고 심사 요청</b>을 누르면 운영팀이 확인합니다. 공간이 공개되는 날부터 2개월은 무료입니다.':'공개 중입니다. 고친 내용은 저장하는 즉시 공간 페이지에 반영됩니다. 권장 항목을 채울수록 고객이 공간을 이해하기 쉽습니다.';
    var miss=req.filter(function(x){ return !x[3]; }), extra=(SP.missing||[]).filter(function(m){ return !/주소|최대 이용 인원|면적|공간 유형|요금|소개|사진|50명/.test(m); });
    el.innerHTML='<div class="hc-guide-head"><div><h2>공간 등록 안내</h2><p>'+lead+'</p></div><div class="hc-meter" aria-label="작성 정도 '+pct+'%"><b>'+pct+'%</b><span>필수 '+rd+'/'+req.length+' · 권장 '+cd+'/'+rec.length+'</span><i><em style="width:'+pct+'%"></em></i></div></div>'
      +'<ol class="hc-steps">'+['공간 정보 채우기','저장하고 심사 요청','운영팀 확인','공개 · 2개월 무료'].map(function(t, i){ return '<li class="'+(i<step?'done':i===step?'now':'')+'"><i>'+(i<step?'✓':i+1)+'</i><span>'+t+'</span></li>'; }).join('')+'</ol>'
      +(miss.length||extra.length?'<div class="hc-need"><b>'+(pre?'심사 요청까지 채울 항목':'비어 있는 필수 항목')+'</b>'+miss.map(function(x){ return '<a href="#sp-'+x[0]+'" data-jump="sp-'+x[0]+'">'+esc(name[x[0]])+' · '+esc(x[1])+'</a>'; }).join('')+extra.map(function(m){ return '<span>'+esc(m)+'</span>'; }).join('')+'</div>'
        :'<div class="hc-need ok"><b>필수 항목을 모두 채웠습니다.</b>'+(pre?'<span>저장한 뒤 맨 아래 ‘저장하고 심사 요청’을 눌러 주세요.</span>':'')+'</div>')
      +(rec.some(function(x){ return !x[3]; })?'<div class="hc-need soft"><b>채우면 좋은 항목</b>'+rec.filter(function(x){ return !x[3]; }).map(function(x){ return '<a href="#sp-'+x[0]+'" data-jump="sp-'+x[0]+'">'+esc(x[1])+'</a>'; }).join('')+'</div>':'')
      +'<details class="hc-tip"><summary>처음이라면: 이 순서로 채우세요</summary><div><ol><li><b>기본 정보</b> — 이름, 주소, 최대 인원, 면적, 유형 (3분)</li><li><b>사진</b> — 휴대폰 사진 3장 이상 바로 올리기 (올리는 즉시 저장)</li><li><b>요금</b> — 평소 받는 금액 그대로. 정하기 어려우면 ‘견적 문의’</li><li><b>소개·시설</b> — ‘예시 틀 넣기’를 눌러 빈칸을 채우듯이</li><li><b>문의·결제·사업자</b> — 나중에 채워도 심사 요청은 됩니다</li><li><b>저장하고 심사 요청</b> — 운영팀이 확인한 뒤 공개되고, 그날부터 2개월 무료</li></ol><p class="small">중간에 나가도 <b>저장</b>만 해 두면 다음에 이어서 쓸 수 있습니다.</p></div></details>'
      +'<div class="hc-acts"><a class="btn btn-light btn-sm" href="/event-guide/space-listing-checklist/" target="_blank" rel="noopener">대형 공간 소개 작성 가이드 ↗</a><a class="btn btn-light btn-sm" href="/spaces/view/?id='+encodeURIComponent(s.ref)+'"'+(INST.standalone()?'':' target="_blank" rel="noopener"')+' data-preview>고객 화면 미리보기 ↗</a>'+kakao('등록 문의')+'</div>';
    // 바로가기 칸 표시: 필수가 빠지면 점, 다 채우면 ✓
    SECS.forEach(function(x){ var a=main.querySelector('.hc-toc [data-jump="sp-'+x[0]+'"]'); if(!a) return; var mine=c.filter(function(y){ return y[0]===x[0]; }), need=mine.some(function(y){ return y[2]&&!y[3]; }), ok=mine.length&&mine.every(function(y){ return y[3]; });
      a.classList.toggle('need', need); a.classList.toggle('ok', !need&&!!ok); });
  }

  VIEWS.space=function(){
    var s=cur(); if(!s) return main.innerHTML=empty('등록한 공간이 없습니다.');
    var ok=fresh(); api('/spaces/'+s.ref).then(function(r){ if(!ok()) return; SP.space=r.space; SP.photos=r.photos||[]; SP.dirty=false; drawSpace(r.missing||[]); }).catch(oops);
  };
  function drawSpace(missing){
    var s=SP.space, d=s.data||{}, pr=d.price||{}, modes=pr.modes||[], c=d.contact||{}, pay=d.payment||{}, bz=d.biz||{}, lay=d.layouts||{}, pk=d.parking||{}, ru=d.rules||{}, rf=d.refund||{}, bk=d.booking||{};
    var canSubmit=['draft','fix','rejected'].indexOf(s.status)>=0;
    main.innerHTML=head('공간 정보', esc(s.name)+' · '+esc(s.ref)+' · <span class="pf-st '+esc(s.status)+'">'+esc(s.status_label)+'</span>', s.visible?'<a class="btn btn-light btn-sm" href="/docs/?type=space&id='+encodeURIComponent(s.ref)+'" target="_blank" rel="noopener">공간소개서 PDF</a>':'')
      +(s.status==='fix'&&s.review_note?'<div class="hc-banner bad"><h2>보완 요청</h2><p>'+esc(s.review_note)+'</p></div>':'')
      +'<section class="hc-guide" id="sp-guide" aria-label="공간 등록 안내"></section>'
      +asBox(s)
      +'<nav class="hc-toc" aria-label="공간 정보 바로가기">'+SECS.map(function(x){ return '<a href="#sp-'+x[0]+'" data-jump="sp-'+x[0]+'"><i aria-hidden="true"></i>'+x[1]+'</a>'; }).join('')+'</nav>'
      +'<form class="hc-form" id="sp-form" novalidate>'
      // 기본
      +'<div class="hc-card" id="sp-basic"><fieldset><legend>기본 정보</legend>'+tip('basic')+''
      +'<div class="f"><label>공간 이름 <span class="pf-req">*</span></label><input class="input" name="name" maxlength="60" required value="'+esc(s.name)+'"></div>'
      +'<div class="f"><label>한 줄 소개</label><input class="input" name="summary" maxlength="80" placeholder="예: 성수역 3분, 층고 5m 단독 홀" value="'+esc(d.summary||'')+'"></div>'
      +'<div class="field-row two"><div class="f"><label>지역 <span class="pf-req">*</span></label><select class="select" name="region" required>'+S.opts(P.regions, s.region)+'</select><p class="pf-help">‘그 외 지역’은 공간이 늘어나는 대로 지역별로 나눌 예정입니다.</p></div><div class="f"><label>주소 <span class="pf-req">*</span></label><input class="input" name="address" maxlength="160" value="'+esc(s.address)+'"></div></div>'
      +'<div class="field-row three"><div class="f"><label>상세 주소·층</label><input class="input" name="address_detail" maxlength="80" placeholder="예: 3층 301호" value="'+esc(d.address_detail||'')+'"></div><div class="f"><label>가까운 역·정류장</label><input class="input" name="station" maxlength="80" placeholder="예: 성수역 3번 출구 3분" value="'+esc(d.station||'')+'"></div><div class="f"><label>운영 시간</label><input class="input" name="hours" maxlength="120" placeholder="예: 09:00~23:00" value="'+esc(d.hours||'')+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>최대 이용 인원 <span class="pf-req">*</span></label><div class="unit"><input class="input" name="capacity" type="number" min="1" value="'+(s.capacity||'')+'"><i>명</i></div></div><div class="f"><label>면적 <span class="pf-req">*</span></label><div class="unit"><input class="input" name="area" type="number" min="1" value="'+(s.area||'')+'"><i>평</i></div></div></div>'
      +'<div class="f"><span class="lbl">공간 유형 <span class="pf-req">*</span> <span class="pf-help" style="font-weight:400">— 최대 5가지</span></span>'+S.typePicker(s.types)+'</div></fieldset></div>'
      // 요금
      +'<div class="hc-card" id="sp-price"><fieldset><legend>요금</legend>'+tip('price')+'<p class="pf-help">받는 방식을 모두 고르세요. 고객은 이 요금표로 예상 금액을 바로 확인하고, 호스트가 확인한 뒤 금액이 확정됩니다. 금액을 정하기 어렵다면 ‘견적 문의’만 골라도 됩니다.</p>'
      +'<div class="ap-modes">'+[['hourly','시간 대관','시간당 요금 × 이용 시간'],['package','패키지','반일·종일처럼 묶음 요금'],['daily','하루 대관','하루 통째로'],['quote','견적 문의','조건을 듣고 금액 안내']].map(function(m){ return '<label class="ap-mode"><input type="checkbox" name="modes" value="'+m[0]+'"'+(modes.indexOf(m[0])>=0?' checked':'')+'><b>'+m[1]+'</b><small>'+m[2]+'</small></label>'; }).join('')+'</div>'
      +'<div class="ap-box" data-mode="hourly"><b>시간 대관 요금</b><div class="field-row three"><div class="f"><label>평일 시간당</label>'+money('h_weekday', (pr.hourly||{}).weekday)+'</div><div class="f"><label>주말·공휴일 시간당</label>'+money('h_weekend', (pr.hourly||{}).weekend)+'</div><div class="f"><label>최소 이용 시간</label><div class="unit"><input class="input" name="h_min" type="number" min="1" max="24" value="'+((pr.hourly||{}).min_hours||1)+'"><i>시간</i></div></div></div></div>'
      +'<div class="ap-box" data-mode="package"><b>패키지 요금</b><div class="ap-rows" id="sp-pkgs">'+((pr.packages||[]).length?pr.packages:[{}]).map(pkgRow).join('')+'</div><div><button class="btn btn-light btn-sm" type="button" data-add="pkg">+ 패키지 추가</button></div></div>'
      +'<div class="ap-box" data-mode="daily"><b>하루 대관 요금</b><div class="field-row two"><div class="f"><label>평일 하루</label>'+money('d_weekday', (pr.daily||{}).weekday)+'</div><div class="f"><label>주말·공휴일 하루</label>'+money('d_weekend', (pr.daily||{}).weekend)+'</div></div></div>'
      +'<div class="field-row three"><div class="f"><label>기준 인원 (선택)</label><div class="unit"><input class="input" name="base_people" type="number" min="1" value="'+(pr.base_people||'')+'"><i>명</i></div></div><div class="f"><label>기준 초과 1명당 (선택)</label>'+money('extra_per_person', pr.extra_per_person)+'</div><div class="f"><label>보증금 (선택)</label>'+money('deposit', pr.deposit)+'</div></div>'
      +'<div class="field-row two"><div class="f"><label>부가세</label><select class="select" name="vat">'+S.opts([['included','적은 금액에 부가세 포함'],['excluded','부가세 별도 (10% 더해 안내)']], pr.vat||'included')+'</select></div><div class="f"><label>요금 안내 (선택)</label><input class="input" name="price_note" maxlength="600" placeholder="예: 성수기(12월) 요금은 견적으로 안내" value="'+esc(pr.note||'')+'"></div></div></fieldset></div>'
      // 옵션
      +'<div class="hc-card" id="sp-options"><fieldset><legend>옵션 (호스트가 제공하는 부가서비스)</legend>'+tip('options')+'<p class="pf-help">장비 대여, 청소, 추가 테이블처럼 공간에서 직접 제공하는 항목입니다. 출장뷔페·케이터링·출장 칵테일·사회자/강연자 섭외·현장 매니저·디자인 제작물은 메가스팟 본사 서비스로 모든 공간에 자동으로 붙으니 따로 넣지 않아도 됩니다.</p>'
      +'<div class="ap-rows" id="sp-opts">'+((d.options||[]).length?d.options:[{}]).map(optRow).join('')+'</div><div><button class="btn btn-light btn-sm" type="button" data-add="opt">+ 옵션 추가</button></div></fieldset></div>'
      // 사진
      +'<div class="hc-card" id="sp-photos"><fieldset><legend>사진 <span class="pf-help" style="font-weight:400">— 3장 이상 · 최대 12장 · 첫 사진이 대표 사진</span></legend>'+tip('photos')+'<div class="ap-photos" id="sp-ph"></div><input type="file" id="sp-file" accept="image/jpeg,image/png,image/webp" multiple hidden><p class="pf-help">가로 사진을 권합니다. 올릴 때 자동으로 크기를 줄입니다. 사진은 올리는 즉시 저장됩니다.</p></fieldset></div>'
      // 소개·시설
      +'<div class="hc-card" id="sp-intro"><fieldset><legend>소개 · 시설 · 이용 규정</legend>'+tip('intro')+''
      +'<div class="f"><label>공간 소개 <span class="pf-req">*</span> <span class="pf-help" style="font-weight:400">— 20자 이상</span></label><textarea class="textarea" name="intro" rows="6" maxlength="3000" placeholder="어떤 행사에 잘 맞는지, 공간의 구조와 분위기, 찾아오는 길 등을 적어 주세요.">'+esc(d.intro||'')+'</textarea></div>'
      +'<div class="f"><span class="lbl">시설·장비</span><div class="checks">'+S.checks('facilities', P.facilities, d.facilities||[])+'</div></div>'
      +'<div class="f"><span class="lbl">배치별 수용 인원 (선택)</span><div class="field-row" style="grid-template-columns:repeat(2,minmax(0,1fr))">'+[['standing','스탠딩'],['theater','강연식'],['classroom','강의식(책상)'],['banquet','연회식(원탁)']].map(function(x){ return '<div class="unit"><input class="input" name="lay_'+x[0]+'" type="number" min="1" placeholder="'+x[1]+'" value="'+(lay[x[0]]||'')+'" aria-label="'+x[1]+' 수용 인원"><i>명</i></div>'; }).join('')+'</div></div>'
      +'<div class="field-row three"><div class="f"><label>층고 (선택)</label><div class="unit"><input class="input" name="ceiling" inputmode="decimal" maxlength="5" value="'+esc(d.ceiling||'')+'"><i>m</i></div></div><div class="f"><label>주차 가능 대수</label><div class="unit"><input class="input" name="park_count" type="number" min="0" value="'+(pk.count==null?'':pk.count)+'"><i>대</i></div></div><div class="f"><label>주차 안내</label><input class="input" name="park_note" maxlength="120" placeholder="예: 건물 주차장 2시간 무료" value="'+esc(pk.note||'')+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>외부 음식 반입</label><select class="select" name="rule_food">'+S.opts([['ok','가능'],['limited','일부 가능 (협의)'],['no','불가']], ru.food||'', '선택')+'</select></div><div class="f"><label>주류</label><select class="select" name="rule_alcohol">'+S.opts([['ok','가능'],['no','불가']], ru.alcohol||'', '선택')+'</select></div></div>'
      +'<div class="f"><label>이용 규정·주의사항 (선택)</label><textarea class="textarea" name="rule_note" rows="3" maxlength="1000" placeholder="예: 22시 이후 음향 제한, 실내 금연, 못·테이프 사용 금지">'+esc(ru.note||'')+'</textarea></div>'
      +'<div class="field-row two"><div class="f"><label>환불 규정</label><select class="select" name="refund_preset">'+S.opts(P.refundPresets, rf.preset||'standard')+'</select></div><div class="f"><label>환불 규정 보충 (직접 입력)</label><input class="input" name="refund_text" maxlength="1000" value="'+esc(rf.text||'')+'"></div></div></fieldset></div>'
      // 문의·연락
      +'<div class="hc-card" id="sp-contact"><fieldset><legend>문의 받는 방식 · 연락 채널</legend>'+tip('contact')+'<p class="pf-help">메가스팟 예약 요청은 항상 받습니다. 여기에 전화·카카오톡·SNS를 더하면 고객이 편한 방법으로 연락합니다. 어느 쪽으로 예약되든 수수료는 없고, 클릭 수는 통계에 잡힙니다.</p>'
      +'<div class="field-row two"><div class="f"><label>문의 전화번호</label><input class="input" name="c_phone" type="tel" value="'+esc(c.phone||'')+'"></div><div class="f"><span class="lbl">전화번호 공개</span><label class="chk"><input type="checkbox" name="c_phone_public"'+(c.phone_public?' checked':'')+'><span>공간 페이지에 전화번호 보여 주기</span></label><p class="pf-help">끄면 예약이 진행되는 고객에게만 보입니다.</p></div></div>'
      +'<div class="field-row two"><div class="f"><label>카카오톡 채널·오픈채팅</label><input class="input" name="c_kakao" type="url" placeholder="https://pf.kakao.com/…" value="'+esc(c.kakao||'')+'"></div><div class="f"><label>인스타그램</label><input class="input" name="c_instagram" type="url" placeholder="https://www.instagram.com/…" value="'+esc(c.instagram||'')+'"></div></div>'
      +'<div class="field-row three"><div class="f"><label>네이버 플레이스·블로그</label><input class="input" name="c_naver" type="url" placeholder="https://naver.me/…" value="'+esc(c.naver||'')+'"></div><div class="f"><label>유튜브</label><input class="input" name="c_youtube" type="url" placeholder="https://www.youtube.com/…" value="'+esc(c.youtube||'')+'"></div><div class="f"><label>홈페이지</label><input class="input" name="c_homepage" type="url" placeholder="https://" value="'+esc(c.homepage||'')+'"></div></div>'
      +'<div class="field-row three"><div class="f"><label>예약 마감 (며칠 전까지)</label><div class="unit"><input class="input" name="lead_days" type="number" min="0" max="365" value="'+(bk.lead_days||0)+'"><i>일 전</i></div></div><div class="f"><label>평소 응답 시간 (선택)</label><input class="input" name="reply" maxlength="40" placeholder="예: 평일 2시간 안" value="'+esc(bk.reply||'')+'"></div><div class="f"><span class="lbl">현장답사</span><label class="chk"><input type="checkbox" name="visit"'+(bk.visit!==false?' checked':'')+'><span>답사 요청 받기</span></label></div></div></fieldset></div>'
      // 결제
      +'<div class="hc-card" id="sp-pay"><fieldset><legend>결제 방법</legend>'+tip('pay')+'<p class="pf-help">결제는 고객이 호스트에게 직접 합니다. 일정을 확인한(예약 대기·확정) 고객에게만 아래 안내가 보입니다.</p>'
      +'<div class="checks">'+S.checks('pay_methods', P.payMethods, pay.methods||[])+'</div>'
      +'<div class="field-row three"><div class="f"><label>은행</label><input class="input" name="bank" maxlength="30" value="'+esc(pay.bank||'')+'"></div><div class="f"><label>계좌번호</label><input class="input" name="account" maxlength="40" inputmode="numeric" value="'+esc(pay.account||'')+'"></div><div class="f"><label>예금주</label><input class="input" name="holder" maxlength="40" value="'+esc(pay.holder||'')+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>카드·간편결제 링크 (선택)</label><input class="input" name="card_link" type="url" placeholder="https:// 호스트가 쓰는 결제 링크" value="'+esc(pay.card_link||'')+'"></div><div class="f"><label>예약금 비율</label><div class="unit"><input class="input" name="deposit_pct" type="number" min="0" max="100" placeholder="예: 30 (전액 선결제는 100)" value="'+(pay.deposit_pct==null?'':pay.deposit_pct)+'"><i>%</i></div></div></div>'
      +'<div class="field-row two"><div class="f"><span class="lbl">증빙</span><label class="chk"><input type="checkbox" name="tax_invoice"'+(pay.tax_invoice?' checked':'')+'><span>세금계산서 발행 가능</span></label></div><div class="f"><label>결제 안내 (선택)</label><input class="input" name="pay_note" maxlength="300" placeholder="예: 잔금은 이용 7일 전까지" value="'+esc(pay.note||'')+'"></div></div></fieldset></div>'
      // 사업자
      +'<div class="hc-card" id="sp-biz"><fieldset><legend>사업자 정보</legend>'+tip('biz')+'<p class="pf-help">고객이 계약 상대방을 알 수 있도록 공간 페이지에 상호와 사업자등록번호를 표시합니다.</p>'
      +'<div class="field-row two"><div class="f"><label>구분</label><select class="select" name="biz_type">'+S.opts([['corp','법인사업자'],['personal','개인사업자'],['none','사업자 없음']], bz.type||'', '선택')+'</select></div><div class="f"><label>상호</label><input class="input" name="biz_name" maxlength="60" value="'+esc(bz.name||'')+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>사업자등록번호</label><input class="input" name="biz_no" maxlength="20" inputmode="numeric" placeholder="000-00-00000" value="'+esc(bz.no||'')+'"></div><div class="f"><label>대표자</label><input class="input" name="biz_ceo" maxlength="40" value="'+esc(bz.ceo||'')+'"></div></div></fieldset></div>'
      +'<div class="hc-savebar"><span class="small" id="sp-state">저장된 상태입니다.</span><span class="hc-acts">'+kakao('문의', 'icon-only')+''+(s.status==='live'?'<button class="btn btn-ghost btn-sm" type="button" id="sp-pause">예약 받기 잠시 멈춤</button>':'')+'<button class="btn btn-light" type="submit" id="sp-save">저장</button>'+(canSubmit?'<button class="btn btn-primary" type="button" id="sp-submit">저장하고 심사 요청</button>':'')+'</span></div></form>';
    var f=$('#sp-form'); S.bindTypes(f); telFmt(f.elements.c_phone); drawPhotos(); modeSync(); drawMissing(missing);
    var gt; function guideSoon(){ clearTimeout(gt); gt=setTimeout(guideDraw, 250); }
    $('#sp-guide').addEventListener('click', function(e){ var j=e.target.closest('[data-jump]'); if(j){ e.preventDefault(); jump(j.getAttribute('data-jump')); return; }
      if(e.target.closest('[data-preview]') && SP.dirty) M.toast('저장하지 않은 변경은 미리보기에 보이지 않습니다. 먼저 저장해 주세요.'); });
    function modeSync(){ $$('[data-mode]', f).forEach(function(b){ var on=f.querySelector('input[name=modes][value="'+b.getAttribute('data-mode')+'"]').checked; b.hidden=!on; }); }
    function mark(){ SP.dirty=true; $('#sp-state').innerHTML='<b style="color:var(--rust)">저장하지 않은 변경이 있습니다.</b>'; }
    f.addEventListener('input', function(){ mark(); guideSoon(); }); f.addEventListener('change', function(){ modeSync(); mark(); guideSoon(); });
    f.addEventListener('click', function(e){
      var add=e.target.closest('[data-add]'); if(add){ if(add.getAttribute('data-add')==='pkg'){ if($$('#sp-pkgs [data-pkg]').length<6) $('#sp-pkgs').insertAdjacentHTML('beforeend', pkgRow()); } else if($$('#sp-opts [data-opt]').length<12) $('#sp-opts').insertAdjacentHTML('beforeend', optRow()); return; }
      var rm=e.target.closest('[data-rm]'); if(rm){ rm.closest('.ap-row').remove(); mark(); guideSoon(); return; }
      if(e.target.closest('[data-tpl]')){ var ta=f.elements.intro, cur0=ta.value.trim();
        if(cur0 && !confirm('지금 적은 소개 아래에 예시 틀을 붙일까요?')) return;
        ta.value=(cur0?cur0+'\n\n':'')+INTRO_TPL; ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop=0; mark(); guideSoon(); jump('sp-intro'); return; }
    });
    function jump(id){ var el=document.getElementById(id); if(!el) return; var d=el.querySelector('details.hc-tip'); window.scrollTo({ top:el.getBoundingClientRect().top+window.scrollY-(wide()?120:70), behavior:'smooth' }); }
    $$('.hc-toc [data-jump]', main).forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); jump(a.getAttribute('data-jump')); }); });
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
      save().then(function(r){ if((r.missing||[]).length){ M.toast(r.missing[0]); $('#sp-guide').scrollIntoView({block:'start', behavior:'smooth'}); return; }
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
  function drawMissing(missing){ SP.missing=missing||[]; guideDraw(); }
  function drawPhotos(){
    var el=$('#sp-ph'); if(!el) return;
    el.innerHTML=SP.photos.map(function(p, i){ return '<div class="ap-ph"><img src="'+esc(p.thumb)+'" alt="공간 사진 '+(i+1)+'" loading="lazy">'+(i===0?'<span class="cover">대표</span>':'')+'<span class="acts">'+(i>0?'<button type="button" data-ph="first" data-id="'+esc(p.id)+'" title="대표 사진으로" aria-label="대표 사진으로">★</button><button type="button" data-ph="left" data-id="'+esc(p.id)+'" title="앞으로" aria-label="앞으로 옮기기">←</button>':'')+'<button type="button" data-ph="del" data-id="'+esc(p.id)+'" title="삭제" aria-label="사진 삭제">✕</button></span></div>'; }).join('')
      +(SP.photos.length<12?'<button type="button" class="ap-add" id="sp-add">+ 사진 올리기<br><span class="pf-help">'+SP.photos.length+' / 12장</span></button>':'');
  }
  window.addEventListener('beforeunload', function(e){ if(SP.dirty && ST.tab==='space'){ e.preventDefault(); e.returnValue=''; } });
  function addSpace(){
    var body=drawer('공간 추가', '<form class="hc-form" id="as-form" novalidate>'+(AS.acting?'':asCta('new', true))+'<p class="pf-help">기본 정보를 넣으면 ‘작성 중’ 공간이 만들어집니다. 요금·사진·소개를 채워 심사를 요청하세요. 공간마다 따로 심사하고 이용료도 공간별로 계산합니다.</p>'
      +'<div class="f"><label for="as-name">공간 이름 <span class="pf-req">*</span></label><input class="input" id="as-name" name="name" required maxlength="60"></div>'
      +'<div class="field-row two"><div class="f"><label for="as-region">지역 <span class="pf-req">*</span></label><select class="select" id="as-region" name="region" required>'+S.opts(P.regions, '', '지역 선택')+'</select></div><div class="f"><label for="as-address">주소 <span class="pf-req">*</span></label><input class="input" id="as-address" name="address" required maxlength="160"></div></div>'
      +'<div class="field-row two"><div class="f"><label for="as-cap">최대 이용 인원</label><div class="unit"><input class="input" id="as-cap" name="capacity" type="number" min="1"><i>명</i></div></div><div class="f"><label for="as-area">면적</label><div class="unit"><input class="input" id="as-area" name="area" type="number" min="1"><i>평</i></div></div></div>'
      +'<div class="f"><span class="lbl">공간 유형 <span class="pf-req">*</span></span>'+S.typePicker([])+'</div><p class="pf-msg" id="as-msg" hidden></p><div><button class="btn btn-primary" type="submit">공간 만들기</button></div>'
      +help('50명 또는 50평 이상이면 등록할 수 있습니다. 공간이 여러 곳이거나 기준에 맞는지 헷갈리면 먼저 물어보세요.')+'</form>');
    var f=$('#as-form'); S.bindTypes(f);
    f.addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(f)) return;
      api('/spaces', { method:'POST', body:{ name:v(f,'name'), region:v(f,'region'), address:v(f,'address'), capacity:v(f,'capacity'), area:v(f,'area'), types:S.readTypes(f) } }).then(function(r){ return reload().then(function(){ closeDrawer(); location.hash='#space='+r.ref; }); })
        .catch(function(x){ var m=$('#as-msg'); m.textContent=x.message; m.hidden=false; }); });
    if(location.hash==='#add') history.replaceState(null,'','#'+(ST.tab||'home')); if(main.innerHTML.indexOf('불러오는 중')>=0||!main.innerHTML) show(ST.tab||'home');
  }

  /* ---------- 공간 등록 대행 요청 (2026-11-14) ----------
     공간소개서 파일·홈페이지 주소·공간 이름만 보내면 본사가 확인하고 공간 정보를 대신 채웁니다. 서버: functions/api/_hostassist.js
     파일은 900KB씩 나눠 올립니다(서버가 조각을 그대로 저장). */
  var AS={ items:[], rule:{ chunk:900000, maxFile:20971520, maxTotal:62914560, maxFiles:10, exts:['pdf','ppt','pptx','doc','docx','hwp','hwpx','xls','xlsx','zip','jpg','jpeg','png','webp','heic','heif','gif'] }, times:{ any:'아무 때나' }, acting:null };
  var AS_STEPS=[['new','접수'],['checking','자료 확인'],['working','등록 작업'],['confirm','내용 확인'],['done','완료']];
  var AS_PILL={ 'new':'review', checking:'review', working:'review', confirm:'fix', done:'live', cancelled:'rejected' };
  function asLoad(){ return api('/assist').then(function(a){ AS.items=a.items||[]; if(a.rule) AS.rule=a.rule; if(a.contact_times) AS.times=a.contact_times; AS.acting=a.acting||null; actingUi(); }).catch(function(){}); }
  function asFor(ref){ return AS.items.filter(function(a){ return a.open && a.space_ref===ref; })[0]||null; }
  function asLast(ref){ return AS.items.filter(function(a){ return a.space_ref===ref; })[0]||null; }
  function size(n){ return n>=1048576?(Math.round(n/104857.6)/10)+'MB':Math.max(1, Math.round(n/1024))+'KB'; }
  function extOf(n){ var m=/\.([a-z0-9]{2,5})$/i.exec(n||''); return m?m[1].toLowerCase():''; }
  function asLead(a){
    return ({ 'new':'요청을 받았습니다. 본사가 자료를 확인한 뒤 남겨 주신 번호로 연락드립니다.',
      checking:'본사가 보내 주신 자료를 보고 있습니다. 더 필요한 내용이 있으면 연락드립니다.',
      working:'본사가 공간 정보를 채우고 있습니다. 이 동안 직접 고친 내용은 본사 작업과 겹칠 수 있으니, 바꿀 내용은 ‘자료 더 보내기’로 알려 주세요.',
      confirm:'본사가 공간 정보를 채워 두었습니다. 아래 내용을 확인하고 고칠 부분은 고친 뒤 맨 아래 ‘저장하고 심사 요청’을 눌러 주세요.',
      done:'등록 대행이 끝났습니다.', cancelled:'취소한 요청입니다.' })[a.status]||'';
  }
  function asCta(ref, compact){
    return '<div class="hc-assist-cta'+(compact?' compact':'')+'"><div><b>등록 과정이 번거로우신가요? 메가스팟이 대신 등록해 드립니다.</b>'
      +'<p>공간소개서 파일이나 홈페이지·SNS 주소, 공간 이름만 보내 주세요. 본사가 자료를 확인하고 요금·사진·소개 같은 공간 정보를 대신 채워 둡니다.</p></div>'
      +'<div class="hc-acts"><button class="btn btn-primary btn-sm" type="button" data-assist="'+esc(ref||'new')+'">공간 등록 대행 요청</button></div></div>';
  }
  function asFiles(a, del){
    var f=a.files||[], l=a.links||[];
    if(!f.length && !l.length && !a.message) return '<p class="small muted">보낸 자료가 없습니다. 공간 이름만으로도 본사가 찾아보고 연락드립니다.</p>';
    return (f.length?'<ul class="hc-files">'+f.map(function(x){ return '<li><span class="hc-file-ext">'+esc((x.ext||'').toUpperCase())+'</span><span class="nm">'+esc(x.name)+'</span><small>'+esc(size(x.size))+'</small>'+(del?'<button type="button" class="pf-link" data-assist-del="'+esc(a.ref+'|'+x.fid)+'">지우기</button>':'')+'</li>'; }).join('')+'</ul>':'')
      +(l.length?'<ul class="hc-links">'+l.map(function(u){ return '<li><a class="pf-link" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(u.replace(/^https?:\/\//,'').slice(0, 70))+'</a></li>'; }).join('')+'</ul>':'')
      +(a.message?'<p class="hc-assist-note">'+esc(a.message).replace(/\n/g,'<br>')+'</p>':'');
  }
  function asCard(a){
    var idx=AS_STEPS.map(function(x){ return x[0]; }).indexOf(a.status), mine=!AS.acting;
    return '<div class="hc-assist" id="sp-assist-card"><div class="hc-assist-head"><h2>공간 등록 대행 <span class="pf-st '+(AS_PILL[a.status]||'')+'">'+esc(a.status_label)+'</span></h2><span class="small muted">'+esc(a.ref)+' · '+esc(S.kdate(String(a.created_at).slice(0,10)))+' 요청</span></div>'
      +(a.status==='cancelled'?'':'<ol class="hc-steps c5">'+AS_STEPS.map(function(x, i){ var cls=a.status==='done'||i<idx?'done':i===idx?'now':''; return '<li class="'+cls+'"><i>'+(cls==='done'?'✓':i+1)+'</i><span>'+x[1]+'</span></li>'; }).join('')+'</ol>')
      +'<p>'+esc(asLead(a))+'</p>'
      +(a.hq_message?'<div class="hc-assist-msg"><b>메가스팟 본사</b><p>'+esc(a.hq_message).replace(/\n/g,'<br>')+'</p></div>':'')
      +'<details class="hc-tip"><summary>보낸 자료 · 파일 '+(a.files||[]).length+'개 · 주소 '+(a.links||[]).length+'개</summary><div>'+asFiles(a, mine&&a.open)+'<p class="small muted">연락 받을 번호 '+esc(a.phone)+' · '+esc(a.contact_label)+'</p></div></details>'
      +(mine&&a.open?'<div class="hc-acts"><button class="btn btn-light btn-sm" type="button" data-assist-more="'+esc(a.ref)+'">자료 더 보내기</button>'+(['new','checking'].indexOf(a.status)>=0?'<button class="btn btn-ghost btn-sm" type="button" data-assist-cancel="'+esc(a.ref)+'">요청 취소</button>':'')+kakao('카카오톡 문의')+'</div>':'')
      +'</div>';
  }
  // 공간 정보 화면 위쪽: 진행 중인 요청이 있으면 진행 상황, 없으면(공개 전) 대행 요청 안내
  function asBox(s){
    var a=asFor(s.ref)||asLast(s.ref), pre=['draft','fix','rejected'].indexOf(s.status)>=0;
    if(a && (a.open || (a.status==='done' && a.done_at && S.ddays(String(a.done_at).slice(0,10))>=-14))) return '<section id="sp-assist">'+asCard(a)+'</section>';
    return pre && !AS.acting?'<section id="sp-assist">'+asCta(s.ref)+'</section>':'<section id="sp-assist" hidden></section>';
  }
  function asPicker(){
    return '<div class="f"><span class="lbl">공간소개서·자료 파일</span><label class="hc-file"><input type="file" data-assist-files multiple accept=".'+AS.rule.exts.join(',.')+'"><span>파일 고르기</span></label>'
      +'<ul class="hc-files" data-assist-list></ul><p class="pf-help">PDF·파워포인트·워드·한글·엑셀·사진·ZIP 파일, 파일당 20MB까지 '+AS.rule.maxFiles+'개를 보낼 수 있습니다. 사진이 많으면 구글 드라이브·네이버 MYBOX 같은 공유 폴더 주소를 위 칸에 적어 주세요.</p></div>';
  }
  function asBindPicker(box){
    var list=[], input=box.querySelector('[data-assist-files]'), ul=box.querySelector('[data-assist-list]');
    function draw(){ ul.innerHTML=list.map(function(f, i){ return '<li><span class="hc-file-ext">'+esc(extOf(f.name).toUpperCase())+'</span><span class="nm">'+esc(f.name)+'</span><small>'+esc(size(f.size))+'</small><button type="button" class="pf-link" data-rm="'+i+'">빼기</button></li>'; }).join(''); }
    input.addEventListener('change', function(){
      var bad=[]; Array.prototype.forEach.call(input.files||[], function(f){
        if(AS.rule.exts.indexOf(extOf(f.name))<0) bad.push(f.name+' (보낼 수 없는 파일 형식)');
        else if(f.size>AS.rule.maxFile) bad.push(f.name+' (20MB 넘음 · 공유 링크로 보내 주세요)');
        else if(!f.size) bad.push(f.name+' (빈 파일)');
        else if(list.length>=AS.rule.maxFiles) bad.push(f.name+' (파일은 '+AS.rule.maxFiles+'개까지)');
        else if(!list.some(function(x){ return x.name===f.name && x.size===f.size; })) list.push(f);
      });
      input.value=''; draw(); if(bad.length) M.toast('빠진 파일: '+bad.join(', '));
    });
    ul.addEventListener('click', function(e){ var b=e.target.closest('[data-rm]'); if(b){ list.splice(+b.getAttribute('data-rm'), 1); draw(); } });
    return { files:function(){ return list.slice(); } };
  }
  function b64(blob){ return new Promise(function(ok, no){ var r=new FileReader(); r.onload=function(){ var t=String(r.result||''); ok(t.slice(t.indexOf(',')+1)); }; r.onerror=function(){ no(new Error('파일을 읽지 못했습니다.')); }; r.readAsDataURL(blob); }); }
  function sendFile(ref, file, tick){
    return api('/assist/'+ref+'/files', { method:'POST', body:{ name:file.name, size:file.size } }).then(function(s){
      var i=0;
      function next(){
        if(i>=s.chunks) return api('/assist/'+ref+'/files/'+s.fid+'/done', { method:'POST', body:{} });
        return b64(file.slice(i*s.chunk, (i+1)*s.chunk)).then(function(d){ return api('/assist/'+ref+'/files/'+s.fid+'/'+i, { method:'POST', body:{ data:d } }); }).then(function(){ i++; tick(i/s.chunks); return next(); });
      }
      return next();
    });
  }
  // 여러 파일을 차례로 올립니다. 실패한 파일은 이름과 이유를 모아 돌려줍니다.
  function sendFiles(ref, files, msg){
    var failed=[], total=files.reduce(function(n, f){ return n+f.size; }, 0)||1, done=0;
    return files.reduce(function(p, f){ return p.then(function(){
      var tick=function(r){ msg.textContent='파일 올리는 중… '+Math.min(100, Math.round((done+f.size*r)/total*100))+'% ('+f.name+')'; };
      tick(0); return sendFile(ref, f, tick).then(function(){ done+=f.size; }, function(e){ done+=f.size; failed.push(f.name+' — '+((e&&e.message)||'올리지 못했습니다')); });
    }); }, Promise.resolve()).then(function(){ return failed; });
  }
  function asForm(ref){
    var s=ref&&ref!=='new'?space(ref):null, times=Object.keys(AS.times).map(function(k){ return [k, AS.times[k]]; });
    var body=drawer('공간 등록 대행 요청', '<form class="hc-form" id="asq-form" novalidate>'
      +'<div class="hc-assist-intro"><b>자료만 보내 주시면 공간 정보는 메가스팟이 채워 둡니다.</b><ol><li>공간 이름과 가진 자료(공간소개서, 홈페이지·SNS·다른 예약 사이트 주소)를 보냅니다. 공간 이름만 적어도 됩니다.</li><li>본사가 자료를 확인하고, 더 필요한 내용은 전화나 카카오톡으로 여쭙니다.</li><li>요금·사진·소개·시설 같은 공간 정보를 본사가 채워 두면, 호스트센터에서 확인하고 심사를 요청합니다.</li></ol></div>'
      +(s?'<div class="f"><span class="lbl">맡길 공간</span><p><b>'+esc(s.name)+'</b> <span class="small muted">'+esc(s.ref)+' · '+esc(s.status_label)+'</span></p></div>':'<p class="pf-help">새로 등록할 공간입니다. 본사가 공간을 만들어 이 호스트센터에 넣어 둡니다.</p>')
      +'<div class="f"><label for="asq-name">공간 이름 <span class="pf-req">*</span></label><input class="input" id="asq-name" name="name" maxlength="60" required value="'+esc(s?s.name:'')+'"></div>'
      +'<div class="f"><label for="asq-addr">주소 또는 위치</label><input class="input" id="asq-addr" name="address" maxlength="160" placeholder="예: 서울 성동구 성수이로 100, 3층" value="'+esc(s?s.address||'':'')+'"></div>'
      +'<div class="f"><label for="asq-links">참고할 주소</label><textarea class="textarea" id="asq-links" name="links" rows="3" placeholder="한 줄에 하나씩 적어 주세요.&#10;공간 홈페이지, 인스타그램, 블로그, 다른 예약 사이트의 공간 페이지, 사진을 모아 둔 공유 폴더"></textarea></div>'
      +asPicker()
      +'<div class="f"><label for="asq-msg">전할 말</label><textarea class="textarea" id="asq-msg" name="message" rows="4" maxlength="2000" placeholder="요금, 운영 시간, 꼭 넣고 싶은 내용, 빼고 싶은 내용 등을 편하게 적어 주세요."></textarea></div>'
      +'<div class="field-row two"><div class="f"><label for="asq-phone">연락 받을 번호 <span class="pf-req">*</span></label><input class="input" id="asq-phone" name="phone" type="tel" inputmode="numeric" maxlength="13" required value="'+esc(ST.host&&ST.host.phone||'')+'"></div>'
      +'<div class="f"><label for="asq-time">연락 받기 편한 시간</label><select class="select" id="asq-time" name="contact_time">'+S.opts(times, 'any')+'</select></div></div>'
      +'<label class="chk"><input type="checkbox" name="agree" required><span><b>(필수)</b> 보낸 자료와 주소의 글·사진을 메가스팟이 이 공간 정보를 작성하는 데 쓰는 것에 동의합니다. 다른 사람이 찍은 사진이나 쓴 글이 들어 있다면 써도 되는지 확인했습니다.</span></label>'
      +'<p class="pf-msg" id="asq-msg-box" hidden></p><div class="hc-acts"><button class="btn btn-primary" type="submit" id="asq-send">등록 대행 요청 보내기</button></div>'
      +help('무엇을 보내야 할지 모르겠다면 카카오톡으로 먼저 물어보세요.', s?s.ref:'')+'</form>');
    var f=$('#asq-form'), pick=asBindPicker(f), box=$('#asq-msg-box'), btn=$('#asq-send'); telFmt(f.elements.phone);
    f.addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(f)) return;
      if(!f.elements.agree.checked){ box.textContent='자료 사용 동의에 체크해 주세요.'; box.hidden=false; return; }
      btn.disabled=true; box.hidden=false; box.textContent='요청을 보내는 중…';
      var files=pick.files(), ref2='';
      api('/assist', { method:'POST', body:{ space:s?s.ref:'', name:v(f,'name'), address:v(f,'address'), links:f.elements.links.value, message:f.elements.message.value, phone:v(f,'phone'), contact_time:v(f,'contact_time'), agree:true } })
        .then(function(r){ ref2=r.ref; if(r.rule) AS.rule=r.rule; return files.length?sendFiles(ref2, files, box):[]; })
        .then(function(failed){ return reload().then(function(){ return failed; }); })
        .then(function(failed){ asDone(ref2, v(f,'phone'), failed); if(ST.tab==='space'||ST.tab==='home') show(ST.tab); })
        .catch(function(x){ btn.disabled=false; box.textContent=(x&&x.message)||'요청을 보내지 못했습니다.'; if(ref2) reload().then(function(){ show(ST.tab); }); });
    });
    return body;
  }
  function asDone(ref, phone, failed){
    drawer('공간 등록 대행 요청', '<div class="hc-assist-done"><b>요청을 보냈습니다</b><p>요청 번호 <b>'+esc(ref)+'</b>. 본사가 자료를 확인한 뒤 '+esc(phone)+'(으)로 연락드립니다. 진행 상황과 본사 메시지는 <b>공간 정보</b> 화면 위쪽에서 볼 수 있습니다.</p>'
      +(failed.length?'<div class="pf-msg">올리지 못한 파일이 있습니다. ‘자료 더 보내기’로 다시 보내 주세요.<ul>'+failed.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></div>':'')
      +'<div class="hc-acts">'+(failed.length?'<button class="btn btn-primary btn-sm" type="button" data-assist-more="'+esc(ref)+'">자료 더 보내기</button>':'')+'<button class="btn btn-light btn-sm" type="button" data-close>닫기</button>'+kakao('카카오톡 문의')+'</div></div>');
  }
  function asMore(ref){
    var a=AS.items.filter(function(x){ return x.ref===ref; })[0]; if(!a) return M.toast('요청을 찾지 못했습니다. 새로고침해 주세요.');
    drawer('자료 더 보내기', '<form class="hc-form" id="asm-form" novalidate><p class="pf-help">'+esc(a.name)+' · '+esc(a.ref)+' · 지금까지 보낸 자료에 더해집니다.</p>'
      +'<details class="hc-tip"><summary>지금까지 보낸 자료</summary><div>'+asFiles(a, true)+'</div></details>'
      +'<div class="f"><label for="asm-links">참고할 주소 더하기</label><textarea class="textarea" id="asm-links" name="links" rows="2" placeholder="한 줄에 하나씩"></textarea></div>'
      +asPicker()
      +'<div class="f"><label for="asm-msg">전할 말 더하기</label><textarea class="textarea" id="asm-msg" name="message" rows="3" maxlength="1000" placeholder="바뀐 요금, 고칠 내용, 연락 가능한 시간 등"></textarea></div>'
      +'<p class="pf-msg" id="asm-box" hidden></p><div class="hc-acts"><button class="btn btn-primary" type="submit" id="asm-send">보내기</button></div></form>');
    var f=$('#asm-form'), pick=asBindPicker(f), box=$('#asm-box'), btn=$('#asm-send');
    f.addEventListener('submit', function(e){ e.preventDefault();
      var links=f.elements.links.value.trim(), msg=f.elements.message.value.trim(), files=pick.files();
      if(!links && !msg && !files.length){ box.textContent='보낼 주소, 파일, 전할 말 중 하나는 넣어 주세요.'; box.hidden=false; return; }
      btn.disabled=true; box.hidden=false; box.textContent='보내는 중…';
      (links||msg?api('/assist/'+ref, { method:'PATCH', body:{ links:links, message:msg } }):Promise.resolve())
        .then(function(){ return files.length?sendFiles(ref, files, box):[]; })
        .then(function(failed){ return reload().then(function(){ return failed; }); })
        .then(function(failed){ if(failed.length){ btn.disabled=false; box.innerHTML='올리지 못한 파일: '+failed.map(esc).join(', '); return; } closeDrawer(); M.toast('자료를 보냈습니다.'); show(ST.tab); })
        .catch(function(x){ btn.disabled=false; box.textContent=(x&&x.message)||'보내지 못했습니다.'; });
    });
  }
  document.addEventListener('click', function(e){
    var t=e.target.closest('[data-assist],[data-assist-more],[data-assist-cancel],[data-assist-del]'); if(!t) return;
    if(t.hasAttribute('data-assist')){ e.preventDefault(); var r=t.getAttribute('data-assist'), open=r!=='new'&&asFor(r); if(open) return asMore(open.ref); return asForm(r); }
    if(t.hasAttribute('data-assist-more')) return asMore(t.getAttribute('data-assist-more'));
    if(t.hasAttribute('data-assist-cancel')){ if(!confirm('등록 대행 요청을 취소할까요? 보낸 자료는 본사에서 더 쓰지 않습니다.')) return;
      return api('/assist/'+t.getAttribute('data-assist-cancel')+'/cancel', { method:'POST' }).then(function(){ M.toast('요청을 취소했습니다.'); return reload(); }).then(function(){ show(ST.tab); }).catch(oops); }
    var d=t.getAttribute('data-assist-del').split('|'); if(!confirm('이 파일을 지울까요?')) return;
    api('/assist/'+d[0]+'/files/'+d[1], { method:'DELETE' }).then(function(){ M.toast('파일을 지웠습니다.'); return reload(); }).then(function(){ var a=AS.items.filter(function(x){ return x.ref===d[0]; })[0]; if(!$('#hc-drawer').hidden && $('#asm-form') && a) asMore(a.ref); else show(ST.tab); }).catch(oops);
  });
  // 본사가 대신 연 호스트센터: 위쪽 안내 띠와 끝내기 버튼, 공간 정보 외 메뉴 숨김(서버도 막음)
  function actingUi(){
    var on=!!AS.acting, bar=$('#hc-actbar'); document.documentElement.classList.toggle('hc-acting', on);
    if(!on){ if(bar) bar.remove(); return; }
    var until=String(AS.acting.until||''), d=new Date(until.replace(' ','T')+'Z'), hm=isNaN(d)?'':new Date(d.getTime()+9*3600e3).toISOString().slice(11,16);
    if(!bar){ bar=document.createElement('div'); bar.id='hc-actbar'; bar.className='hc-actbar'; bar.setAttribute('role','status'); var app=$('#hc-app'); app.insertBefore(bar, app.firstChild); }
    bar.innerHTML='<div><b>메가스팟 본사가 대신 작성하는 화면입니다</b><span>'+esc(ST.host?ST.host.name+' 님 계정':'호스트 계정')+' · 등록 대행 '+esc(AS.acting.ref)+(hm?' · '+hm+'까지':'')+' · 공간 정보와 사진만 고칠 수 있습니다</span></div><button class="btn btn-light btn-sm" type="button" id="hc-actend">대신 작성 끝내기</button>';
    $('#hc-actend').onclick=function(){ api('/logout', { method:'POST' }).catch(function(){}).then(function(){ location.href='/admin/#hp-assist'; }); };
  }

  /* ---------- 통계 ---------- */
  var SD=30;
  VIEWS.stats=function(){
    var ok=fresh(); api('/stats?'+q('days='+SD)).then(function(r){ if(!ok()) return;
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
    var ok=fresh(); api('/settlement?'+q('month='+SM)).then(function(r){ if(!ok()) return;
      var t=r.total, months=r.months.indexOf(SM)<0?[SM].concat(r.months):r.months;
      main.innerHTML=head('정산', '이용일이 그 달인 확정·완료 예약을 모았습니다. 결제는 고객에게 직접 받으므로, 메가스팟이 떼거나 나중에 보내 드리는 돈은 없습니다.', '<span class="hc-acts"><select class="select" id="sm-month" style="width:auto;min-height:38px">'+S.opts(months.map(function(m){ return [m, m.slice(0,4)+'년 '+(+m.slice(5))+'월']; }), SM)+'</select><button class="btn btn-light btn-sm" type="button" id="sm-csv">엑셀(CSV)</button></span>')
        +'<div class="hc-kpis"><div class="hc-kpi"><small>확정 매출</small><b>'+esc(won(t.amount))+'</b><span>'+t.count+'건</span></div><div class="hc-kpi ok"><small>받은 금액</small><b>'+esc(won(t.paid))+'</b><span>호스트가 기록한 결제</span></div><div class="hc-kpi'+(t.due?' hot':'')+'"><small>받을 금액</small><b>'+esc(won(t.due))+'</b><span>잔금·미수금</span></div>'
        +'<div class="hc-kpi ok"><small>메가스팟 수수료</small><b>0원</b><span>'+(t.fee_if_10pct?'수수료 10% 방식이었다면 '+esc(won(t.fee_if_10pct)):'결제·관리 수수료 없음')+'</span></div></div>'
        +(t.ext_fee||(r.by_channel||[]).length>1?'<div class="hc-card" style="margin-top:14px"><h2>접수 경로별 <small>'+(t.ext_fee?'다른 플랫폼에 낸 수수료 '+esc(won(t.ext_fee))+' · 실제로 남는 금액 '+esc(won(t.net)):'이 달 확정·완료 예약 기준')+'</small></h2><div class="hc-scroll"><table class="hc-table"><thead><tr><th>접수 경로</th><th class="r">건수</th><th class="r">금액</th><th class="r">플랫폼 수수료</th></tr></thead><tbody>'
          +(r.by_channel||[]).map(function(c){ return '<tr><td>'+esc(c.label)+'</td><td class="r">'+c.count+'</td><td class="r">'+esc(won(c.amount))+'</td><td class="r">'+(c.label==='메가스팟'?'0원':c.fee?esc(won(c.fee)):'–')+'</td></tr>'; }).join('')+'</tbody></table></div><p class="pf-help">다른 플랫폼 예약의 수수료는 예약을 등록할 때 적은 금액입니다. 비워 둔 예약은 0원으로 셉니다.</p></div>':'')
        +'<div class="hc-card" style="margin-top:14px"><h2>예약별 내역'+(Object.keys(r.by_method).length?' <small>'+Object.keys(r.by_method).map(function(k){ return esc(PAYM[k]||k)+' '+esc(won(r.by_method[k])); }).join(' · ')+'</small>':'')+'</h2>'
        +(r.rows.length?'<div class="hc-scroll"><table class="hc-table"><thead><tr><th>이용일</th><th>고객</th><th>공간</th><th>상태</th><th class="r">금액</th><th class="r">받은 금액</th><th class="r">받을 금액</th></tr></thead><tbody>'+r.rows.map(function(x){
            return '<tr><td>'+esc(S.kdate(x.date))+'</td><td><button type="button" class="pf-link" data-b="'+esc(x.code)+'">'+esc(x.name)+'</button>'+(x.source==='host'?' <span class="hc-flag soft">'+esc(x.channel_label||'직접 등록')+'</span>':'')+'</td><td>'+esc(x.space_name)+'</td><td>'+S.st(x.status, BST[x.status])+'</td><td class="r">'+esc(won(x.amount))+'</td><td class="r">'+esc(won(x.paid))+'</td><td class="r">'+(x.due?esc(won(x.due)):'–')+'</td></tr>'; }).join('')
            +'</tbody><tfoot><tr><td colspan="4">합계</td><td class="r">'+esc(won(t.amount))+'</td><td class="r">'+esc(won(t.paid))+'</td><td class="r">'+esc(won(t.due))+'</td></tr></tfoot></table></div>':empty('이 달에 확정된 예약이 없습니다.'))+'</div>';
      $('#sm-month').addEventListener('change', function(){ SM=this.value; show('settlement'); });
      $('#sm-csv').addEventListener('click', function(){ if(!r.rows.length) return M.toast('내려받을 내용이 없습니다.');
        S.csv('메가스팟_정산_'+SM+'.csv', [['예약번호','이용일','고객','공간','인원','상태','접수 경로','플랫폼 예약번호','플랫폼 수수료','금액','받은 금액','받을 금액','결제 내역']].concat(r.rows.map(function(x){ return [x.code, x.date, x.name, x.space_name, x.people||'', BST[x.status], x.channel_label||(x.source==='host'?'직접 등록':'메가스팟'), x.ext_ref||'', x.ext_fee||'', x.amount, x.paid, x.due, x.payments.map(function(p){ return p.date+' '+(PAYK[p.kind]||p.kind)+' '+(PAYM[p.method]||p.method)+' '+p.amount; }).join(' / ')]; }))); });
    }).catch(oops);
  };

  /* ---------- 이용료 (공간 한 곳 기준 · 부가세 별도 · 온라인 결제 또는 계좌이체 · 중도 해지) ---------- */
  function dAdd(iso, n){ var d=new Date(iso+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
  function mAdd(iso, n){ var p=iso.split('-').map(Number), dt=new Date(Date.UTC(p[0], p[1]-1+n, 1)), last=new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth()+1, 0)).getUTCDate(); dt.setUTCDate(Math.min(p[2], last)); return dt.toISOString().slice(0,10); }
  function period(s, months){ var from=s.listed_until && s.listed_until>=ST.today?dAdd(s.listed_until,1):ST.today; return { from:from, to:dAdd(mAdd(from, months), -1) }; }
  // 결제창은 페이앱 주소일 때만 엽니다
  function goPay(url){ try{ var u=new URL(url); if(u.protocol==='https:' && (u.hostname==='payapp.kr' || /\.payapp\.kr$/.test(u.hostname))){ location.href=u.href; return true; } }catch(e){} M.toast('결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.'); return false; }
  function feeLine(b){ return esc(won(b.supply))+' + 부가세 '+esc(won(b.vat))+' = <b>'+esc(won(b.amount))+'</b>'; }
  var PAYWAIT={ ref:'', tries:0, note:'' };
  function waitPay(){   // 결제창에서 돌아온 뒤: 결제 확인 통보가 반영될 때까지 잠깐 기다립니다
    if(!PAYWAIT.ref) return;
    api('/billing').then(function(r){
      var b=r.items.filter(function(x){ return x.ref===PAYWAIT.ref; })[0];
      if(b && b.status==='paid'){ PAYWAIT.ref=''; PAYWAIT.note=''; M.toast('결제가 확인되었습니다. 등록 기간이 적용되었습니다.'); reload().then(function(){ if(ST.tab==='billing') VIEWS.billing(); }); return; }
      if(!b || b.status!=='requested' || ++PAYWAIT.tries>=8){ PAYWAIT.ref=''; PAYWAIT.note=b && b.status==='requested'?(b.pg_pending?'입금을 기다리고 있습니다. 입금이 확인되면 등록 기간이 자동으로 적용됩니다.':'아직 결제 확인이 오지 않았습니다. 결제를 마쳤다면 잠시 뒤 이 화면을 다시 열어 주세요. 결제하지 않았다면 아래에서 다시 결제할 수 있습니다.'):''; if(ST.tab==='billing') VIEWS.billing(); return; }
      setTimeout(waitPay, 2500);
    }).catch(function(){ PAYWAIT.ref=''; });
  }
  VIEWS.billing=function(){
    var ok=fresh(); api('/billing').then(function(r){ if(!ok()) return;
      var list=ST.cur?r.spaces.filter(function(s){ return s.ref===ST.cur; }):r.spaces, PL={}; r.plans.forEach(function(p){ PL[p.id]=p; });
      // 결제창에서 돌아왔을 때 이미 결제가 반영돼 있으면 바로 알립니다
      if(PAYWAIT.ref && r.items.some(function(x){ return x.ref===PAYWAIT.ref && x.status==='paid'; })){ PAYWAIT.ref=''; PAYWAIT.note=''; M.toast('결제가 확인되었습니다. 등록 기간이 적용되었습니다.'); reload().catch(function(){}); }
      var html=head('이용료', '결제 수수료 없이 등록 기간에 따른 월 정액만 냅니다. 금액은 공간 한 곳 기준이고 부가세는 별도입니다. 공간이 공개된 날부터 '+r.free_months+'개월은 무료입니다.')
        +(PAYWAIT.ref?'<p class="pf-msg ok" role="status">결제 결과를 확인하고 있습니다. 잠시만 기다려 주세요.</p>':PAYWAIT.note?'<p class="pf-msg warn" role="status">'+esc(PAYWAIT.note)+'</p>':'');
      html+=list.map(function(s){
        var mine=r.items.filter(function(b){ return b.space===s.ref; }), pend=mine.filter(function(b){ return b.status==='requested'; })[0], act=mine.filter(function(b){ return b.active; }), can=s.status==='live'||s.status==='paused';
        var h='<div class="hc-card"><h2><span>'+S.tierBadge(s.tier)+' '+esc(s.name)+' <span class="pf-st '+esc(s.status)+'">'+esc(s.status_label)+'</span></span><small>'+(s.listed_until?(s.visible?'공개 중 · ':'')+esc(S.kdate(s.listed_until))+'까지'+(s.days_left!=null&&s.days_left>=0?' (D-'+s.days_left+')':' · 기간 종료'):'등록 완료 후 시작')+'</small></h2>'
          +'<dl class="hc-kv"><dt>무료 등록</dt><dd>'+(s.free_until?esc(S.kdate(s.free_until))+'까지':'공개되는 날부터 '+r.free_months+'개월')+'</dd><dt>유료 등록</dt><dd>'+(s.paid_until?esc(S.kdate(s.paid_until))+'까지'+(s.plan&&PL[s.plan]?' · '+PL[s.plan].months+'개월 등록':''):'아직 없음')+'</dd></dl>';
        // 결제를 마친 등록 기간 — 중도 해지
        h+=act.map(function(b){
          var c=b.cancel&&b.cancel.status==='requested'?b.cancel:null;
          return '<div class="hc-bill'+(c?' warn':'')+'"><div><b>'+b.months+'개월 등록</b> · '+esc(b.period_from)+' ~ '+esc(b.period_to)+' · '+esc(won(b.amount))+' <span class="small muted">('+esc(b.method_label)+')</span></div>'
            +(c?'<p>'+esc(S.kdate(c.base))+'에 중도 해지를 신청했습니다. 환불 예정 금액은 <b>'+esc(won(c.calc.refund))+'</b>이고, 운영팀이 영업일 기준 7일 안에 처리합니다. 처리가 끝나면 유료 등록이 '+esc(S.kdate(c.base))+'까지로 줄어듭니다.</p><div class="row"><button class="btn btn-light btn-sm" type="button" data-uncancel="'+esc(b.ref)+'">해지 신청 철회</button></div>'
              :'<div class="row"><button class="btn btn-ghost btn-sm" type="button" data-cancel="'+esc(b.ref)+'">중도 해지 신청</button></div>')+'</div>'; }).join('');
        if(pend){
          h+='<div class="hc-bill pay"><div><b>'+pend.months+'개월 등록</b> · '+feeLine(pend)+'</div>'
            +(pend.method==='online'
              ?'<p>'+(pend.pg_pending?'입금을 기다리고 있습니다. 입금이 확인되면 등록 기간이 자동으로 적용됩니다.':'결제를 마치면 '+esc(S.kdate(pend.period_from))+'부터 '+pend.months+'개월이 바로 적용됩니다.')+'</p><div class="row"><button class="btn btn-primary btn-sm" type="button" data-pay="'+esc(pend.ref)+'">'+(pend.pg_pending?'결제창 다시 열기':'결제하기')+'</button><button class="btn btn-light btn-sm" type="button" data-withdraw="'+esc(pend.ref)+'">신청 취소</button></div>'
              :'<p>계좌이체로 신청했습니다. 운영팀이 입금 계좌를 안내해 드리고, 입금이 확인되면 '+esc(S.kdate(pend.period_from))+'부터 '+pend.months+'개월이 적용됩니다.'+(pend.tax_invoice?' 세금계산서도 함께 발행해 드립니다.':'')+'</p><div class="row">'+(r.online?'<button class="btn btn-primary btn-sm" type="button" data-pay="'+esc(pend.ref)+'">카드·간편결제로 바로 결제</button>':'')+'<button class="btn btn-light btn-sm" type="button" data-withdraw="'+esc(pend.ref)+'">신청 취소</button></div>')
            +'</div>';
        } else if(act.some(function(b){ return b.cancel&&b.cancel.status==='requested'; })){
          h+='<p class="small muted mt-1">해지 신청을 처리하는 동안에는 새 등록 기간을 고를 수 없습니다. 계속 이용하려면 해지 신청을 철회해 주세요.</p>';
        } else if(can){
          var freeNow=s.free_until && s.free_until>=ST.today && s.free_until>=(s.paid_until||'');
          h+=(freeNow?'<p class="hc-note">지금은 무료 등록 기간입니다. 무료 기간 안에 결제해 두면 '+esc(S.kdate(s.free_until))+' 다음 날부터 끊기지 않고 이어집니다. 무료 기간이 끝나기 30일 전과 7일 전에 알림톡으로도 알려 드립니다.</p>':'')
            +(act.length?'<p class="hc-sub">등록 기간 더 이어 가기</p>':'')+'<div class="hc-plan mt-2">'+r.plans.map(function(p, i){ return '<label class="ap-mode"><input type="radio" name="plan-'+esc(s.ref)+'" value="'+p.id+'"'+(i===0?' checked':'')+'><b>'+p.months+'개월 등록</b><small><span class="nowrap">하루 '+p.daily.toLocaleString('ko-KR')+'원</span> · <span class="nowrap">월 '+esc(S.man(p.monthly))+'</span><br>'+esc(won(p.supply))+' <span class="nowrap">(부가세 별도)</span></small></label>'; }).join('')+'</div>'
            +'<p class="hc-sum mt-1" data-sum="'+esc(s.ref)+'" aria-live="polite"></p>'
            +'<div class="row mt-1" role="radiogroup" aria-label="결제 방법">'+(r.online?'<label class="chk"><input type="radio" name="how-'+esc(s.ref)+'" value="online" checked><span>카드·간편결제 <span class="small muted">· 바로 적용</span></span></label>':'')
            +'<label class="chk"><input type="radio" name="how-'+esc(s.ref)+'" value="bank"'+(r.online?'':' checked')+'><span>계좌이체 <span class="small muted">· 입금 확인 뒤 적용</span></span></label><label class="chk"><input type="checkbox" data-tax="'+esc(s.ref)+'"><span>세금계산서 발행 요청</span></label></div>'
            +'<div class="row mt-1"><button class="btn btn-primary btn-sm" type="button" data-bill="'+esc(s.ref)+'">'+(r.online?'결제하기':'계좌이체로 신청')+'</button></div>'
            +'<p class="pf-help mt-1">'+(r.online?'':'온라인 결제는 준비하고 있습니다. 지금은 계좌이체로 신청할 수 있습니다. ')+'등록 기간은 지금 기간이 끝난 다음 날부터 이어지고, 자동으로 연장되거나 다시 결제되지 않습니다.</p>';
        } else h+='<p class="small muted mt-1">등록(공개)이 끝난 뒤에 등록 기간을 고를 수 있습니다.</p>';
        return h+'</div>'; }).join('');
      html+=help('이용료 결제, 세금계산서, 중도 해지가 궁금하면 물어보세요.')+'<div class="hc-card"><h2>결제 내역</h2>'+(r.items.length?'<div class="hc-scroll"><table class="hc-table"><thead><tr><th>신청일</th><th>공간</th><th>등록 기간</th><th>적용 기간</th><th class="r">결제 금액</th><th>결제 방법</th><th>상태</th></tr></thead><tbody>'+r.items.map(function(b){ var s=space(b.space);
          return '<tr><td>'+esc(String(b.created_at).slice(0,10))+'</td><td>'+esc(s?s.name:b.space)+'</td><td>'+b.months+'개월</td><td>'+esc(b.period_from)+' ~ '+esc(b.period_to)+'</td><td class="r">'+esc(won(b.amount))+'<small class="muted" style="display:block">부가세 '+esc(won(b.vat))+' 포함</small></td><td>'+esc(b.method_label)+'</td><td>'+S.st(b.status, b.status_label)+(b.refund_amount!=null?'<small class="muted" style="display:block">환불 '+esc(won(b.refund_amount))+'</small>':'')+'</td></tr>'; }).join('')+'</tbody></table></div>':'<p class="small muted">아직 내역이 없습니다.</p>')+'</div>'
        +'<div class="hc-card"><h2>중도 해지와 환불</h2><ul class="hc-rule"><li>유료 등록 기간이 시작되기 전에 해지하면 결제한 금액을 모두 돌려드립니다.</li><li>유료 등록 기간이 시작된 뒤에 해지하면 남은 기간에 해당하는 금액(일할 계산)의 '+r.fee.refundRate+'%를 환불합니다.</li><li>해지를 신청한 날까지는 이용한 것으로 계산하고, 환불은 영업일 기준 7일 안에 결제한 수단으로 처리합니다.</li></ul><p class="pf-help">자세한 기준은 <a href="/terms/#host-fee" target="_blank" rel="noopener">이용약관 제7조의6</a>에 있습니다.</p></div>';
      main.innerHTML=html;
      // 고른 기간의 결제 금액과 적용 기간
      list.forEach(function(s){ var out=main.querySelector('[data-sum="'+s.ref+'"]'); if(!out) return;
        function sum(){ var p=PL[(main.querySelector('input[name="plan-'+s.ref+'"]:checked')||{}).value]; if(!p) return; var per=period(s, p.months);
          out.innerHTML='결제 금액 <b>'+esc(won(p.total))+'</b> <span class="small muted">공급가액 '+esc(won(p.supply))+' + 부가세 '+esc(won(p.vat))+'</span> · 적용 기간 '+esc(per.from)+' ~ '+esc(per.to); }
        main.querySelectorAll('input[name="plan-'+s.ref+'"]').forEach(function(el){ el.addEventListener('change', sum); }); sum();
        main.querySelectorAll('input[name="how-'+s.ref+'"]').forEach(function(el){ el.addEventListener('change', function(){ var b=main.querySelector('[data-bill="'+s.ref+'"]'); if(b) b.textContent=el.value==='online'?'결제하기':'계좌이체로 신청'; }); }); });
      main.querySelectorAll('[data-bill]').forEach(function(btn){ btn.addEventListener('click', function(){
        var ref=btn.getAttribute('data-bill'), p=PL[(main.querySelector('input[name="plan-'+ref+'"]:checked')||{}).value], how=(main.querySelector('input[name="how-'+ref+'"]:checked')||{}).value||'bank'; if(!p) return;
        if(how==='bank' && !confirm(p.months+'개월 등록('+won(p.total)+', 부가세 포함)을 계좌이체로 신청할까요?')) return;
        btn.disabled=true;
        api('/billing', { method:'POST', body:{ space:ref, plan:p.id, method:how, tax_invoice:main.querySelector('[data-tax="'+ref+'"]').checked, tax_email:ST.host.email } }).then(function(x){
          if(how==='online'){ if(x.payurl && goPay(x.payurl)) return; M.toast(x.pay_error||'결제창을 열지 못했습니다. 아래 ‘결제하기’를 다시 눌러 주세요.'); }
          else M.toast('계좌이체로 신청했습니다. 운영팀이 입금 계좌를 안내해 드립니다.');
          show('billing'); }).catch(function(e){ btn.disabled=false; oops(e); }); }); });
      main.querySelectorAll('[data-pay]').forEach(function(btn){ btn.addEventListener('click', function(){ btn.disabled=true;
        api('/billing/'+encodeURIComponent(btn.getAttribute('data-pay'))+'/pay', { method:'POST' }).then(function(x){ if(!goPay(x.payurl)) btn.disabled=false; }).catch(function(e){ btn.disabled=false; oops(e); }); }); });
      main.querySelectorAll('[data-withdraw]').forEach(function(btn){ btn.addEventListener('click', function(){ if(!confirm('이 신청을 취소할까요? 등록 기간을 다시 고를 수 있습니다.')) return;
        api('/billing/'+encodeURIComponent(btn.getAttribute('data-withdraw'))+'/withdraw', { method:'POST' }).then(function(){ M.toast('신청을 취소했습니다.'); show('billing'); }).catch(oops); }); });
      main.querySelectorAll('[data-uncancel]').forEach(function(btn){ btn.addEventListener('click', function(){ if(!confirm('중도 해지 신청을 철회할까요? 등록 기간이 그대로 유지됩니다.')) return;
        api('/billing/'+encodeURIComponent(btn.getAttribute('data-uncancel'))+'/cancel-withdraw', { method:'POST' }).then(function(){ M.toast('해지 신청을 철회했습니다.'); show('billing'); }).catch(oops); }); });
      main.querySelectorAll('[data-cancel]').forEach(function(btn){ btn.addEventListener('click', function(){ var b=r.items.filter(function(x){ return x.ref===btn.getAttribute('data-cancel'); })[0]; if(b) cancelBilling(b, r.fee); }); });
    }).catch(oops);
  };
  // 중도 해지 신청 — 환불 금액을 먼저 보여 주고 동의를 받습니다
  function cancelBilling(b, fee){
    var c=b.refund_preview, s=space(b.space); if(!c) return;
    var rows=c.started
      ?'<tr><td>결제 금액<small>부가세 포함</small></td><td>'+esc(won(c.total))+'</td></tr><tr><td>등록 기간<small>'+esc(b.period_from)+' ~ '+esc(b.period_to)+'</small></td><td>'+c.days+'일</td></tr><tr><td>이용한 날<small>오늘 '+esc(S.kdate(c.base))+'까지</small></td><td>'+c.used+'일</td></tr><tr><td>남은 날</td><td>'+c.left+'일</td></tr><tr><td>잔여금액<small>결제 금액 × 남은 날 ÷ 등록 기간</small></td><td>'+esc(won(c.remain))+'</td></tr><tr class="sum"><td>환불 금액<small>잔여금액의 '+c.rate+'% · 10원 미만 버림</small></td><td>'+esc(won(c.refund))+'</td></tr>'
      :'<tr><td>결제 금액<small>부가세 포함</small></td><td>'+esc(won(c.total))+'</td></tr><tr><td>등록 기간<small>'+esc(b.period_from)+' ~ '+esc(b.period_to)+' · 아직 시작 전</small></td><td>'+c.days+'일</td></tr><tr class="sum"><td>환불 금액<small>유료 기간 시작 전이라 전액</small></td><td>'+esc(won(c.refund))+'</td></tr>';
    var body=drawer('등록 중도 해지 · '+esc(s?s.name:b.space), '<form class="hc-form" id="bc-form" novalidate><div class="hc-sec"><h3>환불 금액</h3><table class="hc-lines"><tbody>'+rows+'</tbody></table></div>'
      +'<div class="hc-sec"><h3>확인해 주세요</h3><ul class="hc-rule"><li>해지를 신청하면 운영팀이 영업일 기준 7일 안에 환불을 처리합니다. 온라인 결제는 결제한 수단으로 취소되고, 계좌이체는 계좌를 확인한 뒤 보내 드립니다.</li><li>환불 처리가 끝나면 유료 등록이 오늘까지로 줄어듭니다. 무료 등록 기간이 남아 있지 않으면 공간이 검색에서 내려갑니다.</li><li>그 전에 확정한 예약은 그대로 진행해 주세요.</li></ul>'
      +'<div class="f"><label for="bc-reason">해지 사유 (선택)</label><textarea class="textarea" id="bc-reason" rows="2" maxlength="300" placeholder="예: 공간 운영 종료, 리모델링"></textarea></div>'
      +'<label class="chk"><input type="checkbox" id="bc-agree"><span>환불 기준을 확인했고, 위 금액으로 해지하는 데 동의합니다.</span></label><p class="pf-msg" id="bc-msg" hidden></p>'
      +'<div class="row"><button class="btn btn-primary" type="submit">중도 해지 신청</button><button class="btn btn-light" type="button" data-close>닫기</button></div></div></form>');
    body.querySelector('#bc-form').addEventListener('submit', function(e){ e.preventDefault(); var m=$('#bc-msg'); m.hidden=true;
      if(!$('#bc-agree').checked){ m.textContent='환불 기준을 확인하고 동의해 주세요.'; m.hidden=false; return; }
      api('/billing/'+encodeURIComponent(b.ref)+'/cancel', { method:'POST', body:{ agree:true, reason:$('#bc-reason').value } }).then(function(){ closeDrawer(); M.toast('중도 해지를 신청했습니다. 운영팀이 환불을 처리해 드립니다.'); show('billing'); }).catch(function(x){ m.textContent=(x&&x.message)||'신청하지 못했습니다.'; m.hidden=false; }); });
  }

  /* ---------- 계정 ---------- */
  VIEWS.account=function(){
    var h=ST.host, st=h.settings||{};
    main.innerHTML=head('계정', '담당자 정보와 알림을 받을 연락처, 비밀번호를 관리합니다.')
      +'<div class="hc-grid c2"><form class="hc-card hc-form" id="ac-form" novalidate><h2>담당자 정보</h2><div class="f"><label>로그인 이메일</label><input class="input" value="'+esc(h.email)+'" disabled></div>'
      +'<div class="field-row two"><div class="f"><label>담당자 이름 <span class="pf-req">*</span></label><input class="input" name="name" required maxlength="40" value="'+esc(h.name)+'"></div><div class="f"><label>휴대폰 <span class="pf-req">*</span></label><input class="input" name="phone" type="tel" required value="'+esc(h.phone)+'"></div></div>'
      +'<div class="field-row two"><div class="f"><label>상호</label><input class="input" name="company" maxlength="60" value="'+esc(h.company)+'"></div><div class="f"><label>사업자등록번호</label><input class="input" name="biz_no" maxlength="20" value="'+esc(h.biz_no)+'"></div></div>'
      +'<h2 style="margin-top:6px">알림 받을 연락처</h2><div class="field-row two"><div class="f"><label>알림 받을 휴대폰</label><input class="input" name="notify_phone" type="tel" value="'+esc(st.notify_phone||h.phone)+'"></div><div class="f"><label>알림 받을 이메일</label><input class="input" name="notify_email" type="email" value="'+esc(st.notify_email||h.email)+'"></div></div>'
      +'<label class="chk"><input type="checkbox" name="notify_on"'+(st.notify_on===false?'':' checked')+'><span>새 문의·견적 수락·입금 알림·취소·심사 결과·이용료·무료 기간 종료 안내 받기</span></label>'
      +'<p class="pf-help">알림은 위 휴대폰 번호로 카카오 알림톡이나 문자로 갑니다. 알림에는 고객 이름과 연락처를 넣지 않으니, 내용은 호스트센터에서 확인해 주세요. 끄더라도 호스트센터 홈과 문의·예약 메뉴에는 그대로 표시됩니다.</p><div><button class="btn btn-primary" type="submit">저장</button></div></form>'
      +(h.member?'<div class="hc-card hc-form"><h2>로그인 계정</h2><p>메가스팟 회원 계정 <b>'+esc(h.member_email||h.email)+'</b>으로 로그인합니다. 고객 화면(마이페이지)과 호스트센터를 같은 계정으로 오갈 수 있습니다.</p><p class="pf-help">비밀번호와 회원 정보는 마이페이지에서 바꿉니다.</p><div><a class="btn btn-light" href="/mypage/">마이페이지로 가기</a></div></div></div>'
      :'<form class="hc-card hc-form" id="pw-form" novalidate><h2>비밀번호 바꾸기</h2><div class="f"><label>지금 비밀번호</label><input class="input" name="current" type="password" required autocomplete="current-password"></div><div class="f"><label>새 비밀번호 (8자 이상)</label><input class="input" name="next" type="password" required minlength="8" autocomplete="new-password"></div><p class="pf-msg" id="pw-msg" hidden></p><div><button class="btn btn-light" type="submit">비밀번호 바꾸기</button></div></form></div>');
    main.insertAdjacentHTML('beforeend', '<div class="hc-grid c2" style="margin-top:14px"><div class="hc-card"><h2>홈 화면에 추가</h2><p class="small">'+(INST.standalone()?'지금 홈 화면 앱으로 쓰고 있습니다.':'휴대폰 홈 화면에 호스트센터 아이콘을 만들어 두면 앱처럼 바로 열립니다. 따로 내려받는 앱은 없습니다.')+'</p>'+(INST.standalone()?'':'<div class="mt-1"><button class="btn btn-primary btn-sm" type="button" data-install>방법 보기</button></div>')+'</div>'
      +'<div class="hc-card"><h2>메가스팟에 문의</h2><p class="small">호스트센터 사용법, 입점 심사, 이용료가 궁금하면 카카오톡 채널로 물어보세요.</p><div class="mt-1">'+kakao('카카오톡 문의')+'</div></div></div>');
    var f=$('#ac-form'); telFmt(f.elements.phone); telFmt(f.elements.notify_phone);
    f.addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(f)) return; api('/me', { method:'PUT', body:{ name:v(f,'name'), phone:v(f,'phone'), company:v(f,'company'), biz_no:v(f,'biz_no'), settings:{ notify_phone:v(f,'notify_phone'), notify_email:v(f,'notify_email'), notify_on:f.elements.notify_on.checked } } }).then(function(){ M.toast('저장했습니다.'); return reload(); }).then(function(){ $('#hc-who').textContent=ST.host.name+' 님'; }).catch(oops); });
    var pf=$('#pw-form'); if(pf) pf.addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(pf)) return; var m=$('#pw-msg'); m.hidden=true;
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
    var cv=$('#hc-customer'); if(cv){ cv.href=ST.host.member?'/mypage/':'/'; cv.hidden=false; }
    if(!ST.spaces.length){ main.innerHTML=empty('등록한 공간이 없습니다. 위 공간 선택에서 ‘+ 공간 추가’를 눌러 주세요.'); return addSpace(); }
    // 결제창에서 돌아왔다면 이용료 화면에서 결제 확인을 기다립니다
    var back=/^BL-\d{4}-[A-Z0-9]{4}$/.exec(new URLSearchParams(location.search).get('pay')||'');
    if(back){ PAYWAIT.ref=back[0]; PAYWAIT.tries=0; history.replaceState(null,'',location.pathname+'#billing'); setTimeout(waitPay, 1200); }
    route();
  }).catch(function(e){ if(e && e.code==='HOST_LOGIN') return; $('#hc-loading').textContent=e&&e.code==='NO_API'?'서버에 연결하지 못했습니다. 잠시 후 다시 열어 주세요.':e&&e.code==='BLOCKED'?e.message:'호스트센터를 열지 못했습니다. 다시 로그인해 주세요.'; });
})();
