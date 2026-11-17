/* 메가스팟 커뮤니티 — 모임 소개 게시판 · 자유게시판 (2026-11-17)
   한 파일이 커뮤니티 첫 화면, 모임 소개 목록·상세, 자유게시판 목록·상세, 글쓰기, 내 글 화면을 맡습니다.
   서버: /api/community/* (functions/api/community/[[path]].js) */
var C={
  GROUP_CATS:{ networking:'네트워킹·교류', study:'스터디·자기계발', hobby:'취미·동호회', sports:'운동·아웃도어', culture:'문화·예술', social:'친목·파티', biz:'비즈니스·창업', volunteer:'봉사·나눔', etc:'기타' },
  FREE_CATS:{ notice:'공지', talk:'사는 이야기', question:'질문', review:'공간·행사 후기', tip:'행사 준비 팁', together:'함께해요' },
  REASONS:{ spam:'광고·도배', scam:'사기·금전 요구', abuse:'욕설·비방', privacy:'개인정보 노출', illegal:'불법·유해 내용', etc:'기타' },
  CYCLES:{ weekly:'매주', biweekly:'격주', monthly:'매월', irregular:'비정기' },
  SIZES:{ s:'20명 이하', m:'20~50명', l:'50~100명', xl:'100명 이상' },
  VENUES:{ 'megaspot-gundae':'메가스팟 건대 1호', 'megaspot-gundae-2':'메가스팟 건대 2호', both:'메가스팟 건대 1호·2호', planned:'메가스팟 이용 예정' },
  COVERS:[['s04','네트워킹'],['s12','스터디'],['s13','보드게임'],['s05','워크숍'],['s07','공연'],['s22','파티'],['s20','토크'],['s23','정기 모임'],['s11','클래스'],['s01','세미나'],['s06','연말 모임'],['s16','마켓'],['v10','건대 1호 홀'],['r24','건대 2호 홀'],['r21','2호 연회 예시']],
  CAT_COVER:{ networking:'s04', study:'s12', hobby:'s13', sports:'s05', culture:'s07', social:'s22', biz:'s20', volunteer:'s23', etc:'v10' }
};
/*@@CONST-END@@*/
(function(){
  'use strict';
  var M=window.MEGASPOT; if(!M) return;
  var $=M.$, $$=M.$$, esc=M.esc, body=document.body;
  var NICK_KEY='ms_cm_nick';
  var Q=new URLSearchParams(location.search);

  /* ---------- 공통 ---------- */
  function api(path, opts){ return M.api('/community/'+path, opts||{}); }
  function errText(e){ if(e && e.code==='NO_API') return '지금은 서버에 연결되지 않습니다. 잠시 후 다시 열어 주세요.'; return (e && e.message) || '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
  function kst(s){ var d=new Date(String(s||'').replace(' ','T')+'Z'); return isNaN(d)?null:new Date(d.getTime()+9*3600e3); }
  function when(s, full){
    var d=kst(s); if(!d) return ''; var n=new Date(Date.now()+9*3600e3), iso=d.toISOString();
    var day=iso.slice(0,10), hm=iso.slice(11,16);
    if(full) return day.replace(/-/g,'.')+' '+hm;
    if(day===n.toISOString().slice(0,10)) return hm;
    return (day.slice(0,4)===n.toISOString().slice(0,4)?day.slice(5):day).replace(/-/g,'.');
  }
  function isNew(s){ var d=kst(s); return !!d && (Date.now()+9*3600e3-d.getTime()) < 864e5; }
  function num(n){ return M.fmtNum(n||0); }
  // 본문: 줄바꿈을 살리고 https 주소는 새 창 링크로 (검색엔진에 넘기지 않도록 nofollow ugc)
  function text(s){
    return esc(s).replace(/(https?:\/\/[^\s<]+)/g, function(u){ var tail=''; var m=u.match(/[).,!?;:'"]+$/); if(m){ tail=m[0]; u=u.slice(0,-tail.length); } return '<a href="'+u+'" target="_blank" rel="nofollow ugc noopener">'+u+'</a>'+tail; }).replace(/\n/g,'<br>');
  }
  function here(){ return location.pathname+location.search; }
  function loginUrl(){ return '/login/?next='+encodeURIComponent(here()); }
  function signupUrl(){ return '/signup/?next='+encodeURIComponent(here()); }
  function nick(){ try{ return localStorage.getItem(NICK_KEY)||''; }catch(e){ return ''; } }
  function saveNick(v){ try{ if(v) localStorage.setItem(NICK_KEY, v); }catch(e){} }
  function needLogin(anchor, what){
    var old=$('.cm-login-hint'); if(old) old.remove();
    var p=document.createElement('p'); p.className='cm-login-hint';
    p.innerHTML=esc(what||'로그인한 회원만 할 수 있어요.')+' <a href="'+loginUrl()+'">로그인</a> · <a href="'+signupUrl()+'">회원가입</a>';
    (anchor.closest('.cm-act-row')||anchor).insertAdjacentElement('afterend', p);
  }
  function boardUrl(b){ return b==='group'?'/community/groups/':'/community/free/'; }
  function viewUrl(x){ return (x.board==='group'?'/community/groups/view/?id=':'/community/free/view/?id=')+encodeURIComponent(x.ref); }
  function officialBadge(x){ return x.official?'<span class="cm-off">공식</span>':''; }

  // 모임 소개 카드 (목록·첫 화면·미리보기 같이 씀)
  function groupCard(x, preview){
    var meta=[x.region, x.cycle_label?(x.cycle_label+(x.schedule?'':' 모임')):'', x.size_label].filter(Boolean).slice(0,3);
    var tag=preview?'div':'a';
    return '<'+tag+' class="mt-card cm-gcard'+(x.featured?' is-featured':'')+'"'+(preview?'':' href="'+viewUrl(x)+'"')+'>'
      +'<div class="ph"><img src="'+esc(M.coverSrc(x.cover,'m'))+'" alt="" loading="lazy" decoding="async"><span class="mt-cat">'+esc(x.cat_label||'모임')+'</span>'+(x.featured?'<span class="cm-pick">추천 모임</span>':'')+'</div>'
      +'<div class="bd"><div class="cm-gstate'+(x.recruiting===false?' off':'')+'">'+(x.recruiting===false?'지금은 멤버를 받지 않아요':'새 멤버 모집 중')+'</div>'
      +'<h3>'+esc(x.title||'모임 이름')+'</h3><p class="mt-sum">'+esc(x.summary||'')+'</p>'
      +(meta.length?'<div class="mt-meta">'+meta.map(function(m){ return '<span>'+esc(m)+'</span>'; }).join('')+'</div>':'')
      +(x.venue_label?'<div class="cm-venue">'+esc(x.venue==='planned'?'메가스팟 공간 이용 예정':x.venue_label+'에서 모여요')+'</div>':'')
      +'<div class="mt-foot"><span class="by">'+esc(x.join?x.join.site+'로 참여':'문의로 참여')+'</span><span>관심 <b>'+num(x.likes)+'</b> · 댓글 <b>'+num(x.comments)+'</b></span></div>'
      +'</div></'+tag+'>';
  }
  // 자유게시판 한 줄
  function freeRow(x){
    return '<li class="cm-row'+(x.pinned?' is-pin':'')+'"><a href="'+viewUrl(x)+'">'
      +'<span class="cm-k">'+(x.pinned?'<b>공지</b>':esc(x.cat_label))+'</span>'
      +'<span class="cm-t"><b>'+esc(x.title)+'</b>'+(x.comments?'<em class="cm-cn" aria-label="댓글 '+x.comments+'개">'+num(x.comments)+'</em>':'')+(isNew(x.published_at)&&!x.pinned?'<i class="cm-new" aria-label="새 글">N</i>':'')+'</span>'
      +'<span class="cm-w">'+esc(x.author)+officialBadge(x)+'</span>'
      +'<span class="cm-d">'+esc(when(x.published_at))+'</span>'
      +'<span class="cm-v"><span class="cm-lb">조회 </span>'+num(x.views)+'</span>'
      +'<span class="cm-l"><span class="cm-lb">공감 </span>'+num(x.likes)+'</span>'
      +'</a></li>';
  }
  function freeHead(){ return '<li class="cm-row cm-row-h" aria-hidden="true"><span class="cm-k">말머리</span><span class="cm-t">제목</span><span class="cm-w">글쓴이</span><span class="cm-d">날짜</span><span class="cm-v">조회</span><span class="cm-l">공감</span></li>'; }
  function emptyBox(title, msg, btn){ return '<div class="empty"><b>'+esc(title)+'</b>'+esc(msg)+(btn?'<div class="row mt-3" style="justify-content:center">'+btn+'</div>':'')+'</div>'; }

  /* ---------- 신고 창 ---------- */
  var dlg=null;
  function reportDialog(ref, commentId){
    if(!dlg){
      dlg=document.createElement('dialog'); dlg.className='cm-dialog'; dlg.setAttribute('aria-labelledby','cm-rp-title');
      dlg.innerHTML='<form method="dialog" class="form" id="cm-rp-form"><h2 class="h-xs" id="cm-rp-title">신고하기</h2><p class="small muted">운영팀이 확인해 이용 규칙에 어긋나면 내립니다. 서로 다른 회원의 신고가 여러 건 쌓이면 운영팀이 볼 때까지 먼저 숨겨집니다.</p>'
        +'<div class="checks cm-reasons">'+Object.keys(C.REASONS).map(function(k,i){ return '<label class="chk"><input type="radio" name="reason" value="'+k+'"'+(i===0?' checked':'')+'> '+esc(C.REASONS[k])+'</label>'; }).join('')+'</div>'
        +'<div class="f"><label for="cm-rp-detail">자세한 내용 <span class="muted">(선택)</span></label><textarea class="textarea" id="cm-rp-detail" name="detail" rows="3" maxlength="300"></textarea></div>'
        +'<div class="row" style="justify-content:flex-end"><button class="btn btn-light btn-sm" value="cancel" type="button" data-rp="cancel">닫기</button><button class="btn btn-primary btn-sm" type="submit">신고 보내기</button></div></form>';
      document.body.appendChild(dlg);
      dlg.querySelector('[data-rp="cancel"]').addEventListener('click', function(){ dlg.close(); });
    }
    var f=dlg.querySelector('form'); f.reset();
    f.onsubmit=function(e){
      e.preventDefault(); var d=M.formData(f), btn=f.querySelector('[type=submit]'); btn.disabled=true;
      api('report',{ method:'POST', body:{ ref:ref, comment_id:commentId||0, reason:d.reason, detail:d.detail } }).then(function(r){ dlg.close(); M.toast(r.already?'이미 신고하셨습니다. 운영팀이 확인하고 있어요.':r.hidden?'신고를 받았습니다. 여러 분이 신고해 운영팀이 볼 때까지 숨겼습니다.':'신고를 받았습니다. 운영팀이 확인하겠습니다.'); if(r.hidden) setTimeout(function(){ location.reload(); }, 900); })
        .catch(function(e2){ M.toast(errText(e2)); }).then(function(){ btn.disabled=false; });
    };
    if(typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','');
  }

  /* ---------- 댓글 ---------- */
  function commentsBlock(d, title){
    var x=d.item, me=d.me||{};
    var list=(d.comments||[]).map(commentHtml).join('');
    var form;
    if(!d.comments_open) form='<p class="small muted">'+(x.status&&x.status!=='published'?'게시된 뒤에 댓글을 달 수 있습니다.':'지금은 댓글을 받지 않습니다.')+'</p>';
    else if(!me.logged_in) form='<div class="cm-cform-off"><span>로그인하면 댓글을 남길 수 있어요.</span><a class="btn btn-light btn-sm" href="'+loginUrl()+'">로그인</a><a class="btn btn-ghost btn-sm" href="'+signupUrl()+'">회원가입</a></div>';
    else if(me.blocked) form='<p class="small muted">커뮤니티 글쓰기가 제한된 계정입니다.</p>';
    else form='<form class="cm-cform" id="cm-cform" novalidate><input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">'
      +'<label class="sr-only" for="cm-cbody">댓글</label><textarea class="textarea" id="cm-cbody" name="body" rows="3" maxlength="1000" required placeholder="'+(x.board==='group'?'모임에 궁금한 점을 물어보세요. 연락처는 댓글에 남기지 말아 주세요.':'따뜻한 댓글은 글쓴이에게 힘이 됩니다.')+'"></textarea>'
      +'<div class="cm-cform-row"><label class="cm-nick"><span>별명</span><input class="input" name="author" maxlength="12" value="'+esc(nick())+'" placeholder="비우면 이름 일부만"></label><button class="btn btn-primary btn-sm" type="submit">댓글 남기기</button></div></form>';
    return '<section class="cm-comments" id="comments"><h2>'+esc(title||'댓글')+' <span class="cm-ccount">'+num((d.comments||[]).length)+'</span></h2><ul class="cm-clist" id="cm-clist">'+(list||'<li class="cm-cempty">아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.</li>')+'</ul>'+form+'</section>';
  }
  function commentHtml(c){
    return '<li class="cm-cm'+(c.official?' is-off':'')+'" data-cid="'+c.id+'"><div class="cm-chead"><b>'+esc(c.author)+'</b>'+(c.official?'<span class="cm-off">공식</span>':'')+(c.writer?'<span class="cm-writer">글쓴이</span>':'')+'<span class="cm-cdate">'+esc(when(c.created_at, true))+'</span>'
      +'<span class="cm-cact">'+(c.mine?'<button type="button" data-cdel="'+c.id+'">삭제</button>':(c.official?'':'<button type="button" data-crep="'+c.id+'">신고</button>'))+'</span></div><div class="cm-cbody">'+text(c.body)+'</div></li>';
  }
  function bindComments(root, d){
    var ref=d.item.ref;
    root.addEventListener('click', function(e){
      var del=e.target.closest('[data-cdel]'), rep=e.target.closest('[data-crep]');
      if(del){ if(!confirm('이 댓글을 지울까요?')) return; api('comments/'+del.dataset.cdel,{ method:'DELETE' }).then(function(){ var li=del.closest('li'); li.remove(); bump(-1); M.toast('댓글을 지웠습니다.'); }).catch(function(e2){ M.toast(errText(e2)); }); }
      if(rep){ if(!d.me.logged_in){ needLogin(rep, '로그인하면 신고할 수 있어요.'); return; } reportDialog(ref, +rep.dataset.crep); }
    });
    var f=$('#cm-cform', root); if(!f) return;
    f.addEventListener('submit', function(e){
      e.preventDefault(); var o=M.formData(f), btn=f.querySelector('[type=submit]');
      if(String(o.body||'').trim().length<2){ M.toast('댓글을 2자 이상 적어 주세요.'); return; }
      btn.disabled=true; saveNick(String(o.author||'').trim());
      api('posts/'+encodeURIComponent(ref)+'/comments',{ method:'POST', body:o }).then(function(r){
        if(!r.comment) return; var ul=$('#cm-clist', root), empty=$('.cm-cempty', ul); if(empty) empty.remove();
        ul.insertAdjacentHTML('beforeend', commentHtml(r.comment)); f.elements.body.value=''; bump(1); M.toast('댓글을 남겼습니다.');
      }).catch(function(e2){ M.toast(errText(e2)); }).then(function(){ btn.disabled=false; });
    });
    function bump(n){ var c=$('.cm-ccount', root); if(c) c.textContent=num(Math.max(0, (+String(c.textContent).replace(/\D/g,'')||0)+n)); }
  }
  // 공감 · 공유 · 신고 버튼 줄
  function actRow(d, likeWord){
    var x=d.item, me=d.me||{};
    return '<div class="cm-act-row"><button type="button" class="cm-like'+(me.liked?' on':'')+'" data-like aria-pressed="'+(me.liked?'true':'false')+'"'+(me.owner?' disabled title="내 글에는 누를 수 없어요"':'')+'><span aria-hidden="true">♥</span> '+esc(likeWord)+' <b data-likes>'+num(x.likes)+'</b></button>'
      +'<button type="button" class="btn btn-light btn-sm" data-share>공유하기</button>'+(me.owner||x.official?'':'<button type="button" class="btn btn-ghost btn-sm cm-rep" data-report>신고</button>')+'</div>';
  }
  function bindActs(root, d){
    root.addEventListener('click', function(e){
      var lk=e.target.closest('[data-like]'), sh=e.target.closest('[data-share]'), rp=e.target.closest('[data-report]');
      if(lk){ if(!d.me.logged_in){ needLogin(lk, '로그인하면 공감을 누를 수 있어요.'); return; } lk.disabled=true;
        api('posts/'+encodeURIComponent(d.item.ref)+'/like',{ method:'POST' }).then(function(r){ $$('[data-like]', root).forEach(function(b){ b.classList.toggle('on', r.liked); b.setAttribute('aria-pressed', String(r.liked)); var n=b.querySelector('[data-likes]'); if(n) n.textContent=num(r.likes); }); })
          .catch(function(e2){ M.toast(errText(e2)); }).then(function(){ lk.disabled=false; }); }
      if(sh) M.share(d.item.title+' | 메가스팟 커뮤니티', location.href);
      if(rp){ if(!d.me.logged_in){ needLogin(rp, '로그인하면 신고할 수 있어요.'); return; } reportDialog(d.item.ref, 0); }
    });
  }
  function ownerBar(x){
    if(!x.status) return '';
    var st={ pending:['검토 대기','운영팀이 내용을 확인한 뒤 게시합니다. 보통 1영업일 안에 확인합니다.'], rejected:['반려','고쳐서 다시 올리면 운영팀이 다시 확인합니다.'], hidden:['숨김','운영팀이 숨긴 글입니다. 궁금한 점은 운영팀에 문의해 주세요.'], published:['게시 중','']}[x.status]||[x.status_label,''];
    return '<div class="cm-owner"><div><span class="cm-st cm-st-'+esc(x.status)+'">'+esc(st[0])+'</span> <b>내가 쓴 글</b>'+(st[1]?'<p class="small muted">'+esc(st[1])+'</p>':'')+(x.reject_reason?'<p class="small cm-reason">반려 이유: '+esc(x.reject_reason)+'</p>':'')+(x.recheck&&x.status==='published'?'<p class="tiny muted">고친 내용은 운영팀이 한 번 더 살펴봅니다.</p>':'')+'</div>'
      +'<div class="row" style="gap:6px"><a class="btn btn-light btn-sm" href="/community/write/?board='+esc(x.board)+'&id='+encodeURIComponent(x.ref)+'">고치기</a><button class="btn btn-ghost btn-sm" type="button" data-del>지우기</button></div></div>';
  }
  function bindOwner(root, x){
    var b=$('[data-del]', root); if(!b) return;
    b.addEventListener('click', function(){ if(!confirm('이 글을 지울까요? 지운 글은 되살릴 수 없습니다.')) return; api('posts/'+encodeURIComponent(x.ref),{ method:'DELETE' }).then(function(){ M.toast('글을 지웠습니다.'); setTimeout(function(){ location.href='/community/my/'; }, 600); }).catch(function(e){ M.toast(errText(e)); }); });
  }

  /* =================== 커뮤니티 첫 화면 =================== */
  function hub(){
    var root=$('#cm-hub'); if(!root) return;
    api('home').then(function(r){
      var c=r.counts||{};
      $$('[data-count-groups]').forEach(function(el){ el.textContent=c.groups?num(c.groups)+'개 모임':'첫 모임을 기다려요'; });
      $$('[data-count-free]').forEach(function(el){ el.textContent=c.free?num(c.free)+'개 글':'첫 글을 기다려요'; });
      var feat=$('#cm-hub-featured');
      if(r.featured && r.featured.length){ $('#cm-hub-featured-sec').hidden=false; feat.innerHTML=r.featured.map(function(x){ return groupCard(x); }).join(''); }
      $('#cm-hub-groups').innerHTML=(r.groups||[]).length?r.groups.map(function(x){ return groupCard(x); }).join('')
        :'<div class="mt-empty-home"><b>아직 소개된 모임이 없습니다</b><p>메가스팟에서 모이거나 모일 예정인 모임이라면 첫 번째로 소개해 보세요. 참여 링크와 문의처만 있으면 바로 올릴 수 있습니다.</p><a class="btn btn-primary btn-sm" href="/community/write/?board=group">모임 소개 올리기</a></div>';
      $('#cm-hub-free').innerHTML=(r.free||[]).length?'<ul class="cm-list cm-list-compact">'+r.free.map(freeRow).join('')+'</ul>'
        :emptyBox('아직 글이 없습니다', '행사 준비하며 궁금했던 점, 다녀온 모임 이야기 무엇이든 좋아요.', '<a class="btn btn-primary btn-sm" href="/community/write/?board=free">첫 글 쓰기</a>');
      var hot=$('#cm-hub-hot');
      hot.innerHTML=(r.hot||[]).length?'<ol class="cm-hot">'+r.hot.map(function(x){ return '<li><a href="'+viewUrl(x)+'"><b>'+esc(x.title)+'</b><small>공감 '+num(x.likes)+' · 댓글 '+num(x.comments)+'</small></a></li>'; }).join('')+'</ol>'
        :'<p class="small muted">최근 30일 동안 공감이나 댓글이 달린 글이 생기면 여기에 모아 보여 드립니다.</p>';
    }).catch(function(e){ $('#cm-hub-groups').innerHTML='<div class="empty small">'+esc(errText(e))+'</div>'; $('#cm-hub-free').innerHTML=''; });
  }

  /* =================== 모임 소개 목록 =================== */
  function groups(){
    var root=$('#cm-groups'); if(!root) return;
    var S={ cat:Q.get('cat')||'', q:Q.get('q')||'', sort:Q.get('sort')||'new', recruiting:Q.get('recruiting')==='1', venue:Q.get('venue')==='megaspot', page:1, total:0, items:[] };
    if(!C.GROUP_CATS[S.cat]) S.cat='';
    $('#cm-g-cats').innerHTML='<button type="button" class="chip'+(S.cat?'':' on')+'" data-cat="">전체</button>'+Object.keys(C.GROUP_CATS).map(function(k){ return '<button type="button" class="chip'+(S.cat===k?' on':'')+'" data-cat="'+k+'">'+esc(C.GROUP_CATS[k])+'</button>'; }).join('');
    $('#cm-g-q').value=S.q; $('#cm-g-sort').value=S.sort; $('#cm-g-rec').checked=S.recruiting; $('#cm-g-venue').checked=S.venue;
    function qs(page){ var p=new URLSearchParams({ board:'group', page:page, size:12, sort:S.sort }); if(S.cat) p.set('cat',S.cat); if(S.q) p.set('q',S.q); if(S.recruiting) p.set('recruiting','1'); if(S.venue) p.set('venue','megaspot'); return p.toString(); }
    function syncUrl(){ var p=new URLSearchParams(); if(S.cat) p.set('cat',S.cat); if(S.q) p.set('q',S.q); if(S.sort!=='new') p.set('sort',S.sort); if(S.recruiting) p.set('recruiting','1'); if(S.venue) p.set('venue','megaspot'); var s=p.toString(); history.replaceState(null,'',location.pathname+(s?'?'+s:'')); }
    function load(more){
      var box=$('#cm-g-list'), btn=$('#cm-g-more');
      if(!more){ S.page=1; S.items=[]; box.innerHTML='<div class="empty small">모임을 불러오는 중…</div>'; syncUrl(); } else S.page++;
      btn.disabled=true;
      api('list?'+qs(S.page)).then(function(r){
        S.total=r.total||0; S.items=S.items.concat(r.items||[]);
        if(r.notice){ var n=$('#cm-g-notice'); n.hidden=false; n.querySelector('div').textContent=r.notice; }
        $('#cm-g-count').textContent=S.total?'모임 '+num(S.total)+'개':'';
        box.innerHTML=S.items.length?S.items.map(function(x){ return groupCard(x); }).join('')
          :emptyBox(S.q||S.cat||S.recruiting||S.venue?'조건에 맞는 모임이 없습니다':'아직 소개된 모임이 없습니다', S.q||S.cat||S.recruiting||S.venue?'분류나 조건을 바꿔 보세요.':'메가스팟에서 모이는 모임이라면 첫 번째로 소개해 보세요.', '<a class="btn btn-primary btn-sm" href="/community/write/?board=group">모임 소개 올리기</a>');
        btn.hidden=S.items.length>=S.total;
      }).catch(function(e){ box.innerHTML='<div class="empty small">'+esc(errText(e))+'</div>'; }).then(function(){ btn.disabled=false; });
    }
    $('#cm-g-cats').addEventListener('click', function(e){ var b=e.target.closest('[data-cat]'); if(!b) return; S.cat=b.dataset.cat; $$('#cm-g-cats .chip').forEach(function(c){ c.classList.toggle('on', c===b); }); load(); });
    $('#cm-g-form').addEventListener('submit', function(e){ e.preventDefault(); S.q=$('#cm-g-q').value.trim(); load(); });
    $('#cm-g-sort').addEventListener('change', function(){ S.sort=this.value; load(); });
    $('#cm-g-rec').addEventListener('change', function(){ S.recruiting=this.checked; load(); });
    $('#cm-g-venue').addEventListener('change', function(){ S.venue=this.checked; load(); });
    $('#cm-g-more').addEventListener('click', function(){ load(true); });
    load();
  }

  /* =================== 모임 소개 상세 =================== */
  function groupView(){
    var root=$('#cm-gview'); if(!root) return;
    var ref=String(Q.get('id')||'').toUpperCase().trim();
    function fail(t, m){ root.innerHTML=emptyBox(t, m, '<a class="btn btn-primary" href="/community/groups/">모임 소개 목록</a><a class="btn btn-light" href="/community/write/?board=group">모임 소개 올리기</a>'); }
    if(!/^CG-\d{4}-[A-Z0-9]{4}$/.test(ref)){ fail('모임 주소가 올바르지 않습니다', '목록에서 다시 골라 주세요.'); return; }
    api('posts/'+encodeURIComponent(ref)).then(function(d){
      var x=d.item; document.title=x.title+' | 모임 소개 | 메가스팟 커뮤니티';
      var cr=$('#cm-crumb'); if(cr) cr.textContent=x.title;
      var facts=[['활동 지역',x.region],['모임 주기',x.cycle_label],['모이는 때',x.schedule],['규모',x.size_label],['회비',x.fee==='free'?'없음':x.fee==='paid'?(x.fee_text||'있음'):''],['모이는 곳',x.venue_label]].filter(function(f){ return f[1]; });
      var ct=x.contact||{};
      var side='<div class="card mv-box cm-join"><div class="cm-gstate big'+(x.recruiting===false?' off':'')+'">'+(x.recruiting===false?'지금은 새 멤버를 받지 않아요':'새 멤버를 모집하고 있어요')+'</div>'
        +(x.join?'<a class="btn btn-primary btn-lg btn-block" href="'+esc(x.join.url)+'" target="_blank" rel="nofollow ugc noopener">'+esc(x.join.label)+' <span class="arrow">↗</span></a><p class="tiny muted">'+esc(x.join.site)+'로 이동합니다. 메가스팟 밖의 공간이니 처음 참여할 때 운영 방식과 회비를 꼭 확인해 주세요.</p>':'')
        +'<div class="cm-ask"><b>문의</b>'
          +(ct.url?'<a class="btn btn-light btn-block" href="'+esc(ct.url)+'" target="_blank" rel="nofollow ugc noopener">'+esc(ct.label)+' ↗</a>':'')
          +(ct.kakao_id?'<div class="cm-kid"><span>카카오톡 아이디</span><b>'+esc(ct.kakao_id)+'</b><button type="button" class="btn btn-light btn-sm" data-copy="'+esc(ct.kakao_id)+'">복사</button></div>':'')
          +(ct.has_phone||ct.has_email?'<div id="cm-contact"><button type="button" class="btn btn-light btn-block" data-reveal>'+(ct.has_phone&&ct.has_email?'전화·이메일 보기':ct.has_phone?'전화번호 보기':'이메일 보기')+'</button></div>':'')
          +(ct.note?'<p class="small muted">'+esc(ct.note)+'</p>':'')
          +(!ct.url&&!ct.kakao_id&&!ct.has_phone&&!ct.has_email?'<p class="small muted">아래 묻고 답하기에 궁금한 점을 남겨 주세요.</p>':'')
        +'</div>'+actRow(d,'관심')+'</div>'
        +'<div class="notice mt-2 small"><div>모임 소개는 운영자가 직접 적은 내용입니다. 회비를 먼저 보내라고 하거나 개인 정보를 과하게 묻는 등 이상한 점이 있으면 신고해 주세요.</div></div>';
      var main='<div class="mv-cover"><img src="'+esc(M.coverSrc(x.cover,'m'))+'" alt="" decoding="async"></div>'
        +'<div class="mv-head"><div class="row" style="gap:6px"><span class="badge badge-cobalt">'+esc(x.cat_label)+'</span>'+(x.featured?'<span class="badge cm-badge-pick">추천 모임</span>':'')+(x.venue&&x.venue!=='planned'?'<span class="badge badge-soft">메가스팟에서 모이는 모임</span>':'')+'</div>'
        +'<h1 class="h-l mt-1">'+esc(x.title)+'</h1><p class="lead mt-1">'+esc(x.summary)+'</p>'
        +'<p class="small muted mt-1">올린 사람 '+esc(x.author)+officialBadge(x)+' · '+esc(when(x.published_at,true).slice(0,10))+(x.edited_at?' · 고침':'')+' · 조회 '+num(x.views)+'</p></div>'
        +'<div class="cm-mjoin">'+(x.join?'<a class="btn btn-primary btn-block" href="'+esc(x.join.url)+'" target="_blank" rel="nofollow ugc noopener">'+esc(x.join.label)+' ↗</a>':'')+'<a class="btn btn-light btn-block" href="#cm-side">'+(x.join?'문의처 보기':'참여·문의 방법 보기')+'</a></div>'
        +ownerBar(x)
        +(facts.length?'<dl class="cm-facts">'+facts.map(function(f){ return '<div><dt>'+esc(f[0])+'</dt><dd>'+esc(f[1])+'</dd></div>'; }).join('')+'</dl>':'')
        +'<section class="mv-sec"><h2>모임 소개</h2><div class="mv-text">'+text(x.body)+'</div></section>'
        +(x.target?'<section class="mv-sec"><h2>이런 분께 추천해요</h2><p class="mv-text">'+text(x.target)+'</p></section>':'')
        +venueBlock(x)
        +(x.meetup_ref?'<section class="mv-sec" id="cm-meetup" hidden><h2>참가 신청을 받고 있는 모임</h2><div id="cm-meetup-card"></div></section>':'')
        +(x.tags&&x.tags.length?'<div class="cm-tags">'+x.tags.map(function(t){ return '<a href="/community/groups/?q='+encodeURIComponent(t)+'">#'+esc(t)+'</a>'; }).join('')+'</div>':'')
        +commentsBlock(d,'묻고 답하기');
      root.innerHTML='<div class="mv-layout"><div class="mv-main">'+main+'</div><aside class="mv-side" id="cm-side">'+side+'</aside></div>';
      bindActs(root, d); bindComments(root, d); bindOwner(root, x);
      root.addEventListener('click', function(e){
        var cp=e.target.closest('[data-copy]'); if(cp) M.copy(cp.dataset.copy).then(function(ok){ M.toast(ok?'카카오톡 아이디를 복사했습니다.':'복사하지 못했습니다.'); });
        var rv=e.target.closest('[data-reveal]'); if(rv){ rv.disabled=true; api('posts/'+encodeURIComponent(ref)+'/contact').then(function(c){
          $('#cm-contact').innerHTML=(c.phone?'<a class="cm-reveal" href="tel:'+esc(c.phone.replace(/[^0-9+]/g,''))+'"><span>전화</span><b>'+esc(c.phone)+'</b></a>':'')+(c.email?'<a class="cm-reveal" href="mailto:'+esc(c.email)+'"><span>이메일</span><b>'+esc(c.email)+'</b></a>':'');
        }).catch(function(e2){ rv.disabled=false; M.toast(errText(e2)); }); }
      });
      if(x.meetup_ref) M.api('/meetups/'+encodeURIComponent(x.meetup_ref)).then(function(m){ if(m.item && M.meetupCard){ $('#cm-meetup').hidden=false; $('#cm-meetup-card').innerHTML='<div class="cm-meetup">'+M.meetupCard(m.item)+'</div>'; } }).catch(function(){});
      more(x.ref);
    }).catch(function(e){ if(e && e.status===404) fail('모임을 찾을 수 없습니다', '아직 게시되지 않았거나 내려간 모임입니다.'); else fail('모임을 불러오지 못했습니다', errText(e)); });
    function more(cur){
      api('list?board=group&size=4').then(function(r){ var l=(r.items||[]).filter(function(x){ return x.ref!==cur; }).slice(0,3); if(!l.length) return; $('#cm-gmore-sec').hidden=false; $('#cm-gmore').innerHTML=l.map(function(x){ return groupCard(x); }).join(''); }).catch(function(){});
    }
  }
  function venueBlock(x){
    if(!x.venue || x.venue==='planned') return '';
    var ids=x.venue==='both'?['megaspot-gundae','megaspot-gundae-2']:[x.venue];
    var sp=(window.MEGASPOT_SPACES||[]).filter(function(s){ return ids.indexOf(s.id)>=0; });
    if(!sp.length) return '';
    return '<section class="mv-sec"><h2>모이는 곳</h2><div class="cm-venues">'+sp.map(function(s){ return '<a class="mv-venue" href="/spaces/'+esc(s.slug)+'/"><img src="'+M.imgSrc(s.cover,'t')+'" alt="" loading="lazy"><span><b>'+esc(s.name)+'</b><small>'+esc(s.addressShort||s.address||'')+'</small><small>'+esc(s.area.pyeong)+'평 · 최대 '+esc(s.capacity.max)+'명</small></span><span class="go">공간 보기 →</span></a>'; }).join('')+'</div>'
      +'<p class="small muted mt-2">같은 공간에서 행사를 열고 싶다면 <a href="/inquiry/" style="text-decoration:underline">금액 확인·예약 신청</a>에서 날짜와 인원을 넣어 보세요.</p></section>';
  }

  /* =================== 자유게시판 목록 =================== */
  function free(){
    var root=$('#cm-free'); if(!root) return;
    var S={ cat:Q.get('cat')||'', q:Q.get('q')||'', sort:Q.get('sort')||'new', page:Math.max(1, parseInt(Q.get('page'),10)||1) };
    if(!C.FREE_CATS[S.cat]) S.cat='';
    $('#cm-f-cats').innerHTML='<button type="button" class="chip'+(S.cat?'':' on')+'" data-cat="">전체</button>'+Object.keys(C.FREE_CATS).map(function(k){ return '<button type="button" class="chip'+(S.cat===k?' on':'')+'" data-cat="'+k+'">'+esc(C.FREE_CATS[k])+'</button>'; }).join('');
    $('#cm-f-q').value=S.q; $('#cm-f-sort').value=S.sort;
    function syncUrl(){ var p=new URLSearchParams(); if(S.cat) p.set('cat',S.cat); if(S.q) p.set('q',S.q); if(S.sort!=='new') p.set('sort',S.sort); if(S.page>1) p.set('page',S.page); var s=p.toString(); history.replaceState(null,'',location.pathname+(s?'?'+s:'')); }
    function load(){
      var box=$('#cm-f-list'); box.innerHTML='<div class="empty small">글을 불러오는 중…</div>'; syncUrl();
      var p=new URLSearchParams({ board:'free', page:S.page, size:20, sort:S.sort }); if(S.cat) p.set('cat',S.cat); if(S.q) p.set('q',S.q);
      api('list?'+p.toString()).then(function(r){
        if(r.notice){ var n=$('#cm-f-notice'); n.hidden=false; n.querySelector('div').textContent=r.notice; }
        $('#cm-f-count').textContent='글 '+num(r.total);
        var rows=(r.pinned||[]).map(freeRow).concat((r.items||[]).map(freeRow));
        box.innerHTML=rows.length?'<ul class="cm-list">'+freeHead()+rows.join('')+'</ul>':emptyBox(S.q||S.cat?'조건에 맞는 글이 없습니다':'아직 글이 없습니다', S.q||S.cat?'다른 말머리나 검색어로 찾아보세요.':'첫 글을 남겨 이야기를 시작해 보세요.', '<a class="btn btn-primary btn-sm" href="/community/write/?board=free">글쓰기</a>');
        pager(r.total, r.size);
      }).catch(function(e){ box.innerHTML='<div class="empty small">'+esc(errText(e))+'</div>'; });
    }
    function pager(total, size){
      var n=Math.max(1, Math.ceil(total/size)), p=S.page, from=Math.max(1, p-4), to=Math.min(n, from+9), h=[];
      if(n<=1){ $('#cm-f-pages').innerHTML=''; return; }
      if(p>1) h.push('<button type="button" data-page="'+(p-1)+'" aria-label="이전 쪽">‹</button>');
      for(var i=from;i<=to;i++) h.push('<button type="button" data-page="'+i+'"'+(i===p?' aria-current="page" class="on"':'')+'>'+i+'</button>');
      if(p<n) h.push('<button type="button" data-page="'+(p+1)+'" aria-label="다음 쪽">›</button>');
      $('#cm-f-pages').innerHTML=h.join('');
    }
    $('#cm-f-cats').addEventListener('click', function(e){ var b=e.target.closest('[data-cat]'); if(!b) return; S.cat=b.dataset.cat; S.page=1; $$('#cm-f-cats .chip').forEach(function(c){ c.classList.toggle('on', c===b); }); load(); });
    $('#cm-f-form').addEventListener('submit', function(e){ e.preventDefault(); S.q=$('#cm-f-q').value.trim(); S.page=1; load(); });
    $('#cm-f-sort').addEventListener('change', function(){ S.sort=this.value; S.page=1; load(); });
    $('#cm-f-pages').addEventListener('click', function(e){ var b=e.target.closest('[data-page]'); if(!b) return; S.page=+b.dataset.page; load(); root.scrollIntoView({ behavior:'smooth', block:'start' }); });
    load();
  }

  /* =================== 자유게시판 글 =================== */
  function freeView(){
    var root=$('#cm-fview'); if(!root) return;
    var ref=String(Q.get('id')||'').toUpperCase().trim();
    function fail(t, m){ root.innerHTML=emptyBox(t, m, '<a class="btn btn-primary" href="/community/free/">자유게시판 목록</a>'); }
    if(!/^CF-\d{4}-[A-Z0-9]{4}$/.test(ref)){ fail('글 주소가 올바르지 않습니다', '목록에서 다시 골라 주세요.'); return; }
    api('posts/'+encodeURIComponent(ref)).then(function(d){
      var x=d.item; document.title=x.title+' | 자유게시판 | 메가스팟 커뮤니티';
      var cr=$('#cm-crumb'); if(cr) cr.textContent=x.title;
      root.innerHTML='<article class="cm-article"><header class="cm-ahead"><a class="cm-acat" href="/community/free/?cat='+esc(x.category)+'">'+esc(x.cat_label)+'</a><h1>'+esc(x.title)+'</h1>'
        +'<div class="cm-ameta"><span class="cm-aauthor">'+esc(x.author)+officialBadge(x)+'</span><span>'+esc(when(x.published_at,true))+'</span>'+(x.edited_at?'<span>고침</span>':'')+'<span>조회 '+num(x.views)+'</span><span>댓글 '+num(x.comments)+'</span></div></header>'
        +ownerBar(x)
        +'<div class="cm-abody">'+text(x.body)+'</div>'
        +actRow(d,'공감')+'</article>'
        +commentsBlock(d,'댓글')
        +'<div class="row cm-afoot"><a class="btn btn-light btn-sm" href="/community/free/">목록으로</a><a class="btn btn-primary btn-sm" href="/community/write/?board=free">글쓰기</a></div>';
      bindActs(root, d); bindComments(root, d); bindOwner(root, x);
    }).catch(function(e){ if(e && e.status===404) fail('글을 찾을 수 없습니다', '지워졌거나 아직 게시되지 않은 글입니다.'); else fail('글을 불러오지 못했습니다', errText(e)); });
  }

  /* =================== 글쓰기 =================== */
  function write(){
    var root=$('#cm-write'); if(!root) return;
    var board=Q.get('board')==='group'?'group':'free', ref=String(Q.get('id')||'').toUpperCase().trim(), editing=/^C[GF]-\d{4}-[A-Z0-9]{4}$/.test(ref);
    if(editing) board=ref.slice(1,2)==='G'?'group':'free';
    function gate(){
      root.innerHTML='<div class="cm-gate card"><div class="eyebrow">Members only</div><h2 class="h-m mt-1">글은 메가스팟 회원만 쓸 수 있어요</h2><p class="muted mt-1">회원가입은 이메일과 이름만 있으면 1분이면 끝납니다. 로그인하면 이 화면으로 다시 돌아옵니다.</p><div class="row mt-3"><a class="btn btn-primary" href="'+loginUrl()+'">로그인</a><a class="btn btn-light" href="'+signupUrl()+'">회원가입</a></div></div>';
    }
    if(!M.account.loggedIn()){ gate(); return; }
    M.account.me().then(function(me){
      if(!me){ gate(); return; }
      if(!editing){ render(null); return; }
      api('posts/'+encodeURIComponent(ref)).then(function(d){ if(!d.me.owner){ root.innerHTML=emptyBox('내가 쓴 글만 고칠 수 있습니다', '내 글 목록에서 다시 골라 주세요.', '<a class="btn btn-primary" href="/community/my/">내 글 보기</a>'); return; } render(d.item); })
        .catch(function(e){ root.innerHTML=emptyBox('글을 불러오지 못했습니다', errText(e), '<a class="btn btn-primary" href="/community/my/">내 글 보기</a>'); });
    });
    function render(item){
      var raw=item?item.raw||{}:{};
      var title=editing?(board==='group'?'모임 소개 고치기':'글 고치기'):(board==='group'?'모임 소개 올리기':'자유게시판 글쓰기');
      $$('[data-write-title]').forEach(function(el){ el.textContent=title; });
      var tabs=editing?'':'<div class="cm-wtabs" role="tablist" aria-label="게시판"><a role="tab" href="?board=group" aria-selected="'+(board==='group')+'"'+(board==='group'?' class="on"':'')+'>모임 소개</a><a role="tab" href="?board=free" aria-selected="'+(board==='free')+'"'+(board==='free'?' class="on"':'')+'>자유게시판</a></div>';
      var form=board==='group'?groupForm(item, raw):freeForm(item, raw);
      var side=board==='group'
        ?'<div class="card"><b class="cm-side-h">목록에 이렇게 보여요</b><div class="mn-preview" id="cm-preview"></div><div class="mn-tips mt-3"><b>잘 보이는 모임 소개</b><ul><li>한 줄 소개에 누가 모여 무엇을 하는지 적어 주세요.</li><li>처음 온 사람이 어떻게 참여하는지(가입 방법·회비·준비물)를 소개에 적어 두면 문의가 줄어듭니다.</li><li>오픈채팅·밴드 링크는 누구나 들어올 수 있는 링크인지 한 번 더 확인해 주세요.</li><li data-mode-tip>운영팀이 내용을 확인한 뒤 게시합니다. 참여 링크·문의처를 바꾸면 다시 확인합니다.</li></ul></div></div>'
        :'<div class="card mn-tips"><b>함께 지켜 주세요</b><ul><li>광고·홍보 글, 같은 글 반복은 숨김 처리됩니다. 모임 홍보는 모임 소개 게시판을 이용해 주세요.</li><li>다른 사람의 연락처·사진 같은 개인정보는 올리지 말아 주세요.</li><li>욕설·비방, 돈을 먼저 보내라는 글은 신고해 주세요. 신고가 여러 건 쌓이면 먼저 숨겨집니다.</li><li>링크는 한 글에 3개까지 넣을 수 있습니다.</li><li data-mode-tip>올리면 바로 게시됩니다.</li></ul><p class="tiny muted mt-2"><a href="/community/#rules" style="text-decoration:underline">커뮤니티 이용 규칙 전체 보기</a></p></div>';
      root.innerHTML=tabs+'<div class="mn-layout">'+form+'<aside class="mn-side">'+side+'</aside></div>';
      var f=$('#cm-wform');
      if(board==='group') bindGroupForm(f, raw);
      // 운영팀이 게시 방식을 바꿨을 수 있으니 안내 문구를 맞춥니다
      api('meta').then(function(m){ var mode=m.modes&&m.modes[board]; if(!mode) return; $$('[data-mode-tip]').forEach(function(el){ el.textContent=mode==='review'?'운영팀이 내용을 확인한 뒤 게시합니다.'+(board==='group'?' 참여 링크·문의처를 바꾸면 다시 확인합니다.':' 보통 1영업일 안에 확인합니다.'):'올리면 바로 게시됩니다. 규칙에 어긋나면 운영팀이 내릴 수 있습니다.'; }); }).catch(function(){});
      $$('[data-count]', f).forEach(function(s){ var el=$('#'+s.dataset.count); function c(){ s.textContent=el.value.length; } el.addEventListener('input', c); c(); });
      f.addEventListener('submit', function(e){
        e.preventDefault();
        var o=M.formData(f); o.board=board; o.agree_rules=!!f.elements.agree_rules.checked; if(f.elements.agree_public) o.agree_public=!!f.elements.agree_public.checked;
        if(board==='group'){ o.recruiting=!!f.elements.recruiting.checked; var cu=String(o.cover_url||'').trim(); if(/^https:\/\//.test(cu)) o.cover=cu; delete o.cover_url; }
        var msg=$('#cm-wmsg'), btn=f.querySelector('[type=submit]');
        if(!M.validate(f)){ msg.hidden=false; msg.className='form-note'; msg.textContent='빨간 표시가 있는 칸을 채워 주세요.'; return; }
        btn.disabled=true; msg.hidden=true; saveNick(String(o.author||'').trim());
        api(editing?'posts/'+encodeURIComponent(ref):'posts',{ method:editing?'PUT':'POST', body:o }).then(function(r){ done(r); })
          .catch(function(e2){ msg.hidden=false; msg.className='form-note'; msg.textContent=errText(e2); btn.disabled=false; if(e2 && e2.status===401) gate(); });
      });
    }
    function done(r){
      var url=viewUrl({ board:r.board||board, ref:r.ref });
      if(r.status==='published' && !r.note){ M.toast(editing?'고친 내용을 저장했습니다.':'글을 올렸습니다.'); setTimeout(function(){ location.href=url; }, 400); return; }
      root.innerHTML='<div class="card mn-done"><div class="eyebrow">'+(editing?'Saved':'Submitted')+'</div><h2 class="h-m mt-1">'+(r.status==='pending'?(editing?'고친 내용을 받았습니다':'모임 소개를 받았습니다'):'저장했습니다')+'</h2>'
        +'<p class="muted mt-1">'+esc(r.note||(r.status==='pending'?'운영팀이 내용을 확인한 뒤 게시합니다. 보통 1영업일 안에 확인하며, 결과는 ‘내 글’에서 볼 수 있습니다.':''))+'</p>'
        +'<div class="row mt-3"><a class="btn btn-primary" href="/community/my/">내 글 보기</a><a class="btn btn-light" href="'+url+'">글 미리 보기</a><a class="btn btn-ghost" href="'+boardUrl(board)+'">목록으로</a></div></div>';
      window.scrollTo(0,0);
    }
  }
  function opt(map, sel, blank){ return (blank?'<option value="">'+esc(blank)+'</option>':'')+Object.keys(map).map(function(k){ return '<option value="'+k+'"'+(k===sel?' selected':'')+'>'+esc(map[k])+'</option>'; }).join(''); }
  function v(item, raw, k){ return esc(k==='title'?(item?item.title:''):raw[k]==null?'':raw[k]); }
  function agreeBlock(group){
    return '<fieldset class="fs fs-agree"><legend><span class="n">'+(group?'4':'2')+'</span>확인해 주세요</legend>'
      +(group?'<label class="agree"><input type="checkbox" name="agree_public" required'+(group===2?' checked':'')+'> <span>(필수) 적은 참여 링크·문의처(전화·이메일·카카오톡 아이디)가 모임 소개에 공개되는 데 동의합니다. 전화·이메일은 방문자가 ‘보기’를 눌렀을 때만 보입니다.</span></label>':'')
      +'<label class="agree"><input type="checkbox" name="agree_rules" required checked> <span>(필수) <a href="/community/#rules" target="_blank" rel="noopener" style="text-decoration:underline">커뮤니티 이용 규칙</a>을 읽었고, 규칙에 어긋나는 글은 운영팀이 내리거나 고쳐 달라고 할 수 있다는 데 동의합니다.</span></label>'
      +'<div class="form-note" id="cm-wmsg" hidden></div></fieldset>';
  }
  function nickField(item){ return '<div class="f"><label for="cm-w-nick">보이는 이름 (별명)</label><input class="input" id="cm-w-nick" name="author" maxlength="12" value="'+esc(item?item.author:nick())+'" placeholder="비우면 가입 이름의 일부만 보입니다 (예: 김*수)"><span class="hint">2~12자 · ‘메가스팟·운영자·관리자’가 들어간 이름은 쓸 수 없습니다.</span></div>'; }
  function freeForm(item, raw){
    var cats={}; Object.keys(C.FREE_CATS).forEach(function(k){ if(k!=='notice') cats[k]=C.FREE_CATS[k]; });
    return '<form class="form mn-form" id="cm-wform" novalidate><input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">'
      +'<fieldset class="fs"><legend><span class="n">1</span>글 내용</legend>'
      +'<div class="field-row cm-fr-cat"><div class="f"><label for="cm-w-cat">말머리 <span class="req">*</span></label><select class="select" id="cm-w-cat" name="category" required>'+opt(cats, item?item.category:'', '골라 주세요')+'</select></div>'
      +'<div class="f"><label for="cm-w-title">제목 <span class="req">*</span></label><input class="input" id="cm-w-title" name="title" maxlength="60" required value="'+v(item,raw,'title')+'" placeholder="한눈에 알 수 있게 적어 주세요"></div></div>'
      +'<div class="f"><label for="cm-w-body">내용 <span class="req">*</span></label><textarea class="textarea" id="cm-w-body" name="body" rows="14" maxlength="5000" required placeholder="행사 준비 이야기, 궁금한 점, 다녀온 모임 후기처럼 함께 나누고 싶은 이야기를 적어 주세요.">'+esc(item?item.body:'')+'</textarea><span class="hint"><span data-count="cm-w-body">0</span>/5000자</span></div>'
      +nickField(item)+'</fieldset>'
      +agreeBlock(0)
      +'<div class="row"><button class="btn btn-primary btn-lg" type="submit">'+(item?'고친 내용 저장':'글 올리기')+' <span class="arrow">→</span></button><a class="btn btn-ghost btn-lg" href="'+(item?viewUrl(item):'/community/free/')+'">취소</a></div></form>';
  }
  function groupForm(item, raw){
    var cover=raw.cover||'', custom=/^https:\/\//.test(cover);
    return '<form class="form mn-form" id="cm-wform" novalidate><input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">'
      +'<fieldset class="fs"><legend><span class="n">1</span>어떤 모임인가요</legend>'
      +'<div class="f"><label for="cm-w-title">모임 이름 <span class="req">*</span></label><input class="input" id="cm-w-title" name="title" maxlength="40" required value="'+v(item,raw,'title')+'" placeholder="예: 건대 보드게임 정기 모임"></div>'
      +'<div class="f"><span class="lbl">분류 <span class="req">*</span></span><div class="checks">'+Object.keys(C.GROUP_CATS).map(function(k,i){ return '<label class="chk"><input type="radio" name="category" value="'+k+'"'+((item?item.category===k:i===0)?' checked':'')+' required> '+esc(C.GROUP_CATS[k])+'</label>'; }).join('')+'</div></div>'
      +'<div class="f"><label for="cm-w-sum">한 줄 소개 <span class="req">*</span></label><input class="input" id="cm-w-sum" name="summary" maxlength="80" minlength="10" required value="'+v(item,raw,'summary')+'" placeholder="목록에 보이는 문장이에요. 누가 모여 무엇을 하는지 한 줄로"><span class="hint"><span data-count="cm-w-sum">0</span>/80자</span></div>'
      +'<div class="f"><label for="cm-w-body">모임 소개 <span class="req">*</span></label><textarea class="textarea" id="cm-w-body" name="body" rows="10" maxlength="4000" required placeholder="모임을 시작한 이유, 모이면 하는 일, 처음 온 사람이 참여하는 방법, 회비와 준비물을 적어 주세요.">'+esc(raw.body||'')+'</textarea><span class="hint"><span data-count="cm-w-body">0</span>/4000자 · 30자 이상</span></div>'
      +'<div class="field-row"><div class="f"><label for="cm-w-target">이런 분께 추천해요</label><input class="input" id="cm-w-target" name="target" maxlength="200" value="'+v(item,raw,'target')+'" placeholder="예: 보드게임을 처음 해 보는 분, 주말에 새 친구를 만나고 싶은 분"></div>'
      +'<div class="f"><label for="cm-w-tags">태그 <span class="muted">(쉼표로 구분 · 5개까지)</span></label><input class="input" id="cm-w-tags" name="tags" value="'+esc((raw.tags||[]).join(', '))+'" placeholder="예: 보드게임, 주말, 건대"></div></div>'
      +'</fieldset>'
      +'<fieldset class="fs"><legend><span class="n">2</span>어떻게 모이나요</legend>'
      +'<div class="field-row three"><div class="f"><label for="cm-w-region">활동 지역</label><input class="input" id="cm-w-region" name="region" maxlength="30" value="'+v(item,raw,'region')+'" placeholder="예: 건대입구·성수"></div>'
      +'<div class="f"><label for="cm-w-cycle">모임 주기</label><select class="select" id="cm-w-cycle" name="cycle">'+opt(C.CYCLES, raw.cycle||'', '고르지 않음')+'</select></div>'
      +'<div class="f"><label for="cm-w-size">모임 규모</label><select class="select" id="cm-w-size" name="size">'+opt(C.SIZES, raw.size||'', '고르지 않음')+'</select></div></div>'
      +'<div class="f"><label for="cm-w-sch">모이는 때</label><input class="input" id="cm-w-sch" name="schedule" maxlength="60" value="'+v(item,raw,'schedule')+'" placeholder="예: 매월 셋째 주 토요일 오후 2시"></div>'
      +'<div class="f"><span class="lbl">메가스팟 공간</span><div class="venue-pick">'
        +[['','메가스팟과 상관없이 모여요','다른 곳에서 모이는 모임도 소개할 수 있어요'],['megaspot-gundae','메가스팟 건대 1호','190평 · 최대 200명'],['megaspot-gundae-2','메가스팟 건대 2호','400평 · 최대 350명'],['both','건대 1호·2호 둘 다',''],['planned','메가스팟 이용 예정','큰 모임을 열 때 이용하려고 해요']].map(function(p){ return '<label class="vp"><input type="radio" name="venue" value="'+p[0]+'"'+((raw.venue||'')===p[0]?' checked':'')+'><span><b>'+esc(p[1])+'</b>'+(p[2]?'<small>'+esc(p[2])+'</small>':'')+'</span></label>'; }).join('')
      +'</div></div>'
      +'<div class="field-row"><div class="f"><span class="lbl">회비</span><div class="checks"><label class="chk"><input type="radio" name="fee" value=""'+(!raw.fee?' checked':'')+'> 적지 않음</label><label class="chk"><input type="radio" name="fee" value="free"'+(raw.fee==='free'?' checked':'')+'> 없음</label><label class="chk"><input type="radio" name="fee" value="paid"'+(raw.fee==='paid'?' checked':'')+'> 있음</label></div></div>'
      +'<div class="f" id="cm-w-feewrap"'+(raw.fee==='paid'?'':' hidden')+'><label for="cm-w-fee">회비 안내</label><input class="input" id="cm-w-fee" name="fee_text" maxlength="40" value="'+v(item,raw,'fee_text')+'" placeholder="예: 회당 1만 원 (공간 대관비 나눔)"></div></div>'
      +'<div class="f"><span class="lbl">대표 이미지</span><div class="cover-pick" id="cm-w-covers">'+C.COVERS.map(function(c){ return '<label class="cp"><input type="radio" name="cover" value="'+c[0]+'"'+(cover===c[0]?' checked':'')+'><img src="'+M.imgSrc(c[0],'t')+'" alt="" loading="lazy"><span>'+esc(c[1])+'</span></label>'; }).join('')+'</div>'
      +'<details class="mn-verify mt-1"'+(custom?' open':'')+'><summary>직접 찍은 사진 주소 넣기 <span class="muted">(선택)</span></summary><div class="f mt-1"><label for="cm-w-curl">사진 주소 (https://)</label><input class="input" id="cm-w-curl" name="cover_url" value="'+(custom?esc(cover):'')+'" placeholder="https://… .jpg"><span class="hint">권리가 있는 사진만 써 주세요. 사람 얼굴이 크게 나온 사진은 피해 주세요.</span></div></details></div>'
      +'<label class="chk cm-rec"><input type="checkbox" name="recruiting"'+(raw.recruiting===false?'':' checked')+'> 지금 새 멤버를 받고 있어요</label>'
      +'</fieldset>'
      +'<fieldset class="fs"><legend><span class="n">3</span>참여 방법과 문의처</legend>'
      +'<p class="small muted">참여 링크나 문의처 가운데 하나는 꼭 적어 주세요. 오픈채팅·밴드·카페·신청서 주소를 넣으면 버튼 이름이 알맞게 바뀝니다.</p>'
      +'<div class="field-row"><div class="f"><label for="cm-w-join">참여 링크</label><input class="input" id="cm-w-join" name="join_url" maxlength="500" inputmode="url" value="'+v(item,raw,'join_url')+'" placeholder="예: https://open.kakao.com/o/…"></div>'
      +'<div class="f"><label for="cm-w-jl">버튼 이름 <span class="muted">(선택)</span></label><input class="input" id="cm-w-jl" name="join_label" maxlength="16" value="'+v(item,raw,'join_label')+'" placeholder="비우면 링크에 맞춰 정해져요"></div></div>'
      +'<div class="f"><label for="cm-w-curl2">문의 링크</label><input class="input" id="cm-w-curl2" name="contact_url" maxlength="500" inputmode="url" value="'+v(item,raw,'contact_url')+'" placeholder="예: 1:1 오픈채팅, 인스타그램, 문의 양식 주소"></div>'
      +'<div class="field-row three"><div class="f"><label for="cm-w-ph">전화번호</label><input class="input" id="cm-w-ph" name="contact_phone" type="tel" maxlength="30" value="'+v(item,raw,'contact_phone')+'" placeholder="010-0000-0000"></div>'
      +'<div class="f"><label for="cm-w-em">이메일</label><input class="input" id="cm-w-em" name="contact_email" type="email" maxlength="120" value="'+v(item,raw,'contact_email')+'" placeholder="club@example.com"></div>'
      +'<div class="f"><label for="cm-w-kid">카카오톡 아이디</label><input class="input" id="cm-w-kid" name="kakao_id" maxlength="30" value="'+v(item,raw,'kakao_id')+'" placeholder="영문·숫자"></div></div>'
      +'<div class="f"><label for="cm-w-note">문의 안내</label><input class="input" id="cm-w-note" name="contact_note" maxlength="100" value="'+v(item,raw,'contact_note')+'" placeholder="예: 평일 저녁 8시 이후에 답해요"></div>'
      +'<div class="f"><label for="cm-w-mo">참가 신청을 받는 모임 모집 번호 <span class="muted">(선택)</span></label><input class="input" id="cm-w-mo" name="meetup_ref" maxlength="20" value="'+v(item,raw,'meetup_ref')+'" placeholder="MO-0000-XXXX"><span class="hint"><a href="/meetups/new/" target="_blank" rel="noopener" style="text-decoration:underline">모임 모집</a>에서 만든 참가 신청 페이지가 있으면 번호를 적어 주세요. 모임 소개 아래에 신청 카드가 붙습니다.</span></div>'
      +nickField(item)+'</fieldset>'
      +agreeBlock(item?2:1)
      +'<div class="row"><button class="btn btn-primary btn-lg" type="submit">'+(item?'고친 내용 저장':'모임 소개 올리기')+' <span class="arrow">→</span></button><a class="btn btn-ghost btn-lg" href="'+(item?viewUrl(item):'/community/groups/')+'">취소</a></div></form>';
  }
  function bindGroupForm(f, raw){
    var touched=!!raw.cover;
    function val(n){ var el=f.elements[n]; if(!el) return ''; if(el.length && !el.tagName){ for(var i=0;i<el.length;i++) if(el[i].checked) return el[i].value; return ''; } return el.type==='checkbox'?el.checked:String(el.value||'').trim(); }
    function preview(){
      var cat=val('category'), cu=val('cover_url');
      if(!touched){ var c=C.CAT_COVER[cat]||'v10', r=f.querySelector('input[name=cover][value="'+c+'"]'); if(r) r.checked=true; }
      $('#cm-w-feewrap').hidden=val('fee')!=='paid';
      var join=val('join_url');
      $('#cm-preview').innerHTML=groupCard({ title:val('title')||'모임 이름', summary:val('summary')||'한 줄 소개가 여기에 보입니다.', cat_label:C.GROUP_CATS[cat], region:val('region'), cycle_label:C.CYCLES[val('cycle')]||'', schedule:val('schedule'), size_label:C.SIZES[val('size')]||'',
        venue:val('venue'), venue_label:C.VENUES[val('venue')]||'', recruiting:!!val('recruiting'), cover:/^https:\/\//.test(cu)?cu:(val('cover')||C.CAT_COVER[cat]||'v10'), likes:0, comments:0, join:join?{ site:siteOf(join) }:null }, true);
    }
    f.addEventListener('input', preview); f.addEventListener('change', function(e){ if(e.target.name==='cover') touched=true; preview(); });
    preview();
  }
  function siteOf(u){ var h=''; try{ h=new URL(u, location.origin).hostname; }catch(e){ return '웹사이트'; } return /open\.kakao\.com$/.test(h)?'카카오톡 오픈채팅':/pf\.kakao\.com$/.test(h)?'카카오톡 채널':/band\.us$/.test(h)?'네이버 밴드':/cafe\.naver\.com$/.test(h)?'네이버 카페':/instagram\.com$/.test(h)?'인스타그램':/(forms\.gle|docs\.google\.com|form\.naver\.com)$/.test(h)?'신청서':/megaspot\.kr$/.test(h)||h===location.hostname?'메가스팟':'웹사이트'; }

  /* =================== 내 글 =================== */
  function my(){
    var root=$('#cm-my'); if(!root) return;
    function gate(){ root.innerHTML='<div class="cm-gate card"><h2 class="h-m">로그인하면 내가 쓴 글을 볼 수 있어요</h2><div class="row mt-3"><a class="btn btn-primary" href="'+loginUrl()+'">로그인</a><a class="btn btn-light" href="'+signupUrl()+'">회원가입</a></div></div>'; }
    if(!M.account.loggedIn()){ gate(); return; }
    function load(){
      api('mine').then(function(r){
        var items=r.items||[];
        var head='<div class="row between cm-my-head"><p class="small muted">내 글 '+num(items.length)+'개 · 내 댓글 '+num(r.comments)+'개'+(r.modes&&r.modes.group==='review'?' · 모임 소개는 운영팀 확인 뒤 게시됩니다.':'')+'</p><div class="row" style="gap:6px"><a class="btn btn-primary btn-sm" href="/community/write/?board=group">모임 소개 올리기</a><a class="btn btn-light btn-sm" href="/community/write/?board=free">자유게시판 글쓰기</a></div></div>'
          +(r.blocked?'<div class="notice mt-2"><div>커뮤니티 글쓰기가 제한된 계정입니다. 궁금한 점은 운영팀(카카오톡 채널 또는 전화)으로 문의해 주세요.</div></div>':'');
        root.innerHTML=head+(items.length?'<ul class="cm-mine">'+items.map(mineRow).join('')+'</ul>':emptyBox('아직 쓴 글이 없습니다', '모임을 소개하거나 자유게시판에 첫 글을 남겨 보세요.', ''));
      }).catch(function(e){ if(e && e.status===401){ gate(); return; } root.innerHTML='<div class="empty small">'+esc(errText(e))+'</div>'; });
    }
    function mineRow(x){
      return '<li class="cm-mrow" data-ref="'+esc(x.ref)+'"><div class="cm-mmain"><div class="row" style="gap:6px"><span class="cm-st cm-st-'+esc(x.status)+'">'+esc(x.status_label)+'</span><span class="cm-mboard">'+esc(x.board_label)+' · '+esc(x.cat_label)+'</span></div>'
        +'<a class="cm-mtitle" href="'+viewUrl(x)+'">'+esc(x.title)+'</a><p class="tiny muted">'+esc(when(x.created_at,true))+' · 조회 '+num(x.views)+' · '+(x.board==='group'?'관심 ':'공감 ')+num(x.likes)+' · 댓글 '+num(x.comments)+'</p>'
        +(x.reject_reason?'<p class="small cm-reason">반려 이유: '+esc(x.reject_reason)+'</p>':'')+'</div>'
        +'<div class="cm-mact">'+(x.board==='group'&&x.status!=='rejected'?'<label class="chk cm-mrec"><input type="checkbox" data-rec'+(x.recruiting===false?'':' checked')+'> 멤버 모집 중</label>':'')
        +'<a class="btn btn-light btn-sm" href="/community/write/?board='+esc(x.board)+'&id='+encodeURIComponent(x.ref)+'">고치기</a><button class="btn btn-ghost btn-sm" type="button" data-del>지우기</button></div></li>';
    }
    root.addEventListener('click', function(e){
      var del=e.target.closest('[data-del]'); if(!del) return; var ref=del.closest('[data-ref]').dataset.ref;
      if(!confirm('이 글을 지울까요? 지운 글은 되살릴 수 없습니다.')) return;
      api('posts/'+encodeURIComponent(ref),{ method:'DELETE' }).then(function(){ M.toast('글을 지웠습니다.'); load(); }).catch(function(e2){ M.toast(errText(e2)); });
    });
    root.addEventListener('change', function(e){
      var rc=e.target.closest('[data-rec]'); if(!rc) return; var ref=rc.closest('[data-ref]').dataset.ref; rc.disabled=true;
      api('posts/'+encodeURIComponent(ref),{ method:'PATCH', body:{ recruiting:rc.checked } }).then(function(r){ M.toast(r.recruiting?'‘새 멤버 모집 중’으로 표시했습니다.':'‘지금은 멤버를 받지 않아요’로 표시했습니다.'); }).catch(function(e2){ rc.checked=!rc.checked; M.toast(errText(e2)); }).then(function(){ rc.disabled=false; });
    });
    load();
  }

  hub(); groups(); groupView(); free(); freeView(); write(); my();
})();
