/* 입점 신청(/host/register/) — ① 공간 기본 정보(입점 기준 바로 확인) ② 호스트 계정 ③ 완료 → 호스트센터에서 요금·사진·소개 작성 */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, $$=M.$$, esc=M.esc, P=S.P, form=$('#ap-form'); if(!form) return;
  var KEY='ms_host_apply_v1';
  if(S.hostIn()){ location.replace('/host/center/#add'); return; }   // 이미 로그인한 호스트는 호스트센터에서 공간 추가
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
  function msg(el, t){ el.textContent=t; el.hidden=!t; }
  $('#ap-next').addEventListener('click', function(){
    var b=basic(), m=$('#ap-msg1'); msg(m,'');
    if(!M.validate(form.querySelector('[data-step="1"]'))) return;
    if(!+b.capacity && !+b.area) return msg(m, '최대 인원이나 면적 중 하나는 적어 주세요.');
    if(!tier()) return msg(m, '50명 이상 이용할 수 있거나 50평 이상인 공간만 입점할 수 있습니다.');
    if(!b.types.length) return msg(m, '공간 유형을 한 가지 이상 골라 주세요.');
    show(2); setTimeout(function(){ $('#ap-host').focus(); }, 300);
  });
  $('#ap-prev').addEventListener('click', function(){ show(1); });
  form.addEventListener('submit', function(e){
    e.preventDefault(); var m=$('#ap-msg2'); msg(m,'');
    if(!M.validate(form.querySelector('[data-step="2"]'))) return;
    var f=form.elements; if(f.password.value.length<8) return msg(m, '비밀번호는 8자 이상으로 정해 주세요.');
    var btn=$('#ap-submit'); btn.disabled=true; btn.textContent='신청하는 중…';
    M.api('/hosts/signup', { method:'POST', body:{ email:f.email.value.trim(), password:f.password.value, name:f.host_name.value.trim(), phone:f.phone.value, company:f.company.value.trim(), website:f.website.value,
      agree_terms:f.agree_terms.checked, agree_privacy:f.agree_privacy.checked, agree_marketing:f.agree_marketing.checked, space:basic() } }).then(function(r){
      try{ localStorage.removeItem(KEY); }catch(x){}
      $('#ap-done-text').innerHTML='<b>'+esc(basic().name)+'</b> · '+esc(S.tierLabel(r.tier))+' · 신청번호 '+esc(r.space);
      $('#ap-go').href='/host/center/#space='+encodeURIComponent(r.space);
      show(3);
    }).catch(function(x){
      msg(m, x.code==='NO_API'?'지금은 신청을 받을 수 없습니다. 잠시 후 다시 시도하거나 카카오톡으로 알려 주세요.':x.message);
      if(x.code==='TOO_SMALL') show(1);
    }).finally(function(){ btn.disabled=false; btn.textContent='입점 신청하기'; });
  });
})();
