// 호스트센터 통합 관리·홈 화면 앱 점검 (2026-11-13)
//  · 다른 플랫폼·전화 예약 등록(접수 경로·수수료·받은 금액) · 시간 겹침 경고 · 고객 관리 · 여러 공간 일정 · 휴대폰 캘린더 구독
//  · 심사 전 빠진 항목 한꺼번에 · 공개 전 공간 미리보기 · 로그인 기간 연장 · 홈 화면 앱 파일(manifest·sw·아이콘)
//   node --test tests/hostcenter-app.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { onRequest as hostsApi } from '../functions/api/hosts/[[path]].js';
import { onRequest as venuesApi } from '../functions/api/venues/[[path]].js';
import { onRequest as hqApi } from '../functions/api/hq/[[path]].js';
import { foldLine } from '../functions/api/_hostcrm.js';
import { kstToday } from '../functions/api/_lib.js';

const ORIGIN = 'https://megaspot.test';
const day = n => kstToday(n);
const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql'));
  const env = { ADMIN_KEY: 'test-only', DB: { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  let ip = 1; const jar = {};
  const call = async (api, base, path, method = 'GET', body, cookie) => {
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + base + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.7.0.' + (ip++ % 250), ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, json: ct.includes('json') ? await res.json() : null, text: ct.includes('json') ? '' : await res.text(), res };
  };
  const host = name => async (path, method = 'GET', body) => {
    const r = await call(hostsApi, '/api/hosts/', path, method, body, jar[name]);
    const set = r.res.headers.getSetCookie ? r.res.headers.getSetCookie() : []; const c = set.map(x => x.split(';')[0]).filter(x => x.startsWith('ms_host=') && x.length > 8); if (c.length) jar[name] = c[0];
    return r;
  };
  return { db, env, host, jar, call, venues: (path, method, body, who) => call(venuesApi, '/api/venues/', path, method, body, who ? jar[who] : undefined), hq: (path, method, body) => call(hqApi, '/api/hq/', path, method, body, undefined).then(r => r) };
}
const SPACE = { name: '성수 그랜드홀', region: 'seoul', address: '서울 성동구 성수이로 100', capacity: 180, area: 120, types: ['conference', 'banquet'] };
const FULL = { ...SPACE, intro: '성수역에서 걸어서 3분, 층고 5m의 단독 홀입니다. 컨퍼런스와 연회 모두 가능합니다.', price: { modes: ['hourly'], vat: 'included', hourly: { weekday: 150000, weekend: 200000, min_hours: 2 } }, biz: { type: 'corp', name: '㈜성수홀', no: '123-45-67890' } };
const SIGNUP = { email: 'host@example.com', password: 'host-pass-1234', name: '김호스트', phone: '010-5555-1111', company: '성수홀', agree_terms: true, agree_privacy: true, space: SPACE };
async function liveHost(f, who = 'a', email = 'host@example.com') {
  const h = f.host(who); const r = await h('signup', 'POST', { ...SIGNUP, email }); const ref = r.json.space;
  await h('spaces/' + ref, 'PUT', FULL);
  for (let i = 0; i < 3; i++) await h('spaces/' + ref + '/photos', 'POST', { body: 'data:image/jpeg;base64,' + JPEG, thumb: JPEG, w: 1600, h: 900 });
  return { h, ref };
}
async function approve(f, ref) {
  const r = await hqApi({ env: f.env, params: { path: ['spaces', ref] }, request: new Request(ORIGIN + '/api/hq/spaces/' + ref, { method: 'PATCH', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-admin-key': 'test-only' }, body: JSON.stringify({ action: 'approve' }) }) });
  assert.equal(r.status, 200);
}

test('심사 전에 빠진 항목을 한꺼번에 알려 준다', async () => {
  const f = fixture(), h = f.host('a'); const r = await h('signup', 'POST', { ...SIGNUP, space: { name: '작성 중', region: 'seoul', area: 80, types: ['hall'] } });
  const m = (await h('spaces/' + r.json.space)).json.missing;
  for (const re of [/주소/, /최대 이용 인원/, /요금 방식/, /공간 소개/, /사진/]) assert.ok(m.some(x => re.test(x)), '빠진 항목: ' + re + ' · ' + m.join(' | '));
  assert.equal((await h('spaces/' + r.json.space + '/submit', 'POST')).json.code, 'INCOMPLETE');
});

test('다른 플랫폼·전화 예약 등록: 접수 경로, 플랫폼 수수료, 받은 금액, 연락처 없는 플랫폼 예약', async () => {
  const f = fixture(), { h, ref } = await liveHost(f), D = day(20);
  // 다른 플랫폼 예약은 고객 번호를 몰라도 넣을 수 있음
  let r = await h('bookings', 'POST', { space: ref, channel: 'platform', channel_name: '다른앱', ext_ref: 'X-123', ext_fee: 45000, name: '플랫폼 고객', date: D, start: '10:00', end: '14:00', people: 80, amount: 450000, paid_amount: 450000 });
  assert.equal(r.status, 200, JSON.stringify(r.json)); const code = r.json.code;
  r = await h('bookings/' + code); const b = r.json.item;
  assert.equal(b.channel, 'platform'); assert.equal(b.channel_label, '다른앱'); assert.equal(b.ext_ref, 'X-123'); assert.equal(b.ext_fee, 45000); assert.equal(b.phone, '');
  assert.equal(b.paid, 450000); assert.equal(b.due, 0); assert.equal(b.payments[0].method, 'platform'); assert.equal(b.payments[0].kind, 'full'); assert.equal(b.status, 'confirmed');
  // 연락처는 적었다면 형식이 맞아야 함 (비우는 것은 화면에서 다른 플랫폼일 때만 허용)
  assert.equal((await h('bookings', 'POST', { space: ref, channel: 'phone', name: '전화 고객', phone: '12', date: day(21) })).status, 400);
  r = await h('bookings', 'POST', { space: ref, channel: 'kakao', name: '카톡 고객', phone: '010-3333-4444', date: day(22), start: '18:00', end: '22:00', amount: 600000, paid_amount: 200000, paid_method: 'bank', status: 'confirmed' });
  assert.equal(r.status, 200);
  r = await h('bookings/' + r.json.code); assert.equal(r.json.item.channel_label, '카카오톡'); assert.equal(r.json.item.due, 400000); assert.equal(r.json.item.payments[0].kind, 'deposit');
  // 목록: 접수 경로 칩과 거르기
  r = await h('bookings?status=open'); assert.deepEqual(r.json.channels.map(c => c.key).sort(), ['kakao', 'platform:다른앱']);
  assert.equal((await h('bookings?channel=' + encodeURIComponent('platform:다른앱'))).json.items.length, 1);
  assert.equal((await h('bookings?channel=kakao')).json.items[0].name, '카톡 고객');
  assert.equal((await h('bookings?channel=bogus')).status, 400);
  // 플랫폼 이름은 다음 등록 때 고르기 목록으로
  assert.deepEqual((await h('me')).json.channel_names, ['다른앱']);
  // 정산: 접수 경로별, 다른 플랫폼 수수료와 남는 금액
  const s = (await h('settlement?month=' + D.slice(0, 7))).json;
  if (day(22).slice(0, 7) === D.slice(0, 7)) { assert.equal(s.total.ext_fee, 45000); assert.equal(s.total.net, s.total.amount - 45000); assert.ok(s.by_channel.some(c => c.label === '다른앱' && c.fee === 45000)); }
  // 직접 넣은 예약은 접수 경로를 고칠 수 있음 · 연락처를 비울 수 있음
  r = await h('bookings/' + code, 'PATCH', { action: 'edit', channel: 'etc', channel_name: '지인 소개', ext_fee: '' }); assert.equal(r.status, 200);
  assert.equal(r.json.item.channel_label, '지인 소개'); assert.equal(r.json.item.ext_fee, null);
  // 연락처 없는 예약은 휴대폰 뒷자리 조회로 열리지 않음
  assert.equal((await f.venues('booking?code=' + code + '&p=')).status, 404);
});

test('같은 공간·같은 시간 예약은 경고하고, 호스트가 확인하면 진행 (밤샘·닫은 날 포함)', async () => {
  const f = fixture(), { h, ref } = await liveHost(f), D = day(15), N = day(16);
  let r = await h('bookings', 'POST', { space: ref, channel: 'phone', name: '첫 예약', phone: '010-1111-2222', date: D, start: '18:00', end: '22:00', amount: 500000 });
  assert.equal(r.status, 200);
  r = await h('bookings', 'POST', { space: ref, channel: 'phone', name: '겹치는 예약', phone: '010-2222-3333', date: D, start: '21:00', end: '23:00' });
  assert.equal(r.status, 409); assert.equal(r.json.code, 'OVERLAP'); assert.equal(r.json.conflicts[0].name, '첫 예약'); assert.match(r.json.error, /첫 예약 18:00~22:00/);
  // 시간이 안 겹치면 그대로
  assert.equal((await h('bookings', 'POST', { space: ref, channel: 'phone', name: '오전 예약', phone: '010-2222-3333', date: D, start: '09:00', end: '12:00' })).status, 200);
  // 확인 후 그대로 등록
  r = await h('bookings', 'POST', { space: ref, channel: 'phone', name: '겹치는 예약', phone: '010-2222-3333', date: D, start: '21:00', end: '23:00', force: true }); assert.equal(r.status, 200);
  // 밤샘 예약(22시~다음 날 2시)은 다음 날 새벽과 겹침
  r = await h('bookings', 'POST', { space: ref, channel: 'kakao', name: '올나잇', phone: '010-4444-5555', date: N, start: '22:00', end: '02:00', force: true }); assert.equal(r.status, 200);
  r = await h('bookings', 'POST', { space: ref, channel: 'kakao', name: '새벽 촬영', phone: '010-4444-6666', date: day(17), start: '01:00', end: '03:00' });
  assert.equal(r.status, 409); assert.equal(r.json.conflicts[0].name, '올나잇');
  // 닫은 날
  await h('spaces/' + ref + '/blocks', 'PUT', { day: day(18), on: true });
  r = await h('bookings', 'POST', { space: ref, channel: 'phone', name: '닫은 날', phone: '010-1234-1234', date: day(18) }); assert.equal(r.status, 409); assert.equal(r.json.closed, true);
  // 메가스팟 요청을 승인할 때도 겹침 확인 → 확인하면 진행
  await approve(f, ref);
  r = await f.venues('request', 'POST', { ref, name: '박고객', phone: '010-7777-1234', date: D, start: '19:00', end: '21:00', people: 100, agree_privacy: true, agree_share: true });
  assert.equal(r.status, 200, JSON.stringify(r.json)); const web = r.json.code;
  r = await h('bookings/' + web, 'PATCH', { action: 'approve', amount: 300000 }); assert.equal(r.status, 409); assert.equal(r.json.code, 'OVERLAP');
  assert.equal((await h('bookings/' + web)).json.item.status, 'new', '경고만 하고 바꾸지 않음');
  r = await h('bookings/' + web, 'PATCH', { action: 'approve', amount: 300000, force: true }); assert.equal(r.status, 200); assert.equal(r.json.item.status, 'pending');
  // 시간을 안 바꾸는 수정(메모 등)은 경고하지 않음
  assert.equal((await h('bookings/' + web, 'PATCH', { action: 'edit', people: 90 })).status, 200);
  // 일정: 여러 공간·겹침 표시·닫은 날
  const sc = (await h('schedule?from=' + D + '&to=' + day(18))).json;
  const clash = sc.items.filter(b => b.conflict).map(b => b.name).sort(); assert.deepEqual(clash, ['겹치는 예약', '박고객', '첫 예약']);
  assert.equal(sc.blocks[0].day, day(18)); assert.ok(sc.items.every(b => b.space_name === '성수 그랜드홀'));
  assert.equal((await h('schedule?space=SP-0000-NONE')).status, 404);
});

test('고객 관리: 연락처로 묶고, 메모·표시를 남기고, 다른 호스트는 볼 수 없음', async () => {
  const f = fixture(), { h, ref } = await liveHost(f);
  await h('bookings', 'POST', { space: ref, channel: 'phone', name: '이단골', phone: '010-9999-0000', org: '㈜단골', date: day(-40), start: '10:00', end: '12:00', amount: 300000, status: 'done', force: true });
  await h('bookings', 'POST', { space: ref, channel: 'kakao', name: '이단골', phone: '01099990000', date: day(30), start: '10:00', end: '12:00', amount: 400000, status: 'confirmed' });
  await h('bookings', 'POST', { space: ref, channel: 'platform', channel_name: '다른앱', name: '번호 없음', date: day(31) });
  let r = await h('customers'); assert.equal(r.json.total, 1, '연락처 없는 예약은 고객으로 묶지 않음'); assert.equal(r.json.repeat, 1);
  const c = r.json.items[0]; assert.equal(c.key, '01099990000'); assert.equal(c.bookings, 2); assert.equal(c.used, 2); assert.equal(c.total, 700000); assert.equal(c.org, '㈜단골');
  assert.equal(c.next_date, day(30)); assert.equal(c.last_date, day(-40)); assert.deepEqual(c.channels.sort(), ['전화', '카카오톡'].sort());
  // 예약 목록에도 다시 찾은 고객 표시
  assert.ok((await h('bookings?status=open')).json.items.some(b => b.visits === 2));
  r = await h('customers/01099990000', 'PUT', { memo: '매년 12월 송년회', tags: ['regular', 'corp', 'bogus'] }); assert.deepEqual(r.json.tags, ['regular', 'corp']);
  r = await h('customers/01099990000'); assert.equal(r.json.customer.memo, '매년 12월 송년회'); assert.equal(r.json.customer.history.length, 2);
  assert.equal((await h('customers?tag=regular')).json.items.length, 1); assert.equal((await h('customers?tag=caution')).json.items.length, 0);
  assert.equal((await h('customers?q=송년회')).json.items.length, 1, '메모로도 찾음'); assert.equal((await h('customers?q=9999')).json.items.length, 1);
  assert.equal((await h('customers/01011112222', 'PUT', { memo: 'x' })).status, 404, '예약이 없는 번호');
  assert.equal((await h('customers/abc')).status, 404);
  const other = f.host('b'); await other('signup', 'POST', { ...SIGNUP, email: 'other@example.com' });
  assert.equal((await other('customers/01099990000')).status, 404); assert.equal((await other('customers')).json.total, 0);
});

test('휴대폰 캘린더 구독: 토큰 주소로만 열리고, 연락처는 넣지 않으며, 새 주소를 만들면 예전 주소는 끊김', async () => {
  const f = fixture(), { h, ref } = await liveHost(f);
  await h('bookings', 'POST', { space: ref, channel: 'phone', name: '홍길동, 세미나; 팀', phone: '010-8888-7777', date: day(5), start: '22:00', end: '01:00', people: 120, amount: 1000000 });
  assert.equal((await h('bookings', 'POST', { space: ref, channel: 'phone', name: '시간 미정', phone: '010-8888-6666', date: day(6), status: 'pending' })).status, 409, '전날 밤샘 예약과 겹침');
  await h('bookings', 'POST', { space: ref, channel: 'phone', name: '시간 미정', phone: '010-8888-6666', date: day(6), status: 'pending', force: true });
  await h('spaces/' + ref + '/blocks', 'PUT', { day: day(7), on: true, note: '내부 공사' });
  let r = await h('ical'); assert.equal(r.status, 200); const url1 = r.json.url; assert.match(url1, /^https:\/\/megaspot\.test\/api\/hosts\/ical\/[A-Za-z0-9_-]{32}\.ics$/); assert.match(r.json.webcal, /^webcal:\/\//);
  assert.equal((await h('ical')).json.url, url1, '다시 열어도 같은 주소');
  const feed = await f.call(hostsApi, '/api/hosts/', url1.split('/api/hosts/')[1]);
  assert.equal(feed.status, 200); assert.match(feed.res.headers.get('content-type'), /text\/calendar/);
  const ics = feed.text; assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(!ics.includes('8888'), '고객 연락처는 넣지 않음');
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /SUMMARY:\[예약 확정\] 홍길동\\, 세미나\\; 팀 120명 · 성수 그랜드홀/);
  assert.match(unfolded, new RegExp('DTSTART;TZID=Asia/Seoul:' + day(5).replace(/-/g, '') + 'T220000')); assert.match(unfolded, new RegExp('DTEND;TZID=Asia/Seoul:' + day(6).replace(/-/g, '') + 'T010000'), '밤샘 예약은 다음 날 끝남');
  assert.match(unfolded, new RegExp('DTSTART;VALUE=DATE:' + day(6).replace(/-/g, ''))); assert.match(unfolded, /STATUS:TENTATIVE/); assert.match(unfolded, /\[예약 안 받음\] 성수 그랜드홀 · 내부 공사/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, '한 줄 75바이트 이하: ' + line);
  r = await h('ical', 'POST', { reset: true }); assert.notEqual(r.json.url, url1);
  assert.equal((await f.call(hostsApi, '/api/hosts/', url1.split('/api/hosts/')[1])).status, 404, '예전 주소는 끊김');
  assert.equal((await f.call(hostsApi, '/api/hosts/', r.json.url.split('/api/hosts/')[1])).status, 200);
  assert.equal((await f.call(hostsApi, '/api/hosts/', 'ical/short.ics')).status, 404);
  // 접어 쓰기는 한글을 자르지 않음
  const long = 'DESCRIPTION:' + '가나다라마바사아자차'.repeat(12);
  const folded = foldLine(long); assert.equal(folded.replace(/\r\n /g, ''), long); assert.ok(folded.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
});

test('공개 전 공간은 그 호스트에게만 미리보기로 열리고, 예약 요청은 받지 않음', async () => {
  const f = fixture(), h = f.host('a'); const r = await h('signup', 'POST', SIGNUP), ref = r.json.space; await h('spaces/' + ref, 'PUT', FULL);
  assert.equal((await f.venues('item/' + ref)).status, 404, '로그인하지 않은 사람');
  const p = await f.venues('item/' + ref, 'GET', undefined, 'a'); assert.equal(p.status, 200); assert.equal(p.json.preview, true); assert.equal(p.json.space.name, '성수 그랜드홀');
  assert.equal((await f.venues('estimate', 'POST', { ref, mode: 'hourly', date: day(10), start: '10:00', end: '14:00', people: 50 }, 'a')).status, 200);
  assert.equal((await f.venues('request', 'POST', { ref, name: '고객', phone: '010-1111-1111', agree_privacy: true, agree_share: true }, 'a')).status, 404, '미리보기는 요청을 받지 않음');
  const other = f.host('b'); await other('signup', 'POST', { ...SIGNUP, email: 'b@example.com' });
  assert.equal((await f.venues('item/' + ref, 'GET', undefined, 'b')).status, 404, '다른 호스트');
  // 공개된 뒤에는 미리보기 표시 없이 누구에게나
  for (let i = 0; i < 3; i++) await h('spaces/' + ref + '/photos', 'POST', { body: 'data:image/jpeg;base64,' + JPEG, thumb: JPEG });
  await approve(f, ref); const pub = await f.venues('item/' + ref); assert.equal(pub.status, 200); assert.equal(pub.json.preview, false);
});

test('홈 화면 앱처럼 쓰는 동안 로그인 기간을 이어 줌', async () => {
  const f = fixture(), h = f.host('a'); await h('signup', 'POST', SIGNUP);
  f.db.exec("UPDATE host_sessions SET expires_at = datetime('now', '+5 days')");
  const r = await h('me'); assert.equal(r.status, 200); assert.ok((r.res.headers.getSetCookie() || []).some(c => /^ms_host=.+Max-Age=2592000/.test(c)), '쿠키 다시 내려줌');
  const exp = f.db.prepare('SELECT expires_at FROM host_sessions').get().expires_at; assert.ok(exp > new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 19).replace('T', ' '));
  // 새로 로그인한 직후에는 다시 내려주지 않음
  assert.equal(((await h('me')).res.headers.getSetCookie() || []).length, 0);
});

test('홈 화면 앱 파일: manifest · 서비스 워커 · 아이콘 · 호스트센터 화면', () => {
  const m = JSON.parse(read('host/manifest.webmanifest'));
  assert.equal(m.scope, '/host/'); assert.ok(m.start_url.startsWith('/host/center/')); assert.equal(m.display, 'standalone'); assert.equal(m.lang, 'ko');
  for (const s of m.shortcuts) assert.ok(s.url.startsWith(m.scope), s.url);
  const png = p => { const b = readFileSync(new URL('..' + p, import.meta.url)); assert.equal(b.toString('hex', 0, 8), '89504e470d0a1a0a', p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const i of m.icons) { const [w, hh] = png(i.src); assert.equal(w + 'x' + hh, i.sizes, i.src); }
  assert.ok(m.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512') && m.icons.some(i => i.purpose === 'any' && i.sizes === '192x192'));
  assert.deepEqual(png('/assets/img/brand/host-app-touch-180.png'), [180, 180]);
  const sw = read('host/sw.js'); assert.match(sw, /r\.mode!=='navigate'/); assert.ok(!/\/api\//.test(sw.replace(/\/\*[\s\S]*?\*\//, '')), '서비스 워커는 /api/ 를 저장하지 않음');
  assert.ok(existsSync(new URL('../host/offline.html', import.meta.url)));
  const hdr = read('_headers'); assert.match(hdr, /\/host\/sw\.js\n  Cache-Control: no-cache/); assert.match(hdr, /\/host\/manifest\.webmanifest\n  Content-Type: application\/manifest\+json/);
  const page = read('host/center/index.html');
  for (const s of ['<link rel="manifest" href="/host/manifest.webmanifest">', 'apple-mobile-web-app-capable', 'host-app-touch-180.png', 'viewport-fit=cover', 'id="hc-tabbar"', 'data-tab="customers"', 'id="hc-fab"', 'data-kakao', '/assets/css/host-app.css?v=']) assert.ok(page.includes(s), s);
  assert.ok(read('host/login/index.html').includes('/host/manifest.webmanifest'));
  const js = read('assets/js/pages/host-center.js'); for (const s of ['VIEWS.customers', 'beforeinstallprompt', "register('/host/sw.js'", 'kakaotalk://web/openExternal', 'setAppBadge', 'data-tpl', "code==='OVERLAP'"]) assert.ok(js.includes(s), s);
});
