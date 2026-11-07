/* Public two-room occupancy calendar. Only confirmed time ranges and anonymous waiting counts reach this view. */
(function(){
 'use strict';
 var M=window.MEGASPOT;if(!M)return;
 var rooms=[{id:'megaspot-gundae',name:'건대 1호',opensOn:null},{id:'megaspot-gundae-2',name:'건대 2호',opensOn:'2026-11-13'}],cache=new Map(),DAY=864e5,HOUR=36e5;
 var esc=M.esc,dayMs=function(d){return Date.parse(d+'T00:00:00+09:00');},day=function(n){return new Date(n+9*HOUR).toISOString().slice(0,10);},today=function(){return day(Date.now());};
 function add(d,n){return day(dayMs(d)+n*DAY);}
 function month(d){return d.slice(0,7);}
 function monthStart(m){return m+'-01';}
 function monthEnd(m){return day(Date.UTC(+m.slice(0,4),+m.slice(5,7),1)-9*HOUR-DAY);}
 function shiftMonth(m,n){return day(Date.UTC(+m.slice(0,4),+m.slice(5,7)-1+n,1)-9*HOUR).slice(0,7);}
 function hour(n){return (n>=24?'다음 날 ':'')+String(n%24).padStart(2,'0')+':00';}
 function label(d){return +d.slice(5,7)+'월 '+ +d.slice(8,10)+'일';}
 function knownRoom(id){return rooms.some(function(r){return r.id===id;});}
 function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(dayMs(d))&&day(dayMs(d))===d;}
 function validPayload(j){return j&&j.range&&validDate(j.range.from)&&validDate(j.range.to)&&Number.isFinite(Date.parse(j.updatedAt))&&j.ok===true&&j.timezone==='Asia/Seoul'&&Array.isArray(j.spaces)&&j.spaces.length===2&&Array.isArray(j.intervals)&&Array.isArray(j.unknownDates)&&Array.isArray(j.pendingDates)&&j.pendingDates.every(function(x){return knownRoom(x.space)&&validDate(x.date)&&Number.isSafeInteger(x.count)&&x.count>=0&&Number.isSafeInteger(x.next_wait_no)&&x.next_wait_no===x.count+1;})&&j.intervals.every(function(x){return knownRoom(x.space)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/.test(x.start)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/.test(x.end)&&Date.parse(x.end)>Date.parse(x.start);})&&j.unknownDates.every(function(x){return knownRoom(x.space)&&validDate(x.date);});}
 function loadRange(from,to,fresh){
  var key=from+to,old=cache.get(key);if(!fresh&&old&&Date.now()-old.at<45000)return Promise.resolve(old.data);
  if(fresh)cache.delete(key);
  var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},12000);
  return fetch('/api/reservation-calendar?'+new URLSearchParams({from:from,to:to}),{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'},signal:controller.signal}).then(function(r){if(!r.ok)throw Error('예약 현황을 불러오지 못했습니다. 다시 확인하거나 카카오톡으로 문의해 주세요.');return r.json();}).then(function(j){if(!validPayload(j))throw Error('예약 현황을 확인할 수 없습니다. 다시 확인해 주세요.');cache.set(key,{at:Date.now(),data:j});if(cache.size>20)cache.delete(cache.keys().next().value);return j;}).catch(function(e){if(e.name==='AbortError')throw Error('예약 현황 조회 시간이 초과됐습니다. 새로고침해 주세요.');if(e instanceof TypeError)throw Error('네트워크 연결을 확인하고 다시 시도해 주세요.');throw e;}).finally(function(){clearTimeout(timeout);});
 }
 function selection(data,c){
  var room=rooms.find(function(x){return x.id===c.space;}),start=dayMs(c.date)+c.start*HOUR,end=dayMs(c.date)+c.end*HOUR;
  var closed=!room||c.date<today()||!!(room.opensOn&&c.date<room.opensOn),bad=!validDate(c.date)||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<5||c.end>31||c.end<=c.start;
  var wait=data.pendingDates.find(function(x){return x.space===c.space&&x.date===c.date;}),pending=wait?wait.count:0;
  return {pending_count:pending,next_wait_no:pending+1,payment_blocked:pending>0,closed:closed,invalid:bad,conflict:data.intervals.some(function(it){return it.space===c.space&&start<Date.parse(it.end)&&Date.parse(it.start)<end;}),unknown:data.unknownDates.some(function(it){return it.space===c.space&&dayMs(it.date)<end&&dayMs(add(it.date,1))>start;})};
 }
 function checkRange(c,fresh){if(!validDate(c.date))return Promise.reject(Error('날짜를 확인해 주세요.'));return loadRange(add(c.date,-1),add(c.date,2),fresh).then(function(data){return selection(data,c);});}
 // Reuse the public occupancy model for inline estimates and actionable alternatives.
 function inspectRange(c,fresh){
  if(!validDate(c.date))return Promise.reject(Error('날짜를 확인해 주세요.'));
  return loadRange(add(c.date,-1),add(c.date,2),fresh).then(function(data){
   var status=selection(data,c),start=dayMs(c.date)+c.start*HOUR,end=dayMs(c.date)+c.end*HOUR,duration=c.end-c.start,suggestions=[];
   if(!status.invalid&&(status.conflict||status.unknown||status.closed)){
    var other=rooms.find(function(r){return r.id!==c.space;}),otherChoice=Object.assign({},c,{space:other.id}),v=selection(data,otherChoice);
    if(!v.closed&&!v.invalid&&!v.conflict&&!v.unknown)suggestions.push(otherChoice);
    var candidates=[];
    for(var h=5;!status.unknown&&h+duration<=31;h++){
     if(h===c.start)continue;
     var candidate=Object.assign({},c,{start:h,end:h+duration}),check=selection(data,candidate);
     if(!check.closed&&!check.invalid&&!check.conflict&&!check.unknown)candidates.push(candidate);
    }
    candidates.sort(function(a,b){return Math.abs(a.start-c.start)-Math.abs(b.start-c.start)||a.start-b.start;});
    suggestions=suggestions.concat(candidates.slice(0,3));
   }
   return {status:status,conflicts:data.intervals.filter(function(it){return it.space===c.space&&start<Date.parse(it.end)&&Date.parse(it.start)<end;}),suggestions:suggestions};
  });
 }
 function inquiryUrl(c){return '/inquiry/?'+new URLSearchParams({space:c.space,date:c.date,start:c.start,end:c.end})+'#reserve';}
 function mount(root,options){
  options=options||{};var inEstimate=!!options.embedded,applyLabel=inEstimate?'선택한 일정을 견적에 적용 →':'이 일정으로 견적 계산 →';var date=validDate(options.date)&&options.date>=today()?options.date:today(),maxMonth=shiftMonth(month(today()),11);
  if(month(date)>maxMonth)date=today();
  var st={date:date,month:month(date),space:knownRoom(options.space)?options.space:rooms[0].id,filter:'all',start:Number.isInteger(+options.start)?+options.start:13,end:Number.isInteger(+options.end)?+options.end:17,data:null,loading:true,error:'',busy:false},seq=0,destroyed=false;
  if(st.start<5||st.start>30)st.start=13;if(st.end<=st.start||st.end>31)st.end=Math.min(st.start+4,31);
  var uid='rc-'+Math.random().toString(36).slice(2,8),timer;
  function opts(a,b,pick){var s='';for(var h=a;h<=b;h++)s+='<option value="'+h+'"'+(h===pick?' selected':'')+'>'+hour(h)+'</option>';return s;}
  root.classList.add('reservation-calendar');root.innerHTML='<p class="rc-intro">확정 예약 시간과 호점·날짜별 예약대기 건수를 표시합니다. 대기가 있는 날에는 온라인 결제가 제한되며 대기 신청은 가능합니다. 순번은 같은 호점·이용일 기준으로 정해지고 예약 확정을 뜻하지 않습니다. 준비·정리 시간까지 포함해 선택해 주세요.</p>'
   +'<div class="rc-toolbar"><div class="rc-filters" role="group" aria-label="공간 보기"><button type="button" data-filter="all" aria-pressed="true">1·2호 함께</button><button type="button" data-filter="megaspot-gundae" aria-pressed="false">1호</button><button type="button" data-filter="megaspot-gundae-2" aria-pressed="false">2호</button></div><button type="button" class="btn btn-light btn-sm" data-rc="refresh">새로고침</button></div>'
   +'<p class="rc-updated" role="status" aria-live="polite"></p><div class="rc-error" role="alert" hidden></div>'
   +'<div class="rc-layout"><section class="rc-month" aria-label="월별 확정 예약과 예약대기"><div class="rc-month-head"><button type="button" data-rc="prev" aria-label="이전 달">‹</button><h3 class="rc-month-title"></h3><button type="button" data-rc="next" aria-label="다음 달">›</button></div><div class="rc-weekdays" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="rc-grid" role="group" aria-label="날짜 선택"></div><p class="rc-legend"><span class="rc-room-one">1호 확정 예약</span><span class="rc-room-two">2호 확정 예약</span><span class="rc-wait-legend">점선 표시 · 예약대기 건수</span></p></section>'
   +'<section class="rc-details" aria-label="선택한 날짜의 확정 시간과 예약대기"><div class="rc-details-head"><h3 class="rc-day-title"></h3><button type="button" data-rc="dates">날짜 다시 선택 ↑</button></div><div class="rc-day-detail"></div></section></div>'
   +'<section class="rc-choice" aria-label="견적에 반영할 공간과 시간 선택"><h3>'+(inEstimate?'견적에 반영할 일정':'선택한 일정으로 견적 확인')+'</h3><p class="rc-choice-note">'+(inEstimate?'공간·날짜·시간만 반영합니다. 입력한 인원·식음료·연락처는 유지됩니다.':'원하는 공간과 시간을 고르면 견적 계산 화면으로 이어집니다.')+'</p><div class="rc-choice-fields"><label for="'+uid+'-room">공간<select id="'+uid+'-room" class="select" data-rc="room">'+rooms.map(function(r){return '<option value="'+r.id+'">'+r.name+'</option>';}).join('')+'</select></label><label for="'+uid+'-start">시작<select id="'+uid+'-start" class="select" data-rc="start">'+opts(5,30,st.start)+'</select></label><label for="'+uid+'-end">종료<select id="'+uid+'-end" class="select" data-rc="end">'+opts(6,31,st.end)+'</select></label></div><p class="rc-selected-date"></p><p class="rc-selection-status" role="status" aria-live="polite"></p><button type="button" class="btn btn-primary" data-rc="apply" disabled>'+applyLabel+'</button><a class="rc-help" href="https://pf.kakao.com/_LnxbmX/chat" target="_blank" rel="noopener">시간 조율이 필요하면 카카오톡 문의 ↗</a></section>';
  var $=function(s){return root.querySelector(s);};
  function choice(){return {space:st.space,date:st.date,start:st.start,end:st.end};}
  function dayRanges(id,d){var lo=dayMs(d),hi=lo+DAY;return st.data?st.data.intervals.filter(function(it){return it.space===id&&Date.parse(it.start)<hi&&Date.parse(it.end)>lo;}):[];}
  function waiting(id,d){return st.data?st.data.pendingDates.find(function(x){return x.space===id&&x.date===d;}):null;}
  function hasUnknown(id,d){return st.data&&st.data.unknownDates.some(function(it){return it.space===id&&it.date===d;});}
  function intervalText(it){return it.start.slice(0,10)===it.end.slice(0,10)?it.start.slice(11,16)+'–'+it.end.slice(11,16):label(it.start.slice(0,10))+' '+it.start.slice(11,16)+'–'+label(it.end.slice(0,10))+' '+it.end.slice(11,16);}
  function paintChoice(){
   $('[data-rc=room]').value=st.space;$('[data-rc=start]').value=st.start;$('[data-rc=end]').value=st.end;
   $('[data-rc=room]').querySelectorAll('option').forEach(function(o){var r=rooms.find(function(x){return x.id===o.value;});o.disabled=!!(r.opensOn&&st.date<r.opensOn);});
   $('[data-rc=end]').querySelectorAll('option').forEach(function(o){o.disabled=+o.value<=st.start;});
   $('.rc-selected-date').textContent=label(st.date)+' · '+hour(st.start)+'–'+hour(st.end);
   var v=st.data?selection(st.data,choice()):null,text=st.loading?'예약 현황을 확인하고 있습니다.':!st.data?'예약 현황을 확인한 후 일정을 선택해 주세요.':v.closed?'선택한 공간은 이 날짜에 신청할 수 없습니다. 오픈일 이후 날짜를 골라 주세요.':v.invalid?'시작·종료 시간을 확인해 주세요.':v.conflict?'선택한 시간과 겹치는 확정 예약이 있습니다. 다른 시간이나 다른 호점을 확인해 주세요.':v.unknown?'이 날짜에 확정 예약이 있어 시간 확인이 필요합니다. 카카오톡으로 문의해 주세요.':v.pending_count?'이 호점·이용일에 예약대기 '+v.pending_count+'건이 있습니다. 지금 접수하면 예상 '+v.next_wait_no+'번입니다. 온라인 결제는 제한되며 대기 상담을 신청할 수 있습니다.': '선택한 시간과 겹치는 확정 예약과 현재 예약대기가 없습니다. 상담 신청 시 예상 대기 1번이며, 접수 후 담당자가 순서대로 결제를 안내합니다.';
   $('.rc-selection-status').textContent=text;$('.rc-selection-status').classList.toggle('rc-attention',!!(v&&(v.closed||v.invalid||v.conflict||v.unknown||v.pending_count)));
   $('[data-rc=apply]').disabled=st.loading||st.busy||!v||v.closed||v.invalid||v.conflict||v.unknown;
   $('[data-rc=apply]').textContent=st.busy?'최신 일정 확인 중…':v&&v.pending_count?(inEstimate?'대기 안내 확인하고 일정 적용 →':'이 일정으로 예약 대기 신청 →'):applyLabel;
  }
  function paint(){
   if(destroyed)return;
   root.querySelectorAll('[data-filter]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.filter===st.filter));});
   $('.rc-month-title').textContent=st.month.slice(0,4)+'년 '+ +st.month.slice(5,7)+'월';
   $('[data-rc=prev]').disabled=st.month<=month(today());$('[data-rc=next]').disabled=st.month>=maxMonth;
   $('.rc-updated').textContent=st.loading?'확정 예약·예약대기 확인 중…':st.data?'최근 확인 '+new Date(st.data.updatedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})+' · 1분마다 갱신':'예약 현황을 확인하지 못했습니다.';
   $('.rc-error').hidden=!st.error;$('.rc-error').textContent=st.error;
   var grid='',first=monthStart(st.month),end=monthEnd(st.month),lead=new Date(dayMs(first)+9*HOUR).getUTCDay();
   for(var i=0;i<lead;i++)grid+='<span class="rc-blank" aria-hidden="true"></span>';
   for(var d=first;d<=end;d=add(d,1)){
    var tags='',spoken='';rooms.forEach(function(r,index){if(st.filter!=='all'&&st.filter!==r.id)return;var yes=st.data&&(dayRanges(r.id,d).length||hasUnknown(r.id,d));if(yes){tags+='<span class="rc-dot rc-'+index+'">'+(index+1)+'호</span>';spoken+=' '+r.name+' 확정 예약 있음';}var wait=waiting(r.id,d);if(wait&&wait.count){tags+='<span class="rc-dot rc-wait-dot" aria-hidden="true"><span>'+(index+1)+'호</span><span>대기'+wait.count+'</span></span>';spoken+=' '+r.name+' 예약대기 '+wait.count+'건';}});
    grid+='<button type="button" class="rc-day'+(d===st.date?' is-selected':'')+'" data-day="'+d+'" aria-pressed="'+(d===st.date)+'" aria-label="'+label(d)+esc(st.data?spoken||' 확정 예약 표시 없음':' 예약 현황 확인 필요')+'"'+(d<today()?' disabled':'')+'><b>'+ +d.slice(8,10)+'</b>'+tags+'</button>';
   }
   $('.rc-grid').innerHTML=grid;$('.rc-day-title').textContent=label(st.date)+' 예약 현황';
   $('.rc-day-detail').innerHTML=!st.data?'<p class="rc-empty">'+(st.loading?'예약 현황을 확인하고 있습니다.':'예약 현황을 불러오지 못했습니다. 새로고침하거나 카카오톡으로 문의해 주세요.')+'</p>':rooms.filter(function(r){return st.filter==='all'||st.filter===r.id;}).map(function(r,index){
    var wait=waiting(r.id,st.date),pending=wait?wait.count:0,list=dayRanges(r.id,st.date),unknown=hasUnknown(r.id,st.date),closed=r.opensOn&&st.date<r.opensOn,lo=dayMs(st.date),bars=list.map(function(it){var a=Math.max(0,(Date.parse(it.start)-lo)/DAY*100),b=Math.min(100,(Date.parse(it.end)-lo)/DAY*100);return '<span style="left:'+a+'%;width:'+(b-a)+'%"></span>';}).join('');
    return '<article class="rc-room-card '+(r.id===rooms[0].id?'rc-one':'rc-two')+'"><h4>'+r.name+'</h4>'+(pending?'<div class="rc-pending"><b>예약대기 '+pending+'건 · 다음 접수 예상 '+wait.next_wait_no+'번</b><p>같은 호점·이용일 기준입니다. 온라인 결제는 제한되며 담당자가 순서대로 안내합니다.</p></div>':'')+(closed?'<p class="rc-empty">'+label(r.opensOn)+' 오픈 전</p>':(unknown?'<p class="rc-attention">확정 예약 있음 · 시간 확인 필요</p>':'')+'<div class="rc-time-axis" aria-hidden="true"><span>00시</span><span>06시</span><span>12시</span><span>18시</span><span>24시</span></div><div class="rc-timeline" aria-hidden="true">'+bars+'</div>'+(list.length?'<ul class="rc-times">'+list.map(function(it){return '<li>'+esc(intervalText(it))+' <small>예약 확정</small></li>';}).join('')+'</ul>':!unknown?'<p class="rc-empty">이 날짜에 표시된 확정 예약이 없습니다.</p>':'')+'<button type="button" class="rc-room-use" data-use-room="'+r.id+'">'+r.name+'로 시간 선택 ↓</button>')+'</article>';
   }).join('');paintChoice();
  }
  function load(fresh){
   var token=++seq;st.loading=true;st.error='';paint();
   return loadRange(add(monthStart(st.month),-1),add(monthEnd(st.month),1),fresh).then(function(data){if(token!==seq||destroyed)return;st.data=data;}).catch(function(e){if(token!==seq||destroyed)return;st.data=null;st.error=e.message||'예약 현황을 불러오지 못했습니다. 다시 확인해 주세요.';}).finally(function(){if(token===seq&&!destroyed){st.loading=false;paint();}});
  }
  root.addEventListener('click',function(e){
   var b=e.target.closest('button');if(!b||!root.contains(b))return;
   if(b.dataset.day){st.date=b.dataset.day;paint();if(matchMedia('(max-width:719px)').matches)$('.rc-details').scrollIntoView({block:'start',behavior:'smooth'});return;}
   if(b.dataset.filter){st.filter=b.dataset.filter;if(knownRoom(st.filter))st.space=st.filter;paint();return;}
   if(b.dataset.useRoom){st.space=b.dataset.useRoom;paintChoice();$('.rc-choice').scrollIntoView({block:'nearest',behavior:'smooth'});$('[data-rc=room]').focus({preventScroll:true});return;}
   var action=b.dataset.rc;
   if(action==='dates'){$('.rc-month').scrollIntoView({block:'start',behavior:'smooth'});return;}
   if(action==='refresh'){load(true);return;}
   if(action==='prev'||action==='next'){var next=shiftMonth(st.month,action==='prev'?-1:1);if(next<month(today())||next>maxMonth)return;st.month=next;st.date=next===month(today())?today():monthStart(next);st.data=null;load(true);return;}
   if(action==='apply'){
    var picked=choice(),key=JSON.stringify(picked);st.busy=true;paintChoice();
    checkRange(picked,true).then(function(v){if(destroyed)return;if(JSON.stringify(choice())!==key)throw Error('선택한 일정이 바뀌었습니다. 시간을 다시 확인해 주세요.');if(v.closed||v.invalid||v.conflict||v.unknown){load(true);throw Error(v.conflict?'방금 확정된 예약과 시간이 겹칩니다. 다른 시간을 골라 주세요.':'이 일정은 담당자의 시간 확인이 필요합니다. 날짜를 다시 고르거나 카카오톡으로 문의해 주세요.');}if(options.onSelect)options.onSelect(picked);else location.assign(inquiryUrl(picked));}).catch(function(ex){if(!destroyed){st.error=ex.message;$('.rc-error').textContent=st.error;$('.rc-error').hidden=false;}}).finally(function(){if(!destroyed){st.busy=false;paintChoice();}});
   }
  });
  root.addEventListener('change',function(e){var a=e.target.dataset.rc;if(a==='room'){st.space=e.target.value;if(st.filter!=='all')st.filter=st.space;paint();return;}if(a==='start'){st.start=+e.target.value;if(st.end<=st.start)st.end=st.start+1;}if(a==='end')st.end=+e.target.value;paintChoice();});
  function visibleRefresh(){if(!document.hidden)load(true);}
  timer=setInterval(visibleRefresh,60000);document.addEventListener('visibilitychange',visibleRefresh);load(true);
  return {destroy:function(){destroyed=true;seq++;clearInterval(timer);document.removeEventListener('visibilitychange',visibleRefresh);}};
 }
 function open(options){
  if(document.querySelector('.rc-dialog[open]'))return;
  var opener=document.activeElement,dialog=document.createElement('dialog');dialog.className='rc-dialog';dialog.setAttribute('aria-label','1·2호 예약 현황');dialog.innerHTML='<div class="rc-dialog-head"><h2>1·2호 예약 현황</h2><button type="button" class="rc-close" aria-label="예약 현황 닫기">✕</button></div><div class="rc-dialog-content"></div>';
  document.body.appendChild(dialog);document.body.classList.add('rc-calendar-open');
  var panel=mount(dialog.querySelector('.rc-dialog-content'),Object.assign({},options,{embedded:!!(options&&options.onSelect),onSelect:function(c){dialog.close();if(options&&options.onSelect)options.onSelect(c);else location.assign(inquiryUrl(c));}}));
  dialog.querySelector('.rc-close').onclick=function(){dialog.close();};dialog.addEventListener('click',function(e){if(e.target===dialog){var r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',function(){panel.destroy();document.body.classList.remove('rc-calendar-open');dialog.remove();if(opener&&opener.isConnected)opener.focus({preventScroll:true});},{once:true});dialog.showModal();
 }
 M.reservations={open:open,mount:mount,checkRange:checkRange,inspectRange:inspectRange,invalidate:function(){cache.clear();},inquiryUrl:inquiryUrl};
 function boot(){document.querySelectorAll('[data-reservation-calendar]').forEach(function(root){var q=new URLSearchParams(location.search);mount(root,{space:q.get('space'),date:q.get('date'),start:q.get('start'),end:q.get('end')});});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
