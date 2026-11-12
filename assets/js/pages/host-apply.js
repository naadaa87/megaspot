/* 호스트 등록(/host/register/) — 메가스팟 회원 계정으로 호스트 전환
   ① 공간 기본 정보(입점 기준 바로 확인) ② 계정 확인: 회원으로 로그인해 있으면 그 계정으로, 아니면 회원가입과 호스트 등록을 한 번에 ③ 완료 → 호스트센터 */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, $$=M.$$, esc=M.esc, P=S.P, form=$('#ap-form'); if(!form) return;
  var KEY='ms_host_apply_v1', MODE='guest';
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
    $$('#ap-steps li').forEach(function(li, i){ li.className=i+1<n?'done':i+1===n?'on':''; });
    window.scrollTo({ top:form.getBoundingClientRect().top+window.scrollY-110, behavior:'smooth' });
  }
  function msg(el, t, html){ if(html) el.innerHTML=t; else el.textContent=t; el.hidden=!t; }

  // 계정 상태: 회원으로 로그인해 있으면 그 계정으로 등록, 이미 호스트면 호스트센터로
  function memberMode(m){
    MODE='member'; $('#ap-member').hidden=false; $('#ap-guest').hidden=true; $('#ap-age-row').hidden=true;
    $('#ap-mem-email').textContent=m.email+(m.name?' ('+m.name+')':'');
    if(!form.elements.host_name.value) form.elements.host_name.value=m.name||'';
    if(!form.elements.phone.value && m.phone){ form.elements.phone.value=m.phone; ph.dispatchEvent(new Event('input')); }
    $('#ap-title').textContent='호스트로 전환하기';
    $('#ap-lead').textContent=(m.name?m.name+'님의 ':'')+'메가스팟 회원 계정으로 공간을 등록합니다. 공간 기본 정보만 적으면 바로 호스트센터가 열리고, 고객 화면과 호스트센터를 같은 계정으로 오갈 수 있습니다.';
  }
  function guestMode(){ MODE='guest'; $('#ap-member').hidden=true; $('#ap-guest').hidden=false; $('#ap-age-row').hidden=false; }
  guestMode();
  if(M.account.loggedIn()){
    M.api('/hosts/status').then(function(st){
      if(st.host){ location.replace('/host/center/'); return; }
      if(st.member) return M.account.me().then(function(m){ if(m) memberMode(m); });
    }).catch(function(){});
  }
  $('#ap-switch-acc').addEventListener('click', function(e){ e.preventDefault(); M.account.logout().then(function(){ location.reload(); }); });

  $('#ap-next').addEventListener('click', function(){
    var b=basic(), m=$('#ap-msg1'); msg(m,'');
    if(!M.validate(form.querySelector('[data-step="1"]'))) return;
    if(!+b.capacity && !+b.area) return msg(m, '최대 인원이나 면적 중 하나는 적어 주세요.');
    if(!tier()) return msg(m, '50명 이상 이용할 수 있거나 50평 이상인 공간만 입점할 수 있습니다.');
    if(!b.types.length) return msg(m, '공간 유형을 한 가지 이상 골라 주세요.');
    show(2); setTimeout(function(){ (MODE==='guest'?$('#ap-email'):$('#ap-host')).focus(); }, 300);
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
    var first;
    if(MODE==='guest'){
      var email=f.email.value.trim(), pw=f.password.value;
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msg(m, '이메일 주소를 확인해 주세요.');
      if(pw.length<8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return msg(m, '비밀번호는 8자 이상, 영문과 숫자를 함께 넣어 주세요.');
      if(!f.agree_age.checked) return msg(m, '만 14세 이상만 가입할 수 있습니다.');
      // ① 회원가입 → ② 그 회원 계정으로 호스트 등록
      first=M.api('/auth/signup', { method:'POST', body:{ email:email, password:pw, name:f.host_name.value.trim(), phone:f.phone.value, org:f.company.value.trim(), website:f.website.value,
        agree_terms:true, agree_privacy:true, agree_age:true, agree_marketing:f.agree_marketing.checked } }).then(function(r){ if(r && r.member) memberMode(r.member); });
    } else first=Promise.resolve();
    var btn=$('#ap-submit'); btn.disabled=true; btn.textContent='등록하는 중…';
    first.then(function(){ return hostSignup(f); }).then(function(r){
      try{ localStorage.removeItem(KEY); }catch(x){}
      $('#ap-done-text').innerHTML='<b>'+esc(basic().name)+'</b> · '+esc(S.tierLabel(r.tier))+' · 등록번호 '+esc(r.space);
      $('#ap-go').href='/host/center/#space='+encodeURIComponent(r.space);
      show(3);
    }).catch(function(x){
      if(x.code==='EMAIL_TAKEN') return msg(m, '이미 가입한 이메일입니다. <a class="pf-link" href="/login/?next=/host/register/">로그인</a>하면 그 계정으로 이어서 등록할 수 있습니다.', true);
      if(x.code==='ALREADY_HOST'){ location.replace('/host/center/'); return; }
      if(x.code==='HOST_EMAIL_TAKEN') return msg(m, esc(x.message)+' <a class="pf-link" href="/host/login/">호스트센터 로그인</a>', true);
      msg(m, x.code==='NO_API'?'지금은 등록을 받을 수 없습니다. 잠시 후 다시 시도하거나 카카오톡으로 알려 주세요.':x.message);
      if(x.code==='TOO_SMALL') show(1);
    }).finally(function(){ btn.disabled=false; btn.textContent='호스트 등록하기'; });
  });
})();
