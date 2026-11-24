// 공통 머리말·꼬리말(tools/site-chrome)과 스크립트·스타일 판 번호(tools/asset-version)가 모든 화면에서 맞는지 (2026-11-24)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const run = (...args) => { try { return { code: 0, out: execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; } };

test('모든 화면의 머리말·모바일 메뉴·꼬리말이 tools/site-chrome/partials 와 같다', () => {
  const r = run('tools/site-chrome/build.mjs', '--check');
  assert.equal(r.code, 0, r.out);
});

test('스크립트·스타일 판 번호가 파일 내용과 맞다', () => {
  const r = run('tools/asset-version.mjs', '--check');
  assert.equal(r.code, 0, r.out);
});

test('머리말과 모바일 메뉴에 나의 예약확인이 있다', () => {
  const header = readFileSync(new URL('../tools/site-chrome/partials/header.html', import.meta.url), 'utf8');
  assert.match(header, /class="hdr-my" href="\/my-booking\/"/);
  const nav = readFileSync(new URL('../tools/site-chrome/partials/mobile-nav.html', import.meta.url), 'utf8');
  assert.match(nav, /href="\/my-booking\/"/);
});
