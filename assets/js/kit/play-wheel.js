/* 돌림판 /play/wheel/ (2026-11-21)
   멈출 칸을 crypto 난수로 먼저 정한 뒤, 그 칸이 오른쪽 바늘에 오도록 4~5초 감속하며 돌립니다.
   항목은 행사 연결 시 서버 play.wheel, 아니면 ms_play_wheel. 결과 기록은 화면에만 둡니다. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc, TAU = Math.PI * 2;
  var PRESETS = {
    '오늘의 미션': ['옆 사람 칭찬 한마디', '올해 가장 기억에 남는 일', '내년 다짐 한 가지', '좋아하는 노래 한 소절', '최근 산 물건 자랑', '오늘의 건배사', '다 같이 셀카', '박수 세 번 받기'],
    '가벼운 벌칙': ['성대모사 하나', '애교 한 번', '개인기 한 가지', '노래 한 소절', '건배사 하기', '칭찬 릴레이 시작', '엉덩이로 이름 쓰기', '통과!'],
    '발표 순서': ['1팀', '2팀', '3팀', '4팀', '5팀', '6팀'],
    '점심 메뉴': ['치킨', '피자', '족발', '떡볶이', '중식', '초밥', '햄버거', '김밥'],
    '숫자 1~10': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
  };
  var COLORS = ['#1F53D5', '#F2B33D', '#B35632', '#2E7D4F', '#6E8EF0', '#262B2E', '#E58A5C', '#4FA37A'];
  var Wd = { title: '', items: PRESETS['오늘의 미션'].slice(), remove: false }, out = [], hist = [], rot = 0, spinning = false, st, view, cv, ctx;
  var f = function (id) { return K.$('#' + id); };
  var live = function () { return Wd.items.filter(function (x) { return out.indexOf(x) < 0; }); };

  function paint() {
    if (!cv) return;
    var box = cv.parentNode.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.max(10, Math.min(box.width, box.height));
    if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
    var items = live(), n = items.length, r = cv.width / 2, seg = TAU / Math.max(1, n);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.translate(r, r); ctx.rotate(rot);
    if (!n) { ctx.beginPath(); ctx.arc(0, 0, r * .96, 0, TAU); ctx.fillStyle = '#E6E2DB'; ctx.fill(); return; }
    for (var i = 0; i < n; i++) {
      var c = COLORS[i % COLORS.length]; if (n % COLORS.length === 1 && i === n - 1) c = COLORS[2];   // 첫 칸과 같은 색이 붙지 않게
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * .96, i * seg, (i + 1) * seg); ctx.closePath(); ctx.fillStyle = c; ctx.fill();
      ctx.lineWidth = r * .012; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.save(); ctx.rotate(i * seg + seg / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c === '#F2B33D' ? '#262B2E' : '#fff';
      var fs = Math.max(r * .045, Math.min(r * .078, r * 1.3 / Math.max(6, n * 1.1))), label = items[i];
      ctx.font = '800 ' + fs + 'px Pretendard, "Pretendard Variable", sans-serif';
      while (ctx.measureText(label).width > r * .7 && label.length > 2) label = label.slice(0, -2) + '…';
      ctx.fillText(label, r * .88, 0); ctx.restore();
    }
  }
  function draw() {
    var items = live();
    view.innerHTML = K.brand + '<div class="wh-box" style="margin-top:2cqh"><div class="wh-disc"><canvas aria-hidden="true"></canvas><div class="pin"></div><button type="button" class="hub" data-hub aria-label="돌리기">SPIN</button></div>' +
      '<div class="wh-res"><div class="t1">' + esc(Wd.title || '돌림판') + '</div><div><div class="lbl">결과</div><div class="val" data-val>' + (hist[0] ? esc(hist[0]) : '–') + '</div></div>' +
      '<div class="lbl">' + items.length + '개 항목' + (Wd.remove && out.length ? ' · 뺀 항목 ' + out.length + '개' : '') + '</div>' +
      (hist.length > 1 ? '<ol>' + hist.slice(1, 6).map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ol>' : '') + '</div></div>';
    cv = K.$('canvas', view); ctx = cv.getContext('2d'); paint();
  }
  function spin() {
    if (spinning) return;
    var items = live(), n = items.length;
    if (n < 2) { K.toast(n ? '항목이 하나 남았습니다: ' + items[0] : '항목을 두 개 이상 넣어 주세요.'); if (n === 1) { hist.unshift(items[0]); draw(); } return; }
    var pick = K.rand(n), seg = TAU / n;
    // 바늘은 오른쪽(0 rad). pick 칸 가운데(+약간의 흔들림)가 0에 오도록 회전값을 정합니다
    var jitter = (K.rand(1000) / 1000 - .5) * seg * .7, target = -(pick * seg + seg / 2 + jitter);
    var base = rot - ((rot % TAU) + TAU) % TAU, finalRot = base + TAU * (5 + K.rand(2)) + ((target % TAU) + TAU) % TAU;
    if (finalRot - rot < TAU * 4) finalRot += TAU;
    var from = rot, dur = K.reduced ? 300 : 4200 + K.rand(900), t0 = performance.now(), lastSeg = null;
    spinning = true; K.$('[data-val]', view).textContent = '…';
    (function step(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      rot = from + (finalRot - from) * e; paint();
      var under = Math.floor((((-rot) % TAU) + TAU) % TAU / seg);
      if (under !== lastSeg) { lastSeg = under; K.sound.tick(); }
      if (p < 1) { requestAnimationFrame(step); return; }
      spinning = false; hist.unshift(items[pick]); if (Wd.remove) out.push(items[pick]);
      draw(); K.sound.done(); K.confetti(st);
    })(t0);
  }
  function load(s) { if (s && s.items && s.items.length >= 2) Wd = { title: s.title || '', items: s.items.slice(0, 16), remove: !!s.remove }; out = []; fill(); draw(); }
  function fill() { f('wh-title').value = Wd.title; f('wh-items').value = Wd.items.join('\n'); f('wh-remove').checked = Wd.remove; K.$('[data-wh-count]').textContent = Wd.items.length + '개 (최대 16개)'; }
  st = K.tool(function () { load(K.setup.get('wheel', null)); }); view = K.$('[data-view]', st);
  K.$('[data-presets]').innerHTML = Object.keys(PRESETS).map(function (k) { return '<button type="button" class="chip" data-preset="' + esc(k) + '">' + esc(k) + '</button>'; }).join('');
  K.$('[data-presets]').addEventListener('click', function (e) { var b = e.target.closest('[data-preset]'); if (!b) return; Wd.items = PRESETS[b.dataset.preset].slice(); if (!Wd.title || Object.keys(PRESETS).indexOf(Wd.title) >= 0) Wd.title = b.dataset.preset; out = []; fill(); draw(); });
  f('wh-title').addEventListener('input', function () { Wd.title = f('wh-title').value.trim(); var t = K.$('.wh-res .t1', view); if (t) t.textContent = Wd.title || '돌림판'; });
  f('wh-items').addEventListener('input', function () { Wd.items = K.lines(f('wh-items').value, 16, 20); out = out.filter(function (x) { return Wd.items.indexOf(x) >= 0; }); K.$('[data-wh-count]').textContent = Wd.items.length + '개 (최대 16개)'; if (!spinning) draw(); });
  f('wh-remove').addEventListener('change', function () { Wd.remove = f('wh-remove').checked; if (!Wd.remove) out = []; draw(); });
  K.$('[data-save]').addEventListener('click', function () { K.setup.save('wheel', Wd); });
  K.$('[data-go]').addEventListener('click', spin);
  K.$('[data-restore]').addEventListener('click', function () { out = []; draw(); K.toast('뺀 항목을 모두 되돌렸습니다.'); });
  view.addEventListener('click', function (e) { if (e.target.closest('[data-hub]')) spin(); });
  K.keys(st, { Space: spin, Enter: spin });
  window.addEventListener('resize', function () { if (!spinning) paint(); });
  document.addEventListener('fullscreenchange', function () { setTimeout(paint, 60); });
  load(K.store.get('ms_play_wheel', null));
})();
