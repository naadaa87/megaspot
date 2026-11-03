/* 이용료 수납과 반환 보증금을 구분하는 공통 정산 계산. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MEGASPOT_SETTLEMENT=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function money(v){return v==null||v===''||!Number.isSafeInteger(Number(v))||Number(v)<0?null:Number(v);}
 function calculate(value){
  value=value||{};var amount=money(value.amount),received=money(value.received)||0,refunded=money(value.refunded)||0,net=received-refunded,over=Math.max(0,-net),review=!!value.review_required||over>0;
  var balance=amount==null||review?null:Math.max(0,amount-net),due=amount==null||review?null:Math.max(0,net-amount);
  return {amount:amount,received:received,refunded:refunded,net:net,balance:balance,refund_due:due,over_refunded:over,review_required:review,status:over>0?'payment_review':value.review_required?'cancelled_review':amount==null?'unpriced':due>0?'refund':balance===0?'paid':net>0?'deposit':'pending'};
 }
 function rows(value){
  if(!value)return [];var s=calculate(value),won=function(n){return Number(n).toLocaleString('ko-KR')+'원';};
  var undecided=s.over_refunded?'수납·환불 기록 확인 필요':s.review_required?'예약 취소 정산 기준 확인 필요':'확정 금액 결정 후 계산';
  var out=[['누적 받은 이용료',won(s.received)],['환불 완료',won(s.refunded)],['현재 수납액',won(s.net)],['남은 잔금',s.balance==null?undecided:won(s.balance)],['초과 수납 환불 필요액',s.refund_due==null?undecided:won(s.refund_due)]];
  if(s.over_refunded)out.push(['정산 확인','환불 완료액이 수납액보다 '+won(s.over_refunded)+' 많습니다. 잘못 기록한 내역을 확인해 주세요.']);return out;
 }
 function documentRows(doc){return doc.show_amount!==false&&doc.settlement?rows(doc.settlement):[];}
 return {calculate:calculate,rows:rows,documentRows:documentRows};
});
