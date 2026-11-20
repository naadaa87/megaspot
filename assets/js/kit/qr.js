/* 메가스팟 모임 키트 — QR 코드 그리기 (2026-11-21)
   초대장 주소·빙고 카드 주소처럼 짧은 주소를 QR 코드로 바꿔 SVG로 그립니다.
   바이트 모드(UTF-8) · 오류 정정 L/M/Q/H · 버전 1~15 · 마스크 8가지 중 벌점이 가장 낮은 것.
   외부 라이브러리 없이 동작해서, 인터넷이 잠깐 끊긴 현장 화면에서도 그대로 보입니다.
   QR 코드 규격(ISO/IEC 18004)의 표준 계산 순서를 따릅니다. */
(function (root) {
  'use strict';
  var ECC = { L: 0, M: 1, Q: 2, H: 3 };
  var FORMAT = [1, 0, 3, 2];   // 형식 정보에 들어가는 오류 정정 단계 값 (L, M, Q, H)
  var MAX_VER = 15;
  // 블록당 오류 정정 코드어 수 / 오류 정정 블록 수 (버전 0은 비워 둠)
  var EC_PER_BLOCK = [
    [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22],
    [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24],
    [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30],
    [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24]
  ];
  var BLOCKS = [
    [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6],
    [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10],
    [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12],
    [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18]
  ];

  function utf8(s) {
    s = String(s);
    if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(s));
    var out = [], e = unescape(encodeURIComponent(s));
    for (var i = 0; i < e.length; i++) out.push(e.charCodeAt(i));
    return out;
  }
  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(ver, e) { return Math.floor(rawModules(ver) / 8) - EC_PER_BLOCK[e][ver] * BLOCKS[e][ver]; }

  // GF(256) 곱셈 (원시 다항식 0x11D)
  function mul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
  function rsDivisor(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (i = 0; i < deg; i++) {
      for (var j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = mul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      for (var i = 0; i < div.length; i++) r[i] ^= mul(div[i], f);
    });
    return r;
  }

  function encode(text, level, forceMask) {
    var e = ECC[level] != null ? ECC[level] : ECC.M;
    var bytes = utf8(text), ver = 0;
    for (var v = 1; v <= MAX_VER; v++) {
      var cc = v < 10 ? 8 : 16;
      if (4 + cc + bytes.length * 8 <= dataCodewords(v, e) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('QR_TOO_LONG');
    // 데이터 비트열: 모드(0100) + 글자 수 + 바이트
    var bits = [];
    var put = function (val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(function (b) { put(b, 8); });
    var cap = dataCodewords(ver, e) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; data.push(b); }

    // 블록으로 나눠 오류 정정 코드어를 붙이고 섞기
    var nb = BLOCKS[e][ver], ecLen = EC_PER_BLOCK[e][ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(ecLen), blocks = [];
    for (i = 0, k = 0; i < nb; i++) {
      var dat = data.slice(k, k + shortLen - ecLen + (i < nShort ? 0 : 1)); k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var words = [];
    for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (bl, j) { if (i !== shortLen - ecLen || j >= nShort) words.push(bl[i]); });

    var size = ver * 4 + 17, mods = [], fn = [];
    for (i = 0; i < size; i++) { mods.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    var setF = function (x, y, dark) { mods[y][x] = dark; fn[y][x] = true; };
    // 타이밍 · 위치 찾기 · 정렬 패턴
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    var finder = function (cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var align = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = Math.floor((ver * 8 + na * 3 + 5) / (na * 4 - 4)) * 2;
      align = [6]; for (var pos = size - 7; align.length < na; pos -= step) align.splice(1, 0, pos);
    }
    align.forEach(function (ax, ai) {
      align.forEach(function (ay, aj) {
        var last = align.length - 1;
        if ((ai === 0 && aj === 0) || (ai === 0 && aj === last) || (ai === last && aj === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    var bit = function (x, i) { return ((x >>> i) & 1) !== 0; };
    var formatBits = function (mask) {
      var d = FORMAT[e] << 3 | mask, rem = d;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = (d << 10 | rem) ^ 0x5412;
      for (i = 0; i <= 5; i++) setF(8, i, bit(bits, i));
      setF(8, 7, bit(bits, 6)); setF(8, 8, bit(bits, 7)); setF(7, 8, bit(bits, 8));
      for (i = 9; i < 15; i++) setF(14 - i, 8, bit(bits, i));
      for (i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(bits, i));
      for (i = 8; i < 15; i++) setF(8, size - 15 + i, bit(bits, i));
      setF(8, size - 8, true);
    };
    formatBits(0);
    if (ver >= 7) {
      var rem = ver; for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = ver << 12 | rem;
      for (i = 0; i < 18; i++) { var c = bit(vb, i), a = size - 11 + i % 3, bb = Math.floor(i / 3); setF(a, bb, c); setF(bb, a, c); }
    }
    // 코드어 채우기 (오른쪽 아래부터 두 칸씩 지그재그)
    i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < words.length * 8) { mods[y][x] = bit(words[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
    var maskOn = function (m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return x * y % 2 + x * y % 3 === 0;
        case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
        default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
    };
    var applyMask = function (m) { for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!fn[y][x] && maskOn(m, x, y)) mods[y][x] = !mods[y][x]; };
    var penalty = function () {
      var p = 0, dark = 0, x, y, run, prev;
      var line = function (get) {
        for (var a = 0; a < size; a++) {
          run = 0; prev = null;
          for (var b = 0; b < size; b++) {
            var c = get(a, b);
            if (c === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { run = 1; prev = c; }
          }
          // 1:1:3:1:1 위치 찾기 패턴과 닮은 줄
          for (b = 0; b + 10 < size; b++) {
            var s = ''; for (var t = 0; t < 11; t++) s += get(a, b + t) ? '1' : '0';
            if (s === '10111010000' || s === '00001011101') p += 40;
          }
        }
      };
      line(function (a, b) { return mods[a][b]; });
      line(function (a, b) { return mods[b][a]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var c = mods[y][x];
        if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) p += 3;
      }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mods[y][x]) dark++;
      var total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      return p + Math.max(0, k) * 10;
    };
    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      var sc = penalty(); if (sc < bestScore) { bestScore = sc; best = m; }
      applyMask(m);
    }
    if (forceMask >= 0 && forceMask < 8) best = forceMask;
    applyMask(best); formatBits(best);
    return { size: size, version: ver, modules: mods };
  }

  // SVG 문자열 (흰 여백 4칸 포함). opts: { level, dark, light, label }
  function svg(text, opts) {
    opts = opts || {};
    var q = encode(text, opts.level || 'M'), n = q.size, b = 4, d = '';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (q.modules[y][x]) d += 'M' + (x + b) + ',' + (y + b) + 'h1v1h-1z';
    var w = n + b * 2, label = String(opts.label || 'QR 코드').replace(/[&<>"]/g, '');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + w + '" shape-rendering="crispEdges" role="img" aria-label="' + label + '">' +
      '<rect width="' + w + '" height="' + w + '" fill="' + (opts.light || '#fff') + '"/><path fill="' + (opts.dark || '#111') + '" d="' + d + '"/></svg>';
  }

  var api = { encode: encode, svg: svg };
  root.KitQR = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
