// 플랫폼 기능 점검 — 입점·공간 등록·광고 신청, 등록 공간, 모임 홍보·참가자 모집, 배너 광고 (Node 22.13+ · node:sqlite)
//   node --test tests/platform.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as adminApi } from '../functions/api/admin/[[path]].js';
import { onRequest as meetupsApi } from '../functions/api/meetups/[[path]].js';
import { onRequest as adsApi } from '../functions/api/ads/[[path]].js';
import { onRequest as listingsApi } from '../functions/api/listings/[[path]].js';
import { onRequestPost as hostPost } from '../functions/api/host.js';
import { onRequestPost as inquiryPost } from '../functions/api/inquiry.js';
import { kstToday } from '../functions/api/_lib.js';

const ORIGIN = 'https://megaspot.test';
const DAY = kstToday(20), DAY2 = kstToday(40);
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { ADMIN_KEY: 'test-only', DB: { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  let ip = 1;
  const req = (path, method = 'GET', body, headers = {}) => new Request(ORIGIN + path, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.' + (ip++ % 250), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const out = async (res) => ({ status: res.status, json: res.headers.get('content-type')?.includes('json') ? await res.json() : null, res });
  return {
    db, env,
    admin: async (path, method = 'GET', body) => out(await adminApi({ env, params: { path: path.split('?')[0].split('/') }, request: req('/api/admin/' + path, method, body, { 'x-admin-key': 'test-only', origin: ORIGIN }) })),
    meetups: async (path, method = 'GET', body) => out(await meetupsApi({ env, params: { path: path.split('?')[0].split('/') }, request: req('/api/meetups/' + path, method, body) })),
    ads: async (path, method = 'GET', body) => out(await adsApi({ env, params: { path: path.split('?')[0].split('/') }, request: req('/api/ads/' + path, method, body) })),
    listings: async (path) => out(await listingsApi({ env, params: { path: path.split('/') }, request: req('/api/listings/' + path) })),
    host: async (body) => out(await hostPost({ env, request: req('/api/host', 'POST', body) })),
    inquiry: async (body) => out(await inquiryPost({ env, request: req('/api/inquiry', 'POST', body) }))
  };
}
const MEETUP = { title: '건대 스타트업 네트워킹 나이트', category: 'networking', summary: '초기 창업자와 투자자가 편하게 만나는 저녁 모임', description: '1부 짧은 발표, 2부 자유 네트워킹으로 진행합니다.',
  date: DAY, start_time: '19:00', end_time: '22:00', venue: 'megaspot-gundae', capacity: 3, max_per: 2, host_name: '건대 창업 모임', host_phone: '010-2222-3333', host_email: 'host@example.com',
  agree_privacy: true, agree_rules: true };
const APPLY = (name, phone, extra = {}) => ({ name, phone, people: 1, agree_privacy: true, agree_share: true, ...extra });

test('입점 상담·공간 등록 신청·광고 문의가 종류별로 저장되고 관리자가 상태를 바꿀 수 있음', async () => {
  const f = fixture();
  let r = await f.host({ space_name: '성수 대형 홀', address: '서울 성동구 성수동', role: '임차·직접 운영', name: '이호스트', phone: '010-1111-2222', agree_privacy: true });
  assert.equal(r.status, 200); assert.equal(r.json.kind, 'host');
  r = await f.host({ kind: 'space', space_name: '왕십리 컨벤션', address: '서울 성동구 왕십리로 1', area: '150', capacity: '180', space_type: '대형 홀·연회장', role: '소유·직접 운영', name: '박운영', phone: '010-3333-4444', agree_privacy: true });
  assert.equal(r.status, 400, '정보 확인 동의 없으면 거절');
  r = await f.host({ kind: 'space', space_name: '왕십리 컨벤션', address: '서울 성동구 왕십리로 1', floor: '3층', region: 'seoul-east', area: '150', capacity: '180', space_type: '대형 홀·연회장', features: ['screen', 'parking'], purposes: ['seminar'],
    photos: 'https://example.com/a.jpg\njavascript:alert(1)\nhttp://plain.example.com/b.jpg', role: '소유·직접 운영', operation: 'managed', biz_name: '왕십리컨벤션', biz_no: '123-45-67890', intro: '역에서 3분, 180명까지 앉는 홀', name: '박운영', phone: '010-3333-4444', agree_privacy: true, agree_info: true });
  assert.equal(r.status, 200); const spaceRef = r.json.ref;
  r = await f.host({ kind: 'ad', company: '굿브랜드', name: '최광고', phone: '010-5555-6666', slots: ['home-mid', 'nope'], message: '12월 송년 시즌 배너 문의', agree_privacy: true });
  assert.equal(r.status, 200);
  let list = (await f.admin('partners')).json;
  assert.equal(list.items.length, 3); assert.deepEqual(list.items.map(i => i.kind).sort(), ['ad', 'host', 'space']);
  const sp = list.items.find(i => i.kind === 'space');
  assert.deepEqual(sp.data.photos, ['https://example.com/a.jpg'], 'https 사진 주소만 남김');
  assert.deepEqual(list.items.find(i => i.kind === 'ad').data.slots, ['home-mid']);
  assert.equal((await f.admin('partners?kind=ad')).json.items.length, 1);
  r = await f.admin('partners/' + spaceRef, 'PATCH', { status: '검토 중', memo: '현장 확인 11/2' }); assert.equal(r.status, 200);
  r = await f.admin('partners/' + spaceRef, 'PATCH', { status: '아무거나' }); assert.equal(r.status, 400);
  // 신청 내용으로 등록 공간 초안 만들기 → 공개 전에는 보이지 않음
  r = await f.admin('partners/' + spaceRef + '/listing', 'POST', {}); assert.equal(r.status, 200); const lid = r.json.id;
  assert.match(lid, /^L-\d{4}-[A-Z0-9]{4}$/);
  assert.equal((await f.admin('partners/' + spaceRef + '/listing', 'POST', {})).json.existed, true);
  assert.equal((await f.listings('list')).json.items.length, 0);
  assert.equal((await f.listings(lid)).status, 404);
  const sum = (await f.admin('platform/summary')).json; assert.equal(sum.partners_new, 2); assert.equal(sum.listings_published, 0);
});

test('등록 공간: 공개한 공간만 보이고, 공간 문의는 맞춤 요청으로 공간 이름과 함께 저장', async () => {
  const f = fixture();
  let r = await f.admin('listings', 'POST', { name: '성수 루프탑 홀', region: 'seoul-east', address: '서울 성동구 성수동2가', area: 120, capacity: 150, summary: '루프탑이 딸린 120평 홀', photos: ['https://example.com/x.jpg', 'ftp://bad'], host_name: '루프탑컴퍼니', host_biz: '루프탑컴퍼니 · 사업자등록번호 000-00-00000' });
  assert.equal(r.status, 200); const id = r.json.id;
  assert.equal((await f.listings('list')).json.items.length, 0, '작성 중은 비공개');
  r = await f.admin('listings/' + id, 'PATCH', { status: 'published' }); assert.equal(r.status, 200);
  const pub = (await f.listings('list')).json.items; assert.equal(pub.length, 1); assert.equal(pub[0].name, '성수 루프탑 홀'); assert.deepEqual(pub[0].photos, ['https://example.com/x.jpg']);
  assert.equal((await f.listings(id)).json.item.capacity, 150);
  r = await f.inquiry({ name: '문의자', phone: '010-7777-8888', agree_privacy: true, space_id: 'megaspot-gundae', listing: { id, name: '가짜 이름' }, headcount: 100, message: '12월 셋째 주 가능할까요' });
  assert.equal(r.status, 200);
  const it = (await f.admin('inquiries/' + r.json.ref)).json.item;
  assert.equal(it.space_id, 'request'); assert.deepEqual(it.data.listing, { id, name: '성수 루프탑 홀' }, '공간 이름은 DB 값으로');
  await f.admin('listings/' + id, 'PATCH', { status: 'hidden' });
  assert.equal((await f.listings(id)).status, 404);
  assert.equal((await f.admin('listings')).json.items[0].status, 'hidden');
});

test('모임: 등록 → 검토 중 비공개 → 승인 → 신청·대기·취소·대기자 자동 승급 → 주최자 관리', async () => {
  const f = fixture();
  let r = await f.meetups('create', 'POST', { ...MEETUP, date: '2020-01-01' }); assert.equal(r.status, 400, '지난 날짜 거절');
  r = await f.meetups('create', 'POST', { ...MEETUP, agree_rules: false }); assert.equal(r.status, 400);
  r = await f.meetups('create', 'POST', MEETUP); assert.equal(r.status, 200);
  const ref = r.json.ref, manage = new URL(r.json.manage_url), k = manage.searchParams.get('k');
  assert.match(ref, /^MO-\d{4}-[A-Z0-9]{4}$/); assert.equal(manage.pathname, '/meetups/manage/'); assert.ok(k.length >= 20);
  assert.equal((await f.meetups(ref)).status, 404, '검토 중은 비공개');
  assert.equal((await f.meetups('list')).json.items.length, 0);
  assert.equal((await f.meetups(ref + '/apply', 'POST', APPLY('김신청', '010-1000-0001'))).status, 404);
  assert.equal((await f.admin('platform/summary')).json.meetups_pending, 1);
  r = await f.admin('meetups/' + ref, 'PATCH', { status: 'open', featured: true }); assert.equal(r.status, 200);
  const pub = (await f.meetups(ref)).json.item;
  assert.equal(pub.status, 'open'); assert.equal(pub.featured, true); assert.equal(pub.venue_label, '메가스팟 건대 1호');
  const raw = JSON.stringify(pub); assert.ok(!raw.includes('010-2222-3333') && !raw.includes('host@example.com'), '주최자 연락처는 공개하지 않음');
  assert.equal((await f.meetups('list')).json.items.length, 1);
  // 신청: 정원 3명, 1인 최대 2명
  r = await f.meetups(ref + '/apply', 'POST', APPLY('김신청', '010-1000-0001', { people: 5 })); assert.equal(r.json.status, 'confirmed'); assert.equal(r.json.people, 2, '1인 최대 인원으로 맞춤');
  const a1 = r.json.ref;
  r = await f.meetups(ref + '/apply', 'POST', APPLY('김신청', '010-1000-0001')); assert.equal(r.status, 409, '같은 번호 중복 신청');
  r = await f.meetups(ref + '/apply', 'POST', APPLY('이참가', '010-1000-0002', { agree_share: false })); assert.equal(r.status, 400, '주최자 제공 동의 필요');
  r = await f.meetups(ref + '/apply', 'POST', APPLY('이참가', '010-1000-0002')); assert.equal(r.json.status, 'confirmed'); const a2 = r.json.ref;
  r = await f.meetups(ref + '/apply', 'POST', APPLY('박대기', '010-1000-0003')); assert.equal(r.json.status, 'waitlist'); assert.equal(r.json.wait_no, 1); const a3 = r.json.ref;
  r = await f.meetups(ref + '/apply', 'POST', APPLY('정대기', '010-1000-0004', { people: 2 })); assert.equal(r.json.status, 'waitlist'); assert.equal(r.json.wait_no, 2); const a4 = r.json.ref;
  let item = (await f.meetups(ref)).json.item; assert.equal(item.seats, 3); assert.equal(item.waiting, 3);
  // 신청 확인 — 뒷자리가 틀리면 못 봄, 이름은 가려서
  assert.equal((await f.meetups(ref + '/lookup', 'POST', { app_ref: a3, phone_last4: '9999' })).status, 404);
  r = await f.meetups(ref + '/lookup', 'POST', { app_ref: a3, phone_last4: '0003' }); assert.equal(r.json.app.status, 'waitlist'); assert.equal(r.json.app.name, '박*기'); assert.equal(r.json.app.wait_no, 1);
  // 확정자 1명(1자리) 취소 → 대기 1번(1명) 승급, 대기 2번(2명)은 자리가 모자라 그대로
  r = await f.meetups(ref + '/cancel', 'POST', { app_ref: a2, phone_last4: '0002' }); assert.equal(r.json.app.status, 'cancelled');
  assert.equal((await f.meetups(ref + '/lookup', 'POST', { app_ref: a3, phone_last4: '0003' })).json.app.status, 'confirmed');
  assert.equal((await f.meetups(ref + '/lookup', 'POST', { app_ref: a4, phone_last4: '0004' })).json.app.wait_no, 1);
  assert.equal((await f.meetups(ref + '/cancel', 'POST', { app_ref: a2, phone_last4: '0002' })).status, 409, '이미 취소');
  // 주최자 관리: 잘못된 키는 거절, 맞는 키는 연락처까지 보임
  assert.equal((await f.meetups(ref + '/manage?k=wrong')).status, 403);
  r = await f.meetups(ref + '/manage?k=' + k); assert.equal(r.status, 200);
  assert.equal(r.json.apps.length, 4); assert.equal(r.json.apps.find(a => a.ref === a1).phone, '010-1000-0001'); assert.equal(r.json.meetup.host_phone, '010-2222-3333');
  // 정원을 늘리면 대기자가 올라감
  r = await f.meetups(ref + '/manage?k=' + k, 'POST', { action: 'update', capacity: 5, notice: '입장 시 명찰을 받아 가세요.' }); assert.equal(r.status, 200);
  assert.equal(r.json.apps.find(a => a.ref === a4).status, 'confirmed'); assert.equal(r.json.meetup.notice, '입장 시 명찰을 받아 가세요.');
  // 신청 상태 직접 변경 · 모집 마감 → 신청 막힘 → 다시 열기
  r = await f.meetups(ref + '/manage?k=' + k, 'POST', { action: 'app', app: a1, status: 'rejected' }); assert.equal(r.json.apps.find(a => a.ref === a1).status, 'rejected');
  r = await f.meetups(ref + '/manage?k=' + k, 'POST', { action: 'status', status: 'closed' }); assert.equal(r.json.meetup.status, 'closed');
  assert.equal((await f.meetups(ref + '/apply', 'POST', APPLY('늦은사람', '010-1000-0009'))).json.code, 'CLOSED');
  r = await f.meetups(ref + '/manage?k=' + k, 'POST', { action: 'status', status: 'open' }); assert.equal(r.json.meetup.status, 'open');
  // 다른 모임의 키로는 열 수 없음
  const other = (await f.meetups('create', 'POST', { ...MEETUP, title: '두 번째 모임', date: DAY2 })).json;
  assert.equal((await f.meetups(other.ref + '/manage?k=' + k)).status, 403);
  // 관리자 상세: 관리 링크·신청자 명단
  const ad = (await f.admin('meetups/' + ref)).json;
  assert.equal(ad.apps.length, 5 - 1); assert.ok(ad.item.manage_url.includes(k)); assert.equal(ad.item.host_phone, '010-2222-3333');
  // 주최자 취소 → 공개 화면에 '모임 취소', 신청 불가
  await f.meetups(ref + '/manage?k=' + k, 'POST', { action: 'status', status: 'cancelled' });
  assert.equal((await f.meetups(ref)).json.item.status, 'cancelled');
  assert.equal((await f.meetups(ref + '/apply', 'POST', APPLY('취소후', '010-1000-0010'))).json.code, 'CANCELLED');
  assert.equal((await f.meetups('list')).json.items.length, 0, '취소된 모임은 목록에 없음');
});

test('모임: 승인제·대기 안 받기·예약번호 확인 표시·반려', async () => {
  const f = fixture();
  // 메가스팟 확정 예약 만들기 (2호, DAY)
  const bk = await f.admin('bookings', 'POST', { space_id: 'megaspot-gundae-2', customer_name: '주최자', phone: '010-4444-5555', date: DAY, start_h: 18, end_h: 23, headcount: 200, amount: 2000000 });
  const code = bk.json.booking_code;
  let r = await f.meetups('create', 'POST', { ...MEETUP, venue: 'tbd', booking_code: code, booking_last4: '0000' }); assert.equal(r.json.code, 'BOOKING_NOT_FOUND');
  r = await f.meetups('create', 'POST', { ...MEETUP, venue: 'tbd', date: DAY2, booking_code: code, booking_last4: '5555' }); assert.equal(r.json.code, 'BOOKING_DATE');
  r = await f.meetups('create', 'POST', { ...MEETUP, venue: 'tbd', booking_code: code, booking_last4: '5555', mode: 'approve', waitlist: false, capacity: 2, max_per: 1, question: '어떤 일을 하시나요?' });
  assert.equal(r.status, 200); assert.equal(r.json.verified, true); const ref = r.json.ref;
  await f.admin('meetups/' + ref, 'PATCH', { status: 'open' });
  const pub = (await f.meetups(ref)).json.item; assert.equal(pub.verified, true); assert.equal(pub.venue, 'megaspot-gundae-2', '예약 공간으로 장소가 맞춰짐');
  assert.ok(!JSON.stringify(pub).includes(code), '예약번호는 공개하지 않음');
  r = await f.meetups(ref + '/apply', 'POST', APPLY('가', '010-2000-0001')); assert.equal(r.status, 400, '질문 답변 필요');
  r = await f.meetups(ref + '/apply', 'POST', APPLY('가', '010-2000-0001', { answer: '디자이너' })); assert.equal(r.json.status, 'pending');
  r = await f.meetups(ref + '/apply', 'POST', APPLY('나', '010-2000-0002', { answer: '개발자' })); assert.equal(r.json.status, 'pending');
  r = await f.meetups(ref + '/apply', 'POST', APPLY('다', '010-2000-0003', { answer: '기획자' })); assert.equal(r.status, 409); assert.equal(r.json.code, 'FULL');
  // 반려된 모임은 공개되지 않음
  const r2 = await f.meetups('create', 'POST', { ...MEETUP, title: '반려될 모임' });
  await f.admin('meetups/' + r2.json.ref, 'PATCH', { status: 'rejected', reject_reason: '모임 내용이 운영 기준에 맞지 않습니다.' });
  assert.equal((await f.meetups(r2.json.ref)).status, 404);
  const k2 = new URL(r2.json.manage_url).searchParams.get('k');
  const mg = (await f.meetups(r2.json.ref + '/manage?k=' + k2)).json; assert.equal(mg.meetup.raw_status, 'rejected'); assert.match(mg.meetup.reject_reason, /운영 기준/);
  // 관리자 내용 수정
  r = await f.admin('meetups/' + ref, 'PATCH', { edit: { title: '수정한 모임 이름', capacity: 3 } }); assert.equal(r.status, 200);
  assert.equal((await f.meetups(ref)).json.item.title, '수정한 모임 이름');
  assert.equal((await f.admin('meetups?status=open')).json.items.length, 1);
});

test('배너 광고: 게재 중·기간 안의 광고만 나가고, 클릭은 저장한 주소로 이동하며 횟수를 셈', async () => {
  const f = fixture();
  let r = await f.admin('ads', 'POST', { slot: 'home-mid', title: '나쁜 링크', advertiser: 'X', link: 'javascript:alert(1)', status: 'on' }); assert.equal(r.status, 400);
  r = await f.admin('ads', 'POST', { slot: 'home-mid', title: '광고주 없음', link: 'https://example.com', status: 'on' }); assert.equal(r.status, 400, '유료 광고는 광고주 이름 필수');
  r = await f.admin('ads', 'POST', { slot: 'home-mid', title: '연말 케이터링 할인', advertiser: '굿케이터링', link: 'https://example.com/promo', sub: '20인 이상 10% 할인', cta: '자세히', status: 'on', priority: 5, memo: '계약 11월분' });
  assert.equal(r.status, 200); const id = r.json.id; assert.ok(id > 0);
  await f.admin('ads', 'POST', { slot: 'home-mid', title: '꺼 둔 광고', advertiser: 'Y', link: 'https://example.com/y', status: 'off' });
  await f.admin('ads', 'POST', { slot: 'list-top', title: '지난 광고', advertiser: 'Z', link: 'https://example.com/z', status: 'on', start_date: '2020-01-01', end_date: '2020-01-31' });
  await f.admin('ads', 'POST', { slot: 'list-top', kind: 'house', title: '건대 2호 사전 예약', link: '/spaces/megaspot-gundae-2/', status: 'on' });
  r = await f.ads('list?slots=home-mid,list-top,evil');
  const items = r.json.items; assert.equal(items.length, 2);
  const promo = items.find(i => i.slot === 'home-mid');
  assert.equal(promo.title, '연말 케이터링 할인'); assert.equal(promo.kind, 'paid'); assert.equal(promo.href, '/api/ads/go/' + id);
  assert.ok(!('memo' in promo) && !JSON.stringify(promo).includes('계약') && !('link' in promo), '메모·원래 주소는 내보내지 않음');
  assert.equal(items.find(i => i.slot === 'list-top').kind, 'house');
  // 노출·클릭
  await f.ads('imp', 'POST', { ids: [id, id, 'x', -1] });
  r = await f.ads('go/' + id); assert.equal(r.status, 302); assert.equal(r.res.headers.get('location'), 'https://example.com/promo');
  const house = items.find(i => i.slot === 'list-top');
  r = await f.ads('go/' + house.id); assert.equal(r.res.headers.get('location'), ORIGIN + '/spaces/megaspot-gundae-2/');
  r = await f.ads('go/99999'); assert.equal(r.res.headers.get('location'), ORIGIN + '/');
  const row = (await f.admin('ads')).json.items.find(a => a.id === id); assert.equal(row.imps, 1); assert.equal(row.clicks, 1);
  // 끄면 바로 빠지고, 끈 광고 주소로는 이동하지 않음
  await f.admin('ads/' + id, 'PATCH', { status: 'off' });
  assert.equal((await f.ads('list?slots=home-mid')).json.items.length, 0);
  assert.equal((await f.ads('go/' + id)).res.headers.get('location'), ORIGIN + '/');
  r = await f.admin('ads/' + id, 'PUT', { slot: 'content-bottom', title: '수정', advertiser: '굿케이터링', link: 'https://example.com/new', status: 'on' }); assert.equal(r.status, 200);
  assert.equal((await f.ads('list?slots=content-bottom')).json.items[0].title, '수정');
  assert.equal((await f.admin('ads/' + id, 'DELETE')).status, 200);
  const dash = (await f.admin('dashboard')).json; assert.equal(dash.platform.ads_on, 1);
});
