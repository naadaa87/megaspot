// 모임 키트 — 초대장 · 참석 응답 · 스크린 준비 내용 (2026-11-21)
//  · 초대장은 메가스팟 확정 예약 1건에 1장. 예약번호 + 예약자 휴대폰 뒷 4자리로 만들고 고칩니다.
//  · 일시·공간은 늘 예약에서 다시 읽어, 예약이 바뀌면 초대장도 함께 바뀝니다.
//  · 참석 응답은 이름·참석 여부·인원·차량 여부·질문 답변만 받습니다(휴대폰 번호 없음). 행사일로부터 30일 뒤 지웁니다.
//  · 초대장과 스크린 준비 내용은 행사일로부터 90일 뒤 지웁니다.
import { str, num, kstToday, isDate } from './_lib.js';
import { hmacToken, tokenEq } from './_confirm.js';

export const THEMES = { chalk: '밝은 기본', cobalt: '코발트', graphite: '차분한 저녁', rust: '따뜻한 오렌지' };
export const RSVP_STATUS = { yes: '참석', maybe: '미정', no: '불참' };
export const KEEP_RSVP_DAYS = 30;
export const KEEP_INVITE_DAYS = 90;
export const MAX_RSVPS = 600;
export const VENUES = {
  'megaspot-gundae': { name: '메가스팟 건대 1호', floor: '한아름건물 2층', note: '190평 홀' },
  'megaspot-gundae-2': { name: '메가스팟 건대 2호', floor: '한아름건물 2층', note: '400평 홀 · 1호 옆 호실' }
};
export const PLACE = {
  road: '서울 광진구 능동로13길 39',
  jibun: '서울 광진구 화양동 10-1',
  building: '한아름건물 2층',
  transit: '지하철 2·7호선 건대입구역 인근',
  parking: '건물 주차장 120여 대(1층·4층 옥상) · 유료 주차권 1시간 4,000원부터'
};

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export function inviteCode(len = 10) {
  const b = crypto.getRandomValues(new Uint8Array(len)); let s = '';
  for (const x of b) s += CODE_CHARS[x % CODE_CHARS.length];
  return s;
}
export const manageKey = (env, id) => hmacToken(env, 'invite:' + id);
export const screenKey = (env, id) => hmacToken(env, 'invite-screen:' + id);
export async function keyOk(env, id, k, kind = 'manage') {
  if (!id || !k) return false;
  const want = kind === 'screen' ? await screenKey(env, id) : await manageKey(env, id);
  return !!want && tokenEq(k, want);
}
export async function links(env, row) {
  return {
    public_url: '/invite/?c=' + row.code,
    manage_url: '/invite/manage/?id=' + row.id + '&k=' + await manageKey(env, row.id),
    screen_url: '/play/?ev=' + row.id + '&s=' + await screenKey(env, row.id)
  };
}

// ---------- 입력 정리 ----------
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export function line(v, max) { return str(v, max * 2).replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max); }
export function text(v, max, lines = 12) {
  return str(v, max * 2).replace(CTRL, '').replace(/\r\n?/g, '\n').split('\n').map(x => x.replace(/[ \t]+/g, ' ').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').split('\n').slice(0, lines).join('\n').trim().slice(0, max);
}
export function hhmm(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(v, 5));
  if (!m) return '';
  const h = +m[1], mi = +m[2];
  return h <= 29 && mi <= 59 ? String(h).padStart(2, '0') + ':' + m[2] : '';
}
export function httpsUrl(v) {
  const s = str(v, 300); if (!s) return '';
  try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password ? u.href.slice(0, 300) : null; } catch { return null; }
}
const clamp = (v, lo, hi, dflt) => { const n = num(v); return n == null ? dflt : Math.max(lo, Math.min(hi, n)); };
const bool = v => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

export function cleanInvite(d, eventDate) {
  const title = line(d.title, 40);
  if (title.length < 2) return { error: '행사 이름을 2자 이상 적어 주세요.' };
  const contact_url = httpsUrl(d.contact_url);
  if (contact_url === null) return { error: '연락 링크는 https:// 로 시작하는 주소만 넣을 수 있습니다.' };
  const schedule = (Array.isArray(d.schedule) ? d.schedule : []).slice(0, 12)
    .map(x => ({ time: hhmm(x && x.time), text: line(x && x.text, 40) })).filter(x => x.text);
  const r = d.rsvp && typeof d.rsvp === 'object' ? d.rsvp : {};
  let deadline = str(r.deadline, 10);
  if (!isDate(deadline) || (eventDate && deadline > eventDate)) deadline = '';
  return {
    title,
    host: line(d.host, 30),
    message: text(d.message, 400),
    entry: hhmm(d.entry),
    schedule,
    notice: text(d.notice, 400),
    contact: line(d.contact, 80),
    contact_url: contact_url || '',
    theme: Object.prototype.hasOwnProperty.call(THEMES, d.theme) ? d.theme : 'chalk',
    rsvp: { open: r.open !== false && r.open !== 0 && r.open !== '0', deadline, ask_party: bool(r.ask_party), ask_car: bool(r.ask_car), question: line(r.question, 60) }
  };
}

export function cleanRsvp(d, inv) {
  const name = line(d.name, 20);
  if (!name) return { error: '이름(또는 단체방에서 쓰는 별명)을 적어 주세요.' };
  const status = Object.prototype.hasOwnProperty.call(RSVP_STATUS, d.status) ? d.status : '';
  if (!status) return { error: '참석, 미정, 불참 가운데 하나를 골라 주세요.' };
  const r = inv.rsvp || {};
  const going = status !== 'no';
  const party = going ? (r.ask_party ? clamp(d.party, 1, 20, 1) : 1) : 0;
  const cars = going && r.ask_car ? clamp(d.cars, 0, 10, 0) : 0;
  const answer = r.question && going ? line(d.answer, 200) : '';
  return { name, status, party, cars, answer };
}

// 스크린 준비 내용 — 웰컴 스크린 · 퀴즈쇼 · 밸런스 게임 · 돌림판 · 추첨 경품 · 빙고
export const QUIZ_TYPES = ['choice', 'ox', 'initial', 'open'];
export const SCREEN_THEMES = ['light', 'dark', 'cobalt'];
export function cleanPlay(p) {
  p = p && typeof p === 'object' ? p : {};
  const w = p.welcome || {}, q = p.quiz || {}, b = p.balance || {}, wh = p.wheel || {}, dr = p.draw || {}, bi = p.bingo || {};
  const sched = a => (Array.isArray(a) ? a : []).slice(0, 12).map(x => ({ time: hhmm(x && x.time), text: line(x && x.text, 40) })).filter(x => x.text);
  const qrUrl = httpsUrl(w.qr_url);
  const questions = (Array.isArray(q.questions) ? q.questions : []).slice(0, 50).map(x => {
    x = x || {};
    const type = QUIZ_TYPES.includes(x.type) ? x.type : 'choice';
    const o = { type, q: text(x.q, 160, 4), time: clamp(x.time, 5, 120, 0), hint: line(x.hint, 60), note: line(x.note, 120) };
    if (type === 'choice') { o.options = [0, 1, 2, 3].map(i => line(Array.isArray(x.options) ? x.options[i] : '', 40)); o.answer = clamp(x.answer, 0, 3, 0); }
    else if (type === 'ox') o.answer = x.answer === 'X' ? 'X' : 'O';
    else o.answer = line(x.answer, 40);
    return o;
  }).filter(x => x.q);
  return {
    welcome: {
      title: line(w.title, 40), message: line(w.message, 80), host: line(w.host, 30), footer: line(w.footer, 80),
      theme: SCREEN_THEMES.includes(w.theme) ? w.theme : 'light',
      qr: ['invite', 'custom', 'none'].includes(w.qr) ? w.qr : 'invite', qr_url: qrUrl || '', qr_label: line(w.qr_label, 30),
      schedule: sched(w.schedule)
    },
    quiz: {
      title: line(q.title, 40), points: clamp(q.points, 1, 1000, 10), time: clamp(q.time, 5, 120, 15),
      teams: (Array.isArray(q.teams) ? q.teams : []).slice(0, 12).map(t => line(t, 16)).filter(Boolean), questions
    },
    balance: {
      time: clamp(b.time, 3, 60, 10),
      items: (Array.isArray(b.items) ? b.items : []).slice(0, 60).map(x => ({ a: line(x && x.a, 40), b: line(x && x.b, 40) })).filter(x => x.a && x.b)
    },
    wheel: { title: line(wh.title, 30), items: (Array.isArray(wh.items) ? wh.items : []).slice(0, 16).map(x => line(x, 20)).filter(Boolean), remove: bool(wh.remove) },
    draw: { prizes: (Array.isArray(dr.prizes) ? dr.prizes : []).slice(0, 20).map(x => ({ name: line(x && x.name, 30), count: clamp(x && x.count, 1, 50, 1) })).filter(x => x.name) },
    bingo: { max: [25, 50, 75].includes(num(bi.max)) ? num(bi.max) : 75, lines: clamp(bi.lines, 1, 5, 1) }
  };
}

// ---------- 화면에 내보내는 값 ----------
export function parse(raw, fallback = {}) { try { const o = JSON.parse(raw || ''); return o && typeof o === 'object' ? o : fallback; } catch { return fallback; } }
// 이용일과 끝나는 시각으로 '행사 전 · 오늘 · 끝남'을 정합니다 (자정을 넘기는 예약은 다음 날 아침까지 '오늘')
export function phaseOf(date, endH, today = kstToday()) {
  if (date > today) return 'before';
  if (date === today) return 'today';
  const next = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + 1)).toISOString().slice(0, 10);
  if (next === today && num(endH) > 24) {
    const hourKst = new Date(Date.now() + 9 * 3600e3).getUTCHours();
    if (hourKst < num(endH) - 24) return 'today';
  }
  return 'after';
}
export function rsvpOpen(data, phase, today = kstToday()) {
  const r = data.rsvp || {};
  if (!r.open || phase === 'after') return false;
  return !(r.deadline && today > r.deadline);
}
export function publicInvite(row, data, bk, today = kstToday()) {
  const phase = phaseOf(bk.date, bk.end_h, today);
  const r = data.rsvp || {};
  return {
    code: row.code, title: data.title, host: data.host || '', message: data.message || '', entry: data.entry || '',
    schedule: data.schedule || [], notice: data.notice || '', contact: data.contact || '', contact_url: data.contact_url || '',
    theme: data.theme || 'chalk',
    date: bk.date, start_h: bk.start_h ?? null, end_h: bk.end_h ?? null,
    space: { id: bk.space_id, ...(VENUES[bk.space_id] || { name: '메가스팟', floor: '', note: '' }) },
    place: PLACE, phase,
    rsvp: { open: rsvpOpen(data, phase, today), enabled: !!r.open, deadline: r.deadline || '', ask_party: !!r.ask_party, ask_car: !!r.ask_car, question: r.question || '' }
  };
}
export function summarize(rows) {
  const s = { yes: 0, maybe: 0, no: 0, people: 0, maybe_people: 0, cars: 0, total: rows.length };
  for (const r of rows) {
    if (s[r.status] != null) s[r.status]++;
    if (r.status === 'yes') { s.people += r.party || 0; s.cars += r.cars || 0; }
    if (r.status === 'maybe') s.maybe_people += r.party || 0;
  }
  return s;
}

// 보관 기간이 지난 응답·초대장을 지웁니다 (초대장 화면이 열릴 때마다 가볍게 확인)
export async function purge(env, today = kstToday()) {
  const shift = d => new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - d)).toISOString().slice(0, 10);
  await env.DB.prepare('DELETE FROM invite_rsvps WHERE invite_id IN (SELECT id FROM invites WHERE event_date < ?)').bind(shift(KEEP_RSVP_DAYS)).run();
  await env.DB.prepare('DELETE FROM invites WHERE event_date < ?').bind(shift(KEEP_INVITE_DAYS)).run();
}
