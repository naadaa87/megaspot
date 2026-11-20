/* 경품 추첨 /play/draw/ · 팀 나누기 /play/teams/ (2026-11-21)
   참가자: 이름 목록 · 번호 범위 · 초대장 참석 응답(행사 연결 시) — 이름 목록은 이 브라우저에만 저장(ms_play_draw_src)
   추첨 결과는 누르는 순간 crypto 난수로 정하고, 돌아가는 이름은 보여 주기 위한 효과입니다.
   경품 목록은 행사 연결 시 서버 play.draw, 당첨 기록은 이 브라우저(ms_play_draw_hist)에 둡니다. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc, TEAMS = location.pathname.indexOf('/teams') >= 0;
  var SRC = Object.assign({ src: 'names', names: '', from: 1, to: 100 }, K.store.get('ms_play_draw_src', {}) || {});
  var st, view, busy = false;
  var f = function (id) { return K.$('#' + id); };

  // ---------- 참가자 ----------
  function attendees() { var d = K.event.data; return d && d.attendees ? d.attendees.slice() : []; }
  function pool() {
    if (SRC.src === 'range') {
      var a = Math.max(1, Math.min(9999, +SRC.from || 1)), b = Math.max(a, Math.min(9999, +SRC.to || a)), out = [];
      for (var i = a; i <= b && out.length < 5000; i++) out.push(String(i));
      return out;
    }
    if (SRC.src === 'rsvp') return attendees();
    return K.lines(SRC.names, 2000, 30);
  }
  function saveSrc() { K.store.set('ms_play_draw_src', SRC); }
  function srcUi() {
    K.$$('[data-src-pane]').forEach(function (p) { p.hidden = p.dataset.srcPane !== SRC.src; });
    var n = K.lines(SRC.names, 2000, 30).length; K.$('[data-names-count]').textContent = n + '명';
    var info = K.$('[data-rsvp-info]'), a = attendees();
    info.textContent = K.event.data ? (a.length ? '‘참석’으로 응답한 ' + a.length + '명의 이름으로 진행합니다. 새 응답은 페이지를 새로 열면 들어옵니다.' : '아직 ‘참석’으로 응답한 사람이 없습니다.') : '초대장 관리 화면의 ‘스크린 연결’ 주소로 열면 ‘참석’으로 응답한 이름을 불러옵니다.';
  }
  function bindSrc(onChange) {
    f('names').value = SRC.names; f('from').value = SRC.from; f('to').value = SRC.to;
    K.seg(K.$('[data-src-tabs]'), SRC.src, function (v) { SRC.src = v; saveSrc(); srcUi(); onChange(); });
    ['names', 'from', 'to'].forEach(function (id) { f(id).addEventListener('input', function () { SRC[id] = id === 'names' ? f(id).value : +f(id).value; saveSrc(); srcUi(); onChange(); }); });
    srcUi();
  }
  // 이름이 계속 바뀌며 돌다가 멈추는 효과
  function roll(el, names, ms, done) {
    if (K.reduced || names.length < 2) { done(); return; }
    var t0 = performance.now(), last = 0, gap = 45;
    el.classList.add('rolling'); el.classList.remove('win');
    (function step(t) {
      var p = (t - t0) / ms;
      if (p >= 1) { el.classList.remove('rolling'); done(); return; }
      gap = 45 + 320 * p * p;
      if (t - last >= gap) { last = t; el.textContent = names[Math.floor(Math.random() * names.length)]; K.sound.tick(); }
      requestAnimationFrame(step);
    })(t0);
  }

  // =========================== 경품 추첨 ===========================
  if (!TEAMS) {
    var D = { prizes: [] }, hist = K.store.get('ms_play_draw_hist', []) || [], prizeRows, cur = -1, lastWin = null;
    var opt = Object.assign({ each: 1, unique: true }, K.store.get('ms_play_draw_opt', {}) || {});
    var won = function (p) { return hist.filter(function (h) { return h.prize === p; }).length; };
    var left = function (i) { var p = D.prizes[i]; return p ? Math.max(0, p.count - won(p.name)) : Infinity; };
    var remainingPool = function () {
      var all = pool();
      if (!opt.unique) return all;
      var taken = {}; hist.forEach(function (h) { taken[h.name] = (taken[h.name] || 0) + 1; });
      return all.filter(function (n) { if (taken[n]) { taken[n]--; return false; } return true; });
    };
    var pickSelect = K.$('[data-prize-pick]');
    var drawPick = function () {
      var ps = D.prizes.filter(function (p) { return p.name; });
      if (cur >= ps.length || (cur >= 0 && left(cur) <= 0)) cur = -1;
      if (cur < 0) { for (var i = 0; i < ps.length; i++) if (left(i) > 0) { cur = i; break; } }
      pickSelect.innerHTML = ps.map(function (p, i) { return '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + esc(p.name) + ' · 남은 ' + left(i) + '/' + p.count + '</option>'; }).join('') + '<option value="-1"' + (cur < 0 ? ' selected' : '') + '>경품 없이 뽑기</option>';
    };
    var idle = function () {
      var p = D.prizes[cur], rp = remainingPool();
      view.innerHTML = K.brand + '<div class="corner">' + rp.length + '명</div><div class="center">' + (p ? '<div class="dr-prize">' + esc(p.name) + ' · ' + (won(p.name) + 1) + '/' + p.count + '</div>' : '<div class="eyebrow-s">LUCKY DRAW</div>') +
        '<div class="dr-slot" data-slot>' + (lastWin && !p ? esc(lastWin) : '누가 받을까요?') + '</div><div class="dr-left">' + (rp.length ? '참가자 ' + rp.length + '명 가운데' + (opt.each > 1 ? ' ' + opt.each + '명씩' : '') + ' 뽑습니다 · 스페이스바' : '뽑을 사람이 없습니다. 왼쪽에서 참가자를 넣어 주세요.') + '</div></div>';
    };
    var drawHist = function () {
      var box = K.$('[data-hist]');
      if (!hist.length) { box.innerHTML = '<p class="desc" style="margin:0">아직 뽑은 사람이 없습니다.</p>'; return; }
      box.innerHTML = '<ol>' + hist.slice().reverse().map(function (h) { return '<li><b>' + esc(h.name) + '</b><span class="muted">' + esc(h.prize || '경품 없음') + '</span></li>'; }).join('') + '</ol>';
    };
    var go = function () {
      if (busy) return;
      var rp = remainingPool(), p = D.prizes[cur], k = Math.max(1, Math.min(20, opt.each || 1));
      if (p) k = Math.min(k, left(cur));
      if (!rp.length) { K.toast('뽑을 사람이 없습니다.'); K.sound.buzz(); return; }
      k = Math.min(k, rp.length);
      var winners = K.shuffle(rp).slice(0, k), batch = Date.now();   // 결과를 먼저 정합니다
      busy = true;
      var prizeName = p ? p.name : '';
      view.innerHTML = K.brand + '<div class="corner">' + rp.length + '명</div><div class="center">' + (p ? '<div class="dr-prize">' + esc(p.name) + '</div>' : '<div class="eyebrow-s">LUCKY DRAW</div>') + '<div class="dr-slot" data-slot>…</div><div class="dr-left" data-sub>&nbsp;</div></div>';
      var slot = K.$('[data-slot]', view);
      roll(slot, rp, k > 1 ? 1800 : 2600, function () {
        winners.forEach(function (n) { hist.push({ prize: prizeName, name: n, batch: batch }); });
        K.store.set('ms_play_draw_hist', hist);
        if (k === 1) { slot.textContent = winners[0]; slot.classList.add('win'); lastWin = winners[0]; }
        else { slot.outerHTML = '<div class="dr-multi">' + winners.map(function (n, i) { return '<span style="animation-delay:' + (i * 90) + 'ms">' + esc(n) + '</span>'; }).join('') + '</div>'; lastWin = null; }
        K.$('[data-sub]', view).textContent = p ? '축하합니다! · ' + p.name + ' 남은 ' + left(cur) + '명' : '축하합니다!';
        K.sound.done(); K.confetti(st);
        drawPick(); drawHist(); busy = false;
      });
    };
    var undo = function () {
      if (busy || !hist.length) return;
      var b = hist[hist.length - 1].batch, gone = hist.filter(function (h) { return h.batch === b; });
      hist = hist.filter(function (h) { return h.batch !== b; }); K.store.set('ms_play_draw_hist', hist);
      K.toast(gone.map(function (h) { return h.name; }).join(', ') + ' 추첨을 취소했습니다.');
      lastWin = null; drawPick(); drawHist(); idle();
    };
    var onEvent = function () {
      var s = K.setup.get('draw', null); D.prizes = (s && s.prizes && s.prizes.length ? s.prizes : D.prizes).map(function (p) { return { name: p.name, count: p.count }; });
      prizeRows.set(D.prizes.length ? D.prizes : []);
      if (K.event.data && !SRC._picked && attendees().length) { SRC.src = 'rsvp'; K.$('[data-src-tabs] [data-src="rsvp"]').click(); }
      srcUi(); drawPick(); idle();
    };
    st = K.tool(onEvent); view = K.$('[data-view]', st);
    prizeRows = K.rows(K.$('[data-prizes]'), D.prizes, [{ k: 'name', ph: '경품 이름 (예: 3등 커피 쿠폰)', label: '경품' }, { k: 'count', type: 'number', min: 1, max: 50, w: '84px', ph: '인원', label: '인원' }],
      { max: 20, addBtn: K.$('[data-prize-add]'), blank: function () { return { name: '', count: 1 }; }, onChange: function (r) { D.prizes = r.filter(function (p) { return p.name; }).map(function (p) { return { name: String(p.name).trim().slice(0, 30), count: Math.max(1, Math.min(50, +p.count || 1)) }; }); drawPick(); if (!busy) idle(); } });
    bindSrc(function () { SRC._picked = true; if (!busy) idle(); });
    f('d-each').value = opt.each; f('d-unique').checked = opt.unique;
    f('d-each').addEventListener('input', function () { opt.each = Math.max(1, Math.min(20, +f('d-each').value || 1)); K.store.set('ms_play_draw_opt', opt); if (!busy) idle(); });
    f('d-unique').addEventListener('change', function () { opt.unique = f('d-unique').checked; K.store.set('ms_play_draw_opt', opt); if (!busy) idle(); });
    pickSelect.addEventListener('change', function () { cur = +pickSelect.value; if (!busy) idle(); });
    K.$('[data-go]').addEventListener('click', go);
    K.$('[data-save]').addEventListener('click', function () { K.setup.save('draw', { prizes: D.prizes }); });
    K.$('[data-hist-clear]').addEventListener('click', function (e) {
      var b = e.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '한 번 더 누르면 지웁니다'; return; }
      b.dataset.armed = ''; b.textContent = '기록 지우기'; hist = []; K.store.set('ms_play_draw_hist', hist); lastWin = null; drawPick(); drawHist(); idle();
    });
    K.$('[data-hist-copy]').addEventListener('click', function () { if (!hist.length) return K.toast('기록이 없습니다.'); K.copy(hist.map(function (h) { return (h.prize ? h.prize + ' · ' : '') + h.name; }).join('\n'), '당첨 기록을 복사했습니다.'); });
    K.$('[data-hist-csv]').addEventListener('click', function () { if (!hist.length) return K.toast('기록이 없습니다.'); K.download('경품추첨_기록.csv', K.csv([['순서', '경품', '당첨자']].concat(hist.map(function (h, i) { return [i + 1, h.prize, h.name]; }))), 'text/csv;charset=utf-8'); });
    K.keys(st, { Space: go, Enter: go, z: undo });
    var s0 = K.store.get('ms_play_draw', null); if (s0 && s0.prizes) { D.prizes = s0.prizes; prizeRows.set(D.prizes); }
    drawPick(); drawHist(); idle();
    return;
  }

  // =========================== 팀 나누기 ===========================
  var COLORS = ['레드', '블루', '그린', '옐로', '퍼플', '오렌지', '핑크', '민트', '네이비', '브라운', '그레이', '블랙'];
  var TO = Object.assign({ by: 'count', n: 4, style: 'num', names: '', lead: false }, K.store.get('ms_play_teams', {}) || {});
  var result = K.store.get('ms_play_teams_last', null);
  function teamNames(count) {
    var custom = K.lines(TO.names, 40, 16);
    return Array.from({ length: count }, function (_, i) {
      if (TO.style === 'color') return COLORS[i] ? COLORS[i] + ' 팀' : (i + 1) + '팀';
      if (TO.style === 'abc') return i < 26 ? String.fromCharCode(65 + i) + '팀' : (i + 1) + '팀';
      if (TO.style === 'custom' && custom[i]) return custom[i];
      return (i + 1) + '팀';
    });
  }
  function teamCount(n) { var x = Math.max(1, Math.min(40, +TO.n || 2)); return TO.by === 'count' ? Math.min(x, n) : Math.max(1, Math.ceil(n / x)); }
  function hint() {
    var n = pool().length, c = teamCount(n || 1), base = n ? Math.floor(n / c) : 0, extra = n ? n % c : 0;
    K.$('[data-team-hint]').textContent = n ? n + '명 → ' + c + '개 팀, 팀당 ' + base + (extra ? '~' + (base + 1) : '') + '명' : '참가자를 먼저 넣어 주세요.';
  }
  function cols(c) { return c <= 4 ? c : c <= 6 ? 3 : c <= 8 ? 4 : c <= 12 ? (c <= 10 ? 5 : 6) : Math.min(8, Math.ceil(c / 2)); }
  function show(res, animate) {
    if (!res) {
      var n = pool().length;
      view.innerHTML = K.brand + '<div class="center"><div class="eyebrow-s">TEAM MAKER</div><div class="t1">' + (n ? n + '명을 ' + teamCount(n) + '팀으로' : '팀 나누기') + '</div><div class="t2">' + (n ? '스페이스바를 누르면 팀이 정해집니다' : '왼쪽에서 참가자를 넣어 주세요') + '</div></div>';
      return;
    }
    var c = res.teams.length, m = Math.max.apply(null, res.teams.map(function (t) { return t.members.length; })), co = cols(c), rowsN = Math.ceil(c / co);
    var fs = Math.max(1.05, Math.min(3, 24 / (Math.sqrt(Math.max(1, m)) * co) * (rowsN > 2 ? .8 : 1))), total = res.teams.reduce(function (a, t) { return a + t.members.length; }, 0);
    var step = animate && !K.reduced ? Math.min(90, 2600 / Math.max(1, total)) : 0, k = 0;
    // 한 명씩 돌아가며 채운 순서대로 나타나게
    var order = {}; res.teams.forEach(function (t, ti) { t.members.forEach(function (_, mi) { order[ti + ':' + mi] = mi * c + ti; }); });
    view.innerHTML = K.brand + '<div class="corner">' + total + '명 · ' + c + '팀</div><div class="tm-grid" style="--cols:' + co + ';--tm-f:' + fs.toFixed(2) + 'cqw;--tm-h:' + Math.min(3, Math.max(1.8, fs * 1.2)).toFixed(2) + 'cqw;margin-top:3cqh">' +
      res.teams.map(function (t, ti) {
        return '<div class="tm-card"><h4>' + esc(t.name) + '<small>' + t.members.length + '명</small></h4><ul>' + t.members.map(function (mm, mi) {
          return '<li' + (res.lead && mi === 0 ? ' class="lead"' : '') + (step ? ' style="animation-delay:' + Math.round(order[ti + ':' + mi] * step) + 'ms"' : ' style="animation:none"') + '>' + esc(mm) + '</li>';
        }).join('') + '</ul></div>';
      }).join('') + '</div>';
    k = total;
    if (animate) { setTimeout(function () { K.sound.done(); }, Math.min(2800, k * step)); }
  }
  function make() {
    var p = pool(); if (p.length < 2) { K.toast('두 명 이상 넣어 주세요.'); K.sound.buzz(); return; }
    var c = teamCount(p.length), names = teamNames(c), sh = K.shuffle(p);
    var teams = names.map(function (n) { return { name: n, members: [] }; });
    sh.forEach(function (x, i) { teams[i % c].members.push(x); });   // 돌아가며 한 명씩 → 인원 차이 최대 1명
    result = { teams: teams, lead: !!TO.lead, at: Date.now() };
    K.store.set('ms_play_teams_last', result); show(result, true);
  }
  function saveTO() { K.store.set('ms_play_teams', TO); hint(); }
  st = K.tool(function () { if (K.event.data && attendees().length && !SRC._picked) K.$('[data-src-tabs] [data-src="rsvp"]').click(); srcUi(); hint(); if (!result) show(null); });
  view = K.$('[data-view]', st);
  bindSrc(function () { SRC._picked = true; hint(); if (!result) show(null); });
  f('t-by').value = TO.by; f('t-n').value = TO.n; f('t-style').value = TO.style; f('t-names').value = TO.names; f('t-lead').checked = TO.lead; f('t-names').hidden = TO.style !== 'custom';
  f('t-by').addEventListener('change', function () { TO.by = f('t-by').value; saveTO(); });
  f('t-n').addEventListener('input', function () { TO.n = +f('t-n').value || 2; saveTO(); });
  f('t-style').addEventListener('change', function () { TO.style = f('t-style').value; f('t-names').hidden = TO.style !== 'custom'; saveTO(); if (result) { var nm = teamNames(result.teams.length); result.teams.forEach(function (t, i) { t.name = nm[i]; }); show(result, false); } });
  f('t-names').addEventListener('input', function () { TO.names = f('t-names').value; saveTO(); if (result) { var nm = teamNames(result.teams.length); result.teams.forEach(function (t, i) { t.name = nm[i]; }); show(result, false); } });
  f('t-lead').addEventListener('change', function () { TO.lead = f('t-lead').checked; saveTO(); if (result) { result.lead = TO.lead; show(result, false); } });
  K.$('[data-go]').addEventListener('click', make);
  K.$('[data-copy]').addEventListener('click', function () {
    if (!result) return K.toast('먼저 팀을 나눠 주세요.');
    K.copy(result.teams.map(function (t) { return t.name + ' (' + t.members.length + '명): ' + t.members.map(function (m, i) { return result.lead && i === 0 ? m + '(팀장)' : m; }).join(', '); }).join('\n'), '팀 명단을 복사했습니다.');
  });
  K.keys(st, { Space: make, Enter: make, r: make });
  hint(); show(result, false);
})();
