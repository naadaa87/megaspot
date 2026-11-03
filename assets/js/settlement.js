/* 이용료 수납과 반환 보증금을 구분하는 공통 정산 계산. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MEGASPOT_SETTLEMENT=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function money(v){return v==null||v===''||!Number.isSafeInteger(Number(v))||Number(v)<0?null:Number(v);}
 function calculate(value){
  value=value||{};var amount=money(value.amount),received=money(value.received)||0,refunded=money(value.refunded)||0,net=received-refunded,over=Math.max(0,-net),review=!!value.review_required||over>0;
  var c=value.cancellation;if(c&&money(c.fee)!=null){var target=Math.max(0,received-c.fee),excess=Math.max(0,refunded-target),invalid=received<c.fee||excess>0||over>0;return {cancellation:c,amount:c.fee,received:received,refunded:refunded,net:net,refund_target:target,cancellation_over_refunded:excess,over_refunded:over,review_required:invalid,fully_refunded:c.fee===0&&!invalid&&refunded===received,balance:invalid?null:0,refund_due:invalid?null:Math.max(0,target-refunded),status:invalid?'payment_review':target>refunded?'cancellation_refund':'cancellation_settled'};}
  var balance=amount==null||review?null:Math.max(0,amount-net),due=amount==null||review?null:Math.max(0,net-amount);
  return {reconfirmation:value.reconfirmation||null,fully_refunded:!!value.fully_refunded,amount:amount,received:received,refunded:refunded,net:net,balance:balance,refund_due:due,over_refunded:over,review_required:review,status:value.fully_refunded?'refunded':over>0?'payment_review':value.review_required?'cancelled_review':amount==null?'unpriced':due>0?'refund':balance===0?'paid':net>0?'deposit':'pending'};
 }
 function rows(value){
  if(!value)return [];var s=calculate(value),won=function(n){return Number(n).toLocaleString('ko-KR')+'원';};
  var undecided=s.over_refunded?'수납·환불 기록 확인 필요':s.review_required?'예약 취소 정산 기준 확인 필요':'확정 금액 결정 후 계산';
  if(s.cancellation){var c=s.cancellation,out=[['예약 상태','예약 취소 · '+(s.review_required?'정산 확인 필요':s.refund_due?'환불 처리 대기':'정산 완료')],['취소 접수',new Date(Date.parse(c.cancelled_at)+9*3600e3).toISOString().slice(0,16).replace('T',' ')+' (한국시간)'],['원 예약 금액',c.original_amount==null?'미정':won(c.original_amount)],['최초 정산 기준 수납액',won(c.basis_net)],['취소 정산 기준',c.policy_label],['취소 수수료',won(c.fee)],['누적 받은 이용료',won(s.received)],['수수료 제외 환불 대상 총액',won(s.refund_target)],['이미 환불한 금액',won(s.refunded)],['추가 환불 필요액',s.refund_due==null?'취소 정산·환불 기록 확인 필요':won(s.refund_due)],['남은 잔금',s.balance==null?'취소 정산·환불 기록 확인 필요':won(s.balance)],['현재 수납액',won(s.net)],['정산 사유',c.reason]];if(c.mode==='policy'&&c.basis_eligible!=null&&c.basis_eligible!==c.basis_net)out.splice(4,0,['수수료 적용 수납액',won(c.basis_eligible)+' · 원 예약 금액 초과 수납 제외']);if(s.cancellation_over_refunded)out.push(['정산 확인','수수료 제외 환불 대상보다 '+won(s.cancellation_over_refunded)+' 더 환불했습니다. 정산 기준과 실제 환불을 확인해 주세요.']);if(s.received<c.fee)out.push(['정산 확인','수납액이 저장한 수수료보다 작습니다. 수납 기록과 수수료를 확인해 주세요.']);return out;}
  var out=[['누적 받은 이용료',won(s.received)],['환불 완료',won(s.refunded)],['현재 수납액',won(s.net)],['남은 잔금',s.balance==null?undecided:won(s.balance)],['초과 수납 환불 필요액',s.refund_due==null?undecided:won(s.refund_due)]];
  if(s.reconfirmation){out.unshift(['수납 적용 기준','재확정 · 이전 취소 수수료 별도 가산 없음']);out.forEach(function(r){if(r[0]==='남은 잔금')r[0]='다시 받아야 할 금액';});}
  if(s.fully_refunded)out.unshift(['정산 상태','예약 취소 · 전액 환불 완료']);
  if(s.over_refunded)out.push(['정산 확인','환불 완료액이 수납액보다 '+won(s.over_refunded)+' 많습니다. 잘못 기록한 내역을 확인해 주세요.']);return out;
 }
 function cancellationPolicy(date,at){var stamp=Date.parse(at),day=new Date(stamp+9*3600e3).toISOString().slice(0,10),days=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/864e5);return {rate:days>=15?10000:days>=8?8000:days>=6?6000:days>=4?3000:0,days:days,label:days>=15?'이용일 15일 이상 전':days>=8?'이용일 8~14일 전':days>=6?'이용일 6~7일 전':days>=4?'이용일 4~5일 전':'이용일 3일 전부터 · 이용일 경과',day:day};}
 function documentRows(doc){return doc.show_amount!==false&&doc.settlement?rows(doc.settlement):[];}
 return {cancellationPolicy:cancellationPolicy,calculate:calculate,rows:rows,documentRows:documentRows};
});
