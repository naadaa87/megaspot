// 화면 속도: 사진 WebP (2026-11-25 · S8)
//  · 화면 HTML 이 가리키는 .webp 파일은 모두 있어야 한다 (깨진 사진 방지)
//  · 공간·장면 사진의 중간(m)·작은(t) 크기는 WebP 로 보여 주고, 원본 크기는 JPG(크게 보기·공유용)
//  · 인쇄용 견적 스타일은 인쇄할 때만 불러온다
//  · 새 사진을 넣었으면: python3 -I tools/webp/make_webp.py (빠뜨려도 화면은 JPG 로 대신 보입니다)
//   node --test tests/webp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', '.git', '.claude', 'tools', 'tests', 'assets', 'functions', 'src']);
const pages = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) pages.push(p); } })(root);

test('화면이 가리키는 WebP 사진은 모두 있다', () => {
  let n = 0; const missing = [];
  for (const f of pages) for (const m of readFileSync(f, 'utf8').matchAll(/\s(?:src|data-src|srcset)="([^"]+)"/g))
    for (const part of m[1].split(',')) { const u = part.trim().split(/\s+/)[0].split('?')[0]; if (!/^\/assets\/img\/.+\.webp$/.test(u)) continue; n++; if (!existsSync(join(root, u))) missing.push(relative(root, f) + ' → ' + u); }
  assert.ok(n >= 200, 'WebP 사용 ' + n); assert.deepEqual(missing, []);
});

test('사진 경로 규칙: m·t 크기는 WebP, 원본은 JPG · WebP 가 없으면 JPG 로 대신', () => {
  const src = readFileSync(join(root, 'assets/js/site.js'), 'utf8');
  const m = src.match(/function imgSrc\(id, size\)\{[^\n]*\}/)[0], k = src.match(/function kind\(id\)\{[^\n]*\}/)[0], d = src.match(/var IMG_DIR=\{[^}]*\};/)[0];
  const ctx = {}; vm.runInNewContext(d + k + m + ';this.imgSrc=imgSrc;', ctx);
  assert.equal(ctx.imgSrc('s14', 'm'), '/assets/img/scenes/m/s14.webp'); assert.equal(ctx.imgSrc('r24', 't'), '/assets/img/gundae2/t/r24.webp');
  assert.equal(ctx.imgSrc('v01'), '/assets/img/views/v01.jpg', '원본 크기는 JPG');
  assert.match(src, /data-webp-fallback/);
  for (const dir of ['gundae', 'gundae2', 'scenes', 'views', 'aerial']) for (const size of ['m', 't']) {
    const p = join(root, 'assets/img', dir, size); if (!existsSync(p)) continue;
    for (const f of readdirSync(p).filter(x => x.endsWith('.jpg'))) assert.ok(existsSync(join(p, f.replace(/\.jpg$/, '.webp'))), `${dir}/${size}/${f} 의 WebP`);
  }
  for (const page of ['index.html', 'spaces/megaspot-gundae/index.html', 'guide/index.html']) assert.match(readFileSync(join(root, page), 'utf8'), /quote-print\.css\?v=[0-9a-f]+" media="print"/, page);
});
