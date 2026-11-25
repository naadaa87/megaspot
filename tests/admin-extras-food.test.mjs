// 관리자 문의 등록의 기타 옵션 · 식음료 요청, 대관계약서 부가 옵션 여러 줄 (2026-11-25)
//  · 기타 옵션은 내역·금액으로 저장하고, 식음료 요청은 메모로 남긴다 (메뉴·금액은 식음료 계산에서)
//  · 이미 있는 문의·예약·계약서는 바뀌지 않는다
//   node --test tests/admin-extras-food.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/admin-fixture.mjs';
import { cleanContract, prefillFrom } from '../functions/api/_contracts.js';
import CD from '../assets/js/kit/contract-doc.js';

test('문의 직접 등록: 기타 옵션과 식음료 요청을 저장하고 기존 문의는 그대로', async () => {
  const f = fixture({ booking: true });
  const before = f.db.prepare("SELECT * FROM inquiries WHERE ref='MS-TEST'").get(), beforeB = f.db.prepare('SELECT * FROM bookings').all();
  const r = await f.api('inquiries', 'POST', { name: '새 고객', phone: '010-2222-3333', channel: 'phone', total: 750000, amount_mode: 'manual',
    option_extras: [{ label: '포토존 설치', amount: '150,000' }, { label: '', amount: 0 }, { label: '', amount: 30000 }],
    food_request: { catering: { on: true, people: '80', time: '18:30', note: '한식 위주' }, cocktail: { on: false, people: 10 }, bogus: { on: true } } });
  const row = f.db.prepare('SELECT data FROM inquiries WHERE ref=?').get(r.ref), d = JSON.parse(row.data);
  assert.deepEqual(d.option_extras, [{ label: '포토존 설치', amount: 150000 }, { label: '기타 옵션', amount: 30000 }]);
  assert.equal(d.option_extras_amount, 180000); assert.equal(d.total, 750000);
  assert.deepEqual(d.food_request, { catering: { on: true, people: 80, time: '18:30', note: '한식 위주' } });
  assert.match(d.summary, /기타 옵션: 포토존 설치 150,000원/); assert.match(d.summary, /식음료 요청: 출장뷔페 80명 18:30 \(한식 위주\)/);
  assert.deepEqual(f.db.prepare("SELECT * FROM inquiries WHERE ref='MS-TEST'").get(), before, '기존 문의는 그대로');
  assert.deepEqual(f.db.prepare('SELECT * FROM bookings').all(), beforeB, '기존 예약은 그대로');
  // 수정: 기타 옵션을 비우면 지우고, 보내지 않으면 그대로 둠
  await f.api('inquiries/' + r.ref, 'PATCH', { edit: true, name: '새 고객', amount_mode: 'keep', food_request: {} });
  let d2 = JSON.parse(f.db.prepare('SELECT data FROM inquiries WHERE ref=?').get(r.ref).data);
  assert.equal(d2.option_extras.length, 2); assert.equal(d2.food_request, undefined);
  const e = await f.api('inquiries/' + r.ref, 'PATCH', { edit: true, name: '새 고객', amount_mode: 'keep', option_extras: [] });
  d2 = JSON.parse(f.db.prepare('SELECT data FROM inquiries WHERE ref=?').get(r.ref).data);
  assert.equal(d2.option_extras, undefined); assert.equal(d2.option_extras_amount, undefined); assert.ok(e.changed.includes('기타옵션'));
});

test('대관계약서: 부가 옵션 여러 줄의 합계가 부가 옵션 금액 · 예전 계약서는 그대로', () => {
  const c = cleanContract({ renter: { name: '테스트' }, space: 'megaspot-gundae', date: '2026-12-01', start: '10:00', end: '14:00',
    fee: { space: 600000, options_amount: 1, option_items: [{ label: '현장 매니저 2명', amount: '100,000' }, { label: '현수막', amount: 120000 }, { label: '', amount: '' }] } });
  assert.deepEqual(c.fee.option_items, [{ label: '현장 매니저 2명', amount: 100000 }, { label: '현수막', amount: 120000 }]);
  assert.equal(c.fee.options_amount, 220000); assert.equal(CD.totals(c.fee).total, 820000);
  const html = CD.html(c, {}); assert.match(html, /<ul class="cdoc-items"><li><span>현장 매니저 2명<\/span><span>100,000원<\/span><\/li>/);
  // 항목이 없는 예전 계약서: 저장값·화면이 예전과 같음
  const old = cleanContract({ renter: { name: '예전' }, space: 'megaspot-gundae', date: '2026-12-01', start: '10:00', end: '14:00', fee: { space: 500000, options_amount: 70000, options_etc: '현수막' } });
  assert.equal(old.fee.option_items, undefined); assert.equal(old.fee.options_amount, 70000);
  assert.ok(!CD.html(old, {}).includes('cdoc-items'));
});

test('계약서 불러오기: 문의의 기타 옵션은 부가 옵션 항목으로 나눠 적는다', () => {
  const settings = { balance_days: 15, methods: [], bank: {} };
  const p = prefillFrom({ inquiry: { space_id: 'megaspot-gundae', name: '고객', data: JSON.stringify({ name: '고객', total: 900000, option_extras: [{ label: '포토존', amount: 150000 }] }) }, settings });
  assert.equal(p.fee.space, 750000); assert.equal(p.fee.options_amount, 150000); assert.deepEqual(p.fee.option_items, [{ label: '포토존', amount: 150000 }]);
  const q = prefillFrom({ inquiry: { space_id: 'megaspot-gundae', name: '고객', data: JSON.stringify({ name: '고객', total: 900000 }) }, settings });
  assert.equal(q.fee.space, 900000); assert.equal(q.fee.options_amount, 0); assert.equal(q.fee.option_items, undefined);
});
