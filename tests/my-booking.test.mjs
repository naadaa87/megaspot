// 나의 예약확인 (/my-booking/) — 2026-11-24
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/admin-fixture.mjs';
import { onRequest } from '../functions/api/my-booking/[[path]].js';
import { confirmToken } from '../functions/api/_confirm.js';
import { sha256 } from '../functions/api/_lib.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function setup(t, opts) {
  const f = fixture({ booking: true, ...opts }); t.after(() => f.db.close());
  f.env.CONFIRM_SECRET = 'test-confirm-secret-0123456789abcdef';
  let network = 0; t.mock.method(globalThis, 'fetch', async () => { network++; throw Error('외부 호출 금지'); });
  let ip = 0;
  const call = async (path, { method = 'GET', body, cookie, sameIp = false } = {}) => {
    const headers = { 'content-type': 'application/json', 'cf-connecting-ip': sameIp ? '10.0.0.1' : '10.0.' + (++ip >> 8) + '.' + (ip & 255) };
    if (cookie) headers.cookie = cookie;
    const req = new Request('https://local.test/api/my-booking/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const r = await onRequest({ request: req, env: f.env, params: { path: [path.split('?')[0]] } });
    return { status: r.status, headers: r.headers, json: await r.json() };
  };
  // 기존 예약·문의·주문 자료 스냅샷 (조회 횟수 기록표만 빼고 비교)
  const snapshot = () => {
    const tables = f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('auth_attempts','sqlite_sequence') ORDER BY name").all().map(r => r.name);
    return Object.fromEntries(tables.map(n => [n, JSON.stringify(f.db.prepare(`SELECT * FROM "${n}"`).all())]));
  };
  return { ...f, call, snapshot, network: () => network };
}

test('예약번호와 휴대폰 뒷 4자리가 맞아야 열리고, 다시 열 열쇠는 확정서 열쇠와 같다', async t => {
  const f = setup(t);
  assert.equal((await f.call('lookup', { method: 'POST', body: { booking_code: 'BK-TEST', phone_last4: '0000' } })).status, 404);
  assert.equal((await f.call('lookup', { method: 'POST', body: { booking_code: 'BK-TEST', phone_last4: '12' } })).status, 400);
  const r = await f.call('lookup', { method: 'POST', body: { booking_code: 'bk-test', phone_last4: '5678' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.json.booking.code, 'BK-TEST');
  assert.equal(r.json.booking.space, '메가스팟 건대 1호');
  assert.equal(r.json.key.k, await confirmToken(f.env, 'BK-TEST'));
  assert.ok(Array.isArray(r.json.next) && r.json.next.length > 0);
  assert.equal(f.network(), 0);
});

test('화면 내용에 전화번호 원문·이름 전체·입실 비밀번호·와이파이가 들어가지 않는다', async t => {
  const f = setup(t);
  const r = await f.call('lookup', { method: 'POST', body: { booking_code: 'BK-TEST', phone_last4: '5678' } });
  const text = JSON.stringify(r.json);
  for (const bad of ['010-1234-5678', '01012345678', '검증 고객', 'door_code', 'wifi', 'arrival']) assert.ok(!text.includes(bad), bad);
  assert.equal(r.json.booking.name, '검○○');
});

test('열쇠가 틀리면 열리지 않고, 맞는 열쇠로는 같은 내용을 돌려준다', async t => {
  const f = setup(t);
  assert.equal((await f.call('view?c=BK-TEST&k=wrong')).status, 403);
  const k = await confirmToken(f.env, 'BK-TEST');
  const req = new Request('https://local.test/api/my-booking/view?c=BK-TEST&k=' + encodeURIComponent(k), { headers: { 'cf-connecting-ip': '10.9.9.9' } });
  const r = await onRequest({ request: req, env: f.env, params: { path: ['view'] } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).booking.code, 'BK-TEST');
});

test('같은 곳에서 예약번호를 계속 맞춰 보면 10분 동안 막는다', async t => {
  const f = setup(t);
  for (let i = 0; i < 10; i++) await f.call('lookup', { method: 'POST', body: { booking_code: 'BK-TEST', phone_last4: String(1000 + i) }, sameIp: true });
  assert.equal((await f.call('lookup', { method: 'POST', body: { booking_code: 'BK-TEST', phone_last4: '5678' }, sameIp: true })).status, 429);
});

test('조회만 하며 기존 예약·문의·확정서·보증금 자료를 바꾸거나 지우지 않는다', async t => {
  const f = setup(t);
  f.db.prepare("UPDATE bookings SET confirm_doc = ? WHERE booking_code = 'BK-TEST'").run(JSON.stringify({ issued_at: '2026-11-20T10:00:00Z', amount: 500000, show_amount: true }));
  const before = f.snapshot();
  const r = await f.call('lookup', { method: 'POST', body: { booking_code: 'BK-TEST', phone_last4: '5678' } });
  await f.call('view?c=BK-TEST&k=' + encodeURIComponent(r.json.key.k));
  await f.call('mine');
  const after = f.snapshot();
  for (const [name, rows] of Object.entries(before)) assert.equal(after[name], rows, name + ' 표가 바뀌었습니다');
});

test('이용 완료 예약은 이용료 입금 안내 대신 후기 쓰기를 안내한다', async t => {
  const f = setup(t, { date: '2026-01-10' });
  f.db.prepare("UPDATE bookings SET status = 'completed' WHERE booking_code = 'BK-TEST'").run();
  const r = await f.call('lookup', { method: 'POST', body: { booking_code: 'BK-TEST', phone_last4: '5678' } });
  assert.equal(r.json.booking.status, 'completed');
  assert.equal(r.json.review.can_write, true);
  assert.equal(r.json.payment.bank, undefined);
  assert.ok(!r.json.next.some(n => n.key === 'balance'));
  assert.ok(r.json.next.some(n => n.key === 'review'));
  if (r.json.deposit) assert.equal(r.json.deposit.bank, undefined);
});

test('취소된 예약은 상태와 확정서 링크까지만 보여 준다', async t => {
  const f = setup(t);
  f.db.prepare("UPDATE bookings SET status = 'cancelled' WHERE booking_code = 'BK-TEST'").run();
  const r = await f.call('lookup', { method: 'POST', body: { booking_code: 'BK-TEST', phone_last4: '5678' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.payment, null);
  assert.equal(r.json.deposit, null);
  assert.equal(r.json.next[0].key, 'cancelled');
});

test('회원 목록은 로그인한 회원이 보낸 문의에 연결된 예약만 보여 준다', async t => {
  const f = setup(t);
  assert.deepEqual((await f.call('mine')).json, { ok: true, login: false, items: [] });
  const ins = f.db.prepare("INSERT INTO members (email,name,pw_hash,agreed_at,created_at) VALUES (?,?,?,?,?)");
  const a = Number(ins.run('a@test.kr', '회원A', 'x', 'now', 'now').lastInsertRowid), b = Number(ins.run('b@test.kr', '회원B', 'x', 'now', 'now').lastInsertRowid);
  const data = JSON.parse(f.db.prepare("SELECT data FROM inquiries WHERE ref = 'MS-TEST'").get().data);
  f.db.prepare("UPDATE inquiries SET data = ? WHERE ref = 'MS-TEST'").run(JSON.stringify({ ...data, member_id: a }));
  const session = async (id, token) => f.db.prepare('INSERT INTO sessions (token_hash, member_id, created_at, expires_at) VALUES (?,?,?,?)').run(await sha256(token), id, 'now', '2999-01-01 00:00:00');
  await session(a, 'token-a'); await session(b, 'token-b');
  const mine = await f.call('mine', { cookie: 'ms_session=token-a' });
  assert.equal(mine.json.login, true);
  assert.deepEqual(mine.json.items.map(x => x.code), ['BK-TEST']);
  assert.equal(mine.json.items[0].k, await confirmToken(f.env, 'BK-TEST'));
  const other = await f.call('mine', { cookie: 'ms_session=token-b' });
  assert.deepEqual(other.json.items, []);
});

test('화면·검색 차단·연결 링크가 제자리에 있다', () => {
  const page = read('my-booking/index.html');
  assert.match(page, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(page, /<link rel="canonical" href="https:\/\/megaspot\.kr\/my-booking\/">/);
  assert.match(page, /\/assets\/js\/pages\/my-booking\.js\?v=[0-9a-f]{12}/);
  assert.match(page, /\/assets\/css\/my-booking\.css\?v=[0-9a-f]{12}/);
  assert.match(read('_headers'), /\/my-booking\/\*\n  X-Robots-Tag: noindex/);
  assert.match(read('robots.txt'), /Disallow: \/my-booking\//);
  assert.ok(!read('sitemap.xml').includes('/my-booking/'));
  assert.match(read('functions/api/_middleware.js'), /\/api\/my-booking\//);
  assert.match(read('assets/js/pages/confirm.js'), /\/my-booking\/#c=/);
  assert.match(read('assets/js/pages/account.js'), /\/my-booking\/#mine=/);
  assert.match(read('assets/js/pages/booking-portal.js'), /my_booking_url/);
  // 휴대폰 뒷자리는 브라우저 저장소에 넣지 않습니다
  const js = read('assets/js/pages/my-booking.js');
  assert.ok(!/p:last4/.test(js));
});
