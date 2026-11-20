/* 모임 초대장 — 만들기 /invite/new/ (2026-11-21)
   1) 예약번호 + 예약자 휴대폰 뒷 4자리로 확정 예약 확인 → 2) 내용 쓰기(오른쪽 미리보기) → 3) 주소·QR·관리 링크
   초대장 쓰기 화면(Kit.inviteForm)은 관리 화면의 ‘초대장 고치기’도 함께 씁니다.
   만든 초대장의 관리 주소는 이 브라우저(ms_invite_mine)에 최근 5개까지 기억해 다시 열기 쉽게 합니다. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc;
  var MINE = 'ms_invite_mine';
  K.rememberInvite = function (o) {
    var list = (K.store.get(MINE, []) || []).filter(function (x) { return x && x.manage_url && x.manage_url !== o.manage_url; });
    list.unshift({ title: o.title, date: o.date, public_url: o.public_url, manage_url: o.manage_url, screen_url: o.screen_url });
    K.store.set(MINE, list.slice(0, 5));
  };
  K.forgetInvite = function (manageUrl) { K.store.set(MINE, (K.store.get(MINE, []) || []).filter(function (x) { return x && x.manage_url !== manageUrl; })); };

  // ---------- 초대장 쓰기 화면 ----------
  // opts: { booking, data, submitLabel, onSubmit(data) → Promise }
  K.inviteForm = function (el, opts) {
    var bk = opts.booking || {}, d = opts.data || {}, r = d.rsvp || { open: true, ask_party: true, ask_car: true };
    var sched = (d.schedule && d.schedule.length ? d.schedule : [{ time: '', text: '' }]).slice();
    var maxDate = bk.date || '';
    el.innerHTML = '<div class="kit-split"><form class="kit-panel" data-f novalidate><div class="form">' +
      '<div><h2>초대장 내용</h2><p class="desc" style="margin:2px 0 0">' + esc(bk.space_name || '') + ' · ' + esc(K.fmtDate(bk.date)) + ' ' + esc(K.timeRange(bk.start_h, bk.end_h)) + ' — 예약에서 자동으로 들어갑니다.</p></div>' +
      '<div class="f"><label for="iv-title">모임 이름 <span class="req">*</span></label><input class="input" id="iv-title" name="title" maxlength="40" required placeholder="2026 송년의 밤" value="' + esc(d.title || '') + '"></div>' +
      '<div class="field-row"><div class="f"><label for="iv-host">보내는 사람</label><input class="input" id="iv-host" name="host" maxlength="30" placeholder="조직문화팀 · 3기 동기회" value="' + esc(d.host || '') + '"></div>' +
      '<div class="f"><label for="iv-entry">입장 시작 (선택)</label><input class="input" id="iv-entry" name="entry" type="time" value="' + esc(d.entry || '') + '"></div></div>' +
      '<div class="f"><label for="iv-message">인사말</label><textarea class="textarea" id="iv-message" name="message" maxlength="400" rows="4" placeholder="한 해 동안 고생 많으셨습니다. 편한 차림으로 오세요.">' + esc(d.message || '') + '</textarea><span class="kit-counter" data-count="message"></span></div>' +
      '<div class="f"><span class="lbl">일정 (최대 12개)</span><div class="kit-sched" data-sched></div><button type="button" class="kit-add" data-sched-add>+ 일정 추가</button></div>' +
      '<div class="f"><label for="iv-notice">알려 드려요 (선택)</label><textarea class="textarea" id="iv-notice" name="notice" maxlength="400" rows="3" placeholder="드레스 코드, 준비물, 회비 안내처럼 함께 알릴 내용">' + esc(d.notice || '') + '</textarea><span class="hint">회비를 받는다면 받는 방법을 여기에 적어 주세요. 메가스팟은 회비를 대신 받지 않습니다.</span></div>' +
      '<div class="field-row"><div class="f"><label for="iv-contact">문의 (선택)</label><input class="input" id="iv-contact" name="contact" maxlength="80" placeholder="총무 김하나" value="' + esc(d.contact || '') + '"><span class="hint">전화번호를 적으면 초대장을 받은 모든 사람에게 보입니다.</span></div>' +
      '<div class="f"><label for="iv-url">연락 링크 (선택)</label><input class="input" id="iv-url" name="contact_url" inputmode="url" maxlength="300" placeholder="https://open.kakao.com/…" value="' + esc(d.contact_url || '') + '"><span class="hint">오픈채팅방이나 설문 주소처럼 https로 시작하는 주소</span></div></div>' +
      '<div class="f"><span class="lbl">초대장 색</span><div class="kit-themes">' + Object.keys(K.THEMES).map(function (k) {
        return '<label><input type="radio" name="theme" value="' + k + '"' + ((d.theme || 'chalk') === k ? ' checked' : '') + '><span class="sw sw-' + k + '"></span>' + K.THEMES[k] + '</label>';
      }).join('') + '</div></div>' +
      '<div class="kit-divider"></div>' +
      '<div><h3>참석 응답</h3><p class="desc" style="margin:2px 0 0">참석자는 가입 없이 이름과 참석 여부를 남깁니다. 휴대폰 번호는 받지 않습니다.</p></div>' +
      '<label class="kit-switch">참석 응답 받기<input type="checkbox" name="rsvp_open"' + (r.open !== false ? ' checked' : '') + '></label>' +
      '<div class="form" data-rsvp-opts style="gap:12px">' +
      '<div class="field-row"><label class="kit-switch">오는 인원 묻기 (본인 포함)<input type="checkbox" name="ask_party"' + (r.ask_party ? ' checked' : '') + '></label><label class="kit-switch">차량 여부 묻기<input type="checkbox" name="ask_car"' + (r.ask_car ? ' checked' : '') + '></label></div>' +
      '<div class="field-row"><div class="f"><label for="iv-deadline">응답 마감 (선택)</label><input class="input" id="iv-deadline" name="deadline" type="date"' + (maxDate ? ' max="' + maxDate + '"' : '') + ' min="' + K.today() + '" value="' + esc(r.deadline || '') + '"></div>' +
      '<div class="f"><label for="iv-q">추가 질문 (선택)</label><input class="input" id="iv-q" name="question" maxlength="60" placeholder="못 드시는 음식이 있나요?" value="' + esc(r.question || '') + '"></div></div></div>' +
      '<p class="kit-msg err" data-err role="alert"></p>' +
      '<button type="submit" class="btn btn-primary btn-lg">' + esc(opts.submitLabel || '초대장 만들기') + '</button>' +
      '</div></form><div class="sticky"><p class="inv-preview-label">미리보기</p><div data-preview></div></div></div>';
    var f = K.$('[data-f]', el), box = K.$('[data-sched]', el), prev = K.$('[data-preview]', el);
    function drawSched() {
      box.innerHTML = sched.map(function (s, i) {
        return '<div class="it"><input class="input" type="time" data-st="' + i + '" value="' + esc(s.time || '') + '" aria-label="일정 ' + (i + 1) + ' 시각"><input class="input" data-sx="' + i + '" maxlength="40" placeholder="' + (i ? '저녁 식사' : '개회 · 인사') + '" value="' + esc(s.text || '') + '" aria-label="일정 ' + (i + 1) + ' 내용"><button type="button" class="kit-x" data-sdel="' + i + '" aria-label="일정 ' + (i + 1) + ' 지우기">×</button></div>';
      }).join('');
      K.$('[data-sched-add]', el).hidden = sched.length >= 12;
    }
    function value() {
      return {
        title: f.title.value.trim(), host: f.host.value.trim(), message: f.message.value, entry: f.entry.value,
        schedule: sched.filter(function (s) { return (s.text || '').trim(); }).map(function (s) { return { time: s.time || '', text: s.text.trim() }; }),
        notice: f.notice.value, contact: f.contact.value.trim(), contact_url: f.contact_url.value.trim(),
        theme: (f.querySelector('input[name=theme]:checked') || {}).value || 'chalk',
        rsvp: { open: f.rsvp_open.checked, ask_party: f.ask_party.checked, ask_car: f.ask_car.checked, deadline: f.deadline.value, question: f.question.value.trim() }
      };
    }
    function preview() {
      var v = value();
      K.$('[data-rsvp-opts]', el).hidden = !v.rsvp.open;
      var c = K.$('[data-count="message"]', el); c.textContent = v.message.length + ' / 400';
      prev.innerHTML = K.inviteCard(Object.assign({}, v, { title: v.title || '모임 이름', date: bk.date, start_h: bk.start_h, end_h: bk.end_h, space: { name: bk.space_name }, phase: 'before' }), { mini: false });
    }
    drawSched(); preview();
    el.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.st != null) sched[+t.dataset.st].time = t.value;
      if (t.dataset.sx != null) sched[+t.dataset.sx].text = t.value;
      preview();
    });
    el.addEventListener('change', preview);
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-sched-add]')) { if (sched.length < 12) { sched.push({ time: '', text: '' }); drawSched(); var last = box.querySelector('[data-sx="' + (sched.length - 1) + '"]'); if (last) last.focus(); } }
      var del = e.target.closest('[data-sdel]');
      if (del) { sched.splice(+del.dataset.sdel, 1); if (!sched.length) sched.push({ time: '', text: '' }); drawSched(); preview(); }
      if (e.target.closest('a[href]') && prev.contains(e.target)) e.preventDefault();   // 미리보기 안 링크는 막기
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = value(), err = K.$('[data-err]', el), btn = f.querySelector('button[type=submit]');
      var say = function (m) { err.textContent = m; };
      if (v.title.length < 2) { f.title.focus(); return say('모임 이름을 두 글자 이상 적어 주세요.'); }
      if (v.contact_url && !/^https:\/\//i.test(v.contact_url)) { f.contact_url.focus(); return say('연락 링크는 https:// 로 시작하는 주소만 넣을 수 있습니다.'); }
      if (v.rsvp.deadline && maxDate && v.rsvp.deadline > maxDate) return say('응답 마감은 모임 날짜보다 늦을 수 없습니다.');
      say(''); btn.disabled = true; var label = btn.textContent; btn.textContent = '저장하는 중…';
      Promise.resolve(opts.onSubmit(v)).then(function () { btn.disabled = false; btn.textContent = label; }, function (er) { btn.disabled = false; btn.textContent = label; say(er.message); });
    });
    return { value: value };
  };

  // 만든 뒤 · 관리 화면에서 함께 쓰는 주소 상자
  K.linkBox = function (label, url, note, extra) {
    var abs = K.abs(url);
    return '<div class="f"><span class="lbl">' + esc(label) + '</span><div class="kit-link"><code>' + esc(abs) + '</code><button type="button" class="btn btn-light btn-sm" data-copy-url="' + esc(abs) + '">복사</button></div>' +
      (note ? '<span class="hint">' + esc(note) + '</span>' : '') + (extra || '') + '</div>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy-url]'); if (b) K.copy(b.dataset.copyUrl, '주소를 복사했습니다.');
  });

  // ---------- /invite/new/ ----------
  var root = K.$('#inv-root');
  if (!root || !document.body.classList.contains('page-invite-new')) return;
  var cred = null, booking = null;

  function stepVerify(msg) {
    var b = (new URLSearchParams(location.search).get('b') || '').toUpperCase().slice(0, 20);
    var mine = (K.store.get(MINE, []) || []).filter(function (x) { return x && x.manage_url; });
    root.innerHTML = '<div class="kit-split"><form class="kit-panel" data-verify novalidate><div class="form">' +
      '<div><h2>예약 확인</h2><p class="desc" style="margin:2px 0 0">예약이 확정된 메가스팟 건대 1호·2호 예약으로 만들 수 있습니다. 예약 1건에 초대장 1장입니다.</p></div>' +
      '<div class="field-row"><div class="f"><label for="v-code">예약번호</label><input class="input" id="v-code" name="code" autocomplete="off" autocapitalize="characters" maxlength="20" placeholder="예약확정 안내에 있는 번호" value="' + esc(b) + '"></div>' +
      '<div class="f"><label for="v-last4">예약자 휴대폰 뒷 4자리</label><input class="input" id="v-last4" name="last4" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="1234"></div></div>' +
      '<p class="kit-msg err" data-err role="alert">' + esc(msg || '') + '</p>' +
      '<button type="submit" class="btn btn-primary btn-lg">예약 확인하고 시작하기</button>' +
      '<p class="hint" style="margin:0">예약번호는 예약확정 안내 문자와 <a href="/confirm/" style="text-decoration:underline">예약확정서 조회</a>에서 볼 수 있습니다.</p>' +
      '</div></form><div>' +
      (mine.length ? '<div class="kit-panel"><h3>이 브라우저에서 만든 초대장</h3><div style="display:grid;gap:8px;margin-top:12px">' + mine.map(function (x) {
        return '<div class="kit-link"><code>' + esc(x.title || '초대장') + ' · ' + esc(K.fmtShort(x.date)) + '</code><a class="btn btn-light btn-sm" href="' + esc(x.manage_url) + '">관리</a></div>';
      }).join('') + '</div></div>' : '') +
      '<div class="kit-panel"><h3>초대장으로 할 수 있는 것</h3><ul class="inv-park" style="margin-top:10px;font-size:14.5px;gap:8px">' +
      '<li><b>주소 하나로 안내 끝</b> — 일시·장소·길찾기·주차가 자동으로 붙습니다</li><li><b>참석 응답 모으기</b> — 참석·미정·불참과 인원, 차량, 추가 질문</li>' +
      '<li><b>당일 스크린 연결</b> — 참석자 이름으로 추첨·팀 나누기, 웰컴 스크린에 초대장 QR</li></ul></div></div></div>';
    var f = K.$('[data-verify]', root);
    if (b) f.last4.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = f.code.value.trim().toUpperCase(), last4 = f.last4.value.replace(/\D/g, ''), err = K.$('[data-err]', f), btn = f.querySelector('button[type=submit]');
      if (!code) { f.code.focus(); err.textContent = '예약번호를 적어 주세요.'; return; }
      if (last4.length !== 4) { f.last4.focus(); err.textContent = '휴대폰 뒷 4자리를 숫자로 적어 주세요.'; return; }
      err.textContent = ''; btn.disabled = true; btn.textContent = '확인하는 중…';
      K.api('verify', { booking_code: code, phone_last4: last4 }).then(function (j) {
        cred = { booking_code: code, phone_last4: last4 }; booking = j.booking;
        if (j.existing) { K.rememberInvite(Object.assign({ date: booking.date }, j.existing)); return done(j.existing, true); }
        stepForm();
      }, function (er) { btn.disabled = false; btn.textContent = '예약 확인하고 시작하기'; err.textContent = er.message; });
    });
  }

  function stepForm() {
    root.innerHTML = '<div data-form></div>';
    K.inviteForm(K.$('[data-form]', root), {
      booking: booking, submitLabel: '초대장 만들기',
      onSubmit: function (v) {
        return K.api('create', Object.assign({}, cred, v)).then(function (j) {
          K.rememberInvite({ title: v.title, date: booking.date, public_url: j.public_url, manage_url: j.manage_url, screen_url: j.screen_url });
          done(Object.assign({ title: v.title }, j), !!j.existing);
        });
      }
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function done(j, existed) {
    var title = j.title || '';
    root.innerHTML = '<div class="kit-split"><div class="kit-panel kit-done">' +
      '<div><span class="kit-tag">' + (existed ? '이미 만든 초대장' : '초대장 완성') + '</span><h2 style="margin-top:10px;font-size:22px">' + esc(title || '모임 초대장') + '</h2>' +
      '<p class="desc" style="margin:4px 0 0">' + (existed ? '이 예약으로 만든 초대장이 있습니다. 내용을 바꾸려면 관리 화면에서 고쳐 주세요.' : '아래 주소를 카카오톡이나 문자로 보내세요. 응답은 관리 화면에서 확인합니다.') + '</p></div>' +
      K.linkBox('참석자에게 보낼 주소', j.public_url, '', '<div class="kit-row" style="margin-top:8px"><button type="button" class="btn btn-primary" data-share>초대장 보내기</button><a class="btn btn-light" href="' + esc(j.public_url) + '" target="_blank" rel="noopener">열어 보기</a></div>') +
      K.linkBox('주최자 관리 주소 (나만 보관)', j.manage_url, '응답 명단을 볼 수 있는 주소입니다. 다른 사람에게 보내지 마세요. 잃어버려도 예약번호로 다시 열 수 있습니다.', '<div class="kit-row" style="margin-top:8px"><a class="btn btn-dark" href="' + esc(j.manage_url) + '">관리 화면 열기</a></div>') +
      K.linkBox('행사 날 스크린 연결 주소', j.screen_url, '스크린에 연결한 노트북에서 여세요. 참석 응답 이름과 준비한 내용을 플레이 도구로 불러옵니다.') +
      '</div><div class="kit-panel" style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center"><div class="kit-qr" data-qr style="width:220px;height:220px"></div><p class="desc" style="margin:0">휴대폰 카메라로 비추면 초대장이 열립니다.<br>현장 안내판이나 발표 자료에 넣어도 됩니다.</p><button type="button" class="btn btn-light btn-sm" data-qr-save>QR 이미지 저장</button></div></div>';
    K.qr(K.$('[data-qr]', root), j.public_url, { label: '초대장 QR 코드' });
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-share]')) K.share(j.public_url, title, (title ? title + ' 초대장이에요. ' : '') + '일시와 장소, 주차 안내를 확인하고 참석 여부를 알려 주세요.');
      if (e.target.closest('[data-qr-save]')) K.download('megaspot-invite-qr.svg', window.KitQR.svg(K.abs(j.public_url), { label: '초대장 QR 코드' }), 'image/svg+xml');
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  stepVerify();
})();
