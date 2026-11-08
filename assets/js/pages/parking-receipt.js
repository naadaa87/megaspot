(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.MEGASPOT_PARKING_RECEIPT=factory();
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 var paymentLabels={created:'결제 확인 중',pending:'입금 대기',paid:'결제 완료',failed:'결제 실패',cancelled:'결제 취소',refunded:'환불 완료'};
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function won(v){return Number(v||0).toLocaleString('ko-KR')+'원';}
 function date(v){return String(v||'').replaceAll('-','.');}
 function stamp(v){if(!v)return '';var d=new Date(String(v).replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(v)?'':'Z'));return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):String(v);}
 function state(p){
  if(p.payment_status==='refunded')return {key:'refunded',label:'환불 완료',tone:'neutral',hint:'결제가 환불되었습니다. 기존 등록 이력은 상세 내역에서 확인하세요.'};
  if(p.refund_hold||Number(p.refunded_amount)>0)return {key:'hold',label:'취소 확인 중',tone:'attention',hint:'취소 내역 확인이 필요해 자동 등록이 보류되었습니다.'};
  if(p.payment_status!=='paid')return {key:'payment',label:paymentLabels[p.payment_status]||'결제 확인 필요',tone:'neutral',hint:['failed','cancelled'].includes(p.payment_status)?'결제가 완료되지 않았습니다.':'결제 결과를 확인 중입니다. 중복 결제하지 말고 잠시 후 새로고침해 주세요.'};
  if(p.refund_requested_at&&!p.refund_reviewed_at)return {key:'cancel',label:'취소 문의 접수',tone:'attention',hint:'담당자가 확인 중입니다. 문의 접수만으로 결제가 취소되지는 않습니다.'};
  var states={
   waiting:{key:'waiting',label:'입차 대기',tone:'waiting',hint:'입차가 확인되면 등록이 진행됩니다.'},
   requested:{key:'requested',label:'등록 대기',tone:'waiting',hint:'입차 요청이 접수되었습니다. 등록 완료를 기다려 주세요.'},
   processing:{key:'processing',label:'등록 중',tone:'progress',hint:'주차권을 등록하고 있습니다.'},
   applied:{key:'applied',label:'등록 완료',tone:'success',hint:'출차 시 추가 요금이 있으면 현장에서 정산해 주세요.'},
   issue:{key:'issue',label:'확인 필요',tone:'attention',hint:'담당자가 확인 중입니다. 출차 전 카카오톡으로 문의해 주세요.'}
  };
  return states[p.status]||{key:'unknown',label:'확인 필요',tone:'attention',hint:'등록 상태를 확인해 주세요.'};
 }
 function open(key,expanded){return expanded&&expanded.has(key)?' open':'';}
 function card(p,r,options){
  var s=state(p),paid=p.payment_status==='paid',refund=p.refund_hold||Number(p.refunded_amount)>0;
  var pending=p.refund_requested_at&&!p.refund_reviewed_at,oid=esc(p.oid);
  var action=paid&&!refund&&!pending&&p.status==='waiting';
  var canArrive=!!r.accepting_arrivals&&p.visit_date===options.today;
  return '<article class="pk-receipt-card pk-tone-'+s.tone+'" data-oid="'+oid+'" aria-label="'+esc(p.plate)+' · '+s.label+'">'
   +'<div class="pk-receipt-top"><h2>'+esc(p.plate)+'</h2><span class="pk-state pk-tone-'+s.tone+'">'+(s.key==='applied'?'<span aria-hidden="true">✓ </span>':'')+s.label+'</span></div>'
   +'<p class="pk-receipt-meta">'+esc(p.ticket_label)+' · '+won(p.price)+'</p>'
   +'<p class="pk-receipt-hint">'+esc(s.hint)+'</p>'
   +(action?'<button class="btn btn-primary" data-action="arrive"'+(canArrive?'':' disabled')+'>입차했어요 · 등록 요청</button>'+(!canArrive?'<p class="pk-help">이용일 10:00부터 23:50 전까지 입차 요청이 가능합니다.</p>':''):'')
   +'<details class="pk-receipt-more" data-detail-key="'+oid+':detail"'+open(p.oid+':detail',options.expanded)+'><summary>차량 상세 내역</summary><dl class="pk-detail"><dt>이용일</dt><dd>'+esc(date(p.visit_date))+'</dd><dt>주문번호</dt><dd>'+oid+'</dd>'
   +(p.applied_at?'<dt>기존 등록 이력</dt><dd>'+esc(stamp(p.applied_at))+'</dd>':'')
   +(p.daily_terms?'<dt>일일권 조건</dt><dd>'+esc(p.daily_terms)+'</dd>':'')
   +(p.refunded_amount?'<dt>취소 금액</dt><dd>'+won(p.refunded_amount)+'</dd>':'')
   +'</dl></details>'
   +(paid&&!refund?'<details class="pk-receipt-more" data-detail-key="'+oid+':cancel"'+open(p.oid+':cancel',options.expanded)+'><summary>취소·차량번호 정정 문의</summary><label class="pk-label"><span>문의 사유</span><textarea class="textarea" data-reason maxlength="300"></textarea></label><button class="btn btn-light" data-action="cancel" type="button">문의 접수</button></details>':'')
   +'</article>';
 }
 function render(r,options){
  options=options||{};var items=r.batch?r.items:[r.order],payment=r.batch?r.payment:{oid:r.order.payment_oid||r.order.oid,status:r.order.payment_status,price:r.order.price,refunded_amount:r.order.refunded_amount};
  var counts={};items.forEach(function(p){var s=state(p);if(!counts[s.key])counts[s.key]={label:s.label,tone:s.tone,n:0};counts[s.key].n++;});
  var days=[...new Set(items.map(function(p){return p.visit_date;}))],paymentLabel=paymentLabels[payment.status]||'결제 확인 필요';
  var registering=items.some(function(p){return ['waiting','requested','processing'].includes(state(p).key);});
  return '<div class="pk-receipt-summary"><div class="pk-summary-top"><span class="pk-payment-state">'+esc(paymentLabel)+'</span><strong>'+won(payment.price)+'</strong></div>'
   +'<p class="pk-receipt-meta">'+(days.length===1?'이용일 '+esc(date(days[0]))+' · ':'')+items.length+'대</p>'
   +'<div class="pk-status-counts" aria-label="차량별 등록 현황" aria-live="polite" aria-atomic="true">'+Object.values(counts).map(function(c){return '<span class="pk-state pk-tone-'+c.tone+'">'+c.label+' '+c.n+'대</span>';}).join('')+'</div>'
   +'<details class="pk-receipt-more" data-detail-key="payment"'+open('payment',options.expanded)+'><summary>결제 상세 보기</summary><dl class="pk-detail"><dt>결제번호</dt><dd>'+esc(payment.oid)+'</dd>'+(payment.refunded_amount?'<dt>취소 누적</dt><dd>'+won(payment.refunded_amount)+'</dd>':'')+'</dl></details></div>'
   +(registering?'<p class="pk-receipt-guidance">결제·입차 확인 후 등록까지 최대 약 5분 소요 · 출차 전 <b>등록 완료</b>를 확인해 주세요.</p>':'')
   +'<div class="pk-receipt-list">'+items.map(function(p){return card(p,r,options);}).join('')+'</div>'
   +'<div class="pk-receipt-actions"><button class="btn btn-light" id="pk-refresh">상태 새로고침</button><button class="btn btn-light" id="pk-copy">구매 링크 복사</button><a class="btn btn-light" href="https://pf.kakao.com/_LnxbmX/chat" target="_blank" rel="noopener">카카오톡 문의</a><a class="text-link" href="/parking/purchase/">주차권 추가 구매 →</a></div>'
   +'<p class="pk-help">구매 링크를 보관하면 다른 기기에서도 내역을 확인할 수 있습니다.</p>';
 }
 function needsRefresh(p){return !['failed','refunded','cancelled'].includes(p.payment_status)&&state(p).key!=='applied';}
 return {state:state,render:render,needsRefresh:needsRefresh};
});
