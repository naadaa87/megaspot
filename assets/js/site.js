/* =====================================================================
   MEGASPOT · 공통 스크립트
   - 사이트 설정(연락처 등)은 아래 CONFIG 한 곳에서 바꿉니다.
   - API가 연결되지 않은 상태(배포 직후, D1 미연결)에서도 페이지가
     동작하도록 '체험 모드'로 자동 전환합니다.
   ===================================================================== */
(function(){
  'use strict';

  var CONFIG = {
    siteName: '메가스팟',
    siteNameEn: 'MEGASPOT',
    tagline: '큰 모임에 맞는 공간을 찾다',
    description: '인원과 목적에 맞는 대형 공간을 비교하고 문의하는 예약 플랫폼',
    phone: '010-2384-9580',          // 대표 상담 번호 — 공개 전 확인
    email: 'spaceblank0100@gmail.com', // 대표 이메일 — 공개 전 확인
    kakaoChannel: 'https://pf.kakao.com/_LnxbmX/chat', // 카카오톡 문의 채널 — 비우면 카카오톡 버튼·링크 숨김
    kakaoNote: '메가스팟 전용 카카오톡 채널로 1:1 채팅이 바로 열립니다.',
    // ※ 채널 주소를 바꾸면 QR 이미지(/assets/img/brand/kakao-qr.svg)도 새 주소로 다시 만들어 교체해야 합니다.
    hours: '평일 10:00–19:00 (주말·공휴일 문의는 다음 영업일 순차 답변)',
    operatorName: '메가스팟 운영팀',
    companyName: '주식회사 블랭크',     // 사업자 상호 (사업자등록증과 같게)
    bizNo: '161-86-03494',            // 사업자등록번호
    ceo: '최시준',                     // 대표자
    bizAddress: '서울특별시 강남구 영동대로 602, 6층 제트71(삼성동, 삼성동 미켈란 107)',   // 사업장 주소 (사업자등록증)
    mailOrderNo: '',                  // 통신판매업 신고번호 — 신고가 끝나면 '제2026-서울강남-0000호' 처럼 넣어 주세요. 비워 두면 푸터·판매자 정보에 아예 표시하지 않습니다
    venueAddress: '서울 광진구 화양동 10-1, 한아름건물 2층',
    apiBase: '/api'
  };

  var $  = function(sel, root){ return (root||document).querySelector(sel); };
  var $$ = function(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); };

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function fmtDate(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
  function fmtKDate(iso){ if(!iso) return ''; var p=iso.split('-'); if(p.length<3) return iso; var d=new Date(+p[0],+p[1]-1,+p[2]); var dow=['일','월','화','수','목','금','토'][d.getDay()]; return +p[1]+'월 '+ +p[2]+'일 ('+dow+')'; }
  function fmtNum(n){ return Number(n||0).toLocaleString('ko-KR'); }

  /* ---------- toast ---------- */
  var toastEl, toastTimer;
  function toast(msg){
    if(!toastEl){ toastEl=document.createElement('div'); toastEl.className='toast'; toastEl.setAttribute('role','status'); document.body.appendChild(toastEl); }
    toastEl.textContent=msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(function(){ toastEl.classList.remove('show'); }, 3200);
  }

  /* ---------- API client (체험 모드 자동 전환) ---------- */
  var demo = { checked:false, on:false };
  function api(path, opts){
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { 'Accept':'application/json' } };
    if(opts.body){ init.headers['Content-Type']='application/json'; init.body = JSON.stringify(opts.body); }
    if(opts.adminKey){ init.headers['X-Admin-Key'] = opts.adminKey; }
    return fetch(CONFIG.apiBase + path, init).then(function(r){
      var ct = r.headers.get('content-type')||'';
      if(ct.indexOf('application/json')<0){ var e=new Error('no-api'); e.code='NO_API'; e.status=r.status; throw e; }
      return r.json().then(function(j){ if(!r.ok){ var e=new Error(j.error||'요청을 처리하지 못했습니다.'); e.code=(j.code==='NO_DB'?'NO_API':(j.code||'ERR')); e.status=r.status; e.detail=j; throw e; } return j; });
    }).catch(function(e){ if(e.code!=='NO_API' && !(e instanceof TypeError)) throw e; var ne=new Error('no-api'); ne.code='NO_API'; throw ne; });
  }
  function checkApi(){
    if(demo.checked) return Promise.resolve(!demo.on);
    return api('/health').then(function(j){ demo.checked=true; demo.on=!(j&&j.ok&&j.db); return !demo.on; }).catch(function(){ demo.checked=true; demo.on=true; return false; });
  }

  /* ---------- 회원 (로그인 상태 표시) ---------- */
  // ms_in 쿠키는 화면 표시용입니다. 실제 로그인 확인은 서버(/api/auth/me)가 HttpOnly 쿠키로 합니다.
  var account = {
    loggedIn: function(){ return /(?:^|;\s*)ms_in=1/.test(document.cookie); },
    _me: null,
    me: function(){
      if(!account.loggedIn()) return Promise.resolve(null);
      if(!account._me) account._me = api('/auth/me').then(function(j){ return j.member||null; }).catch(function(){ return null; });
      return account._me;
    },
    logout: function(){ return api('/auth/logout',{method:'POST', body:{}}).catch(function(){}).then(function(){ document.cookie='ms_in=; Max-Age=0; Path=/'; account._me=null; }); }
  };
  function initAccount(){
    var on=account.loggedIn();
    $$('[data-account]').forEach(function(a){ a.href = on ? '/mypage/' : '/login/'; a.textContent = on ? '마이페이지' : (a.getAttribute('data-account')==='full'?'로그인 · 회원가입':'로그인'); });
  }

  /* ---------- header / nav ---------- */
  function initHeader(){
    var btn=$('.menu-btn'), nav=$('.mobile-nav');
    if(btn&&nav){
      var setMenu=function(open){ nav.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', open?'메뉴 닫기':'메뉴 열기'); document.body.style.overflow = open?'hidden':''; document.body.classList.toggle('menu-open', open); if(open){ var first=nav.querySelector('a'); if(first) first.focus({preventScroll:true}); } };
      btn.addEventListener('click', function(){ setMenu(!nav.classList.contains('open')); });
      nav.addEventListener('click', function(e){ if(e.target.closest('a')) setMenu(false); });
      document.addEventListener('keydown', function(e){ if(e.key==='Escape' && nav.classList.contains('open')){ setMenu(false); btn.focus(); } });
      window.matchMedia('(min-width:1280px)').addEventListener('change', function(e){ if(e.matches) setMenu(false); });
    }
    // current page marking
    var path=location.pathname.replace(/index\.html$/,'');
    ['.nav','.mobile-nav'].forEach(function(sel){
      var best=null, bestLen=-1;
      $$(sel+' a').forEach(function(a){
        var href=(a.getAttribute('href')||'').replace(/index\.html$/,''); if(!href||href.charAt(0)==='#'||href==='/') return;
        if(path.indexOf(href)===0 && href.length>bestLen){ best=a; bestLen=href.length; }
      });
      if(best){ best.setAttribute('aria-current','page'); var grp=best.closest('.nav-group, .mnav-sec'); if(grp) grp.classList.add('has-current'); }
    });
    // 드롭다운 메뉴: Esc 로 닫기 (마우스를 올리거나 Tab 으로 들어가면 열립니다)
    $$('.nav-group').forEach(function(g){ g.addEventListener('keydown', function(e){ if(e.key==='Escape'){ var t=$('.nav-top',g); g.classList.add('closed'); if(t) t.focus(); } }); g.addEventListener('mouseleave', function(){ g.classList.remove('closed'); }); g.addEventListener('focusout', function(e){ if(!g.contains(e.relatedTarget)) g.classList.remove('closed'); }); });
    // contact placeholders
    $$('[data-phone]').forEach(function(el){ el.textContent=CONFIG.phone; if(el.tagName==='A') el.href='tel:'+CONFIG.phone.replace(/-/g,''); });
    $$('[data-email]').forEach(function(el){ el.textContent=CONFIG.email; if(el.tagName==='A') el.href='mailto:'+CONFIG.email; });
    $$('[data-hours]').forEach(function(el){ el.textContent=CONFIG.hours; });
    $$('[data-kakao]').forEach(function(el){ if(CONFIG.kakaoChannel){ el.href=CONFIG.kakaoChannel; el.hidden=false; } else { el.hidden=true; } });
    $$('[data-kakao-url]').forEach(function(el){ if(CONFIG.kakaoChannel) el.textContent=CONFIG.kakaoChannel.replace(/^https?:\/\//,''); });
    $$('[data-kakao-note]').forEach(function(el){ if(CONFIG.kakaoNote) el.textContent=CONFIG.kakaoNote; el.hidden=!CONFIG.kakaoChannel; });
    $$('[data-mailorder]').forEach(function(el){ if(CONFIG.mailOrderNo) el.textContent=CONFIG.mailOrderNo; }); $$('[data-mailorder-line]').forEach(function(el){ el.hidden=!CONFIG.mailOrderNo; });
    $$('[data-company]').forEach(function(el){ el.remove(); });   // 사업자 정보는 바로 위 .footer-biz 에 있어 중복 표시하지 않습니다
    $$('[data-year]').forEach(function(el){ el.textContent=new Date().getFullYear(); });
  }

  /* ---------- subnav scrollspy ---------- */
  function initSubnav(){
    var nav=$('.subnav'); if(!nav) return;
    var links=$$('a[href^="#"]:not(.btn)', nav); var map={};
    links.forEach(function(a){ var id=a.getAttribute('href').slice(1); var sec=document.getElementById(id); if(sec) map[id]={a:a,sec:sec}; });
    function spy(){
      var y=window.scrollY + 160, cur=null;
      Object.keys(map).forEach(function(id){ if(map[id].sec.offsetTop<=y) cur=id; });
      links.forEach(function(a){ a.classList.toggle('on', cur && a.getAttribute('href')==='#'+cur); });
      if(cur && map[cur]){ var a=map[cur].a; var box=nav.querySelector('.container'); if(box){ var r=a.getBoundingClientRect(), br=box.getBoundingClientRect(); if(r.left<br.left||r.right>br.right) box.scrollTo({left:a.offsetLeft-20, behavior:'smooth'}); } }
    }
    window.addEventListener('scroll', spy, {passive:true}); spy();
  }

  /* ---------- lightbox ---------- */
  var LB = { el:null, items:[], i:0 };
  function ensureLB(){
    if(LB.el) return;
    var el=document.createElement('div'); el.className='lightbox'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); el.setAttribute('aria-label','사진 크게 보기');
    el.innerHTML='<div class="lb-top"><span class="lb-counter"></span><button class="lb-close" aria-label="닫기">×</button></div><div class="lb-stage"><button class="lb-arrow prev" aria-label="이전 사진">‹</button><img alt=""><button class="lb-arrow next" aria-label="다음 사진">›</button></div><div class="lb-cap"><em class="lb-tag" hidden></em><b></b><span></span></div>';
    document.body.appendChild(el); LB.el=el;
    $('.lb-close',el).addEventListener('click', closeLB);
    $('.lb-arrow.prev',el).addEventListener('click', function(){ showLB(LB.i-1); });
    $('.lb-arrow.next',el).addEventListener('click', function(){ showLB(LB.i+1); });
    el.addEventListener('click', function(e){ if(e.target===el||e.target.classList.contains('lb-stage')) closeLB(); });
    document.addEventListener('keydown', function(e){ if(!el.classList.contains('open')) return; if(e.key==='Escape') closeLB(); if(e.key==='ArrowLeft') showLB(LB.i-1); if(e.key==='ArrowRight') showLB(LB.i+1);
      if(e.key==='Tab'){ var fo=$$('button',el); if(!fo.length) return; var first=fo[0], last=fo[fo.length-1]; if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); } else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); } else if(!el.contains(document.activeElement)){ e.preventDefault(); first.focus(); } } });
    var sx=null; el.addEventListener('touchstart', function(e){ sx=e.touches[0].clientX; },{passive:true}); el.addEventListener('touchend', function(e){ if(sx==null) return; var dx=e.changedTouches[0].clientX-sx; if(Math.abs(dx)>50) showLB(LB.i+(dx<0?1:-1)); sx=null; });
  }
  function openLB(items, i){ ensureLB(); LB.items=items; LB.returnTo=document.activeElement; showLB(i||0); LB.el.classList.add('open'); document.body.style.overflow='hidden'; setTimeout(function(){ $('.lb-close',LB.el).focus(); }, 30); }
  function closeLB(){ if(!LB.el) return; LB.el.classList.remove('open'); document.body.style.overflow=''; if(LB.returnTo && LB.returnTo.focus){ try{ LB.returnTo.focus({preventScroll:true}); }catch(_){} } }
  function showLB(i){ var n=LB.items.length; if(!n) return; LB.i=(i+n)%n; var it=LB.items[LB.i]; var img=$('img',LB.el); img.src=it.src; img.alt=it.title||''; $('.lb-counter',LB.el).textContent=pad2(LB.i+1)+' / '+pad2(n); var tg=$('.lb-tag',LB.el); tg.textContent=it.tag||''; tg.hidden=!it.tag; tg.className='lb-tag'; $('.lb-cap b',LB.el).textContent=it.title||''; $('.lb-cap span',LB.el).textContent=it.cap||''; }

  /* ---------- 사진 경로 ---------- */
  var SPACE_DIR={ 'megaspot-gundae':'gundae', 'megaspot-gundae-2':'gundae2' };
  function photoSrc(spaceId, pid, thumb){ return '/assets/img/'+ (SPACE_DIR[spaceId]||spaceId) +'/'+(thumb?'t/':'')+pid+'.jpg'; }
  // 이미지 id 첫 글자로 종류를 구분합니다. size: '' | 'm' | 't'
  //  p: 1호 공간 사진 · s: 활용 장면 · v: 1호 공간 전경 · a: 1호 조감도 · r: 2호 완공 예상 이미지 (화면에는 이미지 종류 표시를 붙이지 않습니다)
  var IMG_DIR={ p:'gundae', s:'scenes', v:'views', a:'aerial', r:'gundae2' };
  function kind(id){ var c=String(id).charAt(0); return IMG_DIR[c] ? c : 'p'; }
  function imgSrc(id, size){ var sub=size?size+'/':''; return '/assets/img/'+IMG_DIR[kind(id)]+'/'+sub+id+'.jpg'; }
  function isStaged(id){ if(kind(id)!=='s') return false; var sc=window.MEGASPOT_SCENE && window.MEGASPOT_SCENE(id); return !sc || sc.staged!==false; }
  function isCG(id){ var k=kind(id); return k==='v' || k==='a' || k==='r'; }
  function imgTag(id){ return ''; }
  function tagClass(id){ return isStaged(id) ? 'staged' : isCG(id) ? 'cg' : ''; }
  function tagHtml(id, extra){ return ''; }
  // id로 이미지 정보(제목·설명) 찾기
  function visual(id){
    var k=kind(id), find=function(list){ return (list||[]).filter(function(x){ return x.id===id; })[0]; };
    if(k==='s') return window.MEGASPOT_SCENE ? window.MEGASPOT_SCENE(id) : null;
    if(k==='v') return find(window.MEGASPOT_VIEWS);
    if(k==='a') return find(window.MEGASPOT_AERIALS);
    var sp=window.MEGASPOT_GET_SPACE && window.MEGASPOT_GET_SPACE(k==='r' ? 'megaspot-gundae-2' : 'megaspot-gundae'); return sp ? find(sp.photos) : null;
  }
  // 이미지 목록({id,title,cap}) → 라이트박스 항목
  function sceneItems(list){ return (list||[]).map(function(s){ return { src:imgSrc(s.id), title:s.title, cap:s.cap, tag:imgTag(s.id) }; }); }

  /* ---------- 문의번호 (체험 모드용) ---------- */
  function localRef(prefix){ var d=new Date(); var r=Math.random().toString(36).slice(2,6).toUpperCase(); return (prefix||'MS')+'-'+String(d.getFullYear()).slice(2)+pad2(d.getMonth()+1)+'-'+r; }

  /* ---------- 폼 검증 ---------- */
  function validate(form){
    var ok=true, first=null;
    $$('[required]', form).forEach(function(el){
      if(el.disabled || el.closest('[hidden]')){ el.classList.remove('invalid'); return; } // 숨긴 칸은 검사하지 않음
      var bad=false;
      if(el.type==='checkbox') bad=!el.checked; else bad=!String(el.value||'').trim();
      if(el.type==='tel' && !bad){ var v=el.value.replace(/[^0-9]/g,''); if(v.length<9||v.length>11) bad=true; }
      if(el.type==='email' && !bad){ if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value)) bad=true; }
      el.classList.toggle('invalid', bad);
      if(bad){ ok=false; if(!first) first=el; }
    });
    if(first){ first.focus(); first.scrollIntoView({block:'center', behavior:'smooth'}); }
    return ok;
  }
  function formData(form){ var o={}; new FormData(form).forEach(function(v,k){ if(o[k]!==undefined){ if(!Array.isArray(o[k])) o[k]=[o[k]]; o[k].push(v);} else o[k]=v; }); return o; }

  /* ---------- 유입 경로 (검색·SNS·광고 링크) ----------
     바깥 사이트에서 들어오거나 utm 값이 붙은 주소로 들어오면 그 정보를 이 브라우저에만 30일 보관하고,
     예약 신청·문의를 보낼 때 함께 보냅니다. 관리자 화면의 '유입' 표시에 쓰입니다. 이름·연락처와는 상관없는 정보입니다. */
  var SRC_KEY='ms_src';
  (function(){
    try{
      var q=new URLSearchParams(location.search), ref=document.referrer||'', host='';
      try{ host=ref?new URL(ref).hostname.replace(/^www\./,''):''; }catch(e){}
      var internal=!!host && host===location.hostname.replace(/^www\./,'');
      var utm=q.get('utm_source'), cur=null; try{ cur=JSON.parse(localStorage.getItem(SRC_KEY)||'null'); }catch(e){}
      var stale=!cur || (Date.now()-(cur.t||0))>30*864e5;
      if(utm || (ref && !internal) || stale){
        localStorage.setItem(SRC_KEY, JSON.stringify({ ref:(ref && !internal)?ref.slice(0,300):'', utm_source:(utm||'').slice(0,60), utm_medium:(q.get('utm_medium')||'').slice(0,60), utm_campaign:(q.get('utm_campaign')||'').slice(0,80), landing:location.pathname.slice(0,200), t:Date.now() }));
      }
    }catch(e){}
  })();
  function source(){ try{ var v=JSON.parse(localStorage.getItem(SRC_KEY)||'null'); return v && (Date.now()-(v.t||0))<=30*864e5 ? v : null; }catch(e){ return null; } }

  /* ---------- 함께 알아보기 (같은 건물·패밀리 공간) ----------
     예약 신청·문의 양식에 붙는 선택 항목입니다. 값은 서버(functions/api/inquiry.js의 FAMILY_ASK)와 관리자 화면(admin.js)이 같은 id를 씁니다. */
  var FAMILY_ASK=[['socialfactory','같은 건물 4층 소셜팩토리 룸(15~40명)','소셜팩토리 룸(4층)'],['playtion','행사 뒤 뒤풀이 공간(플레이션 게임파티룸)','플레이션 뒤풀이']];
  function familyAsk(name){
    return '<div class="f fam-ask"><span class="lbl">함께 알아보기 <span class="muted">(선택)</span></span><div class="checks">'
      + FAMILY_ASK.map(function(f){ return '<label class="chk"><input type="checkbox" name="'+name+'" value="'+f[0]+'"> '+f[1]+'</label>'; }).join('')
      + '</div><p class="tiny muted mt-1">체크하시면 같은 날 쓸 수 있는지 함께 확인해 안내해 드립니다. <a href="/family/" target="_blank" rel="noopener" style="text-decoration:underline">패밀리 사이트 보기</a></p></div>';
  }
  function familyLabel(list){ return [].concat(list||[]).map(function(id){ for(var i=0;i<FAMILY_ASK.length;i++) if(FAMILY_ASK[i][0]===id) return FAMILY_ASK[i][2]; return ''; }).filter(Boolean).join(', '); }

  /* ---------- 현장답사 희망 ----------
     예약 신청·문의 양식에 붙는 선택 항목입니다. 체크하면 서버(functions/api/inquiry.js의 visit_wish)가 '조율 중' 답사로 저장하고,
     관리자 화면 '일자별 현장답사'에 바로 올라갑니다. 시간은 희망일 뿐이고 담당자가 연락해 확정합니다. */
  function visitAsk(p){
    var t=['<option value="">시간은 상관없어요</option>'];
    for(var h=10;h<=21;h++) t.push('<option value="'+pad2(h)+':00">'+(h<12?'오전 '+h:'오후 '+(h===12?12:h-12))+'시</option>');
    return '<div class="f visit-ask" data-visit="'+p+'"><label class="chk visit-ask-on"><input type="checkbox" name="'+p+'_on" value="1"> <span><b>현장답사를 먼저 하고 싶어요</b> <span class="muted">(선택)</span></span></label>'
      + '<div class="visit-ask-body" hidden><div class="field-row three">'
      + '<div class="f"><label for="'+p+'-date">답사 희망일</label><input class="input" type="date" id="'+p+'-date" name="'+p+'_date" min="'+fmtDate(new Date())+'"></div>'
      + '<div class="f"><label for="'+p+'-time">희망 시간</label><select class="select" id="'+p+'-time" name="'+p+'_time">'+t.join('')+'</select></div>'
      + '<div class="f"><label for="'+p+'-people">오실 인원</label><select class="select" id="'+p+'-people" name="'+p+'_people"><option value="">선택 안 함</option><option value="1">1명</option><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명 이상</option></select></div></div>'
      + '<div class="f"><label for="'+p+'-note">편한 요일·시간대 <span class="muted">(선택)</span></label><input class="input" id="'+p+'-note" name="'+p+'_note" maxlength="200" placeholder="예: 평일 저녁 7시 이후, 이번 주 토요일 오전"></div>'
      + '<p class="tiny muted">날짜를 비워 두셔도 됩니다. 남겨 주신 희망 일정을 보고 담당자가 연락드려 답사 시간을 확정합니다.</p></div></div>';
  }
  function visitBind(form, p){
    var on=form.querySelector('[name="'+p+'_on"]'), body=form.querySelector('[data-visit="'+p+'"] .visit-ask-body'); if(!on||!body) return;
    on.addEventListener('change', function(){ body.hidden=!on.checked; });
  }
  function visitRead(form, p){
    var on=form.querySelector('[name="'+p+'_on"]'); if(!on||!on.checked||on.closest('[hidden]')) return null;
    var v=function(k){ var el=form.querySelector('[name="'+p+'_'+k+'"]'); return el?String(el.value||'').trim():''; };
    return { want:true, date:v('date'), time:v('time'), people:+v('people')||'', note:v('note') };
  }
  function visitLabel(w){
    if(!w) return '';
    var dt=w.date?fmtKDate(w.date):'', parts=[dt, w.time?w.time+' 무렵':'', w.people?(w.people>=5?'5명 이상':w.people+'명'):'', w.note||''].filter(Boolean);
    return parts.length?parts.join(' · '):'일정은 연락 주시면 맞출게요';
  }

  /* ---------- 찜 (이 브라우저에만 저장) ----------
     공간·모임을 찜하면 이 기기의 브라우저에 목록만 남깁니다. 로그인과 상관없고 서버로 보내지 않습니다. */
  var FAV_KEY='ms_fav';
  function favAll(){ try{ var v=JSON.parse(localStorage.getItem(FAV_KEY)||'{}'); return v&&typeof v==='object'?v:{}; }catch(e){ return {}; } }
  var fav={
    list:function(type){ var v=favAll()[type]; return Array.isArray(v)?v:[]; },
    has:function(type,id){ return fav.list(type).indexOf(id)>=0; },
    toggle:function(type,id){ var all=favAll(), l=Array.isArray(all[type])?all[type]:[], i=l.indexOf(id); if(i>=0) l.splice(i,1); else l.unshift(id); all[type]=l.slice(0,100); try{ localStorage.setItem(FAV_KEY, JSON.stringify(all)); }catch(e){} return i<0; },
    button:function(type,id,label){ var on=fav.has(type,id); return '<button type="button" class="fav-btn'+(on?' on':'')+'" data-fav="'+esc(type)+'" data-fav-id="'+esc(id)+'" aria-pressed="'+on+'" aria-label="'+esc(label||'')+' 찜하기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.5-4.4-9.3-9.2C1.5 7.8 3.6 4.5 7 4.5c2 0 3.5 1.1 5 2.9 1.5-1.8 3-2.9 5-2.9 3.4 0 5.5 3.3 4.3 6.6-1.8 4.8-9.3 9.2-9.3 9.2z"/></svg></button>'; }
  };
  document.addEventListener('click', function(e){
    var b=e.target.closest && e.target.closest('[data-fav]'); if(!b) return;
    e.preventDefault(); e.stopPropagation();
    var on=fav.toggle(b.dataset.fav, b.dataset.favId); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    toast(on?'찜 목록에 담았습니다. 이 브라우저에서만 보입니다.':'찜 목록에서 뺐습니다.');
    document.dispatchEvent(new CustomEvent('ms:fav', { detail:{ type:b.dataset.fav, id:b.dataset.favId, on:on } }));
  }, true);

  /* ---------- 공유 · 복사 ---------- */
  function copyText(t){
    if(navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(function(){ return true; }, function(){ return false; });
    try{ var ta=document.createElement('textarea'); ta.value=t; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); var ok=document.execCommand('copy'); ta.remove(); return Promise.resolve(ok); }catch(e){ return Promise.resolve(false); }
  }
  function share(url, title){
    url=url||location.href;
    if(navigator.share){ return navigator.share({ title:title||document.title, url:url }).catch(function(){}); }
    return copyText(url).then(function(ok){ toast(ok?'주소를 복사했습니다. 카카오톡·문자에 붙여 넣어 보내세요.':'주소를 복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요.'); });
  }
  // 모임·등록 공간 대표 이미지: 미리 준비된 사진 id(s01, r01 …) 또는 https 주소
  function coverSrc(c, size){ c=String(c||''); return /^https:\/\//.test(c) ? c : (/^\//.test(c) ? c : imgSrc(c||'p14', size||'m')); }

  /* ---------- 배너 광고 ----------
     [data-ad-slot] 자리에 관리자 화면 '광고 관리'에서 게재 중인 배너를 넣습니다. 게재 중인 광고가 없거나 서버가 연결되지 않으면
     아래 메가스팟 안내 배너(건대 1호·2호·모임 모집·공간 등록)를 대신 보여 줍니다. 유료 광고에는 항상 '광고' 표시를 붙입니다. */
  var HOUSE_ADS={
    'home-mid':[
      { title:'400평 메가스팟 건대 2호, 11월 13일 문을 엽니다', sub:'최대 350명 · 200인치 레이저 빔프로젝터 · 기준 50명 포함. 오픈일 이후 날짜는 지금 사전 예약을 받습니다.', cta:'2호 사전 예약', href:'/spaces/megaspot-gundae-2/', image:'/assets/img/gundae2/m/r07.jpg', theme:'graphite' },
      { title:'대관을 정했다면, 참가자 모집도 메가스팟에서', sub:'모임 소개와 참가 신청·대기 신청을 받는 페이지를 무료로 만들 수 있습니다. 신청자 명단은 주최자 관리 화면에서 봅니다.', cta:'모임 등록하기', href:'/meetups/new/', image:'/assets/img/scenes/m/s04.jpg', theme:'cobalt' }],
    'list-top':[
      { title:'바로 쓸 수 있는 190평, 메가스팟 건대 1호', sub:'최대 200명 · 시간당 4만 원부터 · 200인치 빔프로젝터와 음향 무료', cta:'1호 보기', href:'/spaces/megaspot-gundae/', theme:'light' },
      { title:'100명이 넘는 행사라면 400평 건대 2호', sub:'11월 13일 오픈 · 최대 350명 · 지금 사전 예약 중', cta:'2호 보기', href:'/spaces/megaspot-gundae-2/', theme:'light' }],
    'list-card':[
      { title:'우리 공간도 여기에 올리고 싶다면', sub:'100평 이상이거나 100명 이상 모일 수 있는 공간이면 등록을 검토합니다.', cta:'공간 등록 신청', href:'/host/register/', image:'/assets/img/gundae2/m/r02.jpg', theme:'rust' },
      { title:'함께할 사람을 모으는 중인가요', sub:'세미나·네트워킹·동호회 모임을 올리고 참가 신청을 받아 보세요.', cta:'모임 등록하기', href:'/meetups/new/', image:'/assets/img/scenes/m/s13.jpg', theme:'cobalt' }],
    'content-bottom':[
      { title:'건대입구 190평 · 400평, 메가스팟 건대 1호·2호', sub:'20명 소모임부터 350명 행사까지. 날짜·시간·인원을 넣으면 요금표 그대로 금액이 나옵니다.', cta:'금액 확인하기', href:'/inquiry/', image:'/assets/img/views/m/v01.jpg', theme:'graphite' },
      { title:'메가스팟 건대 2호 사전 예약', sub:'11월 13일 오픈 · 400평 · 최대 350명 · 송년회·시상식·대규모 세미나', cta:'2호 보기', href:'/spaces/megaspot-gundae-2/', image:'/assets/img/gundae2/m/r05.jpg', theme:'cobalt' }]
  };
  var adsReq=null, adSeen={}, adQueue=[], adTimer=null, adIO=null;
  function adsLoad(slots){
    if(!adsReq) adsReq=api('/ads/list?slots='+encodeURIComponent(slots.join(','))).then(function(j){ return j.items||[]; }).catch(function(){ return []; });
    return adsReq;
  }
  function adPick(items, slot, idx){
    var paid=items.filter(function(a){ return a.slot===slot; });
    var pool=paid.length?paid:(HOUSE_ADS[slot]||[]).map(function(a){ return Object.assign({ kind:'house', local:true }, a); });
    if(!pool.length) return null;
    if(paid.length) return pool[(idx||0)%pool.length];
    return pool[((idx||0)+Math.floor(Math.random()*pool.length))%pool.length];
  }
  function adHtml(a, slot){
    var card=slot==='list-card', paid=a.kind==='paid';
    var label=paid?'<span class="ad-label">광고'+(a.advertiser?' · '+esc(a.advertiser):'')+'</span>':'<span class="ad-label house">메가스팟 안내</span>';
    var ext=paid && a.ext;
    var img=a.image?'<span class="ad-img"><img src="'+esc(a.image)+'" alt="" loading="lazy" decoding="async"></span>':'';
    return '<a class="'+(card?'ad-card':'ad-banner')+' theme-'+esc(a.theme||'cobalt')+(a.image?' has-img':'')+'" href="'+esc(a.href)+'"'+(ext?' target="_blank" rel="sponsored noopener"':(paid?' rel="sponsored"':''))+(a.id?' data-ad-id="'+(+a.id)+'"':'')+'>'
      + img + '<span class="ad-body">'+label+'<b class="ad-title">'+esc(a.title)+'</b>'+(a.sub?'<span class="ad-sub">'+esc(a.sub)+'</span>':'')+'</span>'
      + '<span class="ad-cta">'+esc(a.cta||'자세히 보기')+' <span class="arrow">→</span></span></a>';
  }
  function adImp(el){
    var id=+el.getAttribute('data-ad-id'); if(!id || adSeen[id]) return; adSeen[id]=1; adQueue.push(id);
    clearTimeout(adTimer); adTimer=setTimeout(function(){ var ids=adQueue.splice(0,8); if(ids.length) api('/ads/imp',{method:'POST', body:{ids:ids}}).catch(function(){}); }, 800);
  }
  function adRender(el){
    var slot=el.getAttribute('data-ad-slot'), idx=+(el.getAttribute('data-ad-index')||0);
    var all=$$('[data-ad-slot]').map(function(x){ return x.getAttribute('data-ad-slot'); }).filter(function(v,i,l){ return l.indexOf(v)===i; });
    if(all.indexOf(slot)<0) all.push(slot);
    return adsLoad(all).then(function(items){
      var a=adPick(items, slot, idx); if(!a){ el.hidden=true; return; }
      el.innerHTML=adHtml(a, slot); el.classList.add('ad-on');
      var link=el.firstChild; if(link && link.getAttribute('data-ad-id')){
        if('IntersectionObserver' in window){ if(!adIO) adIO=new IntersectionObserver(function(en){ en.forEach(function(x){ if(x.isIntersecting){ adImp(x.target); adIO.unobserve(x.target); } }); }, { threshold:.5 }); adIO.observe(link); }
        else adImp(link);
      }
    });
  }
  function initAds(){ $$('[data-ad-slot]').forEach(function(el){ if(!el.classList.contains('ad-on')) adRender(el); }); }

  /* ---------- 공유 내보내기 ---------- */
  window.MEGASPOT = {
    CONFIG:CONFIG, $:$, $$:$$, esc:esc, pad2:pad2, fmtDate:fmtDate, fmtKDate:fmtKDate, fmtNum:fmtNum,
    toast:toast, api:api, checkApi:checkApi, demo:demo, openLightbox:openLB, photoSrc:photoSrc, localRef:localRef,
    imgSrc:imgSrc, isStaged:isStaged, isCG:isCG, imgTag:imgTag, tagClass:tagClass, tagHtml:tagHtml, visual:visual, sceneItems:sceneItems,
    validate:validate, formData:formData, account:account, source:source, familyAsk:familyAsk, familyLabel:familyLabel, visitAsk:visitAsk, visitBind:visitBind, visitRead:visitRead, visitLabel:visitLabel,
    fav:fav, share:share, copy:copyText, coverSrc:coverSrc, ads:{ render:adRender, init:initAds, house:HOUSE_ADS, html:adHtml }
  };

  /* ---------- 모바일 빠른 연락 바 + 맨 위로 ---------- */
  // 작은 화면에서 화면 아래에 전화·카카오톡·예약 신청 버튼을 고정해 둡니다.
  // 계산기(예약 신청 화면)가 보이는 동안과 주문·회원·관리자 화면에서는 보이지 않습니다.
  function initQuickBar(){
    var skip=/^\/(admin|order|login|signup|mypage|confirm)\//.test(location.pathname) || /^\/meetups\/(manage|new|view)\//.test(location.pathname) || /^\/spaces\/listing\//.test(location.pathname) || /^\/host\/register\//.test(location.pathname) || document.body.classList.contains('page-admin') || document.body.classList.contains('page-inquiry');
    if(!skip){
      var bar=document.createElement('nav'); bar.className='quick-bar'; bar.setAttribute('aria-label','빠른 연락');
      bar.innerHTML='<a class="qb-call" href="tel:'+CONFIG.phone.replace(/-/g,'')+'"><span class="qb-ico" aria-hidden="true">☎</span>전화</a>'
        +(CONFIG.kakaoChannel?'<a class="qb-kakao" href="'+esc(CONFIG.kakaoChannel)+'" target="_blank" rel="noopener"><svg class="ico-talk" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.2C6.6 3.2 2.3 6.6 2.3 10.9c0 2.7 1.8 5.1 4.5 6.5l-.9 3.4c-.1.3.3.6.6.4l4-2.6c.5.1 1 .1 1.5.1 5.4 0 9.7-3.4 9.7-7.8S17.4 3.2 12 3.2z"/></svg>카카오톡</a>':'')
        +'<a class="qb-main" href="'+(document.querySelector('[data-price=estimator]')?'#estimate':'/inquiry/')+'">예약신청·금액확인 <span class="arrow">→</span></a>';
      document.body.appendChild(bar); document.body.classList.add('has-quick-bar');
      var est=document.querySelector('[data-price=estimator]');
      if(est && 'IntersectionObserver' in window){ new IntersectionObserver(function(en){ bar.classList.toggle('off', en[0].isIntersecting); }, { rootMargin:'0px 0px -40% 0px' }).observe(est); }
    }
    var top=document.createElement('button'); top.type='button'; top.className='to-top'; top.setAttribute('aria-label','맨 위로'); top.innerHTML='↑'; document.body.appendChild(top);
    top.addEventListener('click', function(){ window.scrollTo({top:0, behavior:'smooth'}); });
    var ticking=false; window.addEventListener('scroll', function(){ if(ticking) return; ticking=true; requestAnimationFrame(function(){ top.classList.toggle('show', window.scrollY>900); ticking=false; }); }, {passive:true});
  }
  function initToastRegion(){ if(!toastEl){ toastEl=document.createElement('div'); toastEl.className='toast'; toastEl.setAttribute('role','status'); toastEl.setAttribute('aria-live','polite'); document.body.appendChild(toastEl); } }

  document.addEventListener('DOMContentLoaded', function(){ initHeader(); initAccount(); initSubnav(); initQuickBar(); initToastRegion(); initAds(); });
})();
