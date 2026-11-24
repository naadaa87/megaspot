// 관리자 '검색 성과' (2026-11-25) — 검색에서 얼마나 보이고, 얼마나 들어오는지 한 화면에서 봅니다.
//  · 검색봇 방문: crawler_hits (봇별·날짜별 방문 수)
//  · IndexNow 알림: 받는 곳별 결과와 최근 보낸 기록, [지금 다시 보내기]
//  · sitemap: 검색엔진에 알리는 주소 수 (묶음별)
//  · 검색 유입: 홈페이지 방문 통계(web_hits)에서 검색엔진·네이버 지도·블로그로 들어온 방문과 첫 화면
//  · 검색에서 온 문의: 문의서에 남은 유입 경로(came_from.src) 집계 — 읽기만 합니다
//  · 주간 기록: 서치콘솔·서치어드바이저에서 본 색인 수·클릭 수·검색어를 운영자가 직접 적어 두는 표 (settings 'search_perf_log')
// 검색어는 브라우저가 넘겨주지 않아 홈페이지에서 자동으로 셀 수 없습니다. 그래서 주간 기록 칸에 옮겨 적는 방식입니다.
// 예약·문의·결제 표는 읽기만 하고 바꾸지 않습니다.
import { json, err, readJson, now, kstToday } from './_lib.js';
import { crawlerSummary, indexNowStatus, indexNowManual, sitemapEntries, INDEXNOW_LABEL, SITE_HOST } from './_seo.js';

export const SEARCH_SRC = { naver: '네이버 검색', google: '구글 검색', daum: '다음 검색', bing: '빙 검색', naver_place: '네이버 지도·플레이스', naver_blog: '네이버 블로그' };
const LOG_KEY = 'search_perf_log', LOG_MAX = 104;
const GROUP = [
  [/^\/$/, '홈'], [/^\/spaces\//, '공간 상세'], [/^\/venues\//, '공간 모음·지역'], [/^\/purpose\//, '목적별 안내'], [/^\/event-guide\//, '행사 가이드'],
  [/^\/guide\/|^\/help\/|^\/faq\//, '이용 안내·도움말'], [/^\/kit\/|^\/play\//, '모임 키트·놀이'], [/^\/community\/|^\/meetups\//, '커뮤니티·모임'], [/^\/products\//, '이용권'], [/^\/en\//, '영문'],
  [/^\/(catering|cocktail|reception|parking|planning)\//, '부가 서비스'], [/^\/(inquiry|visit)\//, '예약·문의'], [/^\/(host|advertise)\//, '입점 안내'], [/^\/(about|family)\//, '회사 소개']
];
const groupOf = path => { for (const [re, name] of GROUP) if (re.test(path)) return name; return '기타 안내'; };

async function readLog(env) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(LOG_KEY).first();
  try { const v = row ? JSON.parse(row.value) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
const writeLog = (env, list) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(LOG_KEY, JSON.stringify(list), now()).run();
const num = v => { if (v === '' || v === null || v === undefined) return null; const n = Math.round(Number(String(v).replace(/[^\d.-]/g, ''))); return isFinite(n) && n >= 0 && n < 1e9 ? n : null; };
const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

async function sitemapInfo(env, request) {
  if (!env.ASSETS) return null;
  try {
    const res = await env.ASSETS.fetch(new URL('/sitemap.xml', request.url)); if (!res.ok) return null;
    const entries = sitemapEntries(await res.text()), urls = Object.keys(entries), groups = {};
    let latest = '';
    for (const u of urls) { const p = u.replace(`https://${SITE_HOST}`, '') || '/'; const g = groupOf(p); groups[g] = (groups[g] || 0) + 1; if (entries[u] > latest) latest = entries[u]; }
    return { total: urls.length, latest, groups: Object.entries(groups).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n) };
  } catch { return null; }
}

async function inflow(env, from, to) {
  const keys = Object.keys(SEARCH_SRC), q = keys.map(() => '?').join(',');
  const all = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).all()).results || []);
  const [engines, daily, pages, entries] = await Promise.all([
    all(`SELECT src, COUNT(*) AS n FROM web_hits WHERE src IN (${q}) AND day BETWEEN ? AND ? GROUP BY src ORDER BY n DESC, src`, ...keys, from, to),
    all(`SELECT day, COUNT(*) AS n FROM web_hits WHERE src IN (${q}) AND day BETWEEN ? AND ? GROUP BY day ORDER BY day`, ...keys, from, to),
    all(`SELECT path, src, COUNT(*) AS n FROM web_hits WHERE src IN (${q}) AND day BETWEEN ? AND ? GROUP BY path, src ORDER BY n DESC LIMIT 60`, ...keys, from, to),
    env.DB.prepare('SELECT COUNT(*) AS n FROM web_hits WHERE src IS NOT NULL AND day BETWEEN ? AND ?').bind(from, to).first()
  ]);
  const byPage = {};
  for (const r of pages) { const p = byPage[r.path] || (byPage[r.path] = { path: r.path, n: 0, by: {} }); p.n += r.n; p.by[r.src] = r.n; }
  return {
    visits: engines.reduce((a, r) => a + r.n, 0), all_visits: (entries && entries.n) || 0,
    engines: engines.map(r => ({ src: r.src, label: SEARCH_SRC[r.src] || r.src, n: r.n })), daily,
    pages: Object.values(byPage).sort((a, b) => b.n - a.n).slice(0, 20)
  };
}

async function inquiriesFromSearch(env, from) {
  try {
    const { results } = await env.DB.prepare(`SELECT json_extract(data, '$.came_from.src') AS src, COUNT(*) AS n FROM inquiries
      WHERE json_valid(data) AND substr(created_at, 1, 10) >= ? GROUP BY src`).bind(from).all();
    const total = (results || []).reduce((a, r) => a + r.n, 0);
    const search = (results || []).filter(r => SEARCH_SRC[r.src]).map(r => ({ src: r.src, label: SEARCH_SRC[r.src], n: r.n })).sort((a, b) => b.n - a.n);
    return { total, search, search_total: search.reduce((a, r) => a + r.n, 0) };
  } catch { return { total: 0, search: [], search_total: 0 }; }
}

export async function searchPerfAdmin({ request, env, path, method, url }) {
  if (path === 'search-perf' && method === 'GET') {
    const days = Math.max(7, Math.min(120, parseInt(url.searchParams.get('days'), 10) || 30));
    const from = kstToday(-days + 1), to = kstToday();
    const [crawlers, indexnow, sitemap, visits, inquiries, records] = await Promise.all([
      crawlerSummary(env, days), indexNowStatus(env, { withLog: true }), sitemapInfo(env, request), inflow(env, from, to), inquiriesFromSearch(env, from), readLog(env)
    ]);
    return json({ ok: true, days, from, to, crawlers, indexnow, indexnow_labels: INDEXNOW_LABEL, sitemap, inflow: visits, inquiries, records, live: new URL(request.url).hostname === SITE_HOST });
  }
  if (path === 'search-perf/indexnow' && method === 'POST') {
    const r = await indexNowManual(env, request);
    return r.ok ? json({ ok: true, message: r.message, indexnow: await indexNowStatus(env, { withLog: true }) }) : err(r.message, 409, 'INDEXNOW_WAIT');
  }
  if (path === 'search-perf/records' && method === 'POST') {
    let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
    const week = txt(d.week, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return err('기록할 날짜를 골라 주세요.');
    const rec = { week, google_indexed: num(d.google_indexed), naver_indexed: num(d.naver_indexed), google_clicks: num(d.google_clicks), google_impressions: num(d.google_impressions), naver_clicks: num(d.naver_clicks), queries: txt(d.queries, 400), note: txt(d.note, 300), at: now() };
    if ([rec.google_indexed, rec.naver_indexed, rec.google_clicks, rec.google_impressions, rec.naver_clicks].every(v => v === null) && !rec.queries && !rec.note) return err('적을 값을 하나 이상 넣어 주세요.');
    const list = (await readLog(env)).filter(r => r.week !== week); list.push(rec); list.sort((a, b) => (a.week < b.week ? 1 : -1));
    await writeLog(env, list.slice(0, LOG_MAX));
    return json({ ok: true, records: list.slice(0, LOG_MAX) });
  }
  const m = path.match(/^search-perf\/records\/(\d{4}-\d{2}-\d{2})$/);
  if (m && method === 'DELETE') {
    const list = (await readLog(env)).filter(r => r.week !== m[1]);
    await writeLog(env, list);
    return json({ ok: true, records: list });
  }
  return null;
}
