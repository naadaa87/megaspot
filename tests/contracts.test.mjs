// 공간대관 계약서 점검 (2026-11-24)
//  · 예약·문의에서 대관자·이용일·시간·금액을 불러오고, 예약 1건에 진행 중인 계약서는 1장
//  · 링크 열쇠가 맞아야 열리고, '링크 다시 만들기' 뒤에는 예전 링크가 막힌다
//  · 대관자 서명: 동의·서명 그림·필수 정보 확인, 서명 기록(시각·IP·확인값), 서명 뒤 잠김, 취소된 예약은 서명 불가
//  · 계약서 링크로 모임 초대장 만들기(확정 예약만), 관리자 카카오톡 발송은 등록된 번호로만
//   node --test tests/contracts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as api } from '../functions/api/contracts/[[path]].js';
import { kstToday } from '../functions/api/_lib.js';
import { CONTRACT_TEMPLATE, cleanContract, purgeContracts } from '../functions/api/_contracts.js';
import { templateVars, renderTemplate } from '../functions/api/_custom_alimtalk.js';
import CD from '../assets/js/kit/contract-doc.js';

const ORIGIN = 'https://megaspot.test';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const day = n => kstToday(n);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ALIGO = { ALIGO_API_KEY: 'k', ALIGO_USERID: 'u', ALIGO_SENDER_KEY: 'sender-profile', ALIGO_SENDER: '0212345678', ALIGO_LIVE_ENABLED: 'true' };
function fixture(t, extra = {}) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const env = { ADMIN_KEY: 'test-only', CONFIRM_SECRET: 'confirm-secret-for-tests-0123456789', ...extra,
    DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { const r = st.run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; } } };
  db.prepare('INSERT INTO inquiries (ref, space_id, status, name, phone, email, event_date, headcount, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('MS-2611-AAAA', 'megaspot-gundae-2', '예약 확정', '홍길동', '010-1234-5678', 'hong@example.com', day(20), 120, JSON.stringify({ org: '조직문화팀', theme: '연말 송년회', options: { manager: { count: 2 }, xbanner: true }, reception: { course: 'x' } }), '2026-11-01 10:00:00');
  db.prepare('INSERT INTO inquiries (ref, space_id, status, name, phone, email, event_date, headcount, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('MS-2611-BBBB', 'megaspot-gundae', '문의 접수', '김영희', '010-3333-4444', 'kim@example.com', day(40), 80, JSON.stringify({ start_h: 13, end_h: 18, total: 900000 }), new Date().toISOString().slice(0, 19).replace('T', ' '));
  const booking = (code, o = {}) => db.prepare('INSERT INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, status, start_h, end_h, amount, confirm_doc, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(code, o.space || 'megaspot-gundae-2', o.ref ?? null, o.name || '홍길동', o.phone || '010-1234-5678', '5678', o.date || day(20), 'custom', 120, o.status || 'confirmed', o.start ?? 18, o.end ?? 22, o.amount ?? 2400000, o.doc ? JSON.stringify(o.doc) : null, '2026-11-01 10:00:00');
  let ip = 0;
  const call = async (path, { method = 'GET', body, admin = false, cookie } = {}) => {
    const headers = { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.2.0.' + (++ip % 200), 'user-agent': 'test-agent' };
    if (admin) headers['x-admin-key'] = 'test-only'; if (cookie) headers.cookie = cookie;
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/contracts/' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    return { status: res.status, json: await res.json() };
  };
  const link = l => { const p = new URLSearchParams(l.split('#')[1]); return { id: p.get('id'), k: p.get('k') }; };
  return { db, env, call, booking, link };
}
const sign = (f, o, extra = {}) => f.call('sign', { method: 'POST', body: { ...o, renter: { address: '서울시 성동구 1', bizno: '123-45-67890' }, signer: '홍길동', agree: true, signature: PNG, ...extra } });

test('불러오기: 예약·문의·예약확정서에서 대관자·이용일·시간·금액·옵션을 채운다', async t => {
  const f = fixture(t);
  f.booking('BK-A', { ref: 'MS-2611-AAAA', start: 18, end: 22, doc: { event: '조직문화팀 송년회', amount: 2600000, paid: 500000 } });
  f.booking('BK-N', { space: 'megaspot-gundae', date: day(10), start: 25, end: 29 });
  assert.equal((await f.call('admin/prefill?booking_code=BK-A')).status, 401);
  let r = await f.call('admin/prefill?booking_code=BK-A', { admin: true });
  const d = r.json.data;
  assert.deepEqual(d.renter, { name: '조직문화팀', rep: '홍길동', bizno: '', address: '', phone: '010-1234-5678', email: 'hong@example.com' });
  assert.deepEqual([d.space, d.date, d.start, d.end, d.event, d.headcount, d.booking_code], ['megaspot-gundae-2', day(20), '18:00', '22:00', '조직문화팀 송년회', 120, 'BK-A']);
  assert.deepEqual([d.fee.space, d.fee.deposit, d.fee.security, d.fee.balance_days], [2600000, 500000, 150000, 15]);
  assert.deepEqual(d.fee.options.sort(), ['banner', 'catering', 'manager']);
  assert.equal(d.fee.bank.holder, '주식회사 블랭크'); assert.equal(r.json.inquiry_ref, 'MS-2611-AAAA');
  r = await f.call('admin/prefill?booking_code=BK-N', { admin: true });   // 자정 넘긴 예약은 실제 날짜로
  assert.deepEqual([r.json.data.date, r.json.data.start, r.json.data.end], [day(11), '01:00', '05:00']);
  r = await f.call('admin/prefill?inquiry_ref=MS-2611-BBBB', { admin: true });
  assert.deepEqual([r.json.data.renter.name, r.json.data.start, r.json.data.end, r.json.data.fee.space, r.json.data.booking_code], ['김영희', '13:00', '18:00', 900000, '']);
  const s = await f.call('admin/sources', { admin: true });
  assert.deepEqual(s.json.bookings.map(x => x.booking_code), ['BK-N', 'BK-A']); assert.ok(s.json.inquiries.some(x => x.ref === 'MS-2611-BBBB'));
  assert.equal((await f.call('admin/sources?q=3333', { admin: true })).json.inquiries[0].ref, 'MS-2611-BBBB');
});

test('만들기·고치기: 필수 확인, 예약 1건에 진행 중 계약서 1장, 서명 뒤 잠김', async t => {
  const f = fixture(t);
  f.booking('BK-A', { ref: 'MS-2611-AAAA' });
  const data = (await f.call('admin/prefill?booking_code=BK-A', { admin: true })).json.data;
  assert.equal((await f.call('admin/save', { method: 'POST', admin: true, body: { data: { ...data, space: '' } } })).status, 400);
  assert.equal((await f.call('admin/save', { method: 'POST', admin: true, body: { data: { ...data, booking_code: 'BK-NONE' } } })).json.code, 'NO_BOOKING');
  const c = await f.call('admin/save', { method: 'POST', admin: true, body: { data: { ...data, fee: { ...data.fee, extra_people: 5, discount: 100000 } }, inquiry_ref: 'MS-2611-AAAA' } });
  assert.equal(c.status, 200); assert.match(c.json.id, /^RC-\d{4}-[A-Z2-9]{4}$/); assert.match(c.json.link, /^\/contract\/#id=RC-[^&]+&k=[\w-]{22}$/);
  assert.equal((await f.call('admin/save', { method: 'POST', admin: true, body: { data } })).json.code, 'DUPLICATE');
  const det = await f.call('admin/detail?id=' + c.json.id, { admin: true });
  assert.equal(det.json.contract.totals.total, 2400000 + 50000 - 100000);
  assert.equal(det.json.contract.data.operator.company, '주식회사 블랭크');
  assert.deepEqual(det.json.recipients.map(x => x.phone), ['01012345678']);
  const up = await f.call('admin/save', { method: 'POST', admin: true, body: { id: c.json.id, data: { ...data, special: '현수막은 오전에 설치' } } });
  assert.equal(up.status, 200);
  const o = f.link(c.json.link);
  assert.equal((await sign(f, o)).status, 200);
  assert.equal((await f.call('admin/save', { method: 'POST', admin: true, body: { id: c.json.id, data } })).json.code, 'LOCKED');
  assert.equal((await f.call('admin/relink', { method: 'POST', admin: true, body: { id: c.json.id } })).json.code, 'LOCKED');
  // 취소하면 같은 예약으로 새로 만들 수 있다
  assert.equal((await f.call('admin/void', { method: 'POST', admin: true, body: { id: c.json.id } })).status, 200);
  assert.equal((await f.call('admin/save', { method: 'POST', admin: true, body: { data } })).status, 200);
  const list = await f.call('admin/list', { admin: true });
  assert.deepEqual(list.json.counts, { ready: 1, signed: 0, void: 1 });
});

test('대관자 화면: 링크 열쇠·열람 기록·서명 확인·서명 기록·다시 만든 링크', async t => {
  const f = fixture(t);
  f.booking('BK-A', { ref: 'MS-2611-AAAA' });
  const data = (await f.call('admin/prefill?booking_code=BK-A', { admin: true })).json.data;
  const c = (await f.call('admin/save', { method: 'POST', admin: true, body: { data } })).json, o = f.link(c.link);
  assert.equal((await f.call('view?id=' + o.id + '&k=' + 'x'.repeat(22))).status, 403);
  let v = await f.call('view?id=' + o.id + '&k=' + o.k);
  assert.equal(v.status, 200); assert.equal(v.json.contract.status, 'ready'); assert.equal(v.json.contract.signature, '');
  assert.equal(v.json.invite.available, true); assert.equal(v.json.invite.invite, null);
  assert.ok(f.db.prepare('SELECT viewed_at FROM rental_contracts').get().viewed_at);
  // 서명 확인
  assert.equal((await sign(f, o, { agree: false })).status, 400);
  assert.equal((await sign(f, o, { signature: 'data:image/png;base64,AAAA' })).status, 400);
  assert.equal((await sign(f, o, { signer: '홍', renter: { rep: '홍' } })).status, 400);
  assert.equal((await sign(f, o, { renter: { phone: '12' } })).status, 400);
  // 링크를 다시 만들면 예전 링크는 막힌다
  const re = await f.call('admin/relink', { method: 'POST', admin: true, body: { id: o.id } });
  assert.equal((await sign(f, o)).status, 403);
  const o2 = f.link(re.json.link);
  const s = await sign(f, o2);
  assert.equal(s.status, 200); assert.equal(s.json.contract.status, 'signed'); assert.equal(s.json.contract.signed.signer, '홍길동');
  assert.equal(s.json.contract.data.renter.address, '서울시 성동구 1'); assert.equal(s.json.contract.data.renter.name, '조직문화팀');
  assert.match(s.json.contract.signed.hash, /^[0-9a-f]{64}$/); assert.equal(s.json.contract.signature, PNG);
  const row = f.db.prepare('SELECT signed_ip, signed_ua, terms_version FROM rental_contracts').get();
  assert.match(row.signed_ip, /^10\.2\.0\./); assert.equal(row.signed_ua, 'test-agent'); assert.equal(row.terms_version, CD.TERMS_VERSION);
  assert.equal((await sign(f, o2)).json.code, 'SIGNED');
  v = await f.call('view?id=' + o2.id + '&k=' + o2.k);
  assert.equal(v.json.contract.status, 'signed'); assert.ok(v.json.contract.signed.at);
});

test('입력하고 확인만 눌러도 계약 완료 — 서명 그림 없이 대표자 이름으로 전자 서명', async t => {
  const f = fixture(t);
  f.booking('BK-A', { ref: 'MS-2611-AAAA' });
  const data = (await f.call('admin/prefill?booking_code=BK-A', { admin: true })).json.data;
  const o = f.link((await f.call('admin/save', { method: 'POST', admin: true, body: { data } })).json.link);
  const r = await f.call('sign', { method: 'POST', body: { ...o, renter: { rep: '김담당' }, agree: true } });
  assert.equal(r.status, 200); assert.equal(r.json.contract.status, 'signed'); assert.equal(r.json.contract.status_label, '계약 완료');
  assert.equal(r.json.contract.signed.signer, '김담당'); assert.equal(r.json.contract.signature, '');
  assert.equal(f.db.prepare('SELECT signature FROM rental_contracts').get().signature, null);
  const html = CD.html(r.json.contract.data, { signed_at: r.json.contract.signed.at, signer: '김담당' });
  assert.ok(html.includes('cdoc-esign') && html.includes('김담당<small>전자서명</small>'));
});

test('취소된 예약은 서명할 수 없고, 취소한 계약서는 취소로 보인다', async t => {
  const f = fixture(t);
  f.booking('BK-A');
  const data = (await f.call('admin/prefill?booking_code=BK-A', { admin: true })).json.data;
  const c = (await f.call('admin/save', { method: 'POST', admin: true, body: { data } })).json, o = f.link(c.link);
  f.db.prepare("UPDATE bookings SET status = 'cancelled'").run();
  assert.equal((await sign(f, o)).json.code, 'CANCELLED');
  await f.call('admin/void', { method: 'POST', admin: true, body: { id: o.id } });
  const v = await f.call('view?id=' + o.id + '&k=' + o.k);
  assert.equal(v.json.contract.status, 'void'); assert.equal(v.json.invite, null);
  assert.equal((await sign(f, o)).json.code, 'VOID');
});

test('계약서 링크로 모임 초대장 만들기 — 확정 예약만, 예약 1건에 1장', async t => {
  const f = fixture(t);
  f.booking('BK-A'); f.booking('BK-R', { status: 'payment_review', date: day(25) });
  const make = async code => { const data = (await f.call('admin/prefill?booking_code=' + code, { admin: true })).json.data; return f.link((await f.call('admin/save', { method: 'POST', admin: true, body: { data } })).json.link); };
  const a = await make('BK-A'), r = await make('BK-R');
  assert.equal((await f.call('invite', { method: 'POST', body: { ...r, data: { title: '모임' } } })).json.code, 'NOT_CONFIRMED');
  assert.equal((await f.call('view?id=' + r.id + '&k=' + r.k)).json.invite.available, false);
  assert.equal((await f.call('invite', { method: 'POST', body: { ...a, data: { title: 'a' } } })).status, 400);
  const iv = await f.call('invite', { method: 'POST', body: { ...a, data: { title: '송년의 밤', host: '조직문화팀' } } });
  assert.equal(iv.status, 200); assert.equal(iv.json.invite.invite.title, '송년의 밤'); assert.match(iv.json.invite.public_url, /^\/invite\/\?c=/); assert.match(iv.json.invite.manage_url, /^\/invite\/manage\//);
  await f.call('invite', { method: 'POST', body: { ...a, data: { title: '다른 이름' } } });
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM invites').get().n, 1);
  assert.equal((await f.call('view?id=' + a.id + '&k=' + a.k)).json.invite.invite.title, '송년의 밤');
  // 문의만 있는 계약서는 초대장 안내만
  const q = (await f.call('admin/prefill?inquiry_ref=MS-2611-BBBB', { admin: true })).json.data;
  const qc = f.link((await f.call('admin/save', { method: 'POST', admin: true, body: { data: q, inquiry_ref: 'MS-2611-BBBB' } })).json.link);
  assert.equal((await f.call('view?id=' + qc.id + '&k=' + qc.k)).json.invite.available, false);
});

test('카카오톡: 승인·시험 전에는 막고, 예약·문의·계약서 번호로만 보낸다', async t => {
  const f = fixture(t, ALIGO), real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url); if (!u.startsWith('https://kakaoapi.aligo.in/akv10/')) return real(url, opts);
    const path = u.slice(32).replace(/\/$/, ''), data = Object.fromEntries(new URLSearchParams(opts.body)); calls.push({ path, data });
    if (path === 'template/list') return Response.json({ code: 0, list: [{ templtCode: data.tpl_code, templtContent: CONTRACT_TEMPLATE.content, senderKey: 'sender-profile', inspStatus: 'APR', status: 'R', buttons: CONTRACT_TEMPLATE.buttons }] });
    return Response.json({ code: 0, info: { mid: String(700 + calls.length), scnt: 1, fcnt: 0 } });
  };
  t.after(() => { globalThis.fetch = real; });
  f.booking('BK-A', { ref: 'MS-2611-AAAA' });
  const data = (await f.call('admin/prefill?booking_code=BK-A', { admin: true })).json.data;
  const c = (await f.call('admin/save', { method: 'POST', admin: true, body: { data: { ...data, renter: { ...data.renter, phone: '010-5555-6666' } }, inquiry_ref: 'MS-2611-AAAA' } })).json;
  assert.equal((await f.call('admin/send', { method: 'POST', admin: true, body: { id: c.id, channel: 'kakao', receivers: ['01012345678'] } })).json.code, 'KAKAO_OFF');
  for (const b of [{ action: 'save', code: 'UN_9100' }, { action: 'check' }, { action: 'test', receiver: '01022223333' }, { action: 'confirm' }]) assert.equal((await f.call('admin/kakao', { method: 'POST', admin: true, body: b })).status, 200, JSON.stringify(b));
  assert.equal((await f.call('admin/kakao', { admin: true })).json.admin_ready, true);
  assert.equal((await f.call('admin/send', { method: 'POST', admin: true, body: { id: c.id, channel: 'kakao', receivers: ['01099998888'] } })).json.code, 'NOT_CONTACT');
  const r = await f.call('admin/send', { method: 'POST', admin: true, body: { id: c.id, channel: 'kakao', receivers: ['01012345678', '01055556666'] } });
  assert.deepEqual(r.json.results.map(x => x.status), ['accepted', 'accepted']);
  const sent = calls.filter(x => x.path === 'alimtalk/send').slice(-1)[0].data;
  assert.equal(sent.tpl_code, 'UN_9100'); assert.match(sent.message_1, /계약 번호: RC-/); assert.doesNotMatch(sent.message_1, /#\{/);
  assert.match(JSON.parse(sent.button_1).button[0].linkMo, /^https:\/\/megaspot\.kr\/contract\/#id=RC-[^&]+&k=[\w-]{22}$/);
  assert.equal((await f.call('admin/send', { method: 'POST', admin: true, body: { id: c.id, channel: 'kakao', receivers: ['01012345678'] } })).json.results[0].status, 'skipped');
  assert.equal((await f.call('admin/send', { method: 'POST', admin: true, body: { id: c.id, channel: 'email', to: 'hong@example.com' } })).json.code, 'EMAIL_OFF');
  assert.ok(f.db.prepare('SELECT sent_at FROM rental_contracts').get().sent_at);
  // 고객 쪽 카카오톡 설정과 서로 섞이지 않는다
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM invite_messages").get().n, 0);
});

test('설정·도장 · 보관 기간 · 본문 모듈', async t => {
  const f = fixture(t);
  let s = await f.call('admin/settings', { admin: true });
  assert.equal(s.json.operator.bizno, '161-86-03494'); assert.equal(s.json.bank.number, '298-910064-39104'); assert.equal(s.json.seal, '');
  s = await f.call('admin/settings', { method: 'POST', admin: true, body: { operator: { name: '주식회사 블랭크 (메가스팟)', address: '서울 새 주소' }, bank: { bank: '국민은행', number: '1-2-3', holder: '주식회사 블랭크' }, balance_days: 10, methods: ['card', 'x'] } });
  assert.deepEqual([s.json.operator.address, s.json.bank.bank, s.json.balance_days, s.json.methods.join()], ['서울 새 주소', '국민은행', 10, 'card']);
  assert.equal((await f.call('admin/seal', { method: 'POST', admin: true, body: { image: 'data:image/jpeg;base64,AAAA' } })).status, 400);
  assert.equal((await f.call('admin/seal', { method: 'POST', admin: true, body: { image: PNG } })).json.seal, PNG);
  // 보관 기간
  f.db.prepare("INSERT INTO rental_contracts (id, status, data, event_date, created_at) VALUES ('RC-2001-AAAA','ready','{}',?,'x'),('RC-2001-BBBB','signed','{}',?,'x'),('RC-2001-CCCC','signed','{}',?,'x')").run(day(-400), day(-400), day(-1900));
  await purgeContracts(f.env);
  assert.deepEqual(f.db.prepare('SELECT id FROM rental_contracts ORDER BY id').all().map(r => r.id), ['RC-2001-BBBB']);
  // 본문 모듈
  assert.deepEqual(CD.totals({ space: 1000000, extra_people: 3, options_amount: 200000, discount: 50000, deposit: 1180000 }), { extra_amount: 30000, total: 1180000, balance: 0, paid_full: true });
  assert.equal(CD.hours('22:00', '02:00'), 4);
  const html = CD.html({ id: 'RC-1', renter: { name: '<b>x</b>' }, space: 'megaspot-gundae', fee: { security: 200000 } }, {});
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && html.includes('보증금 200,000원을 결제한다.') && html.includes('제9조 (기타)') && html.includes('특약 사항은 위 조항보다 우선한다.'));
  assert.equal(cleanContract({ fee: { space: '1,200,000', methods: ['card', 'bad'], options: ['etc', 'x'] } }).fee.space, 1200000);
  assert.deepEqual(templateVars(CONTRACT_TEMPLATE).sort(), ['계약번호', '고객명', '공간명', '이용일', '확인키'].sort());
  assert.doesNotMatch(renderTemplate(CONTRACT_TEMPLATE, { 고객명: 'a', 공간명: 'b', 이용일: 'c', 계약번호: 'd', 확인키: 'e' }).message, /#\{/);
});

test('화면 연결: 계약서 페이지·관리자 메뉴·개인정보처리방침·검색 제외', () => {
  const page = read('contract/index.html');
  for (const s of ['contract-doc.js?v=', 'sign-pad.js?v=', 'contract-view.js?v=', 'invite-pdf.js?v=', 'contract-doc.css?v=', 'noindex']) assert.ok(page.includes(s), s);
  const admin = read('admin/index.html');
  for (const s of ['/assets/js/pages/admin-contracts.js?v=', '/assets/js/kit/contract-doc.js?v=', '/assets/css/admin-contracts.css?v=', '/assets/css/contract-doc.css?v=']) assert.ok(admin.includes(s), s);
  assert.match(read('assets/js/pages/admin-navigation.js'), /\['contracts','대관 계약서'\]/);
  assert.match(read('privacy/index.html'), /id="contract"/); assert.match(read('terms/index.html'), /제8조의4 \(공간대관 계약서와 전자 서명\)/);
  assert.match(read('robots.txt'), /Disallow: \/contract\//); assert.match(read('_headers'), /\/contract\/\*\n {2}X-Robots-Tag: noindex/);
});
