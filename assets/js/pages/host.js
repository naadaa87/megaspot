/* 입점 상담(/host/) · 광고·제휴 문의(/advertise/) — form[data-kind] 를 /api/host 로 보냅니다 */
(function(){
  var M=window.MEGASPOT, $=M.$, esc=M.esc;
  var LABEL={ host:'입점 상담', ad:'광고·제휴 문의' }, DONE={ host:'입점 상담 신청이', ad:'광고·제휴 문의가' };
  Array.prototype.forEach.call(document.querySelectorAll('form[data-kind]'), function(form){
    var kind=form.getAttribute('data-kind'); if(kind==='space') return;   // 공간 등록 신청은 host-register.js
    var msg=form.querySelector('.form-note');
    var ph=form.querySelector('input[type=tel]'); if(ph) ph.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });
    form.addEventListener('submit', function(e){
      e.preventDefault(); msg.hidden=true;
      if(!M.validate(form)){ msg.textContent='필수 항목을 확인해 주세요.'; msg.hidden=false; return; }
      var d=M.formData(form); d.kind=kind; d.features=[].concat(d.features||[]); d.slots=[].concat(d.slots||[]);
      var btn=form.querySelector('button[type=submit]'); btn.disabled=true;
      M.api('/host',{method:'POST', body:d}).then(function(r){
        form.querySelectorAll('input,select,textarea').forEach(function(el){ if(el.type==='checkbox'||el.type==='radio') el.checked=el.defaultChecked; else if(el.type!=='hidden') el.value=''; });
        msg.innerHTML='<b>'+DONE[kind]+' 접수되었습니다.</b> 접수번호 '+esc(r.ref)+' · '+(kind==='ad'?'영업일 기준 2일 안에 담당자가 연락드립니다.':'적합성 검토 후 영업일 기준 3일 안에 연락드립니다.'); msg.hidden=false; msg.scrollIntoView({behavior:'smooth',block:'center'});
      }).catch(function(ex){
        if(ex.code==='NO_API'){
          var text='['+LABEL[kind]+']\n'+Object.keys(d).filter(function(k){ return d[k] && ['kind','website','agree_privacy'].indexOf(k)<0; }).map(function(k){ return k+': '+[].concat(d[k]).join(', '); }).join('\n');
          msg.innerHTML='<b>지금은 서버 저장이 연결되지 않아 자동 접수가 되지 않습니다.</b> 아래 버튼으로 이메일을 보내 주시면 같은 절차로 확인합니다.<div class="row mt-2"><a class="btn btn-dark btn-sm" href="mailto:'+M.CONFIG.email+'?subject='+encodeURIComponent('[메가스팟 '+LABEL[kind]+'] '+(d.space_name||d.company||''))+'&body='+encodeURIComponent(text)+'">이메일로 보내기</a>'+(M.CONFIG.kakaoChannel?'<a class="btn btn-kakao btn-sm" href="'+esc(M.CONFIG.kakaoChannel)+'" target="_blank" rel="noopener">카카오톡 문의</a>':'')+'<a class="btn btn-light btn-sm" href="tel:'+M.CONFIG.phone.replace(/-/g,'')+'">전화 상담</a></div>';
        } else { msg.textContent=ex.message||'전송에 실패했습니다.'; }
        msg.hidden=false;
      }).finally(function(){ btn.disabled=false; });
    });
  });
})();
