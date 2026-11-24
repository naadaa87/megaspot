// 사전답사 신청 — 고객이 시간을 직접 고르고, 운영팀이 확인해 확정합니다 (2026-11-25)
//
// 기록은 기존 현장답사 표(site_visits)에 함께 둡니다. 고객이 고른 시간은 '조율 중(requested)'으로 들어가고,
// 운영팀이 확정하면 '예정(scheduled)'이 됩니다. 관리자 '현장답사' 화면에서도 그대로 보입니다.
//  · 확정 예약(행사)이 있는 시간과 운영자가 '마감'으로 닫은 날은 고를 수 없습니다.
//  · 다른 답사 팀과는 시간이 겹쳐도 됩니다(동시에 여러 팀 안내 가능).
//  · 고객과 운영팀은 답사 화면에서 글을 주고받습니다(visit_messages).
// 기존 예약·문의 자료는 읽기만 합니다.
import { json, err, str, num, isDate, now, uniqueRef, log, kstToday, readJson, clientIp, tooMany, hit } from './_lib.js';
import { hmacToken, tokenEq } from './_confirm.js';
import { bookingHourSql } from './_booking_availability.js';

export const SETTING_KEY = 'visit_self';
export const DEFAULTS = Object.freeze({ enabled: true, open: '10:00', close: '20:00', step: 30, duration: 30, lead_hours: 3, days_ahead: 30, weekdays: [0, 1, 2, 3, 4, 5, 6], note: '' });
export const SPACES = { 'megaspot-gundae': '메가스팟 건대 1호', 'megaspot-gundae-2': '메가스팟 건대 2호', both: '건대 1호·2호 함께' };
export const STATUS = { requested: '확인 중', scheduled: '확정', done: '답사 완료', noshow: '방문하지 않음', cancelled: '취소' };
const WD = '일월화수목금토';

const mins = t => (+t.slice(0, 2)) * 60 + (+t.slice(3, 5));
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const safe = s => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
const timeOk = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
export const visitKey = (env, ref) => hmacToken(env, 'visit:' + ref);
export const spacesOf = s => (s === 'both' ? ['megaspot-gundae', 'megaspot-gundae-2'] : [s]);
const kstNowMin = () => { const d = new Date(Date.now() + 9 * 36e5); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };

export async function visitSettings(env) {
  let v = {};
  try { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(SETTING_KEY).first(); v = safe(r && r.value); } catch {}
  const o = { ...DEFAULTS, ...v };
  if (!timeOk(o.open)) o.open = DEFAULTS.open;
  if (!timeOk(o.close) || mins(o.close) < mins(o.open)) o.close = DEFAULTS.close;
  o.step = [15, 20, 30, 60].includes(+o.step) ? +o.step : 30;
  o.duration = Math.max(15, Math.min(120, +o.duration || 30));
  o.lead_hours = Math.max(0, Math.min(72, +o.lead_hours || 0));
  o.days_ahead = Math.max(3, Math.min(90, +o.days_ahead || 30));
  o.weekdays = Array.isArray(o.weekdays) ? o.weekdays.map(Number).filter(n => n >= 0 && n <= 6) : DEFAULTS.weekdays;
  o.enabled = o.enabled !== false;
  o.note = str(o.note, 200);
  return o;
}
export async function saveVisitSettings(env, d) {
  const cur = await visitSettings(env);
  const next = { ...cur };
  if (d.enabled !== undefined) next.enabled = !!d.enabled;
  for (const k of ['open', 'close']) if (d[k] !== undefined) { if (!timeOk(d[k])) return { error: '시간은 10:00처럼 적어 주세요.' }; next[k] = d[k]; }
  if (mins(next.close) < mins(next.open)) return { error: '마지막 시작 시각이 첫 시작 시각보다 빠릅니다.' };
  for (const k of ['step', 'duration', 'lead_hours', 'days_ahead']) if (d[k] !== undefined) next[k] = +d[k];
  if (d.weekdays !== undefined) next.weekdays = (Array.isArray(d.weekdays) ? d.weekdays : []).map(Number).filter(n => n >= 0 && n <= 6);
  if (d.note !== undefined) next.note = str(d.note, 200);
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(SETTING_KEY, JSON.stringify(next), now()).run();
  return { item: await visitSettings(env) };
}

// 날짜별로 막힌 구간(분) — 확정 예약 시간 · 마감한 날
async function busyMap(env, spaces, from, to) {
  const busy = {};   // busy[space][date] = [[a,b], ...]  (분, 0~1440)
  for (const sp of spaces) busy[sp] = {};
  const put = (sp, d, a, b, why) => { (busy[sp][d] = busy[sp][d] || []).push([Math.max(0, a), Math.min(1440, b), why]); };
  const ph = spaces.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`SELECT b.space_id, b.date, ${bookingHourSql('b', 'i', 'start_h')} AS sh, ${bookingHourSql('b', 'i', 'end_h')} AS eh
    FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref WHERE b.status = 'confirmed' AND b.space_id IN (${ph}) AND b.date BETWEEN ? AND ?`).bind(...spaces, addDays(from, -1), to).all();
  for (const r of results || []) {
    const sh = Number(r.sh), eh = Number(r.eh);
    if (!Number.isFinite(sh) || !Number.isFinite(eh) || eh <= sh) { put(r.space_id, r.date, 0, 1440, 'booking'); continue; }
    if (sh < 24) put(r.space_id, r.date, sh * 60, Math.min(eh, 24) * 60, 'booking');
    if (eh > 24) put(r.space_id, addDays(r.date, 1), Math.max(sh - 24, 0) * 60, (eh - 24) * 60, 'booking');
  }
  const { results: bl } = await env.DB.prepare(`SELECT space_id, date FROM calendar_blocks WHERE state = 'full' AND space_id IN (${ph}) AND date BETWEEN ? AND ?`).bind(...spaces, from, to).all();
  for (const r of bl || []) put(r.space_id, r.date, 0, 1440, 'closed');
  return busy;
}

// 고를 수 있는 시간 — 공간(1호·2호·함께) · 시작일부터 며칠
export async function slots(env, { space, from, days }) {
  const cfg = await visitSettings(env), spaces = spacesOf(space), today = kstToday(), nowK = kstNowMin();
  const first = isDate(from) && from >= today ? from : today, last = addDays(today, cfg.days_ahead);
  const n = Math.max(1, Math.min(31, +days || 14));
  const to = [addDays(first, n - 1), last].sort()[0];
  const out = [];
  if (!cfg.enabled || first > last) return { cfg, days: out };
  const busy = await busyMap(env, spaces, first, to);
  for (let d = first; d <= to; d = addDays(d, 1)) {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay(), list = [];
    const dayOff = !cfg.weekdays.includes(wd);
    for (let m = mins(cfg.open); m <= mins(cfg.close); m += cfg.step) {
      const a = m, b = m + cfg.duration;
      let why = '';
      if (dayOff) why = 'off';
      else if (d === today && a < nowK.min + cfg.lead_hours * 60) why = 'past';
      else if (d === addDays(today, 1) && cfg.lead_hours > 0 && (1440 - nowK.min) + a < cfg.lead_hours * 60) why = 'past';
      else for (const sp of spaces) for (const [x, y, w] of (busy[sp][d] || [])) if (a < y && x < b) { why = why || w; }
      list.push({ time: hhmm(a), ok: !why, why });
    }
    out.push({ date: d, weekday: WD[wd], open: list.some(x => x.ok), slots: list });
  }
  return { cfg, days: out };
}

async function slotFree(env, space, date, time) {
  const r = await slots(env, { space, from: date, days: 1 });
  const day = r.days.find(x => x.date === date);
  const s = day && day.slots.find(x => x.time === time);
  return s ? s.ok : false;
}

function publicSelf(r, msgs) {
  const d = safe(r.data);
  return { ref: r.ref, space: d.space || r.space_id, space_label: SPACES[d.space || r.space_id] || r.space_id, date: r.visit_date || '', time: r.start_time || '', duration: r.duration || 30,
    status: r.status, status_label: STATUS[r.status] || r.status, name: r.name ? String(r.name).slice(0, 1) + '○○' : '', people: r.people,
    purpose: d.purpose || '', event_date: d.event_date || '', headcount: d.headcount || null, created_at: r.created_at, messages: msgs || [] };
}
async function messagesOf(env, visitId) {
  const { results } = await env.DB.prepare('SELECT id, sender, body, created_at, read_at FROM visit_messages WHERE visit_id = ? ORDER BY id LIMIT 200').bind(visitId).all();
  return (results || []).map(m => ({ id: m.id, sender: m.sender, body: m.body, at: m.created_at, read: !!m.read_at }));
}
const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

// ---------- 고객 API: /api/visit/… ----------
export async function visitPublic({ request, env, path, method, url }) {
  if (path === 'slots' && method === 'GET') {
    const space = url.searchParams.get('space');
    if (!SPACES[space]) return err('공간을 골라 주세요.');
    const r = await slots(env, { space, from: url.searchParams.get('from'), days: url.searchParams.get('days') });
    return json({ ok: true, enabled: r.cfg.enabled, duration: r.cfg.duration, note: r.cfg.note, days_ahead: r.cfg.days_ahead, days: r.days }, 200, { 'cache-control': 'no-store' });
  }
  if (path === 'request' && method === 'POST') {
    let d; try { d = await readJson(request, 4096); } catch (e) { return err(e.message); }
    if (d.website) return json({ ok: true, ref: '', k: '' });   // 자동 입력 방지
    const ipKey = 'visit:' + clientIp(request);
    if (await tooMany(env, ipKey, 5, 30)) return err('짧은 시간에 신청이 많았습니다. 잠시 후 다시 시도하거나 카카오톡으로 문의해 주세요.', 429, 'TOO_MANY');
    const space = str(d.space, 30), date = str(d.date, 10), time = str(d.time, 5);
    const name = str(d.name, 40), phone = str(d.phone, 20).replace(/[^0-9-]/g, ''), digits = phone.replace(/\D/g, '');
    if (!SPACES[space]) return err('답사할 공간을 골라 주세요.');
    if (!isDate(date) || !timeOk(time)) return err('답사 날짜와 시간을 골라 주세요.');
    if (!name) return err('이름을 적어 주세요.');
    if (!/^01\d{8,9}$/.test(digits)) return err('휴대폰 번호를 확인해 주세요.');
    if (!d.agree) return err('개인정보 수집·이용에 동의해 주세요.');
    const cfg = await visitSettings(env);
    if (!cfg.enabled) return err('지금은 홈페이지에서 사전답사 신청을 받지 않습니다. 카카오톡이나 전화로 문의해 주세요.', 409, 'CLOSED');
    if (!(await slotFree(env, space, date, time))) return err('고르신 시간은 예약이 있거나 신청할 수 없는 시간입니다. 다른 시간을 골라 주세요.', 409, 'SLOT_TAKEN');
    await hit(env, ipKey, 30);
    const people = num(d.people) ? Math.max(1, Math.min(20, num(d.people))) : null;
    const extra = { source: 'web-self', space, wish: { date, time }, purpose: str(d.purpose, 40), event_date: isDate(str(d.event_date, 10)) ? str(d.event_date, 10) : '', headcount: num(d.headcount) ? Math.max(1, Math.min(1000, num(d.headcount))) : null };
    const memo = str(d.memo, 500);
    const ref = await uniqueRef(env, 'site_visits', 'ref', 'SV'), t = now();
    const spaceId = spacesOf(space)[0];
    await env.DB.prepare('INSERT INTO site_visits (ref, inquiry_ref, space_id, visit_date, start_time, duration, status, name, phone, people, staff, memo, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(ref, null, spaceId, date, time, cfg.duration, 'requested', name, phone, people, null, null, JSON.stringify(extra), t).run();
    const row = await env.DB.prepare('SELECT id FROM site_visits WHERE ref = ?').bind(ref).first();
    if (memo) await env.DB.prepare('INSERT INTO visit_messages (visit_id, sender, body, created_at) VALUES (?,?,?,?)').bind(row.id, 'customer', memo, t).run();
    await log(env, 'visit.self_requested', ref, 'customer', { space, date, time });
    return json({ ok: true, ref, k: await visitKey(env, ref) }, 200, NO_STORE);
  }
  // 아래는 신청한 분만 (답사번호 + 열쇠)
  const ref = str(url.searchParams.get('ref'), 20).toUpperCase(), k = str(url.searchParams.get('k'), 40);
  let body = null;
  if (method === 'POST') { try { body = await readJson(request, 4096); } catch (e) { return err(e.message); } }
  const R = (body && str(body.ref, 20).toUpperCase()) || ref, K = (body && str(body.k, 40)) || k;
  const vKey = 'visitv:' + clientIp(request);
  if (await tooMany(env, vKey, 60, 10)) return err('짧은 시간에 요청이 많았습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
  if (!/^SV-[A-Z0-9-]{4,16}$/.test(R) || !tokenEq(K, await visitKey(env, R))) { await hit(env, vKey, 10); return err('사전답사 확인 주소가 올바르지 않습니다.', 403, 'BAD_KEY'); }
  const row = await env.DB.prepare('SELECT * FROM site_visits WHERE ref = ?').bind(R).first();
  if (!row) return err('사전답사 신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  if (path === 'view' && method === 'GET') {
    await env.DB.prepare("UPDATE visit_messages SET read_at = ? WHERE visit_id = ? AND sender = 'admin' AND read_at IS NULL").bind(now(), row.id).run();
    return json({ ok: true, item: publicSelf(row, await messagesOf(env, row.id)) }, 200, NO_STORE);
  }
  if (path === 'message' && method === 'POST') {
    const text = str(body.body, 1000);
    if (!text) return err('보낼 내용을 적어 주세요.');
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM visit_messages WHERE visit_id = ? AND sender = 'customer' AND created_at > ?").bind(row.id, new Date(Date.now() - 36e5).toISOString().slice(0, 19).replace('T', ' ')).first();
    if ((cnt && cnt.n) >= 20) return err('한 시간에 보낼 수 있는 글을 넘었습니다. 카카오톡으로 문의해 주세요.', 429, 'TOO_MANY');
    await env.DB.prepare('INSERT INTO visit_messages (visit_id, sender, body, created_at) VALUES (?,?,?,?)').bind(row.id, 'customer', text, now()).run();
    return json({ ok: true, item: publicSelf(row, await messagesOf(env, row.id)) }, 200, NO_STORE);
  }
  if (path === 'cancel' && method === 'POST') {
    if (!['requested', 'scheduled'].includes(row.status)) return err('이미 끝났거나 취소된 답사입니다.', 409, 'DONE');
    const t = now();
    await env.DB.prepare("UPDATE site_visits SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(t, row.id).run();
    await env.DB.prepare('INSERT INTO visit_messages (visit_id, sender, body, created_at) VALUES (?,?,?,?)').bind(row.id, 'customer', '[고객이 사전답사를 취소했습니다]' + (str(body.reason, 300) ? ' ' + str(body.reason, 300) : ''), t).run();
    await log(env, 'visit.self_cancelled', row.ref, 'customer', { date: row.visit_date, time: row.start_time });
    const fresh = await env.DB.prepare('SELECT * FROM site_visits WHERE id = ?').bind(row.id).first();
    return json({ ok: true, item: publicSelf(fresh, await messagesOf(env, row.id)) }, 200, NO_STORE);
  }
  return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
}

// ---------- 관리자 API: /api/admin/visit-requests… ----------
function adminItem(r, extra = {}) {
  const d = safe(r.data);
  return { id: r.id, ref: r.ref, inquiry_ref: r.inquiry_ref || '', space: d.space || r.space_id, space_label: SPACES[d.space || r.space_id] || r.space_id, space_id: r.space_id,
    date: r.visit_date || '', time: r.start_time || '', duration: r.duration || 30, status: r.status, status_label: STATUS[r.status] || r.status,
    name: r.name, phone: r.phone || '', people: r.people, staff: r.staff || '', memo: r.memo || '', source: d.source || 'admin', self: d.source === 'web-self',
    purpose: d.purpose || '', event_date: d.event_date || '', headcount: d.headcount || null, wish: d.wish || null, created_at: r.created_at, updated_at: r.updated_at || '', ...extra };
}
export async function visitRequestsAdmin({ request, env, path, method, url }) {
  if (path === 'visit-requests/settings') {
    if (method === 'GET') return json({ ok: true, item: await visitSettings(env) });
    if (method === 'PUT') { let d; try { d = await readJson(request, 4096); } catch (e) { return err(e.message); } const r = await saveVisitSettings(env, d); return r.error ? err(r.error) : json({ ok: true, ...r }); }
    return err('허용되지 않은 요청입니다.', 405, 'METHOD');
  }
  if (path === 'visit-requests' && method === 'GET') {
    const view = str(url.searchParams.get('view'), 12) || 'open', today = kstToday();
    let where = "json_extract(v.data, '$.source') = 'web-self'", bind = [];
    if (view === 'open') { where += " AND v.status IN ('requested','scheduled') AND (v.visit_date IS NULL OR v.visit_date >= ?)"; bind.push(today); }
    else if (view === 'past') { where += " AND (v.status NOT IN ('requested','scheduled') OR v.visit_date < ?)"; bind.push(today); }
    const { results } = await env.DB.prepare(`SELECT v.*, (SELECT COUNT(*) FROM visit_messages m WHERE m.visit_id = v.id AND m.sender = 'customer' AND m.read_at IS NULL) AS unread,
      (SELECT COUNT(*) FROM visit_messages m WHERE m.visit_id = v.id) AS msgs
      FROM site_visits v WHERE ${where} ORDER BY ${view === 'past' ? 'v.visit_date DESC, v.start_time DESC' : "CASE v.status WHEN 'requested' THEN 0 ELSE 1 END, v.visit_date, v.start_time"} LIMIT 300`).bind(...bind).all();
    // 같은 시간 다른 답사 팀(겹쳐도 되지만 안내 인력 배정을 위해 보여 줌)
    const items = (results || []).map(r => adminItem(r, { unread: r.unread || 0, msgs: r.msgs || 0 }));
    for (const x of items) x.same_time = items.filter(y => y !== x && y.date === x.date && y.time && x.time && ['requested', 'scheduled'].includes(y.status) && Math.abs(mins(y.time) - mins(x.time)) < Math.max(x.duration, y.duration)).map(y => y.ref);
    const counts = await env.DB.prepare(`SELECT SUM(CASE WHEN status = 'requested' THEN 1 ELSE 0 END) AS requested,
      (SELECT COUNT(*) FROM visit_messages m JOIN site_visits s ON s.id = m.visit_id WHERE m.sender = 'customer' AND m.read_at IS NULL AND json_extract(s.data, '$.source') = 'web-self') AS unread
      FROM site_visits WHERE json_extract(data, '$.source') = 'web-self' AND status = 'requested'`).first();
    return json({ ok: true, view, today, items, counts: { requested: (counts && counts.requested) || 0, unread: (counts && counts.unread) || 0 }, statuses: STATUS, spaces: SPACES });
  }
  const m = path.match(/^visit-requests\/(\d+)(?:\/(messages|confirm|cancel|reschedule|status))?$/);
  if (!m) return null;
  const id = +m[1], act = m[2] || '';
  const row = await env.DB.prepare('SELECT * FROM site_visits WHERE id = ?').bind(id).first();
  if (!row) return err('사전답사 신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const link = async () => 'https://megaspot.kr/visit/#ref=' + encodeURIComponent(row.ref) + '&k=' + encodeURIComponent(await visitKey(env, row.ref));
  if (!act && method === 'GET') {
    await env.DB.prepare("UPDATE visit_messages SET read_at = ? WHERE visit_id = ? AND sender = 'customer' AND read_at IS NULL").bind(now(), id).run();
    return json({ ok: true, item: adminItem(row), messages: await messagesOf(env, id), link: await link() });
  }
  if (method !== 'POST') return err('허용되지 않은 요청입니다.', 405, 'METHOD');
  let d; try { d = await readJson(request, 4096); } catch (e) { return err(e.message); }
  const t = now(), note = str(d.message, 1000);
  const say = async text => { if (text) await env.DB.prepare('INSERT INTO visit_messages (visit_id, sender, body, created_at) VALUES (?,?,?,?)').bind(id, 'admin', text, t).run(); };
  if (act === 'messages') {
    if (!note) return err('보낼 내용을 적어 주세요.');
    await say(note);
  } else if (act === 'confirm') {
    if (!['requested', 'scheduled'].includes(row.status)) return err('진행 중인 답사만 확정할 수 있습니다.', 409, 'STATE');
    if (!row.visit_date || !row.start_time) return err('날짜와 시간이 정해져야 확정할 수 있습니다. 시간 바꾸기로 먼저 정해 주세요.');
    await env.DB.prepare("UPDATE site_visits SET status = 'scheduled', staff = COALESCE(?, staff), updated_at = ? WHERE id = ?").bind(str(d.staff, 30) || null, t, id).run();
    await say(note || `사전답사가 확정되었습니다. ${row.visit_date} ${row.start_time}에 뵙겠습니다. 도착하시면 2층 입구에서 연락 주세요.`);
    await log(env, 'visit.self_confirmed', row.ref, 'admin', { date: row.visit_date, time: row.start_time });
  } else if (act === 'reschedule') {
    const date = str(d.date, 10), time = str(d.time, 5);
    if (!isDate(date) || !timeOk(time)) return err('새 날짜와 시간을 확인해 주세요.');
    const space = safe(row.data).space || row.space_id;
    const free = await slotFree(env, space, date, time);
    if (!free && !d.force) return err('그 시간에는 확정 예약이 있거나 신청을 받지 않는 시간입니다. 그래도 정하려면 다시 눌러 주세요.', 409, 'SLOT_TAKEN');
    const status = d.confirm ? 'scheduled' : 'requested';
    await env.DB.prepare('UPDATE site_visits SET visit_date = ?, start_time = ?, status = ?, updated_at = ? WHERE id = ?').bind(date, time, status, t, id).run();
    await say(note || `사전답사 시간을 ${date} ${time}(으)로 ${d.confirm ? '확정했습니다' : '바꿔 드렸습니다. 괜찮으시면 답글로 알려 주세요'}.`);
    await log(env, 'visit.self_rescheduled', row.ref, 'admin', { from: [row.visit_date, row.start_time], to: [date, time], status });
  } else if (act === 'cancel') {
    if (!['requested', 'scheduled'].includes(row.status)) return err('이미 끝났거나 취소된 답사입니다.', 409, 'STATE');
    await env.DB.prepare("UPDATE site_visits SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(t, id).run();
    await say(note || '사전답사가 취소되었습니다. 다른 날짜가 필요하시면 다시 신청하시거나 카카오톡으로 말씀해 주세요.');
    await log(env, 'visit.self_cancelled', row.ref, 'admin', {});
  } else if (act === 'status') {
    const st = str(d.status, 12);
    if (!['done', 'noshow'].includes(st)) return err('바꿀 수 있는 상태는 답사 완료·방문하지 않음입니다.');
    await env.DB.prepare('UPDATE site_visits SET status = ?, updated_at = ? WHERE id = ?').bind(st, t, id).run();
    await log(env, 'visit.self_status', row.ref, 'admin', { status: st });
  }
  const fresh = await env.DB.prepare('SELECT * FROM site_visits WHERE id = ?').bind(id).first();
  return json({ ok: true, item: adminItem(fresh), messages: await messagesOf(env, id), link: await link() });
}
