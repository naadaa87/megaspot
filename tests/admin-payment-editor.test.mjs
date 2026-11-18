import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/pages/admin.js',import.meta.url),'utf8');
function context(){const c=vm.createContext({Set,esc:s=>String(s).replace(/[<>&"']/g,'_')});vm.runInContext(source.slice(source.indexOf('  var PAYMENT_CHECKS='),source.indexOf('  function resvBase(')),c);return c;}
test('목록은 전체 결제 문구를 표시하고 달력은 짧은 표시와 전체 접근성 이름을 제공한다',()=>{
 const c=context(),item={booking_code:'BK-ONE',customer_name:'검증 고객',status:'confirmed',payment_status:'fully_paid'};
 assert.match(c.paymentBadge(item,false),/>결제 · 전체 입금 완료\(대관\+식음료\)/);const cal=c.paymentBadge(item,true);assert.match(cal,/>결제 · 전체 완료/);assert.match(cal,/title="전체 입금 완료\(대관\+식음료\)"/);assert.match(cal,/data-payment-editor="booking\/BK-ONE"/);
});
test('후보 문의는 문의 키를 쓰며 취소·삭제·대상 없음은 편집을 비활성화한다',()=>{
 const c=context();assert.match(c.paymentBadge({ref:'MS-ONE',status:'문의 접수',payment_status:'food_paid'},true),/data-payment-editor="inquiry\/MS-ONE"/);
 for(const item of [{booking_code:'BK-ONE',status:'cancelled'},{ref:'MS-ONE',status:'삭제됨'},{}])assert.match(c.paymentBadge(item,false),/ disabled/);
 assert(!c.paymentBadge({booking_code:'BK-ONE',customer_name:'<script>',status:'confirmed'},false).includes('<script>'));
});
