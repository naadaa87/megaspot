/* 빙고 — 참석자 휴대폰 빙고판 /play/bingo/card/?max=&lines=&g= (2026-11-21)
   판은 이 휴대폰에서 crypto 난수로 만들고 서버에 보내지 않습니다. 같은 게임(g)이면 새로고침해도 같은 판.
   ?print=8 이면 종이 빙고판 8장을 인쇄용으로 만듭니다. */
(function () {
  'use strict';
  var K = window.Kit, root = K.$('#bc-root'); if (!root) return;
  var p = new URLSearchParams(location.search);
  var max = [25, 50, 75].indexOf(+p.get('max')) >= 0 ? +p.get('max') : 75, need = Math.max(1, Math.min(5, +p.get('lines') || 1));
  var g = (p.get('g') || 'free').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'free', KEY = 'ms_bingo_card_' + max + '_' + g, print = Math.max(0, Math.min(40, +p.get('print') || 0));
  var LINES = [];
  for (var i = 0; i < 5; i++) { LINES.push([0, 1, 2, 3, 4].map(function (c) { return i * 5 + c; })); LINES.push([0, 1, 2, 3, 4].map(function (r) { return r * 5 + i; })); }
  LINES.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);

  function make() {
    var cells;
    if (max === 75) {
      cells = new Array(25);
      for (var c = 0; c < 5; c++) {
        var col = K.shuffle(Array.from({ length: 15 }, function (_, k) { return c * 15 + k + 1; })).slice(0, 5);
        for (var r = 0; r < 5; r++) cells[r * 5 + c] = col[r];
      }
      cells[12] = 0;   // 가운데 FREE
    } else cells = K.shuffle(Array.from({ length: max }, function (_, k) { return k + 1; })).slice(0, 25);
    return { cells: cells, marks: cells.map(function (n) { return n === 0; }) };
  }
  function gridHtml(card, live) {
    var full = live ? doneLines(card) : { cells: {} };
    return '<div class="bc-grid">' + (max === 75 ? 'BINGO'.split('').map(function (l) { return '<div class="h">' + l + '</div>'; }).join('') : '') +
      card.cells.map(function (n, i) {
        return '<button type="button"' + (live ? ' data-c="' + i + '"' : ' tabindex="-1"') + ' class="' + (n === 0 ? 'free on' : live && card.marks[i] ? 'on' : '') + (full.cells[i] ? ' line' : '') + '" aria-pressed="' + (card.marks[i] ? 'true' : 'false') + '">' + (n === 0 ? 'FREE' : n) + '</button>';
      }).join('') + '</div>';
  }
  function doneLines(card) {
    var n = 0, cells = {};
    LINES.forEach(function (l) { if (l.every(function (i) { return card.marks[i]; })) { n++; l.forEach(function (i) { cells[i] = 1; }); } });
    return { n: n, cells: cells };
  }

  if (print) {
    var cards = Array.from({ length: print }, make);
    root.classList.add('print-mode');
    root.innerHTML = '<div class="bc-head bc-tools" style="margin:0 0 12px"><div><b>종이 빙고판 ' + print + '장</b><small> · ' + (max === 75 ? '1~75 (B·I·N·G·O)' : '1~' + max) + ' · ' + need + '줄 빙고</small></div></div>' +
      '<div class="bc-tools" style="margin:0 0 16px"><button type="button" class="btn btn-primary" data-print>인쇄하기</button><a class="btn btn-light" href="?max=' + max + '&lines=' + need + '&print=' + print + '">다른 판으로 다시 만들기</a></div>' +
      '<div class="bc-print">' + cards.map(function (c, i) { return '<div class="bc-sheet"><div class="bc-head"><b>MEGASPOT BINGO</b><small>No. ' + (i + 1) + '</small></div>' + gridHtml(c, false) + '</div>'; }).join('') + '</div>';
    K.$('[data-print]', root).addEventListener('click', function () { window.print(); });
    return;
  }

  var card = K.store.get(KEY, null);
  if (!card || !Array.isArray(card.cells) || card.cells.length !== 25) { card = make(); K.store.set(KEY, card); }
  var lastN = doneLines(card).n;
  function render() {
    var d = doneLines(card), bingo = d.n >= need;
    root.innerHTML = '<div class="bc-head"><div><b>내 빙고판</b><br><small>' + (max === 75 ? '1~75' : '1~' + max) + ' · ' + need + '줄이면 빙고</small></div><span class="kit-tag">' + d.n + '줄</span></div>' +
      '<div class="bc-bingo' + (bingo ? ' on' : '') + '" role="status">BINGO! 손을 들고 외쳐 주세요</div>' + gridHtml(card, true) +
      '<p class="hint" style="margin:12px 0 0">스크린에 나온 번호를 눌러 표시하세요. 잘못 눌렀다면 한 번 더 누르면 지워집니다.</p>' +
      '<div class="bc-tools"><button type="button" class="btn btn-light" data-clear>표시 모두 지우기</button><button type="button" class="btn btn-light" data-new>새 빙고판</button></div>' +
      '<p class="inv-foot">메가스팟 플레이 · <a href="/play/">다른 진행 도구 보기</a></p>';
    if (d.n > lastN && bingo && navigator.vibrate) { try { navigator.vibrate([120, 60, 120]); } catch (e) {} }
    lastN = d.n;
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]');
    if (b) { var i = +b.dataset.c; if (card.cells[i] === 0) return; card.marks[i] = !card.marks[i]; K.store.set(KEY, card); render(); return; }
    var t = e.target.closest('[data-clear],[data-new]'); if (!t) return;
    if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = '한 번 더 누르면 ' + (t.hasAttribute('data-new') ? '새 판' : '지웁니다'); return; }
    if (t.hasAttribute('data-new')) card = make(); else card.marks = card.cells.map(function (n) { return n === 0; });
    K.store.set(KEY, card); render();
  });
  render();
})();
