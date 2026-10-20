/* 출장뷔페 페이지 — 예상 금액 계산기 · 코스 메뉴에서 바로 계산 · 사진 크게 보기 */
(function(){
  var M = window.MEGASPOT, C = window.MEGASPOT_CATERING_CALC; if (!M || !C) return;
  var D = C.data, esc = M.esc, won = C.won;
  var box = document.getElementById('cat-calc');
  var st = { people: 60, course: 'classic', bbq: '', beer: 0 };
  var p0 = null; try { p0 = JSON.parse(sessionStorage.getItem('ms_catering') || 'null'); } catch (e) {}   // 이 탭에서 전에 고른 구성이 있으면 이어서 보여 줍니다
  if (p0 && (p0.course || p0.bbq || p0.beer)) { st.course = p0.course || ''; st.people = p0.people || st.people; st.bbq = p0.bbq || ''; st.beer = p0.beer || 0; }
  var QUICK = [20, 30, 40, 60, 80, 100, 150, 200];

  function courseCard(c){
    var price = c.kind === 'flat' ? '<b>' + esc(C.man(c.tiers[0].price)) + '</b><small>' + c.tiers[0].people + '인 · ' + c.tiers[1].people + '인 ' + esc(C.man(c.tiers[1].price)) + '</small>'
                                  : '<b>' + esc(won(c.price)) + '</b><small>1인 · ' + c.min + '인부터</small>';
    return '<label class="cc-opt' + (c.popular ? ' pop' : '') + '"><input type="radio" name="cc_course" value="' + c.id + '"' + (st.course === c.id ? ' checked' : '') + '>'
      + '<span class="cc-opt-name"><b>' + esc(c.name) + '</b>' + (c.popular ? '<em>추천</em>' : '') + '<small>' + esc(c.tag) + ' · ' + c.dishes + '종</small></span><span class="cc-opt-price">' + price + '</span></label>';
  }
  function render(){
    box.innerHTML = '<div class="cc-grid">'
      + '<form class="cc-form card" novalidate onsubmit="return false">'
      + '<div class="cc-step"><div class="cc-step-h"><span>1</span>식사 인원</div>'
      + '<div class="cc-people"><input class="input" type="number" inputmode="numeric" min="1" max="200" name="cc_people" value="' + st.people + '" aria-label="식사 인원"><span>명</span></div>'
      + '<div class="pick cc-quick">' + QUICK.map(function(n){ return '<button type="button" data-n="' + n + '">' + n + '명</button>'; }).join('') + '</div></div>'
      + '<div class="cc-step"><div class="cc-step-h"><span>2</span>코스</div><div class="cc-opts">' + D.courses.map(courseCard).join('')
      + '<label class="cc-opt none"><input type="radio" name="cc_course" value=""' + (!st.course ? ' checked' : '') + '><span class="cc-opt-name"><b>뷔페 없이</b><small>바베큐·생맥주만 주문</small></span><span class="cc-opt-price"></span></label></div></div>'
      + '<div class="cc-step"><div class="cc-step-h"><span>3</span>바베큐 · 생맥주 <small class="muted">(선택)</small></div>'
      + '<div class="field-row"><div class="f"><label for="cc-bbq">바베큐 (실내형 완제품)</label><select class="select" id="cc-bbq" name="cc_bbq">' + C.bbqOptions(st.bbq) + '</select></div>'
      + '<div class="f"><label for="cc-beer">생맥주 (' + esc(D.beer.unit) + ')</label><select class="select" id="cc-beer" name="cc_beer">' + C.beerOptions(st.beer) + '</select></div></div></div>'
      + '</form>'
      + '<div class="cc-result card" aria-live="polite" data-out="result"></div>'
      + '</div>';
    paint();
  }
  function read(){
    var f = box.querySelector('.cc-form');
    st.people = Math.max(0, Math.min(999, parseInt(f.cc_people.value, 10) || 0));
    var r = f.querySelector('[name=cc_course]:checked'); st.course = r ? r.value : '';
    st.bbq = f.cc_bbq.value; st.beer = +f.cc_beer.value || 0;
  }
  function query(){ return '?catering=' + encodeURIComponent(st.course || '1') + '&cpeople=' + st.people + (st.bbq ? '&bbq=' + st.bbq : '') + (st.beer ? '&beer=' + st.beer : '') + (st.people >= 1 && st.people <= 200 ? '&people=' + st.people : ''); }
  function text(r){
    var L = ['[메가스팟 출장뷔페 문의]'];
    if (r.course) L.push('· 코스: ' + r.course.name + (r.course.kind === 'flat' ? ' (정액)' : ' (1인 ' + won(r.course.price) + ')'));
    L.push('· 식사 인원: ' + (st.people || r.billPeople) + '명' + (r.billPeople && r.billPeople !== st.people ? ' (계산 기준 ' + r.billPeople + '명)' : ''));
    if (r.bbq) L.push('· 바베큐: ' + r.bbq.size + ' (' + r.bbq.people + ')');
    if (r.beer) L.push('· 생맥주: ' + r.beer + '통');
    L.push('· 예상 금액: ' + won(r.total) + ' (공급가 ' + won(r.supply) + ' + 부가세 ' + won(r.vat) + ', ' + D.delivery.label + ' 포함)');
    L.push('· 행사 날짜·시간: ');
    L.push('대관과 함께 상담 부탁드립니다.');
    return L.join('\n');
  }
  function paint(){
    read();
    box.querySelectorAll('.cc-quick button').forEach(function(b){ b.classList.toggle('on', +b.dataset.n === st.people); });
    box.querySelectorAll('.cc-opt').forEach(function(l){ l.classList.toggle('on', l.querySelector('input').checked); });
    var r = C.quote(st), out = box.querySelector('[data-out=result]');
    if (r.empty){ out.innerHTML = '<div class="eyebrow">Estimate</div><p class="mt-2 muted">코스나 바베큐·생맥주를 고르면 예상 금액이 나옵니다.</p>'; return; }
    var rows = r.lines.map(function(l){ return '<tr><td>' + esc(l.label) + '</td><td class="r">' + esc(won(l.amount)) + '</td></tr>'; }).join('');
    out.innerHTML = '<div class="row between"><div class="eyebrow">Estimate</div><span class="tiny muted">' + esc(D.version) + ' 기준</span></div>'
      + '<div class="cc-total"><span>예상 금액<small>부가세 포함</small></span><b>' + esc(won(r.total)) + '</b></div>'
      + (r.course ? '<p class="small muted">1인당 약 ' + esc(won(Math.round(r.perPerson / 100) * 100)) + ' · ' + esc(C.parts(r)) + '</p>' : '<p class="small muted">' + esc(C.parts(r)) + '</p>')
      + '<table class="est-lines cc-lines"><tbody>' + rows
      + '<tr class="sub"><td>공급가</td><td class="r">' + esc(won(r.supply)) + '</td></tr><tr class="sub"><td>부가세 10%</td><td class="r">' + esc(won(r.vat)) + '</td></tr>'
      + '<tr class="sum"><td><b>합계</b></td><td class="r"><b>' + esc(won(r.total)) + '</b></td></tr></tbody></table>'
      + (r.warn.length ? '<ul class="est-warn">' + r.warn.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '')
      + '<a class="btn btn-primary btn-lg cc-go" href="/inquiry/' + query() + '#estimate" data-act="go">이 구성으로 대관과 함께 신청 <span class="arrow">→</span></a>'
      + '<div class="rv-sub"><a class="btn btn-kakao btn-sm" href="' + esc(M.CONFIG.kakaoChannel || '#') + '" target="_blank" rel="noopener" data-act="kakao">카카오톡으로 문의</a><button type="button" class="btn btn-light btn-sm" data-act="copy">내용 복사</button></div>'
      + '<p class="tiny muted mt-2">공간 대관료는 별도입니다. 신청서에 출장뷔페 구성이 함께 담기고, 담당자가 날짜와 메뉴를 확인해 대관료와 함께 안내해 드립니다.</p>';
  }
  function copy(t, msg){ (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ M.toast(msg); }).catch(function(){ window.prompt('아래 내용을 복사해 주세요.', t); }); }

  if (box) {
    render();
    box.addEventListener('input', function(e){ if (e.target.name === 'cc_people') paint(); });
    box.addEventListener('change', paint);
    box.addEventListener('click', function(e){
      var q = e.target.closest('.cc-quick button'); if (q){ box.querySelector('[name=cc_people]').value = q.dataset.n; paint(); return; }
      var a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'copy'){ C.savePreset(st, false); copy(text(C.quote(st)), '내용을 복사했습니다.'); }
      if (a.dataset.act === 'kakao'){ C.savePreset(st, false); copy(text(C.quote(st)), '내용을 복사했습니다. 카카오톡 채팅창에 붙여 넣어 보내 주세요.'); }
      if (a.dataset.act === 'go'){ C.savePreset(st, true); }
    });
  }
  // 코스 메뉴의 '이 코스로 계산하기'
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-pick]'); if (!b || !box) return;
    e.preventDefault();
    var c = C.course(b.dataset.pick); if (!c) return;
    var r = box.querySelector('[name=cc_course][value="' + c.id + '"]'); if (r) r.checked = true;
    var pi = box.querySelector('[name=cc_people]');
    if (c.kind === 'flat' && +pi.value > 30) pi.value = 30;
    if (c.kind === 'per' && +pi.value < c.min) pi.value = c.min;
    paint();
    document.getElementById('calc').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // '대관과 함께 신청' 링크는 지금 계산기에 고른 구성을 함께 넘깁니다
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href^="/inquiry/?catering=1"]'); if (!a || !box) return;
    read(); C.savePreset(st, true); a.href = '/inquiry/' + query() + '#estimate';
  });
  // 사진 크게 보기
  var ph = [].slice.call(document.querySelectorAll('.cat-ph'));
  var items = ph.map(function(a){ return { src: a.getAttribute('href'), title: (a.querySelector('span') || {}).textContent || '', tag: '출장뷔페' }; });
  ph.forEach(function(a, i){ a.addEventListener('click', function(e){ if (!M.openLightbox) return; e.preventDefault(); M.openLightbox(items, i); }); });
})();
