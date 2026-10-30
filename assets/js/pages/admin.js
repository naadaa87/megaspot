/* 메가스팟 관리자 화면 — 로그인 · 대시보드 · 문의 · 견적 계산 · 예약 · 일정 · 후기 · 회원 · 입점 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc, E0=window.MEGASPOT_PRICE, E=E0, D=E&&E.data();
  /* ---------- 공간(1호·2호) ----------
     요금 계산기(E)와 요금표(D)는 공간마다 다릅니다. 각 화면은 계산 직전에 useSpace(공간 id)로 그 공간의 계산기를 고릅니다. */
  var SPACE_IDS=['megaspot-gundae','megaspot-gundae-2'], DEFAULT_SPACE='megaspot-gundae';
  function spaceInfo(id){ return (window.MEGASPOT_SPACES||[]).filter(function(s){ return s.id===id; })[0]||null; }
  function spaceName(id){ var s=spaceInfo(id); return s?s.name:(id==='request'?'맞춤 공간 요청':(id||'')); }
  function spaceShort(id){ var s=spaceInfo(id); return s?(s.shortName||s.name):(id==='request'?'맞춤':(id||'')); }
  function spaceOk(id){ return SPACE_IDS.indexOf(id)>=0?id:DEFAULT_SPACE; }
  // 일정 겹침·대기 순번을 셀 때의 공간 키 — 맞춤 요청(request)처럼 공간이 정해지지 않은 문의는 1호로 묶어 봅니다
  function spKey(id){ return id==='megaspot-gundae-2'?id:DEFAULT_SPACE; }
  function useSpace(id){ if(!E0||!E0.forSpace) return E; var e=E0.forSpace(spaceOk(id)); if(e&&e.data()){ E=e; D=e.data(); } return E; }
  function spaceOptions(sel){ return SPACE_IDS.map(function(id){ return '<option value="'+id+'"'+(id===sel?' selected':'')+'>'+esc(spaceName(id))+'</option>'; }).join(''); }
  // 목록·행에 붙이는 공간 표시 — 1호는 표시하지 않고 2호·맞춤 요청만 표시합니다
  function spaceTag(id){ if(!id||id===DEFAULT_SPACE) return ''; if(id==='request') return '<span class="tag-sp tag-sp-req">맞춤 요청</span>'; return '<span class="tag-sp">'+esc(spaceShort(id))+'</span>'; }
  function A(path, opts){ return M.api('/admin'+path, opts||{}); }
  var ADMIN_HOURS={from:0,to:47}; // 이용일 00시부터 익일 23시까지, 기존 심야 예약도 유지
  var STATUSES=['문의 접수','조건 확인','견적 발송','결제 대기','예약 확정','이용 완료','취소·환불','대기 취소'];
  var ST_CLS={'문의 접수':'st-new','조건 확인':'st-check','견적 발송':'st-quote','결제 대기':'st-pay','예약 확정':'st-ok','이용 완료':'st-done','취소·환불':'st-cancel','대기 취소':'st-cancel','삭제됨':'st-del'};
  var DELETED='삭제됨';   // 삭제한 문의는 지우지 않고 이 상태로 보관합니다 (문의 관리 → 상태 '삭제된 문의')
  // 휴대폰·전화번호: 숫자만 입력해도 하이픈을 자동으로 넣습니다 (010-1234-5678 · 02-123-4567 · 1544-3523)
  function fmtPhone(v){
    var x=String(v||'').replace(/[^0-9]/g,'').slice(0,11);
    if(/^02/.test(x)){ x=x.slice(0,10); return x.length<3?x:x.length<6?x.slice(0,2)+'-'+x.slice(2):x.length<10?x.slice(0,2)+'-'+x.slice(2,5)+'-'+x.slice(5):x.slice(0,2)+'-'+x.slice(2,6)+'-'+x.slice(6); }
    if(/^1[5-9]/.test(x)){ x=x.slice(0,8); return x.length<5?x:x.slice(0,4)+'-'+x.slice(4); }
    return x.length<4?x:x.length<7?x.slice(0,3)+'-'+x.slice(3):x.length<11?x.slice(0,3)+'-'+x.slice(3,6)+'-'+x.slice(6):x.slice(0,3)+'-'+x.slice(3,7)+'-'+x.slice(7);
  }
  document.addEventListener('input', function(e){
    var el=e.target; if(!el || el.tagName!=='INPUT' || !(el.type==='tel' || el.name==='phone')) return;
    if(!el.closest || !el.closest('#admin-root')) return;
    var nv=fmtPhone(el.value); if(nv!==el.value) el.value=nv;
  });
  var TYPE={event:'행사 대관',regular:'정기·반복',partner:'제휴·협력'};
  var OPTL={manager:'현장 매니저',cleaning:'뒷정리·청소',disposable:'1회용 세트',banner:'현수막',xbanner:'X배너'};
  function timeText(d,sep){ if(d.start_h!=null && d.start_h!=='' && d.end_h!=null && d.end_h!==''){ var hl=function(h){ return (h>=24?'다음 날 ':'')+('0'+(h%24)).slice(-2)+':00'; }; return hl(+d.start_h)+sep+hl(+d.end_h)+' ('+(d.end_h-d.start_h)+'시간)'; } return d.t_start&&d.t_end?d.t_start+sep+d.t_end:(SLOT[d.slot]||''); }
  function optText(o){ if(!o||typeof o!=='object') return ''; return Object.keys(o).filter(function(k){ return o[k]; }).map(function(k){ var v=o[k]; return (OPTL[k]||k)+(v&&typeof v==='object'?' '+(v.count||1)+'명 × '+(v.hours||'')+'시간':''); }).join(', '); }
  // 문의 경로 (서버 CHANNELS 와 같은 순서). 기타는 channel_note 에 직접 입력한 내용을 함께 보여 줍니다.
  var CH_LIST=[['web','홈페이지'],['naver','네이버'],['spacecloud','스페이스클라우드'],['sns','SNS'],['kakao','카카오톡'],['phone','전화'],['email','이메일'],['visit','방문'],['other','기타 (직접 입력)']];
  var CH={online:'온라인 결제'}; CH_LIST.forEach(function(c){ CH[c[0]]=c[0]==='other'?'기타':c[1]; });
  function chLabel(ch, note){ return (CH[ch||'web']||ch||'홈페이지')+(note?' · '+note:''); }
  function chOptions(sel, first){ return (first?'<option value="">'+esc(first)+'</option>':'')+CH_LIST.map(function(c){ return '<option value="'+c[0]+'"'+(c[0]===sel?' selected':'')+'>'+esc(c[1])+'</option>'; }).join(''); }
  function chTag(ch, note){ if(!ch) return ''; return '<span class="ch-tag ch-'+esc(ch)+'">'+esc(chLabel(ch, note))+'</span>'; }
  // '함께 알아보기' (예약 신청·문의 양식에서 고객이 체크한 패밀리 공간 — site.js FAMILY_ASK와 같은 id)
  var FAM_ASK={socialfactory:'소셜팩토리 룸(4층)', playtion:'플레이션 뒤풀이'};
  function famAsk(d){ return ((d&&d.family)||[]).map(function(x){ return FAM_ASK[x]||x; }).join(', '); }
  // 예약 채널 바로가기 (주소를 바꾸려면 여기만 고치면 됩니다)
  var CHANNEL_LINKS=[
    { id:'kakao', name:'카카오톡 채널', mark:'K', links:[ { k:'관리자 화면', s:'관리자', url:'https://business.kakao.com/space/10713979/dashboard' }, { k:'고객 화면 (1:1 채팅)', s:'고객', url:'https://pf.kakao.com/_LnxbmX/chat' } ] },
    { id:'spacecloud', name:'스페이스클라우드', mark:'S', links:[ { k:'관리자 화면', s:'관리자', url:'https://partner.spacecloud.kr/manage/space' }, { k:'고객 화면 (공간 페이지)', s:'고객', url:'https://www.spacecloud.kr/space/81999' } ] },
    { id:'gmail', name:'구글 이메일', mark:'M', sub:'spaceblank0100@gmail.com', links:[ { k:'받은편지함 열기', s:'메일함', url:'https://mail.google.com/mail/u/0/' } ] },
    { id:'instagram', name:'인스타그램', mark:'I', sub:'@megaspot.kr', links:[ { k:'계정 열기', s:'계정', url:'https://www.instagram.com/megaspot.kr' } ] }
  ];
  function drawLinks(){
    var dl=$('#dash-links'); if(dl) dl.innerHTML=CHANNEL_LINKS.map(function(g){ return '<div class="ch-link ch-'+g.id+'"><span class="ch-mark" aria-hidden="true">'+esc(g.mark)+'</span><div class="ch-link-body"><b>'+esc(g.name)+'</b>'+(g.sub?'<small>'+esc(g.sub)+'</small>':'')+'<div class="ch-link-btns">'+g.links.map(function(l){ return '<a class="btn btn-light btn-xs" href="'+esc(l.url)+'" target="_blank" rel="noopener">'+esc(l.k)+' ↗</a>'; }).join('')+'</div></div></div>'; }).join('');
    var sl=$('#adm-side-links'); if(sl) sl.innerHTML='<div class="adm-side-cap">채널 바로가기</div>'+CHANNEL_LINKS.map(function(g){ return g.links.map(function(l){ return '<a href="'+esc(l.url)+'" target="_blank" rel="noopener"><span>'+esc(g.name)+'</span><small>'+esc(l.s||l.k)+' ↗</small></a>'; }).join(''); }).join('');
  }
  drawLinks();
  var SLOT={'pkg-day':'낮 패키지 10–17시','pkg-allday':'올데이 10–24시','pkg-allnight':'올나잇 18–07시',morning:'아침 07–12시',day:'낮 12–17시',evening:'저녁 17–24시',custom:'직접 입력',am:'오전',pm:'오후',ev:'저녁',ampm:'주간',pmev:'오후~저녁'};
  var SLOT_H={'pkg-day':[10,17],'pkg-allday':[10,24],'pkg-allnight':[18,31],morning:[7,12],day:[12,17],evening:[17,24],am:[9,13],pm:[13,18],ev:[18,23],ampm:[9,18],pmev:[14,23]};
  var CHECKS=[['available','일정 가능 여부 확인'],['quote_sent','견적 안내'],['deposit_paid','예약금 입금 확인'],['guarantee_paid','보증금 입금 확인'],['guide_sent','현장 안내 발송 (입장·주차·반입)'],['checkin','이용 당일 체크인'],['guarantee_returned','보증금 반환'],['review_asked','후기 요청']];
  function depositControl(it){
    var paid=it.deposit_paid===1||it.deposit_paid===true, known=it.deposit_paid!=null;
    var label=paid?'보증금 입금 완료':known?'보증금 미입금':'보증금 확인 전';
    var key=it.kind==='pending'?'data-deposit-ref="'+esc(it.ref)+'"':'data-deposit-code="'+esc(it.code||it.booking_code)+'"';
    if(it.status==='cancelled'||it.status==='대기 취소') return '<span class="deposit-state muted">'+label+'</span>';
    return '<button type="button" class="deposit-state'+(paid?' is-paid':'')+'" '+key+' data-paid="'+(paid?'1':'0')+'" title="클릭해서 보증금 입금 여부 변경" aria-label="'+label+' — 클릭해서 변경">'+label+'</button>';
  }
  function changeDeposit(e){
    var b=e.target.closest('[data-deposit-code],[data-deposit-ref]'); if(!b) return false;
    e.stopPropagation(); if(b.disabled) return true;
    var paid=b.dataset.paid!=='1', path=b.dataset.depositCode?'/bookings/'+encodeURIComponent(b.dataset.depositCode):'/inquiries/'+encodeURIComponent(b.dataset.depositRef);
    b.disabled=true;
    A(path+'/deposit-paid',{method:'PUT',body:{paid:paid}}).then(function(){
      M.toast(paid?'보증금 입금 완료로 저장했습니다.':'보증금 미입금으로 저장했습니다.');
      if(cur && b.dataset.depositRef===cur.item.ref){ cur.checks=cur.checks||{}; cur.checks.guarantee_paid=paid; }
      if(!$('#view-resv').hidden) loadResv(); if(!$('#view-bookings').hidden) loadBookings();
    }).catch(function(x){ b.disabled=false; if(!guard(x)) M.toast(x.message); });
    return true;
  }
  var ADMIN_PURPOSES=(window.MEGASPOT_PURPOSES||[]).concat([{ id:'year-end', label:'송년회' }]);
  var PUR={}; ADMIN_PURPOSES.forEach(function(p){ PUR[p.id]=p.label; });
  var spaces=window.MEGASPOT_SPACES||[];
  var won=function(n){ return (E?E.won(n):(Number(n||0).toLocaleString('ko-KR')+'원')); };
  var man=function(n){ return E?E.man(n):won(n); };
  function todayIso(){ var d=new Date(Date.now()+9*3600e3); return d.toISOString().slice(0,10); }
  function ago(ts){ if(!ts) return ''; var t=Date.parse(String(ts).replace(' ','T')+'Z'); if(!t) return ''; var h=Math.floor((Date.now()-t)/36e5); if(h<1) return '방금'; if(h<24) return h+'시간 전'; var d=Math.floor(h/24); return d+'일 전'; }
  function hoursSince(ts){ var t=Date.parse(String(ts||'').replace(' ','T')+'Z'); return t?(Date.now()-t)/36e5:0; }
  function stBadge(s){ return '<span class="st '+(ST_CLS[s]||'')+'">'+esc(s===DELETED?'삭제된 문의':s)+'</span>'; }
  function kd(iso){ return iso?M.fmtKDate(iso):'날짜 미정'; }
  function note(el, msg, ok){ el.textContent=msg; el.hidden=false; el.classList.toggle('ok',!!ok); }
  function purOptions(sel){ return '<option value="">선택 안 함</option>'+ADMIN_PURPOSES.map(function(p){ return '<option value="'+p.id+'"'+(p.id===sel?' selected':'')+'>'+esc(p.label)+'</option>'; }).join('')+'<option value="other"'+(sel==='other'?' selected':'')+'>기타</option>'; }

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
  // 모임·입점·등록 공간·광고 화면은 admin-platform.js 가 MEGASPOT_ADMIN.register 로 붙입니다
  var LOAD={ dash:loadDash, resv:loadResv, visits:loadVisits, inq:loadInq, quote:function(){ calc(); loadRecentQuotes(); }, catering:loadCatering, orders:loadOrders, bookings:loadBookings, calendar:loadCalendar, reviews:loadReviews, members:loadMembers };
  function go(v){
    if(!LOAD[v]) v='dash';
    $$('.adm-view').forEach(function(s){ s.hidden = s.id!=='view-'+v; });
    $$('#adm-nav button').forEach(function(b){ b.classList.toggle('on', b.dataset.view===v); });
    if(location.hash!=='#'+v) history.replaceState(null,'','#'+v);
    window.scrollTo(0,0); LOAD[v]();
  }
  $('#adm-nav').addEventListener('click', function(e){ var b=e.target.closest('button[data-view]'); if(b) go(b.dataset.view); });
  document.addEventListener('click', function(e){
    var g=e.target.closest('[data-go]'); if(g){ e.preventDefault(); var t=g.dataset.go; if(t==='inq-new') openNew(); else if(t==='visit-new') openVisit(null); else if(t.indexOf('inq:')===0){ $('#inq-status').value=t.slice(4); go('inq'); } else go(t); return; }
    var r=e.target.closest('[data-ref]'); if(r && !e.target.closest('select,input,button,a,.tr-chk')){ openInquiry(r.dataset.ref); }
  });

  /* =================== 대시보드 =================== */
  function currentAmount(it, lastQ){
    if(Object.prototype.hasOwnProperty.call(it, 'effective_amount')) return it.effective_amount;
    var d=it.data||{};
    return d.amount_override?d.total:(lastQ?lastQ.total:(it.quote_total!=null?it.quote_total:(d.total!=null?d.total:it.est_total)));
  }
  function row(it, extra){
    var late = it.status==='문의 접수' && hoursSince(it.created_at)>=24;
    var when=[kd(it.event_date), it.headcount?it.headcount+'명':'', PUR[it.purpose]||''].filter(Boolean).join(' · ');
    return '<div class="adm-row" data-ref="'+esc(it.ref)+'" tabindex="0"><div class="r1"><b>'+esc(it.name||'(이름 없음)')+'</b>'+spaceTag(it.space_id)+(it.reserve?'<span class="tag-rv">예약 신청</span>':'')+(it.catering?'<span class="tag-cat'+(it.catering_status?' s-'+esc(it.catering_status):'')+'">출장뷔페'+(it.catering_status&&CST[it.catering_status]?' '+CST[it.catering_status][0]:'')+'</span>':'')+(it.channel&&it.channel!=='web'?chTag(it.channel, it.channel_note):'')+stBadge(it.status)+'</div><div class="r2">'+esc(when)+(currentAmount(it)!=null?' · 금액 <b>'+esc(man(currentAmount(it)))+'</b>':'')+'</div><div class="r3"><span>'+esc(it.ref)+'</span><span class="'+(late?'late':'')+'">'+esc(extra||('접수 '+ago(it.created_at)))+'</span></div></div>';
  }
  function emptyMsg(t){ return '<div class="empty small">'+esc(t)+'</div>'; }
  function loadDash(){
    A('/dashboard').then(function(d){
      var c=d.counts||{}, pf=d.platform||{}, vc=d.visits||{}, cc=d.catering||{};
      $('#dash-date').textContent=E?E.kdateY(d.today)+' 기준':d.today;
      var k=[['문의 접수','새 문의','inq:문의 접수'],['조건 확인','조건 확인 중','inq:조건 확인'],['견적 발송','견적 발송','inq:견적 발송'],['결제 대기','결제 대기','inq:결제 대기']];
      $('#dash-kpis').innerHTML=k.map(function(x){ return '<button type="button" class="kpi'+(x[0]==='문의 접수'&&c[x[0]]?' hot':'')+'" data-go="'+x[2]+'"><small>'+x[1]+'</small><b>'+(c[x[0]]||0)+'</b></button>'; }).join('')
        +'<button type="button" class="kpi" data-go="bookings"><small>다가오는 예약 (14일)</small><b>'+(d.upcoming_count||0)+'</b></button>'
        +'<button type="button" class="kpi'+(d.reviews_pending?' hot':'')+'" data-go="reviews"><small>후기 승인 대기</small><b>'+(d.reviews_pending||0)+'</b></button>'
        +'<button type="button" class="kpi" data-go="members"><small>회원 (최근 7일 +'+(d.members_new||0)+')</small><b>'+(d.members||0)+'</b></button>'
        +'<button type="button" class="kpi'+(pf.meetups_pending?' hot':'')+'" data-go="meetups"><small>모임 공개 검토 대기</small><b>'+(pf.meetups_pending||0)+'</b></button>'
        +'<button type="button" class="kpi'+(pf.partners_new?' hot':'')+'" data-go="hosts"><small>새 입점·광고 신청</small><b>'+(pf.partners_new||0)+'</b></button>'
        +'<button type="button" class="kpi'+(vc.visits_requested?' hot':'')+'" data-go="visits"><small>현장답사 (조율 필요 · 오늘)</small><b>'+(vc.visits_requested||0)+'<em style="font-size:15px;font-style:normal"> · 오늘 '+(vc.visits_today||0)+'</em></b></button>'
        +'<button type="button" class="kpi'+(cc.catering_pending||cc.catering_requested?' hot':'')+'" data-go="catering"><small>출장뷔페 (대기 · 확정)</small><b>'+(cc.catering_pending||0)+'<em style="font-size:15px;font-style:normal"> · 확정 '+(cc.catering_confirmed||0)+'</em></b>'+(cc.catering_requested?'<span class="tiny">고객 요청 '+cc.catering_requested+'건 계산 전</span>':'')+'</button>'
        +'<button type="button" class="kpi" data-go="ads"><small>게재 중 배너 · 공개 공간</small><b>'+(pf.ads_on||0)+'<em style="font-size:15px;font-style:normal"> · '+(pf.listings_published||0)+'</em></b></button>';
      setCount('inq', c['문의 접수']); setCount('reviews', d.reviews_pending); setCount('orders', d.orders_today_paid); setCount('meetups', pf.meetups_pending); setCount('hosts', pf.partners_new); setCount('visits', vc.visits_requested); setCount('catering', (cc.catering_pending||0)+(cc.catering_requested||0));
      VS.dash=vc.visits_upcoming||[]; $('#dash-visits').innerHTML=VS.dash.length?VS.dash.map(function(v){ return visitCard(v, d.today); }).join(''):emptyMsg('7일 안에 잡힌 현장답사가 없습니다.');
      $('#dash-todo').innerHTML=(d.todo||[]).length?d.todo.map(function(i){ return row(i); }).join(''):emptyMsg('새로 들어온 문의가 없습니다.');
      $('#dash-follow').innerHTML=(d.followup||[]).length?d.followup.map(function(i){ return row(i, '마지막 변경 '+ago(i.updated_at||i.created_at)); }).join(''):emptyMsg('연락이 밀린 견적이 없습니다.');
      $('#dash-soon').innerHTML=(d.soon||[]).length?d.soon.map(function(i){ var dd=E?E.diffDays(d.today,i.event_date):''; return row(i, (dd===0?'오늘':'D-'+dd)+' · 아직 '+i.status); }).join(''):emptyMsg('14일 안에 미확정인 행사가 없습니다.');
      $('#dash-upcoming').innerHTML=(d.upcoming||[]).length?d.upcoming.map(function(b){ var dd=E?E.diffDays(d.today,b.date):''; return '<div class="adm-row"'+(b.inquiry_ref?' data-ref="'+esc(b.inquiry_ref)+'"':'')+'><div class="r1"><b>'+esc(b.customer_name)+'</b>'+spaceTag(b.space_id)+'<span class="st st-ok">'+(dd===0?'오늘':'D-'+dd)+'</span></div><div class="r2">'+esc(kd(b.date))+' · '+esc(b.start_h!=null&&b.end_h!=null?hl(b.start_h)+'–'+hl(b.end_h):(SLOT[b.slot]||b.slot||''))+(b.headcount?' · '+b.headcount+'명':'')+(b.amount!=null?' · <b>'+esc(man(b.amount))+'</b>':'')+'</div><div class="r3"><span>'+esc(b.booking_code)+'</span><a href="tel:'+esc(b.phone)+'">'+esc(b.phone)+'</a></div></div>'; }).join(''):emptyMsg('14일 안에 잡힌 예약이 없습니다.');
      var mo=d.month||{};
      $('#dash-orders').innerHTML=(d.orders_recent||[]).length?d.orders_recent.map(function(o){ return orderRow(o); }).join(''):emptyMsg('온라인 결제 주문이 아직 없습니다.');
      loadChannels();
      $('#dash-month').innerHTML='<div><small>이번 달 온라인 결제</small><b>'+(mo.orders_paid||0)+'<em>건 · '+esc(man(mo.orders_amount||0))+'</em></b></div><div><small>이번 달 들어온 문의</small><b>'+(mo.inquiries||0)+'<em>건</em></b></div><div><small>이번 달 이용 확정</small><b>'+(mo.confirmed||0)+'<em>건</em></b></div><div><small>이번 달 확정 금액</small><b>'+esc(man(mo.confirmed_amount||0))+'</b></div><div><small>견적 발송·결제 대기 금액</small><b>'+esc(man(mo.quoted_amount||0))+'</b></div>';
    }).catch(fail($('#dash-todo')));
  }
  function setCount(k,n){ var el=$('[data-count="'+k+'"]'); if(!el) return; el.textContent=n||''; el.hidden=!n; }
  $('#dash-reload').addEventListener('click', loadDash);

  /* ---------- 문의 경로 집계 ---------- */
  var CHR='month';
  function chRange(k){
    var t=todayIso(), y=+t.slice(0,4), m=+t.slice(5,7);
    var iso=function(Y,Mo,Dd){ var d=new Date(Y,Mo-1,Dd,12); return d.getFullYear()+'-'+M.pad2(d.getMonth()+1)+'-'+M.pad2(d.getDate()); };
    if(k==='month') return [iso(y,m,1), t];
    if(k==='last') return [iso(y,m-1,1), iso(y,m,0)];
    if(k==='90') return [E?E.addDays(t,-89):'', t];
    return ['',''];
  }
  function loadChannels(){
    var box=$('#dash-ch'); if(!box) return; var r=chRange(CHR);
    $$('#ch-range [data-chr]').forEach(function(b){ b.classList.toggle('on', b.dataset.chr===CHR); });
    A('/channels?from='+r[0]+'&to='+r[1]).then(function(d){
      var items=(d.items||[]).filter(function(x){ return x.total>0; }).sort(function(a,b){ return b.total-a.total; });
      if(!items.length){ box.innerHTML=emptyMsg('이 기간에 들어온 문의가 없습니다.'); return; }
      var max=items[0].total;
      box.innerHTML='<div class="ch-total">전체 <b>'+d.total+'</b>건 · 확정 <b>'+d.won+'</b>건'+(d.total?' <span class="muted">('+Math.round(d.won/d.total*100)+'%)</span>':'')+'</div>'
        +items.map(function(x){
          var sub='';
          if(x.channel==='web' && (d.web||[]).length) sub='<div class="ch-sub">유입: '+d.web.map(function(w){ return '<span>'+esc(w.label)+' '+w.n+'</span>'; }).join('')+'</div>';
          if(x.notes && x.notes.length) sub+='<div class="ch-sub">'+x.notes.map(function(n){ return '<span>'+esc(n.note)+' '+n.n+'</span>'; }).join('')+'</div>';
          return '<div class="ch-row"><button type="button" class="ch-name" data-chgo="'+esc(x.channel)+'" title="이 경로 문의만 보기">'+esc(x.label)+'</button><div class="ch-bar"><span style="width:'+Math.max(4,Math.round(x.total/max*100))+'%"></span></div><div class="ch-num"><b>'+x.total+'</b>건<small>확정 '+x.won+(x.total?' · '+Math.round(x.won/x.total*100)+'%':'')+'</small></div>'+sub+'</div>';
        }).join('');
    }).catch(fail(box));
  }
  $('#ch-range').addEventListener('click', function(e){ var b=e.target.closest('[data-chr]'); if(!b) return; CHR=b.dataset.chr; loadChannels(); });
  $('#dash-ch').addEventListener('click', function(e){ var b=e.target.closest('[data-chgo]'); if(!b) return; $('#inq-status').value=''; $('#inq-ch').value=b.dataset.chgo; go('inq'); });

  /* =================== 문의 목록 =================== */
  var inqCache=[];
  function loadInq(){
    var box=$('#inq-list'); box.innerHTML='<div class="empty small">불러오는 중…</div>';
    A('/inquiries?status='+encodeURIComponent($('#inq-status').value)+'&type='+encodeURIComponent($('#inq-type').value)+'&ch='+encodeURIComponent($('#inq-ch').value)+'&q='+encodeURIComponent($('#inq-q').value.trim())).then(function(r){
      inqCache=r.items||[];
      var keep={}; inqCache.forEach(function(it){ if(SEL[it.ref]) keep[it.ref]=1; }); SEL=keep;
      if(!inqCache.length){ box.innerHTML='<div class="empty"><b>'+(delView()?'삭제된 문의가 없습니다':'표시할 문의가 없습니다')+'</b>'+(delView()?'<br><span class="small muted">문의를 삭제하면 지워지지 않고 여기에 보관됩니다.</span>':'')+'</div>'; selSync(); return; }
      box.innerHTML='<div class="tr th"><span class="tr-chk"><input type="checkbox" id="inq-sel-all" aria-label="목록 전체 선택"></span><span>문의</span><span>고객</span><span>행사 조건</span><span>상태</span><span>견적</span><span class="inq-memo-head">운영 메모</span></div>'+inqCache.map(function(it){
        var d=it.data||{}, late=it.status==='문의 접수'&&hoursSince(it.created_at)>=24;
        var time=timeText(d,'–');
        return '<div class="tr'+(SEL[it.ref]?' sel':'')+'" data-ref="'+esc(it.ref)+'" tabindex="0"><span class="tr-chk"><input type="checkbox" data-sel="'+esc(it.ref)+'"'+(SEL[it.ref]?' checked':'')+' aria-label="'+esc(it.ref)+' 선택"></span><span><b class="ref">'+esc(it.ref)+'</b><small class="'+(late?'late':'')+'">'+esc(String(it.created_at||'').slice(5,16))+' · '+ago(it.created_at)+'</small></span>'
          +'<span><b>'+esc(d.name||it.name||'')+'</b>'+spaceTag(it.space_id)+(d.reserve?' <span class="tag-rv">예약 신청</span>':'')+'<small>'+esc(d.phone||it.phone||'')+'</small><small>'+chTag(d.channel||'web', d.channel_note)+(d.came_from&&d.came_from.label&&(d.channel||'web')==='web'?'<span class="came">'+esc(d.came_from.label)+' 유입</span>':'')+(famAsk(d)?'<span class="came fam">+ '+esc(famAsk(d))+'</span>':'')+(d.cocktail?'<span class="came cat">+ 출장 칵테일 '+esc(d.cocktail.cups)+'잔</span>':'')+(d.catering?'<span class="came cat'+(d.catering.status?' s-'+esc(d.catering.status):'')+'">'+(d.catering.status&&CST[d.catering.status]?'출장뷔페 '+CST[d.catering.status][0]:'+ 출장뷔페')+'</span>':'')+'</small><small>'+esc(TYPE[d.inquiry_type]||'행사 대관')+(d.member_id?' · 회원':'')+'</small></span>'
          +'<span>'+(d.inquiry_type==='partner'?esc(d.org||'제휴 제안'):esc(kd(d.date||it.event_date)))+'<small>'+esc([time, (d.headcount||it.headcount)?(d.headcount||it.headcount)+'명':'', PUR[d.purpose]||''].filter(Boolean).join(' · '))+'</small></span>'
          +'<span>'+stBadge(it.status)+(it.status===DELETED&&d.deleted_at?'<small>삭제 '+esc(String(d.deleted_at).slice(5,16))+'</small>':'')+'</span>'
          +'<span>'+(currentAmount(it)!=null?'<b>'+esc(man(currentAmount(it)))+'</b><small>'+(d.amount_override?'운영자 수정 금액':'금액')+'</small>':'<small>미정</small>')+'</span>'
          +'<span class="inq-memo"><small class="inq-memo-label">운영 메모</small><span class="adm-operation-memo">'+esc(it.memo||'–')+'</span></span></div>';
      }).join('');
      selSync();
    }).catch(fail(box));
  }
  /* 목록에서 선택한 문의 복사 · 여러 건 삭제 */
  var SEL={}, inqCopyBusy=false;
  function delView(){ return $('#inq-status').value==='deleted'; }
  function selRefs(){ return Object.keys(SEL).filter(function(k){ return SEL[k]; }); }
  function selSync(){
    var n=selRefs().length, all=$('#inq-sel-all'), boxes=$$('#inq-list [data-sel]');
    $('#inq-bulk').hidden=!n; $('#inq-sel-n').textContent=n+'건 선택';
    var copy=$('#inq-sel-copy'); copy.disabled=n!==1 || inqCopyBusy; copy.textContent=inqCopyBusy?'불러오는 중…':'선택한 문의 복사'; copy.title=n>1?'복사할 문의를 한 건만 선택해 주세요.':'';
    $('#inq-sel-del').hidden=delView(); $('#inq-sel-restore').hidden=!delView();
    if(all){ var on=boxes.filter(function(b){ return b.checked; }).length; all.checked=!!boxes.length && on===boxes.length; all.indeterminate=on>0 && on<boxes.length; }
  }
  $('#inq-list').addEventListener('change', function(e){
    var t=e.target;
    if(t.id==='inq-sel-all'){ $$('#inq-list [data-sel]').forEach(function(b){ b.checked=t.checked; SEL[b.dataset.sel]=t.checked; b.closest('.tr').classList.toggle('sel', t.checked); }); selSync(); return; }
    if(t.dataset.sel){ SEL[t.dataset.sel]=t.checked; t.closest('.tr').classList.toggle('sel', t.checked); selSync(); }
  });
  $('#inq-sel-clear').addEventListener('click', function(){ SEL={}; $$('#inq-list [data-sel]').forEach(function(b){ b.checked=false; b.closest('.tr').classList.remove('sel'); }); selSync(); $('#inq-bulk-msg').hidden=true; });
  $('#inq-sel-copy').addEventListener('click', function(){
    var refs=selRefs(); if(refs.length!==1 || inqCopyBusy) return;
    inqCopyBusy=true; selSync();
    A('/inquiries/'+encodeURIComponent(refs[0])).then(function(r){ openEdit(copyInquiryDraft(r.item, (r.quotes||[])[0]), true); })
    .catch(function(e){ if(!guard(e)) M.toast(e.message); }).finally(function(){ inqCopyBusy=false; selSync(); });
  });
  $('#inq-sel-del').addEventListener('click', function(){
    var refs=selRefs(); if(!refs.length) return;
    if(!confirm('선택한 문의 '+refs.length+'건을 삭제할까요?\n\n삭제한 문의는 지워지지 않고 \'삭제된 문의\' 보관함으로 옮겨집니다. 언제든 복원할 수 있고, 확정 예약이 걸린 문의는 옮기지 않습니다.')) return;
    var btn=this; btn.disabled=true;
    A('/inquiries/delete',{method:'POST', body:{refs:refs}}).then(function(r){
      var del=r.deleted||[], sk=r.skipped||[];
      SEL={}; sk.forEach(function(x){ SEL[x.ref]=true; });
      M.toast(del.length+'건을 삭제된 문의로 옮겼습니다.'+(sk.length?' '+sk.length+'건은 남겨 두었습니다.':''));
      var msg=$('#inq-bulk-msg');
      if(sk.length){ msg.innerHTML='<b>삭제하지 않은 문의</b><br>'+sk.map(function(x){ return esc(x.ref)+' — '+esc(x.reason); }).join('<br>'); msg.hidden=false; } else msg.hidden=true;
      loadInq(); if(!$('#view-dash').hidden) loadDash();
    }).catch(function(e){ if(!guard(e)) M.toast(e.message); }).finally(function(){ btn.disabled=false; });
  });
  $('#inq-sel-restore').addEventListener('click', function(){
    var refs=selRefs(); if(!refs.length) return;
    var btn=this; btn.disabled=true;
    A('/inquiries/restore',{method:'POST', body:{refs:refs}}).then(function(r){
      SEL={}; M.toast((r.restored||[]).length+'건을 복원했습니다. 삭제하기 전 상태로 돌아갔습니다.'); $('#inq-bulk-msg').hidden=true;
      loadInq(); if(!$('#view-dash').hidden) loadDash();
    }).catch(function(e){ if(!guard(e)) M.toast(e.message); }).finally(function(){ btn.disabled=false; });
  });
  $('#inq-ch').innerHTML=chOptions('', '모든 경로');
  $('#inq-reload').addEventListener('click', loadInq); $('#inq-status').addEventListener('change', loadInq); $('#inq-type').addEventListener('change', loadInq); $('#inq-ch').addEventListener('change', loadInq);
  $('#inq-q').addEventListener('keydown', function(e){ if(e.key==='Enter') loadInq(); });
  $('#inq-csv').addEventListener('click', function(){
    if(!inqCache.length){ M.toast('내려받을 문의가 없습니다. 먼저 목록을 불러오세요.'); return; }
    var cols=['문의번호','접수일시','상태','구분','유형','경로','유입','함께 알아보기','출장뷔페','이름','연락처','이메일','행사일','시작','종료','인원','목적','금액(원)','저장 견적(원)','회원','운영 메모'];
    var rows=inqCache.map(function(it){ var d=it.data||{}; return [it.ref,it.created_at,it.status,d.reserve?'예약 신청':'문의',TYPE[d.inquiry_type]||'행사 대관',chLabel(d.channel||'web', d.channel_note),(d.came_from&&d.came_from.label)||'',famAsk(d),d.catering?((d.catering.status&&CST[d.catering.status]?'['+CST[d.catering.status][0]+'] ':'')+(d.catering.summary||'상담 희망')):'',d.name||it.name,d.phone||it.phone,d.email||it.email,d.date||it.event_date||'',d.t_start||'',d.t_end||'',d.headcount||it.headcount||'',PUR[d.purpose]||d.purpose||'',d.total!=null?d.total:'',it.quote_total||'',d.member_id?'Y':'',it.memo||'']; });
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
      (it.status===DELETED?'<div class="dr-deleted"><div><b>삭제된 문의입니다.</b> 목록과 집계에서는 빠지고 이 보관함에만 남아 있습니다.<small>삭제 '+esc(String(d.deleted_at||it.updated_at||'').slice(0,16))+(d.deleted_from?' · 삭제 전 상태 '+esc(d.deleted_from):'')+'</small></div><div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" type="button" id="dr-restore">복원</button><button class="btn btn-danger btn-sm" type="button" id="dr-purge">완전 삭제</button></div></div>':'')
      +'<div class="dr-top">'+(it.status===DELETED?stBadge(it.status):'<select class="select" id="dr-status"'+(it.status==='대기 취소'?' disabled title="일자별 예약에서 대기를 복원할 수 있습니다."':'')+'>'+STATUSES.map(function(s){ return '<option'+(s===it.status?' selected':'')+(s==='대기 취소'?' disabled':'')+'>'+s+'</option>'; }).join('')+'</select>')
      +'<span class="small muted"><b class="dr-space">'+esc(spaceName(it.space_id||d.space_id||DEFAULT_SPACE))+'</b> · 접수 '+esc(String(it.created_at||'').slice(0,16))+(d.member_id?' · 회원 '+esc(d.member_email||''):'')+'</span></div>'
      +'<div class="dr-ch"><label for="dr-ch">문의 경로</label><select class="select" id="dr-ch">'+chOptions(d.channel||'web')+'</select><input class="input" id="dr-ch-note" maxlength="40" value="'+esc(d.channel_note||'')+'" placeholder="'+((d.channel||'web')==='other'?'기타 경로 (선택)':'세부 경로 (선택)')+'"'+(['other','sns'].indexOf(d.channel||'web')>=0?'':' hidden')+'><button class="btn btn-light btn-xs" type="button" id="dr-ch-save" hidden>경로 저장</button>'
      +((d.channel||'web')==='web'&&d.came_from?'<span class="dr-came">유입: <b>'+esc(d.came_from.label||'')+'</b>'+(d.came_from.host?' <small>('+esc(d.came_from.host)+')</small>':'')+(d.came_from.utm_campaign?' <small>캠페인 '+esc(d.came_from.utm_campaign)+'</small>':'')+(d.came_from.landing?' <small>첫 페이지 '+esc(d.came_from.landing)+'</small>':'')+'</span>':'')+'</div>'
      +(cur.wait?'<div class="dr-wait"><span class="kind kind-pd wait-no">대기 <b>'+cur.wait.no+'</b>번</span><span>'+esc(kd(cur.wait.date))+' 예약 대기 '+cur.wait.total+'명 가운데 '+cur.wait.no+'번째입니다.</span>'+(cur.wait.total>1?'<button type="button" class="linkish" id="dr-wait-go">일자별 예약에서 순번 바꾸기 →</button>':'')+'</div>':'')
      +(famAsk(d)?'<div class="dr-fam"><span class="ch-tag">함께 알아보기</span> <b>'+esc(famAsk(d))+'</b> <small class="muted">고객이 같은 날 함께 쓰고 싶다고 체크했습니다. 해당 공간 일정을 확인해 함께 안내해 주세요.</small></div>':'')
      +(d.cocktail?'<div class="dr-cat"><span class="tag-cat">출장 칵테일</span> <b>'+esc(d.cocktail.summary||d.cocktail.cups+'잔 패키지')+'</b><small class="muted">표시 가격은 대관료와 별도이며 부가세·출장·운영 조건은 상담 후 확인합니다.</small></div>':'')
      +(d.catering?'<div class="dr-cat"><span class="tag-cat">출장뷔페</span>'+(d.catering.status?' '+catBadge(d.catering):'')+' <b>'+esc(d.catering.summary||'출장뷔페 상담 희망')+'</b>'+(d.catering.note?'<small>메모: '+esc(d.catering.note)+'</small>':'')+'<small class="muted">'+(d.catering.status?'출장뷔페 화면에서 \''+(CST[d.catering.status]||[d.catering.status])[0]+'\'(으)로 저장한 구성입니다'+(d.catering.order_ref?' ('+esc(d.catering.order_ref)+')':'')+(d.catering.meal_time?' · 식사 '+esc(d.catering.meal_time):'')+'.':d.catering.by==='admin'?'관리자가 저장한 구성입니다.':'고객이 신청서에서 \'출장뷔페도 함께 상담받기\'를 체크했습니다. 금액은 대관료와 별도입니다.')+'</small><button type="button" class="btn btn-light btn-xs" id="dr-cat-go">출장뷔페 계산기에서 열기 →</button></div>':'')
      +'<div class="dr-actions"><button class="btn btn-primary btn-sm" type="button" id="dr-quote">이 문의로 견적 계산 →</button><button class="btn btn-light btn-sm" type="button" id="dr-cat">출장뷔페 계산</button>'
      +(tel?'<a class="btn btn-light btn-sm" href="tel:'+esc(tel)+'">전화</a><a class="btn btn-light btn-sm" href="sms:'+esc(tel)+'">문자</a>':'')
      +((d.email||it.email)?'<a class="btn btn-light btn-sm" href="mailto:'+esc(d.email||it.email)+'?subject='+encodeURIComponent('['+spaceName(spaceOk(it.space_id))+'] 문의 '+it.ref+' 안내')+'">이메일</a>':'')
      +((it.status===DELETED||it.status==='대기 취소'||(cur.bookings||[]).some(function(b){ return b.status!=='cancelled'; }))?'':'<button class="btn btn-light btn-sm btn-ok" type="button" id="dr-book">예약 확정</button>')
      +'<button class="btn btn-light btn-sm" type="button" id="dr-edit">내용 수정</button><button class="btn btn-light btn-sm" type="button" id="dr-copy">복사해서 새 문의 만들기</button></div>'
      +'<div class="dr-sec"><h3>고객</h3>'+kv('이름·소속',esc(d.name||it.name||''))+kv('연락처',esc(d.phone||it.phone||''))+kv('이메일',esc(d.email||it.email||''))+kv('선호 연락',esc({kakao:'카카오톡',phone:'전화',sms:'문자',email:'이메일'}[d.contact_pref]||d.contact_pref||''))+kv('회사·단체',esc(d.org||''))+'</div>'
      +(d.reserve?'<div class="notice" style="margin-bottom:12px"><div><b>홈페이지에서 금액을 확인하고 예약을 신청한 건입니다.</b>'+(d.total?' 고객이 본 예상 금액은 <b>'+esc(won(d.total))+'</b>'+(d.pkg?' ('+esc({day:'낮 패키지',allday:'올데이 패키지',allnight:'올나잇 패키지'}[d.pkg]||d.pkg)+')':'')+'입니다.':'')+' 일정이 비어 있으면 금액을 확인해 결제 방법을 안내하고, 입금·결제가 끝나면 \'예약 확정\'을 눌러 주세요.</div></div>':'')
      +'<div class="dr-sec"><h3>행사 조건</h3>'+kv('구분',d.reserve?'<b>예약 신청</b>':'문의')+kv('유형',esc(TYPE[d.inquiry_type]||'행사 대관'))+kv('목적',esc(PUR[d.purpose]||d.purpose||''))+kv('이용일',esc(d.date?kd(d.date):'')+(d.date_alt?' <small>(대체 '+esc(kd(d.date_alt))+')</small>':''))+kv('시간',esc(time))+kv('준비 입장·퇴장',esc([d.t_setup,d.t_out].filter(Boolean).join(' / ')))+kv('인원',esc(d.headcount?d.headcount+'명':''))+kv('배치',esc(d.layout||''))+kv('필요한 것',esc(needs))+kv('음식·연출',esc(d.food_fx||''))+kv('예산',esc(d.budget||''))+kv('반복 일정',esc([d.repeat_cycle,d.repeat_period,d.repeat_days].filter(Boolean).join(' · ')))+kv('서류',esc((d.docs||[]).join(', ')))+kv('제휴 형태',esc(d.partner_kind||''))+kv('선택 옵션',esc(optText(d.options)))
      +(d.message?'<div class="dr-msg">'+esc(d.message)+'</div>':'')+'</div>'
      +visitSection(it, d)
      +amountSection(it, d)
      +(d.estimate?'<details class="dr-sec"><summary><h3 style="display:inline">'+((d.source==='admin'||d.estimate_admin)?'요금표 계산 내역':'고객이 보낸 예상 금액')+'</h3></summary><pre class="dr-pre">'+esc(d.estimate)+'</pre></details>':'')
      +(d.estimate_customer?'<details class="dr-sec"><summary><h3 style="display:inline">고객이 처음 보낸 예상 금액</h3></summary><pre class="dr-pre">'+esc(d.estimate_customer)+'</pre></details>':'')
      +'<div class="dr-sec"><h3>진행 체크리스트</h3><div class="dr-checks">'+CHECKS.map(function(c){ var v=ch[c[0]]; return '<label class="chk"><input type="checkbox" data-chk="'+c[0]+'"'+(v?' checked':'')+'> '+esc(c[1])+(v&&typeof v==='string'?' <small>'+esc(v.slice(5,16))+'</small>':'')+'</label>'; }).join('')+'</div></div>'
      +'<div class="dr-sec"><h3>저장한 견적</h3>'+((cur.quotes||[]).length?cur.quotes.map(function(q){ return '<div class="dr-quote"><div><b>'+esc(q.quote_no)+'</b> <span class="small muted">'+esc(String(q.created_at).slice(0,16))+'</span></div><b>'+esc(won(q.total))+'</b><button class="btn btn-light btn-sm" type="button" data-openq="'+esc(q.quote_no)+'">열기</button></div>'; }).join(''):'<p class="small muted">아직 저장한 견적이 없습니다.</p>')+'</div>'
      +((cur.bookings||[]).length?'<div class="dr-sec"><h3>연결된 예약</h3>'+cur.bookings.map(function(b){ return '<div class="dr-bk"><span class="small">'+esc(b.booking_code)+' · '+esc(kd(b.date))+' · '+esc({confirmed:'예약 확정',completed:'이용 완료',cancelled:'취소'}[b.status]||b.status)+'</span>'+(b.status!=='cancelled'?cdBtn(b.booking_code, b.confirm_issued, 'btn-sm')+(b.confirm_issued?'':' <span class="tiny muted">고객에게 보낼 예약확정서를 만들 수 있습니다</span>'):'')+'</div>'; }).join('')+'</div>':'')
      +'<div class="dr-sec"><h3>운영 메모</h3><textarea class="textarea" id="dr-memo" style="min-height:90px" placeholder="통화 내용, 확정 금액, 특이사항">'+esc(it.memo||'')+'</textarea><button class="btn btn-light btn-sm mt-1" type="button" id="dr-memo-save">메모 저장</button></div>'
      +'<details class="dr-sec"><summary><h3 style="display:inline">문의 원문 · 변경 기록</h3></summary><pre class="dr-pre">'+esc(d.summary||'')+'</pre>'+((cur.log||[]).map(logLine).join(''))+'</details>'
      +(it.status===DELETED?'<div class="form-note" id="dr-del-msg" hidden></div>':'<div class="dr-sec dr-danger"><h3>문의 삭제</h3><p class="tiny muted">테스트·중복·스팸 문의를 목록에서 뺄 때 씁니다. 삭제한 문의는 지워지지 않고 문의 관리의 \'삭제된 문의\' 보관함에 남아, 나중에 고객 DB로 쓰거나 복원할 수 있습니다. 확정 예약이 걸린 문의는 예약을 먼저 취소해야 합니다.</p><button class="btn btn-danger btn-sm" type="button" id="dr-del">이 문의 삭제</button><div class="form-note" id="dr-del-msg" hidden></div></div>');
    function chSave(){ var ch=$('#dr-ch').value, nt=$('#dr-ch-note').value.trim();
      A('/inquiries/'+it.ref,{method:'PATCH', body:{channel:ch, channel_note:(ch==='other'||ch==='sns')?nt:''}}).then(function(){ d.channel=ch; d.channel_note=(ch==='other'||ch==='sns')?nt:''; $('#dr-ch-save').hidden=true; M.toast('문의 경로를 "'+chLabel(ch, d.channel_note)+'"(으)로 저장했습니다.'); refreshLists(); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); }
    $('#dr-ch').addEventListener('change', function(){ var ch=this.value, note=$('#dr-ch-note'); note.hidden=!(ch==='other'||ch==='sns'); note.placeholder=ch==='other'?'기타 경로 (선택, 예: 지인 소개)':'세부 경로 (예: 인스타그램)'; chSave(); });
    $('#dr-ch-note').addEventListener('input', function(){ $('#dr-ch-save').hidden=false; });
    $('#dr-ch-note').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); chSave(); } });
    $('#dr-ch-save').addEventListener('click', chSave);
    var drSt=$('#dr-status'); if(drSt) drSt.addEventListener('change', function(){ var v=this.value;
      if(v==='예약 확정' && !(cur.bookings||[]).some(function(b){ return b.status!=='cancelled'; })){ this.value=it.status; openConfirm(confirmFromInquiry()); return; }
      A('/inquiries/'+it.ref,{method:'PATCH', body:{status:v}}).then(function(){ it.status=v; M.toast('상태를 "'+v+'"(으)로 바꿨습니다.'); refreshLists(); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); });
    $('#dr-amt-save').addEventListener('click', function(){ var v=$('#dr-amt').value.trim(), n=$('#dr-amt-note').value.trim();
      A('/inquiries/'+it.ref,{method:'PATCH', body:{total:v===''?'':Number(v), amount_note:n}}).then(function(){ d.total=v===''?null:Number(v); d.amount_override=true; it.effective_amount=d.total; d.amount_mode=v===''?'':'manual'; d.amount_note=n; M.toast(v===''?'금액을 비웠습니다.':'금액을 '+won(Number(v))+'(으)로 저장했습니다.'); renderDetail(); refreshLists(); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); });
    var dva=$('#dr-visit-add'); if(dva) dva.addEventListener('click', function(){ var w=d.visit_wish||{}; openVisit({ inquiry_ref:it.ref, name:d.name||it.name||'', phone:d.phone||it.phone||'', space_id:spaceOk(it.space_id||d.space_id), date:w.date||'', time:w.time||'', people:w.people||'' }); });
    $$('#dr-body [data-dvid]').forEach(function(b){ b.addEventListener('click', function(){ var v=(cur.visits||[]).filter(function(x){ return String(x.id)===b.dataset.dvid; })[0]; if(v) openVisit(v); }); });
    $('#dr-memo-save').addEventListener('click', function(){ var v=$('#dr-memo').value; A('/inquiries/'+it.ref,{method:'PATCH', body:{memo:v}}).then(function(){ it.memo=v; refreshLists(); M.toast('메모를 저장했습니다.'); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); });
    $$('#dr-body [data-chk]').forEach(function(cb){ cb.addEventListener('change', function(){ var o={}; $$('#dr-body [data-chk]').forEach(function(x){ o[x.dataset.chk]=x.checked; }); A('/inquiries/'+it.ref+'/checks',{method:'PUT', body:{checks:o}}).then(function(r){ cur.checks=r.checks; M.toast('체크리스트를 저장했습니다.'); if(!$('#view-resv').hidden) loadResv(); if(!$('#view-bookings').hidden) loadBookings(); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); }); });
    $('#dr-quote').addEventListener('click', function(){ quoteFromInquiry(cur.item); closeDrawer($('#adm-drawer')); go('quote'); });
    var ctGo=function(){ ctFromInquiry(cur.item, cur.catering_order, cur.bookings); closeDrawer($('#adm-drawer')); go('catering'); };
    $('#dr-cat').addEventListener('click', ctGo); var dcg=$('#dr-cat-go'); if(dcg) dcg.addEventListener('click', ctGo);
    var db=$('#dr-book'); if(db) db.addEventListener('click', function(){ openConfirm(confirmFromInquiry()); });
    var wg=$('#dr-wait-go'); if(wg) wg.addEventListener('click', function(){ var dt=cur.wait.date; closeDrawer($('#adm-drawer')); go('resv'); if($('#rs-from').value>dt || ($('#rs-to').value && $('#rs-to').value<dt)){ setRange('upcoming'); loadResv(); } });
    $('#dr-edit').addEventListener('click', function(){ openEdit(cur.item); });
    $('#dr-copy').addEventListener('click', function(){ openEdit(copyInquiryDraft(cur.item, (cur.quotes||[])[0]), true); });
    var dDel=$('#dr-del'); if(dDel) dDel.addEventListener('click', function(){
      var nm=d.name||it.name||'';
      if(!confirm('문의 '+it.ref+(nm?' ('+nm+')':'')+'을(를) 삭제할까요?\n\n삭제한 문의는 지워지지 않고 \'삭제된 문의\' 보관함으로 옮겨지며, 언제든 복원할 수 있습니다.')) return;
      var btn=this; btn.disabled=true;
      A('/inquiries/'+encodeURIComponent(it.ref),{method:'DELETE'}).then(function(){ delete SEL[it.ref]; closeDrawer($('#adm-drawer')); M.toast('문의 '+it.ref+'을(를) 삭제된 문의로 옮겼습니다.'); cur=null; refreshLists(); })
      .catch(function(e){ if(!guard(e)){ note($('#dr-del-msg'), e.message); } }).finally(function(){ btn.disabled=false; });
    });
    var dRe=$('#dr-restore'); if(dRe) dRe.addEventListener('click', function(){
      var btn=this; btn.disabled=true;
      A('/inquiries/'+encodeURIComponent(it.ref)+'/restore',{method:'POST'}).then(function(r){ M.toast('문의 '+it.ref+'을(를) 복원했습니다 · 상태 "'+(r.status||'문의 접수')+'"'); openInquiry(it.ref); refreshLists(); })
      .catch(function(e){ if(!guard(e)){ note($('#dr-del-msg'), e.message); } }).finally(function(){ btn.disabled=false; });
    });
    var dPu=$('#dr-purge'); if(dPu) dPu.addEventListener('click', function(){
      var nm=d.name||it.name||'';
      if(!confirm('문의 '+it.ref+(nm?' ('+nm+')':'')+'을(를) 완전히 삭제할까요?\n\n고객이 개인정보 삭제를 요청했거나 보유 기간이 끝났을 때만 쓰세요. 완전 삭제하면 되돌릴 수 없습니다.')) return;
      var btn=this; btn.disabled=true;
      A('/inquiries/'+encodeURIComponent(it.ref)+'/purge',{method:'POST'}).then(function(){ delete SEL[it.ref]; closeDrawer($('#adm-drawer')); M.toast('문의 '+it.ref+'을(를) 완전히 삭제했습니다.'); cur=null; refreshLists(); })
      .catch(function(e){ if(!guard(e)){ note($('#dr-del-msg'), e.message); } }).finally(function(){ btn.disabled=false; });
    });
    $$('#dr-body [data-openq]').forEach(function(b){ b.addEventListener('click', function(){ var q=(cur.quotes||[]).filter(function(x){ return x.quote_no===b.dataset.openq; })[0]; if(q){ loadSavedQuote(q, cur.item.ref); closeDrawer($('#adm-drawer')); go('quote'); } }); });
  }
  function amountSection(it, d){
    var lastQ=(cur.quotes||[])[0], amount=currentAmount(it,lastQ), src='';
    if(amount!=null) src=d.amount_override?'운영자 설정 금액':(amount!==d.total?'예약·견적 금액':(d.source==='admin'?(d.amount_mode==='auto'?'요금표 계산':'직접 입력'):(d.amount_mode==='manual'?'운영자 수정':(d.amount_mode==='auto'?'요금표 계산 (운영자)':'고객이 확인한 예상 금액'))));
    return '<div class="dr-sec dr-amount"><h3>금액</h3>'
      +'<div class="dr-amt-now">'+(amount!=null?'<b>'+esc(won(amount))+'</b><span class="small muted">'+esc(src)+(d.amount_note?' · '+esc(d.amount_note):'')+'</span>':'<span class="muted">아직 정하지 않았습니다.</span>')+'</div>'
      +(lastQ?'<div class="small mt-1">저장한 최신 견적 <b>'+esc(won(lastQ.total))+'</b> ('+esc(lastQ.quote_no)+')</div>':'')
      +'<div class="dr-amt-edit"><input class="input" type="number" min="0" step="1000" id="dr-amt" value="'+(amount!=null?amount:'')+'" placeholder="금액(원)" aria-label="금액(원)"><input class="input" id="dr-amt-note" maxlength="200" value="'+esc(d.amount_note||'')+'" placeholder="메모 (예: 10% 할인 확정)" aria-label="금액 메모"><button class="btn btn-light btn-sm" type="button" id="dr-amt-save">금액 저장</button></div>'
      +'<p class="tiny muted">정확한 항목별 금액이 필요하면 \'이 문의로 견적 계산\'에서 견적서를 만들어 저장하세요.</p></div>';
  }
  function refreshLists(){ if(!$('#view-visits').hidden) loadVisits(); if(!$('#view-inq').hidden) loadInq(); if(!$('#view-dash').hidden) loadDash(); if(!$('#view-resv').hidden) loadResv(); if(!$('#view-bookings').hidden) loadBookings(); }
  var LOGK={'inquiry.created':'접수','reserve.created':'예약 신청 접수','inquiry.updated':'상태·메모·금액 변경','inquiry.edited':'내용 수정','quote.saved':'견적 저장','booking.created':'예약 등록','inquiry.confirmed':'예약 확정 처리','inquiry.deleted':'삭제 (보관함으로)','inquiry.restored':'삭제 문의 복원','waitlist.updated':'대기 순번 변경','waitlist.cancelled':'대기 취소','waitlist.restored':'대기 복원','booking.updated':'예약 상태 변경','order.created':'주문 생성','order.paid':'결제 완료','order.updated':'주문 변경','visit.created':'현장답사 등록','catering.created':'출장뷔페 저장','catering.updated':'출장뷔페 변경','catering.status':'출장뷔페 상태 변경','catering.deleted':'출장뷔페 삭제','visit.updated':'현장답사 변경','visit.deleted':'현장답사 삭제'};
  var LOGA={admin:'관리자',customer:'고객',system:'시스템'};
  function logLine(l){
    var det={}; try{ det=JSON.parse(l.detail||'{}')||{}; }catch(e){}
    var extra='';
    if(l.kind==='inquiry.edited' && det.changed) extra=det.changed.length?' — '+det.changed.join(', '):' — 바뀐 항목 없음';
    else if(l.kind==='inquiry.updated'){ extra=[det.status?'상태 → '+det.status:'', det.memo!==undefined?'메모':'', det.total!==undefined?'금액':''].filter(Boolean).join(', '); extra=extra?' — '+extra:''; }
    return '<div class="tiny muted">'+esc(String(l.created_at).slice(0,16))+' · '+esc(LOGK[l.kind]||l.kind)+esc(extra)+' · '+esc(LOGA[l.actor]||(/^member:/.test(l.actor||'')?'회원':l.actor))+'</div>';
  }

  /* =================== 문의 직접 등록 (금액 자동 계산 · 직접 입력) =================== */
  $('#nw-purpose').innerHTML=purOptions('');
  var NW={ last:null };
  function nwHourOpts(from,to,sel,blank){ var s=blank?'<option value="">'+blank+'</option>':''; for(var h=from;h<=to;h++) s+='<option value="'+h+'"'+(String(h)===String(sel)?' selected':'')+'>'+esc(E?E.hourLabel(h):h+':00')+'</option>'; return s; }
  function nwInit(){
    if(!E||!D) return;
    var sp=$('#nw-space'); if(sp && !sp.options.length) sp.innerHTML=spaceOptions(DEFAULT_SPACE);
    useSpace(sp?sp.value:DEFAULT_SPACE);
    $('#nw-start').innerHTML=nwHourOpts(ADMIN_HOURS.from, ADMIN_HOURS.to-1, '', '미정');
    $('#nw-end').innerHTML=nwHourOpts(ADMIN_HOURS.from+1, ADMIN_HOURS.to, '', '미정');
    $('#nw-pkgs').innerHTML=D.packages.map(function(p){ return '<button type="button" class="chip" data-nwpkg="'+p.id+'">'+esc(p.label)+' '+esc(p.time)+'</button>'; }).join('');
    $('#nw-opts').innerHTML='<label class="chk"><input type="checkbox" name="regular"> 4회 이상 정기 이용 <small>별도 할인 안내</small></label>'+D.options.map(function(o){
      if(o.per==='manager') return '<div class="q-opt"><label class="chk"><input type="checkbox" data-nwopt="manager"> '+esc(o.label)+' <small>'+esc(won(o.price))+'/'+esc(o.unit)+'</small></label><span class="q-mini">인원 <input class="input" type="number" min="1" max="10" data-nwmgr="count" value="1"> 시간 <input class="input" type="number" min="1" max="24" data-nwmgr="hours" value="4"></span></div>';
      return '<label class="chk"><input type="checkbox" data-nwopt="'+o.id+'"> '+esc(o.label)+' <small>'+esc(won(o.price))+'/'+esc(o.unit)+'</small></label>';
    }).join('');
  }
  nwInit();
  function nwOptions(){ var o={}; $$('#nw-opts [data-nwopt]').forEach(function(cb){ if(!cb.checked) return; if(cb.dataset.nwopt==='manager') o.manager={ count:Math.max(1,parseInt($('#nw-opts [data-nwmgr=count]').value,10)||1), hours:Math.max(1,parseInt($('#nw-opts [data-nwmgr=hours]').value,10)||1) }; else o[cb.dataset.nwopt]=true; }); return o; }
  function nwMode(){ var r=$('#nw-form input[name=amount_mode]:checked'); return r?r.value:'auto'; }
  function nwCalc(){
    if(!E||!D) return;
    var f=$('#nw-form'), date=f.date.value, sh=f.start_h.value, eh=f.end_h.value, box=$('#nw-auto');
    useSpace(f.space_id?f.space_id.value:DEFAULT_SPACE);
    // 시작을 고르면 종료 목록을 시작 뒤로 맞춥니다
    if(sh){ var cur=eh; $('#nw-end').innerHTML=nwHourOpts(+sh+1, ADMIN_HOURS.to, cur && +cur>+sh ? cur : '', '미정'); eh=$('#nw-end').value; }
    $$('#nw-pkgs [data-nwpkg]').forEach(function(b){ var p=E.findPkg(b.dataset.nwpkg); b.classList.toggle('on', !!sh && +sh===p.start && +eh===p.end); });
    NW.last=null;
    if(!date || !sh || !eh){ box.innerHTML='<div class="nw-auto-empty small muted">이용일과 시작·종료 시간을 고르면 요금표(성수기 포함)로 바로 계산합니다.</div>'; nwHint(); return; }
    var people=Math.max(1, Math.min(D.people.max, parseInt(f.headcount.value,10)||D.people.base));
    var q=E.quote({ adminHours:true, date:date, start:+sh, end:+eh, people:people, purpose:f.purpose.value, regular:f.regular?f.regular.checked:false, options:nwOptions() }); if(!q){ box.innerHTML=''; return; }
    NW.last=q;
    var rows=[];
    if(q.pkg) rows.push([q.pkg.label+' 공간료', q.pkg.time+' · '+q.pkg.pct+'% 할인', q.pkg.price]);
    else { q.time.lines.forEach(function(l){ rows.push(['공간료 · '+l.label, E.hourLabel(l.from)+'–'+E.hourLabel(l.to)+' · '+l.hours+'시간 × '+won(l.rate), l.sum]); }); if(q.surcharge) rows.push([q.peak?'성수기 포함 인원 '+q.peopleBase+'명 가산':((D.surcharge&&D.surcharge.label)||'기본 인원 가산액'), (q.peak?q.peak.label:'기준 '+q.peopleBase+'명 포함')+' · 1건당', q.surcharge]); }
    rows.push(['인원 '+q.people+'명', q.peopleExtra?'기준 '+q.peopleBase+'명 + '+q.peopleExtra+'명':'기준 '+q.peopleBase+'명 안', q.peopleFee]);
    q.options.forEach(function(o){ rows.push([o.label, o.qty, o.amount]); });
    box.innerHTML='<div class="nw-sum"><span>'+esc(spaceShort(E.space))+' · '+esc(E.kdate(q.date))+' · '+esc(q.colLabel)+' 요금 · '+esc(q.range)+'</span><b>'+esc(won(q.total))+'</b></div>'
      +'<table class="nw-lines">'+rows.map(function(r){ return '<tr><td>'+esc(r[0])+'<small>'+esc(r[1])+'</small></td><td>'+esc(won(r[2]))+'</td></tr>'; }).join('')+'</table>'
      +(q.warnings.length?'<p class="tiny" style="color:var(--warn)">'+esc(q.warnings.join(' · '))+'</p>':'')
      +'<p class="tiny muted">보증금 '+esc(won(q.deposit))+' 별도 · '+esc(D.vatNote)+'</p>';
    nwHint();
  }
  function nwHint(){ var h=$('#nw-total-hint'); if(!h) return; h.textContent=NW.last?'요금표 계산 금액: '+won(NW.last.total):''; }
  function nwSyncMode(){ var m=nwMode(); $('#nw-auto').hidden=m!=='auto'; $('#nw-manual').hidden=m!=='manual'; if(m==='manual' && !$('#nw-total').value && NW.last){ $('#nw-total').value=NW.last.total; } }
  function nwModeUi(edit, copy){
    NW.edit=edit||null;
    NW.copy=copy||null;
    $('#nw-date').required=!!copy;
    $('label[for="nw-date"]').innerHTML=copy?'이용일 <span class="req">*</span>':'이용일';
    $('#nw-title').textContent=edit?'문의 수정 · '+edit:'문의 직접 등록';
    $('#nw-intro').textContent=edit?'고객 정보·행사 조건·금액을 고칩니다. 고객이 처음 보낸 원문은 그대로 남고, 무엇을 고쳤는지는 변경 기록에 남습니다.':'카카오톡·전화·이메일·방문으로 받은 문의도 여기에 등록해 두면 홈페이지 문의와 같은 목록에서 견적·예약까지 관리할 수 있습니다.';
    $('#nw-submit').textContent=edit?'수정 저장':'등록';
    $('#nw-visit').hidden=!!edit; $('#nw-visit-on').checked=false; $('#nw-visit-body').hidden=true; $('#nw-v-warn').hidden=true;
    if(copy){
      $('#nw-title').textContent='문의 복사 · '+copy;
      $('#nw-intro').textContent='고객 정보·시간·인원·목적·옵션·운영 메모·현재 금액을 복사했습니다. 새 이용일을 선택하면 별도 문의 접수로 등록되어 해당 날짜의 예약 대기 목록에 들어갑니다. 날짜별 요금이 달라지면 요금표로 자동 계산을 선택해 주세요.';
      $('#nw-submit').textContent='복사본 대기 등록';
    }
  }
  $('#nw-ch').innerHTML=chOptions('', '경로 선택'); $('#nw-ch').required=true;
  function nwChSync(){ var ch=$('#nw-ch').value, n=$('#nw-ch-note'); n.hidden=!(ch==='other'||ch==='sns'); n.required=false; n.placeholder=ch==='other'?'기타 경로 (선택, 예: 지인 소개, 현수막)':'세부 경로 (예: 인스타그램, 블로그)'; if(n.hidden) n.value=''; }
  $('#nw-ch').addEventListener('change', nwChSync);
  function openNew(){ $('#nw-form').reset(); if($('#nw-space')) $('#nw-space').value=DEFAULT_SPACE; nwInit(); nwModeUi(null); nwChSync(); $('#nw-msg').hidden=true; nwSyncMode(); nwCalc(); openDrawer('#adm-new'); }
  function copyInquiryDraft(it, lastQ){
    var d=it.data||{}, amount=currentAmount(it, lastQ), hours=SLOT_H[d.slot]||[];
    return { ref:it.ref, name:it.name, phone:it.phone, email:it.email, headcount:it.headcount, memo:it.memo||'', data:{
      channel:d.channel, channel_note:d.channel_note, inquiry_type:d.inquiry_type,
      name:d.name, phone:d.phone, email:d.email, date:'',
      start_h:d.start_h!=null?d.start_h:hours[0], end_h:d.end_h!=null?d.end_h:hours[1], t_start:d.t_start, t_end:d.t_end,
      headcount:d.headcount, purpose:d.purpose, regular:d.regular, options:JSON.parse(JSON.stringify(d.options||{})),
      total:amount==null?null:amount, amount_mode:amount==null?'none':'manual', amount_note:d.amount_note||'', message:d.message||''
    } };
  }
  function openEdit(it, copy){
    var d=it.data||{}, f=$('#nw-form');
    f.reset(); if(f.space_id){ if(!f.space_id.options.length) f.space_id.innerHTML=spaceOptions(DEFAULT_SPACE); f.space_id.value=spaceOk(it.space_id||d.space_id); } nwInit(); nwModeUi(copy?null:it.ref, copy?it.ref:null); $('#nw-msg').hidden=true;
    f.channel.value=CH[d.channel]&&d.channel!=='online'?d.channel:'web'; f.channel_note.value=d.channel_note||''; nwChSync(); f.channel_note.value=d.channel_note||''; f.inquiry_type.value=TYPE[d.inquiry_type]?d.inquiry_type:'event';
    f.name.value=d.name||it.name||''; f.phone.value=d.phone||it.phone||''; f.email.value=d.email||it.email||'';
    f.date.value=d.date||it.event_date||'';
    var sh=d.start_h, eh=d.end_h;
    if(sh==null && d.t_start && d.t_end && /^\d{1,2}:\d{2}$/.test(d.t_start) && /^\d{1,2}:\d{2}$/.test(d.t_end)){ var a=parseInt(d.t_start,10), b=parseInt(d.t_end,10); if(b<=a) b+=24; if(a>=ADMIN_HOURS.from&&b<=ADMIN_HOURS.to){ sh=a; eh=b; } }
    if(sh!=null && D){ $('#nw-start').value=String(sh); $('#nw-end').innerHTML=nwHourOpts(+sh+1, ADMIN_HOURS.to, eh!=null?eh:'', '미정'); }
    f.headcount.value=d.headcount||it.headcount||'';
    if(d.purpose && !Array.prototype.some.call(f.purpose.options, function(o){ return o.value===d.purpose; })){ var op=document.createElement('option'); op.value=d.purpose; op.textContent=PUR[d.purpose]||d.purpose; f.purpose.appendChild(op); }
    f.purpose.value=d.purpose||'';
    var o=d.options||{}, anyOpt=false;
    $$('#nw-opts [data-nwopt]').forEach(function(cb){ cb.checked=!!o[cb.dataset.nwopt]; if(cb.checked) anyOpt=true; });
    if(o.manager && typeof o.manager==='object'){ $('#nw-opts [data-nwmgr=count]').value=o.manager.count||1; $('#nw-opts [data-nwmgr=hours]').value=o.manager.hours||4; }
    if(f.regular){ f.regular.checked=!!d.regular; if(d.regular) anyOpt=true; }
    $('#nw-opts-box').open=anyOpt;
    var mode=d.total==null?'none':(d.amount_mode==='auto'?'auto':'manual');
    f.querySelector('input[name=amount_mode][value='+mode+']').checked=true;
    if(mode==='manual'){ f.total.value=d.total; f.amount_note.value=d.amount_note||''; }
    f.message.value=d.message||''; f.memo.value=it.memo||'';
    nwCalc(); nwSyncMode(); openDrawer('#adm-new'); setTimeout(function(){ (copy?f.date:f.name).focus(); }, 50);
  }
  $('#nw-form').addEventListener('change', function(e){ if(e.target.name==='amount_mode'){ nwSyncMode(); return; } if(e.target.name==='total'||e.target.name==='amount_note') return; nwCalc(); });
  $('#nw-form').addEventListener('input', function(e){ if(e.target.name==='headcount'||e.target.dataset.nwmgr) nwCalc(); });
  $('#nw-pkgs').addEventListener('click', function(e){ var b=e.target.closest('[data-nwpkg]'); if(!b) return; useSpace($('#nw-space')?$('#nw-space').value:DEFAULT_SPACE); var p=E.findPkg(b.dataset.nwpkg); $('#nw-start').value=p.start; $('#nw-end').innerHTML=nwHourOpts(p.start+1, ADMIN_HOURS.to, p.end, '미정'); nwCalc(); });
  $('#nw-use-auto').addEventListener('click', function(){ if(!NW.last){ M.toast('이용일과 시간을 먼저 골라 주세요.'); return; } $('#nw-total').value=NW.last.total; });
  $('#nw-form').addEventListener('submit', function(e){
    e.preventDefault(); var f=e.target; if(!M.validate(f)) return; var d=M.formData(f), m=nwMode();
    d.space_id=spaceOk(d.space_id); useSpace(d.space_id);
    d.regular=!!(f.regular && f.regular.checked); d.options=nwOptions(); delete d.manager;
    var edit=NW.edit;
    if(NW.copy) d.status='문의 접수';
    if(!edit && $('#nw-visit-on').checked){ d.visit={ date:$('#nw-v-date').value, time:$('#nw-v-time').value, duration:$('#nw-v-dur').value, people:$('#nw-v-people').value.trim(), staff:$('#nw-v-staff').value.trim(), space_id:$('#nw-v-space').value, memo:$('#nw-v-memo').value.trim() }; }
    if(m==='auto'){ if(NW.last){ d.total=NW.last.total; d.pkg=NW.last.pkg?NW.last.pkg.id:''; d.estimate=E.summaryText(NW.last, PUR[d.purpose]||''); d.amount_mode='auto'; } else { delete d.total; d.amount_mode=edit?'keep':''; } }
    else if(m==='manual'){ if(d.total===''||d.total==null){ note($('#nw-msg'),'금액을 입력하거나 \'나중에 정하기\'를 골라 주세요.'); $('#nw-total').focus(); return; } d.amount_mode='manual'; if(NW.last && !edit){ d.pkg=NW.last.pkg?NW.last.pkg.id:''; d.estimate=E.summaryText(NW.last, PUR[d.purpose]||''); } }
    else { delete d.total; d.amount_mode=edit?'none':''; }
    var btn=f.querySelector('button[type=submit]'); btn.disabled=true;
    if(edit){
      d.edit=true;
      A('/inquiries/'+encodeURIComponent(edit),{method:'PATCH', body:d}).then(function(r){ closeDrawer($('#adm-new')); var ch=r.changed||[]; M.toast(ch.length?'수정했습니다: '+ch.join(', '):'저장했습니다. (바뀐 항목 없음)'); refreshLists(); openInquiry(edit); })
      .catch(function(x){ if(!guard(x)) note($('#nw-msg'), x.message); }).finally(function(){ btn.disabled=false; });
      return;
    }
    A('/inquiries',{method:'POST', body:d}).then(function(r){ closeDrawer($('#adm-new'));
      var vmsg=r.visit?' 현장답사 '+(r.visit.status==='scheduled'?vWhen(r.visit,true)+' 일정':'요청(조율 중)')+'도 함께 등록했습니다.':(r.visit_error?' 현장답사는 저장하지 못했습니다: '+r.visit_error:'');
      var cl=vClash(r.clashes); M.toast('문의 '+r.ref+'을(를) 등록했습니다.'+vmsg+(cl.length?' ⚠ '+cl[0]:''));
      refreshLists(); if(r.visit && !$('#view-visits').hidden) loadVisits(); openInquiry(r.ref); })
    .catch(function(x){ if(!guard(x)) note($('#nw-msg'), x.message); }).finally(function(){ btn.disabled=false; });
  });

  /* =================== 견적 계산 =================== */
  var Q;
  function blankQ(){ useSpace(DEFAULT_SPACE); return { space:DEFAULT_SPACE, ref:'', customer:'', phone:'', email:'', date:todayIso(), start:13, end:17, people:20, purpose:'', regular:false,
    opts:{ manager:{on:false,count:1,hours:4}, cleaning:false, disposable:false, banner:false, xbanner:false },
    discType:'none', discVal:0, discWhy:'', extras:[], deposit:(D?D.deposit.amount:150000), valid:1, note:'', quoteNo:'' }; }
  Q=blankQ();
  function hourOpts(from,to,sel){ var s=''; for(var h=from;h<=to;h++) s+='<option value="'+h+'"'+(h===sel?' selected':'')+'>'+esc(E.hourLabel(h))+'</option>'; return s; }
  function qSpaceHint(){ var h=$('#q-space-hint'); if(!h||!D) return; h.textContent=(D.version||'')+' · 기준 '+D.people.base+'명 포함 · 최대 '+D.people.max+'명'+(D.surcharge&&D.surcharge.amount?' · 시간제 1건당 '+won(D.surcharge.amount)+' 가산':'')+(D.opening?' · '+D.opening.replace(/-/g,'. ')+' 오픈':''); }
  function fillForm(){
    Q.space=spaceOk(Q.space); useSpace(Q.space);
    var qs=$('#q-space'); if(qs){ qs.innerHTML=spaceOptions(Q.space); } qSpaceHint();
    $('#q-customer').value=Q.customer; $('#q-phone').value=Q.phone; $('#q-email').value=Q.email; $('#q-date').value=Q.date;
    $('#q-start').innerHTML=hourOpts(ADMIN_HOURS.from, ADMIN_HOURS.to-1, Q.start); $('#q-end').innerHTML=hourOpts(Q.start+1, ADMIN_HOURS.to, Q.end);
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
    var qs=$('#q-space'); if(qs && qs.value && qs.value!==Q.space){ Q.space=spaceOk(qs.value); useSpace(Q.space); Q.quoteNo=''; qSpaceHint(); $('#q-pkgs').innerHTML=D.packages.map(function(p){ return '<button type="button" class="chip" data-pkg="'+p.id+'">'+esc(p.label)+' '+esc(p.time)+'</button>'; }).join(''); } else useSpace(Q.space);
    Q.customer=$('#q-customer').value.trim(); Q.phone=$('#q-phone').value.trim(); Q.email=$('#q-email').value.trim();
    Q.date=$('#q-date').value||todayIso(); Q.start=+$('#q-start').value; Q.end=+$('#q-end').value;
    if(Q.end<=Q.start){ Q.end=Math.min(Q.start+1, ADMIN_HOURS.to); }
    Q.people=Math.max(1, Math.min(D.people.max, parseInt($('#q-people').value,10)||D.people.base)); Q.purpose=$('#q-purpose').value; Q.regular=$('#q-regular').checked;
    $$('#q-opts [data-opt]').forEach(function(cb){ if(cb.dataset.opt==='manager') Q.opts.manager.on=cb.checked; else Q.opts[cb.dataset.opt]=cb.checked; });
    var mc=$('#q-opts [data-mgr=count]'), mh=$('#q-opts [data-mgr=hours]'); if(mc) Q.opts.manager.count=Math.max(1,parseInt(mc.value,10)||1); if(mh) Q.opts.manager.hours=Math.max(1,parseInt(mh.value,10)||1);
    Q.discType=$('#q-disc-type').value; Q.discVal=Math.max(0, Number($('#q-disc-val').value)||0); Q.discWhy=$('#q-disc-why').value.trim();
    $$('#q-extras [data-ex]').forEach(function(el){ var x=Q.extras[+el.dataset.i]; if(!x) return; if(el.dataset.ex==='label') x.label=el.value; else x.amount=Math.round(Number(el.value)||0); });
    Q.deposit=Math.max(0, Number($('#q-deposit').value)||0); Q.valid=+$('#q-valid').value||1; Q.note=$('#q-note').value.trim();
  }
  function compute(){
    var opts={}; if(Q.opts.manager.on) opts.manager={count:Q.opts.manager.count, hours:Q.opts.manager.hours}; ['cleaning','disposable','banner','xbanner'].forEach(function(k){ if(Q.opts[k]) opts[k]=true; });
    var q=E.quote({ adminHours:true, date:Q.date, start:Q.start, end:Q.end, people:Q.people, purpose:Q.purpose, regular:Q.regular, options:opts }); if(!q) return null;
    var lines=[];
    if(q.pkg) lines.push({ label:'공간료 · '+q.pkg.label+(q.peak?' ('+q.peak.seasonLabel+')':''), desc:q.pkg.time+' · '+q.pkg.hours+'시간'+(q.pkg.pct?' (시간 요금 '+won(q.pkg.regular)+' → '+q.pkg.pct+'% 할인)':''), amount:q.pkg.price });
    else { q.time.lines.forEach(function(l){ lines.push({ label:'공간료 · '+l.label, desc:E.hourLabel(l.from)+'–'+E.hourLabel(l.to)+' · '+l.hours+'시간 × '+won(l.rate), amount:l.sum }); }); if(q.surcharge) lines.push({ label:q.peak?'성수기 포함 인원 가산':((D.surcharge&&D.surcharge.label)||'기본 인원 가산액'), desc:(q.peak?q.peak.label:'시간제 예약')+' · 기준 '+q.peopleBase+'명 포함 · 1건당', amount:q.surcharge }); }
    lines.push({ label:'인원', desc:q.people+'명 (기준 '+q.peopleBase+'명 포함'+(q.peopleExtra?' · 추가 '+q.peopleExtra+'명 × '+won(D.people.extra):'')+')', amount:q.peopleFee });
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
    $('#q-result').innerHTML='<div class="row between"><h2>견적 결과</h2><span class="small muted">'+esc(spaceName(Q.space))+' · '+esc(D.version)+'</span></div>'
      +'<div class="q-cond"><b>'+esc(E.kdateY(q.date))+'</b>'+(q.day.holiday?' · '+esc(q.day.holiday):'')+' <span class="tag-ch">'+esc(q.colLabel)+' 요금</span><br>'+esc(q.range)+' · '+q.people+'명'+(Q.purpose&&PUR[Q.purpose]?' · '+esc(PUR[Q.purpose]):'')+'</div>'
      +'<table class="q-table"><tbody>'+rows+'</tbody><tfoot>'+((R.disc||R.extras.length)?'<tr><td>요금표 기준 금액 <small>할인·추가 항목 반영 전</small></td><td>'+esc(won(R.sub))+'</td></tr>':'')+'<tr class="sum"><td>합계 <small>'+esc(D.vatNote.replace('표시 금액은 ','').replace(' 기준입니다.',''))+'</small></td><td>'+esc(won(R.total))+'</td></tr><tr><td>보증금 (별도 · 이용 뒤 반환)</td><td>'+esc(won(R.deposit))+'</td></tr></tfoot></table>'
      +(warn?'<ul class="q-notes">'+warn+'</ul>':'')
      +'<div class="q-refund"><b>취소 시 환불</b>'+(R.refund.length?R.refund.map(function(x){ return '<span>'+esc(x.k)+' <b>'+Math.round(x.rate*100)+'%</b></span>'; }).join(''):'<span>이용일이 지났습니다</span>')+'</div>'
      +'<p class="tiny muted mt-2">견적 유효기간 '+esc(E.kdateY(R.validUntil))+'까지'+(Q.quoteNo?' · 저장된 견적번호 <b>'+esc(Q.quoteNo)+'</b>':' · 아직 저장하지 않음')+'</p>';
  }
  $('#q-form').addEventListener('input', function(e){ if(e.target.id==='q-start'){ readForm(); $('#q-end').innerHTML=hourOpts(Q.start+1, ADMIN_HOURS.to, Math.max(Q.end, Q.start+1)); } Q.quoteNo=''; calc(); });
  $('#q-form').addEventListener('change', function(e){ if(e.target.id==='q-start'){ readForm(); $('#q-end').innerHTML=hourOpts(Q.start+1, ADMIN_HOURS.to, Math.max(Q.end, Q.start+1)); } Q.quoteNo=''; calc(); });
  $('#q-pkgs').addEventListener('click', function(e){ var b=e.target.closest('[data-pkg]'); if(!b) return; readForm(); var p=E.findPkg(b.dataset.pkg); Q.start=p.start; Q.end=p.end; $('#q-start').innerHTML=hourOpts(ADMIN_HOURS.from, ADMIN_HOURS.to-1, Q.start); $('#q-end').innerHTML=hourOpts(Q.start+1, ADMIN_HOURS.to, Q.end); Q.quoteNo=''; calc(); });
  $('#q-extra-add').addEventListener('click', function(){ readForm(); Q.extras.push({label:'',amount:0}); renderExtras(); var l=$$('#q-extras [data-ex=label]'); if(l.length) l[l.length-1].focus(); });
  $('#q-extras').addEventListener('click', function(e){ var b=e.target.closest('[data-ex-del]'); if(!b) return; readForm(); Q.extras.splice(+b.dataset.exDel,1); renderExtras(); calc(); });
  $('#q-reset').addEventListener('click', function(){ Q=blankQ(); fillForm(); calc(); $('#q-msg').hidden=true; });

  function quoteFromInquiry(it){
    var d=it.data||{}; Q=blankQ(); Q.ref=it.ref; Q.space=spaceOk(it.space_id||d.space_id); useSpace(Q.space);
    Q.customer=d.name||it.name||''; Q.phone=d.phone||it.phone||''; Q.email=d.email||it.email||'';
    Q.date=d.date||it.event_date||todayIso(); Q.people=parseInt(d.headcount||it.headcount,10)||D.people.base; Q.purpose=d.purpose||''; Q.regular=d.inquiry_type==='regular';
    var hs=parseInt(String(d.t_start||'').slice(0,2),10), he=parseInt(String(d.t_end||'').slice(0,2),10);
    if(d.start_h!=null && d.start_h!=='' && d.end_h!=null && d.end_h!==''){ hs=+d.start_h; he=+d.end_h; }
    if(!isNaN(hs)&&!isNaN(he)){ if(hs<ADMIN_HOURS.from) hs+=24; if(he<=hs) he+=24; Q.start=Math.max(ADMIN_HOURS.from,Math.min(hs,ADMIN_HOURS.to-1)); Q.end=Math.max(Q.start+1,Math.min(he,ADMIN_HOURS.to)); }
    else if(SLOT_H[d.slot]){ Q.start=SLOT_H[d.slot][0]; Q.end=SLOT_H[d.slot][1]; }
    if((d.needs||[]).indexOf('manager')>=0) Q.opts.manager.on=true;
    var op=d.options||{}; if(op.manager){ Q.opts.manager.on=true; if(op.manager.count) Q.opts.manager.count=op.manager.count; if(op.manager.hours) Q.opts.manager.hours=op.manager.hours; } ['cleaning','disposable','banner','xbanner'].forEach(function(k){ if(op[k]) Q.opts[k]=true; });
    fillForm(); $('#q-msg').hidden=true;
  }
  function loadSavedQuote(q, ref){
    var inp=(q.data&&q.data.input)||null; if(!inp){ M.toast('이 견적은 다시 열 수 있는 정보가 없습니다.'); return; }
    Q=Object.assign(blankQ(), inp); Q.space=spaceOk(Q.space||(q.data&&q.data.space)); Q.ref=ref||q.inquiry_ref||''; Q.quoteNo=q.quote_no; fillForm(); calc();
  }
  function payload(){
    var q=R.q;
    return { inquiry_ref:Q.ref, customer:Q.customer, event_date:Q.date, total:R.total, mark_sent:Q.ref && $('#q-mark').checked,
      data:{ input:JSON.parse(JSON.stringify(Q)), space:Q.space, spaceName:spaceName(Q.space), version:D.version, date:q.date, colLabel:q.colLabel, holiday:q.day.holiday||'', range:q.range, people:q.people, purpose:PUR[Q.purpose]||'',
        lines:R.lines, subtotal:R.sub, discount:R.disc, discountLabel:R.discLabel, discountWhy:Q.discWhy, extras:R.extras, total:R.total, deposit:R.deposit, validUntil:R.validUntil, note:Q.note, phone:Q.phone, email:Q.email } };
  }
  $('#q-save').addEventListener('click', function(){
    readForm(); calc(); if(!R) return; var b=this; b.disabled=true;
    A('/quotes',{method:'POST', body:payload()}).then(function(r){ Q.quoteNo=r.quote_no; calc(); note($('#q-msg'),'견적 '+r.quote_no+'을(를) 저장했습니다.'+(Q.ref&&$('#q-mark').checked?' 문의 상태도 확인했습니다.':''),true); loadRecentQuotes(); })
    .catch(function(e){ if(!guard(e)) note($('#q-msg'), e.message); }).finally(function(){ b.disabled=false; });
  });
  // '김민지 · 성수 러닝크루' → ['김민지', '성수 러닝크루'] (가운뎃점·슬래시·쉼표로 나눔, '김민지(러닝크루)'처럼 괄호로 적어도 됨)
  function custParts(s){
    s=String(s||'').trim(); if(!s) return ['',''];
    var m=s.match(/^([^()]+?)\s*\(([^)]*)\)\s*$/); if(m) return [m[1].trim(), m[2].trim()];
    var i=s.search(/\s*[·•\/,|]\s*/); if(i<0) return [s,''];
    return [s.slice(0,i).trim(), s.slice(i).replace(/^\s*[·•\/,|]\s*/,'').trim()];
  }
  function kakaoText(){
    var q=R.q, L=[], cp=custParts(Q.customer);
    L.push('['+spaceName(Q.space)+' 견적 안내]'+(Q.quoteNo?' 견적번호 '+Q.quoteNo:''));
    L.push((cp[0]?cp[0]+' 님, ':'')+'문의하신 조건으로 견적 드립니다.');
    L.push('');
    if(cp[0]) L.push('· 고객: '+cp[0]+(cp[1]?' ('+cp[1]+')':''));
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
    L.push('견적 유효기간: '+E.kdateY(R.validUntil)+'까지'+(Q.valid===1?' (다음 날까지)':''));
    if(Q.note){ L.push(''); L.push(Q.note); }
    L.push(''); L.push((D.includedShort||'200인치 빔프로젝터·마이크·스피커·강단은 공간료에 포함되어 있습니다.')+' 예약을 원하시면 편하게 말씀해 주세요.');
    return L.join('\n');
  }
  $('#q-copy').addEventListener('click', function(){
    readForm(); calc(); var t=kakaoText();
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast('고객 안내문을 복사했습니다. 카카오톡·문자에 붙여 넣으세요.'); })
    .catch(function(){ var ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); M.toast('고객 안내문을 복사했습니다.'); }catch(e){ M.toast('복사하지 못했습니다.'); } ta.remove(); });
  });
  $('#q-print').addEventListener('click', function(){
    readForm(); calc(); if(!R) return; renderSheet();
    var old=document.title; document.title=(D.fileTag||'메가스팟건대')+'_견적서_'+(Q.quoteNo||'미저장')+'_'+(Q.customer||'').split('·')[0].trim();
    setTimeout(function(){ window.print(); setTimeout(function(){ document.title=old; }, 500); }, 60);
  });
  function renderSheet(){
    var q=R.q, C=M.CONFIG||{}, now=new Date(), stamp=now.getFullYear()+'.'+(now.getMonth()+1)+'.'+now.getDate();
    var rows=R.lines.map(function(l){ return '<tr><td>'+esc(l.label)+'</td><td>'+esc(l.desc)+'</td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('');
    if(R.disc) rows+='<tr><td>'+esc(R.discLabel)+'</td><td>'+esc(Q.discWhy||'')+'</td><td>−'+esc(won(R.disc))+'</td></tr>';
    R.extras.forEach(function(x){ rows+='<tr><td>'+esc(x.label)+'</td><td></td><td>'+(x.amount<0?'−'+esc(won(-x.amount)):esc(won(x.amount)))+'</td></tr>'; });
    var refund=R.refund.map(function(x){ return '<span>'+esc(x.k)+' <b>'+Math.round(x.rate*100)+'%</b></span>'; }).join('');
    $('#quote-print').innerHTML='<div class="qp">'
      +'<header class="qp-head"><div><div class="qp-logo">MEGA<b>SPOT</b></div><div class="qp-sub">'+esc(spaceName(Q.space))+' · '+esc(D.address||'서울 광진구 화양동 10-1 한아름건물 2층')+'</div></div><div class="qp-meta"><b>견 적 서</b><span>견적번호 '+esc(Q.quoteNo||'(저장 전)')+'</span><span>작성일 '+esc(stamp)+'</span><span>유효기간 '+esc(E.kdateY(R.validUntil))+'까지</span></div></header>'
      +'<h1 class="qp-title">'+esc(Q.customer?Q.customer+' 귀하':spaceName(Q.space)+' 이용 견적')+'</h1>'
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

  /* =================== 출장뷔페 =================== */
  // 가격·메뉴는 홈페이지와 같은 assets/js/data/catering.js(고객 안내 판매가, 부가세 별도)를 씁니다.
  // 발주처 연락처와 1인 수수료는 서버 settings 표(settings/catering)에만 저장해 홈페이지 파일에는 남기지 않습니다.
  var CC=window.MEGASPOT_CATERING_CALC||null, CD=CC?CC.data:null, CSET=null;
  function blankCT(){ return { ref:'', space:DEFAULT_SPACE, customer:'', phone:'', date:'', time:'', rent:'', people:60, course:'classic', bbq:'', beer:0, fee:CD?CD.delivery.fee:100000, note:'', target:null, oref:'', order:null, status:'pending' }; }
  var CT=blankCT();
  var CT_CHECK=[
    ['행사 날짜·대관 시간','세팅·수거도 대관 시간 안에서 합니다. 식사 시작 전에 세팅할 시간이 있는지 확인'],
    ['식사 인원','20·30인은 소규모 스페셜(정액), 베이직~시그니처는 40인부터, VIP 스페셜은 50인부터'],
    ['예산·행사 성격 → 코스 추천','식사 위주면 베이직·클래식, 손님 대접이면 프리미엄 이상'],
    ['밥·국 선택 (택1 메뉴)','볶음밥/영양찰밥, 국 종류 등 코스 메뉴의 택1 항목'],
    ['바베큐·생맥주','뒤풀이·파티면 함께 권하기. 생맥주는 1통 약 40잔'],
    ['알레르기·못 먹는 재료','견과류·갑각류·채식 인원 등 — 메모에 적어 발주 메모로 전달'],
    ['세금계산서·증빙','필요하면 사업자 정보 받기'],
    ['견적·결제 안내','대관료와 출장뷔페를 항목별로 나눈 견적 보내기 (대관 견적에 넣기)'],
    ['발주','결제 확인 뒤 발주 메모로 주문하고, 주문 확인 받기'],
    ['최종 인원 재확인','행사 전에 최종 인원·식사 시간·세팅 위치를 한 번 더 확인']
  ];
  function ctFaq(){
    var c=CD.courses, flat=c.filter(function(x){ return x.kind==='flat'; })[0], per=c.filter(function(x){ return x.kind==='per' && x.group!=='light'; }), lt=c.filter(function(x){ return x.group==='light'; });
    var lo=Math.min.apply(null, per.map(function(x){ return x.price; })), hi=Math.max.apply(null, per.map(function(x){ return x.price; }));
    var fee=won(CD.delivery.fee);
    return [
      ['가격이 얼마인가요?', '출장뷔페는 1인 '+won(lo)+'(베이직)부터 '+won(hi)+'(VIP 스페셜)까지 있습니다. 20·30인 행사는 소규모 스페셜 정액('+flat.tiers[0].people+'인 '+won(flat.tiers[0].price)+', '+flat.tiers[1].people+'인 '+won(flat.tiers[1].price)+')으로 진행합니다. 금액은 부가세 별도이고, 주문 1건마다 출장·세팅비 '+fee+'이 더해집니다. 코스별 메뉴와 예상 금액은 megaspot.kr/catering/ 에서 바로 확인하실 수 있습니다.'],
      ['몇 명부터 되나요?', '출장뷔페는 20인부터 주문할 수 있습니다. 20·30인은 소규모 스페셜(정액), 40인부터는 베이직~시그니처 코스, 50인부터는 VIP 스페셜까지 고르실 수 있습니다. 20인보다 적은 모임은 외부 음식이나 배달 음식을 가져오셔도 괜찮습니다.'],
      ['세팅은 언제 하나요?', '세팅과 수거도 대관 시간 안에서 진행합니다. 식사 시작 전에 뷔페를 차릴 시간이 필요해서, 대관 시작 시간을 식사 시간보다 앞으로 잡아 주시면 좋습니다. 코스와 인원에 맞춰 필요한 시간을 함께 안내드릴게요.'],
      ['메뉴를 바꿀 수 있나요?', '코스 안의 택1 메뉴(밥·국 등)는 고르실 수 있고, 계절과 식재료 수급에 따라 일부 메뉴는 같은 급의 다른 요리로 바뀔 수 있습니다. 알레르기나 피해야 할 재료가 있으면 미리 알려 주세요. 최대한 맞춰 준비하겠습니다.'],
      ['남은 음식 포장되나요?', '위생 문제로 남은 음식은 포장해 드리지 않는 것이 원칙입니다. 음식물 쓰레기와 그릇·집기는 수거할 때 함께 정리합니다.'],
      ['인원이 바뀌면요?', '최종 인원은 행사 전에 한 번 더 확인드리고, 바뀐 인원으로 금액을 다시 안내드립니다. 식재료 준비가 시작된 뒤에는 인원을 줄이거나 취소할 때 비용이 생길 수 있어요.'],
      ['다과만 준비할 수도 있나요?', '네. 한입 파티 요리에 커피·음료가 나오는 '+lt.filter(function(x){ return /^party/.test(x.id); }).map(function(x){ return x.name+'(1인 '+won(x.price)+')'; }).join(', ')+'가 있고, 한식 한 상이 필요하면 '+lt.filter(function(x){ return x.id==='galbi'; }).map(function(x){ return x.name+'(1인 '+won(x.price)+')'; }).join('')+'도 있습니다. 모두 부가세 별도이고 인원과 일정에 따라 가능 여부를 확인해 드려요.'],
      ['행사 소품도 되나요?', '테이프 커팅 세트, 케이크 커팅 세트(3단 케이크·샴페인), 얼음조각, 칵테일바, 접수대·방명록, 현수막도 행사에 맞춰 함께 준비할 수 있습니다. 비용은 행사 내용을 듣고 따로 안내드릴게요.'],
      ['바베큐·생맥주도 되나요?', '네. 바베큐는 실내형 완제품으로 반두(20~25명)부터 110kg까지, 생맥주는 1통(20,000cc, 약 40잔) '+won(CD.beer.price)+' 단위로 주문할 수 있습니다(부가세 별도). 생맥주는 설치·서빙과 잔, 냉각기가 함께 나옵니다.'],
      ['결제는 어떻게 하나요?', '대관료와 출장뷔페 금액을 항목별로 나눈 견적을 보내드리고, 안내드린 방법으로 결제해 주시면 주문이 확정됩니다. 세금계산서가 필요하면 사업자 정보를 알려 주세요.']
    ];
  }
  function ctMarkup(){ return CSET?(+CSET.markup||0):null; }
  function loadCatering(){
    if(!CC){ $('#ct-result').innerHTML='<div class="empty">출장뷔페 자료(catering.js)를 불러오지 못했습니다.</div>'; return; }
    ctFill(); ctCalc(); ctStatic(); ctPickCollapse(!!CT.target); loadCtTargets(); loadCtOrders();
    if(!CSET) A('/settings/catering').then(function(r){ CSET=r.value; ctVendorFill(r); ctCalc(); }).catch(function(e){ if(!guard(e)) $('#cv-state').textContent=e.message||'발주처 정보를 불러오지 못했습니다.'; });
  }
  function ctFill(){
    $('#ct-customer').value=CT.customer; $('#ct-phone').value=CT.phone; $('#ct-date').value=CT.date; $('#ct-time').value=CT.time;
    $('#ct-people').value=CT.people||''; $('#ct-fee').value=CT.fee; $('#ct-note').value=CT.note;
    $('#ct-time').placeholder=CT.rent?'대관 '+CT.rent+' · 예: 18:30':'예: 18:30';
    $('#ct-courses').innerHTML=CD.courses.map(function(c){
      var p=c.kind==='flat'?c.tiers[0].people+'인 '+man(c.tiers[0].price)+' · '+c.tiers[1].people+'인 '+man(c.tiers[1].price):'1인 '+won(c.price)+' · '+c.min+'인~';
      return '<label class="ct-c'+(CT.course===c.id?' on':'')+'"><input type="radio" name="ct-course" value="'+c.id+'"'+(CT.course===c.id?' checked':'')+'><b>'+esc(c.name)+'</b><small>'+esc(p)+'</small></label>';
    }).join('')+'<label class="ct-c none'+(!CT.course?' on':'')+'"><input type="radio" name="ct-course" value=""'+(!CT.course?' checked':'')+'><b>뷔페 없음</b><small>바베큐·생맥주만</small></label>';
    $('#ct-bbq').innerHTML=CC.bbqOptions(CT.bbq); $('#ct-beer').innerHTML=CC.beerOptions(CT.beer);
    $('#ct-link').innerHTML=ctLinkHtml();
    var o=$('#ct-open-ref'); if(o) o.addEventListener('click', function(){ openInquiry(CT.ref); });
    var u=$('#ct-unlink'); if(u) u.addEventListener('click', function(){ CT.target=null; CT.ref=''; CT.oref=''; CT.order=null; CT.status='pending'; ctFill(); ctCalc(); ctPickCollapse(false); drawCtTargets(); });
    ctSaveUi();
  }
  function ctRead(){
    CT.customer=$('#ct-customer').value.trim(); CT.phone=$('#ct-phone').value.trim(); CT.date=$('#ct-date').value; CT.time=$('#ct-time').value.trim();
    CT.people=Math.max(0, Math.min(999, parseInt($('#ct-people').value,10)||0));
    var fv=$('#ct-fee').value; CT.fee=fv===''?CD.delivery.fee:Math.max(0, Math.round(+fv||0));
    var r=$('#ct-courses input:checked'); CT.course=r?r.value:'';
    CT.bbq=$('#ct-bbq').value; CT.beer=+$('#ct-beer').value||0; CT.note=$('#ct-note').value.trim();
    $$('#ct-courses .ct-c').forEach(function(l){ l.classList.toggle('on', l.querySelector('input').checked); });
  }
  var CR=null;
  function ctCalc(){
    if(!CC) return; ctRead(); CR=CC.quote(CT); var r=CR, c=r.course;
    if(r.empty){ $('#ct-result').innerHTML='<h2>고객 안내 금액</h2><div class="empty small">코스나 바베큐·생맥주를 고르면 금액이 나옵니다.</div>'; $('#ct-internal').innerHTML='<div class="empty small">—</div>'; return; }
    var rows=r.lines.map(function(l){ return '<tr><td>'+esc(l.label)+'</td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('');
    var cond=[CT.date?kd(CT.date):'', CT.time?CT.time+' 식사':'', (CT.people||r.billPeople)?(CT.people||r.billPeople)+'명':''].filter(Boolean).join(' · ');
    $('#ct-result').innerHTML='<div class="row between"><h2>고객 안내 금액</h2><span class="small muted">'+esc(CD.version)+' · 부가세 별도 가격 기준</span></div>'
      +(cond||CT.customer?'<div class="q-cond">'+(CT.customer?'<b>'+esc(CT.customer)+'</b><br>':'')+esc(cond)+'</div>':'')
      +'<table class="q-table"><tbody>'+rows+'</tbody><tfoot><tr><td>공급가</td><td>'+esc(won(r.supply))+'</td></tr><tr><td>부가세 10%</td><td>'+esc(won(r.vat))+'</td></tr>'
      +'<tr class="sum"><td>합계 <small>부가세 포함</small></td><td>'+esc(won(r.total))+'</td></tr>'
      +(c?'<tr><td>1인당 <small>계산 기준 '+r.billPeople+'명</small></td><td>약 '+esc(won(Math.round(r.perPerson/100)*100))+'</td></tr>':'')+'</tfoot></table>'
      +(r.warn.length?'<ul class="q-notes">'+r.warn.map(function(w){ return '<li>'+esc(w)+'</li>'; }).join('')+'</ul>':'')
      +(CT.fee!==CD.delivery.fee?'<p class="tiny muted mt-1">출장·세팅비를 기본값('+esc(won(CD.delivery.fee))+')에서 '+esc(won(CT.fee))+'(으)로 바꿨습니다.</p>':'');
    ctInternal();
  }
  function ctVendorLines(){
    var mk=ctMarkup(); if(mk===null||!CR||CR.empty) return null;
    var lines=CR.lines.map(function(l){ var cut=mk*(l.people||0); return { label:l.label, key:l.key, amount:l.amount, vendor:Math.max(0,l.amount-cut), cut:cut, people:l.people||0 }; });
    var vSup=lines.reduce(function(a,x){ return a+x.vendor; },0), cut=lines.reduce(function(a,x){ return a+x.cut; },0);
    return { mk:mk, lines:lines, vSup:vSup, vVat:Math.round(vSup*CD.vat), cut:cut, cutVat:Math.round(cut*(1+CD.vat)) };
  }
  function ctInternal(){
    var box=$('#ct-internal'), v=ctVendorLines();
    if(!v){ box.innerHTML='<div class="empty small">'+(CSET?'—':'발주처 정보를 불러오는 중…')+'</div>'; return; }
    box.innerHTML='<table class="q-table ct-int"><thead><tr><td>항목</td><td>고객 금액</td><td>발주 금액</td><td>수수료</td></tr></thead><tbody>'
      +v.lines.map(function(x){ return '<tr><td>'+esc(x.label)+(x.cut?'<small>1인 '+esc(won(v.mk))+' × '+x.people+'명</small>':'')+'</td><td>'+esc(won(x.amount))+'</td><td>'+esc(won(x.vendor))+'</td><td>'+(x.cut?esc(won(x.cut)):'—')+'</td></tr>'; }).join('')
      +'</tbody><tfoot><tr><td>공급가 합계</td><td>'+esc(won(CR.supply))+'</td><td>'+esc(won(v.vSup))+'</td><td><b>'+esc(won(v.cut))+'</b></td></tr>'
      +'<tr><td>부가세 포함</td><td>'+esc(won(CR.total))+'</td><td>'+esc(won(v.vSup+v.vVat))+'</td><td>'+esc(won(v.cutVat))+'</td></tr></tfoot></table>'
      +'<p class="tiny muted mt-1">발주 금액 = 고객 금액 − 1인 수수료('+esc(won(v.mk))+') × 인원. 바베큐는 중량별 최대 인원 기준이고, 생맥주와 출장·세팅비에는 수수료가 없습니다. 수수료는 아래 \'발주처 정보 · 수수료\'에서 바꿀 수 있습니다.</p>';
  }
  function ctCustText(){
    var r=CR, c=r.course, cp=custParts(CT.customer), L=[];
    L.push('[메가스팟 출장뷔페 견적 안내]');
    L.push((cp[0]?cp[0]+' 님, ':'')+'문의하신 출장뷔페 구성으로 안내드립니다.');
    L.push('');
    if(cp[0]) L.push('· 고객: '+cp[0]+(cp[1]?' ('+cp[1]+')':''));
    if(CT.date) L.push('· 행사일: '+E.kdateY(CT.date)+(CT.time?' · '+CT.time+' 식사':''));
    else if(CT.time) L.push('· 식사 시간: '+CT.time);
    if(c) L.push('· 코스: '+c.name+(c.kind==='flat'?' (정액 · 요리 '+c.dishes+'종)':' (1인 '+won(c.price)+' · 요리 '+c.dishes+'종)'));
    if(c) L.push('· 인원: '+(CT.people||r.billPeople)+'명'+(r.billPeople!==CT.people&&CT.people?' (계산 기준 '+r.billPeople+'명)':''));
    if(r.bbq) L.push('· 바베큐: '+r.bbq.size+' ('+r.bbq.people+')');
    if(r.beer) L.push('· 생맥주: '+r.beer+'통 ('+CD.beer.unit+', 약 '+(r.beer*CD.beer.cups)+'잔)');
    L.push('--------------------');
    r.lines.forEach(function(l){ L.push(l.label+' '+won(l.amount)); });
    L.push('--------------------');
    L.push('공급가 '+won(r.supply)); L.push('부가세 10% '+won(r.vat));
    L.push('합계 '+won(r.total)+(c?' (1인 약 '+won(Math.round(r.perPerson/100)*100)+')':''));
    if(c && c.live && r.billPeople>=CC.liveMin(c)) L.push('· '+CC.liveMin(c)+'인 이상이라 즉석 코너('+c.live.replace(/ — .*/,'')+')가 함께 운영됩니다.');
    if(CT.note){ L.push(''); L.push('· 요청: '+CT.note); }
    L.push('');
    if(c) L.push('코스 메뉴는 여기서 보실 수 있습니다: https://megaspot.kr/catering/#course-'+c.id);
    L.push('세팅·수거도 대관 시간 안에서 진행되고, 공간 대관료는 별도입니다. 최종 인원은 행사 전에 한 번 더 확인드리겠습니다.');
    return L.join('\n');
  }
  function ctMenuText(){
    var c=CR&&CR.course; if(!c) return '';
    var L=['[메가스팟 출장뷔페 · '+c.name+' 코스 메뉴 · '+c.dishes+'종]'];
    Object.keys(c.menu).forEach(function(k){ var v=c.menu[k]; if(v&&v.length) L.push('· '+CD.menuLabels[k]+' ('+v.length+'): '+v.join(', ')); });
    if(c.live) L.push('· 즉석 코너 ('+CC.liveMin(c)+'인 이상): '+c.live);
    if(c.note) L.push('※ '+c.note);
    L.push('※ 계절과 식재료 수급에 따라 일부 메뉴는 같은 급의 다른 요리로 바뀔 수 있습니다.');
    return L.join('\n');
  }
  function ctOrderText(){
    var r=CR, c=r.course, v=ctVendorLines(), S=CSET||{}, codes=S.codes||{}, mk=v?v.mk:0, L=[];
    L.push('[출장뷔페 주문 요청 — 메가스팟]');
    if(CT.date) L.push('· 행사일: '+E.kdateY(CT.date)+(CT.time?' · 식사 '+CT.time:''));
    L.push('· 장소: 서울 광진구 화양동 10-1 한아름건물 2층 '+spaceName(spaceOk(CT.space))+' (건물 주차 가능)');
    if(CT.rent) L.push('· 대관 시간: '+CT.rent+' (세팅·수거도 이 안에서)');
    if(c){
      var unit=c.kind==='flat'?null:c.price-mk, tierPrice=c.kind==='flat'?(r.lines[0].amount-mk*r.billPeople):null;
      L.push('· 코스: '+(codes[c.id]||c.name)+' '+r.billPeople+'명'+(c.kind==='flat'?' (정액 '+won(tierPrice)+')':' (1인 '+won(unit)+')'));
      if(CT.people && CT.people!==r.billPeople) L.push('  (실제 인원 '+CT.people+'명)');
    }
    if(r.bbq) L.push('· 바베큐: '+r.bbq.size+' (실내형 완제품)');
    if(r.beer) L.push('· 생맥주: '+r.beer+'통');
    L.push('· 출장비: '+won(CT.fee));
    if(v) L.push('· 금액: '+won(v.vSup)+' + 부가세 '+won(v.vVat)+' = '+won(v.vSup+v.vVat));
    if(CT.note) L.push('· 요청: '+CT.note);
    L.push('· 현장 연락: 메가스팟 '+((M.CONFIG&&M.CONFIG.phone)||'010-2384-9580'));
    if(S.order_note) { L.push(''); L.push(S.order_note); }
    return L.join('\n');
  }
  function ctCopy(t, msg){
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast(msg); })
    .catch(function(){ var ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); M.toast(msg); }catch(e){ M.toast('복사하지 못했습니다.'); } ta.remove(); });
  }
  function ctStatic(){
    if($('#ct-check').dataset.done) return; $('#ct-check').dataset.done='1';
    $('#ct-check').innerHTML=CT_CHECK.map(function(x,i){ return '<label class="ct-ck"><input type="checkbox" data-ck="'+i+'"><span><b>'+esc(x[0])+'</b><small>'+esc(x[1])+'</small></span></label>'; }).join('');
    $('#ct-faq').innerHTML=ctFaq().map(function(x,i){ return '<button type="button" class="ct-fq" data-fq="'+i+'"><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span><em>복사</em></button>'; }).join('');
    $('#ct-prices').innerHTML='<div class="ct-pwrap"><table class="ct-ptable"><thead><tr><th>코스</th><th>가격 (부가세 별도)</th><th>부가세 포함</th><th>최소 인원</th><th>요리</th><th>즉석 코너</th></tr></thead><tbody>'
      +CD.courses.map(function(c){ var p=c.kind==='flat'?c.tiers.map(function(t){ return t.people+'인 '+won(t.price); }).join(' / '):'1인 '+won(c.price), pv=c.kind==='flat'?c.tiers.map(function(t){ return won(Math.round(t.price*(1+CD.vat))); }).join(' / '):won(Math.round(c.price*(1+CD.vat)));
        return '<tr><td><b>'+esc(c.name)+'</b></td><td>'+esc(p)+'</td><td>'+esc(pv)+'</td><td>'+(c.kind==='flat'?'20·30인':c.min+'인~')+'</td><td>'+c.dishes+'종</td><td class="small">'+(c.live?esc(CC.liveMin(c)+'인↑ '+c.live.replace(/ — .*/,'')):'—')+'</td></tr>'; }).join('')
      +'<tr><td><b>바베큐</b></td><td colspan="5">'+CD.bbq.rows.map(function(b){ return esc(b.size+' '+won(b.price)); }).join(' · ')+'</td></tr>'
      +'<tr><td><b>생맥주</b></td><td colspan="5">'+esc(CD.beer.unit+' '+won(CD.beer.price)+' (약 '+CD.beer.cups+'잔)')+'</td></tr>'
      +'<tr><td><b>출장·세팅비</b></td><td colspan="5">'+esc(won(CD.delivery.fee)+' · 주문 1건당 · '+CD.delivery.note)+'</td></tr>'
      +'</tbody></table></div>';
  }
  function ctVendorFill(r){
    var v=r.value||{};
    $('#cv-name').value=v.vendor_name||''; $('#cv-manager').value=v.vendor_manager||''; $('#cv-phone').value=v.vendor_phone||''; $('#cv-kakao').value=v.vendor_kakao||''; $('#cv-email').value=v.vendor_email||'';
    $('#cv-markup').value=v.markup!=null?v.markup:''; $('#cv-note').value=v.order_note||'';
    $('#cv-codes').innerHTML=CD.courses.map(function(c){ return '<label class="ct-code"><span>'+esc(c.name)+'</span><input class="input" data-code="'+c.id+'" maxlength="40" value="'+esc((v.codes||{})[c.id]||'')+'"></label>'; }).join('');
    $('#cv-state').textContent=r.saved?'마지막 저장 '+String(r.updated_at||'').slice(0,16):'아직 저장한 적이 없습니다. 발주처 이름과 연락처를 한 번 적어 두면 발주할 때 편합니다.';
  }
  function ctFromInquiry(it, order, bookings){
    var d=it.data||{}, c=d.catering||{}, bk=(bookings||[]).filter(function(b){ return b.status!=='cancelled'; })[0];
    CT=blankCT(); CT.ref=it.ref; CT.space=spaceOk(it.space_id||d.space_id); CT.customer=d.name||it.name||''; CT.phone=d.phone||it.phone||''; CT.date=d.date||it.event_date||'';
    CT.time=''; CT.rent=timeText(d,'–'); CT.people=c.people||parseInt(d.headcount||it.headcount,10)||60;
    CT.target={ kind:bk?'booking':'inquiry', key:bk?'B:'+bk.booking_code:'I:'+it.ref, code:bk?bk.booking_code:'', ref:it.ref, name:CT.customer, phone:CT.phone, date:bk&&bk.date?bk.date:CT.date, space_id:CT.space,
      start_h:d.start_h, end_h:d.end_h, t_start:d.t_start, t_end:d.t_end, slot:d.slot, headcount:it.headcount||d.headcount, status:bk?bk.status:it.status, reserve:!!d.reserve, order:order?{ ref:order.ref, status:order.status, total:order.total, summary:order.summary }:null };
    if(order){ ctApplyOrder(order); return; }
    ctApplyConfig(c);
  }
  function ctToQuote(){
    if(!CR||CR.empty){ M.toast('코스나 바베큐·생맥주를 먼저 골라 주세요.'); return; }
    if(!E||!D){ M.toast('요금표를 불러오지 못했습니다.'); return; }
    var label='출장뷔페 · '+CC.parts(CR)+' (부가세 포함)';
    var fresh=!Q.customer && !Q.ref && !Q.extras.length;
    if(fresh){ Q=blankQ(); Q.customer=CT.customer; Q.phone=CT.phone; if(CT.date) Q.date=CT.date; if(CT.people) Q.people=Math.max(1, Math.min(D.people.max, CT.people)); }
    if(CT.ref && !Q.ref) Q.ref=CT.ref;
    Q.extras=Q.extras.filter(function(x){ return String(x.label||'').indexOf('출장뷔페 ·')!==0; });
    Q.extras.push({ label:label, amount:CR.total }); Q.quoteNo='';
    fillForm(); go('quote');
    M.toast('대관 견적의 추가 항목에 출장뷔페 '+won(CR.total)+'을(를) 넣었습니다.');
  }
  /* ---- 예약·문의 불러오기 · 이 건에 저장(대기·확정·취소) · 진행 현황 ----
     저장하면 서버의 catering_orders 표에 예약·문의 하나당 한 건으로 남고, 문의와 연결된 건은 문의의 출장뷔페 정보에도 같은 상태가 들어갑니다. */
  var CST={pending:['대기','cat-pending'],confirmed:['확정','cat-confirmed'],cancelled:['취소','cat-cancelled']};
  function catBadge(o, pre){ if(!o||!o.status) return ''; var x=CST[o.status]||[o.status,'']; return '<span class="cat-st '+x[1]+'">'+esc((pre||'')+x[0])+'</span>'; }
  function catPlain(sum){ return String(sum||'').replace(/\s*—\s*예상.*$/,''); }
  var CTP={ kind:'all', q:'', items:[], timer:null };
  function ctPickCollapse(on){ $('#ct-pick-body').hidden=!!on; $('#ct-pick-toggle').hidden=!on; $('#ct-pick').classList.toggle('picked', !!on); }
  function loadCtTargets(){
    var box=$('#ct-pick-list'); if(!CTP.items.length) box.innerHTML='<div class="empty small">불러오는 중…</div>';
    A('/catering/targets?scope='+(CTP.kind==='past'?'past':'upcoming')+(CTP.q?'&q='+encodeURIComponent(CTP.q):'')).then(function(r){ CTP.items=r.items||[]; drawCtTargets(); }).catch(fail(box));
  }
  function ctKindOk(x){ var k=CTP.kind; if(k==='booking') return x.kind==='booking'; if(k==='inquiry') return x.kind==='inquiry'; if(k==='request') return !!x.request && !x.order; if(k==='ordered') return !!x.order; return true; }
  function ctDay(iso){ return iso?(+iso.slice(5,7))+'.'+(+iso.slice(8,10))+' ('+DOWK[new Date(iso+'T12:00:00').getDay()]+')':'날짜 미정'; }
  function drawCtTargets(){
    var list=CTP.items.filter(ctKindOk), box=$('#ct-pick-list'), sel=CT.target?CT.target.key:'';
    if(!list.length){ box.innerHTML=emptyMsg(CTP.q?'찾는 예약·문의가 없습니다. 이름이나 번호를 다시 확인해 주세요.':CTP.kind==='request'?'출장뷔페 상담을 요청했는데 아직 계산하지 않은 건이 없습니다.':CTP.kind==='ordered'?'출장뷔페를 저장한 건이 없습니다.':'불러올 예약·문의가 없습니다.'); return; }
    box.innerHTML=list.map(function(x){
      var st=x.kind==='booking'?'<span class="st '+((BST[x.status]||[])[1]||'st-ok')+'">'+esc((BST[x.status]||[x.status])[0])+'</span>':stBadge(x.status)+(x.reserve?'<span class="tag-rv">예약 신청</span>':'');
      var cat=x.order?catBadge(x.order,'출장뷔페 ')+'<small>'+esc(won(x.order.total||0))+' · '+esc(catPlain(x.order.summary))+'</small>'
        :x.request?'<span class="cat-st cat-req">출장뷔페 요청</span><small>'+esc(catPlain(x.request))+'</small>':'<span class="tiny muted">출장뷔페 없음</span>';
      return '<button type="button" class="ct-tg'+(x.key===sel?' on':'')+'" data-ctkey="'+esc(x.key)+'">'
        +'<span class="ct-tg-d"><b>'+esc(ctDay(x.date))+'</b><small>'+esc(timeText(x,'–')||'시간 미정')+'</small></span>'
        +'<span class="ct-tg-n"><b>'+esc(x.name||'(이름 없음)')+'</b>'+spaceTag(x.space_id)+'<small>'+esc([x.org, x.phone].filter(Boolean).join(' · '))+'</small></span>'
        +'<span class="ct-tg-s">'+st+'<small>'+esc(x.code||x.ref)+(x.headcount?' · '+x.headcount+'명':'')+'</small></span>'
        +'<span class="ct-tg-c">'+cat+'</span></button>';
    }).join('');
  }
  function ctApplyConfig(c){ if(c.course!==undefined) CT.course=c.course||''; if(c.people) CT.people=+c.people; if(c.bbq) CT.bbq=c.bbq; if(c.beer) CT.beer=+c.beer; if(c.fee!=null && c.by==='admin') CT.fee=c.fee; if(c.note) CT.note=c.note; }
  function ctApplyOrder(o){
    CT.oref=o.ref; CT.order=o; CT.status=o.status||'pending'; CT.course=o.course||''; if(o.people) CT.people=+o.people; CT.bbq=o.bbq||''; CT.beer=+o.beer||0; if(o.fee!=null) CT.fee=o.fee; CT.note=o.note||''; CT.time=o.meal_time||'';
    if(o.date) CT.date=o.date; if(o.customer) CT.customer=o.customer; if(o.phone) CT.phone=o.phone; if(o.space_id) CT.space=o.space_id;
    if(CT.target) CT.target.order={ ref:o.ref, status:o.status, total:o.total, summary:o.summary };
  }
  function ctAfterPick(){ ctFill(); ctCalc(); ctPickCollapse(true); drawCtTargets(); $('#ct-form').scrollIntoView({behavior:'smooth', block:'start'}); }
  function ctSelect(x){
    CT=blankCT(); CT.target=x; CT.ref=x.ref||''; CT.space=spaceOk(x.space_id); CT.customer=(x.name||'')+(x.org&&String(x.name||'').indexOf(x.org)<0?' · '+x.org:''); CT.phone=x.phone||''; CT.date=x.date||''; CT.rent=timeText(x,'–'); if(x.headcount) CT.people=+x.headcount;
    if(x.order){ A('/catering/orders/'+encodeURIComponent(x.order.ref)).then(function(r){ ctApplyOrder(r.item); ctAfterPick(); }).catch(function(e){ if(!guard(e)) M.toast(e.message); ctAfterPick(); }); return; }
    if(x.ref && x.request){ A('/inquiries/'+encodeURIComponent(x.ref)).then(function(r){ ctApplyConfig((r.item.data||{}).catering||{}); ctAfterPick(); }).catch(function(){ ctAfterPick(); }); return; }
    ctAfterPick();
  }
  function ctOpenOrder(o){
    var hit=CTP.items.filter(function(t){ return (o.booking_code && t.code===o.booking_code) || (o.inquiry_ref && t.ref===o.inquiry_ref); })[0];
    var x=hit||{ kind:o.booking_code?'booking':'inquiry', key:o.booking_code?'B:'+o.booking_code:'I:'+o.inquiry_ref, code:o.booking_code, ref:o.inquiry_ref, name:o.customer, phone:o.phone, date:o.date, space_id:o.space_id, headcount:o.people, status:o.target_status||'', order:null };
    CT=blankCT(); CT.target=x; CT.ref=x.ref||''; CT.space=spaceOk(x.space_id); CT.rent=timeText(x,'–'); CT.customer=x.name||''; CT.phone=x.phone||''; CT.date=x.date||'';
    ctApplyOrder(o); ctAfterPick();
  }
  function ctLinkHtml(){
    var t=CT.target;
    if(!t) return '<span class="small muted">연결된 예약·문의가 없습니다. 위 ① 목록에서 고르면 그 건 기준으로 계산하고 저장할 수 있습니다. 고르지 않고 계산만 해서 안내문을 복사해도 됩니다.</span>';
    return '<div class="ct-target"><span class="ct-target-k '+(t.kind==='booking'?'bk':'iq')+'">'+(t.kind==='booking'?'예약 확정':'예약 문의')+'</span><b>'+esc(t.name||CT.customer||'')+'</b>'+spaceTag(t.space_id)
      +'<span class="small">'+esc([t.code||t.ref, t.date?kd(t.date):'날짜 미정', CT.rent, t.headcount?t.headcount+'명':''].filter(Boolean).join(' · '))+'</span>'+(CT.order?catBadge(CT.order,'출장뷔페 '):'')+'</div>'
      +'<div class="row" style="gap:6px">'+(t.ref?'<button type="button" class="btn btn-light btn-sm" id="ct-open-ref">문의 열기</button>':'')+'<button type="button" class="btn btn-light btn-sm" id="ct-unlink">연결 해제</button></div>';
  }
  function ctSaveUi(){
    var has=!!CT.target;
    $$('#ct-save-box input[name=ct-status]').forEach(function(i){ i.checked=i.value===CT.status; i.disabled=!has; i.closest('.ct-st-o').classList.toggle('on', i.checked); });
    $('#ct-save').disabled=!has; $('#ct-del').hidden=!CT.oref; $('#ct-save-box').classList.toggle('off', !has);
    $('#ct-save-state').innerHTML=CT.order?esc(CT.order.ref)+' '+catBadge(CT.order)+' 저장됨':'';
    $('#ct-save-hint').textContent=!has?'위 ① 목록에서 예약이나 문의를 고르면 이 계산을 그 건에 저장하고 대기·확정을 관리할 수 있습니다.'
      :CT.order?'구성이나 상태를 바꾼 뒤 다시 저장하면 같은 건이 고쳐집니다. 문의와 연결된 건은 문의 목록·상세에도 바로 반영됩니다.'
      :'처음에는 \'대기\'로 저장해 두고 상담을 이어 가다가, 고객이 확정하면 \'확정\'으로 바꿔 저장하세요.';
  }
  function ctSave(){
    ctCalc(); var t=CT.target, msg=$('#ct-msg'); msg.hidden=true;
    if(!t) return M.toast('먼저 위 ① 목록에서 예약이나 문의를 골라 주세요.');
    if(!CR||CR.empty) return M.toast('코스나 바베큐·생맥주를 먼저 골라 주세요.');
    var ck=$('#ct-save-box input[name=ct-status]:checked'), b=$('#ct-save'); b.disabled=true;
    var body={ inquiry_ref:t.ref||'', booking_code:t.code||'', status:ck?ck.value:'pending', meal_time:CT.time, date:CT.date, customer:CT.customer, phone:CT.phone, space_id:CT.space,
      config:{ course:CT.course, people:CT.people, bbq:CT.bbq, beer:CT.beer, fee:CT.fee, note:CT.note } };
    A('/catering/orders',{method:'POST', body:body}).then(function(r){
      ctApplyOrder(r.item); ctFill(); ctCalc();
      M.toast((t.name?t.name+' 님 ':'')+'출장뷔페를 \''+r.item.status_label+'\'(으)로 저장했습니다 · '+won(r.item.total)+' (부가세 포함)');
      loadCtOrders(); loadCtTargets(); refreshLists();
    }).catch(function(e){ if(!guard(e)) note(msg, e.message); }).finally(function(){ b.disabled=!CT.target; });
  }
  var COS={ f:'active', items:[], counts:{} };
  function cosQuery(){ var f=COS.f; return f==='active'?'status=active&scope=upcoming':f==='pending'||f==='confirmed'?'status='+f+'&scope=upcoming':f==='cancelled'?'status=cancelled&scope=all':f==='past'?'scope=past':'scope=all'; }
  function loadCtOrders(){
    var box=$('#ct-orders'); if(!COS.items.length) box.innerHTML='<div class="empty small">불러오는 중…</div>';
    A('/catering/orders?'+cosQuery()).then(function(r){ COS.items=r.items||[]; COS.counts=r; setCount('catering', (r.catering_pending||0)+(r.catering_requested||0)); drawCtOrders(); }).catch(fail(box));
  }
  function drawCtOrders(){
    var r=COS.counts||{}, list=COS.items, box=$('#ct-orders');
    var sumConf=list.filter(function(o){ return o.status==='confirmed'; }).reduce(function(a,o){ return a+(+o.total||0); },0);
    $('#ct-kpis').innerHTML='<button type="button" class="kpi'+(r.catering_pending?' hot':'')+'" data-cos-go="pending"><small>대기 (다가오는 행사)</small><b>'+(r.catering_pending||0)+'<span class="small">건</span></b><span class="tiny muted">고객 확정을 기다리는 출장뷔페</span></button>'
      +'<button type="button" class="kpi" data-cos-go="confirmed"><small>확정 (다가오는 행사)</small><b>'+(r.catering_confirmed||0)+'<span class="small">건</span></b><span class="tiny muted">발주·최종 인원 확인 대상</span></button>'
      +'<button type="button" class="kpi'+(r.catering_requested?' warn':'')+'" data-ctk-go="request"><small>고객 요청만 있음</small><b>'+(r.catering_requested||0)+'<span class="small">건</span></b><span class="tiny muted">신청서에서 상담 요청 · 아직 계산 전</span></button>'
      +'<div class="kpi"><small>이 목록의 확정 금액</small><b class="ct-sum">'+esc(won(sumConf))+'</b><span class="tiny muted">부가세 포함 고객 금액 합계</span></div>';
    if(!list.length){ box.innerHTML=emptyMsg(COS.f==='active'?'아직 저장한 출장뷔페가 없습니다. 위 ① 목록에서 예약·문의를 골라 계산한 뒤 \'이 건에 저장\'을 누르세요.':'해당하는 출장뷔페가 없습니다.'); return; }
    var today=todayIso();
    box.innerHTML='<table class="rs-table ct-otable"><thead><tr><th>행사일</th><th>고객</th><th>연결된 건</th><th>구성</th><th class="r">금액</th><th>상태</th><th></th></tr></thead><tbody>'+list.map(function(o){
      var link=o.booking_code?'<span class="st '+((BST[o.target_status]||[])[1]||'st-ok')+'">'+esc((BST[o.target_status]||['예약'])[0])+'</span><small>'+esc(o.booking_code)+'</small>'
        :o.inquiry_ref?stBadge(o.target_status||'문의')+'<small>'+esc(o.inquiry_ref)+'</small>':'';
      var acts=(o.status!=='confirmed'?'<button class="btn btn-light btn-xs btn-ok" type="button" data-cosact="confirmed" data-coref="'+esc(o.ref)+'">확정</button>':'')
        +(o.status!=='pending'?'<button class="btn btn-light btn-xs" type="button" data-cosact="pending" data-coref="'+esc(o.ref)+'">대기</button>':'')
        +(o.status!=='cancelled'?'<button class="btn btn-light btn-xs" type="button" data-cosact="cancelled" data-coref="'+esc(o.ref)+'">취소</button>':'');
      return '<tr class="rs-row ct-orow co-'+esc(o.status)+(o.status==='cancelled'?' cancelled':'')+(o.date&&o.date<today?' past':'')+(CT.oref===o.ref?' is-cur':'')+'" data-coopen="'+esc(o.ref)+'" tabindex="0">'
        +'<td data-th="행사일"><b>'+esc(o.date?kd(o.date):'날짜 미정')+'</b><small>'+esc(o.meal_time?o.meal_time+' 식사':'')+'</small></td>'
        +'<td data-th="고객"><b>'+esc(o.customer)+'</b>'+spaceTag(o.space_id)+'<small>'+esc(o.phone||'')+'</small></td>'
        +'<td data-th="연결">'+link+'</td>'
        +'<td data-th="구성">'+esc(catPlain(o.summary))+(o.note?'<small>'+esc(o.note)+'</small>':'')+'</td>'
        +'<td data-th="금액" class="r"><b>'+esc(won(o.total||0))+'</b><small>부가세 포함</small></td>'
        +'<td data-th="상태">'+catBadge(o)+'</td>'
        +'<td class="rs-acts">'+acts+'</td></tr>';
    }).join('')+'</tbody></table>';
  }
  function ctQuick(ref, status){
    var o=COS.items.filter(function(x){ return x.ref===ref; })[0]; if(!o) return;
    if(status==='cancelled' && !confirm(o.customer+' 님 출장뷔페를 취소로 바꿀까요?')) return;
    A('/catering/orders/'+encodeURIComponent(ref),{method:'PATCH', body:{status:status}}).then(function(r){
      M.toast(o.customer+' 님 출장뷔페를 \''+r.item.status_label+'\'(으)로 바꿨습니다.');
      if(CT.oref===ref){ ctApplyOrder(r.item); ctFill(); }
      loadCtOrders(); loadCtTargets(); refreshLists();
    }).catch(function(e){ if(!guard(e)) M.toast(e.message); });
  }
  if($('#ct-form')){
    $('#ct-form').addEventListener('input', ctCalc); $('#ct-form').addEventListener('change', ctCalc);
    $('#ct-reset').addEventListener('click', function(){ CT=blankCT(); ctFill(); ctCalc(); ctPickCollapse(false); drawCtTargets(); $$('#ct-check input').forEach(function(x){ x.checked=false; }); $('#ct-msg').hidden=true; });
    $('#ct-copy-cust').addEventListener('click', function(){ ctCalc(); if(!CR||CR.empty) return M.toast('구성을 먼저 골라 주세요.'); ctCopy(ctCustText(), '고객 안내문을 복사했습니다. 카카오톡·문자에 붙여 넣으세요.'); });
    $('#ct-copy-menu').addEventListener('click', function(){ ctCalc(); var t=ctMenuText(); if(!t) return M.toast('코스를 먼저 골라 주세요.'); ctCopy(t, '코스 메뉴를 복사했습니다.'); });
    $('#ct-copy-order').addEventListener('click', function(){ ctCalc(); if(!CR||CR.empty) return M.toast('구성을 먼저 골라 주세요.'); if(!CSET) return M.toast('발주처 정보를 불러온 뒤 다시 눌러 주세요.'); ctCopy(ctOrderText(), '발주 메모를 복사했습니다.'+(CSET.vendor_name?' '+CSET.vendor_name+'에 보내 주세요.':'')); });
    $('#ct-to-quote').addEventListener('click', function(){ ctCalc(); ctToQuote(); });
    $('#ct-pick').addEventListener('click', function(e){
      var k=e.target.closest('[data-ctk]'); if(k){ var was=CTP.kind; CTP.kind=k.dataset.ctk; $$('#ct-pick [data-ctk]').forEach(function(b){ b.classList.toggle('on', b===k); }); if((was==='past')!==(CTP.kind==='past')) loadCtTargets(); else drawCtTargets(); return; }
      var t=e.target.closest('[data-ctkey]'); if(t){ var x=CTP.items.filter(function(i){ return i.key===t.dataset.ctkey; })[0]; if(x) ctSelect(x); }
    });
    $('#ct-pick-toggle').addEventListener('click', function(){ ctPickCollapse(false); setTimeout(function(){ $('#ct-pick-q').focus(); }, 30); });
    $('#ct-pick-q').addEventListener('input', function(){ clearTimeout(CTP.timer); var v=this.value.trim(); CTP.timer=setTimeout(function(){ CTP.q=v; loadCtTargets(); }, 250); });
    $('#ct-save').addEventListener('click', ctSave);
    $('#ct-save-box').addEventListener('change', function(e){ if(e.target.name==='ct-status'){ CT.status=e.target.value; ctSaveUi(); } });
    $('#ct-del').addEventListener('click', function(){
      if(!CT.oref || !confirm('저장한 출장뷔페('+CT.oref+')를 지울까요? 고객이 취소한 경우라면 상태를 \'취소\'로 저장하는 편이 기록이 남습니다.')) return;
      A('/catering/orders/'+encodeURIComponent(CT.oref),{method:'DELETE'}).then(function(){ M.toast('저장한 출장뷔페를 지웠습니다.'); CT.oref=''; CT.order=null; CT.status='pending'; if(CT.target) CT.target.order=null; ctFill(); ctCalc(); loadCtOrders(); loadCtTargets(); refreshLists(); })
      .catch(function(e){ if(!guard(e)) M.toast(e.message); });
    });
    $('#ct-board').addEventListener('click', function(e){
      var c=e.target.closest('[data-cos]'); if(c){ COS.f=c.dataset.cos; $$('#ct-board [data-cos]').forEach(function(b){ b.classList.toggle('on', b===c); }); loadCtOrders(); return; }
      var g=e.target.closest('[data-cos-go]'); if(g){ var gb=$('#ct-board [data-cos="'+g.dataset.cosGo+'"]'); if(gb) gb.click(); return; }
      var rq=e.target.closest('[data-ctk-go]'); if(rq){ ctPickCollapse(false); var kb=$('#ct-pick [data-ctk="'+rq.dataset.ctkGo+'"]'); if(kb) kb.click(); $('#ct-pick').scrollIntoView({behavior:'smooth', block:'start'}); return; }
      var q=e.target.closest('[data-cosact]'); if(q){ ctQuick(q.dataset.coref, q.dataset.cosact); return; }
      if(e.target.closest('a,button')) return;
      var row=e.target.closest('[data-coopen]'); if(row){ var o=COS.items.filter(function(x){ return x.ref===row.dataset.coopen; })[0]; if(o) ctOpenOrder(o); }
    });
    $('#ct-board').addEventListener('keydown', function(e){ if(e.key!=='Enter') return; var row=e.target.closest('[data-coopen]'); if(row && e.target===row){ var o=COS.items.filter(function(x){ return x.ref===row.dataset.coopen; })[0]; if(o) ctOpenOrder(o); } });
    $('#ct-faq').addEventListener('click', function(e){ var b=e.target.closest('[data-fq]'); if(!b) return; ctCopy(ctFaq()[+b.dataset.fq][1], '답변을 복사했습니다.'); });
    $('#ct-check').addEventListener('change', function(){ var n=$$('#ct-check input:checked').length; $('#ct-check').classList.toggle('all', n===CT_CHECK.length); });
    $('#ct-vendor').addEventListener('submit', function(e){
      e.preventDefault(); var b=$('#cv-save'); b.disabled=true;
      var codes={}; $$('#cv-codes [data-code]').forEach(function(i){ codes[i.dataset.code]=i.value.trim(); });
      var v={ vendor_name:$('#cv-name').value.trim(), vendor_manager:$('#cv-manager').value.trim(), vendor_phone:$('#cv-phone').value.trim(), vendor_kakao:$('#cv-kakao').value.trim(), vendor_email:$('#cv-email').value.trim(),
        markup:$('#cv-markup').value===''?5000:+$('#cv-markup').value, order_note:$('#cv-note').value.trim(), codes:codes };
      A('/settings/catering',{method:'PUT', body:{value:v}}).then(function(r){ CSET=r.value; ctVendorFill({ value:r.value, saved:true, updated_at:new Date(Date.now()+9*3600e3).toISOString().replace('T',' ') }); ctCalc(); M.toast('발주처 정보를 저장했습니다.'); })
      .catch(function(x){ if(!guard(x)) $('#cv-state').textContent=x.message; }).finally(function(){ b.disabled=false; });
    });
  }

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
  // 0시는 00:00, 다음 날 시각은 '익일 00:00'부터 표시
  function hl(h){ h=+h; return (h>=24?'익일 ':'')+('0'+(h%24)).slice(-2)+':00'; }
  function bkTimes(sh, eh){
    if(!E||!D) return;
    $('#bk-start').innerHTML=nwHourOpts(ADMIN_HOURS.from, ADMIN_HOURS.to-1, sh==null?'':sh, '미정');
    $('#bk-end').innerHTML=nwHourOpts(sh?+sh+1:ADMIN_HOURS.from+1, ADMIN_HOURS.to, eh==null?'':eh, '미정');
    $('#bk-pkgs').innerHTML=D.packages.map(function(p){ return '<button type="button" class="chip" data-bkpkg="'+p.id+'">'+esc(p.label)+' '+esc(p.time)+'</button>'; }).join('');
    bkSync();
  }
  function bkSync(){
    if(!E||!D) return;
    var sh=$('#bk-start').value, eh=$('#bk-end').value, slot='custom';
    D.packages.forEach(function(p){ var on=sh && +sh===p.start && +eh===p.end; if(on) slot='pkg-'+p.id; var b=$('#bk-pkgs [data-bkpkg="'+p.id+'"]'); if(b) b.classList.toggle('on', !!on); });
    $('#bk-slot').value=slot;
    var date=$('#bk-date').value, h=$('#bk-amount-hint');
    useSpace($('#bk-space').value);
    if(date && sh && eh){ var q=E.quote({ adminHours:true, date:date, start:+sh, end:+eh, people:Math.max(1,parseInt($('#bk-people').value,10)||D.people.base) }); h.innerHTML=q?'요금표 기준 '+esc(won(q.total))+' (옵션·할인 제외) <button type="button" class="linkish" id="bk-use-calc">넣기</button>':''; var u=$('#bk-use-calc'); if(u&&q) u.addEventListener('click', function(){ $('#bk-amount').value=q.total; }); }
    else h.textContent='';
  }
  bkTimes();
  $('#bk-start').addEventListener('change', function(){ var sh=this.value, eh=$('#bk-end').value; $('#bk-end').innerHTML=nwHourOpts(sh?+sh+1:ADMIN_HOURS.from+1, ADMIN_HOURS.to, eh&&+eh>+sh?eh:'', '미정'); bkSync(); });
  ['#bk-end','#bk-date','#bk-people'].forEach(function(sel){ $(sel).addEventListener('change', bkSync); });
  $('#bk-pkgs').addEventListener('click', function(e){ var b=e.target.closest('[data-bkpkg]'); if(!b) return; var p=E.findPkg(b.dataset.bkpkg); bkTimes(p.start, p.end); });
  function bookingFromInquiry(it){
    var d=it.data||{}; $('#bk-ref').value=it.ref; $('#bk-name').value=d.name||it.name||''; $('#bk-phone').value=d.phone||it.phone||''; $('#bk-date').value=d.date||it.event_date||''; $('#bk-people').value=d.headcount||it.headcount||'';
    var sh=d.start_h, eh=d.end_h; if(sh==null && SLOT_H[d.slot]){ sh=SLOT_H[d.slot][0]; eh=SLOT_H[d.slot][1]; }
    if(sh==null && d.t_start && d.t_end){ var a=parseInt(d.t_start,10), b=parseInt(d.t_end,10); if(!isNaN(a)&&!isNaN(b)){ if(b<=a) b+=24; sh=a; eh=b; } }
    bkTimes(sh, eh);
    var lastQ=(cur&&cur.quotes&&cur.quotes[0]); $('#bk-amount').value=currentAmount(it,lastQ)==null?'':currentAmount(it,lastQ); bkSync();
    $('#bk-memo').value=[lastQ?'견적 '+lastQ.quote_no+' · '+won(lastQ.total):'', d.amount_note||''].filter(Boolean).join(' · ');
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
      return '<div class="adm-row"'+(b.inquiry_ref?' data-ref="'+esc(b.inquiry_ref)+'"':'')+'><div class="r1"><b>'+esc(b.customer_name)+'</b>'+spaceTag(b.space_id)+'<span class="st '+st[1]+'">'+st[0]+'</span>'+depositControl(b)+'</div><div class="r2">'+esc(kd(b.date))+' · '+esc(b.start_h!=null&&b.end_h!=null?hl(b.start_h)+'–'+hl(b.end_h):(SLOT[b.slot]||b.slot||''))+(b.headcount?' · '+b.headcount+'명':'')+(b.amount!=null?' · <b>'+esc(won(b.amount))+'</b>':'')+'</div>'+(b.memo?'<div class="tiny muted">'+esc(b.memo)+'</div>':'')+'<div class="r3"><span>'+esc(b.booking_code)+(b.inquiry_ref?' · '+esc(b.inquiry_ref):'')+' · <a href="tel:'+esc(b.phone)+'">'+esc(b.phone)+'</a></span><span>'+(b.status!=='cancelled'?cdBtn(b.booking_code, b.confirm_issued, 'btn-sm')+' ':'')+(b.status==='confirmed'?'<button class="btn btn-light btn-sm" type="button" data-bk="completed" data-code="'+esc(b.booking_code)+'">이용 완료</button> <button class="btn btn-light btn-sm" type="button" data-bk="cancelled" data-code="'+esc(b.booking_code)+'">취소</button>':'')+'</span></div></div>';
    }).join(''):emptyMsg('해당하는 예약이 없습니다.');
  }
  $('#bk-filter').addEventListener('change', drawBookings); $('#bk-reload').addEventListener('click', loadBookings);
  $('#bk-list').addEventListener('click', changeDeposit);
  $('#bk-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-bk]'); if(!b) return; var s=b.dataset.bk;
    if(!confirm(s==='completed'?'이용 완료로 처리할까요? 처리 후 고객이 예약번호로 후기를 쓸 수 있습니다.':'이 예약을 취소할까요? 달력의 마감 표시도 풀립니다.')) return;
    A('/bookings/'+b.dataset.code,{method:'PATCH', body:{status:s}}).then(function(){ M.toast('변경했습니다.'); loadBookings(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); });
  $('#bk-form').addEventListener('submit', function(e){ e.preventDefault(); var f=e.target; if(!M.validate(f)) return; var d=M.formData(f); d.block_calendar=!!f.block_calendar.checked;
    A('/bookings',{method:'POST', body:d}).then(function(r){ var m=$('#bk-msg'); note(m,'예약을 등록했습니다. 예약번호 '+r.booking_code+' — 고객에게 안내해 주세요. ',true); m.insertAdjacentHTML('beforeend', cdBtn(r.booking_code, false, 'btn-sm')); f.reset(); fillSpaces(); bkTimes(); loadBookings(); })
    .catch(function(x){ if(!guard(x)) note($('#bk-msg'), x.message); }); });

  /* =================== 일자별 예약 · 문의 (예약 확정 / 예약 문의 후보) =================== */
  var RS={ range:'upcoming', kind:'all', items:[], today:todayIso(), undated:0 };
  var DOWK=['일','월','화','수','목','금','토'];
  function isoAdd(iso,n){ return E?E.addDays(iso,n):iso; }
  function rangeOf(k){
    var t=todayIso(), d=new Date(t+'T12:00:00'), y=d.getFullYear(), m=d.getMonth();
    var iso=function(x){ return x.getFullYear()+'-'+M.pad2(x.getMonth()+1)+'-'+M.pad2(x.getDate()); };
    if(k==='week'){ var dow=(d.getDay()+6)%7, mon=new Date(d); mon.setDate(d.getDate()-dow); var sun=new Date(mon); sun.setDate(mon.getDate()+6); return [iso(mon), iso(sun)]; }
    if(k==='month') return [iso(new Date(y,m,1)), iso(new Date(y,m+1,0))];
    if(k==='next') return [iso(new Date(y,m+1,1)), iso(new Date(y,m+2,0))];
    if(k==='past') return ['', isoAdd(t,-1)];
    return [t, ''];
  }
  function setRange(k){ RS.range=k; var r=rangeOf(k); $('#rs-from').value=r[0]; $('#rs-to').value=r[1]; $$('#view-resv [data-range]').forEach(function(b){ b.classList.toggle('on', b.dataset.range===k); }); }
  function loadResv(){
    if(!$('#rs-from').value && !$('#rs-to').value) setRange(RS.range);
    var box=$('#rs-list'); box.innerHTML='<div class="empty small">불러오는 중…</div>';
    A('/reservations?from='+encodeURIComponent($('#rs-from').value)+'&to='+encodeURIComponent($('#rs-to').value)).then(function(r){ RS.items=r.items||[]; RS.visits=r.visits||[]; RS.today=r.today||todayIso(); RS.undated=r.undated||0; drawResv(); }).catch(fail(box));
  }
  var BST={confirmed:['예약 확정','st-ok'],completed:['이용 완료','st-done'],cancelled:['취소','st-cancel']};
  // 상태·경로·검색으로 거른 목록 (구분 탭은 아직 적용 전) — 날짜별 확정/후보 개수는 이 목록으로 셉니다
  function resvBase(){
    var st=$('#rs-status').value, ch=$('#rs-ch').value, sp=$('#rs-space')?$('#rs-space').value:'', q=$('#rs-q').value.trim().toLowerCase().replace(/-/g,'');
    return RS.items.filter(function(it){
      if(sp && spKey(it.space_id)!==sp) return false;
      if(it.kind==='booking'){ if(st==='active' && it.status==='cancelled') return false; if(st && st!=='active' && it.status!==st) return false; }
      else { if(st==='active' && it.status==='대기 취소') return false; if(st==='cancelled' && it.status!=='대기 취소') return false; if(st && st!=='active' && st!=='cancelled') return false; }
      if(ch && (it.channel||'')!==ch) return false;
      if(q){ var hay=[it.name,it.phone,it.code,it.ref,it.memo].join(' ').toLowerCase().replace(/-/g,''); if(hay.indexOf(q)<0) return false; }
      return true;
    });
  }
  function resvFiltered(){
    var base=resvBase(), list=RS.kind==='all'?base:base.filter(function(it){ return it.kind===RS.kind; });
    if(RS.range==='past') list=list.slice().reverse();
    return list;
  }
  function resvTime(it){ if(it.start_h!=null&&it.end_h!=null) return hl(it.start_h)+'–'+hl(it.end_h); if(it.t_start&&it.t_end) return it.t_start+'–'+it.t_end; return SLOT[it.slot]||'시간 미정'; }
  function resvHours(it){ return it.start_h!=null&&it.end_h!=null?(it.end_h-it.start_h)+'시간':''; }
  function dLabel(iso){ var n=E?E.diffDays(RS.today, iso):null; if(n===0) return '<em class="rs-d today">오늘</em>'; if(n===1) return '<em class="rs-d soon">내일</em>'; if(n>1&&n<=7) return '<em class="rs-d soon">D-'+n+'</em>'; return ''; }
  var SRC={adjusted:'운영자 수정 금액',booking:'예약 금액',order:'온라인 결제',quote:'견적',estimate:'예상'};
  // 예약 대기 순번: 같은 날 확정되지 않은 예약 문의를 저장한 순번(wait_rank) → 없으면 문의가 들어온 순서로 1, 2, 3…
  function waitCmp(a,b){ var ra=a.wait_rank==null?1e9:+a.wait_rank, rb=b.wait_rank==null?1e9:+b.wait_rank; if(ra!==rb) return ra-rb; var ca=String(a.wait_restored_at||a.created_at||''), cb=String(b.wait_restored_at||b.created_at||''); if(ca!==cb) return ca<cb?-1:1; return String(a.ref)<String(b.ref)?-1:1; }
  // 대기 순번은 공간(1호·2호)마다 따로 셉니다
  function waitOrder(){ var by={}; RS.items.forEach(function(it){ if(it.kind==='pending' && it.status!=='대기 취소'){ var k=it.date+'|'+spKey(it.space_id); (by[k]=by[k]||[]).push(it); } });
    Object.keys(by).forEach(function(d){ by[d].sort(waitCmp).forEach(function(it,i){ it._wait=i+1; it._waitN=by[d].length; }); }); return by; }
  // 검색·경로·상태 필터를 쓰는 중에는 일부만 보여서 순번을 끌어 바꾸지 않습니다
  function waitDraggable(){ var st=$('#rs-status').value; return !$('#rs-ch').value && !($('#rs-space')&&$('#rs-space').value) && !$('#rs-q').value.trim() && (st===''||st==='active'); }
  // 날짜별 집계 — 전체(bk·pend)와 공간별(sp[공간].bk·pend)을 함께 셉니다. 겹침 표시는 같은 공간 안에서만 봅니다.
  function dayStats(base){ var day={}; base.forEach(function(it){ var x=day[it.date]||(day[it.date]={bk:0,pend:0,bkList:[],sp:{}}); var k=spKey(it.space_id), s=x.sp[k]||(x.sp[k]={bk:0,pend:0}); if(it.kind==='booking'){ if(it.status!=='cancelled'){ x.bk++; s.bk++; x.bkList.push(it); } } else if(it.status!=='대기 취소'){ x.pend++; s.pend++; } else x.cancelled=(x.cancelled||0)+1; }); return day; }
  function spClash(x){ var sp=x&&x.sp||{}; return Object.keys(sp).some(function(k){ var s=sp[k]; return s.pend>0 && (s.bk>0 || s.pend>1); }); }
  function drawResv(){
    waitOrder();
    var base=resvBase(), list=resvFiltered(), box=$('#rs-list'), day=dayStats(base);
    var cnt={ all:base.length, booking:base.filter(function(x){ return x.kind==='booking'; }).length, pending:base.filter(function(x){ return x.kind==='pending' && x.status!=='대기 취소'; }).length };
    $$('#rs-tabs [data-kind]').forEach(function(b){ b.setAttribute('aria-selected', String(b.dataset.kind===RS.kind)); var em=b.querySelector('em'); if(em) em.textContent=cnt[b.dataset.kind]; });
    var bk=list.filter(function(x){ return x.kind==='booking' && x.status!=='cancelled'; }), pend=list.filter(function(x){ return x.kind==='pending' && x.status!=='대기 취소'; });
    var sum=bk.reduce(function(a,x){ return a+(+x.amount||0); },0), noAmt=bk.filter(function(x){ return x.amount==null; }).length;
    var clashDays=Object.keys(day).filter(function(k){ return spClash(day[k]); }).length;
    var rv=pend.filter(function(x){ return x.reserve; }).length;
    $('#rs-kpis').innerHTML='<div class="kpi"><small>예약 확정</small><b>'+bk.length+'<span class="small">건</span></b></div>'
      +'<div class="kpi"><small>확정 금액 합계</small><b>'+esc(man(sum))+'</b>'+(noAmt?'<span class="tiny muted">금액 미입력 '+noAmt+'건</span>':'')+'</div>'
      +'<div class="kpi'+(pend.length?' hot':'')+'"><small>예약 문의 (미정)</small><b>'+pend.length+'<span class="small">건</span></b>'+(rv?'<span class="tiny">홈페이지 예약 신청 '+rv+'건</span>':'')+'</div>'
      +'<div class="kpi'+(clashDays?' warn':'')+'"><small>후보가 겹치는 날</small><b>'+clashDays+'<span class="small">일</span></b><span class="tiny muted">확정 예약이 있거나 후보가 2건 이상</span></div>';
    var und=RS.undated?'<div class="rs-note">날짜가 정해지지 않은 예약 문의 <b>'+RS.undated+'건</b>은 일자별 목록에 나오지 않습니다. <button type="button" class="linkish" data-go="inq:open">문의 관리에서 보기 →</button></div>':'';
    if(!list.length){ box.innerHTML=und+emptyMsg('이 기간에 해당하는 예약이 없습니다.'); return; }
    var months={}, mOrder=[];
    list.forEach(function(it){ var mk=String(it.date).slice(0,7); if(!months[mk]){ months[mk]={ days:{}, order:[] }; mOrder.push(mk); } var mo=months[mk]; if(!mo.days[it.date]){ mo.days[it.date]=[]; mo.order.push(it.date); } mo.days[it.date].push(it); });
    var head='<thead><tr><th>구분</th><th>시간</th><th>예약자</th><th>경로</th><th>인원</th><th class="r">금액</th><th>진행</th><th>보증금</th><th>운영 메모</th><th></th></tr></thead>';
    box.innerHTML=und+mOrder.map(function(mk){
      var mo=months[mk], all=[]; mo.order.forEach(function(dk){ all=all.concat(mo.days[dk]); });
      var gb=all.filter(function(x){ return x.kind==='booking'&&x.status!=='cancelled'; }), gp=all.filter(function(x){ return x.kind==='pending' && x.status!=='대기 취소'; }), gs=gb.reduce(function(a,x){ return a+(+x.amount||0); },0);
      return '<div class="rs-group"><div class="rs-ghead"><b>'+(+mk.slice(0,4))+'년 '+(+mk.slice(5,7))+'월</b><span>확정 '+gb.length+'건 · '+esc(won(gs))+(gp.length?' · 예약 문의 '+gp.length+'건':'')+'</span></div>'
        +mo.order.map(function(dk){
          var rows=mo.days[dk].slice().sort(function(a,b){ if(a.kind!==b.kind) return a.kind==='booking'?-1:1; if(a.kind==='pending'){ if((a.status==='대기 취소')!==(b.status==='대기 취소')) return a.status==='대기 취소'?1:-1; return (a._wait||99)-(b._wait||99); } return (a.start_h==null?99:a.start_h)-(b.start_h==null?99:b.start_h); });
          var x=day[dk]||{bk:0,pend:0}, dt=new Date(dk+'T12:00:00'), dow=dt.getDay(), off=E&&E.isOff(dk), past=dk<RS.today, clash=spClash(x);
          var pk=(E0&&E0.peakOf)?E0.peakOf(dk):null;   // 성수기 표시는 1호 요금표 기준 (12월·1월은 두 공간이 같고 10/30·31만 1호)
          var vn=(RS.visits||[]).filter(function(v){ return v.date===dk && v.status!=='done' && (!$('#rs-space')||!$('#rs-space').value||spKey(v.space_id)===$('#rs-space').value); }).length;
          return '<div class="rs-day'+(clash?' clash':'')+(past?' past':'')+(dk===RS.today?' is-today':'')+'">'
            +'<div class="rs-dhead"><b class="rs-date'+(off||dow===0?' off':'')+(dow===6?' sat':'')+'">'+(+dk.slice(5,7))+'.'+(+dk.slice(8,10))+' ('+DOWK[dow]+')</b>'+dLabel(dk)+(pk?'<span class="rs-peak">성수기</span>':'')
            +'<span class="rs-dsum">'+(x.bk?'<span class="st st-ok">확정 '+x.bk+'</span>':'')+(x.pend?'<span class="st st-new">대기 '+x.pend+'</span>':'')+(x.cancelled?'<span class="st st-done">대기 취소 '+x.cancelled+'</span>':'')+'</span>'
            +(clash?'<span class="rs-clash">'+(x.bk?'확정 예약이 있는 날 · 대기 '+x.pend+'명':'같은 날 대기 '+x.pend+'명')+'</span>':'')
            +(vn?'<button type="button" class="rs-vchip" data-vday="'+esc(dk)+'" title="이날 현장답사 일정 보기">현장답사 '+vn+'건 →</button>':'')
            +(x.pend>1&&RS.kind!=='booking'?'<span class="rs-hint">'+(waitDraggable()?'⠿ 끌어서 대기 순번 변경':'검색·필터를 풀면 대기 순번을 바꿀 수 있습니다')+'</span>':'')+'</div>'
            +'<table class="rs-table">'+head+'<tbody>'+rows.map(function(it){ return resvRow(it, x, past); }).join('')+'</tbody></table></div>';
        }).join('')+'</div>';
    }).join('');
  }
  function resvRow(it, x, past){
    var isB=it.kind==='booking', waitCancelled=it.status==='대기 취소', st=isB?(BST[it.status]||[it.status,'']):[it.status,ST_CLS[it.status]||'st-new'];
    var grip=(!isB && !waitCancelled && it._waitN>1)?'<button type="button" class="rs-grip" data-wdate="'+esc(it.date)+'"'+(waitDraggable()?'':' disabled')+' title="끌어서 대기 순번 바꾸기 (키보드: 위·아래 화살표)" aria-label="'+esc(it.name||'')+' 대기 순번 바꾸기, 현재 '+it._wait+'번"><svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg></button>':'';
    var kind=isB?'<span class="kind kind-bk">확정</span>':waitCancelled?'<span class="kind kind-cancel">대기 취소</span>':grip+'<span class="kind kind-pd wait-no" title="같은 날 예약 대기 순번">대기 <b>'+(it._wait||1)+'</b>번</span>'+(it.reserve?'<span class="tag-rv">예약 신청</span>':'');
    var tel=String(it.phone||'').replace(/[^0-9+]/g,'');
    var acts=(tel?'<a class="btn btn-light btn-xs" href="tel:'+esc(tel)+'" aria-label="전화">전화</a>':'');
    if(isB && it.status!=='cancelled' && it.code) acts+=cdBtn(it.code, it.confirm_issued);
    if(isB && it.status==='confirmed') acts+=(past?'<button class="btn btn-light btn-xs" type="button" data-rsact="completed" data-code="'+esc(it.code)+'">이용 완료</button>':'')+'<button class="btn btn-light btn-xs" type="button" data-rsact="cancelled" data-code="'+esc(it.code)+'">취소</button>';
    if(!isB && waitCancelled) acts+='<button class="btn btn-light btn-xs" type="button" data-waitact="restore" data-ref="'+esc(it.ref)+'">대기 복원</button>';
    if(!isB && !waitCancelled) acts+='<button class="btn btn-light btn-xs" type="button" data-waitact="cancel" data-ref="'+esc(it.ref)+'">대기 취소</button>';
    if(!isB && !waitCancelled) acts+='<button class="btn btn-primary btn-xs" type="button" data-rsconfirm="'+esc(it.ref)+'">확정</button>';
    var chs=it.channel==='online'?'<span class="ch-tag ch-online">온라인 결제</span>':(it.channel?chTag(it.channel, it.channel_note):'<span class="muted">—</span>');
    return '<tr class="rs-row '+(isB?'booking':'pending')+(waitCancelled?' cancelled wait-cancelled':it.status==='cancelled'?' cancelled':'')+(past?' past':'')+'" data-date="'+esc(it.date)+'" data-space="'+esc(spKey(it.space_id))+'"'+(it.ref?' data-ref="'+esc(it.ref)+'" tabindex="0"':'')+'>'
      +'<td data-th="구분">'+kind+(!isB && !waitCancelled && x.sp && x.sp[spKey(it.space_id)] && x.sp[spKey(it.space_id)].bk?'<small class="rs-taken">이 날 확정 예약 있음</small>':'')+'</td>'
      +'<td data-th="시간">'+esc(resvTime(it))+(resvHours(it)?'<small>'+esc(resvHours(it))+'</small>':'')+'</td>'
      +'<td data-th="예약자"><b>'+esc(it.name||'')+'</b>'+spaceTag(it.space_id)+'<small>'+esc(it.phone||'')+(it.purpose&&PUR[it.purpose]?' · '+esc(PUR[it.purpose]):'')+'</small>'+(famAsk(it)?'<small class="rs-fam">+ '+esc(famAsk(it))+'</small>':'')+(it.catering?'<small class="rs-cat">'+catBadge(it.catering,'출장뷔페 ')+' '+esc(won(it.catering.total||0))+'</small>':it.catering_req?'<small class="rs-cat"><span class="cat-st cat-req">출장뷔페 요청</span></small>':'')+'</td>'
      +'<td data-th="경로">'+chs+'</td>'
      +'<td data-th="인원">'+(it.headcount?it.headcount+'명':'—')+'</td>'
      +'<td data-th="금액" class="r">'+(it.amount!=null?'<b>'+esc(won(it.amount))+'</b><small>'+esc(SRC[it.amount_src]||'')+'</small>':'<span class="muted">미정</span>')+'</td>'
      +'<td data-th="진행"><span class="st '+st[1]+'">'+esc(st[0])+'</span></td>'
      +'<td data-th="보증금">'+depositControl(it)+'</td>'
      +'<td data-th="운영 메모" class="rs-operation-memo"><span class="adm-operation-memo">'+esc(it.memo||'–')+'</span></td>'
      +'<td class="rs-acts">'+acts+'</td></tr>';
  }
  $('#rs-ch').innerHTML=chOptions('', '모든 경로').replace('<option value="web">', '<option value="online">온라인 결제</option><option value="web">');
  $('#view-resv').addEventListener('click', function(e){ var vd=e.target.closest('[data-vday]'); if(vd){ e.stopPropagation(); $('#vs-from').value=vd.dataset.vday; $('#vs-to').value=vd.dataset.vday; VS.range='custom'; $$('#view-visits [data-vrange]').forEach(function(b){ b.classList.remove('on'); }); go('visits'); return; } var r=e.target.closest('[data-range]'); if(r){ setRange(r.dataset.range); loadResv(); return; } var t=e.target.closest('#rs-tabs [data-kind]'); if(t){ RS.kind=t.dataset.kind; drawResv(); } });
  ['#rs-from','#rs-to'].forEach(function(sel){ $(sel).addEventListener('change', function(){ RS.range='custom'; $$('#view-resv [data-range]').forEach(function(b){ b.classList.remove('on'); }); loadResv(); }); });
  if($('#rs-space')) $('#rs-space').insertAdjacentHTML('beforeend', spaceOptions(''));
  ['#rs-status','#rs-ch','#rs-space'].forEach(function(sel){ if($(sel)) $(sel).addEventListener('change', drawResv); });
  $('#rs-q').addEventListener('input', drawResv);
  $('#rs-list').addEventListener('click', changeDeposit);
  $('#rs-reload').addEventListener('click', loadResv);
  $('#rs-print').addEventListener('click', function(){ document.body.classList.add('print-resv'); window.print(); setTimeout(function(){ document.body.classList.remove('print-resv'); }, 800); });
  $('#rs-csv').addEventListener('click', function(){
    var list=resvFiltered(); if(!list.length){ M.toast('내려받을 예약이 없습니다.'); return; }
    var cols=['이용일','요일','시간','구분','대기 순번','진행 상태','예약자','연락처','문의 경로','인원','금액(원)','금액 기준','보증금 입금','예약번호','문의번호','목적','메모'];
    var rows=list.map(function(it){ var dow=DOWK[new Date(it.date+'T12:00:00').getDay()]; return [it.date,dow,resvTime(it),it.kind==='booking'?'예약 확정':(it.reserve?'예약 문의(홈페이지 예약 신청)':'예약 문의'),it.kind==='booking'?'':(it._wait||''),it.kind==='booking'?(BST[it.status]||[it.status])[0]:it.status,it.name,it.phone,it.channel==='online'?'온라인 결제':(it.channel?chLabel(it.channel,it.channel_note):''),it.headcount||'',it.amount!=null?it.amount:'',SRC[it.amount_src]||'',it.deposit_paid==null?'확인 전':it.deposit_paid?'입금 완료':'미입금',it.code||'',it.ref||'',PUR[it.purpose]||it.purpose||'',it.memo||'']; });
    var csv='﻿'+[cols].concat(rows).map(function(r){ return r.map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(','); }).join('\r\n');
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='메가스팟_일자별예약_'+($('#rs-from').value||'처음')+'_'+($('#rs-to').value||'이후')+'.csv'; document.body.appendChild(a); a.click(); a.remove();
  });
  /* 예약 대기 순번 — 손잡이(⠿)를 끌거나, 손잡이에서 위·아래 화살표로 바꿉니다 (마우스·터치 모두) */
  var DRAG=null;
  function waitRows(tb, sp){ return [].slice.call(tb.querySelectorAll('tr.rs-row.pending:not(.wait-cancelled)')).filter(function(r){ return !sp || spKey(r.dataset.space)===sp; }); }
  function waitRenumber(tb){ SPACE_IDS.forEach(function(sp){ waitRows(tb, sp).forEach(function(r,i){ var b=r.querySelector('.wait-no b'); if(b) b.textContent=i+1; }); }); }
  function waitSave(date, refs, focusRef, sp){
    A('/reservations/waitlist',{method:'POST', body:{date:date, space_id:sp||DEFAULT_SPACE, refs:refs}}).then(function(r){
      (r.order||refs).forEach(function(ref,i){ RS.items.forEach(function(it){ if(it.kind==='pending' && it.ref===ref) it.wait_rank=i+1; }); });
      M.toast((+date.slice(5,7))+'월 '+(+date.slice(8,10))+'일 대기 순번을 저장했습니다.'); drawResv();
      if(focusRef){ var g=$('#rs-list tr[data-ref="'+focusRef+'"] .rs-grip'); if(g) g.focus(); }
    }).catch(function(x){ if(guard(x)) return; M.toast(x.message||'순번을 저장하지 못했습니다.'); loadResv(); });
  }
  $('#rs-list').addEventListener('pointerdown', function(e){
    var g=e.target.closest('.rs-grip'); if(!g || g.disabled || (e.pointerType==='mouse' && e.button!==0)) return;
    e.preventDefault(); e.stopPropagation();
    var tr=g.closest('tr.rs-row'), tb=tr.parentNode;
    DRAG={ tr:tr, tb:tb, date:g.dataset.wdate, sp:spKey(tr.dataset.space), orig:waitRows(tb, spKey(tr.dataset.space)).map(function(r){ return r.dataset.ref; }), y:e.clientY };
    try{ g.setPointerCapture(e.pointerId); }catch(_){}
    tr.classList.add('dragging'); document.body.classList.add('rs-dragging');
  });
  document.addEventListener('pointermove', function(e){
    if(!DRAG) return; e.preventDefault();
    var others=waitRows(DRAG.tb, DRAG.sp).filter(function(r){ return r!==DRAG.tr; }), before=null;
    for(var i=0;i<others.length;i++){ var rc=others[i].getBoundingClientRect(); if(e.clientY < rc.top+rc.height/2){ before=others[i]; break; } }
    if(before){ if(DRAG.tr.nextSibling!==before) DRAG.tb.insertBefore(DRAG.tr, before); }
    else if(others.length){ var last=others[others.length-1]; if(last.nextSibling!==DRAG.tr) last.parentNode.insertBefore(DRAG.tr, last.nextSibling); }
    waitRenumber(DRAG.tb);
    if(e.clientY<70) window.scrollBy(0,-14); else if(e.clientY>window.innerHeight-70) window.scrollBy(0,14);
  }, { passive:false });
  function dragEnd(){
    if(!DRAG) return; var d=DRAG; DRAG=null;
    d.tr.classList.remove('dragging'); document.body.classList.remove('rs-dragging');
    var now=waitRows(d.tb, d.sp).map(function(r){ return r.dataset.ref; });
    if(now.join()!==d.orig.join()) waitSave(d.date, now, null, d.sp);
  }
  document.addEventListener('pointerup', dragEnd); document.addEventListener('pointercancel', dragEnd);
  $('#rs-list').addEventListener('keydown', function(e){
    var g=e.target.closest('.rs-grip'); if(!g || g.disabled || (e.key!=='ArrowUp' && e.key!=='ArrowDown')) return;
    e.preventDefault();
    var tr=g.closest('tr.rs-row'), tb=tr.parentNode, sp=spKey(tr.dataset.space), rows=waitRows(tb, sp), i=rows.indexOf(tr), j=e.key==='ArrowUp'?i-1:i+1;
    if(j<0 || j>=rows.length) return;
    if(e.key==='ArrowUp') tb.insertBefore(tr, rows[j]); else tb.insertBefore(tr, rows[j].nextSibling);
    waitRenumber(tb); waitSave(g.dataset.wdate, waitRows(tb, sp).map(function(r){ return r.dataset.ref; }), tr.dataset.ref, sp);
  });
  $('#rs-list').addEventListener('click', function(e){
    if(e.target.closest('.rs-grip')){ e.stopPropagation(); return; }
    var w=e.target.closest('button[data-waitact]');
    if(w){ e.stopPropagation(); var action=w.dataset.waitact;
      if(!confirm(action==='cancel'?'이 문의의 예약 대기를 취소할까요? 문의·견적·메모는 회색 기록으로 남습니다.':'예약 대기를 복원할까요? 해당 날짜의 대기 순번 맨 뒤에 추가됩니다.')) return;
      w.disabled=true;
      A('/inquiries/'+encodeURIComponent(w.dataset.ref)+'/wait-'+action,{method:'POST'}).then(function(){ M.toast(action==='cancel'?'대기를 취소했습니다. 기록은 그대로 남아 있습니다.':'대기를 복원했습니다.'); loadResv(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }).finally(function(){ w.disabled=false; }); return;
    }
    var c=e.target.closest('button[data-rsconfirm]');
    if(c){ e.stopPropagation(); var it=RS.items.filter(function(x){ return x.kind==='pending' && x.ref===c.dataset.rsconfirm; })[0]; if(it) openConfirm(confirmFromRs(it)); return; }
    var b=e.target.closest('button[data-rsact]');
    if(b){ e.stopPropagation(); var s=b.dataset.rsact;
      if(!confirm(s==='completed'?'이용 완료로 처리할까요? 처리 후 고객이 예약번호로 후기를 쓸 수 있습니다.':'이 예약을 취소할까요? 달력의 마감 표시도 풀립니다.')) return;
      A('/bookings/'+b.dataset.code,{method:'PATCH', body:{status:s}}).then(function(){ M.toast('변경했습니다.'); loadResv(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); return; }
  });

  /* =================== 예약 확정 창 (예약 문의 → 예약 확정 한 번에) =================== */
  var CF={ ref:null, force:false, space:DEFAULT_SPACE };
  function inqHours(d){
    var sh=d.start_h, eh=d.end_h; if(sh==null && SLOT_H[d.slot]){ sh=SLOT_H[d.slot][0]; eh=SLOT_H[d.slot][1]; }
    if(sh==null && d.t_start && d.t_end){ var a=parseInt(d.t_start,10), b=parseInt(d.t_end,10); if(!isNaN(a)&&!isNaN(b)){ if(b<=a) b+=24; sh=a; eh=b; } }
    return [sh==null?null:+sh, eh==null?null:+eh];
  }
  function confirmFromInquiry(){
    var it=cur.item, d=it.data||{}, h=inqHours(d), lastQ=(cur.quotes||[])[0];
    return { ref:it.ref, space_id:it.space_id||d.space_id||'', name:d.name||it.name, phone:d.phone||it.phone, date:d.date||it.event_date||'', start_h:h[0], end_h:h[1], headcount:d.headcount||it.headcount||'', amount:currentAmount(it,lastQ)==null?'':currentAmount(it,lastQ), channel:d.channel||'web', channel_note:d.channel_note||'', status:it.status, memo:[lastQ?'견적 '+lastQ.quote_no:'', d.amount_note||''].filter(Boolean).join(' · ') };
  }
  function confirmFromRs(it){
    var h=inqHours(it);
    return { ref:it.ref, space_id:it.space_id||'', name:it.name, phone:it.phone, date:it.date, start_h:h[0], end_h:h[1], headcount:it.headcount||'', amount:it.amount!=null?it.amount:'', channel:it.channel||'web', channel_note:it.channel_note||'', status:it.status, memo:'' };
  }
  function cfHint(){
    var h=$('#cf-amount-hint'), date=$('#cf-date').value, sh=$('#cf-start').value, eh=$('#cf-end').value; h.innerHTML='';
    useSpace(CF.space);
    $$('#cf-pkgs [data-cfpkg]').forEach(function(b){ var p=E&&E.findPkg(b.dataset.cfpkg); b.classList.toggle('on', !!p && !!sh && +sh===p.start && +eh===p.end); });
    if(!E||!date||!sh||!eh) return;
    var q=E.quote({ adminHours:true, date:date, start:+sh, end:+eh, people:Math.max(1,parseInt($('#cf-people').value,10)||D.people.base) }); if(!q) return;
    h.innerHTML='요금표 기준 '+esc(won(q.total))+(q.peak?' (성수기)':'')+' · 옵션·할인 제외 <button type="button" class="linkish" id="cf-use-calc">넣기</button>';
    $('#cf-use-calc').addEventListener('click', function(){ $('#cf-amount').value=q.total; });
  }
  function cfSameDay(date){
    var sp=CF.space||DEFAULT_SPACE, sameSp=function(x){ return spKey(x.space_id)===sp; };
    var w=$('#cf-warn'), same=RS.items.filter(function(x){ return x.kind==='booking' && x.status==='confirmed' && x.date===date && sameSp(x); }), others=RS.items.filter(function(x){ return x.kind==='pending' && x.status!=='대기 취소' && x.date===date && x.ref!==CF.ref && sameSp(x); });
    var sv=$('#cf-start').value, ev=$('#cf-end').value, s=sv===''?null:+sv, e=ev===''?null:+ev;
    var clash=same.filter(function(b){ return s==null||e==null||b.start_h==null||b.end_h==null||(s<b.end_h&&b.start_h<e); });
    var msg=[];
    if(clash.length) msg.push('<b>이용 시간이 겹칠 수 있는 확정 예약이 있습니다.</b> '+clash.map(function(b){ return esc(b.name)+' '+esc(resvTime(b)); }).join(', ')+' — 시간을 확인해 주세요.');
    else if(same.length) msg.push('같은 날 다른 시간대 확정 예약 '+same.length+'건: '+same.map(function(b){ return esc(b.name)+' '+esc(resvTime(b)); }).join(', ')+' — 시간이 겹치지 않아 함께 받을 수 있습니다.');
    var me=RS.items.filter(function(x){ return x.kind==='pending' && x.ref===CF.ref; })[0];
    if(me && me.date===date && me._wait>1){ var ahead=RS.items.filter(function(x){ return x.kind==='pending' && x.date===date && sameSp(x) && x._wait<me._wait; }).sort(function(a,b){ return a._wait-b._wait; }); msg.push('이 문의는 <b>대기 '+me._wait+'번</b>입니다. 앞 순번: '+ahead.map(function(x){ return esc(x.name||'')+'('+x._wait+'번)'; }).join(', ')); }
    if(others.length) msg.push('같은 날 다른 예약 대기 '+others.length+'명이 있습니다. 확정한 뒤 그분들께는 다른 시간이나 날짜를 안내해 주세요.');
    w.innerHTML=msg.join('<br>'); w.hidden=!msg.length; w.classList.toggle('info', !clash.length);
  }
  function openConfirm(src){
    if(!src || !src.ref) return;
    CF.ref=src.ref; CF.force=false; CF.space=spaceOk(src.space_id); useSpace(CF.space);
    $('#cf-title').textContent='예약 확정 · '+src.ref;
    $('#cf-who').innerHTML='<b>'+esc(src.name||'(이름 없음)')+'</b><span>'+esc(src.phone||'연락처 없음')+'</span><span class="tag-sp">'+esc(spaceShort(CF.space))+'</span>'+chTag(src.channel, src.channel_note)+(src.status?stBadge(src.status):'');
    $('#cf-date').value=src.date||''; $('#cf-date').min='';
    if(D){ $('#cf-start').innerHTML=nwHourOpts(ADMIN_HOURS.from, ADMIN_HOURS.to-1, src.start_h==null?'':src.start_h, '미정'); $('#cf-end').innerHTML=nwHourOpts(src.start_h!=null?+src.start_h+1:ADMIN_HOURS.from+1, ADMIN_HOURS.to, src.end_h==null?'':src.end_h, '미정');
      $('#cf-pkgs').innerHTML=D.packages.map(function(p){ return '<button type="button" class="chip" data-cfpkg="'+p.id+'">'+esc(p.label)+' '+esc(p.time)+'</button>'; }).join(''); }
    $('#cf-people').value=src.headcount||''; $('#cf-amount').value=src.amount===''||src.amount==null?'':src.amount; $('#cf-memo').value=src.memo||''; $('#cf-block').checked=false;
    $('#cf-msg').hidden=true; $('#cf-submit').textContent='예약 확정'; $('#cf-submit').disabled=false;
    cfSameDay(src.date||''); cfHint(); openDrawer('#adm-confirm');
    setTimeout(function(){ $('#cf-date').focus(); }, 50);
  }
  $('#cf-start').addEventListener('change', function(){ var sh=this.value, eh=$('#cf-end').value; if(D) $('#cf-end').innerHTML=nwHourOpts(sh?+sh+1:ADMIN_HOURS.from+1, ADMIN_HOURS.to, eh && +eh>+sh ? eh : '', '미정'); CF.force=false; $('#cf-submit').textContent='예약 확정'; cfHint(); cfSameDay($('#cf-date').value); });
  $('#cf-end').addEventListener('change', function(){ CF.force=false; $('#cf-submit').textContent='예약 확정'; cfHint(); cfSameDay($('#cf-date').value); });
  $('#cf-people').addEventListener('input', cfHint);
  $('#cf-date').addEventListener('change', function(){ CF.force=false; $('#cf-submit').textContent='예약 확정'; cfSameDay(this.value); cfHint(); });
  $('#cf-pkgs').addEventListener('click', function(e){ var b=e.target.closest('[data-cfpkg]'); if(!b||!E) return; useSpace(CF.space); var p=E.findPkg(b.dataset.cfpkg); $('#cf-start').value=p.start; $('#cf-end').innerHTML=nwHourOpts(p.start+1, ADMIN_HOURS.to, p.end, '미정'); CF.force=false; $('#cf-submit').textContent='예약 확정'; cfHint(); cfSameDay($('#cf-date').value); });
  $('#cf-form').addEventListener('submit', function(e){
    e.preventDefault(); var msg=$('#cf-msg'); msg.hidden=true;
    var date=$('#cf-date').value; if(!date){ note(msg,'이용일을 골라 주세요.'); $('#cf-date').focus(); return; }
    var body={ date:date, start_h:$('#cf-start').value, end_h:$('#cf-end').value, headcount:$('#cf-people').value, amount:$('#cf-amount').value, memo:$('#cf-memo').value.trim(), block_calendar:$('#cf-block').checked, force:CF.force };
    var btn=$('#cf-submit'), ref=CF.ref; btn.disabled=true;
    A('/inquiries/'+encodeURIComponent(ref)+'/confirm',{method:'POST', body:body}).then(function(r){
      closeDrawer($('#adm-confirm'));
      M.toast('예약을 확정했습니다 · 예약번호 '+r.booking_code+(r.same_day?' · 같은 날 다른 예약 '+r.same_day+'건과 함께 진행':'')+(r.others?' · 같은 날 다른 문의 '+r.others+'건이 남아 있습니다':''));
      if(!$('#adm-drawer').hidden && cur && cur.item && cur.item.ref===ref) openInquiry(ref);
      refreshLists(); if(!$('#view-bookings').hidden) loadBookings();
      if($('#cf-cdoc') && $('#cf-cdoc').checked && r.booking_code) openConfirmDoc(r.booking_code);
    }).catch(function(x){
      if(guard(x)) return;
      if(x.code==='DATE_HAS_BOOKING'){ var w=$('#cf-warn'); var list=(x.detail&&x.detail.bookings)||[]; w.classList.remove('info'); w.innerHTML='<b>이용 시간이 겹치는 확정 예약이 있습니다.</b> '+list.map(function(b){ return esc(b.customer_name)+(b.date?' '+esc(kd(b.date)):'')+(b.start_h!=null?' '+esc(hl(b.start_h)+'–'+hl(b.end_h)):''); }).join(', ')+'<br>시간을 바꾸거나, 두 팀을 함께 받기로 했다면 <b>그래도 확정</b>을 눌러 주세요.'; w.hidden=false; CF.force=true; btn.textContent='그래도 확정'; return; }
      note(msg, x.message);
    }).finally(function(){ btn.disabled=false; });
  });

  /* =================== 예약확정서 (발급 · PDF·이미지 저장 · 공유) =================== */
  // 그림은 assets/js/confirm-doc.js 가 그립니다. 발급 내용은 bookings.confirm_doc 에 저장되고, 고객은 링크(/confirm/)로 같은 확정서를 봅니다.
  var CDX=window.MEGASPOT_CONFIRM||null, CDS=null, cdDirty=false, cdTimer=null;
  function cdDefaults(r){
    var bk=r.booking, iq=r.inquiry||{}, L=[], h=(bk.start_h!=null&&bk.end_h!=null)?(bk.end_h-bk.start_h):null;
    useSpace(bk.space_id);
    L.push(spaceName(spaceOk(bk.space_id))+' 공간 전체 대관'+(h?' '+h+'시간':''));
    var o=iq.options||{}; Object.keys(o).forEach(function(k){ var v=o[k]; if(!v) return; L.push((OPTL[k]||k)+(v&&typeof v==='object'?' '+(v.count||1)+'명 × '+(v.hours||1)+'시간':'')); });
    if(iq.catering && iq.catering.summary && iq.catering.total && iq.catering.status!=='cancelled') L.push('출장뷔페 · '+String(iq.catering.summary).replace(/\s*—\s*예상.*$/,''));
    if(D && D.included) L.push(D.included.slice(0,4).map(function(x){ return x.label; }).join('·')+' 기본 제공');
    var nm=iq.name||bk.name||'';
    return { customer: nm+(iq.org&&nm.indexOf(iq.org)<0?' ('+iq.org+')':''), event: PUR[iq.purpose]||'', time_note:'', show_amount:true, amount: bk.amount==null?null:bk.amount, amount_note:'부가세 포함',
      pay_status: 'paid', paid: bk.order_status==='paid'&&bk.amount!=null?bk.amount:null, deposit: D?D.deposit.amount:150000, items:L, note:'' };
  }
  function cdFill(v){
    $('#cd-customer').value=v.customer||''; $('#cd-event').value=v.event||''; $('#cd-time-note').value=v.time_note||'';
    $('#cd-show-amount').checked=v.show_amount!==false; $('#cd-amount').value=v.amount==null?'':v.amount; $('#cd-amount-note').value=v.amount_note||'부가세 포함';
    $('#cd-pay').value=v.pay_status||'paid'; $('#cd-paid').value=v.paid==null?'':v.paid; $('#cd-deposit').value=v.deposit==null?'':v.deposit;
    $('#cd-items').value=(v.items||[]).join('\n'); $('#cd-note').value=v.note||'';
    cdAmountToggle();
  }
  function cdAmountToggle(){ var on=$('#cd-show-amount').checked; ['#cd-amount','#cd-amount-note','#cd-pay','#cd-paid','#cd-deposit'].forEach(function(s){ $(s).disabled=!on; }); }
  function cdNum(sel){ var v=$(sel).value.trim(); if(v==='') return null; var n=Math.round(Number(v)); return isFinite(n)&&n>=0?n:null; }
  function cdRefund(){ var bk=CDS&&CDS.booking; if(!bk||!D||!bk.date||bk.date<todayIso()) return []; return refundSchedule(bk.date).map(function(x){ return { k:x.k, rate:x.rate }; }); }
  function cdSettings(){
    return { customer:$('#cd-customer').value.trim(), event:$('#cd-event').value.trim(), time_note:$('#cd-time-note').value.trim(), show_amount:$('#cd-show-amount').checked,
      amount:cdNum('#cd-amount'), amount_note:$('#cd-amount-note').value.trim()||'부가세 포함', pay_status:$('#cd-pay').value, paid:cdNum('#cd-paid'), deposit:cdNum('#cd-deposit'),
      items:$('#cd-items').value.split('\n').map(function(x){ return x.trim(); }).filter(Boolean).slice(0,12), refund:cdRefund(), note:$('#cd-note').value.trim() };
  }
  function cdDoc(){ var p=CDS.preview||{}, s=cdSettings(), d={}; Object.keys(p).forEach(function(k){ d[k]=p[k]; }); Object.keys(s).forEach(function(k){ d[k]=s[k]; }); d.issued_at=(CDS.doc&&CDS.doc.issued_at)||''; return d; }
  function cdState(){
    var d=CDS&&CDS.doc, st=$('#cd-state');
    st.className='cd-state'+(d&&d.issued_at?' on':'');
    st.innerHTML=d&&d.issued_at
      ? '<b>발급됨</b> '+esc(String(d.issued_at).slice(0,16))+(d.updated_at&&d.updated_at!==d.issued_at?' · 마지막 저장 '+esc(String(d.updated_at).slice(0,16)):'')+(cdDirty?' · <span class="warn">고친 내용이 아직 저장되지 않았습니다</span>':'')+'<br><span class="muted">고객은 링크나 megaspot.kr/confirm (예약번호 + 휴대폰 뒷 4자리)에서 같은 확정서를 볼 수 있습니다.</span>'
      : '<b>아직 발급하지 않았습니다.</b> <span class="muted">다운로드·공유·링크 복사를 누르면 지금 내용으로 발급(저장)한 뒤 진행합니다.</span>';
  }
  function cdPreview(){ if(!CDS||!CDX) return Promise.resolve(); return CDX.render(cdDoc(), $('#cd-canvas')); }
  function cdQueue(){ cdDirty=true; cdState(); clearTimeout(cdTimer); cdTimer=setTimeout(cdPreview, 250); }
  function openConfirmDoc(code){
    if(!code) return;
    if(!CDX){ M.toast('확정서 도구(confirm-doc.js)를 불러오지 못했습니다. 새로고침해 주세요.'); return; }
    openDrawer('#adm-cdoc'); $('#cd-title').textContent='예약확정서 · '+code; $('#cd-msg').hidden=true; $('#cd-sum').innerHTML='<div class="empty small">불러오는 중…</div>';
    CDS=null; cdDirty=false;
    A('/bookings/'+encodeURIComponent(code)+'/confirm-doc').then(function(r){
      CDS=r; var bk=r.booking;
      var stl={confirmed:'예약 확정',completed:'이용 완료',cancelled:'취소'}[bk.status]||bk.status;
      $('#cd-sum').innerHTML='<div><b>'+esc(bk.name||'')+'</b> <span class="st '+(bk.status==='cancelled'?'st-cancel':bk.status==='completed'?'st-done':'st-ok')+'">'+esc(stl)+'</span></div>'
        +'<div class="small">'+esc(CDX.dateText(bk.date))+' · '+esc(CDX.timeText(bk))+(bk.headcount?' · '+bk.headcount+'명':'')+'</div>'
        +'<div class="tiny muted">예약번호 '+esc(bk.code)+(r.inquiry&&r.inquiry.ref?' · 문의 '+esc(r.inquiry.ref):'')+' · '+esc(bk.phone||'')+'</div>';
      cdFill(r.doc&&r.doc.issued_at?r.doc:cdDefaults(r)); cdDirty=false; cdState();
      var off=bk.status==='cancelled'; ['#cd-save','#cd-pdf','#cd-png','#cd-share','#cd-link','#cd-text'].forEach(function(s){ $(s).disabled=off; });
      if(off) note($('#cd-msg'), '취소된 예약은 확정서를 발급할 수 없습니다.');
      cdPreview();
    }).catch(function(e){ if(guard(e)) return; $('#cd-sum').innerHTML='<div class="empty">'+esc(e.message||'불러오지 못했습니다.')+'</div>'; });
  }
  // 저장(발급) — 고친 내용이 없고 이미 발급된 확정서면 다시 저장하지 않습니다
  function cdSave(force){
    if(!CDS) return Promise.reject(new Error('예약 정보를 불러오는 중입니다.'));
    if(!force && !cdDirty && CDS.doc && CDS.doc.issued_at && CDS.link) return Promise.resolve(CDS);
    return A('/bookings/'+encodeURIComponent(CDS.booking.code)+'/confirm-doc',{method:'PUT', body:{doc:cdSettings()}}).then(function(r){
      CDS.doc=r.doc; CDS.preview=r.preview; CDS.link=r.link; cdDirty=false; cdState(); refreshLists(); return CDS;
    });
  }
  function cdBusy(btn, on, label){ btn.disabled=on; if(on){ btn.dataset.label=btn.textContent; btn.textContent=label||'만드는 중…'; } else if(btn.dataset.label){ btn.textContent=btn.dataset.label; } }
  function cdRun(btn, job){
    var m=$('#cd-msg'); m.hidden=true; cdBusy(btn, true);
    return cdSave().then(function(){ return cdPreview(); }).then(function(){ return job($('#cd-canvas'), cdDoc()); })
      .catch(function(e){ if(!guard(e)) note(m, e.message||'처리하지 못했습니다.'); }).finally(function(){ cdBusy(btn, false); });
  }
  function cdCopy(t, msg){ return (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast(msg); }).catch(function(){ window.prompt('아래 내용을 복사해 주세요.', t); }); }
  if($('#cd-form')){
    $('#cd-form').addEventListener('input', cdQueue); $('#cd-form').addEventListener('change', function(e){ if(e.target.id==='cd-show-amount') cdAmountToggle(); cdQueue(); });
    $('#cd-save').addEventListener('click', function(){ var b=this, m=$('#cd-msg'); m.hidden=true; cdBusy(b, true, '저장하는 중…');
      cdSave(true).then(function(){ cdPreview(); note(m, '확정서를 발급했습니다. PDF·이미지로 내려받거나 고객용 링크를 보내 주세요.', true); }).catch(function(e){ if(!guard(e)) note(m, e.message); }).finally(function(){ cdBusy(b, false); }); });
    $('#cd-pdf').addEventListener('click', function(){ cdRun(this, function(cv, d){ return CDX.pdfBlob(cv, '메가스팟 예약확정서 '+d.code).then(function(b){ CDX.download(b, CDX.fileName(d,'pdf')); M.toast('PDF를 내려받았습니다.'); }); }); });
    $('#cd-png').addEventListener('click', function(){ cdRun(this, function(cv, d){ return CDX.pngBlob(cv).then(function(b){ CDX.download(b, CDX.fileName(d,'png')); M.toast('이미지를 내려받았습니다.'); }); }); });
    $('#cd-share').addEventListener('click', function(){ cdRun(this, function(cv, d){ return CDX.share(cv, d, CDS.link).then(function(res){
      if(res==='shared'||res==='shared-link') M.toast('공유했습니다.');
      else if(res==='unsupported'||res==='error'){ return cdCopy(CDX.kakaoText(d, CDS.link), '이 브라우저는 바로 공유가 되지 않아 안내문과 링크를 복사했습니다. 카카오톡에 붙여 넣어 주세요.'); }
    }); }); });
    $('#cd-link').addEventListener('click', function(){ cdRun(this, function(){ return cdCopy(CDS.link, '고객용 확정서 링크를 복사했습니다.'); }); });
    $('#cd-text').addEventListener('click', function(){ cdRun(this, function(cv, d){ return cdCopy(CDX.kakaoText(d, CDS.link), '카카오톡 안내문(확정서 링크 포함)을 복사했습니다.'); }); });
  }
  // 어디서든 data-cdoc="예약번호" 버튼을 누르면 확정서 창을 엽니다 (목록 행 클릭보다 먼저 처리)
  document.addEventListener('click', function(e){ var b=e.target.closest && e.target.closest('[data-cdoc]'); if(!b) return; e.preventDefault(); e.stopPropagation(); openConfirmDoc(b.dataset.cdoc); }, true);
  function cdBtn(code, issued, cls){ return '<button class="btn btn-light '+(cls||'btn-xs')+' cdoc-btn'+(issued?' on':'')+'" type="button" data-cdoc="'+esc(code)+'" title="'+(issued?'예약확정서 발급됨 · 다시 열기':'예약확정서 만들기')+'">'+(issued?'확정서 ✓':'확정서')+'</button>'; }

  /* =================== 일정 달력 =================== */
  var calMonth=todayIso().slice(0,7), calRequest=0;
  function loadCalendar(){
    var grid=$('#cal-grid'), request=++calRequest;
    drawCalendar([], [], [], true);
    grid.setAttribute('aria-busy', 'true');
    $('#cal-status').textContent=$('#cal-title').textContent+' 일정을 불러오는 중입니다.';
    return Promise.all([A('/calendar'), A('/bookings'), A('/inquiries?status=open')]).then(function(res){
      if(request!==calRequest) return;
      drawCalendar(res[0].items||[], res[1].items||[], res[2].items||[]);
      $('#cal-status').textContent=$('#cal-title').textContent+' 일정을 불러왔습니다.';
    }).catch(function(e){
      if(request!==calRequest || guard(e)) return;
      grid.innerHTML='<div class="cal-error" role="alert"><span>'+esc(e.message||'일정을 불러오지 못했습니다.')+'</span><button class="btn btn-light btn-sm" type="button" data-cal-retry>다시 불러오기</button></div>';
      $('#cal-status').textContent='일정을 불러오지 못했습니다.';
    }).finally(function(){ if(request===calRequest) grid.setAttribute('aria-busy', 'false'); });
  }
  function drawCalendar(blocks, bookings, inqs, loading){
    var y=+calMonth.slice(0,4), m=+calMonth.slice(5,7), first=new Date(y,m-1,1), days=new Date(y,m,0).getDate(), pad=first.getDay(), t=todayIso();
    $('#cal-title').textContent=y+'년 '+m+'월';
    var by={}; function add(d,html){ (by[d]=by[d]||[]).push(html); }
    blocks.forEach(function(b){ add(b.date,'<i class="ev '+(b.state==='full'?'full':'hold')+'">'+(b.state==='full'?'마감':'확보')+(b.memo&&b.memo.indexOf('예약 ')!==0?' · '+esc(b.memo):'')+'</i>'); });
    bookings.forEach(function(b){ if(b.status==='cancelled') return; add(b.date,'<i class="ev bk"'+(b.inquiry_ref?' data-ref="'+esc(b.inquiry_ref)+'"':'')+'>'+esc(b.customer_name)+(b.headcount?' '+b.headcount+'명':'')+'</i>'); });
    inqs.forEach(function(i){ var d=(i.data&&i.data.date)||i.event_date; if(d) add(d,'<i class="ev inq" data-ref="'+esc(i.ref)+'">'+esc(i.name||'')+' · '+esc(i.status)+'</i>'); });
    var h='<div class="dw">일</div><div class="dw">월</div><div class="dw">화</div><div class="dw">수</div><div class="dw">목</div><div class="dw">금</div><div class="dw">토</div>';
    for(var cell=0; cell<42; cell++){
      var d=cell-pad+1;
      if(d<1 || d>days){ h+='<div class="dc empty" aria-hidden="true"></div>'; continue; }
      if(loading){ h+='<div class="dc cal-skeleton" aria-hidden="true"><span class="cal-sk-date"></span><span class="cal-sk-event"></span><span class="cal-sk-event short"></span></div>'; continue; }
      var iso=calMonth+'-'+M.pad2(d), off=E&&E.isOff(iso), dow=cell%7;
      h+='<div class="dc'+(iso===t?' today':'')+(iso<t?' past':'')+(off||dow===0?' off':'')+(dow===6?' sat':'')+'" data-day="'+iso+'"><b>'+d+'</b>'+(by[iso]||[]).join('')+'</div>';
    }
    $('#cal-grid').innerHTML=h;
  }
  $('#cal-prev').addEventListener('click', function(){ var y=+calMonth.slice(0,4), m=+calMonth.slice(5,7)-1; if(m<1){ m=12; y--; } calMonth=y+'-'+M.pad2(m); loadCalendar(); });
  $('#cal-next').addEventListener('click', function(){ var y=+calMonth.slice(0,4), m=+calMonth.slice(5,7)+1; if(m>12){ m=1; y++; } calMonth=y+'-'+M.pad2(m); loadCalendar(); });
  $('#cal-grid').addEventListener('click', function(e){ if(e.target.closest('[data-cal-retry]')){ loadCalendar(); return; } if(e.target.closest('[data-ref]')) return; var c=e.target.closest('[data-day]'); if(!c) return; $('#cal-date').value=c.dataset.day; $('#cal-form').scrollIntoView({behavior:'smooth',block:'center'}); });
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

  /* =================== 현장답사 (문의 직접 등록 · 문의 상세 · 일자별 현장답사 · 대시보드) =================== */
  var VST={requested:['조율 중','st-new'],scheduled:['예정','st-ok'],done:['완료','st-done'],noshow:['노쇼','st-cancel'],cancelled:['취소','st-cancel']};
  var VRES={booked:'예약 진행',thinking:'고민 중',other:'다른 곳 선택',etc:'기타'};
  var VS={ range:'upcoming', items:[], undated:[], today:todayIso(), counts:{}, dash:[], strip:[] };
  function vTimeOpts(sel){ var o='<option value="">시간 미정 (조율 중)</option>', has=false; for(var m=7*60;m<=22*60;m+=30){ var t=M.pad2(Math.floor(m/60))+':'+M.pad2(m%60); if(t===sel) has=true; o+='<option value="'+t+'"'+(t===sel?' selected':'')+'>'+t+'</option>'; } if(sel && !has) o+='<option value="'+esc(sel)+'" selected>'+esc(sel)+'</option>'; return o; }
  function vDurOpts(sel){ sel=+sel||30; var L=[[30,'30분'],[60,'1시간'],[90,'1시간 30분'],[120,'2시간']]; if(!L.some(function(x){ return x[0]===sel; })) L.push([sel, sel+'분']); return L.map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===sel?' selected':'')+'>'+x[1]+'</option>'; }).join(''); }
  function durText(m){ m=+m||30; return m<60?m+'분':Math.floor(m/60)+'시간'+(m%60?' '+(m%60)+'분':''); }
  function vEnd(t,dur){ if(!t) return ''; var m=(+t.slice(0,2))*60+(+t.slice(3,5))+(+dur||30); return M.pad2(Math.floor(m/60)%24)+':'+M.pad2(m%60); }
  function vBadge(v){ var s=VST[v.status]||[v.status,'']; return '<span class="st '+s[1]+'">'+esc(s[0])+'</span>'; }
  function vWhen(v, withDate){ var t=v.time?v.time+'–'+vEnd(v.time,v.duration):'시간 조율 중'; return (withDate?(v.date?kd(v.date)+' ':'날짜 미정 · '):'')+t; }
  function vWish(v){ var w=v.wish; if(!w) return ''; var p=[w.date?kd(w.date):'', w.time?w.time+' 무렵':'', w.note||''].filter(Boolean).join(' · '); return '고객 희망'+(p?': '+p:' (일시는 협의)'); }
  function vClash(cl){ return (cl||[]).map(function(c){ return c.type==='booking'?'같은 시간 행사 예약 — '+c.name+' ('+c.time+')':'같은 시간 다른 답사 — '+c.name+' ('+c.time+')'; }); }
  function vActive(v){ return v.status==='requested'||v.status==='scheduled'; }
  // 고객에게 보낼 답사 안내문 (카카오톡·문자에 붙여 넣기)
  function vGuide(v){
    var sp=spaceInfo(v.space_id)||{}, nm=sp.name||spaceName(v.space_id);
    var when=v.date?(E?E.kdateY(v.date):v.date)+(v.time?' '+v.time+' (약 '+durText(v.duration)+')':' · 시간은 따로 안내드립니다'):'따로 안내드립니다';
    var L=['[메가스팟 현장답사 안내]', (v.name||'고객')+' 님, 현장답사 일정을 안내드립니다.', '', '· 일시: '+when, '· 장소: '+nm+' — 서울 광진구 화양동 10-1 한아름건물 2층 (지하철 2·7호선 건대입구역 인근)', '· 주차: 건물 주차장 이용 가능 — 차량번호를 미리 알려 주시면 1시간 무료로 등록해 드립니다.'];
    if(sp.opening && v.date && v.date<sp.opening) L.push('· '+nm+'는 '+(E?E.kdate(sp.opening):sp.opening)+' 오픈 전 공사 중이라, 공사 진행 상황에 맞춰 안내해 드립니다.');
    L.push('· 안내 연락처: '+(v.staff?v.staff+' ':'')+M.CONFIG.phone, '', '도착하시면 2층 입구에서 연락 주세요. 일정이 바뀌면 카카오톡이나 전화로 알려 주세요.', '주차 안내: '+location.origin+'/parking/');
    return L.join('\n');
  }
  function visitCard(v, today){
    var dd=(v.date&&E)?E.diffDays(today||todayIso(), v.date):null;
    return '<div class="adm-row vs-card" data-dvisit="'+v.id+'" tabindex="0"><div class="r1"><b>'+esc(v.name)+'</b>'+spaceTag(v.space_id)+vBadge(v)+(dd===0?'<span class="st st-pay">오늘</span>':dd!=null&&dd>0?'<span class="tiny muted">D-'+dd+'</span>':'')+'</div>'
      +'<div class="r2">'+esc(vWhen(v,true))+(v.people?' · '+v.people+'명':'')+(v.staff?' · 담당 '+esc(v.staff):'')+'</div>'
      +'<div class="r3"><span>'+esc(v.ref)+(v.inquiry_ref?' · 문의 '+esc(v.inquiry_ref):'')+'</span>'+(v.phone?'<a href="tel:'+esc(v.phone)+'">'+esc(v.phone)+'</a>':'')+'</div></div>';
  }
  // 문의 상세의 '현장답사' 칸
  function visitSection(it, d){
    var vs=cur.visits||[];
    return '<div class="dr-sec dr-visits"><h3 class="row between" style="gap:8px">현장답사 <button class="btn btn-light btn-xs" type="button" id="dr-visit-add">+ 답사 일정 추가</button></h3>'
      +(d.visit_wish&&!vs.length?'<div class="dr-vwish">고객이 홈페이지에서 <b>현장답사를 먼저 하고 싶다</b>고 체크했습니다. '+esc([d.visit_wish.date?kd(d.visit_wish.date):'', d.visit_wish.time?d.visit_wish.time+' 무렵':'', d.visit_wish.note||''].filter(Boolean).join(' · '))+'</div>':'')
      +(vs.length?vs.map(function(v){ var cl=vClash(v.clashes); return '<button type="button" class="dr-visit" data-dvid="'+v.id+'"><span class="dv1">'+vBadge(v)+'<b>'+esc(vWhen(v,true))+'</b>'+(v.people?' · '+v.people+'명':'')+(v.staff?' · 담당 '+esc(v.staff):'')+spaceTag(v.space_id)+'</span>'
        +'<span class="dv2">'+esc([v.ref, vWish(v), v.memo, v.result_label?'결과: '+v.result_label+(v.result_note?' ('+v.result_note+')':''):''].filter(Boolean).join(' · '))+'</span>'+(cl.length?'<span class="dv-warn">⚠ '+esc(cl.join(' / '))+'</span>':'')+'</button>'; }).join('')
        :'<p class="small muted">아직 잡힌 현장답사가 없습니다. 고객이 공간을 먼저 보고 싶어 하면 일정을 추가해 두세요. 일자별 현장답사에서 한눈에 볼 수 있습니다.</p>')
      +'</div>';
  }
  // ---- 등록·수정 패널 ----
  var VT={ cur:null };
  function vtWarn(cl){ var w=$('#vt-warn'), L=vClash(cl); w.innerHTML=L.length?'<b>같은 시간 일정이 있습니다.</b> '+L.map(esc).join('<br>')+'<br><small>그래도 괜찮다면 그대로 두셔도 됩니다. 행사 중 답사는 손님께 미리 양해를 구해 주세요.</small>':''; w.hidden=!L.length; }
  function vtLink(x){
    var b=$('#vt-link');
    if(!x.inquiry_ref){ b.innerHTML='<span class="small muted">문의와 연결되지 않은 단독 답사입니다. 연결하려면 아래 \'연결 문의번호\'에 문의번호를 적어 주세요.</span>'; return; }
    b.innerHTML='<span class="small">연결 문의 <b>'+esc(x.inquiry_ref)+'</b>'+(x.inq_status?' · '+esc(x.inq_status):'')+(x.inq_date?' · 이용일 '+esc(kd(x.inq_date)):'')+(x.inq_headcount?' · '+x.inq_headcount+'명':'')+(x.booking_code?' · 예약 '+esc(x.booking_code):'')+'</span>';
  }
  function vtQuick(){
    var t=todayIso(), L=[[t,'오늘'],[isoAdd(t,1),'내일'],[isoAdd(t,2),'모레']], d=new Date(t+'T12:00:00'), add=(6-d.getDay()+7)%7||7; L.push([isoAdd(t,add),'이번 토요일']);
    $('#vt-quick').innerHTML=L.map(function(x){ return '<button type="button" class="chip" data-vtd="'+x[0]+'">'+x[1]+' <span class="n">'+(+x[0].slice(5,7))+'.'+(+x[0].slice(8,10))+'</span></button>'; }).join('');
  }
  function openVisit(v){
    var f=$('#vt-form'); f.reset(); var x=v||{}; VT.cur=x.id?x:null; VT.base=x;
    $('#vt-title').textContent=VT.cur?'현장답사 · '+x.ref:'현장답사 등록';
    $('#vt-space').innerHTML=spaceOptions(spaceOk(x.space_id));
    $('#vt-status').value=x.status||'scheduled'; $('#vt-status').closest('.f').hidden=!VT.cur;
    $('#vt-date').value=x.date||''; $('#vt-time').innerHTML=vTimeOpts(x.time||''); $('#vt-dur').innerHTML=vDurOpts(x.duration||30);
    $('#vt-name').value=x.name||''; $('#vt-phone').value=x.phone||''; $('#vt-people').value=x.people||''; $('#vt-staff').value=x.staff||'';
    $('#vt-iref').value=x.inquiry_ref||''; $('#vt-memo').value=x.memo||''; $('#vt-res').value=x.result||''; $('#vt-resnote').value=x.result_note||'';
    $('#vt-result').hidden=!VT.cur; $('#vt-del').hidden=!VT.cur; $('#vt-open-inq').hidden=!x.inquiry_ref; $('#vt-msg').hidden=true;
    var w=$('#vt-wish'); w.textContent=x.wish?vWish(x)+(x.source==='web'?' — 홈페이지 예약 신청에서 받은 요청입니다. 고객과 통화해 일시를 정하면 날짜·시간을 넣어 주세요.':''):''; w.hidden=!x.wish;
    $('#vt-submit').textContent=VT.cur?'저장':'답사 일정 등록';
    vtLink(x); vtQuick(); vtWarn(x.clashes||[]);
    openDrawer('#adm-visit'); setTimeout(function(){ (x.name?$('#vt-date'):$('#vt-name')).focus(); }, 50);
    if(VT.cur) A('/visits/'+VT.cur.id).then(function(r){ if(VT.cur && r.item.id===VT.cur.id) vtWarn(r.clashes); }).catch(function(){});
  }
  function vtData(){ var d=M.formData($('#vt-form')); if(!VT.cur) delete d.status; return d; }
  function afterVisitSaved(item, clashes, msg){
    var cl=vClash(clashes); M.toast(msg+(cl.length?' ⚠ '+cl[0]:''));
    if(cl.length){ VT.cur=item; VT.base=item; $('#vt-title').textContent='현장답사 · '+item.ref; $('#vt-status').closest('.f').hidden=false; $('#vt-status').value=item.status; $('#vt-result').hidden=false; $('#vt-del').hidden=false; $('#vt-submit').textContent='저장'; vtWarn(clashes); }
    else closeDrawer($('#adm-visit'));
    if(!$('#view-visits').hidden) loadVisits(); if(!$('#view-dash').hidden) loadDash(); if(!$('#view-resv').hidden) loadResv();
    if(!$('#adm-drawer').hidden && cur && cur.item && item.inquiry_ref===cur.item.ref) openInquiry(cur.item.ref);
  }
  $('#vt-form').addEventListener('submit', function(e){
    e.preventDefault(); var f=e.target, msg=$('#vt-msg'); msg.hidden=true; if(!M.validate(f)) return;
    var d=vtData(), b=$('#vt-submit'); b.disabled=true;
    (VT.cur?A('/visits/'+VT.cur.id,{method:'PATCH', body:d}):A('/visits',{method:'POST', body:d})).then(function(r){
      afterVisitSaved(r.item, r.clashes, (VT.cur?'현장답사 일정을 저장했습니다.':'현장답사 '+r.item.ref+'을(를) 등록했습니다.')+(r.item.status==='requested'?' (날짜·시간이 정해지지 않아 조율 중)':''));
    }).catch(function(x){ if(!guard(x)) note(msg, x.message); }).finally(function(){ b.disabled=false; });
  });
  $('#vt-quick').addEventListener('click', function(e){ var c=e.target.closest('[data-vtd]'); if(c){ $('#vt-date').value=c.dataset.vtd; if(!$('#vt-time').value) $('#vt-time').focus(); } });
  $('#vt-guide').addEventListener('click', function(){ var v=Object.assign({}, VT.base||{}, vtData()); M.copy(vGuide(v)).then(function(ok){ M.toast(ok?'답사 안내문을 복사했습니다. 카카오톡·문자에 붙여 넣어 보내세요.':'복사하지 못했습니다.'); }); });
  $('#vt-open-inq').addEventListener('click', function(){ var r=(VT.base||{}).inquiry_ref; if(r){ closeDrawer($('#adm-visit')); openInquiry(r); } });
  $('#vt-del').addEventListener('click', function(){ if(!VT.cur) return; if(!confirm('이 현장답사 일정을 지울까요? 고객이 취소한 경우라면 상태를 \'취소\'로 바꾸는 편이 기록이 남습니다.')) return;
    var it=VT.cur; A('/visits/'+it.id,{method:'DELETE'}).then(function(){ M.toast('현장답사 일정을 지웠습니다.'); closeDrawer($('#adm-visit')); if(!$('#view-visits').hidden) loadVisits(); if(!$('#view-dash').hidden) loadDash(); if(!$('#adm-drawer').hidden && cur && cur.item && it.inquiry_ref===cur.item.ref) openInquiry(cur.item.ref); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); });
  // ---- 문의 직접 등록의 '현장답사' 칸 ----
  $('#nw-v-time').innerHTML=vTimeOpts(''); $('#nw-v-space').innerHTML=spaceOptions(DEFAULT_SPACE);
  $('#nw-visit-on').addEventListener('change', function(){ $('#nw-visit-body').hidden=!this.checked; if(this.checked){ $('#nw-v-space').value=spaceOk($('#nw-space')?$('#nw-space').value:DEFAULT_SPACE); setTimeout(function(){ $('#nw-v-date').focus(); }, 30); } });
  if($('#nw-space')) $('#nw-space').addEventListener('change', function(){ $('#nw-v-space').value=spaceOk(this.value); });
  // ---- 일자별 현장답사 화면 ----
  function vSetRange(k){ VS.range=k; var r=k==='today'?[todayIso(),todayIso()]:rangeOf(k); $('#vs-from').value=r[0]; $('#vs-to').value=r[1]; $$('#view-visits [data-vrange]').forEach(function(b){ b.classList.toggle('on', b.dataset.vrange===k); }); }
  function loadVisits(){
    if(!$('#vs-from').value && !$('#vs-to').value && VS.range!=='custom') vSetRange(VS.range);
    var box=$('#vs-list'); if(!VS.items.length) box.innerHTML='<div class="empty small">불러오는 중…</div>';
    A('/visits?from='+encodeURIComponent($('#vs-from').value)+'&to='+encodeURIComponent($('#vs-to').value)).then(function(r){
      VS.items=r.items||[]; VS.undated=r.undated||[]; VS.today=r.today||todayIso(); VS.counts={ requested:r.visits_requested||0, today:r.visits_today||0 }; setCount('visits', r.visits_requested); drawVisits();
    }).catch(fail(box));
    var t=todayIso(); A('/visits?from='+t+'&to='+isoAdd(t,13)).then(function(r){ VS.strip=r.items||[]; drawStrip(); }).catch(function(){});
  }
  function vFilter(list){
    var st=$('#vs-status').value, sp=$('#vs-space').value, q=$('#vs-q').value.trim().toLowerCase().replace(/-/g,'');
    return list.filter(function(v){
      if(st==='active'){ if(!vActive(v)) return false; } else if(st && v.status!==st) return false;
      if(sp && spKey(v.space_id)!==sp) return false;
      if(q){ var hay=[v.name,v.phone,v.ref,v.inquiry_ref,v.staff,v.memo].join(' ').toLowerCase().replace(/-/g,''); if(hay.indexOf(q)<0) return false; }
      return true;
    });
  }
  function drawStrip(){
    var t=todayIso(), cells=[], sp=$('#vs-space').value;
    for(var i=0;i<14;i++){ var dk=isoAdd(t,i), dt=new Date(dk+'T12:00:00'), dow=dt.getDay();
      var day=VS.strip.filter(function(v){ return v.date===dk && vActive(v) && (!sp||spKey(v.space_id)===sp); }), n=day.length, rq=day.filter(function(v){ return v.status==='requested'; }).length;
      cells.push('<button type="button" class="vs-cell'+(n?' has':'')+(i===0?' today':'')+(dow===0||(E&&E.isOff(dk))?' off':'')+(dow===6?' sat':'')+(($('#vs-from').value===dk&&$('#vs-to').value===dk)?' on':'')+'" data-vsday="'+dk+'" aria-label="'+esc(kd(dk))+' 현장답사 '+n+'건"><small>'+(i===0?'오늘':DOWK[dow])+'</small><b>'+(+dk.slice(5,7))+'.'+(+dk.slice(8,10))+'</b><span>'+(n?n+'건':'–')+'</span>'+(rq?'<em>조율 '+rq+'</em>':'')+'</button>'); }
    $('#vs-strip').innerHTML='<div class="vs-strip-head"><b>앞으로 2주</b><span class="tiny muted">날짜를 누르면 그날 답사만 봅니다</span></div><div class="vs-cells">'+cells.join('')+'</div>';
  }
  function visitRow(v, past){
    var tel=String(v.phone||'').replace(/[^0-9+]/g,''), cl=vClash(v.clashes), act='';
    if(tel) act+='<a class="btn btn-light btn-xs" href="tel:'+esc(tel)+'">전화</a>';
    if(v.status==='scheduled') act+='<button class="btn btn-light btn-xs" type="button" data-vsact="done" data-vid="'+v.id+'">완료</button><button class="btn btn-light btn-xs" type="button" data-vsact="noshow" data-vid="'+v.id+'">노쇼</button>';
    if(v.status==='requested') act+='<button class="btn btn-light btn-xs btn-ok" type="button" data-vsedit="'+v.id+'">일정 잡기</button>';
    if(vActive(v)) act+='<button class="btn btn-light btn-xs" type="button" data-vsguide="'+v.id+'">안내문</button><button class="btn btn-light btn-xs" type="button" data-vsact="cancelled" data-vid="'+v.id+'">취소</button>';
    return '<tr class="rs-row vs-row v-'+esc(v.status)+(v.status==='cancelled'?' cancelled':'')+(past?' past':'')+(cl.length?' clash':'')+'" data-vrow="'+v.id+'" tabindex="0">'
      +'<td class="vs-time" data-th="시간"><b>'+(v.time?esc(v.time):'미정')+'</b>'+(v.time?'<small>~'+esc(vEnd(v.time,v.duration))+' · '+esc(durText(v.duration))+'</small>':'<small>시간 조율 중</small>')+'</td>'
      +'<td data-th="상태">'+vBadge(v)+(v.source==='web'?'<span class="tag-rv">홈페이지</span>':'')+'</td>'
      +'<td data-th="오시는 분"><b>'+esc(v.name)+'</b>'+spaceTag(v.space_id)+(v.phone?'<small>'+esc(v.phone)+'</small>':'')+'</td>'
      +'<td data-th="인원">'+(v.people?v.people+'명':'-')+'</td>'
      +'<td data-th="문의">'+(v.inquiry_ref?'<button type="button" class="linkish" data-vinq="'+esc(v.inquiry_ref)+'">'+esc(v.inquiry_ref)+'</button><small>'+esc([v.inq_status, v.inq_date?'이용일 '+kd(v.inq_date):'', v.inq_headcount?v.inq_headcount+'명':'', v.booking_code?'예약 '+v.booking_code:''].filter(Boolean).join(' · '))+'</small>':'<span class="tiny muted">단독 답사</span>')+'</td>'
      +'<td data-th="담당">'+esc(v.staff||'-')+'</td>'
      +'<td class="vs-memo"'+(v.memo||v.wish||v.result_label||cl.length?' data-th="메모"':'')+'>'+esc(v.memo||'')+(v.wish?'<small>'+esc(vWish(v))+'</small>':'')+(v.result_label?'<small>결과: '+esc(v.result_label)+(v.result_note?' · '+esc(v.result_note):'')+'</small>':'')+(cl.length?'<span class="vs-clash">⚠ '+esc(cl.join(' / '))+'</span>':'')+'</td>'
      +'<td class="rs-acts">'+act+'</td></tr>';
  }
  function drawVisits(){
    var list=vFilter(VS.items), und=vFilter(VS.undated), box=$('#vs-list');
    var sched=list.filter(function(v){ return v.status==='scheduled'; }).length, done=list.filter(function(v){ return v.status==='done'; }).length, ns=list.filter(function(v){ return v.status==='noshow'; }).length;
    var clashN=list.filter(function(v){ return (v.clashes||[]).length; }).length, booked=list.filter(function(v){ return v.result==='booked'; }).length;
    $('#vs-kpis').innerHTML='<div class="kpi'+(VS.counts.requested?' hot':'')+'"><small>조율이 필요한 답사</small><b>'+(VS.counts.requested||0)+'<span class="small">건</span></b><span class="tiny muted">날짜·시간을 아직 정하지 않은 요청 (전체)</span></div>'
      +'<div class="kpi"><small>오늘 답사</small><b>'+(VS.counts.today||0)+'<span class="small">건</span></b></div>'
      +'<div class="kpi"><small>이 기간 예정 · 완료</small><b>'+sched+'<span class="small">건</span> · '+done+'<span class="small">건</span></b>'+(ns?'<span class="tiny muted">노쇼 '+ns+'건</span>':'')+(booked?'<span class="tiny">답사 후 예약 진행 '+booked+'건</span>':'')+'</div>'
      +'<div class="kpi'+(clashN?' warn':'')+'"><small>시간이 겹치는 답사</small><b>'+clashN+'<span class="small">건</span></b><span class="tiny muted">같은 시간 다른 답사 또는 행사 예약</span></div>';
    var head='<thead><tr><th>시간</th><th>상태</th><th>오시는 분</th><th>인원</th><th>연결 문의</th><th>담당</th><th>메모</th><th></th></tr></thead>';
    var html='';
    if(und.length) html+='<div class="rs-group vs-und"><div class="rs-ghead"><b>조율이 필요한 답사 요청</b><span>날짜를 아직 정하지 않았습니다 · '+und.length+'건 · 고객과 통화해 일정을 잡아 주세요</span></div><table class="rs-table vs-table">'+head+'<tbody>'+und.map(function(v){ return visitRow(v); }).join('')+'</tbody></table></div>';
    if(!list.length){ box.innerHTML=html+emptyMsg('이 기간에 해당하는 현장답사가 없습니다. 위 [+ 현장답사 등록] 또는 문의 상세의 \'답사 일정 추가\'로 넣을 수 있습니다.'); return; }
    var months={}, mOrder=[];
    list.forEach(function(v){ var mk=v.date.slice(0,7); if(!months[mk]){ months[mk]={ days:{}, order:[] }; mOrder.push(mk); } var mo=months[mk]; if(!mo.days[v.date]){ mo.days[v.date]=[]; mo.order.push(v.date); } mo.days[v.date].push(v); });
    html+=mOrder.map(function(mk){
      var mo=months[mk], all=[]; mo.order.forEach(function(dk){ all=all.concat(mo.days[dk]); });
      return '<div class="rs-group"><div class="rs-ghead"><b>'+(+mk.slice(0,4))+'년 '+(+mk.slice(5,7))+'월</b><span>현장답사 '+all.length+'건'+(all.filter(vActive).length!==all.length?' · 진행 중 '+all.filter(vActive).length+'건':'')+'</span></div>'
        +mo.order.map(function(dk){
          var rows=mo.days[dk].slice().sort(function(a,b){ return (a.time||'99').localeCompare(b.time||'99'); }), dt=new Date(dk+'T12:00:00'), dow=dt.getDay(), off=E&&E.isOff(dk), past=dk<VS.today;
          var act=rows.filter(vActive).length, cl=rows.some(function(v){ return (v.clashes||[]).length; });
          return '<div class="rs-day'+(past?' past':'')+(dk===VS.today?' is-today':'')+(cl?' clash':'')+'"><div class="rs-dhead"><b class="rs-date'+(off||dow===0?' off':'')+(dow===6?' sat':'')+'">'+(+dk.slice(5,7))+'.'+(+dk.slice(8,10))+' ('+DOWK[dow]+')</b>'+dLabel(dk)
            +'<span class="rs-dsum"><span class="st st-ok">답사 '+rows.length+'</span>'+(act&&act!==rows.length?'<span class="st st-new">진행 중 '+act+'</span>':'')+'</span>'+(cl?'<span class="rs-clash">같은 시간 일정 있음</span>':'')+'</div>'
            +'<table class="rs-table vs-table">'+head+'<tbody>'+rows.map(function(v){ return visitRow(v, past); }).join('')+'</tbody></table></div>';
        }).join('')+'</div>';
    }).join('');
    box.innerHTML=html;
  }
  function vFind(id){ id=String(id); return VS.items.concat(VS.undated, VS.dash, VS.strip).filter(function(v){ return String(v.id)===id; })[0]; }
  function vQuick(id, status){
    var v=vFind(id); if(!v) return;
    if(status==='cancelled' && !confirm(v.name+' 님 현장답사를 취소로 바꿀까요?')) return;
    A('/visits/'+id,{method:'PATCH', body:{status:status}}).then(function(){ M.toast(v.name+' 님 답사를 \''+VST[status][0]+'\'(으)로 바꿨습니다.'+(status==='done'?' 답사 후 결과는 줄을 눌러 남길 수 있습니다.':'')); loadVisits(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); });
  }
  $('#vs-space').insertAdjacentHTML('beforeend', SPACE_IDS.map(function(id){ return '<option value="'+id+'">'+esc(spaceName(id))+'</option>'; }).join(''));
  $('#view-visits').addEventListener('click', function(e){
    var r=e.target.closest('[data-vrange]'); if(r){ vSetRange(r.dataset.vrange); loadVisits(); return; }
    var sd=e.target.closest('[data-vsday]'); if(sd){ var on=$('#vs-from').value===sd.dataset.vsday && $('#vs-to').value===sd.dataset.vsday; if(on){ vSetRange('upcoming'); } else { $('#vs-from').value=sd.dataset.vsday; $('#vs-to').value=sd.dataset.vsday; VS.range='custom'; $$('#view-visits [data-vrange]').forEach(function(b){ b.classList.toggle('on', sd.dataset.vsday===todayIso() && b.dataset.vrange==='today'); }); } loadVisits(); return; }
    var q=e.target.closest('[data-vsact]'); if(q){ vQuick(q.dataset.vid, q.dataset.vsact); return; }
    var g=e.target.closest('[data-vsguide]'); if(g){ var gv=vFind(g.dataset.vsguide); if(gv) M.copy(vGuide(gv)).then(function(ok){ M.toast(ok?gv.name+' 님 답사 안내문을 복사했습니다.':'복사하지 못했습니다.'); }); return; }
    var iq=e.target.closest('[data-vinq]'); if(iq){ openInquiry(iq.dataset.vinq); return; }
    var ed=e.target.closest('[data-vsedit]'); if(ed){ var ev=vFind(ed.dataset.vsedit); if(ev) openVisit(ev); return; }
    if(e.target.closest('a,button,select,input')) return;
    var row=e.target.closest('[data-vrow]'); if(row){ var rv=vFind(row.dataset.vrow); if(rv) openVisit(rv); }
  });
  $('#view-visits').addEventListener('keydown', function(e){ if(e.key!=='Enter') return; var row=e.target.closest('[data-vrow]'); if(row && e.target===row){ var rv=vFind(row.dataset.vrow); if(rv) openVisit(rv); } });
  ['#vs-from','#vs-to'].forEach(function(s){ $(s).addEventListener('change', function(){ VS.range='custom'; $$('#view-visits [data-vrange]').forEach(function(b){ b.classList.remove('on'); }); loadVisits(); }); });
  $('#vs-status').addEventListener('change', drawVisits); $('#vs-space').addEventListener('change', function(){ drawVisits(); drawStrip(); }); $('#vs-q').addEventListener('input', drawVisits);
  $('#vs-new').addEventListener('click', function(){ openVisit(null); });
  $('#vs-reload').addEventListener('click', loadVisits);
  $('#vs-print').addEventListener('click', function(){ document.body.classList.add('print-visits'); window.print(); setTimeout(function(){ document.body.classList.remove('print-visits'); }, 800); });
  $('#vs-csv').addEventListener('click', function(){
    var rows=vFilter(VS.undated).concat(vFilter(VS.items)); if(!rows.length){ M.toast('내려받을 답사가 없습니다.'); return; }
    var L=[['답사번호','날짜','시작','끝','상태','공간','오시는 분','연락처','인원','담당자','연결 문의','문의 상태','문의 이용일','메모','고객 희망','답사 후 결과','결과 메모','겹치는 일정']].concat(rows.map(function(v){ return [v.ref, v.date, v.time, v.time?vEnd(v.time,v.duration):'', VST[v.status]?VST[v.status][0]:v.status, spaceName(v.space_id), v.name, v.phone, v.people||'', v.staff, v.inquiry_ref, v.inq_status||'', v.inq_date||'', v.memo, v.wish?vWish(v):'', v.result_label, v.result_note, vClash(v.clashes).join(' / ')]; }));
    var text='﻿'+L.map(function(r){ return r.map(function(x){ x=String(x==null?'':x); return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x; }).join(','); }).join('\r\n');
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})); a.download='현장답사_'+($('#vs-from').value||'전체')+'_'+($('#vs-to').value||'')+'.csv'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  $('#dash-visits').addEventListener('click', function(e){ if(e.target.closest('a')) return; var c=e.target.closest('[data-dvisit]'); if(c){ e.stopPropagation(); var v=vFind(c.dataset.dvisit); if(v) openVisit(v); } });

  /* =================== 플랫폼 화면 연결 (admin-platform.js) =================== */
  window.MEGASPOT_ADMIN={ A:A, esc:esc, guard:guard, fail:fail, note:note, ago:ago, kd:kd, emptyMsg:emptyMsg, setCount:setCount, spaceName:spaceName,
    openDrawer:openDrawer, closeDrawer:closeDrawer, go:function(v){ go(v); }, register:function(view, fn){ LOAD[view]=fn; },
    current:function(){ var v=location.hash.replace('#',''); return LOAD[v]?v:''; }, visible:function(){ return !app.hidden; } };
})();
