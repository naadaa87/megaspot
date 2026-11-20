/* 빙고 — 스크린 /play/bingo/ (2026-11-21)
   번호를 crypto 난수로 하나씩 뽑아 크게 보여 주고 판에 표시합니다.
   참석자 빙고판은 QR로 여는 /play/bingo/card/ 에서 휴대폰마다 따로 만들어집니다(게임 번호 g가 바뀌면 새 판).
   진행 중인 게임(뽑은 번호)은 이 브라우저(ms_play_bingo_game)에 두어 새로고침해도 이어집니다. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc, LET = 'BINGO';
  var G = Object.assign({ max: 75, lines: 1, drawn: [], g: K.token(6) }, K.store.get('ms_play_bingo_game', {}) || {});
  var st, view, busy = false, setMax;
  var save = function () { K.store.set('ms_play_bingo_game', G); };
  var letter = function (n) { return G.max === 75 ? LET[Math.floor((n - 1) / 15)] : ''; };
  var cardUrl = function (print) { return '/play/bingo/card/?max=' + G.max + '&lines=' + G.lines + '&g=' + G.g + (print ? '&print=8' : ''); };

  function boardHtml() {
    var cols = G.max === 75 ? 15 : G.max === 50 ? 10 : 5, last = G.drawn[G.drawn.length - 1], on = {};
    G.drawn.forEach(function (n) { on[n] = 1; });
    var cells = ''; for (var n = 1; n <= G.max; n++) cells += '<span class="' + (on[n] ? 'on' : '') + (n === last ? ' last' : '') + '">' + n + '</span>';
    var w = G.max === 25 ? 'width:min(100%,64cqh);justify-self:center' : '';
    return '<div class="bg-board" style="--bc:' + cols + ';--bf:' + (G.max === 75 ? 1.45 : G.max === 50 ? 2 : 3.2) + 'cqw;' + w + '">' + cells + '</div>';
  }
  function draw(rolling) {
    var last = G.drawn[G.drawn.length - 1];
    view.innerHTML = K.brand + '<div class="corner">' + G.drawn.length + ' / ' + G.max + '</div><div class="bg-layout" style="margin-top:2cqh"><div class="bg-left">' +
      '<div class="bg-col" data-col>' + (G.max === 75 ? LET.split('').map(function (l) { return '<span' + (last && letter(last) === l ? ' class="on"' : '') + '>' + l + '</span>'; }).join('') : 'NUMBER') + '</div><div class="bg-cur' + (rolling ? ' roll' : '') + '" data-cur>' + (last || '–') + '</div>' +
      '<div class="bg-recent">' + G.drawn.slice(-6, -1).reverse().map(function (n) { return '<span>' + (letter(n) ? letter(n) + '-' : '') + n + '</span>'; }).join('') + '</div>' +
      '<div style="display:flex;gap:1.4cqw;align-items:center;margin-top:2cqh"><div class="qrbox" data-qrbox style="width:11cqw;height:11cqw"></div><div class="qrcap" style="text-align:left;max-width:14cqw">휴대폰 빙고판<br>' + G.lines + '줄이면 빙고!</div></div>' +
      '</div>' + boardHtml() + '</div>';
    K.qr(K.$('[data-qrbox]', view), cardUrl(), { label: '빙고판 QR 코드' });
  }
  function side() {
    K.qr(K.$('[data-card-qr]'), cardUrl(), { label: '빙고판 QR 코드' });
    K.$('[data-card-link]').href = cardUrl(); K.$('[data-print-link]').href = cardUrl(true);
  }
  function go() {
    if (busy) return;
    var on = {}; G.drawn.forEach(function (n) { on[n] = 1; });
    var left = []; for (var n = 1; n <= G.max; n++) if (!on[n]) left.push(n);
    if (!left.length) { K.toast('모든 번호를 뽑았습니다.'); return; }
    var pick = left[K.rand(left.length)];   // 먼저 정하고 돌리는 효과만 보여 줍니다
    busy = true; draw(true);
    var cur = K.$('[data-cur]', view), t0 = performance.now(), lastT = 0;
    var finish = function () { G.drawn.push(pick); save(); draw(false); K.sound.beep(1175, .18, 'triangle', .16); busy = false; };
    if (K.reduced) return finish();
    (function step(t) {
      var p = (t - t0) / 1300;
      if (p >= 1) return finish();
      if (t - lastT > 40 + 200 * p * p) { lastT = t; cur.textContent = left[Math.floor(Math.random() * left.length)]; K.sound.tick(); }
      requestAnimationFrame(step);
    })(t0);
  }
  function undo() { if (busy || !G.drawn.length) return; var n = G.drawn.pop(); save(); draw(false); K.toast(n + '번을 취소했습니다.'); }
  function reset(btn) {
    if (btn && btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = '한 번 더 누르면 새 게임'; return; }
    if (btn) { btn.dataset.armed = ''; btn.textContent = '새 게임'; }
    G.drawn = []; G.g = K.token(6); save(); side(); draw(false); K.toast('새 게임을 시작합니다. 참석자는 QR을 다시 찍으면 새 빙고판이 열립니다.');
  }
  function setGame(max, lines, keepDrawn) {
    var changed = max !== G.max;
    G.max = max; G.lines = lines;
    if (changed && !keepDrawn) { G.drawn = []; G.g = K.token(6); }
    save(); if (setMax) setMax(String(G.max)); K.$('#b-lines').value = G.lines; side(); draw(false);
  }
  st = K.tool(function () { var s = K.setup.get('bingo', null); if (s && !G.drawn.length) setGame(s.max || 75, s.lines || 1); });
  view = K.$('[data-view]', st);
  setMax = K.seg(K.$('[data-max]'), String(G.max), function (v) {
    if (G.drawn.length && +v !== G.max) { K.toast('뽑은 번호가 있어 범위를 바꾸면 새 게임이 됩니다.'); }
    setGame(+v, G.lines);
  });
  K.$('#b-lines').value = G.lines;
  K.$('#b-lines').addEventListener('change', function () { G.lines = +K.$('#b-lines').value || 1; save(); side(); draw(false); });
  K.$('[data-go]').addEventListener('click', go);
  K.$('[data-undo]').addEventListener('click', undo);
  K.$('[data-reset]').addEventListener('click', function (e) { reset(e.currentTarget); });
  K.$('[data-save]').addEventListener('click', function () { K.setup.save('bingo', { max: G.max, lines: G.lines }); });
  K.keys(st, { Space: go, Enter: go, z: undo });
  save(); side(); draw(false);
})();
