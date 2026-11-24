/* 관리자 · 고객 요청 (2026-11-25) — 새 메뉴 두 개
   ① 사전답사 신청 (view: visit-requests): 홈페이지에서 고객이 시간을 골라 보낸 답사 신청을 확인·확정·시간 변경·취소하고 글을 주고받습니다.
      기록은 기존 '현장답사' 표에 함께 있어 그 화면에서도 보입니다. /api/admin/visit-requests… 만 씁니다.
   ② 증빙 요청 (view: proof-requests): 나의 예약확인에서 고객이 보낸 세금계산서·현금영수증·견적서 요청을 처리 완료로 바꾸고 안내를 남깁니다.
      /api/admin/proof-requests… 만 씁니다.
   기존 관리자 화면과 API는 건드리지 않습니다. 메뉴 버튼은 admin-navigation.js 가 붙입니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var main=document.querySelector('.adm-main'); if(!main) return;
  var esc=X.esc, WD='일월화수목금토';
  function kd(d){ if(!d) return '날짜 미정'; var w=WD[new Date(d+'T00:00:00Z').getUTCDay()]; return (+d.slice(5,7))+'/'+(+d.slice(8,10))+'('+w+')'; }
  function kst(at){ var t=Date.parse(String(at||'').replace(' ','T')+'Z'); if(!isFinite(t)) return ''; var d=new Date(t+9*36e5).toISOString(); return (+d.slice(5,7))+'/'+(+d.slice(8,10))+' '+d.slice(11,16); }
  function copy(t,msg){ (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast(msg||'복사했습니다.'); }).catch(function(){ window.prompt('복사해 주세요',t); }); }
  function navCount(view,n){ var b=document.querySelector('#adm-nav button[data-view="'+view+'"]'); if(!b) return; var em=b.querySelector('em.cr-count'); if(!em){ em=document.createElement('em'); em.className='cr-count'; b.appendChild(em); } em.textContent=n>0?String(n):''; em.hidden=!(n>0); }

  /* ================= ① 사전답사 신청 ================= */
  var V=document.createElement('section'); V.id='view-visit-requests'; V.className='adm-view cr-view'; V.hidden=true;
  V.innerHTML='<header class="adm-head"><div><h1>사전답사 신청</h1><p class="small muted">고객이 홈페이지에서 시간을 직접 골라 보낸 답사 신청입니다. 확인 후 <b>확정</b>하거나 <b>시간 바꾸기</b>로 다른 시간을 제안하세요. 고객은 신청 화면에서 상태와 글을 봅니다. 다른 팀 답사와 시간이 겹쳐도 신청을 받습니다.</p></div><div class="cr-head-acts"><button type="button" class="btn btn-light btn-sm" id="vr-settings-btn">신청 받는 시간 설정</button><button type="button" class="btn btn-light btn-sm" id="vr-reload">새로고침</button></div></header>'
    +'<div class="cr-tabs" role="tablist"><button type="button" data-v="open" class="on">진행 중</button><button type="button" data-v="past">지난·취소</button><button type="button" data-v="all">전체</button></div>'
    +'<p class="small muted" id="vr-status" role="status"></p>'
    +'<form class="adm-card cr-settings" id="vr-settings" hidden></form>'
    +'<div class="cr-list" id="vr-list"></div>';
  main.appendChild(V);
  var vq=function(s){ return V.querySelector(s); }, vView='open', vItems=[];

  function vLoad(){
    vq('#vr-status').textContent='불러오는 중…';
    return X.A('/visit-requests?view='+vView).then(function(r){ vItems=r.items; vDraw(r); navCount('visit-requests',(r.counts.requested||0)+(r.counts.unread||0)); vq('#vr-status').textContent='확인 기다림 '+(r.counts.requested||0)+'건 · 고객이 남긴 새 글 '+(r.counts.unread||0)+'건'; })
      .catch(function(e){ vq('#vr-status').textContent='불러오지 못했습니다: '+(e&&e.message||''); });
  }
  function vDraw(r){
    var box=vq('#vr-list');
    if(!vItems.length){ box.innerHTML='<div class="adm-card"><p class="small muted">'+(vView==='open'?'진행 중인 사전답사 신청이 없습니다.':'기록이 없습니다.')+'</p></div>'; return; }
    box.innerHTML=vItems.map(function(x){
      var active=x.status==='requested'||x.status==='scheduled';
      return '<article class="adm-card cr-item'+(x.status==='requested'?' cr-new':'')+'" data-id="'+x.id+'">'
        +'<div class="cr-item-top"><div><span class="cr-pill cr-'+esc(x.status)+'">'+esc(x.status_label)+'</span>'+(x.unread?'<span class="cr-pill cr-unread">새 글 '+x.unread+'</span>':'')+(x.same_time&&x.same_time.length?'<span class="cr-pill cr-same" title="'+esc(x.same_time.join(', '))+'">같은 시간 다른 팀 '+x.same_time.length+'</span>':'')
          +'<h3>'+esc(kd(x.date))+' '+esc(x.time||'')+' · '+esc(x.space_label)+'</h3><p class="small">'+esc(x.name)+' · <a href="tel:'+esc(x.phone.replace(/[^0-9]/g,''))+'">'+esc(x.phone)+'</a>'+(x.people?' · '+x.people+'명 방문':'')+'</p>'
          +(x.purpose||x.event_date||x.headcount?'<p class="tiny muted">행사: '+esc([x.purpose,x.event_date?kd(x.event_date):'',x.headcount?x.headcount+'명':''].filter(Boolean).join(' · '))+'</p>':'')
          +'<p class="tiny muted">'+esc(x.ref)+' · 신청 '+esc(kst(x.created_at))+(x.staff?' · 담당 '+esc(x.staff):'')+'</p></div>'
          +'<div class="cr-acts">'+(active?(x.status==='requested'?'<button type="button" class="btn btn-primary btn-sm" data-a="confirm">확정</button>':'')+'<button type="button" class="btn btn-light btn-sm" data-a="move">시간 바꾸기</button><button type="button" class="btn btn-ghost btn-sm" data-a="cancel">취소</button>':'')
            +(x.status==='scheduled'?'<button type="button" class="btn btn-light btn-sm" data-a="done">답사 완료</button><button type="button" class="btn btn-ghost btn-sm" data-a="noshow">안 오심</button>':'')
            +'<button type="button" class="btn btn-light btn-sm" data-a="chat">글 '+(x.msgs||0)+'</button></div></div>'
        +'<div class="cr-chat" hidden></div></article>';
    }).join('');
  }
  function vItem(id){ return vItems.filter(function(x){ return x.id===id; })[0]; }
  function vChat(card,id){
    var box=card.querySelector('.cr-chat'); box.hidden=false; box.innerHTML='<p class="small muted">불러오는 중…</p>';
    X.A('/visit-requests/'+id).then(function(r){ drawChat(box,id,r); var it=vItem(id); if(it&&it.unread){ it.unread=0; vLoad(); } }).catch(function(e){ box.innerHTML='<p class="small">'+esc(e.message)+'</p>'; });
  }
  function drawChat(box,id,r){
    var x=r.item, sms='[메가스팟] '+x.name+'님, 사전답사 안내를 남겼습니다. 아래 주소에서 확인해 주세요.\n'+r.link;
    box.innerHTML='<div class="cr-msgs">'+(r.messages.length?r.messages.map(function(m){ return '<div class="cr-msg cr-msg-'+esc(m.sender)+'"><small>'+(m.sender==='admin'?'운영팀':'고객')+' · '+esc(kst(m.at))+(m.sender==='admin'?(m.read?' · 고객 읽음':' · 아직 안 읽음'):'')+'</small><p>'+esc(m.body)+'</p></div>'; }).join(''):'<p class="small muted">아직 주고받은 글이 없습니다.</p>')+'</div>'
      +'<form class="cr-msg-form"><textarea class="textarea" rows="2" maxlength="1000" placeholder="고객에게 보일 글 (예: 주차는 1층 입구로 들어오세요)"></textarea><button class="btn btn-primary btn-sm" type="submit">보내기</button></form>'
      +'<div class="cr-chat-tools"><span class="tiny muted">고객은 신청 화면에서 글을 봅니다. 알림이 필요하면:</span><button type="button" class="btn btn-light btn-sm" data-copy-link>고객 화면 주소 복사</button><a class="btn btn-light btn-sm" href="sms:'+esc(x.phone.replace(/[^0-9]/g,''))+'?body='+encodeURIComponent(sms)+'">문자 앱으로 안내</a></div>';
    box.querySelector('[data-copy-link]').addEventListener('click',function(){ copy(r.link,'고객 화면 주소를 복사했습니다.'); });
    box.querySelector('.cr-msg-form').addEventListener('submit',function(e){ e.preventDefault(); var t=this.querySelector('textarea').value.trim(); if(!t) return; var b=this.querySelector('button'); b.disabled=true;
      X.A('/visit-requests/'+id+'/messages',{method:'POST',body:{message:t}}).then(function(res){ drawChat(box,id,res); var it=vItem(id); if(it) it.msgs=res.messages.length; }).catch(function(err){ M.toast(err.message); b.disabled=false; }); });
  }
  function vAct(card,id,a){
    var x=vItem(id); if(!x) return;
    if(a==='chat'){ var c=card.querySelector('.cr-chat'); if(!c.hidden){ c.hidden=true; return; } return vChat(card,id); }
    var path='/visit-requests/'+id+'/', body={};
    if(a==='confirm'){ var staff=window.prompt('안내 담당자 이름(선택)',x.staff||''); if(staff===null) return; var msg=window.prompt('고객에게 보일 확정 안내(비우면 기본 문구)',''); if(msg===null) return; path+='confirm'; body={staff:staff,message:msg}; }
    else if(a==='move'){ var d=window.prompt('새 날짜 (YYYY-MM-DD)',x.date||''); if(!d) return; var t=window.prompt('새 시간 (HH:MM)',x.time||''); if(!t) return; var ok=window.confirm('이 시간으로 바로 확정할까요?\n확인 = 확정 / 취소 = 고객에게 제안만 하기'); var m2=window.prompt('고객에게 보일 안내(비우면 기본 문구)',''); if(m2===null) return; path+='reschedule'; body={date:d.trim(),time:t.trim(),confirm:ok,message:m2}; }
    else if(a==='cancel'){ var m3=window.prompt('취소 안내(고객에게 보임, 비우면 기본 문구)',''); if(m3===null) return; path+='cancel'; body={message:m3}; }
    else if(a==='done'||a==='noshow'){ path+='status'; body={status:a}; }
    var send=function(b2){ return X.A(path,{method:'POST',body:b2}); };
    send(body).catch(function(e){ if(e.code==='SLOT_TAKEN'&&window.confirm(e.message)){ body.force=true; return send(body); } throw e; })
      .then(function(r){ if(r){ M.toast('저장했습니다.'); vLoad(); } }).catch(function(e){ M.toast(e.message||'저장하지 못했습니다.'); });
  }
  V.addEventListener('click',function(e){
    var t=e.target.closest('.cr-tabs [data-v]'); if(t){ vView=t.dataset.v; V.querySelectorAll('.cr-tabs [data-v]').forEach(function(b){ b.classList.toggle('on',b===t); }); vLoad(); return; }
    var b=e.target.closest('[data-a]'); if(b){ var card=b.closest('.cr-item'); vAct(card,+card.dataset.id,b.dataset.a); }
  });
  vq('#vr-reload').addEventListener('click',vLoad);
  vq('#vr-settings-btn').addEventListener('click',function(){ var f=vq('#vr-settings'); if(!f.hidden){ f.hidden=true; return; } X.A('/visit-requests/settings').then(function(r){ drawSettings(r.item); f.hidden=false; }).catch(function(e){ M.toast(e.message); }); });
  function drawSettings(s){
    var f=vq('#vr-settings');
    f.innerHTML='<h2>신청 받는 시간</h2><label class="chk"><input type="checkbox" name="enabled"'+(s.enabled?' checked':'')+'> 홈페이지에서 사전답사 신청 받기</label>'
      +'<div class="cr-set-row"><label>첫 시작<input class="input" name="open" value="'+esc(s.open)+'"></label><label>마지막 시작<input class="input" name="close" value="'+esc(s.close)+'"></label><label>간격(분)<select class="select" name="step">'+[15,20,30,60].map(function(n){ return '<option'+(n===s.step?' selected':'')+'>'+n+'</option>'; }).join('')+'</select></label><label>답사 시간(분)<input class="input" name="duration" type="number" min="15" max="120" value="'+s.duration+'"></label><label>최소 몇 시간 전<input class="input" name="lead_hours" type="number" min="0" max="72" value="'+s.lead_hours+'"></label><label>며칠 뒤까지<input class="input" name="days_ahead" type="number" min="3" max="90" value="'+s.days_ahead+'"></label></div>'
      +'<div class="cr-set-row"><span class="small">받는 요일</span>'+[1,2,3,4,5,6,0].map(function(n){ return '<label class="chk"><input type="checkbox" name="wd" value="'+n+'"'+(s.weekdays.indexOf(n)>=0?' checked':'')+'> '+WD[n]+'</label>'; }).join('')+'</div>'
      +'<label>고객 화면 안내 한 줄<input class="input" name="note" maxlength="200" value="'+esc(s.note||'')+'" placeholder="예: 주말 답사는 오후 2시 이후만 가능합니다."></label>'
      +'<p class="tiny muted">확정 예약(행사)이 있는 시간과 일정 달력에서 ‘마감’으로 닫은 날은 자동으로 막힙니다.</p><div class="row" style="gap:8px"><button class="btn btn-primary btn-sm" type="submit">저장</button><button class="btn btn-ghost btn-sm" type="button" data-close>닫기</button></div>';
    f.onsubmit=function(e){ e.preventDefault(); var d={enabled:f.enabled.checked,open:f.open.value.trim(),close:f.close.value.trim(),step:+f.step.value,duration:+f.duration.value,lead_hours:+f.lead_hours.value,days_ahead:+f.days_ahead.value,note:f.note.value.trim(),weekdays:Array.prototype.slice.call(f.querySelectorAll('[name=wd]:checked')).map(function(x){ return +x.value; })};
      X.A('/visit-requests/settings',{method:'PUT',body:d}).then(function(r){ drawSettings(r.item); M.toast('저장했습니다.'); }).catch(function(err){ M.toast(err.message); }); };
    f.querySelector('[data-close]').onclick=function(){ f.hidden=true; };
  }
  X.register('visit-requests',vLoad);

  /* ================= ② 증빙 요청 ================= */
  var P=document.createElement('section'); P.id='view-proof-requests'; P.className='adm-view cr-view'; P.hidden=true;
  P.innerHTML='<header class="adm-head"><div><h1>증빙 요청</h1><p class="small muted">예약 고객이 나의 예약확인에서 보낸 세금계산서·현금영수증·견적서 요청입니다. 발행한 뒤 <b>처리 완료</b>로 바꾸고 안내를 남기면 고객 화면에 보입니다. 예약 자료는 바꾸지 않습니다.</p></div><button type="button" class="btn btn-light btn-sm" id="pr-reload">새로고침</button></header>'
    +'<div class="cr-tabs" role="tablist"><button type="button" data-s="requested" class="on">처리할 요청</button><button type="button" data-s="done">처리 완료</button><button type="button" data-s="all">전체</button></div>'
    +'<p class="small muted" id="pr-status" role="status"></p><div class="cr-list" id="pr-list"></div>';
  main.appendChild(P);
  var pq=function(s){ return P.querySelector(s); }, pStatus='requested', pItems=[];
  function pLoad(){
    pq('#pr-status').textContent='불러오는 중…';
    return X.A('/proof-requests?status='+pStatus).then(function(r){ pItems=r.items; navCount('proof-requests',r.counts.requested||0); pq('#pr-status').textContent='처리할 요청 '+(r.counts.requested||0)+'건';
      pq('#pr-list').innerHTML=pItems.length?pItems.map(function(x){ var d=x.data||{};
        var rows=[['예약',x.booking_code+(x.space?' · '+x.space:'')+(x.date?' · '+kd(x.date):'')],['종류',x.kind_label],['사업자등록번호',d.biz_no],['상호',d.company],['대표자',d.ceo],['받을 이메일',d.email],['현금영수증 번호',d.cash_no],['금액',d.amount_note],['요청 내용',d.note]].filter(function(r){ return r[1]; });
        return '<article class="adm-card cr-item" data-id="'+x.id+'"><div class="cr-item-top"><div><span class="cr-pill cr-'+esc(x.status)+'">'+esc(x.status_label)+'</span><h3>'+esc(x.kind_label)+' · '+esc(x.booking_code)+'</h3>'
          +'<dl class="cr-dl">'+rows.map(function(r){ return '<div><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd></div>'; }).join('')+'</dl>'
          +(x.admin_note?'<p class="small"><b>고객에게 보인 안내:</b> '+esc(x.admin_note)+'</p>':'')+'<p class="tiny muted">'+esc(x.ref)+' · 요청 '+esc(kst(x.created_at))+(x.done_at?' · 처리 '+esc(kst(x.done_at)):'')+'</p></div>'
          +'<div class="cr-acts">'+(x.status==='requested'?'<button type="button" class="btn btn-primary btn-sm" data-p="done">처리 완료</button><button type="button" class="btn btn-ghost btn-sm" data-p="cancelled">취소</button>':'<button type="button" class="btn btn-light btn-sm" data-p="requested">다시 열기</button>')+(d.biz_no?'<button type="button" class="btn btn-light btn-sm" data-copy="'+esc(d.biz_no)+'">사업자번호 복사</button>':'')+(d.email?'<button type="button" class="btn btn-light btn-sm" data-copy="'+esc(d.email)+'">이메일 복사</button>':'')+'</div></div></article>'; }).join('')
        :'<div class="adm-card"><p class="small muted">'+(pStatus==='requested'?'처리할 증빙 요청이 없습니다.':'기록이 없습니다.')+'</p></div>';
    }).catch(function(e){ pq('#pr-status').textContent='불러오지 못했습니다: '+(e&&e.message||''); });
  }
  P.addEventListener('click',function(e){
    var t=e.target.closest('.cr-tabs [data-s]'); if(t){ pStatus=t.dataset.s; P.querySelectorAll('.cr-tabs [data-s]').forEach(function(b){ b.classList.toggle('on',b===t); }); pLoad(); return; }
    var c=e.target.closest('[data-copy]'); if(c){ copy(c.dataset.copy); return; }
    var b=e.target.closest('[data-p]'); if(!b) return; var id=+b.closest('.cr-item').dataset.id, st=b.dataset.p, note='';
    if(st!=='requested'){ note=window.prompt(st==='done'?'고객에게 보일 처리 안내 (예: 11/25 세금계산서를 이메일로 발행했습니다)':'취소 사유 (고객에게 보임)',''); if(note===null) return; }
    X.A('/proof-requests/'+id,{method:'PATCH',body:{status:st,admin_note:note}}).then(function(){ M.toast('저장했습니다.'); pLoad(); }).catch(function(err){ M.toast(err.message); });
  });
  pq('#pr-reload').addEventListener('click',pLoad);
  X.register('proof-requests',pLoad);

  // 관리자 화면을 열면 두 메뉴의 숫자를 한 번 채웁니다
  setTimeout(function(){ if(!X.visible||!X.visible()) return; X.A('/visit-requests?view=open').then(function(r){ navCount('visit-requests',(r.counts.requested||0)+(r.counts.unread||0)); }).catch(function(){}); X.A('/proof-requests?status=requested').then(function(r){ navCount('proof-requests',r.counts.requested||0); }).catch(function(){}); },1500);
})();
