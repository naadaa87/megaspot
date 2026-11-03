import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cocktailFrom } from '../functions/api/_cocktail.js';
import { onRequestPost } from '../functions/api/inquiry.js';

const expected = [[100, 1000000], [200, 1400000], [300, 1900000], [400, 2300000]];
test('칵테일 패키지는 서버 가격으로 다시 계산하고 잘못된 메뉴를 제거한다', () => {
  for (const [cups, price] of expected) {
    const q = cocktailFrom({ cups, price: 1, menus: ['mojito', 'not-a-menu', 'mojito'], nonalcohol: true });
    assert.equal(q.price, price);
    assert.deepEqual(q.menus, ['mojito']);
    assert.match(q.summary, new RegExp(`${cups}잔`));
    assert.match(q.summary, /희망 메뉴: 모히토/);
  }
  assert.equal(cocktailFrom({ cups: 150 }), null);
});

test('대관 신청에 선택한 칵테일 구성이 문의 기록에 저장된다', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { DB: { prepare(sql) { const st = db.prepare(sql); let args = [];
    return { bind(...a) { args = a; return this; }, async first() { return st.get(...args) ?? null; }, async all() { return { results: st.all(...args) }; }, async run() { return st.run(...args); } }; } } };
  const body = { name: '김칵테일', phone: '010-3000-4000', agree_privacy: true, space_id: 'megaspot-gundae', reserve: true,
    date: '2027-01-20', headcount: 80, total: 500000, cocktail: { cups: 200, price: 1, menus: ['mojito', 'blue_sapphire'], nonalcohol: true, note: '민트 적게' } };
  const res = await onRequestPost({ env, request: new Request('https://megaspot.test/api/inquiry', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.81.0.1' }, body: JSON.stringify(body) }) });
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT data FROM inquiries LIMIT 1').get();
  const saved = JSON.parse(row.data);
  assert.equal(saved.cocktail.cups, 200);
  assert.equal(saved.cocktail.price, 1400000);
  assert.deepEqual(saved.cocktail.menus, ['mojito', 'blue_sapphire']);
  assert.match(saved.cocktail.summary, /희망 메뉴: 모히토, 블루 사파이어/);
  assert.match(saved.cocktail.summary, /요청: 민트 적게/);
  assert.equal(saved.total, 500000, '대관 금액과 칵테일 표시 가격은 별도로 보관');
});

// A stale browser draft or supplied amount must use the current public prices.
test('고객 계산기·서버 판매가 일치, 이전 금액 재계산과 잔당 금액 반올림', () => {
  const ctx={window:{},Number,URLSearchParams,location:{search:''},sessionStorage:{getItem:()=>null}};
  vm.runInNewContext(readFileSync(new URL('../assets/js/cocktail-calc.js',import.meta.url),'utf8'),ctx);
  const C=ctx.window.MEGASPOT_COCKTAIL_CALC;
  for(const [cups,price] of expected){
    const browser=C.quote({cups,price:1});
    assert.equal(browser.price,price);assert.equal(cocktailFrom({cups,price:1}).price,price);
    assert.equal(browser.unit,price/cups);
  }
  assert.equal(C.won(C.quote({cups:300}).unit),'약 6,333원');
  assert.match(cocktailFrom({cups:300}).summary,/잔당 약 6,333원/);
});
