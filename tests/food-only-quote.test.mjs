import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, DAY } from './helpers/admin-fixture.mjs';
import { quoteUi } from './helpers/admin-quote-fixture.mjs';
import { cateringAdmin } from '../functions/api/_catering.js';
import { cocktailAdmin } from '../functions/api/_food_services.js';
import { receptionAdmin } from '../functions/api/_reception.js';

const reception = receptionAdmin({ course: 'cf-manual', unit_price: 20000, people: 45, format: 'table' });
const selections = {
  catering: cateringAdmin({ course: 'small-basic', people: 34, beer: 1 }),
  reception,
  cocktail: cocktailAdmin({ cups: 100, menus: ['mojito'], note: '얼음 추가' }),
};
const rows = Object.entries(selections).map(([kind, value]) => ({ kind, [kind]: value, amount: value.total }));

test('save and reopen external food-only estimates individually and together, with immutable amounts and document details', async t => {
  const f = fixture({ booking: true });
  t.after(() => f.db.close());
  const existing = await f.api('inquiries/MS-TEST');
  const location = '성수 <컨퍼런스홀> 3층';
  const ui = quoteUi();
  for (const extras of [...rows.map(row => [row]), rows]) {
    ui.ctx.Q = Object.assign(ui.ctx.blankQ(true), {
      date: DAY, location, customer: '검증 고객', people: 45, extras,
      foodStartTime: '18:35', foodEndTime: extras.length === 1 ? '20:10' : '00:05',
    });
    const total = extras.reduce((sum, row) => sum + row.amount, 0);
    assert.equal(ui.documents().total, total);
    const saved = await f.api('quotes', 'POST', ui.ctx.payload());
    const stored = (await f.api('quotes')).items[0];
    assert.equal(stored.quote_no, saved.quote_no);
    assert.equal(stored.inquiry_ref, null);
    assert.deepEqual(stored.data.lines, []);
    assert.equal(stored.data.location, location);
    assert.equal(stored.total, total);
    assert.equal(stored.data.deposit, 0);
    assert.equal(stored.data.input.foodStartTime, ui.ctx.Q.foodStartTime);
    assert.equal(stored.data.input.foodEndTime, ui.ctx.Q.foodEndTime);

    const reopened = quoteUi();
    await reopened.ctx.loadSavedQuote(stored, null);
    const {html, text} = reopened.documents();
    assert.match(html, /성수 &lt;컨퍼런스홀&gt; 3층/);
    assert.ok(text.includes(location));
    const hours = extras.length === 1 ? '18:35–20:10' : '18:35–다음 날 00:05';
    assert.ok(html.includes('<th>행사 시간</th><td colspan="3">' + hours + '</td>'));
    assert.ok(text.includes('· 행사 시간: ' + hours));
    assert.match(html, /공급가액.*부가세.*합계/);
    assert.ok(text.includes('합계 '+ui.ctx.won(total)+' (부가세 포함)'));
    assert.doesNotMatch(html+text, /건대|공간료|대관 인원|보증금|취소 시 환불/);
  }
  const original = (await f.api('quotes')).items[0];
  await ui.ctx.loadSavedQuote(original, null);
  const box = receptionAdmin({ course: 'cf-manual', unit_price: 20000, people: 45, format: 'box' });
  ui.ctx.Q.extras = ui.ctx.Q.extras.map(row => row.kind === 'reception' ? { kind: 'reception', reception: box, amount: box.total } : row);
  ui.ctx.Q.location = '서초 행사장';
  ui.ctx.Q.foodStartTime = '17:25';
  ui.ctx.Q.foodEndTime = '';
  assert.match(ui.documents().text, /행사 시간: 17:25 시작/);
  assert.match(ui.documents().html, /배송비: 30,000원/);
  assert.match(ui.documents().text, /서초 행사장/);
  const changed = await f.api('quotes', 'POST', ui.ctx.payload());
  const saved = (await f.api('quotes')).items;
  assert.notEqual(changed.quote_no, original.quote_no);
  assert.equal(saved[0].total, original.total - 242000);
  assert.deepEqual(saved[1], original);
  assert.equal(saved[0].data.input.foodStartTime, '17:25');
  assert.equal(saved[0].data.input.foodEndTime, '');
  const after = await f.api('inquiries/MS-TEST');
  assert.deepEqual(after.item, existing.item);
  assert.deepEqual(after.bookings, existing.bookings);
});

test('food-only API rejects linked, duplicate, empty and inconsistent quotes', async t => {
  const f = fixture();
  t.after(() => f.db.close());
  const body = { total: reception.total, data: { input: { foodOnly: true }, extras: [rows[1]] } };
  await f.api('quotes', 'POST', {...body, inquiry_ref: 'MS-TEST'}, 400);
  await f.api('quotes', 'POST', {...body, total: 0, data: {...body.data, extras: []}}, 400);
  await f.api('quotes', 'POST', {...body, total: reception.total * 2, data: {...body.data, extras: [rows[1], rows[1]]}}, 400);
  await f.api('quotes', 'POST', {...body, total: body.total + 1}, 400);
  assert.equal((await f.api('quotes')).items.length, 0);
});

test('allows unset event times for older quotes and rejects invalid minute-level times', async t => {
  const f = fixture();
  t.after(() => f.db.close());
  const ui = quoteUi();
  ui.ctx.Q = Object.assign(ui.ctx.blankQ(true), { date: DAY, extras: [rows[1]] });
  assert.doesNotMatch(ui.documents().html + ui.documents().text, /행사 시간/);
  const body = ui.ctx.payload();
  await f.api('quotes', 'POST', body);
  const stored = (await f.api('quotes')).items[0];
  assert.equal(stored.data.input.foodStartTime, '');
  assert.equal(stored.data.input.foodEndTime, '');

  for (const input of [{foodStartTime: '24:00'}, {foodEndTime: '20:60'}, {foodStartTime: '18:30:45'}, {foodStartTime: ['18:30']}]) {
    const result = await f.api('quotes', 'POST', {...body, data: {...body.data, input: {...body.data.input, ...input}}}, 400);
    assert.match(result.error, /행사 시작·종료 시간/);
  }
  assert.equal((await f.api('quotes')).items.length, 1);
});
