/* 입점 공간 상세(/spaces/view/?id=SP-…) — 사진 · 정보 · 요금 · 예상 금액 · 예약 요청
   서버: /api/venues/item · estimate · request · track. 결제는 호스트가 일정을 확인한 뒤 호스트에게 직접 합니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, $$=M.$$, esc=M.esc, P=S.P, won=S.won, q=S.qs(), ref=(q.get('id')||'').toUpperCase();
  var box=$('#vn-book'); if(!box) return;
  var V=null, CLOSED={}, BOOKED={}, ADDONS=[], TODAY=S.today(), EST=null, step=1, timer=null, seq=0, PREVIEW=false;
  var SEL={ date:'', mode:'', start:'', end:'', pkg:0, people:'', options:{}, addons:{}, addon_note:'' };
  function fail(){ $('#vn-loading').hidden=true; $('#vn-none').hidden=false; }
  if(!/^SP-[A-Z0-9-]+$/.test(ref)) return fail();
  function track(ev){ if(PREVIEW) return; M.api('/venues/track', { method:'POST', body:{ ref:ref, ev:ev } }).catch(function(){}); }
  function addDays(iso, n){ var d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return M.fmtDate(d); }
  function nl(t){ return esc(t).replace(/\n/g,'<br>'); }
  function sec(id, title, html, sub){ return html?'<section class="vn-sec" id="vn-'+id+'"><h2>'+esc(title)+(sub?' <small>'+esc(sub)+'</small>':'')+'</h2>'+html+'</section>':''; }
  function dayRate(o, unit){ if(!o) return ''; var a=o.weekday, b=o.weekend; if(a==null&&b==null) return ''; return (a!=null?'평일 '+won(a):'')+(a!=null&&b!=null?' · ':'')+(b!=null?'주말·공휴일 '+won(b):'')+(unit||''); }
  function times(from, to, sel){ var o=''; for(var m=from; m<=to; m+=30){ var t=M.pad2(Math.floor(m/60))+':'+M.pad2(m%60); o+='<option value="'+t+'"'+(t===sel?' selected':'')+'>'+t+'</option>'; } return o; }

  M.api('/venues/item/'+encodeURIComponent(ref)).then(function(r){
    V=r.space; TODAY=r.today||TODAY; ADDONS=r.addons||P.addons; PREVIEW=!!r.preview; (r.closed||[]).forEach(function(d){ CLOSED[d]=1; }); (r.booked||[]).forEach(function(b){ (BOOKED[b.day]=BOOKED[b.day]||[]).push(b); });
    draw(); track('view');
    // 호스트 미리보기: 공개 전 공간을 그 호스트에게만 보여 줍니다
    if(PREVIEW){ var art=$('#vn'), bar=document.createElement('div'); bar.className='hc-banner warn vn-preview'; bar.setAttribute('role','status');
      bar.innerHTML='<h2>내 공간 미리보기</h2><p>아직 공개 전이라 고객에게는 보이지 않습니다. 공개되면 고객이 이 화면을 보고 예약을 요청합니다. 미리보기에서는 예약 요청을 보낼 수 없습니다.</p><div class="hc-acts"><a class="btn btn-primary btn-sm" href="/host/center/#space='+encodeURIComponent(V.id)+'">호스트센터에서 고치기</a></div>';
      art.insertBefore(bar, art.firstChild); document.title='[미리보기] '+document.title; }
  }).catch(fail);

  function draw(){
    document.title=V.name+' | 메가스팟'; $('#vn-loading').hidden=true; $('#vn').hidden=false;
    $('#vn-crumb').textContent=V.name; $('#vn-name').textContent=V.name; $('#vn-summary').textContent=V.summary||'';
    $('#vn-badges').innerHTML=S.tierBadge(V.tier)+'<span class="badge badge-host">입점 호스트</span>'+(V.type_labels||[]).map(function(t){ return '<span class="tag">'+esc(t)+'</span>'; }).join('');
    $('#vn-loc').textContent=[V.address_full||V.address, V.station].filter(Boolean).join(' · ');
    $('#vn-actions').innerHTML=M.fav.button('space', V.id, V.name)+'<button class="btn btn-light btn-sm" type="button" id="vn-share">공유</button><a class="btn btn-light btn-sm" href="/docs/?type=space&id='+encodeURIComponent(V.id)+'" target="_blank" rel="noopener">공간소개서 PDF</a>';
    $('#vn-share').addEventListener('click', function(){ var u=location.origin+'/spaces/view/?id='+encodeURIComponent(V.id); if(navigator.share) navigator.share({ title:V.name, url:u }).catch(function(){}); else M.copy(u).then(function(ok){ M.toast(ok?'주소를 복사했습니다.':'복사하지 못했습니다.'); }); });
    gallery(); body(); contact(); initSel(); book();
    var cta=$('#vn-cta'); $('#vn-cta-price').textContent=S.priceLine(V); cta.hidden=false;
    if('IntersectionObserver' in window) new IntersectionObserver(function(en){ cta.classList.toggle('off', en[0].isIntersecting); }, { threshold:0.15 }).observe(box);
  }

  /* ---------- 사진 ---------- */
  function gallery(){
    var ph=V.photos||[], g=$('#vn-gallery'); if(!ph.length){ g.hidden=true; return; }
    g.classList.toggle('few', ph.length<5);
    g.innerHTML=ph.slice(0,5).map(function(p, i){ return '<button type="button" class="'+(i===0?'big':'')+'" data-i="'+i+'" aria-label="사진 '+(i+1)+' 크게 보기"><img src="'+esc(i===0?p.src:p.thumb)+'" alt="'+esc(V.name)+' 사진 '+(i+1)+'"'+(i?' loading="lazy"':'')+'>'+(i===4&&ph.length>5?'<span class="more">+'+(ph.length-5)+'장 더 보기</span>':'')+'</button>'; }).join('');
    var lb=$('#vn-lb'), cur=0;
    function show(i){ cur=(i+ph.length)%ph.length; $('#vn-lb-img').src=ph[cur].src; $('#vn-lb-img').alt=V.name+' 사진 '+(cur+1); $('#vn-lb-n').textContent=(cur+1)+' / '+ph.length; }
    g.addEventListener('click', function(e){ var b=e.target.closest('[data-i]'); if(!b) return; show(+b.getAttribute('data-i')); lb.hidden=false; document.body.style.overflow='hidden'; });
    function close(){ lb.hidden=true; document.body.style.overflow=''; }
    lb.addEventListener('click', function(e){ var b=e.target.closest('[data-lb]'); if(!b){ if(e.target===lb||e.target.classList.contains('vn-lb-stage')) close(); return; } var t=b.getAttribute('data-lb'); if(t==='close') close(); else show(cur+(t==='next'?1:-1)); });
    document.addEventListener('keydown', function(e){ if(lb.hidden) return; if(e.key==='Escape') close(); else if(e.key==='ArrowRight') show(cur+1); else if(e.key==='ArrowLeft') show(cur-1); });
  }

  /* ---------- 본문 ---------- */
  function body(){
    var p=V.price||{}, modes=p.modes||[], lay=V.layouts||{}, pk=V.parking||{}, ru=V.rules||{}, bk=V.booking||{}, sl=V.seller||{};
    var specs=[['면적', V.area?V.area+'평':''],['최대 인원', V.capacity?V.capacity+'명':''],['층고', V.ceiling?V.ceiling+'m':''],['운영 시간', V.hours],['주차', pk.count!=null||pk.note?[pk.count!=null?pk.count+'대':'', pk.note].filter(Boolean).join(' · '):''],['응답', bk.reply]].filter(function(x){ return x[1]; });
    var lays=[['standing','스탠딩'],['theater','강연식'],['classroom','강의식'],['banquet','연회식']].filter(function(x){ return lay[x[0]]; });
    var rows=[];
    if(modes.indexOf('hourly')>=0 && p.hourly) rows.push(['시간 대관', dayRate(p.hourly, ' (시간당)')+((p.hourly.min_hours||1)>1?'<small>최소 '+p.hourly.min_hours+'시간</small>':'')]);
    if(modes.indexOf('package')>=0) (p.packages||[]).forEach(function(k){ rows.push(['패키지 · '+esc(k.name), dayRate(k)+(k.time?'<small>'+esc(k.time)+'</small>':'')]); });
    if(modes.indexOf('daily')>=0 && p.daily) rows.push(['하루 대관', dayRate(p.daily)]);
    if(p.base_people && p.extra_per_person) rows.push(['인원 추가', '기준 '+p.base_people+'명 초과 1명당 '+won(p.extra_per_person)]);
    if(p.deposit) rows.push(['보증금', won(p.deposit)+'<small>이용 후 이상이 없으면 돌려받습니다</small>']);
    var price=rows.length?'<table class="vn-table"><tbody>'+rows.map(function(r){ return '<tr><th>'+r[0]+'</th><td>'+r[1]+'</td></tr>'; }).join('')+'</tbody></table>':'<p>요금은 일정과 조건을 확인한 뒤 호스트가 견적으로 안내합니다.</p>';
    price+='<p class="pf-help mt-1">'+(rows.length?(p.vat==='excluded'?'부가세 별도 금액입니다. ':'부가세 포함 금액입니다. '):'')+(modes.indexOf('quote')>=0&&rows.length?'조건에 따라 견적으로 안내하는 경우가 있습니다. ':'')+'금액은 호스트가 일정과 조건을 확인한 뒤 확정합니다.</p>'+(p.note?'<p class="small mt-1">'+nl(p.note)+'</p>':'');
    var opts=(V.options||[]).length?'<ul class="vn-opts">'+V.options.map(function(o){ return '<li><span>'+esc(o.name)+'</span><b>'+esc(won(o.price))+' <small>/ '+esc(o.unit)+'</small></b></li>'; }).join('')+'</ul>':'';
    var adds='<div class="vn-adds">'+ADDONS.map(function(a){ return '<div><b>'+esc(a.label)+'</b><span>'+esc(a.desc)+'</span>'+(a.link?'<a class="pf-link" href="'+esc(a.link)+'" target="_blank" rel="noopener">자세히 보기</a>':'')+'</div>'; }).join('')+'</div><p class="pf-help mt-1">메가스팟 본사가 직접 준비하는 서비스입니다. 예약을 요청할 때 함께 고르면 메가스팟 담당자가 따로 연락해 견적과 준비 내용을 안내합니다.</p>';
    var rule=[ru.food?'외부 음식 반입 '+({ok:'가능',limited:'일부 가능 (호스트와 협의)',no:'불가'}[ru.food]||''):'', ru.alcohol?'주류 '+({ok:'가능',no:'불가'}[ru.alcohol]||''):''].filter(Boolean);
    var addr=V.address_full||V.address, enc=encodeURIComponent(addr);
    $('#vn-body').innerHTML=
      (specs.length?'<dl class="vn-specs">'+specs.map(function(x){ return '<div><dt>'+x[0]+'</dt><dd>'+esc(x[1])+'</dd></div>'; }).join('')+'</dl>':'')
      +sec('intro','공간 소개','<p class="vn-text">'+nl(V.intro||'')+'</p>')
      +sec('price','요금', price)
      +sec('options','옵션', opts, '호스트가 제공')
      +sec('addons','메가스팟 부가서비스', adds, '모든 입점 공간에서 신청 가능')
      +sec('fac','시설·장비', (V.facility_labels||[]).length?'<div class="tags">'+V.facility_labels.map(function(f){ return '<span class="tag">'+esc(f)+'</span>'; }).join('')+'</div>':'')
      +sec('layout','배치별 수용 인원', lays.length?'<dl class="vn-specs">'+lays.map(function(x){ return '<div><dt>'+x[1]+'</dt><dd>'+lay[x[0]]+'명</dd></div>'; }).join('')+'</dl>':'')
      +sec('rules','이용 규정', (rule.length||ru.note)?(rule.length?'<p>'+esc(rule.join(' · '))+'</p>':'')+(ru.note?'<p class="vn-text">'+nl(ru.note)+'</p>':''):'')
      +sec('refund','환불 규정','<p class="vn-text">'+nl(S.refundText(V.refund))+'</p>')
      +sec('map','위치','<p>'+esc(addr)+(V.station?' · '+esc(V.station):'')+'</p><div class="row mt-2"><a class="btn btn-light btn-sm" href="https://map.naver.com/p/search/'+enc+'" target="_blank" rel="noopener">네이버 지도</a><a class="btn btn-light btn-sm" href="https://map.kakao.com/?q='+enc+'" target="_blank" rel="noopener">카카오맵</a><button class="btn btn-light btn-sm" type="button" id="vn-copy-addr">주소 복사</button></div>')
      +sec('host','호스트 정보','<dl class="vn-kv">'+(sl.company?'<dt>상호</dt><dd>'+esc(sl.company)+'</dd>':'')+(sl.ceo?'<dt>대표자</dt><dd>'+esc(sl.ceo)+'</dd>':'')+(sl.biz_no?'<dt>사업자등록번호</dt><dd>'+esc(sl.biz_no)+'</dd>':'')+'<dt>결제 방법</dt><dd>'+esc(((V.payment||{}).methods||[]).map(function(m){ return S.PAY[m]||m; }).join(' · ')||'호스트 안내')+((V.payment||{}).tax_invoice?' · 세금계산서 발행 가능':'')+'</dd></dl>'
        +'<p class="pf-help mt-1">이 공간의 이용 계약과 결제는 고객과 호스트 사이에서 이뤄집니다. 메가스팟은 통신판매중개자로 예약 요청을 전달하고 진행 상태를 보여 드리며, 결제 수수료를 받지 않습니다.</p>');
    var ca=$('#vn-copy-addr'); if(ca) ca.addEventListener('click', function(){ M.copy(addr).then(function(ok){ M.toast(ok?'주소를 복사했습니다.':'복사하지 못했습니다.'); }); });
  }
  function contact(){
    var c=V.contact||{}, list=[];
    if(c.phone) list.push(['contact','tel:'+c.phone.replace(/[^0-9+]/g,''),'전화 '+c.phone]);
    if(c.kakao) list.push(['contact',c.kakao,'카카오톡 문의']);
    if(c.instagram) list.push(['sns',c.instagram,'인스타그램']); if(c.naver) list.push(['sns',c.naver,'네이버']); if(c.youtube) list.push(['sns',c.youtube,'유튜브']); if(c.homepage) list.push(['sns',c.homepage,'홈페이지']);
    var el=$('#vn-contact'); if(!list.length){ el.hidden=true; return; }
    el.innerHTML='<b>호스트에게 바로 문의</b><div class="row">'+list.map(function(x){ return '<a class="btn btn-light btn-sm" href="'+esc(x[1])+'" data-track="'+x[0]+'"'+(/^tel:/.test(x[1])?'':' target="_blank" rel="noopener"')+'>'+esc(x[2])+'</a>'; }).join('')+'</div><p class="pf-help">어느 쪽으로 예약하셔도 결제 수수료는 없습니다.</p>';
    el.addEventListener('click', function(e){ var a=e.target.closest('[data-track]'); if(a) track(a.getAttribute('data-track')); });
  }

  /* ---------- 예약 요청 ---------- */
  function modes(){ var p=V.price||{}, m=(p.modes||[]).filter(function(x){ return x==='hourly'?!!p.hourly:x==='package'?(p.packages||[]).length>0:x==='daily'?!!p.daily:true; }); return m.length?m:['quote']; }
  function minDate(){ return addDays(TODAY, (V.booking||{}).lead_days||0); }
  function initSel(){
    var d=q.get('date'), n=q.get('people'), m=modes();
    if(/^\d{4}-\d{2}-\d{2}$/.test(d||'') && d>=minDate() && !CLOSED[d]) SEL.date=d;
    if(/^[1-9]\d{0,4}$/.test(n||'')) SEL.people=String(Math.min(+n, V.capacity||+n));
    SEL.mode=m[0]; var mh=((V.price||{}).hourly||{}).min_hours||1; SEL.start='13:00'; SEL.end=M.pad2(Math.min(23, 13+Math.max(mh, 3)))+':00';
  }
  function dayMsg(){
    if(!SEL.date) return '';
    if(CLOSED[SEL.date]) return '<p class="pf-msg">호스트가 예약을 받지 않는 날짜입니다. 다른 날짜를 골라 주세요.</p>';
    var b=BOOKED[SEL.date]; if(b) return '<p class="pf-msg warn">이 날짜에 확정된 예약이 있습니다'+(b.some(function(x){ return x.start; })?' ('+b.filter(function(x){ return x.start; }).map(function(x){ return S.timeRange(x.start,x.end); }).join(', ')+')':'')+'. 겹치지 않는 시간으로 요청해 주세요.</p>';
    return '';
  }
  function selBody(){ var o=[]; Object.keys(SEL.options).forEach(function(i){ o.push({ i:+i, qty:SEL.options[i]||1 }); }); return { ref:ref, date:SEL.date, start:SEL.mode==='hourly'?SEL.start:'', end:SEL.mode==='hourly'?SEL.end:'', people:SEL.people, select:{ mode:SEL.mode==='quote'?'':SEL.mode, pkg:SEL.pkg, options:o } }; }
  function docQuery(){ var b=selBody(), u=new URLSearchParams({ id:ref }); if(b.date) u.set('date', b.date); if(b.start) u.set('start', b.start); if(b.end) u.set('end', b.end); if(b.people) u.set('people', b.people); if(b.select.mode) u.set('mode', b.select.mode); if(b.select.mode==='package') u.set('pkg', b.select.pkg);
    if(b.select.options.length) u.set('opt', b.select.options.map(function(o){ return o.i+':'+o.qty; }).join(',')); var ad=Object.keys(SEL.addons); if(ad.length) u.set('addons', ad.join(',')); return u.toString(); }
  function estimate(){
    clearTimeout(timer); timer=setTimeout(function(){ var my=++seq;
      M.api('/venues/estimate', { method:'POST', body:selBody() }).then(function(r){ if(my!==seq) return; EST=r.estimate; drawEst(); }).catch(function(){ if(my===seq){ EST=null; drawEst(); } }); }, 200);
  }
  function drawEst(){
    var el=$('#vn-est'); if(!el) return; var e=EST;
    if(!e || !e.ok){ el.innerHTML='<p class="small"><b>예상 금액</b> '+esc((e&&e.note)||'일정을 고르면 금액이 계산됩니다.')+'</p>'; return; }
    el.innerHTML='<table class="hc-lines"><tbody>'+e.lines.map(function(l){ return '<tr><td>'+esc(l.label)+(l.desc?'<small>'+esc(l.desc)+'</small>':'')+'</td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('')+(e.vat?'<tr><td>부가세 10%</td><td>'+esc(won(e.vat))+'</td></tr>':'')
      +'<tr class="sum"><td>예상 금액</td><td>'+esc(won(e.total))+'</td></tr></tbody></table>'+(e.deposit?'<p class="pf-help">보증금 '+esc(won(e.deposit))+' 별도 (이용 후 반환)</p>':'')
      +'<p class="pf-help">'+esc(e.note||'')+' <a class="pf-link" href="/docs/?type=quote&'+esc(docQuery())+'" target="_blank" rel="noopener" id="vn-est-doc">예상 견적서 PDF</a></p>';
  }
  function book(){
    var m=modes(), p=V.price||{}, cap=V.capacity||'';
    if(step===1){
      box.innerHTML='<h2>예약 요청</h2><p class="vn-price">'+esc(S.priceLine(V))+'</p>'
        +'<form class="vn-form" id="vn-f1" novalidate>'
        +'<div class="f"><label for="vf-date">날짜 <span class="pf-req">*</span></label><input class="input" id="vf-date" type="date" required min="'+minDate()+'" value="'+esc(SEL.date)+'"><div id="vn-daymsg">'+dayMsg()+'</div>'+((V.booking||{}).lead_days?'<p class="pf-help">이용 '+V.booking.lead_days+'일 전까지 요청할 수 있습니다.</p>':'')+'</div>'
        +(m.length>1?'<div class="f"><span class="lbl">이용 방식</span><div class="vn-seg" role="radiogroup">'+m.map(function(x){ return '<label><input type="radio" name="mode" value="'+x+'"'+(SEL.mode===x?' checked':'')+'><span>'+esc(S.MODE[x]||x)+'</span></label>'; }).join('')+'</div></div>':'')
        +'<div class="field-row two" data-m="hourly"><div class="f"><label for="vf-start">시작</label><select class="select" id="vf-start">'+times(0, 1410, SEL.start)+'</select></div><div class="f"><label for="vf-end">끝</label><select class="select" id="vf-end">'+times(30, 1410, SEL.end)+'</select></div></div>'
        +'<div class="f" data-m="package"><label for="vf-pkg">패키지</label><select class="select" id="vf-pkg">'+(p.packages||[]).map(function(k, i){ return '<option value="'+i+'"'+(SEL.pkg===i?' selected':'')+'>'+esc(k.name+(k.time?' · '+k.time:''))+'</option>'; }).join('')+'</select></div>'
        +'<p class="pf-help" data-m="quote">일정과 조건을 남기면 호스트가 견적을 보내 드립니다.</p>'
        +'<div class="f"><label for="vf-people">인원</label><div class="unit"><input class="input" id="vf-people" type="number" inputmode="numeric" min="1"'+(cap?' max="'+cap+'"':'')+' placeholder="'+(cap?'최대 '+cap+'명':'')+'" value="'+esc(SEL.people)+'"><i>명</i></div></div>'
        +((V.options||[]).length?'<div class="f"><span class="lbl">옵션</span><div class="vn-pick">'+V.options.map(function(o, i){ var on=SEL.options[i]!=null; return '<label class="vn-opt"><input type="checkbox" data-opt="'+i+'"'+(on?' checked':'')+'><span>'+esc(o.name)+'<small>'+esc(won(o.price))+' / '+esc(o.unit)+'</small></span><input class="input" type="number" min="1" max="999" value="'+(SEL.options[i]||1)+'" data-qty="'+i+'" aria-label="'+esc(o.name)+' 수량"'+(on?'':' hidden')+'></label>'; }).join('')+'</div></div>':'')
        +'<div class="f"><span class="lbl">메가스팟 부가서비스 <small>선택</small></span><div class="vn-chips">'+ADDONS.map(function(a){ return '<label><input type="checkbox" data-addon="'+esc(a.id)+'"'+(SEL.addons[a.id]?' checked':'')+'><span>'+esc(a.label)+'</span></label>'; }).join('')+'</div>'
        +'<textarea class="textarea mt-1" id="vf-addon-note" rows="2" maxlength="600" placeholder="원하는 내용을 간단히 적어 주세요. 예: 점심 뷔페 120명, 현수막 1장"'+(Object.keys(SEL.addons).length?'':' hidden')+'>'+esc(SEL.addon_note)+'</textarea><p class="pf-help">메가스팟 본사가 준비하는 서비스입니다. 고르면 담당자가 따로 연락해 견적을 안내합니다.</p></div>'
        +'<div class="vn-est" id="vn-est"></div>'
        +'<button class="btn btn-primary btn-block" type="submit">다음 · 연락처 입력</button>'
        +'<p class="pf-help">지금 결제하지 않습니다. 호스트가 일정을 확인한 뒤 금액과 결제 방법을 안내합니다.</p></form>';
      var f=$('#vn-f1');
      var sync=function(){ $$('[data-m]', f).forEach(function(el){ el.hidden=el.getAttribute('data-m')!==SEL.mode; }); };
      sync(); drawEst(); estimate();
      f.addEventListener('change', function(e){
        var t=e.target;
        if(t.id==='vf-date'){ SEL.date=t.value; $('#vn-daymsg').innerHTML=dayMsg(); }
        else if(t.name==='mode'){ SEL.mode=t.value; sync(); }
        else if(t.id==='vf-start'){ SEL.start=t.value; } else if(t.id==='vf-end'){ SEL.end=t.value; } else if(t.id==='vf-pkg'){ SEL.pkg=+t.value; }
        else if(t.hasAttribute('data-opt')){ var i=t.getAttribute('data-opt'), qe=f.querySelector('[data-qty="'+i+'"]'); if(t.checked){ SEL.options[i]=+qe.value||1; qe.hidden=false; } else { delete SEL.options[i]; qe.hidden=true; } }
        else if(t.hasAttribute('data-qty')){ var k=t.getAttribute('data-qty'); if(SEL.options[k]!=null) SEL.options[k]=Math.max(1, +t.value||1); }
        else if(t.hasAttribute('data-addon')){ if(t.checked) SEL.addons[t.getAttribute('data-addon')]=1; else delete SEL.addons[t.getAttribute('data-addon')]; $('#vf-addon-note').hidden=!Object.keys(SEL.addons).length; }
        estimate();
      });
      f.addEventListener('input', function(e){ if(e.target.id==='vf-people'){ SEL.people=e.target.value; estimate(); } else if(e.target.id==='vf-addon-note') SEL.addon_note=e.target.value; });
      f.addEventListener('submit', function(e){ e.preventDefault();
        if(!SEL.date){ M.toast('이용할 날짜를 골라 주세요.'); return $('#vf-date').focus(); }
        if(CLOSED[SEL.date]){ M.toast('호스트가 예약을 받지 않는 날짜입니다.'); return $('#vf-date').focus(); }
        if(SEL.people && V.capacity && +SEL.people>V.capacity){ M.toast('이 공간은 최대 '+V.capacity+'명까지 이용할 수 있습니다.'); return $('#vf-people').focus(); }
        step=2; book(); box.focus(); box.scrollIntoView({ block:'start', behavior:'smooth' }); });
      return;
    }
    // 2단계 — 연락처
    var sum=[S.kdate(SEL.date), SEL.mode==='hourly'?S.timeRange(SEL.start, SEL.end):SEL.mode==='package'?((p.packages||[])[SEL.pkg]||{}).name:SEL.mode==='daily'?'하루 대관':'견적 문의', SEL.people?SEL.people+'명':''].filter(Boolean).join(' · ');
    var adds=Object.keys(SEL.addons).map(function(a){ return (S.ADD[a]||{}).label||a; });
    box.innerHTML='<h2>연락처 입력</h2><div class="vn-sum"><b>'+esc(sum)+'</b>'+(EST&&EST.ok?'<span>예상 금액 '+esc(won(EST.total))+'</span>':'<span>금액은 호스트가 견적으로 안내</span>')+(adds.length?'<span>메가스팟 부가서비스: '+esc(adds.join(', '))+'</span>':'')+'<button type="button" class="pf-link" id="vn-back">일정·옵션 고치기</button></div>'
      +'<form class="vn-form" id="vn-f2" novalidate><input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">'
      +'<div class="f"><label for="vf-name">이름 <span class="pf-req">*</span></label><input class="input" id="vf-name" name="name" required maxlength="40" autocomplete="name"></div>'
      +'<div class="f"><label for="vf-phone">휴대폰 <span class="pf-req">*</span></label><input class="input" id="vf-phone" name="phone" type="tel" required inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></div>'
      +'<div class="field-row two"><div class="f"><label for="vf-org">소속·단체 (선택)</label><input class="input" id="vf-org" name="org" maxlength="60"></div><div class="f"><label for="vf-email">이메일 (선택)</label><input class="input" id="vf-email" name="email" type="email" autocomplete="email"></div></div>'
      +'<div class="f"><label for="vf-purpose">어떤 모임인가요</label><select class="select" id="vf-purpose" name="purpose">'+S.opts(P.purposes, '', '선택')+'</select></div>'
      +'<div class="f"><label for="vf-message">호스트에게 남길 말 (선택)</label><textarea class="textarea" id="vf-message" name="message" rows="3" maxlength="2000" placeholder="행사 내용, 필요한 장비, 궁금한 점을 적어 주세요."></textarea></div>'
      +((V.booking||{}).visit!==false?'<label class="chk"><input type="checkbox" name="visit"><span>예약 전에 현장을 먼저 보고 싶습니다</span></label>':'')
      +'<label class="chk"><input type="checkbox" name="agree_privacy" required><span>[필수] 개인정보 수집·이용에 동의합니다 <a class="pf-link" href="/privacy/" target="_blank" rel="noopener">내용 보기</a></span></label>'
      +'<label class="chk"><input type="checkbox" name="agree_share" required><span>[필수] 예약 진행을 위해 이름·연락처·요청 내용을 호스트'+(V.seller&&V.seller.company?'('+esc(V.seller.company)+')':'')+'에게 전달하는 데 동의합니다</span></label>'
      +'<p class="pf-msg" id="vn-err" hidden></p><button class="btn btn-primary btn-block" type="submit" id="vn-send">예약 요청 보내기</button>'
      +'<p class="pf-help">요청을 보내면 호스트가 일정과 금액을 확인해 답을 드립니다. 확정 전에는 비용이 발생하지 않습니다.</p></form>';
    $('#vn-back').addEventListener('click', function(){ step=1; book(); });
    var f2=$('#vn-f2'), ph=f2.elements.phone;
    ph.addEventListener('input', function(){ var x=this.value.replace(/[^0-9]/g,'').slice(0,11); if(x.length>7) x=x.replace(/(\d{3})(\d{3,4})(\d{1,4})/,'$1-$2-$3'); else if(x.length>3) x=x.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=x; });
    f2.addEventListener('submit', function(e){ e.preventDefault();
      if(PREVIEW){ var pe=$('#vn-err'); pe.textContent='미리보기에서는 예약 요청을 보낼 수 없습니다. 공간이 공개되면 고객이 여기서 요청을 보냅니다.'; pe.hidden=false; return; }
      if(!M.validate(f2)) return;
      var b=selBody(), el=f2.elements, btn=$('#vn-send'), err=$('#vn-err'); err.hidden=true; btn.disabled=true; btn.textContent='보내는 중…';
      b.name=el.name.value.trim(); b.phone=el.phone.value.trim(); b.org=el.org.value.trim(); b.email=el.email.value.trim(); b.purpose=el.purpose.value; b.message=el.message.value.trim(); b.visit=!!(el.visit&&el.visit.checked);
      b.addons=Object.keys(SEL.addons); b.addon_note=SEL.addon_note; b.agree_privacy=el.agree_privacy.checked; b.agree_share=el.agree_share.checked; b.website=el.website.value;
      M.api('/venues/request', { method:'POST', body:b }).then(function(r){ done(r, b); }).catch(function(x){ err.textContent=x&&x.code==='NO_API'?'서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.':(x&&x.message)||'요청을 보내지 못했습니다.'; err.hidden=false; btn.disabled=false; btn.textContent='예약 요청 보내기'; });
    });
  }
  function done(r, b){
    var url='/spaces/booking/?code='+encodeURIComponent(r.code)+'&k='+encodeURIComponent(r.k), doc='/docs/?code='+encodeURIComponent(r.code)+'&k='+encodeURIComponent(r.k);
    try{ var l=JSON.parse(localStorage.getItem('ms_venue_bookings')||'[]'); l.unshift({ code:r.code, k:r.k, name:V.name, date:b.date, at:Date.now() }); localStorage.setItem('ms_venue_bookings', JSON.stringify(l.slice(0,10))); }catch(e){}
    var adds=(r.addons||[]).map(function(a){ return (S.ADD[a]||{}).label||a; });
    box.innerHTML='<div class="vn-done"><div class="pf-pill ok">요청 완료</div><h2>예약 요청을 보냈습니다</h2><p>예약번호 <b>'+esc(r.code)+'</b></p>'
      +'<p class="small">호스트가 일정과 금액을 확인해 답을 드립니다. 진행 상태와 견적, 결제 안내는 아래 화면에서 확인할 수 있습니다.</p>'
      +(adds.length?'<p class="pf-msg ok">메가스팟 부가서비스('+esc(adds.join(', '))+')는 메가스팟 담당자가 따로 연락드립니다.</p>':'')
      +'<a class="btn btn-primary btn-block" href="'+esc(url)+'">예약 진행 상태 보기</a><button class="btn btn-light btn-block" type="button" id="vn-copy">조회 링크 복사</button>'
      +'<div class="row" style="justify-content:center"><a class="pf-link" href="'+esc(doc+'&type=quote')+'" target="_blank" rel="noopener">견적서 PDF</a><a class="pf-link" href="'+esc(doc+'&type=plan')+'" target="_blank" rel="noopener">행사기획서 PDF</a></div>'
      +'<p class="pf-help">링크를 잃어버려도 예약번호와 휴대폰 뒷 4자리로 다시 조회할 수 있습니다.</p></div>';
    $('#vn-copy').addEventListener('click', function(){ M.copy(location.origin+url).then(function(ok){ M.toast(ok?'조회 링크를 복사했습니다.':'복사하지 못했습니다.'); }); });
    $('#vn-cta').hidden=true; box.scrollIntoView({ block:'start', behavior:'smooth' });
  }
  document.addEventListener('ms:fav', function(e){ var d=e.detail||{}; if(d.on && d.id===ref) track('fav'); });
})();
