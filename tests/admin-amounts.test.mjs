// Run with Node 22.13+ (node:sqlite): node --test tests/admin-amounts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { onRequest } from '../functions/api/admin/[[path]].js';
import { kstToday } from '../functions/api/_lib.js';

const source = readFileSync(new URL('../assets/js/pages/admin.js', import.meta.url), 'utf8');
const date = kstToday();
function fixture({ status = '예약 확정', booking = true, amount = 500000, quote = 600000 } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO inquiries (ref,space_id,status,name,phone,event_date,headcount,data,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('MS-TEST', 'megaspot-gundae', status, '테스트', '010-1234-5678', date, 30, JSON.stringify({ total: 450000, date, name: '테스트', phone: '010-1234-5678', headcount: 30 }), date);
  if (booking) db.prepare('INSERT INTO bookings (booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,amount,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('BK-TEST', 'megaspot-gundae', 'MS-TEST', '테스트', '010-1234-5678', '5678', date, 'confirmed', amount, date);
  if (quote !== null) db.prepare('INSERT INTO quotes (quote_no,inquiry_ref,total,data,created_at) VALUES (?,?,?,?,?)')
    .run('Q-TEST', 'MS-TEST', quote, '{}', date);
  const env = { ADMIN_KEY: 'test-only', DB: {
    prepare(sql) {
      const stmt = db.prepare(sql); let args = [];
      return { bind(...values) { args = values; return this; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { return stmt.run(...args); } };
    },
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = []; for (const stmt of stmts) out.push(await stmt.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  } };
  async function api(path, method = 'GET', body, expectedStatus = 200) {
    const response = await onRequest({ env, params: { path: path.split('?')[0].split('/') }, request: new Request('https://megaspot.test/api/admin/' + path, {
      method, headers: { 'x-admin-key': env.ADMIN_KEY, origin: 'https://megaspot.test', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }) });
    const result = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(result));
    return result;
  }
  return { db, api };
}
async function checkViews(api, expected, { confirmed = true } = {}) {
  const reservations = await api('reservations');
  assert.equal(reservations.items[0].amount, expected, '일자별 예약 금액');
  assert.equal((await api('inquiries')).items[0].effective_amount, expected, '문의 목록 금액');
  assert.equal((await api('inquiries/MS-TEST')).item.effective_amount, expected, '상세 재조회 금액');
  const dash = await api('dashboard');
  assert.equal(confirmed ? dash.month.confirmed_amount : dash.month.quoted_amount, expected ?? 0, '대시보드 합계');
  if (confirmed) {
    assert.equal((await api('bookings')).items[0].amount, expected, '예약 관리 금액');
    assert.equal(dash.upcoming[0].amount, expected, '대시보드 예정 예약 금액');
  }
  return reservations.items;
}

for (const [label, value, expected] of [['금액 수정', 800000, 800000], ['0원', 0, 0], ['빈 값', '', null], ['null', null, null]]) {
  test(`상세 금액 저장 → 모든 목록·합계 반영: ${label}`, async t => {
    const { db, api } = fixture(); t.after(() => db.close());
    await api('inquiries/MS-TEST', 'PATCH', { total: value, amount_note: '금액 변경' });
    await checkViews(api, expected);
    assert.equal(db.prepare('SELECT total FROM quotes').get().total, 600000, '기존 견적서 보존');
  });
}
for (const mode of ['manual', 'auto', 'none', 'keep']) {
  test(`내용 수정 창 금액 모드: ${mode}`, async t => {
    const { db, api } = fixture(); t.after(() => db.close());
    await api('inquiries/MS-TEST', 'PATCH', { edit: true, name: '수정 고객', phone: '010-1234-5678', date, headcount: 40, amount_mode: mode, total: 900000 });
    await checkViews(api, mode === 'keep' ? 500000 : mode === 'none' ? null : 900000);
  });
}
test('미확정 문의도 기존 견적보다 수정 금액을 우선', async t => {
  const { db, api } = fixture({ status: '견적 발송', booking: false }); t.after(() => db.close());
  await api('inquiries/MS-TEST', 'PATCH', { total: 700000 });
  await checkViews(api, 700000, { confirmed: false });
});
test('견적 없이 등록한 예약의 금액도 월 합계에 포함', async t => {
  const { db, api } = fixture({ quote: null }); t.after(() => db.close());
  await checkViews(api, 500000);
});
test('금액을 수정하지 않은 기존 건은 예약·견적 우선순위 유지', async t => {
  const { db, api } = fixture(); t.after(() => db.close());
  await checkViews(api, 500000);
  await api('inquiries/MS-TEST', 'PATCH', { memo: '메모만 수정', channel: 'phone' });
  await checkViews(api, 500000);
});
test('예약 금액이 비어 있으면 기존 견적 금액 사용', async t => {
  const { db, api } = fixture({ amount: null }); t.after(() => db.close());
  await checkViews(api, 600000);
});
test('온라인 결제 원장 금액은 관리자 수정과 별도로 보존', async t => {
  const { db, api } = fixture(); t.after(() => db.close());
  db.prepare('INSERT INTO orders (oid,product_id,title,price,buyer_name,buyer_phone,data,status,booking_code,inquiry_ref,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('ORDER-TEST', 'pkg-day', '테스트', 500000, '테스트', '010-1234-5678', '{}', 'paid', 'BK-TEST', 'MS-TEST', date, date);
  await api('inquiries/MS-TEST', 'PATCH', { total: 850000 });
  await checkViews(api, 850000);
  assert.equal(db.prepare('SELECT price FROM orders').get().price, 500000);
  assert.equal((await api('dashboard')).month.orders_amount, 500000);
});
test('문의가 없는 직접 예약도 금액 유지', async t => {
  const { db, api } = fixture(); t.after(() => db.close());
  db.exec('UPDATE bookings SET inquiry_ref = NULL');
  assert.equal((await api('bookings')).items[0].amount, 500000);
  assert.equal((await api('reservations')).items[0].amount, 500000);
});
test('확정 창에서 다시 정한 금액이 이전 수정액보다 우선', async t => {
  const { db, api } = fixture({ status: '견적 발송', booking: false }); t.after(() => db.close());
  await api('inquiries/MS-TEST', 'PATCH', { total: 750000 });
  await api('inquiries/MS-TEST/confirm', 'POST', { date, amount: 850000, start_h: 10, end_h: 17 });
  await checkViews(api, 850000);
});
test('잘못된 금액은 저장하지 않음', async t => {
  const { db } = fixture(); t.after(() => db.close());
  // Validation uses the same handler without the success-only api helper.
  const env = { ADMIN_KEY: 'test-only', DB: { prepare() { throw Error('잘못된 금액은 DB 변경 전에 거절해야 함'); } } };
  const res = await onRequest({ env, params: { path: ['inquiries', 'MS-TEST'] }, request: new Request('https://megaspot.test/api/admin/inquiries/MS-TEST', {
    method: 'PATCH', headers: { 'x-admin-key': 'test-only', origin: 'https://megaspot.test' }, body: JSON.stringify({ total: -1 })
  }) });
  assert.equal(res.status, 400);
});

test('프런트엔드 목록·확정 창이 0원·미정을 기존 견적으로 대체하지 않음', () => {
  const start = source.indexOf('  function currentAmount('), end = source.indexOf('  function row(', start);
  const context = vm.createContext({}); vm.runInContext(source.slice(start, end), context);
  for (const amount of [800000, 0, null]) {
    assert.equal(context.currentAmount({ effective_amount: amount, quote_total: 600000, data: { total: 450000 } }, { total: 600000 }), amount);
  }
});
test('수정 금액이 일자별 목록·월 소계·확정 금액 합계에 렌더링됨', async t => {
  const { db, api } = fixture(); t.after(() => db.close());
  await api('inquiries/MS-TEST', 'PATCH', { total: 800000 });
  const items = (await api('reservations')).items;
  const nodes = {};
  const context = vm.createContext({ RS: { items, today: date, kind: 'all', undated: 0 }, E: null, DOWK: ['일','월','화','수','목','금','토'],
    $: sel => nodes[sel] ||= { innerHTML: '' }, $$: () => [], resvBase: () => items, resvFiltered: () => items,
    waitOrder() {}, dLabel: () => '', esc: String, man: n => n + '원', won: n => n + '원',
    resvRow: it => '<tr><td>' + it.amount + '원</td></tr>' });
  const start = source.indexOf('  function dayStats('), end = source.indexOf('  function resvRow(', start);
  vm.runInContext(source.slice(start, end) + '\ndrawResv();', context);
  assert.match(nodes['#rs-kpis'].innerHTML, /확정 금액 합계<\/small><b>800000원/);
  assert.match(nodes['#rs-list'].innerHTML, /확정 1건 · 800000원/);
  assert.match(nodes['#rs-list'].innerHTML, /<td>800000원<\/td>/);
});

for (const [label, body, expected] of [
  ['기존 금액 저장', { total: 810000 }, 810000],
  ['기존 0원 저장', { total: 0 }, 0],
  ['기존 금액 비우기', { total: '' }, null],
  ['기존 내용 수정', { edit: true, name: '수정 고객', phone: '010-1234-5678', date, amount_mode: 'manual', total: 820000 }, 820000],
  ['기존 나중에 정하기', { edit: true, name: '수정 고객', date, amount_mode: 'none' }, null]
]) {
  test(`배포 전에 저장한 수정액도 변경 기록으로 반영: ${label}`, async t => {
    const { db, api } = fixture(); t.after(() => db.close());
    await api('inquiries/MS-TEST', 'PATCH', body);
    // Previous versions saved the same total and change log without an override marker.
    db.exec("UPDATE inquiries SET data = json_remove(data, '$.amount_override')");
    await checkViews(api, expected);
  });
}
test('이전 금액 수정보다 나중에 확정한 예약 금액을 유지', async t => {
  const { db, api } = fixture({ status: '견적 발송', booking: false }); t.after(() => db.close());
  await api('inquiries/MS-TEST', 'PATCH', { total: 750000 });
  await api('inquiries/MS-TEST/confirm', 'POST', { date, amount: 850000, start_h: 10, end_h: 17 });
  // The old confirmation handler kept the inquiry estimate unchanged.
  db.exec("UPDATE inquiries SET data = json_set(json_remove(data, '$.amount_override'), '$.total', 750000)");
  await checkViews(api, 850000);
});
test('관리자 최초 등록액은 기존 견적 우선순위를 변경하지 않음', async t => {
  const { db, api } = fixture({ status: '견적 발송', booking: false }); t.after(() => db.close());
  db.exec("UPDATE inquiries SET data = json_set(data, '$.source', 'admin', '$.amount_mode', 'manual')");
  await checkViews(api, 600000, { confirmed: false });
});

test('운영 메모 수정·비우기가 확정 예약과 문의 목록에 동일하게 반영', async t => {
  const { db, api } = fixture(); t.after(() => db.close());
  db.prepare('UPDATE bookings SET memo = ?').run('예약 생성 시 남은 이전 메모');
  for (const memo of ['주차 안내 완료\n장비 <추가> 요청', '']) {
    await api('inquiries/MS-TEST', 'PATCH', { memo });
    assert.equal((await api('reservations')).items[0].memo, memo, '확정 예약의 현재 운영 메모');
    assert.equal((await api('inquiries')).items[0].memo, memo, '문의 목록의 현재 운영 메모');
    assert.equal((await api('inquiries/MS-TEST')).item.memo, memo, '상세 화면의 현재 운영 메모');
  }
});
test('미확정 문의의 운영 메모도 일자별 예약에서 조회', async t => {
  const { db, api } = fixture({ status: '문의 접수', booking: false }); t.after(() => db.close());
  await api('inquiries/MS-TEST', 'PATCH', { memo: '방문 상담 예정' });
  assert.equal((await api('reservations')).items[0].memo, '방문 상담 예정');
});
test('연결 문의가 없는 직접 예약은 예약 자체 메모 유지', async t => {
  const { db, api } = fixture(); t.after(() => db.close());
  db.prepare('UPDATE bookings SET inquiry_ref = NULL, memo = ?').run('직접 예약 메모');
  assert.equal((await api('reservations')).items[0].memo, '직접 예약 메모');
});

function copyContext() {
  const context = vm.createContext({});
  const amountStart = source.indexOf('  function currentAmount(');
  const copyStart = source.indexOf('  function copyInquiryDraft(');
  const slotStart = source.indexOf('  var SLOT_H=');
  vm.runInContext(source.slice(slotStart, source.indexOf('\n', slotStart)) + '\n'
    + source.slice(amountStart, source.indexOf('  function row(', amountStart))
    + source.slice(copyStart, source.indexOf('  function openEdit(', copyStart)), context);
  return context;
}
for (const amount of [800000, 0, null]) {
  test(`문의 복사는 현재 금액을 유지하고 새 날짜·진행 상태를 초기화: ${amount}`, () => {
    const it = { ref: 'MS-ORIGINAL', status: '예약 확정', event_date: date, effective_amount: amount, memo: '운영 메모',
      data: { total: 450000, amount_mode: 'auto', date, purpose: 'year-end', slot: 'pkg-allnight', wait_rank: 1,
        options: { manager: { count: 2, hours: 4 } }, member_id: 'original-member', reserve: true } };
    const before = JSON.stringify(it);
    const draft = copyContext().copyInquiryDraft(it, { total: 600000 });
    assert.equal(draft.data.date, '');
    assert.equal(draft.event_date, undefined);
    assert.equal(draft.status, undefined);
    assert.equal(draft.data.total, amount);
    assert.equal(draft.data.amount_mode, amount === null ? 'none' : 'manual');
    assert.equal(draft.data.start_h, 18);
    assert.equal(draft.data.end_h, 31);
    assert.equal(draft.data.purpose, 'year-end');
    assert.equal(draft.data.wait_rank, undefined);
    assert.equal(draft.data.member_id, undefined);
    assert.equal(draft.data.reserve, undefined);
    draft.data.options.manager.count = 3;
    assert.equal(JSON.stringify(it), before, '복사본 수정이 원본 데이터에 영향을 주지 않음');
  });
}
test('다른 날짜로 복사 등록하면 원본 예약·견적을 보존하고 새 문의로 대기', async t => {
  const { db, api } = fixture(); t.after(() => db.close());
  await api('inquiries/MS-TEST', 'PATCH', { total: 830000, memo: '장비 반입 협의' });
  const original = await api('inquiries/MS-TEST');
  const draft = copyContext().copyInquiryDraft(original.item, original.quotes[0]);
  const newDate = new Date(Date.parse(date + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
  const created = await api('inquiries', 'POST', { ...draft.data, name: draft.data.name || draft.name,
    phone: draft.data.phone || draft.phone, memo: draft.memo, date: newDate, status: '문의 접수' });
  assert.notEqual(created.ref, original.item.ref);
  const copied = await api('inquiries/' + created.ref);
  assert.equal(copied.item.event_date, newDate);
  assert.equal(copied.item.status, '문의 접수');
  assert.equal(copied.item.effective_amount, 830000);
  assert.equal(copied.item.memo, '장비 반입 협의');
  assert.equal(copied.wait.date, newDate);
  assert.equal(copied.wait.no, 1);
  assert.equal(copied.bookings.length, 0);
  assert.equal(copied.quotes.length, 0);
  assert.deepEqual(copied.checks, {});
  const pending = (await api('reservations')).items.find(it => it.ref === created.ref);
  assert.equal(pending.kind, 'pending');
  assert.equal(pending.date, newDate);
  assert.equal(pending.amount, 830000);
  assert.deepEqual(await api('inquiries/MS-TEST'), original, '원본 상태·예약·견적·변경 기록 보존');
});

test('대기 취소는 기록·견적·금액을 보존하고 순번·현재 대기 집계에서 제외', async t => {
  const { db, api } = fixture({ status: '견적 발송', booking: false }); t.after(() => db.close());
  await api('inquiries/MS-TEST', 'PATCH', { memo: '보존할 운영 메모', total: 700000 });
  await api('inquiries/MS-TEST/wait-cancel', 'POST');
  const cancelled = await api('inquiries/MS-TEST');
  assert.equal(cancelled.item.status, '대기 취소');
  assert.equal(cancelled.item.memo, '보존할 운영 메모');
  assert.equal(cancelled.item.effective_amount, 700000);
  assert.equal(cancelled.quotes.length, 1);
  assert.equal(cancelled.wait, null);
  assert.equal((await api('inquiries?status=open')).items.length, 0);
  const records = (await api('reservations')).items;
  assert.equal(records[0].status, '대기 취소');
  assert.equal(records[0].amount, 700000);
  assert.equal((await api('dashboard')).month.quoted_amount, 0);
  await api('inquiries/MS-TEST/confirm', 'POST', { date, amount: 700000 }, 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
  const other = await api('inquiries', 'POST', { name: '다른 대기', date });
  await api('inquiries/MS-TEST/wait-restore', 'POST');
  const restored = await api('inquiries/MS-TEST');
  assert.equal(restored.item.status, '견적 발송');
  assert.equal(restored.wait.no, 2, '복원하면 신규 대기 뒤로 이동');
  assert.equal((await api('inquiries/' + other.ref)).wait.no, 1);
});
test('확정 예약이 연결된 문의는 대기 취소로 바꾸지 않음', async t => {
  const { db, api } = fixture(); t.after(() => db.close());
  await api('inquiries/MS-TEST/wait-cancel', 'POST', {}, 409);
  await api('inquiries/MS-TEST/wait-restore', 'POST', {}, 409);
  assert.equal((await api('inquiries/MS-TEST')).item.status, '예약 확정');
  assert.equal(db.prepare('SELECT status FROM bookings').get().status, 'confirmed');
});
test('대기 취소 행은 회색 기록·복원 버튼만 표시하고 집계·순번에서 제외', () => {
  const active = {kind:'pending',ref:'MS-A',date,name:'대기',status:'문의 접수'};
  const cancelled = {kind:'pending',ref:'MS-B',date,name:'취소',status:'대기 취소',amount:500000};
  const context = vm.createContext({ RS:{items:[active,cancelled]}, BST:{}, ST_CLS:{'대기 취소':'st-cancel'}, esc:String, famAsk:()=>'', PUR:{}, SRC:{}, resvTime:()=>'', resvHours:()=>'', waitDraggable:()=>true, won:String, chTag:()=>'' });
  vm.runInContext(source.slice(source.indexOf('  function waitCmp('),source.indexOf('  function drawResv(')) + '\n'
    + source.slice(source.indexOf('  function resvRow('),source.indexOf("  $('#rs-ch').innerHTML")), context);
  context.waitOrder();
  assert.equal(active._waitN,1);
  assert.equal(cancelled._wait,undefined);
  assert.equal(context.dayStats([active,cancelled])[date].pend,1);
  const html=context.resvRow(cancelled,{bk:0},false);
  assert.match(html,/wait-cancelled/);
  assert.match(html,/data-waitact="restore"/);
  assert.doesNotMatch(html,/data-rsconfirm=|rs-grip|data-waitact="cancel"/);
});
