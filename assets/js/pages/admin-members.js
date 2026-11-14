/* 관리자 · 회원 관리 (2026-11-14)
   기존 '회원' 화면(section#view-members)을 넓혀 씁니다: 요약 · 조건으로 찾기 · 선택 · 상세(문의·예약·호스트·메모·동의 기록) · 엑셀
   · 문자 / 카카오 알림톡 / 이메일 보내기(정보성·광고성 구분, 미리보기, 나에게 시험, 진행률) · 보낸 기록 · 발송 설정.
   서버: /api/crm/* (functions/api/crm/[[path]].js). 이용 제한·임시 비밀번호는 기존 /api/admin/members/* 를 그대로 씁니다.
   기존 admin.js 의 회원 목록 불러오기가 오류 없이 돌도록 #mem-q · #mem-total · #mem-list · #mem-reload 자리는 숨겨 둡니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var view=document.getElementById('view-members'); if(!view) return;
  var esc=X.esc;
  function $(s, r){ return (r||document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function C(path, opts){ return M.api('/crm'+path, opts||{}); }
  function oops(e){ if(X.guard(e)) return; M.toast((e&&e.message)||'처리하지 못했습니다.'); }
  function kst(s){ var d=new Date(String(s||'').replace(' ','T')+'Z'); return isNaN(d)?'':new Date(d.getTime()+9*3600e3).toISOString().slice(0,16).replace('T',' '); }
  function kd(s){ return kst(s).slice(0,10); }
  function num(n){ return Number(n||0).toLocaleString('ko-KR'); }
  function pct(a,b){ return b?Math.round(a/b*1000)/10+'%':'–'; }
  function bytes(s){ var n=0; for(var i=0;i<s.length;i++) n+=s.charCodeAt(i)>127?2:1; return n; }
  function opts(pairs, sel){ return pairs.map(function(p){ return '<option value="'+esc(p[0])+'"'+(String(p[0])===String(sel)?' selected':'')+'>'+esc(p[1])+'</option>'; }).join(''); }
  var TAGS={ vip:'자주 이용', corp:'기업·단체', followup:'다시 연락', caution:'주의 필요', host:'호스트 후보' };
  var SPACE={ 'megaspot-gundae':'건대 1호점', 'megaspot-gundae-2':'건대 2호점' };
  var CH={ sms:'문자', kakao:'카카오 알림톡', email:'이메일' };

  /* ---------- 화면 틀 (기존 회원 화면을 바꿔 그림) ---------- */
  view.classList.add('mbr-view');
  view.innerHTML='<header class="adm-head"><div><h1>회원 관리</h1><p class="small muted">가입한 회원을 찾고, 필요한 회원에게 문자·카카오 알림톡·이메일을 보냅니다. 광고성 메시지는 마케팅 수신에 동의한 회원에게만 갑니다. 비밀번호를 잊은 회원은 가입 이름·휴대폰 번호로 본인인지 확인한 뒤 상세 화면에서 임시 비밀번호를 발급해 주세요.</p></div>'
    +'<div class="row mbr-head-act"><button class="btn btn-light btn-sm" type="button" data-mb="history">보낸 기록</button><button class="btn btn-light btn-sm" type="button" data-mb="settings">발송 설정</button><button class="btn btn-light btn-sm" type="button" data-mb="export">엑셀 내려받기</button><button class="btn btn-light btn-sm" type="button" data-mb="reload">새로고침</button></div></header>'
    +'<div class="mbr-tiles" id="mbr-tiles"></div>'
    +'<form class="adm-card mbr-filter" id="mbr-filter" novalidate>'
      +'<div class="mbr-f-main"><label class="sr-only" for="mbr-q">회원 찾기</label><input class="input" id="mbr-q" name="q" type="search" placeholder="이름·이메일·휴대폰·소속으로 찾기"><button class="btn btn-primary btn-sm" type="submit">찾기</button><button class="btn btn-ghost btn-sm" type="button" data-mb="clear">조건 지우기</button></div>'
      +'<div class="mbr-f-row">'
        +'<label>상태<select class="select" name="status">'+opts([['','전체'],['active','이용 중'],['suspended','이용 제한']],'')+'</select></label>'
        +'<label>마케팅 수신<select class="select" name="mkt">'+opts([['','전체'],['1','동의'],['0','미동의']],'')+'</select></label>'
        +'<label>호스트<select class="select" name="host">'+opts([['','전체'],['1','호스트 회원'],['0','일반 회원']],'')+'</select></label>'
        +'<label>활동<select class="select" name="act">'+opts([['','전체'],['inquiry','문의한 적 있음'],['booking','확정 예약 있음'],['none','문의 없음'],['recent','최근 30일 로그인'],['dormant','90일 넘게 안 들어옴']],'')+'</select></label>'
        +'<label>표시<select class="select" name="tag">'+opts([['','전체']].concat(Object.keys(TAGS).map(function(k){ return [k, TAGS[k]]; })),'')+'</select></label>'
        +'<label>가입일<span class="mbr-dates"><input class="input" type="date" name="from" aria-label="가입일 시작"><i>~</i><input class="input" type="date" name="to" aria-label="가입일 끝"></span></label>'
        +'<label>정렬<select class="select" name="sort">'+opts([['new','최근 가입'],['old','오래된 가입'],['login','최근 로그인'],['inquiries','문의 많은 순'],['name','이름']],'new')+'</select></label>'
      +'</div></form>'
    +'<div class="mbr-bar" id="mbr-bar"><span id="mbr-count" class="small"></span><span class="mbr-bar-act"><span id="mbr-sel" class="small"></span>'
      +'<button class="btn btn-primary btn-sm" type="button" data-mb="send-sel" hidden>선택한 회원에게 보내기</button><button class="btn btn-light btn-sm" type="button" data-mb="send-all">조건에 맞는 회원에게 보내기</button><button class="btn btn-ghost btn-sm" type="button" data-mb="unsel" hidden>선택 해제</button></span></div>'
    +'<div class="adm-card mbr-table-wrap"><table class="mbr-table"><thead><tr><th class="c"><input type="checkbox" id="mbr-all" aria-label="이 쪽 회원 모두 선택"></th><th>회원</th><th>연락처</th><th>가입 · 최근 로그인</th><th>마케팅</th><th class="n">문의·예약</th><th>상태</th></tr></thead><tbody id="mbr-rows"></tbody></table></div>'
    +'<nav class="mbr-pages" id="mbr-pages" aria-label="쪽"></nav>'
    +'<div hidden aria-hidden="true"><input id="mem-q" value=""><p id="mem-total"></p><div id="mem-list"></div><button type="button" id="mem-reload"></button></div>';

  // 서랍 (상세·보내기·기록·설정)
  var dr=document.createElement('div'); dr.className='adm-drawer mbr-drawer'; dr.id='mbr-drawer'; dr.hidden=true;
  dr.innerHTML='<div class="adm-drawer-bg" data-close></div><div class="adm-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="mbr-d-title"><div class="adm-drawer-head"><h2 id="mbr-d-title"></h2><button class="btn btn-light btn-sm" type="button" data-close>닫기 ✕</button></div><div class="adm-drawer-body" id="mbr-d-body"></div></div>';
  document.body.appendChild(dr);
  dr.addEventListener('click', function(e){ if(e.target.closest('[data-close]')){ if(SEND.busy && !confirm('보내는 중입니다. 창을 닫으면 여기서 멈추고, 보낸 기록에서 이어서 보낼 수 있습니다. 닫을까요?')) return; SEND.busy=false; X.closeDrawer(dr, true); } });
  function drawer(title, html){ $('#mbr-d-title').textContent=title; var b=$('#mbr-d-body'); b.innerHTML=html; if(dr.hidden) X.openDrawer('#mbr-drawer'); b.scrollTop=0; b.onclick=null; b.onsubmit=null; b.oninput=null; b.onchange=null; return b; }

  /* ---------- 목록 ---------- */
  var ST={ page:1, size:50, items:[], count:0, sel:{}, f:{}, cfg:null };
  var form=$('#mbr-filter');
  function readFilter(){ var f={}; ['q','status','mkt','host','act','tag','from','to','sort'].forEach(function(k){ var v=String(form.elements[k].value||'').trim(); if(v) f[k]=v; }); return f; }
  function qs(f, extra){ var p=new URLSearchParams(); Object.keys(f).forEach(function(k){ p.set(k, f[k]); }); Object.keys(extra||{}).forEach(function(k){ p.set(k, extra[k]); }); return p.toString(); }
  function load(){
    ST.f=readFilter(); var box=$('#mbr-rows'); box.innerHTML='<tr><td colspan="7" class="mbr-empty">불러오는 중…</td></tr>';
    C('/members?'+qs(ST.f, { page:ST.page, size:ST.size })).then(function(r){
      ST.items=r.items||[]; ST.count=r.count||0; var s=r.summary||{};
      $('#mbr-tiles').innerHTML=[['전체 회원', num(s.total)+'명', ''],['이번 달 가입', num(s.month_new)+'명', ''],['마케팅 수신 동의', num(s.mkt)+'명', '이용 중 회원의 '+pct(s.mkt, s.total-s.suspended)],['최근 30일 로그인', num(s.recent)+'명', ''],['호스트 회원', num(s.hosts)+'명', ''],['이용 제한', num(s.suspended)+'명', '']].map(function(x){ return '<div class="mbr-tile"><span>'+x[0]+'</span><b>'+x[1]+'</b>'+(x[2]?'<small>'+x[2]+'</small>':'')+'</div>'; }).join('');
      $('#mbr-count').textContent='조건에 맞는 회원 '+num(ST.count)+'명';
      box.innerHTML=ST.items.length?ST.items.map(rowHtml).join(''):'<tr><td colspan="7" class="mbr-empty">조건에 맞는 회원이 없습니다.</td></tr>';
      pages(); selUi();
    }).catch(function(e){ if(X.guard(e)) return; box.innerHTML='<tr><td colspan="7" class="mbr-empty">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</td></tr>'; });
  }
  function rowHtml(m){
    var on=m.status==='active';
    return '<tr data-mid="'+m.id+'" tabindex="0"><td class="c"><input type="checkbox" data-sel="'+m.id+'"'+(ST.sel[m.id]?' checked':'')+' aria-label="'+esc(m.name)+' 선택"></td>'
      +'<td><b>'+esc(m.name)+'</b>'+(m.host_code?' <span class="mbr-chip host">호스트</span>':'')+(m.tags||[]).map(function(t){ return ' <span class="mbr-chip">'+esc(TAGS[t]||t)+'</span>'; }).join('')+'<small>'+esc(m.email)+(m.org?' · '+esc(m.org):'')+'</small></td>'
      +'<td>'+(m.phone?esc(m.phone):'<span class="muted">없음</span>')+'</td>'
      +'<td><span class="mbr-lb">가입 </span>'+esc(kd(m.created_at))+'<small>'+(m.last_login_at?'최근 '+esc(kd(m.last_login_at)):'로그인 기록 없음')+'</small></td>'
      +'<td>'+(m.agree_marketing?'<span class="mbr-yes">동의</span>':'<span class="mbr-no">미동의</span>')+'</td>'
      +'<td class="n"><span class="mbr-lb">문의 </span>'+num(m.inquiries)+' · <span class="mbr-lb">예약 </span>'+num(m.bookings)+'</td>'
      +'<td>'+(on?'<span class="st st-ok">이용 중</span>':'<span class="st st-cancel">이용 제한</span>')+'</td></tr>';
  }
  function pages(){
    var n=Math.max(1, Math.ceil(ST.count/ST.size)), p=ST.page, list=[];
    for(var i=Math.max(1,p-3); i<=Math.min(n,p+3); i++) list.push(i);
    $('#mbr-pages').innerHTML=n<=1?'':'<button class="btn btn-light btn-sm" type="button" data-page="'+(p-1)+'"'+(p<=1?' disabled':'')+'>이전</button>'+list.map(function(i){ return '<button class="btn btn-sm '+(i===p?'btn-primary':'btn-light')+'" type="button" data-page="'+i+'"'+(i===p?' aria-current="page"':'')+'>'+i+'</button>'; }).join('')+'<button class="btn btn-light btn-sm" type="button" data-page="'+(p+1)+'"'+(p>=n?' disabled':'')+'>다음</button><span class="small muted">'+p+' / '+n+'쪽</span>';
  }
  function selIds(){ return Object.keys(ST.sel).map(Number); }
  function selUi(){
    var n=selIds().length; $('#mbr-sel').textContent=n?n+'명 선택':''; $('[data-mb="send-sel"]', view).hidden=!n; $('[data-mb="unsel"]', view).hidden=!n;
    var boxes=$$('#mbr-rows [data-sel]'); $('#mbr-all').checked=boxes.length>0 && boxes.every(function(b){ return b.checked; });
  }
  form.addEventListener('submit', function(e){ e.preventDefault(); ST.page=1; load(); });
  form.addEventListener('change', function(e){ if(e.target.name!=='q'){ ST.page=1; load(); } });
  $('#mbr-all').addEventListener('change', function(){ var on=this.checked; ST.items.forEach(function(m){ if(on) ST.sel[m.id]=m.name; else delete ST.sel[m.id]; }); $$('#mbr-rows [data-sel]').forEach(function(b){ b.checked=on; }); selUi(); });
  $('#mbr-rows').addEventListener('change', function(e){ var b=e.target.closest('[data-sel]'); if(!b) return; var id=+b.getAttribute('data-sel'), m=ST.items.filter(function(x){ return x.id===id; })[0]; if(b.checked) ST.sel[id]=m?m.name:''; else delete ST.sel[id]; selUi(); });
  $('#mbr-rows').addEventListener('click', function(e){ if(e.target.closest('input,a,button')) return; var r=e.target.closest('[data-mid]'); if(r) openMember(+r.getAttribute('data-mid')); });
  $('#mbr-rows').addEventListener('keydown', function(e){ if(e.key!=='Enter') return; var r=e.target.closest('[data-mid]'); if(r && e.target===r) openMember(+r.getAttribute('data-mid')); });
  $('#mbr-pages').addEventListener('click', function(e){ var b=e.target.closest('[data-page]'); if(!b||b.disabled) return; ST.page=+b.getAttribute('data-page'); load(); window.scrollTo({ top:view.offsetTop, behavior:'smooth' }); });
  view.addEventListener('click', function(e){
    var b=e.target.closest('[data-mb]'); if(!b) return; var a=b.getAttribute('data-mb');
    if(a==='reload') load();
    if(a==='clear'){ form.reset(); form.elements.sort.value='new'; ST.page=1; load(); }
    if(a==='unsel'){ ST.sel={}; $$('#mbr-rows [data-sel]').forEach(function(x){ x.checked=false; }); selUi(); }
    if(a==='send-sel') compose({ ids:selIds(), label:'선택한 회원 '+selIds().length+'명' });
    if(a==='send-all') compose({ filter:readFilter(), label:'조건에 맞는 회원 '+num(ST.count)+'명' });
    if(a==='export'){ if(!confirm('조건에 맞는 회원 '+num(ST.count)+'명의 이름·연락처를 엑셀(CSV)로 내려받을까요? 내려받은 기록이 남습니다. 파일은 업무에만 쓰고 다 쓰면 지워 주세요.')) return; download(); }
    if(a==='history') history();
    if(a==='settings') settings();
  });
  function download(){
    fetch('/api/crm/export?'+qs(readFilter()), { credentials:'same-origin' }).then(function(r){ if(!r.ok) return r.json().then(function(j){ throw new Error(j.error||'내려받지 못했습니다.'); }); return r.blob(); })
      .then(function(blob){ var u=URL.createObjectURL(blob), a=document.createElement('a'); a.href=u; a.download='메가스팟_회원_'+new Date(Date.now()+9*3600e3).toISOString().slice(0,10)+'.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 4000); })
      .catch(oops);
  }

  /* ---------- 회원 상세 ---------- */
  function openMember(id){
    var b=drawer('회원 상세', '<p class="small muted">불러오는 중…</p>');
    C('/members/'+id).then(function(r){ drawMember(r); }).catch(function(e){ b.innerHTML='<p class="pf-msg">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</p>'; oops(e); });
  }
  function drawMember(r){
    var m=r.member, on=m.status==='active';
    var b=drawer(m.name+' · 회원 '+m.id, '<div class="mbr-d-head">'+(on?'<span class="st st-ok">이용 중</span>':'<span class="st st-cancel">이용 제한</span>')+(m.agree_marketing?'<span class="mbr-yes">마케팅 수신 동의</span>':'<span class="mbr-no">마케팅 수신 미동의</span>')+(r.host?'<span class="mbr-chip host">호스트 '+esc(r.host.code)+'</span>':'')+'</div>'
      +'<div class="kv">'+[['이메일','<a href="mailto:'+esc(m.email)+'">'+esc(m.email)+'</a>'],['휴대폰', m.phone?'<a href="tel:'+esc(String(m.phone).replace(/[^0-9]/g,''))+'">'+esc(m.phone)+'</a>':'<span class="muted">없음</span>'],['소속', esc(m.org||'')],['가입', esc(kst(m.created_at))],['최근 로그인', esc(m.last_login_at?kst(m.last_login_at):'기록 없음')],['약관 동의', esc(kst(m.agreed_at))]]
        .filter(function(x){ return x[1]; }).map(function(x){ return '<span>'+x[0]+'</span><div>'+x[1]+'</div>'; }).join('')+'</div>'
      +'<div class="mbr-d-act"><button class="btn btn-primary btn-sm" type="button" data-d="sms"'+(m.phone?'':' disabled')+'>문자 보내기</button><button class="btn btn-light btn-sm" type="button" data-d="kakao"'+(m.phone?'':' disabled')+'>알림톡 보내기</button><button class="btn btn-light btn-sm" type="button" data-d="email">이메일 보내기</button></div>'
      +'<h3 class="mt-2">메모 · 표시 <small class="muted">회원에게 보이지 않습니다</small></h3><form id="mbr-note" class="form"><div class="mbr-tags">'+Object.keys(TAGS).map(function(k){ return '<label class="chk"><input type="checkbox" name="tag" value="'+k+'"'+((m.tags||[]).indexOf(k)>=0?' checked':'')+'><span>'+esc(TAGS[k])+'</span></label>'; }).join('')+'</div>'
        +'<textarea class="textarea" name="memo" rows="3" maxlength="2000" placeholder="예: 매년 12월 송년회 담당. 견적은 이메일로 받기 원함.">'+esc(m.memo||'')+'</textarea><div class="row mt-1"><button class="btn btn-primary btn-sm" type="submit">메모 저장</button></div></form>'
      +'<h3 class="mt-2">문의·예약 <small class="muted">'+r.inquiries.length+'건 · 줄을 누르면 문의 상세가 열립니다</small></h3>'
      +(r.inquiries.length?'<div class="adm-list mbr-inq">'+r.inquiries.map(function(i){ return '<div class="adm-row" data-ref="'+esc(i.ref)+'" tabindex="0"><div class="r1"><b>'+esc(i.ref)+'</b><span class="small">'+esc(i.status)+'</span>'+(i.booking_code?'<span class="mbr-chip">예약 '+esc(i.booking_code)+(i.booking_status==='cancelled'?' · 취소':'')+'</span>':'')+'</div><div class="r2">'+esc([SPACE[i.space_id]||i.space_id, i.event_date||'날짜 미정', i.headcount?i.headcount+'명':''].filter(Boolean).join(' · '))+'</div><div class="r3"><span>문의 '+esc(kd(i.created_at))+'</span></div></div>'; }).join('')+'</div>':'<p class="small muted">아직 문의한 기록이 없습니다.</p>')
      +(r.host?'<h3 class="mt-2">호스트</h3><p class="small">'+esc(r.host.name)+' · '+esc(r.host.code)+' · 공간 '+r.host.spaces+'곳(공개 '+r.host.live+'곳) · <button class="pf-link" type="button" data-d="host">입점 심사·공간 보기</button></p>':'')
      +'<h3 class="mt-2">받은 메시지 <small class="muted">관리자 화면에서 보낸 것</small></h3>'
      +(r.messages.length?'<ul class="mbr-msgs">'+r.messages.map(function(x){ return '<li><span>'+esc(kd(x.updated_at))+'</span><b>'+esc(x.channel_label)+'</b> '+(x.purpose==='ad'?'<span class="mbr-chip ad">광고</span> ':'')+esc((x.subject||x.body||'').slice(0,40))+' <span class="muted">'+esc(x.status_label)+(x.error?' · '+esc(x.error):'')+'</span></li>'; }).join('')+'</ul>':'<p class="small muted">보낸 메시지가 없습니다.</p>')
      +'<h3 class="mt-2">계정 관리</h3><div class="mbr-d-act"><button class="btn btn-light btn-sm" type="button" data-d="consent">'+(m.agree_marketing?'마케팅 수신 동의 끄기':'마케팅 수신 동의 켜기')+'</button>'
        +'<button class="btn btn-light btn-sm" type="button" data-d="reset">임시 비밀번호 발급</button><button class="btn '+(on?'btn-ghost':'btn-light')+' btn-sm" type="button" data-d="status">'+(on?'이용 제한':'이용 제한 풀기')+'</button></div><p class="small" id="mbr-temp"></p>'
      +(r.consent.length?'<details class="mt-1"><summary class="small">마케팅 수신 동의 기록 '+r.consent.length+'건</summary><ul class="mbr-msgs">'+r.consent.map(function(c){ return '<li><span>'+esc(kst(c.created_at))+'</span>'+(c.value?'동의':'철회')+' · '+esc({ signup:'가입할 때', mypage:'마이페이지', unsubscribe_link:'수신거부 링크', admin:'관리자 변경' }[c.source]||c.source)+'</li>'; }).join('')+'</ul></details>':''));
    b.onsubmit=function(e){ e.preventDefault(); var f=e.target; C('/members/'+m.id+'/note', { method:'PUT', body:{ memo:f.elements.memo.value, tags:$$('input[name=tag]:checked', f).map(function(x){ return x.value; }) } }).then(function(){ M.toast('메모를 저장했습니다.'); load(); }).catch(oops); };
    b.onclick=function(e){
      var t=e.target.closest('[data-d]'); if(!t) return; var a=t.getAttribute('data-d');
      if(a==='sms'||a==='kakao'||a==='email') return compose({ ids:[m.id], label:m.name+' 님', channel:a, single:m });
      if(a==='host'){ X.closeDrawer(dr, true); X.go('hp-spaces'); return; }
      if(a==='consent'){ if(!confirm(m.agree_marketing?'회원이 요청한 경우에만 끄세요. 마케팅 수신 동의를 끌까요?':'회원이 직접 동의를 요청한 경우에만 켜세요(동의 받은 날짜·방법을 메모에 남겨 주세요). 켤까요?')) return;
        C('/members/'+m.id+'/consent', { method:'PUT', body:{ value:!m.agree_marketing } }).then(function(){ M.toast('바꿨습니다.'); openMember(m.id); load(); }).catch(oops); return; }
      if(a==='reset'){ if(!confirm(m.name+' 님에게 임시 비밀번호를 발급할까요? 가입 이름·휴대폰으로 본인인지 먼저 확인해 주세요.')) return;
        X.A('/members/'+m.id+'/reset-password', { method:'POST', body:{} }).then(function(r2){ $('#mbr-temp').innerHTML='임시 비밀번호 <b class="temp-pw">'+esc(r2.temp_password)+'</b> — 회원에게 알려 주고, 로그인한 뒤 바꾸도록 안내하세요.'; }).catch(oops); return; }
      if(a==='status'){ var st=on?'suspended':'active'; if(st==='suspended' && !confirm('이 회원의 로그인을 막을까요?')) return;
        X.A('/members/'+m.id, { method:'PATCH', body:{ status:st } }).then(function(){ M.toast('바꿨습니다.'); openMember(m.id); load(); }).catch(oops); }
    };
  }

  /* ---------- 보내기 ---------- */
  var SEND={ busy:false, ref:'' };
  function getCfg(force){ if(ST.cfg && !force) return Promise.resolve(ST.cfg); return C('/settings').then(function(r){ ST.cfg=r; return r; }); }
  function chState(c, k){ var s=c&&c.channels&&c.channels[k]; return s||{ ready:false, reason:'' }; }
  function compose(target){
    var b=drawer('메시지 보내기', '<p class="small muted">발송 설정을 확인하는 중…</p>');
    getCfg().then(function(cfg){ drawCompose(target, cfg); }).catch(function(e){ b.innerHTML='<p class="pf-msg">'+esc((e&&e.message)||'설정을 불러오지 못했습니다.')+'</p>'; oops(e); });
  }
  function drawCompose(target, cfg){
    var ch=target.channel||(['sms','kakao','email'].filter(function(k){ return chState(cfg,k).ready; })[0]||'sms');
    var b=drawer('메시지 보내기', '<form class="form mbr-compose" id="mbr-cf" novalidate>'
      +'<div class="mbr-to"><span>받는 사람</span><b>'+esc(target.label)+'</b><small>보내기 전에 미리보기로 실제로 받는 인원과 빠지는 사람을 확인합니다.</small></div>'
      +'<fieldset class="mbr-ch"><legend>보낼 방법</legend>'+['sms','kakao','email'].map(function(k){ var s=chState(cfg,k); return '<label class="mbr-ch-opt'+(s.ready?'':' off')+'"><input type="radio" name="channel" value="'+k+'"'+(k===ch?' checked':'')+'><span><b>'+CH[k]+'</b><small>'+(s.ready?(k==='kakao'?'정보성 안내만 · 실패하면 문자로 대신 감':'바로 보낼 수 있음'):esc(s.reason||'준비 중'))+'</small></span></label>'; }).join('')+'</fieldset>'
      +'<fieldset class="mbr-purpose"><legend>메시지 종류</legend><label class="mbr-ch-opt"><input type="radio" name="purpose" value="info" checked><span><b>정보성 안내</b><small>휴무·공사·이용 방법·약관 변경처럼 회원에게 꼭 알릴 내용. 수신 동의와 관계없이 보냅니다.</small></span></label>'
        +'<label class="mbr-ch-opt"><input type="radio" name="purpose" value="ad"><span><b>광고성 (이벤트·할인·홍보)</b><small>마케팅 수신 동의 회원에게만. 맨 앞에 (광고), 끝에 보내는 곳 연락처와 수신거부 방법이 자동으로 붙습니다. 광고 문자는 밤 9시~아침 8시에 보낼 수 없습니다.</small></span></label></fieldset>'
      +'<div class="f" data-only="email"><label for="mbr-subj">이메일 제목</label><input class="input" id="mbr-subj" name="subject" maxlength="100" placeholder="예: 12월 평일 오후 이용 안내"></div>'
      +'<div class="f"><label for="mbr-body">내용 <button class="pf-link mbr-ins" type="button" data-ins="{이름}">{이름} 넣기</button></label><textarea class="textarea" id="mbr-body" name="body" rows="7" maxlength="4000" placeholder="{이름}님, 안녕하세요. 메가스팟입니다.&#10;&#10;보낼 내용을 적어 주세요. {이름}은 받는 회원 이름으로 바뀝니다."></textarea><p class="small muted mbr-help" id="mbr-len"></p></div>'
      +'<div class="mbr-warn" id="mbr-warn" hidden></div>'
      +'<div class="row mbr-cf-act"><button class="btn btn-light btn-sm" type="button" data-c="preview">미리보기 · 받는 인원 확인</button></div>'
      +'<div id="mbr-pv"></div>'
      +'<details class="mbr-test"><summary>나에게 먼저 시험으로 보내기</summary><div class="row mt-1"><input class="input" name="test_to" placeholder="받을 휴대폰 번호 또는 이메일"><button class="btn btn-light btn-sm" type="button" data-c="test">시험 보내기</button></div><p class="small muted mbr-help">시험 메시지는 이름을 ‘홍길동’으로 바꿔 보냅니다.</p></details>'
      +'<div class="mbr-go"><button class="btn btn-primary" type="button" data-c="send" disabled>미리보기 후 보낼 수 있습니다</button><span id="mbr-prog" class="small"></span></div>'
      +'<div id="mbr-mailapp"></div>'
      +'</form>');
    var f=$('#mbr-cf'), pv=null;
    function val(n){ var el=f.elements[n]; if(!el) return ''; if(el.length && el[0] && el[0].type==='radio'){ var c=$$('input[name='+n+']:checked', f)[0]; return c?c.value:''; } return String(el.value||''); }
    function payload(){ var p={ channel:val('channel'), purpose:val('purpose'), subject:val('subject'), body:val('body'), target:target.ids?{ ids:target.ids }:{ filter:target.filter } }; return p; }
    function sync(){
      var c=val('channel'), p=val('purpose'), body=val('body');
      $$('[data-only="email"]', f).forEach(function(x){ x.hidden=c!=='email'; });
      if(c==='kakao' && p==='ad'){ $$('input[name=purpose]', f)[0].checked=true; p='info'; M.toast('카카오 알림톡은 정보성 안내만 보낼 수 있습니다.'); }
      $$('input[name=purpose]', f)[1].disabled=c==='kakao';
      var n=body.length, by=bytes(('[메가스팟] ')+body);
      $('#mbr-len').textContent=c==='email'?n+'자':n+'자 · 약 '+by+'바이트'+(p==='ad'?' (광고 문구·수신거부 안내가 더 붙음)':'')+' · '+(by<=90&&p!=='ad'?'단문 문자':'장문 문자')+(c==='kakao'?' · 알림톡은 템플릿 틀 안에 들어갑니다':'');
      var w=[]; var s=chState(cfg, c); if(!s.ready) w.push(esc(s.reason||'이 방법은 아직 준비 중입니다.'));
      if(p==='ad' && c==='sms' && !(cfg.config&&cfg.config.optout_080)) w.push('080 무료 수신거부 번호가 없어 수신거부 링크로 안내합니다. 광고 문자에는 080 번호를 쓰는 경우가 많으니 발송 설정에서 넣어 두세요.');
      var h=new Date(Date.now()+9*3600e3).getUTCHours(); if(p==='ad' && c==='sms' && (h>=21||h<8)) w.push('지금은 광고 문자를 보낼 수 없는 시간(밤 9시~아침 8시)입니다.');
      $('#mbr-warn').innerHTML=w.map(function(x){ return '<p>'+x+'</p>'; }).join(''); $('#mbr-warn').hidden=!w.length;
      pv=null; var sb=$('[data-c="send"]', f); sb.disabled=true; sb.textContent='미리보기 후 보낼 수 있습니다'; $('#mbr-pv').innerHTML='';
      $('#mbr-mailapp').innerHTML=c==='email' && !s.ready?'<div class="mbr-mailapp"><b>이메일 발송 서비스를 붙이기 전에는</b><p class="small">받는 주소를 모아 관리자 메일 프로그램(지메일·네이버 메일 등)에서 숨은 참조(BCC)로 보낼 수 있습니다.</p><button class="btn btn-light btn-sm" type="button" data-c="mailapp">받는 주소 모으기</button><div id="mbr-mail-list"></div></div>':'';
    }
    b.oninput=function(e){ if(e.target.name==='body'||e.target.name==='subject') sync(); };
    b.onchange=function(e){ if(e.target.name==='channel'||e.target.name==='purpose') sync(); };
    b.onclick=function(e){
      var ins=e.target.closest('[data-ins]'); if(ins){ var ta=f.elements.body, s=ta.selectionStart||ta.value.length; ta.value=ta.value.slice(0,s)+ins.getAttribute('data-ins')+ta.value.slice(ta.selectionEnd||s); ta.focus(); sync(); return; }
      var t=e.target.closest('[data-c]'); if(!t) return; var a=t.getAttribute('data-c');
      if(a==='preview'){ t.disabled=true; C('/preview', { method:'POST', body:payload() }).then(function(r){ pv=r; drawPreview(r); }).catch(oops).finally(function(){ t.disabled=false; }); }
      if(a==='test'){ var to=String(f.elements.test_to.value||'').trim(); if(!to) return M.toast('받을 번호나 이메일을 넣어 주세요.'); t.disabled=true;
        C('/test', { method:'POST', body:Object.assign(payload(), { to:to }) }).then(function(){ M.toast('시험 메시지를 보냈습니다. 받은 내용을 확인해 주세요.'); }).catch(oops).finally(function(){ t.disabled=false; }); }
      if(a==='send') send(t);
      if(a==='mailapp') mailApp(t);
      if(a==='stop' && SEND.ref){ C('/campaigns/'+SEND.ref+'/stop', { method:'POST', body:{} }).then(function(){ SEND.busy=false; M.toast('멈췄습니다. 이미 보낸 것은 되돌릴 수 없습니다.'); }).catch(oops); }
    };
    function drawPreview(r){
      var ex=r.excluded||{}, c=val('channel'), parts=[['no_consent','마케팅 수신 미동의'],['suspended','이용 제한'],['no_contact',c==='email'?'이메일 없음':'휴대폰 번호 없음·잘못됨'],['duplicate','같은 번호·주소 중복']].filter(function(x){ return ex[x[0]]; });
      var s=r.sample||{};
      $('#mbr-pv').innerHTML='<div class="mbr-pv"><div class="mbr-pv-n"><b>'+num(r.count)+'명</b>에게 보냅니다'+(parts.length?'<small>빠지는 회원: '+parts.map(function(x){ return x[1]+' '+num(ex[x[0]])+'명'; }).join(' · ')+'</small>':'')+'</div>'
        +(c==='email'?'<div class="mbr-mail"><div class="mbr-mail-subj">제목: '+esc(s.subject||'')+'</div><iframe title="이메일 미리보기" sandbox="" srcdoc="'+esc(s.html||'')+'"></iframe></div>'
          :'<div class="mbr-phone"><div class="mbr-bubble">'+esc(c==='kakao'?s.kakao||'':s.text||'').replace(/\n/g,'<br>')+'</div><small>'+(c==='kakao'?'알림톡 · 실패하면 아래 문자로 대신 감':esc(s.type||''))+'</small>'+(c==='kakao'?'<div class="mbr-bubble sms">'+esc(s.text||'').replace(/\n/g,'<br>')+'</div>':'')+'</div>')
        +'<p class="small muted">첫 번째 받는 회원 기준 미리보기입니다.</p></div>';
      var live=r.channels?{ channels:r.channels }:cfg, sb=$('[data-c="send"]', f), ready=chState(live, c).ready && r.count>0 && !r.night;
      sb.disabled=!ready; sb.textContent=!r.count?'보낼 수 있는 회원이 없습니다':r.night?'지금은 광고 문자를 보낼 수 없는 시간입니다':!chState(live, c).ready?'이 방법은 아직 준비 중입니다':num(r.count)+'명에게 '+CH[c]+' 보내기';
    }
    function send(btn){
      if(!pv) return; var p=payload();
      if(!confirm(num(pv.count)+'명에게 '+CH[p.channel]+'('+(p.purpose==='ad'?'광고성':'정보성')+')를 보냅니다. 보낸 뒤에는 되돌릴 수 없습니다. 보낼까요?')) return;
      btn.disabled=true; SEND.busy=true; var prog=$('#mbr-prog');
      C('/campaigns', { method:'POST', body:p }).then(function(r){ SEND.ref=r.ref; prog.innerHTML='보내는 중… 0 / '+num(r.total)+' <button class="pf-link" type="button" data-c="stop">멈추기</button>'; return loop(r.ref, r.total, prog); })
        .then(function(x){ SEND.busy=false; if(!x) return; prog.innerHTML='끝났습니다 · 접수 '+num(x.sent)+'건'+(x.failed?' · 실패 '+num(x.failed)+'건':'')+(x.unknown?' · 확인 필요 '+num(x.unknown)+'건':'')+(x.skipped?' · 보내기 전 제외 '+num(x.skipped)+'건':'')+' · <button class="pf-link" type="button" data-hist="'+esc(SEND.ref)+'">결과 보기</button>'; btn.textContent='보냈습니다'; load(); })
        .catch(function(e){ SEND.busy=false; btn.disabled=false; prog.textContent=(e&&e.message)||'보내지 못했습니다.'+(SEND.ref?' 보낸 기록에서 이어서 보낼 수 있습니다.':''); oops(e); });
    }
    sync();
  }
  // 서버가 한 번에 10명씩 보냅니다. 끝날 때까지 이어서 부릅니다.
  function loop(ref, total, prog){
    return C('/campaigns/'+ref+'/send', { method:'POST', body:{} }).then(function(r){
      var done=r.sent+r.failed+r.unknown+(r.skipped||0);
      if(prog) prog.innerHTML='보내는 중… '+num(done)+' / '+num(total)+' <button class="pf-link" type="button" data-c="stop">멈추기</button><span class="mbr-progress"><i style="width:'+Math.round(done/Math.max(1,total)*100)+'%"></i></span>';
      if(r.status==='done'||r.status==='stopped'||!SEND.busy) return r;
      return loop(ref, total, prog);
    });
  }
  function mailApp(btn){
    var f=$('#mbr-cf'), p={ purpose:($$('input[name=purpose]:checked', f)[0]||{}).value||'info', target:null }, target=CUR_TARGET;
    btn.disabled=true;
    C('/recipients', { method:'POST', body:{ purpose:p.purpose, target:target } }).then(function(r){
      var list=r.emails||[], groups=[]; for(var i=0;i<list.length;i+=40) groups.push(list.slice(i,i+40));
      var subj=String(f.elements.subject.value||''), body=String(f.elements.body.value||'');
      $('#mbr-mail-list').innerHTML='<p class="small mt-1"><b>'+num(list.length)+'개 주소</b>'+(p.purpose==='ad'?' · 광고성 메일은 제목 앞에 (광고)를 붙이고, 본문 끝에 보내는 곳 연락처와 수신거부 방법(답장으로 수신거부)을 꼭 넣어 주세요.':'')+'</p>'
        +'<div class="row mt-1">'+groups.map(function(g, i){ var href='mailto:?bcc='+encodeURIComponent(g.join(','))+'&subject='+encodeURIComponent((p.purpose==='ad'?'(광고) ':'[메가스팟] ')+subj)+'&body='+encodeURIComponent(body.replace(/\{이름\}/g,'회원')); return '<a class="btn btn-light btn-sm" href="'+esc(href)+'">메일 프로그램 열기 '+(groups.length>1?(i+1)+'/'+groups.length:'')+'</a>'; }).join('')+'<button class="btn btn-light btn-sm" type="button" data-copy-mails>주소 모두 복사</button></div>'
        +'<p class="small muted mbr-help">메일 프로그램은 한 번에 40명씩 숨은 참조(BCC)로 엽니다. 받는 사람 칸에는 관리자 주소를 넣으세요. {이름}은 ‘회원’으로 바뀝니다.</p>';
      $('[data-copy-mails]').onclick=function(){ M.copy(list.join(', ')).then(function(ok){ M.toast(ok?'주소를 복사했습니다.':'복사하지 못했습니다.'); }); };
    }).catch(oops).finally(function(){ btn.disabled=false; });
  }
  var CUR_TARGET=null, _compose=compose;
  compose=function(target){ CUR_TARGET=target.ids?{ ids:target.ids }:{ filter:target.filter }; return _compose(target); };

  /* ---------- 보낸 기록 ---------- */
  function history(){
    var b=drawer('보낸 메시지 기록', '<p class="small muted">불러오는 중…</p>');
    C('/campaigns').then(function(r){
      var list=r.items||[];
      b.innerHTML=list.length?'<div class="adm-list">'+list.map(function(c){ var left=c.total-c.sent-c.failed-c.unknown;
        return '<div class="adm-row mbr-camp" data-hist="'+esc(c.ref)+'" tabindex="0"><div class="r1"><span class="st '+(c.status==='done'?'st-ok':c.status==='stopped'?'st-cancel':'st-new')+'">'+esc(c.status_label)+'</span><b>'+esc(c.channel_label)+'</b>'+(c.purpose==='ad'?'<span class="mbr-chip ad">광고</span>':'<span class="mbr-chip">정보성</span>')+'<span class="small muted">'+esc(c.ref)+' · '+esc(kst(c.created_at))+'</span></div>'
          +'<div class="r2">'+esc((c.subject?c.subject+' — ':'')+(c.body||'').slice(0,90))+'</div><div class="r3"><span>대상 '+num(c.total)+' · 접수 '+num(c.sent)+(c.failed?' · 실패 '+num(c.failed):'')+(c.unknown?' · 확인 필요 '+num(c.unknown):'')+'</span>'+(['ready','sending'].indexOf(c.status)>=0&&left>0?'<button class="btn btn-light btn-sm" type="button" data-resume="'+esc(c.ref)+'" data-total="'+c.total+'">이어서 보내기</button>':'')+'</div></div>'; }).join('')+'</div>'
        :'<p class="small muted">아직 보낸 메시지가 없습니다.</p>';
    }).catch(function(e){ b.innerHTML='<p class="pf-msg">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</p>'; oops(e); });
  }
  function targets(ref){
    var b=drawer('보낸 결과 · '+ref, '<p class="small muted">불러오는 중…</p>');
    C('/campaigns/'+ref).then(function(r){
      b.innerHTML='<button class="btn btn-light btn-sm" type="button" data-back>← 보낸 기록</button><div class="mbr-table-wrap mt-1"><table class="mbr-table"><thead><tr><th>회원</th><th>받는 곳</th><th>결과</th><th>시각</th></tr></thead><tbody>'
        +(r.items||[]).map(function(t){ return '<tr><td>'+esc(t.name||'회원 '+t.member_id)+'</td><td>'+esc(t.receiver)+'</td><td>'+esc(t.status_label)+(t.error?'<small>'+esc(t.error)+'</small>':'')+'</td><td>'+esc(kst(t.updated_at))+'</td></tr>'; }).join('')+'</tbody></table></div>'
        +'<p class="small muted mbr-help">‘접수’는 문자·알림톡·이메일 업체가 받은 상태입니다. 휴대폰 꺼짐 등으로 실제 도착하지 않은 건은 업체 전송 내역에서 확인할 수 있습니다. ‘확인 필요’는 응답을 받지 못한 건이라 다시 보내지 않았습니다.</p>';
    }).catch(oops);
  }
  dr.addEventListener('click', function(e){
    var r=e.target.closest('[data-resume]'); if(r){ e.stopPropagation(); var ref=r.getAttribute('data-resume'), total=+r.getAttribute('data-total'); if(!confirm('남은 회원에게 이어서 보낼까요?')) return; r.disabled=true; SEND.busy=true; SEND.ref=ref; r.textContent='보내는 중…';
      loop(ref, total, null).then(function(x){ SEND.busy=false; M.toast('끝났습니다 · 접수 '+num(x.sent)+'건'); history(); }).catch(function(x){ SEND.busy=false; oops(x); history(); }); return; }
    if(e.target.closest('[data-back]')) return history();
    var h=e.target.closest('[data-hist]'); if(h && !e.target.closest('button:not([data-hist])')) targets(h.getAttribute('data-hist'));
  });

  /* ---------- 발송 설정 ---------- */
  function settings(){
    var b=drawer('발송 설정', '<p class="small muted">불러오는 중…</p>');
    getCfg(true).then(function(r){
      var c=r.config||{}, t=r.template||{};
      var line=function(k, label){ var s=chState(r, k); return '<li><b>'+label+'</b> '+(s.ready?'<span class="mbr-yes">보낼 수 있음</span>':'<span class="mbr-no">준비 중</span>')+(s.ready?'':'<small>'+esc(s.reason||'')+'</small>')+'</li>'; };
      b.innerHTML='<h3>보내는 길</h3><ul class="mbr-chs">'+line('sms','문자')+line('kakao','카카오 알림톡')+line('email','이메일')+'</ul>'
        +'<form class="form mt-2" id="mbr-set"><h3>광고성 메시지에 붙는 정보</h3>'
        +'<div class="field-row"><div class="f"><label>보내는 곳 연락처</label><input class="input" name="contact" maxlength="20" value="'+esc(c.contact||'')+'"></div><div class="f"><label>080 무료 수신거부 번호 (있으면)</label><input class="input" name="optout_080" maxlength="15" placeholder="080-000-0000" value="'+esc(c.optout_080||'')+'"></div></div>'
        +'<p class="small muted mbr-help">광고 문자 끝에 ‘메가스팟 연락처’와 ‘무료수신거부 080…’(없으면 수신거부 링크)이 붙습니다. 수신거부 링크를 누른 회원은 바로 마케팅 수신 동의가 꺼집니다.</p>'
        +'<h3 class="mt-2">카카오 알림톡 ‘회원 안내’ 템플릿</h3><p class="small">알리고에 아래 내용 그대로 템플릿을 등록하고 카카오 승인을 받은 뒤, 코드를 넣고 ‘승인 확인’을 누르세요. 알림톡은 정보성 안내만 보낼 수 있고, 승인 여부는 카카오 심사에 따라 달라질 수 있습니다. 연결 서버에도 같은 코드를 ALIGO_MEMBER_TEMPLATE_CODES로 넣어야 합니다.</p>'
        +'<pre class="mbr-tpl">'+esc(t.content||'')+'</pre><p class="small muted">버튼: '+esc((t.buttons||[]).map(function(x){ return x.name+' (웹링크 '+x.linkMo+')'; }).join(', '))+' <button class="pf-link" type="button" data-copy-tpl>본문 복사</button></p>'
        +'<div class="row mt-1"><input class="input" name="kakao_code" maxlength="30" placeholder="예: UN_1234" value="'+esc(c.kakao_code||'')+'" style="max-width:200px"><button class="btn btn-light btn-sm" type="button" data-kcheck>승인 확인</button></div>'
        +'<div class="row mt-2"><button class="btn btn-primary btn-sm" type="submit">저장</button></div></form>'
        +'<h3 class="mt-2">이메일</h3><p class="small">이메일 발송 서비스 Resend(resend.com)에 megaspot.kr 도메인을 등록하고, Cloudflare Pages 환경 변수에 <code>RESEND_API_KEY</code>와 <code>MAIL_FROM</code>(예: 메가스팟 &lt;hello@megaspot.kr&gt;)을 넣으면 여기서 바로 보냅니다. 붙이기 전에는 보내기 화면의 ‘받는 주소 모으기’로 관리자 메일 프로그램에서 보내세요.</p>';
      b.onsubmit=function(e){ e.preventDefault(); var f=e.target; C('/settings', { method:'PUT', body:{ contact:f.elements.contact.value, optout_080:f.elements.optout_080.value, kakao_code:f.elements.kakao_code.value } }).then(function(){ M.toast('저장했습니다.'); settings(); }).catch(oops); };
      b.onclick=function(e){
        if(e.target.closest('[data-copy-tpl]')) return M.copy(t.content||'').then(function(ok){ M.toast(ok?'템플릿 본문을 복사했습니다.':'복사하지 못했습니다.'); });
        var k=e.target.closest('[data-kcheck]'); if(k){ k.disabled=true; var f=$('#mbr-set'); C('/settings', { method:'PUT', body:{ kakao_code:f.elements.kakao_code.value } }).then(function(){ return C('/settings/kakao-check', { method:'POST', body:{} }); })
          .then(function(x){ M.toast(x.ready?'승인을 확인했습니다. 이제 알림톡으로 보낼 수 있습니다.':'아직 쓸 수 없습니다 · 상태 '+(x.review||'확인 안 됨')+(x.matches===false?' · 본문·버튼이 다릅니다':'')); settings(); }).catch(oops).finally(function(){ k.disabled=false; }); }
      };
    }).catch(function(e){ b.innerHTML='<p class="pf-msg">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</p>'; oops(e); });
  }

  // 기존 admin.js 의 회원 불러오기 다음에 이 화면을 불러옵니다
  X.register('members', function(){ load(); });
})();
