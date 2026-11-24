/* 관리자 · 공간대관 계약서 (2026-11-24)
   예약·문의 정보를 불러와 계약서를 채우고, 대관자에게 링크를 보냅니다(카카오톡 알림톡 · 이메일 · 링크 복사).
   대관자가 링크에서 대관자 정보를 입력하고 서명하면 '서명 완료'로 바뀌고, 같은 링크에서 계약서 PDF를 내려받을 수 있습니다.
   · 서명한 계약서는 고칠 수 없습니다. 바꿀 내용이 있으면 취소하고 새로 만듭니다(예약 1건에 진행 중인 계약서 1장).
   · 계약서 설정: 운영자 정보 · 입금 계좌 · 기본 잔금 기한·결제 방법 · 운영자 도장(서명) · 카카오톡 템플릿
   서버: /api/contracts/admin/* (functions/api/contracts/[[path]].js) · 계약서 본문: assets/js/kit/contract-doc.js */
(function () {
  'use strict';
  var X = window.MEGASPOT_ADMIN, M = window.MEGASPOT, C = window.MEGASPOT_CONTRACT; if (!X || !M || !C) return;
  var main = document.querySelector('.adm-main'); if (!main) return;
  var esc = X.esc;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function A(path, body) { return M.api('/contracts/admin/' + path, body ? { method: 'POST', body: body } : {}); }
  function oops(e) { if (X.guard(e)) return; M.toast((e && e.message) || '처리하지 못했습니다.'); }
  function copy(t, msg) { (M.copy ? M.copy(t) : navigator.clipboard.writeText(t).then(function () { return true; })).then(function (ok) { M.toast(ok === false ? '복사하지 못했습니다. 직접 선택해 복사해 주세요.' : msg); }); }
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function kd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? +m[2] + '/' + +m[3] + ' (' + WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + ')' : '-'; }
  function hh(h) { h = Number(h); if (h == null || !isFinite(h)) return ''; var x = h % 24; return ('0' + Math.floor(x)).slice(-2) + ':' + (x % 1 ? '30' : '00'); }
  function kst(ts) { var t = Date.parse(String(ts || '').replace(' ', 'T') + 'Z'); return isFinite(t) ? new Date(t + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : ''; }
  function phone(p) { p = String(p || '').replace(/\D/g, ''); return p.length === 11 ? p.slice(0, 3) + '-' + p.slice(3, 7) + '-' + p.slice(7) : p.length === 10 ? p.slice(0, 3) + '-' + p.slice(3, 6) + '-' + p.slice(6) : p; }
  function won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }
  function abs(u) { return /^https?:/.test(u) ? u : location.origin + u; }
  var ST = { ready: 'st-pay', signed: 'st-ok', void: 'st-cancel' };
  var SENT = { sending: '보내는 중', accepted: '접수', failed: '실패', unknown: '결과 확인 필요', skipped: '건너뜀' };
  var PURPOSE = {}; (window.MEGASPOT_PURPOSES || []).forEach(function (p) { PURPOSE[p.id] = p.label; });

  /* ---------- 화면 틀 ---------- */
  var sec = document.createElement('section'); sec.className = 'adm-view act-view'; sec.id = 'view-contracts'; sec.hidden = true;
  sec.innerHTML = '<header class="adm-head"><div><h1>공간대관 계약서</h1><p class="small muted">예약·문의 정보를 불러와 계약서를 채우고 대관자에게 링크를 보냅니다. 대관자가 링크에서 정보를 입력하고 서명하면 ‘서명 완료’로 바뀌며, 같은 링크에서 계약서 PDF와 모임 초대장을 내려받을 수 있습니다.</p></div>' +
    '<div class="row act-head-act"><button class="btn btn-primary btn-sm" type="button" data-ca="new">새 계약서</button><button class="btn btn-light btn-sm" type="button" data-ca="settings">계약서 설정</button><button class="btn btn-light btn-sm" type="button" data-ca="reload">새로고침</button></div></header>' +
    '<div class="act-tiles" id="act-tiles"></div>' +
    '<form class="adm-card act-filter" id="act-filter"><label>상태 <select class="input" name="status"><option value="">전체</option><option value="ready">서명 대기</option><option value="signed">서명 완료</option><option value="void">취소</option></select></label>' +
    '<label class="grow">찾기 <input class="input" name="q" maxlength="40" placeholder="대관자·연락처·계약 번호·예약번호"></label><button class="btn btn-primary" type="submit">조회</button></form>' +
    '<p class="small muted" id="act-status" role="status"></p><div class="act-list" id="act-list"></div>';
  main.appendChild(sec);
  var dr = document.createElement('div'); dr.className = 'adm-drawer act-drawer'; dr.id = 'act-drawer'; dr.hidden = true;
  dr.innerHTML = '<div class="adm-drawer-bg" data-close></div><div class="adm-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="act-d-title"><div class="adm-drawer-head"><h2 id="act-d-title"></h2><button class="btn btn-light btn-sm" type="button" data-close>닫기 ✕</button></div><div class="adm-drawer-body" id="act-d-body"></div></div>';
  document.body.appendChild(dr);
  dr.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) X.closeDrawer(dr, true); });
  function drawer(title) { $('#act-d-title').textContent = title; var b = $('#act-d-body'); b.innerHTML = '<p class="small muted">불러오는 중…</p>'; b.onclick = null; b.oninput = null; b.onchange = null; b.onsubmit = null; if (dr.hidden) X.openDrawer('#act-drawer'); b.scrollTop = 0; return b; }
  var f = $('#act-filter'), S = { cur: '' };

  /* ---------- 목록 ---------- */
  function load() {
    $('#act-status').textContent = '불러오는 중…';
    return A('list?' + new URLSearchParams(new FormData(f)).toString()).then(function (r) {
      $('#act-status').textContent = '';
      $('#act-tiles').innerHTML = [['서명 대기', r.counts.ready], ['서명 완료', r.counts.signed], ['취소', r.counts.void]].map(function (t) { return '<div class="act-tile"><span>' + t[0] + '</span><b>' + t[1] + '<small>건</small></b></div>'; }).join('');
      $('#act-list').innerHTML = r.items.length ? r.items.map(row).join('') : '<div class="adm-card empty small">아직 계약서가 없습니다. ‘새 계약서’로 예약이나 문의를 불러와 만들어 보세요.</div>';
    }, function (e) { $('#act-status').textContent = ''; oops(e); });
  }
  function row(x) {
    var sub = x.status === 'signed' ? '서명 ' + x.signed_at + ' · ' + x.signer : x.status === 'ready' ? (x.viewed_at ? '대관자가 열어 봄 ' + kst(x.viewed_at) : x.sent_at ? '보냄 ' + kst(x.sent_at) + ' · 아직 안 열어 봄' : '아직 보내지 않음') : '취소됨';
    return '<button type="button" class="act-row" data-open="' + esc(x.id) + '"><span class="act-when"><b>' + esc(kd(x.date)) + '</b><small>' + esc((x.start || '') + (x.end ? '~' + x.end : '')) + ' · ' + esc(x.space.replace('메가스팟 ', '')) + '</small></span>' +
      '<span class="act-who"><b>' + esc(x.renter || '-') + (x.rep && x.rep !== x.renter ? ' · ' + esc(x.rep) : '') + '</b><small>' + esc(x.id) + (x.booking_code ? ' · ' + esc(x.booking_code) : '') + (x.event ? ' · ' + esc(x.event) : '') + '</small></span>' +
      '<span class="act-amt"><b>' + esc(won(x.total)) + '</b><small>' + esc(sub) + '</small></span><span class="st ' + (ST[x.status] || '') + '">' + esc(x.status_label) + '</span></button>';
  }

  /* ---------- 새 계약서: 예약·문의 불러오기 ---------- */
  function picker() {
    var body = drawer('새 계약서 — 예약·문의 불러오기'); S.cur = '';
    body.innerHTML = '<div class="adm-card"><p class="small muted">예약이나 문의를 고르면 대관자 정보·이용일·시간·인원·금액이 미리 채워집니다. 채운 뒤 고칠 수 있습니다.</p>' +
      '<form class="act-search" data-search><input class="input" name="q" maxlength="40" placeholder="예약번호·문의번호·이름·연락처"><button class="btn btn-primary" type="submit">찾기</button><button class="btn btn-light" type="button" data-blank>빈 계약서로 시작</button></form></div><div data-results><p class="small muted">불러오는 중…</p></div>';
    var run = function (q) {
      $('[data-results]', body).innerHTML = '<p class="small muted">찾는 중…</p>';
      A('sources?q=' + encodeURIComponent(q || '')).then(function (r) {
        var bk = r.bookings.map(function (b) {
          return '<button type="button" class="act-src" data-bk="' + esc(b.booking_code) + '"><b>' + esc(kd(b.date)) + ' ' + esc(b.start_h != null ? hh(b.start_h) + '~' + hh(b.end_h) : '') + ' · ' + esc(b.name) + '</b><small>' + esc(b.booking_code) + ' · ' + esc(b.space) + ' · ' + esc(phone(b.phone)) + (b.headcount ? ' · ' + b.headcount + '명' : '') + (b.status === 'payment_review' ? ' · 확정 보류' : '') + '</small>' + (b.has_contract ? '<span class="st st-ok">계약서 있음</span>' : '') + '</button>';
        }).join('');
        var iq = r.inquiries.map(function (q) {
          return '<button type="button" class="act-src" data-iq="' + esc(q.ref) + '"><b>' + esc(q.date ? kd(q.date) : '날짜 미정') + ' · ' + esc(q.name || '') + (q.org ? ' (' + esc(q.org) + ')' : '') + '</b><small>' + esc(q.ref) + ' · ' + esc(q.space || '') + ' · ' + esc(phone(q.phone)) + ' · ' + esc(q.status || '') + '</small></button>';
        }).join('');
        $('[data-results]', body).innerHTML = '<div class="adm-card"><h3>예약 ' + (q ? '' : '(다가오는 확정 예약)') + '</h3><div class="act-srcs">' + (bk || '<p class="small muted">맞는 예약이 없습니다.</p>') + '</div></div>' +
          '<div class="adm-card"><h3>문의 ' + (q ? '' : '(최근 45일)') + '</h3><div class="act-srcs">' + (iq || '<p class="small muted">맞는 문의가 없습니다.</p>') + '</div></div>';
      }, oops);
    };
    body.onsubmit = function (e) { e.preventDefault(); run($('[data-search] input', body).value.trim()); };
    body.onclick = function (e) {
      var b = e.target.closest('[data-bk],[data-iq],[data-blank]'); if (!b) return;
      var path = b.dataset.bk ? 'prefill?booking_code=' + encodeURIComponent(b.dataset.bk) : b.dataset.iq ? 'prefill?inquiry_ref=' + encodeURIComponent(b.dataset.iq) : 'prefill';
      A(path).then(function (r) {
        if (r.existing && !window.confirm('이 예약에는 이미 계약서(' + r.existing + ')가 있습니다. 그 계약서를 열까요?')) return;
        if (r.existing) return open(r.existing);
        if (!r.data.event && r.data.purpose && PURPOSE[r.data.purpose]) r.data.event = PURPOSE[r.data.purpose];
        form(null, r.data, r.inquiry_ref);
      }, oops);
    };
    run('');
  }

  /* ---------- 계약서 쓰기·고치기 ---------- */
  function form(id, d, inquiryRef) {
    var body = drawer(id ? '계약서 고치기 · ' + id : '새 계약서'); S.cur = id || '';
    var r = d.renter || {}, fe = d.fee || {}, bank = fe.bank || C.BANK;
    var inp = function (name, label, val, attrs, cls) { return '<label class="' + (cls || '') + '">' + label + '<input class="input" name="' + name + '" value="' + esc(val == null ? '' : val) + '" ' + (attrs || '') + '></label>'; };
    var num = function (name, label, val, unit) { return '<label>' + label + '<span class="act-unit"><input class="input" name="' + name + '" inputmode="numeric" value="' + esc(val ? Number(val).toLocaleString('ko-KR') : '') + '" data-money><em>' + (unit || '원') + '</em></span></label>'; };
    var checks = function (name, list, on) { return '<div class="act-checks">' + list.map(function (x) { return '<label><input type="checkbox" name="' + name + '" value="' + x[0] + '"' + ((on || []).indexOf(x[0]) >= 0 ? ' checked' : '') + '> ' + esc(x[1]) + '</label>'; }).join('') + '</div>'; };
    body.innerHTML = '<form class="act-form" data-cf novalidate>' +
      '<div class="adm-card"><h3>1. 대관자 <small class="muted">대관자가 서명할 때 고칠 수 있습니다</small></h3><div class="act-2">' +
      inp('r_name', '상호·성명 <span class="req">*</span>', r.name, 'maxlength="60"') + inp('r_rep', '대표자·담당자', r.rep, 'maxlength="40"') + inp('r_bizno', '사업자등록번호', r.bizno, 'maxlength="20"') + inp('r_phone', '연락처', r.phone, 'maxlength="20" type="tel"') +
      inp('r_email', '이메일', r.email, 'maxlength="80" type="email"') + inp('r_address', '주소', r.address, 'maxlength="120"') + '</div></div>' +
      '<div class="adm-card"><h3>2. 대관 내용</h3><div class="act-checks">' + Object.keys(C.SPACES).map(function (k) { return '<label><input type="radio" name="space" value="' + k + '"' + (d.space === k ? ' checked' : '') + '> ' + esc(C.SPACES[k]) + '</label>'; }).join('') + '</div>' +
      '<div class="act-3">' + inp('date', '이용일 <span class="req">*</span>', d.date, 'type="date"') + inp('start', '시작 <span class="req">*</span>', d.start, 'type="time" step="1800"') + inp('end', '끝 <span class="req">*</span>', d.end, 'type="time" step="1800"') + '</div>' +
      '<div class="act-3">' + inp('event', '행사명·목적', d.event, 'maxlength="80"', 'span2') + inp('headcount', '계약 인원', d.headcount || '', 'inputmode="numeric" maxlength="5"') + '</div>' +
      inp('booking_code', '예약번호', d.booking_code, 'maxlength="20" autocapitalize="characters"') + '<p class="small muted" data-hours></p></div>' +
      '<div class="adm-card"><h3>3. 대관료와 결제</h3><div class="act-3">' + num('f_space', '공간 이용료', fe.space) +
      '<label>요금 방식<select class="input" name="f_type"><option value="hourly"' + (fe.type !== 'package' ? ' selected' : '') + '>시간제</option><option value="package"' + (fe.type === 'package' ? ' selected' : '') + '>패키지</option></select></label>' + inp('f_pkg', '패키지 이름', fe.pkg, 'maxlength="40"') + '</div>' +
      '<div class="act-3">' + num('f_base', '기본 포함 인원', fe.base_people, '명') + num('f_extra', '초과 인원', fe.extra_people, '명') + '<label>추가 인원 금액<output class="input act-out" data-extra></output></label></div>' +
      '<div class="act-3">' + num('f_opt', '부가 옵션 금액', fe.options_amount) + num('f_discount', '할인·협찬', fe.discount) + num('f_security', '이용 보증금', fe.security == null ? C.SECURITY : fe.security) + '</div>' +
      '<p class="small" style="margin:10px 0 4px">부가 옵션</p>' + checks('f_options', C.OPTIONS, fe.options) + inp('f_options_etc', '기타 옵션 내용', fe.options_etc, 'maxlength="40"') +
      '<div class="act-3">' + num('f_deposit', '예약금', fe.deposit) + inp('f_deposit_date', '예약금 결제일', fe.deposit_date, 'type="date"') + num('f_balance_days', '잔금 기한 (이용일 며칠 전)', fe.balance_days, '일 전') + '</div>' +
      '<div class="act-total" data-total></div>' +
      '<p class="small" style="margin:10px 0 4px">결제 방법</p>' + checks('f_methods', C.METHODS, fe.methods) +
      '<div class="act-3">' + inp('b_bank', '입금 은행', bank.bank, 'maxlength="20"') + inp('b_number', '계좌번호', bank.number, 'maxlength="30"') + inp('b_holder', '예금주', bank.holder, 'maxlength="40"') + '</div></div>' +
      '<div class="adm-card"><h3>5. 특약 사항</h3><textarea class="input" name="special" rows="3" maxlength="1000" placeholder="없으면 비워 두세요. 특약은 계약 조항보다 우선합니다.">' + esc(d.special || '') + '</textarea>' +
      '<p class="small muted">4. 계약 조항과 6. 서명란은 정해진 양식이 그대로 들어갑니다. 계약일은 대관자가 서명한 날로 적힙니다.</p></div>' +
      '<p class="small act-err" data-err role="alert"></p><div class="act-sticky"><button class="btn btn-primary" type="submit">' + (id ? '고친 내용 저장' : '계약서 만들기') + '</button>' + (id ? '<button class="btn btn-light" type="button" data-back>취소</button>' : '') + '</div></form>';
    var fm = $('[data-cf]', body);
    var val = function () {
      var v = fm.elements, m = function (n) { return Number(String(v[n].value).replace(/[^\d]/g, '')) || 0; }, all = function (n) { return $$('input[name="' + n + '"]:checked', fm).map(function (x) { return x.value; }); };
      return { renter: { name: v.r_name.value.trim(), rep: v.r_rep.value.trim(), bizno: v.r_bizno.value.trim(), phone: v.r_phone.value.trim(), email: v.r_email.value.trim(), address: v.r_address.value.trim() },
        space: (fm.querySelector('input[name=space]:checked') || {}).value || '', date: v.date.value, start: v.start.value, end: v.end.value, event: v.event.value.trim(), headcount: m('headcount'), booking_code: v.booking_code.value.trim().toUpperCase(),
        fee: { space: m('f_space'), type: v.f_type.value, pkg: v.f_pkg.value.trim(), base_people: m('f_base'), extra_people: m('f_extra'), options_amount: m('f_opt'), discount: m('f_discount'), security: m('f_security'),
          options: all('f_options'), options_etc: v.f_options_etc.value.trim(), deposit: m('f_deposit'), deposit_date: v.f_deposit_date.value, balance_days: m('f_balance_days'), methods: all('f_methods'),
          bank: { bank: v.b_bank.value.trim(), number: v.b_number.value.trim(), holder: v.b_holder.value.trim() } }, special: v.special.value };
    };
    var calc = function () {
      var v = val(), t = C.totals(v.fee), h = C.hours(v.start, v.end);
      $('[data-extra]', fm).textContent = won(t.extra_amount);
      $('[data-total]', fm).innerHTML = '<span>대관료 합계 <b>' + won(t.total) + '</b> <small>(부가세 포함)</small></span><span>잔금 <b>' + (t.paid_full ? '해당 없음' : won(t.balance)) + '</b></span><span>보증금 <b>' + won(v.fee.security) + '</b> <small>별도</small></span>';
      $('[data-hours]', fm).textContent = h != null ? '총 ' + h + '시간' + (v.end && v.start && v.end <= v.start ? ' (끝 시각은 다음 날)' : '') : '';
      fm.elements.f_pkg.disabled = v.fee.type !== 'package';
    };
    body.oninput = function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-money')) { var raw = e.target.value.replace(/[^\d]/g, ''); e.target.value = raw ? Number(raw).toLocaleString('ko-KR') : ''; }
      calc();
    };
    body.onchange = calc; calc();
    body.onclick = function (e) { if (e.target.closest('[data-back]')) open(id); };
    fm.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = val(), errEl = $('[data-err]', fm), btn = fm.querySelector('button[type=submit]');
      if (!v.renter.name) { errEl.textContent = '대관자 상호·성명을 적어 주세요.'; fm.elements.r_name.focus(); return; }
      if (!v.space) { errEl.textContent = '대관 공간을 골라 주세요.'; return; }
      if (!v.date || !v.start || !v.end) { errEl.textContent = '이용일과 이용 시간을 적어 주세요.'; return; }
      errEl.textContent = ''; btn.disabled = true;
      A('save', { id: id || undefined, data: v, inquiry_ref: inquiryRef || undefined }).then(function (j) {
        M.toast(id ? '계약서를 고쳤습니다.' : '계약서를 만들었습니다. 이제 대관자에게 보내 주세요.'); load(); open(j.id);
      }, function (er) { btn.disabled = false; errEl.textContent = er.message; if (X.guard(er)) return; });
    });
  }

  /* ---------- 계약서 1건 ---------- */
  function open(id) {
    S.cur = id; var body = drawer('공간대관 계약서 · ' + id);
    return A('detail?id=' + encodeURIComponent(id)).then(function (d) { if (S.cur !== id) return; draw(body, d); }, function (e) { body.innerHTML = '<p class="small">' + esc(e.message) + '</p>'; oops(e); });
  }
  function logHtml(list) {
    if (!list || !list.length) return '<p class="small muted">아직 카카오톡으로 보낸 기록이 없습니다.</p>';
    return '<ul class="act-log">' + list.map(function (m) { return '<li><span>' + esc(kst(m.created_at)) + '</span><span>' + esc(m.receiver_mask) + '</span><span class="st ' + (m.status === 'failed' ? 'st-cancel' : m.status === 'accepted' ? 'st-ok' : 'st-pay') + '">' + esc(SENT[m.status] || m.status) + '</span>' + (m.error ? '<small>' + esc(m.error) + '</small>' : '') + '</li>'; }).join('') + '</ul>';
  }
  function draw(body, d) {
    var c = d.contract, data = c.data, r = data.renter || {}, t = c.totals, link = abs(d.link), k = d.kakao;
    var msg = (r.rep || r.name || '') + '님, 메가스팟 공간대관 계약서를 보내드립니다.\n' + (C.SPACES[data.space] || '') + ' · ' + (C.dateText(data.date) || '') + '\n아래 링크에서 내용을 확인하고 대관자 정보 입력과 서명을 마쳐 주세요. 서명 후 같은 화면에서 계약서 PDF를 내려받을 수 있습니다.\n' + link;
    var head = '<div class="adm-card act-sum"><div><span class="st ' + (ST[c.status] || '') + '">' + esc(c.status_label) + '</span><h3>' + esc(r.name || '-') + (r.rep && r.rep !== r.name ? ' · ' + esc(r.rep) : '') + '</h3>' +
      '<p class="small muted">' + esc(C.SPACES[data.space] || '') + ' · ' + esc(C.dateText(data.date)) + ' ' + esc(data.start + '~' + data.end) + (data.booking_code ? ' · 예약 ' + esc(data.booking_code) : '') + (c.inquiry_ref ? ' · 문의 ' + esc(c.inquiry_ref) : '') + '</p></div>' +
      '<div class="act-sum-amt"><b>' + esc(won(t.total)) + '</b><span>예약금 ' + esc(won(data.fee.deposit)) + ' · 잔금 ' + esc(t.paid_full ? '없음' : won(t.balance)) + '</span></div></div>';
    var stateLine = c.status === 'signed' ? '<div class="adm-card act-signed"><h3>서명 완료</h3><dl><div><dt>서명한 분</dt><dd>' + esc(c.signed.signer) + '</dd></div><div><dt>서명 시각</dt><dd>' + esc(c.signed.at) + '</dd></div><div><dt>접속 IP</dt><dd>' + esc(c.signed_ip || '-') + '</dd></div><div><dt>문서 확인값</dt><dd><code>' + esc(String(c.signed.hash).slice(0, 32)) + '</code></dd></div></dl>' +
        '<div class="act-acts"><a class="btn btn-dark btn-sm" href="' + esc(link) + '" target="_blank" rel="noopener">계약서 보기·PDF 내려받기 ↗</a><button type="button" class="btn btn-light btn-sm" data-copy="' + esc(link) + '">링크 복사</button><button type="button" class="btn btn-light btn-sm act-danger" data-void>계약 취소 처리</button></div></div>'
      : c.status === 'void' ? '<div class="adm-card"><p class="small">취소한 계약서입니다. 링크를 열면 ‘취소된 계약서’로 보입니다.</p></div>'
      : '<div class="adm-card"><h3>대관자에게 보내기</h3><p class="small muted">' + (c.viewed_at ? '대관자가 ' + esc(kst(c.viewed_at)) + '에 처음 열어 봤습니다.' : c.sent_at ? esc(kst(c.sent_at)) + '에 보냈고 아직 열어 보지 않았습니다.' : '아직 보내지 않았습니다.') + '</p>' +
        '<div class="act-link"><code>' + esc(link) + '</code><button type="button" class="btn btn-light btn-sm" data-copy="' + esc(link) + '" data-mark>링크 복사</button></div>' +
        '<div class="act-acts"><button type="button" class="btn btn-light btn-sm" data-copymsg>안내 문구와 함께 복사</button><a class="btn btn-light btn-sm" href="' + esc(link) + '" target="_blank" rel="noopener">고객 화면 미리 보기 ↗</a><button type="button" class="btn btn-light btn-sm" data-edit>내용 고치기</button><button type="button" class="btn btn-light btn-sm" data-relink>링크 다시 만들기</button><button type="button" class="btn btn-light btn-sm act-danger" data-void>계약서 취소</button></div>' +
        '<div class="act-grid"><div class="act-box"><h4>카카오톡 (알림톡)</h4>' + (k.admin_ready && d.recipients.length ? '<div class="act-recips">' + d.recipients.map(function (x, i) { return '<label><input type="checkbox" name="to" value="' + esc(x.phone) + '"' + (i ? '' : ' checked') + '> ' + esc(phone(x.phone)) + ' <small class="muted">' + esc(x.label) + '</small></label>'; }).join('') + '</div><button type="button" class="btn btn-primary btn-sm" data-kakao>카카오톡 보내기</button>'
          : '<p class="small muted">' + (!d.recipients.length ? '보낼 수 있는 휴대폰 번호가 없습니다.' : '카카오톡 계약서 템플릿 준비가 끝나지 않았습니다. ‘계약서 설정’에서 승인·시험을 마치면 보낼 수 있습니다. 그전에는 링크를 복사해 카카오톡 채널 대화방에 붙여 넣어 주세요.') + '</p>') +
        '<p class="small" data-kmsg role="status"></p>' + logHtml(d.messages) + '</div>' +
        '<div class="act-box"><h4>이메일</h4><div class="act-inline"><input class="input" type="email" data-mailto value="' + esc(d.email.to || '') + '" placeholder="받는 사람 이메일"></div>' +
        (d.email.ready ? '<button type="button" class="btn btn-light btn-sm" data-email>이메일 보내기</button>' : '<button type="button" class="btn btn-light btn-sm" data-mailapp>메일 프로그램으로 보내기</button><p class="small muted">Cloudflare에 RESEND_API_KEY·MAIL_FROM을 넣으면 여기서 바로 보냅니다.</p>') + '<p class="small" data-emsg role="status"></p></div></div></div>';
    body.innerHTML = head + stateLine + '<div class="adm-card"><h3>계약서 미리보기</h3><div class="act-paper">' + C.html(Object.assign({}, data, { id: c.id }), { signature: c.signature, signed_at: c.signed && c.signed.at, signer: c.signed && c.signed.signer, hash: c.signed && c.signed.hash, draft: c.status === 'ready' }) + '</div></div>';
    body.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-copy')) { copy(b.dataset.copy, '링크를 복사했습니다.'); if (b.hasAttribute('data-mark')) A('sent', { id: c.id }).then(load, function () {}); return; }
      if (b.hasAttribute('data-copymsg')) { copy(msg, '안내 문구를 복사했습니다. 카카오톡 채널 대화방이나 문자에 붙여 넣어 주세요.'); A('sent', { id: c.id }).then(load, function () {}); return; }
      if (b.hasAttribute('data-edit')) { form(c.id, data, c.inquiry_ref); return; }
      if (b.hasAttribute('data-relink')) { if (!window.confirm('새 링크를 만들면 지금까지 보낸 링크는 열리지 않습니다. 새 링크를 만들까요?')) return; A('relink', { id: c.id }).then(function () { M.toast('새 링크를 만들었습니다. 대관자에게 다시 보내 주세요.'); open(c.id); load(); }, oops); return; }
      if (b.hasAttribute('data-void')) { if (!window.confirm(c.status === 'signed' ? '서명을 마친 계약서를 취소 처리할까요? 대관자 화면에도 ‘취소’로 보입니다.' : '이 계약서를 취소할까요? 보낸 링크는 ‘취소된 계약서’로 열립니다.')) return; A('void', { id: c.id }).then(function () { M.toast('취소 처리했습니다.'); open(c.id); load(); }, oops); return; }
      if (b.hasAttribute('data-kakao')) {
        var to = $$('input[name=to]:checked', body).map(function (x) { return x.value; }); if (!to.length) { M.toast('보낼 번호를 골라 주세요.'); return; }
        if (!window.confirm(to.map(phone).join(', ') + ' 번호로 계약서 카카오톡을 보낼까요?')) return;
        b.disabled = true; var km = $('[data-kmsg]', body); km.textContent = '보내는 중…';
        A('send', { id: c.id, channel: 'kakao', receivers: to }).then(function (j) { b.disabled = false; km.textContent = j.results.map(function (x) { return x.receiver + ' ' + (SENT[x.status] || x.status) + (x.note ? ' — ' + x.note : ''); }).join(' / '); load(); }, function (er) { b.disabled = false; km.textContent = er.message; oops(er); });
        return;
      }
      if (b.hasAttribute('data-email')) {
        var addr = $('[data-mailto]', body).value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { M.toast('이메일 주소를 확인해 주세요.'); return; }
        if (!window.confirm(addr + ' 로 계약서 링크를 보낼까요?')) return;
        b.disabled = true; var em = $('[data-emsg]', body); em.textContent = '보내는 중…';
        A('send', { id: c.id, channel: 'email', to: addr }).then(function (j) { b.disabled = false; em.textContent = j.results.map(function (x) { return x.receiver + ' ' + (SENT[x.status] || x.status) + (x.note ? ' — ' + x.note : ''); }).join(' / '); load(); }, function (er) { b.disabled = false; em.textContent = er.message; oops(er); });
        return;
      }
      if (b.hasAttribute('data-mailapp')) {
        var to2 = $('[data-mailto]', body).value.trim();
        location.href = 'mailto:' + encodeURIComponent(to2) + '?subject=' + encodeURIComponent('[메가스팟] 공간대관 계약서 확인·서명 안내 (' + c.id + ')') + '&body=' + encodeURIComponent(msg);
        A('sent', { id: c.id }).then(load, function () {});
      }
    };
  }

  /* ---------- 계약서 설정 ---------- */
  function settings() {
    var body = drawer('계약서 설정'); S.cur = '';
    Promise.all([A('settings'), A('kakao')]).then(function (r) { drawSettings(body, r[0], r[1]); }, function (e) { body.innerHTML = '<p class="small">' + esc(e.message) + '</p>'; oops(e); });
  }
  function step(n, done, title, html) { return '<li class="' + (done ? 'done' : '') + '"><span class="no">' + (done ? '✓' : n) + '</span><div><b>' + title + '</b>' + html + '</div></li>'; }
  function drawSettings(body, s, k) {
    var op = s.operator, bk = s.bank, t = k.template;
    var inp = function (name, label, val, attrs) { return '<label>' + label + '<input class="input" name="' + name + '" value="' + esc(val || '') + '" ' + (attrs || '') + '></label>'; };
    body.innerHTML = '<form class="adm-card act-form" data-sf><h3>운영자 정보 <small class="muted">새로 만드는 계약서에 들어갑니다</small></h3><div class="act-2">' +
      inp('o_name', '상호', op.name, 'maxlength="60"') + inp('o_rep', '대표자 (표시)', op.rep, 'maxlength="40"') + inp('o_rep_name', '서명란 대표 이름', op.rep_name, 'maxlength="20"') + inp('o_bizno', '사업자등록번호', op.bizno, 'maxlength="20"') +
      inp('o_address', '주소', op.address, 'maxlength="120"') + inp('o_phone', '연락처', op.phone, 'maxlength="20"') + inp('o_email', '이메일', op.email, 'maxlength="80"') + '</div>' +
      '<h3 style="margin-top:14px">입금 계좌 · 기본값</h3><div class="act-3">' + inp('b_bank', '은행', bk.bank, 'maxlength="20"') + inp('b_number', '계좌번호', bk.number, 'maxlength="30"') + inp('b_holder', '예금주', bk.holder, 'maxlength="40"') + '</div>' +
      '<div class="act-3">' + inp('balance_days', '잔금 기한 기본값 (이용일 며칠 전)', s.balance_days, 'inputmode="numeric" maxlength="2"') + '</div>' +
      '<p class="small" style="margin:6px 0 4px">기본 결제 방법</p><div class="act-checks">' + C.METHODS.map(function (x) { return '<label><input type="checkbox" name="methods" value="' + x[0] + '"' + (s.methods.indexOf(x[0]) >= 0 ? ' checked' : '') + '> ' + esc(x[1]) + '</label>'; }).join('') + '</div>' +
      '<div class="act-sticky"><button class="btn btn-primary" type="submit">설정 저장</button></div></form>' +
      '<div class="adm-card"><h3>운영자 도장·서명</h3><p class="small muted">계약서 운영자 서명란의 ‘(인)’ 자리에 들어갑니다. 아래 칸에 직접 쓰거나, 배경이 투명한 PNG 도장 이미지를 올려 주세요.</p>' +
      '<div class="act-seal"><div class="act-seal-now">' + (s.seal ? '<img src="' + esc(s.seal) + '" alt="지금 쓰는 도장">' : '<span class="muted small">아직 없음 · (인)으로 표시</span>') + '</div>' +
      '<div class="act-pad"><canvas data-seal-pad aria-label="도장·서명 칸"></canvas></div></div><div class="act-acts"><button type="button" class="btn btn-light btn-sm" data-seal-clear>다시 쓰기</button><button type="button" class="btn btn-primary btn-sm" data-seal-save>쓴 서명 저장</button>' +
      '<label class="btn btn-light btn-sm act-file">PNG 올리기<input type="file" accept="image/png" data-seal-file hidden></label>' + (s.seal ? '<button type="button" class="btn btn-light btn-sm act-danger" data-seal-del>도장 지우기</button>' : '') + '</div></div>' +
      '<div class="adm-card"><h3>카카오톡으로 계약서 보내기</h3><p class="small muted">대관자 번호로 계약서 링크를 알림톡으로 보내려면 아래 순서가 필요합니다. 준비 전에도 링크 복사·이메일로 보낼 수 있습니다.</p><ol class="aiv-steps">' +
      step(1, !!k.code, '알리고에 템플릿 등록', '<p class="small muted">알리고 → 카카오톡 → 템플릿 등록에서 아래 본문과 버튼을 그대로 넣고 검수를 요청합니다. 템플릿 이름: <b>' + esc(t.name) + '</b></p><pre class="aiv-tpl">' + esc(t.content) + '</pre><button type="button" class="btn btn-light btn-sm" data-copy-tpl>본문 복사</button>' +
        '<table class="aiv-btns"><thead><tr><th>버튼 이름</th><th>모바일·PC 링크</th></tr></thead><tbody>' + t.buttons.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td><code>' + esc(x.linkMo) + '</code></td></tr>'; }).join('') + '</tbody></table>') +
      step(2, !!k.code, '연결 서버에 코드 허용', '<p class="small muted">승인 코드를 알리고 연결 서버 환경 변수 <code>' + esc(k.relay_env) + '</code>에 쉼표로 덧붙이고 다시 시작합니다.</p>') +
      step(3, !!k.code, '템플릿 코드 저장', '<div class="aiv-inline"><input class="input" id="act-kcode" maxlength="30" placeholder="UN_0000" value="' + esc(k.code || '') + '"><button type="button" class="btn btn-light btn-sm" data-k="save">저장</button></div>') +
      step(4, k.approved, '승인 확인', '<button type="button" class="btn btn-light btn-sm" data-k="check"' + (k.code ? '' : ' disabled') + '>승인 확인</button><p class="small" data-kcheck></p>') +
      step(5, k.tested, '운영자 번호로 시험 발송', '<div class="aiv-inline"><input class="input" id="act-ktest" type="tel" maxlength="20" placeholder="운영자 휴대폰 번호"><button type="button" class="btn btn-light btn-sm" data-k="test"' + (k.approved && k.live ? '' : ' disabled') + '>시험 발송</button><button type="button" class="btn btn-light btn-sm" data-k="confirm"' + (k.approved ? '' : ' disabled') + '>받았어요</button></div><p class="small" data-ktest></p>' + (k.live ? '' : '<p class="small act-err">서버의 알림톡 발송(ALIGO_LIVE_ENABLED)이 꺼져 있습니다.</p>')) +
      '</ol><p class="small ' + (k.admin_ready ? '' : 'muted') + '">' + (k.admin_ready ? '준비 완료 — 계약서 화면에서 카카오톡 보내기를 쓸 수 있습니다.' : '준비 전') + '</p></div>' +
      '<div class="adm-card"><h3>이메일</h3><p class="small muted">' + (s.email.ready ? '이메일 발송 사용 중 · 보내는 주소 ' + esc(s.email.from) : '이메일 발송 설정이 없습니다. Cloudflare 환경 변수 RESEND_API_KEY와 MAIL_FROM을 넣으면 계약서 화면에서 바로 보낼 수 있습니다. 그전에는 ‘메일 프로그램으로 보내기’를 씁니다.') + '</p></div>';
    var pad = window.SignPad ? window.SignPad($('[data-seal-pad]', body), { color: '#C0262D', width: 3 }) : null;
    var again = function () { settings(); };
    body.onsubmit = function (e) {
      e.preventDefault(); var v = e.target.elements;
      A('settings', { operator: { name: v.o_name.value, rep: v.o_rep.value, rep_name: v.o_rep_name.value, bizno: v.o_bizno.value, address: v.o_address.value, phone: v.o_phone.value, email: v.o_email.value, company: op.company },
        bank: { bank: v.b_bank.value, number: v.b_number.value, holder: v.b_holder.value }, balance_days: Number(v.balance_days.value) || 0, methods: $$('input[name=methods]:checked', e.target).map(function (x) { return x.value; }) })
        .then(function () { M.toast('설정을 저장했습니다. 새로 만드는 계약서부터 들어갑니다.'); again(); }, oops);
    };
    body.onchange = function (e) {
      var fi = e.target.closest('[data-seal-file]'); if (!fi || !fi.files[0]) return;
      var file = fi.files[0]; if (file.type !== 'image/png' || file.size > 130000) { M.toast('130KB 이하 PNG 파일만 올릴 수 있습니다.'); return; }
      var rd = new FileReader(); rd.onload = function () { A('seal', { image: rd.result }).then(function () { M.toast('도장 이미지를 저장했습니다.'); again(); }, oops); }; rd.readAsDataURL(file);
    };
    body.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-copy-tpl')) { copy(t.content, '템플릿 본문을 복사했습니다.'); return; }
      if (b.hasAttribute('data-seal-clear') && pad) { pad.clear(); return; }
      if (b.hasAttribute('data-seal-save')) { if (!pad || pad.isEmpty()) { M.toast('칸 안에 서명이나 도장을 그려 주세요.'); return; } A('seal', { image: pad.toDataURL() }).then(function () { M.toast('운영자 서명을 저장했습니다.'); again(); }, oops); return; }
      if (b.hasAttribute('data-seal-del')) { if (!window.confirm('도장 이미지를 지울까요? 계약서에는 (인)으로 표시됩니다.')) return; A('seal', { image: '' }).then(again, oops); return; }
      var a = b.dataset.k; if (!a) return; b.disabled = true;
      if (a === 'save') A('kakao', { action: 'save', code: $('#act-kcode', body).value.trim() }).then(function () { M.toast('저장했습니다.'); again(); }, function (er) { b.disabled = false; oops(er); });
      if (a === 'check') A('kakao', { action: 'check' }).then(function (r) { settings(); setTimeout(function () { var p = $('[data-kcheck]'); if (p) p.textContent = r.check.message; }, 400); }, function (er) { b.disabled = false; oops(er); });
      if (a === 'test') A('kakao', { action: 'test', receiver: $('#act-ktest', body).value }).then(function (r) { settings(); setTimeout(function () { var p = $('[data-ktest]'); if (p) p.textContent = '시험 메시지 ' + (SENT[r.result.status] || r.result.status) + '. 받으셨으면 ‘받았어요’를 눌러 주세요.'; }, 400); }, function (er) { b.disabled = false; var p = $('[data-ktest]', body); if (p) p.textContent = er.message; if (X.guard(er)) return; });
      if (a === 'confirm') A('kakao', { action: 'confirm' }).then(function () { M.toast('시험 수신을 확인했습니다. 이제 계약서를 카카오톡으로 보낼 수 있습니다.'); again(); }, function (er) { b.disabled = false; var p = $('[data-ktest]', body); if (p) p.textContent = er.message; if (X.guard(er)) return; });
    };
  }

  /* ---------- 이벤트 ---------- */
  f.addEventListener('submit', function (e) { e.preventDefault(); load(); });
  sec.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]'); if (b) { open(b.dataset.open); return; }
    var a = e.target.closest('[data-ca]'); if (!a) return;
    if (a.dataset.ca === 'new') picker();
    if (a.dataset.ca === 'settings') settings();
    if (a.dataset.ca === 'reload') load();
  });
  X.register('contracts', load);
})();
