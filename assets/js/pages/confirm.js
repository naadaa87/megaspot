/* 고객용 예약확정서 (/confirm/) — 링크(?c=예약번호&k=토큰) 또는 예약번호 + 휴대폰 뒷 4자리로 열고, PDF·이미지로 저장하거나 공유합니다 */
(function(){
  var M = window.MEGASPOT, X = window.MEGASPOT_CONFIRM; if (!M || !X) return;
  var $ = function(s){ return document.querySelector(s); };
  var form = $('#cfd-find'), view = $('#cfd-view'), errBox = $('#cfd-err'), canvas = $('#cfd-canvas'), cur = null, link = '';
  function fail(msg){cur=null; errBox.textContent = msg; errBox.hidden = false; form.hidden = false; view.hidden = true; }
  function show(doc, k){
    cur = doc; link = location.origin + '/confirm/?c=' + encodeURIComponent(doc.code) + '&k=' + encodeURIComponent(k || '');
    try { if (k) history.replaceState(null, '', '/confirm/?c=' + encodeURIComponent(doc.code) + '&k=' + encodeURIComponent(k)); } catch (e) {}
    $('#cfd-title').textContent = (doc.doc_type==='cancellation'?'취소·환불 정산서 · ':'예약번호 ') + doc.code;
    $('#cfd-sub').textContent = ' · ' + X.dateText(doc.date) + ' · ' + X.timeText(doc);
    form.hidden = true; errBox.hidden = true; view.hidden = false;
    var esc = M.esc, rows = [['예약자', doc.customer], ['공간', (doc.space && doc.space.name) || '메가스팟 건대'], ['이용일', X.dateText(doc.date)], ['이용 시간', X.timeText(doc) + (doc.time_note ? ' · ' + doc.time_note : '')], ['인원', doc.headcount ? doc.headcount + '명' : ''], ['행사', doc.event]];
    if (doc.doc_type!=='cancellation'&&doc.show_amount && doc.amount != null) rows.push(['확정 금액', doc.amount.toLocaleString('ko-KR') + '원' + (doc.amount_note ? ' (' + doc.amount_note + ')' : '') + ' · ' + (X.PAY[doc.pay_status] || '')]);
    rows=rows.concat(X.settlementRows(doc),X.receptionRows(doc),window.MEGASPOT_FOOD_SERVICES.documentRows(doc));
    $('#cfd-info').innerHTML = rows.filter(function(r){ return r[1]; }).map(function(r){ return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
    var ready=X.render(doc, canvas).then(function(){ canvas.setAttribute('aria-label', '메가스팟 예약확정서 — 예약번호 ' + doc.code + ', ' + X.dateText(doc.date) + ' ' + X.timeText(doc)); });
    document.title = (doc.doc_type==='cancellation'?'취소·환불 정산서 ':'예약확정서 ') + doc.code + ' · 메가스팟';return ready;
  }
  function load(p){
    return p.then(function(r){ return show(r.doc, r.k); }).catch(function(e){
      if (e.code === 'NO_API') return fail('지금은 확정서를 불러올 수 없습니다. 잠시 후 다시 시도하거나 카카오톡으로 문의해 주세요.');
      fail(e.message || '확정서를 찾지 못했습니다.');
    });
  }
  var q = new URLSearchParams(location.search), c = q.get('c'), k = q.get('k');
  if (c) $('#cfd-code').value = c;
  if (c && k) { form.hidden = true; load(M.api('/confirm?c=' + encodeURIComponent(c) + '&k=' + encodeURIComponent(k))); }
  $('#cfd-last4').addEventListener('input', function(){ this.value = this.value.replace(/\D/g, '').slice(0, 4); });
  form.addEventListener('submit', function(e){
    e.preventDefault(); errBox.hidden = true;
    var code = $('#cfd-code').value.trim().toUpperCase(), last4 = $('#cfd-last4').value.trim();
    if (!code || !/^\d{4}$/.test(last4)) return fail('예약번호와 휴대폰 뒷 4자리를 확인해 주세요.');
    var b = $('#cfd-submit'); b.disabled = true;
    load(M.api('/confirm', { method: 'POST', body: { booking_code: code, phone_last4: last4 } })).then(function(){ b.disabled = false; });
  });
  $('#cfd-again').addEventListener('click', function(){ view.hidden = true; form.hidden = false; $('#cfd-last4').value = ''; try { history.replaceState(null, '', '/confirm/'); } catch (e) {} $('#cfd-code').focus(); });
  function refresh(){
    if(!cur)return Promise.reject(new Error('확정서를 다시 조회해 주세요.'));
    var code=cur.code,k=new URL(link).searchParams.get('k');
    return M.api('/confirm?c='+encodeURIComponent(code)+'&k='+encodeURIComponent(k||'')).then(function(r){
      if(!cur||cur.code!==code||view.hidden)throw new Error('다른 예약을 조회 중입니다. 현재 확정서를 확인해 주세요.');
      return show(r.doc,r.k);
    }).catch(function(e){fail(e.message||'최신 확정서를 확인하지 못했습니다. 다시 조회해 주세요.');throw e;});
  }
  view.addEventListener('click', function(e){
    var b = e.target.closest('[data-cfd]'); if (!b || !cur) return;
    var a = b.dataset.cfd; b.disabled = true;
    var job = refresh().then(function(){return a === 'pdf' ? X.pdfBlob(canvas, (cur.doc_type==='cancellation'?'메가스팟 취소·환불 정산서 ':'메가스팟 예약확정서 ') + cur.code).then(function(bl){ X.download(bl, X.fileName(cur, 'pdf')); M.toast('PDF를 저장했습니다.'); })
      : a === 'png' ? X.pngBlob(canvas).then(function(bl){ X.download(bl, X.fileName(cur, 'png')); M.toast('이미지를 저장했습니다.'); })
      : X.share(canvas, cur, link).then(function(res){
          if (res === 'shared' || res === 'shared-link') return;
          if (res === 'cancel') return;
          return (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function(){ M.toast('확정서 주소를 복사했습니다. 카카오톡이나 메일에 붙여 넣어 보내 주세요.'); }, function(){ window.prompt('아래 주소를 복사해 주세요.', link); });
        });});
    job.catch(function(err){ M.toast(err.message || '처리하지 못했습니다.'); }).then(function(){ b.disabled = false; });
  });
})();
