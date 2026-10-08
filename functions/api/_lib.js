// 공통 유틸 — Cloudflare Pages Functions (D1 바인딩 이름: DB, 운영자 키: ADMIN_KEY)
export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
}
export function err(message, status = 400, code = 'ERR') { return json({ ok: false, error: message, code }, status); }
export function hasDb(env) { return !!(env && env.DB && typeof env.DB.prepare === 'function'); }
export async function readJson(request, maxBytes = 64 * 1024) {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('요청이 너무 큽니다.');
  try { return JSON.parse(text || '{}'); } catch { throw new Error('잘못된 요청 형식입니다.'); }
}
export function str(v, max = 500) { if (v == null) return ''; return String(v).trim().slice(0, max); }
export function num(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
export function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
export function now() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRef(prefix = 'MS') {
  const d = new Date(); const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let r = ''; for (const b of bytes) r += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${yymm}-${r}`;
}
export async function uniqueRef(env, table, column, prefix) {
  for (let i = 0; i < 6; i++) {
    const ref = makeRef(prefix);
    const row = await env.DB.prepare(`SELECT 1 AS x FROM ${table} WHERE ${column} = ?`).bind(ref).first();
    if (!row) return ref;
  }
  throw new Error('번호 생성에 실패했습니다. 다시 시도해 주세요.');
}
export function checkAdmin(request, env) {
  const key = request.headers.get('x-admin-key') || '';
  const expected = env.ADMIN_KEY || '';
  if (!expected) return err('서버에 ADMIN_KEY가 설정되어 있지 않습니다.', 503, 'NO_ADMIN_KEY');
  if (key.length !== expected.length) return err('운영자 키가 올바르지 않습니다.', 401, 'UNAUTHORIZED');
  let diff = 0; for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return err('운영자 키가 올바르지 않습니다.', 401, 'UNAUTHORIZED');
  return null;
}
export async function log(env, kind, ref, actor, detail) {
  try { await env.DB.prepare('INSERT INTO event_log (kind, ref, actor, detail, created_at) VALUES (?,?,?,?,?)').bind(kind, ref || '', actor || 'system', typeof detail === 'string' ? detail : JSON.stringify(detail || {}), now()).run(); } catch {}
}
