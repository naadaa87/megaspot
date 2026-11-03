/* Course reception estimate. Shared by the public calculator and inquiry text. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./data/reception-quote.js'));
  else root.MEGASPOT_RECEPTION_CALC=factory(root.MEGASPOT_RECEPTION_QUOTE);
})(typeof window!=='undefined'?window:globalThis,function(D){
  'use strict';
  function won(n){return Number(n).toLocaleString('ko-KR')+'원';}
  function course(value){return (D.courses||[D.course]).find(function(c){return c.id===(value==null?D.course.id:value);});}
  function quote(value,format,courseId){
    var selected=course(courseId);
    if(!selected)return {ok:false,reason:'course',message:'케이터링 코스를 선택해 주세요.'};
    var raw=typeof value==='number'?String(value):String(value==null?'':value).trim();
    if(!/^\d+$/.test(raw)) return {ok:false,reason:'invalid',message:'인원을 정수로 입력해 주세요.'};
    var people=Number(raw);
    if(!Number.isSafeInteger(people)||people<1) return {ok:false,reason:'invalid',message:'인원을 1명 이상 입력해 주세요.'};
    var id=format==null?D.defaultFormat:format;
    if(!formatLabel(id))return {ok:false,reason:'format',message:'제공 방식을 선택하면 출장·세팅비를 계산합니다.'};
    var band=D.feesByFormat[id].find(function(f){return people<=f.upto;});
    if(!band) return {ok:false,reason:'consult',people:people,format:id,message:'301명 이상은 별도 상담으로 견적을 안내합니다.'};
    return {ok:true,course:selected.id,courseName:selected.name,format:id,formatName:formatLabel(id),people:people,unitPrice:selected.price,food:people*selected.price,fee:band.price,feeLabel:band.label,feeName:D.feeLabels[id],total:people*selected.price+band.price};
  }
  function formatLabel(id){return Object.prototype.hasOwnProperty.call(D.formats||{},id)?D.formats[id]:'';}
  function formatText(id){var label=formatLabel(id);return label?'· 희망 제공 방식: '+label+' (포장·기물·세팅 범위 최종 협의)\n':'';}
  function customerText(value,format,courseId){
    var q=quote(value,format,courseId), selected=course(courseId);
    if(!q.ok) return q.reason==='consult'?selected.name+' 케이터링 '+q.people+'명 구성의 별도 견적을 상담받고 싶습니다.\n'+formatText(format):q.message;
    return '안녕하세요, 메가스팟입니다.\n문의하신 '+q.courseName+' 케이터링 '+q.people+'명 기준으로 안내드립니다.\n\n'
      +formatText(q.format)+'· '+q.courseName+' 메뉴: '+won(q.unitPrice)+' × '+q.people+'명 = '+won(q.food)+'\n'
      +'· '+q.feeName+': '+won(q.fee)+'\n'
      +'· 총 안내금액: '+won(q.total)+'\n\n'
      +'메뉴: '+selected.menus.join(', ')+'\n'+D.menuNote+'\n\n'
      +'행사 날짜·시간·장소를 알려주시면 진행 가능 여부와 최종 견적을 안내드리겠습니다.\n'
      +'부가세 적용 여부와 최소 주문 조건은 최종 견적에서 확인해 드립니다. 공간 대관료는 별도입니다.\n'
      +'케이터링 상담: '+D.phone;
  }
  function inquiryText(value,format,courseId){
    var q=quote(value,format,courseId), selected=course(courseId);
    if(!q.ok) return q.reason==='consult'?'출장 케이터링 '+selected.name+' '+q.people+'명 구성의 별도 견적을 상담받고 싶습니다.\n'+formatText(format):null;
    return '[출장 케이터링 '+q.courseName+' 상담]\n'
      +formatText(q.format)+'· 인원: '+q.people+'명\n'
      +'· 메뉴: 1인 '+won(q.unitPrice)+' × '+q.people+'명 = '+won(q.food)+'\n'
      +'· '+q.feeName+': '+won(q.fee)+'\n'
      +'· 예상 금액: '+won(q.total)+' (부가세 적용 여부 확인 전 · 공간 대관료 별도)\n'
      +'행사 날짜·장소와 메뉴 제공 가능 여부, 최소 주문 조건을 함께 안내해 주세요.';
  }
  // Save selections separately from prose; incomplete requests stay unpriced.
  function selection(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    var id=value.course,selected=course(id),fmt=value.format==null?'':value.format;
    if(id!=='all'&&(!id||!selected)||fmt!==''&&!formatLabel(fmt))return null;
    var raw=value.people==null?'':String(value.people).trim(),people=raw===''?null:Number(raw);
    if(raw!==''&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(people)||people<1||people>100000))return null;
    var q=selected&&people&&fmt?quote(people,fmt,id):null;
    var result=q&&q.ok?q:{ok:false,course:id,courseName:selected?selected.name:'코스 미정',format:fmt,formatName:formatLabel(fmt)||'제공 방식 상담 후 결정',people:people,unitPrice:selected?selected.price:null,food:null,fee:null,total:null};
    result.status='pending';result.tax_pending=true;result.menuNote=D.menuNote;
    result.summary=result.courseName+' '+(people?people+'명':'인원 상담')+' · '+result.formatName+(result.total==null?' · 상담 후 견적':' · 메뉴 '+won(result.food)+' + '+result.feeName+' '+won(result.fee));
    return result;
  }
  function fromInquiry(data){
    data=data||{};
    if(data.reception){var normalized=selection(data.reception);return normalized?Object.assign(normalized,data.reception):null;}
    var text=String(data.message||'')+'\n'+String(data.summary||'');
    var header=text.match(/\[출장 케이터링 (라이트|클래식|프리미엄|시그니처) 상담\][\s\S]*?(?=\n\s*\n|$)/);
    var line=text.match(/^(?:도시락·핑거푸드(?: 케이터링)? (?:코스 미정|라이트|클래식|프리미엄|시그니처)[^\n]*|출장 케이터링 (?:라이트|클래식|프리미엄|시그니처) (?:구성\(|\d+명 구성)[^\n]*(?:\n·? ?희망 제공 방식:[^\n]*)?)/m);
    if(!header&&!line)return null;
    var sample=header?header[0]:line[0],selected=(D.courses||[D.course]).find(function(c){return sample.indexOf(c.name)>=0;});
    var count=sample.match(/· 인원: (\d+)명/)||sample.match(/(?:라이트|클래식|프리미엄|시그니처)[^\n]*?(\d+)명/);
    var fmt=Object.keys(D.formats).find(function(id){return sample.indexOf(D.formats[id])>=0;})||'';
    var result=selection({course:selected?selected.id:'all',format:fmt,people:count?count[1]:data.headcount});
    var price=sample.match(/· 예상 금액: ([\d,]+)원/)||(!header&&sample.match(/: ([\d,]+)원/));
    if(result&&price)result.requested_total=Number(price[1].replace(/,/g,''));
    return result;
  }
  // Documents use stored amounts, so reopening an issued quote never reprices it.
  function forDocument(value,total){
    if(!value||typeof value!=='object')return null;
    var selected=course(value.course),amount=total===undefined?value.total:total;
    var money=function(n){return n!=null&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=0?Number(n):null;};
    var result={course:value.course||'all',courseName:value.courseName||(selected?selected.name:'코스 미정'),people:value.people?Number(value.people):null,format:value.format||'',formatName:value.formatName||formatLabel(value.format)||'제공 방식 상담 후 결정',status:value.status||'pending',total:money(amount),unitPrice:null,food:null,fee:null,feeName:value.feeName||D.feeLabels[value.format]||'출장·세팅 비용',tax_pending:true,note:value.note||'',menuNote:value.menuNote||D.menuNote};
    if(money(value.total)===result.total&&money(value.food)!=null&&money(value.fee)!=null&&Number(value.food)+Number(value.fee)===result.total){result.food=Number(value.food);result.fee=Number(value.fee);result.unitPrice=money(value.unitPrice);}
    return result;
  }
  return {data:D,course:course,selection:selection,fromInquiry:fromInquiry,forDocument:forDocument,quote:quote,won:won,formatLabel:formatLabel,customerText:customerText,inquiryText:inquiryText};
});
