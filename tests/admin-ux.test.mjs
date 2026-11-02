import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixture, quoteInput, saveQuote, DAY, NEXT } from './helpers/admin-fixture.mjs';
import { onRequestGet as availability } from '../functions/api/availability.js';
const source = readFileSync(new URL('../assets/js/pages/admin.js', import.meta.url), 'utf8');
const overview = vm.createContext({ module: { exports: {} } }); vm.runInContext(readFileSync(new URL('../assets/js/inquiry-overview.js', import.meta.url), 'utf8'), overview);
function f(t, options) { const state = fixture(options); t.after(() => state.db.close()); return state; }

test('직접 수정 이후 새 견적의 할인 금액·조건이 문의와 예약에 한 번에 반영됨', async t => {
  const { api } = f(t, { booking: true }); await api('inquiries/MS-TEST', 'PATCH', { total: 700000 });
  await saveQuote(api, { input: quoteInput({ date: NEXT, start: 18, end: 23, people: 70 }) });
  const inquiry = (await api('inquiries/MS-TEST')).item, booking = (await api('bookings')).items[0];
  assert.equal(inquiry.effective_amount, 630000); assert.equal(booking.amount, 630000);
  assert.equal(inquiry.event_date, NEXT); assert.equal(booking.date, NEXT); assert.equal(booking.headcount, 70); assert.equal(booking.start_h, 18);
  assert.equal(inquiry.data.quote_input.discVal, 10); assert.equal(inquiry.data.price_adjustment.reason, '재방문 할인');
});
test('내용만 수정하면 최신 견적 금액과 할인 입력을 그대로 보존함', async t => {
  const { api, data } = f(t); await saveQuote(api);
  await api('inquiries/MS-TEST', 'PATCH', { ...data, edit: true, name: '이름만 수정', amount_mode: 'keep' });
  const item = (await api('inquiries/MS-TEST')).item; assert.equal(item.effective_amount, 630000); assert.equal(item.data.price_adjustment.discount, 70000);
});
test('수정창의 직접 할인 계산은 원금·비율·사유를 저장함', async t => {
  const { api, data } = f(t); const adjustment = { base_total: 700000, type: 'pct', value: 10, reason: '단골 할인', discount: 70000, total: 630000 };
  await api('inquiries/MS-TEST', 'PATCH', { ...data, edit: true, amount_mode: 'manual', total: adjustment.total, price_adjustment: adjustment });
  const d = (await api('inquiries/MS-TEST')).item.data; assert.equal(d.total, 630000); assert.equal(d.price_adjustment.type, 'pct');
});
test('확정 문의의 고객·연락처·인원·일시를 수정하면 예약과 고객 달력도 이동함', async t => {
  const { api, data, env } = f(t, { booking: true });
  await api('inquiries/MS-TEST', 'PATCH', { ...data, edit: true, date: NEXT, start_h: 18, end_h: 23, headcount: 70, name: '변경 고객', phone: '010-5555-6666', amount_mode: 'keep' });
  const b = (await api('bookings')).items[0]; assert.equal(b.customer_name, '변경 고객'); assert.equal(b.phone, '010-5555-6666'); assert.equal(b.date, NEXT); assert.equal(b.headcount, 70);
  const r = await availability({ env, request: new Request('https://local.test/api/availability?space=megaspot-gundae&from=' + DAY + '&to=' + NEXT) });
  const days = (await r.json()).days; assert.equal(days[DAY], undefined); assert.equal(days[NEXT].state, 'partial');
});
test('확정 일정 변경이 다른 예약과 겹치면 문의·예약 모두 변경하지 않음', async t => {
  const { api, data } = f(t, { booking: true });
  await api('bookings', 'POST', { customer_name: '다른 고객', phone: '010-1111-2222', date: NEXT, start_h: 18, end_h: 23 });
  const r = await api('inquiries/MS-TEST', 'PATCH', { ...data, edit: true, date: NEXT, start_h: 18, end_h: 23, amount_mode: 'keep' }, 409); assert.equal(r.code, 'DATE_HAS_BOOKING');
  assert.equal((await api('inquiries/MS-TEST')).item.event_date, DAY); assert.equal((await api('bookings')).items.find(b => b.booking_code === 'BK-TEST').date, DAY);
});
test('예약이 소유한 마감 표시도 일정 수정과 함께 이동함', async t => {
  const { api, db, data } = f(t, { booking: true });
  await api('calendar', 'POST', { date: DAY, state: 'full', space_id: 'megaspot-gundae', memo: '예약 BK-TEST' });
  await api('inquiries/MS-TEST', 'PATCH', { ...data, edit: true, date: NEXT, amount_mode: 'keep' });
  assert.equal(db.prepare('SELECT date FROM calendar_blocks').get().date, NEXT);
});
test('확정 예약의 주요 정보·금액이 바뀌면 기존 확정서를 재발급하도록 함', async t => {
  const { api, data } = f(t, { booking: true }); await api('bookings/BK-TEST/confirm-doc', 'PUT', { doc: { customer: data.name, amount: 500000, pay_status: 'pending' } });
  const r = await api('inquiries/MS-TEST', 'PATCH', { ...data, edit: true, name: '수정 이름', amount_mode: 'keep' });
  assert.equal(r.confirm_doc_invalidated, true); assert.equal((await api('bookings/BK-TEST/confirm-doc')).doc, null);
});
for (const [inquiryStatus, bookingStatus] of [['취소·환불', 'cancelled'], ['이용 완료', 'completed']]) {
  test('문의 상태와 연결 예약 동기화: ' + inquiryStatus, async t => { const { api } = f(t, { booking: true }); await api('inquiries/MS-TEST', 'PATCH', { status: inquiryStatus }); assert.equal((await api('bookings')).items[0].status, bookingStatus); });
}
test('예약을 취소하면 문의도 취소되고 예약 마감이 해제됨', async t => {
  const { api } = f(t, { booking: true }); await api('calendar', 'POST', { date: DAY, state: 'full', memo: '예약 BK-TEST' }); await api('bookings/BK-TEST', 'PATCH', { status: 'cancelled' });
  assert.equal((await api('inquiries/MS-TEST')).item.status, '취소·환불'); assert.equal((await api('calendar')).items.length, 0);
});
test('예약 등록 없이 문의 상태만 확정하는 요청은 거절함', async t => { const { api } = f(t); assert.equal((await api('inquiries/MS-TEST', 'PATCH', { status: '예약 확정' }, 409)).code, 'USE_CONFIRM'); });
test('직접 예약 등록도 같은 문의 중복·시간 겹침을 막음', async t => {
  const { api } = f(t, { booking: true });
  await api('bookings', 'POST', { inquiry_ref: 'MS-TEST', date: DAY, amount: 500000 }, 409);
  await api('bookings', 'POST', { customer_name: '겹침', phone: '010-2222-3333', date: DAY, start_h: 12, end_h: 18 }, 409);
  await api('bookings', 'POST', { customer_name: '다른 시간', phone: '010-2222-3333', date: DAY, start_h: 18, end_h: 23 });
  assert.equal((await api('bookings')).items.length, 2);
});
test('뷔페를 포함한 견적은 문의 요약·고객 안내문에서 한 번만 합산함', async t => {
  const { api, db } = f(t); db.prepare("UPDATE inquiries SET data=json_set(data,'$.catering',json(?))").run(JSON.stringify({ course: 'classic', total: 300000, status: 'pending', summary: '뷔페' }));
  await saveQuote(api, { total: 800000, extras: [{ kind: 'catering', label: '출장뷔페 · 구성', amount: 300000 }] });
  const it = (await api('inquiries/MS-TEST')).item;
  const ctx = vm.createContext({ window: { MEGASPOT_INQUIRY_OVERVIEW: overview.module.exports }, cur: { quotes: [] }, currentAmount: x => x.effective_amount, spaceName: () => '', DEFAULT_SPACE: 'megaspot-gundae', kd: x => x, timeText: () => '', optText: () => '' });
  vm.runInContext(source.slice(source.indexOf('  function inquiryOverviewModel('), source.indexOf('  function amountSection(')), ctx);
  const model = ctx.inquiryOverviewModel(it, it.data); assert.equal(model.rows[0].amount, 500000); assert.equal(model.total, 800000); assert.ok(overview.module.exports.customerText(model).includes('800,000원'));
});
test('뷔페 구성 수정·취소는 포함된 관리 금액에서도 반영됨', async t => {
  const { api, db } = f(t); const order = (await api('catering/orders', 'POST', { inquiry_ref: 'MS-TEST', config: { course: 'classic', people: 60 }, status: 'pending' })).item;
  await saveQuote(api, { total: 500000 + order.total, extras: [{ label: '출장뷔페 · 구성', amount: order.total }] });
  const changed = (await api('catering/orders', 'POST', { inquiry_ref: 'MS-TEST', config: { course: 'classic', people: 70 }, status: 'confirmed' })).item;
  assert.equal((await api('inquiries/MS-TEST')).item.effective_amount, 500000 + changed.total);
  await api('catering/orders/' + changed.ref, 'PATCH', { status: 'cancelled' }); assert.equal((await api('inquiries/MS-TEST')).item.effective_amount, 500000);
});
test('과거 마감·공간 필터가 조회되고 다른 공간은 섞이지 않음', async t => {
  const { api } = f(t); for (const space of ['megaspot-gundae', 'megaspot-gundae-2']) await api('calendar', 'POST', { date: '2020-01-01', state: 'full', space_id: space });
  const r = await api('calendar?from=2020-01-01&to=2020-01-31&space=megaspot-gundae-2'); assert.equal(r.items.length, 1); assert.equal(r.items[0].space_id, 'megaspot-gundae-2');
});
test('300건이 넘는 예약은 서버 필터·다음 페이지로 빠짐없이 조회됨', async t => {
  const { api, db } = f(t); const add = db.prepare('INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,status,created_at) VALUES(?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 301; i++) add.run('BK-' + i, 'megaspot-gundae', '고객', '010-1111-2222', '2222', i === 0 ? DAY : '2099-12-31', 'confirmed', DAY);
  assert.equal((await api('bookings?from=' + DAY + '&to=' + DAY)).items[0].booking_code, 'BK-0');
  assert.equal((await api('bookings')).has_more, true); assert.equal((await api('bookings?page=1')).items.length, 1);
});
test('모임 정원 초과 확정을 막고 취소 후 대기자를 승급함', async t => {
  const { api, db } = f(t); db.prepare('INSERT INTO meetups(ref,status,title,event_date,capacity,data,created_at) VALUES(?,?,?,?,?,?,?)').run('MO-2611-TEST', 'open', '모임', DAY, 2, '{"mode":"auto"}', DAY);
  const add = db.prepare('INSERT INTO meetup_apps(ref,meetup_ref,status,name,phone,phone_last4,people,data,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
  for (const [id, status] of [['0001', 'confirmed'], ['0002', 'confirmed'], ['0003', 'waitlist']]) add.run('AP-2611-' + id, 'MO-2611-TEST', status, '참가자', '010-1111-2222', '2222', 1, '{}', DAY);
  await api('meetups/MO-2611-TEST/apps/AP-2611-0003', 'PATCH', { status: 'confirmed' }, 409);
  const r = await api('meetups/MO-2611-TEST/apps/AP-2611-0001', 'PATCH', { status: 'cancelled' }); assert.equal(r.promoted.length, 1); assert.equal(db.prepare("SELECT status FROM meetup_apps WHERE ref='AP-2611-0003'").get().status, 'confirmed');
});
