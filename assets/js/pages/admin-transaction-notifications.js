(function(){
 'use strict';
 var X=window.MEGASPOT_ADMIN,view=document.getElementById('view-transaction-notifications');
 if(!X||!view)return;
 var list=view.querySelector('#tn-list'),info=view.querySelector('#tn-info'),more=view.querySelector('#tn-more'),filter=view.querySelector('#tn-filter');
 var esc=X.esc,next=null,request=0;
 var kinds={booking_confirmed:'예약 확정 · 통합 링크',balance_reminder:'이용료 잔금 안내',rental_paid:'이용료 전액 납부',booking_arrival:'방문 전날 안내',inquiry:'문의 접수',reservation_request:'예약 신청 접수',payment_review:'결제 완료 · 예약 확정 보류',booking_cancelled:'공간 예약 취소',rental_refund:'이용료 환불 완료',parking_partial_refund:'주차권 부분 환불 완료'};
 var statuses={queued:'발송 대기',sending:'발송 처리 중',accepted:'알리고 접수 · 수신 확인 중',delivered:'수신 성공',failed:'실패',unknown:'결과 확인 필요',cancelled:'발송 취소'};
 function row(item){
  var time=new Date(item.occurred_at.replace(' ','T')+'Z');
  var when=isNaN(time)?item.occurred_at:new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(time);
  var target=(item.audience==='admin'?'관리자':'고객')+(item.receiver_last4?' · 끝번호 '+item.receiver_last4:'');
  if(item.channel)target+=' · '+(item.channel==='alimtalk'?'알림톡':'문자');
  var inquiry=item.kind==='inquiry'||item.kind==='reservation_request';
  return '<article class="adm-row"><div class="r1"><strong>'+esc(kinds[item.kind]||item.kind)+'</strong><span>'+esc(statuses[item.status]||item.status)+'</span></div>'
   +'<div class="r2">'+esc(target)+' · '+esc(item.ref)+(item.booking_code&&item.booking_code!==item.ref?' · 예약 '+esc(item.booking_code):'')
   +(item.amount!=null?' · '+esc(Number(item.amount).toLocaleString('ko-KR'))+'원':'')+'</div>'
   +'<div class="r3"><span>'+esc(when)+'</span>'+(inquiry?'<button type="button" class="btn btn-light btn-xs" data-inquiry-ref="'+esc(item.ref)+'">문의 열기</button>':'')+'</div>'
   +(item.error?'<p class="small muted">'+esc(item.error)+'</p>':'')+'</article>';
 }
 async function load(append){
  var current=++request,before=append?next:null;
  more.disabled=true;info.textContent='발송 이력을 불러오는 중입니다.';
  if(!append){next=null;list.replaceChildren();more.hidden=true;}
  try{
   var r=await X.A('/transaction-notifications?status='+encodeURIComponent(filter.value)+(before?'&before='+before:''));
   if(current!==request)return;
   info.textContent=r.enabled?'접수와 수신 성공을 구분해 표시합니다.':'고객·관리자 알림 발송 설정을 확인해 주세요.';
   if(r.items.length)list.insertAdjacentHTML('beforeend',r.items.map(row).join(''));
   else if(!append)list.innerHTML=X.emptyMsg('해당 발송 이력이 없습니다.');
   next=r.next_before;
  }catch(e){if(current===request&&!X.guard(e))info.textContent='발송 이력을 불러오지 못했습니다. 새로고침해 주세요.';}
  finally{if(current===request){more.hidden=!next;more.disabled=false;}}
 }
 X.register('transaction-notifications',function(){load(false);});
 filter.addEventListener('change',function(){load(false);});
 view.querySelector('#tn-reload').addEventListener('click',function(){load(false);});
 more.addEventListener('click',function(){if(next)load(true);});
 list.addEventListener('click',function(event){var button=event.target.closest('[data-inquiry-ref]');if(button)X.openInquiry(button.dataset.inquiryRef);});
})();
