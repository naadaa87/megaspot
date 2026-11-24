/* 관리자 · 검색 성과 (2026-11-25) — 새 메뉴 (view: search-perf)
   검색봇이 얼마나 다녀가는지, IndexNow 알림이 잘 가는지, 검색으로 몇 명이 들어오는지 한 화면에서 봅니다.
   서치콘솔·서치어드바이저에서 확인한 색인 수와 검색어는 '주간 기록'에 옮겨 적어 흐름을 봅니다.
   /api/admin/search-perf… 만 쓰고, 기존 KPI 지표 화면과 API는 건드리지 않습니다. 메뉴 버튼은 admin-navigation.js 가 붙입니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var main=document.querySelector('.adm-main'); if(!main) return;
  var esc=X.esc;
  function kst(at){ var t=Date.parse(String(at||'').replace(' ','T')+'Z'); if(!isFinite(t)) return ''; var d=new Date(t+9*36e5).toISOString(); return (+d.slice(5,7))+'/'+(+d.slice(8,10))+' '+d.slice(11,16); }
  function md(d){ return d?(+d.slice(5,7))+'/'+(+d.slice(8,10)):''; }
  function n(v){ return v==null?'—':Number(v).toLocaleString('ko-KR'); }
  var CODE={200:'받음',202:'받음 (확인 대기)',400:'형식 오류',403:'열쇠 확인 실패',422:'사이트와 맞지 않는 주소',429:'너무 자주 보냄',error:'연결 실패'};
  function codeLabel(c){ return CODE[c]||(c>=500?'받는 쪽 오류':String(c)); }
  function codeCls(c){ return c===200||c===202?'sp-ok':(c===429||c>=500||c==='error'?'sp-wait':'sp-bad'); }
  var WHY={new:'새 주소·고친 주소',retry:'자동 재시도',manual:'관리자가 다시 보냄'};

  var V=document.createElement('section'); V.id='view-search-perf'; V.className='adm-view sp-view'; V.hidden=true;
  V.innerHTML='<header class="adm-head"><div><h1>검색 성과</h1><p class="small muted">검색봇 방문, 검색엔진 알림(IndexNow), 검색으로 들어온 방문과 문의를 모아 봅니다. 사람 방문의 이름·연락처는 쓰지 않습니다.</p></div>'
    +'<div class="sp-period" role="group" aria-label="기간"><button type="button" data-d="7">7일</button><button type="button" data-d="30" class="on">30일</button><button type="button" data-d="90">90일</button></div></header>'
    +'<p class="small muted" id="sp-status" role="status"></p>'
    +'<div class="sp-tiles" id="sp-tiles"></div>'
    +'<div class="sp-grid">'
    +'<section class="adm-card" id="sp-bots"></section>'
    +'<section class="adm-card" id="sp-indexnow"></section>'
    +'<section class="adm-card" id="sp-inflow"></section>'
    +'<section class="adm-card" id="sp-sitemap"></section>'
    +'</div>'
    +'<section class="adm-card sp-records" id="sp-records"></section>'
    +'<section class="adm-card sp-weekly" id="sp-weekly"></section>';
  main.appendChild(V);
  var q=function(s){ return V.querySelector(s); }, days=30, data=null;

  V.querySelector('.sp-period').addEventListener('click',function(e){ var b=e.target.closest('button[data-d]'); if(!b) return; days=+b.dataset.d; V.querySelectorAll('.sp-period button').forEach(function(x){ x.classList.toggle('on',x===b); }); load(); });

  function load(){
    q('#sp-status').textContent='불러오는 중…';
    return X.A('/search-perf?days='+days).then(function(r){ data=r; draw(); q('#sp-status').textContent=md(r.from)+' ~ '+md(r.to)+' 기준'+(r.live?'':' · 미리보기 주소라 IndexNow 는 보내지 않습니다'); })
      .catch(function(e){ q('#sp-status').textContent='불러오지 못했습니다: '+(e&&e.message||''); });
  }
  function bar(v,max){ var w=max?Math.max(2,Math.round(v/max*100)):0; return '<span class="sp-bar" aria-hidden="true"><i style="width:'+w+'%"></i></span>'; }

  function draw(){
    var r=data, bots=r.crawlers.bots||[], botHits=bots.reduce(function(a,b){ return a+b.hits; },0);
    var search=['naver','google','daum','bing'];
    var main4=bots.filter(function(b){ return search.indexOf(b.bot)>=0; }).reduce(function(a,b){ return a+b.hits; },0);
    q('#sp-tiles').innerHTML=[
      ['검색봇 방문',n(botHits),'네이버·구글·빙·다음 '+n(main4)+'회'],
      ['검색으로 들어온 방문',n(r.inflow.visits),'전체 방문 시작 '+n(r.inflow.all_visits)+'회 중'],
      ['검색에서 온 문의',n(r.inquiries.search_total),'같은 기간 문의 '+n(r.inquiries.total)+'건 중'],
      ['검색엔진에 알리는 주소',r.sitemap?n(r.sitemap.total):'—',r.sitemap&&r.sitemap.latest?'가장 최근 수정 '+md(r.sitemap.latest):'sitemap.xml']
    ].map(function(t){ return '<div class="sp-tile"><span>'+t[0]+'</span><b>'+t[1]+'</b><small>'+esc(t[2])+'</small></div>'; }).join('');

    // ---- 검색봇 방문 ----
    var byDay={}; (r.crawlers.daily||[]).forEach(function(x){ byDay[x.day]=(byDay[x.day]||0)+x.hits; });
    var list=[], t0=Date.parse(r.from+'T00:00:00Z'), t1=Date.parse(r.to+'T00:00:00Z');
    for(var t=t0;t<=t1;t+=864e5){ var d=new Date(t).toISOString().slice(0,10); list.push([d,byDay[d]||0]); }
    var mx=Math.max.apply(null,list.map(function(x){ return x[1]; }).concat([1]));
    var cols=list.map(function(x){ var h=x[1]?Math.max(3,Math.round(x[1]/mx*100)):0; return '<span class="sp-col" title="'+md(x[0])+' · '+x[1]+'회" aria-label="'+md(x[0])+' '+x[1]+'회"><i style="height:'+h+'%"></i></span>'; }).join('');
    var bmax=bots.length?bots[0].hits:0;
    q('#sp-bots').innerHTML='<h2 class="h-s">검색봇 방문</h2><p class="small muted">날짜별 방문 수 (가장 많은 날 '+n(mx)+'회). 막대에 마우스를 올리면 날짜와 횟수가 보입니다.</p>'
      +'<div class="sp-cols" role="img" aria-label="날짜별 검색봇 방문 수">'+cols+'</div><div class="sp-cols-axis"><span>'+md(r.from)+'</span><span>'+md(r.to)+'</span></div>'
      +(bots.length?'<table class="sp-table"><thead><tr><th>봇</th><th class="sp-n">방문</th><th class="sp-n">다녀간 날</th><th>마지막</th></tr></thead><tbody>'
        +bots.map(function(b){ return '<tr><td>'+esc(b.label)+bar(b.hits,bmax)+'</td><td class="sp-n">'+n(b.hits)+'</td><td class="sp-n">'+b.days+'일</td><td class="small">'+esc(kst(b.last_at))+'<br><span class="muted">'+esc(b.last_path||'')+'</span></td></tr>'; }).join('')+'</tbody></table>'
        :'<p class="small muted">이 기간에 기록된 검색봇 방문이 없습니다.</p>');

    // ---- IndexNow ----
    var ix=r.indexnow, L=r.indexnow_labels||{};
    var h='<div class="sp-card-head"><h2 class="h-s">검색엔진 알림 (IndexNow)</h2><button type="button" class="btn btn-light btn-sm" id="sp-ix-send">지금 다시 보내기</button></div>'
      +'<p class="small muted">sitemap.xml 이 바뀌면 새 주소와 고친 주소를 네이버와 빙에 알립니다. 실패한 곳은 1·3·6·12·24시간 간격으로 다시 보냅니다.</p>';
    if(!ix){ h+='<p class="small muted mt-1">아직 보낸 기록이 없습니다. 실제 사이트에 새 주소가 올라가면 자동으로 보냅니다.</p>'; }
    else{
      h+='<div class="sp-ends">'+(ix.endpoints||Object.keys(ix.results||{})).map(function(k){ var c=(ix.results||{})[k]; return '<div class="sp-end"><b>'+esc(L[k]||k)+'</b><span class="sp-code '+codeCls(c)+'">'+(c==null?'아직 안 보냄':esc(codeLabel(c))+' · '+esc(String(c)))+'</span></div>'; }).join('')+'</div>'
        +'<p class="small mt-1">마지막 확인 '+esc(kst(ix.at))+' · 알린 주소 '+n(ix.submitted)+'개 / sitemap '+n(ix.total)+'개</p>'
        +(ix.retry?'<p class="small sp-warn">다시 보낼 곳: '+ix.retry.names.map(function(k){ return esc(L[k]||k); }).join(', ')+' · '+ix.retry.tries+'번째 시도까지 함'+(ix.retry.next_at?' · 다음 시도 '+esc(kst(ix.retry.next_at))+' 이후':'')+'</p>':'')
        +((ix.log||[]).length?'<details class="mt-1"><summary class="small">최근 보낸 기록 '+ix.log.length+'건</summary><table class="sp-table"><thead><tr><th>때</th><th>받는 곳</th><th>결과</th><th class="sp-n">주소</th><th>이유</th></tr></thead><tbody>'
          +ix.log.map(function(x){ return '<tr><td class="small">'+esc(kst(x.at))+'</td><td>'+esc(L[x.name]||x.name)+'</td><td><span class="sp-code '+codeCls(x.code)+'">'+esc(codeLabel(x.code))+'</span></td><td class="sp-n">'+n(x.n)+'</td><td class="small">'+esc(WHY[x.why]||'')+'</td></tr>'; }).join('')+'</tbody></table></details>':'');
    }
    q('#sp-indexnow').innerHTML=h;
    q('#sp-ix-send').addEventListener('click',function(){ var b=this; b.disabled=true;
      X.A('/search-perf/indexnow',{method:'POST',body:{}}).then(function(x){ M.toast(x.message); return load(); }).catch(function(e){ M.toast(e.message||'보내지 못했습니다.'); }).then(function(){ b.disabled=false; }); });

    // ---- 검색 유입 ----
    var en=r.inflow.engines||[], emax=en.length?en[0].n:0, pg=r.inflow.pages||[];
    q('#sp-inflow').innerHTML='<h2 class="h-s">검색으로 들어온 방문</h2><p class="small muted">방문의 첫 화면 기준입니다. 검색어는 브라우저가 넘겨주지 않아 여기서는 셀 수 없습니다. 아래 주간 기록에 옮겨 적어 주세요.</p>'
      +(en.length?'<table class="sp-table"><tbody>'+en.map(function(x){ return '<tr><td>'+esc(x.label)+bar(x.n,emax)+'</td><td class="sp-n">'+n(x.n)+'</td></tr>'; }).join('')+'</tbody></table>':'<p class="small muted">이 기간에 검색으로 들어온 방문이 없습니다.</p>')
      +(r.inquiries.search.length?'<p class="small mt-1"><b>검색에서 온 문의</b> · '+r.inquiries.search.map(function(x){ return esc(x.label)+' '+x.n+'건'; }).join(' · ')+'</p>':'')
      +(pg.length?'<details class="mt-1"><summary class="small">검색으로 처음 연 화면 '+pg.length+'곳</summary><table class="sp-table"><tbody>'+pg.map(function(p){ return '<tr><td class="small"><a href="'+esc(p.path)+'" target="_blank" rel="noopener">'+esc(p.path)+'</a></td><td class="sp-n">'+n(p.n)+'</td></tr>'; }).join('')+'</tbody></table></details>':'');

    // ---- sitemap ----
    var sm=r.sitemap;
    q('#sp-sitemap').innerHTML='<h2 class="h-s">검색엔진에 알리는 주소</h2>'
      +(sm?'<p class="small muted">sitemap.xml 에 실린 주소 '+n(sm.total)+'개를 묶음별로 셌습니다. 색인된 수는 서치콘솔·서치어드바이저에서 확인해 아래에 적어 주세요.</p><table class="sp-table"><tbody>'
        +sm.groups.map(function(g){ return '<tr><td>'+esc(g.name)+bar(g.n,sm.groups[0].n)+'</td><td class="sp-n">'+n(g.n)+'</td></tr>'; }).join('')+'</tbody></table>'
        :'<p class="small muted">sitemap.xml 을 읽지 못했습니다.</p>');

    drawRecords();
    q('#sp-weekly').innerHTML='<h2 class="h-s">매주 할 일</h2><ol class="sp-todo small">'
      +'<li><a href="https://search.google.com/search-console" target="_blank" rel="noopener">구글 서치콘솔</a> → 페이지 색인 생성에서 <b>색인 생성됨</b> 수, 실적에서 <b>클릭·노출</b>과 상위 검색어를 위 주간 기록에 적습니다.</li>'
      +'<li><a href="https://searchadvisor.naver.com/console/board" target="_blank" rel="noopener">네이버 서치어드바이저</a> → 리포트의 <b>색인 현황</b>과 <b>검색 유입·검색어</b>를 적습니다. 새로 만든 화면은 요청 → <b>웹 페이지 수집</b>으로 주소를 넣습니다.</li>'
      +'<li><a href="https://www.bing.com/webmasters" target="_blank" rel="noopener">빙 웹마스터 도구</a>는 IndexNow 결과가 ‘받음’인지 위 표에서 확인하면 충분합니다.</li>'
      +'<li>네이버 스마트플레이스(1호·2호)와 블로그 글은 주 1편을 목표로, 글에는 공간 상세 주소를 함께 넣습니다.</li></ol>';
  }

  function drawRecords(){
    var rec=data.records||[], box=q('#sp-records');
    var mon=(function(){ var d=new Date(Date.now()+9*36e5); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)); return d.toISOString().slice(0,10); })();
    function delta(a,b){ if(a==null||b==null) return ''; var x=a-b; return x?'<small class="'+(x>0?'sp-up':'sp-down')+'">'+(x>0?'+':'')+n(x)+'</small>':''; }
    box.innerHTML='<div class="sp-card-head"><h2 class="h-s">주간 기록 (색인 수 · 클릭 · 검색어)</h2></div>'
      +'<p class="small muted">서치콘솔·서치어드바이저에서 본 숫자를 한 주에 한 번 적어 두면 늘고 주는 흐름이 보입니다. 같은 날짜로 다시 저장하면 고쳐집니다.</p>'
      +'<form class="sp-form" id="sp-rec-form" novalidate>'
      +'<label>기준일<input class="input" type="date" name="week" value="'+mon+'" required></label>'
      +'<label>구글 색인 쪽수<input class="input" name="google_indexed" inputmode="numeric"></label>'
      +'<label>네이버 색인 쪽수<input class="input" name="naver_indexed" inputmode="numeric"></label>'
      +'<label>구글 클릭<input class="input" name="google_clicks" inputmode="numeric"></label>'
      +'<label>구글 노출<input class="input" name="google_impressions" inputmode="numeric"></label>'
      +'<label>네이버 유입<input class="input" name="naver_clicks" inputmode="numeric"></label>'
      +'<label class="sp-wide">주요 검색어 <span class="muted">(쉼표로 구분)</span><input class="input" name="queries" maxlength="400" placeholder="예: 대형 파티룸, 건대 대관, 워크숍 장소"></label>'
      +'<label class="sp-wide">메모<input class="input" name="note" maxlength="300" placeholder="이번 주에 한 일 · 눈에 띈 변화"></label>'
      +'<div class="sp-wide"><button class="btn btn-primary btn-sm" type="submit">저장</button></div></form>'
      +(rec.length?'<div class="sp-scroll"><table class="sp-table sp-rec"><thead><tr><th>기준일</th><th class="sp-n">구글 색인</th><th class="sp-n">네이버 색인</th><th class="sp-n">구글 클릭</th><th class="sp-n">구글 노출</th><th class="sp-n">네이버 유입</th><th>검색어 · 메모</th><th></th></tr></thead><tbody>'
        +rec.map(function(x,i){ var p=rec[i+1]||{}; return '<tr><td>'+esc(x.week)+'</td><td class="sp-n">'+n(x.google_indexed)+delta(x.google_indexed,p.google_indexed)+'</td><td class="sp-n">'+n(x.naver_indexed)+delta(x.naver_indexed,p.naver_indexed)+'</td><td class="sp-n">'+n(x.google_clicks)+delta(x.google_clicks,p.google_clicks)+'</td><td class="sp-n">'+n(x.google_impressions)+'</td><td class="sp-n">'+n(x.naver_clicks)+delta(x.naver_clicks,p.naver_clicks)+'</td><td class="small">'+esc(x.queries||'')+(x.note?'<br><span class="muted">'+esc(x.note)+'</span>':'')+'</td><td><button type="button" class="btn btn-light btn-sm" data-del="'+esc(x.week)+'">지우기</button></td></tr>'; }).join('')+'</tbody></table></div>'
        :'<p class="small muted mt-1">아직 적은 기록이 없습니다.</p>');
    q('#sp-rec-form').addEventListener('submit',function(e){ e.preventDefault(); var fd=new FormData(this), body={}; fd.forEach(function(v,k){ body[k]=v; }); var b=this.querySelector('button'); b.disabled=true;
      X.A('/search-perf/records',{method:'POST',body:body}).then(function(x){ data.records=x.records; drawRecords(); M.toast('저장했습니다.'); }).catch(function(er){ M.toast(er.message||'저장하지 못했습니다.'); b.disabled=false; }); });
    box.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click',function(){ if(!window.confirm(b.dataset.del+' 기록을 지울까요?')) return;
      X.A('/search-perf/records/'+b.dataset.del,{method:'DELETE'}).then(function(x){ data.records=x.records; drawRecords(); }).catch(function(er){ M.toast(er.message||'지우지 못했습니다.'); }); }); });
  }

  X.register('search-perf',load);
})();
