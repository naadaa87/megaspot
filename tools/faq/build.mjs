// 자주 묻는 질문 모음(/help/) 만들기 (2026-11-24)
//
//   node tools/faq/build.mjs           → 모든 공개 화면의 FAQ(JSON-LD FAQPage)를 모아 help/index.html 의 목록 구간과 sitemap.xml 구간을 고칩니다
//   node tools/faq/build.mjs --check   → 고칠 곳이 있으면 1로 끝납니다 (테스트용)
//
// 질문과 답은 각 화면에 이미 있는 글을 그대로 가져옵니다. 이 도구에서 새로 쓰는 답은 extra.json 에만 둡니다.
// 화면을 고친 뒤(공간 모음·가이드·키트 생성 도구까지 돌린 뒤) 마지막에 이 도구를 돌리면 됩니다.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = new URL('../..', import.meta.url).pathname;
const HERE = new URL('.', import.meta.url).pathname;
const SITE = 'https://megaspot.kr';
const SKIP = new Set(['node_modules', '.git', 'tests', 'tools', 'deploy', 'migrations', '.claude', 'admin', 'help', 'en', 'ja', 'zh']);   // en·ja·zh: 외국어 화면(tools/i18n)의 FAQ 는 한국어 모음에 넣지 않습니다
const read = p => readFileSync(join(ROOT, p), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

export const CATS = [
  ['booking', '예약·요금·결제'],
  ['space', '공간·시설·주차'],
  ['food', '식음료'],
  ['plan', '공간 찾기·행사 준비'],
  ['kit', '초대장·행사 게임'],
  ['host', '공간 입점'],
  ['about', '메가스팟 소개'],
];
// 질문 글로 먼저 나누고, 걸리지 않으면 화면 주소로 나눕니다
const BY_TEXT = [
  [/입점|우리 공간도|제가 운영하는 공간|호스트/, 'host'],
  [/초대장|플레이|스크린에는|모임 키트|참석 응답|참석자도/, 'kit'],
  [/뷔페|케이터링|칵테일|음식|주류|다과|바베큐|생맥주/, 'food'],
  [/요금|비용|금액|얼마|성수기|할인|부가세|세금계산서|결제|환불|보증금|취소|예약은 어떻게|예약 내용|확정서|계약서/, 'booking'],
  [/주차|오시는|건대입구역|장비|빔프로젝터|마이크|몇 명|인원|사진/, 'space'],
];
const BY_PATH = [
  [/^guide\//, 'booking'], [/^spaces\//, 'space'], [/^(catering|cocktail|reception|drinks)\//, 'food'],
  [/^(venues|event-guide|purpose|planning)\//, 'plan'], [/^(kit|play|invite)\//, 'kit'], [/^host\//, 'host'], [/^(family|about)\//, 'about'],
];
// 같은 분류 안에서 먼저 보일 화면 순서
const PAGE_ORDER = ['guide/', 'spaces/megaspot-gundae/', 'spaces/megaspot-gundae-2/', 'catering/', 'kit/', 'host/', 'venues/', 'family/'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) walk(p, out); else if (name === 'index.html') out.push(relative(ROOT, p));
  }
  return out.sort();
}

function faqOf(html) {
  const items = [], re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    const visit = x => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(visit); if (x['@type'] === 'FAQPage') [].concat(x.mainEntity || []).forEach(q => items.push(q)); if (x['@graph']) visit(x['@graph']); };
    visit(j);
  }
  return items.filter(q => q && q.name && q.acceptedAnswer && q.acceptedAnswer.text).map(q => ({ q: norm(q.name), a: norm(q.acceptedAnswer.text) }));
}

// 출처 이름: 주요 화면은 정해 둔 이름, 나머지는 <title> 의 첫 부분
const NAMES = { '/guide/': '이용 안내', '/spaces/megaspot-gundae/': '건대 1호 안내', '/spaces/megaspot-gundae-2/': '건대 2호 안내', '/host/': '공간 입점 안내',
  '/kit/': '모임 키트', '/catering/': '출장뷔페 안내', '/play/': '행사 게임', '/family/': '패밀리 사이트', '/venues/': '인원·목적별 공간' };
function titleOf(html, path) {
  if (NAMES[path]) return NAMES[path];
  const t = /<title>([^<]*)<\/title>/.exec(html);
  return norm(t ? t[1] : '').split(/\s[|—]\s/)[0].replace(/\s*\(무료\)$/, '').slice(0, 40);
}

const catOf = (q, rel) => (BY_TEXT.find(([re]) => re.test(q)) || BY_PATH.find(([re]) => re.test(rel)) || [, 'about'])[1];
const idOf = q => 'q-' + createHash('sha256').update(q).digest('hex').slice(0, 8);

export function collect() {
  const seen = new Set(), list = [];
  for (const rel of walk(ROOT)) {
    const html = read(rel);
    if (/<meta name="robots" content="noindex/.test(html)) continue;
    const items = faqOf(html); if (!items.length) continue;
    const path = '/' + rel.replace(/index\.html$/, ''), source = titleOf(html, path);
    for (const it of items) {
      const key = it.q + '\n' + it.a; if (seen.has(key)) continue; seen.add(key);
      list.push({ ...it, path, source, cat: catOf(it.q, rel.replace(/index\.html$/, '')) });
    }
  }
  for (const x of JSON.parse(readFileSync(join(HERE, 'extra.json'), 'utf8'))) list.push({ q: norm(x.q), a: norm(x.a), path: x.path, source: x.source, cat: x.cat, extra: true });
  const rank = p => { const i = PAGE_ORDER.findIndex(x => p === '/' + x); return i < 0 ? PAGE_ORDER.length : i; };
  const order = Object.fromEntries(CATS.map(([k], i) => [k, i]));
  list.forEach((x, i) => { x.i = i; });
  list.sort((a, b) => order[a.cat] - order[b.cat] || (a.extra ? -1 : 0) - (b.extra ? -1 : 0) || rank(a.path) - rank(b.path) || a.i - b.i);
  const ids = new Set();
  for (const x of list) { let id = idOf(x.q); while (ids.has(id)) id += 'x'; ids.add(id); x.id = id; }
  return list;
}

const START = 'faq:start', END = 'faq:end';
function region(src, body, file) {
  const re = new RegExp(`(<!-- ${START}[^>]*-->)[\\s\\S]*?(<!-- ${END} -->)`);
  if (!re.test(src)) throw new Error(file + ' 에 ' + START + ' 표시가 없습니다');
  return src.replace(re, (m, a, b) => a + '\n' + body + '\n' + b);
}

export function render(list) {
  const counts = Object.fromEntries(CATS.map(([k]) => [k, list.filter(x => x.cat === k).length]));
  const tabs = `<div class="hp-cats" role="tablist" aria-label="분류">\n  <button type="button" class="hp-cat on" data-cat="" role="tab" aria-selected="true">전체 <small>${list.length}</small></button>\n`
    + CATS.filter(([k]) => counts[k]).map(([k, label]) => `  <button type="button" class="hp-cat" data-cat="${k}" role="tab" aria-selected="false">${esc(label)} <small>${counts[k]}</small></button>`).join('\n') + '\n</div>';
  const groups = CATS.filter(([k]) => counts[k]).map(([k, label]) => `<section class="hp-group" data-group="${k}" aria-labelledby="hp-h-${k}">\n  <h2 class="hp-group-h" id="hp-h-${k}">${esc(label)}</h2>\n`
    + list.filter(x => x.cat === k).map(x => `  <details class="hp-item" id="${x.id}" data-cat="${k}"><summary>${esc(x.q)}</summary><div class="hp-a"><p>${esc(x.a)}</p><a class="hp-src" href="${esc(x.path)}">${esc(x.source)} 바로 가기 →</a></div></details>`).join('\n')
    + '\n</section>').join('\n');
  return tabs + '\n<div class="hp-list" id="hp-list">\n' + groups + '\n</div>';
}

export function buildAll() {
  const list = collect(), files = {}, before = read('help/index.html');
  files['help/index.html'] = region(before, render(list), 'help/index.html')
    .replace(/(<span id="hp-total">)\d*(<\/span>)/, `$1${list.length}$2`);
  // 목록이 바뀐 날만 sitemap 의 lastmod 를 오늘(한국 날짜)로 바꿉니다
  const sm = read('sitemap.xml'), kept = (/<lastmod>([^<]+)<\/lastmod>/.exec((/<!-- faq:start[\s\S]*?<!-- faq:end -->/.exec(sm) || [''])[0]) || [])[1];
  const lastmod = kept && files['help/index.html'] === before ? kept : new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  const entry = `  <url><loc>${SITE}/help/</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`;
  const block = `  <!-- ${START} · tools/faq/build.mjs 가 만드는 구간입니다. 손으로 고치지 마세요 -->\n${entry}\n  <!-- ${END} -->\n`;
  const re = /[ \t]*<!-- faq:start[^>]*-->[\s\S]*?<!-- faq:end -->\n?/;
  files['sitemap.xml'] = re.test(sm) ? sm.replace(re, block) : sm.replace('</urlset>', block + '</urlset>');
  return { files, list };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const check = process.argv.includes('--check'), { files, list } = buildAll(), off = [];
  for (const [f, text] of Object.entries(files)) if (read(f) !== text) { off.push(f); if (!check) writeFileSync(join(ROOT, f), text); }
  if (check) { if (off.length) { console.log('다시 만들어야 하는 파일:\n' + off.join('\n')); process.exit(1); } console.log('모두 최신입니다.'); }
  else console.log(`질문 ${list.length}개 · 고친 파일 ${off.length}개`);
}
