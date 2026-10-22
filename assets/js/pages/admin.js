/* 메가스팟 관리자 화면 — 로그인 · 대시보드 · 문의 · 견적 계산 · 예약 · 일정 · 후기 · 회원 · 입점 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc, E=window.MEGASPOT_PRICE, D=E&&E.data();
  function A(path, opts){ return M.api('/admin'+path, opts||{}); }
  var STATUSES=['문의 접수','조건 확인','견적 발송','결제 대기','예약 확정','이용 완료','취소·환불'];
  var ST_CLS={'문의 접수':'st-new','조건 확인':'st-check','견적 발송':'st-quote','결제 대기':'st-pay','예약 확정':'st-ok','이용 완료':'st-done','취소·환불':'st-cancel','삭제됨':'st-del'};
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
  function timeText(d,sep){ if(d.start_h&&d.end_h){ var hl=function(h){ return (h>=24?'다음 날 ':'')+('0'+(h%24)).slice(-2)+':00'; }; return hl(+d.start_h)+sep+hl(+d.end_h)+' ('+(d.end_h-d.start_h)+'시간)'; } return d.t_start&&d.t_end?d.t_start+sep+d.t_end:(SLOT[d.slot]||''); }
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
  var LOAD={ dash:loadDash, resv:loadResv, inq:loadInq, quote:function(){ calc(); loadRecentQuotes(); }, catering:loadCatering, orders:loadOrders, bookings:loadBookings, calendar:loadCalendar, reviews:loadReviews, members:loadMembers, hosts:loadHosts };
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
    return '<div class="adm-row" data-ref="'+esc(it.ref)+'" tabindex="0"><div class="r1"><b>'+esc(it.name||'(이름 없음)')+'</b>'+(it.reserve?'<span class="tag-rv">예약 신청</span>':'')+(it.catering?'<span class="tag-cat">출장뷔페</span>':'')+(it.channel&&it.channel!=='web'?chTag(it.channel, it.channel_note):'')+stBadge(it.status)+'</div><div class="r2">'+esc(when)+(currentAmount(it)!=null?' · 금액 <b>'+esc(man(currentAmount(it)))+'</b>':'')+'</div><div class="r3"><span>'+esc(it.ref)+'</span><span class="'+(late?'late':'')+'">'+esc(extra||('접수 '+ago(it.created_at)))+'</span></div></div>';
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
      $('#dash-upcoming').innerHTML=(d.upcoming||[]).length?d.upcoming.map(function(b){ var dd=E?E.diffDays(d.today,b.date):''; return '<div class="adm-row"'+(b.inquiry_ref?' data-ref="'+esc(b.inquiry_ref)+'"':'')+'><div class="r1"><b>'+esc(b.customer_name)+'</b><span class="st st-ok">'+(dd===0?'오늘':'D-'+dd)+'</span></div><div class="r2">'+esc(kd(b.date))+' · '+esc(b.start_h!=null&&b.end_h!=null?hl(b.start_h)+'–'+hl(b.end_h):(SLOT[b.slot]||b.slot||''))+(b.headcount?' · '+b.headcount+'명':'')+(b.amount!=null?' · <b>'+esc(man(b.amount))+'</b>':'')+'</div><div class="r3"><span>'+esc(b.booking_code)+'</span><a href="tel:'+esc(b.phone)+'">'+esc(b.phone)+'</a></div></div>'; }).join(''):emptyMsg('14일 안에 잡힌 예약이 없습니다.');
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
          +'<span><b>'+esc(d.name||it.name||'')+'</b>'+(d.reserve?' <span class="tag-rv">예약 신청</span>':'')+'<small>'+esc(d.phone||it.phone||'')+'</small><small>'+chTag(d.channel||'web', d.channel_note)+(d.came_from&&d.came_from.label&&(d.channel||'web')==='web'?'<span class="came">'+esc(d.came_from.label)+' 유입</span>':'')+(famAsk(d)?'<span class="came fam">+ '+esc(famAsk(d))+'</span>':'')+(d.catering?'<span class="came cat">+ 출장뷔페</span>':'')+'</small><small>'+esc(TYPE[d.inquiry_type]||'행사 대관')+(d.member_id?' · 회원':'')+'</small></span>'
          +'<span>'+(d.inquiry_type==='partner'?esc(d.org||'제휴 제안'):esc(kd(d.date||it.event_date)))+'<small>'+esc([time, (d.headcount||it.headcount)?(d.headcount||it.headcount)+'명':'', PUR[d.purpose]||''].filter(Boolean).join(' · '))+'</small></span>'
          +'<span>'+stBadge(it.status)+(it.status===DELETED&&d.deleted_at?'<small>삭제 '+esc(String(d.deleted_at).slice(5,16))+'</small>':'')+'</span>'
          +'<span>'+(currentAmount(it)!=null?'<b>'+esc(man(currentAmount(it)))+'</b><small>'+(d.amount_override?'운영자 수정 금액':'금액')+'</small>':'<small>미정</small>')+'</span>'
          +'<span class="inq-memo"><small class="inq-memo-label">운영 메모</small><span class="adm-operation-memo">'+esc(it.memo||'–')+'</span></span></div>';
      }).join('');
      selSync();
    }).catch(fail(box));
  }
  /* 목록에서 여러 건 골라 삭제 */
  var SEL={};
  function delView(){ return $('#inq-status').value==='deleted'; }
  function selRefs(){ return Object.keys(SEL).filter(function(k){ return SEL[k]; }); }
  function selSync(){
    var n=selRefs().length, all=$('#inq-sel-all'), boxes=$$('#inq-list [data-sel]');
    $('#inq-bulk').hidden=!n; $('#inq-sel-n').textContent=n+'건 선택';
    $('#inq-sel-del').hidden=delView(); $('#inq-sel-restore').hidden=!delView();
    if(all){ var on=boxes.filter(function(b){ return b.checked; }).length; all.checked=!!boxes.length && on===boxes.length; all.indeterminate=on>0 && on<boxes.length; }
  }
  $('#inq-list').addEventListener('change', function(e){
    var t=e.target;
    if(t.id==='inq-sel-all'){ $$('#inq-list [data-sel]').forEach(function(b){ b.checked=t.checked; SEL[b.dataset.sel]=t.checked; b.closest('.tr').classList.toggle('sel', t.checked); }); selSync(); return; }
    if(t.dataset.sel){ SEL[t.dataset.sel]=t.checked; t.closest('.tr').classList.toggle('sel', t.checked); selSync(); }
  });
  $('#inq-sel-clear').addEventListener('click', function(){ SEL={}; $$('#inq-list [data-sel]').forEach(function(b){ b.checked=false; b.closest('.tr').classList.remove('sel'); }); selSync(); $('#inq-bulk-msg').hidden=true; });
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
    var rows=inqCache.map(function(it){ var d=it.data||{}; return [it.ref,it.created_at,it.status,d.reserve?'예약 신청':'문의',TYPE[d.inquiry_type]||'행사 대관',chLabel(d.channel||'web', d.channel_note),(d.came_from&&d.came_from.label)||'',famAsk(d),d.catering?(d.catering.summary||'상담 희망'):'',d.name||it.name,d.phone||it.phone,d.email||it.email,d.date||it.event_date||'',d.t_start||'',d.t_end||'',d.headcount||it.headcount||'',PUR[d.purpose]||d.purpose||'',d.total!=null?d.total:'',it.quote_total||'',d.member_id?'Y':'',it.memo||'']; });
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
      +'<div class="dr-top">'+(it.status===DELETED?stBadge(it.status):'<select class="select" id="dr-status">'+STATUSES.map(function(s){ return '<option'+(s===it.status?' selected':'')+'>'+s+'</option>'; }).join('')+'</select>')
      +'<span class="small muted">접수 '+esc(String(it.created_at||'').slice(0,16))+(d.member_id?' · 회원 '+esc(d.member_email||''):'')+'</span></div>'
      +'<div class="dr-ch"><label for="dr-ch">문의 경로</label><select class="select" id="dr-ch">'+chOptions(d.channel||'web')+'</select><input class="input" id="dr-ch-note" maxlength="40" value="'+esc(d.channel_note||'')+'" placeholder="'+((d.channel||'web')==='other'?'기타 경로 (선택)':'세부 경로 (선택)')+'"'+(['other','sns'].indexOf(d.channel||'web')>=0?'':' hidden')+'><button class="btn btn-light btn-xs" type="button" id="dr-ch-save" hidden>경로 저장</button>'
      +((d.channel||'web')==='web'&&d.came_from?'<span class="dr-came">유입: <b>'+esc(d.came_from.label||'')+'</b>'+(d.came_from.host?' <small>('+esc(d.came_from.host)+')</small>':'')+(d.came_from.utm_campaign?' <small>캠페인 '+esc(d.came_from.utm_campaign)+'</small>':'')+(d.came_from.landing?' <small>첫 페이지 '+esc(d.came_from.landing)+'</small>':'')+'</span>':'')+'</div>'
      +(cur.wait?'<div class="dr-wait"><span class="kind kind-pd wait-no">대기 <b>'+cur.wait.no+'</b>번</span><span>'+esc(kd(cur.wait.date))+' 예약 대기 '+cur.wait.total+'명 가운데 '+cur.wait.no+'번째입니다.</span>'+(cur.wait.total>1?'<button type="button" class="linkish" id="dr-wait-go">일자별 예약에서 순번 바꾸기 →</button>':'')+'</div>':'')
      +(famAsk(d)?'<div class="dr-fam"><span class="ch-tag">함께 알아보기</span> <b>'+esc(famAsk(d))+'</b> <small class="muted">고객이 같은 날 함께 쓰고 싶다고 체크했습니다. 해당 공간 일정을 확인해 함께 안내해 주세요.</small></div>':'')
      +(d.catering?'<div class="dr-cat"><span class="tag-cat">출장뷔페</span> <b>'+esc(d.catering.summary||'출장뷔페 상담 희망')+'</b>'+(d.catering.note?'<small>메모: '+esc(d.catering.note)+'</small>':'')+'<small class="muted">'+(d.catering.by==='admin'?'관리자가 저장한 구성입니다.':'고객이 신청서에서 \'출장뷔페도 함께 상담받기\'를 체크했습니다. 금액은 대관료와 별도입니다.')+'</small><button type="button" class="btn btn-light btn-xs" id="dr-cat-go">출장뷔페 계산기에서 열기 →</button></div>':'')
      +'<div class="dr-actions"><button class="btn btn-primary btn-sm" type="button" id="dr-quote">이 문의로 견적 계산 →</button><button class="btn btn-light btn-sm" type="button" id="dr-cat">출장뷔페 계산</button>'
      +(tel?'<a class="btn btn-light btn-sm" href="tel:'+esc(tel)+'">전화</a><a class="btn btn-light btn-sm" href="sms:'+esc(tel)+'">문자</a>':'')
      +((d.email||it.email)?'<a class="btn btn-light btn-sm" href="mailto:'+esc(d.email||it.email)+'?subject='+encodeURIComponent('[메가스팟 건대] 문의 '+it.ref+' 안내')+'">이메일</a>':'')
      +((it.status===DELETED||(cur.bookings||[]).some(function(b){ return b.status!=='cancelled'; }))?'':'<button class="btn btn-light btn-sm btn-ok" type="button" id="dr-book">예약 확정</button>')
      +'<button class="btn btn-light btn-sm" type="button" id="dr-edit">내용 수정</button></div>'
      +'<div class="dr-sec"><h3>고객</h3>'+kv('이름·소속',esc(d.name||it.name||''))+kv('연락처',esc(d.phone||it.phone||''))+kv('이메일',esc(d.email||it.email||''))+kv('선호 연락',esc({kakao:'카카오톡',phone:'전화',sms:'문자',email:'이메일'}[d.contact_pref]||d.contact_pref||''))+kv('회사·단체',esc(d.org||''))+'</div>'
      +(d.reserve?'<div class="notice" style="margin-bottom:12px"><div><b>홈페이지에서 금액을 확인하고 예약을 신청한 건입니다.</b>'+(d.total?' 고객이 본 예상 금액은 <b>'+esc(won(d.total))+'</b>'+(d.pkg?' ('+esc({day:'낮 패키지',allday:'올데이 패키지',allnight:'올나잇 패키지'}[d.pkg]||d.pkg)+')':'')+'입니다.':'')+' 일정이 비어 있으면 금액을 확인해 결제 방법을 안내하고, 입금·결제가 끝나면 \'예약 확정\'을 눌러 주세요.</div></div>':'')
      +'<div class="dr-sec"><h3>행사 조건</h3>'+kv('구분',d.reserve?'<b>예약 신청</b>':'문의')+kv('유형',esc(TYPE[d.inquiry_type]||'행사 대관'))+kv('목적',esc(PUR[d.purpose]||d.purpose||''))+kv('이용일',esc(d.date?kd(d.date):'')+(d.date_alt?' <small>(대체 '+esc(kd(d.date_alt))+')</small>':''))+kv('시간',esc(time))+kv('준비 입장·퇴장',esc([d.t_setup,d.t_out].filter(Boolean).join(' / ')))+kv('인원',esc(d.headcount?d.headcount+'명':''))+kv('배치',esc(d.layout||''))+kv('필요한 것',esc(needs))+kv('음식·연출',esc(d.food_fx||''))+kv('예산',esc(d.budget||''))+kv('반복 일정',esc([d.repeat_cycle,d.repeat_period,d.repeat_days].filter(Boolean).join(' · ')))+kv('서류',esc((d.docs||[]).join(', ')))+kv('제휴 형태',esc(d.partner_kind||''))+kv('선택 옵션',esc(optText(d.options)))
      +(d.message?'<div class="dr-msg">'+esc(d.message)+'</div>':'')+'</div>'
      +amountSection(it, d)
      +(d.estimate?'<details class="dr-sec"><summary><h3 style="display:inline">'+((d.source==='admin'||d.estimate_admin)?'요금표 계산 내역':'고객이 보낸 예상 금액')+'</h3></summary><pre class="dr-pre">'+esc(d.estimate)+'</pre></details>':'')
      +(d.estimate_customer?'<details class="dr-sec"><summary><h3 style="display:inline">고객이 처음 보낸 예상 금액</h3></summary><pre class="dr-pre">'+esc(d.estimate_customer)+'</pre></details>':'')
      +'<div class="dr-sec"><h3>진행 체크리스트</h3><div class="dr-checks">'+CHECKS.map(function(c){ var v=ch[c[0]]; return '<label class="chk"><input type="checkbox" data-chk="'+c[0]+'"'+(v?' checked':'')+'> '+esc(c[1])+(v&&typeof v==='string'?' <small>'+esc(v.slice(5,16))+'</small>':'')+'</label>'; }).join('')+'</div></div>'
      +'<div class="dr-sec"><h3>저장한 견적</h3>'+((cur.quotes||[]).length?cur.quotes.map(function(q){ return '<div class="dr-quote"><div><b>'+esc(q.quote_no)+'</b> <span class="small muted">'+esc(String(q.created_at).slice(0,16))+'</span></div><b>'+esc(won(q.total))+'</b><button class="btn btn-light btn-sm" type="button" data-openq="'+esc(q.quote_no)+'">열기</button></div>'; }).join(''):'<p class="small muted">아직 저장한 견적이 없습니다.</p>')+'</div>'
      +((cur.bookings||[]).length?'<div class="dr-sec"><h3>연결된 예약</h3>'+cur.bookings.map(function(b){ return '<div class="small">'+esc(b.booking_code)+' · '+esc(kd(b.date))+' · '+esc({confirmed:'예약 확정',completed:'이용 완료',cancelled:'취소'}[b.status]||b.status)+'</div>'; }).join('')+'</div>':'')
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
    $('#dr-memo-save').addEventListener('click', function(){ var v=$('#dr-memo').value; A('/inquiries/'+it.ref,{method:'PATCH', body:{memo:v}}).then(function(){ it.memo=v; refreshLists(); M.toast('메모를 저장했습니다.'); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); });
    $$('#dr-body [data-chk]').forEach(function(cb){ cb.addEventListener('change', function(){ var o={}; $$('#dr-body [data-chk]').forEach(function(x){ o[x.dataset.chk]=x.checked; }); A('/inquiries/'+it.ref+'/checks',{method:'PUT', body:{checks:o}}).then(function(r){ cur.checks=r.checks; M.toast('체크리스트를 저장했습니다.'); }).catch(function(e){ if(!guard(e)) M.toast(e.message); }); }); });
    $('#dr-quote').addEventListener('click', function(){ quoteFromInquiry(cur.item); closeDrawer($('#adm-drawer')); go('quote'); });
    var ctGo=function(){ ctFromInquiry(cur.item); closeDrawer($('#adm-drawer')); go('catering'); };
    $('#dr-cat').addEventListener('click', ctGo); var dcg=$('#dr-cat-go'); if(dcg) dcg.addEventListener('click', ctGo);
    var db=$('#dr-book'); if(db) db.addEventListener('click', function(){ openConfirm(confirmFromInquiry()); });
    var wg=$('#dr-wait-go'); if(wg) wg.addEventListener('click', function(){ var dt=cur.wait.date; closeDrawer($('#adm-drawer')); go('resv'); if($('#rs-from').value>dt || ($('#rs-to').value && $('#rs-to').value<dt)){ setRange('upcoming'); loadResv(); } });
    $('#dr-edit').addEventListener('click', function(){ openEdit(cur.item); });
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
  function refreshLists(){ if(!$('#view-inq').hidden) loadInq(); if(!$('#view-dash').hidden) loadDash(); if(!$('#view-resv').hidden) loadResv(); if(!$('#view-bookings').hidden) loadBookings(); }
  var LOGK={'inquiry.created':'접수','reserve.created':'예약 신청 접수','inquiry.updated':'상태·메모·금액 변경','inquiry.edited':'내용 수정','quote.saved':'견적 저장','booking.created':'예약 등록','inquiry.confirmed':'예약 확정 처리','inquiry.deleted':'삭제 (보관함으로)','inquiry.restored':'삭제 문의 복원','waitlist.updated':'대기 순번 변경','booking.updated':'예약 상태 변경','order.created':'주문 생성','order.paid':'결제 완료','order.updated':'주문 변경'};
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
    $('#nw-start').innerHTML=nwHourOpts(D.openFrom, D.openTo-1, '', '미정');
    $('#nw-end').innerHTML=nwHourOpts(D.openFrom+1, D.openTo, '', '미정');
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
    // 시작을 고르면 종료 목록을 시작 뒤로 맞춥니다
    if(sh){ var cur=eh; $('#nw-end').innerHTML=nwHourOpts(+sh+1, D.openTo, cur && +cur>+sh ? cur : '', '미정'); eh=$('#nw-end').value; }
    $$('#nw-pkgs [data-nwpkg]').forEach(function(b){ var p=E.findPkg(b.dataset.nwpkg); b.classList.toggle('on', !!sh && +sh===p.start && +eh===p.end); });
    NW.last=null;
    if(!date || !sh || !eh){ box.innerHTML='<div class="nw-auto-empty small muted">이용일과 시작·종료 시간을 고르면 요금표(성수기 포함)로 바로 계산합니다.</div>'; nwHint(); return; }
    var people=Math.max(1, Math.min(D.people.max, parseInt(f.headcount.value,10)||D.people.base));
    var q=E.quote({ date:date, start:+sh, end:+eh, people:people, purpose:f.purpose.value, regular:f.regular?f.regular.checked:false, options:nwOptions() }); if(!q){ box.innerHTML=''; return; }
    NW.last=q;
    var rows=[];
    if(q.pkg) rows.push([q.pkg.label+' 공간료', q.pkg.time+' · '+q.pkg.pct+'% 할인', q.pkg.price]);
    else { q.time.lines.forEach(function(l){ rows.push(['공간료 · '+l.label, E.hourLabel(l.from)+'–'+E.hourLabel(l.to)+' · '+l.hours+'시간 × '+won(l.rate), l.sum]); }); if(q.surcharge) rows.push(['성수기 포함 인원 '+q.peopleBase+'명 가산', q.peak.label+' · 1건당', q.surcharge]); }
    rows.push(['인원 '+q.people+'명', q.peopleExtra?'기준 '+q.peopleBase+'명 + '+q.peopleExtra+'명':'기준 '+q.peopleBase+'명 안', q.peopleFee]);
    q.options.forEach(function(o){ rows.push([o.label, o.qty, o.amount]); });
    box.innerHTML='<div class="nw-sum"><span>'+esc(E.kdate(q.date))+' · '+esc(q.colLabel)+' 요금 · '+esc(q.range)+'</span><b>'+esc(won(q.total))+'</b></div>'
      +'<table class="nw-lines">'+rows.map(function(r){ return '<tr><td>'+esc(r[0])+'<small>'+esc(r[1])+'</small></td><td>'+esc(won(r[2]))+'</td></tr>'; }).join('')+'</table>'
      +(q.warnings.length?'<p class="tiny" style="color:var(--warn)">'+esc(q.warnings.join(' · '))+'</p>':'')
      +'<p class="tiny muted">보증금 '+esc(won(q.deposit))+' 별도 · '+esc(D.vatNote)+'</p>';
    nwHint();
  }
  function nwHint(){ var h=$('#nw-total-hint'); if(!h) return; h.textContent=NW.last?'요금표 계산 금액: '+won(NW.last.total):''; }
  function nwSyncMode(){ var m=nwMode(); $('#nw-auto').hidden=m!=='auto'; $('#nw-manual').hidden=m!=='manual'; if(m==='manual' && !$('#nw-total').value && NW.last){ $('#nw-total').value=NW.last.total; } }
  function nwModeUi(edit){
    NW.edit=edit||null;
    $('#nw-title').textContent=edit?'문의 수정 · '+edit:'문의 직접 등록';
    $('#nw-intro').textContent=edit?'고객 정보·행사 조건·금액을 고칩니다. 고객이 처음 보낸 원문은 그대로 남고, 무엇을 고쳤는지는 변경 기록에 남습니다.':'카카오톡·전화·이메일·방문으로 받은 문의도 여기에 등록해 두면 홈페이지 문의와 같은 목록에서 견적·예약까지 관리할 수 있습니다.';
    $('#nw-submit').textContent=edit?'수정 저장':'등록';
  }
  $('#nw-ch').innerHTML=chOptions('', '경로 선택'); $('#nw-ch').required=true;
  function nwChSync(){ var ch=$('#nw-ch').value, n=$('#nw-ch-note'); n.hidden=!(ch==='other'||ch==='sns'); n.required=false; n.placeholder=ch==='other'?'기타 경로 (선택, 예: 지인 소개, 현수막)':'세부 경로 (예: 인스타그램, 블로그)'; if(n.hidden) n.value=''; }
  $('#nw-ch').addEventListener('change', nwChSync);
  function openNew(){ $('#nw-form').reset(); nwInit(); nwModeUi(null); nwChSync(); $('#nw-msg').hidden=true; nwSyncMode(); nwCalc(); openDrawer('#adm-new'); }
  function openEdit(it){
    var d=it.data||{}, f=$('#nw-form');
    f.reset(); nwInit(); nwModeUi(it.ref); $('#nw-msg').hidden=true;
    f.channel.value=CH[d.channel]&&d.channel!=='online'?d.channel:'web'; f.channel_note.value=d.channel_note||''; nwChSync(); f.channel_note.value=d.channel_note||''; f.inquiry_type.value=TYPE[d.inquiry_type]?d.inquiry_type:'event';
    f.name.value=d.name||it.name||''; f.phone.value=d.phone||it.phone||''; f.email.value=d.email||it.email||'';
    f.date.value=d.date||it.event_date||'';
    var sh=d.start_h, eh=d.end_h;
    if(sh==null && d.t_start && d.t_end && /^\d{1,2}:\d{2}$/.test(d.t_start) && /^\d{1,2}:\d{2}$/.test(d.t_end)){ var a=parseInt(d.t_start,10), b=parseInt(d.t_end,10); if(a<7) a+=24; if(b<=a) b+=24; if(a>=7&&b<=31){ sh=a; eh=b; } }
    if(sh!=null && D){ $('#nw-start').value=String(sh); $('#nw-end').innerHTML=nwHourOpts(+sh+1, D.openTo, eh!=null?eh:'', '미정'); }
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
    nwCalc(); nwSyncMode(); openDrawer('#adm-new'); setTimeout(function(){ f.name.focus(); }, 50);
  }
  $('#nw-form').addEventListener('change', function(e){ if(e.target.name==='amount_mode'){ nwSyncMode(); return; } if(e.target.name==='total'||e.target.name==='amount_note') return; nwCalc(); });
  $('#nw-form').addEventListener('input', function(e){ if(e.target.name==='headcount'||e.target.dataset.nwmgr) nwCalc(); });
  $('#nw-pkgs').addEventListener('click', function(e){ var b=e.target.closest('[data-nwpkg]'); if(!b) return; var p=E.findPkg(b.dataset.nwpkg); $('#nw-start').value=p.start; $('#nw-end').innerHTML=nwHourOpts(p.start+1, D.openTo, p.end, '미정'); nwCalc(); });
  $('#nw-use-auto').addEventListener('click', function(){ if(!NW.last){ M.toast('이용일과 시간을 먼저 골라 주세요.'); return; } $('#nw-total').value=NW.last.total; });
  $('#nw-form').addEventListener('submit', function(e){
    e.preventDefault(); var f=e.target; if(!M.validate(f)) return; var d=M.formData(f), m=nwMode();
    d.regular=!!(f.regular && f.regular.checked); d.options=nwOptions(); delete d.manager;
    var edit=NW.edit;
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
    A('/inquiries',{method:'POST', body:d}).then(function(r){ closeDrawer($('#adm-new')); M.toast('문의 '+r.ref+'을(를) 등록했습니다.'); refreshLists(); openInquiry(r.ref); })
    .catch(function(x){ if(!guard(x)) note($('#nw-msg'), x.message); }).finally(function(){ btn.disabled=false; });
  });

  /* =================== 견적 계산 =================== */
  var Q;
  function blankQ(){ return { ref:'', customer:'', phone:'', email:'', date:todayIso(), start:13, end:17, people:20, purpose:'', regular:false,
    opts:{ manager:{on:false,count:1,hours:4}, cleaning:false, disposable:false, banner:false, xbanner:false },
    discType:'none', discVal:0, discWhy:'', extras:[], deposit:(D?D.deposit.amount:150000), valid:1, note:'', quoteNo:'' }; }
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
    Q.deposit=Math.max(0, Number($('#q-deposit').value)||0); Q.valid=+$('#q-valid').value||1; Q.note=$('#q-note').value.trim();
  }
  function compute(){
    var opts={}; if(Q.opts.manager.on) opts.manager={count:Q.opts.manager.count, hours:Q.opts.manager.hours}; ['cleaning','disposable','banner','xbanner'].forEach(function(k){ if(Q.opts[k]) opts[k]=true; });
    var q=E.quote({ date:Q.date, start:Q.start, end:Q.end, people:Q.people, purpose:Q.purpose, regular:Q.regular, options:opts }); if(!q) return null;
    var lines=[];
    if(q.pkg) lines.push({ label:'공간료 · '+q.pkg.label+(q.peak?' ('+q.peak.seasonLabel+')':''), desc:q.pkg.time+' · '+q.pkg.hours+'시간'+(q.pkg.pct?' (시간 요금 '+won(q.pkg.regular)+' → '+q.pkg.pct+'% 할인)':''), amount:q.pkg.price });
    else { q.time.lines.forEach(function(l){ lines.push({ label:'공간료 · '+l.label, desc:E.hourLabel(l.from)+'–'+E.hourLabel(l.to)+' · '+l.hours+'시간 × '+won(l.rate), amount:l.sum }); }); if(q.surcharge) lines.push({ label:'성수기 포함 인원 가산', desc:q.peak.label+' · 기준 '+q.peopleBase+'명 · 1건당', amount:q.surcharge }); }
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
  // '김민지 · 성수 러닝크루' → ['김민지', '성수 러닝크루'] (가운뎃점·슬래시·쉼표로 나눔, '김민지(러닝크루)'처럼 괄호로 적어도 됨)
  function custParts(s){
    s=String(s||'').trim(); if(!s) return ['',''];
    var m=s.match(/^([^()]+?)\s*\(([^)]*)\)\s*$/); if(m) return [m[1].trim(), m[2].trim()];
    var i=s.search(/\s*[·•\/,|]\s*/); if(i<0) return [s,''];
    return [s.slice(0,i).trim(), s.slice(i).replace(/^\s*[·•\/,|]\s*/,'').trim()];
  }
  function kakaoText(){
    var q=R.q, L=[], cp=custParts(Q.customer);
    L.push('[메가스팟 건대 견적 안내]'+(Q.quoteNo?' 견적번호 '+Q.quoteNo:''));
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

  /* =================== 출장뷔페 =================== */
  // 가격·메뉴는 홈페이지와 같은 assets/js/data/catering.js(고객 안내 판매가, 부가세 별도)를 씁니다.
  // 발주처 연락처와 1인 수수료는 서버 settings 표(settings/catering)에만 저장해 홈페이지 파일에는 남기지 않습니다.
  var CC=window.MEGASPOT_CATERING_CALC||null, CD=CC?CC.data:null, CSET=null;
  function blankCT(){ return { ref:'', customer:'', phone:'', date:'', time:'', rent:'', people:60, course:'classic', bbq:'', beer:0, fee:CD?CD.delivery.fee:100000, note:'' }; }
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
    ctFill(); ctCalc(); ctStatic();
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
    $('#ct-link').innerHTML=CT.ref?'<span>연결된 문의 <b>'+esc(CT.ref)+'</b></span><button type="button" class="btn btn-light btn-sm" id="ct-open-ref">문의 열기</button><button type="button" class="btn btn-light btn-sm" id="ct-unlink">연결 해제</button>':'<span class="small muted">연결된 문의 없음 — 문의 상세에서 \'출장뷔페 계산\'을 누르면 고객·날짜·인원이 채워집니다.</span>';
    $('#ct-save-inq').hidden=!CT.ref;
    var o=$('#ct-open-ref'); if(o) o.addEventListener('click', function(){ openInquiry(CT.ref); });
    var u=$('#ct-unlink'); if(u) u.addEventListener('click', function(){ CT.ref=''; ctFill(); ctCalc(); });
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
    L.push('· 장소: 서울 광진구 화양동 10-1 한아름건물 2층 메가스팟 건대 (건물 주차 가능)');
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
  function ctFromInquiry(it){
    var d=it.data||{}, c=d.catering||{};
    CT=blankCT(); CT.ref=it.ref; CT.customer=d.name||it.name||''; CT.phone=d.phone||it.phone||''; CT.date=d.date||it.event_date||'';
    CT.time=''; CT.rent=timeText(d,'–'); CT.people=c.people||parseInt(d.headcount||it.headcount,10)||60;
    if(c.course!==undefined) CT.course=c.course||''; if(c.bbq) CT.bbq=c.bbq; if(c.beer) CT.beer=c.beer; if(c.fee!=null && c.by==='admin') CT.fee=c.fee; if(c.note) CT.note=c.note;
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
  if($('#ct-form')){
    $('#ct-form').addEventListener('input', ctCalc); $('#ct-form').addEventListener('change', ctCalc);
    $('#ct-reset').addEventListener('click', function(){ CT=blankCT(); ctFill(); ctCalc(); $$('#ct-check input').forEach(function(x){ x.checked=false; }); $('#ct-msg').hidden=true; });
    $('#ct-copy-cust').addEventListener('click', function(){ ctCalc(); if(!CR||CR.empty) return M.toast('구성을 먼저 골라 주세요.'); ctCopy(ctCustText(), '고객 안내문을 복사했습니다. 카카오톡·문자에 붙여 넣으세요.'); });
    $('#ct-copy-menu').addEventListener('click', function(){ ctCalc(); var t=ctMenuText(); if(!t) return M.toast('코스를 먼저 골라 주세요.'); ctCopy(t, '코스 메뉴를 복사했습니다.'); });
    $('#ct-copy-order').addEventListener('click', function(){ ctCalc(); if(!CR||CR.empty) return M.toast('구성을 먼저 골라 주세요.'); if(!CSET) return M.toast('발주처 정보를 불러온 뒤 다시 눌러 주세요.'); ctCopy(ctOrderText(), '발주 메모를 복사했습니다.'+(CSET.vendor_name?' '+CSET.vendor_name+'에 보내 주세요.':'')); });
    $('#ct-to-quote').addEventListener('click', function(){ ctCalc(); ctToQuote(); });
    $('#ct-save-inq').addEventListener('click', function(){
      ctCalc(); if(!CT.ref) return; var b=this; b.disabled=true;
      var body={ catering: CR.empty?null:{ course:CT.course, people:CT.people, bbq:CT.bbq, beer:CT.beer, fee:CT.fee, note:CT.note } };
      A('/inquiries/'+encodeURIComponent(CT.ref),{method:'PATCH', body:body}).then(function(){ note($('#ct-msg'), '문의 '+CT.ref+'에 출장뷔페 구성을 저장했습니다.', true); refreshLists(); })
      .catch(function(e){ if(!guard(e)) note($('#ct-msg'), e.message); }).finally(function(){ b.disabled=false; });
    });
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
  // 짧은 시각 표기: 24시는 24:00, 다음 날 새벽은 '익일 07:00'
  function hl(h){ h=+h; return (h>24?'익일 ':'')+('0'+(h>24?h-24:h)).slice(-2)+':00'; }
  function bkTimes(sh, eh){
    if(!E||!D) return;
    $('#bk-start').innerHTML=nwHourOpts(D.openFrom, D.openTo-1, sh==null?'':sh, '미정');
    $('#bk-end').innerHTML=nwHourOpts(sh?+sh+1:D.openFrom+1, D.openTo, eh==null?'':eh, '미정');
    $('#bk-pkgs').innerHTML=D.packages.map(function(p){ return '<button type="button" class="chip" data-bkpkg="'+p.id+'">'+esc(p.label)+' '+esc(p.time)+'</button>'; }).join('');
    bkSync();
  }
  function bkSync(){
    if(!E||!D) return;
    var sh=$('#bk-start').value, eh=$('#bk-end').value, slot='custom';
    D.packages.forEach(function(p){ var on=sh && +sh===p.start && +eh===p.end; if(on) slot='pkg-'+p.id; var b=$('#bk-pkgs [data-bkpkg="'+p.id+'"]'); if(b) b.classList.toggle('on', !!on); });
    $('#bk-slot').value=slot;
    var date=$('#bk-date').value, h=$('#bk-amount-hint');
    if(date && sh && eh){ var q=E.quote({ date:date, start:+sh, end:+eh, people:Math.max(1,parseInt($('#bk-people').value,10)||D.people.base) }); h.innerHTML=q?'요금표 기준 '+esc(won(q.total))+' (옵션·할인 제외) <button type="button" class="linkish" id="bk-use-calc">넣기</button>':''; var u=$('#bk-use-calc'); if(u&&q) u.addEventListener('click', function(){ $('#bk-amount').value=q.total; }); }
    else h.textContent='';
  }
  bkTimes();
  $('#bk-start').addEventListener('change', function(){ var sh=this.value, eh=$('#bk-end').value; $('#bk-end').innerHTML=nwHourOpts(sh?+sh+1:D.openFrom+1, D.openTo, eh&&+eh>+sh?eh:'', '미정'); bkSync(); });
  ['#bk-end','#bk-date','#bk-people'].forEach(function(sel){ $(sel).addEventListener('change', bkSync); });
  $('#bk-pkgs').addEventListener('click', function(e){ var b=e.target.closest('[data-bkpkg]'); if(!b) return; var p=E.findPkg(b.dataset.bkpkg); bkTimes(p.start, p.end); });
  function bookingFromInquiry(it){
    var d=it.data||{}; $('#bk-ref').value=it.ref; $('#bk-name').value=d.name||it.name||''; $('#bk-phone').value=d.phone||it.phone||''; $('#bk-date').value=d.date||it.event_date||''; $('#bk-people').value=d.headcount||it.headcount||'';
    var sh=d.start_h, eh=d.end_h; if(sh==null && SLOT_H[d.slot]){ sh=SLOT_H[d.slot][0]; eh=SLOT_H[d.slot][1]; }
    if(sh==null && d.t_start && d.t_end){ var a=parseInt(d.t_start,10), b=parseInt(d.t_end,10); if(!isNaN(a)&&!isNaN(b)){ if(a<7) a+=24; if(b<=a) b+=24; sh=a; eh=b; } }
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
      return '<div class="adm-row"'+(b.inquiry_ref?' data-ref="'+esc(b.inquiry_ref)+'"':'')+'><div class="r1"><b>'+esc(b.customer_name)+'</b><span class="st '+st[1]+'">'+st[0]+'</span></div><div class="r2">'+esc(kd(b.date))+' · '+esc(b.start_h!=null&&b.end_h!=null?hl(b.start_h)+'–'+hl(b.end_h):(SLOT[b.slot]||b.slot||''))+(b.headcount?' · '+b.headcount+'명':'')+(b.amount!=null?' · <b>'+esc(won(b.amount))+'</b>':'')+'</div>'+(b.memo?'<div class="tiny muted">'+esc(b.memo)+'</div>':'')+'<div class="r3"><span>'+esc(b.booking_code)+(b.inquiry_ref?' · '+esc(b.inquiry_ref):'')+' · <a href="tel:'+esc(b.phone)+'">'+esc(b.phone)+'</a></span><span>'+(b.status==='confirmed'?'<button class="btn btn-light btn-sm" type="button" data-bk="completed" data-code="'+esc(b.booking_code)+'">이용 완료</button> <button class="btn btn-light btn-sm" type="button" data-bk="cancelled" data-code="'+esc(b.booking_code)+'">취소</button>':'')+'</span></div></div>';
    }).join(''):emptyMsg('해당하는 예약이 없습니다.');
  }
  $('#bk-filter').addEventListener('change', drawBookings); $('#bk-reload').addEventListener('click', loadBookings);
  $('#bk-list').addEventListener('click', function(e){ var b=e.target.closest('button[data-bk]'); if(!b) return; var s=b.dataset.bk;
    if(!confirm(s==='completed'?'이용 완료로 처리할까요? 처리 후 고객이 예약번호로 후기를 쓸 수 있습니다.':'이 예약을 취소할까요? 달력의 마감 표시도 풀립니다.')) return;
    A('/bookings/'+b.dataset.code,{method:'PATCH', body:{status:s}}).then(function(){ M.toast('변경했습니다.'); loadBookings(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); });
  $('#bk-form').addEventListener('submit', function(e){ e.preventDefault(); var f=e.target; if(!M.validate(f)) return; var d=M.formData(f); d.block_calendar=!!f.block_calendar.checked;
    A('/bookings',{method:'POST', body:d}).then(function(r){ note($('#bk-msg'),'예약을 등록했습니다. 예약번호 '+r.booking_code+' — 고객에게 안내해 주세요.',true); f.reset(); fillSpaces(); bkTimes(); loadBookings(); })
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
    A('/reservations?from='+encodeURIComponent($('#rs-from').value)+'&to='+encodeURIComponent($('#rs-to').value)).then(function(r){ RS.items=r.items||[]; RS.today=r.today||todayIso(); RS.undated=r.undated||0; drawResv(); }).catch(fail(box));
  }
  var BST={confirmed:['예약 확정','st-ok'],completed:['이용 완료','st-done'],cancelled:['취소','st-cancel']};
  // 상태·경로·검색으로 거른 목록 (구분 탭은 아직 적용 전) — 날짜별 확정/후보 개수는 이 목록으로 셉니다
  function resvBase(){
    var st=$('#rs-status').value, ch=$('#rs-ch').value, q=$('#rs-q').value.trim().toLowerCase().replace(/-/g,'');
    return RS.items.filter(function(it){
      if(it.kind==='booking'){ if(st==='active' && it.status==='cancelled') return false; if(st && st!=='active' && it.status!==st) return false; }
      else if(st && st!=='active') return false;
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
  function waitCmp(a,b){ var ra=a.wait_rank==null?1e9:+a.wait_rank, rb=b.wait_rank==null?1e9:+b.wait_rank; if(ra!==rb) return ra-rb; var ca=String(a.created_at||''), cb=String(b.created_at||''); if(ca!==cb) return ca<cb?-1:1; return String(a.ref)<String(b.ref)?-1:1; }
  function waitOrder(){ var by={}; RS.items.forEach(function(it){ if(it.kind==='pending') (by[it.date]=by[it.date]||[]).push(it); });
    Object.keys(by).forEach(function(d){ by[d].sort(waitCmp).forEach(function(it,i){ it._wait=i+1; it._waitN=by[d].length; }); }); return by; }
  // 검색·경로·상태 필터를 쓰는 중에는 일부만 보여서 순번을 끌어 바꾸지 않습니다
  function waitDraggable(){ var st=$('#rs-status').value; return !$('#rs-ch').value && !$('#rs-q').value.trim() && (st===''||st==='active'); }
  function dayStats(base){ var day={}; base.forEach(function(it){ var x=day[it.date]||(day[it.date]={bk:0,pend:0,bkList:[]}); if(it.kind==='booking'){ if(it.status!=='cancelled'){ x.bk++; x.bkList.push(it); } } else x.pend++; }); return day; }
  function drawResv(){
    waitOrder();
    var base=resvBase(), list=resvFiltered(), box=$('#rs-list'), day=dayStats(base);
    var cnt={ all:base.length, booking:base.filter(function(x){ return x.kind==='booking'; }).length, pending:base.filter(function(x){ return x.kind==='pending'; }).length };
    $$('#rs-tabs [data-kind]').forEach(function(b){ b.setAttribute('aria-selected', String(b.dataset.kind===RS.kind)); var em=b.querySelector('em'); if(em) em.textContent=cnt[b.dataset.kind]; });
    var bk=list.filter(function(x){ return x.kind==='booking' && x.status!=='cancelled'; }), pend=list.filter(function(x){ return x.kind==='pending'; });
    var sum=bk.reduce(function(a,x){ return a+(+x.amount||0); },0), noAmt=bk.filter(function(x){ return x.amount==null; }).length;
    var clashDays=Object.keys(day).filter(function(k){ var x=day[k]; return x.pend>0 && (x.bk>0 || x.pend>1); }).length;
    var rv=pend.filter(function(x){ return x.reserve; }).length;
    $('#rs-kpis').innerHTML='<div class="kpi"><small>예약 확정</small><b>'+bk.length+'<span class="small">건</span></b></div>'
      +'<div class="kpi"><small>확정 금액 합계</small><b>'+esc(man(sum))+'</b>'+(noAmt?'<span class="tiny muted">금액 미입력 '+noAmt+'건</span>':'')+'</div>'
      +'<div class="kpi'+(pend.length?' hot':'')+'"><small>예약 문의 (미정)</small><b>'+pend.length+'<span class="small">건</span></b>'+(rv?'<span class="tiny">홈페이지 예약 신청 '+rv+'건</span>':'')+'</div>'
      +'<div class="kpi'+(clashDays?' warn':'')+'"><small>후보가 겹치는 날</small><b>'+clashDays+'<span class="small">일</span></b><span class="tiny muted">확정 예약이 있거나 후보가 2건 이상</span></div>';
    var und=RS.undated?'<div class="rs-note">날짜가 정해지지 않은 예약 문의 <b>'+RS.undated+'건</b>은 일자별 목록에 나오지 않습니다. <button type="button" class="linkish" data-go="inq:open">문의 관리에서 보기 →</button></div>':'';
    if(!list.length){ box.innerHTML=und+emptyMsg('이 기간에 해당하는 예약이 없습니다.'); return; }
    var months={}, mOrder=[];
    list.forEach(function(it){ var mk=String(it.date).slice(0,7); if(!months[mk]){ months[mk]={ days:{}, order:[] }; mOrder.push(mk); } var mo=months[mk]; if(!mo.days[it.date]){ mo.days[it.date]=[]; mo.order.push(it.date); } mo.days[it.date].push(it); });
    var head='<thead><tr><th>구분</th><th>시간</th><th>예약자</th><th>경로</th><th>인원</th><th class="r">금액</th><th>진행</th><th>운영 메모</th><th></th></tr></thead>';
    box.innerHTML=und+mOrder.map(function(mk){
      var mo=months[mk], all=[]; mo.order.forEach(function(dk){ all=all.concat(mo.days[dk]); });
      var gb=all.filter(function(x){ return x.kind==='booking'&&x.status!=='cancelled'; }), gp=all.filter(function(x){ return x.kind==='pending'; }), gs=gb.reduce(function(a,x){ return a+(+x.amount||0); },0);
      return '<div class="rs-group"><div class="rs-ghead"><b>'+(+mk.slice(0,4))+'년 '+(+mk.slice(5,7))+'월</b><span>확정 '+gb.length+'건 · '+esc(won(gs))+(gp.length?' · 예약 문의 '+gp.length+'건':'')+'</span></div>'
        +mo.order.map(function(dk){
          var rows=mo.days[dk].slice().sort(function(a,b){ if(a.kind!==b.kind) return a.kind==='booking'?-1:1; if(a.kind==='pending') return (a._wait||99)-(b._wait||99); return (a.start_h==null?99:a.start_h)-(b.start_h==null?99:b.start_h); });
          var x=day[dk]||{bk:0,pend:0}, dt=new Date(dk+'T12:00:00'), dow=dt.getDay(), off=E&&E.isOff(dk), past=dk<RS.today, clash=x.pend>0 && (x.bk>0 || x.pend>1);
          var pk=E&&E.peakOf?E.peakOf(dk):null;
          return '<div class="rs-day'+(clash?' clash':'')+(past?' past':'')+(dk===RS.today?' is-today':'')+'">'
            +'<div class="rs-dhead"><b class="rs-date'+(off||dow===0?' off':'')+(dow===6?' sat':'')+'">'+(+dk.slice(5,7))+'.'+(+dk.slice(8,10))+' ('+DOWK[dow]+')</b>'+dLabel(dk)+(pk?'<span class="rs-peak">성수기</span>':'')
            +'<span class="rs-dsum">'+(x.bk?'<span class="st st-ok">확정 '+x.bk+'</span>':'')+(x.pend?'<span class="st st-new">대기 '+x.pend+'</span>':'')+'</span>'
            +(clash?'<span class="rs-clash">'+(x.bk?'확정 예약이 있는 날 · 대기 '+x.pend+'명':'같은 날 대기 '+x.pend+'명')+'</span>':'')
            +(x.pend>1&&RS.kind!=='booking'?'<span class="rs-hint">'+(waitDraggable()?'⠿ 끌어서 대기 순번 변경':'검색·필터를 풀면 대기 순번을 바꿀 수 있습니다')+'</span>':'')+'</div>'
            +'<table class="rs-table">'+head+'<tbody>'+rows.map(function(it){ return resvRow(it, x, past); }).join('')+'</tbody></table></div>';
        }).join('')+'</div>';
    }).join('');
  }
  function resvRow(it, x, past){
    var isB=it.kind==='booking', st=isB?(BST[it.status]||[it.status,'']):[it.status,ST_CLS[it.status]||'st-new'];
    var grip=(!isB && it._waitN>1)?'<button type="button" class="rs-grip" data-wdate="'+esc(it.date)+'"'+(waitDraggable()?'':' disabled')+' title="끌어서 대기 순번 바꾸기 (키보드: 위·아래 화살표)" aria-label="'+esc(it.name||'')+' 대기 순번 바꾸기, 현재 '+it._wait+'번"><svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg></button>':'';
    var kind=isB?'<span class="kind kind-bk">확정</span>':grip+'<span class="kind kind-pd wait-no" title="같은 날 예약 대기 순번">대기 <b>'+(it._wait||1)+'</b>번</span>'+(it.reserve?'<span class="tag-rv">예약 신청</span>':'');
    var tel=String(it.phone||'').replace(/[^0-9+]/g,'');
    var acts=(tel?'<a class="btn btn-light btn-xs" href="tel:'+esc(tel)+'" aria-label="전화">전화</a>':'');
    if(isB && it.status==='confirmed') acts+=(past?'<button class="btn btn-light btn-xs" type="button" data-rsact="completed" data-code="'+esc(it.code)+'">이용 완료</button>':'')+'<button class="btn btn-light btn-xs" type="button" data-rsact="cancelled" data-code="'+esc(it.code)+'">취소</button>';
    if(!isB) acts+='<button class="btn btn-primary btn-xs" type="button" data-rsconfirm="'+esc(it.ref)+'">확정</button>';
    var chs=it.channel==='online'?'<span class="ch-tag ch-online">온라인 결제</span>':(it.channel?chTag(it.channel, it.channel_note):'<span class="muted">—</span>');
    return '<tr class="rs-row '+(isB?'booking':'pending')+(it.status==='cancelled'?' cancelled':'')+(past?' past':'')+'" data-date="'+esc(it.date)+'"'+(it.ref?' data-ref="'+esc(it.ref)+'" tabindex="0"':'')+'>'
      +'<td data-th="구분">'+kind+(!isB && x.bk?'<small class="rs-taken">이 날 확정 예약 있음</small>':'')+'</td>'
      +'<td data-th="시간">'+esc(resvTime(it))+(resvHours(it)?'<small>'+esc(resvHours(it))+'</small>':'')+'</td>'
      +'<td data-th="예약자"><b>'+esc(it.name||'')+'</b><small>'+esc(it.phone||'')+(it.purpose&&PUR[it.purpose]?' · '+esc(PUR[it.purpose]):'')+'</small>'+(famAsk(it)?'<small class="rs-fam">+ '+esc(famAsk(it))+'</small>':'')+'</td>'
      +'<td data-th="경로">'+chs+'</td>'
      +'<td data-th="인원">'+(it.headcount?it.headcount+'명':'—')+'</td>'
      +'<td data-th="금액" class="r">'+(it.amount!=null?'<b>'+esc(won(it.amount))+'</b><small>'+esc(SRC[it.amount_src]||'')+'</small>':'<span class="muted">미정</span>')+'</td>'
      +'<td data-th="진행"><span class="st '+st[1]+'">'+esc(st[0])+'</span></td>'
      +'<td data-th="운영 메모" class="rs-operation-memo"><span class="adm-operation-memo">'+esc(it.memo||'–')+'</span></td>'
      +'<td class="rs-acts">'+acts+'</td></tr>';
  }
  $('#rs-ch').innerHTML=chOptions('', '모든 경로').replace('<option value="web">', '<option value="online">온라인 결제</option><option value="web">');
  $('#view-resv').addEventListener('click', function(e){ var r=e.target.closest('[data-range]'); if(r){ setRange(r.dataset.range); loadResv(); return; } var t=e.target.closest('#rs-tabs [data-kind]'); if(t){ RS.kind=t.dataset.kind; drawResv(); } });
  ['#rs-from','#rs-to'].forEach(function(sel){ $(sel).addEventListener('change', function(){ RS.range='custom'; $$('#view-resv [data-range]').forEach(function(b){ b.classList.remove('on'); }); loadResv(); }); });
  ['#rs-status','#rs-ch'].forEach(function(sel){ $(sel).addEventListener('change', drawResv); });
  $('#rs-q').addEventListener('input', drawResv);
  $('#rs-reload').addEventListener('click', loadResv);
  $('#rs-print').addEventListener('click', function(){ document.body.classList.add('print-resv'); window.print(); setTimeout(function(){ document.body.classList.remove('print-resv'); }, 800); });
  $('#rs-csv').addEventListener('click', function(){
    var list=resvFiltered(); if(!list.length){ M.toast('내려받을 예약이 없습니다.'); return; }
    var cols=['이용일','요일','시간','구분','대기 순번','진행 상태','예약자','연락처','문의 경로','인원','금액(원)','금액 기준','예약번호','문의번호','목적','메모'];
    var rows=list.map(function(it){ var dow=DOWK[new Date(it.date+'T12:00:00').getDay()]; return [it.date,dow,resvTime(it),it.kind==='booking'?'예약 확정':(it.reserve?'예약 문의(홈페이지 예약 신청)':'예약 문의'),it.kind==='booking'?'':(it._wait||''),it.kind==='booking'?(BST[it.status]||[it.status])[0]:it.status,it.name,it.phone,it.channel==='online'?'온라인 결제':(it.channel?chLabel(it.channel,it.channel_note):''),it.headcount||'',it.amount!=null?it.amount:'',SRC[it.amount_src]||'',it.code||'',it.ref||'',PUR[it.purpose]||it.purpose||'',it.memo||'']; });
    var csv='﻿'+[cols].concat(rows).map(function(r){ return r.map(function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(','); }).join('\r\n');
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='메가스팟_일자별예약_'+($('#rs-from').value||'처음')+'_'+($('#rs-to').value||'이후')+'.csv'; document.body.appendChild(a); a.click(); a.remove();
  });
  /* 예약 대기 순번 — 손잡이(⠿)를 끌거나, 손잡이에서 위·아래 화살표로 바꿉니다 (마우스·터치 모두) */
  var DRAG=null;
  function waitRows(tb){ return [].slice.call(tb.querySelectorAll('tr.rs-row.pending')); }
  function waitRenumber(tb){ waitRows(tb).forEach(function(r,i){ var b=r.querySelector('.wait-no b'); if(b) b.textContent=i+1; }); }
  function waitSave(date, refs, focusRef){
    A('/reservations/waitlist',{method:'POST', body:{date:date, refs:refs}}).then(function(r){
      (r.order||refs).forEach(function(ref,i){ RS.items.forEach(function(it){ if(it.kind==='pending' && it.ref===ref) it.wait_rank=i+1; }); });
      M.toast((+date.slice(5,7))+'월 '+(+date.slice(8,10))+'일 대기 순번을 저장했습니다.'); drawResv();
      if(focusRef){ var g=$('#rs-list tr[data-ref="'+focusRef+'"] .rs-grip'); if(g) g.focus(); }
    }).catch(function(x){ if(guard(x)) return; M.toast(x.message||'순번을 저장하지 못했습니다.'); loadResv(); });
  }
  $('#rs-list').addEventListener('pointerdown', function(e){
    var g=e.target.closest('.rs-grip'); if(!g || g.disabled || (e.pointerType==='mouse' && e.button!==0)) return;
    e.preventDefault(); e.stopPropagation();
    var tr=g.closest('tr.rs-row'), tb=tr.parentNode;
    DRAG={ tr:tr, tb:tb, date:g.dataset.wdate, orig:waitRows(tb).map(function(r){ return r.dataset.ref; }), y:e.clientY };
    try{ g.setPointerCapture(e.pointerId); }catch(_){}
    tr.classList.add('dragging'); document.body.classList.add('rs-dragging');
  });
  document.addEventListener('pointermove', function(e){
    if(!DRAG) return; e.preventDefault();
    var others=waitRows(DRAG.tb).filter(function(r){ return r!==DRAG.tr; }), before=null;
    for(var i=0;i<others.length;i++){ var rc=others[i].getBoundingClientRect(); if(e.clientY < rc.top+rc.height/2){ before=others[i]; break; } }
    if(before){ if(DRAG.tr.nextSibling!==before) DRAG.tb.insertBefore(DRAG.tr, before); }
    else if(others.length){ var last=others[others.length-1]; if(last.nextSibling!==DRAG.tr) last.parentNode.insertBefore(DRAG.tr, last.nextSibling); }
    waitRenumber(DRAG.tb);
    if(e.clientY<70) window.scrollBy(0,-14); else if(e.clientY>window.innerHeight-70) window.scrollBy(0,14);
  }, { passive:false });
  function dragEnd(){
    if(!DRAG) return; var d=DRAG; DRAG=null;
    d.tr.classList.remove('dragging'); document.body.classList.remove('rs-dragging');
    var now=waitRows(d.tb).map(function(r){ return r.dataset.ref; });
    if(now.join()!==d.orig.join()) waitSave(d.date, now);
  }
  document.addEventListener('pointerup', dragEnd); document.addEventListener('pointercancel', dragEnd);
  $('#rs-list').addEventListener('keydown', function(e){
    var g=e.target.closest('.rs-grip'); if(!g || g.disabled || (e.key!=='ArrowUp' && e.key!=='ArrowDown')) return;
    e.preventDefault();
    var tr=g.closest('tr.rs-row'), tb=tr.parentNode, rows=waitRows(tb), i=rows.indexOf(tr), j=e.key==='ArrowUp'?i-1:i+1;
    if(j<0 || j>=rows.length) return;
    if(e.key==='ArrowUp') tb.insertBefore(tr, rows[j]); else tb.insertBefore(tr, rows[j].nextSibling);
    waitRenumber(tb); waitSave(g.dataset.wdate, waitRows(tb).map(function(r){ return r.dataset.ref; }), tr.dataset.ref);
  });
  $('#rs-list').addEventListener('click', function(e){
    if(e.target.closest('.rs-grip')){ e.stopPropagation(); return; }
    var c=e.target.closest('button[data-rsconfirm]');
    if(c){ e.stopPropagation(); var it=RS.items.filter(function(x){ return x.kind==='pending' && x.ref===c.dataset.rsconfirm; })[0]; if(it) openConfirm(confirmFromRs(it)); return; }
    var b=e.target.closest('button[data-rsact]');
    if(b){ e.stopPropagation(); var s=b.dataset.rsact;
      if(!confirm(s==='completed'?'이용 완료로 처리할까요? 처리 후 고객이 예약번호로 후기를 쓸 수 있습니다.':'이 예약을 취소할까요? 달력의 마감 표시도 풀립니다.')) return;
      A('/bookings/'+b.dataset.code,{method:'PATCH', body:{status:s}}).then(function(){ M.toast('변경했습니다.'); loadResv(); }).catch(function(x){ if(!guard(x)) M.toast(x.message); }); return; }
  });

  /* =================== 예약 확정 창 (예약 문의 → 예약 확정 한 번에) =================== */
  var CF={ ref:null, force:false };
  function inqHours(d){
    var sh=d.start_h, eh=d.end_h; if(sh==null && SLOT_H[d.slot]){ sh=SLOT_H[d.slot][0]; eh=SLOT_H[d.slot][1]; }
    if(sh==null && d.t_start && d.t_end){ var a=parseInt(d.t_start,10), b=parseInt(d.t_end,10); if(!isNaN(a)&&!isNaN(b)){ if(a<5) a+=24; if(b<=a) b+=24; sh=a; eh=b; } }
    return [sh==null?null:+sh, eh==null?null:+eh];
  }
  function confirmFromInquiry(){
    var it=cur.item, d=it.data||{}, h=inqHours(d), lastQ=(cur.quotes||[])[0];
    return { ref:it.ref, name:d.name||it.name, phone:d.phone||it.phone, date:d.date||it.event_date||'', start_h:h[0], end_h:h[1], headcount:d.headcount||it.headcount||'', amount:currentAmount(it,lastQ)==null?'':currentAmount(it,lastQ), channel:d.channel||'web', channel_note:d.channel_note||'', status:it.status, memo:[lastQ?'견적 '+lastQ.quote_no:'', d.amount_note||''].filter(Boolean).join(' · ') };
  }
  function confirmFromRs(it){
    var h=inqHours(it);
    return { ref:it.ref, name:it.name, phone:it.phone, date:it.date, start_h:h[0], end_h:h[1], headcount:it.headcount||'', amount:it.amount!=null?it.amount:'', channel:it.channel||'web', channel_note:it.channel_note||'', status:it.status, memo:'' };
  }
  function cfHint(){
    var h=$('#cf-amount-hint'), date=$('#cf-date').value, sh=$('#cf-start').value, eh=$('#cf-end').value; h.innerHTML='';
    $$('#cf-pkgs [data-cfpkg]').forEach(function(b){ var p=E&&E.findPkg(b.dataset.cfpkg); b.classList.toggle('on', !!p && !!sh && +sh===p.start && +eh===p.end); });
    if(!E||!date||!sh||!eh) return;
    var q=E.quote({ date:date, start:+sh, end:+eh, people:Math.max(1,parseInt($('#cf-people').value,10)||D.people.base) }); if(!q) return;
    h.innerHTML='요금표 기준 '+esc(won(q.total))+(q.peak?' (성수기)':'')+' · 옵션·할인 제외 <button type="button" class="linkish" id="cf-use-calc">넣기</button>';
    $('#cf-use-calc').addEventListener('click', function(){ $('#cf-amount').value=q.total; });
  }
  function cfSameDay(date){
    var w=$('#cf-warn'), same=RS.items.filter(function(x){ return x.kind==='booking' && x.status==='confirmed' && x.date===date; }), others=RS.items.filter(function(x){ return x.kind==='pending' && x.date===date && x.ref!==CF.ref; });
    var sv=$('#cf-start').value, ev=$('#cf-end').value, s=sv===''?null:+sv, e=ev===''?null:+ev;
    var clash=same.filter(function(b){ return s==null||e==null||b.start_h==null||b.end_h==null||(s<b.end_h&&b.start_h<e); });
    var msg=[];
    if(clash.length) msg.push('<b>이용 시간이 겹칠 수 있는 확정 예약이 있습니다.</b> '+clash.map(function(b){ return esc(b.name)+' '+esc(resvTime(b)); }).join(', ')+' — 시간을 확인해 주세요.');
    else if(same.length) msg.push('같은 날 다른 시간대 확정 예약 '+same.length+'건: '+same.map(function(b){ return esc(b.name)+' '+esc(resvTime(b)); }).join(', ')+' — 시간이 겹치지 않아 함께 받을 수 있습니다.');
    var me=RS.items.filter(function(x){ return x.kind==='pending' && x.ref===CF.ref; })[0];
    if(me && me.date===date && me._wait>1){ var ahead=RS.items.filter(function(x){ return x.kind==='pending' && x.date===date && x._wait<me._wait; }).sort(function(a,b){ return a._wait-b._wait; }); msg.push('이 문의는 <b>대기 '+me._wait+'번</b>입니다. 앞 순번: '+ahead.map(function(x){ return esc(x.name||'')+'('+x._wait+'번)'; }).join(', ')); }
    if(others.length) msg.push('같은 날 다른 예약 대기 '+others.length+'명이 있습니다. 확정한 뒤 그분들께는 다른 시간이나 날짜를 안내해 주세요.');
    w.innerHTML=msg.join('<br>'); w.hidden=!msg.length; w.classList.toggle('info', !clash.length);
  }
  function openConfirm(src){
    if(!src || !src.ref) return;
    CF.ref=src.ref; CF.force=false;
    $('#cf-title').textContent='예약 확정 · '+src.ref;
    $('#cf-who').innerHTML='<b>'+esc(src.name||'(이름 없음)')+'</b><span>'+esc(src.phone||'연락처 없음')+'</span>'+chTag(src.channel, src.channel_note)+(src.status?stBadge(src.status):'');
    $('#cf-date').value=src.date||''; $('#cf-date').min='';
    if(D){ $('#cf-start').innerHTML=nwHourOpts(D.openFrom, D.openTo-1, src.start_h==null?'':src.start_h, '미정'); $('#cf-end').innerHTML=nwHourOpts(src.start_h!=null?+src.start_h+1:D.openFrom+1, D.openTo, src.end_h==null?'':src.end_h, '미정');
      $('#cf-pkgs').innerHTML=D.packages.map(function(p){ return '<button type="button" class="chip" data-cfpkg="'+p.id+'">'+esc(p.label)+' '+esc(p.time)+'</button>'; }).join(''); }
    $('#cf-people').value=src.headcount||''; $('#cf-amount').value=src.amount===''||src.amount==null?'':src.amount; $('#cf-memo').value=src.memo||''; $('#cf-block').checked=false;
    $('#cf-msg').hidden=true; $('#cf-submit').textContent='예약 확정'; $('#cf-submit').disabled=false;
    cfSameDay(src.date||''); cfHint(); openDrawer('#adm-confirm');
    setTimeout(function(){ $('#cf-date').focus(); }, 50);
  }
  $('#cf-start').addEventListener('change', function(){ var sh=this.value, eh=$('#cf-end').value; if(D) $('#cf-end').innerHTML=nwHourOpts(sh?+sh+1:D.openFrom+1, D.openTo, eh && +eh>+sh ? eh : '', '미정'); CF.force=false; $('#cf-submit').textContent='예약 확정'; cfHint(); cfSameDay($('#cf-date').value); });
  $('#cf-end').addEventListener('change', function(){ CF.force=false; $('#cf-submit').textContent='예약 확정'; cfHint(); cfSameDay($('#cf-date').value); });
  $('#cf-people').addEventListener('input', cfHint);
  $('#cf-date').addEventListener('change', function(){ CF.force=false; $('#cf-submit').textContent='예약 확정'; cfSameDay(this.value); cfHint(); });
  $('#cf-pkgs').addEventListener('click', function(e){ var b=e.target.closest('[data-cfpkg]'); if(!b||!E) return; var p=E.findPkg(b.dataset.cfpkg); $('#cf-start').value=p.start; $('#cf-end').innerHTML=nwHourOpts(p.start+1, D.openTo, p.end, '미정'); CF.force=false; $('#cf-submit').textContent='예약 확정'; cfHint(); cfSameDay($('#cf-date').value); });
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
    }).catch(function(x){
      if(guard(x)) return;
      if(x.code==='DATE_HAS_BOOKING'){ var w=$('#cf-warn'); var list=(x.detail&&x.detail.bookings)||[]; w.classList.remove('info'); w.innerHTML='<b>이용 시간이 겹치는 확정 예약이 있습니다.</b> '+list.map(function(b){ return esc(b.customer_name)+(b.start_h!=null?' '+esc(hl(b.start_h)+'–'+hl(b.end_h)):''); }).join(', ')+'<br>시간을 바꾸거나, 두 팀을 함께 받기로 했다면 <b>그래도 확정</b>을 눌러 주세요.'; w.hidden=false; CF.force=true; btn.textContent='그래도 확정'; return; }
      note(msg, x.message);
    }).finally(function(){ btn.disabled=false; });
  });

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
