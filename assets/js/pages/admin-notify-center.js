/* 관리자 · 알림 센터 (2026-11-24) — 읽기 전용
   여러 메뉴에 흩어진 카카오톡(알림톡)·문자 발송 기록을 한 화면에서 찾고, 실패·확인 필요 건과 보낼 글(템플릿), 연결 상태를 모아 봅니다.
   이 파일이 화면(section#view-notify-center)을 만들고 /api/admin/notify-center 만 읽습니다.
   다시 보내기·설정 바꾸기는 각 줄의 '메뉴 열기'로 기존 메뉴에서 합니다. 기존 관리자 화면과 API는 건드리지 않습니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var main=document.querySelector('.adm-main'); if(!main) return;
  var esc=X.esc, last=null, loadedAt=0, tab='log';
  var CLS={ok:'nc-ok',fail:'nc-fail',check:'nc-check',wait:'nc-wait',off:'nc-off',test:'nc-test'};

  var view=document.createElement('section'); view.id='view-notify-center'; view.className='adm-view nc-view'; view.hidden=true;
  view.innerHTML='<header class="adm-head"><div><h1>알림 센터</h1><p class="small muted">예약 확정·보증금·주차·초대장·계약서·호스트·회원 안내까지 카카오톡과 문자 발송 기록을 한곳에서 찾습니다. 이 화면은 보기만 합니다. 다시 보내기와 설정은 각 줄의 ‘메뉴 열기’에서 해 주세요.</p></div>'
    +'<button type="button" class="btn btn-light btn-sm" id="nc-reload">새로고침</button></header>'
    +'<div class="nc-tabs" role="tablist"><button type="button" role="tab" data-tab="log" class="on" aria-selected="true">발송 기록</button><button type="button" role="tab" data-tab="tpl" aria-selected="false">보낼 글(템플릿)</button><button type="button" role="tab" data-tab="conn" aria-selected="false">연결 상태</button></div>'
    +'<div data-pane="log">'
      +'<form class="adm-card nc-bar" id="nc-form" novalidate>'
        +'<label>시작일<input class="input" type="date" name="from"></label><span aria-hidden="true">~</span><label>종료일<input class="input" type="date" name="to"></label>'
        +'<label>종류<select class="select" name="source"><option value="">전체</option></select></label>'
        +'<label>결과<select class="select" name="status"><option value="">전체</option><option value="fail">실패</option><option value="check">결과 확인 필요</option><option value="ok">보냄</option><option value="wait">보내는 중·대기</option><option value="off">보내지 않음</option><option value="test">시험 발송</option></select></label>'
        +'<label class="nc-q">찾기<input class="input" type="search" name="q" placeholder="예약번호 · 주문번호 · 휴대폰 뒷 4자리 · 오류 내용"></label>'
        +'<button class="btn btn-primary btn-sm" type="submit">조회</button>'
      +'</form>'
      +'<p class="small muted" id="nc-status" role="status"></p>'
      +'<div class="nc-sum" id="nc-sum"></div>'
      +'<div class="adm-card nc-problems" id="nc-problems" hidden></div>'
      +'<div class="adm-card nc-list-card"><div class="nc-list-head"><h2>발송 기록</h2><span class="small muted" id="nc-count"></span></div><div class="nc-table-wrap"><table class="nc-table"><thead><tr><th>시각</th><th>종류</th><th>알림</th><th>예약·주문번호</th><th>받는 사람</th><th>결과</th><th></th></tr></thead><tbody id="nc-rows"></tbody></table></div></div>'
    +'</div>'
    +'<div data-pane="tpl" hidden><div class="adm-card nc-tpl-bar"><input class="input" type="search" id="nc-tpl-q" placeholder="템플릿 이름 · 코드 · 내용으로 찾기"><p class="tiny muted">카카오 비즈니스 채널에 등록·승인된 원문과 같아야 발송됩니다. 글을 바꾸려면 알림톡 템플릿 심사를 먼저 받아야 합니다.</p></div><div class="nc-tpls" id="nc-tpls"></div></div>'
    +'<div data-pane="conn" hidden><div class="adm-card"><h2>발송 연결 상태</h2><p class="small muted">Cloudflare 비밀 값이 들어 있는지만 보여 드립니다. 값 자체는 이 화면에 나오지 않습니다.</p><ul class="nc-conn" id="nc-conn"></ul><p class="small muted mt-2">각 알림을 켜고 끄는 설정은 <button type="button" class="linkish" data-go="guide-settings">알림톡·자동 발송</button> · <button type="button" class="linkish" data-go="deposit-notifications">보증금 알림</button> · <button type="button" class="linkish" data-go="parking-settings">주차 판매·연결 설정</button> · <button type="button" class="linkish" data-go="hp-notices">호스트 알림</button> 메뉴에 그대로 있습니다.</p></div></div>';
  main.appendChild(view);
  var $=function(s){ return view.querySelector(s); }, form=$('#nc-form');

  var kst=function(){ return new Date(Date.now()+9*36e5).toISOString().slice(0,10); };
  function shift(d,n){ return new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10); }
  form.to.value=kst(); form.from.value=shift(form.to.value,-29);
  // UTC 'YYYY-MM-DD HH:MM:SS' → 한국 시각 'M/D HH:MM'
  function when(s){ if(!s) return ''; var t=Date.parse(s.replace(' ','T')+'Z'); if(!isFinite(t)) return s; var d=new Date(t+9*36e5).toISOString(); return Number(d.slice(5,7))+'/'+Number(d.slice(8,10))+' '+d.slice(11,16); }
  function num(n){ return Number(n||0).toLocaleString('ko-KR'); }

  function load(){
    var q=new URLSearchParams(); ['from','to','source','status','q'].forEach(function(k){ var v=(form[k].value||'').trim(); if(v) q.set(k,v); });
    $('#nc-status').textContent='불러오는 중…';
    return X.A('/notify-center?'+q.toString()).then(function(r){ last=r; loadedAt=Date.now(); draw(); $('#nc-status').textContent=r.from+' ~ '+r.to+' (한국 날짜 기준)'+(r.missing&&r.missing.length?' · 아직 기록 표가 없는 종류: '+r.missing.length+'개':''); })
      .catch(function(e){ $('#nc-status').textContent='불러오지 못했습니다: '+(e&&e.message||''); });
  }

  function draw(){
    var r=last; if(!r) return;
    var sel=form.source; if(sel.options.length<=1) Object.keys(r.summary).forEach(function(k){ var o=document.createElement('option'); o.value=k; o.textContent=r.summary[k].label; sel.appendChild(o); });
    // 종류별 요약
    $('#nc-sum').innerHTML=Object.keys(r.summary).map(function(k){ var s=r.summary[k];
      return '<button type="button" class="nc-sum-card'+(r.source===k?' on':'')+'" data-src="'+esc(k)+'"><b>'+esc(s.label)+'</b><span class="nc-sum-n">'+num(s.total)+'<small>건</small></span>'
        +'<span class="nc-sum-row">'+(s.fail?'<em class="nc-fail">실패 '+num(s.fail)+'</em>':'')+(s.check?'<em class="nc-check">확인 '+num(s.check)+'</em>':'')+(s.wait?'<em class="nc-wait">대기 '+num(s.wait)+'</em>':'')+(!s.fail&&!s.check&&!s.wait&&s.total?'<em class="nc-ok">문제 없음</em>':'')+(!s.total?'<em class="nc-off">기록 없음</em>':'')+'</span></button>'; }).join('');
    // 실패·확인 필요
    var pb=$('#nc-problems');
    if(r.problems&&r.problems.length){ pb.hidden=false; pb.innerHTML='<div class="nc-list-head"><h2>실패·결과 확인 필요 <span class="nc-badge">'+r.problems.length+'</span></h2><span class="tiny muted">기간 안 최근 30건 · 다시 보내기는 메뉴에서</span></div><ul class="nc-prob">'+r.problems.map(function(x){ return '<li><span class="nc-pill '+CLS[x.cls]+'">'+esc(r.labels[x.cls])+'</span><div class="nc-prob-main"><b>'+esc(x.source_label)+'</b> · '+esc(x.kind_name)+' · <span class="mono">'+esc(x.ref)+'</span><span class="tiny muted"> '+esc(when(x.at))+'</span>'+(x.error?'<div class="tiny nc-err">'+esc(x.error)+'</div>':'')+'</div><button type="button" class="btn btn-light btn-sm" data-go="'+esc(x.view)+'">메뉴 열기</button></li>'; }).join('')+'</ul>'; }
    else { pb.hidden=true; pb.innerHTML=''; }
    // 목록
    $('#nc-count').textContent=num(r.total)+'건'+(r.total>r.items.length?' 중 최근 '+num(r.items.length)+'건':'');
    $('#nc-rows').innerHTML=r.items.length?r.items.map(function(x){ return '<tr><td class="nowrap">'+esc(when(x.at))+'</td><td>'+esc(x.source_label)+'</td><td>'+esc(x.kind_name)+'</td><td class="mono">'+esc(x.ref)+'</td><td class="mono">'+esc(x.receiver)+'</td><td><span class="nc-pill '+CLS[x.cls]+'" title="'+esc(x.status)+'">'+esc(r.labels[x.cls])+'</span>'+(x.error?'<div class="tiny nc-err">'+esc(x.error)+'</div>':'')+'</td><td><button type="button" class="btn btn-light btn-sm" data-go="'+esc(x.view)+'">메뉴 열기</button></td></tr>'; }).join('')
      :'<tr><td colspan="7" class="muted small">조건에 맞는 발송 기록이 없습니다.</td></tr>';
    // 템플릿
    drawTpl();
    // 연결 상태
    $('#nc-conn').innerHTML=r.connection.map(function(c){ return '<li><span class="nc-pill '+(c.ok?'nc-ok':'nc-fail')+'">'+(c.ok?'설정됨':'없음')+'</span><b>'+esc(c.label)+'</b> <span class="tiny muted mono">'+esc(c.key)+'</span></li>'; }).join('');
  }

  function drawTpl(){
    var r=last; if(!r) return; var q=($('#nc-tpl-q').value||'').trim().toLowerCase();
    var list=r.templates.filter(function(t){ return !q||[t.group,t.name,t.code,t.content].join(' ').toLowerCase().indexOf(q)>=0; });
    $('#nc-tpls').innerHTML=list.length?list.map(function(t){ return '<details class="adm-card nc-tpl"><summary><span class="nc-tpl-g">'+esc(t.group)+'</span><b>'+esc(t.name)+'</b>'+(t.code?'<span class="mono tiny muted">'+esc(t.code)+'</span>':'<span class="tiny muted">코드는 메뉴 설정에서 등록</span>')+(t.sms?'<span class="nc-pill nc-wait">문자 대체 있음</span>':'')+'</summary><pre class="nc-tpl-body">'+esc(t.content)+'</pre>'+(t.buttons.length?'<p class="tiny muted">버튼: '+t.buttons.map(function(b){ return esc(b.name)+(b.link?' ('+esc(b.link)+')':''); }).join(' · ')+'</p>':'')+'</details>'; }).join('')
      :'<p class="small muted">찾는 템플릿이 없습니다.</p>';
  }

  function setTab(t){ tab=t; view.querySelectorAll('.nc-tabs [data-tab]').forEach(function(b){ var on=b.dataset.tab===t; b.classList.toggle('on',on); b.setAttribute('aria-selected',on?'true':'false'); }); view.querySelectorAll('[data-pane]').forEach(function(p){ p.hidden=p.dataset.pane!==t; }); }

  form.addEventListener('submit',function(e){ e.preventDefault(); load(); });
  $('#nc-reload').addEventListener('click',load);
  $('#nc-tpl-q').addEventListener('input',drawTpl);
  view.addEventListener('click',function(e){
    var t=e.target.closest('[data-tab]'); if(t){ setTab(t.dataset.tab); return; }
    var g=e.target.closest('[data-go]'); if(g){ X.go(g.dataset.go); return; }
    var s=e.target.closest('[data-src]'); if(s){ form.source.value=form.source.value===s.dataset.src?'':s.dataset.src; load(); }
  });
  X.register('notify-center',function(){ if(!last||Date.now()-loadedAt>2*60e3) load(); });
})();
