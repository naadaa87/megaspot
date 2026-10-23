import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/pages/admin.js', import.meta.url), 'utf8');
function calendar() {
  const nodes = {}, requests = [];
  const context = vm.createContext({
    $: selector => nodes[selector] ||= { innerHTML: '', textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
    A: path => new Promise((resolve, reject) => requests.push({ path, resolve, reject })),
    M: { pad2: n => String(n).padStart(2, '0') }, E: null,
    todayIso: () => '2026-10-23', guard: () => false, esc: String
  });
  vm.runInContext(source.slice(source.indexOf('  var calMonth='), source.indexOf("  $('#cal-prev').addEventListener")), context);
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
