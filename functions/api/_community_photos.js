// 커뮤니티 모임 사진 (2026-11-23)
//  · 회원이 글쓰기 화면에서 사진을 고르면 브라우저가 긴 변 1600px로 줄여(위치 정보 등 사진 속 정보는 지워짐) 한 장씩 올립니다.
//    올린 사진은 글에 붙기 전까지 '임시'이고, 글을 저장할 때 그 글에 붙습니다. 24시간 안에 글에 붙지 않은 사진은 지웁니다.
//  · 저장소: Cloudflare R2 버킷이 MEDIA 라는 이름으로 연결되어 있으면 R2에, 없으면 D1(사이트 데이터베이스)에 담습니다.
//    지금은 D1에 담고, 사진이 많아지면 대시보드에서 R2를 연결하기만 하면 그다음 사진부터 R2에 담깁니다(이미 올린 사진은 그대로 보임).
//  · 보여 주기: 게시 중인 글의 사진은 누구나, 검토 대기·숨김·반려 글의 사진은 쓴 회원과 관리자만, 지운 글의 사진은 아무도 볼 수 없습니다.
import { str, num, now, randomToken, getMember, requireAdmin, getCookie } from './_lib.js';

export const PHOTO_ID = /^[A-Za-z0-9_-]{22}$/;
export const MAX_PER_POST = 10;        // 글 하나에 붙일 수 있는 사진
export const MAX_TEMP = 30;            // 아직 글에 붙지 않은 사진 (회원 1명)
export const UPLOADS_PER_HOUR = 60;    // 한 시간에 올릴 수 있는 사진 (회원 1명)
export const TEMP_HOURS = 24;          // 글에 붙지 않은 사진을 지우는 시간
const BODY_MAX = 820000, THUMB_MAX = 124000;   // base64 글자 수 (약 600KB · 90KB)
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const photoUrl = (id, thumb) => '/api/community/photo/' + id + (thumb ? '?t=1' : '');
const bucket = env => env && env.MEDIA && typeof env.MEDIA.put === 'function' ? env.MEDIA : null;
const keyOf = (id, thumb) => 'community/' + id + (thumb ? '_t' : '');
const sqlTime = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

// 앞부분 바이트로 실제 이미지인지 확인 (JPEG·PNG·WebP)
export function imageKind(b64) {
  let h; try { h = atob(String(b64 || '').slice(0, 24)); } catch { return ''; }
  const c = i => h.charCodeAt(i);
  if (c(0) === 0xFF && c(1) === 0xD8 && c(2) === 0xFF) return 'image/jpeg';
  if (c(0) === 0x89 && h.slice(1, 4) === 'PNG') return 'image/png';
  if (h.slice(0, 4) === 'RIFF' && h.slice(8, 12) === 'WEBP') return 'image/webp';
  return '';
}
function bytesOf(b64) { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
const dims = v => { const n = num(v); return n && n > 0 && n <= 20000 ? n : null; };
export function publicPhoto(p) { return { id: p.id, src: photoUrl(p.id), thumb: photoUrl(p.id, true), w: p.w || null, h: p.h || null }; }

// ---------- 올리기 ----------
export async function savePhoto(env, member, d) {
  const body = str(d.body, 2000000).replace(/^data:[^,]*,/, ''), thumb = str(d.thumb, 400000).replace(/^data:[^,]*,/, '');
  if (!body || !B64.test(body)) return { error: '사진을 읽지 못했습니다. 다시 골라 주세요.' };
  if (body.length > BODY_MAX) return { error: '사진이 너무 큽니다. 다른 사진을 골라 주세요.', status: 413, code: 'TOO_LARGE' };
  const mime = imageKind(body); if (!mime) return { error: 'JPG·PNG·WebP 사진만 올릴 수 있습니다.', code: 'TYPE' };
  if (thumb && (thumb.length > THUMB_MAX || !B64.test(thumb) || !imageKind(thumb))) return { error: '사진을 처리하지 못했습니다. 다시 시도해 주세요.' };
  await purgeTemp(env).catch(() => {});
  const temp = await env.DB.prepare('SELECT COUNT(*) AS n FROM community_photos WHERE member_id = ? AND post_ref IS NULL').bind(member.id).first();
  if ((temp || {}).n >= MAX_TEMP) return { error: `아직 글에 붙지 않은 사진이 ${MAX_TEMP}장입니다. 쓰던 글을 먼저 저장하거나, 하루 뒤 다시 올려 주세요.`, status: 429, code: 'TOO_MANY' };
  const id = randomToken(16), b = bucket(env), w = dims(d.w), h = dims(d.h);
  let store = 'd1';
  if (b) {
    await b.put(keyOf(id), bytesOf(body), { httpMetadata: { contentType: mime, cacheControl: 'public, max-age=86400' } });
    if (thumb) await b.put(keyOf(id, true), bytesOf(thumb), { httpMetadata: { contentType: imageKind(thumb), cacheControl: 'public, max-age=86400' } });
    store = 'r2';
  }
  await env.DB.prepare('INSERT INTO community_photos (id, member_id, post_ref, sort, mime, thumb_mime, bytes, w, h, store, body, thumb, created_at) VALUES (?,?,NULL,0,?,?,?,?,?,?,?,?,?)')
    .bind(id, member.id, mime, thumb ? imageKind(thumb) : null, Math.floor(body.length * 3 / 4), w, h, store, store === 'd1' ? body : null, store === 'd1' && thumb ? thumb : null, now()).run();
  return { ok: true, photo: publicPhoto({ id, w, h }) };
}
// 아직 글에 붙지 않은 내 사진 지우기 (글에 붙은 사진은 글을 저장할 때 빠지면 지워집니다)
export async function removeTemp(env, member, id) {
  if (!PHOTO_ID.test(id)) return { error: '사진을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  const row = await env.DB.prepare('SELECT id, member_id, post_ref, store FROM community_photos WHERE id = ?').bind(id).first();
  if (!row || row.member_id !== member.id) return { error: '사진을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  if (row.post_ref) return { ok: true, attached: true };   // 글에 붙은 사진은 글을 저장할 때 정리합니다
  await dropPhotos(env, [row]);
  return { ok: true };
}

// ---------- 글에 붙이기 ----------
// 글쓰기·고치기에서 보낸 사진 번호를 확인합니다. 내 사진이면서 아직 글에 붙지 않았거나 이 글에 붙은 사진만 쓸 수 있습니다.
export async function pickPhotos(env, memberId, ref, ids) {
  if (!Array.isArray(ids)) return { list: null };
  const want = [...new Set(ids.map(x => String(x && x.id || x || '')).filter(Boolean))];
  if (want.length > MAX_PER_POST) return { error: `사진은 글 하나에 ${MAX_PER_POST}장까지 붙일 수 있습니다.` };
  if (!want.length) return { list: [] };
  if (want.some(id => !PHOTO_ID.test(id))) return { error: '사진 정보를 확인하지 못했습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.' };
  const { results } = await env.DB.prepare('SELECT id, member_id, post_ref, w, h FROM community_photos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(want)).all();
  const map = Object.fromEntries((results || []).map(r => [r.id, r]));
  const ok = want.filter(id => { const r = map[id]; return r && memberId && r.member_id === memberId && (r.post_ref === null || r.post_ref === undefined || r.post_ref === ref); });
  if (ok.length < want.length) return { error: `사진 ${want.length - ok.length}장을 찾지 못했습니다. 올린 지 하루가 지난 사진은 지워지니, 빠진 사진을 다시 올려 주세요.`, code: 'PHOTO_MISSING' };
  return { list: ok.map(id => ({ id, w: map[id].w || null, h: map[id].h || null })) };
}
export async function attachPhotos(env, ref, list, prevIds = []) {
  const t = now();
  for (let i = 0; i < list.length; i++)
    await env.DB.prepare('UPDATE community_photos SET post_ref = ?, sort = ?, attached_at = COALESCE(attached_at, ?) WHERE id = ?').bind(ref, i + 1, t, list[i].id).run();
  const keep = new Set(list.map(p => p.id)), gone = prevIds.filter(id => !keep.has(id));
  if (gone.length) {
    const { results } = await env.DB.prepare('SELECT id, store FROM community_photos WHERE post_ref = ? AND id IN (SELECT value FROM json_each(?))').bind(ref, JSON.stringify(gone)).all();
    await dropPhotos(env, results || []);
  }
}

// ---------- 지우기 ----------
async function dropPhotos(env, rows) {
  if (!rows.length) return 0;
  const b = bucket(env), r2 = rows.filter(r => r.store === 'r2');
  if (b && r2.length) { try { await b.delete(r2.flatMap(r => [keyOf(r.id), keyOf(r.id, true)])); } catch (e) { console.error('community photo r2 delete', e && e.message); } }
  await env.DB.prepare('DELETE FROM community_photos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(rows.map(r => r.id))).run();
  return rows.length;
}
// 글에 붙지 않은 지 하루가 지난 사진
export async function purgeTemp(env) {
  const { results } = await env.DB.prepare('SELECT id, store FROM community_photos WHERE post_ref IS NULL AND created_at < ? LIMIT 100').bind(sqlTime(Date.now() - TEMP_HOURS * 3600e3)).all();
  return dropPhotos(env, results || []);
}
// 완전히 지운 글(30일 지난 삭제 글)의 사진과, 글이 없어진 사진
export async function purgePhotosOf(env, refs) {
  let n = 0;
  if (refs && refs.length) {
    const { results } = await env.DB.prepare('SELECT id, store FROM community_photos WHERE post_ref IN (SELECT value FROM json_each(?))').bind(JSON.stringify(refs)).all();
    n += await dropPhotos(env, results || []);
  }
  const { results: orphan } = await env.DB.prepare('SELECT id, store FROM community_photos WHERE post_ref IS NOT NULL AND post_ref NOT IN (SELECT ref FROM community_posts) LIMIT 100').all();
  n += await dropPhotos(env, orphan || []);
  n += await purgeTemp(env);
  return n;
}

// ---------- 보여 주기 ----------
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
export async function servePhoto(env, request, id, wantThumb) {
  if (!PHOTO_ID.test(id)) return notFound();
  const row = await env.DB.prepare(`SELECT p.id, p.member_id, p.post_ref, p.mime, p.thumb_mime, p.store, CASE WHEN ? = 1 AND p.thumb IS NOT NULL THEN p.thumb ELSE p.body END AS data,
      p.thumb IS NOT NULL AS has_thumb, c.status AS post_status, c.publish_at AS publish_at
    FROM community_photos p LEFT JOIN community_posts c ON c.ref = p.post_ref WHERE p.id = ?`).bind(wantThumb ? 1 : 0, id).first();
  if (!row) return notFound();
  const live = row.post_ref && row.post_status === 'published' && (row.publish_at || '') <= now();
  if (!live) {
    if (row.post_ref && (!row.post_status || row.post_status === 'deleted')) return notFound();
    const member = await getMember(request, env);
    const owner = !!(member && row.member_id && member.id === row.member_id);
    const admin = !owner && !!getCookie(request, 'ms_admin') && !(await requireAdmin(request, env));
    if (!owner && !admin) return notFound();
  }
  const headers = { 'cache-control': live ? 'public, max-age=86400' : 'private, no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex', 'content-disposition': 'inline' };
  if (row.store === 'r2') {
    const b = bucket(env); if (!b) return notFound();
    let obj = wantThumb ? await b.get(keyOf(id, true)) : null;
    const thumbHit = !!obj;
    if (!obj) obj = await b.get(keyOf(id)); if (!obj) return notFound();
    return new Response(obj.body, { headers: { ...headers, 'content-type': thumbHit ? (row.thumb_mime || 'image/jpeg') : row.mime } });
  }
  if (!row.data) return notFound();
  const thumbHit = wantThumb && row.has_thumb;
  return new Response(bytesOf(row.data), { headers: { ...headers, 'content-type': thumbHit ? (row.thumb_mime || 'image/jpeg') : row.mime } });
}
