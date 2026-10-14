/* 메가스팟 건대 · 상세 페이지 */
(function(){
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc;
  var S=window.MEGASPOT_GET_SPACE('megaspot-gundae'); if(!S) return;
  var P=window.MEGASPOT_GUNDAE_PLAN, F=window.MEGASPOT_FACILITIES;
  var photoById={}; S.photos.forEach(function(p){ photoById[p.id]=p; });
  /* ---------- 갤러리: 공간 전경 · 공간 사진 · 조감도 ---------- */
  (function(){
    var g=$('#gallery'); if(!g) return;
    var V=window.MEGASPOT_VIEWS||[], A=window.MEGASPOT_AERIALS||[], N=window.MEGASPOT_VISUAL_NOTE||{};
    var SCN=' 행사 장면은 아래 <a href="#scenes" style="text-decoration:underline;color:var(--cobalt);font-weight:600">활용 장면</a>에서 볼 수 있습니다.';
    var sets={
      views:  { label:'공간 전경', list:V, note:esc(N.views||'')+SCN },
      photos: { label:'공간 사진', list:S.photos, note:'메인 홀과 라운지, 준비 공간, 설비를 담은 사진 '+S.photos.length+'장입니다.'+SCN },
      aerial: { label:'조감도', list:A, note:esc(N.aerial||'')+' <a href="#aerial" style="text-decoration:underline;color:var(--cobalt);font-weight:600">각도별로 보기</a>' }
    };
    var order=['views','photos','aerial'].filter(function(k){ return sets[k].list.length; }), cur=order[0];
    var tabs=$('#media-tabs'), note=$('#media-note');
    if(tabs) tabs.innerHTML=order.map(function(k){ return '<button type="button" role="tab" data-set="'+k+'">'+esc(sets[k].label)+'<span class="n">'+sets[k].list.length+'</span></button>'; }).join('');
    function items(k){ return M.sceneItems(sets[k].list); }
    function render(k){
      cur=k; var list=sets[k].list, show=list.slice(0,7);
      g.classList.toggle('is-aerial', k==='aerial');
      g.innerHTML=show.map(function(p,i){
        var more = i===6 && list.length>7 ? '<span class="more">+'+(list.length-7)+'장 더 보기</span>' : '';
        return '<button type="button" class="'+(i===0?'big':'')+'" data-i="'+i+'" aria-label="'+esc(p.title)+' 크게 보기"><img src="'+M.imgSrc(p.id, i===0?'m':'t')+'" alt="메가스팟 건대 — '+esc(p.title)+'" '+(i===0?'':'loading="lazy"')+'>'+(i===0?M.tagHtml(p.id):'')+more+'</button>';
      }).join('');
      if(tabs) $$('button',tabs).forEach(function(b){ var on=b.dataset.set===k; b.classList.toggle('on',on); b.setAttribute('aria-selected',String(on)); });
      if(note) note.innerHTML=sets[k].note;
    }
    if(tabs) tabs.addEventListener('click', function(e){ var b=e.target.closest('button[data-set]'); if(b) render(b.dataset.set); });
    g.addEventListener('click', function(e){ var b=e.target.closest('button'); if(b) M.openLightbox(items(cur), +b.dataset.i); });
    $('#open-all-photos').addEventListener('click', function(){ M.openLightbox(items(cur),0); });
    render(cur);
  })();

  /* ---------- 조감도: 각도 바꿔 보기 ---------- */
  (function(){
    var A=window.MEGASPOT_AERIALS||[], box=$('#aerial-angles'); if(!box||!A.length) return;
    var img=$('#aerial-img'), ttl=$('#aerial-title'), cap=$('#aerial-cap'), k=0;
    box.innerHTML=A.map(function(a,i){ return '<button type="button" role="tab" data-i="'+i+'" aria-selected="false"><img src="'+M.imgSrc(a.id,'t')+'" alt="" loading="lazy"><span>'+esc(a.angle)+'</span></button>'; }).join('');
    function show(i){
      k=i; var a=A[i];
      img.src=M.imgSrc(a.id,'m'); img.alt='메가스팟 건대 조감도 — '+a.title;
      ttl.textContent=a.title; cap.textContent=a.cap;
      $$('button',box).forEach(function(b){ var on=+b.dataset.i===i; b.classList.toggle('on',on); b.setAttribute('aria-selected',String(on)); });
    }
    box.addEventListener('click', function(e){ var b=e.target.closest('button[data-i]'); if(b) show(+b.dataset.i); });
    $('#aerial-zoom').addEventListener('click', function(){ M.openLightbox(M.sceneItems(A), k); });
    var note=$('#aerial-note'); if(note) note.textContent=(window.MEGASPOT_VISUAL_NOTE||{}).aerial||'';
    show(0);
  })();

  /* ---------- 핵심 정보 ---------- */
  (function(){
    var el=$('#facts'); if(!el) return;
    el.innerHTML=S.highlights.map(function(h){ return '<div><b>'+esc(h.k)+'</b><span>'+esc(h.v)+'<br><span class="tiny" style="color:var(--ink-3)">'+esc(h.d)+'</span></span></div>'; }).join('');
  })();

  /* ---------- 구역 버튼 (소개 / 도면 공용) ---------- */
  function zoneButtons(container, onPick){
    container.innerHTML=S.zones.map(function(z){ return '<button type="button" data-zone="'+z.id+'"><span class="zn">'+z.n+'</span>'+esc(z.label)+'</button>'; }).join('');
    container.addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; $$('button',container).forEach(function(x){x.classList.toggle('on',x===b);}); onPick(b.dataset.zone); });
  }
  function zone(id){ return S.zones.find(function(z){return z.id===id;}); }
  (function(){
    var box=$('#intro-zones'); if(!box) return;
    var img=$('#intro-zone-photo'), cap=$('#intro-zone-cap');
    zoneButtons(box, function(id){ var z=zone(id); var p=photoById[z.photo]; img.src=M.photoSrc(S.id,z.photo); img.alt=p?p.title:z.label; cap.textContent=z.label+' · '+z.desc; });
    box.querySelector('button').classList.add('on');
  })();

  /* ---------- 평면도 SVG ---------- */
  var planState={furniture:true,dims:false,labels:false,zone:null};
  function drawPlan(){
    var host=$('#floorplan'); if(!host) return;
    var k=30, pad=50;
    var W=P.width*k+pad*2, H=P.bi*k+pad*2;
    function X(x){return (x*k+pad).toFixed(1);} function Z(z){return (z*k+pad).toFixed(1);}
    var s='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="메가스팟 건대 평면도">';
    s+='<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#3A4046"/><line x1="0" y1="0" x2="0" y2="6" stroke="#8A9097" stroke-width="2"/></pattern>'
      +'<pattern id="brickp" width="10" height="6" patternUnits="userSpaceOnUse"><rect width="10" height="6" fill="#F5E6DF"/><path d="M0 3h10M5 0v3M0 3v3M10 3v3" stroke="#B35632" stroke-width=".8" fill="none"/></pattern></defs>';
    // 바닥
    var poly=P.boundary.map(function(p){return X(p[0])+','+Z(p[1]);}).join(' ');
    s+='<polygon points="'+poly+'" fill="#F7F5F1" stroke="#262B2E" stroke-width="3" stroke-linejoin="miter"/>';
    // 창
    P.windows.forEach(function(w){ s+='<line x1="'+X(w[0][0])+'" y1="'+Z(w[0][1])+'" x2="'+X(w[1][0])+'" y2="'+Z(w[1][1])+'" stroke="#9FB7F0" stroke-width="6" stroke-linecap="butt"/>'; });
    // 구역 클릭 영역
    var regions={
      windows:[[1.2,0.25],[16,0.25],[16,2.4],[0.7,2.4]],
      hall:[[0.7,2.4],[15.9,2.4],[15.9,15.0],[0.3,15.0]],
      lounge:[[1,15.0],[16.4,15.0],[16.4,P.De-.05],[0.1,P.De-.05]],
      lounge2:[[19.4,19],[25.3,19],[25.3,P.bi-.05],[19.4,P.bi-.05]],
      screen:[[15.3,8.8],[16.3,8.8],[16.3,15.0],[15.3,15.0]],
      booth:[[16.0,4.4],[17.3,4.4],[17.3,7.2],[16.0,7.2]],
      service:[[16.3,9.1],[17.6,9.1],[17.6,14.6],[16.3,14.6]],
      storage:[[20.6,P.xe-6.09],[25.33,P.xe-6.09],[25.33,P.xe-4.9],[20.6,P.xe-4.9]],
      entrance:[[16.55,P.xe-2.6],[19.3,P.xe-2.6],[19.3,P.xe-.05],[16.55,P.xe-.05]]
    };
    Object.keys(regions).forEach(function(id){ var zid=id==='lounge2'?'lounge':id; var on=planState.zone===zid; s+='<polygon class="zone-hit" data-zone="'+zid+'" points="'+regions[id].map(function(p){return X(p[0])+','+Z(p[1]);}).join(' ')+'" fill="'+(on?'#1F53D5':'transparent')+'" fill-opacity="'+(on?'.13':'0')+'" stroke="'+(on?'#1F53D5':'none')+'" stroke-width="1.5" stroke-dasharray="4 3" style="cursor:pointer"/>'; });
    // 기둥
    P.columns.forEach(function(c){ s+='<rect x="'+X(c.x)+'" y="'+Z(c.z)+'" width="'+(c.w*k)+'" height="'+(c.d*k)+'" fill="url(#hatch)" stroke="#262B2E" stroke-width="1.5"/><text x="'+X(c.x+c.w/2)+'" y="'+(Z(c.z+c.d)*1+14)+'" font-size="10" text-anchor="middle" fill="#5B6168" font-weight="700">'+c.id+'</text>'; });
    // 고정 시설
    P.fixtures.forEach(function(f){
      var x=X(f.x), y=Z(f.z);
      if(f.type==='wall') s+='<rect x="'+x+'" y="'+y+'" width="'+(f.w*k)+'" height="'+(f.d*k)+'" fill="#262B2E"/>';
      else if(f.type==='screen'){ s+='<rect x="'+x+'" y="'+y+'" width="'+(f.w*k)+'" height="'+(f.d*k)+'" fill="#1F53D5"/><text x="'+(x*1-6)+'" y="'+Z(f.z+f.d/2)+'" font-size="10" text-anchor="middle" fill="#1F53D5" font-weight="700" transform="rotate(-90 '+(x*1-6)+' '+Z(f.z+f.d/2)+')">200" SCREEN</text>'; }
      else if(f.type==='box'){ s+='<rect x="'+x+'" y="'+y+'" width="'+(f.w*k)+'" height="'+(f.d*k)+'" fill="#E6E2DB" stroke="#5B6168" stroke-width="1.2"/>'; if(f.label) s+='<text x="'+X(f.x+f.w+0.15)+'" y="'+Z(f.z+f.d/2)+'" font-size="10.5" fill="#262B2E" dominant-baseline="middle">'+esc(f.label)+'</text>'; }
      else if(f.type==='room'){ s+='<rect x="'+x+'" y="'+y+'" width="'+(f.w*k)+'" height="'+(f.d*k)+'" fill="#ECE8E1" stroke="#5B6168" stroke-width="1.2" stroke-dasharray="5 3"/><text x="'+X(f.x+f.w/2)+'" y="'+Z(f.z+f.d/2)+'" font-size="11" text-anchor="middle" dominant-baseline="middle" fill="#262B2E" font-weight="700">'+esc(f.label)+'</text>'; }
      else if(f.type==='door'){ s+='<line x1="'+X(f.x)+'" y1="'+y+'" x2="'+X(f.x+f.w)+'" y2="'+y+'" stroke="#F7F5F1" stroke-width="5"/><line x1="'+X(f.x)+'" y1="'+y+'" x2="'+X(f.x+f.w)+'" y2="'+y+'" stroke="#1F53D5" stroke-width="2.5" stroke-dasharray="6 4"/><text x="'+X(f.x+f.w/2)+'" y="'+(y*1+18)+'" font-size="11" text-anchor="middle" fill="#1F53D5" font-weight="700">'+esc(f.label)+'</text><text x="'+X(f.x+f.w/2)+'" y="'+(y*1+31)+'" font-size="9" text-anchor="middle" fill="#8A9097">문 폭·개폐 방향 미확인</text>'; }
      else if(f.type==='bench'){ s+='<rect x="'+x+'" y="'+y+'" width="'+(f.w*k)+'" height="'+(f.d*k)+'" rx="3" fill="#CFC8BD" stroke="#8A9097" stroke-width="1"/>'; }
      else if(f.type==='brick'){ s+='<rect x="'+x+'" y="'+y+'" width="'+(f.w*k)+'" height="'+(f.d*k)+'" fill="url(#brickp)" stroke="#B35632" stroke-width="1"/>'; }
      else if(f.type==='light'){ s+='<circle cx="'+x+'" cy="'+y+'" r="'+(f.r*k)+'" fill="none" stroke="#B35632" stroke-width="1.2" stroke-dasharray="3 3"/><circle cx="'+x+'" cy="'+y+'" r="3" fill="#B35632"/>'; }
    });
    // 가구
    if(planState.furniture){
      s+='<g opacity=".95">';
      P.furniture.tables.forEach(function(t){
        s+='<rect x="'+X(t.x-t.w/2)+'" y="'+Z(t.z-t.d/2)+'" width="'+(t.w*k)+'" height="'+(t.d*k)+'" fill="'+(t.bar?'#D9C3A3':'#C9A77A')+'" stroke="#8E6B3F" stroke-width="1"/>';
        if(t.chairs){ var n=Math.max(2,Math.floor(t.w/.63)); for(var i=0;i<n;i++){ var cx=t.x-t.w/2+(i+.5)*t.w/n; [t.z-t.d/2-.35, t.z+t.d/2+.35].forEach(function(cz){ s+='<rect x="'+X(cx-.2)+'" y="'+Z(cz-.2)+'" width="'+(.4*k)+'" height="'+(.4*k)+'" rx="2" fill="#3A4046"/>'; }); } }
        if(t.bar){ [t.x-.44,t.x+.44].forEach(function(cx){ s+='<circle cx="'+X(cx)+'" cy="'+Z(t.z+.75)+'" r="'+(.18*k)+'" fill="#3A4046"/>'; }); }
      });
      P.furniture.plants.forEach(function(p){ s+='<circle cx="'+X(p[0])+'" cy="'+Z(p[1])+'" r="'+(.4*k)+'" fill="#CFE0C2" stroke="#6F8F5B" stroke-width="1"/>'; });
      s+='</g>';
    }
    // 치수
    if(planState.dims){
      s+='<g font-size="11" fill="#B35632" font-weight="700">';
      P.dims.forEach(function(d){
        var ax=d.a[0],az=d.a[1],bx=d.b[0],bz=d.b[1];
        if(d.vertical){ var lx=ax+d.off; s+='<line x1="'+X(lx)+'" y1="'+Z(az)+'" x2="'+X(lx)+'" y2="'+Z(bz)+'" stroke="#B35632" stroke-width="1"/>'; [az,bz].forEach(function(zz){ s+='<line x1="'+X(lx-.2)+'" y1="'+Z(zz)+'" x2="'+X(lx+.2)+'" y2="'+Z(zz)+'" stroke="#B35632" stroke-width="1"/>'; }); s+='<text x="'+X(lx+(d.off<0?-.3:.3))+'" y="'+Z((az+bz)/2)+'" text-anchor="middle" transform="rotate(-90 '+X(lx+(d.off<0?-.3:.3))+' '+Z((az+bz)/2)+')">'+esc(d.text)+'</text>'; }
        else { var lz=az+d.off; s+='<line x1="'+X(ax)+'" y1="'+Z(lz)+'" x2="'+X(bx)+'" y2="'+Z(lz)+'" stroke="#B35632" stroke-width="1"/>'; [ax,bx].forEach(function(xx){ s+='<line x1="'+X(xx)+'" y1="'+Z(lz-.2)+'" x2="'+X(xx)+'" y2="'+Z(lz+.2)+'" stroke="#B35632" stroke-width="1"/>'; }); s+='<text x="'+X((ax+bx)/2)+'" y="'+Z(lz+(d.off<0?-.25:.5))+'" text-anchor="middle">'+esc(d.text)+'</text>'; }
      });
      s+='<text x="'+X(21.5)+'" y="'+Z(6.2)+'" font-size="13" text-anchor="middle" fill="#262B2E">H = 4.30 m</text>';
      s+='<text x="'+X(1.5)+'" y="'+Z(P.bi-.3)+'" font-size="9.5" fill="#8A9097" font-weight="400">* 손글씨 판독값 · † 시작·끝점 확인 필요 · 벽 두께는 단선 표시</text></g>';
    }
    // 구역 이름
    if(planState.labels){ s+='<g font-size="12.5" fill="#262B2E" font-weight="700" text-anchor="middle">'; P.labels.forEach(function(l){ s+='<text x="'+X(l.x)+'" y="'+Z(l.z)+'">'+esc(l.text)+'</text>'; }); s+='</g>'; }
    // 핀
    P.pins.forEach(function(p){ var z=zone(p.id); var on=planState.zone===p.id; s+='<g class="pin" data-zone="'+p.id+'" style="cursor:pointer"><circle cx="'+X(p.x)+'" cy="'+Z(p.z)+'" r="13" fill="'+(on?'#1F53D5':'#262B2E')+'" stroke="#fff" stroke-width="2"/><text x="'+X(p.x)+'" y="'+(Z(p.z)*1+4)+'" font-size="10.5" text-anchor="middle" fill="#fff" font-weight="700" font-family="Anton, sans-serif">'+z.n+'</text></g>'; });
    // 북쪽 표시·축척
    s+='<g font-size="10" fill="#8A9097"><line x1="'+X(0.2)+'" y1="'+Z(P.bi-1.6)+'" x2="'+X(5.2)+'" y2="'+Z(P.bi-1.6)+'" stroke="#262B2E" stroke-width="3"/><text x="'+X(0.2)+'" y="'+Z(P.bi-1.9)+'">0</text><text x="'+X(5.0)+'" y="'+Z(P.bi-1.9)+'">5 m</text></g>';
    s+='</svg>';
    host.innerHTML=s;
    host.querySelectorAll('.zone-hit,.pin').forEach(function(el){ el.addEventListener('click', function(){ selectZone(el.getAttribute('data-zone'), true); }); });
  }
  function selectZone(id, fromPlan){
    planState.zone=id; var z=zone(id); if(!z) return;
    $('#plan-info').innerHTML='<b>'+z.n+' · '+esc(z.label)+' <span class="tiny muted" style="font-weight:400">'+esc(z.en)+'</span></b>'+esc(z.desc);
    var img=$('#plan-zone-photo'), p=photoById[z.photo]; img.src=M.photoSrc(S.id,z.photo); img.alt=p?p.title:z.label; $('#plan-zone-cap').textContent=(p?p.title:z.label);
    $$('#plan-zones button').forEach(function(b){ b.classList.toggle('on', b.dataset.zone===id); });
    drawPlan();
  }
  (function(){
    if(!$('#floorplan')) return;
    zoneButtons($('#plan-zones'), function(id){ selectZone(id); });
    $$('[data-plan-toggle]').forEach(function(b){ b.addEventListener('click', function(){ var key=b.dataset.planToggle; planState[key]=!planState[key]; b.classList.toggle('on', planState[key]); drawPlan(); }); });
    drawPlan(); selectZone('hall');
    $('#open-plan-img').addEventListener('click', function(){ M.openLightbox([{src:S.docs.floorplanImg,title:'실측 평면도 (치수)',cap:'단위 mm · 손글씨 판독값(*)과 확인 필요 치수(†)가 포함되어 있습니다.'},{src:S.docs.floorplanBasic,title:'기본 평면도',cap:'가구 배치·구획 검토용'}],0); });
    $('#open-sketch').addEventListener('click', function(){ M.openLightbox([{src:S.docs.sketch,title:'원본 실측 손도면',cap:'현장에서 실측한 손도면 원본입니다.'}],0); });
    var grid=$('#plan-grid'); if(window.matchMedia('(min-width:900px)').matches){ grid.style.gridTemplateColumns='1.05fr .95fr'; }
    window.matchMedia('(min-width:900px)').addEventListener('change', function(e){ grid.style.gridTemplateColumns=e.matches?'1.05fr .95fr':'1fr'; });
  })();

  /* ---------- 배치 예시 ---------- */
  (function(){
    var host=$('#layouts'); if(!host) return;
    var k=9, pad=12; var W=P.width*k+pad*2, H=P.bi*k+pad*2;
    function X(x){return (x*k+pad).toFixed(1);} function Z(z){return (z*k+pad).toFixed(1);}
    function base(){ var poly=P.boundary.map(function(p){return X(p[0])+','+Z(p[1]);}).join(' '); var s='<polygon points="'+poly+'" fill="#F7F5F1" stroke="#262B2E" stroke-width="1.6"/>'; P.windows.forEach(function(w){ s+='<line x1="'+X(w[0][0])+'" y1="'+Z(w[0][1])+'" x2="'+X(w[1][0])+'" y2="'+Z(w[1][1])+'" stroke="#9FB7F0" stroke-width="3"/>'; }); P.columns.forEach(function(c){ s+='<rect x="'+X(c.x)+'" y="'+Z(c.z)+'" width="'+(c.w*k)+'" height="'+(c.d*k)+'" fill="#3A4046"/>'; }); s+='<rect x="'+X(15.93)+'" y="'+Z(9.586)+'" width="'+(.12*k)+'" height="'+(4.428*k)+'" fill="#1F53D5"/>'; s+='<rect x="'+X(16.045)+'" y="'+Z(8.923)+'" width="'+(.15*k)+'" height="'+((P.De-1-8.923)*k)+'" fill="#262B2E"/>'; return s; }
    function chair(x,z){ return '<rect x="'+X(x-.22)+'" y="'+Z(z-.22)+'" width="'+(.44*k)+'" height="'+(.44*k)+'" rx="1" fill="#3A4046"/>'; }
    function table(x,z,w,d){ return '<rect x="'+X(x-w/2)+'" y="'+Z(z-d/2)+'" width="'+(w*k)+'" height="'+(d*k)+'" fill="#C9A77A" stroke="#8E6B3F" stroke-width=".6"/>'; }
    var draw={
      lecture:function(){ var s=''; for(var x=14.4;x>=4.2;x-=.95){ for(var z=9.2;z<=15.2;z+=.8){ if(z>11.6&&z<12.6) continue; s+=chair(x,z); } } s+='<rect x="'+X(15.0)+'" y="'+Z(9.6)+'" width="'+(.5*k)+'" height="'+(4.4*k)+'" fill="#E6ECFB" stroke="#1F53D5" stroke-width=".6" stroke-dasharray="2 1.5"/>'; return s; },
      classroom:function(){ var s=''; [13.6,11.3,9.0,6.7,4.4].forEach(function(x){ [[9.3,12.0],[12.6,15.3]].forEach(function(r){ var zc=(r[0]+r[1])/2, len=r[1]-r[0]; s+=table(x,zc,.75,len); for(var z=r[0]+.4; z<r[1]; z+=.7) s+=chair(x-.75,z); }); }); return s; },
      banquet:function(){ var s=''; [10,12.3,14.4].forEach(function(z){ s+=table(8.8,z,11.5,.8); for(var x=3.4;x<14.4;x+=.7){ s+=chair(x,z-.75); s+=chair(x,z+.75);} }); [3,5.2].forEach(function(z){ s+=table(9.9,z,6.5,.75); for(var x=7;x<13;x+=.7){ s+=chair(x,z-.7); s+=chair(x,z+.7);} }); return s; },
      standing:function(){ var s=''; var pts=[[4,10.2],[6.2,12.6],[8.6,10.6],[10.8,13.2],[13,11],[5.5,14.6],[9.8,15],[12.6,14.2],[7.6,4.6],[11.2,4.2],[14,3.4],[21.2,21],[23.5,23.2],[21.6,26]]; pts.forEach(function(p){ s+='<circle cx="'+X(p[0])+'" cy="'+Z(p[1])+'" r="'+(.4*k)+'" fill="#D9C3A3" stroke="#8E6B3F" stroke-width=".6"/>'; }); s+='<rect x="'+X(1.1)+'" y="'+Z(P.De-.87)+'" width="'+(14.4*k)+'" height="'+(.76*k)+'" rx="2" fill="#CFC8BD"/><rect x="'+X(24.35)+'" y="'+Z(19.44)+'" width="'+(.77*k)+'" height="'+(4*k)+'" rx="2" fill="#CFC8BD"/>'; s+='<rect x="'+X(14.6)+'" y="'+Z(9.6)+'" width="'+(.9*k)+'" height="'+(4.4*k)+'" fill="#E6ECFB" stroke="#1F53D5" stroke-width=".6" stroke-dasharray="2 1.5"/>'; return s; }
    };
    var withScene=S.layouts.filter(function(l){ return l.scene && window.MEGASPOT_SCENE && window.MEGASPOT_SCENE(l.scene); });
    var lbItems=withScene.map(function(l){ var sc=window.MEGASPOT_SCENE(l.scene); return { src:M.imgSrc(sc.id), title:l.label+' 배치 · '+sc.title, cap:sc.cap, tag:M.imgTag(sc.id) }; });
    host.innerHTML=S.layouts.map(function(l){
      var sc=l.scene && window.MEGASPOT_SCENE ? window.MEGASPOT_SCENE(l.scene) : null;
      var ph=sc ? '<button type="button" class="layout-ph" data-li="'+withScene.indexOf(l)+'" aria-label="'+esc(l.label)+' 배치 장면 크게 보기"><img src="'+M.imgSrc(sc.id,'m')+'" alt="'+esc(l.label)+' 배치로 쓴 '+esc(sc.title)+'" loading="lazy">'+M.tagHtml(sc.id)+'</button>' : '';
      return '<div class="card pad-s">'+ph+'<svg class="layout-svg" viewBox="0 0 '+W+' '+H+'" aria-label="'+esc(l.label)+' 배치 평면 예시">'+base()+(draw[l.id]?draw[l.id]():'')+'</svg>'
        + '<div class="row between mt-2"><div><div class="eyebrow">'+esc(l.en)+'</div><h3 style="font-size:17px;margin-top:4px">'+esc(l.label)+'</h3></div><span class="badge badge-soft">인원은 '+esc(l.capacityNote)+'</span></div>'
        + '<p class="small muted mt-1">'+esc(l.desc)+'</p>'
        + '<p class="tiny mt-2"><b>적합</b> '+esc(l.fit)+'<br><b>확인</b> '+esc(l.check)+'</p></div>';
    }).join('');
    host.addEventListener('click', function(e){ var b=e.target.closest('.layout-ph'); if(b) M.openLightbox(lbItems, +b.dataset.li); });
  })();

  /* ---------- 활용 장면: 같은 자리, 다른 모임 ---------- */
  (function(){
    var SC=window.MEGASPOT_SCENES||[], VIEWS=window.MEGASPOT_SCENE_VIEWS||[];
    var ba=$('#ba'); if(!ba||!SC.length) return;
    var PUR=window.MEGASPOT_PURPOSES||[], purLabel={}; PUR.forEach(function(p){ purLabel[p.id]=p.label; });
    var layLabel={}; S.layouts.forEach(function(l){ layLabel[l.id]=l.label; });
    var before=$('#ba-before'), after=$('#ba-after'), range=$('#ba-range'), rlbl=$('#ba-rlbl');
    var chips=$('#scene-chips'), viewList=$('#view-list'), info=$('#scene-info');
    var state={ view:VIEWS[0].id, scene:null };
    function scenesOf(v){ return SC.filter(function(s){ return s.view===v; }); }
    function view(id){ return VIEWS.find(function(v){ return v.id===id; }); }
    function setPos(p){ p=Math.max(0,Math.min(100,p)); ba.style.setProperty('--pos', p+'%'); range.value=Math.round(p); }

    // 자리 목록
    viewList.innerHTML=VIEWS.map(function(v){ return '<button type="button" class="view-btn" data-view="'+v.id+'"><img src="'+M.imgSrc(v.real,'t')+'" alt="" loading="lazy"><span><b>'+esc(v.label)+'</b><small>모임 '+scenesOf(v.id).length+'가지</small></span></button>'; }).join('');
    viewList.addEventListener('click', function(e){ var b=e.target.closest('.view-btn'); if(!b) return; selectView(b.dataset.view, true); });

    function selectView(id, fromUser){
      state.view=id; var v=view(id), list=scenesOf(id);
      $$('.view-btn',viewList).forEach(function(b){ var on=b.dataset.view===id; b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); });
      before.src=M.imgSrc(v.real,'m'); before.alt='메가스팟 건대 — '+v.label+'에서 본 빈 홀';
      chips.innerHTML=list.map(function(s){ return '<button type="button" class="chip" data-scene="'+s.id+'">'+esc(s.title)+'</button>'; }).join('');
      selectScene(list[0].id);
      if(fromUser) setPos(50);
    }
    chips.addEventListener('click', function(e){ var b=e.target.closest('.chip'); if(b) selectScene(b.dataset.scene); });

    function selectScene(id){
      var s=window.MEGASPOT_SCENE(id); if(!s) return; state.scene=id;
      if(s.view!==state.view){ state.view=s.view; selectView(s.view); return selectScene(id); }
      after.src=M.imgSrc(s.id,'m'); after.alt='메가스팟 건대 — '+s.title;
      rlbl.textContent=s.title; rlbl.classList.toggle('r', true);
      $$('.chip',chips).forEach(function(c){ var on=c.dataset.scene===id; c.classList.toggle('on',on); c.setAttribute('aria-pressed',String(on)); });
      var v=view(s.view);
      info.innerHTML='<div class="row" style="gap:6px"><span class="badge badge-cobalt">'+esc(purLabel[s.purpose]||'')+'</span>'+(s.layout&&layLabel[s.layout]?'<span class="badge badge-soft">'+esc(layLabel[s.layout])+' 배치</span>':'')+'</div>'
        + '<div class="si-title">'+esc(s.title)+'</div><p>'+esc(s.cap)+'</p>'
        + '<div class="row mt-2"><button type="button" class="btn btn-primary btn-sm" id="scene-ask">이 모임으로 예약 신청</button><button type="button" class="btn btn-light btn-sm" id="scene-zoom">크게 보기</button></div>'
        + '<p class="view-desc"><b style="color:var(--graphite)">'+esc(v.label)+'</b> — '+esc(v.desc)+'</p>';
      $('#scene-ask').addEventListener('click', function(){ askWith(s); });
      $('#scene-zoom').addEventListener('click', function(){ var list=scenesOf(s.view); var items=[{src:M.imgSrc(v.real), title:v.label+' · 빈 홀', cap:'비어 있는 홀입니다. 이어지는 장면들과 같은 자리입니다.', tag:''}].concat(M.sceneItems(list)); M.openLightbox(items, list.indexOf(s)+1); });
    }

    // 비교 슬라이더 — 포인터로 끌기 + 키보드(range)
    var dragging=false;
    function fromEvent(e){ var r=ba.getBoundingClientRect(); return (e.clientX-r.left)/r.width*100; }
    ba.addEventListener('pointerdown', function(e){ if(e.button!==undefined && e.button!==0) return; dragging=true; try{ ba.setPointerCapture(e.pointerId); }catch(_){} setPos(fromEvent(e)); });
    ba.addEventListener('pointermove', function(e){ if(dragging) setPos(fromEvent(e)); });
    ['pointerup','pointercancel','lostpointercapture'].forEach(function(t){ ba.addEventListener(t, function(){ dragging=false; }); });
    range.addEventListener('input', function(){ setPos(+range.value); });

    // 장면 모아보기 (목적별 필터 + 라이트박스)
    var grid=$('#scene-grid'), filter=$('#scene-filter'), note=$('#scene-note');
    var cats=PUR.filter(function(p){ return SC.some(function(s){ return s.purpose===p.id; }); });
    filter.innerHTML='<button type="button" class="chip on" data-p="">전체<span class="n">'+SC.length+'</span></button>'+cats.map(function(p){ var n=SC.filter(function(s){return s.purpose===p.id;}).length; return '<button type="button" class="chip" data-p="'+p.id+'">'+esc(p.label)+'<span class="n">'+n+'</span></button>'; }).join('');
    var shown=SC.slice();
    function renderGrid(pid){
      shown=SC.filter(function(s){ return !pid||s.purpose===pid; });
      grid.innerHTML=shown.map(function(s,k){ return '<button type="button" class="tile" data-k="'+k+'" aria-label="'+esc(s.title)+' 크게 보기"><img src="'+M.imgSrc(s.id,'t')+'" srcset="'+M.imgSrc(s.id,'t')+' 480w, '+M.imgSrc(s.id,'m')+' 960w" sizes="(min-width:1100px) 300px, (min-width:760px) 33vw, 50vw" alt="메가스팟 건대 — '+esc(s.title)+'" loading="lazy"><span class="lab">'+esc(purLabel[s.purpose]||'')+'<b>'+esc(s.title)+'</b></span></button>'; }).join('');
      $$('.chip',filter).forEach(function(c){ var on=c.dataset.p===(pid||''); c.classList.toggle('on',on); c.setAttribute('aria-pressed',String(on)); });
    }
    filter.addEventListener('click', function(e){ var b=e.target.closest('.chip'); if(b) renderGrid(b.dataset.p); });
    grid.addEventListener('click', function(e){ var b=e.target.closest('.tile'); if(b) M.openLightbox(M.sceneItems(shown), +b.dataset.k); });
    if(note) note.textContent=window.MEGASPOT_SCENE_NOTE||'';

    // 다른 페이지에서 ?scene=s04 로 들어오면 그 장면부터 보여 줍니다
    var q=new URLSearchParams(location.search).get('scene');
    selectView(VIEWS[0].id); renderGrid(''); setPos(50);
    if(q && window.MEGASPOT_SCENE(q)) selectScene(q);
  })();

  /* 장면 → 예약 신청 연결 */
  function askWith(s){
    var est=M.pricing&&M.pricing.estimator; if(est&&s.purpose) est.set({purpose:s.purpose});
    var b=$('#estimate'); if(b) b.scrollIntoView({behavior:'smooth', block:'start'});
    M.toast('‘'+s.title+'’ 기준으로 모임 유형을 예약 신청 화면에 넣었습니다.');
  }

  /* ---------- 시설·장비 ---------- */
  (function(){
    if(!F||!$('#fac-tabs')) return;
    var cats=[]; F.guide.forEach(function(g){ if(cats.indexOf(g.cat)<0) cats.push(g.cat); });
    var tabs=$('#fac-tabs'), panel=$('#fac-panel');
    tabs.innerHTML='<button type="button" class="on" data-cat="*" role="tab">전체 안내</button>'+cats.map(function(c){ return '<button type="button" data-cat="'+esc(c)+'" role="tab">'+esc(c)+'</button>'; }).join('');
    function badge(b){ if(/사용자|운영자/.test(b)) return '<span class="badge badge-ok">운영자 확인</span>'; if(/도면/.test(b)) return '<span class="badge badge-cobalt">도면 확인</span>'; if(/사진/.test(b)) return '<span class="badge badge-soft">사진 확인</span>'; return '<span class="badge badge-soft">'+esc(b)+'</span>'; }
    function render(cat){
      var rows=F.guide.filter(function(g){ return cat==='*'||g.cat===cat; }).map(function(g){ return '<tr><td class="k">'+esc(g.item)+'<div class="tiny muted" style="font-weight:400">'+esc(g.cat)+'</div></td><td>'+esc(g.desc)+'</td><td>'+badge(g.basis.replace('사용자','운영자'))+'</td><td class="small muted">'+esc(g.note||'—')+'</td></tr>'; }).join('');
      panel.innerHTML='<div class="tbl-wrap"><table class="tbl"><thead><tr><th>항목</th><th>안내 내용</th><th>확인 기준</th><th>제공 조건·참고</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    }
    tabs.addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; $$('button',tabs).forEach(function(x){x.classList.toggle('on',x===b);}); render(b.dataset.cat); });
    render('*');
    // 전체 목록
    var tbody=$('#fac-table tbody'), search=$('#fac-search'), count=$('#fac-count');
    function statusBadge(st){ if(/구비 확인/.test(st)) return '<span class="badge badge-ok">구비 확인</span>'; if(/제공 조건/.test(st)) return '<span class="badge badge-warn">제공 조건 확인</span>'; if(/운영자용/.test(st)) return '<span class="badge badge-soft">운영자용</span>'; if(/명칭/.test(st)) return '<span class="badge badge-soft">명칭·용도 확인</span>'; return '<span class="badge badge-soft">'+esc(st)+'</span>'; }
    function renderAll(q){
      q=(q||'').trim();
      var rows=F.full.filter(function(r){ if(!q) return true; return (r.name+r.cat+r.spec+r.use+r.memo).indexOf(q)>=0; });
      tbody.innerHTML=rows.map(function(r){ return '<tr><td class="tiny muted">'+r.code+'</td><td class="small">'+esc(r.cat)+'</td><td class="k">'+esc(r.name)+'</td><td>'+(r.qty!=null?r.qty+' '+esc(r.unit):'<span class="muted">미확정</span>')+'</td><td class="small">'+esc(r.spec)+'</td><td class="small">'+esc(r.use)+'</td><td class="small">'+esc(r.basis.replace('사용자','운영자'))+'</td><td>'+statusBadge(r.status)+'</td><td class="small muted">'+esc(r.memo||'—')+'</td></tr>'; }).join('');
      count.textContent=rows.length+' / '+F.full.length+'개 항목';
    }
    search.addEventListener('input', function(){ renderAll(search.value); }); renderAll('');
    $('#pending-count').textContent='('+F.updated+' 기준)';
    var cats2=[]; F.pending.forEach(function(p){ if(cats2.indexOf(p.cat)<0) cats2.push(p.cat); });
    $('#pending-list').innerHTML=cats2.map(function(c){ return '<span class="tag">'+esc(c)+'</span>'; }).join('');
  })();

  /* ---------- 이용 안내 / 요금 / 접근 ---------- */
  (function(){
    var flow=$('#flow'); if(flow) flow.innerHTML=S.booking.flow.map(function(f,i){ var d=['시간·날짜·인원을 골라 금액을 확인하고 이름·연락처만 적어 신청합니다. 접수번호가 바로 나오고, 카카오톡·전화로 알려 주셔도 됩니다.','신청한 날짜·시간이 비어 있는지 확인하고 빠르게 연락드립니다. 영업시간에는 보통 2시간 안에 첫 답을 드립니다.','공간료·인원 추가·옵션을 항목별로 나눈 확정 금액과 보증금·환불 기준, 결제 방법(카드·계좌이체)을 안내합니다.','결제가 끝나면 예약번호가 발급되고 날짜가 확정됩니다. 패키지 시간이면 온라인 이용권으로 바로 결제할 수도 있습니다.','확정 조건과 현장 준비 목록을 보내고, 이용 전 최종 인원·배치·음식·장비·반입을 다시 확인합니다.','입장·피난 동선, 화면·음향·장비 사용법을 안내하고 행사를 진행합니다. 예약한 시간 안에 준비·행사·정리를 마칩니다.','기본 정리와 파손·오염, 부착물 제거 여부를 확인한 뒤 보증금을 돌려 드리고, 완료된 예약에 후기 작성 권한을 드립니다.'][i]||''; return '<li class="step"><div class="n">'+(i+1)+'</div><h4>'+esc(f)+'</h4><p>'+esc(d)+'</p></li>'; }).join('');
    var chips=$('#slot-chips'); if(chips) chips.innerHTML=S.booking.slots.map(function(s){ return '<span class="tag">'+esc(s.label)+' '+esc(s.time)+'</span>'; }).join('');
    var rn=$('#response-note'); if(rn) rn.textContent=S.booking.response;
    var rules=$('#rules'); if(rules) rules.innerHTML=S.rules.map(function(r){ return '<div><dt>'+esc(r.k)+'</dt><dd>'+esc(r.d)+'</dd></div>'; }).join('');
    var ac=$('#access-list'); if(ac) ac.innerHTML=[['주소',S.address],['대중교통',S.access.transit],['주차',S.access.parking],['엘리베이터',S.access.elevator],['현장 안내',S.access.note]].map(function(r){ return '<div><dt>'+r[0]+'</dt><dd>'+esc(r[1])+'</dd></div>'; }).join('');
    var cp=$('#copy-address'); if(cp) cp.addEventListener('click', function(){ (navigator.clipboard?navigator.clipboard.writeText(S.address):Promise.reject()).then(function(){ M.toast('주소를 복사했습니다.'); }).catch(function(){ M.toast(S.address); }); });
  })();

  /* ---------- 달력 (예약 신청 화면과 연결) ---------- */
  (function(){
    var grid=$('#booking-grid'); if(!grid) return;
    function layout(e){ grid.style.gridTemplateColumns=e.matches?'minmax(320px,1.1fr) minmax(0,.9fr)':'1fr'; } var mq=window.matchMedia('(min-width:900px)'); layout(mq); mq.addEventListener('change', layout);
  })();
  (function(){
    var cal=$('#calendar'); if(!cal) return;
    var today=new Date(); today.setHours(0,0,0,0);
    var cur=new Date(today.getFullYear(), today.getMonth(), 1), selected=null, cache={};
    function load(y,m){
      var key=y+'-'+M.pad2(m+1); if(cache[key]) return Promise.resolve(cache[key]);
      var from=key+'-01', to=y+'-'+M.pad2(m+1)+'-'+M.pad2(new Date(y,m+1,0).getDate());
      return M.api('/availability?space='+S.id+'&from='+from+'&to='+to).then(function(r){ cache[key]=r.days||{}; return cache[key]; }).catch(function(){ cache[key]={}; return cache[key]; });
    }
    function render(){
      var y=cur.getFullYear(), m=cur.getMonth();
      load(y,m).then(function(days){
        var first=new Date(y,m,1).getDay(), n=new Date(y,m+1,0).getDate();
        var h='<div class="cal-head"><button type="button" id="cal-prev" aria-label="이전 달">‹</button><b>'+y+'년 '+(m+1)+'월</b><button type="button" id="cal-next" aria-label="다음 달">›</button></div><div class="cal-grid">';
        ['일','월','화','수','목','금','토'].forEach(function(d){ h+='<div class="dow">'+d+'</div>'; });
        for(var i=0;i<first;i++) h+='<div class="cal-day pad"></div>';
        for(var d=1; d<=n; d++){
          var iso=y+'-'+M.pad2(m+1)+'-'+M.pad2(d); var dt=new Date(y,m,d); var info=days[iso]||{}; var cls='cal-day ';
          if(dt<today) cls+='past'; else if(info.state==='full') cls+='full'; else if(info.state==='hold') cls+='hold'; else cls+='open';
          if(selected===iso) cls+=' sel';
          h+='<div class="'+cls+'" data-d="'+iso+'" role="button" tabindex="'+(dt<today||info.state==='full'?'-1':'0')+'" aria-label="'+M.fmtKDate(iso)+(info.state==='full'?' 마감':info.state==='hold'?' 임시 확보':' 문의 가능')+'">'+d+(info.state?'<span class="dot"></span>':'')+'</div>';
        }
        h+='</div><div class="cal-legend"><span><i style="background:var(--concrete-3);border:1px solid var(--concrete)"></i>문의 가능 (호스트 확인 필요)</span><span><i style="background:var(--warn-soft)"></i>임시 확보 중</span><span><i style="background:var(--concrete-2)"></i>마감</span><span><i style="background:var(--cobalt)"></i>선택한 날짜</span></div>';
        h+='<p class="tiny muted mt-2">'+(M.demo.on||!Object.keys(days).length?'달력은 안내용이며 실시간 재고가 아닙니다. 희망일을 고르면 예약 신청 화면에 들어가고, 확정 여부는 상담 때 안내합니다.':'표시 상태는 운영자가 갱신한 일정 기준이며 최종 확정은 금액 확인과 결제 뒤에 이뤄집니다.')+'</p>';
        cal.innerHTML=h;
        $('#cal-prev').addEventListener('click', function(){ cur=new Date(y,m-1,1); render(); });
        $('#cal-next').addEventListener('click', function(){ cur=new Date(y,m+1,1); render(); });
        $('#cal-prev').disabled = (y===today.getFullYear()&&m===today.getMonth());
        cal.querySelectorAll('.cal-day.open,.cal-day.hold').forEach(function(el){ function pick(){ selected=el.dataset.d; var est=M.pricing&&M.pricing.estimator; if(est) est.setDate(selected); render(); M.toast(M.fmtKDate(selected)+'을(를) 예약 신청 화면에 넣었습니다.'); var box=$('#estimate'); if(box) box.scrollIntoView({behavior:'smooth',block:'start'}); } el.addEventListener('click', pick); el.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); } }); });
      });
    }
    M.checkApi().then(render);
  })();

  /* ---------- 후기 ---------- */
  (function(){
    var list=$('#review-list'), form=$('#review-form'); if(!list) return;
    var rvType=$('#rv-type'); if(rvType){ rvType.insertAdjacentHTML('beforeend', (window.MEGASPOT_PURPOSES||[]).map(function(p){ return '<option>'+esc(p.label)+'</option>'; }).join('')+'<option>기타</option>'); }
    function stars(n){ var s=''; for(var i=1;i<=5;i++) s+= i<=n?'★':'☆'; return s; }
    function renderList(items){
      if(!items||!items.length){
        list.innerHTML='<div class="empty"><b>아직 등록된 이용 후기가 없습니다</b>첫 행사가 끝나면 이용 확인 후기부터 차례로 게시합니다. 후기는 광고 문구가 아니라 다음 주최자가 참고할 실제 기록으로 운영합니다.</div>'
          +'<div class="card mt-2"><div class="eyebrow">Review policy</div><h3 class="mt-1">후기 게시 기준</h3><ul class="meta mt-1" style="display:grid;gap:6px"><li>이용 완료가 확인된 예약에만 작성 권한을 드립니다.</li><li>\'이용 확인\' 표시는 예약·이용 사실을 확인했다는 뜻이며 내용 전체의 정확성을 보증하지 않습니다.</li><li>비판적인 후기도 같은 기준으로 게시하고, 운영자 답변과 이용자의 이의 제기 경로를 제공합니다.</li><li>개인정보 노출·허위 주장·권리침해 신고는 근거와 처리 이력을 남깁니다.</li><li>후기 작성을 조건으로 좋은 평가를 요구하지 않습니다.</li></ul></div>';
        return;
      }
      list.innerHTML=items.map(function(r){ return '<div class="review mb-2"><div class="rh"><div><b>'+esc(r.author)+'</b> <span class="badge badge-ok" style="margin-left:6px">이용 확인</span></div><span class="small muted">'+esc((r.event_type||'')+(r.headcount?' · '+r.headcount+'명':'')+(r.used_at?' · '+r.used_at:''))+'</span></div><div class="stars" aria-label="만족도 '+r.rating+'점">'+stars(+r.rating)+'</div><h3 style="font-size:16px;margin:6px 0">'+esc(r.title)+'</h3><div class="rb">'+esc(r.body)+'</div>'+(r.reply?'<div class="reply"><b>운영자 답변</b><br>'+esc(r.reply)+'</div>':'')+'</div>'; }).join('');
    }
    M.api('/reviews?space='+S.id).then(function(r){ renderList(r.reviews||[]); }).catch(function(){ renderList([]); });
    if(form){
      form.addEventListener('submit', function(e){
        e.preventDefault(); var msg=$('#review-msg'); msg.hidden=true;
        if(!M.validate(form)) return;
        var d=M.formData(form); d.space_id=S.id;
        M.api('/reviews',{method:'POST', body:d}).then(function(){ msg.textContent='후기가 접수되었습니다. 예약 확인 후 게시되며, 게시되면 문자로 알려드립니다.'; msg.hidden=false; form.reset(); })
        .catch(function(ex){ if(ex.code==='NO_API'){ msg.textContent='지금은 후기 저장 기능이 연결되어 있지 않습니다. 이용 후 안내 문자에 포함된 링크나 운영팀 이메일로 보내 주시면 같은 기준으로 게시합니다.'; } else { msg.textContent=ex.message||'접수에 실패했습니다.'; } msg.hidden=false; });
      });
    }
  })();
})();
