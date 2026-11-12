/* 행사 준비 맡기기(/planning/) · 진행 상태 조회(/planning/status/)
   서버: POST /api/planning (접수) · GET /api/planning?ref=&k=|p= (조회). 본사 관리자 화면의 ‘행사 지원 요청’으로 들어갑니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, $$=M.$$, esc=M.esc, P=S.P, won=S.won, q=S.qs();
  var NEEDS=[['space','공간 찾기·예약','인원·예산·지역에 맞는 공간을 찾아 예약까지 챙깁니다.']].concat(P.addons.map(function(a){ return [a.id, a.label, a.desc]; }), [['etc','그 밖의 준비','음향·영상, 기념품, 숙박·이동처럼 따로 필요한 것을 알려 주세요.']]);
  function nl(t){ return esc(t||'').replace(/\n/g,'<br>'); }
  function telFmt(el){ el.addEventListener('input', function(){ var x=this.value.replace(/[^0-9]/g,'').slice(0,11); if(x.length>7) x=x.replace(/(\d{3})(\d{3,4})(\d{1,4})/,'$1-$2-$3'); else if(x.length>3) x=x.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=x; }); }

  /* ---------- 맡기기 ---------- */
  var form=$('#pl-form');
  if(form){
    $('#pl-what').innerHTML=NEEDS.map(function(n){ return '<div class="pf-box"><h3>'+esc(n[1])+'</h3><p>'+esc(n[2])+'</p></div>'; }).join('');
    $('#pl-purpose').innerHTML=S.opts(P.purposes, '', '선택');
    $('#pl-region').innerHTML=S.opts(P.regions, '', '어디든 괜찮아요');
    $('#pl-needs').innerHTML=NEEDS.map(function(n){ return '<label class="pl-need"><input type="checkbox" name="needs" value="'+n[0]+'"><span><b>'+esc(n[1])+'</b><small>'+esc(n[2])+'</small></span></label>'; }).join('');
    var e=form.elements; e.date.min=S.today(); telFmt(e.phone);
    // 공간 찾기·상세에서 넘어온 조건
    if(/^\d{4}-\d{2}-\d{2}$/.test(q.get('date')||'') && q.get('date')>=S.today()) e.date.value=q.get('date');
    if(/^[1-9]\d{0,4}$/.test(q.get('people')||'')) e.people.value=q.get('people');
    if(S.REG[q.get('region')]) e.region.value=q.get('region');
    var sp=q.get('space')||'', spName=q.get('name')||'';
    if(/^SP-[A-Z0-9-]+$/.test(sp)||sp==='megaspot-gundae'||sp==='megaspot-gundae-2'){ var b=$('#pl-space'); b.hidden=false; b.className='pf-msg ok'; b.textContent='‘'+(spName||(sp==='megaspot-gundae'?'메가스팟 건대 1호':sp==='megaspot-gundae-2'?'메가스팟 건대 2호':'선택한 공간'))+'’ 기준으로 준비를 맡깁니다.'; } else sp='';
    if(!sp){ var first=form.querySelector('input[name=needs][value=space]'); if(first) first.checked=true; }
    function total(){ var n=+e.people.value||0, b=+e.budget_pp.value||0; $('#pl-total').textContent=n&&b?'전체 예산 약 '+S.man(n*b)+' ('+n+'명 × '+won(b)+')':''; $$('#pl-quick button').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-v')===String(e.budget_pp.value||'')); }); }
    $('#pl-quick').addEventListener('click', function(ev){ var b=ev.target.closest('[data-v]'); if(!b) return; e.budget_pp.value=b.getAttribute('data-v'); total(); });
    form.addEventListener('input', total); total();
    form.addEventListener('submit', function(ev){ ev.preventDefault(); var err=$('#pl-err'); err.hidden=true;
      if(!M.validate(form)) return;
      var needs=$$('input[name=needs]:checked', form).map(function(i){ return i.value; });
      if(!needs.length){ err.textContent='맡기고 싶은 항목을 한 가지 이상 골라 주세요.'; err.hidden=false; $('#pl-needs').scrollIntoView({ block:'center', behavior:'smooth' }); return; }
      var btn=$('#pl-send'); btn.disabled=true; btn.textContent='보내는 중…';
      var body={ name:e.name.value.trim(), phone:e.phone.value.trim(), email:e.email.value.trim(), org:e.org.value.trim(), date:e.date.value, date_note:e.date_note.value.trim(), hours:e.hours.value, people:e.people.value, budget_pp:e.budget_pp.value, region:e.region.value, purpose:e.purpose.value,
        needs:needs, space:sp, message:e.message.value.trim(), contact_pref:(form.querySelector('input[name=contact_pref]:checked')||{}).value||'phone', agree_privacy:e.agree_privacy.checked, website:e.website.value };
      M.api('/planning', { method:'POST', body:body }).then(function(r){
        var url='/planning/status/?ref='+encodeURIComponent(r.ref)+'&k='+encodeURIComponent(r.k), d=$('#pl-done');
        try{ var l=JSON.parse(localStorage.getItem('ms_planning')||'[]'); l.unshift({ ref:r.ref, k:r.k, at:Date.now() }); localStorage.setItem('ms_planning', JSON.stringify(l.slice(0,10))); }catch(x){}
        form.hidden=true; d.hidden=false;
        d.innerHTML='<div class="pf-pill ok">접수 완료</div><h3>행사 준비를 맡겨 주셔서 고맙습니다</h3><p>접수번호 <b>'+esc(r.ref)+'</b></p><p>메가스팟 담당자가 내용을 확인하고 연락드립니다. 평일 10:00~19:00에 접수 순서대로 연락드리며, 주말·공휴일 접수는 다음 영업일에 이어집니다.</p>'
          +'<div class="row"><a class="btn btn-primary" href="'+esc(url)+'">진행 상태 보기</a><a class="btn btn-light" href="/docs/?type=plan&pl='+encodeURIComponent(r.ref)+'&k='+encodeURIComponent(r.k)+'" target="_blank" rel="noopener">요청 내용 PDF</a><button class="btn btn-light" type="button" id="pl-copy">조회 링크 복사</button></div>'
          +'<p class="pf-help">링크를 잃어버려도 접수번호와 휴대폰 뒷 4자리로 다시 조회할 수 있습니다.</p>';
        $('#pl-copy').addEventListener('click', function(){ M.copy(location.origin+url).then(function(ok){ M.toast(ok?'조회 링크를 복사했습니다.':'복사하지 못했습니다.'); }); });
        d.focus(); d.scrollIntoView({ block:'center', behavior:'smooth' });
      }).catch(function(x){ err.textContent=x&&x.code==='NO_API'?'서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.':(x&&x.message)||'접수하지 못했습니다.'; err.hidden=false; btn.disabled=false; btn.textContent='행사 준비 맡기기'; });
    });
  }

  /* ---------- 진행 상태 ---------- */
  var root=$('#ps'); if(!root) return;
  var AUTH={ ref:(q.get('ref')||'').toUpperCase(), k:q.get('k')||'', p:'' }, STEPS=[['new','접수'],['planning','기획 중'],['proposed','제안 발송'],['won','진행 확정'],['done','완료']];
  function finder(msg){ $('#ps-loading').hidden=true; root.hidden=true; $('#ps-find').hidden=false; if(AUTH.ref) $('#ps-ref').value=AUTH.ref; var er=$('#ps-err'); er.hidden=!msg; er.textContent=msg||''; }
  $('#ps-form').addEventListener('submit', function(ev){ ev.preventDefault(); if(!M.validate(this)) return; AUTH={ ref:this.elements.ref.value.trim().toUpperCase(), k:'', p:this.elements.p.value.trim() }; load(); });
  function load(){
    $('#ps-find').hidden=true; $('#ps-loading').hidden=false;
    var u=new URLSearchParams({ ref:AUTH.ref }); if(AUTH.k) u.set('k', AUTH.k); else u.set('p', AUTH.p);
    M.api('/planning?'+u.toString()).then(function(r){ draw(r.item); }).catch(function(x){ finder(x&&x.code==='NO_API'?'서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.':(x&&x.message)||'요청을 찾지 못했습니다.'); });
  }
  function draw(p){
    var idx=-1; STEPS.forEach(function(s, i){ if(s[0]===p.status) idx=i; }); var pr=p.proposal, closed=p.status==='closed';
    var doc=AUTH.k?'/docs/?type=plan&pl='+encodeURIComponent(p.ref)+'&k='+encodeURIComponent(AUTH.k):'';
    var now=closed?'<h2>종료된 요청입니다</h2><p>다시 준비가 필요하면 새로 맡겨 주세요.</p><div class="hc-acts"><a class="btn btn-primary" href="/planning/">행사 준비 맡기기</a></div>'
      :pr?'<h2>메가스팟 제안이 도착했습니다</h2>'+(pr.summary?'<p>'+nl(pr.summary)+'</p>':'')+(pr.amount!=null?'<p>제안 금액 <b>'+esc(won(pr.amount))+'</b>'+(p.people?' <span class="small muted">· 1인당 '+esc(won(Math.round(pr.amount/p.people)))+'</span>':'')+'</p>':'')
        +'<div class="hc-acts">'+(pr.link?'<a class="btn btn-primary" href="'+esc(pr.link)+'" target="_blank" rel="noopener">제안 자료 보기 ↗</a>':'')+(doc?'<a class="btn btn-light" href="'+esc(doc)+'" target="_blank" rel="noopener">행사기획서 PDF</a>':'')+'</div><p class="pf-help">진행을 정하거나 조정이 필요하면 담당자에게 알려 주세요. 전화 <a class="pf-link" href="tel:01023849580" data-phone>010-2384-9580</a></p>'
      :'<h2>'+(p.status==='new'?'요청을 접수했습니다':'담당자가 구성을 준비하고 있습니다')+'</h2><p>메가스팟 담당자가 조건에 맞는 공간과 구성을 확인하고 있습니다. 제안이 준비되면 이 화면에 표시됩니다.</p>';
    root.innerHTML='<header class="vb-head"><div>'+S.st(p.status, p.status_label)+'<h1>'+esc((p.purpose_label||'행사')+' 준비')+'</h1><p>'+esc([p.date?S.kdate(p.date):p.date_note||'날짜 협의', p.people?p.people+'명':'', p.region_label].filter(Boolean).join(' · '))+'</p><p class="small muted">접수번호 '+esc(p.ref)+' · '+esc(String(p.created_at).slice(0,10))+' 접수</p></div></header>'
      +(closed?'':'<ol class="vb-steps">'+STEPS.map(function(s, i){ return '<li class="'+(i<idx?'past':i===idx?'now':'')+'"><i>'+(i<idx?'✓':i+1)+'</i><span>'+s[1]+'</span></li>'; }).join('')+'</ol>')
      +'<section class="hc-card vb-now">'+now+'</section>'
      +'<section class="hc-card mt-2"><h2>맡긴 내용</h2><dl class="hc-kv"><dt>행사</dt><dd>'+esc(p.purpose_label||'미정')+'</dd><dt>날짜</dt><dd>'+esc([p.date?S.kdate(p.date):'', p.date_note].filter(Boolean).join(' · ')||'협의')+'</dd><dt>인원</dt><dd>'+(p.people?p.people+'명':'')+'</dd>'
        +'<dt>1인 예산</dt><dd>'+(p.budget_pp?esc(won(p.budget_pp))+(p.budget_total?' · 전체 약 '+esc(S.man(p.budget_total)):''):'협의')+'</dd><dt>지역</dt><dd>'+esc(p.region_label||'어디든')+'</dd><dt>맡긴 항목</dt><dd>'+esc(p.needs.join(' · '))+'</dd>'+(p.message?'<dt>요청 내용</dt><dd>'+esc(p.message)+'</dd>':'')+'</dl>'
        +(doc&&!pr?'<div class="hc-acts mt-2"><a class="btn btn-light btn-sm" href="'+esc(doc)+'" target="_blank" rel="noopener">요청 내용 PDF</a></div>':'')+'</section>'
      +'<p class="pf-help mt-2">내용을 바꾸거나 더 알려 주실 것이 있으면 전화 <a class="pf-link" href="tel:01023849580" data-phone>010-2384-9580</a> 또는 <a class="pf-link" href="https://pf.kakao.com/_LnxbmX/chat" target="_blank" rel="noopener" data-kakao>카카오톡</a>으로 접수번호와 함께 알려 주세요.</p>';
    $('#ps-loading').hidden=true; $('#ps-find').hidden=true; root.hidden=false;
  }
  if(/^PL-[A-Z0-9-]+$/.test(AUTH.ref) && AUTH.k) load(); else finder('');
})();
