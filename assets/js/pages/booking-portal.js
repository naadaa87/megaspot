(function(){
 'use strict';
 var key='',data=null,controller=null,busy=false,requestId=0,docJob=null,toastTimer=null,sessionKey='megaspot-booking-portal';
 var $=function(s){return document.querySelector(s);},esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
 var won=function(n){return Number(n||0).toLocaleString('ko-KR')+'원';};
 function date(s){if(!s)return '운영팀 확인 후 안내';var d=new Date(s+'T00:00:00Z');return d.getUTCFullYear()+'년 '+(d.getUTCMonth()+1)+'월 '+d.getUTCDate()+'일 ('+['일','월','화','수','목','금','토'][d.getUTCDay()]+')';}
 function hour(h){return h==null?'시간 확인 중':(h>=24?'다음 날 ':'')+String(Math.floor(h%24)).padStart(2,'0')+':'+String(Math.round((h%1)*60)).padStart(2,'0');}
 function time(b){return b.start_h==null||b.end_h==null?'이용 시간은 운영팀에서 확인해 드립니다.':hour(b.start_h)+' – '+hour(b.end_h);}
 function badge(id,text,type){var el=$(id);el.textContent=text;el.className='bp-badge'+(type?' is-'+type:'');}
 function notice(text){clearTimeout(toastTimer);$('#bp-toast').textContent=text;$('#bp-toast').hidden=false;toastTimer=setTimeout(function(){$('#bp-toast').hidden=true;},2600);}
 function api(){return fetch('/api/booking-portal/view',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{Authorization:'Bearer '+key}}).then(function(r){return r.json().then(function(j){if(!r.ok){var e=Error(j.error||'예약 정보를 확인하지 못했습니다.');e.status=r.status;throw e;}return j;});});}
 function clear(){if(controller)controller.destroy();controller=null;data=null;docJob=null;$('#bp-content').hidden=true;['#bp-greeting','#bp-code','#bp-booking-summary','#bp-document','#bp-payment','#bp-deposit','#bp-arrival','#bp-overview','#bp-refund-note','#bp-next-title','#bp-next-description'].forEach(function(id){$(id).textContent='';});}
 function forget(){requestId++;key='';try{sessionStorage.removeItem(sessionKey);}catch{}clear();$('#bp-gate').hidden=false;$('#bp-gate-message').textContent='예약자에게 전달된 전용 통합 안내 링크로 다시 접속해 주세요.';$('#bp-retry').hidden=true;}
 function step(label,value,done){return '<div class="bp-step"><span class="bp-step-icon'+(done?' is-done':'')+'" aria-hidden="true">'+(done?'✓':'·')+'</span><div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div></div>';}
 function next(r){var d=r.deposit,b=r.booking,a=d.account,title,description,href,button;
  if(d.returned){title='이용해 주셔서 감사합니다.';description='보증금 환급 처리가 완료되었습니다. 정산 내용이 궁금하시면 운영팀으로 문의해 주세요.';href='#refund';button='환급 상태 보기';}
  else if(r.payment&&r.payment.amount_visible&&r.payment.balance>0){title='이용료 잔금을 확인해 주세요.';description='남은 이용료 '+won(r.payment.balance)+' · 납부 기한 '+date(r.payment.due_date)+'입니다. 반환 보증금은 별도입니다.';href='#payment';button='이용료 납부 내역 보기';}
  else if(d.amount_visible&&d.amount>0&&!d.paid){title='보증금 입금 정보를 확인해 주세요.';description='입금 기한은 '+date(d.due_date)+'입니다. 이미 입금하셨다면 운영팀 확인 후 상태가 반영됩니다.';href='#deposit';button='입금 안내 보기';}
  else if(a.available&&!a.registered){title='환급 계좌를 등록해 주세요.';description='이용 후 보증금을 돌려받으실 은행·계좌번호·예금주를 미리 등록해 주세요.';href='#refund';button='계좌 등록하기';}
  else if(b.ended){title='환급 진행을 확인해 주세요.';description='시설 확인과 정산 후 '+date(d.refund_date)+'에 환급할 예정입니다.';href='#refund';button='환급 상태 보기';}
  else {title='방문 전 입실 안내를 확인해 주세요.';description='예약한 공간의 위치와 이용 시간을 확인해 주세요. 준비와 정리 시간도 이용 시간에 포함됩니다.';href='#arrival';button='입실 안내 보기';}
  $('#bp-next-title').textContent=title;$('#bp-next-description').textContent=description;$('#bp-next-link').href=href;$('#bp-next-link').textContent=button;
 }
 function drawDocument(r){
  docJob=null;var doc=r.confirmation;
  badge('#bp-doc-badge',doc?'발급 완료':'발급 준비 중',doc?'good':'wait');
  if(!doc){$('#bp-document').innerHTML='<div class="bp-doc"><p class="bp-notice">예약은 확정되어 있습니다. 예약확정서는 운영팀에서 발급 후 이곳에 표시됩니다. 예약 조건을 변경한 경우에는 최신 내용으로 다시 발급됩니다.</p></div>';return;}
  $('#bp-document').innerHTML='<details class="bp-doc" id="bp-doc-detail"><summary>예약확정서 펼쳐보기 · PDF 저장</summary><div class="bp-doc-body"><p class="bp-small">아래 확정서에 기록된 이용 조건을 확인해 주세요.</p><canvas id="bp-doc-canvas" aria-label="예약확정서"></canvas><div class="bp-actions"><button class="bp-secondary" id="bp-doc-pdf" type="button">확정서 PDF 저장</button><button class="bp-secondary" id="bp-doc-png" type="button">이미지 저장</button></div><p id="bp-doc-error" class="bp-notice" role="status" hidden></p></div></details>';
  function rendered(){if(!docJob)docJob=window.MEGASPOT_CONFIRM.render(doc,$('#bp-doc-canvas'));return docJob;}
  $('#bp-doc-detail').addEventListener('toggle',function(){if(this.open)rendered().catch(function(){$('#bp-doc-error').textContent='확정서 미리보기를 불러오지 못했습니다. 다시 확인해 주세요.';$('#bp-doc-error').hidden=false;});});
  ['pdf','png'].forEach(function(type){$('#bp-doc-'+type).onclick=function(){var button=this;button.disabled=true;var X=window.MEGASPOT_CONFIRM;rendered().then(function(){return type==='pdf'?X.pdfBlob($('#bp-doc-canvas'),'메가스팟 예약확정서 '+doc.code):X.pngBlob($('#bp-doc-canvas'));}).then(function(blob){X.download(blob,X.fileName(doc,type));notice('확정서를 저장했습니다.');}).catch(function(){notice('확정서를 저장하지 못했습니다. 다시 시도해 주세요.');}).finally(function(){button.disabled=false;});};});
 }
 function drawPayment(r){var p=r.payment;
  if(!p){$('#bp-payment').textContent='수납 정보를 다시 불러와 주세요.';return;}
  badge('#bp-payment-badge',!p.amount_visible?'금액 비공개':p.total==null?'이용료 확인 중':p.complete?'전액 납부 완료':p.paid>0?'예약금·일부 납부 확인':'입금 확인 전',p.complete?'good':'wait');
  if(!p.amount_visible){$('#bp-payment').innerHTML='<p class="bp-notice">이 예약은 금액 비공개로 안내됩니다. 납부 조건은 운영팀에 확인해 주세요.</p>';return;}
  var html='<dl class="bp-details">'+[['총 이용료',p.total],['누적 입금 확인',p.received],['이용료 환불 완료',p.refunded],['현재 납부한 이용료',p.paid],['남은 이용료 잔금',p.balance]].map(function(row){return '<div><dt>'+row[0]+'</dt><dd>'+esc(row[1]==null?'운영팀 확인 중':won(row[1]))+'</dd></div>';}).join('')+'</dl><p class="bp-notice">예약은 확정되어 있습니다. 예약금은 이용료에 포함되며, 이용 후 반환하는 보증금은 아래에서 별도로 확인해 주세요.</p>';
  if(p.balance>0)html+='<p class="bp-due">잔금 납부 기한 · '+esc(date(p.due_date))+'</p>';
  if(p.bank)html+='<div class="bp-bank"><small>이용료 입금 계좌 · '+esc(p.bank.name)+'</small><strong>'+esc(p.bank.account)+'</strong><p>예금주 · '+esc(p.bank.holder)+'</p></div><p class="bp-small">이미 입금하셨다면 추가 입금하지 마세요. 운영팀 확인 후 반영됩니다.</p>';
  if(p.refund_due>0)html+='<p class="bp-notice">이용료 초과 납부 '+esc(won(p.refund_due))+' · 운영팀에서 환불 내역을 확인합니다.</p>';
  $('#bp-payment').innerHTML=html;
 }
 function drawDeposit(r){var d=r.deposit,amount=d.amount;
  badge('#bp-deposit-badge',d.returned?'환급 완료':amount===0?'보증금 없음':d.paid?'입금 확인 완료':'입금 확인 전',d.returned||d.paid||amount===0?'good':'wait');
  var content=d.amount_visible?'<p class="bp-amount">'+Number(amount||0).toLocaleString('ko-KR')+'<span>원</span></p>':'<p class="bp-notice">이 예약은 금액 비공개로 안내되고 있습니다. 보증금 조건은 운영팀에 확인해 주세요.</p>';
  if(d.amount_visible&&amount>0)content+='<p class="bp-due">'+(d.returned?'환급 처리가 완료되었습니다.':d.paid?'보증금 입금이 확인되었습니다.':'입금 기한 · '+esc(date(d.due_date)))+'</p>';
  if(d.bank){content+='<div class="bp-bank"><small>보증금 입금 계좌 · '+esc(d.bank.name)+'</small><strong>'+esc(d.bank.account)+'</strong><p>예금주 · '+esc(d.bank.holder)+'</p><button id="bp-copy-bank" class="bp-secondary" type="button">입금 계좌번호 복사</button></div><p class="bp-small">이미 입금하셨다면 추가로 입금하지 마세요. 운영팀에서 입금 내역을 확인한 뒤 상태를 반영합니다.</p>';}
  if(amount!==0||!d.amount_visible)content+='<div class="bp-refund-date"><span>환급 예정일</span><strong>'+esc(date(d.refund_date))+'</strong></div><p class="bp-small">이용 종료일이 속한 주의 다음 주 수요일에 환급합니다. 시설 상태와 정리 여부를 확인하고 차감 사유가 있으면 사전에 안내합니다.</p>';
  $('#bp-deposit').innerHTML=content;
  if($('#bp-copy-bank'))$('#bp-copy-bank').onclick=function(){if(!navigator.clipboard){notice('계좌번호를 직접 복사해 주세요.');return;}navigator.clipboard.writeText(d.bank.account).then(function(){notice('입금 계좌번호를 복사했습니다.');}).catch(function(){notice('계좌번호를 직접 복사해 주세요.');});};
 }
 function drawAccount(r,refreshAccount){var a=r.deposit.account,root=$('[data-portal-account]');
  if(a.available){$('#bp-refund-note').innerHTML='<p class="bp-small">계좌 등록과 보증금 입금 확인은 별도로 처리됩니다. 등록한 계좌는 환급 담당자만 확인합니다.</p>';if(controller&&refreshAccount){controller.destroy();controller=null;}if(!controller)controller=window.MEGASPOT_DEPOSIT_ACCOUNT.mount(root,{token:key,endpoint:'/api/booking-portal/account',embedded:true,onChange:function(){load(false);}});}
  else {if(controller)controller.destroy();controller=null;root.innerHTML='';var message=r.deposit.returned?'보증금 환급 처리가 완료되었습니다. 입금 내역을 확인해 주세요.':r.deposit.amount_visible&&r.deposit.amount===0?'이 예약은 이용 보증금이 없어 환급 계좌를 등록하지 않으셔도 됩니다.':a.purged?'계좌 정보의 보유기간이 종료되었습니다. 계좌 관련 확인이 필요하면 운영팀에 문의해 주세요.':'환급 계좌 등록은 운영팀 확인 후 이용하실 수 있습니다.';$('#bp-refund-note').innerHTML='<p class="bp-notice">'+esc(message)+'</p>'+(a.completed_at?'<p class="bp-small">처리일 '+esc(a.completed_at.slice(0,10))+'</p>':'');}
 }
 function drawArrival(r){var a=r.arrival,b=r.booking;badge('#bp-arrival-badge',a.ready?'안내 확인 가능':'전용 안내 준비 중',a.ready?'blue':'wait');
  var html='<dl class="bp-details"><div><dt>예약 공간</dt><dd>'+esc(a.space)+'</dd></div><div><dt>위치</dt><dd>'+esc(a.address)+'</dd></div></dl><div class="bp-arrival-times"><div><small>입실 · '+esc(a.checkin)+'</small><strong>'+esc(hour(b.start_h))+'</strong></div><div><small>퇴실 · '+esc(a.checkout)+'</small><strong>'+esc(hour(b.end_h))+'</strong></div></div><p class="bp-notice">'+esc(a.note)+'</p>';
  if(a.ready){html+='<details class="bp-access"><summary>출입·와이파이 확인</summary><div class="bp-access-content"><p class="bp-code-label">출입 도어락 비밀번호</p><p class="bp-door">'+esc(a.door_code)+'</p><p class="bp-code-label">와이파이</p><p class="bp-wifi">'+esc(a.wifi_name)+(a.wifi_password?'<br>비밀번호 <strong>'+esc(a.wifi_password)+'</strong>':'')+'</p></div></details><ul class="bp-arrival-rules"><li>'+esc(a.lock_note)+'</li><li>이동한 가구와 사용한 비품은 원래 위치로 정리해 주세요.</li><li>사용한 냉난방·음향·프로젝터 전원을 확인해 주세요.</li></ul><div class="bp-actions"><a class="bp-secondary" href="'+esc(a.equipment_url)+'" target="_blank" rel="noopener noreferrer">입실 및 장비 이용 안내 ↗</a><a class="bp-secondary" href="/parking/purchase/?from=booking-portal" target="_blank" rel="noopener noreferrer">주차권 확인 ↗</a></div>';}
  else html+='<p class="bp-notice" style="margin-top:18px">'+esc(a.message)+'</p>';
  $('#bp-arrival').innerHTML=html;
 }
 function draw(r,refreshAccount){var b=r.booking,d=r.deposit;$('#bp-test-notice').hidden=!b.test;data=r;$('#bp-gate').hidden=true;$('#bp-content').hidden=false;$('#bp-error').hidden=true;
  $('#bp-greeting').textContent=b.name+'님,\n모임 준비를 함께 확인해요.';$('#bp-greeting').style.whiteSpace='pre-line';$('#bp-code').textContent=b.code;badge('#bp-status',b.status==='completed'?'이용 완료':'예약 확정','good');
  $('#bp-overview').innerHTML=step('예약','예약 확정',true)+step('이용료',r.payment&&r.payment.complete?'전액 납부':r.payment&&r.payment.amount_visible&&r.payment.balance!=null?'잔금 '+won(r.payment.balance):'금액 확인',!!r.payment&&r.payment.complete)+step('보증금',d.returned?'환급 완료':d.amount_visible&&d.amount===0?'해당 없음':d.paid?'입금 확인 완료':'입금 확인 전',d.returned||d.paid||d.amount_visible&&d.amount===0)+step('환급 계좌',d.returned?'처리 완료':d.account.registered?'등록 완료':d.amount_visible&&d.amount===0?'해당 없음':'등록 확인',d.returned||d.account.registered||d.amount_visible&&d.amount===0)+step('입실 안내',r.arrival.ready?'확인 가능':'준비 중',false);
  $('#bp-booking-summary').innerHTML='<p class="bp-booking-date">'+esc(date(b.date))+'</p><p class="bp-booking-hours">'+esc(time(b))+'</p><dl class="bp-details"><div><dt>예약 공간</dt><dd>'+esc(b.space.name)+'</dd></div><div><dt>예약자</dt><dd>'+esc(b.name)+'</dd></div><div><dt>이용 인원</dt><dd>'+esc(b.headcount?b.headcount+'명':'운영팀 확인 중')+'</dd></div><div><dt>담당자 연락처</dt><dd>'+esc(b.phone)+'</dd></div></dl>';
  drawDocument(r);drawPayment(r);drawDeposit(r);drawAccount(r,refreshAccount);drawArrival(r);next(r);
 }
 function load(refreshAccount){if(!key)return;var id=++requestId;busy=true;$('#bp-refresh').disabled=true;$('#bp-retry').disabled=true;
  return api().then(function(r){if(id===requestId)draw(r,refreshAccount!==false);}).catch(function(e){if(id!==requestId)return;if(e.status===403||e.status===410){forget();$('#bp-gate-message').textContent=e.message;return;}if(data){$('#bp-error').textContent=e.message;$('#bp-error').hidden=false;}else{clear();$('#bp-gate').hidden=false;$('#bp-gate-message').textContent=e.message;$('#bp-retry').hidden=false;}}).finally(function(){if(id===requestId){busy=false;$('#bp-refresh').disabled=false;$('#bp-retry').disabled=false;}});
 }
 $('#bp-refresh').onclick=function(){if(!busy)load(true);};$('#bp-retry').onclick=function(){load(true);};$('#bp-forget').onclick=forget;
 function start(){var raw=location.hash,match=raw.match(/^#booking=([A-Za-z0-9_-]{43})$/);if(raw.indexOf('#booking=')===0){forget();history.replaceState(null,'','/booking/');if(match){key=match[1];try{sessionStorage.setItem(sessionKey,JSON.stringify({token:key,at:Date.now()}));}catch{}}}else try{var saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null');if(saved&&typeof saved.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(saved.token)&&Date.now()-saved.at<864e5)key=saved.token;}catch{}
  if(key)load(true);else{clear();$('#bp-gate').hidden=false;$('#bp-gate-message').textContent='예약자에게 전달된 전용 통합 안내 링크로 접속해 주세요.';$('#bp-retry').hidden=true;}
 }
 window.addEventListener('hashchange',function(){if(location.hash.indexOf('#booking=')===0)start();});window.addEventListener('pagehide',function(){requestId++;clear();$('#bp-gate').hidden=false;$('#bp-gate-message').textContent='예약 정보를 확인하고 있습니다.';});window.addEventListener('pageshow',function(e){if(e.persisted&&key)load(true);});start();
})();
