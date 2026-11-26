// 견적 계산: 저장한 견적 삭제 · 견적서 이미지 저장 (2026-11-26)
//  · 문의·예약에 연결되지 않은 견적만 삭제할 수 있고, quotes 원본 행은 남긴 채 목록에서만 뺀다
//  · 문의(inquiry_ref)·식음료 연결·문의 데이터에 적힌 견적은 지울 수 없다
//   node --test tests/quote-delete-image.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/admin-fixture.mjs';

test('저장한 견적 삭제: 단독 견적만 목록에서 빠지고 원본·연결 견적은 그대로', async () => {
  const f = fixture({ booking: true });
  const ins = f.db.prepare('INSERT INTO quotes(quote_no,inquiry_ref,customer,event_date,total,data,created_at) VALUES(?,?,?,?,?,?,?)');
  ins.run('Q-SOLO-1', null, '단독 고객', '2027-01-16', 1350000, '{}', '2026-11-25 01:00:00');
  ins.run('Q-LINK-1', 'MS-TEST', '문의 고객', '2027-01-16', 900000, '{}', '2026-11-25 02:00:00');
  ins.run('Q-FOOD-1', null, '식음료 고객', '2027-01-16', 500000, '{}', '2026-11-25 03:00:00');
  ins.run('Q-USED-1', null, '쓰인 견적', '2027-01-16', 400000, '{}', '2026-11-25 04:00:00');
  f.db.prepare('INSERT INTO food_quote_links(quote_no,inquiry_ref) VALUES(?,?)').run('Q-FOOD-1', 'MS-TEST');
  const inq = f.db.prepare("SELECT data FROM inquiries WHERE ref='MS-TEST'").get();
  f.db.prepare("INSERT INTO inquiries(ref,space_id,status,name,phone,data,created_at) VALUES('MS-USE2','megaspot-gundae','신규','사용','010-1','{\"food_event\":{\"quote_no\":\"Q-USED-1\"}}','2026-11-25')").run();
  const quotesBefore = f.db.prepare('SELECT * FROM quotes ORDER BY id').all(), inqBefore = f.db.prepare('SELECT * FROM inquiries ORDER BY rowid').all();
  await f.api('quotes/Q-LINK-1', 'DELETE', undefined, 409);
  await f.api('quotes/Q-FOOD-1', 'DELETE', undefined, 409);
  await f.api('quotes/Q-USED-1', 'DELETE', undefined, 409);
  await f.api('quotes/Q-NONE-1', 'DELETE', undefined, 404);
  const r = await f.api('quotes/q-solo-1', 'DELETE');
  assert.equal(r.quote_no, 'Q-SOLO-1');
  const list = (await f.api('quotes')).items.map(x => x.quote_no);
  assert.ok(!list.includes('Q-SOLO-1')); for (const q of ['Q-LINK-1', 'Q-FOOD-1', 'Q-USED-1']) assert.ok(list.includes(q), q);
  assert.deepEqual(f.db.prepare('SELECT * FROM quotes ORDER BY id').all(), quotesBefore, 'quotes 원본은 그대로');
  assert.deepEqual(f.db.prepare('SELECT * FROM inquiries ORDER BY rowid').all(), inqBefore, '문의는 그대로');
  assert.equal(f.db.prepare("SELECT data FROM inquiries WHERE ref='MS-TEST'").get().data, inq.data);
  await f.api('quotes/Q-SOLO-1', 'DELETE');   // 두 번 눌러도 문제 없음
});

test('관리자 화면 연결: 삭제 버튼·이미지 저장 버튼·표 정의', () => {
  const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../assets/js/pages/admin.js', import.meta.url), 'utf8');
  const img = readFileSync(new URL('../assets/js/pages/admin-quote-image.js', import.meta.url), 'utf8');
  assert.match(html, /id="q-image">견적서 이미지 저장</);
  assert.match(html, /admin-quote-image\.js\?v=[0-9a-f]{12}/);
  assert.match(js, /data-del-quote=/); assert.match(js, /!q\.inquiry_ref&&!q\.food_inquiry_ref/);
  assert.match(js, /MEGASPOT_QUOTE_IMAGE\.save\(document\.getElementById\('quote-print'\)/);
  assert.match(img, /image\/png/); assert.match(img, /html2pdf\.bundle\.min\.js/);
  assert.match(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'), /CREATE TABLE IF NOT EXISTS quote_deletions/);
  assert.match(readFileSync(new URL('../functions/api/_schema.js', import.meta.url), 'utf8'), /quote_deletions/);
  assert.match(readFileSync(new URL('../functions/api/_lib.js', import.meta.url), 'utf8'), /'quote_deletions'/);
});
