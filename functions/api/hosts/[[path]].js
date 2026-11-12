// 호스트 API — 입점 신청(가입) · 로그인 · 호스트 센터(공간 정보·사진·일정·문의/예약·결제 기록·정산·통계·이용료)
//   /api/hosts/signup · login · logout · me · password
//   /api/hosts/spaces[/:ref[/submit|pause|resume|photos|blocks|calendar]]
//   /api/hosts/bookings[/:code] · stats · settlement · billing · billing/BL-…/(pay|withdraw|cancel|cancel-withdraw)
// 로그인 쿠키 ms_host (HttpOnly). 모든 조회·변경은 로그인한 호스트의 공간·예약에만 닿습니다.
import { json, err, hasDb, readJson, str, num, isDate, isEmail, now, later, kstToday, uniqueRef, log, clientIp, tooMany, hit, clearHits, hashPassword, verifyPassword, randomToken, sha256, getCookie, sameOrigin, withCookies } from '../_lib.js';
import { safeJson, phoneOk } from '../_platform.js';
import { PLATFORM, PLAN, SPACE_STATUS, BOOKING_STATUS, BILLING_STATUS, SPACE_REF, BOOKING_CODE, PHOTO_ID, MAX_PHOTOS, HOST_SESSION_DAYS, cleanSpace, tierOf, listedUntil, photoUrl, safeArr, hostCookies, getHost, publicHost,
  bookingToken, addMonths, addDays, STAT_FIELDS, TYPE_LABEL, REGION_LABEL } from '../_hostplat.js';
import { createBooking, viewBooking, hostAction, addonsFor } from '../_hostbook.js';
import { feeOf, periodFor, billView, payRequest, onlinePay, requestCancel, withdrawCancel } from '../_hostbilling.js';

const NO_DB = () => err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
const LOGIN = () => err('호스트 로그인이 필요합니다.', 401, 'HOST_LOGIN');
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function imageKind(b64) {   // 앞부분 바이트로 실제 이미지인지 확인 (JPEG·PNG·WebP)
  let h; try { h = atob(b64.slice(0, 24)); } catch { return ''; }
  const c = i => h.charCodeAt(i);
  if (c(0) === 0xFF && c(1) === 0xD8 && c(2) === 0xFF) return 'image/jpeg';
  if (c(0) === 0x89 && h.slice(1, 4) === 'PNG') return 'image/png';
  if (h.slice(0, 4) === 'RIFF' && h.slice(8, 12) === 'WEBP') return 'image/webp';
  return '';
}
async function session(env, hostId) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO host_sessions (token_hash, host_id, expires_at, created_at) VALUES (?,?,?,?)').bind(await sha256(token), hostId, later(HOST_SESSION_DAYS), now()).run();
  return token;
}
async function spaceOf(env, host, ref) {
  if (!SPACE_REF.test(ref || '')) return null;
  return env.DB.prepare('SELECT * FROM host_spaces WHERE ref = ? AND host_id = ?').bind(ref, host.id).first();
}
async function photosOf(env, ref) {
  const { results } = await env.DB.prepare('SELECT pid, sort, w, h, bytes FROM host_photos WHERE space_ref = ? ORDER BY sort, id').bind(ref).all();
  return (results || []).map(p => ({ id: p.pid, src: photoUrl(p.pid), thumb: photoUrl(p.pid, true), w: p.w, h: p.h }));
}
function daysLeft(until) { if (!until) return null; return Math.round((Date.parse(until + 'T00:00:00Z') - Date.parse(kstToday() + 'T00:00:00Z')) / 864e5); }
function spaceView(row, { full = false } = {}) {
  const until = listedUntil(row), left = daysLeft(until);
  const v = { ref: row.ref, name: row.name, status: row.status, status_label: SPACE_STATUS[row.status] || row.status, region: row.region, region_label: REGION_LABEL[row.region] || '', address: row.address || '',
    capacity: row.capacity, area: row.area, tier: row.tier, types: safeArr(row.types), type_labels: safeArr(row.types).map(t => TYPE_LABEL[t] || t), price_from: row.price_from,
    free_until: row.free_until || '', paid_until: row.paid_until || '', listed_until: until, days_left: left, plan: row.plan || '', visible: row.status === 'live' && until >= kstToday(),
    review_note: row.review_note || '', submitted_at: row.submitted_at || '', approved_at: row.approved_at || '', created_at: row.created_at, updated_at: row.updated_at || '' };
  if (full) v.data = safeJson(row.data);
  return v;
}
// 심사에 낼 수 있는지 — 빠진 항목 목록
async function missing(env, row) {
  const d = safeJson(row.data), out = [];
  const c = cleanSpace({ ...d, name: row.name, region: row.region, address: row.address, capacity: row.capacity, area: row.area, types: safeArr(row.types) }, { strict: true });
  if (c.error) out.push(c.error);
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM host_photos WHERE space_ref = ?').bind(row.ref).first()).n;
  if (n < 3) out.push(`사진을 3장 이상 올려 주세요. (지금 ${n}장)`);
  return out;
}

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return NO_DB();
  const path = (params.path || []).join('/'), method = request.method, url = new URL(request.url);
  if (method !== 'GET' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'ORIGIN');
  try {
    // ---------- 입점 신청 = 호스트 가입 + 첫 공간(작성 중) ----------
    if (path === 'signup' && method === 'POST') {
      const d = await readJson(request);
      if (d.website) return json({ ok: true });   // 허니팟
      const ipKey = 'hostsignup:' + clientIp(request);
      if (await tooMany(env, ipKey, 5, 30)) return err('짧은 시간에 너무 많은 신청이 들어왔습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
      const email = str(d.email, 120).toLowerCase(), pw = String(d.password || ''), name = str(d.name, 40), phone = phoneOk(d.phone);
      if (!isEmail(email)) return err('이메일 주소를 확인해 주세요.');
      if (pw.length < 8 || pw.length > 72) return err('비밀번호는 8자 이상으로 정해 주세요.');
      if (!name) return err('담당자 이름을 적어 주세요.');
      if (!phone) return err('휴대폰 번호를 확인해 주세요.');
      if (!d.agree_terms || !d.agree_privacy) return err('호스트 이용약관과 개인정보 수집·이용에 동의해 주세요.');
      const sp = cleanSpace(d.space || {}); if (sp.error) return err(sp.error, 400, sp.code || 'ERR');
      if (await env.DB.prepare('SELECT 1 AS x FROM hosts WHERE email = ?').bind(email).first()) return err('이미 가입한 이메일입니다. 호스트 로그인 후 공간을 추가해 주세요.', 409, 'EXISTS');
      await hit(env, ipKey, 30);
      const code = await uniqueRef(env, 'hosts', 'code', 'H'), t = now();
      await env.DB.prepare('INSERT INTO hosts (code, email, pw_hash, name, phone, company, biz_no, status, settings, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(code, email, await hashPassword(pw), name, phone, str(d.company, 60), str(d.biz_no, 20).replace(/[^0-9-]/g, ''), 'active', JSON.stringify({ notify_phone: phone, notify_email: email, agree_marketing: !!d.agree_marketing, agreed_at: t }), t, t).run();
      const host = await env.DB.prepare('SELECT * FROM hosts WHERE code = ?').bind(code).first();
      const ref = await uniqueRef(env, 'host_spaces', 'ref', 'SP');
      // 연락 채널 기본값: 담당자 번호를 넣어 두되 공개 여부는 호스트가 정합니다
      sp.data.contact = { ...sp.data.contact, phone: sp.data.contact.phone || phone };
      await env.DB.prepare('INSERT INTO host_spaces (ref, host_id, status, name, region, address, capacity, area, tier, types, price_from, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(ref, host.id, 'draft', sp.name, sp.region, sp.address, sp.capacity, sp.area, sp.tier, JSON.stringify(sp.types), sp.price_from, JSON.stringify(sp.data), t, t).run();
      await log(env, 'host.signup', code, 'host', { space: ref, tier: sp.tier });
      return withCookies(json({ ok: true, host: publicHost(host), space: ref, tier: sp.tier }), hostCookies(await session(env, host.id)));
    }
    if (path === 'login' && method === 'POST') {
      const d = await readJson(request), email = str(d.email, 120).toLowerCase(), key = 'hostlogin:' + email + ':' + clientIp(request);
      if (await tooMany(env, key, 8, 15)) return err('로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.', 429, 'TOO_MANY');
      const h = await env.DB.prepare('SELECT * FROM hosts WHERE email = ?').bind(email).first();
      if (!h || !(await verifyPassword(String(d.password || ''), h.pw_hash))) { await hit(env, key, 15); return err('이메일 또는 비밀번호가 맞지 않습니다.', 401, 'BAD_LOGIN'); }
      if (h.status !== 'active') return err('이용이 중지된 계정입니다. 메가스팟 운영팀에 문의해 주세요.', 403, 'BLOCKED');
      await clearHits(env, key); await env.DB.prepare('UPDATE hosts SET last_login_at = ? WHERE id = ?').bind(now(), h.id).run();
      return withCookies(json({ ok: true, host: publicHost(h) }), hostCookies(await session(env, h.id)));
    }
    if (path === 'logout' && method === 'POST') {
      const tok = getCookie(request, 'ms_host'); if (tok) await env.DB.prepare('DELETE FROM host_sessions WHERE token_hash = ?').bind(await sha256(tok)).run();
      return withCookies(json({ ok: true }), hostCookies('', 0));
    }

    const host = await getHost(request, env); if (!host) return LOGIN();

    if (path === 'me' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM host_spaces WHERE host_id = ? ORDER BY id').bind(host.id).all();
      const { results: cnt } = await env.DB.prepare('SELECT space_ref, status, COUNT(*) AS n FROM host_bookings WHERE host_id = ? GROUP BY space_ref, status').bind(host.id).all();
      const { results: covers } = await env.DB.prepare('SELECT space_ref, pid FROM host_photos WHERE host_id = ? AND sort = (SELECT MIN(sort) FROM host_photos p2 WHERE p2.space_ref = host_photos.space_ref) GROUP BY space_ref').bind(host.id).all();
      const cover = Object.fromEntries((covers || []).map(c => [c.space_ref, photoUrl(c.pid, true)]));
      const spaces = (results || []).map(r => { const c = {}; for (const x of cnt || []) if (x.space_ref === r.ref) c[x.status] = x.n; return { ...spaceView(r), cover: cover[r.ref] || '', counts: c }; });
      return json({ ok: true, host: publicHost(host), spaces, today: kstToday() });
    }
    if (path === 'me' && method === 'PUT') {
      const d = await readJson(request), name = str(d.name, 40), phone = phoneOk(d.phone); if (!name || !phone) return err('담당자 이름과 연락처를 확인해 주세요.');
      const s = safeJson(host.settings), ns = d.settings || {};
      const settings = { ...s, notify_phone: phoneOk(ns.notify_phone) || phone, notify_email: isEmail(str(ns.notify_email, 120)) ? str(ns.notify_email, 120).toLowerCase() : host.email, notify_on: ns.notify_on !== false };
      await env.DB.prepare('UPDATE hosts SET name = ?, phone = ?, company = ?, biz_no = ?, settings = ?, updated_at = ? WHERE id = ?').bind(name, phone, str(d.company, 60), str(d.biz_no, 20).replace(/[^0-9-]/g, ''), JSON.stringify(settings), now(), host.id).run();
      return json({ ok: true });
    }
    if (path === 'password' && method === 'POST') {
      const d = await readJson(request), next = String(d.next || '');
      if (!(await verifyPassword(String(d.current || ''), host.pw_hash))) return err('지금 비밀번호가 맞지 않습니다.', 401, 'BAD_LOGIN');
      if (next.length < 8 || next.length > 72) return err('새 비밀번호는 8자 이상으로 정해 주세요.');
      await env.DB.prepare('UPDATE hosts SET pw_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(next), now(), host.id).run();
      return json({ ok: true });
    }

    // ---------- 공간 ----------
    if (path === 'spaces' && method === 'POST') {   // 공간 추가
      const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM host_spaces WHERE host_id = ?').bind(host.id).first()).n; if (n >= 20) return err('공간은 20곳까지 등록할 수 있습니다. 더 필요하면 운영팀에 알려 주세요.');
      const sp = cleanSpace(await readJson(request, 200 * 1024)); if (sp.error) return err(sp.error, 400, sp.code || 'ERR');
      const ref = await uniqueRef(env, 'host_spaces', 'ref', 'SP'), t = now();
      sp.data.contact = { ...sp.data.contact, phone: sp.data.contact.phone || host.phone };
      await env.DB.prepare('INSERT INTO host_spaces (ref, host_id, status, name, region, address, capacity, area, tier, types, price_from, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(ref, host.id, 'draft', sp.name, sp.region, sp.address, sp.capacity, sp.area, sp.tier, JSON.stringify(sp.types), sp.price_from, JSON.stringify(sp.data), t, t).run();
      return json({ ok: true, ref });
    }
    let m = path.match(/^spaces\/(SP-[A-Z0-9-]+)(?:\/(.+))?$/);
    if (m) {
      const row = await spaceOf(env, host, m[1]); if (!row) return err('공간을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const sub = m[2] || '';
      if (!sub && method === 'GET') return json({ ok: true, space: spaceView(row, { full: true }), photos: await photosOf(env, row.ref), missing: await missing(env, row) });
      if (!sub && method === 'PUT') {
        const d = await readJson(request, 200 * 1024), strict = ['review', 'live', 'paused'].includes(row.status);   // 심사 중·공개 중인 공간은 필수 항목이 비면 안 됩니다
        const sp = cleanSpace(d, { strict }); if (sp.error) return err(sp.error, 400, sp.code || 'ERR');
        await env.DB.prepare('UPDATE host_spaces SET name = ?, region = ?, address = ?, capacity = ?, area = ?, tier = ?, types = ?, price_from = ?, data = ?, updated_at = ? WHERE ref = ?')
          .bind(sp.name, sp.region, sp.address, sp.capacity, sp.area, sp.tier, JSON.stringify(sp.types), sp.price_from, JSON.stringify(sp.data), now(), row.ref).run();
        if (row.status === 'live') await log(env, 'hostspace.edited', row.ref, 'host', {});
        const fresh = await spaceOf(env, host, row.ref);
        return json({ ok: true, space: spaceView(fresh, { full: true }), missing: await missing(env, fresh) });
      }
      if (sub === 'submit' && method === 'POST') {   // 심사 요청
        if (!['draft', 'fix', 'rejected'].includes(row.status)) return err('이미 심사를 요청했거나 공개 중인 공간입니다.');
        const miss = await missing(env, row); if (miss.length) return err(miss[0], 400, 'INCOMPLETE');
        await env.DB.prepare("UPDATE host_spaces SET status = 'review', submitted_at = ?, updated_at = ? WHERE ref = ?").bind(now(), now(), row.ref).run();
        await log(env, 'hostspace.submitted', row.ref, 'host', {});
        return json({ ok: true, status: 'review' });
      }
      if ((sub === 'pause' || sub === 'resume') && method === 'POST') {
        if (sub === 'pause' && row.status !== 'live') return err('공개 중인 공간만 잠시 멈출 수 있습니다.');
        if (sub === 'resume' && row.status !== 'paused') return err('멈춰 둔 공간이 아닙니다.');
        await env.DB.prepare('UPDATE host_spaces SET status = ?, updated_at = ? WHERE ref = ?').bind(sub === 'pause' ? 'paused' : 'live', now(), row.ref).run();
        return json({ ok: true, status: sub === 'pause' ? 'paused' : 'live' });
      }
      // 사진 — 브라우저가 줄인 이미지를 base64 로 받습니다 (본문 600KB · 썸네일 90KB 이하)
      if (sub === 'photos' && method === 'POST') {
        const d = await readJson(request, 1300 * 1024), body = String(d.body || '').replace(/^data:[^,]*,/, ''), thumb = String(d.thumb || '').replace(/^data:[^,]*,/, '');
        if (!body || body.length > 820000 || !B64.test(body)) return err('사진이 너무 큽니다. 다시 골라 주세요.', 413, 'TOO_LARGE');
        const mime = imageKind(body); if (!mime) return err('JPG·PNG·WebP 사진만 올릴 수 있습니다.');
        if (thumb && (thumb.length > 124000 || !B64.test(thumb) || !imageKind(thumb))) return err('사진을 처리하지 못했습니다. 다시 시도해 주세요.');
        const st = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(sort), 0) AS s FROM host_photos WHERE space_ref = ?').bind(row.ref).first();
        if (st.n >= MAX_PHOTOS) return err(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있습니다.`);
        const pid = randomToken(15);
        await env.DB.prepare('INSERT INTO host_photos (pid, space_ref, host_id, sort, mime, bytes, w, h, body, thumb, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .bind(pid, row.ref, host.id, st.s + 1, mime, Math.floor(body.length * 3 / 4), num(d.w) || null, num(d.h) || null, body, thumb || null, now()).run();
        return json({ ok: true, photos: await photosOf(env, row.ref) });
      }
      if (sub === 'photos' && method === 'PUT') {   // 순서 바꾸기 (첫 사진이 대표 사진)
        const order = (await readJson(request)).order; if (!Array.isArray(order)) return err('순서를 확인해 주세요.');
        let i = 0; for (const pid of order.slice(0, MAX_PHOTOS)) if (PHOTO_ID.test(pid)) await env.DB.prepare('UPDATE host_photos SET sort = ? WHERE pid = ? AND space_ref = ?').bind(++i, pid, row.ref).run();
        return json({ ok: true, photos: await photosOf(env, row.ref) });
      }
      const pm = sub.match(/^photos\/([A-Za-z0-9_-]+)$/);
      if (pm && method === 'DELETE') {
        if (['review', 'live', 'paused'].includes(row.status)) { const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM host_photos WHERE space_ref = ?').bind(row.ref).first()).n; if (n <= 3) return err('공개 중인 공간은 사진을 3장 이상 유지해야 합니다. 새 사진을 먼저 올려 주세요.'); }
        await env.DB.prepare('DELETE FROM host_photos WHERE pid = ? AND space_ref = ?').bind(pm[1], row.ref).run();
        return json({ ok: true, photos: await photosOf(env, row.ref) });
      }
      // 일정 달력: 닫은 날짜 + 예약
      if (sub === 'calendar' && method === 'GET') {
        const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from') : kstToday(), to = isDate(url.searchParams.get('to')) ? url.searchParams.get('to') : addDays(from, 62);
        const { results: blocks } = await env.DB.prepare('SELECT day, note FROM host_blocks WHERE space_ref = ? AND day BETWEEN ? AND ? ORDER BY day').bind(row.ref, from, to).all();
        const { results: bks } = await env.DB.prepare("SELECT code, status, name, event_date, start_time, end_time, people FROM host_bookings WHERE space_ref = ? AND event_date BETWEEN ? AND ? AND status NOT IN ('cancelled','declined') ORDER BY event_date, start_time").bind(row.ref, from, to).all();
        return json({ ok: true, from, to, blocks: blocks || [], bookings: (bks || []).map(b => ({ code: b.code, status: b.status, status_label: BOOKING_STATUS[b.status], name: b.name, date: b.event_date, start: b.start_time || '', end: b.end_time || '', people: b.people })) });
      }
      if (sub === 'blocks' && method === 'PUT') {
        const d = await readJson(request), day = str(d.day, 10); if (!isDate(day)) return err('날짜를 확인해 주세요.');
        if (d.on) await env.DB.prepare('INSERT INTO host_blocks (space_ref, day, note, created_at) VALUES (?,?,?,?) ON CONFLICT(space_ref, day) DO UPDATE SET note = excluded.note').bind(row.ref, day, str(d.note, 80), now()).run();
        else await env.DB.prepare('DELETE FROM host_blocks WHERE space_ref = ? AND day = ?').bind(row.ref, day).run();
        return json({ ok: true });
      }
      return err('지원하지 않는 요청입니다.', 405, 'METHOD');
    }

    // ---------- 문의·예약 ----------
    if (path === 'bookings' && method === 'GET') {
      const sp = url.searchParams, space = str(sp.get('space'), 20), status = str(sp.get('status'), 12), q = str(sp.get('q'), 40);
      const where = ['b.host_id = ?'], bind = [host.id];
      if (space) { where.push('b.space_ref = ?'); bind.push(space); }
      if (status === 'open') where.push("b.status IN ('new','quoted','pending','confirmed')");
      else if (status === 'closed') where.push("b.status IN ('done','cancelled','declined')");
      else if (status) { if (!BOOKING_STATUS[status]) return err('상태를 확인해 주세요.'); where.push('b.status = ?'); bind.push(status); }
      if (q) { const like = '%' + q.replace(/[%_]/g, '') + '%', digits = q.replace(/\D/g, ''); where.push('(b.name LIKE ? OR b.code LIKE ?' + (digits.length >= 3 ? " OR REPLACE(b.phone, '-', '') LIKE ?" : '') + ')'); bind.push(like, like); if (digits.length >= 3) bind.push('%' + digits + '%'); }
      const { results } = await env.DB.prepare(`SELECT b.*, s.name AS space_name FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref WHERE ${where.join(' AND ')} ORDER BY CASE b.status WHEN 'new' THEN 0 WHEN 'quoted' THEN 1 WHEN 'pending' THEN 2 WHEN 'confirmed' THEN 3 ELSE 4 END, COALESCE(b.event_date, '9999'), b.id DESC LIMIT 500`).bind(...bind).all();
      const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM host_bookings WHERE host_id = ?' + (space ? ' AND space_ref = ?' : '') + ' GROUP BY status').bind(...(space ? [host.id, space] : [host.id])).all();
      return json({ ok: true, statuses: BOOKING_STATUS, counts: Object.fromEntries((cnt || []).map(c => [c.status, c.n])),
        items: (results || []).map(r => { const v = viewBooking(r, 'host'); return { code: v.code, space: v.space, space_name: r.space_name, status: v.status, status_label: v.status_label, source: v.source, name: v.name, phone: v.phone, date: v.date, start: v.start, end: v.end,
          people: v.people, amount: v.amount, paid: v.paid, due: v.due, addons: v.addon_labels, purpose_label: v.purpose_label, paid_notice: !!v.paid_notice, cancel_requested: v.cancel_requested, created_at: v.created_at, last: (v.messages[v.messages.length - 1] || {}).from || '' }; }) });
    }
    if (path === 'bookings' && method === 'POST') {   // 전화·카톡·현장에서 받은 예약을 직접 등록
      const d = await readJson(request), row = await spaceOf(env, host, str(d.space, 20)); if (!row) return err('공간을 골라 주세요.');
      const r = await createBooking(env, row, d, { source: 'host' }); if (r.error) return err(r.error);
      return json({ ok: true, code: r.code });
    }
    m = path.match(/^bookings\/(HB-[A-Z0-9-]+)$/);
    if (m) {
      if (!BOOKING_CODE.test(m[1])) return err('예약번호를 확인해 주세요.', 404, 'NOT_FOUND');
      const row = await env.DB.prepare('SELECT * FROM host_bookings WHERE code = ? AND host_id = ?').bind(m[1], host.id).first(); if (!row) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (method === 'PATCH') { const r = await hostAction(env, row, await readJson(request)); if (r.error) return err(r.error); }
      else if (method !== 'GET') return err('지원하지 않는 요청입니다.', 405, 'METHOD');
      const fresh = await env.DB.prepare('SELECT b.*, s.name AS space_name FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref WHERE b.code = ?').bind(row.code).first();
      const k = await bookingToken(env, row.code);
      return json({ ok: true, item: { ...viewBooking(fresh, 'host'), space_name: fresh.space_name }, hq_addons: await addonsFor(env, row.code), customer_url: k ? url.origin + '/spaces/booking/?code=' + row.code + '&k=' + k : '' });
    }

    // ---------- 통계: 노출 · 조회 · 연락 · 문의 · 예약 ----------
    if (path === 'stats' && method === 'GET') {
      const days = Math.max(7, Math.min(180, num(url.searchParams.get('days')) || 30)), space = str(url.searchParams.get('space'), 20), from = addDays(kstToday(), -(days - 1));
      const refs = space ? [space] : ((await env.DB.prepare('SELECT ref FROM host_spaces WHERE host_id = ?').bind(host.id).all()).results || []).map(r => r.ref);
      if (space && !(await spaceOf(env, host, space))) return err('공간을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const daily = {}, total = Object.fromEntries(STAT_FIELDS.map(f => [f, 0]));
      for (const ref of refs) {
        const { results } = await env.DB.prepare('SELECT * FROM host_stats WHERE space_ref = ? AND day >= ? ORDER BY day').bind(ref, from).all();
        for (const r of results || []) { const o = daily[r.day] = daily[r.day] || Object.fromEntries(STAT_FIELDS.map(f => [f, 0])); for (const f of STAT_FIELDS) { o[f] += r[f] || 0; total[f] += r[f] || 0; } }
      }
      const b = await env.DB.prepare(`SELECT COUNT(*) AS requests, SUM(CASE WHEN status IN ('confirmed','done') THEN 1 ELSE 0 END) AS confirmed, SUM(CASE WHEN status IN ('confirmed','done') THEN COALESCE(amount, 0) ELSE 0 END) AS amount FROM host_bookings WHERE host_id = ? AND source = 'web' AND created_at >= ?` + (space ? ' AND space_ref = ?' : '')).bind(...(space ? [host.id, from, space] : [host.id, from])).first();
      const series = []; for (let i = 0; i < days; i++) { const day = addDays(from, i); series.push({ day, ...(daily[day] || Object.fromEntries(STAT_FIELDS.map(f => [f, 0]))) }); }
      return json({ ok: true, days, from, to: kstToday(), total, series, bookings: { requests: b.requests || 0, confirmed: b.confirmed || 0, amount: b.amount || 0 } });
    }
    // ---------- 정산(매출 정리): 이용일이 그 달인 확정·완료 예약 ----------
    if (path === 'settlement' && method === 'GET') {
      const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : kstToday().slice(0, 7), space = str(url.searchParams.get('space'), 20);
      const { results } = await env.DB.prepare(`SELECT b.*, s.name AS space_name FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref WHERE b.host_id = ? AND b.status IN ('confirmed','done') AND substr(b.event_date, 1, 7) = ?` + (space ? ' AND b.space_ref = ?' : '') + ' ORDER BY b.event_date, b.start_time').bind(...(space ? [host.id, month, space] : [host.id, month])).all();
      const rows = (results || []).map(r => { const v = viewBooking(r, 'host'); return { code: v.code, space_name: r.space_name, date: v.date, name: v.name, people: v.people, status: v.status, status_label: v.status_label, source: v.source, amount: v.amount || 0, paid: v.paid, due: v.due || 0, payments: v.payments }; });
      const sum = k => rows.reduce((a, r) => a + (r[k] || 0), 0), byMethod = {};
      for (const r of rows) for (const p of r.payments) byMethod[p.method] = (byMethod[p.method] || 0) + (p.kind === 'refund' ? -p.amount : p.amount);
      const { results: months } = await env.DB.prepare("SELECT DISTINCT substr(event_date, 1, 7) AS m FROM host_bookings WHERE host_id = ? AND status IN ('confirmed','done') AND event_date IS NOT NULL ORDER BY m DESC LIMIT 36").bind(host.id).all();
      const amount = sum('amount');
      // 수수료 10% 플랫폼이었다면 냈을 금액 (비교용 · 메가스팟은 0원)
      return json({ ok: true, month, months: (months || []).map(x => x.m), rows, total: { count: rows.length, amount, paid: sum('paid'), due: sum('due'), fee: 0, fee_if_10pct: Math.round(amount / 10) }, by_method: byMethod });
    }
    // ---------- 입점 이용료 (공간 한 곳 기준 · 부가세 별도 · 온라인 결제 또는 계좌이체) ----------
    if (path === 'billing' && method === 'GET') {
      const { results: spaces } = await env.DB.prepare('SELECT * FROM host_spaces WHERE host_id = ? ORDER BY id').bind(host.id).all();
      const { results: bills } = await env.DB.prepare('SELECT * FROM host_billing WHERE host_id = ? ORDER BY id DESC LIMIT 100').bind(host.id).all();
      const { results: pays } = await env.DB.prepare('SELECT p.* FROM host_billing_pay p JOIN host_billing b ON b.ref = p.ref WHERE b.host_id = ?').bind(host.id).all();
      const pay = Object.fromEntries((pays || []).map(p => [p.ref, p]));
      return json({ ok: true, plans: PLATFORM.plans.map(p => ({ ...p, ...feeOf(p) })), fee: PLATFORM.fee, free_months: PLATFORM.freeMonths, online: onlinePay(env), spaces: (spaces || []).map(r => spaceView(r)),
        items: (bills || []).map(b => billView(b, pay[b.ref])) });
    }
    if (path === 'billing' && method === 'POST') {
      const d = await readJson(request), row = await spaceOf(env, host, str(d.space, 20)), plan = PLAN[d.plan], how = d.method === 'bank' ? 'bank' : 'online';
      if (!row) return err('공간을 골라 주세요.'); if (!plan) return err('등록 기간을 골라 주세요.');
      if (!['live', 'paused'].includes(row.status)) return err('등록이 끝난(공개 중인) 공간만 이용료를 결제할 수 있습니다.');
      if (how === 'online' && !onlinePay(env)) return err('온라인 결제를 준비하고 있습니다. 계좌이체로 신청하거나 운영팀에 문의해 주세요.', 503, 'PAYMENT_UNAVAILABLE');
      if (await env.DB.prepare("SELECT 1 AS x FROM host_billing WHERE space_ref = ? AND status = 'requested'").bind(row.ref).first()) return err('결제를 기다리는 신청이 이미 있습니다. 그 신청을 결제하거나 취소한 뒤 다시 골라 주세요.', 409, 'EXISTS');
      if (await env.DB.prepare("SELECT 1 AS x FROM host_billing b JOIN host_billing_pay p ON p.ref = b.ref WHERE b.space_ref = ? AND b.status = 'paid' AND p.cancel_status = 'requested'").bind(row.ref).first())
        return err('중도 해지 신청을 처리하고 있습니다. 계속 이용하려면 해지 신청을 철회한 뒤 등록 기간을 골라 주세요.', 409, 'CANCEL_PENDING');
      const fee = feeOf(plan), per = periodFor(row, plan.months), ref = await uniqueRef(env, 'host_billing', 'ref', 'BL'), t = now();
      await env.DB.prepare('INSERT INTO host_billing (ref, host_id, space_ref, plan, months, amount, status, period_from, period_to, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(ref, host.id, row.ref, plan.id, plan.months, fee.total, 'requested', per.from, per.to, JSON.stringify({ supply: fee.supply, vat: fee.vat, tax_invoice: !!d.tax_invoice, tax_email: isEmail(str(d.tax_email, 120)) ? str(d.tax_email, 120) : '', note: str(d.note, 300) }), t).run();
      await env.DB.prepare('INSERT INTO host_billing_pay (ref, method, supply, vat, updated_at) VALUES (?,?,?,?,?)').bind(ref, how, fee.supply, fee.vat, t).run();
      await log(env, 'hostbilling.requested', ref, 'host', { space: row.ref, plan: plan.id, method: how });
      let payurl = '', pay_error = '';
      if (how === 'online') { const bill = await env.DB.prepare('SELECT * FROM host_billing WHERE ref = ?').bind(ref).first(), r = await payRequest(env, url.origin, host, bill, row); if (r.ok) payurl = r.payurl; else pay_error = r.error; }
      return json({ ok: true, ref, supply: fee.supply, vat: fee.vat, amount: fee.total, method: how, period_from: per.from, period_to: per.to, payurl, pay_error });
    }
    m = path.match(/^billing\/(BL-\d{4}-[A-Z0-9]{4})\/(pay|withdraw|cancel|cancel-withdraw)$/);
    if (m && method === 'POST') {
      const bill = await env.DB.prepare('SELECT * FROM host_billing WHERE ref = ? AND host_id = ?').bind(m[1], host.id).first(); if (!bill) return err('신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (m[2] === 'pay') {          // 결제창 열기 (다시 열기 포함)
        const row = await spaceOf(env, host, bill.space_ref); if (!row) return err('공간을 찾을 수 없습니다.', 404, 'NOT_FOUND');
        const r = await payRequest(env, url.origin, host, bill, row); if (!r.ok) return err(r.error, r.status || 400, r.code || 'ERR');
        return json({ ok: true, payurl: r.payurl });
      }
      if (m[2] === 'withdraw') {     // 결제 전 신청 취소
        const r = await env.DB.prepare("UPDATE host_billing SET status = 'cancelled' WHERE ref = ? AND status = 'requested'").bind(bill.ref).run();
        if (!Number(r?.meta?.changes ?? r?.changes ?? 0)) return err('이미 처리한 신청입니다.', 409, 'DONE');
        await env.DB.prepare('UPDATE host_billing_pay SET payurl = NULL, updated_at = ? WHERE ref = ?').bind(now(), bill.ref).run();
        await log(env, 'hostbilling.withdrawn', bill.ref, 'host', {});
        return json({ ok: true });
      }
      const r = m[2] === 'cancel' ? await requestCancel(env, bill, await readJson(request)) : await withdrawCancel(env, bill);   // 중도 해지 신청 · 철회
      if (r.error) return err(r.error, r.code === 'EXISTS' ? 409 : 400, r.code || 'ERR');
      return json(r);
    }
    return err('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
  } catch (e) {
    if (e && /요청이 너무 큽니다|잘못된 요청 형식/.test(e.message || '')) return err(e.message);
    console.error('hosts', e && e.message); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER');
  }
}
