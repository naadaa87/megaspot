/* Shared form behaviour for course references and per-person budgets. */
(function(root){'use strict';
 var C=root.MEGASPOT_RECEPTION_CALC;if(!C)return;
 function bind(o){
  var mode=null,lastFormat=null,last={course:'cf-custom',budget:'cf-custom'},history=false;
  var esc=o.esc||function(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  function display(){
   var budgetMode=C.formatMode(o.format.value)==='budget',co=C.course(o.course.value);
   if(o.label)o.label.textContent=budgetMode?'1인 예산 (부가세 별도)':'희망 구성 · 참고 코스';
   if(o.hint)o.hint.textContent=history?'이전 저장 구성입니다. 새로 변경할 때는 이 제공 방식에 맞는 코스나 예산을 선택해 주세요.':budgetMode?'선택한 1인 예산 × 인원에 배송비와 부가세를 더한 예상 금액입니다. 메뉴·제공량은 상담 후 정합니다.':'테이블 세팅·박스용 1인 가격대별 참고 메뉴입니다. 메뉴는 요청과 계절에 따라 변경 가능합니다.';
   if(o.budgetGroup)o.budgetGroup.hidden=budgetMode;
   if(budgetMode&&co&&C.isBudget(co.id)&&o.budget)o.budget.value=co.price;
  }
  function rebuild(selected,preserve){
   mode=C.formatMode(o.format.value);lastFormat=o.format.value;var rows=C.activeCourses(o.format.value).slice();history=false;
   if(preserve&&selected&&C.course(selected)&&!rows.some(function(c){return c.id===selected;})){rows.push(C.course(selected));history=true;}
   if(!rows.some(function(c){return c.id===selected;}))selected='cf-custom';
   o.course.innerHTML=rows.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(C.choiceLabel(c)+(history&&c.id===selected?' · 이전 저장 구성':''))+'</option>';}).join('');o.course.value=selected;last[mode]=selected;display();
  }
  function sync(){var next=C.formatMode(o.format.value);if(history&&lastFormat!==o.format.value){rebuild('cf-custom',false);}else if(next!==mode){if(mode)last[mode]=o.course.value;rebuild(last[next]||'cf-custom',false);if(next==='budget'&&o.course.value==='cf-custom'&&o.budget)o.budget.value='';}else display();}
  function selected(){last[mode]=o.course.value;history=!!(C.course(o.course.value)&&!C.compatible(o.course.value,o.format.value));if(mode==='budget'&&o.course.value==='cf-custom'&&o.budget)o.budget.value='';display();}
  ['input','change'].forEach(function(event){o.format.addEventListener(event,sync);o.course.addEventListener(event,selected);});
  rebuild(o.course.value||'cf-custom',!!o.preserveLegacy);
  return {sync:sync,load:function(id){rebuild(id||'cf-custom',!!o.preserveLegacy);},refresh:function(){rebuild(o.course.value,!!o.preserveLegacy);}};
 }
 root.MEGASPOT_RECEPTION_CHOICES={bind:bind};
})(typeof window!=='undefined'?window:globalThis);
