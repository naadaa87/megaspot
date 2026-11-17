/* 관리자 · 커뮤니티 관리 (2026-11-17)
   모임 소개 게시판과 자유게시판의 글·댓글·신고를 관리합니다.
   · 글: 검토 대기 글 게시·반려, 숨김·삭제, 상단 고정·추천, 예약 게시, 내용 고치기, 운영팀 댓글
   · 운영팀 글쓰기(공지·예약 게시·임시 저장) · 신고 처리 · 댓글 관리 · 게시 방식·금지어·글쓰기 제한 설정
   서버: /api/community/admin/* (functions/api/community/[[path]].js) */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var main=document.querySelector('.adm-main'); if(!main) return;
  var esc=X.esc;
  function $(s, r){ return (r||document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function A(path, opts){ return M.api('/community/admin/'+path, opts||{}); }
  function oops(e){ if(X.guard(e)) return; M.toast((e&&e.message)||'처리하지 못했습니다.'); }
  function kst(s){ var d=new Date(String(s||'').replace(' ','T')+'Z'); return isNaN(d)?'':new Date(d.getTime()+9*3600e3).toISOString().slice(0,16).replace('T',' '); }
  function kstInput(s){ var k=kst(s); return k?k.replace(' ','T'):''; }
  function num(n){ return Number(n||0).toLocaleString('ko-KR'); }
  function opts(pairs, sel){ return pairs.map(function(p){ return '<option value="'+esc(p[0])+'"'+(String(p[0])===String(sel)?' selected':'')+'>'+esc(p[1])+'</option>'; }).join(''); }
  function text(s){ return esc(s).replace(/\n/g,'<br>'); }
  var BOARDS={ group:'모임 소개', free:'자유게시판' };
  var GROUP_CATS={ networking:'네트워킹·교류', study:'스터디·자기계발', hobby:'취미·동호회', sports:'운동·아웃도어', culture:'문화·예술', social:'친목·파티', biz:'비즈니스·창업', volunteer:'봉사·나눔', etc:'기타' };
  var FREE_CATS={ notice:'공지', talk:'사는 이야기', question:'질문', review:'공간·행사 후기', tip:'행사 준비 팁', together:'함께해요' };
  var ST_CLS={ pending:'st-new', published:'st-ok', hidden:'st-cancel', rejected:'st-pay', draft:'st-done', deleted:'st-del' };
  function cats(b){ return b==='group'?GROUP_CATS:FREE_CATS; }
  function stBadge(x){ return '<span class="st '+(x.scheduled?'st-quote':(ST_CLS[x.status]||''))+'">'+esc(x.status_label)+'</span>'; }
  function viewUrl(x){ return (x.board==='group'?'/community/groups/view/?id=':'/community/free/view/?id=')+encodeURIComponent(x.ref); }

  /* ---------- 화면 틀 ---------- */
  var sec=document.createElement('section'); sec.className='adm-view cmd-view'; sec.id='view-community'; sec.hidden=true;
  sec.innerHTML='<header class="adm-head"><div><h1>커뮤니티 관리</h1><p class="small muted">모임 소개 게시판과 자유게시판의 글·댓글·신고를 관리합니다. 검토 대기 글을 게시하거나 반려하고, 공지·상단 고정·추천 모임·예약 게시를 정합니다. 회원 화면의 글쓰기·댓글·신고는 로그인한 회원만 할 수 있습니다.</p></div>'
    +'<div class="row cmd-head-act"><a class="btn btn-light btn-sm" href="/community/" target="_blank" rel="noopener">커뮤니티 열기 ↗</a><button class="btn btn-primary btn-sm" type="button" data-ca="write">운영팀 글쓰기</button><button class="btn btn-light btn-sm" type="button" data-ca="reload">새로고침</button></div></header>'
    +'<div class="cmd-tiles" id="cmd-tiles"></div>'
    +'<nav class="cmd-tabs" role="tablist" aria-label="커뮤니티 관리"><button type="button" role="tab" data-tab="posts" class="on">글</button><button type="button" role="tab" data-tab="reports">신고 <em id="cmd-rep-n" hidden></em></button><button type="button" role="tab" data-tab="comments">댓글</button><button type="button" role="tab" data-tab="settings">운영 설정</button></nav>'
    +'<div id="cmd-pane"></div>';
  main.appendChild(sec);
  var dr=document.createElement('div'); dr.className='adm-drawer cmd-drawer'; dr.id='cmd-drawer'; dr.hidden=true;
  dr.innerHTML='<div class="adm-drawer-bg" data-close></div><div class="adm-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="cmd-d-title"><div class="adm-drawer-head"><h2 id="cmd-d-title"></h2><button class="btn btn-light btn-sm" type="button" data-close>닫기 ✕</button></div><div class="adm-drawer-body" id="cmd-d-body"></div></div>';
  document.body.appendChild(dr);
  dr.addEventListener('click', function(e){ if(e.target.closest('[data-close]')) X.closeDrawer(dr, true); });
  function drawer(title, html){ $('#cmd-d-title').textContent=title; var b=$('#cmd-d-body'); b.innerHTML=html; if(dr.hidden) X.openDrawer('#cmd-drawer'); b.scrollTop=0; b.onclick=null; b.onsubmit=null; b.onchange=null; b.oninput=null; return b; }

  var S={ tab:'posts', f:{ board:'', status:'', flag:'', q:'', sort:'', cat:'' }, page:1, sel:{}, items:[], cf:{ status:'', q:'', flag:'' }, cpage:1, rf:'new', summary:{} };

  /* ---------- 요약 ---------- */
  function summary(){
    return A('summary').then(function(s){
      S.summary=s;
      var tiles=[['검토 대기',s.pending,'posts:pending','운영팀 확인을 기다리는 글'],['새 신고',s.reports_new,'reports',''],['고친 뒤 확인 필요',s.recheck,'posts:recheck','게시 중에 글쓴이가 고친 모임 소개'],['숨김',s.hidden,'posts:hidden','신고로 자동 숨김 포함'],['예약 게시',s.scheduled,'posts:scheduled',''],['임시 저장',s.draft,'posts:draft',''],
        ['게시 중 모임 소개',s.groups,'posts:group',''],['게시 중 자유게시판',s.free,'posts:free',''],['최근 24시간',num(s.posts_24h)+'글 · '+num(s.comments_24h)+'댓글','','']];
      $('#cmd-tiles').innerHTML=tiles.map(function(t){ var hot=(t[2]==='posts:pending'||t[2]==='reports'||t[2]==='posts:recheck')&&+t[1]>0;
        return '<button type="button" class="cmd-tile'+(hot?' hot':'')+'"'+(t[2]?' data-tile="'+t[2]+'"':' disabled')+'><span>'+esc(t[0])+'</span><b>'+(typeof t[1]==='number'?num(t[1]):esc(t[1]))+'</b>'+(t[3]?'<small>'+esc(t[3])+'</small>':'')+'</button>'; }).join('');
      var rn=$('#cmd-rep-n'); rn.textContent=s.reports_new||''; rn.hidden=!s.reports_new;
      X.setCount('community', (s.pending||0)+(s.reports_new||0)+(s.recheck||0));
    }).catch(function(e){ if(!X.guard(e)) $('#cmd-tiles').innerHTML='<p class="small muted">'+esc((e&&e.message)||'요약을 불러오지 못했습니다.')+'</p>'; });
  }
  sec.addEventListener('click', function(e){
    var t=e.target.closest('[data-tile]'); if(t){ var v=t.dataset.tile.split(':');
      if(v[0]==='reports'){ S.rf='new'; tab('reports'); return; }
      S.f={ board:'', status:'', flag:'', q:'', sort:'', cat:'' }; S.page=1;
      if(v[1]==='group'||v[1]==='free'){ S.f.board=v[1]; S.f.status='live'; } else if(v[1]==='recheck') S.f.flag='recheck'; else S.f.status=v[1];
      tab('posts'); return; }
    var tb=e.target.closest('[data-tab]'); if(tb){ tab(tb.dataset.tab); return; }
    var ca=e.target.closest('[data-ca]'); if(ca){ if(ca.dataset.ca==='write') writeDrawer(); else { summary(); tab(S.tab); } }
  });
  function tab(t){ S.tab=t; $$('.cmd-tabs [data-tab]', sec).forEach(function(b){ var on=b.dataset.tab===t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }); ({ posts:posts, reports:reports, comments:comments, settings:settings })[t](); }

  /* ---------- 글 목록 ---------- */
  function posts(){
    var f=S.f, pane=$('#cmd-pane');
    pane.innerHTML='<form class="adm-card cmd-filter" id="cmd-pf" novalidate>'
      +'<div class="cmd-f-main"><label class="sr-only" for="cmd-q">글 찾기</label><input class="input" id="cmd-q" name="q" type="search" value="'+esc(f.q)+'" placeholder="제목·내용·글쓴이·이메일·글번호로 찾기"><button class="btn btn-primary btn-sm" type="submit">찾기</button><button class="btn btn-ghost btn-sm" type="button" data-pf="clear">조건 지우기</button></div>'
      +'<div class="cmd-f-row">'
        +'<label>게시판<select class="select" name="board">'+opts([['','전체'],['group','모임 소개'],['free','자유게시판']], f.board)+'</select></label>'
        +'<label>상태<select class="select" name="status">'+opts([['','삭제 빼고 전체'],['pending','검토 대기'],['live','게시 중'],['scheduled','예약 게시'],['draft','임시 저장'],['hidden','숨김'],['rejected','반려'],['deleted','삭제'],['all','삭제 포함 전체']], f.status)+'</select></label>'
        +'<label>표시<select class="select" name="flag">'+opts([['','전체'],['reported','신고 있음'],['recheck','고친 뒤 확인 필요'],['official','운영팀 글'],['pinned','상단 고정'],['featured','추천 모임']], f.flag)+'</select></label>'
        +'<label>정렬<select class="select" name="sort">'+opts([['','검토 대기 먼저'],['new','최근 쓴 글'],['old','오래된 글'],['views','조회 많은 순'],['reports','신고 많은 순']], f.sort)+'</select></label>'
      +'</div></form>'
      +'<div class="cmd-bar" id="cmd-bar"><span class="small" id="cmd-count"></span><span class="cmd-bar-act" id="cmd-bulk" hidden><span class="small" id="cmd-sel"></span><button class="btn btn-primary btn-sm" type="button" data-bulk="publish">게시</button><button class="btn btn-light btn-sm" type="button" data-bulk="hide">숨김</button><button class="btn btn-light btn-sm" type="button" data-bulk="pin">상단 고정</button><button class="btn btn-light btn-sm" type="button" data-bulk="unpin">고정 해제</button><button class="btn btn-ghost btn-sm" type="button" data-bulk="delete">삭제</button><button class="btn btn-ghost btn-sm" type="button" data-bulk="clear">선택 해제</button></span></div>'
      +'<div class="adm-card cmd-table-wrap"><table class="cmd-table"><thead><tr><th class="c"><input type="checkbox" id="cmd-all" aria-label="이 쪽 글 모두 선택"></th><th>상태</th><th>게시판</th><th>제목</th><th>글쓴이</th><th>날짜</th><th class="n">조회·공감·댓글</th></tr></thead><tbody id="cmd-rows"><tr><td colspan="7" class="cmd-empty">불러오는 중…</td></tr></tbody></table></div>'
      +'<nav class="cmd-pages" id="cmd-pages" aria-label="쪽"></nav>';
    var form=$('#cmd-pf');
    form.addEventListener('submit', function(e){ e.preventDefault(); read(); });
    form.addEventListener('change', function(e){ if(e.target.name!=='q') read(); });
    form.addEventListener('click', function(e){ if(e.target.closest('[data-pf="clear"]')){ S.f={ board:'', status:'', flag:'', q:'', sort:'', cat:'' }; S.page=1; posts(); } });
    function read(){ ['q','board','status','flag','sort'].forEach(function(k){ S.f[k]=String(form.elements[k].value||'').trim(); }); S.page=1; S.sel={}; loadPosts(); }
    $('#cmd-rows').addEventListener('click', function(e){ if(e.target.closest('input')) return; var tr=e.target.closest('tr[data-cref]'); if(tr) openPost(tr.dataset.cref); });
    $('#cmd-rows').addEventListener('keydown', function(e){ if(e.key==='Enter'){ var tr=e.target.closest('tr[data-cref]'); if(tr) openPost(tr.dataset.cref); } });
    $('#cmd-rows').addEventListener('change', function(e){ var c=e.target.closest('[data-sel]'); if(!c) return; if(c.checked) S.sel[c.dataset.sel]=1; else delete S.sel[c.dataset.sel]; selUi(); });
    $('#cmd-all').addEventListener('change', function(){ var on=this.checked; $$('#cmd-rows [data-sel]').forEach(function(c){ c.checked=on; if(on) S.sel[c.dataset.sel]=1; else delete S.sel[c.dataset.sel]; }); selUi(); });
    $('#cmd-bar').addEventListener('click', function(e){ var b=e.target.closest('[data-bulk]'); if(!b) return; var a=b.dataset.bulk, refs=Object.keys(S.sel);
      if(a==='clear'){ S.sel={}; $$('#cmd-rows [data-sel]').forEach(function(c){ c.checked=false; }); selUi(); return; }
      if(!refs.length) return; if(a==='delete' && !confirm('고른 글 '+refs.length+'개를 지울까요? 지운 글은 30일 뒤 완전히 지워집니다.')) return;
      b.disabled=true; A('bulk',{ method:'POST', body:{ refs:refs, action:a } }).then(function(r){ M.toast(r.done+'개를 처리했습니다.'+(r.failed&&r.failed.length?' '+r.failed.length+'개는 처리하지 못했습니다.':'')); S.sel={}; loadPosts(); summary(); }).catch(oops).then(function(){ b.disabled=false; }); });
    $('#cmd-pages').addEventListener('click', function(e){ var b=e.target.closest('[data-page]'); if(!b) return; S.page=+b.dataset.page; loadPosts(); });
    loadPosts();
  }
  function selUi(){ var n=Object.keys(S.sel).length, b=$('#cmd-bulk'); if(!b) return; b.hidden=!n; $('#cmd-sel').textContent=n+'개 고름'; }
  function loadPosts(){
    var p=new URLSearchParams({ page:S.page, size:30 }); Object.keys(S.f).forEach(function(k){ if(S.f[k]) p.set(k, S.f[k]); });
    var box=$('#cmd-rows'); if(!box) return;
    A('posts?'+p.toString()).then(function(r){
      S.items=r.items||[]; $('#cmd-count').textContent='조건에 맞는 글 '+num(r.total)+'개';
      box.innerHTML=S.items.length?S.items.map(rowHtml).join(''):'<tr><td colspan="7" class="cmd-empty">조건에 맞는 글이 없습니다.</td></tr>';
      var all=$('#cmd-all'); if(all) all.checked=false; selUi();
      var n=Math.max(1, Math.ceil((r.total||0)/r.size)), h=[]; if(n>1){ for(var i=Math.max(1,S.page-5);i<=Math.min(n,Math.max(1,S.page-5)+9);i++) h.push('<button type="button" class="btn btn-sm '+(i===S.page?'btn-dark':'btn-light')+'" data-page="'+i+'">'+i+'</button>'); }
      $('#cmd-pages').innerHTML=h.join('');
    }).catch(function(e){ if(X.guard(e)) return; box.innerHTML='<tr><td colspan="7" class="cmd-empty">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</td></tr>'; });
  }
  function chips(x){
    return (x.pinned?'<span class="cmd-chip pin">고정</span>':'')+(x.featured?'<span class="cmd-chip pick">추천</span>':'')+(x.official?'<span class="cmd-chip off">운영팀</span>':'')
      +(x.reports?'<span class="cmd-chip rep">신고 '+x.reports+'</span>':'')+(x.recheck?'<span class="cmd-chip chk">확인 필요</span>':'')+(x.auto_hidden?'<span class="cmd-chip rep">자동 숨김</span>':'');
  }
  function rowHtml(x){
    return '<tr data-cref="'+esc(x.ref)+'" tabindex="0"><td class="c"><input type="checkbox" data-sel="'+esc(x.ref)+'"'+(S.sel[x.ref]?' checked':'')+' aria-label="'+esc(x.title)+' 고르기"></td>'
      +'<td>'+stBadge(x)+'</td><td><span class="cmd-lb">'+esc(x.board_label)+'</span><small>'+esc(x.cat_label)+'</small></td>'
      +'<td><b class="cmd-title">'+esc(x.title)+'</b> '+chips(x)+'<small>'+esc(x.ref)+'</small></td>'
      +'<td>'+esc(x.author)+(x.blocked?' <span class="cmd-chip rep">글쓰기 제한</span>':'')+'<small>'+esc(x.member_email||(x.official?'운영팀':''))+'</small></td>'
      +'<td>'+esc(kst(x.created_at).slice(0,10))+(x.scheduled?'<small>게시 '+esc(kst(x.published_at))+'</small>':'')+'</td>'
      +'<td class="n">'+num(x.views)+' · '+num(x.likes)+' · '+num(x.comments)+'</td></tr>';
  }

  /* ---------- 글 상세 (서랍) ---------- */
  function openPost(ref){
    var b=drawer(ref, '<div class="empty small">불러오는 중…</div>');
    A('posts/'+encodeURIComponent(ref)).then(function(d){ renderPost(d); }).catch(function(e){ if(!X.guard(e)) b.innerHTML='<p class="small muted">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</p>'; });
  }
  function renderPost(d){
    var x=d.item, raw=x.raw||{}, g=x.board==='group', live=x.status==='published'&&!x.scheduled;
    var facts=g?[['한 줄 소개',x.summary],['활동 지역',x.region],['모임 주기',x.cycle_label],['모이는 때',x.schedule],['규모',x.size_label],['회비',x.fee==='free'?'없음':x.fee==='paid'?(x.fee_text||'있음'):''],['메가스팟 공간',x.venue_label],['멤버 모집',x.recruiting===false?'받지 않음':'모집 중'],
      ['참여 링크',raw.join_url?'<a href="'+esc(raw.join_url)+'" target="_blank" rel="noopener nofollow">'+esc(raw.join_url)+'</a>':'',1],['문의 링크',raw.contact_url?'<a href="'+esc(raw.contact_url)+'" target="_blank" rel="noopener nofollow">'+esc(raw.contact_url)+'</a>':'',1],['전화',x.contact_phone],['이메일',x.contact_email],['카카오톡 아이디',raw.kakao_id],['문의 안내',raw.contact_note],['모임 모집 번호',raw.meetup_ref],['태그',(x.tags||[]).join(', ')]]:[];
    var act='<div class="cmd-d-act">'
      +(x.status!=='published'?'<button class="btn btn-primary btn-sm" type="button" data-pa="publish">'+(x.status==='pending'?'확인 완료 · 게시':'게시하기')+'</button>':'')
      +(x.status==='published'?'<button class="btn btn-light btn-sm" type="button" data-pa="hide">숨기기</button>':'')
      +(x.recheck?'<button class="btn btn-light btn-sm" type="button" data-pa="checked">고친 내용 확인함</button>':'')
      +(x.status==='pending'||x.status==='published'?'<button class="btn btn-light btn-sm" type="button" data-pa="reject">반려…</button>':'')
      +'<button class="btn btn-light btn-sm" type="button" data-pa="pin">'+(x.pinned?'상단 고정 풀기':'상단 고정')+'</button>'
      +(g?'<button class="btn btn-light btn-sm" type="button" data-pa="feature">'+(x.featured?'추천 풀기':'추천 모임으로')+'</button>':'')
      +(live?'<a class="btn btn-light btn-sm" href="'+viewUrl(x)+'" target="_blank" rel="noopener">공개 화면 ↗</a>':'')
      +(x.status!=='deleted'?'<button class="btn btn-ghost btn-sm" type="button" data-pa="delete">삭제</button>':'')+'</div>';
    var who=x.official?'<p class="small">메가스팟 운영팀 글</p>'
      :'<div class="cmd-who"><div><b>'+esc(x.author)+'</b> <span class="muted small">(회원 '+esc(x.member_name||'탈퇴한 회원')+' · '+esc(x.member_email||'')+(x.member_phone?' · '+esc(x.member_phone):'')+')</span><small>이 회원의 글 '+num(x.member_posts)+'개'+(x.member_status==='suspended'?' · 회원 이용 제한 중':'')+'</small></div>'
        +(x.member_id?'<button class="btn btn-ghost btn-sm" type="button" data-pa="block">'+(x.blocked?'글쓰기 제한 풀기':'글쓰기 제한…')+'</button>':'')+'</div>';
    var reports=(d.reports||[]).filter(function(r){ return !r.comment_id; });
    var html='<div class="cmd-d-head">'+stBadge(x)+'<span class="cmd-chip">'+esc(x.board_label)+' · '+esc(x.cat_label)+'</span>'+chips(x)+'</div>'
      +'<h3 class="cmd-d-title">'+esc(x.title)+'</h3>'
      +'<p class="small muted">'+esc(x.ref)+' · 쓴 때 '+esc(kst(x.created_at))+(x.publish_at?' · 게시 '+esc(kst(x.publish_at)):'')+(x.updated_at?' · 고친 때 '+esc(kst(x.updated_at)):'')+' · 조회 '+num(x.views)+' · 공감 '+num(x.likes)+' · 댓글 '+num(x.comments)+'</p>'
      +(x.recheck?'<div class="cmd-note warn">글쓴이가 게시 뒤에 내용을 고쳤습니다. 내용을 확인하고 ‘고친 내용 확인함’을 눌러 주세요.</div>':'')
      +(x.auto_hidden?'<div class="cmd-note warn">서로 다른 회원의 신고가 쌓여 자동으로 숨겼습니다. 문제가 없으면 ‘게시하기’로 되돌리세요.</div>':'')
      +(x.reject_reason?'<div class="cmd-note">반려 이유: '+esc(x.reject_reason)+'</div>':'')
      +act+who
      +(facts.length?'<dl class="cmd-facts">'+facts.filter(function(f){ return f[1]; }).map(function(f){ return '<div><dt>'+esc(f[0])+'</dt><dd>'+(f[2]?f[1]:esc(f[1]))+'</dd></div>'; }).join('')+'</dl>':'')
      +'<div class="cmd-body">'+text(x.body||'')+'</div>'
      +(reports.length?'<h4 class="cmd-h">이 글에 들어온 신고 '+reports.length+'건</h4><ul class="cmd-replist">'+reports.map(function(r){ return '<li><span class="st '+(r.status==='new'?'st-new':r.status==='done'?'st-ok':'st-done')+'">'+(r.status==='new'?'새 신고':r.status==='done'?'조치함':'문제 없음')+'</span> <b>'+esc(r.reason_label)+'</b> '+esc(r.detail||'')+' <small>'+esc(kst(r.created_at))+'</small></li>'; }).join('')+'</ul>':'')
      +'<details class="cmd-sec"'+(x.official&&x.status==='draft'?' open':'')+'><summary>게시 시각 · 운영 메모</summary><form id="cmd-meta" class="cmd-form"><label>게시 시각 (한국 시간)<input class="input" type="datetime-local" name="publish_at" value="'+esc(kstInput(x.publish_at))+'"><small>지금보다 뒤로 정하면 그때 목록에 나타납니다.</small></label><label>운영 메모 <span class="muted">(운영팀만 봄)</span><textarea class="textarea" name="admin_note" rows="2" maxlength="1000">'+esc(x.admin_note||'')+'</textarea></label><button class="btn btn-light btn-sm" type="submit">저장</button></form></details>'
      +'<details class="cmd-sec"><summary>내용 고치기</summary>'+editForm(x, raw)+'</details>'
      +'<h4 class="cmd-h">댓글 '+num((d.comments||[]).filter(function(c){ return c.status!=='deleted'; }).length)+'개</h4>'
      +'<ul class="cmd-clist">'+((d.comments||[]).map(function(c){ var rc=(d.reports||[]).filter(function(r){ return r.comment_id===c.id && r.status==='new'; }).length;
        return '<li class="cmd-c st-'+esc(c.status)+'" data-cid="'+c.id+'"><div class="cmd-c-head"><b>'+esc(c.author)+'</b>'+(c.official?' <span class="cmd-chip off">운영팀</span>':'')+(c.email?' <small>'+esc(c.email)+'</small>':'')+' <small>'+esc(kst(c.created_at))+'</small>'+(c.status!=='published'?' <span class="cmd-chip">'+(c.status==='hidden'?'숨김':'삭제')+'</span>':'')+(rc?' <span class="cmd-chip rep">신고 '+rc+'</span>':'')+'</div><div class="cmd-c-body">'+text(c.body)+'</div>'
          +'<div class="cmd-c-act">'+(c.status==='published'?'<button type="button" data-cs="hidden">숨기기</button>':'<button type="button" data-cs="published">다시 보이기</button>')+(c.status!=='deleted'?'<button type="button" data-cs="deleted">삭제</button>':'')+'</div></li>'; }).join('')||'<li class="small muted">댓글이 없습니다.</li>')+'</ul>'
      +'<form id="cmd-reply" class="cmd-form"><label>운영팀 이름으로 댓글 달기<textarea class="textarea" name="body" rows="2" maxlength="1000" placeholder="예: 운영팀이 확인했습니다. 참여 링크가 열리지 않아 수정을 요청드렸어요."></textarea></label><button class="btn btn-light btn-sm" type="submit">댓글 달기</button></form>';
    var b=drawer(x.title, html), ref=x.ref;
    function patch(body, msg){ return A('posts/'+encodeURIComponent(ref),{ method:'PATCH', body:body }).then(function(){ M.toast(msg||'저장했습니다.'); openPost(ref); summary(); if(S.tab==='posts') loadPosts(); if(S.tab==='reports') reports(); }).catch(oops); }
    b.onclick=function(e){
      var a=e.target.closest('[data-pa]'), cs=e.target.closest('[data-cs]');
      if(a){ var k=a.dataset.pa;
        if(k==='publish') patch({ status:'published' }, x.status==='draft' && x.publish_at && new Date(String(x.publish_at).replace(' ','T')+'Z')>new Date()?'예약 게시로 바꿨습니다.':'게시했습니다.');
        if(k==='hide') patch({ status:'hidden' }, '숨겼습니다.');
        if(k==='checked') patch({ checked:true }, '확인 표시를 지웠습니다.');
        if(k==='pin') patch({ pinned:!x.pinned }, x.pinned?'상단 고정을 풀었습니다.':'목록 맨 위에 고정했습니다.');
        if(k==='feature') patch({ featured:!x.featured }, x.featured?'추천을 풀었습니다.':'추천 모임으로 정했습니다.');
        if(k==='delete'){ if(confirm('이 글을 지울까요? 회원 화면에서 바로 사라지고, 30일 뒤 완전히 지워집니다.')) patch({ status:'deleted' }, '지웠습니다.'); }
        if(k==='reject'){ var why=prompt('반려 이유를 적어 주세요. 글쓴이의 ‘내 글’ 화면에 그대로 보입니다.', x.reject_reason||''); if(why && why.trim()) patch({ status:'rejected', reject_reason:why.trim() }, '반려했습니다.'); }
        if(k==='block'){ if(x.blocked){ if(confirm('이 회원의 커뮤니티 글쓰기 제한을 풀까요?')) A('block',{ method:'POST', body:{ member_id:x.member_id, on:false } }).then(function(){ M.toast('글쓰기 제한을 풀었습니다.'); openPost(ref); }).catch(oops); }
          else { var r=prompt('이 회원이 커뮤니티에 글·댓글을 쓰지 못하게 합니다. 이유를 적어 주세요 (운영팀만 봄).', ''); if(r!==null) A('block',{ method:'POST', body:{ member_id:x.member_id, on:true, reason:r } }).then(function(){ M.toast('글쓰기를 제한했습니다.'); openPost(ref); }).catch(oops); } }
      }
      if(cs){ var cid=cs.closest('[data-cid]').dataset.cid, to=cs.dataset.cs; if(to==='deleted' && !confirm('이 댓글을 지울까요?')) return;
        A('comments/'+cid,{ method:'PATCH', body:{ status:to } }).then(function(){ M.toast('댓글을 '+(to==='hidden'?'숨겼습니다.':to==='deleted'?'지웠습니다.':'다시 보이게 했습니다.')); openPost(ref); summary(); }).catch(oops); }
    };
    b.onsubmit=function(e){
      e.preventDefault(); var f=e.target, o=M.formData(f);
      if(f.id==='cmd-meta') patch({ publish_at:o.publish_at||'', admin_note:o.admin_note||'' }, '저장했습니다.');
      if(f.id==='cmd-reply'){ if(String(o.body||'').trim().length<2){ M.toast('댓글을 2자 이상 적어 주세요.'); return; } A('posts/'+encodeURIComponent(ref)+'/reply',{ method:'POST', body:{ body:o.body } }).then(function(){ M.toast('운영팀 댓글을 달았습니다.'); openPost(ref); }).catch(oops); }
      if(f.id==='cmd-edit'){ var ed={}; Object.keys(raw).forEach(function(k){ ed[k]=raw[k]; }); Object.keys(o).forEach(function(k){ ed[k]=o[k]; }); if(g) ed.recruiting=!!f.elements.recruiting.checked; patch({ edit:ed }, '내용을 고쳤습니다.'); }
    };
  }
  function editForm(x, raw){
    var g=x.board==='group', c=cats(x.board);
    var catOpts=Object.keys(c).filter(function(k){ return x.official || k!=='notice'; }).map(function(k){ return [k, c[k]]; });
    return '<form id="cmd-edit" class="cmd-form"><p class="tiny muted">글쓴이가 쓴 글을 고칠 때는 개인정보·욕설처럼 꼭 필요한 부분만 고치고, 고친 이유를 운영 메모에 남겨 주세요.</p>'
      +'<label>'+(g?'모임 이름':'제목')+'<input class="input" name="title" maxlength="'+(g?40:60)+'" value="'+esc(x.title)+'"></label>'
      +'<label>분류<select class="select" name="category">'+opts(catOpts, x.category)+'</select></label>'
      +(g?'<label>한 줄 소개<input class="input" name="summary" maxlength="80" value="'+esc(raw.summary||'')+'"></label>':'')
      +'<label>'+(g?'모임 소개':'내용')+'<textarea class="textarea" name="body" rows="8" maxlength="'+(g?4000:5000)+'">'+esc(x.body||'')+'</textarea></label>'
      +(g?'<div class="cmd-2"><label>참여 링크<input class="input" name="join_url" value="'+esc(raw.join_url||'')+'"></label><label>문의 링크<input class="input" name="contact_url" value="'+esc(raw.contact_url||'')+'"></label></div>'
        +'<div class="cmd-2"><label>전화<input class="input" name="contact_phone" value="'+esc(raw.contact_phone||'')+'"></label><label>이메일<input class="input" name="contact_email" value="'+esc(raw.contact_email||'')+'"></label></div>'
        +'<div class="cmd-2"><label>카카오톡 아이디<input class="input" name="kakao_id" value="'+esc(raw.kakao_id||'')+'"></label><label>활동 지역<input class="input" name="region" value="'+esc(raw.region||'')+'"></label></div>'
        +'<label class="chk"><input type="checkbox" name="recruiting"'+(raw.recruiting===false?'':' checked')+'> 멤버 모집 중</label>':'')
      +'<button class="btn btn-primary btn-sm" type="submit">고친 내용 저장</button></form>';
  }

  /* ---------- 운영팀 글쓰기 ---------- */
  function writeDrawer(){
    var b=drawer('운영팀 글쓰기', '<form id="cmd-new" class="cmd-form">'
      +'<div class="cmd-seg" role="radiogroup" aria-label="게시판"><label class="chk"><input type="radio" name="board" value="free" checked> 자유게시판</label><label class="chk"><input type="radio" name="board" value="group"> 모임 소개</label></div>'
      +'<label>분류<select class="select" name="category" id="cmd-new-cat"></select></label>'
      +'<label><span id="cmd-new-tl">제목</span><input class="input" name="title" maxlength="60" required></label>'
      +'<div id="cmd-new-g" hidden><label>한 줄 소개 <small>(10자 이상)</small><input class="input" name="summary" maxlength="80"></label><div class="cmd-2"><label>활동 지역<input class="input" name="region" maxlength="30"></label><label>모이는 때<input class="input" name="schedule" maxlength="60"></label></div><div class="cmd-2"><label>참여 링크<input class="input" name="join_url" placeholder="https://"></label><label>문의 링크<input class="input" name="contact_url" placeholder="https://"></label></div>'
        +'<label>메가스팟 공간<select class="select" name="venue">'+opts([['','고르지 않음'],['megaspot-gundae','메가스팟 건대 1호'],['megaspot-gundae-2','메가스팟 건대 2호'],['both','건대 1호·2호'],['planned','메가스팟 이용 예정']],'')+'</select></label></div>'
      +'<label><span id="cmd-new-bl">내용</span><textarea class="textarea" name="body" rows="10" maxlength="5000" required placeholder="회원 화면에서는 줄바꿈이 그대로 보이고, https 주소는 링크가 됩니다."></textarea></label>'
      +'<div class="cmd-seg"><label class="chk"><input type="checkbox" name="pinned"> 목록 맨 위에 고정</label><label class="chk" id="cmd-new-feat" hidden><input type="checkbox" name="featured"> 추천 모임</label></div>'
      +'<fieldset class="cmd-when"><legend>게시</legend><label class="chk"><input type="radio" name="when" value="now" checked> 바로 게시</label><label class="chk"><input type="radio" name="when" value="later"> 예약 게시</label><label class="chk"><input type="radio" name="when" value="draft"> 임시 저장</label><input class="input" type="datetime-local" name="publish_at" id="cmd-new-at" hidden></fieldset>'
      +'<label>운영 메모 <span class="muted">(운영팀만 봄)</span><input class="input" name="admin_note" maxlength="1000"></label>'
      +'<div class="cmd-d-act"><button class="btn btn-primary btn-sm" type="submit">저장</button></div><p class="tiny muted">운영팀 글은 ‘메가스팟 운영팀’ 이름과 공식 표시로 올라가고, 신고가 쌓여도 자동으로 숨겨지지 않습니다.</p></form>');
    var f=$('#cmd-new');
    function sync(){ var bd=f.elements.board.value, g=bd==='group', cur=f.elements.category.value, c=cats(bd);
      f.elements.category.innerHTML=opts(Object.keys(c).map(function(k){ return [k,c[k]]; }), c[cur]?cur:(g?'networking':'notice'));
      $('#cmd-new-g').hidden=!g; $('#cmd-new-feat').hidden=!g; $('#cmd-new-tl').textContent=g?'모임 이름':'제목'; $('#cmd-new-bl').textContent=g?'모임 소개 (30자 이상)':'내용';
      $('#cmd-new-at').hidden=f.elements.when.value!=='later'; }
    f.addEventListener('change', function(e){ if(e.target.name==='board'||e.target.name==='when') sync(); });
    sync();
    b.onsubmit=function(e){
      e.preventDefault(); var o=M.formData(f), when=o.when; delete o.when;
      o.pinned=!!f.elements.pinned.checked; o.featured=!!f.elements.featured.checked;
      if(when==='draft') o.status='draft'; if(when!=='later') delete o.publish_at; else if(!o.publish_at){ M.toast('예약 게시 시각을 골라 주세요.'); return; }
      var btn=f.querySelector('[type=submit]'); btn.disabled=true;
      A('posts',{ method:'POST', body:o }).then(function(r){ M.toast(r.status==='draft'?'임시 저장했습니다.':r.scheduled?'예약 게시로 저장했습니다.':'게시했습니다.'); summary(); if(S.tab==='posts') loadPosts(); openPost(r.ref); })
        .catch(oops).then(function(){ btn.disabled=false; });
    };
  }

  /* ---------- 신고 ---------- */
  function reports(){
    var pane=$('#cmd-pane');
    pane.innerHTML='<div class="pf-filter cmd-rf" role="group" aria-label="신고 상태">'+[['new','새 신고'],['done','조치함'],['dismissed','문제 없음'],['all','전체']].map(function(p){ return '<button type="button" class="chip'+(S.rf===p[0]?' on':'')+'" data-rf="'+p[0]+'">'+p[1]+'</button>'; }).join('')+'</div><div id="cmd-reps" class="cmd-reps"><p class="small muted">불러오는 중…</p></div>';
    pane.onclick=function(e){
      var rf=e.target.closest('[data-rf]'); if(rf){ S.rf=rf.dataset.rf; reports(); return; }
      var op=e.target.closest('[data-open]'); if(op){ openPost(op.dataset.open); return; }
      var rd=e.target.closest('[data-rd]'); if(rd){ var id=rd.closest('[data-rid]').dataset.rid, hide=rd.dataset.rd==='hide';
        rd.disabled=true; A('reports/'+id,{ method:'PATCH', body:{ status:hide?'done':'dismissed', hide:hide } }).then(function(){ M.toast(hide?'숨기고 신고를 닫았습니다.':'문제 없음으로 닫았습니다.'); reports(); summary(); }).catch(function(e2){ rd.disabled=false; oops(e2); }); }
    };
    A('reports?status='+encodeURIComponent(S.rf)).then(function(r){
      var l=r.items||[];
      $('#cmd-reps').innerHTML=l.length?l.map(function(x){
        var target=x.comment_id?'<div class="cmd-rt"><span class="cmd-chip">댓글</span> '+esc(x.comment_author||'')+' : '+esc(String(x.comment_body||'').slice(0,140))+(x.comment_status&&x.comment_status!=='published'?' <span class="cmd-chip">'+(x.comment_status==='hidden'?'숨김':'삭제')+'</span>':'')+'<small>글: '+esc(x.post_title||'')+'</small></div>'
          :'<div class="cmd-rt"><span class="cmd-chip">'+esc(x.board==='group'?'모임 소개':'자유게시판')+'</span> <b>'+esc(x.post_title||'(지워진 글)')+'</b> · '+esc(x.post_author||'')+(x.post_status&&x.post_status!=='published'?' <span class="cmd-chip">'+esc({ hidden:'숨김', deleted:'삭제', pending:'검토 대기', rejected:'반려' }[x.post_status]||x.post_status)+'</span>':'')+'</div>';
        return '<div class="adm-card cmd-rep" data-rid="'+x.id+'"><div class="cmd-rep-h"><span class="st '+(x.status==='new'?'st-new':x.status==='done'?'st-ok':'st-done')+'">'+(x.status==='new'?'새 신고':x.status==='done'?'조치함':'문제 없음')+'</span> <b>'+esc(x.reason_label)+'</b> <small>'+esc(kst(x.created_at))+' · 신고한 회원 '+esc(x.reporter||'')+'</small></div>'
          +target+(x.detail?'<p class="small">“'+esc(x.detail)+'”</p>':'')
          +'<div class="cmd-d-act"><button class="btn btn-light btn-sm" type="button" data-open="'+esc(x.post_ref)+'">글 열기</button>'+(x.status==='new'?'<button class="btn btn-primary btn-sm" type="button" data-rd="hide">'+(x.comment_id?'댓글 숨기고 닫기':'글 숨기고 닫기')+'</button><button class="btn btn-ghost btn-sm" type="button" data-rd="ok">문제 없음</button>':'')+'</div></div>';
      }).join(''):'<p class="cmd-empty">'+(S.rf==='new'?'새로 들어온 신고가 없습니다.':'신고가 없습니다.')+'</p>';
    }).catch(function(e){ if(!X.guard(e)) $('#cmd-reps').innerHTML='<p class="small muted">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</p>'; });
  }

  /* ---------- 댓글 ---------- */
  function comments(){
    var pane=$('#cmd-pane'), cf=S.cf;
    pane.innerHTML='<form class="adm-card cmd-filter" id="cmd-cf"><div class="cmd-f-main"><input class="input" name="q" type="search" value="'+esc(cf.q)+'" placeholder="댓글 내용·글쓴이·글 제목·이메일로 찾기" aria-label="댓글 찾기"><select class="select" name="status" aria-label="상태">'+opts([['','삭제 빼고 전체'],['published','게시 중'],['hidden','숨김'],['deleted','삭제']], cf.status)+'</select><select class="select" name="flag" aria-label="표시">'+opts([['','전체'],['reported','신고 있음']], cf.flag)+'</select><button class="btn btn-primary btn-sm" type="submit">찾기</button></div></form><div id="cmd-cl" class="cmd-clist big"><p class="small muted">불러오는 중…</p></div><nav class="cmd-pages" id="cmd-cpages"></nav>';
    var f=$('#cmd-cf');
    f.addEventListener('submit', function(e){ e.preventDefault(); read(); }); f.addEventListener('change', function(e){ if(e.target.name!=='q') read(); });
    function read(){ ['q','status','flag'].forEach(function(k){ S.cf[k]=String(f.elements[k].value||'').trim(); }); S.cpage=1; load(); }
    pane.onclick=function(e){
      var op=e.target.closest('[data-open]'); if(op){ openPost(op.dataset.open); return; }
      var pg=e.target.closest('[data-cpage]'); if(pg){ S.cpage=+pg.dataset.cpage; load(); return; }
      var cs=e.target.closest('[data-cs]'); if(cs){ var cid=cs.closest('[data-cid]').dataset.cid, to=cs.dataset.cs; if(to==='deleted' && !confirm('이 댓글을 지울까요?')) return;
        A('comments/'+cid,{ method:'PATCH', body:{ status:to } }).then(function(){ M.toast('처리했습니다.'); load(); summary(); }).catch(oops); }
    };
    function load(){
      var p=new URLSearchParams({ page:S.cpage, size:40 }); Object.keys(S.cf).forEach(function(k){ if(S.cf[k]) p.set(k, S.cf[k]); });
      A('comments?'+p.toString()).then(function(r){
        var l=r.items||[];
        $('#cmd-cl').innerHTML=l.length?'<p class="small muted">댓글 '+num(r.total)+'개</p><ul>'+l.map(function(c){
          return '<li class="cmd-c st-'+esc(c.status)+'" data-cid="'+c.id+'"><div class="cmd-c-head"><b>'+esc(c.author)+'</b>'+(c.official?' <span class="cmd-chip off">운영팀</span>':'')+(c.email?' <small>'+esc(c.email)+'</small>':'')+' <small>'+esc(kst(c.created_at))+'</small>'+(c.status!=='published'?' <span class="cmd-chip">'+(c.status==='hidden'?'숨김':'삭제')+'</span>':'')+(c.reports?' <span class="cmd-chip rep">신고 '+c.reports+'</span>':'')+'</div>'
            +'<div class="cmd-c-body">'+text(c.body)+'</div><div class="cmd-c-act"><button type="button" class="cmd-link" data-open="'+esc(c.post_ref)+'">'+esc((c.board==='group'?'[모임 소개] ':'[자유게시판] ')+(c.post_title||c.post_ref))+'</button>'+(c.status==='published'?'<button type="button" data-cs="hidden">숨기기</button>':'<button type="button" data-cs="published">다시 보이기</button>')+(c.status!=='deleted'?'<button type="button" data-cs="deleted">삭제</button>':'')+'</div></li>';
        }).join('')+'</ul>':'<p class="cmd-empty">조건에 맞는 댓글이 없습니다.</p>';
        var n=Math.max(1, Math.ceil((r.total||0)/r.size)), h=[]; if(n>1) for(var i=Math.max(1,S.cpage-5);i<=Math.min(n,Math.max(1,S.cpage-5)+9);i++) h.push('<button type="button" class="btn btn-sm '+(i===S.cpage?'btn-dark':'btn-light')+'" data-cpage="'+i+'">'+i+'</button>');
        $('#cmd-cpages').innerHTML=h.join('');
      }).catch(function(e){ if(!X.guard(e)) $('#cmd-cl').innerHTML='<p class="small muted">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</p>'; });
    }
    load();
  }

  /* ---------- 운영 설정 ---------- */
  function settings(){
    var pane=$('#cmd-pane'); pane.innerHTML='<p class="small muted">불러오는 중…</p>';
    A('settings').then(function(r){
      var c=r.config;
      function board(b, label){ var x=c[b]; return '<fieldset class="adm-card cmd-set"><legend>'+label+'</legend>'
        +'<div class="cmd-seg"><label class="chk"><input type="radio" name="'+b+'_mode" value="review"'+(x.mode==='review'?' checked':'')+'> 운영팀 확인 뒤 게시</label><label class="chk"><input type="radio" name="'+b+'_mode" value="instant"'+(x.mode==='instant'?' checked':'')+'> 바로 게시</label></div>'
        +'<label class="chk"><input type="checkbox" name="'+b+'_comments"'+(x.comments?' checked':'')+'> 댓글 받기</label>'
        +'<label>게시판 위 안내 문구 <span class="muted">(비우면 보이지 않음)</span><textarea class="textarea" name="'+b+'_notice" rows="2" maxlength="300">'+esc(c.notice[b]||'')+'</textarea></label></fieldset>'; }
      pane.innerHTML='<form id="cmd-set" class="cmd-setform">'
        +'<div class="cmd-2">'+board('group','모임 소개 게시판')+board('free','자유게시판')+'</div>'
        +'<fieldset class="adm-card cmd-set"><legend>신고 · 금지어</legend><label>자동 숨김 신고 수<input class="input" type="number" name="auto_hide" min="0" max="20" value="'+esc(c.auto_hide)+'" style="max-width:120px"><small>서로 다른 회원의 새 신고가 이만큼 쌓이면 운영팀이 볼 때까지 숨깁니다. 0이면 자동으로 숨기지 않습니다.</small></label>'
        +'<label>금지어 <span class="muted">(한 줄에 하나 · 제목·내용·댓글에 들어 있으면 올라가지 않습니다)</span><textarea class="textarea" name="banned" rows="5">'+esc((c.banned||[]).join('\n'))+'</textarea></label></fieldset>'
        +'<div class="cmd-d-act"><button class="btn btn-primary btn-sm" type="submit">설정 저장</button></div></form>'
        +'<div class="adm-card cmd-set"><h3 class="cmd-h">글쓰기 제한한 회원</h3><p class="small muted">제한한 회원은 로그인해도 커뮤니티에 글·댓글을 쓰지 못합니다. 글 상세의 ‘글쓰기 제한…’ 버튼이나 아래에서 회원 번호로 정할 수 있습니다.</p>'
        +'<ul class="cmd-blocked">'+((r.blocked||[]).map(function(b){ return '<li><b>'+esc(b.name)+'</b> <small>회원 '+esc(b.id)+' · '+esc(b.email||'')+' · '+esc(kst(b.at).slice(0,10))+(b.reason?' · '+esc(b.reason):'')+'</small> <button class="btn btn-ghost btn-sm" type="button" data-unblock="'+esc(b.id)+'">제한 풀기</button></li>'; }).join('')||'<li class="small muted">글쓰기를 제한한 회원이 없습니다.</li>')+'</ul>'
        +'<form id="cmd-block" class="cmd-inline"><input class="input" name="member_id" type="number" min="1" placeholder="회원 번호" aria-label="회원 번호" required><input class="input" name="reason" maxlength="100" placeholder="이유 (운영팀만 봄)" aria-label="이유"><button class="btn btn-light btn-sm" type="submit">글쓰기 제한</button></form></div>';
      pane.onsubmit=function(e){
        e.preventDefault(); var f=e.target, o=M.formData(f);
        if(f.id==='cmd-set'){
          var body={ group:{ mode:o.group_mode, comments:!!f.elements.group_comments.checked }, free:{ mode:o.free_mode, comments:!!f.elements.free_comments.checked }, auto_hide:o.auto_hide, banned:o.banned, notice:{ group:o.group_notice, free:o.free_notice } };
          A('settings',{ method:'PUT', body:body }).then(function(){ M.toast('설정을 저장했습니다.'); settings(); }).catch(oops);
        }
        if(f.id==='cmd-block') A('block',{ method:'POST', body:{ member_id:o.member_id, on:true, reason:o.reason } }).then(function(){ M.toast('글쓰기를 제한했습니다.'); settings(); }).catch(oops);
      };
      pane.onclick=function(e){ var u=e.target.closest('[data-unblock]'); if(!u) return; if(!confirm('이 회원의 글쓰기 제한을 풀까요?')) return; A('block',{ method:'POST', body:{ member_id:u.dataset.unblock, on:false } }).then(function(){ M.toast('제한을 풀었습니다.'); settings(); }).catch(oops); };
    }).catch(function(e){ if(!X.guard(e)) pane.innerHTML='<p class="small muted">'+esc((e&&e.message)||'불러오지 못했습니다.')+'</p>'; });
  }

  /* ---------- 등록 ---------- */
  X.register('community', function(){ summary(); tab(S.tab); });
  // 메뉴의 숫자: 검토 대기 + 새 신고 + 고친 뒤 확인 필요
  function badge(){ var b=document.querySelector('#adm-nav [data-view="community"]'); if(b && !b.querySelector('em')){ var em=document.createElement('em'); em.setAttribute('data-count','community'); em.hidden=true; b.appendChild(em); } if(X.visible()) summary(); }
  setTimeout(badge, 0);
  var appEl=document.getElementById('adm-app'); if(appEl && window.MutationObserver) new MutationObserver(function(){ if(!appEl.hidden) badge(); }).observe(appEl, { attributes:true, attributeFilter:['hidden'] });
})();
