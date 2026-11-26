/* 관리자 · 모임 초대장 (2026-11-24)
   확정 예약의 모임 초대장을 대신 만들고, 예약자 번호로 카카오톡(알림톡)을 보내거나 PDF·이미지로 내려받습니다.
   · 고객은 /invite/new/ 에서 이용 날짜·예약자 연락처로 직접 만들 수 있습니다.
   · 카카오톡은 알리고 템플릿 승인 → 코드 저장 → 승인 확인 → 운영자 시험 수신을 마쳐야 보낼 수 있습니다('카카오톡 설정').
   · 초대장 내용 고치기·응답 명단·삭제는 '주최자 관리 화면'(고객과 같은 화면)에서 합니다.
   서버: /api/invites/admin/* (functions/api/_invites_admin.js) · PDF: assets/js/kit/invite-pdf.js */
(function () {
  'use strict';
  var X = window.MEGASPOT_ADMIN, M = window.MEGASPOT; if (!X || !M) return;
  var main = document.querySelector('.adm-main'); if (!main) return;
  var esc = X.esc, P = window.KitInvitePrint;
  function $(s, r) { return (r || document).querySelector(s); }
  function A(path, body) { return M.api('/invites/admin/' + path, body ? { method: 'POST', body: body } : {}); }
  function oops(e) { if (X.guard(e)) return; M.toast((e && e.message) || '처리하지 못했습니다.'); }
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function kd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? +m[2] + '/' + +m[3] + ' (' + WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + ')' : ''; }
  function full(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? +m[1] + '년 ' + +m[2] + '월 ' + +m[3] + '일 (' + WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + ')' : ''; }
  function hh(h) { h = Number(h); if (h == null || !isFinite(h)) return ''; var x = h % 24, s = ('0' + Math.floor(x)).slice(-2) + ':' + (x % 1 ? '30' : '00'); return h >= 24 ? '다음 날 ' + s : s; }
  function range(s, e) { return s == null ? '시간 미정' : hh(s) + (e != null ? '~' + hh(e) : ''); }
  function phone(p) { p = String(p || '').replace(/\D/g, ''); return p.length === 11 ? p.slice(0, 3) + '-' + p.slice(3, 7) + '-' + p.slice(7) : p.length === 10 ? p.slice(0, 3) + '-' + p.slice(3, 6) + '-' + p.slice(6) : p; }
  function kst(ts) { var t = Date.parse(String(ts || '').replace(' ', 'T') + 'Z'); return isFinite(t) ? new Date(t + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : ''; }
  function today() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
  function plus(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function dday(d) { var n = Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')) / 864e5); return n > 0 ? 'D-' + n : n === 0 ? '오늘' : '지남'; }
  function abs(u) { return /^https?:/.test(u) ? u : location.origin + u; }
  var THEMES = { chalk: '밝은 기본', cobalt: '코발트', graphite: '차분한 저녁', rust: '따뜻한 오렌지' };
  var SENT = { sending: '보내는 중', accepted: '알리고 접수', failed: '실패', unknown: '결과 확인 필요', skipped: '건너뜀' };
  var ACTOR = { admin: '관리자', host: '예약자 직접', customer: '예약자 직접', test: '운영자 시험' };

  /* ---------- 화면 틀 ---------- */
  var sec = document.createElement('section'); sec.className = 'adm-view aiv-view'; sec.id = 'view-invites'; sec.hidden = true;
  sec.innerHTML = '<header class="adm-head"><div><h1>모임 초대장</h1><p class="small muted">확정 예약의 모임 초대장을 대신 만들고, 예약자 번호로 카카오톡을 보내거나 PDF로 내려받습니다. 고객은 초대장 만들기 화면에서 이용 날짜·예약자 연락처로 직접 만들 수 있습니다.</p></div>' +
    '<div class="row aiv-head-act"><a class="btn btn-light btn-sm" href="/invite/new/" target="_blank" rel="noopener">고객 초대장 만들기 화면 ↗</a><button class="btn btn-light btn-sm" type="button" data-ia="kakao">카카오톡 설정</button><button class="btn btn-light btn-sm" type="button" data-ia="reload">새로고침</button></div></header>' +
    '<div class="aiv-kakao" id="aiv-kakao"></div>' +
    '<form class="adm-card aiv-filter" id="aiv-filter"><label>이용일 <input class="input" type="date" name="from"></label><span class="muted">~</span><label><span class="sr-only">끝 날짜</span><input class="input" type="date" name="to"></label>' +
    '<label>초대장 <select class="input" name="has"><option value="">전체</option><option value="without">아직 안 만든 예약</option><option value="with">만든 예약</option></select></label>' +
    '<label class="grow">찾기 <input class="input" name="q" maxlength="40" placeholder="예약자·연락처·예약번호·모임 이름"></label><button class="btn btn-primary" type="submit">조회</button></form>' +
    '<div class="aiv-tiles" id="aiv-tiles"></div><p class="small muted" id="aiv-status" role="status"></p><div class="aiv-list" id="aiv-list"></div>';
  main.appendChild(sec);
  var dr = document.createElement('div'); dr.className = 'adm-drawer aiv-drawer'; dr.id = 'aiv-drawer'; dr.hidden = true;
  dr.innerHTML = '<div class="adm-drawer-bg" data-close></div><div class="adm-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="aiv-d-title"><div class="adm-drawer-head"><h2 id="aiv-d-title"></h2><button class="btn btn-light btn-sm" type="button" data-close>닫기 ✕</button></div><div class="adm-drawer-body" id="aiv-d-body"></div></div>';
  document.body.appendChild(dr);
  dr.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) X.closeDrawer(dr, true); });
  function drawer(title) { $('#aiv-d-title').textContent = title; var b = $('#aiv-d-body'); b.innerHTML = '<p class="small muted">불러오는 중…</p>'; if (dr.hidden) X.openDrawer('#aiv-drawer'); b.scrollTop = 0; return b; }

  var S = { kakao: null, items: [], current: '' };
  var f = $('#aiv-filter');
  f.from.value = today(); f.to.value = plus(today(), 60);

  /* ---------- 카카오톡 준비 상태 띠 ---------- */
  function kakaoBar() {
    var k = S.kakao, el = $('#aiv-kakao'); if (!k) { el.innerHTML = ''; return; }
    var on = k.admin_ready;
    var why = !k.code ? '알리고에 초대장 템플릿을 등록·승인받은 뒤 코드를 저장해 주세요.' : !k.approved ? '템플릿 승인 확인이 필요합니다.' : !k.tested ? '운영자 번호로 시험 발송해 받아 본 뒤 ‘받았어요’를 눌러 주세요.' : !k.live ? '서버의 알림톡 발송(ALIGO_LIVE_ENABLED)이 꺼져 있습니다.' : '';
    el.innerHTML = '<div class="aiv-kbar ' + (on ? 'on' : '') + '"><span class="dot" aria-hidden="true"></span><div><b>카카오톡 보내기 ' + (on ? '사용 중' : '준비 전') + '</b><small>' +
      (on ? '예약자 번호로 보낼 수 있습니다. 고객이 직접 받기: ' + (k.enabled ? '켜짐' : '꺼짐') : esc(why) + ' 그전까지는 PDF·이미지와 초대장 주소로 안내해 주세요.') + '</small></div><button type="button" class="btn btn-light btn-sm" data-ia="kakao">설정</button></div>';
  }
  function loadKakao() { return A('kakao').then(function (k) { S.kakao = k; kakaoBar(); return k; }, oops); }

  /* ---------- 목록 ---------- */
  function load() {
    var q = new URLSearchParams(new FormData(f));
    $('#aiv-status').textContent = '불러오는 중…';
    return A('list?' + q.toString()).then(function (r) {
      S.items = r.items; $('#aiv-status').textContent = '';
      $('#aiv-tiles').innerHTML = [['예약', r.counts.total, '건'], ['초대장 만든 예약', r.counts.with, '건'], ['카카오톡 보낸 예약', r.counts.sent, '건']].map(function (t) {
        return '<div class="aiv-tile"><span>' + t[0] + '</span><b>' + t[1] + '<small>' + t[2] + '</small></b></div>'; }).join('');
      $('#aiv-list').innerHTML = r.items.length ? r.items.map(row).join('') : '<div class="adm-card empty small">조건에 맞는 확정 예약이 없습니다.</div>';
    }, function (e) { $('#aiv-status').textContent = ''; oops(e); });
  }
  function row(x) {
    var iv = x.invite;
    return '<button type="button" class="aiv-row" data-open="' + esc(x.booking_code) + '">' +
      '<span class="aiv-when"><b>' + esc(kd(x.date)) + '</b><small>' + esc(range(x.start_h, x.end_h)) + ' · ' + esc(dday(x.date)) + '</small></span>' +
      '<span class="aiv-who"><b>' + esc(x.customer_name || '') + '</b><small>' + esc(phone(x.phone)) + ' · ' + esc(x.space_name.replace('메가스팟 ', '')) + ' · ' + esc(x.booking_code) + '</small></span>' +
      '<span class="aiv-inv">' + (iv ? '<b>' + esc(iv.title || '초대장') + '</b><small>응답 ' + iv.rsvp_n + '건 · 참석 ' + iv.people + '명' + (iv.last_sent ? ' · 카카오톡 ' + esc(kst(iv.last_sent)) : '') + '</small>' : '<span class="st st-pay">초대장 없음</span>') + '</span>' +
      '<span class="aiv-go">' + (iv ? '열기' : '만들기') + ' →</span></button>';
  }

  /* ---------- 예약 1건 ---------- */
  function open(code) {
    S.current = code; var body = drawer('모임 초대장 · ' + code);
    return Promise.all([A('detail?booking_code=' + encodeURIComponent(code)), S.kakao ? null : loadKakao()]).then(function (r) {
      if (S.current !== code) return;
      var d = r[0]; S.kakao = d.kakao; kakaoBar();
      body.innerHTML = bookingCard(d.booking) + (d.invite ? inviteHtml(d) : createHtml(d.booking));
      if (d.invite) bindInvite(body, d); else bindCreate(body, d.booking);
    }, function (e) { body.innerHTML = '<p class="small">' + esc(e.message) + '</p>'; oops(e); });
  }
  function bookingCard(b) {
    return '<div class="adm-card aiv-bk"><dl>' +
      '<div><dt>이용</dt><dd><b>' + esc(full(b.date)) + '</b> ' + esc(range(b.start_h, b.end_h)) + '</dd></div>' +
      '<div><dt>공간</dt><dd>' + esc(b.space_name) + (b.headcount ? ' · ' + b.headcount + '명' : '') + '</dd></div>' +
      '<div><dt>예약자</dt><dd>' + esc(b.customer_name) + ' · ' + esc(phone(b.phone)) + (b.phone2 ? ' · 추가 ' + esc(phone(b.phone2)) : '') + '</dd></div>' +
      '<div><dt>예약번호</dt><dd>' + esc(b.code) + (b.live ? '' : ' <span class="st st-cancel">확정 아님</span>') + '</dd></div></dl></div>';
  }
  function createHtml(b) {
    if (!b.live) return '<div class="adm-card"><p class="small">확정된 예약에만 초대장을 만들 수 있습니다.</p></div>';
    if (b.past) return '<div class="adm-card"><p class="small">이미 지난 예약에는 새 초대장을 만들 수 없습니다.</p></div>';
    return '<form class="adm-card aiv-form" id="aiv-create"><h3>초대장 만들기</h3><p class="small muted">날짜·시간·장소·주차 안내는 예약에서 자동으로 들어갑니다. 다 만든 뒤 내용은 주최자 관리 화면에서 고칠 수 있습니다.</p>' +
      '<label>모임 이름 <span class="req">*</span><input class="input" name="title" maxlength="40" required placeholder="예: 2026 송년의 밤"></label>' +
      '<div class="aiv-2"><label>보내는 사람<input class="input" name="host" maxlength="30" value="' + esc(b.customer_name || '') + '"></label><label>입장 시작<input class="input" type="time" name="entry"></label></div>' +
      '<label>인사말<textarea class="input" name="message" rows="3" maxlength="400" placeholder="한 해 동안 고생 많으셨습니다. 편한 차림으로 오세요."></textarea></label>' +
      '<label>일정 <small class="muted">한 줄에 하나씩 · 예: 18:30 저녁 식사</small><textarea class="input" name="schedule" rows="3" maxlength="800"></textarea></label>' +
      '<label>알려 드려요<textarea class="input" name="notice" rows="2" maxlength="400" placeholder="드레스 코드, 준비물, 회비 안내"></textarea></label>' +
      '<label>문의 <small class="muted">초대장을 받은 모든 사람에게 보입니다</small><input class="input" name="contact" maxlength="80"></label>' +
      '<fieldset class="aiv-themes"><legend>초대장 색</legend>' + Object.keys(THEMES).map(function (k, i) { return '<label><input type="radio" name="theme" value="' + k + '"' + (i ? '' : ' checked') + '><span class="sw sw-' + k + '"></span>' + THEMES[k] + '</label>'; }).join('') + '</fieldset>' +
      '<div class="aiv-checks"><label><input type="checkbox" name="rsvp_open" checked> 참석 응답 받기</label><label><input type="checkbox" name="ask_party" checked> 인원 묻기</label><label><input type="checkbox" name="ask_car" checked> 차량 묻기</label></div>' +
      '<p class="small aiv-err" data-err role="alert"></p><button class="btn btn-primary" type="submit">초대장 만들기</button></form>';
  }
  function bindCreate(body, b) {
    var form = $('#aiv-create', body); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = form.elements, btn = form.querySelector('button[type=submit]'), errEl = $('[data-err]', form);
      if (v.title.value.trim().length < 2) { errEl.textContent = '모임 이름을 두 글자 이상 적어 주세요.'; v.title.focus(); return; }
      var schedule = v.schedule.value.split('\n').map(function (l) { var m = /^\s*(\d{1,2}:\d{2})\s*(.*)$/.exec(l); return m ? { time: ('0' + m[1]).slice(-5), text: m[2].trim() } : { time: '', text: l.trim() }; }).filter(function (x) { return x.text; }).slice(0, 12);
      var data = { title: v.title.value.trim(), host: v.host.value.trim(), entry: v.entry.value, message: v.message.value, schedule: schedule, notice: v.notice.value, contact: v.contact.value.trim(),
        theme: (form.querySelector('input[name=theme]:checked') || {}).value || 'chalk', rsvp: { open: v.rsvp_open.checked, ask_party: v.ask_party.checked, ask_car: v.ask_car.checked } };
      btn.disabled = true; errEl.textContent = '';
      A('create', { booking_code: b.code, data: data }).then(function () { M.toast('초대장을 만들었습니다.'); load(); return open(b.code); }, function (er) { btn.disabled = false; errEl.textContent = er.message; if (X.guard(er)) return; });
    });
  }
  function inviteHtml(d) {
    var iv = d.invite, s = iv.summary, k = d.kakao, b = d.booking;
    var recips = b.recipients || [];
    var send = !iv.closed && k.admin_ready && recips.length
      ? '<div class="aiv-recips">' + recips.map(function (p, i) { return '<label><input type="checkbox" name="to" value="' + esc(p) + '"' + (i ? '' : ' checked') + '> ' + esc(phone(p)) + (i ? ' (추가 연락처)' : ' (대표)') + '</label>'; }).join('') + '</div><button type="button" class="btn btn-primary" data-send>카카오톡 보내기</button>'
      : '<p class="small muted">' + (iv.closed ? '예약이 확정 상태가 아니어서 보낼 수 없습니다.' : !recips.length ? '예약에 카카오톡을 받을 휴대폰 번호가 없습니다.' : '카카오톡 보내기 준비가 끝나지 않았습니다. 위쪽 ‘카카오톡 설정’을 확인해 주세요.') + '</p>';
    return '<div class="adm-card aiv-iv"><div class="aiv-iv-head"><div><span class="st st-ok">초대장 있음</span><h3>' + esc(iv.data.title || '초대장') + '</h3><p class="small muted">만든 시각 ' + esc(kst(iv.created_at)) + (iv.updated_at && iv.updated_at !== iv.created_at ? ' · 고친 시각 ' + esc(kst(iv.updated_at)) : '') + '</p></div>' +
      '<div class="aiv-sum"><b>' + s.people + '<small>명</small></b><span>참석 (' + s.yes + '건) · 미정 ' + s.maybe + ' · 불참 ' + s.no + '</span></div></div>' +
      '<div class="aiv-acts"><button type="button" class="btn btn-dark btn-sm" data-pdf' + (iv.public ? '' : ' disabled') + '>PDF 내려받기</button><button type="button" class="btn btn-light btn-sm" data-img' + (iv.public ? '' : ' disabled') + '>이미지 저장</button>' +
      '<a class="btn btn-light btn-sm" href="' + esc(iv.public_url) + '" target="_blank" rel="noopener">참석자 화면 ↗</a><a class="btn btn-light btn-sm" href="' + esc(iv.manage_url) + '" target="_blank" rel="noopener">주최자 관리 화면(내용 고치기) ↗</a>' +
      '<button type="button" class="btn btn-light btn-sm" data-copy="' + esc(abs(iv.public_url)) + '">초대장 주소 복사</button></div></div>' +
      '<div class="aiv-grid"><div class="adm-card"><h3>카카오톡으로 보내기</h3><p class="small muted">예약에 등록된 번호로만 보냅니다. 메시지에는 ‘초대장 보기’와 ‘초대장 관리’ 버튼이 붙고, 카카오톡을 못 받으면 같은 내용이 문자로 갑니다.</p>' + send +
      '<p class="small" data-send-msg role="status"></p><h4>보낸 기록</h4><div data-log>' + logHtml(iv.messages) + '</div></div>' +
      '<div class="adm-card aiv-prev"><h3>PDF 미리보기</h3><div class="aiv-prev-box" data-prev><p class="small muted">' + (iv.public ? (P ? '그리는 중…' : 'PDF 도구를 불러오지 못했습니다.') : '예약이 확정 상태가 아니어서 미리 볼 수 없습니다.') + '</p></div></div></div>';
  }
  function logHtml(list) {
    if (!list || !list.length) return '<p class="small muted">아직 보낸 기록이 없습니다.</p>';
    return '<ul class="aiv-log">' + list.map(function (m) { return '<li><span>' + esc(kst(m.created_at)) + '</span><span>' + esc(m.receiver_mask) + '</span><span>' + esc(ACTOR[m.actor] || m.actor) + '</span><span class="st ' + (m.status === 'failed' ? 'st-cancel' : m.status === 'accepted' ? 'st-ok' : 'st-pay') + '">' + esc(SENT[m.status] || m.status) + '</span>' + (m.error ? '<small>' + esc(m.error) + '</small>' : '') + '</li>'; }).join('') + '</ul>';
  }
  function bindInvite(body, d) {
    var iv = d.invite, inv = iv.public, url = abs(iv.public_url);
    if (inv && P) P.prepare(inv, url).then(function (p) {
      var box = $('[data-prev]', body); if (!box || S.current !== d.booking.code) return;
      var src = URL.createObjectURL(p.jpeg); box.innerHTML = '<img src="' + src + '" alt="초대장 PDF 미리보기"><p class="small muted">' + (p.pages.length > 1 ? 'PDF는 A5 ' + p.pages.length + '쪽으로 나뉩니다.' : 'A5 한 쪽') + '</p>';
    }, function () { var box = $('[data-prev]', body); if (box) box.innerHTML = '<p class="small">미리보기를 그리지 못했습니다.</p>'; });
    body.onclick = function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-pdf],[data-img]')) && inv && P) {
        b.disabled = true;
        (b.hasAttribute('data-pdf') ? P.savePdf(inv, url) : P.saveImage(inv, url)).then(function () { b.disabled = false; M.toast('내려받았습니다.'); }, function (er) { b.disabled = false; M.toast(er.message || '파일을 만들지 못했습니다.'); });
        return;
      }
      if ((b = t.closest('[data-copy]'))) { (M.copy ? M.copy(b.dataset.copy) : navigator.clipboard.writeText(b.dataset.copy)).then(function () { M.toast('초대장 주소를 복사했습니다.'); }, function () { M.toast('복사하지 못했습니다.'); }); return; }
      if ((b = t.closest('[data-send]'))) {
        var to = Array.prototype.map.call(body.querySelectorAll('input[name=to]:checked'), function (x) { return x.value; });
        if (!to.length) { M.toast('보낼 번호를 골라 주세요.'); return; }
        if (!window.confirm(d.booking.customer_name + '님 번호(' + to.map(phone).join(', ') + ')로 초대장 카카오톡을 보낼까요?')) return;
        b.disabled = true; var msg = $('[data-send-msg]', body); msg.textContent = '보내는 중…';
        A('send', { booking_code: d.booking.code, receivers: to }).then(function (r) {
          b.disabled = false;
          msg.textContent = r.results.map(function (x) { return x.receiver + ' ' + (SENT[x.status] || x.status) + (x.note ? ' — ' + x.note : ''); }).join(' / ');
          $('[data-log]', body).innerHTML = logHtml(r.messages); load();
        }, function (er) { b.disabled = false; msg.textContent = er.message; oops(er); });
      }
    };
  }

  /* ---------- 카카오톡 설정 ---------- */
  function kakaoSettings() {
    var body = drawer('카카오톡 초대장 설정'); S.current = '';
    return A('kakao').then(function (k) { S.kakao = k; kakaoBar(); drawSettings(body, k); }, function (e) { body.innerHTML = '<p class="small">' + esc(e.message) + '</p>'; oops(e); });
  }
  function step(n, done, title, html) { return '<li class="' + (done ? 'done' : '') + '"><span class="no">' + (done ? '✓' : n) + '</span><div><b>' + title + '</b>' + html + '</div></li>'; }
  function drawSettings(body, k) {
    var t = k.template;
    body.innerHTML = '<div class="adm-card"><p class="small">예약자가 초대장을 카카오톡으로 받으려면 알리고에 아래 알림톡 템플릿을 승인받아야 합니다. 차례대로 진행해 주세요. 승인 전에도 PDF·이미지 내려받기와 카카오톡 주소 공유는 그대로 쓸 수 있습니다.</p>' +
      '<ol class="aiv-steps">' +
      step(1, !!k.code, '알리고에 템플릿 등록', '<p class="small muted">알리고 → 카카오톡 → 템플릿 등록에서 아래 본문을 띄어쓰기·줄바꿈까지 그대로 넣고, 버튼 2개(웹링크)를 같은 이름·주소로 추가한 뒤 검수를 요청합니다. 템플릿 이름: <b>' + esc(t.name) + '</b></p>' +
        '<pre class="aiv-tpl">' + esc(t.content) + '</pre><button type="button" class="btn btn-light btn-sm" data-copy-tpl>본문 복사</button>' +
        '<table class="aiv-btns"><thead><tr><th>버튼 이름</th><th>모바일·PC 링크</th></tr></thead><tbody>' + t.buttons.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td><code>' + esc(x.linkMo) + '</code></td></tr>'; }).join('') + '</tbody></table>') +
      step(2, !!k.code, '연결 서버에 코드 허용', '<p class="small muted">승인 코드(예: UN_1234)를 받으면 알리고 연결 서버의 환경 변수 <code>' + esc(k.relay_env) + '</code>에 쉼표로 덧붙이고 연결 서버를 다시 시작합니다. 이 단계가 빠지면 승인 확인에서 ‘연결 서버가 막았다’고 나옵니다.</p>') +
      step(3, !!k.code, '템플릿 코드 저장', '<div class="aiv-inline"><input class="input" id="aiv-code" maxlength="30" placeholder="UN_0000" value="' + esc(k.code || '') + '"><button type="button" class="btn btn-light btn-sm" data-k="save">저장</button></div>') +
      step(4, k.approved, '승인 확인', '<p class="small muted">알리고에서 승인 상태와 본문·버튼이 같은지 확인합니다.</p><button type="button" class="btn btn-light btn-sm" data-k="check"' + (k.code ? '' : ' disabled') + '>승인 확인</button><p class="small" data-check></p>') +
      step(5, k.tested, '운영자 번호로 시험 발송', '<p class="small muted">예시 초대장 링크가 담긴 메시지를 보냅니다. 받아서 버튼까지 눌러 본 뒤 ‘받았어요’를 눌러 주세요.</p><div class="aiv-inline"><input class="input" id="aiv-test" type="tel" maxlength="20" placeholder="운영자 휴대폰 번호"><button type="button" class="btn btn-light btn-sm" data-k="test"' + (k.approved && k.live ? '' : ' disabled') + '>시험 발송</button><button type="button" class="btn btn-light btn-sm" data-k="confirm"' + (k.approved ? '' : ' disabled') + '>받았어요</button></div><p class="small" data-test></p>' + (k.live ? '' : '<p class="small aiv-err">서버의 알림톡 발송(ALIGO_LIVE_ENABLED)이 꺼져 있어 시험 발송을 할 수 없습니다.</p>') + logHtml(k.tests)) +
      step(6, k.enabled, '고객이 직접 받기 (선택)', '<p class="small muted">켜면 고객 초대장 화면과 관리 화면에 ‘카카오톡으로 받기’ 버튼이 보입니다. 예약자 본인 번호로만, 초대장 하나에 하루 세 번까지 보냅니다.</p><label class="aiv-switch"><input type="checkbox" data-k="enable"' + (k.enabled ? ' checked' : '') + (k.admin_ready ? '' : ' disabled') + '> 고객 직접 받기 ' + (k.enabled ? '켜짐' : '꺼짐') + '</label>') +
      '</ol></div>';
    body.onclick = function (e) {
      var b = e.target.closest('[data-k],[data-copy-tpl]'); if (!b || b.tagName === 'INPUT') return;
      if (b.hasAttribute('data-copy-tpl')) { (M.copy ? M.copy(t.content) : navigator.clipboard.writeText(t.content)).then(function () { M.toast('템플릿 본문을 복사했습니다.'); }); return; }
      var a = b.dataset.k; b.disabled = true;
      var again = function (k2) { S.kakao = k2; kakaoBar(); drawSettings(body, k2); };
      if (a === 'save') A('kakao', { action: 'save', code: $('#aiv-code', body).value.trim() }).then(function (k2) { M.toast('저장했습니다.'); again(k2); }, function (er) { b.disabled = false; oops(er); });
      if (a === 'check') A('kakao', { action: 'check' }).then(function (r) { A('kakao').then(function (k2) { again(k2); var p = $('[data-check]', body); if (p) p.textContent = r.check.message; }); }, function (er) { b.disabled = false; oops(er); });
      if (a === 'test') {
        var ph = $('#aiv-test', body).value;
        A('kakao', { action: 'test', receiver: ph }).then(function (r) { A('kakao').then(function (k2) { again(k2); var p = $('[data-test]', body); if (p) p.textContent = '시험 메시지 ' + (SENT[r.result.status] || r.result.status) + (r.result.note ? ' — ' + r.result.note : '') + '. 받으셨으면 ‘받았어요’를 눌러 주세요.'; }); }, function (er) { b.disabled = false; var p = $('[data-test]', body); if (p) p.textContent = er.message; if (X.guard(er)) return; });
      }
      if (a === 'confirm') A('kakao', { action: 'confirm' }).then(function (k2) { M.toast('시험 수신을 확인했습니다. 이제 예약자에게 보낼 수 있습니다.'); again(k2); }, function (er) { b.disabled = false; var p = $('[data-test]', body); if (p) p.textContent = er.message; if (X.guard(er)) return; });
    };
    body.onchange = function (e) {
      var c = e.target.closest('input[data-k="enable"]'); if (!c) return;
      A('kakao', { action: 'enable', enabled: c.checked }).then(function (k2) { S.kakao = k2; kakaoBar(); drawSettings(body, k2); M.toast(k2.enabled ? '고객 직접 받기를 켰습니다.' : '고객 직접 받기를 껐습니다.'); }, function (er) { c.checked = !c.checked; oops(er); });
    };
  }

  /* ---------- 이벤트 ---------- */
  f.addEventListener('submit', function (e) { e.preventDefault(); load(); });
  sec.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]'); if (b) { open(b.dataset.open); return; }
    var a = e.target.closest('[data-ia]'); if (!a) return;
    if (a.dataset.ia === 'reload') { loadKakao(); load(); }
    if (a.dataset.ia === 'kakao') kakaoSettings();
  });
  X.register('invites', function () { loadKakao(); load(); });
})();
