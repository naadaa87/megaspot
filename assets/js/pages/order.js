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
    var isPass=prod.kind==='pass', isVerification=prod.kind==='verification', addons=P.items.filter(function(x){ return x.kind==='addon'; }), retryOid=q.get('retry')||'';
    var waitState='idle',waitKey='',waitAt=0,waitSeq=0,waitTimer,waitInfo=null,checkoutWarn='',payBusy=false;
    M.checkApi().then(function(live){
      if(!live){ $('#od-offline').hidden=false; return; }
      M.api('/pay/config').then(function(c){
        if(!c.enabled){ $('#od-offline').hidden=false; return; }
        if(!retryOid){ app.hidden=false; init(); return; }
        return M.api('/pay/orders/'+encodeURIComponent(retryOid)).then(function(r){
          var s=r.order&&r.order.retry;
          var source=s&&P.get(s.product_id);
          if(!source||(s.product_id!==prod.id&&!(isPass&&source.kind==='pass'&&source.pkg===prod.pkg)))throw Error('다시 결제할 주문 구성을 불러오지 못했습니다. 주문 내역에서 다시 열어 주세요.');
          function restore(k,v){if(v!=null&&!q.has(k))q.set(k,String(v));}
          ['date','people','qty'].forEach(function(k){restore(k,s[k]);});
          var selected=s.addons||{},keys=Object.keys(selected);restore('addons',keys.join(','));
          keys.forEach(function(k){var v=selected[k];if(k==='manager'&&typeof v==='object'){restore('manager_count',v.count);restore('manager_hours',v.hours);}else if(k==='disposable'&&typeof v==='object')restore('disposable_people',v.people);else restore('qty_'+k,v);});
          q.delete('ref');app.hidden=false;init();
        });
      }).catch(function(e){ $('#od-offline').hidden=false;if(retryOid)$('#od-offline').textContent=e.message||'주문 구성을 불러오지 못했습니다. 주문 내역에서 다시 시도해 주세요.'; });
    });
    function renderProduct(){
      $('#od-product').innerHTML='<div class="eyebrow">'+(isPass?'공간 이용권':'옵션 상품')+'</div><div class="row between" style="align-items:flex-start;gap:12px"><div><h2 class="h-m">'+esc(prod.name)+'</h2><p class="small muted mt-1">'+esc(isPass?PKG[prod.pkg]+' · 기준 20명':prod.unit)+'</p></div><div class="prod-price small"><b>'+esc(won(prod.price))+'</b><span>부가세 포함</span></div></div><p class="small mt-2" style="color:var(--ink-2)">'+esc(prod.summary)+'</p><a class="small" href="/products/'+prod.id+'/" style="color:var(--cobalt);font-weight:700">상품 상세·환불 기준 보기 →</a>';
    }
    function optionRate(id){ var r=E&&E.data&&E.data().options.filter(function(x){return x.id===id;})[0]; return r?r.price:(id==='manager'?25000:5000); }
    function init(){
      renderProduct();
      if(isPass){
        $('#od-date').min=todayIso(); if(q.get('date')) $('#od-date').value=q.get('date'); if(q.get('people')) $('#od-people').value=q.get('people');
        if(q.get('ref')&&/^MS-[0-9A-Z-]{3,20}$/i.test(q.get('ref'))){ $('#od-ref').value=q.get('ref').toUpperCase(); var refNote=document.createElement('p'); refNote.className='tiny mt-1'; refNote.style.color='var(--cobalt)'; refNote.textContent='예약 신청 '+q.get('ref').toUpperCase()+' 건과 연결됩니다. 결제 완료 후 일정에 문제가 없으면 예약이 확정됩니다. 일정 확인이 필요하면 운영팀에서 안내합니다.'; $('#od-ref').insertAdjacentElement('afterend', refNote); }
        $('#od-addons').innerHTML=addons.map(function(a){
          if(a.opt==='manager') return '<div class="chk od-addon" style="flex-wrap:wrap"><label class="chk" style="flex:1;min-width:180px"><input type="checkbox" data-addon="manager"> <span><b>현장 매니저</b><small>'+esc(won(optionRate('manager')))+' / 1명 · 1시간</small></span></label><span class="od-addon-fields" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><label class="od-addon-quantity">인원 <input class="input" type="number" min="1" max="10" step="1" data-manager-count aria-label="매니저 인원" value="'+esc(q.get('manager_count')||'1')+'" style="width:70px">명</label><label class="od-addon-quantity">시간 <input class="input" type="number" min="1" max="24" step="1" data-manager-hours aria-label="매니저 시간" value="'+esc(q.get('manager_hours')||prod.hours)+'" style="width:70px">시간</label></span></div>';
          if(a.opt==='disposable') return '<div class="chk od-addon" style="flex-wrap:wrap"><label class="chk" style="flex:1;min-width:180px"><input type="checkbox" data-addon="disposable"> <span><b>1회용 세트</b><small>'+esc(won(optionRate('disposable')))+' / 1명</small></span></label><span class="od-addon-fields" style="display:flex;gap:6px;align-items:center"><label class="od-addon-quantity">인원 <input class="input" type="number" min="1" max="200" step="1" data-disposable-people aria-label="1회용 세트 인원" value="'+esc(q.get('disposable_people')||$('#od-people').value)+'" style="width:85px">명</label></span></div>';
          return '<label class="chk od-addon"><input type="checkbox" data-addon="'+a.opt+'"> <span><b>'+esc(a.name)+'</b> <small>'+esc(won(a.price))+' / '+esc(a.unit)+'</small></span><select class="select" data-addon-qty="'+a.opt+'" aria-label="'+esc(a.name)+' 수량">'+[1,2,3,4,5,6,7,8,9,10].map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }).join('')+'</select></label>';
        }).join('');
        $$('[data-addon-qty]').forEach(function(x){if(q.has('qty_'+x.dataset.addonQty))x.value=q.get('qty_'+x.dataset.addonQty);});
        var pre=(q.get('addons')||'').split(',').filter(function(k){return addons.some(function(a){return a.opt===k;});}); if(pre.length){ pre.forEach(function(k){ var cb=$('#od-addons input[data-addon="'+k+'"]'); if(cb) cb.checked=true; }); var an=document.createElement('p'); an.className='tiny mt-1'; an.style.color='var(--cobalt)'; an.textContent='예약 신청 때 고르신 옵션을 미리 담았습니다. 수량과 필요 여부를 한 번 더 확인해 주세요.'; $('#od-addons').insertAdjacentElement('afterend', an); }
      } else {
        $('#od-pass').hidden=true; $('#od-addon-only').hidden=false;
        $('#od-qty').innerHTML=[1,2,3,4,5,6,7,8,9,10].map(function(n){ return '<option value="'+n+'">'+n+' ('+esc(won(prod.price*n))+')</option>'; }).join('');
        if(q.get('qty'))$('#od-qty').value=q.get('qty');
        $('#od-date2').required=!isVerification;$('#od-date2').min=todayIso();if(q.get('date'))$('#od-date2').value=q.get('date');
        if(!isVerification){$('.page-hero .lead').textContent='옵션을 제공받을 이용일과 수량을 확인해 주세요. 옵션 구매는 새 공간 예약을 만들지 않습니다.';$('.od-summary > p').textContent='표시 금액은 부가세 포함입니다. 옵션 구매에 새 공간 보증금이 추가되지는 않으며, 기존 행사의 보증금은 예약 조건을 따릅니다.';$('.od-help p').textContent='기존 예약의 이용일을 선택하고 문의번호가 있으면 함께 적어 주세요. 현수막·X배너는 이용일 5일 전까지 결제할 수 있습니다.';}
      }
      if(retryOid){var restored=document.createElement('p');restored.className='notice mt-2';restored.textContent='이전 주문의 상품·일정·수량·옵션을 복원했습니다. 예약자 정보와 동의는 다시 확인해 주세요.';$('#od-product').appendChild(restored);}
      if(isVerification){
        $('.page-hero h1').textContent='1,000원 결제·취소 확인';
        $('.page-hero .lead').textContent='실제로 1,000원이 결제됩니다. 결제 확인 후 페이앱 판매자 관리자에서 전액 취소해 주세요. 공간 예약은 생성되지 않습니다.';
        $('#od-product').innerHTML='<div class="eyebrow">결제 확인용</div><h2 class="h-m">'+esc(prod.name)+'</h2><p class="small mt-2">'+esc(prod.summary)+'</p>';
        $('#od-addon-only').hidden=true; $('#od-ref').closest('.f').hidden=true;
        $('.od-summary > p').textContent='부가세 포함 1,000원 · 추가 금액이나 보증금이 없습니다.';
        $('[name=agree_refund]').closest('label').querySelector('span').textContent='(필수) 실제 1,000원이 결제되는 확인용 상품이며, 확인 후 페이앱 판매자 관리자에서 전액 취소하는 절차를 확인했습니다.';
        $('.od-help').innerHTML='<b>결제·취소 확인 순서</b><ol class="small mt-2"><li>본인 정보로 1,000원을 결제합니다.</li><li>페이앱 판매자 관리자 → 결제현황에서 이 주문의 1,000원 거래를 전액 취소합니다.</li><li>메가스팟 결제 결과 화면에서 “취소 반영 확인”을 누릅니다.</li></ol><a class="btn btn-light btn-sm mt-2" href="https://seller.payapp.kr/p/using_list" target="_blank" rel="noopener">페이앱 결제현황 열기</a>';
        $('#od-pay').textContent='1,000원 결제하기';
      }
      phoneFmt($('#od-phone'));
      var all=$('#od-all'), boxes=$$('.agree-box input[type=checkbox]:not(#od-all)');
      all.addEventListener('change', function(){ boxes.forEach(function(b){ b.checked=all.checked; b.classList.remove('invalid'); }); });
      boxes.forEach(function(b){ b.addEventListener('change', function(){ all.checked=boxes.every(function(x){ return x.checked; }); }); });
      if(M.account){ M.account.me().then(function(m){ if(!m) return; if(!$('#od-name').value) $('#od-name').value=m.name; if(!$('#od-phone').value) $('#od-phone').value=m.phone; if(!$('#od-email').value) $('#od-email').value=m.email; var ml=$('#od-member'); ml.className='member-line on'; ml.innerHTML='<span><b>'+esc(m.name)+'</b>님, 회원 정보로 채웠습니다. 결제한 주문은 마이페이지에서도 볼 수 있습니다.</span>'; ml.hidden=false; }); }
      $('#od-form').addEventListener('input', function(){ $('#od-error').dataset.sticky=''; calc(); }); $('#od-form').addEventListener('change', function(){ $('#od-error').dataset.sticky=''; calc(); }); calc();
      $('#od-pay').addEventListener('click', pay);
      $('#od-availability-retry').addEventListener('click',function(){requestWait(state()).catch(function(){});});
      $('#od-error').addEventListener('click', function(e){
        var link=e.target.closest('[data-swap-product]'); if(!link) return;
        var next=P.get(link.dataset.swapProduct); if(!next||next.kind!=='pass'||next.pkg!==prod.pkg) return;
        e.preventDefault(); prod=next; renderProduct(); history.replaceState(null,'',link.getAttribute('href')); calc();
        M.toast('이용권을 바꿨습니다. 문의번호·옵션과 입력한 정보는 그대로 유지됩니다.');
      });
    }
    function state(){
      var s={ product_id:prod.id, buyer:{ name:$('#od-name').value.trim(), phone:$('#od-phone').value.trim(), email:$('#od-email').value.trim() }, memo:$('#od-memo').value.trim(), inquiry_ref:$('#od-ref').value.trim().toUpperCase(),
        agree_terms:$('[name=agree_terms]').checked, agree_privacy:$('[name=agree_privacy]').checked, agree_refund:$('[name=agree_refund]').checked, retry_oid:retryOid };
      if(isVerification){ s.qty=1; s.inquiry_ref=''; }
      else if(isPass){ s.date=$('#od-date').value; s.people=Number($('#od-people').value); s.addons={}; $$('[data-addon]').forEach(function(cb){
        if(!cb.checked) return;
        if(cb.dataset.addon==='manager') s.addons.manager={count:Number($('[data-manager-count]').value),hours:Number($('[data-manager-hours]').value)};
        else if(cb.dataset.addon==='disposable') s.addons.disposable={people:Number($('[data-disposable-people]').value)};
        else s.addons[cb.dataset.addon]=Number($('[data-addon-qty="'+cb.dataset.addon+'"]').value);
      }); }
      else { s.qty=parseInt($('#od-qty').value,10)||1; s.date=$('#od-date2').value; }
      return s;
    }
    function productUrl(product, s){
      var qs=new URLSearchParams({product:product.id,date:s.date,people:String(s.people)}), keys=Object.keys(s.addons||{});
      if(s.inquiry_ref) qs.set('ref',s.inquiry_ref); if(retryOid)qs.set('retry',retryOid);if(keys.length) qs.set('addons',keys.join(','));
      if(s.addons.manager){qs.set('manager_count',s.addons.manager.count);qs.set('manager_hours',s.addons.manager.hours);}
      if(s.addons.disposable) qs.set('disposable_people',s.addons.disposable.people);
      keys.forEach(function(k){if(typeof s.addons[k]==='number')qs.set('qty_'+k,s.addons[k]);});
      return '/order/?'+qs.toString();
    }
    function optionError(s){
      if(!Number.isSafeInteger(s.people)||s.people<1||s.people>200)return '대관 인원은 1~200명 사이의 정수로 입력해 주세요.';
      var m=s.addons.manager,d=s.addons.disposable;
      if(m&&(!Number.isSafeInteger(m.count)||m.count<1||m.count>10||!Number.isSafeInteger(m.hours)||m.hours<1||m.hours>24))return '매니저는 1~10명, 1~24시간 사이의 정수로 입력해 주세요.';
      if(d&&(!Number.isSafeInteger(d.people)||d.people<1||d.people>200))return '1회용 세트는 1~200명 사이의 정수로 입력해 주세요.';
      return '';
    }
    function dateError(s){
      if(isVerification)return '';
      if(!/^\d{4}-\d{2}-\d{2}$/.test(s.date||''))return '이용일을 선택해 주세요.';
      if(s.date<todayIso())return '지난 날짜는 선택할 수 없습니다.';
      if(isPass&&Date.now()>=Date.parse(s.date+'T'+('0'+prod.start).slice(-2)+':00:00+09:00'))return '이미 시작된 이용권은 온라인으로 결제할 수 없습니다. 다른 날짜를 선택하거나 카카오톡으로 문의해 주세요.';
      var fabrication=prod.opt==='banner'||prod.opt==='xbanner'||!!(s.addons&&(s.addons.banner||s.addons.xbanner));
      if(fabrication&&Date.parse(s.date+'T00:00:00+09:00')-Date.parse(todayIso()+'T00:00:00+09:00')<5*86400000)return '현수막·X배너는 이용일 5일 전까지 결제할 수 있습니다. 더 가까운 일정은 카카오톡으로 제작 가능 여부를 문의해 주세요.';
      return '';
    }
    function refundNotice(s){
      if(isVerification)return;
      var fabrication=prod.opt==='banner'||prod.opt==='xbanner'||!!(s.addons&&(s.addons.banner||s.addons.xbanner));
      var note=$('#od-production-policy');
      if(!note){note=document.createElement('p');note.id='od-production-policy';note.className='small notice mt-2';$('[name=agree_refund]').closest('label').insertAdjacentElement('afterend',note);}
      note.hidden=!fabrication;note.textContent=P.exchange.productionNote||'결제 후 2시간 이내에는 제작 착수 여부와 관계없이 전액 환불합니다. 이후 제작에 착수한 현수막·X배너는 해당 제작 상품의 환불이 제한되며, 공간 이용료와 다른 옵션에는 일반 환불 기준이 적용됩니다.';
      $('#od-date2').min=fabrication?new Date(Date.parse(todayIso()+'T00:00:00Z')+5*86400000).toISOString().slice(0,10):todayIso();
    }
    function waitChoice(s){return s.date+'|'+s.inquiry_ref;}
    function waitUrl(s){var p=new URLSearchParams({date:s.date,space:'megaspot-gundae'});if(s.inquiry_ref)p.set('ref',s.inquiry_ref);return '/pay/availability?'+p.toString();}
    function waitInquiry(s){return '/inquiry/?'+new URLSearchParams({space:'megaspot-gundae',date:s.date,pkg:prod.pkg,people:String(s.people),wait:'1'}).toString()+'#reserve';}
    function paintWait(){
      var s=state(),box=$('#od-availability'),message=$('#od-availability-message'),link=$('#od-wait-link'),retry=$('#od-availability-retry'),btn=$('#od-pay');
      box.hidden=!isPass||waitState==='idle';box.dataset.state=waitState;retry.hidden=waitState!=='error';link.hidden=!isPass||!['blocked','error'].includes(waitState);
      link.href=s.inquiry_ref?'https://pf.kakao.com/_LnxbmX/chat':waitInquiry(s);link.textContent=s.inquiry_ref?'기존 예약 문의 이어가기 →':'예약 대기 신청 →';
      if(waitState==='loading')message.textContent='이 날짜의 예약 문의·대기 현황을 확인하고 있습니다.';
      else if(waitState==='error')message.textContent='예약 대기 현황을 확인하지 못해 결제를 잠시 제한했습니다. 다시 확인하거나 예약 문의를 남겨 주세요.';
      else if(waitState==='blocked')message.textContent=waitInfo&&waitInfo.wait?'접수하신 예약은 현재 대기 '+waitInfo.wait.no+'번입니다(총 '+waitInfo.pending_count+'건). 온라인 결제는 제한되며, 담당자가 순서대로 안내합니다.':'이 날짜에는 예약 문의 '+Number(waitInfo&&waitInfo.pending_count||0)+'건이 먼저 접수되어 온라인 결제가 제한됩니다.'+(waitInfo&&waitInfo.next_wait_no?' 새로 신청하시면 예상 대기 '+waitInfo.next_wait_no+'번입니다.':'')+' 대기는 예약 확정이 아니며, 담당자가 순서대로 안내합니다.';
      else if(waitState==='clear')message.textContent='현재 이 날짜에 예약 대기가 없습니다. 결제 직전에 다시 확인합니다.';
      btn.disabled=!!checkoutWarn||payBusy||(isPass&&waitState!=='clear');
      if(!payBusy)btn.textContent=isVerification?'1,000원 결제하기':isPass&&waitState==='loading'?'예약 문의 확인 중…':isPass&&waitState==='blocked'?'예약 문의로 결제 제한':isPass&&waitState==='error'?'예약 현황 확인 필요':'결제하기 →';
    }
    function requestWait(s){
      clearTimeout(waitTimer);var key=waitChoice(s),seq=++waitSeq;waitKey=key;waitState='loading';waitInfo=null;paintWait();
      return M.api(waitUrl(s)).then(function(j){
        if(seq!==waitSeq||key!==waitChoice(state()))return null;
        if(!Number.isSafeInteger(j.pending_count)||j.pending_count<0||!Number.isSafeInteger(j.next_wait_no)||j.next_wait_no<1||typeof j.payment_blocked!=='boolean')throw Error('예약 현황 응답을 확인하지 못했습니다.');
        waitInfo=j;waitAt=Date.now();waitState=j.payment_blocked?'blocked':'clear';paintWait();return j;
      }).catch(function(e){if(seq===waitSeq){waitState='error';waitAt=0;paintWait();}throw e;});
    }
    function scheduleWait(s){
      if(!isPass||!s.date||s.date<todayIso()){clearTimeout(waitTimer);waitSeq++;waitKey='';waitState='idle';waitInfo=null;paintWait();return;}
      var key=waitChoice(s);if(key===waitKey&&(waitState==='loading'||(waitAt&&Date.now()-waitAt<20000))){paintWait();return;}
      waitKey=key;waitSeq++;clearTimeout(waitTimer);waitInfo=null;waitState='loading';paintWait();waitTimer=setTimeout(function(){requestWait(s).catch(function(){});},180);
    }
    function calc(){
      var s=state(), lines=[], warn='';
      if(isPass){
        lines.push({label:prod.name, desc:PKG[prod.pkg]+' · 기준 20명', amount:prod.price});
        var extra=Math.max(0, Math.min(200, s.people)-20); if(extra) lines.push({label:'인원 추가', desc:extra+'명 × 10,000원', amount:extra*10000});
        addons.forEach(function(a){ var n=s.addons[a.opt]; if(!n)return;
          if(a.opt==='manager') lines.push({label:'현장 매니저',desc:n.count+'명 × '+n.hours+'시간 × '+won(optionRate('manager')),amount:optionRate('manager')*n.count*n.hours});
          else if(a.opt==='disposable') lines.push({label:'1회용 세트',desc:n.people+'명 × '+won(optionRate('disposable')),amount:optionRate('disposable')*n.people});
          else lines.push({label:a.name, desc:a.unit+' × '+n, amount:a.price*n});
        });
        var hint=$('#od-date-hint'); hint.textContent=''; hint.className='hint';
        if(s.date && E){ var di=E.dayInfo(s.date); if(di){ var g=P.dayGroups[prod.group]; var ok=g.cols.indexOf(di.col)>=0;
          hint.innerHTML=esc(E.kdateY(s.date))+(di.holiday?' · '+esc(di.holiday):'')+' → <b>'+esc(COL[di.col])+'</b> 요금 적용'+(ok?' · 이용권 요일 조건과 일치합니다':'');
          if(di.peak){ ok=false; hint.className='hint err-text'; hint.innerHTML=esc(E.kdateY(s.date))+' → <b>성수기 요금</b>('+esc(di.peak.label)+' 기준'+(di.peak.people>P.people.base?' · 기준 '+di.peak.people+'명 포함':'')+')'; warn='이 날짜는 성수기 요금이 적용되어 이용권 금액과 다릅니다. <a href="/inquiry/?date='+s.date+'&pkg='+esc(prod.pkg)+'&people='+s.people+'" style="text-decoration:underline;font-weight:700">예약 신청 · 금액 확인에서 그날 금액 보기 →</a> 신청하시면 결제 방법을 안내해 드립니다.'; }
          else if(!ok){ var alt=P.items.filter(function(x){ return x.kind==='pass'&&x.pkg===prod.pkg&&P.dayGroups[x.group].cols.indexOf(di.col)>=0; })[0]; hint.className='hint err-text'; warn='이 날짜는 '+COL[di.col]+' 요금이 적용되어 <b>'+esc(prod.name)+'</b>으로는 결제할 수 없습니다.'+(alt?' <a href="'+esc(productUrl(alt,s))+'" data-swap-product="'+esc(alt.id)+'" style="text-decoration:underline;font-weight:700">'+esc(alt.name)+'('+esc(won(alt.price))+')으로 바꾸기</a>':''); }
        } }
      } else lines.push({label:prod.name, desc:prod.unit+' × '+s.qty, amount:prod.price*s.qty});
      if(isPass) warn=optionError(s)||warn;
      warn=dateError(s)||warn;refundNotice(s);
      var total=lines.reduce(function(a,l){ return a+l.amount; },0);
      $('#od-lines').innerHTML='<tbody>'+lines.map(function(l){ return '<tr><td>'+esc(l.label)+'<small>'+esc(l.desc)+'</small></td><td>'+esc(won(l.amount))+'</td></tr>'; }).join('')+'</tbody><tfoot><tr class="sum"><td>합계 <small>부가세 포함</small></td><td>'+esc(won(total))+'</td></tr></tfoot>';
      var er=$('#od-error'); if(warn){ er.innerHTML=warn; er.hidden=false; } else if(er.dataset.sticky!=='1'){ er.hidden=true; }
      checkoutWarn=warn;scheduleWait(s);
    }
    function pay(){
      if(payBusy)return;
      if(isPass&&waitState!=='clear'){paintWait();M.toast(waitState==='blocked'?'이 날짜에 예약 문의가 있어 바로 결제할 수 없습니다. 예약 대기 안내를 확인해 주세요.':'예약 대기 현황을 확인한 뒤 결제할 수 있습니다.');return;}
      var f=$('#od-form'), er=$('#od-error'); er.dataset.sticky=''; er.hidden=true;
      if(!M.validate(f)){ er.textContent='필수 항목과 동의 여부를 확인해 주세요.'; er.hidden=false; er.dataset.sticky='1'; return; }
      var s=state(),invalid=dateError(s)||(isPass?optionError(s):'');if(invalid){er.textContent=invalid;er.hidden=false;return;}
      var btn=$('#od-pay');payBusy=true;btn.disabled=true;btn.textContent='결제 전 예약 문의 확인 중…';
      var gate=isPass?requestWait(s).then(function(j){if(!j)throw Error('선택한 일정이 바뀌었습니다. 내용을 확인하고 다시 시도해 주세요.');if(j.payment_blocked){var e=Error('먼저 접수된 예약 문의가 있어 온라인 결제가 제한됩니다. 예약 대기 안내를 확인해 주세요.');e.code='RESERVATION_PENDING';e.detail=j;throw e;}}):Promise.resolve();
      gate.then(function(){if(JSON.stringify(state())!==JSON.stringify(s))throw Error('확인 중 주문 내용이 변경되었습니다. 현재 구성과 금액을 확인하고 다시 눌러 주세요.');btn.textContent='결제창을 여는 중…';return M.api('/pay/prepare',{method:'POST', body:s});}).then(function(r){
        var target=new URL(r.payurl);
        if(target.protocol!=='https:' || !/(^|\.)payapp\.kr$/.test(target.hostname)) throw new Error('결제창 주소를 확인하지 못했습니다.');
        location.assign(target.href);
      }).catch(function(x){payBusy=false;if(x.code==='RESERVATION_PENDING'){waitInfo=x.detail||waitInfo;waitState='blocked';waitAt=Date.now();M.toast('예약 문의가 먼저 접수되어 결제를 제한했습니다. 대기 안내를 확인해 주세요.');}er.innerHTML=esc(x.message||'결제를 시작하지 못했습니다.')+(x.code==='DATE_TAKEN'?' <a href="'+esc(waitInquiry(s))+'" style="text-decoration:underline">예약 신청으로 문의하기</a>':''); er.hidden=false; er.dataset.sticky='1';calc(); });
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
      var isVerificationOrder=!!o.verification;
      var pm={'PayApp:1':'신용·체크카드','PayApp:2':'휴대폰','PayApp:4':'대면결제','PayApp:6':'계좌이체','PayApp:7':'가상계좌','PayApp:15':'카카오페이','PayApp:16':'네이버페이','PayApp:21':'스마일페이','PayApp:23':'애플페이','PayApp:24':'내통장결제','PayApp:25':'토스페이',Card:'신용·체크카드',DirectBank:'실시간 계좌이체',VBank:'가상계좌',HPP:'휴대폰'}[o.pay_method]||o.pay_method||'';
      if(o.status==='paid'&&o.booking_status==='payment_review'){
        $('#oc-title').textContent='결제 완료 · 예약 일정 확인 중';
        $('#oc-sub').textContent='결제는 완료됐지만 일정 확인이 필요해 예약 확정을 보류했습니다. 다시 결제하지 마세요. 운영팀에서 일정 조정 또는 환불을 안내해 드립니다.';
        $('#oc-card').innerHTML='<div class="eyebrow">일정 확인 필요</div><dl class="def mt-2"><dt>상품</dt><dd>'+esc(o.title)+'</dd><dt>주문번호</dt><dd>'+esc(o.oid)+'</dd><dt>결제 금액</dt><dd>'+esc(won(o.price))+'</dd></dl><p class="notice mt-3">아직 공간 이용이 확정되지 않았습니다.</p><a class="btn btn-kakao btn-sm mt-3" href="https://pf.kakao.com/_LnxbmX/chat" target="_blank" rel="noopener">운영팀에 문의하기</a>';
      } else if(o.status==='paid'){
        var hasReservation=!!o.booking_code;
        $('#oc-title').textContent=isVerificationOrder?'1,000원 결제가 완료되었습니다':'결제가 완료되었습니다'; $('#oc-sub').textContent=isVerificationOrder?'페이앱 판매자 관리자에서 이 거래를 전액 취소한 뒤 취소 반영을 확인해 주세요.':(o.test?'테스트 결제 · ':'')+(hasReservation?'예약번호를 꼭 보관해 주세요.':'옵션 구매가 완료되었습니다. 주문번호를 보관하고 기존 행사에 제공할 일정과 구성을 운영팀과 확인해 주세요. 새 공간 예약은 생성되지 않습니다.');
        $('#oc-card').innerHTML='<div class="eyebrow">'+(hasReservation?'예약 결제 완료':'주문 결제 완료')+'</div><div class="oc-code"><small>'+(!isVerificationOrder&&hasReservation?'예약번호':'주문번호')+'</small><b>'+esc(!isVerificationOrder&&hasReservation?o.booking_code:o.oid)+'</b></div>'
          +'<dl class="def mt-3"><dt>상품</dt><dd>'+esc(o.title)+'</dd>'+(o.event_date?'<dt>이용일</dt><dd>'+esc(E?E.kdateY(o.event_date):o.event_date)+(o.people?' · '+o.people+'명':'')+'</dd>':'')+'<dt>예약자</dt><dd>'+esc(o.buyer_name)+' · '+esc(o.buyer_phone)+(o.buyer_email?' · '+esc(o.buyer_email):'')+'</dd><dt>결제</dt><dd>'+esc(pm)+' · '+esc(won(o.price))+(o.appl_at?' · '+esc(o.appl_at):'')+'</dd><dt>주문번호</dt><dd>'+esc(o.oid)+'</dd></dl>'
          +'<table class="q-table mt-3"><tbody>'+rows+'</tbody><tfoot><tr class="sum"><td>결제 금액 <small>부가세 포함</small></td><td>'+esc(won(o.price))+'</td></tr></tfoot></table>'
          +(o.test?'<div class="notice mt-3"><div><b>테스트 결제</b>로 처리된 주문입니다. 실제 승인·출금은 되지 않았습니다.</div></div>':'')
          +(o.refunded_amount?'<p class="notice mt-3">부분 환불 '+esc(won(o.refunded_amount))+' · 남은 결제 금액 '+esc(won(o.price-o.refunded_amount))+'</p>':'')
          +'<div class="row mt-3" style="gap:8px"><button class="btn btn-light btn-sm" type="button" onclick="window.print()">이 화면 인쇄·저장</button><a class="btn btn-light btn-sm" href="/products/">다른 상품 보기</a></div>';
      } else {
        $('#oc-title').textContent=failed||o.status==='failed'?'결제가 완료되지 않았습니다':(o.status==='refunded'?'환불된 주문입니다':(o.status==='cancelled'?'취소된 주문입니다':'결제가 진행 중입니다'));
        $('#oc-sub').textContent=o.status==='created'?'결제 결과를 확인하고 있습니다. 결제를 마쳤다면 다시 결제하지 말고 잠시 기다려 주세요.':(o.status==='pending'?'가상계좌 입금 대기 중입니다. 입금과 일정 확인 후 예약 상태가 반영됩니다.':'');
        var retry=o.status==='failed';
        $('#oc-card').innerHTML='<div class="eyebrow">'+esc(o.status==='failed'?'Not completed':o.status)+'</div><dl class="def mt-2"><dt>상품</dt><dd>'+esc(o.title)+'</dd>'+(o.event_date?'<dt>이용일</dt><dd>'+esc(E?E.kdateY(o.event_date):o.event_date)+'</dd>':'')+'<dt>금액</dt><dd>'+esc(won(o.price))+'</dd><dt>주문번호</dt><dd>'+esc(o.oid)+'</dd>'+(o.result_msg&&o.status==='failed'?'<dt>사유</dt><dd>'+esc(o.result_msg)+'</dd>':'')+'</dl>'
          +'<p class="small muted mt-2">결제를 마쳤는데 진행 중으로 표시되면 결과를 확인하고 있는 중입니다. 다시 결제하지 마시고 잠시 기다려 주세요. 카카오톡으로 주문번호와 함께 알려 주시면 바로 확인해 드립니다.</p>'
          +'<div class="row mt-3" style="gap:8px">'+(retry?'<a class="btn btn-primary btn-sm" href="/order/?product='+esc(o.product_id)+'&retry='+encodeURIComponent(o.oid)+'">다시 결제하기</a>':'')+'<a class="btn btn-kakao btn-sm" href="https://pf.kakao.com/_LnxbmX/chat" target="_blank" rel="noopener" data-kakao>카카오톡 문의</a></div>';
      }
      if(isVerificationOrder){
        if(o.status==='paid') $('#oc-card').insertAdjacentHTML('beforeend','<div class="notice mt-3"><div>1,000원 실결제가 완료되었습니다. 페이앱에서 이 주문의 거래를 전액 취소한 뒤 아래 버튼을 눌러 주세요.</div></div><div class="row mt-3" style="gap:8px"><a class="btn btn-light btn-sm" href="https://seller.payapp.kr/p/using_list" target="_blank" rel="noopener">페이앱 결제현황</a><button class="btn btn-primary btn-sm" type="button" onclick="location.reload()">취소 반영 확인</button></div>');
        if(o.status==='refunded'){
          $('#oc-title').textContent='1,000원 결제 취소가 확인되었습니다';
          $('#oc-sub').textContent='페이앱 승인 취소 결과가 메가스팟 주문에 정상 반영되었습니다.';
          $('#oc-card').innerHTML='<div class="eyebrow">취소 확인 완료</div><dl class="def mt-2"><dt>상품</dt><dd>'+esc(o.title)+'</dd><dt>주문번호</dt><dd>'+esc(o.oid)+'</dd><dt>취소 금액</dt><dd>'+esc(won(o.refunded_amount))+'</dd></dl><p class="small mt-2">공간 예약은 생성되지 않았습니다.</p>';
        }
      }
      if(o.status==='created' && pollCount++<20) setTimeout(loadResult,1500);
    }).catch(function(){ $('#oc-missing').hidden=false; $('#oc-title').textContent='주문 정보를 찾을 수 없습니다'; }); }
    loadResult();
  }
})();
