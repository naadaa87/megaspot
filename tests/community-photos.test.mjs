// 커뮤니티 모임 사진 점검 (2026-11-23)
//  · 올리기는 회원만 · 이미지가 아닌 파일·너무 큰 파일 거절 · 임시 사진은 올린 회원만 볼 수 있음
//  · 글에 붙이기: 내 사진만 · 10장까지 · 순서대로(첫 장이 대표) · 고칠 때 빠진 사진은 지움
//  · 보이기: 게시 중이면 누구나 · 검토 대기는 쓴 회원과 관리자만 · 지운 글은 아무도
//  · 정리: 하루 지난 임시 사진 · 완전히 지운 글의 사진 · R2 버킷을 연결하면 R2에 담기
//   node --test tests/community-photos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest as api } from '../functions/api/community/[[path]].js';
import { sha256, hashPassword } from '../functions/api/_lib.js';
import { purgeDeleted } from '../functions/api/_community.js';
import { MAX_PER_POST, MAX_TEMP } from '../functions/api/_community_photos.js';

const ORIGIN = 'https://megaspot.test';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const b64 = bytes => Buffer.from(bytes).toString('base64');
const JPEG = n => b64([0xFF, 0xD8, 0xFF, 0xE0, ...Array.from({ length: n }, (_, i) => i % 251)]);
const PNG = b64([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5, 6, 7, 8]);
const SVG = b64(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));

async function fixture(t, { r2 = false } = {}) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const objects = new Map();
  const env = { ADMIN_KEY: 'test-only',
    DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  if (r2) env.MEDIA = {
    async put(key, body, opt) { objects.set(key, { body: Buffer.from(body), type: opt.httpMetadata.contentType }); },
    async get(key) { const o = objects.get(key); return o ? { body: o.body, httpMetadata: { contentType: o.type } } : null; },
    async delete(keys) { for (const k of [].concat(keys)) objects.delete(k); }
  };
  const member = async id => {
    db.prepare("INSERT INTO members (id, email, name, phone, pw_hash, agree_marketing, agreed_at, status, created_at) VALUES (?,?,?,?,?,0,'2026-01-01','active','2026-01-01')").run(id, `m${id}@example.com`, `회원${id}`, '010-0000-000' + id, await hashPassword('pw-' + id));
    db.prepare("INSERT INTO sessions (token_hash, member_id, created_at, expires_at, ua) VALUES (?,?,'2026-01-01','2099-01-01','t')").run(await sha256('tok-' + id), id);
  };
  db.prepare("INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, '2026-01-01', '2099-01-01')").run(await sha256('admin-cookie'));
  const call = async (path, { method = 'GET', body, who, admin = false, adminCookie = false, origin = ORIGIN } = {}) => {
    const headers = { 'content-type': 'application/json', origin }, cookies = [];
    if (who) cookies.push('ms_session=tok-' + who);
    if (adminCookie) cookies.push('ms_admin=admin-cookie');
    if (cookies.length) headers.cookie = cookies.join('; ');
    if (admin) headers['x-admin-key'] = 'test-only';
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/community/' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, json: ct.includes('json') ? await res.json() : null, res };
  };
  const upload = async (who, extra = {}) => call('photos', { method: 'POST', who, body: { body: JPEG(400), thumb: JPEG(20), w: 1600, h: 1200, ...extra } });
  return { db, env, call, member, upload, objects };
}
const GROUP = { board: 'group', title: '건대 보드게임 정기 모임', category: 'hobby', summary: '한 달에 한 번 큰 공간에서 보드게임을 즐깁니다', body: '매월 셋째 주 토요일 오후에 메가스팟 건대 1호에서 40명 정도가 모여 보드게임을 합니다. 처음 오시는 분도 환영합니다.',
  join_url: 'https://open.kakao.com/o/gAbCdEf', agree_public: true, agree_rules: true, author: '보드지기' };

test('올리기: 회원만, 다른 사이트 요청 거절, 이미지가 아닌 파일·너무 큰 사진 거절', async t => {
  const f = await fixture(t); await f.member(1);
  assert.equal((await f.call('photos', { method: 'POST', body: { body: JPEG(10) } })).status, 401);
  assert.equal((await f.call('photos', { method: 'POST', who: 1, origin: 'https://evil.example', body: { body: JPEG(10) } })).status, 403);
  let r = await f.call('photos', { method: 'POST', who: 1, body: { body: SVG } }); assert.equal(r.status, 400); assert.match(r.json.error, /JPG·PNG·WebP/);
  r = await f.call('photos', { method: 'POST', who: 1, body: { body: 'not base64!!' } }); assert.equal(r.status, 400);
  r = await f.call('photos', { method: 'POST', who: 1, body: { body: JPEG(620000) } }); assert.equal(r.status, 413);
  r = await f.call('photos', { method: 'POST', who: 1, body: { body: JPEG(10), thumb: SVG } }); assert.equal(r.status, 400);
  r = await f.call('photos', { method: 'POST', who: 1, body: { body: 'data:image/png;base64,' + PNG, w: 800, h: 600 } });
  assert.equal(r.status, 200); assert.match(r.json.photo.id, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(r.json.photo.src, '/api/community/photo/' + r.json.photo.id); assert.equal(r.json.photo.thumb, r.json.photo.src + '?t=1');
  const row = f.db.prepare('SELECT member_id, post_ref, mime, store, w, h FROM community_photos').get();
  assert.deepEqual({ ...row }, { member_id: 1, post_ref: null, mime: 'image/png', store: 'd1', w: 800, h: 600 });
});

test('임시 사진은 올린 회원만 보고, 지울 수 있다', async t => {
  const f = await fixture(t); await f.member(1); await f.member(2);
  const id = (await f.upload(1)).json.photo.id;
  assert.equal((await f.call('photo/' + id)).status, 404);
  assert.equal((await f.call('photo/' + id, { who: 2 })).status, 404);
  const mine = await f.call('photo/' + id, { who: 1 });
  assert.equal(mine.status, 200); assert.equal(mine.res.headers.get('content-type'), 'image/jpeg'); assert.equal(mine.res.headers.get('cache-control'), 'private, no-store');
  const bytes = new Uint8Array(await mine.res.arrayBuffer()); assert.deepEqual([...bytes.slice(0, 3)], [0xFF, 0xD8, 0xFF]); assert.equal(bytes.length, 404);
  const th = await f.call('photo/' + id + '?t=1', { who: 1 }); assert.equal(new Uint8Array(await th.res.arrayBuffer()).length, 24);
  assert.equal((await f.call('photo/../etc', { who: 1 })).status, 404);
  assert.equal((await f.call('photos/' + id, { method: 'DELETE', who: 2 })).status, 404);
  assert.equal((await f.call('photos/' + id, { method: 'DELETE', who: 1 })).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM community_photos').get().n, 0);
});

test('글에 붙이기: 내 사진만, 순서대로, 검토 대기는 쓴 회원·관리자만, 게시 뒤 누구나', async t => {
  const f = await fixture(t); await f.member(1); await f.member(2);
  const ids = []; for (let i = 0; i < 3; i++) ids.push((await f.upload(1)).json.photo.id);
  const other = (await f.upload(2)).json.photo.id;
  let r = await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, photos: [...ids, other] } });
  assert.equal(r.status, 400); assert.match(r.json.error, /찾지 못했습니다/);
  r = await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, photos: Array(MAX_PER_POST + 1).fill(0).map((_, i) => ids[0].slice(0, 20) + String(i).padStart(2, '0')) } });
  assert.match(r.json.error, /10장까지/);
  r = await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, photos: [ids[2], ids[0], ids[1]] } });
  assert.equal(r.status, 200); assert.equal(r.json.status, 'pending');
  const ref = r.json.ref;
  assert.deepEqual(f.db.prepare('SELECT id, post_ref, sort FROM community_photos WHERE post_ref IS NOT NULL ORDER BY sort').all().map(x => x.id), [ids[2], ids[0], ids[1]]);
  // 검토 대기: 다른 사람 404, 쓴 회원·관리자(로그인 쿠키) 200
  assert.equal((await f.call('photo/' + ids[2])).status, 404);
  assert.equal((await f.call('photo/' + ids[2], { who: 2 })).status, 404);
  assert.equal((await f.call('photo/' + ids[2], { who: 1 })).status, 200);
  assert.equal((await f.call('photo/' + ids[2], { adminCookie: true })).status, 200);
  // 관리자 미리보기: 공개 화면 API 가 검토 대기 글도 내려줌 (조회수는 그대로)
  assert.equal((await f.call('posts/' + ref)).status, 404);
  let v = await f.call('posts/' + ref, { adminCookie: true });
  assert.equal(v.status, 200); assert.equal(v.json.me.preview, true); assert.equal(v.json.item.status, 'pending'); assert.equal(v.json.item.photos.length, 3);
  assert.equal(f.db.prepare('SELECT views FROM community_posts').get().views, 0);
  // 다른 사람이 남의 사진 번호를 자기 글에 붙일 수 없음
  r = await f.call('posts', { method: 'POST', who: 2, body: { ...GROUP, title: '다른 모임', photos: [ids[0]] } });
  assert.match(r.json.error, /찾지 못했습니다/);
  // 게시 뒤: 누구나 · 목록에는 작은 사진, 상세에는 큰 사진과 사진 목록
  await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'published' } });
  const pub = await f.call('photo/' + ids[2]);
  assert.equal(pub.status, 200); assert.equal(pub.res.headers.get('cache-control'), 'public, max-age=86400'); assert.equal(pub.res.headers.get('x-content-type-options'), 'nosniff');
  const list = await f.call('list?board=group');
  assert.equal(list.json.items[0].cover, `/api/community/photo/${ids[2]}?t=1`); assert.equal(list.json.items[0].photo_count, 3);
  v = await f.call('posts/' + ref);
  assert.equal(v.json.item.cover, `/api/community/photo/${ids[2]}`);
  assert.deepEqual(v.json.item.photos.map(p => p.id), [ids[2], ids[0], ids[1]]);
  assert.deepEqual(v.json.item.photos[0], { id: ids[2], src: `/api/community/photo/${ids[2]}`, thumb: `/api/community/photo/${ids[2]}?t=1`, w: 1600, h: 1200 });
});

test('고치기: 순서를 바꾸고 뺀 사진은 지우며, 사진 목록을 보내지 않으면 그대로 둔다', async t => {
  const f = await fixture(t); await f.member(1);
  const ids = []; for (let i = 0; i < 3; i++) ids.push((await f.upload(1)).json.photo.id);
  const ref = (await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, photos: ids } })).json.ref;
  await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'published' } });
  const extra = (await f.upload(1)).json.photo.id;
  let r = await f.call('posts/' + ref, { method: 'PUT', who: 1, body: { ...GROUP, photos: [extra, ids[0]] } });
  assert.equal(r.status, 200); assert.equal(r.json.status, 'published');
  assert.deepEqual(f.db.prepare('SELECT id FROM community_photos ORDER BY post_ref, sort').all().map(x => x.id), [extra, ids[0]]);
  const v = await f.call('posts/' + ref); assert.equal(v.json.item.cover, '/api/community/photo/' + extra);
  assert.equal(f.db.prepare("SELECT json_extract(data, '$.recheck') AS r FROM community_posts").get().r, 1);
  // 모집 중 표시만 바꾸기 · 사진 목록 없이 고치기 → 사진 그대로
  await f.call('posts/' + ref, { method: 'PATCH', who: 1, body: { recruiting: false } });
  await f.call('posts/' + ref, { method: 'PUT', who: 1, body: { ...GROUP, summary: '한 줄 소개를 조금 고쳤습니다. 매월 모입니다' } });
  assert.equal((await f.call('posts/' + ref)).json.item.photos.length, 2);
  // 관리자가 내용을 고쳐도 사진은 그대로
  await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { edit: { ...GROUP, title: '건대 보드게임 정기 모임 (운영팀 수정)' } } });
  assert.equal((await f.call('posts/' + ref)).json.item.photos.length, 2);
  // 모두 빼면 준비된 대표 이미지로 돌아감
  r = await f.call('posts/' + ref, { method: 'PUT', who: 1, body: { ...GROUP, photos: [], cover: 's13' } });
  const last = await f.call('posts/' + ref);
  assert.equal(last.json.item.cover, 's13'); assert.deepEqual(last.json.item.photos, []);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM community_photos').get().n, 0);
});

test('지운 글의 사진은 바로 안 보이고, 삭제를 켜면 30일 뒤 지운다 · 하루 지난 임시 사진도 지운다', async t => {
  const f = await fixture(t); await f.member(1);
  const id = (await f.upload(1)).json.photo.id;
  const ref = (await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, photos: [id] } })).json.ref;
  await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'published' } });
  assert.equal((await f.call('photo/' + id)).status, 200);
  await f.call('posts/' + ref, { method: 'DELETE', who: 1 });
  assert.equal((await f.call('photo/' + id)).status, 404); assert.equal((await f.call('photo/' + id, { who: 1 })).status, 404);
  const temp = (await f.upload(1)).json.photo.id;
  f.db.prepare("UPDATE community_posts SET updated_at = '2026-01-01 00:00:00'").run();
  f.db.prepare("UPDATE community_photos SET created_at = '2026-01-01 00:00:00' WHERE id = ?").run(temp);
  await purgeDeleted(f.env);   // 기본: 지운 글도 DB에 보관
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n, 1);
  await purgeDeleted({ ...f.env, CUSTOMER_DATA_PURGE: 'on' });
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM community_photos').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n, 0);
});

test('임시 사진은 회원당 30장까지', async t => {
  const f = await fixture(t); await f.member(1);
  const ins = f.db.prepare("INSERT INTO community_photos (id, member_id, post_ref, mime, store, body, created_at) VALUES (?, 1, NULL, 'image/jpeg', 'd1', 'x', datetime('now'))");
  for (let i = 0; i < MAX_TEMP; i++) ins.run('t'.repeat(20) + String(i).padStart(2, '0'));
  const r = await f.upload(1); assert.equal(r.status, 429); assert.match(r.json.error, /30장/);
});

test('R2 버킷(MEDIA)을 연결하면 사진을 R2에 담고, 지울 때 함께 지운다', async t => {
  const f = await fixture(t, { r2: true }); await f.member(1);
  const id = (await f.upload(1)).json.photo.id;
  const row = f.db.prepare('SELECT store, body, thumb FROM community_photos').get();
  assert.deepEqual({ ...row }, { store: 'r2', body: null, thumb: null });
  assert.deepEqual([...f.objects.keys()].sort(), [`community/${id}`, `community/${id}_t`]);
  const got = await f.call('photo/' + id + '?t=1', { who: 1 });
  assert.equal(got.status, 200); assert.equal(got.res.headers.get('content-type'), 'image/jpeg'); assert.equal(new Uint8Array(await got.res.arrayBuffer()).length, 24);
  await f.call('photos/' + id, { method: 'DELETE', who: 1 });
  assert.equal(f.objects.size, 0);
});

test('글쓰기 화면이 사진 칸과 크게 보기를 갖고, 사진 주소 칸은 대체 방법으로 남는다', () => {
  const js = read('assets/js/pages/community.js');
  for (const s of ["api('photos',{ method:'POST'", 'o.photos=photos.ids()', 'function lightbox(', "accept=\"image/*\" multiple", 'name="cover_url"', 'imageOrientation']) assert.ok(js.includes(s), s);
  for (const page of ['community/write/index.html', 'community/groups/view/index.html', 'community/groups/index.html'])
    assert.match(read(page), /community\.js\?v=[0-9a-f]{12}"/, page);   // 판 번호는 tools/asset-version.mjs 가 파일 내용에 맞춤
  assert.match(read('functions/api/_middleware.js'), /\/api\/community\/photo\//);
});
