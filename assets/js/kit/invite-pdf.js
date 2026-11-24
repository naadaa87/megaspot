/* 모임 초대장 PDF · 이미지 (2026-11-24)
   초대장 내용을 캔버스에 그려 A5 PDF(초대장 주소 링크 포함)와 JPG 이미지로 만듭니다. 외부 라이브러리 없이 동작합니다.
   초대장 만들기 완성 화면, 주최자 관리 화면, 관리자 → 모임 초대장에서 같이 씁니다.
   KitInvitePrint.prepare(inv, url)        → Promise<{ jpeg: Blob, bytes, w, h, links, pages }>  (같은 내용은 한 번만 그림)
                                             이미지는 한 장으로 길게, PDF는 A5 쪽으로 나눕니다(내용이 길면 항목 사이에서 다음 쪽으로).
   KitInvitePrint.savePdf(inv, url, name)  → PDF 내려받기
   KitInvitePrint.saveImage(inv, url, name)→ JPG 내려받기
   KitInvitePrint.shareImage(inv, url, text) → 휴대폰 공유 창(카카오톡 등)으로 이미지 보내기, 안 되면 내려받기
   KitInvitePrint.buildPdf(pages, title)   → Uint8Array · pages: [{ bytes(JPEG), w, h, links: [{x,y,w,h,url}] }]
   inv: 서버 publicInvite() 모양 { title, host, message, entry, schedule, notice, contact, theme, date, start_h, end_h, space, place, rsvp } */
(function (root) {
  'use strict';
  var W = 1240, A5H = Math.round(W * 210 / 148), U = W / 600;   // 1U = 너비 600 화면의 1px (A5에 찍으면 본문이 10~11pt)
  var FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
  var DISPLAY = 'Anton, ' + FONT;
  var THEME = {
    chalk: { bg: '#F7F5F1', fg: '#262B2E', sub: 'rgba(38,43,46,.72)', line: 'rgba(38,43,46,.16)', key: '#1F53D5', stripe: '#1F53D5' },
    cobalt: { bg: '#1F53D5', fg: '#FFFFFF', sub: 'rgba(255,255,255,.82)', line: 'rgba(255,255,255,.28)', key: '#1F53D5', stripe: '' },
    graphite: { bg: '#262B2E', fg: '#F1EFEB', sub: 'rgba(241,239,235,.78)', line: 'rgba(241,239,235,.22)', key: '#3A4046', stripe: '#9FB7F0' },
    rust: { bg: '#B35632', fg: '#FFFFFF', sub: 'rgba(255,255,255,.84)', line: 'rgba(255,255,255,.3)', key: '#B35632', stripe: '' }
  };
  var INK = '#1E2225', INK2 = '#5B6168', INK3 = '#6B7178', RULE = '#E6E2DB', SOFT = '#F7F5F1';
  var PLACE = { road: '서울 광진구 능동로13길 39', building: '한아름건물 2층', transit: '지하철 2·7호선 건대입구역 인근', parking: '건물 주차장 120여 대(1층·4층 옥상) · 유료 주차권 1시간 4,000원부터' };
  var WD = ['일', '월', '화', '수', '목', '금', '토'];

  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return '';
    return +m[1] + '년 ' + +m[2] + '월 ' + +m[3] + '일 (' + WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + ')';
  }
  function hh(h) { h = Number(h); if (!isFinite(h)) return ''; var x = h % 24, s = ('0' + Math.floor(x)).slice(-2) + ':' + (x % 1 ? '30' : '00'); return h >= 24 ? '다음 날 ' + s : s; }
  function timeRange(s, e) { return s == null || s === '' ? '' : hh(s) + (e != null && e !== '' ? ' ~ ' + hh(e) : ''); }
  // 자정을 넘겨 시작하는 예약(시작 24시 이상)은 실제 날짜로 보여 줍니다: 12/4 '다음 날 01:00' → 12/5 01:00
  function nightShift(inv) {
    var s = Number(inv.start_h); if (!(s >= 24) || !/^\d{4}-\d{2}-\d{2}$/.test(inv.date || '')) return inv;
    var d = new Date(Date.parse(inv.date + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    return Object.assign({}, inv, { date: d, start_h: s - 24, end_h: inv.end_h != null ? Number(inv.end_h) - 24 : inv.end_h });
  }
  function font(weight, size, family) { return weight + ' ' + Math.round(size * U * 10) / 10 + 'px ' + (family || FONT); }

  // 낱말 단위로 줄을 나누고, 한 낱말이 너무 길면 글자 단위로 나눕니다
  function wrap(ctx, text, maxW) {
    var out = [];
    String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').forEach(function (par) {
      var line = '';
      var push = function (tok) {
        var t = line + tok;
        if (ctx.measureText(t).width <= maxW) { line = t; return; }
        if (line.trim()) { out.push(line.replace(/\s+$/, '')); line = ''; tok = tok.replace(/^\s+/, ''); }
        if (ctx.measureText(tok).width <= maxW) { line = tok; return; }
        Array.from(tok).forEach(function (ch) { if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ''; } line += ch; });
      };
      par.split(/(\s+)/).forEach(function (tok) { if (tok) push(tok); });
      out.push(line.replace(/\s+$/, ''));
    });
    return out;
  }
  function clip(ctx, lines, max, maxW) {
    if (lines.length <= max) return lines;
    var keep = lines.slice(0, max), last = keep[max - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = Array.from(last).slice(0, -1).join('');
    keep[max - 1] = last + '…';
    return keep;
  }
  function spaced(ctx, text, x, y, sp) { Array.from(text).forEach(function (ch) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + sp; }); return x; }
  function rounded(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // 그리기 — draw=false 이면 높이만 셉니다. 반환: { h, qr: {x,y,w,h}, url: {x,y,w,h} }
  function layout(ctx, inv, url, H, draw) {
    var th = THEME[inv.theme] || THEME.chalk, place = Object.assign({}, PLACE, inv.place || {}), space = inv.space || {};
    var PX = 48 * U, CW = W - PX * 2, y = 0, out = {};
    var text = function (s, x, yy, f, color, align) { if (!draw) return; ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.fillText(s, x, yy); };
    var para = function (s, f, color, lh, max, x, w) {
      ctx.font = f; var lines = clip(ctx, wrap(ctx, s, w || CW), max || 99, w || CW), size = parseFloat(f.split(' ')[1]);
      lines.forEach(function (l, i) { text(l, x == null ? PX : x, y + (lh - 1) * size / 2 + size * 0.9 + i * size * lh, f, color); });
      y += lines.length * size * lh; return lines.length;
    };
    ctx.textBaseline = 'alphabetic';
    inv = nightShift(inv);
    // ---- 머리 (색 띠) — 높이를 먼저 센 뒤 배경을 칠하고 글자를 얹습니다 ----
    var brandY = 46 * U + 13 * U;
    var headDraw = function (bandH) {
      if (!draw) return;
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, bandH);
      if (th.stripe) { ctx.fillStyle = th.stripe; ctx.fillRect(0, 0, W, 7 * U); }
      ctx.font = font('400', 13, DISPLAY); ctx.fillStyle = th.sub; ctx.textAlign = 'left'; spaced(ctx, 'MEGASPOT INVITATION', PX, brandY, 2.2 * U);
    };
    y = brandY + 30 * U;
    // 제목
    ctx.font = font('800', 36);
    var tl = clip(ctx, wrap(ctx, inv.title || '모임 초대장', CW), 3, CW), ts = 36 * U, tlh = 1.27;
    var titleY = y; y += tl.length * ts * tlh;
    var hostY = 0; if (inv.host) { y += 6 * U; hostY = y; y += 16 * U * 1.5; }
    y += 22 * U; var ruleY = y; y += 24 * U;
    var dateY = y; y += 23 * U * 1.35;
    var time = timeRange(inv.start_h, inv.end_h), sub = time + (inv.entry ? (time ? ' · ' : '') + inv.entry + '부터 입장' : '');
    var subY = 0; if (sub) { subY = y; y += 17 * U * 1.5; }
    y += 40 * U; var bandH = y;
    if (draw) {
      headDraw(bandH);
      ctx.font = font('800', 36); ctx.fillStyle = th.fg; ctx.textAlign = 'left';
      tl.forEach(function (l, i) { ctx.fillText(l, PX, titleY + ts + i * ts * tlh - ts * 0.12); });
      if (inv.host) { ctx.font = font('500', 16); ctx.fillStyle = th.sub; ctx.fillText(clip(ctx, wrap(ctx, inv.host, CW), 1, CW)[0], PX, hostY + 16 * U * 1.15); }
      ctx.fillStyle = th.line; ctx.fillRect(PX, ruleY, CW, Math.max(1, U));
      ctx.font = font('800', 23); ctx.fillStyle = th.fg; ctx.fillText(fmtDate(inv.date) || '날짜 미정', PX, dateY + 23 * U);
      if (sub) { ctx.font = font('500', 17); ctx.fillStyle = th.sub; ctx.fillText(sub, PX, subY + 17 * U * 1.1); }
    }
    // ---- 본문 ----
    y += 34 * U;
    if (inv.message) { para(inv.message, font('400', 17), INK, 1.72, 10); y += 26 * U; }
    out.breaks = [];
    var section = function (label, body) {
      out.breaks.push(y - 6 * U);
      if (draw) { ctx.fillStyle = RULE; ctx.fillRect(PX, y, CW, Math.max(1, U)); }
      y += 20 * U;
      if (draw) { ctx.font = font('800', 12.5); ctx.fillStyle = th.key; ctx.textAlign = 'left'; spaced(ctx, label, PX, y + 12.5 * U, 1.4 * U); }
      y += 12.5 * U + 11 * U;
      body(); y += 18 * U;
    };
    section('장소', function () {
      para(space.name || '메가스팟', font('800', 18.5), INK, 1.4, 1);
      y += 4 * U;
      para(place.road + ' ' + (space.floor || place.building) + (space.note ? ' · ' + space.note : ''), font('400', 15.5), INK2, 1.6, 2);
      para(place.transit, font('400', 15.5), INK2, 1.6, 1);
    });
    if (inv.schedule && inv.schedule.length) section('일정', function () {
      var col = 70 * U;
      inv.schedule.slice(0, 12).forEach(function (s) {
        var f = font('500', 16), size = 16 * U, lh = 1.55;
        ctx.font = f; var lines = clip(ctx, wrap(ctx, s.text, CW - col), 2, CW - col);
        if (draw) {
          if (s.time) { ctx.font = font('800', 16); ctx.fillStyle = th.key; ctx.fillText(s.time, PX, y + size * 1.1); }
          ctx.font = f; ctx.fillStyle = INK; lines.forEach(function (l, i) { ctx.fillText(l, PX + col, y + size * 1.1 + i * size * lh); });
        }
        y += lines.length * size * lh + 4 * U;
      });
    });
    section('주차', function () {
      para(place.parking || PLACE.parking, font('600', 15.5), '#262B2E', 1.6, 2);
      para('차를 가져오시면 도착한 뒤 주차 할인 등록에서 차량번호를 등록해 주세요.', font('400', 14.5), INK2, 1.6, 2);
    });
    if (inv.notice) section('알려 드려요', function () { para(inv.notice, font('400', 15.5), INK, 1.68, 8); });
    if (inv.contact) section('문의', function () { para(inv.contact, font('500', 15.5), INK, 1.6, 2); });
    // ---- QR 상자 ----
    var boxH = 152 * U, footH = 64 * U, qrS = 112 * U;
    var contentEnd = y + 10 * U, pageH = Math.max(H || A5H, contentEnd + boxH + footH);
    var by = draw ? pageH - footH - boxH : contentEnd;
    out.breaks.push(by - 12 * U);
    if (draw) {
      ctx.fillStyle = SOFT; rounded(ctx, PX, by, CW, boxH, 18 * U); ctx.fill();
      var qx = PX + 20 * U, qy = by + (boxH - qrS) / 2, q = null;
      try { q = root.KitQR && root.KitQR.encode(url, 'M'); } catch (e) { q = null; }
      ctx.fillStyle = '#FFFFFF'; rounded(ctx, qx, qy, qrS, qrS, 8 * U); ctx.fill();
      if (q) {
        var pad = 7 * U, m = (qrS - pad * 2) / q.size; ctx.fillStyle = '#111111';
        for (var r = 0; r < q.size; r++) for (var c = 0; c < q.size; c++) if (q.modules[r][c]) ctx.fillRect(Math.floor(qx + pad + c * m), Math.floor(qy + pad + r * m), Math.ceil(m), Math.ceil(m));
      }
      out.qr = { x: qx, y: qy, w: qrS, h: qrS };
      var tx = qx + qrS + 22 * U, tw = PX + CW - 20 * U - tx, ty = by + 40 * U;
      ctx.textAlign = 'left';
      ctx.font = font('800', 17); ctx.fillStyle = INK; ctx.fillText('QR을 찍으면 초대장이 열립니다', tx, ty);
      ctx.font = font('400', 14); ctx.fillStyle = INK2;
      var rs = inv.rsvp || {}, info = '길찾기 · 주차 안내' + (rs.enabled ? ' · 참석 응답' : '') + (rs.enabled && rs.deadline ? ' (' + fmtDate(rs.deadline).replace(/^\d{4}년 /, '').replace(/ \(.\)$/, '') + '까지)' : '');
      wrap(ctx, info, tw).slice(0, 2).forEach(function (l, i) { ctx.fillText(l, tx, ty + 28 * U + i * 21 * U); });
      var shortUrl = String(url).replace(/^https?:\/\//, '');
      ctx.font = font('700', 13.5); ctx.fillStyle = '#1F53D5';
      var su = clip(ctx, [shortUrl], 1, tw)[0]; ctx.fillText(su, tx, by + boxH - 28 * U);
      out.url = { x: tx, y: by + boxH - 46 * U, w: Math.min(tw, ctx.measureText(su).width), h: 26 * U };
      // 바닥글
      ctx.fillStyle = RULE; ctx.fillRect(PX, pageH - footH + 14 * U, CW, Math.max(1, U));
      ctx.font = font('400', 12, DISPLAY); ctx.fillStyle = INK3; spaced(ctx, 'MEGASPOT', PX, pageH - 22 * U, 1.6 * U);
      ctx.font = font('500', 12.5); ctx.textAlign = 'right'; ctx.fillText('메가스팟 건대 · megaspot.kr', W - PX, pageH - 22 * U); ctx.textAlign = 'left';
    }
    out.h = pageH;
    return out;
  }

  function fontsReady() {
    var d = root.document; if (!d || !d.fonts || !d.fonts.load) return Promise.resolve();
    var all = Promise.all([d.fonts.load('800 40px "Pretendard Variable"', '가A1'), d.fonts.load('400 40px "Pretendard Variable"', '가A1'), d.fonts.load('40px Anton', 'MEGASPOT')]).catch(function () {});
    return Promise.race([all, new Promise(function (r) { setTimeout(r, 3000); })]);
  }
  var cache = {};
  function keyOf(inv, url) { return JSON.stringify([inv.title, inv.host, inv.message, inv.entry, inv.schedule, inv.notice, inv.contact, inv.theme, inv.date, inv.start_h, inv.end_h, inv.space, inv.rsvp && [inv.rsvp.enabled, inv.rsvp.deadline], url]); }
  function prepare(inv, url) {
    var k = keyOf(inv, url);
    if (cache[k]) return cache[k].promise;
    var entry = { promise: null, value: null };
    entry.promise = fontsReady().then(function () {
      var probe = root.document.createElement('canvas').getContext('2d');
      var h = layout(probe, inv, url, A5H, false).h;
      var cv = root.document.createElement('canvas'); cv.width = W; cv.height = Math.ceil(h);
      var ctx = cv.getContext('2d'); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, cv.width, cv.height);
      var o = layout(ctx, inv, url, cv.height, true);
      var links = [o.qr, o.url].filter(Boolean).map(function (r) { return Object.assign({ url: url }, r); });
      return jpegOf(cv).then(function (img) {
        var one = { bytes: img.bytes, w: cv.width, h: cv.height, links: links };
        if (cv.height <= A5H + 2) return { img: img, pages: [one] };
        return Promise.all(paginate(cv, o.breaks, links, inv).map(function (pg) {
          return jpegOf(pg.canvas).then(function (j) { return { bytes: j.bytes, w: pg.canvas.width, h: pg.canvas.height, links: pg.links }; });
        })).then(function (pages) { return { img: img, pages: pages }; });
      }).then(function (r) {
        entry.value = { jpeg: r.img.blob, bytes: r.img.bytes, w: cv.width, h: cv.height, links: links, pages: r.pages, canvas: cv };
        return entry.value;
      });
    });
    entry.promise.catch(function () { delete cache[k]; });
    cache[k] = entry;
    return entry.promise;
  }

  function jpegOf(cv) {
    return new Promise(function (res, rej) {
      cv.toBlob(function (b) {
        if (!b) { rej(new Error('이미지를 만들지 못했습니다.')); return; }
        b.arrayBuffer().then(function (buf) { res({ blob: b, bytes: new Uint8Array(buf) }); }, rej);
      }, 'image/jpeg', 0.9);
    });
  }
  // 긴 초대장을 A5 쪽으로 나눕니다. 항목(장소·일정·주차…)이 시작하는 자리에서 자르고, QR 상자와 바닥글은 마지막 쪽에 둡니다.
  function paginate(tall, breaks, links, inv) {
    var TOP = 56 * U, BOTTOM = 44 * U, H = tall.height, cuts = [], s = 0, first = true;
    while (s < H) {
      var cap = A5H - (first ? 0 : TOP) - BOTTOM;
      if (H - s <= cap + (first ? 0 : BOTTOM)) { cuts.push([s, H]); break; }
      var cut = 0;
      breaks.forEach(function (b) { if (b > s + cap * 0.3 && b <= s + cap && b > cut) cut = b; });
      if (!cut) cut = s + cap;
      cuts.push([s, cut]); s = cut; first = false;
    }
    return cuts.map(function (c, i) {
      var cv = root.document.createElement('canvas'); cv.width = W; cv.height = A5H;
      var ctx = cv.getContext('2d'), off = i ? TOP : 0;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, A5H);
      ctx.drawImage(tall, 0, c[0], W, c[1] - c[0], 0, off, W, c[1] - c[0]);
      ctx.textBaseline = 'alphabetic';
      if (i) {
        ctx.font = font('400', 11, DISPLAY); ctx.fillStyle = INK3; ctx.textAlign = 'left'; spaced(ctx, 'MEGASPOT INVITATION', 48 * U, 32 * U, 1.6 * U);
        ctx.font = font('600', 12); ctx.textAlign = 'right'; ctx.fillText(clip(ctx, [inv.title || '모임 초대장'], 1, W * 0.45)[0], W - 48 * U, 32 * U);
      }
      ctx.font = font('500', 12); ctx.fillStyle = INK3; ctx.textAlign = 'right'; ctx.fillText((i + 1) + ' / ' + cuts.length, W - 48 * U, A5H - 18 * U); ctx.textAlign = 'left';
      var ls = links.filter(function (l) { return l.y >= c[0] && l.y + l.h <= c[1]; }).map(function (l) { return Object.assign({}, l, { y: l.y - c[0] + off }); });
      return { canvas: cv, links: ls };
    });
  }

  // ---------- PDF (쪽마다 이미지 1장 + 링크 영역) ----------
  function ascii(s) { var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }
  function utf16(s) { var h = 'FEFF'; for (var i = 0; i < s.length; i++) h += ('000' + s.charCodeAt(i).toString(16)).slice(-4).toUpperCase(); return '<' + h + '>'; }
  function pdfStr(s) { return '(' + String(s).replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, function (c) { return '\\' + c; }) + ')'; }
  function n(v) { return (Math.round(v * 100) / 100).toString(); }
  function buildPdf(pages, title) {
    var PW = 419.53;   // A5 너비 148mm
    var objs = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Title ' + utf16(title || '모임 초대장') + ' /Producer (MEGASPOT megaspot.kr) /Creator (MEGASPOT Kit) >>'];
    var kids = [];
    pages.forEach(function (pg, i) {
      var PH = PW * pg.h / pg.w, k = PW / pg.w, base = objs.length + 1;   // 쪽 · 이미지 · 내용 · 링크들
      var annots = (pg.links || []).map(function (r) {
        return '<< /Type /Annot /Subtype /Link /Rect [' + [n(r.x * k), n(PH - (r.y + r.h) * k), n((r.x + r.w) * k), n(PH - r.y * k)].join(' ') + '] /Border [0 0 0] /A << /S /URI /URI ' + pdfStr(r.url) + ' >> >>';
      });
      var content = 'q ' + n(PW) + ' 0 0 ' + n(PH) + ' 0 0 cm /Im' + i + ' Do Q';
      kids.push(base + ' 0 R');
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n(PW) + ' ' + n(PH) + '] /Resources << /XObject << /Im' + i + ' ' + (base + 1) + ' 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ' + (base + 2) + ' 0 R' +
        (annots.length ? ' /Annots [' + annots.map(function (_, j) { return (base + 3 + j) + ' 0 R'; }).join(' ') + ']' : '') + ' >>');
      objs.push({ head: '<< /Type /XObject /Subtype /Image /Width ' + pg.w + ' /Height ' + pg.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.bytes.length + ' >>\nstream\n', data: pg.bytes, tail: '\nendstream' });
      objs.push('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      annots.forEach(function (a) { objs.push(a); });
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';
    var parts = [ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')], len = parts[0].length, offsets = [];
    objs.forEach(function (o, i) {
      offsets.push(len);
      var chunks = typeof o === 'string' ? [ascii((i + 1) + ' 0 obj\n' + o + '\nendobj\n')] : [ascii((i + 1) + ' 0 obj\n' + o.head), o.data, ascii(o.tail + '\nendobj\n')];
      chunks.forEach(function (c) { parts.push(c); len += c.length; });
    });
    var xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map(function (o) { return ('000000000' + o).slice(-10) + ' 00000 n \n'; }).join('');
    parts.push(ascii(xref + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + len + '\n%%EOF\n'));
    var total = parts.reduce(function (a, p) { return a + p.length; }, 0), outb = new Uint8Array(total), at = 0;
    parts.forEach(function (p) { outb.set(p, at); at += p.length; });
    return outb;
  }

  // 파일 이름은 영문으로 둡니다(카카오톡·일부 휴대폰 브라우저가 한글 파일 이름을 'download'로 바꾸는 일이 있어서)
  function fileName(inv, ext) { return 'megaspot-invitation' + (inv.date ? '-' + inv.date : '') + '.' + ext; }
  function save(blob, name) {
    var a = root.document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener';
    root.document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function pdfBlob(p, inv) { return new Blob([buildPdf(p.pages, (inv.title || '모임') + ' 초대장 · 메가스팟')], { type: 'application/pdf' }); }
  var inKakao = function () { return /KAKAOTALK/i.test(root.navigator && root.navigator.userAgent || ''); };

  root.KitInvitePrint = {
    prepare: prepare,
    buildPdf: buildPdf,
    fileName: fileName,
    inKakao: inKakao,
    pdfBlob: function (inv, url) { return prepare(inv, url).then(function (p) { return pdfBlob(p, inv); }); },
    savePdf: function (inv, url, name) { return prepare(inv, url).then(function (p) { save(pdfBlob(p, inv), name || fileName(inv, 'pdf')); return true; }); },
    saveImage: function (inv, url, name) { return prepare(inv, url).then(function (p) { save(p.jpeg, name || fileName(inv, 'jpg')); return true; }); },
    // 미리 그려 둔 이미지가 있으면 바로 공유 창을 엽니다(휴대폰 브라우저는 누른 직후에만 공유 창을 열 수 있습니다)
    shareImage: function (inv, url, text) {
      var k = keyOf(inv, url), ready = cache[k] && cache[k].value;
      var go = function (p) {
        var file = typeof File === 'function' ? new File([p.jpeg], fileName(inv, 'jpg'), { type: 'image/jpeg' }) : null;
        var nav = root.navigator;
        if (file && nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
          return nav.share({ files: [file], title: inv.title || '모임 초대장', text: text || '' }).then(function () { return 'shared'; }, function (e) { if (e && e.name === 'AbortError') return 'cancelled'; save(p.jpeg, fileName(inv, 'jpg')); return 'saved'; });
        }
        save(p.jpeg, fileName(inv, 'jpg')); return Promise.resolve('saved');
      };
      return ready ? go(ready) : prepare(inv, url).then(go);
    },
    canShareFiles: function () { try { return !!(root.navigator.canShare && typeof File === 'function' && root.navigator.canShare({ files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] })); } catch (e) { return false; } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
