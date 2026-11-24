/* 모임 초대장 카드 그리기 (2026-11-21)
   참석자 화면(/invite/), 만들기 미리보기(/invite/new/), 관리 화면이 같은 모양을 씁니다.
   inv: 서버 publicInvite() 와 같은 모양 { title, host, message, entry, schedule, notice, contact, contact_url, theme, date, start_h, end_h, space, place, phase, rsvp } */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc;
  var PARKING = '건물 주차장 120여 대(1층·4층 옥상) · 유료 주차권 1시간 4,000원부터';

  K.inviteCard = function (inv, opt) {
    opt = opt || {};
    // 자정을 넘겨 시작하는 예약(시작 24시 이상)은 실제 날짜와 시각으로 보여 줍니다 (2026-11-24)
    if (Number(inv.start_h) >= 24 && K.ymd(inv.date)) {
      var nd = new Date(K.ymd(inv.date).t + 864e5).toISOString().slice(0, 10);
      inv = Object.assign({}, inv, { date: nd, start_h: Number(inv.start_h) - 24, end_h: inv.end_h != null ? Number(inv.end_h) - 24 : inv.end_h });
    }
    var place = Object.assign({}, K.PLACE, inv.place || {}), space = inv.space || {}, maps = K.maps(place);
    var theme = K.THEMES[inv.theme] ? inv.theme : 'chalk', phase = inv.phase || 'before';
    var dd = phase === 'today' ? 'TODAY' : phase === 'after' ? '' : K.ddayLabel(inv.date);
    var time = K.timeRange(inv.start_h, inv.end_h);
    var now = phase === 'today' ? K.currentStep(inv.schedule) : -1;
    var h = '<article class="inv t-' + theme + (opt.mini ? ' mini' : '') + '">';
    h += '<div class="inv-top"><div class="brand">MEGASPOT INVITATION</div>' + (dd ? '<span class="dd">' + esc(dd) + '</span>' : '');
    h += '<h1>' + esc(inv.title || '모임 이름을 적어 주세요') + '</h1>' + (inv.host ? '<p class="host">' + esc(inv.host) + '</p>' : '');
    h += '<div class="when"><b>' + esc(K.fmtDate(inv.date) || '날짜는 예약에서 자동으로 들어갑니다') + '</b><span>' + esc(time) + (inv.entry ? (time ? ' · ' : '') + esc(inv.entry) + '부터 입장' : '') + '</span></div></div>';
    h += '<div class="inv-body">';
    if (phase === 'today' && !opt.mini) {
      var cur = now >= 0 ? inv.schedule[now] : null;
      h += '<div class="inv-today"><div><b>오늘 열리는 모임입니다</b><small>' + (cur ? '지금 순서 · ' + esc(cur.text) : '조심히 오세요. 주차는 아래 안내를 봐 주세요.') + '</small></div></div>';
    }
    if (phase === 'after' && !opt.mini) h += '<div class="inv-after">모임이 끝났습니다. 함께해 주셔서 고맙습니다.</div>';
    if (inv.message) h += '<p class="inv-msg">' + K.nl(inv.message) + '</p>';
    h += '<section class="inv-sec inv-place"><h2>장소</h2><b>' + esc(space.name || '메가스팟') + '</b>' +
      '<p>' + esc(place.road) + ' ' + esc(space.floor || place.building) + (space.note ? ' · ' + esc(space.note) : '') + '<br>' + esc(place.transit) + '</p>';
    if (!opt.mini) h += '<div class="inv-btns"><a class="btn btn-light" href="' + maps.naver + '" target="_blank" rel="noopener">네이버 지도</a><a class="btn btn-light" href="' + maps.kakao + '" target="_blank" rel="noopener">카카오맵</a><button type="button" class="btn btn-light" data-copy-addr>주소 복사</button></div>';
    h += '</section>';
    if (inv.schedule && inv.schedule.length) {
      h += '<section class="inv-sec"><h2>일정</h2><ul class="inv-list">' + inv.schedule.map(function (s, i) {
        return '<li' + (i === now ? ' class="now"' : '') + '><b>' + esc(s.time || '') + '</b><span>' + esc(s.text) + (i === now ? ' · 지금' : '') + '</span></li>';
      }).join('') + '</ul></section>';
    }
    h += '<section class="inv-sec"><h2>주차</h2><div class="inv-park"><span><b>' + esc(place.parking || PARKING) + '</b></span><span>차를 가져오신다면 도착 뒤 주차 할인 등록에서 차량번호를 등록해 주세요.</span></div>';
    if (!opt.mini) h += '<div class="inv-btns" style="grid-template-columns:1fr 1fr"><a class="btn btn-light" href="/parking/" target="_blank" rel="noopener">주차 안내</a><a class="btn btn-light" href="/parking/purchase/" target="_blank" rel="noopener">주차 할인 등록</a></div>';
    h += '</section>';
    if (inv.notice) h += '<section class="inv-sec"><h2>알려 드려요</h2><p class="inv-note">' + esc(inv.notice) + '</p></section>';
    if (inv.contact || inv.contact_url) {
      h += '<section class="inv-sec"><h2>문의</h2>' + (inv.contact ? '<p class="inv-note">' + esc(inv.contact) + '</p>' : '') +
        (inv.contact_url && !opt.mini ? '<div class="inv-btns" style="grid-template-columns:1fr"><a class="btn btn-light" href="' + esc(inv.contact_url) + '" target="_blank" rel="noopener nofollow">주최자에게 연락하기</a></div>' : '') + '</section>';
    }
    if (opt.rsvpSlot) h += '<div data-rsvp></div>';
    h += '</div></article>';
    return h;
  };

  // 카드 안 버튼 (주소 복사)
  K.bindInviteCard = function (root, inv) {
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-copy-addr]')) {
        var place = Object.assign({}, K.PLACE, inv.place || {}), space = inv.space || {};
        K.copy(place.road + ' ' + (space.floor || place.building) + ' (' + (space.name || '메가스팟') + ')', '주소를 복사했습니다.');
      }
    });
  };
})();
