// 공통 머리말 · 모바일 메뉴 · 꼬리말 · 공통 조각을 모든 화면에 맞춰 넣습니다 (2026-11-24)
//
//   node tools/site-chrome/build.mjs           → 모든 HTML 화면을 partials/ 내용으로 맞춤
//   node tools/site-chrome/build.mjs --check   → 맞지 않는 화면이 있으면 목록을 보이고 1로 끝남 (테스트용)
//
// 고치는 곳은 tools/site-chrome/partials/ 한 군데입니다.
//   header.html       <header class="site-header"> … </header>
//   mobile-nav.html   <nav class="mobile-nav" id="mobile-nav"> … </nav>
//   footer.html       <footer class="site-footer"> … </footer>
//   그 밖의 파일      화면 안의 <!-- include:이름 --> … <!-- /include:이름 --> 자리
// 화면마다 다른 값(예: 출장 케이터링 화면의 상담 전화)은 pages.json 의 replace 로 바꿉니다.
// 공간 모음·가이드(tools/seo-pages)와 모임 키트(tools/kit-pages) 생성 도구는 about/index.html 의 머리말을 가져가므로,
// 이 도구를 먼저 돌린 뒤 두 도구를 돌리면 모두 같은 머리말이 됩니다. 이 도구는 생성된 화면도 함께 맞춥니다.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const HERE = new URL('.', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'tests', 'tools', 'deploy', 'migrations', '.claude', 'admin']);
const read = p => readFileSync(p, 'utf8');
const partial = name => read(join(HERE, 'partials', name + '.html')).replace(/\n+$/, '');
const PAGES = existsSync(join(HERE, 'pages.json')) ? JSON.parse(read(join(HERE, 'pages.json'))) : {};

const BLOCKS = [
  ['header', /<header class="site-header">[\s\S]*?<\/header>/],
  ['mobile-nav', /<nav class="mobile-nav" id="mobile-nav"[\s\S]*?<\/nav>/],
  ['footer', /<footer class="site-footer">[\s\S]*?<\/footer>/],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) walk(p, out); else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function forPage(rel, text) {
  const o = PAGES[rel];
  if (!o || !o.replace) return text;
  return o.replace.reduce((t, [a, b]) => t.split(a).join(b), text);
}

export function render(rel, src) {
  let out = src;
  for (const [name, re] of BLOCKS) if (re.test(out)) out = out.replace(re, () => forPage(rel, partial(name)));
  out = out.replace(/(<!-- include:([a-z0-9-]+) -->)([\s\S]*?)(<!-- \/include:\2 -->)/g, (m, open, name, body, close) => {
    if (!existsSync(join(HERE, 'partials', name + '.html'))) return m;
    const lead = body.match(/^\n?/)[0];
    return open + lead + forPage(rel, partial(name)) + '\n' + close;
  });
  return out;
}

export function pages() { return walk(ROOT).map(p => relative(ROOT, p)); }

if (import.meta.url === 'file://' + process.argv[1]) {
  const check = process.argv.includes('--check');
  const off = [];
  for (const rel of pages()) {
    const src = read(join(ROOT, rel)), out = render(rel, src);
    if (out !== src) { off.push(rel); if (!check) writeFileSync(join(ROOT, rel), out); }
  }
  if (check) {
    if (off.length) { console.log('공통 머리말·꼬리말이 맞지 않는 화면:\n' + off.join('\n')); process.exit(1); }
    console.log('모든 화면의 공통 머리말·꼬리말이 맞습니다.');
  } else console.log(`화면 ${off.length}개를 맞췄습니다.`);
}
