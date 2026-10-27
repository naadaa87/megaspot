// 현장답사 일정 — 예약 문의 고객이 공간을 미리 보러 오는 일정을 관리합니다.
//  · 관리자: 문의 직접 등록 때 함께 등록, 문의 상세에서 추가, '일자별 현장답사' 화면에서 등록·수정·완료 처리
//  · 홈페이지: 예약 신청·간단 문의서의 '현장답사 먼저 하고 싶어요'를 체크하면 '조율 중' 답사 요청으로 들어옵니다
import { json, err, str, num, isDate, now, uniqueRef, log, kstToday, spaceOk } from './_lib.js';

// requested 조율 중(희망만 받음) → scheduled 예정 → done 완료 / noshow 노쇼 / cancelled 취소
export const VISIT_STATUS = { requested: '조율 중', scheduled: '예정', done: '완료', noshow: '노쇼', cancelled: '취소' };
export const VISIT_RESULTS = { booked: '예약 진행', thinking: '고민 중', other: '다른 곳 선택', etc: '기타' };
const ACTIVE = ['requested', 'scheduled'];
const COLS = 'v.id, v.ref, v.inquiry_ref, v.space_id, v.visit_date, v.start_time, v.duration, v.status, v.name, v.phone, v.people, v.staff, v.memo, v.data, v.created_at, v.updated_at';

export function timeOk(v) { const s = str(v, 5); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : ''; }
const mins = (t) => (t ? (+t.slice(0, 2)) * 60 + (+t.slice(3, 5)) : null);
const hhmm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const spKey = (id) => (id === 'megaspot-gundae-2' ? id : 'megaspot-gundae');
function safe(s) { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export function publicVisit(r) {
  const d = safe(r.data);
  return { id: r.id, ref: r.ref, inquiry_ref: r.inquiry_ref || '', space_id: r.space_id, date: r.visit_date || '', time: r.start_time || '', duration: r.duration || 30,
    status: r.status, status_label: VISIT_STATUS[r.status] || r.status, name: r.name, phone: r.phone || '', people: r.people, staff: r.staff || '', memo: r.memo || '',
    source: d.source || 'admin', wish: d.wish || null, result: d.result || '', result_label: VISIT_RESULTS[d.result] || '', result_note: d.result_note || '',
    created_at: r.created_at, updated_at: r.updated_at || '',
    ...(r.inq_status !== undefined ? { inq_status: r.inq_status || '', inq_date: r.inq_date || '', inq_headcount: r.inq_headcount, purpose: r.purpose || '', booking_code: r.booking_code || '' } : {}) };
}

// 입력값 정리 (등록·수정 공통). cur 를 주면 비어 있는 값은 기존 값을 씁니다.
function cleanVisit(d, cur) {
  cur = cur || {};
  const has = (k) => d[k] !== undefined;
  const o = {
    space_id: has('space_id') ? spaceOk(d.space_id) : (cur.space_id || spaceOk('')),
    date: has('date') ? str(d.date, 10) : (cur.visit_date || ''),
    time: has('time') ? timeOk(d.time) : (cur.start_time || ''),
    duration: has('duration') ? Math.max(10, Math.min(240, num(d.duration) || 30)) : (cur.duration || 30),
    name: has('name') ? str(d.name, 60) : (cur.name || ''),
    phone: has('phone') ? str(d.phone, 30).replace(/[^0-9-+ ]/g, '') : (cur.phone || ''),
    people: has('people') ? (num(d.people) ? Math.max(1, Math.min(50, num(d.people))) : null) : (cur.people ?? null),
    staff: has('staff') ? str(d.staff, 30) : (cur.staff || ''),
    memo: has('memo') ? str(d.memo, 1000) : (cur.memo || '')
  };
  if (o.date && !isDate(o.date)) return { error: '답사 날짜를 확인해 주세요.' };
  if (has('time') && str(d.time, 5) && !o.time) return { error: '답사 시간을 확인해 주세요. (예: 14:00)' };
  let status = has('status') ? str(d.status, 12) : (cur.status || '');
  if (status && !Object.prototype.hasOwnProperty.call(VISIT_STATUS, status)) return { error: '답사 상태 값이 올바르지 않습니다.' };
  // 진행 중인 답사는 날짜·시간이 모두 정해지면 '예정', 하나라도 비면 '조율 중'입니다 (완료·노쇼·취소는 그대로)
  if (!status || ACTIVE.includes(status)) status = (o.date && o.time) ? 'scheduled' : 'requested';
  o.status = status;
  return o;
}

// 같은 시간 다른 답사 · 같은 시간 행사(확정 예약)를 찾아 알려 줍니다 (막지는 않음)
async function clashesFor(env, v, excludeId) {
  if (!v.date || !v.time || !ACTIVE.includes(v.status)) return [];
  const a = mins(v.time), b = a + (v.duration || 30), out = [];
  const { results: vs } = await env.DB.prepare(`SELECT id, ref, name, start_time, duration, space_id FROM site_visits WHERE visit_date = ? AND status IN ('requested','scheduled') AND id <> ?`).bind(v.date, excludeId || 0).all();
  for (const x of vs || []) {
    if (spKey(x.space_id) !== spKey(v.space_id) || !x.start_time) continue;
    const xa = mins(x.start_time), xb = xa + (x.duration || 30);
    if (a < xb && xa < b) out.push({ type: 'visit', ref: x.ref, name: x.name, time: x.start_time + '–' + hhmm(xb) });
  }
  const prev = addDays(v.date, -1);
  const { results: bs } = await env.DB.prepare(`SELECT b.booking_code, b.customer_name, b.date, b.space_id, COALESCE(b.start_h, json_extract(i.data, '$.start_h')) AS sh, COALESCE(b.end_h, json_extract(i.data, '$.end_h')) AS eh
    FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref WHERE b.status = 'confirmed' AND b.date IN (?, ?)`).bind(v.date, prev).all();
  for (const x of bs || []) {
    if (spKey(x.space_id) !== spKey(v.space_id)) continue;
    let s, e;
    if (x.sh == null || x.eh == null) { if (x.date !== v.date) continue; s = 0; e = 24 * 60; }
    else if (x.date === v.date) { s = x.sh * 60; e = x.eh * 60; }
    else { if (x.eh <= 24) continue; s = 0; e = (x.eh - 24) * 60; }   // 전날 밤부터 이어지는 예약
    if (a < e && s < b) out.push({ type: 'booking', code: x.booking_code, name: x.customer_name, time: x.sh == null ? '시간 미정' : hhmm(x.date === v.date ? x.sh * 60 : 0) + '–' + hhmm(x.date === v.date ? x.eh * 60 : (x.eh - 24) * 60) });
  }
  return out;
}

// 답사 등록 — 관리자 화면·문의 직접 등록·홈페이지 답사 희망에서 함께 씁니다
export async function createVisit(env, d, { actor = 'admin', source = 'admin', wish = null } = {}) {
  let inq = null;
  const iref = str(d.inquiry_ref, 20).toUpperCase();
  if (iref) {
    inq = await env.DB.prepare('SELECT ref, name, phone, space_id FROM inquiries WHERE ref = ?').bind(iref).first();
    if (!inq) return { error: '연결할 문의를 찾을 수 없습니다. 문의번호를 확인해 주세요.' };
  }
  const v = cleanVisit({ ...d, name: d.name || (inq && inq.name) || '', phone: d.phone || (inq && inq.phone) || '', space_id: d.space_id || (inq && inq.space_id === 'megaspot-gundae-2' ? inq.space_id : (inq ? 'megaspot-gundae' : '')) });
  if (v.error) return v;
  if (!v.name) return { error: '답사 오시는 분 이름을 적어 주세요.' };
  const ref = await uniqueRef(env, 'site_visits', 'ref', 'SV'), t = now();
  const data = { source, ...(wish ? { wish } : {}) };
  if (d.result && VISIT_RESULTS[d.result]) data.result = d.result;
  await env.DB.prepare('INSERT INTO site_visits (ref, inquiry_ref, space_id, visit_date, start_time, duration, status, name, phone, people, staff, memo, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(ref, inq ? inq.ref : null, v.space_id, v.date || null, v.time || null, v.duration, v.status, v.name, v.phone || null, v.people, v.staff || null, v.memo || null, JSON.stringify(data), t).run();
  const row = await env.DB.prepare(`SELECT ${COLS} FROM site_visits v WHERE v.ref = ?`).bind(ref).first();
  await log(env, 'visit.created', inq ? inq.ref : ref, actor, { visit: ref, date: v.date, time: v.time, status: v.status, source });
  return { item: publicVisit(row), clashes: await clashesFor(env, v, row.id) };
}

export async function visitsForInquiry(env, ref) {
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM site_visits v WHERE v.inquiry_ref = ? ORDER BY COALESCE(v.visit_date, '9999'), v.start_time, v.id`).bind(ref).all();
  return (results || []).map(publicVisit);
}

// 대시보드 · 메뉴 숫자
export async function visitCounts(env) {
  const today = kstToday(), in7 = addDays(today, 7);
  const one = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0;
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM site_visits v WHERE v.status IN ('requested','scheduled') AND v.visit_date BETWEEN ? AND ? ORDER BY v.visit_date, v.start_time LIMIT 30`).bind(today, in7).all();
  // 날짜를 아직 못 정한 요청도 대시보드에서 바로 보이도록 앞에 붙입니다
  const { results: und } = await env.DB.prepare(`SELECT ${COLS} FROM site_visits v WHERE v.status = 'requested' AND (v.visit_date IS NULL OR v.visit_date = '') ORDER BY v.created_at LIMIT 10`).all();
  return {
    visits_requested: await one("SELECT COUNT(*) AS n FROM site_visits WHERE status = 'requested'"),
    visits_today: await one("SELECT COUNT(*) AS n FROM site_visits WHERE status IN ('requested','scheduled') AND visit_date = ?", today),
    visits_upcoming: [...(und || []), ...(results || [])].map(publicVisit)
  };
}

// 관리자 API — admin/[[path]].js 가 로그인 확인 뒤 부릅니다. 처리하지 않는 경로면 null.
export async function visitsAdmin(request, env, path, method, url) {
  if (path === 'visits' && method === 'GET') {
    const q = url.searchParams, from = str(q.get('from'), 10), to = str(q.get('to'), 10), status = str(q.get('status'), 12), space = str(q.get('space'), 30);
    if ((from && !isDate(from)) || (to && !isDate(to))) return err('기간을 확인해 주세요.');
    const f = from || '0000-01-01', t = to || '9999-12-31';
    const sel = `SELECT ${COLS}, i.status AS inq_status, i.event_date AS inq_date, i.headcount AS inq_headcount, json_extract(i.data, '$.purpose') AS purpose,
      (SELECT b.booking_code FROM bookings b WHERE b.inquiry_ref = v.inquiry_ref AND b.status <> 'cancelled' ORDER BY b.id DESC LIMIT 1) AS booking_code
      FROM site_visits v LEFT JOIN inquiries i ON i.ref = v.inquiry_ref`;
    const { results: dated } = await env.DB.prepare(`${sel} WHERE v.visit_date BETWEEN ? AND ? ORDER BY v.visit_date, COALESCE(v.start_time, '99'), v.id LIMIT 1000`).bind(f, t).all();
    // 날짜를 아직 정하지 못한 답사 요청은 기간과 관계없이 늘 보여 줍니다
    const { results: und } = await env.DB.prepare(`${sel} WHERE (v.visit_date IS NULL OR v.visit_date = '') AND v.status IN ('requested','scheduled') ORDER BY v.created_at LIMIT 200`).all();
    let items = (dated || []).map(publicVisit), undated = (und || []).map(publicVisit);
    const keep = (x) => (!status || (status === 'active' ? ACTIVE.includes(x.status) : x.status === status)) && (!space || spKey(x.space_id) === space);
    items = items.filter(keep); undated = undated.filter(keep);
    // 겹침: 같은 공간·같은 시간의 다른 답사, 그 시간에 있는 확정 예약(행사)
    if (items.length) {
      const dates = [...new Set(items.filter(x => x.time && ACTIVE.includes(x.status)).map(x => x.date))];
      const minD = dates.length ? addDays(dates.reduce((a, b) => (a < b ? a : b)), -1) : null, maxD = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
      const bks = minD ? ((await env.DB.prepare(`SELECT b.booking_code, b.customer_name, b.date, b.space_id, COALESCE(b.start_h, json_extract(i.data, '$.start_h')) AS sh, COALESCE(b.end_h, json_extract(i.data, '$.end_h')) AS eh
        FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref WHERE b.status = 'confirmed' AND b.date BETWEEN ? AND ?`).bind(minD, maxD).all()).results || []) : [];
      for (const x of items) {
        x.clashes = [];
        if (!x.time || !ACTIVE.includes(x.status)) continue;
        const a = mins(x.time), b = a + x.duration;
        for (const y of items) if (y !== x && y.date === x.date && y.time && ACTIVE.includes(y.status) && spKey(y.space_id) === spKey(x.space_id)) { const ya = mins(y.time), yb = ya + y.duration; if (a < yb && ya < b) x.clashes.push({ type: 'visit', ref: y.ref, name: y.name, time: y.time }); }
        for (const k of bks) {
          if (spKey(k.space_id) !== spKey(x.space_id)) continue;
          let s, e;
          if (k.sh == null || k.eh == null) { if (k.date !== x.date) continue; s = 0; e = 1440; }
          else if (k.date === x.date) { s = k.sh * 60; e = k.eh * 60; }
          else if (k.date === addDays(x.date, -1) && k.eh > 24) { s = 0; e = (k.eh - 24) * 60; }
          else continue;
          if (a < e && s < b) x.clashes.push({ type: 'booking', code: k.booking_code, name: k.customer_name, time: k.sh == null ? '시간 미정' : (k.date === x.date ? hhmm(k.sh * 60) + '–' + hhmm(k.eh * 60) : '전날 밤 ~ ' + hhmm((k.eh - 24) * 60)) });
        }
      }
    }
    return json({ ok: true, from: f, to: t, today: kstToday(), items, undated, statuses: VISIT_STATUS, results: VISIT_RESULTS, ...(await visitCounts(env)) });
  }
  if (path === 'visits' && method === 'POST') {
    let d; try { d = JSON.parse((await request.text()) || '{}') || {}; } catch { return err('잘못된 요청 형식입니다.'); }
    const r = await createVisit(env, d, { actor: 'admin', source: 'admin' });
    if (r.error) return err(r.error);
    return json({ ok: true, ...r });
  }
  const m = path.match(/^visits\/(\d+)$/);
  if (!m) return null;
  const id = +m[1];
  const row = await env.DB.prepare(`SELECT ${COLS} FROM site_visits v WHERE v.id = ?`).bind(id).first();
  if (!row) return err('현장답사 일정을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  if (method === 'GET') return json({ ok: true, item: publicVisit(row), clashes: await clashesFor(env, { date: row.visit_date, time: row.start_time, duration: row.duration, space_id: row.space_id, status: row.status }, id) });
  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM site_visits WHERE id = ?').bind(id).run();
    await log(env, 'visit.deleted', row.inquiry_ref || row.ref, 'admin', { visit: row.ref, date: row.visit_date, time: row.start_time });
    return json({ ok: true });
  }
  if (method === 'PATCH') {
    let d; try { d = JSON.parse((await request.text()) || '{}') || {}; } catch { return err('잘못된 요청 형식입니다.'); }
    const v = cleanVisit(d, row); if (v.error) return err(v.error);
    if (!v.name) return err('답사 오시는 분 이름을 적어 주세요.');
    let inqRef = row.inquiry_ref;
    if (d.inquiry_ref !== undefined) {
      const ir = str(d.inquiry_ref, 20).toUpperCase();
      if (ir) { const iq = await env.DB.prepare('SELECT ref FROM inquiries WHERE ref = ?').bind(ir).first(); if (!iq) return err('연결할 문의를 찾을 수 없습니다. 문의번호를 확인해 주세요.'); inqRef = iq.ref; }
      else inqRef = null;
    }
    const data = safe(row.data);
    if (d.result !== undefined) { if (d.result && !VISIT_RESULTS[d.result]) return err('답사 결과 값이 올바르지 않습니다.'); data.result = d.result || ''; }
    if (d.result_note !== undefined) data.result_note = str(d.result_note, 300);
    const t = now();
    await env.DB.prepare('UPDATE site_visits SET inquiry_ref = ?, space_id = ?, visit_date = ?, start_time = ?, duration = ?, status = ?, name = ?, phone = ?, people = ?, staff = ?, memo = ?, data = ?, updated_at = ? WHERE id = ?')
      .bind(inqRef, v.space_id, v.date || null, v.time || null, v.duration, v.status, v.name, v.phone || null, v.people, v.staff || null, v.memo || null, JSON.stringify(data), t, id).run();
    const changed = [];
    if ((row.visit_date || '') !== (v.date || '') || (row.start_time || '') !== (v.time || '')) changed.push('일시');
    if (row.status !== v.status) changed.push('상태');
    await log(env, 'visit.updated', inqRef || row.ref, 'admin', { visit: row.ref, from: row.status, to: v.status, date: v.date, time: v.time, changed });
    const fresh = await env.DB.prepare(`SELECT ${COLS} FROM site_visits v WHERE v.id = ?`).bind(id).first();
    return json({ ok: true, item: publicVisit(fresh), clashes: await clashesFor(env, v, id) });
  }
  return null;
}
