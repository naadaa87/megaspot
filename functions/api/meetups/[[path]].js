// 모임 홍보·참가자 모집
//  GET  /api/meetups/list                 공개 모임 목록 (모집 중·마감, 날짜 지난 모임은 past=1 일 때만)
//  POST /api/meetups/create               모임 등록 (운영팀 확인 뒤 공개) → 모임번호 + 주최자 관리 링크
//  GET  /api/meetups/MO-…                 모임 상세
//  POST /api/meetups/MO-…/apply           참가 신청 (정원이 차면 대기 신청)
//  POST /api/meetups/MO-…/lookup          신청 확인 (신청번호 + 휴대폰 뒷 4자리)
//  POST /api/meetups/MO-…/cancel          신청 취소 (신청번호 + 휴대폰 뒷 4자리) → 대기자 자동 승급
//  GET  /api/meetups/MO-…/manage?k=…      주최자 관리 (신청자 명단)
//  POST /api/meetups/MO-…/manage?k=…      주최자 관리 (모집 마감·재개·취소, 신청 상태 변경, 공지·정원 수정)
import { json, err, hasDb, readJson, str, num, now, uniqueRef, log, clientIp, tooMany, hit, kstToday, sameOrigin } from '../_lib.js';
import { MEETUP_REF, APP_REF, APP_STATUS, SEAT_STATUS, cleanMeetup, publicMeetup, meetupCounts, promoteWaitlist, meetupToken, meetupKeyOk, manageUrl,
  phoneOk, last4, safeJson, bounded, viewStatus, PUBLIC_STATUS } from '../_platform.js';

const COLS = 'ref, status, title, category, venue, event_date, capacity, featured, verified, data, created_at, updated_at';
const SEATS = `(SELECT COALESCE(SUM(a.people), 0) FROM meetup_apps a WHERE a.meetup_ref = m.ref AND a.status IN ${SEAT_STATUS})`;
const WAITING = "(SELECT COALESCE(SUM(a.people), 0) FROM meetup_apps a WHERE a.meetup_ref = m.ref AND a.status = 'waitlist')";

async function limited(env, key, n, min) { try { if (await tooMany(env, key, n, min)) return true; await hit(env, key, min); } catch {} return false; }
const tooManyErr = () => err('짧은 시간에 너무 많은 요청이 들어왔습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');

async function list(env, url) {
  const q = url.searchParams, today = kstToday();
  const where = ["m.status IN ('open','closed')"], bind = [];
  if (q.get('past') !== '1') { where.push('m.event_date >= ?'); bind.push(today); }
  if (q.get('cat')) { where.push('m.category = ?'); bind.push(str(q.get('cat'), 20)); }
  const venue = str(q.get('venue'), 30);
  if (venue === 'megaspot') where.push("m.venue IN ('megaspot-gundae','megaspot-gundae-2')");
  else if (venue) { where.push('m.venue = ?'); bind.push(venue); }
  if (q.get('q')) { where.push("(m.title LIKE ? OR json_extract(m.data, '$.summary') LIKE ?)"); const s = '%' + str(q.get('q'), 40).replace(/[%_]/g, '') + '%'; bind.push(s, s); }
  if (q.get('featured') === '1') where.push('m.featured = 1');
  const sort = q.get('sort') === 'new' ? 'm.created_at DESC' : q.get('sort') === 'popular' ? 'seats DESC, m.event_date' : 'm.event_date, m.created_at';
  const limit = Math.max(1, Math.min(60, num(q.get('limit')) || 30));
  const { results } = await env.DB.prepare(`SELECT ${COLS}, ${SEATS} AS seats, ${WAITING} AS waiting FROM meetups m WHERE ${where.join(' AND ')} ORDER BY m.featured DESC, ${sort} LIMIT ${limit}`).bind(...bind).all();
  return (results || []).map(r => publicMeetup(r, r, { full: false, today }));
}

async function create(request, env) {
  let d; try { d = await readJson(request, 32 * 1024); } catch (e) { return err(e.message); }
  if (d.website) return json({ ok: true, ref: 'MO-0000-SPAM' });
  if (await limited(env, 'meetup:' + clientIp(request), 4, 30)) return tooManyErr();
  const m = cleanMeetup(d); if (m.error) return err(m.error);
  const phone = phoneOk(d.host_phone); if (!phone) return err('주최자 연락처(휴대폰)를 확인해 주세요. 화면에는 보이지 않습니다.');
  if (!d.agree_privacy) return err('개인정보 수집·이용 동의가 필요합니다.');
  if (!d.agree_rules) return err('모임 운영 기준 동의가 필요합니다.');
  // 메가스팟 예약번호를 적으면 확정 예약인지 확인해 '메가스팟 예약 확인' 표시를 붙입니다
  let verified = 0, booking = '';
  const code = str(d.booking_code, 20).toUpperCase();
  if (code) {
    const b4 = str(d.booking_last4, 4).replace(/\D/g, '');
    const bk = await env.DB.prepare('SELECT booking_code, space_id, date, phone_last4, status FROM bookings WHERE booking_code = ?').bind(code).first();
    if (!bk || bk.phone_last4 !== b4 || !['confirmed', 'completed'].includes(bk.status)) return err('메가스팟 예약을 확인하지 못했습니다. 예약번호와 예약자 휴대폰 뒷 4자리를 확인하거나, 비워 두고 등록해 주세요.', 400, 'BOOKING_NOT_FOUND');
    if (bk.date !== m.date) return err('예약번호의 이용일(' + bk.date + ')과 모임 날짜가 다릅니다. 날짜를 맞춰 주세요.', 400, 'BOOKING_DATE');
    verified = 1; booking = bk.booking_code; m.venue = bk.space_id;
  }
  const data = { ...m, host_phone: phone, host_email: str(d.host_email, 120), booking_code: booking, notice: '', agreed_at: now(), ua: str(request.headers.get('user-agent'), 200) };
  delete data.title; delete data.category; delete data.venue; delete data.date; delete data.capacity;
  const ref = await uniqueRef(env, 'meetups', 'ref', 'MO');
  await env.DB.prepare('INSERT INTO meetups (ref, status, title, category, venue, event_date, capacity, featured, verified, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(ref, 'pending', m.title, m.category, m.venue, m.date, m.capacity, 0, verified, JSON.stringify(data), now()).run();
  await log(env, 'meetup.created', ref, 'organizer', { title: m.title, date: m.date, venue: m.venue, verified });
  const k = await meetupToken(env, ref);
  return json({ ok: true, ref, verified: !!verified, manage_url: manageUrl(new URL(request.url).origin, ref, k) });
}

async function getMeetup(env, ref) { return env.DB.prepare(`SELECT ${COLS} FROM meetups WHERE ref = ?`).bind(ref).first(); }

async function apply(request, env, ref) {
  let d; try { d = await readJson(request, 16 * 1024); } catch (e) { return err(e.message); }
  if (d.website) return json({ ok: true, ref: 'AP-0000-SPAM', status: 'confirmed' });
  if (await limited(env, 'mapply:' + clientIp(request), 10, 10)) return tooManyErr();
  const row = await getMeetup(env, ref);
  if (!row || !PUBLIC_STATUS.includes(row.status)) return err('모임을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const md = safeJson(row.data), today = kstToday(), st = viewStatus(row, today);
  if (row.status === 'cancelled') return err('주최자가 취소한 모임입니다.', 409, 'CANCELLED');
  if (st === 'done') return err('이미 끝난 모임입니다.', 409, 'DONE');
  if (row.status !== 'open' || st === 'closed') return err('모집이 마감된 모임입니다.', 409, 'CLOSED');
  const name = str(d.name, 40), phone = phoneOk(d.phone);
  if (!name || !phone) return err('이름과 휴대폰 번호를 확인해 주세요.');
  const people = bounded(d.people, 1, md.max_per || 1) || 1;
  if (md.question && !str(d.answer, 300)) return err('주최자 질문에 답해 주세요.');
  if (!d.agree_privacy) return err('개인정보 수집·이용 동의가 필요합니다.');
  if (!d.agree_share) return err('주최자에게 신청 정보를 제공하는 데 동의해야 신청할 수 있습니다.');
  const dup = await env.DB.prepare("SELECT ref FROM meetup_apps WHERE meetup_ref = ? AND phone_last4 = ? AND REPLACE(REPLACE(phone, '-', ''), ' ', '') = ? AND status IN ('confirmed','pending','waitlist')").bind(ref, last4(phone), phone.replace(/\D/g, '')).first();
  if (dup) return err('이 휴대폰 번호로 이미 신청하셨습니다. 아래 \'신청 확인\'에서 상태를 볼 수 있습니다.', 409, 'DUPLICATE');
  const c = await meetupCounts(env, ref);
  let status = md.mode === 'approve' ? 'pending' : 'confirmed';
  if (row.capacity && c.seats + people > row.capacity) {
    if (md.waitlist === false) return err('정원이 모두 찼습니다.', 409, 'FULL');
    status = 'waitlist';
  }
  const aref = await uniqueRef(env, 'meetup_apps', 'ref', 'AP'), t = now();
  const data = { answer: str(d.answer, 300), message: str(d.message, 500), agreed_at: t, agree_share: true };
  await env.DB.prepare('INSERT INTO meetup_apps (ref, meetup_ref, status, name, phone, phone_last4, people, data, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(aref, ref, status, name, phone, last4(phone), people, JSON.stringify(data), t).run();
  await log(env, 'meetup.applied', ref, 'participant', { app: aref, status, people });
  let wait_no = 0;
  if (status === 'waitlist') { const w = await env.DB.prepare("SELECT COUNT(*) AS n FROM meetup_apps WHERE meetup_ref = ? AND status = 'waitlist' AND (created_at < ? OR (created_at = ? AND id <= (SELECT id FROM meetup_apps WHERE ref = ?)))").bind(ref, t, t, aref).first(); wait_no = (w || {}).n || 1; }
  return json({ ok: true, ref: aref, status, status_label: APP_STATUS[status], wait_no, people });
}

async function findApp(request, env, ref) {
  let d; try { d = await readJson(request, 4096); } catch (e) { return { e: err(e.message) }; }
  if (await limited(env, 'mlook:' + clientIp(request), 12, 10)) return { e: tooManyErr() };
  const aref = str(d.app_ref, 20).toUpperCase(), l4 = str(d.phone_last4, 4).replace(/\D/g, '');
  if (!APP_REF.test(aref) || l4.length !== 4) return { e: err('신청번호와 휴대폰 뒷 4자리를 확인해 주세요.') };
  const a = await env.DB.prepare('SELECT ref, meetup_ref, status, name, people, phone_last4, created_at FROM meetup_apps WHERE ref = ? AND meetup_ref = ?').bind(aref, ref).first();
  if (!a || a.phone_last4 !== l4) return { e: err('신청 내역을 찾을 수 없습니다. 신청번호와 휴대폰 뒷자리를 확인해 주세요.', 404, 'NOT_FOUND') };
  return { a };
}
async function waitNo(env, ref, aref) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM meetup_apps WHERE meetup_ref = ? AND status = 'waitlist' AND (created_at < (SELECT created_at FROM meetup_apps WHERE ref = ?) OR (created_at = (SELECT created_at FROM meetup_apps WHERE ref = ?) AND id <= (SELECT id FROM meetup_apps WHERE ref = ?)))").bind(ref, aref, aref, aref).first();
  return (r || {}).n || 0;
}
const maskName = (n) => { n = String(n || ''); return n.length <= 1 ? n : n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]; };

async function manage(request, env, ref, url) {
  const isGet = request.method === 'GET';
  let d = {};
  if (!isGet) { try { d = await readJson(request, 16 * 1024); } catch (e) { return err(e.message); } }
  const k = url.searchParams.get('k') || d.k;
  if (!env.CONFIRM_SECRET && !env.ADMIN_KEY) return err('관리 링크를 확인할 서버 설정이 없습니다. 운영팀에 문의해 주세요.', 503, 'NO_SECRET');
  if (await limited(env, 'mmanage:' + clientIp(request), 60, 10)) return tooManyErr();
  if (!(await meetupKeyOk(env, ref, k))) return err('관리 링크가 올바르지 않습니다. 모임을 등록할 때 받은 링크 전체를 열어 주세요.', 403, 'BAD_KEY');
  const row = await getMeetup(env, ref); if (!row) return err('모임을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const t = now();
  if (!isGet) {
    if (!sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN');
    const md = safeJson(row.data);
    if (d.action === 'status') {
      const to = d.status;
      const ok = (to === 'closed' && row.status === 'open') || (to === 'open' && row.status === 'closed') || (to === 'cancelled' && ['open', 'closed', 'pending'].includes(row.status));
      if (!ok) return err(row.status === 'pending' ? '운영팀 확인이 끝난 뒤에 바꿀 수 있습니다.' : '지금 상태에서는 바꿀 수 없습니다.', 409, 'BAD_STATUS');
      await env.DB.prepare('UPDATE meetups SET status = ?, updated_at = ? WHERE ref = ?').bind(to, t, ref).run();
      await log(env, 'meetup.status', ref, 'organizer', { from: row.status, to });
    } else if (d.action === 'app') {
      const aref = str(d.app, 20), to = d.status;
      if (!APP_REF.test(aref) || !Object.prototype.hasOwnProperty.call(APP_STATUS, to)) return err('신청 상태 값이 올바르지 않습니다.');
      const a = await env.DB.prepare('SELECT ref, status FROM meetup_apps WHERE ref = ? AND meetup_ref = ?').bind(aref, ref).first();
      if (!a) return err('신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      await env.DB.prepare('UPDATE meetup_apps SET status = ?, updated_at = ? WHERE ref = ?').bind(to, t, aref).run();
      await log(env, 'meetup.app_status', ref, 'organizer', { app: aref, from: a.status, to });
    } else if (d.action === 'update') {
      const cap = d.capacity === undefined ? row.capacity : bounded(d.capacity, 2, 2000);
      if (!cap) return err('정원은 2명 이상이어야 합니다.');
      const minp = d.min_people === undefined ? (md.min_people || 0) : (bounded(d.min_people, 0, 2000) || 0);
      if (minp > cap) return err('최소 진행 인원이 정원보다 많습니다.');
      const deadline = d.deadline === undefined ? (md.deadline || '') : str(d.deadline, 10);
      if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline > row.event_date)) return err('모집 마감일은 모임 날짜와 같거나 그 전이어야 합니다.');
      const notice = d.notice === undefined ? (md.notice || '') : str(d.notice, 1000);
      await env.DB.prepare("UPDATE meetups SET capacity = ?, data = json_set(data, '$.min_people', ?, '$.deadline', ?, '$.notice', ?), updated_at = ? WHERE ref = ?").bind(cap, minp, deadline, notice, t, ref).run();
      await log(env, 'meetup.updated', ref, 'organizer', { capacity: cap, min_people: minp, deadline, notice: notice ? notice.length : 0 });
      if (cap > (row.capacity || 0)) { const moved = await promoteWaitlist(env, ref, t); if (moved.length) await log(env, 'meetup.promoted', ref, 'system', { apps: moved }); }
    } else return err('알 수 없는 요청입니다.');
  }
  const fresh = await getMeetup(env, ref), md = safeJson(fresh.data);
  const { results } = await env.DB.prepare('SELECT ref, status, name, phone, people, data, created_at, updated_at FROM meetup_apps WHERE meetup_ref = ? ORDER BY created_at, id').bind(ref).all();
  return json({ ok: true, meetup: { ...publicMeetup(fresh, await meetupCounts(env, ref)), raw_status: fresh.status, host_phone: md.host_phone || '', host_email: md.host_email || '', booking_code: md.booking_code || '', reject_reason: md.reject_reason || '' },
    apps: (results || []).map(a => ({ ref: a.ref, status: a.status, status_label: APP_STATUS[a.status] || a.status, name: a.name, phone: a.phone, people: a.people, ...(({ answer, message }) => ({ answer: answer || '', message: message || '' }))(safeJson(a.data)), created_at: a.created_at })) });
}

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const parts = params.path || [], method = request.method.toUpperCase(), url = new URL(request.url);
  try {
    if (parts[0] === 'list' && method === 'GET') return json({ ok: true, items: await list(env, url), today: kstToday() }, 200, { 'cache-control': 'public, max-age=30' });
    if (parts[0] === 'create' && method === 'POST') { if (!sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN'); return await create(request, env); }
    const ref = str(parts[0], 20).toUpperCase();
    if (!MEETUP_REF.test(ref)) return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    if (parts.length === 1 && method === 'GET') {
      const row = await getMeetup(env, ref);
      if (!row || !PUBLIC_STATUS.includes(row.status)) return err('모임을 찾을 수 없거나 아직 공개되지 않았습니다.', 404, 'NOT_FOUND');
      return json({ ok: true, item: publicMeetup(row, await meetupCounts(env, ref)), today: kstToday() });
    }
    if (parts[1] === 'manage' && (method === 'GET' || method === 'POST')) return await manage(request, env, ref, url);
    if (method !== 'POST') return err('허용되지 않은 요청입니다.', 405, 'METHOD');
    if (!sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN');
    if (parts[1] === 'apply') return await apply(request, env, ref);
    if (parts[1] === 'lookup' || parts[1] === 'cancel') {
      const { a, e } = await findApp(request, env, ref); if (e) return e;
      if (parts[1] === 'cancel') {
        if (!['confirmed', 'pending', 'waitlist'].includes(a.status)) return err('이미 취소되었거나 처리가 끝난 신청입니다.', 409, 'BAD_STATUS');
        const t = now();
        await env.DB.prepare("UPDATE meetup_apps SET status = 'cancelled', updated_at = ? WHERE ref = ?").bind(t, a.ref).run();
        await log(env, 'meetup.app_cancelled', ref, 'participant', { app: a.ref, from: a.status });
        if (a.status !== 'waitlist') { const moved = await promoteWaitlist(env, ref, t); if (moved.length) await log(env, 'meetup.promoted', ref, 'system', { apps: moved }); }
        a.status = 'cancelled';
      }
      return json({ ok: true, app: { ref: a.ref, status: a.status, status_label: APP_STATUS[a.status] || a.status, name: maskName(a.name), people: a.people, created_at: String(a.created_at).slice(0, 10), wait_no: a.status === 'waitlist' ? await waitNo(env, ref, a.ref) : 0 } });
    }
    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) { console.error('meetups', e && e.message); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER_ERROR'); }
}
