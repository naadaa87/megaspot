/* Shared status editor. Cumulative gross receipts add only the unrecorded difference. */
(function(){
 'use strict';
 var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT,S=window.MEGASPOT_SETTLEMENT;if(!X||!M||!S)return;
 var dialog=document.createElement('dialog');dialog.id='adm-payment-editor';dialog.className='adm-payment-editor';dialog.setAttribute('aria-labelledby','ape-title');document.body.append(dialog);
 var target='',trigger=null,info=null,busy=false,request=0,draft=null,pending=null,initialStatus='';
 function money(n){return Number(n||0).toLocaleString('ko-KR')+'원';}
 function place(){if(!dialog.open)return;var v=window.visualViewport,w=v?v.width:innerWidth,h=v?v.height:innerHeight,left=v?v.offsetLeft:0,top=v?v.offsetTop:0;dialog.style.maxHeight=Math.max(120,h-24)+'px';dialog.style.width=Math.min(420,w-24)+'px';dialog.style.left=(left+(w-dialog.getBoundingClientRect().width)/2)+'px';dialog.style.top=(top+Math.max(12,(h-dialog.getBoundingClientRect().height)/2))+'px';}
 function close(){if(busy)return;++request;if(dialog.open)dialog.close();target='';info=null;draft=null;pending=null;if(trigger&&trigger.isConnected)trigger.focus({preventScroll:true});trigger=null;}
 function foodBooking(){return info?.food_only&&target.startsWith('booking/');}
 function receiptDelta(){return draft.total===''?null:Number(draft.total)-info.settlement.received;}
 function receiptPreview(){
  if(!info||!info.receipt_available)return;
  var s=info.settlement,delta=receiptDelta(),el=dialog.querySelector('#ape-delta');
  var missing=delta!=null&&draft.status==='reservation_paid'&&info.reservation_fee>0?info.reservation_fee-(Number(draft.total)-s.refunded):0;
  dialog.querySelector('#ape-receipt-fields').hidden=!(delta>0);
  if(!busy)dialog.querySelector('[data-ape-save]').textContent=delta===0?'수납 추가 없이 상태 저장':'상태·입금 함께 저장';
  if(delta==null)el.textContent='실제 받은 이용료의 누적 총액을 입력해 주세요.';
  else if(delta<0)el.textContent='기존 기록보다 작습니다. 수납·환불 기록에서 정정해 주세요.';
  else if(missing>0)el.textContent='예약금 약정액에 '+money(missing)+'이 부족합니다. 실제 약정액이 다르면 예약 정보를 수정해 주세요.';
  else if(delta===0)el.textContent='이미 기록된 '+money(s.received)+'을 그대로 두고 결제 상태만 저장합니다.';
  else el.textContent='이번에 추가할 수납 '+money(delta);
 }
 function receiptFields(){
  return '<div class="field-row" id="ape-receipt-fields" hidden><div class="f"><label for="ape-processing-date">처리일</label>'+
   '<input class="input" id="ape-processing-date" type="date" value="'+X.esc(draft.date)+'"'+(busy||!info.editable?' disabled':'')+'></div>'+
   '<div class="f"><label for="ape-processing-method">처리 수단</label><select class="select" id="ape-processing-method"'+(busy||!info.editable?' disabled':'')+'>'+
   [''].concat(S.manualPaymentMethods).map(function(method){return '<option value="'+X.esc(method)+'"'+(draft.method===method?' selected':'')+'>'+(method||'미확인')+'</option>';}).join('')+'</select></div>'+
   '<div class="f" id="ape-processing-account-field"'+(draft.method==='계좌이체'?'':' hidden')+'><label for="ape-processing-account">계좌 유형 (선택)</label>'+
   '<select class="select" id="ape-processing-account"'+(busy||!info.editable?' disabled':'')+'>'+S.manualPaymentAccountOptions(draft.account)+'</select></div></div>';
 }
 function venueTerms(){
  if(info.food_only||!Number.isInteger(info.terms_version))return '';
  return '<div class="f"><label for="ape-venue-reservation-fee">예약금 약정액 (원)</label>'+
   '<input class="input" id="ape-venue-reservation-fee" type="number" inputmode="numeric" min="1" max="1000000000" step="1" value="'+X.esc(info.reservation_fee??'')+'"'+(busy||!info.editable?' disabled':'')+'>'+
   '<p class="ape-help">약정액을 저장하면 실제 수납액으로 예약금 완료 여부를 표시합니다. 반환 보증금은 별도로 관리합니다.</p>'+
   '<button type="button" class="btn btn-light btn-sm" data-ape-terms'+(busy||!info.editable?' disabled':'')+'>예약금 약정액 저장</button></div>';
 }
 function saveTerms(){
  if(busy||!info?.editable||info.food_only)return;
  var input=dialog.querySelector('#ape-venue-reservation-fee');
  if(!input.reportValidity())return;
  var receiptDraft=receiptDelta()>0?{...draft,received:info.settlement.received}:null;
  var fee=input.value===''?null:Number(input.value),code=target.startsWith('booking/')?target.slice(8):'',ref=code?'':target.slice(8);
  busy=true;dialog.querySelector('[data-ape-terms]').disabled=true;
  X.A('/reservation-payment-terms/'+target,{method:'PUT',body:{reservation_fee:fee,version:info.terms_version}}).then(function(){
   busy=false;window.dispatchEvent(new CustomEvent('admin-payment-status-saved',{detail:{code:code,ref:ref,terms_saved:true}}));
   read('예약금 약정액을 저장했습니다.',receiptDraft);
  }).catch(function(e){
   busy=false;
   if(!X.guard(e)){dialog.querySelector('[data-ape-terms]').disabled=false;dialog.querySelector('#ape-message').textContent=e.message;}
  });
 }
 function paint(message){
  var labels=info&&info.choices||{},s=info&&info.settlement;
  dialog.innerHTML='<div class="ape-heading"><h2 id="ape-title">결제 상태·입금 기록</h2><button type="button" class="btn btn-light btn-sm" data-ape-close'+(busy?' disabled':'')+'>닫기</button></div><p class="ape-customer">'+X.esc(info?info.name:'최신 상태를 불러오는 중…')+'</p>'
   +(info?'<label for="ape-status">입금 확인 범위</label><select id="ape-status" class="select"'+(busy||!info.editable?' disabled':'')+'>'+Object.keys(labels).map(function(k){return '<option value="'+k+'"'+(k===draft.status?' selected':'')+'>'+X.esc(labels[k])+'</option>';}).join('')+'</select><p class="ape-selected">'+X.esc(labels[draft.status]||'')+'</p>'+venueTerms()
    +(info.receipt_available?'<dl class="ape-balances"><div><dt>등록된 누적 이용료</dt><dd>'+money(s.received)+'</dd></div><div><dt>환불 완료</dt><dd>'+money(s.refunded)+'</dd></div><div><dt>현재 수납액</dt><dd>'+money(s.net)+'</dd></div>'+(info.food_only?'<div><dt>예약금 약정액</dt><dd>'+(info.reservation_fee>0?money(info.reservation_fee):'미입력')+'</dd></div>':'')+'<div><dt>남은 잔금</dt><dd>'+(s.balance==null?'금액 확인 필요':money(s.balance))+'</dd></div></dl><label for="ape-received-total">지금까지 받은 이용료 총액(원)</label><input id="ape-received-total" class="input" type="number" inputmode="numeric" min="0" max="1000000000" step="1" value="'+X.esc(draft.total)+'"'+(busy||!info.editable?' disabled':'')+'><p class="ape-help">'+(info.food_only?'현재까지 받은 금액의 누계입니다. 이미 등록된 입금액을 뺀 차액만 추가됩니다.':'이번 입금액이 아닌, 환불 전 누적 총액을 입력하세요. 온라인 결제와 기존 수기 입금을 포함하며 반환 보증금은 제외합니다. 이미 등록된 금액을 뺀 차액만 수납·매출에 추가됩니다.')+'</p><p id="ape-delta" class="ape-selected" role="status" aria-live="polite"></p>'+receiptFields()+'<label for="ape-receipt-note">입금 메모(선택)</label><input id="ape-receipt-note" class="input" maxlength="300" value="'+X.esc(draft.note)+'"'+(busy||!info.editable?' disabled':'')+'>':'<p class="ape-help">문의나 연결된 예약의 진행 상태를 확인해 주세요.</p>')
    +((info.entries||[]).length?'<details class="ape-history"><summary>수기 수납·환불 내역 (최근 30건)</summary><ul>'+info.entries.map(function(entry){return '<li><b>'+X.esc(entry.kind==='refund'?'환불':'입금')+' '+money(entry.amount)+(entry.state==='void'?' (취소 기록)':'')+'</b><small>'+X.esc(entry.created_at)+' · '+X.esc(entry.note||'')+'</small></li>';}).join('')+'</ul></details>':'')
    +(target.startsWith('inquiry/')?'<p class="ape-help">문의 단계의 예약금도 수납·매출에 반영됩니다. 예약 확정 시 같은 입금 기록이 그대로 연결되며 다시 합산하지 않습니다.</p><button type="button" class="btn btn-light btn-sm" data-ape-inquiry-ledger'+(busy?' disabled':'')+'>수납·환불 기록 관리</button>':'')
    +(info.food_only?'':'<p class="ape-help">전체 완료(대관)는 식음료 이용 없이 결제가 끝난 경우입니다. 대관비용 입금 완료는 식음료 결제가 남은 경우입니다.</p>')+'<div class="ape-actions"><button type="button" class="btn btn-primary" data-ape-save'+(busy||!info.editable?' disabled':'')+'>'+(busy?'저장 중…':info.receipt_available?'상태·입금 함께 저장':'상태 저장')+'</button></div>':'')
   +'<p id="ape-message" class="ape-message" role="status" aria-live="polite">'+X.esc(message||(info&&!info.editable?'취소·삭제된 건은 변경할 수 없습니다.':''))+'</p>'
   +(!info&&message?'<button type="button" class="btn btn-light" data-ape-retry>다시 불러오기</button>':'');
  receiptPreview();place();
 }
 function read(message,receiptDraft){
  var id=++request;info=null;draft=null;pending=null;paint(message);
  X.A('/reservation-payment-checks/'+target).then(function(r){
   if(id!==request||!dialog.open)return;
   info=r;target=r.receipt_target||target;
   var keep=receiptDraft&&receiptDraft.received===r.settlement?.received;
   draft=keep?{...receiptDraft,status:r.payment_status}:{status:initialStatus||r.payment_status,total:r.settlement?String(r.settlement.received):'',note:'',date:new Date(Date.now()+9*3600000).toISOString().slice(0,10),method:'',account:''};
   initialStatus='';paint(receiptDraft&&!keep?message+' 현재 수납액이 바뀌어 입금 금액을 다시 확인해 주세요.':message);
   dialog.querySelector('#ape-status').focus({preventScroll:true});
  }).catch(function(e){if(id!==request||!dialog.open)return;if(!X.guard(e))paint(e.message||'상태를 불러오지 못했습니다.');else close();});
 }
 function save(){
  if(busy||!info||!info.editable)return;
  if(info.receipt_available){var input=dialog.querySelector('#ape-received-total');if(draft.total===''||!input.reportValidity()){dialog.querySelector('#ape-message').textContent='실제 누적 입금액을 확인해 주세요.';return;}}
  var note=draft.note;
  if(info.receipt_available&&receiptDelta()>0){
   if(foodBooking()&&(!draft.date||!draft.method)){dialog.querySelector('#ape-message').textContent='새로 추가하는 입금의 처리일과 처리 수단을 선택해 주세요.';return;}
   note=S.manualPaymentNote(draft.date,draft.method,note,draft.account);
   if(note.length>300){dialog.querySelector('#ape-message').textContent='입금 메모를 조금 줄여 주세요.';return;}
  }
  var signature=JSON.stringify(draft),foodOnly=info.food_only;
  if(!pending||pending.signature!==signature){var body={status:draft.status,expected_revision:info.payment_revision};if(info.receipt_available)Object.assign(body,{received_total:Number(draft.total),receipt_note:note,expected_settlement_revision:info.settlement.revision,request_id:'scope_'+crypto.randomUUID()});pending={signature:signature,body:body};}
  busy=true;paint();var savedTarget=target,view=trigger&&trigger.closest('.adm-view');
  X.A('/reservation-payment-checks/'+target,{method:'PUT',body:pending.body}).then(function(r){
   busy=false;close();var detail={target:savedTarget,status:r.payment_status,receipt_added:r.receipt_added||0,code:r.booking_code||(savedTarget.startsWith('booking/')?savedTarget.slice(8):''),ref:savedTarget.startsWith('inquiry/')?savedTarget.slice(8):''};
   if(detail.receipt_added>0)window.dispatchEvent(new CustomEvent('admin-settlement-saved',{detail:detail}));window.dispatchEvent(new CustomEvent('admin-payment-status-saved',{detail:{...detail,food_only:foodOnly}}));
   M.toast(detail.receipt_added>0?'결제 상태와 추가 수납 '+money(detail.receipt_added)+'을 저장했습니다.':'추가 수납 없이 결제 상태를 저장했습니다.');
   if(view){var fallback=view.querySelector('#bk-payment-filter,#cal-payment-filter,#rs-payment-filter');if(fallback)fallback.focus({preventScroll:true});}
  }).catch(function(e){busy=false;if(X.guard(e)){close();return;}if(e.status===409){initialStatus='';read(e.message||'최신 기록을 다시 확인해 주세요.');}else{paint(e.status?e.message:'저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장하면 중복 기록을 방지합니다.');}});
 }
 function open(button,selected,requestedTarget){if(busy)return;trigger=button;target=requestedTarget||button.dataset.paymentEditor;initialStatus=selected||'';dialog.showModal();read();}
 document.addEventListener('click',function(e){var b=e.target.closest('[data-payment-editor]');if(!b||b.disabled||busy)return;e.preventDefault();e.stopPropagation();open(b);});
 window.addEventListener('admin-payment-editor-open',function(e){var d=e.detail||{};if(d.trigger&&typeof d.target==='string')open(d.trigger,d.status,d.target);});
 dialog.addEventListener('click',function(e){if(e.target.closest('[data-ape-close]')||e.target===dialog)close();else if(e.target.closest('[data-ape-save]'))save();else if(e.target.closest('[data-ape-terms]'))saveTerms();else if(e.target.closest('[data-ape-retry]'))read();else if(e.target.closest('[data-ape-inquiry-ledger]')&&!busy){
   var ref=target.slice(8);close();window.dispatchEvent(new CustomEvent('admin-inquiry-settlement-open',{detail:{ref:ref}}));
  }});
 dialog.addEventListener('input',function(e){if(!draft)return;if(e.target.id==='ape-received-total'){draft.total=e.target.value;receiptPreview();}if(e.target.id==='ape-receipt-note')draft.note=e.target.value;if(e.target.id==='ape-processing-date')draft.date=e.target.value;});
 dialog.addEventListener('change',function(e){if(e.target.id==='ape-status'&&info){draft.status=e.target.value;dialog.querySelector('.ape-selected').textContent=info.choices[e.target.value]||'';receiptPreview();}if(!draft)return;if(e.target.id==='ape-processing-method'){draft.method=e.target.value;dialog.querySelector('#ape-processing-account-field').hidden=draft.method!=='계좌이체';}if(e.target.id==='ape-processing-account')draft.account=e.target.value;});
 dialog.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();if(e.target.id==='ape-venue-reservation-fee')saveTerms();else save();}});
 dialog.addEventListener('cancel',function(e){e.preventDefault();close();});window.addEventListener('hashchange',close);window.addEventListener('resize',place);
 if(window.visualViewport){window.visualViewport.addEventListener('resize',function(){place();if(dialog.contains(document.activeElement))document.activeElement.scrollIntoView({block:'nearest'});});window.visualViewport.addEventListener('scroll',place);}
})();
