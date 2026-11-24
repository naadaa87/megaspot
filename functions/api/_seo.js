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
// 받는 곳을 하나씩 정해 보냅니다 (2026-11-25). 예전에 쓰던 공용 주소(api.indexnow.org)는 429(너무 자주 보냄)가 이어져서 빙 주소로 바꿨습니다.
// IndexNow 규칙상 빙에 보낸 주소는 참여한 다른 검색엔진에도 함께 전달됩니다.
export const INDEXNOW_ENDPOINTS = { naver: 'https://searchadvisor.naver.com/indexnow', bing: 'https://www.bing.com/indexnow' };
export const INDEXNOW_LABEL = { naver: '네이버 서치어드바이저', bing: '빙 (IndexNow 공유)', indexnow: '공용 주소 (예전)' };
const LEGACY = { indexnow: 'bing' };   // 예전 기록에 남은 이름 → 지금 받는 곳
// 실패한 곳을 다시 보낼 때 기다리는 시간(시간 단위). 받는 쪽이 Retry-After 를 주면 그 값과 비교해 더 긴 쪽을 씁니다.
export const RETRY_WAIT_HOURS = [1, 3, 6, 12, 24, 24];
const LOG_MAX = 40;

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
const ok = code => code === 200 || code === 202;
const at = s => { const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return isFinite(t) ? t : 0; };
const stamp = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
// 예전 기록(공용 주소 이름)을 지금 받는 곳 이름으로 맞춥니다. 저장된 결과는 그대로 두고 다시 보낼 대상만 바꿉니다.
function liveNames(names) { return [...new Set((names || []).map(n => LEGACY[n] || n).filter(n => INDEXNOW_ENDPOINTS[n]))]; }
function waitMs(tries, retryAfter) {
  const h = RETRY_WAIT_HOURS[Math.min(tries, RETRY_WAIT_HOURS.length - 1)] * 3600e3;
  return Math.min(48 * 3600e3, Math.max(h, (retryAfter || 0) * 1000));
}
function pushLog(state, entries) { state.log = [...entries, ...(state.log || [])].slice(0, LOG_MAX); }

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
  const state = { hash, entries, at: now(), submitted: changed.length, results: {}, log: (prev && prev.log) || [] };
  if (prev && prev.manual_at) state.manual_at = prev.manual_at;
  await writeState(env, { ...state, results: { pending: true } });   // 먼저 적어 두어 같은 내용을 두 번 보내지 않습니다
  if (changed.length) await sendTo(state, Object.keys(INDEXNOW_ENDPOINTS), changed, fetcher, 0, 'new');
  await writeState(env, state);
  return state;
}
async function submit(name, urlList, fetcher) {
  const body = JSON.stringify({ host: SITE_HOST, key: INDEXNOW_KEY, keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`, urlList });
  try {
    const r = await fetcher(INDEXNOW_ENDPOINTS[name], { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body });
    const ra = parseInt((r.headers && r.headers.get && r.headers.get('retry-after')) || '', 10);
    return { code: r.status, retryAfter: isFinite(ra) && ra > 0 ? ra : 0 };
  } catch { return { code: 'error', retryAfter: 0 }; }
}
// 정한 곳들에 보내고, 실패한 곳만 다시 보낼 목록(retry)에 남깁니다.
async function sendTo(state, names, urls, fetcher, tries, why) {
  const failed = [], logs = []; let ra = 0;
  for (const name of names) {
    const r = await submit(name, urls, fetcher);
    state.results[name] = r.code; logs.push({ at: now(), name, code: r.code, n: urls.length, why });
    if (!ok(r.code)) { failed.push(name); ra = Math.max(ra, r.retryAfter); }
  }
  pushLog(state, logs);
  if (failed.length) state.retry = { names: failed, urls, tries, at: now(), next_at: stamp(Date.now() + waitMs(tries, ra)) };
  else delete state.retry;
  return failed;
}
// 받는 쪽이 바빠서(429·5xx) 실패한 곳만 기다렸다가 다시 보냅니다. 기다리는 시간은 1·3·6·12·24시간으로 늘립니다. 최대 6번.
function pendingRetry(prev) {
  let r = prev.retry;
  if (!r && prev.results && !prev.results.pending) {   // 다시 보내기 기능이 생기기 전에 남은 실패 기록도 이어서 처리합니다
    const names = Object.keys(prev.results).filter(n => n !== 'pending' && !ok(prev.results[n]));
    if (names.length) r = { names, urls: Object.keys(prev.entries || {}), tries: 0 };
  }
  if (!r) return null;
  const names = liveNames(r.names);
  return names.length ? { ...r, names } : null;
}
async function retryFailed(env, prev, fetcher, force = false) {
  const r = pendingRetry(prev);
  if (!r || r.tries >= RETRY_WAIT_HOURS.length) return null;
  const due = r.next_at ? at(r.next_at) : at(r.at || prev.at) + 3600e3;
  if (!force && due && Date.now() < due) return null;
  const state = { ...prev, results: { ...prev.results } };
  state.retry = { ...r, tries: r.tries + 1, at: now(), next_at: stamp(Date.now() + 30 * 60e3) };
  await writeState(env, state);   // 보내는 동안 다른 요청이 같은 일을 하지 않도록 먼저 적어 둡니다
  await sendTo(state, r.names, r.urls || Object.keys(prev.entries || {}), fetcher, r.tries + 1, force ? 'manual' : 'retry');
  await writeState(env, state);
  return state;
}
// 관리자 '검색 성과'의 [지금 다시 보내기]. 실패한 곳이 있으면 그곳만 바로, 없으면 sitemap 의 모든 주소를 하루 한 번까지 다시 알립니다.
export async function indexNowManual(env, request, fetcher = fetch) {
  if (!hasDb(env)) return { ok: false, message: '데이터베이스가 연결되어 있지 않습니다.' };
  if (new URL(request.url).hostname !== SITE_HOST) return { ok: false, message: '실제 사이트(megaspot.kr)에서만 보낼 수 있습니다. 미리보기 주소에서는 보내지 않습니다.' };
  const prev = await readState(env);
  const last = prev && prev.manual_at ? at(prev.manual_at) : 0;
  if (prev && pendingRetry(prev)) {
    if (last && Date.now() - last < 30 * 60e3) return { ok: false, message: '방금 다시 보냈습니다. 30분 뒤에 다시 눌러 주세요.' };
    prev.manual_at = now();
    const s = await retryFailed(env, prev, fetcher, true);
    return { ok: true, state: s, message: '실패했던 곳에 다시 보냈습니다.' };
  }
  if (last && Date.now() - last < 24 * 3600e3) return { ok: false, message: '전체 다시 알리기는 하루에 한 번만 할 수 있습니다.' };
  if (!env.ASSETS) return { ok: false, message: 'sitemap.xml 을 읽지 못했습니다.' };
  const res = await env.ASSETS.fetch(new URL('/sitemap.xml', request.url)); if (!res.ok) return { ok: false, message: 'sitemap.xml 을 읽지 못했습니다.' };
  const entries = sitemapEntries(await res.text()), urls = Object.keys(entries); if (!urls.length) return { ok: false, message: 'sitemap.xml 에 주소가 없습니다.' };
  const state = { ...(prev || {}), entries, hash: (prev && prev.hash) || await sha(urls.map(u => u + ' ' + entries[u]).join('\n')), at: now(), submitted: urls.length, results: {}, manual_at: now(), log: (prev && prev.log) || [] };
  await writeState(env, state);
  await sendTo(state, Object.keys(INDEXNOW_ENDPOINTS), urls, fetcher, 0, 'manual');
  await writeState(env, state);
  return { ok: true, state, message: '모든 주소(' + urls.length + '개)를 다시 알렸습니다.' };
}
export async function indexNowStatus(env, { withLog = false } = {}) {
  const s = await readState(env); if (!s) return null;
  const out = { at: s.at, submitted: s.submitted, total: Object.keys(s.entries || {}).length, results: s.results };
  { const r = pendingRetry(s); if (r) out.retry = { names: r.names, tries: r.tries, ...(withLog && r.next_at ? { next_at: r.next_at } : {}) }; }
  if (withLog) { out.log = s.log || []; out.manual_at = s.manual_at || null; out.endpoints = Object.keys(INDEXNOW_ENDPOINTS); }
  return out;
}
