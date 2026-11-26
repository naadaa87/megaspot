// 외국어 화면 — 영어(/en/) · 일본어(/ja/) · 중국어 간체(/zh/) (2026-11-26)
//  · tools/i18n/build.mjs 결과물이 저장소와 같고, 요금·주차권 숫자가 한국어 화면 데이터와 같다
//  · 세 언어 글의 구조가 같고, 채우지 않은 {자리}가 화면에 남지 않는다
//  · hreflang 이 서로 이어지고(한국어 짝 화면 포함), 한국어 머리말에 언어 고르기가 있다
//  · 외국어 문의는 한국어 요약을 붙여 기존 문의 목록으로 들어간다 (국제 전화번호 허용)
//   node --test tests/i18n.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { buildAll, PAGES, LANGS } from '../tools/i18n/build.mjs';
import { TICKETS } from '../functions/api/_parking.js';
import { fixture } from './helpers/admin-fixture.mjs';
import { onRequestPost as inquire } from '../functions/api/inquiry.js';
import { kstToday } from '../functions/api/_lib.js';

const ROOT = new URL('..', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

test('생성 결과가 저장소와 같다 (node tools/i18n/build.mjs)', () => {
  const files = buildAll(), off = Object.entries(files).filter(([f, html]) => !existsSync(new URL(f, ROOT)) || read(f) !== html).map(([f]) => f);
  assert.deepEqual(off, []);
  assert.equal(Object.keys(files).filter(f => /^(en|ja|zh)\//.test(f)).length, PAGES.length * 3);
});

test('세 언어 글 구조가 같고 번역이 비어 있지 않다', () => {
  const shape = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'function' ? [p + k + '()'] : v && typeof v === 'object' && !Array.isArray(v) ? shape(v, p + k + '.') : [p + k + (Array.isArray(v) ? '[' + v.length + ']' : '')]);
  const [en, ja, zh] = LANGS;
  assert.deepEqual(shape(ja), shape(en)); assert.deepEqual(shape(zh), shape(en));
  for (const L of [ja, zh]) for (const k of ['home', 'g1', 'g2', 'rates', 'access', 'faq', 'contact']) {
    assert.notEqual(L.pages[k].title, en.pages[k].title, L.code + ' ' + k);
    assert.notEqual(L.pages[k].h1, en.pages[k].h1, L.code + ' ' + k);
  }
  assert.equal(ja.pages.faq.items.length, en.pages.faq.items.length); assert.equal(zh.pages.faq.items.length, en.pages.faq.items.length);
});

test('화면: 언어·canonical·hreflang 이 맞고 채우지 않은 자리가 없다', () => {
  for (const L of LANGS) for (const p of PAGES) {
    const f = `${L.code}/${p.slug}index.html`, h = read(f), url = `https://megaspot.kr/${L.code}/${p.slug}`;
    assert.match(h, new RegExp(`<html lang="${L.html}">`), f);
    assert.ok(h.includes(`<link rel="canonical" href="${url}">`), f);
    for (const M of LANGS) assert.ok(h.includes(`hreflang="${M.hreflang}" href="https://megaspot.kr/${M.code}/${p.slug}"`), f + ' → ' + M.code);
    if (p.ko) assert.ok(h.includes(`hreflang="ko" href="https://megaspot.kr${p.ko}"`), f + ' → ko');
    const text = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/data-msgs="[^"]*"/, '');
    assert.deepEqual(text.match(/\{[a-z_0-9]+\}/gi) || [], [], f);
    assert.ok(h.includes('class="site-header i18n-header"') && !h.includes('<header class="site-header">'), f + ' 외국어 머리말');
    assert.ok(h.includes('data-lang-sw'), f);
  }
  // 한국어 짝 화면에도 같은 hreflang 묶음
  for (const p of PAGES.filter(x => x.ko)) {
    const file = p.ko === '/' ? 'index.html' : p.ko.slice(1) + 'index.html', h = read(file);
    for (const L of LANGS) assert.ok(h.includes(`<link rel="alternate" hreflang="${L.hreflang}" href="https://megaspot.kr/${L.code}/${p.slug}">`), file + ' → ' + L.code);
    assert.equal((h.match(/hreflang="x-default"/g) || []).length, 1, file);
  }
  const sm = read('sitemap.xml');
  assert.match(sm, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  for (const L of LANGS) assert.ok(sm.includes(`<loc>https://megaspot.kr/${L.code}/rates/</loc>`));
  assert.equal((sm.match(/<loc>https:\/\/megaspot\.kr\/en\/<\/loc>/g) || []).length, 1, '영어 첫 화면은 한 번만');
});

test('요금·주차권 숫자는 한국어 화면 데이터와 같다', () => {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(read('assets/js/data/pricing-gundae.js'), ctx);
  const P = ctx.window.MEGASPOT_PRICING['megaspot-gundae'];
  const en = read('en/rates/index.html'), ja = read('ja/rates/index.html'), zh = read('zh/rates/index.html');
  for (const col of Object.values(P.hourly)) for (const v of Object.values(col)) {
    assert.ok(en.includes('KRW ' + v.toLocaleString('en-US')), 'en ' + v);
    assert.ok(ja.includes(v.toLocaleString('ja-JP') + 'ウォン'), 'ja ' + v);
    assert.ok(zh.includes(v.toLocaleString('zh-CN') + '韩元'), 'zh ' + v);
  }
  for (const p of P.packages) for (const v of Object.values(p.price)) assert.ok(en.includes('KRW ' + v.toLocaleString('en-US')), 'pkg ' + v);
  assert.ok(en.includes('KRW ' + P.deposit.amount.toLocaleString('en-US')));
  const acc = read('en/access/index.html');
  for (const t of Object.values(TICKETS)) assert.ok(acc.includes('KRW ' + t.price.toLocaleString('en-US')), 'parking ' + t.price);
});

test('한국어 화면: 머리말·전체 메뉴·꼬리말에 언어 고르기, 외국어 FAQ 는 한국어 모음에 섞이지 않음', () => {
  const header = read('tools/site-chrome/partials/header.html'), mnav = read('tools/site-chrome/partials/mobile-nav.html'), footer = read('tools/site-chrome/partials/footer.html');
  for (const s of [header, mnav, footer]) for (const p of ['/en/', '/ja/', '/zh/']) assert.ok(s.includes(`href="${p}"`), p);
  assert.ok(header.includes('data-lang-sw'));
  const home = read('index.html'); assert.ok(home.includes('class="hero-lang"') && home.includes('data-lang-sw'));
  assert.match(read('tools/faq/build.mjs'), /'en', 'ja', 'zh'\]/);
  assert.ok(!read('help/index.html').includes('Can I book if I don'));
  const site = read('assets/js/site.js');
  assert.match(site, /function initLangSwitch\(\)/); assert.match(site, /LANG_HINT/);
});

test('외국어 문의: 국제 전화번호·한국어 요약으로 기존 문의 목록에 들어간다', async () => {
  const f = fixture(), date = kstToday(30), before = f.db.prepare('SELECT * FROM inquiries').all();
  const body = { inquiry_type: 'event', space_id: 'megaspot-gundae-2', name: 'Jane Doe', org: 'ACME', email: 'jane@example.com', phone: '+1 555 123 4567', contact_pref: 'email',
    date, start_h: 18, end_h: 22, t_start: '18:00', t_end: '22:00', headcount: 120, purpose: 'networking', message: '[영어 문의] Buffet for 120?', source: 'i18n-en', agree_privacy: true,
    summary: '[해외 문의 · 영어 화면]\n공간: 건대 2호\n이용일: ' + date + '\n인원: 120명' };
  const r = await inquire({ env: f.env, request: new Request('https://local.test/api/inquiry', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.0.1' }, body: JSON.stringify(body) }) });
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.ok(j.ref);
  const row = f.db.prepare('SELECT * FROM inquiries WHERE ref=?').get(j.ref), d = JSON.parse(row.data);
  assert.equal(row.space_id, 'megaspot-gundae-2'); assert.equal(row.phone, '+15551234567'); assert.equal(row.headcount, 120);
  assert.match(d.summary, /해외 문의 · 영어/); assert.equal(d.source, 'i18n-en');
  assert.deepEqual(f.db.prepare('SELECT * FROM inquiries WHERE ref<>?').all(j.ref), before, '기존 문의는 그대로');
  const js = read('assets/js/i18n.js');
  assert.match(js, /M\.api\('\/inquiry'/); assert.match(js, /agree_privacy: true/); assert.match(js, /해외 문의/);
});
