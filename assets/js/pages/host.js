/* 호스트 입점 문의 */
(function(){
  var M=window.MEGASPOT, $=M.$;
  var form=$('#host-form'); if(!form) return;
  form.querySelector('#h-phone').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });
  form.addEventListener('submit', function(e){
    e.preventDefault(); var msg=$('#host-msg'); msg.hidden=true;
    if(!M.validate(form)){ msg.textContent='필수 항목을 확인해 주세요.'; msg.hidden=false; return; }
    var d=M.formData(form); d.features=[].concat(d.features||[]);
    var btn=form.querySelector('button[type=submit]'); btn.disabled=true;
    M.api('/host',{method:'POST', body:d}).then(function(r){
      form.querySelectorAll('input,select,textarea').forEach(function(el){ if(el.type!=='checkbox') el.value=''; else el.checked=false; });
      msg.innerHTML='<b>입점 문의가 접수되었습니다.</b> 접수번호 '+M.esc(r.ref)+' · 적합성 검토 후 영업일 기준 3일 안에 연락드립니다.'; msg.hidden=false; msg.scrollIntoView({behavior:'smooth',block:'center'});
    }).catch(function(ex){
      if(ex.code==='NO_API'){
        var text='[메가스팟 입점 문의]\n공간: '+(d.space_name||'')+'\n주소: '+(d.address||'')+'\n면적: '+(d.area||'-')+'평 / 최대 '+(d.capacity||'-')+'명 / '+(d.space_type||'-')+'\n시설: '+(d.features.join(', ')||'-')+'\n운영 권한: '+(d.role||'')+'\n예약 채널: '+(d.channels||'-')+'\n담당: '+(d.name||'')+' / '+(d.phone||'')+' / '+(d.email||'')+'\n링크: '+(d.link||'-')+'\n메모: '+(d.message||'-');
        msg.innerHTML='<b>지금은 서버 저장이 연결되지 않아 자동 접수가 되지 않습니다.</b> 아래 버튼으로 이메일을 보내 주시면 같은 절차로 검토합니다.<div class="row mt-2"><a class="btn btn-dark btn-sm" href="mailto:'+M.CONFIG.email+'?subject='+encodeURIComponent('[메가스팟 입점 문의] '+(d.space_name||''))+'&body='+encodeURIComponent(text)+'">이메일로 보내기</a>'+(M.CONFIG.kakaoChannel?'<a class="btn btn-kakao btn-sm" href="'+M.esc(M.CONFIG.kakaoChannel)+'" target="_blank" rel="noopener">카카오톡 문의</a>':'')+'<a class="btn btn-light btn-sm" href="tel:'+M.CONFIG.phone.replace(/-/g,'')+'">전화 상담</a></div>';
      } else { msg.textContent=ex.message||'전송에 실패했습니다.'; }
      msg.hidden=false;
    }).finally(function(){ btn.disabled=false; });
  });
})();
