(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./parking-receipt.js'));
 else root.MEGASPOT_ADMIN_PARKING_VIEW=factory(root.MEGASPOT_PARKING_RECEIPT);
})(typeof window!=='undefined'?window:globalThis,function(receipt){
 'use strict';
 var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
 var won=function(v){return v==null?'총액 확인 필요':Number(v).toLocaleString('ko-KR')+'원';};
 var paymentLabels={paid:'결제 완료',created:'미결제',pending:'입금 대기',refunded:'환불 완료',cancelled:'결제 취소',failed:'결제 실패'};
 function purchaseDate(g){
  var stamp=String(g.paid_at||g.created_at||'').trim().replace(' ','T');if(!stamp)return null;
  var date=new Date(stamp+(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(stamp)?'':'Z'));return Number.isNaN(date.getTime())?null:date;
 }
 function dateGroups(list){
  var days=new Map();list.forEach(function(g){
   var date=purchaseDate(g),key=date?date.toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}):'',day=days.get(key);
   if(!day){day={key:key,label:key?key.replace(/-/g,'.'):'구매일 확인 필요',weekday:date?date.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',weekday:'long'}):'',items:[],vehicles:0};days.set(key,day);}
   day.items.push(g);day.vehicles+=g.items.length;
  });return Array.from(days.values()).sort(function(a,b){return b.key.localeCompare(a.key);});
 }
 function purchaseTime(g){
  var date=purchaseDate(g);if(!date)return '';
  var time=date.toLocaleTimeString('sv-SE',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),label=g.paid_at?'구매':'주문';
  var full=date.toLocaleString('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).replace(/-/g,'.');
  return '<span class="pa-purchase-time"><time datetime="'+date.toISOString()+'" title="'+label+' 일시 '+esc(full)+' (한국시간)" aria-label="'+label+' 일시 '+esc(full)+' 한국시간">'+label+' '+esc(time)+'</time></span>';
 }
 function counts(items){var map={};items.forEach(function(p){var s=receipt.state(p);if(!map[s.key])map[s.key]={label:s.label,tone:s.tone,n:0};map[s.key].n++;});return Object.values(map);}
 function groups(items,options){
  options=options||{};
  var map=new Map();items.forEach(function(p){var id=p.payment_oid||p.oid,g=map.get(id);if(!g){g={oid:id,total:p.payment_total!=null?Number(p.payment_total):id===p.oid?Number(p.price):null,status:p.payment_status,name:p.name||'',phone:p.phone||'',paid_at:p.paid_at,created_at:p.created_at,refunded_amount:p.payment_refund_amount||p.refunded_amount||0,items:[]};map.set(id,g);}g.items.push(p);});
  var priority={hold:0,cancel:0,issue:0,unknown:0,processing:1,requested:2,waiting:3,applied:4,resolved:4};
  return Array.from(map.values()).map(function(g){g.items.sort(function(a,b){return Number(b.matched!==false)-Number(a.matched!==false)||(['applied_desc','newest_desc'].includes(options.sort)?0:(priority[receipt.state(a).key]??5)-(priority[receipt.state(b).key]??5));});g.counts=counts(g.items);return g;});
 }
 function badges(list){return list.map(function(s){return '<span class="pk-state pk-tone-'+s.tone+'">'+s.label+' '+s.n+'대</span>';}).join('');}
 function facts(p){
  if(p.status==='resolved')return '관리자 확인 완료 · 추가 자동 등록 종료';
  if(!p.session_id)return '입차 확인 후 무료 1시간 우선 적용';
  var free=p.free_hours===1?'무료 1시간 우선':p.free_external?'기존 무료 사용 확인':'무료 배정 내역 확인';
  return free+' · '+(['daily','24h'].includes(p.ticket)?(p.ticket_label||(p.ticket==='24h'?'24시간권 · 입차 후 24시간':'당일권 · 자정 종료')):('유료 '+Number(p.paid_hours||0)+'시간'))+(p.cost!=null?' · 실제 차감 '+won(p.cost):'');
 }
 function vehicle(p,tools,options){
  var state=receipt.state(p),visit=String(p.visit_date||'').replace(/-/g,'.');
  return '<section class="pa-vehicle-card" aria-label="'+esc(p.plate)+' · '+state.label+'"><details class="pa-vehicle-tools" data-vehicle-tools="'+esc(p.oid)+'"'+(options.open&&options.open.has(p.oid)?' open':'')+'><summary><span class="pa-vehicle-number"><strong>'+esc(p.plate)+'</strong><small>이용 '+esc(visit||'이용일 확인 필요')+'</small></span><span class="pa-vehicle-ticket">'+esc(p.ticket_label||p.ticket)+(p.matched===false?'<small class="pa-context">함께 결제한 차량 · 필터 외</small>':'')+'</span><span class="pa-vehicle-price">'+won(p.price)+'</span><span class="pa-vehicle-state pk-state pk-tone-'+state.tone+'">'+state.label+'</span><span class="pa-detail-toggle" aria-hidden="true">상세 <i></i></span></summary><div class="pa-vehicle-body"><p class="pa-vehicle-facts">'+esc(facts(p))+'</p>'+tools(p)+'</div></details></section>';
 }
 function payment(g,tools,options){
  return '<article class="pa-batch" data-payment-oid="'+esc(g.oid)+'" aria-label="'+esc(g.name||'구매자')+' 결제"><header class="pa-batch-head"><div class="pa-batch-buyer"><div class="pa-buyer-line"><h3>'+esc(g.name||'구매자')+'</h3><span class="pa-buyer-phone">'+esc(g.phone)+'</span></div><div class="pa-payment-meta">'+purchaseTime(g)+'<span>'+esc(paymentLabels[g.status]||g.status)+'</span><span>'+g.items.length+'대'+(g.items.length>1?' 함께 결제':'')+'</span></div></div><div class="pa-batch-money"><strong>'+won(g.total)+'</strong>'+(g.refunded_amount?'<span>취소 누적 '+won(g.refunded_amount)+'</span>':'')+'</div></header>'+(g.items.length>1?'<div class="pa-batch-counts">'+badges(g.counts)+'</div>':'')+'<div class="pa-batch-vehicles">'+g.items.map(function(p){return vehicle(p,tools,options);}).join('')+'</div></article>';
 }
 function render(items,tools,options){
  options=options||{};var list=groups(items,options),done=items.filter(function(p){return ['applied','resolved'].includes(p.status);}).length,waiting=items.filter(function(p){return ['waiting','requested','processing'].includes(receipt.state(p).key);}).length;
  var html='<div class="pa-overview" aria-label="검색 결과 요약"><div><span>결제 · 차량</span><strong>'+list.length+'건 · '+items.length+'대</strong></div><div><span>처리 완료</span><strong>'+done+'대</strong></div><div><span>대기·등록 중</span><strong>'+waiting+'대</strong></div><div><span>확인·기타</span><strong>'+(items.length-done-waiting)+'대</strong></div></div>';
  var today=new Date(Date.now()).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
  return html+dateGroups(list).map(function(day){
   var isToday=day.key===today,isOpen=options.dayStates&&options.dayStates.has(day.key)?options.dayStates.get(day.key):isToday;
   return '<details class="pa-day" data-parking-day="'+esc(day.key)+'" aria-label="'+esc(day.label)+' 구매 내역"'+(isOpen?' open':'')+'><summary class="pa-day-head"><h2>'+esc(day.label)+' <span>'+esc(day.weekday)+'</span>'+(isToday?'<b class="pa-day-today">오늘</b>':'')+'</h2><span class="pa-day-meta">'+day.items.length+'건 · '+day.vehicles+'대 <i aria-hidden="true"></i></span></summary><div class="pa-day-orders">'+day.items.map(function(g){return payment(g,tools,options);}).join('')+'</div></details>';
  }).join('');
 }
 // 아마노에 등록해도 되는 결제인지 (2026-11-28). 결제 완료이고 취소·환불·검토 전 취소 문의가 없을 때만 ok.
 // 서버도 같은 조건으로 막지만, 담당자가 화면을 보고 아마노에 직접 등록하는 일을 막기 위해 카드에 크게 표시합니다.
 function registrationGate(p){
  var unpaid={created:'결제 미완료(결제요청 상태)',pending:'입금 대기(결제 전)',cancelled:'결제 취소',failed:'결제 실패',refunded:'환불 완료'};
  if(!p||p.payment_status!=='paid')return {ok:false,label:(unpaid[p&&p.payment_status]||'결제 확인 필요')+' · 아마노 등록 금지'};
  if(Number(p.refunded_amount)>0||p.refund_hold)return {ok:false,label:'취소·환불 내역 있음 · 아마노 등록 금지'};
  if(p.refund_requested_at&&!p.refund_reviewed_at)return {ok:false,label:'취소 문의 검토 전 · 아마노 등록 보류'};
  return {ok:true,label:''};
 }
 return {groups:groups,dateGroups:dateGroups,render:render,counts:counts,registrationGate:registrationGate};
});
