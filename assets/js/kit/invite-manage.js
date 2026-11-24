/* 모임 초대장 — 주최자 관리 /invite/manage/?id=&k= (2026-11-21)
   응답 현황 · PDF·카카오톡(2026-11-24) · 명단 내려받기 · 응답 지우기 · 초대장 고치기 · 스크린 준비 · 초대장 삭제
   카카오톡 알림톡의 '초대장 관리' 버튼은 주소 뒤쪽(#id=&k=)으로 열어, 관리 열쇠가 서버 기록에 남지 않게 합니다. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc, root = K.$('#inv-root');
  if (!root) return;
  var q = new URLSearchParams(location.search);
  if (!q.get('id') && location.hash.length > 1) q = new URLSearchParams(location.hash.slice(1));
  var id = (q.get('id') || '').toUpperCase().slice(0, 20), key = (q.get('k') || '').slice(0, 40);
  var S = null, tab = 'rsvp', filter = 'all', armed = false;

  function fail(msg) {
    root.innerHTML = '<div class="kit-panel" style="max-width:640px"><h2>관리 화면을 열 수 없습니다</h2><p class="desc" style="margin-top:6px">' + esc(msg) + '</p><a class="btn btn-primary" href="/invite/new/">예약 정보로 다시 열기</a></div>';
  }
  if (id === 'SAMPLE') { root.innerHTML = '<div class="kit-panel" style="max-width:640px"><span class="kit-tag">시험 발송</span><h2 style="margin-top:10px">카카오톡 시험 메시지의 예시 링크입니다</h2><p class="desc" style="margin-top:6px">실제 초대장의 \'초대장 관리\' 버튼을 누르면 이 자리에 응답 현황과 PDF·카카오톡 보내기 화면이 열립니다.</p><a class="btn btn-primary" href="/invite/?c=sample">예시 초대장 보기</a></div>'; return; }
  if (!id || !key) { fail('관리 주소가 잘렸을 수 있습니다. 받은 주소 전체를 다시 열거나, 예약 정보로 다시 열어 주세요.'); return; }

  function load() {
    return K.api('manage?id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(key)).then(function (j) {
      S = j; K.rememberInvite({ title: j.data.title, date: j.booking && j.booking.date, public_url: j.public_url, manage_url: j.manage_url, screen_url: j.screen_url }); render();
    }, function (e) { fail(e.message); });
  }
  function post(body) { return K.api('manage', Object.assign({ id: id, k: key }, body)); }

  function stats() {
    var s = S.summary, bk = S.booking || {};
    var over = bk.headcount && s.people > bk.headcount;
    return '<div class="kit-stats"><div class="main"><b>' + s.people + '<small>명</small></b><span>참석 인원 (응답 ' + s.yes + '건)</span></div>' +
      '<div><b>' + s.maybe + '<small>건</small></b><span>미정' + (s.maybe_people ? ' · ' + s.maybe_people + '명' : '') + '</span></div>' +
      '<div><b>' + s.no + '<small>건</small></b><span>불참</span></div>' +
      '<div><b>' + s.cars + '<small>대</small></b><span>차량</span></div></div>' +
      (bk.headcount ? '<p class="kit-msg ' + (over ? 'err' : 'info') + '" style="margin-top:12px">' + (over ? '참석 인원이 예약 인원(' + bk.headcount + '명)보다 많습니다. 인원 변경은 메가스팟에 미리 알려 주세요.' : '예약 인원 ' + bk.headcount + '명 기준입니다. 인원이 크게 바뀌면 메가스팟에 미리 알려 주세요.') + '</p>' : '');
  }
  function rsvpTab() {
    var rows = S.rsvps.filter(function (r) { return filter === 'all' || r.status === filter; }), s = S.summary;
    var ask = (S.data.rsvp || {});
    var h = stats() + '<div class="kit-row" style="justify-content:space-between;margin:18px 0 10px"><div class="kit-tabs" style="margin:0">' +
      [['all', '전체', s.total], ['yes', '참석', s.yes], ['maybe', '미정', s.maybe], ['no', '불참', s.no]].map(function (x) { return '<button type="button" data-filter="' + x[0] + '" class="' + (filter === x[0] ? 'on' : '') + '">' + x[1] + '<span class="n">' + x[2] + '</span></button>'; }).join('') +
      '</div><div class="kit-row"><button type="button" class="btn btn-light btn-sm" data-names>참석 이름 복사</button><button type="button" class="btn btn-light btn-sm" data-csv>명단 CSV</button><button type="button" class="btn btn-light btn-sm" data-reload>새로고침</button></div></div>';
    if (!S.rsvps.length) return h + '<div class="empty">아직 응답이 없습니다. 참석자에게 초대장 주소를 보내 보세요.</div>';
    h += '<div class="kit-table-wrap"><table class="kit-table"><thead><tr><th>이름</th><th>응답</th>' + (ask.ask_party ? '<th>인원</th>' : '') + (ask.ask_car ? '<th>차량</th>' : '') + (ask.question ? '<th>' + esc(ask.question) + '</th>' : '') + '<th>응답 시각</th><th></th></tr></thead><tbody>';
    h += rows.map(function (r) {
      return '<tr><td><b>' + esc(r.name) + '</b></td><td><span class="st st-' + r.status + '">' + esc(K.RSVP[r.status] || r.status) + '</span></td>' +
        (ask.ask_party ? '<td class="n">' + (r.status === 'no' ? '-' : r.party) + '</td>' : '') + (ask.ask_car ? '<td class="n">' + (r.cars || '-') + '</td>' : '') +
        (ask.question ? '<td>' + esc(r.answer || '') + '</td>' : '') + '<td class="muted">' + esc(K.kst(r.updated_at || r.created_at)) + '</td>' +
        '<td><button type="button" class="btn btn-light btn-sm" data-remove="' + r.id + '">지우기</button></td></tr>';
    }).join('');
    return h + '</tbody></table></div><p class="hint" style="margin-top:10px">잘못 들어온 응답은 ‘지우기’로 바로 지울 수 있습니다.</p>';
  }
  function screenTab() {
    var tools = [['/play/welcome/', '웰컴 스크린', '행사 이름·일정·초대장 QR'], ['/play/draw/', '경품 추첨', '참석 응답 ' + S.summary.yes + '명 중에서'], ['/play/teams/', '팀 나누기', '참석자를 팀으로'],
      ['/play/quiz/', '팀 대항 퀴즈', '문제를 미리 준비'], ['/play/bingo/', '빙고', '휴대폰 빙고판'], ['/play/balance/', '밸런스 게임', '둘 중 하나'], ['/play/wheel/', '돌림판', '순서·벌칙 정하기']];
    var p = new URL(K.abs(S.screen_url)).searchParams, suffix = '?ev=' + encodeURIComponent(p.get('ev')) + '&s=' + encodeURIComponent(p.get('s'));
    return '<p class="desc">아래 버튼으로 열면 이 초대장과 연결됩니다. 준비한 문제와 경품은 행사에 저장되어 스크린에 연결한 노트북에서도 그대로 나옵니다.</p>' +
      K.linkBox('스크린 연결 주소', S.screen_url, '스크린 노트북에서 이 주소를 열면 플레이 도구가 이 행사와 연결됩니다. 참석자 명단 전체는 보이지 않고, 참석으로 응답한 이름만 추첨에 쓰입니다.') +
      '<div class="kit-tools" style="margin-top:16px">' + tools.map(function (t) { return '<a class="kit-tool" href="' + t[0] + suffix + '" target="_blank" rel="noopener"><h3>' + esc(t[1]) + '</h3><p>' + esc(t[2]) + '</p><span class="go">준비하기 →</span></a>'; }).join('') + '</div>';
  }
  function render() {
    var d = S.data, bk = S.booking;
    var head = '<div class="kit-row" style="justify-content:space-between;align-items:flex-end;margin-bottom:16px"><div><div class="eyebrow">Invitation · 주최자 관리</div><h1 style="font-size:clamp(24px,3.2vw,34px);margin:6px 0 2px">' + esc(d.title) + '</h1>' +
      '<p class="muted" style="margin:0">' + (bk ? esc(bk.space_name) + ' · ' + esc(K.fmtDate(bk.date)) + ' ' + esc(K.timeRange(bk.start_h, bk.end_h)) + ' · ' + esc(K.ddayLabel(bk.date)) : '예약이 취소되었거나 확인되지 않아 참석자에게 초대장이 열리지 않습니다.') + '</p></div>' +
      '<div class="kit-row"><button type="button" class="btn btn-primary" data-share' + (S.closed ? ' disabled' : '') + '>초대장 보내기</button><a class="btn btn-light" href="' + esc(S.public_url) + '" target="_blank" rel="noopener">참석자 화면 보기</a></div></div>';
    var tabs = '<div class="kit-tabs">' + [['rsvp', '응답 현황'], ['send', 'PDF·카카오톡'], ['edit', '초대장 고치기'], ['screen', '행사 날 스크린'], ['more', '주소·삭제']].map(function (t) { return '<button type="button" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>';
    var body = '';
    if (tab === 'rsvp') body = rsvpTab();
    else if (tab === 'send') body = '<div class="kit-panel" style="max-width:860px" data-deliver></div>';
    else if (tab === 'edit') body = S.closed ? '<div class="empty">예약이 확인되지 않아 고칠 수 없습니다.</div>' : '<div data-edit></div>';
    else if (tab === 'screen') body = screenTab();
    else body = '<div class="kit-split"><div class="kit-panel kit-done">' + K.linkBox('참석자에게 보낼 주소', S.public_url) + K.linkBox('주최자 관리 주소 (나만 보관)', S.manage_url, '이 주소를 아는 사람은 응답 명단을 볼 수 있습니다.') + K.linkBox('스크린 연결 주소', S.screen_url) +
      '</div><div><div class="kit-panel" style="display:flex;gap:16px;align-items:center"><div class="kit-qr" data-qr></div><div><h3>초대장 QR</h3><p class="desc" style="margin:4px 0 10px">현장 안내판이나 발표 자료에 넣어 쓰세요.</p><button type="button" class="btn btn-light btn-sm" data-qr-save>QR 이미지 저장</button></div></div>' +
      '<div class="kit-panel"><h3>초대장 삭제</h3><p class="desc" style="margin:4px 0 12px">초대장과 모든 응답을 지웁니다. 지운 뒤에는 되돌릴 수 없고, 참석자에게 보낸 주소도 열리지 않습니다.</p><button type="button" class="btn btn-ghost" data-delete style="border-color:var(--rust);color:var(--rust)">' + (armed ? '한 번 더 누르면 삭제됩니다' : '초대장 삭제') + '</button></div></div></div>';
    root.innerHTML = head + tabs + '<div data-body>' + body + '</div>';
    if (tab === 'edit' && !S.closed) K.inviteForm(K.$('[data-edit]', root), { booking: S.booking, data: d, submitLabel: '고친 내용 저장', onSubmit: function (v) {
      return post({ action: 'update', data: v }).then(function (j) { S.data = j.data; K.toast('초대장을 고쳤습니다. 참석자 화면에 바로 반영됩니다.'); });
    } });
    if (tab === 'more') K.qr(K.$('[data-qr]', root), S.public_url, { label: '초대장 QR 코드' });
    if (tab === 'send') K.deliverBox(K.$('[data-deliver]', root), { invite: S.closed ? null : S.invite, public_url: S.public_url, manage_url: S.manage_url, kakao: S.kakao, title: d.title });
  }

  root.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('[data-tab]'))) { tab = b.dataset.tab; armed = false; render(); return; }
    if ((b = t.closest('[data-filter]'))) { filter = b.dataset.filter; render(); return; }
    if (t.closest('[data-share]')) { K.share(S.public_url, S.data.title, S.data.title + ' 초대장이에요. 일시와 장소, 주차 안내를 확인하고 참석 여부를 알려 주세요.'); return; }
    if (t.closest('[data-reload]')) { load().then(function () { K.toast('새 응답을 불러왔습니다.'); }); return; }
    if (t.closest('[data-names]')) {
      var names = S.rsvps.filter(function (r) { return r.status === 'yes'; }).map(function (r) { return r.name + ((S.data.rsvp || {}).ask_party && r.party > 1 ? ' (' + r.party + '명)' : ''); });
      if (!names.length) { K.toast('참석으로 응답한 사람이 아직 없습니다.'); return; }
      K.copy(names.join('\n'), '참석 이름 ' + names.length + '개를 복사했습니다.'); return;
    }
    if (t.closest('[data-csv]')) {
      var ask = S.data.rsvp || {};
      var rows = [['이름', '응답', '인원', '차량', ask.question || '추가 질문', '처음 응답', '마지막 수정']].concat(S.rsvps.map(function (r) { return [r.name, K.RSVP[r.status], r.party, r.cars, r.answer || '', K.kst(r.created_at, true), r.updated_at ? K.kst(r.updated_at, true) : '']; }));
      K.download('초대장응답_' + (S.booking ? S.booking.date : id) + '.csv', K.csv(rows), 'text/csv;charset=utf-8'); return;
    }
    if ((b = t.closest('[data-remove]'))) {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '정말 지우기'; b.classList.add('btn-ghost'); return; }
      post({ action: 'remove', rsvp_id: +b.dataset.remove }).then(function () { return load(); }).then(function () { K.toast('응답을 지웠습니다.'); }, function (er) { K.toast(er.message); });
      return;
    }
    if (t.closest('[data-qr-save]')) { K.download('megaspot-invite-qr.svg', window.KitQR.svg(K.abs(S.public_url), { label: '초대장 QR 코드' }), 'image/svg+xml'); return; }
    if (t.closest('[data-delete]')) {
      if (!armed) { armed = true; render(); return; }
      post({ action: 'delete' }).then(function () {
        K.forgetInvite(S.manage_url);
        root.innerHTML = '<div class="kit-panel" style="max-width:640px"><h2>초대장을 삭제했습니다</h2><p class="desc" style="margin-top:6px">초대장과 응답을 모두 지웠습니다. 같은 예약으로 새 초대장을 만들 수 있습니다.</p><a class="btn btn-primary" href="/invite/new/">새 초대장 만들기</a></div>';
      }, function (er) { K.toast(er.message); });
    }
  });

  load();
})();
