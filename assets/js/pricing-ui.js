/* =====================================================================
   메가스팟 건대 · 요금 화면 (요금표 v2.0)
   - HTML에 <div data-price="rate-table"></div>처럼 자리만 두면 이 파일이 내용을 채웁니다.
   - 쓸 수 있는 자리: version, facts, rate-table, day-rule, packages(data-opt="compact"), people-rule,
     options, included, deposit, refund-table, special, examples, estimator
   - 예약 신청 · 금액 확인: 시간(패키지 버튼 포함) → 날짜 → 인원 → (선택) 옵션 → 금액 → 예약신청하기 → 이름·연락처 → 접수. 견적서 PDF 저장(인쇄), 카카오톡 전송.
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
        + '<button type="button" class="btn btn-light btn-sm pkg-use" data-pkg="' + p.id + '">이 패키지로 예약 신청</button></article>';
    }).join('') + '</div>'
      + '<p class="tiny muted mt-2">패키지 금액은 기준 인원 20명의 공간료입니다. 인원 추가와 옵션은 따로 더해집니다. 계산기에서 같은 시간을 고르면 자동으로 패키지 할인가가 적용됩니다.</p>';
    el.addEventListener('click', function(e){ var b = e.target.closest('.pkg-use'); if (!b) return; if (M.pricing.estimator){ M.pricing.estimator.setPackage(b.dataset.pkg); var est = document.querySelector('[data-price=estimator]'); if (est) est.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else { location.href = '/inquiry/?pkg=' + b.dataset.pkg; } });
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
      return '<button type="button" class="ex-card" data-d="' + x.d + '" data-s="' + x.s + '" data-e="' + x.e + '" data-p="' + x.p + '" data-pu="' + x.pu + '"><div class="eyebrow">' + esc(E.kdate(x.d)) + ' · ' + esc(q.colLabel) + ' 요금</div><b>' + esc(x.t) + '</b><span class="ex-when">' + esc(q.range) + '</span><ul>' + parts.map(function(p){ return '<li>' + esc(p) + '</li>'; }).join('') + '</ul><div class="ex-total">' + esc(man(q.total)) + '<small>' + (x.regular ? ' 1회 기준 · 정기 할인 별도' : '') + '</small></div><span class="go">이 조건으로 금액 확인 →</span></button>';
    }).join('');
    el.innerHTML = '<div class="ex-grid">' + ex + '</div><p class="tiny muted mt-2">요금표 v2.0으로 계산한 예시입니다. 옵션과 인원을 바꾸면 금액이 달라지니 계산기에서 조건을 직접 넣어 보세요.</p>';
    el.addEventListener('click', function(e){ var b = e.target.closest('.ex-card'); if (!b) return; var est = M.pricing.estimator; if (est){ est.set({ date: b.dataset.d, start: +b.dataset.s, end: +b.dataset.e, people: +b.dataset.p, purpose: b.dataset.pu }); var box = document.querySelector('[data-price=estimator]'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  };

  /* =====================================================================
     예약 신청 · 금액 확인 (계산기 + 예약 신청을 한 화면에)
     ① 시간(패키지 버튼 포함) → ② 이용일 → ③ 인원 → (선택) 옵션 → 금액 → 예약신청하기 → 이름·연락처 → 접수
     ===================================================================== */
  function defaultDate(){ return E.addDays(E.todayIso(), 14); }
  function hourOpts(from, to, val){ var o = ''; for (var h = from; h <= to; h++) o += '<option value="' + h + '"' + (h === val ? ' selected' : '') + '>' + esc(E.hourLabel(h)) + '</option>'; return o; }
  function purLabel(id){ var p = PUR.filter(function(x){ return x.id === id; })[0]; return p ? p.label : (id === 'other' ? '기타' : ''); }
  var PASS_ID = { day: { wd: 'pass-day-wdfri', fri: 'pass-day-wdfri', sat: 'pass-day-satsun', sun: 'pass-day-satsun' }, allday: { wd: 'pass-allday-wd', fri: 'pass-allday-fri', sat: 'pass-allday-sat', sun: 'pass-allday-sun' }, allnight: { wd: 'pass-allnight-wd', fri: 'pass-allnight-fri', sat: 'pass-allnight-sat', sun: 'pass-allnight-sun' } };

  function renderEstimator(el, cfg){
    cfg = cfg || {};
    var q0 = {}; try { q0 = Object.fromEntries(new URLSearchParams(location.search)); } catch (_) {}
    var st = { date: cfg.date || q0.date || defaultDate(), start: 13, end: 17, people: E.clampInt(q0.people, 1, D.people.max, 30), purpose: cfg.purpose || q0.purpose || '', regular: q0.type === 'regular',
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
      + '<div class="rv-pkg-head"><b>패키지도 가능합니다.</b> <span class="muted">시간을 묶으면 20% 이상 저렴합니다. 누르면 시간이 자동으로 들어갑니다.</span></div>'
      + '<div class="slot-pick" data-out="pkgs">' + D.packages.map(function(p){ return '<button type="button" class="slot-btn" data-pkg="' + p.id + '" aria-pressed="false"><b>' + esc(p.label) + '</b><span>' + esc(p.time) + ' · ' + p.hours + '시간</span><em data-out="pkg-' + p.id + '"></em></button>'; }).join('') + '</div>'
      + '<p class="hint mt-1">준비·정리 시간까지 넣어 잡아 주세요. 07시부터 다음 날 07시까지 1시간 단위입니다.</p></section>'
      // ② 날짜
      + '<section class="rv-step"><h4><span>2</span>이용일</h4>'
      + '<div class="est-row"><div class="f" style="flex:0 1 220px"><label for="' + pid + '-date" class="sr-only">이용일</label><input class="input" type="date" id="' + pid + '-date" name="date" value="' + esc(st.date) + '" min="' + E.todayIso() + '"></div><div class="est-daytag" data-out="daytag"></div></div></section>'
      // ③ 인원
      + '<section class="rv-step"><h4><span>3</span>인원 <em>기준 20명 포함 · 21명째부터 1명당 1만 원 · 최대 ' + D.people.max + '명</em></h4>'
      + '<div class="est-row"><div class="f" style="flex:0 1 140px"><label for="' + pid + '-people" class="sr-only">인원</label><input class="input" type="number" inputmode="numeric" id="' + pid + '-people" name="people" min="1" max="' + D.people.max + '" value="' + st.people + '"></div>'
      + '<div class="pick" data-out="people-pick">' + [20, 30, 50, 100, 150, 200].map(function(n){ return '<button type="button" data-n="' + n + '">' + n + '명</button>'; }).join('') + '</div></div></section>'
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
      + '<p class="tiny muted mt-2">' + esc(D.askOptions.map(function(o){ return o.label; }).join(' · ')) + '은 예약 신청 뒤 상담에서 안내합니다. 200인치 빔프로젝터·마이크·스피커·강단은 공간료에 들어 있습니다.</p>'
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
    if ('IntersectionObserver' in window){ new IntersectionObserver(function(en){ sideVisible = en[0].isIntersecting; var m = out('mini'); if (m) m.hidden = phase === 'done' || sideVisible; }, { threshold: 0.15 }).observe(el.querySelector('.rv-side')); }

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
    function lineRows(r){
      var lines = '';
      if (r.pkg) lines += '<tr class="pkg"><td><span class="ln">' + esc(r.pkg.label) + ' 공간료</span><span class="nt">' + esc(r.pkg.time) + ' · ' + r.pkg.hours + '시간 · 시간 요금 ' + esc(won(r.pkg.regular)) + '에서 ' + r.pkg.pct + '% 할인</span></td><td class="pr">' + esc(won(r.pkg.price)) + '</td></tr>';
      else r.time.lines.forEach(function(l){ lines += '<tr><td><span class="ln">공간료 · ' + esc(l.label) + '</span><span class="nt">' + esc(E.hourLabel(l.from)) + '–' + esc(E.hourLabel(l.to)) + ' · ' + l.hours + '시간 × ' + esc(won(l.rate)) + '</span></td><td class="pr">' + esc(won(l.sum)) + '</td></tr>'; });
      lines += '<tr><td><span class="ln">인원 ' + r.people + '명</span><span class="nt">' + (r.peopleExtra ? '기준 ' + D.people.base + '명 포함 · 추가 ' + r.peopleExtra + '명 × ' + esc(won(D.people.extra)) : '기준 ' + D.people.base + '명 안이라 추가 요금 없음') + '</span></td><td class="pr">' + (r.peopleFee ? esc(won(r.peopleFee)) : '0원') + '</td></tr>';
      r.options.forEach(function(o){ lines += '<tr class="adj"><td><span class="ln">' + esc(o.label) + '</span><span class="nt">' + esc(o.qty) + ' · ' + esc(won(o.unitPrice)) + ' / ' + esc(o.unit) + '</span></td><td class="pr">' + esc(won(o.amount)) + '</td></tr>'; });
      return lines;
    }
    function paint(r){
      var d = r.day;
      out('daytag').innerHTML = '<span class="badge badge-cobalt">' + esc(E.kdate(r.date)) + '</span><span class="badge badge-soft">' + esc(r.colLabel) + ' 요금</span>' + (d.holiday ? '<span class="badge badge-rust">' + esc(d.holiday) + '</span>' : '') + (d.peak ? '<span class="badge badge-warn">12월·1월 성수기</span>' : '') + (d.why ? '<span class="tiny muted" style="flex-basis:100%">' + esc(d.why) + '</span>' : '');
      $$('.slot-btn', out('pkgs')).forEach(function(b){ var p = E.findPkg(b.dataset.pkg); var on = r.pkg && r.pkg.id === p.id; b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', String(!!on)); var em = out('pkg-' + p.id); if (em) em.textContent = man(p.price[r.col]); });
      out('hours').innerHTML = '<b>' + r.hours + '시간</b><span>' + esc(E.hourLabel(r.start)) + ' – ' + esc(E.hourLabel(r.end)) + '</span>' + (r.pkg ? '<span class="badge badge-ok">' + esc(r.pkg.label) + ' 할인 적용</span>' : '');
      $$('button', out('people-pick')).forEach(function(b){ b.classList.toggle('on', +b.dataset.n === r.people); });
      out('manager-row').hidden = !st.opt.manager;
      $$('.rate-table td.rc').forEach(function(td){ td.classList.remove('hl'); });
      var bands = {}; r.time.lines.forEach(function(l){ bands[l.band] = true; });
      Object.keys(bands).forEach(function(b){ $$('.rate-table td.rc[data-band="' + b + '"][data-col="' + r.col + '"]').forEach(function(td){ td.classList.add('hl'); }); });
      if (phase === 'calc') paintResult(r);
      else if (phase === 'form') paintForm(r);
      var mini = out('mini'); mini.hidden = phase === 'done' || sideVisible; out('minitotal').textContent = man(r.total); out('minisub').textContent = E.kdate(r.date) + ' · ' + r.hours + '시간 · ' + r.people + '명';
      renderQuoteSheet(r, purLabel(r.purpose));
    }
    function headBlock(r){
      var pl = purLabel(r.purpose), notes = r.warnings.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join(''), tips = r.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('');
      return '<div class="row between"><div class="eyebrow">Estimate</div><span class="tiny muted">' + esc(D.version) + '</span></div>'
        + '<div class="rv-total"><span>예상 금액<small>' + esc(D.vatNote) + '</small></span><b>' + esc(man(r.total)) + '</b></div>'
        + '<p class="small muted">' + esc(E.kdateY(r.date)) + ' · ' + esc(r.colLabel) + ' 요금 · ' + esc(r.range) + ' · ' + r.people + '명' + (pl ? ' · ' + esc(pl) : '') + '</p>'
        + '<details class="rv-lines"><summary>금액 구성 보기 <span class="muted">총액 ' + esc(won(r.total)) + ' · ' + esc(D.deposit.label) + ' ' + esc(won(r.deposit)) + ' 별도</span></summary><table class="est-lines"><tbody>' + lineRows(r) + '</tbody></table>' + (notes ? '<ul class="est-warn">' + notes + '</ul>' : '') + (tips ? '<ul class="est-notes">' + tips + '</ul>' : '') + '</details>';
    }
    function paintResult(r){
      out('result').innerHTML = '<div class="est-card rv-card">' + headBlock(r)
        + '<button type="button" class="btn btn-primary btn-lg rv-go" data-act="reserve">예약신청하기 <span class="arrow">→</span></button>'
        + '<div class="rv-sub"><button type="button" class="btn btn-light btn-sm" data-act="pdf">견적서 PDF 저장</button>' + (KAKAO ? '<a class="btn btn-kakao btn-sm" data-act="kakao" href="' + esc(KAKAO) + '" target="_blank" rel="noopener">카카오톡으로 문의</a>' : '') + '</div>'
        + '<p class="tiny muted mt-2">예약 신청은 결제가 아닙니다. 담당자가 일정을 확인한 뒤 확정 금액과 결제 방법을 안내드리고, 결제가 끝나면 예약이 확정됩니다.</p>'
        + '</div>';
    }
    function paintForm(r){
      var m = member || {};
      var keep = {}; ['name', 'phone', 'email', 'message'].forEach(function(k){ var x = el.querySelector('[name="rv_' + k + '"]'); if (x) keep[k] = x.value; });
      out('result').innerHTML = '<div class="est-card rv-card">' + headBlock(r)
        + '<form class="rv-apply" novalidate><h4>예약자 정보 <small class="muted">이름과 연락처만 있으면 됩니다</small></h4>'
        + (member ? '<div class="member-line on"><span><b>' + esc(member.name) + '</b>님, 회원 정보로 채웠습니다. 진행 상태는 마이페이지에서 볼 수 있습니다.</span></div>' : '')
        + '<div class="field-row"><div class="f"><label for="' + pid + '-name">이름 <span class="req">*</span></label><input class="input" id="' + pid + '-name" name="rv_name" autocomplete="name" maxlength="40" value="' + esc(keep.name || m.name || '') + '" required></div>'
        + '<div class="f"><label for="' + pid + '-phone">휴대폰 번호 <span class="req">*</span></label><input class="input" type="tel" id="' + pid + '-phone" name="rv_phone" autocomplete="tel" placeholder="010-0000-0000" value="' + esc(keep.phone || m.phone || '') + '" required></div></div>'
        + '<div class="field-row"><div class="f"><label for="' + pid + '-email">이메일 <span class="muted">(선택)</span></label><input class="input" type="email" id="' + pid + '-email" name="rv_email" autocomplete="email" placeholder="견적서를 받을 주소" value="' + esc(keep.email || m.email || '') + '"></div>'
        + '<div class="f"><label for="' + pid + '-ptype">모임 유형 <span class="muted">(선택)</span></label><select class="select" id="' + pid + '-ptype" name="rv_purpose"><option value="">선택 안 함</option>' + PUR.map(function(p){ return '<option value="' + p.id + '"' + (st.purpose === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') + '<option value="other"' + (st.purpose === 'other' ? ' selected' : '') + '>기타</option></select></div></div>'
        + '<div class="f"><label for="' + pid + '-msg">요청사항 <span class="muted">(선택)</span></label><textarea class="textarea" id="' + pid + '-msg" name="rv_message" maxlength="1000" style="min-height:64px" placeholder="행사 성격, 배치, 반입할 장비, 음식 등 미리 알려 주실 것">' + esc(keep.message || '') + '</textarea></div>'
        + '<label class="agree"><input type="checkbox" name="rv_agree" required> <span>(필수) 예약 안내를 위해 이름·연락처·이메일·신청 내용을 수집·이용하는 데 동의합니다. 보유 기간은 처리 완료 후 1년이며 <a href="/privacy/" target="_blank" rel="noopener" style="text-decoration:underline">개인정보처리방침</a>을 따릅니다.</span></label>'
        + '<div class="err" data-out="err" hidden></div>'
        + '<div class="rv-apply-btns"><button type="submit" class="btn btn-primary btn-lg" data-act="submit">예약 신청 완료 <span class="arrow">→</span></button><button type="button" class="btn btn-light" data-act="back">← 금액 다시 보기</button></div>'
        + '</form></div>';
      var ph = el.querySelector('[name=rv_phone]'); ph.addEventListener('input', function(){ var v = this.value.replace(/[^0-9]/g, '').slice(0, 11); if (v.length > 7) v = v.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3'); else if (v.length > 3) v = v.replace(/(\d{3})(\d+)/, '$1-$2'); this.value = v; });
      el.querySelector('.rv-apply').addEventListener('submit', function(e){ e.preventDefault(); submit(); });
      setTimeout(function(){ var n = el.querySelector('[name=rv_name]'); if (n && !n.value) n.focus(); }, 50);
    }
    function reserveText(r, who){
      var L = [E.summaryText(r, purLabel(r.purpose))];
      if (who) L.unshift('[메가스팟 건대 예약 신청] ' + who.name + ' / ' + who.phone + (who.email ? ' / ' + who.email : '') + (who.message ? '\n요청사항: ' + who.message : ''));
      return L.join('\n');
    }
    function submit(){
      var form = el.querySelector('.rv-apply'), er = out('err'); er.hidden = true;
      if (!M.validate(form)){ er.textContent = '이름·휴대폰 번호와 동의 여부를 확인해 주세요.'; er.hidden = false; return; }
      read(); var r = last || calc();
      var who = { name: form.rv_name.value.trim(), phone: form.rv_phone.value.trim(), email: form.rv_email.value.trim(), message: form.rv_message.value.trim() };
      var purpose = form.rv_purpose.value || st.purpose;
      var body = { inquiry_type: st.regular ? 'regular' : 'event', space_id: 'megaspot-gundae', reserve: true, purpose: purpose, date: r.date, slot: 'custom',
        t_start: E.hourLabel(r.start).replace(/^다음 날 /, ''), t_end: E.hourLabel(r.end).replace(/^다음 날 /, ''), start_h: r.start, end_h: r.end, headcount: r.people,
        options: options(), pkg: r.pkg ? r.pkg.id : '', total: r.total, name: who.name, phone: who.phone, email: who.email, message: who.message, contact_pref: 'kakao',
        agree_privacy: true, estimate: E.summaryText(r, purLabel(purpose)), source: location.pathname, summary: reserveText(r, who) };
      var btn = el.querySelector('[data-act=submit]'); btn.disabled = true; btn.textContent = '신청하는 중…';
      M.api('/inquiry', { method: 'POST', body: body }).then(function(res){ done = { ref: res.ref, live: true, who: who, r: r, purpose: purpose, member: !!res.member }; phase = 'done'; paintDone(); })
      .catch(function(ex){
        if (ex.code === 'NO_API'){ done = { ref: M.localRef('MS'), live: false, who: who, r: r, purpose: purpose }; phase = 'done'; paintDone(); return; }
        er.textContent = ex.message || '신청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.'; er.hidden = false; btn.disabled = false; btn.innerHTML = '예약 신청 완료 <span class="arrow">→</span>';
      });
    }
    function paintDone(){
      var r = done.r, text = reserveText(r, done.who);
      var passId = r.pkg ? PASS_ID[r.pkg.id][r.col] : null;
      var payLink = passId ? '/order/?product=' + passId + '&date=' + r.date + '&people=' + r.people + '&ref=' + encodeURIComponent(done.ref) : '';
      out('result').innerHTML = '<div class="est-card rv-card rv-done">'
        + '<div class="row between"><div class="eyebrow">' + (done.live ? 'Received' : 'Draft') + '</div><span class="badge ' + (done.live ? 'badge-ok' : 'badge-warn') + '">' + (done.live ? '예약 신청 접수' : '체험 모드 · 전송 대기') + '</span></div>'
        + '<h3 class="est-title">' + (done.live ? '예약 신청이 접수되었습니다' : '예약 신청 내용이 준비되었습니다') + '</h3>'
        + '<div class="oc-code mt-2"><small>접수번호</small><b>' + esc(done.ref) + '</b></div>'
        + '<dl class="def mt-3"><div><dt>이용일</dt><dd>' + esc(E.kdateY(r.date)) + '</dd></div><div><dt>시간</dt><dd>' + esc(r.range) + (r.pkg ? ' · ' + esc(r.pkg.label) : '') + '</dd></div><div><dt>인원</dt><dd>' + r.people + '명</dd></div><div><dt>예상 금액</dt><dd><b>' + esc(won(r.total)) + '</b> <span class="muted">(' + esc(D.deposit.label) + ' ' + esc(won(r.deposit)) + ' 별도)</span></dd></div><div><dt>예약자</dt><dd>' + esc(done.who.name) + ' · ' + esc(done.who.phone) + '</dd></div></dl>'
        + (done.live
          ? '<ol class="steps-mini mt-3"><li><b>일정 확인</b><span>담당자가 신청하신 날짜·시간이 비어 있는지 확인하고 영업시간 기준 2시간 안에 카카오톡·문자로 연락드립니다.</span></li><li><b>금액 확인·결제 안내</b><span>확정 금액과 결제 방법(카드·계좌이체)을 안내드립니다.</span></li><li><b>예약 확정</b><span>결제가 끝나면 예약번호가 발급되고 현장 안내를 보내 드립니다.</span></li></ol>'
          : '<p class="small muted mt-2">지금은 서버가 연결되지 않아 자동 저장되지 않았습니다. 아래 내용을 카카오톡으로 보내 주시면 같은 순서로 안내해 드립니다.</p>')
        + (payLink && done.live ? '<div class="notice mt-3"><div><b>지금 바로 결제하고 확정할 수도 있습니다.</b><br>선택하신 시간이 ' + esc(r.pkg.label) + '와 같아서 온라인 이용권으로 바로 결제할 수 있습니다. 결제가 끝나면 이 신청이 자동으로 \'예약 확정\'으로 바뀝니다.</div><a class="btn btn-primary btn-sm" href="' + esc(payLink) + '">바로 결제하기 →</a></div>' : '')
        + '<div class="rv-sub mt-3">' + (KAKAO ? '<a class="btn btn-kakao btn-sm" data-act="kakao" href="' + esc(KAKAO) + '" target="_blank" rel="noopener">카카오톡으로 보내기</a>' : '') + '<button type="button" class="btn btn-light btn-sm" data-act="copy">내용 복사</button><button type="button" class="btn btn-light btn-sm" data-act="pdf">견적서 PDF</button>' + (done.member ? '<a class="btn btn-light btn-sm" href="/mypage/">마이페이지</a>' : '') + '<button type="button" class="btn btn-ghost btn-sm" data-act="again">새로 계산</button></div>'
        + '<pre class="dr-pre mt-3" data-out="summary" hidden>' + esc(text) + '</pre>'
        + '</div>';
      out('mini').hidden = true;
      out('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    el.addEventListener('change', function(e){ if (e.target.name && e.target.name.indexOf('rv_') === 0) return; calc(); });
    el.addEventListener('input', function(e){ if (e.target.name === 'people' || e.target.name === 'managerCount' || e.target.name === 'managerHours') calc(); });
    out('pkgs').addEventListener('click', function(e){ var b = e.target.closest('.slot-btn'); if (!b) return; var p = E.findPkg(b.dataset.pkg); f('start').value = p.start; f('end').value = p.end; calc(); });
    out('people-pick').addEventListener('click', function(e){ var b = e.target.closest('button'); if (!b) return; f('people').value = b.dataset.n; calc(); });
    el.addEventListener('click', function(e){
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.dataset.act;
      if (act === 'show'){ out('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); if (phase === 'calc'){ phase = 'form'; paintForm(last || calc()); } return; }
      if (act === 'reserve'){ phase = 'form'; paintForm(last || calc()); if (window.matchMedia('(max-width:959px)').matches) out('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (act === 'back'){ phase = 'calc'; paintResult(last || calc()); return; }
      if (act === 'again'){ phase = 'calc'; done = null; paintResult(calc()); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (act === 'submit') return;
      if (!last) calc();
      var text = done ? reserveText(done.r, done.who) : E.summaryText(last, purLabel(last.purpose));
      if (act === 'copy'){ copyText(text, '내용을 복사했습니다.'); }
      if (act === 'kakao'){ copyText(text, '내용을 복사했습니다. 카카오톡 채팅창에 붙여 넣어 보내 주세요.'); }
      if (act === 'pdf'){ printQuote(done ? done.r : last); }
    });
    function copyText(text, msg){ (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function(){ M.toast(msg); }).catch(function(){ window.prompt('아래 내용을 복사해 주세요.', text); }); }
    if (M.account && M.account.loggedIn()) M.account.me().then(function(m){ member = m; if (phase === 'form') paintForm(last); });

    var api = {
      setDate: function(iso){ if (!iso) return; f('date').value = iso; calc(); },
      setPackage: function(id){ var p = E.findPkg(id); if (!p) return; f('start').value = p.start; f('end').value = p.end; calc(); },
      setRange: function(s, e){ f('start').value = s; f('end').value = e; calc(); },
      set: function(o){ o = o || {}; if (o.date) f('date').value = o.date; if (o.start) f('start').value = o.start; if (o.end) f('end').value = o.end; if (o.people) f('people').value = o.people; if (o.purpose !== undefined) f('purpose').value = o.purpose; calc(); },
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
