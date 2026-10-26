/* 메가스팟 건대 2호 · 상세 페이지 (오픈 전 · 완공 예상 이미지 기준)
   - 데이터는 data/spaces.js 의 'megaspot-gundae-2', 요금은 data/pricing-gundae2.js (요금 화면은 pricing-ui.js 가 <body data-space> 로 2호를 고릅니다)
   - 1호 상세(space.js)와 같은 자리 이름(#gallery, #facts, #intro-zones, #layouts, #flow, #rules, #access-list, #calendar)을 씁니다. 도면·3D·시설 목록·후기는 오픈 뒤 추가 */
(function(){
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc;
  var S=window.MEGASPOT_GET_SPACE('megaspot-gundae-2'); if(!S) return;
  var photoById={}; S.photos.forEach(function(p){ photoById[p.id]=p; });
  var CG=' (완공 예상 이미지)';

  /* ---------- 오픈 D-day ---------- */
  (function(){
    var el=$('#open-dday'); if(!el||!S.opening) return;
    var p=S.opening.split('-'), open=new Date(+p[0],+p[1]-1,+p[2]), today=new Date(); today.setHours(0,0,0,0);
    var d=Math.round((open-today)/86400000);
    el.textContent = d>0 ? 'D-'+d : d===0 ? 'D-DAY' : '오픈';
    if(d<=0){ var band=$('#opening'); if(band){ var h=band.querySelector('h2'); if(h) h.innerHTML='2026년 11월 13일 문을 열었습니다.<br>지금 바로 예약할 수 있습니다'; } }
  })();

  /* ---------- 갤러리: 완공 예상 이미지 ---------- */
  (function(){
    var g=$('#gallery'); if(!g) return;
    var list=S.photos, tabs=$('#media-tabs');
    if(tabs) tabs.innerHTML='<button type="button" role="tab" class="on" aria-selected="true" data-set="photos">완공 예상 이미지<span class="n">'+list.length+'</span></button>';
    var items=list.map(function(p){ return { src:M.imgSrc(p.id,'m'), title:p.title, cap:p.cap+' '+S.photoNote, tag:'완공 예상 이미지' }; });
    var show=list.slice(0,7);
    g.innerHTML=show.map(function(p,i){
      var more = i===6 && list.length>7 ? '<span class="more">+'+(list.length-7)+'장 더 보기</span>' : '';
      return '<button type="button" class="'+(i===0?'big':'')+'" data-i="'+i+'" aria-label="'+esc(p.title)+' 크게 보기"><img src="'+M.imgSrc(p.id, i===0?'m':'t')+'" alt="메가스팟 건대 2호 — '+esc(p.title)+CG+'" '+(i===0?'':'loading="lazy"')+'>'+(i===0?'<span class="ph-note">완공 예상 이미지</span>':'')+more+'</button>';
    }).join('');
    g.addEventListener('click', function(e){ var b=e.target.closest('button'); if(b) M.openLightbox(items, +b.dataset.i); });
    var all=$('#open-all-photos'); if(all) all.addEventListener('click', function(){ M.openLightbox(items,0); });
  })();

  /* ---------- 핵심 정보 ---------- */
  (function(){
    var el=$('#facts'); if(!el) return;
    el.innerHTML=S.highlights.map(function(h){ return '<div><b>'+esc(h.k)+'</b><span>'+esc(h.v)+'<br><span class="tiny" style="color:var(--ink-3)">'+esc(h.d)+'</span></span></div>'; }).join('');
  })();

  /* ---------- 공간 구성 ---------- */
  (function(){
    var box=$('#intro-zones'); if(!box) return;
    var img=$('#intro-zone-photo'), cap=$('#intro-zone-cap');
    box.innerHTML=S.zones.map(function(z){ return '<button type="button" data-zone="'+z.id+'"><span class="zn">'+z.n+'</span>'+esc(z.label)+'</button>'; }).join('');
    box.addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; $$('button',box).forEach(function(x){x.classList.toggle('on',x===b);}); var z=S.zones.find(function(x){return x.id===b.dataset.zone;}); var p=photoById[z.photo]; img.src=M.imgSrc(z.photo,'m'); img.alt='메가스팟 건대 2호 '+(p?p.title:z.label)+CG; cap.textContent=z.label+' · '+z.desc; });
    box.querySelector('button').classList.add('on');
    var note=$('#photo-note'); if(note) note.textContent=S.photoNote||'';
  })();

  /* ---------- 배치 예시 (완공 예상 이미지 + 설명) ---------- */
  (function(){
    var host=$('#layouts'); if(!host) return;
    var lb=S.layouts.map(function(l){ var p=photoById[l.photo]||{}; return { src:M.imgSrc(l.photo,'m'), title:l.label+' 배치 · '+(p.title||''), cap:(p.cap||'')+' '+S.photoNote, tag:'완공 예상 이미지' }; });
    host.innerHTML=S.layouts.map(function(l,i){
      var p=photoById[l.photo]||{};
      return '<div class="card pad-s layout-card"><button type="button" class="layout-ph" data-li="'+i+'" aria-label="'+esc(l.label)+' 배치 이미지 크게 보기"><img src="'+M.imgSrc(l.photo,'m')+'" alt="'+esc(l.label)+' 배치 — '+esc(p.title||'')+CG+'" loading="lazy"><span class="ph-note">완공 예상 이미지</span></button>'
        + '<div class="row between mt-2"><div><div class="eyebrow">'+esc(l.en)+'</div><h3 style="font-size:17px;margin-top:4px">'+esc(l.label)+'</h3></div><span class="badge badge-soft">'+esc(l.capacityNote)+'</span></div>'
        + '<p class="small muted mt-1">'+esc(l.desc)+'</p>'
        + '<p class="tiny mt-2"><b>적합</b> '+esc(l.fit)+'<br><b>확인</b> '+esc(l.check)+'</p></div>';
    }).join('');
    host.insertAdjacentHTML('afterend', '<p class="tiny muted mt-2 layout-foot">배치 이미지는 완공 예상 이미지입니다. 실제 인원은 무대·장비·통로·운영 인력과 행사 조건을 확인한 뒤 확정하며, 실측 도면과 배치 평면 예시는 공사가 끝난 뒤 올립니다.</p>');
    host.addEventListener('click', function(e){ var b=e.target.closest('.layout-ph'); if(b) M.openLightbox(lb, +b.dataset.li); });
  })();

  /* ---------- 이용 안내 / 접근 ---------- */
  (function(){
    var flow=$('#flow'); if(flow){
      var d=['오픈일 이후 날짜로 시간·인원을 골라 금액을 확인하고 이름·연락처만 적어 신청합니다. 접수번호가 바로 나오고, 카카오톡·전화로 알려 주셔도 됩니다.','신청한 날짜·시간이 비어 있는지 확인하고 빠르게 연락드립니다. 영업시간에는 보통 2시간 안에 첫 답을 드립니다.','공간료·인원 추가·옵션을 항목별로 나눈 확정 금액과 보증금·환불 기준, 결제 방법(카드·계좌이체)을 안내합니다.','결제가 끝나면 예약이 확정됩니다. 공사 지연으로 오픈이 늦어지면 전액 환불 또는 1호·다른 날짜로 바꿔 드립니다.','예약번호와 예약확정서를 보내 드리고, 공사 진행 상황에 맞춰 사전 답사와 장비·배치 조건을 안내합니다.','이용 당일 지정 담당자가 입장·장비 연결·퇴실을 돕습니다. 시간을 늘려야 하면 미리 알려 주세요.','이용 뒤 정리·파손 여부를 확인하고 보증금을 돌려 드립니다. 후기는 이용 확인 뒤 게시합니다.'];
      flow.innerHTML=S.booking.flow.map(function(f,i){ return '<li><b>'+esc(f)+'</b><span>'+esc(d[i]||'')+'</span></li>'; }).join('');
    }
    var rn=$('#response-note'); if(rn) rn.textContent=S.booking.response;
    var rules=$('#rules'); if(rules) rules.innerHTML=S.rules.map(function(r){ return '<div><dt>'+esc(r.k)+'</dt><dd>'+esc(r.d)+'</dd></div>'; }).join('');
    var ac=$('#access-list'); if(ac) ac.innerHTML=[['주소',S.address+' (도로명: '+S.roadAddress+')'],['대중교통',S.access.transit],['주차',S.access.parking],['엘리베이터',S.access.elevator],['현장 안내',S.access.note]].map(function(r){ return '<div><dt>'+r[0]+'</dt><dd>'+esc(r[1])+'</dd></div>'; }).join('');
    var cp=$('#copy-address'); if(cp) cp.addEventListener('click', function(){ (navigator.clipboard?navigator.clipboard.writeText(S.address):Promise.reject()).then(function(){ M.toast('주소를 복사했습니다.'); }).catch(function(){ M.toast(S.address); }); });
  })();

  /* ---------- 달력 (2호 일정 · 예약 신청 화면과 연결) ---------- */
  (function(){
    var grid=$('#booking-grid'); if(!grid) return;
    function layout(e){ grid.style.gridTemplateColumns=e.matches?'minmax(320px,1.1fr) minmax(0,.9fr)':'1fr'; } var mq=window.matchMedia('(min-width:900px)'); layout(mq); mq.addEventListener('change', layout);
  })();
  (function(){
    var cal=$('#calendar'); if(!cal) return;
    var today=new Date(); today.setHours(0,0,0,0);
    var op=S.opening ? (function(){ var p=S.opening.split('-'); return new Date(+p[0],+p[1]-1,+p[2]); })() : today;
    var first=op>today?op:today;
    var cur=new Date(first.getFullYear(), first.getMonth(), 1), selected=null, cache={};
    function load(y,m){
      var key=y+'-'+M.pad2(m+1); if(cache[key]) return Promise.resolve(cache[key]);
      var from=key+'-01', to=y+'-'+M.pad2(m+1)+'-'+M.pad2(new Date(y,m+1,0).getDate());
      return M.api('/availability?space='+S.id+'&from='+from+'&to='+to).then(function(r){ cache[key]=r.days||{}; return cache[key]; }).catch(function(){ cache[key]={}; return cache[key]; });
    }
    function render(){
      var y=cur.getFullYear(), m=cur.getMonth();
      load(y,m).then(function(days){
        var fd=new Date(y,m,1).getDay(), n=new Date(y,m+1,0).getDate();
        var h='<div class="cal-head"><button type="button" id="cal-prev" aria-label="이전 달">‹</button><b>'+y+'년 '+(m+1)+'월</b><button type="button" id="cal-next" aria-label="다음 달">›</button></div><div class="cal-grid">';
        ['일','월','화','수','목','금','토'].forEach(function(d){ h+='<div class="dow">'+d+'</div>'; });
        for(var i=0;i<fd;i++) h+='<div class="cal-day pad"></div>';
        for(var d=1; d<=n; d++){
          var iso=y+'-'+M.pad2(m+1)+'-'+M.pad2(d); var dt=new Date(y,m,d); var info=days[iso]||{}; var cls='cal-day ';
          var before = dt<today || dt<op;
          if(before) cls+='past'; else if(info.state==='full') cls+='full'; else if(info.state==='hold') cls+='hold'; else if(info.state==='partial') cls+='partial'; else cls+='open';
          if(selected===iso) cls+=' sel';
          h+='<div class="'+cls+'" data-d="'+iso+'" role="button" tabindex="'+(before||info.state==='full'?'-1':'0')+'" aria-label="'+M.fmtKDate(iso)+(before?' 오픈 전':info.state==='full'?' 마감':info.state==='hold'?' 임시 확보':info.state==='partial'?' 일부 시간 예약 있음, 다른 시간 문의 가능':' 사전 예약 가능')+'">'+d+(info.state&&!before?'<span class="dot"></span>':'')+'</div>';
        }
        h+='</div><div class="cal-legend"><span><i style="background:var(--concrete-3);border:1px solid var(--concrete)"></i>사전 예약 가능 (확인 뒤 확정)</span><span><i style="background:var(--cobalt-soft);border:1px solid #BFD0F5"></i>일부 시간 예약 (다른 시간 가능)</span><span><i style="background:var(--warn-soft)"></i>임시 확보 중</span><span><i style="background:var(--concrete-2)"></i>마감 · 오픈 전</span><span><i style="background:var(--cobalt)"></i>선택한 날짜</span></div>';
        h+='<p class="tiny muted mt-2">'+(op>today?'2026년 11월 13일 오픈 전 날짜는 고를 수 없습니다. ':'')+(M.demo.on||!Object.keys(days).length?'달력은 안내용이며 실시간 재고가 아닙니다. 희망일을 고르면 사전 예약 화면에 들어가고, 확정 여부는 상담 때 안내합니다.':'표시 상태는 운영자가 갱신한 일정 기준이며 최종 확정은 금액 확인과 결제 뒤에 이뤄집니다.')+'</p>';
        cal.innerHTML=h;
        $('#cal-prev').addEventListener('click', function(){ cur=new Date(y,m-1,1); render(); });
        $('#cal-next').addEventListener('click', function(){ cur=new Date(y,m+1,1); render(); });
        $('#cal-prev').disabled = (y===first.getFullYear()&&m===first.getMonth());
        cal.querySelectorAll('.cal-day.open,.cal-day.hold,.cal-day.partial').forEach(function(el){ function pick(){ var part=el.classList.contains('partial'); selected=el.dataset.d; var est=M.pricing&&M.pricing.estimator; if(est) est.setDate(selected); render(); M.toast(M.fmtKDate(selected)+'을(를) 사전 예약 화면에 넣었습니다.'+(part?' 이 날은 일부 시간에 예약이 있어, 가능한 시간을 확인해 안내해 드립니다.':'')); var box=$('#estimate'); if(box) box.scrollIntoView({behavior:'smooth',block:'start'}); } el.addEventListener('click', pick); el.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); } }); });
      });
    }
    M.checkApi().then(render);
  })();
})();
