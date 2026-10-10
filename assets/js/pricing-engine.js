/* =====================================================================
   메가스팟 건대 · 요금 계산
   가격구조도 v1.0의 계산 순서를 그대로 따릅니다.
     ① 기본 공간료 또는 연속 이용 요금 → ② 할증 → ③ 할인(합계 25%까지)
     ④ 만 원 단위 반올림 → ⑤ 패키지가와 옵션 더하기
   - 요금 숫자는 data/pricing-gundae.js, 공휴일은 data/holidays-kr.js에 있습니다.
   - 이 파일은 계산만 합니다. 표와 계산기 화면은 pricing-ui.js가 그립니다.
   ===================================================================== */
(function(root){
  'use strict';
  var SPACE = 'megaspot-gundae';
  function P(){ return ((root.MEGASPOT_PRICING || {})[SPACE]) || null; }
  function HOL(){ return root.MEGASPOT_HOLIDAYS || {}; }

  /* ---------- 숫자·표기 ---------- */
  var EPS = 1e-7;
  function round10k(x){ return Math.floor(x / 10000 + 0.5 + EPS) * 10000; }   // 만 원 단위 반올림
  function floor50k(x){ return Math.floor(x / 50000 + EPS) * 50000; }         // 5만 원 단위 내림
  function fmt(n){ return Math.round(n).toLocaleString('ko-KR'); }
  function won(n){ return fmt(n) + '원'; }
  function man(n){ n = Math.round(n); return n % 10000 === 0 ? fmt(n / 10000) + '만 원' : won(n); }
  function manNum(n){ return (Math.round(n / 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }); }
  function signed(n){ return (n > 0 ? '+' : n < 0 ? '−' : '') + man(Math.abs(n)); }
  function supplyOf(total){ var s = Math.round(total * 10 / 11); return { supply: s, vat: total - s }; }
  function batchim(word){ var s = String(word || '').replace(/[^가-힣]/g, ''); if (!s) return false; var c = s.charCodeAt(s.length - 1) - 0xAC00; return c >= 0 && c % 28 !== 0; }
  function josa(word, withB, withoutB){ return word + (batchim(word) ? withB : withoutB); }
  function clampInt(v, lo, hi, dflt){ var n = parseInt(v, 10); if (!isFinite(n)) n = dflt; return Math.max(lo, Math.min(hi, n)); }
  function num(v, lo, hi){ var n = parseFloat(v); if (!isFinite(n)) n = 0; return Math.max(lo, Math.min(hi, n)); }

  /* ---------- 날짜 ---------- */
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function parse(s){ var p = String(s || '').split('-'); if (p.length !== 3) return null; var d = new Date(+p[0], +p[1] - 1, +p[2], 12); return isNaN(d.getTime()) ? null : d; }
  function iso(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(s, n){ var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b){ return Math.round((parse(b) - parse(a)) / 86400000); }   // b − a (일)
  function todayIso(){ var d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)); }
  function kdate(s){ var d = parse(s); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + DOW[d.getDay()] + ')'; }
  function kdateY(s){ var d = parse(s); return d.getFullYear() + '년 ' + kdate(s); }
  function isOff(s){ var d = parse(s); return d.getDay() === 0 || d.getDay() === 6 || !!HOL()[s]; }

  /* ---------- 요일 구분 (공휴일 규칙 · 가격구조도 6.5) ---------- */
  // 공휴일 낮은 토요일 요금, 공휴일 저녁은 다음 날도 쉬면 토요일·평일이면 일요일 요금, 공휴일 전날 저녁은 금요일 요금
  function dayInfo(s){
    var d = parse(s); if (!d) return null;
    var dow = d.getDay(), hol = HOL()[s] || '', next = addDays(s, 1), nextHol = HOL()[next] || '';
    var base = dow === 5 ? 'fri' : dow === 6 ? 'sat' : dow === 0 ? 'sun' : 'wd';
    var cols = { am: base, pm: base, ev: base }, notes = [];
    if (hol) {
      cols.am = cols.pm = 'sat';
      cols.ev = isOff(next) ? 'sat' : 'sun';
      notes.push(kdate(s) + '은 ' + hol + '입니다. 낮 블록은 토요일 요금이고, 저녁은 ' + (cols.ev === 'sat' ? '다음 날도 쉬는 날이라 토요일 요금' : '다음 날이 평일이라 일요일 요금') + '입니다.');
    } else if (nextHol && dow !== 6) {
      cols.ev = 'fri';
      notes.push('다음 날인 ' + kdate(next) + '이 ' + josa(nextHol, '이라', '라') + ' 저녁 블록은 금요일 요금입니다.');
    }
    var until = root.MEGASPOT_HOLIDAYS_UNTIL || '9999-12-31';
    return { iso: s, dow: dow, dowLabel: DOW[dow], month: d.getMonth() + 1, holiday: hol, nextHoliday: nextHol, off: isOff(s), weekday: dow >= 1 && dow <= 5 && !hol, cols: cols, notes: notes, known: s <= until };
  }

  function colLabel(col){ var c = (P().cols || []).filter(function(x){ return x.id === col; })[0]; return c ? c.label : col; }
  function slotDef(id){ return (P().slots || []).filter(function(x){ return x.id === id; })[0]; }
  function rate(slot, col){ return P().base[slot][col]; }
  function hourly(slot, col){ return rate(slot, col) / 4; }
  function isPeak(slot, col, holiday){ return (slot === 'ev' && (col === 'fri' || col === 'sat' || !!holiday)) || (slot === 'pm' && col === 'sat'); }
  function isNoDisc(slot, col, month){ return slot === 'ev' && (month === 11 || month === 12) && (col === 'fri' || col === 'sat'); }
  function decPct(slot, col, month){ var dc = P().december; return (month === 12 && slot === 'ev') ? ((col === 'fri' || col === 'sat') ? dc.peak : dc.other) : 0; }

  /* ---------- 블록 묶음 ---------- */
  var ORDER = ['am', 'pm', 'ev'];
  function normSlots(list){ list = list || []; return ORDER.filter(function(s){ return list.indexOf(s) >= 0; }); }
  function contiguous(sl){ if (sl.length < 2) return false; for (var i = 1; i < sl.length; i++) if (ORDER.indexOf(sl[i]) - ORDER.indexOf(sl[i - 1]) !== 1) return false; return true; }
  function contPct(n){ var c = P().continuous; return n >= 3 ? c.three : n === 2 ? c.two : 0; }
  function hh(h){ return pad(h % 24) + ':00'; }
  function span(sl){
    if (!sl.length) return null;
    var a = slotDef(sl[0]), b = slotDef(sl[sl.length - 1]);
    var cont = sl.length === 1 || contiguous(sl);
    var name = sl.length === 1 ? a.label : sl.length === 3 ? '전일' : (sl[0] === 'am' && sl[1] === 'pm') ? '주간' : (sl[0] === 'pm' && sl[1] === 'ev') ? '오후~저녁' : '';
    var label = cont ? name + ' ' + hh(a.start) + '–' + hh(b.end) : sl.map(function(id){ var d = slotDef(id); return d.label + ' ' + hh(d.start) + '–' + hh(d.end); }).join(' + ');
    var code = sl.length === 1 ? sl[0] : sl.length === 3 ? 'day' : (sl.join('') === 'ampm' ? 'ampm' : sl.join('') === 'pmev' ? 'pmev' : 'custom');
    return { start: a.start, end: b.end, hours: cont ? b.end - a.start : sl.length * 4, contiguous: cont && sl.length > 1, label: label, code: code };
  }

  /* ---------- 하루 공간료 ---------- */
  // o: { customer:'personal'|'corp'|'student', regular, prepay, semester, building, nonrefund, lead(계약일→이용일 일수) }
  function spaceFee(day, slots, o){
    o = o || {};
    var pr = P(), sl = normSlots(slots);
    var blocks = sl.map(function(s){ var col = day.cols[s]; return { slot: s, col: col, base: rate(s, col), peak: isPeak(s, col, day.holiday), noDisc: isNoDisc(s, col, day.month) }; });
    var sum = blocks.reduce(function(a, b){ return a + b.base; }, 0);
    var cp = contiguous(sl) ? contPct(sl.length) : 0;
    var start = cp ? floor50k(sum * (100 - cp) / 100) : sum;
    var decWaived = (o.lead == null ? 0 : o.lead) >= pr.december.earlyDays;
    var exact = 0, surExact = 0, capped = false;
    blocks.forEach(function(b){
      b.share = sum ? start * b.base / sum : 0;
      b.decPct = decPct(b.slot, b.col, day.month);
      b.sur = decWaived ? 0 : b.decPct;
      var parts = [];
      if (!b.noDisc) {
        if (o.regular) { parts.push(['정기 대관', b.peak ? 10 : 20]); if (o.prepay) parts.push(['선납', 5]); }
        if (o.customer === 'student' && b.col === 'wd' && !b.peak) parts.push(['학생·비영리', 15]);
        if (o.semester && o.customer === 'student' && !b.peak) parts.push(['학기 묶음', 15]);
        if ((day.month === 7 || day.month === 8) && b.col === 'wd' && b.slot !== 'ev') parts.push(['여름 비수기', 10]);
        if (o.building) parts.push(['같은 건물 결합', 10]);
        if (o.nonrefund && o.customer === 'personal' && !b.peak) parts.push(['환불 불가 특가', 10]);
      }
      var t = parts.reduce(function(a, p){ return a + p[1]; }, 0);
      b.parts = parts; b.discRaw = t; b.disc = Math.min(pr.discountCap, t); if (t > pr.discountCap) capped = true;
      b.surAmt = b.share * b.sur / 100;
      b.final = (b.share + b.surAmt) * (100 - b.disc) / 100;
      surExact += b.surAmt; exact += b.final;
    });
    var space = round10k(exact), sur = round10k(surExact);
    return {
      slots: sl, blocks: blocks, sum: sum, contPct: cp, start: start, surcharge: sur, discount: space - start - sur, space: space,
      decAny: blocks.some(function(b){ return b.decPct > 0; }), decWaived: decWaived, capped: capped,
      peakAny: blocks.some(function(b){ return b.peak; }), noDiscAny: blocks.some(function(b){ return b.noDisc; })
    };
  }

  // 할인 이름표 — 블록마다 다르면 블록별로 적습니다
  function discountLabel(blocks){
    var withD = blocks.filter(function(b){ return b.disc > 0; });
    if (!withD.length) return '';
    function one(b){ return b.parts.map(function(p){ return p[0] + ' ' + p[1] + '%'; }).join(' + ') + (b.discRaw > b.disc ? ' → ' + b.disc + '%' : ''); }
    var first = one(withD[0]);
    var same = withD.length === blocks.length && withD.every(function(b){ return one(b) === first; });
    if (same) return first;
    return blocks.map(function(b){ return slotDef(b.slot).label + (b.peak ? '(피크)' : '') + ' ' + (b.disc ? one(b) : '할인 없음'); }).join(' · ');
  }

  function findPkg(id){ return (P().packages || []).filter(function(p){ return p.id === id; })[0] || null; }
  function pkgCheck(pkg, day, sl){
    var key = sl.join('+');
    if (pkg.id === 'seminar') return (day.weekday && (key === 'am' || key === 'pm')) ? { ok: true } : { ok: false, msg: '세미나 패키지는 월–금 오전이나 오후 블록 하나에 씁니다.' + (day.weekday && key === 'am+pm' ? ' 09–18시 행사라면 워크숍 데이 패키지를 고르세요.' : '') };
    if (pkg.id === 'workshop') return (day.weekday && key === 'am+pm') ? { ok: true } : { ok: false, msg: '워크숍 데이 패키지는 월–금 09:00–18:00(오전·오후 연속)에 씁니다.' };
    if (pkg.id === 'family') return (day.off && sl.indexOf('ev') < 0) ? { ok: true } : { ok: false, msg: '가족 기념 패키지는 토·일·공휴일 오전·오후 블록에 씁니다.' };
    return { ok: true };
  }

  /* ---------- 결제·보증금·취소 ---------- */
  function payment(total, customer, multiDay, date, today){
    var pr = P();
    var contract = customer !== 'personal' || total >= pr.contractThreshold || !!multiDay;
    if (!contract) return { type: 'personal', label: '개인 결제', text: '예약할 때 ' + won(total) + ' 전액 결제 (카드·계좌이체)' };
    var dep = Math.round(total * pr.contractDepositPct / 100);
    var due = addDays(date, -pr.balanceDays);
    var fullNow = diffDays(today, date) < pr.balanceDays;
    return { type: 'contract', label: '행사 계약', deposit: dep, balance: total - dep, due: due, fullNow: fullNow,
      text: fullNow ? '이용일까지 7일이 남지 않아 계약할 때 ' + won(total) + ' 전액' : '계약할 때 계약금 ' + won(dep) + ', ' + kdate(due) + '까지 잔금 ' + won(total - dep) };
  }
  function depositFor(kind, customer){
    var d = P().deposit, row = kind === 'popup' ? d[2] : kind === 'food' ? d[1] : d[0];
    return { amount: row[1], label: row[0], note: row[2], corp: customer === 'corp' ? '법인 행사 계약은 ' + d[3][2] : '' };
  }
  function cancelText(kind){ var c = P().cancelSummary; return kind === 'nonrefund' ? c.nonrefund : kind === 'personal' ? c.personal : c.contract; }
  function perPerson(amount, people){ return people > 0 ? Math.round(amount / people / 10) * 10 : 0; }

  /* ---------- 행사 대관 견적 ---------- */
  // o: { date, slots:['pm'], people, customer, pkg, regular, prepay, semester, sessions, building, nonrefund,
  //      layout:'base'|'self'|'partial'|'full', manager, av:''|'4'|'day', staff, mics, light, smog, photo,
  //      food:''|'snack'|'meal', catering, glass, prev, next, extend, setup, late, today, contractDate }
  function quoteEvent(o){
    o = o || {};
    var pr = P(), opt = pr.opt;
    var res = { mode: 'event', ok: false, errors: [], warnings: [], notes: [], lines: [], included: [] };
    var today = o.today || todayIso();
    var day = dayInfo(o.date);
    if (!day) { res.errors.push('이용일을 골라 주세요.'); return res; }
    if (diffDays(today, o.date) < 0) { res.errors.push('지난 날짜입니다. 오늘 이후 날짜를 골라 주세요.'); return res; }
    var sl = normSlots(o.slots);
    if (!sl.length) { res.errors.push('이용할 블록을 하나 이상 골라 주세요.'); return res; }
    var sp = span(sl);
    var people = clampInt(o.people, 0, 999, 0);
    var cust = ['personal', 'corp', 'student'].indexOf(o.customer) >= 0 ? o.customer : 'personal';
    var sessions = clampInt(o.sessions, 1, 52, 1);
    var regular = !!o.regular, semester = !!o.semester && cust === 'student';
    if (o.semester && cust !== 'student') res.warnings.push('학기 묶음 할인은 학생 단체가 계약할 때 적용합니다.');
    if (regular && sessions < 6) { res.warnings.push('정기 대관 할인은 월 2회 이상, 3개월 이상(6회 이상) 계약할 때 적용합니다. 회차를 6회 이상으로 바꾸면 할인이 들어갑니다.'); regular = false; }
    if (semester && sessions < 3) { res.warnings.push('학기 묶음 할인은 한 학기 행사 3회 이상을 한 번에 계약할 때 적용합니다.'); semester = false; }
    var nonrefund = !!o.nonrefund && cust === 'personal' && !regular && !semester;
    if (o.nonrefund && !nonrefund) res.warnings.push('환불 불가 특가는 개인 고객이 한 번 이용할 때만 고를 수 있습니다.');
    var lead = diffDays(o.contractDate || today, o.date);
    var daysLeft = diffDays(today, o.date);

    if (people > pr.maxPeople) res.warnings.push('최대 이용 인원은 ' + pr.maxPeople + '명입니다. 그보다 많은 행사는 문의해 주세요.');
    if (!day.known) res.warnings.push('공휴일 정보가 확정되지 않은 날짜라 요일 기준으로 계산했습니다.');
    day.notes.forEach(function(n){ res.notes.push(n); });

    // 패키지
    var pkg = o.pkg ? findPkg(o.pkg) : null;
    if (pkg && regular) { res.warnings.push('정기 대관은 패키지 대신 정기 대관 할인으로 계산합니다. 패키지를 빼고 계산했습니다.'); pkg = null; }
    if (pkg) { var chk = pkgCheck(pkg, day, sl); if (!chk.ok) { res.warnings.push(chk.msg + ' 패키지를 빼고 계산했습니다.'); pkg = null; } }

    // ① ~ ④ 공간료
    var sf = spaceFee(day, sl, { customer: cust, regular: regular, prepay: regular && !!o.prepay, semester: semester, building: !!o.building, nonrefund: nonrefund, lead: lead });
    var baseTxt = sf.blocks.map(function(b){ return slotDef(b.slot).label + ' ' + manNum(b.base); }).join(' + ');
    var baseNote = day.dowLabel + '요일 ' + sp.label + (sl.length > 1 ? ' · ' + baseTxt + '만 원' : '');
    var adj = [];
    if (sf.contPct) adj.push({ k: 'adj', label: '연속 이용 ' + sf.contPct + '% 할인', note: sl.length + '블록 연속 · 5만 원 단위 내림 → ' + man(sf.start), amount: sf.start - sf.sum });
    if (sf.surcharge) adj.push({ k: 'adj', label: '12월 저녁 할증 ' + sf.blocks.filter(function(b){ return b.sur; })[0].sur + '%', note: '이용일 45일 전까지 계약하면 받지 않습니다', amount: sf.surcharge });
    if (sf.discount) adj.push({ k: 'adj', label: '할인', note: discountLabel(sf.blocks) + ' · 만 원 단위 반올림', amount: sf.discount });
    if (adj.length) {
      res.lines.push({ k: 'base', label: '기본 공간료', note: baseNote, amount: sf.sum });
      adj.forEach(function(a){ res.lines.push(a); });
      res.lines.push({ k: 'sub', label: '공간료', amount: sf.space });
    } else res.lines.push({ k: 'sub', label: '공간료', note: baseNote, amount: sf.space });

    // ⑤ 패키지
    var items = [];
    function add(label, amount, note){ if (amount) items.push({ k: 'item', label: label, amount: amount, note: note || '' }); }
    var inc = pkg ? (pkg.inc || {}) : {};
    if (pkg) {
      items.push({ k: 'pkg', label: '패키지 · ' + pkg.label, amount: pkg.price, note: pkg.kind === 'total' ? '공간료와 합쳐 총 ' + man(sf.space + pkg.price) : pkg.save });
      pkg.items.forEach(function(it){ if (pkg.kind !== 'total' || it[0].indexOf('연속 이용') < 0) res.included.push(it[0]); });
    }

    // 옵션
    var hours = sp.hours + Math.ceil(num(o.extend, 0, 2));
    var layout = o.layout || 'base';
    if (layout === 'partial' || layout === 'full') {
      if (inc.layout !== 'full') add(layout === 'full' ? '배치 전체 전환' : '배치 부분 변경', opt.layout[layout], layout === 'full' ? '배치를 바꾸고 끝난 뒤 되돌립니다' : '테이블 일부 이동, 의자 줄 맞춤');
    } else if (layout === 'self') {
      res.notes.push('주최 측이 직접 배치하면 무료입니다. 블록 안에 원상복구까지 마쳐 주세요. 복구가 안 되면 보증금에서 25만 원을 공제합니다.');
    }
    if (o.manager) {
      var incH = inc.manager ? (pkg.id === 'workshop' ? 9 : 4) : 0;
      if (!incH) add('현장 매니저 ' + hours + '시간', opt.managerFirst + Math.max(0, hours - 4) * opt.managerHour, '4시간 15만 원, 1시간 추가 3만 원');
      else if (hours > incH) add('현장 매니저 ' + (hours - incH) + '시간 추가', (hours - incH) * opt.managerHour, '패키지에 ' + incH + '시간 포함');
    }
    if (o.av === '4' || o.av === 'day') {
      if (inc.av) { if (o.av === 'day') add('AV 오퍼레이터 종일로 변경', opt.avDay - opt.av4, '패키지에 4시간 포함'); }
      else add(o.av === 'day' ? 'AV 오퍼레이터 종일' : 'AV 오퍼레이터 4시간', o.av === 'day' ? opt.avDay : opt.av4, '영상·음향 송출, 마이크 운영');
    }
    var staff = clampInt(o.staff, 0, 20, 0);
    if (staff) { var units = Math.ceil(hours / 4); add('접수·안내 스태프 ' + staff + '명', staff * units * opt.staff, units > 1 ? '1인 4시간 10만 원 × ' + units + '회' : '1인 4시간 10만 원'); }
    var mics = clampInt(o.mics, 0, 30, 0);
    if (mics) add('무선마이크 추가 ' + mics + '개', mics * opt.mic, '기본 2개 외');
    if (o.light && !inc.light) add('연출 조명', opt.light, 'LED 효과 조명');
    if (o.smog) { add('스모그머신', opt.smog, '화재감지기 대응과 사전 승인이 필요합니다'); res.notes.push('스모그머신은 화재감지기 대응과 사전 승인이 필요합니다. 사용 가능 여부를 예약 상담 때 확인해 드립니다.'); }
    if (o.photo && !inc.photo) add('포토존 세트', opt.photo, '');
    var meal = o.food === 'meal' || (pkg && pkg.food);
    if (meal) {
      var need = people > 100 ? opt.foodLarge : opt.foodSmall;
      if (inc.foodClean) { var covered = pkg.id === 'party' ? opt.foodLarge : opt.foodSmall; if (need > covered) add('식음 행사 정리 101명 이상 차액', need - covered, '패키지에는 100명 이하 기준이 들어 있습니다'); }
      else add('식음 행사 정리 (' + (people > 100 ? '101명 이상' : '100명 이하') + ')', need, '식사가 나오는 행사는 필수입니다');
    }
    if (o.catering) add('케이터링 세팅 지원', opt.catering, '수령, 배치, 회수');
    var glass = clampInt(o.glass, 0, 5, 0), gInc = inc.glass || 0;
    if (glass > gInc) add('유리잔 ' + ((glass - gInc) * 100) + '개', (glass - gInc) * opt.glass, '100개 5만 원');
    if (o.prev) add('전날 반입', opt.prev, '전날 마감 뒤 짐 보관');
    if (o.next) add('다음 날 반출', opt.next, '');

    // 시간 추가 (할인·할증 없이 시간 단가로)
    var last = sf.blocks[sf.blocks.length - 1], first = sf.blocks[0];
    var ext = num(o.extend, 0, 2); ext = Math.round(ext * 2) / 2;
    if (ext && last.slot !== 'ev') { add('사전 연장 ' + ext + '시간', hourly(last.slot, last.col) * ext, slotDef(last.slot).label + ' 시간 단가 ' + won(hourly(last.slot, last.col)) + ' · 앞뒤 블록이 비어 있을 때만'); }
    else if (ext && last.slot === 'ev') res.warnings.push('저녁 블록 뒤 연장은 심야 이용으로 계산합니다.');
    var setup = num(o.setup, 0, 2); setup = Math.round(setup * 2) / 2; if (first.slot === 'am') setup = Math.min(1, setup);
    if (setup) add('세팅 전용 시간 ' + setup + '시간', hourly(first.slot, first.col) * 0.5 * setup, '행사 없이 설치·리허설만 · 시간 단가의 50%' + (first.slot === 'am' ? ' (08–09시)' : ''));
    var late = clampInt(o.late, 0, pr.lateNight.maxHours, 0);
    if (late && sl.indexOf('ev') >= 0) {
      var evCol = day.cols.ev, hv = hourly('ev', evCol);
      add('심야 이용 23:00–' + hh(23 + late) + ' (' + late + '시간)', (hv + pr.lateNight.manager) * late, '저녁 시간 단가 ' + won(hv) + ' + 심야 매니저 4만 원');
      res.notes.push(pr.lateNight.notes[1] + ' ' + pr.lateNight.notes[2]);
    } else if (late) res.warnings.push('심야 이용은 저녁 블록을 예약한 경우에만 이어서 쓸 수 있습니다.');

    items.forEach(function(it){ res.lines.push(it); });
    var perSession = sf.space + items.reduce(function(a, it){ return a + it.amount; }, 0);
    var total = perSession * sessions;

    // 안내문
    if (sf.decAny) {
      var deadline = addDays(o.date, -pr.december.earlyDays);
      if (sf.decWaived) res.notes.push(kdate(deadline) + '까지 계약하면 연말 할증 없이 이 금액입니다. 그 뒤에 계약하면 저녁 공간료에 ' + sf.blocks.filter(function(b){ return b.decPct; })[0].decPct + '% 할증이 붙습니다.');
      else res.notes.push('이용일 45일 전인 ' + kdate(deadline) + '이 지나 연말 할증이 붙었습니다. 12월 저녁은 45일 전까지 계약하면 할증을 받지 않습니다.');
    }
    var wantsDisc = regular || semester || o.building || nonrefund || cust === 'student';
    if (wantsDisc && sf.noDiscAny) res.notes.push('11–12월 금·토 저녁은 할인 없이 정가로만 판매합니다.');
    if (wantsDisc && sf.peakAny && !sf.noDiscAny) res.notes.push('피크 블록(' + pr.peakDef + ')에는 정기 대관(10%, 선납하면 15%)과 같은 건물 결합 할인만 적용합니다.');
    if (sf.capped) res.notes.push('할인은 여러 개를 합쳐도 25%까지입니다.');
    if (cust === 'student' && !sf.blocks.some(function(b){ return b.parts.some(function(p){ return p[0] === '학생·비영리'; }); }) && !sf.noDiscAny) res.notes.push('학생·비영리 할인은 월–목 블록에 적용합니다.');
    if (o.building) res.notes.push('같은 건물 1층·4층 공간 요금은 따로 안내합니다.');
    if (regular || semester || nonrefund || o.building) res.notes.push(pr.directOnly);
    if (daysLeft >= 0 && daysLeft <= 10 && !sf.peakAny && !regular) res.notes.push('이용일 10일 이내에 비어 있는 일반 블록은 임박 할인(최대 20%)을 받을 수 있습니다. 문의하실 때 확인해 드립니다.');
    if (sessions > 1) res.notes.push('모든 회차를 같은 요일·시간대로 계산했습니다. 회차마다 날짜가 다르면 금액이 달라질 수 있습니다.');

    var food = o.food === 'snack' || o.food === 'meal' || (pkg && pkg.food);
    var dep = depositFor(food ? 'food' : 'general', cust);
    var pay = payment(total, cust, sessions > 1, o.date, today);
    var sup = supplyOf(total);
    res.ok = true;
    res.day = day; res.span = sp; res.slots = sl; res.slotCode = sp.code; res.people = people; res.customer = cust;
    res.pkg = pkg; res.space = sf; res.perSession = perSession; res.sessions = sessions; res.total = total;
    res.supply = sup.supply; res.vat = sup.vat; res.perPerson = perPerson(perSession, people);
    res.deposit = dep; res.payment = pay; res.cancel = nonrefund ? 'nonrefund' : (pay.type === 'personal' ? 'personal' : 'contract');
    res.cancelText = cancelText(res.cancel);
    res.hold = (day.month === 11 || day.month === 12) ? 48 : 72;
    return res;
  }

  /* ---------- 팝업·전시 ---------- */
  function fullDayRate(day){ var c = day.cols; return floor50k((rate('am', c.am) + rate('pm', c.pm) + rate('ev', c.ev)) * (100 - P().continuous.three) / 100); }
  // o: { date(첫 운영일), days, setup(bool), customer, today }
  function quotePopup(o){
    o = o || {};
    var pr = P(), pp = pr.popup, res = { mode: 'popup', ok: false, errors: [], warnings: [], notes: [], lines: [], included: [] };
    var today = o.today || todayIso();
    var d0 = dayInfo(o.date);
    if (!d0) { res.errors.push('첫 운영일을 골라 주세요.'); return res; }
    var days = clampInt(o.days, 1, 30, 1);
    var setupIso = o.setup ? addDays(o.date, -1) : null;
    if (diffDays(today, setupIso || o.date) < 0) { res.errors.push('지난 날짜가 들어 있습니다. 날짜를 다시 골라 주세요.'); return res; }
    var total = 0;
    if (setupIso) {
      var sd = dayInfo(setupIso), sf = fullDayRate(sd), sa = floor50k(sf * pp.setupRatio / 100);
      res.lines.push({ k: 'item', label: '세팅데이 · ' + kdate(setupIso), note: '전일 요금 ' + man(sf) + '의 ' + pp.setupRatio + '% · 5만 원 단위 내림', amount: sa });
      total += sa;
    }
    var unknown = false;
    for (var i = 0; i < days; i++) {
      var di = dayInfo(addDays(o.date, i)); if (!di.known) unknown = true;
      var f = fullDayRate(di), pct = i === 0 ? 0 : (i < 3 ? pp.day2to3 : pp.day4plus);
      var amt = pct ? round10k(f * (100 - pct) / 100) : f;
      res.lines.push({ k: 'item', label: '운영 ' + (i + 1) + '일차 · ' + kdate(di.iso) + (di.holiday ? ' ' + di.holiday : ''), note: pct ? '전일 요금 ' + man(f) + '에서 ' + pct + '% 할인' : '전일 요금 (09:00–23:00)', amount: amt });
      total += amt;
    }
    if (setupIso && days === pp.week.days && pp.week.price < total) {
      res.lines.push({ k: 'adj', label: '7일 패키지 적용', note: pp.week.note + ' ' + man(pp.week.price), amount: pp.week.price - total });
      total = pp.week.price;
    }
    if (unknown) res.warnings.push('공휴일 정보가 확정되지 않은 날짜가 있어 요일 기준으로 계산했습니다.');
    if (days >= 5 && !(setupIso && days === pp.week.days)) res.notes.push('세팅데이 1일과 운영 6일을 함께 쓰면 7일 패키지(' + man(pp.week.price) + ')로 계산합니다.');
    pp.notes.forEach(function(n){ res.notes.push(n); });
    res.notes.push('11–12월 일정과 할인 적용 여부는 견적에서 확정합니다.');
    var cust = o.customer === 'personal' ? 'personal' : (o.customer || 'corp');
    var pay = payment(total, cust, days > 1 || !!setupIso, setupIso || o.date, today);
    var sup = supplyOf(total);
    res.ok = true; res.days = days; res.setup = !!setupIso; res.total = total; res.supply = sup.supply; res.vat = sup.vat;
    res.deposit = depositFor('popup', cust); res.payment = pay; res.cancel = pay.type === 'personal' ? 'personal' : 'contract'; res.cancelText = cancelText(res.cancel);
    res.slotCode = 'day'; res.customer = cust; res.hold = (d0.month === 11 || d0.month === 12) ? 48 : 72;
    return res;
  }

  /* ---------- 촬영 ---------- */
  // o: { date, kind:'commercial'|'small', hours, people, customer, today }
  function quoteShoot(o){
    o = o || {};
    var pr = P(), sh = pr.shooting, res = { mode: 'shoot', ok: false, errors: [], warnings: [], notes: [], lines: [], included: [] };
    var today = o.today || todayIso();
    var day = dayInfo(o.date);
    if (!day) { res.errors.push('촬영일을 골라 주세요.'); return res; }
    if (diffDays(today, o.date) < 0) { res.errors.push('지난 날짜입니다. 오늘 이후 날짜를 골라 주세요.'); return res; }
    var we = day.off, people = clampInt(o.people, 1, 999, 1), total = 0, h;
    if (o.kind === 'small') {
      var s = sh.small; h = clampInt(o.hours, s.minHours, 12, s.minHours);
      if ((parseInt(o.hours, 10) || 0) < s.minHours) res.warnings.push('소규모 촬영은 최소 ' + s.minHours + '시간입니다.');
      if (people > s.maxPeople) res.warnings.push('소규모 비상업 촬영은 ' + s.maxPeople + '명 이하만 받습니다. 인원이 많으면 상업 촬영 요금을 적용합니다.');
      var r = we ? s.we : s.wd;
      res.lines.push({ k: 'item', label: '소규모 비상업 촬영 ' + (we ? '주말·공휴일' : '평일') + ' ' + man(r) + ' × ' + h + '시간', note: '개인·유튜브·포트폴리오, 10명 이하', amount: r * h });
      total = r * h;
      res.notes.push('소규모 촬영은 이용일 14일 전까지 비어 있는 시간에만 예약할 수 있습니다.');
    } else {
      var c = sh.commercial; h = clampInt(o.hours, c.minHours, c.maxHours, c.minHours);
      if ((parseInt(o.hours, 10) || 0) < c.minHours) res.warnings.push('상업 촬영은 최소 ' + c.minHours + '시간입니다.');
      if ((parseInt(o.hours, 10) || 0) > c.maxHours) res.warnings.push('상업 촬영은 하루 최대 ' + c.maxHours + '시간까지 계산합니다.');
      var cr = we ? c.we : c.wd, base = cr * h, cap = we ? c.day12.we : c.day12.wd;
      if (base > cap) res.lines.push({ k: 'item', label: '상업 촬영 종일 (' + (we ? '주말·공휴일' : '평일') + ')', note: h + '시간 · 시간 요금 합계가 종일 요금(12시간 ' + man(cap) + ')보다 많아 종일 요금 적용', amount: cap });
      else res.lines.push({ k: 'item', label: '상업 촬영 ' + (we ? '주말·공휴일' : '평일') + ' ' + man(cr) + ' × ' + h + '시간', note: '광고·뮤직비디오·방송·기업 홍보', amount: base });
      total = Math.min(base, cap);
      if (people > c.freePeople) {
        var u = Math.ceil((people - c.freePeople) / 10), ex = u * c.perTen * h;
        res.lines.push({ k: 'item', label: '20명 초과 인원 (' + (c.freePeople + (u - 1) * 10 + 1) + '–' + (c.freePeople + u * 10) + '명 구간) ' + man(u * c.perTen) + ' × ' + h + '시간', note: '21명부터 10명마다 시간당 2만 원', amount: ex });
        total += ex;
      }
    }
    if (day.holiday) res.notes.push(kdate(o.date) + '은 ' + josa(day.holiday, '이라', '라') + ' 주말·공휴일 요금입니다.');
    if (!day.known) res.warnings.push('공휴일 정보가 확정되지 않은 날짜라 요일 기준으로 계산했습니다.');
    var cust = o.customer || (o.kind === 'small' ? 'personal' : 'corp');
    var pay = payment(total, cust, false, o.date, today);
    var sup = supplyOf(total);
    res.ok = true; res.hours = h; res.people = people; res.total = total; res.supply = sup.supply; res.vat = sup.vat;
    res.deposit = depositFor('popup', cust); res.deposit.label = '팝업·촬영';
    res.payment = pay; res.cancel = pay.type === 'personal' ? 'personal' : 'contract'; res.cancelText = cancelText(res.cancel);
    res.slotCode = 'custom'; res.customer = cust; res.hold = (day.month === 11 || day.month === 12) ? 48 : 72;
    return res;
  }

  /* ---------- 표 만들기용 ---------- */
  function tables(){
    var pr = P(), cols = pr.cols, cp2 = pr.continuous.two, cp3 = pr.continuous.three;
    return {
      rate: pr.slots.map(function(s){ return { slot: s, cells: cols.map(function(c){ var a = rate(s.id, c.id); return { col: c, amount: a, hourly: a / 4, peak: isPeak(s.id, c.id, false) }; }) }; }),
      continuous: cols.map(function(c){
        var a = rate('am', c.id), p = rate('pm', c.id), e = rate('ev', c.id);
        return { col: c, ampm: { sum: a + p, price: floor50k((a + p) * (100 - cp2) / 100) }, pmev: { sum: p + e, price: floor50k((p + e) * (100 - cp2) / 100) }, day: { sum: a + p + e, price: floor50k((a + p + e) * (100 - cp3) / 100) } };
      }),
      popup: cols.map(function(c){
        var f = floor50k((rate('am', c.id) + rate('pm', c.id) + rate('ev', c.id)) * (100 - cp3) / 100), pp = pr.popup;
        return { col: c, d1: f, d23: round10k(f * (100 - pp.day2to3) / 100), d4: round10k(f * (100 - pp.day4plus) / 100), setup: floor50k(f * pp.setupRatio / 100) };
      }),
      december: cols.map(function(c){ var e = rate('ev', c.id), pct = (c.id === 'fri' || c.id === 'sat') ? pr.december.peak : pr.december.other; return { col: c, pct: pct, surcharged: round10k(e * (100 + pct) / 100), early: e }; }),
      supply: pr.slots.map(function(s){ return { slot: s, cells: cols.map(function(c){ var a = rate(s.id, c.id), x = supplyOf(a); return { col: c, amount: a, supply: x.supply, vat: x.vat }; }) }; }),
      shortTime: { am: hourly('am', 'wd') * pr.shortTime.mult * pr.shortTime.hours, pm: hourly('pm', 'wd') * pr.shortTime.mult * pr.shortTime.hours },
      lateNight: cols.map(function(c){ return { col: c, hourly: hourly('ev', c.id), withManager: hourly('ev', c.id) + pr.lateNight.manager }; }),
      packages: pr.packages.map(function(p){
        var single = p.items.reduce(function(a, it){ return a + it[1]; }, 0);
        return { pkg: p, single: single, examples: (p.examples || []).map(function(ex){
          var key = ex[1], col = ex[2];
          var blockPart = key === 'ampm' ? floor50k((rate('am', col) + rate('pm', col)) * (100 - cp2) / 100) : rate(key, col);
          return { label: ex[0], total: blockPart + p.price };
        }) };
      })
    };
  }

  var api = {
    version: function(){ return P() ? P().version : ''; },
    data: P, dayInfo: dayInfo, colLabel: colLabel, slotDef: slotDef, rate: rate, hourly: hourly, isPeak: isPeak, isNoDisc: isNoDisc,
    normSlots: normSlots, contiguous: contiguous, span: span, spaceFee: spaceFee, quoteEvent: quoteEvent, quotePopup: quotePopup, quoteShoot: quoteShoot,
    payment: payment, supplyOf: supplyOf, tables: tables, findPkg: findPkg, pkgCheck: pkgCheck,
    round10k: round10k, floor50k: floor50k, won: won, man: man, manNum: manNum, signed: signed, fmt: fmt,
    kdate: kdate, kdateY: kdateY, addDays: addDays, diffDays: diffDays, todayIso: todayIso, josa: josa
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MEGASPOT_PRICE = api;
})(typeof window !== 'undefined' ? window : globalThis);
