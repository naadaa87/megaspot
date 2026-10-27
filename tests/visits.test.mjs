// 현장답사 일정 점검 — 문의 직접 등록과 함께 등록 · 단독 등록 · 겹침 알림 · 상태 · 일자별 목록 · 홈페이지 답사 희망 (Node 22.13+ · node:sqlite)
//   node --test tests/visits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as adminApi } from '../functions/api/admin/[[path]].js';
import { onRequestPost as inquiryPost } from '../functions/api/inquiry.js';
import { kstToday } from '../functions/api/_lib.js';

const ORIGIN = 'https://megaspot.test';
const D1 = kstToday(3), D2 = kstToday(10);
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { ADMIN_KEY: 'test-only', DB: { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  let ip = 1;
  const admin = async (path, method = 'GET', body) => {
    const res = await adminApi({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/admin/' + path, { method, headers: { 'x-admin-key': 'test-only', origin: ORIGIN, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    return { status: res.status, json: await res.json() };
  };
  const inquiry = async (body) => {
    const res = await inquiryPost({ env, request: new Request(ORIGIN + '/api/inquiry', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.0.' + (ip++) }, body: JSON.stringify({ name: '김답사', phone: '010-2000-3000', agree_privacy: true, ...body }) }) });
    return { status: res.status, json: await res.json() };
  };
  return { db, env, admin, inquiry };
}

test('문의 직접 등록 때 현장답사를 함께 등록하면 문의와 연결되고, 문의 상세에 보임', async () => {
  const f = fixture();
  let r = await f.admin('inquiries', 'POST', { name: '박행사', phone: '010-1111-2222', channel: 'kakao', space_id: 'megaspot-gundae-2', date: D2, headcount: 150, visit: { date: D1, time: '25:00' } });
  assert.equal(r.status, 400, '잘못된 시간이면 문의도 저장하지 않음');
  assert.equal((await f.admin('inquiries')).json.items.length, 0);
  r = await f.admin('inquiries', 'POST', { name: '박행사', phone: '010-1111-2222', channel: 'kakao', space_id: 'megaspot-gundae-2', date: D2, headcount: 150, visit: { date: D1, time: '14:00', duration: 60, people: 3, staff: '최매니저', memo: '주차 1대' } });
  assert.equal(r.status, 200); const ref = r.json.ref;
  assert.match(r.json.visit.ref, /^SV-\d{4}-[A-Z0-9]{4}$/);
  assert.equal(r.json.visit.status, 'scheduled'); assert.equal(r.json.visit.name, '박행사'); assert.equal(r.json.visit.phone, '010-1111-2222');
  assert.equal(r.json.visit.space_id, 'megaspot-gundae-2', '문의 공간을 따름');
  const det = (await f.admin('inquiries/' + ref)).json;
  assert.equal(det.visits.length, 1); assert.equal(det.visits[0].time, '14:00'); assert.equal(det.visits[0].duration, 60); assert.equal(det.visits[0].staff, '최매니저');
  assert.ok(det.log.some(l => l.kind === 'visit.created'), '문의 변경 기록에 남음');
  // 답사 없이 등록하면 답사도 없음
  r = await f.admin('inquiries', 'POST', { name: '답사없음', channel: 'phone' });
  assert.equal(r.json.visit, undefined); assert.equal((await f.admin('inquiries/' + r.json.ref)).json.visits.length, 0);
});

test('단독 등록 · 조율 중 → 예정 자동 전환 · 겹침 알림(다른 답사·확정 예약) · 완료/노쇼/취소 · 삭제', async () => {
  const f = fixture();
  let r = await f.admin('visits', 'POST', { name: '' }); assert.equal(r.status, 400);
  r = await f.admin('visits', 'POST', { name: '전화 고객', phone: '010-3333-4444', inquiry_ref: 'MS-0000-NONE' }); assert.equal(r.status, 400, '없는 문의번호');
  r = await f.admin('visits', 'POST', { name: '전화 고객', phone: '010-3333-4444' });
  assert.equal(r.status, 200); assert.equal(r.json.item.status, 'requested', '날짜·시간이 없으면 조율 중');
  const id = r.json.item.id;
  r = await f.admin('visits/' + id, 'PATCH', { date: D1 }); assert.equal(r.json.item.status, 'requested', '시간이 없으면 계속 조율 중');
  r = await f.admin('visits/' + id, 'PATCH', { time: '15:00' }); assert.equal(r.json.item.status, 'scheduled', '날짜·시간이 정해지면 예정');
  assert.deepEqual(r.json.clashes, []);
  // 같은 공간 같은 시간 다른 답사 → 겹침 알림, 2호는 따로 셈
  r = await f.admin('visits', 'POST', { name: '두 번째', date: D1, time: '15:15', duration: 30 });
  assert.equal(r.json.clashes.length, 1); assert.equal(r.json.clashes[0].type, 'visit');
  r = await f.admin('visits', 'POST', { name: '2호 답사', space_id: 'megaspot-gundae-2', date: D1, time: '15:00' }); assert.equal(r.json.clashes.length, 0);
  // 그 시간에 확정 예약(행사)이 있으면 알림
  await f.admin('bookings', 'POST', { space_id: 'megaspot-gundae', customer_name: '행사 고객', phone: '010-9999-8888', date: D1, start_h: 14, end_h: 18, headcount: 80, amount: 900000 });
  r = await f.admin('visits/' + id); assert.ok(r.json.clashes.some(c => c.type === 'booking' && c.name === '행사 고객'));
  // 전날 밤부터 이어지는 예약도 확인
  await f.admin('bookings', 'POST', { space_id: 'megaspot-gundae', customer_name: '올나잇', phone: '010-7777-6666', date: kstToday(2), start_h: 18, end_h: 31, headcount: 40, amount: 1100000 });
  r = await f.admin('visits', 'POST', { name: '아침 답사', date: D1, time: '06:00' }); assert.ok(r.json.clashes.some(c => c.name === '올나잇'));
  // 일자별 목록: 겹침 표시와 조율 필요 숫자
  let list = (await f.admin('visits?from=' + kstToday() + '&to=' + D2)).json;
  assert.equal(list.items.length, 4);
  const first = list.items.find(x => x.id === id); assert.ok(first.clashes.length >= 2);
  assert.equal(list.visits_requested, 0); assert.equal(list.statuses.noshow, '노쇼');
  // 상태 변경과 결과
  r = await f.admin('visits/' + id, 'PATCH', { status: 'done', result: 'booked', result_note: '2호로 계약' });
  assert.equal(r.json.item.status, 'done'); assert.equal(r.json.item.result_label, '예약 진행'); assert.deepEqual(r.json.clashes, [], '끝난 답사는 겹침 알림 없음');
  r = await f.admin('visits/' + id, 'PATCH', { status: 'unknown' }); assert.equal(r.status, 400);
  list = (await f.admin('visits?status=active&from=' + kstToday() + '&to=' + D2)).json; assert.equal(list.items.length, 3, '진행 중만');
  r = await f.admin('visits/' + id, 'DELETE'); assert.equal(r.status, 200);
  assert.equal((await f.admin('visits/' + id)).status, 404);
  // 일자별 예약에도 현장답사가 함께 내려옴
  const resv = (await f.admin('reservations?from=' + kstToday() + '&to=' + D2)).json; assert.equal(resv.visits.length, 3);
  const dash = (await f.admin('dashboard')).json; assert.equal(dash.visits.visits_upcoming.length, 3);
});

test('홈페이지 예약 신청의 현장답사 희망은 조율 중 답사로 들어오고, 날짜 없는 요청도 목록 맨 위에 보임', async () => {
  const f = fixture();
  let r = await f.inquiry({ space_id: 'megaspot-gundae', reserve: true, date: D2, start_h: 18, end_h: 22, headcount: 60, total: 800000, visit_wish: { want: true, date: '2020-01-01' } });
  assert.equal(r.status, 400, '지난 희망 날짜');
  r = await f.inquiry({ space_id: 'megaspot-gundae', reserve: true, date: D2, start_h: 18, end_h: 22, headcount: 60, total: 800000, visit_wish: { want: true, date: D1, time: '19:00', people: 2, note: '퇴근 후 가능' } });
  assert.equal(r.status, 200); assert.match(r.json.visit, /^SV-/);
  r = await f.inquiry({ space_id: 'request', inquiry_type: 'event', headcount: 200, visit_wish: { want: true } });
  assert.equal(r.status, 200);
  r = await f.inquiry({ space_id: 'megaspot-gundae', inquiry_type: 'event', visit_wish: { want: false, date: D1 } });
  assert.equal(r.json.visit, '', '체크하지 않으면 답사 없음');
  const list = (await f.admin('visits?from=' + kstToday())).json;
  assert.equal(list.items.length, 1); assert.equal(list.undated.length, 1);
  const w = list.items[0];
  assert.equal(w.status, 'requested'); assert.equal(w.time, '', '희망 시간은 확정 전까지 일정에 넣지 않음'); assert.equal(w.wish.time, '19:00'); assert.equal(w.wish.note, '퇴근 후 가능');
  assert.equal(w.source, 'web'); assert.equal(w.people, 2); assert.equal(w.inq_status, '문의 접수');
  assert.equal(list.visits_requested, 2);
  const det = (await f.admin('inquiries/' + w.inquiry_ref)).json; assert.equal(det.item.data.visit_wish.time, '19:00');
});
