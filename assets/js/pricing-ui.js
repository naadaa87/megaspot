/* =====================================================================
   메가스팟 건대 · 요금표와 예상 금액 계산기 화면
   - HTML에 <div data-price="rate-table"></div>처럼 자리만 두면 이 파일이 내용을 채웁니다.
   - 숫자는 모두 data/pricing-gundae.js에서 가져옵니다. 요금을 바꿀 때 이 파일은 고치지 않습니다.
   ===================================================================== */
(function(){
  'use strict';
  var M = window.MEGASPOT, E = window.MEGASPOT_PRICE;
  if (!M || !E || !E.data()) return;
  var esc = M.esc, $ = M.$, $$ = M.$$;
  var D = E.data(), T = E.tables();
  var man = E.man, won = E.won, manNum = E.manNum;
  var PAGE = '/spaces/megaspot-gundae/pricing/';

  function tbl(head, rows, cls){
    return '<div class="tbl-wrap"><table class="tbl ' + (cls || '') + '"><thead><tr>' + head.map(function(h){ return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>'
      + rows.map(function(r){ return '<tr>' + r.map(function(c, i){ return i === 0 ? '<td class="k">' + c + '</td>' : '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function list(items, cls){ return '<ul class="' + (cls || 'bullets') + '">' + items.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'; }
  function mn(n){ return '<b class="mn">' + manNum(n) + '</b><span class="mu">만 원</span>'; }
  var colHead = D.cols.map(function(c){ return esc(c.label); });
  var R = {};

  /* ---------- 요약 ---------- */
  R['version'] = function(el){ el.textContent = '요금표 ' + D.version + ' · ' + D.effective + ' 시행 · 표시 금액은 부가세 포함'; };
  R['facts'] = function(el){
    var mins = [], maxs = [];
    T.rate.forEach(function(r){ r.cells.forEach(function(c){ mins.push(c.amount); }); });
    var lo = Math.min.apply(null, mins), hi = Math.max.apply(null, mins);
    var dep = D.deposit.filter(function(d){ return d[1]; }).map(function(d){ return d[1]; });
    el.innerHTML = [
      [manNum(lo) + '–' + manNum(hi) + '<small>만 원</small>', '4시간 블록 공간료', '요일·시간대별 12칸 · 부가세 포함'],
      ['0<small>원</small>', '인원 추가요금', D.maxPeople + '명까지 같은 요금'],
      [D.continuous.two + '–' + D.continuous.three + '<small>%</small>', '블록을 이어 쓰면 할인', '2블록 ' + D.continuous.two + '%, 전일 ' + D.continuous.three + '%'],
      [manNum(Math.min.apply(null, dep)) + '–' + manNum(Math.max.apply(null, dep)) + '<small>만 원</small>', '보증금 (이용료와 별도)', '퇴실 점검 후 3영업일 안에 반환']
    ].map(function(f){ return '<div><b>' + f[0] + '</b><span><strong>' + esc(f[1]) + '</strong><br>' + esc(f[2]) + '</span></div>'; }).join('');
  };

  /* ---------- ① 기본 공간료 ---------- */
  R['rate-table'] = function(el){
    var all = []; T.rate.forEach(function(r){ r.cells.forEach(function(c){ all.push(c.amount); }); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var h = '<div class="rate-wrap"><table class="rate-table"><caption class="sr-only">메가스팟 건대 기본 공간료. 4시간 블록, 단위 만 원, 부가세 포함</caption>'
      + '<thead><tr><th scope="col" class="corner">단위 만 원</th>' + D.cols.map(function(c){ return '<th scope="col">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>';
    T.rate.forEach(function(r){
      h += '<tr><th scope="row"><b>' + esc(r.slot.label) + '</b><small>' + esc(r.slot.time) + '</small></th>';
      r.cells.forEach(function(c){
        var t = (c.amount - lo) / ((hi - lo) || 1);
        h += '<td class="rc' + (c.peak ? ' peak' : '') + '" data-slot="' + r.slot.id + '" data-col="' + c.col.id + '" style="background:rgba(31,83,213,' + (0.05 + 0.25 * t).toFixed(3) + ')" aria-label="' + esc(c.col.label + ' ' + r.slot.label + ' ' + man(c.amount) + (c.peak ? ', 피크 블록' : '')) + '"><b>' + manNum(c.amount) + '</b></td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table><div class="rate-legend"><span><i class="lg-peak"></i>피크 블록 · 정가 판매</span><span>준비·철수 포함 4시간</span><span>' + D.maxPeople + '명까지 같은 요금</span><span class="lg-hl-wrap" hidden><i class="lg-hl"></i>예상 금액 계산기에서 고른 블록</span></div></div>';
    el.innerHTML = h;
  };
  R['hourly-table'] = function(el){
    el.innerHTML = tbl(['시간대'].concat(colHead), T.rate.map(function(r){ return [esc(r.slot.label) + ' <span class="tiny muted">' + esc(r.slot.time) + '</span>'].concat(r.cells.map(function(c){ return won(c.hourly); })); }), 'tbl-num');
  };
  R['supply-table'] = function(el){
    el.innerHTML = tbl(['시간대'].concat(colHead), T.supply.map(function(r){ return [esc(r.slot.label)].concat(r.cells.map(function(c){ return E.fmt(c.supply) + '<br><span class="tiny muted">+ ' + E.fmt(c.vat) + '</span>'; })); }), 'tbl-num')
      + '<p class="tiny muted mt-1">공급가액 = 표시 요금 ÷ 1.1(원 단위 반올림), 부가세 = 표시 요금 − 공급가액. 기업 견적서에는 공급가액·부가세·합계를 나눠 적습니다.</p>';
  };
  R['includes'] = function(el){ el.innerHTML = '<dl class="inc-list">' + D.includes.map(function(i){ return '<div><dt>' + esc(i.k) + '</dt><dd>' + esc(i.d) + '</dd></div>'; }).join('') + '</dl>'; };
  R['block-rules'] = function(el){ el.innerHTML = list(D.blockRules); };

  /* ---------- ② 이용 방식 ---------- */
  R['continuous-table'] = function(el){
    el.innerHTML = tbl(['요일', '주간 09–18시<br><span class="tiny">2블록 · ' + D.continuous.two + '%</span>', '오후~저녁 14–23시<br><span class="tiny">2블록 · ' + D.continuous.two + '%</span>', '전일 09–23시<br><span class="tiny">3블록 · ' + D.continuous.three + '%</span>'],
      T.continuous.map(function(c){ function cell(x){ return mn(x.price) + '<div class="tiny muted">블록 합 ' + manNum(x.sum) + '</div>'; } return [esc(c.col.label), cell(c.ampm), cell(c.pmev), cell(c.day)]; }), 'tbl-num')
      + '<p class="tiny muted mt-1">할인한 금액은 5만 원 단위로 내립니다. 블록 사이 1시간(13–14시, 18–19시)도 함께 쓸 수 있습니다.</p>';
  };
  R['extension-table'] = function(el){
    var hv = E.hourly('ev', 'wd');
    el.innerHTML = tbl(['구분', '계산', '조건'], D.extension.map(function(x){ return [esc(x.k), '<span class="nw">시간 단가 × ' + x.mult.toFixed(1) + '</span>', esc(x.d)]; }))
      + '<p class="tiny muted mt-1">예: 평일 저녁(시간 단가 ' + won(hv) + ') 행사를 30분 미리 연장하면 ' + won(hv * 0.5) + ', 당일 연장이면 ' + won(hv * 0.5 * 1.2) + '입니다.</p>';
  };
  R['late-night'] = function(el){
    var f = E.hourly('ev', 'fri'), mg = D.lateNight.manager;
    el.innerHTML = list(D.lateNight.notes)
      + '<div class="chips-line mt-2">' + T.lateNight.map(function(x){ return '<span class="tag">' + esc(x.col.label) + ' 시간당 ' + won(x.hourly) + '</span>'; }).join('') + '</div>'
      + '<p class="tiny muted mt-2">예: 금요일 저녁 파티를 01시까지 하면 ' + man(E.rate('ev', 'fri')) + ' + ' + man(f) + ' × 2시간 + ' + man(mg) + ' × 2시간 = ' + man(E.rate('ev', 'fri') + (f + mg) * 2) + '입니다.</p>';
  };
  R['short-time'] = function(el){
    el.innerHTML = '<div class="chips-line"><span class="tag">평일 오전 2시간 ' + man(T.shortTime.am) + '</span><span class="tag">평일 오후 2시간 ' + man(T.shortTime.pm) + '</span></div><p class="small muted mt-2">' + esc(D.shortTime.note) + ' 시간 단가 × ' + D.shortTime.mult + ' × ' + D.shortTime.hours + '시간으로 계산합니다.</p>';
  };
  R['popup-table'] = function(el){
    var pp = D.popup;
    el.innerHTML = tbl(['요일', '운영 1일차', '2–3일차 <span class="tiny">(' + pp.day2to3 + '% 할인)</span>', '4일차부터 <span class="tiny">(' + pp.day4plus + '% 할인)</span>', '세팅데이 <span class="tiny">(전일 요금의 ' + pp.setupRatio + '%)</span>'],
      T.popup.map(function(p){ return [esc(p.col.label), mn(p.d1), mn(p.d23), mn(p.d4), mn(p.setup)]; }), 'tbl-num')
      + '<div class="notice mt-2"><div><b>7일 패키지 ' + man(pp.week.price) + '</b> — ' + esc(pp.week.note) + '. 월요일에 세팅하고 화–일요일에 운영하면 요일별 합계는 약 ' + man(popupWeekSum()) + '입니다.</div></div>'
      + list(pp.notes.concat(['보증금 ' + man(pp.deposit) + '을 이용료와 따로 받습니다.']), 'bullets mt-2');
  };
  function popupWeekSum(){ var t = T.popup; var wd = t[0], fr = t[1], sa = t[2], su = t[3]; return wd.setup + wd.d1 + wd.d23 + wd.d23 + fr.d4 + sa.d4 + su.d4; }
  R['shoot-table'] = function(el){
    var c = D.shooting.commercial, s = D.shooting.small;
    el.innerHTML = tbl(['구분', '평일', '주말·공휴일', '조건'], [
      ['상업 촬영', '시간당 ' + man(c.wd), '시간당 ' + man(c.we), esc(c.note)],
      ['상업 촬영 종일 (12시간)', man(c.day12.wd), man(c.day12.we), '12시간 연속 (예: 08–20시)'],
      ['소규모 비상업 촬영', '시간당 ' + man(s.wd), '시간당 ' + man(s.we), esc(s.note)]
    ]) + '<p class="tiny muted mt-1">촬영은 인원에 따라 요금을 더하는 유일한 예외입니다. 촬영 시장에서 일반적인 방식이라 그대로 따릅니다. 보증금은 ' + man(D.popup.deposit) + '입니다.</p>';
  };

  /* ---------- ③ 시즌·할인 ---------- */
  R['peak-table'] = function(el){
    el.innerHTML = tbl(['구분', '블록', '다루는 방식'], [
      ['<span class="badge badge-rust">피크</span>', esc(D.peakDef), '정가 판매. 정기 대관(10%, 선납하면 15%)과 같은 건물 결합(10%)만 적용'],
      ['<span class="badge badge-soft">일반</span>', '그 밖의 모든 블록', '할인 조건에 맞으면 적용'],
      ['<span class="badge badge-outline">할인 제외</span>', '11–12월 금·토 저녁', '어떤 할인도 적용하지 않음']
    ]);
  };
  R['december-table'] = function(el){
    var dc = D.december, y = new Date().getFullYear();
    var ex = y + '-12-18'; var exDay = E.dayInfo(ex);
    var exLine = exDay ? (E.kdate(ex) + ' 행사라면 ' + E.kdate(E.addDays(ex, -dc.earlyDays)) + '까지') : '';
    el.innerHTML = tbl(['구분'].concat(colHead), [
      ['12월 저녁 <span class="tiny muted">(할증 적용)</span>'].concat(T.december.map(function(d){ return mn(d.surcharged) + '<div class="tiny muted">+' + d.pct + '%</div>'; })),
      ['45일 전까지 계약'].concat(T.december.map(function(d){ return mn(d.early); }))
    ], 'tbl-num')
      + list(['금·토 요금이 적용되는 12월 저녁(공휴일 전날 포함)은 ' + dc.peak + '%, 나머지 12월 저녁은 ' + dc.other + '% 할증합니다. 점심 송년회를 받기 위해 낮 블록은 할증하지 않습니다.',
        '이용일 ' + dc.earlyDays + '일 전까지 계약하면 할증을 받지 않습니다.' + (exLine ? ' ' + exLine + '입니다.' : ''),
        '토 저녁은 130 × 1.15 = 149.5를 반올림해 150만 원입니다. 12월 24일처럼 공휴일 전날은 금요일 칸을 씁니다.'], 'bullets mt-2');
  };
  R['discount-table'] = function(el){
    el.innerHTML = tbl(['할인', '조건', '할인율', '적용 블록'], D.discounts.map(function(d){ return [esc(d.label), esc(d.cond), '<b>' + esc(d.rate) + '</b>', esc(d.scope)]; }))
      + '<p class="tiny muted mt-1">' + esc(D.directOnly) + '</p>';
  };
  R['discount-order'] = function(el){ el.innerHTML = '<ol class="numbered compact">' + D.discountOrder.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>'; };

  /* ---------- ④ 패키지·옵션 ---------- */
  R['packages'] = function(el, ds){
    var compact = ds && ds.opt === 'compact';
    el.innerHTML = '<div class="pkg-grid' + (compact ? ' compact' : '') + '">' + T.packages.map(function(x){
      var p = x.pkg;
      return '<article class="pkg-card">'
        + '<div class="pkg-head"><h4>' + esc(p.label) + '</h4><span class="pkg-when">' + esc(p.when) + '</span></div>'
        + '<div class="pkg-price">' + (p.kind === 'total' ? '<small>총</small>' + manNum(p.total) : '<small>+</small>' + manNum(p.price)) + '<span>만 원</span></div>'
        + '<div class="pkg-save">' + esc(p.save) + '</div>'
        + (compact ? '' : '<ul class="pkg-items">' + p.items.map(function(it){ return '<li><span>' + esc(it[0]) + '</span><em>' + manNum(it[1]) + '</em></li>'; }).join('') + '<li class="sum"><span>단품으로 고르면</span><em>' + manNum(x.single) + '</em></li></ul>')
        + '<div class="pkg-ex">' + x.examples.map(function(e){ return '<span>' + esc(e.label) + ' <b>' + manNum(e.total) + '</b></span>'; }).join('') + '</div>'
        + '</article>';
    }).join('') + '</div>'
      + (compact ? '<p class="tiny muted mt-2">패키지가는 블록 요금에 더하는 금액이고, 워크숍 데이만 공간료를 포함한 총액입니다. 아래 숫자는 블록 요금을 더한 예시 총액(만 원)입니다.</p>' : '<p class="tiny muted mt-2">카드 아래 숫자는 블록 요금을 더한 예시 총액(만 원)입니다.</p>');
  };
  R['package-rules'] = function(el){ el.innerHTML = list(D.packageRules); };
  R['options'] = function(el){
    el.innerHTML = '<div class="opt-groups">' + D.options.map(function(g){
      return '<div class="opt-group"><h4>' + esc(g.group) + '</h4><table class="opt-tbl"><tbody>' + g.rows.map(function(r){ return '<tr><th>' + esc(r[0]) + '</th><td class="pr">' + esc(r[1]) + '</td><td class="nt">' + esc(r[2] || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }).join('') + '</div><p class="tiny muted mt-2">금액 단위는 만 원, 부가세 포함입니다. 할인과 할증은 공간료에만 적용하고 옵션에는 적용하지 않습니다.</p>';
  };
  R['deductions'] = function(el){ el.innerHTML = tbl(['항목', '공제 금액', '기준'], D.deductions.map(function(d){ return [esc(d[0]), esc(d[1]), esc(d[2])]; })); };

  /* ---------- 보증금·결제·가예약·취소 ---------- */
  R['deposit'] = function(el){ el.innerHTML = tbl(['행사 유형', '보증금', '비고'], D.deposit.map(function(d){ return [esc(d[0]), d[1] ? '<b>' + man(d[1]) + '</b>' : '<span class="muted">협의</span>', esc(d[2])]; })) + list(D.depositNotes, 'bullets mt-2'); };
  R['payment'] = function(el){ el.innerHTML = tbl(['구분', '대상', '결제 방식', '증빙'], D.payment.map(function(p){ return [esc(p[0]), esc(p[1]), esc(p[2]), esc(p[3])]; })) + '<p class="tiny muted mt-1">' + esc(D.paymentNote) + '</p>'; };
  R['hold'] = function(el){ el.innerHTML = list(D.hold); };
  R['cancel'] = function(el){
    el.innerHTML = '<div class="grid grid-2" style="gap:20px;align-items:start">'
      + '<div><h4 class="h-xs">개인 표준 규정</h4>' + tbl(['취소 시점', '환불', '공제'], D.cancelPersonal.map(function(r){ return [esc(r[0]), esc(r[1]), r[2] === '없음' ? '없음' : '<b class="rust">' + esc(r[2]) + '</b>']; })) + '<p class="tiny muted mt-1">' + esc(D.cancelPersonalNote) + '</p></div>'
      + '<div><h4 class="h-xs">행사 계약 규정</h4>' + tbl(['취소 시점', '처리', '공제 (이용료 총액 기준)'], D.cancelContract.map(function(r){ return [esc(r[0]), esc(r[1]), r[2] === '없음' ? '없음' : '<b class="rust">' + esc(r[2]) + '</b>']; })) + '<p class="tiny muted mt-1">' + esc(D.cancelContractNote) + '</p></div>'
      + '</div>';
  };
  R['cancel-matrix'] = function(el){
    el.innerHTML = tbl(['', '30일 이상 전', '29–8일 전', '7–2일 전', '전날·당일'], [
      ['개인 표준', '전액 환불', '전액 환불', '<b class="rust">30% 공제</b>', '<b class="rust">40% 공제</b>'],
      ['행사 계약', '전액 환불', '<b class="rust">30% 공제</b>', '<b class="rust">40% 공제</b>', '<b class="rust">40% 공제</b>']
    ], 'tbl-center');
  };
  R['change'] = function(el){ el.innerHTML = tbl(['변경 내용', '개인 표준', '행사 계약'], D.change.map(function(r){ return [esc(r[0]), esc(r[1]), esc(r[2])]; })); };
  R['special'] = function(el){ el.innerHTML = '<dl class="def">' + D.special.map(function(s){ return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('') + '</dl>'; };
  R['display'] = function(el){ el.innerHTML = list(D.display); };
  R['policy-cards'] = function(el){
    var dep = D.deposit.filter(function(d){ return d[1]; });
    el.innerHTML = '<div class="policy-grid">'
      + card('보증금', manNum(dep[0][1]) + '–' + manNum(dep[dep.length - 1][1]) + '만 원', '일반 행사 ' + man(dep[0][1]) + ', 식음·파티 ' + man(dep[1][1]) + ', 팝업·촬영 ' + man(dep[2][1]) + '. 이용료와 따로 받고 퇴실 점검 후 3영업일 안에 돌려드립니다.', '#policy')
      + card('결제', '개인 전액 · 계약 30%', '개인 고객의 150만 원 미만 하루 예약은 예약할 때 전액. 법인·단체이거나 150만 원 이상, 2일 이상이면 계약금 30%와 이용 7일 전 잔금 70%.', '#policy')
      + card('취소·환불', '8일 전까지 전액', D.cancelSummary.personal + ' (개인). 행사 계약은 ' + D.cancelSummary.contract + '.', '#policy')
      + card('가예약', '72시간 무료', '견적을 받은 뒤 72시간 동안 날짜를 잡아 둘 수 있습니다. 11–12월은 48시간이고, 기업 결재용 7일 연장도 있습니다.', '#policy')
      + '</div>';
    function card(k, big, d, hash){ return '<a class="policy-card" href="' + PAGE + hash + '"><span class="eyebrow">' + esc(k) + '</span><b>' + esc(big) + '</b><p>' + esc(d) + '</p><span class="go">자세히 →</span></a>'; }
  };

  /* ---------- 견적 예시 ---------- */
  R['examples'] = function(el){
    el.innerHTML = '<div class="ex-grid">' + D.examples.map(function(x, i){
      return '<article class="ex-card"><div class="ex-head"><span class="ex-n">' + M.pad2(i + 1) + '</span><div><h4>' + esc(x.title) + '</h4><span class="tiny muted">' + esc(x.who) + '</span></div></div>'
        + '<p class="small muted">' + esc(x.cond) + '</p>'
        + '<table class="ex-lines"><tbody>' + x.lines.map(function(l){ return '<tr><td>' + esc(l[0]) + '</td><td class="pr">' + man(l[1]) + '</td></tr>'; }).join('') + '<tr class="tot"><td>이용료 합계</td><td class="pr">' + man(x.total) + '</td></tr></tbody></table>'
        + '<p class="tiny muted">' + esc(x.foot) + '</p>' + (x.alt ? '<p class="tiny ex-alt">' + esc(x.alt) + '</p>' : '') + '</article>';
    }).join('') + '</div>';
  };

  /* =====================================================================
     예상 금액 계산기
     ===================================================================== */
  var PKG_PURPOSE = { seminar: 'seminar', workshop: 'workshop', party: 'party', family: 'party', fan: 'culture' };
  var CUST = [['personal', '개인'], ['corp', '법인·단체'], ['student', '학생 단체·비영리']];
  var CUST_LABEL = { personal: '개인', corp: '법인·단체', student: '학생 단체·비영리' };

  function defaultDate(){ return E.addDays(E.todayIso(), 21); }
  function segHtml(name, opts, val){ return '<div class="seg est-seg" data-seg="' + name + '">' + opts.map(function(o){ return '<button type="button" data-v="' + o[0] + '"' + (String(val) === String(o[0]) ? ' class="on"' : '') + '>' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function sel(name, opts, val){ return '<select class="select" name="' + name + '">' + opts.map(function(o){ return '<option value="' + o[0] + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function chk(name, label, on, hint){ return '<label class="chk"><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + '> ' + esc(label) + (hint ? ' <span class="chk-hint">' + esc(hint) + '</span>' : '') + '</label>'; }
  function numIn(name, val, min, max, step){ return '<input class="input" type="number" inputmode="numeric" name="' + name + '" value="' + val + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '">'; }

  function renderEstimator(el, cfg){
    cfg = cfg || {};
    var st = {
      mode: 'event', date: defaultDate(), slots: ['pm'], people: 80, customer: 'personal', pkg: '',
      layout: 'base', food: '', manager: false, av: '', staff: 0, mics: 0, light: false, smog: false, photo: false, catering: false, glass: 0, prev: false, next: false,
      extend: 0, setup: 0, late: 0, regular: false, prepay: false, semester: false, sessions: 1, building: false, nonrefund: false,
      popDate: defaultDate(), popDays: 3, popSetup: true, popCustomer: 'corp',
      shootDate: defaultDate(), shootKind: 'commercial', shootHours: 4, shootPeople: 10, shootCustomer: 'corp'
    };
    var last = null;
    var min = E.todayIso();

    el.innerHTML = '<div class="est">'
      + '<div class="est-form">'
      + '<div class="est-modes" role="tablist" aria-label="이용 방식">'
      + '<button type="button" role="tab" data-mode="event" class="on" aria-selected="true">행사 대관 <small>4시간 블록</small></button>'
      + '<button type="button" role="tab" data-mode="popup" aria-selected="false">팝업·전시 <small>일 단위</small></button>'
      + '<button type="button" role="tab" data-mode="shoot" aria-selected="false">촬영 <small>시간 단위</small></button>'
      + '</div>'
      + '<form class="est-body" novalidate onsubmit="return false">'
      // ---- 행사 대관 ----
      + '<div data-pane="event">'
      + '<section class="est-step"><h4><span>1</span>날짜와 시간</h4>'
      + '<div class="est-row"><label class="f"><span class="lbl">이용일</span><input class="input" type="date" name="date" value="' + st.date + '" min="' + min + '"></label><div class="est-daytag" data-out="daytag"></div></div>'
      + '<div class="f mt-2"><span class="lbl">블록 <span class="hint">여러 개를 이어서 고르면 연속 이용 할인</span></span><div class="slot-pick" data-out="slots"></div></div>'
      + '</section>'
      + '<section class="est-step"><h4><span>2</span>인원과 고객</h4>'
      + '<div class="est-row"><label class="f" style="max-width:140px"><span class="lbl">인원</span>' + numIn('people', st.people, 1, 999) + '</label><div class="f"><span class="lbl">고객</span>' + segHtml('customer', CUST, st.customer) + '</div></div>'
      + '</section>'
      + '<section class="est-step"><h4><span>3</span>패키지 <em>선택</em></h4>'
      + '<div class="pick" data-seg="pkg"><button type="button" data-v="" class="on">고르지 않음</button>' + D.packages.map(function(p){ return '<button type="button" data-v="' + p.id + '">' + esc(p.label) + '<small>' + (p.kind === 'total' ? '총 ' + manNum(p.total) : '+' + manNum(p.price)) + '만</small></button>'; }).join('') + '</div>'
      + '<p class="tiny muted mt-1" data-out="pkgdesc">패키지를 고르면 자주 함께 쓰는 옵션이 묶여 단품보다 20–27% 저렴합니다.</p>'
      + '</section>'
      + '<section class="est-step"><h4><span>4</span>옵션</h4>'
      + '<div class="field-row"><label class="f"><span class="lbl">배치</span>' + sel('layout', [['base', '기본 배치 그대로 (무료)'], ['self', '주최 측이 직접 배치 (무료)'], ['partial', '부분 변경 · 10만 원'], ['full', '전체 전환 · 25만 원']], st.layout) + '</label>'
      + '<label class="f"><span class="lbl">음식</span>' + sel('food', [['', '없음'], ['snack', '다과·음료·주류'], ['meal', '식사 있음 (도시락·뷔페·케이터링)']], st.food) + '</label></div>'
      + '<div class="field-row mt-2"><label class="f"><span class="lbl">AV 오퍼레이터</span>' + sel('av', [['', '없음'], ['4', '4시간 · 20만 원'], ['day', '종일 · 35만 원']], st.av) + '</label>'
      + '<label class="f"><span class="lbl">무선마이크 추가 <span class="hint">기본 2개 외, 개당 1만 원</span></span>' + numIn('mics', st.mics, 0, 30) + '</label></div>'
      + '<div class="checks mt-2">' + chk('manager', '현장 매니저 상주', st.manager, '4시간 15만') + chk('catering', '케이터링 세팅 지원', st.catering, '10만') + chk('light', '연출 조명', st.light, '5만') + chk('photo', '포토존 세트', st.photo, '10만') + '</div>'
      + '<details class="est-more"><summary>옵션 더 보기 · 스태프, 유리잔, 반입, 시간 추가</summary><div class="est-more-body">'
      + '<div class="field-row"><label class="f"><span class="lbl">접수·안내 스태프 <span class="hint">1인 4시간 10만 원</span></span>' + numIn('staff', st.staff, 0, 20) + '</label>'
      + '<label class="f"><span class="lbl">유리잔 <span class="hint">100개 단위, 5만 원</span></span>' + sel('glass', [[0, '없음'], [1, '100개'], [2, '200개'], [3, '300개']], st.glass) + '</label></div>'
      + '<div class="checks mt-2">' + chk('smog', '스모그머신', st.smog, '5만 · 사전 승인') + chk('prev', '전날 반입', st.prev, '5만') + chk('next', '다음 날 반출', st.next, '5만') + '</div>'
      + '<div class="field-row three mt-2"><label class="f"><span class="lbl">사전 연장</span>' + sel('extend', [[0, '없음'], [0.5, '30분'], [1, '1시간'], [1.5, '1시간 30분'], [2, '2시간']], st.extend) + '</label>'
      + '<label class="f"><span class="lbl">세팅 전용 시간</span>' + sel('setup', [[0, '없음'], [0.5, '30분'], [1, '1시간'], [1.5, '1시간 30분'], [2, '2시간']], st.setup) + '</label>'
      + '<label class="f"><span class="lbl">심야 이용 <span class="hint">23시 이후</span></span>' + sel('late', [[0, '없음'], [1, '24시까지'], [2, '01시까지'], [3, '02시까지']], st.late) + '</label></div>'
      + '<p class="tiny muted mt-1">사전 연장은 시간 단가 그대로, 세팅 전용 시간은 시간 단가의 50%, 심야는 저녁 시간 단가에 심야 매니저 시간당 4만 원을 더합니다.</p>'
      + '</div></details>'
      + '</section>'
      + '<section class="est-step"><h4><span>5</span>할인 조건</h4>'
      + '<div class="disc-rows">'
      + '<div class="disc-row">' + chk('regular', '정기 대관', st.regular, '월 2회 이상 · 3개월 이상') + '<span class="disc-sub" data-show="regular">' + chk('prepay', '선납', st.prepay, '5%p 추가') + '</span></div>'
      + '<div class="disc-row">' + chk('semester', '학기 묶음', st.semester, '학생 단체 · 3회 이상') + '</div>'
      + '<div class="disc-row" data-show="sessions"><label class="f inline"><span class="lbl">계약 회차</span>' + numIn('sessions', st.sessions, 1, 52) + '<span class="hint">회</span></label></div>'
      + '<div class="disc-row">' + chk('building', '같은 건물 1층·4층 함께 예약', st.building, '10%') + '</div>'
      + '<div class="disc-row" data-show="nonrefund">' + chk('nonrefund', '환불 불가 특가', st.nonrefund, '개인 · 10%') + '</div>'
      + '</div>'
      + '<p class="tiny muted mt-1">여름 비수기(7–8월 월–목 오전·오후)와 학생·비영리(월–목) 할인은 조건에 맞으면 자동으로 들어갑니다. 여러 할인을 합쳐도 25%까지입니다.</p>'
      + '</section>'
      + '</div>'
      // ---- 팝업 ----
      + '<div data-pane="popup" hidden>'
      + '<section class="est-step"><h4><span>1</span>운영 일정</h4>'
      + '<div class="field-row"><label class="f"><span class="lbl">첫 운영일</span><input class="input" type="date" name="popDate" value="' + st.popDate + '" min="' + min + '"></label><label class="f"><span class="lbl">운영 일수</span>' + numIn('popDays', st.popDays, 1, 30) + '</label></div>'
      + '<div class="checks mt-2">' + chk('popSetup', '세팅데이 (첫 운영일 전날, 설치만)', st.popSetup, '전일 요금의 40%') + '</div>'
      + '</section>'
      + '<section class="est-step"><h4><span>2</span>고객</h4>' + segHtml('popCustomer', [['personal', '개인'], ['corp', '법인·단체·브랜드']], st.popCustomer) + '</section>'
      + '<p class="small muted">팝업은 하루 내내(09–23시) 공간을 쓰므로 전일 요금을 하루 요금으로 씁니다. 이틀째부터는 청소와 전환이 줄어 할인합니다.</p>'
      + '</div>'
      // ---- 촬영 ----
      + '<div data-pane="shoot" hidden>'
      + '<section class="est-step"><h4><span>1</span>촬영일과 종류</h4>'
      + '<div class="est-row"><label class="f"><span class="lbl">촬영일</span><input class="input" type="date" name="shootDate" value="' + st.shootDate + '" min="' + min + '"></label><div class="est-daytag" data-out="shoottag"></div></div>'
      + '<div class="f mt-2"><span class="lbl">촬영 종류</span>' + segHtml('shootKind', [['commercial', '상업 촬영'], ['small', '소규모 비상업']], st.shootKind) + '</div>'
      + '</section>'
      + '<section class="est-step"><h4><span>2</span>시간과 인원</h4>'
      + '<div class="field-row"><label class="f"><span class="lbl">촬영 시간 <span class="hint" data-out="shoothint">최소 4시간</span></span>' + numIn('shootHours', st.shootHours, 1, 12) + '</label><label class="f"><span class="lbl">스태프·출연자 수</span>' + numIn('shootPeople', st.shootPeople, 1, 200) + '</label></div>'
      + '<div class="f mt-2"><span class="lbl">고객</span>' + segHtml('shootCustomer', [['personal', '개인'], ['corp', '법인·단체']], st.shootCustomer) + '</div>'
      + '</section>'
      + '</div>'
      + '</form>'
      + '</div>'
      + '<div class="est-mini" data-out="mini" hidden><span>예상 이용료<small data-out="minisub"></small></span><b data-out="minitotal"></b><button type="button" class="btn btn-primary btn-sm" data-act="show">내역 보기</button></div>'
      + '<aside class="est-result" aria-live="polite" data-out="result"></aside>'
      + '</div>';

    var form = $('.est-body', el), resBox = $('[data-out=result]', el);

    // 모드 탭
    $('.est-modes', el).addEventListener('click', function(e){
      var b = e.target.closest('button[data-mode]'); if (!b) return;
      setMode(b.dataset.mode);
    });
    function setMode(m){
      st.mode = m;
      $$('.est-modes button', el).forEach(function(x){ var on = x.dataset.mode === m; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
      $$('[data-pane]', el).forEach(function(p){ p.hidden = p.dataset.pane !== m; });
      calc();
    }
    // 세그먼트·패키지 버튼
    form.addEventListener('click', function(e){
      var b = e.target.closest('[data-seg] button'); if (b) {
        var box = b.closest('[data-seg]'), key = box.dataset.seg;
        $$('button', box).forEach(function(x){ x.classList.toggle('on', x === b); });
        st[key] = b.dataset.v; calc(); return;
      }
      var s = e.target.closest('.slot-btn'); if (s) {
        var id = s.dataset.slot, i = st.slots.indexOf(id);
        if (i >= 0) { if (st.slots.length > 1) st.slots.splice(i, 1); } else st.slots.push(id);
        calc();
      }
    });
    form.addEventListener('input', read);
    form.addEventListener('change', read);
    function read(e){
      var t = e.target; if (!t.name) return;
      if (t.type === 'checkbox') st[t.name] = t.checked;
      else if (t.type === 'number') st[t.name] = t.value === '' ? '' : +t.value;
      else st[t.name] = t.value;
      if (t.name === 'regular' && t.checked && (+st.sessions || 1) < 6) { st.sessions = 6; form.sessions.value = 6; }
      if (t.name === 'semester' && t.checked && (+st.sessions || 1) < 3) { st.sessions = 3; form.sessions.value = 3; }
      if ((t.name === 'regular' || t.name === 'semester') && !st.regular && !st.semester) { st.sessions = 1; form.sessions.value = 1; }
      if (e.type === 'change' || t.type !== 'number') calc(); else calcSoon();
    }
    var timer; function calcSoon(){ clearTimeout(timer); timer = setTimeout(calc, 200); }

    function slotButtons(day){
      var box = $('[data-out=slots]', el);
      box.innerHTML = D.slots.map(function(s){
        var on = st.slots.indexOf(s.id) >= 0, col = day ? day.cols[s.id] : 'wd', amt = E.rate(s.id, col), peak = day ? E.isPeak(s.id, col, day.holiday) : false;
        return '<button type="button" class="slot-btn' + (on ? ' on' : '') + '" data-slot="' + s.id + '" aria-pressed="' + on + '"><b>' + esc(s.label) + '</b><span>' + esc(s.time) + '</span><em>' + manNum(amt) + '만' + (peak ? ' · 피크' : '') + '</em></button>';
      }).join('');
    }
    function dayTag(day, out){
      var box = $('[data-out=' + out + ']', el); if (!box) return;
      if (!day) { box.innerHTML = ''; return; }
      var tags = [];
      tags.push('<b>' + E.kdate(day.iso) + '</b>');
      if (day.holiday) tags.push('<span class="badge badge-rust">' + esc(day.holiday) + '</span>');
      else if (day.nextHoliday && day.dow !== 6) tags.push('<span class="badge badge-warn">공휴일 전날</span>');
      if (out === 'daytag') { var c = day.cols; tags.push('<span class="tiny muted">' + ((c.am === c.pm && c.pm === c.ev) ? E.colLabel(c.am) + ' 요금' : ['am', 'pm', 'ev'].map(function(s){ return E.slotDef(s).label + ' ' + E.colLabel(c[s]); }).join(' · ') + ' 요금') + '</span>'); }
      else tags.push('<span class="tiny muted">' + (day.off ? '주말·공휴일 요금' : '평일 요금') + '</span>');
      box.innerHTML = tags.join(' ');
    }
    function syncVisibility(){
      $$('[data-show=regular]', el).forEach(function(x){ x.hidden = !st.regular; });
      $$('[data-show=sessions]', el).forEach(function(x){ x.hidden = !(st.regular || st.semester); });
      $$('[data-show=nonrefund]', el).forEach(function(x){ x.hidden = st.customer !== 'personal'; });
      var pk = st.pkg ? E.findPkg(st.pkg) : null;
      $('[data-out=pkgdesc]', el).textContent = pk ? (pk.label + ' · ' + pk.when + ' · ' + pk.items.map(function(i){ return i[0]; }).join(', ') + ' · ' + pk.save) : '패키지를 고르면 자주 함께 쓰는 옵션이 묶여 단품보다 20–27% 저렴합니다.';
      var hint = $('[data-out=shoothint]', el); if (hint) hint.textContent = st.shootKind === 'small' ? '최소 2시간' : '최소 4시간 · 최대 12시간';
    }

    function calc(){
      syncVisibility();
      var r;
      if (st.mode === 'event') {
        var day = E.dayInfo(st.date);
        slotButtons(day); dayTag(day, 'daytag');
        r = E.quoteEvent({ date: st.date, slots: st.slots, people: st.people, customer: st.customer, pkg: st.pkg, layout: st.layout, food: st.food, manager: st.manager, av: st.av,
          staff: st.staff, mics: st.mics, light: st.light, smog: st.smog, photo: st.photo, catering: st.catering, glass: st.glass, prev: st.prev, next: st.next,
          extend: st.extend, setup: st.setup, late: st.late, regular: st.regular, prepay: st.prepay, semester: st.semester, sessions: (st.regular || st.semester) ? st.sessions : 1, building: st.building, nonrefund: st.nonrefund });
        highlightRate(day, r.ok ? r.slots : []);
      } else if (st.mode === 'popup') {
        r = E.quotePopup({ date: st.popDate, days: st.popDays, setup: st.popSetup, customer: st.popCustomer });
        highlightRate(null, []);
      } else {
        dayTag(E.dayInfo(st.shootDate), 'shoottag');
        r = E.quoteShoot({ date: st.shootDate, kind: st.shootKind, hours: st.shootHours, people: st.shootPeople, customer: st.shootCustomer });
        highlightRate(null, []);
      }
      last = r; renderResult(r); renderMini(r);
      if (cfg.onChange) cfg.onChange(r, api);
    }

    function lineRow(l){
      var cls = l.k === 'sub' ? 'sub' : l.k === 'adj' ? 'adj' : l.k === 'pkg' ? 'pkg' : '';
      var amt = l.k === 'adj' ? E.signed(l.amount) : (l.k === 'item' || l.k === 'pkg') && st.mode === 'event' ? '+' + man(l.amount) : man(l.amount);
      return '<tr class="' + cls + '"><td><span class="ln">' + esc(l.label) + '</span>' + (l.note ? '<span class="nt">' + esc(l.note) + '</span>' : '') + '</td><td class="pr">' + amt + '</td></tr>';
    }
    function renderResult(r){
      if (!r.ok) {
        resBox.innerHTML = '<div class="est-card"><div class="eyebrow">Estimate</div><p class="mt-2 small">' + r.errors.map(esc).join('<br>') + '</p></div>';
        return;
      }
      var title = r.mode === 'event' ? (E.kdate(r.day.iso) + ' ' + r.span.label) : r.mode === 'popup' ? ('팝업·전시 ' + (r.setup ? '세팅 1일 + ' : '') + '운영 ' + r.days + '일') : ('촬영 ' + E.kdate(st.shootDate) + ' · ' + r.hours + '시간');
      var h = '<div class="est-card">'
        + '<div class="row between" style="gap:8px"><div class="eyebrow">Estimate</div><span class="tiny muted">요금표 ' + esc(D.version) + '</span></div>'
        + '<h4 class="est-title">' + esc(title) + '</h4>'
        + (r.mode === 'event' ? '<p class="tiny muted">' + r.people + '명 · ' + esc(CUST_LABEL[r.customer]) + (r.pkg ? ' · ' + esc(r.pkg.label) + ' 패키지' : '') + '</p>' : '')
        + '<table class="est-lines"><tbody>' + r.lines.map(lineRow).join('') + '</tbody></table>'
        + (r.included && r.included.length ? '<p class="est-inc"><b>패키지에 포함</b> ' + r.included.map(esc).join(', ') + '</p>' : '')
        + '<div class="est-total"><span>' + (r.sessions > 1 ? '이용료 합계 <small>1회 ' + man(r.perSession) + ' × ' + r.sessions + '회</small>' : '예상 이용료') + '</span><b>' + man(r.total) + '</b></div>'
        + '<p class="tiny muted tr">부가세 포함 · 공급가액 ' + won(r.supply) + ' + 부가세 ' + won(r.vat) + (r.perPerson ? ' · 1인 약 ' + won(r.perPerson) : '') + '</p>'
        + '<dl class="est-terms">'
        + '<div><dt>보증금</dt><dd><b>' + man(r.deposit.amount) + '</b> 이용료와 별도 · ' + esc(r.deposit.label) + (r.deposit.corp ? '<br><span class="tiny muted">' + esc(r.deposit.corp) + '</span>' : '') + '</dd></div>'
        + '<div><dt>결제</dt><dd><b>' + esc(r.payment.label) + '</b> ' + esc(r.payment.text) + '</dd></div>'
        + '<div><dt>취소</dt><dd>' + esc(r.cancelText) + '</dd></div>'
        + '<div><dt>가예약</dt><dd>견적을 받은 뒤 ' + r.hold + '시간 동안 무료로 날짜를 잡아 둘 수 있습니다.</dd></div>'
        + '</dl>'
        + (r.warnings.length ? '<ul class="est-warn">' + r.warnings.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '')
        + (r.notes.length ? '<ul class="est-notes">' + r.notes.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '')
        + '<div class="est-actions"><button type="button" class="btn btn-primary" data-act="ask">이 조건으로 견적 문의 <span class="arrow">→</span></button><button type="button" class="btn btn-light btn-sm" data-act="copy">계산 내용 복사</button></div>'
        + '<p class="tiny muted mt-2">홈페이지에서 계산한 예상 금액입니다. 실제 금액은 일정과 조건을 확인한 뒤 견적서로 확정합니다.</p>'
        + '</div>';
      resBox.innerHTML = h;
    }
    function renderMini(r){
      var box = $('[data-out=mini]', el); if (!box) return;
      if (!r.ok) { box.hidden = true; return; }
      box.hidden = false;
      $('[data-out=minitotal]', el).textContent = man(r.total);
      $('[data-out=minisub]', el).textContent = '부가세 포함 · 보증금 ' + man(r.deposit.amount) + ' 별도';
    }
    el.addEventListener('click', function(e){ var b = e.target.closest('[data-act=show]'); if (b) resBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    resBox.addEventListener('click', function(e){
      var b = e.target.closest('[data-act]'); if (!b || !last || !last.ok) return;
      if (b.dataset.act === 'copy') {
        var t = summaryText();
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ M.toast('계산 내용을 복사했습니다.'); }).catch(function(){ M.toast('복사하지 못했습니다. 화면의 금액을 직접 적어 주세요.'); });
      } else if (b.dataset.act === 'ask') {
        var p = prefill(), onAsk = cfg.onAsk || (M.pricing && M.pricing.onAsk);
        if (onAsk) onAsk(p, api);
        else {
          try { sessionStorage.setItem('ms_estimate', p.estimate); } catch (_) {}
          var q = new URLSearchParams({ space: 'megaspot-gundae', date: p.date || '', slot: p.slot || '', people: p.people || '', purpose: p.purpose || '', layout: p.layout || '', type: p.type || 'event', est: '1' });
          location.href = '/inquiry/?' + q.toString();
        }
      }
    });

    function highlightRate(day, slots){
      $$('.rate-table td.rc').forEach(function(td){ td.classList.remove('hl'); });
      var any = false;
      if (day) slots.forEach(function(s){ var td = document.querySelector('.rate-table td.rc[data-slot="' + s + '"][data-col="' + day.cols[s] + '"]'); if (td) { td.classList.add('hl'); any = true; } });
      $$('.rate-legend .lg-hl-wrap').forEach(function(x){ x.hidden = !any; });
    }

    function summaryText(){
      var r = last; if (!r || !r.ok) return '';
      var L = ['[메가스팟 건대 예상 금액 · 요금표 ' + D.version + ']'];
      if (r.mode === 'event') {
        L.push('일정: ' + E.kdateY(r.day.iso) + ' ' + r.span.label + (r.sessions > 1 ? ' (같은 조건 ' + r.sessions + '회)' : ''));
        L.push('인원: ' + r.people + '명 · ' + CUST_LABEL[r.customer] + (r.pkg ? ' · ' + r.pkg.label + ' 패키지' : ''));
      } else if (r.mode === 'popup') {
        L.push('팝업·전시: ' + E.kdateY(st.popDate) + '부터 운영 ' + r.days + '일' + (r.setup ? ' + 세팅데이 1일' : ''));
      } else {
        L.push('촬영: ' + E.kdateY(st.shootDate) + ' · ' + (st.shootKind === 'small' ? '소규모 비상업' : '상업') + ' ' + r.hours + '시간 · ' + r.people + '명');
      }
      r.lines.forEach(function(l){ L.push('- ' + l.label + ': ' + (l.k === 'adj' ? E.signed(l.amount) : man(l.amount)) + (l.note && l.k !== 'sub' ? ' (' + l.note + ')' : '')); });
      if (r.included && r.included.length) L.push('- 패키지 포함: ' + r.included.join(', '));
      L.push('합계: ' + man(r.total) + (r.sessions > 1 ? ' (1회 ' + man(r.perSession) + ' × ' + r.sessions + '회)' : '') + ' · 부가세 포함 (공급가액 ' + won(r.supply) + ' + 부가세 ' + won(r.vat) + ')');
      L.push('보증금: ' + man(r.deposit.amount) + ' (이용료와 별도)');
      L.push('결제: ' + r.payment.label + ' — ' + r.payment.text);
      L.push('※ 홈페이지 계산기로 낸 예상 금액입니다. 최종 금액은 견적서로 확정됩니다.');
      return L.join('\n');
    }
    function prefill(){
      var r = last || {}, p = { estimate: summaryText(), type: 'event' };
      if (st.mode === 'event') {
        p.date = st.date; p.slot = r.slotCode || 'custom'; p.people = st.people;
        if (st.pkg) { p.purpose = PKG_PURPOSE[st.pkg] || ''; var pk = E.findPkg(st.pkg); p.layout = pk ? pk.layout : ''; }
        if (st.regular) p.type = 'regular';
      } else if (st.mode === 'popup') { p.date = st.popDate; p.slot = 'day'; p.purpose = 'popup'; }
      else { p.date = st.shootDate; p.slot = 'custom'; p.purpose = 'shooting'; p.people = st.shootPeople; }
      return p;
    }

    var api = {
      el: el,
      setDate: function(iso){
        if (st.mode === 'popup') { st.popDate = iso; form.popDate.value = iso; }
        else if (st.mode === 'shoot') { st.shootDate = iso; form.shootDate.value = iso; }
        else { st.date = iso; form.date.value = iso; }
        calc();
      },
      setSlots: function(list){ if (list && list.length) { st.slots = list.slice(); calc(); } },
      setMode: setMode,
      result: function(){ return last; },
      summaryText: summaryText,
      prefill: prefill
    };
    calc();
    return api;
  }

  R['estimator'] = function(el){ M.pricing.estimator = renderEstimator(el, M.pricing.estimatorConfig || {}); };

  function init(root){
    $$('[data-price]', root || document).forEach(function(el){
      var fn = R[el.dataset.price];
      if (fn) { try { fn(el, el.dataset); } catch (err) { if (window.console) console.error('pricing:', el.dataset.price, err); } }
    });
  }
  M.pricing = M.pricing || {};
  M.pricing.init = init; M.pricing.renderEstimator = renderEstimator; M.pricing.renderers = R; M.pricing.page = PAGE;
  init(document);
})();
