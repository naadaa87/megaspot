/* 나의 예약확인 (/my-booking/) — 2026-11-24
   예약 한 건에 딸린 화면(예약확정서·계약서·결제·보증금·입실·주차·초대장·식음료·후기·다시 예약)을 한 곳에서.
   들어오는 문: ① 예약번호 + 휴대폰 뒷 4자리  ② #c=예약번호&k=열쇠 (확정서·예약 안내 화면에서 넘어옴)  ③ 회원 로그인(#mine=예약번호)
   열쇠는 이 탭(sessionStorage ms_my_booking, 24시간)과, 원하실 때만 이 기기(localStorage ms_my_bookings, 최근 5건)에 기억합니다. 휴대폰 뒷자리는 어디에도 저장하지 않습니다. */
(function(){
  var M=window.MEGASPOT; if(!M) return;
  var $=M.$, esc=M.esc, root=$('#mb-root'); if(!root) return;
  var TAB='ms_my_booking', DEVICE='ms_my_bookings', KAKAO=(M.CONFIG&&M.CONFIG.kakaoChannel)||'https://pf.kakao.com/_LnxbmX/chat';
  var cur=null, last4='';

  function store(kind){ try{ return kind==='tab'?window.sessionStorage:window.localStorage; }catch(e){ return null; } }
  function readJSON(kind,key,fb){ var s=store(kind); if(!s) return fb; try{ var v=JSON.parse(s.getItem(key)||'null'); return v==null?fb:v; }catch(e){ return fb; } }
  function writeJSON(kind,key,v){ var s=store(kind); if(!s) return; try{ if(v==null) s.removeItem(key); else s.setItem(key, JSON.stringify(v)); }catch(e){} }
  function won(n){ return Number(n||0).toLocaleString('ko-KR')+'원'; }
  function hh(h){ if(h==null||h==='') return ''; h=+h; return ('0'+(h%24)).slice(-2)+':00'; }
  function when(b){
    var d=b.start_date||b.date, t=(b.start_h!=null&&b.end_h!=null)?hh(b.start_h)+'–'+(b.end_h>=24&&b.start_h<24?'다음 날 ':'')+hh(b.end_h):'시간 확인 중';
    return (d?M.fmtKDate(d):'')+' · '+t;
  }
  function dday(n){ if(n==null) return ''; if(n===0) return '오늘'; return n>0?'D-'+n:''; }
  function api(path,opts){ return M.api(path,opts); }

  // ---------- 찾기 화면 ----------
  function showFind(msg){
    cur=null; document.title='나의 예약확인 · 메가스팟';
    root.innerHTML=''
      +'<div class="mb-find-grid">'
      + '<form class="card mb-find" id="mb-find" novalidate>'
      +  '<h2 class="h-s">예약번호로 찾기</h2>'
      +  '<p class="small muted mt-1">예약 확정 카카오톡·문자에 있는 예약번호와 예약자 휴대폰 뒷 4자리를 넣어 주세요.</p>'
      +  '<div class="f mt-2"><label for="mb-code">예약번호</label><input class="input" id="mb-code" name="booking_code" placeholder="예: MS-2612-AB12" autocomplete="off" autocapitalize="characters" maxlength="20" required></div>'
      +  '<div class="f"><label for="mb-last4">예약자 휴대폰 뒷 4자리</label><input class="input" id="mb-last4" name="phone_last4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required></div>'
      +  '<label class="agree small"><input type="checkbox" id="mb-remember"> 이 기기에서 다음에도 바로 열기 <span class="muted">(공용 PC에서는 체크하지 마세요)</span></label>'
      +  '<button class="btn btn-primary btn-lg" type="submit" id="mb-go">예약 확인하기 <span class="arrow">→</span></button>'
      +  '<div class="err" id="mb-err" role="alert"'+(msg?'':' hidden')+'>'+esc(msg||'')+'</div>'
      + '</form>'
      + '<div class="mb-side">'
      +  '<div class="card mb-mine" id="mb-mine"><h2 class="h-s">회원이신가요?</h2><p class="small muted mt-1">로그인한 상태로 보낸 예약 신청과 이용권 결제는 예약번호 없이 바로 열 수 있습니다.</p><div id="mb-mine-list" class="mt-2"><div class="tiny muted">확인하는 중…</div></div></div>'
      +  '<div class="card mb-device" id="mb-device" hidden></div>'
      + '</div>'
      +'</div>'
      +'<div class="mb-other mt-4"><h2 class="h-s">다른 예약을 찾으시나요?</h2><div class="mb-other-row">'
      + '<a class="mb-other-card" href="/spaces/booking/"><b>입점 공간 예약 요청</b><span>HB로 시작하는 요청번호로 진행 상태·견적·결제 확인</span></a>'
      + '<a class="mb-other-card" href="/planning/status/"><b>행사 준비 맡기기</b><span>PL로 시작하는 접수번호로 진행 상태 확인</span></a>'
      + '<a class="mb-other-card" href="/parking/purchase/"><b>주차권 구매 내역</b><span>구매한 주차권과 차량 등록 확인</span></a>'
      + '<a class="mb-other-card" href="/meetups/"><b>모임 참가 신청</b><span>신청한 모임 화면에서 신청 확인·취소</span></a>'
      +'</div></div>';
    var f=$('#mb-find'), code=$('#mb-code'), l4=$('#mb-last4');
    var tab=readJSON('tab',TAB,null); if(tab&&tab.c) code.value=tab.c;
    code.addEventListener('input',function(){ code.value=code.value.toUpperCase().replace(/[^A-Z0-9-]/g,''); });
    l4.addEventListener('input',function(){ l4.value=l4.value.replace(/\D/g,'').slice(0,4); });
    f.addEventListener('submit',function(e){
      e.preventDefault(); var er=$('#mb-err'); er.hidden=true;
      var c=code.value.trim(), p=l4.value.trim();
      if(c.length<4||p.length!==4){ er.textContent='예약번호와 휴대폰 뒷 4자리를 확인해 주세요.'; er.hidden=false; return; }
      var btn=$('#mb-go'); btn.disabled=true; btn.textContent='확인하는 중…';
      api('/my-booking/lookup',{method:'POST',body:{booking_code:c,phone_last4:p}}).then(function(j){
        last4=p; remember(j, $('#mb-remember').checked); show(j);
      }).catch(function(x){ er.textContent=x.code==='NO_API'?'지금은 예약 정보를 불러올 수 없습니다. 잠시 후 다시 시도하거나 카카오톡으로 문의해 주세요.':x.message; er.hidden=false; btn.disabled=false; btn.innerHTML='예약 확인하기 <span class="arrow">→</span>'; });
    });
    loadMine(); drawDevice();
  }

  function remember(j,device){
    writeJSON('tab',TAB,{c:j.key.c,k:j.key.k,at:Date.now()});
    if(device){ var l=readJSON('local',DEVICE,[]).filter(function(x){ return x&&x.c!==j.key.c; }); l.unshift({c:j.key.c,k:j.key.k,space:j.booking.space,date:j.booking.start_date||j.booking.date,at:Date.now()}); writeJSON('local',DEVICE,l.slice(0,5)); }
  }

  function loadMine(){
    var box=$('#mb-mine-list'); if(!box) return;
    api('/my-booking/mine').then(function(j){
      if(!j.login){ box.innerHTML='<a class="btn btn-light btn-sm" href="/login/?next='+encodeURIComponent('/my-booking/')+'">로그인하고 내 예약 보기</a>'; return; }
      if(!j.items.length){ box.innerHTML='<p class="small">'+esc(j.name||'회원')+'님 계정으로 연결된 예약이 아직 없습니다. 회원 가입 전에 한 예약은 왼쪽에서 예약번호로 찾아 주세요.</p>'; return; }
      box.innerHTML='<div class="mb-list">'+j.items.map(function(b){ return '<button type="button" class="mb-row" data-c="'+esc(b.code)+'" data-k="'+esc(b.k)+'"><b>'+esc(b.space)+'</b><span>'+esc(when(b))+'</span><em class="mb-chip st-'+esc(b.status)+'">'+esc(b.status_label)+'</em></button>'; }).join('')+'</div>';
      Array.prototype.forEach.call(box.querySelectorAll('.mb-row'),function(btn){ btn.addEventListener('click',function(){ open(btn.dataset.c, btn.dataset.k); }); });
    }).catch(function(){ box.innerHTML='<a class="btn btn-light btn-sm" href="/login/?next='+encodeURIComponent('/my-booking/')+'">로그인하고 내 예약 보기</a>'; });
  }

  function drawDevice(){
    var box=$('#mb-device'); if(!box) return;
    var mine=readJSON('local',DEVICE,[]), inv=readJSON('local','ms_invite_mine',[]), vb=readJSON('local','ms_venue_bookings',[]), pl=readJSON('local','ms_planning',[]);
    var rows=[];
    mine.forEach(function(x){ if(x&&x.c&&x.k) rows.push('<button type="button" class="mb-row" data-c="'+esc(x.c)+'" data-k="'+esc(x.k)+'"><b>'+esc(x.space||'메가스팟 예약')+'</b><span>'+esc(x.date?M.fmtKDate(x.date):'')+' · '+esc(x.c)+'</span><em class="mb-chip">나의 예약확인</em></button>'); });
    (inv||[]).forEach(function(x){ if(x&&x.manage_url&&/^\/invite\/manage\//.test(x.manage_url)) rows.push('<a class="mb-row" href="'+esc(x.manage_url)+'"><b>'+esc(x.title||'모임 초대장')+'</b><span>'+esc(x.date?M.fmtKDate(x.date):'')+'</span><em class="mb-chip">초대장 관리</em></a>'); });
    (vb||[]).forEach(function(x){ if(x&&x.code&&x.k) rows.push('<a class="mb-row" href="/spaces/booking/?code='+encodeURIComponent(x.code)+'&k='+encodeURIComponent(x.k)+'"><b>'+esc(x.name||'입점 공간 예약 요청')+'</b><span>'+esc(x.date?M.fmtKDate(x.date):'')+' · '+esc(x.code)+'</span><em class="mb-chip">입점 공간</em></a>'); });
    (pl||[]).forEach(function(x){ if(x&&x.ref&&x.k) rows.push('<a class="mb-row" href="/planning/status/?ref='+encodeURIComponent(x.ref)+'&k='+encodeURIComponent(x.k)+'"><b>행사 준비 맡기기</b><span>'+esc(x.ref)+'</span><em class="mb-chip">진행 상태</em></a>'); });
    if(!rows.length){ box.hidden=true; return; }
    box.hidden=false;
    box.innerHTML='<div class="row between"><h2 class="h-s">이 기기에서 연 예약·신청</h2><button type="button" class="linkish tiny" id="mb-forget">이 기기에서 지우기</button></div><div class="mb-list mt-2">'+rows.join('')+'</div>';
    Array.prototype.forEach.call(box.querySelectorAll('button.mb-row'),function(btn){ btn.addEventListener('click',function(){ open(btn.dataset.c, btn.dataset.k); }); });
    $('#mb-forget').addEventListener('click',function(){ writeJSON('local',DEVICE,null); drawDevice(); });
  }

  function open(c,k){
    root.innerHTML='<div class="card mb-loading">예약 정보를 불러오는 중…</div>';
    api('/my-booking/view?c='+encodeURIComponent(c)+'&k='+encodeURIComponent(k)).then(function(j){
      if(!cur||cur.key.c!==c) last4='';
      writeJSON('tab',TAB,{c:c,k:k,at:Date.now()}); show(j);
    }).catch(function(x){ writeJSON('tab',TAB,null); showFind(x.code==='NO_API'?'지금은 예약 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.':x.message); });
  }

  // ---------- 예약 화면 ----------
  function tile(o){
    return '<article class="mb-tile'+(o.tone?' t-'+o.tone:'')+'" id="mb-'+o.id+'"><div class="mb-tile-h"><span class="mb-ico" aria-hidden="true">'+o.icon+'</span><h3>'+esc(o.title)+'</h3>'+(o.chip?'<em class="mb-chip '+(o.chipClass||'')+'">'+esc(o.chip)+'</em>':'')+'</div>'
      +'<div class="mb-tile-b">'+o.body+'</div>'+(o.actions?'<div class="mb-acts">'+o.actions+'</div>':'')+'</article>';
  }
  function btn(href,label,kind,ext){ return '<a class="btn '+(kind||'btn-light')+' btn-sm" href="'+esc(href)+'"'+(ext?' target="_blank" rel="noopener"':'')+'>'+esc(label)+'</a>'; }
  function line(k,v){ return v==null||v===''?'':'<div class="mb-line"><span>'+esc(k)+'</span><b>'+v+'</b></div>'; }
  function copyBtn(text,label){ return '<button type="button" class="linkish tiny" data-copy="'+esc(text)+'">'+esc(label||'복사')+'</button>'; }

  function show(j){
    cur=j; var b=j.booking;
    document.title='나의 예약확인 · '+b.space+' · 메가스팟';
    var live=b.status==='confirmed'||b.status==='completed';
    var hero='<div class="card mb-sum">'
      +'<div class="mb-sum-top"><div><div class="eyebrow">My booking</div><h2 class="mb-space">'+esc(b.space)+'</h2></div>'
      +'<div class="mb-sum-chips"><em class="mb-chip st-'+esc(b.status)+'">'+esc(b.status_label)+'</em>'+(live&&!b.ended&&dday(b.days_left)?'<em class="mb-chip mb-dday">'+esc(dday(b.days_left))+'</em>':'')+'</div></div>'
      +'<div class="mb-sum-grid">'
      + '<div><span>이용 일시</span><b>'+esc(when(b))+'</b>'+(b.after_midnight?'<small>자정을 넘겨 시작하는 예약이라 실제 날짜로 보여 드립니다.</small>':'')+'</div>'
      + '<div><span>인원</span><b>'+(b.headcount?esc(b.headcount)+'명':'—')+'</b></div>'
      + '<div><span>예약번호</span><b>'+esc(b.code)+'</b> '+copyBtn(b.code)+'</div>'
      +'</div></div>';
    var next='<section class="mb-next" aria-labelledby="mb-next-h"><h2 class="h-s" id="mb-next-h">지금 할 일</h2><div class="mb-next-list">'
      +(j.next||[]).map(function(n){ return '<div class="mb-step s-'+esc(n.tone)+'"><div><b>'+esc(n.label)+'</b><p>'+esc(n.desc||'')+'</p></div>'+(n.href?'<a class="btn btn-primary btn-sm" href="'+esc(n.href)+'">바로 하기 →</a>':(n.key==='review'?'<a class="btn btn-primary btn-sm" href="#mb-review">후기 쓰기 ↓</a>':(n.key==='account'?'<a class="btn btn-kakao btn-sm" href="'+esc(KAKAO)+'" target="_blank" rel="noopener">카카오톡</a>':'')))+'</div>'; }).join('')
      +'</div></section>';

    var tiles=[];
    // 예약확정서
    tiles.push(tile({id:'confirm',icon:'📄',title:'예약확정서',chip:j.confirmation.issued?'발급됨':'준비 중',chipClass:j.confirmation.issued?'ok':'',
      body:j.confirmation.issued?'<p>확정서를 열어 PDF·이미지로 저장하거나 카카오톡으로 보낼 수 있습니다. 회사 품의·정산 자료로 쓰셔도 됩니다.</p>':(j.confirmation.needs_reissue?'<p>예약 조건이 바뀌어 새 확정서를 준비하고 있습니다.</p>':'<p>예약이 확정되면 확정서를 발급해 드립니다. 급하시면 카카오톡으로 요청해 주세요.</p>'),
      actions:j.confirmation.issued?btn(j.confirmation.url,'확정서 보기 · 저장','btn-primary'):btn(KAKAO,'카카오톡으로 요청','btn-kakao',true)}));
    if(live){
      // 계약서
      var c=j.contract;
      tiles.push(tile({id:'contract',icon:'✍️',title:'공간대관 계약서',chip:c?c.label:'요청 시 발송',chipClass:c&&c.status==='signed'?'ok':(c?'todo':''),
        body:c?(c.status==='signed'?'<p>계약을 마쳤습니다. 계약서를 PDF·이미지로 내려받을 수 있습니다.</p>':'<p>내용을 확인하고 대관자 정보를 넣은 뒤 ‘확인하고 계약 완료’를 누르면 계약이 끝납니다.</p>'):'<p>회사·기관 행사로 계약서가 필요하시면 카카오톡으로 말씀해 주세요. 예약 내용을 채운 계약서 링크를 보내 드립니다.</p>',
        actions:c?btn(c.url,c.status==='signed'?'계약서 보기 · 내려받기':'계약서 확인하기',c.status==='signed'?'btn-light':'btn-primary'):btn(KAKAO,'계약서 요청하기','btn-kakao',true)}));
      // 결제
      var p=j.payment||{};
      var done=b.status==='completed', owe=p.balance>0&&!done;
      tiles.push(tile({id:'pay',icon:'💳',title:'이용료 결제',chip:!p.visible?'확정서에서 확인':(p.complete?'결제 완료':(owe?'남은 금액 있음':'')),chipClass:p.complete?'ok':(owe?'todo':''),
        body:!p.visible?'<p>이 예약은 금액을 예약확정서에서 안내합니다.</p>':(line('이용료 합계',p.total!=null?won(p.total):'확인 중')+(done?'<p class="small muted mt-1">이용을 마친 예약입니다. 정산 내용은 예약확정서와 운영팀 안내를 기준으로 합니다.</p>':line('받은 금액',p.paid!=null?won(p.paid):'')+line('남은 금액',p.balance!=null?won(p.balance):'')+line('입금 기한',owe&&p.due_date?esc(M.fmtKDate(p.due_date)):''))
          +(p.bank?'<div class="mb-bank"><span>입금 계좌</span><b>'+esc(p.bank.name+' '+p.bank.account)+'</b><small>예금주 '+esc(p.bank.holder)+'</small> '+copyBtn(p.bank.name+' '+p.bank.account,'계좌 복사')+'</div><p class="tiny muted mt-1">이미 입금하셨다면 다시 보내지 마세요. 운영팀이 확인하면 반영됩니다.</p>':'')),
        actions:btn('/guide/#refund','결제·환불 기준')}));
      // 보증금
      var d=j.deposit;
      if(d){
        var dchip=d.returned?'환급 완료':(d.method==='card'?'카드 보증금':(d.paid?'입금 확인':(b.ended?'운영팀 확인':'입금 전')));
        tiles.push(tile({id:'deposit',icon:'🛡️',title:'보증금',chip:dchip,chipClass:d.returned||d.paid?'ok':(b.ended?'':'todo'),
          body:line('보증금',d.amount!=null?won(d.amount):'확정서 참고')+line('입금 기한',!d.paid&&!b.ended&&d.due_date?esc(M.fmtKDate(d.due_date)):'')+line('환급 예정일',d.refund_date&&!d.returned?esc(M.fmtKDate(d.refund_date)):'')
            +(d.bank?'<div class="mb-bank"><span>보증금 계좌</span><b>'+esc(d.bank.name+' '+d.bank.account)+'</b><small>예금주 '+esc(d.bank.holder)+'</small> '+copyBtn(d.bank.name+' '+d.bank.account,'계좌 복사')+'</div>':'')
            +(d.method!=='card'&&d.paid&&!d.returned?'<p class="small mt-1">'+(d.account_registered?'환급 계좌가 등록되어 있습니다.':'이용 뒤 카카오톡으로 보내 드리는 링크에서 환급 계좌를 등록해 주세요.')+'</p>':''),
          actions:btn('/guide/#deposit','보증금 안내')}));
      }
      // 입실·주차·오시는 길 (이용을 마친 예약은 생략)
      if(!b.ended) tiles.push(tile({id:'arrive',icon:'🚪',title:'입실 · 주차 · 오시는 길',
        body:'<p>도어락 번호와 와이파이 같은 입실 정보는 보안을 위해 카카오톡으로 받으신 <b>‘예약 안내’ 링크</b>에서만 보여 드립니다. 링크가 없으시면 카카오톡으로 말씀해 주세요.</p>',
        actions:btn('/parking/purchase/','주차권 구매 · 차량 등록','btn-primary')+btn('/parking/','주차 안내')+(b.space_url?btn(b.space_url+'#location','오시는 길'):'')+btn(KAKAO,'예약 안내 링크 다시 받기','btn-kakao',true)}));
      // 초대장·행사 게임
      var inv=j.invite||{};
      if(!b.ended||inv.exists) tiles.push(tile({id:'invite',icon:'💌',title:'모임 초대장 · 행사 게임',chip:inv.exists?'참석 '+(inv.rsvp?inv.rsvp.yes:0)+'명 응답':'무료',chipClass:inv.exists?'ok':'',
        body:inv.exists?'<p>참석 응답: 참석 '+esc(inv.rsvp.yes)+' · 미정 '+esc(inv.rsvp.maybe)+' · 불참 '+esc(inv.rsvp.no)+(inv.rsvp.people?' (참석 인원 '+esc(inv.rsvp.people)+'명)':'')+'</p><p class="small muted">행사 날 스크린에 웰컴 화면·추첨·퀴즈를 띄울 수 있습니다.</p>'
          :'<p>날짜·장소·길찾기·주차 안내가 자동으로 붙는 모바일 초대장을 만들어 참석자에게 보내고, 참석 응답을 받을 수 있습니다.</p>',
        actions:inv.exists?btn(inv.manage_url,'초대장 관리','btn-primary')+btn(inv.public_url,'참석자 화면')+(inv.screen_url?btn(inv.screen_url,'행사 스크린 열기'):'')
          :btn(inv.create_url||'/invite/new/','초대장 만들기','btn-primary')+btn('/play/','행사 게임 둘러보기')}));
      // 식음료
      var food=j.food;
      tiles.push(tile({id:'food',icon:'🍽️',title:'식음료',chip:food&&food.length?food[0].label:'',chipClass:food&&food.length&&food[0].status==='confirmed'?'ok':'',
        body:food&&food.length?food.map(function(f){ return line('출장뷔페',esc(f.label)+(f.people?' · '+esc(f.people)+'명':'')+(f.meal_time?' · 식사 '+esc(f.meal_time):'')); }).join('')+'<p class="small muted mt-1">메뉴·인원 변경은 카카오톡으로 말씀해 주세요.</p>'
          :'<p>출장뷔페·케이터링·출장 칵테일을 공간 예약과 함께 준비할 수 있습니다. 행사 3일 전까지 말씀해 주시면 좋습니다.</p>',
        actions:btn(j.links.food,'식음료 문의',food&&food.length?'btn-light':'btn-primary')}));
      // 후기
      var r=j.review||{};
      tiles.push(tile({id:'review',icon:'⭐',title:'이용 후기',chip:r.written?(r.status==='approved'?'게시됨':'확인 중'):(r.can_write?'작성 가능':'이용 후 작성'),chipClass:r.written?'ok':'',
        body:r.written?'<p>후기를 보내 주셔서 감사합니다. 운영팀이 확인한 뒤 공간 화면에 게시합니다.</p>':(r.can_write?reviewForm(b):'<p>이용을 마치고 운영팀이 이용 완료로 바꾸면 여기에서 바로 후기를 쓸 수 있습니다.</p>')}));
    }
    // 다시 예약
    tiles.push(tile({id:'rebook',icon:'🔁',title:'다시 예약하기',body:'<p>같은 공간·인원으로 날짜만 바꿔 금액을 확인하고 신청할 수 있습니다. 정기 모임이면 할인 상담도 받아 보세요.</p>',
      actions:btn(j.links.rebook,'예약/견적 문의','btn-primary')+btn('/inquiry/?type=regular'+(b.space_id&&b.space_id!=='food-only'?'&space='+encodeURIComponent(b.space_id):''),'정기 모임 상담')}));

    tiles.sort(function(x,y){ return (/id="mb-review"/.test(x)?1:0)-(/id="mb-review"/.test(y)?1:0); });   // 후기는 맨 아래 한 줄 전체
    root.innerHTML=hero+next+'<div class="mb-tiles">'+tiles.join('')+'</div>'
      +'<div class="mb-foot"><button type="button" class="btn btn-light btn-sm" id="mb-again">다른 예약 찾기</button><button type="button" class="btn btn-light btn-sm" id="mb-save">이 기기에 기억하기</button><button type="button" class="linkish tiny" id="mb-close">이 기기에서 닫기</button>'
      +'<p class="tiny muted">이 화면은 예약확정서와 같은 수준으로 보호됩니다. 공용 PC에서는 다 보신 뒤 ‘이 기기에서 닫기’를 눌러 주세요.</p></div>';
    bind();
    try{ window.scrollTo({top:Math.max(0,($('.mb-sum')||root).getBoundingClientRect().top+window.scrollY-90),behavior:'smooth'}); }catch(e){}
  }

  function reviewForm(b){
    return '<form class="form mb-review" id="mb-review-form" novalidate>'
      +(last4?'':'<div class="f"><label for="mbr-last4">예약자 휴대폰 뒷 4자리 <span class="req">*</span></label><input class="input" id="mbr-last4" inputmode="numeric" maxlength="4" required></div>')
      +'<div class="field-row"><div class="f"><label for="mbr-author">표시 이름 <span class="req">*</span></label><input class="input" id="mbr-author" maxlength="40" placeholder="예: ○○ 동문회 총무" required></div>'
      +'<div class="f"><label for="mbr-rating">만족도 <span class="req">*</span></label><select class="select" id="mbr-rating" required><option value="">선택</option><option value="5">5 · 다음에도 이용하고 싶다</option><option value="4">4 · 좋았다</option><option value="3">3 · 보통이었다</option><option value="2">2 · 아쉬웠다</option><option value="1">1 · 많이 아쉬웠다</option></select></div></div>'
      +'<div class="f"><label for="mbr-title">한 줄 요약 <span class="req">*</span></label><input class="input" id="mbr-title" maxlength="60" required></div>'
      +'<div class="f"><label for="mbr-body">내용 <span class="req">*</span></label><textarea class="textarea" id="mbr-body" maxlength="1500" rows="4" placeholder="배치가 인원에 맞았는지, 화면·음향·준비 시간은 어땠는지 알려 주세요." required></textarea></div>'
      +'<div class="f"><label for="mbr-head">실제 인원</label><input class="input" id="mbr-head" inputmode="numeric" maxlength="4" value="'+esc(b.headcount||'')+'"></div>'
      +'<label class="agree small"><input type="checkbox" id="mbr-agree" required> 개인정보가 포함되지 않은 내용이며, 운영자가 확인한 뒤 게시하는 데 동의합니다.</label>'
      +'<div class="form-note" id="mbr-msg" hidden></div><button class="btn btn-primary btn-sm" type="submit">후기 보내기</button></form>';
  }

  function bind(){
    Array.prototype.forEach.call(root.querySelectorAll('[data-copy]'),function(el){ el.addEventListener('click',function(){ (M.copy?M.copy(el.dataset.copy):Promise.reject()).then(function(){ el.textContent='복사했습니다'; setTimeout(function(){ el.textContent='복사'; },1600); }).catch(function(){ window.prompt('복사해 주세요',el.dataset.copy); }); }); });
    $('#mb-again').addEventListener('click',function(){ writeJSON('tab',TAB,null); showFind(); window.scrollTo(0,0); });
    $('#mb-close').addEventListener('click',function(){ if(cur){ var l=readJSON('local',DEVICE,[]).filter(function(x){ return x&&x.c!==cur.key.c; }); writeJSON('local',DEVICE,l.length?l:null); } writeJSON('tab',TAB,null); last4=''; showFind(); window.scrollTo(0,0); });
    $('#mb-save').addEventListener('click',function(){ if(cur){ remember(cur,true); this.textContent='이 기기에 기억했습니다'; this.disabled=true; } });
    var f=$('#mb-review-form'); if(f) f.addEventListener('submit',function(e){
      e.preventDefault(); var msg=$('#mbr-msg'), p=last4||(($('#mbr-last4')||{}).value||'').replace(/\D/g,'');
      var d={booking_code:cur.booking.code,phone_last4:p,author:$('#mbr-author').value.trim(),rating:+$('#mbr-rating').value,title:$('#mbr-title').value.trim(),body:$('#mbr-body').value.trim(),headcount:+$('#mbr-head').value||null,agree:$('#mbr-agree').checked,space_id:cur.booking.space_id};
      if(p.length!==4||!d.author||!d.rating||!d.title||!d.body||!d.agree){ msg.className='form-note err'; msg.textContent='표시된 항목을 모두 채워 주세요.'; msg.hidden=false; return; }
      var b=f.querySelector('button[type=submit]'); b.disabled=true;
      M.api('/reviews',{method:'POST',body:d}).then(function(){ msg.className='form-note ok'; msg.textContent='후기를 보냈습니다. 운영팀이 확인한 뒤 게시합니다. 고맙습니다!'; msg.hidden=false; f.querySelectorAll('input,select,textarea').forEach(function(x){ x.disabled=true; }); })
        .catch(function(x){ msg.className='form-note err'; msg.textContent=x.message||'보내지 못했습니다.'; msg.hidden=false; b.disabled=false; });
    });
  }

  // ---------- 시작 ----------
  function start(){
    var h=new URLSearchParams(location.hash.slice(1)), q=new URLSearchParams(location.search);
    var c=(h.get('c')||q.get('c')||'').toUpperCase(), k=h.get('k')||q.get('k')||'', mine=(h.get('mine')||'').toUpperCase();
    if(location.hash||q.get('k')) history.replaceState(null,'',location.pathname);
    if(c&&k) return open(c,k);
    if(mine){ return api('/my-booking/mine').then(function(j){ var it=(j.items||[]).filter(function(x){ return x.code===mine; })[0]; if(it) open(it.code,it.k); else showFind(j.login?'회원 계정에 연결된 예약에서 찾지 못했습니다. 예약번호로 찾아 주세요.':''); }).catch(function(){ showFind(); }); }
    var tab=readJSON('tab',TAB,null);
    if(tab&&tab.c&&tab.k&&Date.now()-(tab.at||0)<24*3600e3) return open(tab.c,tab.k);
    showFind();
  }
  start();
})();
