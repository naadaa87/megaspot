// 자주 묻는 질문 모음 (/help/) — 2026-11-24
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildAll, collect, CATS } from '../tools/faq/build.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('help/index.html 과 sitemap.xml 이 tools/faq/build.mjs 결과와 같다', () => {
  const { files } = buildAll();
  for (const [f, text] of Object.entries(files)) assert.equal(read(f), text, f + ' — node tools/faq/build.mjs 를 다시 돌려 주세요');
});

test('질문은 공개 화면의 FAQ 에서만 모으고, 번호가 겹치지 않으며 모든 분류가 정해져 있다', () => {
  const list = collect(), ids = new Set(list.map(x => x.id)), cats = new Set(CATS.map(([k]) => k));
  assert.ok(list.length >= 150, '질문 수 ' + list.length);
  assert.equal(ids.size, list.length);
  for (const x of list) {
    assert.ok(cats.has(x.cat), x.q);
    assert.ok(x.q && x.a && x.source, x.q);
    const file = x.path.replace(/^\//, '') + 'index.html';
    assert.ok(existsSync(new URL('../' + file, import.meta.url)), x.path);
  }
  assert.ok(!list.some(x => x.path === '/help/'));
  assert.ok(list.some(x => x.path === '/my-booking/'), '나의 예약확인 안내 질문');
});

test('검색 화면은 검색엔진에 열려 있고 머리말·꼬리말에서 들어올 수 있다', () => {
  const page = read('help/index.html');
  assert.match(page, /<meta name="robots" content="index,follow/);
  assert.match(page, /<link rel="canonical" href="https:\/\/megaspot\.kr\/help\/">/);
  assert.match(page, /id="hp-q"[^>]*type="search"/);
  assert.match(page, /\/assets\/js\/pages\/help\.js\?v=[0-9a-f]{12}/);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/megaspot\.kr\/help\/<\/loc>/);
  assert.match(read('tools/site-chrome/partials/header.html'), /href="\/help\/"/);
  assert.match(read('tools/site-chrome/partials/footer.html'), /href="\/help\/"/);
  assert.match(read('guide/index.html'), /href="\/help\/"/);
  assert.ok(!/예스출장/.test(page));
});
