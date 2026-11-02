import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/admin/[[path]].js';
import { kstToday } from '../../functions/api/_lib.js';

export const DAY = kstToday(20), NEXT = kstToday(21);
export function fixture({ booking = false, space = 'megaspot-gundae', date = DAY } = {}) {
  const db = new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'));
  const data = { name: '검증 고객', phone: '010-1234-5678', date, headcount: 30, start_h: 10, end_h: 17, total: 450000, amount_mode: 'manual', space_id: space, channel: 'phone' };
  db.prepare('INSERT INTO inquiries(ref,space_id,status,name,phone,event_date,headcount,data,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('MS-TEST', space, booking ? '예약 확정' : '문의 접수', data.name, data.phone, date, 30, JSON.stringify(data), kstToday());
  if (booking) db.prepare('INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('BK-TEST', space, 'MS-TEST', data.name, data.phone, '5678', date, 30, 'confirmed', 500000, 10, 17, kstToday());
  const env = { ADMIN_KEY: 'local-regression-fixture', DB: { prepare(sql) { const statement = db.prepare(sql); let args = []; return { bind(...values) { args = values; return this; }, async first() { return statement.get(...args) ?? null; }, async all() { return { results: statement.all(...args) }; }, async run() { return statement.run(...args); } }; }, async batch(statements) { db.exec('BEGIN'); try { const out = []; for (const statement of statements) out.push(await statement.run()); db.exec('COMMIT'); return out; } catch (error) { db.exec('ROLLBACK'); throw error; } } } };
  const handle = request => onRequest({ env, params: { path: new URL(request.url).pathname.replace('/api/admin/', '').split('/') }, request });
  async function api(path, method = 'GET', body, expectedStatus = 200) {
    const response = await handle(new Request('https://local.test/api/admin/' + path, { method, headers: { 'x-admin-key': env.ADMIN_KEY, origin: 'https://local.test', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
    const result = await response.json(); assert.equal(response.status, expectedStatus, JSON.stringify(result)); return result;
  }
  return { db, env, api, handle, data };
}
export function quoteInput(overrides = {}) {
  return { space: 'megaspot-gundae', customer: '검증 고객', phone: '010-1234-5678', email: '', date: DAY, start: 10, end: 17, people: 30, purpose: '', regular: false,
    opts: { manager: { on: false, count: 1, hours: 4 }, cleaning: false, disposable: false, banner: false, xbanner: false }, discType: 'pct', discVal: 10, discWhy: '재방문 할인', extras: [], deposit: 150000, valid: 1, note: '', ...overrides };
}
export function saveQuote(api, { total = 630000, input = quoteInput(), extras = [], date = input.date } = {}) {
  return api('quotes', 'POST', { inquiry_ref: 'MS-TEST', customer: input.customer, event_date: date, total, mark_sent: true,
    data: { input, date, lines: [{ label: '공간료', desc: '', amount: 700000 }], range: '10:00–17:00', people: input.people, subtotal: 700000, discount: 70000, discountWhy: input.discWhy, extras, total, deposit: 150000, validUntil: NEXT } });
}
