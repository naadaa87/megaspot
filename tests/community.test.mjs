// 커뮤니티(모임 소개 게시판 · 자유게시판) 점검 (2026-11-17)
//  · 글쓰기는 회원만 · 모임 소개는 운영팀 확인 뒤 게시, 자유게시판은 바로 게시 · 링크·문의처 확인 · 금지어 · 글쓰기 제한
//  · 내 글 고치기(링크가 바뀌면 다시 검토) · 모집 중 표시 · 삭제 · 공감 · 댓글 · 신고와 자동 숨김 · 연락처 보기
//  · 관리자: 요약 · 목록 조건 · 게시/반려/숨김/고정/추천 · 예약 게시 · 운영팀 글·댓글 · 신고 처리 · 설정 · 탈퇴 회원 정리
//   node --test tests/community.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { onRequest as api } from '../functions/api/community/[[path]].js';
import { onRequest as auth } from '../functions/api/auth/[[path]].js';
import { sha256, hashPassword } from '../functions/api/_lib.js';
import { GROUP_CATS, FREE_CATS, REPORT_REASONS, CYCLES, SIZES, VENUES, kstInput } from '../functions/api/_community.js';

const ORIGIN = 'https://megaspot.test';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
async function fixture(t) {
  const db = new DatabaseSync(':memory:'); db.exec(read('schema.sql')); t.after(() => db.close());
  const env = { ADMIN_KEY: 'test-only', CONFIRM_SECRET: 'confirm-secret-for-tests-0123456789',
    DB: { prepare(sql) { const st = db.prepare(sql); let a = []; return { bind(...v) { a = v; return this; }, async first() { return st.get(...a) ?? null; }, async all() { return { results: st.all(...a) }; }, async run() { return st.run(...a); } }; } } };
  const member = async (id, name) => {
    db.prepare("INSERT INTO members (id, email, name, phone, pw_hash, agree_marketing, agreed_at, status, created_at) VALUES (?,?,?,?,?,0,'2026-01-01','active','2026-01-01')").run(id, `m${id}@example.com`, name || `회원${id}`, '010-0000-000' + id, await hashPassword('pass1234'));
    db.prepare("INSERT INTO sessions (token_hash, member_id, created_at, expires_at, ua) VALUES (?,?,'2026-01-01','2099-01-01','t')").run(await sha256('tok-' + id), id);
  };
  const call = async (path, { method = 'GET', body, who, admin = false, origin = ORIGIN } = {}) => {
    const headers = { 'content-type': 'application/json', origin };
    if (who) headers.cookie = 'ms_session=tok-' + who;
    if (admin) headers['x-admin-key'] = 'test-only';
    const res = await api({ env, params: { path: path.split('?')[0].split('/') }, request: new Request(ORIGIN + '/api/community/' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
    return { status: res.status, json: await res.json(), res };
  };
  return { db, env, call, member };
}
const GROUP = { board: 'group', title: '건대 보드게임 정기 모임', category: 'hobby', summary: '한 달에 한 번 큰 공간에서 보드게임을 즐깁니다', body: '매월 셋째 주 토요일 오후에 메가스팟 건대 1호에서 40명 정도 모여 보드게임을 합니다. 처음 오셔도 규칙을 알려 드려요.',
  region: '건대입구', cycle: 'monthly', schedule: '매월 셋째 주 토요일 오후 2시', size: 'm', fee: 'paid', fee_text: '회당 1만 원', venue: 'megaspot-gundae', join_url: 'https://open.kakao.com/o/gAbCdEf', contact_phone: '010-1234-5678', contact_email: 'board@example.com', kakao_id: 'boardgame_kd',
  tags: '보드게임, 정기모임, #건대', agree_public: true, agree_rules: true, author: '보드지기' };
const FREE = { board: 'free', title: '200명 송년회 준비하면서 배운 것', category: 'tip', body: '케이터링은 3주 전에 정해야 원하는 메뉴를 고를 수 있었어요.', agree_rules: true, author: '송년회담당' };

test('화면 분류 값이 서버와 같다', () => {
  const ctx = { window: {}, document: { querySelector() { return null; }, addEventListener() {} } };
  vm.runInNewContext(read('assets/js/pages/community.js').split('/*@@CONST-END@@*/')[0] + '\n;window.__C=C;', ctx);
  const C = ctx.window.__C;
  assert.deepEqual({ ...C.GROUP_CATS }, GROUP_CATS); assert.deepEqual({ ...C.FREE_CATS }, FREE_CATS); assert.deepEqual({ ...C.REASONS }, REPORT_REASONS);
  assert.deepEqual({ ...C.CYCLES }, CYCLES); assert.deepEqual({ ...C.SIZES }, SIZES); assert.deepEqual({ ...C.VENUES }, VENUES);
});

test('글쓰기는 회원만, 다른 사이트에서 보낸 요청은 막는다', async t => {
  const f = await fixture(t); await f.member(1);
  assert.equal((await f.call('posts', { method: 'POST', body: FREE })).status, 401);
  assert.equal((await f.call('posts', { method: 'POST', body: FREE, who: 1, origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.call('mine')).status, 401);
});

test('모임 소개: 검토 뒤 게시, 링크·문의처 확인, 연락처는 따로 보기', async t => {
  const f = await fixture(t); await f.member(1, '김모임'); await f.member(2, '이참여');
  let r = await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, join_url: 'javascript:alert(1)' } });
  assert.equal(r.status, 400); assert.match(r.json.error, /https/);
  r = await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, join_url: '', contact_phone: '', contact_email: '', kakao_id: '' } });
  assert.match(r.json.error, /참여 링크나 문의처/);
  r = await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, agree_public: false } });
  assert.match(r.json.error, /공개/);
  r = await f.call('posts', { method: 'POST', who: 1, body: { ...GROUP, author: '메가스팟 매니저' } });
  assert.match(r.json.error, /쓸 수 없습니다/);
  r = await f.call('posts', { method: 'POST', who: 1, body: GROUP });
  assert.equal(r.status, 200); assert.equal(r.json.status, 'pending'); assert.match(r.json.ref, /^CG-\d{4}-[A-Z0-9]{4}$/);
  const ref = r.json.ref;
  // 검토 전에는 목록·다른 사람에게 안 보이고, 쓴 사람에게는 보인다
  assert.equal((await f.call('list?board=group')).json.total, 0);
  assert.equal((await f.call('posts/' + ref, { who: 2 })).status, 404);
  const own = await f.call('posts/' + ref, { who: 1 });
  assert.equal(own.status, 200); assert.equal(own.json.item.status, 'pending'); assert.equal(own.json.me.owner, true);
  // 운영팀 게시
  r = await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'published', featured: true } });
  assert.equal(r.status, 200);
  const list = await f.call('list?board=group&venue=megaspot&recruiting=1');
  assert.equal(list.json.total, 1);
  const card = list.json.items[0];
  assert.equal(card.join.kind, 'kakao_open'); assert.equal(card.join.label, '오픈채팅방 참여하기'); assert.equal(card.join.site, '카카오톡 오픈채팅');
  assert.deepEqual(card.tags, ['보드게임', '정기모임', '건대']);
  assert.equal(card.featured, true); assert.equal(card.venue_label, '메가스팟 건대 1호');
  const view = await f.call('posts/' + ref, { who: 2 });
  const raw = JSON.stringify(view.json);
  assert.ok(!raw.includes('010-1234-5678') && !raw.includes('board@example.com'), '전화·이메일은 상세 원문에 넣지 않음');
  assert.equal(view.json.item.contact.has_phone, true); assert.equal(view.json.item.contact.kakao_id, 'boardgame_kd');
  assert.equal(view.json.item.views, 1);
  const c = await f.call('posts/' + ref + '/contact');
  assert.equal(c.json.phone, '010-1234-5678'); assert.equal(c.json.email, 'board@example.com');
  assert.equal(c.res.headers.get('cache-control'), 'no-store');
  // 홈 화면
  const home = await f.call('home');
  assert.equal(home.json.featured.length, 1); assert.equal(home.json.counts.groups, 1);
});

test('모임 소개 고치기: 글만 고치면 게시 유지(확인 표시), 링크가 바뀌면 다시 검토 · 모집 중 표시 · 삭제', async t => {
  const f = await fixture(t); await f.member(1);
  const ref = (await f.call('posts', { method: 'POST', who: 1, body: GROUP })).json.ref;
  await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'published' } });
  let r = await f.call('posts/' + ref, { method: 'PUT', who: 1, body: { ...GROUP, summary: '한 달에 한 번, 40명이 모여 보드게임을 합니다' } });
  assert.equal(r.json.status, 'published');
  assert.equal((await f.call('admin/posts?flag=recheck', { admin: true })).json.total, 1);
  r = await f.call('posts/' + ref, { method: 'PUT', who: 1, body: { ...GROUP, join_url: 'https://band.us/band/123' } });
  assert.equal(r.json.status, 'pending'); assert.match(r.json.note, /다시 확인/);
  await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'published' } });
  r = await f.call('posts/' + ref, { method: 'PATCH', who: 1, body: { recruiting: false } });
  assert.equal(r.json.recruiting, false);
  assert.equal((await f.call('list?board=group&recruiting=1')).json.total, 0);
  assert.equal((await f.call('list?board=group')).json.items[0].recruiting, false);
  // 다른 회원은 고치거나 지울 수 없음
  await f.member(2);
  assert.equal((await f.call('posts/' + ref, { method: 'DELETE', who: 2 })).status, 404);
  assert.equal((await f.call('posts/' + ref, { method: 'DELETE', who: 1 })).status, 200);
  assert.equal((await f.call('list?board=group')).json.total, 0);
  assert.equal((await f.call('mine', { who: 1 })).json.items.length, 0);
});

test('반려하면 이유가 내 글에 보이고, 고치면 다시 검토 대기', async t => {
  const f = await fixture(t); await f.member(1);
  const ref = (await f.call('posts', { method: 'POST', who: 1, body: GROUP })).json.ref;
  assert.match((await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'rejected' } })).json.error, /반려 이유/);
  await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'rejected', reject_reason: '참여 링크가 열리지 않습니다.' } });
  let mine = (await f.call('mine', { who: 1 })).json.items[0];
  assert.equal(mine.status, 'rejected'); assert.equal(mine.reject_reason, '참여 링크가 열리지 않습니다.');
  const r = await f.call('posts/' + ref, { method: 'PUT', who: 1, body: GROUP });
  assert.equal(r.json.status, 'pending');
  mine = (await f.call('mine', { who: 1 })).json.items[0]; assert.equal(mine.reject_reason, '');
});

test('자유게시판: 바로 게시 · 링크 수 · 금지어 · 같은 글 반복 · 공지 말머리는 운영팀만', async t => {
  const f = await fixture(t); await f.member(1);
  assert.match((await f.call('posts', { method: 'POST', who: 1, body: { ...FREE, category: 'notice' } })).json.error, /말머리/);
  assert.match((await f.call('posts', { method: 'POST', who: 1, body: { ...FREE, body: 'https://a.kr https://b.kr https://c.kr https://d.kr' } })).json.error, /3개/);
  let r = await f.call('posts', { method: 'POST', who: 1, body: FREE });
  assert.equal(r.json.status, 'published'); assert.match(r.json.ref, /^CF-/);
  assert.equal((await f.call('posts', { method: 'POST', who: 1, body: FREE })).status, 409);
  await f.call('admin/settings', { method: 'PUT', admin: true, body: { banned: '도박\n대출' } });
  assert.match((await f.call('posts', { method: 'POST', who: 1, body: { ...FREE, title: '급전 대출 안내' } })).json.error, /대출/);
  const l = await f.call('list?board=free');
  assert.equal(l.json.total, 1); assert.equal(l.json.items[0].excerpt.slice(0, 5), '케이터링은'); assert.equal(l.json.items[0].author, '송년회담당');
  assert.equal(l.json.items[0].body, undefined, '목록에는 본문 전체를 싣지 않음');
  // 별명을 비우면 이름을 가려서 씀
  r = await f.call('posts', { method: 'POST', who: 1, body: { ...FREE, title: '질문 있어요', category: 'question', author: '' } });
  assert.equal((await f.call('posts/' + r.json.ref)).json.item.author, '회*1');
});

test('공감 · 댓글 · 신고 · 자동 숨김', async t => {
  const f = await fixture(t); for (const id of [1, 2, 3, 4, 5]) await f.member(id);
  const ref = (await f.call('posts', { method: 'POST', who: 1, body: FREE })).json.ref;
  assert.equal((await f.call('posts/' + ref + '/like', { method: 'POST', who: 1 })).status, 409);
  let r = await f.call('posts/' + ref + '/like', { method: 'POST', who: 2 }); assert.deepEqual([r.json.liked, r.json.likes], [true, 1]);
  r = await f.call('posts/' + ref + '/like', { method: 'POST', who: 2 }); assert.deepEqual([r.json.liked, r.json.likes], [false, 0]);
  await f.call('posts/' + ref + '/like', { method: 'POST', who: 3 });
  r = await f.call('posts/' + ref + '/comments', { method: 'POST', who: 2, body: { body: '좋은 정보 감사합니다!', author: '참여자' } });
  assert.equal(r.status, 200); const cid = r.json.comment.id; assert.ok(cid > 0);
  await f.call('posts/' + ref + '/comments', { method: 'POST', who: 1, body: { body: '도움이 됐다니 다행이에요.' } });
  let v = await f.call('posts/' + ref, { who: 3 });
  assert.equal(v.json.item.comments, 2); assert.equal(v.json.item.likes, 1); assert.equal(v.json.me.liked, true);
  assert.equal(v.json.comments[1].writer, true, '글쓴이 댓글 표시');
  // 댓글 삭제는 쓴 사람만
  assert.equal((await f.call('comments/' + cid, { method: 'DELETE', who: 3 })).status, 404);
  assert.equal((await f.call('comments/' + cid, { method: 'DELETE', who: 2 })).status, 200);
  assert.equal((await f.call('posts/' + ref)).json.item.comments, 1);
  // 신고: 자기 글은 안 됨, 같은 사람이 두 번 해도 한 번, 서로 다른 3명이면 숨김
  assert.equal((await f.call('report', { method: 'POST', who: 1, body: { ref, reason: 'spam' } })).status, 409);
  r = await f.call('report', { method: 'POST', who: 2, body: { ref, reason: 'spam', detail: '광고 같아요' } }); assert.equal(r.json.hidden, false);
  assert.equal((await f.call('report', { method: 'POST', who: 2, body: { ref, reason: 'spam' } })).json.already, true);
  await f.call('report', { method: 'POST', who: 3, body: { ref, reason: 'abuse' } });
  r = await f.call('report', { method: 'POST', who: 4, body: { ref, reason: 'scam' } }); assert.equal(r.json.hidden, true);
  assert.equal((await f.call('posts/' + ref, { who: 5 })).status, 404);
  const s = (await f.call('admin/summary', { admin: true })).json;
  assert.equal(s.hidden, 1); assert.equal(s.reports_new, 3);
  // 신고 처리: 문제 없음 → 신고 수가 줄고, 운영팀이 다시 게시
  const reps = (await f.call('admin/reports?status=new', { admin: true })).json.items;
  assert.equal(reps.length, 3); assert.equal(reps[0].reason_label.length > 0, true);
  await f.call('admin/reports/' + reps[0].id, { method: 'PATCH', admin: true, body: { status: 'dismissed' } });
  assert.equal((await f.call('admin/summary', { admin: true })).json.reports_new, 0, '같은 대상의 새 신고를 한꺼번에 닫음');
  await f.call('admin/posts/' + ref, { method: 'PATCH', admin: true, body: { status: 'published' } });
  assert.equal((await f.call('posts/' + ref, { who: 5 })).status, 200);
});

test('관리자: 운영팀 공지 · 예약 게시 · 임시 저장 · 고정 · 운영팀 댓글 · 댓글 숨김 · 묶음 처리', async t => {
  const f = await fixture(t); await f.member(1);
  assert.equal((await f.call('admin/summary')).status, 401);
  let r = await f.call('admin/posts', { method: 'POST', admin: true, body: { board: 'free', category: 'notice', title: '커뮤니티를 열었습니다', body: '메가스팟을 이용하는 분들이 모임을 알리고 이야기를 나누는 곳입니다.', pinned: true } });
  assert.equal(r.status, 200); const notice = r.json.ref;
  const later = new Date(Date.now() + 9 * 3600e3 + 3 * 864e5).toISOString().slice(0, 16);
  r = await f.call('admin/posts', { method: 'POST', admin: true, body: { board: 'free', category: 'tip', title: '연말 행사 준비 체크리스트', body: '3주 전에 할 일부터 정리했습니다.', publish_at: later } });
  assert.equal(r.json.scheduled, true); const sched = r.json.ref;
  r = await f.call('admin/posts', { method: 'POST', admin: true, body: { board: 'free', category: 'talk', title: '임시 글', body: '아직 쓰는 중입니다.', status: 'draft' } });
  const draft = r.json.ref;
  await f.call('posts', { method: 'POST', who: 1, body: FREE });
  let l = (await f.call('list?board=free')).json;
  assert.equal(l.pinned.length, 1); assert.equal(l.pinned[0].ref, notice); assert.equal(l.pinned[0].official, true); assert.equal(l.pinned[0].author, '메가스팟 운영팀');
  assert.equal(l.total, 1, '고정 글·예약 글·임시 저장 글은 목록 번호에서 빠짐');
  const s = (await f.call('admin/summary', { admin: true })).json; assert.equal(s.scheduled, 1); assert.equal(s.draft, 1);
  assert.equal((await f.call('admin/posts?status=scheduled', { admin: true })).json.items[0].ref, sched);
  // 예약 시각을 지금으로 당기면 바로 보임
  await f.call('admin/posts/' + sched, { method: 'PATCH', admin: true, body: { publish_at: new Date(Date.now() + 9 * 3600e3 - 60e3).toISOString().slice(0, 16) } });
  await f.call('admin/posts/' + draft, { method: 'PATCH', admin: true, body: { status: 'published' } });
  l = (await f.call('list?board=free')).json; assert.equal(l.total, 3);
  // 운영팀 댓글과 댓글 숨김
  await f.call('admin/posts/' + draft + '/reply', { method: 'POST', admin: true, body: { body: '운영팀이 확인했습니다.' } });
  const det = (await f.call('admin/posts/' + draft, { admin: true })).json;
  assert.equal(det.comments[0].official, true);
  await f.call('admin/comments/' + det.comments[0].id, { method: 'PATCH', admin: true, body: { status: 'hidden' } });
  assert.equal((await f.call('posts/' + draft)).json.item.comments, 0);
  assert.equal((await f.call('admin/comments?status=hidden', { admin: true })).json.total, 1);
  // 묶음 처리
  r = await f.call('admin/bulk', { method: 'POST', admin: true, body: { refs: [sched, draft], action: 'hide' } });
  assert.equal(r.json.done, 2);
  assert.equal((await f.call('list?board=free')).json.total, 1);
  // 숨겼던 글을 다시 게시하면 처음 게시 시각을 그대로 씀
  const before = f.db.prepare('SELECT publish_at FROM community_posts WHERE ref = ?').get(sched).publish_at;
  await f.call('admin/posts/' + sched, { method: 'PATCH', admin: true, body: { status: 'published' } });
  assert.equal(f.db.prepare('SELECT publish_at FROM community_posts WHERE ref = ?').get(sched).publish_at, before);
});

test('글쓰기 제한 · 게시 방식 설정 · 댓글 닫기', async t => {
  const f = await fixture(t); await f.member(1); await f.member(2);
  await f.call('admin/block', { method: 'POST', admin: true, body: { member_id: 1, on: true, reason: '광고 반복' } });
  let r = await f.call('posts', { method: 'POST', who: 1, body: FREE }); assert.equal(r.status, 403);
  const st = (await f.call('admin/settings', { admin: true })).json; assert.equal(st.blocked[0].name, '회원1');
  await f.call('admin/block', { method: 'POST', admin: true, body: { member_id: 1, on: false } });
  await f.call('admin/settings', { method: 'PUT', admin: true, body: { free: { mode: 'review', comments: false }, group: { mode: 'instant' } } });
  r = await f.call('posts', { method: 'POST', who: 1, body: FREE }); assert.equal(r.json.status, 'pending');
  r = await f.call('posts', { method: 'POST', who: 1, body: GROUP }); assert.equal(r.json.status, 'published');
  const g = r.json.ref;
  await f.call('admin/settings', { method: 'PUT', admin: true, body: { group: { comments: false } } });
  assert.equal((await f.call('posts/' + g + '/comments', { method: 'POST', who: 2, body: { body: '참여하고 싶어요' } })).status, 409);
  assert.match((await f.call('admin/settings', { method: 'PUT', admin: true, body: { auto_hide: 99 } })).json.error, /0~20/);
  const meta = (await f.call('meta')).json; assert.equal(meta.modes.free, 'review'); assert.equal(meta.comments.group, false);
});

test('탈퇴하면 글·댓글을 내리고, 기본은 보관 · 삭제를 켜면 30일 지난 삭제 글을 관리자 요약 때 지운다', async t => {
  const f = await fixture(t); await f.member(1); await f.member(2);
  const ref = (await f.call('posts', { method: 'POST', who: 1, body: FREE })).json.ref;
  const other = (await f.call('posts', { method: 'POST', who: 2, body: { ...FREE, title: '다른 글' } })).json.ref;
  await f.call('posts/' + other + '/comments', { method: 'POST', who: 1, body: { body: '탈퇴 전 댓글' } });
  const res = await auth({ env: f.env, params: { path: ['withdraw'] }, request: new Request(ORIGIN + '/api/auth/withdraw', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: 'ms_session=tok-1' }, body: JSON.stringify({ password: 'pass1234' }) }) });
  assert.equal(res.status, 200);
  assert.equal(f.db.prepare('SELECT status FROM community_posts WHERE ref = ?').get(ref).status, 'deleted');
  assert.equal((await f.call('posts/' + other)).json.comments.length, 0);
  f.db.prepare("UPDATE community_posts SET updated_at = '2020-01-01 00:00:00' WHERE ref = ?").run(ref);
  await f.call('admin/summary', { admin: true });
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM community_posts WHERE ref = ?').get(ref).n, 1);   // 기본: 보관
  f.env.CUSTOMER_DATA_PURGE = 'on';
  await f.call('admin/summary', { admin: true });
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM community_posts WHERE ref = ?').get(ref).n, 0);
});

test('검색어의 % _ 는 글자로만 찾고, 한국 시간 입력은 UTC 로 바꾼다', async t => {
  const f = await fixture(t); await f.member(1);
  await f.call('posts', { method: 'POST', who: 1, body: FREE });
  assert.equal((await f.call('list?board=free&q=%25')).json.total, 1, '% 만 넣으면 조건 없이 전체');
  assert.equal((await f.call('list?board=free&q=' + encodeURIComponent('케이터링'))).json.total, 1);
  assert.equal((await f.call('list?board=free&q=' + encodeURIComponent('없는말'))).json.total, 0);
  assert.equal(kstInput('2026-11-20T09:00'), '2026-11-20 00:00:00');
  assert.equal(kstInput('nope'), '');
});
