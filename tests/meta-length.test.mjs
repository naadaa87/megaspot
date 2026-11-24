// 검색 결과에 보이는 제목·설명 길이 규칙 (2026-11-25 · S9)
//  · 검색 허용 화면(noindex 가 아닌 화면)은 제목 60자 이하, 설명 160자 이하, 둘 다 비어 있지 않을 것
//  · 화면 생성기(seo-pages · kit-pages · faq)로 만든 화면도 저장소에 있는 결과물로 함께 확인합니다
//  · 서버에서 채우는 글·모임 상세 제목·설명은 tests/view-heads.test.mjs 가 확인합니다
//   node --test tests/meta-length.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', '.git', '.claude', 'tools', 'tests', 'assets', 'functions', 'src']);
const files = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) files.push(p); } })(root);
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

test('검색 허용 화면: 제목 60자 · 설명 160자 이하', () => {
  let n = 0; const bad = [];
  for (const f of files) {
    const h = readFileSync(f, 'utf8'), robots = (h.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';
    if (/noindex/.test(robots)) continue; n++;
    const t = dec((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '').trim(), d = dec((h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '').trim();
    if (!t || t.length > 60) bad.push(`${relative(root, f)} 제목 ${t.length}자`);
    if (!d || d.length > 160) bad.push(`${relative(root, f)} 설명 ${d.length}자`);
  }
  assert.ok(n >= 60, '검색 허용 화면 수 ' + n);
  assert.deepEqual(bad, []);
});
