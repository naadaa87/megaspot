// 검색 노출 점검 도구 (2026-11-23)
//  ① 검색봇 방문 기록 — 네이버(Yeti)·구글·빙·다음과 AI 검색 봇이 실제로 사이트 화면을 가져가는지 날짜별로 셉니다.
//     · 서치어드바이저에 등록했는데 검색에 안 나올 때, 봇이 들어오지 못하는 것인지(차단) 들어왔는데 색인이 안 된 것인지 가르는 기준입니다.
//     · 서버 함수를 거치는 화면(홈·공간 상세·공간 모음·이용 안내 등)에서만 셉니다. 사람 방문은 기록하지 않습니다.
//  ② IndexNow — sitemap.xml 이 바뀌면 새로 생기거나 고친 주소를 네이버·빙에 바로 알립니다.
//     · 열쇠는 사이트 최상위의 <열쇠>.txt 파일로 공개합니다(IndexNow 규칙). 비밀 값이 아닙니다.
//     · megaspot.kr 에서만 동작하고, 미리보기 주소(*.pages.dev)에서는 보내지 않습니다.
import { hasDb, kstToday, now } from './_lib.js';

export const SITE_HOST = 'megaspot.kr';
export const INDEXNOW_KEY = '408253e161a075633c5f01fcf68cbf82';
export const INDEXNOW_ENDPOINTS = { naver: 'https://searchadvisor.naver.com/indexnow', indexnow: 'https://api.indexnow.org/indexnow' };

// 순서대로 맞춰 보고 처음 맞는 이름을 씁니다
export const BOTS = [
  ['naver', /Yeti\/|NaverBot|naver\.me\/spd/i],
  ['google', /Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|AdsBot-Google/i],
  ['bing', /bingbot|BingPreview|msnbot/i],
  ['daum', /\bDaum(oa)?\b/i],
  ['openai', /GPTBot|OAI-SearchBot|ChatGPT-User/i],
  ['anthropic', /ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai/i],
  ['perplexity', /PerplexityBot|Perplexity-User/i],
  ['apple', /Applebot/i],
  ['zum', /ZumBot/i],
  ['yandex', /YandexBot/i],
  ['kakao', /kakaotalk-scrap|kakaostory-og/i],
  ['meta', /facebookexternalhit|meta-externalagent/i],
  ['amazon', /Amazonbot/i],
  ['bytedance', /Bytespider/i],
  ['commoncrawl', /CCBot/i]
];
export const BOT_LABEL = { naver: '네이버 (Yeti)', google: '구글', bing: '빙', daum: '다음', openai: 'ChatGPT · OpenAI', anthropic: 'Claude · Anthropic', perplexity: 'Perplexity', apple: '애플', zum: '줌', yandex: '얀덱스', kakao: '카카오톡 미리보기', meta: '페이스북·인스타그램', amazon: '아마존', bytedance: '바이트댄스', commoncrawl: 'Common Crawl' };
export function botOf(ua) {
  const s = String(ua || ''); if (!s) return '';
  for (const [name, re] of BOTS) if (re.test(s)) return name;
  return '';
}

// 화면 요청 1건을 보고 검색봇이면 그날 방문 수를 1 올립니다. 실패해도 화면에는 영향이 없습니다.
export async function logCrawler(env, request) {
  try {
    if (!hasDb(env) || request.method !== 'GET') return false;
    const ua = request.headers.get('user-agent') || '', bot = botOf(ua); if (!bot) return false;
    const url = new URL(request.url), cf = request.cf || {};
    const net = [cf.asn ? 'AS' + cf.asn : '', cf.asOrganization || ''].filter(Boolean).join(' ').slice(0, 80);
    await env.DB.prepare(`INSERT INTO crawler_hits (day, bot, hits, last_at, last_path, last_ua, last_net) VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(day, bot) DO UPDATE SET hits = hits + 1, last_at = excluded.last_at, last_path = excluded.last_path, last_ua = excluded.last_ua, last_net = excluded.last_net`)
      .bind(kstToday(), bot, now(), (url.pathname + url.search).slice(0, 200), ua.slice(0, 200), net).run();
    return true;
  } catch { return false; }
}

export async function crawlerSummary(env, days = 30) {
  const since = kstToday(-Math.max(1, Math.min(120, days)) + 1);
  const { results } = await env.DB.prepare('SELECT day, bot, hits, last_at, last_path, last_ua, last_net FROM crawler_hits WHERE day >= ? ORDER BY day DESC, hits DESC').bind(since).all();
  const bots = {};
  for (const r of results || []) {
    const b = bots[r.bot] || (bots[r.bot] = { bot: r.bot, label: BOT_LABEL[r.bot] || r.bot, hits: 0, days: 0, last_at: r.last_at, last_path: r.last_path, last_ua: r.last_ua, last_net: r.last_net });
    b.hits += r.hits; b.days += 1;
  }
  return { since, bots: Object.values(bots).sort((a, b) => b.hits - a.hits), daily: (results || []).map(r => ({ day: r.day, bot: r.bot, hits: r.hits })) };
}

// ---------- IndexNow ----------
const sha = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(b => b.toString(16).padStart(2, '0')).join('');
export function sitemapEntries(xml) {
  const out = {};
  for (const m of String(xml || '').matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?/g)) {
    const loc = m[1].trim(); if (loc.startsWith(`https://${SITE_HOST}/`)) out[loc] = (m[2] || '').trim();
  }
  return out;
}
async function readState(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'indexnow'").first();
  try { return row ? JSON.parse(row.value) : null; } catch { return null; }
}
const writeState = (env, state) => env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('indexnow', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(state), now()).run();

let nextCheck = 0;
export function resetIndexNowThrottle() { nextCheck = 0; }
// sitemap.xml 이 지난번과 달라졌으면 새 주소·고친 주소만 골라 알립니다. 한 번 확인한 뒤 10분은 다시 보지 않습니다.
export async function indexNowTick(env, request, fetcher = fetch) {
  if (Date.now() < nextCheck) return null; nextCheck = Date.now() + 10 * 60e3;
  if (!hasDb(env) || !env.ASSETS || new URL(request.url).hostname !== SITE_HOST) return null;
  const res = await env.ASSETS.fetch(new URL('/sitemap.xml', request.url)); if (!res.ok) return null;
  const entries = sitemapEntries(await res.text()), urls = Object.keys(entries); if (!urls.length) return null;
  const hash = await sha(urls.map(u => u + ' ' + entries[u]).join('\n'));
  const prev = await readState(env);
  if (prev && prev.hash === hash) return retryFailed(env, prev, fetcher);
  const before = (prev && prev.entries) || {};
  const changed = urls.filter(u => before[u] === undefined || before[u] !== entries[u]).slice(0, 10000);
  const state = { hash, entries, at: now(), submitted: changed.length, results: {} };
  await writeState(env, { ...state, results: { pending: true } });   // 먼저 적어 두어 같은 내용을 두 번 보내지 않습니다
  if (changed.length) {
    for (const name of Object.keys(INDEXNOW_ENDPOINTS)) state.results[name] = await submit(name, changed, fetcher);
    const failed = Object.keys(state.results).filter(n => !ok(state.results[n]));
    if (failed.length) state.retry = { names: failed, urls: changed, tries: 0 };
  }
  await writeState(env, state);
  return state;
}
const ok = code => code === 200 || code === 202;
async function submit(name, urlList, fetcher) {
  const body = JSON.stringify({ host: SITE_HOST, key: INDEXNOW_KEY, keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`, urlList });
  try { return (await fetcher(INDEXNOW_ENDPOINTS[name], { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body })).status; }
  catch { return 'error'; }
}
// 받는 쪽이 바빠서(429·5xx) 실패한 곳만 1시간 뒤부터 다시 보냅니다. 최대 5번.
async function retryFailed(env, prev, fetcher) {
  let r = prev.retry;
  if (!r && prev.results && !prev.results.pending) {   // 다시 보내기 기능이 생기기 전에 남은 실패 기록도 이어서 처리합니다
    const names = Object.keys(INDEXNOW_ENDPOINTS).filter(n => prev.results[n] !== undefined && !ok(prev.results[n]));
    if (names.length) r = { names, urls: Object.keys(prev.entries || {}), tries: 0 };
  }
  if (!r || !r.names || !r.names.length || r.tries >= 5) return null;
  const last = Date.parse(String(r.at || prev.at).replace(' ', 'T') + 'Z'); if (isFinite(last) && Date.now() - last < 3600e3) return null;
  const state = { ...prev, results: { ...prev.results }, retry: { ...r, tries: r.tries + 1, at: now() } };
  await writeState(env, state);
  for (const name of r.names) state.results[name] = await submit(name, r.urls, fetcher);
  state.retry.names = r.names.filter(n => !ok(state.results[n]));
  if (!state.retry.names.length) delete state.retry;
  await writeState(env, state);
  return state;
}
export async function indexNowStatus(env) {
  const s = await readState(env); if (!s) return null;
  return { at: s.at, submitted: s.submitted, total: Object.keys(s.entries || {}).length, results: s.results, ...(s.retry ? { retry: { names: s.retry.names, tries: s.retry.tries } } : {}) };
}
