/* 홈페이지 방문 통계 — 본사 관리자 화면 'KPI 지표'의 방문자 수·체류시간·자주 보는 페이지·링크 클릭 수에 쓰입니다.
   site.js 가 모든 공개 페이지에서 불러옵니다. 관리자·호스트센터 화면은 집계하지 않습니다.
   이름·연락처는 보내지 않고, 이 브라우저에 무작위 방문자 번호만 보관합니다(localStorage ms_stat).
   브라우저의 추적 거부(Global Privacy Control·Do Not Track)를 켠 방문, 관리자 화면을 연 브라우저는 보내지 않습니다. */
(function(){
  'use strict';
  var KEY='ms_stat', URL_='/api/stats', SESSION_MS=30*60*1000;
  try{
    if(!/(^|\.)megaspot\.kr$|^localhost$|^127\.0\.0\.1$/.test(location.hostname)) return;
    if(navigator.webdriver) return;
    if(navigator.globalPrivacyControl===true || navigator.doNotTrack==='1' || window.doNotTrack==='1') return;
    if(/^\/(admin|api|host\/center|host\/login)(\/|$)/.test(location.pathname)) return;
  }catch(e){ return; }

  function rid(){
    var a=new Uint8Array(10),s='';
    try{ crypto.getRandomValues(a); }catch(e){ for(var i=0;i<a.length;i++) a[i]=Math.floor(Math.random()*256); }
    for(var j=0;j<a.length;j++) s+=('0'+a[j].toString(36)).slice(-2);
    return s.slice(0,16);
  }
  function load(){ try{ var v=JSON.parse(localStorage.getItem(KEY)||'{}'); return v&&typeof v==='object'?v:{}; }catch(e){ return null; } }
  function save(v){ try{ localStorage.setItem(KEY, JSON.stringify(v)); }catch(e){} }
  function send(o){
    try{
      var body=JSON.stringify(o);
      if(navigator.sendBeacon && navigator.sendBeacon(URL_, new Blob([body],{type:'text/plain'}))) return;
      fetch(URL_,{method:'POST',body:body,keepalive:true,credentials:'same-origin',headers:{'content-type':'text/plain'}}).catch(function(){});
    }catch(e){}
  }

  var st=load(); if(!st || st.off) return;
  var pid='', shown=0, started=0, sentFor='';

  function view(){
    var t=Date.now(), first=0, fresh=0;
    // 앞 페이지를 떠날 때 보낸 머문 시간이 이동 중에 빠지는 경우가 있어, 다음 페이지에서 한 번 더 보냅니다(서버는 큰 값만 남김).
    if(st.pd && st.pd.p){ send({ t:'d', pid:st.pd.p, s:st.pd.s }); delete st.pd; }
    if(!st.v){ st.v=rid(); fresh=1; }
    if(!st.s || !st.t || t-st.t>SESSION_MS){ st.s=rid(); first=1; }
    st.t=t; save(st);
    pid=rid(); shown=0; started=document.visibilityState==='visible'?performance.now():0; sentFor='';
    var q=new URLSearchParams(location.search);
    send({ t:'v', pid:pid, vid:st.v, sid:st.s, p:location.pathname, ti:document.title, r:first?document.referrer:'', u:first?(q.get('utm_source')||''):'', n:fresh, f:first });
  }
  function seconds(){ return Math.round((shown+(started?performance.now()-started:0))/1000); }
  function leave(){
    if(!pid) return;
    if(started){ shown+=performance.now()-started; started=0; }
    var s=Math.round(shown/1000), mark=pid+':'+s; if(mark===sentFor) return; sentFor=mark;
    st.pd={ p:pid, s:s }; st.t=Date.now(); save(st);
    send({ t:'d', pid:pid, s:s });
  }
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden') leave();
    else if(!started){ started=performance.now(); st.t=Date.now(); save(st); }
  });
  window.addEventListener('pagehide',leave);
  // 뒤로 가기로 다시 보여 준 페이지(bfcache)도 한 번의 조회로 셉니다.
  window.addEventListener('pageshow',function(e){ if(e.persisted) view(); });

  var INQUIRY=/^\/(inquiry|order|planning|reservation-calendar|host\/register)(\/|$)/;
  function kindOf(a){
    var href=a.getAttribute('href')||''; if(!href || href.charAt(0)==='#' || /^javascript:/i.test(href)) return null;
    if(/^tel:/i.test(href)) return ['tel',''];
    if(/^sms:/i.test(href)) return ['sms',''];
    if(/^mailto:/i.test(href)) return ['mail',''];
    var u; try{ u=new URL(href, location.href); }catch(e){ return null; }
    if(!/^https?:$/.test(u.protocol)) return null;
    if(/(^|\.)kakao\.com$|(^|\.)kakao\.co\.kr$/.test(u.hostname)) return ['kakao',u.href];
    if(u.host!==location.host) return ['external',u.href];
    if(u.pathname===location.pathname && u.hash) return null;
    if(/\.pdf$/i.test(u.pathname)) return ['file',u.pathname];
    return [INQUIRY.test(u.pathname)?'inquiry':'internal', u.pathname];
  }
  document.addEventListener('click',function(e){
    try{
      var a=e.target && e.target.closest && e.target.closest('a[href]'); if(!a) return;
      var k=kindOf(a); if(!k) return;
      var label=(a.getAttribute('aria-label')||a.textContent||'').replace(/\s+/g,' ').trim().slice(0,40);
      send({ t:'c', p:location.pathname, k:k[0], h:k[1], l:label });
    }catch(err){}
  },true);

  view();
  window.MEGASPOT_STATS={ seconds:seconds };
})();
