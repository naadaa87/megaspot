/* 주문·결제 (페이앱) · 결제 결과 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc, P=window.MEGASPOT_PRODUCTS, E=window.MEGASPOT_PRICE;
  var won=function(n){ return Number(n||0).toLocaleString('ko-KR')+'원'; };
  var COL={wd:'월–목',fri:'금요일',sat:'토요일',sun:'일요일'};
  var PKG={day:'낮 패키지 10–17시 · 7시간',allday:'올데이 패키지 10–24시 · 14시간',allnight:'올나잇 패키지 18시–다음 날 07시 · 13시간'};
  function todayIso(){ return new Date(Date.now()+9*3600e3).toISOString().slice(0,10); }
  function phoneFmt(el){ el.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; }); }

  /* ================= 주문 ================= */
  var app=$('#od-app');
  if(app){
    var q=new URLSearchParams(location.search), prod=P.get(q.get('product')||'');
    if(!prod){ app.hidden=false; $('#od-form').innerHTML='<div class="empty"><b>상품을 찾을 수 없습니다</b><p class="small muted mt-1">이용권 목록에서 다시 골라 주세요.</p><a class="btn btn-primary btn-sm mt-2" href="/products/">이용권 보기</a></div>'; $('.order-side').hidden=true; return; }
    var isPass=prod.kind==='pass', addons=P.items.filter(function(x){ return x.kind==='addon'; });
    M.checkApi().then(function(live){
      if(!live){ $('#od-offline').hidden=false; return; }
      M.api('/pay/config').then(function(c){
        if(!c.enabled){ $('#od-offline').hidden=false; return; }
        app.hidden=false; init();
      }).catch(function(){ $('#od-offline').hidden=false; });
    });
    function init(){
      $('#od-product').innerHTML='<div class="eyebrow">'+(isPass?'공간 이용권':'옵션 상품')+'</div><div class="row between" style="align-items:flex-start;gap:12px"><div><h2 class="h-m">'+esc(prod.name)+'</h2><p class="small muted mt-1">'+esc(isPass?PKG[prod.pkg]+' · 기준 20명':prod.unit)+'</p></div><div class="prod-price small"><b>'+esc(won(prod.price))+'</b><span>부가세 포함</span></div></div><p class="small mt-2" style="color:var(--ink-2)">'+esc(prod.summary)+'</p><a class="small" href="/products/'+prod.id+'/" style="color:var(--cobalt);font-weight:700">상품 상세·환불 기준 보기 →</a>';
      if(isPass){
        $('#od-date').min=todayIso(); if(q.get('date')) $('#od-date').value=q.get('date'); if(q.get('people')) $('#od-people').value=q.get('people');
        if(q.get('ref')&&/^MS-[0-9A-Z-]{3,20}$/i.test(q.get('ref'))){ $('#od-ref').value=q.get('ref').toUpperCase(); var refNote=document.createElement('p'); refNote.className='tiny mt-1'; refNote.style.color='var(--cobalt)'; refNote.textContent='예약 신청 '+q.get('ref').toUpperCase()+' 건과 연결됩니다. 결제가 끝나면 신청 상태가 자동으로 \'예약 확정\'으로 바뀝니다.'; $('#od-ref').insertAdjacentElement('afterend', refNote); }
        $('#od-addons').innerHTML=addons.map(function(a){ return '<label class="chk od-addon"><input type="checkbox" data-addon="'+a.opt+'"> <span><b>'+esc(a.name)+'</b> <small>'+esc(won(a.price))+' / '+esc(a.unit)+'</small></span><select class="select" data-addon-qty="'+a.opt+'" aria-label="수량">'+[1,2,3,4,5].map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }).join('')+'</select></label>'; }).join('');
        var pre=(q.get('addons')||'').split(',').filter(Boolean); if(pre.length){ pre.forEach(function(k){ var cb=$('#od-addons input[data-addon="'+k+'"]'); if(cb) cb.checked=true; }); var an=document.createElement('p'); an.className='tiny mt-1'; an.style.color='var(--cobalt)'; an.textContent='예약 신청 때 고르신 옵션을 미리 담았습니다. 수량과 필요 여부를 한 번 더 확인해 주세요.'; $('#od-addons').insertAdjacentElement('afterend', an); }
      } else {
        $('#od-pass').hidden=true; $('#od-addon-only').hidden=false;
        $('#od-qty').innerHTML=[1,2,3,4,5,6,7,8,9,10].map(function(n){ return '<option value="'+n+'">'+n+' ('+esc(won(prod.price*n))+')</option>'; }).join('');
      }
      phoneFmt($('#od-phone'));
      var all=$('#od-all'), boxes=$$('.agree-box input[type=checkbox]:not(#od-all)');
      all.addEventListener('change', function(){ boxes.forEach(function(b){ b.checked=all.checked; b.classList.remove('invalid'); }); });
      boxes.forEach(function(b){ b.addEventListener('change', function(){ all.checked=boxes.every(function(x){ return x.checked; }); }); });
      if(M.account){ M.account.me().then(function(m){ if(!m) return; if(!$('#od-name').value) $('#od-name').value=m.name; if(!$('#od-phone').value) $('#od-phone').value=m.phone; if(!$('#od-email').value) $('#od-email').value=m.email; var ml=$('#od-member'); ml.className='member-line on'; ml.innerHTML='<span><b>'+esc(m.name)+'</b>님, 회원 정보로 채웠습니다. 결제한 주문은 마이페이지에서도 볼 수 있습니다.</span>'; ml.hidden=false; }); }
      $('#od-form').addEventListener('input', function(){ $('#od-error').dataset.sticky=''; calc(); }); $('#od-form').addEventListener('change', function(){ $('#od-error').dataset.sticky=''; calc(); }); calc();
      $('#od-pay').addEventListener('click', pay);
    }
    function state(){
      var s={ product_id:prod.id, buyer:{ name:$('#od-name').value.trim(), phone:$('#od-phone').value.trim(), email:$('#od-email').value.trim() }, memo:$('#od-memo').value.trim(), inquiry_ref:$('#od-ref').value.trim().toUpperCase(),
        agree_terms:$('[name=agree_terms]').checked, agree_privacy:$('[name=agree_privacy]').checked, agree_refund:$('[name=agree_refund]').checked };
      if(isPass){ s.date=$('#od-date').value; s.people=parseInt($('#od-people').value,10)||20; s.addons={}; $$('[data-addon]').forEach(function(cb){ if(cb.checked) s.addons[cb.dataset.addon]=parseInt($('[data-addon-qty="'+cb.dataset.addon+'"]').value,10)||1; }); }
      else { s.qty=parseInt($('#od-qty').value,10)||1; s.date=$('#od-date2').value; }
      return s;
    }
    function calc(){
      var s=state(), lines=[], warn='';
      if(isPass){
        lines.push({label:prod.name, desc:PKG[prod.pkg]+' · 기준 20명', amount:prod.price});
        var extra=Math.max(0, Math.min(200, s.people)-20); if(extra) lines.push({label:'인원 추가', desc:extra+'명 × 10,000원', amount:extra*10000});
        addons.forEach(function(a){ var n=s.addons[a.opt]; if(n) lines.push({label:a.name, desc:a.unit+' × '+n, amount:a.price*n}); });
        var hint=$('#od-date-hint'); hint.textContent=''; hint.className='hint';
        if(s.date && E){ var di=E.dayInfo(s.date); if(di){ var g=P.dayGroups[prod.group]; var ok=g.cols.indexOf(di.col)>=0;
          hint.innerHTML=esc(E.kdateY(s.date))+(di.holiday?' · '+esc(di.holiday):'')+' → <b>'+esc(COL[di.col])+'</b> 요금 적용'+(ok?' · 이 이용권으로 결제할 수 있습니다':'');
          if(di.peak){ ok=false; hint.className='hint err-text'; hint.innerHTML=esc(E.kdateY(s.date))+' → <b>성수기 요금</b>('+esc(di.peak.label)+' 기준'+(di.peak.people>P.people.base?' · 기준 '+di.peak.people+'명 포함':'')+')'; warn='이 날짜는 성수기 요금이 적용되어 이용권 금액과 다릅니다. <a href="/inquiry/?date='+s.date+'&pkg='+esc(prod.pkg)+'&people='+s.people+'" style="text-decoration:underline;font-weight:700">예약 신청 · 금액 확인에서 그날 금액 보기 →</a> 신청하시면 결제 방법을 안내해 드립니다.'; }
          else if(!ok){ var alt=P.items.filter(function(x){ return x.kind==='pass'&&x.pkg===prod.pkg&&P.dayGroups[x.group].cols.indexOf(di.col)>=0; })[0]; hint.className='hint err-text'; warn='이 날짜는 '+COL[di.col]+' 요금이 적용되어 <b>'+esc(prod.name)+'</b>으로는 결제할 수 없습니다.'+(alt?' <a href="/order/?product='+alt.id+'&date='+s.date+'&people='+s.people+'" style="text-decoration:underline;font-weight:700">'+esc(alt.name)+'('+esc(won(alt.price))+')으로 바꾸기</a>':''); }
        } }
      } else lines.push({label:prod.name, desc:prod.unit+' × '+s.qty, amount:prod.price*s.qty});
      var total=lines.reduce(function(a,l){ return a+l.amount; },0);
      $('#od-lines').innerHTML='<tbody>'+lines.map(function(l){ return '<tr><td>'+esc(l.label)+'<small>'+esc(l.desc)+'</small></td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('')+'</tbody><tfoot><tr class="sum"><td>합계 <small>부가세 포함</small></td><td>'+esc(won(total))+'</td></tr></tfoot>';
      var er=$('#od-error'); if(warn){ er.innerHTML=warn; er.hidden=false; } else if(er.dataset.sticky!=='1'){ er.hidden=true; }
      $('#od-pay').disabled=!!warn;
    }
    function pay(){
      var f=$('#od-form'), er=$('#od-error'); er.dataset.sticky=''; er.hidden=true;
      if(!M.validate(f)){ er.textContent='필수 항목과 동의 여부를 확인해 주세요.'; er.hidden=false; er.dataset.sticky='1'; return; }
      var s=state(); if(isPass && !s.date){ er.textContent='이용일을 선택해 주세요.'; er.hidden=false; return; }
      var btn=$('#od-pay'); btn.disabled=true; btn.textContent='결제창을 여는 중…';
      M.api('/pay/prepare',{method:'POST', body:s}).then(function(r){
        var target=new URL(r.payurl);
        if(target.protocol!=='https:' || !/(^|\.)payapp\.kr$/.test(target.hostname)) throw new Error('결제창 주소를 확인하지 못했습니다.');
        location.assign(target.href);
      }).catch(function(x){ er.innerHTML=esc(x.message||'결제를 시작하지 못했습니다.')+(x.code==='DATE_TAKEN'?' <a href="/inquiry/" style="text-decoration:underline">예약 신청으로 문의하기</a>':''); er.hidden=false; er.dataset.sticky='1'; btn.disabled=false; btn.innerHTML='결제하기 <span class="arrow">→</span>'; });
    }

  }

  /* ================= 결제 결과 ================= */
  var oc=$('#oc-app');
  if(oc){
    var oid=new URLSearchParams(location.search).get('oid')||'', failed=new URLSearchParams(location.search).get('fail')==='1';
    if(!oid){ $('#oc-missing').hidden=false; $('#oc-title').textContent='주문 정보가 없습니다'; return; }
    var pollCount=0;
    function loadResult(){ return M.api('/pay/orders/'+encodeURIComponent(oid)).then(function(r){
      var o=r.order; oc.hidden=false;
      var rows=(o.lines||[]).map(function(l){ return '<tr><td>'+esc(l.label)+'<small>'+esc(l.desc||'')+'</small></td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('');
      var pm={'PayApp:1':'신용·체크카드','PayApp:2':'휴대폰','PayApp:4':'대면결제','PayApp:6':'계좌이체','PayApp:7':'가상계좌','PayApp:15':'카카오페이','PayApp:16':'네이버페이','PayApp:21':'스마일페이','PayApp:23':'애플페이','PayApp:24':'내통장결제','PayApp:25':'토스페이',Card:'신용·체크카드',DirectBank:'실시간 계좌이체',VBank:'가상계좌',HPP:'휴대폰'}[o.pay_method]||o.pay_method||'';
      if(o.status==='paid'){
        $('#oc-title').textContent='결제가 완료되었습니다'; $('#oc-sub').textContent=(o.test?'테스트 결제 · ':'')+'예약번호를 꼭 보관해 주세요.';
        $('#oc-card').innerHTML='<div class="eyebrow">Confirmed</div><div class="oc-code"><small>예약번호</small><b>'+esc(o.booking_code||'—')+'</b></div>'
          +'<dl class="def mt-3"><dt>상품</dt><dd>'+esc(o.title)+'</dd>'+(o.event_date?'<dt>이용일</dt><dd>'+esc(E?E.kdateY(o.event_date):o.event_date)+(o.people?' · '+o.people+'명':'')+'</dd>':'')+'<dt>예약자</dt><dd>'+esc(o.buyer_name)+' · '+esc(o.buyer_phone)+(o.buyer_email?' · '+esc(o.buyer_email):'')+'</dd><dt>결제</dt><dd>'+esc(pm)+' · '+esc(won(o.price))+(o.appl_at?' · '+esc(o.appl_at):'')+'</dd><dt>주문번호</dt><dd>'+esc(o.oid)+'</dd></dl>'
          +'<table class="q-table mt-3"><tbody>'+rows+'</tbody><tfoot><tr class="sum"><td>결제 금액 <small>부가세 포함</small></td><td>'+esc(won(o.price))+'</td></tr></tfoot></table>'
          +(o.test?'<div class="notice mt-3"><div><b>테스트 결제</b>로 처리된 주문입니다. 실제 승인·출금은 되지 않았습니다.</div></div>':'')
          +(o.refunded_amount?'<p class="notice mt-3">부분 환불 '+esc(won(o.refunded_amount))+' · 남은 결제 금액 '+esc(won(o.price-o.refunded_amount))+'</p>':'')
          +'<div class="row mt-3" style="gap:8px"><button class="btn btn-light btn-sm" type="button" onclick="window.print()">이 화면 인쇄·저장</button><a class="btn btn-light btn-sm" href="/products/">다른 상품 보기</a></div>';
      } else {
        $('#oc-title').textContent=failed||o.status==='failed'?'결제가 완료되지 않았습니다':(o.status==='refunded'?'환불된 주문입니다':(o.status==='cancelled'?'취소된 주문입니다':'결제가 진행 중입니다'));
        $('#oc-sub').textContent=o.status==='created'?'결제 결과를 확인하고 있습니다. 결제를 마쳤다면 다시 결제하지 말고 잠시 기다려 주세요.':(o.status==='pending'?'가상계좌 입금 대기 중입니다. 입금 확인 후 예약이 확정됩니다.':'');
        var retry=o.status==='failed';
        $('#oc-card').innerHTML='<div class="eyebrow">'+esc(o.status==='failed'?'Not completed':o.status)+'</div><dl class="def mt-2"><dt>상품</dt><dd>'+esc(o.title)+'</dd>'+(o.event_date?'<dt>이용일</dt><dd>'+esc(E?E.kdateY(o.event_date):o.event_date)+'</dd>':'')+'<dt>금액</dt><dd>'+esc(won(o.price))+'</dd><dt>주문번호</dt><dd>'+esc(o.oid)+'</dd>'+(o.result_msg&&o.status==='failed'?'<dt>사유</dt><dd>'+esc(o.result_msg)+'</dd>':'')+'</dl>'
          +'<p class="small muted mt-2">결제를 마쳤는데 진행 중으로 표시되면 결과를 확인하고 있는 중입니다. 다시 결제하지 마시고 잠시 기다려 주세요. 카카오톡으로 주문번호와 함께 알려 주시면 바로 확인해 드립니다.</p>'
          +'<div class="row mt-3" style="gap:8px">'+(retry?'<a class="btn btn-primary btn-sm" href="/order/?product='+esc(o.product_id)+(o.event_date?'&date='+esc(o.event_date):'')+(o.people?'&people='+o.people:'')+'">다시 결제하기</a>':'')+'<a class="btn btn-kakao btn-sm" href="https://pf.kakao.com/_LnxbmX/chat" target="_blank" rel="noopener" data-kakao>카카오톡 문의</a></div>';
      }
      if(o.status==='created' && pollCount++<20) setTimeout(loadResult,1500);
    }).catch(function(){ $('#oc-missing').hidden=false; $('#oc-title').textContent='주문 정보를 찾을 수 없습니다'; }); }
    loadResult();
  }
})();
