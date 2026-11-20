/* 팀 대항 퀴즈 /play/quiz/ (2026-11-21)
   진행: 시작 화면 → [문제 → 타이머 → 정답] × n → 최종 순위. 스페이스바 한 번에 한 단계씩.
   문제·팀은 행사 연결 시 서버 play.quiz, 아니면 ms_play_quiz. 점수는 이 브라우저(ms_play_quiz_score)에만 둡니다. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc;
  var TYPES = { choice: '객관식', ox: 'OX', initial: '초성', open: '주관식' };
  // 기본 문제 — 답이 하나로 정해지는 문제만 골랐습니다
  var PACKS = {
    '상식 워밍업': [
      { type: 'choice', q: '태양계에서 가장 큰 행성은?', options: ['수성', '금성', '목성', '토성'], answer: 2 },
      { type: 'ox', q: '거미는 곤충이다.', answer: 'X', note: '거미는 다리가 8개인 거미류로, 곤충(다리 6개)이 아닙니다.' },
      { type: 'choice', q: '1기압에서 물이 끓는 온도는 섭씨 몇 도일까요?', options: ['90도', '100도', '110도', '120도'], answer: 1 },
      { type: 'ox', q: '지구에서 가장 넓은 바다는 대서양이다.', answer: 'X', note: '가장 넓은 바다는 태평양입니다.' },
      { type: 'choice', q: '축구 경기에서 한 팀이 경기장에 내보내는 선수는 몇 명일까요?', options: ['9명', '10명', '11명', '12명'], answer: 2 },
      { type: 'initial', q: 'ㄱㅇㅂㅇㅂ', hint: '손으로 하는 놀이', answer: '가위바위보' },
      { type: 'choice', q: '올림픽 오륜기의 고리는 몇 개일까요?', options: ['4개', '5개', '6개', '7개'], answer: 1 },
      { type: 'choice', q: '2월이 29일까지 있는 해를 무엇이라고 할까요?', options: ['평년', '윤년', '윤달', '학년'], answer: 1 },
      { type: 'ox', q: '한글을 만든 임금은 세종대왕이다.', answer: 'O' },
      { type: 'open', q: '세계에서 가장 높은 산의 이름은?', answer: '에베레스트' }
    ],
    '연말·새해': [
      { type: 'ox', q: '크리스마스는 매년 12월 25일이다.', answer: 'O' },
      { type: 'choice', q: '설날 아침에 먹는 대표 음식은?', options: ['떡국', '송편', '팥죽', '냉면'], answer: 0 },
      { type: 'choice', q: '동지에 먹는 음식으로 알려진 것은?', options: ['떡국', '송편', '팥죽', '오곡밥'], answer: 2 },
      { type: 'choice', q: '다가오는 2027년(정미년)은 무슨 띠의 해일까요?', options: ['말', '양', '원숭이', '닭'], answer: 1 },
      { type: 'initial', q: 'ㅋㄹㅅㅁㅅ', hint: '12월 25일', answer: '크리스마스' },
      { type: 'ox', q: '12월 31일 밤 서울 보신각에서는 제야의 종을 33번 친다.', answer: 'O' },
      { type: 'choice', q: '‘송구영신’의 뜻으로 알맞은 것은?', options: ['묵은해를 보내고 새해를 맞음', '송년회를 크게 엶', '해가 지고 달이 뜸', '친구를 배웅함'], answer: 0 },
      { type: 'initial', q: 'ㅅㄴㅎ', hint: '한 해를 보내며 여는 모임', answer: '송년회' },
      { type: 'choice', q: '2026년 병오년은 무슨 띠의 해였을까요?', options: ['호랑이', '용', '말', '양'], answer: 2 }
    ],
    '넌센스': [
      { type: 'open', q: '세상에서 가장 뜨거운 과일은?', answer: '천도복숭아', note: '천 도(1000℃)라서' },
      { type: 'open', q: '세상에서 가장 쉬운 숫자는?', answer: '190,000', note: '십구만 → 쉽구만' },
      { type: 'open', q: '왕이 넘어지면?', answer: '킹콩' },
      { type: 'open', q: '도둑이 가장 좋아하는 아이스크림은?', answer: '보석바' },
      { type: 'open', q: '소가 웃는 소리는?', answer: '우하하' },
      { type: 'open', q: '세상에서 가장 빠른 닭은?', answer: '후다닥' },
      { type: 'open', q: '자동차를 톡 치면?', answer: '카톡' },
      { type: 'open', q: '개가 사람을 가르치면?', answer: '개인지도' }
    ]
  };
  var DEF = { title: '', points: 10, time: 15, teams: ['1팀', '2팀', '3팀', '4팀'], questions: [] };
  var Q = Object.assign({}, DEF), score = K.store.get('ms_play_quiz_score', {}) || {};
  var idx = -1, phase = 'intro', timer = { left: 0, end: 0, run: false }, st, view;
  var f = function (id) { return K.$('#' + id); };

  function blank(type) { var o = { type: type || 'choice', q: '', time: 0, hint: '', note: '' }; if (o.type === 'choice') { o.options = ['', '', '', '']; o.answer = 0; } else if (o.type === 'ox') o.answer = 'O'; else o.answer = ''; return o; }
  function teams() { return Q.teams.length ? Q.teams : []; }
  function qTime(q) { return q.time || Q.time || 15; }
  function saveScore() { K.store.set('ms_play_quiz_score', score); }

  // ---------- 왼쪽 편집 ----------
  function drawScore() {
    K.$('[data-score]').innerHTML = teams().length ? teams().map(function (t, i) {
      return '<div class="tm">' + (i < 9 ? '<small class="muted">' + (i + 1) + '</small>' : '') + esc(t) + ' <b>' + (score[t] || 0) + '</b><button type="button" data-sc="' + i + '" data-d="-1" aria-label="' + esc(t) + ' 점수 빼기">−</button><button type="button" class="plus" data-sc="' + i + '" data-d="1" aria-label="' + esc(t) + ' 점수 더하기">+</button></div>';
    }).join('') + '<button type="button" class="btn btn-ghost btn-sm" data-sc-reset>점수 0으로</button>' : '<span class="hint">팀을 적으면 점수판이 생깁니다.</span>';
  }
  function drawList() {
    K.$('[data-qcount]').textContent = Q.questions.length + ' / 50';
    K.$('[data-qlist]').innerHTML = Q.questions.length ? Q.questions.map(function (q, i) {
      var h = '<div class="qz-item' + (i === idx ? ' cur' : '') + '" data-i="' + i + '"><div class="hd"><b>Q' + (i + 1) + '</b><select class="select" data-k="type" aria-label="문제 ' + (i + 1) + ' 형식">' +
        Object.keys(TYPES).map(function (t) { return '<option value="' + t + '"' + (q.type === t ? ' selected' : '') + '>' + TYPES[t] + '</option>'; }).join('') + '</select><span class="sp"></span>' +
        '<button type="button" class="btn btn-light btn-sm" data-jump>여기서 진행</button><button type="button" class="kit-x" data-del aria-label="문제 ' + (i + 1) + ' 지우기">×</button></div>';
      h += '<input class="input" data-k="q" maxlength="160" placeholder="' + (q.type === 'initial' ? '초성 (예: ㅂㄱ)' : '문제') + '" value="' + esc(q.q) + '" aria-label="문제 ' + (i + 1) + '">';
      if (q.type === 'choice') h += '<div class="opts">' + [0, 1, 2, 3].map(function (o) { return '<label><input type="radio" name="ans' + i + '" data-k="answer" value="' + o + '"' + (q.answer === o ? ' checked' : '') + ' aria-label="' + (o + 1) + '번 정답"><input class="input" data-o="' + o + '" maxlength="40" placeholder="' + (o + 1) + '번 보기" value="' + esc((q.options || [])[o] || '') + '"></label>'; }).join('') + '</div>';
      else if (q.type === 'ox') h += '<div class="kit-row"><span class="hint">정답</span><select class="select" data-k="answer" style="width:auto"><option' + (q.answer === 'O' ? ' selected' : '') + '>O</option><option' + (q.answer === 'X' ? ' selected' : '') + '>X</option></select></div>';
      else h += '<input class="input" data-k="answer" maxlength="40" placeholder="정답" value="' + esc(q.answer || '') + '" aria-label="문제 ' + (i + 1) + ' 정답">';
      h += '<div class="kit-row">' + (q.type === 'initial' ? '<input class="input grow" data-k="hint" maxlength="60" placeholder="힌트 (선택)" value="' + esc(q.hint || '') + '">' : '') +
        '<input class="input grow" data-k="note" maxlength="120" placeholder="정답 뒤 한 줄 설명 (선택)" value="' + esc(q.note || '') + '"><input class="input" data-k="time" type="number" min="0" max="120" style="width:96px" placeholder="초" value="' + (q.time || '') + '" aria-label="이 문제 제한 시간"></div>';
      return h + '</div>';
    }).join('') : '<div class="empty small">아직 문제가 없습니다. 위에서 기본 문제를 불러오거나 ‘+ 문제’를 눌러 주세요.</div>';
  }
  function readTop() {
    Q.title = f('q-title').value.trim(); Q.time = Math.max(5, Math.min(120, +f('q-time').value || 15)); Q.points = Math.max(1, Math.min(1000, +f('q-points').value || 10));
    Q.teams = K.lines(f('q-teams').value, 12, 16);
  }
  function fill() {
    f('q-title').value = Q.title; f('q-time').value = Q.time; f('q-points').value = Q.points; f('q-teams').value = Q.teams.join('\n');
    drawScore(); drawList();
  }

  // ---------- 스크린 ----------
  function board() { return teams().length ? '<div class="qz-board">' + teams().map(function (t) { return '<span>' + esc(t) + '<b>' + (score[t] || 0) + '</b></span>'; }).join('') + '</div>' : ''; }
  function draw() {
    var q = Q.questions[idx];
    if (phase === 'intro' || !q && phase !== 'final') {
      view.innerHTML = K.brand + '<div class="center"><div class="eyebrow-s">TEAM QUIZ</div><div class="t1">' + esc(Q.title || '팀 대항 퀴즈') + '</div><div class="t2">' + (Q.questions.length ? '모두 ' + Q.questions.length + '문제 · 정답 ' + Q.points + '점' : '왼쪽에서 문제를 준비해 주세요') + '</div></div>' + '<div class="foot" style="justify-content:center">' + board() + '</div>';
      return;
    }
    if (phase === 'final') {
      var rank = teams().map(function (t) { return { t: t, s: score[t] || 0 }; }).sort(function (a, b) { return b.s - a.s; });
      var place = 0, prev = null;
      view.innerHTML = K.brand + '<div class="center"><div class="eyebrow-s">FINAL</div><div class="t1" style="font-size:4.4cqw">' + esc(Q.title || '최종 순위') + '</div><div class="qz-rank">' + rank.map(function (r, i) {
        if (r.s !== prev) place = i + 1; prev = r.s;
        return '<div style="animation-delay:' + ((rank.length - 1 - i) * 350) + 'ms"><i>' + place + '</i><span>' + esc(r.t) + '</span><em>' + r.s + '</em></div>';
      }).join('') + '</div></div>';
      return;
    }
    var reveal = phase === 'reveal', h = K.brand + '<div class="qz-top" style="margin-top:1cqh"><span class="qz-no">Q' + (idx + 1) + ' / ' + Q.questions.length + ' · ' + TYPES[q.type] + '</span><span class="qz-timer" data-timer></span></div><div class="center">';
    if (q.type === 'initial') h += '<div class="qz-q" style="font-size:11cqw;letter-spacing:.08em">' + esc(q.q) + '</div>' + (q.hint ? '<div class="qz-hint">힌트 · ' + esc(q.hint) + '</div>' : '');
    else h += '<div class="qz-q">' + K.nl(q.q) + '</div>';
    if (q.type === 'choice') h += '<div class="qz-opts">' + (q.options || []).map(function (o, i) { return o ? '<div class="' + (reveal ? (i === q.answer ? 'right' : 'dim') : '') + '"><i>' + (i + 1) + '</i>' + esc(o) + '</div>' : ''; }).join('') + '</div>';
    else if (q.type === 'ox') h += '<div class="qz-ox"><div class="' + (reveal ? (q.answer === 'O' ? 'right' : 'dim') : '') + '">O</div><div class="' + (reveal ? (q.answer === 'X' ? 'right' : 'dim') : '') + '">X</div></div>';
    else h += '<div class="qz-ans' + (reveal ? '' : ' hide') + '">' + esc(q.answer || '') + '</div>';
    if (reveal && q.note) h += '<div class="qz-note">' + esc(q.note) + '</div>';
    h += '</div><div class="foot" style="justify-content:center">' + board() + '</div>';
    view.innerHTML = h; tickTimer();
  }
  function tickTimer() {
    var el = K.$('[data-timer]', view); if (!el) return;
    var q = Q.questions[idx]; if (!q) return;
    var left = phase === 'run' ? (timer.run ? (timer.end - Date.now()) / 1000 : timer.left) : phase === 'q' ? qTime(q) : 0;
    if (phase === 'run' && timer.run && left <= 0) { timer.run = false; phase = 'end'; K.sound.buzz(); left = 0; }
    var s = Math.max(0, Math.ceil(left));
    el.textContent = phase === 'reveal' ? '정답' : phase === 'end' ? '시간 끝' : s;
    el.classList.toggle('low', phase === 'run' && s <= 5);
    if (phase === 'run' && timer.run && s <= 5 && s !== timer.lastBeep) { timer.lastBeep = s; if (s > 0) K.sound.tick(); }
  }
  function next() {
    if (!Q.questions.length) { K.toast('먼저 문제를 넣어 주세요.'); return; }
    if (phase === 'intro') { idx = 0; phase = 'q'; }
    else if (phase === 'q') { phase = 'run'; timer.left = qTime(Q.questions[idx]); timer.end = Date.now() + timer.left * 1000; timer.run = true; timer.lastBeep = null; }
    else if (phase === 'run' || phase === 'end') { timer.run = false; phase = 'reveal'; K.sound.done(); }
    else if (phase === 'reveal') { if (idx < Q.questions.length - 1) { idx++; phase = 'q'; } else { phase = 'final'; K.sound.done(); setTimeout(function () { K.confetti(st); }, 300); } }
    else if (phase === 'final') return;
    draw(); drawList(); label();
  }
  function prev() { if (phase === 'final') { phase = 'reveal'; } else if (idx > 0) { idx--; phase = 'q'; } else { idx = -1; phase = 'intro'; } timer.run = false; draw(); drawList(); label(); }
  function label() { K.$('[data-next]').textContent = phase === 'intro' ? '시작' : phase === 'q' ? '타이머 시작' : phase === 'run' || phase === 'end' ? '정답 보기' : phase === 'reveal' ? (idx < Q.questions.length - 1 ? '다음 문제' : '최종 순위') : '끝'; }
  function toggleTimer() { if (phase !== 'run') return; if (timer.run) { timer.left = Math.max(0, (timer.end - Date.now()) / 1000); timer.run = false; } else { timer.end = Date.now() + timer.left * 1000; timer.run = true; } tickTimer(); }
  function add(i, d) { var t = teams()[i]; if (!t) return; score[t] = (score[t] || 0) + d * Q.points; saveScore(); drawScore(); var b = K.$('.qz-board', view); if (b) b.outerHTML = board(); if (d > 0) K.sound.beep(988, .12, 'triangle', .12); }

  function onEvent() {
    var s = K.setup.get('quiz', null);
    if (s && (s.questions || []).length) Q = Object.assign({}, DEF, s); else if (s && s.title) Q = Object.assign({}, DEF, s, { teams: s.teams && s.teams.length ? s.teams : DEF.teams });
    if (!Q.teams.length) Q.teams = DEF.teams.slice();
    idx = -1; phase = 'intro'; fill(); draw(); label();
  }

  // ---------- 시작 ----------
  st = K.tool(onEvent); view = K.$('[data-view]', st);
  K.$('[data-packs]').innerHTML = Object.keys(PACKS).map(function (k) { return '<button type="button" class="chip" data-pack="' + esc(k) + '">' + esc(k) + ' <span class="n">' + PACKS[k].length + '</span></button>'; }).join('');
  var setupEl = K.$('.kit-setup');
  setupEl.addEventListener('input', function (e) {
    var t = e.target, item = t.closest('[data-i]');
    if (!item) { readTop(); drawScore(); if (phase === 'intro' || phase === 'final') draw(); else { var b = K.$('.qz-board', view); if (b) b.outerHTML = board(); } return; }
    var q = Q.questions[+item.dataset.i];
    if (t.dataset.o != null) { q.options = q.options || ['', '', '', '']; q.options[+t.dataset.o] = t.value; }
    else if (t.dataset.k === 'time') q.time = Math.max(0, Math.min(120, +t.value || 0));
    else if (t.dataset.k && t.dataset.k !== 'type' && t.type !== 'radio') q[t.dataset.k] = t.value;
    if (+item.dataset.i === idx) draw();
  });
  setupEl.addEventListener('change', function (e) {
    var t = e.target, item = t.closest('[data-i]'); if (!item) return;
    var i = +item.dataset.i, q = Q.questions[i];
    if (t.dataset.k === 'type') { var n = blank(t.value); n.q = q.q; n.note = q.note; n.time = q.time; Q.questions[i] = n; drawList(); }
    else if (t.dataset.k === 'answer') q.answer = q.type === 'choice' ? +t.value : t.value;
    if (i === idx) draw();
  });
  setupEl.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-pack]'))) {
      var add2 = PACKS[b.dataset.pack].map(function (x) { return JSON.parse(JSON.stringify(Object.assign(blank(x.type), x))); });
      var room = 50 - Q.questions.length; if (room <= 0) { K.toast('문제는 50개까지 넣을 수 있습니다.'); return; }
      Q.questions = Q.questions.concat(add2.slice(0, room)); drawList(); if (phase === 'intro') draw();
      K.toast(Math.min(room, add2.length) + '문제를 불러왔습니다. 저장을 눌러 두세요.'); return;
    }
    if (t.closest('[data-q-add]')) { if (Q.questions.length >= 50) return K.toast('문제는 50개까지 넣을 수 있습니다.'); Q.questions.push(blank('choice')); drawList(); var l = K.$$('.qz-item').pop(); if (l) { l.scrollIntoView({ block: 'nearest' }); l.querySelector('[data-k=q]').focus(); } return; }
    if ((b = t.closest('[data-del]'))) { var i = +b.closest('[data-i]').dataset.i; Q.questions.splice(i, 1); if (idx >= Q.questions.length) { idx = Q.questions.length - 1; } if (idx < 0) phase = 'intro'; drawList(); draw(); label(); return; }
    if ((b = t.closest('[data-jump]'))) { idx = +b.closest('[data-i]').dataset.i; phase = 'q'; timer.run = false; draw(); drawList(); label(); return; }
    if ((b = t.closest('[data-sc]'))) { add(+b.dataset.sc, +b.dataset.d); return; }
    if (t.closest('[data-sc-reset]')) { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = '한 번 더 누르면 0점'; return; } score = {}; saveScore(); drawScore(); draw(); return; }
    if (t.closest('[data-save]')) {
      readTop();
      var clean = Q.questions.filter(function (q) { return (q.q || '').trim(); });
      K.setup.save('quiz', { title: Q.title, points: Q.points, time: Q.time, teams: Q.teams, questions: clean });
    }
  });
  K.$('[data-next]').addEventListener('click', next);
  K.$('[data-prev]').addEventListener('click', prev);
  K.$('[data-final]').addEventListener('click', function () { phase = 'final'; timer.run = false; draw(); label(); K.sound.done(); setTimeout(function () { K.confetti(st); }, 300); });
  K.keys(st, { Space: next, ArrowRight: next, ArrowLeft: prev, t: toggleTimer });
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    var m = /^Digit([1-9])$/.exec(e.code || ''); if (!m) return;
    e.preventDefault(); add(+m[1] - 1, e.shiftKey ? -1 : 1);
  });
  setInterval(tickTimer, 200);
  var local = K.store.get('ms_play_quiz', null);
  if (local) Q = Object.assign({}, DEF, local);
  fill(); draw(); label();
})();
