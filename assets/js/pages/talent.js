/* MC·강사 섭외 화면 (/mc/ · /mc/view/) — 2026-11-25
   · 목록 카드와 상세 내용은 서버가 HTML 로 채웁니다(functions/api/_talent_view.js).
     이 스크립트는 거르기·후보 담기·요청서 보내기·진행 상태 확인만 합니다.
     서버가 채우지 못한 경우에는 /api/talent?html=1 로 같은 HTML 을 받아 넣습니다.
   · 후보는 이 브라우저에만 저장합니다(최대 3명).
   · 진행자 연락처는 이 화면 어디에도 오지 않습니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT; if(!M) return;
  var $=function(s,el){ return (el||document).querySelector(s); }, $$=function(s,el){ return Array.prototype.slice.call((el||document).querySelectorAll(s)); };
  var esc=M.esc, KEY='megaspot.talent.picks.v1', MAX=3, SLUG=/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
  var params=new URLSearchParams(location.search), onList=!!$('#tl-list'), onView=!!$('#tv-view');

  /* ---------- 후보 (이 브라우저에만) ---------- */
  function getPicks(){ try{ var v=JSON.parse(localStorage.getItem(KEY)||'[]'); return Array.isArray(v)?v.filter(function(x){ return x&&SLUG.test(x.slug); }).slice(0,MAX):[]; }catch(e){ return []; } }
  function savePicks(v){ try{ localStorage.setItem(KEY, JSON.stringify(v.slice(0,MAX))); }catch(e){} renderPicks(); }
  function infoOf(slug){
    var el=$('[data-slug="'+slug+'"]'); if(!el) return null;
    var img=$('.tl-ph img,.tv-photo img',el), src=img?(img.currentSrc||img.getAttribute('src')):'';
    return { slug:slug, name:el.getAttribute('data-name')||slug, photo:src };
  }
  function togglePick(slug){
    var list=getPicks(), i=list.map(function(x){ return x.slug; }).indexOf(slug);
    if(i>=0){ list.splice(i,1); savePicks(list); return; }
    if(list.length>=MAX){ M.toast('후보는 3명까지 담을 수 있어요. 다른 후보를 빼고 담아 주세요.'); return; }
    var info=infoOf(slug); if(!info) return;
    list.push(info); savePicks(list);
  }
  function addPick(slug){ var list=getPicks(); if(list.some(function(x){ return x.slug===slug; })) return; var info=infoOf(slug); if(!info) return; if(list.length>=MAX) list.shift(); list.push(info); savePicks(list); }
  document.addEventListener('click', function(e){ var b=e.target.closest('[data-pick]'); if(b){ e.preventDefault(); togglePick(b.getAttribute('data-pick')); } });

  var tray=$('#tl-tray'), formInView=false;
  function renderPicks(){
    var list=getPicks(), on={}; list.forEach(function(x){ on[x.slug]=1; });
    $$('[data-pick]').forEach(function(b){ b.setAttribute('aria-pressed', on[b.getAttribute('data-pick')]?'true':'false'); });
    $$('.tl-card').forEach(function(c){ c.classList.toggle('is-picked', !!on[c.getAttribute('data-slug')]); });
    if(tray){
      $('#tl-tray-list').innerHTML=list.map(function(x){ return x.photo?'<img src="'+esc(x.photo)+'" alt="">':''; }).join('')+'<span class="tl-tray-t">후보 '+list.length+'명 · '+esc(list.map(function(x){ return x.name; }).join(', '))+'</span>';
      tray.hidden=!list.length; tray.classList.toggle('off', formInView);
    }
    var box=$('#tr-picked'); if(!box) return;
    box.innerHTML=list.length?list.map(function(x){ return '<span class="tl-chip">'+(x.photo?'<img src="'+esc(x.photo)+'" alt="">':'')+esc(x.name)+'<button type="button" data-unpick="'+esc(x.slug)+'" aria-label="'+esc(x.name)+' 후보에서 빼기">×</button></span>'; }).join('')+(list.length<MAX?'<a class="tl-add" href="#list">+ 더 고르기</a>':'')
      :'<p class="small muted">위 목록에서 ‘후보 담기’를 누르면 여기에 담깁니다. 고르지 않으면 행사에 맞는 분을 추천해 드려요.</p>';
    $$('[data-unpick]',box).forEach(function(b){ b.addEventListener('click',function(){ savePicks(getPicks().filter(function(x){ return x.slug!==b.getAttribute('data-unpick'); })); }); });
    var rec=$('#tr-rec'); if(rec){ var lab=rec.parentNode; rec.disabled=!list.length; if(!list.length) rec.checked=true; lab.lastChild.textContent=list.length?' 후보가 어려우면 비슷한 진행자를 추천받을게요':' 행사에 맞는 진행자를 추천받을게요'; }
  }

  /* ---------- 목록 거르기 ---------- */
  var F={ role:'', lang:'', q:'' };
  function applyFilter(){
    var cards=$$('#tl-list .tl-card'), words=F.q.toLowerCase().split(/\s+/).filter(Boolean), n=0;
    cards.forEach(function(c){
      var roles=(c.getAttribute('data-roles')||'').split(' '), langs=(c.getAttribute('data-langs')||'').split(' ').filter(Boolean), q=c.getAttribute('data-q')||'';
      var ok=(!F.role||roles.indexOf(F.role)>=0)&&(!F.lang||(F.lang==='any'?langs.length>0:langs.indexOf(F.lang)>=0))&&words.every(function(w){ return q.indexOf(w)>=0; });
      c.hidden=!ok; if(ok) n++;
    });
    var total=$('#tl-total'); if(total) total.textContent=cards.length;
    var shown=$('#tl-shown'); if(shown) shown.textContent=(F.role||F.lang||F.q)&&cards.length?'조건에 맞는 '+n+'명 / ':'';
    var none=$('#tl-none'); if(none) none.hidden=!(cards.length&&!n);
    $$('.tl-chips .chip').forEach(function(b){ var on=b.getAttribute('data-role')===F.role; b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); });
    var ls=$('#tl-lang'); if(ls&&ls.value!==F.lang) ls.value=F.lang;
    $$('.tl-match-list button').forEach(function(b){ b.classList.toggle('on', (!!F.role&&b.getAttribute('data-match-role')===F.role)||(!!F.lang&&b.getAttribute('data-match-lang')===F.lang&&!F.role)); });
  }
  function initList(){
    $$('.tl-chips .chip').forEach(function(b){ b.addEventListener('click',function(){ F.role=b.getAttribute('data-role')||''; applyFilter(); }); });
    var ls=$('#tl-lang'); if(ls) ls.addEventListener('change',function(){ F.lang=ls.value; applyFilter(); });
    var q=$('#tl-q'), t; if(q) q.addEventListener('input',function(){ clearTimeout(t); t=setTimeout(function(){ F.q=q.value.trim(); applyFilter(); },150); });
    $$('.tl-match-list button').forEach(function(b){ b.addEventListener('click',function(){
      F.role=b.getAttribute('data-match-role')||''; F.lang=b.getAttribute('data-match-lang')||''; F.q=''; if(q) q.value=''; applyFilter();
      var roleBox=$('#tl-form input[name="roles"][value="'+F.role+'"]'); if(roleBox&&!$$('#tl-form input[name="roles"]:checked').length) roleBox.checked=true;
      $('#list').scrollIntoView({behavior:'smooth',block:'start'});
    }); });
    if(params.get('role')) F.role=params.get('role'); if(params.get('lang')) F.lang=params.get('lang');
    var list=$('#tl-list');
    var ready=$$('.tl-card',list).length?Promise.resolve():M.api('/talent?html=1').then(function(r){ list.innerHTML=r.html||''; if(!r.html) throw new Error('empty'); }).catch(function(){
      list.innerHTML='<div class="empty small">지금 진행자 목록을 불러오지 못했습니다. 아래 요청서에 행사 내용을 남겨 주시면 맞는 진행자를 찾아 드려요.</div>';
    });
    return ready.then(function(){ applyFilter(); });
  }

  /* ---------- 상세 ---------- */
  function initView(){
    var box=$('#tv-view'), id=(params.get('id')||'').toLowerCase();
    var ready=$('.tv',box)?Promise.resolve():(!SLUG.test(id)?Promise.reject(new Error('id')):M.api('/talent/'+encodeURIComponent(id)+'?html=1').then(function(r){
      box.innerHTML=r.html; document.title=r.item.name+' '+(r.item.title||'').split('·')[0].trim()+' 섭외 | MC·강사 섭외 | 메가스팟'; var c=$('#tv-crumb'); if(c) c.textContent=r.item.name;
    }));
    return ready.then(function(){
      var gal=$('[data-tv-gallery]',box), art=$('.tv',box), who=art?art.getAttribute('data-name'):'';
      if(gal&&M.openLightbox){ var links=$$('[data-tv-photo]',gal); gal.addEventListener('click',function(e){ var a=e.target.closest('[data-tv-photo]'); if(!a||e.ctrlKey||e.metaKey||e.shiftKey) return; e.preventDefault(); M.openLightbox(links.map(function(l){ return { src:l.getAttribute('href'), title:l.getAttribute('data-title')||'', cap:who?who+' 진행 현장':'' }; }), links.indexOf(a)); }); }
    }).catch(function(){ box.innerHTML='<div class="card"><h1 class="h-m">진행자 정보를 찾지 못했습니다</h1><p class="muted mt-1">주소가 바뀌었거나 지금은 소개를 쉬고 있는 진행자일 수 있어요.</p><div class="row mt-2" style="gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="/mc/">진행자 전체 보기</a><a class="btn btn-light" href="/mc/#request">섭외 요청하기</a></div></div>'; });
  }

  /* ---------- 요청서 ---------- */
  var form=$('#tl-form');
  function kstToday(){ return new Date(Date.now()+9*36e5).toISOString().slice(0,10); }
  function fmtPhone(v){ var x=String(v||'').replace(/\D/g,'').slice(0,11); if(/^02/.test(x)) return x.length<3?x:x.length<6?x.slice(0,2)+'-'+x.slice(2):x.length<10?x.slice(0,2)+'-'+x.slice(2,5)+'-'+x.slice(5):x.slice(0,2)+'-'+x.slice(2,6)+'-'+x.slice(6,10); return x.length<4?x:x.length<8?x.slice(0,3)+'-'+x.slice(3):x.slice(0,3)+'-'+x.slice(3,x.length-4)+'-'+x.slice(-4); }
  var LABEL={ event_type:{ceremony:'기념식·개관식·시상식',forum:'포럼·세미나·컨퍼런스',corporate:'기업 행사·워크숍',party:'송년회·신년회·파티',sports:'체육대회·운동회',festival:'축제·공연·음악회',lecture:'특강·교육',global:'국제 행사',etc:'기타 행사'},
    place:{'megaspot-gundae':'메가스팟 건대 1호','megaspot-gundae-2':'메가스팟 건대 2호',other:'다른 장소',tbd:'아직 미정'}, roles:{announcer:'공식행사 아나운서',mc:'행사 MC',recreation:'레크리에이션',lecture:'강의·특강',broadcast:'방송·영상 진행'}, langs:{en:'영어',zh:'중국어',ja:'일본어'},
    needs:{script:'대본·큐시트 작성',rehearsal:'리허설 참석',meeting:'사전 미팅',online:'온라인 생중계'}, budget:{u50:'50만 원 미만',b100:'50만~100만 원',b200:'100만~200만 원',o200:'200만 원 이상',ask:'아직 모르겠어요'} };
  function checked(name){ return $$('#tl-form input[name="'+name+'"]:checked').map(function(i){ return i.value; }); }
  function body(){
    var g=function(n){ var el=form.elements[n]; return el?String(el.value||'').trim():''; };
    var place=(form.querySelector('input[name="place"]:checked')||{}).value||'tbd';
    return { event_type:g('event_type'), event_name:g('event_name'), event_date:$('#tr-tbd').checked?'':g('event_date'), date_tbd:$('#tr-tbd').checked||!g('event_date'), start_t:g('start_t'), end_t:g('end_t'),
      place:place, place_detail:place==='other'?g('place_detail'):'', headcount:g('headcount'), roles:checked('roles'), langs:checked('langs'), needs:checked('needs'), budget:g('budget'),
      picks:getPicks().map(function(x){ return x.slug; }), recommend:$('#tr-rec').checked, message:g('message'), name:g('name'), phone:g('phone'), email:g('email'), org:g('org'), inquiry_ref:g('inquiry_ref'),
      agree_privacy:$('#tr-agree').checked, website:g('website'), came_from:M.source?M.source():null };
  }
  function summary(b, ref){
    var L=function(k,v){ return (LABEL[k]||{})[v]||v; }, t=[];
    t.push('[메가스팟 진행자 섭외 요청]'+(ref?' '+ref:''));
    t.push('행사: '+[L('event_type',b.event_type),b.event_name].filter(Boolean).join(' · ')||'행사: (미정)');
    t.push('날짜: '+(b.event_date||'미정')+(b.start_t?' '+b.start_t+(b.end_t?'~'+b.end_t:''):''));
    t.push('장소: '+L('place',b.place)+(b.place_detail?' ('+b.place_detail+')':'')+(b.headcount?' · '+b.headcount+'명':''));
    if(b.roles.length) t.push('필요한 진행: '+b.roles.map(function(x){ return L('roles',x); }).join(', '));
    if(b.langs.length) t.push('외국어: '+b.langs.map(function(x){ return L('langs',x); }).join(', '));
    t.push('희망 진행자: '+(getPicks().map(function(x){ return x.name; }).join(', ')||'추천 요청'));
    if(b.budget) t.push('예산: '+L('budget',b.budget));
    if(b.needs.length) t.push('함께 필요한 것: '+b.needs.map(function(x){ return L('needs',x); }).join(', '));
    if(b.message) t.push('요청 내용: '+b.message);
    t.push('연락처: '+b.name+' '+b.phone+(b.org?' · '+b.org:''));
    return t.join('\n');
  }
  function fail(msg, el){ var e=$('#tr-err'); e.textContent=msg; e.hidden=false; if(el){ el.classList.add('invalid'); el.focus({preventScroll:false}); } else e.scrollIntoView({behavior:'smooth',block:'center'}); }
  function done(ref, b, offline){
    var wrap=$('#tl-form-wrap'), kakao=(M.CONFIG&&M.CONFIG.kakaoChannel)||'https://pf.kakao.com/_LnxbmX/chat', text=summary(b, ref);
    wrap.innerHTML='<div class="card tl-done" tabindex="-1">'+(offline
      ?'<div class="tl-done-ic" style="background:var(--warn)">!</div><h3>지금은 온라인 접수가 잠시 안 됩니다</h3><p class="muted mt-1">아래 내용을 복사해 카카오톡이나 문자로 보내 주시면 같은 내용으로 접수해 드릴게요.</p><pre>'+esc(text)+'</pre><div class="row mt-2" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" data-copy>내용 복사</button><a class="btn btn-kakao" href="'+esc(kakao)+'" target="_blank" rel="noopener">카카오톡으로 보내기</a></div>'
      :'<div class="tl-done-ic">✓</div><h3>섭외 요청을 받았습니다</h3><p class="muted mt-1">진행 상태를 볼 때 쓰니 접수번호를 꼭 남겨 두세요.</p><span class="tl-ref">'+esc(ref)+'</span>'
       +'<ol><li>요청 접수 — 방금 보내 주신 내용이 운영팀에 전달됐어요.</li><li>진행자 일정·조건 확인 — 확인되는 대로 남겨 주신 번호('+esc(b.phone)+')로 연락드립니다.</li><li>견적 안내 후 확정 — 확정되면 큐시트와 진행 순서를 함께 맞춥니다.</li></ol>'
       +'<div class="row mt-3" style="gap:8px;flex-wrap:wrap"><a class="btn btn-light" href="#status" data-fill-status>진행 상태 확인</a><a class="btn btn-kakao" href="'+esc(kakao)+'" target="_blank" rel="noopener">카카오톡으로 더 알려 주기</a><button type="button" class="btn btn-light" data-copy>요청 내용 복사</button>'+(b.place==='tbd'||b.place==='other'?'':'')+'</div>'
       +(b.place==='tbd'?'<p class="small muted mt-3">행사 공간도 찾고 계시면 <a href="/inquiry/" style="color:var(--cobalt);font-weight:700">메가스팟 건대 1호·2호 예상 금액</a>을 함께 확인해 보세요.</p>':''))+'</div>';
    var card=$('.tl-done',wrap); card.focus({preventScroll:true}); card.scrollIntoView({behavior:'smooth',block:'start'});
    var cp=$('[data-copy]',wrap); if(cp) cp.addEventListener('click',function(){ M.copy(text).then(function(ok){ M.toast(ok?'내용을 복사했습니다.':'복사하지 못했습니다. 직접 선택해 복사해 주세요.'); }); });
    var fs=$('[data-fill-status]',wrap); if(fs) fs.addEventListener('click',function(){ $('#tl-st-ref').value=ref; $('#tl-st-ph').value=String(b.phone).replace(/\D/g,'').slice(-4); });
    if(!offline) savePicks([]);
  }
  function initForm(){
    if(!form) return;
    var opts='<option value="">시작</option>', opts2='<option value="">끝</option>';
    for(var m=7*60;m<=23*60+30;m+=30){ var t=('0'+Math.floor(m/60)).slice(-2)+':'+('0'+m%60).slice(-2); opts+='<option>'+t+'</option>'; opts2+='<option>'+t+'</option>'; }
    $('#tr-start').innerHTML=opts; $('#tr-end').innerHTML=opts2;
    $('#tr-start').addEventListener('change',function(){ var s=this.value, e=$('#tr-end'); if(s&&(!e.value||e.value<=s)){ var h=Math.min(23,+s.slice(0,2)+2); e.value=('0'+h).slice(-2)+s.slice(2); } });
    var date=$('#tr-date'); date.min=kstToday();
    $('#tr-tbd').addEventListener('change',function(){ date.disabled=this.checked; if(this.checked) date.value=''; });
    var detail=$('#tr-pdetail');
    $$('input[name="place"]',form).forEach(function(r){ r.addEventListener('change',function(){ detail.hidden=r.value!=='other'||!r.checked; if(!detail.hidden) detail.focus(); }); });
    var sp=params.get('space'); if(sp){ var r=form.querySelector('input[name="place"][value="'+sp+'"]'); if(r){ r.checked=true; } }
    if(params.get('date')&&/^\d{4}-\d{2}-\d{2}$/.test(params.get('date'))) date.value=params.get('date');
    if(params.get('people')) $('#tr-head').value=String(parseInt(params.get('people'),10)||'');
    if(params.get('ref')) $('#tr-iref').value=params.get('ref').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,20);
    var ev=params.get('event'); if(ev&&LABEL.event_type[ev]) $('#tr-type').value=ev;
    var ph=$('#tr-phone'); ph.addEventListener('input',function(){ var v=fmtPhone(ph.value); if(v!==ph.value) ph.value=v; });
    $$('input,select,textarea',form).forEach(function(el){ el.addEventListener('input',function(){ el.classList.remove('invalid'); $('#tr-err').hidden=true; }); });
    if(M.account&&M.account.me) M.account.me().then(function(m){ if(!m) return; if(!$('#tr-cname').value) $('#tr-cname').value=m.name||''; if(!ph.value) ph.value=fmtPhone(m.phone||''); if(!$('#tr-email').value) $('#tr-email').value=m.email||''; if(!$('#tr-org').value) $('#tr-org').value=m.org||''; });
    form.addEventListener('submit',function(e){
      e.preventDefault(); var b=body();
      if(!b.date_tbd&&b.event_date&&b.event_date<kstToday()) return fail('지난 날짜는 고를 수 없어요. 행사일을 다시 골라 주세요.', date);
      if(b.place==='other'&&!b.place_detail) return fail('행사 장소(지역·장소 이름)를 적어 주세요.', detail);
      if(!b.name) return fail('이름을 적어 주세요.', $('#tr-cname'));
      if(!/^0\d{8,10}$/.test(b.phone.replace(/\D/g,''))) return fail('휴대폰 번호를 확인해 주세요.', ph);
      if(b.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(b.email)) return fail('이메일 주소를 확인해 주세요.', $('#tr-email'));
      if(!b.agree_privacy) return fail('개인정보 수집·이용에 동의해 주세요.', $('#tr-agree'));
      var btn=$('#tr-send'); btn.disabled=true; btn.textContent='보내는 중…';
      M.api('/talent/request',{method:'POST',body:b}).then(function(r){ done(r.ref, b, false); })
        .catch(function(er){ btn.disabled=false; btn.textContent='섭외 요청 보내기'; if(er&&er.code==='NO_API') done('', b, true); else fail((er&&er.message)||'보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); });
    });
    // 요청서가 보이는 동안에는 후보 바를 숨깁니다
    if('IntersectionObserver' in window){ new IntersectionObserver(function(en){ formInView=en[0].isIntersecting; if(tray) tray.classList.toggle('off', formInView); },{ rootMargin:'0px 0px -30% 0px' }).observe($('#request')); }
  }

  /* ---------- 진행 상태 확인 ---------- */
  function initStatus(){
    var f=$('#tl-st-form'); if(!f) return;
    var out=$('#tl-st-out'), STEPS=['new','checking','quoted','confirmed','done'];
    f.addEventListener('submit',function(e){
      e.preventDefault(); var ref=$('#tl-st-ref').value.trim().toUpperCase(), p=$('#tl-st-ph').value.replace(/\D/g,'');
      if(!/^TR-\d{4}-[A-Z0-9]{4}$/.test(ref)||p.length!==4){ out.innerHTML='<p class="tl-st-err">접수번호(TR-0000-0000)와 휴대폰 번호 뒷 4자리를 확인해 주세요.</p>'; return; }
      out.innerHTML='<p class="small muted mt-2">확인하는 중…</p>';
      M.api('/talent/status',{method:'POST',body:{ref:ref,phone4:p}}).then(function(r){
        var idx=STEPS.indexOf(r.status), cancelled=r.status==='cancelled';
        out.innerHTML='<div class="tl-st-res"><b>'+esc(r.ref)+' · '+esc(r.status_label)+'</b>'+(cancelled?'':'<div class="tl-prog" aria-hidden="true">'+STEPS.map(function(s,i){ return '<i class="'+(i<=idx?'on':'')+'"></i>'; }).join('')+'</div>')
          +'<dl><dt>행사일</dt><dd>'+esc(r.event_label||'미정')+'</dd><dt>장소</dt><dd>'+esc(r.place||'-')+'</dd>'
          +(r.assigned&&r.assigned.length?'<dt>진행자</dt><dd>'+esc(r.assigned.join(', '))+'</dd>':(r.picks&&r.picks.length?'<dt>희망</dt><dd>'+esc(r.picks.join(', '))+'</dd>':''))
          +(r.quote?'<dt>견적</dt><dd>'+esc(Number(r.quote.amount).toLocaleString('ko-KR'))+'원 ('+esc(r.quote.vat)+')</dd>':'')+'</dl>'
          +'<p class="tiny muted mt-1">자세한 내용은 카카오톡이나 전화로 편하게 물어봐 주세요.</p></div>';
      }).catch(function(er){ out.innerHTML='<p class="tl-st-err">'+esc(er&&er.code==='NO_API'?'지금은 조회가 잠시 안 됩니다. 카카오톡으로 접수번호를 알려 주세요.':(er&&er.message)||'확인하지 못했습니다.')+'</p>'; });
    });
  }

  /* ---------- 시작 ---------- */
  (onList?initList():onView?initView():Promise.resolve()).then(function(){
    var pk=(params.get('pick')||'').toLowerCase(); if(SLUG.test(pk)) addPick(pk);
    renderPicks();
    if(pk&&onList){ setTimeout(function(){ var r=$('#request'); if(r) r.scrollIntoView({behavior:'smooth',block:'start'}); },60); }
  });
  initForm(); initStatus();
  window.addEventListener('storage',function(e){ if(e.key===KEY) renderPicks(); });
})();
