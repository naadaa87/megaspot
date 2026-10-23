// 메가스팟 건대 1호·2호 — 공간별 문의·예약·대기·확정서 점검 (Node 22.13+ · node:sqlite): node --test tests/spaces.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/admin/[[path]].js';
import { onRequestPost as inquiryPost } from '../functions/api/inquiry.js';
import { onRequestGet as availabilityGet } from '../functions/api/availability.js';
import { onRequestGet as confirmGet } from '../functions/api/confirm.js';
import { SPACES, publicDoc } from '../functions/api/_confirm.js';
import { spaceOk, SPACE_OPENING } from '../functions/api/_lib.js';
import { PRICING_ALL, PRICING } from '../functions/api/_catalog.js';

const DATE = '2026-11-27';   // 2호 오픈(11-13) 뒤 금요일
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { ADMIN_KEY: 'test-only', DB: { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  async function admin(path, method = 'GET', body) {
    const res = await onRequest({ env, params: { path: path.split('/') }, request: new Request('https://megaspot.test/api/admin/' + path, {
      method, headers: { 'x-admin-key': 'test-only', origin: 'https://megaspot.test', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    return { status: res.status, json: await res.json() };
  }
  async function inquiry(body) {
    const res = await inquiryPost({ env, request: new Request('https://megaspot.test/api/inquiry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '김민지', phone: '010-2345-6789', agree_privacy: true, ...body }) }) });
    return { status: res.status, json: await res.json() };
  }
  return { db, env, admin, inquiry };
}

test('공간 목록·요금표: 1호·2호가 서버 카탈로그와 확정서 목록에 모두 있음', () => {
  assert.deepEqual(Object.keys(PRICING_ALL), ['megaspot-gundae', 'megaspot-gundae-2']);
  assert.equal(PRICING.people.base, 20); assert.equal(PRICING_ALL['megaspot-gundae-2'].people.base, 50);
  assert.equal(PRICING_ALL['megaspot-gundae-2'].surcharge.amount, 255000);
  assert.equal(SPACES['megaspot-gundae-2'].name, '메가스팟 건대 2호'); assert.equal(SPACES['megaspot-gundae'].name, '메가스팟 건대 1호');
  assert.equal(spaceOk('megaspot-gundae-2'), 'megaspot-gundae-2'); assert.equal(spaceOk('evil'), 'megaspot-gundae'); assert.equal(spaceOk(''), 'megaspot-gundae');
  assert.equal(SPACE_OPENING['megaspot-gundae-2'], '2026-11-13');
});

test('홈페이지 문의: 2호 예약 신청은 저장되고, 모르는 공간은 1호로, 오픈 전 날짜는 거절', async () => {
  const { admin, inquiry } = fixture();
  const a = await inquiry({ space_id: 'megaspot-gundae-2', reserve: true, date: DATE, start_h: 19, end_h: 23, headcount: 120, total: 1159000 });
  assert.equal(a.status, 200); assert.ok(a.json.ref);
  const b = await inquiry({ space_id: 'nope', inquiry_type: 'event', headcount: 30 });
  assert.equal(b.status, 200);
  const c = await inquiry({ space_id: 'megaspot-gundae-2', reserve: true, date: '2026-11-05', start_h: 19, end_h: 23, headcount: 50 });
  assert.equal(c.status, 400); assert.equal(c.json.code, 'BEFORE_OPENING');
  const d = await inquiry({ space_id: 'request', inquiry_type: 'event', headcount: 300 });
  assert.equal(d.status, 200);
  const items = (await admin('inquiries')).json.items;
  const by = Object.fromEntries(items.map(i => [i.ref, i.space_id]));
  assert.equal(by[a.json.ref], 'megaspot-gundae-2'); assert.equal(by[b.json.ref], 'megaspot-gundae'); assert.equal(by[d.json.ref], 'request');
});

test('관리자 직접 등록·수정: 공간을 고를 수 있고, 확정 예약이 생기면 공간을 바꿀 수 없음', async () => {
  const { admin } = fixture();
  let r = await admin('inquiries', 'POST', { name: '카톡 고객', phone: '010-1111-2222', channel: 'kakao', space_id: 'megaspot-gundae-2', date: DATE, start_h: 18, end_h: 22, headcount: 60, total: 867000, amount_mode: 'auto' });
  assert.equal(r.status, 200); const ref = r.json.ref;
  let it = (await admin('inquiries/' + ref)).json.item;
  assert.equal(it.space_id, 'megaspot-gundae-2'); assert.equal(it.data.space_id, 'megaspot-gundae-2'); assert.match(it.data.summary, /공간: 메가스팟 건대 2호/);
  r = await admin('inquiries/' + ref, 'PATCH', { edit: true, name: '카톡 고객', phone: '010-1111-2222', date: DATE, start_h: 18, end_h: 22, headcount: 60, space_id: 'megaspot-gundae', amount_mode: 'keep' });
  assert.equal(r.status, 200); assert.ok(r.json.changed.includes('공간'));
  it = (await admin('inquiries/' + ref)).json.item; assert.equal(it.space_id, 'megaspot-gundae');
  r = await admin('inquiries/' + ref, 'PATCH', { edit: true, name: '카톡 고객', phone: '010-1111-2222', date: DATE, start_h: 18, end_h: 22, headcount: 60, space_id: 'megaspot-gundae-2', amount_mode: 'keep' });
  assert.equal(r.status, 200);
  r = await admin('inquiries/' + ref + '/confirm', 'POST', { date: DATE, start_h: 18, end_h: 22, headcount: 60, amount: 867000 });
  assert.equal(r.status, 200); assert.ok(r.json.booking_code);
  const bk = (await admin('bookings')).json.items[0]; assert.equal(bk.space_id, 'megaspot-gundae-2');
  r = await admin('inquiries/' + ref, 'PATCH', { edit: true, name: '카톡 고객', phone: '010-1111-2222', date: DATE, start_h: 18, end_h: 22, headcount: 60, space_id: 'megaspot-gundae', amount_mode: 'keep' });
  assert.equal(r.status, 409); assert.equal(r.json.code, 'HAS_BOOKING');
  // 같은 날 같은 시간이라도 1호 예약은 2호 확정 예약과 겹치지 않음
  const one = await admin('inquiries', 'POST', { name: '일호 고객', phone: '010-3333-4444', channel: 'phone', space_id: 'megaspot-gundae', date: DATE, start_h: 18, end_h: 22, headcount: 40 });
  r = await admin('inquiries/' + one.json.ref + '/confirm', 'POST', { date: DATE, start_h: 18, end_h: 22, headcount: 40, amount: 800000 });
  assert.equal(r.status, 200); assert.ok(r.json.booking_code); assert.equal(r.json.same_day, 0);
  // 2호에 또 하나 → 겹침 확인 요청
  const two = await admin('inquiries', 'POST', { name: '이호 또', phone: '010-5555-6666', channel: 'phone', space_id: 'megaspot-gundae-2', date: DATE, start_h: 19, end_h: 21, headcount: 50 });
  r = await admin('inquiries/' + two.json.ref + '/confirm', 'POST', { date: DATE, start_h: 19, end_h: 21, headcount: 50, amount: 500000 });
  assert.equal(r.json.ok, false); assert.equal(r.json.code, 'DATE_HAS_BOOKING');
});

test('예약 대기 순번은 공간별로 따로 세고, 공간별 달력 조회가 분리됨', async () => {
  const { admin, inquiry, env } = fixture();
  const refs = [];
  for (const [sp, name] of [['megaspot-gundae', 'A'], ['megaspot-gundae-2', 'B'], ['megaspot-gundae', 'C'], ['megaspot-gundae-2', 'D']]) {
    const r = await inquiry({ name, space_id: sp, reserve: true, date: DATE, start_h: 10, end_h: 17, headcount: 50, total: 500000 }); refs.push(r.json.ref);
  }
  // 같은 초에 들어온 문의는 접수 순서가 같아 순번이 바뀔 수 있으므로, 공간별 총원(2명)만 먼저 확인합니다
  let d = (await admin('inquiries/' + refs[3])).json;
  assert.deepEqual([d.wait.total, d.wait.space_id], [2, 'megaspot-gundae-2']); assert.ok([1, 2].includes(d.wait.no));
  d = (await admin('inquiries/' + refs[2])).json; assert.equal(d.wait.total, 2); assert.equal(d.wait.space_id, 'megaspot-gundae');
  // 순번을 저장하면 공간별로 따로 정해지고, 2호 순번을 바꿔도 1호 순번은 그대로
  let r = await admin('reservations/waitlist', 'POST', { date: DATE, space_id: 'megaspot-gundae', refs: [refs[0], refs[2]] });
  assert.equal(r.status, 200); assert.deepEqual(r.json.order, [refs[0], refs[2]]);
  r = await admin('reservations/waitlist', 'POST', { date: DATE, space_id: 'megaspot-gundae-2', refs: [refs[3], refs[1]] });
  assert.equal(r.status, 200); assert.deepEqual(r.json.order, [refs[3], refs[1]]);
  assert.equal((await admin('inquiries/' + refs[3])).json.wait.no, 1); assert.equal((await admin('inquiries/' + refs[1])).json.wait.no, 2);
  assert.equal((await admin('inquiries/' + refs[0])).json.wait.no, 1); assert.equal((await admin('inquiries/' + refs[2])).json.wait.no, 2);
  // 1호 목록에 2호 문의를 섞어 보내면 거절
  r = await admin('reservations/waitlist', 'POST', { date: DATE, space_id: 'megaspot-gundae', refs: [refs[1]] }); assert.equal(r.status, 409);
  const items = (await admin('reservations')).json.items;
  assert.deepEqual(items.map(i => i.space_id).sort(), ['megaspot-gundae', 'megaspot-gundae', 'megaspot-gundae-2', 'megaspot-gundae-2']);
  // 달력: 2호 마감은 1호 달력에 보이지 않음
  await admin('calendar', 'POST', { space_id: 'megaspot-gundae-2', date: DATE, state: 'full' });
  const av = async sp => (await (await availabilityGet({ env, request: new Request('https://megaspot.test/api/availability?space=' + sp + '&from=2026-11-01&to=2026-11-30') })).json()).days;
  assert.equal((await av('megaspot-gundae-2'))[DATE].state, 'full'); assert.equal((await av('megaspot-gundae'))[DATE], undefined);
});

test('2호 예약의 확정서에는 2호 이름·주소가 들어감', async () => {
  const { admin, env } = fixture();
  const r = await admin('bookings', 'POST', { space_id: 'megaspot-gundae-2', customer_name: '박서준', phone: '010-9999-0000', date: DATE, start_h: 10, end_h: 17, headcount: 150, amount: 1510000 });
  assert.equal(r.status, 200); const code = r.json.booking_code;
  const doc = await admin('bookings/' + code + '/confirm-doc', 'PUT', { doc: {} });
  assert.equal(doc.status, 200);
  const k = new URL(doc.json.link).searchParams.get('k');
  const res = await confirmGet({ env, request: new Request('https://megaspot.test/api/confirm?c=' + code + '&k=' + k) });
  const j = await res.json(); assert.equal(res.status, 200);
  assert.equal(j.doc.space.name, '메가스팟 건대 2호'); assert.match(j.doc.space.address, /한아름건물 2층/);
  assert.equal(publicDoc({ booking_code: 'X', space_id: 'nope', phone: '' }, {}).space.name, 'nope');
});
