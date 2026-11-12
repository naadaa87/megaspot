// 입점 호스트 플랫폼 점검 — 입점 신청(가입)·공간 정보·사진·심사·검색·예약 요청·견적·결제 기록·정산·통계·이용료·본사 부가서비스·행사 지원
//   node --test tests/hostplat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as hostsApi } from '../functions/api/hosts/[[path]].js';
import { onRequest as venuesApi } from '../functions/api/venues/[[path]].js';
import { onRequest as hqApi } from '../functions/api/hq/[[path]].js';
import { onRequestPost as planningPost, onRequestGet as planningGet } from '../functions/api/planning.js';
import { PLATFORM, tierOf, estimate, cleanSpace, addMonths } from '../functions/api/_hostplat.js';
import { SCHEMA } from '../functions/api/_schema.js';
import { kstToday } from '../functions/api/_lib.js';

const ORIGIN = 'https://megaspot.test';
const day = n => kstToday(n);
// 1×1 JPEG (사진 업로드 점검용)
const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { ADMIN_KEY: 'test-only', DB: { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  let ip = 1;
  const call = async (api, base, path, method, body, headers) => {
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + base + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.3.0.' + (ip++ % 250), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, json: ct.includes('json') ? await res.json() : null, res };
  };
  const jar = {};
  const host = (name) => async (path, method = 'GET', body) => {
    const r = await call(hostsApi, '/api/hosts/', path, method, body, jar[name] ? { cookie: jar[name] } : {});
    const set = r.res.headers.getSetCookie ? r.res.headers.getSetCookie() : []; const c = set.map(x => x.split(';')[0]).filter(x => x.startsWith('ms_host=')); if (c.length) jar[name] = c[0];
    return r;
  };
  return { db, env, host, venues: (path, method = 'GET', body) => call(venuesApi, '/api/venues/', path, method, body, {}), hq: (path, method = 'GET', body) => call(hqApi, '/api/hq/', path, method, body, { 'x-admin-key': 'test-only' }),
    planning: async (body) => { const res = await planningPost({ env, request: new Request(ORIGIN + '/api/planning', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.4.0.' + (ip++ % 250) }, body: JSON.stringify(body) }) }); return { status: res.status, json: await res.json() }; },
    planningGet: async (qs) => { const res = await planningGet({ env, request: new Request(ORIGIN + '/api/planning?' + qs, { headers: { 'cf-connecting-ip': '10.5.0.9' } }) }); return { status: res.status, json: await res.json() }; } };
}
const SPACE = { name: '성수 그랜드홀', region: 'seoul', address: '서울 성동구 성수이로 100', capacity: 180, area: 120, types: ['conference', 'banquet', 'popup'] };
const FULL = { ...SPACE, summary: '성수역 3분, 층고 5m 단독 홀', intro: '성수역에서 걸어서 3분, 층고 5m의 단독 홀입니다. 컨퍼런스와 연회 모두 가능합니다.', station: '성수역 3번 출구 3분', hours: '09:00~23:00',
  facilities: ['projector', 'sound', 'mic', 'parking', 'nope'], layouts: { standing: 180, theater: 150 }, parking: { count: 20, note: '건물 주차장' },
  price: { modes: ['hourly', 'package'], vat: 'excluded', hourly: { weekday: 150000, weekend: 200000, min_hours: 3 }, packages: [{ name: '종일', time: '09:00~22:00', weekday: 1500000, weekend: 2000000 }], base_people: 100, extra_per_person: 5000, deposit: 300000 },
  options: [{ name: '추가 마이크', price: 20000, unit: '개' }, { name: '청소', price: 100000, unit: '건' }],
  contact: { phone: '010-5555-1111', phone_public: true, kakao: 'https://pf.kakao.com/_abcd', instagram: 'https://www.instagram.com/seongsu_hall', homepage: 'javascript:alert(1)' },
  payment: { methods: ['bank', 'onsite'], bank: '국민', account: '123-45-6789', holder: '성수홀', deposit_pct: 30, tax_invoice: true }, refund: { preset: 'standard' }, biz: { type: 'corp', name: '㈜성수홀', no: '123-45-67890' } };
const SIGNUP = { email: 'Host@Example.com', password: 'host-pass-1234', name: '김호스트', phone: '010-5555-1111', company: '성수홀', agree_terms: true, agree_privacy: true, space: SPACE };

test('화면용 기준값(platform.js)과 서버 기준값이 같고, 서버 표 정의가 schema.sql 과 같음', () => {
  const ctx = { window: {} }; vm.runInNewContext(readFileSync(new URL('../assets/js/data/platform.js', import.meta.url), 'utf8'), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.MEGASPOT_PLATFORM)), JSON.parse(JSON.stringify(PLATFORM)));
  const a = new DatabaseSync(':memory:'), b = new DatabaseSync(':memory:'); a.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')); for (const s of SCHEMA) b.exec(s);
  const names = d => d.prepare("SELECT type || ':' || name AS n FROM sqlite_master ORDER BY 1").all().map(r => r.n).join('\n');
  assert.equal(names(a), names(b));
  // 이용료(부가세 별도 · 공간 한 곳 기준): 12개월 월 10만 · 6개월 월 15만 · 3개월 월 20만 · 1개월 월 25만, 2개월 무료
  assert.deepEqual(PLATFORM.plans.map(p => [p.months, p.monthly, p.daily]), [[12, 100000, 3300], [6, 150000, 5000], [3, 200000, 6600], [1, 250000, 8300]]); assert.equal(PLATFORM.freeMonths, 2);
  assert.equal(PLATFORM.typeGroups.flatMap(g => g.types).length, 22); assert.deepEqual(PLATFORM.regions.map(r => r[1]), ['서울', '인천', '경기', '그 외 지역']);
});

test('입점 기준: 50명·50평 이상은 대형, 100명·100평 이상은 초대형, 둘 다 못 미치면 신청 불가', () => {
  assert.equal(tierOf(49, 49), ''); assert.equal(tierOf(50, 10), 'large'); assert.equal(tierOf(10, 50), 'large'); assert.equal(tierOf(99, 99), 'large');
  assert.equal(tierOf(100, 20), 'mega'); assert.equal(tierOf(30, 100), 'mega'); assert.equal(tierOf(0, 0), '');
  assert.equal(cleanSpace({ ...SPACE, capacity: 40, area: 30 }).code, 'TOO_SMALL');
  assert.equal(cleanSpace({ ...SPACE, types: ['conference', 'banquet', 'popup', 'cafe', 'bar', 'studio', 'hall'] }).types.length, 5, '유형은 5가지까지');
  assert.match(cleanSpace({ ...SPACE, types: [] }).error, /유형/);
  assert.equal(addMonths('2026-12-31', 2), '2027-02-28');
});

test('예상 금액: 시간 대관(최소 시간·주말)·패키지·인원 추가·옵션·부가세 별도', () => {
  const d = cleanSpace(FULL).data, wd = '2026-11-18', we = '2026-11-21';   // 수요일 · 토요일
  let e = estimate(d, { mode: 'hourly', date: wd, start: '14:00', end: '16:00', people: 120, options: [{ i: 0, qty: 2 }] });
  assert.equal(e.ok, true); assert.equal(e.lines[0].amount, 450000, '2시간이어도 최소 3시간'); assert.equal(e.lines[1].amount, 100000, '20명 초과 × 5,000원'); assert.equal(e.lines[2].amount, 40000);
  assert.equal(e.subtotal, 590000); assert.equal(e.vat, 59000); assert.equal(e.total, 649000); assert.equal(e.deposit, 300000);
  e = estimate(d, { mode: 'hourly', date: we, start: '18:00', end: '23:00', people: 80 }); assert.equal(e.total, 1100000, '주말 20만 × 5시간 + 부가세');
  e = estimate(d, { mode: 'package', date: we, pkg: 0, people: 100 }); assert.equal(e.subtotal, 2000000);
  e = estimate(d, { mode: 'daily', date: wd }); assert.equal(e.ok, false, '하루 대관 요금이 없으면 견적 안내');
  e = estimate(d, { mode: 'hourly', date: wd }); assert.equal(e.ok, false);
});

test('입점 신청 → 정보·사진 채우기 → 심사 요청 → 본사 승인(2개월 무료) → 검색·상세 공개', async () => {
  const f = fixture(), h = f.host('a');
  assert.equal((await h('me')).status, 401);
  assert.equal((await h('signup', 'POST', { ...SIGNUP, space: { ...SPACE, capacity: 30, area: 20 } })).json.code, 'TOO_SMALL');
  assert.equal((await h('signup', 'POST', { ...SIGNUP, password: 'short' })).status, 400);
  assert.equal((await h('signup', 'POST', { ...SIGNUP, agree_terms: false })).status, 400);
  let r = await h('signup', 'POST', SIGNUP);
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.match(r.json.space, /^SP-\d{4}-[A-Z0-9]{4}$/); assert.equal(r.json.tier, 'mega'); assert.equal(r.json.host.email, 'host@example.com');
  const ref = r.json.space;
  assert.equal((await f.host('dup')('signup', 'POST', SIGNUP)).status, 409, '같은 이메일은 다시 가입 불가');
  r = await h('me'); assert.equal(r.json.spaces.length, 1); assert.equal(r.json.spaces[0].status, 'draft'); assert.equal(r.json.spaces[0].visible, false);
  // 아직 공개 전: 검색·상세에 나오지 않음
  assert.equal((await f.venues('search')).json.items.length, 0); assert.equal((await f.venues('item/' + ref)).status, 404);
  // 필수 항목이 비면 심사 요청 불가
  r = await h('spaces/' + ref + '/submit', 'POST'); assert.equal(r.status, 400); assert.equal(r.json.code, 'INCOMPLETE');
  r = await h('spaces/' + ref, 'PUT', FULL); assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.space.price_from, 150000); assert.deepEqual(r.json.space.data.facilities, ['projector', 'sound', 'mic', 'parking'], '목록에 없는 시설은 버림');
  assert.equal(r.json.space.data.contact.homepage, '', 'https 주소만 받음'); assert.equal(r.json.space.data.contact.instagram, 'https://www.instagram.com/seongsu_hall');
  assert.match(r.json.missing[0], /사진/);
  // 사진: 이미지가 아니면 거절, 3장 올리면 통과
  assert.equal((await h('spaces/' + ref + '/photos', 'POST', { body: btoa('<script>alert(1)</script>') })).status, 400);
  for (let i = 0; i < 3; i++) { r = await h('spaces/' + ref + '/photos', 'POST', { body: 'data:image/jpeg;base64,' + JPEG, thumb: JPEG, w: 1600, h: 900 }); assert.equal(r.status, 200, JSON.stringify(r.json)); }
  assert.equal(r.json.photos.length, 3);
  const first = r.json.photos[0].id, last = r.json.photos[2].id;
  r = await h('spaces/' + ref + '/photos', 'PUT', { order: [last, r.json.photos[1].id, first] }); assert.equal(r.json.photos[0].id, last, '순서 바꾸기');
  const img = await f.venues('photo/' + last); assert.equal(img.status, 200); assert.equal(img.res.headers.get('content-type'), 'image/jpeg'); assert.match(img.res.headers.get('cache-control'), /immutable/);
  // 다른 호스트는 이 공간을 볼 수도 고칠 수도 없음
  const other = f.host('b'); await other('signup', 'POST', { ...SIGNUP, email: 'other@example.com', space: { ...SPACE, name: '다른 공간' } });
  assert.equal((await other('spaces/' + ref)).status, 404); assert.equal((await other('spaces/' + ref, 'PUT', FULL)).status, 404);
  // 심사 요청 → 본사 목록 → 보완 요청 → 다시 요청 → 승인
  r = await h('spaces/' + ref + '/submit', 'POST'); assert.equal(r.json.status, 'review');
  assert.equal((await f.hq('summary')).json.review, 1);
  assert.equal((await f.hq('spaces?status=review')).json.items[0].ref, ref);
  assert.equal((await f.hq('spaces/' + ref, 'PATCH', { action: 'fix' })).status, 400, '보완 내용 없이 보완 요청 불가');
  await f.hq('spaces/' + ref, 'PATCH', { action: 'fix', note: '대표 사진을 밝은 사진으로 바꿔 주세요.' });
  r = await h('spaces/' + ref); assert.equal(r.json.space.status, 'fix'); assert.match(r.json.space.review_note, /대표 사진/);
  await h('spaces/' + ref + '/submit', 'POST');
  r = await f.hq('spaces/' + ref, 'PATCH', { action: 'approve' });
  assert.equal(r.json.item.status, 'live'); assert.equal(r.json.item.free_until, kstToday(-1) < r.json.item.free_until ? r.json.item.free_until : 'x');
  const free = r.json.item.free_until; assert.ok(free >= day(58) && free <= day(62), '승인일부터 2개월 무료: ' + free);
  // 공개: 검색(지역·인원·유형)과 상세
  r = await f.venues('search?region=seoul&people=150'); assert.equal(r.json.items.length, 1);
  const card = r.json.items[0]; assert.equal(card.name, '성수 그랜드홀'); assert.equal(card.tier, 'mega'); assert.equal(card.address, '서울 성동구 성수이로', '목록에는 상세 주소를 줄여서'); assert.match(card.cover, /\?t=1$/);
  assert.equal(r.json.by_region.seoul, 1);
  assert.equal((await f.venues('search?region=incheon')).json.items.length, 0, '공간 없는 지역');
  assert.equal((await f.venues('search?people=500')).json.items.length, 0);
  assert.equal((await f.venues('search?type=cafe')).json.items.length, 0); assert.equal((await f.venues('search?type=banquet')).json.items.length, 1); assert.equal((await f.venues('search?group=event')).json.items.length, 1);
  r = await f.venues('item/' + ref); assert.equal(r.status, 200);
  assert.equal(r.json.space.contact.phone, '010-5555-1111'); assert.equal(r.json.space.photos.length, 3); assert.equal(r.json.space.seller.company, '㈜성수홀'); assert.equal(r.json.addons.length, 6);
  assert.equal(r.json.space.payment.account, undefined, '계좌는 공개 상세에 없음');
  // 전화 비공개로 바꾸면 상세에서 빠짐
  await h('spaces/' + ref, 'PUT', { ...FULL, contact: { ...FULL.contact, phone_public: false } });
  assert.equal((await f.venues('item/' + ref)).json.space.contact.phone, '');
  // 날짜 닫기 → 그 날짜 검색에서 빠지고 요청도 막힘
  await h('spaces/' + ref + '/blocks', 'PUT', { day: day(10), on: true, note: '내부 행사' });
  assert.equal((await f.venues('search?date=' + day(10))).json.items.length, 0); assert.equal((await f.venues('search?date=' + day(11))).json.items.length, 1);
  assert.deepEqual((await f.venues('item/' + ref)).json.closed, [day(10)]);
  // 잠시 멈춤 / 본사 숨김 / 무료 기간이 끝나면 내려감
  await h('spaces/' + ref + '/pause', 'POST'); assert.equal((await f.venues('search')).json.items.length, 0); await h('spaces/' + ref + '/resume', 'POST'); assert.equal((await f.venues('search')).json.items.length, 1);
  await f.hq('spaces/' + ref, 'PATCH', { action: 'update', free_until: day(-1) });
  assert.equal((await f.venues('search')).json.items.length, 0, '무료 기간이 끝나면 목록에서 내려감'); assert.equal((await h('me')).json.spaces[0].visible, false);
  // 이용료 신청(6개월 · 계좌이체 · 부가세 별도 90만 + 9만) → 본사 입금 확인 → 다시 공개  (온라인 결제·해지 환불은 tests/hostbilling.test.mjs)
  r = await h('billing', 'POST', { space: ref, plan: 'm6', method: 'bank', tax_invoice: true }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.supply, 900000); assert.equal(r.json.amount, 990000);
  assert.equal((await h('billing', 'POST', { space: ref, plan: 'm1', method: 'bank' })).status, 409, '처리 전에는 한 건만');
  const bl = (await f.hq('billing?status=requested')).json.items[0]; assert.equal(bl.amount, 990000); assert.equal(bl.data.tax_invoice, true);
  await f.hq('billing/' + bl.ref, 'PATCH', { action: 'paid' });
  r = await h('billing'); assert.equal(r.json.items[0].status, 'paid'); assert.equal(r.json.spaces[0].plan, 'm6'); assert.ok(r.json.spaces[0].paid_until >= day(175)); assert.equal(r.json.spaces[0].visible, true);
  assert.equal((await f.venues('search')).json.items.length, 1);
  // 통계: 검색 노출이 쌓임
  r = await h('stats?days=7'); assert.ok(r.json.total.imp >= 5, '노출 수 ' + r.json.total.imp); assert.equal(r.json.series.length, 7);
});

test('예약 요청 → 본사 부가서비스 접수 → 호스트 견적 → 고객 수락 → 입금 알림 → 결제 기록·확정 → 정산 · 고객 조회', async () => {
  const f = fixture(), h = f.host('a');
  const ref = (await h('signup', 'POST', SIGNUP)).json.space; await h('spaces/' + ref, 'PUT', FULL);
  for (let i = 0; i < 3; i++) await h('spaces/' + ref + '/photos', 'POST', { body: JPEG, thumb: JPEG });
  await h('spaces/' + ref + '/submit', 'POST'); await f.hq('spaces/' + ref, 'PATCH', { action: 'approve' });
  const D = day(20), wk = new Date(D + 'T00:00:00Z').getUTCDay(), weekend = wk === 0 || wk === 6;
  const REQ = { ref, name: '박고객', phone: '010-7777-1234', email: 'guest@example.com', date: D, start: '14:00', end: '18:00', people: 120, purpose: 'conference', message: '빔프로젝터 연결 확인 부탁드립니다.',
    select: { mode: 'hourly', options: [{ i: 1, qty: 1 }] }, addons: ['buffet', 'mc', 'nope'], addon_note: '뷔페 120명, 사회자 1명', agree_privacy: true, agree_share: true };
  assert.equal((await f.venues('request', 'POST', { ...REQ, agree_share: false })).status, 400);
  assert.equal((await f.venues('request', 'POST', { ...REQ, people: 500 })).status, 400, '최대 인원 초과');
  assert.equal((await f.venues('request', 'POST', { ...REQ, date: day(-1) })).status, 400);
  // 화면 예상 금액과 접수 금액이 같은 계산
  const est = (await f.venues('estimate', 'POST', { ref, date: D, start: '14:00', end: '18:00', people: 120, select: REQ.select })).json.estimate;
  const base = (weekend ? 200000 : 150000) * 4 + 20 * 5000 + 100000; assert.equal(est.subtotal, base); assert.equal(est.total, base + Math.round(base / 10));
  let r = await f.venues('request', 'POST', REQ);
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.match(r.json.code, /^HB-\d{4}-[A-Z0-9]{4}$/); assert.deepEqual(r.json.addons, ['buffet', 'mc']);
  const code = r.json.code, k = r.json.k; assert.ok(k);
  // 호스트 센터: 새 문의
  r = await h('bookings?status=open'); assert.equal(r.json.items.length, 1); assert.equal(r.json.items[0].status, 'new'); assert.equal(r.json.items[0].amount, est.total); assert.deepEqual(r.json.items[0].addons, ['출장뷔페', '사회자·강연자 섭외']);
  r = await h('bookings/' + code); assert.equal(r.json.item.estimate.total, est.total); assert.equal(r.json.hq_addons.length, 2); assert.match(r.json.customer_url, /\/spaces\/booking\/\?code=HB-/);
  // 본사: 부가서비스 2건 접수, 호스트 예약도 보임
  r = await f.hq('addons?status=open'); assert.equal(r.json.items.length, 2); const buffet = r.json.items.find(a => a.service === 'buffet');
  assert.equal(buffet.name, '박고객'); assert.equal(buffet.people, 120); assert.equal(buffet.space_name, '성수 그랜드홀'); assert.equal(buffet.host_name, '김호스트');
  await f.hq('addons/' + buffet.ref, 'PATCH', { status: 'talking', amount: 5500000, memo: '클래식 코스 안내' });
  assert.equal((await f.hq('bookings')).json.items[0].code, code); assert.equal((await f.hq('bookings/' + code)).json.item.host.name, '김호스트');
  assert.equal((await f.hq('summary')).json.addons_new, 1);
  // 고객 조회: 링크 또는 번호 + 뒷 4자리. 결제 안내(계좌)는 아직 안 보임
  assert.equal((await f.venues('booking?code=' + code + '&k=wrong')).status, 404); assert.equal((await f.venues('booking?code=' + code + '&p=0000')).status, 404);
  r = await f.venues('booking?code=' + code + '&p=1234'); assert.equal(r.status, 200); assert.equal(r.json.booking.status, 'new'); assert.equal(r.json.booking.pay_guide, null); assert.equal(r.json.booking.payments, undefined);
  assert.equal(r.json.hq_addons.find(a => a.service === 'buffet').status, 'talking'); assert.equal(r.json.space.contact.phone, '010-5555-1111');
  // 호스트 견적 → 고객 수락 → 예약 대기(결제 안내 표시)
  assert.equal((await h('bookings/' + code, 'PATCH', { action: 'quote', lines: [] })).status, 400);
  r = await h('bookings/' + code, 'PATCH', { action: 'quote', lines: [{ label: '공간 이용료 4시간', amount: 700000 }, { label: '청소', amount: 100000 }, { label: '재방문 할인', amount: -50000 }], note: '부가세 포함 금액입니다.', valid_days: 5 });
  assert.equal(r.json.item.status, 'quoted'); assert.equal(r.json.item.amount, 750000); assert.equal(r.json.item.quote.valid_until, day(5));
  r = await f.venues('booking', 'POST', { code, k, action: 'accept' }); assert.equal(r.json.booking.status, 'pending');
  assert.equal(r.json.booking.pay_guide.account, '123-45-6789'); assert.equal(r.json.booking.pay_guide.deposit_amount, 225000, '예약금 30%');
  r = await f.venues('booking', 'POST', { code, k, action: 'paid_notice', note: '박고객 이름으로 입금' }); assert.ok(r.json.booking.paid_notice);
  assert.equal((await h('bookings')).json.items[0].paid_notice, true);
  // 호스트: 예약금 기록 + 확정, 잔금 기록
  r = await h('bookings/' + code, 'PATCH', { action: 'payment', kind: 'deposit', amount: 225000, method: 'bank', confirm: true });
  assert.equal(r.json.item.status, 'confirmed'); assert.equal(r.json.item.paid, 225000); assert.equal(r.json.item.due, 525000); assert.equal(r.json.item.paid_notice, null);
  r = await h('bookings/' + code, 'PATCH', { action: 'payment', kind: 'balance', amount: 525000, method: 'onsite' }); assert.equal(r.json.item.due, 0);
  const pid = r.json.item.payments[1].id; r = await h('bookings/' + code, 'PATCH', { action: 'payment_remove', id: pid }); assert.equal(r.json.item.paid, 225000);
  await h('bookings/' + code, 'PATCH', { action: 'message', text: '주차는 건물 지하 2층을 이용해 주세요.' });
  r = await f.venues('booking?code=' + code + '&k=' + k); assert.equal(r.json.booking.status, 'confirmed'); assert.match(r.json.booking.messages.at(-1).text, /지하 2층/); assert.equal(r.json.booking.memo, undefined);
  // 확정된 예약의 고객 취소는 '취소 요청'으로만
  r = await f.venues('booking', 'POST', { code, k, action: 'cancel', reason: '일정 변경' }); assert.equal(r.json.booking.status, 'confirmed'); assert.equal(r.json.booking.cancel_requested, true);
  // 다른 호스트는 이 예약에 접근 불가
  const other = f.host('b'); await other('signup', 'POST', { ...SIGNUP, email: 'other@example.com' }); assert.equal((await other('bookings/' + code)).status, 404); assert.equal((await other('bookings')).json.items.length, 0);
  // 전화로 받은 예약을 호스트가 직접 등록 → 정산에 함께 잡힘
  r = await h('bookings', 'POST', { space: ref, name: '전화 예약', phone: '010-1212-3434', date: D, start: '19:00', end: '22:00', people: 60, amount: 500000, memo: '카톡으로 받은 예약' });
  assert.equal(r.status, 200); const manual = r.json.code;
  r = await h('bookings/' + manual); assert.equal(r.json.item.status, 'confirmed'); assert.equal(r.json.item.source, 'host');
  r = await h('settlement?month=' + D.slice(0, 7)); assert.equal(r.json.total.count, 2); assert.equal(r.json.total.amount, 1250000); assert.equal(r.json.total.paid, 225000); assert.equal(r.json.total.due, 1025000);
  assert.equal(r.json.total.fee, 0, '메가스팟 결제 수수료 0원'); assert.equal(r.json.total.fee_if_10pct, 125000); assert.equal(r.json.by_method.bank, 225000);
  // 달력에 예약 표시, 통계에 문의 1건·확정 1건(홈페이지 경로)
  r = await h('spaces/' + ref + '/calendar?from=' + D + '&to=' + D); assert.equal(r.json.bookings.length, 2);
  r = await h('stats?days=30'); assert.equal(r.json.total.inquiry, 1); assert.equal(r.json.bookings.requests, 1); assert.equal(r.json.bookings.confirmed, 1);
  // 조회·연락 클릭 집계
  await f.venues('track', 'POST', { ref, ev: 'view' }); await f.venues('track', 'POST', { ref, ev: 'contact' }); await f.venues('track', 'POST', { ref, ev: 'bogus' });
  r = await h('stats?days=30&space=' + ref); assert.equal(r.json.total.view, 1); assert.equal(r.json.total.contact, 1);
  // 검색에서 그 날짜에 확정 예약이 있음을 표시
  assert.equal((await f.venues('search?date=' + D)).json.items[0].busy, true);
  // 이용 완료
  r = await h('bookings/' + code, 'PATCH', { action: 'done' }); assert.equal(r.json.item.status, 'done');
  // 고객이 새 요청을 스스로 취소
  const c2 = (await f.venues('request', 'POST', { ...REQ, phone: '010-8888-0000', addons: [] })).json;
  r = await f.venues('booking', 'POST', { code: c2.code, k: c2.k, action: 'cancel' }); assert.equal(r.json.booking.status, 'cancelled');
  // 호스트 차단 → 로그인 끊김
  const hostCode = (await f.hq('hosts')).json.items.find(x => x.email === 'host@example.com').code;
  await f.hq('hosts/' + hostCode, 'PATCH', { status: 'blocked' }); assert.equal((await h('me')).status, 401);
});

test('행사 지원 요청(메가스팟에 맡겨 주세요): 접수 → 조회 → 본사 제안', async () => {
  const f = fixture();
  const REQ = { name: '이담당', phone: '010-2468-1357', org: '㈜테스트', date: day(30), people: 150, budget_pp: 50000, region: 'seoul', purpose: 'workshop', needs: ['space', 'buffet', 'mc', 'bogus'], message: '연말 워크숍입니다.', agree_privacy: true };
  assert.equal((await f.planning({ ...REQ, needs: [] })).status, 400); assert.equal((await f.planning({ ...REQ, people: 0 })).status, 400); assert.equal((await f.planning({ ...REQ, agree_privacy: false })).status, 400);
  let r = await f.planning(REQ); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.match(r.json.ref, /^PL-\d{4}-[A-Z0-9]{4}$/);
  const ref = r.json.ref, k = r.json.k;
  r = await f.planningGet('ref=' + ref + '&k=' + k); assert.equal(r.json.item.status, 'new'); assert.equal(r.json.item.budget_total, 7500000); assert.deepEqual(r.json.item.needs, ['공간 찾기·예약', '출장뷔페', '사회자·강연자 섭외']); assert.equal(r.json.item.proposal, null);
  assert.equal((await f.planningGet('ref=' + ref + '&p=9999')).status, 404); assert.equal((await f.planningGet('ref=' + ref + '&p=1357')).status, 200);
  r = await f.hq('planning?status=open'); assert.equal(r.json.items.length, 1); assert.equal(r.json.items[0].phone, '010-2468-1357'); assert.match(r.json.items[0].customer_url, /\/planning\/status\/\?ref=PL-/);
  await f.hq('planning/' + ref, 'PATCH', { status: 'proposed', memo: '2호 추천', proposal: { summary: '건대 2호 + 클래식 뷔페 + 사회자 1명', amount: 7200000, link: 'http://insecure.example' } });
  r = await f.planningGet('ref=' + ref + '&k=' + k); assert.equal(r.json.item.status, 'proposed'); assert.equal(r.json.item.proposal.amount, 7200000); assert.equal(r.json.item.proposal.link, '', 'https 링크만');
  assert.equal(r.json.item.memo, undefined, '본사 메모는 고객에게 보이지 않음');
  assert.equal((await f.hq('summary')).json.planning_new, 0);
  // 관리자 로그인 없이는 본사 API 접근 불가
  const res = await hqApi({ env: f.env, params: { path: ['summary'] }, request: new Request(ORIGIN + '/api/hq/summary') }); assert.equal(res.status, 401);
});

test('입점 공간 상세: 공개 중인 공간만 검색엔진용 제목·설명·대표 사진을 채우고, 공간 sitemap 에 넣음', async () => {
  const { onRequestGet: viewPage, venueHead } = await import('../functions/spaces/view/index.js');
  const { onRequestGet: sitemap } = await import('../functions/spaces/sitemap.xml.js');
  const f = fixture(), h = f.host('a'), html = readFileSync(new URL('../spaces/view/index.html', import.meta.url), 'utf8');
  const ref = (await h('signup', 'POST', SIGNUP)).json.space; await h('spaces/' + ref, 'PUT', { ...FULL, name: '성수 <b>그랜드홀</b> "A"' });
  for (let i = 0; i < 3; i++) await h('spaces/' + ref + '/photos', 'POST', { body: JPEG, thumb: JPEG });
  const page = (id) => viewPage({ env: f.env, request: new Request(ORIGIN + '/spaces/view/' + (id ? '?id=' + id : '')), next: async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) });
  // 정적 페이지는 색인하지 않음 — 심사 전·없는 공간·잘못된 주소는 그대로
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  for (const id of ['', ref, 'SP-0000-XXXX', '../etc']) assert.equal(await (await page(id)).text(), html);
  await h('spaces/' + ref + '/submit', 'POST'); await f.hq('spaces/' + ref, 'PATCH', { action: 'approve' });
  const out = await (await page(ref.toLowerCase())).text();
  assert.match(out, /<title>성수 &lt;b&gt;그랜드홀&lt;\/b&gt; &quot;A&quot; \| 서울 · 최대 180명 · 120평 — 메가스팟<\/title>/);
  assert.match(out, /<meta name="robots" content="index,follow/); assert.ok(out.includes(`<link rel="canonical" href="https://megaspot.kr/spaces/view/?id=${ref}">`));
  assert.match(out, /<meta property="og:image" content="https:\/\/megaspot\.kr\/api\/venues\/photo\/[A-Za-z0-9_-]+">/); assert.match(out, /시간당 150,000원부터/); assert.ok(!out.includes('<b>그랜드홀</b>'), '공간 이름은 이스케이프');
  const ld = JSON.parse(out.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"EventVenue".*?)<\/script>/)[1]); assert.equal(ld.maximumAttendeeCapacity, 180); assert.equal(ld.name, '성수 <b>그랜드홀</b> "A"');
  assert.equal(venueHead('<head><title>x</title></head>', { ref, name: 'A', region: 'etc', data: '{}', types: '[]' }, '').includes('견적 문의'), false, '설명 meta 가 없는 문서는 건드리지 않음');
  // sitemap: 공개 중인 공간만
  const sm = async () => (await sitemap({ env: f.env })).text();
  assert.ok((await sm()).includes(`<loc>https://megaspot.kr/spaces/view/?id=${ref}</loc>`));
  await h('spaces/' + ref + '/pause', 'POST'); assert.ok(!(await sm()).includes(ref)); assert.equal(await (await page(ref)).text(), html, '멈춘 공간은 다시 색인 제외');
  // DB 가 없어도 정적 페이지는 그대로
  assert.equal(await (await viewPage({ env: {}, request: new Request(ORIGIN + '/spaces/view/?id=' + ref), next: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) })).text(), html);
});
