/* =====================================================================
   메가스팟 건대 · 요금 계산 (요금표 v2.1 · 성수기 포함)
   - 데이터는 data/pricing-gundae.js, 공휴일은 data/holidays-kr.js 에 있습니다.
   - 계산 순서: 날짜 → (성수기면 적용 구분) → 요일 구분 → 시간당 요금 합계(+성수기 가산액) → 패키지와 같으면 패키지 금액
                → 포함 인원을 넘는 만큼 인원 추가 → 옵션 → 합계. 보증금은 따로.
   - 화면(pricing-ui.js)과 예약 신청, 목적별 요금 예시(purpose.js), 관리자 견적(admin.js)이 모두 이 파일의 계산을 씁니다.
   ===================================================================== */
(function(root){
  'use strict';
  var SPACE = 'megaspot-gundae';
  function P(){ return ((root.MEGASPOT_PRICING || {})[SPACE]) || null; }
  function HOL(){ return root.MEGASPOT_HOLIDAYS || {}; }

  /* ---------- 숫자·표기 ---------- */
  function fmt(n){ return Math.round(n).toLocaleString('ko-KR'); }
  function won(n){ return fmt(n) + '원'; }
  // 만 원 단위 표기: 300000 → 30만 원, 1350000 → 135만 원, 25000 → 2.5만 원
  function man(n){ n = Math.round(n); if (n === 0) return '0원'; if (n < 10000) return won(n); var m = n / 10000; if (Number.isInteger(m)) return fmt(m) + '만 원'; if (Number.isInteger(m * 10)) return (Math.round(m * 10) / 10).toLocaleString('ko-KR') + '만 원'; return won(n); }
  function clampInt(v, lo, hi, dflt){ var n = parseInt(v, 10); if (!isFinite(n)) n = dflt; return Math.max(lo, Math.min(hi, n)); }

  /* ---------- 날짜 ---------- */
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function parse(s){ var p = String(s || '').split('-'); if (p.length !== 3) return null; var d = new Date(+p[0], +p[1] - 1, +p[2], 12); return isNaN(d) ? null : d; }
  function iso(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(s, n){ var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b){ return Math.round((parse(b) - parse(a)) / 86400000); }   // b − a (일)
  function todayIso(){ var d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)); }
  function kdate(s){ var d = parse(s); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + DOW[d.getDay()] + ')'; }
  function kdateY(s){ var d = parse(s); return d.getFullYear() + '년 ' + kdate(s); }
  function isOff(s){ var d = parse(s); if (!d) return false; return d.getDay() === 0 || d.getDay() === 6 || !!HOL()[s]; }

  /* ---------- 성수기 ----------
     특정일(peak.dates)이 먼저, 그다음 해당 월(peak.months)의 실제 요일로 적용 구분을 정합니다. 둘 다 아니면 평소 요금입니다. */
  function peakOf(s){
    var D = P(), pk = D && D.peak; if (!pk) return null;
    var d = parse(s); if (!d) return null;
    var id = pk.dates && pk.dates[s];
    if (!id && pk.months){ var m = pk.months[s.slice(0, 7)]; if (m){ var dw = d.getDay(); id = m[dw === 0 ? 'sun' : dw === 6 ? 'sat' : dw === 5 ? 'fri' : 'wd']; } }
    if (!id) return null;
    var t = pk.types[id]; if (!t) return null;
    var per = (pk.periods || []).filter(function(p){ return p.id === t.period; })[0];
    var out = { id: id, periodLabel: per ? per.label : '', seasonLabel: pk.label || '성수기' };
    for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) out[k] = t[k];
    return out;
  }
  function peakPeriods(){ return ((P() || {}).peak || {}).periods || []; }
  function inPeakPeriod(s){ return peakPeriods().some(function(p){ return s >= p.from && s <= p.to; }); }

  /* ---------- 요일 구분 ----------
     휴일 = 토·일·공휴일. 이용일(당일)과 다음 날이 휴일인지로 네 가지 중 하나를 고릅니다.
     평일→평일: 월–목 / 평일→휴일: 금 / 휴일→휴일: 토 / 휴일→평일: 일
     성수기에는 적용 구분(peak)이 요일 구분을 대신합니다. */
  function dayInfo(s){
    var d = parse(s); if (!d) return null;
    var off = isOff(s), nextOff = isOff(addDays(s, 1));
    var col = !off ? (nextOff ? 'fri' : 'wd') : (nextOff ? 'sat' : 'sun');
    var hol = HOL()[s] || null, nextHol = HOL()[addDays(s, 1)] || null;
    var why;
    if (hol) why = hol + '(공휴일)이라 ' + (nextOff ? '다음 날도 쉬는 날이어서 토요일' : '다음 날이 평일이어서 일요일') + ' 요금을 적용합니다.';
    else if (!off && nextHol) why = '다음 날이 ' + nextHol + '(공휴일)이라 금요일 요금을 적용합니다.';
    else if (!off && col === 'fri' && d.getDay() !== 5) why = '다음 날이 쉬는 날이라 금요일 요금을 적용합니다.';
    else why = '';
    var pk = peakOf(s);
    if (pk){
      col = pk.base;
      why = pk.seasonLabel + ' 요금(' + pk.label + ' 기준)이 적용되는 날입니다. 기준 인원 ' + pk.people + '명이 공간료에 들어 있습니다.';
    }
    return { iso: s, dow: d.getDay(), dowLabel: DOW[d.getDay()], month: d.getMonth() + 1, holiday: hol, nextHoliday: nextHol, off: off, nextOff: nextOff,
      col: col, colLabel: pk ? pk.label + ' · ' + pk.seasonLabel : colLabel(col), baseLabel: colLabel(col), why: why, peak: pk, peakSeason: !!pk,
      peopleBase: pk ? pk.people : P().people.base };
  }
  function colLabel(col){ var c = (P().cols || []).filter(function(x){ return x.id === col; })[0]; return c ? c.label : col; }

  /* ---------- 시간 ---------- */
  function hourLabel(h){ return (h >= 24 ? '다음 날 ' : '') + pad(h % 24) + ':00'; }
  function rangeLabel(start, end){ return hourLabel(start) + ' – ' + hourLabel(end) + ' (' + (end - start) + '시간)'; }
  function isDawn(h){ var dw = P().dawn; return !!dw && h >= dw.from && h < dw.to; }
  function bandOf(h){
    var D = P(), b = D.bands;
    if (isDawn(h)){ var nb = b.filter(function(x){ return x.id === D.dawn.band; })[0]; return nb || null; }
    for (var i = 0; i < b.length; i++) if (h >= b[i].from && h < b[i].to) return b[i];
    return null;
  }
  // 요금표: 성수기 적용 구분이 있으면 그 시간당 요금, 아니면 요일 구분의 요금
  function ratesFor(dayOrCol){
    if (dayOrCol && typeof dayOrCol === 'object') return dayOrCol.peak ? dayOrCol.peak.hourly : P().hourly[dayOrCol.col];
    return P().hourly[dayOrCol];
  }
  function rateAt(dayOrCol, h){ var b = bandOf(h); return b ? (ratesFor(dayOrCol)[b.id] || 0) : 0; }
  function hoursFee(dayOrCol, start, end){
    var rates = ratesFor(dayOrCol), lines = [], total = 0, cur = null;
    for (var h = start; h < end; h++){
      var b = bandOf(h), r = rates[b.id], dawn = isDawn(h), label = dawn ? '새벽' : b.label;
      if (cur && cur.band === b.id && cur.label === label && cur.to === h){ cur.hours++; cur.sum += r; cur.to = h + 1; }
      else { cur = { band: b.id, label: label, dawn: dawn, from: h, to: h + 1, hours: 1, rate: r, sum: r }; lines.push(cur); }
      total += r;
    }
    return { total: total, lines: lines };
  }
  function findPkg(id){ return (P().packages || []).filter(function(p){ return p.id === id; })[0] || null; }
  function matchPackage(start, end){ return (P().packages || []).filter(function(p){ return p.start === start && p.end === end; })[0] || null; }
  // 그날의 패키지 금액 (성수기면 성수기 패키지)
  function pkgPrice(day, pkg){
    if (typeof pkg === 'string') pkg = findPkg(pkg); if (!pkg || !day) return null;
    return day.peak ? pkg_(day.peak, pkg.id) : pkg.price[day.col];
  }
  function pkg_(pk, id){ return pk.pkg && pk.pkg[id] != null ? pk.pkg[id] : null; }
  // 그날 그 패키지 시간을 시간제로 계산한 정상가 (성수기 가산액 포함)
  function pkgRegular(day, pkg){ if (typeof pkg === 'string') pkg = findPkg(pkg); return hoursFee(day, pkg.start, pkg.end).total + (day.peak ? day.peak.surcharge : 0); }
  // 선택한 시간을 모두 포함하면서 더 싼 패키지가 있으면 알려 줍니다
  function suggestPackage(day, start, end, fee){
    var best = null;
    (P().packages || []).forEach(function(p){
      if (p.start <= start && p.end >= end && !(p.start === start && p.end === end)){
        var price = pkgPrice(day, p); if (price != null && price < fee && (!best || price < best.price)) best = { pkg: p, price: price, saving: fee - price };
      }
    });
    return best;
  }

  /* ---------- 옵션 ---------- */
  function optDef(id){ return (P().options || []).filter(function(o){ return o.id === id; })[0] || null; }
  function optionLines(sel, ctx){
    sel = sel || {}; var out = [];
    (P().options || []).forEach(function(o){
      var v = sel[o.id]; if (!v) return;
      var qty, amount;
      if (o.per === 'manager'){ var cnt = clampInt(v.count, 1, 10, 1), hrs = clampInt(v.hours, 1, 24, ctx.hours); qty = cnt + '명 × ' + hrs + '시간'; amount = o.price * cnt * hrs; }
      else if (o.per === 'person'){ qty = ctx.people + '명'; amount = o.price * ctx.people; }
      else { qty = '1' + (o.unit.indexOf('장') >= 0 ? '장' : o.unit.indexOf('개') >= 0 ? '개' : '회'); amount = o.price; }
      out.push({ id: o.id, label: o.label, qty: qty, unitPrice: o.price, unit: o.unit, amount: amount, desc: o.desc });
    });
    return out;
  }

  /* ---------- 환불 ---------- */
  function refundFor(daysBefore){
    var r = P().refund;
    if (daysBefore >= 15) return r[1]; if (daysBefore >= 8) return r[2]; if (daysBefore >= 6) return r[3]; if (daysBefore >= 4) return r[4]; return r[5];
  }

  /* ---------- 견적 ---------- */
  // input: { date, start, end, people, purpose, options:{manager:{count,hours}, cleaning:true, disposable:true, banner:true, xbanner:true}, regular:bool }
  function quote(input){
    var D = P(); if (!D) return null;
    var date = input.date || todayIso(), day = dayInfo(date); if (!day) return null;
    var start = clampInt(input.start, D.openFrom, D.openTo - 1, 13), end = clampInt(input.end, start + D.minHours, D.openTo, Math.min(start + 4, D.openTo));
    var people = clampInt(input.people, 1, D.people.max, D.people.base);
    var pk = day.peak, col = day.col, hours = end - start;
    var hf = hoursFee(day, start, end);
    var surcharge = pk ? (pk.surcharge || 0) : 0, hourlyTotal = hf.total + surcharge;
    var pkg = matchPackage(start, end), pkgInfo = null, spaceFee = hourlyTotal;
    if (pkg){
      var price = pkgPrice(day, pkg);
      if (price != null){ pkgInfo = { id: pkg.id, label: pkg.label, time: pkg.time, hours: pkg.hours, regular: hourlyTotal, price: price, saving: Math.max(0, hourlyTotal - price), pct: hourlyTotal > price ? Math.round((1 - price / hourlyTotal) * 100) : 0 }; spaceFee = price; }
    }
    var suggest = pkgInfo ? null : suggestPackage(day, start, end, hourlyTotal);
    var peopleBase = day.peopleBase;
    var extraPeople = Math.max(0, people - peopleBase), peopleFee = extraPeople * D.people.extra;
    var opts = optionLines(input.options, { hours: hours, people: people });
    var optFee = opts.reduce(function(a, o){ return a + o.amount; }, 0);
    var total = spaceFee + peopleFee + optFee;
    var breakfast = D.breakfastUntil ? start < D.breakfastUntil : false;
    var dawnHours = hf.lines.filter(function(l){ return l.dawn; }).reduce(function(a, l){ return a + l.hours; }, 0);
    var notes = [], warns = [];
    if (pk) notes.push(pk.seasonLabel + ' 요금(' + pk.label + ' 기준)으로 계산했습니다. 기준 인원 ' + pk.people + '명이 공간료에 들어 있고' + (pk.people > D.people.base ? ' 그보다 적게 오셔도 공간료는 같습니다.' : ' ' + (pk.people + 1) + '명째부터 1명당 ' + man(D.people.extra) + '을 더합니다.') + (surcharge && !pkgInfo ? ' 시간제에는 1건당 가산액 ' + man(surcharge) + '이 더해져 있습니다.' : ''));
    else if (day.why) notes.push(day.why);
    if (breakfast) notes.push('조찬 모임은 따로 연락 주시면 추가 협찬과 할인을 안내해 드립니다.' + (dawnHours ? ' 새벽 05–07시는 심야 시간대 요금으로 계산했습니다.' : ''));
    if (input.regular) notes.push('4회 이상 미리 예약하는 정기 모임은 별도 할인과 추가 협찬을 안내합니다. 아래 금액은 1회 기준입니다.');
    if (input.purpose === 'popup' || input.purpose === 'shooting') notes.push('팝업·전시·행사·촬영은 성격과 기간에 맞춰 별도 할인을 안내합니다. 아래 금액은 기본 요금표 기준입니다.');
    if (suggest) notes.push(suggest.pkg.label + '(' + suggest.pkg.time + ')로 잡으면 ' + man(suggest.saving) + ' 더 저렴합니다. 시간이 더 길어도 같은 금액입니다.');
    if (end > 24) notes.push('자정을 넘기는 시간은 이용일 기준 심야 요금(24–07시)으로 계산합니다.' + (pk ? ' 성수기에도 시작한 이용일의 요금만 적용됩니다.' : ''));
    return {
      date: date, day: day, col: col, colLabel: day.colLabel, start: start, end: end, hours: hours, range: rangeLabel(start, end),
      people: people, peopleBase: peopleBase, purpose: input.purpose || '', regular: !!input.regular, breakfast: breakfast,
      peak: pk, surcharge: surcharge,
      time: { fee: hf.total, lines: hf.lines, total: hourlyTotal }, pkg: pkgInfo, suggest: suggest,
      spaceFee: spaceFee, peopleExtra: extraPeople, peopleFee: peopleFee, options: opts, optionFee: optFee,
      total: total, deposit: D.deposit.amount, notes: notes, warnings: warns, version: D.version
    };
  }

  /* ---------- 요금 달력용: 한 달치 패키지(또는 시간대) 금액 ---------- */
  function monthDays(ym){
    var p = ym.split('-'), y = +p[0], m = +p[1], out = [];
    var last = new Date(y, m, 0).getDate();
    for (var d = 1; d <= last; d++){ var s = y + '-' + pad(m) + '-' + pad(d); var di = dayInfo(s); out.push(di); }
    return out;
  }
  function monthPrices(ym, pkgId){
    var pkg = findPkg(pkgId);
    return monthDays(ym).map(function(di){ return { iso: di.iso, day: di, price: pkg ? pkgPrice(di, pkg) : null, peak: di.peak, peopleBase: di.peopleBase }; });
  }

  /* ---------- 문의서·카카오톡용 요약 글 ---------- */
  function summaryText(r, purposeLabel){
    if (!r) return '';
    var D = P(), L = [];
    L.push('[메가스팟 건대 예상 금액] ' + r.version);
    L.push('이용일: ' + kdateY(r.date) + (r.day.holiday ? ' · ' + r.day.holiday : '') + ' → ' + r.colLabel + ' 요금');
    L.push('시간: ' + r.range + (r.pkg ? ' · ' + r.pkg.label : ''));
    L.push('인원: ' + r.people + '명' + (r.peopleExtra ? ' (기준 ' + r.peopleBase + '명 + ' + r.peopleExtra + '명)' : ' (기준 ' + r.peopleBase + '명 포함)'));
    if (purposeLabel) L.push('모임: ' + purposeLabel);
    L.push('--------------------');
    if (r.pkg) L.push('공간료 ' + r.pkg.label + ' ' + won(r.pkg.price) + (r.pkg.pct ? ' (시간 요금 ' + won(r.pkg.regular) + ' → ' + r.pkg.pct + '% 할인)' : ''));
    else {
      L.push('공간료 ' + won(r.time.total));
      r.time.lines.forEach(function(l){ L.push('  · ' + l.label + ' ' + hourLabel(l.from) + '–' + hourLabel(l.to) + ' ' + l.hours + '시간 × ' + won(l.rate)); });
      if (r.surcharge) L.push('  · 성수기 포함 인원 ' + r.peopleBase + '명 가산 ' + won(r.surcharge));
    }
    if (r.peopleFee) L.push('인원 추가 ' + r.peopleExtra + '명 × ' + won(D.people.extra) + ' = ' + won(r.peopleFee));
    r.options.forEach(function(o){ L.push(o.label + ' ' + o.qty + ' = ' + won(o.amount)); });
    L.push('--------------------');
    L.push('합계 ' + won(r.total) + ' (' + D.vatNote.replace('표시 금액은 ', '').replace(' 기준입니다.', '') + ')');
    L.push('보증금 ' + won(r.deposit) + ' 별도 (이용 뒤 반환)');
    r.warnings.concat(r.notes).forEach(function(n){ L.push('※ ' + n); });
    return L.join('\n');
  }

  root.MEGASPOT_PRICE = {
    data: P, fmt: fmt, won: won, man: man, clampInt: clampInt,
    parse: parse, iso: iso, addDays: addDays, diffDays: diffDays, todayIso: todayIso, kdate: kdate, kdateY: kdateY, isOff: isOff,
    dayInfo: dayInfo, colLabel: colLabel, hourLabel: hourLabel, rangeLabel: rangeLabel, bandOf: bandOf, isDawn: isDawn, ratesFor: ratesFor, rateAt: rateAt, hoursFee: hoursFee,
    findPkg: findPkg, matchPackage: matchPackage, pkgPrice: pkgPrice, pkgRegular: pkgRegular, suggestPackage: suggestPackage, optDef: optDef, refundFor: refundFor,
    peakOf: peakOf, peakPeriods: peakPeriods, inPeakPeriod: inPeakPeriod, monthDays: monthDays, monthPrices: monthPrices,
    quote: quote, summaryText: summaryText
  };
})(typeof window !== 'undefined' ? window : globalThis);
