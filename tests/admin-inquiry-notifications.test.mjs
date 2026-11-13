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
  async function api(path, method = 'GET', body) {
    const response = await onRequest({ env, params: { path: path.split('/') }, request: new Request('https://megaspot.test/api/admin/' + path, {
      method, headers: { 'x-admin-key': env.ADMIN_KEY, origin: 'https://megaspot.test', 'content-type':'application/json' }, ...(body===undefined?{}:{body:JSON.stringify(body)})
    }) });
    return { status: response.status, body: await response.json() };
  }
  return { db, env, insert, api };
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

test('모두 읽음은 최근 50건을 넘는 전체 미확인 문의를 처리하며 이후 접수 건과 상담 상태를 보존한다',async t=>{
 const {db,insert,api}=fixture();t.after(()=>db.close());
 for(let i=0;i<65;i++)insert('MS-BULK-'+i,'2027-01-01','2026-11-01');
 insert('MS-QUOTE','2027-01-01','2026-11-01','견적 발송');insert('MS-CONFIRMED','2027-01-01','2026-11-01','예약 확정');
 await api('inquiry-notifications/MS-BULK-0/read','POST');const readAt=db.prepare("SELECT read_at FROM admin_inquiry_reads WHERE ref='MS-BULK-0'").get().read_at;
 const before=(await api('inquiry-notifications')).body;assert.equal(before.count,64);assert.equal(before.items.length,50);
 // Backdating a newly inserted inquiry cannot place it inside the old read boundary.
 insert('MS-ARRIVED-LATER','2026-01-01','2026-01-01');const original=db.prepare('SELECT * FROM inquiries ORDER BY id').all();
 const result=await api('inquiry-notifications/read-all','POST',{through_id:before.through_id});assert.equal(result.status,200);assert.equal(result.body.read_count,64);
 const after=(await api('inquiry-notifications')).body;assert.equal(after.count,1);assert.equal(after.items[0].ref,'MS-ARRIVED-LATER');assert.deepEqual(db.prepare('SELECT * FROM inquiries ORDER BY id').all(),original);assert.equal(db.prepare("SELECT read_at FROM admin_inquiry_reads WHERE ref='MS-BULK-0'").get().read_at,readAt);
 assert.equal((await api('inquiry-notifications/read-all','POST',{through_id:before.through_id})).body.read_count,0);assert.equal((await api('inquiry-notifications')).body.count,1);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_inquiry_reads WHERE ref IN ('MS-QUOTE','MS-CONFIRMED')").get().n,0);
});
test('모두 읽음은 관리자 인증·동일 출처·유효한 조회 기준을 확인하며 빈 목록에서도 안전하다',async t=>{
 const {db,env,insert,api}=fixture();t.after(()=>db.close());assert.equal((await api('inquiry-notifications')).body.through_id,0);insert('MS-UNREAD','2027-01-01','2026-11-01');
 for(const through_id of [undefined,0,-1,'1',1.5,Number.MAX_SAFE_INTEGER+1])assert.equal((await api('inquiry-notifications/read-all','POST',{through_id})).status,400);
 const request=(headers)=>onRequest({env,params:{path:['inquiry-notifications','read-all']},request:new Request('https://megaspot.test/api/admin/inquiry-notifications/read-all',{method:'POST',headers,body:JSON.stringify({through_id:1})})});
 assert.equal((await request({origin:'https://megaspot.test'})).status,401);assert.equal((await request({'x-admin-key':env.ADMIN_KEY,origin:'https://evil.test'})).status,403);assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_inquiry_reads').get().n,0);
});
