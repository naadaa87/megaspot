/* 메가스팟 플랫폼 공용 화면 도구 — 입점 안내·신청·호스트센터·공간 검색/상세/예약 조회·문서·행사 맡기기에서 함께 씁니다.
   기준값은 assets/js/data/platform.js (window.MEGASPOT_PLATFORM). */
(function(){
  'use strict';
  var M=window.MEGASPOT, P=window.MEGASPOT_PLATFORM; if(!M||!P) return;
  var esc=M.esc;
  function map(pairs){ var o={}; pairs.forEach(function(p){ o[p[0]]=p[1]; }); return o; }
  var TYPE={}; P.typeGroups.forEach(function(g){ g.types.forEach(function(t){ TYPE[t[0]]=t[1]; }); });
  var REG=map(P.regions), FAC=map(P.facilities), PUR=map(P.purposes), MODE=map(P.priceModes), PAY=map(P.payMethods), ADD={}, PLAN={};
  P.addons.forEach(function(a){ ADD[a.id]=a; }); P.plans.forEach(function(p){ PLAN[p.id]=p; });

  function won(n){ return (n==null||n==='')?'':Number(n).toLocaleString('ko-KR')+'원'; }
  // 150000 → 15만 원, 1250000 → 125만 원, 3300 → 3,300원
  function man(n){ n=Number(n||0); if(n>=10000 && n%1000===0){ var m=n/10000; return (m%1===0?m.toLocaleString('ko-KR'):m.toFixed(1))+'만 원'; } return won(n); }
  function tierOf(cap, area){ cap=+cap||0; area=+area||0; for(var i=0;i<P.tiers.length;i++){ var t=P.tiers[i]; if(cap>=t.people||area>=t.pyeong) return t.id; } return ''; }
  function tierLabel(id){ for(var i=0;i<P.tiers.length;i++) if(P.tiers[i].id===id) return P.tiers[i].label; return ''; }
  function tierBadge(id){ return id?'<span class="pf-tier t-'+esc(id)+'">'+esc(id==='mega'?'초대형':'대형')+'</span>':''; }
  function st(status, label){ return '<span class="pf-st '+esc(status)+'">'+esc(label||status)+'</span>'; }
  function today(){ return M.fmtDate(new Date()); }
  function kdate(iso){ if(!iso) return ''; var y=String(iso).slice(0,4), t=M.fmtKDate(String(iso).slice(0,10)); return y===String(new Date().getFullYear())?t:y+'년 '+t; }
  function ddays(iso){ if(!iso) return null; return Math.round((Date.parse(iso+'T00:00:00')-Date.parse(today()+'T00:00:00'))/864e5); }
  function timeRange(a,b){ return a&&b?a+'~'+b:(a||''); }
  function qs(){ return new URLSearchParams(location.search); }
  function priceLine(c){   // 목록·카드에 쓰는 한 줄 요금
    if(!c.price_from) return '견적 문의';
    var lead=c.price_basis==='hourly'?'시간당 ':c.price_basis==='daily'?'하루 ':c.price_basis==='package'?'패키지 ':'';
    return lead+man(c.price_from)+'부터'+(c.vat==='excluded'?' (부가세 별도)':'');
  }
  // 검색 결과 카드 (직영 공간 카드와 같은 모양)
  function venueCard(c){
    var types=(c.type_labels||[]).slice(0,3).map(function(t){ return '<span class="tag">'+esc(t)+'</span>'; }).join('');
    return '<a class="space-card vn-card" href="/spaces/view/?id='+encodeURIComponent(c.id)+'" data-venue="'+esc(c.id)+'">'
      +'<div class="ph">'+(c.cover?'<img src="'+esc(c.cover)+'" alt="'+esc(c.name)+' 대표 사진" loading="lazy">':'<div class="vn-noimg">사진 준비 중</div>')+'<span class="badge badge-host">입점 호스트</span></div>'
      +'<div class="bd"><div class="row between"><h3>'+esc(c.name)+'</h3>'+tierBadge(c.tier)+'</div>'
      +'<div class="loc">'+esc(c.address&&c.address.indexOf(c.region_label)===0?c.address:[c.region_label, c.address].filter(Boolean).join(' · '))+(c.station?' · '+esc(c.station):'')+'</div>'
      +(c.summary?'<p class="mt-1 small muted">'+esc(c.summary)+'</p>':'')
      +'<div class="specs">'+(c.area?'<span><b>'+esc(c.area)+'</b>평</span>':'')+(c.capacity?'<span>최대 <b>'+esc(c.capacity)+'</b>명</span>':'')+'<span class="price">'+esc(priceLine(c))+'</span></div>'
      +(c.busy?'<p class="small mt-1" style="color:var(--warn);font-weight:700">고른 날짜에 확정된 예약이 있습니다 · 시간대를 확인해 주세요</p>':'')
      +'<div class="tags mt-2">'+types+'</div>'
      +'<div class="foot"><span class="muted">결제 수수료 없이 호스트와 직접 예약</span><span style="font-weight:700;color:var(--cobalt)">자세히 보기 →</span></div></div></a>';
  }
  // 메가스팟 회원으로 로그인해 있으면 연결된 호스트 계정으로 전환합니다.
  //  → 'ok' 전환됨 · 'not_host' 회원이지만 아직 호스트 등록 전 · 'login' 회원 로그인 필요
  var switching=null;
  function hostSwitch(){
    if(!switching) switching=M.api('/hosts/switch', { method:'POST', body:{} }).then(function(){ return 'ok'; }).catch(function(e){
      return e && e.code==='NOT_HOST'?'not_host':e && e.code==='BLOCKED'?'blocked':'login'; }).then(function(r){ switching=null; return r; });
    return switching;
  }
  function hostGate(r){   // 전환 결과에 따라 갈 곳
    if(r==='not_host') location.href='/host/register/';
    else if(r==='login') location.href='/host/login/?next='+encodeURIComponent(location.pathname+location.search+location.hash);
  }
  // 호스트 API — 호스트 로그인이 풀렸으면 회원 계정으로 다시 전환해 보고, 안 되면 로그인·등록 화면으로 보냅니다
  function hostApi(path, opts){
    return M.api('/hosts'+path, opts||{}).catch(function(e){
      if(!(e && e.code==='HOST_LOGIN') || /\/host\/(login|register)\//.test(location.pathname)) throw e;
      return hostSwitch().then(function(r){ if(r==='ok') return M.api('/hosts'+path, opts||{}); hostGate(r); throw e; });
    });
  }
  function hostIn(){ return /(?:^|;\s*)ms_host_in=1/.test(document.cookie); }
  // 사진을 브라우저에서 줄입니다 (긴 변 max px, JPEG). 서버는 600KB 이하만 받습니다.
  function shrink(file, max, quality){
    return new Promise(function(resolve, reject){
      if(!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('JPG·PNG·WebP 사진만 올릴 수 있습니다.'));
      var url=URL.createObjectURL(file), img=new Image();
      img.onload=function(){
        var r=Math.min(1, max/Math.max(img.naturalWidth, img.naturalHeight)), w=Math.max(1,Math.round(img.naturalWidth*r)), h=Math.max(1,Math.round(img.naturalHeight*r));
        var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,w,h); x.drawImage(img,0,0,w,h); URL.revokeObjectURL(url);
        var q=quality||0.84, out=c.toDataURL('image/jpeg', q);
        while(out.length>780000 && q>0.5){ q-=0.08; out=c.toDataURL('image/jpeg', q); }
        if(out.length>800000) return reject(new Error('사진 용량을 줄이지 못했습니다. 다른 사진으로 시도해 주세요.'));
        resolve({ data:out, w:w, h:h });
      };
      img.onerror=function(){ URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했습니다.')); };
      img.src=url;
    });
  }
  function opts(pairs, sel, blank){ return (blank!=null?'<option value="">'+esc(blank)+'</option>':'')+pairs.map(function(p){ return '<option value="'+esc(p[0])+'"'+(String(p[0])===String(sel)?' selected':'')+'>'+esc(p[1])+'</option>'; }).join(''); }
  function checks(name, pairs, sel){ sel=sel||[]; return pairs.map(function(p){ return '<label class="chk"><input type="checkbox" name="'+esc(name)+'" value="'+esc(p[0])+'"'+(sel.indexOf(p[0])>=0?' checked':'')+'><span>'+esc(p[1])+'</span></label>'; }).join(''); }
  // 유형 고르기 (묶음별 · 최대 5가지)
  function typePicker(sel){
    sel=sel||[];
    return '<div class="ap-types" data-types>'+P.typeGroups.map(function(g){ return '<div class="grp"><b>'+esc(g.label)+'</b><div class="checks">'+checks('types', g.types, sel)+'</div></div>'; }).join('')
      +'<div class="ap-count" data-type-count></div></div>';
  }
  function bindTypes(root){
    var box=root.querySelector('[data-types]'); if(!box) return;
    function sync(){ var on=box.querySelectorAll('input:checked').length; box.querySelectorAll('input:not(:checked)').forEach(function(i){ i.disabled=on>=P.maxTypes; });
      box.querySelector('[data-type-count]').textContent=on+' / '+P.maxTypes+'가지 선택'+(on>=P.maxTypes?' · 다른 유형을 고르려면 하나를 해제하세요':''); }
    box.addEventListener('change', sync); sync();
  }
  function readTypes(root){ return Array.prototype.map.call(root.querySelectorAll('[data-types] input:checked'), function(i){ return i.value; }); }
  function refundText(r){ r=r||{}; if(r.preset==='custom') return r.text||''; var p=P.refundPresets.filter(function(x){ return x[0]===(r.preset||'standard'); })[0]; return (p?p[1].replace(/^[^(]*\(|\)$/g,''):'')+(r.text?'\n'+r.text:''); }
  function download(name, text, type){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:type||'text/plain;charset=utf-8'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function csv(name, rows){ download(name, '﻿'+rows.map(function(r){ return r.map(function(x){ x=String(x==null?'':x); return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x; }).join(','); }).join('\r\n'), 'text/csv;charset=utf-8'); }

  window.MSP={ P:P, TYPE:TYPE, REG:REG, FAC:FAC, PUR:PUR, MODE:MODE, PAY:PAY, ADD:ADD, PLAN:PLAN, won:won, man:man, tierOf:tierOf, tierLabel:tierLabel, tierBadge:tierBadge, st:st, today:today, kdate:kdate, ddays:ddays, timeRange:timeRange, qs:qs,
    priceLine:priceLine, venueCard:venueCard, hostApi:hostApi, hostSwitch:hostSwitch, hostGate:hostGate, hostIn:hostIn, shrink:shrink, opts:opts, checks:checks, typePicker:typePicker, bindTypes:bindTypes, readTypes:readTypes, refundText:refundText, download:download, csv:csv };
})();
