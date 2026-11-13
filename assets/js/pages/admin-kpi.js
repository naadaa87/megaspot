/* 관리자 · KPI 지표 (본사 관리자용)
   매출(이용일·결제일 기준) · 예약률(24시간 × 일수) · 이용 인원 · 취소율 · 대기 신청 → 확정 · 부가서비스 이용률 · 홈페이지 방문 · 입점 플랫폼.
   이 파일이 화면(section#view-kpi)을 만들고 /api/admin/kpi 만 읽습니다. 다른 관리자 화면과 API는 건드리지 않습니다.
   메뉴 버튼은 admin-navigation.js 에서 '오늘 할 일' 바로 아래에 붙입니다. */
(function(){
  'use strict';
  const X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  const main=document.querySelector('.adm-main'); if(!main) return;
  const esc=X.esc;
  const BRANCH={'megaspot-gundae':'건대 1호점','megaspot-gundae-2':'건대 2호점',unassigned:'공통·지점 미지정'};
  const C={a:'#1F53D5',b:'#eb6834',c:'#1baf7a',grid:'#E6E2DB',axis:'#6B7178',soft:'#9ec5f4',muted:'#C9C4BB',empty:'#EEF1F6'};
  const HEAT=['#EEF1F6','#cde2fb','#9ec5f4','#5598e7','#2a78d6','#1c5cab','#104281'];
  const WEEK=['월','화','수','목','금','토','일'];
  const KIND={kakao:'카카오톡',tel:'전화',inquiry:'예약·문의 페이지',external:'다른 사이트',file:'소개서 PDF',sms:'문자',mail:'이메일',internal:'홈페이지 안 이동'};
  const PURPOSE={}; (window.MEGASPOT_PURPOSES||[]).forEach(p=>{PURPOSE[p.id]=p.label;}); PURPOSE['year-end']=PURPOSE['year-end']||'송년회'; PURPOSE.none='목적 미기록';
  const NEEDS={space:'공간 찾기·예약',buffet:'출장뷔페',catering:'케이터링',cocktail:'출장 칵테일',mc:'사회자·강연자 섭외',manager:'현장 매니저',design:'디자인·제작물',etc:'그 밖의 준비'};

  /* ---------- 숫자 표시 ---------- */
  const num=n=>Number(n||0).toLocaleString('ko-KR');
  const won=n=>(n<0?'−':'')+num(Math.abs(n))+'원';
  const pct=v=>v==null?'–':(Math.round(v*10)/10).toLocaleString('ko-KR')+'%';
  function short(n){ const a=Math.abs(n),s=n<0?'−':''; if(a>=1e8) return s+(Math.round(a/1e7)/10)+'억'; if(a>=1e4) return s+num(Math.round(a/1e4))+'만'; return s+num(a); }
  function dur(s){ if(s==null||!isFinite(s)) return '–'; s=Math.round(s); if(s<60) return s+'초'; const m=Math.floor(s/60),r=s%60; return m+'분'+(r?' '+r+'초':''); }
  const md=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
  const mLabel=m=>Number(m.slice(5,7))+'월';
  const mFull=m=>m.slice(0,4)+'년 '+Number(m.slice(5,7))+'월';
  const wd=d=>WEEK[(new Date(d+'T00:00:00Z').getUTCDay()+6)%7];
  const kdate=d=>d.slice(0,4)+'. '+Number(d.slice(5,7))+'. '+Number(d.slice(8,10));
  const share=(a,b)=>b>0?Math.round(a/b*1000)/10:null;
  function periodText(f,t){ if(f.slice(8)==='01'&&t===monthEnd(t.slice(0,7))) return f.slice(0,7)===t.slice(0,7)?mFull(f.slice(0,7)):mFull(f.slice(0,7))+' ~ '+mFull(t.slice(0,7)); return kdate(f)+' ~ '+kdate(t); }
  function monthEnd(m){ const [y,n]=m.split('-').map(Number); return new Date(Date.UTC(y,n,0)).toISOString().slice(0,10); }
  const todayK=()=>new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  const addD=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);

  // 지난 기간 대비. good: 올라가면 좋은 지표(true) / 내려가면 좋은 지표(false) / 판단하지 않음(null)
  function delta(cur,prev,o){
    o=o||{};
    if(cur==null||prev==null) return '<span class="kpi-delta flat">비교할 기록 없음</span>';
    let d,txt;
    if(o.pp){ d=Math.round((cur-prev)*10)/10; txt=Math.abs(d).toLocaleString('ko-KR')+'%p'; }
    else { if(!prev) return cur?'<span class="kpi-delta flat">이전 기간 0</span>':'<span class="kpi-delta flat">변동 없음</span>'; d=Math.round((cur-prev)/Math.abs(prev)*1000)/10; txt=Math.abs(d).toLocaleString('ko-KR')+'%'; }
    if(!d) return '<span class="kpi-delta flat">변동 없음</span>';
    const up=d>0, good=o.good==null?null:(up===o.good);
    return '<span class="kpi-delta '+(good==null?'flat':good?'good':'bad')+'">'+(up?'▲ ':'▼ ')+txt+'</span>';
  }

  /* ---------- 화면 틀 ---------- */
  const view=document.createElement('section'); view.id='view-kpi'; view.className='adm-view kpi-view'; view.hidden=true;
  const JUMP=[['kpi-sum','요약'],['kpi-rev','매출'],['kpi-occ','예약률'],['kpi-ppl','이용 인원'],['kpi-cxl','취소·대기'],['kpi-add','부가서비스'],['kpi-web','홈페이지'],['kpi-plat','입점 플랫폼']];
  view.innerHTML='<header class="adm-head"><div><h1>KPI 지표</h1><p class="small muted">본사 관리자용 경영 지표입니다. 지점과 기간을 고르면 지난 기간과 비교해 보여 드립니다. 각 항목의 ‘계산 기준’에서 숫자를 어떻게 셌는지 확인할 수 있습니다.</p></div>'
    +'<button type="button" class="btn btn-light btn-sm" id="kpi-reload">새로고침</button></header>'
    +'<form class="adm-card kpi-bar" id="kpi-form" novalidate>'
      +'<div class="kpi-seg" role="group" aria-label="기간 단위"><label><input type="radio" name="mode" value="month" checked><span>월별</span></label><label><input type="radio" name="mode" value="range"><span>기간 지정</span></label></div>'
      +'<div class="kpi-month" data-mode="month"><button type="button" class="btn btn-light btn-sm" data-step="-1" aria-label="이전 달">‹</button><label class="sr-only" for="kpi-m">조회 월</label><select class="select" id="kpi-m" name="month"></select><button type="button" class="btn btn-light btn-sm" data-step="1" aria-label="다음 달">›</button></div>'
      +'<div class="kpi-range" data-mode="range" hidden><label>시작일<input class="input" type="date" name="from"></label><span aria-hidden="true">~</span><label>종료일<input class="input" type="date" name="to"></label>'
        +'<div class="kpi-quick" role="group" aria-label="빠른 기간"><button type="button" class="btn btn-light btn-sm" data-days="7">최근 7일</button><button type="button" class="btn btn-light btn-sm" data-days="30">최근 30일</button><button type="button" class="btn btn-light btn-sm" data-days="90">최근 90일</button><button type="button" class="btn btn-light btn-sm" data-year="1">올해</button></div></div>'
      +'<label class="kpi-branch">지점<select class="select" name="space"><option value="">전체 지점</option><option value="megaspot-gundae">건대 1호점</option><option value="megaspot-gundae-2">건대 2호점</option></select></label>'
      +'<button class="btn btn-primary btn-sm" type="submit">조회</button>'
    +'</form>'
    +'<p class="small muted kpi-status" id="kpi-status" role="status"></p>'
    +'<nav class="kpi-jump" aria-label="KPI 항목 바로가기">'+JUMP.map(j=>'<a href="#'+j[0]+'" data-jump="'+j[0]+'">'+j[1]+'</a>').join('')+'</nav>'
    +'<div id="kpi-body" class="kpi-body"></div>'
    +'<div class="kpi-tip" id="kpi-tip" role="tooltip" hidden></div>';
  main.appendChild(view);
  const $=s=>view.querySelector(s), form=$('#kpi-form'), body=$('#kpi-body'), status=$('#kpi-status'), tip=$('#kpi-tip');

  // 관리자 화면을 연 브라우저의 방문은 홈페이지 통계에서 뺍니다 (화면 아래에서 바꿀 수 있음).
  const STAT='ms_stat';
  function statPref(){ try{ const v=JSON.parse(localStorage.getItem(STAT)||'{}'); return v&&typeof v==='object'?v:{}; }catch(e){ return {}; } }
  function statSave(v){ try{ localStorage.setItem(STAT,JSON.stringify(v)); }catch(e){} }
  (function(){ const p=statPref(); if(!p.admin_set){ p.off=1; p.admin_set=1; statSave(p); } })();

  /* ---------- 조회 조건 ---------- */
  (function months(){
    const t=todayK(), [y,m]=t.slice(0,7).split('-').map(Number), list=[];
    for(let i=3;i>=-36;i--){ const d=new Date(Date.UTC(y,m-1+i,1)).toISOString().slice(0,7); list.push(d); }
    form.elements.month.innerHTML=list.map(v=>'<option value="'+v+'"'+(v===t.slice(0,7)?' selected':'')+'>'+mFull(v)+'</option>').join('');
    form.elements.to.value=t; form.elements.from.value=addD(t,-29);
  })();
  function mode(){ return form.elements.mode.value; }
  function syncMode(){ view.querySelectorAll('[data-mode]').forEach(el=>{el.hidden=el.dataset.mode!==mode();}); }
  form.addEventListener('change',e=>{ if(e.target.name==='mode') syncMode(); if(e.target.name==='month'||e.target.name==='space') load(); });
  form.addEventListener('click',e=>{
    const s=e.target.closest('[data-step]'), q=e.target.closest('[data-days],[data-year]');
    if(s){ const sel=form.elements.month, i=sel.selectedIndex-Number(s.dataset.step); if(i>=0&&i<sel.options.length){ sel.selectedIndex=i; load(); } }
    if(q){ const t=todayK(); form.elements.to.value=t; form.elements.from.value=q.dataset.year?t.slice(0,4)+'-01-01':addD(t,1-Number(q.dataset.days)); load(); }
  });
  form.addEventListener('submit',e=>{ e.preventDefault(); load(); });
  $('#kpi-reload').addEventListener('click',()=>load());
  view.querySelector('.kpi-jump').addEventListener('click',e=>{ const a=e.target.closest('[data-jump]'); if(!a) return; e.preventDefault(); const t=document.getElementById(a.dataset.jump); if(t){ t.scrollIntoView({behavior:'smooth',block:'start'}); const h=t.querySelector('h2'); if(h){ h.tabIndex=-1; h.focus({preventScroll:true}); } } });
  function params(){
    const q=new URLSearchParams();
    if(mode()==='month'){ const m=form.elements.month.value; q.set('from',m+'-01'); q.set('to',monthEnd(m)); }
    else { const f=form.elements.from.value,t=form.elements.to.value; if(!f||!t||f>t) return null; q.set('from',f); q.set('to',t); }
    if(form.elements.space.value) q.set('space',form.elements.space.value);
    return q;
  }

  /* ---------- 차트 (SVG · 마우스를 올리면 값 표시) ---------- */
  const charts=[];
  function niceStep(x){ const p=Math.pow(10,Math.floor(Math.log10(x))),n=x/p; return (n<=1?1:n<=2?2:n<=5?5:10)*p; }
  function scale(vals,fixedMax){
    let mx=Math.max(0,...vals),mn=Math.min(0,...vals); if(fixedMax!=null) mx=Math.max(mx,fixedMax);
    const step=niceStep((mx-mn)/4||1); let top=Math.ceil(mx/step)*step,bot=Math.floor(mn/step)*step; if(top===bot) top=bot+step;
    if(fixedMax!=null&&mx<=fixedMax) top=fixedMax;
    const t=[]; for(let v=bot;v<=top+step/2;v+=step) t.push(Math.round(v*1000)/1000); return {min:bot,max:top,ticks:t};
  }
  function chart(id,spec){ charts.push({id,spec}); return '<div class="kpi-chart" id="'+id+'" role="img" aria-label="'+esc(spec.aria||'')+'"></div>'; }
  function legend(series){ return series.length<2?'':'<div class="kpi-legend">'+series.map(s=>'<span><i style="background:'+s.color+'"></i>'+esc(s.label)+'</span>').join('')+'</div>'; }
  function drawAll(){ charts.forEach(c=>{ const el=document.getElementById(c.id); if(el) draw(el,c.spec); }); }
  function draw(el,s){
    const W=Math.max(280,el.clientWidth||600),H=s.height||210,fmt=s.fmt||num,axis=s.axis||short;
    const vals=s.series.flatMap(x=>x.values.filter(v=>v!=null));
    const sc=scale(vals.length?vals:[0],s.max);
    const padL=Math.max(...sc.ticks.map(t=>axis(t).length))*7+14,padR=10,padT=10,padB=24,iw=W-padL-padR,ih=H-padT-padB,n=s.cats.length;
    const y=v=>padT+(sc.max-v)/(sc.max-sc.min)*ih, gw=iw/n;
    let g='';
    sc.ticks.forEach(t=>{ g+='<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="'+(t===0?'#B9B3AA':C.grid)+'" stroke-width="1"/><text x="'+(padL-6)+'" y="'+(y(t)+4)+'" text-anchor="end" class="kpi-ax">'+esc(axis(t))+'</text>'; });
    const every=Math.ceil(n/(W<520?8:14));
    s.cats.forEach((c,i)=>{ if(i%every===0) g+='<text x="'+(padL+gw*i+gw/2)+'" y="'+(H-6)+'" text-anchor="middle" class="kpi-ax">'+esc(c)+'</text>'; });
    if(s.type==='line'){
      s.series.forEach(se=>{
        let d='',open=false; se.values.forEach((v,i)=>{ if(v==null){ open=false; return; } const px=padL+gw*i+gw/2; d+=(open?'L':'M')+px.toFixed(1)+' '+y(v).toFixed(1); open=true; });
        g+='<path d="'+d+'" fill="none" stroke="'+se.color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
        if(n<=40) se.values.forEach((v,i)=>{ if(v!=null) g+='<circle cx="'+(padL+gw*i+gw/2)+'" cy="'+y(v)+'" r="3.5" fill="'+se.color+'" stroke="#fff" stroke-width="2"/>'; });
      });
    } else {
      const k=s.series.length,bw=Math.max(2,Math.min(26,(gw*0.72-(k-1)*2)/k));
      s.series.forEach((se,j)=>se.values.forEach((v,i)=>{ if(!v) return; const x=padL+gw*i+(gw-(bw*k+(k-1)*2))/2+j*(bw+2),y0=y(0),y1=y(v); g+='<rect x="'+x.toFixed(1)+'" y="'+Math.min(y0,y1).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(1,Math.abs(y1-y0)).toFixed(1)+'" rx="2" fill="'+se.color+'"/>'; }));
    }
    s.cats.forEach((c,i)=>{ const t=(s.full?s.full[i]:c)+'\n'+s.series.map(se=>(s.series.length>1?se.label+': ':'')+(se.values[i]==null?'기록 없음':fmt(se.values[i]))).join('\n'); g+='<rect class="kpi-hit" x="'+(padL+gw*i)+'" y="'+padT+'" width="'+gw+'" height="'+ih+'" data-tip="'+esc(t)+'"/>'; });
    el.innerHTML='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'+g+'</svg>';
  }
  let rz=0; window.addEventListener('resize',()=>{ clearTimeout(rz); rz=setTimeout(()=>{ if(!view.hidden) drawAll(); },150); });
  // 값 풍선
  view.addEventListener('pointermove',e=>{ const t=e.target.closest('[data-tip]'); if(!t){ tip.hidden=true; return; } tip.innerHTML=esc(t.getAttribute('data-tip')).replace(/\n/g,'<br>'); tip.hidden=false; const r=tip.getBoundingClientRect(); let x=e.clientX+14,yy=e.clientY+14; if(x+r.width>innerWidth-8) x=e.clientX-r.width-14; if(yy+r.height>innerHeight-8) yy=e.clientY-r.height-14; tip.style.left=x+'px'; tip.style.top=yy+'px'; });
  view.addEventListener('pointerleave',()=>{ tip.hidden=true; });
  view.addEventListener('focusin',e=>{ const t=e.target.closest('[data-tip]'); if(!t) return; tip.innerHTML=esc(t.getAttribute('data-tip')).replace(/\n/g,'<br>'); tip.hidden=false; const r=t.getBoundingClientRect(); tip.style.left=Math.min(innerWidth-240,r.left)+'px'; tip.style.top=(r.bottom+6)+'px'; });
  view.addEventListener('focusout',()=>{ tip.hidden=true; });

  /* ---------- 조각 ---------- */
  const card=(title,inner,o)=>'<div class="adm-card kpi-card'+(o&&o.wide?' kpi-wide':'')+'"><h3>'+title+(o&&o.sub?' <small>'+o.sub+'</small>':'')+'</h3>'+inner+'</div>';
  function tile(label,value,sub,d,o){ return '<div class="kpi-tile'+(o&&o.main?' kpi-tile-main':'')+'"><span class="kpi-tile-label">'+label+'</span><b class="kpi-tile-value">'+value+'</b>'+(d?'<span class="kpi-tile-delta">'+d+'</span>':'')+(sub?'<span class="kpi-tile-sub">'+sub+'</span>':'')+'</div>'; }
  function section(id,title,lead,inner,help){ return '<section class="kpi-sec" id="'+id+'" aria-labelledby="'+id+'-h"><div class="kpi-sec-head"><h2 id="'+id+'-h">'+title+'</h2>'+(lead?'<p class="small muted">'+lead+'</p>':'')+'</div>'+inner+(help?'<details class="kpi-help"><summary>계산 기준</summary><ul>'+help.map(h=>'<li>'+h+'</li>').join('')+'</ul></details>':'')+'</section>'; }
  function hbars(rows,o){
    o=o||{}; const max=Math.max(1,...rows.map(r=>(r.value||0)+(r.extra||0)),o.max||0);
    if(!rows.length) return '<p class="small muted">기록이 없습니다.</p>';
    return '<div class="kpi-hbars">'+rows.map(r=>{ const w=(r.value||0)/max*100,w2=(r.extra||0)/max*100; return '<div class="kpi-hbar" data-tip="'+esc(r.tip||r.label+': '+r.text)+'"><span class="kpi-hbar-label">'+esc(r.label)+'</span><span class="kpi-hbar-track"><i style="width:'+w.toFixed(2)+'%;background:'+(r.color||C.a)+'"></i>'+(w2?'<i class="kpi-hbar-extra" style="width:'+w2.toFixed(2)+'%"></i>':'')+'</span><span class="kpi-hbar-val">'+r.text+'</span></div>'; }).join('')+'</div>';
  }
  function stack(parts,total){
    if(!total) return '<p class="small muted">기록이 없습니다.</p>';
    return '<div class="kpi-stack" role="img" aria-label="'+esc(parts.map(p=>p.label+' '+p.n+'건').join(', '))+'">'+parts.filter(p=>p.n).map(p=>'<i style="flex:'+p.n+';background:'+p.color+'" data-tip="'+esc(p.label+': '+num(p.n)+'건 ('+pct(share(p.n,total))+')')+'"></i>').join('')+'</div>'
      +'<div class="kpi-legend">'+parts.map(p=>'<span><i style="background:'+p.color+'"></i>'+esc(p.label)+' <b>'+num(p.n)+'</b></span>').join('')+'</div>';
  }
  function table(head,rows,numFrom){ return '<div class="kpi-table"><table><thead><tr>'+head.map((h,i)=>'<th scope="col"'+(i>=numFrom?' class="n"':'')+'>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map((c,i)=>i===0?'<th scope="row">'+c+'</th>':'<td'+(i>=numFrom?' class="n"':'')+'>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'; }
  const asTable=(head,rows,numFrom)=>'<details class="kpi-astable"><summary>표로 보기</summary>'+table(head,rows,numFrom)+'</details>';
  function heatColor(v){ if(v==null) return '#F7F5F1'; if(v<=0) return HEAT[0]; if(v<=10) return HEAT[1]; if(v<=25) return HEAT[2]; if(v<=40) return HEAT[3]; if(v<=60) return HEAT[4]; if(v<=80) return HEAT[5]; return HEAT[6]; }
  const heatLegend='<div class="kpi-legend kpi-heat-legend"><span>낮음</span>'+HEAT.map(c=>'<i style="background:'+c+'"></i>').join('')+'<span>높음</span><span class="muted">(0% · ~10 · ~25 · ~40 · ~60 · ~80 · 80% 넘음)</span></div>';

  /* ---------- 그리기 ---------- */
  let last=null, version=0, loadedAt=0;
  function render(r){
    charts.length=0;
    const R=r.revenue,O=r.occupancy,P=r.people,X2=r.cancel,Wt=r.wait,F=r.funnel,A=r.addons,Wb=r.web,PL=r.platform;
    const months=r.months, mCats=months.map(mLabel), mFulls=months.map(mFull);
    const dayList=R.daily.map(d=>d.d), long=dayList.length>62;
    const sp=r.space, spaceName=sp?BRANCH[sp]:'전체 지점';
    let h='';

    // 요약
    const wc=Wb&&Wb.cur||{};
    h+=section('kpi-sum','한눈에 보기',esc(spaceName)+' · '+esc(periodText(r.from,r.to))+' · 비교: '+esc(periodText(r.prev.from,r.prev.to))+(r.ongoing&&r.elapsed.to!==r.prev.to?'<br><b>진행 중인 기간</b>입니다. 결제일 기준 매출·문의·홈페이지 방문은 오늘('+md(r.today)+')까지 쌓인 기록이라 지난 기간도 같은 시점('+esc(periodText(r.elapsed.from,r.elapsed.to))+')까지와 비교합니다.':''),
      '<div class="kpi-tiles">'
      +tile('순매출 · 이용일 기준',won(R.event.net),'수납 '+won(R.event.received)+' · 환불 '+won(R.event.refunded),delta(R.event.net,R.prev_event.net,{good:true}),{main:true})
      +tile('순매출 · 결제일 기준',won(R.paid.net),'수납 '+won(R.paid.received)+' · 환불 '+won(R.paid.refunded),delta(R.paid.net,R.prev_paid.net,{good:true}),{main:true})
      +tile('예약률 (24시간 기준)',pct(O.cur.rate),num(O.cur.booked)+'시간 예약 · 운영 '+num(O.cur.capacity)+'시간',delta(O.cur.rate,O.prev.rate,{pp:true,good:true}))
      +tile('이용 인원',num(P.cur.people)+'명','확정 예약 '+num(P.cur.bookings)+'건'+(P.cur.avg?' · 평균 '+num(P.cur.avg)+'명':''),delta(P.cur.people,P.prev.people,{good:true}))
      +tile('취소율',pct(X2.cur.rate),'취소 '+num(X2.cur.cancelled)+'건 / 전체 '+num(X2.cur.total)+'건',delta(X2.cur.rate,X2.prev.rate,{pp:true,good:false}))
      +tile('대기 신청 → 확정',pct(Wt.cur.rate),'신청 '+num(Wt.cur.total)+'건 중 확정 '+num(Wt.cur.confirmed)+'건',delta(Wt.cur.rate,Wt.prev.rate,{pp:true,good:true}))
      +tile('홈페이지 방문자',Wb&&Wb.since?num(wc.uv)+'명':'집계 전',Wb&&Wb.since?'방문 '+num(wc.sessions)+'회 · 페이지뷰 '+num(wc.pv):'통계 수집을 막 시작했습니다',Wb&&Wb.since?delta(wc.uv,Wb.prev.uv,{good:true}):'')
      +tile('평균 체류시간',Wb&&Wb.since?dur(wc.avg_dur):'집계 전',Wb&&Wb.since?'방문 1회 기준 · 이탈률 '+pct(wc.bounce_rate):'',Wb&&Wb.since?delta(wc.avg_dur,Wb.prev.avg_dur,{good:true}):'')
      +'</div>');

    // 매출
    const revRows=[...Object.keys(R.branches)].map(k=>{ const b=R.branches[k]; return [esc(BRANCH[k]||k),won(b.event.received),won(b.event.refunded),'<b>'+won(b.event.net)+'</b>',won(b.paid.net)]; });
    // 결제일 기준은 오늘 이후 날짜가 아직 없으므로 선을 그리지 않습니다.
    let dCats=R.daily.map(d=>md(d.d)), dFull=R.daily.map(d=>kdate(d.d)+' ('+wd(d.d)+')'), dEvent=R.daily.map(d=>d.event), dPaid=R.daily.map(d=>d.d>r.today?null:d.paid), dTitle='일별 순매출';
    if(long){ const wk=[]; R.daily.forEach((d,i)=>{ const k=Math.floor(i/7); if(!wk[k]) wk[k]={from:d.d,to:d.d,event:0,paid:0}; wk[k].to=d.d; wk[k].event+=d.event; wk[k].paid+=d.paid; }); dCats=wk.map(w=>md(w.from)); dFull=wk.map(w=>kdate(w.from)+' ~ '+kdate(w.to)); dEvent=wk.map(w=>w.event); dPaid=wk.map(w=>w.from>r.today?null:w.paid); dTitle='주별 순매출'; }
    const revSeries=[{label:'이용일 기준',color:C.a},{label:'결제일 기준',color:C.b}];
    h+=section('kpi-rev','매출','직영 공간의 이용료·옵션 결제와 수기 수납에서 환불을 뺀 금액입니다. 보증금은 넣지 않습니다.',
      '<div class="kpi-grid2">'
      +card('월별 순매출',legend(revSeries)+chart('kpi-c-rev-m',{type:'bar',cats:mCats,full:mFulls,fmt:won,aria:'최근 12개월 월별 순매출',series:[{label:'이용일 기준',color:C.a,values:R.monthly.map(m=>m.event)},{label:'결제일 기준',color:C.b,values:R.monthly.map(m=>m.paid)}]})
        +asTable(['월','이용일 기준','결제일 기준'],R.monthly.map(m=>[mFull(m.m),won(m.event),won(m.paid)]),1),{sub:'최근 12개월'})
      +card(dTitle,legend(revSeries)+chart('kpi-c-rev-d',{type:'line',cats:dCats,full:dFull,fmt:won,aria:'조회 기간 '+dTitle,series:[{label:'이용일 기준',color:C.a,values:dEvent},{label:'결제일 기준',color:C.b,values:dPaid}]})
        +asTable(['날짜','이용일 기준','결제일 기준'],dCats.map((c,i)=>[dFull[i],won(dEvent[i]),won(dPaid[i])]),1),{sub:'조회 기간'})
      +'</div>'
      +card('지점별 매출',table(['지점','수납 (이용일)','환불 (이용일)','순매출 (이용일)','순매출 (결제일)'],revRows,1)
        +'<p class="small muted mt-2">조회 기간 이용일 기준 · 온라인 결제 '+won(R.source.online||0)+' · 수기 수납·환불 '+won(R.source.manual||0)+(PL&&!sp?' · 입점 이용료 순수납 '+won(PL.billing.net)+'(별도, 아래 입점 플랫폼 참고)':'')+'</p>',{wide:true}),
      ['<b>이용일 기준</b>: 예약 이용일이 조회 기간에 들어가는 수납·환불을 모읍니다. ‘매출 현황’ 메뉴와 같은 기록·같은 계산입니다.',
       '<b>결제일 기준</b>: 실제로 돈이 들어오거나 나간 날(한국 시각)로 모읍니다. 미리 받은 이용료는 결제한 달에 잡힙니다.',
       '순매출 = 수납액 − 환불액. 보증금, 테스트 결제, 결제 확인용 1,000원 결제는 넣지 않습니다. 주차권처럼 지점이 없는 결제는 ‘공통·지점 미지정’으로 모입니다.',
       '지난 기간 대비: 월별로 보면 바로 앞 달, 기간을 지정하면 바로 앞의 같은 일수와 비교합니다.']);

    // 예약률
    const spTiles=Object.keys(O.spaces).map(k=>tile(esc(BRANCH[k]||k),pct(O.spaces[k].rate),num(O.spaces[k].booked)+'시간 / '+num(O.spaces[k].capacity)+'시간'+(r.opening&&r.opening[k]&&r.opening[k]>r.from?' · '+md(r.opening[k])+' 오픈':''))).join('');
    let gridHtml='';
    if(O.grid){
      const nOpen=Object.keys(O.spaces).length;
      gridHtml='<p class="kpi-scroll-hint">좌우로 밀면 24시간 전체를 볼 수 있습니다.</p><div class="kpi-heat-wrap"><div class="kpi-heat kpi-heat-day" style="--cols:24"><span class="kpi-heat-corner">날짜 \\ 시</span>'+Array.from({length:24},(_,i)=>'<span class="kpi-heat-hd">'+(i%3===0?i:'')+'</span>').join('')
        +O.grid.map(g=>'<span class="kpi-heat-row'+(['토','일'].includes(wd(g.d))?' we':'')+'">'+md(g.d)+' '+wd(g.d)+'</span>'+g.h.map((v,i)=>{ const f=g.open?v/g.open:null, c=!g.open?'#F7F5F1':v===0?C.empty:f<1?C.soft:C.a; return '<i style="background:'+c+'" data-tip="'+esc(kdate(g.d)+' ('+wd(g.d)+') '+i+'시~'+(i+1)+'시\n'+(!g.open?'오픈 전':v===0?'예약 없음':nOpen>1?'예약 '+v+'곳 / '+g.open+'곳':'예약됨'))+'"></i>'; }).join('')).join('')
        +'</div></div><div class="kpi-legend"><span><i style="background:'+C.empty+'"></i>예약 없음</span>'+(nOpen>1?'<span><i style="background:'+C.soft+'"></i>일부 지점 예약</span><span><i style="background:'+C.a+'"></i>문을 연 지점 모두 예약</span>':'<span><i style="background:'+C.a+'"></i>예약된 시간</span>')+'<span><i style="background:#F7F5F1;border:1px solid #E6E2DB"></i>오픈 전</span></div>';
    }
    const weekHtml='<p class="kpi-scroll-hint">좌우로 밀면 24시간 전체를 볼 수 있습니다.</p><div class="kpi-heat-wrap"><div class="kpi-heat kpi-heat-week" style="--cols:24"><span class="kpi-heat-corner">요일 \\ 시</span>'+Array.from({length:24},(_,i)=>'<span class="kpi-heat-hd">'+(i%3===0?i:'')+'</span>').join('')
      +O.week.map((row,w)=>'<span class="kpi-heat-row'+(w>=5?' we':'')+'">'+WEEK[w]+'요일</span>'+row.map((v,i)=>'<i style="background:'+heatColor(v)+'" data-tip="'+esc(WEEK[w]+'요일 '+i+'시~'+(i+1)+'시 · 예약률 '+pct(v))+'"></i>').join('')).join('')+'</div></div>'+heatLegend;
    h+=section('kpi-occ','예약률','하루 24시간 × 조회 일수 중 확정 예약이 차지한 시간의 비율입니다.',
      '<div class="kpi-tiles">'+tile(esc(spaceName),pct(O.cur.rate),num(O.cur.booked)+'시간 / '+num(O.cur.capacity)+'시간',delta(O.cur.rate,O.prev.rate,{pp:true,good:true}),{main:true})+(Object.keys(O.spaces).length>1?spTiles:'')+'</div>'
      +(O.grid?card('날짜 × 시간 예약 현황',gridHtml,{wide:true,sub:'한 칸 = 1시간'}):'<p class="small muted">조회 기간이 62일을 넘으면 날짜별 칸은 접고, 아래 요일·시간대 표로 보여 드립니다.</p>')
      +'<div class="kpi-grid2">'+card('요일 × 시간대 예약률',weekHtml,{sub:'조회 기간 평균'})
      +card('시간대별 예약률',chart('kpi-c-occ-h',{type:'bar',cats:Array.from({length:24},(_,i)=>String(i)),full:Array.from({length:24},(_,i)=>i+'시~'+(i+1)+'시'),fmt:pct,axis:v=>v+'%',max:10,aria:'시간대별 예약률',series:[{label:'예약률',color:C.a,values:O.hours}]}),{sub:'0시~23시'})+'</div>'
      +card('월별 예약률',chart('kpi-c-occ-m',{type:'line',cats:mCats,full:mFulls,fmt:pct,axis:v=>v+'%',max:10,aria:'최근 12개월 월별 예약률',series:[{label:'예약률',color:C.a,values:O.monthly.map(m=>m.capacity?m.rate:null)}]})
        +asTable(['월','예약률','예약 시간','운영 시간'],O.monthly.map(m=>[mFull(m.m),pct(m.rate),num(m.booked)+'시간',num(m.capacity)+'시간']),1),{wide:true,sub:'최근 12개월'}),
      ['분모 = 지점 수 × 24시간 × 조회 일수. 지점이 문을 연 날(건대 2호점 '+(r.opening&&r.opening['megaspot-gundae-2']?kdate(r.opening['megaspot-gundae-2']):'')+') 이전은 빼고 계산합니다.',
       '분자 = 확정·이용 완료 예약이 잡힌 시간. 같은 시간에 겹친 예약은 한 번만 셉니다. 취소·결제 후 일정 검토 중인 예약은 넣지 않습니다.',
       '밤 12시를 넘기는 이용(예: 18시~다음 날 7시)은 자정 이후 시간을 다음 날에 셉니다.',
       '시작·종료 시각이 없는 예약은 예약 구간(오전·오후·저녁·패키지)의 기본 시간으로 계산합니다.'+(O.no_hours?' 시간을 알 수 없어 빠진 예약: '+num(O.no_hours)+'건':'')]);

    // 이용 인원
    const purposeRows=Object.entries(P.purposes).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,n])=>({label:PURPOSE[k]||k,value:n,text:num(n)+'건'}));
    h+=section('kpi-ppl','이용 인원·예약 건수','확정·이용 완료 예약의 인원(예약에 적힌 인원, 없으면 문의서 인원)을 더했습니다.',
      '<div class="kpi-tiles">'+tile('이용 인원',num(P.cur.people)+'명','',delta(P.cur.people,P.prev.people,{good:true}),{main:true})+tile('확정 예약',num(P.cur.bookings)+'건','',delta(P.cur.bookings,P.prev.bookings,{good:true}))+tile('예약 1건 평균',P.cur.avg?num(P.cur.avg)+'명':'–','',delta(P.cur.avg,P.prev.avg,{good:true}))+tile('인원 미기록',num(P.cur.missing)+'건','평균 계산에서 뺀 예약')+'</div>'
      +'<div class="kpi-grid2">'+card('월별 이용 인원',chart('kpi-c-ppl-m',{type:'bar',cats:mCats,full:mFulls,fmt:v=>num(v)+'명',aria:'최근 12개월 월별 이용 인원',series:[{label:'이용 인원',color:C.a,values:P.monthly.map(m=>m.people)}]}),{sub:'최근 12개월'})
      +card('월별 확정 예약 건수',chart('kpi-c-bk-m',{type:'bar',cats:mCats,full:mFulls,fmt:v=>num(v)+'건',aria:'최근 12개월 월별 확정 예약 건수',series:[{label:'확정 예약',color:C.c,values:P.monthly.map(m=>m.bookings)}]})
        +asTable(['월','확정 예약','이용 인원','평균 인원'],P.monthly.map(m=>[mFull(m.m),num(m.bookings)+'건',num(m.people)+'명',m.avg?num(m.avg)+'명':'–']),1),{sub:'최근 12개월'})+'</div>'
      +'<div class="kpi-grid3">'+card('인원 규모별 예약',hbars(Object.entries(P.sizes).map(([k,n])=>({label:k,value:n,text:num(n)+'건'}))))
      +card('행사 목적별 예약',hbars(purposeRows))
      +card('요일별 예약',hbars(P.weekday.map((n,i)=>({label:WEEK[i]+'요일',value:n,text:num(n)+'건',color:i>=5?C.b:C.a}))))+'</div>'
      +(dayList.length<=62?card('일별 이용 인원',chart('kpi-c-ppl-d',{type:'bar',cats:P.daily.map(d=>md(d.d)),full:P.daily.map(d=>kdate(d.d)+' ('+wd(d.d)+') · 예약 '+d.bookings+'건'),fmt:v=>num(v)+'명',aria:'조회 기간 일별 이용 인원',series:[{label:'이용 인원',color:C.a,values:P.daily.map(d=>d.people)}]}),{wide:true,sub:'조회 기간'}):''),
      ['이용일이 조회 기간에 들어가는 확정·이용 완료 예약만 셉니다. 취소된 예약은 넣지 않습니다.',
       '행사 목적은 고객이 문의서에 고른 값입니다. 관리자가 직접 등록한 예약처럼 문의서가 없으면 ‘목적 미기록’으로 모입니다.']);

    // 취소·대기
    const wcur=Wt.cur;
    h+=section('kpi-cxl','취소율 · 대기 신청 전환','예약이 얼마나 취소됐는지, 날짜를 신청한 고객 중 몇 팀이 확정까지 갔는지 봅니다.',
      '<div class="kpi-tiles">'+tile('취소율',pct(X2.cur.rate),'취소 '+num(X2.cur.cancelled)+'건 / 전체 '+num(X2.cur.total)+'건',delta(X2.cur.rate,X2.prev.rate,{pp:true,good:false}),{main:true})
        +tile('대기 신청 → 확정',pct(wcur.rate),'신청 '+num(wcur.total)+'건 → 확정 '+num(wcur.confirmed)+'건',delta(wcur.rate,Wt.prev.rate,{pp:true,good:true}),{main:true})
        +tile('결과가 난 신청 중 확정',pct(wcur.decided_rate),'아직 대기 중 '+num(wcur.pending)+'건 제외')
        +tile('지금 대기 중',num(Wt.now.waiting)+'건','오늘 이후 '+num(Wt.now.dates)+'개 날짜 · 2팀 이상 겹친 날 '+num(Wt.now.contested)+'일')+'</div>'
      +'<div class="kpi-grid2">'+card('대기 신청 결과',stack([{label:'확정',n:wcur.confirmed,color:C.a},{label:'확정 후 취소',n:wcur.cancelled_after,color:C.b},{label:'아직 대기 중',n:wcur.pending,color:C.c},{label:'대기 취소',n:wcur.wait_cancelled,color:C.muted},{label:'그 밖의 상태',n:wcur.other,color:'#E6E2DB'}],wcur.total)
          +'<p class="small muted mt-2">같은 날짜·지점에 2팀 이상 신청한 날 '+num(wcur.contested_days)+'일</p>',{sub:'이용일 기준'})
        +card('문의 단계',hbars([{label:'문의 접수',value:F.cur.inquiries,text:num(F.cur.inquiries)+'건'},{label:'예약 신청',value:F.cur.reserve,text:num(F.cur.reserve)+'건 ('+pct(share(F.cur.reserve,F.cur.inquiries))+')'},{label:'견적 발송',value:F.cur.quoted,text:num(F.cur.quoted)+'건 ('+pct(share(F.cur.quoted,F.cur.inquiries))+')'},{label:'예약 확정',value:F.cur.confirmed,text:num(F.cur.confirmed)+'건 ('+pct(F.cur.rate)+')'},{label:'이용 완료',value:F.cur.completed,text:num(F.cur.completed)+'건'}].map(x=>Object.assign(x,{color:C.a})))
          +'<p class="small muted mt-2">문의 → 예약 확정 '+pct(F.cur.rate)+' '+delta(F.cur.rate,F.prev.rate,{pp:true,good:true})+'</p>',{sub:'문의 접수일 기준'})+'</div>'
      +'<div class="kpi-grid2">'+card('월별 취소율',chart('kpi-c-cxl-m',{type:'line',cats:mCats,full:mFulls,fmt:pct,axis:v=>v+'%',max:10,aria:'최근 12개월 월별 취소율',series:[{label:'취소율',color:C.b,values:X2.monthly.map(m=>m.total?m.rate:null)}]})
          +asTable(['월','취소율','취소','전체'],X2.monthly.map(m=>[mFull(m.m),pct(m.rate),num(m.cancelled)+'건',num(m.total)+'건']),1),{sub:'최근 12개월'})
        +card('월별 대기 신청 → 확정',chart('kpi-c-wait-m',{type:'line',cats:mCats,full:mFulls,fmt:pct,axis:v=>v+'%',max:10,aria:'최근 12개월 대기 신청 확정률',series:[{label:'확정률',color:C.a,values:Wt.monthly.map(m=>m.total?m.rate:null)}]})
          +asTable(['월','확정률','신청','확정'],Wt.monthly.map(m=>[mFull(m.m),pct(m.rate),num(m.total)+'건',num(m.confirmed)+'건']),1),{sub:'최근 12개월'})+'</div>'
      +card('홈페이지 문의 유입 경로',hbars(Object.entries(F.sources).sort((a,b)=>b[1]-a[1]).map(([k,n])=>({label:F.source_labels[k]||k,value:n,text:num(n)+'건 ('+pct(share(n,F.cur.web))+')'}))),{wide:true,sub:'문의서를 보낸 고객이 처음 들어온 경로'}),
      ['<b>취소율</b> = 이용일이 조회 기간인 예약 중 취소된 예약 ÷ 전체 예약(확정·이용 완료·취소·결제 후 검토). 삭제 보관한 문의에 딸린 취소는 넣지 않습니다.',
       '<b>대기 신청 → 확정</b> = 이용일이 조회 기간인 날짜 신청(제휴 제안 제외, 삭제한 문의 제외) 중 지금 확정·이용 완료 상태인 신청의 비율입니다. 날짜를 신청하면 누구나 그 날짜의 대기 순서에 들어가므로 신청 건수가 곧 대기자 수입니다.',
       '<b>결과가 난 신청 중 확정</b>은 아직 대기 중인 신청을 분모에서 뺀 값입니다. 앞으로 다가올 날짜가 많을수록 두 숫자의 차이가 커집니다.',
       '<b>문의 단계</b>는 문의 접수일 기준입니다. 견적 발송은 견적을 저장했거나 견적 발송 이후 단계로 넘어간 문의, 예약 확정은 예약이 한 번이라도 잡힌 문의(그 뒤 취소 포함)입니다.']);

    // 부가서비스
    const AD=A.cur, adRows=Object.keys(A.labels).map(k=>{ const x=AD.items[k],p=A.prev.items[k]; return {label:A.labels[k],value:x.used,extra:x.asked,text:'<b>'+pct(x.rate)+'</b> · 이용 '+num(x.used)+'건'+(x.asked?' · 요청만 '+num(x.asked)+'건':'')+' · '+delta(x.rate,p.rate,{pp:true,good:true}),tip:A.labels[k]+'\n이용 '+x.used+'건 / 확정 예약 '+AD.base+'건 ('+pct(x.rate)+')'+(x.asked?'\n요청만 하고 확정 전·미포함 '+x.asked+'건':'')}; });
    let platAddon='';
    if(PL&&!sp){
      const order=['buffet','catering','cocktail','mc','design','manager'],lab={buffet:'출장뷔페',catering:'케이터링',cocktail:'출장 칵테일',mc:'사회자·강연자 섭외',design:'디자인·제작물',manager:'현장 매니저'};
      platAddon=card('입점 공간 예약 · 행사 준비 요청에서 들어온 부가서비스',table(['서비스','입점 공간 예약에서 신청','그중 확정·완료','행사 준비 요청에서 맡김'],order.map(k=>{ const a=PL.addons[k]||{asked:0,confirmed:0}; return [esc(lab[k]),num(a.asked)+'건',num(a.confirmed)+'건',num(PL.planning.needs[k==='buffet'?'buffet':k]||0)+'건']; }),1),{wide:true,sub:'접수일 기준 · 지점과 상관없이 전체'});
    }
    h+=section('kpi-add','부가서비스 이용률','직영 공간 확정 예약 '+num(AD.base)+'건 중 각 서비스를 함께 이용한 비율입니다. 연한 막대는 고객이 요청만 하고 아직 견적·확정에 넣지 않은 건입니다.',
      card('서비스별 이용률',hbars(adRows,{max:AD.base})+'<div class="kpi-legend"><span><i style="background:'+C.a+'"></i>이용(확정·견적 포함)</span><span><i style="background:'+C.soft+'"></i>요청만 있음</span></div>',{wide:true,sub:'막대 길이 = 확정 예약 '+num(AD.base)+'건 기준'})
      +card('월별 이용률',table(['월','확정 예약'].concat(Object.values(A.labels)),A.monthly.map(m=>[mFull(m.m),num(m.base)+'건'].concat(Object.keys(A.labels).map(k=>m.base?pct(m[k]):'–'))),1),{wide:true,sub:'최근 12개월'})
      +platAddon,
      ['분모는 이용일이 조회 기간인 확정·이용 완료 예약입니다.',
       '<b>출장뷔페·케이터링·출장 칵테일</b>: 예약 현황의 식음료 상태가 ‘확정’이면 이용, ‘상담 중’이면 요청만으로 셉니다. 출장뷔페는 발주 기록이 있으면 발주 상태를 따릅니다.',
       '<b>현수막·디자인</b>: 견적의 현수막·X배너 옵션, 결제한 현수막·X배너 상품, 견적 추가 항목 이름에 현수막·배너·디자인·포토월 등이 들어간 경우 이용으로 셉니다. 문의서에서만 고른 경우는 요청으로 셉니다.',
       '<b>MC·강사 섭외</b>: 직영 공간은 따로 고르는 칸이 없어서, 견적 추가 항목 이름에 ‘사회자·MC·강사·강연’ 등이 들어간 예약을 셉니다. 섭외를 맡은 예약은 견적 추가 항목에 그렇게 적어 두면 여기 잡힙니다.',
       '<b>현장 매니저</b>: 견적의 현장 매니저 옵션, 결제한 현장 매니저 상품, 문의서 선택(요청)으로 셉니다.']);

    // 홈페이지
    if(!Wb){ h+=section('kpi-web','홈페이지 방문','', '<p class="small muted">방문 통계를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</p>'); }
    else {
      const pref=statPref();
      const optout='<label class="kpi-optout"><input type="checkbox" id="kpi-optout"'+(pref.off?' checked':'')+'> 이 브라우저의 방문은 통계에서 빼기 <span class="muted">(관리자 화면을 연 브라우저는 처음부터 빠져 있습니다)</span></label>';
      if(!Wb.since){
        h+=section('kpi-web','홈페이지 방문','',card('아직 쌓인 방문 기록이 없습니다','<p class="small">방문자 수·체류시간·자주 보는 페이지·링크 클릭 수는 이번 업데이트 이후 들어온 방문부터 모입니다. 하루 정도 지나면 이 자리에 표와 그래프가 나타납니다.</p>'+optout,{wide:true}));
      } else {
        const ck=Wb.clicks,ckp=Wb.clicks_prev,kinds=['kakao','tel','inquiry','external','file','sms','mail'];
        const dev=Wb.devices,devTotal=(dev.mobile||0)+(dev.desktop||0)+(dev.tablet||0);
        const wd2=Wb.daily,dc=long?null:wd2;
        h+=section('kpi-web','홈페이지 방문',(Wb.since>r.from?'<b>'+kdate(Wb.since)+'부터 모은 기록입니다.</b> 그 전 날짜는 비어 있습니다. ':'')+'관리자·호스트센터 화면과 검색 로봇은 넣지 않습니다.',
          '<div class="kpi-tiles">'
          +tile('방문자 (순)',num(wc.uv)+'명','신규 '+num(wc.new_uv)+'명 ('+pct(share(wc.new_uv,wc.uv))+')',delta(wc.uv,Wb.prev.uv,{good:true}),{main:true})
          +tile('방문 수',num(wc.sessions)+'회','방문 1회당 '+(wc.avg_pages||0)+'페이지',delta(wc.sessions,Wb.prev.sessions,{good:true}))
          +tile('페이지뷰',num(wc.pv)+'회','',delta(wc.pv,Wb.prev.pv,{good:true}))
          +tile('평균 체류시간',dur(wc.avg_dur),'방문 1회 기준',delta(wc.avg_dur,Wb.prev.avg_dur,{good:true}))
          +tile('페이지당 머문 시간',dur(wc.page_dwell),'',delta(wc.page_dwell,Wb.prev.page_dwell,{good:true}))
          +tile('이탈률',pct(wc.bounce_rate),'한 페이지만 보고 나간 방문',delta(wc.bounce_rate,Wb.prev.bounce_rate,{pp:true,good:false}))
          +tile('방문 대비 홈페이지 문의',pct(Wb.inquiry_rate),'홈페이지 문의 '+num(F.cur.web)+'건 / 방문 '+num(wc.sessions)+'회')
          +tile('모바일 비율',pct(share(dev.mobile||0,devTotal)),'PC '+pct(share(dev.desktop||0,devTotal))+(dev.tablet?' · 태블릿 '+pct(share(dev.tablet,devTotal)):''))
          +'</div>'
          +'<div class="kpi-grid2">'
          +(dc?card('일별 방문',legend([{label:'방문자',color:C.a},{label:'방문 수',color:C.b}])+chart('kpi-c-web-d',{type:'line',cats:dc.map(d=>md(d.d)),full:dc.map(d=>kdate(d.d)+' ('+wd(d.d)+') · 페이지뷰 '+num(d.pv)),fmt:v=>num(v),aria:'조회 기간 일별 방문자와 방문 수',series:[{label:'방문자',color:C.a,values:dc.map(d=>d.d>r.today?null:d.uv)},{label:'방문 수',color:C.b,values:dc.map(d=>d.d>r.today?null:d.sessions)}]}),{sub:'조회 기간'}):'')
          +card('월별 방문자',chart('kpi-c-web-m',{type:'bar',cats:mCats,full:mFulls,fmt:v=>num(v)+'명',aria:'최근 12개월 월별 방문자',series:[{label:'방문자',color:C.a,values:Wb.monthly.map(m=>m.uv)}]})
            +asTable(['월','방문자','방문 수','페이지뷰'],Wb.monthly.map(m=>[mFull(m.m),num(m.uv)+'명',num(m.sessions)+'회',num(m.pv)+'회']),1),{sub:'최근 12개월'})
          +'</div>'
          +card('자주 보는 페이지',Wb.pages.length?table(['페이지','조회','방문자','평균 머문 시간','첫 페이지로 들어온 방문'],Wb.pages.map(p=>['<span class="kpi-page"><b>'+esc(p.title||p.path)+'</b><a href="'+esc(p.path)+'" target="_blank" rel="noopener">'+esc(p.path)+'</a></span>',num(p.pv),num(p.uv),dur(p.dwell),num(p.entries)]),1):'<p class="small muted">기록이 없습니다.</p>',{wide:true,sub:'조회 수 상위 20개'})
          +'<div class="kpi-grid2">'
          +card('링크 클릭 수','<div class="kpi-mini">'+kinds.map(k=>'<div><span>'+KIND[k]+'</span><b>'+num(ck[k]||0)+'</b>'+delta(ck[k]||0,ckp[k]||0,{good:true})+'</div>').join('')+'</div>'
            +(Wb.links.length?table(['누른 링크','종류','클릭'],Wb.links.map(l=>['<span class="kpi-page"><b>'+esc(l.label||l.target)+'</b><small>'+esc(l.target==='tel'||l.target==='sms'||l.target==='mail'?'':l.target)+'</small></span>',KIND[l.kind]||l.kind,num(l.n)]),2):''),{sub:'전화·카카오톡·예약·문의 등'})
          +card('유입 경로',hbars(Wb.sources.map(s=>({label:s.label,value:s.n,text:num(s.n)+'회 ('+pct(share(s.n,wc.sessions))+')'})))
            +(Wb.hosts.length?'<h4 class="kpi-h4">들어오기 전 사이트</h4>'+hbars(Wb.hosts.map(x=>({label:x.host,value:x.n,text:num(x.n)+'회',color:C.c}))):''),{sub:'방문의 첫 페이지 기준'})
          +'</div>'
          +'<div class="kpi-grid2">'
          +card('시간대별 방문',chart('kpi-c-web-h',{type:'bar',cats:Array.from({length:24},(_,i)=>String(i)),full:Array.from({length:24},(_,i)=>i+'시~'+(i+1)+'시'),fmt:v=>num(v)+'회',aria:'시간대별 페이지뷰',series:[{label:'페이지뷰',color:C.a,values:Wb.hours}]}),{sub:'페이지뷰 · 한국 시각'})
          +card('홈페이지 안에서 많이 누른 링크',Wb.inner.length?table(['이동한 페이지','클릭'],Wb.inner.map(l=>['<span class="kpi-page"><b>'+esc(l.label||l.target)+'</b><small>'+esc(l.target)+'</small></span>',num(l.n)]),1):'<p class="small muted">기록이 없습니다.</p>')
          +'</div>'+optout,
          ['<b>방문자(순)</b>: 같은 브라우저는 기간 안에 여러 번 와도 한 명으로 셉니다. 브라우저 저장 공간을 지우거나 다른 기기로 오면 새 방문자로 셉니다.',
           '<b>방문 수</b>: 30분 넘게 움직임이 없다가 다시 보면 새 방문으로 셉니다. <b>이탈률</b>은 한 페이지만 보고 나간 방문의 비율입니다.',
           '<b>체류시간</b>: 화면을 실제로 보고 있던 시간만 더합니다(다른 탭에 가 있던 시간 제외, 한 페이지 최대 30분). 페이지를 닫을 때 기록하므로 일부 휴대폰 브라우저에서는 빠질 수 있습니다.',
           '<b>링크 클릭</b>: 전화·문자·이메일 링크, 카카오톡 채널, 예약·문의·결제·행사 준비·입점 신청 페이지로 가는 링크, 소개서 PDF, 다른 사이트로 나가는 링크를 종류별로 셉니다.',
           '이름·연락처·IP 주소는 저장하지 않습니다. 브라우저의 추적 거부 설정(Global Privacy Control·Do Not Track)을 켠 방문은 넣지 않습니다. 기록은 13개월 뒤 지웁니다.']);
      }
    }

    // 입점 플랫폼
    if(PL){
      const st=PL.stats||{};
      h+=section('kpi-plat','입점 플랫폼',(sp?'지점 선택과 상관없이 입점 공간 전체 기준입니다. ':'')+'조회 기간에 들어온 건(접수일 기준)입니다.',
        '<div class="kpi-tiles">'
        +tile('공개 중인 입점 공간',num(PL.live)+'곳','오늘 기준')
        +tile('심사 요청',num(PL.submitted)+'건','새로 공개 '+num(PL.approved)+'건')
        +tile('입점 공간 예약·문의',num(PL.bookings.total)+'건','홈페이지 '+num(PL.bookings.web)+' · 호스트 직접 등록 '+num(PL.bookings.host))
        +tile('그중 확정·완료',num(PL.bookings.confirmed)+'건',pct(share(PL.bookings.confirmed,PL.bookings.total)))
        +tile('행사 준비 요청',num(PL.planning.total)+'건','진행 확정 '+num(PL.planning.won)+'건')
        +tile('입점 이용료 순수납',won(PL.billing.net),'결제 '+num(PL.billing.paid_count)+'건 '+won(PL.billing.paid)+(PL.billing.refunded?' · 환불 '+won(PL.billing.refunded):''))
        +'</div>'
        +card('입점 공간 상세 페이지 반응',hbars([{label:'상세 페이지 조회',value:st.view||0,text:num(st.view)+'회'},{label:'연락처·채널 보기',value:st.contact||0,text:num(st.contact)+'회 ('+pct(share(st.contact,st.view))+')'},{label:'예약 요청',value:st.inquiry||0,text:num(st.inquiry)+'건 ('+pct(share(st.inquiry,st.view))+')'}]),{wide:true,sub:'공간별 집계를 모두 더한 값'}),
        ['입점 이용료는 결제가 확인된 날(한국 시각) 기준, 환불은 환불 처리일 기준입니다. 부가세 포함 금액입니다.',
         '호스트 직접 등록은 호스트가 전화·카카오톡·다른 플랫폼 예약을 호스트센터에 옮겨 적은 건입니다.']);
    }
    body.innerHTML=h;
    drawAll();
    const box=document.getElementById('kpi-optout');
    if(box) box.addEventListener('change',()=>{ const p=statPref(); p.off=box.checked?1:0; p.admin_set=1; statSave(p); M.toast(box.checked?'이 브라우저의 방문은 통계에서 뺍니다.':'이 브라우저의 방문도 통계에 넣습니다.'); });
  }

  async function load(){
    const q=params(); if(!q){ status.textContent='시작일과 종료일을 확인해 주세요.'; return; }
    const v=++version; body.setAttribute('aria-busy','true'); status.textContent='지표를 계산하고 있습니다…';
    try{
      const r=await X.A('/kpi?'+q);
      if(v!==version) return;
      last=r; loadedAt=Date.now(); render(r);
      status.textContent=(r.space?BRANCH[r.space]:'전체 지점')+' · '+periodText(r.from,r.to)+' · '+new Date(Date.now()+9*3600e3).toISOString().slice(11,16)+' 기준';
    }catch(e){ if(v!==version) return; if(!X.guard(e)) status.textContent=(e&&e.message)||'지표를 불러오지 못했습니다.'; }
    finally{ if(v===version) body.removeAttribute('aria-busy'); }
  }
  X.register('kpi',()=>{ syncMode(); if(!last||Date.now()-loadedAt>5*60e3) load(); else requestAnimationFrame(drawAll); });
})();
