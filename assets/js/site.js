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
    kakaoChannel: 'http://pf.kakao.com/_uTiFX', // 카카오톡 문의 채널 — 비우면 카카오톡 버튼·링크 숨김
    kakaoNote: '메가스팟 문의는 소셜팩토리 카카오톡 채널에서 함께 응대합니다.',
    // ※ 채널 주소를 바꾸면 QR 이미지(/assets/img/brand/kakao-qr.svg)도 새 주소로 다시 만들어 교체해야 합니다.
    hours: '평일 10:00–19:00 (주말·공휴일 문의는 다음 영업일 순차 답변)',
    operatorName: '메가스팟 운영팀',
    companyName: '',                  // 사업자 상호 (확정 후 입력) — 비우면 푸터에서 숨김
    bizNo: '',                        // 사업자등록번호
    ceo: '',                          // 대표자
    bizAddress: '서울 광진구 화양동 10-1, 한아름건물 2층',
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
    if(btn&&nav){ btn.addEventListener('click', function(){ var open=nav.classList.toggle('open'); btn.setAttribute('aria-expanded', String(open)); document.body.style.overflow = open?'hidden':''; }); }
    // current page marking
    var path=location.pathname.replace(/index\.html$/,'');
    ['.nav','.mobile-nav'].forEach(function(sel){
      var best=null, bestLen=-1;
      $$(sel+' a').forEach(function(a){
        var href=(a.getAttribute('href')||'').replace(/index\.html$/,''); if(!href||href.charAt(0)==='#'||href==='/') return;
        if(path.indexOf(href)===0 && href.length>bestLen){ best=a; bestLen=href.length; }
      });
      if(best) best.setAttribute('aria-current','page');
    });
    // contact placeholders
    $$('[data-phone]').forEach(function(el){ el.textContent=CONFIG.phone; if(el.tagName==='A') el.href='tel:'+CONFIG.phone.replace(/-/g,''); });
    $$('[data-email]').forEach(function(el){ el.textContent=CONFIG.email; if(el.tagName==='A') el.href='mailto:'+CONFIG.email; });
    $$('[data-hours]').forEach(function(el){ el.textContent=CONFIG.hours; });
    $$('[data-kakao]').forEach(function(el){ if(CONFIG.kakaoChannel){ el.href=CONFIG.kakaoChannel; el.hidden=false; } else { el.hidden=true; } });
    $$('[data-kakao-url]').forEach(function(el){ if(CONFIG.kakaoChannel) el.textContent=CONFIG.kakaoChannel.replace(/^https?:\/\//,''); });
    $$('[data-kakao-note]').forEach(function(el){ if(CONFIG.kakaoNote) el.textContent=CONFIG.kakaoNote; el.hidden=!CONFIG.kakaoChannel; });
    $$('[data-company]').forEach(function(el){
      if(!CONFIG.companyName){ el.hidden=true; return; }
      el.innerHTML = esc(CONFIG.companyName) + (CONFIG.ceo?' · 대표 '+esc(CONFIG.ceo):'') + (CONFIG.bizNo?' · 사업자등록번호 '+esc(CONFIG.bizNo):'') + ' · ' + esc(CONFIG.bizAddress);
    });
    $$('[data-year]').forEach(function(el){ el.textContent=new Date().getFullYear(); });
  }

  /* ---------- subnav scrollspy ---------- */
  function initSubnav(){
    var nav=$('.subnav'); if(!nav) return;
    var links=$$('a[href^="#"]', nav); var map={};
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
    document.addEventListener('keydown', function(e){ if(!el.classList.contains('open')) return; if(e.key==='Escape') closeLB(); if(e.key==='ArrowLeft') showLB(LB.i-1); if(e.key==='ArrowRight') showLB(LB.i+1); });
    var sx=null; el.addEventListener('touchstart', function(e){ sx=e.touches[0].clientX; },{passive:true}); el.addEventListener('touchend', function(e){ if(sx==null) return; var dx=e.changedTouches[0].clientX-sx; if(Math.abs(dx)>50) showLB(LB.i+(dx<0?1:-1)); sx=null; });
  }
  function openLB(items, i){ ensureLB(); LB.items=items; showLB(i||0); LB.el.classList.add('open'); document.body.style.overflow='hidden'; }
  function closeLB(){ if(!LB.el) return; LB.el.classList.remove('open'); document.body.style.overflow=''; }
  function showLB(i){ var n=LB.items.length; if(!n) return; LB.i=(i+n)%n; var it=LB.items[LB.i]; var img=$('img',LB.el); img.src=it.src; img.alt=it.title||''; $('.lb-counter',LB.el).textContent=pad2(LB.i+1)+' / '+pad2(n); var tg=$('.lb-tag',LB.el); tg.textContent=it.tag||''; tg.hidden=!it.tag; tg.className='lb-tag'; $('.lb-cap b',LB.el).textContent=it.title||''; $('.lb-cap span',LB.el).textContent=it.cap||''; }

  /* ---------- 사진 경로 ---------- */
  function photoSrc(spaceId, pid, thumb){ return '/assets/img/'+ (spaceId==='megaspot-gundae'?'gundae':spaceId) +'/'+(thumb?'t/':'')+pid+'.jpg'; }
  // 이미지 id 첫 글자로 종류를 구분합니다. size: '' | 'm' | 't'
  //  p: 공간 사진 · s: 활용 장면 · v: 공간 전경 · a: 조감도 (화면에는 이미지 종류 표시를 붙이지 않습니다)
  var IMG_DIR={ p:'gundae', s:'scenes', v:'views', a:'aerial' };
  function kind(id){ var c=String(id).charAt(0); return IMG_DIR[c] ? c : 'p'; }
  function imgSrc(id, size){ var sub=size?size+'/':''; return '/assets/img/'+IMG_DIR[kind(id)]+'/'+sub+id+'.jpg'; }
  function isStaged(id){ if(kind(id)!=='s') return false; var sc=window.MEGASPOT_SCENE && window.MEGASPOT_SCENE(id); return !sc || sc.staged!==false; }
  function isCG(id){ var k=kind(id); return k==='v' || k==='a'; }
  function imgTag(id){ return ''; }
  function tagClass(id){ return isStaged(id) ? 'staged' : isCG(id) ? 'cg' : ''; }
  function tagHtml(id, extra){ return ''; }
  // id로 이미지 정보(제목·설명) 찾기
  function visual(id){
    var k=kind(id), find=function(list){ return (list||[]).filter(function(x){ return x.id===id; })[0]; };
    if(k==='s') return window.MEGASPOT_SCENE ? window.MEGASPOT_SCENE(id) : null;
    if(k==='v') return find(window.MEGASPOT_VIEWS);
    if(k==='a') return find(window.MEGASPOT_AERIALS);
    var sp=window.MEGASPOT_GET_SPACE && window.MEGASPOT_GET_SPACE('megaspot-gundae'); return sp ? find(sp.photos) : null;
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

  /* ---------- 공유 내보내기 ---------- */
  window.MEGASPOT = {
    CONFIG:CONFIG, $:$, $$:$$, esc:esc, pad2:pad2, fmtDate:fmtDate, fmtKDate:fmtKDate, fmtNum:fmtNum,
    toast:toast, api:api, checkApi:checkApi, demo:demo, openLightbox:openLB, photoSrc:photoSrc, localRef:localRef,
    imgSrc:imgSrc, isStaged:isStaged, isCG:isCG, imgTag:imgTag, tagClass:tagClass, tagHtml:tagHtml, visual:visual, sceneItems:sceneItems,
    validate:validate, formData:formData, account:account
  };

  document.addEventListener('DOMContentLoaded', function(){ initHeader(); initAccount(); initSubnav(); });
})();
