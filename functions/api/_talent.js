// MC·아나운서·강사·레크리에이션 진행자 섭외 (2026-11-25)
//
//  · 진행자 프로필(talents): 공개 정보(data)와 관리자 전용 정보(private)를 다른 칸에 나눠 둡니다.
//    private 에는 휴대폰·이메일·카카오톡·소속/매니저·출연료 기준·정산 메모가 들어가며,
//    공개 API와 공개 화면을 만드는 쿼리는 private 칸을 아예 읽지 않습니다(PUBLIC_COLS).
//  · 공개 칸(소개·이력·사진 설명 등)에 전화번호·이메일·카카오톡 링크가 들어가면 저장하지 않습니다.
//  · 섭외 요청(talent_requests): 고객이 /mc/ 에서 보낸 요청입니다. 진행자 일정 확인·견적·확정은
//    관리자 화면 'MC·강사 섭외'에서 처리하고, 고객은 접수번호 + 휴대폰 뒷 4자리로 진행 상태만 봅니다.
//  · 처음 한 번, 포트폴리오를 받은 진행자 4명의 공개 정보를 넣어 둡니다(_talent_seed.js). 연락처는 관리자 화면에서 입력합니다.
//  · 문의(inquiries)·예약(bookings) 표는 읽지도 바꾸지도 않습니다. 연결 문의번호는 운영 참고용 글자로만 보관합니다.
import { json, err, readJson, str, num, isDate, now, uniqueRef, log, kstToday, clientIp, tooMany, hit, getMember, randomToken } from './_lib.js';
import { cameFrom } from './inquiry.js';
import { imageKind } from './_community_photos.js';
import { SEED } from './_talent_seed.js';

export const ROLES = { announcer: '공식행사 아나운서', mc: '행사 MC', recreation: '레크리에이션', lecture: '강의·특강', broadcast: '방송·영상 진행' };
export const LANGS = { en: '영어', zh: '중국어', ja: '일본어' };
export const EVENTS = { ceremony: '기념식·개관식·시상식', forum: '포럼·세미나·컨퍼런스', corporate: '기업 행사·워크숍', party: '송년회·신년회·파티', sports: '체육대회·운동회', festival: '축제·공연·음악회', lecture: '특강·교육', global: '국제 행사', etc: '기타 행사' };
export const PLACES = { 'megaspot-gundae': '메가스팟 건대 1호', 'megaspot-gundae-2': '메가스팟 건대 2호', other: '다른 장소', tbd: '아직 정하지 않음' };
export const BUDGETS = { u50: '50만 원 미만', b100: '50만~100만 원', b200: '100만~200만 원', o200: '200만 원 이상', ask: '아직 모르겠어요' };
export const NEEDS = { script: '대본·큐시트 작성', rehearsal: '리허설 참석', meeting: '사전 미팅', online: '온라인 생중계 진행' };
export const REQ_STATUS = { new: '접수', checking: '일정 확인 중', quoted: '견적 안내', confirmed: '섭외 확정', done: '행사 완료', cancelled: '취소' };
export const OPEN_STATUS = ['new', 'checking', 'quoted', 'confirmed'];
export const PROFILE_STATUS = { draft: '준비 중', published: '공개', hidden: '숨김' };
export const VAT = { excl: '부가세 별도', incl: '부가세 포함', none: '부가세 없음' };
export const REF = /^TR-\d{4}-[A-Z0-9]{4}$/;
export const SLUG = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
export const PHOTO_ID = /^[A-Za-z0-9_-]{22}$/;
export const MAX_PICKS = 3;
const PUBLIC_COLS = 'slug, sort, data, published_at, updated_at';   // 공개용 쿼리는 이 칸만 읽습니다 (private 제외)

const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
export const safe = s => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const keys = (v, map, max = 20) => (Array.isArray(v) ? v : []).map(x => String(x)).filter(x => has(map, x)).filter((x, i, a) => a.indexOf(x) === i).slice(0, max);
const lines = (v, n, max) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => str(x, max)).filter(Boolean).slice(0, n);
const timeOk = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '')) ? String(t) : '';
const digits = s => String(s || '').replace(/\D/g, '');
const WD = '일월화수목금토';
export const kdate = d => { if (!isDate(d)) return ''; const [y, m, dd] = d.split('-').map(Number); return `${y}년 ${m}월 ${dd}일 (${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]})`; };
export const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';

// ---------- 연락처가 공개 칸에 섞이지 않게 ----------
const PHONE = /(?:\+?82[-\s.]?)?\(?0\d{1,2}\)?[-\s.]?\d{3,4}[-\s.]?\d{4}/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const KAKAO = /(?:open|pf)\.kakao\.com|qr\.kakao|카톡\s*(?:아이디|id)\s*[:：]|카카오톡\s*(?:아이디|id)\s*[:：]/i;
export const hasContact = s => PHONE.test(s) || EMAIL.test(s) || KAKAO.test(s);

// ---------- 사진 주소 ----------
const ASSET = /^\/assets\/img\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp)$/;
const UPLOAD = /^\/api\/talent\/photo\/[A-Za-z0-9_-]{22}$/;
export const photoOk = u => (ASSET.test(u) && !u.includes('..')) || UPLOAD.test(u) || /^https:\/\/[^\s"'<>]{8,300}$/.test(u);
// 목록용 작은 사진 · WebP 주소 (홈페이지에 넣어 둔 사진은 같은 폴더에 main.webp·main-s.webp 가 함께 있습니다)
export function photoSet(src) {
  src = String(src || '');
  const m = /^(\/assets\/img\/talent\/[a-z0-9-]+)\/main\.jpg$/.exec(src);
  if (m) return { src, webp: m[1] + '/main.webp', small: m[1] + '/main-s.webp' };
  if (UPLOAD.test(src)) return { src, small: src + '?t=1' };
  return { src, small: src };
}

// ---------- 프로필 ----------
export function cleanProfile(d, prev = {}) {
  const o = { ...prev }, set = (k, v) => { if (has(d, k)) o[k] = v; };
  set('name', str(d.name, 20)); set('title', str(d.title, 40)); set('headline', str(d.headline, 60)); set('intro', str(d.intro, 1500));
  set('roles', keys(d.roles, ROLES)); set('langs', keys(d.langs, LANGS)); set('events', keys(d.events, EVENTS));
  set('stats', (Array.isArray(d.stats) ? d.stats : []).map(x => ({ v: str(x && x.v, 16), k: str(x && x.k, 30) })).filter(x => x.v && x.k).slice(0, 4));
  set('strengths', (Array.isArray(d.strengths) ? d.strengths : []).map(x => ({ t: str(x && x.t, 40), d: str(x && x.d, 220) })).filter(x => x.t).slice(0, 4));
  set('career', (Array.isArray(d.career) ? d.career : []).map(s => ({ h: str(s && s.h, 40), items: lines(s && s.items, 30, 140) })).filter(s => s.h && s.items.length).slice(0, 10));
  set('brief', lines(d.brief, 10, 90)); set('quals', lines(d.quals, 12, 90)); set('clients', lines(d.clients, 60, 30));
  set('quotes', (Array.isArray(d.quotes) ? d.quotes : []).map(x => ({ q: str(x && x.q, 200), by: str(x && x.by, 40) })).filter(x => x.q).slice(0, 4));
  if (has(d, 'photo')) { const p = str(d.photo, 300); if (p && !photoOk(p)) return { error: '대표 사진 주소를 확인해 주세요: ' + p }; o.photo = p; }
  if (has(d, 'photos')) {
    const list = (Array.isArray(d.photos) ? d.photos : []).map(p => typeof p === 'string' ? { src: p } : p || {}).map(p => ({ src: str(p.src, 300), thumb: str(p.thumb, 300), alt: str(p.alt, 80) })).filter(p => p.src);
    const bad = list.find(p => !photoOk(p.src) || (p.thumb && !photoOk(p.thumb))); if (bad) return { error: '현장 사진 주소를 확인해 주세요: ' + bad.src };
    o.photos = list.map(p => p.thumb ? p : { src: p.src, alt: p.alt }).slice(0, 12);
  }
  if (has(d, 'price_from')) { const n = num(String(d.price_from == null ? '' : d.price_from).replace(/[^0-9]/g, '')); o.price_from = n && n > 0 && n < 100000000 ? n : null; }
  set('price_note', str(d.price_note, 120));
  const text = [o.name, o.title, o.headline, o.intro, o.price_note, JSON.stringify([o.stats, o.strengths, o.career, o.brief, o.quals, o.clients, o.quotes, (o.photos || []).map(p => p.alt)])].join('\n');
  if (hasContact(text)) return { error: "공개되는 칸에 전화번호·이메일·카카오톡 주소가 들어 있습니다. 연락처는 아래 '관리자 전용' 칸에만 적어 주세요.", code: 'CONTACT_IN_PUBLIC' };
  return { data: o };
}
export function cleanPrivate(d, prev = {}) {
  const o = { ...prev }, set = (k, v) => { if (has(d, k)) o[k] = v; };
  set('phone', str(d.phone, 30).replace(/[^0-9+\- ]/g, '')); set('phone2', str(d.phone2, 30).replace(/[^0-9+\- ]/g, ''));
  set('email', str(d.email, 120)); set('kakao', str(d.kakao, 60)); set('agency', str(d.agency, 80));
  set('fee_basis', str(d.fee_basis, 500)); set('settle', str(d.settle, 300)); set('memo', str(d.memo, 1000));
  return o;
}
const label = (map) => id => ({ id, label: map[id] || id });
// 공개 화면·API 용 (private 칸이 없는 행만 받습니다)
export function publicProfile(r) {
  const x = safe(r.data);
  return {
    slug: r.slug, url: `/mc/view/?id=${r.slug}`, name: x.name || '', title: x.title || '', headline: x.headline || '', intro: x.intro || '',
    roles: (x.roles || []).map(label(ROLES)), langs: (x.langs || []).map(label(LANGS)), events: (x.events || []).map(label(EVENTS)),
    stats: x.stats || [], strengths: x.strengths || [], career: x.career || [], brief: x.brief || [], quals: x.quals || [], clients: x.clients || [], quotes: x.quotes || [],
    photo: x.photo ? photoSet(x.photo) : null, photos: (x.photos || []).map(p => ({ src: p.src, thumb: p.thumb || (UPLOAD.test(p.src) ? p.src + '?t=1' : p.src), alt: p.alt || '' })),
    price_from: x.price_from || null, price_note: x.price_note || '', updated_at: r.updated_at || r.published_at || ''
  };
}
function adminProfile(r) {
  return { ...publicProfile(r), raw: safe(r.data), private: safe(r.private), status: r.status, status_label: PROFILE_STATUS[r.status] || r.status, sort: r.sort, published_at: r.published_at, created_at: r.created_at };
}

// 처음 한 번만 첫 등록분을 넣습니다 (이미 프로필이 있거나, 한 번 넣었으면 그대로 둡니다)
const SEEDED = new WeakSet();
export async function ensureSeed(env) {
  if (SEEDED.has(env.DB)) return;
  const flag = await env.DB.prepare("SELECT 1 AS x FROM settings WHERE key = 'talent_seed'").first();
  if (!flag) {
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM talents').first() || {}).n || 0, t = now();
    if (!n) for (const [i, s] of SEED.entries())
      await env.DB.prepare("INSERT OR IGNORE INTO talents (slug, status, sort, data, private, published_at, created_at, updated_at) VALUES (?, 'published', ?, ?, '{}', ?, ?, ?)").bind(s.slug, (i + 1) * 10, JSON.stringify(s.data), t, t, t).run();
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('talent_seed', ?, ?)").bind(JSON.stringify({ v: 1, seeded: n ? 0 : SEED.length }), t).run();
  }
  SEEDED.add(env.DB);
}
export async function listPublicTalents(env) {
  await ensureSeed(env);
  const { results } = await env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM talents WHERE status = 'published' ORDER BY sort, id`).all();
  return (results || []).map(publicProfile);
}
export async function getPublicTalent(env, slug) {
  slug = String(slug || '').toLowerCase();
  if (!SLUG.test(slug)) return null;
  await ensureSeed(env);
  const r = await env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM talents WHERE slug = ? AND status = 'published'`).bind(slug).first();
  return r ? publicProfile(r) : null;
}

// ---------- 섭외 요청 ----------
export function cleanRequest(d) {
  const event_date = str(d.event_date, 10), date_tbd = !!d.date_tbd;
  const place = has(PLACES, d.place) ? d.place : 'tbd';
  const o = {
    event_type: has(EVENTS, d.event_type) ? d.event_type : '', event_name: str(d.event_name, 80),
    date_tbd: date_tbd || !event_date, start_t: timeOk(d.start_t), end_t: timeOk(d.end_t),
    place, place_detail: place === 'other' ? str(d.place_detail, 120) : '', headcount: (() => { const n = num(d.headcount); return n && n > 0 && n <= 20000 ? n : null; })(),
    roles: keys(d.roles, ROLES), langs: keys(d.langs, LANGS), needs: keys(d.needs, NEEDS), budget: has(BUDGETS, d.budget) ? d.budget : '',
    recommend: !!d.recommend, org: str(d.org, 120), message: str(d.message, 2000), inquiry_ref: str(d.inquiry_ref, 20).toUpperCase().replace(/[^A-Z0-9-]/g, '')
  };
  return { o, event_date: date_tbd ? '' : event_date };
}
function requestRow(r, names = {}) {
  const d = safe(r.data), a = safe(r.admin);
  return {
    ref: r.ref, status: r.status, status_label: REQ_STATUS[r.status] || r.status, name: r.name || '', phone: r.phone || '', email: r.email || '', event_date: r.event_date || '',
    created_at: r.created_at, updated_at: r.updated_at, member_id: r.member_id || null, data: d,
    admin: { assigned: a.assigned || [], quote_amount: a.quote_amount ?? null, talent_fee: a.talent_fee ?? null, vat: a.vat || 'excl', linked_ref: a.linked_ref || '', memo: a.memo || '', history: a.history || [] },
    picks_label: (d.picks || []).map(p => names[p.slug] || p.name || p.slug), assigned_label: (a.assigned || []).map(s => names[s] || s)
  };
}

export async function createRequest({ request, env }, d, { actor = 'customer' } = {}) {
  const name = str(d.name, 40), phone = str(d.phone, 20).replace(/[^0-9-]/g, ''), email = str(d.email, 120);
  if (!name) return err('이름을 적어 주세요.');
  if (!/^0\d{8,10}$/.test(digits(phone))) return err('연락처를 확인해 주세요. 숫자만 적어도 됩니다.');
  if (email && !/^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(email)) return err('이메일 주소를 확인해 주세요.');
  const { o, event_date } = cleanRequest(d);
  if (event_date && !isDate(event_date)) return err('행사일을 확인해 주세요.');
  if (actor === 'customer' && event_date && event_date < kstToday()) return err('지난 날짜는 고를 수 없습니다. 행사일을 다시 골라 주세요.');
  if (o.place === 'other' && !o.place_detail && actor === 'customer') return err('행사 장소(지역·장소 이름)를 적어 주세요.');
  // 희망 진행자는 공개 중인 프로필만 받습니다 (최대 3명)
  const want = (Array.isArray(d.picks) ? d.picks : []).map(x => String(x || '').toLowerCase()).filter((x, i, a) => SLUG.test(x) && a.indexOf(x) === i).slice(0, MAX_PICKS);
  let picks = [];
  if (want.length) {
    const { results } = await env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM talents WHERE status = 'published' AND slug IN (${want.map(() => '?').join(',')})`).bind(...want).all();
    const found = Object.fromEntries((results || []).map(r => [r.slug, safe(r.data).name || r.slug]));
    picks = want.filter(s => found[s]).map(s => ({ slug: s, name: found[s] }));
  }
  if (!picks.length) o.recommend = true;
  const data = { ...o, picks, came_from: actor === 'customer' ? cameFrom(d.came_from) : null, channel: actor === 'customer' ? 'web' : str(d.channel, 20) || 'admin', ua: actor === 'customer' ? str(request.headers.get('user-agent'), 200) : '' };
  let member_id = null;
  if (actor === 'customer') { try { const m = await getMember(request, env); if (m) member_id = m.id; } catch {} }
  const ref = await uniqueRef(env, 'talent_requests', 'ref', 'TR'), t = now();
  const admin = { history: [{ at: t, text: actor === 'customer' ? '홈페이지에서 섭외 요청 접수' : '관리자가 직접 등록' }] };
  if (actor !== 'customer' && str(d.memo, 1000)) admin.memo = str(d.memo, 1000);
  await env.DB.prepare('INSERT INTO talent_requests (ref, status, name, phone, email, event_date, data, admin, member_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(ref, 'new', name, phone, email, event_date || null, JSON.stringify(data), JSON.stringify(admin), member_id, t, t).run();
  await log(env, 'talent_request.created', ref, actor === 'customer' ? (member_id ? 'member:' + member_id : 'customer') : 'admin', { date: event_date, place: o.place, picks: picks.map(p => p.slug), roles: o.roles });
  return json({ ok: true, ref, picks: picks.map(p => p.name) });
}

// 고객 진행 상태 확인 (접수번호 + 휴대폰 뒷 4자리) — 진행자 연락처·출연료·운영 메모는 내보내지 않습니다
async function requestStatus({ request, env }, d) {
  const ip = 'talentst:' + clientIp(request);
  try { if (await tooMany(env, ip, 10, 10)) return err('조회가 너무 많습니다. 10분 뒤에 다시 시도해 주세요.', 429, 'TOO_MANY'); } catch {}
  const ref = str(d.ref, 20).toUpperCase().trim(), last4 = digits(d.phone4).slice(-4);
  try { await hit(env, ip, 10); } catch {}
  if (!REF.test(ref) || last4.length !== 4) return err('접수번호와 휴대폰 번호 뒷 4자리를 확인해 주세요.');
  const r = await env.DB.prepare('SELECT * FROM talent_requests WHERE ref = ?').bind(ref).first();
  if (!r || digits(r.phone).slice(-4) !== last4) return err('일치하는 섭외 요청을 찾지 못했습니다. 접수번호와 휴대폰 번호를 다시 확인해 주세요.', 404, 'NOT_FOUND');
  const d2 = safe(r.data), a = safe(r.admin);
  let assigned = [];
  if ((a.assigned || []).length) {
    const { results } = await env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM talents WHERE slug IN (${a.assigned.map(() => '?').join(',')})`).bind(...a.assigned).all();
    assigned = (results || []).map(x => safe(x.data).name).filter(Boolean);
  }
  const showQuote = ['quoted', 'confirmed', 'done'].includes(r.status) && a.quote_amount > 0;
  return json({ ok: true, ref: r.ref, status: r.status, status_label: REQ_STATUS[r.status] || r.status, event_date: r.event_date || '', event_label: kdate(r.event_date || ''),
    place: PLACES[d2.place] || '', picks: (d2.picks || []).map(p => p.name), assigned, quote: showQuote ? { amount: a.quote_amount, vat: VAT[a.vat || 'excl'] } : null, created_at: r.created_at });
}

// ---------- 공개 API: /api/talent… ----------
//   GET  /api/talent              공개 중인 진행자 목록 (+ html=1 이면 카드 HTML)
//   GET  /api/talent/<slug>       진행자 한 명 (+ html=1 이면 상세 HTML)
//   GET  /api/talent/photo/<id>   관리자가 올린 프로필 사진 (?t=1 작은 사진)
//   POST /api/talent/request      섭외 요청
//   POST /api/talent/status       진행 상태 확인
export async function talentPublic(ctx, view) {
  const { request, env, path } = ctx, method = request.method.toUpperCase(), url = new URL(request.url);
  const parts = path ? path.split('/') : [];
  if (method === 'GET' && !parts.length) {
    const items = await listPublicTalents(env);
    return json({ ok: true, items, ...(url.searchParams.get('html') ? { html: items.map(view.card).join('') } : {}), options: { roles: ROLES, langs: LANGS, events: EVENTS } }, 200, { 'cache-control': 'public, max-age=60' });
  }
  if (method === 'GET' && parts[0] === 'photo' && parts.length === 2) return photoGet(env, parts[1], url.searchParams.get('t') === '1');
  if (method === 'GET' && parts.length === 1) {
    const item = await getPublicTalent(env, parts[0]);
    if (!item) return err('공개된 진행자를 찾지 못했습니다.', 404, 'NOT_FOUND');
    return json({ ok: true, item, ...(url.searchParams.get('html') ? { html: view.body(item, await listPublicTalents(env)) } : {}) }, 200, { 'cache-control': 'public, max-age=60' });
  }
  if (method === 'POST' && parts.length === 1 && (parts[0] === 'request' || parts[0] === 'status')) {
    let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
    if (parts[0] === 'status') return requestStatus(ctx, d);
    if (d.website) return json({ ok: true, ref: 'TR-0000-SPAM' });   // 사람은 채우지 않는 숨은 칸
    if (!d.agree_privacy) return err('개인정보 수집·이용에 동의해 주세요.');
    const ipKey = 'talent:' + clientIp(request);
    try { if (await tooMany(env, ipKey, 6, 10)) return err('짧은 시간에 요청이 너무 많이 들어왔습니다. 잠시 뒤 다시 보내 주세요.', 429, 'TOO_MANY'); } catch {}
    try { await hit(env, ipKey, 10); } catch {}
    await ensureSeed(env);
    return createRequest(ctx, d);
  }
  return err('지원하지 않는 요청입니다.', 405, 'METHOD');
}

// ---------- 프로필 사진 (관리자가 올림 · D1 에 보관) ----------
const BODY_MAX = 820000, THUMB_MAX = 160000, B64 = /^[A-Za-z0-9+/]+={0,2}$/;
async function photoGet(env, id, thumb) {
  if (!PHOTO_ID.test(id)) return err('사진을 찾지 못했습니다.', 404, 'NOT_FOUND');
  const r = await env.DB.prepare('SELECT mime, thumb_mime, body, thumb FROM talent_photos WHERE id = ?').bind(id).first();
  if (!r) return err('사진을 찾지 못했습니다.', 404, 'NOT_FOUND');
  const b64 = thumb && r.thumb ? r.thumb : r.body, mime = thumb && r.thumb ? (r.thumb_mime || r.mime) : r.mime;
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Response(bin, { headers: { 'content-type': mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}
async function photoPut(env, d) {
  const body = String(d.body || ''), thumb = String(d.thumb || '');
  if (!body || body.length > BODY_MAX || !B64.test(body)) return err('사진이 너무 크거나 형식이 맞지 않습니다. 긴 변 1600px 이하 JPG·PNG·WebP로 올려 주세요.');
  if (thumb && (thumb.length > THUMB_MAX || !B64.test(thumb))) return err('작은 사진 형식이 맞지 않습니다.');
  const mime = imageKind(body), tmime = thumb ? imageKind(thumb) : '';
  if (!mime || (thumb && !tmime)) return err('JPG·PNG·WebP 사진만 올릴 수 있습니다.');
  const id = randomToken(16).slice(0, 22);
  await env.DB.prepare('INSERT INTO talent_photos (id, mime, thumb_mime, body, thumb, w, h, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, mime, tmime || null, body, thumb || null, num(d.w), num(d.h), now()).run();
  return json({ ok: true, id, src: '/api/talent/photo/' + id, thumb: '/api/talent/photo/' + id + '?t=1' });
}

// ---------- 관리자 API: /api/admin/talent… ----------
async function profileNames(env) {
  const { results } = await env.DB.prepare('SELECT slug, data FROM talents').all();
  return Object.fromEntries((results || []).map(r => [r.slug, safe(r.data).name || r.slug]));
}
export async function talentAdmin({ request, env, path, method, url }) {
  const parts = path.split('/').slice(1);   // 'talent/…'
  await ensureSeed(env);
  let d = {}; if (method === 'POST' || method === 'PUT') { try { d = await readJson(request, 1200 * 1024); } catch (e) { return err(e.message); } }

  // 메뉴 숫자 · 오늘 할 일 카드
  if (parts[0] === 'summary' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM talent_requests GROUP BY status').all();
    const counts = Object.fromEntries((results || []).map(r => [r.status, r.n]));
    const names = await profileNames(env);
    const open = await env.DB.prepare(`SELECT * FROM talent_requests WHERE status IN ('new','checking','quoted') ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, created_at LIMIT 6`).all();
    return json({ ok: true, counts, open: (open.results || []).map(r => requestRow(r, names)) });
  }

  // ----- 섭외 요청 -----
  if (parts[0] === 'requests') {
    const ref = (parts[1] || '').toUpperCase();
    if (parts.length === 1 && method === 'GET') {
      const st = url.searchParams.get('status') || 'open', q = str(url.searchParams.get('q'), 60);
      let where = '1=1'; const args = [];
      if (st === 'open') where = `status IN (${OPEN_STATUS.map(() => '?').join(',')})`, args.push(...OPEN_STATUS);
      else if (has(REQ_STATUS, st)) where = 'status = ?', args.push(st);
      if (q) { const like = '%' + q.replace(/[%_]/g, '') + '%', ph = digits(q); where += ` AND (name LIKE ? OR ref LIKE ? OR email LIKE ? OR data LIKE ?${ph.length >= 3 ? " OR REPLACE(phone, '-', '') LIKE ?" : ''})`; args.push(like, like.toUpperCase(), like, like); if (ph.length >= 3) args.push('%' + ph + '%'); }
      const { results } = await env.DB.prepare(`SELECT * FROM talent_requests WHERE ${where} ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'checking' THEN 1 WHEN 'quoted' THEN 2 WHEN 'confirmed' THEN 3 ELSE 4 END, COALESCE(event_date, '9999') , created_at DESC LIMIT 300`).bind(...args).all();
      const c = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM talent_requests GROUP BY status').all();
      const names = await profileNames(env);
      return json({ ok: true, items: (results || []).map(r => requestRow(r, names)), counts: Object.fromEntries((c.results || []).map(r => [r.status, r.n])),
        options: { status: REQ_STATUS, roles: ROLES, langs: LANGS, events: EVENTS, places: PLACES, budgets: BUDGETS, needs: NEEDS, vat: VAT } });
    }
    if (parts.length === 1 && method === 'POST') return createRequest({ request, env }, d, { actor: 'admin' });
    if (!REF.test(ref)) return null;
    const row = await env.DB.prepare('SELECT * FROM talent_requests WHERE ref = ?').bind(ref).first();
    if (!row) return err('섭외 요청을 찾지 못했습니다.', 404, 'NOT_FOUND');
    if (parts.length === 2 && method === 'GET') return json({ ok: true, item: requestRow(row, await profileNames(env)) });
    if (parts.length === 2 && method === 'PUT') {
      const a = safe(row.admin), hist = Array.isArray(a.history) ? a.history.slice(-40) : [], t = now(), names = await profileNames(env);
      let status = row.status, event_date = row.event_date;
      if (has(d, 'status')) { if (!has(REQ_STATUS, d.status)) return err('상태를 다시 골라 주세요.'); if (d.status !== status) { hist.push({ at: t, text: `상태: ${REQ_STATUS[status]} → ${REQ_STATUS[d.status]}` }); status = d.status; } }
      if (has(d, 'assigned')) {
        const next = (Array.isArray(d.assigned) ? d.assigned : []).map(String).filter((s, i, x) => has(names, s) && x.indexOf(s) === i).slice(0, 5);
        if (JSON.stringify(next) !== JSON.stringify(a.assigned || [])) hist.push({ at: t, text: '배정 진행자: ' + (next.map(s => names[s]).join(', ') || '없음') });
        a.assigned = next;
      }
      const money = v => { if (v === '' || v == null) return null; const n = num(String(v).replace(/[^0-9]/g, '')); return n != null && n >= 0 && n < 1000000000 ? n : undefined; };
      for (const k of ['quote_amount', 'talent_fee']) if (has(d, k)) { const n = money(d[k]); if (n === undefined) return err('금액을 숫자로 적어 주세요.'); if (n !== (a[k] ?? null)) hist.push({ at: t, text: (k === 'quote_amount' ? '고객 견적 금액: ' : '진행자 출연료: ') + (n == null ? '지움' : won(n)) }); a[k] = n; }
      if (has(d, 'vat')) a.vat = has(VAT, d.vat) ? d.vat : 'excl';
      if (has(d, 'linked_ref')) a.linked_ref = str(d.linked_ref, 20).toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (has(d, 'memo')) a.memo = str(d.memo, 2000);
      if (has(d, 'event_date')) { const v = str(d.event_date, 10); if (v && !isDate(v)) return err('행사일을 확인해 주세요.'); if ((v || null) !== (event_date || null)) hist.push({ at: t, text: '행사일: ' + (v || '미정') }); event_date = v || null; }
      if (has(d, 'note') && str(d.note, 200)) hist.push({ at: t, text: str(d.note, 200) });
      a.history = hist;
      await env.DB.prepare('UPDATE talent_requests SET status = ?, event_date = ?, admin = ?, updated_at = ? WHERE ref = ?').bind(status, event_date, JSON.stringify(a), t, ref).run();
      if (status !== row.status) await log(env, 'talent_request.status', ref, 'admin', { from: row.status, to: status });
      return json({ ok: true, item: requestRow({ ...row, status, event_date, admin: JSON.stringify(a), updated_at: t }, names) });
    }
    return null;
  }

  // ----- 진행자 프로필 -----
  if (parts[0] === 'photos' && parts.length === 1 && method === 'POST') return photoPut(env, d);
  if (parts[0] === 'profiles') {
    const slug = (parts[1] || '').toLowerCase();
    if (parts.length === 1 && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM talents ORDER BY CASE status WHEN \'published\' THEN 0 WHEN \'draft\' THEN 1 ELSE 2 END, sort, id').all();
      return json({ ok: true, items: (results || []).map(adminProfile), options: { roles: ROLES, langs: LANGS, events: EVENTS, status: PROFILE_STATUS } });
    }
    if (parts.length === 1 && method === 'POST') {
      const s = String(d.slug || '').toLowerCase().trim();
      if (!SLUG.test(s)) return err('주소용 영문 이름은 영문 소문자·숫자·하이픈(-)으로 3~40자를 적어 주세요. 예: hong-gildong');
      if (await env.DB.prepare('SELECT 1 AS x FROM talents WHERE slug = ?').bind(s).first()) return err('이미 쓰고 있는 주소용 이름입니다. 다른 이름을 적어 주세요.', 409, 'DUP');
      const c = cleanProfile(d.data || d); if (c.error) return err(c.error, 400, c.code || 'ERR');
      if (!c.data.name) return err('이름을 적어 주세요.');
      const t = now(), sort = num(d.sort);
      await env.DB.prepare("INSERT INTO talents (slug, status, sort, data, private, created_at, updated_at) VALUES (?, 'draft', ?, ?, ?, ?, ?)").bind(s, sort == null ? 100 : sort, JSON.stringify(c.data), JSON.stringify(cleanPrivate(d.private || {})), t, t).run();
      await log(env, 'talent.create', s, 'admin', {});
      return json({ ok: true, slug: s });
    }
    if (!SLUG.test(slug)) return null;
    const row = await env.DB.prepare('SELECT * FROM talents WHERE slug = ?').bind(slug).first();
    if (!row) return err('진행자 프로필을 찾지 못했습니다.', 404, 'NOT_FOUND');
    if (parts.length === 2 && method === 'GET') return json({ ok: true, item: adminProfile(row) });
    if (parts.length === 2 && method === 'PUT') {
      const c = cleanProfile(d.data || {}, safe(row.data)); if (c.error) return err(c.error, 400, c.code || 'ERR');
      if (!c.data.name) return err('이름을 적어 주세요.');
      const p = has(d, 'private') ? cleanPrivate(d.private || {}, safe(row.private)) : safe(row.private), sort = has(d, 'sort') ? num(d.sort) : row.sort;
      await env.DB.prepare('UPDATE talents SET data = ?, private = ?, sort = ?, updated_at = ? WHERE slug = ?').bind(JSON.stringify(c.data), JSON.stringify(p), sort == null ? 100 : sort, now(), slug).run();
      return json({ ok: true });
    }
    if (parts[2] === 'status' && method === 'POST') {
      const to = d.status; if (!has(PROFILE_STATUS, to)) return err('상태를 다시 골라 주세요.');
      const x = safe(row.data);
      if (to === 'published' && (!x.name || !x.title || !x.headline || !x.photo || !(x.roles || []).length)) return err('공개하려면 이름·직함·한 줄 소개·진행 분야·대표 사진이 있어야 합니다.');
      const t = now();
      await env.DB.prepare("UPDATE talents SET status = ?, published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN ? ELSE published_at END, updated_at = ? WHERE slug = ?").bind(to, to, t, t, slug).run();
      await log(env, 'talent.status', slug, 'admin', { from: row.status, to });
      return json({ ok: true });
    }
    if (parts.length === 2 && method === 'DELETE') {
      if (row.status !== 'draft' || row.published_at) return err('한 번이라도 공개한 프로필은 지우지 않고 숨김으로 둡니다.', 409, 'KEEP');
      await env.DB.prepare("DELETE FROM talents WHERE slug = ? AND status = 'draft' AND published_at IS NULL").bind(slug).run();
      return json({ ok: true });
    }
    return null;
  }
  return null;
}
