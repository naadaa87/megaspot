import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/pages/admin.js', import.meta.url), 'utf8');
function calendar() {
  const nodes = {}, requests = [];
  const context = vm.createContext({keepReservationScroll:render=>render(),
    $: selector => nodes[selector] ||= { innerHTML: '', textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
    A: path => new Promise((resolve, reject) => requests.push({ path, resolve, reject })),
    AList: path => new Promise((resolve, reject) => requests.push({ path, resolve, reject })),
    paymentBadge:()=>'',M: { pad2: n => String(n).padStart(2, '0') }, E: null,
    reservationFilterMatch:()=>true,reservationMonth:()=>'',todayIso: () => '2026-10-23', guard: () => false, esc: String
  });
  vm.runInContext(source.slice(source.indexOf('  function reservationFilterMatch('),source.indexOf('  function reservationMonth(')),context);
  vm.runInContext(source.slice(source.indexOf('  function calendarServiceDot('),source.indexOf('  function matchesConfirmedService'))+'\n'+source.slice(source.indexOf('  function calendarFoodMatches('), source.indexOf("  $('#cal-prev').addEventListener")), context);
  return { context, nodes, requests };
}
const cells = html => (html.match(/class="dc(?: |")/g) || []).length;

test('4·5·6주인 달과 로딩 화면 모두 42칸을 유지', () => {
  const { context, nodes } = calendar();
  for (const month of ['2026-02', '2026-10', '2026-05', '2028-02']) {
    context.calMonth = month;
    for (const loading of [true, false]) {
      context.drawCalendar([], [], [], loading);
      const html = nodes['#cal-grid'].innerHTML;
      assert.equal(cells(html), 42);
      const [year, m] = month.split('-').map(Number);
      const days = new Date(year, m, 0).getDate();
      assert.equal((html.match(loading ? /class="dc cal-skeleton"/g : /data-day=/g) || []).length, days);
      if (loading) assert.doesNotMatch(html, /data-day=|data-ref=/, '로딩 중에는 날짜·문의 클릭 동작 없음');
      assert.equal(nodes['#cal-title'].textContent, year + '년 ' + m + '월');
    }
  }
});
test('연속 월 이동 시 늦게 도착한 이전 요청이 마지막 달을 덮어쓰지 않음', async () => {
  const { context, nodes, requests } = calendar();
  context.calMonth = '2026-11';
  const oldLoad = context.loadCalendar();
  context.calMonth = '2026-12';
  const lastLoad = context.loadCalendar();
  assert.equal(nodes['#cal-title'].textContent, '2026년 12월');
  assert.equal(nodes['#cal-grid'].attrs['aria-busy'], 'true');
  assert.match(nodes['#cal-grid'].innerHTML, /cal-skeleton/);
  requests.slice(3).forEach(r => r.resolve({ items: [] }));
  await lastLoad;
  const latest = nodes['#cal-grid'].innerHTML;
  assert.match(latest, /data-day="2026-12-31"/);
  requests.slice(0, 3).forEach(r => r.resolve({ items: [{ date: '2026-12-01', state: 'full', memo: '오래된 응답' }] }));
  await oldLoad;
  assert.equal(nodes['#cal-grid'].innerHTML, latest);
  assert.equal(nodes['#cal-grid'].attrs['aria-busy'], 'false');
});
test('이전 요청 실패는 최신 로딩을 중단하지 않고, 최신 실패 때 재시도 제공', async () => {
  const { context, nodes, requests } = calendar();
  const oldLoad = context.loadCalendar();
  context.calMonth = '2026-11';
  const lastLoad = context.loadCalendar();
  requests[0].reject(Error('이전 요청 실패'));
  await oldLoad;
  assert.equal(nodes['#cal-grid'].attrs['aria-busy'], 'true');
  assert.match(nodes['#cal-grid'].innerHTML, /cal-skeleton/);
  requests[3].reject(Error('일정 연결 실패'));
  await lastLoad;
  assert.equal(nodes['#cal-grid'].attrs['aria-busy'], 'false');
  assert.match(nodes['#cal-grid'].innerHTML, /cal-error/);
  assert.match(nodes['#cal-grid'].innerHTML, /data-cal-retry/);
});

test('확정 예약은 초록색으로 표시하고 별도 종일 마감과 구분', () => {
  const { context, nodes } = calendar();
  const one = 'megaspot-gundae', two = 'megaspot-gundae-2';
  context.calMonth = '2026-12';
  context.drawCalendar([{ date: '2026-12-11', space_id: two, state: 'full' }], [
    { date: '2026-12-11', space_id: one, status: 'confirmed', start_h: 10, end_h: 18, inquiry_ref: 'MS-ONE', customer_name: '확정 고객' },
    { date: '2026-12-12', space_id: one, status: 'confirmed', start_h: 8, end_h: 24, customer_name: '확정 고객' },
    { date: '2026-12-12', space_id: two, status: 'cancelled', start_h: 10, end_h: 18 },
    { date: '2026-12-12', space_id: two, status: 'payment_review', start_h: 10, end_h: 18 },
    { date: '2026-12-13', space_id: one, status: 'confirmed', start_h: null, end_h: null },
  ], []);
  const html = nodes['#cal-grid'].innerHTML;
  const day = date => html.match(new RegExp('data-day="' + date + '">([^]*?)</div>'))?.[1];
  assert.match(day('2026-12-11'), /ev full cal-booked" title="2호 · 종일 마감"/);
  assert.match(day('2026-12-11'), /ev bk cal-booked" data-ref="MS-ONE" title="1호 · 예약 확정 · 10:00–18:00/);
  assert.ok(day('2026-12-11').indexOf('MS-ONE')<day('2026-12-11').indexOf('2호 · 종일 마감'),'먼저 입력된 2호 마감보다 1호 예약을 앞 그룹에 표시');
  assert.match(day('2026-12-12'), /1호 · 예약 확정 · 08:00–다음 날 00:00/);
  assert.doesNotMatch(day('2026-12-12'), /ev full|2호 확정/);
  assert.match(day('2026-12-13'), /예약 확정 · 시간 확인 필요/);
});

test('달력 식음료 필터는 상담·취소·미선택과 종일 마감을 제외하고 42칸을 유지한다',()=>{
 const {context,nodes}=calendar();context.calMonth='2026-12';nodes['#cal-service-filter']={value:'catering'};
 const bookings=[{date:'2026-12-11',status:'confirmed',customer_name:'뷔페확정',services:[{kind:'catering',status:'confirmed'},{kind:'cocktail',status:'confirmed'}]},{date:'2026-12-11',status:'confirmed',customer_name:'상담중',services:[{kind:'catering',status:'pending'}]},{date:'2026-12-12',status:'cancelled',customer_name:'취소예약',services:[{kind:'catering',status:'confirmed'}]},{date:'2026-12-12',status:'confirmed',customer_name:'칵테일확정',services:[{kind:'cocktail',status:'confirmed'}]}];
 context.drawCalendar([{date:'2026-12-11',state:'full'}],bookings,[]);let html=nodes['#cal-grid'].innerHTML;assert.equal(cells(html),42);assert.match(html,/뷔페확정/);assert.doesNotMatch(html,/상담중|취소예약|칵테일확정|종일 마감/);assert.match(nodes['#cal-service-summary'].textContent,/1건/);
 nodes['#cal-service-filter'].value='confirmed';context.drawCalendar([],bookings,[]);assert.match(nodes['#cal-service-summary'].textContent,/2건/);
 nodes['#cal-service-filter'].value='reception';context.drawCalendar([],bookings,[]);assert.match(nodes['#cal-service-summary'].textContent,/해당하는 건이 없습니다/);
 nodes['#cal-service-filter'].value='';context.drawCalendar([],bookings,[]);assert.equal(nodes['#cal-service-summary'].hidden,true);assert.match(nodes['#cal-grid'].innerHTML,/상담중/);
});

test('달력 상태·검색은 취소 기록도 조회하고 다른 상태·검색어를 제외한다',()=>{const {context,nodes}=calendar();nodes['#cal-status-filter']={value:'cancelled'};nodes['#cal-q']={value:'01012345678'};context.drawCalendar([],[{date:'2026-10-23',status:'cancelled',customer_name:'취소 검증',phone:'010-1234-5678'},{date:'2026-10-23',status:'completed',customer_name:'완료 검증',phone:'010-1234-5678'}],[]);assert.match(nodes['#cal-grid'].innerHTML,/취소 검증/);assert.doesNotMatch(nodes['#cal-grid'].innerHTML,/완료 검증/);assert.match(nodes['#cal-service-summary'].textContent,/1건/);});

test('식음료 단독 카드의 진행 상태 점은 시간 줄에 있고 결제와 본문은 그 아래에 있다',()=>{
 const {context,nodes}=calendar();
 context.foodEventTime=()=> '18:00–20:00';
 context.foodLabels={reception:'케이터링'};
 context.paymentBadge=(item,grid)=>grid?'[달력 결제]':'[목록 결제]';
 context.BST={confirmed:['예약 확정']};
 context.kd=value=>value;
 context.foodOperationsButton=()=>'';
 nodes['#cal-food-filter']={getAttribute:()=> 'true'};
 const booking={date:'2026-10-23',space_id:'food-only',booking_code:'FOOD-ONE',status:'confirmed',customer_name:'식음료 고객',services:[{kind:'reception',status:'confirmed'}],food_event:{location:'행사 장소'}};
 context.drawCalendar([],[booking,{...booking,status:'cancelled',booking_code:'FOOD-TWO'}],[]);
 const [active,cancelled]=nodes['#cal-grid'].innerHTML.match(/<i class="ev cal-food-event[^]*?<\/i>/g);
 assert.match(active,/class="cal-event-heading"[^]*?18:00–20:00<\/span><button[^]*?class="cal-food-dot"[^]*?<\/button><\/span><span class="cal-event-details">식음료 고객<br>행사 장소/);
 assert.match(active,/\[달력 결제\]<\/i>/);
 assert.doesNotMatch(cancelled,/cal-food-dot/);
 assert.match(nodes['#cal-food-agenda'].innerHTML,/\[목록 결제\]/);
});

test('전체 달력에서 대관과 식음료 수납액·잔금을 표시하고 취소 정산과 문의를 구분한다',()=>{
 const {context,nodes}=calendar();
 context.foodEventTime=()=> '18:00–20:00';
 context.foodLabels={reception:'케이터링'};
 context.foodSettlementValue=value=>value==null?'확인 필요':value.toLocaleString('ko-KR')+'원';
 context.paymentBadge=()=> '[결제]';
 const date='2026-10-23',base={date,status:'confirmed',start_h:13,end_h:21},services=[{kind:'reception',status:'confirmed'}];
 const venue={...base,space_id:'megaspot-gundae',booking_code:'BK-ROOM',customer_name:'대관 고객',services,deposit_paid:true,settlement:{received:200000,refunded:30000,net:170000,balance:330000}};
 const food={...base,space_id:'food-only',booking_code:'BK-FOOD',customer_name:'식음료 고객',settlement:{net:200000,balance:955000}};
 const cancelled={...base,status:'cancelled',space_id:'megaspot-gundae-2',customer_name:'취소 고객',settlement:{net:100000,balance:0,refund_due:80000}};
 const unpriced={...base,space_id:'megaspot-gundae-2',customer_name:'금액 미정 고객',settlement:{net:0,balance:null}};
 const inquiry={event_date:date,ref:'MS-LEAD',space_id:'megaspot-gundae',status:'문의 접수',name:'문의 고객',services};
 context.drawCalendar([],[venue,food,cancelled,unpriced],[inquiry]);
 const cards=nodes['#cal-grid'].innerHTML.match(/<i class="ev [^]*?<\/i>/g);
 const card=name=>cards.find(html=>html.includes(name));
 assert.match(card('대관 고객'),/현재 수납액<\/span> <b>170,000원<\/b>.*남은 잔금<\/span> <b>330,000원<\/b>/);
 assert.match(card('대관 고객'),/class="cal-event-heading"[^]*?class="cal-food-dot"[^]*?<\/button><\/span><span class="cal-event-details">대관 고객/);
 assert.match(card('식음료 고객'),/현재 수납액<\/span> <b>200,000원<\/b>.*남은 잔금<\/span> <b>955,000원<\/b>/);
 assert.match(card('취소 고객'),/다시 받아야 할 금액<\/span> <b>0원<\/b>.*추가 환불 필요액<\/span> <b>80,000원<\/b>/);
 assert.doesNotMatch(card('취소 고객'),/남은 잔금/);
 assert.match(card('금액 미정 고객'),/남은 잔금<\/span> <b>확인 필요<\/b>/);
 assert.match(card('문의 고객'),/class="cal-event-heading"[^]*?class="cal-food-dot"[^]*?<\/button><\/span><span class="cal-event-details">문의 고객/);
 assert.doesNotMatch(card('문의 고객'),/수납액|잔금/);
});
