/* Shared event journey: room conditions, food, visit and a transparent combined estimate. */
(function(){
  'use strict';
  var M=window.MEGASPOT,CC=window.MEGASPOT_CATERING_CALC,CK=window.MEGASPOT_COCKTAIL_CALC,RC=window.MEGASPOT_RECEPTION_CALC;
  if(!M)return;
  var esc=M.esc,key='ms_event_plan_v1',saved={},transient=null,form={};
  try{var raw=JSON.parse(sessionStorage.getItem(key)||'null');if(raw&&Date.now()-raw.t<6*3600e3)saved=raw;}catch(e){}
  form=saved.form||{};
  var q=new URLSearchParams(location.search);
  function won(v){return Math.round(v).toLocaleString('ko-KR')+'원';}
  function persist(){saved.t=Date.now();try{sessionStorage.setItem(key,JSON.stringify(saved));}catch(e){}}
  function capture(root){var data={};if(!root)return data;root.querySelectorAll('input[name],select[name],textarea[name]').forEach(function(x){if(x.type==='checkbox'){if(!data[x.name])data[x.name]=[];if(x.checked)data[x.name].push(x.value);}else data[x.name]=x.value;});return data;}
  function restore(root,data){if(!root||!data)return;root.querySelectorAll('[name]').forEach(function(x){if(!Object.prototype.hasOwnProperty.call(data,x.name))return;if(x.type==='checkbox')x.checked=Array.isArray(data[x.name])?data[x.name].indexOf(x.value)>=0:!!data[x.name];else x.value=data[x.name];});}
  function initial(params,space){var state=transient?transient.state:saved.state||{};var res=Object.assign({},state,params);if(transient)res=Object.assign(res,transient.state);res.opt=state.opt;if(!transient&&params.people!=null&&params.people!=='')res.requestedPeople=params.people;if(res.requestedPeople)res.people=res.requestedPeople;return res;}
  function fields(){return '<div class="plan-fields"><section class="rv-step plan-services" id="event-food"><h4><span>4</span>식음료 선택 <em>필요한 서비스만 더해 주세요</em></h4><p class="hint">든든한 식사는 출장뷔페, 가벼운 식사와 파티는 도시락·핑거푸드, 음료는 칵테일을 골라 주세요.</p>'+(CC?CC.formBlock('rv_cat'):'')+'<div class="f plan-reception"><label class="chk"><input type="checkbox" name="reception_on" value="1"><span><b>도시락·핑거푸드 케이터링</b><small>도시락 / 박스 / 테이블 세팅</small></span></label><div data-reception-body hidden><div class="field-row"><div class="f"><label for="plan-course">코스</label><select class="select" id="plan-course" name="reception_course"><option value="all">상담 후 결정</option>'+(RC?RC.data.courses.map(function(c){return '<option value="'+c.id+'">'+c.name+' · 1인 '+won(c.price)+'</option>';}).join(''):'')+'</select></div><div class="f"><label for="plan-format">제공 방식</label><select class="select" id="plan-format" name="reception_format"><option value="">상담 후 결정</option><option value="lunchbox">도시락</option><option value="box">박스</option><option value="table">테이블 세팅</option></select></div></div><div class="f"><label for="plan-food-people">식사 인원</label><input class="input" id="plan-food-people" name="reception_people" type="number" min="1" max="350" placeholder="비워 두면 대관 인원과 같음"></div><p class="small" data-reception-sum></p><p class="hint">네 코스 모두 제공 방식과 인원별 출장·세팅비를 포함해 계산합니다. 301명 이상은 별도 상담 견적이며 부가세·최소 주문 조건은 최종 확인합니다.</p><a href="/reception/" class="plan-detail">도시락·핑거푸드 메뉴 보기 →</a></div></div>'+(CK?CK.formBlock('rv'):'')+'<div class="plan-service-links"><a href="/catering/">출장뷔페 메뉴 →</a><a href="/cocktail/">칵테일 사진·맛 안내 →</a></div><a class="btn btn-light plan-next" href="#event-visit">다음 · 답사 선택 →</a></section><section class="rv-step plan-visit" id="event-visit"><h4><span>5</span>답사 신청 <em>공간을 보고 결정해도 됩니다</em></h4>'+(M.visitAsk?M.visitAsk('rv_visit'):'')+'<label class="chk mt-2"><input type="checkbox" name="event_date_unknown" value="1">행사 날짜·시간은 상담 후 정할게요</label><p class="hint">답사 희망일과 행사일은 다릅니다. 답사는 담당자가 연락드려 확정합니다.</p><button type="button" class="btn btn-primary plan-next" data-act="review">선택한 구성 · 전체 견적 확인 →</button></section></div>';}
  function reception(root,people){var f=function(n){return root.querySelector('[name="'+n+'"]');};if(!f('reception_on')||!f('reception_on').checked)return null;var n=f('reception_people').value||people,c=f('reception_course').value,fmt=f('reception_format').value;
    if(RC&&RC.course(c)){var name=RC.course(c).name,r=RC.quote(n,fmt,c);return {selection:RC.selection({course:c,people:n,format:fmt}),total:r.ok?r.total:null,summary:RC.inquiryText(n,fmt,c)||'케이터링 '+name+' '+n+'명 · '+r.message,label:'도시락·핑거푸드 '+name+' '+n+'명'+(RC.formatLabel(fmt)?' · '+RC.formatLabel(fmt):''),note:r.ok?'메뉴 '+won(r.food)+' + '+r.feeName+' '+won(r.fee)+' · 부가세 확인 전':r.message};}
    var names={all:'코스 미정',light:'라이트',premium:'프리미엄',signature:'시그니처'};return {selection:RC?RC.selection({course:c,people:n,format:fmt}):null,total:null,label:'도시락·핑거푸드 '+names[c],summary:'도시락·핑거푸드 케이터링 '+names[c]+' · '+n+'명 · '+(RC?RC.formatLabel(fmt):fmt),note:'상담 후 견적'};
  }
  function quote(root,r){var rows=[],pending=[],unknown=!!root.querySelector('[name="event_date_unknown"]:checked');
    rows.push({label:(saved.space==='megaspot-gundae-2'?'건대 2호':'건대 1호')+' 대관 · '+r.people+'명',amount:unknown?null:r.total,note:unknown?'날짜·시간 상담 후 산정':'부가세 포함 · 공간 옵션 포함'});
    var cat=CC&&CC.read(root,'rv_cat',r.people);if(cat)rows.push({label:'출장뷔페 · '+CC.parts(CC.quote(cat)),amount:cat.total||null,note:'부가세·출장비 포함'});
    var rec=reception(root,r.people);if(rec)rows.push({label:rec.label,amount:rec.total,note:rec.note});
    var ck=CK&&CK.read(root);if(ck)rows.push({label:'출장 칵테일 '+ck.cups+'잔',amount:(ck.vat_excluded===true?ck.total:ck.price)||null,note:[ck.menus&&ck.menus.length?'희망 메뉴 '+ck.menus.map(function(id){return CK.names[id];}).join(', '):'',ck.nonalcohol?'논알코올 구성 상담':'',ck.note?'요청 '+ck.note:'',ck.vat_excluded===true?'판매가 '+won(ck.price)+' + 부가세 '+won(ck.vat)+' 포함 · 출장·운영 조건 확인 필요':'이전 저장 금액 · 부가세·출장·운영 조건 확인 전'].filter(Boolean).join(' · ')});
    var total=0;rows.forEach(function(x){if(x.amount==null)pending.push(x.label);else total+=x.amount;});
    var incomplete=unknown||pending.length>0||!!rec||!!ck;
    var visit=M.visitRead?M.visitRead(root,'rv_visit'):null;
    var visitText=visit&&M.visitLabel?'현장답사 희망: '+M.visitLabel(visit):'';
    var html='<dl class="plan-costs">'+rows.map(function(x){return '<div><dt>'+esc(x.label)+'<small>'+esc(x.note)+'</small></dt><dd>'+esc(x.amount==null?'상담 후 안내':won(x.amount))+'</dd></div>';}).join('')+'</dl>'+(visitText?'<p class="plan-visit-summary">'+esc(visitText)+'<small>담당자 확인 후 답사 일정이 확정됩니다.</small></p>':'')+'<div class="plan-total"><span>'+(incomplete?'현재 계산 가능한 소계':'전체 예상 금액')+'</span><b>'+(unknown&&total===0?'상담 후 안내':won(total))+'</b></div><p class="hint">'+(incomplete?'상담 항목과 미확정 부가세·출장 조건은 소계에 포함되지 않았습니다. ':'')+'반환 보증금 '+won(r.deposit)+' 별도. 일정·제공 가능 여부 확인 후 최종 견적을 안내합니다.</p>';
    var text=rows.map(function(x){return x.label+': '+(x.amount==null?'상담 후 안내':won(x.amount))+' ('+x.note+')';}).join('\n')+'\n'+(incomplete?'계산 가능한 소계':'전체 예상 금액')+': '+won(total)+'\n반환 보증금 '+won(r.deposit)+' 별도';
    if(visitText)text+='\n'+visitText;
    return {html:html,total:total,text:text,unknownDate:unknown,incomplete:incomplete,hasFood:!!(cat||rec||ck)};
  }
  function paint(root,r){var head=root.querySelector('[data-out="head"]');if(head){var b=head.querySelector('.plan-summary');if(!b){b=document.createElement('div');b.className='plan-summary';head.appendChild(b);}b.innerHTML='<h4>선택한 행사 구성</h4>'+r.plan.html;}
    var rec=reception(root,r.people),rs=root.querySelector('[data-reception-sum]');if(rs)rs.textContent=rec?(rec.label+' · '+(rec.total==null?rec.note:won(rec.total)+' ('+rec.note+')')):'';
    var mini=root.querySelector('[data-out="mini"]');if(mini){var label=mini.querySelector('span');if(label&&label.firstChild)label.firstChild.nodeValue=r.plan.incomplete?'계산 가능한 소계':'전체 예상 금액';if(r.plan.unknownDate){var sub=mini.querySelector('[data-out="minisub"]');if(sub)sub.textContent='행사 일정 상담 후 결정';}}
    var unknown=root.querySelector('[name="event_date_unknown"]:checked');root.querySelectorAll('.rv-total').forEach(function(b){b.hidden=true;});
  }
  function mergeFields(previous,incoming,params){
    var merged=Object.assign({},previous||{});
    Object.keys(incoming).forEach(function(name){
      if((params.has('catering')&&name.indexOf('rv_cat_')===0)||(params.has('cocktail')&&name.indexOf('cocktail_')===0))merged[name]=incoming[name];
    });
    return merged;
  }
  function bind(root,calc,getPeople){var box=root.querySelector('.plan-fields'),incoming=capture(box),moving=!!transient;restore(box,moving?transient.fields:mergeFields(saved.fields,incoming,q));
    if(!moving&&q.has('reception')){root.querySelector('[name="reception_on"]').checked=true;root.querySelector('[name="reception_course"]').value=q.get('reception');root.querySelector('[name="reception_format"]').value=q.get('reception_format')||'';root.querySelector('[name="reception_people"]').value=q.get('reception_people')||'';}
    if(!moving&&q.get('visit')==='1'){root.querySelector('[name="rv_visit_on"]').checked=true;root.querySelector('[name="event_date_unknown"]').checked=true;}
    if(CC)CC.bind(box,'rv_cat',getPeople);if(CK)CK.bind(box);if(M.visitBind)M.visitBind(box,'rv_visit');
    function sync(){var body=box.querySelector('[data-reception-body]');body.hidden=!box.querySelector('[name="reception_on"]').checked;var vb=box.querySelector('.visit-ask-body');if(vb)vb.hidden=!box.querySelector('[name="rv_visit_on"]').checked;saved.fields=capture(box);persist();}
    box.addEventListener('change',function(){sync();calc();});box.addEventListener('input',function(){sync();calc();});sync();
    root.addEventListener('input',function(e){if(e.target.closest('.rv-apply')){form=capture(root.querySelector('.rv-apply'));saved.form=Object.assign({},form);delete saved.form.rv_agree;persist();}});
    root.addEventListener('change',function(e){if(e.target.closest('.rv-apply')){form=capture(root.querySelector('.rv-apply'));saved.form=Object.assign({},form);delete saved.form.rv_agree;persist();}});
    transient=null;
  }
  function keep(draft){transient=draft;form=draft.form;}
  function saveSpace(st,space){saved.state=JSON.parse(JSON.stringify(st));saved.space=space;persist();}
  function clear(){saved={};transient=null;form={};try{sessionStorage.removeItem(key);sessionStorage.removeItem('ms_catering');sessionStorage.removeItem('ms_cocktail');}catch(e){}}
  var availabilityCache={};
  function availability(root,space,date){
    var key=space+date,box=root.querySelector('.plan-availability');
    if(!box){box=document.createElement('p');box.className='plan-availability hint';root.querySelector('[data-out="date-pick"]').after(box);}
    if(box.dataset.key===key)return;box.dataset.key=key;
    function draw(info){if(box.dataset.key!==key)return;var state=info&&info.state;box.textContent=state==='full'?'이 날짜는 마감으로 표시되어 있습니다. 다른 날짜를 선택하거나 담당자에게 문의해 주세요.':state==='partial'?'일부 시간에 예약이 있습니다. 선택한 이용 시간은 담당자가 확인합니다.':state==='hold'?'임시 확보 중인 일정이 있습니다. 담당자 확인이 필요합니다.':'선택한 날짜의 최종 이용 가능 시간은 담당자가 확인합니다.';box.classList.toggle('plan-attention',!!state);}
    if(availabilityCache[key]){draw(availabilityCache[key]);return;}
    box.textContent='예약 현황 확인 중…';
    M.api('/availability?space='+encodeURIComponent(space)+'&from='+date+'&to='+date).then(function(r){var day=(r.days||{})[date]||{};availabilityCache[key]=day;draw(day);}).catch(function(){if(box.dataset.key===key)box.textContent='예약 현황을 불러오지 못했습니다. 신청 후 담당자가 확인합니다.';});
  }
  function validate(root){var invalid=Array.from(root.querySelectorAll('.plan-fields input')).find(function(x){return x.offsetParent!==null&&!x.checkValidity();});if(invalid){invalid.reportValidity();return false;}return true;}
  M.eventPlan={mergeFields:mergeFields,validate:validate,availability:availability,initial:initial,fields:fields,reception:reception,quote:quote,paint:paint,bind:bind,capture:capture,restore:restore,keep:keep,saveSpace:saveSpace,formDraft:function(){return form;},space:function(){return saved.space;},clear:clear};
})();
