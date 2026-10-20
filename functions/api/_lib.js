import { SCHEMA } from './_schema.js';   // schema.sql 에서 자동 생성 (tools/build_site.py)
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
export function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;  // 2026-13-01 같은 날짜는 거부
}
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
export async function log(env, kind, ref, actor, detail) {
  try { await env.DB.prepare('INSERT INTO event_log (kind, ref, actor, detail, created_at) VALUES (?,?,?,?,?)').bind(kind, ref || '', actor || 'system', typeof detail === 'string' ? detail : JSON.stringify(detail || {}), now()).run(); } catch {}
}

// ---------- 회원 (이메일·비밀번호 로그인) ----------
// 비밀번호는 PBKDF2-SHA256(10만 회, 무작위 솔트)로 바꿔 저장하고 원문은 어디에도 남기지 않습니다.
// 로그인 상태는 HttpOnly 쿠키(ms_session)로 유지하고, DB에는 토큰의 해시만 저장합니다.
// ms_in=1 쿠키는 화면에서 '마이페이지' 버튼을 보여 주기 위한 표시일 뿐이며 권한과는 관계없습니다.
const PBKDF2_ITER = 100000;   // Cloudflare Workers 의 PBKDF2 상한
export const SESSION_DAYS = 30;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITER))}`;
}
export async function verifyPassword(password, stored) {
  const p = String(stored || '').split('$'); if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
  const want = unb64(p[3]); const got = new Uint8Array(await pbkdf2(password, unb64(p[2]), +p[1]));
  if (got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
export function randomToken(bytes = 32) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sha256(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function later(days) { return new Date(Date.now() + days * 864e5).toISOString().slice(0, 19).replace('T', ' '); }
export function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
export function sessionCookies(token, days = SESSION_DAYS) {
  const age = days > 0 ? days * 86400 : 0;
  return [
    `ms_session=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`,
    `ms_in=${age ? 1 : ''}; Path=/; Max-Age=${age}; Secure; SameSite=Lax`
  ];
}
export function withCookies(res, cookies) { for (const c of cookies) res.headers.append('set-cookie', c); return res; }
export function isEmail(s) { return /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(s || '') && s.length <= 120; }
export function clientIp(request) { return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown'; }
// 다른 사이트에서 회원 기능을 대신 호출하지 못하게, 브라우저가 보내는 Origin 이 이 사이트와 같은지 확인합니다.
export function sameOrigin(request) {
  const o = request.headers.get('origin'); if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch { return false; }
}
export async function getMember(request, env) {
  const token = getCookie(request, 'ms_session'); if (!token || !hasDb(env)) return null;
  const row = await env.DB.prepare('SELECT m.id, m.email, m.name, m.phone, m.org, m.agree_marketing, m.status, m.created_at FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await sha256(token), now()).first();
  return row && row.status === 'active' ? row : null;
}
// 짧은 시간 안에 같은 요청이 너무 많으면 막습니다 (비밀번호 대입·무더기 가입 방지).
export async function tooMany(env, key, limit, minutes) {
  const row = await env.DB.prepare('SELECT count, window_start FROM auth_attempts WHERE key = ?').bind(key).first();
  const since = new Date(Date.now() - minutes * 6e4).toISOString().slice(0, 19).replace('T', ' ');
  if (!row || row.window_start < since) return false;
  return row.count >= limit;
}
export async function hit(env, key, minutes) {
  const since = new Date(Date.now() - minutes * 6e4).toISOString().slice(0, 19).replace('T', ' ');
  const row = await env.DB.prepare('SELECT count, window_start FROM auth_attempts WHERE key = ?').bind(key).first();
  if (!row || row.window_start < since) await env.DB.prepare('INSERT INTO auth_attempts (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start').bind(key, now()).run();
  else await env.DB.prepare('UPDATE auth_attempts SET count = count + 1 WHERE key = ?').bind(key).run();
}
export async function clearHits(env, key) { await env.DB.prepare('DELETE FROM auth_attempts WHERE key = ?').bind(key).run(); }

// ---------- 표 자동 생성 ----------
let schemaReady = false;
// 이미 만들어진 표에 나중에 추가한 칸 — 칸이 이미 있으면 오류가 나므로 하나씩 실행하고 오류는 무시합니다.
const MIGRATIONS = [
  'ALTER TABLE bookings ADD COLUMN amount INTEGER',
  'ALTER TABLE bookings ADD COLUMN start_h INTEGER',
  'ALTER TABLE bookings ADD COLUMN end_h INTEGER'
];
export async function ensureSchema(env) {
  if (schemaReady || !hasDb(env)) return;
  let done = false;
  if (typeof env.DB.batch === 'function') {
    try { await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))); done = true; } catch {}
  }
  if (!done) for (const s of SCHEMA) { try { await env.DB.prepare(s).run(); } catch {} }
  for (const s of MIGRATIONS) { try { await env.DB.prepare(s).run(); } catch {} }
  schemaReady = true;
}
export const TABLES = ['inquiries', 'host_applications', 'bookings', 'reviews', 'calendar_blocks', 'event_log', 'members', 'sessions', 'auth_attempts', 'admin_sessions', 'quotes', 'inquiry_checks', 'orders', 'settings'];

// ---------- 관리자 로그인 ----------
// /admin 화면은 ADMIN_KEY 로 로그인하면 HttpOnly 쿠키(ms_admin)를 받아 그 뒤 요청에 씁니다.
// 자동화·점검용으로 X-Admin-Key 헤더도 계속 받습니다.
function keyEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function adminKeyOk(key, env) { return keyEq(String(key || ''), String(env.ADMIN_KEY || '')); }
export function adminCookie(token, hours) {
  return `ms_admin=${token}; Path=/api/; Max-Age=${hours > 0 ? Math.round(hours * 3600) : 0}; HttpOnly; Secure; SameSite=Strict`;
}
export async function requireAdmin(request, env) {
  if (!env.ADMIN_KEY) return err('Cloudflare에 ADMIN_KEY가 설정되어 있지 않습니다.', 503, 'NO_ADMIN_KEY');
  const h = request.headers.get('x-admin-key');
  if (h) return adminKeyOk(h, env) ? null : err('관리자 비밀번호가 올바르지 않습니다.', 401, 'UNAUTHORIZED');
  const tok = getCookie(request, 'ms_admin');
  if (!tok) return err('관리자 로그인이 필요합니다.', 401, 'ADMIN_LOGIN');
  const row = await env.DB.prepare('SELECT 1 AS x FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').bind(await sha256(tok), now()).first();
  return row ? null : err('로그인이 만료되었습니다. 다시 로그인해 주세요.', 401, 'ADMIN_LOGIN');
}
export function kstToday(offsetDays = 0) { return new Date(Date.now() + 9 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10); }
