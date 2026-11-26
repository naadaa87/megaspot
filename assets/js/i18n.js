/* 외국어 화면(영어·일본어·중국어) 전용 동작 (2026-11-26) — tools/i18n/build.mjs 가 만든 화면에서만 불러옵니다.
   · 사진 크게 보기 · 주소 복사 · 문의 보내기(/api/inquiry — 한국어 문의와 같은 '문의 관리' 목록으로 들어갑니다) */
(function(){
  'use strict';
  var M = window.MEGASPOT; if(!M) return;
  var LANG = (document.documentElement.lang || 'en').slice(0, 2);
  var LANG_KO = { en: '영어', ja: '일본어', zh: '중국어' }[LANG] || LANG;

  // 사진 크게 보기 (site.js 의 사진 보기 창)
  Array.prototype.forEach.call(document.querySelectorAll('[data-i-gallery]'), function(g){
    var links = Array.prototype.slice.call(g.querySelectorAll('a[data-full]'));
    var items = links.map(function(a){ var im = a.querySelector('img'); return { src: a.getAttribute('data-full'), title: im ? im.alt : '' }; });
    links.forEach(function(a, i){ a.addEventListener('click', function(e){ if(!M.openLightbox) return; e.preventDefault(); M.openLightbox(items, i); }); });
  });

  // 주소 복사
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function(b){
    var label = b.textContent;
    b.addEventListener('click', function(){
      var done = function(){ b.textContent = b.getAttribute('data-done') || '✓'; setTimeout(function(){ b.textContent = label; }, 1800); };
      (M.copy ? Promise.resolve(M.copy(b.getAttribute('data-copy'))) : navigator.clipboard.writeText(b.getAttribute('data-copy'))).then(done, done);
    });
  });

  // 문의 보내기
  var f = document.getElementById('i-form'); if(!f) return;
  var T = {}; try{ T = JSON.parse(f.getAttribute('data-msgs') || '{}'); }catch(e){}
  var errBox = f.querySelector('.i-err'), btn = f.querySelector('[type=submit]'), btnLabel = btn.innerHTML;
  var pad = function(n){ return (n < 10 ? '0' : '') + n; };
  var now = new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);   // 한국 시각 기준 오늘
  var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  f.date.min = today; f.visit_date.min = today;
  var vd = f.querySelector('.i-visit-date');
  f.visit.addEventListener('change', function(){ vd.hidden = !f.visit.checked; });
  var hhmm = function(h){ return pad(h % 24) + ':00'; };
  function fail(msg, el){ errBox.textContent = msg; errBox.hidden = false; if(el && el.focus) el.focus(); return false; }
  function check(){
    errBox.hidden = true;
    if(!f.name.value.trim()) return fail(T.name, f.name);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim())) return fail(T.email, f.email);
    if(f.phone.value.replace(/\D/g, '').length < 9) return fail(T.phone, f.phone);
    if(!f.date.value || f.date.value < today) return fail(T.date, f.date);
    if(+f.end.value <= +f.start.value) return fail(T.time, f.end);
    if(!(+f.guests.value > 0)) return fail(T.guests, f.guests);
    if(!f.consent.checked) return fail(T.consent, f.consent);
    return true;
  }
  var HALL_KO = { g1: '건대 1호', g2: '건대 2호', any: '미정 — 1호·2호 중 추천 요청' };
  var PREF_KO = { email: '이메일', kakao: '카카오톡', phone: '전화·문자' };
  var PURPOSE_KO = { seminar: '세미나·컨퍼런스', workshop: '기업 워크숍', networking: '네트워킹·리셉션', party: '파티·송년회', 'class': '클래스', culture: '공연·상영회', popup: '팝업·마켓·전시', shooting: '촬영', other: '기타' };
  f.addEventListener('submit', function(e){
    e.preventDefault(); if(!check()) return;
    var hall = (f.querySelector('input[name=hall]:checked') || {}).value || 'any', pref = (f.querySelector('input[name=pref]:checked') || {}).value || 'email';
    var s = +f.start.value, en = +f.end.value, guests = +f.guests.value, purpose = f.purpose.value, msg = f.message.value.trim();
    var visitWant = f.visit.checked, visitDate = f.visit_date.value || '';
    // 관리자 '문의 관리'에서 바로 읽을 수 있게 한국어 요약을 붙입니다 (고객이 쓴 글은 원문 그대로)
    var summary = ['[해외 문의 · ' + LANG_KO + ' 화면]',
      '공간: ' + HALL_KO[hall],
      '이용일: ' + f.date.value + (f.flex.checked ? ' (날짜 조정 가능)' : ''),
      '시간: ' + hhmm(s) + ' ~ ' + hhmm(en) + (en > 24 ? ' (다음 날)' : '') + ' · ' + (en - s) + '시간',
      '인원: ' + guests + '명 · 모임 성격: ' + (PURPOSE_KO[purpose] || purpose),
      '답장 방법: ' + PREF_KO[pref] + ' · 이메일 ' + f.email.value.trim() + ' · 전화 ' + f.phone.value.trim(),
      visitWant ? '사전답사 희망' + (visitDate ? ': ' + visitDate : '') : '',
      msg ? '문의 내용(원문):\n' + msg : ''].filter(Boolean).join('\n');
    var body = {
      inquiry_type: 'event', space_id: hall === 'g2' ? 'megaspot-gundae-2' : 'megaspot-gundae',
      name: f.name.value.trim(), org: f.org.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), contact_pref: pref,
      date: f.date.value, start_h: s, end_h: en, t_start: hhmm(s), t_end: hhmm(en), headcount: guests, purpose: purpose,
      message: '[' + LANG_KO + ' 문의] ' + (hall === 'any' ? '(공간 미정) ' : '') + (f.flex.checked ? '(날짜 조정 가능) ' : '') + (msg || ''),
      summary: summary, source: 'i18n-' + LANG, agree_privacy: true,
      came_from: M.source ? M.source() : null,
      visit_wish: visitWant ? { want: true, date: visitDate, note: '해외 문의(' + LANG_KO + ')' } : null
    };
    btn.disabled = true; btn.textContent = T.sending || '…';
    M.api('/inquiry', { method: 'POST', body: body }).then(function(r){
      var d = T.done || {}, box = document.getElementById('i-done');
      box.innerHTML = '<h2 class="i-h2">' + M.esc(d.title || '') + '</h2><p class="i-ref">' + M.esc(String(d.ref || '').replace('{ref}', r.ref)) + '</p><p>' + M.esc(d.text || '') + '</p>';
      f.hidden = true; box.hidden = false; box.focus(); window.scrollTo({ top: box.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
    }).catch(function(e){
      btn.disabled = false; btn.innerHTML = btnLabel;
      fail(e && e.status === 429 ? T.busy : T.fail);
    });
  });
})();
