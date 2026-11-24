// 이름·주소·연락처 표기 통일 (2026-11-25 · S10)
//  · 이용 장소 주소는 도로명 기준 '서울 광진구 능동로13길 39 한아름건물 2층', 필요한 곳에 '(화양동 10-1)' 병기
//  · 검색엔진용 구조화 데이터의 streetAddress 도 같은 도로명 주소
//  · 공개 화면의 이메일은 이용·예약 문의(spaceblank0100) · 회사 문의(guspacedev) 두 개만
//  · 사업자 정보(사업장 주소·상호)와 예약확정서·계약서·이용권 고지 문구는 이 점검에서 다루지 않습니다
//   node --test tests/nap.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACE, POSTAL_ADDRESS, CONTACT_EMAIL } from '../functions/api/_site_info.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');
const SKIP = new Set(['node_modules', '.git', '.claude', 'tools', 'tests', 'assets', 'functions', 'src', 'admin']);
const pages = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) pages.push(p); } })(root);

test('이용 장소 주소: 꼬리말 · 공간 자료 · 구조화 데이터가 같은 도로명 주소', () => {
  assert.equal(PLACE.full, '서울 광진구 능동로13길 39 한아름건물 2층');
  assert.ok(read('tools/site-chrome/partials/footer.html').includes(`메가스팟 건대 1호·2호 · ${PLACE.full} (화양동 10-1)`));
  const spaces = read('assets/js/data/spaces.js');
  assert.equal((spaces.match(new RegExp(`address: '${PLACE.full}'`, 'g')) || []).length, 2, '1호·2호 공간 자료');
  const streets = new Set();
  for (const f of pages) for (const m of read(relative(root, f)).matchAll(/"streetAddress":"([^"]*)"/g)) streets.add(m[1]);
  assert.deepEqual([...streets], [POSTAL_ADDRESS.streetAddress]);
});

test('공개 화면 이메일은 두 개만', () => {
  const found = new Set();
  for (const f of pages) for (const m of read(relative(root, f)).matchAll(/mailto:([^"?]+)/g)) found.add(m[1]);
  assert.ok(found.has(CONTACT_EMAIL));
  for (const e of found) assert.ok(['spaceblank0100@gmail.com', 'guspacedev@gmail.com'].includes(e), e);
});
