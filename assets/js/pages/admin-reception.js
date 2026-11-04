/* 테이블·박스·도시락 케이터링: 고객 페이지와 같은 코스별 계산기를 사용합니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT,C=window.MEGASPOT_RECEPTION_CALC;
  if(!X||!M||!C)return;
  var $=M.$,esc=M.esc,state={target:null,dirty:false,busy:false,request:0,initialized:false};
  function config(){return {course:$('#ar-course').value,format:$('#ar-format').value,people:$('#ar-people').value,status:$('#ar-status').value,note:$('#ar-note').value.trim()};}
  function target(){return {ref:state.target?state.target.ref:'',customer:$('#ar-customer').value.trim(),phone:$('#ar-phone').value.trim(),date:$('#ar-date').value,space:$('#ar-space').value};}
  function validTarget(){return !!state.target && $('#ar-ref').value.trim().toUpperCase()===state.target.ref && ['삭제됨','대기 취소','취소·환불'].indexOf(state.target.status)<0;}
  function error(e){if(!X.guard(e))X.note($('#ar-msg'),e.message||'처리하지 못했습니다.');}
  function busy(on){state.busy=on;$('#ar-form').querySelectorAll('input,select,textarea,button').forEach(function(el){el.disabled=on;});paint();}
  function paint(){
    var q=C.quote($('#ar-people').value,$('#ar-format').value,$('#ar-course').value), cancelled=$('#ar-status').value==='cancelled', box=$('#ar-result');
    ['#ar-customer','#ar-phone','#ar-date','#ar-space'].forEach(function(s){$(s).disabled=state.busy||!!state.target;});
    $('#ar-save').disabled=state.busy||!validTarget()||(!q.ok&&!($('#ar-status').value!=='confirmed'&&C.selection(config())));
    $('#ar-to-quote').disabled=state.busy||!q.ok||cancelled;
    $('#ar-copy').disabled=!q.ok||cancelled;$('#ar-open').hidden=!state.target;
    $('#ar-target').textContent=state.target?state.target.ref+' · '+(state.target.name||'')+' · '+X.spaceName(state.target.space_id)+(state.dirty?' · 변경 내용 미저장':'')+' — 고객·행사 정보 수정은 문의 상세에서 해 주세요.':'문의 없이 계산하거나, 문의를 불러와 그 건에 저장할 수 있습니다.';
    var menuCourse=C.course($('#ar-course').value);$('#ar-menu').textContent=(menuCourse?menuCourse.menus.join(' · '):'코스를 선택하면 메뉴를 표시합니다.')+'\n\n'+C.data.menuNote;
    if(!q.ok){box.innerHTML='<h2>케이터링 견적</h2><p role="status">'+esc(cancelled?'취소 · 합계 제외':($('#ar-status').value==='pending'&&C.selection(config())?'상담 후 견적 · 금액 미정':q.message))+'</p>';return;}
    box.innerHTML='<h2>'+esc(q.formatName)+'</h2><div class="cc-total"><span>'+(cancelled?'취소 구성 · 합계 제외':esc(q.courseName)+' 예상 금액')+'<small>부가세 10% 포함</small></span><b>'+C.won(q.total)+'</b></div>'
      +'<table class="q-table"><tbody><tr><td>'+esc(q.courseName)+' '+q.people+'명<small>1인 '+C.won(q.unitPrice)+'</small></td><td>'+C.won(q.food)+'</td></tr><tr><td>'+esc(q.feeName)+'<small>'+esc(q.feeLabel)+'</small></td><td data-ar-fee>'+C.won(q.fee)+'</td></tr><tr><td>공급가액 (부가세 별도)</td><td data-ar-supply>'+C.won(q.supply)+'</td></tr><tr><td>부가세 10%</td><td data-ar-vat>'+C.won(q.vat)+'</td></tr></tbody><tfoot><tr><td>합계</td><td data-ar-total>'+C.won(q.total)+'</td></tr></tfoot></table>'
      +'<p class="tiny muted">테이블 세팅은 철수 비용까지 포함합니다. 메뉴와 출장·세팅비는 부가세 별도이고 위 합계에 부가세 10%를 반영했습니다. 최소 주문 조건은 최종 견적에서 확인하며, 공간 대관료와 반환 보증금은 별도입니다.</p><p class="small muted">'+esc(C.data.menuNote)+'</p>';
  }
  function load(ref){
    ref=String(ref||'').trim().toUpperCase();
    if(!/^[A-Z0-9-]{4,20}$/.test(ref)){X.note($('#ar-msg'),'문의번호를 확인해 주세요.');return Promise.resolve(false);}
    if(state.dirty&&!confirm('저장하지 않은 케이터링 변경 내용을 바꾸고 문의를 불러올까요?'))return Promise.resolve(false);
    var request=++state.request;$('#ar-load').disabled=true;
    return X.A('/inquiries/'+encodeURIComponent(ref)).then(function(r){
      if(request!==state.request)return false;
      var it=r.item,d=it.data||{},saved=C.fromInquiry(d);state.target=it;state.dirty=false;
      $('#ar-ref').value=it.ref;$('#ar-customer').value=d.name||it.name||'';$('#ar-phone').value=d.phone||it.phone||'';$('#ar-date').value=d.date||it.event_date||'';$('#ar-space').value=it.space_id==='megaspot-gundae-2'?it.space_id:'megaspot-gundae';
      $('#ar-course').value=saved?saved.course:'classic';$('#ar-format').value=saved?saved.format:'table';$('#ar-people').value=saved?(saved.people||''):(it.headcount||50);$('#ar-status').value=saved&&saved.status||'pending';$('#ar-note').value=saved&&saved.note||'';
      $('#ar-msg').hidden=true;paint();return true;
    }).catch(function(e){if(request===state.request)error(e);return false;}).finally(function(){if(request===state.request)$('#ar-load').disabled=false;});
  }
  $('#ar-course').innerHTML='<option value="all">상담 후 결정</option>'+C.data.courses.map(function(c){return '<option value="'+esc(c.id)+'"'+(c.id==='classic'?' selected':'')+'>'+esc(c.name)+' · 1인 '+C.won(c.price)+'</option>';}).join('');
  $('#ar-load').addEventListener('click',function(){load($('#ar-ref').value);});
  $('#ar-ref').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();load(this.value);}});
  $('#ar-ref').addEventListener('input',function(){++state.request;$('#ar-load').disabled=false;if(state.target&&this.value.trim().toUpperCase()!==state.target.ref)state.target=null;paint();});
  $('#ar-form').addEventListener('submit',function(e){e.preventDefault();});
  $('#ar-form').addEventListener('input',function(e){if(e.target.id!=='ar-ref')state.dirty=true;paint();});
  $('#ar-form').addEventListener('change',function(e){if(e.target.id!=='ar-ref')state.dirty=true;paint();});
  $('#ar-save').addEventListener('click',function(){
    if(state.busy||!validTarget())return;var ref=state.target.ref,body=config();if(!C.quote(body.people,body.format,body.course).ok&&!(body.status!=='confirmed'&&C.selection(body)))return;
    busy(true);X.A('/inquiries/'+encodeURIComponent(ref),{method:'PATCH',body:{reception:body,reception_revision:C.revision(state.target.data)}}).then(function(r){state.target.data=Object.assign({},state.target.data,{reception:r.reception,reception_revision:r.reception_revision});state.dirty=false;X.note($('#ar-msg'),'문의 '+ref+'에 케이터링을 저장했습니다. 문의 상세의 공간·식음료 요약에도 반영됩니다. 케이터링 구성이 바뀐 예약은 예약확정서를 다시 발급해 주세요.',true);M.toast('케이터링 구성을 저장했습니다.');}).catch(error).finally(function(){busy(false);});
  });
  $('#ar-to-quote').addEventListener('click',function(){
    if(state.busy)return;var input=config(),q=C.quote(input.people,input.format,input.course);if(!q.ok||input.status==='cancelled')return;
    if($('#ar-ref').value.trim()&&!validTarget()){X.note($('#ar-msg'),'문의 불러오기를 먼저 눌러 연결할 고객을 확인해 주세요.');return;}
    var context=target();busy(true);X.receptionToQuote(context,input,q).then(function(added){if(added)state.dirty=false;}).catch(error).finally(function(){busy(false);});
  });
  $('#ar-copy').addEventListener('click',function(){var cfg=config();M.copy(C.customerText(cfg.people,cfg.format,cfg.course)+(cfg.note?'\n\n요청·안내: '+cfg.note:'')).then(function(ok){M.toast(ok?'고객 안내문을 복사했습니다.':'복사하지 못했습니다.');});});
  $('#ar-open').addEventListener('click',function(){if(state.target)X.openInquiry(state.target.ref);});
  window.addEventListener('beforeunload',function(e){if(state.dirty){e.preventDefault();e.returnValue='';}});
  X.openReception=function(ref,context){
    if(state.busy){M.toast('케이터링 저장이 끝난 뒤 다시 열어 주세요.');return;}
    if(!ref){
      if(state.dirty&&!confirm('작성 중인 케이터링을 바꾸고 이 견적 조건을 불러올까요?'))return;
      context=context||{};var saved=context.reception||{};state.target=null;state.dirty=false;++state.request;$('#ar-ref').value='';
      $('#ar-customer').value=context.customer||'';$('#ar-phone').value=context.phone||'';$('#ar-date').value=context.date||'';$('#ar-space').value=context.space||'megaspot-gundae';$('#ar-people').value=saved.people||context.people||50;$('#ar-course').value=saved.course||'classic';$('#ar-format').value=saved.format||'table';$('#ar-status').value=saved.status||'pending';$('#ar-note').value=saved.note||'';$('#ar-msg').hidden=true;
    }
    state.initialized=true;state.opening=true;X.go('reception');state.opening=false;if(ref)load(ref);
  };
  X.register('reception',function(){paint();if(state.opening)return;if(state.target&&!state.dirty&&!state.busy){load(state.target.ref);return;}if(!state.initialized){state.initialized=true;var ref=X.quoteInquiryRef();if(ref)load(ref);}});
  window.addEventListener('food-pricing-updated',function(e){if(e.detail.service!=='reception')return;var selected=$('#ar-course').value;$('#ar-course').innerHTML='<option value="all">상담 후 결정</option>'+C.data.courses.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.name)+' · 1인 '+C.won(c.price)+'</option>';}).join('');$('#ar-course').value=selected;paint();});
  paint();if(X.visible()&&X.current()==='reception')X.go('reception');
})();
