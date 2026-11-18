(function () {
  'use strict';
  const X = window.MEGASPOT_ADMIN;
  const $ = id => document.getElementById(id);
  const form = $('revenue-form'), report = $('revenue-report'), status = $('revenue-status');
  const dayList = $('revenue-daily'), detail = $('revenue-detail');
  const labels = {'megaspot-gundae':'건대 1호점','megaspot-gundae-2':'건대 2호점',unassigned:'공통·지점 미지정'};
  const columns = Object.keys(labels);
  const categoryLabels = {rental:'공간대관',food:'식음료',parking:'주차',addons:'부가서비스',unclassified:'구성 미분류'};
  const componentLabels = {rental:'공간대관',people:'추가 인원',catering:'출장뷔페',reception:'테이블·박스 케이터링',cocktail:'출장 칵테일',parking:'주차',cleaning:'청소지원',banner:'현수막',xbanner:'X배너',disposable:'1회용 세트',manager:'현장 매니저',other:'기타',unclassified:'구성 미분류'};
  const channelLabels = {spacecloud:'온라인 (스페이스클라우드)',payapp:'온라인 (페이앱)',toss_terminal:'현장 (토스 터미널)',bank_corporate:'법인계좌',bank_personal:'개인계좌',unknown:'미분류'};
  const colors = {spacecloud:'#447d6c',payapp:'#2454d8',toss_terminal:'#8a62cb',bank_corporate:'#d48a2d',bank_personal:'#c65b85',unknown:'#8c929b'};
  const won = n => Number(n||0).toLocaleString('ko-KR')+'원', esc = X.esc;
  const zero = () => ({received:0,refunded:0,net:0,count:0});
  let filters, selectedDay = '', page = 1, version = 0, trendVersion = 0, records = new Map();
  let editor = null, editorBusy = false, editorVersion = 0;
  const dialog = $('revenue-classify-dialog');

  function month(value) {
    const current = value || new Date(Date.now()+9*3600e3).toISOString().slice(0,7);
    const [year,number] = current.split('-').map(Number);
    form.elements.from.value = current+'-01';
    form.elements.to.value = new Date(Date.UTC(year,number,0)).toISOString().slice(0,10);
    $('revenue-month-select').value = current;
    $('revenue-trend-year').value = year;
  }
  function money(n) { return '<td class="revenue-num'+(n<0?' revenue-refund':'')+'">'+won(n)+'</td>'; }
  function table(headers, rows, firstMoneyColumn=Infinity) {
    return '<table><thead><tr>'+headers.map((name,index)=>'<th scope="col"'+(index>=firstMoneyColumn?' class="revenue-num"':'')+'>'+name+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>';
  }
  function renderUpcoming(items, space) {
    const branches = space ? [space] : columns.filter(key=>key!=='unassigned');
    $('revenue-upcoming-items').innerHTML = branches.map(key=>{
      const rows = items.filter(item=>item.branch===key);
      if(key==='unassigned') return '<p class="small muted mt-2">공통·지점 미지정에는 지점별 예정 예약이 없습니다.</p>';
      const content = rows.length ? table(['이용일','예약자·단체','수납 기록','예약 금액'],rows.map(row=>
        '<tr><td class="revenue-date">'+esc(row.day)+'</td><td>'+esc(row.customer_name)+'</td><td><button type="button" class="btn btn-light btn-sm" data-settlement-code="'+esc(row.booking_code)+'">'+esc(row.booking_code)+'</button></td>'+(row.amount==null?'<td class="revenue-num muted">금액 미정</td>':money(row.amount))+'</tr>'),3)
        : '<p class="small muted">해당 기간에 입금 확인 전인 예정 예약이 없습니다.</p>';
      return '<div class="mt-3"><h3>'+labels[key]+' · '+rows.length+'건</h3><div class="revenue-table-wrap">'+content+'</div></div>';
    }).join('');
  }
  function renderBreakdown(r) {
    const categories = r.categories || [], components = r.components || [], channels = r.channels || [];
    $('revenue-categories').innerHTML = categories.map(item=>'<button type="button" class="revenue-category'+(filters.get('category')===item.id?' on':'')+'" data-revenue-category="'+esc(item.id)+'" aria-pressed="'+(filters.get('category')===item.id)+'"><span>'+esc(categoryLabels[item.id]||item.label)+'</span><strong>'+won(item.net)+'</strong><small>수납 '+won(item.received)+'<br>환불 '+won(item.refunded)+'</small></button>').join('');
    const active = components.filter(item=>item.received||item.refunded);
    $('revenue-components').innerHTML = active.length ? table(['구분','세부 항목','수납액','환불액','순매출'],active.map(item=>'<tr><td>'+esc(categoryLabels[item.category]||item.category)+'</td><td><button type="button" class="revenue-text-button" data-revenue-component="'+esc(item.id)+'" data-category="'+esc(item.category)+'">'+esc(componentLabels[item.id]||item.label)+'</button></td>'+money(item.received)+money(item.refunded)+money(item.net)+'</tr>'),2) : '<p class="small muted">선택한 조건에 해당하는 매출 구성이 없습니다.</p>';
    const ranked = channels.slice().sort((a,b)=>b.received-a.received);
    const gross = ranked.reduce((sum,item)=>sum+item.received,0);
    const share = item => gross ? item.received/gross*100 : 0;
    $('revenue-channel-shares').innerHTML = (gross ? '<div class="revenue-share-bar" aria-hidden="true">'+ranked.filter(item=>item.received>0).map(item=>'<span style="width:'+share(item)+'%;background:'+(colors[item.id]||colors.unknown)+'"></span>').join('')+'</div>' : '<p class="small muted mt-2">해당 기간에 수납 내역이 없습니다.</p>')
      +'<div class="revenue-channel-list">'+ranked.map(item=>'<div class="revenue-channel-row"><div class="revenue-channel-name"><i style="background:'+(colors[item.id]||colors.unknown)+'" aria-hidden="true"></i><span>'+esc(channelLabels[item.id]||item.label)+'</span><b>'+share(item).toFixed(1)+'%</b></div><div class="revenue-channel-amount"><span>수납 '+won(item.received)+'</span><span>환불 '+won(item.refunded)+'</span></div>'+(item.accounts||[]).filter(account=>account.received||account.refunded).map(account=>'<div class="revenue-account-row"><span>'+esc(account.account||'계좌·사업자 미지정')+'</span><span>순매출 '+won(account.net)+'</span></div>').join('')+'</div>').join('')+'</div>';
  }
  function render(r) {
    const filtered = filters.get('space'), shownBranches = filtered ? [] : columns;
    const cards = [[filtered ? labels[filtered] : '전체 합계',r.total],...shownBranches.map(key=>[labels[key],r.branches[key]])];
    $('revenue-totals').innerHTML = cards.map(([name,t])=>'<div class="adm-card revenue-total"><h2>'+name+'</h2><dl><dt>수납액</dt><dd>'+won(t.received)+'</dd><dt>환불액</dt><dd>'+won(t.refunded)+'</dd><dt>순매출</dt><dd class="'+(t.net<0?'revenue-refund':'')+'">'+won(t.net)+'</dd></dl></div>').join('');
    renderBreakdown(r);
    renderUpcoming(r.upcoming || [],filtered);
    $('revenue-upcoming').hidden = !!(filters.get('channel')||filters.get('category')||filters.get('component'));
    dayList.innerHTML = r.daily.length ? table(['날짜','수납액','환불액','순매출',...shownBranches.map(key=>labels[key])],r.daily.map(d=>'<tr><td class="revenue-date"><button type="button" class="btn btn-light btn-sm" data-revenue-day="'+esc(d.day)+'" aria-pressed="'+(selectedDay===d.day)+'">'+esc(d.day)+'</button></td>'+money(d.received)+money(d.refunded)+money(d.net)+shownBranches.map(key=>money(d.branches[key]?.net||0)).join('')+'</tr>'),1) : '<p class="small muted">선택한 조건에 해당하는 매출 기록이 없습니다.</p>';
    $('revenue-clear-day').hidden = !selectedDay;
    $('revenue-clear-component').hidden = !filters.get('component');
    $('revenue-detail-label').textContent = (selectedDay ? selectedDay+' · ' : '조회 기간 전체 · ')+r.detailCount.toLocaleString('ko-KR')+'건';
    records = new Map(r.items.map(row=>[row.movement_id||row.id,row]));
    $('revenue-items').innerHTML = r.items.length ? table(['이용일·기록일','지점','거래·참조번호','매출 구성','결제 채널·계좌','구분','금액','분류'],r.items.map(row=>{
      const refund = row.kind==='refund', manual = row.source==='manual';
      const kind = (manual?'수기 ':'온라인 ')+(refund?'환불':manual?'수납':'결제');
      const booking = row.booking_code ? '<button type="button" class="btn btn-light btn-sm" data-settlement-code="'+esc(row.booking_code)+'" aria-label="예약 '+esc(row.booking_code)+' 수납·환불 내역">'+esc(row.booking_code)+'</button>' : '';
      const components = (row.components||[]).map(item=>esc(componentLabels[item.id]||item.label)+' '+won(item.amount)).join('<br>');
      return '<tr><td class="revenue-date">'+esc(row.event_date)+'<span class="tiny muted revenue-ref">기록 '+esc(row.recorded_day||'날짜 미상')+(row.estimated?' · 추정':'')+'</span></td><td>'+labels[row.branch]+'</td><td>'+esc(row.title)+'<span class="tiny muted revenue-ref">'+(manual?'':esc(row.ref)+' ')+booking+'</span></td><td>'+components+'<span class="tiny muted revenue-ref">'+esc(row.allocation_basis||'')+'</span></td><td>'+esc(channelLabels[row.channel]||'미분류')+'<span class="tiny muted revenue-ref">'+esc(row.account||'')+'</span></td><td>'+kind+'</td>'+money(refund ? -row.amount : row.amount)+'<td><button type="button" class="btn btn-light btn-sm" data-revenue-classify="'+esc(row.movement_id||row.id)+'">분류</button></td></tr>';
    })) : '<p class="small muted">표시할 거래가 없습니다.</p>';
    const pages = Math.max(1,Math.ceil(r.detailCount/r.pageSize));
    $('revenue-pagination').hidden = pages<=1;
    $('revenue-prev').disabled = r.page<=1;
    $('revenue-next').disabled = r.page>=pages;
    $('revenue-page').textContent = r.page+' / '+pages;
  }
  function shortMoney(n) { return n===0?'0':Math.abs(n)>=10000?(n/10000).toLocaleString('ko-KR',{maximumFractionDigits:1})+'만':n.toLocaleString('ko-KR'); }
  function renderTrend(months,year) {
    const rows = Array.from({length:12},(_,i)=>months.find(row=>row.month===year+'-'+String(i+1).padStart(2,'0'))||{month:year+'-'+String(i+1).padStart(2,'0'),...zero()});
    const max = Math.max(10000,...rows.map(row=>row.net)), min = Math.min(0,...rows.map(row=>row.net));
    const compact=(window.innerWidth||1000)<600, chartWidth=compact?480:900;
    const top=18, height=190, left=compact?56:72, right=chartWidth-15, bottom=top+height, labelFont=compact?15:14, axisFont=compact?14:12;
    const y = n=>top+(max-n)/(max-min)*height, base=y(0), step=(right-left)/12;
    const grid = Array.from({length:5},(_,i)=>min+(max-min)*i/4).map(value=>'<line x1="'+left+'" x2="'+right+'" y1="'+y(value)+'" y2="'+y(value)+'" stroke="#e9ebef"/><text x="'+(left-10)+'" y="'+(y(value)+4)+'" text-anchor="end" fill="#747b88" font-size="'+axisFont+'">'+shortMoney(Math.round(value))+'</text>').join('');
    $('revenue-trend').innerHTML = '<svg viewBox="0 0 '+chartWidth+' 250" role="img" aria-labelledby="revenue-chart-title revenue-chart-desc"><title id="revenue-chart-title">'+year+'년 월별 순매출</title><desc id="revenue-chart-desc">'+rows.map((row,i)=>(i+1)+'월 '+won(row.net)).join(', ')+'</desc>'+grid+'<line x1="'+left+'" x2="'+right+'" y1="'+base+'" y2="'+base+'" stroke="#c8ced8"/>'+rows.map((row,i)=>{
      const selected = filters?.get('from').slice(0,7)===row.month, x=left+step*i+step*.2, width=step*.6;
      return '<g><rect x="'+x+'" y="'+(row.net<0?base:y(row.net))+'" width="'+width+'" height="'+Math.max(1,Math.abs(base-y(row.net)))+'" rx="3" fill="'+(row.net<0?'#cf6570':selected?'#234fc6':'#97b1ed')+'" tabindex="0" role="button" data-revenue-month="'+row.month+'" aria-label="'+(i+1)+'월 매출 보기 · '+won(row.net)+'"><title>'+(i+1)+'월 · 순매출 '+won(row.net)+' · 수납 '+won(row.received)+' · 환불 '+won(row.refunded)+'</title></rect><text x="'+(x+width/2)+'" y="'+(bottom+23)+'" text-anchor="middle" font-size="'+labelFont+'" fill="'+(selected?'#234fc6':'#747b88')+'">'+(i+1)+'월</text></g>';
    }).join('')+'</svg><details class="revenue-trend-values"><summary>월별 금액 보기</summary><div class="revenue-table-wrap">'+table(['이용월','수납액','환불액','순매출'],rows.map(row=>'<tr><td>'+row.month+'</td>'+money(row.received)+money(row.refunded)+money(row.net)+'</tr>'),1)+'</div></details>';
  }
  async function loadTrend() {
    const year=Number($('revenue-trend-year').value), request=++trendVersion;
    if(!Number.isInteger(year)||year<2000||year>2100) {$('revenue-trend-status').textContent='2000~2100년 사이의 연도를 입력해 주세요.';return;}
    const q=new URLSearchParams(filters);
    q.set('from',year+'-01-01');q.set('to',year+'-12-31');q.delete('day');q.delete('page');
    $('revenue-trend-status').textContent=year+'년 추이를 불러오는 중입니다.';
    $('revenue-trend').setAttribute('aria-busy','true');
    try {
      const r=await X.A('/revenue?'+q);
      if(request!==trendVersion)return;
      renderTrend(r.monthly||[],year);
      $('revenue-trend-status').textContent=year+'년 1~12월 · 막대를 선택하면 해당 월을 조회합니다.';
    } catch(e) {if(request===trendVersion&&!X.guard(e)){$('revenue-trend').innerHTML='';$('revenue-trend-status').textContent=e.message||'월별 추이를 불러오지 못했습니다.';}}
    finally {if(request===trendVersion)$('revenue-trend').removeAttribute('aria-busy');}
  }
  async function load({detailOnly=false,focus,trend=!detailOnly}={}) {
    const request=++version, q=new URLSearchParams(filters);q.set('page',page);if(selectedDay)q.set('day',selectedDay);
    if(!detailOnly)report.hidden=true;
    report.setAttribute('aria-busy','true');status.textContent='매출 내역을 불러오는 중입니다.';
    if(trend)loadTrend();
    try {
      const r=await X.A('/revenue?'+q);if(request!==version)return;
      const lastPage=Math.max(1,Math.ceil(r.detailCount/r.pageSize));
      if(page>lastPage){page=lastPage;return load({detailOnly,focus,trend:false});}
      render(r);report.hidden=false;
      status.textContent=filters.get('from')+' ~ '+filters.get('to')+' · 이용일 기준 · 보증금 제외'+(filters.get('component')?' · '+(componentLabels[filters.get('component')]||'세부 항목'):'');
      if(focus&&!$('view-revenue').hidden){const target=detail.querySelector(focus);if(target&&!target.hidden&&!target.disabled)target.focus();else detail.querySelector('h2').focus();}
    }catch(e){if(request!==version)return;report.hidden=true;if(!X.guard(e))status.textContent=e.message||'매출 내역을 불러오지 못했습니다.';}
    finally{if(request===version)report.removeAttribute('aria-busy');}
  }
  function search(){filters=new URLSearchParams(new FormData(form));selectedDay='';page=1;load();}
  function shiftMonth(delta){const current=$('revenue-month-select').value||form.elements.from.value.slice(0,7);const [year,number]=current.split('-').map(Number);month(new Date(Date.UTC(year,number-1+delta,1)).toISOString().slice(0,7));search();}
  detail.querySelector('h2').tabIndex=-1;
  form.addEventListener('submit',e=>{e.preventDefault();search();});
  $('revenue-month').addEventListener('click',()=>{month();search();});
  $('revenue-month-select').addEventListener('change',()=>{if($('revenue-month-select').value){month($('revenue-month-select').value);search();}});
  $('revenue-month-prev').addEventListener('click',()=>shiftMonth(-1));
  $('revenue-month-next').addEventListener('click',()=>shiftMonth(1));
  $('revenue-trend').addEventListener('click',e=>{const b=e.target.closest('[data-revenue-month]');if(b){month(b.dataset.revenueMonth);search();}});
  $('revenue-trend').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-revenue-month]')){e.preventDefault();month(e.target.dataset.revenueMonth);search();}});
  $('revenue-trend-year').addEventListener('change',()=>{if(filters)loadTrend();});
  ['revenue-from','revenue-to'].forEach(id=>$(id).addEventListener('change',()=>{$('revenue-month-select').value='';$('revenue-trend-year').value=form.elements.from.value.slice(0,4);}));
  $('revenue-category').addEventListener('change',()=>{$('revenue-component').value='';});
  $('revenue-show-all').addEventListener('click',()=>{form.elements.category.value='';form.elements.component.value='';form.elements.channel.value='';search();});
  $('revenue-clear-component').addEventListener('click',()=>{$('revenue-component').value='';search();});
  $('revenue-categories').addEventListener('click',e=>{const b=e.target.closest('[data-revenue-category]');if(b){form.elements.category.value=filters.get('category')===b.dataset.revenueCategory?'':b.dataset.revenueCategory;$('revenue-component').value='';search();}});
  $('revenue-components').addEventListener('click',e=>{const b=e.target.closest('[data-revenue-component]');if(b){form.elements.category.value=b.dataset.category;$('revenue-component').value=b.dataset.revenueComponent;search();}});
  dayList.addEventListener('click',e=>{const b=e.target.closest('[data-revenue-day]');if(!b||report.getAttribute('aria-busy')==='true')return;selectedDay=b.dataset.revenueDay;page=1;load({detailOnly:true,focus:'#revenue-clear-day'});});
  $('revenue-clear-day').addEventListener('click',()=>{selectedDay='';page=1;load({detailOnly:true,focus:'h2'});});
  $('revenue-prev').addEventListener('click',()=>{if(report.getAttribute('aria-busy')!=='true'){page--;load({detailOnly:true,focus:'#revenue-prev'});}});
  $('revenue-next').addEventListener('click',()=>{if(report.getAttribute('aria-busy')!=='true'){page++;load({detailOnly:true,focus:'#revenue-next'});}});

  function allocationRows(){return Array.from($('revenue-classify-rows').querySelectorAll('.revenue-allocation-row')).map(row=>({id:row.querySelector('select').value,amount:Number(row.querySelector('input').value)}));}
  function updateSum(){if(!editor)return;const sum=allocationRows().reduce((n,row)=>n+row.amount,0);$('revenue-classify-sum').textContent='항목 합계 '+won(sum)+' / 거래 금액 '+won(editor.amount);$('revenue-classify-sum').classList.toggle('revenue-refund',sum!==editor.amount);}
  function addAllocation(item={id:'unclassified',amount:0}){
    const row=document.createElement('div');row.className='revenue-allocation-row';
    row.innerHTML='<select class="select" aria-label="매출 세부 항목">'+Object.entries(componentLabels).map(([id,label])=>'<option value="'+id+'"'+(id===item.id?' selected':'')+'>'+label+'</option>').join('')+'</select><input class="input" type="number" min="0" max="1000000000" step="1" aria-label="항목 금액" value="'+Number(item.amount||0)+'"><button type="button" class="btn btn-light btn-sm" aria-label="항목 삭제">삭제</button>';
    row.querySelector('button').addEventListener('click',()=>{row.remove();updateSum();});$('revenue-classify-rows').appendChild(row);updateSum();
  }
  function setEditorBusy(on){editorBusy=on;$('revenue-classify-form').querySelectorAll('input,select,button').forEach(el=>{el.disabled=on;});}
  async function classify(id){
    if(editorBusy)return;const row=records.get(id);if(!row)return;
    const request=++editorVersion;editor=null;$('revenue-classify-info').textContent='거래를 불러오는 중입니다.';$('revenue-classify-status').textContent='';
    if(!dialog.open)dialog.showModal();setEditorBusy(true);
    try{
      const r=await X.A('/revenue/classifications?'+new URLSearchParams({movement_id:id}));if(request!==editorVersion)return;
      const meta=r.metadata, movement=r.movement;editor={id,version:meta.version,amount:movement.amount,row};
      $('revenue-classify-info').textContent=(movement.kind==='refund'?'환불':'수납')+' '+won(movement.amount)+' · '+(movement.ref||movement.booking_code||id);
      $('revenue-classify-channel').value=meta.version?meta.channel:(row.channel||'unknown');$('revenue-classify-account').value=meta.version?meta.account:(row.account||'');
      $('revenue-classify-auto').checked=meta.components==null;$('revenue-classify-custom').hidden=meta.components==null;$('revenue-classify-rows').replaceChildren();
      (meta.components||row.all_components||row.components||[{id:'unclassified',amount:movement.amount}]).forEach(addAllocation);updateSum();
    }catch(e){if(!X.guard(e))$('revenue-classify-status').textContent=e.message||'거래를 불러오지 못했습니다.';}
    finally{if(request===editorVersion){setEditorBusy(false);$('revenue-classify-save').disabled=!editor;}}
  }
  $('revenue-items').addEventListener('click',e=>{const b=e.target.closest('[data-revenue-classify]');if(b)classify(b.dataset.revenueClassify);});
  $('revenue-classify-close').addEventListener('click',()=>{if(!editorBusy)dialog.close();});
  dialog.addEventListener('cancel',e=>{if(editorBusy)e.preventDefault();});
  $('revenue-classify-auto').addEventListener('change',()=>{$('revenue-classify-custom').hidden=$('revenue-classify-auto').checked;updateSum();});
  $('revenue-classify-add').addEventListener('click',()=>addAllocation());
  $('revenue-classify-rows').addEventListener('input',updateSum);
  $('revenue-classify-form').addEventListener('submit',async e=>{
    e.preventDefault();if(editorBusy||!editor)return;
    const components=$('revenue-classify-auto').checked?null:allocationRows().filter(row=>row.amount!==0);
    if(components&&(!components.length||components.some(row=>!Number.isSafeInteger(row.amount)||row.amount<0)||components.reduce((sum,row)=>sum+row.amount,0)!==editor.amount)){$('revenue-classify-status').textContent='세부 항목 금액의 합계를 거래 금액과 맞춰 주세요.';return;}
    setEditorBusy(true);$('revenue-classify-status').textContent='분류를 저장하는 중입니다.';
    try{await X.A('/revenue/classifications',{method:'PUT',body:{movement_id:editor.id,expected_version:editor.version,channel:$('revenue-classify-channel').value,account:$('revenue-classify-account').value.trim(),components}});dialog.close();load({detailOnly:true,trend:true});}
    catch(error){if(!X.guard(error))$('revenue-classify-status').textContent=error.message||'분류를 저장하지 못했습니다.';}
    finally{setEditorBusy(false);}
  });
  window.addEventListener('admin-settlement-saved',()=>{if(!$('view-revenue').hidden)load({detailOnly:true,trend:true});});
  X.register('revenue',()=>{if(!form.elements.from.value)month();if(!filters)search();else load();});
})();
