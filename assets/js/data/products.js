/* =====================================================================
   MEGASPOT · 판매 상품 (온라인 결제용)
   - 가격은 요금표 v2.0(pricing-gundae.js)과 같은 숫자입니다. 요금표를 바꾸면 여기도 함께 맞춰 주세요.
   - 서버(functions/api/pay)도 이 파일을 읽어 금액을 검증합니다 (빌드 때 functions/api/_catalog.js 로 복사).
   - 표시 금액은 부가세 포함입니다.
   ===================================================================== */
(function(root){
  var P = {
    // 공통 안내 (상품 상세·주문 페이지에 표시)
    vatNote: '표시 금액은 부가세 포함 기준입니다.',
    delivery: {
      title: '제공 방법과 이용 기간',
      lines: [
        '실물 배송이 없는 공간 이용 서비스입니다. 결제가 끝나면 예약번호가 바로 발급되고, 선택한 이용일에 메가스팟 건대(서울 광진구 화양동 10-1 한아름건물 2층) 현장에서 제공됩니다.',
        '이용권은 결제 때 고른 이용일·시간에만 쓸 수 있습니다. 일정 변경은 이용일 8일 전까지 1회 가능하며, 카카오톡·이메일로 요청해 주세요.',
        '옵션 상품(청소 지원·현수막·X배너·1회용 세트·현장 매니저)은 같은 이용일에 현장에서 제공됩니다. 현수막·X배너는 제작 기간이 필요해 이용일 5일 전까지 결제해 주세요.'
      ]
    },
    exchange: {
      title: '교환·환불 안내',
      lines: [
        '서비스 상품이라 교환은 없고, 아래 기준에 따라 환불합니다. 환불 비율은 결제한 이용료 기준이며, 취소 접수 시각을 기준으로 계산합니다.',
        '결제 후 2시간 이내 취소는 이용일과 관계없이 전액 환불합니다.',
        '이용일 15일 이상 전 100% · 8~14일 전 80% · 6~7일 전 60% · 4~5일 전 30% · 3일 전부터 당일까지는 환불이 어렵습니다.',
        '현수막·X배너는 제작에 들어간 뒤(이용일 5일 전 이후)에는 환불이 어렵습니다.',
        '취소·환불 요청은 카카오톡 채널 또는 이메일(spaceblank0100@gmail.com)로 접수하며, 카드 결제는 승인 취소로 처리되어 카드사 기준 3~7영업일 안에 반영됩니다.',
        '메가스팟 사정으로 이용이 어려워진 경우에는 전액 환불합니다.'
      ]
    },
    included: '200인치 빔프로젝터 · 마이크 · 스피커·앰프 · 강단 · 스모그머신 · 미러볼·레이저 · 와인잔 · 행사용품',
    deposit: { amount: 150000, note: '이용 보증금 15만 원은 이용권 금액과 별도로 이용일 전에 안내해 드리며, 이용 뒤 정리·파손 여부를 확인한 다음 돌려 드립니다.' },
    people: { base: 20, extra: 10000, max: 200 },
    // 요일 그룹: 요금표의 요일 구분(월–목/금/토/일)과 같은 규칙. 공휴일은 당일·다음 날이 쉬는 날인지로 정해집니다.
    dayGroups: {
      'wd':  { label: '월–목', cols: ['wd'] },
      'fri': { label: '금요일', cols: ['fri'] },
      'sat': { label: '토요일', cols: ['sat'] },
      'sun': { label: '일요일', cols: ['sun'] },
      'wdfri': { label: '월–금', cols: ['wd', 'fri'] },
      'satsun': { label: '토·일·공휴일', cols: ['sat', 'sun'] }
    },
    // ---------- 상품 ----------
    // kind: 'pass'(공간 이용권) | 'addon'(옵션). pass 는 이용일 선택 + 인원(기준 20명, 1명당 1만 원) 이 붙고, addon 은 단독 또는 이용권과 함께 구매.
    items: [
      // 낮 패키지 10–17시 (7시간)
      { id: 'pass-day-wdfri',   kind: 'pass', pkg: 'day',      group: 'wdfri',  name: '낮 패키지 이용권 · 월–금',     price: 300000,  start: 10, end: 17, hours: 7,
        summary: '월–금 10시부터 17시까지 7시간, 기준 20명. 세미나·클래스·워크숍·낮 모임에 맞습니다.', cover: 's01' },
      { id: 'pass-day-satsun',  kind: 'pass', pkg: 'day',      group: 'satsun', name: '낮 패키지 이용권 · 토·일·공휴일', price: 700000, start: 10, end: 17, hours: 7,
        summary: '토·일·공휴일 10시부터 17시까지 7시간, 기준 20명. 주말 세미나·클래스·가족 행사에 맞습니다.', cover: 's11' },
      // 올데이 10–24시 (14시간)
      { id: 'pass-allday-wd',   kind: 'pass', pkg: 'allday',   group: 'wd',     name: '올데이 패키지 이용권 · 월–목',  price: 800000,  start: 10, end: 24, hours: 14,
        summary: '월–목 10시부터 24시까지 14시간, 기준 20명. 하루 종일 쓰는 워크숍·행사에 맞습니다.', cover: 's05' },
      { id: 'pass-allday-fri',  kind: 'pass', pkg: 'allday',   group: 'fri',    name: '올데이 패키지 이용권 · 금요일',  price: 1000000, start: 10, end: 24, hours: 14,
        summary: '금요일 10시부터 24시까지 14시간, 기준 20명. 낮 행사와 저녁 뒤풀이를 한 번에.', cover: 's04' },
      { id: 'pass-allday-sat',  kind: 'pass', pkg: 'allday',   group: 'sat',    name: '올데이 패키지 이용권 · 토요일',  price: 1600000, start: 10, end: 24, hours: 14,
        summary: '토요일 10시부터 24시까지 14시간, 기준 20명. 하루 종일 쓰는 주말 행사에 맞습니다.', cover: 's02' },
      { id: 'pass-allday-sun',  kind: 'pass', pkg: 'allday',   group: 'sun',    name: '올데이 패키지 이용권 · 일요일',  price: 1350000, start: 10, end: 24, hours: 14,
        summary: '일요일 10시부터 24시까지 14시간, 기준 20명.', cover: 's13' },
      // 올나잇 18–다음 날 07시 (13시간)
      { id: 'pass-allnight-wd', kind: 'pass', pkg: 'allnight', group: 'wd',     name: '올나잇 패키지 이용권 · 월–목',  price: 700000,  start: 18, end: 31, hours: 13,
        summary: '월–목 18시부터 다음 날 07시까지 13시간, 기준 20명. 저녁 파티·네트워킹·심야 촬영에 맞습니다.', cover: 's14' },
      { id: 'pass-allnight-fri',kind: 'pass', pkg: 'allnight', group: 'fri',    name: '올나잇 패키지 이용권 · 금요일',  price: 1100000, start: 18, end: 31, hours: 13,
        summary: '금요일 18시부터 다음 날 07시까지 13시간, 기준 20명. 송년회·단체 파티에 가장 많이 찾는 시간입니다.', cover: 's22' },
      { id: 'pass-allnight-sat',kind: 'pass', pkg: 'allnight', group: 'sat',    name: '올나잇 패키지 이용권 · 토요일',  price: 1500000, start: 18, end: 31, hours: 13,
        summary: '토요일 18시부터 다음 날 07시까지 13시간, 기준 20명.', cover: 's17' },
      { id: 'pass-allnight-sun',kind: 'pass', pkg: 'allnight', group: 'sun',    name: '올나잇 패키지 이용권 · 일요일',  price: 1000000, start: 18, end: 31, hours: 13,
        summary: '일요일 18시부터 다음 날 07시까지 13시간, 기준 20명.', cover: 's15' },
      // 옵션
      { id: 'addon-cleaning',   kind: 'addon', opt: 'cleaning',   name: '뒷정리·청소 지원',  price: 200000, unit: '1회',
        summary: '행사가 끝난 뒤 정리와 청소를 맡기고 바로 퇴실할 수 있습니다. 기본 정리(쓰레기 분리·집기 제자리)는 보증금 반환 기준에서 제외됩니다.', cover: 'p08' },
      { id: 'addon-banner',     kind: 'addon', opt: 'banner',     name: '현수막 제작',       price: 120000, unit: '1장',
        summary: '행사명·일자·로고를 넣은 현수막 1장을 디자인부터 제작·설치까지 맡아 드립니다. 이용일 5일 전까지 결제해 주세요.', cover: 'p13' },
      { id: 'addon-xbanner',    kind: 'addon', opt: 'xbanner',    name: 'X배너 제작',        price: 70000,  unit: '1개',
        summary: '입구 안내용 X배너 1개를 디자인 포함으로 제작합니다. 이용일 5일 전까지 결제해 주세요.', cover: 'p05' },
      { id: 'addon-disposable', kind: 'addon', opt: 'disposable', name: '1회용 세트 (20인분)', price: 100000, unit: '20인분', per20: true,
        summary: '수저·젓가락·그릇·컵 일체 20인분입니다. 1인당 5,000원이며 20인분 단위로 구매할 수 있습니다.', cover: 'p16' },
      { id: 'addon-manager',    kind: 'addon', opt: 'manager',    name: '현장 매니저 (1인 · 4시간)', price: 100000, unit: '1인 · 4시간',
        summary: '안내, 행사 보조, 정리 보조를 맡는 현장 매니저 1명, 4시간입니다. 1인 1시간 25,000원 기준이며 시간 연장은 문의해 주세요.', cover: 'p10' }
    ]
  };
  P.get = function(id){ for (var i = 0; i < P.items.length; i++) if (P.items[i].id === id) return P.items[i]; return null; };
  root.MEGASPOT_PRODUCTS = P;
})(typeof window !== 'undefined' ? window : globalThis);
