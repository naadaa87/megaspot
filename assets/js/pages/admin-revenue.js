(function () {
  'use strict';
  const X = window.MEGASPOT_ADMIN;
  const $ = id => document.getElementById(id);
  const form = $('revenue-form');
  const report = $('revenue-report');
  const status = $('revenue-status');
  const dayList = $('revenue-daily');
  const detail = $('revenue-detail');
  const labels = {
    'megaspot-gundae':'건대 1호점',
    'megaspot-gundae-2':'건대 2호점',
    unassigned:'공통·지점 미지정'
  };
  const columns = Object.keys(labels);
  const won = n => Number(n).toLocaleString('ko-KR')+'원';
  const esc = X.esc;
  let filters, selectedDay = '', page = 1, version = 0;

  function month() {
    const today = new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
    const currentMonth = today.slice(0,7);
    const [year,number] = currentMonth.split('-').map(Number);
    form.elements.from.value = currentMonth+'-01';
    form.elements.to.value = new Date(Date.UTC(year,number,0)).toISOString().slice(0,10);
  }
  function money(n) {
    return '<td class="revenue-num'+(n<0?' revenue-refund':'')+'">'+won(n)+'</td>';
  }
  function table(headers, rows, firstMoneyColumn) {
    return '<table><thead><tr>'+headers.map((name,index)=>'<th scope="col"'+(index>=firstMoneyColumn?' class="revenue-num"':'')+'>'+name+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>';
  }
  function render(r) {
    const filtered = filters.get('space');
    const shownBranches = filtered ? [] : columns;
    const cards = [[filtered ? labels[filtered] : '전체 합계',r.total],
      ...shownBranches.map(key=>[labels[key],r.branches[key]])];
    $('revenue-totals').innerHTML = cards.map(([name,t])=>'<div class="adm-card revenue-total"><h2>'+name+'</h2><dl>'
      +'<dt>수납액</dt><dd>'+won(t.received)+'</dd><dt>환불액</dt><dd>'+won(t.refunded)+'</dd>'
      +'<dt>순매출</dt><dd class="'+(t.net<0?'revenue-refund':'')+'">'+won(t.net)+'</dd></dl></div>').join('');
    dayList.innerHTML = r.daily.length ? table(['날짜','수납액','환불액','순매출',...shownBranches.map(key=>labels[key])],
      r.daily.map(d=>'<tr><td class="revenue-date"><button type="button" class="btn btn-light btn-sm" data-revenue-day="'+esc(d.day)+'" aria-pressed="'+(selectedDay===d.day)+'">'+esc(d.day)+'</button></td>'
        +money(d.received)+money(d.refunded)+money(d.net)+shownBranches.map(key=>money(d.branches[key]?.net||0)).join('')+'</tr>'),1)
      : '<p class="small muted">선택한 조건에 해당하는 매출 기록이 없습니다.</p>';
    $('revenue-clear-day').hidden = !selectedDay;
    $('revenue-detail-label').textContent = (selectedDay ? selectedDay+' · ' : '조회 기간 전체 · ')+r.detailCount.toLocaleString('ko-KR')+'건';
    $('revenue-items').innerHTML = r.items.length ? table(['이용일','수납·환불 기록일','지점','거래·참조번호','구분','금액'],
      r.items.map(row=>{
        const refund = row.kind==='refund', manual = row.source==='manual';
        const kind = (manual?'수기 ':'온라인 ')+(refund?'환불':manual?'수납':'결제');
        const booking = row.booking_code ? '<button type="button" class="btn btn-light btn-sm" data-settlement-code="'+esc(row.booking_code)+'" aria-label="예약 '+esc(row.booking_code)+' 수납·환불 내역">'+esc(row.booking_code)+'</button>' : '';
        return '<tr><td class="revenue-date">'+esc(row.event_date)+'</td>'
          +'<td class="revenue-date">'+esc(row.recorded_day||'날짜 미상')+(row.estimated?' <span class="tiny muted">추정</span>':'')+'</td>'
          +'<td>'+labels[row.branch]+'</td><td>'+esc(row.title)
          +'<span class="tiny muted revenue-ref">'+(manual?'':esc(row.ref)+' ')+booking+'</span></td><td>'+kind+'</td>'
          +money(refund ? -row.amount : row.amount)+'</tr>';
      }),5) : '<p class="small muted">표시할 거래가 없습니다.</p>';
    const pages = Math.max(1,Math.ceil(r.detailCount/r.pageSize));
    $('revenue-pagination').hidden = pages<=1;
    $('revenue-prev').disabled = r.page<=1;
    $('revenue-next').disabled = r.page>=pages;
    $('revenue-page').textContent = r.page+' / '+pages;
  }
  async function load({detailOnly=false,focus}={}) {
    const request = ++version;
    const q = new URLSearchParams(filters);
    q.set('page',page);
    if(selectedDay) q.set('day',selectedDay);
    if(!detailOnly) report.hidden = true;
    report.setAttribute('aria-busy','true');
    status.textContent = '매출 내역을 불러오는 중입니다.';
    try {
      const r = await X.A('/revenue?'+q);
      if(request!==version) return;
      const lastPage = Math.max(1,Math.ceil(r.detailCount/r.pageSize));
      if(page>lastPage) { page = lastPage; return load({detailOnly,focus}); }
      render(r);
      report.hidden = false;
      status.textContent = filters.get('from')+' ~ '+filters.get('to')+' · 이용일 기준 · 보증금 제외';
      if(focus && !$('view-revenue').hidden) {
        const target = detail.querySelector(focus);
        if(target && !target.hidden && !target.disabled) target.focus();
        else detail.querySelector('h2').focus();
      }
    } catch(e) {
      if(request!==version) return;
      report.hidden = true;
      if(!X.guard(e)) status.textContent = e.message || '매출 내역을 불러오지 못했습니다.';
    } finally {
      if(request===version) report.removeAttribute('aria-busy');
    }
  }
  function search() {
    filters = new URLSearchParams(new FormData(form));
    selectedDay = '';
    page = 1;
    load();
  }
  detail.querySelector('h2').tabIndex = -1;
  form.addEventListener('submit',e=>{e.preventDefault();search();});
  $('revenue-month').addEventListener('click',()=>{month();search();});
  dayList.addEventListener('click',e=>{
    const button = e.target.closest('[data-revenue-day]');
    if(!button || report.getAttribute('aria-busy')==='true') return;
    selectedDay = button.dataset.revenueDay;
    page = 1;
    load({detailOnly:true,focus:'#revenue-clear-day'});
  });
  $('revenue-clear-day').addEventListener('click',()=>{selectedDay='';page=1;load({detailOnly:true,focus:'h2'});});
  $('revenue-prev').addEventListener('click',()=>{if(report.getAttribute('aria-busy')!=='true'){page--;load({detailOnly:true,focus:'#revenue-prev'});}});
  $('revenue-next').addEventListener('click',()=>{if(report.getAttribute('aria-busy')!=='true'){page++;load({detailOnly:true,focus:'#revenue-next'});}});
  window.addEventListener('admin-settlement-saved',()=>{if(!$('view-revenue').hidden)load({detailOnly:true});});
  X.register('revenue',()=>{
    if(!form.elements.from.value) month();
    if(!filters) search();
    else load();
  });
})();
