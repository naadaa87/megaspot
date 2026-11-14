// 공간 등록 대행 요청 — 호스트가 공간소개서·홈페이지 주소·공간 이름 몇 가지만 보내면 메가스팟 본사가 확인하고 공간 정보를 대신 채웁니다. (2026-11-14)
//  호스트: GET/POST /api/hosts/assist · PATCH /api/hosts/assist/AS-… · POST …/cancel
//          POST …/files (파일 시작) · POST …/files/<fid>/<번호> (조각 올리기) · POST …/files/<fid>/done · DELETE …/files/<fid>
//  본사:   GET /api/hq/assist[?status=] · PATCH /api/hq/assist/AS-… · GET /api/hq/assist/files/<fid>/<번호> (조각 내려받기)
//          POST /api/hq/assist/AS-…/act — 그 호스트의 호스트센터를 4시간 동안 대신 열기 (공간 정보·사진 화면만)
//  파일은 R2 없이 D1에 나눠 담습니다. 브라우저가 900KB씩 base64로 바꿔 올리고, 본사 화면도 조각을 받아 브라우저에서 합칩니다(서버 CPU를 적게 씀).
import { json, err, readJson, str, now, later, uniqueRef, log, randomToken, sha256, getCookie, withCookies } from './_lib.js';
import { safeJson, phoneOk } from './_platform.js';
import { SPACE_REF, SPACE_STATUS, hostCookies } from './_hostplat.js';

export const ASSIST_REF = /^AS-\d{4}-[A-Z0-9]{4}$/;
export const ASSIST_STATUS = { new: '접수', checking: '자료 확인', working: '등록 작업 중', confirm: '호스트 확인 요청', done: '완료', cancelled: '취소' };
const OPEN = ['new', 'checking', 'working', 'confirm'];
export const CONTACT_TIME = { any: '아무 때나', morning: '평일 오전', afternoon: '평일 오후', evening: '저녁', weekend: '주말' };
export const FILE_RULE = { chunk: 900000, maxFile: 20 * 1024 * 1024, maxTotal: 60 * 1024 * 1024, maxFiles: 10 };
const FID = /^[A-Za-z0-9_-]{16,40}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ACT_HOURS = 4;
// 받을 수 있는 파일: 확장자 → 앞부분 바이트 종류
const EXT = { pdf: 'pdf', ppt: 'ole', pptx: 'zip', doc: 'ole', docx: 'zip', hwp: 'ole', hwpx: 'zip', xls: 'ole', xlsx: 'zip', zip: 'zip',
  jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp', heic: 'heic', heif: 'heic', gif: 'gif' };
export const FILE_EXTS = Object.keys(EXT);
const MIME = { pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', hwp: 'application/x-hwp', hwpx: 'application/hwp+zip', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', gif: 'image/gif' };
const changes = r => Number(r?.meta?.changes ?? r?.changes ?? 0);
const extOf = name => (String(name).toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1] || '';
export function cleanName(name) {
  const s = String(name || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
  if (s.length <= 120) return s;
  const e = extOf(s); return s.slice(0, 110 - e.length) + '….' + e;
}
function head(b64) { try { return atob(b64.slice(0, 24)); } catch { return ''; } }
export function kindOk(ext, b64) {   // 확장자와 실제 파일 앞부분이 맞는지
  const h = head(b64), c = i => h.charCodeAt(i), k = EXT[ext];
  if (!h || !k) return false;
  if (k === 'pdf') return h.startsWith('%PDF');
  if (k === 'zip') return h.startsWith('PK\x03\x04') || h.startsWith('PK\x05\x06');
  if (k === 'ole') return c(0) === 0xD0 && c(1) === 0xCF && c(2) === 0x11 && c(3) === 0xE0;
  if (k === 'jpg') return c(0) === 0xFF && c(1) === 0xD8 && c(2) === 0xFF;
  if (k === 'png') return c(0) === 0x89 && h.slice(1, 4) === 'PNG';
  if (k === 'webp') return h.slice(0, 4) === 'RIFF' && h.slice(8, 12) === 'WEBP';
  if (k === 'heic') return h.slice(4, 8) === 'ftyp';
  if (k === 'gif') return h.startsWith('GIF8');
  return false;
}
// 홈페이지·SNS·다른 플랫폼·사진 폴더 주소 (http(s)만, 최대 8개)
export function cleanLinks(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(/[\n,]+/);
  const out = [];
  for (let s of list) {
    s = str(s, 400); if (!s) continue;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    try { const u = new URL(s); if (!/^https?:$/.test(u.protocol) || u.username || u.password || !u.hostname.includes('.')) continue; if (!out.includes(u.href)) out.push(u.href); } catch {}
    if (out.length >= 8) break;
  }
  return out;
}

// ---------- 본사가 대신 연 호스트센터 ----------
export async function actingOf(request, env) {
  const tok = getCookie(request, 'ms_host'); if (!tok) return null;
  return env.DB.prepare('SELECT a.req_ref, a.host_id, a.created_at, s.expires_at FROM host_assist_sessions a JOIN host_sessions s ON s.token_hash = a.token_hash WHERE a.token_hash = ?').bind(await sha256(tok)).first();
}
// 대신 작성할 때 열리는 범위: 공간 정보·사진·심사 요청과 대행 요청 확인뿐 (예약·고객·정산·이용료·계정·캘린더는 막음)
export function actingAllowed(path, method) {
  if (path === 'me' && method === 'GET') return true;
  if (path === 'assist' && method === 'GET') return true;
  if (path === 'spaces' && method === 'POST') return true;
  return /^spaces\/SP-\d{4}-[A-Z0-9]{4}(\/(photos(\/.*)?|submit))?$/.test(path);
}

function view(r, files = [], { hq = false } = {}) {
  const d = safeJson(r.data);
  const v = { ref: r.ref, status: r.status, status_label: ASSIST_STATUS[r.status] || r.status, open: OPEN.includes(r.status), space_ref: r.space_ref || '', name: r.name,
    address: d.address || '', links: Array.isArray(d.links) ? d.links : [], message: d.message || '', phone: d.phone || '', contact_time: d.contact_time || 'any', contact_label: CONTACT_TIME[d.contact_time] || CONTACT_TIME.any,
    hq_message: r.hq_message || '', files: files.filter(f => f.req_ref === r.ref && f.ready).map(f => ({ fid: f.fid, name: f.name, size: f.size, chunks: f.chunks, ext: extOf(f.name) })),
    created_at: r.created_at, updated_at: r.updated_at || '', done_at: r.done_at || '', agreed_at: d.agreed_at || '' };
  if (hq) Object.assign(v, { memo: r.memo || '', history: Array.isArray(d.history) ? d.history.slice(-20) : [] });
  return v;
}
async function filesOf(env, refs) {
  if (!refs.length) return [];
  const { results } = await env.DB.prepare(`SELECT fid, req_ref, name, size, chunks, created_at, (SELECT COUNT(*) FROM host_assist_chunks c WHERE c.fid = f.fid) = f.chunks AS ready
    FROM host_assist_files f WHERE req_ref IN (${refs.map(() => '?').join(',')}) ORDER BY created_at, fid`).bind(...refs).all();
  return (results || []).map(f => ({ ...f, ready: !!f.ready && f.ready !== '0' }));
}
async function dropFile(env, fid) {
  await env.DB.prepare('DELETE FROM host_assist_chunks WHERE fid = ?').bind(fid).run();
  await env.DB.prepare('DELETE FROM host_assist_files WHERE fid = ?').bind(fid).run();
}
function pushHistory(d, who, text) { const h = Array.isArray(d.history) ? d.history : []; h.push({ at: now(), who, text: str(text, 200) }); d.history = h.slice(-40); return d; }

// ---------- 호스트 ----------
export async function hostAssist({ env, request, host, path, method, acting }) {
  const parts = path.split('/'), t = now();
  if (path === 'assist' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM host_assist WHERE host_id = ? AND (status IN (${OPEN.map(() => '?').join(',')}) OR COALESCE(done_at, updated_at, created_at) >= ?) ORDER BY id DESC LIMIT 20`)
      .bind(host.id, ...OPEN, later(-30)).all();
    const files = await filesOf(env, (results || []).map(r => r.ref));
    let act = null;
    if (acting) act = { ref: acting.req_ref, until: acting.expires_at };
    return json({ ok: true, items: (results || []).map(r => view(r, files)), statuses: ASSIST_STATUS, contact_times: CONTACT_TIME, rule: { ...FILE_RULE, exts: FILE_EXTS }, acting: act });
  }
  if (path === 'assist' && method === 'POST') {
    const d = await readJson(request);
    const name = str(d.name, 60), phone = phoneOk(d.phone) || phoneOk(host.phone);
    if (!name) return err('공간 이름을 적어 주세요.');
    if (!d.agree) return err('자료 사용 동의에 체크해 주세요.');
    if (!phone) return err('연락 받을 번호를 확인해 주세요.');
    let spaceRef = null;
    if (d.space) {
      const sp = await env.DB.prepare('SELECT ref, status FROM host_spaces WHERE ref = ? AND host_id = ?').bind(str(d.space, 20), host.id).first();
      if (!sp) return err('공간을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      spaceRef = sp.ref;
      if (await env.DB.prepare(`SELECT 1 AS x FROM host_assist WHERE space_ref = ? AND status IN (${OPEN.map(() => '?').join(',')})`).bind(spaceRef, ...OPEN).first())
        return err('이 공간은 이미 등록 대행을 요청했습니다. 진행 중인 요청에 자료를 더 보내 주세요.', 409, 'EXISTS');
    }
    const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM host_assist WHERE host_id = ? AND status IN (${OPEN.map(() => '?').join(',')})`).bind(host.id, ...OPEN).first();
    if ((open && open.n) >= 3) return err('진행 중인 등록 대행 요청이 3건입니다. 진행 중인 요청이 끝난 뒤 새로 요청해 주세요.', 429, 'TOO_MANY');
    const ref = await uniqueRef(env, 'host_assist', 'ref', 'AS');
    const data = pushHistory({ address: str(d.address, 160), links: cleanLinks(d.links), message: str(d.message, 2000), phone, contact_time: CONTACT_TIME[d.contact_time] ? d.contact_time : 'any', agreed_at: t }, 'host', '요청 접수');
    await env.DB.prepare('INSERT INTO host_assist (ref, host_id, space_ref, status, name, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(ref, host.id, spaceRef, 'new', name, JSON.stringify(data), t, t).run();
    await log(env, 'hostassist.created', ref, 'host', { host: host.code, space: spaceRef || '' });
    return json({ ok: true, ref, rule: { ...FILE_RULE, exts: FILE_EXTS } });
  }
  if (parts[0] !== 'assist' || !ASSIST_REF.test(parts[1] || '')) return null;
  const row = await env.DB.prepare('SELECT * FROM host_assist WHERE ref = ? AND host_id = ?').bind(parts[1], host.id).first();
  if (!row) return err('요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const isOpen = OPEN.includes(row.status), sub = parts.slice(2).join('/');
  if (!sub && method === 'PATCH') {   // 자료·전할 말 보태기
    if (!isOpen) return err('끝난 요청입니다.', 409, 'DONE');
    const d = await readJson(request), data = safeJson(row.data);
    if (d.links !== undefined) data.links = cleanLinks([...(data.links || []), ...cleanLinks(d.links)]);
    if (d.message !== undefined) { const add = str(d.message, 1000); if (add) data.message = str((data.message ? data.message + '\n\n' : '') + '[' + t.slice(0, 10) + ' 추가] ' + add, 4000); }
    if (d.contact_time !== undefined && CONTACT_TIME[d.contact_time]) data.contact_time = d.contact_time;
    if (d.phone !== undefined && phoneOk(d.phone)) data.phone = phoneOk(d.phone);
    pushHistory(data, 'host', '자료 보탬');
    await env.DB.prepare('UPDATE host_assist SET data = ?, updated_at = ? WHERE ref = ?').bind(JSON.stringify(data), t, row.ref).run();
    return json({ ok: true });
  }
  if (sub === 'cancel' && method === 'POST') {
    if (!['new', 'checking'].includes(row.status)) return err('본사가 이미 작업을 시작했습니다. 취소하려면 카카오톡 채널로 알려 주세요.', 409, 'STARTED');
    const data = pushHistory(safeJson(row.data), 'host', '호스트가 요청 취소');
    await env.DB.prepare("UPDATE host_assist SET status = 'cancelled', data = ?, updated_at = ?, done_at = ? WHERE ref = ?").bind(JSON.stringify(data), t, t, row.ref).run();
    await log(env, 'hostassist.cancelled', row.ref, 'host', {});
    return json({ ok: true });
  }
  // 파일: 시작 → 조각 → 마침
  if (sub === 'files' && method === 'POST') {
    if (!isOpen) return err('끝난 요청에는 파일을 더 올릴 수 없습니다.', 409, 'DONE');
    const d = await readJson(request), name = cleanName(d.name), ext = extOf(name), size = Math.floor(Number(d.size));
    if (!name || !EXT[ext]) return err('PDF·파워포인트·워드·한글·엑셀·사진·ZIP 파일만 올릴 수 있습니다.', 400, 'FILE_TYPE');
    if (!(size > 0)) return err('빈 파일입니다.', 400, 'FILE_EMPTY');
    if (size > FILE_RULE.maxFile) return err('파일 하나는 20MB까지 올릴 수 있습니다. 더 큰 자료는 구글 드라이브 같은 공유 링크로 보내 주세요.', 413, 'FILE_BIG');
    const used = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM host_assist_files WHERE req_ref = ?').bind(row.ref).first();
    if ((used.n || 0) >= FILE_RULE.maxFiles) return err('파일은 요청 한 건에 10개까지 올릴 수 있습니다.', 409, 'FILE_COUNT');
    if ((used.bytes || 0) + size > FILE_RULE.maxTotal) return err('요청 한 건에 올린 파일이 모두 60MB를 넘습니다. 나머지는 공유 링크로 보내 주세요.', 413, 'FILE_TOTAL');
    const fid = randomToken(18), chunks = Math.ceil(size / FILE_RULE.chunk);
    await env.DB.prepare('INSERT INTO host_assist_files (fid, req_ref, host_id, name, mime, size, chunks, created_at) VALUES (?,?,?,?,?,?,?,?)').bind(fid, row.ref, host.id, name, MIME[ext], size, chunks, t).run();
    return json({ ok: true, fid, chunk: FILE_RULE.chunk, chunks });
  }
  let fm = sub.match(/^files\/([A-Za-z0-9_-]{16,40})(?:\/(\d{1,3}|done))?$/);
  if (fm) {
    const f = await env.DB.prepare('SELECT * FROM host_assist_files WHERE fid = ? AND req_ref = ?').bind(fm[1], row.ref).first();
    if (!f) return err('파일을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    if (!fm[2] && method === 'DELETE') {
      if (!isOpen) return err('끝난 요청입니다.', 409, 'DONE');
      await dropFile(env, f.fid); return json({ ok: true });
    }
    if (fm[2] === 'done' && method === 'POST') {
      const c = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(body)),0) AS chars FROM host_assist_chunks WHERE fid = ?').bind(f.fid).first();
      const approx = Math.floor((c.chars || 0) * 3 / 4);
      if ((c.n || 0) !== f.chunks || Math.abs(approx - f.size) > 2 * f.chunks + 2) { await dropFile(env, f.fid); return err('파일이 다 올라가지 않았습니다. 다시 올려 주세요.', 400, 'FILE_BROKEN'); }
      const data = pushHistory(safeJson(row.data), 'host', '파일 올림 · ' + f.name);
      await env.DB.prepare('UPDATE host_assist SET data = ?, updated_at = ? WHERE ref = ?').bind(JSON.stringify(data), t, row.ref).run();
      return json({ ok: true, fid: f.fid, name: f.name, size: f.size });
    }
    if (fm[2] && fm[2] !== 'done' && method === 'POST') {
      if (!isOpen) return err('끝난 요청입니다.', 409, 'DONE');
      const idx = Number(fm[2]); if (idx >= f.chunks) return err('조각 번호를 확인해 주세요.', 400, 'FILE_PART');
      const d = await readJson(request, 1300 * 1024), body = String(d.data || '').replace(/^data:[^,]*,/, '');
      const expect = idx === f.chunks - 1 ? f.size - idx * FILE_RULE.chunk : FILE_RULE.chunk;
      if (!body || !B64.test(body) || Math.abs(Math.floor(body.length * 3 / 4) - expect) > 2) return err('파일 조각이 올바르지 않습니다. 다시 올려 주세요.', 400, 'FILE_PART');
      if (idx === 0 && !kindOk(extOf(f.name), body)) { await dropFile(env, f.fid); return err('파일 이름(확장자)과 실제 파일 형식이 다릅니다. 파일을 확인해 주세요.', 400, 'FILE_TYPE'); }
      await env.DB.prepare('INSERT INTO host_assist_chunks (fid, idx, body) VALUES (?,?,?) ON CONFLICT(fid, idx) DO UPDATE SET body = excluded.body').bind(f.fid, idx, body).run();
      return json({ ok: true });
    }
  }
  return err('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
}

export async function linkActingSpace(env, reqRef, spaceRef) {
  const row = await env.DB.prepare('SELECT data, space_ref FROM host_assist WHERE ref = ?').bind(reqRef).first(); if (!row || row.space_ref) return;
  const data = pushHistory(safeJson(row.data), 'hq', '본사가 공간을 만들어 연결: ' + spaceRef);
  await env.DB.prepare('UPDATE host_assist SET space_ref = ?, data = ?, updated_at = ? WHERE ref = ? AND space_ref IS NULL').bind(spaceRef, JSON.stringify(data), now(), reqRef).run();
}

// ---------- 본사 ----------
export async function hqAssist({ env, request, path, method, url }) {
  const parts = path.split('/'), t = now();
  if (path === 'assist' && method === 'GET') {
    await cleanup(env);
    const status = str(url.searchParams.get('status'), 12), where = [], bind = [];
    if (status === 'open') { where.push(`a.status IN (${OPEN.map(() => '?').join(',')})`); bind.push(...OPEN); }
    else if (status && status !== 'all') { if (!ASSIST_STATUS[status]) return err('상태를 확인해 주세요.'); where.push('a.status = ?'); bind.push(status); }
    const { results } = await env.DB.prepare(`SELECT a.*, h.code AS host_code, h.name AS host_name, h.phone AS host_phone, h.email AS host_email, h.company AS host_company,
        s.name AS space_name, s.status AS space_status
      FROM host_assist a JOIN hosts h ON h.id = a.host_id LEFT JOIN host_spaces s ON s.ref = a.space_ref
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE a.status WHEN 'new' THEN 0 WHEN 'checking' THEN 1 WHEN 'working' THEN 2 WHEN 'confirm' THEN 3 ELSE 4 END, a.id DESC LIMIT 200`).bind(...bind).all();
    const rows = results || [], files = await filesOf(env, rows.map(r => r.ref));
    const hostIds = [...new Set(rows.map(r => r.host_id))];
    const { results: sp } = hostIds.length ? await env.DB.prepare(`SELECT ref, name, status, host_id FROM host_spaces WHERE host_id IN (${hostIds.map(() => '?').join(',')}) ORDER BY id`).bind(...hostIds).all() : { results: [] };
    const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM host_assist GROUP BY status').all();
    return json({ ok: true, statuses: ASSIST_STATUS, counts: Object.fromEntries((cnt || []).map(c => [c.status, c.n])),
      items: rows.map(r => ({ ...view(r, files, { hq: true }), host: { code: r.host_code, name: r.host_name, phone: r.host_phone, email: r.host_email, company: r.host_company || '' },
        space: r.space_ref ? { ref: r.space_ref, name: r.space_name || '', status: r.space_status || '', status_label: SPACE_STATUS[r.space_status] || '' } : null,
        host_spaces: (sp || []).filter(s => s.host_id === r.host_id).map(s => ({ ref: s.ref, name: s.name, status: s.status, status_label: SPACE_STATUS[s.status] || s.status })) })) });
  }
  let fm = path.match(/^assist\/files\/([A-Za-z0-9_-]{16,40})\/(\d{1,3})$/);
  if (fm && method === 'GET') {
    if (!FID.test(fm[1])) return err('파일을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    const f = await env.DB.prepare('SELECT name, size, chunks, mime FROM host_assist_files WHERE fid = ?').bind(fm[1]).first(); if (!f) return err('파일을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    const c = await env.DB.prepare('SELECT body FROM host_assist_chunks WHERE fid = ? AND idx = ?').bind(fm[1], Number(fm[2])).first(); if (!c) return err('파일 조각을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    return json({ ok: true, name: f.name, size: f.size, chunks: f.chunks, mime: f.mime, data: c.body }, 200, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  }
  if (parts[0] !== 'assist' || !ASSIST_REF.test(parts[1] || '')) return null;
  const row = await env.DB.prepare('SELECT * FROM host_assist WHERE ref = ?').bind(parts[1]).first();
  if (!row) return err('요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const sub = parts.slice(2).join('/');
  if (!sub && method === 'PATCH') {
    const d = await readJson(request), data = safeJson(row.data), set = { updated_at: t };
    if (d.status !== undefined) {
      if (!ASSIST_STATUS[d.status]) return err('상태를 확인해 주세요.');
      if (d.status !== row.status) { set.status = d.status; pushHistory(data, 'hq', '상태: ' + ASSIST_STATUS[d.status]); set.done_at = ['done', 'cancelled'].includes(d.status) ? t : null; }
    }
    if (d.hq_message !== undefined) { const msg = str(d.hq_message, 1000); if (msg !== (row.hq_message || '')) { set.hq_message = msg || null; pushHistory(data, 'hq', '호스트에게 보낼 메시지 수정'); } }
    if (d.memo !== undefined) set.memo = str(d.memo, 2000) || null;
    if (d.space !== undefined) {
      const ref = str(d.space, 20);
      if (ref) { const sp = await env.DB.prepare('SELECT ref FROM host_spaces WHERE ref = ? AND host_id = ?').bind(ref, row.host_id).first(); if (!sp) return err('이 호스트의 공간이 아닙니다.'); set.space_ref = sp.ref; }
      else set.space_ref = null;
      if ((set.space_ref || null) !== (row.space_ref || null)) pushHistory(data, 'hq', '공간 연결: ' + (set.space_ref || '없음'));
    }
    set.data = JSON.stringify(data);
    const keys = Object.keys(set);
    await env.DB.prepare(`UPDATE host_assist SET ${keys.map(k => k + ' = ?').join(', ')} WHERE ref = ?`).bind(...keys.map(k => set[k]), row.ref).run();
    await log(env, 'hostassist.updated', row.ref, 'admin', { status: set.status || row.status });
    return json({ ok: true });
  }
  if (sub === 'act' && method === 'POST') {   // 호스트센터를 본사가 대신 열기
    if (!OPEN.includes(row.status)) return err('끝난 요청입니다. 다시 열려면 상태를 바꿔 주세요.', 409, 'DONE');
    const host = await env.DB.prepare("SELECT id, code, status FROM hosts WHERE id = ?").bind(row.host_id).first();
    if (!host || host.status !== 'active') return err('사용할 수 없는 호스트 계정입니다.', 409, 'HOST_BLOCKED');
    const token = randomToken(), th = await sha256(token);
    await env.DB.prepare('INSERT INTO host_sessions (token_hash, host_id, expires_at, created_at) VALUES (?,?,?,?)').bind(th, host.id, later(ACT_HOURS / 24), t).run();
    await env.DB.prepare('INSERT INTO host_assist_sessions (token_hash, req_ref, host_id, created_at) VALUES (?,?,?,?)').bind(th, row.ref, host.id, t).run();
    const data = pushHistory(safeJson(row.data), 'hq', '본사가 호스트센터에서 대신 작성 시작');
    await env.DB.prepare('UPDATE host_assist SET status = CASE WHEN status IN (\'new\',\'checking\') THEN \'working\' ELSE status END, data = ?, updated_at = ? WHERE ref = ?').bind(JSON.stringify(data), t, row.ref).run();
    await log(env, 'hostassist.acting', row.ref, 'admin', { host: host.code, hours: ACT_HOURS });
    const target = '/host/center/' + (row.space_ref ? '#space=' + row.space_ref : '#add');
    return withCookies(json({ ok: true, url: target, hours: ACT_HOURS }), hostCookies(token, ACT_HOURS / 24));
  }
  return err('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
}
// 오래된 자료 정리: 끝난 지 90일 지난 요청의 파일 · 하루 넘게 다 올라가지 않은 파일 · 끝난 대신 작성 로그인
async function cleanup(env) {
  try {
    const { results } = await env.DB.prepare(`SELECT f.fid FROM host_assist_files f JOIN host_assist a ON a.ref = f.req_ref
      WHERE (a.status IN ('done','cancelled') AND COALESCE(a.done_at, a.updated_at) < ?)
         OR (f.created_at < ? AND (SELECT COUNT(*) FROM host_assist_chunks c WHERE c.fid = f.fid) < f.chunks) LIMIT 50`).bind(later(-90), later(-1)).all();
    for (const f of results || []) await dropFile(env, f.fid);
    await env.DB.prepare('DELETE FROM host_assist_sessions WHERE token_hash NOT IN (SELECT token_hash FROM host_sessions WHERE expires_at > ?)').bind(now()).run();
  } catch (e) { console.error('hostassist cleanup', e && e.message); }
}
