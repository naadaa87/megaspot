/* 관리자 · MC·강사 섭외 (2026-11-25) — 새 메뉴 (view: talent)
   · 섭외 요청: 고객이 /mc/ 에서 보낸 요청을 상태별로 보고, 진행자 배정·견적·출연료·메모를 저장합니다.
     진행자에게 보낼 확인 문의(고객 이름·연락처·회사명은 넣지 않음)와 고객 안내문을 바로 복사합니다.
   · 진행자 프로필: 홈페이지에 보이는 정보와 '관리자 전용' 정보(휴대폰·이메일·카카오톡·소속·출연료 기준·정산 메모)를 나눠 고칩니다.
     관리자 전용 칸은 이 화면과 관리자 API 에서만 보이고, 홈페이지·공개 API 에는 나가지 않습니다.
   · /api/admin/talent… 만 씁니다. 메뉴 버튼은 이 파일이 만들고 admin-navigation.js 가 '행사·부가서비스' 묶음에 넣습니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var main=document.querySelector('.adm-main'), nav=document.getElementById('adm-nav'); if(!main||!nav) return;
  var esc=X.esc, SITE='https://megaspot.kr', PLACE_ADDR='서울 광진구 능동로13길 39 한아름건물 2층';
  var nb=document.createElement('button'); nb.type='button'; nb.dataset.view='talent'; nb.innerHTML='MC·강사 섭외<em data-count="talent" hidden></em>'; nav.appendChild(nb);

  var V=document.createElement('section'); V.id='view-talent'; V.className='adm-view tla'; V.hidden=true;
  V.innerHTML='<header class="adm-head"><div><h1>MC·강사 섭외</h1><p class="small muted">고객이 <a href="/mc/" target="_blank" rel="noopener">MC·강사 섭외</a> 화면에서 보낸 요청과 진행자 프로필을 관리합니다. 진행자 연락처는 이 화면에서만 보이고 홈페이지에는 나가지 않습니다.</p></div>'
    +'<div class="tla-acts"><button type="button" class="btn btn-light btn-sm" id="tla-reload">새로고침</button></div></header>'
    +'<nav class="tla-tabs" role="tablist" aria-label="MC·강사 섭외"><button type="button" role="tab" data-tab="req" aria-selected="true">섭외 요청 <em id="tla-req-n"></em></button><button type="button" role="tab" data-tab="prof" aria-selected="false">진행자 프로필 <em id="tla-prof-n"></em></button></nav>'
    +'<div data-pane="req">'
      +'<div class="tla-bar"><div class="tla-st" id="tla-st" role="group" aria-label="상태"></div><div class="tla-tools"><input class="input" id="tla-q" type="search" placeholder="이름·연락처·접수번호·내용 검색" aria-label="섭외 요청 검색"><button type="button" class="btn btn-primary btn-sm" id="tla-new">+ 직접 등록</button><button type="button" class="btn btn-light btn-sm" id="tla-csv">CSV</button></div></div>'
      +'<div class="tla-split"><div class="tla-list" id="tla-list"></div><div class="tla-detail" id="tla-detail"><div class="adm-card tla-empty"><p class="small muted">왼쪽 목록에서 요청을 고르면 내용과 진행자 연락처, 안내문이 여기에 열립니다.</p></div></div></div>'
    +'</div>'
    +'<div data-pane="prof" hidden><div class="tla-bar"><p class="small muted" id="tla-prof-st"></p><div class="tla-tools"><a class="btn btn-light btn-sm" href="/mc/" target="_blank" rel="noopener">홈페이지에서 보기 ↗</a><button type="button" class="btn btn-primary btn-sm" id="tla-pnew">+ 새 진행자</button></div></div><div class="tla-profiles" id="tla-profiles"></div><div id="tla-editor"></div></div>';
  main.appendChild(V);
  var q=function(s){ return V.querySelector(s); }, qa=function(s,el){ return Array.prototype.slice.call((el||V).querySelectorAll(s)); };

  var S={ tab:'req', status:'open', q:'', items:[], counts:{}, opt:null, profiles:[], popt:null, cur:'', pending:'' };
  var ST_ORDER=[['open','진행 중'],['new','접수'],['checking','일정 확인 중'],['quoted','견적 안내'],['confirmed','섭외 확정'],['done','행사 완료'],['cancelled','취소'],['all','전체']];
  var won=function(n){ return (Number(n)||0).toLocaleString('ko-KR')+'원'; };
  var digits=function(s){ return String(s||'').replace(/\D/g,''); };
  var WD='일월화수목금토';
  function kdate(d){ if(!/^\d{4}-\d{2}-\d{2}$/.test(d||'')) return '날짜 미정'; var p=d.split('-').map(Number), w=new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay(); return p[0]+'년 '+p[1]+'월 '+p[2]+'일 ('+WD[w]+')'; }
  // 목록을 불러오기 전(오늘 할 일 카드)에도 이름으로 보이게 기본 이름표를 둡니다 — 서버(_talent.js)의 이름표와 같습니다
  var DEF={ places:{'megaspot-gundae':'메가스팟 건대 1호','megaspot-gundae-2':'메가스팟 건대 2호',other:'다른 장소',tbd:'장소 미정'}, events:{ceremony:'기념식·개관식·시상식',forum:'포럼·세미나·컨퍼런스',corporate:'기업 행사·워크숍',party:'송년회·신년회·파티',sports:'체육대회·운동회',festival:'축제·공연·음악회',lecture:'특강·교육',global:'국제 행사',etc:'기타 행사'},
    roles:{announcer:'공식행사 아나운서',mc:'행사 MC',recreation:'레크리에이션',lecture:'강의·특강',broadcast:'방송·영상 진행'}, langs:{en:'영어',zh:'중국어',ja:'일본어'} };
  function L(group,k){ var o=(S.opt&&S.opt[group])||DEF[group]; return (o&&o[k])||k||''; }
  function prof(slug){ return S.profiles.filter(function(p){ return p.slug===slug; })[0]; }
  function pill(st,label){ return '<span class="tla-pill tla-p-'+esc(st)+'">'+esc(label)+'</span>'; }
  function say(msg){ M.toast(msg); }
  function failTo(box){ return function(e){ if(X.guard&&X.guard(e)) return; box.innerHTML='<div class="adm-card"><p class="small" style="color:var(--rust)">'+esc(e&&e.message||'불러오지 못했습니다.')+'</p></div>'; }; }

  /* ---------- 탭 ---------- */
  function tab(t){ S.tab=t; qa('.tla-tabs [data-tab]').forEach(function(b){ b.setAttribute('aria-selected', String(b.dataset.tab===t)); }); qa('[data-pane]').forEach(function(p){ p.hidden=p.dataset.pane!==t; }); if(t==='prof') drawProfiles(); }
  qa('.tla-tabs [data-tab]').forEach(function(b){ b.addEventListener('click',function(){ tab(b.dataset.tab); }); });

  /* ---------- 불러오기 ---------- */
  function loadProfiles(){ return X.A('/talent/profiles').then(function(r){ S.profiles=r.items||[]; S.popt=r.options; q('#tla-prof-n').textContent=S.profiles.length; if(S.tab==='prof') drawProfiles(); }); }
  function loadRequests(){
    q('#tla-list').innerHTML='<p class="small muted">불러오는 중…</p>';
    return X.A('/talent/requests?status='+encodeURIComponent(S.status)+(S.q?'&q='+encodeURIComponent(S.q):'')).then(function(r){
      S.items=r.items||[]; S.counts=r.counts||{}; S.opt=r.options; drawStatus(); drawList();
      X.setCount('talent', S.counts.new||0);
      var open=0; ['new','checking','quoted','confirmed'].forEach(function(k){ open+=S.counts[k]||0; }); q('#tla-req-n').textContent=open||'';
      var want=S.pending||S.cur, fromLink=!!S.pending; S.pending='';
      if(want){ var it=S.items.filter(function(x){ return x.ref===want; })[0]; if(it) openReq(it); else if(fromLink) X.A('/talent/requests/'+want).then(function(r){ openReq(r.item); }).catch(function(){}); }
    }).catch(failTo(q('#tla-list')));
  }
  function load(){ return Promise.all([loadProfiles(), loadRequests()]).catch(function(e){ if(X.guard) X.guard(e); }); }
  q('#tla-reload').addEventListener('click', load);

  /* ---------- 요청 목록 ---------- */
  function drawStatus(){
    var open=0; ['new','checking','quoted','confirmed'].forEach(function(k){ open+=S.counts[k]||0; });
    var all=0; Object.keys(S.counts).forEach(function(k){ all+=S.counts[k]; });
    q('#tla-st').innerHTML=ST_ORDER.map(function(s){ var n=s[0]==='open'?open:s[0]==='all'?all:(S.counts[s[0]]||0); return '<button type="button" class="chip'+(S.status===s[0]?' on':'')+'" data-st="'+s[0]+'">'+esc(s[1])+(n?' <span class="n">'+n+'</span>':'')+'</button>'; }).join('');
    qa('[data-st]',q('#tla-st')).forEach(function(b){ b.addEventListener('click',function(){ S.status=b.dataset.st; loadRequests(); }); });
  }
  function when(x){ var d=x.data||{}; return kdate(x.event_date)+(d.start_t?' '+d.start_t+(d.end_t?'~'+d.end_t:''):''); }
  function placeText(d){ return L('places',d.place)+(d.place_detail?' · '+d.place_detail:''); }
  function drawList(){
    var box=q('#tla-list');
    if(!S.items.length){ box.innerHTML='<div class="adm-card"><p class="small muted">'+(S.q?'검색 결과가 없습니다.':'이 상태의 섭외 요청이 없습니다.')+'</p></div>'; return; }
    box.innerHTML=S.items.map(function(x){ var d=x.data||{}, names=(x.assigned_label.length?x.assigned_label:x.picks_label);
      return '<div class="tla-row'+(x.ref===S.cur?' on':'')+'" data-tr="'+esc(x.ref)+'" tabindex="0" role="button">'
        +'<div class="r1">'+pill(x.status,x.status_label)+'<b>'+esc(x.name||'(이름 없음)')+'</b><span class="muted">'+esc(x.phone)+'</span><span class="tla-ago">'+esc(X.ago(x.created_at))+'</span></div>'
        +'<div class="r2">'+esc(when(x))+' · '+esc(placeText(d))+(d.headcount?' · '+esc(d.headcount)+'명':'')+'</div>'
        +'<div class="r3">'+esc([L('events',d.event_type),(d.roles||[]).map(function(r){ return L('roles',r); }).join('·')].filter(Boolean).join(' · ')||'행사 종류 미정')
        +(names.length?' · <b>'+esc((x.assigned_label.length?'배정 ':'희망 ')+names.join(', '))+'</b>':d.recommend?' · 추천 요청':'')+'</div></div>'; }).join('');
    qa('[data-tr]',box).forEach(function(r){ var go=function(){ var it=S.items.filter(function(x){ return x.ref===r.dataset.tr; })[0]; if(it) openReq(it); }; r.addEventListener('click',go); r.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); go(); } }); });
  }
  var qt; q('#tla-q').addEventListener('input',function(){ clearTimeout(qt); var v=this.value.trim(); qt=setTimeout(function(){ S.q=v; loadRequests(); },300); });

  /* ---------- 안내문 ---------- */
  function talentMsg(x, p){
    var d=x.data||{}, t=[];
    t.push('[메가스팟 행사 진행 섭외 문의]');
    t.push((p?p.name+'님, ':'')+'안녕하세요. 메가스팟입니다.');
    t.push('아래 행사 진행이 가능하신지 확인 부탁드립니다.'); t.push('');
    t.push('· 행사일: '+when(x));
    t.push('· 장소: '+(d.place==='megaspot-gundae'||d.place==='megaspot-gundae-2'?L('places',d.place)+' ('+PLACE_ADDR+')':placeText(d)));
    t.push('· 행사: '+([L('events',d.event_type),d.event_name].filter(Boolean).join(' · ')||'상담 중')+(d.headcount?' · 약 '+d.headcount+'명':''));
    if((d.roles||[]).length) t.push('· 맡아 주실 진행: '+d.roles.map(function(r){ return L('roles',r); }).join(', '));
    t.push('· 진행 언어: '+['한국어'].concat((d.langs||[]).map(function(l){ return L('langs',l); })).join(', '));
    if((d.needs||[]).length) t.push('· 함께 필요한 것: '+d.needs.map(function(n){ return L('needs',n); }).join(', '));
    if(d.message) t.push('· 요청 내용: '+d.message);
    t.push(''); t.push('가능 여부와 출연료를 알려 주시면 고객께 안내드리겠습니다. 감사합니다.');
    return t.join('\n');
  }
  function names(x){ return (x.admin.assigned||[]).map(function(s){ var p=prof(s); return p?p.name:s; }); }
  function customerMsg(x, kind){
    var d=x.data||{}, a=x.admin||{}, who=(x.name||'고객')+'님', day=x.event_date?kdate(x.event_date):'행사';
    var picks=names(x).length?names(x):(x.picks_label||[]), t=[];
    t.push('안녕하세요, '+who+'. 메가스팟입니다.');
    if(kind==='receipt'){
      t.push('보내 주신 행사 진행자 섭외 요청('+x.ref+')을 확인했습니다.');
      t.push(day+' '+(d.place==='tbd'?'':L('places',d.place)+' ')+'행사에 맞춰 '+(picks.length?picks.join(', ')+'님':'진행자')+' 일정과 진행 조건을 확인한 뒤, 견적과 함께 다시 연락드리겠습니다.');
      t.push(''); t.push('진행 상태는 '+SITE+'/mc/#status 에서 접수번호와 휴대폰 번호 뒷 4자리로 확인하실 수 있습니다.');
    } else if(kind==='quote'){
      t.push('요청하신 '+day+' 행사 진행자 섭외 견적을 안내드립니다.'); t.push('');
      (a.assigned||[]).forEach(function(s){ var p=prof(s); if(p) t.push('· 진행자: '+p.name+' ('+p.title+') — '+SITE+'/mc/view/?id='+p.slug); });
      if(!(a.assigned||[]).length) t.push('· 진행자: (배정 후 안내)');
      if((d.roles||[]).length) t.push('· 진행: '+d.roles.map(function(r){ return L('roles',r); }).join(', '));
      t.push('· 출연료: '+(a.quote_amount!=null?won(a.quote_amount)+' ('+L('vat',a.vat||'excl')+')':'(금액 입력 후 안내)'));
      t.push(''); t.push('확정을 원하시면 회신 부탁드립니다. 확정 후 행사 순서와 큐시트를 함께 맞춰 드리겠습니다.');
    } else {
      t.push(day+' 행사 진행자가 '+(picks.length?picks.join(', ')+'님으로':'')+' 확정되었습니다.');
      t.push('행사 전에 진행 순서(큐시트)와 필요한 대본·자료를 보내 주시면 진행자와 함께 준비하겠습니다.');
      t.push('궁금한 점은 이 채팅이나 '+((M.CONFIG&&M.CONFIG.phone)||'010-2384-9580')+'으로 편하게 연락 주세요.');
    }
    return t.join('\n');
  }
  function copy(text, ok){ M.copy(text).then(function(r){ say(r?(ok||'복사했습니다.'):'복사하지 못했습니다. 직접 선택해 복사해 주세요.'); }); }

  /* ---------- 요청 상세 ---------- */
  function contactLines(p){
    var v=p.private||{}, rows=[];
    if(v.phone) rows.push('<a href="tel:'+esc(digits(v.phone))+'">☎ '+esc(v.phone)+'</a>');
    if(v.phone2) rows.push('<a href="tel:'+esc(digits(v.phone2))+'">☎ '+esc(v.phone2)+'</a>');
    if(v.email) rows.push('<a href="mailto:'+esc(v.email)+'">✉ '+esc(v.email)+'</a>');
    if(v.kakao) rows.push('<span>카카오톡 '+esc(v.kakao)+'</span>');
    if(v.agency) rows.push('<span>소속·매니저 '+esc(v.agency)+'</span>');
    return rows.length?rows.join(''):'<span class="tla-warn">연락처 미입력 — 진행자 프로필의 관리자 전용 칸에 입력해 주세요.</span>';
  }
  function openReq(x){
    S.cur=x.ref; qa('.tla-row').forEach(function(r){ r.classList.toggle('on', r.dataset.tr===x.ref); });
    var d=x.data||{}, a=x.admin||{}, box=q('#tla-detail'), picked={}, assigned={};
    (d.picks||[]).forEach(function(p){ picked[p.slug]=1; }); (a.assigned||[]).forEach(function(s){ assigned[s]=1; });
    var order=S.profiles.slice().sort(function(p1,p2){ var w=function(p){ return (assigned[p.slug]?0:picked[p.slug]?1:p.status==='published'?2:3); }; return w(p1)-w(p2); });
    var top=order.filter(function(p){ return assigned[p.slug]||picked[p.slug]; }), rest=order.filter(function(p){ return !assigned[p.slug]&&!picked[p.slug]; });
    var tRow=function(p){ return '<div class="tla-tal'+(assigned[p.slug]?' on':'')+'"><label class="tla-tal-h"><input type="checkbox" name="assigned" value="'+esc(p.slug)+'"'+(assigned[p.slug]?' checked':'')+'>'
      +(p.photo?'<img src="'+esc(p.photo.small||p.photo.src)+'" alt="">':'')+'<span><b>'+esc(p.name)+'</b> <small>'+esc(p.title)+'</small>'+(picked[p.slug]?' <em class="tla-tag">고객 희망</em>':'')+(p.status!=='published'?' <em class="tla-tag tla-tag-off">'+esc(p.status_label)+'</em>':'')+'</span></label>'
      +'<div class="tla-contact">'+contactLines(p)+'</div>'+((p.private||{}).fee_basis?'<p class="tla-fee">출연료 기준: '+esc(p.private.fee_basis)+'</p>':'')
      +'<div class="tla-tal-acts"><button type="button" class="btn btn-light btn-xs" data-tmsg="'+esc(p.slug)+'">확인 문의 복사</button>'+((p.private||{}).phone?'<a class="btn btn-light btn-xs" href="sms:'+esc(digits(p.private.phone))+'?body='+encodeURIComponent(talentMsg(x,p))+'">문자 보내기</a>':'')+'<a class="btn btn-light btn-xs" href="/mc/view/?id='+esc(p.slug)+'" target="_blank" rel="noopener">프로필 ↗</a></div></div>'; };
    var cf=d.came_from||{}, info=function(k,v){ return v?'<div><dt>'+esc(k)+'</dt><dd>'+v+'</dd></div>':''; };
    box.innerHTML='<form class="adm-card tla-req" id="tla-req" novalidate>'
      +'<div class="tla-req-top"><div>'+pill(x.status,x.status_label)+' <b class="tla-ref">'+esc(x.ref)+'</b><span class="small muted"> · 접수 '+esc(String(x.created_at||'').slice(0,16))+' ('+esc(X.ago(x.created_at))+')</span></div><button type="button" class="btn btn-light btn-xs" data-close>닫기</button></div>'
      +'<section><h3>고객</h3><dl class="tla-dl">'+info('이름',esc(x.name)+(x.member_id?' <em class="tla-tag">회원</em>':''))
        +info('휴대폰','<a href="tel:'+esc(digits(x.phone))+'">'+esc(x.phone)+'</a> · <a href="sms:'+esc(digits(x.phone))+'">문자</a>')+info('이메일',x.email?'<a href="mailto:'+esc(x.email)+'">'+esc(x.email)+'</a>':'')
        +info('회사·단체',esc(d.org||''))+info('예약·문의번호',esc(d.inquiry_ref||''))+info('들어온 곳',esc(d.channel==='web'?'홈페이지'+(cf.label?' · '+cf.label:''):'직접 등록'))+'</dl></section>'
      +'<section><h3>행사 조건</h3><dl class="tla-dl">'+info('행사',esc([L('events',d.event_type),d.event_name].filter(Boolean).join(' · ')||'미정'))+info('날짜·시간',esc(when(x)))
        +info('장소',esc(placeText(d)))+info('인원',d.headcount?esc(d.headcount)+'명':'')+info('필요한 진행',esc((d.roles||[]).map(function(r){ return L('roles',r); }).join(', ')))
        +info('외국어',esc((d.langs||[]).map(function(r){ return L('langs',r); }).join(', ')))+info('함께 필요',esc((d.needs||[]).map(function(r){ return L('needs',r); }).join(', ')))
        +info('예산',esc(d.budget?L('budgets',d.budget):''))+info('추천',d.recommend?((d.picks||[]).length?'희망 진행자가 어려우면 추천 원함':'행사에 맞는 진행자 추천 원함'):'')+'</dl>'+(d.message?'<p class="tla-msg">'+esc(d.message)+'</p>':'')+'</section>'
      +'<section><h3>진행자 배정 <small>체크한 진행자가 고객 견적·확정 안내문에 들어갑니다 · 연락처는 관리자만 봅니다</small></h3><div class="tla-tals">'+(top.length?top.map(tRow).join(''):'<p class="small muted">고객이 고른 진행자가 없습니다. 아래에서 맞는 분을 골라 배정하세요.</p>')+'</div>'
        +(rest.length?'<details class="tla-more"'+(top.length?'':' open')+'><summary>다른 진행자 '+rest.length+'명</summary><div class="tla-tals">'+rest.map(tRow).join('')+'</div></details>':'')
        +'<p class="tiny muted mt-1">‘확인 문의 복사’에는 행사 조건만 들어가고 고객 이름·연락처·회사명은 넣지 않습니다.</p></section>'
      +'<section><h3>견적 · 정산 <small>관리자만 봅니다</small></h3><div class="tla-grid">'
        +'<label>고객 견적 금액<input class="input" name="quote_amount" inputmode="numeric" value="'+(a.quote_amount!=null?esc(a.quote_amount):'')+'" placeholder="예: 880000"></label>'
        +'<label>진행자 출연료(지급)<input class="input" name="talent_fee" inputmode="numeric" value="'+(a.talent_fee!=null?esc(a.talent_fee):'')+'" placeholder="예: 600000"></label>'
        +'<label>부가세<select class="select" name="vat">'+Object.keys(S.opt.vat).map(function(k){ return '<option value="'+k+'"'+((a.vat||'excl')===k?' selected':'')+'>'+esc(S.opt.vat[k])+'</option>'; }).join('')+'</select></label>'
        +'<div class="tla-margin" id="tla-margin"></div></div>'
        +'<div class="tla-grid"><label>상태<select class="select" name="status">'+Object.keys(S.opt.status).map(function(k){ return '<option value="'+k+'"'+(x.status===k?' selected':'')+'>'+esc(S.opt.status[k])+'</option>'; }).join('')+'</select></label>'
        +'<label>행사일<input class="input" type="date" name="event_date" value="'+esc(x.event_date||'')+'"></label>'
        +'<label>연결 대관 문의·예약번호<input class="input" name="linked_ref" value="'+esc(a.linked_ref||d.inquiry_ref||'')+'" placeholder="MS-2611-AB12"></label></div>'
        +'<label class="tla-wide">운영 메모<textarea class="input" name="memo" rows="3" maxlength="2000">'+esc(a.memo||'')+'</textarea></label>'
        +'<div class="tla-save"><button class="btn btn-primary btn-sm" type="submit">저장</button><span class="small muted" id="tla-saved"></span></div></section>'
      +'<section><h3>고객 안내문</h3><div class="tla-tpl" role="group" aria-label="안내문 종류"><button type="button" class="chip" data-tpl="receipt">접수 확인</button><button type="button" class="chip" data-tpl="quote">견적 안내</button><button type="button" class="chip" data-tpl="confirm">섭외 확정</button></div>'
        +'<textarea class="input tla-out" id="tla-out" rows="8" aria-label="고객 안내문"></textarea><div class="tla-save"><button type="button" class="btn btn-light btn-sm" id="tla-copy">안내문 복사</button><a class="btn btn-kakao btn-sm" href="'+esc((M.CONFIG&&M.CONFIG.kakaoAdmin)||'https://center-pf.kakao.com/')+'" target="_blank" rel="noopener">카카오톡 채널 관리자 ↗</a><a class="btn btn-light btn-sm" id="tla-sms" href="#">고객에게 문자</a></div></section>'
      +'<section><h3>진행 기록</h3><ol class="tla-hist">'+((a.history||[]).slice().reverse().map(function(h){ return '<li><span>'+esc(String(h.at||'').slice(0,16))+'</span>'+esc(h.text)+'</li>'; }).join('')||'<li class="muted">기록 없음</li>')+'</ol></section>'
      +'</form>';
    var f=q('#tla-req');
    function margin(){ var qa_=digits(f.elements.quote_amount.value), tf=digits(f.elements.talent_fee.value), m=q('#tla-margin'); m.innerHTML=qa_&&tf?'남는 금액 <b>'+won(+qa_-+tf)+'</b>'+(+qa_?' <span class="muted">('+Math.round((+qa_-+tf)/+qa_*100)+'%)</span>':''):'<span class="muted">두 금액을 넣으면 남는 금액이 계산됩니다.</span>'; }
    ['quote_amount','talent_fee'].forEach(function(n){ f.elements[n].addEventListener('input',margin); }); margin();
    var tplKind=x.status==='confirmed'||x.status==='done'?'confirm':x.status==='quoted'?'quote':'receipt';
    function tpl(k){ tplKind=k; qa('[data-tpl]',f).forEach(function(b){ b.classList.toggle('on', b.dataset.tpl===k); }); var cur=Object.assign({},x,{admin:Object.assign({},x.admin,{assigned:qa('input[name="assigned"]:checked',f).map(function(i){ return i.value; }),quote_amount:digits(f.elements.quote_amount.value)?+digits(f.elements.quote_amount.value):null,vat:f.elements.vat.value})}); var txt=customerMsg(cur,k); q('#tla-out').value=txt; q('#tla-sms').href='sms:'+digits(x.phone)+'?body='+encodeURIComponent(txt); }
    qa('[data-tpl]',f).forEach(function(b){ b.addEventListener('click',function(){ tpl(b.dataset.tpl); }); }); tpl(tplKind);
    f.addEventListener('change',function(e){ if(e.target.name==='assigned'){ e.target.closest('.tla-tal').classList.toggle('on', e.target.checked); } if(['assigned','vat'].indexOf(e.target.name)>=0) tpl(tplKind); });
    f.elements.quote_amount.addEventListener('input',function(){ tpl(tplKind); });
    q('#tla-copy').addEventListener('click',function(){ copy(q('#tla-out').value,'안내문을 복사했습니다.'); });
    qa('[data-tmsg]',f).forEach(function(b){ b.addEventListener('click',function(){ copy(talentMsg(x, prof(b.dataset.tmsg)),'진행자 확인 문의를 복사했습니다.'); }); });
    f.querySelector('[data-close]').addEventListener('click',function(){ S.cur=''; qa('.tla-row').forEach(function(r){ r.classList.remove('on'); }); box.innerHTML='<div class="adm-card tla-empty"><p class="small muted">왼쪽 목록에서 요청을 고르면 내용이 여기에 열립니다.</p></div>'; });
    f.addEventListener('submit',function(e){ e.preventDefault();
      var body={ status:f.elements.status.value, event_date:f.elements.event_date.value, assigned:qa('input[name="assigned"]:checked',f).map(function(i){ return i.value; }), quote_amount:f.elements.quote_amount.value, talent_fee:f.elements.talent_fee.value, vat:f.elements.vat.value, linked_ref:f.elements.linked_ref.value, memo:f.elements.memo.value };
      X.A('/talent/requests/'+x.ref,{method:'PUT',body:body}).then(function(r){ say('저장했습니다.'); S.pending=x.ref; return loadRequests().then(function(){ if(!S.items.some(function(i){ return i.ref===x.ref; })) openReq(r.item); }); })
        .catch(function(er){ if(X.guard&&X.guard(er)) return; q('#tla-saved').textContent=er.message||'저장하지 못했습니다.'; });
    });
    if(window.matchMedia('(max-width:1179px)').matches) box.scrollIntoView({behavior:'smooth',block:'start'});
  }

  /* ---------- 직접 등록 (전화·카카오톡으로 받은 요청) ---------- */
  q('#tla-new').addEventListener('click',function(){
    var box=q('#tla-detail'), o=S.opt||{events:{},places:{},roles:{}}; S.cur='';
    var opts=function(m,blank){ return (blank?'<option value="">'+blank+'</option>':'')+Object.keys(m).map(function(k){ return '<option value="'+k+'">'+esc(m[k])+'</option>'; }).join(''); };
    box.innerHTML='<form class="adm-card tla-req" id="tla-add" novalidate><div class="tla-req-top"><b>섭외 요청 직접 등록</b><button type="button" class="btn btn-light btn-xs" data-close>닫기</button></div>'
      +'<div class="tla-grid"><label>이름 *<input class="input" name="name" maxlength="40" required></label><label>연락처 *<input class="input" type="tel" name="phone" maxlength="13" required></label><label>받은 경로<select class="select" name="channel"><option value="phone">전화</option><option value="kakao">카카오톡</option><option value="email">이메일</option><option value="visit">방문</option><option value="other">기타</option></select></label>'
      +'<label>행사일<input class="input" type="date" name="event_date"></label><label>시작<input class="input" type="time" name="start_t" step="1800"></label><label>끝<input class="input" type="time" name="end_t" step="1800"></label>'
      +'<label>장소<select class="select" name="place">'+opts(o.places)+'</select></label><label>장소 상세<input class="input" name="place_detail" maxlength="120"></label><label>인원<input class="input" name="headcount" inputmode="numeric"></label>'
      +'<label>행사 종류<select class="select" name="event_type">'+opts(o.events,'선택 안 함')+'</select></label><label>회사·단체<input class="input" name="org" maxlength="120"></label><label>희망 진행자<select class="select" name="pick"><option value="">추천 요청</option>'+S.profiles.filter(function(p){ return p.status==='published'; }).map(function(p){ return '<option value="'+esc(p.slug)+'">'+esc(p.name)+'</option>'; }).join('')+'</select></label></div>'
      +'<div class="tla-chks">'+Object.keys(o.roles).map(function(k){ return '<label><input type="checkbox" name="roles" value="'+k+'"> '+esc(o.roles[k])+'</label>'; }).join('')+'</div>'
      +'<label class="tla-wide">요청 내용<textarea class="input" name="message" rows="3" maxlength="2000"></textarea></label><label class="tla-wide">운영 메모<input class="input" name="memo" maxlength="1000"></label>'
      +'<div class="tla-save"><button class="btn btn-primary btn-sm" type="submit">등록</button><span class="small" id="tla-add-msg" style="color:var(--rust)"></span></div></form>';
    var f=q('#tla-add'); f.elements.place.value='tbd'; f.elements.name.focus();
    f.querySelector('[data-close]').addEventListener('click',function(){ box.innerHTML=''; });
    f.addEventListener('submit',function(e){ e.preventDefault(); var g=function(n){ return f.elements[n].value.trim(); };
      var b={ name:g('name'), phone:g('phone'), channel:g('channel'), event_date:g('event_date'), date_tbd:!g('event_date'), start_t:g('start_t'), end_t:g('end_t'), place:g('place'), place_detail:g('place_detail'), headcount:g('headcount'), event_type:g('event_type'), org:g('org'),
        picks:g('pick')?[g('pick')]:[], roles:qa('input[name="roles"]:checked',f).map(function(i){ return i.value; }), message:g('message'), memo:g('memo') };
      X.A('/talent/requests',{method:'POST',body:b}).then(function(r){ say('등록했습니다. '+r.ref); S.status='open'; S.pending=r.ref; loadRequests(); }).catch(function(er){ if(X.guard&&X.guard(er)) return; q('#tla-add-msg').textContent=er.message||'등록하지 못했습니다.'; });
    });
  });

  /* ---------- CSV ---------- */
  q('#tla-csv').addEventListener('click',function(){
    var head=['접수번호','상태','접수 시각','이름','연락처','이메일','회사·단체','행사일','시간','장소','인원','행사 종류','필요한 진행','외국어','희망 진행자','배정 진행자','고객 견적','진행자 출연료','부가세','요청 내용','운영 메모'];
    var rows=S.items.map(function(x){ var d=x.data||{}, a=x.admin||{}; return [x.ref,x.status_label,x.created_at,x.name,x.phone,x.email,d.org,x.event_date||'',(d.start_t||'')+(d.end_t?'~'+d.end_t:''),placeText(d),d.headcount||'',L('events',d.event_type),(d.roles||[]).map(function(r){ return L('roles',r); }).join(' '),(d.langs||[]).map(function(r){ return L('langs',r); }).join(' '),x.picks_label.join(' '),x.assigned_label.join(' '),a.quote_amount==null?'':a.quote_amount,a.talent_fee==null?'':a.talent_fee,L('vat',a.vat||'excl'),d.message||'',a.memo||'']; });
    var csv='﻿'+[head].concat(rows).map(function(r){ return r.map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(','); }).join('\r\n');
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='megaspot-mc-requests-'+new Date().toISOString().slice(0,10)+'.csv'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  });

  /* ---------- 진행자 프로필 ---------- */
  function drawProfiles(){
    var box=q('#tla-profiles'), c={published:0,draft:0,hidden:0}; S.profiles.forEach(function(p){ c[p.status]=(c[p.status]||0)+1; });
    q('#tla-prof-st').textContent='공개 '+c.published+'명 · 준비 중 '+c.draft+'명 · 숨김 '+c.hidden+'명 · 관리자 전용 칸(연락처·출연료)은 홈페이지에 나가지 않습니다.';
    box.innerHTML=S.profiles.map(function(p){ var v=p.private||{};
      return '<article class="adm-card tla-pc tla-pc-'+esc(p.status)+'">'+(p.photo?'<img src="'+esc(p.photo.small||p.photo.src)+'" alt="">':'<div class="tla-pc-noimg"></div>')
        +'<div class="tla-pc-bd"><div>'+pill(p.status,p.status_label)+' <span class="tiny muted">순서 '+esc(p.sort)+'</span></div><h3>'+esc(p.name)+' <small>'+esc(p.title)+'</small></h3>'
        +'<p class="tla-pc-c">'+(v.phone?'☎ '+esc(v.phone):'<span class="tla-warn">연락처 미입력</span>')+(v.email?' · '+esc(v.email):'')+'</p>'
        +'<div class="tla-tal-acts"><button type="button" class="btn btn-light btn-xs" data-pedit="'+esc(p.slug)+'">고치기</button>'+(p.status==='published'?'<a class="btn btn-light btn-xs" href="/mc/view/?id='+esc(p.slug)+'" target="_blank" rel="noopener">화면 보기 ↗</a>':'')+'</div></div></article>'; }).join('')||'<div class="adm-card"><p class="small muted">진행자가 없습니다.</p></div>';
    qa('[data-pedit]',box).forEach(function(b){ b.addEventListener('click',function(){ editProfile(prof(b.dataset.pedit)); }); });
  }
  var linesOf=function(a){ return (a||[]).join('\n'); };
  var pairs=function(a,k1,k2){ return (a||[]).map(function(x){ return x[k1]+(x[k2]?' | '+x[k2]:''); }).join('\n'); };
  var unpairs=function(s,k1,k2){ return String(s||'').split('\n').map(function(l){ var i=l.indexOf('|'), o={}; o[k1]=(i<0?l:l.slice(0,i)).trim(); o[k2]=(i<0?'':l.slice(i+1)).trim(); return o; }).filter(function(o){ return o[k1]; }); };
  function careerText(c){ return (c||[]).map(function(s){ return '## '+s.h+'\n'+s.items.join('\n'); }).join('\n\n'); }
  function careerParse(t){ var out=[], cur=null; String(t||'').split('\n').forEach(function(l){ l=l.trim(); if(!l) return; if(/^#{1,3}\s*/.test(l)){ cur={h:l.replace(/^#{1,3}\s*/,''),items:[]}; out.push(cur); } else { if(!cur){ cur={h:'대표 진행 이력',items:[]}; out.push(cur); } cur.items.push(l.replace(/^[-·•]\s*/,'')); } }); return out; }
  function checks(name,map,cur){ return Object.keys(map||{}).map(function(k){ return '<label><input type="checkbox" name="'+name+'" value="'+k+'"'+((cur||[]).indexOf(k)>=0?' checked':'')+'> '+esc(map[k])+'</label>'; }).join(''); }
  function editProfile(p){
    var isNew=!p; p=p||{status:'draft',status_label:'새 진행자',raw:{},private:{},sort:100};
    var r=p.raw||{}, v=p.private||{}, o=S.popt||{roles:{},langs:{},events:{}}, box=q('#tla-editor');
    box.innerHTML='<form class="adm-card tla-pf" id="tla-pf" novalidate><div class="tla-req-top"><h2 class="h-s">'+(isNew?'새 진행자':esc(r.name||p.name)+' '+pill(p.status,p.status_label))+'</h2><button type="button" class="btn btn-light btn-xs" data-close>닫기</button></div>'
      +'<fieldset class="tla-fs"><legend>홈페이지에 보이는 정보</legend><div class="tla-grid">'
        +'<label>이름 *<input class="input" name="name" maxlength="20" value="'+esc(r.name||'')+'"></label>'
        +'<label>주소용 영문 이름 *<input class="input" name="slug" maxlength="40" value="'+esc(p.slug||'')+'" placeholder="hong-gildong"'+(isNew?'':' readonly')+'><small>/mc/view/?id=이 이름 · 만든 뒤에는 바꿀 수 없습니다</small></label>'
        +'<label>목록 순서<input class="input" name="sort" inputmode="numeric" value="'+esc(p.sort)+'"><small>작을수록 앞</small></label>'
        +'<label class="tla-wide">직함 *<input class="input" name="title" maxlength="40" value="'+esc(r.title||'')+'" placeholder="예: 아나운서 · 행사 MC"></label>'
        +'<label class="tla-wide">한 줄 소개 *<input class="input" name="headline" maxlength="60" value="'+esc(r.headline||'')+'"></label></div>'
        +'<div class="tla-chk-g"><b>진행 분야 *</b><div class="tla-chks">'+checks('roles',o.roles,r.roles)+'</div></div>'
        +'<div class="tla-chk-g"><b>외국어 진행</b><div class="tla-chks">'+checks('langs',o.langs,r.langs)+'</div></div>'
        +'<div class="tla-chk-g"><b>잘 맞는 행사</b><div class="tla-chks">'+checks('events',o.events,r.events)+'</div></div>'
        +'<label class="tla-wide">소개 <small>문단은 줄을 바꿔 나눕니다</small><textarea class="input" name="intro" rows="5" maxlength="1500">'+esc(r.intro||'')+'</textarea></label>'
        +'<div class="tla-grid2"><label>핵심 숫자 <small>한 줄에 하나 · 값 | 설명 · 3개까지 카드에 보임</small><textarea class="input" name="stats" rows="4">'+esc(pairs(r.stats,'v','k'))+'</textarea></label>'
        +'<label>강점 <small>한 줄에 하나 · 제목 | 설명</small><textarea class="input" name="strengths" rows="4">'+esc(pairs(r.strengths,'t','d'))+'</textarea></label>'
        +'<label>주요 활동 <small>한 줄에 하나</small><textarea class="input" name="brief" rows="5">'+esc(linesOf(r.brief))+'</textarea></label>'
        +'<label>학력 · 자격 <small>한 줄에 하나</small><textarea class="input" name="quals" rows="5">'+esc(linesOf(r.quals))+'</textarea></label></div>'
        +'<label class="tla-wide">대표 진행 이력 <small>‘## 묶음 이름’ 다음 줄부터 한 줄에 행사 하나</small><textarea class="input" name="career" rows="10">'+esc(careerText(r.career))+'</textarea></label>'
        +'<div class="tla-grid2"><label>함께한 기관 · 기업 <small>한 줄에 하나</small><textarea class="input" name="clients" rows="4">'+esc(linesOf(r.clients))+'</textarea></label>'
        +'<label>행사 담당자 한마디 <small>실제로 받은 말만 · 말 | 누가</small><textarea class="input" name="quotes" rows="4">'+esc(pairs(r.quotes,'q','by'))+'</textarea></label></div>'
        +'<div class="tla-photo"><div class="tla-photo-prev" id="tla-ph-prev">'+(r.photo?'<img src="'+esc(r.photo)+'" alt="">':'')+'</div><div class="tla-grow"><label>대표 사진 * <small>세로 4:5 비율이 가장 잘 맞습니다</small><input class="input" name="photo" value="'+esc(r.photo||'')+'" placeholder="/assets/img/… 또는 사진 올리기"></label>'
        +'<label class="btn btn-light btn-sm tla-up">사진 올리기<input type="file" accept="image/jpeg,image/png,image/webp" data-up="photo" hidden></label></div></div>'
        +'<label class="tla-wide">현장 사진 <small>한 줄에 하나 · 주소 | 설명 · 최대 12장</small><textarea class="input" name="photos" rows="4">'+esc((r.photos||[]).map(function(x){ return x.src+(x.alt?' | '+x.alt:''); }).join('\n'))+'</textarea></label>'
        +'<label class="btn btn-light btn-sm tla-up">현장 사진 올리기<input type="file" accept="image/jpeg,image/png,image/webp" data-up="photos" multiple hidden></label>'
        +'<div class="tla-grid"><label>출연료 안내 시작가 <small>비우면 ‘상담 후 견적’</small><input class="input" name="price_from" inputmode="numeric" value="'+esc(r.price_from||'')+'" placeholder="예: 500000"></label><label class="tla-span2">출연료 안내 문구 <small>선택</small><input class="input" name="price_note" maxlength="120" value="'+esc(r.price_note||'')+'" placeholder="예: 2시간 기준 · 서울 외 지역은 이동비 별도"></label></div>'
      +'</fieldset>'
      +'<fieldset class="tla-fs tla-private"><legend>관리자 전용 <span>고객에게 보이지 않습니다</span></legend><div class="tla-grid">'
        +'<label>휴대폰<input class="input" type="tel" name="p_phone" value="'+esc(v.phone||'')+'"></label><label>다른 연락처<input class="input" name="p_phone2" value="'+esc(v.phone2||'')+'"></label><label>이메일<input class="input" name="p_email" value="'+esc(v.email||'')+'"></label>'
        +'<label>카카오톡 ID<input class="input" name="p_kakao" value="'+esc(v.kakao||'')+'"></label><label class="tla-span2">소속 · 매니저<input class="input" name="p_agency" value="'+esc(v.agency||'')+'"></label></div>'
        +'<div class="tla-grid2"><label>출연료 기준 <small>요청 상세에 함께 보입니다</small><textarea class="input" name="p_fee_basis" rows="3">'+esc(v.fee_basis||'')+'</textarea></label><label>정산 정보 메모 <small>지급 방법·세금계산서·원천징수 여부 등</small><textarea class="input" name="p_settle" rows="3">'+esc(v.settle||'')+'</textarea></label></div>'
        +'<label class="tla-wide">운영 메모<textarea class="input" name="p_memo" rows="2">'+esc(v.memo||'')+'</textarea></label></fieldset>'
      +'<p class="small" id="tla-pf-msg" hidden></p><div class="tla-save"><button class="btn btn-primary btn-sm" type="submit">저장</button>'
      +(!isNew&&p.status!=='published'?'<button type="button" class="btn btn-dark btn-sm" data-pst="published">공개하기</button>':'')
      +(p.status==='published'?'<button type="button" class="btn btn-light btn-sm" data-pst="hidden">숨기기</button>':'')+(p.status==='hidden'?'<button type="button" class="btn btn-light btn-sm" data-pst="draft">준비 중으로</button>':'')
      +(!isNew&&p.status==='draft'&&!p.published_at?'<button type="button" class="btn btn-light btn-sm" data-pdel>지우기</button>':'')+(p.status==='published'?'<a class="btn btn-light btn-sm" href="/mc/view/?id='+esc(p.slug)+'" target="_blank" rel="noopener">화면 보기 ↗</a>':'')+'</div></form>';
    box.scrollIntoView({behavior:'smooth',block:'start'});
    var f=q('#tla-pf'), msg=q('#tla-pf-msg');
    function show(t,ok){ msg.textContent=t; msg.hidden=false; msg.style.color=ok?'var(--ok)':'var(--rust)'; }
    function g(n){ return f.elements[n]?f.elements[n].value:''; }
    function all(n){ return qa('input[name="'+n+'"]:checked',f).map(function(i){ return i.value; }); }
    f.elements.photo.addEventListener('input',function(){ q('#tla-ph-prev').innerHTML=this.value?'<img src="'+esc(this.value)+'" alt="">':''; });
    function payload(){
      return { slug:g('slug').trim().toLowerCase(), sort:g('sort'), data:{ name:g('name'), title:g('title'), headline:g('headline'), intro:g('intro'), roles:all('roles'), langs:all('langs'), events:all('events'),
        stats:unpairs(g('stats'),'v','k'), strengths:unpairs(g('strengths'),'t','d'), brief:g('brief').split('\n'), quals:g('quals').split('\n'), career:careerParse(g('career')), clients:g('clients').split('\n'), quotes:unpairs(g('quotes'),'q','by'),
        photo:g('photo').trim(), photos:unpairs(g('photos'),'src','alt').map(function(x){ var same=(r.photos||[]).filter(function(o){ return o.src===x.src; })[0]; return same&&same.thumb?{src:x.src,thumb:same.thumb,alt:x.alt}:x; }), price_from:g('price_from'), price_note:g('price_note') },
        private:{ phone:g('p_phone'), phone2:g('p_phone2'), email:g('p_email'), kakao:g('p_kakao'), agency:g('p_agency'), fee_basis:g('p_fee_basis'), settle:g('p_settle'), memo:g('p_memo') } };
    }
    function save(){ var b=payload(); return (isNew?X.A('/talent/profiles',{method:'POST',body:b}):X.A('/talent/profiles/'+p.slug,{method:'PUT',body:b})).then(function(){ return b.slug||p.slug; }); }
    function reopen(slug){ return loadProfiles().then(function(){ editProfile(prof(slug)); }); }
    f.addEventListener('submit',function(e){ e.preventDefault(); save().then(function(slug){ say('저장했습니다.'); return reopen(slug); }).catch(function(er){ if(X.guard&&X.guard(er)) return; show(er.message||'저장하지 못했습니다.'); }); });
    qa('[data-pst]',f).forEach(function(b){ b.addEventListener('click',function(){ var st=b.dataset.pst; if(st==='published'&&!confirm('홈페이지 진행자 목록에 공개할까요?')) return;
      save().then(function(slug){ return X.A('/talent/profiles/'+slug+'/status',{method:'POST',body:{status:st}}).then(function(){ say(st==='published'?'공개했습니다.':st==='hidden'?'숨겼습니다.':'준비 중으로 바꿨습니다.'); return reopen(slug); }); })
        .catch(function(er){ if(X.guard&&X.guard(er)) return; show(er.message||'바꾸지 못했습니다.'); }); }); });
    var del=f.querySelector('[data-pdel]'); if(del) del.addEventListener('click',function(){ if(!confirm('이 진행자 프로필을 지울까요? 되돌릴 수 없습니다.')) return; X.A('/talent/profiles/'+p.slug,{method:'DELETE'}).then(function(){ box.innerHTML=''; say('지웠습니다.'); loadProfiles(); }).catch(function(er){ show(er.message); }); });
    f.querySelector('[data-close]').addEventListener('click',function(){ box.innerHTML=''; });
    qa('[data-up]',f).forEach(function(inp){ inp.addEventListener('change',function(){ var files=Array.prototype.slice.call(inp.files||[]); if(!files.length) return; show('사진을 올리는 중…',true);
      files.reduce(function(pr,file){ return pr.then(function(){ return upload(file).then(function(r){ if(inp.dataset.up==='photo'){ f.elements.photo.value=r.src; q('#tla-ph-prev').innerHTML='<img src="'+esc(r.src)+'" alt="">'; } else { var t=f.elements.photos; t.value=(t.value.trim()?t.value.trim()+'\n':'')+r.src+' | '; } }); }); },Promise.resolve())
        .then(function(){ show('사진을 올렸습니다. 저장을 눌러야 프로필에 반영됩니다.',true); inp.value=''; }).catch(function(er){ show((er&&er.message)||'사진을 올리지 못했습니다.'); inp.value=''; }); }); });
  }
  // 브라우저에서 사진을 줄여(긴 변 1600px, 작은 사진 640px) 올립니다 — 사진 속 위치 정보 등은 지워집니다
  function shrink(img, max, quality){ var s=Math.min(1, max/Math.max(img.width,img.height)), c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); return { b64:c.toDataURL('image/jpeg',quality).split(',')[1], w:c.width, h:c.height }; }
  function upload(file){
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error('JPG·PNG·WebP 사진만 올릴 수 있습니다.'));
    return new Promise(function(res,rej){ var u=URL.createObjectURL(file), img=new Image(); img.onload=function(){ URL.revokeObjectURL(u); res(img); }; img.onerror=function(){ URL.revokeObjectURL(u); rej(new Error('사진을 읽지 못했습니다.')); }; img.src=u; })
      .then(function(img){ var big=shrink(img,1600,.86); if(big.b64.length>800000) big=shrink(img,1280,.8); var th=shrink(img,640,.8); return X.A('/talent/photos',{method:'POST',body:{body:big.b64,thumb:th.b64,w:big.w,h:big.h}}); });
  }
  q('#tla-pnew').addEventListener('click',function(){ editProfile(null); });

  /* ---------- 오늘 할 일 카드 · 메뉴 숫자 ---------- */
  function dashCard(){
    return X.A('/talent/summary').then(function(r){
      var c=r.counts||{}; X.setCount('talent', c.new||0);
      var anchor=document.getElementById('dash-visits'), host=anchor&&anchor.closest('.adm-card'); if(!host) return;
      var card=document.getElementById('dash-talent');
      if(!card){ card=document.createElement('div'); card.className='adm-card mt-3'; card.id='dash-talent'; host.parentNode.insertBefore(card, host); }
      var open=r.open||[]; card.hidden=!open.length;
      card.innerHTML='<h2 class="row between" style="gap:8px;flex-wrap:wrap"><span>MC·강사 섭외 요청 <small>접수 '+(c.new||0)+' · 일정 확인 '+(c.checking||0)+' · 견적 안내 '+(c.quoted||0)+'</small></span><button class="btn btn-light btn-xs" type="button" data-go="talent">섭외 요청 전체 →</button></h2><div class="adm-list">'
        +open.map(function(x){ var d=x.data||{}; return '<div class="adm-row tla-dash" data-tr-dash="'+esc(x.ref)+'" tabindex="0" role="button"><div class="r1">'+pill(x.status,x.status_label)+'<b>'+esc(x.name)+'</b><span class="small muted">'+esc(X.ago(x.created_at))+'</span></div><div class="r3 small">'+esc(when(x))+' · '+esc(placeText(d))+((x.picks_label||[]).length?' · 희망 '+esc(x.picks_label.join(', ')):'')+'</div></div>'; }).join('')+'</div>';
      Array.prototype.forEach.call(card.querySelectorAll('[data-tr-dash]'),function(r){ var go=function(){ S.pending=r.getAttribute('data-tr-dash'); S.status='open'; X.go('talent'); }; r.addEventListener('click',go); r.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); go(); } }); });
    }).catch(function(){});
  }
  X.register('dash', dashCard);
  X.register('talent', function(){ tab(S.tab); return load(); });
  if(X.visible()) dashCard();
})();
