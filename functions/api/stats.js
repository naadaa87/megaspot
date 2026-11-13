// 홈페이지 방문 통계 수집 — POST /api/stats
// assets/js/stats.js 가 페이지를 열 때(v), 페이지를 떠날 때 머문 시간(d), 링크를 누를 때(c) 보냅니다.
// 이름·연락처·IP 주소는 받지도 저장하지도 않습니다. 브라우저가 만든 무작위 번호(방문자·방문·페이지 조회)만 씁니다.
// 관리자 화면 'KPI 지표'의 홈페이지 방문 항목이 이 표(web_hits · web_clicks)를 읽습니다.
import { hasDb, sameOrigin, kstToday, now } from './_lib.js';
import { cameFrom } from './inquiry.js';

const ID = /^[a-z0-9]{8,32}$/i;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|yeti|daumoa|python|curl|wget|httpclient|phantom|selenium|puppeteer|playwright|scrapy|axios|node-fetch|go-http/i;
// 관리자·호스트센터·API는 집계하지 않습니다.
const SKIP = /^\/(admin|api|host\/center|host\/login)(\/|$)/;
// 주소 안에 개인 링크 값이 들어가는 화면은 앞부분만 남깁니다.
const PRIVATE = ['/confirm/', '/booking/', '/deposit/', '/docs/', '/meetups/manage/', '/parking/purchase/', '/mypage/', '/spaces/booking/', '/planning/status/'];
export const CLICK_KINDS = ['tel', 'sms', 'mail', 'kakao', 'inquiry', 'file', 'external', 'internal'];
const KEEP_DAYS = 400;   // 약 13개월

const noContent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
export function cleanPath(p) {
  let s = String(p || '').split(/[?#]/)[0].slice(0, 200);
  if (!s.startsWith('/') || s.startsWith('//')) return '';
  try { s = decodeURI(s); } catch {}
  s = s.replace(/\/{2,}/g, '/').replace(/[^\w\-./가-힣]/g, '').slice(0, 160) || '/';
  for (const pre of PRIVATE) if (s.startsWith(pre)) return pre;
  return s;
}
export function deviceOf(ua) {
  if (/iPad|Tablet|SM-T|Tab\b/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile';
  return 'desktop';
}
export function clickTarget(kind, target) {
  if (['tel', 'sms', 'mail'].includes(kind)) return kind;
  const t = String(target || '');
  if (kind === 'internal' || kind === 'inquiry' || kind === 'file') return cleanPath(t) || '/';
  try { const u = new URL(t); return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')).slice(0, 120); } catch { return ''; }
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!hasDb(env)) return noContent();
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const ua = request.headers.get('user-agent') || '';
  if (!ua || BOT.test(ua)) return noContent();
  let d; try { const raw = await request.text(); if (raw.length > 3000) return noContent(); d = JSON.parse(raw); } catch { return noContent(); }
  if (!d || typeof d !== 'object') return noContent();
  const day = kstToday();
  try {
    if (d.t === 'v') {
      if (!ID.test(d.pid || '') || !ID.test(d.vid || '') || !ID.test(d.sid || '')) return noContent();
      const path = cleanPath(d.p); if (!path || SKIP.test(path)) return noContent();
      let src = null, refHost = null;
      if (d.f) {
        const ref = clip(d.r, 300), utm = clip(d.u, 60);
        let host = ''; try { host = ref ? new URL(ref).hostname.replace(/^www\./, '') : ''; } catch {}
        const self = host && host === new URL(request.url).hostname.replace(/^www\./, '');
        const c = (utm || (host && !self)) ? cameFrom({ ref: self ? '' : ref, utm_source: utm }) : null;
        src = c ? c.src : 'direct'; refHost = c && c.host ? c.host.slice(0, 80) : null;
      }
      const hour = new Date(Date.now() + 9 * 3600e3).getUTCHours();
      await env.DB.prepare('INSERT OR IGNORE INTO web_hits (pid, day, hour, vid, sid, path, title, src, ref_host, device, new_visitor, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(d.pid, day, hour, d.vid, d.sid, path, clip(d.ti, 80).replace(/\s*[·|–-]\s*메가스팟.*$/, '') || null, src, refHost, deviceOf(ua), d.n ? 1 : 0, now()).run();
      // 오래된 기록은 가끔 한 번씩 지웁니다.
      if (Math.random() < 0.002) {
        const cut = kstToday(-KEEP_DAYS), job = Promise.all([
          env.DB.prepare('DELETE FROM web_hits WHERE day < ?').bind(cut).run(),
          env.DB.prepare('DELETE FROM web_clicks WHERE day < ?').bind(cut).run()]).catch(() => {});
        if (typeof waitUntil === 'function') waitUntil(job); else await job;
      }
    } else if (d.t === 'd') {
      const sec = Math.round(Number(d.s));
      if (!ID.test(d.pid || '') || !Number.isFinite(sec) || sec < 0) return noContent();
      const s = Math.min(sec, 1800);
      await env.DB.prepare('UPDATE web_hits SET dwell = ? WHERE pid = ? AND (dwell IS NULL OR dwell < ?)').bind(s, d.pid, s).run();
    } else if (d.t === 'c') {
      const path = cleanPath(d.p), kind = CLICK_KINDS.includes(d.k) ? d.k : '';
      if (!path || SKIP.test(path) || !kind) return noContent();
      const target = clickTarget(kind, d.h); if (!target) return noContent();
      await env.DB.prepare('INSERT INTO web_clicks (day, path, kind, target, label, n) VALUES (?,?,?,?,?,1) ON CONFLICT(day, path, kind, target) DO UPDATE SET n = n + 1, label = COALESCE(excluded.label, label)')
        .bind(day, path, kind, target, clip(d.l, 40) || null).run();
    }
  } catch (e) { console.error('stats', e && e.message); }
  return noContent();
}
export function onRequestGet() { return new Response(null, { status: 405 }); }
