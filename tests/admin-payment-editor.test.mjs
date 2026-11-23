import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
function context(){const c=vm.createContext({Set,esc:s=>String(s).replace(/[<>&"']/g,'_')});vm.runInContext(source.slice(source.indexOf('  var PAYMENT_CHECKS='),source.indexOf('  function resvBase(')),c);return c;}
test('목록은 전체 결제 문구를 표시하고 달력은 짧은 표시와 전체 접근성 이름을 제공한다',()=>{
 const c=context(),item={booking_code:'BK-ONE',customer_name:'검증 고객',status:'confirmed',payment_status:'fully_paid'};
 assert.match(c.paymentBadge(item,false),/>결제 · 전체 입금 완료\(대관\+식음료\)/);const cal=c.paymentBadge(item,true);assert.match(cal,/>결제 · 대관\+식음료 완료/);assert.match(cal,/title="전체 입금 완료\(대관\+식음료\)"/);assert.match(cal,/data-payment-editor="booking\/BK-ONE"/);
});
test('후보 문의는 문의 키를 쓰며 취소·삭제·대상 없음은 편집을 비활성화한다',()=>{
 const c=context();assert.match(c.paymentBadge({ref:'MS-ONE',status:'문의 접수',payment_status:'food_paid'},true),/data-payment-editor="inquiry\/MS-ONE"/);
 for(const item of [{booking_code:'BK-ONE',status:'cancelled'},{ref:'MS-ONE',status:'삭제됨'},{}])assert.match(c.paymentBadge(item,false),/ disabled/);
 assert(!c.paymentBadge({booking_code:'BK-ONE',customer_name:'<script>',status:'confirmed'},false).includes('<script>'));
});

test('대관만 전체 완료도 명확히 구분되는 상태명을 제공한다',()=>{const c=context(),html=c.paymentBadge({booking_code:'BK-ONE',status:'confirmed',payment_status:'venue_fully_paid'},true);assert.match(html,/title="전체 입금 완료\(대관\)"/);assert.match(html,/>결제 · 대관 전체 완료/);});

test('식음료 월간 칸에서 결제 상태를 줄여 표시하고 전체 문구와 수납 메뉴를 유지한다',()=>{
 const c=context(),item={space_id:'food-only',booking_code:'FOOD-ONE',customer_name:'예약 고객',status:'confirmed',payment_status:'reservation_paid'};
 const grid=c.paymentBadge(item,true),list=c.paymentBadge(item,false);
 assert.match(grid,/<option value="">예약금 완료<\/option>/);
 assert.match(grid,/aria-label="예약 고객 결제 상태·입금 기록: 예약금 입금 완료"/);
 assert.match(grid,/title="예약금 입금 완료"/);
 assert.match(grid,/data-food-payment="FOOD-ONE"/);
 assert.match(grid,/<option value="balance">잔금 입금 완료<\/option>/);
 assert.match(grid,/<option value="refund">환불 기록<\/option>/);
 assert.match(list,/<option value="">예약금 입금 완료<\/option>/);
 assert.match(c.paymentBadge({...item,payment_status:'food_paid'},true),/<option value="">잔금 완료<\/option>/);
});
