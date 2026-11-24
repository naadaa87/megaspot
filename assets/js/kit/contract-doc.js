/* 메가스팟 공간대관 계약서 — 본문·금액 계산·화면 (2026-11-24)
   계약 조항은 운영자가 준 계약서 양식(공간대관 계약서.docx)의 문구를 그대로 옮겼습니다. 조항을 고치면 TERMS_VERSION 을 바꿔 주세요.
   서버(functions/api/_contracts.js)와 고객 화면(/contract/)·관리자 화면이 같이 씁니다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MEGASPOT_CONTRACT = factory(); })(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var TERMS_VERSION = '2026-11-24';
  var OPERATOR = { name: '주식회사 블랭크 (메가스팟)', company: '주식회사 블랭크', rep: '대표 최시준', rep_name: '최시준', bizno: '161-86-03494', address: '서울특별시 강남구 영동대로 602, 6층 제트71', phone: '010-2384-9580', email: 'spaceblank0100@gmail.com' };
  var BANK = { bank: '하나은행', number: '298-910064-39104', holder: '주식회사 블랭크' };
  var SPACES = { 'megaspot-gundae': '메가스팟 건대 1호점', 'megaspot-gundae-2': '메가스팟 건대 2호점' };
  var SPACE_ADDRESS = '서울특별시 광진구 화양동 10-1 한아름건물 2층';
  var OPTIONS = [['manager', '현장 매니저'], ['cleaning', '뒷정리·청소'], ['disposable', '1회용 세트'], ['banner', '현수막·X배너'], ['catering', '출장뷔페·케이터링'], ['etc', '기타']];
  var METHODS = [['card', '카드'], ['transfer', '계좌이체'], ['corp_card', '법인카드'], ['tax_invoice', '세금계산서 발행']];
  var EXTRA_PERSON = 10000, SECURITY = 150000;
  var INTRO = "주식회사 블랭크(이하 '운영자')와 아래 대관자(이하 '대관자')는 메가스팟 공간 이용에 관하여 다음과 같이 계약을 맺는다. 빈칸은 예약 확정 내용과 견적서에 맞춰 채운다.";
  // { t: 제목, p: [문단], li: [목록], refund: true(환불표) } — {security} 는 보증금 금액으로 바뀝니다
  var CLAUSES = [
    { t: '제1조 (계약의 성립)', p: ['이 계약은 대관자가 대관료를 결제하고 운영자가 예약을 확정한 때 성립한다. 예약 신청이나 문의만으로는 날짜가 확보되지 않는다.'] },
    { t: '제2조 (이용 시간)', p: ['① 입실, 준비, 행사, 정리, 퇴실은 모두 계약한 이용 시간 안에서 마친다.', '② 이용 시간을 넘기면 그 시간대의 시간당 요금을 1시간 단위로 더 낸다. 1시간이 안 되는 초과도 1시간으로 계산하며, 다음 예약이 있으면 연장할 수 없다.'] },
    { t: '제3조 (이용 인원)', p: ['① 실제 인원이 계약 인원보다 많으면 늘어난 1명당 10,000원을 이용 당일 정산한다. 적게 오더라도 대관료는 줄지 않는다.'] },
    { t: '제4조 (보증금)', p: ['① 대관자는 이용일 15일 전까지 보증금 {security}원을 결제한다.', '② 운영자는 이용이 끝난 뒤 기본 정리, 파손·오염, 부착물 제거를 확인하고 3영업일 안에 보증금을 환급한다. 손해가 있으면 보증금에서 빼고, 모자라는 금액은 따로 청구한다.'] },
    { t: '제5조 (취소와 환불)', p: ['① 대관자가 예약을 취소하면 이용일을 기준으로 아래와 같이 환불한다.'], refund: true, p2: ['② 이용일이나 시간을 바꾸려면 운영자와 협의한다. 빈 날짜가 있을 때만 옮길 수 있다.', '③ 환불은 결제한 수단으로 한다. 카드 결제는 카드사에 따라 3~7영업일이 걸릴 수 있다.'] },
    { t: '제6조 (지켜야 할 사항)', p: ['① 대관자와 참석자는 다음을 지킨다.'], li: ['건물 안은 필수 금연이며, 흡연은 건물이 정한 곳에서만 한다.', '폭죽, 불꽃, 인화성 물질은 반입하지 않는다. 케이크 초처럼 불을 쓰는 물품은 미리 알린다.', '벽, 천장, 기둥, 바닥에 테이프·못·스티커를 붙이지 않는다. 장식이 필요하면 미리 협의하고, 끝나면 떼어 낸다.', '운영자 동의 없이 공간을 다른 사람에게 재판매 하지 않는다.', '이웃과 건물에 피해를 주는 행위, 지나친 소음, 불법 행위, 미성년자 음주는 허용하지 않는다.'],
      p2: ['② 위 사항을 어겨 안전에 문제가 생기면 운영자는 바로잡아 달라고 요청할 수 있다. 따르지 않으면 이용을 중단할 수 있으며, 대관자의 중대한 귀책사유로 인한 이용 중단은 대관료가 환급되지 않는다.'] },
    { t: '제7조 (반입과 원상복구)', p: ['① 외부 식음료, 대형 장비, 대형 장식물을 가져오려면 미리 알린다. 큰 짐이나 장비는 엘리베이터 규격과 동선을 먼저 확인하여, 건물 관리사무소의 안전규칙을 따른다.', '② 이용이 끝나면 테이블·의자를 운영자가 안내한 상태로 돌려놓고, 가져온 물품과 쓰레기를 한곳에 기본 정리를 하여야 한다. 쓰레기는 운영자가 안내한 방법으로 분리한다.', '③ 뒷정리·청소 지원을 신청했다면 ②의 정리는 운영자가 진행한다. 가져온 물품은 대관자가 챙겨 간다.'] },
    { t: '제8조 (손해와 책임)', p: ['① 대관자나 참석자의 잘못으로 시설·비품이 망가지거나, 파손/오염 시 대관자가 수리비나 실제 손해를 배상한다.', '② 행사 중 참석자의 안전과 질서는 대관자가 관리하여야 한다. 다만 시설 결함으로 생긴 사고는 운영자가 관리한다.', '③ 대관자가 가져온 물품의 분실, 도난, 파손은 운영자에게 고의나 중대한 과실이 없으면 운영자가 책임지지 않는다.'] },
    { t: '제9조 (기타)', p: ['① 주차 방법과 요금은 예약이 확정된 뒤 따로 안내한다.', '② 이 계약서에 없는 내용은 메가스팟 이용 안내(megaspot.kr)와 일반 상관례를 따른다. 분쟁은 먼저 서로 협의해 풀고, 협의가 안 되면 민사소송법에 따른 관할 법원에서 해결한다.'] }
  ];
  var REFUND = [['결제 후 2시간 이내', '100%'], ['이용일 15일 이상 전', '100%'], ['이용일 8~14일 전', '80%'], ['이용일 6~7일 전', '60%'], ['이용일 4~5일 전', '30%'], ['이용일 3일 전 ~ 당일', '환불 없음']];
  var SIGN_TEXT = '양측은 위 내용을 확인하고 계약을 맺으며, 계약서 2부에 서명해 1부씩 나눠 갖는다. PDF나 전자 서명으로 주고받아도 효력은 같다.';
  var WD = ['일', '월', '화', '수', '목', '금', '토'];

  function n(v) { v = Math.round(Number(v)); return isFinite(v) && v > 0 ? v : 0; }
  // 대관료 합계 = 공간 이용료 + 추가 인원 + 부가 옵션 − 할인 · 잔금 = 합계 − 예약금
  function totals(fee) {
    fee = fee || {};
    var extra = n(fee.extra_people) * EXTRA_PERSON, total = Math.max(0, n(fee.space) + extra + n(fee.options_amount) - n(fee.discount));
    var deposit = n(fee.deposit), balance = Math.max(0, total - deposit);
    return { extra_amount: extra, total: total, balance: balance, paid_full: total > 0 && deposit >= total };
  }
  function hours(start, end) {
    var a = /^(\d{2}):(\d{2})$/.exec(start || ''), b = /^(\d{2}):(\d{2})$/.exec(end || ''); if (!a || !b) return null;
    var s = +a[1] * 60 + +a[2], e = +b[1] * 60 + +b[2]; if (e <= s) e += 1440;
    var h = (e - s) / 60; return Math.round(h * 10) / 10;
  }
  function dateText(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? +m[1] + '년 ' + +m[2] + '월 ' + +m[3] + '일 (' + WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + '요일)' : ''; }
  function dotDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[1] + '. ' + m[2] + '. ' + m[3] + '.' : ''; }
  function won(v) { return n(v).toLocaleString('ko-KR') + '원'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl(s) { return esc(s).replace(/\n/g, '<br>'); }
  function blank(v, w) { return v ? esc(v) : '<span class="cdoc-blank" style="min-width:' + (w || 6) + 'em"></span>'; }
  function cb(on, label) { return '<span class="cdoc-cb' + (on ? ' on' : '') + '" aria-hidden="true"></span><span class="cdoc-cbl">' + (on ? '<span class="sr-only">선택: </span>' : '') + esc(label) + '</span>'; }

  // c: 계약 내용 { id, renter, space, date, start, end, event, headcount, booking_code, fee, special }
  // o: { seal: 운영자 도장 그림, signature: 대관자 서명 그림, signed_at, signer, hash, contract_date, draft }
  function html(c, o) {
    c = c || {}; o = o || {};
    var r = c.renter || {}, f = c.fee || {}, t = totals(f), op = Object.assign({}, OPERATOR, c.operator || {}), bank = Object.assign({}, BANK, f.bank || {});
    var hrs = hours(c.start, c.end), opts = f.options || [], methods = f.methods || [], security = f.security == null ? SECURITY : n(f.security);
    var row = function (k, v) { return '<tr><th scope="row">' + k + '</th><td>' + v + '</td></tr>'; };
    var h = '<article class="cdoc" lang="ko">';
    h += '<header class="cdoc-head"><div class="cdoc-brand">MEGASPOT</div><h1>메가스팟 공간대관 계약서</h1>' + (c.id ? '<p class="cdoc-no">계약 번호 ' + esc(c.id) + '</p>' : '') + '</header>';
    h += '<p class="cdoc-intro">' + esc(INTRO) + '</p>';
    // 1. 계약 당사자
    h += '<section class="cdoc-sec"><h2>1. 계약 당사자</h2><table class="cdoc-tbl cdoc-party"><thead><tr><th scope="col">구분</th><th scope="col">운영자</th><th scope="col">대관자</th></tr></thead><tbody>' +
      [['상호·성명', op.name, r.name], ['대표자·담당자', op.rep, r.rep], ['사업자등록번호', op.bizno, r.bizno || '(법인·단체인 경우)'], ['주소', op.address, r.address], ['연락처', op.phone, r.phone], ['이메일', op.email, r.email]]
        .map(function (x) { return '<tr><th scope="row">' + x[0] + '</th><td>' + esc(x[1]) + '</td><td' + (o.renterSlots ? ' data-renter="' + x[0] + '"' : '') + '>' + (x[2] ? esc(x[2]) : '') + '</td></tr>'; }).join('') + '</tbody></table></section>';
    // 2. 대관 내용
    h += '<section class="cdoc-sec"><h2>2. 대관 내용</h2><table class="cdoc-tbl cdoc-kv"><tbody>' +
      row('대관 공간', Object.keys(SPACES).map(function (k) { return cb(c.space === k, SPACES[k]); }).join('<span class="cdoc-gap"></span>')) +
      row('공간 주소', esc(SPACE_ADDRESS)) +
      row('이용일', c.date ? esc(dateText(c.date)) : '20　　년　　월　　일 (　　요일)') +
      row('이용 시간', (c.start && c.end ? esc(c.start + ' ~ ' + (hours(c.start, c.end) && c.end <= c.start ? '다음 날 ' : '') + c.end) : '　　:　　 ~ 　　:　　') + ' (총 ' + (hrs != null ? hrs : '　　') + '시간, 준비·정리 시간 포함)') +
      row('행사명·목적', blank(c.event, 12)) +
      row('계약 인원', c.headcount ? esc(n(c.headcount).toLocaleString('ko-KR')) + '명' : blank('', 4) + '명') +
      row('예약번호', blank(c.booking_code, 8)) + '</tbody></table></section>';
    // 3. 대관료와 결제
    h += '<section class="cdoc-sec"><h2>3. 대관료와 결제</h2><table class="cdoc-tbl cdoc-kv"><tbody>' +
      row('공간 이용료', won(f.space) + ' (' + cb(f.type !== 'package', '시간제') + '<span class="cdoc-gap"></span>' + cb(f.type === 'package', '패키지' + (f.type === 'package' && f.pkg ? ': ' + f.pkg : '')) + ')') +
      row('추가 인원', '기본 포함 ' + (f.base_people ? n(f.base_people).toLocaleString('ko-KR') : '　　') + '명 초과 ' + n(f.extra_people) + '명 × 10,000원 = ' + won(t.extra_amount)) +
      row('부가 옵션', won(f.options_amount) + '<div class="cdoc-cbs">' + OPTIONS.map(function (x) { return '<span>' + cb(opts.indexOf(x[0]) >= 0, x[0] === 'etc' && f.options_etc ? '기타: ' + f.options_etc : x[1]) + '</span>'; }).join('') + '</div>') +
      row('할인·협찬', '−' + won(f.discount)) +
      row('대관료 합계', '<b>' + won(t.total) + ' (부가세 포함)</b>') +
      row('예약금', won(f.deposit) + ' (결제일 ' + (f.deposit_date ? esc(dotDate(f.deposit_date)) : '　　.　　.　　') + ')') +
      row('잔금', t.paid_full ? '해당 없음 (전액 결제)' : won(t.balance) + ' (이용일 ' + (f.balance_days ? n(f.balance_days) : '　　') + '일 전까지, 전액 결제 시 해당 없음)') +
      row('이용 보증금', won(security) + ' (대관료와 별도, 이용 후 반환)') +
      row('결제 방법', METHODS.map(function (x) { return cb(methods.indexOf(x[0]) >= 0, x[1]); }).join('<span class="cdoc-gap"></span>')) +
      row('입금 계좌', esc(bank.bank) + ' ' + esc(bank.number) + ' (예금주: ' + esc(bank.holder) + ')') + '</tbody></table><p class="cdoc-note">세부 금액은 함께 보낸 견적서를 따른다.</p></section>';
    // 4. 계약 조항
    h += '<section class="cdoc-sec cdoc-terms"><h2>4. 계약 조항</h2>' + CLAUSES.map(function (cl) {
      var x = '<div class="cdoc-clause"><h3>' + esc(cl.t) + '</h3>' + cl.p.map(function (p) { return '<p>' + esc(p.replace('{security}', security.toLocaleString('ko-KR'))) + '</p>'; }).join('');
      if (cl.li) x += '<ul>' + cl.li.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
      if (cl.refund) x += '<table class="cdoc-tbl cdoc-refund"><thead><tr><th scope="col">취소 시점</th><th scope="col">환불 비율</th></tr></thead><tbody>' + REFUND.map(function (rr) { return '<tr><td>' + rr[0] + '</td><td><b>' + rr[1] + '</b></td></tr>'; }).join('') + '</tbody></table>';
      if (cl.p2) x += cl.p2.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
      return x + '</div>';
    }).join('') + '</section>';
    // 5. 특약
    h += '<section class="cdoc-sec"><h2>5. 특약 사항</h2><div class="cdoc-special">' + (c.special ? nl(c.special) : '<span class="cdoc-muted">없음</span>') + '</div><p class="cdoc-note">특약 사항은 위 조항보다 우선한다.<br>첨부: 견적서 1부</p></section>';
    // 6. 서명
    var cd = o.contract_date || (o.signed_at ? String(o.signed_at).slice(0, 10) : '');
    h += '<section class="cdoc-sec cdoc-sign"><h2>6. 서명</h2><p>' + esc(SIGN_TEXT) + '</p><p class="cdoc-date"><b>계약일　' + (cd ? esc(dateText(cd).replace(/ \(.+\)$/, '')) : '20　　년　　월　　일') + '</b></p>' +
      '<table class="cdoc-tbl cdoc-signs"><thead><tr><th scope="col">운영자</th><th scope="col">대관자</th></tr></thead><tbody><tr><td>상호: ' + esc(op.name) + '<br>대표: ' + esc(op.rep_name || op.rep) +
      ' <span class="cdoc-stamp">' + (o.seal ? '<img src="' + esc(o.seal) + '" alt="운영자 도장">' : '(인)') + '</span></td><td>상호·성명: ' + esc(r.name || '') + '<br>대표자·담당자: ' + esc(r.rep || '') +
      ' <span class="cdoc-stamp">' + (o.signature ? '<img src="' + esc(o.signature) + '" alt="대관자 서명">' : '(서명 또는 인)') + '</span></td></tr></tbody></table>' +
      (o.signed_at ? '<p class="cdoc-evidence">전자서명 기록 · 서명 시각 ' + esc(o.signed_at) + ' (한국 시간) · 서명한 분 ' + esc(o.signer || r.rep || r.name || '') + ' · 계약 번호 ' + esc(c.id || '') + (o.hash ? ' · 문서 확인값 ' + esc(String(o.hash).slice(0, 16)) : '') + '</p>' : '') +
      (o.draft ? '<p class="cdoc-evidence">서명 전 문서입니다.</p>' : '') + '</section>';
    return h + '</article>';
  }
  return { TERMS_VERSION: TERMS_VERSION, OPERATOR: OPERATOR, BANK: BANK, SPACES: SPACES, SPACE_ADDRESS: SPACE_ADDRESS, OPTIONS: OPTIONS, METHODS: METHODS, EXTRA_PERSON: EXTRA_PERSON, SECURITY: SECURITY,
    INTRO: INTRO, CLAUSES: CLAUSES, REFUND: REFUND, SIGN_TEXT: SIGN_TEXT, totals: totals, hours: hours, dateText: dateText, won: won, html: html };
});
