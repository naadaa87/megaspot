import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/admin/[[path]].js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { ADMIN_KEY: 'test-only', DB: { prepare(sql) {
    const stmt = db.prepare(sql); let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return stmt.get(...args) ?? null; },
      async all() { return { results: stmt.all(...args) }; },
      async run() { return stmt.run(...args); } };
  } } };
  const insert = (ref, date, created, status = '문의 접수') => db.prepare('INSERT INTO inquiries (ref,space_id,status,name,event_date,data,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(ref, 'megaspot-gundae', status, ref, date, '{}', created + ' 10:00:00');
  async function api(path, method = 'GET') {
    const response = await onRequest({ env, params: { path: path.split('/') }, request: new Request('https://megaspot.test/api/admin/' + path, {
      method, headers: { 'x-admin-key': env.ADMIN_KEY, origin: 'https://megaspot.test' }
    }) });
    return { status: response.status, body: await response.json() };
  }
  return { db, insert, api };
}

test('새 문의 알림은 행사일과 무관하게 접수 순서로 나오고 확인 후 사라진다', async t => {
  const { db, insert, api } = fixture(); t.after(() => db.close());
  insert('MS-OLD-DATE', '2027-12-01', '2026-11-02');
  insert('MS-NEW-DATE', '2026-11-01', '2026-11-01');
  insert('MS-DELETED', '2026-11-02', '2026-11-02', '삭제됨');
  const first = await api('inquiry-notifications');
  assert.equal(first.status, 200);
  assert.equal(first.body.count, 2);
  assert.deepEqual(first.body.items.map(x => x.ref), ['MS-OLD-DATE', 'MS-NEW-DATE']);
  assert.equal((await api('inquiry-notifications/MS-OLD-DATE/read', 'POST')).status, 200);
  assert.equal((await api('inquiry-notifications/MS-OLD-DATE/read', 'POST')).status, 200);
  const after = await api('inquiry-notifications');
  assert.deepEqual(after.body.items.map(x => x.ref), ['MS-NEW-DATE']);
  assert.equal(after.body.count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_inquiry_reads').get().n, 1);
});
