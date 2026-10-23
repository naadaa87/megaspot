// 플랫폼 공통 — 모임(참가자 모집)·등록 공간(호스트 공간)·배너 광고에서 같이 쓰는 값과 도우미
import { str, num, isDate, kstToday, SPACES } from './_lib.js';
import { hmacToken, tokenEq } from './_confirm.js';

// ---------- 모임 ----------
export const MEETUP_CATS = {
  seminar: '강연·세미나', networking: '네트워킹·교류', community: '동호회·정기 모임', class: '클래스·스터디',
  culture: '공연·상영회', party: '파티·송년회', popup: '마켓·전시', etc: '기타'
};
// 모임 장소 — 메가스팟 직영 공간, 메가스팟 공간으로 협의 중, 다른 장소
export const MEETUP_VENUES = { ...SPACES, tbd: '메가스팟 공간 협의 중', other: '다른 장소' };
// 대표 이미지로 고를 수 있는 사진 (assets/img 아래 활용 장면·1호 사진·2호 완공 예상 이미지)
export const MEETUP_COVERS = ['s01', 's09', 's20', 's05', 's04', 's14', 's06', 's13', 's23', 's12', 's11', 's10', 's07', 's08', 's19', 's22', 's16', 'p14', 'r01', 'r07', 'r09'];
export const CAT_COVER = { seminar: 's01', networking: 's04', community: 's13', class: 's11', culture: 's07', party: 's06', popup: 's16', etc: 'p14' };
// pending 검토 중 → open 모집 중 ↔ closed 모집 마감 · cancelled 주최자 취소 · rejected 반려 · hidden 숨김 (이용일이 지나면 화면에는 '종료')
export const MEETUP_STATUS = { pending: '검토 중', open: '모집 중', closed: '모집 마감', cancelled: '모임 취소', rejected: '반려', hidden: '숨김', done: '종료' };
export const PUBLIC_STATUS = ['open', 'closed', 'cancelled'];
// 신청 상태: 참가 확정 · 승인 대기 · 대기 · 취소 · 참가 불가
export const APP_STATUS = { confirmed: '참가 확정', pending: '승인 대기', waitlist: '대기', cancelled: '취소', rejected: '참가 불가' };
export const SEAT_STATUS = "('confirmed','pending')";
export const MEETUP_REF = /^MO-\d{4}-[A-Z0-9]{4}$/;
export const APP_REF = /^AP-\d{4}-[A-Z0-9]{4}$/;

export function phoneOk(v) { const p = str(v, 30).replace(/[^0-9-+]/g, ''); const d = p.replace(/\D/g, ''); return d.length >= 9 && d.length <= 12 ? p : ''; }
export function last4(p) { return String(p || '').replace(/\D/g, '').slice(-4); }
export function timeOk(v) { const s = str(v, 5); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : ''; }
// 바깥 주소는 https 만 받습니다. 홈페이지 안 주소는 /로 시작하는 경로만 받습니다.
export function httpsUrl(v, max = 500) { const s = str(v, max); if (!s) return ''; try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
export function linkOk(v) { const s = str(v, 500); if (/^\/(?!\/)[^\s<>"']*$/.test(s)) return s; return httpsUrl(s); }
export function coverOk(v, cat) { const s = str(v, 500); if (MEETUP_COVERS.includes(s)) return s; return httpsUrl(s) || CAT_COVER[cat] || 'p14'; }
export function bounded(v, lo, hi) { const n = num(v); return n === null ? null : Math.max(lo, Math.min(hi, n)); }
export function tags(v) { const a = Array.isArray(v) ? v : String(v || '').split(/[,#\n]/); return a.map(x => str(x, 20).replace(/^#/, '')).filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).slice(0, 5); }
export function safeJson(s) { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } }

// 모임 관리 링크 토큰 (서버 비밀값으로 서명 — 모임번호마다 다름)
export async function meetupToken(env, ref) { return ref ? hmacToken(env, 'meetup:' + ref) : ''; }
export async function meetupKeyOk(env, ref, k) { const t = await meetupToken(env, ref); return !!t && tokenEq(t, String(k || '')); }
export function manageUrl(origin, ref, k) { return k ? origin + '/meetups/manage/?id=' + encodeURIComponent(ref) + '&k=' + encodeURIComponent(k) : ''; }

// 이용일이 지난 모집 중·마감 모임은 '종료'로 보여 줍니다
export function viewStatus(row, today = kstToday()) {
  if ((row.status === 'open' || row.status === 'closed') && row.event_date && row.event_date < today) return 'done';
  if (row.status === 'open') { const d = safeJson(row.data); if (d.deadline && d.deadline < today) return 'closed'; }
  return row.status;
}

// 모임 입력값 정리 (주최자 등록·관리자 수정 공통). 오류가 있으면 { error } 를 돌려줍니다.
export function cleanMeetup(d, { partial = false, today = kstToday() } = {}) {
  const o = {};
  o.title = str(d.title, 60); o.category = Object.prototype.hasOwnProperty.call(MEETUP_CATS, d.category) ? d.category : (partial ? '' : 'etc');
  o.summary = str(d.summary, 90); o.description = str(d.description, 4000); o.for_whom = str(d.for_whom, 300);
  o.date = str(d.date, 10); o.start_time = timeOk(d.start_time); o.end_time = timeOk(d.end_time);
  o.venue = Object.prototype.hasOwnProperty.call(MEETUP_VENUES, d.venue) ? d.venue : (partial ? '' : 'tbd');
  o.venue_text = str(d.venue_text, 120);
  o.capacity = bounded(d.capacity, 2, 2000); o.min_people = bounded(d.min_people, 0, 2000); o.max_per = bounded(d.max_per, 1, 10) || 1;
  o.mode = d.mode === 'approve' ? 'approve' : 'auto'; o.waitlist = d.waitlist === undefined ? true : !!d.waitlist && d.waitlist !== 'false' && d.waitlist !== '0';
  o.deadline = str(d.deadline, 10);
  o.fee_type = d.fee_type === 'paid' ? 'paid' : 'free'; o.fee = o.fee_type === 'paid' ? bounded(d.fee, 0, 10000000) : 0; o.fee_note = str(d.fee_note, 120);
  o.question = str(d.question, 100); o.cover = coverOk(d.cover, o.category); o.tags = tags(d.tags);
  o.host_name = str(d.host_name, 40); o.host_intro = str(d.host_intro, 300); o.contact_url = httpsUrl(d.contact_url, 300);
  if (partial) return o;
  if (!o.title || !o.summary || !o.description) return { error: '모임 이름·한 줄 소개·상세 내용을 적어 주세요.' };
  if (!isDate(o.date)) return { error: '모임 날짜를 확인해 주세요.' };
  if (o.date < today) return { error: '지난 날짜에는 모임을 등록할 수 없습니다.' };
  if (!o.start_time) return { error: '시작 시간을 확인해 주세요.' };
  if (!o.capacity) return { error: '모집 인원(정원)을 2명 이상으로 적어 주세요.' };
  if (o.min_people && o.min_people > o.capacity) return { error: '최소 진행 인원이 정원보다 많습니다.' };
  if (o.deadline && (!isDate(o.deadline) || o.deadline > o.date)) return { error: '모집 마감일은 모임 날짜와 같거나 그 전이어야 합니다.' };
  if (o.venue === 'other' && !o.venue_text) return { error: '다른 장소라면 장소 이름과 주소(구·동)를 적어 주세요.' };
  if (!o.host_name) return { error: '주최자 이름(화면에 보일 이름)을 적어 주세요.' };
  return o;
}

// 화면에 공개해도 되는 모임 정보만 골라 냅니다 (주최자 연락처·예약번호·운영 메모는 빼고)
export function publicMeetup(row, counts, { full = true, today = kstToday() } = {}) {
  const d = safeJson(row.data);
  const c = counts || {};
  const o = {
    ref: row.ref, status: viewStatus(row, today), title: row.title, category: row.category, cat_label: MEETUP_CATS[row.category] || '기타',
    summary: d.summary || '', date: row.event_date, start_time: d.start_time || '', end_time: d.end_time || '',
    venue: row.venue, venue_label: MEETUP_VENUES[row.venue] || '', venue_text: d.venue_text || '',
    capacity: row.capacity, min_people: d.min_people || 0, max_per: d.max_per || 1, mode: d.mode || 'auto', waitlist: d.waitlist !== false,
    deadline: d.deadline || '', fee_type: d.fee_type || 'free', fee: d.fee || 0, fee_note: d.fee_note || '',
    cover: d.cover || CAT_COVER[row.category] || 'p14', tags: d.tags || [], host_name: d.host_name || '',
    verified: !!row.verified, featured: !!row.featured,
    seats: c.seats || 0, waiting: c.waiting || 0, created_at: String(row.created_at || '').slice(0, 10)
  };
  o.status_label = MEETUP_STATUS[o.status] || o.status;
  if (full) Object.assign(o, { description: d.description || '', for_whom: d.for_whom || '', question: d.question || '', host_intro: d.host_intro || '', contact_url: d.contact_url || '', notice: d.notice || '' });
  return o;
}

export async function meetupCounts(env, ref) {
  const r = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN status IN ${SEAT_STATUS} THEN people END), 0) AS seats, COALESCE(SUM(CASE WHEN status = 'waitlist' THEN people END), 0) AS waiting,
    COALESCE(SUM(CASE WHEN status = 'confirmed' THEN people END), 0) AS confirmed, COALESCE(SUM(CASE WHEN status = 'pending' THEN people END), 0) AS pending,
    COUNT(CASE WHEN status IN ('confirmed','pending','waitlist') THEN 1 END) AS apps FROM meetup_apps WHERE meetup_ref = ?`).bind(ref).first();
  return r || { seats: 0, waiting: 0, confirmed: 0, pending: 0, apps: 0 };
}

// 자리가 생기면 대기자를 신청한 순서대로 올립니다. 순서를 지키기 위해 앞사람이 들어가지 못하면 거기서 멈춥니다.
export async function promoteWaitlist(env, ref, now) {
  const m = await env.DB.prepare('SELECT capacity, data FROM meetups WHERE ref = ?').bind(ref).first();
  if (!m || !m.capacity) return [];
  const mode = safeJson(m.data).mode === 'approve' ? 'pending' : 'confirmed';
  let left = m.capacity - (await meetupCounts(env, ref)).seats;
  const { results } = await env.DB.prepare("SELECT ref, people FROM meetup_apps WHERE meetup_ref = ? AND status = 'waitlist' ORDER BY created_at, id").bind(ref).all();
  const moved = [];
  for (const a of results || []) {
    if (a.people > left) break;
    await env.DB.prepare('UPDATE meetup_apps SET status = ?, updated_at = ? WHERE ref = ?').bind(mode, now, a.ref).run();
    left -= a.people; moved.push(a.ref);
  }
  return moved;
}

// ---------- 등록 공간 (호스트 공간 · 문의형) ----------
export const LISTING_STATUS = { draft: '작성 중', published: '공개', hidden: '숨김' };
export const LISTING_REF = /^L-\d{4}-[A-Z0-9]{4}$/;
export const REGION_IDS = ['seoul-east', 'seoul-north', 'seoul-south', 'seoul-west', 'gyeonggi', 'etc'];
export function cleanListing(d) {
  const list = (v, max, len) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]/)).map(x => str(x, len)).filter(Boolean).slice(0, max);
  const o = {
    name: str(d.name, 60), region: REGION_IDS.includes(d.region) ? d.region : 'etc', address: str(d.address, 120),
    area: bounded(d.area, 1, 100000), capacity: bounded(d.capacity, 1, 100000), space_type: str(d.space_type, 30),
    summary: str(d.summary, 120), description: str(d.description, 4000),
    features: list(d.features, 12, 20), purposes: list(d.purposes, 12, 20), themes: list(d.themes, 6, 20),
    photos: list(d.photos, 10, 500).map(u => linkOk(u)).filter(Boolean),
    price_note: str(d.price_note, 200), hours: str(d.hours, 120), rules: str(d.rules, 1000),
    host_name: str(d.host_name, 60), host_biz: str(d.host_biz, 300), station: str(d.station, 80)
  };
  if (!o.name) return { error: '공간 이름을 적어 주세요.' };
  return o;
}
export function publicListing(row) {
  const d = safeJson(row.data);
  return { id: row.slug, status: row.status, name: row.name, region: row.region, address: row.address, area: row.area, capacity: row.capacity,
    space_type: d.space_type || '', summary: d.summary || '', description: d.description || '', features: d.features || [], purposes: d.purposes || [], themes: d.themes || [],
    photos: d.photos || [], price_note: d.price_note || '', hours: d.hours || '', rules: d.rules || '', host_name: d.host_name || '', host_biz: d.host_biz || '', station: d.station || '' };
}

// ---------- 배너 광고 ----------
// 광고 자리: 홈 중간 · 목록 위(공간 찾기·모임 목록) · 목록 사이 카드 · 안내·상세 페이지 아래
export const AD_SLOTS = { 'home-mid': '홈 중간 와이드 배너', 'list-top': '공간 찾기·모임 목록 위 띠 배너', 'list-card': '목록 사이 카드', 'content-bottom': '안내·상세 페이지 아래 배너' };
export const AD_THEMES = ['cobalt', 'graphite', 'rust', 'light'];
export function cleanAd(d) {
  const o = {
    slot: Object.prototype.hasOwnProperty.call(AD_SLOTS, d.slot) ? d.slot : '', kind: d.kind === 'house' ? 'house' : 'paid',
    title: str(d.title, 60), advertiser: str(d.advertiser, 60), link: linkOk(d.link),
    start_date: isDate(str(d.start_date, 10)) ? str(d.start_date, 10) : '', end_date: isDate(str(d.end_date, 10)) ? str(d.end_date, 10) : '',
    priority: bounded(d.priority, 0, 100) || 0, status: d.status === 'on' ? 'on' : 'off',
    sub: str(d.sub, 120), cta: str(d.cta, 20), image: linkOk(d.image), theme: AD_THEMES.includes(d.theme) ? d.theme : 'cobalt', memo: str(d.memo, 500)
  };
  if (!o.slot) return { error: '광고 자리를 골라 주세요.' };
  if (!o.title) return { error: '광고 제목을 적어 주세요.' };
  if (!o.link) return { error: '연결할 주소를 https:// 로 시작하는 주소나 /로 시작하는 홈페이지 경로로 적어 주세요.' };
  if (o.kind === 'paid' && !o.advertiser) return { error: '광고주 이름을 적어 주세요. 화면의 "광고" 표시와 함께 보입니다.' };
  if (o.start_date && o.end_date && o.start_date > o.end_date) return { error: '게재 시작일이 종료일보다 늦습니다.' };
  return o;
}
export function publicAd(row) {
  const d = safeJson(row.data);
  return { id: row.id, slot: row.slot, kind: row.kind, title: row.title, advertiser: row.advertiser || '', sub: d.sub || '', cta: d.cta || '', image: d.image || '', theme: d.theme || 'cobalt', ext: /^https:/.test(row.link || ''), href: '/api/ads/go/' + row.id };
}
export const AD_ACTIVE = "status = 'on' AND (start_date IS NULL OR start_date = '' OR start_date <= ?) AND (end_date IS NULL OR end_date = '' OR end_date >= ?)";

// ---------- 입점·공간 등록·광고 문의 (host_applications) ----------
export const PARTNER_KINDS = { host: '입점 상담', space: '공간 등록 신청', ad: '광고·제휴 문의' };
export const PARTNER_STATUS = ['접수', '검토 중', '보완 요청', '진행 확정', '보류', '반려·종료'];
