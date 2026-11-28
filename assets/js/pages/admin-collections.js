/* 관리자 · 수납 관리 (2026-11-26) — 새 메뉴 (예약·일정 → 수납 관리, view: collections)
   이용일 20~16일 전은 '사전고지', 15일 전부터 당일까지는 '완납 확인' 대상으로 묶어 남은 이용료를 챙깁니다.
   · 안내문: 사전고지·결제 요청·기한 지남·이용 후 미수 문구를 만들어 복사하거나 문자 앱으로 보냅니다. 보낸 뒤 [보낸 것으로 기록]
   · 수납 기록: 기존 '이용료 수납·정산' 창을 엽니다 (입금 기록·잔금 기한 변경은 그 창에서만)
   · 예외: 현장 결제·당일 결제·결제 일정 별도 협의는 '예외'로 표시하고 비고를 남깁니다 → 독촉 목록에서 빠집니다
   /api/admin/collections… 만 씁니다. 예약·수납 원장은 읽기만 합니다. 메뉴 버튼은 admin-navigation.js 가 붙입니다. */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var main=document.querySelector('.adm-main'); if(!main) return;
  var esc=X.esc;
  var TABS=[['todo','할 일 전체'],['notice','사전고지 · 20~16일 전'],['due','완납 확인 · 15일 전~당일'],['past','이용 후 미수'],['unpriced','금액 미정'],['exception','예외'],['paid','완납']];
  var V=document.createElement('section'); V.id='view-collections'; V.className='adm-view co-view'; V.hidden=true;
  V.innerHTML='<header class="adm-head"><div><h1>수납 관리</h1><p class="small muted">이용일 <b>20~16일 전</b>은 잔금 기한을 미리 알리는 사전고지 대상, <b>15일 전부터 당일까지</b>는 완납을 확인할 대상입니다. 입금은 [수납 기록]에서 남기면 남은 금액이 바로 바뀝니다. 현장 결제·당일 결제·일정 별도 협의는 [예외]로 표시해 주세요.</p></div>'
    +'<div class="co-head-acts"><button type="button" class="btn btn-light btn-sm" id="co-refresh">새로고침</button></div></header>'
    +'<div class="co-tiles" id="co-tiles"></div>'
    +'<div class="co-bar"><nav class="co-tabs" id="co-tabs" aria-label="수납 관리 묶음"></nav><input class="input co-search" id="co-q" type="search" placeholder="이름·단체·예약번호·연락처"></div>'
    +'<p class="small muted" id="co-status" role="status"></p><div class="co-list" id="co-list"></div>';
  main.appendChild(V);
  var q=function(s){ return V.querySelector(s); }, data=null, tab='todo', openPanel=null;
  function won(n){ return n==null?'—':Number(n).toLocaleString('ko-KR')+'원'; }
  var WD=['일','월','화','수','목','금','토'];
  function kd(d){ if(!d) return ''; var t=new Date(d+'T00:00:00Z'); return (t.getUTCMonth()+1)+'월 '+t.getUTCDate()+'일('+WD[t.getUTCDay()]+')'; }
  function md(d){ if(!d) return ''; var t=new Date(d+'T00:00:00Z'); return (t.getUTCMonth()+1)+'/'+t.getUTCDate()+'('+WD[t.getUTCDay()]+')'; }
  function hm(h){ if(h==null) return ''; var x=Number(h); return (x>=24?'다음 날 ':'')+('0'+Math.floor(x%24)).slice(-2)+':'+('0'+Math.round((x%1)*60)).slice(-2); }
  function kst(at){ var t=Date.parse(String(at||'').replace(' ','T')+'Z'); if(!isFinite(t)) return ''; var d=new Date(t+9*36e5); return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2); }
  function dlabel(d){ return d===0?'오늘 이용':d>0?'D-'+d:'이용 '+(-d)+'일 지남'; }
  function navCount(n){ var b=document.querySelector('#adm-nav button[data-view="collections"]'); if(!b) return; var em=b.querySelector('em.co-count'); if(!em){ em=document.createElement('em'); em.className='co-count'; b.appendChild(em); } em.textContent=n>0?String(n):''; em.hidden=!(n>0); }
  function inTab(x){
    if(tab==='todo') return ['notice','due','past','unpriced'].indexOf(x.bucket)>=0 && !(x.bucket==='notice' && noticeDone(x));
    return x.bucket===tab;
  }
  function noticeDone(x){ return !!x.last_notice || !!(x.auto_reminder && ['accepted','delivered','sending'].indexOf(x.auto_reminder.status)>=0); }
  var AUTO={queued:'발송 대기',sending:'보내는 중',accepted:'발송됨',delivered:'전달됨',unknown:'결과 확인 중',failed:'실패',cancelled:'취소됨',review:'확인 필요',held:'보류'};

  function load(){
    q('#co-status').textContent='불러오는 중…';
    return X.A('/collections').then(function(r){ data=r; navCount(r.counts.todo||0); draw(); })
      .catch(function(e){ if(!X.guard(e)) q('#co-status').textContent='불러오지 못했습니다: '+(e&&e.message||''); });
  }
  function draw(){
    var c=data.counts, t=data.totals;
    q('#co-tiles').innerHTML=[
      ['notice','사전고지',c.notice||0,'아직 안 알린 예약 '+(c.notice_todo||0)+'건',t.notice],
      ['due','완납 확인',c.due||0,'납부 기한 지남 '+(c.overdue||0)+'건',t.due],
      ['past','이용 후 미수',c.past||0,'최근 60일 이용분',t.past],
      ['unpriced','금액 미정',c.unpriced||0,'이용료부터 정해 주세요',null],
      ['exception','예외',c.exception||0,'독촉 목록에서 뺀 예약',null],
      ['paid','완납',c.paid||0,'20일 안에 이용할 예약',null]
    ].map(function(x){ return '<button type="button" class="co-tile co-t-'+x[0]+(tab===x[0]?' on':'')+'" data-tab="'+x[0]+'"><span>'+x[1]+'</span><b>'+x[2]+'<small>건</small></b><em>'+esc(x[3])+'</em>'+(x[4]?'<i>남은 금액 '+won(x[4])+'</i>':'')+'</button>'; }).join('');
    q('#co-tabs').innerHTML=TABS.map(function(x){ var n=x[0]==='todo'?(c.todo||0):(c[x[0]]||0); return '<button type="button" data-tab="'+x[0]+'" class="'+(tab===x[0]?'on':'')+'">'+esc(x[1])+' <b>'+n+'</b></button>'; }).join('');
    var kw=q('#co-q').value.trim().toLowerCase();
    var list=data.items.filter(inTab).filter(function(x){ return !kw||[x.name,x.org,x.code,x.phone,x.inquiry_ref].join(' ').toLowerCase().indexOf(kw)>=0; });
    list.sort(function(a,b){ var o={due:0,past:1,notice:2,unpriced:3,exception:4,paid:5}; return (o[a.bucket]-o[b.bucket])||(a.overdue===b.overdue?0:a.overdue?-1:1)||(a.date<b.date?-1:a.date>b.date?1:0); });
    q('#co-status').textContent='기준일 '+kd(data.today)+' · '+list.length+'건';
    q('#co-list').innerHTML=list.length?list.map(row).join(''):'<div class="adm-card"><p class="small muted">'+(tab==='todo'?'지금 챙길 수납 건이 없습니다.':'이 묶음에 해당하는 예약이 없습니다.')+'</p></div>';
    if(openPanel){ var el=q('[data-co="'+openPanel.code+'"]'); if(el) panel(el, openPanel.kind); else openPanel=null; }
  }
  function row(x){
    var due=x.bucket==='due'||x.bucket==='notice'?(x.overdue?'<span class="co-flag co-red">기한 '+md(x.due_date)+' 지남</span>':x.due_today?'<span class="co-flag co-amber">오늘 납부 기한</span>':'<span class="co-flag">납부 기한 '+md(x.due_date)+(x.due_custom?' · 조정됨':'')+'</span>'):'';
    var dep=x.deposit&&x.deposit.amount?(x.deposit.paid?'<span class="co-chip co-ok">보증금 확인</span>':x.deposit.method==='card'?'<span class="co-chip">보증금 카드</span>':'<span class="co-chip co-warn">보증금 미확인 '+won(x.deposit.amount)+'</span>'):'';
    var chips=[];
    if(x.auto_reminder) chips.push('<span class="co-chip">자동 잔금 알림톡 '+esc(AUTO[x.auto_reminder.status]||x.auto_reminder.status)+' '+esc(kst(x.auto_reminder.at))+'</span>');
    if(x.last_notice) chips.push('<span class="co-chip co-ok">고지 '+esc(kst(x.last_notice.at))+(x.last_notice.channel_label?' · '+esc(x.last_notice.channel_label):'')+'</span>');
    else if(x.bucket==='notice') chips.push('<span class="co-chip co-warn">사전고지 전</span>');
    if(x.ledger) chips.push(x.ledger.entries?'<span class="co-chip'+(x.ledger.balance>0?' co-warn':' co-ok')+'">수납 장부 받은 돈 '+won(x.ledger.received)+(x.ledger.balance>0?' · 남은 '+won(x.ledger.balance):x.ledger.balance===0?' · 완납':'')+'</span>':'<span class="co-chip">수납 장부 기록 없음</span>');
    if(x.last_request) chips.push('<span class="co-chip co-ok">결제 요청 '+esc(kst(x.last_request.at))+(x.last_request.channel_label?' · '+esc(x.last_request.channel_label):'')+'</span>');
    else if(x.bucket==='due'||x.bucket==='past') chips.push('<span class="co-chip co-warn">결제 요청 기록 없음</span>');
    var ex=x.exception?'<p class="co-ex"><b>예외 · '+esc(x.exception.type_label)+'</b>'+(x.exception.note?' — '+esc(x.exception.note):'')+' <span class="muted">('+esc(kst(x.exception.at))+')</span></p>':(x.note?'<p class="co-ex co-note">비고 — '+esc(x.note)+'</p>':'');
    return '<article class="adm-card co-row co-b-'+esc(x.bucket)+(x.overdue?' is-overdue':'')+'" data-co="'+esc(x.code)+'">'
      +'<div class="co-top"><span class="co-d'+(x.d<=0?' is-today':'')+'">'+esc(dlabel(x.d))+'</span><div class="co-who"><b>'+esc(x.name)+'</b>'+(x.org?' <span class="muted">'+esc(x.org)+'</span>':'')
      +'<p class="small muted">'+esc(kd(x.date))+' '+esc(hm(x.start_h))+'~'+esc(hm(x.end_h))+' · '+esc(x.space)+(x.headcount?' · '+esc(x.headcount)+'명':'')+' · '+esc(x.code)+' · <a href="tel:'+esc(x.phone)+'">'+esc(x.phone)+'</a></p></div>'
      +'<div class="co-money"><span>이용료 '+won(x.amount)+'</span><span>받은 금액 '+won(x.received)+'</span><b>'+(x.amount==null?'금액 미정':x.balance>0?'남은 금액 '+won(x.balance):'완납')+'</b></div></div>'
      +'<div class="co-mid">'+due+dep+chips.join('')+'</div>'+ex
      +'<div class="co-acts"><button type="button" class="btn '+(['notice','due','past'].indexOf(x.bucket)>=0?'btn-primary':'btn-light')+' btn-sm" data-act="msg">'+(x.bucket==='notice'?'사전고지 안내문':['due','past'].indexOf(x.bucket)>=0?'결제 요청 안내문':'안내문')+'</button>'
      +'<button type="button" class="btn btn-light btn-sm" data-ledger-code="'+esc(x.code)+'">수납 장부</button>'
      +'<button type="button" class="btn btn-light btn-sm" data-settlement-code="'+esc(x.code)+'">수납 기록 · 기한</button>'
      +'<button type="button" class="btn btn-light btn-sm" data-act="ex">'+(x.exception?'예외 수정':'예외')+'</button>'
      +'<button type="button" class="btn btn-light btn-sm" data-act="log">기록 남기기'+(x.history.length?' · '+x.history.length:'')+'</button></div>'
      +'<div class="co-panel" hidden></div></article>';
  }
  function msgKind(x){ return x.bucket==='notice'?'notice':x.bucket==='past'?'past':x.overdue?'overdue':'request'; }
  function message(x, kind){
    var bank=data.bank, who=x.name+'님', when=kd(x.date)+' '+hm(x.start_h)+'~'+hm(x.end_h)+' '+x.space, bal=won(x.balance), acct='· 입금 계좌: '+bank.name+' '+bank.account+' ('+bank.holder+')';
    var tail='\n\n예약 내용과 결제 현황은 megaspot.kr/my-booking/ 에서 이용일과 휴대폰 뒷 4자리로 확인하실 수 있습니다.\n감사합니다.';
    if(kind==='notice') return '[메가스팟] 이용료 잔금 안내\n\n'+who+', 안녕하세요. 메가스팟입니다.\n'+when+' 예약의 남은 이용료를 미리 안내드립니다.\n\n· 남은 이용료: '+bal+'\n· 납부 기한: '+kd(x.due_date)+'까지\n'+acct+'\n\n보증금은 이용료와 따로 안내드립니다.'+tail;
    if(kind==='request') return '[메가스팟] 이용료 결제 요청\n\n'+who+', 안녕하세요. 메가스팟입니다.\n'+when+' 이용일이 '+(x.d>0?x.d+'일 남아':'오늘이라')+' 남은 이용료 결제를 요청드립니다.\n\n· 남은 이용료: '+bal+'\n· 납부 기한: '+(x.due_today?'오늘('+kd(x.due_date)+')까지':kd(x.due_date)+'까지')+'\n'+acct+'\n\n입금하신 뒤 입금자명을 알려 주시면 바로 확인해 드리겠습니다. 다른 결제 방법이 필요하시면 말씀해 주세요.'+tail;
    if(kind==='overdue') return '[메가스팟] 이용료 입금 확인 요청\n\n'+who+', 안녕하세요. 메가스팟입니다.\n'+when+' 예약의 납부 기한('+kd(x.due_date)+')이 지났는데 남은 이용료 '+bal+'이 아직 확인되지 않아 연락드립니다.\n\n'+acct+'\n\n이미 입금하셨다면 입금자명과 입금일을 알려 주세요. 확인하고 바로 반영하겠습니다. 결제 일정 조정이 필요하시면 편하게 말씀해 주세요.'+tail;
    return '[메가스팟] 남은 이용료 안내\n\n'+who+', 안녕하세요. 메가스팟입니다.\n'+when+' 이용해 주셔서 감사합니다. 아직 남은 이용료 '+bal+'이 확인되지 않아 안내드립니다.\n\n'+acct+'\n\n이미 입금하셨다면 입금자명과 입금일을 알려 주세요. 확인하고 바로 반영하겠습니다.'+tail;
  }
  function chOpts(sel){ return Object.keys(data.options.channels).map(function(k){ return '<option value="'+k+'"'+(k===sel?' selected':'')+'>'+esc(data.options.channels[k])+'</option>'; }).join(''); }
  function panel(card, kind){
    var code=card.dataset.co, x=data.items.filter(function(i){ return i.code===code; })[0], p=card.querySelector('.co-panel'); if(!x) return;
    V.querySelectorAll('.co-panel').forEach(function(o){ if(o!==p){ o.hidden=true; o.innerHTML=''; } });
    openPanel={code:code, kind:kind}; p.hidden=false;
    if(kind==='msg'){
      var mk=msgKind(x);
      p.innerHTML='<div class="co-p-row"><label>안내문 종류<select class="select" data-f="mkind"><option value="notice">사전고지 (20~16일 전)</option><option value="request">결제 요청 (15일 전~)</option><option value="overdue">기한 지남</option><option value="past">이용 후 미수</option></select></label></div>'
        +'<textarea class="input co-msg" rows="12" data-f="text"></textarea>'
        +'<div class="co-p-acts"><button type="button" class="btn btn-light btn-sm" data-do="copy">안내문 복사</button><a class="btn btn-light btn-sm" data-do="sms" href="#">문자 앱으로 보내기</a><a class="btn btn-light btn-sm" href="https://center-pf.kakao.com/" target="_blank" rel="noopener">카카오톡 채널 관리자 ↗</a></div>'
        +'<div class="co-p-row co-p-rec"><span class="small">보낸 뒤 기록하면 목록에 표시됩니다</span><select class="select" data-f="channel">'+chOpts('kakao')+'</select><button type="button" class="btn btn-primary btn-sm" data-do="sent">보낸 것으로 기록</button></div>';
      var sel=p.querySelector('[data-f=mkind]'), ta=p.querySelector('[data-f=text]'), sms=p.querySelector('[data-do=sms]');
      sel.value=mk; var fill=function(){ ta.value=message(x, sel.value); upd(); }, upd=function(){ sms.href='sms:'+String(x.phone||'').replace(/[^\d]/g,'')+'?&body='+encodeURIComponent(ta.value); };
      sel.addEventListener('change',fill); ta.addEventListener('input',upd); fill();
      if(x.amount==null) ta.value='이용료가 아직 정해지지 않았습니다. [수납 기록 · 기한] 또는 예약 확정서에서 금액을 먼저 정해 주세요.';
      p.querySelector('[data-do=copy]').addEventListener('click',function(){ var t=ta.value; (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast('안내문을 복사했습니다.'); }).catch(function(){ ta.select(); try{ document.execCommand('copy'); M.toast('안내문을 복사했습니다.'); }catch(e){} }); });
      p.querySelector('[data-do=sent]').addEventListener('click',function(){ var k=sel.value==='notice'?'notice':'request', b=this; b.disabled=true;
        save(code,'logs',{kind:k, channel:p.querySelector('[data-f=channel]').value, memo:{notice:'사전고지',request:'결제 요청',overdue:'기한 지남 안내',past:'이용 후 미수 안내'}[sel.value], balance:x.balance}).then(function(){ M.toast('기록했습니다.'); openPanel=null; return load(); }).catch(function(){ b.disabled=false; }); });
    }
    if(kind==='ex'){
      var e=x.exception||{}, types=data.options.exception_types;
      p.innerHTML='<label class="chk co-ex-on"><input type="checkbox" data-f="on"'+(x.exception?' checked':'')+'> <b>예외로 표시</b> <small>독촉 목록에서 빼고 예외 묶음에 둡니다</small></label>'
        +'<div class="co-types">'+Object.keys(types).map(function(k){ return '<label class="chk"><input type="radio" name="co-type-'+esc(code)+'" value="'+k+'"'+((e.type||'onsite')===k?' checked':'')+'> '+esc(types[k])+'</label>'; }).join('')+'</div>'
        +'<label class="co-lab">비고 <small>예: 행사 당일 현장에서 카드 결제 · 12/20까지 법인 결제 예정</small><textarea class="input" rows="3" maxlength="300" data-f="note">'+esc(x.note||'')+'</textarea></label>'
        +'<div class="co-p-acts"><button type="button" class="btn btn-primary btn-sm" data-do="save">저장</button><button type="button" class="btn btn-light btn-sm" data-do="close">닫기</button></div>';
      p.querySelector('[data-do=save]').addEventListener('click',function(){ var b=this, on=p.querySelector('[data-f=on]').checked, t=(p.querySelector('input[type=radio]:checked')||{}).value||'other';
        b.disabled=true; save(code,'exception',{exception:on, type:t, note:p.querySelector('[data-f=note]').value, balance:x.balance}).then(function(){ M.toast(on?'예외로 표시했습니다.':'예외를 해제했습니다.'); openPanel=null; return load(); }).catch(function(){ b.disabled=false; }); });
      p.querySelector('[data-do=close]').addEventListener('click',function(){ p.hidden=true; p.innerHTML=''; openPanel=null; });
    }
    if(kind==='log'){
      var kinds=data.options.log_kinds;
      p.innerHTML='<div class="co-p-row"><label>종류<select class="select" data-f="kind">'+['check','notice','request','memo'].map(function(k){ return '<option value="'+k+'">'+esc(kinds[k])+'</option>'; }).join('')+'</select></label><label>연락 방법<select class="select" data-f="channel"><option value="">—</option>'+chOpts('')+'</select></label></div>'
        +'<label class="co-lab">내용<input class="input" maxlength="300" data-f="memo" placeholder="예: 11/27 입금 예정이라고 답변 · 입금자명 홍길동(주)"></label>'
        +'<div class="co-p-acts"><button type="button" class="btn btn-primary btn-sm" data-do="save">기록</button><button type="button" class="btn btn-light btn-sm" data-do="close">닫기</button></div>'
        +(x.history.length?'<ol class="co-hist">'+x.history.map(function(h){ return '<li><b>'+esc(h.kind_label)+'</b>'+(h.channel_label?' · '+esc(h.channel_label):'')+(h.memo?' — '+esc(h.memo):'')+(h.balance!=null?' <span class="muted">(남은 금액 '+won(h.balance)+')</span>':'')+' <span class="muted">'+esc(kst(h.at))+'</span></li>'; }).join('')+'</ol>':'<p class="small muted">아직 기록이 없습니다.</p>')
        +'<p class="tiny muted">입금 자체는 [수납 기록 · 기한]에서 남겨야 남은 금액이 바뀝니다. 여기 기록은 연락·확인 메모입니다.</p>';
      p.querySelector('[data-do=save]').addEventListener('click',function(){ var b=this; b.disabled=true;
        save(code,'logs',{kind:p.querySelector('[data-f=kind]').value, channel:p.querySelector('[data-f=channel]').value, memo:p.querySelector('[data-f=memo]').value, balance:x.balance}).then(function(){ M.toast('기록했습니다.'); return load(); }).catch(function(){ b.disabled=false; }); });
      p.querySelector('[data-do=close]').addEventListener('click',function(){ p.hidden=true; p.innerHTML=''; openPanel=null; });
    }
  }
  function save(code, what, body){ return X.A('/collections/'+encodeURIComponent(code)+'/'+what,{method:'POST',body:body}).catch(function(e){ if(!X.guard(e)) M.toast(e.message||'저장하지 못했습니다.'); throw e; }); }

  V.addEventListener('click',function(e){
    var t=e.target.closest('[data-tab]'); if(t){ tab=t.dataset.tab; openPanel=null; draw(); return; }
    var a=e.target.closest('[data-act]'); if(a){ var card=a.closest('[data-co]'), p=card.querySelector('.co-panel'); if(!p.hidden&&openPanel&&openPanel.code===card.dataset.co&&openPanel.kind===a.dataset.act){ p.hidden=true; p.innerHTML=''; openPanel=null; return; } panel(card, a.dataset.act); }
  });
  q('#co-q').addEventListener('input',function(){ if(data) draw(); });
  q('#co-refresh').addEventListener('click',load);
  // 수납·정산 창을 닫으면 남은 금액을 다시 읽습니다
  document.addEventListener('close',function(e){ if(e.target&&e.target.id==='payment-dialog'&&!V.hidden) load(); },true);
  X.register('collections',load);
  setTimeout(function(){ if(X.visible&&!X.visible()) return; X.A('/collections').then(function(r){ navCount(r.counts.todo||0); }).catch(function(){}); },1800);
})();
