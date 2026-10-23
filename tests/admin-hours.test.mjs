import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../assets/js/pages/admin.js', import.meta.url), 'utf8');
function pricing() {
  const ctx = vm.createContext({window:{}});
  for (const file of ['data/holidays-kr.js','data/pricing-gundae.js','pricing-engine.js']) vm.runInContext(readFileSync(new URL('../assets/js/' + file, import.meta.url),'utf8'),ctx);
  return ctx.window.MEGASPOT_PRICE;
}
test('관리자 견적은 0~23시와 익일 07시 이후를 자르지 않고 계산', () => {
  const E=pricing();
  for(const date of ['2026-10-26','2026-12-25']) {
    for(let h=0;h<47;h++) {
      const q=E.quote({date,start:h,end:h+1,people:20,adminHours:true});
      assert.equal(q.start,h); assert.equal(q.end,h+1); assert.equal(q.hours,1);
      assert.ok(q.total>0); assert.equal(q.time.lines.reduce((n,l)=>n+l.hours,0),1);
    }
  }
  assert.equal(E.quote({date:'2026-10-26',start:0,end:2,people:20,adminHours:true}).total,80000);
  assert.equal(E.quote({date:'2026-10-26',start:31,end:34,people:20,adminHours:true}).total,120000);
  assert.equal(E.quote({date:'2026-10-26',start:23,end:26,people:20,adminHours:true}).total,180000);
  const overnight=E.quote({date:'2026-10-26',start:18,end:40,people:20,adminHours:true});
  assert.equal(overnight.end,40); assert.equal(overnight.hours,22);
  assert.match(overnight.range,/다음 날 16:00/);
});
test('공개 예약 화면의 기존 선택 범위와 패키지 가격 유지',()=>{
  const E=pricing();
  const publicQuote=E.quote({date:'2026-10-26',start:0,end:47,people:20});
  assert.equal(publicQuote.start,5); assert.equal(publicQuote.end,31);
  for(const [start,end,price] of [[10,17,300000],[10,24,800000],[18,31,700000]]) {
    const q=E.quote({date:'2026-10-26',start,end,people:20,adminHours:true});
    assert.equal(q.total,price);
  }
});
test('시간 선택 옵션과 자정 표기가 00시를 미정으로 처리하지 않음',()=>{
  const E=pricing(), ctx=vm.createContext({E,esc:String,SLOT:{}});
  for(const [start,end] of [['  function nwHourOpts(', '  function nwInit('],['  function timeText(', '  function optText('],['  function hl(', '  function bkTimes(']])
    vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),ctx);
  const options=ctx.nwHourOpts(0,47,0,'미정');
  assert.match(options,/<option value="0" selected>00:00<\/option>/);
  assert.match(options,/<option value="47">다음 날 23:00<\/option>/);
  assert.match(ctx.timeText({start_h:0,end_h:40},'–'),/^00:00–다음 날 16:00 \(40시간\)$/);
  assert.equal(ctx.hl(24),'익일 00:00');
});
