// 커뮤니티 API — 모임 소개 게시판 · 자유게시판 (2026-11-17)
//  공개   GET  /api/community/home                       커뮤니티 첫 화면 (추천·새 모임, 자유게시판 새 글·많이 본 글)
//         GET  /api/community/list?board=group|free&cat=&q=&sort=new|popular|comments|views&page=&size=&recruiting=1&venue=megaspot
//         GET  /api/community/meta                       게시 방식·게시판 안내 문구
//         GET  /api/community/posts/<CG|CF-…>            글 + 댓글 (내 글이면 검토 중이어도 보임)
//         GET  /api/community/posts/<CG-…>/contact       모임 소개의 전화·이메일 ('연락처 보기')
//  회원   POST /api/community/posts                      글쓰기 · PUT /posts/<번호> 고치기 · PATCH /posts/<번호> {recruiting} · DELETE /posts/<번호>
//         POST /api/community/posts/<번호>/like · POST /posts/<번호>/comments · DELETE /comments/<id> · POST /report · GET /mine
//         POST /api/community/photos {body, thumb, w, h}  모임 사진 올리기(임시) · DELETE /photos/<번호> 아직 글에 붙지 않은 사진 지우기
//  사진   GET  /api/community/photo/<번호>[?t=1]          게시 중인 글의 사진은 누구나, 그 밖에는 쓴 회원·관리자만
//  관리자 /api/community/admin/* (관리자 로그인 필요) — summary · posts · bulk · comments · reports · settings · block
import { json, err, hasDb, readJson, num, getMember, clientIp, tooMany, hit, sameOrigin, requireAdmin, log, getCookie } from '../_lib.js';
import { savePhoto, removeTemp, servePhoto, UPLOADS_PER_HOUR } from '../_community_photos.js';
import { POST_REF, BOARDS, GROUP_CATS, FREE_CATS, STATUS, CYCLES, SIZES, VENUES, REPORT_REASONS, getConfig, saveConfig, setBlocked, blockedList,
  listPosts, homeFeed, postDetail, contactOf, createPost, updatePost, deletePost, myPosts, toggleLike, addComment, deleteComment, report,
  adminSummary, adminList, adminDetail, adminCreate, adminPatch, adminBulk, adminComments, adminCommentStatus, adminReply, adminReports, adminReport } from '../_community.js';

const fail = r => err(r.error, r.status || 400, r.code || 'ERR');
const out = r => r.error ? fail(r) : json(r);
const tooManyErr = () => err('짧은 시간에 너무 많이 요청했습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
async function limited(env, key, n, min) { try { if (await tooMany(env, key, n, min)) return true; await hit(env, key, min); } catch {} return false; }
const loginErr = () => err('로그인한 회원만 쓸 수 있습니다. 로그인한 뒤 다시 시도해 주세요.', 401, 'LOGIN');

async function admin(request, env, path, method, url) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (method !== 'GET' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'ORIGIN');
  const q = Object.fromEntries(url.searchParams);
  if (path === 'summary' && method === 'GET') return json({ ok: true, ...(await adminSummary(env)) });
  if (path === 'posts' && method === 'GET') return json({ ok: true, ...(await adminList(env, q)) });
  if (path === 'posts' && method === 'POST') return out(await adminCreate(env, await readJson(request, 64 * 1024)));
  if (path === 'bulk' && method === 'POST') return out(await adminBulk(env, await readJson(request)));
  let m = path.match(/^posts\/(C[GF]-\d{4}-[A-Z0-9]{4})$/);
  if (m && method === 'GET') { const d = await adminDetail(env, m[1]); return d ? json({ ok: true, ...d }) : err('글을 찾을 수 없습니다.', 404, 'NOT_FOUND'); }
  if (m && method === 'PATCH') return out(await adminPatch(env, m[1], await readJson(request, 64 * 1024)));
  m = path.match(/^posts\/(C[GF]-\d{4}-[A-Z0-9]{4})\/reply$/);
  if (m && method === 'POST') return out(await adminReply(env, m[1], (await readJson(request)).body));
  if (path === 'comments' && method === 'GET') return json({ ok: true, ...(await adminComments(env, q)) });
  m = path.match(/^comments\/(\d{1,9})$/);
  if (m && method === 'PATCH') return out(await adminCommentStatus(env, +m[1], (await readJson(request)).status));
  if (path === 'reports' && method === 'GET') return json({ ok: true, ...(await adminReports(env, q)) });
  m = path.match(/^reports\/(\d{1,9})$/);
  if (m && method === 'PATCH') return out(await adminReport(env, +m[1], await readJson(request)));
  if (path === 'settings' && method === 'GET') return json({ ok: true, config: await getConfig(env), blocked: await blockedList(env) });
  if (path === 'settings' && method === 'PUT') { const r = await saveConfig(env, await readJson(request, 64 * 1024)); if (!r.error) await log(env, 'community.settings', '', 'admin', {}); return out(r); }
  if (path === 'block' && method === 'POST') {
    const d = await readJson(request), r = await setBlocked(env, d.member_id, !!d.on, d.reason);
    if (!r.error) await log(env, 'community.block', String(num(d.member_id) || ''), 'admin', { on: !!d.on });
    return r.error ? fail(r) : json({ ok: true, blocked: await blockedList(env) });
  }
  return err('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
}

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const parts = params.path || [], path = parts.join('/'), method = request.method.toUpperCase(), url = new URL(request.url);
  try {
    if (parts[0] === 'admin') return await admin(request, env, parts.slice(1).join('/'), method, url);
    if (method !== 'GET' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN');
    const q = Object.fromEntries(url.searchParams);
    let pm = path.match(/^photo\/([A-Za-z0-9_-]{1,40})$/);
    if (pm && method === 'GET') return await servePhoto(env, request, pm[1], q.t === '1');
    if (path === 'home' && method === 'GET') return json({ ok: true, ...(await homeFeed(env)) }, 200, { 'cache-control': 'public, max-age=30' });
    if (path === 'list' && method === 'GET') {
      const [r, cfg] = await Promise.all([listPosts(env, q), getConfig(env)]);
      return json({ ok: true, ...r, notice: cfg.notice[r.board] || '', mode: cfg[r.board].mode }, 200, { 'cache-control': 'public, max-age=20' });
    }
    if (path === 'meta' && method === 'GET') {
      const cfg = await getConfig(env);
      return json({ ok: true, modes: { group: cfg.group.mode, free: cfg.free.mode }, comments: { group: cfg.group.comments, free: cfg.free.comments }, notice: cfg.notice,
        labels: { boards: BOARDS, group: GROUP_CATS, free: FREE_CATS, status: STATUS, cycles: CYCLES, sizes: SIZES, venues: VENUES, reasons: REPORT_REASONS } });
    }
    const member = await getMember(request, env);
    let m = path.match(/^posts\/([A-Za-z0-9-]{1,20})(?:\/(contact|like|comments))?$/);
    if (m) {
      const ref = m[1].toUpperCase();
      if (!POST_REF.test(ref)) return err('글을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (!m[2] && method === 'GET') {
        let d = await postDetail(env, ref, member);
        // 관리자로 로그인한 브라우저는 검토 대기·숨김 글도 공개 화면 그대로 미리 봅니다(사진 확인용)
        if (!d && getCookie(request, 'ms_admin') && !(await requireAdmin(request, env))) d = await postDetail(env, ref, member, { preview: true });
        return d ? json({ ok: true, ...d }, 200, { 'cache-control': 'no-store' }) : err('글을 찾을 수 없거나 아직 게시되지 않았습니다.', 404, 'NOT_FOUND');
      }
      if (m[2] === 'contact' && method === 'GET') {
        if (await limited(env, 'ccontact:' + clientIp(request), 30, 10)) return tooManyErr();
        const c = await contactOf(env, ref); return c ? json({ ok: true, ...c }, 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }) : err('연락처를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      }
      if (!member) return loginErr();
      if (!m[2] && method === 'PUT') return out(await updatePost(env, member, ref, await readJson(request, 32 * 1024)));
      if (!m[2] && method === 'PATCH') { const d = await readJson(request); return out(await updatePost(env, member, ref, { recruiting: !!d.recruiting })); }
      if (!m[2] && method === 'DELETE') return out(await deletePost(env, member, ref));
      if (m[2] === 'like' && method === 'POST') { if (await limited(env, 'clike:' + member.id, 60, 10)) return tooManyErr(); return out(await toggleLike(env, member, ref)); }
      if (m[2] === 'comments' && method === 'POST') {
        const d = await readJson(request, 8 * 1024); if (d.website) return json({ ok: true, comment: null });
        if (await limited(env, 'ccomment:' + member.id, 15, 10)) return tooManyErr();
        return out(await addComment(env, member, ref, d));
      }
    }
    if (path === 'posts' && method === 'POST') {
      if (!member) return loginErr();
      const d = await readJson(request, 32 * 1024);
      if (d.website) return json({ ok: true, ref: 'CF-0000-SPAM', status: 'pending' });
      // 모임 소개는 하루 3개, 자유게시판은 한 시간에 6개까지 (실제로 올라간 글만 셉니다) · 잘못 보낸 요청도 10분에 30번까지
      if (await limited(env, 'ctry:' + member.id, 30, 10)) return tooManyErr();
      const g = d.board === 'group', key = (g ? 'cpost:g:' : 'cpost:f:') + member.id, win = g ? 1440 : 60;
      try { if (await tooMany(env, key, g ? 3 : 6, win)) return tooManyErr(); } catch {}
      const r = await createPost(env, member, d);
      if (!r.error) { try { await hit(env, key, win); } catch {} }
      return out(r);
    }
    // 모임 사진 올리기 · 지우기 (회원)
    if (path === 'photos' && method === 'POST') {
      if (!member) return loginErr();
      const cfg = await getConfig(env);
      if (cfg.blocked.some(b => num(b.id) === num(member.id))) return err('커뮤니티 글쓰기가 제한된 계정입니다.', 403, 'BLOCKED');
      if (await limited(env, 'cphoto:' + member.id, UPLOADS_PER_HOUR, 60)) return err(`사진은 한 시간에 ${UPLOADS_PER_HOUR}장까지 올릴 수 있습니다. 잠시 후 다시 시도해 주세요.`, 429, 'TOO_MANY');
      return out(await savePhoto(env, member, await readJson(request, 1300 * 1024)));
    }
    pm = path.match(/^photos\/([A-Za-z0-9_-]{1,40})$/);
    if (pm && method === 'DELETE') { if (!member) return loginErr(); return out(await removeTemp(env, member, pm[1])); }
    m = path.match(/^comments\/(\d{1,9})$/);
    if (m && method === 'DELETE') { if (!member) return loginErr(); return out(await deleteComment(env, member, +m[1])); }
    if (path === 'report' && method === 'POST') {
      if (!member) return loginErr();
      if (await limited(env, 'creport:' + member.id, 20, 60)) return tooManyErr();
      return out(await report(env, member, await readJson(request, 8 * 1024)));
    }
    if (path === 'mine' && method === 'GET') { if (!member) return loginErr(); return json({ ok: true, ...(await myPosts(env, member)) }, 200, { 'cache-control': 'no-store' }); }
    return err('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
  } catch (e) {
    if (e && /요청이 너무 큽니다|잘못된 요청 형식/.test(e.message || '')) return err(e.message);
    console.error('community', e && e.message); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER');
  }
}
