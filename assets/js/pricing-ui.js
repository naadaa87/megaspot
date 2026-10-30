/* =====================================================================
   메가스팟 · 요금 화면 (건대 1호 요금표 v2.1 · 건대 2호 요금표 v1.1 · 성수기 포함)
   - HTML에 <div data-price="rate-table"></div>처럼 자리만 두면 이 파일이 내용을 채웁니다.
   - 어느 공간의 요금인지는 자리의 data-space, 감싸는 요소의 data-space, <body data-space> 순서로 정하고, 없으면 1호입니다.
     (예: <div data-price="packages" data-space="megaspot-gundae-2"></div>) 계산기는 data-space 를 바꿔 다시 그릴 수 있습니다(예약 신청 화면의 공간 선택).
   - 쓸 수 있는 자리: version, facts, rate-table, day-rule, packages(data-opt="compact"), people-rule,
     options, included, deposit, refund-table, special, examples, estimator,
     peak-table(성수기 요금표), price-calendar(요금 달력 · data-opt="compact"), season-note(성수기 한 줄 안내)
   - 예약 신청 · 금액 확인: 시간(패키지 버튼 포함) → 날짜 → 인원 → (선택) 옵션 → 금액 → 예약신청하기 → 이름·연락처 → 접수. 견적서 PDF 저장(인쇄), 카카오톡 전송.
   ===================================================================== */
(function(){
  'use strict';
  var M = window.MEGASPOT, E0 = window.MEGASPOT_PRICE;
  if (!M || !E0 || !E0.data()) return;
  var esc = M.esc, $ = M.$, $$ = M.$$;
  var PUR = window.MEGASPOT_PURPOSES || [];
  var KAKAO = (M.CONFIG && M.CONFIG.kakaoChannel) || '';
  var CC = window.MEGASPOT_CATERING_CALC || null;   // 출장뷔페 계산 (catering-calc.js) — 예약 신청서의 '출장뷔페도 함께 상담' 칸
  var CK = window.MEGASPOT_COCKTAIL_CALC || null;
  var DEFAULT_SPACE = E0.defaultSpace || 'megaspot-gundae';

  /* 공간 하나의 요금 화면 묶음 — 1호·2호가 같은 코드를 쓰고 숫자·이름만 요금표(D)에서 읽습니다 */
  function buildUI(E){
  var D = E.data(), won = E.won, man = E.man;
  var PAGE = D.page || '/spaces/megaspot-gundae/pricing/';
  var SPACE_ID = E.space || DEFAULT_SPACE, NAME = D.spaceName || '메가스팟 건대 1호', ADDR = D.address || '서울 광진구 화양동 10-1 한아름건물 2층';
  var BASE_SUR = E.surcharge ? E.surcharge() : 0;   // 평소에도 시간제 1건당 더하는 가산액 (2호)
  function minPkgPct(){ var m = 100; D.packages.forEach(function(p){ D.cols.forEach(function(c){ m = Math.min(m, pct(p, c.id)); }); }); return m; }
  function peakBig(){ var pk = D.peak; if (!pk) return false; return Object.keys(pk.types).some(function(k){ return pk.types[k].people > D.people.base; }); }

  function tbl(head, rows, cls){
    return '<div class="tbl-wrap"><table class="tbl' + (cls ? ' ' + cls : '') + '"><thead><tr>' + head.map(function(h){ return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>'
      + rows.map(function(r){ return '<tr>' + r.map(function(c, i){ return '<td' + (i === 0 ? ' class="k"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function mn(n){ var m = n / 10000; return '<b class="mn">' + (Number.isInteger(m) ? m : Math.round(m * 10) / 10) + '</b><span class="mu">만 원</span>'; }
  function pct(p, col){ return Math.round((1 - p.price[col] / p.regular[col]) * 100); }
  var R = {};

  /* ---------- 요약 ---------- */
  R.version = function(el){ el.textContent = D.version + ' · ' + D.vatNote; };
  R.facts = function(el){
    var minRate = Math.min.apply(null, D.cols.map(function(c){ return Math.min.apply(null, D.bands.map(function(b){ return D.hourly[c.id][b.id]; })); }));
    var minPkg = Math.min.apply(null, D.cols.map(function(c){ return D.packages[0].price[c.id]; }));
    el.innerHTML = [
      ['<small>시간당</small>' + esc(man(minRate)) + '<small>부터</small>', '월–목 아침 기준 · 요일·시간대별로 다릅니다'],
      ['<small>낮 7시간</small>' + esc(man(minPkg)), '낮 패키지(10–17시) 월–금 · 시간 요금보다 ' + Math.floor(Math.min.apply(null, D.cols.map(function(c){ return pct(D.packages[0], c.id); }))) + '% 이상 저렴'],
      ['<small>기준</small>' + D.people.base + '명<small>포함</small>', (D.people.base + 1) + '명째부터 1명당 ' + esc(man(D.people.extra)) + ' · 최대 ' + D.people.max + '명' + (peakBig() ? ' · 성수기 주말·특정일은 50명 포함' : (BASE_SUR ? ' · 시간제는 1건당 가산액 ' + esc(man(BASE_SUR)) : ''))],
      ['<small>보증금</small>' + esc(man(D.deposit.amount)), '이용료와 따로 받고, 이용 뒤 확인 후 돌려 드립니다']
    ].map(function(f){ return '<div><b>' + f[0] + '</b><span>' + f[1] + '</span></div>'; }).join('');
    el.classList.add('facts-4');
  };

  /* ---------- 시간당 요금표 ---------- */
  R['rate-table'] = function(el){
    var head = '<tr><th class="corner">시간당 요금<br><small>단위 만 원</small></th>' + D.cols.map(function(c){ return '<th data-col="' + c.id + '">' + esc(c.label) + '</th>'; }).join('') + '</tr>';
    var body = D.bands.map(function(b){
      return '<tr><th scope="row"><b>' + esc(b.label) + '</b><small>' + esc(b.time) + '</small></th>' + D.cols.map(function(c){
        var v = D.hourly[c.id][b.id];
        return '<td class="rc" data-band="' + b.id + '" data-col="' + c.id + '">' + mn(v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    el.innerHTML = '<div class="rate-wrap"><table class="rate-table v2"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
      + '<div class="rate-legend"><span><span class="lg-hl"></span>계산기에서 고른 시간대</span><span>심야(24–07시)는 이용일 요일 기준으로 계산합니다.</span>' + (D.dawn ? '<span>' + esc(D.dawn.note) + '</span>' : '') + '<span>공휴일은 아래 요일 구분 규칙을 따릅니다.</span>' + (D.peak ? '<span>' + esc(peakRangeText()) + '은 <a href="' + (location.pathname === PAGE ? '#peak' : PAGE + '#peak') + '">성수기 요금표</a>를 따릅니다.</span>' : '') + '</div>';
  };
  R['day-rule'] = function(el){
    el.innerHTML = tbl(['적용 요금', '언제', '예'], D.dayRule.map(function(r){ return ['<span class="badge badge-soft">' + esc(E.colLabel(r.col)) + ' 요금</span>', esc(r.when), esc(r.ex)]; }), 'tbl-fit')
      + '<p class="tiny muted mt-2">휴일은 토요일·일요일·공휴일입니다. 날짜를 고르면 계산기가 이 규칙으로 요일 구분을 정하고, 공휴일이면 그 이유를 함께 보여 줍니다.</p>';
  };

  /* ---------- 패키지 ---------- */
  R.packages = function(el, opt){
    var compact = opt === 'compact';
    el.innerHTML = '<div class="pkg-grid v2' + (compact ? ' compact' : '') + '">' + D.packages.map(function(p){
      var rows = D.cols.map(function(c){ return '<li><span>' + esc(c.label) + '</span><s>' + esc(man(p.regular[c.id])) + '</s><em>' + esc(man(p.price[c.id])) + '</em><i>-' + pct(p, c.id) + '%</i></li>'; }).join('');
      return '<article class="pkg-card"><div class="pkg-head"><div class="eyebrow">' + esc(p.en) + '</div><h4>' + esc(p.label) + '</h4><span class="pkg-when">' + esc(p.time) + ' · ' + p.hours + '시간 · ' + esc(p.fit) + '</span></div>'
        + '<div class="pkg-price">' + esc(man(p.price.wd)).replace('만 원', '') + '<small>만 원</small><span>월–목 기준</span></div>'
        + '<ul class="pkg-cols">' + rows + '</ul>'
        + '<button type="button" class="btn btn-light btn-sm pkg-use" data-pkg="' + p.id + '">이 패키지로 예약 신청</button></article>';
    }).join('') + '</div>'
      + '<p class="tiny muted mt-2">패키지 금액은 기준 인원 ' + D.people.base + '명의 공간료입니다. 인원 추가와 옵션은 따로 더해집니다. 계산기에서 같은 시간을 고르면 자동으로 패키지 할인가가 적용됩니다.' + (D.peak ? ' <b>' + esc(peakRangeText()) + '</b>은 성수기 패키지 금액이 적용됩니다. <a href="' + (location.pathname === PAGE ? '#peak' : PAGE + '#peak') + '" style="text-decoration:underline;font-weight:700;color:var(--cobalt)">성수기 요금 보기</a>' : '') + '</p>';
    el.addEventListener('click', function(e){ var b = e.target.closest('.pkg-use'); if (!b) return; if (M.pricing.estimator){ M.pricing.estimator.setPackage(b.dataset.pkg); var est = document.querySelector('[data-price=estimator]'); if (est) est.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else { location.href = '/inquiry/?space=' + SPACE_ID + '&pkg=' + b.dataset.pkg; } });
  };

  /* ---------- 인원 ---------- */
  R['people-rule'] = function(el){
    var ex = (D.people.examples || [30, 50, 100, 150, 200]).map(function(n){ return '<span class="tag">' + n + '명 <b style="margin-left:6px;color:var(--cobalt)">+' + esc(man((n - D.people.base) * D.people.extra)) + '</b></span>'; }).join('');
    el.innerHTML = '<div class="card pad-s"><div class="row between" style="align-items:flex-start;gap:12px"><div><b style="font-size:17px">기준 인원 ' + D.people.base + '명 포함</b><p class="small muted mt-1">' + esc(D.people.note) + '</p></div><span class="badge badge-cobalt">1명당 ' + esc(man(D.people.extra)) + '</span></div><div class="tags mt-2">' + ex + '</div>' + (BASE_SUR ? '<p class="tiny muted mt-2">' + esc((D.surcharge && D.surcharge.note) || '') + '</p>' : '') + (D.peak && D.peak.peopleNote ? '<p class="tiny muted mt-2">' + esc(D.peak.peopleNote) + '</p>' : '') + '</div>';
  };

  /* ---------- 옵션 ---------- */
  R.options = function(el){
    var rows = D.options.map(function(o){ return [esc(o.label), '<b>' + esc(won(o.price)) + '</b> <span class="muted">/ ' + esc(o.unit) + '</span>', esc(o.desc)]; });
    var ask = D.askOptions.map(function(o){ return [esc(o.label), '<span class="badge badge-soft">상담 시 안내</span>', esc(o.desc)]; });
    el.innerHTML = tbl(['옵션', '금액', '내용'], rows.concat(ask))
      + '<p class="tiny muted mt-2">옵션은 필요한 것만 고르시면 됩니다. 금액이 적힌 항목은 계산기에서 바로 더해 볼 수 있고, \'상담 시 안내\' 항목은 행사 내용을 듣고 금액을 정합니다.</p>';
  };
  R.included = function(el){
    el.innerHTML = '<div class="inc-grid">' + D.included.map(function(i){ return '<div class="inc' + (i.big ? ' big' : '') + '"><span class="inc-check" aria-hidden="true">✓</span>' + esc(i.label) + (i.big ? '<small>' + esc(i.sub || '초대형 화면 · 무료') + '</small>' : '') + '</div>'; }).join('') + '</div><p class="tiny muted mt-2">' + esc(D.includedNote) + '</p>';
  };

  /* ---------- 보증금·환불·별도 협의 ---------- */
  R.deposit = function(el){
    el.innerHTML = '<div class="card pad-s"><div class="row between"><b style="font-size:17px">' + esc(D.deposit.label) + '</b><b style="font-family:var(--font-display);font-size:26px;color:var(--cobalt);letter-spacing:.01em">' + esc(man(D.deposit.amount)) + '</b></div><p class="small muted mt-1">' + esc(D.deposit.note) + '</p><p class="small mt-2" style="padding-top:10px;border-top:1px dashed var(--concrete)">' + esc(D.corporate) + '</p></div>';
  };
  R['refund-table'] = function(el){
    el.innerHTML = tbl(['취소 시점', '환불'], D.refund.map(function(r){ return [esc(r.k) + (r.note ? ' <span class="tiny muted">' + esc(r.note) + '</span>' : ''), '<b style="color:' + (r.rate === 0 ? 'var(--rust)' : r.rate === 1 ? 'var(--ok)' : 'var(--graphite)') + '">' + Math.round(r.rate * 100) + '% 환불</b>']; }), 'tbl-fit')
      + '<p class="tiny muted mt-2">' + esc(D.refundNote) + '</p>';
  };
  R.special = function(el){
    el.innerHTML = '<div class="special-grid">' + D.special.map(function(s){
      return '<a class="special-card' + (s.id === 'popup' ? ' sub' : '') + '" href="' + esc(s.href || '/inquiry/') + '"><div class="eyebrow">' + esc(s.en || 'Ask us') + '</div><h4>' + esc(s.k) + '</h4><p>' + esc(s.d) + '</p><span class="go">' + esc(s.cta || '문의하기') + ' →</span></a>';
    }).join('') + '</div>'
      + (D.specialNote ? '<div class="special-note mt-3"><span class="badge badge-rust">추가 협찬 · 할인</span><b>' + esc(D.specialNote) + '</b><span class="small muted">카카오톡·전화·예약 신청 어느 쪽이든 모임 성격만 적어 주시면 됩니다.</span></div>' : '');
  };
  R['season-note'] = function(el){
    if (!D.peak) { el.hidden = true; return; }
    el.innerHTML = '<div class="season-note"><span class="badge badge-season">성수기 요금</span><div><b>' + esc(peakRangeText()) + '</b>은 성수기 요금이 적용됩니다. ' + (peakBig() ? '포함 인원이 50명인 날도 있어, ' : '') + '날짜를 고르면 계산기가 그날 기준으로 바로 계산합니다.</div><a class="btn btn-light btn-sm" href="' + (location.pathname === PAGE ? '#peak' : PAGE + '#peak') + '">성수기 요금표 · 요금 달력 →</a></div>';
  };

  /* ---------- 성수기 요금표 ---------- */
  function peakRangeText(){ return (D.peak && D.peak.periods || []).map(function(p){ return p.label; }).join(' · '); }
  function firstPeriodId(){ var t = E.todayIso(), ps = (D.peak && D.peak.periods) || []; var cur = ps.filter(function(p){ return t <= p.to; })[0] || ps[ps.length - 1]; return cur ? cur.id : ''; }
  R['peak-table'] = function(el){
    var pk = D.peak; if (!pk){ el.hidden = true; return; }
    var cur = firstPeriodId();
    function table(pid){
      var ids = pk.order[pid] || [];
      var head = ['적용 구분', '포함 인원'].concat(D.bands.map(function(b){ return b.label + '<small>' + esc(b.time) + ' / 시간</small>'; })).concat(['시간제<br>가산액<small>1건당</small>']).concat(D.packages.map(function(p){ return p.label.replace(' 패키지', '') + '<small>' + esc(p.time) + '</small>'; }));
      var rows = ids.map(function(id){
        var t = pk.types[id];
        var same = t.same ? '<small class="muted">' + esc(pk.types[t.same].label) + '과 같음</small>' : '';
        return '<tr' + (t.same ? ' class="same"' : '') + '><th scope="row"><b>' + esc(t.label) + '</b>' + same + '</th><td><span class="pp' + (t.people > D.people.base ? ' big' : '') + '">' + t.people + '명</span></td>'
          + D.bands.map(function(b){ return '<td>' + mn(t.hourly[b.id]) + '</td>'; }).join('')
          + '<td>' + (t.surcharge ? mn(t.surcharge) : '<span class="muted">없음</span>') + '</td>'
          + D.packages.map(function(p){ return '<td class="pk">' + mn(t.pkg[p.id]) + '</td>'; }).join('') + '</tr>';
      }).join('');
      return '<div class="tbl-wrap"><table class="tbl peak-table"><thead><tr>' + head.map(function(h, i){ return '<th' + (i === 0 ? ' class="k"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    el.innerHTML = '<div class="peak-head"><div class="peak-when">' + pk.periods.map(function(p){ return '<span class="peak-chip' + (p.id === cur ? ' on' : '') + '"><b>' + esc(p.label) + '</b><small>' + esc(E.kdate(p.from)) + (p.from !== p.to ? ' – ' + esc(E.kdate(p.to)) : '') + '</small></span>'; }).join('') + '</div>'
      + '<div class="peak-tabs" role="tablist">' + pk.periods.map(function(p){ return '<button type="button" role="tab" data-period="' + p.id + '" aria-selected="' + (p.id === cur) + '">' + esc(p.label) + ' 요금</button>'; }).join('') + '</div></div>'
      + '<div data-out="peak-body">' + table(cur) + '</div>'
      + '<ul class="est-notes mt-3 peak-notes">' + pk.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
      + '<p class="tiny muted mt-2">단위 만 원 · ' + esc(D.vatNote) + ' 날짜를 고르면 계산기와 요금 달력이 이 표의 금액으로 계산합니다.</p>';
    el.addEventListener('click', function(e){ var b = e.target.closest('[data-period]'); if (!b) return; $$('[data-period]', el).forEach(function(x){ x.setAttribute('aria-selected', String(x === b)); }); $$('.peak-chip', el).forEach(function(c, i){ c.classList.toggle('on', pk.periods[i].id === b.dataset.period); }); el.querySelector('[data-out="peak-body"]').innerHTML = table(b.dataset.period); });
  };

  /* ---------- 요금 달력 (월별 패키지 금액을 한눈에) ---------- */
  R['price-calendar'] = function(el, opt){
    var compact = opt === 'compact';
    var today = E.todayIso(), ym = today.slice(0, 7), pkgId = 'allday';
    var minYm = ym, maxYm = (function(){ var d = E.parse(today); d.setMonth(d.getMonth() + 12); return E.iso(d).slice(0, 7); })();
    var DOWS = ['일', '월', '화', '수', '목', '금', '토'];
    function shift(y, n){ var p = y.split('-'); var d = new Date(+p[0], +p[1] - 1 + n, 1, 12); return E.iso(d).slice(0, 7); }
    function tier(di){ if (di.peak) return 'peak'; return di.col; }
    function draw(){
      var pkg = E.findPkg(pkgId), days = E.monthPrices(ym, pkgId), first = days[0].day.dow;
      var cells = '';
      for (var i = 0; i < first; i++) cells += '<span class="pc-cell empty"></span>';
      days.forEach(function(x){
        var di = x.day, past = x.iso < today, t = tier(di);
        var tag = di.peak ? (di.peak.people > D.people.base ? '<small>' + di.peak.people + '명 포함</small>' : '<small>성수기</small>') : (di.holiday ? '<small>' + esc(di.holiday.replace(/\(.*\)/, '')) + '</small>' : '');
        cells += '<button type="button" class="pc-cell t-' + t + (past ? ' past' : '') + (x.iso === today ? ' today' : '') + '" data-d="' + x.iso + '"' + (past ? ' disabled' : '') + ' aria-label="' + esc(E.kdateY(x.iso)) + ' ' + esc(pkg.label) + ' ' + esc(won(x.price)) + '"><i>' + (+x.iso.slice(8)) + '</i><b>' + (x.price != null ? esc(man(x.price)).replace(' 원', '').replace('만 원', '만') : '–') + '</b>' + tag + '</button>';
      });
      var p = ym.split('-');
      el.querySelector('[data-out="pc-title"]').textContent = p[0] + '년 ' + (+p[1]) + '월';
      el.querySelector('[data-out="pc-grid"]').innerHTML = DOWS.map(function(d, i){ return '<span class="pc-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + d + '</span>'; }).join('') + cells;
      el.querySelector('[data-nav="prev"]').disabled = ym <= minYm; el.querySelector('[data-nav="next"]').disabled = ym >= maxYm;
      $$('[data-pc-pkg]', el).forEach(function(b){ b.classList.toggle('on', b.dataset.pcPkg === pkgId); b.setAttribute('aria-pressed', String(b.dataset.pcPkg === pkgId)); });
      var peakDays = days.filter(function(x){ return x.peak; }).length;
      el.querySelector('[data-out="pc-note"]').innerHTML = (peakDays ? '<span class="badge badge-season">이달 성수기 ' + peakDays + '일</span> ' : '') + esc(pkg.label) + ' ' + esc(pkg.time) + ' · ' + pkg.hours + '시간 공간료 · 기준 인원 포함 · 인원 추가와 옵션은 별도';
    }
    el.innerHTML = '<div class="pcal' + (compact ? ' compact' : '') + '">'
      + '<div class="pc-top"><div class="pc-nav"><button type="button" class="btn btn-light btn-sm" data-nav="prev" aria-label="이전 달">‹</button><b data-out="pc-title"></b><button type="button" class="btn btn-light btn-sm" data-nav="next" aria-label="다음 달">›</button></div>'
      + '<div class="pc-pkgs" role="group" aria-label="패키지 선택">' + D.packages.map(function(p){ return '<button type="button" data-pc-pkg="' + p.id + '" aria-pressed="false">' + esc(p.label.replace(' 패키지', '')) + '<small>' + esc(p.time) + '</small></button>'; }).join('') + '</div></div>'
      + '<div class="pc-grid" data-out="pc-grid"></div>'
      + '<div class="pc-legend"><span class="t-wd">월–목</span><span class="t-fri">금</span><span class="t-sat">토</span><span class="t-sun">일·공휴일</span><span class="t-peak">성수기</span></div>'
      + '<p class="tiny muted mt-2" data-out="pc-note"></p>'
      + '<p class="tiny muted">날짜를 누르면 그 날짜와 패키지 시간이 예약 신청 · 금액 확인에 들어갑니다. ' + esc(D.vatNote) + '</p></div>';
    el.addEventListener('click', function(e){
      var n = e.target.closest('[data-nav]'); if (n){ ym = shift(ym, n.dataset.nav === 'prev' ? -1 : 1); draw(); return; }
      var k = e.target.closest('[data-pc-pkg]'); if (k){ pkgId = k.dataset.pcPkg; draw(); return; }
      var c = e.target.closest('.pc-cell[data-d]'); if (!c || c.disabled) return;
      var pkg = E.findPkg(pkgId), est = M.pricing.estimator;
      if (est){ est.set({ date: c.dataset.d, start: pkg.start, end: pkg.end }); var box = document.querySelector('[data-price=estimator]'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else location.href = '/inquiry/?space=' + SPACE_ID + '&date=' + c.dataset.d + '&pkg=' + pkgId;
    });
    draw();
  };

  /* ---------- 계산 예시 (날짜는 오늘 기준으로 2주 뒤 이후의 해당 요일을 고릅니다) ---------- */
  function nextDow(dow, minDays){ var d = E.parse(E.addDays(E.todayIso(), minDays || 14)); while (d.getDay() !== dow) d.setDate(d.getDate() + 1); return E.iso(d); }
  // 아직 오지 않은 성수기 기간 안에서 해당 요일의 날짜 하나 (없으면 null)
  function peakSample(dow){
    var from = E.addDays(E.todayIso(), 7), ps = E.peakPeriods();
    for (var i = 0; i < ps.length; i++){
      var start = ps[i].from > from ? ps[i].from : from; if (start > ps[i].to) continue;
      var d = E.parse(start); while (d.getDay() !== dow){ d.setDate(d.getDate() + 1); } var s = E.iso(d); if (s <= ps[i].to) return s;
    }
    return null;
  }
  R.examples = function(el){
    var minDay = D.opening && D.opening > E.todayIso() ? Math.max(14, E.diffDays(E.todayIso(), D.opening)) : 14;   // 오픈 전 공간은 오픈일 이후 날짜로 예시를 만듭니다
    var ex = (D.exampleCases || []).map(function(c){ return { t: c.t, d: nextDow(c.dow, Math.max(minDay, c.min || 0)), s: c.s, e: c.e, p: c.p, pu: c.pu, o: c.o, regular: c.regular }; });
    var peakSat = peakSample(6), peakFri = peakSample(5), big = Math.min(D.people.max, D.people.base * 2), mid = Math.min(D.people.max, Math.round(D.people.base * 1.2 / 10) * 10 || D.people.base);
    if (peakSat) ex.push({ t: '성수기 토요일 송년회 ' + big + '명 올데이', d: peakSat, s: 10, e: 24, p: big, pu: 'party', o: { cleaning: true }, peak: true });
    if (peakFri) ex.push({ t: '성수기 금요일 저녁 네트워킹 ' + mid + '명', d: peakFri, s: 19, e: 23, p: mid, pu: 'networking', peak: true });
    ex = ex.map(function(x){
      var q = E.quote({ date: x.d, start: x.s, end: x.e, people: x.p, purpose: x.pu, options: x.o, regular: x.regular });
      var parts = [q.pkg ? q.pkg.label + ' ' + man(q.pkg.price) : '공간료 ' + man(q.time.fee)];
      if (q.peopleFee) parts.push('인원 추가 ' + man(q.peopleFee)); q.options.forEach(function(o){ parts.push(o.label + ' ' + man(o.amount)); });
      return '<button type="button" class="ex-card' + (x.peak ? ' is-peak' : '') + '" data-d="' + x.d + '" data-s="' + x.s + '" data-e="' + x.e + '" data-p="' + x.p + '" data-pu="' + x.pu + '" data-o="' + esc(Object.keys(x.o || {}).join(',')) + '" data-regular="' + (x.regular ? 1 : 0) + '"><div class="eyebrow">' + esc(E.kdate(x.d)) + ' · ' + esc(q.colLabel) + ' 요금' + (q.peak && q.peopleBase > D.people.base ? ' · ' + q.peopleBase + '명 포함' : '') + '</div><b>' + esc(x.t) + '</b><span class="ex-when">' + esc(q.range) + '</span><ul>' + parts.map(function(p){ return '<li>' + esc(p) + '</li>'; }).join('') + '</ul><div class="ex-total">' + esc(man(q.total)) + '<small>' + (x.regular ? ' 1회 기준 · 정기 할인 별도' : '') + '</small></div><span class="go">이 조건으로 금액 확인 →</span></button>';
    }).join('');
    el.innerHTML = '<div class="ex-grid">' + ex + '</div><p class="tiny muted mt-2">' + esc(D.version.split(' · ')[0]) + '으로 계산한 예시입니다. 옵션과 인원을 바꾸면 금액이 달라지니 계산기에서 조건을 직접 넣어 보세요. 성수기 예시는 그날의 성수기 요금과 포함 인원으로 계산했습니다.</p>';
    el.addEventListener('click', function(e){ var b = e.target.closest('.ex-card'); if (!b) return; var est = M.pricing.estimator; if (est){ est.set({ date: b.dataset.d, start: +b.dataset.s, end: +b.dataset.e, people: +b.dataset.p, purpose: b.dataset.pu, options: b.dataset.o ? b.dataset.o.split(',') : [], regular: b.dataset.regular === '1' }); var box = document.querySelector('[data-price=estimator]'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  };

  /* =====================================================================
     예약 신청 · 금액 확인 (계산기 + 예약 신청을 한 화면에)
     ① 시간(패키지 버튼 포함) → ② 이용일 → ③ 인원 → (선택) 옵션 → 금액 → 예약신청하기 → 이름·연락처 → 접수
     ===================================================================== */
  function defaultDate(){ var d = E.addDays(E.todayIso(), 14); return D.opening && D.opening > d ? D.opening : d; }   // 오픈 전 공간은 오픈일이 기본 이용일
  function hourOpts(from, to, val){ var o = ''; for (var h = from; h <= to; h++) o += '<option value="' + h + '"' + (h === val ? ' selected' : '') + '>' + esc(E.hourLabel(h)) + '</option>'; return o; }
  function purLabel(id){ var p = PUR.filter(function(x){ return x.id === id; })[0]; return p ? p.label : (id === 'other' ? '기타' : ''); }
  function minDate(){ var t = E.todayIso(); return D.opening && D.opening > t ? D.opening : t; }   // 오픈 전 공간은 오픈일부터
  function quickDates(){
    var out = [], today = E.parse(minDate());
    function next(dow, minDays){ var d = new Date(today); d.setDate(d.getDate() + (minDays || 0)); while (d.getDay() !== dow) d.setDate(d.getDate() + 1); return E.iso(d); }
    out.push({ label: '이번 주 토', iso: next(6, 1) });
    out.push({ label: '다음 주 금', iso: next(5, 8) });
    out.push({ label: '다음 주 토', iso: next(6, 8) });
    out.push({ label: '다음 주 일', iso: next(0, 8) });
    var seen = {}; out = out.filter(function(q){ if (seen[q.iso]) return false; seen[q.iso] = 1; return true; });
    return out.sort(function(a, b){ return a.iso < b.iso ? -1 : 1; });
  }
  var PASS_ID = { day: { wd: 'pass-day-wdfri', fri: 'pass-day-wdfri', sat: 'pass-day-satsun', sun: 'pass-day-satsun' }, allday: { wd: 'pass-allday-wd', fri: 'pass-allday-fri', sat: 'pass-allday-sat', sun: 'pass-allday-sun' }, allnight: { wd: 'pass-allnight-wd', fri: 'pass-allnight-fri', sat: 'pass-allnight-sat', sun: 'pass-allnight-sun' } };

  function renderEstimator(el, cfg){
    cfg = cfg || {};
    var q0 = {}; try { q0 = Object.fromEntries(new URLSearchParams(location.search)); } catch (_) {}
    var st = { date: cfg.date || q0.date || defaultDate(), start: 13, end: 17, people: E.clampInt(q0.people, 1, D.people.max, D.people.defaultPick || 30), purpose: cfg.purpose || q0.purpose || '', regular: q0.type === 'regular',
               opt: { manager: false, managerCount: 1, managerHours: 0, cleaning: false, disposable: false, banner: false, xbanner: false } };
    if (q0.pkg){ var pk0 = E.findPkg(q0.pkg); if (pk0){ st.start = pk0.start; st.end = pk0.end; } }
    if (q0.start && q0.end){ st.start = E.clampInt(q0.start, D.openFrom, D.openTo - 1, 13); st.end = E.clampInt(q0.end, st.start + 1, D.openTo, st.start + 4); }
    var pid = 'rv' + Math.random().toString(36).slice(2, 6);

    el.innerHTML = ''
      + '<div class="rv"><div class="rv-form">'
      + '<div class="rv-head"><div><div class="eyebrow">Reserve</div><h3>예약 신청 · 금액 확인</h3></div><p class="small muted">시간 · 날짜 · 인원만 고르면 금액이 바로 나옵니다. 그대로 예약을 신청하면 담당자가 일정을 확인하고 결제를 안내해 드립니다.</p></div>'
      // ① 시간
      + '<section class="rv-step"><h4><span>1</span>이용 시간</h4>'
      + '<div class="rv-time"><div class="f"><label for="' + pid + '-start">시작</label><select class="select" id="' + pid + '-start" name="start">' + hourOpts(D.openFrom, D.openTo - 1, st.start) + '</select></div>'
      + '<div class="rv-arrow" aria-hidden="true">→</div>'
      + '<div class="f"><label for="' + pid + '-end">종료</label><select class="select" id="' + pid + '-end" name="end">' + hourOpts(D.openFrom + 1, D.openTo, st.end) + '</select></div>'
      + '<div class="rv-hours" data-out="hours"></div></div>'
      + '<div class="rv-pkg-head"><b>패키지도 가능합니다.</b> <span class="muted">시간을 묶으면 ' + Math.floor(minPkgPct()) + '% 이상 저렴합니다. 누르면 시간이 자동으로 들어갑니다.</span></div>'
      + '<div class="slot-pick" data-out="pkgs">' + D.packages.map(function(p){ return '<button type="button" class="slot-btn" data-pkg="' + p.id + '" aria-pressed="false"><b>' + esc(p.label) + '</b><span>' + esc(p.time) + ' · ' + p.hours + '시간</span><em data-out="pkg-' + p.id + '"></em></button>'; }).join('') + '</div>'
      + '<p class="hint mt-1">준비·정리 시간까지 넣어 잡아 주세요. 새벽 ' + esc(E.hourLabel(D.openFrom)) + '부터 다음 날 ' + esc(E.hourLabel(D.openTo).replace('다음 날 ', '')) + '까지 1시간 단위입니다.' + (D.dawn ? ' ' + esc(D.dawn.note) : '') + ' 조찬 모임은 따로 연락 주시면 추가 협찬·할인을 안내해 드립니다.</p></section>'
      // ② 날짜
      + '<section class="rv-step"><h4><span>2</span>이용일</h4>'
      + '<div class="est-row"><div class="f" style="flex:0 1 220px"><label for="' + pid + '-date" class="sr-only">이용일</label><input class="input" type="date" id="' + pid + '-date" name="date" value="' + esc(st.date) + '" min="' + minDate() + '"></div><div class="est-daytag" data-out="daytag"></div></div>'
      + '<div class="pick mt-2" data-out="date-pick">' + quickDates().map(function(q){ return '<button type="button" data-d="' + q.iso + '">' + esc(q.label) + '<small>' + esc(E.kdate(q.iso)) + '</small></button>'; }).join('') + '</div></section>'
      // ③ 인원
      + '<section class="rv-step"><h4><span>3</span>인원 <em data-out="people-base">기준 ' + D.people.base + '명 포함 · ' + (D.people.base + 1) + '명째부터 1명당 ' + esc(man(D.people.extra)) + ' · 최대 ' + D.people.max + '명</em></h4>'
      + '<div class="est-row"><div class="f" style="flex:0 1 140px"><label for="' + pid + '-people" class="sr-only">인원</label><input class="input" type="number" inputmode="numeric" id="' + pid + '-people" name="people" min="1" max="' + D.people.max + '" value="' + st.people + '"></div>'
      + '<div class="pick" data-out="people-pick">' + (D.people.picks || [20, 30, 50, 100, 150, 200]).map(function(n){ return '<button type="button" data-n="' + n + '">' + n + '명</button>'; }).join('') + '</div></div></section>'
      // 옵션 (접힘)
      + '<details class="rv-more"><summary>옵션 · 모임 유형 · 정기 이용 <span class="muted">(선택)</span></summary><div class="rv-more-body">'
      + '<div class="est-row"><div class="f" style="flex:1 1 220px"><label for="' + pid + '-purpose">모임 유형</label><select class="select" id="' + pid + '-purpose" name="purpose"><option value="">선택 안 함</option>' + PUR.map(function(p){ return '<option value="' + p.id + '"' + (st.purpose === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') + '<option value="other">기타</option></select></div>'
      + '<label class="chk" style="align-self:flex-end"><input type="checkbox" name="regular"' + (st.regular ? ' checked' : '') + '> 4회 이상 정기 이용 예정 <span class="chk-hint">별도 할인 안내</span></label></div>'
      + '<div class="checks mt-2">'
      + '<label class="chk"><input type="checkbox" name="manager"> 현장 매니저 <span class="chk-hint">1인 1시간 ' + esc(man(25000)) + '</span></label>'
      + '<label class="chk"><input type="checkbox" name="cleaning"> 뒷정리·청소 지원 <span class="chk-hint">' + esc(man(200000)) + '</span></label>'
      + '<label class="chk"><input type="checkbox" name="disposable"> 1회용 세트 <span class="chk-hint">1인당 ' + esc(man(5000)) + '</span></label>'
      + '<label class="chk"><input type="checkbox" name="banner"> 현수막 제작 <span class="chk-hint">' + esc(man(120000)) + '</span></label>'
      + '<label class="chk"><input type="checkbox" name="xbanner"> X배너 제작 <span class="chk-hint">' + esc(man(70000)) + '</span></label>'
      + '</div>'
      + '<div class="est-row mt-2" data-out="manager-row" hidden><div class="f inline"><label for="' + pid + '-mcount">매니저</label><input class="input" type="number" id="' + pid + '-mcount" name="managerCount" min="1" max="10" value="1"><span class="small">명</span></div><div class="f inline"><label for="' + pid + '-mhours">시간</label><input class="input" type="number" id="' + pid + '-mhours" name="managerHours" min="1" max="24" value="" placeholder="이용 시간"><span class="small">시간</span></div></div>'
      + '<p class="tiny muted mt-2">' + esc(D.askOptions.map(function(o){ return o.label; }).join(' · ')) + '은 예약 신청 뒤 상담에서 안내합니다. ' + esc(D.includedShort || '') + '</p>'
      + '</div></details>'
      + '</div>'
      // 결과 + 예약 신청
      + '<div class="rv-side"><div class="rv-result" data-out="result"></div></div>'
      + '<div class="est-mini" data-out="mini" hidden><span>예상 금액<small data-out="minisub"></small></span><b data-out="minitotal"></b><button type="button" class="btn btn-primary btn-sm" data-act="show">예약 신청</button></div>'
      + '</div>';

    var f = function(n){ return el.querySelector('[name=' + n + ']'); };
    var out = function(n){ return el.querySelector('[data-out="' + n + '"]'); };
    var last = null, phase = 'calc', member = null, done = null, sideVisible = false;
    // 모바일: 결과 카드가 화면에 보이면 아래 고정 요약 바를 숨깁니다
    // 요약 바가 실제로 보일 때(작은 화면 + 계산기 영역 안)만 body에 표시해 전역 빠른 연락 바와 겹치지 않게 합니다
    var rvVisible = false;
    function syncMiniClass(){ var m = out('mini'); var on = m && !m.hidden && rvVisible && window.matchMedia('(max-width:999px)').matches; document.body.classList.toggle('est-mini-on', !!on); }
    if ('IntersectionObserver' in window){
      new IntersectionObserver(function(en){ sideVisible = en[0].isIntersecting; var m = out('mini'); if (m) m.hidden = phase === 'done' || sideVisible; syncMiniClass(); }, { threshold: 0.15 }).observe(el.querySelector('.rv-side'));
      new IntersectionObserver(function(en){ rvVisible = en[0].isIntersecting; syncMiniClass(); }, { threshold: 0 }).observe(el.querySelector('.rv'));
    }

    function read(){
      st.date = f('date').value || E.todayIso();
      st.start = +f('start').value; st.end = +f('end').value;
      if (st.end <= st.start){ st.end = Math.min(st.start + 1, D.openTo); f('end').value = st.end; }
      st.people = E.clampInt(f('people').value, 1, D.people.max, D.people.base);
      st.purpose = f('purpose').value; st.regular = f('regular').checked;
      ['manager', 'cleaning', 'disposable', 'banner', 'xbanner'].forEach(function(k){ st.opt[k] = f(k).checked; });
      st.opt.managerCount = E.clampInt(f('managerCount').value, 1, 10, 1);
      var mh = parseInt(f('managerHours').value, 10); st.opt.managerHours = isFinite(mh) && mh > 0 ? Math.min(mh, 24) : 0;
    }
    function options(){
      var o = {};
      if (st.opt.manager) o.manager = { count: st.opt.managerCount, hours: st.opt.managerHours || (st.end - st.start) };
      ['cleaning', 'disposable', 'banner', 'xbanner'].forEach(function(k){ if (st.opt[k]) o[k] = true; });
      return o;
    }
    function calc(){
      read();
      var r = E.quote({ date: st.date, start: st.start, end: st.end, people: st.people, purpose: st.purpose, options: options(), regular: st.regular });
      last = r; paint(r); return r;
    }
    function lineRows(r){
      var lines = '';
      if (r.pkg) lines += '<tr class="pkg"><td><span class="ln">' + esc(r.pkg.label) + ' 공간료' + (r.peak ? ' <small class="muted">(' + esc(r.peak.seasonLabel) + ')</small>' : '') + '</span><span class="nt">' + esc(r.pkg.time) + ' · ' + r.pkg.hours + '시간' + (r.pkg.pct ? ' · 시간 요금 ' + esc(won(r.pkg.regular)) + '에서 ' + r.pkg.pct + '% 할인' : '') + (r.peak && r.peak.people > D.people.base ? ' · 기준 ' + r.peak.people + '명 포함' : '') + '</span></td><td class="pr">' + esc(won(r.pkg.price)) + '</td></tr>';
      else {
        r.time.lines.forEach(function(l){ lines += '<tr><td><span class="ln">공간료 · ' + esc(l.label) + (l.dawn ? ' <small class="muted">(심야 요금)</small>' : '') + '</span><span class="nt">' + esc(E.hourLabel(l.from)) + '–' + esc(E.hourLabel(l.to)) + ' · ' + l.hours + '시간 × ' + esc(won(l.rate)) + '</span></td><td class="pr">' + esc(won(l.sum)) + '</td></tr>'; });
        if (r.surcharge) lines += r.peak ? '<tr><td><span class="ln">성수기 포함 인원 ' + r.peopleBase + '명 가산</span><span class="nt">' + esc(r.peak.label) + ' · 1건당 · 시간제에만 더해집니다</span></td><td class="pr">' + esc(won(r.surcharge)) + '</td></tr>'
          : '<tr><td><span class="ln">' + esc((D.surcharge && D.surcharge.label) || '기본 인원 가산액') + '</span><span class="nt">기준 ' + r.peopleBase + '명 포함 · 시간제 예약 1건당 · 패키지에는 들어 있습니다</span></td><td class="pr">' + esc(won(r.surcharge)) + '</td></tr>';
      }
      lines += '<tr><td><span class="ln">인원 ' + r.people + '명</span><span class="nt">' + (r.peopleExtra ? '기준 ' + r.peopleBase + '명 포함 · 추가 ' + r.peopleExtra + '명 × ' + esc(won(D.people.extra)) : '기준 ' + r.peopleBase + '명 안이라 추가 요금 없음') + '</span></td><td class="pr">' + (r.peopleFee ? esc(won(r.peopleFee)) : '0원') + '</td></tr>';
      r.options.forEach(function(o){ lines += '<tr class="adj"><td><span class="ln">' + esc(o.label) + '</span><span class="nt">' + esc(o.qty) + ' · ' + esc(won(o.unitPrice)) + ' / ' + esc(o.unit) + '</span></td><td class="pr">' + esc(won(o.amount)) + '</td></tr>'; });
      return lines;
    }
    function paint(r){
      var d = r.day;
      out('daytag').innerHTML = '<span class="badge badge-cobalt">' + esc(E.kdate(r.date)) + '</span>' + (d.peak ? '<span class="badge badge-season">' + esc(d.peak.seasonLabel) + ' · ' + esc(d.peak.label) + ' 기준</span>' + (d.peak.people > D.people.base ? '<span class="badge badge-soft">' + d.peak.people + '명 포함</span>' : '') : '<span class="badge badge-soft">' + esc(r.colLabel) + ' 요금</span>') + (d.holiday ? '<span class="badge badge-rust">' + esc(d.holiday) + '</span>' : '') + (d.why ? '<span class="tiny muted" style="flex-basis:100%">' + esc(d.why) + '</span>' : '');
      $$('.slot-btn', out('pkgs')).forEach(function(b){ var p = E.findPkg(b.dataset.pkg); var on = r.pkg && r.pkg.id === p.id; b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', String(!!on)); var em = out('pkg-' + p.id); if (em){ var pp = E.pkgPrice(r.day, p); em.textContent = pp != null ? man(pp) + (r.peak ? ' · 성수기' : '') : ''; } });
      var pb = out('people-base'); if (pb) pb.textContent = (r.peak && r.peopleBase > D.people.base ? r.peak.seasonLabel + ' 기준 ' + r.peopleBase + '명 포함' : '기준 ' + r.peopleBase + '명 포함') + ' · ' + (r.peopleBase + 1) + '명째부터 1명당 ' + man(D.people.extra) + ' · 최대 ' + D.people.max + '명';
      out('hours').innerHTML = '<b>' + r.hours + '시간</b><span>' + esc(E.hourLabel(r.start)) + ' – ' + esc(E.hourLabel(r.end)) + '</span>' + (r.pkg ? '<span class="badge badge-ok">' + esc(r.pkg.label) + ' 할인 적용</span>' : '');
      $$('button', out('people-pick')).forEach(function(b){ var on = +b.dataset.n === r.people; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $$('button', out('date-pick')).forEach(function(b){ var on = b.dataset.d === r.date; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      if (r.date < E.todayIso()) out('daytag').insertAdjacentHTML('beforeend', '<span class="badge badge-rust">지난 날짜</span><span class="tiny" style="flex-basis:100%;color:var(--rust)">지난 날짜입니다. 이용일을 다시 골라 주세요.</span>');
      else if (D.opening && r.date < D.opening) out('daytag').insertAdjacentHTML('beforeend', '<span class="badge badge-rust">오픈 전</span><span class="tiny" style="flex-basis:100%;color:var(--rust)">' + esc(NAME) + '은 ' + esc(E.kdateY(D.opening)) + ' 문을 엽니다. 오픈일 이후 날짜를 골라 주세요. 그 전 날짜는 <a href="/inquiry/?space=' + DEFAULT_SPACE + '&date=' + esc(r.date) + '" style="text-decoration:underline">건대 1호</a>로 신청할 수 있습니다.</span>');
      out('manager-row').hidden = !st.opt.manager;
      $$('.rate-table td.rc').forEach(function(td){ td.classList.remove('hl'); });
      var bands = {}; r.time.lines.forEach(function(l){ bands[l.band] = true; });
      Object.keys(bands).forEach(function(b){ $$('.rate-table td.rc[data-band="' + b + '"][data-col="' + r.col + '"]').forEach(function(td){ td.classList.add('hl'); }); });
      if (phase === 'calc') paintResult(r);
      else if (phase === 'form') paintForm(r);
      var mini = out('mini'); mini.hidden = phase === 'done' || sideVisible; out('minitotal').textContent = man(r.total); out('minisub').textContent = E.kdate(r.date) + ' · ' + r.hours + '시간 · ' + r.people + '명';
      syncMiniClass();
      renderQuoteSheet(r, purLabel(r.purpose));
    }
    function headBlock(r){
      var pl = purLabel(r.purpose), notes = r.warnings.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join(''), tips = r.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('');
      return '<div class="row between"><div class="eyebrow">Estimate</div><span class="tiny muted">' + esc(D.version) + '</span></div>'
        + '<div class="rv-total"><span>예상 금액<small>' + esc(D.vatNote) + '</small></span><b>' + esc(man(r.total)) + '</b></div>'
        + '<p class="small muted">' + esc(E.kdateY(r.date)) + ' · ' + esc(r.colLabel) + ' 요금 · ' + esc(r.range) + ' · ' + r.people + '명' + (pl ? ' · ' + esc(pl) : '') + '</p>'
        + '<details class="rv-lines"><summary>금액 구성 보기 <span class="muted">총액 ' + esc(won(r.total)) + ' · ' + esc(D.deposit.label) + ' ' + esc(won(r.deposit)) + ' 별도</span></summary><table class="est-lines"><tbody>' + lineRows(r) + '</tbody></table>' + (notes ? '<ul class="est-warn">' + notes + '</ul>' : '') + (tips ? '<ul class="est-notes">' + tips + '</ul>' : '') + '</details>';
    }
    function ensureCard(){
      var box = out('result');
      if (!box.querySelector('[data-out="head"]')) box.innerHTML = '<div class="est-card rv-card"><div data-out="head"></div><div data-out="body"></div></div>';
      return box;
    }
    function paintHead(r){ ensureCard(); var was = out('head').querySelector('.rv-lines'); var keepOpen = !!(was && was.open); out('head').innerHTML = headBlock(r); if (keepOpen){ var d = out('head').querySelector('.rv-lines'); if (d) d.open = true; } }   // 인원을 고친 뒤 '금액 구성 보기'를 눌러도 다시 닫히지 않게 열림 상태를 유지
    function paintResult(r){
      ensureCard(); paintHead(r);
      var cp = CC && CC.preset(), cq = cp && (cp.course || cp.bbq || cp.beer) ? CC.quote(cp) : null;
      out('body').innerHTML = (cq && !cq.empty ? '<p class="rv-cat-note"><span class="badge badge-direct">출장뷔페</span> ' + esc(CC.parts(cq)) + ' · 예상 ' + esc(won(cq.total)) + ' <small class="muted">부가세 포함 · 대관료와 별도 · 예약 신청서에 함께 담깁니다</small></p>' : '')
        + '<button type="button" class="btn btn-primary btn-lg rv-go" data-act="reserve">예약신청하기 <span class="arrow">→</span></button>'
        + '<div class="rv-sub"><button type="button" class="btn btn-light btn-sm" data-act="pdf">견적서 PDF 저장</button>' + (KAKAO ? '<a class="btn btn-kakao btn-sm" data-act="kakao" href="' + esc(KAKAO) + '" target="_blank" rel="noopener">카카오톡으로 문의</a>' : '') + '</div>'
        + '<p class="tiny muted mt-2">예약 신청은 결제가 아닙니다. 담당자가 일정을 확인한 뒤 확정 금액과 결제 방법을 안내드리고, 결제가 끝나면 예약이 확정됩니다.</p>'
        + (D.specialNote ? '<p class="rv-special"><span class="badge badge-rust">추가 협찬 · 할인</span>' + esc(D.specialNote) + '</p>' : '');
    }
    function paintForm(r){
      ensureCard(); paintHead(r);
      if (out('body').querySelector('.rv-apply')) return;   // 이미 열린 폼은 그대로 둡니다(입력값 보존)
      var m = member || {};
      out('body').innerHTML = '<form class="rv-apply" novalidate><h4>예약자 정보 <small class="muted">이름과 연락처만 있으면 됩니다</small></h4>'
        + '<div class="member-line on" data-out="member-line"' + (member ? '' : ' hidden') + '><span><b>' + esc(m.name || '') + '</b>님, 회원 정보로 채웠습니다. 진행 상태는 마이페이지에서 볼 수 있습니다.</span></div>'
        + '<div class="field-row"><div class="f"><label for="' + pid + '-name">이름 <span class="req">*</span></label><input class="input" id="' + pid + '-name" name="rv_name" autocomplete="name" maxlength="40" value="' + esc(m.name || '') + '" required></div>'
        + '<div class="f"><label for="' + pid + '-phone">휴대폰 번호 <span class="req">*</span></label><input class="input" type="tel" id="' + pid + '-phone" name="rv_phone" autocomplete="tel" inputmode="numeric" placeholder="010-0000-0000" value="' + esc(m.phone || '') + '" required></div></div>'
        + '<div class="field-row"><div class="f"><label for="' + pid + '-email">이메일 <span class="muted">(선택)</span></label><input class="input" type="email" id="' + pid + '-email" name="rv_email" autocomplete="email" placeholder="견적서를 받을 주소" value="' + esc(m.email || '') + '"></div>'
        + '<div class="f"><label for="' + pid + '-ptype">모임 유형 <span class="muted">(선택)</span></label><select class="select" id="' + pid + '-ptype" name="rv_purpose"><option value="">선택 안 함</option>' + PUR.map(function(p){ return '<option value="' + p.id + '"' + (st.purpose === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') + '<option value="other"' + (st.purpose === 'other' ? ' selected' : '') + '>기타</option></select></div></div>'
        + '<div class="f"><label for="' + pid + '-msg">요청사항 <span class="muted">(선택)</span></label><textarea class="textarea" id="' + pid + '-msg" name="rv_message" maxlength="1000" style="min-height:64px" placeholder="행사 성격, 배치, 반입할 장비, 음식 등 미리 알려 주실 것"></textarea></div>'
        + (CC ? CC.formBlock('rv_cat') : '')
        + (CK ? CK.formBlock('rv') : '')
        + (M.familyAsk ? M.familyAsk('rv_family') : '')
        + (M.visitAsk ? M.visitAsk('rv_visit') : '')
        + '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">'
        + '<label class="agree"><input type="checkbox" name="rv_agree" required> <span>(필수) 예약 안내를 위해 이름·연락처·이메일·신청 내용을 수집·이용하는 데 동의합니다. 보유 기간은 처리 완료 후 1년이며 <a href="/privacy/" target="_blank" rel="noopener" style="text-decoration:underline">개인정보처리방침</a>을 따릅니다.</span></label>'
        + '<div class="err" data-out="err" role="alert" hidden></div>'
        + '<div class="rv-apply-btns"><button type="submit" class="btn btn-primary btn-lg" data-act="submit">예약 신청 완료 <span class="arrow">→</span></button><button type="button" class="btn btn-light" data-act="back">← 금액 다시 보기</button></div>'
        + '</form>';
      var ph = el.querySelector('[name=rv_phone]'); ph.addEventListener('input', function(){ var v = this.value.replace(/[^0-9]/g, '').slice(0, 11); if (v.length > 7) v = v.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3'); else if (v.length > 3) v = v.replace(/(\d{3})(\d+)/, '$1-$2'); this.value = v; });
      el.querySelector('.rv-apply').addEventListener('submit', function(e){ e.preventDefault(); submit(); });
      if (CC) CC.bind(el.querySelector('.rv-apply'), 'rv_cat', function(){ return (last || {}).people || st.people; });
      if (CK) CK.bind(el.querySelector('.rv-apply'));
      if (M.visitBind) M.visitBind(el.querySelector('.rv-apply'), 'rv_visit');
      // 모바일에서는 화면이 움직이는 중이라 자동 포커스를 하지 않습니다(키보드가 튀어 올라 위치가 흔들림)
      if (window.matchMedia('(min-width:960px) and (hover:hover)').matches) setTimeout(function(){ var n = el.querySelector('[name=rv_name]'); if (n && !n.value) n.focus(); }, 50);
    }
    function fillMember(m){
      var form = el.querySelector('.rv-apply'); if (!form || !m) return;
      [['rv_name', m.name], ['rv_phone', m.phone], ['rv_email', m.email]].forEach(function(x){ var i = form.querySelector('[name=' + x[0] + ']'); if (i && !i.value && x[1]) i.value = x[1]; });
      var ml = out('member-line'); if (ml){ ml.hidden = false; ml.querySelector('b').textContent = m.name || ''; }
    }
    function reserveText(r, who){
      var L = [E.summaryText(r, purLabel(r.purpose))];
      if (who) L.unshift('[' + NAME + ' 예약 신청] ' + who.name + ' / ' + who.phone + (who.email ? ' / ' + who.email : '') + (who.message ? '\n요청사항: ' + who.message : '') + (who.family && who.family.length && M.familyLabel ? '\n함께 알아보기: ' + M.familyLabel(who.family) : '') + (who.catering ? '\n출장뷔페: ' + who.catering.summary : '') + (who.cocktail ? '\n출장 칵테일: ' + who.cocktail.summary : '') + (who.visit && M.visitLabel ? '\n현장답사 희망: ' + M.visitLabel(who.visit) : ''));
      return L.join('\n');
    }
    function submit(){
      var form = el.querySelector('.rv-apply'), er = out('err'); er.hidden = true;
      if (!M.validate(form)){ er.textContent = '이름·휴대폰 번호와 동의 여부를 확인해 주세요.'; er.hidden = false; return; }
      read(); var r = last || calc();
      if (r.date < E.todayIso()){ er.textContent = '지난 날짜는 신청할 수 없습니다. 이용일을 다시 골라 주세요.'; er.hidden = false; return; }
      if (D.opening && r.date < D.opening){ er.textContent = NAME + '은 ' + E.kdateY(D.opening) + ' 오픈합니다. 오픈일 이후 날짜를 골라 주세요.'; er.hidden = false; return; }
      var who = { name: form.rv_name.value.trim(), phone: form.rv_phone.value.trim(), email: form.rv_email.value.trim(), message: form.rv_message.value.trim(), family: [].slice.call(form.querySelectorAll('[name=rv_family]:checked')).map(function(i){ return i.value; }), catering: CC ? CC.read(form, 'rv_cat', r.people) : null, cocktail: CK ? CK.read(form) : null, visit: M.visitRead ? M.visitRead(form, 'rv_visit') : null };
      var purpose = form.rv_purpose.value || st.purpose;
      var body = { inquiry_type: st.regular ? 'regular' : 'event', space_id: SPACE_ID, reserve: true, purpose: purpose, date: r.date, slot: 'custom',
        t_start: E.hourLabel(r.start).replace(/^다음 날 /, ''), t_end: E.hourLabel(r.end).replace(/^다음 날 /, ''), start_h: r.start, end_h: r.end, headcount: r.people,
        options: options(), pkg: r.pkg ? r.pkg.id : '', total: r.total, name: who.name, phone: who.phone, email: who.email, message: who.message, family: who.family, catering: who.catering, cocktail: who.cocktail, visit_wish: who.visit, contact_pref: 'kakao',
        agree_privacy: true, estimate: E.summaryText(r, purLabel(purpose)), source: location.pathname, summary: reserveText(r, who), website: form.website.value, came_from: M.source ? M.source() : null };
      var btn = el.querySelector('[data-act=submit]'); btn.disabled = true; btn.textContent = '신청하는 중…';
      M.api('/inquiry', { method: 'POST', body: body }).then(function(res){ done = { ref: res.ref, live: true, who: who, r: r, purpose: purpose, member: !!res.member }; phase = 'done'; paintDone(); })
      .catch(function(ex){
        if (ex.code === 'NO_API'){ done = { ref: M.localRef('MS'), live: false, who: who, r: r, purpose: purpose }; phase = 'done'; paintDone(); return; }
        er.textContent = ex.message || '신청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.'; er.hidden = false; btn.disabled = false; btn.innerHTML = '예약 신청 완료 <span class="arrow">→</span>';
      });
    }
    function paintDone(){
      var r = done.r, text = reserveText(r, done.who);
      var passId = D.onlinePass && r.pkg && !r.peak ? PASS_ID[r.pkg.id][r.col] : null;   // 성수기는 이용권 금액과 달라 온라인 이용권으로 결제하지 않습니다 · 온라인 이용권은 1호만
      var addons = Object.keys(options());
      var payLink = passId ? '/order/?product=' + passId + '&date=' + r.date + '&people=' + r.people + '&ref=' + encodeURIComponent(done.ref) + (addons.length ? '&addons=' + addons.join(',') : '') : '';
      out('result').innerHTML = '<div class="est-card rv-card rv-done">'
        + '<div class="row between"><div class="eyebrow">' + (done.live ? 'Received' : 'Draft') + '</div><span class="badge ' + (done.live ? 'badge-ok' : 'badge-warn') + '">' + (done.live ? '예약 신청 접수' : '체험 모드 · 전송 대기') + '</span></div>'
        + '<h3 class="est-title">' + (done.live ? '예약 신청이 접수되었습니다' : '예약 신청 내용이 준비되었습니다') + '</h3>'
        + '<div class="oc-code mt-2"><small>접수번호</small><b>' + esc(done.ref) + '</b></div>'
        + (done.who && done.who.visit && M.visitLabel ? '<div class="visit-done mt-2"><b>현장답사 희망도 함께 받았습니다</b><span>' + esc(M.visitLabel(done.who.visit)) + ' — 담당자가 연락드려 답사 시간을 확정합니다.</span></div>' : '')
        + '<dl class="def mt-3"><div><dt>이용일</dt><dd>' + esc(E.kdateY(r.date)) + '</dd></div><div><dt>시간</dt><dd>' + esc(r.range) + (r.pkg ? ' · ' + esc(r.pkg.label) : '') + '</dd></div><div><dt>인원</dt><dd>' + r.people + '명</dd></div><div><dt>예상 금액</dt><dd><b>' + esc(won(r.total)) + '</b> <span class="muted">(' + esc(D.deposit.label) + ' ' + esc(won(r.deposit)) + ' 별도)</span></dd></div>' + (done.who.catering ? '<div><dt>출장뷔페</dt><dd>' + esc(done.who.catering.summary) + ' <span class="muted">(대관료와 별도)</span></dd></div>' : '') + (done.who.cocktail ? '<div><dt>출장 칵테일</dt><dd>' + esc(done.who.cocktail.summary) + ' <span class="muted">(대관료와 별도 · 조건 확인 전)</span></dd></div>' : '') + '<div><dt>예약자</dt><dd>' + esc(done.who.name) + ' · ' + esc(done.who.phone) + '</dd></div></dl>'
        + (done.live
          ? '<ol class="steps-mini mt-3"><li><b>일정 확인</b><span>담당자가 신청하신 날짜·시간이 비어 있는지 확인하고 영업시간 기준 2시간 안에 카카오톡·문자로 연락드립니다.</span></li><li><b>금액 확인·결제 안내</b><span>확정 금액과 결제 방법(카드·계좌이체)을 안내드립니다.</span></li><li><b>예약 확정</b><span>결제가 끝나면 예약번호가 발급되고 현장 안내를 보내 드립니다.</span></li></ol>'
          : '<p class="small muted mt-2">지금은 서버가 연결되지 않아 자동 저장되지 않았습니다. 아래 내용을 카카오톡으로 보내 주시면 같은 순서로 안내해 드립니다.</p>')
        + (payLink && done.live ? '<div class="notice mt-3"><div><b>지금 바로 결제하고 확정할 수도 있습니다.</b><br>선택하신 시간이 ' + esc(r.pkg.label) + '와 같아서 온라인 이용권으로 바로 결제할 수 있습니다. 고르신 옵션은 주문 화면에 미리 담기고, 결제가 끝나면 이 신청이 자동으로 \'예약 확정\'으로 바뀝니다.</div><a class="btn btn-primary btn-sm" href="' + esc(payLink) + '">바로 결제하기 →</a></div>' : '')
        + '<div class="rv-sub mt-3">' + (KAKAO ? '<a class="btn btn-kakao btn-sm" data-act="kakao" href="' + esc(KAKAO) + '" target="_blank" rel="noopener">카카오톡으로 보내기</a>' : '') + '<button type="button" class="btn btn-light btn-sm" data-act="copy">내용 복사</button><button type="button" class="btn btn-light btn-sm" data-act="pdf">견적서 PDF</button><button type="button" class="btn btn-light btn-sm" data-act="ics">내 캘린더에 저장</button>' + (done.member ? '<a class="btn btn-light btn-sm" href="/mypage/">마이페이지</a>' : '') + '<button type="button" class="btn btn-ghost btn-sm" data-act="again">새로 계산</button></div>'
        + '<pre class="dr-pre mt-3" data-out="summary" hidden>' + esc(text) + '</pre>'
        + '</div>';
      out('mini').hidden = true; syncMiniClass();
      out('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function icsDownload(){
      var r = done.r, C = M.CONFIG || {};
      function dt(iso, h){ var d = E.parse(iso); d.setHours(0, 0, 0, 0); d.setHours(h); var p = function(n){ return ('0' + n).slice(-2); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + 'T' + p(d.getHours()) + p(d.getMinutes()) + '00'; }
      var now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
      var desc = ('접수번호 ' + done.ref + '\\n' + E.summaryText(r, purLabel(done.purpose)).replace(/\n/g, '\\n') + '\\n예약 신청 상태이며 결제가 끝나면 확정됩니다.');
      var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MEGASPOT//reserve//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:' + done.ref + '@megaspot.kr', 'DTSTAMP:' + stamp,
        'DTSTART;TZID=Asia/Seoul:' + dt(r.date, r.start), 'DTEND;TZID=Asia/Seoul:' + dt(r.date, r.end), 'SUMMARY:' + NAME + ' 예약 신청 (' + r.people + '명)',
        'LOCATION:' + (D.address ? NAME + ' · ' + D.address : (C.venueAddress || '서울특별시 광진구 화양동 10-1 한아름건물 2층')), 'DESCRIPTION:' + desc, 'STATUS:TENTATIVE', 'END:VEVENT', 'END:VCALENDAR'];
      var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'megaspot_' + r.date + '.ics'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
      M.toast('캘린더 파일을 저장했습니다. 열면 일정에 추가됩니다.');
    }

    // 인원·매니저 칸은 입력할 때마다(input) 이미 계산하므로, 칸을 벗어날 때 나는 change 는 건너뜁니다(안 그러면 '금액 구성 보기'를 누르는 순간 카드가 다시 그려져 닫힙니다)
    el.addEventListener('change', function(e){ var n = e.target.name || ''; if (n.indexOf('rv_') === 0 || n === 'people' || n === 'managerCount' || n === 'managerHours') return; calc(); });
    el.addEventListener('input', function(e){ if (e.target.name === 'people' || e.target.name === 'managerCount' || e.target.name === 'managerHours') calc(); });
    out('pkgs').addEventListener('click', function(e){ var b = e.target.closest('.slot-btn'); if (!b) return; var p = E.findPkg(b.dataset.pkg); f('start').value = p.start; f('end').value = p.end; calc(); });
    out('people-pick').addEventListener('click', function(e){ var b = e.target.closest('button'); if (!b) return; f('people').value = b.dataset.n; calc(); });
    out('date-pick').addEventListener('click', function(e){ var b = e.target.closest('button'); if (!b) return; f('date').value = b.dataset.d; calc(); });
    el.addEventListener('click', function(e){
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.dataset.act;
      if (act === 'show'){ out('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); if (phase === 'calc'){ phase = 'form'; paintForm(last || calc()); } return; }
      if (act === 'reserve'){ phase = 'form'; paintForm(last || calc()); if (window.matchMedia('(max-width:959px)').matches) out('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (act === 'back'){ phase = 'calc'; paintResult(last || calc()); return; }
      if (act === 'ics'){ if (done) icsDownload(); return; }
      if (act === 'again'){ phase = 'calc'; done = null; paintResult(calc()); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (act === 'submit') return;
      if (!last) calc();
      var text = done ? reserveText(done.r, done.who) : E.summaryText(last, purLabel(last.purpose));
      if (act === 'copy'){ copyText(text, '내용을 복사했습니다.'); }
      if (act === 'kakao'){ copyText(text, '내용을 복사했습니다. 카카오톡 채팅창에 붙여 넣어 보내 주세요.'); }
      if (act === 'pdf'){ printQuote(done ? done.r : last); }
    });
    function copyText(text, msg){ (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function(){ M.toast(msg); }).catch(function(){ window.prompt('아래 내용을 복사해 주세요.', text); }); }
    if (M.account && M.account.loggedIn()) M.account.me().then(function(m){ member = m; if (phase === 'form') fillMember(m); });

    var api = {
      setDate: function(iso){ if (!iso) return; f('date').value = iso; calc(); },
      setPackage: function(id){ var p = E.findPkg(id); if (!p) return; f('start').value = p.start; f('end').value = p.end; calc(); },
      setRange: function(s, e){ f('start').value = s; f('end').value = e; calc(); },
      set: function(o){ o = o || {}; if (o.date) f('date').value = o.date; if (o.start) f('start').value = o.start; if (o.end) f('end').value = o.end; if (o.people) f('people').value = o.people; if (o.purpose !== undefined) f('purpose').value = o.purpose;
        if (o.options){ ['manager', 'cleaning', 'disposable', 'banner', 'xbanner'].forEach(function(k){ f(k).checked = o.options.indexOf(k) >= 0; }); }
        if (o.regular !== undefined) f('regular').checked = !!o.regular;
        if ((o.options && o.options.length) || o.regular){ var dm = el.querySelector('.rv-more'); if (dm) dm.open = true; }
        calc(); },
      reserve: function(){ phase = 'form'; paintForm(last || calc()); },
      calc: calc, state: function(){ return st; }, last: function(){ return last; }
    };
    M.pricing.estimator = api;
    calc();
    if (q0.reserve === '1') api.reserve();
    return api;
  }

  /* ---------- 견적서 (인쇄·PDF) ---------- */
  function sheet(){
    var s = document.getElementById('quote-print');
    if (!s){ s = document.createElement('section'); s.id = 'quote-print'; s.setAttribute('aria-hidden', 'true'); document.body.appendChild(s); }
    return s;
  }
  function renderQuoteSheet(r, pl){
    var C = M.CONFIG || {};
    var now = new Date(), stamp = now.getFullYear() + '.' + (now.getMonth() + 1) + '.' + now.getDate() + ' ' + ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    var no = 'MS-' + String(now.getFullYear()).slice(2) + ('0' + (now.getMonth() + 1)).slice(-2) + ('0' + now.getDate()).slice(-2) + '-' + ('0' + now.getHours()).slice(-2) + ('0' + now.getMinutes()).slice(-2);
    var rows = '';
    if (r.pkg) rows += '<tr><td>공간료 · ' + esc(r.pkg.label) + (r.peak ? ' (' + esc(r.peak.seasonLabel) + ')' : '') + '</td><td>' + esc(r.pkg.time) + ' · ' + r.pkg.hours + '시간' + (r.pkg.pct ? ' (시간 요금 ' + esc(won(r.pkg.regular)) + ' → ' + r.pkg.pct + '% 할인)' : '') + '</td><td>' + esc(won(r.pkg.price)) + '</td></tr>';
    else {
      r.time.lines.forEach(function(l){ rows += '<tr><td>공간료 · ' + esc(l.label) + '</td><td>' + esc(E.hourLabel(l.from)) + '–' + esc(E.hourLabel(l.to)) + ' · ' + l.hours + '시간 × ' + esc(won(l.rate)) + '</td><td>' + esc(won(l.sum)) + '</td></tr>'; });
      if (r.surcharge) rows += r.peak ? '<tr><td>성수기 포함 인원 가산</td><td>' + esc(r.peak.label) + ' · 기준 ' + r.peopleBase + '명 · 1건당</td><td>' + esc(won(r.surcharge)) + '</td></tr>'
        : '<tr><td>' + esc((D.surcharge && D.surcharge.label) || '기본 인원 가산액') + '</td><td>기준 ' + r.peopleBase + '명 포함 · 시간제 1건당</td><td>' + esc(won(r.surcharge)) + '</td></tr>';
    }
    rows += '<tr><td>인원</td><td>' + r.people + '명 (기준 ' + r.peopleBase + '명 포함' + (r.peopleExtra ? ' · 추가 ' + r.peopleExtra + '명 × ' + esc(won(D.people.extra)) : '') + ')</td><td>' + esc(won(r.peopleFee)) + '</td></tr>';
    r.options.forEach(function(o){ rows += '<tr><td>' + esc(o.label) + '</td><td>' + esc(o.qty) + ' · ' + esc(won(o.unitPrice)) + ' / ' + esc(o.unit) + '</td><td>' + esc(won(o.amount)) + '</td></tr>'; });
    var notes = r.warnings.concat(r.notes).map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('');
    var refund = D.refund.map(function(x){ return '<span>' + esc(x.k) + ' <b>' + Math.round(x.rate * 100) + '%</b></span>'; }).join('');
    sheet().innerHTML = '<div class="qp">'
      + '<header class="qp-head"><div><div class="qp-logo">MEGA<b>SPOT</b></div><div class="qp-sub">' + esc(NAME) + ' · ' + esc(ADDR) + '</div></div><div class="qp-meta"><b>예상 금액 안내</b><span>문서번호 ' + no + '</span><span>작성 ' + esc(stamp) + '</span><span>' + esc(D.version) + '</span></div></header>'
      + '<div class="qp-title" role="heading" aria-level="2">' + esc(NAME) + ' 이용 예상 금액</div>'
      + '<table class="qp-cond"><tbody>'
      + '<tr><th>이용일</th><td>' + esc(E.kdateY(r.date)) + (r.day.holiday ? ' · ' + esc(r.day.holiday) : '') + ' <span class="qp-tag">' + esc(r.colLabel) + ' 요금</span></td><th>이용 시간</th><td>' + esc(r.range) + '</td></tr>'
      + '<tr><th>인원</th><td>' + r.people + '명</td><th>모임 유형</th><td>' + esc(pl || '미정') + (r.regular ? ' · 정기 이용(4회 이상) 예정' : '') + '</td></tr>'
      + '</tbody></table>'
      + '<table class="qp-lines"><thead><tr><th>항목</th><th>내용</th><th>금액</th></tr></thead><tbody>' + rows + '</tbody>'
      + '<tfoot><tr><th colspan="2">합계 <small>' + esc(D.vatNote) + '</small></th><th>' + esc(won(r.total)) + '</th></tr><tr><td colspan="2">' + esc(D.deposit.label) + ' (별도 · 이용 뒤 확인 후 반환)</td><td>' + esc(won(r.deposit)) + '</td></tr></tfoot></table>'
      + (notes ? '<ul class="qp-notes">' + notes + '</ul>' : '')
      + '<div class="qp-grid">'
      + '<div><h3>기본 제공 (무료)</h3><p>' + D.included.map(function(i){ return esc(i.label); }).join(' · ') + '</p><h3>환불 기준</h3><p class="qp-refund">' + refund + '</p><p class="qp-small">' + esc(D.refundNote) + ' ' + esc(D.corporate) + '</p></div>'
      + '<div class="qp-contact"><h3>문의</h3><p>전화 ' + esc(C.phone || '') + '<br>이메일 ' + esc(C.email || '') + '<br>카카오톡 ' + esc(String(KAKAO).replace(/^https?:\/\//, '')) + '<br>홈페이지 megaspot.kr</p>' + (KAKAO ? '<img src="/assets/img/brand/kakao-qr.svg" alt="카카오톡 문의 채널 QR코드" width="88" height="88">' : '') + '<p class="qp-small">' + esc(C.kakaoNote || '') + '</p></div>'
      + '</div>'
      + '<footer class="qp-foot">이 문서는 공개 요금표로 계산한 예상 금액이며 정식 견적서가 아닙니다. 날짜·시간·인원·모임 유형을 알려 주시면 가능 여부와 확정 금액을 빠르게 안내드립니다. 성수기(' + esc(peakRangeText()) + ')는 성수기 요금표로 계산했습니다. 조찬 모임·정기 모임·제휴 모임과 팝업·전시·행사·촬영은 따로 연락 주시면 추가 협찬과 할인을 안내해 드립니다.</footer>'
      + '</div>';
  }
  function printQuote(r){
    renderQuoteSheet(r, purLabel(r.purpose));
    var old = document.title;
    document.title = (D.fileTag || '메가스팟건대') + '_예상금액_' + r.date.replace(/-/g, '');
    var restore = function(){ document.title = old; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    setTimeout(function(){ window.print(); setTimeout(restore, 1500); }, 50);
  }

  return { E: E, D: D, R: R, renderEstimator: renderEstimator, printQuote: printQuote, renderQuoteSheet: renderQuoteSheet, page: PAGE, space: SPACE_ID, name: NAME };
  }

  /* ---------- 공간별 화면 묶음 ---------- */
  var UIS = {};
  function uiFor(id){
    id = id || DEFAULT_SPACE;
    if (!UIS[id]){ var E = E0.forSpace ? E0.forSpace(id) : E0; if (!E.data()) return null; UIS[id] = buildUI(E); }
    return UIS[id];
  }
  // 자리(el)가 어느 공간의 요금을 보여 줄지: data-space → 감싸는 요소의 data-space → body data-space → 1호
  function spaceOf(el){
    if (el && el.dataset && el.dataset.space) return el.dataset.space;
    if (el && el.hasAttribute && el.hasAttribute('data-space-query')){ try { var qs = new URLSearchParams(location.search).get('space'); if (qs && (window.MEGASPOT_PRICING || {})[qs]) return qs; } catch (_) {} }
    var wrap = el && el.closest ? el.closest('[data-space]') : null;
    if (wrap && wrap.dataset.space) return wrap.dataset.space;
    return (document.body && document.body.dataset.space) || DEFAULT_SPACE;
  }

  /* ---------- 초기화 ---------- */
  function init(root){
    $$('[data-price]', root || document).forEach(function(el){
      var key = el.dataset.price; if (el.dataset.ready) return; el.dataset.ready = '1';
      var ui = uiFor(spaceOf(el)); if (!ui){ el.hidden = true; return; }
      if (key === 'estimator'){ ui.renderEstimator(el, { onAsk: null }); return; }
      if (ui.R[key]) ui.R[key](el, el.dataset.opt);
    });
  }
  // 자리의 공간을 바꿔 다시 그립니다 (예약 신청 화면의 1호·2호 선택). 자리를 새 요소로 바꿔 이전 공간의 이벤트 처리기를 떼어 내므로, 돌려주는 요소를 다시 잡아 써야 합니다.
  function rerender(el, spaceId){
    if (!el || !el.parentNode) return null;
    var fresh = el.cloneNode(false); fresh.innerHTML = ''; fresh.dataset.space = spaceId; delete fresh.dataset.ready;
    el.parentNode.replaceChild(fresh, el); init(fresh.parentNode || document); return fresh;
  }
  var main = uiFor(DEFAULT_SPACE);
  M.pricing = M.pricing || {};
  M.pricing.init = init; M.pricing.rerender = rerender; M.pricing.forSpace = uiFor; M.pricing.spaceOf = spaceOf;
  if (main){ M.pricing.renderEstimator = main.renderEstimator; M.pricing.renderers = main.R; M.pricing.page = main.page; M.pricing.printQuote = main.printQuote; }
  init(document);
})();
