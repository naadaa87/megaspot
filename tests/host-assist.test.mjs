// 공간 등록 대행 요청 점검 (2026-11-14)
//  · 호스트: 공간 이름만으로도 요청 · 동의 필수 · 같은 공간 중복 막기 · 자료 보태기 · 취소 범위
//  · 파일: 확장자·실제 형식 확인 · 크기 제한 · 900KB 조각 올리기 → 본사가 조각을 받아 원본과 같게 합치기
//  · 본사: 목록·상태·호스트 메시지·공간 연결 · 호스트센터 대신 열기(4시간 · 공간 정보 화면만 · 로그인 연장 없음) · 오래된 파일 정리
//   node --test tests/host-assist.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as hostsApi } from '../functions/api/hosts/[[path]].js';
import { onRequest as hqApi } from '../functions/api/hq/[[path]].js';
import { FILE_RULE, cleanLinks, kindOk, cleanName, actingAllowed } from '../functions/api/_hostassist.js';

const ORIGIN = 'https://megaspot.test';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql'));
  const env = { ADMIN_KEY: 'test-only', DB: { prepare(sql) { const st = db.prepare(sql); let a = [];
    return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  let ip = 1; const jar = {};
  const call = async (api, base, path, method, body, headers) => {
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + base + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.9.0.' + (ip++ % 250), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    return { status: res.status, json: await res.json().catch(() => null), res };
  };
  const host = name => async (path, method = 'GET', body) => {
    const r = await call(hostsApi, '/api/hosts/', path, method, body, jar[name] ? { cookie: jar[name] } : {});
    const c = (r.res.headers.getSetCookie() || []).map(x => x.split(';')[0]).filter(x => x.startsWith('ms_host=') && x.length > 8); if (c.length) jar[name] = c[0];
    return r;
  };
  const hq = (path, method = 'GET', body) => call(hqApi, '/api/hq/', path, method, body, { 'x-admin-key': 'test-only' });
  return { db, env, host, hq, jar };
}
const SIGNUP = { email: 'host@example.com', password: 'host-pass-1234', name: '김호스트', phone: '010-5555-1111', company: '성수홀', agree_terms: true, agree_privacy: true,
  space: { name: '성수 그랜드홀', region: 'seoul', area: 120, types: ['hall'] } };
async function signed(f, who = 'a') { const h = f.host(who); const r = await h('signup', 'POST', SIGNUP); assert.equal(r.status, 200); return { h, ref: r.json.space }; }
function pdf(size) { const b = Buffer.alloc(size); b.write('%PDF-1.7\n'); for (let i = 9; i < size; i++) b[i] = (i * 31) % 251; return b; }
async function upload(h, req, name, buf) {
  const s = await h('assist/' + req + '/files', 'POST', { name, size: buf.length }); if (s.status !== 200) return s;
  for (let i = 0; i < s.json.chunks; i++) {
    const r = await h('assist/' + req + '/files/' + s.json.fid + '/' + i, 'POST', { data: buf.subarray(i * s.json.chunk, (i + 1) * s.json.chunk).toString('base64') });
    if (r.status !== 200) return r;
  }
  return h('assist/' + req + '/files/' + s.json.fid + '/done', 'POST', {});
}

test('도움 함수: 주소 정리, 파일 이름, 실제 형식 확인, 대신 작성 범위', () => {
  assert.deepEqual(cleanLinks('www.example.com/hall\nhttps://instagram.com/x , ftp://bad.example\njavascript:alert(1)\nhttps://user:pw@x.com'), ['https://www.example.com/hall', 'https://instagram.com/x']);
  assert.equal(cleanName('../../공간 소개서?.pdf'), '.._.._공간 소개서_.pdf');
  assert.ok(kindOk('pdf', pdf(10).toString('base64'))); assert.ok(!kindOk('pdf', Buffer.from('MZ\x90\x00').toString('base64')));
  assert.ok(kindOk('pptx', Buffer.from('PK\x03\x04abcd').toString('base64'))); assert.ok(kindOk('hwp', Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 1, 2]).toString('base64')));
  assert.ok(actingAllowed('spaces/SP-2611-ABCD', 'PUT')); assert.ok(actingAllowed('spaces/SP-2611-ABCD/photos', 'POST')); assert.ok(actingAllowed('me', 'GET'));
  for (const p of ['bookings', 'customers', 'settlement', 'billing', 'password', 'spaces/SP-2611-ABCD/pause', 'ical']) assert.ok(!actingAllowed(p, 'POST') && !actingAllowed(p, 'GET'), p);
  assert.ok(!actingAllowed('me', 'PUT')); assert.ok(!actingAllowed('assist', 'POST'));
});

test('호스트: 공간 이름만으로 요청하고, 동의 없이는 막고, 같은 공간은 한 번만', async () => {
  const f = fixture(), { h, ref } = await signed(f);
  assert.equal((await h('assist', 'POST', { name: '성수 그랜드홀', space: ref })).json.code, 'ERR', '동의 없음');
  let r = await h('assist', 'POST', { name: '성수 그랜드홀', space: ref, agree: true, links: 'blog.naver.com/hall\nhttps://instagram.com/hall', message: '요금은 시간당 15만 원', contact_time: 'evening' });
  assert.equal(r.status, 200); const req = r.json.ref; assert.match(req, /^AS-\d{4}-[A-Z0-9]{4}$/);
  assert.equal((await h('assist', 'POST', { name: '다시', space: ref, agree: true })).json.code, 'EXISTS');
  r = await h('assist', 'POST', { name: '새로 열 2호점', agree: true });   // 아직 없는 공간
  assert.equal(r.status, 200);
  const list = (await h('assist')).json;
  assert.equal(list.items.length, 2); const it = list.items.find(x => x.ref === req);
  assert.deepEqual(it.links, ['https://blog.naver.com/hall', 'https://instagram.com/hall']);
  assert.equal(it.phone, '010-5555-1111', '연락 번호를 비우면 호스트 번호'); assert.equal(it.contact_label, '저녁'); assert.equal(it.status_label, '접수');
  assert.equal(list.acting, null);
  // 자료 보태기
  await h('assist/' + req, 'PATCH', { links: ['https://drive.google.com/drive/folders/abc'], message: '사진 폴더 링크 보냅니다' });
  const it2 = (await h('assist')).json.items.find(x => x.ref === req);
  assert.equal(it2.links.length, 3); assert.match(it2.message, /시간당 15만 원[\s\S]*추가\] 사진 폴더/);
  // 다른 호스트는 볼 수 없음
  const other = f.host('b'); await other('signup', 'POST', { ...SIGNUP, email: 'b@example.com' });
  assert.equal((await other('assist/' + req, 'PATCH', { message: 'x' })).status, 404);
  assert.equal((await other('assist')).json.items.length, 0);
});

test('파일: 형식·크기를 확인하고 조각으로 올린 파일을 본사가 원본 그대로 받는다', async () => {
  const f = fixture(), { h, ref } = await signed(f);
  const req = (await h('assist', 'POST', { name: '성수 그랜드홀', space: ref, agree: true })).json.ref;
  assert.equal((await h('assist/' + req + '/files', 'POST', { name: 'setup.exe', size: 100 })).json.code, 'FILE_TYPE');
  assert.equal((await h('assist/' + req + '/files', 'POST', { name: '큰파일.pdf', size: FILE_RULE.maxFile + 1 })).json.code, 'FILE_BIG');
  // 확장자는 pdf인데 실제로는 다른 파일 → 지워짐
  const fake = Buffer.alloc(1000, 7); let r = await upload(h, req, '가짜.pdf', fake);
  assert.equal(r.json.code, 'FILE_TYPE'); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM host_assist_files').get().n, 0);
  const doc = pdf(FILE_RULE.chunk * 2 + 12345);
  r = await upload(h, req, '공간 소개서.pdf', doc); assert.equal(r.status, 200); assert.equal(r.json.size, doc.length);
  const files = (await h('assist')).json.items[0].files; assert.equal(files.length, 1); assert.equal(files[0].chunks, 3);
  // 다 올리지 않은 파일은 목록에 나오지 않음
  const half = await h('assist/' + req + '/files', 'POST', { name: '반쪽.pdf', size: 2000 });
  assert.equal((await h('assist')).json.items[0].files.length, 1);
  assert.equal((await h('assist/' + req + '/files/' + half.json.fid + '/done', 'POST', {})).json.code, 'FILE_BROKEN');
  // 본사가 조각을 받아 합치면 원본과 같다
  const list = (await f.hq('assist?status=open')).json; assert.equal(list.items.length, 1);
  const it = list.items[0]; assert.equal(it.host.name, '김호스트'); assert.equal(it.space.ref, ref); assert.equal(it.files.length, 1);
  const parts = []; for (let i = 0; i < it.files[0].chunks; i++) { const c = (await f.hq('assist/files/' + it.files[0].fid + '/' + i)).json; assert.equal(c.mime, 'application/pdf'); parts.push(Buffer.from(c.data, 'base64')); }
  assert.ok(Buffer.concat(parts).equals(doc));
  // 호스트가 파일을 지울 수 있음
  assert.equal((await h('assist/' + req + '/files/' + it.files[0].fid, 'DELETE')).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM host_assist_chunks WHERE fid = ?').get(it.files[0].fid).n, 0);
});

test('본사: 상태·메시지·공간 연결, 호스트 취소 범위, 요약 숫자', async () => {
  const f = fixture(), { h, ref } = await signed(f);
  const req = (await h('assist', 'POST', { name: '새로 열 홀', agree: true })).json.ref;
  assert.equal((await f.hq('summary')).json.assist_new, 1);
  let r = await f.hq('assist/' + req, 'PATCH', { status: 'working', hq_message: '자료 확인했습니다. 내일까지 채워 두겠습니다.', memo: '사진 12장', space: ref });
  assert.equal(r.status, 200);
  const it = (await h('assist')).json.items[0];
  assert.equal(it.status, 'working'); assert.equal(it.hq_message, '자료 확인했습니다. 내일까지 채워 두겠습니다.'); assert.equal(it.space_ref, ref); assert.equal(it.memo, undefined, '내부 메모는 호스트에게 안 보임');
  assert.equal((await h('assist/' + req + '/cancel', 'POST')).json.code, 'STARTED');
  const other = f.host('b'); const o = await other('signup', 'POST', { ...SIGNUP, email: 'b@example.com' });
  assert.equal((await f.hq('assist/' + req, 'PATCH', { space: o.json.space })).status, 400, '다른 호스트의 공간은 연결할 수 없음');
  await f.hq('assist/' + req, 'PATCH', { status: 'done' });
  assert.equal((await h('assist/' + req, 'PATCH', { message: 'x' })).json.code, 'DONE');
  const hist = (await f.hq('assist?status=all')).json.items[0].history.map(x => x.text);
  assert.ok(hist.includes('상태: 등록 작업 중') && hist.includes('상태: 완료'));
  // 접수 단계에서는 호스트가 취소할 수 있음
  const req2 = (await h('assist', 'POST', { name: '취소할 홀', agree: true })).json.ref;
  assert.equal((await h('assist/' + req2 + '/cancel', 'POST')).status, 200);
});

test('본사가 대신 연 호스트센터: 4시간, 공간 정보·사진만, 로그인 연장 없음', async () => {
  const f = fixture(), { h, ref } = await signed(f);
  const req = (await h('assist', 'POST', { name: '성수 그랜드홀', space: ref, agree: true })).json.ref;
  const r = await f.hq('assist/' + req + '/act', 'POST', {});
  assert.equal(r.status, 200); assert.equal(r.json.url, '/host/center/#space=' + ref);
  const set = r.res.headers.getSetCookie(); assert.ok(set.some(c => /^ms_host=[^;]{20,};.*Max-Age=14400/.test(c)), set.join(' | '));
  const cookie = set.map(c => c.split(';')[0]).find(c => c.startsWith('ms_host='));
  const hqh = (path, method = 'GET', body) => hostsApi({ env: f.env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/hosts/' + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
  const me = await hqh('me'); assert.equal(me.status, 200); assert.equal(me.headers.getSetCookie().length, 0, '대신 연 로그인은 늘리지 않음');
  const a = await (await hqh('assist')).json(); assert.equal(a.acting.ref, req);
  assert.equal((await hqh('spaces/' + ref, 'PUT', { name: '성수 그랜드홀', region: 'seoul', address: '서울 성동구 성수이로 100', capacity: 180, area: 120, types: ['hall'], intro: '본사가 대신 적은 소개입니다. 층고 5m 단독 홀.' })).status, 200);
  for (const [p, m] of [['bookings', 'GET'], ['customers', 'GET'], ['settlement', 'GET'], ['billing', 'GET'], ['password', 'POST'], ['me', 'PUT'], ['spaces/' + ref + '/pause', 'POST']]) {
    const x = await hqh(p, m, m === 'GET' ? undefined : {}); assert.equal(x.status, 403, p); assert.equal((await x.json()).code, 'ASSIST_LIMIT');
  }
  assert.equal((await f.hq('assist?status=all')).json.items[0].status, 'working', '대신 작성을 시작하면 작업 중으로');
  // 호스트 본인 로그인은 그대로 모든 화면을 씀
  assert.equal((await h('bookings')).status, 200); assert.equal((await h('assist')).json.acting, null);
  // 새 공간 요청: 본사가 대신 만든 공간이 요청에 바로 연결된다
  const req2 = (await h('assist', 'POST', { name: '새로 열 2호점', agree: true })).json.ref;
  const r2 = await f.hq('assist/' + req2 + '/act', 'POST', {}); assert.equal(r2.json.url, '/host/center/#add');
  const ck2 = r2.res.headers.getSetCookie().map(c => c.split(';')[0]).find(c => c.startsWith('ms_host='));
  const made = await (await hostsApi({ env: f.env, params: { path: ['spaces'] }, request: new Request(ORIGIN + '/api/hosts/spaces', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: ck2 }, body: JSON.stringify({ name: '새로 열 2호점', region: 'seoul', address: '서울 성동구 1', capacity: 120, area: 90, types: ['hall'] }) }) })).json();
  assert.equal((await f.hq('assist?status=all')).json.items.find(x => x.ref === req2).space_ref, made.ref);
  // 끝난 요청으로는 대신 열 수 없음
  await f.hq('assist/' + req, 'PATCH', { status: 'done' });
  assert.equal((await f.hq('assist/' + req + '/act', 'POST', {})).json.code, 'DONE');
});

test('끝난 지 90일이 지난 요청의 파일은 본사 목록을 열 때 지운다', async () => {
  const f = fixture(), { h, ref } = await signed(f);
  const req = (await h('assist', 'POST', { name: '성수 그랜드홀', space: ref, agree: true })).json.ref;
  assert.equal((await upload(h, req, '소개.pdf', pdf(5000))).status, 200);
  await f.hq('assist/' + req, 'PATCH', { status: 'done' });
  await f.hq('assist?status=all'); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM host_assist_files').get().n, 1, '아직 90일 전');
  f.db.prepare("UPDATE host_assist SET done_at = '2026-01-01 00:00:00'").run();
  await f.hq('assist?status=all'); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM host_assist_files').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM host_assist_chunks').get().n, 0);
});

test('화면 연결: 호스트센터·관리자 메뉴·입점 신청 안내', () => {
  const hc = read('assets/js/pages/host-center.js'), adm = read('assets/js/pages/admin-hostplat.js'), nav = read('assets/js/pages/admin-navigation.js');
  assert.match(hc, /공간 등록 대행 요청/); assert.match(hc, /\/assist/);
  assert.match(adm, /hp-assist/); assert.match(nav, /\['hp-assist','공간 등록 대행'\]/);
  assert.match(read('host/register/index.html'), /등록 대행/);
});
