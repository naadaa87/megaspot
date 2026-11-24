/* 관리자 · 행사 사례 (2026-11-25) — 새 메뉴 (view: event-cases)
   주최 측 동의를 받은 행사만 홈페이지 '행사 사례'(/cases/)에 공개합니다.
   · 동의 기록(동의한 사람·날짜·방법·범위)이 있어야 [공개하기]가 됩니다.
   · 사진·주최 측 이름·한마디는 각각 동의 범위에 들어 있어야 공개됩니다.
   · 한 번 공개한 사례는 지우지 않고 숨김으로 둡니다.
   /api/admin/event-cases… 만 씁니다. 기존 관리자 화면은 건드리지 않습니다. 메뉴 버튼은 admin-navigation.js 가 붙입니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var main=document.querySelector('.adm-main'); if(!main) return;
  var esc=X.esc;
  // 홈페이지에 이미 있는 실제 행사 준비 현장 사진 (얼굴 가림 처리본)
  var PICK=[]; [['20261104-wine-setting',7,''],['20261102',5,''],['20261102-folder',10,'']].forEach(function(s){ for(var i=1;i<=s[1];i++){ var n=('0'+i).slice(-2), f=(s[0]==='20261102-folder'&&i===2)?'photo-02-redacted':'photo-'+n; PICK.push({src:'/assets/img/events/'+s[0]+'/'+f+'.jpg',thumb:'/assets/img/events/'+s[0]+'/'+f.replace('photo','thumb')+'.webp'}); } });
  var V=document.createElement('section'); V.id='view-event-cases'; V.className='adm-view ec-view'; V.hidden=true;
  V.innerHTML='<header class="adm-head"><div><h1>행사 사례</h1><p class="small muted">주최 측 동의를 받은 행사만 홈페이지 <a href="/cases/" target="_blank" rel="noopener">행사 사례</a>에 공개됩니다. 동의 기록을 남겨야 공개할 수 있고, 한 번 공개한 사례는 숨김으로만 내릴 수 있습니다.</p></div>'
    +'<div class="ec-acts"><button type="button" class="btn btn-primary btn-sm" id="ec-new">새 사례 쓰기</button></div></header>'
    +'<p class="small muted" id="ec-status" role="status"></p><div class="ec-list" id="ec-list"></div><div id="ec-editor"></div>';
  main.appendChild(V);
  var q=function(s){ return V.querySelector(s); }, items=[], opt=null;
  function kst(at){ var t=Date.parse(String(at||'').replace(' ','T')+'Z'); if(!isFinite(t)) return ''; var d=new Date(t+9*36e5).toISOString(); return d.slice(0,10); }
  function load(){
    q('#ec-status').textContent='불러오는 중…';
    return X.A('/event-cases').then(function(r){ items=r.items; opt=r.options; drawList(r.counts||{}); }).catch(function(e){ q('#ec-status').textContent='불러오지 못했습니다: '+(e&&e.message||''); });
  }
  function drawList(c){
    q('#ec-status').textContent='공개 '+(c.published||0)+'건 · 작성 중 '+(c.draft||0)+'건 · 숨김 '+(c.hidden||0)+'건';
    q('#ec-list').innerHTML=items.length?items.map(function(x){
      return '<article class="adm-card ec-item ec-'+esc(x.status)+'"><div class="ec-top"><div><span class="ec-pill ec-p-'+esc(x.status)+'">'+esc(x.status_label)+'</span><h3>'+esc(x.title||'(제목 없음)')+'</h3>'
        +'<p class="small muted">'+esc([x.space_label,x.purpose_label,x.month,x.headcount?x.headcount+'명':''].filter(Boolean).join(' · '))+' · '+esc(x.ref)+'</p>'
        +(x.status!=='published'&&x.publish_problem?'<p class="small ec-warn">공개 전에: '+esc(x.publish_problem)+'</p>':'')+'</div>'
        +'<div class="ec-acts"><button type="button" class="btn btn-light btn-sm" data-edit="'+esc(x.ref)+'">고치기</button>'+(x.status==='published'?'<a class="btn btn-light btn-sm" href="/cases/view/?id='+esc(x.ref)+'" target="_blank" rel="noopener">화면 보기 ↗</a>':'')+'</div></div></article>';
    }).join(''):'<div class="adm-card"><p class="small muted">아직 사례가 없습니다. [새 사례 쓰기]로 시작해 보세요. 주최 측에 공개 범위(내용·사진·이름·한마디)를 설명하고 동의를 받은 뒤 기록해 주세요.</p></div>';
    V.querySelectorAll('[data-edit]').forEach(function(b){ b.addEventListener('click',function(){ edit(items.filter(function(x){ return x.ref===b.dataset.edit; })[0]); }); });
  }
  function opts(map,cur,blank){ return (blank?'<option value="">'+blank+'</option>':'')+Object.keys(map).map(function(k){ return '<option value="'+k+'"'+(k===cur?' selected':'')+'>'+esc(map[k])+'</option>'; }).join(''); }
  function checks(name,map,cur){ return Object.keys(map).map(function(k){ return '<label class="ec-chk"><input type="checkbox" name="'+name+'" value="'+k+'"'+((cur||[]).indexOf(k)>=0?' checked':'')+'> '+esc(map[k])+'</label>'; }).join(''); }
  function edit(x){
    x=x||{}; var c=x.consent||{}, box=q('#ec-editor');
    var photos=(x.photos||[]).map(function(p){ return p.src+(p.alt?' | '+p.alt:''); }).join('\n');
    box.innerHTML='<form class="adm-card ec-form" id="ec-form" novalidate><h2 class="h-s">'+(x.ref?'사례 고치기 · '+esc(x.ref)+' <span class="ec-pill ec-p-'+esc(x.status)+'">'+esc(x.status_label)+'</span>':'새 사례')+'</h2>'
      +'<div class="ec-grid"><label class="ec-wide">제목 <small>60자</small><input class="input" name="title" maxlength="60" value="'+esc(x.title||'')+'" placeholder="예: IT 스타트업 120명 연말 행사"></label>'
      +'<label class="ec-wide">한 줄 요약 <small>160자 · 목록과 검색 결과에 보입니다</small><input class="input" name="summary" maxlength="160" value="'+esc(x.summary||'')+'"></label>'
      +'<label>공간<select class="select" name="space_id">'+opts(opt.spaces,x.space_id,'고르기')+'</select></label>'
      +'<label>행사 종류<select class="select" name="purpose">'+opts(opt.purposes,x.purpose,'고르기')+'</select></label>'
      +'<label>시기<input class="input" type="month" name="month" value="'+esc(x.month||'')+'"></label>'
      +'<label>인원<input class="input" name="headcount" inputmode="numeric" value="'+esc(x.headcount||'')+'"></label>'
      +'<label>배치<input class="input" name="layout" maxlength="40" value="'+esc(x.layout||'')+'" placeholder="예: 연회형 원탁 12개"></label>'
      +'<div class="ec-wide"><b class="small">함께 쓴 서비스</b><div class="ec-chks">'+checks('services',opt.services,(x.services||[]).map(function(s){ return s.id; }))+'</div></div>'
      +'<label class="ec-wide">본문 <small>준비 과정·진행 순서·좋았던 점</small><textarea class="input" name="body" rows="8" maxlength="4000">'+esc(x.body||'')+'</textarea></label>'
      +'<label class="ec-wide">사진 <small>한 줄에 하나 · 주소 | 설명 · 홈페이지 사진(/assets/img/…) 또는 https 주소 · 최대 12장</small><textarea class="input" name="photos" rows="4">'+esc(photos)+'</textarea></label>'
      +'<details class="ec-wide ec-pick"><summary class="small">홈페이지에 있는 행사 현장 사진에서 고르기</summary><div class="ec-pick-grid">'+PICK.map(function(p){ return '<button type="button" data-src="'+esc(p.src)+'"><img src="'+esc(p.thumb)+'" alt="" loading="lazy"></button>'; }).join('')+'</div></details>'
      +'<label>주최 측 표기 <small>선택 · 이름 공개 동의가 있을 때만</small><input class="input" name="org_label" maxlength="40" value="'+esc(x.org_label||'')+'" placeholder="예: OO협회 운영팀"></label>'
      +'<label class="ec-wide">주최 측 한마디 <small>선택 · 실제로 받은 말 그대로</small><textarea class="input" name="quote" rows="2" maxlength="200">'+esc(x.quote||'')+'</textarea></label></div>'
      +'<fieldset class="ec-consent"><legend>주최 측 동의 기록 <small>홈페이지에는 보이지 않습니다</small></legend><div class="ec-grid">'
      +'<label>동의한 사람<input class="input" name="c_by" maxlength="40" value="'+esc(c.by||'')+'" placeholder="예: 홍길동 매니저"></label>'
      +'<label>동의 날짜<input class="input" type="date" name="c_at" value="'+esc(c.at||'')+'"></label>'
      +'<label>방법<select class="select" name="c_method">'+opts(opt.methods,c.method,'고르기')+'</select></label>'
      +'<div class="ec-wide"><b class="small">공개해도 된다고 한 것</b><div class="ec-chks">'+checks('c_scope',opt.scopes,c.scope)+'</div></div>'
      +'<label class="ec-wide">동의 메모<input class="input" name="c_memo" maxlength="200" value="'+esc(c.memo||'')+'" placeholder="예: 카카오톡 11/20 대화에서 사진 3장까지 동의"></label>'
      +'<label class="ec-wide ec-confirm"><input type="checkbox" name="c_confirmed"'+(c.confirmed?' checked':'')+'> 주최 측에 공개 범위를 설명하고 동의를 받았습니다. 내려 달라고 하면 바로 숨깁니다.</label></div></fieldset>'
      +'<div class="ec-grid"><label>예약번호 <small>선택 · 운영 참고용</small><input class="input" name="booking_code" maxlength="20" value="'+esc(x.booking_code||'')+'"></label>'
      +'<label class="ec-wide">운영 메모<input class="input" name="note" maxlength="500" value="'+esc(x.note||'')+'"></label></div>'
      +'<p class="small" id="ec-msg" hidden></p><div class="ec-acts"><button class="btn btn-primary btn-sm" type="submit">저장</button>'
      +(x.ref&&x.status!=='published'?'<button type="button" class="btn btn-dark btn-sm" data-st="published">공개하기</button>':'')
      +(x.status==='published'?'<button type="button" class="btn btn-light btn-sm" data-st="hidden">숨기기</button>':'')
      +(x.status==='hidden'?'<button type="button" class="btn btn-light btn-sm" data-st="draft">작성 중으로</button>':'')
      +(x.ref&&x.status==='draft'?'<button type="button" class="btn btn-light btn-sm" data-del>지우기</button>':'')
      +'<button type="button" class="btn btn-light btn-sm" data-close>닫기</button></div></form>';
    box.scrollIntoView({behavior:'smooth',block:'start'});
    var f=q('#ec-form'), msg=q('#ec-msg');
    function say(t,ok){ msg.textContent=t; msg.className='small '+(ok?'ok':'err'); msg.hidden=false; }
    function body(){
      var g=function(n){ var el=f.elements[n]; return el?el.value:''; }, all=function(n){ return Array.prototype.slice.call(f.querySelectorAll('input[name="'+n+'"]:checked')).map(function(i){ return i.value; }); };
      return { title:g('title'), summary:g('summary'), body:g('body'), space_id:g('space_id'), purpose:g('purpose'), month:g('month'), headcount:g('headcount'), layout:g('layout'), services:all('services'),
        photos:g('photos').split('\n').map(function(l){ var p=l.split('|'); return { src:(p[0]||'').trim(), alt:(p.slice(1).join('|')||'').trim() }; }).filter(function(p){ return p.src; }),
        org_label:g('org_label'), quote:g('quote'), booking_code:g('booking_code'), note:g('note'),
        consent:{ by:g('c_by'), at:g('c_at'), method:g('c_method'), scope:all('c_scope'), memo:g('c_memo'), confirmed:f.elements.c_confirmed.checked } };
    }
    function save(){ var b=body(); return x.ref?X.A('/event-cases/'+x.ref,{method:'PUT',body:b}).then(function(){ return x.ref; }):X.A('/event-cases',{method:'POST',body:b}).then(function(r){ x.ref=r.ref; return r.ref; }); }
    f.addEventListener('submit',function(e){ e.preventDefault(); save().then(function(){ M.toast('저장했습니다.'); return load(); }).then(function(){ edit(items.filter(function(i){ return i.ref===x.ref; })[0]); }).catch(function(er){ say(er.message||'저장하지 못했습니다.'); }); });
    f.querySelectorAll('[data-st]').forEach(function(b){ b.addEventListener('click',function(){ var st=b.getAttribute('data-st');
      if(st==='published'&&!window.confirm('홈페이지에 공개할까요? 검색엔진에도 알려집니다.')) return;
      save().then(function(ref){ return X.A('/event-cases/'+ref+'/status',{method:'POST',body:{status:st}}); }).then(function(){ M.toast(st==='published'?'공개했습니다.':st==='hidden'?'숨겼습니다.':'작성 중으로 바꿨습니다.'); return load(); })
        .then(function(){ edit(items.filter(function(i){ return i.ref===x.ref; })[0]); }).catch(function(er){ say(er.message||'바꾸지 못했습니다.'); }); }); });
    var del=f.querySelector('[data-del]'); if(del) del.addEventListener('click',function(){ if(!window.confirm('작성 중인 사례를 지울까요? 되돌릴 수 없습니다.')) return;
      X.A('/event-cases/'+x.ref,{method:'DELETE'}).then(function(){ q('#ec-editor').innerHTML=''; M.toast('지웠습니다.'); load(); }).catch(function(er){ say(er.message); }); });
    f.querySelector('[data-close]').addEventListener('click',function(){ q('#ec-editor').innerHTML=''; });
    f.querySelectorAll('.ec-pick-grid button').forEach(function(b){ b.addEventListener('click',function(){ var t=f.elements.photos; if(t.value.indexOf(b.dataset.src)>=0) return; t.value=(t.value.trim()?t.value.trim()+'\n':'')+b.dataset.src+' | '; b.classList.add('on'); }); });
  }
  q('#ec-new').addEventListener('click',function(){ (opt?Promise.resolve():load()).then(function(){ edit(null); }); });
  X.register('event-cases',load);
})();
