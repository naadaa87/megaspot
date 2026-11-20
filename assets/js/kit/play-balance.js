/* 밸런스 게임 /play/balance/ (2026-11-21)
   질문 ‘A / B’를 크게 띄우고 고민 시간 타이머 → 손 들기 → 많은 쪽 표시.
   질문 목록은 행사 연결 시 서버 play.balance, 아니면 ms_play_balance. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc;
  var BASE = ['평생 여름만 / 평생 겨울만', '짜장면 / 짬뽕', '탕수육 부어 먹기 / 찍어 먹기', '산 / 바다', '아침형 인간 / 저녁형 인간', '고양이 / 강아지',
    '여행은 계획대로 / 발길 닿는 대로', '영화관에서 보기 / 집에서 보기', '매운 음식 / 단 음식', '투명 인간 되기 / 하늘 날기', '과거로 가기 / 미래로 가기',
    '혼자 하는 여행 / 여럿이 하는 여행', '치킨 / 피자', '노래방에서 노래하기 / 탬버린 치기', '엘리베이터 / 계단', '민트초코 좋아 / 민트초코 싫어',
    '아이스 아메리카노 / 따뜻한 아메리카노', '연락 자주 하는 친구 / 뜸해도 만나면 편한 친구', '일주일 휴가 지금 / 한 달 휴가 1년 뒤', '회식은 고기 / 회식은 회',
    '먼저 말 걸기 / 말 걸어 주길 기다리기', '버스 / 지하철', '평생 라면 끊기 / 평생 치킨 끊기', '알람 한 번에 일어나기 / 다섯 번 끄고 일어나기',
    '사진 찍는 사람 / 사진 찍히는 사람', '깻잎 떼어 주기 / 안 떼어 주기', '무인도에 칼 / 무인도에 라이터', '카톡 길게 / 전화 짧게', '여름휴가 / 겨울휴가', '물냉면 / 비빔냉면'];
  var parse = function (txt) { return K.lines(txt, 60, 90).map(function (l) { var m = l.split(/\s*(?:\/|vs\.?|VS)\s*/); return m.length >= 2 && m[0] && m[1] ? { a: m[0].slice(0, 40), b: m.slice(1).join(' / ').slice(0, 40) } : null; }).filter(Boolean); };
  var B = { time: 10, items: parse(BASE.join('\n')) }, idx = 0, win = '', tally = null, timer = { end: 0, run: false, done: false }, st, view;
  var f = function (id) { return K.$('#' + id); };
  var text = function () { return B.items.map(function (x) { return x.a + ' / ' + x.b; }).join('\n'); };

  function draw() {
    var it = B.items[idx];
    if (!it) { view.innerHTML = K.brand + '<div class="center"><div class="t1">질문을 넣어 주세요</div><div class="t2">한 줄에 ‘A / B’ 모양으로 적으면 됩니다</div></div>'; return; }
    view.innerHTML = K.brand + '<div class="corner">' + (idx + 1) + ' / ' + B.items.length + '</div>' +
      '<div class="center" style="flex:0 0 auto;margin-top:3cqh"><div class="eyebrow-s">BALANCE GAME · 둘 중 하나만 고르세요</div></div>' +
      '<div class="bl-vs"><div class="bl-side a' + (win === 'a' ? ' win' : win === 'b' ? ' lose' : '') + '"><small>A</small>' + esc(it.a) + (tally ? '<span class="cnt">' + tally.a + '</span>' : '') + '</div>' +
      '<div class="bl-mid"><b>VS</b><span class="qz-timer" data-timer></span></div>' +
      '<div class="bl-side b' + (win === 'b' ? ' win' : win === 'a' ? ' lose' : '') + '"><small>B</small>' + esc(it.b) + (tally ? '<span class="cnt">' + tally.b + '</span>' : '') + '</div></div>';
    tick();
  }
  function tick() {
    var el = K.$('[data-timer]', view); if (!el) return;
    if (!timer.run) { el.textContent = timer.done ? '손!' : ''; return; }
    var s = Math.ceil((timer.end - Date.now()) / 1000);
    if (s <= 0) { timer.run = false; timer.done = true; el.textContent = '손!'; K.sound.done(); K.$('[data-go]').textContent = '타이머 시작'; return; }
    el.textContent = s; if (s <= 3 && s !== timer.beep) { timer.beep = s; K.sound.tick(); }
  }
  function go() {
    if (timer.run) { timer.run = false; timer.done = false; K.$('[data-go]').textContent = '타이머 시작'; tick(); return; }
    timer.end = Date.now() + B.time * 1000; timer.run = true; timer.done = false; timer.beep = null; K.$('[data-go]').textContent = '타이머 멈춤'; tick();
  }
  function move(d) { if (!B.items.length) return; idx = (idx + d + B.items.length) % B.items.length; win = ''; tally = null; timer.run = false; timer.done = false; K.$('[data-go]').textContent = '타이머 시작'; f('bl-a').value = ''; f('bl-b').value = ''; draw(); }
  function mark(w) { win = win === w ? '' : w; if (win) K.sound.beep(win === 'a' ? 784 : 659, .2, 'triangle', .14); draw(); }

  function onEvent() { var s = K.setup.get('balance', null); if (s && s.items && s.items.length) { B = { time: s.time || 10, items: s.items }; } f('bl-time').value = B.time; f('bl-items').value = text(); count(); idx = 0; draw(); }
  function count() { K.$('[data-bl-count]').textContent = B.items.length + '개 질문 (최대 60개)'; }
  st = K.tool(onEvent); view = K.$('[data-view]', st);
  var local = K.store.get('ms_play_balance', null); if (local && local.items && local.items.length) B = { time: local.time || 10, items: local.items };
  f('bl-time').value = B.time; f('bl-items').value = text(); count();
  f('bl-time').addEventListener('input', function () { B.time = Math.max(3, Math.min(60, +f('bl-time').value || 10)); });
  f('bl-items').addEventListener('input', function () { B.items = parse(f('bl-items').value); if (idx >= B.items.length) idx = 0; count(); draw(); });
  K.$('[data-tally]').addEventListener('click', function () { var a = Math.max(0, +f('bl-a').value || 0), b = Math.max(0, +f('bl-b').value || 0); tally = { a: a, b: b }; win = a === b ? '' : a > b ? 'a' : 'b'; draw(); });
  K.$('[data-default]').addEventListener('click', function () { B.items = parse(BASE.join('\n')); f('bl-items').value = text(); idx = 0; count(); draw(); });
  K.$('[data-save]').addEventListener('click', function () { K.setup.save('balance', { time: B.time, items: B.items }); });
  K.$('[data-go]').addEventListener('click', go);
  K.$('[data-next]').addEventListener('click', function () { move(1); });
  K.$('[data-prev]').addEventListener('click', function () { move(-1); });
  K.$('[data-shuffle]').addEventListener('click', function () { B.items = K.shuffle(B.items); f('bl-items').value = text(); idx = 0; win = ''; tally = null; draw(); K.toast('질문 순서를 섞었습니다.'); });
  K.keys(st, { Space: go, ArrowRight: function () { move(1); }, ArrowLeft: function () { move(-1); }, a: function () { mark('a'); }, b: function () { mark('b'); } });
  setInterval(tick, 200);
  draw();
})();
