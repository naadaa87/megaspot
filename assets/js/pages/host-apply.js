/* 호스트 등록(/host/register/) — 메가스팟 회원 계정으로 호스트 전환
   ① 회원 로그인(로그인 전이면 로그인·회원가입 안내만 보여 주고, 마치면 이 화면으로 돌아옵니다) ② 공간 기본 정보(입점 기준 바로 확인) ③ 담당자 확인 ④ 완료 → 호스트센터 */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, $$=M.$$, esc=M.esc, P=S.P, form=$('#ap-form'); if(!form) return;
  var KEY='ms_host_apply_v1';
  if(S.hostIn()){ location.replace('/host/center/#add'); return; }   // 이미 호스트센터에 들어와 있으면 공간 추가로
  $('#ap-region').innerHTML=S.opts(P.regions, '', '지역 선택');
  $('#ap-types').innerHTML=S.typePicker([]);
  // 쓰던 내용 되살리기 (연락처·비밀번호는 저장하지 않습니다)
  try{ var d=JSON.parse(localStorage.getItem(KEY)||'null'); if(d && Date.now()-d.t<7*864e5){ ['name','region','address','capacity','area'].forEach(function(k){ if(d[k]) form.elements[k].value=d[k]; });
    (d.types||[]).forEach(function(t){ var el=form.querySelector('[data-types] input[value="'+t+'"]'); if(el) el.checked=true; }); } }catch(e){}
  S.bindTypes(form);
  function basic(){ return { name:form.elements.name.value.trim(), region:form.elements.region.value, address:form.elements.address.value.trim(), capacity:form.elements.capacity.value, area:form.elements.area.value, types:S.readTypes(form) }; }
  function keep(){ try{ var b=basic(); b.t=Date.now(); localStorage.setItem(KEY, JSON.stringify(b)); }catch(e){} }
  function tier(){
    var b=basic(), box=$('#ap-tier'), cap=+b.capacity||0, area=+b.area||0, t=S.tierOf(cap, area);
    box.className='ap-tier'+(t?' ok':(cap||area)?' no':'');
    if(!cap && !area) box.textContent='최대 인원이나 면적을 적어 주세요. 50명 이상이거나 50평 이상이면 입점할 수 있습니다.';
    else if(t) box.innerHTML=S.tierBadge(t)+' <b>'+esc(S.tierLabel(t))+'</b>으로 입점할 수 있습니다. '+(t==='mega'?'100명 이상 또는 100평 이상 기준을 채웠습니다.':'50명 이상 또는 50평 이상 기준을 채웠습니다.');
    else box.textContent='메가스팟은 50명 이상 이용할 수 있거나 50평 이상인 공간만 입점할 수 있습니다. 인원과 면적을 다시 확인해 주세요.';
    $('#ap-region-note').hidden=b.region!=='etc';
    return t;
  }
  form.addEventListener('input', function(){ tier(); keep(); }); form.addEventListener('change', function(){ tier(); keep(); }); tier();
  var ph=$('#ap-phone'); ph.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{1,4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });
  function show(n){
    $$('.ap-panel', form).forEach(function(p){ p.hidden=p.getAttribute('data-step')!==String(n); });
    $$('#ap-steps li').forEach(function(li, i){ li.className=i<n?'done':i===n?'on':''; });   // 첫 칸은 회원 로그인(이미 끝남)
    window.scrollTo({ top:form.getBoundingClientRect().top+window.scrollY-110, behavior:'smooth' });
  }
  function msg(el, t, html){ if(html) el.innerHTML=t; else el.textContent=t; el.hidden=!t; }

  // 계정 상태: 로그인 전이면 로그인·회원가입 안내만, 회원이면 그 계정으로 등록, 이미 호스트면 호스트센터로
  function gate(){ $('#ap-gate').hidden=false; form.hidden=true; $$('#ap-steps li').forEach(function(li, i){ li.className=i===0?'on':''; }); }
  function memberMode(m){
    $('#ap-gate').hidden=true; form.hidden=false; $$('#ap-steps li').forEach(function(li, i){ li.className=i===0?'done':i===1?'on':''; });
    $('#ap-mem-email').textContent=m.email+(m.name?' ('+m.name+')':'');
    if(!form.elements.host_name.value) form.elements.host_name.value=m.name||'';
    if(!form.elements.phone.value && m.phone){ form.elements.phone.value=m.phone; ph.dispatchEvent(new Event('input')); }
    $('#ap-title').textContent='호스트로 전환하기';
    $('#ap-lead').textContent=(m.name?m.name+'님의 ':'')+'메가스팟 회원 계정으로 공간을 등록합니다. 공간 기본 정보만 적으면 바로 호스트센터가 열리고, 고객 화면과 호스트센터를 같은 계정으로 오갈 수 있습니다.';
  }
  if(!M.account.loggedIn()) gate();
  else {   // 로그인 확인이 끝날 때까지 안내·입력 칸을 모두 숨겨 둡니다 (깜빡임 방지)
    $('#ap-gate').hidden=true;
    M.api('/hosts/status').then(function(st){
      if(st.host){ location.replace('/host/center/'); return; }
      if(!st.member) return gate();
      return M.account.me().then(function(m){ if(m) memberMode(m); else gate(); });
    }).catch(function(){ gate(); });
  }
  $('#ap-switch-acc').addEventListener('click', function(e){ e.preventDefault(); M.account.logout().then(function(){ location.reload(); }); });

  $('#ap-next').addEventListener('click', function(){
    var b=basic(), m=$('#ap-msg1'); msg(m,'');
    if(!M.validate(form.querySelector('[data-step="1"]'))) return;
    if(!+b.capacity && !+b.area) return msg(m, '최대 인원이나 면적 중 하나는 적어 주세요.');
    if(!tier()) return msg(m, '50명 이상 이용할 수 있거나 50평 이상인 공간만 입점할 수 있습니다.');
    if(!b.types.length) return msg(m, '공간 유형을 한 가지 이상 골라 주세요.');
    show(2); setTimeout(function(){ $('#ap-host').focus(); }, 300);
  });
  $('#ap-prev').addEventListener('click', function(){ show(1); });

  function hostSignup(f){
    return M.api('/hosts/signup', { method:'POST', body:{ member:true, name:f.host_name.value.trim(), phone:f.phone.value, company:f.company.value.trim(), website:f.website.value,
      agree_terms:f.agree_terms.checked, agree_privacy:f.agree_privacy.checked, agree_marketing:f.agree_marketing.checked, space:basic() } });
  }
  form.addEventListener('submit', function(e){
    e.preventDefault(); var m=$('#ap-msg2'), f=form.elements; msg(m,'');
    if(!M.validate(form.querySelector('[data-step="2"]'))) return;
    if(!f.agree_terms.checked || !f.agree_privacy.checked) return msg(m, '이용약관과 개인정보 수집·이용에 동의해 주세요.');
    var btn=$('#ap-submit'); btn.disabled=true; btn.textContent='등록하는 중…';
    hostSignup(f).then(function(r){
      try{ localStorage.removeItem(KEY); }catch(x){}
      $('#ap-done-text').innerHTML='<b>'+esc(basic().name)+'</b> · '+esc(S.tierLabel(r.tier))+' · 등록번호 '+esc(r.space);
      $('#ap-go').href='/host/center/#space='+encodeURIComponent(r.space);
      show(3);
    }).catch(function(x){
      if(x.code==='LOGIN_REQUIRED'){ gate(); return; }
      if(x.code==='ALREADY_HOST'){ location.replace('/host/center/'); return; }
      if(x.code==='HOST_EMAIL_TAKEN') return msg(m, esc(x.message)+' <a class="pf-link" href="/host/login/">호스트센터 로그인</a>', true);
      msg(m, x.code==='NO_API'?'지금은 등록을 받을 수 없습니다. 잠시 후 다시 시도하거나 카카오톡으로 알려 주세요.':x.message);
      if(x.code==='TOO_SMALL') show(1);
    }).finally(function(){ btn.disabled=false; btn.textContent='호스트 등록하기'; });
  });
})();
