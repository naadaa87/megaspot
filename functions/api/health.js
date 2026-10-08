import { json, hasDb } from './_lib.js';
export async function onRequestGet({ env }) {
  let db = false;
  if (hasDb(env)) { try { await env.DB.prepare('SELECT 1').first(); db = true; } catch { db = false; } }
  return json({ ok: true, db, time: new Date().toISOString() });
}
