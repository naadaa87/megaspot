// 입점 공간 공개 API — 검색(지역·인원·날짜) · 상세 · 사진 · 예상 금액 · 예약 요청 · 고객 예약 조회/처리 · 조회·클릭 집계
//   GET  /api/venues/search?region=&people=&date=&type=&sort=
//   GET  /api/venues/item/SP-…        GET /api/venues/photo/<pid>[?t=1]
//   POST /api/venues/estimate         POST /api/venues/request        POST /api/venues/track
//   GET  /api/venues/booking?code=&k= (또는 &p=휴대폰 뒷 4자리)     POST /api/venues/booking
import { json, err, hasDb, readJson, str, num, isDate, kstToday, clientIp, tooMany, hit, sameOrigin } from '../_lib.js';
import { safeJson } from '../_platform.js';
import { tokenEq } from '../_confirm.js';
import { PLATFORM, SPACE_REF, BOOKING_CODE, PHOTO_ID, TYPE_LABEL, REGION_LABEL, visibleSql, cardSpace, publicSpace, estimate, bump, bookingToken, bookingKeyOk, addDays } from '../_hostplat.js';
import { createBooking, viewBooking, customerAction, addonsFor } from '../_hostbook.js';

const NO_DB = () => err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
const COVER = '(SELECT p.pid FROM host_photos p WHERE p.space_ref = s.ref ORDER BY p.sort, p.id LIMIT 1) AS cover';
async function liveSpace(env, ref) {
  if (!SPACE_REF.test(ref || '')) return null; const t = kstToday();
  return env.DB.prepare(`SELECT s.* FROM host_spaces s WHERE s.ref = ? AND ${visibleSql()}`).bind(ref, t, t).first();
}
function bytesOf(b64) { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
// 고객 본인 확인: 조회 링크의 k, 또는 휴대폰 뒷 4자리
async function customerBooking(env, request, code, k, p) {
  if (!BOOKING_CODE.test(code || '')) return { error: err('예약번호를 확인해 주세요.', 404, 'NOT_FOUND') };
  const row = await env.DB.prepare('SELECT * FROM host_bookings WHERE code = ?').bind(code).first();
  if (k) { if (!row || !(await bookingKeyOk(env, code, k))) return { error: err('예약을 찾을 수 없습니다. 주소를 다시 확인해 주세요.', 404, 'NOT_FOUND') }; return { row }; }
  const key = 'hbfind:' + clientIp(request);
  if (await tooMany(env, key, 12, 10)) return { error: err('조회 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY') };
  if (!row || !/^\d{4}$/.test(p || '') || !tokenEq(row.phone_last4 || '', p)) { await hit(env, key, 10); return { error: err('예약번호 또는 휴대폰 뒷 4자리가 맞지 않습니다.', 404, 'NOT_FOUND') }; }
  return { row };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!hasDb(env)) return NO_DB();
  const path = (params.path || []).join('/'), method = request.method, url = new URL(request.url), q = url.searchParams;
  const later = p => { if (typeof context.waitUntil === 'function') context.waitUntil(p.catch(() => {})); else return p.catch(() => {}); };
  if (method !== 'GET' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'ORIGIN');
  try {
    // ---------- 검색 ----------
    if (path === 'search' && method === 'GET') {
      const today = kstToday(), region = REGION_LABEL[q.get('region')] ? q.get('region') : '', people = num(q.get('people')) > 0 ? num(q.get('people')) : 0, date = isDate(q.get('date')) ? q.get('date') : '',
        type = TYPE_LABEL[q.get('type')] ? q.get('type') : '', group = PLATFORM.typeGroups.find(g => g.id === q.get('group')), sort = str(q.get('sort'), 10);
      const where = [visibleSql()], bind = [today, today];
      if (region) { where.push('s.region = ?'); bind.push(region); }
      if (people) { where.push('s.capacity >= ?'); bind.push(people); }
      if (type) { where.push('s.types LIKE ?'); bind.push('%"' + type + '"%'); }
      else if (group) { where.push('(' + group.types.map(() => 's.types LIKE ?').join(' OR ') + ')'); for (const t of group.types) bind.push('%"' + t[0] + '"%'); }
      if (date) { where.push('NOT EXISTS (SELECT 1 FROM host_blocks b WHERE b.space_ref = s.ref AND b.day = ?)'); bind.push(date); }
      const order = sort === 'cap' ? 's.capacity DESC' : sort === 'area' ? 's.area DESC' : sort === 'price' ? 'CASE WHEN s.price_from IS NULL THEN 1 ELSE 0 END, s.price_from ASC' : "s.boost DESC, CASE s.tier WHEN 'mega' THEN 0 ELSE 1 END, s.capacity DESC";
      const busy = date ? ", (SELECT COUNT(*) FROM host_bookings k WHERE k.space_ref = s.ref AND k.event_date = ? AND k.status = 'confirmed') AS busy" : '';
      const { results } = await env.DB.prepare(`SELECT s.*, ${COVER}${busy} FROM host_spaces s WHERE ${where.join(' AND ')} ORDER BY ${order}, s.id DESC LIMIT 120`).bind(...(date ? [date] : []), ...bind).all();
      const { results: reg } = await env.DB.prepare(`SELECT s.region, COUNT(*) AS n FROM host_spaces s WHERE ${visibleSql()} GROUP BY s.region`).bind(today, today).all();
      const items = (results || []).map(r => ({ ...cardSpace(r, r.cover), busy: !!r.busy }));
      if (items.length) await later(bump(env, items.map(i => i.id), 'imp'));
      return json({ ok: true, items, by_region: Object.fromEntries((reg || []).map(r => [r.region, r.n])), total: (reg || []).reduce((a, r) => a + r.n, 0), query: { region, people, date, type } });
    }
    // ---------- 상세 ----------
    let m = path.match(/^item\/(SP-[A-Z0-9-]+)$/);
    if (m && method === 'GET') {
      const row = await liveSpace(env, m[1]); if (!row) return err('공개 중인 공간이 아닙니다.', 404, 'NOT_FOUND');
      const { results: photos } = await env.DB.prepare('SELECT pid, w, h FROM host_photos WHERE space_ref = ? ORDER BY sort, id').bind(row.ref).all();
      const host = await env.DB.prepare('SELECT company, biz_no FROM hosts WHERE id = ?').bind(row.host_id).first();
      const today = kstToday(), { results: blocks } = await env.DB.prepare('SELECT day FROM host_blocks WHERE space_ref = ? AND day BETWEEN ? AND ? ORDER BY day').bind(row.ref, today, addDays(today, 180)).all();
      const { results: busy } = await env.DB.prepare("SELECT event_date AS day, start_time, end_time FROM host_bookings WHERE space_ref = ? AND status = 'confirmed' AND event_date BETWEEN ? AND ? ORDER BY event_date").bind(row.ref, today, addDays(today, 180)).all();
      return json({ ok: true, space: publicSpace(row, photos || [], host), closed: (blocks || []).map(b => b.day), booked: (busy || []).map(b => ({ day: b.day, start: b.start_time || '', end: b.end_time || '' })), addons: PLATFORM.addons, today });
    }
    // ---------- 사진 ----------
    m = path.match(/^photo\/([A-Za-z0-9_-]+)$/);
    if (m && method === 'GET') {
      if (!PHOTO_ID.test(m[1])) return new Response('Not found', { status: 404 });
      const p = await env.DB.prepare('SELECT mime, body, thumb FROM host_photos WHERE pid = ?').bind(m[1]).first(); if (!p) return new Response('Not found', { status: 404 });
      const useThumb = q.get('t') === '1' && p.thumb;
      return new Response(bytesOf(useThumb ? p.thumb : p.body), { headers: { 'content-type': useThumb ? 'image/jpeg' : p.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
    }
    // ---------- 예상 금액 (화면과 접수가 같은 계산을 씁니다) ----------
    if (path === 'estimate' && method === 'POST') {
      const d = await readJson(request), row = await liveSpace(env, str(d.ref, 20)); if (!row) return err('공개 중인 공간이 아닙니다.', 404, 'NOT_FOUND');
      const sel = d.select || {};
      return json({ ok: true, estimate: estimate(safeJson(row.data), { mode: sel.mode, date: str(d.date, 10), start: str(d.start, 5), end: str(d.end, 5), pkg: sel.pkg, people: d.people, options: sel.options }) });
    }
    // ---------- 예약 요청·문의 ----------
    if (path === 'request' && method === 'POST') {
      const d = await readJson(request); if (d.website) return json({ ok: true, code: 'HB-0000-SPAM' });
      const key = 'hbreq:' + clientIp(request); if (await tooMany(env, key, 8, 10)) return err('짧은 시간에 너무 많은 요청이 들어왔습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
      const row = await liveSpace(env, str(d.ref, 20)); if (!row) return err('지금은 예약 요청을 받을 수 없는 공간입니다.', 404, 'NOT_FOUND');
      if (!d.agree_privacy || !d.agree_share) return err('개인정보 수집·이용과 호스트 제공에 동의해 주세요.');
      const date = str(d.date, 10);
      if (date && (await env.DB.prepare('SELECT 1 AS x FROM host_blocks WHERE space_ref = ? AND day = ?').bind(row.ref, date).first())) return err('호스트가 예약을 받지 않는 날짜입니다. 다른 날짜를 골라 주세요.', 409, 'CLOSED');
      const r = await createBooking(env, row, d, { source: 'web' }); if (r.error) return err(r.error);
      await hit(env, key, 10);
      return json({ ok: true, code: r.code, k: await bookingToken(env, r.code), addons: r.addons });
    }
    // ---------- 조회·연락·SNS·찜 집계 ----------
    if (path === 'track' && method === 'POST') {
      const d = await readJson(request), ev = { view: 'view', contact: 'contact', sns: 'sns', fav: 'fav' }[d.ev]; if (!ev) return json({ ok: true });
      const key = 'hbtrack:' + clientIp(request); if (await tooMany(env, key, 240, 10)) return json({ ok: true });
      const row = await liveSpace(env, str(d.ref, 20)); if (row) { await hit(env, key, 10); await later(bump(env, row.ref, ev)); }
      return json({ ok: true });
    }
    // ---------- 고객 예약 조회·처리 ----------
    if (path === 'booking' && (method === 'GET' || method === 'POST')) {
      const d = method === 'POST' ? await readJson(request) : { code: q.get('code'), k: q.get('k'), p: q.get('p') };
      const c = await customerBooking(env, request, str(d.code, 20).toUpperCase(), str(d.k, 40), str(d.p, 4)); if (c.error) return c.error;
      if (method === 'POST') { const r = await customerAction(env, c.row, d); if (r.error) return err(r.error); }
      const row = await env.DB.prepare('SELECT * FROM host_bookings WHERE code = ?').bind(c.row.code).first();
      const space = await env.DB.prepare(`SELECT s.*, ${COVER} FROM host_spaces s WHERE s.ref = ?`).bind(row.space_ref).first();
      const sd = safeJson(space.data), contact = sd.contact || {};
      return json({ ok: true, booking: viewBooking(row, 'customer', space), k: await bookingToken(env, row.code),
        space: { ...cardSpace(space, space.cover), address_full: [space.address, sd.address_detail].filter(Boolean).join(' '), hours: sd.hours || '', refund: sd.refund || {}, rules: sd.rules || {}, parking: sd.parking || {}, facilities: sd.facilities || [],
          // 예약이 확정되면 호스트 연락처를 함께 보여 줍니다
          contact: { phone: contact.phone_public || ['pending', 'confirmed', 'done'].includes(row.status) ? contact.phone || '' : '', kakao: contact.kakao || '' }, seller: { company: (sd.biz && sd.biz.name) || '', biz_no: (sd.biz && sd.biz.no) || '' } },
        hq_addons: await addonsFor(env, row.code) });
    }
    return err('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
  } catch (e) {
    if (e && /요청이 너무 큽니다|잘못된 요청 형식/.test(e.message || '')) return err(e.message);
    console.error('venues', e && e.message); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER');
  }
}
