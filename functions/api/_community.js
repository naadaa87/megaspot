// 커뮤니티 — 모임 소개 게시판 · 자유게시판 (2026-11-17)
//  · 모임 소개: 메가스팟을 이용하는(또는 이용할) 모임이 소개·활동 방식·참여 링크·문의처를 올립니다. 기본은 운영팀 확인 뒤 게시.
//  · 자유게시판: 회원끼리 이야기·질문·후기·행사 준비 팁을 나눕니다. 기본은 바로 게시하고, 신고가 쌓이면 자동으로 숨깁니다.
//  · 글쓰기·댓글·공감·신고는 회원만 할 수 있습니다. 운영팀은 관리자 화면에서 검토·숨김·고정·추천·예약 게시·공지 작성을 합니다.
//  · 모임 소개의 휴대폰·이메일은 화면 원문에 넣지 않고 '연락처 보기'를 눌렀을 때만 따로 내려보냅니다(무더기 수집 방지).
import { purgeEnabled } from './_retention.js';
import { str, num, now, uniqueRef, log, isEmail } from './_lib.js';
import { httpsUrl, linkOk, phoneOk, safeJson, MEETUP_COVERS, MEETUP_REF } from './_platform.js';
import { PHOTO_ID, photoUrl, publicPhoto, pickPhotos, attachPhotos, purgePhotosOf } from './_community_photos.js';

export const BOARDS = { group: '모임 소개', free: '자유게시판' };
const PREFIX = { group: 'CG', free: 'CF' };
export const POST_REF = /^C[GF]-\d{4}-[A-Z0-9]{4}$/;
export const GROUP_CATS = { networking: '네트워킹·교류', study: '스터디·자기계발', hobby: '취미·동호회', sports: '운동·아웃도어', culture: '문화·예술', social: '친목·파티', biz: '비즈니스·창업', volunteer: '봉사·나눔', etc: '기타' };
export const FREE_CATS = { notice: '공지', talk: '사는 이야기', question: '질문', review: '공간·행사 후기', tip: '행사 준비 팁', together: '함께해요' };
export const STATUS = { draft: '임시 저장', pending: '검토 대기', published: '게시 중', hidden: '숨김', rejected: '반려', deleted: '삭제' };
export const CYCLES = { weekly: '매주', biweekly: '격주', monthly: '매월', irregular: '비정기' };
export const SIZES = { s: '20명 이하', m: '20~50명', l: '50~100명', xl: '100명 이상' };
export const VENUES = { 'megaspot-gundae': '메가스팟 건대 1호', 'megaspot-gundae-2': '메가스팟 건대 2호', both: '메가스팟 건대 1호·2호', planned: '메가스팟 이용 예정' };
export const REPORT_REASONS = { spam: '광고·도배', scam: '사기·금전 요구', abuse: '욕설·비방', privacy: '개인정보 노출', illegal: '불법·유해 내용', etc: '기타' };
const CAT_COVER = { networking: 's04', study: 's12', hobby: 's13', sports: 's05', culture: 's07', social: 's22', biz: 's20', volunteer: 's23', etc: 'v10' };
export const DEFAULTS = { group: { mode: 'review', comments: true }, free: { mode: 'instant', comments: true }, auto_hide: 3, banned: [], blocked: [], notice: { group: '', free: '' } };
const RESERVED = /메가스팟|megaspot|운영자|관리자|운영팀|admin/i;
const VISIBLE = "p.status = 'published' AND p.publish_at <= ?";
const COLS = 'p.id, p.ref, p.board, p.status, p.category, p.title, p.member_id, p.author, p.official, p.pinned, p.featured, p.views, p.likes, p.comments, p.reports, p.data, p.publish_at, p.created_at, p.updated_at';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const like = v => '%' + str(v, 40).replace(/[%_\\]/g, '') + '%';
const urlCount = s => (String(s || '').match(/https?:\/\/|www\./gi) || []).length;
export function maskName(n) { n = String(n || '').trim(); if (!n) return '회원'; return n.length <= 1 ? n : n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]; }
// 관리자 화면의 '한국 시간' 입력(YYYY-MM-DDTHH:MM)을 저장용 UTC 문자열로
export function kstInput(v) {
  const s = str(v, 16); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return '';
  const d = new Date(s + ':00+09:00'); return isNaN(d) ? '' : d.toISOString().slice(0, 19).replace('T', ' ');
}

// ---------- 운영 설정 ----------
export async function getConfig(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'community'").first();
  const c = safeJson(r && r.value);
  const board = b => ({ mode: (c[b] || {}).mode === 'instant' || (c[b] || {}).mode === 'review' ? c[b].mode : DEFAULTS[b].mode, comments: (c[b] || {}).comments === false ? false : true });
  return { group: board('group'), free: board('free'), auto_hide: Math.max(0, Math.min(20, num(c.auto_hide) ?? DEFAULTS.auto_hide)),
    banned: Array.isArray(c.banned) ? c.banned.map(w => str(w, 30)).filter(Boolean).slice(0, 200) : [],
    blocked: Array.isArray(c.blocked) ? c.blocked.filter(b => b && num(b.id)).slice(0, 1000) : [],
    notice: { group: str((c.notice || {}).group, 300), free: str((c.notice || {}).free, 300) } };
}
async function putConfig(env, cfg) {
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('community', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(cfg), now()).run();
}
export async function saveConfig(env, d) {
  const cur = await getConfig(env), next = JSON.parse(JSON.stringify(cur));
  for (const b of ['group', 'free']) if (d[b]) {
    if (d[b].mode !== undefined) { if (!['review', 'instant'].includes(d[b].mode)) return { error: '게시 방식을 다시 골라 주세요.' }; next[b].mode = d[b].mode; }
    if (d[b].comments !== undefined) next[b].comments = !!d[b].comments;
  }
  if (d.auto_hide !== undefined) { const n = num(d.auto_hide); if (n === null || n < 0 || n > 20) return { error: '자동 숨김 신고 수는 0~20 사이로 적어 주세요. 0이면 자동으로 숨기지 않습니다.' }; next.auto_hide = n; }
  if (d.banned !== undefined) {
    const list = (Array.isArray(d.banned) ? d.banned : String(d.banned || '').split(/[\n,]/)).map(w => str(w, 30)).filter(Boolean);
    next.banned = [...new Set(list)].slice(0, 200);
  }
  if (d.notice) for (const b of ['group', 'free']) if (d.notice[b] !== undefined) next.notice[b] = str(d.notice[b], 300);
  await putConfig(env, next);
  return { ok: true, config: next };
}
export async function setBlocked(env, memberId, on, reason) {
  const cfg = await getConfig(env), id = num(memberId);
  if (!id) return { error: '회원 번호를 확인해 주세요.' };
  cfg.blocked = cfg.blocked.filter(b => num(b.id) !== id);
  if (on) cfg.blocked.unshift({ id, reason: str(reason, 100), at: now() });
  await putConfig(env, cfg);
  return { ok: true, blocked: cfg.blocked };
}
const isBlocked = (cfg, id) => cfg.blocked.some(b => num(b.id) === num(id));
function bannedIn(cfg, ...texts) {
  const t = texts.join('\n').toLowerCase();
  return cfg.banned.find(w => w && t.includes(w.toLowerCase())) || '';
}

// ---------- 입력 정리 ----------
function linkKind(u) {
  if (!u) return '';
  if (u.startsWith('/')) return 'megaspot';
  let h = ''; try { h = new URL(u).hostname.toLowerCase(); } catch { return 'web'; }
  if (/(^|\.)open\.kakao\.com$/.test(h)) return 'kakao_open';
  if (/(^|\.)pf\.kakao\.com$/.test(h)) return 'kakao_channel';
  if (/(^|\.)band\.us$/.test(h)) return 'band';
  if (/(^|\.)cafe\.naver\.com$/.test(h)) return 'cafe';
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
  if (/(^|\.)(forms\.gle|docs\.google\.com|form\.naver\.com)$/.test(h)) return 'form';
  if (/(^|\.)megaspot\.kr$/.test(h)) return 'megaspot';
  return 'web';
}
export const LINK_LABEL = { kakao_open: '카카오톡 오픈채팅', kakao_channel: '카카오톡 채널', band: '네이버 밴드', cafe: '네이버 카페', instagram: '인스타그램', form: '신청서', megaspot: '메가스팟', web: '웹사이트' };
const JOIN_TEXT = { kakao_open: '오픈채팅방 참여하기', kakao_channel: '카카오톡 채널 열기', band: '밴드에서 가입하기', cafe: '카페에서 가입하기', instagram: '인스타그램 보기', form: '참여 신청서 쓰기', megaspot: '참여 신청하기', web: '참여하기' };
const ASK_TEXT = { kakao_open: '오픈채팅으로 문의', kakao_channel: '카카오톡 채널로 문의', band: '밴드로 문의', cafe: '카페로 문의', instagram: '인스타그램으로 문의', form: '문의 양식 열기', megaspot: '문의하기', web: '문의하기' };
function tagsOk(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(/[,\n#]/);
  return [...new Set(list.map(t => str(t, 12).replace(/[#<>"']/g, '').trim()).filter(Boolean))].slice(0, 5);
}
function nickOk(v, member, official) {
  if (official) return '메가스팟 운영팀';
  const s = str(v, 12).replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').trim();
  if (s && s.length >= 2) return RESERVED.test(s) ? { error: '‘메가스팟·운영자·관리자’가 들어간 이름은 쓸 수 없습니다. 다른 별명을 적어 주세요.' } : s;
  return maskName(member && member.name);
}
// 모임 소개 글
export function cleanGroup(d, { official = false } = {}) {
  const o = {};
  o.title = str(d.title, 40).replace(/\s+/g, ' ');
  if (o.title.length < 2) return { error: '모임 이름을 2자 이상 적어 주세요.' };
  o.category = str(d.category, 20); if (!has(GROUP_CATS, o.category)) return { error: '모임 분류를 골라 주세요.' };
  o.summary = str(d.summary, 80).replace(/\s+/g, ' ');
  if (o.summary.length < 10) return { error: '한 줄 소개를 10자 이상 적어 주세요.' };
  o.body = str(d.body, 4000);
  if (o.body.length < 30) return { error: '모임 소개를 30자 이상 적어 주세요. 어떤 사람들이 모여 무엇을 하는지 적으면 좋습니다.' };
  o.region = str(d.region, 30); o.schedule = str(d.schedule, 60); o.target = str(d.target, 200);
  o.cycle = has(CYCLES, d.cycle) ? d.cycle : ''; o.size = has(SIZES, d.size) ? d.size : '';
  o.fee = ['free', 'paid'].includes(d.fee) ? d.fee : ''; o.fee_text = o.fee === 'paid' ? str(d.fee_text, 40) : '';
  o.venue = has(VENUES, d.venue) ? d.venue : '';
  o.recruiting = d.recruiting === false || d.recruiting === 'false' || d.recruiting === '0' ? false : true;
  const join = str(d.join_url, 500); o.join_url = join ? linkOk(join) : '';
  if (join && !o.join_url) return { error: '참여 링크는 https:// 로 시작하는 주소로 적어 주세요.' };
  o.join_label = str(d.join_label, 16);
  const curl = str(d.contact_url, 500); o.contact_url = curl ? linkOk(curl) : '';
  if (curl && !o.contact_url) return { error: '문의 링크는 https:// 로 시작하는 주소로 적어 주세요.' };
  const ph = str(d.contact_phone, 30); o.contact_phone = ph ? phoneOk(ph) : '';
  if (ph && !o.contact_phone) return { error: '문의 연락처(전화번호)를 확인해 주세요.' };
  const em = str(d.contact_email, 120); o.contact_email = em && isEmail(em) ? em : '';
  if (em && !o.contact_email) return { error: '문의 이메일 주소를 확인해 주세요.' };
  o.kakao_id = str(d.kakao_id, 30).replace(/^@/, '');
  if (o.kakao_id && !/^[A-Za-z0-9_.-]{2,30}$/.test(o.kakao_id)) return { error: '카카오톡 아이디는 영문·숫자·_ . - 로 적어 주세요.' };
  o.contact_note = str(d.contact_note, 100);
  if (!official && !o.join_url && !o.contact_url && !o.contact_phone && !o.contact_email && !o.kakao_id) return { error: '참여 링크나 문의처를 하나 이상 적어 주세요. 관심 있는 분이 연락할 방법이 있어야 합니다.' };
  const cov = str(d.cover, 500); o.cover = MEETUP_COVERS.includes(cov) ? cov : (httpsUrl(cov) || CAT_COVER[o.category] || 'v10');
  o.tags = tagsOk(d.tags);
  const mref = str(d.meetup_ref, 20).toUpperCase(); o.meetup_ref = MEETUP_REF.test(mref) ? mref : '';
  return o;
}
// 자유게시판 글
export function cleanFree(d, { official = false } = {}) {
  const o = {};
  o.title = str(d.title, 60).replace(/\s+/g, ' ');
  if (o.title.length < 2) return { error: '제목을 2자 이상 적어 주세요.' };
  o.category = str(d.category, 20);
  if (!has(FREE_CATS, o.category) || (o.category === 'notice' && !official)) return { error: '말머리를 골라 주세요.' };
  o.body = str(d.body, 5000);
  if (o.body.length < 5) return { error: '내용을 5자 이상 적어 주세요.' };
  if (!official && urlCount(o.title + ' ' + o.body) > 3) return { error: '링크는 한 글에 3개까지 넣을 수 있습니다.' };
  return o;
}
const clean = (board, d, opt) => board === 'group' ? cleanGroup(d, opt) : cleanFree(d, opt);
const LINK_KEYS = ['join_url', 'contact_url', 'contact_phone', 'contact_email', 'kakao_id'];
const SUMMARY_KEYS = ['summary', 'region', 'schedule', 'target', 'cycle', 'size', 'fee', 'fee_text', 'venue', 'recruiting', 'join_url', 'join_label', 'contact_url', 'contact_phone', 'contact_email', 'kakao_id', 'contact_note', 'cover', 'tags', 'meetup_ref', 'body', 'photos'];
// 글에 붙은 사진 (모임 소개) — 첫 사진이 대표 이미지
const photosOf = d => Array.isArray(d.photos) ? d.photos.filter(x => x && PHOTO_ID.test(x.id)).slice(0, 10) : [];

// ---------- 화면용 ----------
const excerpt = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
export function publicPost(r, { full = false } = {}) {
  const d = safeJson(r.data), b = r.board;
  const o = { ref: r.ref, board: b, board_label: BOARDS[b] || b, category: r.category || '', cat_label: (b === 'group' ? GROUP_CATS : FREE_CATS)[r.category] || '',
    title: r.title, author: r.author, official: !!r.official, pinned: !!r.pinned, featured: !!r.featured,
    views: r.views || 0, likes: r.likes || 0, comments: r.comments || 0, published_at: r.publish_at || r.created_at, edited_at: d.edited_at || '' };
  if (b === 'group') {
    const jk = linkKind(d.join_url), ck = linkKind(d.contact_url), ph = photosOf(d);
    Object.assign(o, { summary: d.summary || '', region: d.region || '', schedule: d.schedule || '', cycle: d.cycle || '', cycle_label: CYCLES[d.cycle] || '', size: d.size || '', size_label: SIZES[d.size] || '',
      fee: d.fee || '', fee_text: d.fee_text || '', venue: d.venue || '', venue_label: VENUES[d.venue] || '', recruiting: d.recruiting !== false, cover: ph.length ? photoUrl(ph[0].id, !full) : (d.cover || CAT_COVER[r.category] || 'v10'), photo_count: ph.length, tags: d.tags || [],
      join: d.join_url ? { url: d.join_url, kind: jk, site: LINK_LABEL[jk], label: d.join_label || JOIN_TEXT[jk] } : null });
    if (full) Object.assign(o, { body: d.body || '', target: d.target || '', meetup_ref: d.meetup_ref || '', photos: ph.map(publicPhoto),
      contact: { url: d.contact_url || '', kind: ck, site: d.contact_url ? LINK_LABEL[ck] : '', label: d.contact_url ? ASK_TEXT[ck] : '', kakao_id: d.kakao_id || '', note: d.contact_note || '',
        has_phone: !!d.contact_phone, has_email: !!d.contact_email } });
  } else {
    if (full) o.body = d.body || ''; else o.excerpt = excerpt(d.body);
  }
  return o;
}
function ownerView(r) {
  const d = safeJson(r.data);
  return { ...publicPost(r, { full: true }), status: r.status, status_label: STATUS[r.status] || r.status, reject_reason: d.reject_reason || '', recheck: !!d.recheck, created_at: r.created_at,
    raw: Object.fromEntries(SUMMARY_KEYS.filter(k => has(d, k)).map(k => [k, d[k]])) };
}

// ---------- 공개 목록 ----------
function listWhere(q, t) {
  const where = [VISIBLE], bind = [t];
  const board = has(BOARDS, q.board) ? q.board : 'free';
  where.push('p.board = ?'); bind.push(board);
  const cats = board === 'group' ? GROUP_CATS : FREE_CATS;
  if (q.cat && has(cats, q.cat)) { where.push('p.category = ?'); bind.push(q.cat); }
  if (board === 'group' && q.recruiting === '1') where.push("COALESCE(json_extract(p.data, '$.recruiting'), 1) != 0");
  if (board === 'group' && q.venue === 'megaspot') where.push("COALESCE(json_extract(p.data, '$.venue'), '') IN ('megaspot-gundae','megaspot-gundae-2','both')");
  if (q.q) { const s = like(q.q); where.push("(p.title LIKE ? OR json_extract(p.data, '$.summary') LIKE ? OR json_extract(p.data, '$.body') LIKE ? OR json_extract(p.data, '$.tags') LIKE ? OR json_extract(p.data, '$.region') LIKE ?)"); bind.push(s, s, s, s, s); }
  return { board, where, bind };
}
export async function listPosts(env, q) {
  const t = now(), { board, where, bind } = listWhere(q, t);
  const size = Math.max(1, Math.min(50, num(q.size) || (board === 'group' ? 12 : 20))), page = Math.max(1, Math.min(500, num(q.page) || 1));
  const order = q.sort === 'popular' ? 'p.likes DESC, p.comments DESC, p.publish_at DESC' : q.sort === 'comments' ? 'p.comments DESC, p.publish_at DESC' : q.sort === 'views' ? 'p.views DESC, p.publish_at DESC' : 'p.publish_at DESC, p.id DESC';
  // 자유게시판의 고정 글(공지)은 첫 쪽 맨 위에 따로 보여 주고, 목록 번호에는 넣지 않습니다
  const pinFilter = board === 'free' && !q.q && !q.cat ? ' AND p.pinned = 0' : '';
  const first = board === 'group' ? 'p.pinned DESC, p.featured DESC, ' : '';
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM community_posts p WHERE ${where.join(' AND ')}${pinFilter}`).bind(...bind).first();
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM community_posts p WHERE ${where.join(' AND ')}${pinFilter} ORDER BY ${first}${order} LIMIT ${size} OFFSET ${(page - 1) * size}`).bind(...bind).all();
  let pinned = [];
  if (pinFilter && page === 1) pinned = ((await env.DB.prepare(`SELECT ${COLS} FROM community_posts p WHERE ${VISIBLE} AND p.board = 'free' AND p.pinned = 1 ORDER BY p.publish_at DESC LIMIT 5`).bind(t).all()).results || []).map(r => publicPost(r));
  return { items: (results || []).map(r => publicPost(r)), pinned, total: (total || {}).n || 0, page, size, board };
}
export async function homeFeed(env) {
  const t = now(), month = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => (r.results || []).map(x => publicPost(x)));
  const [featured, groups, free, hot, counts] = await Promise.all([
    q(`SELECT ${COLS} FROM community_posts p WHERE ${VISIBLE} AND p.board = 'group' AND (p.featured = 1 OR p.pinned = 1) ORDER BY p.pinned DESC, p.publish_at DESC LIMIT 6`, t),
    q(`SELECT ${COLS} FROM community_posts p WHERE ${VISIBLE} AND p.board = 'group' ORDER BY p.publish_at DESC LIMIT 6`, t),
    q(`SELECT ${COLS} FROM community_posts p WHERE ${VISIBLE} AND p.board = 'free' ORDER BY p.pinned DESC, p.publish_at DESC LIMIT 8`, t),
    q(`SELECT ${COLS} FROM community_posts p WHERE ${VISIBLE} AND p.board = 'free' AND p.pinned = 0 AND p.publish_at >= ? AND (p.likes + p.comments) > 0 ORDER BY (p.likes * 2 + p.comments) DESC, p.publish_at DESC LIMIT 5`, t, month),
    env.DB.prepare(`SELECT SUM(CASE WHEN p.board = 'group' THEN 1 ELSE 0 END) AS groups, SUM(CASE WHEN p.board = 'free' THEN 1 ELSE 0 END) AS free FROM community_posts p WHERE ${VISIBLE}`).bind(t).first()
  ]);
  return { featured, groups, free, hot, counts: { groups: (counts || {}).groups || 0, free: (counts || {}).free || 0 } };
}

// ---------- 글 하나 ----------
async function getPost(env, ref) { return env.DB.prepare(`SELECT ${COLS} FROM community_posts p WHERE p.ref = ?`).bind(ref).first(); }
const visible = (r, t) => r && r.status === 'published' && (r.publish_at || '') <= t;
// preview: 관리자 로그인 상태면 검토 대기·숨김 글도 화면 그대로 미리 봅니다(조회수는 올리지 않음)
export async function postDetail(env, ref, member, { preview = false } = {}) {
  const r = await getPost(env, ref), t = now();
  if (!r || r.status === 'deleted') return null;
  const owner = !!(member && r.member_id && r.member_id === member.id);
  if (!visible(r, t) && !owner && !preview) return null;
  if (preview && !owner && !visible(r, t)) {
    const item = { ...publicPost(r, { full: true }), status: r.status, status_label: STATUS[r.status] || r.status };
    return { item, comments: [], me: { logged_in: !!member, owner: false, liked: false, blocked: false, preview: true }, comments_open: false };
  }
  if (visible(r, t) && !owner) await env.DB.prepare('UPDATE community_posts SET views = views + 1 WHERE ref = ?').bind(ref).run();
  const cfg = await getConfig(env);
  const { results } = await env.DB.prepare("SELECT id, member_id, author, official, body, created_at FROM community_comments WHERE post_ref = ? AND status = 'published' ORDER BY created_at, id LIMIT 300").bind(ref).all();
  let liked = false;
  if (member) liked = !!(await env.DB.prepare('SELECT 1 AS x FROM community_reactions WHERE post_ref = ? AND member_id = ?').bind(ref, member.id).first());
  const item = owner ? ownerView(r) : publicPost(r, { full: true });
  if (!owner && visible(r, t)) item.views += 1;
  return { item, comments: (results || []).map(c => ({ id: c.id, author: c.author, official: !!c.official, writer: !!(c.member_id && c.member_id === r.member_id), mine: !!(member && c.member_id === member.id), body: c.body, created_at: c.created_at })),
    me: { logged_in: !!member, owner, liked, blocked: !!(member && isBlocked(cfg, member.id)) }, comments_open: cfg[r.board].comments && visible(r, t) };
}
export async function contactOf(env, ref) {
  const r = await getPost(env, ref);
  if (!visible(r, now()) || r.board !== 'group') return null;
  const d = safeJson(r.data);
  return { phone: d.contact_phone || '', email: d.contact_email || '' };
}

// ---------- 쓰기 (회원) ----------
export async function createPost(env, member, d) {
  const board = has(BOARDS, d.board) ? d.board : '';
  if (!board) return { error: '게시판을 골라 주세요.' };
  const cfg = await getConfig(env);
  if (isBlocked(cfg, member.id)) return { error: '커뮤니티 글쓰기가 제한된 계정입니다. 궁금한 점은 운영팀에 문의해 주세요.', status: 403, code: 'BLOCKED' };
  const o = clean(board, d); if (o.error) return o;
  if (board === 'group' && !d.agree_public) return { error: '적은 참여 링크·문의처가 모임 소개에 공개된다는 데 동의해 주세요.' };
  if (!d.agree_rules) return { error: '커뮤니티 이용 규칙에 동의해 주세요.' };
  const author = nickOk(d.author, member); if (author.error) return author;
  const bad = bannedIn(cfg, o.title, o.summary || '', o.body); if (bad) return { error: `쓸 수 없는 낱말(${bad})이 들어 있습니다. 고쳐서 다시 올려 주세요.` };
  const since = new Date(Date.now() - 10 * 6e4).toISOString().slice(0, 19).replace('T', ' ');
  if (await env.DB.prepare("SELECT 1 AS x FROM community_posts WHERE member_id = ? AND title = ? AND created_at >= ? AND status != 'deleted'").bind(member.id, o.title, since).first())
    return { error: '같은 제목의 글을 방금 올리셨습니다. 내 글에서 확인해 주세요.', status: 409, code: 'DUPLICATE' };
  let photos = [];
  if (board === 'group') { const p = await pickPhotos(env, member.id, null, d.photos); if (p.error) return p; photos = p.list || []; }
  const t = now(), status = cfg[board].mode === 'review' ? 'pending' : 'published';
  const ref = await uniqueRef(env, 'community_posts', 'ref', PREFIX[board]);
  const { title, category, ...rest } = o;
  const data = { ...rest, ...(photos.length ? { photos } : {}), agreed_at: t };
  await env.DB.prepare('INSERT INTO community_posts (ref, board, status, category, title, member_id, author, official, pinned, featured, data, publish_at, created_at) VALUES (?,?,?,?,?,?,?,0,0,0,?,?,?)')
    .bind(ref, board, status, category, title, member.id, author, JSON.stringify(data), t, t).run();
  if (photos.length) await attachPhotos(env, ref, photos, []);
  await log(env, 'community.post', ref, 'member:' + member.id, { board, status, photos: photos.length });
  return { ok: true, ref, board, status, status_label: STATUS[status] };
}
async function ownPost(env, member, ref) {
  const r = await getPost(env, ref);
  if (!r || r.status === 'deleted' || !r.member_id || r.member_id !== member.id) return null;
  return r;
}
export async function updatePost(env, member, ref, d) {
  const r = await ownPost(env, member, ref); if (!r) return { error: '글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  const cfg = await getConfig(env), cur = safeJson(r.data);
  if (isBlocked(cfg, member.id)) return { error: '커뮤니티 글쓰기가 제한된 계정입니다.', status: 403, code: 'BLOCKED' };
  // 모집 중 표시만 바꾸기
  if (r.board === 'group' && Object.keys(d).length === 1 && has(d, 'recruiting')) {
    await env.DB.prepare("UPDATE community_posts SET data = json_set(data, '$.recruiting', json(?)), updated_at = ? WHERE ref = ?").bind(d.recruiting ? 'true' : 'false', now(), ref).run();
    return { ok: true, ref, status: r.status, status_label: STATUS[r.status], recruiting: !!d.recruiting };
  }
  const o = clean(r.board, d); if (o.error) return o;
  if (r.board === 'group' && !d.agree_public) return { error: '적은 참여 링크·문의처가 모임 소개에 공개된다는 데 동의해 주세요.' };
  const author = nickOk(d.author || r.author, member); if (author.error) return author;
  const bad = bannedIn(cfg, o.title, o.summary || '', o.body); if (bad) return { error: `쓸 수 없는 낱말(${bad})이 들어 있습니다. 고쳐서 다시 올려 주세요.` };
  // 사진: 보낸 목록으로 맞춥니다(빠진 사진은 지움). 사진 목록을 보내지 않은 요청은 그대로 둡니다
  const pk = r.board === 'group' ? await pickPhotos(env, member.id, ref, d.photos) : { list: null }; if (pk.error) return pk;
  const prevPhotos = photosOf(cur), photos = pk.list === null ? prevPhotos : pk.list;
  const t = now(), review = cfg[r.board].mode === 'review';
  const linksChanged = r.board === 'group' && LINK_KEYS.some(k => String(cur[k] || '') !== String(o[k] || ''));
  let status = r.status, publish = r.publish_at, note = '';
  const { title, category, ...rest } = o;
  const data = { ...cur, ...rest, photos, edited_at: t };
  if (!photos.length) delete data.photos;
  delete data.reject_reason;
  if (r.status === 'rejected') { status = review ? 'pending' : 'published'; if (status === 'published') publish = t; note = review ? '고친 내용을 운영팀이 다시 확인합니다.' : ''; }
  else if (r.status === 'published' && review && linksChanged) { status = 'pending'; data.recheck = true; note = '참여 링크·문의처가 바뀌어 운영팀이 다시 확인한 뒤 게시합니다.'; }
  else if (r.status === 'published' && review) data.recheck = true;
  else if (r.status === 'hidden') { data.recheck = true; note = '운영팀이 숨긴 글은 고쳐도 바로 다시 보이지 않습니다. 운영팀이 확인합니다.'; }
  await env.DB.prepare('UPDATE community_posts SET status = ?, category = ?, title = ?, author = ?, data = ?, publish_at = ?, updated_at = ? WHERE ref = ?')
    .bind(status, category, title, author, JSON.stringify(data), publish, t, ref).run();
  if (pk.list !== null) await attachPhotos(env, ref, photos, prevPhotos.map(p => p.id));
  await log(env, 'community.edit', ref, 'member:' + member.id, { from: r.status, to: status, links: linksChanged, photos: photos.length });
  return { ok: true, ref, board: r.board, status, status_label: STATUS[status], note };
}
export async function deletePost(env, member, ref) {
  const r = await ownPost(env, member, ref); if (!r) return { error: '글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  await env.DB.prepare("UPDATE community_posts SET status = 'deleted', updated_at = ? WHERE ref = ?").bind(now(), ref).run();
  await log(env, 'community.delete', ref, 'member:' + member.id, { from: r.status });
  return { ok: true };
}
export async function myPosts(env, member) {
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM community_posts p WHERE p.member_id = ? AND p.status != 'deleted' ORDER BY p.created_at DESC LIMIT 100`).bind(member.id).all();
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM community_comments WHERE member_id = ? AND status = 'published'").bind(member.id).first();
  const cfg = await getConfig(env);
  return { items: (results || []).map(ownerView), comments: (c || {}).n || 0, blocked: isBlocked(cfg, member.id), modes: { group: cfg.group.mode, free: cfg.free.mode } };
}

// ---------- 공감 · 댓글 · 신고 ----------
export async function toggleLike(env, member, ref) {
  const r = await getPost(env, ref);
  if (!visible(r, now())) return { error: '글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  if (r.member_id === member.id) return { error: '내 글에는 공감을 누를 수 없습니다.', status: 409, code: 'OWN' };
  const had = await env.DB.prepare('SELECT 1 AS x FROM community_reactions WHERE post_ref = ? AND member_id = ?').bind(ref, member.id).first();
  if (had) await env.DB.prepare('DELETE FROM community_reactions WHERE post_ref = ? AND member_id = ?').bind(ref, member.id).run();
  else await env.DB.prepare('INSERT OR IGNORE INTO community_reactions (post_ref, member_id, created_at) VALUES (?,?,?)').bind(ref, member.id, now()).run();
  await env.DB.prepare('UPDATE community_posts SET likes = (SELECT COUNT(*) FROM community_reactions WHERE post_ref = ?) WHERE ref = ?').bind(ref, ref).run();
  const n = await env.DB.prepare('SELECT likes FROM community_posts WHERE ref = ?').bind(ref).first();
  return { ok: true, liked: !had, likes: (n || {}).likes || 0 };
}
export async function recountComments(env, ref) {
  await env.DB.prepare("UPDATE community_posts SET comments = (SELECT COUNT(*) FROM community_comments WHERE post_ref = ? AND status = 'published') WHERE ref = ?").bind(ref, ref).run();
}
export async function addComment(env, member, ref, d) {
  const r = await getPost(env, ref), cfg = await getConfig(env);
  if (!visible(r, now())) return { error: '글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  if (!cfg[r.board].comments) return { error: '지금은 이 게시판에 댓글을 달 수 없습니다.', status: 409, code: 'CLOSED' };
  if (isBlocked(cfg, member.id)) return { error: '커뮤니티 글쓰기가 제한된 계정입니다.', status: 403, code: 'BLOCKED' };
  const body = str(d.body, 1000);
  if (body.length < 2) return { error: '댓글을 2자 이상 적어 주세요.' };
  if (urlCount(body) > 2) return { error: '댓글에는 링크를 2개까지 넣을 수 있습니다.' };
  const bad = bannedIn(cfg, body); if (bad) return { error: `쓸 수 없는 낱말(${bad})이 들어 있습니다.` };
  // 별명을 비운 글쓴이는 글에 쓴 이름을 그대로 씁니다
  const author = !str(d.author, 12) && r.member_id === member.id ? r.author : nickOk(d.author, member); if (author.error) return author;
  const t = now();
  const res = await env.DB.prepare("INSERT INTO community_comments (post_ref, member_id, author, official, body, status, created_at) VALUES (?,?,?,0,?,'published',?)").bind(ref, member.id, author, body, t).run();
  await recountComments(env, ref);
  const id = res && res.meta && res.meta.last_row_id || res && res.lastInsertRowid;
  return { ok: true, comment: { id: Number(id) || 0, author, official: false, writer: r.member_id === member.id, mine: true, body, created_at: t } };
}
export async function deleteComment(env, member, id) {
  const c = await env.DB.prepare("SELECT id, post_ref, member_id FROM community_comments WHERE id = ? AND status != 'deleted'").bind(id).first();
  if (!c || c.member_id !== member.id) return { error: '댓글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  await env.DB.prepare("UPDATE community_comments SET status = 'deleted', updated_at = ? WHERE id = ?").bind(now(), id).run();
  await recountComments(env, c.post_ref);
  return { ok: true };
}
async function recountReports(env, ref, commentId) {
  if (commentId) await env.DB.prepare("UPDATE community_comments SET reports = (SELECT COUNT(*) FROM community_reports WHERE post_ref = ? AND comment_id = ? AND status = 'new') WHERE id = ?").bind(ref, commentId, commentId).run();
  else await env.DB.prepare("UPDATE community_posts SET reports = (SELECT COUNT(*) FROM community_reports WHERE post_ref = ? AND comment_id = 0 AND status = 'new') WHERE ref = ?").bind(ref, ref).run();
}
export async function report(env, member, d) {
  const ref = str(d.ref, 20).toUpperCase(), cid = num(d.comment_id) || 0, reason = has(REPORT_REASONS, d.reason) ? d.reason : '';
  if (!POST_REF.test(ref) || !reason) return { error: '신고할 글과 이유를 확인해 주세요.' };
  const r = await getPost(env, ref); if (!visible(r, now())) return { error: '글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  let target = r;
  if (cid) { target = await env.DB.prepare("SELECT id, member_id, official FROM community_comments WHERE id = ? AND post_ref = ? AND status = 'published'").bind(cid, ref).first(); if (!target) return { error: '댓글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' }; }
  if (target.member_id && target.member_id === member.id) return { error: '내가 쓴 글은 신고할 수 없습니다.', status: 409, code: 'OWN' };
  const res = await env.DB.prepare('INSERT OR IGNORE INTO community_reports (post_ref, comment_id, member_id, reason, detail, status, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(ref, cid, member.id, reason, str(d.detail, 300), 'new', now()).run();
  const changed = res && ((res.meta && res.meta.changes) ?? res.changes);
  if (!changed) return { ok: true, already: true };
  await recountReports(env, ref, cid);
  await log(env, 'community.report', ref, 'member:' + member.id, { comment: cid, reason });
  // 서로 다른 회원의 신고가 기준 수에 닿으면 운영팀이 볼 때까지 숨깁니다 (운영팀 글은 제외)
  const cfg = await getConfig(env); let hidden = false;
  if (cfg.auto_hide > 0 && !target.official) {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM community_reports WHERE post_ref = ? AND comment_id = ? AND status = 'new'").bind(ref, cid).first();
    if ((n || {}).n >= cfg.auto_hide) {
      const t = now(); hidden = true;
      if (cid) { await env.DB.prepare("UPDATE community_comments SET status = 'hidden', updated_at = ? WHERE id = ? AND status = 'published'").bind(t, cid).run(); await recountComments(env, ref); }
      else await env.DB.prepare("UPDATE community_posts SET status = 'hidden', data = json_set(data, '$.auto_hidden', ?), updated_at = ? WHERE ref = ? AND status = 'published'").bind(t, t, ref).run();
      await log(env, 'community.auto_hide', ref, 'system', { comment: cid, reports: n.n });
    }
  }
  return { ok: true, hidden };
}

// 탈퇴한 회원의 글·댓글은 내립니다 (기록은 보관 — _retention.js)
export async function withdrawMember(env, memberId) {
  const t = now();
  await env.DB.prepare("UPDATE community_posts SET status = 'deleted', updated_at = ? WHERE member_id = ? AND status != 'deleted'").bind(t, memberId).run();
  await env.DB.prepare("UPDATE community_comments SET status = 'deleted', updated_at = ? WHERE member_id = ? AND status != 'deleted'").bind(t, memberId).run();
  await env.DB.prepare('DELETE FROM community_reactions WHERE member_id = ?').bind(memberId).run();
}

// =====================================================================
// 관리자
// =====================================================================
// 2026-11-24부터 기본은 보관(지운 글도 화면에서만 내리고 DB에 남김) — CUSTOMER_DATA_PURGE='on' 일 때만 완전히 지웁니다.
export async function purgeDeleted(env) {
  if (!purgeEnabled(env)) return 0;
  const before = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const { results } = await env.DB.prepare("SELECT ref FROM community_posts WHERE status = 'deleted' AND COALESCE(updated_at, created_at) < ? LIMIT 50").bind(before).all();
  const refs = (results || []).map(r => r.ref);
  if (refs.length) {
    const list = JSON.stringify(refs);
    for (const tbl of ['community_comments', 'community_reactions', 'community_reports']) await env.DB.prepare(`DELETE FROM ${tbl} WHERE post_ref IN (SELECT value FROM json_each(?))`).bind(list).run();
    await env.DB.prepare('DELETE FROM community_posts WHERE ref IN (SELECT value FROM json_each(?))').bind(list).run();
  }
  try { await purgePhotosOf(env, refs); } catch (e) { console.error('community photo purge', e && e.message); }
  await env.DB.prepare("DELETE FROM community_comments WHERE status = 'deleted' AND COALESCE(updated_at, created_at) < ?").bind(before).run();
  return refs.length;
}
export async function adminSummary(env) {
  try { await purgeDeleted(env); } catch (e) { console.error('community purge', e && e.message); }
  const t = now(), day = new Date(Date.now() - 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const s = await env.DB.prepare(`SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
      SUM(CASE WHEN status = 'published' AND publish_at > ? THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN status = 'published' AND json_extract(data, '$.recheck') THEN 1 ELSE 0 END) AS recheck,
      SUM(CASE WHEN status = 'published' AND publish_at <= ? AND board = 'group' THEN 1 ELSE 0 END) AS groups,
      SUM(CASE WHEN status = 'published' AND publish_at <= ? AND board = 'free' THEN 1 ELSE 0 END) AS free,
      SUM(CASE WHEN status != 'deleted' AND created_at >= ? THEN 1 ELSE 0 END) AS posts_24h
    FROM community_posts`).bind(t, t, t, day).first();
  const c = await env.DB.prepare("SELECT SUM(CASE WHEN created_at >= ? AND status != 'deleted' THEN 1 ELSE 0 END) AS comments_24h, SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS comments_hidden FROM community_comments").bind(day).first();
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM community_reports WHERE status = 'new'").first();
  const o = {}; for (const [k, v] of Object.entries({ ...(s || {}), ...(c || {}) })) o[k] = v || 0;
  return { ...o, reports_new: (r || {}).n || 0 };
}
export async function adminList(env, q) {
  const where = [], bind = [], t = now();
  if (has(BOARDS, q.board)) { where.push('p.board = ?'); bind.push(q.board); }
  if (q.status === 'scheduled') { where.push("p.status = 'published' AND p.publish_at > ?"); bind.push(t); }
  else if (q.status === 'live') { where.push("p.status = 'published' AND p.publish_at <= ?"); bind.push(t); }
  else if (has(STATUS, q.status)) { where.push('p.status = ?'); bind.push(q.status); }
  else if (q.status !== 'all') where.push("p.status != 'deleted'");
  if (q.cat) { where.push('p.category = ?'); bind.push(str(q.cat, 20)); }
  if (q.flag === 'reported') where.push('p.reports > 0');
  else if (q.flag === 'recheck') where.push("json_extract(p.data, '$.recheck')");
  else if (q.flag === 'official') where.push('p.official = 1');
  else if (q.flag === 'pinned') where.push('p.pinned = 1');
  else if (q.flag === 'featured') where.push('p.featured = 1');
  if (q.q) { const s = like(q.q); where.push('(p.title LIKE ? OR p.author LIKE ? OR p.ref LIKE ? OR m.email LIKE ? OR m.name LIKE ? OR json_extract(p.data, \'$.body\') LIKE ?)'); bind.push(s, s, s, s, s, s); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const size = Math.max(1, Math.min(100, num(q.size) || 30)), page = Math.max(1, num(q.page) || 1);
  const order = q.sort === 'views' ? 'p.views DESC' : q.sort === 'reports' ? 'p.reports DESC, p.created_at DESC' : q.sort === 'old' ? 'p.created_at' : "CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.created_at DESC";
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM community_posts p LEFT JOIN members m ON m.id = p.member_id ${w}`).bind(...bind).first();
  const { results } = await env.DB.prepare(`SELECT ${COLS}, m.email AS m_email, m.name AS m_name FROM community_posts p LEFT JOIN members m ON m.id = p.member_id ${w} ORDER BY ${order} LIMIT ${size} OFFSET ${(page - 1) * size}`).bind(...bind).all();
  const cfg = await getConfig(env);
  return { items: (results || []).map(r => adminRow(r, t, cfg)), total: (total || {}).n || 0, page, size };
}
function adminRow(r, t, cfg) {
  const d = safeJson(r.data);
  return { ...publicPost(r), status: r.status, status_label: r.status === 'published' && r.publish_at > t ? '예약 게시' : STATUS[r.status] || r.status, scheduled: r.status === 'published' && r.publish_at > t,
    reports: r.reports || 0, recheck: !!d.recheck, auto_hidden: !!d.auto_hidden, member_id: r.member_id || null, member_email: r.m_email || '', member_name: r.m_name || '',
    blocked: !!(r.member_id && cfg && isBlocked(cfg, r.member_id)), created_at: r.created_at, updated_at: r.updated_at || '' };
}
export async function adminDetail(env, ref) {
  const r = await env.DB.prepare(`SELECT ${COLS}, m.email AS m_email, m.name AS m_name, m.phone AS m_phone, m.status AS m_status FROM community_posts p LEFT JOIN members m ON m.id = p.member_id WHERE p.ref = ?`).bind(ref).first();
  if (!r) return null;
  const t = now(), d = safeJson(r.data), cfg = await getConfig(env);
  const { results: comments } = await env.DB.prepare('SELECT c.id, c.member_id, c.author, c.official, c.body, c.status, c.reports, c.created_at, m.email AS m_email FROM community_comments c LEFT JOIN members m ON m.id = c.member_id WHERE c.post_ref = ? ORDER BY c.created_at, c.id LIMIT 500').bind(ref).all();
  const { results: reports } = await env.DB.prepare('SELECT id, comment_id, member_id, reason, detail, status, created_at, handled_at FROM community_reports WHERE post_ref = ? ORDER BY created_at DESC LIMIT 200').bind(ref).all();
  const mine = r.member_id ? await env.DB.prepare("SELECT COUNT(*) AS n FROM community_posts WHERE member_id = ? AND status != 'deleted'").bind(r.member_id).first() : null;
  return { item: { ...adminRow(r, t, cfg), ...publicPost(r, { full: true }), status: r.status, status_label: adminRow(r, t, cfg).status_label,
      raw: Object.fromEntries(SUMMARY_KEYS.filter(k => has(d, k)).map(k => [k, d[k]])), contact_phone: d.contact_phone || '', contact_email: d.contact_email || '',
      admin_note: d.admin_note || '', reject_reason: d.reject_reason || '', publish_at: r.publish_at, member_phone: r.m_phone || '', member_status: r.m_status || '', member_posts: (mine || {}).n || 0 },
    comments: (comments || []).map(c => ({ ...c, official: !!c.official, email: c.m_email || '' })),
    reports: (reports || []).map(x => ({ ...x, reason_label: REPORT_REASONS[x.reason] || x.reason })) };
}
export async function adminCreate(env, d) {
  const board = has(BOARDS, d.board) ? d.board : '';
  if (!board) return { error: '게시판을 골라 주세요.' };
  const o = clean(board, d, { official: true }); if (o.error) return o;
  const t = now(), status = d.status === 'draft' ? 'draft' : 'published';
  const at = d.publish_at ? kstInput(d.publish_at) : t;
  if (d.publish_at && !at) return { error: '게시 시각을 확인해 주세요.' };
  const ref = await uniqueRef(env, 'community_posts', 'ref', PREFIX[board]);
  const { title, category, ...rest } = o;
  await env.DB.prepare('INSERT INTO community_posts (ref, board, status, category, title, member_id, author, official, pinned, featured, data, publish_at, created_at) VALUES (?,?,?,?,?,NULL,?,1,?,?,?,?,?)')
    .bind(ref, board, status, category, title, '메가스팟 운영팀', d.pinned ? 1 : 0, d.featured && board === 'group' ? 1 : 0, JSON.stringify({ ...rest, admin_note: str(d.admin_note, 1000) }), at, t).run();
  await log(env, 'community.admin_create', ref, 'admin', { board, status, publish_at: at });
  return { ok: true, ref, status, scheduled: status === 'published' && at > t };
}
const ADMIN_TO = ['draft', 'pending', 'published', 'hidden', 'rejected', 'deleted'];
export async function adminPatch(env, ref, d) {
  const r = await getPost(env, ref); if (!r) return { error: '글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  const t = now(), data = safeJson(r.data);
  let status = r.status, title = r.title, category = r.category, author = r.author, publish = r.publish_at;
  if (d.edit) {
    const o = clean(r.board, d.edit, { official: !!r.official }); if (o.error) return o;
    ({ title, category } = o); const { title: _t, category: _c, ...rest } = o; Object.assign(data, rest);
  }
  if (d.status !== undefined) {
    if (!ADMIN_TO.includes(d.status)) return { error: '상태 값을 확인해 주세요.' };
    if (d.status === 'rejected' && !str(d.reject_reason, 300) && !data.reject_reason) return { error: '반려 이유를 적어 주세요. 글쓴이의 ‘내 글’ 화면에 보입니다.' };
    // 검토 대기·반려 글은 게시하는 때를 게시 시각으로, 임시 저장 글은 예약 시각이 지났으면 지금으로, 숨겼던 글은 처음 게시 시각을 그대로 씁니다
    if (d.status === 'published' && r.status !== 'published') {
      if (['pending', 'rejected'].includes(r.status) || !publish || (r.status === 'draft' && publish <= t)) publish = t;
    }
    status = d.status;
    if (status === 'published') { delete data.recheck; delete data.auto_hidden; delete data.reject_reason; }
  }
  if (d.reject_reason !== undefined) data.reject_reason = str(d.reject_reason, 300);
  if (d.checked) delete data.recheck;
  if (d.admin_note !== undefined) data.admin_note = str(d.admin_note, 1000);
  if (d.publish_at !== undefined) { if (!d.publish_at) publish = publish || t; else { const at = kstInput(d.publish_at); if (!at) return { error: '게시 시각을 확인해 주세요.' }; publish = at; } }
  if (d.author !== undefined && r.official) author = str(d.author, 20) || author;
  const pinned = d.pinned === undefined ? r.pinned : (d.pinned ? 1 : 0), featured = d.featured === undefined ? r.featured : (d.featured && r.board === 'group' ? 1 : 0);
  await env.DB.prepare('UPDATE community_posts SET status = ?, title = ?, category = ?, author = ?, pinned = ?, featured = ?, data = ?, publish_at = ?, updated_at = ? WHERE ref = ?')
    .bind(status, title, category, author, pinned, featured, JSON.stringify(data), publish, t, ref).run();
  // 숨기거나 지우면 이 글에 들어온 새 신고는 '조치함'으로 닫습니다
  if (['hidden', 'deleted', 'rejected'].includes(status) && status !== r.status) {
    await env.DB.prepare("UPDATE community_reports SET status = 'done', handled_at = ? WHERE post_ref = ? AND comment_id = 0 AND status = 'new'").bind(t, ref).run();
    await recountReports(env, ref, 0);
  }
  await log(env, 'community.admin', ref, 'admin', { from: r.status, to: status, pinned, featured, edit: !!d.edit, publish_at: publish });
  return { ok: true, status };
}
export async function adminBulk(env, d) {
  const refs = (Array.isArray(d.refs) ? d.refs : []).map(x => str(x, 20).toUpperCase()).filter(x => POST_REF.test(x)).slice(0, 200);
  if (!refs.length) return { error: '글을 골라 주세요.' };
  const A = { publish: { status: 'published' }, hide: { status: 'hidden' }, delete: { status: 'deleted' }, pin: { pinned: true }, unpin: { pinned: false }, feature: { featured: true }, unfeature: { featured: false } }[d.action];
  if (!A) return { error: '할 일을 골라 주세요.' };
  let done = 0; const failed = [];
  for (const ref of refs) { const r = await adminPatch(env, ref, A); if (r.error) failed.push(ref); else done++; }
  return { ok: true, done, failed };
}
export async function adminComments(env, q) {
  const where = [], bind = [];
  if (['published', 'hidden', 'deleted'].includes(q.status)) { where.push('c.status = ?'); bind.push(q.status); } else if (q.status !== 'all') where.push("c.status != 'deleted'");
  if (q.flag === 'reported') where.push('c.reports > 0');
  if (q.q) { const s = like(q.q); where.push('(c.body LIKE ? OR c.author LIKE ? OR p.title LIKE ? OR m.email LIKE ?)'); bind.push(s, s, s, s); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const size = Math.max(1, Math.min(100, num(q.size) || 40)), page = Math.max(1, num(q.page) || 1);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM community_comments c LEFT JOIN community_posts p ON p.ref = c.post_ref LEFT JOIN members m ON m.id = c.member_id ${w}`).bind(...bind).first();
  const { results } = await env.DB.prepare(`SELECT c.id, c.post_ref, c.member_id, c.author, c.official, c.body, c.status, c.reports, c.created_at, p.title AS post_title, p.board, m.email AS m_email
    FROM community_comments c LEFT JOIN community_posts p ON p.ref = c.post_ref LEFT JOIN members m ON m.id = c.member_id ${w} ORDER BY c.created_at DESC, c.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`).bind(...bind).all();
  return { items: (results || []).map(c => ({ ...c, official: !!c.official, email: c.m_email || '' })), total: (total || {}).n || 0, page, size };
}
export async function adminCommentStatus(env, id, status) {
  if (!['published', 'hidden', 'deleted'].includes(status)) return { error: '상태 값을 확인해 주세요.' };
  const c = await env.DB.prepare('SELECT id, post_ref, status FROM community_comments WHERE id = ?').bind(id).first();
  if (!c) return { error: '댓글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  const t = now();
  await env.DB.prepare('UPDATE community_comments SET status = ?, updated_at = ? WHERE id = ?').bind(status, t, id).run();
  if (status !== 'published') { await env.DB.prepare("UPDATE community_reports SET status = 'done', handled_at = ? WHERE comment_id = ? AND status = 'new'").bind(t, id).run(); await recountReports(env, c.post_ref, id); }
  await recountComments(env, c.post_ref);
  await log(env, 'community.comment', c.post_ref, 'admin', { comment: id, from: c.status, to: status });
  return { ok: true };
}
export async function adminReply(env, ref, body) {
  const r = await getPost(env, ref); if (!r || r.status === 'deleted') return { error: '글을 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  const b = str(body, 1000); if (b.length < 2) return { error: '댓글을 2자 이상 적어 주세요.' };
  await env.DB.prepare("INSERT INTO community_comments (post_ref, member_id, author, official, body, status, created_at) VALUES (?,NULL,'메가스팟 운영팀',1,?,'published',?)").bind(ref, b, now()).run();
  await recountComments(env, ref);
  await log(env, 'community.reply', ref, 'admin', {});
  return { ok: true };
}
export async function adminReports(env, q) {
  const where = [], bind = [];
  if (['new', 'done', 'dismissed'].includes(q.status)) { where.push('r.status = ?'); bind.push(q.status); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const { results } = await env.DB.prepare(`SELECT r.id, r.post_ref, r.comment_id, r.member_id, r.reason, r.detail, r.status, r.created_at, r.handled_at,
      p.title AS post_title, p.board, p.status AS post_status, p.author AS post_author, c.body AS comment_body, c.author AS comment_author, c.status AS comment_status, m.email AS reporter
    FROM community_reports r LEFT JOIN community_posts p ON p.ref = r.post_ref LEFT JOIN community_comments c ON c.id = r.comment_id LEFT JOIN members m ON m.id = r.member_id
    ${w} ORDER BY r.created_at DESC LIMIT 200`).bind(...bind).all();
  return { items: (results || []).map(x => ({ ...x, reason_label: REPORT_REASONS[x.reason] || x.reason, reporter: x.reporter || '' })) };
}
export async function adminReport(env, id, d) {
  const x = await env.DB.prepare('SELECT id, post_ref, comment_id, status FROM community_reports WHERE id = ?').bind(id).first();
  if (!x) return { error: '신고를 찾을 수 없습니다.', status: 404, code: 'NOT_FOUND' };
  if (!['done', 'dismissed'].includes(d.status)) return { error: '처리 결과를 골라 주세요.' };
  const t = now();
  if (d.hide) {
    if (x.comment_id) await adminCommentStatus(env, x.comment_id, 'hidden');
    else await adminPatch(env, x.post_ref, { status: 'hidden' });
  }
  // 같은 대상의 새 신고를 한꺼번에 닫습니다
  await env.DB.prepare("UPDATE community_reports SET status = ?, handled_at = ? WHERE post_ref = ? AND comment_id = ? AND status = 'new'").bind(d.status, t, x.post_ref, x.comment_id).run();
  await env.DB.prepare('UPDATE community_reports SET status = ?, handled_at = ? WHERE id = ?').bind(d.status, t, id).run();
  await recountReports(env, x.post_ref, x.comment_id);
  await log(env, 'community.report_done', x.post_ref, 'admin', { report: id, status: d.status, hide: !!d.hide });
  return { ok: true };
}
export async function blockedList(env) {
  const cfg = await getConfig(env);
  if (!cfg.blocked.length) return [];
  const ids = JSON.stringify(cfg.blocked.map(b => num(b.id)));
  const { results } = await env.DB.prepare('SELECT id, name, email FROM members WHERE id IN (SELECT value FROM json_each(?))').bind(ids).all();
  const byId = Object.fromEntries((results || []).map(m => [m.id, m]));
  return cfg.blocked.map(b => ({ ...b, name: (byId[b.id] || {}).name || '(탈퇴한 회원)', email: (byId[b.id] || {}).email || '' }));
}
