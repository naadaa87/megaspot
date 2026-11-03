/* 테이블·박스·도시락 케이터링: 고객 페이지와 같은 클래식 계산기를 사용합니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT,C=window.MEGASPOT_RECEPTION_CALC;
  if(!X||!M||!C)return;
  var $=M.$,esc=M.esc,state={target:null,dirty:false,busy:false,request:0,initialized:false};
  function config(){return {course:'classic',format:$('#ar-format').value,people:$('#ar-people').value,status:$('#ar-status').value,note:$('#ar-note').value.trim()};}
  function target(){return {ref:state.target?state.target.ref:'',customer:$('#ar-customer').value.trim(),phone:$('#ar-phone').value.trim(),date:$('#ar-date').value,space:$('#ar-space').value};}
  function validTarget(){return !!state.target && $('#ar-ref').value.trim().toUpperCase()===state.target.ref && ['삭제됨','대기 취소','취소·환불'].indexOf(state.target.status)<0;}
  function error(e){if(!X.guard(e))X.note($('#ar-msg'),e.message||'처리하지 못했습니다.');}
  function busy(on){state.busy=on;$('#ar-form').querySelectorAll('input,select,textarea,button').forEach(function(el){el.disabled=on;});paint();}
  function paint(){
    var q=C.quote($('#ar-people').value,$('#ar-format').value), cancelled=$('#ar-status').value==='cancelled', box=$('#ar-result');
    ['#ar-customer','#ar-phone','#ar-date','#ar-space'].forEach(function(s){$(s).disabled=state.busy||!!state.target;});
    $('#ar-save').disabled=state.busy||!validTarget()||!q.ok;
    $('#ar-to-quote').disabled=state.busy||!q.ok||cancelled;
    $('#ar-copy').disabled=!q.ok||cancelled;$('#ar-open').hidden=!state.target;
    $('#ar-target').textContent=state.target?state.target.ref+' · '+(state.target.name||'')+' · '+X.spaceName(state.target.space_id)+(state.dirty?' · 변경 내용 미저장':'')+' — 고객·행사 정보 수정은 문의 상세에서 해 주세요.':'문의 없이 계산하거나, 문의를 불러와 그 건에 저장할 수 있습니다.';
    $('#ar-menu').textContent=C.data.course.menus.join(' · ')+'\n\n'+C.data.menuNote;
    if(!q.ok){box.innerHTML='<h2>케이터링 견적</h2><p role="status">'+esc(q.message)+'</p>';return;}
    box.innerHTML='<h2>'+esc(q.formatName)+'</h2><div class="cc-total"><span>'+(cancelled?'취소 구성 · 합계 제외':'클래식 예상 금액')+'<small>부가세 적용 여부 확인 전</small></span><b>'+C.won(q.total)+'</b></div>'
      +'<table class="q-table"><tbody><tr><td>클래식 '+q.people+'명<small>1인 '+C.won(q.unitPrice)+'</small></td><td>'+C.won(q.food)+'</td></tr><tr><td>'+esc(q.feeName)+'<small>'+esc(q.feeLabel)+'</small></td><td data-ar-fee>'+C.won(q.fee)+'</td></tr></tbody><tfoot><tr><td>합계</td><td data-ar-total>'+C.won(q.total)+'</td></tr></tfoot></table>'
      +'<p class="tiny muted">테이블 세팅은 철수 비용까지 포함합니다. 부가세·최소 주문 조건은 최종 견적에서 확인하며, 공간 대관료와 반환 보증금은 별도입니다.</p><p class="small muted">'+esc(C.data.menuNote)+'</p>';
  }
  function legacy(data){
    var text=String(data.message||'')+'\n'+String(data.summary||'');
    if(!/출장 케이터링 클래식|도시락·핑거푸드/.test(text))return null;
    var block=text.match(/\[출장 케이터링 클래식 상담\][\s\S]*?(?=\n\n|$)/), sample=block?block[0]:text;
    var people=sample.match(/· 인원: (\d+)명/)||sample.match(/클래식[^\n]*?· (\d+)명/);
    return {format:/테이블 세팅 케이터링/.test(sample)?'table':/박스 케이터링/.test(sample)?'box':/도시락 케이터링/.test(sample)?'lunchbox':'table',people:people?people[1]:50,status:'pending',note:''};
  }
  function load(ref){
    ref=String(ref||'').trim().toUpperCase();
    if(!/^[A-Z0-9-]{4,20}$/.test(ref)){X.note($('#ar-msg'),'문의번호를 확인해 주세요.');return Promise.resolve(false);}
    if(state.dirty&&!confirm('저장하지 않은 케이터링 변경 내용을 바꾸고 문의를 불러올까요?'))return Promise.resolve(false);
    var request=++state.request;$('#ar-load').disabled=true;
    return X.A('/inquiries/'+encodeURIComponent(ref)).then(function(r){
      if(request!==state.request)return false;
      var it=r.item,d=it.data||{},saved=d.reception||legacy(d);state.target=it;state.dirty=false;
      $('#ar-ref').value=it.ref;$('#ar-customer').value=d.name||it.name||'';$('#ar-phone').value=d.phone||it.phone||'';$('#ar-date').value=d.date||it.event_date||'';$('#ar-space').value=it.space_id==='megaspot-gundae-2'?it.space_id:'megaspot-gundae';
      $('#ar-format').value=saved&&saved.format||'table';$('#ar-people').value=saved&&saved.people||it.headcount||50;$('#ar-status').value=saved&&saved.status||'pending';$('#ar-note').value=saved&&saved.note||'';
      $('#ar-msg').hidden=true;paint();return true;
    }).catch(function(e){if(request===state.request)error(e);return false;}).finally(function(){if(request===state.request)$('#ar-load').disabled=false;});
  }
  $('#ar-load').addEventListener('click',function(){load($('#ar-ref').value);});
  $('#ar-ref').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();load(this.value);}});
  $('#ar-ref').addEventListener('input',function(){++state.request;$('#ar-load').disabled=false;if(state.target&&this.value.trim().toUpperCase()!==state.target.ref)state.target=null;paint();});
  $('#ar-form').addEventListener('submit',function(e){e.preventDefault();});
  $('#ar-form').addEventListener('input',function(e){if(e.target.id!=='ar-ref')state.dirty=true;paint();});
  $('#ar-form').addEventListener('change',function(){state.dirty=true;paint();});
  $('#ar-save').addEventListener('click',function(){
    if(state.busy||!validTarget())return;var ref=state.target.ref,body=config();if(!C.quote(body.people,body.format).ok)return;
    busy(true);X.A('/inquiries/'+encodeURIComponent(ref),{method:'PATCH',body:{reception:body}}).then(function(){state.dirty=false;X.note($('#ar-msg'),'문의 '+ref+'에 케이터링을 저장했습니다. 문의 상세의 공간·식음료 요약에도 반영됩니다. 이미 발급한 확정서의 금액이 바뀌었다면 다시 발급해 주세요.',true);M.toast('케이터링 구성을 저장했습니다.');}).catch(error).finally(function(){busy(false);});
  });
  $('#ar-to-quote').addEventListener('click',function(){
    if(state.busy)return;var input=config(),q=C.quote(input.people,input.format);if(!q.ok||input.status==='cancelled')return;
    if($('#ar-ref').value.trim()&&!validTarget()){X.note($('#ar-msg'),'문의 불러오기를 먼저 눌러 연결할 고객을 확인해 주세요.');return;}
    var context=target();busy(true);X.receptionToQuote(context,input,q).then(function(added){if(added)state.dirty=false;}).catch(error).finally(function(){busy(false);});
  });
  $('#ar-copy').addEventListener('click',function(){var cfg=config();M.copy(C.customerText(cfg.people,cfg.format)+(cfg.note?'\n\n요청·안내: '+cfg.note:'')).then(function(ok){M.toast(ok?'고객 안내문을 복사했습니다.':'복사하지 못했습니다.');});});
  $('#ar-open').addEventListener('click',function(){if(state.target)X.openInquiry(state.target.ref);});
  window.addEventListener('beforeunload',function(e){if(state.dirty){e.preventDefault();e.returnValue='';}});
  X.openReception=function(ref,context){
    if(state.busy){M.toast('케이터링 저장이 끝난 뒤 다시 열어 주세요.');return;}
    if(!ref){
      if(state.dirty&&!confirm('작성 중인 케이터링을 바꾸고 이 견적 조건을 불러올까요?'))return;
      context=context||{};state.target=null;state.dirty=false;++state.request;$('#ar-ref').value='';
      $('#ar-customer').value=context.customer||'';$('#ar-phone').value=context.phone||'';$('#ar-date').value=context.date||'';$('#ar-space').value=context.space||'megaspot-gundae';$('#ar-people').value=context.people||50;$('#ar-format').value='table';$('#ar-status').value='pending';$('#ar-note').value='';$('#ar-msg').hidden=true;
    }
    state.initialized=true;X.go('reception');if(ref)load(ref);
  };
  X.register('reception',function(){paint();if(!state.initialized){state.initialized=true;var ref=X.quoteInquiryRef();if(ref)load(ref);}});
  paint();if(X.visible()&&X.current()==='reception')X.go('reception');
})();
