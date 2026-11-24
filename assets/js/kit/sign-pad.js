/* 서명 패드 (2026-11-24) — 손가락·펜·마우스로 서명을 받아 PNG로 돌려줍니다.
   var pad = SignPad(canvas, { onChange }) → pad.clear(), pad.isEmpty(), pad.toDataURL() (서명 둘레만 잘라 최대 가로 640px)
   공간대관 계약서(대관자 서명)와 관리자 계약서 설정(운영자 도장·서명)에서 같이 씁니다. */
(function (root) {
  'use strict';
  root.SignPad = function (canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d'), strokes = [], cur = null, ratio = 1, length = 0;
    function size() {
      var r = canvas.getBoundingClientRect(); ratio = Math.max(1, Math.min(3, root.devicePixelRatio || 1));
      if (!r.width) return;
      canvas.width = Math.round(r.width * ratio); canvas.height = Math.round(r.height * ratio);
      draw();
    }
    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = opts.color || '#111827'; ctx.lineWidth = opts.width || 2.6;
      strokes.forEach(function (s) { line(s); });
    }
    function line(s) {
      if (!s.length) return;
      ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y);
      if (s.length === 1) { ctx.lineTo(s[0].x + 0.1, s[0].y + 0.1); }
      for (var i = 1; i < s.length - 1; i++) { var mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2; ctx.quadraticCurveTo(s[i].x, s[i].y, mx, my); }
      if (s.length > 1) ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y);
      ctx.stroke();
    }
    function pt(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button > 0) return;
      e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
      cur = [pt(e)]; strokes.push(cur); draw(); if (opts.onChange) opts.onChange();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!cur) return; e.preventDefault();
      var p = pt(e), l = cur[cur.length - 1], d = Math.hypot(p.x - l.x, p.y - l.y);
      if (d < 1.2) return; length += d; cur.push(p); draw();
    });
    var end = function () { if (cur) { cur = null; if (opts.onChange) opts.onChange(); } };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') end(); });
    if (root.ResizeObserver) new root.ResizeObserver(size).observe(canvas); else root.addEventListener('resize', size);
    size();
    return {
      clear: function () { strokes = []; length = 0; draw(); if (opts.onChange) opts.onChange(); },
      undo: function () { var s = strokes.pop(); if (s) for (var i = 1; i < s.length; i++) length -= Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y); draw(); if (opts.onChange) opts.onChange(); },
      // 점 몇 개나 아주 짧은 선은 서명으로 보지 않습니다
      isEmpty: function () { return !strokes.length || length < 40; },
      toDataURL: function () {
        if (!strokes.length) return '';
        var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        strokes.forEach(function (s) { s.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }); });
        var pad = 8, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2, k = Math.min(2, 640 / w);
        var out = root.document.createElement('canvas'); out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k));
        var c = out.getContext('2d'); c.setTransform(k, 0, 0, k, (pad - minX) * k, (pad - minY) * k);
        c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = opts.color || '#111827'; c.lineWidth = opts.width || 2.6;
        var save = ctx; ctx = c; strokes.forEach(function (s) { line(s); }); ctx = save;
        return out.toDataURL('image/png');
      }
    };
  };
})(window);
