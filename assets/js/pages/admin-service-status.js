(function(){
 'use strict';
 var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT;if(!X||!M)return;
 var names={catering:'출장뷔페',reception:'케이터링',cocktail:'칵테일'},states={pending:'상담 중',confirmed:'이용 확정',cancelled:'취소'};
 var panel=document.createElement('div');panel.id='adm-service-popover';panel.className='adm-service-popover';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','asp-title');
 var tooltip=document.createElement('div');tooltip.id='adm-food-tooltip';tooltip.className='adm-food-tooltip';tooltip.hidden=true;tooltip.setAttribute('role','tooltip');document.body.append(panel,tooltip);
 var trigger=null,target='',info=null,busy=false,request=0,dot=null,pinned=false,hideTimer,suppressDot=null;
 function place(el,anchor){
  if(!anchor||!anchor.isConnected)return;
  var vp=window.visualViewport,w=vp?vp.width:innerWidth,h=vp?vp.height:innerHeight,left=vp?vp.offsetLeft:0,top=vp?vp.offsetTop:0,r=anchor.getBoundingClientRect();
  el.style.maxHeight=Math.max(100,h-24)+'px';el.style.left=(left+12)+'px';el.style.top=(top+12)+'px';
  var box=el.getBoundingClientRect(),x=Math.max(left+12,Math.min(r.left,left+w-box.width-12)),y=r.bottom+8;
  if(y+box.height>top+h-12)y=Math.max(top+12,r.top-box.height-8);
  el.style.left=x+'px';el.style.top=y+'px';
 }
 function dismiss(focus){
  if(busy)return;request++;panel.hidden=true;
  if(trigger){trigger.setAttribute('aria-expanded','false');if(focus&&trigger.isConnected)trigger.focus({preventScroll:true});}
  trigger=null;target='';info=null;
 }
 function paint(message){
  var kind=info?info.kind:target.split('/')[2];
  panel.innerHTML='<div class="asp-head"><strong id="asp-title">'+X.esc(names[kind]||'식음료')+' 상태 변경</strong><button type="button" class="btn btn-light btn-xs" data-asp-close aria-label="상태 변경 닫기"'+(busy?' disabled':'')+'>닫기</button></div>'
   +(info?'<p class="asp-customer">'+X.esc(info.name)+'</p><div class="asp-options" role="group" aria-label="진행 상태">'+Object.keys(states).map(function(s){return '<button type="button" class="btn btn-light asp-option'+(s===info.status?' is-current':'')+'" data-asp-status="'+s+'" aria-pressed="'+(s===info.status)+'"'+(busy||(s==='confirmed'&&!info.can_confirm)?' disabled':'')+'>'+states[s]+'</button>';}).join('')+'</div><p class="tiny muted">'+(!info.can_confirm?'확정하려면 식음료 서비스에서 코스·인원·금액을 먼저 정해 주세요.':'견적에 포함한 식음료를 취소하면 합계에서 제외됩니다. 변경한 예약은 확정서를 다시 발급해 주세요.')+'</p><button type="button" class="linkish" data-asp-config'+(busy?' disabled':'')+'>식음료 구성 확인 →</button>':'<p class="small">불러오는 중…</p>')
   +'<p class="asp-message small" role="status" aria-live="polite">'+X.esc(message||'')+'</p>';
  panel.setAttribute('aria-busy',String(busy));place(panel,trigger);
 }
 function read(message){
  var id=++request;
  return X.A('/reservation-services/'+target).then(function(r){if(id!==request)return;info=r;paint(message);}).catch(function(e){if(id!==request)return;if(!X.guard(e)){panel.innerHTML='<div class="asp-head"><strong id="asp-title">식음료 상태</strong><button class="btn btn-light btn-xs" type="button" data-asp-close>닫기</button></div><p class="small" role="alert">'+X.esc(e.message||'상태를 불러오지 못했습니다.')+'</p><button type="button" class="btn btn-light btn-sm" data-asp-retry>다시 불러오기</button>';place(panel,trigger);}});
 }
 function open(button){
  if(busy)return;if(trigger===button&&!panel.hidden){dismiss(true);return;}
  dismiss(false);hideTip();trigger=button;target=button.dataset.serviceTarget;info=null;button.setAttribute('aria-expanded','true');panel.hidden=false;paint();panel.querySelector('[data-asp-close]').focus({preventScroll:true});read();
 }
 function save(status){
  if(busy||!info||status===info.status)return;
  busy=true;paint('저장 중…');
  var oldTarget=target,oldTrigger=trigger;
  X.A('/reservation-services/'+target,{method:'PUT',body:{status:status,expected_revision:info.revision}}).then(function(r){
   busy=false;dismiss(false);window.dispatchEvent(new CustomEvent('admin-service-status-saved',{detail:{target:oldTarget,status:r.status}}));
   M.toast((names[r.kind]||'식음료')+'를 '+states[r.status]+' 상태로 변경했습니다.'+(r.confirm_doc_invalidated?' 예약확정서를 다시 발급해 주세요.':''));
   var oldView=oldTrigger.closest('.adm-view'),id=oldTarget;
   setTimeout(function(){var next=Array.from(document.querySelectorAll('[data-service-target]')).find(function(e){return e.dataset.serviceTarget===id&&e.getClientRects().length;});if(next)next.focus({preventScroll:true});else if(oldView){var fallback=oldView.querySelector('#bk-service-filter,#rs-service-filter');if(fallback)fallback.focus({preventScroll:true});}},200);
  }).catch(function(e){busy=false;if(!X.guard(e))read(e.message||'저장하지 못했습니다. 다시 시도해 주세요.');else dismiss(false);});
 }
 function hideTip(){clearTimeout(hideTimer);tooltip.hidden=true;pinned=false;if(dot){dot.setAttribute('aria-expanded','false');dot.removeAttribute('aria-describedby');}dot=null;}
 function showTip(button,pin){
  if(!panel.hidden)return;
  clearTimeout(hideTimer);var values;try{values=JSON.parse(button.dataset.foodInfo);}catch{return;}
  values=values.filter(function(s){return names[s.kind]&&states[s.status];});if(!values.length)return;
  if(dot&&dot!==button)hideTip();dot=button;pinned=!!pin;button.setAttribute('aria-expanded','true');button.setAttribute('aria-describedby',tooltip.id);
  tooltip.innerHTML='<strong>'+X.esc(button.dataset.foodCustomer||'식음료 진행 상태')+'</strong>'+values.map(function(s){return '<div><span>'+names[s.kind]+'</span><b class="cat-st cat-'+s.status+'">'+states[s.status]+'</b></div>';}).join('');
  tooltip.hidden=false;place(tooltip,button);
 }
 document.addEventListener('click',function(e){
  var chip=e.target.closest('[data-service-target]');if(chip){e.preventDefault();e.stopPropagation();open(chip);return;}
  var button=e.target.closest('[data-food-info]');if(button){e.preventDefault();e.stopPropagation();if(dot===button&&pinned)hideTip();else showTip(button,true);return;}
  if(panel.contains(e.target)){
   if(e.target.closest('[data-asp-close]'))dismiss(true);
   if(e.target.closest('[data-asp-retry]')){paint();read();}
   var status=e.target.closest('[data-asp-status]');if(status)save(status.dataset.aspStatus);
   if(e.target.closest('[data-asp-config]')&&info){var current=info;dismiss(false);if(current.inquiry_ref&&current.kind==='reception'&&X.openReception)X.openReception(current.inquiry_ref);else if(current.inquiry_ref&&current.kind==='cocktail'&&X.openCocktail)X.openCocktail(current.inquiry_ref);else X.go(current.configuration_view);}
   return;
  }
  dismiss(false);if(!tooltip.contains(e.target))hideTip();
 },true);
 document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!panel.hidden){e.preventDefault();dismiss(true);}if(dot){var previous=dot;hideTip();suppressDot=previous;previous.focus({preventScroll:true});setTimeout(function(){suppressDot=null;},0);}}});
 document.addEventListener('pointerover',function(e){var button=e.target.closest('[data-food-info]');if(button&&matchMedia('(hover:hover)').matches)showTip(button,false);else if(tooltip.contains(e.target))clearTimeout(hideTimer);});
 document.addEventListener('pointerout',function(e){if(!pinned&&(e.target.closest('[data-food-info]')||tooltip.contains(e.target)))hideTimer=setTimeout(hideTip,150);});
 document.addEventListener('focusin',function(e){var button=e.target.closest('[data-food-info]');if(button&&button!==suppressDot)showTip(button,false);else if(dot&&!tooltip.contains(e.target))hideTip();});
 window.addEventListener('hashchange',function(){dismiss(false);hideTip();});
 window.addEventListener('resize',function(){if(!panel.hidden)place(panel,trigger);if(dot)place(tooltip,dot);});
 document.addEventListener('scroll',function(e){if(panel.contains(e.target)||tooltip.contains(e.target))return;if(!panel.hidden)place(panel,trigger);if(dot)hideTip();},true);
})();
