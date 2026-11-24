// 스크립트·스타일 판 번호(?v=) 맞추기
//
//   node tools/asset-version.mjs                 → ?v= 가 12자리 해시인데 파일 내용과 맞지 않는 곳만 고칩니다
//   node tools/asset-version.mjs assets/js/a.js  → 이 파일을 가리키는 모든 ?v= 를 파일 내용의 해시로 바꿉니다
//   node tools/asset-version.mjs --check         → 고칠 곳이 있으면 목록을 보이고 1로 끝납니다 (테스트용)
//
// 판 번호 = 파일 내용 sha256 앞 12자리. 내용이 같으면 번호도 같아서, 다시 돌려도 바뀌지 않습니다.
// HTML 파일과 관리자·키트 페이지 생성 도구 안의 주소를 함께 고칩니다.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'tests', 'deploy', 'migrations', '.claude']);
const hashOf = p => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex').slice(0, 12);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.html$/.test(name) || /^tools\/(kit-pages|seo-pages|site-chrome|faq)\/.*\.mjs$/.test(relative(ROOT, p))) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2), check = args.includes('--check');
const only = args.filter(a => !a.startsWith('--')).map(a => a.replace(/^\.?\//, ''));
for (const f of only) if (!existsSync(join(ROOT, f))) { console.error('파일이 없습니다:', f); process.exit(2); }

const REF = /(["'(])\/((?:assets|arrival|host|invite|play|kit|contract)\/[^"'?)\s]+\.(?:js|css|mjs))\?v=([A-Za-z0-9_.-]+)/g;
const cache = new Map();
const want = p => { if (!cache.has(p)) cache.set(p, existsSync(join(ROOT, p)) ? hashOf(p) : null); return cache.get(p); };

let changedFiles = 0, changedRefs = 0;
const stale = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(REF, (m, q, p, v) => {
    const h = want(p);
    if (!h) return m;
    const target = only.length ? only.includes(p) : (/^[0-9a-f]{12}$/.test(v) && /[a-f]/.test(v) && !/^20\d{6}/.test(v));   // 날짜형 판 번호(20261118fac2 등)는 건드리지 않음
    if (!target || v === h) return m;
    changedRefs++; stale.push(relative(ROOT, file) + ' → /' + p + ' (' + v + ' → ' + h + ')');
    return q + '/' + p + '?v=' + h;
  });
  if (out !== src) { changedFiles++; if (!check) writeFileSync(file, out); }
}
if (check) {
  if (stale.length) { console.log(stale.join('\n')); process.exit(1); }
  console.log('판 번호가 모두 맞습니다.');
} else console.log(`판 번호 ${changedRefs}곳을 고쳤습니다 (파일 ${changedFiles}개).`);
