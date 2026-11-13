// 관리자 KPI 지표 점검 (2026-11-14)
//  · 매출: 매출 현황과 같은 기록 · 이용일/결제일 기준 · 예약률(24시간 × 일수, 다음 날로 넘어가는 시간) · 이용 인원 · 취소율
//  · 대기 신청 → 확정 · 부가서비스 이용률(견적·주문·식음료 상태) · 홈페이지 방문 통계 수집과 집계
//   node --test tests/admin-kpi.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/admin-fixture.mjs';
import { onRequestPost as statsPost } from '../functions/api/stats.js';
import { previousPeriod, addDays } from '../functions/api/_kpi.js';
import { cleanPath } from '../functions/api/stats.js';

const first = 'megaspot-gundae', second = 'megaspot-gundae-2';
const event = '2026-11-20', stamp = '2026-11-03 15:00:00';   // 결제 기록 15:00 UTC = 한국 11월 4일 0시
const range = 'from=2026-11-01&to=2026-11-30';
function setup(t) { const f = fixture({ booking: true, date: event }); t.after(() => f.db.close()); return f; }
function order(db, id, { product = 'pass-day-wdfri', status = 'paid', booking = null, paidAt = stamp, price = 100000, test = 0 } = {}) {
  db.prepare(`INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,test,created_at,paid_at,updated_at)
    VALUES(?,?,?,?,?,'고객','01012345678','{}',?,?,?,?,?,?)`).run(id, product, '온라인 주문', product.startsWith('addon-') ? null : event, price, status, booking, test, stamp, paidAt, stamp);
}
function booking(db, code, { space = first, date = event, status = 'confirmed', start = 10, end = 17, people = 40, inquiry = null, slot = null } = {}) {
  db.prepare(`INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,slot,headcount,status,start_h,end_h,created_at)
    VALUES(?,?,?,'고객','01012345678','5678',?,?,?,?,?,?,?)`).run(code, space, inquiry, date, slot, people, status, start, end, stamp);
}
function inquiry(db, ref, { space = first, date = event, status = '문의 접수', data = {}, created = stamp } = {}) {
  db.prepare('INSERT INTO inquiries(ref,space_id,status,name,phone,event_date,headcount,data,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(ref, space, status, '고객', '010-1111-2222', date, 30, JSON.stringify({ space_id: space, date, channel: 'web', ...data }), created);
}

test('기간 비교: 달 단위면 앞 달, 그 밖에는 같은 길이의 바로 앞 기간', () => {
  assert.deepEqual(previousPeriod('2026-11-01', '2026-11-30'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(previousPeriod('2026-03-01', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(previousPeriod('2026-01-01', '2026-03-31'), { from: '2025-10-01', to: '2025-12-31' });
  assert.deepEqual(previousPeriod('2026-11-05', '2026-11-14'), { from: '2026-10-26', to: '2026-11-04' });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('KPI 매출(이용일 기준)은 매출 현황 합계와 같고, 결제일 기준은 기록한 한국 날짜로 묶는다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-14T03:00:00Z') });
  const { db, api } = setup(t);
  booking(db, 'BK-SECOND', { space: second });
  order(db, 'SECOND', { product: 'addon-cleaning', booking: 'BK-SECOND', price: 200000 });
  order(db, 'PASS', { price: 30000 });
  order(db, 'PARK', { product: 'parking-batch', price: 20000 });
  order(db, 'TEST', { test: 1 });
  order(db, 'REFUND', { status: 'refunded', booking: 'BK-SECOND', price: 50000 });
  db.prepare('INSERT INTO payapp_refunds VALUES(?,?,?,?)').run('R1', 'REFUND', 50000, '2026-11-05 03:00:00');
  db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('BK-TEST','fee','receipt',300000,'2026-10-30 02:00:00')").run();

  const revenue = await api('revenue?' + range), kpi = await api('kpi?' + range);
  assert.ok(revenue.total.received > 0 && revenue.total.refunded > 0);
  assert.deepEqual(kpi.revenue.event, revenue.total);
  for (const k of [first, second, 'unassigned']) assert.deepEqual(kpi.revenue.branches[k].event, revenue.branches[k], k);
  // 결제일 기준: 10월 30일 수기 수납은 11월에서 빠지고, 온라인 결제는 11월 4일(한국)로 들어간다
  assert.equal(kpi.revenue.paid.received, kpi.revenue.event.received - 300000);
  assert.equal(kpi.revenue.daily.find(d => d.d === '2026-11-04').paid, 200000 + 30000 + 20000 + 50000);
  assert.equal(kpi.revenue.daily.find(d => d.d === '2026-11-05').paid, -50000);
  const oct = await api('kpi?from=2026-10-01&to=2026-10-31');
  assert.equal(oct.revenue.paid.received, 300000); assert.equal(oct.revenue.event.received, 0);
  // 오늘(11/14)이 들어 있는 달은 결제일 기준을 지난달 같은 시점(10/1~10/14)까지와 비교한다
  assert.deepEqual(kpi.elapsed, { from: '2026-10-01', to: '2026-10-14' }); assert.equal(kpi.ongoing, true);
  assert.equal(kpi.revenue.prev_paid.received, 0);
  const dec = await api('kpi?from=2026-12-01&to=2026-12-31');
  assert.equal(dec.ongoing, false); assert.deepEqual(dec.elapsed, dec.prev);
  // 지점을 고르면 그 지점만
  const one = await api('kpi?' + range + '&space=' + second);
  assert.equal(one.revenue.event.net, (await api('revenue?' + range + '&space=' + second)).total.net);
  assert.equal(one.revenue.branches.unassigned, undefined);
  assert.equal(kpi.revenue.monthly.length, 12); assert.equal(kpi.revenue.monthly[11].m, '2026-11');
});

test('예약률은 공간마다 24시간 × 일수 기준이고, 다음 날로 넘어간 시간과 오픈 전 날짜를 구분한다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-14T03:00:00Z') });
  const { db, api } = setup(t);   // BK-TEST: 1호점 11/20 10~17시 (7시간)
  booking(db, 'BK-NIGHT', { date: '2026-11-30', start: 18, end: 31 });   // 11/30 18~24 (6시간) + 12/1 0~7 (7시간)
  booking(db, 'BK-SLOT', { date: '2026-11-21', start: null, end: null, slot: 'ampm' });   // 9~18 (9시간)
  booking(db, 'BK-CANCEL', { date: '2026-11-22', status: 'cancelled' });
  booking(db, 'BK-OVER', { date: '2026-11-20', start: 15, end: 19 });   // 같은 날 겹치는 15~17시는 한 번만
  const kpi = await api('kpi?' + range + '&space=' + first);
  assert.equal(kpi.occupancy.cur.capacity, 30 * 24);
  assert.equal(kpi.occupancy.cur.booked, 7 + 2 + 6 + 9);
  assert.equal(kpi.occupancy.cur.rate, Math.round((24 / 720) * 1000) / 10);
  const dec = await api('kpi?from=2026-12-01&to=2026-12-01&space=' + first);
  assert.equal(dec.occupancy.cur.booked, 7, '자정을 넘긴 7시간은 다음 날 예약률에 들어간다');
  const day20 = kpi.occupancy.grid.find(g => g.d === '2026-11-20');
  assert.deepEqual(day20.h.map((v, h) => v ? h : -1).filter(h => h >= 0), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
  // 2호점은 2026-11-13 오픈 — 전체 보기에서 오픈 전 날짜는 분모에 넣지 않는다
  const both = await api('kpi?' + range);
  assert.equal(both.occupancy.cur.capacity, 30 * 24 + 18 * 24);
  assert.equal(both.occupancy.spaces[second].capacity, 18 * 24);
  assert.equal(both.occupancy.monthly.find(m => m.m === '2026-11').booked, 24);
  // 이용 인원·취소율
  assert.equal(kpi.people.cur.bookings, 4); assert.equal(kpi.people.cur.people, 30 + 40 * 3);
  assert.equal(kpi.cancel.cur.total, 5); assert.equal(kpi.cancel.cur.cancelled, 1); assert.equal(kpi.cancel.cur.rate, 20);
  assert.equal(kpi.people.sizes['31~50명'], 3); assert.equal(kpi.people.sizes['30명 이하'], 1);
});

test('대기 신청 → 확정과 문의 단계, 부가서비스 이용률을 센다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-14T03:00:00Z') });
  const { db, api } = setup(t);   // MS-TEST: 예약 확정 (BK-TEST)
  inquiry(db, 'MS-W1', { data: { reserve: true, came_from: { src: 'naver', label: '네이버' } } });   // 같은 날 대기 중
  inquiry(db, 'MS-W2', { status: '대기 취소' });
  inquiry(db, 'MS-W3', { date: '2026-11-25', status: '취소·환불' });
  inquiry(db, 'MS-DEL', { status: '삭제됨' });
  inquiry(db, 'MS-PART', { data: { inquiry_type: 'partner' } });
  const kpi = await api('kpi?' + range);
  assert.deepEqual([kpi.wait.cur.total, kpi.wait.cur.confirmed, kpi.wait.cur.pending, kpi.wait.cur.wait_cancelled, kpi.wait.cur.cancelled_after], [4, 1, 1, 1, 1]);
  assert.equal(kpi.wait.cur.rate, 25); assert.equal(kpi.wait.cur.decided_rate, Math.round(1 / 3 * 1000) / 10);
  assert.equal(kpi.wait.cur.contested_days, 1);
  assert.equal(kpi.funnel.cur.inquiries, 5, '삭제한 문의는 빼고 문의 접수일(한국) 기준');
  assert.equal(kpi.funnel.cur.confirmed, 2);
  assert.equal(kpi.funnel.sources.naver, 1);
  assert.equal(kpi.wait.now.waiting, 1, '오늘 이후 대기 중인 신청 (제휴 제안 제외)');

  // 부가서비스: 견적 옵션·추가 항목, 결제한 옵션 상품, 식음료 확정 상태
  const extras = [{ label: '사회자 섭외 (2시간)', amount: 300000 }, { label: '포토월 제작', amount: 100000 }];
  db.prepare('INSERT INTO quotes(quote_no,inquiry_ref,customer,event_date,total,data,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('Q-OLD', 'MS-TEST', '고객', event, 1, JSON.stringify({ input: { opts: {} }, extras: [] }), stamp);
  db.prepare('INSERT INTO quotes(quote_no,inquiry_ref,customer,event_date,total,data,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('Q-NEW', 'MS-TEST', '고객', event, 1, JSON.stringify({ input: { opts: { manager: { on: true } } }, extras }), stamp);
  db.prepare("UPDATE inquiries SET data=json_set(data,'$.cocktail',json('{\"cups\":80,\"status\":\"confirmed\"}'),'$.reception',json('{\"people\":40}')) WHERE ref='MS-TEST'").run();
  booking(db, 'BK-B', { date: '2026-11-21' }); order(db, 'BANNER', { product: 'addon-banner', booking: 'BK-B', price: 120000 });
  inquiry(db, 'MS-C', { date: '2026-11-22', status: '예약 확정', data: { options: { banner: true }, catering: { people: 50, status: 'pending' } } });
  booking(db, 'BK-C', { date: '2026-11-22', inquiry: 'MS-C' });
  const a = (await api('kpi?' + range)).addons.cur;
  assert.equal(a.base, 3);
  assert.deepEqual([a.items.mc.used, a.items.design.used, a.items.design.asked, a.items.manager.used, a.items.cocktail.used, a.items.reception.asked, a.items.buffet.asked], [1, 2, 1, 1, 1, 1, 1]);
  assert.equal(a.items.design.rate, Math.round(2 / 3 * 1000) / 10);
});

test('방문 통계: 같은 출처의 페이지 조회·머문 시간·링크 클릭만 받고 KPI에 모인다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-14T03:00:00Z') });
  const { db, env, api } = setup(t);
  const post = (body, headers = {}) => statsPost({ env, request: new Request('https://megaspot.kr/api/stats', { method: 'POST', body: JSON.stringify(body),
    headers: { origin: 'https://megaspot.kr', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', 'content-type': 'text/plain', ...headers } }) });
  const v = (pid, sid, p, extra = {}) => post({ t: 'v', pid, vid: 'visitor0001', sid, p, ti: '페이지 · 메가스팟', r: '', u: '', n: 0, f: 0, ...extra });
  assert.equal((await v('page00000001', 'session00001', '/spaces/megaspot-gundae/?utm_source=x', { f: 1, n: 1, r: 'https://m.search.naver.com/search.naver?query=대관' })).status, 204);
  await v('page00000002', 'session00001', '/inquiry/');
  await v('page00000003', 'session00002', '/', { f: 1 });
  await v('page00000004', 'session00002', '/admin/');   // 관리자 화면은 받지 않음
  await v('page00000005', 'session00003', '/', { f: 1 }, {});
  await post({ t: 'v', pid: 'page00000006', vid: 'visitor0002', sid: 'session00009', p: '/', f: 1 }, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
  assert.equal((await post({ t: 'v', pid: 'page00000007', vid: 'visitor0003', sid: 'session00010', p: '/', f: 1 }, { origin: 'https://evil.example' })).status, 403);
  await post({ t: 'd', pid: 'page00000001', s: 40 }); await post({ t: 'd', pid: 'page00000001', s: 25 }); await post({ t: 'd', pid: 'page00000002', s: 5000 });
  await post({ t: 'c', p: '/spaces/megaspot-gundae/', k: 'kakao', h: 'https://pf.kakao.com/_abc?x=1', l: ' 카카오톡  문의 ' });
  await post({ t: 'c', p: '/spaces/megaspot-gundae/', k: 'kakao', h: 'https://pf.kakao.com/_abc', l: '카카오톡 문의' });
  await post({ t: 'c', p: '/', k: 'tel', h: 'tel:01012345678', l: '전화' });
  await post({ t: 'c', p: '/', k: 'internal', h: '/venues/?q=1', l: '공간 찾기' });
  const rows = db.prepare('SELECT pid,path,src,ref_host,device,dwell,title FROM web_hits ORDER BY pid').all();
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.path), ['/spaces/megaspot-gundae/', '/inquiry/', '/', '/']);
  assert.deepEqual([rows[0].src, rows[0].ref_host, rows[0].device, rows[0].dwell, rows[0].title], ['naver', 'm.search.naver.com', 'mobile', 40, '페이지']);
  assert.equal(rows[1].dwell, 1800, '머문 시간은 30분까지만');
  assert.equal(rows[2].src, 'direct');
  assert.deepEqual(db.prepare('SELECT kind,target,label,n FROM web_clicks ORDER BY kind').all().map(r => ({ ...r })),
    [{ kind: 'internal', target: '/venues/', label: '공간 찾기', n: 1 }, { kind: 'kakao', target: 'pf.kakao.com/_abc', label: '카카오톡 문의', n: 2 }, { kind: 'tel', target: 'tel', label: '전화', n: 1 }]);
  const w = (await api('kpi?' + range)).web;
  assert.equal(w.since, '2026-11-14');
  assert.deepEqual([w.cur.pv, w.cur.uv, w.cur.sessions, w.cur.new_uv, w.cur.n, w.cur.bounce], [4, 1, 3, 1, 3, 2]);
  assert.equal(w.cur.bounce_rate, Math.round(2 / 3 * 1000) / 10);
  assert.equal(w.pages[0].path, '/'); assert.equal(w.pages[0].pv, 2);
  assert.equal(w.clicks.kakao, 2); assert.equal(w.links[0].target, 'pf.kakao.com/_abc');
  assert.equal(w.devices.mobile, 3);
  assert.equal(w.hours[12], 4, '한국 시각 12시');
});

test('주소 정리: ? 뒤 값과 개인 링크 주소는 남기지 않는다', () => {
  assert.equal(cleanPath('/booking/?k=secret'), '/booking/');
  assert.equal(cleanPath('/confirm/abc123token'), '/confirm/');
  assert.equal(cleanPath('//evil.example/x'), '');
  assert.equal(cleanPath('https://megaspot.kr/'), '');
  assert.equal(cleanPath('/venues/%EC%84%B1%EC%88%98/'), '/venues/성수/');
});

test('관리자 KPI 화면 파일이 메뉴·스크립트에 연결되어 있다', () => {
  const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
  const nav = readFileSync(new URL('../assets/js/pages/admin-navigation.js', import.meta.url), 'utf8');
  const site = readFileSync(new URL('../assets/js/site.js', import.meta.url), 'utf8');
  assert.match(html, /admin-kpi\.js\?v=/); assert.match(html, /admin-kpi\.css\?v=/);
  assert.ok(html.indexOf('admin-kpi.js') < html.indexOf('admin-navigation.js'), 'KPI 화면은 메뉴 정리 전에 만들어야 함');
  assert.match(nav, /'kpi'/);
  assert.match(site, /\/assets\/js\/stats\.js\?v=/);
});
