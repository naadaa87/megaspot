// 출장뷔페 진행 건 점검 — 예약·문의 불러오기 · 계산한 구성 저장 · 대기/확정/취소 · 문의 연동 · 예약 연동 (Node 22.13+ · node:sqlite)
//   node --test tests/catering-orders.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as adminApi } from '../functions/api/admin/[[path]].js';
import { onRequestPost as inquiryPost } from '../functions/api/inquiry.js';
import { kstToday } from '../functions/api/_lib.js';

const ORIGIN = 'https://megaspot.test';
const D1 = kstToday(12), D2 = kstToday(20);
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
    const res = await inquiryPost({ env, request: new Request(ORIGIN + '/api/inquiry', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.2.0.' + (ip++) }, body: JSON.stringify({ name: '김뷔페', phone: '010-3000-4000', agree_privacy: true, ...body }) }) });
    return { status: res.status, json: await res.json() };
  };
  return { db, env, admin, inquiry };
}
const CLASSIC60 = { course: 'classic', people: 60, bbq: '', beer: 0, note: '견과류 알레르기 1명' };

test('예약·문의 목록에서 고르고, 계산한 구성을 그 건에 저장 (대기 → 확정 → 취소, 같은 건은 하나만)', async () => {
  const f = fixture();
  // 고객이 홈페이지에서 출장뷔페 상담을 함께 신청한 예약 문의
  let r = await f.inquiry({ space_id: 'megaspot-gundae', reserve: true, date: D1, start_h: 18, end_h: 22, headcount: 60, total: 800000, catering: { on: true, course: 'basic', people: 60 } });
  assert.equal(r.status, 200); const ref = r.json.ref;
  // 문의 없이 바로 잡은 예약
  r = await f.admin('bookings', 'POST', { space_id: 'megaspot-gundae-2', customer_name: '스페이스클라우드 고객', phone: '010-5555-6666', date: D2, start_h: 12, end_h: 17, headcount: 120, amount: 1200000 });
  assert.equal(r.status, 200); const code = r.json.booking_code || r.json.code || r.json.item?.booking_code;
  assert.ok(code, JSON.stringify(r.json));

  // 불러오기 목록: 예약 1 + 문의 1, 고객 요청 표시
  let t = (await f.admin('catering/targets')).json;
  assert.equal(t.items.length, 2);
  const ti = t.items.find(x => x.kind === 'inquiry'), tb = t.items.find(x => x.kind === 'booking');
  assert.equal(ti.ref, ref); assert.match(ti.request, /베이직/); assert.equal(ti.order, null); assert.equal(ti.start_h, 18);
  assert.equal(tb.code, code); assert.equal(tb.space_id, 'megaspot-gundae-2'); assert.equal(tb.headcount, 120);
  assert.equal((await f.admin('dashboard')).json.catering.catering_requested, 1, '고객 요청만 있는 문의');
  // 검색
  assert.equal((await f.admin('catering/targets?q=스페이스')).json.items.length, 1);
  assert.equal((await f.admin('catering/targets?q=3000-4000')).json.items[0].ref, ref, '연락처 숫자로 찾기');

  // 잘못된 저장
  assert.equal((await f.admin('catering/orders', 'POST', { config: CLASSIC60 })).status, 400, '연결할 건 없음');
  assert.equal((await f.admin('catering/orders', 'POST', { inquiry_ref: 'MS-0000-NONE', config: CLASSIC60 })).status, 404);
  assert.equal((await f.admin('catering/orders', 'POST', { inquiry_ref: ref, config: { course: '', people: 60 } })).status, 400, '구성 없음');
  assert.equal((await f.admin('catering/orders', 'POST', { inquiry_ref: ref, config: CLASSIC60, status: 'done' })).status, 400, '없는 상태');

  // 문의에 저장 (기본 대기) → 서버가 다시 계산, 문의 data.catering 에도 상태와 함께 들어감
  r = await f.admin('catering/orders', 'POST', { inquiry_ref: ref, config: CLASSIC60, meal_time: '18:30' });
  assert.equal(r.status, 200); assert.equal(r.json.created, true);
  const o = r.json.item; assert.match(o.ref, /^CO-\d{4}-[A-Z0-9]{4}$/);
  assert.equal(o.status, 'pending'); assert.equal(o.status_label, '대기'); assert.equal(o.total, 2750000, '클래식 60명 = (40,000×60+100,000)×1.1');
  assert.equal(o.customer, '김뷔페'); assert.equal(o.date, D1); assert.equal(o.meal_time, '18:30'); assert.equal(o.note, '견과류 알레르기 1명');
  let det = (await f.admin('inquiries/' + ref)).json;
  assert.equal(det.item.data.catering.status, 'pending'); assert.equal(det.item.data.catering.order_ref, o.ref); assert.equal(det.item.data.catering.by, 'admin'); assert.equal(det.item.data.catering.total, 2750000);
  assert.equal(det.catering_order.ref, o.ref);
  assert.ok(det.log.some(l => l.kind === 'catering.created'));
  let list = (await f.admin('inquiries')).json.items.find(x => x.ref === ref);
  assert.equal(list.data.catering.status, 'pending', '문의 목록에 상태');
  assert.equal((await f.admin('dashboard')).json.todo.find(x => x.ref === ref).catering_status, 'pending', '대시보드 목록에도 상태');
  assert.equal((await f.admin('dashboard')).json.catering.catering_requested, 0, '계산해 저장하면 요청 숫자에서 빠짐');

  // 같은 문의를 다시 저장하면 새로 만들지 않고 고침 + 확정
  r = await f.admin('catering/orders', 'POST', { inquiry_ref: ref, config: { ...CLASSIC60, people: 70, beer: 1 }, status: 'confirmed' });
  assert.equal(r.json.created, false); assert.equal(r.json.item.ref, o.ref); assert.equal(r.json.item.status, 'confirmed'); assert.ok(r.json.item.confirmed_at);
  assert.equal(r.json.item.total, Math.round((40000 * 70 + 120000 + 100000) * 1.1));
  assert.ok((await f.admin('inquiries/' + ref)).json.log.some(l => l.kind === 'catering.status'));

  // 예약에 저장 (문의 없음)
  r = await f.admin('catering/orders', 'POST', { booking_code: code, config: { course: 'premium', people: 120, bbq: '', beer: 2 } });
  assert.equal(r.status, 200); const ob = r.json.item;
  assert.equal(ob.booking_code, code); assert.equal(ob.inquiry_ref, ''); assert.equal(ob.space_id, 'megaspot-gundae-2'); assert.equal(ob.customer, '스페이스클라우드 고객');

  // 목록 · 숫자 · 상태 빠른 변경
  let ol = (await f.admin('catering/orders')).json;
  assert.equal(ol.items.length, 2); assert.equal(ol.catering_pending, 1); assert.equal(ol.catering_confirmed, 1);
  assert.equal(ol.items[0].ref, o.ref, '행사일 순'); assert.equal(ol.items[0].target_kind, 'inquiry'); assert.equal(ol.items[1].target_status, 'confirmed');
  assert.equal((await f.admin('catering/orders?status=confirmed')).json.items.length, 1);
  r = await f.admin('catering/orders/' + ob.ref, 'PATCH', { status: 'confirmed' });
  assert.equal(r.json.item.status, 'confirmed'); assert.equal(r.json.item.total, ob.total, '상태만 바꾸면 금액 그대로');
  r = await f.admin('catering/orders/' + o.ref, 'PATCH', { status: 'cancelled' });
  assert.equal(r.json.item.status, 'cancelled'); assert.equal(r.json.item.confirmed_at, '');
  assert.equal((await f.admin('inquiries/' + ref)).json.item.data.catering.status, 'cancelled');
  assert.equal((await f.admin('catering/orders?status=active')).json.items.length, 1);
  assert.equal((await f.admin('catering/orders?booking_code=' + code)).json.item.ref, ob.ref);

  // 불러오기 목록에 진행 건 표시
  t = (await f.admin('catering/targets')).json;
  assert.equal(t.items.find(x => x.kind === 'booking').order.status, 'confirmed');
  assert.equal(t.items.find(x => x.kind === 'inquiry').order.status, 'cancelled');
  assert.equal(t.items.find(x => x.kind === 'inquiry').request, '', '관리자가 저장한 뒤에는 고객 요청 표시 없음');

  // 일자별 예약 · 예약확정서에도 반영
  const resv = (await f.admin('reservations?from=' + kstToday() + '&to=' + D2)).json;
  assert.equal(resv.items.find(x => x.code === code).catering.status, 'confirmed');
  assert.equal(resv.items.find(x => x.ref === ref).catering.status, 'cancelled');
  const cd = (await f.admin('bookings/' + code + '/confirm-doc')).json;
  if (cd.ok) assert.equal(cd.inquiry.catering.status, 'confirmed');
});

test('문의가 예약으로 확정돼도 같은 진행 건이 따라가고, 삭제하면 문의의 상태 표시만 지움', async () => {
  const f = fixture();
  let r = await f.admin('inquiries', 'POST', { name: '박확정', phone: '010-7777-8888', channel: 'kakao', space_id: 'megaspot-gundae', date: D1, headcount: 50 });
  const ref = r.json.ref;
  r = await f.admin('catering/orders', 'POST', { inquiry_ref: ref, config: { course: 'deluxe', people: 50 }, status: 'pending' });
  const oref = r.json.item.ref; assert.equal(r.json.item.booking_code, '');
  r = await f.admin('inquiries/' + ref + '/confirm', 'POST', { date: D1, start_h: 13, end_h: 17, headcount: 50, amount: 700000 });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const code = r.json.booking_code || r.json.code;
  // 불러오기 목록에는 예약으로만 한 번 나오고, 진행 건이 붙어 있음
  const t = (await f.admin('catering/targets')).json;
  assert.equal(t.items.length, 1); assert.equal(t.items[0].kind, 'booking'); assert.equal(t.items[0].order.ref, oref);
  // 예약으로 다시 저장해도 같은 건 (예약번호가 채워짐)
  r = await f.admin('catering/orders', 'POST', { booking_code: t.items[0].code, config: { course: 'deluxe', people: 55 }, status: 'confirmed' });
  assert.equal(r.json.created, false); assert.equal(r.json.item.ref, oref); assert.equal(r.json.item.booking_code, t.items[0].code); assert.equal(r.json.item.inquiry_ref, ref);
  if (code) assert.equal(t.items[0].code, code);
  // 삭제
  r = await f.admin('catering/orders/' + oref, 'DELETE'); assert.equal(r.status, 200);
  assert.equal((await f.admin('catering/orders/' + oref)).status, 404);
  const c = (await f.admin('inquiries/' + ref)).json.item.data.catering;
  assert.equal(c.status, undefined); assert.equal(c.order_ref, undefined); assert.equal(c.course, 'deluxe', '구성은 남김');
  assert.ok((await f.admin('inquiries/' + ref)).json.log.some(l => l.kind === 'catering.deleted'));
});
