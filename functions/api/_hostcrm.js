// 호스트센터 통합 관리 — 고객 목록·메모 · 일정(여러 공간) · 휴대폰 캘린더 구독(iCal) (2026-11-13)
//  고객은 휴대폰 번호(숫자만)로 묶습니다. 메가스팟으로 들어온 요청과 호스트가 직접 넣은 예약(전화·카카오톡·다른 플랫폼 등)을 함께 셉니다.
//  캘린더 구독 주소는 추측할 수 없는 긴 토큰을 씁니다. 고객 연락처는 넣지 않고, 호스트가 언제든 주소를 새로 만들어 예전 주소를 끊을 수 있습니다.
import { str, isDate, now, kstToday, randomToken } from './_lib.js';
import { safeJson } from './_platform.js';
import { BOOKING_STATUS } from './_hostplat.js';
import { channelOf } from './_hostbook.js';

export const CUSTOMER_TAGS = { regular: '단골', corp: '기업·단체', followup: '다시 연락', caution: '주의 필요' };
export const phoneKey = p => String(p || '').replace(/\D/g, '');
const KEY_RE = /^\d{9,12}$/;
const DONE = ['confirmed', 'done'];
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const KEY_SQL = "REPLACE(REPLACE(REPLACE(b.phone, '-', ''), '+', ''), ' ', '')";

function tagsOf(v) { let a; try { a = JSON.parse(v || '[]'); } catch { a = []; } return (Array.isArray(a) ? a : []).filter(t => CUSTOMER_TAGS[t]); }
async function notes(env, hostId) {
  const { results } = await env.DB.prepare('SELECT phone_key, memo, tags, updated_at FROM host_customers WHERE host_id = ?').bind(hostId).all();
  return Object.fromEntries((results || []).map(r => [r.phone_key, { memo: r.memo || '', tags: tagsOf(r.tags), updated_at: r.updated_at }]));
}
// 예약 줄들을 고객 한 명으로 묶습니다 (rows 는 최신 접수 순)
function fold(rows, today) {
  const map = new Map();
  for (const r of rows) {
    const key = phoneKey(r.phone); if (!KEY_RE.test(key)) continue;
    const d = safeJson(r.data), ch = channelOf(r.source, d).label;
    let c = map.get(key);
    if (!c) { c = { key, phone: r.phone, name: r.name, org: d.org || '', email: r.email || '', names: [], bookings: 0, used: 0, total: 0, paid: 0, due: 0, last_date: '', next_date: '', first_at: r.created_at, last_at: r.created_at, channels: [], spaces: [] }; map.set(key, c); }
    if (c.names.indexOf(r.name) < 0) c.names.push(r.name);
    if (!c.org && d.org) c.org = d.org; if (!c.email && r.email) c.email = r.email;
    if (c.channels.indexOf(ch) < 0) c.channels.push(ch);
    if (r.space_name && c.spaces.indexOf(r.space_name) < 0) c.spaces.push(r.space_name);
    if (r.created_at < c.first_at) c.first_at = r.created_at; if (r.created_at > c.last_at) c.last_at = r.created_at;
    if (['cancelled', 'declined'].includes(r.status)) continue;
    c.bookings++;
    if (DONE.includes(r.status)) {
      c.used++; c.total += r.amount || 0; c.paid += r.paid || 0; if (r.amount != null) c.due += Math.max(0, r.amount - (r.paid || 0));
      if (r.event_date && r.event_date < today && r.event_date > c.last_date) c.last_date = r.event_date;
    }
    if (['pending', 'confirmed'].includes(r.status) && r.event_date && r.event_date >= today && (!c.next_date || r.event_date < c.next_date)) c.next_date = r.event_date;
  }
  return [...map.values()];
}

export async function listCustomers(env, hostId, { q = '', sort = 'recent', tag = '' } = {}) {
  const { results } = await env.DB.prepare(`SELECT b.status, b.source, b.name, b.phone, b.email, b.event_date, b.amount, b.paid, b.created_at, b.data, s.name AS space_name FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref
    WHERE b.host_id = ? AND b.phone <> '' ORDER BY b.id DESC LIMIT 5000`).bind(hostId).all();
  const today = kstToday(), memo = await notes(env, hostId);
  let list = fold(results || [], today).map(c => ({ ...c, memo: (memo[c.key] || {}).memo || '', tags: (memo[c.key] || {}).tags || [] }));
  const all = list.length, repeat = list.filter(c => c.bookings >= 2).length;
  const term = str(q, 40).toLowerCase(), digits = term.replace(/\D/g, '');
  if (term) list = list.filter(c => c.names.some(n => n.toLowerCase().includes(term)) || (c.org || '').toLowerCase().includes(term) || (c.memo || '').toLowerCase().includes(term) || (digits.length >= 3 && c.key.includes(digits)));
  if (CUSTOMER_TAGS[tag]) list = list.filter(c => c.tags.includes(tag));
  else if (tag === 'repeat') list = list.filter(c => c.bookings >= 2);
  else if (tag === 'due') list = list.filter(c => c.due > 0);
  const by = { recent: (a, b) => b.last_at.localeCompare(a.last_at), next: (a, b) => (a.next_date || '9999').localeCompare(b.next_date || '9999') || b.last_at.localeCompare(a.last_at), count: (a, b) => b.bookings - a.bookings || b.total - a.total, total: (a, b) => b.total - a.total, name: (a, b) => a.name.localeCompare(b.name, 'ko') };
  list.sort(by[sort] || by.recent);
  return { total: all, repeat, items: list.slice(0, 1000) };
}

export async function customerDetail(env, hostId, key) {
  if (!KEY_RE.test(key || '')) return null;
  const { results } = await env.DB.prepare(`SELECT b.*, s.name AS space_name FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref WHERE b.host_id = ? AND ${KEY_SQL} = ? ORDER BY COALESCE(b.event_date, substr(b.created_at, 1, 10)) DESC, b.id DESC LIMIT 300`).bind(hostId, key).all();
  if (!(results || []).length) return null;
  const c = fold(results, kstToday())[0], n = (await notes(env, hostId))[key] || {};
  return { ...c, memo: n.memo || '', tags: n.tags || [], memo_updated_at: n.updated_at || '',
    history: results.map(r => { const ch = channelOf(r.source, safeJson(r.data)); return { code: r.code, space_name: r.space_name, status: r.status, status_label: BOOKING_STATUS[r.status] || r.status, name: r.name, date: r.event_date || '', start: r.start_time || '', end: r.end_time || '', people: r.people, amount: r.amount, paid: r.paid || 0, channel_label: ch.label, created_at: r.created_at }; }) };
}
export async function saveCustomer(env, hostId, key, d) {
  if (!KEY_RE.test(key || '')) return { error: '연락처를 확인해 주세요.' };
  const has = await env.DB.prepare(`SELECT 1 AS x FROM host_bookings b WHERE b.host_id = ? AND ${KEY_SQL} = ? LIMIT 1`).bind(hostId, key).first();
  if (!has) return { error: '이 연락처로 등록된 예약이 없습니다.' };
  const tags = (Array.isArray(d.tags) ? d.tags : []).filter((t, i, a) => CUSTOMER_TAGS[t] && a.indexOf(t) === i);
  await env.DB.prepare('INSERT INTO host_customers (host_id, phone_key, memo, tags, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(host_id, phone_key) DO UPDATE SET memo = excluded.memo, tags = excluded.tags, updated_at = excluded.updated_at')
    .bind(hostId, key, str(d.memo, 2000), JSON.stringify(tags), now()).run();
  return { ok: true, tags };
}

// ---------- 일정 (여러 공간을 한 번에) ----------
const mins = t => { const m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
function span(b) { const s = mins(b.start), e = mins(b.end); if (s === null) return [0, 1440]; if (e === null) return [s, 1440]; return [s, e <= s ? e + 1440 : e]; }
export async function schedule(env, hostId, { from, to, space = '' } = {}) {
  const today = kstToday(); from = isDate(from) ? from : today; to = isDate(to) && to >= from ? to : addDays(from, 30);
  if (to > addDays(from, 100)) to = addDays(from, 100);
  const sp = space ? ' AND b.space_ref = ?' : '', bind = space ? [hostId, from, to, space] : [hostId, from, to];
  const { results } = await env.DB.prepare(`SELECT b.*, s.name AS space_name FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref WHERE b.host_id = ? AND b.event_date BETWEEN ? AND ? AND b.status NOT IN ('cancelled','declined')${sp} ORDER BY b.event_date, COALESCE(b.start_time, ''), b.id`).bind(...bind).all();
  const { results: blocks } = await env.DB.prepare(`SELECT k.space_ref AS space, s.name AS space_name, k.day, k.note FROM host_blocks k JOIN host_spaces s ON s.ref = k.space_ref WHERE s.host_id = ? AND k.day BETWEEN ? AND ?${space ? ' AND k.space_ref = ?' : ''} ORDER BY k.day`).bind(...bind).all();
  const items = (results || []).map(r => { const d = safeJson(r.data), ch = channelOf(r.source, d); return { code: r.code, space: r.space_ref, space_name: r.space_name, status: r.status, status_label: BOOKING_STATUS[r.status] || r.status, name: r.name, org: d.org || '', phone: r.phone || '',
    date: r.event_date, start: r.start_time || '', end: r.end_time || '', people: r.people, amount: r.amount, paid: r.paid || 0, due: r.amount != null ? Math.max(0, r.amount - (r.paid || 0)) : null, channel: ch.kind, channel_label: ch.label, memo: d.memo ? String(d.memo).slice(0, 80) : '', conflict: false }; });
  // 같은 공간·같은 날 시간이 겹치는 예약 대기·확정 건 표시
  const held = items.filter(b => ['pending', 'confirmed'].includes(b.status));
  for (let i = 0; i < held.length; i++) for (let j = i + 1; j < held.length; j++) {
    const a = held[i], b = held[j]; if (a.space !== b.space || a.date !== b.date) continue;
    const x = span(a), y = span(b); if (x[0] < y[1] && y[0] < x[1]) { a.conflict = true; b.conflict = true; }
  }
  return { from, to, today, items, blocks: blocks || [] };
}

// ---------- 휴대폰 캘린더 구독 (iCal) ----------
export const ICAL_RE = /^[A-Za-z0-9_-]{24,64}$/;
export async function icalToken(env, host, { reset = false } = {}) {
  const s = safeJson(host.settings);
  if (s.ical_token && !reset) return s.ical_token;
  s.ical_token = randomToken(24);
  await env.DB.prepare('UPDATE hosts SET settings = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(s), now(), host.id).run();
  return s.ical_token;
}
export async function hostByIcal(env, token) {
  if (!ICAL_RE.test(token || '')) return null;
  const h = await env.DB.prepare("SELECT * FROM hosts WHERE status = 'active' AND json_extract(settings, '$.ical_token') = ?").bind(token).first();
  return h && safeJson(h.settings).ical_token === token ? h : null;
}
// RFC 5545: 쉼표·세미콜론·역슬래시·줄바꿈 이스케이프, 한 줄 75바이트 넘으면 접어 씁니다 (한글이 잘리지 않게 글자 단위로)
const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
export function foldLine(line) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', size = 0, limit = 75;
  for (const ch of line) { const n = enc.encode(ch).length; if (size + n > limit) { out.push(cur); cur = ''; size = 0; limit = 74; } cur += ch; size += n; }
  out.push(cur); return out.join('\r\n ');
}
const stamp = (date, time) => date.replace(/-/g, '') + (time ? 'T' + time.replace(':', '') + '00' : '');
export async function icsFeed(env, host, origin) {
  const today = kstToday(), from = addDays(today, -60), to = addDays(today, 400);
  const { results } = await env.DB.prepare(`SELECT b.*, s.name AS space_name FROM host_bookings b JOIN host_spaces s ON s.ref = b.space_ref WHERE b.host_id = ? AND b.event_date BETWEEN ? AND ? AND b.status IN ('pending','confirmed','done') ORDER BY b.event_date LIMIT 2000`).bind(host.id, from, to).all();
  const { results: blocks } = await env.DB.prepare('SELECT k.space_ref, s.name AS space_name, k.day, k.note FROM host_blocks k JOIN host_spaces s ON s.ref = k.space_ref WHERE s.host_id = ? AND k.day BETWEEN ? AND ? ORDER BY k.day LIMIT 1000').bind(host.id, from, to).all();
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MEGASPOT//Host Center//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText('메가스팟 예약 · ' + (host.company || host.name)), 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'END:STANDARD', 'END:VTIMEZONE'];
  for (const r of results || []) {
    const d = safeJson(r.data), ch = channelOf(r.source, d), st = BOOKING_STATUS[r.status] || r.status;
    const title = `[${r.status === 'pending' ? '예약 대기' : st}] ${r.name}${r.people ? ' ' + r.people + '명' : ''} · ${r.space_name}`;
    const desc = [`예약번호 ${r.code}`, `접수 경로 ${ch.label}`, r.amount != null ? `금액 ${Number(r.amount).toLocaleString('ko-KR')}원 (받은 금액 ${Number(r.paid || 0).toLocaleString('ko-KR')}원)` : '', `호스트센터 ${origin}/host/center/#b=${r.code}`].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', 'UID:' + r.code + '@megaspot.kr', 'DTSTAMP:' + dtstamp);
    if (r.start_time) {
      const s = mins(r.start_time), e = mins(r.end_time), endDate = e !== null && e <= s ? addDays(r.event_date, 1) : r.event_date;
      L.push('DTSTART;TZID=Asia/Seoul:' + stamp(r.event_date, r.start_time), 'DTEND;TZID=Asia/Seoul:' + stamp(endDate, e !== null ? r.end_time : (s + 60 >= 1440 ? '23:59' : String(Math.floor((s + 60) / 60)).padStart(2, '0') + ':' + String((s + 60) % 60).padStart(2, '0'))));
    } else L.push('DTSTART;VALUE=DATE:' + stamp(r.event_date), 'DTEND;VALUE=DATE:' + stamp(addDays(r.event_date, 1)));
    L.push('SUMMARY:' + icsText(title), 'DESCRIPTION:' + icsText(desc), 'STATUS:' + (r.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'), 'END:VEVENT');
  }
  for (const b of blocks || []) L.push('BEGIN:VEVENT', 'UID:block-' + b.space_ref + '-' + b.day + '@megaspot.kr', 'DTSTAMP:' + dtstamp, 'DTSTART;VALUE=DATE:' + stamp(b.day), 'DTEND;VALUE=DATE:' + stamp(addDays(b.day, 1)),
    'SUMMARY:' + icsText('[예약 안 받음] ' + b.space_name + (b.note ? ' · ' + b.note : '')), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  L.push('END:VCALENDAR');
  return L.map(foldLine).join('\r\n') + '\r\n';
}
