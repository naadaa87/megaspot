/* 모임 초대장 — 참석자 화면 /invite/?c=코드 (2026-11-21)
   가입 없이 열고, 이름과 참석 여부만 남깁니다. 휴대폰 번호는 받지 않습니다.
   같은 브라우저에서 다시 열면 내 응답을 불러와 고칠 수 있도록 응답 열쇠를 ms_invite_rsvp 에 둡니다. */
(function () {
  'use strict';
  var K = window.Kit, esc = K.esc, root = K.$('#inv-root');
  if (!root) return;
  var code = (new URLSearchParams(location.search).get('c') || '').trim().toLowerCase().slice(0, 20);
  var KEY = 'ms_invite_rsvp', inv = null, mine = null, editing = false;

  function tokenFor(c, create) {
    var all = K.store.get(KEY, {}) || {};
    if (!all[c] && create) { all[c] = K.token(28); var keys = Object.keys(all); if (keys.length > 30) delete all[keys[0]]; K.store.set(KEY, all); }
    return all[c] || '';
  }
  function fail(msg) {
    root.innerHTML = '<div class="inv"><div class="inv-top"><div class="brand">MEGASPOT INVITATION</div><h1>초대장을 열 수 없습니다</h1></div><div class="inv-body"><p class="inv-msg">' + esc(msg) +
      '</p><div class="inv-sec"><a class="btn btn-primary" href="/kit/" style="width:100%">메가스팟 모임 키트 보기</a></div></div></div>';
  }
  if (!code) { fail('주소가 잘렸을 수 있습니다. 받은 주소 전체를 다시 열어 주세요.'); return; }

  function rsvpHtml() {
    var r = inv.rsvp || {};
    if (!r.enabled && !mine) return '';
    var h = '<section class="rsvp" id="rsvp">';
    if (mine && !editing) {
      h += '<h2>내 응답</h2><div class="rsvp-mine"><b>' + esc(K.RSVP[mine.status] || '') + '</b> · ' + esc(mine.name) +
        (mine.status !== 'no' && r.ask_party ? ' · ' + mine.party + '명' : '') + (mine.cars ? ' · 차량 ' + mine.cars + '대' : '') +
        (mine.answer ? '<br><span class="muted">' + esc(mine.answer) + '</span>' : '') + '</div>';
      h += r.open ? '<button type="button" class="btn btn-light" style="width:100%;margin-top:10px" data-edit>응답 고치기</button>' : '<p class="desc" style="margin:10px 0 0">응답 받기가 끝나 더 고칠 수 없습니다.</p>';
      return h + '</section>';
    }
    if (!r.open) return h + '<h2>참석 응답</h2><p class="desc" style="margin:0">' + (inv.phase === 'after' ? '모임이 끝나 응답을 받지 않습니다.' : '응답 받기가 끝났습니다. 참석 여부는 주최자에게 직접 알려 주세요.') + '</p></section>';
    var m = mine || {};
    h += '<h2>참석 여부를 알려 주세요</h2><p class="desc">' + (r.deadline ? esc(K.fmtShort(r.deadline)) + '까지 받습니다. ' : '') + '가입 없이 이름만 남기면 됩니다.</p>';
    h += '<form class="form" data-rsvp-form novalidate><div class="rsvp-pick" role="radiogroup" aria-label="참석 여부">' +
      ['yes', 'maybe', 'no'].map(function (s) { return '<label><input type="radio" name="status" value="' + s + '"' + (m.status === s ? ' checked' : '') + '>' + K.RSVP[s] + '</label>'; }).join('') + '</div>';
    h += '<div class="f"><label for="rv-name">이름 <span class="req">*</span></label><input class="input" id="rv-name" name="name" maxlength="20" autocomplete="name" value="' + esc(m.name || '') + '" placeholder="주최자가 알아볼 수 있는 이름"></div>';
    if (r.ask_party || r.ask_car) {
      h += '<div class="field-row" data-going>';
      if (r.ask_party) { h += '<div class="f"><label for="rv-party">오는 인원 (본인 포함)</label><select class="select" id="rv-party" name="party">'; for (var i = 1; i <= 20; i++) h += '<option' + ((m.party || 1) === i ? ' selected' : '') + '>' + i + '</option>'; h += '</select></div>'; }
      if (r.ask_car) { h += '<div class="f"><label for="rv-cars">차량</label><select class="select" id="rv-cars" name="cars">'; for (var j = 0; j <= 10; j++) h += '<option value="' + j + '"' + ((m.cars || 0) === j ? ' selected' : '') + '>' + (j ? j + '대' : '차 없이 와요') + '</option>'; h += '</select></div>'; }
      h += '</div>';
    }
    if (r.question) h += '<div class="f" data-going><label for="rv-answer">' + esc(r.question) + '</label><input class="input" id="rv-answer" name="answer" maxlength="200" value="' + esc(m.answer || '') + '"></div>';
    h += '<div style="position:absolute;left:-9999px" aria-hidden="true"><label>웹사이트<input name="website" tabindex="-1" autocomplete="off"></label></div>';
    h += '<label class="agree"><input type="checkbox" name="agree"' + (mine ? ' checked' : '') + '><span>이름과 응답 내용을 이 초대장을 만든 주최자에게 전달하는 데 동의합니다. 응답은 모임 날로부터 30일 뒤 지웁니다. <a href="/privacy/#invite" target="_blank" rel="noopener">개인정보처리방침</a></span></label>';
    h += '<p class="kit-msg err" data-err role="alert"></p><button type="submit" class="btn btn-primary btn-lg" style="width:100%">' + (mine ? '응답 고치기' : '응답 보내기') + '</button>';
    if (mine) h += '<button type="button" class="btn btn-light" data-cancel-edit>그대로 두기</button>';
    return h + '</form></section>';
  }

  function render() {
    var card = K.inviteCard(inv, { rsvpSlot: true });
    var shareTitle = inv.title + ' 초대장';
    root.innerHTML = card +
      '<div class="inv-share"><button type="button" class="btn btn-light" data-ics>캘린더에 저장</button><button type="button" class="btn btn-light" data-share>초대장 전달하기</button></div>' +
      '<a class="inv-cta" href="/kit/"><div><b>나도 메가스팟에서 모임 열기</b><small>건대입구 190평·400평 공간 · 초대장과 진행 도구 무료</small></div><span class="arrow">→</span></a>' +
      '<p class="inv-foot">이 초대장은 주최자가 <a href="/kit/">메가스팟 모임 키트</a>로 만들었습니다.<br>메가스팟은 초대장 내용과 회비를 대신 받거나 확인하지 않습니다.</p>';
    var slot = K.$('[data-rsvp]', root); if (slot) slot.outerHTML = rsvpHtml();
    toggleGoing();
    document.title = inv.title + ' · 모임 초대장 · 메가스팟';
    root.dataset.share = shareTitle;
  }
  function toggleGoing() {
    var f = K.$('[data-rsvp-form]', root); if (!f) return;
    var st = (f.querySelector('input[name=status]:checked') || {}).value;
    K.$$('[data-going]', f).forEach(function (el) { el.hidden = st === 'no'; });
  }

  root.addEventListener('change', function (e) { if (e.target.name === 'status') toggleGoing(); });
  root.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-edit]')) { editing = true; render(); var n = K.$('#rv-name'); if (n) n.focus(); }
    else if (t.closest('[data-cancel-edit]')) { editing = false; render(); }
    else if (t.closest('[data-share]')) K.share(location.pathname + '?c=' + code, inv.title, inv.title + ' 초대장이에요. 일시와 장소, 주차 안내를 확인해 주세요.');
    else if (t.closest('[data-ics]')) {
      var place = Object.assign({}, K.PLACE, inv.place || {});
      K.ics({ title: inv.title, date: inv.date, start_h: inv.start_h, end_h: inv.end_h, uid: 'invite-' + code,
        location: (inv.space && inv.space.name ? inv.space.name + ', ' : '') + place.road + ' ' + ((inv.space && inv.space.floor) || place.building),
        description: (inv.host ? inv.host + '\n' : '') + '초대장: ' + location.origin + '/invite/?c=' + code, url: location.origin + '/invite/?c=' + code, file: 'megaspot-invite' });
    }
  });
  K.bindInviteCard(root, { get place() { return inv && inv.place; }, get space() { return inv && inv.space; } });

  root.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-rsvp-form]'); if (!f) return;
    e.preventDefault();
    var errEl = K.$('[data-err]', f), btn = f.querySelector('button[type=submit]');
    var status = (f.querySelector('input[name=status]:checked') || {}).value, name = f.name.value.trim();
    var say = function (m) { errEl.textContent = m; };
    if (!status) return say('참석, 미정, 불참 가운데 하나를 골라 주세요.');
    if (!name) { f.name.focus(); return say('이름을 적어 주세요.'); }
    if (!f.agree.checked) return say('주최자에게 응답을 전달하는 데 동의해 주세요.');
    say(''); btn.disabled = true; btn.textContent = '보내는 중…';
    K.api('rsvp', { c: code, t: tokenFor(code, true), name: name, status: status,
      party: f.party ? +f.party.value : 1, cars: f.cars ? +f.cars.value : 0, answer: f.answer ? f.answer.value : '',
      website: f.website.value, agree: true }).then(function (j) {
      mine = j.mine; editing = false; render();
      K.toast(j.updated ? '응답을 고쳤습니다.' : '응답을 보냈습니다. 고맙습니다!');
      var r = K.$('#rsvp'); if (r) r.scrollIntoView({ behavior: K.reduced ? 'auto' : 'smooth', block: 'center' });
    }, function (er) { btn.disabled = false; btn.textContent = mine ? '응답 고치기' : '응답 보내기'; say(er.message); });
  });

  K.api('view?c=' + encodeURIComponent(code)).then(function (j) {
    inv = j.invite; render();
    var t = tokenFor(code, false);
    if (t) K.api('rsvp?c=' + encodeURIComponent(code) + '&t=' + encodeURIComponent(t)).then(function (m) { if (m.mine) { mine = m.mine; render(); } }, function () {});
  }, function (e) { fail(e.message); });
})();
