/* 웰컴 스크린 /play/welcome/ (2026-11-21)
   환영 · 카운트다운(시작 시각까지) · 쉬는 시간(분 타이머) 세 화면.
   준비 내용(문구·색·QR·일정)은 행사 연결 시 서버 play.welcome, 아니면 ms_play_welcome.
   카운트다운 시각·쉬는 시간 길이는 이 브라우저(ms_play_welcome_timer)에만 둡니다. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc;
  var DEF = { title: '', message: '오늘 함께해 주셔서 고맙습니다', host: '', footer: '', theme: 'light', qr: 'invite', qr_url: '', qr_label: '', schedule: [] };
  var W = Object.assign({}, DEF), T = Object.assign({ until: '19:00', min: 10, msg: '잠시 쉬어 갑니다' }, K.store.get('ms_play_welcome_timer', {}) || {});
  var mode = 'welcome', brk = { left: T.min * 60, end: 0, run: false, rang: false }, countRang = false;
  var st, view, rows, setSeg, setQr;
  var f = function (id) { return K.$('#' + id); };

  function inviteUrl() { var d = K.event.data; return d && d.public_url ? d.public_url : ''; }
  function fill() {
    f('w-title').value = W.title; f('w-message').value = W.message; f('w-host').value = W.host; f('w-footer').value = W.footer;
    f('w-qr-url').value = W.qr_url; f('w-qr-label').value = W.qr_label;
    f('w-until').value = T.until; f('w-break').value = T.min; f('w-break-msg').value = T.msg;
    K.$$('input[name=wtheme]').forEach(function (r) { r.checked = r.value === W.theme; });
    rows.set(W.schedule.map(function (s) { return { time: s.time, text: s.text }; }));
    if (!W.schedule.length) rows.set([{ time: '', text: '' }]);
    setQr(W.qr); qrUi();
  }
  function read() {
    W.title = f('w-title').value.trim(); W.message = f('w-message').value.trim(); W.host = f('w-host').value.trim(); W.footer = f('w-footer').value.trim();
    W.qr_url = f('w-qr-url').value.trim(); W.qr_label = f('w-qr-label').value.trim();
    W.schedule = rows.get().filter(function (s) { return (s.text || '').trim(); }).map(function (s) { return { time: s.time || '', text: s.text.trim() }; });
    T.until = f('w-until').value || '19:00'; T.min = Math.max(1, Math.min(120, +f('w-break').value || 10)); T.msg = f('w-break-msg').value.trim() || '잠시 쉬어 갑니다';
    K.store.set('ms_play_welcome_timer', T);
  }
  function qrUi() {
    K.$('[data-qr-custom]').hidden = W.qr !== 'custom';
    K.$('[data-qr-hint]').textContent = W.qr === 'invite' ? (inviteUrl() ? '연결한 초대장 주소가 QR로 들어갑니다.' : '행사에 연결하면 초대장 QR이 들어갑니다. 지금은 QR 없이 보입니다.') : W.qr === 'custom' ? '설문, 사진 공유 앨범처럼 https 주소를 넣으세요.' : '';
  }
  function qrTarget() {
    if (W.qr === 'invite') return inviteUrl() ? { url: inviteUrl(), label: W.qr_label || '초대장 · 일정 · 주차 안내' } : null;
    if (W.qr === 'custom' && /^https:\/\//i.test(W.qr_url)) return { url: W.qr_url, label: W.qr_label || '휴대폰으로 비춰 보세요' };
    return null;
  }

  function eyebrow() {
    var d = K.event.data, inv = d && d.invite;
    return inv ? K.fmtShort(inv.date) + ' · ' + ((inv.space || {}).name || '메가스팟') : 'WELCOME';
  }
  function schedHtml() {
    if (!W.schedule.length) return '';
    var now = K.currentStep(W.schedule);
    return '<div class="wl-sched">' + W.schedule.map(function (s, i) { return '<span class="' + (i === now ? 'now' : i < now ? 'past' : '') + '">' + (s.time ? '<b>' + esc(s.time) + '</b>' : '') + esc(s.text) + '</span>'; }).join('') + '</div>';
  }
  function nextStep() {
    var now = K.nowMin(), n = W.schedule.find(function (s) { var m = K.min(s.time); return m != null && m > now; });
    return n ? (n.time ? n.time + ' ' : '') + n.text : '';
  }
  function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0'); }
  function untilSec() {
    var m = K.min(T.until); if (m == null) return 0;
    var d = new Date(Date.now() + 9 * 3600e3), nowS = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(), diff = m * 60 - nowS;
    if (diff < -3600 * 6) diff += 86400;   // 자정을 넘긴 시각
    return diff;
  }
  function draw() {
    st.className = 'stage t-' + (K.SCREEN_THEMES[W.theme] ? W.theme : 'light') + (st.classList.contains('is-full') ? ' is-full' : '');
    var q = qrTarget(), h = K.brand + '<div class="corner" data-clock></div><div class="center">';
    if (mode === 'welcome') {
      h += '<div class="eyebrow-s">' + esc(eyebrow()) + '</div><div class="t1">' + esc(W.title || '어서 오세요') + '</div>' + (W.message ? '<div class="t2">' + esc(W.message) + '</div>' : '') + '<div data-sch>' + schedHtml() + '</div>';
    } else if (mode === 'count') {
      h += '<div class="eyebrow-s">' + esc(T.until) + ' 시작</div><div class="big-num" data-num></div><div class="t2" data-sub>' + esc(W.title || '곧 시작합니다') + '</div>';
    } else {
      h += '<div class="eyebrow-s">' + esc(T.msg) + '</div><div class="big-num" data-num></div><div class="t2" data-sub></div>';
    }
    h += '</div><div class="foot"><div class="wl-place">' + (W.host ? '<b>' + esc(W.host) + '</b>' : '') + esc(W.footer || '') + '</div>' +
      (q && mode !== 'break' ? '<div class="wl-side"><div><div class="qrbox" data-qrbox></div><div class="qrcap">' + esc(q.label) + '</div></div></div>' : '') + '</div>';
    view.innerHTML = h;
    if (q && mode !== 'break') K.qr(K.$('[data-qrbox]', view), q.url, { label: q.label });
    tick();
  }
  function tick() {
    var c = K.$('[data-clock]', view); if (c) { var d = new Date(Date.now() + 9 * 3600e3); c.textContent = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }
    var num = K.$('[data-num]', view), sub = K.$('[data-sub]', view);
    if (mode === 'welcome') { var sc = K.$('[data-sch]', view); if (sc) sc.innerHTML = schedHtml(); return; }
    if (!num) return;
    if (mode === 'count') {
      var left = untilSec();
      num.textContent = left > 0 ? mmss(left) : '지금 시작';
      num.style.fontSize = left > 0 ? '' : '12cqw';
      if (left <= 0 && !countRang) { countRang = true; K.sound.done(); }
      if (left > 0) countRang = false;
    } else {
      var l = brk.run ? (brk.end - Date.now()) / 1000 : brk.left;
      if (brk.run && l <= 0) { brk.run = false; brk.left = 0; if (!brk.rang) { brk.rang = true; K.sound.done(); } }
      num.textContent = l > 0 ? mmss(l) : '다시 시작합니다';
      num.style.fontSize = l > 0 ? '' : '10cqw';
      var nx = nextStep();
      sub.textContent = l > 0 ? (brk.run ? '' : '스페이스바를 누르면 시작합니다 · ') + (nx ? '다음 순서 · ' + nx : '') : (nx ? '다음 순서 · ' + nx : '자리로 돌아와 주세요');
    }
  }
  function setMode(m) { mode = m; if (setSeg) setSeg(m); if (m === 'break' && !brk.run && brk.left <= 0) { brk.left = T.min * 60; brk.rang = false; } draw(); }
  function toggleBreak() {
    if (mode !== 'break') return;
    if (brk.run) { brk.left = Math.max(0, (brk.end - Date.now()) / 1000); brk.run = false; }
    else { if (brk.left <= 0) brk.left = T.min * 60; brk.end = Date.now() + brk.left * 1000; brk.run = true; brk.rang = false; }
    tick();
  }
  function bump(min) {
    if (mode === 'break') {
      if (brk.run) brk.end = Math.max(Date.now(), brk.end + min * 60000); else brk.left = Math.max(0, brk.left + min * 60);
    } else if (mode === 'count') {
      var m = (K.min(T.until) || 0) + min; m = (m + 1440) % 1440; T.until = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); f('w-until').value = T.until; K.store.set('ms_play_welcome_timer', T); draw();
    }
    tick();
  }

  function onEvent(d) {
    var saved = K.setup.get('welcome', null);
    if (saved && !saved.title && !saved.message && !(saved.schedule || []).length) saved = null;   // 아직 저장한 적 없는 행사
    W = Object.assign({}, DEF, saved || {});
    if (d && d.invite && !(saved && saved.title)) {
      W.title = W.title || d.invite.title; W.host = W.host || d.invite.host || '';
      if (!W.schedule.length) W.schedule = (d.invite.schedule || []).slice();
    }
    fill(); draw();
  }

  // ---------- 시작 ----------
  st = K.tool(onEvent); view = K.$('[data-view]', st);
  K.$('[data-themes]').innerHTML = Object.keys(K.SCREEN_THEMES).map(function (k) { return '<label><input type="radio" name="wtheme" value="' + k + '"><span class="sw sw-' + k + '"></span>' + K.SCREEN_THEMES[k] + '</label>'; }).join('');
  rows = K.rows(K.$('[data-sched]'), [], [{ k: 'time', type: 'time', w: '128px', label: '시각' }, { k: 'text', ph: '순서 이름', label: '순서' }], { addBtn: K.$('[data-sched-add]'), blank: function () { return { time: '', text: '' }; }, onChange: function () { read(); draw(); } });
  setSeg = K.seg(K.$('.stage-bar .seg'), 'welcome', setMode);
  setQr = K.seg(K.$('[data-qr-tabs]'), W.qr, function (v) { W.qr = v; qrUi(); draw(); });
  K.$('.kit-setup').addEventListener('input', function (e) { if (e.target.closest('[data-sched]')) return; read(); if (e.target.id === 'w-break' && mode === 'break' && !brk.run) brk.left = T.min * 60; draw(); });
  K.$('.kit-setup').addEventListener('change', function (e) { if (e.target.name === 'wtheme') { W.theme = e.target.value; draw(); } });
  K.$('[data-save]').addEventListener('click', function () { read(); K.setup.save('welcome', W); });
  K.$('[data-reset]').addEventListener('click', function () { W = Object.assign({}, DEF); onEvent(K.event.data); });
  K.keys(st, {
    '1': function () { setMode('welcome'); }, '2': function () { setMode('count'); }, '3': function () { setMode('break'); },
    Space: toggleBreak, ArrowUp: function () { bump(1); }, ArrowDown: function () { bump(-1); }
  });
  setInterval(tick, 500);
  onEvent(null);
})();
