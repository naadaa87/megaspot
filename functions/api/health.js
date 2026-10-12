// 연결 상태 점검 — https://(주소)/api/health
import { json, hasDb, TABLES } from './_lib.js';
export async function onRequestGet({ env }) {
  let db = false, missing = [];
  if (hasDb(env)) {
    try {
      const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      const have = new Set((results || []).map(r => r.name)); missing = TABLES.filter(t => !have.has(t)); db = true;
    } catch { db = false; }
  }
  return json({ ok: true, db, tables_ok: db && missing.length === 0, missing, admin_key: !!(env && env.ADMIN_KEY), time: new Date().toISOString() });
}
