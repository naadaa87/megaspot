// 공간대관 계약서 (2026-11-24)
//  · 관리자가 예약·문의 정보를 불러와 계약서를 채우고, 대관자에게 링크(/contract/#id=&k=)를 보냅니다.
//  · 대관자는 링크에서 대관자 정보를 확인·입력하고 동의한 뒤 서명합니다. 서명하면 내용이 잠기고 PDF로 내려받을 수 있습니다.
//  · 링크 열쇠는 계약 번호와 링크 차수로 만든 서명값이라 저장하지 않습니다. '링크 다시 만들기'를 하면 예전 링크는 열리지 않습니다.
//  · 서명 기록: 서명 그림, 서명한 사람, 서명 시각, 접속 IP·브라우저, 서명 시점 계약 내용의 SHA-256(문서 확인값)
//  · 보관: 서명한 계약은 이용일로부터 5년, 서명 전·취소한 계약은 이용일로부터 1년 뒤 지웁니다.
import { str, num, isDate, now, kstToday, sha256 } from './_lib.js';
import { hmacToken, tokenEq } from './_confirm.js';
import { line, text, hhmm, shiftDate } from './_invites.js';
import { makeKakao } from './_custom_alimtalk.js';
import CD from '../../assets/js/kit/contract-doc.js';

export const CONTRACT_SETTINGS = 'rental_contract';
const SEAL_KEY = 'rental_contract:seal';
export const STATUS = { ready: '서명 대기', signed: '서명 완료', void: '취소' };
const ID_RE = /^RC-\d{4}-[A-Z2-9]{4}$/;
export const validId = id => ID_RE.test(String(id || ''));

// ---------- 링크 ----------
export const linkKey = (env, id, ver) => hmacToken(env, 'contract:' + id + ':' + (ver || 1));
export async function keyOk(env, row, k) { if (!row || !k) return false; const want = await linkKey(env, row.id, row.link_ver); return !!want && tokenEq(String(k), want); }
export async function linkOf(env, row) { return '/contract/#id=' + row.id + '&k=' + await linkKey(env, row.id, row.link_ver); }

// ---------- 설정 (운영자 정보·입금 계좌·도장) ----------
const parse = raw => { try { const o = JSON.parse(raw || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
async function getSetting(env, key) { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first(); return r ? r.value : null; }
const putSetting = (env, key, value) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, now()).run();
function cleanOperator(o) {
  o = o || {}; const d = CD.OPERATOR;
  return { name: line(o.name, 60) || d.name, company: line(o.company, 40) || d.company, rep: line(o.rep, 40) || d.rep, rep_name: line(o.rep_name, 20) || d.rep_name,
    bizno: line(o.bizno, 20) || d.bizno, address: line(o.address, 120) || d.address, phone: line(o.phone, 20) || d.phone, email: line(o.email, 80) || d.email };
}
function cleanBank(b) { b = b || {}; return { bank: line(b.bank, 20) || CD.BANK.bank, number: line(b.number, 30) || CD.BANK.number, holder: line(b.holder, 40) || CD.BANK.holder }; }
export async function contractSettings(env) {
  const s = parse(await getSetting(env, CONTRACT_SETTINGS));
  return { operator: cleanOperator(s.operator), bank: cleanBank(s.bank), balance_days: clampInt(s.balance_days, 0, 90, 15), methods: subset(s.methods, CD.METHODS) };
}
export async function saveSettings(env, d) {
  const next = { operator: cleanOperator(d.operator), bank: cleanBank(d.bank), balance_days: clampInt(d.balance_days, 0, 90, 15), methods: subset(d.methods, CD.METHODS) };
  await putSetting(env, CONTRACT_SETTINGS, JSON.stringify(next)); return next;
}
export async function sealImage(env) { const v = await getSetting(env, SEAL_KEY); return /^data:image\/png;base64,/.test(v || '') ? v : ''; }
export async function saveSeal(env, img) {
  if (!img) { await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(SEAL_KEY).run(); return { ok: true }; }
  const bad = pngError(img, 180000); if (bad) return { error: bad };
  await putSetting(env, SEAL_KEY, img); return { ok: true };
}
// PNG data URL 확인 (서명·도장 그림)
export function pngError(img, max) {
  const s = String(img || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(s)) return '서명 그림을 다시 그려 주세요.';
  if (s.length > max) return '서명 그림이 너무 큽니다. 지우고 다시 그려 주세요.';
  try { const b = atob(s.slice(22, 22 + 16)); if (b.charCodeAt(1) !== 0x50 || b.charCodeAt(2) !== 0x4E || b.charCodeAt(3) !== 0x47) return '서명 그림을 다시 그려 주세요.'; } catch { return '서명 그림을 다시 그려 주세요.'; }
  return '';
}

// ---------- 계약 내용 정리 ----------
function clampInt(v, lo, hi, d) { const x = num(v); return x == null ? d : Math.max(lo, Math.min(hi, x)); }
const money = v => { const x = Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, ''))); return Number.isFinite(x) && x > 0 ? Math.min(x, 9e9) : 0; };
function subset(v, list) { const ids = list.map(x => x[0]); return [...new Set((Array.isArray(v) ? v : []).filter(x => ids.includes(x)))]; }
export function cleanRenter(r) {
  r = r || {};
  return { name: line(r.name, 60), rep: line(r.rep, 40), bizno: line(r.bizno, 20), address: line(r.address, 120), phone: line(r.phone, 20), email: line(r.email, 80) };
}
export function cleanContract(d) {
  d = d && typeof d === 'object' ? d : {}; const f = d.fee && typeof d.fee === 'object' ? d.fee : {};
  return {
    renter: cleanRenter(d.renter),
    space: Object.prototype.hasOwnProperty.call(CD.SPACES, d.space) ? d.space : '',
    date: isDate(str(d.date, 10)) ? str(d.date, 10) : '', start: hhmm(d.start), end: hhmm(d.end),
    event: line(d.event, 80), headcount: clampInt(d.headcount, 0, 5000, 0), booking_code: line(d.booking_code, 20).toUpperCase(),
    fee: {
      space: money(f.space), type: f.type === 'package' ? 'package' : 'hourly', pkg: line(f.pkg, 40),
      base_people: clampInt(f.base_people, 0, 5000, 0), extra_people: clampInt(f.extra_people, 0, 5000, 0),
      options_amount: money(f.options_amount), options: subset(f.options, CD.OPTIONS), options_etc: line(f.options_etc, 40),
      discount: money(f.discount), deposit: money(f.deposit), deposit_date: isDate(str(f.deposit_date, 10)) ? str(f.deposit_date, 10) : '',
      balance_days: clampInt(f.balance_days, 0, 90, 0), security: f.security == null || f.security === '' ? CD.SECURITY : money(f.security),
      methods: subset(f.methods, CD.METHODS), bank: cleanBank(f.bank)
    },
    special: text(d.special, 1000, 30)
  };
}
export function contractError(c) {
  if (!c.renter.name) return '대관자 상호·성명을 적어 주세요.';
  if (!c.space) return '대관 공간을 골라 주세요.';
  if (!c.date) return '이용일을 적어 주세요.';
  if (!c.start || !c.end) return '이용 시간을 적어 주세요.';
  return '';
}

// ---------- 예약·문의에서 불러오기 ----------
const hh = h => { h = Number(h); if (!Number.isFinite(h)) return ''; const x = ((h % 24) + 24) % 24; return String(Math.floor(x)).padStart(2, '0') + ':' + String(Math.round((x % 1) * 60)).padStart(2, '0'); };
const fmtPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : String(p || ''); };
const OPTION_MAP = { manager: 'manager', cleaning: 'cleaning', disposable: 'disposable', banner: 'banner', xbanner: 'banner' };
function optionsFrom(inq, doc) {
  const out = new Set();
  for (const [k, v] of Object.entries((inq && inq.options) || {})) if (v && OPTION_MAP[k]) out.add(OPTION_MAP[k]);
  if ((inq && (inq.catering || inq.reception || inq.cocktail)) || (doc && ((doc.food_services || []).length || doc.reception))) out.add('catering');
  return [...out];
}
export function prefillFrom({ booking: b, inquiry: q, settings }) {
  const inq = q ? parse(q.data) : {}, doc = b && b.confirm_doc ? parse(b.confirm_doc) : null;
  let date = (b && b.date) || inq.date || (q && q.event_date) || '';
  let s = b ? b.start_h : inq.start_h, e = b ? b.end_h : inq.end_h;
  s = s == null || s === '' ? null : Number(s); e = e == null || e === '' ? null : Number(e);
  if (s != null && s >= 24 && isDate(date)) { date = shiftDate(date, 1); s -= 24; if (e != null) e -= 24; }
  const start = s != null ? hh(s) : hhmm(inq.t_start), end = e != null ? hh(e) : hhmm(inq.t_end);
  const name = (b && b.customer_name) || inq.name || (q && q.name) || '', org = line(inq.org, 60);
  const total = doc && doc.amount != null ? doc.amount : b && b.amount != null ? b.amount : inq.total || 0;
  return {
    renter: { name: org || name, rep: name, bizno: '', address: '', phone: fmtPhone((b && b.phone) || (q && q.phone) || inq.phone || ''), email: line((q && q.email) || inq.email || '', 80) },
    space: Object.prototype.hasOwnProperty.call(CD.SPACES, b ? b.space_id : (q && q.space_id)) ? (b ? b.space_id : q.space_id) : '',
    date: isDate(date) ? date : '', start, end,
    event: line((doc && doc.event) || inq.theme || '', 80), purpose: line(inq.purpose, 20),
    headcount: (b && b.headcount) || inq.headcount || (q && q.headcount) || 0,
    booking_code: (b && b.booking_code) || '',
    fee: { space: money(total), type: inq.pkg ? 'package' : 'hourly', pkg: '', base_people: 0, extra_people: 0, options_amount: 0, options: optionsFrom(inq, doc), options_etc: '',
      discount: 0, deposit: doc && doc.paid ? money(doc.paid) : 0, deposit_date: '', balance_days: settings.balance_days, security: CD.SECURITY, methods: settings.methods, bank: settings.bank },
    special: ''
  };
}

// ---------- 화면에 보내는 값 ----------
export function publicContract(row, opts = {}) {
  const data = parse(row.data), renter = row.renter ? parse(row.renter) : data.renter || {};
  return { id: row.id, status: row.status, status_label: STATUS[row.status] || row.status, terms_version: row.terms_version || CD.TERMS_VERSION,
    data: { ...data, id: row.id, renter }, totals: CD.totals(data.fee),
    signed: row.status === 'signed' ? { at: kstTime(row.signed_at), signer: row.signer || '', hash: row.doc_hash || '' } : null,
    signature: row.status === 'signed' && !opts.noSignature ? row.signature || '' : '', viewed_at: row.viewed_at || null, sent_at: row.sent_at || null, created_at: row.created_at, updated_at: row.updated_at };
}
export function kstTime(ts) { const t = Date.parse(String(ts || '').replace(' ', 'T') + 'Z'); return Number.isFinite(t) ? new Date(t + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : ''; }
// 서명 시점의 계약 내용을 고정하는 확인값
export async function docHash(row, renter, signer, signedAt, signature) {
  const termsHash = await sha256(JSON.stringify([CD.TERMS_VERSION, CD.INTRO, CD.CLAUSES, CD.REFUND, CD.SIGN_TEXT]));
  return sha256(JSON.stringify({ id: row.id, terms: termsHash, data: parse(row.data), renter, signer, signed_at: signedAt, signature: await sha256(signature) }));
}

// 보관 기간이 지난 계약서를 지웁니다 (서명 완료 5년 · 서명 전·취소 1년, 이용일 기준)
export async function purgeContracts(env, today = kstToday()) {
  const y1 = shiftDate(today, -365), y5 = shiftDate(today, -365 * 5 - 1);
  await env.DB.prepare("DELETE FROM contract_messages WHERE contract_id IN (SELECT id FROM rental_contracts WHERE (status <> 'signed' AND event_date < ?) OR (status = 'signed' AND event_date < ?))").bind(y1, y5).run();
  await env.DB.prepare("DELETE FROM rental_contracts WHERE (status <> 'signed' AND event_date < ?) OR (status = 'signed' AND event_date < ?)").bind(y1, y5).run();
}

// ---------- 카카오톡(알림톡) ----------
const LINK = 'https://megaspot.kr/contract/#id=#{계약번호}&k=#{확인키}';
export const CONTRACT_TEMPLATE = {
  name: '메가스팟_공간대관계약서_v1',
  content: `[메가스팟 공간대관 계약서]

#{고객명}님, 메가스팟 공간대관 계약서를 보내드립니다.

예약 공간: #{공간명}
이용 날짜: #{이용일}
계약 번호: #{계약번호}

아래 '계약서 확인·서명'에서 내용을 확인하고 대관자 정보 입력과 서명을 마쳐 주세요.
서명을 마치면 같은 화면에서 계약서 PDF를 내려받을 수 있습니다.`,
  buttons: [{ name: '계약서 확인·서명', linkType: 'WL', linkMo: LINK, linkPc: LINK }]
};
export const CONTRACT_SUBJECT = '메가스팟 공간대관 계약서';
export const contractKakao = makeKakao({ key: 'contract_alimtalk', tag: 'contract-alimtalk-v1', template: CONTRACT_TEMPLATE, subject: CONTRACT_SUBJECT, table: 'contract_messages', idCol: 'contract_id', noun: '계약서', hashTag: 'contract-receiver:' });
export function contractVars(row, data, key) {
  const c = data || parse(row.data), r = c.renter || {};
  return { 고객명: line(r.rep || r.name, 20) || '대관자', 공간명: CD.SPACES[c.space] || '메가스팟', 이용일: CD.dateText(c.date) || '협의', 계약번호: row.id, 확인키: key };
}
export function sampleContractVars() { return { 고객명: '운영자 시험', 공간명: '메가스팟 건대 1호점', 이용일: CD.dateText(kstToday(14)), 계약번호: 'RC-0000-SAMP', 확인키: 'sample' }; }

// ---------- 이메일 (Resend) ----------
export const emailReady = env => !!(env.RESEND_API_KEY && /@/.test(env.MAIL_FROM || ''));
export function contractEmail(row, data, url) {
  const c = data, r = c.renter || {}, who = r.rep || r.name || '대관자';
  const subject = '[메가스팟] 공간대관 계약서 확인·서명 안내 (' + row.id + ')';
  const lines = [who + '님, 메가스팟 공간대관 계약서를 보내드립니다.', '', '예약 공간: ' + (CD.SPACES[c.space] || '메가스팟'), '이용 날짜: ' + (CD.dateText(c.date) || '협의'), '계약 번호: ' + row.id, '',
    '아래 링크에서 내용을 확인하고 대관자 정보 입력과 서명을 마쳐 주세요. 서명을 마치면 같은 화면에서 계약서 PDF를 내려받을 수 있습니다.', url, '', '문의: 메가스팟 카카오톡 https://pf.kakao.com/_LnxbmX/chat · 010-2384-9580'];
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const html = '<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;font-size:15px;line-height:1.7;color:#1E2225;max-width:560px">' +
    '<p style="font-weight:800;color:#1F53D5;letter-spacing:.1em;margin:0 0 12px">MEGASPOT</p>' + lines.slice(0, 7).map(l => l ? '<p style="margin:0">' + esc(l) + '</p>' : '<p style="margin:0">&nbsp;</p>').join('') +
    '<p style="margin:16px 0">' + esc(lines[7]) + '</p><p style="margin:20px 0"><a href="' + esc(url) + '" style="display:inline-block;background:#1F53D5;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">계약서 확인·서명</a></p>' +
    '<p style="margin:0;color:#5B6168;font-size:13px">' + esc(lines[10]) + '</p></div>';
  return { subject, text: lines.join('\n'), html };
}
export async function sendEmail(env, to, mail) {
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: mail.subject, html: mail.html, text: mail.text }), signal: AbortSignal.timeout(10000), redirect: 'manual' });
  if (r.status === 200 || r.status === 201) return { status: 'accepted' };
  if (r.status >= 400 && r.status < 500) return { status: 'failed', error: '이메일 발송 거절 (' + r.status + ')' };
  return { status: 'unknown', error: '이메일 응답을 확인할 수 없습니다 (' + r.status + ').' };
}
