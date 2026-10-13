/* =====================================================================
   메가스팟 건대 · 요금 화면 (요금표 v2.0)
   - HTML에 <div data-price="rate-table"></div>처럼 자리만 두면 이 파일이 내용을 채웁니다.
   - 쓸 수 있는 자리: version, facts, rate-table, day-rule, packages(data-opt="compact"), people-rule,
     options, included, deposit, refund-table, special, examples, estimator
   - 예상 금액 계산기: 날짜 → 시간(패키지/직접) → 인원·모임 → 옵션 → 금액. 견적서 PDF 저장(인쇄), 문의서 연결, 카카오톡 전송.
   ===================================================================== */
(function(){
  'use strict';
  var M = window.MEGASPOT, E = window.MEGASPOT_PRICE;
  if (!M || !E || !E.data()) return;
  var esc = M.esc, $ = M.$, $$ = M.$$;
  var D = E.data(), won = E.won, man = E.man;
  var PUR = window.MEGASPOT_PURPOSES || [];
  var PAGE = '/spaces/megaspot-gundae/pricing/';
  var KAKAO = (M.CONFIG && M.CONFIG.kakaoChannel) || '';

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
      ['<small>낮 7시간</small>' + esc(man(minPkg)), '낮 패키지(10–17시) 월–금 · 시간 요금보다 21% 이상 저렴'],
      ['<small>기준</small>20명<small>포함</small>', '21명째부터 1명당 ' + esc(man(D.people.extra)) + ' · 최대 ' + D.people.max + '명'],
      ['<small>보증금</small>' + esc(man(D.deposit.amount)), '이용료와 따로 받고, 이용 뒤 확인 후 돌려 드립니다']
    ].map(function(f){ return '<div><b>' + f[0] + '</b><span>' + f[1] + '</span></div>'; }).join('');
    el.classList.add('facts-4');
  };

  /* ---------- 시간당 요금표 ---------- */
  R['rate-table'] = function(el){
    var head = '<tr><th class="corner">시간당 요금<br><small>단위 원</small></th>' + D.cols.map(function(c){ return '<th data-col="' + c.id + '">' + esc(c.label) + '</th>'; }).join('') + '</tr>';
    var body = D.bands.map(function(b){
      return '<tr><th scope="row"><b>' + esc(b.label) + '</b><small>' + esc(b.time) + '</small></th>' + D.cols.map(function(c){
        var v = D.hourly[c.id][b.id];
        return '<td class="rc" data-band="' + b.id + '" data-col="' + c.id + '">' + mn(v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    el.innerHTML = '<div class="rate-wrap"><table class="rate-table v2"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
      + '<div class="rate-legend"><span><span class="lg-hl"></span>계산기에서 고른 시간대</span><span>심야(24–07시)는 이용일 요일 기준으로 계산합니다.</span><span>공휴일은 아래 요일 구분 규칙을 따릅니다.</span></div>';
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
        + '<button type="button" class="btn btn-light btn-sm pkg-use" data-pkg="' + p.id + '">이 패키지로 계산하기</button></article>';
    }).join('') + '</div>'
      + '<p class="tiny muted mt-2">패키지 금액은 기준 인원 20명의 공간료입니다. 인원 추가와 옵션은 따로 더해집니다. 계산기에서 같은 시간을 고르면 자동으로 패키지 할인가가 적용됩니다.</p>';
    el.addEventListener('click', function(e){ var b = e.target.closest('.pkg-use'); if (!b) return; if (M.pricing.estimator){ M.pricing.estimator.setPackage(b.dataset.pkg); var est = document.querySelector('[data-price=estimator]'); if (est) est.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else { location.href = PAGE + '?pkg=' + b.dataset.pkg + '#estimate'; } });
  };

  /* ---------- 인원 ---------- */
  R['people-rule'] = function(el){
    var ex = [30, 50, 100, 150, 200].map(function(n){ return '<span class="tag">' + n + '명 <b style="margin-left:6px;color:var(--cobalt)">+' + esc(man((n - D.people.base) * D.people.extra)) + '</b></span>'; }).join('');
    el.innerHTML = '<div class="card pad-s"><div class="row between" style="align-items:flex-start;gap:12px"><div><b style="font-size:17px">기준 인원 ' + D.people.base + '명 포함</b><p class="small muted mt-1">' + esc(D.people.note) + '</p></div><span class="badge badge-cobalt">1명당 ' + esc(man(D.people.extra)) + '</span></div><div class="tags mt-2">' + ex + '</div></div>';
  };

  /* ---------- 옵션 ---------- */
  R.options = function(el){
    var rows = D.options.map(function(o){ return [esc(o.label), '<b>' + esc(won(o.price)) + '</b> <span class="muted">/ ' + esc(o.unit) + '</span>', esc(o.desc)]; });
    var ask = D.askOptions.map(function(o){ return [esc(o.label), '<span class="badge badge-soft">상담 시 안내</span>', esc(o.desc)]; });
    el.innerHTML = tbl(['옵션', '금액', '내용'], rows.concat(ask))
      + '<p class="tiny muted mt-2">옵션은 필요한 것만 고르시면 됩니다. 금액이 적힌 항목은 계산기에서 바로 더해 볼 수 있고, \'상담 시 안내\' 항목은 행사 내용을 듣고 금액을 정합니다.</p>';
  };
  R.included = function(el){
    el.innerHTML = '<div class="inc-grid">' + D.included.map(function(i){ return '<div class="inc' + (i.big ? ' big' : '') + '"><span class="inc-check" aria-hidden="true">✓</span>' + esc(i.label) + (i.big ? '<small>초대형 화면 · 무료</small>' : '') + '</div>'; }).join('') + '</div><p class="tiny muted mt-2">' + esc(D.includedNote) + '</p>';
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
    el.innerHTML = '<div class="grid grid-3">' + D.special.map(function(s){ return '<div class="card pad-s"><div class="eyebrow">' + (s.id === 'peak' ? 'Season' : 'Discount') + '</div><h4 class="mt-1" style="font-size:17px">' + esc(s.k) + '</h4><p class="small muted mt-1">' + esc(s.d) + '</p></div>'; }).join('') + '</div>';
  };

  /* ---------- 견적 예시 ---------- */
  R.examples = function(el){
    var ex = [
      { t: '평일 세미나 50명', d: '2026-11-05', s: 10, e: 17, p: 50, pu: 'seminar' },
      { t: '금요일 저녁 네트워킹 60명', d: '2026-11-06', s: 19, e: 23, p: 60, pu: 'networking' },
      { t: '토요일 하루 종일 동문회 100명', d: '2026-11-07', s: 10, e: 24, p: 100, pu: 'party', o: { cleaning: true } },
      { t: '평일 저녁 정기 모임 30명', d: '2026-11-03', s: 19, e: 22, p: 30, pu: 'community', regular: true },
      { t: '일요일 낮 원데이 클래스 25명', d: '2026-11-08', s: 13, e: 16, p: 25, pu: 'class' },
      { t: '금요일 밤샘 MT 40명', d: '2026-11-13', s: 18, e: 31, p: 40, pu: 'party', o: { disposable: true } }
    ].map(function(x){
      var q = E.quote({ date: x.d, start: x.s, end: x.e, people: x.p, purpose: x.pu, options: x.o, regular: x.regular });
      var parts = [q.pkg ? q.pkg.label + ' ' + man(q.pkg.price) : '공간료 ' + man(q.time.fee)];
      if (q.peopleFee) parts.push('인원 추가 ' + man(q.peopleFee)); q.options.forEach(function(o){ parts.push(o.label + ' ' + man(o.amount)); });
      return '<button type="button" class="ex-card" data-d="' + x.d + '" data-s="' + x.s + '" data-e="' + x.e + '" data-p="' + x.p + '" data-pu="' + x.pu + '"><div class="eyebrow">' + esc(E.kdate(x.d)) + ' · ' + esc(q.colLabel) + ' 요금</div><b>' + esc(x.t) + '</b><span class="ex-when">' + esc(q.range) + '</span><ul>' + parts.map(function(p){ return '<li>' + esc(p) + '</li>'; }).join('') + '</ul><div class="ex-total">' + esc(man(q.total)) + '<small>' + (x.regular ? ' 1회 기준 · 정기 할인 별도' : '') + '</small></div><span class="go">이 조건으로 계산기 열기 →</span></button>';
    }).join('');
    el.innerHTML = '<div class="ex-grid">' + ex + '</div><p class="tiny muted mt-2">요금표 v2.0으로 계산한 예시입니다. 옵션과 인원을 바꾸면 금액이 달라지니 계산기에서 조건을 직접 넣어 보세요.</p>';
    el.addEventListener('click', function(e){ var b = e.target.closest('.ex-card'); if (!b) return; var est = M.pricing.estimator; if (est){ est.set({ date: b.dataset.d, start: +b.dataset.s, end: +b.dataset.e, people: +b.dataset.p, purpose: b.dataset.pu }); var box = document.querySelector('[data-price=estimator]'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  };

  /* =====================================================================
     예상 금액 계산기
     ===================================================================== */
  function defaultDate(){ var d = E.addDays(E.todayIso(), 14); return d; }
  function hourOpts(from, to, val){ var o = ''; for (var h = from; h <= to; h++) o += '<option value="' + h + '"' + (h === val ? ' selected' : '') + '>' + esc(E.hourLabel(h)) + '</option>'; return o; }
  function purLabel(id){ var p = PUR.filter(function(x){ return x.id === id; })[0]; return p ? p.label : (id === 'other' ? '기타' : ''); }

  function renderEstimator(el, cfg){
    cfg = cfg || {};
    var st = { date: cfg.date || defaultDate(), start: 13, end: 17, people: 30, purpose: cfg.purpose || '', regular: false,
               opt: { manager: false, managerCount: 1, managerHours: 0, cleaning: false, disposable: false, banner: false, xbanner: false } };
    try { var q = new URLSearchParams(location.search); if (q.get('pkg')){ var pk = E.findPkg(q.get('pkg')); if (pk){ st.start = pk.start; st.end = pk.end; } } } catch (_) {}

    el.innerHTML = ''
      + '<div class="est v2"><div class="est-form">'
      + '<div class="est-body">'
      // 1 날짜
      + '<section class="est-step"><h4><span>1</span>날짜 <em>요일 구분이 자동으로 정해집니다</em></h4>'
      + '<div class="est-row"><div class="f"><label for="est-date">이용일</label><input class="input" type="date" id="est-date" name="date" value="' + esc(st.date) + '" min="' + E.todayIso() + '"></div><div class="est-daytag" data-out="daytag"></div></div></section>'
      // 2 시간
      + '<section class="est-step"><h4><span>2</span>시간 <em>패키지를 고르거나 직접 정하세요</em></h4>'
      + '<div class="slot-pick" data-out="pkgs">' + D.packages.map(function(p){ return '<button type="button" class="slot-btn" data-pkg="' + p.id + '"><b>' + esc(p.label) + '</b><span>' + esc(p.time) + ' · ' + p.hours + '시간</span><em data-out="pkg-' + p.id + '"></em></button>'; }).join('') + '</div>'
      + '<div class="est-row mt-2"><div class="f"><label for="est-start">시작</label><select class="select" id="est-start" name="start">' + hourOpts(D.openFrom, D.openTo - 1, st.start) + '</select></div><div class="f"><label for="est-end">종료</label><select class="select" id="est-end" name="end">' + hourOpts(D.openFrom + 1, D.openTo, st.end) + '</select></div><div class="f" style="flex:1 1 160px"><span class="lbl">이용 시간</span><div class="est-hours" data-out="hours"></div></div></div>'
      + '<p class="hint mt-1">준비와 정리 시간까지 넣어서 잡아 주세요. 자정을 넘기는 시간은 이용일 기준 심야 요금으로 계산합니다.</p></section>'
      // 3 인원·모임
      + '<section class="est-step"><h4><span>3</span>인원과 모임 <em>기준 20명 · 최대 ' + D.people.max + '명</em></h4>'
      + '<div class="est-row"><div class="f"><label for="est-people">인원</label><input class="input" type="number" inputmode="numeric" id="est-people" name="people" min="1" max="' + D.people.max + '" value="' + st.people + '"></div>'
      + '<div class="f" style="flex:2 1 220px"><span class="lbl">빠른 선택</span><div class="pick" data-out="people-pick">' + [20, 30, 50, 100, 150, 200].map(function(n){ return '<button type="button" data-n="' + n + '">' + n + '명</button>'; }).join('') + '</div></div></div>'
      + '<div class="est-row mt-2"><div class="f" style="flex:1 1 240px"><label for="est-purpose">모임 유형</label><select class="select" id="est-purpose" name="purpose"><option value="">선택 (안 하셔도 됩니다)</option>' + PUR.map(function(p){ return '<option value="' + p.id + '"' + (st.purpose === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') + '<option value="other">기타</option></select></div>'
      + '<label class="chk" style="align-self:flex-end"><input type="checkbox" name="regular"> 4회 이상 정기 이용 예정 <span class="chk-hint">별도 할인 안내</span></label></div></section>'
      // 4 옵션
      + '<section class="est-step"><h4><span>4</span>옵션 <em>필요한 것만 고르세요</em></h4>'
      + '<div class="checks">'
      + '<label class="chk"><input type="checkbox" name="manager"> 현장 매니저 <span class="chk-hint">1인 1시간 ' + esc(man(25000)) + '</span></label>'
      + '<label class="chk"><input type="checkbox" name="cleaning"> 뒷정리·청소 지원 <span class="chk-hint">' + esc(man(200000)) + '</span></label>'
      + '<label class="chk"><input type="checkbox" name="disposable"> 1회용 세트 <span class="chk-hint">1인당 ' + esc(man(5000)) + '</span></label>'
      + '<label class="chk"><input type="checkbox" name="banner"> 현수막 제작 <span class="chk-hint">' + esc(man(120000)) + '</span></label>'
      + '<label class="chk"><input type="checkbox" name="xbanner"> X배너 제작 <span class="chk-hint">' + esc(man(70000)) + '</span></label>'
      + '</div>'
      + '<div class="est-row mt-2" data-out="manager-row" hidden><div class="f inline"><label for="est-mcount">매니저</label><input class="input" type="number" id="est-mcount" name="managerCount" min="1" max="10" value="1"><span class="small">명</span></div><div class="f inline"><label for="est-mhours">시간</label><input class="input" type="number" id="est-mhours" name="managerHours" min="1" max="24" value="" placeholder="이용 시간"><span class="small">시간 <span class="tiny muted">(비우면 이용 시간과 같게)</span></span></div></div>'
      + '<div class="tags mt-2">' + D.askOptions.map(function(o){ return '<span class="tag" title="' + esc(o.desc) + '">' + esc(o.label) + ' · 상담 시 안내</span>'; }).join('') + '</div>'
      + '</section>'
      + '</div></div>'
      // 결과
      + '<div class="est-result" data-out="result"></div>'
      + '<div class="est-mini" data-out="mini" hidden><span>예상 금액<small data-out="minisub"></small></span><b data-out="minitotal"></b><button type="button" class="btn btn-primary btn-sm" data-act="show">자세히</button></div>'
      + '</div>';

    var f = function(n){ return el.querySelector('[name=' + n + ']'); };
    var out = function(n){ return el.querySelector('[data-out="' + n + '"]'); };
    var last = null;

    function read(){
      st.date = f('date').value || E.todayIso();
      st.start = +f('start').value; st.end = +f('end').value;
      if (st.end <= st.start){ st.end = Math.min(st.start + 1, D.openTo); f('end').value = st.end; }
      st.people = E.clampInt(f('people').value, 1, D.people.max, 20);
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
    function paint(r){
      // 날짜 태그
      var d = r.day;
      out('daytag').innerHTML = '<span class="badge badge-cobalt">' + esc(E.kdate(r.date)) + '</span><span class="badge badge-soft">' + esc(r.colLabel) + ' 요금 적용</span>' + (d.holiday ? '<span class="badge badge-rust">' + esc(d.holiday) + '</span>' : '') + (d.peak ? '<span class="badge badge-warn">12월·1월 성수기</span>' : '') + (d.why ? '<span class="tiny muted" style="flex-basis:100%">' + esc(d.why) + '</span>' : '');
      // 패키지 버튼
      $$('.slot-btn', out('pkgs')).forEach(function(b){ var p = E.findPkg(b.dataset.pkg); var on = r.pkg && r.pkg.id === p.id; b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', String(!!on)); var em = out('pkg-' + p.id); if (em) em.textContent = man(p.price[r.col]); });
      out('hours').innerHTML = '<b>' + r.hours + '시간</b> <span class="muted small">' + esc(E.hourLabel(r.start)) + ' – ' + esc(E.hourLabel(r.end)) + '</span>' + (r.pkg ? ' <span class="badge badge-ok">' + esc(r.pkg.label) + ' 할인 적용</span>' : '');
      $$('button', out('people-pick')).forEach(function(b){ b.classList.toggle('on', +b.dataset.n === r.people); });
      out('manager-row').hidden = !st.opt.manager;
      // 요금표 하이라이트
      $$('.rate-table td.rc').forEach(function(td){ td.classList.remove('hl'); });
      var bands = {}; r.time.lines.forEach(function(l){ bands[l.band] = true; });
      Object.keys(bands).forEach(function(b){ $$('.rate-table td.rc[data-band="' + b + '"][data-col="' + r.col + '"]').forEach(function(td){ td.classList.add('hl'); }); });
      // 결과 카드
      var lines = '';
      if (r.pkg) lines += '<tr class="pkg"><td><span class="ln">' + esc(r.pkg.label) + ' 공간료</span><span class="nt">' + esc(r.pkg.time) + ' · ' + r.pkg.hours + '시간 · 시간 요금 ' + esc(won(r.pkg.regular)) + '에서 ' + r.pkg.pct + '% 할인</span></td><td class="pr">' + esc(won(r.pkg.price)) + '</td></tr>';
      else r.time.lines.forEach(function(l){ lines += '<tr><td><span class="ln">공간료 · ' + esc(l.label) + '</span><span class="nt">' + esc(E.hourLabel(l.from)) + '–' + esc(E.hourLabel(l.to)) + ' · ' + l.hours + '시간 × ' + esc(won(l.rate)) + '</span></td><td class="pr">' + esc(won(l.sum)) + '</td></tr>'; });
      lines += '<tr><td><span class="ln">인원 ' + r.people + '명</span><span class="nt">' + (r.peopleExtra ? '기준 ' + D.people.base + '명 포함 · 추가 ' + r.peopleExtra + '명 × ' + esc(won(D.people.extra)) : '기준 ' + D.people.base + '명 안이라 추가 요금 없음') + '</span></td><td class="pr">' + (r.peopleFee ? esc(won(r.peopleFee)) : '0원') + '</td></tr>';
      r.options.forEach(function(o){ lines += '<tr class="adj"><td><span class="ln">' + esc(o.label) + '</span><span class="nt">' + esc(o.qty) + ' · ' + esc(won(o.unitPrice)) + ' / ' + esc(o.unit) + '</span></td><td class="pr">' + esc(won(o.amount)) + '</td></tr>'; });
      var notes = r.warnings.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('');
      var tips = r.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('');
      var pl = purLabel(r.purpose);
      out('result').innerHTML = '<div class="est-card">'
        + '<div class="row between"><div class="eyebrow">Estimate</div><span class="tiny muted">' + esc(D.version) + '</span></div>'
        + '<h3 class="est-title">예상 금액</h3>'
        + '<p class="small muted">' + esc(E.kdateY(r.date)) + ' · ' + esc(r.colLabel) + ' 요금 · ' + esc(r.range) + ' · ' + r.people + '명' + (pl ? ' · ' + esc(pl) : '') + '</p>'
        + '<table class="est-lines"><tbody>' + lines + '</tbody></table>'
        + '<div class="est-total"><span>합계<small>' + esc(D.vatNote) + '</small></span><b>' + esc(man(r.total)) + '</b></div>'
        + '<p class="est-sub"><span>총액 ' + esc(won(r.total)) + '</span><span>' + esc(D.deposit.label) + ' ' + esc(won(r.deposit)) + ' 별도 · 이용 뒤 반환</span></p>'
        + (notes ? '<ul class="est-warn">' + notes + '</ul>' : '') + (tips ? '<ul class="est-notes">' + tips + '</ul>' : '')
        + '<div class="est-actions">'
        + '<button type="button" class="btn btn-primary" data-act="ask">이 조건으로 견적 문의 <span class="arrow">→</span></button>'
        + '<button type="button" class="btn btn-dark" data-act="pdf">견적서 PDF 저장·인쇄</button>'
        + (KAKAO ? '<a class="btn btn-kakao" data-act="kakao" href="' + esc(KAKAO) + '" target="_blank" rel="noopener">카카오톡으로 보내기</a>' : '')
        + '<button type="button" class="btn btn-light" data-act="copy">내용 복사</button>'
        + '</div>'
        + '<p class="tiny muted mt-2">요금표 기준으로 계산한 예상 금액이며 정식 견적서가 아닙니다. 날짜·시간·인원·모임 유형만 알려 주시면 확정 금액과 가능 여부를 빠르게 안내드립니다.</p>'
        + '</div>';
      var mini = out('mini'); mini.hidden = false; out('minitotal').textContent = man(r.total); out('minisub').textContent = E.kdate(r.date) + ' · ' + r.hours + '시간 · ' + r.people + '명';
      renderQuoteSheet(r, pl);
    }

    // ---------- 입력 이벤트 ----------
    el.addEventListener('change', function(){ calc(); });
    el.addEventListener('input', function(e){ if (e.target.name === 'people' || e.target.name === 'managerCount' || e.target.name === 'managerHours') calc(); });
    out('pkgs').addEventListener('click', function(e){ var b = e.target.closest('.slot-btn'); if (!b) return; var p = E.findPkg(b.dataset.pkg); f('start').value = p.start; f('end').value = p.end; calc(); });
    out('people-pick').addEventListener('click', function(e){ var b = e.target.closest('button'); if (!b) return; f('people').value = b.dataset.n; calc(); });
    el.addEventListener('click', function(e){
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.dataset.act;
      if (act === 'show'){ out('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (!last) calc();
      var text = E.summaryText(last, purLabel(last.purpose));
      if (act === 'copy'){ copyText(text, '예상 금액 내용을 복사했습니다.'); }
      if (act === 'kakao'){ copyText(text, '내용을 복사했습니다. 카카오톡 채팅창에 붙여 넣어 보내 주세요.'); }
      if (act === 'pdf'){ printQuote(last); }
      if (act === 'ask'){
        var p = { date: last.date, slot: 'custom', t_start: E.hourLabel(last.start), t_end: E.hourLabel(last.end), people: String(last.people), purpose: last.purpose, estimate: text, type: last.regular ? 'regular' : 'event' };
        var onAsk = cfg.onAsk || (M.pricing && M.pricing.onAsk);
        if (onAsk){ onAsk(p, api); return; }
        try { sessionStorage.setItem('ms_estimate', text); } catch (_) {}
        var q = new URLSearchParams({ est: '1', date: p.date, slot: 'custom', t_start: p.t_start, t_end: p.t_end, people: p.people });
        if (p.purpose) q.set('purpose', p.purpose); if (p.type !== 'event') q.set('type', p.type);
        location.href = '/inquiry/?' + q.toString();
      }
    });
    function copyText(text, msg){ (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function(){ M.toast(msg); }).catch(function(){ window.prompt('아래 내용을 복사해 주세요.', text); }); }

    var api = {
      setDate: function(iso){ if (!iso) return; f('date').value = iso; calc(); },
      setPackage: function(id){ var p = E.findPkg(id); if (!p) return; f('start').value = p.start; f('end').value = p.end; calc(); },
      setRange: function(s, e){ f('start').value = s; f('end').value = e; calc(); },
      set: function(o){ o = o || {}; if (o.date) f('date').value = o.date; if (o.start) f('start').value = o.start; if (o.end) f('end').value = o.end; if (o.people) f('people').value = o.people; if (o.purpose !== undefined) f('purpose').value = o.purpose; calc(); },
      calc: calc, state: function(){ return st; }, last: function(){ return last; }
    };
    M.pricing.estimator = api;
    calc();
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
    if (r.pkg) rows += '<tr><td>공간료 · ' + esc(r.pkg.label) + '</td><td>' + esc(r.pkg.time) + ' · ' + r.pkg.hours + '시간 (시간 요금 ' + esc(won(r.pkg.regular)) + ' → ' + r.pkg.pct + '% 할인)</td><td>' + esc(won(r.pkg.price)) + '</td></tr>';
    else r.time.lines.forEach(function(l){ rows += '<tr><td>공간료 · ' + esc(l.label) + '</td><td>' + esc(E.hourLabel(l.from)) + '–' + esc(E.hourLabel(l.to)) + ' · ' + l.hours + '시간 × ' + esc(won(l.rate)) + '</td><td>' + esc(won(l.sum)) + '</td></tr>'; });
    rows += '<tr><td>인원</td><td>' + r.people + '명 (기준 ' + D.people.base + '명 포함' + (r.peopleExtra ? ' · 추가 ' + r.peopleExtra + '명 × ' + esc(won(D.people.extra)) : '') + ')</td><td>' + esc(won(r.peopleFee)) + '</td></tr>';
    r.options.forEach(function(o){ rows += '<tr><td>' + esc(o.label) + '</td><td>' + esc(o.qty) + ' · ' + esc(won(o.unitPrice)) + ' / ' + esc(o.unit) + '</td><td>' + esc(won(o.amount)) + '</td></tr>'; });
    var notes = r.warnings.concat(r.notes).map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('');
    var refund = D.refund.map(function(x){ return '<span>' + esc(x.k) + ' <b>' + Math.round(x.rate * 100) + '%</b></span>'; }).join('');
    sheet().innerHTML = '<div class="qp">'
      + '<header class="qp-head"><div><div class="qp-logo">MEGA<b>SPOT</b></div><div class="qp-sub">메가스팟 건대 · 서울 광진구 화양동 10-1 한아름건물 2층</div></div><div class="qp-meta"><b>예상 금액 안내</b><span>문서번호 ' + no + '</span><span>작성 ' + esc(stamp) + '</span><span>' + esc(D.version) + '</span></div></header>'
      + '<h1 class="qp-title">메가스팟 건대 이용 예상 금액</h1>'
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
      + '<footer class="qp-foot">이 문서는 공개 요금표로 계산한 예상 금액이며 정식 견적서가 아닙니다. 날짜·시간·인원·모임 유형을 알려 주시면 가능 여부와 확정 금액을 빠르게 안내드립니다. 성수기(12월·1월), 정기 이용, 팝업·전시·행사·촬영은 별도 기준으로 안내합니다.</footer>'
      + '</div>';
  }
  function printQuote(r){
    renderQuoteSheet(r, purLabel(r.purpose));
    var old = document.title;
    document.title = '메가스팟건대_예상금액_' + r.date.replace(/-/g, '');
    var restore = function(){ document.title = old; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    setTimeout(function(){ window.print(); setTimeout(restore, 1500); }, 50);
  }

  /* ---------- 초기화 ---------- */
  function init(root){
    $$('[data-price]', root || document).forEach(function(el){
      var key = el.dataset.price; if (el.dataset.ready) return; el.dataset.ready = '1';
      if (key === 'estimator'){ renderEstimator(el, { onAsk: null }); return; }
      if (R[key]) R[key](el, el.dataset.opt);
    });
  }
  M.pricing = M.pricing || {};
  M.pricing.init = init; M.pricing.renderEstimator = renderEstimator; M.pricing.renderers = R; M.pricing.page = PAGE; M.pricing.printQuote = printQuote;
  init(document);
})();
