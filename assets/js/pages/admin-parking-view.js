(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./parking-receipt.js'));
 else root.MEGASPOT_ADMIN_PARKING_VIEW=factory(root.MEGASPOT_PARKING_RECEIPT);
})(typeof window!=='undefined'?window:globalThis,function(receipt){
 'use strict';
 var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
 var won=function(v){return v==null?'총액 확인 필요':Number(v).toLocaleString('ko-KR')+'원';};
 var paymentLabels={paid:'결제 완료',created:'미결제',pending:'입금 대기',refunded:'환불 완료',cancelled:'결제 취소',failed:'결제 실패'};
 function counts(items){var map={};items.forEach(function(p){var s=receipt.state(p);if(!map[s.key])map[s.key]={label:s.label,tone:s.tone,n:0};map[s.key].n++;});return Object.values(map);}
 function groups(items,options){
  options=options||{};
  var map=new Map();items.forEach(function(p){var id=p.payment_oid||p.oid,g=map.get(id);if(!g){g={oid:id,total:p.payment_total!=null?Number(p.payment_total):id===p.oid?Number(p.price):null,status:p.payment_status,name:p.name||'',phone:p.phone||'',paid_at:p.paid_at,refunded_amount:p.payment_refund_amount||p.refunded_amount||0,items:[]};map.set(id,g);}g.items.push(p);});
  var priority={hold:0,cancel:0,issue:0,unknown:0,processing:1,requested:2,waiting:3,applied:4};
  return Array.from(map.values()).map(function(g){g.items.sort(function(a,b){return Number(b.matched!==false)-Number(a.matched!==false)||(options.sort==='applied_desc'?0:(priority[receipt.state(a).key]??5)-(priority[receipt.state(b).key]??5));});g.counts=counts(g.items);return g;});
 }
 function badges(list){return list.map(function(s){return '<span class="pk-state pk-tone-'+s.tone+'">'+s.label+' '+s.n+'대</span>';}).join('');}
 function facts(p){
  if(!p.session_id)return '입차 확인 후 무료 1시간 우선 적용';
  var free=p.free_hours===1?'무료 1시간 우선':p.free_external?'기존 무료 사용 확인':'무료 배정 내역 확인';
  return free+' · '+(p.ticket==='daily'?'일일권':('유료 '+Number(p.paid_hours||0)+'시간'))+(p.cost!=null?' · 실제 차감 '+won(p.cost):'');
 }
 function render(items,tools,options){
  options=options||{};var list=groups(items,options),done=items.filter(function(p){return receipt.state(p).key==='applied';}).length,waiting=items.filter(function(p){return ['waiting','requested','processing'].includes(receipt.state(p).key);}).length;
  var html='<div class="pa-overview" aria-label="검색 결과 요약"><div><span>결제 · 차량</span><strong>'+list.length+'건 · '+items.length+'대</strong></div><div><span>등록 완료</span><strong>'+done+'대</strong></div><div><span>대기·등록 중</span><strong>'+waiting+'대</strong></div><div><span>확인·기타</span><strong>'+(items.length-done-waiting)+'대</strong></div></div>';
  return html+list.map(function(g){return '<article class="pa-batch" data-payment-oid="'+esc(g.oid)+'"><header class="pa-batch-head"><div><span class="pa-batch-kind">'+(g.items.length>1?g.items.length+'대 함께 결제':'차량 1대 결제')+'</span><h2>'+esc(g.name||'구매자')+' <small>'+esc(g.phone)+'</small></h2><p>'+esc(paymentLabels[g.status]||g.status)+' · 결제번호 '+esc(g.oid)+'</p></div><div class="pa-batch-money"><strong>'+won(g.total)+'</strong>'+(g.refunded_amount?'<span>취소 누적 '+won(g.refunded_amount)+'</span>':'')+'</div></header><div class="pa-batch-counts">'+badges(g.counts)+'</div><div class="pa-batch-vehicles">'+g.items.map(function(p){var s=receipt.state(p);return '<section class="pa-vehicle-card" aria-label="'+esc(p.plate)+' · '+s.label+'"><div class="pa-vehicle-top"><h3>'+esc(p.plate)+'</h3><span class="pk-state pk-tone-'+s.tone+'">'+s.label+'</span></div><p class="pa-vehicle-meta">'+esc(p.ticket_label||p.ticket)+' · '+won(p.price)+' · '+esc(p.visit_date)+'</p>'+(p.matched===false?'<p class="pa-context">함께 결제한 차량 · 현재 필터와 다른 상태</p>':'')+'<p class="pa-vehicle-facts">'+esc(facts(p))+'</p><details class="pa-vehicle-tools" data-vehicle-tools="'+esc(p.oid)+'"'+(options.open&&options.open.has(p.oid)?' open':'')+'><summary>차량 처리 · 상세 내역</summary>'+tools(p)+'</details></section>';}).join('')+'</div></article>';}).join('');
 }
 return {groups:groups,render:render,counts:counts};
});
