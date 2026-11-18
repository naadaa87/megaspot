/* One payment scope editor for calendar and booking cards. Actual receipts stay unchanged. */
(function(){
 'use strict';
 var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT;if(!X||!M)return;
 var dialog=document.createElement('dialog');dialog.id='adm-payment-editor';dialog.className='adm-payment-editor';dialog.setAttribute('aria-labelledby','ape-title');document.body.append(dialog);
 var target='',trigger=null,info=null,busy=false,request=0;
 function close(){if(busy)return;++request;if(dialog.open)dialog.close();target='';info=null;if(trigger&&trigger.isConnected)trigger.focus({preventScroll:true});trigger=null;}
 function paint(message){
  var labels=info&&info.choices||{};
  dialog.innerHTML='<div class="ape-heading"><h2 id="ape-title">결제 상태 변경</h2><button type="button" class="btn btn-light btn-sm" data-ape-close'+(busy?' disabled':'')+'>닫기</button></div><p class="ape-customer">'+X.esc(info?info.name:'최신 상태를 불러오는 중…')+'</p>'
   +(info?'<label for="ape-status">입금 확인 범위</label><select id="ape-status" class="select"'+(busy||!info.editable?' disabled':'')+'>'+Object.keys(labels).map(function(k){return '<option value="'+k+'"'+(k===info.payment_status?' selected':'')+'>'+X.esc(labels[k])+'</option>';}).join('')+'</select><p class="ape-selected">'+X.esc(labels[info.payment_status]||'')+'</p><p class="ape-help">결제 확인 표시만 변경합니다. 실제 수납·환불 금액과 반환 보증금은 별도로 관리합니다.</p><button type="button" class="btn btn-primary" data-ape-save'+(busy||!info.editable?' disabled':'')+'>'+(busy?'저장 중…':'변경 저장')+'</button>':'')
   +'<p id="ape-message" class="ape-message" role="status" aria-live="polite">'+X.esc(message||(info&&!info.editable?'취소·삭제된 건은 변경할 수 없습니다.':''))+'</p>'
   +(!info&&message?'<button type="button" class="btn btn-light" data-ape-retry>다시 불러오기</button>':'');
 }
 function read(message){var id=++request;info=null;paint(message);X.A('/reservation-payment-checks/'+target).then(function(r){if(id!==request||!dialog.open)return;info=r;paint(message);dialog.querySelector('#ape-status').focus();}).catch(function(e){if(id!==request||!dialog.open)return;if(!X.guard(e))paint(e.message||'상태를 불러오지 못했습니다.');else close();});}
 function save(){
  if(busy||!info||!info.editable)return;var value=dialog.querySelector('#ape-status').value;if(value===info.payment_status){close();return;}
  busy=true;paint();var savedTarget=target,view=trigger&&trigger.closest('.adm-view');
  X.A('/reservation-payment-checks/'+target,{method:'PUT',body:{status:value,expected_revision:info.payment_revision}}).then(function(r){
   busy=false;close();window.dispatchEvent(new CustomEvent('admin-payment-status-saved',{detail:{target:savedTarget,status:r.payment_status}}));M.toast('결제 상태를 저장했습니다.');
   if(view){var fallback=view.querySelector('#bk-payment-filter,#cal-payment-filter');if(fallback)fallback.focus({preventScroll:true});}
  }).catch(function(e){busy=false;if(!X.guard(e))read(e.message||'저장하지 못했습니다. 최신 상태를 확인해 주세요.');else close();});
 }
 document.addEventListener('click',function(e){var b=e.target.closest('[data-payment-editor]');if(!b||b.disabled||busy)return;e.preventDefault();e.stopPropagation();trigger=b;target=b.dataset.paymentEditor;dialog.showModal();read();});
 dialog.addEventListener('click',function(e){if(e.target.closest('[data-ape-close]')||e.target===dialog)close();else if(e.target.closest('[data-ape-save]'))save();else if(e.target.closest('[data-ape-retry]'))read();});
 dialog.addEventListener('change',function(e){if(e.target.id==='ape-status'&&info)dialog.querySelector('.ape-selected').textContent=info.choices[e.target.value]||'';});
 dialog.addEventListener('cancel',function(e){e.preventDefault();close();});
 window.addEventListener('hashchange',close);
})();
