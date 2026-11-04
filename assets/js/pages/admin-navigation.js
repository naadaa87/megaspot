/* 업무 순서, 화면 묶음과 설정 위치는 이 파일에서 함께 관리합니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT;if(!X||!M)return;
  var $=function(s){return document.querySelector(s);},nav=$('#adm-nav'),main=$('.adm-main');
  var aliases={'guide-settings':'guide-messages','deposit-settings':'deposit-notifications','parking-settings':'parking','prices-catering':'prices','prices-reception':'prices','prices-cocktail':'prices'};
  var groups=[
    {id:'consult',label:'문의·상담',open:true,items:[['inq','문의 관리'],['quote','견적 계산'],['visits','현장답사']]},
    {id:'booking',label:'예약·일정',open:true,items:[['orders','주문·결제 확인'],['resv','예약 현황'],['guide-messages','이용 안내']]},
    {id:'event',label:'행사·부가서비스',items:[['catering','식음료 서비스'],['parking','주차권 관리']]},
    {id:'after',label:'정산·사후관리',items:[['deposit-refunds','보증금 환급'],['reviews','후기 관리']]},
    {id:'platform',label:'고객·플랫폼',items:[['members','회원'],['meetups','모임 관리'],['hosts','입점·광고 신청'],['listings','등록 공간'],['ads','배너 광고']]},
    {id:'settings',label:'운영 설정',items:[['prices-catering','공급가·판매가'],['guide-settings','알림톡·자동 발송'],['parking-settings','주차 판매·연결 설정']]}
  ];
  var owners={bookings:'resv',calendar:'resv','booking-new':'resv',reception:'catering',cocktail:'catering','deposit-notifications':'deposit-refunds','prices-reception':'prices-catering','prices-cocktail':'prices-catering','deposit-settings':'guide-settings'};
  var labels={dash:'오늘 할 일',bookings:'예약 목록',calendar:'일정 달력','booking-new':'예약 등록',reception:'케이터링',cocktail:'출장 칵테일','deposit-notifications':'보증금 안내 내역','prices-reception':'공급가·판매가','prices-cocktail':'공급가·판매가','deposit-settings':'알림톡·자동 발송'};
  var sections={},storageKey='megaspot.admin.nav.groups.v1',saved={};
  try{var stored=JSON.parse(localStorage.getItem(storageKey)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))saved=stored;}catch(e){}
  var original={};nav.querySelectorAll('button[data-view]').forEach(function(b){original[b.dataset.view]=b;});
  nav.replaceChildren();
  function button(id,label){var b=original[id]||document.createElement('button');b.type='button';b.dataset.view=id;b.classList.remove('on');var counts=Array.from(b.querySelectorAll('em'));b.textContent=label;counts.forEach(function(c){b.appendChild(c);});return b;}
  nav.appendChild(button('dash','오늘 할 일'));
  groups.forEach(function(g,i){
    var d=document.createElement('details');d.className='adm-nav-group';d.dataset.navGroup=g.id;d.open=Object.prototype.hasOwnProperty.call(saved,g.id)?saved[g.id]===true:!!g.open;
    var summary=document.createElement('summary');summary.innerHTML='<span class="adm-nav-step" aria-hidden="true">'+('0'+(i+1)).slice(-2)+'</span><span>'+g.label+'</span><em class="adm-group-count" hidden></em><span class="adm-nav-chevron" aria-hidden="true">⌄</span>';
    d.appendChild(summary);var list=document.createElement('div');list.className='adm-nav-items';
    g.items.forEach(function(item){labels[item[0]]=item[1];list.appendChild(button(item[0],item[1]));});d.appendChild(list);nav.appendChild(d);sections[g.id]=d;
    d.addEventListener('toggle',function(){saved[g.id]=d.open;try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch(e){}});
  });
  var menu=document.createElement('button');menu.type='button';menu.className='adm-menu-toggle';menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-controls','adm-nav');menu.textContent='전체 메뉴';$('.adm-brand').appendChild(menu);
  function closeMenu(){ $('.adm-side').classList.remove('adm-menu-open');menu.setAttribute('aria-expanded','false'); }
  menu.addEventListener('click',function(){var open=$('.adm-side').classList.toggle('adm-menu-open');menu.setAttribute('aria-expanded',String(open));});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&$('.adm-side').classList.contains('adm-menu-open')){closeMenu();menu.focus();}});
  document.addEventListener('click',function(e){if(!e.target.closest('.adm-side')||e.target.closest('.adm-side-foot'))closeMenu();});
  // 외부 채널은 필요할 때 펼칠 수 있도록 업무 메뉴 아래에 둡니다.
  var channels=$('#adm-side-links');if(channels){var box=document.createElement('details');box.className='adm-channel-links';box.innerHTML='<summary>채널 바로가기 ↗</summary>';channels.before(box);box.appendChild(channels);}
  var context=document.createElement('div');context.className='adm-context';context.setAttribute('aria-label','현재 위치');$('.adm-notify-bar').after(context);
  function section(id,title,description){var s=document.createElement('section');s.id='view-'+id;s.className='adm-view';s.hidden=true;var h=document.createElement('header');h.className='adm-head';h.innerHTML='<div><h1>'+title+'</h1><p class="small muted">'+description+'</p></div>';s.appendChild(h);main.appendChild(s);return s;}
  // DOM을 복사하지 않고 옮겨 기존 저장·검증·미저장 입력을 유지합니다.
  var registration=section('booking-new','예약 등록','결제 확인을 마친 예약을 등록합니다. 연결할 문의가 있으면 문의번호를 함께 입력해 주세요.');
  registration.appendChild($('#bk-form'));$('#view-bookings .adm-grid2').classList.add('adm-booking-list-only');
  X.register('booking-new',function(){});
  var prices=section('prices','공급가·판매가','서비스별 공급가와 판매가를 관리합니다. 저장하면 홈페이지·소개서·새 견적에 반영되며 기존 발행 견적은 유지됩니다.');
  [['catering','#catering-pricing','출장뷔페'],['reception','#reception-pricing','테이블·박스 케이터링'],['cocktail','#view-cocktail .ak-economics','출장 칵테일']].forEach(function(item){
    var host=document.createElement('div');host.dataset.priceService=item[0];host.hidden=true;prices.appendChild(host);host.appendChild($(item[1]));
    var work=$('#view-'+item[0]+' .adm-head');var link=document.createElement('button');link.type='button';link.className='btn btn-light btn-sm';link.dataset.go='prices-'+item[0];link.textContent='공급가·판매가 설정';work.appendChild(link);
  });
  // 발주처 설정은 가격표와 함께 두고 실제 발주·견적 화면을 간결하게 유지합니다.
  $('[data-price-service="catering"]').appendChild($('#ct-vendor'));
  X.register('prices-catering',function(){X.loadView('catering');});
  ['guide-settings','deposit-settings','parking-settings'].forEach(function(id){X.register(id,function(){return X.loadView(aliases[id]);});});
  function mark(selector,cls){var el=$(selector);if(el)el.classList.add(cls);return el;}
  mark('#gm-setup','adm-settings-block');mark('#gm-portal-card','adm-settings-block');
  var portalResult=$('#gm-portal-result');portalResult.className='adm-card mt-3';$('#gm-preview').before(portalResult);
  ['#gm-error','#gm-notice','#dn-error','#dn-status','#pa-error'].forEach(function(s){mark(s,'adm-shared-block');});
  var dn=$('#view-deposit-notifications');
  var dnTemplates=$('#dn-templates'),dnPolicy=$('#dn-status').nextElementSibling;
  [dnPolicy,dnTemplates,$('#dn-test').closest('.adm-card'),$('#dn-save').closest('.adm-card')].forEach(function(el){el.classList.add('adm-settings-block');});
  var parking=$('#view-parking');
  parking.querySelectorAll(':scope > details').forEach(function(el){el.classList.add('adm-settings-block');});
  function tabs(view,items,label){
    var s=$('#view-'+view),bar=document.createElement('nav');bar.className='adm-workspace-tabs';bar.setAttribute('aria-label',label);
    items.forEach(function(item){var a=document.createElement('a');a.href='#'+item[0];a.dataset.go=item[0];a.textContent=item[1];bar.appendChild(a);});s.querySelector('.adm-head').after(bar);
  }
  var bookingTabs=[['resv','일자별'],['bookings','예약 목록'],['calendar','달력']];
  ['resv','bookings','calendar'].forEach(function(id){tabs(id,bookingTabs,'예약 현황 보기 방식');$('#view-'+id+' h1').textContent='예약 현황';});
  var foodTabs=[['catering','출장뷔페'],['reception','테이블·박스 케이터링'],['cocktail','출장 칵테일']];
  ['catering','reception','cocktail'].forEach(function(id){tabs(id,foodTabs,'식음료 서비스');$('#view-'+id+' h1').textContent='식음료 서비스';});
  tabs('prices',[['prices-catering','출장뷔페'],['prices-reception','테이블·박스 케이터링'],['prices-cocktail','출장 칵테일']],'서비스별 가격표');
  ['deposit-refunds','deposit-notifications'].forEach(function(id){tabs(id,[['deposit-refunds','환급 관리'],['deposit-notifications','보증금 안내 내역']],'보증금 관리');});
  tabs('guide-messages',[['guide-settings','이용 안내 설정'],['deposit-settings','보증금 알림 설정']],'알림톡 설정');
  tabs('deposit-notifications',[['guide-settings','이용 안내 설정'],['deposit-settings','보증금 알림 설정']],'알림톡 설정');
  $('#view-guide-messages .adm-workspace-tabs').classList.add('adm-settings-tabs');
  dn.querySelectorAll('.adm-workspace-tabs')[0].classList.add('adm-settings-tabs');dn.querySelectorAll('.adm-workspace-tabs')[1].classList.add('adm-work-tabs');
  function action(view,id,label){var b=document.createElement('button');b.type='button';b.className='btn btn-light btn-sm adm-context-action';b.dataset.go=id;b.textContent=label;$('#view-'+view+' .adm-head').appendChild(b);return b;}
  ['resv','bookings','calendar'].forEach(function(id){var b=action(id,'booking-new','+ 예약 등록');b.className='btn btn-primary btn-sm adm-context-action';});
  action('booking-new','bookings','예약 목록으로');
  action('orders','resv','예약 현황 보기');
  action('guide-messages','guide-settings','알림톡·자동 발송 설정').classList.add('adm-work-block');
  action('deposit-notifications','deposit-settings','보증금 알림 설정').classList.add('adm-work-block');
  action('parking','parking-settings','주차 판매·연결 설정').classList.add('adm-work-block');
  action('parking','parking','주차 주문으로').classList.add('adm-settings-block');
  action('guide-messages','guide-messages','이용 안내 업무로').classList.add('adm-settings-block');
  action('deposit-notifications','deposit-notifications','보증금 안내 내역으로').classList.add('adm-settings-block');
  // 오늘 할 일에서 환급 업무로 바로 이동합니다. 기존 조회·등록 기능은 그대로 사용합니다.
  var refundCard=document.createElement('div');refundCard.className='adm-card adm-refund-shortcut';refundCard.innerHTML='<div><h2>이용 후 보증금 환급</h2><p class="small muted">환급 대기·계좌 등록·시설 확인과 송금 완료 기록을 확인하세요.</p></div><button type="button" class="btn btn-light btn-sm" data-go="deposit-refunds">환급 관리 →</button>';$('#dash-kpis').after(refundCard);
  function badges(){groups.forEach(function(g){var d=sections[g.id],n=0;d.querySelectorAll('.adm-nav-items em').forEach(function(em){if(!em.hidden)n+=parseInt(em.textContent,10)||0;});var badge=d.querySelector('.adm-group-count'),value=n>99?'99+':String(n);if(badge.textContent!==value)badge.textContent=value;if(badge.hidden!==!n)badge.hidden=!n;badge.setAttribute('aria-label','관련 항목 '+n+'건');});}
  new MutationObserver(function(records){if(records.some(function(r){var el=r.target.nodeType===1?r.target:r.target.parentElement;return el&&el.closest('.adm-nav-items');}))badges();}).observe(nav,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});badges();
  var baseTitles={};['guide-messages','deposit-notifications','parking'].forEach(function(id){baseTitles[id]=$('#view-'+id+' h1').textContent;});
  var settingsTitles={'guide-settings':'알림톡·자동 발송 설정','deposit-settings':'보증금 알림 설정','parking-settings':'주차 판매·연결 설정'};
  window.MEGASPOT_ADMIN_LAYOUT={
    panel:function(id){return aliases[id]||id;},
    show:function(id){
      var owner=owners[id]||id,current=nav.querySelector('[data-view="'+owner+'"]'),parent=current&&current.closest('.adm-nav-group');
      nav.querySelectorAll('[data-view]').forEach(function(b){var on=b===current;b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
      nav.querySelectorAll('.adm-nav-group').forEach(function(d){d.classList.toggle('has-current',d===parent);if(d!==parent&&['consult','booking'].indexOf(d.dataset.navGroup)<0)d.open=false;});if(parent)parent.open=true;
      context.replaceChildren();var small=document.createElement('span');small.textContent=parent?parent.querySelector('summary > span:nth-child(2)').textContent:'업무 홈';var strong=document.createElement('strong');strong.textContent=labels[id]||id;context.append(small,document.createTextNode(' / '),strong);menu.textContent=labels[id]||'전체 메뉴';menu.setAttribute('aria-label','전체 메뉴 열기 · 현재 '+(labels[id]||id));
      var panel=aliases[id]||id,s=$('#view-'+panel),settings=!!settingsTitles[id];
      ['guide-messages','deposit-notifications','parking'].forEach(function(key){var el=$('#view-'+key);el.classList.toggle('adm-mode-settings',settings&&panel===key);el.classList.toggle('adm-mode-work',!settings||panel!==key);el.querySelector('h1').textContent=settings&&panel===key?settingsTitles[id]:baseTitles[key];});
      document.querySelectorAll('.adm-workspace-tabs a').forEach(function(a){var on=a.dataset.go===id;a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
      prices.querySelectorAll('[data-price-service]').forEach(function(el){el.hidden=id!=='prices-'+el.dataset.priceService;});
      if(settings&&panel==='guide-messages')$('#gm-setup').open=true;
      if(settings&&panel==='parking')parking.querySelectorAll(':scope > details').forEach(function(d){d.open=true;});
      // 키보드 사용자는 메뉴가 접힌 뒤에도 현재 화면에서 계속 탐색할 수 있습니다.
      var fromMenu=nav.contains(document.activeElement);closeMenu();if(fromMenu&&matchMedia('(max-width:999px)').matches){var h=s.querySelector('h1');h.tabIndex=-1;h.focus({preventScroll:true});}
    }
  };
  if(X.visible())X.go(X.current()||'dash');
})();
