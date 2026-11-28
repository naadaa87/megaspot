/* 관리자 · 수납 장부 (2026-11-28) — 새 메뉴 (예약·일정 → 수납 장부, view: ledger)
   고객(예약)마다 받은 돈을 수납일자·수납방법별로 적고, 받을 돈과 맞춰 남은 금액을 챙깁니다.
   · 수납방법: 계좌이체(법인) · 계좌이체(개인) · 온라인(페이앱) · 현장결제(포스기) · 현금 · 기타(직접 입력)
   · 고객별 장부: 챙길 것(기한 지난 미수·이용 후 미수·장부 입력 필요·초과 수납) → 장부 열기 → 기록
   · 수납 내역: 수납일자 기간·수납방법별 합계와 전체 기록, CSV 내려받기
   · 기존 결제 기록(페이앱·결제링크·이용료 수납·정산)은 참고로만 보여 주고 [장부에 옮기기]로 한 건씩 적습니다.
   /api/admin/ledger… 만 씁니다. 예약·결제 원장은 읽기만 합니다. 메뉴 버튼은 admin-navigation.js 가 붙입니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var main=document.querySelector('.adm-main'); if(!main) return;
  var esc=X.esc;
  var TABS=[['todo','챙길 것'],['due','남은 금액 있음'],['overdue','기한 지난 미수'],['sync','장부 입력 필요'],['over','초과 수납'],['unbilled','금액 미정'],['paid','완납'],['all','전체']];
  var KIND_ORDER=['receipt','refund','deposit_in','deposit_out','charge','discount'], MONEY=['receipt','refund','deposit_in','deposit_out'];
  var METHOD_ORDER=['bank_corp','bank_personal','payapp','pos','cash','other'];
  var V=document.createElement('section'); V.id='view-ledger'; V.className='adm-view lg-view'; V.hidden=true;
  V.innerHTML='<header class="adm-head"><div><h1>수납 장부</h1><p class="small muted">고객(예약)마다 <b>받은 돈을 수납일자·수납방법별로</b> 적습니다. 받을 돈에서 받은 돈을 뺀 것이 남은 금액입니다. 기존 예약·결제 기록은 바꾸지 않고, 장부를 열면 참고로 함께 보여 줍니다.</p></div>'
    +'<div class="lg-head-acts"><button type="button" class="btn btn-light btn-sm" id="lg-refresh">새로고침</button></div></header>'
    +'<nav class="lg-modes" aria-label="수납 장부 보기"><button type="button" data-mode="book" class="on">고객별 장부</button><button type="button" data-mode="journal">수납 내역 · 일자·수단별</button></nav>'
    +'<div id="lg-book"><div class="lg-tiles" id="lg-tiles"></div>'
    +'<div class="lg-bar"><nav class="lg-tabs" id="lg-tabs" aria-label="장부 상태"></nav></div>'
    +'<div class="lg-filters"><input class="input lg-search" id="lg-q" type="search" placeholder="이름·단체·연락처·예약번호·입금자"><select class="select" id="lg-space"><option value="">모든 공간</option><option value="megaspot-gundae">건대 1호</option><option value="megaspot-gundae-2">건대 2호</option><option value="food-only">식음료 단독</option></select>'
    +'<select class="select" id="lg-period"><option value="">이용일 · 최근 1년 ~ 6개월 뒤</option><option value="this">이용일 · 이번 달</option><option value="prev">이용일 · 지난달</option><option value="next">이용일 · 다음 달</option><option value="custom">이용일 · 직접 고르기</option></select>'
    +'<span class="lg-range" id="lg-range" hidden><input class="input" type="date" id="lg-from" aria-label="이용일 시작"> ~ <input class="input" type="date" id="lg-to" aria-label="이용일 끝"><button type="button" class="btn btn-light btn-sm" id="lg-range-go">보기</button></span></div>'
    +'<p class="small muted" id="lg-status" role="status"></p><div class="lg-list" id="lg-list"></div></div>'
    +'<div id="lg-journal" hidden><div class="lg-filters"><span class="lg-range"><input class="input" type="date" id="lj-from" aria-label="수납일자 시작"> ~ <input class="input" type="date" id="lj-to" aria-label="수납일자 끝"></span>'
    +'<span class="lg-quick"><button type="button" class="btn btn-light btn-sm" data-jq="today">오늘</button><button type="button" class="btn btn-light btn-sm" data-jq="week">최근 7일</button><button type="button" class="btn btn-light btn-sm" data-jq="month">이번 달</button><button type="button" class="btn btn-light btn-sm" data-jq="prev">지난달</button></span>'
    +'<select class="select" id="lj-method"></select><select class="select" id="lj-kind"></select><button type="button" class="btn btn-primary btn-sm" id="lj-go">조회</button><button type="button" class="btn btn-light btn-sm" id="lj-csv">CSV 내려받기</button></div>'
    +'<p class="small muted" id="lj-status" role="status"></p><div id="lj-sum"></div><div id="lj-list"></div></div>';
  main.appendChild(V);
  var D=document.createElement('dialog'); D.id='lg-dialog'; D.className='lg-dialog'; D.setAttribute('aria-labelledby','lg-d-title');
  document.body.appendChild(D);
  var q=function(s){ return V.querySelector(s); }, data=null, jdata=null, tab='todo', mode='book', range={from:'',to:''}, cur=null, edit=null, showVoid=false, form=null, loadedOnce=false;

  // ---------- 작은 도구 ----------
  function won(n){ return n==null?'—':Number(n).toLocaleString('ko-KR')+'원'; }
  function num(v){ var s=String(v==null?'':v).replace(/[^\d]/g,''); return s?Number(s):NaN; }
  var WD=['일','월','화','수','목','금','토'];
  function kd(d){ if(!d) return ''; var t=new Date(d+'T00:00:00Z'); return t.getUTCFullYear()+'. '+(t.getUTCMonth()+1)+'. '+t.getUTCDate()+'.('+WD[t.getUTCDay()]+')'; }
  function md(d){ if(!d) return ''; var t=new Date(d+'T00:00:00Z'); return (t.getUTCMonth()+1)+'/'+t.getUTCDate()+'('+WD[t.getUTCDay()]+')'; }
  function hm(h){ if(h==null) return ''; var x=Number(h); return (x>=24?'다음 날 ':'')+('0'+Math.floor(x%24)).slice(-2)+':'+('0'+Math.round((x%1)*60)).slice(-2); }
  function kst(at){ var t=Date.parse(String(at||'').replace(' ','T')+'Z'); if(!isFinite(t)) return ''; var d=new Date(t+9*36e5); return d.getUTCFullYear()+'-'+('0'+(d.getUTCMonth()+1)).slice(-2)+'-'+('0'+d.getUTCDate()).slice(-2)+' '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2); }
  function shift(d,n){ return new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10); }
  function monthEnd(ym){ var t=new Date(Date.UTC(+ym.slice(0,4),+ym.slice(5,7),0)); return t.toISOString().slice(0,10); }
  function prevMonth(ym){ var t=new Date(Date.UTC(+ym.slice(0,4),+ym.slice(5,7)-2,1)); return t.toISOString().slice(0,7); }
  function nextMonth(ym){ var t=new Date(Date.UTC(+ym.slice(0,4),+ym.slice(5,7),1)); return t.toISOString().slice(0,7); }
  function today(){ return (data&&data.today)||(jdata&&jdata.today)||new Date(Date.now()+9*36e5).toISOString().slice(0,10); }
  function dlabel(d){ return d===0?'오늘 이용':d>0?'D-'+d:'이용 '+(-d)+'일 지남'; }
  function rid(){ var a=new Uint8Array(10); (window.crypto||window.msCrypto).getRandomValues(a); return 'lg-'+Array.prototype.map.call(a,function(x){ return ('0'+x.toString(16)).slice(-2); }).join(''); }
  function by(){ try{ return localStorage.getItem('megaspot.ledger.by')||''; }catch(e){ return ''; } }
  function setBy(v){ try{ localStorage.setItem('megaspot.ledger.by',v||''); }catch(e){} }
  function opts(){ return (data&&data.options)||(jdata&&jdata.options)||(cur&&cur.options)||{methods:{},kinds:{},items:{},proofs:{},status:{}}; }
  function fail(e){ if(!X.guard(e)) M.toast((e&&e.message)||'처리하지 못했습니다.'); throw e; }
  function navCount(n){ var b=document.querySelector('#adm-nav button[data-view="ledger"]'); if(!b) return; var em=b.querySelector('em.lg-count'); if(!em){ em=document.createElement('em'); em.className='lg-count'; b.appendChild(em); } em.textContent=n>0?String(n):''; em.hidden=!(n>0); }

  // ---------- 고객별 장부 ----------
  function load(){
    q('#lg-status').textContent='불러오는 중…';
    var qs=range.from?'?from='+range.from+'&to='+range.to:'';
    return X.A('/ledger'+qs).then(function(r){ data=r; loadedOnce=true; navCount(r.counts.todo||0); draw(); })
      .catch(function(e){ if(!X.guard(e)) q('#lg-status').textContent='불러오지 못했습니다: '+(e&&e.message||''); });
  }
  function inTab(x){
    if(tab==='todo') return x.todo; if(tab==='all') return true; if(tab==='sync') return x.sync; if(tab==='due') return x.balance>0; if(tab==='overdue') return x.overdue; return x.status===tab;
  }
  function urgency(x){ return x.status==='over'?0:x.overdue&&x.after?1:x.overdue?2:x.after?3:x.sync?4:x.balance>0?5:6; }
  function draw(){
    var c=data.counts, t=data.totals;
    q('#lg-tiles').innerHTML=[
      ['todo','챙길 것',c.todo||0,'기한 지난 미수·장부 입력 필요 등',null],
      ['due','남은 금액 합계',c.due||0,'미수 '+(c.unpaid||0)+'건 · 일부 수납 '+(c.partial||0)+'건',t.outstanding],
      ['overdue','기한 지난 미수',c.overdue||0,'이용 후 미수 '+(c.after||0)+'건',t.overdue],
      ['sync','장부 입력 필요',c.sync||0,'시스템 결제 기록이 장부에 아직 없음',t.unrecorded],
      ['month','이번 달 수납',data.month.count,data.month.month.replace('-','년 ')+'월 · 환불 뺀 금액',data.month.net]
    ].map(function(x){ return '<button type="button" class="lg-tile lg-t-'+x[0]+(tab===x[0]?' on':'')+'" data-tile="'+x[0]+'"><span>'+x[1]+'</span><b>'+x[2]+'<small>건</small></b><em>'+esc(x[3])+'</em>'+(x[4]!=null?'<i>'+won(x[4])+'</i>':'')+'</button>'; }).join('');
    q('#lg-tabs').innerHTML=TABS.map(function(x){ var n=x[0]==='all'?c.all:(c[x[0]]||0); return '<button type="button" data-tab="'+x[0]+'" class="'+(tab===x[0]?'on':'')+'">'+esc(x[1])+' <b>'+n+'</b></button>'; }).join('');
    var kw=q('#lg-q').value.trim().toLowerCase().replace(/-/g,''), sp=q('#lg-space').value;
    var list=data.items.filter(inTab).filter(function(x){ return (!sp||x.space_id===sp)&&(!kw||[x.name,x.org,x.code,x.phone,x.inquiry_ref,x.memo].join(' ').toLowerCase().replace(/-/g,'').indexOf(kw)>=0); });
    if(tab==='all'||tab==='paid') list.sort(function(a,b){ return a.date<b.date?1:a.date>b.date?-1:0; });
    else list.sort(function(a,b){ return (urgency(a)-urgency(b))||(Math.abs(a.d)-Math.abs(b.d)); });
    q('#lg-status').textContent='이용일 '+kd(data.from)+' ~ '+kd(data.to)+' · '+list.length+'건'+(data.truncated?' · 예약이 많아 3,000건까지만 불러왔습니다. 기간을 좁혀 주세요.':'');
    q('#lg-list').innerHTML=list.length?list.map(row).join(''):'<div class="adm-card"><p class="small muted">'+(tab==='todo'?'지금 챙길 수납 건이 없습니다.':'이 조건에 맞는 예약이 없습니다.')+'</p></div>';
  }
  function statusChip(x){ return '<span class="lg-st lg-st-'+esc(x.status)+'">'+esc(x.status_label)+'</span>'; }
  function row(x){
    var chips=[statusChip(x)];
    if(x.overdue) chips.push('<span class="lg-chip lg-red">납부 기한 '+esc(md(x.due_date))+' 지남</span>');
    else if(x.balance>0&&x.d>=0) chips.push('<span class="lg-chip">납부 기한 '+esc(md(x.due_date))+'</span>');
    if(x.after) chips.push('<span class="lg-chip lg-red">이용 후 미수</span>');
    if(x.sync) chips.push('<span class="lg-chip lg-amber">장부 입력 필요 · 시스템 기록 '+won(x.unrecorded)+' 미반영</span>');
    else if(x.checked_at) chips.push('<span class="lg-chip lg-ok">기존 결제 옮기기 확인</span>');
    if(x.deposit&&x.deposit.held>0) chips.push('<span class="lg-chip">보증금 보관 '+won(x.deposit.held)+'</span>');
    if(x.last_receipt) chips.push('<span class="lg-chip">최근 수납 '+esc(md(x.last_receipt.paid_on))+' · '+esc(x.last_receipt.method_label)+'</span>');
    if(x.booking_status!=='confirmed') chips.push('<span class="lg-chip lg-mute">'+esc(x.booking_status_label)+'</span>');
    return '<article class="adm-card lg-row lg-r-'+esc(x.status)+(x.overdue||x.after?' is-late':'')+'" data-lg="'+esc(x.code)+'">'
      +'<div class="lg-top"><span class="lg-d'+(x.d===0?' is-today':x.d<0?' is-past':'')+'">'+esc(dlabel(x.d))+'</span>'
      +'<div class="lg-who"><b>'+esc(x.name)+'</b>'+(x.org?' <span class="muted">'+esc(x.org)+'</span>':'')
      +'<p class="small muted">'+esc(kd(x.date))+' '+esc(hm(x.start_h))+'~'+esc(hm(x.end_h))+' · '+esc(x.space)+' · '+esc(x.code)+' · <a href="tel:'+esc(x.phone)+'">'+esc(x.phone)+'</a></p></div>'
      +'<dl class="lg-money"><div><dt>받을 돈</dt><dd>'+(x.billed==null?'금액 미정':won(x.billed))+'</dd></div><div><dt>받은 돈</dt><dd>'+won(x.received)+'</dd></div><div class="lg-bal"><dt>남은 금액</dt><dd>'+(x.balance==null?'—':x.balance<0?'초과 '+won(-x.balance):won(x.balance))+'</dd></div></dl></div>'
      +'<div class="lg-mid">'+chips.join('')+'</div>'
      +'<div class="lg-acts"><button type="button" class="btn btn-primary btn-sm" data-open="'+esc(x.code)+'" data-add="1">수납 기록</button><button type="button" class="btn btn-light btn-sm" data-open="'+esc(x.code)+'">장부 열기'+(x.entries?' · '+x.entries+'건':'')+'</button></div></article>';
  }

  // ---------- 수납 내역 ----------
  function jload(){
    var f=q('#lj-from').value, t=q('#lj-to').value;
    q('#lj-status').textContent='불러오는 중…';
    return X.A('/ledger/entries?from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t)+'&method='+encodeURIComponent(q('#lj-method').value)+'&kind='+encodeURIComponent(q('#lj-kind').value))
      .then(function(r){ jdata=r; jdraw(); }).catch(function(e){ if(!X.guard(e)) q('#lj-status').textContent='불러오지 못했습니다: '+(e&&e.message||''); });
  }
  function jfill(){
    var o=opts();
    if(!q('#lj-method').options.length){ q('#lj-method').innerHTML='<option value="">모든 수납방법</option>'+METHOD_ORDER.map(function(k){ return '<option value="'+k+'">'+esc(o.methods[k]||k)+'</option>'; }).join(''); }
    if(!q('#lj-kind').options.length){ q('#lj-kind').innerHTML='<option value="">모든 종류</option>'+KIND_ORDER.map(function(k){ return '<option value="'+k+'">'+esc(o.kinds[k]||k)+'</option>'; }).join(''); }
    if(!q('#lj-from').value){ var t=today(); q('#lj-from').value=t.slice(0,7)+'-01'; q('#lj-to').value=t; }
  }
  function jdraw(){
    var r=jdata, o=r.options;
    q('#lj-status').textContent='수납일자 '+kd(r.from)+' ~ '+kd(r.to)+' · '+r.entries.length+'건'+(r.truncated?' · 3,000건까지만 불러왔습니다. 기간을 좁혀 주세요.':'');
    var rows=METHOD_ORDER.filter(function(k){ return r.by_method[k]&&r.by_method[k].n; }), tot={receipt:0,refund:0,net:0,deposit_in:0,deposit_out:0,n:0};
    rows.forEach(function(k){ var m=r.by_method[k]; ['receipt','refund','net','deposit_in','deposit_out','n'].forEach(function(f){ tot[f]+=m[f]; }); });
    q('#lj-sum').innerHTML='<div class="adm-card lg-sum"><h2 class="h-s">수납방법별 합계</h2>'+(rows.length?'<div class="lg-table-wrap"><table class="lg-table"><thead><tr><th>수납방법</th><th>받은 돈</th><th>환불</th><th>받은 돈 − 환불</th><th>보증금 입금</th><th>보증금 반환</th><th>건수</th></tr></thead><tbody>'
      +rows.map(function(k){ var m=r.by_method[k]; return '<tr><th scope="row">'+esc(o.methods[k])+'</th><td>'+won(m.receipt)+'</td><td>'+(m.refund?'−'+won(m.refund):'—')+'</td><td><b>'+won(m.net)+'</b></td><td>'+(m.deposit_in?won(m.deposit_in):'—')+'</td><td>'+(m.deposit_out?'−'+won(m.deposit_out):'—')+'</td><td>'+m.n+'</td></tr>'; }).join('')
      +'</tbody><tfoot><tr><th scope="row">합계</th><td>'+won(tot.receipt)+'</td><td>'+(tot.refund?'−'+won(tot.refund):'—')+'</td><td><b>'+won(tot.net)+'</b></td><td>'+(tot.deposit_in?won(tot.deposit_in):'—')+'</td><td>'+(tot.deposit_out?'−'+won(tot.deposit_out):'—')+'</td><td>'+tot.n+'</td></tr></tfoot></table></div>':'<p class="small muted">이 기간에 적은 수납 기록이 없습니다.</p>')
      +((r.by_kind.charge||r.by_kind.discount)?'<p class="small muted">같은 기간 추가 청구 '+won(r.by_kind.charge)+' · 할인·감액 '+won(r.by_kind.discount)+' (받을 돈에만 반영, 받은 돈 합계에는 들어가지 않습니다)</p>':'')+'</div>';
    q('#lj-list').innerHTML=r.entries.length?'<div class="adm-card"><div class="lg-table-wrap"><table class="lg-table lg-journal"><thead><tr><th>수납일자</th><th>고객</th><th>종류</th><th>수납방법</th><th class="r">금액</th><th>입금자·결제자</th><th>증빙 · 번호</th><th>메모</th></tr></thead><tbody>'
      +r.entries.map(function(e){ var minus=e.kind==='refund'||e.kind==='deposit_out'||e.kind==='discount';
        return '<tr data-open="'+esc(e.booking_code)+'" tabindex="0"><td>'+esc(md(e.paid_on))+'</td><td><b>'+esc(e.name||e.booking_code)+'</b>'+(e.org?'<br><span class="muted">'+esc(e.org)+'</span>':'')+'<br><span class="tiny muted">'+esc(e.booking_code)+(e.booking_date?' · 이용 '+esc(md(e.booking_date)):'')+'</span></td>'
          +'<td><span class="lg-k lg-k-'+esc(e.kind)+'">'+esc(e.kind_label)+'</span>'+(e.item_label&&e.kind!=='deposit_in'&&e.kind!=='deposit_out'?'<br><span class="tiny muted">'+esc(e.item_label)+'</span>':'')+'</td><td>'+esc(e.method_label||'—')+'</td>'
          +'<td class="r'+(minus?' lg-minus':'')+'">'+(minus?'−':'')+won(e.amount)+'</td><td>'+esc(e.payer||'')+'</td><td>'+esc(e.proof_label||'')+(e.ref_no?'<br><span class="tiny muted">'+esc(e.ref_no)+'</span>':'')+'</td><td>'+esc(e.memo||'')+(e.recorded_by?'<br><span class="tiny muted">담당 '+esc(e.recorded_by)+'</span>':'')+'</td></tr>'; }).join('')
      +'</tbody></table></div></div>':'';
  }
  function csv(){
    if(!jdata||!jdata.entries.length){ M.toast('내려받을 기록이 없습니다. 먼저 조회해 주세요.'); return; }
    var head=['수납일자','종류','항목','수납방법','금액','부호 금액','고객명','단체','연락처','예약번호','이용일','공간','입금자·결제자','증빙','승인·거래번호','메모','담당자','기록 시각'];
    var cell=function(v){ v=v==null?'':String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
    var lines=[head.join(',')].concat(jdata.entries.map(function(e){ var minus=e.kind==='refund'||e.kind==='deposit_out'||e.kind==='discount';
      return [e.paid_on,e.kind_label,e.item_label,e.method_label,e.amount,(minus?-1:1)*e.amount,e.name,e.org,e.phone,e.booking_code,e.booking_date,e.space,e.payer,e.proof_label,e.ref_no,e.memo,e.recorded_by,kst(e.created_at)].map(cell).join(','); }));
    var blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}), a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download='메가스팟_수납내역_'+jdata.from+'_'+jdata.to+'.csv'; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  }

  // ---------- 예약 1건 장부 (창) ----------
  function open(code, add){
    D.innerHTML='<div class="lg-d-body"><p class="small muted">장부를 불러오는 중…</p></div>';
    if(!D.open){ try{ D.showModal(); }catch(e){ D.setAttribute('open',''); } }
    edit=null; showVoid=false;
    return X.A('/ledger/'+encodeURIComponent(code)).then(function(r){ cur=r; render(); if(add) focusForm(); })
      .catch(function(e){ if(!X.guard(e)) D.innerHTML='<div class="lg-d-body"><p>장부를 불러오지 못했습니다: '+esc(e&&e.message||'')+'</p><button type="button" class="btn btn-light btn-sm" data-close>닫기</button></div>'; });
  }
  function reopen(){ var y=D.querySelector('.lg-d-body'); var top=y?y.scrollTop:0; return X.A('/ledger/'+encodeURIComponent(cur.booking.code)).then(function(r){ cur=r; render(); var b=D.querySelector('.lg-d-body'); if(b) b.scrollTop=top; if(mode==='book'&&loadedOnce) load(); else if(mode==='journal'&&jdata) jload(); }); }
  function focusForm(){ var el=D.querySelector('#lg-f'); if(el){ el.scrollIntoView({block:'start'}); var a=D.querySelector('#lg-f [data-f=amount]'); if(a) a.focus({preventScroll:true}); } }
  function render(){
    var r=cur, b=r.booking, l=r.ledger, o=r.options;
    var syncNote=l.sync?'<div class="lg-alert"><b>장부 입력 필요</b> — 시스템에 남은 결제 기록 중 <b>'+won(l.unrecorded)+'</b>이 장부에 아직 없습니다. 아래 <a href="#lg-ref">기존 결제 기록</a>에서 확인하고 옮겨 주세요. 다 확인했는데 금액이 다르면 [옮기기 확인 완료]를 눌러 두세요.</div>':'';
    var dep=l.deposit.in||l.deposit.out||r.deposit?'<div><dt>보증금</dt><dd>'+(l.deposit.in?'받음 '+won(l.deposit.in):'받은 기록 없음')+(l.deposit.out?' · 반환 '+won(l.deposit.out):'')+(l.deposit.held>0?'<small>보관 중 '+won(l.deposit.held)+'</small>':'')+(r.deposit&&r.deposit.amount?'<small>예약 보증금 '+won(r.deposit.amount)+'</small>':'')+'</dd></div>':'';
    var basis=l.base_source==='ledger'?'장부에서 정한 금액 '+won(l.base)+' (예약 금액 '+won(l.booking_amount)+')':'예약 금액 '+(l.base==null?'미정':won(l.base));
    if(l.charge) basis+=' + 추가 청구 '+won(l.charge); if(l.discount) basis+=' − 할인 '+won(l.discount);
    D.innerHTML='<div class="lg-d-head"><div><p class="tiny muted">수납 장부 · '+esc(b.code)+'</p><h2 id="lg-d-title">'+esc(b.name)+(b.org?' <span class="muted">'+esc(b.org)+'</span>':'')+'</h2>'
      +'<p class="small muted">'+esc(kd(b.date))+' '+esc(hm(b.start_h))+'~'+esc(hm(b.end_h))+' · '+esc(b.space)+(b.headcount?' · '+esc(b.headcount)+'명':'')+' · <a href="tel:'+esc(b.phone)+'">'+esc(b.phone)+'</a> · '+esc(b.booking_status_label)+'</p></div>'
      +'<button type="button" class="lg-x" data-close aria-label="닫기">×</button></div>'
      +'<div class="lg-d-body">'
      +'<dl class="lg-summary"><div><dt>받을 돈</dt><dd>'+(l.billed==null?'금액 미정':won(l.billed))+'<small>'+esc(basis)+'</small></dd></div>'
      +'<div><dt>받은 돈</dt><dd>'+won(l.received)+(l.refund?'<small>수납 '+won(l.receipt)+' − 환불 '+won(l.refund)+'</small>':'')+'</dd></div>'
      +'<div class="lg-bal lg-st-'+esc(l.status)+'"><dt>남은 금액</dt><dd>'+(l.balance==null?'—':l.balance<0?'초과 '+won(-l.balance):won(l.balance))+'<small>'+esc(l.status_label)+(l.balance>0?' · 납부 기한 '+esc(md(b.due_date))+(b.overdue?' 지남':''):'')+'</small></dd></div>'+dep+'</dl>'
      +syncNote
      +formHtml()
      +entriesHtml()
      +refHtml()
      +metaHtml()
      +othersHtml()
      +historyHtml()
      +'</div>';
    bindForm();
  }
  function blank(){ return {kind:'receipt',paid_on:cur.today,amount:'',method:'',method_note:'',item:'rental',payer:'',proof:'',ref_no:'',memo:'',source_ref:'',request_id:rid()}; }
  function formHtml(){
    var o=cur.options, f=form||(form=blank()), money=MONEY.indexOf(f.kind)>=0, isEdit=!!edit;
    var kinds=KIND_ORDER.map(function(k){ return '<label class="lg-seg'+(f.kind===k?' on':'')+'"><input type="radio" name="lg-kind" value="'+k+'"'+(f.kind===k?' checked':'')+(isEdit&&edit.source_ref?' disabled':'')+'>'+esc(o.kinds[k])+'</label>'; }).join('');
    var methods=METHOD_ORDER.map(function(k){ return '<label class="lg-seg'+(f.method===k?' on':'')+'"><input type="radio" name="lg-method" value="'+k+'"'+(f.method===k?' checked':'')+'>'+esc(o.methods[k]+(k==='other'?'(직접 입력)':''))+'</label>'; }).join('');
    var items=Object.keys(o.items).map(function(k){ return '<option value="'+k+'"'+(f.item===k?' selected':'')+'>'+esc(o.items[k])+'</option>'; }).join('');
    var proofs='<option value="">확인 전</option>'+Object.keys(o.proofs).map(function(k){ return '<option value="'+k+'"'+(f.proof===k?' selected':'')+'>'+esc(o.proofs[k])+'</option>'; }).join('');
    var bal=cur.ledger.balance;
    return '<section class="lg-sec lg-form'+(isEdit?' is-edit':'')+'" id="lg-f" aria-labelledby="lg-f-title"><h3 id="lg-f-title">'+(isEdit?'기록 고치기 <span class="muted">#'+edit.id+'</span>':f.source_ref?'기존 결제 기록을 장부에 옮기기':'수납 기록하기')+'</h3>'
      +(f.source_ref?'<p class="small lg-src">옮기는 기록: '+esc(f.source_label||f.source_ref)+' — 내용을 확인하고 수납방법을 고른 뒤 저장해 주세요.</p>':'')
      +'<div class="lg-segs" role="radiogroup" aria-label="종류">'+kinds+'</div>'
      +'<div class="lg-grid"><label>'+(money?'수납일자':'청구일')+'<input class="input" type="date" data-f="paid_on" max="'+esc(cur.today)+'" value="'+esc(f.paid_on)+'"></label>'
      +'<label>금액 (원)<span class="lg-amt"><input class="input" inputmode="numeric" autocomplete="off" data-f="amount" value="'+esc(f.amount===''?'':Number(f.amount).toLocaleString('ko-KR'))+'"'+(isEdit&&edit.source_ref?' readonly':'')+' placeholder="0">'
      +(f.kind==='receipt'&&!isEdit&&!f.source_ref&&bal>0?'<button type="button" class="btn btn-light btn-sm" data-do="fill">남은 금액 '+won(bal)+'</button>':'')+'</span></label></div>'
      +(money?'<div class="lg-field"><span class="lg-lab">수납방법</span><div class="lg-segs lg-methods" role="radiogroup" aria-label="수납방법">'+methods+'</div>'
        +'<input class="input lg-other" data-f="method_note" maxlength="40" placeholder="기타 수납방법 (예: 상품권, 상계 처리)" value="'+esc(f.method_note)+'"'+(f.method==='other'?'':' hidden')+'></div>'
        +'<div class="lg-grid">'+(f.kind.indexOf('deposit')===0?'':'<label>항목<select class="select" data-f="item">'+items+'</select></label>')
        +'<label>입금자·결제자명<input class="input" data-f="payer" maxlength="60" placeholder="통장 입금자명 또는 카드 명의" value="'+esc(f.payer)+'"></label>'
        +'<label>증빙<select class="select" data-f="proof">'+proofs+'</select></label>'
        +'<label>승인·거래번호<input class="input" data-f="ref_no" maxlength="80" placeholder="카드 승인번호·페이앱 결제번호 등" value="'+esc(f.ref_no)+'"></label></div>':'')
      +'<div class="lg-grid"><label class="lg-wide">'+(money?'메모':'사유 (필수)')+'<input class="input" data-f="memo" maxlength="300" placeholder="'+(money?'예: 잔금 · 12/3 통화 후 입금 확인':f.kind==='charge'?'예: 2시간 연장 · 인원 20명 추가':'예: 재방문 할인 · 장비 고장 보상')+'" value="'+esc(f.memo)+'"></label>'
      +'<label>담당자<input class="input" data-f="by" maxlength="30" placeholder="이름" value="'+esc(by())+'"></label></div>'
      +(isEdit?'<label class="lg-wide lg-reason">고친 이유 <small>(선택 · 기록 이력에 남습니다)</small><input class="input" data-f="reason" maxlength="300"></label>':'')
      +'<div class="lg-f-acts"><button type="button" class="btn btn-primary" data-do="save">'+(isEdit?'고친 내용 저장':'장부에 저장')+'</button>'
      +(isEdit?'<button type="button" class="btn btn-light" data-do="cancel-edit">고치기 그만두기</button><button type="button" class="btn btn-light lg-danger" data-do="void-open">이 기록 취소…</button>':'<button type="button" class="btn btn-light" data-do="reset">새로 쓰기</button>')+'</div>'
      +(isEdit?'<div class="lg-void" hidden><label>취소 사유 (필수)<input class="input" data-f="void_reason" maxlength="300" placeholder="예: 같은 입금을 두 번 적음 · 금액을 잘못 적음"></label><button type="button" class="btn btn-primary lg-danger-solid" data-do="void">기록 취소</button><p class="tiny muted">취소한 기록은 지워지지 않고 줄이 그어진 채 남습니다.</p></div>':'')
      +'</section>';
  }
  function entriesHtml(){
    var all=cur.entries, active=all.filter(function(e){ return e.state==='active'; }), voids=all.length-active.length, list=showVoid?all:active;
    return '<section class="lg-sec" aria-labelledby="lg-e-title"><div class="lg-sec-h"><h3 id="lg-e-title">장부 기록 <span class="muted">'+active.length+'건</span></h3>'+(voids?'<button type="button" class="btn btn-light btn-sm" data-do="toggle-void">'+(showVoid?'취소한 기록 숨기기':'취소한 기록 보기 · '+voids)+'</button>':'')+'</div>'
      +(list.length?'<div class="lg-table-wrap"><table class="lg-table lg-entries"><thead><tr><th>날짜</th><th>종류</th><th>수납방법</th><th class="r">금액</th><th>입금자·증빙</th><th>메모</th><th></th></tr></thead><tbody>'
      +list.map(function(e){ var minus=e.kind==='refund'||e.kind==='deposit_out'||e.kind==='discount', v=e.state==='void';
        return '<tr class="'+(v?'is-void':'')+(edit&&edit.id===e.id?' is-editing':'')+'"><td>'+esc(md(e.paid_on))+'</td><td><span class="lg-k lg-k-'+esc(e.kind)+'">'+esc(e.kind_label)+'</span>'+(e.item_label&&e.kind.indexOf('deposit')!==0?'<br><span class="tiny muted">'+esc(e.item_label)+'</span>':'')+'</td>'
          +'<td>'+esc(e.method_label||'—')+(e.source_ref?'<br><span class="tiny muted">시스템 기록에서 옮김</span>':'')+'</td><td class="r'+(minus?' lg-minus':'')+'">'+(minus?'−':'')+won(e.amount)+'</td>'
          +'<td>'+esc(e.payer||'')+(e.proof_label?'<br><span class="tiny">'+esc(e.proof_label)+'</span>':'')+(e.ref_no?'<br><span class="tiny muted">'+esc(e.ref_no)+'</span>':'')+'</td>'
          +'<td>'+esc(e.memo||'')+(e.recorded_by?'<br><span class="tiny muted">담당 '+esc(e.recorded_by)+'</span>':'')+(v?'<br><span class="tiny lg-red-t">취소 — '+esc(e.void_reason)+'</span>':'')+'</td>'
          +'<td>'+(v?'':'<button type="button" class="btn btn-light btn-sm" data-edit="'+e.id+'">고치기</button>')+'</td></tr>'; }).join('')
      +'</tbody></table></div>':'<p class="small muted">아직 장부에 적은 기록이 없습니다.</p>')+'</section>';
  }
  function refHtml(){
    var s=cur.system, refs=s.references, groups={};
    refs.forEach(function(x){ (groups[x.group]=groups[x.group]||[]).push(x); });
    var left=refs.filter(function(x){ return !x.done; }).length;
    return '<section class="lg-sec lg-ref" id="lg-ref" aria-labelledby="lg-r-title"><div class="lg-sec-h"><h3 id="lg-r-title">기존 결제 기록 <span class="muted">참고 · 장부와 따로 보관</span></h3>'
      +'<label class="chk lg-checked"><input type="checkbox" data-do="checked"'+(cur.ledger.checked_at?' checked':'')+'> 옮기기 확인 완료</label></div>'
      +'<p class="small muted">시스템 기준 받은 금액 <b>'+won(s.net)+'</b>'+(s.refunded?' (받음 '+won(s.received)+' − 환불 '+won(s.refunded)+')':'')+(s.amount!=null?' · 예약 금액 '+won(s.amount):'')+'. 아래 기록은 읽기만 하며, [장부에 옮기기]를 눌러도 기존 기록은 바뀌지 않습니다.'+(left?' 아직 옮기지 않은 기록 <b>'+left+'건</b>.':'')+'</p>'
      +(refs.length?Object.keys(groups).map(function(g){ return '<h4 class="lg-ref-g">'+esc(g)+'</h4><ul class="lg-refs">'+groups[g].map(function(x){ var minus=x.kind==='refund';
        return '<li class="'+(x.done?'is-done':'')+'"><div><b class="'+(minus?'lg-minus':'')+'">'+(minus?'−':'')+won(x.amount)+'</b> <span>'+esc(x.label)+'</span><br><span class="tiny muted">'+esc(x.date?md(x.date):'날짜 없음')+(x.ref_no?' · '+esc(x.ref_no):'')+(x.note?' · '+esc(x.note):'')+'</span></div>'
          +(x.done?'<span class="lg-chip lg-ok">장부에 있음</span>':'<button type="button" class="btn btn-light btn-sm" data-ref="'+esc(x.source)+'">장부에 옮기기</button>')+'</li>'; }).join('')+'</ul>'; }).join(''):'<p class="small muted">이 예약에 연결된 시스템 결제 기록이 없습니다. 계좌이체·현장결제·현금으로 받은 돈은 위에서 직접 적어 주세요.</p>')
      +'</section>';
  }
  function metaHtml(){
    var m=cur.meta||{}, l=cur.ledger;
    return '<section class="lg-sec" aria-labelledby="lg-m-title"><details'+(m.base_override!=null||m.memo?' open':'')+'><summary><h3 id="lg-m-title">받을 돈 기준 · 장부 메모</h3></summary>'
      +'<p class="small muted">받을 돈은 보통 예약 금액('+won(l.booking_amount)+')을 그대로 씁니다. 예약 금액이 비어 있거나 실제 계약 금액과 다를 때만 여기서 정해 주세요. 연장·인원 추가 같은 것은 [추가 청구]로 적는 편이 기록이 남아 좋습니다.</p>'
      +'<div class="lg-grid"><label>청구 기준 금액 (원)<input class="input" inputmode="numeric" data-m="base" value="'+(m.base_override!=null?Number(m.base_override).toLocaleString('ko-KR'):'')+'" placeholder="비우면 예약 금액 그대로"></label>'
      +'<label class="lg-wide">정한 이유<input class="input" data-m="reason" maxlength="200" value="'+esc(m.base_reason||'')+'" placeholder="예: 계약서 금액 기준 · 예약 금액 미입력"></label></div>'
      +'<label class="lg-wide">장부 메모<textarea class="input" rows="2" data-m="memo" maxlength="500" placeholder="예: 법인 결제 · 세금계산서 담당 김OO 대리 · 매월 말 입금">'+esc(m.memo||'')+'</textarea></label>'
      +'<div class="lg-f-acts"><button type="button" class="btn btn-light btn-sm" data-do="meta">저장</button></div></details></section>';
  }
  function othersHtml(){
    if(!cur.others.length) return '';
    return '<section class="lg-sec" aria-labelledby="lg-o-title"><h3 id="lg-o-title">같은 연락처의 다른 예약 <span class="muted">'+cur.others.length+'건</span></h3><ul class="lg-others">'
      +cur.others.map(function(x){ return '<li><button type="button" class="lg-link" data-open="'+esc(x.code)+'">'+esc(kd(x.date))+' · '+esc(x.space)+' · '+esc(x.code)+'</button> <span class="lg-st lg-st-'+esc(x.status||'')+'">'+esc(x.status_label||'')+'</span> <span class="small muted">받을 돈 '+(x.billed==null?'미정':won(x.billed))+' · 받은 돈 '+won(x.received)+'</span></li>'; }).join('')+'</ul></section>';
  }
  var ACT={create:'기록',edit:'고침',void:'취소',meta:'기준·메모 변경'};
  function historyHtml(){
    if(!cur.history.length) return '';
    return '<section class="lg-sec"><details><summary><h3>변경 이력 <span class="muted">'+cur.history.length+'건</span></h3></summary><ol class="lg-hist">'
      +cur.history.map(function(h){ var a=h.after||{}, b=h.before||{}, o=cur.options;
        var what=h.action==='meta'?('받을 돈 기준 '+(a.base_override!=null?won(a.base_override):'예약 금액')+(a.checked_at?' · 옮기기 확인':'')):((o.kinds[a.kind]||'')+' '+won(a.amount)+(a.method?' · '+(a.method==='other'?'기타 '+(a.method_note||''):o.methods[a.method]):'')+(h.action==='edit'&&(b.amount!==a.amount||b.method!==a.method||b.paid_on!==a.paid_on)?' (이전: '+won(b.amount)+(b.method?' · '+(o.methods[b.method]||b.method):'')+' · '+md(b.paid_on)+')':''));
        return '<li><b>'+esc(ACT[h.action]||h.action)+'</b> '+esc(what)+(h.reason?' — '+esc(h.reason):'')+' <span class="muted">'+esc(kst(h.at))+(h.recorded_by?' · '+esc(h.recorded_by):'')+'</span></li>'; }).join('')+'</ol></details></section>';
  }
  function readForm(){
    var f=form, g=function(n){ var el=D.querySelector('#lg-f [data-f='+n+']'); return el?el.value:''; };
    f.paid_on=g('paid_on'); f.amount=num(g('amount')); f.method_note=g('method_note'); f.item=g('item')||f.item; f.payer=g('payer'); f.proof=g('proof'); f.ref_no=g('ref_no'); f.memo=g('memo');
    var bv=g('by'); setBy(bv.trim()); return f;
  }
  function bindForm(){
    var amt=D.querySelector('#lg-f [data-f=amount]');
    if(amt) amt.addEventListener('input',function(){ var n=num(amt.value); amt.value=isNaN(n)?'':n.toLocaleString('ko-KR'); });
    D.querySelectorAll('[data-m=base]').forEach(function(el){ el.addEventListener('input',function(){ var n=num(el.value); el.value=isNaN(n)?'':n.toLocaleString('ko-KR'); }); });
  }
  function save(){
    var f=readForm(), btn=D.querySelector('[data-do=save]');
    if(!(f.amount>0)){ M.toast('금액을 적어 주세요.'); return; }
    if(MONEY.indexOf(f.kind)>=0&&!f.method){ M.toast('수납방법을 골라 주세요.'); return; }
    var body={kind:f.kind,amount:f.amount,paid_on:f.paid_on,method:f.method,method_note:f.method_note,item:f.item,payer:f.payer,proof:f.proof,ref_no:f.ref_no,memo:f.memo,recorded_by:by()};
    btn.disabled=true;
    var p=edit?X.A('/ledger/'+encodeURIComponent(cur.booking.code)+'/entries/'+edit.id,{method:'POST',body:Object.assign(body,{action:'edit',version:edit.version,reason:(D.querySelector('#lg-f [data-f=reason]')||{}).value||''})})
      :X.A('/ledger/'+encodeURIComponent(cur.booking.code)+'/entries',{method:'POST',body:Object.assign(body,{request_id:f.request_id,source_ref:f.source_ref||''})});
    p.then(function(){ M.toast(edit?'고친 내용을 저장했습니다.':'장부에 저장했습니다.'); edit=null; form=null; return reopen(); }).catch(function(e){ btn.disabled=false; try{ fail(e); }catch(x){} });
  }
  function voidEntry(){
    var reason=(D.querySelector('#lg-f [data-f=void_reason]')||{}).value||'', btn=D.querySelector('[data-do=void]');
    if(!reason.trim()){ M.toast('취소 사유를 적어 주세요.'); return; }
    btn.disabled=true;
    X.A('/ledger/'+encodeURIComponent(cur.booking.code)+'/entries/'+edit.id,{method:'POST',body:{action:'void',version:edit.version,reason:reason,recorded_by:by()}})
      .then(function(){ M.toast('기록을 취소했습니다. 줄이 그어진 채 남습니다.'); edit=null; form=null; return reopen(); }).catch(function(e){ btn.disabled=false; try{ fail(e); }catch(x){} });
  }
  function saveMeta(body, msg){
    return X.A('/ledger/'+encodeURIComponent(cur.booking.code)+'/meta',{method:'POST',body:Object.assign(body,{recorded_by:by()})}).then(function(){ M.toast(msg); return reopen(); }).catch(function(e){ try{ fail(e); }catch(x){} return reopen(); });
  }
  D.addEventListener('click',function(e){
    var t=e.target;
    if(t.closest('[data-close]')){ D.close(); return; }
    var o=t.closest('[data-open]'); if(o){ form=null; open(o.dataset.open); return; }
    var r=t.closest('[data-ref]'); if(r){ var x=cur.system.references.filter(function(i){ return i.source===r.dataset.ref; })[0]; if(!x) return; edit=null;
      form={kind:x.kind,paid_on:x.date||cur.today,amount:x.amount,method:x.method||'',method_note:'',item:'rental',payer:'',proof:x.method==='payapp'?'card':'',ref_no:x.ref_no||'',memo:x.label+(x.note?' · '+x.note:''),source_ref:x.source,source_label:x.group+' · '+x.label+' '+won(x.amount),request_id:rid()};
      render(); focusForm(); return; }
    var ed=t.closest('[data-edit]'); if(ed){ var en=cur.entries.filter(function(i){ return String(i.id)===ed.dataset.edit; })[0]; if(!en) return; edit=en;
      form={kind:en.kind,paid_on:en.paid_on,amount:en.amount,method:en.method,method_note:en.method_note,item:en.item,payer:en.payer,proof:en.proof,ref_no:en.ref_no,memo:en.memo,source_ref:'',request_id:rid()}; render(); focusForm(); return; }
    var d=t.closest('[data-do]'); if(!d) return;
    var w=d.dataset.do;
    if(w==='save') save();
    else if(w==='reset'||w==='cancel-edit'){ edit=null; form=null; render(); focusForm(); }
    else if(w==='fill'){ var a=D.querySelector('#lg-f [data-f=amount]'); a.value=Number(cur.ledger.balance).toLocaleString('ko-KR'); }
    else if(w==='void-open'){ var vb=D.querySelector('.lg-void'); vb.hidden=!vb.hidden; if(!vb.hidden) vb.querySelector('input').focus(); }
    else if(w==='void') voidEntry();
    else if(w==='toggle-void'){ showVoid=!showVoid; readForm(); render(); }
    else if(w==='meta'){ var bv=D.querySelector('[data-m=base]').value.trim(), body={memo:D.querySelector('[data-m=memo]').value};
      body.base_override=bv?num(bv):null; body.base_reason=D.querySelector('[data-m=reason]').value; saveMeta(body,'받을 돈 기준과 메모를 저장했습니다.'); }
  });
  D.addEventListener('change',function(e){
    var t=e.target;
    if(t.name==='lg-kind'){ readForm(); var k=t.value; form.kind=k; if(k.indexOf('deposit')===0) form.item='deposit'; else if(form.item==='deposit') form.item=k==='charge'?'extra':'rental'; if(MONEY.indexOf(k)<0) form.method=''; render(); focusForm(); }
    else if(t.name==='lg-method'){ form.method=t.value; D.querySelectorAll('.lg-methods .lg-seg').forEach(function(l){ l.classList.toggle('on',l.querySelector('input').checked); }); var on=D.querySelector('#lg-f [data-f=method_note]'); if(on){ on.hidden=t.value!=='other'; if(!on.hidden) on.focus(); } }
    else if(t.dataset.do==='checked') saveMeta({checked:t.checked}, t.checked?'기존 결제 기록 옮기기를 확인 완료로 표시했습니다.':'확인 완료 표시를 풀었습니다.');
  });
  D.addEventListener('close',function(){ cur=null; edit=null; form=null; });

  // ---------- 화면 이벤트 ----------
  V.addEventListener('click',function(e){
    var m=e.target.closest('[data-mode]'); if(m){ mode=m.dataset.mode; V.querySelectorAll('[data-mode]').forEach(function(b){ b.classList.toggle('on',b===m); }); q('#lg-book').hidden=mode!=='book'; q('#lg-journal').hidden=mode!=='journal'; if(mode==='journal'){ jfill(); if(!jdata) jload(); } return; }
    var tl=e.target.closest('[data-tile]'); if(tl){ var k=tl.dataset.tile; if(k==='month'){ V.querySelector('[data-mode=journal]').click(); return; } tab=k; draw(); return; }
    var t=e.target.closest('[data-tab]'); if(t){ tab=t.dataset.tab; draw(); return; }
    var o=e.target.closest('[data-open]'); if(o){ form=null; open(o.dataset.open, !!o.dataset.add); return; }
    var jq=e.target.closest('[data-jq]'); if(jq){ var td=today(), k2=jq.dataset.jq;
      if(k2==='today'){ q('#lj-from').value=td; q('#lj-to').value=td; } else if(k2==='week'){ q('#lj-from').value=shift(td,-6); q('#lj-to').value=td; }
      else if(k2==='month'){ q('#lj-from').value=td.slice(0,7)+'-01'; q('#lj-to').value=td; } else { var pm=prevMonth(td.slice(0,7)); q('#lj-from').value=pm+'-01'; q('#lj-to').value=monthEnd(pm); }
      jload(); }
  });
  V.addEventListener('keydown',function(e){ if(e.key==='Enter'){ var r=e.target.closest('tr[data-open]'); if(r){ form=null; open(r.dataset.open); } } });
  q('#lg-q').addEventListener('input',function(){ if(data) draw(); });
  q('#lg-space').addEventListener('change',function(){ if(data) draw(); });
  q('#lg-period').addEventListener('change',function(){ var v=this.value, td=today(), ym=td.slice(0,7);
    q('#lg-range').hidden=v!=='custom';
    if(v==='custom') return;
    if(v==='') range={from:'',to:''}; else if(v==='this') range={from:ym+'-01',to:monthEnd(ym)}; else if(v==='prev'){ var p=prevMonth(ym); range={from:p+'-01',to:monthEnd(p)}; } else { var n=nextMonth(ym); range={from:n+'-01',to:monthEnd(n)}; }
    if(v) tab='all'; load(); });
  q('#lg-range-go').addEventListener('click',function(){ var f=q('#lg-from').value, t=q('#lg-to').value; if(!f||!t){ M.toast('시작일과 끝일을 골라 주세요.'); return; } range={from:f,to:t}; tab='all'; load(); });
  q('#lg-refresh').addEventListener('click',function(){ if(mode==='journal') jload(); else load(); });
  q('#lj-go').addEventListener('click',jload);
  q('#lj-csv').addEventListener('click',csv);
  // 다른 화면(수납 관리 등)에서 [수납 장부] 버튼으로 바로 엽니다
  document.addEventListener('click',function(e){ var b=e.target.closest('[data-ledger-code]'); if(!b||V.contains(b)) return; form=null; open(b.dataset.ledgerCode, b.dataset.ledgerAdd==='1'); });
  window.MEGASPOT_LEDGER={open:open};
  X.register('ledger',function(){ if(mode==='journal'){ jfill(); jload(); } else load(); });
  setTimeout(function(){ if(X.visible&&!X.visible()) return; if(loadedOnce) return; X.A('/ledger').then(function(r){ if(!loadedOnce) navCount(r.counts.todo||0); }).catch(function(){}); },4000);
})();
