/* Classic reception estimate. Shared by the public calculator and inquiry text. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./data/reception-quote.js'));
  else root.MEGASPOT_RECEPTION_CALC=factory(root.MEGASPOT_RECEPTION_QUOTE);
})(typeof window!=='undefined'?window:globalThis,function(D){
  'use strict';
  function won(n){return Number(n).toLocaleString('ko-KR')+'원';}
  function quote(value){
    var raw=typeof value==='number'?String(value):String(value==null?'':value).trim();
    if(!/^\d+$/.test(raw)) return {ok:false,reason:'invalid',message:'인원을 정수로 입력해 주세요.'};
    var people=Number(raw);
    if(!Number.isSafeInteger(people)||people<1) return {ok:false,reason:'invalid',message:'인원을 1명 이상 입력해 주세요.'};
    var band=D.fees.find(function(f){return people<=f.upto;});
    if(!band) return {ok:false,reason:'consult',people:people,message:'301명 이상은 별도 상담으로 견적을 안내합니다.'};
    return {ok:true,course:D.course.id,people:people,unitPrice:D.course.price,food:people*D.course.price,fee:band.price,feeLabel:band.label,total:people*D.course.price+band.price};
  }
  function customerText(value){
    var q=quote(value);
    if(!q.ok) return q.reason==='consult'?'클래식 케이터링 '+q.people+'명 구성의 별도 견적을 상담받고 싶습니다.':q.message;
    return '안녕하세요, 메가스팟입니다.\n문의하신 클래식 케이터링 '+q.people+'명 기준으로 안내드립니다.\n\n'
      +'· 클래식 메뉴: '+won(q.unitPrice)+' × '+q.people+'명 = '+won(q.food)+'\n'
      +'· 출장·세팅·철수 비용: '+won(q.fee)+'\n'
      +'· 총 안내금액: '+won(q.total)+'\n\n'
      +'메뉴: '+D.course.menus.join(', ')+'\n\n'
      +'행사 날짜·시간·장소를 알려주시면 진행 가능 여부와 최종 견적을 안내드리겠습니다.\n'
      +'부가세 적용 여부와 최소 주문 조건은 최종 견적에서 확인해 드립니다. 공간 대관료는 별도입니다.\n'
      +'케이터링 상담: '+D.phone;
  }
  function inquiryText(value){
    var q=quote(value);
    if(!q.ok) return q.reason==='consult'?'출장 케이터링 클래식 '+q.people+'명 구성의 별도 견적을 상담받고 싶습니다.':null;
    return '[출장 케이터링 클래식 상담]\n'
      +'· 인원: '+q.people+'명\n'
      +'· 메뉴: 1인 '+won(q.unitPrice)+' × '+q.people+'명 = '+won(q.food)+'\n'
      +'· 출장·세팅·철수 비용: '+won(q.fee)+'\n'
      +'· 예상 금액: '+won(q.total)+' (부가세 적용 여부 확인 전 · 공간 대관료 별도)\n'
      +'행사 날짜·장소와 메뉴 제공 가능 여부, 최소 주문 조건을 함께 안내해 주세요.';
  }
  return {data:D,quote:quote,won:won,customerText:customerText,inquiryText:inquiryText};
});
