/* Course reception estimate. Shared by the public calculator and inquiry text. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./data/reception-quote.js'));
  else root.MEGASPOT_RECEPTION_CALC=factory(root.MEGASPOT_RECEPTION_QUOTE);
})(typeof window!=='undefined'?window:globalThis,function create(D){
  'use strict';
  function won(n){return Number(n).toLocaleString('ko-KR')+'원';}
  function activeCourses(){return D.activeCatalog?D.activeCatalog.offerings:(D.courses||[D.course]);}
  function activeFormats(){return D.activeCatalog?D.activeCatalog.formats.map(function(f){return {id:f.id,name:f.name};}):Object.keys(D.formats).map(function(id){return {id:id,name:D.formats[id]};});}
  function isActive(id){return activeCourses().some(function(c){return c.id===id;});}
  function course(value){return (D.courses||[D.course]).concat(D.activeCatalog?D.activeCatalog.offerings.concat(D.activeCatalog.retiredOfferings||[]):[]).find(function(c){return c.id===(value==null?D.course.id:value);});}
  function quote(value,format,courseId){
    var selected=course(courseId);
    if(!selected)return {ok:false,reason:'course',message:'케이터링 코스를 선택해 주세요.'};
    var raw=typeof value==='number'?String(value):String(value==null?'':value).trim();
    if(!/^\d+$/.test(raw)) return {ok:false,reason:'invalid',message:'인원을 정수로 입력해 주세요.'};
    var people=Number(raw);
    if(!Number.isSafeInteger(people)||people<1) return {ok:false,reason:'invalid',message:'인원을 1명 이상 입력해 주세요.'};
    var id=format==null?D.defaultFormat:format;
    if(!formatLabel(id))return {ok:false,reason:'format',message:'제공 방식을 선택하면 출장·세팅비를 계산합니다.'};
    var active=String(selected.id).indexOf('cf-')===0,fees=active?D.activeCatalog.feesByFormat:D.feesByFormat;
    if(!fees[id])return {ok:false,reason:'format',message:'현재 제공 방식으로 상담해 주세요.'};
    var band=active&&id!=='table'?fees[id][0]:fees[id].find(function(f){return people<=f.upto;});
    if(active&&id==='table'&&!band&&D.activeCatalog.tableFeeIncrement){var step=D.activeCatalog.tableFeeIncrement,last=fees.table[fees.table.length-1];if(last.price!=null&&step.price!=null)band={price:last.price+Math.ceil((people-last.upto)/step.people)*step.price,label:people+'명 · '+step.people+'명 단위 출장세팅비'};}
    if(!band) return {ok:false,reason:'consult',people:people,format:id,message:'301명 이상은 별도 상담으로 견적을 안내합니다.'};
    if(active&&(selected.price==null||band.price==null||selected.id==='cf-custom'))return {ok:false,reason:'pricing',people:people,course:selected.id,format:id,message:'선택한 구성은 상담 후 견적을 안내합니다. 메뉴·제공량·출장 및 세팅 조건을 함께 확인해 주세요.'};
    return {provider:active?'cafefriends':undefined,providerName:active?'카페프렌즈':undefined,ok:true,course:selected.id,courseName:selected.name,format:id,formatName:formatLabel(id),people:people,unitPrice:selected.price,food:people*selected.price,fee:band.price,feeLabel:band.label,feeName:active?(id==='table'?'출장세팅비':'배송비'):D.feeLabels[id],supply:people*selected.price+band.price,vat:Math.round((people*selected.price+band.price)/10),vat_excluded:true,pricing_version:active?D.activeCatalog.version:'reception-vat-20261104',tax_pending:false,total:people*selected.price+band.price+Math.round((people*selected.price+band.price)/10)};
  }
  function formatLabel(id){return Object.prototype.hasOwnProperty.call(D.formats||{},id)?D.formats[id]:'';}
  function formatText(id){var label=formatLabel(id);return label?'· 희망 제공 방식: '+label+' (포장·기물·세팅 범위 최종 협의)\n':'';}
  function customerText(value,format,courseId){
    var q=quote(value,format,courseId), selected=course(courseId);
    if(!q.ok&&q.reason==='pricing')return requestText({course:courseId,people:value,format:format});
    if(!q.ok) return q.reason==='consult'?selected.name+' 케이터링 '+q.people+'명 구성의 별도 견적을 상담받고 싶습니다.\n'+formatText(format):q.message;
    return '안녕하세요, 메가스팟입니다.\n문의하신 '+q.courseName+' 케이터링 '+q.people+'명 기준으로 안내드립니다.\n\n'
      +formatText(q.format)+'· '+q.courseName+' 메뉴: '+won(q.unitPrice)+' × '+q.people+'명 = '+won(q.food)+'\n'
      +'· '+q.feeName+': '+won(q.fee)+'\n'
      +'· 공급가액 (부가세 별도): '+won(q.supply)+'\n· 부가세 10%: '+won(q.vat)+'\n· 총 안내금액 (부가세 포함): '+won(q.total)+'\n\n'
      +'메뉴: '+selected.menus.join(', ')+'\n'+D.menuNote+'\n\n'
      +'행사 날짜·시간·장소를 알려주시면 진행 가능 여부와 최종 견적을 안내드리겠습니다.\n'
      +'표시 단가와 출장·세팅비는 부가세 별도이며, 위 총 안내금액에는 부가세 10%를 반영했습니다. 최소 주문 조건은 최종 견적에서 확인해 드립니다. 공간 대관료는 별도입니다.\n'
      +'케이터링 상담: '+D.phone;
  }
  function inquiryText(value,format,courseId){
    var q=quote(value,format,courseId), selected=course(courseId);
    if(!q.ok&&q.reason==='pricing')return requestText({course:courseId,people:value,format:format});
    if(!q.ok) return q.reason==='consult'?'출장 케이터링 '+selected.name+' '+q.people+'명 구성의 별도 견적을 상담받고 싶습니다.\n'+formatText(format):null;
    return '[출장 케이터링 '+q.courseName+' 상담]\n'
      +formatText(q.format)+'· 인원: '+q.people+'명\n'
      +'· 메뉴: 1인 '+won(q.unitPrice)+' × '+q.people+'명 = '+won(q.food)+'\n'
      +'· '+q.feeName+': '+won(q.fee)+'\n'
      +'· 공급가액 (부가세 별도): '+won(q.supply)+'\n· 부가세 10%: '+won(q.vat)+'\n· 예상 금액: '+won(q.total)+' (부가세 포함 · 공간 대관료 별도)\n'
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
    var active=String(id).indexOf('cf-')===0;if(active){
      if(fmt&&!D.activeCatalog.formats.some(function(f){return f.id===fmt;}))return null;
      var ids=value.menu_ids==null?[]:value.menu_ids;if(!Array.isArray(ids)||ids.length>30||ids.some(function(mid){return !D.activeCatalog.items.some(function(m){return m.id===mid;});}))return null;
      result.menu_ids=ids.filter(function(mid,i,a){return a.indexOf(mid)===i;});result.menuNames=result.menu_ids.map(function(mid){return D.activeCatalog.items.find(function(m){return m.id===mid;}).name;});
      var budget=value.budget_per_person==null||value.budget_per_person===''?null:Number(value.budget_per_person);if(budget!==null&&(!Number.isSafeInteger(budget)||budget<1||budget>10000000))return null;
      result.budget_per_person=budget;result.provider='cafefriends';result.providerName='카페프렌즈';result.catalog_version=D.activeCatalog.version;
      result.request_note=String(value.request_note||'').slice(0,500);result.supply=result.supply??null;result.vat=result.vat??null;
    }
    result.status='pending';result.vat_excluded=true;result.tax_pending=false;result.menuNote=D.menuNote;
    result.summary=result.courseName+' '+(people?people+'명':'인원 상담')+' · '+result.formatName+(result.total==null?' · 상담 후 견적':' · 메뉴 '+won(result.food)+' + '+result.feeName+' '+won(result.fee));
    if(active&&result.menuNames.length)result.summary+=' · 희망 메뉴 '+result.menuNames.length+'종';
    return result;
  }
  function requestText(value){var r=selection(value);if(!r)return null;return '[출장 케이터링 상담]\n· 희망 구성: '+r.courseName+'\n'+formatText(r.format)+'· 인원: '+(r.people?r.people+'명':'상담 후 결정')+'\n'+(r.menuNames&&r.menuNames.length?'· 희망 메뉴: '+r.menuNames.join(', ')+'\n':'')+(r.budget_per_person?'· 희망 1인 예산: '+won(r.budget_per_person)+' (확정 가격 아님)\n':'')+(r.total!=null?'· 공급가액: '+won(r.supply)+'\n· 부가세 10%: '+won(r.vat)+'\n· 예상 금액: '+won(r.total)+' (부가세 포함)\n':'· 금액: 상담 후 견적 (미확정 금액은 합계 미포함)\n')+'메뉴·출장·세팅비는 부가세 별도이며 최종 공급가액에 부가세 10%를 더합니다.\n선택한 구성과 행사 일정에 맞는 최종 견적을 안내해 주세요.'+(r.request_note?'\n· 요청: '+r.request_note:'');}
  function fromInquiry(data){
    data=data||{};
    if(data.reception){var saved=data.reception,normalized=selection(saved);if(!normalized)return null;var result=Object.assign(normalized,saved);if(saved.total!=null&&saved.vat_excluded!==true)Object.assign(result,{vat_excluded:false,tax_pending:true,supply:null,vat:null,pricing_version:null});return result;}
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
  function revision(data){return Number(data&&data.reception_revision)||0;}
  function syncQuote(input,data,include){
    var copy=JSON.parse(JSON.stringify(input||{})),rec=fromInquiry(data);
    copy.reception_revision=revision(data);copy.receptionRequested=!!(include&&rec);copy.reception_request=include&&rec?forDocument(rec):null;
    if(!rec)return copy;
    copy.extras=(copy.extras||[]).filter(function(x){return x.kind!=='reception';});
    copy.note=String(copy.note||'').split('\n').filter(function(line){return line.indexOf('케이터링 상태: ')!==0&&line.indexOf('케이터링 상담 필요: ')!==0;}).join('\n');
    if(rec.status==='cancelled')copy.note+=(copy.note?'\n':'')+'케이터링 상태: 취소 · 합계 제외 ('+rec.courseName+' '+rec.people+'명 · '+rec.formatName+')';
    else if(include&&rec.total!=null)copy.extras.push({kind:'reception',label:'도시락·핑거푸드 케이터링 · '+rec.summary+(rec.vat_excluded===true?' (부가세 포함)':' (이전 저장 금액 · 부가세 조건 확인 필요)'),amount:rec.total,reception:rec});
    else if(include)copy.note+=(copy.note?'\n':'')+'케이터링 상담 필요: '+rec.summary+(rec.menuNames&&rec.menuNames.length?' · 희망 메뉴: '+rec.menuNames.join(', '):'')+(rec.budget_per_person?' · 희망 1인 예산 '+won(rec.budget_per_person)+' (확정 가격 아님)':'')+(rec.request_note?' · 요청: '+rec.request_note.replace(/\s+/g,' '):'')+' (금액 미정 · 합계 제외)';
    if(include)copy.receptionExcluded=false;
    return copy;
  }
  function quoteCurrent(input,data){
    if(input&&input.reception_revision!=null)return Number(input.reception_revision)===revision(data);
    var saved=(input&&input.extras||[]).find(function(x){return x.kind==='reception';}),rec=fromInquiry(data);
    if(!saved)return !(rec&&rec.status!=='cancelled'&&data.reception_in_quote);
    if(!rec||rec.status==='cancelled'||data.included_reception_amount===0&&!data.reception_in_quote)return false;
    return ['course','people','format','status','note','vat_excluded','supply','vat','provider','menu_ids','budget_per_person','request_note'].every(function(key){return String((saved.reception||{})[key]||(key==='status'?'pending':''))===String(rec[key]||(key==='status'?'pending':''));})&&Number(saved.amount)===Number(rec.total);
  }
  // Documents use stored amounts, so reopening an issued quote never reprices it.
  function forDocument(value,total){
    if(!value||typeof value!=='object')return null;
    var selected=course(value.course),amount=total===undefined?value.total:total;
    var money=function(n){return n!=null&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=0?Number(n):null;};
    var result={course:value.course||'all',courseName:value.courseName||(selected?selected.name:'코스 미정'),people:value.people?Number(value.people):null,format:value.format||'',formatName:value.formatName||formatLabel(value.format)||'제공 방식 상담 후 결정',status:value.status||'pending',total:money(amount),unitPrice:null,food:null,fee:null,feeName:value.feeName||D.feeLabels[value.format]||'출장·세팅 비용',vat_excluded:value.vat_excluded===true,tax_pending:value.vat_excluded!==true,supply:null,vat:null,pricing_version:value.pricing_version||null,note:value.note||'',menuNote:value.menuNote||D.menuNote};
    if(money(value.total)===result.total&&money(value.food)!=null&&money(value.fee)!=null&&Number(value.food)+Number(value.fee)===(result.vat_excluded?money(value.supply):result.total)){result.food=Number(value.food);result.fee=Number(value.fee);result.unitPrice=money(value.unitPrice);}
    if(result.vat_excluded&&money(value.supply)!=null&&money(value.vat)!=null&&Number(value.supply)+Number(value.vat)===result.total){result.supply=Number(value.supply);result.vat=Number(value.vat);}
    ['provider','providerName','catalog_version','menu_ids','menuNames','budget_per_person','request_note'].forEach(function(k){if(value[k]!==undefined)result[k]=value[k];});
    return result;
  }
  return {activeCourses:activeCourses,activeFormats:activeFormats,isActive:isActive,requestText:requestText,create:create,data:D,course:course,selection:selection,fromInquiry:fromInquiry,revision:revision,syncQuote:syncQuote,quoteCurrent:quoteCurrent,forDocument:forDocument,quote:quote,won:won,formatLabel:formatLabel,customerText:customerText,inquiryText:inquiryText};
});
