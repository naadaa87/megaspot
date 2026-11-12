/* 관리자 · 입점 플랫폼 — 입점 심사·공간 / 호스트 예약·문의 / 본사 부가서비스 / 행사 준비 요청 / 입점 이용료 / 호스트 알림 기록
   직영 지점(건대 1호·2호)을 다루는 기존 관리자 화면과 API(/api/admin/*)는 건드리지 않습니다.
   이 파일이 화면(section)을 직접 만들고 /api/hq/* 만 씁니다. 메뉴 묶음은 admin-navigation.js 의 groups 에 한 줄로 들어 있습니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var esc=X.esc, main=document.querySelector('.adm-main'); if(!main) return;
  function $(s, r){ return (r||document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function H(path, opts){ return M.api('/hq'+path, opts||{}); }
  function won(n){ return n==null||n===''?'':Number(n).toLocaleString('ko-KR')+'원'; }
  function d10(s){ return String(s||'').slice(0,10); }
  function kst(s){ var d=new Date(String(s||'').replace(' ','T')+'Z'); return isNaN(d)?String(s||''):new Date(d.getTime()+9*3600e3).toISOString().slice(0,16).replace('T',' '); }   // 서버 기록(UTC) → 한국 시간
  function kd(iso){ return iso?M.fmtKDate(String(iso).slice(0,10)):''; }
  function when(o){ return [o.date?kd(o.date):'날짜 미정', o.start&&o.end?o.start+'~'+o.end:(o.start||''), o.people?o.people+'명':''].filter(Boolean).join(' · '); }
  function oops(e){ if(X.guard(e)) return; M.toast((e&&e.message)||'처리하지 못했습니다.'); }
  function opts(pairs, sel){ return pairs.map(function(p){ return '<option value="'+esc(p[0])+'"'+(String(p[0])===String(sel)?' selected':'')+'>'+esc(p[1])+'</option>'; }).join(''); }
  function nl(t){ return esc(t||'').replace(/\n/g,'<br>'); }
  var ST={ draft:'st-done', review:'st-new', fix:'st-pay', live:'st-ok', paused:'st-done', hidden:'st-cancel', rejected:'st-cancel',
    'new':'st-new', quoted:'st-check', pending:'st-quote', confirmed:'st-ok', done:'st-done', cancelled:'st-cancel', declined:'st-cancel',
    talking:'st-quote', planning:'st-quote', proposed:'st-check', won:'st-ok', closed:'st-done', requested:'st-new', paid:'st-ok', refunded:'st-done', blocked:'st-cancel', active:'st-ok', accepted:'st-ok', failed:'st-cancel', unknown:'st-pay', held:'st-done', skipped:'st-done', queued:'st-quote', sending:'st-quote' };
  function st(s, label){ return '<span class="st '+(ST[s]||'')+'">'+esc(label||s)+'</span>'; }
  function tier(t){ return t?'<span class="hp-tier'+(t==='mega'?' mega':'')+'">'+(t==='mega'?'초대형':'대형')+'</span>':''; }
  function kv(rows){ return '<div class="kv hp-kv">'+rows.filter(function(r){ return r && r[1]; }).map(function(r){ return '<span>'+esc(r[0])+'</span><div>'+r[1]+'</div>'; }).join('')+'</div>'; }
  function tel(p){ return p?'<a href="tel:'+esc(String(p).replace(/[^0-9+]/g,''))+'">'+esc(p)+'</a>':''; }
  function lines(list, total){ return '<table class="hp-lines"><tbody>'+list.map(function(l){ return '<tr><td>'+esc(l.label)+(l.desc?'<small>'+esc(l.desc)+'</small>':'')+'</td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('')+'<tr class="sum"><td>합계</td><td>'+esc(won(total))+'</td></tr></tbody></table>'; }

  /* ---------- 화면 틀 ---------- */
  function view(id, title, desc, body){
    var s=document.createElement('section'); s.className='adm-view'; s.id='view-'+id; s.hidden=true;
    s.innerHTML='<header class="adm-head"><div><h1>'+title+'</h1><p class="small muted">'+desc+'</p></div><button class="btn btn-light btn-sm" type="button" data-hp-reload="'+id+'">새로고침</button></header>'+body;
    main.appendChild(s); return s;
  }
  view('hp-spaces', '입점 심사·공간', '호스트가 심사를 요청한 공간을 확인해 공개하거나 보완을 요청합니다. 처음 공개할 때 무료 등록 기간(2개월)이 자동으로 들어갑니다.',
    '<div class="pf-filter" id="hp-sp-filter" role="group" aria-label="상태"></div><div id="hp-sp-list" class="adm-list"></div>');
  view('hp-bookings', '호스트 예약·문의', '입점 공간으로 들어온 예약 요청과 호스트가 직접 등록한 예약입니다. 진행과 결제는 호스트가 맡고, 여기서는 내용을 확인합니다.',
    '<div class="pf-filter" id="hp-bk-filter" role="group" aria-label="상태"></div><div class="row" style="gap:6px;margin-bottom:12px"><input class="input" id="hp-bk-q" placeholder="고객·공간·호스트·예약번호로 찾기" style="max-width:320px"></div><div id="hp-bk-list" class="adm-list"></div>');
  view('hp-addons', '본사 부가서비스', '고객이 입점 공간을 예약하면서 함께 신청한 출장뷔페·케이터링·출장 칵테일·사회자/강연자 섭외·현장 매니저·디자인 제작물입니다. 본사가 고객에게 직접 연락해 견적과 준비를 안내합니다.',
    '<div class="pf-filter" id="hp-ad-filter" role="group" aria-label="상태"></div><div id="hp-ad-list" class="adm-list"></div>');
  view('hp-planning', '행사 준비 요청', '‘행사 준비 맡기기’로 들어온 요청입니다. 조건에 맞는 공간과 구성을 정리해 제안을 적으면 고객 조회 화면과 행사기획서에 표시됩니다.',
    '<div class="pf-filter" id="hp-pl-filter" role="group" aria-label="상태"></div><div id="hp-pl-list" class="adm-list"></div>');
  view('hp-billing', '입점 이용료', '공간 한 곳 기준 월 정액(부가세 별도)입니다. 온라인 결제는 결제가 확인되면 등록 기간이 자동으로 적용되고, 계좌이체 신청과 중도 해지 환불은 여기서 처리합니다.',
    '<div class="pf-filter" id="hp-bl-filter" role="group" aria-label="상태"></div><div id="hp-bl-list" class="adm-list"></div>');
  view('hp-notices', '호스트 알림', '새 문의·견적 수락·입금 알림·취소·심사 결과·이용료·무료 기간 종료 안내를 호스트에게 보낸 기록입니다. 받는 번호는 뒤 4자리만 보여 줍니다.',
    '<p class="hp-note" id="hp-nt-state" hidden></p>'
    +'<div class="adm-card hp-card"><div class="row between" style="gap:8px;margin-bottom:8px"><h2>무료 기간 종료 안내</h2><button class="btn btn-light btn-sm" type="button" id="hp-rn-run">지금 확인해 보내기</button></div>'
    +'<p class="small muted">공개된 공간의 무료 등록 기간이 끝나기 30일 전과 7일 전에 등록 연장 안내를 한 번씩 보냅니다. 10시~20시 사이에 15분마다 자동으로 확인하고, 이미 등록 기간을 결제한 공간은 빼고 보냅니다.</p><div id="hp-rn-list" class="hp-rn"></div></div>'
    +'<details class="adm-card hp-card" id="hp-tp"><summary><b>알림톡 템플릿 코드</b> <span class="small muted" id="hp-tp-sum"></span></summary>'
    +'<p class="small muted" style="margin:8px 0">알리고에 아래 본문 그대로 템플릿을 등록하고 승인받은 뒤, 발급된 코드를 넣고 <b>승인 확인</b>을 누르세요. 승인이 확인된 종류만 알림톡으로 보내고(받지 못하면 문자로 대신), 나머지는 문자로 보냅니다. 버튼은 모두 ‘호스트센터 열기’ 하나(웹링크 https://megaspot.kr/host/center/)입니다. 알리고 연결 서버의 ALIGO_HOST_TEMPLATE_CODES 에도 같은 코드를 넣어야 합니다.</p>'
    +'<form id="hp-tp-form"><div id="hp-tp-list" class="hp-tp"></div><div class="row" style="gap:6px;margin-top:10px"><button class="btn btn-primary btn-sm" type="submit">코드 저장</button><button class="btn btn-light btn-sm" type="button" id="hp-tp-check">승인 확인</button></div></form></details>'
    +'<div class="pf-filter" id="hp-nt-filter" role="group" aria-label="상태"></div><div id="hp-nt-list" class="adm-list"></div>');
  var dr=document.createElement('div'); dr.className='adm-drawer'; dr.id='hp-drawer'; dr.hidden=true;
  dr.innerHTML='<div class="adm-drawer-bg" data-close></div><div class="adm-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="hp-d-title"><div class="adm-drawer-head"><h2 id="hp-d-title"></h2><button class="btn btn-light btn-sm" type="button" data-close>닫기 ✕</button></div><div class="adm-drawer-body" id="hp-d-body"></div></div>';
  document.body.appendChild(dr);
  dr.addEventListener('click', function(e){ if(e.target.closest('[data-close]')) X.closeDrawer(dr, true); });
  function drawer(title, html){ $('#hp-d-title').textContent=title; var b=$('#hp-d-body'); b.innerHTML=html; if(dr.hidden) X.openDrawer('#hp-drawer'); b.scrollTop=0; b.onclick=null; b.onsubmit=null; return b; }
  function chips(box, list, cur, counts){ box.innerHTML=list.map(function(x){ var n=x[2]!=null?x[2]:(counts&&counts[x[0]]); return '<button type="button" class="chip'+(cur===x[0]?' on':'')+'" data-f="'+esc(x[0])+'">'+esc(x[1])+(n?' <span class="n">'+n+'</span>':'')+'</button>'; }).join(''); }
  function bindChips(box, set){ box.addEventListener('click', function(e){ var c=e.target.closest('[data-f]'); if(c) set(c.getAttribute('data-f')); }); }
  // 줄을 누르면 상세를 엽니다. 기존 관리자 화면은 data-ref 가 붙은 줄을 누르면 ‘문의 상세’를 여므로, 이 화면의 줄에는 data-hp 를 씁니다.
  function rowKey(box, fn){ box.addEventListener('click', function(e){ if(e.target.closest('a,button')) return; var r=e.target.closest('[data-hp]'); if(r) fn(r.getAttribute('data-hp')); });
    box.addEventListener('keydown', function(e){ if(e.key!=='Enter') return; var r=e.target.closest('[data-hp]'); if(r && e.target===r) fn(r.getAttribute('data-hp')); }); }
  main.addEventListener('click', function(e){ var b=e.target.closest('[data-hp-reload]'); if(b) X.loadView(b.getAttribute('data-hp-reload')); });

  /* ---------- 요약 (메뉴 숫자 · 오늘 할 일 카드) ---------- */
  var card=null;
  function summary(){
    H('/summary').then(function(s){
      X.setCount('hp-spaces', s.review); X.setCount('hp-bookings', s.bookings_new); X.setCount('hp-addons', s.addons_new); X.setCount('hp-planning', s.planning_new); X.setCount('hp-billing', s.billing_requested);
      var kp=$('#dash-kpis'); if(!kp) return;
      if(!card){ card=document.createElement('div'); card.className='adm-card hp-dash'; (kp.parentNode.querySelector('.adm-refund-shortcut')||kp).after(card); }
      card.innerHTML='<div class="row between" style="margin-bottom:10px"><h2>입점 플랫폼</h2><span class="small muted">공개 중 '+s.live+'곳 · 호스트 '+s.hosts+'명'+(s.expiring?' · 14일 안에 기간이 끝나는 공간 '+s.expiring+'곳':'')+'</span></div><div class="adm-kpis" style="margin-bottom:0">'
        +[['hp-spaces','입점 심사 대기',s.review],['hp-addons','본사 부가서비스 접수',s.addons_new],['hp-planning','행사 준비 요청',s.planning_new],['hp-billing','이용료 입금·환불 처리',s.billing_requested]].map(function(k){
          return '<button type="button" class="kpi'+(k[2]?' hot':'')+'" data-go="'+k[0]+'"><small>'+k[1]+'</small><b>'+(k[2]||0)+'</b></button>'; }).join('')+'</div>';
    }).catch(function(){});
  }

  /* ---------- 입점 심사·공간 ---------- */
  var SP={ f:'review', items:[], counts:{} };
  function loadSpaces(){
    var box=$('#hp-sp-list'); summary();
    if(SP.f==='hosts') return loadHosts(box);
    H('/spaces'+(SP.f==='all'?'':'?status='+encodeURIComponent(SP.f))).then(function(r){
      SP.items=r.items||[]; SP.counts=r.counts||{}; var c=SP.counts;
      chips($('#hp-sp-filter'), [['review','심사 대기'],['fix','보완 요청'],['live','공개 중'],['expired','기간 만료',0],['draft','작성 중'],['paused','일시 중지'],['hidden','숨김'],['rejected','반려'],['all','전체',0],['hosts','호스트 계정',0]], SP.f, c);
      box.innerHTML=SP.items.length?SP.items.map(function(s){
        return '<div class="adm-row hp-row" data-hp="'+esc(s.ref)+'" tabindex="0"><div class="r1">'+tier(s.tier)+'<b>'+esc(s.name)+'</b>'+st(s.status, s.status_label)+(s.status==='live'&&!s.visible?'<span class="st st-cancel">기간 만료</span>':'')+'<span class="small muted">'+esc(s.address&&s.address.indexOf(s.region_label)===0?s.address:[s.region_label, s.address].filter(Boolean).join(' · '))+'</span></div>'
          +'<div class="r2">'+esc([s.area?s.area+'평':'', s.capacity?'최대 '+s.capacity+'명':'', s.price_from?won(s.price_from)+'부터':'견적 문의', '사진 '+(s.photos||0)+'장', (s.types||[]).join('·')].filter(Boolean).join(' · '))+'</div>'
          +'<div class="r3"><span>'+esc(s.host.name)+' · '+esc(s.host.phone)+(s.host.company?' · '+esc(s.host.company):'')+'</span><span>'+esc(s.ref)+(s.listed_until?' · '+esc(s.listed_until)+'까지':'')+(s.submitted_at?' · 심사 요청 '+esc(d10(s.submitted_at)):'')+'</span></div></div>'; }).join('')
        :X.emptyMsg(SP.f==='review'?'심사를 기다리는 공간이 없습니다.':'해당하는 공간이 없습니다.');
    }).catch(X.fail(box));
  }
  bindChips($('#hp-sp-filter'), function(f){ SP.f=f; loadSpaces(); });
  rowKey($('#hp-sp-list'), function(ref){ if(/^H-/.test(ref)) openHost(ref); else openSpace(ref); });
  function openSpace(ref){
    H('/spaces/'+encodeURIComponent(ref)).then(function(r){
      var s=r.item, d=s.data||{}, p=d.price||{}, c=d.contact||{}, pay=d.payment||{}, bz=d.biz||{}, pk=d.parking||{}, lay=d.layouts||{}, ru=d.rules||{}, t=r.stats30||{}, F=(r.labels||{}).facilities||{}, PM=(r.labels||{}).payMethods||{};
      var price=[]; (p.modes||[]).forEach(function(m){
        if(m==='hourly'&&p.hourly) price.push('시간 대관: 평일 '+(won(p.hourly.weekday)||'–')+' / 주말 '+(won(p.hourly.weekend)||'–')+' · 최소 '+(p.hourly.min_hours||1)+'시간');
        else if(m==='package') (p.packages||[]).forEach(function(k){ price.push('패키지 '+k.name+(k.time?' ('+k.time+')':'')+': 평일 '+(won(k.weekday)||'–')+' / 주말 '+(won(k.weekend)||'–')); });
        else if(m==='daily'&&p.daily) price.push('하루 대관: 평일 '+(won(p.daily.weekday)||'–')+' / 주말 '+(won(p.daily.weekend)||'–'));
        else if(m==='quote') price.push('견적 문의'); });
      if(p.base_people&&p.extra_per_person) price.push('기준 '+p.base_people+'명 초과 1명당 '+won(p.extra_per_person)); if(p.deposit) price.push('보증금 '+won(p.deposit)); price.push(p.vat==='excluded'?'부가세 별도':'부가세 포함');
      var canApprove=['review','fix','hidden','rejected','draft'].indexOf(s.status)>=0;
      var b=drawer(s.name+' · '+s.ref, '<div class="hp-sec"><div class="row" style="gap:6px;margin-bottom:8px">'+tier(s.tier)+st(s.status, s.status_label)+(s.visible?'<a class="btn btn-light btn-sm" href="/spaces/view/?id='+encodeURIComponent(s.ref)+'" target="_blank" rel="noopener">공개 페이지 ↗</a>':'')+'</div>'
        +(s.review_note?'<p class="form-note">호스트에게 알린 내용: '+nl(s.review_note)+'</p>':'')
        +(r.photos.length?'<div class="hp-photos">'+r.photos.map(function(x){ return '<a href="'+esc(x.src)+'" target="_blank" rel="noopener"><img src="'+esc(x.thumb)+'" alt="공간 사진" loading="lazy"></a>'; }).join('')+'</div>':'<p class="small muted">올린 사진이 없습니다.</p>')+'</div>'
        +'<div class="hp-sec"><h3>기본 정보</h3>'+kv([['지역·주소', esc([s.region_label, [s.address, d.address_detail].filter(Boolean).join(' ')].filter(Boolean).join(' · '))],['역·시간', esc([d.station, d.hours].filter(Boolean).join(' · '))],['규모', esc([s.area?s.area+'평':'', s.capacity?'최대 '+s.capacity+'명':'', d.ceiling?'층고 '+d.ceiling+'m':''].filter(Boolean).join(' · '))],
          ['유형', esc((s.types||[]).join(' · '))],['한 줄 소개', esc(d.summary||'')],['소개', nl(d.intro)],['배치별 인원', esc([['standing','스탠딩'],['theater','강연식'],['classroom','강의식'],['banquet','연회식']].filter(function(x){ return lay[x[0]]; }).map(function(x){ return x[1]+' '+lay[x[0]]; }).join(' · '))],
          ['시설', esc((d.facilities||[]).map(function(f){ return F[f]||f; }).join(' · '))],['주차', esc([pk.count!=null?pk.count+'대':'', pk.note].filter(Boolean).join(' · '))],['규정', nl([ru.food?'음식 반입: '+({ ok:'가능', limited:'일부 가능', no:'불가' }[ru.food]||ru.food):'', ru.alcohol?'주류: '+({ ok:'가능', no:'불가' }[ru.alcohol]||ru.alcohol):'', ru.note].filter(Boolean).join('\n'))]])+'</div>'
        +'<div class="hp-sec"><h3>요금·옵션·결제</h3>'+kv([['요금', nl(price.join('\n'))],['요금 안내', nl(p.note)],['옵션', nl((d.options||[]).map(function(o){ return o.name+' '+won(o.price)+'/'+o.unit; }).join('\n'))],['환불 규정', esc(({ standard:'표준', flexible:'유연', custom:'직접 입력' }[(d.refund||{}).preset]||'')+((d.refund||{}).text?' · '+d.refund.text:''))],
          ['결제 방법', esc((pay.methods||[]).map(function(m){ return PM[m]||m; }).join(' · ')+(pay.deposit_pct!=null?' · 예약금 '+pay.deposit_pct+'%':'')+(pay.tax_invoice?' · 세금계산서':''))],['계좌', esc([pay.bank, pay.account, pay.holder].filter(Boolean).join(' '))],['결제 링크', pay.card_link?'<a href="'+esc(pay.card_link)+'" target="_blank" rel="noopener">'+esc(pay.card_link)+'</a>':'']])+'</div>'
        +'<div class="hp-sec"><h3>호스트·연락 채널</h3>'+kv([['호스트', esc(s.host.name)+' · '+tel(s.host.phone)+' · '+esc(s.host.email)+' <span class="small muted">'+esc(s.host.code)+'</span>'],['사업자', esc([bz.name||s.host.company, bz.no, bz.ceo].filter(Boolean).join(' · '))],['문의 전화', (c.phone?tel(c.phone):'')+(c.phone?(c.phone_public?' (공개)':' (비공개)'):'')],
          ['채널', [c.kakao, c.instagram, c.naver, c.youtube, c.homepage].filter(Boolean).map(function(u){ return '<a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(u)+'</a>'; }).join('<br>')],['최근 30일', '노출 '+(t.imp||0)+' · 조회 '+(t.view||0)+' · 연락 '+((t.contact||0)+(t.sns||0))+' · 문의 '+(t.inquiry||0)]])+'</div>'
        +'<form class="hp-sec form" id="hp-sp-form"><h3>심사·등록 기간</h3>'
        +'<div class="field-row three"><div class="f"><label>무료 등록 끝나는 날</label><input class="input" type="date" name="free_until" value="'+esc(s.free_until)+'"></div><div class="f"><label>유료 등록 끝나는 날</label><input class="input" type="date" name="paid_until" value="'+esc(s.paid_until)+'"></div><div class="f"><label>목록 순서 (클수록 먼저)</label><input class="input" type="number" min="0" max="999" name="boost" value="'+(s.boost||0)+'"></div></div>'
        +'<div class="f"><label>호스트에게 알릴 내용 (보완 요청·반려·숨김 사유)</label><textarea class="textarea" name="note" rows="2" maxlength="600" placeholder="예: 사진이 어두워 공간이 잘 보이지 않습니다. 밝은 사진으로 3장 이상 올려 주세요."></textarea></div>'
        +'<div class="f"><label>운영 메모 (호스트에게 보이지 않음)</label><textarea class="textarea" name="memo" rows="2" maxlength="2000">'+esc(s.memo)+'</textarea></div>'
        +'<div class="row" style="gap:6px">'+(canApprove?'<button class="btn btn-primary btn-sm" type="button" data-a="approve">승인하고 공개</button>':'')+'<button class="btn btn-light btn-sm" type="button" data-a="fix">보완 요청</button>'+(s.status==='live'||s.status==='paused'?'<button class="btn btn-light btn-sm" type="button" data-a="hide">숨김</button>':'<button class="btn btn-light btn-sm" type="button" data-a="reject">반려</button>')
        +'<button class="btn btn-light btn-sm" type="button" data-a="update">기간·메모만 저장</button></div><p class="tiny muted mt-1">처음 승인하면 오늘부터 2개월 무료 등록 기간이 자동으로 들어갑니다. 등록 기간이 지나면 검색에서 내려갑니다.</p></form>');
      b.onclick=function(e){ var a=e.target.closest('[data-a]'); if(!a) return; var f=$('#hp-sp-form'), act=a.getAttribute('data-a'), body={ action:act, memo:f.elements.memo.value, boost:f.elements.boost.value, free_until:f.elements.free_until.value, paid_until:f.elements.paid_until.value };
        if(act!=='update'&&act!=='approve') body.note=f.elements.note.value; if(act==='approve' && !s.free_until && !s.paid_until){ delete body.free_until; delete body.paid_until; }
        if(act==='fix' && !f.elements.note.value.trim()){ M.toast('호스트에게 알릴 보완 내용을 적어 주세요.'); return f.elements.note.focus(); }
        if(act==='reject' && !confirm('이 공간의 입점을 반려할까요?')) return; if(act==='hide' && !confirm('이 공간을 숨길까요? 검색과 상세 화면에서 내려갑니다.')) return;
        H('/spaces/'+encodeURIComponent(ref), { method:'PATCH', body:body }).then(function(){ M.toast({ approve:'승인하고 공개했습니다.', fix:'보완을 요청했습니다.', reject:'반려했습니다.', hide:'숨겼습니다.', update:'저장했습니다.' }[act]); loadSpaces(); openSpace(ref); }).catch(oops); };
    }).catch(oops);
  }
  var HOSTS=[];
  function loadHosts(box){
    chips($('#hp-sp-filter'), [['review','심사 대기'],['fix','보완 요청'],['live','공개 중'],['expired','기간 만료',0],['draft','작성 중'],['paused','일시 중지'],['hidden','숨김'],['rejected','반려'],['all','전체',0],['hosts','호스트 계정',0]], 'hosts', SP.counts);
    H('/hosts').then(function(r){ HOSTS=r.items||[];
      box.innerHTML=HOSTS.length?HOSTS.map(function(h){ return '<div class="adm-row hp-row" data-hp="'+esc(h.code)+'" tabindex="0"><div class="r1"><b>'+esc(h.name)+'</b>'+st(h.status, h.status==='blocked'?'이용 중지':'이용 중')+'<span class="small muted">'+esc([h.company, h.biz_no].filter(Boolean).join(' · '))+'</span></div>'
        +'<div class="r2">'+esc(h.phone)+' · '+esc(h.email)+'</div><div class="r3"><span>공간 '+h.spaces+'곳 (공개 '+h.live+') · 예약·문의 '+h.bookings+'건</span><span>'+esc(h.code)+' · 가입 '+esc(d10(h.created_at))+(h.last_login_at?' · 최근 로그인 '+esc(d10(h.last_login_at)):'')+'</span></div></div>'; }).join(''):X.emptyMsg('가입한 호스트가 없습니다.');
    }).catch(X.fail(box));
  }
  function openHost(code){
    var h=HOSTS.filter(function(x){ return x.code===code; })[0]; if(!h) return;
    var b=drawer(h.name+' · '+h.code, '<form class="form" id="hp-h-form">'+kv([['담당자', esc(h.name)],['연락처', tel(h.phone)+' · '+esc(h.email)],['상호', esc([h.company, h.biz_no].filter(Boolean).join(' · '))],['공간', '공간 '+h.spaces+'곳 (공개 '+h.live+') · 예약·문의 '+h.bookings+'건'],['가입', esc(d10(h.created_at))]])
      +'<div class="f mt-2"><label>계정 상태</label><select class="select" name="status">'+opts([['active','이용 중'],['blocked','이용 중지 (로그인 차단)']], h.status)+'</select></div><div class="f"><label>운영 메모</label><textarea class="textarea" name="memo" rows="3" maxlength="2000">'+esc(h.memo)+'</textarea></div><div><button class="btn btn-primary btn-sm" type="submit">저장</button></div></form>');
    b.onsubmit=function(e){ e.preventDefault(); var f=e.target; H('/hosts/'+encodeURIComponent(code), { method:'PATCH', body:{ status:f.elements.status.value, memo:f.elements.memo.value } }).then(function(){ M.toast('저장했습니다.'); X.closeDrawer(dr, true); loadSpaces(); }).catch(oops); };
  }

  /* ---------- 호스트 예약·문의 ---------- */
  var BK={ f:'open', q:'' };
  function loadBookings(){
    var box=$('#hp-bk-list'), p=[]; if(BK.f!=='all') p.push('status='+encodeURIComponent(BK.f)); if(BK.q) p.push('q='+encodeURIComponent(BK.q)); summary();
    H('/bookings'+(p.length?'?'+p.join('&'):'')).then(function(r){
      var c=r.counts||{}; chips($('#hp-bk-filter'), [['open','진행 중',(c['new']||0)+(c.quoted||0)+(c.pending||0)+(c.confirmed||0)],['new','새 문의'],['quoted','견적 안내'],['pending','예약 대기'],['confirmed','예약 확정'],['done','이용 완료'],['cancelled','취소'],['declined','진행 불가'],['all','전체',0]], BK.f, c);
      box.innerHTML=(r.items||[]).length?r.items.map(function(b){
        return '<div class="adm-row hp-row" data-hp="'+esc(b.code)+'" tabindex="0"><div class="r1">'+st(b.status, b.status_label)+'<b>'+esc(b.name)+'</b><span class="small muted">'+esc(b.space_name)+' · '+esc(b.region_label)+'</span>'+(b.addons||[]).map(function(a){ return '<span class="hp-flag">'+esc(a)+'</span>'; }).join('')+(b.source==='host'?'<span class="st st-done">호스트 직접 등록</span>':'')+'</div>'
          +'<div class="r2">'+esc(when(b))+' · '+(b.amount!=null?esc(won(b.amount))+(b.paid?' (받은 금액 '+esc(won(b.paid))+')':''):'금액 미정')+'</div>'
          +'<div class="r3"><span>호스트 '+esc(b.host_name)+' · '+esc(b.host_phone)+'</span><span>'+esc(b.code)+' · '+esc(d10(b.created_at))+'</span></div></div>'; }).join(''):X.emptyMsg('해당하는 예약·문의가 없습니다.');
    }).catch(X.fail(box));
  }
  bindChips($('#hp-bk-filter'), function(f){ BK.f=f; loadBookings(); });
  (function(){ var t; $('#hp-bk-q').addEventListener('input', function(){ clearTimeout(t); var v=this.value.trim(); t=setTimeout(function(){ BK.q=v; loadBookings(); }, 250); }); })();
  rowKey($('#hp-bk-list'), openBooking);
  function openBooking(code){
    H('/bookings/'+encodeURIComponent(code)).then(function(r){
      var b=r.item, qt=b.quote, est=b.estimate;
      var body=drawer(b.name+' · '+b.code, '<div class="hp-sec"><div class="row" style="gap:6px;margin-bottom:8px">'+st(b.status, b.status_label)+'<span class="small muted">'+(b.source==='host'?'호스트 직접 등록':'메가스팟 접수')+' · '+esc(d10(b.created_at))+'</span></div>'
        +kv([['공간', esc(b.space_name)+' <span class="small muted">'+esc(b.space_address)+'</span>'],['호스트', esc(b.host.name)+' · '+tel(b.host.phone)+' · '+esc(b.host.email)],['고객', esc(b.name)+(b.org?' · '+esc(b.org):'')+' · '+tel(b.phone)+(b.email?' · '+esc(b.email):'')],['이용 일시', esc(when(b))],['모임', esc(b.purpose_label)],['요청 내용', nl(b.message)],['옵션', esc((b.options||[]).map(function(o){ return o.name+' '+o.qty+o.unit; }).join(', '))],['현장답사', b.visit?'답사를 먼저 원함':'']])+'</div>'
        +'<div class="hp-sec"><h3>금액·결제 <span class="small muted">결제는 고객이 호스트에게 직접 합니다</span></h3>'+(qt?lines(qt.lines, qt.total)+'<p class="tiny muted">호스트 견적 · '+esc(qt.sent_at)+' · '+esc(qt.valid_until)+'까지</p>':est?lines(est.lines.concat(est.vat?[{ label:'부가세 10%', amount:est.vat }]:[]), est.total)+'<p class="tiny muted">요금표 자동 계산</p>':'<p class="small muted">금액 미정</p>')
        +kv([['확정 금액', b.amount!=null?esc(won(b.amount)):''],['받은 금액', b.paid?esc(won(b.paid)):''],['받을 금액', b.due?esc(won(b.due)):''],['결제 기록', nl((b.payments||[]).map(function(p){ return p.date+' '+p.kind+' '+p.method+' '+won(p.amount); }).join('\n'))]])+'</div>'
        +((r.hq_addons||[]).length?'<div class="hp-sec"><h3>본사 부가서비스</h3><div class="row" style="gap:6px">'+r.hq_addons.map(function(a){ return '<button type="button" class="btn btn-light btn-sm" data-addon="'+esc(a.ref)+'">'+esc(a.label)+' · '+esc(a.status_label)+'</button>'; }).join('')+'</div>'+(b.addon_note?'<p class="small mt-1">'+nl(b.addon_note)+'</p>':'')+'</div>':'')
        +'<div class="hp-sec"><h3>고객·호스트 메시지</h3>'+((b.messages||[]).length?'<div class="hp-thread">'+b.messages.map(function(m){ return '<p><b>'+(m.from==='host'?'호스트':m.from==='customer'?'고객':'메가스팟')+'</b> '+nl(m.text)+' <span class="tiny muted">'+esc(m.at)+'</span></p>'; }).join('')+'</div>':'<p class="small muted">메시지가 없습니다.</p>')+'</div>'
        +'<div class="hp-sec"><h3>진행 기록</h3>'+((b.log||[]).length?'<ul class="hp-log">'+b.log.map(function(l){ return '<li>'+esc(l.at)+' · '+esc(l.what)+'</li>'; }).join('')+'</ul>':'')+(r.customer_url?'<div class="row mt-1" style="gap:6px"><a class="btn btn-light btn-sm" href="'+esc(r.customer_url)+'" target="_blank" rel="noopener">고객 조회 화면 ↗</a><a class="btn btn-light btn-sm" href="'+esc(r.customer_url.replace('/spaces/booking/','/docs/'))+'&type=plan" target="_blank" rel="noopener">행사기획서 ↗</a></div>':'')+'</div>');
      body.onclick=function(e){ var a=e.target.closest('[data-addon]'); if(a){ X.closeDrawer(dr, true); AD.f='all'; X.go('hp-addons'); AD.open=a.getAttribute('data-addon'); } };
    }).catch(oops);
  }

  /* ---------- 본사 부가서비스 ---------- */
  var AD={ f:'open', items:[], statuses:{}, open:'' }, TOOL={ buffet:['catering','출장뷔페 계산 열기'], catering:['reception','케이터링 계산 열기'], cocktail:['cocktail','출장 칵테일 계산 열기'] };
  function loadAddons(){
    var box=$('#hp-ad-list'); summary();
    H('/addons'+(AD.f==='all'?'':'?status='+encodeURIComponent(AD.f))).then(function(r){
      AD.items=r.items||[]; AD.statuses=r.statuses||{}; var c=r.counts||{};
      chips($('#hp-ad-filter'), [['open','진행 중',(c['new']||0)+(c.talking||0)+(c.confirmed||0)],['new','접수'],['talking','안내 중'],['confirmed','확정'],['done','완료'],['cancelled','취소'],['all','전체',0]], AD.f, c);
      box.innerHTML=AD.items.length?AD.items.map(function(a){
        return '<div class="adm-row hp-row" data-hp="'+esc(a.ref)+'" tabindex="0"><div class="r1">'+st(a.status, a.status_label)+'<span class="hp-flag">'+esc(a.label)+'</span><b>'+esc(a.name)+'</b><span class="small muted">'+esc(a.phone)+'</span>'+(a.amount!=null?'<span class="small">'+esc(won(a.amount))+'</span>':'')+'</div>'
          +'<div class="r2">'+esc(when(a))+' · '+esc(a.space_name)+(a.note?' · '+esc(a.note):'')+'</div>'
          +'<div class="r3"><span>공간 예약 '+esc(a.booking)+(a.booking_status_label?' ('+esc(a.booking_status_label)+')':'')+' · 호스트 '+esc(a.host_name)+'</span><span>'+esc(a.ref)+' · '+esc(d10(a.created_at))+'</span></div></div>'; }).join(''):X.emptyMsg(AD.f==='open'?'진행 중인 부가서비스 요청이 없습니다.':'해당하는 요청이 없습니다.');
      if(AD.open){ var o=AD.open; AD.open=''; openAddon(o); }
    }).catch(X.fail(box));
  }
  bindChips($('#hp-ad-filter'), function(f){ AD.f=f; loadAddons(); });
  rowKey($('#hp-ad-list'), openAddon);
  function openAddon(ref){
    var a=AD.items.filter(function(x){ return x.ref===ref; })[0]; if(!a) return; var tool=TOOL[a.service];
    var b=drawer(a.label+' · '+a.ref, '<form class="form" id="hp-ad-form">'+kv([['서비스', '<b>'+esc(a.label)+'</b>'],['고객', esc(a.name)+' · '+tel(a.phone)+(a.email?' · '+esc(a.email):'')],['행사 일시', esc(when(a))],['장소', esc(a.space_name)+' <span class="small muted">'+esc(a.address)+'</span>'],['고객 메모', nl(a.note)],
        ['공간 예약', esc(a.booking)+(a.booking_status_label?' · '+esc(a.booking_status_label):'')+' <button type="button" class="btn btn-light btn-sm" data-bk="'+esc(a.booking)+'">예약 보기</button>'],['호스트', esc(a.host_name)+' · '+tel(a.host_phone)]])
      +'<div class="field-row mt-2"><div class="f"><label>진행 상태</label><select class="select" name="status">'+opts(Object.keys(AD.statuses).map(function(k){ return [k, AD.statuses[k]]; }), a.status)+'</select></div><div class="f"><label>견적 금액 (원 · 고객 조회 화면에 표시)</label><input class="input" name="amount" type="number" min="0" step="1000" value="'+(a.amount==null?'':a.amount)+'"></div></div>'
      +'<div class="f"><label>진행 메모</label><textarea class="textarea" name="memo" rows="4" maxlength="2000" placeholder="통화 내용, 견적 조건, 준비 사항">'+esc(a.memo)+'</textarea></div>'
      +'<div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" type="submit">저장</button>'+(tool?'<button class="btn btn-light btn-sm" type="button" data-tool="'+tool[0]+'">'+tool[1]+'</button>':'')+'</div>'
      +'<p class="tiny muted mt-1">본사 서비스 비용은 공간 이용료와 따로 메가스팟이 고객에게 안내·청구합니다. 상태와 금액은 고객 예약 조회 화면과 호스트센터에 표시됩니다.</p></form>');
    b.onsubmit=function(e){ e.preventDefault(); var f=e.target; H('/addons/'+encodeURIComponent(ref), { method:'PATCH', body:{ status:f.elements.status.value, amount:f.elements.amount.value, memo:f.elements.memo.value } }).then(function(){ M.toast('저장했습니다.'); X.closeDrawer(dr, true); loadAddons(); }).catch(oops); };
    b.onclick=function(e){ var k=e.target.closest('[data-bk]'); if(k) return openBooking(k.getAttribute('data-bk')); var t=e.target.closest('[data-tool]'); if(t){ X.closeDrawer(dr, true); X.go(t.getAttribute('data-tool')); } };
  }

  /* ---------- 행사 준비 요청 ---------- */
  var PL={ f:'open', items:[], statuses:{} };
  function loadPlanning(){
    var box=$('#hp-pl-list'); summary();
    H('/planning'+(PL.f==='all'?'':'?status='+encodeURIComponent(PL.f))).then(function(r){
      PL.items=r.items||[]; PL.statuses=r.statuses||{}; var c=r.counts||{};
      chips($('#hp-pl-filter'), [['open','진행 중',(c['new']||0)+(c.planning||0)+(c.proposed||0)+(c.won||0)],['new','접수'],['planning','기획 중'],['proposed','제안 발송'],['won','진행 확정'],['done','완료'],['closed','종료'],['all','전체',0]], PL.f, c);
      box.innerHTML=PL.items.length?PL.items.map(function(p){
        return '<div class="adm-row hp-row" data-hp="'+esc(p.ref)+'" tabindex="0"><div class="r1">'+st(p.status, p.status_label)+'<b>'+esc(p.name)+'</b><span class="small muted">'+esc([p.org, p.phone].filter(Boolean).join(' · '))+'</span></div>'
          +'<div class="r2">'+esc([p.date?kd(p.date):p.date_note||'날짜 협의', p.people?p.people+'명':'', p.budget_pp?'1인 '+won(p.budget_pp):'예산 협의', p.region_label, p.purpose_label].filter(Boolean).join(' · '))+'</div>'
          +'<div class="r3"><span>'+esc(p.needs.join(' · '))+'</span><span>'+esc(p.ref)+' · '+esc(d10(p.created_at))+'</span></div></div>'; }).join(''):X.emptyMsg(PL.f==='open'?'진행 중인 행사 준비 요청이 없습니다.':'해당하는 요청이 없습니다.');
    }).catch(X.fail(box));
  }
  bindChips($('#hp-pl-filter'), function(f){ PL.f=f; loadPlanning(); });
  rowKey($('#hp-pl-list'), openPlanning);
  function openPlanning(ref){
    var p=PL.items.filter(function(x){ return x.ref===ref; })[0]; if(!p) return; var pr=p.proposal_raw||{};
    var b=drawer(p.name+' · '+p.ref, '<form class="form" id="hp-pl-form">'+kv([['신청자', esc(p.name)+(p.org?' · '+esc(p.org):'')],['연락처', tel(p.phone)+(p.email?' · '+esc(p.email):'')+' <span class="small muted">'+({ phone:'전화 선호', kakao:'카카오톡·문자 선호', email:'이메일 선호' }[p.contact_pref]||'')+'</span>'],
        ['행사', esc(p.purpose_label||'미정')],['날짜', esc([p.date?kd(p.date):'', p.date_note, p.hours].filter(Boolean).join(' · ')||'협의')],['인원·예산', esc([p.people?p.people+'명':'', p.budget_pp?'1인 '+won(p.budget_pp):'예산 협의', p.budget_total?'전체 '+won(p.budget_total):''].filter(Boolean).join(' · '))],['지역', esc(p.region_label||'무관')],
        ['맡긴 항목', '<b>'+esc(p.needs.join(' · '))+'</b>'],['기준 공간', esc(p.space)],['요청 내용', nl(p.message)]])
      +'<div class="f mt-2"><label>진행 상태</label><select class="select" name="status">'+opts(Object.keys(PL.statuses).map(function(k){ return [k, PL.statuses[k]]; }), p.status)+'</select></div>'
      +'<h3 class="mt-2">고객에게 보여 줄 제안</h3><div class="f"><label>제안 요약 (공간·구성·포함 내용)</label><textarea class="textarea" name="summary" rows="5" maxlength="3000" placeholder="예: 성수 그랜드홀(180명) 종일 대관 + 출장뷔페 150명 + 사회자 1명 + 현수막 1장">'+esc(pr.summary||'')+'</textarea></div>'
      +'<div class="field-row"><div class="f"><label>제안 금액 (원)</label><input class="input" name="amount" type="number" min="0" step="10000" value="'+(pr.amount==null?'':pr.amount)+'"></div><div class="f"><label>자세한 자료 링크 (https://)</label><input class="input" name="link" type="url" value="'+esc(pr.link||'')+'"></div></div>'
      +'<div class="f"><label>운영 메모 (고객에게 보이지 않음)</label><textarea class="textarea" name="memo" rows="3" maxlength="2000">'+esc(p.memo)+'</textarea></div>'
      +'<div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" type="submit">저장</button>'+(p.customer_url?'<button class="btn btn-light btn-sm" type="button" data-copy="'+esc(p.customer_url)+'">고객 조회 링크 복사</button><a class="btn btn-light btn-sm" href="'+esc(p.customer_url.replace('/planning/status/?ref=','/docs/?type=plan&pl='))+'" target="_blank" rel="noopener">행사기획서 ↗</a>':'')+'</div>'
      +'<p class="tiny muted mt-1">제안을 적고 상태를 ‘제안 발송’으로 바꾼 뒤, 조회 링크를 카카오톡·문자로 보내 주세요. 고객은 그 화면에서 제안과 행사기획서를 확인합니다.</p></form>');
    b.onsubmit=function(e){ e.preventDefault(); var f=e.target; H('/planning/'+encodeURIComponent(ref), { method:'PATCH', body:{ status:f.elements.status.value, memo:f.elements.memo.value, proposal:{ summary:f.elements.summary.value, amount:f.elements.amount.value, link:f.elements.link.value } } }).then(function(){ M.toast('저장했습니다.'); X.closeDrawer(dr, true); loadPlanning(); }).catch(oops); };
    b.onclick=function(e){ var c=e.target.closest('[data-copy]'); if(c) M.copy(c.getAttribute('data-copy')).then(function(ok){ M.toast(ok?'조회 링크를 복사했습니다.':'복사하지 못했습니다.'); }); };
  }

  /* ---------- 입점 이용료: 계좌이체 입금 확인 · 중도 해지 환불 ---------- */
  var BL={ f:'todo', items:[] };
  function feeText(b){ return esc(won(b.supply))+' + 부가세 '+esc(won(b.vat))+' = <b>'+esc(won(b.amount))+'</b>'; }
  function calcTable(c){
    return '<table class="hp-lines"><tbody><tr><td>결제 금액<small>부가세 포함</small></td><td>'+esc(won(c.total))+'</td></tr>'
      +(c.started?'<tr><td>등록 기간</td><td>'+c.days+'일</td></tr><tr><td>이용한 날<small>해지 기준일 '+esc(c.base)+'까지</small></td><td>'+c.used+'일</td></tr><tr><td>남은 날</td><td>'+c.left+'일</td></tr><tr><td>잔여금액<small>결제 금액 × 남은 날 ÷ 등록 기간</small></td><td>'+esc(won(c.remain))+'</td></tr>'
        :'<tr><td>등록 기간<small>해지 기준일 '+esc(c.base)+' · 유료 기간 시작 전</small></td><td>'+c.days+'일</td></tr>')
      +'<tr class="sum"><td>환불 금액<small>'+(c.started?'잔여금액의 '+c.rate+'% · 10원 미만 버림':'시작 전이라 전액')+'</small></td><td>'+esc(won(c.refund))+'</td></tr></tbody></table>';
  }
  function loadBilling(){
    var box=$('#hp-bl-list'); summary();
    H('/billing'+(BL.f==='all'?'':'?status='+encodeURIComponent(BL.f))).then(function(r){
      BL.items=r.items||[];
      chips($('#hp-bl-filter'), [['todo','처리할 일',0],['requested','결제 대기',0],['cancel','해지 신청',0],['paid','결제 완료',0],['refunded','해지·환불',0],['cancelled','취소',0],['all','전체',0]], BL.f);
      box.innerHTML=BL.items.length?BL.items.map(function(b){ var cr=b.cancel&&b.cancel.status==='requested';
        return '<div class="adm-row hp-row" data-hp="'+esc(b.ref)+'" tabindex="0"><div class="r1">'+st(b.status, b.status_label)+'<b>'+esc(b.space_name)+'</b><span class="small">'+b.months+'개월 · '+esc(won(b.amount))+' · '+esc(b.method_label)+'</span>'
          +(cr?'<span class="hp-flag">해지 신청 · 환불 '+esc(won(b.cancel.calc.refund))+'</span>':'')+(b.alert?'<span class="hp-flag">확인 필요</span>':'')+(b.tax_invoice?'<span class="hp-flag">세금계산서</span>':'')+(b.status==='requested'&&b.method==='bank'?'<span class="hp-flag">입금 확인</span>':'')+'</div>'
          +'<div class="r2">적용 기간 '+esc(b.period_from)+' ~ '+esc(b.period_to)+(b.refund_amount!=null?' · 환불 '+esc(won(b.refund_amount)):'')+'</div><div class="r3"><span>'+esc(b.host_name)+' · '+esc(b.host_phone)+(b.host_company?' · '+esc(b.host_company):'')+'</span><span>'+esc(b.ref)+' · 신청 '+esc(d10(b.created_at))+(b.paid_at?' · 결제 '+esc(b.paid_at):'')+'</span></div></div>'; }).join('')
        :X.emptyMsg(BL.f==='todo'?'처리할 일이 없습니다. 계좌이체 입금 확인이나 중도 해지 신청이 들어오면 여기에 나옵니다.':'해당하는 신청이 없습니다.');
    }).catch(X.fail(box));
  }
  bindChips($('#hp-bl-filter'), function(f){ BL.f=f; loadBilling(); });
  rowKey($('#hp-bl-list'), openBilling);
  function openBilling(ref){
    var b=BL.items.filter(function(x){ return x.ref===ref; })[0]; if(!b) return; var d=b.data||{}, open=b.status==='requested', cr=b.cancel&&b.cancel.status==='requested', pv=b.refund_preview;
    var html='<form class="form" id="hp-bl-form">'+kv([['공간', esc(b.space_name)+' <span class="small muted">'+esc(b.space)+'</span>'],['호스트', esc(b.host_name)+' · '+tel(b.host_phone)+' · '+esc(b.host_email)],['사업자', esc([b.host_company, b.host_biz_no].filter(Boolean).join(' · '))],
        ['신청', '<b>'+b.months+'개월 등록</b> · '+feeText(b)],['결제 방법', esc(b.method_label)+(b.pay_no?' · 페이앱 거래번호 끝 '+esc(b.pay_no):'')+(b.pg_pending?' · 입금 대기':'')],
        ['적용 기간', esc(b.period_from)+' ~ '+esc(b.period_to)],['지금 등록 기간', esc([b.free_until?'무료 '+b.free_until+'까지':'', b.paid_until?'유료 '+b.paid_until+'까지':''].filter(Boolean).join(' · ')||'없음')],
        ['세금계산서', d.tax_invoice?'요청'+(d.tax_email?' · '+esc(d.tax_email):''):''],['호스트 메모', nl(d.note)],['상태', st(b.status, b.status_label)+(b.paid_at?' 결제 '+esc(b.paid_at):'')],
        ['환불', b.refund_amount!=null?'<b>'+esc(won(b.refund_amount))+'</b> · '+esc(d10(b.refunded_at))+(b.refund_memo?' · '+esc(b.refund_memo):''):''],['페이앱 취소 통보', b.pg_refunded?esc(won(b.pg_refunded)):'']])
      +(b.alert?'<div class="hp-sec"><p class="hp-note">'+esc(b.alert)+'</p><div class="row" style="gap:6px;margin-top:8px"><button class="btn btn-light btn-sm" type="button" data-a="alert_clear">확인했습니다</button></div></div>':'');
    if(open) html+='<div class="hp-sec"><h3>'+(b.method==='bank'?'계좌이체 입금 확인':'결제 대기')+'</h3>'+(b.method==='online'?'<p class="tiny muted" style="margin-bottom:8px">호스트가 온라인 결제를 마치면 등록 기간이 자동으로 적용됩니다. 계좌로 직접 받았다면 아래에서 입금 확인을 눌러 주세요.</p>':'')
      +'<div class="field-row"><div class="f"><label>적용 시작일</label><input class="input" type="date" name="period_from" value="'+esc(b.period_from)+'"></div><div class="f"><label>적용 종료일</label><input class="input" type="date" name="period_to" value="'+esc(b.period_to)+'"></div></div>'
      +'<div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" type="button" data-a="paid">입금 확인 · 등록 기간 적용</button><button class="btn btn-light btn-sm" type="button" data-a="cancel">신청 취소</button></div><p class="tiny muted mt-1">입금 확인을 누르면 이 공간의 유료 등록 종료일이 위 종료일로 바뀌고, 호스트에게 문자로 알립니다. 받을 금액은 부가세를 포함한 '+esc(won(b.amount))+'입니다.</p></div>';
    if(b.status==='paid' && (cr||pv)){ var c=cr?b.cancel.calc:pv;
      html+='<div class="hp-sec"><h3>'+(cr?'중도 해지 신청 <span class="small muted">'+esc(d10(b.cancel.requested_at))+' 접수</span>':'운영팀 직권 해지·환불 <span class="small muted">호스트 신청 없이 처리할 때</span>')+'</h3>'+calcTable(c)+(cr&&b.cancel.reason?'<p class="small" style="margin:6px 0">사유: '+esc(b.cancel.reason)+'</p>':'')
        +'<div class="field-row"><div class="f"><label>환불 금액 (원)</label><input class="input" type="number" name="refund" min="0" max="'+b.amount+'" step="10" value="'+c.refund+'"></div><div class="f"><label>처리 메모</label><input class="input" name="refund_memo" maxlength="300" placeholder="예: 페이앱 부분 취소 / 계좌 환불"></div></div>'
        +'<div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" type="button" data-a="refund_done">환불 완료 처리</button></div>'
        +'<p class="tiny muted mt-1">'+(b.method==='online'?'페이앱 판매자 화면에서 이 거래를 위 금액만큼 부분 취소하면 통보가 들어와 자동으로 마무리됩니다. 통보가 오지 않을 때만 버튼을 눌러 주세요. ':'호스트에게 환불 계좌를 확인해 송금한 뒤 버튼을 눌러 주세요. ')+'처리하면 유료 등록이 해지 기준일('+esc(c.base)+')까지로 줄고, 호스트에게 문자로 알립니다. 회사 사정으로 해지하는 경우처럼 기준과 다르게 환불할 때는 금액을 고쳐 적으세요.</p></div>'; }
    var body=drawer(b.space_name+' · '+b.ref, html+'</form>');
    body.onclick=function(e){ var a=e.target.closest('[data-a]'); if(!a) return; var act=a.getAttribute('data-a'), f=$('#hp-bl-form'), req={ action:act };
      if(act==='paid'){ req.period_from=f.elements.period_from.value; req.period_to=f.elements.period_to.value; if(!confirm(won(b.amount)+' 입금을 확인하고 등록 기간을 적용할까요?')) return; }
      else if(act==='cancel'){ if(!confirm('이 신청을 취소할까요?')) return; }
      else if(act==='refund_done'){ req.amount=f.elements.refund.value; req.memo=f.elements.refund_memo.value; if(!confirm(won(req.amount)+' 환불을 끝낸 것으로 처리할까요? 이 공간의 유료 등록이 끝납니다.')) return; }
      H('/billing/'+encodeURIComponent(ref), { method:'PATCH', body:req }).then(function(){ M.toast({ paid:'입금을 확인했습니다. 등록 기간이 적용되었습니다.', cancel:'취소했습니다.', refund_done:'환불 완료로 처리했습니다.', alert_clear:'확인 표시를 지웠습니다.' }[act]); X.closeDrawer(dr, true); loadBilling(); }).catch(oops); };
  }

  /* ---------- 호스트 알림 기록 ---------- */
  var NT={ f:'all', items:[] };
  function loadNotices(){
    var box=$('#hp-nt-list');
    H('/notices'+(NT.f==='all'?'':'?status='+encodeURIComponent(NT.f))).then(function(r){
      NT.items=r.items||[]; var note=$('#hp-nt-state'); note.hidden=!!r.live; note.textContent=r.live?'':'지금은 문자·알림톡 발송 설정이 꺼져 있어 기록만 남습니다. 알리고 연결 서버에 호스트 알림 경로(host/send)를 적용하고 발송을 켜면 나갑니다.';
      drawRenewal(r.renewal_due||[]); drawTemplates(r.templates||[]);
      chips($('#hp-nt-filter'), [['all','전체',0],['sent','발송',0],['attention','확인 필요',0]], NT.f);
      box.innerHTML=NT.items.length?NT.items.map(function(n){
        return '<details class="adm-row hp-notice"><summary><span class="r1">'+st(n.status, n.status_label)+'<b>'+esc(n.kind_label)+'</b>'+(n.channel?'<span class="hp-flag">'+esc(n.channel)+'</span>':'')+'<span class="small">'+esc(n.host_name)+' · 번호 끝 '+esc(n.receiver_last4)+'</span></span><span class="r3"><span>'+esc(n.ref)+'</span><span>'+esc(kst(n.created_at))+'</span></span></summary>'
          +'<pre class="hp-msg">'+esc(n.msg)+'</pre>'+(n.error?'<p class="small" style="color:var(--rust)">'+esc(n.error)+'</p>':'')+'</details>'; }).join(''):X.emptyMsg('보낸 알림이 없습니다.');
    }).catch(X.fail(box));
  }
  bindChips($('#hp-nt-filter'), function(f){ NT.f=f; loadNotices(); });
  function drawRenewal(list){
    $('#hp-rn-list').innerHTML=list.length?'<table class="hp-lines"><tbody>'+list.map(function(x){ return '<tr><td>'+esc(x.name)+'<small>'+esc(x.ref)+' · 무료 등록 '+esc(x.free_until)+'까지</small></td><td>D-'+x.left+' · '+(x.stage==='d7'?'7일 전 안내':'30일 전 안내')+'</td></tr>'; }).join('')+'</tbody></table>'
      :'<p class="small muted">앞으로 30일 안에 무료 기간이 끝나는 공간이 없습니다.</p>';
  }
  function drawTemplates(list){
    var ready=list.filter(function(t){ return t.ready; }).length, coded=list.filter(function(t){ return t.code; }).length;
    $('#hp-tp-sum').textContent='· 승인 확인 '+ready+'종 / 코드 '+coded+'종 / 전체 '+list.length+'종';
    $('#hp-tp-list').innerHTML=list.map(function(t){
      return '<div class="hp-tp-row"><div><b>'+esc(t.name)+'</b>'+(t.ready?' <span class="st st-ok">승인 확인</span>':t.code?' <span class="st st-pay">확인 필요</span>':'')+'<pre class="hp-msg">'+esc(t.content)+'</pre></div>'
        +'<label><span class="small muted">템플릿 코드</span><input class="input" name="'+esc(t.key)+'" value="'+esc(t.code)+'" placeholder="예: UN_1234" maxlength="30" autocomplete="off"></label></div>'; }).join('');
  }
  $('#hp-tp-form').addEventListener('submit', function(e){ e.preventDefault(); var codes={};
    $$('#hp-tp-list input').forEach(function(i){ codes[i.name]=i.value.trim(); });
    H('/notices/templates', { method:'PUT', body:{ codes:codes } }).then(function(r){ drawTemplates(r.items); M.toast('코드를 저장했습니다. 승인 확인을 눌러 주세요.'); }).catch(oops); });
  $('#hp-tp-check').addEventListener('click', function(){ var b=this; b.disabled=true;
    H('/notices/templates/check', { method:'POST', body:{} }).then(function(r){ var ok=r.items.filter(function(x){ return x.ready; }).length, bad=r.items.filter(function(x){ return x.code && !x.ready; });
      M.toast('승인 확인 '+ok+'종'+(bad.length?' · 확인 필요 '+bad.length+'종 (본문·버튼이 다르거나 아직 승인 전이거나, 연결 서버에 코드가 없습니다)':'')); loadNotices(); }).catch(oops).finally(function(){ b.disabled=false; }); });
  $('#hp-rn-run').addEventListener('click', function(){ var b=this; if(!confirm('무료 기간 종료 안내 대상을 지금 확인해 보낼까요? 이미 보낸 단계는 다시 보내지 않습니다.')) return; b.disabled=true;
    H('/notices/renewal-run', { method:'POST', body:{} }).then(function(r){ M.toast('안내 '+(r.sent||0)+'건을 보냈습니다.'+(r.retried?' 막혀 있던 알림 '+r.retried+'건도 다시 보냈습니다.':'')); loadNotices(); }).catch(oops).finally(function(){ b.disabled=false; }); });

  X.register('hp-spaces', loadSpaces); X.register('hp-bookings', loadBookings); X.register('hp-addons', loadAddons); X.register('hp-planning', loadPlanning); X.register('hp-billing', loadBilling); X.register('hp-notices', loadNotices);
  X.register('dash', summary);
  // 메뉴(admin-navigation.js)가 만들어진 뒤에 숫자 배지를 붙입니다
  function badges(){ ['hp-spaces','hp-bookings','hp-addons','hp-planning','hp-billing','hp-notices'].forEach(function(id){ var b=$('#adm-nav [data-view="'+id+'"]'); if(b && !b.querySelector('em')){ var em=document.createElement('em'); em.setAttribute('data-count', id); em.hidden=true; b.appendChild(em); } }); if(X.visible()) summary(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', badges); else setTimeout(badges, 0);
})();
