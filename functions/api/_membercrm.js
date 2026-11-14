// 관리자 '회원 관리' — 회원 목록·상세·메모, 엑셀 내려받기, 문자·카카오 알림톡·이메일 보내기 (2026-11-14)
//  API: functions/api/crm/[[path]].js (/api/crm/*, 관리자 로그인 필요)
//  보내는 길
//   · 문자: 알리고 고정 IP 연결 서버의 member/send 경로 (deploy/aligo-relay/server.mjs). 90바이트 이하는 단문, 넘으면 장문.
//   · 카카오 알림톡: 승인받은 '회원 안내' 템플릿(정보성만). 실패하면 알리고가 같은 내용의 문자로 대신 보냅니다.
//   · 이메일: Resend API (Cloudflare 환경 변수 RESEND_API_KEY · MAIL_FROM). 없으면 관리자 화면에서 메일 프로그램으로 보내기만 됩니다.
//  광고성 메시지(정보통신망법 제50조): 마케팅 수신 동의 회원만, 맨 앞 '(광고)', 보내는 곳 이름·연락처, 무료 수신거부 방법을 넣고,
//   문자는 밤 9시~아침 8시(한국 시각)에 보내지 않습니다. 수신거부 링크(/unsubscribe/)를 누르면 바로 동의가 철회됩니다.
import { str, now, later, kstToday, uniqueRef, log, isEmail } from './_lib.js';
import { safeJson } from './_platform.js';
import { hmacToken, tokenEq } from './_confirm.js';
import { aligoProvider } from './_guide_messages.js';
import { sha256 } from './_lib.js';

const RELAY = 'https://relay.naranhistory.com/megaspot/aligo';
const SITE = 'https://megaspot.kr';
export const CHANNELS = { sms: '문자', kakao: '카카오 알림톡', email: '이메일' };
export const PURPOSES = { info: '정보성 안내', ad: '광고성 (마케팅 수신 동의 회원만)' };
export const TARGET_STATUS = { queued: '대기', sending: '보내는 중', sent: '접수', failed: '실패', unknown: '확인 필요', skipped: '보내기 전 제외' };
export const CAMPAIGN_STATUS = { ready: '보낼 준비', sending: '보내는 중', done: '끝', stopped: '멈춤' };
export const MEMBER_TAGS = { vip: '자주 이용', corp: '기업·단체', followup: '다시 연락', caution: '주의 필요', host: '호스트 후보' };
const BATCH = 10;               // 한 번 요청에 보내는 수 (관리자 화면이 끝날 때까지 이어서 부릅니다)
const MAX_TARGETS = 5000;
const CFG = 'member_msg';
// 카카오 알림톡 '회원 안내' 템플릿 (정보성). 알리고에 이 내용 그대로 등록·승인받은 뒤 코드를 넣습니다.
export const MEMBER_TEMPLATE = {
  name: '회원 안내',
  content: '[메가스팟 회원 안내]\n#{회원명}님, 메가스팟에서 알려 드립니다.\n\n#{안내내용}\n\n자세한 내용은 아래 버튼을 눌러 확인해 주세요.',
  buttons: [{ name: '메가스팟 열기', linkType: 'WL', linkTypeName: '웹링크', linkMo: SITE + '/', linkPc: SITE + '/' }]
};

// ---------- 설정 ----------
async function getSetting(env, key) { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first(); return r ? r.value : null; }
async function putSetting(env, key, value) { await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, now()).run(); }
export async function msgConfig(env) {
  const c = safeJson(await getSetting(env, CFG)) || {};
  return { sender_name: '메가스팟', contact: str(c.contact, 30) || '010-2384-9580', optout_080: str(c.optout_080, 20), kakao_code: str(c.kakao_code, 30) };
}
export async function saveConfig(env, d) {
  const cur = await msgConfig(env), next = { ...cur };
  if (d.contact !== undefined) { const v = str(d.contact, 30); if (!/^[0-9-]{8,15}$/.test(v)) return { error: '보내는 곳 연락처를 숫자와 - 로 적어 주세요.' }; next.contact = v; }
  if (d.optout_080 !== undefined) { const v = str(d.optout_080, 20); if (v && !/^080-?\d{3,4}-?\d{4}$/.test(v)) return { error: '무료 수신거부 번호는 080으로 시작하는 번호로 적어 주세요.' }; next.optout_080 = v; }
  if (d.kakao_code !== undefined) { const v = str(d.kakao_code, 30); if (v && !/^[A-Za-z0-9_-]{2,30}$/.test(v)) return { error: '템플릿 코드는 영문·숫자로 적어 주세요. (예: UN_1234)' }; next.kakao_code = v; }
  await putSetting(env, CFG, JSON.stringify({ contact: next.contact, optout_080: next.optout_080, kakao_code: next.kakao_code }));
  if (d.kakao_code !== undefined && d.kakao_code !== cur.kakao_code) await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(CFG + ':kakao_ready').run();
  return { ok: true };
}
const relayLive = env => env.ALIGO_LIVE_ENABLED === 'true' && env.ALIGO_RELAY_URL === RELAY && String(env.ALIGO_RELAY_SECRET || '').length >= 32;
const emailLive = env => !!(env.RESEND_API_KEY && /@/.test(env.MAIL_FROM || ''));
async function kakaoSig(env, code) { return sha256(JSON.stringify(['member-alimtalk-v1', env.ALIGO_SENDER_KEY || '', code, MEMBER_TEMPLATE.content, MEMBER_TEMPLATE.buttons])); }
async function kakaoReady(env, cfg) { return !!cfg.kakao_code && (await getSetting(env, CFG + ':kakao_ready')) === await kakaoSig(env, cfg.kakao_code); }
// 알리고에 등록된 템플릿이 승인됐고 본문·버튼이 같은지 확인합니다
export async function checkKakao(env) {
  const cfg = await msgConfig(env); if (!cfg.kakao_code) return { ready: false, review: '', error: '템플릿 코드를 먼저 넣어 주세요.' };
  let out = { ready: false, review: 'unavailable', matches: false };
  try {
    const r = await aligoProvider(env, 'template/list', { tpl_code: cfg.kakao_code });
    const tp = Number(r?.code) === 0 ? (r.list || []).find(x => x.templtCode === cfg.kakao_code) : null, b = tp ? tp.buttons || [] : [];
    const matches = !!tp && String(tp.templtContent || '').replace(/\r\n/g, '\n') === MEMBER_TEMPLATE.content && b.length === MEMBER_TEMPLATE.buttons.length
      && MEMBER_TEMPLATE.buttons.every((x, i) => x.name === b[i].name && x.linkType === b[i].linkType && x.linkMo === (b[i].linkMo || b[i].linkM));
    out = { review: tp ? tp.inspStatus || '' : 'missing', matches, ready: matches && tp.inspStatus === 'APR' && ['A', 'R'].includes(tp.status) };
  } catch { /* 연결 서버가 이 코드를 아직 허용하지 않거나 응답이 없음 */ }
  if (out.ready) await putSetting(env, CFG + ':kakao_ready', await kakaoSig(env, cfg.kakao_code)); else await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(CFG + ':kakao_ready').run();
  return out;
}
// 채널마다 지금 보낼 수 있는지와 이유
export async function channelState(env, { probe = true } = {}) {
  const cfg = await msgConfig(env), out = {};
  let sms = { ready: false, reason: '' };
  if (!relayLive(env)) sms.reason = '문자·알림톡 운영 발송 설정(ALIGO_LIVE_ENABLED)이 꺼져 있거나 연결 서버 설정이 없습니다.';
  else if (probe) {
    try { const r = await aligoProvider(env, 'member/status', {}); sms = r && r.ready ? { ready: true, reason: '' } : { ready: false, reason: '연결 서버가 회원 문자를 아직 받지 않습니다.' }; }
    catch (e) { sms.reason = e && e.status === 400 ? '연결 서버에 회원 문자 경로(member/send)를 적용해야 합니다. deploy/aligo-relay/README 참고.' : '연결 서버 응답을 받지 못했습니다.'; }
  } else sms = { ready: true, reason: '' };
  out.sms = sms;
  const kReady = sms.ready && await kakaoReady(env, cfg);
  out.kakao = { ready: kReady, reason: kReady ? '' : !cfg.kakao_code ? '‘회원 안내’ 알림톡 템플릿을 알리고에 등록·승인받은 뒤 코드를 넣어 주세요.' : !sms.ready ? sms.reason : '템플릿 승인 확인을 통과해야 합니다.', info_only: true };
  out.email = { ready: emailLive(env), reason: emailLive(env) ? '' : '이메일 발송 서비스(Resend)의 키(RESEND_API_KEY)와 보내는 주소(MAIL_FROM)를 Cloudflare에 넣으면 여기서 바로 보냅니다. 그 전에는 메일 프로그램으로 보내기를 쓰세요.', from: env.MAIL_FROM || '' };
  return out;
}

// ---------- 회원 목록 ----------
const INQ_OF = "json_extract(CASE WHEN json_valid(i.data) THEN i.data END, '$.member_id')";
export function memberWhere(f = {}) {
  const w = [], b = [];
  const q = str(f.q, 60);
  if (q) { const digits = q.replace(/[^0-9]/g, ''); w.push('(m.email LIKE ? OR m.name LIKE ? OR m.org LIKE ? OR REPLACE(COALESCE(m.phone,\'\'),\'-\',\'\') LIKE ?)'); b.push('%' + q + '%', '%' + q + '%', '%' + q + '%', '%' + (digits || q) + '%'); }
  if (['active', 'suspended'].includes(f.status)) { w.push('m.status = ?'); b.push(f.status); }
  if (f.mkt === '1' || f.mkt === '0') { w.push('m.agree_marketing = ?'); b.push(+f.mkt); }
  if (f.host === '1') w.push('EXISTS (SELECT 1 FROM member_hosts l WHERE l.member_id = m.id)');
  if (f.host === '0') w.push('NOT EXISTS (SELECT 1 FROM member_hosts l WHERE l.member_id = m.id)');
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.from || '')) { w.push("date(m.created_at, '+9 hours') >= ?"); b.push(f.from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to || '')) { w.push("date(m.created_at, '+9 hours') <= ?"); b.push(f.to); }
  if (f.act === 'inquiry') w.push(`EXISTS (SELECT 1 FROM inquiries i WHERE ${INQ_OF} = m.id AND i.status <> '삭제됨')`);
  if (f.act === 'none') w.push(`NOT EXISTS (SELECT 1 FROM inquiries i WHERE ${INQ_OF} = m.id AND i.status <> '삭제됨')`);
  if (f.act === 'booking') w.push(`EXISTS (SELECT 1 FROM inquiries i JOIN bookings bk ON bk.inquiry_ref = i.ref WHERE ${INQ_OF} = m.id AND bk.status IN ('confirmed','completed'))`);
  if (f.act === 'recent') { w.push('m.last_login_at >= ?'); b.push(later(-30)); }
  if (f.act === 'dormant') { w.push('(m.last_login_at IS NULL OR m.last_login_at < ?)'); b.push(later(-90)); }
  const tag = str(f.tag, 20); if (tag && MEMBER_TAGS[tag]) { w.push('EXISTS (SELECT 1 FROM member_notes n WHERE n.member_id = m.id AND n.tags LIKE ?)'); b.push('%"' + tag + '"%'); }
  return { sql: w.length ? ' WHERE ' + w.join(' AND ') : '', args: b };
}
const SORT = { new: 'm.created_at DESC, m.id DESC', old: 'm.created_at ASC, m.id ASC', login: "COALESCE(m.last_login_at,'') DESC, m.id DESC", inquiries: 'inquiries DESC, m.id DESC', name: 'm.name COLLATE NOCASE ASC, m.id ASC' };
const COLS = `m.id, m.email, m.name, m.phone, m.org, m.agree_marketing, m.status, m.created_at, m.last_login_at,
  (SELECT COUNT(*) FROM inquiries i WHERE ${INQ_OF} = m.id AND i.status <> '삭제됨') AS inquiries,
  (SELECT COUNT(*) FROM inquiries i JOIN bookings bk ON bk.inquiry_ref = i.ref WHERE ${INQ_OF} = m.id AND bk.status IN ('confirmed','completed')) AS bookings,
  (SELECT h.code FROM member_hosts l JOIN hosts h ON h.id = l.host_id WHERE l.member_id = m.id) AS host_code,
  (SELECT n.tags FROM member_notes n WHERE n.member_id = m.id) AS tags, (SELECT n.memo FROM member_notes n WHERE n.member_id = m.id) AS memo`;
function row(r) { return { ...r, agree_marketing: !!r.agree_marketing, tags: safeArr(r.tags), memo: r.memo || '' }; }
function safeArr(s) { const v = safeJson(s); return Array.isArray(v) ? v.filter(x => MEMBER_TAGS[x]) : []; }
export async function listMembers(env, f = {}) {
  const { sql, args } = memberWhere(f), size = Math.min(200, Math.max(10, +f.size || 50)), page = Math.max(1, +f.page || 1);
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM members m' + sql).bind(...args).first()).n;
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM members m${sql} ORDER BY ${SORT[f.sort] || SORT.new} LIMIT ? OFFSET ?`).bind(...args, size, (page - 1) * size).all();
  const one = async (q, ...a) => ((await env.DB.prepare(q).bind(...a).first()) || {}).n || 0, month = kstToday().slice(0, 7);
  const summary = { total: await one('SELECT COUNT(*) AS n FROM members'), month_new: await one("SELECT COUNT(*) AS n FROM members WHERE substr(date(created_at,'+9 hours'),1,7) = ?", month),
    mkt: await one("SELECT COUNT(*) AS n FROM members WHERE agree_marketing = 1 AND status = 'active'"), hosts: await one('SELECT COUNT(*) AS n FROM member_hosts'),
    recent: await one('SELECT COUNT(*) AS n FROM members WHERE last_login_at >= ?', later(-30)), suspended: await one("SELECT COUNT(*) AS n FROM members WHERE status = 'suspended'") };
  return { ok: true, count, page, size, items: (results || []).map(row), summary, tags: MEMBER_TAGS };
}
export async function memberDetail(env, id) {
  const m = await env.DB.prepare(`SELECT ${COLS}, m.agreed_at, m.updated_at FROM members m WHERE m.id = ?`).bind(id).first(); if (!m) return null;
  const { results: inq } = await env.DB.prepare(`SELECT i.ref, i.status, i.space_id, i.event_date, i.headcount, i.created_at,
      (SELECT bk.booking_code FROM bookings bk WHERE bk.inquiry_ref = i.ref ORDER BY bk.date LIMIT 1) AS booking_code,
      (SELECT bk.status FROM bookings bk WHERE bk.inquiry_ref = i.ref ORDER BY bk.date LIMIT 1) AS booking_status
    FROM inquiries i WHERE ${INQ_OF} = ? AND i.status <> '삭제됨' ORDER BY i.id DESC LIMIT 50`).bind(id).all();
  const host = await env.DB.prepare('SELECT h.code, h.name, h.status, (SELECT COUNT(*) FROM host_spaces s WHERE s.host_id = h.id) AS spaces, (SELECT COUNT(*) FROM host_spaces s WHERE s.host_id = h.id AND s.status = \'live\') AS live FROM member_hosts l JOIN hosts h ON h.id = l.host_id WHERE l.member_id = ?').bind(id).first();
  const { results: msgs } = await env.DB.prepare(`SELECT c.ref, c.channel, c.purpose, c.subject, c.body, t.status, t.error, t.updated_at FROM member_campaign_targets t JOIN member_campaigns c ON c.id = t.campaign_id WHERE t.member_id = ? ORDER BY c.id DESC LIMIT 30`).bind(id).all();
  const { results: consent } = await env.DB.prepare('SELECT value, source, created_at FROM member_consent_log WHERE member_id = ? ORDER BY id DESC LIMIT 20').bind(id).all();
  return { member: row(m), inquiries: inq || [], host: host || null, messages: (msgs || []).map(x => ({ ...x, channel_label: CHANNELS[x.channel] || x.channel, status_label: TARGET_STATUS[x.status] || x.status })), consent: consent || [] };
}
export async function saveNote(env, id, d) {
  const tags = (Array.isArray(d.tags) ? d.tags : []).filter(t => MEMBER_TAGS[t]).slice(0, 5);
  await env.DB.prepare('INSERT INTO member_notes (member_id, memo, tags, updated_at) VALUES (?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET memo = excluded.memo, tags = excluded.tags, updated_at = excluded.updated_at')
    .bind(id, str(d.memo, 2000) || null, JSON.stringify(tags), now()).run();
  return { ok: true };
}
// 마케팅 수신 동의를 관리자가 바꿀 때 (회원이 전화·메일로 요청한 경우)
export async function setConsent(env, id, value, source) {
  const r = await env.DB.prepare('UPDATE members SET agree_marketing = ?, updated_at = ? WHERE id = ? AND agree_marketing <> ?').bind(value ? 1 : 0, now(), id, value ? 1 : 0).run();
  if (Number(r?.meta?.changes ?? r?.changes ?? 0)) await env.DB.prepare('INSERT INTO member_consent_log (member_id, value, source, created_at) VALUES (?,?,?,?)').bind(id, value ? 1 : 0, source, now()).run();
  return { ok: true };
}
const CSV_HEAD = ['회원번호', '이름', '이메일', '휴대폰', '소속', '가입일', '최근 로그인', '마케팅 수신', '상태', '문의', '확정 예약', '호스트', '표시', '메모'];
const kst = s => { const d = new Date(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '); };
export async function exportMembers(env, f = {}) {
  const { sql, args } = memberWhere(f);
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM members m${sql} ORDER BY ${SORT[f.sort] || SORT.new} LIMIT 20000`).bind(...args).all();
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
  const lines = [CSV_HEAD.join(',')].concat((results || []).map(row).map(m => [m.id, m.name, m.email, m.phone || '', m.org || '', kst(m.created_at), kst(m.last_login_at), m.agree_marketing ? '동의' : '미동의', m.status === 'active' ? '이용 중' : '이용 제한',
    m.inquiries, m.bookings, m.host_code || '', m.tags.map(t => MEMBER_TAGS[t]).join(' '), m.memo].map(cell).join(',')));
  return { csv: '﻿' + lines.join('\r\n'), count: (results || []).length };
}

// ---------- 메시지 만들기 ----------
const phoneOf = p => { const d = String(p || '').replace(/[^0-9]/g, ''); return /^01[016789]\d{7,8}$/.test(d) ? d : ''; };
export async function unsubUrl(env, id) { const k = await hmacToken(env, 'unsub:' + id); return k ? `${SITE}/unsubscribe/?m=${id}&k=${k}` : ''; }
export async function unsubOk(env, id, k) { const t = await hmacToken(env, 'unsub:' + id); return !!t && tokenEq(t, String(k || '')); }
const fill = (text, m) => String(text || '').replace(/\{이름\}/g, m.name || '회원');
export function smsBytes(s) { return [...String(s || '')].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 2 : 1), 0); }
// 보낼 글을 채널·목적에 맞춰 완성합니다 (회원 한 명 기준)
export async function compose(env, cfg, c, m) {
  const body = fill(c.body, m).trim(), ad = c.purpose === 'ad';
  const unsub = ad ? await unsubUrl(env, m.id) : '';
  if (c.channel === 'sms' || c.channel === 'kakao') {
    const head = ad ? '(광고)[메가스팟]' : '[메가스팟]';
    let text = (body.startsWith('[메가스팟]') ? body.slice(6).trim() : body);
    text = head + ' ' + text;
    if (ad) text += `\n\n${cfg.sender_name} ${cfg.contact}\n` + (cfg.optout_080 ? '무료수신거부 ' + cfg.optout_080 : '수신거부 ' + unsub);
    const out = { text, bytes: smsBytes(text), type: smsBytes(text) <= 90 ? '단문(SMS)' : '장문(LMS)' };
    if (c.channel === 'kakao') out.kakao = MEMBER_TEMPLATE.content.replace('#{회원명}', m.name || '회원').replace('#{안내내용}', body);
    return out;
  }
  const subject = (ad ? '(광고) ' : '[메가스팟] ') + fill(c.subject, m).trim();
  const esc = s => s.replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
  const foot = ad ? `이 메일은 메가스팟 소식 받기에 동의하신 분께 보내 드립니다. 보내는 곳: ${cfg.sender_name} · ${cfg.contact}\n더 받지 않으려면: ${unsub}`
    : `메가스팟 회원님께 보내 드리는 서비스 안내입니다. 문의: ${cfg.sender_name} · ${cfg.contact} · 카카오톡 채널 메가스팟`;
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#F4F3F0;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1E2225">
<div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="font-weight:800;font-size:18px;letter-spacing:-.02em;margin-bottom:16px">MEGA<span style="color:#1F53D5">SPOT</span></div>
<div style="background:#fff;border:1px solid #E6E2DB;border-radius:12px;padding:24px;font-size:15px;line-height:1.75">${esc(body).replace(/\n/g, '<br>')}</div>
<p style="font-size:12px;line-height:1.7;color:#6B7178;margin:16px 4px 0">${esc(foot).replace(/\n/g, '<br>').replace(esc(unsub), unsub ? `<a href="${esc(unsub)}" style="color:#6B7178">${esc(unsub)}</a>` : '')}</p>
<p style="font-size:12px;color:#6B7178;margin:6px 4px 0"><a href="${SITE}/" style="color:#1F53D5">megaspot.kr</a></p></div></body></html>`;
  return { subject, html, text: body + '\n\n' + foot, unsub };
}

// ---------- 받는 사람 고르기 ----------
async function membersFor(env, target) {
  if (Array.isArray(target && target.ids)) {
    const ids = [...new Set(target.ids.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, MAX_TARGETS + 1); if (!ids.length) return [];
    const { results } = await env.DB.prepare('SELECT id, name, email, phone, agree_marketing, status FROM members WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(JSON.stringify(ids)).all();
    return results || [];
  }
  const { sql, args } = memberWhere((target && target.filter) || {});
  const { results } = await env.DB.prepare(`SELECT m.id, m.name, m.email, m.phone, m.agree_marketing, m.status FROM members m${sql} ORDER BY m.id LIMIT ${MAX_TARGETS + 1}`).bind(...args).all();
  return results || [];
}
export function checkInput(c) {
  if (!CHANNELS[c.channel]) return '보낼 방법을 골라 주세요.';
  if (!PURPOSES[c.purpose]) return '정보성 안내인지 광고성인지 골라 주세요.';
  if (c.channel === 'kakao' && c.purpose === 'ad') return '카카오 알림톡으로는 광고성 메시지를 보낼 수 없습니다. 문자나 이메일을 골라 주세요.';
  const body = str(c.body, 4000); if (body.length < 5) return '보낼 내용을 적어 주세요.';
  if (c.channel !== 'email' && body.length > 900) return '문자·알림톡은 900자까지 보낼 수 있습니다.';
  if (c.channel === 'email' && !str(c.subject, 120)) return '이메일 제목을 적어 주세요.';
  if (/#\{/.test(body)) return '내용에 #{ 를 쓸 수 없습니다. 이름은 {이름}으로 넣어 주세요.';
  return '';
}
export const nightNow = () => { const h = new Date(Date.now() + 9 * 3600e3).getUTCHours(); return h >= 21 || h < 8; };
export async function plan(env, c) {
  const list = await membersFor(env, c.target); if (list.length > MAX_TARGETS) return { error: `한 번에 ${MAX_TARGETS.toLocaleString('ko-KR')}명까지 보낼 수 있습니다. 조건을 좁혀 주세요.` };
  const seen = new Set(), keep = [], ex = { suspended: 0, no_consent: 0, no_contact: 0, duplicate: 0 };
  for (const m of list) {
    if (m.status !== 'active') { ex.suspended++; continue; }
    if (c.purpose === 'ad' && !m.agree_marketing) { ex.no_consent++; continue; }
    const to = c.channel === 'email' ? (isEmail(String(m.email || '')) ? String(m.email).toLowerCase() : '') : phoneOf(m.phone);
    if (!to) { ex.no_contact++; continue; }
    if (seen.has(to)) { ex.duplicate++; continue; } seen.add(to);
    keep.push({ ...m, to });
  }
  return { list: keep, excluded: ex, picked: list.length };
}
export async function previewCampaign(env, c) {
  const e = checkInput(c); if (e) return { error: e };
  const p = await plan(env, c); if (p.error) return p;
  const cfg = await msgConfig(env), sample = await compose(env, cfg, c, p.list[0] || { id: 0, name: '홍길동' });
  return { ok: true, count: p.list.length, picked: p.picked, excluded: p.excluded, sample, night: c.purpose === 'ad' && c.channel === 'sms' && nightNow(),
    channels: await channelState(env), optout_missing: c.purpose === 'ad' && c.channel === 'sms' && !cfg.optout_080 };
}
// 이메일 발송 서비스를 붙이기 전: 관리자 메일 프로그램으로 보낼 주소 목록 (최대 500명)
export async function recipientEmails(env, c) {
  if (!PURPOSES[c.purpose]) return { error: '정보성 안내인지 광고성인지 골라 주세요.' };
  const p = await plan(env, { ...c, channel: 'email' }); if (p.error) return p;
  if (p.list.length > 500) return { error: '메일 프로그램으로는 한 번에 500명까지 보낼 수 있습니다. 조건을 좁혀 주세요.' };
  await log(env, 'member.email_list', '', 'admin', { purpose: c.purpose, count: p.list.length });
  return { ok: true, emails: p.list.map(m => m.to), excluded: p.excluded, unsub_note: c.purpose === 'ad' };
}
export async function createCampaign(env, c) {
  const e = checkInput(c); if (e) return { error: e };
  const ch = (await channelState(env))[c.channel]; if (!ch.ready) return { error: ch.reason, code: 'CHANNEL_OFF' };
  if (c.purpose === 'ad' && !(await hmacToken(env, 'unsub:1'))) return { error: '수신거부 링크를 만들 서버 비밀값(CONFIRM_SECRET)이 없어 광고성 메시지를 보낼 수 없습니다.' };
  const p = await plan(env, c); if (p.error) return p; if (!p.list.length) return { error: '보낼 수 있는 회원이 없습니다. 제외된 사유를 확인해 주세요.' };
  const ref = await uniqueRef(env, 'member_campaigns', 'ref', 'MC'), t = now();
  await env.DB.prepare('INSERT INTO member_campaigns (ref, channel, purpose, subject, body, status, total, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(ref, c.channel, c.purpose, str(c.subject, 120) || null, str(c.body, 4000), 'ready', p.list.length, JSON.stringify({ excluded: p.excluded, picked: p.picked, target: c.target && c.target.ids ? { ids: c.target.ids.length } : { filter: (c.target && c.target.filter) || {} } }), t, t).run();
  const camp = await env.DB.prepare('SELECT id FROM member_campaigns WHERE ref = ?').bind(ref).first();
  // 받는 사람은 1,000명씩 한 번에 넣습니다 (요청 한 번에 쓰는 DB 질의 수를 줄임)
  for (let i = 0; i < p.list.length; i += 1000)
    await env.DB.prepare("INSERT INTO member_campaign_targets (campaign_id, member_id, receiver, status, updated_at) SELECT ?, json_extract(value,'$[0]'), json_extract(value,'$[1]'), 'queued', ? FROM json_each(?)")
      .bind(camp.id, t, JSON.stringify(p.list.slice(i, i + 1000).map(m => [m.id, m.to]))).run();
  await log(env, 'member.campaign_created', ref, 'admin', { channel: c.channel, purpose: c.purpose, total: p.list.length });
  return { ok: true, ref, total: p.list.length, excluded: p.excluded };
}

// ---------- 보내기 ----------
async function sendOne(env, cfg, c, m, to) {
  const msg = await compose(env, cfg, c, m);
  if (c.channel === 'email') {
    const headers = msg.unsub ? { 'List-Unsubscribe': `<${msg.unsub}>` } : {};
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: msg.subject, html: msg.html, text: msg.text, headers }), signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (r.status === 200 || r.status === 201) { const j = await r.json().catch(() => ({})); return j && j.id ? { status: 'sent', id: 'email:' + String(j.id).slice(0, 60) } : { status: 'unknown', error: '이메일 접수 결과를 확인해야 합니다.' }; }
    if (r.status >= 400 && r.status < 500) return { status: 'failed', error: '이메일 발송 거절 (' + r.status + ')' };
    return { status: 'unknown', error: '이메일 응답을 확인할 수 없습니다 (' + r.status + ').' };
  }
  try {
    if (c.channel === 'kakao') {
      const r = await aligoProvider(env, 'alimtalk/send', { tpl_code: cfg.kakao_code, receiver_1: to, recvname_1: m.name || '', subject_1: '메가스팟 회원 안내', message_1: msg.kakao,
        button_1: JSON.stringify({ button: MEMBER_TEMPLATE.buttons }), fsubject_1: '메가스팟 안내', fmessage_1: msg.text }, crypto.randomUUID());
      if (r?.code == null || !/^-?\d+$/.test(String(r.code))) return { status: 'unknown', error: '알림톡 접수 결과를 확인해야 합니다.' };
      if (Number(r.code) !== 0) return { status: 'failed', error: '알리고 알림톡 접수 거절 (' + Number(r.code) + ')' };
      return /^\d{1,30}$/.test(String(r.info?.mid || '')) && Number(r.info?.scnt) === 1 ? { status: 'sent', id: 'at:' + r.info.mid } : { status: 'unknown', error: '알림톡 접수 결과를 확인해야 합니다.' };
    }
    const r = await aligoProvider(env, 'member/send', { receiver: to, msg: msg.text }, crypto.randomUUID());
    if (r?.result_code == null || !/^-?\d+$/.test(String(r.result_code))) return { status: 'unknown', error: '문자 접수 결과를 확인해야 합니다.' };
    if (Number(r.result_code) !== 1) return { status: 'failed', error: '알리고 접수 거절 (' + Number(r.result_code) + ')' };
    return /^\d{1,30}$/.test(String(r.msg_id || '')) && Number(r.success_cnt) === 1 ? { status: 'sent', id: 'sms:' + r.msg_id } : { status: 'unknown', error: '문자 접수 결과를 확인해야 합니다.' };
  } catch (e) {
    if (e && e.status === 403) return { status: 'failed', error: '연결 서버가 광고 규칙(수신거부 문구·야간 시간)으로 거절했습니다.' };
    if (e && e.status === 400) return { status: 'failed', error: '연결 서버가 이 메시지를 받지 않았습니다(경로·형식 확인).' };
    return { status: 'unknown', error: '발송 응답을 받지 못했습니다. 다시 보내지 않습니다.' };
  }
}
async function counts(env, id) {
  const { results } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM member_campaign_targets WHERE campaign_id = ? GROUP BY status').bind(id).all();
  const c = Object.fromEntries((results || []).map(r => [r.status, r.n]));
  return { sent: c.sent || 0, failed: c.failed || 0, unknown: (c.unknown || 0) + (c.sending || 0), skipped: c.skipped || 0, left: c.queued || 0 };
}
export async function sendBatch(env, ref) {
  const c = await env.DB.prepare('SELECT * FROM member_campaigns WHERE ref = ?').bind(ref).first(); if (!c) return { error: '보낼 내용을 찾을 수 없습니다.', status: 404 };
  if (c.status === 'stopped' || c.status === 'done') return { ok: true, status: c.status, ...(await counts(env, c.id)) };
  if (c.purpose === 'ad' && c.channel === 'sms' && nightNow()) return { error: '광고성 문자는 밤 9시부터 아침 8시까지 보낼 수 없습니다. 아침 8시 이후에 이어서 보내 주세요.', code: 'NIGHT' };
  const ch = (await channelState(env, { probe: false }))[c.channel]; if (!ch.ready) return { error: ch.reason, code: 'CHANNEL_OFF' };
  await env.DB.prepare("UPDATE member_campaigns SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'ready'").bind(now(), c.id).run();
  const cfg = await msgConfig(env);
  // 이번에 보낼 몫을 한 번에 '보내는 중'으로 잡아 둡니다. 같은 화면을 두 곳에서 열어도 한 사람에게 두 번 가지 않습니다.
  const token = 'claim:' + crypto.randomUUID();
  await env.DB.prepare(`UPDATE member_campaign_targets SET status = 'sending', provider_id = ?, updated_at = ? WHERE campaign_id = ? AND status = 'queued' AND member_id IN (SELECT member_id FROM member_campaign_targets WHERE campaign_id = ? AND status = 'queued' ORDER BY member_id LIMIT ${BATCH})`)
    .bind(token, now(), c.id, c.id).run();
  const { results } = await env.DB.prepare('SELECT t.member_id, t.receiver, m.name, m.agree_marketing, m.status AS member_status FROM member_campaign_targets t LEFT JOIN members m ON m.id = t.member_id WHERE t.campaign_id = ? AND t.provider_id = ? ORDER BY t.member_id').bind(c.id, token).all();
  for (const t of results || []) {
    // 대상을 만든 뒤 수신 동의를 철회했거나 이용이 제한된 회원은 보내기 직전에 뺍니다
    const skip = t.member_status !== 'active' ? '이용 제한된 회원' : c.purpose === 'ad' && !t.agree_marketing ? '보내기 전에 수신 동의를 철회함' : '';
    const r = skip ? { status: 'skipped', error: skip } : await sendOne(env, cfg, c, { id: t.member_id, name: t.name || '회원' }, t.receiver);
    await env.DB.prepare('UPDATE member_campaign_targets SET status = ?, error = ?, provider_id = ?, updated_at = ? WHERE campaign_id = ? AND member_id = ?').bind(r.status, r.error || null, r.id || null, now(), c.id, t.member_id).run();
  }
  const n = await counts(env, c.id), done = n.left === 0;
  await env.DB.prepare(`UPDATE member_campaigns SET sent = ?, failed = ?, unknown = ?, status = ?, updated_at = ?${done ? ', finished_at = ?' : ''} WHERE id = ?`).bind(n.sent, n.failed, n.unknown, done ? 'done' : 'sending', now(), ...(done ? [now()] : []), c.id).run();
  if (done) await log(env, 'member.campaign_done', ref, 'admin', n);
  return { ok: true, status: done ? 'done' : 'sending', total: c.total, ...n };
}
export async function stopCampaign(env, ref) {
  const c = await env.DB.prepare('SELECT id FROM member_campaigns WHERE ref = ?').bind(ref).first(); if (!c) return { error: '보낼 내용을 찾을 수 없습니다.', status: 404 };
  await env.DB.prepare("UPDATE member_campaigns SET status = 'stopped', updated_at = ?, finished_at = ? WHERE id = ? AND status IN ('ready','sending')").bind(now(), now(), c.id).run();
  await log(env, 'member.campaign_stopped', ref, 'admin', {});
  return { ok: true };
}
export async function testSend(env, c) {
  const e = checkInput(c); if (e) return { error: e };
  const ch = (await channelState(env))[c.channel]; if (!ch.ready) return { error: ch.reason, code: 'CHANNEL_OFF' };
  if (c.purpose === 'ad' && c.channel === 'sms' && nightNow()) return { error: '광고성 문자는 밤 9시부터 아침 8시까지 보낼 수 없습니다.', code: 'NIGHT' };
  const to = c.channel === 'email' ? (isEmail(str(c.to, 120)) ? str(c.to, 120).toLowerCase() : '') : phoneOf(c.to); if (!to) return { error: c.channel === 'email' ? '받을 이메일 주소를 확인해 주세요.' : '받을 휴대폰 번호를 확인해 주세요.' };
  const r = await sendOne(env, await msgConfig(env), c, { id: 0, name: str(c.name, 20) || '홍길동' }, to);
  await log(env, 'member.test_send', '', 'admin', { channel: c.channel, purpose: c.purpose, status: r.status });
  return r.status === 'sent' ? { ok: true } : { error: r.error || '보내지 못했습니다.' };
}
export async function campaignList(env) {
  const { results } = await env.DB.prepare('SELECT * FROM member_campaigns ORDER BY id DESC LIMIT 100').all();
  return (results || []).map(c => ({ ref: c.ref, channel: c.channel, channel_label: CHANNELS[c.channel], purpose: c.purpose, purpose_label: c.purpose === 'ad' ? '광고성' : '정보성', subject: c.subject || '', body: c.body,
    status: c.status, status_label: CAMPAIGN_STATUS[c.status] || c.status, total: c.total, sent: c.sent, failed: c.failed, unknown: c.unknown, data: safeJson(c.data) || {}, created_at: c.created_at, finished_at: c.finished_at || '' }));
}
export async function campaignTargets(env, ref) {
  const c = await env.DB.prepare('SELECT id FROM member_campaigns WHERE ref = ?').bind(ref).first(); if (!c) return null;
  const { results } = await env.DB.prepare('SELECT t.member_id, t.receiver, t.status, t.error, t.updated_at, m.name FROM member_campaign_targets t LEFT JOIN members m ON m.id = t.member_id WHERE t.campaign_id = ? ORDER BY CASE t.status WHEN \'failed\' THEN 0 WHEN \'unknown\' THEN 1 WHEN \'sending\' THEN 1 ELSE 2 END, t.member_id LIMIT 2000').bind(c.id).all();
  return (results || []).map(t => ({ ...t, status_label: TARGET_STATUS[t.status] || t.status }));
}
