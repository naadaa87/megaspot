import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { cocktailFrom } from '../functions/api/_cocktail.js';
import { onRequestPost } from '../functions/api/inquiry.js';

const expected = [[100, 800000], [200, 1100000], [300, 1500000], [400, 1800000]];
test('칵테일 패키지는 서버 가격으로 다시 계산하고 잘못된 메뉴를 제거한다', () => {
  for (const [cups, price] of expected) {
    const q = cocktailFrom({ cups, price: 1, menus: ['mojito', 'not-a-menu', 'mojito'], nonalcohol: true });
    assert.equal(q.price, price);
    assert.deepEqual(q.menus, ['mojito']);
    assert.match(q.summary, new RegExp(`${cups}잔`));
  }
  assert.equal(cocktailFrom({ cups: 150 }), null);
});

test('대관 신청에 선택한 칵테일 구성이 문의 기록에 저장된다', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { DB: { prepare(sql) { const st = db.prepare(sql); let args = [];
    return { bind(...a) { args = a; return this; }, async first() { return st.get(...args) ?? null; }, async all() { return { results: st.all(...args) }; }, async run() { return st.run(...args); } }; } } };
  const body = { name: '김칵테일', phone: '010-3000-4000', agree_privacy: true, space_id: 'megaspot-gundae', reserve: true,
    date: '2027-01-20', headcount: 80, total: 500000, cocktail: { cups: 200, price: 1, menus: ['mojito', 'blue_sapphire'], nonalcohol: true, note: '모히토와 블루 사파이어' } };
  const res = await onRequestPost({ env, request: new Request('https://megaspot.test/api/inquiry', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.81.0.1' }, body: JSON.stringify(body) }) });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT data FROM inquiries LIMIT 1').get();
  const saved = JSON.parse(row.data);
  assert.equal(saved.cocktail.cups, 200);
  assert.equal(saved.cocktail.price, 1100000);
  assert.deepEqual(saved.cocktail.menus, ['mojito', 'blue_sapphire']);
  assert.equal(saved.total, 500000, '대관 금액과 칵테일 표시 가격은 별도로 보관');
});
