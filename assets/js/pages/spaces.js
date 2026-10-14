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
    // 인원은 보기 중에서 가장 가까운(같거나 큰) 값으로 맞춥니다 (예: 60 → 80명 안팎)
    if(k==='people' && el.tagName==='SELECT'){ var n=parseInt(v,10)||0, opts=Array.prototype.slice.call(el.options).map(function(o){ return +o.value; }).filter(Boolean).sort(function(a,b){ return a-b; }); var pick=opts.filter(function(o){ return o>=n; })[0]||opts[opts.length-1]; if(n) v=String(pick); }
    el.value=v; } });
  q.getAll('feature').forEach(function(v){ var el=form.querySelector('input[name=feature][value="'+v+'"]'); if(el) el.checked=true; });

  function state(){
    var d=M.formData(form);
    return { region:d.region||'', people:+d.people||0, purpose:d.purpose||'', features:[].concat(d.feature||[]), themes:[].concat(d.theme||[]) };
  }
  function match(s, st){
    if(st.region && s.region!==st.region) return false;
    if(st.people && s.capacity.max < st.people) return false;
    if(st.purpose && s.purposes.indexOf(st.purpose)<0) return false;
    for(var i=0;i<st.features.length;i++){ if(s.features.indexOf(st.features[i])<0) return false; }
    for(var j=0;j<st.themes.length;j++){ if(s.themes.indexOf(st.themes[j])<0) return false; }
    return true;
  }
  function render(){
    var st=state();
    var list=SP.filter(function(s){ return match(s,st); });
    // 정렬: 운영 중 → 직영 → 인원 큰 순 (직영 우대가 아니라 상태·확인도 기준임을 안내)
    list.sort(function(a,b){ return (b.status==='open')-(a.status==='open') || b.capacity.max-a.capacity.max; });
    $('#results').innerHTML=list.map(function(s){ return M.spaceCard(s); }).join('');
    $('#results-empty').hidden = list.length>0;
    $('#result-count').textContent = list.length ? list.length+'개 공간 · 상태와 확인 범위 순으로 표시합니다' : '조건에 맞는 공간이 없습니다';
    // 맞춤 요청 링크에 조건 전달
    var p=new URLSearchParams({mode:'request'}); if(st.purpose) p.set('purpose',st.purpose); if(st.people) p.set('people',st.people); if(st.region) p.set('region',st.region);
    $('#empty-request').href='/inquiry/?'+p.toString();
    // URL 동기화
    var u=new URLSearchParams(); if(st.region) u.set('region',st.region); if(st.people) u.set('people',st.people); if(st.purpose) u.set('purpose',st.purpose); st.features.forEach(function(f){ u.append('feature',f); });
    history.replaceState(null,'', location.pathname+(u.toString()?'?'+u.toString():''));
  }
  form.addEventListener('submit', function(e){ e.preventDefault(); render(); });
  form.addEventListener('change', render);
  form.addEventListener('reset', function(){ setTimeout(render,0); });
  $('#empty-reset').addEventListener('click', function(){ form.reset(); setTimeout(render,0); });
  render();
})();
