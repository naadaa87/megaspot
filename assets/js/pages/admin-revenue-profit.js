(function () {
  'use strict';
  const X=window.MEGASPOT_ADMIN,panel=document.getElementById('revenue-profit-panel');
  if(!X||!panel)return;
  const esc=X.esc,branches={'megaspot-gundae':'건대 1호점','megaspot-gundae-2':'건대 2호점','food-only':'식음료 단독',unassigned:'공통·지점 미지정'};
  const serviceLabels={rental:'공간대관',catering:'출장뷔페',reception:'케이터링',cocktail:'출장 칵테일',other:'기타·확인 필요'};
  const won=value=>Number(value).toLocaleString('ko-KR')+'원';
  const amount=value=>value==null?'확인 필요':won(value);
  const negative=value=>value!=null&&value<0?' revenue-profit-negative':'';
  const reasons=values=>(values||[]).map(value=>typeof value==='string'?value:value?.message||'확인 필요').filter(Boolean);
  panel.innerHTML='<section class="adm-card revenue-profit-card" aria-labelledby="revenue-profit-heading"><div class="revenue-profit-head"><div><h2 id="revenue-profit-heading">서비스 원가·예상 순이익</h2><p class="tiny muted">확정 예약 기준 · 서비스 원가 차감 예상이익</p></div><button type="button" class="btn btn-light btn-sm" id="revenue-profit-reload">새로고침</button></div>'
    +'<p class="tiny muted" id="revenue-profit-scope"></p><p class="revenue-profit-disclaimer">입력한 서비스 원가를 차감한 예상 이익입니다. 임대료·관리비·결제수수료 등 별도 운영비는 포함하지 않습니다.</p>'
    +'<p class="small muted" id="revenue-profit-status" role="status"></p><button type="button" class="btn btn-light btn-sm" id="revenue-profit-retry" hidden>다시 불러오기</button>'
    +'<div class="revenue-profit-metrics" id="revenue-profit-metrics"></div><div id="revenue-profit-coverage"></div>'
    +'<details class="revenue-profit-fold" id="revenue-profit-services-details"><summary>서비스별 예상 원가·이익</summary><p class="tiny muted">서비스별 금액은 원가를 확인한 항목의 합계입니다. 위 요약의 확인된 금액은 계산이 완료된 예약의 합계입니다.</p><div id="revenue-profit-services"></div></details>'
    +'<details class="revenue-profit-fold" id="revenue-profit-list-details"><summary>예약별 원가·이익 내역</summary><div id="revenue-profit-list" aria-live="polite"></div><div class="revenue-profit-pagination" id="revenue-profit-pagination" hidden><button type="button" class="btn btn-light btn-sm" id="revenue-profit-prev">이전</button><span class="small" id="revenue-profit-page"></span><button type="button" class="btn btn-light btn-sm" id="revenue-profit-next">다음</button></div></details>'
    +'<details class="revenue-profit-fold" id="revenue-profit-policy-details"><summary>계산 기준·적용 원가 보기</summary><div id="revenue-profit-policy"></div></details></section>';
  const $=id=>panel.querySelector('#revenue-profit-'+id);
  let scope=null,scopeKey='',page=1,sequence=0,state='idle',loadedAt=0,pending=null;

  function reasonMarkup(values) {
    const text=reasons(values);
    return text.length?'<ul class="revenue-profit-reasons">'+text.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>':'';
  }
  function valueCell(label,value) {
    return '<div><dt>'+label+'</dt><dd class="'+negative(value).trim()+'">'+amount(value)+'</dd></div>';
  }
  function renderPolicy(policy={}) {
    const vatLabel=policy.vatLabel||({included:'부가세 포함 금액 기준',excluded:'부가세 제외 금액 기준',pending:'부가세 기준 확인 필요'}[policy.vatBasis])||'부가세 기준 확인 필요';
    const bartenderLabel=policy.bartenderLabel||({retained:'바텐더 출장·제조 청구액을 마진에 반영', 'pass-through':'바텐더 출장·제조비의 원가와 청구액을 동일하게 적용',pending:'바텐더 출장·제조비 기준 확인 필요'}[policy.bartenderTreatment])||'바텐더 출장·제조비 기준 확인 필요';
    const rows=(policy.rules||[]).map(row=>'<li><strong>'+esc(row.label||serviceLabels[row.kind]||row.kind||'서비스')+'</strong><span>'+esc(row.description||'확인 필요')+'</span></li>').join('');
    const cocktails=(policy.cocktailTable||[]).map(row=>'<article class="revenue-profit-cocktail"><h4>'+esc(row.cups)+'잔</h4><dl>'+valueCell('패키지 판매가',row.sale_price)+valueCell('업체 공급가',row.vendor_supply)+valueCell('출장·제조 청구액',row.bartender_fee)+valueCell('패키지 차익',row.margin)+'</dl></article>').join('');
    $('policy').innerHTML='<p class="revenue-profit-policy-lead">'+esc(policy.label||'현재 운영 마진 기준 예상이익')+'</p><p class="small">'+esc(vatLabel)+' · '+esc(bartenderLabel)+'</p>'+(policy.scopeNote?'<p class="tiny muted">'+esc(policy.scopeNote)+'</p>':'')+'<ul class="revenue-profit-rules">'+rows+'</ul>'+(cocktails?'<h3>적용한 칵테일 가격표</h3><p class="tiny muted">아래 공급가·판매가는 부가세 별도 금액입니다. 예상 이익에는 위 부가세·출장비 기준을 적용합니다.</p><div class="revenue-profit-cocktails">'+cocktails+'</div>':'');
  }
  function render(r) {
    const s=r.summary,bookingCount=Number(s.bookingCount)||0,complete=Number(s.completeBookingCount)||0,unknown=Number(s.unknownBookingCount)||0;
    const allUnpriced=bookingCount>0&&s.amountUnknownCount===bookingCount;
    const knownNote=label=>complete?'계산 완료 '+complete+'건의 '+label:'계산이 완료된 예약이 없습니다.';
    const metrics=[
      ['분석 매출',allUnpriced?'금액 미정':won(s.contractAmount),'확정·이용 완료 예약 '+bookingCount+'건'+(s.amountUnknownCount?' · 금액 미정 '+s.amountUnknownCount+'건 별도':''),s.contractAmount],
      ['예상 원가',amount(s.totalCost),s.totalCost==null?(complete?knownNote('원가 합계')+' '+won(s.knownServiceCost):knownNote('원가 합계')):'분석 대상 예약의 서비스 원가 합계',s.totalCost],
      ['예상 순이익',amount(s.totalProfit),s.totalProfit==null?(complete?knownNote('이익 합계')+' '+won(s.knownProfit):knownNote('이익 합계')):'분석 매출에서 입력한 서비스 원가 차감',s.totalProfit]
    ];
    $('metrics').innerHTML=metrics.map(([label,value,note,numeric])=>'<article><h3>'+label+'</h3><strong class="'+negative(numeric).trim()+'">'+value+'</strong><span>'+note+'</span></article>').join('');
    const coverage=Math.max(0,Math.min(1,Number(s.coverage)||0));
    $('coverage').innerHTML=bookingCount?'<div class="revenue-profit-coverage"><span>계산 완료 '+complete+' / '+bookingCount+'건 · '+(coverage*100).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%</span><div class="revenue-profit-coverage-track" aria-hidden="true"><i style="width:'+(coverage*100)+'%"></i></div>'+(unknown?'<p class="revenue-profit-warning">원가·구성 확인이 필요한 예약 '+unknown+'건이 있어 전체 예상 원가·순이익은 계산을 보류합니다. 확인된 예약의 금액은 각 카드 아래에 별도 표시합니다.</p>':'')+'</div>':'<p class="small muted">조회 기간·지점에 해당하는 확정·이용 완료 예약이 없습니다.</p>';
    $('services').innerHTML=(r.services||[]).length?'<ul class="revenue-profit-service-list">'+r.services.map(row=>'<li class="revenue-profit-service-row" data-profit-service="'+esc(row.kind)+'"><div><strong>'+esc(row.label||serviceLabels[row.kind]||row.kind)+'</strong>'+(row.unknownCount?'<small class="revenue-profit-warning">미확인 항목 '+Number(row.unknownCount)+'건</small>':'')+'</div><dl>'+valueCell('확인 매출',row.knownSale)+valueCell('확인 원가',row.knownCost)+valueCell('확인 이익',row.knownProfit)+'</dl></li>').join('')+'</ul>':'<p class="small muted">서비스 내역이 없습니다.</p>';
    $('list').innerHTML=(r.items||[]).length?'<ul class="revenue-profit-bookings">'+r.items.map(row=>'<li data-profit-booking="'+esc(row.booking_code)+'"><details class="revenue-profit-booking"><summary><span class="revenue-profit-booking-identity"><strong>'+esc(row.customer_name||'예약자 미지정')+'</strong><small>'+esc(row.date)+' · '+esc(branches[row.space_id]||branches.unassigned)+' · '+esc(row.booking_code)+'</small><span'+(!row.complete?' class="revenue-profit-warning"':'')+'>'+(row.complete?'계산 완료':'원가·구성 확인 필요')+' · 항목별 기준 보기</span></span><span class="revenue-profit-booking-money"><span><small>예약금액</small><b>'+amount(row.contractAmount)+'</b></span><span><small>예상 원가</small><b class="'+negative(row.serviceCost).trim()+'">'+amount(row.serviceCost)+'</b></span><span><small>예상 순이익</small><b class="'+negative(row.profit).trim()+'">'+amount(row.profit)+'</b></span></span></summary>'+reasonMarkup(row.reasons)+'<ul class="revenue-profit-lines">'+(row.lines||[]).map(line=>'<li><div><strong>'+esc(line.label||serviceLabels[line.kind]||line.kind||'서비스')+'</strong><p>'+esc(line.basis||'기준 확인 필요')+(line.quantity!=null?' · 수량 '+esc(line.quantity):'')+'</p></div><dl>'+valueCell('분석 매출',line.sale)+valueCell('예상 원가',line.cost)+valueCell('예상 이익',line.profit)+'</dl>'+reasonMarkup(line.reasons)+'</li>').join('')+'</ul></details></li>').join('')+'</ul>':'<p class="small muted revenue-profit-empty">해당 기간·지점에 포함된 예약이 없습니다.</p>';
    const count=Number(r.detailCount)||0,pages=Math.max(1,Math.ceil(count/r.pageSize));
    $('pagination').hidden=pages<=1;$('prev').disabled=r.page<=1;$('next').disabled=r.page>=pages;$('page').textContent=r.page+' / '+pages;
    renderPolicy(r.policy);
    $('status').textContent='확정 예약 기준 예상치 · 실제 수납액과 별도 · 페이지 '+r.page+' / '+pages;
  }
  async function load() {
    const request=++sequence,q=new URLSearchParams(scope);q.set('page',page);state='loading';
    panel.setAttribute('aria-busy','true');$('status').textContent='서비스 원가와 예상 이익을 확인하고 있습니다.';$('retry').hidden=true;$('pagination').hidden=true;
    for(const id of ['metrics','coverage','services','list','policy'])$(id).innerHTML='';
    try {
      const r=await X.A('/revenue/profit?'+q);
      if(request!==sequence)return null;
      const last=Math.max(1,Math.ceil(r.detailCount/r.pageSize));
      if(page>last){page=last;return load();}
      render(r);state='ready';loadedAt=Date.now();return r;
    } catch(e) {
      if(request===sequence){state='error';if(!X.guard(e)){$('status').textContent=e.message||'서비스 원가·예상 이익을 불러오지 못했습니다.';$('retry').hidden=false;}}
      return null;
    } finally {if(request===sequence)panel.removeAttribute('aria-busy');}
  }
  X.loadRevenueProfit=function (input={},options={}) {
    if(!input.from||!input.to)return Promise.resolve(null);
    const next={from:String(input.from),to:String(input.to),space:String(input.space||'')},key=JSON.stringify(next);
    if(key===scopeKey&&!options.force&&(state==='loading'||(state==='ready'&&Date.now()-loadedAt<30000)))return pending||Promise.resolve(null);
    scope=next;scopeKey=key;page=1;
    $('scope').textContent=scope.from+' ~ '+scope.to+' · '+(branches[scope.space]||'전체 지점')+' · 이용일 기준';
    pending=load();return pending;
  };
  function refresh(){if(scope){pending=load();return pending;}return Promise.resolve(null);}
  $('reload').addEventListener('click',refresh);$('retry').addEventListener('click',refresh);
  for(const [id,delta] of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>{if(scope&&state!=='loading'&&!$(id).disabled){page+=delta;pending=load();}});
  if(X.revenueProfitScope)X.loadRevenueProfit(X.revenueProfitScope);
})();
