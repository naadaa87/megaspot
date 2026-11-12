/* 공간 찾기 — 지역 · 인원 · 날짜로 직영 공간과 입점 호스트 공간을 함께 찾습니다.
   직영: assets/js/data/spaces.js · 입점 호스트: /api/venues/search · 기존 등록 공간(문의형): /api/listings/list */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, esc=M.esc, P=S.P, SP=window.MEGASPOT_SPACES||[];
  var form=$('#filters'); if(!form) return;
  var EMPTY_REGION='해당 지역에 등록된 공간이 아직 없습니다. 좋은 초대형 공간들이 곧 입점됩니다.';
  // 예전 주소(?purpose=…)로 들어오면 가장 가까운 공간 유형으로 바꿔 줍니다
  var PURPOSE_TYPE={ seminar:'seminar', workshop:'seminar', networking:'banquet', community:'hall', 'class':'seminar', culture:'concert', party:'partyroom', popup:'popup', shooting:'studio' };
  // 직영 공간·기존 등록 공간은 목적으로 적혀 있어, 같은 뜻의 공간 유형으로 읽습니다
  var PURPOSE_TYPES={ seminar:['seminar','conference'], workshop:['seminar'], networking:['banquet'], community:['hall'], culture:['concert'], party:['partyroom','banquet'], popup:['popup'], shooting:['studio'] };
  function typesOf(purposes){ var o=[]; (purposes||[]).forEach(function(p){ (PURPOSE_TYPES[p]||[]).forEach(function(t){ if(o.indexOf(t)<0) o.push(t); }); }); return o; }
  function areaOf(region){ return /^seoul/.test(region||'')?'seoul':region==='incheon'?'incheon':region==='gyeonggi'?'gyeonggi':'etc'; }

  $('#f-region').insertAdjacentHTML('beforeend', S.opts(P.regions, ''));
  $('#f-type').insertAdjacentHTML('beforeend', P.typeGroups.map(function(g){ return '<optgroup label="'+esc(g.label)+'">'+S.opts(g.types, '')+'</optgroup>'; }).join(''));
  $('#f-date').min=S.today();

  // 주소 → 검색 조건
  var q=new URLSearchParams(location.search);
  (function(){
    var r=q.get('region'); if(r) form.elements.region.value=S.REG[r]?r:(/^seoul|^gyeonggi$|^incheon$/.test(r)?areaOf(r):'');
    var p=q.get('people'); if(/^[1-9]\d{0,4}$/.test(p||'')) form.elements.people.value=p;
    var d=q.get('date'); if(/^\d{4}-\d{2}-\d{2}$/.test(d||'') && d>=S.today()) form.elements.date.value=d;
    var t=q.get('type')||PURPOSE_TYPE[q.get('purpose')]||''; if(S.TYPE[t]) $('#f-type').value=t;
    if(q.get('sort')) $('#f-sort').value=q.get('sort'); if(q.get('fav')==='1') $('#f-fav').checked=true;
  })();

  var LST=[], HOST={ items:[], by_region:{}, ok:false }, DAY={}, seq=0;
  function state(){ var e=form.elements; return { region:e.region.value, people:+e.people.value||0, date:e.date.value, type:$('#f-type').value, sort:$('#f-sort').value, fav:$('#f-fav').checked }; }
  function direct(s){ return { kind:'direct', id:s.id, name:s.name, area:areaOf(s.region), cap:s.capacity.max, size:s.area.pyeong, types:typesOf(s.purposes), price:s.price?s.price.from:null, rank:s.status==='open'?4:s.status==='opening'?3:0, src:s }; }
  function legacy(l){ return { kind:'listing', id:l.id, name:l.name, area:areaOf(l.region), cap:+l.capacity||0, size:+l.area||0, types:typesOf(l.purposes), price:null, rank:1, src:l }; }
  function hosted(c, i){ return { kind:'host', id:c.id, name:c.name, area:c.region, cap:c.capacity||0, size:c.area||0, types:c.types||[], price:c.price_from, rank:2, order:i, src:c }; }
  function ok(s, st){
    if(st.region && s.area!==st.region) return false;
    if(st.people && s.cap<st.people) return false;
    if(st.type && s.types.indexOf(st.type)<0) return false;
    if(st.fav && !M.fav.has('space', s.id)) return false;
    return true;
  }
  function card(s, st){
    var html, note='';
    if(s.kind==='direct'){ html=M.spaceCard(s.src); var d=st.date&&DAY[s.id+'|'+st.date];
      if(d==='full') note='<p class="sp-daynote bad">고른 날짜는 예약이 마감되었습니다. 다른 날짜를 확인해 주세요.</p>';
      else if(d==='partial'||d==='hold') note='<p class="sp-daynote">고른 날짜에 예약된 시간대가 있습니다. 상세 화면에서 비어 있는 시간을 확인해 주세요.</p>'; }
    else if(s.kind==='host') html=S.venueCard(s.src);
    else html=M.listingCard(s.src);
    return '<div class="card-wrap">'+html+M.fav.button('space', s.id, s.name)+note+'</div>';
  }
  function counts(){
    var c={}; P.regions.forEach(function(r){ c[r[0]]=0; });
    SP.forEach(function(s){ c[areaOf(s.region)]++; }); LST.forEach(function(l){ c[areaOf(l.region)]++; });
    Object.keys(HOST.by_region||{}).forEach(function(k){ if(c[k]!=null) c[k]+=HOST.by_region[k]; });
    return c;
  }
  function render(){
    var st=state(), c=counts(), total=0; Object.keys(c).forEach(function(k){ total+=c[k]; });
    $('#region-chips').innerHTML='<button type="button" class="chip'+(st.region?'':' on')+'" data-region="">전체 <i>'+total+'</i></button>'+P.regions.map(function(r){
      return '<button type="button" class="chip'+(st.region===r[0]?' on':'')+(c[r[0]]?'':' dash')+'" data-region="'+r[0]+'">'+esc(r[1])+' <i>'+c[r[0]]+'</i></button>'; }).join('');
    var all=SP.map(direct).concat(HOST.items.map(hosted), LST.map(legacy)), list=all.filter(function(s){ return ok(s, st); });
    list.sort(function(a,b){
      if(st.sort==='cap') return b.cap-a.cap; if(st.sort==='area') return b.size-a.size;
      if(st.sort==='price') return (a.price==null)-(b.price==null) || (a.price||0)-(b.price||0);
      return b.rank-a.rank || (a.order||0)-(b.order||0) || b.cap-a.cap; });
    var html=list.map(function(s){ return card(s, st); });
    if(list.length) html.splice(Math.min(list.length, 2), 0, '<div class="ad-slot ad-in-grid" data-ad-slot="list-card"></div>');
    var box=$('#results'); box.innerHTML=html.join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-ad-slot]'), function(el){ if(M.ads) M.ads.render(el); });
    // 고른 날짜·인원을 상세 화면으로 넘깁니다
    var carry=new URLSearchParams(); if(st.date) carry.set('date', st.date); if(st.people) carry.set('people', st.people);
    if(carry.toString()) Array.prototype.forEach.call(box.querySelectorAll('a[data-venue]'), function(a){ a.href+='&'+carry.toString(); });
    // 결과 없음 — 그 지역에 등록된 공간이 하나도 없으면 따로 안내합니다
    var empty=$('#results-empty'), noRegion=!!st.region && !c[st.region] && !st.fav; empty.hidden=list.length>0;
    if(!list.length){
      var pl=new URLSearchParams(); if(st.region) pl.set('region', st.region); if(st.people) pl.set('people', st.people); if(st.date) pl.set('date', st.date);
      var plan='/planning/'+(pl.toString()?'?'+pl.toString():'');
      empty.innerHTML='<div class="empty">'+(noRegion
        ? '<b>'+esc(EMPTY_REGION)+'</b>'+(st.region==='etc'?'‘그 외 지역’은 공간이 늘어나는 대로 지역별로 나눌 예정입니다. ':'')+'다른 지역을 먼저 둘러보거나, 원하는 조건을 남겨 주시면 메가스팟이 맞는 공간을 찾아 연락드립니다.'
          +'<div class="row mt-3" style="justify-content:center"><button class="btn btn-primary" type="button" data-region="">전체 지역 보기</button><a class="btn btn-light" href="'+esc(plan)+'">조건 남기고 공간 추천받기</a><a class="btn btn-light" href="/host/">이 지역 공간 입점 안내</a></div>'
        : '<b>'+(st.fav?'찜한 공간이 없습니다':'조건에 맞는 공간이 없습니다')+'</b>'+(st.fav?'마음에 드는 공간의 하트를 눌러 두면 여기에서 모아 볼 수 있습니다.':'인원·날짜·유형 가운데 바꿀 수 있는 조건을 조정해 보세요. 조건을 그대로 두고 싶다면 메가스팟이 대신 찾아 드립니다.')
          +'<div class="row mt-3" style="justify-content:center"><a class="btn btn-primary" href="'+esc(plan)+'">조건 남기고 공간 추천받기</a><button class="btn btn-light" type="button" data-reset>조건 초기화</button></div>')+'</div>';
    }
    var nh=list.filter(function(s){ return s.kind!=='direct'; }).length, cond=[st.region?S.REG[st.region]:'', st.people?st.people+'명 이상':'', st.date?S.kdate(st.date):'', st.type?S.TYPE[st.type]:''].filter(Boolean).join(' · ');
    $('#result-count').textContent=list.length?(cond?cond+' — ':'')+list.length+'개 공간'+(nh?' (입점 호스트 '+nh+'곳 포함)':'')+(st.fav?' · 찜한 공간':''):'';
    var u=new URLSearchParams(); if(st.region) u.set('region', st.region); if(st.people) u.set('people', st.people); if(st.date) u.set('date', st.date); if(st.type) u.set('type', st.type); if(st.sort) u.set('sort', st.sort); if(st.fav) u.set('fav','1');
    history.replaceState(null, '', location.pathname+(u.toString()?'?'+u.toString():''));
  }
  // 입점 공간은 서버에서 지역·인원·날짜·유형으로 거릅니다 (호스트가 닫은 날짜 제외)
  function search(){
    var st=state(), my=++seq, p=new URLSearchParams();
    if(st.region) p.set('region', st.region); if(st.people) p.set('people', st.people); if(st.date) p.set('date', st.date); if(st.type) p.set('type', st.type); if(st.sort) p.set('sort', st.sort);
    render();
    M.api('/venues/search'+(p.toString()?'?'+p.toString():'')).then(function(j){ if(my!==seq) return; HOST={ items:j.items||[], by_region:j.by_region||{}, ok:true }; render(); }).catch(function(){ if(my===seq){ HOST.items=[]; render(); } });
    if(st.date) SP.forEach(function(s){ var key=s.id+'|'+st.date; if(DAY[key]!==undefined) return; DAY[key]='';
      M.api('/availability?space='+encodeURIComponent(s.id)+'&from='+st.date+'&to='+st.date).then(function(j){ DAY[key]=((j.days||{})[st.date]||{}).state||''; if(my===seq) render(); }).catch(function(){}); });
  }
  M.api('/listings/list').then(function(j){ LST=j.items||[]; if(LST.length) render(); }).catch(function(){});
  form.addEventListener('submit', function(e){ e.preventDefault(); search(); });
  form.addEventListener('change', search);
  ['f-type','f-sort','f-fav'].forEach(function(id){ $('#'+id).addEventListener('change', search); });
  $('#f-reset').addEventListener('click', reset);
  function reset(){ form.reset(); $('#f-type').value=''; $('#f-sort').value=''; $('#f-fav').checked=false; search(); }
  document.addEventListener('click', function(e){
    var r=e.target.closest('[data-region]'); if(r && (r.closest('#region-chips')||r.closest('#results-empty'))){ form.elements.region.value=r.getAttribute('data-region'); search(); return; }
    if(e.target.closest('#results-empty [data-reset]')) reset();
  });
  document.addEventListener('ms:fav', function(e){ var d=e.detail||{}; if(d.on && /^SP-/.test(d.id||'')) M.api('/venues/track', { method:'POST', body:{ ref:d.id, ev:'fav' } }).catch(function(){}); if($('#f-fav').checked) render(); });
  search();
})();
