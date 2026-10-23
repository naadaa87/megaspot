/* 공간 등록 신청 — 6단계 입력 · 단계별 확인 · 이 브라우저에 임시 저장 · 접수 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc;
  var form=$('#rg-form'); if(!form) return;
  var DRAFT='ms_space_draft', steps=$$('.rg-step', form), cur=0;
  var REG=(window.MEGASPOT_REGIONS||[]).concat([{ id:'etc', label:'그 밖의 지역' }]);
  $('#rg-region').insertAdjacentHTML('beforeend', REG.map(function(r){ return '<option value="'+r.id+'">'+esc(r.label)+'</option>'; }).join(''));
  function checks(id, name, list){ $('#'+id).innerHTML=(list||[]).map(function(x){ return '<label class="chk"><input type="checkbox" name="'+name+'" value="'+esc(x.id)+'"> '+esc(x.label)+'</label>'; }).join(''); }
  checks('rg-purposes','purposes', window.MEGASPOT_PURPOSES); checks('rg-features','features', window.MEGASPOT_FEATURES); checks('rg-themes','themes', window.MEGASPOT_THEMES);

  // 임시 저장 불러오기 (연락처·동의는 저장하지 않습니다)
  var SKIP={ website:1, agree_info:1, agree_privacy:1, phone:1, email:1 };
  function save(){ try{ var o=M.formData(form); Object.keys(SKIP).forEach(function(k){ delete o[k]; }); localStorage.setItem(DRAFT, JSON.stringify({ t:Date.now(), step:cur, v:o })); $('#rg-saved').textContent='이 브라우저에 임시 저장됨'; }catch(e){} }
  function restore(){
    var d=null; try{ d=JSON.parse(localStorage.getItem(DRAFT)||'null'); }catch(e){}
    if(!d || !d.v || Date.now()-(d.t||0)>30*864e5) return;
    Object.keys(d.v).forEach(function(k){ var v=d.v[k], els=form.querySelectorAll('[name="'+k+'"]'); Array.prototype.forEach.call(els, function(el){
      if(el.type==='checkbox'||el.type==='radio') el.checked=[].concat(v).indexOf(el.value)>=0; else el.value=v; }); });
    $('#rg-saved').textContent='지난번에 쓰던 내용을 불러왔습니다';
  }
  restore();
  var op=new URLSearchParams(location.search).get('operation'); if(op){ var r=form.querySelector('input[name=operation][value="'+op+'"]'); if(r) r.checked=true; }

  function show(i){
    cur=Math.max(0, Math.min(steps.length-1, i));
    steps.forEach(function(s,n){ s.hidden=n!==cur; });
    $$('#rg-steps li').forEach(function(li,n){ li.classList.toggle('on', n===cur); li.classList.toggle('done', n<cur); });
    $('#rg-prev').hidden=cur===0; $('#rg-next').hidden=cur===steps.length-1; $('#rg-submit').hidden=cur!==steps.length-1;
    $('#rg-msgbox').hidden=true;
    var top=$('#rg-steps').getBoundingClientRect().top+window.scrollY-110; if(window.scrollY>top) window.scrollTo({ top:top, behavior:'smooth' });
  }
  $('#rg-next').addEventListener('click', function(){ if(!M.validate(steps[cur])){ var m=$('#rg-msgbox'); m.textContent='이 단계의 필수 항목을 채워 주세요.'; m.hidden=false; return; } save(); show(cur+1); });
  $('#rg-prev').addEventListener('click', function(){ show(cur-1); });
  $('#rg-steps').addEventListener('click', function(e){ var li=e.target.closest('li'); if(!li) return; var i=$$('#rg-steps li').indexOf(li); if(i<cur) show(i); });
  var st=null; form.addEventListener('input', function(){ clearTimeout(st); st=setTimeout(save, 600); });
  form.addEventListener('change', function(){ clearTimeout(st); st=setTimeout(save, 300); });
  $('#rg-phone').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });

  form.addEventListener('submit', function(e){
    e.preventDefault(); var msg=$('#rg-msgbox'); msg.hidden=true;
    // 앞 단계의 필수 항목도 다시 확인합니다
    for(var i=0;i<steps.length;i++){ steps[i].hidden=false; var ok=M.validate(steps[i]); steps[i].hidden=i!==cur; if(!ok){ show(i); msg.textContent=(i+1)+'단계의 필수 항목을 채워 주세요.'; msg.hidden=false; M.validate(steps[i]); return; } }
    var d=M.formData(form); d.kind='space'; ['purposes','features','themes'].forEach(function(k){ d[k]=[].concat(d[k]||[]); });
    var btn=$('#rg-submit'); btn.disabled=true; btn.textContent='보내는 중…';
    M.api('/host',{ method:'POST', body:d }).then(function(r){
      try{ localStorage.removeItem(DRAFT); }catch(_){}
      form.hidden=true; $('#rg-steps').hidden=true;
      var box=$('#rg-done'); box.hidden=false;
      box.innerHTML='<div class="card mn-done"><div class="eyebrow">Received</div><h2 class="h-m mt-1">공간 등록 신청을 받았습니다</h2><p class="mt-2">접수번호 <b class="ref">'+esc(r.ref)+'</b> · 운영팀이 내용을 검토하고 영업일 기준 3일 안에 연락드립니다. 사진·도면 파일이 더 있다면 접수번호와 함께 카카오톡이나 이메일('+esc(M.CONFIG.email)+')로 보내 주세요.</p>'
        +'<ol class="mt-steps mt-3"><li><b>검토</b><span>규모·배치·허용 행사가 입점 기준에 맞는지 확인합니다.</span></li><li><b>보완·현장 확인</b><span>필요하면 추가 자료를 요청하거나 방문해 실제 조건을 확인합니다.</span></li><li><b>상세 페이지 검토 후 공개</b><span>정리한 상세 페이지를 함께 보고, 계약 조건을 맞춘 뒤 공개합니다.</span></li></ol>'
        +'<div class="row mt-3" style="gap:10px"><a class="btn btn-light" href="/host/">호스트 안내로 돌아가기</a>'+(M.CONFIG.kakaoChannel?'<a class="btn btn-kakao" href="'+esc(M.CONFIG.kakaoChannel)+'" target="_blank" rel="noopener">카카오톡으로 사진 보내기</a>':'')+'</div></div>';
      window.scrollTo({ top:box.getBoundingClientRect().top+window.scrollY-120, behavior:'smooth' });
    }).catch(function(ex){
      if(ex.code==='NO_API'){
        var text='[메가스팟 공간 등록 신청]\n공간: '+(d.space_name||'')+'\n주소: '+(d.address||'')+' '+(d.floor||'')+'\n면적: '+(d.area||'-')+'평 / 최대 '+(d.capacity||'-')+'명 / '+(d.space_type||'')+'\n요금: '+(d.price_base||'-')+'\n담당: '+(d.name||'')+' / '+(d.phone||'')+' / '+(d.email||'')+'\n소개: '+(d.intro||'-');
        msg.innerHTML='<b>지금은 서버 저장이 연결되지 않아 자동 접수가 되지 않습니다.</b> 아래 버튼으로 이메일을 보내 주시면 같은 절차로 검토합니다. 적은 내용은 이 브라우저에 남아 있습니다.<div class="row mt-2"><a class="btn btn-dark btn-sm" href="mailto:'+M.CONFIG.email+'?subject='+encodeURIComponent('[메가스팟 공간 등록 신청] '+(d.space_name||''))+'&body='+encodeURIComponent(text)+'">이메일로 보내기</a></div>';
      } else msg.textContent=ex.message||'보내지 못했습니다. 잠시 후 다시 시도해 주세요.';
      msg.hidden=false;
    }).finally(function(){ btn.disabled=false; btn.innerHTML='공간 등록 신청 보내기 <span class="arrow">→</span>'; });
  });
  show(0);
})();
