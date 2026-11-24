/* 공간대관 계약서 — 대관자 화면 /contract/#id=&k= (2026-11-24)
   대관자 정보 확인·입력 → 동의 1번 → '확인하고 계약 완료'를 누르면 계약이 완료됩니다.
   서명 그림은 선택입니다(그리지 않으면 서명한 분 이름이 전자 서명으로 들어갑니다).
   계약서는 PDF(A4)·이미지(JPG)로 내려받거나 휴대폰 공유 창으로 보낼 수 있고, 인쇄할 수 있습니다(서명 전에는 '서명 전 문서'로 표시).
   같은 화면에서 모임 초대장을 만들거나 PDF·이미지로 내려받고 공유할 수 있습니다(예약이 확정된 경우).
   PDF·이미지는 assets/js/vendor/html2pdf.bundle.min.js 를 누를 때 불러와 만듭니다. */
(function () {
  'use strict';
  var K = window.Kit, C = window.MEGASPOT_CONTRACT, root = K && K.$('#ct-root');
  if (!root || !C) return;
  var esc = K.esc;
  var q = new URLSearchParams(location.hash.slice(1));
  if (!q.get('id')) q = new URLSearchParams(location.search);
  var id = (q.get('id') || '').toUpperCase().slice(0, 20), key = (q.get('k') || '').slice(0, 40);
  var S = null, pad = null, renter = null, shot = null;
  var HELP = 'https://pf.kakao.com/_LnxbmX/chat';

  function api(path, body) {
    var init = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    return fetch('/api/contracts/' + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) { var e = new Error(j.error || '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'); e.code = j.code; throw e; } return j; });
    }, function () { throw new Error('인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); });
  }
  function fail(msg) {
    root.innerHTML = '<div class="kit-panel" style="max-width:640px"><h2>계약서를 열 수 없습니다</h2><p class="desc" style="margin-top:6px">' + esc(msg) + '</p><a class="btn btn-primary" href="' + HELP + '" target="_blank" rel="noopener">카카오톡으로 문의하기</a></div>';
  }
  if (!id || !key) { fail('계약서 주소가 잘렸을 수 있습니다. 받은 링크 전체를 다시 열어 주세요.'); return; }

  function summary(c) {
    var d = c.data, t = c.totals || C.totals(d.fee);
    return '<div class="ct-sum"><div><span>대관 공간</span><b>' + esc(C.SPACES[d.space] || '-') + '</b></div><div><span>이용일</span><b>' + esc(C.dateText(d.date) || '-') + '</b></div>' +
      '<div><span>이용 시간</span><b>' + esc((d.start || '') + ' ~ ' + (d.end || '')) + '</b></div><div><span>대관료 합계</span><b>' + esc(C.won(t.total)) + '</b></div></div>';
  }
  function docHtml() {
    var c = S.contract, d = Object.assign({}, c.data, { renter: renter || c.data.renter });
    return C.html(d, { seal: S.seal, signature: c.signature, signed_at: c.signed && c.signed.at, signer: c.signed && c.signed.signer, hash: c.signed && c.signed.hash, draft: c.status === 'ready' });
  }
  var canFiles = function () { try { return !!(navigator.canShare && typeof File === 'function' && navigator.canShare({ files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] })); } catch (e) { return false; } };
  function tools(signed) {
    return '<div class="ct-tools" role="group" aria-label="계약서 내려받기">' +
      '<button type="button" class="btn ' + (signed ? 'btn-primary btn-lg' : 'btn-light') + '" data-x="pdf">' + (signed ? '계약서 PDF 내려받기' : 'PDF로 보기') + '</button>' +
      '<button type="button" class="btn btn-light' + (signed ? ' btn-lg' : '') + '" data-x="img">이미지 저장</button>' +
      (canFiles() ? '<button type="button" class="btn btn-light' + (signed ? ' btn-lg' : '') + '" data-x="share">이미지로 보내기</button>' : '') +
      '<button type="button" class="btn btn-light' + (signed ? ' btn-lg' : '') + '" data-x="print">인쇄</button></div>' +
      '<p class="kit-msg" data-x-msg role="status"></p>' +
      (window.KitInvitePrint && window.KitInvitePrint.inKakao() ? '<p class="hint" style="margin:0">카카오톡 안에서 여셨다면 파일 저장이 막힐 수 있습니다. <a href="kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href) + '" style="text-decoration:underline">다른 브라우저로 열기</a></p>' : '');
  }

  function render() {
    var c = S.contract; shot = null;
    document.title = '공간대관 계약서 ' + c.id + ' · 메가스팟';
    var head = '<div class="ct-top"><div><div class="eyebrow">Rental Contract</div><h1>공간대관 계약서</h1><p class="muted">계약 번호 ' + esc(c.id) + '</p></div>' +
      '<span class="ct-badge st-' + esc(c.status) + '">' + esc(c.status_label) + '</span></div>';
    if (c.status === 'void') {
      root.innerHTML = head + '<div class="kit-panel" style="max-width:720px"><h2>취소된 계약서입니다</h2><p class="desc" style="margin-top:6px">이 계약서는 더 이상 쓰지 않습니다. 새 계약서를 받으셨다면 그 링크로 열어 주세요.</p><a class="btn btn-primary" href="' + HELP + '" target="_blank" rel="noopener">카카오톡으로 문의하기</a></div>';
      return;
    }
    if (c.status === 'signed') {
      root.innerHTML = head + '<div class="ct-done kit-panel"><div><span class="kit-tag">계약 완료</span><h2>계약을 마쳤습니다</h2><p class="desc">' + esc(c.signed.at) + ' · ' + esc(c.signed.signer) + ' 님이 확인했습니다. 계약서를 PDF나 이미지로 내려받아 보관해 주세요.</p></div>' + tools(true) + '</div>' +
        '<div class="ct-paper" data-doc>' + docHtml() + '</div><div data-invite></div>';
      drawInvite();
      return;
    }
    renter = renter || Object.assign({}, c.data.renter);
    var r = renter;
    var field = function (k, label, attrs, hint) { return '<div class="f"><label for="ct-' + k + '">' + label + '</label><input class="input" id="ct-' + k + '" data-r="' + k + '" value="' + esc(r[k] || '') + '" ' + (attrs || '') + '>' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>'; };
    root.innerHTML = head + summary(c) +
      '<ol class="ct-steps"><li class="on"><b>1</b>계약 내용 확인</li><li><b>2</b>대관자 정보</li><li><b>3</b>확인하고 계약 완료</li></ol>' +
      '<div class="ct-split"><div><div class="ct-doc-tools">' + tools(false) + '</div><div class="ct-paper" data-doc>' + docHtml() + '</div></div>' +
      '<form class="kit-panel ct-form" data-form novalidate><div class="form">' +
      '<div><h2>대관자 정보</h2><p class="desc" style="margin:2px 0 0">메가스팟에서 받은 예약 정보로 미리 채웠습니다. 다른 곳만 고쳐 주세요.</p></div>' +
      field('name', '상호·성명 <span class="req">*</span>', 'maxlength="60" autocomplete="organization"', '단체·회사라면 단체명, 개인이라면 이름') +
      '<div class="field-row">' + field('rep', '대표자·담당자 <span class="req">*</span>', 'maxlength="40" autocomplete="name"') + field('bizno', '사업자등록번호', 'maxlength="20" inputmode="numeric" placeholder="법인·단체인 경우"') + '</div>' +
      field('address', '주소', 'maxlength="120" autocomplete="street-address"') +
      '<div class="field-row">' + field('phone', '연락처 <span class="req">*</span>', 'maxlength="20" type="tel" inputmode="tel" autocomplete="tel"') + field('email', '이메일', 'maxlength="80" type="email" inputmode="email" autocomplete="email"') + '</div>' +
      '<label class="ct-agree"><input type="checkbox" name="agree"><span>계약서 내용(대관료와 결제, 보증금, 취소와 환불, 지켜야 할 사항)을 확인했고, 이 화면에서 확인을 눌러 전자 방식으로 계약을 맺는 데 동의합니다. 확인한 시각과 접속 기록이 계약 확인용으로 보관됩니다. <a href="/privacy/#contract" target="_blank" rel="noopener">개인정보처리방침</a></span></label>' +
      '<details class="ct-sign-opt"><summary>손글씨 서명 넣기 (선택)</summary><p class="hint" style="margin:6px 0 8px">그리지 않으면 대표자·담당자 이름이 전자 서명으로 들어갑니다.</p>' +
      '<div class="ct-pad"><canvas data-pad aria-label="서명 칸"></canvas><span class="ct-pad-hint" data-pad-hint>여기에 서명</span><div class="ct-pad-tools"><button type="button" class="btn btn-light btn-sm" data-undo>한 획 지우기</button><button type="button" class="btn btn-light btn-sm" data-clear>다시 쓰기</button></div></div></details>' +
      '<p class="kit-msg err" data-err role="alert"></p>' +
      '<button type="submit" class="btn btn-primary btn-lg">확인하고 계약 완료</button>' +
      '<p class="hint" style="margin:0">확인을 누르면 계약 내용이 확정되어 고칠 수 없습니다. 내용이 다르면 먼저 <a href="' + HELP + '" target="_blank" rel="noopener" style="text-decoration:underline">카카오톡으로 알려 주세요</a>.</p>' +
      '</div></form></div><div data-invite></div>';
    var f = K.$('[data-form]', root), det = K.$('.ct-sign-opt', root);
    var makePad = function () { if (!pad) pad = window.SignPad(K.$('[data-pad]', root), { onChange: function () { K.$('[data-pad-hint]', root).hidden = !pad.isEmpty(); } }); };
    det.addEventListener('toggle', function () { if (det.open) makePad(); });
    f.addEventListener('input', function (e) {
      var k = e.target.dataset.r; if (!k) { step(); return; }
      renter[k] = e.target.value; shot = null; K.$('[data-doc]', root).innerHTML = docHtml(); step();
    });
    f.addEventListener('change', step);
    f.addEventListener('click', function (e) { if (!pad) return; if (e.target.closest('[data-clear]')) pad.clear(); if (e.target.closest('[data-undo]')) pad.undo(); });
    f.addEventListener('submit', submit);
    step(); drawInvite();
  }
  function step() {
    var f = K.$('[data-form]', root); if (!f) return;
    var info = renter.name && renter.rep && String(renter.phone || '').replace(/\D/g, '').length >= 9;
    var li = K.$$('.ct-steps li', root); li[1].classList.toggle('on', !!info); li[2].classList.toggle('on', !!(info && f.agree.checked));
  }
  function submit(e) {
    e.preventDefault();
    var f = e.target, errEl = K.$('[data-err]', f), btn = f.querySelector('button[type=submit]');
    var say = function (m, el) { errEl.textContent = m; if (el) el.focus(); };
    if (!renter.name) return say('대관자 상호·성명을 적어 주세요.', K.$('#ct-name'));
    if (!renter.rep) return say('대표자·담당자 이름을 적어 주세요.', K.$('#ct-rep'));
    if (String(renter.phone || '').replace(/\D/g, '').length < 9) return say('연락처를 확인해 주세요.', K.$('#ct-phone'));
    if (renter.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(renter.email)) return say('이메일 주소를 확인해 주세요.', K.$('#ct-email'));
    if (!f.agree.checked) return say('계약서 내용을 확인하고 동의 칸에 체크해 주세요.', f.agree);
    say(''); btn.disabled = true; btn.textContent = '계약을 저장하는 중…';
    api('sign', { id: id, k: key, renter: renter, signer: renter.rep, agree: true, signature: pad && !pad.isEmpty() ? pad.toDataURL() : '' }).then(function (j) {
      S.contract = j.contract; render(); window.scrollTo({ top: 0, behavior: 'auto' });
      K.toast('계약이 완료되었습니다. 계약서를 PDF나 이미지로 내려받아 보관해 주세요.');
    }, function (er) { btn.disabled = false; btn.textContent = '확인하고 계약 완료'; say(er.message); });
  }

  // ---------- 계약서 PDF · 이미지 ----------
  var pdfLib = null;
  function loadPdf() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (!pdfLib) pdfLib = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '/assets/js/vendor/html2pdf.bundle.min.js'; s.onload = function () { res(window.html2pdf); }; s.onerror = function () { pdfLib = null; rej(new Error('PDF 도구를 불러오지 못했습니다. ‘인쇄’에서 PDF로 저장을 골라 주세요.')); }; document.head.appendChild(s); });
    return pdfLib;
  }
  var OPT = function () {
    return { margin: [12, 12, 14, 12], filename: fileName('pdf'), image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.cdoc-clause', '.cdoc-head', '.cdoc-sign', '.cdoc-sec h2', '.cdoc-special', '.cdoc-intro'] } };
  };
  function fileName(ext) { return 'megaspot-contract-' + S.contract.id + (S.contract.status === 'signed' ? '' : '-draft') + '.' + ext; }
  function saveBlob(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  function withBox(fn) {
    var box = document.createElement('div'); box.className = 'ct-print-box'; box.innerHTML = docHtml(); document.body.appendChild(box);
    return loadPdf().then(function (h2p) { return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { return fn(h2p, box.firstChild); }); })
      .then(function (v) { box.remove(); return v; }, function (er) { box.remove(); throw er; });
  }
  function image() {
    if (shot) return Promise.resolve(shot);
    return withBox(function (h2p, el) { return h2p().set(OPT()).from(el).toCanvas().get('canvas'); }).then(function (cv) {
      return new Promise(function (res, rej) { cv.toBlob(function (b) { if (b) { shot = b; res(b); } else rej(new Error('이미지를 만들지 못했습니다.')); }, 'image/jpeg', 0.92); });
    });
  }
  function exportDoc(kind, btn) {
    var msg = K.$('[data-x-msg]', root), label = btn.textContent;
    var say = function (m, err) { if (msg) { msg.className = 'kit-msg ' + (err ? 'err' : 'ok'); msg.textContent = m; } };
    if (kind === 'print') { window.print(); return; }
    // 이미지가 준비되어 있으면 누른 즉시 공유 창을 엽니다 (휴대폰 브라우저는 누른 직후에만 공유 창을 열 수 있습니다)
    if (kind === 'share' && shot) { shareNow(shot, say); return; }
    btn.disabled = true; btn.textContent = kind === 'pdf' ? 'PDF를 만드는 중…' : '이미지를 만드는 중…'; if (msg) { msg.className = 'kit-msg'; msg.textContent = ''; }
    var done = function () { btn.disabled = false; btn.textContent = label; };
    var job = kind === 'pdf' ? withBox(function (h2p, el) { return h2p().set(OPT()).from(el).save(); }) : image();
    job.then(function (blob) {
      done();
      if (kind === 'pdf') say('PDF를 내려받았습니다. 휴대폰에서는 파일 앱이나 다운로드 폴더에서 열 수 있습니다.');
      else if (kind === 'img') { saveBlob(blob, fileName('jpg')); say('계약서 이미지를 내려받았습니다.'); }
      else shareNow(blob, say);
    }, function (er) { done(); say(er.message || '파일을 만들지 못했습니다. ‘인쇄’에서 PDF로 저장을 골라 주세요.', true); });
  }
  function shareNow(blob, say) {
    var file = new File([blob], fileName('jpg'), { type: 'image/jpeg' });
    navigator.share({ files: [file], title: '메가스팟 공간대관 계약서 ' + S.contract.id }).then(function () { say('계약서 이미지를 보냈습니다.'); }, function (e) {
      if (e && e.name === 'AbortError') return;
      if (e && e.name === 'NotAllowedError') { say('이미지가 준비되었습니다. ‘이미지로 보내기’를 한 번 더 눌러 주세요.'); return; }
      saveBlob(blob, fileName('jpg')); say('공유 창을 열 수 없어 이미지를 내려받았습니다.');
    });
  }

  // ---------- 모임 초대장 ----------
  function drawInvite() {
    var el = K.$('[data-invite]', root), iv = S.invite; if (!el) return;
    if (!iv) { el.innerHTML = ''; return; }
    var head = '<div class="ct-inv-head"><div class="eyebrow">Invitation</div><h2>모임 초대장</h2><p class="desc">일행에게 보낼 초대장을 PDF·이미지로 내려받거나 카카오톡으로 공유하세요. 날짜와 장소, 길찾기, 주차 안내가 자동으로 들어갑니다.</p></div>';
    if (!iv.available) { el.innerHTML = '<section class="kit-panel ct-inv">' + head + '<p class="kit-msg info">' + esc(iv.reason || '예약이 확정되면 모임 초대장을 만들 수 있습니다.') + '</p></section>'; return; }
    if (iv.invite) {
      el.innerHTML = '<section class="kit-panel ct-inv">' + head + '<div class="ct-inv-grid"><div data-deliver></div><div class="ct-inv-card">' + K.inviteCard(iv.invite, { mini: true }) +
        '<div class="kit-row" style="margin-top:10px"><a class="btn btn-light btn-sm" href="' + esc(iv.public_url) + '" target="_blank" rel="noopener">초대장 열어 보기</a><a class="btn btn-light btn-sm" href="' + esc(iv.manage_url) + '" target="_blank" rel="noopener">내용 고치기·응답 보기</a></div></div></div></section>';
      K.deliverBox(K.$('[data-deliver]', el), { invite: iv.invite, public_url: iv.public_url, manage_url: iv.manage_url, kakao: iv.kakao, title: iv.title });
      return;
    }
    var r = renter || S.contract.data.renter || {}, b = iv.booking || {};
    el.innerHTML = '<section class="kit-panel ct-inv">' + head + '<form class="form ct-inv-form" data-inv-form novalidate>' +
      '<p class="desc" style="margin:0">' + esc(b.space_name || '') + ' · ' + esc(K.fmtDate(b.date)) + ' ' + esc(K.timeRange(b.start_h, b.end_h)) + '</p>' +
      '<div class="field-row"><div class="f"><label for="ci-title">모임 이름 <span class="req">*</span></label><input class="input" id="ci-title" name="title" maxlength="40" placeholder="2026 송년의 밤" value="' + esc(S.contract.data.event || '') + '"></div>' +
      '<div class="f"><label for="ci-host">보내는 사람</label><input class="input" id="ci-host" name="host" maxlength="30" value="' + esc(r.name || r.rep || '') + '"></div></div>' +
      '<div class="f"><label for="ci-msg">인사말 (선택)</label><textarea class="textarea" id="ci-msg" name="message" rows="3" maxlength="400" placeholder="편한 차림으로 오세요."></textarea></div>' +
      '<p class="kit-msg err" data-ierr role="alert"></p><div class="kit-row"><button type="submit" class="btn btn-dark">초대장 만들기</button><span class="hint">일정·공지·참석 응답은 만든 뒤 관리 화면에서 더 쓸 수 있습니다.</span></div></form></section>';
    K.$('[data-inv-form]', el).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector('button[type=submit]'), errEl = K.$('[data-ierr]', f);
      if (f.title.value.trim().length < 2) { errEl.textContent = '모임 이름을 두 글자 이상 적어 주세요.'; f.title.focus(); return; }
      btn.disabled = true; errEl.textContent = '';
      api('invite', { id: id, k: key, data: { title: f.title.value.trim(), host: f.host.value.trim(), message: f.message.value, theme: 'chalk', rsvp: { open: true, ask_party: true, ask_car: true } } }).then(function (j) {
        S.invite = j.invite; drawInvite(); K.toast('모임 초대장을 만들었습니다.');
      }, function (er) { btn.disabled = false; errEl.textContent = er.message; });
    });
  }

  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-x]'); if (b) exportDoc(b.dataset.x, b);
  });

  api('view?id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(key)).then(function (j) { S = j; render(); }, function (er) { fail(er.message); });
})();
