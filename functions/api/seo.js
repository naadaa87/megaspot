// GET /api/seo — 검색봇 방문 기록(최근 30일)과 IndexNow 알림 상태. 봇 이름·날짜·횟수만 담긴 집계라 누구나 볼 수 있게 열어 둡니다.
import { json, err, hasDb } from './_lib.js';
import { crawlerSummary, indexNowStatus } from './_seo.js';
export async function onRequestGet({ env, request }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const days = Math.max(1, Math.min(120, parseInt(new URL(request.url).searchParams.get('days'), 10) || 30));
  try {
    return json({ ok: true, days, crawlers: await crawlerSummary(env, days), indexnow: await indexNowStatus(env) }, 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  } catch { return err('기록을 불러오지 못했습니다.', 500, 'SERVER'); }
}
