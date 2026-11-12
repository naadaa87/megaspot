// 무료 등록 기간 종료 안내 — 종료 30일 전·7일 전에 호스트에게 등록 연장 안내를 보냅니다 (2026-11-12)
//  · 대상: 공개 중이거나 잠시 멈춘 공간 가운데 무료 등록 기간이 아직 남았고, 그 뒤로 이어지는 유료 등록 기간이 없는 공간
//  · 시점: 남은 날이 30일 이하가 되면 '30일 전' 안내, 7일 이하가 되면 '7일 전' 안내를 한 번씩. 하루 중 10시~20시(한국 시간)에만 보냅니다.
//  · /api 요청이 들어올 때 미들웨어가 불러 15분에 한 번 확인합니다(따로 예약 작업이 필요 없습니다).
//  · 같은 공간·같은 종료일에는 단계별로 한 번만 보냅니다. 운영팀이 무료 기간을 바꾸면 새 종료일 기준으로 다시 안내합니다.
import { hasDb, now, kstToday } from './_lib.js';
import { addDays } from './_hostplat.js';
import { notifyHost, retryHeldNotices } from './_hostnotify.js';

const TICK_KEY = 'host_renewal_tick', GAP_MS = 15 * 60e3, FROM_HOUR = 10, TO_HOUR = 20;
const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

export async function hostRenewalDue(env, today = kstToday()) {
  const { results } = await env.DB.prepare(`SELECT ref, name, host_id, free_until, paid_until FROM host_spaces
    WHERE status IN ('live','paused') AND free_until IS NOT NULL AND free_until >= ? AND free_until <= ? AND COALESCE(paid_until, '') <= free_until ORDER BY free_until, id LIMIT 200`)
    .bind(today, addDays(today, 30)).all();
  return (results || []).map(r => { const left = days(today, r.free_until); return { ...r, left, stage: left <= 7 ? 'd7' : 'd30' }; });
}

// at: 지금 시각(ms) · force: 시간대·간격 제한 없이 바로 확인 (관리자 '지금 확인' · 점검용)
export async function hostRenewalTick(env, { at = Date.now(), force = false } = {}) {
  if (!hasDb(env)) return { skipped: 'no_db' };
  if (!force) {
    const last = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(TICK_KEY).first();
    if (last && at - Number(last.value) < GAP_MS) return { skipped: 'recent' };
  }
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(TICK_KEY, String(at), now()).run();
  const retried = await retryHeldNotices(env);
  const hour = new Date(at + 9 * 3600e3).getUTCHours();
  if (!force && (hour < FROM_HOUR || hour >= TO_HOUR)) return { skipped: 'hours', retried };
  const today = new Date(at + 9 * 3600e3).toISOString().slice(0, 10);
  let sent = 0;
  for (const s of await hostRenewalDue(env, today)) {
    const id = await notifyHost(env, s.host_id, 'renewal', { stage: s.stage, ref: s.ref, space: s.name, end: s.free_until, left: s.left }, s.stage + ':' + s.free_until);
    if (id) sent++;
  }
  return { sent, retried };
}
