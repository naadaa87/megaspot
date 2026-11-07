/* 공간 찾기 — 필터 + 결과 */
(function(){
  var M=window.MEGASPOT, $=M.$, esc=M.esc;
  var SP=window.MEGASPOT_SPACES||[], PUR=window.MEGASPOT_PURPOSES||[], REG=window.MEGASPOT_REGIONS||[], FEA=window.MEGASPOT_FEATURES||[], THE=window.MEGASPOT_THEMES||[];
  var form=$('#filters'); if(!form) return;

  // 옵션 채우기
  $('#f-region').insertAdjacentHTML('beforeend', REG.map(function(r){ return '<option value="'+r.id+'">'+esc(r.label)+(r.active?'':' — 준비 중')+'</option>'; }).join(''));
  $('#f-purpose').insertAdjacentHTML('beforeend', PUR.map(function(p){ return '<option value="'+p.id+'">'+esc(p.label)+'</option>'; }).join(''));
  $('#f-features').innerHTML = FEA.map(function(f){ return '<label class="chk"><input type="checkbox" name="feature" value="'+f.id+'"> '+esc(f.label)+'</label>'; }).join('');
  $('#f-themes').innerHTML = THE.map(function(t){ return '<label class="chk"><input type="checkbox" name="theme" value="'+t.id+'"> '+esc(t.label)+'</label>'; }).join('');
  $('#region-tags').innerHTML = REG.map(function(r){ return '<span class="tag'+(r.active?' on':'')+'">'+esc(r.label)+(r.active?' · 운영 중':' · 준비 중')+'</span>'; }).join('');

  // URL → 폼
  var q=new URLSearchParams(location.search);
  ['region','people','purpose'].forEach(function(k){ if(q.get(k)){ var el=form.elements[k]; if(!el) return; var v=q.get(k);
    // 전달받은 인원을 그대로 유지합니다. 선택지 밖의 인원도 작은 값으로 줄이지 않습니다.
    if(k==='people' && el.tagName==='SELECT'){if(!/^[1-9]\d{0,4}$/.test(v))v='';else if(!Array.prototype.some.call(el.options,function(o){return o.value===v;})){var option=document.createElement('option');option.value=v;option.textContent=v+'명';el.appendChild(option);}}
    el.value=v; } });
  q.getAll('feature').forEach(function(v){ var el=form.querySelector('input[name=feature][value="'+v+'"]'); if(el) el.checked=true; });
  q.getAll('theme').forEach(function(v){var el=form.querySelector('input[name=theme][value="'+v+'"]');if(el)el.checked=true;});
  if(q.get('fav')==='1')$('#f-fav').checked=true;
  var advanced=$('#filter-advanced');if(advanced&&(q.getAll('feature').length||q.getAll('theme').length))advanced.open=true;

  var LST=[];   // 관리자가 공개한 외부 호스트 공간 (/api/listings/list)
  function state(){
    var d=M.formData(form);
    return { region:d.region||'', people:+d.people||0, purpose:d.purpose||'', features:[].concat(d.feature||[]), themes:[].concat(d.theme||[]), sort:d.sort||'', fav:!!d.fav };
  }
  // 직영 공간(s)과 등록 공간(l)을 같은 모양으로 맞춰 거릅니다
  function norm(x, kind){
    if(kind==='direct') return { kind:kind, id:x.id, region:x.region, cap:x.capacity.max, area:x.area.pyeong, purposes:x.purposes||[], features:x.features||[], themes:x.themes||[], rank:x.status==='open'?3:x.status==='opening'?2:0, src:x };
    return { kind:kind, id:x.id, region:x.region, cap:+x.capacity||0, area:+x.area||0, purposes:x.purposes||[], features:x.features||[], themes:x.themes||[], rank:1, src:x };
  }
  function match(s, st){
    if(st.region && s.region!==st.region) return false;
    if(st.people && s.cap < st.people) return false;
    if(st.purpose && s.purposes.indexOf(st.purpose)<0) return false;
    for(var i=0;i<st.features.length;i++){ if(s.features.indexOf(st.features[i])<0) return false; }
    for(var j=0;j<st.themes.length;j++){ if(s.themes.indexOf(st.themes[j])<0) return false; }
    if(st.fav && !M.fav.has('space', s.id)) return false;
    return true;
  }
  function render(){
    var st=state();
    var all=SP.map(function(s){ return norm(s,'direct'); }).concat(LST.map(function(l){ return norm(l,'listing'); }));
    var list=all.filter(function(s){ return match(s,st); });
    // 추천순: 운영 중(직영) → 오픈 예정(사전 예약) → 등록 공간(문의형) → 준비 중, 같은 단계면 인원 큰 순
    list.sort(function(a,b){ if(st.sort==='cap') return b.cap-a.cap; if(st.sort==='area') return b.area-a.area; return b.rank-a.rank || b.cap-a.cap; });
    var html=list.map(function(s){ var card=s.kind==='direct'?M.spaceCard(s.src):M.listingCard(s.src); return '<div class="card-wrap">'+card+M.fav.button('space', s.id, s.src.name)+'</div>'; });
    if(list.length) html.splice(Math.min(list.length, 2), 0, '<div class="ad-slot ad-in-grid" data-ad-slot="list-card"></div>');
    $('#results').innerHTML=html.join('');
    Array.prototype.forEach.call($('#results').querySelectorAll('[data-ad-slot]'), function(el){ M.ads.render(el); });
    $('#results-empty').hidden = list.length>0;
    var nl=list.filter(function(s){ return s.kind==='listing'; }).length;
    $('#result-count').textContent = list.length ? list.length+'개 공간'+(nl?' (외부 호스트 '+nl+'곳 포함)':'')+(st.fav?' · 찜한 공간':'') : (st.fav?'찜한 공간이 없습니다':'조건에 맞는 공간이 없습니다');
    if(advanced){var selected=st.features.length+st.themes.length;advanced.querySelector('summary').textContent='시설·분위기 조건 더 보기'+(selected?' · '+selected+'개 선택':'');}
    // 맞춤 요청 링크에 조건 전달
    var p=new URLSearchParams({mode:'request'}); if(st.purpose) p.set('purpose',st.purpose); if(st.people) p.set('people',st.people); if(st.region) p.set('region',st.region);
    $('#empty-request').href='/inquiry/?'+p.toString();
    // URL 동기화
    var u=new URLSearchParams(); if(st.region) u.set('region',st.region); if(st.people) u.set('people',st.people); if(st.purpose) u.set('purpose',st.purpose); st.features.forEach(function(f){ u.append('feature',f); });st.themes.forEach(function(t){u.append('theme',t);});if(st.fav)u.set('fav','1'); if(st.sort) u.set('sort',st.sort);
    history.replaceState(null,'', location.pathname+(u.toString()?'?'+u.toString():''));
  }
  if(q.get('sort')) $('#f-sort').value=q.get('sort');
  document.addEventListener('ms:fav', function(){ if($('#f-fav').checked) render(); });
  M.api('/listings/list').then(function(j){ LST=j.items||[]; if(LST.length) render(); }).catch(function(){});
  form.addEventListener('submit', function(e){ e.preventDefault(); render(); });
  form.addEventListener('change', render);
  form.addEventListener('reset', function(){ setTimeout(render,0); });
  $('#empty-reset').addEventListener('click', function(){ form.reset(); setTimeout(render,0); });
  render();
})();
