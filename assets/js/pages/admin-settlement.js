/* 수납·환불 원본을 보존하고 사유와 함께 정정·취소합니다. 실제 이체는 실행하지 않습니다. */
(function(){
 'use strict';
 var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT,S=window.MEGASPOT_SETTLEMENT;if(!X||!M||!S)return;
 var dialog=document.createElement('dialog');dialog.className='rf-modal';dialog.id='payment-dialog';
 dialog.innerHTML='<div class="rf-modal-head"><h2 id="payment-title">이용료 수납·정산</h2><button class="btn btn-light btn-sm" type="button" id="payment-close">닫기</button></div><div class="rf-modal-body"><p class="small muted">페이앱 결제·취소는 자동 기록되므로 수기 기록에 다시 추가하지 않아도 됩니다. 별도로 받은 이용료 또는 완료한 계좌 환불을 기록하세요. 반환 보증금은 별도입니다. 잘못 입력한 기록은 아래에서 정정·취소할 수 있습니다. 기록 정정·취소는 실제 입금·송금을 되돌리지 않습니다.</p><button class="btn btn-light btn-sm" type="button" id="payment-refresh">페이앱·수납 내역 새로고침</button><button class="btn btn-light btn-sm" type="button" id="payment-cancellation">취소 수수료·환불 정산</button><div id="payment-summary"></div><div id="payment-channels"></div><form id="payment-form"><h3 id="payment-mode">새 완료 내역 기록</h3><div class="field-row"><div class="f"><label for="payment-kind">기록 종류</label><select class="select" id="payment-kind"><option value="receipt">이용료 입금 완료</option><option value="refund">이용료 환불 완료</option></select></div><div class="f"><label for="payment-amount">처리 금액 (원)</label><input class="input" id="payment-amount" type="number" min="1" step="1" required></div></div><div class="f"><label for="payment-note">메모 (입금자·처리일·환불 사유)</label><input class="input" id="payment-note" maxlength="300"></div><div class="f" id="payment-reason-wrap" hidden><label for="payment-reason">정정·취소 사유 (필수)</label><input class="input" id="payment-reason" maxlength="300"></div><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="payment-save" type="submit">완료 내역 기록</button><button class="btn btn-light" type="button" id="payment-new" hidden>새 기록으로 전환</button></div></form><div id="payment-msg" role="status"></div><h3>페이앱 자동 수납·환불 <small>읽기 전용 · 최근 결제 90건</small></h3><div id="payment-online"></div><h3>수기 기록 · 정정 이력</h3><div id="payment-history"></div><button class="btn btn-light btn-sm" type="button" id="payment-more" hidden>이전 기록 더 보기</button></div>';
 document.body.appendChild(dialog);
 var $=function(s){return dialog.querySelector(s);},state={code:'',data:null,busy:false,dirty:false,request:0,pending:null,editing:null};
 var kindLabel=function(k){return k==='receipt'?'입금':'환불';},won=function(n){return Number(n).toLocaleString('ko-KR')+'원';};
 function error(e){if(!X.guard(e))$('#payment-msg').textContent=e.message||'처리하지 못했습니다.';}
 function editor(){
  var e=state.editing,isVoid=e&&e.action==='void';
  $('#payment-reason-wrap').hidden=!e;$('#payment-reason').required=!!e;$('#payment-new').hidden=!e;
  $('#payment-mode').textContent=e?(isVoid?'기록 #'+e.id+' 취소':'기록 #'+e.id+' 정정·복원'):'새 완료 내역 기록';
  $('#payment-save').textContent=e?(isVoid?'이 기록 취소':'정정 내용 저장'):'완료 내역 기록';
  ['#payment-kind','#payment-amount','#payment-note'].forEach(function(s){$(s).disabled=state.busy||!!isVoid;});
 }
 function reset(){state.editing=null;state.pending=null;state.dirty=false;$('#payment-form').reset();editor();}
 function paintOnline(orders){
  $('#payment-online').innerHTML=(orders||[]).map(function(o){
   return '<article class="payment-online"><p><b>'+M.esc(o.title)+' · '+M.esc(o.oid)+'</b></p><p>수납 '+won(o.price)+' · 환불 완료 '+won(o.refunded)+' · 남은 수납 '+won(Math.max(0,o.price-o.refunded))+'</p><p class="tiny muted">원거래 '+M.esc(o.mul_no||'')+' · '+M.esc(o.paid_at||'승인일 미수신')+'</p>'+(o.events||[]).map(function(e){
    var label=e.event_type==='baseline'?'기존 PG 환불 누계':e.event_type==='full'?'전체 환불':'부분 취소';
    var detail=e.effective_amount>0?'반영 '+won(e.effective_amount):'기존 환불에 포함 · 추가 합산 없음';
    return '<p class="small">'+M.esc(e.provider_at||e.created_at)+' · '+label+' · '+detail+(e.event_type==='baseline'?'':'<small> (통보 금액 '+won(e.raw_amount)+')</small>')+(e.refund_no?' · 취소번호 '+M.esc(e.refund_no):'')+'</p>';
   }).join('')+'</article>';
  }).join('')||'<p class="small muted">연결된 페이앱 결제 내역이 없습니다.</p>';
 }
 function paintChannels(s){
  $('#payment-channels').innerHTML='<h3>결제 방식별 합계</h3>'+[['online','페이앱·온라인 자동',s.pg_received,s.pg_refunded],['manual','계좌·수기 기록',s.manual_received,s.manual_refunded]].map(function(row){
   return '<section class="payment-channel" data-payment-source="'+row[0]+'"><h4>'+row[1]+'</h4><dl>'+[['누적 입금',row[2]],['환불 완료',row[3]],['현재 수납',row[2]-row[3]]].map(function(value){return '<div><dt>'+value[0]+'</dt><dd>'+won(value[1])+'</dd></div>';}).join('')+'</dl></section>';
  }).join('')+'<p class="tiny muted">계좌로 온라인 결제분을 환불했다면 계좌·수기 현재 수납이 음수일 수 있습니다. 위 전체 합계를 기준으로 잔금·환불 필요액을 계산합니다.</p>';
 }
 function paint(r,append){
  if(append&&state.data){r.entries=state.data.entries.concat(r.entries);var history=state.data.history.concat(r.history),seen={};r.history=history.filter(function(h){if(seen[h.id])return false;seen[h.id]=true;return true;});}
  state.data=r;paintOnline(r.online);paintChannels(r.settlement);
  $('#payment-summary').innerHTML='<dl>'+S.rows(r.settlement).map(function(row){return '<div><dt>'+M.esc(row[0])+'</dt><dd><b>'+M.esc(row[1])+'</b></dd></div>';}).join('')+'</dl>';
  $('#payment-history').innerHTML=(r.entries||[]).map(function(e){
   var history=(r.history||[]).filter(function(h){return h.entry_id===e.id;}).sort(function(a,b){return a.id-b.id;});
   var original='원본 · '+e.created_at+' · '+kindLabel(e.original_kind)+' '+won(e.original_amount)+(e.original_note?' · '+e.original_note:'');
   return '<article class="payment-entry'+(e.state==='void'?' is-void':'')+'" data-payment-entry="'+e.id+'"><p class="small"><b>#'+e.id+' · '+(e.state==='void'?'기록 취소됨 · ':e.version?'정정됨 · ':'')+kindLabel(e.kind)+' '+won(e.amount)+'</b>'+(e.note?' · '+M.esc(e.note):'')+'</p><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn btn-light btn-xs" type="button" data-payment-edit="'+e.id+'">'+(e.state==='void'?'복원·정정':'정정')+'</button>'+(e.state==='void'?'':'<button class="btn btn-light btn-xs" type="button" data-payment-void="'+e.id+'">기록 취소</button>')+'</div><details><summary>원본·변경 이력 ('+history.length+')</summary><p>'+M.esc(original)+'</p>'+history.map(function(h){return '<p>'+M.esc(h.created_at)+' · '+(h.action==='void'?'기록 취소':kindLabel(h.kind)+' '+won(h.amount)+(h.note?' · '+M.esc(h.note):''))+'<br>사유: '+M.esc(h.reason)+'</p>';}).join('')+'</details></article>';
  }).join('')||'<p class="small muted">수기 기록이 없습니다. 온라인 결제 내역은 주문·결제에서 확인할 수 있습니다.</p>';
  if(r.history_truncated)$('#payment-history').insertAdjacentHTML('beforeend','<p class="tiny muted">변경 이력은 최근 1,000건을 표시합니다.</p>');
  $('#payment-more').hidden=!r.has_more;$('#payment-save').disabled=state.busy;editor();
 }
 function busy(on){state.busy=on;dialog.querySelectorAll('input,select,button').forEach(function(el){el.disabled=on;});editor();$('#payment-save').disabled=on||!state.data;}
 function load(code){
  if(state.busy)return;if(state.dirty&&!confirm('입력 중인 내용을 바꾸고 예약을 불러올까요?'))return;
  state.code=code;state.data=null;reset();$('#payment-title').textContent='이용료 수납·정산 · '+code;$('#payment-summary').textContent='불러오는 중…';$('#payment-history').innerHTML='';$('#payment-online').innerHTML='';$('#payment-channels').innerHTML='';$('#payment-more').hidden=true;$('#payment-msg').textContent='';
  if(!dialog.open)dialog.showModal();busy(true);var n=++state.request;
  X.A('/bookings/'+encodeURIComponent(code)+'/settlement').then(function(r){if(n===state.request)paint(r);}).catch(error).finally(function(){if(n===state.request)busy(false);});
 }
 function close(){if(state.busy)return;if(state.dirty&&!confirm('입력한 내용을 버리고 닫을까요?'))return;dialog.close();state.dirty=false;}
 $('#payment-cancellation').onclick=function(){var code=state.code;close();if(!dialog.open)window.dispatchEvent(new CustomEvent('admin-cancellation-open',{detail:{codes:[code]}}));};
 $('#payment-refresh').onclick=function(){load(state.code);};
 $('#payment-close').onclick=close;dialog.addEventListener('cancel',function(e){e.preventDefault();close();});
 ['input','change'].forEach(function(name){$('#payment-form').addEventListener(name,function(){state.dirty=true;state.pending=null;});});
 $('#payment-new').onclick=function(){if(state.dirty&&!confirm('입력 중인 정정 내용을 버리고 새 기록을 만들까요?'))return;reset();};
 $('#payment-history').onclick=function(event){
  if(state.busy||!state.data)return;var b=event.target.closest('[data-payment-edit],[data-payment-void]');if(!b)return;
  if(state.dirty&&!confirm('입력 중인 내용을 바꾸고 이 기록을 선택할까요?'))return;
  var id=Number(b.dataset.paymentEdit||b.dataset.paymentVoid),e=state.data.entries.find(function(x){return x.id===id;});if(!e)return;
  reset();state.editing={id:id,version:e.version,action:b.hasAttribute('data-payment-void')?'void':'correct'};
  $('#payment-kind').value=e.kind;$('#payment-amount').value=e.amount;$('#payment-note').value=e.note;$('#payment-msg').textContent='';editor();$('#payment-reason').focus();
 };
 $('#payment-more').onclick=function(){if(state.busy||!state.data||!state.data.has_more)return;busy(true);X.A('/bookings/'+encodeURIComponent(state.code)+'/settlement?before='+state.data.next_before).then(function(r){paint(r,true);}).catch(error).finally(function(){busy(false);});};
 $('#payment-form').addEventListener('submit',function(event){
  event.preventDefault();if(state.busy||!state.data)return;
  var edit=state.editing,amount=Number($('#payment-amount').value),reason=$('#payment-reason').value.trim();
  if(!Number.isSafeInteger(amount)||amount<=0){error(Error('금액을 확인해 주세요.'));return;}if(edit&&!reason){error(Error('정정·취소 사유를 입력해 주세요.'));return;}
  var body=state.pending||{kind:$('#payment-kind').value,amount:amount,note:$('#payment-note').value.trim(),expected_revision:state.data.settlement.revision,request_id:crypto.randomUUID()};
  if(edit){body.action=edit.action;body.entry_version=edit.version;body.reason=reason;}
  state.pending=body;busy(true);$('#payment-msg').textContent='';
  var path='/bookings/'+encodeURIComponent(state.code)+'/settlement'+(edit?'/entries/'+edit.id:'');
  X.A(path,{method:'POST',body:body}).then(function(){
   reset();$('#payment-msg').textContent='저장했습니다. 변경된 정산 내역으로 견적을 저장하고 확정서를 다시 발급해 주세요.';
   window.dispatchEvent(new CustomEvent('admin-settlement-saved',{detail:{code:state.code}}));return X.A('/bookings/'+encodeURIComponent(state.code)+'/settlement').then(function(r){paint(r);});
  }).catch(function(e){if(e.code==='PAYMENT_CHANGED'){state.data=null;reset();return X.A('/bookings/'+encodeURIComponent(state.code)+'/settlement').then(function(r){paint(r);}).catch(error).then(function(){error(e);});}error(e);}).finally(function(){busy(false);});
 });
 document.addEventListener('click',function(e){var b=e.target.closest('[data-settlement-code]');if(b&&b.dataset.settlementCode){e.preventDefault();e.stopPropagation();load(b.dataset.settlementCode);}},true);
 window.addEventListener('beforeunload',function(e){if(state.dirty){e.preventDefault();e.returnValue='';}});
 new MutationObserver(function(){if(!document.body.classList.contains('adm-on')&&dialog.open){dialog.close();state.dirty=false;state.data=null;}}).observe(document.body,{attributes:true,attributeFilter:['class']});
})();
