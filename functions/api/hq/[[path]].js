// 본사 관리자 API — 입점 호스트 플랫폼 (기존 admin/[[path]].js 와 따로 둔 파일 · 같은 관리자 로그인 쿠키를 씁니다)
//   GET  /api/hq/summary
//   GET  /api/hq/spaces[?status=]            GET/PATCH /api/hq/spaces/SP-…      (입점 심사 · 공개/숨김 · 무료 기간·이용 기간 · 목록 순서)
//   GET  /api/hq/hosts                       PATCH /api/hq/hosts/H-…
//   GET  /api/hq/bookings[?status=&space=&q=] GET /api/hq/bookings/HB-…          (호스트 공간의 문의·예약·결제 기록 확인)
//   GET  /api/hq/addons[?status=&service=]   PATCH /api/hq/addons/AO-…           (본사 부가서비스: 출장뷔페·케이터링·칵테일·사회자/강연자·현장 매니저·디자인)
//   GET  /api/hq/planning[?status=]          PATCH /api/hq/planning/PL-…         (행사 지원 요청)
//   GET  /api/hq/billing[?status=]           PATCH /api/hq/billing/BL-…          (입점 이용료: 계좌이체 입금 확인 · 중도 해지 환불 처리)
//   GET  /api/hq/notices[?status=]                                               (호스트 문자 알림 발송 기록)
import { json, err, hasDb, readJson, str, num, isDate, now, kstToday, log, requireAdmin, sameOrigin } from '../_lib.js';
import { safeJson, httpsUrl } from '../_platform.js';
import { PLATFORM, PLAN, SPACE_STATUS, BOOKING_STATUS, ADDON_STATUS, ADDON_LABEL, PLANNING_STATUS, BILLING_STATUS, TYPE_LABEL, REGION_LABEL, SPACE_REF, BOOKING_CODE, listedUntil, photoUrl, safeArr, addMonths, addDays, bookingToken, planningToken } from '../_hostplat.js';
import { viewBooking, addonsFor } from '../_hostbook.js';
import { PLANNING_NEEDS, PLANNING_REF, publicPlanning } from '../_planning.js';
import { BILL_REF, CANCEL_STATUS, billView, ensurePay, markPaid, finalizeRefund, refundCalc, onlinePay } from '../_hostbilling.js';
import { notifyHost, hostNoticeList, hostNoticeLive } from '../_hostnotify.js';

const d10 = s => String(s || '').slice(0, 10);
function spaceRow(r) {
  const until = listedUntil(r);
  return { ref: r.ref, name: r.name, status: r.status, status_label: SPACE_STATUS[r.status] || r.status, region: r.region, region_label: REGION_LABEL[r.region] || '', address: r.address || '', capacity: r.capacity, area: r.area, tier: r.tier,
    types: safeArr(r.types).map(t => TYPE_LABEL[t] || t), price_from: r.price_from, free_until: r.free_until || '', paid_until: r.paid_until || '', listed_until: until, visible: r.status === 'live' && until >= kstToday(), plan: r.plan || '', boost: r.boost || 0,
    review_note: r.review_note || '', memo: r.memo || '', submitted_at: r.submitted_at || '', approved_at: r.approved_at || '', created_at: r.created_at, updated_at: r.updated_at || '',
    host: { code: r.host_code, name: r.host_name, phone: r.host_phone, email: r.host_email, company: r.host_company || '' }, photos: r.photos ?? undefined, cover: r.cover ? photoUrl(r.cover, true) : '' };
}
const SPACE_SQL = `SELECT s.*, h.code AS host_code, h.name AS host_name, h.phone AS host_phone, h.email AS host_email, h.company AS host_company,
  (SELECT COUNT(*) FROM host_photos p WHERE p.space_ref = s.ref) AS photos, (SELECT p.pid FROM host_photos p WHERE p.space_ref = s.ref ORDER BY p.sort, p.id LIMIT 1) AS cover
  FROM host_spaces s JOIN hosts h ON h.id = s.host_id`;

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const path = (params.path || []).join('/'), method = request.method, url = new URL(request.url), q = url.searchParams;
  if (method !== 'GET' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'ORIGIN');
  try {
    if (path === 'summary' && method === 'GET') {
      const one = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0, t = kstToday();
      return json({ ok: true, review: await one("SELECT COUNT(*) AS n FROM host_spaces WHERE status = 'review'"), live: await one("SELECT COUNT(*) AS n FROM host_spaces WHERE status = 'live' AND (COALESCE(free_until,'') >= ? OR COALESCE(paid_until,'') >= ?)", t, t),
        hosts: await one("SELECT COUNT(*) AS n FROM hosts WHERE status = 'active'"), bookings_new: await one("SELECT COUNT(*) AS n FROM host_bookings WHERE status = 'new'"), bookings_open: await one("SELECT COUNT(*) AS n FROM host_bookings WHERE status IN ('new','quoted','pending','confirmed')"),
        addons_new: await one("SELECT COUNT(*) AS n FROM hq_addons WHERE status = 'new'"), addons_open: await one("SELECT COUNT(*) AS n FROM hq_addons WHERE status IN ('new','talking','confirmed')"), planning_new: await one("SELECT COUNT(*) AS n FROM planning_requests WHERE status = 'new'"),
        // 운영팀이 처리할 이용료 일: 계좌이체 입금 확인 + 중도 해지 환불 + 확인이 필요한 결제
        billing_requested: await one("SELECT COUNT(*) AS n FROM host_billing b LEFT JOIN host_billing_pay p ON p.ref = b.ref WHERE (b.status = 'requested' AND COALESCE(p.method, 'bank') = 'bank') OR (b.status = 'paid' AND p.cancel_status = 'requested') OR COALESCE(p.alert, '') <> ''"),
        expiring: await one("SELECT COUNT(*) AS n FROM host_spaces WHERE status = 'live' AND MAX(COALESCE(free_until,''), COALESCE(paid_until,'')) BETWEEN ? AND ?", t, addDays(t, 14)) });
    }
    // ---------- 입점 공간 · 심사 ----------
    if (path === 'spaces' && method === 'GET') {
      const status = str(q.get('status'), 12), where = [], bind = [];
      if (status === 'expired') { where.push("s.status = 'live' AND MAX(COALESCE(s.free_until,''), COALESCE(s.paid_until,'')) < ?"); bind.push(kstToday()); }
      else if (status) { if (!SPACE_STATUS[status]) return err('상태를 확인해 주세요.'); where.push('s.status = ?'); bind.push(status); }
      const { results } = await env.DB.prepare(`${SPACE_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE s.status WHEN 'review' THEN 0 WHEN 'fix' THEN 1 WHEN 'live' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END, s.id DESC LIMIT 500`).bind(...bind).all();
      const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM host_spaces GROUP BY status').all();
      return json({ ok: true, statuses: SPACE_STATUS, counts: Object.fromEntries((cnt || []).map(c => [c.status, c.n])), items: (results || []).map(spaceRow), today: kstToday(), free_months: PLATFORM.freeMonths });
    }
    let m = path.match(/^spaces\/(SP-[A-Z0-9-]+)$/);
    if (m) {
      if (!SPACE_REF.test(m[1])) return err('공간을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const row = await env.DB.prepare(`${SPACE_SQL} WHERE s.ref = ?`).bind(m[1]).first(); if (!row) return err('공간을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (method === 'PATCH') {
        const d = await readJson(request), a = str(d.action, 12), t = now(), today = kstToday(), set = {};
        if (a === 'approve') {   // 공개 — 처음 승인할 때 무료 등록 기간(2개월)을 자동으로 넣습니다
          if (!['review', 'fix', 'hidden', 'rejected', 'draft'].includes(row.status)) return err('이미 공개 중인 공간입니다.');
          set.status = 'live'; set.approved_at = row.approved_at || t; set.review_note = '';
          if (!row.free_until && !row.paid_until) set.free_until = addDays(addMonths(today, PLATFORM.freeMonths), -1);
        } else if (a === 'fix') { const note = str(d.note, 600); if (!note) return err('호스트에게 알릴 보완 내용을 적어 주세요.'); set.status = 'fix'; set.review_note = note; }
        else if (a === 'reject') { set.status = 'rejected'; set.review_note = str(d.note, 600); }
        else if (a === 'hide') { set.status = 'hidden'; if (d.note !== undefined) set.review_note = str(d.note, 600); }
        else if (a !== 'update') return err('처리할 수 없는 요청입니다.');
        for (const k of ['free_until', 'paid_until']) if (d[k] !== undefined) { const v = str(d[k], 10); if (v && !isDate(v)) return err('날짜를 확인해 주세요.'); set[k] = v || null; }
        if (d.boost !== undefined) set.boost = Math.max(0, Math.min(999, num(d.boost) || 0));
        if (d.memo !== undefined) set.memo = str(d.memo, 2000);
        const keys = Object.keys(set); if (!keys.length) return err('바꿀 내용이 없습니다.');
        await env.DB.prepare(`UPDATE host_spaces SET ${keys.map(k => k + ' = ?').join(', ')}, updated_at = ? WHERE ref = ?`).bind(...keys.map(k => set[k]), t, row.ref).run();
        await log(env, 'hostspace.' + a, row.ref, 'admin', { status: set.status || row.status });
        // 심사 결과는 호스트에게 문자로도 알립니다
        const result = { approve: 'live', fix: 'fix', reject: 'rejected' }[a];
        if (result) await notifyHost(env, row.host_id, 'review', { result, ref: row.ref, space: row.name, free_until: result === 'live' ? (set.free_until || row.free_until || '') : '' }, result + ':' + t);
      } else if (method !== 'GET') return err('지원하지 않는 요청입니다.', 405, 'METHOD');
      const fresh = await env.DB.prepare(`${SPACE_SQL} WHERE s.ref = ?`).bind(row.ref).first();
      const { results: photos } = await env.DB.prepare('SELECT pid FROM host_photos WHERE space_ref = ? ORDER BY sort, id').bind(row.ref).all();
      const st = await env.DB.prepare('SELECT COALESCE(SUM(imp),0) AS imp, COALESCE(SUM(view),0) AS view, COALESCE(SUM(contact),0) AS contact, COALESCE(SUM(sns),0) AS sns, COALESCE(SUM(inquiry),0) AS inquiry FROM host_stats WHERE space_ref = ? AND day >= ?').bind(row.ref, addDays(kstToday(), -29)).first();
      return json({ ok: true, item: { ...spaceRow(fresh), data: safeJson(fresh.data) }, photos: (photos || []).map(p => ({ src: photoUrl(p.pid), thumb: photoUrl(p.pid, true) })), stats30: st, labels: { facilities: Object.fromEntries(PLATFORM.facilities), payMethods: Object.fromEntries(PLATFORM.payMethods) } });
    }
    // ---------- 호스트 ----------
    if (path === 'hosts' && method === 'GET') {
      const { results } = await env.DB.prepare("SELECT h.*, (SELECT COUNT(*) FROM host_spaces s WHERE s.host_id = h.id) AS spaces, (SELECT COUNT(*) FROM host_spaces s WHERE s.host_id = h.id AND s.status = 'live') AS live, (SELECT COUNT(*) FROM host_bookings b WHERE b.host_id = h.id) AS bookings FROM hosts h ORDER BY h.id DESC LIMIT 500").all();
      return json({ ok: true, items: (results || []).map(h => ({ code: h.code, email: h.email, name: h.name, phone: h.phone, company: h.company || '', biz_no: h.biz_no || '', status: h.status, memo: h.memo || '', spaces: h.spaces, live: h.live, bookings: h.bookings, created_at: h.created_at, last_login_at: h.last_login_at || '' })) });
    }
    m = path.match(/^hosts\/(H-[A-Z0-9-]+)$/);
    if (m && method === 'PATCH') {
      const d = await readJson(request), h = await env.DB.prepare('SELECT * FROM hosts WHERE code = ?').bind(m[1]).first(); if (!h) return err('호스트를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const status = ['active', 'blocked'].includes(d.status) ? d.status : h.status;
      await env.DB.prepare('UPDATE hosts SET status = ?, memo = ?, updated_at = ? WHERE id = ?').bind(status, d.memo !== undefined ? str(d.memo, 2000) : h.memo, now(), h.id).run();
      if (status === 'blocked') await env.DB.prepare('DELETE FROM host_sessions WHERE host_id = ?').bind(h.id).run();
      await log(env, 'host.updated', h.code, 'admin', { status });
      return json({ ok: true });
    }
    // ---------- 호스트 공간의 문의·예약 ----------
    if (path === 'bookings' && method === 'GET') {
      const status = str(q.get('status'), 12), space = str(q.get('space'), 20), kw = str(q.get('q'), 40), where = [], bind = [];
      if (status === 'open') where.push("b.status IN ('new','quoted','pending','confirmed')"); else if (status) { if (!BOOKING_STATUS[status]) return err('상태를 확인해 주세요.'); where.push('b.status = ?'); bind.push(status); }
      if (space) { where.push('b.space_ref = ?'); bind.push(space); }
      if (kw) { const like = '%' + kw.replace(/[%_]/g, '') + '%'; where.push('(b.name LIKE ? OR b.code LIKE ? OR s.name LIKE ? OR h.name LIKE ?)'); bind.push(like, like, like, like); }
      const { results } = await env.DB.prepare(`SELECT b.*, s.name AS space_name, s.region AS space_region, h.name AS host_name, h.phone AS host_phone, h.code AS host_code FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref JOIN hosts h ON h.id = b.host_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.id DESC LIMIT 500`).bind(...bind).all();
      const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM host_bookings GROUP BY status').all();
      return json({ ok: true, statuses: BOOKING_STATUS, counts: Object.fromEntries((cnt || []).map(c => [c.status, c.n])), items: (results || []).map(r => { const v = viewBooking(r, 'hq');
        return { code: v.code, status: v.status, status_label: v.status_label, source: v.source, name: v.name, phone: v.phone, date: v.date, start: v.start, end: v.end, people: v.people, amount: v.amount, paid: v.paid, due: v.due, addons: v.addon_labels,
          space: v.space, space_name: r.space_name, region_label: REGION_LABEL[r.space_region] || '', host_name: r.host_name, host_phone: r.host_phone, created_at: v.created_at }; }) });
    }
    m = path.match(/^bookings\/(HB-[A-Z0-9-]+)$/);
    if (m && method === 'GET') {
      if (!BOOKING_CODE.test(m[1])) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const r = await env.DB.prepare('SELECT b.*, s.name AS space_name, s.address AS space_address, h.name AS host_name, h.phone AS host_phone, h.email AS host_email, h.code AS host_code FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref JOIN hosts h ON h.id = b.host_id WHERE b.code = ?').bind(m[1]).first();
      if (!r) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const k = await bookingToken(env, r.code);
      return json({ ok: true, item: { ...viewBooking(r, 'hq'), space_name: r.space_name, space_address: r.space_address || '', host: { code: r.host_code, name: r.host_name, phone: r.host_phone, email: r.host_email } }, hq_addons: await addonsFor(env, r.code),
        customer_url: k ? url.origin + '/spaces/booking/?code=' + r.code + '&k=' + k : '' });
    }
    // ---------- 본사 부가서비스 ----------
    if (path === 'addons' && method === 'GET') {
      const status = str(q.get('status'), 12), service = str(q.get('service'), 12), where = [], bind = [];
      if (status === 'open') where.push("a.status IN ('new','talking','confirmed')"); else if (status) { if (!ADDON_STATUS[status]) return err('상태를 확인해 주세요.'); where.push('a.status = ?'); bind.push(status); }
      if (service) { if (!ADDON_LABEL[service]) return err('서비스를 확인해 주세요.'); where.push('a.service = ?'); bind.push(service); }
      const { results } = await env.DB.prepare(`SELECT a.*, b.status AS booking_status, s.name AS space_name, h.name AS host_name, h.phone AS host_phone FROM hq_addons a LEFT JOIN host_bookings b ON b.code = a.booking_code LEFT JOIN host_spaces s ON s.ref = a.space_ref LEFT JOIN hosts h ON h.id = s.host_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE a.status WHEN 'new' THEN 0 WHEN 'talking' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END, a.id DESC LIMIT 500`).bind(...bind).all();
      const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM hq_addons GROUP BY status').all();
      return json({ ok: true, statuses: ADDON_STATUS, services: ADDON_LABEL, counts: Object.fromEntries((cnt || []).map(c => [c.status, c.n])), items: (results || []).map(a => { const d = safeJson(a.data);
        return { ref: a.ref, service: a.service, label: ADDON_LABEL[a.service] || a.service, status: a.status, status_label: ADDON_STATUS[a.status] || a.status, amount: a.amount, memo: a.memo || '', booking: a.booking_code || '', booking_status: a.booking_status || '',
          booking_status_label: BOOKING_STATUS[a.booking_status] || '', space: a.space_ref || '', space_name: a.space_name || d.space_name || '', address: d.address || '', host_name: a.host_name || '', host_phone: a.host_phone || '',
          name: d.name || '', phone: d.phone || '', email: d.email || '', date: d.date || '', start: d.start || '', end: d.end || '', people: d.people || null, note: d.note || '', created_at: a.created_at, updated_at: a.updated_at || '' }; }) });
    }
    m = path.match(/^addons\/(AO-[A-Z0-9-]+)$/);
    if (m && method === 'PATCH') {
      const d = await readJson(request), a = await env.DB.prepare('SELECT * FROM hq_addons WHERE ref = ?').bind(m[1]).first(); if (!a) return err('요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const status = d.status === undefined ? a.status : str(d.status, 12); if (!ADDON_STATUS[status]) return err('상태를 확인해 주세요.');
      const amount = d.amount === undefined ? a.amount : (d.amount === '' || d.amount === null ? null : Math.max(0, num(d.amount) || 0));
      await env.DB.prepare('UPDATE hq_addons SET status = ?, amount = ?, memo = ?, updated_at = ? WHERE ref = ?').bind(status, amount, d.memo !== undefined ? str(d.memo, 2000) : a.memo, now(), a.ref).run();
      await log(env, 'hqaddon.updated', a.ref, 'admin', { status, amount });
      return json({ ok: true });
    }
    // ---------- 행사 지원 요청 ----------
    if (path === 'planning' && method === 'GET') {
      const status = str(q.get('status'), 12), where = [], bind = [];
      if (status === 'open') where.push("status IN ('new','planning','proposed','won')"); else if (status) { if (!PLANNING_STATUS[status]) return err('상태를 확인해 주세요.'); where.push('status = ?'); bind.push(status); }
      const { results } = await env.DB.prepare(`SELECT * FROM planning_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'planning' THEN 1 WHEN 'proposed' THEN 2 ELSE 3 END, id DESC LIMIT 500`).bind(...bind).all();
      const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM planning_requests GROUP BY status').all();
      const items = []; for (const r of results || []) { const d = safeJson(r.data), k = await planningToken(env, r.ref);
        items.push({ ...publicPlanning(r), phone: r.phone, email: r.email || '', org: d.org || '', hours: d.hours || '', contact_pref: d.contact_pref || '', memo: r.memo || '', proposal_raw: safeJson(r.proposal), updated_at: r.updated_at || '', customer_url: k ? url.origin + '/planning/status/?ref=' + r.ref + '&k=' + k : '' }); }
      return json({ ok: true, statuses: PLANNING_STATUS, needs: PLANNING_NEEDS, counts: Object.fromEntries((cnt || []).map(c => [c.status, c.n])), items });
    }
    m = path.match(/^planning\/(PL-[A-Z0-9-]+)$/);
    if (m && method === 'PATCH') {
      if (!PLANNING_REF.test(m[1])) return err('요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const d = await readJson(request), r = await env.DB.prepare('SELECT * FROM planning_requests WHERE ref = ?').bind(m[1]).first(); if (!r) return err('요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const status = d.status === undefined ? r.status : str(d.status, 12); if (!PLANNING_STATUS[status]) return err('상태를 확인해 주세요.');
      let proposal = r.proposal;
      if (d.proposal !== undefined) { const p = d.proposal || {}, old = safeJson(r.proposal);
        proposal = JSON.stringify({ summary: str(p.summary, 3000), amount: p.amount === '' || p.amount == null ? null : Math.max(0, num(p.amount) || 0), link: httpsUrl(p.link, 300), sent_at: old.sent_at || (str(p.summary, 3000) ? now() : '') }); }
      await env.DB.prepare('UPDATE planning_requests SET status = ?, proposal = ?, memo = ?, updated_at = ? WHERE ref = ?').bind(status, proposal, d.memo !== undefined ? str(d.memo, 2000) : r.memo, now(), r.ref).run();
      await log(env, 'planning.updated', r.ref, 'admin', { status });
      return json({ ok: true });
    }
    // ---------- 입점 이용료 ----------
    if (path === 'billing' && method === 'GET') {
      const status = str(q.get('status'), 12), where = [], bind = [];
      if (status === 'cancel') where.push("b.status = 'paid' AND p.cancel_status = 'requested'");
      else if (status === 'todo') where.push("((b.status = 'requested' AND COALESCE(p.method, 'bank') = 'bank') OR (b.status = 'paid' AND p.cancel_status = 'requested') OR COALESCE(p.alert, '') <> '')");
      else if (status) { if (!BILLING_STATUS[status]) return err('상태를 확인해 주세요.'); where.push('b.status = ?'); bind.push(status); }
      const { results } = await env.DB.prepare(`SELECT b.*, s.name AS space_name, s.free_until, s.paid_until, h.name AS host_name, h.phone AS host_phone, h.email AS host_email, h.company AS host_company, h.biz_no AS host_biz_no,
        p.method AS p_method, p.supply AS p_supply, p.vat AS p_vat, p.mul_no AS p_mul_no, p.pay_type AS p_pay_type, p.pg_state AS p_pg_state, p.pg_refunded AS p_pg_refunded, p.cancel_status AS p_cancel_status, p.cancel_base AS p_cancel_base,
        p.cancel_calc AS p_cancel_calc, p.cancel_reason AS p_cancel_reason, p.cancel_requested_at AS p_cancel_requested_at, p.refund_amount AS p_refund_amount, p.refunded_at AS p_refunded_at, p.refund_memo AS p_refund_memo, p.alert AS p_alert
        FROM host_billing b JOIN host_spaces s ON s.ref = b.space_ref JOIN hosts h ON h.id = b.host_id LEFT JOIN host_billing_pay p ON p.ref = b.ref
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE WHEN b.status = 'paid' AND p.cancel_status = 'requested' THEN 0 WHEN b.status = 'requested' THEN 1 ELSE 2 END, b.id DESC LIMIT 500`).bind(...bind).all();
      return json({ ok: true, statuses: BILLING_STATUS, cancel_statuses: CANCEL_STATUS, plans: PLATFORM.plans, fee: PLATFORM.fee, online: onlinePay(env), items: (results || []).map(b => {
        const p = Object.fromEntries(Object.entries(b).filter(([k]) => k.startsWith('p_')).map(([k, v]) => [k.slice(2), v]));
        return { ...billView(b, b.p_method ? p : null), space_name: b.space_name, free_until: b.free_until || '', paid_until: b.paid_until || '', host_name: b.host_name, host_phone: b.host_phone, host_email: b.host_email, host_company: b.host_company || '', host_biz_no: b.host_biz_no || '',
          data: safeJson(b.data), paid_at: d10(b.paid_at), pay_no: b.p_mul_no ? String(b.p_mul_no).slice(-8) : '', pg_refunded: b.p_pg_refunded || 0, refund_memo: b.p_refund_memo || '', alert: b.p_alert || '' }; }) });
    }
    m = path.match(/^billing\/(BL-[A-Z0-9-]+)$/);
    if (m && method === 'PATCH') {
      if (!BILL_REF.test(m[1])) return err('신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const d = await readJson(request), b = await env.DB.prepare('SELECT * FROM host_billing WHERE ref = ?').bind(m[1]).first(); if (!b) return err('신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (d.action === 'paid') {   // 계좌이체 입금 확인 → 공간의 등록 기간을 늘립니다 (온라인 결제는 페이앱 통보로 자동 처리)
        if (b.status !== 'requested') return err('이미 처리한 신청입니다.');
        const from = str(d.period_from, 10), to = str(d.period_to, 10); if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && to < from)) return err('적용 기간을 확인해 주세요.');
        const plan = PLAN[b.plan], months = plan ? plan.months : b.months, start = from || b.period_from;
        const r = await markPaid(env, b, { payType: 'bank', period: from || to ? { from: start, to: to || addDays(addMonths(start, months), -1) } : null });
        if (!r.ok) return err(r.error || '이미 처리한 신청입니다.');
      } else if (d.action === 'cancel') {   // 결제 전 신청 취소
        if (b.status !== 'requested') return err('이미 처리한 신청입니다.');
        await env.DB.prepare("UPDATE host_billing SET status = 'cancelled' WHERE ref = ? AND status = 'requested'").bind(b.ref).run();
        await log(env, 'hostbilling.cancel', b.ref, 'admin', { space: b.space_ref });
      } else if (d.action === 'refund_done') {   // 중도 해지 환불을 끝냈을 때 (페이앱에서 취소했거나 계좌로 보낸 뒤)
        if (b.status !== 'paid') return err('결제가 끝난 신청만 환불 처리할 수 있습니다.');
        const pay = await ensurePay(env, b), calc = pay.cancel_status === 'requested' ? safeJson(pay.cancel_calc) : refundCalc(b);
        const amount = d.amount === undefined || d.amount === '' || d.amount === null ? calc.refund : num(d.amount);
        if (amount === null || amount < 0 || amount > b.amount) return err('환불 금액을 확인해 주세요. 결제 금액보다 클 수 없습니다.');
        const r = await finalizeRefund(env, b, amount, { by: 'admin', memo: str(d.memo, 300) }); if (!r.ok) return err('이미 처리한 신청입니다.');
      } else if (d.action === 'alert_clear') {   // '확인 필요' 표시 지우기
        await env.DB.prepare('UPDATE host_billing_pay SET alert = NULL, updated_at = ? WHERE ref = ?').bind(now(), b.ref).run();
      } else return err('처리할 수 없는 요청입니다.');
      return json({ ok: true });
    }
    // ---------- 호스트 문자 알림 발송 기록 ----------
    if (path === 'notices' && method === 'GET') {
      const status = str(q.get('status'), 12);
      return json({ ok: true, live: hostNoticeLive(env), items: await hostNoticeList(env, { status }) });
    }
    return err('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
  } catch (e) {
    if (e && /요청이 너무 큽니다|잘못된 요청 형식/.test(e.message || '')) return err(e.message);
    console.error('hq', e && e.message); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER');
  }
}
