// 출장뷔페 진행 건 — 관리자 '출장뷔페' 화면에서 예약·문의를 골라 계산한 구성을 그 건에 저장하고, 대기·확정·취소를 관리합니다.
//  · 한 예약(또는 문의)에 진행 건 하나. 같은 건을 다시 저장하면 새로 만들지 않고 고칩니다.
//  · 문의와 연결된 건은 문의의 data.catering 에도 같은 구성과 상태를 넣어 문의 목록·상세·예약확정서가 그대로 따라오게 합니다.
//  · 문의 없이 등록한 예약(예약 관리에서 바로 잡은 예약)은 예약번호로만 연결됩니다.
import { json, err, str, isDate, now, uniqueRef, log, kstToday, spaceOk, readJson } from './_lib.js';
import { cateringAdmin } from './_catering.js';

export const CAT_STATUS = { pending: '대기', confirmed: '확정', cancelled: '취소' };
const ACTIVE_INQ = ['문의 접수', '조건 확인', '견적 발송', '결제 대기'];
const COLS = 'co.id, co.ref, co.inquiry_ref, co.booking_code, co.space_id, co.event_date, co.meal_time, co.customer, co.phone, co.people, co.status, co.total, co.data, co.created_at, co.updated_at';
function safe(s) { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export function publicOrder(r) {
  if (!r) return null;
  const d = safe(r.data);
  return { ref: r.ref, inquiry_ref: r.inquiry_ref || '', booking_code: r.booking_code || '', space_id: r.space_id || '', date: r.event_date || '', meal_time: r.meal_time || '',
    customer: r.customer || '', phone: r.phone || '', people: r.people ?? null, status: r.status, status_label: CAT_STATUS[r.status] || r.status, total: r.total ?? null,
    summary: d.summary || '', course: d.course || '', course_name: d.course_name || '', bill_people: d.bill_people ?? null, bbq: d.bbq || '', bbq_name: d.bbq_name || '', beer: d.beer || 0,
    fee: d.fee ?? null, supply: d.supply ?? null, vat: d.vat ?? null, note: d.note || '', version: d.version || '', confirmed_at: d.confirmed_at || '',
    created_at: r.created_at, updated_at: r.updated_at || '',
    ...(r.t_status !== undefined ? { target_status: r.t_status || '', target_kind: r.t_kind || '' } : {}) };
}
// 문의 data.catering 에 넣는 값 (문의 목록·상세·예약확정서가 읽음)
function forInquiry(q, o) {
  return { ...q, by: 'admin', status: o.status, status_label: CAT_STATUS[o.status], order_ref: o.ref, meal_time: o.meal_time || '' };
}
async function syncInquiry(env, ref, value) {
  if (!ref) return;
  const t = now();
  if (value) await env.DB.prepare("UPDATE inquiries SET data = json_set(data, '$.catering', json(?)), updated_at = ? WHERE ref = ?").bind(JSON.stringify(value), t, ref).run();
  else await env.DB.prepare("UPDATE inquiries SET data = json_remove(data, '$.catering.status', '$.catering.status_label', '$.catering.order_ref'), updated_at = ? WHERE ref = ? AND json_extract(data, '$.catering.order_ref') IS NOT NULL").bind(t, ref).run();
}
// 예약 또는 문의 하나의 기본 정보 (이름·연락처·날짜·인원·공간)
async function loadTarget(env, inquiry_ref, booking_code) {
  let b = null, i = null;
  if (booking_code) {
    b = await env.DB.prepare('SELECT booking_code, space_id, inquiry_ref, customer_name, phone, date, headcount, status, start_h, end_h FROM bookings WHERE booking_code = ?').bind(booking_code).first();
    if (!b) return { error: '예약을 찾을 수 없습니다.' };
    if (b.inquiry_ref) inquiry_ref = b.inquiry_ref;
  }
  if (inquiry_ref) {
    i = await env.DB.prepare('SELECT ref, space_id, status, name, phone, event_date, headcount FROM inquiries WHERE ref = ?').bind(inquiry_ref).first();
    if (!i && !b) return { error: '문의를 찾을 수 없습니다.' };
    if (i && !b) b = await env.DB.prepare("SELECT booking_code, space_id, inquiry_ref, customer_name, phone, date, headcount, status, start_h, end_h FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1").bind(i.ref).first();
  }
  return { b, i, inquiry_ref: i ? i.ref : (b && b.inquiry_ref) || '', booking_code: b ? b.booking_code : '' };
}
async function findOrder(env, inquiry_ref, booking_code) {
  if (!inquiry_ref && !booking_code) return null;
  return env.DB.prepare(`SELECT ${COLS} FROM catering_orders co WHERE (? <> '' AND co.inquiry_ref = ?) OR (? <> '' AND co.booking_code = ?) ORDER BY co.id DESC LIMIT 1`)
    .bind(inquiry_ref || '', inquiry_ref || '', booking_code || '', booking_code || '').first();
}
// 문의 하나에 걸린 진행 건 (문의 상세)
export async function cateringOrderFor(env, inquiry_ref, booking_code) { return publicOrder(await findOrder(env, inquiry_ref || '', booking_code || '')); }

// 대시보드 숫자: 대기 · 확정(오늘 이후, 날짜 미정 포함) · 고객이 요청만 하고 아직 계산하지 않은 진행 중 문의
export async function cateringCounts(env) {
  const today = kstToday();
  const one = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0;
  const upcoming = "(co.event_date IS NULL OR co.event_date = '' OR co.event_date >= ?)";
  return {
    catering_pending: await one(`SELECT COUNT(*) AS n FROM catering_orders co WHERE co.status = 'pending' AND ${upcoming}`, today),
    catering_confirmed: await one(`SELECT COUNT(*) AS n FROM catering_orders co WHERE co.status = 'confirmed' AND ${upcoming}`, today),
    catering_requested: await one(`SELECT COUNT(*) AS n FROM inquiries i WHERE i.status IN ('${ACTIVE_INQ.join("','")}', '예약 확정') AND json_extract(i.data, '$.catering') IS NOT NULL
      AND COALESCE(json_extract(i.data, '$.catering.by'), '') <> 'admin' AND (i.event_date IS NULL OR i.event_date = '' OR i.event_date >= ?)
      AND NOT EXISTS (SELECT 1 FROM catering_orders co WHERE co.inquiry_ref = i.ref)`, today)
  };
}
// 예약·문의 행에 붙일 진행 건 요약 (SQL 조각) — b: bookings 별칭, i: inquiries 별칭
export const ORDER_OF_BOOKING = "(SELECT json_object('ref', co.ref, 'status', co.status, 'total', co.total, 'summary', json_extract(co.data, '$.summary')) FROM catering_orders co WHERE co.booking_code = b.booking_code OR (b.inquiry_ref IS NOT NULL AND b.inquiry_ref <> '' AND co.inquiry_ref = b.inquiry_ref) ORDER BY co.id DESC LIMIT 1)";
export const ORDER_OF_INQUIRY = "(SELECT json_object('ref', co.ref, 'status', co.status, 'total', co.total, 'summary', json_extract(co.data, '$.summary')) FROM catering_orders co WHERE co.inquiry_ref = i.ref ORDER BY co.id DESC LIMIT 1)";
export function orderBrief(s) { const o = safe(s); return o && o.ref ? { ref: o.ref, status: o.status, status_label: CAT_STATUS[o.status] || o.status, total: o.total ?? null, summary: o.summary || '' } : null; }

// 관리자 API — admin/[[path]].js 가 로그인 확인 뒤 부릅니다. 처리하지 않는 경로면 null.
export async function cateringOrdersAdmin(request, env, path, method, url) {
  // ---- 불러올 예약·문의 목록 ----
  if (path === 'catering/targets' && method === 'GET') {
    const q = str(url.searchParams.get('q'), 40), scope = str(url.searchParams.get('scope'), 10) || 'upcoming', today = kstToday();
    const like = '%' + q.replace(/[%_]/g, '') + '%', digits = q.replace(/[^0-9]/g, '');
    // 검색어가 있으면 날짜와 관계없이 찾습니다
    const dateB = q ? '1=1' : scope === 'past' ? 'b.date BETWEEN ? AND ?' : 'b.date >= ?';
    const dateI = q ? '1=1' : scope === 'past' ? 'i.event_date BETWEEN ? AND ?' : "(i.event_date IS NULL OR i.event_date = '' OR i.event_date >= ?)";
    const dbind = q ? [] : scope === 'past' ? [addDays(today, -120), addDays(today, -1)] : [today];
    const qB = q ? "AND (b.customer_name LIKE ? OR b.booking_code LIKE ? OR COALESCE(b.inquiry_ref, '') LIKE ?" + (digits.length >= 3 ? " OR REPLACE(b.phone, '-', '') LIKE ?" : '') + ')' : '';
    const qI = q ? "AND (i.name LIKE ? OR i.ref LIKE ?" + (digits.length >= 3 ? " OR REPLACE(i.phone, '-', '') LIKE ?" : '') + ')' : '';
    const qbB = q ? [like, like, like, ...(digits.length >= 3 ? ['%' + digits + '%'] : [])] : [];
    const qbI = q ? [like, like, ...(digits.length >= 3 ? ['%' + digits + '%'] : [])] : [];
    const { results: bks } = await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.inquiry_ref, b.customer_name, b.phone, b.date, b.headcount, b.status, b.start_h, b.end_h,
        json_extract(i.data, '$.start_h') AS i_start, json_extract(i.data, '$.end_h') AS i_end, json_extract(i.data, '$.org') AS org, json_extract(i.data, '$.catering') AS cat, ${ORDER_OF_BOOKING} AS ord
      FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref WHERE b.status <> 'cancelled' AND ${dateB} ${qB} ORDER BY b.date ${scope === 'past' && !q ? 'DESC' : 'ASC'} LIMIT 300`).bind(...dbind, ...qbB).all();
    const { results: inqs } = await env.DB.prepare(`SELECT i.ref, i.space_id, i.status, i.name, i.phone, i.event_date, i.headcount, json_extract(i.data, '$.start_h') AS start_h, json_extract(i.data, '$.end_h') AS end_h,
        json_extract(i.data, '$.t_start') AS t_start, json_extract(i.data, '$.t_end') AS t_end, json_extract(i.data, '$.reserve') AS reserve, json_extract(i.data, '$.org') AS org, json_extract(i.data, '$.catering') AS cat, ${ORDER_OF_INQUIRY} AS ord
      FROM inquiries i WHERE i.status IN ('${ACTIVE_INQ.join("','")}') AND NOT EXISTS (SELECT 1 FROM bookings b2 WHERE b2.inquiry_ref = i.ref AND b2.status <> 'cancelled') AND ${dateI} ${qI}
      ORDER BY CASE WHEN i.event_date IS NULL OR i.event_date = '' THEN 1 ELSE 0 END, i.event_date ${scope === 'past' && !q ? 'DESC' : 'ASC'}, i.created_at DESC LIMIT 300`).bind(...dbind, ...qbI).all();
    const req = (s) => { const c = safe(s); return c && Object.keys(c).length && c.by !== 'admin' ? (c.summary || '출장뷔페 상담 희망') : ''; };
    const items = [];
    for (const b of bks || []) items.push({ kind: 'booking', key: 'B:' + b.booking_code, code: b.booking_code, ref: b.inquiry_ref || '', name: b.customer_name, org: b.org || '', phone: b.phone, date: b.date, space_id: b.space_id,
      start_h: b.start_h ?? b.i_start ?? null, end_h: b.end_h ?? b.i_end ?? null, headcount: b.headcount, status: b.status, request: req(b.cat), order: orderBrief(b.ord) });
    for (const i of inqs || []) items.push({ kind: 'inquiry', key: 'I:' + i.ref, code: '', ref: i.ref, name: i.name, org: i.org || '', phone: i.phone, date: i.event_date || '', space_id: i.space_id || '',
      start_h: i.start_h ?? null, end_h: i.end_h ?? null, t_start: i.t_start || '', t_end: i.t_end || '', headcount: i.headcount, status: i.status, reserve: !!i.reserve, request: req(i.cat), order: orderBrief(i.ord) });
    if (scope !== 'past' || q) items.sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : ((a.start_h ?? 99) - (b.start_h ?? 99)));
    return json({ ok: true, today, scope, items });
  }
  // ---- 진행 건 목록 ----
  if (path === 'catering/orders' && method === 'GET') {
    const sp = url.searchParams, status = str(sp.get('status'), 12), scope = str(sp.get('scope'), 10) || 'upcoming', iref = str(sp.get('inquiry_ref'), 30), code = str(sp.get('booking_code'), 30), today = kstToday();
    if (iref || code) { const r = await findOrder(env, iref, code); return json({ ok: true, item: publicOrder(r) }); }
    const where = [], bind = [];
    if (status && status !== 'active') { if (!CAT_STATUS[status]) return err('상태를 확인해 주세요.'); where.push('co.status = ?'); bind.push(status); }
    if (status === 'active') where.push("co.status IN ('pending','confirmed')");
    if (scope === 'upcoming') { where.push("(co.event_date IS NULL OR co.event_date = '' OR co.event_date >= ?)"); bind.push(today); }
    else if (scope === 'past') { where.push("co.event_date <> '' AND co.event_date < ?"); bind.push(today); }
    const tStatus = "COALESCE((SELECT b.status FROM bookings b WHERE b.booking_code = co.booking_code), (SELECT i.status FROM inquiries i WHERE i.ref = co.inquiry_ref), '')";
    const tKind = "CASE WHEN co.booking_code IS NOT NULL AND co.booking_code <> '' THEN 'booking' ELSE 'inquiry' END";
    const { results } = await env.DB.prepare(`SELECT ${COLS}, ${tStatus} AS t_status, ${tKind} AS t_kind FROM catering_orders co ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE WHEN co.event_date IS NULL OR co.event_date = '' THEN 1 ELSE 0 END, co.event_date ${scope === 'past' ? 'DESC' : 'ASC'}, co.id DESC LIMIT 500`).bind(...bind).all();
    return json({ ok: true, today, statuses: CAT_STATUS, items: (results || []).map(publicOrder), ...(await cateringCounts(env)) });
  }
  // ---- 저장 (예약·문의 하나에 하나 — 이미 있으면 고침) ----
  if (path === 'catering/orders' && method === 'POST') {
    const d = await readJson(request);
    const tg = await loadTarget(env, str(d.inquiry_ref, 30), str(d.booking_code, 30));
    if (tg.error) return err(tg.error, 404, 'NOT_FOUND');
    if (!tg.inquiry_ref && !tg.booking_code) return err('출장뷔페를 연결할 예약이나 문의를 골라 주세요.');
    const cur = await findOrder(env, tg.inquiry_ref, tg.booking_code);
    return saveOrder(env, d, cur, tg);
  }
  const m = path.match(/^catering\/orders\/(CO-[A-Z0-9-]+)$/);
  if (m) {
    const cur = await env.DB.prepare(`SELECT ${COLS} FROM catering_orders co WHERE co.ref = ?`).bind(m[1]).first();
    if (!cur) return err('출장뷔페 진행 건을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    if (method === 'GET') return json({ ok: true, item: publicOrder(cur) });
    if (method === 'PATCH') {
      const d = await readJson(request);
      const tg = await loadTarget(env, cur.inquiry_ref || '', cur.booking_code || '');
      return saveOrder(env, d, cur, tg.error ? { inquiry_ref: cur.inquiry_ref || '', booking_code: cur.booking_code || '' } : tg);
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM catering_orders WHERE ref = ?').bind(cur.ref).run();
      await syncInquiry(env, cur.inquiry_ref, null);
      await log(env, 'catering.deleted', cur.inquiry_ref || cur.booking_code || cur.ref, 'admin', { order: cur.ref });
      return json({ ok: true });
    }
    return err('지원하지 않는 요청입니다.', 405, 'METHOD');
  }
  return null;
}

// 등록·수정 공통. d.config 가 있으면 구성을 다시 계산하고, 없으면 상태·식사 시간 등만 바꿉니다.
async function saveOrder(env, d, cur, tg) {
  const prev = cur ? safe(cur.data) : null;
  let q = prev;
  if (d.config !== undefined) {
    q = cateringAdmin(d.config);
    if (!q || !q.supply) return err('코스나 바베큐·생맥주를 골라 주세요.');
  }
  if (!q) return err('출장뷔페 구성을 골라 주세요.');
  const status = d.status === undefined ? (cur ? cur.status : 'pending') : str(d.status, 12);
  if (!CAT_STATUS[status]) return err('상태는 대기·확정·취소 중에서 골라 주세요.');
  const b = tg.b, i = tg.i, has = (k) => d[k] !== undefined;
  const date = has('date') ? str(d.date, 10) : (cur ? cur.event_date || '' : (b ? b.date : (i ? i.event_date || '' : '')));
  if (date && !isDate(date)) return err('행사일을 확인해 주세요.');
  const o = {
    inquiry_ref: tg.inquiry_ref || (cur && cur.inquiry_ref) || '', booking_code: tg.booking_code || (cur && cur.booking_code) || '',
    space_id: spaceOk(has('space_id') ? d.space_id : (cur ? cur.space_id : (b ? b.space_id : (i ? i.space_id : '')))),
    date, meal_time: has('meal_time') ? str(d.meal_time, 20) : (cur ? cur.meal_time || '' : ''),
    customer: has('customer') && str(d.customer, 80) ? str(d.customer, 80) : (cur ? cur.customer : (i ? i.name : (b ? b.customer_name : ''))) || '(이름 없음)',
    phone: has('phone') ? str(d.phone, 30) : (cur ? cur.phone || '' : (i ? i.phone || '' : (b ? b.phone || '' : ''))),
    people: q.people || q.bill_people || null, status
  };
  const t = now();
  const data = { ...q, confirmed_at: status === 'confirmed' ? ((prev && prev.confirmed_at) || t) : '' };
  let ref = cur ? cur.ref : '';
  if (cur) {
    await env.DB.prepare('UPDATE catering_orders SET inquiry_ref = ?, booking_code = ?, space_id = ?, event_date = ?, meal_time = ?, customer = ?, phone = ?, people = ?, status = ?, total = ?, data = ?, updated_at = ? WHERE ref = ?')
      .bind(o.inquiry_ref || null, o.booking_code || null, o.space_id, o.date || null, o.meal_time, o.customer, o.phone, o.people, o.status, q.total, JSON.stringify(data), t, ref).run();
  } else {
    ref = await uniqueRef(env, 'catering_orders', 'ref', 'CO');
    await env.DB.prepare('INSERT INTO catering_orders (ref, inquiry_ref, booking_code, space_id, event_date, meal_time, customer, phone, people, status, total, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(ref, o.inquiry_ref || null, o.booking_code || null, o.space_id, o.date || null, o.meal_time, o.customer, o.phone, o.people, o.status, q.total, JSON.stringify(data), t, t).run();
  }
  await syncInquiry(env, o.inquiry_ref, forInquiry(q, { ...o, ref }));
  const changed = cur && cur.status !== status;
  await log(env, !cur ? 'catering.created' : changed ? 'catering.status' : 'catering.updated', o.inquiry_ref || o.booking_code || ref, 'admin',
    { order: ref, status, ...(changed ? { from: cur.status } : {}), total: q.total, summary: q.summary });
  const row = await env.DB.prepare(`SELECT ${COLS} FROM catering_orders co WHERE co.ref = ?`).bind(ref).first();
  return json({ ok: true, created: !cur, item: publicOrder(row) });
}
