(function(){
 'use strict';
 var M=window.MEGASPOT,$=M.$,esc=M.esc,form=$('#pk-form'),result=$('#pk-result'),modal=$('#pk-confirm'),config,receipt,activeKey='',activeOid='',timer,lastFocus,payBusy=false,redirecting=false;
 var status={waiting:'입차 대기',requested:'입차 알림 접수 · 등록 대기',processing:'주차 등록 처리 중',applied:'주차권 적용 완료',issue:'운영자 확인 중'};
 var payStatus={created:'결제 확인 중',pending:'입금 대기',paid:'결제 완료',failed:'결제 실패',cancelled:'결제 요청 취소',refunded:'환불 완료'};
 function won(n){return Number(n).toLocaleString('ko-KR')+'원';}
 function api(path,body,key){return fetch('/api/parking/'+path,{method:body?'POST':'GET',headers:Object.assign({'Accept':'application/json'},body?{'Content-Type':'application/json'}:{},key?{Authorization:'Bearer '+key}:{}),body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){if(!r.ok){var e=Error(j.error||'요청을 처리하지 못했습니다.');e.code=j.code;e.detail=j;throw e;}return j;});});}
 function error(message,where){var box=where||$('#pk-error');box.textContent=message;box.hidden=false;}
 function plate(s){return String(s||'').normalize('NFKC').replace(/[\s-]/g,'');}
 function keys(){try{var v=JSON.parse(localStorage.getItem('ms_parking_keys')||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch(e){return {};}}
 function keep(oid,key){var data=keys();data[oid]=key;var ids=Object.keys(data);if(ids.length>50)delete data[ids[0]];localStorage.setItem('ms_parking_keys',JSON.stringify(data));if(keys()[oid]!==key)throw Error('구매 내역을 저장할 수 없습니다. 브라우저 저장을 허용한 뒤 다시 시도해 주세요.');}
 function link(){return location.origin+'/parking/purchase/#oid='+encodeURIComponent(activeOid)+'&key='+encodeURIComponent(activeKey);}
 function today(){return new Date(Date.now()+9*3600e3).toISOString().slice(0,10);}
 function data(){return {plate:plate(form.elements.plate.value),date:form.elements.date.value,ticket:form.elements.ticket.value,name:form.elements.name.value.trim(),phone:form.elements.phone.value,agree_daily:form.elements.agree_daily.checked,agree_terms:form.elements.agree_terms.checked,agree_privacy:form.elements.agree_privacy.checked,agree_refund:form.elements.agree_terms.checked,policy:config.policy,daily_terms:form.elements.ticket.value==='daily'?config.daily_terms:''};}
 function dailyChoice(){var daily=form.elements.ticket.value==='daily';$('#pk-daily-agree').hidden=!daily;form.elements.agree_daily.required=daily;form.elements.agree_daily.checked=false;}
 form.addEventListener('change',function(e){if(e.target.name==='ticket')dailyChoice();});
 function close(){if(payBusy)return;modal.hidden=true;document.body.style.overflow='';if(lastFocus)lastFocus.focus();}
 form.addEventListener('submit',function(e){e.preventDefault();if(!form.reportValidity())return;var d=data(),ticket=config.tickets[d.ticket],day=new Date(d.date+'T12:00:00Z').getUTCDay();if(day===0||day===6||(config.holidays||[]).indexOf(d.date)>=0){error('주말·공휴일은 등록할 수 없습니다. 평일 이용일을 선택하거나 카카오톡으로 문의해 주세요.');form.elements.date.focus();return;}$('#pk-error').hidden=true;lastFocus=document.activeElement;$('#pk-confirm-summary').textContent='차량번호: '+d.plate+'\n이용일: '+d.date+'\n주차권: '+ticket.label+'\n결제 금액: '+won(ticket.price)+(d.ticket==='daily'?'\n이용 조건: '+config.daily_terms:'')+'\n등록: 평일 10:00–18:00 · 접수 17:50 마감\n입차 알림 후 최대 10분 이내 처리';$('#pk-plate-confirm').value='';$('#pk-final-agree').checked=false;$('#pk-confirm-error').hidden=true;var extra=$('#pk-extra');if(extra)extra.remove();modal.hidden=false;document.body.style.overflow='hidden';$('#pk-plate-confirm').focus();});
 $('#pk-edit').addEventListener('click',close);
 modal.addEventListener('keydown',function(e){if(e.key==='Escape')close();if(e.key==='Tab'){var els=Array.from(modal.querySelectorAll('input,button')).filter(function(x){return !x.disabled;}),first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 $('#pk-pay').addEventListener('click',function(){
  var d=data();d.plate_confirm=plate($('#pk-plate-confirm').value);d.confirmed=$('#pk-final-agree').checked;d.confirm_extra=!!($('#pk-extra-check')&&$('#pk-extra-check').checked);
  if(d.plate_confirm!==d.plate)return error('다시 입력한 차량번호가 일치하지 않습니다.',$('#pk-confirm-error'));
  if(d.ticket==='daily'&&!d.agree_daily)return error('일일권 종료 기준과 익일·초과 정산 조건을 확인해 주세요.',$('#pk-confirm-error'));
  if(!d.confirmed)return error('구매 내용과 취소 안내를 확인해 주세요.',$('#pk-confirm-error'));
  try{localStorage.setItem('ms_parking_storage_check','1');localStorage.removeItem('ms_parking_storage_check');}catch(e){return error('구매 내역 보관을 위해 브라우저 저장이 필요합니다. 카카오톡으로 문의해 주세요.',$('#pk-confirm-error'));}
  payBusy=true;$('#pk-edit').disabled=true;var btn=this;btn.disabled=true;btn.textContent='결제창 준비 중…';
  api('prepare',d).then(function(r){keep(r.oid,r.key);activeOid=r.oid;activeKey=r.key;redirecting=true;location.assign(r.payurl);}).catch(function(e){
   payBusy=false;
   if(e.detail&&e.detail.oid&&e.detail.key){keep(e.detail.oid,e.detail.key);activeOid=e.detail.oid;activeKey=e.detail.key;close();history.replaceState(null,'','?oid='+activeOid);loadReceipt();return;}
   error(e.message,$('#pk-confirm-error'));
   if(e.code==='EXTRA_CONFIRM'&&!$('#pk-extra')){$('#pk-confirm-error').insertAdjacentHTML('afterend','<label id="pk-extra" class="pk-agree"><input id="pk-extra-check" type="checkbox"><span>같은 차량·이용일에 결제된 주차권이 있으며, 추가 구매가 맞습니다.</span></label>');}
  }).finally(function(){if(!redirecting){payBusy=false;$('#pk-edit').disabled=false;btn.disabled=false;btn.textContent='확인하고 결제하기';}});
 });
 function loadReceipt(){
  form.hidden=true;$('#pk-unavailable').hidden=true;result.hidden=false;
  return api('orders/'+activeOid,null,activeKey).then(function(r){receipt=r.order;$('#pk-error').hidden=true;paintReceipt(r);clearTimeout(timer);if(!['failed','refunded','cancelled'].includes(receipt.payment_status)&&receipt.status!=='applied')timer=setTimeout(function(){if(!document.hidden)loadReceipt();},15000);}).catch(function(e){error(e.message);});
 }
 function paintReceipt(r){
  var p=r.order,paid=p.payment_status==='paid',hasRefund=Number(p.refunded_amount)>0,pendingRefund=p.refund_requested_at&&!p.refund_reviewed_at;
  result.innerHTML='<h2>주차권 구매 내역</h2><p class="pk-status">'+esc(payStatus[p.payment_status]||p.payment_status)+(paid?(hasRefund?' · 환불 내역 확인 필요':' · '+esc(status[p.status]||p.status)):'')+'</p><dl class="pk-detail"><dt>차량번호</dt><dd>'+esc(p.plate)+'</dd><dt>이용일</dt><dd>'+esc(p.visit_date)+'</dd><dt>주차권</dt><dd>'+esc(p.ticket_label)+'</dd><dt>결제 금액</dt><dd>'+esc(won(p.price))+'</dd><dt>주문번호</dt><dd>'+esc(p.oid)+'</dd>'+(p.daily_terms?'<dt>일일권 조건</dt><dd>'+esc(p.daily_terms)+'</dd>':'')+(p.refunded_amount?'<dt>환불 금액</dt><dd>'+esc(won(p.refunded_amount))+'</dd>':'')+'</dl>'
   +(paid&&hasRefund?'<div class="pk-notice">환불 내역이 있어 등록·적용 상태를 별도로 확인해야 합니다. 카카오톡으로 문의해 주세요.</div>':p.status==='applied'&&paid?'<div class="pk-notice">운영자가 아마노 등록 완료를 확인했습니다. 출차 시 남은 추가 요금이 있으면 현장에서 정산해 주세요.</div>':paid?'<div class="pk-notice">결제만으로 할인이 적용되지 않습니다. 입차 후 아래 버튼으로 알려 주세요. '+esc(r.processing_notice)+'</div>':'<p class="pk-help">결제 결과가 늦게 도착할 수 있습니다. 중복 결제하지 말고 새로고침해 확인해 주세요.</p>')
   +(pendingRefund?'<p class="pk-notice">취소 문의가 접수되었습니다. 운영자가 등록·결제 상태를 확인해 안내합니다. 접수만으로 결제가 취소되지는 않습니다.</p>':'')
   +'<div class="pk-actions">'+(paid&&!p.refunded_amount&&p.status==='waiting'&&!pendingRefund?'<button class="btn btn-primary" id="pk-arrive"'+(r.accepting_arrivals&&p.visit_date===today()?'':' disabled')+'>입차했어요 · 등록 요청</button>':'')+'<button class="btn btn-light" id="pk-refresh">상태 새로고침</button><button class="btn btn-light" id="pk-copy">구매 내역 링크 보관</button></div>'
   +(paid&&!p.refunded_amount?'<details><summary>취소·차량번호 정정 문의</summary><p class="pk-help">등록 전 정정은 취소 문의 후 재구매로 진행합니다. 등록·적용 이후는 실제 사용 여부와 사유를 확인합니다.</p><label class="pk-label"><span>문의 사유<span class="pk-required" aria-hidden="true">*</span><span class="sr-only"> (필수)</span></span><textarea class="textarea" id="pk-cancel-reason" aria-required="true" maxlength="300"></textarea></label><button class="btn btn-light" id="pk-cancel" type="button">취소·정정 문의 접수</button></details>':'')
   +'<p class="pk-help">구매 내역 링크는 이 차량의 조회·등록 요청에 사용됩니다. 본인 기기에 보관해 주세요. 운영시간 외·주말·공휴일은 즉시 등록할 수 없습니다.</p><div class="pk-actions"><a href="https://pf.kakao.com/_LnxbmX/chat" class="btn btn-light" target="_blank" rel="noopener">카카오톡 문의</a><a href="/parking/purchase/" class="btn btn-light">주차권 추가 구매</a></div>';
  $('#pk-refresh').onclick=loadReceipt;
  $('#pk-copy').onclick=function(){M.copy(link()).then(function(ok){M.toast(ok?'구매 내역 링크를 복사했습니다. 본인 기기에 보관해 주세요.':'링크를 복사하지 못했습니다.');});};
  var arrive=$('#pk-arrive');if(arrive)arrive.onclick=function(){var b=this;b.disabled=true;api('orders/'+activeOid+'/arrive',{},activeKey).then(loadReceipt).catch(function(e){error(e.message);b.disabled=false;});};
  var cancel=$('#pk-cancel');if(cancel)cancel.onclick=function(){var reason=$('#pk-cancel-reason').value.trim();if(!reason)return error('문의 사유를 입력해 주세요.');this.disabled=true;api('orders/'+activeOid+'/cancel-request',{reason:reason},activeKey).then(loadReceipt).catch(function(e){error(e.message);cancel.disabled=false;});};
 }
 var hash=new URLSearchParams(location.hash.slice(1)),q=new URLSearchParams(location.search);activeOid=hash.get('oid')||q.get('oid')||'';activeKey=hash.get('key')||keys()[activeOid]||'';
 if(hash.get('key')&&activeOid){try{keep(activeOid,activeKey);}catch(e){}history.replaceState(null,'','?oid='+encodeURIComponent(activeOid));}
 api('config').then(function(c){config=c;if(c.daily_enabled)$('#pk-overnight-notice').innerHTML='<b>자정(00:00) 이후·다음 날 출차 예정 고객</b><br>일일권 이용 조건: '+esc(c.daily_terms)+'<br>익일 출차는 입·출차 예정 시각을 알려 주시고 적용 가능 여부와 최종 금액을 구매 전에 확인해 주세요. 일일권 2장이 자동으로 연속 적용되는 것은 아닙니다. <a href="https://pf.kakao.com/_LnxbmX/chat" target="_blank" rel="noopener">익일 출차 문의 ↗</a>';$('#pk-loading').hidden=true;if(activeOid){if(!activeKey)return error('이 브라우저에 구매 내역 확인 정보가 없습니다. 보관한 구매 내역 링크를 열거나 주문번호와 함께 카카오톡으로 문의해 주세요.');return loadReceipt();}if(!c.enabled){$('#pk-unavailable').hidden=false;return;}form.hidden=false;form.elements.date.min=today();$('#pk-daily-notice').textContent=c.daily_enabled?'일일권 이용 조건: '+c.daily_terms+' 주차 공간 확보를 보장하는 상품은 아닙니다.':'일일권은 이용일 당일 23:59까지 유효합니다. 재입차·익일 정산 조건을 확인한 후 온라인 구매를 안내합니다. 시간권도 출차 후 재입차에는 별도 확인이 필요합니다. 주차 공간 확보를 보장하는 상품은 아닙니다.';$('#pk-tickets').innerHTML=Object.keys(c.tickets).map(function(id){var t=c.tickets[id];return '<label class="pk-ticket"><input type="radio" name="ticket" value="'+esc(id)+'"'+(id==='1h'?' checked':'')+(t.available?' required':' disabled')+'><b>'+esc(t.label)+'</b><span>'+esc(won(t.price))+'</span>'+(!t.available?'<small>이용 조건 확인 중 · 문의</small>':'')+'</label>';}).join('');dailyChoice();}).catch(function(e){$('#pk-loading').hidden=true;error('구매 정보를 불러오지 못했습니다. 잠시 후 다시 시도하거나 카카오톡으로 문의해 주세요.');});
 window.addEventListener('pageshow',function(e){if(e.persisted&&activeOid&&activeKey){payBusy=false;redirecting=false;close();loadReceipt();}});
 window.addEventListener('hashchange',function(){var h=new URLSearchParams(location.hash.slice(1)),oid=h.get('oid'),key=h.get('key');if(!/^MS[0-9A-F]{20}$/.test(oid||'')||!/^([0-9a-f]{64})$/.test(key||''))return;activeOid=oid;activeKey=key;try{keep(oid,key);}catch(e){}history.replaceState(null,'','?oid='+encodeURIComponent(oid));if(config)loadReceipt();});
 document.addEventListener('visibilitychange',function(){if(!document.hidden&&activeOid&&activeKey)loadReceipt();});
})();
