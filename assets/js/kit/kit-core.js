/* 메가스팟 모임 키트 공용 스크립트 (2026-11-21)
   초대장 · 웰컴 스크린 · 추첨 · 팀 나누기 · 퀴즈 · 빙고 · 밸런스 게임 · 돌림판이 함께 씁니다.
   - 서버 주소: /api/invites/…  (초대장 · 참석 응답 · 스크린 연결)
   - 브라우저 저장: ms_invite_rsvp(내 참석 응답 열쇠) · ms_play_event(연결한 행사) · ms_play_<도구>(행사에 연결하지 않았을 때 준비 내용)
     저장이 막힌 브라우저에서도 화면은 그대로 쓸 수 있고, 새로고침하면 준비 내용만 처음으로 돌아갑니다. */
(function () {
  'use strict';
  var M = window.MEGASPOT || {};
  var K = window.Kit = {};

  K.$ = function (s, r) { return (r || document).querySelector(s); };
  K.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  K.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  K.nl = function (s) { return K.esc(s).replace(/\n/g, '<br>'); };

  // 서버(functions/api/_invites.js)와 같은 값 — tests/invites.test.mjs 가 맞는지 확인합니다
  K.THEMES = { chalk: '밝은 기본', cobalt: '코발트', graphite: '차분한 저녁', rust: '따뜻한 오렌지' };
  K.RSVP = { yes: '참석', maybe: '미정', no: '불참' };
  K.SCREEN_THEMES = { light: '밝게', dark: '어둡게', cobalt: '코발트' };
  K.PLACE = { road: '서울 광진구 능동로13길 39', jibun: '서울 광진구 화양동 10-1', building: '한아름건물 2층', transit: '지하철 2·7호선 건대입구역 인근' };

  // ---------- 서버 ----------
  K.api = function (path, body, method) {
    var init = { method: method || (body ? 'POST' : 'GET'), headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch('/api/invites/' + path, init).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') < 0) { var e0 = new Error('지금은 서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.'); e0.code = 'NO_API'; e0.status = r.status; throw e0; }
      return r.json().then(function (j) {
        if (!r.ok || j.ok === false) { var e = new Error(j.error || '요청을 처리하지 못했습니다.'); e.code = j.code || 'ERR'; e.status = r.status; e.detail = j; throw e; }
        return j;
      });
    }, function () { var e = new Error('인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); e.code = 'NETWORK'; throw e; });
  };

  // ---------- 브라우저 저장 (막혀 있어도 오류 없이) ----------
  K.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // ---------- 공정한 무작위 (crypto) ----------
  K.rand = function (n) {
    n = Math.floor(n); if (!(n > 0)) return 0;
    var c = window.crypto || window.msCrypto;
    if (!c || !c.getRandomValues) return Math.floor(Math.random() * n);
    var max = Math.floor(0x100000000 / n) * n, a = new Uint32Array(1);
    do { c.getRandomValues(a); } while (a[0] >= max);
    return a[0] % n;
  };
  K.shuffle = function (arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = K.rand(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  K.token = function (len) { var s = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', o = ''; for (var i = 0; i < (len || 24); i++) o += s[K.rand(s.length)]; return o; };

  // ---------- 알림 · 복사 · 공유 ----------
  K.toast = function (msg) {
    if (M.toast) return M.toast(msg);
    var t = K.$('.kit-toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'kit-toast', role: 'status' }));
    t.textContent = msg; t.classList.add('on'); clearTimeout(K._tt); K._tt = setTimeout(function () { t.classList.remove('on'); }, 2600);
  };
  K.copy = function (text, okMsg) {
    var p = M.copy ? M.copy(text) : (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; }) : Promise.resolve(false));
    return p.then(function (ok) { K.toast(ok ? (okMsg || '복사했습니다.') : '복사하지 못했습니다. 길게 눌러 직접 복사해 주세요.'); return ok; });
  };
  K.abs = function (path) { return /^https?:/.test(path) ? path : location.origin + path; };
  K.share = function (url, title, text) {
    url = K.abs(url);
    if (navigator.share) return navigator.share({ title: title || document.title, text: text || '', url: url }).catch(function () {});
    return K.copy((text ? text + '\n' : '') + url, '주소를 복사했습니다. 카카오톡·문자에 붙여 넣어 보내세요.');
  };
  K.qr = function (el, text, opts) {
    if (!el) return;
    try { el.innerHTML = window.KitQR.svg(K.abs(text), opts || {}); }
    catch (e) { el.innerHTML = '<span class="qr-fail">주소가 길어 QR 코드를 만들지 못했습니다</span>'; }
  };
  K.download = function (name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  };
  K.csv = function (rows) {
    return '\uFEFF' + rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); if (/^[=+\-@\t\r]/.test(c)) c = "'" + c; return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
  };

  // ---------- 날짜 · 시각 (모두 한국 시간) ----------
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  K.today = function () { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); };
  K.ymd = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return { y: +m[1], m: +m[2], d: +m[3], wd: WD[d.getUTCDay()], t: d.getTime() }; };
  K.fmtDate = function (s) { var o = K.ymd(s); return o ? o.y + '년 ' + o.m + '월 ' + o.d + '일 (' + o.wd + ')' : ''; };
  K.fmtShort = function (s) { var o = K.ymd(s); return o ? o.m + '월 ' + o.d + '일 (' + o.wd + ')' : ''; };
  K.hh = function (h) { h = Number(h); if (!isFinite(h)) return ''; var x = h % 24, hm = String(Math.floor(x)).padStart(2, '0') + ':' + (x % 1 ? '30' : '00'); return h >= 24 ? '다음 날 ' + hm : hm; };
  K.timeRange = function (s, e) { if (s == null || s === '') return ''; return K.hh(s) + (e != null && e !== '' ? ' ~ ' + K.hh(e) : ''); };
  // 서버 기록 시각(UTC 'YYYY-MM-DD HH:MM:SS') → 한국 시간 'MM-DD HH:MM'
  K.kst = function (ts, full) { var t = Date.parse(String(ts || '').replace(' ', 'T') + 'Z'); if (!isFinite(t)) return ''; var s = new Date(t + 9 * 3600e3).toISOString(); return full ? s.slice(0, 16).replace('T', ' ') : s.slice(5, 16).replace('T', ' '); };
  K.dday = function (s) { var a = K.ymd(s), b = K.ymd(K.today()); return a && b ? Math.round((a.t - b.t) / 864e5) : null; };
  K.ddayLabel = function (s) { var n = K.dday(s); if (n == null) return ''; return n > 0 ? 'D-' + n : n === 0 ? 'D-DAY' : '지난 행사'; };

  // ---------- 길찾기 · 일정 저장 ----------
  K.maps = function (place) {
    var q = encodeURIComponent((place && place.road) || K.PLACE.road);
    return { naver: 'https://map.naver.com/p/search/' + q, kakao: 'https://map.kakao.com/link/search/' + q };
  };
  K.ics = function (o) {
    var d = K.ymd(o.date); if (!d) return;
    var at = function (h) { var t = new Date(Date.UTC(d.y, d.m - 1, d.d, 0, 0) + (Number(h) - 9) * 3600e3); return t.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var s = o.start_h != null ? Number(o.start_h) : 18, e = o.end_h != null ? Number(o.end_h) : s + 3;
    var clean = function (v) { return String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, function (c) { return '\\' + c; }); };
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MEGASPOT//Invite//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + (o.uid || K.token(16)) + '@megaspot.kr', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'DTSTART:' + at(s), 'DTEND:' + at(e), 'SUMMARY:' + clean(o.title), 'LOCATION:' + clean(o.location),
      'DESCRIPTION:' + clean(o.description), o.url ? 'URL:' + o.url : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    K.download((o.file || 'megaspot-event') + '.ics', body, 'text/calendar;charset=utf-8');
  };

  // ---------- 행사 연결 (스크린 도구) ----------
  // 초대장 관리 화면의 ‘스크린 연결’ 주소(/play/?ev=…&s=…)로 들어오면 이 브라우저에 행사를 기억합니다.
  var EV_KEY = 'ms_play_event';
  K.event = {
    data: null,
    fromUrl: function () {
      var p = new URLSearchParams(location.search), id = p.get('ev'), s = p.get('s');
      if (id && s) {
        K.store.set(EV_KEY, { id: id.toUpperCase().slice(0, 20), s: s.slice(0, 40) });
        p.delete('ev'); p.delete('s');
        try { history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash); } catch (e) {}
      }
      return K.event.get();
    },
    get: function () { var v = K.store.get(EV_KEY, null); return v && v.id && v.s ? v : null; },
    clear: function () { K.store.del(EV_KEY); K.event.data = null; },
    load: function () {
      var ev = K.event.fromUrl(); if (!ev) return Promise.resolve(null);
      return K.api('screen?id=' + encodeURIComponent(ev.id) + '&s=' + encodeURIComponent(ev.s)).then(function (j) { K.event.data = j; return j; }, function (e) {
        if (e.status === 403 || e.status === 404 || e.status === 410) K.event.clear();
        throw e;
      });
    },
    // 한 도구의 준비 내용만 바꿔 서버에 저장 (다른 도구 내용은 그대로)
    save: function (tool, value) {
      var ev = K.event.get(), d = K.event.data; if (!ev || !d) return Promise.resolve(null);
      var play = Object.assign({}, d.play || {}); play[tool] = value;
      return K.api('screen', { id: ev.id, s: ev.s, play: play }).then(function (j) { d.play = j.play; return j.play[tool]; });
    }
  };
  // 도구별 준비 내용: 행사에 연결되어 있으면 서버, 아니면 이 브라우저
  K.setup = {
    get: function (tool, fallback) {
      var d = K.event.data;
      if (d && d.play && d.play[tool]) return d.play[tool];
      return K.store.get('ms_play_' + tool, fallback);
    },
    save: function (tool, value) {
      K.store.set('ms_play_' + tool, value);
      if (K.event.data) return K.event.save(tool, value).then(function (v) { K.toast('행사에 저장했습니다. 다른 컴퓨터에서 열어도 그대로 나옵니다.'); return v; }, function (e) { K.toast('이 브라우저에만 저장했습니다. ' + e.message); return value; });
      K.toast('이 브라우저에 저장했습니다. 다른 컴퓨터에서도 쓰려면 초대장의 스크린 연결 주소로 여세요.');
      return Promise.resolve(value);
    }
  };
  // 도구 화면 위의 행사 연결 띠
  K.eventBar = function (el, onChange) {
    if (!el) return Promise.resolve(null);
    var draw = function (state, msg) {
      var d = K.event.data;
      if (state === 'on' && d) {
        var inv = d.invite || {};
        el.className = 'kit-evbar on';
        el.innerHTML = '<span class="dot" aria-hidden="true"></span><div><b>' + K.esc(inv.title || '연결한 행사') + '</b><small>' + K.esc(K.fmtShort(inv.date)) + ' · ' + K.esc((inv.space || {}).name || '') +
          ' · 참석 응답 ' + (d.attendees || []).length + '명</small></div><button type="button" class="btn btn-light btn-sm" data-ev-off>연결 끊기</button>';
      } else {
        el.className = 'kit-evbar';
        el.innerHTML = '<span class="dot" aria-hidden="true"></span><div><b>행사에 연결하지 않고 쓰는 중</b><small>' + K.esc(msg || '초대장을 만들었다면 초대장 관리 화면의 ‘스크린 연결’ 주소로 열어 보세요. 참석자 이름과 준비한 내용을 불러옵니다.') +
          '</small></div><a class="btn btn-light btn-sm" href="/invite/new/">초대장 만들기</a>';
      }
    };
    el.addEventListener('click', function (e) {
      if (!e.target.closest('[data-ev-off]')) return;
      K.event.clear(); draw('off'); K.toast('행사 연결을 끊었습니다. 이 브라우저에 저장한 내용으로 바뀝니다.');
      if (onChange) onChange(null);
    });
    draw('loading', '행사 정보를 불러오는 중…');
    if (!K.event.get() && !new URLSearchParams(location.search).get('ev')) { draw('off'); return Promise.resolve(null); }
    return K.event.load().then(function (d) { draw(d ? 'on' : 'off'); if (onChange) onChange(d); return d; }, function (e) { draw('off', e.message); if (onChange) onChange(null); return null; });
  };

  // ---------- 전체 화면 (200인치 스크린) ----------
  K.fullscreen = function (el) {
    var doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) { (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc); return; }
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { var p = req.call(el); if (p && p.catch) p.catch(function () { el.classList.toggle('is-full'); }); }
    else el.classList.toggle('is-full');
  };
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      var f = document.fullscreenElement || document.webkitFullscreenElement;
      K.$$('.stage').forEach(function (s) { s.classList.toggle('is-full', s === f); });
    });
  });
  // 전체 화면 안에서 쓰는 단축키 안내를 잠깐 보여 줍니다
  K.keys = function (stage, map) {
    document.addEventListener('keydown', function (e) {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '') || e.isComposing) return;
      if (e.key === 'Escape' && stage.classList.contains('is-full') && !document.fullscreenElement) { stage.classList.remove('is-full'); return; }
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'f') { e.preventDefault(); K.fullscreen(stage); return; }
      var fn = map[k] || (k === ' ' && map.Space);
      if (fn) { e.preventDefault(); fn(e); }
    });
  };

  // ---------- 소리 (짧은 효과음, 끄기 가능) ----------
  var ac = null;
  K.sound = {
    on: K.store.get('ms_play_sound', true) !== false,
    toggle: function () { K.sound.on = !K.sound.on; K.store.set('ms_play_sound', K.sound.on); return K.sound.on; },
    beep: function (freq, dur, type, vol) {
      if (!K.sound.on) return;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') ac.resume();
        var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
        o.type = type || 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(vol || .12, t); g.gain.exponentialRampToValueAtTime(.0001, t + (dur || .12));
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + (dur || .12) + .02);
      } catch (e) {}
    },
    tick: function () { K.sound.beep(880, .05, 'square', .05); },
    done: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { K.sound.beep(f, .22, 'triangle', .14); }, i * 110); }); },
    buzz: function () { K.sound.beep(196, .4, 'sawtooth', .08); }
  };
  K.soundButton = function (btn) {
    if (!btn) return;
    var draw = function () { btn.textContent = K.sound.on ? '소리 켜짐' : '소리 꺼짐'; btn.setAttribute('aria-pressed', K.sound.on ? 'true' : 'false'); };
    btn.addEventListener('click', function () { K.sound.toggle(); draw(); }); draw();
  };

  // ---------- 축하 효과 ----------
  K.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  K.confetti = function (host) {
    if (K.reduced || !host) return;
    var c = document.createElement('canvas'), r = host.getBoundingClientRect();
    c.className = 'kit-confetti'; c.width = r.width; c.height = r.height; host.appendChild(c);
    var x = c.getContext('2d'), colors = ['#1F53D5', '#F2B33D', '#B35632', '#2E7D4F', '#ffffff', '#6E8EF0'], ps = [];
    for (var i = 0; i < 140; i++) ps.push({ x: r.width / 2 + (Math.random() - .5) * r.width * .3, y: r.height * .45, vx: (Math.random() - .5) * r.width * .022, vy: -Math.random() * r.height * .03 - r.height * .008, s: 5 + Math.random() * 7, c: colors[i % colors.length], a: Math.random() * 6 });
    var t0 = performance.now();
    (function step(t) {
      var dt = t - t0; x.clearRect(0, 0, c.width, c.height);
      ps.forEach(function (p) { p.vy += r.height * .0009; p.x += p.vx; p.y += p.vy; p.a += .2; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
      if (dt < 2600) requestAnimationFrame(step); else c.remove();
    })(t0);
  };

  // ---------- 시계 ----------
  K.clock = function (el, withSec) {
    if (!el) return;
    var tick = function () { var d = new Date(Date.now() + 9 * 3600e3); el.textContent = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + (withSec ? ':' + String(d.getUTCSeconds()).padStart(2, '0') : ''); };
    tick(); return setInterval(tick, 1000);
  };
  K.nowMin = function () { var d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  K.min = function (hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };

  // ---------- 도구 화면 공통 준비 ----------
  // 스크린 버튼 · 소리 버튼 · 행사 연결 띠 · 전체 화면에서 마우스를 움직이면 단축키 안내
  K.tool = function (onEvent) {
    var st = K.$('#stage'), full = K.$('[data-full]'), t;
    if (full) full.addEventListener('click', function () { K.fullscreen(st); });
    K.soundButton(K.$('[data-sound]'));
    var show = function () { st.classList.add('show-hint'); clearTimeout(t); t = setTimeout(function () { st.classList.remove('show-hint'); }, 2600); };
    st.addEventListener('mousemove', show); document.addEventListener('fullscreenchange', show);
    K.eventBar(K.$('#kit-ev'), onEvent);
    return st;
  };
  // 여러 줄 입력 (일정 · 경품). fields: [{ k, type, ph, w, min, max }]
  K.rows = function (el, rows, fields, opt) {
    opt = opt || {};
    var max = opt.max || 12, add = opt.addBtn;
    var cols = fields.map(function (f) { return f.w || '1fr'; }).concat('40px').join(' ');
    function draw() {
      el.innerHTML = rows.map(function (r, i) {
        return '<div class="it" style="grid-template-columns:' + cols + '">' + fields.map(function (f) {
          return '<input class="input" data-row="' + i + '" data-k="' + f.k + '"' + (f.type ? ' type="' + f.type + '"' : '') + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') +
            (f.type === 'number' ? ' inputmode="numeric"' : '') + ' placeholder="' + K.esc(f.ph || '') + '" aria-label="' + K.esc((f.label || f.ph || f.k) + ' ' + (i + 1)) + '" value="' + K.esc(r[f.k] == null ? '' : r[f.k]) + '">';
        }).join('') + '<button type="button" class="kit-x" data-row-del="' + i + '" aria-label="' + (i + 1) + '번째 줄 지우기">×</button></div>';
      }).join('');
      if (add) add.hidden = rows.length >= max;
    }
    el.addEventListener('input', function (e) {
      var i = e.target.dataset.row; if (i == null) return;
      var f = fields.find(function (x) { return x.k === e.target.dataset.k; });
      rows[+i][e.target.dataset.k] = f && f.type === 'number' ? Number(e.target.value) : e.target.value;
      if (opt.onChange) opt.onChange(rows);
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-row-del]'); if (!b) return;
      rows.splice(+b.dataset.rowDel, 1); draw(); if (opt.onChange) opt.onChange(rows);
    });
    if (add) add.addEventListener('click', function () { if (rows.length >= max) return; rows.push(opt.blank ? opt.blank() : {}); draw(); var last = el.querySelector('[data-row="' + (rows.length - 1) + '"]'); if (last) last.focus(); if (opt.onChange) opt.onChange(rows); });
    draw();
    return { set: function (next) { rows.length = 0; next.forEach(function (r) { rows.push(r); }); draw(); }, get: function () { return rows; }, draw: draw };
  };
  K.seg = function (el, value, onPick) {
    if (!el) return;
    var set = function (v) { K.$$('button', el).forEach(function (b) { var on = (b.dataset.v || b.dataset.mode || b.dataset.src || b.dataset.qr) === String(v); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); };
    el.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var v = b.dataset.v || b.dataset.mode || b.dataset.src || b.dataset.qr; set(v); onPick(v); });
    set(value); return set;
  };
  K.brand = '<div class="brand">MEGA<b>SPOT</b> PLAY</div>';

  // 일정 가운데 지금 진행 중인 순서 (시각이 지난 마지막 항목)
  K.currentStep = function (schedule) {
    var now = K.nowMin(), idx = -1;
    (schedule || []).forEach(function (s, i) { var m = K.min(s.time); if (m != null && m <= now) idx = i; });
    return idx;
  };

  // 줄 단위 입력을 목록으로
  K.lines = function (s, max, len) { return String(s || '').split(/\r?\n/).map(function (x) { return x.trim().slice(0, len || 40); }).filter(Boolean).slice(0, max || 500); };
})();
