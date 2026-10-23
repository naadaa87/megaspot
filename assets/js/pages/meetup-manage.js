/* 모임 주최자 관리 — 관리 링크(id·k)로 열립니다. 신청자 명단 · 확정/대기 처리 · 모집 마감 · 공지·정원 수정 · CSV */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc;
  var root=$('#mg-root'); if(!root) return;
  var q=new URLSearchParams(location.search), ref=String(q.get('id')||'').toUpperCase(), k=q.get('k')||'';
  var RAW={ pending:['운영팀 확인 중','badge-warn','운영팀이 내용을 확인하고 있습니다. 공개되면 아래 공개 주소로 참가 신청을 받을 수 있어요.'], open:['모집 중','badge-ok',''], closed:['모집 마감','badge-soft','새 신청을 받지 않습니다. 다시 열면 신청을 받습니다.'],
    cancelled:['모임 취소','badge-soft','취소한 모임입니다. 공개 화면에 취소 안내가 보입니다.'], rejected:['공개 보류','badge-rust',''], hidden:['숨김','badge-soft','운영팀이 공개를 멈춘 모임입니다. 궁금한 점은 카카오톡으로 문의해 주세요.'] };
  var APP=[['confirmed','참가 확정'],['pending','승인 대기'],['waitlist','대기'],['cancelled','취소'],['rejected','참가 불가']];
  var data=null, filter='';
  function api(method, body){ return M.api('/meetups/'+encodeURIComponent(ref)+'/manage?k='+encodeURIComponent(k), method==='GET'?{}:{ method:'POST', body:Object.assign({ k:k }, body||{}) }); }
  function fail(t, b){ root.innerHTML='<div class="empty"><b>'+esc(t)+'</b>'+esc(b)+'<div class="row mt-3" style="justify-content:center"><a class="btn btn-light" href="/meetups/">모임 목록</a>'+(M.CONFIG.kakaoChannel?'<a class="btn btn-kakao" href="'+esc(M.CONFIG.kakaoChannel)+'" target="_blank" rel="noopener">카카오톡 문의</a>':'')+'</div></div>'; }
  if(!/^MO-\d{4}-[A-Z0-9]{4}$/.test(ref) || !k){ fail('관리 링크가 올바르지 않습니다', '모임을 등록할 때 받은 관리 링크 전체를 열어 주세요.'); return; }

  function sum(st){ return (data.apps||[]).filter(function(a){ return a.status===st; }).reduce(function(s,a){ return s+(+a.people||0); }, 0); }
  function render(){
    var m=data.meetup, raw=RAW[m.raw_status]||[m.status_label,'badge-soft',''], pub=['open','closed','cancelled'].indexOf(m.raw_status)>=0;
    var url=location.origin+'/meetups/view/?id='+encodeURIComponent(ref);
    var stNote=m.raw_status==='rejected'?'운영 기준에 맞지 않아 공개하지 않았습니다.'+(m.reject_reason?' 사유: '+m.reject_reason:'')+' 내용을 고쳐 다시 올리시려면 카카오톡으로 문의해 주세요.':raw[2];
    if(m.status==='done') stNote='모임 날짜가 지나 공개 화면에는 \'종료\'로 보입니다. 참가자 정보는 모임이 끝나고 30일 안에 지워 주세요.';
    var acts='';
    if(m.raw_status==='open') acts+='<button class="btn btn-light btn-sm" type="button" data-act="closed">모집 마감하기</button>';
    if(m.raw_status==='closed') acts+='<button class="btn btn-light btn-sm" type="button" data-act="open">다시 신청 받기</button>';
    if(['open','closed','pending'].indexOf(m.raw_status)>=0) acts+='<button class="btn btn-light btn-sm mg-danger" type="button" data-act="cancelled">모임 취소</button>';
    root.innerHTML='<div class="mg-head card"><div class="row between" style="align-items:flex-start;gap:12px"><div><div class="row" style="gap:6px"><span class="badge '+raw[1]+'">'+esc(m.status==='done'?'종료':raw[0])+'</span>'+(m.verified?'<span class="badge badge-direct">메가스팟 예약 확인</span>':'')+'<span class="tiny muted">'+esc(ref)+'</span></div>'
      +'<h1 class="h-m mt-1">'+esc(m.title)+'</h1><p class="small muted mt-1">'+esc(M.fmtKDate(m.date))+' '+esc(m.start_time)+(m.end_time?'–'+esc(m.end_time):'')+' · '+esc(M.meetupWhere(m))+'</p></div>'
      +'<div class="row" style="gap:6px" id="mg-acts">'+acts+'</div></div>'
      +(stNote?'<div class="notice '+(m.raw_status==='rejected'?'rust':'')+' mt-2"><div>'+esc(stNote)+'</div></div>':'')
      +(pub?'<div class="mg-link mt-2"><span class="small muted">공개 주소</span><a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(url)+'</a><button class="btn btn-light btn-xs" type="button" id="mg-copy">주소 복사</button></div>':'')
      +'<div class="mg-kpis mt-3"><div><small>참가 확정</small><b>'+sum('confirmed')+'<em>명</em></b></div><div><small>승인 대기</small><b>'+sum('pending')+'<em>명</em></b></div><div><small>대기</small><b>'+sum('waitlist')+'<em>명</em></b></div><div><small>정원</small><b>'+esc(m.capacity)+'<em>명</em></b></div></div></div>'
      +'<div class="mg-grid mt-3">'
      +'<div class="card"><div class="row between" style="gap:8px;flex-wrap:wrap"><h2 class="h-s">신청자 <small class="muted" style="font-weight:600">'+(data.apps||[]).length+'건</small></h2><div class="row" style="gap:6px"><button class="btn btn-light btn-xs" type="button" id="mg-phones">확정자 연락처 복사</button><button class="btn btn-light btn-xs" type="button" id="mg-csv">CSV 내려받기</button><button class="btn btn-light btn-xs" type="button" id="mg-reload">새로고침</button></div></div>'
      +'<div class="chips-line mt-2" id="mg-filter"><button type="button" class="chip'+(filter===''?' on':'')+'" data-f="">전체</button>'+APP.map(function(a){ var n=(data.apps||[]).filter(function(x){ return x.status===a[0]; }).length; return '<button type="button" class="chip'+(filter===a[0]?' on':'')+'" data-f="'+a[0]+'">'+a[1]+'<span class="n">'+n+'</span></button>'; }).join('')+'</div>'
      +'<div class="mg-list mt-2" id="mg-list"></div>'
      +'<p class="tiny muted mt-2">신청자 정보는 신청자가 주최자에게 제공하는 데 동의한 정보입니다. 참가 확인과 모임 안내에만 쓰고, 모임이 끝나고 30일 안에 지워 주세요. 이 화면 주소를 아는 사람은 누구나 명단을 볼 수 있으니 공유하지 마세요.</p></div>'
      +'<form class="card form" id="mg-edit" novalidate><h2 class="h-s">모집 설정 · 공지</h2>'
      +'<div class="field-row"><div class="f"><label for="mg-cap">정원</label><input class="input" type="number" id="mg-cap" name="capacity" min="2" max="2000" value="'+esc(m.capacity)+'" required></div><div class="f"><label for="mg-min">최소 진행 인원</label><input class="input" type="number" id="mg-min" name="min_people" min="0" max="2000" value="'+esc(m.min_people||'')+'"></div></div>'
      +'<div class="f"><label for="mg-dl">모집 마감일</label><input class="input" type="date" id="mg-dl" name="deadline" max="'+esc(m.date)+'" value="'+esc(m.deadline||'')+'"></div>'
      +'<div class="f"><label for="mg-notice">참가자 공지 <span class="muted">(모임 페이지 위쪽에 보입니다)</span></label><textarea class="textarea" id="mg-notice" name="notice" rows="4" maxlength="1000" placeholder="예: 입장은 18:50부터, 명찰은 입구에서 받아 가세요.">'+esc(m.notice||'')+'</textarea></div>'
      +'<p class="tiny muted">정원을 늘리면 대기자가 신청한 순서대로 올라갑니다. 모임 이름·소개·날짜를 바꾸려면 운영팀에 문의해 주세요.</p>'
      +'<div class="form-note" id="mg-msg" hidden></div><button class="btn btn-primary" type="submit">저장</button></form>'
      +'</div>';
    list(); bind();
  }
  function list(){
    var l=(data.apps||[]).filter(function(a){ return !filter || a.status===filter; });
    $('#mg-list').innerHTML=l.length?l.map(function(a, i){
      return '<div class="mg-row st-'+esc(a.status)+'"><div class="r1"><b>'+esc(a.name)+'</b><a href="tel:'+esc(a.phone)+'">'+esc(a.phone)+'</a><span>'+esc(a.people)+'명</span><span class="tiny muted">'+esc(String(a.created_at||'').slice(0,16))+'</span>'
        +'<select class="select" data-app="'+esc(a.ref)+'" aria-label="'+esc(a.name)+' 신청 상태">'+APP.map(function(s){ return '<option value="'+s[0]+'"'+(s[0]===a.status?' selected':'')+'>'+s[1]+'</option>'; }).join('')+'</select></div>'
        +(a.answer||a.message?'<div class="r2">'+(a.answer?'<span><b>답변</b> '+esc(a.answer)+'</span>':'')+(a.message?'<span><b>남긴 말</b> '+esc(a.message)+'</span>':'')+'</div>':'')+'</div>';
    }).join(''):'<div class="empty small">'+(filter?'해당 상태의 신청이 없습니다.':'아직 신청이 없습니다. 공개 주소를 모임 채널·SNS에 공유해 보세요.')+'</div>';
  }
  function act(body, okMsg){ return api('POST', body).then(function(j){ data=j; render(); if(okMsg) M.toast(okMsg); }).catch(function(e){ M.toast(e.message||'저장하지 못했습니다.'); }); }
  function csv(){
    var rows=[['신청번호','상태','이름','휴대폰','인원','답변','남긴 말','신청 시각']].concat((data.apps||[]).map(function(a){ return [a.ref,a.status_label,a.name,a.phone,a.people,a.answer,a.message,a.created_at]; }));
    var text='﻿'+rows.map(function(r){ return r.map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(','); }).join('\r\n');
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})); a.download=ref+'-신청자.csv'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function bind(){
    var c=$('#mg-copy'); if(c) c.addEventListener('click', function(){ M.copy(location.origin+'/meetups/view/?id='+encodeURIComponent(ref)).then(function(ok){ M.toast(ok?'공개 주소를 복사했습니다.':'복사하지 못했습니다.'); }); });
    $('#mg-reload').addEventListener('click', load);
    $('#mg-csv').addEventListener('click', csv);
    $('#mg-phones').addEventListener('click', function(){ var l=(data.apps||[]).filter(function(a){ return a.status==='confirmed'; }).map(function(a){ return a.phone; }); if(!l.length){ M.toast('참가 확정된 신청자가 없습니다.'); return; } M.copy(l.join(', ')).then(function(ok){ M.toast(ok?'확정자 '+l.length+'명의 연락처를 복사했습니다.':'복사하지 못했습니다.'); }); });
    $('#mg-filter').addEventListener('click', function(e){ var b=e.target.closest('[data-f]'); if(!b) return; filter=b.dataset.f; $$('#mg-filter .chip').forEach(function(x){ x.classList.toggle('on', x===b); }); list(); });
    $('#mg-list').addEventListener('change', function(e){ var s=e.target.closest('select[data-app]'); if(!s) return; act({ action:'app', app:s.dataset.app, status:s.value }, '신청 상태를 바꿨습니다.'); });
    var acts=$('#mg-acts');
    acts.addEventListener('click', function(e){
      var b=e.target.closest('button[data-act]'); if(!b) return;
      var to=b.dataset.act;
      if(to==='cancelled' && !b.dataset.sure){ b.dataset.sure='1'; b.textContent='정말 취소할까요? 한 번 더 누르세요'; b.classList.add('btn-dark'); setTimeout(function(){ if(b.isConnected){ delete b.dataset.sure; b.textContent='모임 취소'; b.classList.remove('btn-dark'); } }, 5000); return; }
      act({ action:'status', status:to }, to==='closed'?'모집을 마감했습니다.':to==='open'?'다시 신청을 받습니다.':'모임을 취소했습니다. 신청자에게 따로 알려 주세요.');
    });
    $('#mg-edit').addEventListener('submit', function(e){
      e.preventDefault(); var f=e.target, msg=$('#mg-msg'); msg.hidden=true; if(!M.validate(f)) return;
      var d=M.formData(f); act({ action:'update', capacity:d.capacity, min_people:d.min_people||0, deadline:d.deadline||'', notice:d.notice||'' }, '저장했습니다.');
    });
  }
  function load(){
    api('GET').then(function(j){ data=j; render(); }).catch(function(e){
      if(e.code==='NO_API') fail('서버에 연결되지 않았습니다', '잠시 후 다시 열어 주세요.');
      else if(e.code==='BAD_KEY') fail('관리 링크가 맞지 않습니다', '모임을 등록할 때 받은 링크 전체를 열었는지 확인해 주세요. 링크를 잃어버렸다면 모임번호를 운영팀에 알려 주세요.');
      else fail('관리 화면을 열지 못했습니다', e.message||'잠시 후 다시 시도해 주세요.');
    });
  }
  load();
})();
