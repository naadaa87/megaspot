/* 메가스팟 출장뷔페 금액 계산 — 홈페이지 계산기·예약 신청서·관리자 화면이 같은 계산을 씁니다.
   입력: { course: 'classic' | 'small' | '' , people: 60, bbq: 'kg50' | '', beer: 2 }
   금액은 모두 부가세 별도 공급가 → 마지막에 부가세 10%를 더합니다.
   formBlock/bind/read 는 예약 신청서·간단 문의서에 붙는 '출장뷔페도 함께 상담' 칸입니다. */
(function(){
  var D = window.MEGASPOT_CATERING; if (!D) return;
  var KEY = 'ms_catering';   // 출장뷔페 페이지에서 고른 구성을 예약 신청서로 넘길 때 씁니다 (sessionStorage · 이 탭에서만)
  function won(n){ return (Math.round(n) || 0).toLocaleString('ko-KR') + '원'; }
  function man(n){ n = Math.round(n || 0); if (n >= 10000 && n % 10000 === 0) return (n / 10000).toLocaleString('ko-KR') + '만 원'; return won(n); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function course(id){ for (var i = 0; i < D.courses.length; i++) if (D.courses[i].id === id) return D.courses[i]; return null; }
  function bbqRow(id){ for (var i = 0; i < D.bbq.rows.length; i++) if (D.bbq.rows[i].id === id) return D.bbq.rows[i]; return null; }
  function fromPrice(c){ return c.kind === 'flat' ? c.tiers[0].price : c.price; }
  function liveMin(c){ return c.liveMin || 100; }
  function quote(o){
    o = o || {};
    var c = course(o.course), b = bbqRow(o.bbq), beer = Math.max(0, Math.min(20, Math.round(+o.beer || 0)));
    var people = Math.max(0, Math.min(999, Math.round(+o.people || 0))), lines = [], warn = [], billPeople = people;
    var fee = o.fee != null && o.fee !== '' && !isNaN(+o.fee) ? Math.max(0, Math.round(+o.fee)) : D.delivery.fee;
    if (c) {
      if (c.kind === 'flat') {
        var tier = people > 20 ? c.tiers[1] : c.tiers[0];
        if (people > 30) warn.push(c.name + '은 30인까지입니다. 31인 이상은 베이직(40인부터) 이상 코스를 골라 주세요.');
        if (people && people < 20) warn.push('출장뷔페는 20인부터 주문할 수 있어 20인 기준으로 계산했습니다.');
        billPeople = tier.people;
        lines.push({ key: 'course', label: c.name + ' ' + tier.people + '인 정액', amount: tier.price, people: tier.people });
      } else {
        var p = Math.max(people || c.min, c.min);
        if (people && people < c.min) warn.push(c.name + ' 코스는 ' + c.min + '인부터라 ' + c.min + '인 기준으로 계산했습니다.' + (c.min === 40 && people >= 20 ? ' 20·30인 행사는 소규모 스페셜(정액)을 확인해 보세요.' : ''));
        billPeople = p;
        lines.push({ key: 'course', label: c.name + ' 코스 1인 ' + won(c.price) + ' × ' + p + '명', amount: c.price * p, people: p });
      }
    }
    if (b) lines.push({ key: 'bbq', label: '바베큐 ' + b.size + ' (' + b.people + ')', amount: b.price, people: b.pmax });
    if (beer) lines.push({ key: 'beer', label: '생맥주 ' + beer + '통 (' + D.beer.unit + ', 약 ' + (beer * D.beer.cups) + '잔)', amount: beer * D.beer.price, people: 0 });
    if (lines.length && fee) lines.push({ key: 'delivery', label: D.delivery.label, amount: fee, people: 0 });
    var supply = lines.reduce(function(a, x){ return a + x.amount; }, 0), vat = Math.round(supply * D.vat), total = supply + vat;
    if (c && people > 200) warn.push('메가스팟 건대는 최대 200명까지 이용할 수 있습니다.');
    if (c && c.live && billPeople >= liveMin(c)) warn.push(liveMin(c) + '인 이상이라 즉석 코너(' + c.live.replace(/ — .*/, '') + ')가 함께 운영됩니다.');
    return { course: c, bbq: b, beer: beer, people: people || billPeople, billPeople: billPeople, lines: lines, supply: supply, vat: vat, total: total, fee: fee,
             perPerson: billPeople ? Math.round(total / billPeople) : 0, warn: warn, empty: !lines.length };
  }
  function parts(r){
    var p = [];
    if (r.course) p.push(r.course.name + (r.course.kind === 'flat' ? '' : ' 코스') + ' ' + r.billPeople + '명');
    if (r.bbq) p.push('바베큐 ' + r.bbq.size);
    if (r.beer) p.push('생맥주 ' + r.beer + '통');
    return p.join(' · ');
  }
  function summary(r){
    if (!r || r.empty) return '';
    return parts(r) + ' — 예상 ' + won(r.total) + ' (부가세 포함)';
  }

  /* ---------- 고른 구성 넘기기 (출장뷔페 페이지 → 예약 신청) ---------- */
  // go: 고객이 '신청'으로 넘어가겠다고 고른 구성일 때만 true → 그때만 다른 화면의 신청서에 미리 체크됩니다
  function savePreset(o, go){ try { sessionStorage.setItem(KEY, JSON.stringify({ course: o.course || '', people: +o.people || 0, bbq: o.bbq || '', beer: +o.beer || 0, go: go !== false, t: Date.now() })); } catch (e) {} }
  function clearPreset(){ try { sessionStorage.removeItem(KEY); } catch (e) {} }
  function preset(){
    var q = null; try { q = new URLSearchParams(location.search); } catch (e) {}
    if (q && q.get('catering')) {
      var v = q.get('catering'), o = { course: course(v) ? v : '', people: +(q.get('cpeople') || 0) || 0, bbq: bbqRow(q.get('bbq')) ? q.get('bbq') : '', beer: Math.min(20, +(q.get('beer') || 0) || 0), on: true };
      if (o.course || o.bbq || o.beer) { savePreset(o); return o; }
      try { var s0 = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s0 && Date.now() - (s0.t || 0) < 6 * 3600e3) { s0.on = true; return s0; } } catch (e) {}
      return o;
    }
    try { var s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && s.go && Date.now() - (s.t || 0) < 6 * 3600e3) { s.on = true; return s; } } catch (e) {}
    return null;
  }

  /* ---------- 신청서 칸 ---------- */
  function courseOptions(sel, first){
    return '<option value="">' + esc(first || '코스는 상담 후 결정') + '</option>' + D.courses.map(function(c){
      var p = c.kind === 'flat' ? c.tiers[0].people + '·' + c.tiers[1].people + '인 정액' : '1인 ' + won(c.price) + (c.min > 40 ? ' · ' + c.min + '인~' : '');
      return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name + ' · ' + p) + '</option>';
    }).join('');
  }
  function bbqOptions(sel){ return '<option value="">바베큐 없음</option>' + D.bbq.rows.map(function(b){ return '<option value="' + b.id + '"' + (b.id === sel ? ' selected' : '') + '>' + esc(b.size + ' · ' + won(b.price)) + '</option>'; }).join(''); }
  function beerOptions(sel){ var s = '<option value="0">생맥주 없음</option>'; for (var i = 1; i <= 10; i++) s += '<option value="' + i + '"' + (i === +sel ? ' selected' : '') + '>' + i + '통 · ' + won(i * D.beer.price) + '</option>'; return s; }
  function lowest(){ var m = Infinity; D.courses.forEach(function(c){ if (c.kind === 'per' && c.group !== 'light') m = Math.min(m, c.price); }); return m; }   // 뷔페 코스 기준
  function formBlock(name, opt){
    opt = opt || {}; var p = opt.preset || preset() || {}, on = !!p.on, id = 'cat-' + name;
    return '<div class="f cat-ask' + (on ? ' on' : '') + '" data-cat-ask="' + esc(name) + '">'
      + '<label class="chk cat-ask-on"><input type="checkbox" name="' + name + '_on" value="1"' + (on ? ' checked' : '') + '> <span><b>출장뷔페도 함께 상담받기</b> <span class="muted">1인 ' + esc(won(lowest())) + '부터 · 20인부터 · 부가세 별도</span></span></label>'
      + '<div class="cat-ask-body"' + (on ? '' : ' hidden') + '>'
      + '<div class="field-row"><div class="f"><label for="' + id + '-course">코스</label><select class="select" id="' + id + '-course" name="' + name + '_course">' + courseOptions(p.course) + '</select></div>'
      + '<div class="f"><label for="' + id + '-people">식사 인원</label><input class="input" type="number" inputmode="numeric" min="1" max="200" id="' + id + '-people" name="' + name + '_people" value="' + (p.people || '') + '" placeholder="대관 인원과 같으면 비워 두세요"></div></div>'
      + '<div class="field-row"><div class="f"><label for="' + id + '-bbq">바베큐</label><select class="select" id="' + id + '-bbq" name="' + name + '_bbq">' + bbqOptions(p.bbq) + '</select></div>'
      + '<div class="f"><label for="' + id + '-beer">생맥주</label><select class="select" id="' + id + '-beer" name="' + name + '_beer">' + beerOptions(p.beer) + '</select></div></div>'
      + '<p class="cat-ask-sum" data-cat-sum></p>'
      + '<p class="tiny muted">출장뷔페는 메가스팟이 대관 일정에 맞춰 함께 준비합니다. 코스를 정하지 않아도 신청할 수 있고, 상담하면서 메뉴와 인원을 정합니다. <a href="/catering/" target="_blank" rel="noopener" style="text-decoration:underline">코스·메뉴 보기</a></p>'
      + '</div></div>';
  }
  function field(root, name, k){ return root.querySelector('[name="' + name + '_' + k + '"]'); }
  function read(root, name, fallbackPeople){
    var on = field(root, name, 'on'); if (!on || !on.checked) return null;
    var o = { on: true, course: field(root, name, 'course').value, bbq: field(root, name, 'bbq').value, beer: +field(root, name, 'beer').value || 0 };
    var pv = parseInt(field(root, name, 'people').value, 10);
    o.people = pv > 0 ? pv : (+fallbackPeople || 0);
    var r = quote(o);
    o.total = r.empty ? 0 : r.total; o.summary = r.empty ? '출장뷔페 상담 희망 (코스 미정' + (o.people ? ' · ' + o.people + '명' : '') + ')' : summary(r);
    return o;
  }
  function bind(root, name, getPeople){
    var box = root.querySelector('[data-cat-ask="' + name + '"]'); if (!box) return null;
    var body = box.querySelector('.cat-ask-body'), sum = box.querySelector('[data-cat-sum]');
    function paint(){
      var gp = getPeople ? +getPeople() || 0 : 0, pi = field(root, name, 'people');
      if (gp && !pi.value) pi.placeholder = '비워 두면 대관 인원 ' + gp + '명으로 계산';
      var o = read(root, name, gp); box.classList.toggle('on', !!o); body.hidden = !o;
      if (!o){ sum.innerHTML = ''; return; }
      var r = quote(o);
      sum.innerHTML = r.empty ? '<span class="muted">코스나 바베큐·생맥주를 고르면 예상 금액이 함께 나옵니다.</span>'
        : '<b>' + esc(parts(r)) + '</b> <span class="cat-ask-total">예상 ' + esc(won(r.total)) + '</span> <small class="muted">부가세·' + esc(D.delivery.label) + ' 포함' + (r.course ? ' · 1인 약 ' + esc(won(Math.round(r.perPerson / 100) * 100)) : '') + '</small>'
          + (r.warn.length ? '<small class="cat-ask-warn">' + esc(r.warn[0]) + '</small>' : '');
      if (o.course || o.bbq || o.beer) savePreset(o);
    }
    box.addEventListener('change', paint); box.addEventListener('input', paint);
    paint();
    return { paint: paint };
  }
  window.MEGASPOT_CATERING_CALC = { quote: quote, summary: summary, parts: parts, course: course, bbqRow: bbqRow, fromPrice: fromPrice, liveMin: liveMin, won: won, man: man, data: D,
    preset: preset, savePreset: savePreset, clearPreset: clearPreset, formBlock: formBlock, bind: bind, read: read, courseOptions: courseOptions, bbqOptions: bbqOptions, beerOptions: beerOptions };
})();
