/* Saved buffet and cocktail selections shared by admin quotes and documents. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MEGASPOT_FOOD_SERVICES=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var types=['catering','cocktail'];
  function amount(kind,value){if(!value||value.status==='cancelled'||value.removed)return 0;return Math.max(0,Number(kind==='cocktail'?(value.vat_excluded===true?value.total:value.price):value.total)||0);}
  function key(kind,value){if(!value)return '';var fields=kind==='catering'?['course','people','bill_people','bbq','beer','fee','total','status','note','meal_time','removed']:['cups','price','bartender_fee','subtotal','vat','total','vat_excluded','pricing_version','pricing_revision','menus','nonalcohol','note','status'];return JSON.stringify(fields.map(function(k){var v=value[k];return k==='status'?(v||'pending'):v==null?'':v;}));}
  function isRow(kind,row){return row.kind===kind||(kind==='catering'&&/^출장뷔페 ·/.test(row.label||''));}
  function publicCocktail(value){var out={};['cups','price','bartender_fee','subtotal','vat','total','vat_excluded','pricing_version','pricing_revision','unit','menus','menu_names','nonalcohol','note','summary','status','by','kind','amount','included','removed'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(value,k))out[k]=value[k];});return out;}
  function extra(kind,value){var row={kind:kind,label:(kind==='catering'?'출장뷔페 · ':'출장 칵테일 · ')+(value.summary||'저장 구성'),amount:amount(kind,value)};row[kind]=JSON.parse(JSON.stringify(kind==='cocktail'?publicCocktail(value):value));return row;}
  function state(data){return JSON.stringify(types.map(function(kind){return [key(kind,data[kind]),!!data[kind+'_in_quote'],Number(data['included_'+kind+'_amount'])||0];}));}
  function syncQuote(input,data,fresh){
    var out=JSON.parse(JSON.stringify(input||{}));out.extras=Array.isArray(out.extras)?out.extras:[];out.note=String(out.note||'');out.reception_revision=Number(data.reception_revision)||0;out.food_state=state(data);
    types.forEach(function(kind){var value=data[kind],had=out.extras.some(function(x){return isRow(kind,x);}),prefix=kind==='catering'?'출장뷔페 상태: ':'칵테일 상태: ';
      var include=!out[kind+'Excluded']&&(fresh||data[kind+'_in_quote']||had||out[kind+'Requested']);out[kind+'Requested']=!!(include&&value);if(!value)return;
      out.extras=out.extras.filter(function(x){return !isRow(kind,x);});out.note=out.note.split('\n').filter(function(x){return x.indexOf(prefix)!==0;}).join('\n');
      if(value.status==='cancelled'||value.removed)out.note+=(out.note?'\n':'')+prefix+'취소 · 합계 제외';
      else if(include&&amount(kind,value)>0)out.extras.push(extra(kind,value));
      else if(include)out.note+=(out.note?'\n':'')+prefix+'상담 후 견적 · 금액 미정';
    });return out;
  }
  function current(input,data){
    if(input&&input.reception_revision!=null&&Number(input.reception_revision)!==(Number(data.reception_revision)||0))return false;if(input&&input.food_state!=null)return input.food_state===state(data);
    return types.every(function(kind){var row=(input&&input.extras||[]).find(function(x){return isRow(kind,x);}),value=data[kind];if(!row)return !(data[kind+'_in_quote']&&amount(kind,value)>0);return amount(kind,value)===Number(row.amount)&&(!row[kind]||key(kind,row[kind])===key(kind,value));});
  }
  function documents(data,total){return types.filter(function(kind){return !!data[kind];}).map(function(kind){var value=data[kind];return {...JSON.parse(JSON.stringify(kind==='cocktail'?publicCocktail(value):value)),kind:kind,amount:kind==='cocktail'?Number(value.vat_excluded===true?value.total:value.price)||null:Number(value.total)||null,included:amount(kind,value)>0&&Number(data['included_'+kind+'_amount'])===amount(kind,value)&&total!=null&&Number(total)>=amount(kind,value)};});}
  function rows(value,show){
    var kind=value.kind,label=kind==='catering'?'출장뷔페':'출장 칵테일',out=[],won=function(n){return Number(n).toLocaleString('ko-KR')+'원';};
    if(kind==='catering'){
      out.push(['코스 · 식사 인원',(value.course_name||'옵션 구성')+' · '+(value.people?value.people+'명':'인원 협의')+(value.bill_people&&value.bill_people!==value.people?' (계산 '+value.bill_people+'명)':'')]);
      var parts=[value.bbq_name?'바베큐 '+value.bbq_name:'',value.beer?'생맥주 '+value.beer+'통':'',value.meal_time?'식사 '+value.meal_time:''].filter(Boolean);if(parts.length)out.push(['추가 구성',parts.join(' · ')]);
    }else{out.push(['패키지',value.cups+'잔']);var names=value.menu_names||(value.menus||[]).map(function(id){return typeof window!=='undefined'&&window.MEGASPOT_COCKTAIL_CALC?window.MEGASPOT_COCKTAIL_CALC.names[id]||id:id;});if(names.length)out.push(['희망 메뉴',names.join(', ')]);if(value.nonalcohol)out.push(['논알코올','논알코올 구성 상담']);}
    var cancelled=value.status==='cancelled'||value.removed;out.push(['진행 상태',cancelled?'취소 · 합계 제외':value.status==='confirmed'?'확정':'대기']);
    if(!cancelled){var included=value.included?'확정 금액에 포함':'확정 금액과 별도 · 합계 미포함';if(show!==false){out.push([label+' 금액',(value.amount==null?'상담 후 견적':won(value.amount))+' · '+included+(kind==='cocktail'?(value.vat_excluded===true?' · 부가세 포함':' · 이전 저장 금액 · 부가세 조건 확인 필요'):' · 부가세 포함')]);if(kind==='cocktail'&&value.vat_excluded===true)out.push(['판매가 · 부가세','판매가 '+won(value.price)+(value.bartender_fee!=null?' + 바텐더 출장 및 제조 '+won(value.bartender_fee):'')+' (부가세 별도) + 부가세 '+won(value.vat)]);if(kind==='catering'&&value.supply!=null&&value.vat!=null)out.push(['산출 내역','공급가 '+won(value.supply)+(value.fee!=null?' (출장·세팅비 '+won(value.fee)+' 포함)':'')+' + 부가세 '+won(value.vat)]);}else out.push(['확정 범위',included]);}
    if(value.note)out.push(['요청·안내',value.note]);return out;
  }
  function documentRows(doc){var out=[];(doc.food_services||[]).forEach(function(value){rows(value,doc.show_amount).forEach(function(row){out.push([(value.kind==='catering'?'출장뷔페 ':'칵테일 ')+row[0],row[1]]);});});return out;}
  return {publicCocktail:publicCocktail,types:types,amount:amount,key:key,isRow:isRow,extra:extra,syncQuote:syncQuote,current:current,documents:documents,rows:rows,documentRows:documentRows};
});
