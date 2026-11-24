// 사전답사 신청 — 고객이 시간을 고르고 운영팀이 확정 (2026-11-25)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, DAY } from './helpers/admin-fixture.mjs';
import { onRequest as visitApi } from '../functions/api/visit/[[path]].js';
import { visitKey } from '../functions/api/_visit_self.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function setup(t) {
  const f = fixture({ booking: true }); t.after(() => f.db.close());   // BK-TEST: 건대 1호 · DAY 10~17시 확정
  f.env.CONFIRM_SECRET = 'test-confirm-secret-0123456789abcdef';
  t.mock.method(globalThis, 'fetch', async () => { throw Error('외부 호출 금지'); });
  let ip = 0;
  const call = async (path, { method = 'GET', body } = {}) => {
    const req = new Request('https://local.test/api/visit/' + path, { method, headers: { 'content-type': 'application/json', origin: 'https://local.test', 'cf-connecting-ip': '10.1.' + (++ip >> 8) + '.' + (ip & 255) }, body: body ? JSON.stringify(body) : undefined });
    const r = await visitApi({ request: req, env: f.env, params: { path: path.split('?')[0].split('/') } });
    return { status: r.status, json: await r.json() };
  };
  const snapshot = () => JSON.stringify(['bookings', 'inquiries', 'calendar_blocks'].map(n => f.db.prepare(`SELECT * FROM ${n}`).all()));
  const ask = (o = {}) => call('request', { method: 'POST', body: { space: 'megaspot-gundae', date: DAY, time: '18:00', name: '답사 고객', phone: '010-2222-3333', people: 2, agree: true, ...o } });
  return { ...f, call, snapshot, ask };
}
const slotOf = (r, date, time) => r.json.days.find(d => d.date === date).slots.find(s => s.time === time);

test('확정 예약 시간과 마감한 날은 고를 수 없고, 다른 공간·다른 시간은 고를 수 있다', async t => {
  const f = setup(t);
  const one = await f.call('slots?space=megaspot-gundae&from=' + DAY + '&days=2');
  assert.equal(one.status, 200);
  assert.equal(slotOf(one, DAY, '10:00').ok, false); assert.equal(slotOf(one, DAY, '10:00').why, 'booking');
  assert.equal(slotOf(one, DAY, '16:30').ok, false);
  assert.equal(slotOf(one, DAY, '17:00').ok, true);
  const two = await f.call('slots?space=megaspot-gundae-2&from=' + DAY + '&days=1');
  assert.equal(slotOf(two, DAY, '10:00').ok, true);
  const both = await f.call('slots?space=both&from=' + DAY + '&days=1');
  assert.equal(slotOf(both, DAY, '12:00').ok, false);
  f.db.prepare("INSERT INTO calendar_blocks (space_id, date, state) VALUES ('megaspot-gundae-2', ?, 'full')").run(DAY);
  const closed = await f.call('slots?space=megaspot-gundae-2&from=' + DAY + '&days=1');
  assert.equal(closed.json.days[0].open, false); assert.equal(slotOf(closed, DAY, '18:00').why, 'closed');
  f.db.prepare("INSERT INTO calendar_blocks (space_id, date, state) VALUES ('megaspot-gundae', ?, 'hold')").run(DAY);
  assert.equal(slotOf(await f.call('slots?space=megaspot-gundae&from=' + DAY + '&days=1'), DAY, '18:00').ok, true, '임시 확보는 막지 않음');
});

test('신청하면 조율 중 답사로 저장되고, 다른 답사 팀과 같은 시간이어도 신청할 수 있다', async t => {
  const f = setup(t);
  const before = f.snapshot();
  const a = await f.ask({ memo: '강연형 배치로 보고 싶어요' });
  assert.equal(a.status, 200); assert.match(a.json.ref, /^SV-/);
  assert.equal(a.json.k, await visitKey(f.env, a.json.ref));
  const b = await f.ask({ name: '다른 팀', phone: '010-4444-5555' });
  assert.equal(b.status, 200, '같은 시간 두 번째 팀');
  const row = f.db.prepare('SELECT * FROM site_visits WHERE ref = ?').get(a.json.ref);
  assert.equal(row.status, 'requested'); assert.equal(row.visit_date, DAY); assert.equal(row.start_time, '18:00');
  assert.equal(JSON.parse(row.data).source, 'web-self');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM visit_messages WHERE visit_id = ?').get(row.id).n, 1);
  assert.equal((await f.ask({ time: '12:00' })).json.code, 'SLOT_TAKEN');
  assert.equal((await f.ask({ agree: false })).status, 400);
  assert.equal((await f.ask({ phone: '1234' })).status, 400);
  assert.equal(f.snapshot(), before, '예약·문의·달력은 그대로');
});

test('신청한 분만 열쇠로 보고, 글을 남기고, 취소할 수 있다', async t => {
  const f = setup(t);
  const a = (await f.ask()).json;
  assert.equal((await f.call('view?ref=' + a.ref + '&k=wrong')).status, 403);
  const v = await f.call('view?ref=' + a.ref + '&k=' + encodeURIComponent(a.k));
  assert.equal(v.status, 200); assert.equal(v.json.item.status_label, '확인 중');
  assert.ok(!JSON.stringify(v.json).includes('010-2222-3333'));
  const m = await f.call('message', { method: 'POST', body: { ref: a.ref, k: a.k, body: '주차 되나요?' } });
  assert.equal(m.json.item.messages.at(-1).body, '주차 되나요?');
  const c = await f.call('cancel', { method: 'POST', body: { ref: a.ref, k: a.k } });
  assert.equal(c.json.item.status, 'cancelled');
  assert.equal((await f.call('cancel', { method: 'POST', body: { ref: a.ref, k: a.k } })).status, 409);
});

test('관리자는 신청을 확인·확정·시간 변경하고 글을 주고받는다', async t => {
  const f = setup(t);
  const a = (await f.ask({ memo: '안녕하세요' })).json;
  const list = await f.api('visit-requests');
  assert.equal(list.counts.requested, 1); assert.equal(list.counts.unread, 1);
  const id = list.items[0].id;
  const one = await f.api('visit-requests/' + id);
  assert.match(one.link, /\/visit\/#ref=SV-/);
  assert.equal((await f.api('visit-requests')).counts.unread, 0, '열어 보면 읽음');
  await f.api('visit-requests/' + id + '/messages', 'POST', { message: '주차는 1층 입구로 오세요' });
  const conf = await f.api('visit-requests/' + id + '/confirm', 'POST', { staff: '김매니저' });
  assert.equal(conf.item.status, 'scheduled'); assert.equal(conf.item.staff, '김매니저');
  const v = await f.call('view?ref=' + a.ref + '&k=' + encodeURIComponent(a.k));
  assert.equal(v.json.item.status_label, '확정');
  assert.ok(v.json.item.messages.some(m => m.sender === 'admin' && m.body.includes('1층 입구')));
  // 확정 예약 시간으로 바꾸려면 한 번 더 확인
  const clash = await f.handle(new Request('https://local.test/api/admin/visit-requests/' + id + '/reschedule', { method: 'POST', headers: { 'x-admin-key': f.env.ADMIN_KEY, origin: 'https://local.test', 'content-type': 'application/json' }, body: JSON.stringify({ date: DAY, time: '11:00' }) }));
  assert.equal(clash.status, 409);
  const moved = await f.api('visit-requests/' + id + '/reschedule', 'POST', { date: DAY, time: '19:00', confirm: false });
  assert.equal(moved.item.time, '19:00'); assert.equal(moved.item.status, 'requested');
  const done = await f.api('visit-requests/' + id + '/confirm', 'POST', {});
  assert.equal(done.item.status, 'scheduled');
  await f.api('visit-requests/' + id + '/status', 'POST', { status: 'done' });
  assert.equal((await f.api('visit-requests?view=past')).items[0].status, 'done');
});

test('신청 받는 시간 설정', async t => {
  const f = setup(t);
  const s = await f.api('visit-requests/settings', 'PUT', { open: '13:00', close: '15:00', step: 60, weekdays: [1, 2, 3, 4, 5] });
  assert.equal(s.item.open, '13:00');
  const r = await f.call('slots?space=megaspot-gundae-2&from=' + DAY + '&days=7');
  for (const d of r.json.days) {
    assert.deepEqual(d.slots.map(x => x.time), ['13:00', '14:00', '15:00']);
    const wd = new Date(d.date + 'T00:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6) assert.equal(d.open, false);
  }
  await f.api('visit-requests/settings', 'PUT', { enabled: false });
  assert.equal((await f.ask()).json.code, 'CLOSED');
  assert.equal((await f.call('slots?space=both')).json.enabled, false);
});

test('고객 메뉴 곳곳에 사전답사 신청과 카톡문의가 있다', () => {
  assert.match(read('tools/site-chrome/partials/header.html'), /href="\/visit\/"/);
  assert.match(read('tools/site-chrome/partials/mobile-nav.html'), /href="\/visit\/"/);
  for (const sp of ['megaspot-gundae', 'megaspot-gundae-2']) {
    const h = read(`spaces/${sp}/index.html`);
    assert.match(h, new RegExp(`href="/visit/\\?space=${sp}">사전답사 신청</a><a class="btn btn-kakao"`));
  }
  assert.match(read('index.html'), /href="\/visit\/">사전답사 신청/);
  assert.match(read('inquiry/index.html'), /href="\/visit\/">사전답사 신청/);
  const page = read('visit/index.html');
  assert.match(page, /data-kakao>카톡문의/);
  assert.match(page, /\/assets\/js\/pages\/visit\.js\?v=[0-9a-f]{12}/);
  assert.match(read('admin/index.html'), /admin-customer-requests\.js\?v=/);
});
