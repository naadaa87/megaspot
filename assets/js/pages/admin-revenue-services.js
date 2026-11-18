(function () {
  'use strict';
  const X=window.MEGASPOT_ADMIN,view=document.getElementById('view-revenue');
  if(!X||!view)return;
  const categories={rental:'공간대관',food:'식음료',parking:'주차',addons:'부가서비스',unclassified:'구성 미분류'};
  const components={rental:'공간대관',people:'추가 인원',catering:'출장뷔페',reception:'테이블·박스 케이터링',cocktail:'출장 칵테일',parking:'주차',cleaning:'청소지원',banner:'현수막',xbanner:'X배너',disposable:'1회용 세트',manager:'현장 매니저',other:'기타',unclassified:'구성 미분류'};
  const componentCategories={rental:'rental',people:'rental',catering:'food',reception:'food',cocktail:'food',parking:'parking',cleaning:'addons',banner:'addons',xbanner:'addons',disposable:'addons',manager:'addons',other:'unclassified',unclassified:'unclassified'};
  const branches={'megaspot-gundae':'건대 1호점','megaspot-gundae-2':'건대 2호점',unassigned:'공통·지점 미지정'};
  const channels={spacecloud:'온라인 (스페이스클라우드)',payapp:'온라인 (페이앱)',toss_terminal:'현장 (토스 터미널)',bank_corporate:'법인계좌',bank_personal:'개인계좌',unknown:'미분류'};
  const esc=X.esc,won=value=>Number(value||0).toLocaleString('ko-KR')+'원';
  const dialog=document.createElement('dialog');
  dialog.id='revenue-services-dialog';dialog.className='revenue-services-dialog';
  dialog.setAttribute('aria-labelledby','revenue-services-title');
  dialog.innerHTML='<div class="revenue-services-head"><h2 id="revenue-services-title">서비스 수납·환불 내역</h2><button type="button" class="btn btn-light btn-sm" id="revenue-services-close">닫기</button></div>'
    +'<p class="tiny muted" id="revenue-services-scope"></p><p class="revenue-services-note" id="revenue-services-note">수납 기준 배분액입니다. 일부 수납이나 묶음 결제는 저장된 주문·견적의 항목 비율로 나누므로 서비스별 계약금액과 다를 수 있습니다. 직접 분류한 금액은 우선 적용합니다.</p>'
    +'<div id="revenue-services-total" class="revenue-services-totals"></div><p class="small muted" id="revenue-services-status" role="status"></p><button type="button" class="btn btn-light btn-sm" id="revenue-services-retry" hidden>다시 불러오기</button>'
    +'<div id="revenue-services-list" aria-live="polite"></div><div class="revenue-services-pagination" id="revenue-services-pagination" hidden><button type="button" class="btn btn-light btn-sm" id="revenue-services-prev">이전</button><span class="small" id="revenue-services-page"></span><button type="button" class="btn btn-light btn-sm" id="revenue-services-next">다음</button></div>';
  view.appendChild(dialog);
  const $=id=>dialog.querySelector('#revenue-services-'+id);
  let query=null,page=1,sequence=0,opener=null;

  function render(r) {
    const total=r.total||{received:0,refunded:0,net:0};
    $('total').innerHTML=[['수납 배분액',total.received],['환불 배분액',total.refunded],['순수납 배분액',total.net]].map(([label,value])=>'<div><span>'+label+'</span><strong'+(value<0?' class="revenue-services-negative"':'')+'>'+won(value)+'</strong></div>').join('');
    const items=r.items||[];
    $('list').innerHTML=items.length?'<ul class="revenue-services-list">'+items.map(row=>{
      const refund=row.kind==='refund',signed=refund?-row.amount:row.amount;
      const reference=[row.booking_code?'예약 '+row.booking_code:'',row.ref&&row.ref!==row.booking_code?'거래 '+row.ref:''].filter(Boolean).join(' · ');
      const parts=(row.components||[]).map(part=>'<span>'+esc(components[part.id]||part.label||part.id)+' <b>'+won(refund?-part.amount:part.amount)+'</b></span>').join('');
      const original=Number(row.original_amount);
      return '<li class="revenue-services-row" data-movement-id="'+esc(row.movement_id||row.id||'')+'"><div class="revenue-services-identity"><strong>'+esc(row.title||'수납·환불 내역')+'</strong><span>'+esc(row.event_date||row.day||'')+' · '+esc(branches[row.branch]||branches.unassigned)+'</span><small>'+esc(reference||row.movement_id||'')+'</small><small>기록 '+esc(row.recorded_day||'날짜 미상')+' · '+(row.source==='manual'?'수기 ':'온라인 ')+(refund?'환불':'수납')+'</small></div>'
        +'<div class="revenue-services-allocation"><span class="revenue-services-basis">'+esc(row.allocation_basis||'구성 미분류')+'</span><div class="revenue-services-parts">'+parts+'</div><small>'+esc(channels[row.channel]||'미분류')+(row.account?' · '+esc(row.account):'')+'</small>'+(Number.isFinite(original)&&original!==row.amount?'<small>원거래 '+won(original)+' 중 선택한 항목</small>':'')+'</div>'
        +'<div class="revenue-services-amount"><span>'+(refund?'환불 배분액':'수납 배분액')+'</span><strong'+(signed<0?' class="revenue-services-negative"':'')+'>'+won(signed)+'</strong></div></li>';
    }).join('')+'</ul>':'<p class="revenue-services-empty small muted">선택한 조건에 해당하는 수납·환불 내역이 없습니다.</p>';
    const count=Number(r.detailCount)||0,pages=Math.max(1,Math.ceil(count/r.pageSize));
    $('status').textContent='거래 '+count.toLocaleString('ko-KR')+'건 · 선택한 항목의 수납·환불 배분액';
    $('pagination').hidden=pages<=1;$('prev').disabled=r.page<=1;$('next').disabled=r.page>=pages;
    $('page').textContent=r.page+' / '+pages;
  }
  async function load() {
    const request=++sequence,q=new URLSearchParams(query);q.set('page',page);
    $('status').textContent='수납·환불 내역을 불러오는 중입니다.';$('total').innerHTML='';$('list').innerHTML='';
    $('list').setAttribute('aria-busy','true');$('retry').hidden=true;$('pagination').hidden=true;
    try {
      const r=await X.A('/revenue?'+q);
      if(request!==sequence||!dialog.open)return;
      const last=Math.max(1,Math.ceil(r.detailCount/r.pageSize));
      if(page>last){page=last;return load();}
      render(r);
    } catch(e) {
      if(request===sequence&&dialog.open&&!X.guard(e)){$('status').textContent=e.message||'수납·환불 내역을 불러오지 못했습니다.';$('retry').hidden=false;}
    } finally {if(request===sequence)$('list').removeAttribute('aria-busy');}
  }
  X.openRevenueServices=function (options={}) {
    const component=options.component||'',category=options.category||componentCategories[component]||'';
    if((category&&!Object.hasOwn(categories,category))||(component&&!Object.hasOwn(components,component)))return false;
    query=new URLSearchParams();
    for(const key of ['from','to','space','channel'])if(options[key])query.set(key,options[key]);
    if(category)query.set('category',category);if(component)query.set('component',component);
    page=1;
    const label=components[component]||categories[category]||'전체 서비스';
    $('title').textContent=label+' 수납·환불 내역';
    $('scope').textContent=(options.from||'선택한 기간')+(options.to?' ~ '+options.to:'')+' · '+(branches[options.space]||'전체 지점')+' · '+(channels[options.channel]||'전체 결제 채널')+' · 이용일 기준';
    if(!dialog.open){opener=document.activeElement;dialog.showModal();}
    dialog.scrollTop=0;load();return true;
  };
  $('close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{sequence++;query=null;$('list').removeAttribute('aria-busy');if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;});
  $('retry').addEventListener('click',()=>{if(dialog.open)load();});
  for(const [id,delta] of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>{
    if(dialog.open&&$('list').getAttribute('aria-busy')!=='true'&&!$(id).disabled){page+=delta;dialog.scrollTop=0;load();}
  });
})();
