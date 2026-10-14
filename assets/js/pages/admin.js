/* 메가스팟 관리자 화면 — 로그인 · 대시보드 · 문의 · 견적 계산 · 예약 · 일정 · 후기 · 회원 · 입점 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc, E=window.MEGASPOT_PRICE, D=E&&E.data();
  function A(path, opts){ return M.api('/admin'+path, opts||{}); }
  var STATUSES=['문의 접수','조건 확인','견적 발송','결제 대기','예약 확정','이용 완료','취소·환불'];
  var ST_CLS={'문의 접수':'st-new','조건 확인':'st-check','견적 발송':'st-quote','결제 대기':'st-pay','예약 확정':'st-ok','이용 완료':'st-done','취소·환불':'st-cancel'};
  var TYPE={event:'행사 대관',regular:'정기·반복',partner:'제휴·협력'};
  var OPTL={manager:'현장 매니저',cleaning:'뒷정리·청소',disposable:'1회용 세트',banner:'현수막',xbanner:'X배너'};
  function timeText(d,sep){ if(d.start_h&&d.end_h){ var hl=function(h){ return (h>=24?'다음 날 ':'')+('0'+(h%24)).slice(-2)+':00'; }; return hl(+d.start_h)+sep+hl(+d.end_h)+' ('+(d.end_h-d.start_h)+'시간)'; } return d.t_start&&d.t_end?d.t_start+sep+d.t_end:(SLOT[d.slot]||''); }
  function optText(o){ if(!o||typeof o!=='object') return ''; return Object.keys(o).filter(function(k){ return o[k]; }).map(function(k){ var v=o[k]; return (OPTL[k]||k)+(v&&typeof v==='object'?' '+(v.count||1)+'명 × '+(v.hours||'')+'시간':''); }).join(', '); }
  var CH={web:'홈페이지',kakao:'카카오톡',phone:'전화',email:'이메일',visit:'방문',other:'기타'};
  var SLOT={'pkg-day':'낮 패키지 10–17시','pkg-allday':'올데이 10–24시','pkg-allnight':'올나잇 18–07시',morning:'아침 07–12시',day:'낮 12–17시',evening:'저녁 17–24시',custom:'직접 입력',am:'오전',pm:'오후',ev:'저녁',ampm:'주간',pmev:'오후~저녁'};
  var SLOT_H={'pkg-day':[10,17],'pkg-allday':[10,24],'pkg-allnight':[18,31],morning:[7,12],day:[12,17],evening:[17,24],am:[9,13],pm:[13,18],ev:[18,23],ampm:[9,18],pmev:[14,23]};
  var CHECKS=[['available','일정 가능 여부 확인'],['quote_sent','견적 안내'],['deposit_paid','예약금 입금 확인'],['guarantee_paid','보증금 입금 확인'],['guide_sent','현장 안내 발송 (입장·주차·반입)'],['checkin','이용 당일 체크인'],['guarantee_returned','보증금 반환'],['review_asked','후기 요청']];
  var PUR={}; (window.MEGASPOT_PURPOSES||[]).forEach(function(p){ PUR[p.id]=p.label; });
  var spaces=window.MEGASPOT_SPACES||[];
  var won=function(n){ return (E?E.won(n):(Number(n||0).toLocaleString('ko-KR')+'원')); };
  var man=function(n){ return E?E.man(n):won(n); };
  function todayIso(){ var d=new Date(Date.now()+9*3600e3); return d.toISOString().slice(0,10); }
  function ago(ts){ if(!ts) return ''; var t=Date.parse(String(ts).replace(' ','T')+'Z'); if(!t) return ''; var h=Math.floor((Date.now()-t)/36e5); if(h<1) return '방금'; if(h<24) return h+'시간 전'; var d=Math.floor(h/24); return d+'일 전'; }
  function hoursSince(ts){ var t=Date.parse(String(ts||'').replace(' ','T')+'Z'); return t?(Date.now()-t)/36e5:0; }
  function stBadge(s){ return '<span class="st '+(ST_CLS[s]||'')+'">'+esc(s)+'</span>'; }
  function kd(iso){ return iso?M.fmtKDate(iso):'날짜 미정'; }
  function note(el, msg, ok){ el.textContent=msg; el.hidden=false; el.classList.toggle('ok',!!ok); }
  function purOptions(sel){ return '<option value="">선택 안 함</option>'+(window.MEGASPOT_PURPOSES||[]).map(function(p){ return '<option value="'+p.id+'"'+(p.id===sel?' selected':'')+'>'+esc(p.label)+'</option>'; }).join('')+'<option value="other"'+(sel==='other'?' selected':'')+'>기타</option>'; }

  /* =================== 로그인 =================== */
  var app=$('#adm-app'), login=$('#adm-login');
  function showApp(){ login.hidden=true; app.hidden=false; document.body.classList.add('adm-on'); go(location.hash.replace('#','')||'dash'); }
  function showLogin(msg){ app.hidden=true; login.hidden=false; document.body.classList.remove('adm-on'); if(msg){ var m=$('#adm-login-msg'); m.innerHTML=msg; m.hidden=false; } setTimeout(function(){ $('#adm-key').focus(); },50); }
  function loginErr(e){
    if(e.code==='NO_API') return '서버(데이터베이스)에 연결되지 않았습니다. Cloudflare Pages <b>Settings → Bindings</b>에 D1 데이터베이스가 <code>DB</code> 이름으로 연결되어 있는지, 연결 뒤 <b>다시 배포</b>했는지 확인해 주세요.';
    if(e.code==='NO_ADMIN_KEY') return 'Cloudflare에 관리자 비밀번호가 아직 없습니다. Pages 프로젝트 <b>Settings → Variables and secrets → Add</b>에서 이름 <code>ADMIN_KEY</code>, 종류 <b>Secret</b>으로 비밀번호를 저장하고 <b>Deployments → Retry deployment</b>로 다시 배포해 주세요.';
    return esc(e.message||'로그인하지 못했습니다.');
  }
  A('/ping').then(showApp).catch(function(e){ showLogin(e.code==='ADMIN_LOGIN'||e.status===401?'':loginErr(e)); });
  $('#adm-login-form').addEventListener('submit', function(ev){
    ev.preventDefault(); var k=$('#adm-key').value.trim(), m=$('#adm-login-msg'); m.hidden=true;
    if(!k){ m.textContent='관리자 비밀번호를 입력하세요.'; m.hidden=false; return; }
    var b=$('#adm-login-btn'); b.disabled=true; b.textContent='확인 중…';
    A('/login',{method:'POST', body:{key:k, remember:$('#adm-remember').checked}}).then(function(){ $('#adm-key').value=''; showApp(); })
    .catch(function(e){ m.innerHTML=loginErr(e); m.hidden=false; }).finally(function(){ b.disabled=false; b.textContent='로그인'; });
  });
  $('#adm-logout').addEventListener('click', function(){ A('/logout',{method:'POST', body:{}}).catch(function(){}).then(function(){ location.hash=''; showLogin(''); }); });
  function guard(e){ if(e && (e.code==='ADMIN_LOGIN'||e.status===401)){ showLogin('로그인이 만료되었습니다. 다시 로그인해 주세요.'); return true; } return false; }
  function fail(box){ return function(e){ if(guard(e)) return; box.innerHTML='<div class="empty">'+esc(e.message||'불러오지 못했습니다.')+'</div>'; }; }

  /* =================== 화면 전환 =================== */
  var LOAD={ dash:loadDash, inq:loadInq, quote:function(){ calc(); loadRecentQuotes(); }, orders:loadOrders, bookings:loadBookings, calendar:loadCalendar, reviews:loadReviews, members:loadMembers, hosts:loadHosts };
  function go(v){
    if(!LOAD[v]) v='dash';
    $$('.adm-view').forEach(function(s){ s.hidden = s.id!=='view-'+v; });
    $$('#adm-nav button').forEach(function(b){ b.classList.toggle('on', b.dataset.view===v); });
    if(location.hash!=='#'+v) history.replaceState(null,'','#'+v);
    window.scrollTo(0,0); LOAD[v]();
  }
  $('#adm-nav').addEventListener('click', function(e){ var b=e.target.closest('button[data-view]'); if(b) go(b.dataset.view); });
  document.addEventListener('click', function(e){
    var g=e.target.closest('[data-go]'); if(g){ e.preventDefault(); var t=g.dataset.go; if(t==='inq-new') openNew(); else if(t.indexOf('inq:')===0){ $('#inq-status').value=t.slice(4); go('inq'); } else go(t); return; }
    var r=e.target.closest('[data-ref]'); if(r && !e.target.closest('select,input,button,a')){ openInquiry(r.dataset.ref); }
  });

  /* =================== 대시보드 =================== */
  function row(it, extra){
    var late = it.status==='문의 접수' && hoursSince(it.created_at)>=24;
    var when=[kd(it.event_date), it.headcount?it.headcount+'명':'', PUR[it.purpose]||''].filter(Boolean).join(' · ');
    return '<div class="adm-row" data-ref="'+esc(it.ref)+'" tabindex="0"><div class="r1"><b>'+esc(it.name||'(이름 없음)')+'</b>'+(it.reserve?'<span class="tag-rv">예약 신청</span>':'')+(it.channel&&it.channel!=='web'?'<span class="tag-ch">'+esc(CH[it.channel]||it.channel)+'</span>':'')+stBadge(it.status)+'</div><div class="r2">'+esc(when)+(it.quote_total?' · 견적 <b>'+esc(man(it.quote_total))+'</b>':(it.est_total?' · 예상 <b>'+esc(man(it.est_total))+'</b>':''))+'</div><div class="r3"><span>'+esc(it.ref)+'</span><span class="'+(late?'late':'')+'">'+esc(extra||('접수 '+ago(it.created_at)))+'</span></div></div>';
  }
  function emptyMsg(t){ return '<div class="empty small">'+esc(t)+'</div>'; }
  function loadDash(){
    A('/dashboard').then(function(d){
      var c=d.counts||{};
      $('#dash-date').textContent=E?E.kdateY(d.today)+' 기준':d.today;
      var k=[['문의 접수','새 문의','inq:문의 접수'],['조건 확인','조건 확인 중','inq:조건 확인'],['견적 발송','견적 발송','inq:견적 발송'],['결제 대기','결제 대기','inq:결제 대기']];
      $('#dash-kpis').innerHTML=k.map(function(x){ return '<button type="button" class="kpi'+(x[0]==='문의 접수'&&c[x[0]]?' hot':'')+'" data-go="'+x[2]+'"><small>'+x[1]+'</small><b>'+(c[x[0]]||0)+'</b></button>'; }).join('')
        +'<button type="button" class="kpi" data-go="bookings"><small>다가오는 예약 (14일)</small><b>'+(d.upcoming_count||0)+'</b></button>'
        +'<button type="button" class="kpi'+(d.reviews_pending?' hot':'')+'" data-go="reviews"><small>후기 승인 대기</small><b>'+(d.reviews_pending||0)+'</b></button>'
        +'<button type="button" class="kpi" data-go="members"><small>회원 (최근 7일 +'+(d.members_new||0)+')</small><b>'+(d.members||0)+'</b></button>'
        +'<button type="button" class="kpi" data-go="hosts"><small>입점 문의 (최근 7일)</small><b>'+(d.hosts_new||0)+'</b></button>';
      setCount('inq', c['문의 접수']); setCount('reviews', d.reviews_pending); setCount('orders', d.orders_today_paid);
      $('#dash-todo').innerHTML=(d.todo||[]).length?d.todo.map(function(i){ return row(i); }).join(''):emptyMsg('새로 들어온 문의가 없습니다.');
      $('#dash-follow').innerHTML=(d.followup||[]).length?d.followup.map(function(i){ return row(i, '마지막 변경 '+ago(i.updated_at||i.created_at)); }).join(''):emptyMsg('연락이 밀린 견적이 없습니다.');
      $('#dash-soon').innerHTML=(d.soon||[]).length?d.soon.map(function(i){ var dd=E?E.diffDays(d.today,i.event_date):''; return row(i, (dd===0?'오늘':'D-'+dd)+' · 아직 '+i.status); }).join(''):emptyMsg('14일 안에 미확정인 행사가 없습니다.');
      $('#dash-upcoming').innerHTML=(d.upcoming||[]).length?d.upcoming.map(function(b){ var dd=E?E.diffDays(d.today,b.date):''; return '<div class="adm-row"'+(b.inquiry_ref?' data-ref="'+esc(b.inquiry_ref)+'"':'')+'><div class="r1"><b>'+esc(b.customer_name)+'</b><span class="st st-ok">'+(dd===0?'오늘':'D-'+dd)+'</span></div><div class="r2">'+esc(kd(b.date))+' · '+esc(SLOT[b.slot]||b.slot||'')+(b.headcount?' · '+b.headcount+'명':'')+'</div><div class="r3"><span>'+esc(b.booking_code)+'</span><a href="tel:'+esc(b.phone)+'">'+esc(b.phone)+'</a></div></div>'; }).join(''):emptyMsg('14일 안에 잡힌 예약이 없습니다.');
      var mo=d.month||{};
      $('#dash-orders').innerHTML=(d.orders_recent||[]).length?d.orders_recent.map(function(o){ return orderRow(o); }).join(''):emptyMsg('온라인 결제 주문이 아직 없습니다.');
      $('#dash-month').innerHTML='<div><small>이번 달 온라인 결제</small><b>'+(mo.orders_paid||0)+'<em>건 · '+esc(man(mo.orders_amount||0))+'</em></b></div><div><small>이번 달 들어온 문의</small><b>'+(mo.inquiries||0)+'<em>건</em></b></div><div><small>이번 달 이용 확정</small><b>'+(mo.confirmed||0)+'<em>건</em></b></div><div><small>이번 달 확정 금액</small><b>'+esc(man(mo.confirmed_amount||0))+'</b></div><div><small>견적 발송·결제 대기 금액</small><b>'+esc(man(mo.quoted_amount||0))+'</b></div>';
    }).catch(fail($('#dash-todo')));
  }
  function setCount(k,n){ var el=$('[data-count="'+k+'"]'); if(!el) return; el.textContent=n||''; el.hidden=!n; }
  $('#dash-reload').addEventListener('click', loadDash);

  /* =================== 문의 목록 =================== */
  var inqCache=[];
  function loadInq(){
    var box=$('#inq-list'); box.innerHTML='<div class="empty small">불러오는 중…</div>';
    A('/inquiries?status='+encodeURIComponent($('#inq-status').value)+'&type='+encodeURIComponent($('#inq-type').value)+'&q='+encodeURIComponent($('#inq-q').value.trim())).then(function(r){
      inqCache=r.items||[];
      if(!inqCache.length){ box.innerHTML='<div class="empty"><b>표시할 문의가 없습니다</b></div>'; return; }
      box.innerHTML='<div class="tr th"><span>문의</span><span>고객</span><span>행사 조건</span><span>상태</span><span>견적</span></div>'+inqCache.map(function(it){
        var d=it.data||{}, late=it.status==='문의 접수'&&hoursSince(it.created_at)>=24;
        var time=timeText(d,'–');
        return '<div class="tr" data-ref="'+esc(it.ref)+'" tabindex="0"><span><b class="ref">'+esc(it.ref)+'</b><small class="'+(late?'late':'')+'">'+esc(String(it.created_at||'').slice(5,16))+' · '+ago(it.created_at)+'</small></span>'
          +'<span><b>'+esc(d.name||it.name||'')+'</b>'+(d.reserve?' <span class="tag-rv">예약 신청</span>':'')+'<small>'+esc(d.phone||it.phone||'')+'</small><small>'+esc(TYPE[d.inquiry_type]||'행사 대관')+(d.channel&&d.channel!=='web'?' · '+esc(CH[d.channel]):'')+(d.member_id?' · 회원':'')+'</small></span>'
          +'<span>'+(d.inquiry_type==='partner'?esc(d.org||'제휴 제안'):esc(kd(d.date||it.event_date)))+'<small>'+esc([time, (d.headcount||it.headcount)?(d.headcount||it.headcount)+'명':'', PUR[d.purpose]||''].filter(Boolean).join(' · '))+'</small></span>'
          +'<span>'+stBadge(it.status)+'</span>'
          +'<span>'+(it.quote_total?'<b>'+esc(man(it.quote_total))+'</b><small>저장한 견적</small>':(d.total?'<b>'+esc(man(d.total))+'</b><small>고객이 확인한 예상 금액</small>':(d.estimate?'<small>고객 예상 금액 첨부</small>':'<small>—</small>')))+'</span></div>';
      }).join('');
    }).catch(fail(box));
  }
  $('#inq-reload').addEventListener('click', loadInq); $('#inq-status').addEventListener('change', loadInq); $('#inq-type').addEventListener('change', loadInq);
  $('#inq-q').addEventListener('keydown', function(e){ if(e.key==='Enter') loadInq(); });
  $('#inq-csv').addEventListener('click', function(){
    if(!inqCache.length){ M.toast('내려받을 문의가 없습니다. 먼저 목록을 불러오세요.'); return; }
    var cols=['문의번호','접수일시','상태','구분','유형','경로','이름','연락처','이메일','행사일','시작','종료','인원','목적','저장 견적(원)','회원','운영 메모'];
    var rows=inqCache.map(function(it){ var d=it.data||{}; return [it.ref,it.created_at,it.status,d.reserve?'예약 신청':'문의',TYPE[d.inquiry_type]||'행사 대관',CH[d.channel||'web'],d.name||it.name,d.phone||it.phone,d.email||it.email,d.date||it.event_date||'',d.t_start||'',d.t_end||'',d.headcount||it.headcount||'',PUR[d.purpose]||d.purpose||'',it.quote_total||'',d.member_id?'Y':'',it.memo||'']; });
    var csv='﻿'+[cols].concat(rows).map(function(r){ return r.map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(','); }).join('\r\n');
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='메가스팟_문의_'+todayIso()+'.csv'; document.body.appendChild(a); a.click(); a.remove();
  });

  /* =================== 패널 공통 =================== */
  function openDrawer(id){ var d=$(id); d.hidden=false; document.body.classList.add('adm-lock'); }
  function closeDrawer(d){ d.hidden=true; if(!$$('.adm-drawer').some(function(x){ return !x.hidden; })) document.body.classList.remove('adm-lock'); }
  $$('.adm-drawer').forEach(function(d){ d.addEventListener('click', function(e){ if(e.target.closest('[data-close]')) closeDrawer(d); }); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') $$('.adm-drawer').forEach(function(d){ if(!d.hidden) closeDrawer(d); }); });

  /* =================== 문의 상세 =================== */
  var cur=null;
  function openInquiry(ref){
    openDrawer('#adm-drawer'); var body=$('#dr-body'); body.innerHTML='<div class="empty small">불러오는 중…</div>'; $('#dr-title').textContent=ref;
    A('/inquiries/'+encodeURIComponent(ref)).then(function(r){ cur=r; renderDetail(); }).catch(fail(body));
  }
  function kv(k,v){ return v?'<div class="kv"><span>'+esc(k)+'</span><b>'+v+'</b></div>':''; }
  function renderDetail(){
    var it=cur.item, d=it.data||{}, ch=cur.checks||{};
    var time=timeText(d,' – ');
    var needs=(d.needs||[]).join(', ');
    $('#dr-title').textContent=it.ref+' · '+(d.name||it.name||'');
    var tel=(d.phone||it.phone||'').replace(/[^0-9+]/g,'');
    $('#dr-body').innerHTML=
      '<div class="dr-top"><select class="select" id="dr-status">'+STATUSES.map(function(s){ return '<option'+(s===it.status?' selected':'')+'>'+s+'</option>'; }).join('')+'</select>'
      +'<span class="small muted">접수 '+esc(String(it.created_at||'').slice(0,16))+' · '+esc(CH[d.channel||'web'])+(d.member_id?' · 회원 '+esc(d.member_email||''):'')+'</span></div>'
      +'<div class="dr-actions"><button class="btn btn-primary btn-sm" type="button" id="dr-quote">이 문의로 견적 계산 →</button>'
      +(tel?'<a class="btn btn-light btn-sm" href="tel:'+esc(tel)+'">전화</a><a class="btn btn-light btn-sm" href="sms:'+esc(tel)+'">문자</a>':'')
      +((d.email||it.email)?'<a class="btn btn-light btn-sm" href="mailto:'+esc(d.email||it.email)+'?subject='+encodeURIComponent('[메가스팟 건대] 문의 '+it.ref+' 안내')+'">이메일</a>':'')
      +'<button class="btn btn-light btn-sm" type="button" id="dr-book">예약 확정 등록</button></div>'
      +'<div class="dr-sec"><h3>고객</h3>'+kv('이름·소속',esc(d.name||it.name||''))+kv('연락처',esc(d.phone||it.phone||''))+kv('이메일',esc(d.email||it.email||''))+kv('선호 연락',esc({kakao:'카카오톡',phone:'전화',sms:'문자',email:'이메일'}[d.contact_pref]||d.contact_pref||''))+kv('회사·단체',esc(d.org||''))+'</div>'
      +(d.reserve?'<div class="notice" style="margin-bottom:12px"><div><b>홈페이지에서 금액을 확인하고 예약을 신청한 건입니다.</b>'+(d.total?' 고객이 본 예상 금액은 <b>'+esc(won(d.total))+'</b>'+(d.pkg?' ('+esc({day:'낮 패키지',allday:'올데이 패키지',allnight:'올나잇 패키지'}[d.pkg]||d.pkg)+')':'')+'입니다.':'')+' 일정이 비어 있으면 금액을 확인해 결제 방법을 안내하고, 입금·결제가 끝나면 \'예약 확정 등록\'을 눌러 주세요.</div></div>':'')
      +'<div class="dr-sec"><h3>행사 조건</h3>'+kv('구분',d.reserve?'<b>예약 신청</b>':'문의')+kv('유형',esc(TYPE[d.inquiry_type]||'행사 대관'))+kv('목적',esc(PUR[d.purpose]||d.purpose||''))+kv('이용일',esc(d.date?kd(d.date):'')+(d.date_alt?' <small>(대체 '+esc(kd(d.date_alt))+')</small>':''))+kv('시간',esc(time))+kv('준비 입장·퇴장',esc([d.t_setup,d.t_out].filter(Boolean).join(' / ')))+kv('인원',esc(d.headcount?d.headcount+'명':''))+kv('배치',esc(d.layout||''))+kv('필요한 것',esc(needs))+kv('음식·연출',esc(d.food_fx||''))+kv('예산',esc(d.budget||''))+kv('반복 일정',esc([d.repeat_cycle,d.repeat_period,d.repeat_days].filter(Boolean).join(' · ')))+kv('서류',esc((d.docs||[]).join(', ')))+kv('제휴 형태',esc(d.partner_kind||''))+kv('선택 옵션',esc(optText(d.options)))
      +(d.message?'<div class="dr-msg">'+esc(d.message)+'</div>':'')+'</div>'
      +(d.estimate?'<details class="dr-sec"><summary><h3 style="display:inline">고객이 보낸 예상 금액</h3></summary><pre class="dr-pre">'+esc(d.estimate)+'</pre></details>':'')
      +'<div class="dr-sec"><h3>진행 체크리스트</h3><div class="dr-checks">'+CHECKS.map(function(c){ var v=ch[c[0]]; return '<label class="chk"><input type="checkbox" data-chk="'+c[0]+'"'+(v?' checked':'')+'> '+esc(c[1])+(v&&typeof v==='string'?' <small>'+esc(v.slice(5,16))+'</small>':'')+'</label>'; }).join('')+'</div></div>'
      +'<div class="dr-sec"><h3>저장한 견적</h3>'+((cur.quotes||[]).length?cur.quotes.map(function(q){ return '<div class="dr-quote"><div><b>'+esc(q.quote_no)+'</b> <span class="small muted">'+esc(String(q.created_at).slice(0,16))+'</span></div><b>'+esc(won(q.total))+'</b><button class="btn btn-light btn-sm" type="button" data-openq="'+esc(q.quote_no)+'">열기</button></div>'; }).join(''):'<p class="small muted">아직 저장한 견적이 없습니다.</p>')+'</div>'
      +((cur.bookings||[]).length?'<div class="dr-sec"><h3>연결된 예약</h3>'+cur.bookings.map(function(b){ return '<div class="small">'+esc(b.booking_code)+' · '+esc(kd(b.date))+' · '+esc({confirmed:'예약 확정',completed:'이용 완료',cancelled:'취소'}[b.status]||b.status)+'</div>'; }).join('')+'</div>':'')
      +'<div class="dr-sec"><h3>운영 메모</h3><textarea class="textarea" id="dr-memo" style="min-height:90px" placeholder="통화 내용, 확정 금액, 특이사항">'+esc(it.memo||'')+'</textarea><button class="btn btn-light btn-sm mt-1" type="button" id="dr-memo-save">메모 저장</button></div>'
      +'<details class="dr-sec"><summary><h3 style="display:inline">문의 원문 · 변경 기록</h3></summary><pre class="dr-pre">'+esc(d.summary||'')+'</pre>'+((cur.log||[]).map(function(l){ return '<div class="tiny muted">'+esc(String(l.created_at).slice(0,16))+' · '+esc(l.kind)+' · '+esc(l.actor)+'</div>'; }).join(''))+'</details>';
    $('#dr-status').addEventListener('change', function(){ var v=this.value; A('/inquiries/'+it.ref,{method:'PATCH', body:{status:v}}).then(function(){ it.status=v; M.toast('상태를 "'+v+'"(으)로 바꿨습니다.'); refreshLists(); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); });
    $('#dr-memo-save').addEventListener('click', function(){ var v=$('#dr-memo').value; A('/inquiries/'+it.ref,{method:'PATCH', body:{memo:v}}).then(function(){ it.memo=v; M.toast('메모를 저장했습니다.'); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); });
    $$('#dr-body [data-chk]').forEach(function(cb){ cb.addEventListener('change', function(){ var o={}; $$('#dr-body [data-chk]').forEach(function(x){ o[x.dataset.chk]=x.checked; }); A('/inquiries/'+it.ref+'/checks',{method:'PUT', body:{checks:o}}).then(function(r){ cur.checks=r.checks; M.toast('체크리스트를 저장했습니다.'); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); }); });
    $('#dr-quote').addEventListener('click', function(){ quoteFromInquiry(cur.item); closeDrawer($('#adm-drawer')); go('quote'); });
    $('#dr-book').addEventListener('click', function(){ bookingFromInquiry(cur.item); closeDrawer($('#adm-drawer')); go('bookings'); });
    $$('#dr-body [data-openq]').forEach(function(b){ b.addEventListener('click', function(){ var q=(cur.quotes||[]).filter(function(x){ return x.quote_no===b.dataset.openq; })[0]; if(q){ loadSavedQuote(q, cur.item.ref); closeDrawer($('#adm-drawer')); go('quote'); } }); });
  }
  function refreshLists(){ if(!$('#view-inq').hidden) loadInq(); if(!$('#view-dash').hidden) loadDash(); }

  /* =================== 문의 직접 등록 =================== */
  $('#nw-purpose').innerHTML=purOptions('');
  function openNew(){ $('#nw-form').reset(); $('#nw-msg').hidden=true; openDrawer('#adm-new'); }
  $('#nw-form').addEventListener('submit', function(e){
    e.preventDefault(); var f=e.target; if(!M.validate(f)) return; var d=M.formData(f);
    A('/inquiries',{method:'POST', body:d}).then(function(r){ closeDrawer($('#adm-new')); M.toast('문의 '+r.ref+'을(를) 등록했습니다.'); refreshLists(); openInquiry(r.ref); })
    .catch(function(x){ if(!guard(x)) note($('#nw-msg'), x.message); });
  });

  /* =================== 견적 계산 =================== */
  var Q;
  function blankQ(){ return { ref:'', customer:'', phone:'', email:'', date:todayIso(), start:13, end:17, people:20, purpose:'', regular:false,
    opts:{ manager:{on:false,count:1,hours:4}, cleaning:false, disposable:false, banner:false, xbanner:false },
    discType:'none', discVal:0, discWhy:'', extras:[], deposit:(D?D.deposit.amount:150000), valid:7, note:'', quoteNo:'' }; }
  Q=blankQ();
  function hourOpts(from,to,sel){ var s=''; for(var h=from;h<=to;h++) s+='<option value="'+h+'"'+(h===sel?' selected':'')+'>'+esc(E.hourLabel(h))+'</option>'; return s; }
  function fillForm(){
    $('#q-customer').value=Q.customer; $('#q-phone').value=Q.phone; $('#q-email').value=Q.email; $('#q-date').value=Q.date;
    $('#q-start').innerHTML=hourOpts(D.openFrom, D.openTo-1, Q.start); $('#q-end').innerHTML=hourOpts(Q.start+1, D.openTo, Q.end);
    $('#q-people').value=Q.people; $('#q-purpose').innerHTML=purOptions(Q.purpose); $('#q-regular').checked=Q.regular;
    $('#q-disc-type').value=Q.discType; $('#q-disc-val').value=Q.discVal; $('#q-disc-why').value=Q.discWhy; $('#q-deposit').value=Q.deposit; $('#q-valid').value=String(Q.valid); $('#q-note').value=Q.note;
    $('#q-pkgs').innerHTML=D.packages.map(function(p){ return '<button type="button" class="chip" data-pkg="'+p.id+'">'+esc(p.label)+' '+esc(p.time)+'</button>'; }).join('');
    $('#q-opts').innerHTML=D.options.map(function(o){
      if(o.per==='manager') return '<div class="q-opt"><label class="chk"><input type="checkbox" data-opt="manager"'+(Q.opts.manager.on?' checked':'')+'> '+esc(o.label)+' <small>'+esc(won(o.price))+'/'+esc(o.unit)+'</small></label><span class="q-mini">인원 <input class="input" type="number" min="1" max="10" data-mgr="count" value="'+Q.opts.manager.count+'"> 시간 <input class="input" type="number" min="1" max="24" data-mgr="hours" value="'+Q.opts.manager.hours+'"></span></div>';
      return '<div class="q-opt"><label class="chk"><input type="checkbox" data-opt="'+o.id+'"'+(Q.opts[o.id]?' checked':'')+'> '+esc(o.label)+' <small>'+esc(won(o.price))+'/'+esc(o.unit)+'</small></label></div>';
    }).join('');
    renderExtras(); renderLink();
  }
  function renderExtras(){
    $('#q-extras').innerHTML=Q.extras.map(function(x,i){ return '<div class="q-extra"><input class="input" data-ex="label" data-i="'+i+'" value="'+esc(x.label)+'" placeholder="항목명 (예: 케이터링 60인분)"><input class="input" type="number" step="1000" data-ex="amount" data-i="'+i+'" value="'+(x.amount||0)+'"><button type="button" class="btn btn-light btn-sm" data-ex-del="'+i+'" aria-label="삭제">✕</button></div>'; }).join('');
  }
  function renderLink(){
    $('#q-link').innerHTML=Q.ref?'<span>연결된 문의 <b>'+esc(Q.ref)+'</b></span><button type="button" class="btn btn-light btn-sm" id="q-open-ref">문의 열기</button><button type="button" class="btn btn-light btn-sm" id="q-unlink">연결 해제</button>':'<span class="small muted">연결된 문의 없음 — 전화·카카오톡 상담용 단독 견적으로 저장됩니다.</span>';
    $('#q-mark-wrap').hidden=!Q.ref;
    var o=$('#q-open-ref'); if(o) o.addEventListener('click', function(){ openInquiry(Q.ref); });
    var u=$('#q-unlink'); if(u) u.addEventListener('click', function(){ Q.ref=''; renderLink(); });
  }
  function readForm(){
    Q.customer=$('#q-customer').value.trim(); Q.phone=$('#q-phone').value.trim(); Q.email=$('#q-email').value.trim();
    Q.date=$('#q-date').value||todayIso(); Q.start=+$('#q-start').value; Q.end=+$('#q-end').value;
    if(Q.end<=Q.start){ Q.end=Math.min(Q.start+1, D.openTo); }
    Q.people=Math.max(1, Math.min(D.people.max, parseInt($('#q-people').value,10)||D.people.base)); Q.purpose=$('#q-purpose').value; Q.regular=$('#q-regular').checked;
    $$('#q-opts [data-opt]').forEach(function(cb){ if(cb.dataset.opt==='manager') Q.opts.manager.on=cb.checked; else Q.opts[cb.dataset.opt]=cb.checked; });
    var mc=$('#q-opts [data-mgr=count]'), mh=$('#q-opts [data-mgr=hours]'); if(mc) Q.opts.manager.count=Math.max(1,parseInt(mc.value,10)||1); if(mh) Q.opts.manager.hours=Math.max(1,parseInt(mh.value,10)||1);
    Q.discType=$('#q-disc-type').value; Q.discVal=Math.max(0, Number($('#q-disc-val').value)||0); Q.discWhy=$('#q-disc-why').value.trim();
    $$('#q-extras [data-ex]').forEach(function(el){ var x=Q.extras[+el.dataset.i]; if(!x) return; if(el.dataset.ex==='label') x.label=el.value; else x.amount=Math.round(Number(el.value)||0); });
    Q.deposit=Math.max(0, Number($('#q-deposit').value)||0); Q.valid=+$('#q-valid').value||7; Q.note=$('#q-note').value.trim();
  }
  function compute(){
    var opts={}; if(Q.opts.manager.on) opts.manager={count:Q.opts.manager.count, hours:Q.opts.manager.hours}; ['cleaning','disposable','banner','xbanner'].forEach(function(k){ if(Q.opts[k]) opts[k]=true; });
    var q=E.quote({ date:Q.date, start:Q.start, end:Q.end, people:Q.people, purpose:Q.purpose, regular:Q.regular, options:opts }); if(!q) return null;
    var lines=[];
    if(q.pkg) lines.push({ label:'공간료 · '+q.pkg.label, desc:q.pkg.time+' · '+q.pkg.hours+'시간 (시간 요금 '+won(q.pkg.regular)+' → '+q.pkg.pct+'% 할인)', amount:q.pkg.price });
    else q.time.lines.forEach(function(l){ lines.push({ label:'공간료 · '+l.label, desc:E.hourLabel(l.from)+'–'+E.hourLabel(l.to)+' · '+l.hours+'시간 × '+won(l.rate), amount:l.sum }); });
    lines.push({ label:'인원', desc:q.people+'명 (기준 '+D.people.base+'명 포함'+(q.peopleExtra?' · 추가 '+q.peopleExtra+'명 × '+won(D.people.extra):'')+')', amount:q.peopleFee });
    q.options.forEach(function(o){ lines.push({ label:o.label, desc:o.qty+' · '+won(o.unitPrice)+' / '+o.unit, amount:o.amount }); });
    var sub=q.total, disc=0;
    if(Q.discType==='pct') disc=Math.round(sub*Math.min(Q.discVal,100)/100/100)*100; else if(Q.discType==='won') disc=Math.min(Math.round(Q.discVal), sub);
    var extras=Q.extras.filter(function(x){ return (x.label||'').trim() || x.amount; }).map(function(x){ return { label:(x.label||'추가 항목').trim(), amount:Math.round(x.amount||0) }; });
    var exSum=extras.reduce(function(a,x){ return a+x.amount; },0);
    var total=Math.max(0, sub-disc+exSum);
    var validUntil=E.addDays(todayIso(), Q.valid);
    var refund=refundSchedule(Q.date);
    return { q:q, lines:lines, sub:sub, disc:disc, discLabel:Q.discType==='pct'?Q.discVal+'% 할인':'할인', extras:extras, total:total, deposit:Q.deposit, validUntil:validUntil, refund:refund };
  }
  function refundSchedule(date){
    var r=D.refund, t=todayIso(), rows=[{ k:r[0].k, rate:r[0].rate }], fmt=function(iso){ return E.kdate(iso); };
    var spans=[[r[1],null,15],[r[2],14,8],[r[3],7,6],[r[4],5,4],[r[5],3,0]];
    spans.forEach(function(s){ var x=s[0], until=s[2], from=s[1];
      var lastDay=E.addDays(date,-until), firstDay=from==null?null:E.addDays(date,-from);
      if(from==null){ if(lastDay<t) return; rows.push({ k:fmt(lastDay)+'까지', rate:x.rate }); }
      else { if(lastDay<t) return; var s0=firstDay<t?t:firstDay; rows.push({ k:s0===lastDay?fmt(s0):fmt(s0)+' ~ '+fmt(lastDay), rate:x.rate }); }
    });
    return rows;
  }
  var R=null;
  function calc(){
    if(!E||!D){ $('#q-result').innerHTML='<div class="empty">요금표를 불러오지 못했습니다.</div>'; return; }
    readForm(); R=compute(); if(!R) return;
    var q=R.q;
    $$('#q-pkgs [data-pkg]').forEach(function(b){ b.classList.toggle('on', !!(q.pkg && q.pkg.id===b.dataset.pkg)); });
    var rows=R.lines.map(function(l){ return '<tr><td>'+esc(l.label)+'<small>'+esc(l.desc)+'</small></td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('');
    if(R.disc) rows+='<tr class="minus"><td>'+esc(R.discLabel)+(Q.discWhy?'<small>'+esc(Q.discWhy)+'</small>':'')+'</td><td>−'+esc(won(R.disc))+'</td></tr>';
    R.extras.forEach(function(x){ rows+='<tr class="'+(x.amount<0?'minus':'')+'"><td>'+esc(x.label)+'</td><td>'+(x.amount<0?'−'+esc(won(-x.amount)):esc(won(x.amount)))+'</td></tr>'; });
    var warn=q.warnings.concat(q.notes).map(function(n){ return '<li>'+esc(n)+'</li>'; }).join('');
    $('#q-result').innerHTML='<div class="row between"><h2>견적 결과</h2><span class="small muted">'+esc(D.version)+'</span></div>'
      +'<div class="q-cond"><b>'+esc(E.kdateY(q.date))+'</b>'+(q.day.holiday?' · '+esc(q.day.holiday):'')+' <span class="tag-ch">'+esc(q.colLabel)+' 요금</span><br>'+esc(q.range)+' · '+q.people+'명'+(Q.purpose&&PUR[Q.purpose]?' · '+esc(PUR[Q.purpose]):'')+'</div>'
      +'<table class="q-table"><tbody>'+rows+'</tbody><tfoot>'+((R.disc||R.extras.length)?'<tr><td>요금표 기준 금액 <small>할인·추가 항목 반영 전</small></td><td>'+esc(won(R.sub))+'</td></tr>':'')+'<tr class="sum"><td>합계 <small>'+esc(D.vatNote.replace('표시 금액은 ','').replace(' 기준입니다.',''))+'</small></td><td>'+esc(won(R.total))+'</td></tr><tr><td>보증금 (별도 · 이용 뒤 반환)</td><td>'+esc(won(R.deposit))+'</td></tr></tfoot></table>'
      +(warn?'<ul class="q-notes">'+warn+'</ul>':'')
      +'<div class="q-refund"><b>취소 시 환불</b>'+(R.refund.length?R.refund.map(function(x){ return '<span>'+esc(x.k)+' <b>'+Math.round(x.rate*100)+'%</b></span>'; }).join(''):'<span>이용일이 지났습니다</span>')+'</div>'
      +'<p class="tiny muted mt-2">견적 유효기간 '+esc(E.kdateY(R.validUntil))+'까지'+(Q.quoteNo?' · 저장된 견적번호 <b>'+esc(Q.quoteNo)+'</b>':' · 아직 저장하지 않음')+'</p>';
  }
  $('#q-form').addEventListener('input', function(e){ if(e.target.id==='q-start'){ readForm(); $('#q-end').innerHTML=hourOpts(Q.start+1, D.openTo, Math.max(Q.end, Q.start+1)); } Q.quoteNo=''; calc(); });
  $('#q-form').addEventListener('change', function(e){ if(e.target.id==='q-start'){ readForm(); $('#q-end').innerHTML=hourOpts(Q.start+1, D.openTo, Math.max(Q.end, Q.start+1)); } Q.quoteNo=''; calc(); });
  $('#q-pkgs').addEventListener('click', function(e){ var b=e.target.closest('[data-pkg]'); if(!b) return; var p=E.findPkg(b.dataset.pkg); readForm(); Q.start=p.start; Q.end=p.end; $('#q-start').innerHTML=hourOpts(D.openFrom, D.openTo-1, Q.start); $('#q-end').innerHTML=hourOpts(Q.start+1, D.openTo, Q.end); Q.quoteNo=''; calc(); });
  $('#q-extra-add').addEventListener('click', function(){ readForm(); Q.extras.push({label:'',amount:0}); renderExtras(); var l=$$('#q-extras [data-ex=label]'); if(l.length) l[l.length-1].focus(); });
  $('#q-extras').addEventListener('click', function(e){ var b=e.target.closest('[data-ex-del]'); if(!b) return; readForm(); Q.extras.splice(+b.dataset.exDel,1); renderExtras(); calc(); });
  $('#q-reset').addEventListener('click', function(){ Q=blankQ(); fillForm(); calc(); $('#q-msg').hidden=true; });

  function quoteFromInquiry(it){
    var d=it.data||{}; Q=blankQ(); Q.ref=it.ref;
    Q.customer=d.name||it.name||''; Q.phone=d.phone||it.phone||''; Q.email=d.email||it.email||'';
    Q.date=d.date||it.event_date||todayIso(); Q.people=parseInt(d.headcount||it.headcount,10)||D.people.base; Q.purpose=d.purpose||''; Q.regular=d.inquiry_type==='regular';
    var hs=parseInt(String(d.t_start||'').slice(0,2),10), he=parseInt(String(d.t_end||'').slice(0,2),10);
    if(d.start_h&&d.end_h){ hs=+d.start_h; he=+d.end_h; }
    if(!isNaN(hs)&&!isNaN(he)){ if(hs<D.openFrom) hs+=24; if(he<=hs) he+=24; Q.start=Math.max(D.openFrom,Math.min(hs,D.openTo-1)); Q.end=Math.max(Q.start+1,Math.min(he,D.openTo)); }
    else if(SLOT_H[d.slot]){ Q.start=SLOT_H[d.slot][0]; Q.end=SLOT_H[d.slot][1]; }
    if((d.needs||[]).indexOf('manager')>=0) Q.opts.manager.on=true;
    var op=d.options||{}; if(op.manager){ Q.opts.manager.on=true; if(op.manager.count) Q.opts.manager.count=op.manager.count; if(op.manager.hours) Q.opts.manager.hours=op.manager.hours; } ['cleaning','disposable','banner','xbanner'].forEach(function(k){ if(op[k]) Q.opts[k]=true; });
    fillForm(); $('#q-msg').hidden=true;
  }
  function loadSavedQuote(q, ref){
    var inp=(q.data&&q.data.input)||null; if(!inp){ M.toast('이 견적은 다시 열 수 있는 정보가 없습니다.'); return; }
    Q=Object.assign(blankQ(), inp); Q.ref=ref||q.inquiry_ref||''; Q.quoteNo=q.quote_no; fillForm(); calc();
  }
  function payload(){
    var q=R.q;
    return { inquiry_ref:Q.ref, customer:Q.customer, event_date:Q.date, total:R.total, mark_sent:Q.ref && $('#q-mark').checked,
      data:{ input:JSON.parse(JSON.stringify(Q)), version:D.version, date:q.date, colLabel:q.colLabel, holiday:q.day.holiday||'', range:q.range, people:q.people, purpose:PUR[Q.purpose]||'',
        lines:R.lines, subtotal:R.sub, discount:R.disc, discountLabel:R.discLabel, discountWhy:Q.discWhy, extras:R.extras, total:R.total, deposit:R.deposit, validUntil:R.validUntil, note:Q.note, phone:Q.phone, email:Q.email } };
  }
  $('#q-save').addEventListener('click', function(){
    readForm(); calc(); if(!R) return; var b=this; b.disabled=true;
    A('/quotes',{method:'POST', body:payload()}).then(function(r){ Q.quoteNo=r.quote_no; calc(); note($('#q-msg'),'견적 '+r.quote_no+'을(를) 저장했습니다.'+(Q.ref&&$('#q-mark').checked?' 문의 상태도 확인했습니다.':''),true); loadRecentQuotes(); })
    .catch(function(e){ if(!guard(e)) note($('#q-msg'), e.message); }).finally(function(){ b.disabled=false; });
  });
  function kakaoText(){
    var q=R.q, L=[];
    L.push('[메가스팟 건대 견적 안내]'+(Q.quoteNo?' 견적번호 '+Q.quoteNo:''));
    L.push((Q.customer?Q.customer.split('·')[0].trim()+'님, ':'')+'문의하신 조건으로 견적 드립니다.');
    L.push('');
    L.push('· 이용일: '+E.kdateY(q.date)+(q.day.holiday?' ('+q.day.holiday+')':''));
    L.push('· 시간: '+q.range);
    L.push('· 인원: '+q.people+'명'+(PUR[Q.purpose]?' · '+PUR[Q.purpose]:''));
    L.push('--------------------');
    R.lines.forEach(function(l){ if(l.amount) L.push(l.label+' '+won(l.amount)); });
    if(R.disc) L.push(R.discLabel+(Q.discWhy?'('+Q.discWhy+')':'')+' -'+won(R.disc));
    R.extras.forEach(function(x){ L.push(x.label+' '+(x.amount<0?'-'+won(-x.amount):won(x.amount))); });
    L.push('--------------------');
    L.push('합계 '+won(R.total)+' ('+D.vatNote.replace('표시 금액은 ','').replace(' 기준입니다.','')+')');
    L.push('보증금 '+won(R.deposit)+' 별도 (이용 뒤 확인 후 반환)');
    L.push('견적 유효기간: '+E.kdateY(R.validUntil)+'까지');
    if(Q.note){ L.push(''); L.push(Q.note); }
    L.push(''); L.push('200인치 빔프로젝터·마이크·스피커·강단은 공간료에 포함되어 있습니다. 예약을 원하시면 편하게 말씀해 주세요.');
    return L.join('\n');
  }
  $('#q-copy').addEventListener('click', function(){
    readForm(); calc(); var t=kakaoText();
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast('고객 안내문을 복사했습니다. 카카오톡·문자에 붙여 넣으세요.'); })
    .catch(function(){ var ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); M.toast('고객 안내문을 복사했습니다.'); }catch(e){ M.toast('복사하지 못했습니다.'); } ta.remove(); });
  });
  $('#q-print').addEventListener('click', function(){
    readForm(); calc(); if(!R) return; renderSheet();
    var old=document.title; document.title='메가스팟건대_견적서_'+(Q.quoteNo||'미저장')+'_'+(Q.customer||'').split('·')[0].trim();
    setTimeout(function(){ window.print(); setTimeout(function(){ document.title=old; }, 500); }, 60);
  });
  function renderSheet(){
    var q=R.q, C=M.CONFIG||{}, now=new Date(), stamp=now.getFullYear()+'.'+(now.getMonth()+1)+'.'+now.getDate();
    var rows=R.lines.map(function(l){ return '<tr><td>'+esc(l.label)+'</td><td>'+esc(l.desc)+'</td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('');
    if(R.disc) rows+='<tr><td>'+esc(R.discLabel)+'</td><td>'+esc(Q.discWhy||'')+'</td><td>−'+esc(won(R.disc))+'</td></tr>';
    R.extras.forEach(function(x){ rows+='<tr><td>'+esc(x.label)+'</td><td></td><td>'+(x.amount<0?'−'+esc(won(-x.amount)):esc(won(x.amount)))+'</td></tr>'; });
    var refund=R.refund.map(function(x){ return '<span>'+esc(x.k)+' <b>'+Math.round(x.rate*100)+'%</b></span>'; }).join('');
    $('#quote-print').innerHTML='<div class="qp">'
      +'<header class="qp-head"><div><div class="qp-logo">MEGA<b>SPOT</b></div><div class="qp-sub">메가스팟 건대 · 서울 광진구 화양동 10-1 한아름건물 2층</div></div><div class="qp-meta"><b>견 적 서</b><span>견적번호 '+esc(Q.quoteNo||'(저장 전)')+'</span><span>작성일 '+esc(stamp)+'</span><span>유효기간 '+esc(E.kdateY(R.validUntil))+'까지</span></div></header>'
      +'<h1 class="qp-title">'+esc(Q.customer?Q.customer+' 귀하':'메가스팟 건대 이용 견적')+'</h1>'
      +'<table class="qp-cond"><tbody>'
      +'<tr><th>이용일</th><td>'+esc(E.kdateY(q.date))+(q.day.holiday?' · '+esc(q.day.holiday):'')+' <span class="qp-tag">'+esc(q.colLabel)+' 요금</span></td><th>이용 시간</th><td>'+esc(q.range)+'</td></tr>'
      +'<tr><th>인원</th><td>'+q.people+'명</td><th>모임 유형</th><td>'+esc(PUR[Q.purpose]||'—')+'</td></tr>'
      +((Q.phone||Q.email)?'<tr><th>연락처</th><td colspan="3">'+esc([Q.phone,Q.email].filter(Boolean).join(' · '))+'</td></tr>':'')
      +'</tbody></table>'
      +'<table class="qp-lines"><thead><tr><th>항목</th><th>내용</th><th>금액</th></tr></thead><tbody>'+rows+'</tbody>'
      +'<tfoot><tr><th colspan="2">합계 <small>'+esc(D.vatNote)+'</small></th><th>'+esc(won(R.total))+'</th></tr><tr><td colspan="2">'+esc(D.deposit.label)+' (별도 · 이용 뒤 확인 후 반환)</td><td>'+esc(won(R.deposit))+'</td></tr></tfoot></table>'
      +(Q.note?'<ul class="qp-notes"><li>'+esc(Q.note).replace(/\n/g,'<br>')+'</li></ul>':'')
      +'<div class="qp-grid"><div><h3>기본 제공 (무료)</h3><p>'+D.included.map(function(i){ return esc(i.label); }).join(' · ')+'</p><h3>취소 시 환불 기준 (이용일 '+esc(E.kdate(q.date))+' 기준)</h3><p class="qp-refund">'+(refund||'—')+'</p><p class="qp-small">'+esc(D.refundNote)+' '+esc(D.corporate)+'</p></div>'
      +'<div class="qp-contact"><h3>문의</h3><p>전화 '+esc(C.phone||'')+'<br>이메일 '+esc(C.email||'')+'<br>카카오톡 '+esc(String(C.kakaoChannel||'').replace(/^https?:\/\//,''))+'<br>홈페이지 megaspot.kr</p><img src="/assets/img/brand/kakao-qr.svg" alt="카카오톡 문의 채널 QR코드" width="88" height="88"></div></div>'
      +'<footer class="qp-foot">이 견적은 유효기간까지 같은 조건으로 적용합니다. 예약금 결제가 끝나면 예약이 확정되며, 날짜·시간·인원이 바뀌면 금액을 다시 안내드립니다. '+esc(D.version)+'</footer></div>';
  }
  function loadRecentQuotes(){
    A('/quotes').then(function(r){ var l=(r.items||[]).slice(0,12);
      $('#q-recent').innerHTML=l.length?l.map(function(q){ return '<div class="adm-row"><div class="r1"><b>'+esc(q.customer||'(고객명 없음)')+'</b><span class="small">'+esc(won(q.total))+'</span></div><div class="r3"><span>'+esc(q.quote_no)+(q.inquiry_ref?' · '+esc(q.inquiry_ref):'')+' · '+esc(q.event_date?kd(q.event_date):'')+'</span><button class="btn btn-light btn-sm" type="button" data-recent="'+esc(q.quote_no)+'">열기</button></div></div>'; }).join(''):emptyMsg('저장한 견적이 없습니다.');
      $$('#q-recent [data-recent]').forEach(function(b){ b.addEventListener('click', function(){ var q=l.filter(function(x){ return x.quote_no===b.dataset.recent; })[0]; if(q){ loadSavedQuote(q, q.inquiry_ref); window.scrollTo(0,0); } }); });
    }).catch(fail($('#q-recent')));
  }
  if(E&&D){ fillForm(); }

  /* =================== 주문·결제 =================== */
  var OST={paid:['결제 완료','st-ok'],created:['미완료','st-done'],failed:['실패·취소됨','st-cancel'],refunded:['환불','st-quote'],cancelled:['취소','st-cancel']};
  var PM={Card:'카드',DirectBank:'계좌이체',VBank:'가상계좌',HPP:'휴대폰'};
  function orderRow(o, full){
    var st=OST[o.status]||[o.status,''];
    return '<div class="adm-row ord-row" data-oid="'+esc(o.oid)+'"><div class="r1"><b>'+esc(o.buyer_name||'')+'</b><span class="st '+st[1]+'">'+st[0]+'</span>'+(o.test?'<span class="tag-ch">테스트</span>':'')+(o.pay_method?'<span class="tag-ch">'+esc(PM[o.pay_method]||o.pay_method)+'</span>':'')+'</div>'
      +'<div class="r2">'+esc(o.title)+(o.event_date?' · '+esc(kd(o.event_date)):'')+(o.people?' · '+o.people+'명':'')+' · <b>'+esc(won(o.price))+'</b></div>'
      +'<div class="r3"><span>'+esc(o.oid)+(o.booking_code?' · 예약 '+esc(o.booking_code):'')+(o.phone||o.buyer_phone?' · <a href="tel:'+esc(o.buyer_phone||'')+'">'+esc(o.buyer_phone||'')+'</a>':'')+'</span><span>'+esc(String(o.paid_at||o.created_at||'').slice(0,16))+'</span></div>'
      +(full&&o.memo?'<div class="tiny muted">'+esc(o.memo)+'</div>':'')
      +(full&&o.status==='paid'?'<div class="row mt-2" style="gap:6px"><button class="btn btn-light btn-sm" type="button" data-oact="refunded" data-oid="'+esc(o.oid)+'">환불 기록</button><button class="btn btn-light btn-sm" type="button" data-oact="cancelled" data-oid="'+esc(o.oid)+'">취소 기록</button>'+(o.inquiry_ref?'<button class="btn btn-light btn-sm" type="button" data-open-ref="'+esc(o.inquiry_ref)+'">문의 '+esc(o.inquiry_ref)+'</button>':'')+'</div>':'')
      +'</div>';
  }
  function loadOrders(){
    var box=$('#ord-list'); box.innerHTML='<div class="empty small">불러오는 중…</div>';
    M.api('/pay/config').then(function(c){ var m=$('#ord-mode'); m.firstElementChild.innerHTML=c.test?'<b>지금은 테스트 결제 상태입니다.</b> KG이니시스 테스트 상점(INIpayTest)으로 결제창이 열리고 실제 승인·출금은 되지 않습니다. 계약 뒤 Cloudflare에 <code>INICIS_MID</code>·<code>INICIS_SIGNKEY</code>를 넣고 다시 배포하면 실결제로 바뀝니다.':'<b>실결제 상태입니다.</b> 결제 완료 주문은 KG이니시스 상점관리자의 거래 내역과 같아야 합니다.'; m.classList.toggle('warn-note', !!c.test); }).catch(function(){});
    A('/orders?status='+encodeURIComponent($('#ord-status').value)+'&q='+encodeURIComponent($('#ord-q').value.trim())).then(function(r){ var list=r.items||[];
      box.innerHTML=list.length?list.map(function(o){ return orderRow(o,true); }).join(''):emptyMsg('해당하는 주문이 없습니다.');
    }).catch(fail(box));
  }
  $('#ord-reload').addEventListener('click', loadOrders); $('#ord-search').addEventListener('click', loadOrders); $('#ord-status').addEventListener('change', loadOrders); $('#ord-q').addEventListener('keydown', function(e){ if(e.key==='Enter') loadOrders(); });
  $('#ord-list').addEventListener('click', function(e){ var op=e.target.closest('button[data-open-ref]'); if(op){ openInquiry(op.dataset.openRef); return; } var b=e.target.closest('button[data-oact]'); if(!b) return;
    var memo=prompt(b.dataset.oact==='refunded'?'환불 금액과 처리 내용을 적어 주세요 (예: 전액 환불 · 이니시스 취소 완료)':'취소 사유를 적어 주세요'); if(memo===null) return;
    A('/orders/'+b.dataset.oid,{method:'PATCH', body:{status:b.dataset.oact, memo:memo}}).then(function(){ M.toast('기록했습니다. 연결된 예약은 취소되고 달력 마감이 풀렸습니다.'); loadOrders(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); });

  /* =================== 예약 =================== */
  function fillSpaces(){ var o=spaces.map(function(s){ return '<option value="'+s.id+'">'+esc(s.name)+'</option>'; }).join(''); $('#bk-space').innerHTML=o; $('#cal-space').innerHTML=o; }
  fillSpaces();
  function bookingFromInquiry(it){
    var d=it.data||{}; $('#bk-ref').value=it.ref; $('#bk-name').value=d.name||it.name||''; $('#bk-phone').value=d.phone||it.phone||''; $('#bk-date').value=d.date||it.event_date||''; $('#bk-people').value=d.headcount||it.headcount||'';
    var slot=SLOT_H[d.slot]?d.slot:'custom'; $('#bk-slot').value=$('#bk-slot').querySelector('option[value="'+slot+'"]')?slot:'custom';
    var lastQ=(cur&&cur.quotes&&cur.quotes[0]); $('#bk-memo').value=[(d.t_start&&d.t_end?'시간 '+d.t_start+'–'+d.t_end:''), lastQ?'견적 '+lastQ.quote_no+' · '+won(lastQ.total):''].filter(Boolean).join(' · ');
  }
  var bkCache=[];
  function loadBookings(){
    var box=$('#bk-list');
    A('/bookings').then(function(r){ bkCache=r.items||[]; drawBookings(); }).catch(fail(box));
  }
  function drawBookings(){
    var f=$('#bk-filter').value, t=todayIso();
    var list=bkCache.filter(function(b){ return f==='upcoming'?(b.status==='confirmed'&&b.date>=t):(f?b.status===f:true); });
    if(f==='upcoming') list.sort(function(a,b){ return a.date<b.date?-1:1; });
    $('#bk-list').innerHTML=list.length?list.map(function(b){
      var st={confirmed:['예약 확정','st-ok'],completed:['이용 완료','st-done'],cancelled:['취소','st-cancel']}[b.status]||[b.status,''];
      return '<div class="adm-row"'+(b.inquiry_ref?' data-ref="'+esc(b.inquiry_ref)+'"':'')+'><div class="r1"><b>'+esc(b.customer_name)+'</b><span class="st '+st[1]+'">'+st[0]+'</span></div><div class="r2">'+esc(kd(b.date))+' · '+esc(SLOT[b.slot]||b.slot||'')+(b.headcount?' · '+b.headcount+'명':'')+'</div>'+(b.memo?'<div class="tiny muted">'+esc(b.memo)+'</div>':'')+'<div class="r3"><span>'+esc(b.booking_code)+(b.inquiry_ref?' · '+esc(b.inquiry_ref):'')+' · <a href="tel:'+esc(b.phone)+'">'+esc(b.phone)+'</a></span><span>'+(b.status==='confirmed'?'<button class="btn btn-light btn-sm" type="button" data-bk="completed" data-code="'+esc(b.booking_code)+'">이용 완료</button> <button class="btn btn-light btn-sm" type="button" data-bk="cancelled" data-code="'+esc(b.booking_code)+'">취소</button>':'')+'</span></div></div>';
    }).join(''):emptyMsg('해당하는 예약이 없습니다.');
  }
  $('#bk-filter').addEventListener('change', drawBookings); $('#bk-reload').addEventListener('click', loadBookings);
  $('#bk-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-bk]'); if(!b) return; var s=b.dataset.bk;
    if(!confirm(s==='completed'?'이용 완료로 처리할까요? 처리 후 고객이 예약번호로 후기를 쓸 수 있습니다.':'이 예약을 취소할까요? 달력의 마감 표시도 풀립니다.')) return;
    A('/bookings/'+b.dataset.code,{method:'PATCH', body:{status:s}}).then(function(){ M.toast('변경했습니다.'); loadBookings(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); });
  $('#bk-form').addEventListener('submit', function(e){ e.preventDefault(); var f=e.target; if(!M.validate(f)) return; var d=M.formData(f); d.block_calendar=!!f.block_calendar.checked;
    A('/bookings',{method:'POST', body:d}).then(function(r){ note($('#bk-msg'),'예약을 등록했습니다. 예약번호 '+r.booking_code+' — 고객에게 안내해 주세요.',true); f.reset(); fillSpaces(); loadBookings(); })
    .catch(function(x){ if(!guard(x)) note($('#bk-msg'), x.message); }); });

  /* =================== 일정 달력 =================== */
  var calMonth=todayIso().slice(0,7);
  function loadCalendar(){
    var grid=$('#cal-grid'); grid.innerHTML='<div class="empty small">불러오는 중…</div>';
    Promise.all([A('/calendar'), A('/bookings'), A('/inquiries?status=open')]).then(function(res){ drawCalendar(res[0].items||[], res[1].items||[], res[2].items||[]); }).catch(fail(grid));
  }
  function drawCalendar(blocks, bookings, inqs){
    var y=+calMonth.slice(0,4), m=+calMonth.slice(5,7), first=new Date(y,m-1,1), days=new Date(y,m,0).getDate(), pad=first.getDay(), t=todayIso();
    $('#cal-title').textContent=y+'년 '+m+'월';
    var by={}; function add(d,html){ (by[d]=by[d]||[]).push(html); }
    blocks.forEach(function(b){ add(b.date,'<i class="ev '+(b.state==='full'?'full':'hold')+'">'+(b.state==='full'?'마감':'확보')+(b.memo&&b.memo.indexOf('예약 ')!==0?' · '+esc(b.memo):'')+'</i>'); });
    bookings.forEach(function(b){ if(b.status==='cancelled') return; add(b.date,'<i class="ev bk"'+(b.inquiry_ref?' data-ref="'+esc(b.inquiry_ref)+'"':'')+'>'+esc(b.customer_name)+(b.headcount?' '+b.headcount+'명':'')+'</i>'); });
    inqs.forEach(function(i){ var d=(i.data&&i.data.date)||i.event_date; if(d) add(d,'<i class="ev inq" data-ref="'+esc(i.ref)+'">'+esc(i.name||'')+' · '+esc(i.status)+'</i>'); });
    var h='<div class="dw">일</div><div class="dw">월</div><div class="dw">화</div><div class="dw">수</div><div class="dw">목</div><div class="dw">금</div><div class="dw">토</div>';
    for(var i=0;i<pad;i++) h+='<div class="dc empty"></div>';
    for(var d=1; d<=days; d++){ var iso=calMonth+'-'+M.pad2(d), off=E&&E.isOff(iso), dow=(pad+d-1)%7;
      h+='<div class="dc'+(iso===t?' today':'')+(iso<t?' past':'')+(off||dow===0?' off':'')+(dow===6?' sat':'')+'" data-day="'+iso+'"><b>'+d+'</b>'+(by[iso]||[]).join('')+'</div>'; }
    $('#cal-grid').innerHTML=h;
  }
  $('#cal-prev').addEventListener('click', function(){ var y=+calMonth.slice(0,4), m=+calMonth.slice(5,7)-1; if(m<1){ m=12; y--; } calMonth=y+'-'+M.pad2(m); loadCalendar(); });
  $('#cal-next').addEventListener('click', function(){ var y=+calMonth.slice(0,4), m=+calMonth.slice(5,7)+1; if(m>12){ m=1; y++; } calMonth=y+'-'+M.pad2(m); loadCalendar(); });
  $('#cal-grid').addEventListener('click', function(e){ if(e.target.closest('[data-ref]')) return; var c=e.target.closest('[data-day]'); if(!c) return; $('#cal-date').value=c.dataset.day; $('#cal-form').scrollIntoView({behavior:'smooth',block:'center'}); });
  $('#cal-form').addEventListener('submit', function(e){ e.preventDefault(); var f=e.target; if(!M.validate(f)) return;
    A('/calendar',{method:'POST', body:M.formData(f)}).then(function(){ note($('#cal-msg'),'저장했습니다.',true); loadCalendar(); }).catch(function(x){ if(!guard(x)) note($('#cal-msg'), x.message); }); });

  /* =================== 후기 =================== */
  function loadReviews(){
    var box=$('#rv-list');
    A('/reviews?status='+encodeURIComponent($('#rv-filter').value)).then(function(r){ var list=r.items||[];
      box.innerHTML=list.length?list.map(function(v){ return '<div class="adm-card review"><div class="row between"><div><b>'+esc(v.author)+'</b> <span class="small muted">· '+esc(v.booking_code)+' · '+esc(String(v.created_at||'').slice(0,10))+'</span></div><span class="st '+(v.status==='approved'?'st-ok':v.status==='hidden'?'st-cancel':'st-new')+'">'+({approved:'게시 중',hidden:'숨김',pending:'승인 대기'}[v.status]||v.status)+'</span></div><div class="stars">'+'★'.repeat(+v.rating)+'☆'.repeat(5-v.rating)+'</div><h3 style="font-size:16px;margin:6px 0">'+esc(v.title)+'</h3><div class="small" style="white-space:pre-wrap">'+esc(v.body)+'</div><div class="row mt-2" style="gap:6px"><input class="input" data-id="'+v.id+'" data-act="reply" value="'+esc(v.reply||'')+'" placeholder="운영자 답변" style="flex:1;min-width:200px"><button class="btn btn-light btn-sm" type="button" data-id="'+v.id+'" data-act="approve">게시</button><button class="btn btn-light btn-sm" type="button" data-id="'+v.id+'" data-act="hide">숨김</button></div></div>'; }).join(''):emptyMsg('표시할 후기가 없습니다.');
    }).catch(fail(box));
  }
  $('#rv-reload').addEventListener('click', loadReviews); $('#rv-filter').addEventListener('change', loadReviews);
  $('#rv-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-act]'); if(!b) return; var reply=$('#rv-list input[data-act=reply][data-id="'+b.dataset.id+'"]').value;
    A('/reviews/'+b.dataset.id,{method:'PATCH', body:{status:b.dataset.act==='approve'?'approved':'hidden', reply:reply}}).then(function(){ M.toast('저장했습니다.'); loadReviews(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); });

  /* =================== 회원 =================== */
  function loadMembers(){
    var box=$('#mem-list');
    A('/members?q='+encodeURIComponent($('#mem-q').value.trim())).then(function(r){ var list=r.items||[]; $('#mem-total').textContent='전체 '+(r.total||0)+'명';
      box.innerHTML=list.length?list.map(function(m){ var on=m.status==='active';
        return '<div class="adm-row"><div class="r1"><b>'+esc(m.name)+'</b><span class="small">'+esc(m.email)+'</span>'+(on?'':'<span class="st st-cancel">이용 제한</span>')+(m.agree_marketing?'<span class="tag-ch">마케팅 수신</span>':'')+'</div><div class="r2"><a href="tel:'+esc(m.phone||'')+'">'+esc(m.phone||'-')+'</a>'+(m.org?' · '+esc(m.org):'')+' · 문의 '+(m.inquiry_count||0)+'건</div><div class="r3"><span>가입 '+esc(String(m.created_at||'').slice(0,10))+(m.last_login_at?' · 최근 로그인 '+esc(String(m.last_login_at).slice(0,10)):'')+'</span><span><button class="btn btn-light btn-sm" type="button" data-mact="reset" data-id="'+m.id+'" data-name="'+esc(m.name)+'">임시 비밀번호</button> <button class="btn btn-light btn-sm" type="button" data-mact="'+(on?'suspend':'activate')+'" data-id="'+m.id+'">'+(on?'이용 제한':'제한 해제')+'</button></span></div><div class="small" data-temp="'+m.id+'"></div></div>'; }).join(''):emptyMsg('회원이 없습니다.');
    }).catch(fail(box));
  }
  $('#mem-reload').addEventListener('click', loadMembers); $('#mem-q').addEventListener('keydown', function(e){ if(e.key==='Enter') loadMembers(); });
  $('#mem-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-mact]'); if(!b) return; var id=b.dataset.id;
    if(b.dataset.mact==='reset'){ if(!confirm(b.dataset.name+' 님에게 임시 비밀번호를 발급할까요? 본인 확인을 먼저 해 주세요.')) return;
      A('/members/'+id+'/reset-password',{method:'POST', body:{}}).then(function(r){ $('#mem-list [data-temp="'+id+'"]').innerHTML='임시 비밀번호 <b class="temp-pw">'+esc(r.temp_password)+'</b> — 회원에게 알려 주고 로그인 뒤 바꾸도록 안내하세요.'; }).catch(function(x){ if(!guard(x)) M.toast(x.message); });
    } else { var st=b.dataset.mact==='suspend'?'suspended':'active'; if(st==='suspended'&&!confirm('이 회원의 로그인을 막을까요?')) return;
      A('/members/'+id,{method:'PATCH', body:{status:st}}).then(function(){ M.toast('변경했습니다.'); loadMembers(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); }
  });

  /* =================== 입점 =================== */
  function loadHosts(){
    var box=$('#host-list');
    A('/hosts').then(function(r){ var list=r.items||[];
      box.innerHTML=list.length?list.map(function(h){ var d=h.data||{}; return '<div class="adm-row"><div class="r1"><b>'+esc(d.space_name||'(공간명 없음)')+'</b><span class="small muted">'+esc(d.address||'')+'</span></div><div class="r2">'+esc(d.area||'-')+'평 · 최대 '+esc(d.capacity||'-')+'명 · '+esc(d.space_type||'-')+' · '+esc(d.role||'')+'</div><div class="r3"><span>'+esc(d.name||'')+' · <a href="tel:'+esc(d.phone||'')+'">'+esc(d.phone||'')+'</a>'+(d.email?' · '+esc(d.email):'')+(d.link?' · <a href="'+esc(d.link)+'" target="_blank" rel="noopener">링크</a>':'')+'</span><span>'+esc(h.ref)+' · '+esc(String(h.created_at||'').slice(0,10))+'</span></div>'+(d.message?'<div class="tiny muted">'+esc(d.message)+'</div>':'')+'</div>'; }).join(''):emptyMsg('입점 문의가 없습니다.');
    }).catch(fail(box));
  }
  $('#host-reload').addEventListener('click', loadHosts);
})();
