// 행사 사례 (2026-11-25 · S6) — 주최 측 동의를 받은 행사만 공개합니다.
//  · 관리자 '행사 사례'에서 작성 → 동의 기록(누가·언제·어떻게·무엇을)을 남겨야 공개할 수 있습니다.
//  · 사진·주최 측 이름·주최 측 한마디는 각각 동의 범위에 들어 있어야 공개합니다.
//  · 공개 화면에는 동의한 사람·예약번호·운영 메모를 내보내지 않습니다.
//  · 예약·문의 표는 읽지도 바꾸지도 않습니다(예약번호는 운영 참고용 글자로만 보관).
import { json, err, readJson, str, num, now, uniqueRef, log, kstToday } from './_lib.js';

export const CASE_REF = /^EC-\d{4}-[A-Z0-9]{4}$/;
export const CASE_STATUS = { draft: '작성 중', published: '공개', hidden: '숨김' };
export const CASE_SPACES = { 'megaspot-gundae': '메가스팟 건대 1호', 'megaspot-gundae-2': '메가스팟 건대 2호', both: '메가스팟 건대 1호·2호' };
export const CASE_PURPOSES = { seminar: '세미나·강연', workshop: '워크숍·팀빌딩', networking: '네트워킹·리셉션', community: '정기 모임·커뮤니티', class: '클래스·교육', culture: '공연·상영회', party: '파티·기념행사', popup: '팝업·전시', shooting: '촬영', corporate: '기업 행사', etc: '기타 행사' };
export const CASE_SERVICES = { catering: '출장뷔페', cocktail: '출장 칵테일', reception: '출장 케이터링', manager: '현장 매니저', parking: '주차 등록', invite: '모임 초대장' };
export const CONSENT_METHODS = { kakao: '카카오톡', email: '이메일', phone: '전화', paper: '서면', meeting: '직접 만나서' };
export const CONSENT_SCOPES = { story: '행사 내용 소개', photos: '사진 공개', org_name: '주최 측 이름 공개', quote: '주최 측 한마디 공개' };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const PHOTO = /^\/assets\/img\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp)$/;
const okPhoto = u => (PHOTO.test(u) && !u.includes('..')) || /^https:\/\/[^\s"'<>]{8,300}$/.test(u);

export function safeData(s) { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }

// 입력 정리. 공개 조건 검사는 checkPublish 에서 합니다.
export function cleanCase(d, prev = {}) {
  const o = { ...prev }, set = (k, v) => { if (has(d, k)) o[k] = v; };
  set('title', str(d.title, 60)); set('summary', str(d.summary, 160)); set('body', str(d.body, 4000));
  set('space_id', has(CASE_SPACES, d.space_id) ? d.space_id : '');
  set('purpose', has(CASE_PURPOSES, d.purpose) ? d.purpose : '');
  set('month', /^\d{4}-(0[1-9]|1[0-2])$/.test(String(d.month || '')) ? String(d.month) : '');
  set('headcount', (() => { const n = num(d.headcount); return n && n > 0 && n <= 5000 ? Math.round(n) : null; })());
  set('layout', str(d.layout, 40));
  set('services', (Array.isArray(d.services) ? d.services : []).filter(x => has(CASE_SERVICES, x)).filter((x, i, a) => a.indexOf(x) === i));
  if (has(d, 'photos')) {
    const list = (Array.isArray(d.photos) ? d.photos : []).map(p => typeof p === 'string' ? { src: p } : p || {}).map(p => ({ src: str(p.src, 300), alt: str(p.alt, 80) })).filter(p => p.src);
    const bad = list.find(p => !okPhoto(p.src)); if (bad) return { error: '사진 주소를 확인해 주세요: ' + bad.src + ' (홈페이지 사진 /assets/img/… 또는 https 주소)' };
    o.photos = list.slice(0, 12);
  }
  set('org_label', str(d.org_label, 40)); set('quote', str(d.quote, 200));
  set('booking_code', str(d.booking_code, 20).toUpperCase().replace(/[^A-Z0-9-]/g, ''));
  set('note', str(d.note, 500));
  if (has(d, 'consent')) {
    const c = d.consent || {};
    o.consent = { by: str(c.by, 40), at: /^\d{4}-\d{2}-\d{2}$/.test(String(c.at || '')) ? String(c.at) : '', method: has(CONSENT_METHODS, c.method) ? c.method : '',
      scope: (Array.isArray(c.scope) ? c.scope : []).filter(x => has(CONSENT_SCOPES, x)).filter((x, i, a) => a.indexOf(x) === i), confirmed: c.confirmed === true, memo: str(c.memo, 200) };
  }
  return { data: o };
}
export function checkPublish(x) {
  const c = x.consent || {}, sc = c.scope || [];
  if (!x.title || !x.summary || !x.body) return '제목·한 줄 요약·본문을 모두 적어 주세요.';
  if (!x.space_id) return '어느 공간에서 열린 행사인지 골라 주세요.';
  if (!c.confirmed || !c.by || !c.at || !c.method || !sc.includes('story')) return '주최 측 동의 기록(동의한 사람·날짜·방법, 행사 내용 소개 동의)을 남겨야 공개할 수 있습니다.';
  if (c.at > kstToday()) return '동의 날짜가 오늘보다 뒤입니다.';
  if ((x.photos || []).length && !sc.includes('photos')) return '사진 공개 동의가 없으면 사진을 빼 주세요.';
  if (x.org_label && !sc.includes('org_name')) return "주최 측 이름 공개 동의가 없으면 '주최 측 표기'를 비워 주세요. 비우면 행사 종류로만 소개합니다.";
  if (x.quote && !sc.includes('quote')) return '주최 측 한마디 공개 동의가 없으면 한마디를 비워 주세요.';
  return '';
}
// 공개 화면용 (동의한 사람·예약번호·운영 메모는 넣지 않습니다)
export function publicCase(r) {
  const x = safeData(r.data);
  return { ref: r.ref, title: x.title || '', summary: x.summary || '', body: x.body || '', space_id: x.space_id || '', space_label: CASE_SPACES[x.space_id] || '',
    purpose: x.purpose || '', purpose_label: CASE_PURPOSES[x.purpose] || '', month: x.month || '', headcount: x.headcount || null, layout: x.layout || '',
    services: (x.services || []).map(k => ({ id: k, label: CASE_SERVICES[k] || k })), photos: x.photos || [], org_label: x.org_label || '', quote: x.quote || '',
    consented: true, published_at: r.published_at || r.created_at };
}
function adminCase(r) {
  const x = safeData(r.data);
  return { ...publicCase(r), status: r.status, status_label: CASE_STATUS[r.status] || r.status, consent: x.consent || null, booking_code: x.booking_code || '', note: x.note || '',
    created_at: r.created_at, updated_at: r.updated_at, publish_problem: checkPublish(x) };
}
const PUBLIC_SQL = "status = 'published'";
export async function listPublicCases(env, { limit = 60 } = {}) {
  const { results } = await env.DB.prepare(`SELECT * FROM event_cases WHERE ${PUBLIC_SQL} ORDER BY published_at DESC, id DESC LIMIT ?`).bind(limit).all();
  return (results || []).map(publicCase);
}
export async function getPublicCase(env, ref) {
  if (!CASE_REF.test(ref)) return null;
  const r = await env.DB.prepare(`SELECT * FROM event_cases WHERE ref = ? AND ${PUBLIC_SQL}`).bind(ref).first();
  return r ? publicCase(r) : null;
}

// ---------- 공개 API: GET /api/cases · /api/cases/EC-… ----------
export async function casesPublic({ env, path }) {
  if (!path) return json({ ok: true, items: await listPublicCases(env) }, 200, { 'cache-control': 'public, max-age=60' });
  const ref = path.toUpperCase(), item = await getPublicCase(env, ref);
  return item ? json({ ok: true, item }, 200, { 'cache-control': 'public, max-age=60' }) : err('공개된 사례를 찾지 못했습니다.', 404, 'NOT_FOUND');
}

// ---------- 관리자 API: /api/admin/event-cases… ----------
export async function eventCasesAdmin({ request, env, path, method }) {
  const parts = path.split('/').slice(1), ref = (parts[0] || '').toUpperCase();
  if (!parts.length && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM event_cases ORDER BY CASE status WHEN \'draft\' THEN 0 WHEN \'published\' THEN 1 ELSE 2 END, id DESC LIMIT 300').all();
    const items = (results || []).map(adminCase), counts = {};
    for (const x of items) counts[x.status] = (counts[x.status] || 0) + 1;
    return json({ ok: true, items, counts, options: { spaces: CASE_SPACES, purposes: CASE_PURPOSES, services: CASE_SERVICES, methods: CONSENT_METHODS, scopes: CONSENT_SCOPES } });
  }
  let d = {}; if (method === 'POST' || method === 'PUT') { try { d = await readJson(request); } catch (e) { return err(e.message); } }
  if (!parts.length && method === 'POST') {
    const c = cleanCase(d); if (c.error) return err(c.error);
    if (!c.data.title) return err('제목을 적어 주세요.');
    const t = now(), r = await uniqueRef(env, 'event_cases', 'ref', 'EC');
    await env.DB.prepare("INSERT INTO event_cases (ref, status, data, created_at, updated_at) VALUES (?, 'draft', ?, ?, ?)").bind(r, JSON.stringify(c.data), t, t).run();
    await log(env, 'event_case_create', r, 'admin', { status: 'draft' });
    return json({ ok: true, ref: r });
  }
  if (!CASE_REF.test(ref)) return null;
  const row = await env.DB.prepare('SELECT * FROM event_cases WHERE ref = ?').bind(ref).first();
  if (!row) return err('사례를 찾지 못했습니다.', 404, 'NOT_FOUND');
  const x = safeData(row.data);
  if (parts.length === 1 && method === 'PUT') {
    const c = cleanCase(d, x); if (c.error) return err(c.error);
    if (!c.data.title) return err('제목을 적어 주세요.');
    if (row.status === 'published') { const p = checkPublish(c.data); if (p) return err('공개 중인 사례라 이 상태로는 저장할 수 없습니다. ' + p); }
    await env.DB.prepare('UPDATE event_cases SET data = ?, updated_at = ? WHERE ref = ?').bind(JSON.stringify(c.data), now(), ref).run();
    return json({ ok: true });
  }
  if (parts[1] === 'status' && method === 'POST') {
    const to = d.status; if (!has(CASE_STATUS, to)) return err('상태를 다시 골라 주세요.');
    if (to === 'published') { const p = checkPublish(x); if (p) return err(p); }
    const t = now();
    await env.DB.prepare('UPDATE event_cases SET status = ?, published_at = CASE WHEN ? = \'published\' AND published_at IS NULL THEN ? ELSE published_at END, updated_at = ? WHERE ref = ?').bind(to, to, t, t, ref).run();
    await log(env, 'event_case_status', ref, 'admin', { from: row.status, to });
    return json({ ok: true });
  }
  if (parts.length === 1 && method === 'DELETE') {
    if (row.status !== 'draft' || row.published_at) return err('한 번이라도 공개한 사례는 지우지 않고 숨김으로 둡니다.', 409, 'KEEP');
    await env.DB.prepare('DELETE FROM event_cases WHERE ref = ? AND status = \'draft\' AND published_at IS NULL').bind(ref).run();
    return json({ ok: true });
  }
  return null;
}
