// 관리자 · 알림 센터 (2026-11-24) — 읽기 전용
//   GET /api/admin/notify-center?from=YYYY-MM-DD&to=YYYY-MM-DD&source=&status=&q=
// 여러 메뉴에 흩어져 있던 카카오톡(알림톡)·문자 발송 기록을 한 화면에서 찾아보고, 실패·확인 필요 건을 모아 봅니다.
// 기록 표는 SELECT 만 합니다. 다시 보내기·설정 바꾸기는 기존 각 메뉴에서 그대로 합니다.
// 연결 상태는 '설정됨/없음'만 알려 주고 열쇠 값은 절대 돌려주지 않습니다.
import { json, err } from './_lib.js';
import { JOURNEY_TEMPLATES } from './_booking_journey_templates.js';
import { DEPOSIT_TEMPLATES, DEPOSIT_TEMPLATE_CODES } from './_deposit_templates.js';
import { PARKING_TEMPLATES } from './_parking_templates.js';
import { HOST_TEMPLATES } from './_hostnotify.js';
import { INVITE_TEMPLATE } from './_invite_kakao.js';
import { CONTRACT_TEMPLATE } from './_contracts.js';
import { MEMBER_TEMPLATE } from './_membercrm.js';
import { FEEDBACK_TEMPLATE } from './_feedback_template.js';

// 발송 기록이 있는 표와 관리자 화면에서 그 기록을 다루는 메뉴(view)
export const SOURCES = [
  { id: 'guide', label: '예약 확정·이용 안내', view: 'guide-messages',
    sql: "SELECT booking_code AS ref, purpose AS kind, status, mode, error, NULL AS receiver, created_at AS at FROM booking_guide_messages" },
  { id: 'deposit', label: '보증금 알림', view: 'deposit-notifications',
    sql: "SELECT booking_code AS ref, kind, status, mode, error, NULL AS receiver, occurred_at AS at FROM deposit_notifications" },
  { id: 'transaction', label: '거래 알림', view: 'transaction-notifications',
    sql: "SELECT COALESCE(booking_code, ref) AS ref, kind || ':' || audience AS kind, status, NULL AS mode, error, receiver, occurred_at AS at FROM transaction_notifications" },
  { id: 'parking', label: '주차권 알림', view: 'parking',
    sql: "SELECT oid AS ref, kind, status, mode, error, NULL AS receiver, occurred_at AS at FROM parking_notifications" },
  { id: 'parking_admin', label: '주차 결제 운영자 문자', view: 'parking',
    sql: "SELECT oid AS ref, 'admin_sms' AS kind, status, mode, error, receiver, occurred_at AS at FROM parking_admin_sms" },
  { id: 'invite', label: '모임 초대장', view: 'invites',
    sql: "SELECT booking_code AS ref, 'invite' AS kind, status, NULL AS mode, error, receiver_mask AS receiver, created_at AS at FROM invite_messages" },
  { id: 'contract', label: '대관 계약서', view: 'contracts',
    sql: "SELECT booking_code AS ref, 'contract' AS kind, status, NULL AS mode, error, receiver_mask AS receiver, created_at AS at FROM contract_messages" },
  { id: 'host', label: '호스트 알림', view: 'hp-notices',
    sql: "SELECT ref, kind, status, NULL AS mode, error, receiver, created_at AS at FROM host_notifications" },
  { id: 'member', label: '회원 안내', view: 'members',
    sql: "SELECT c.ref AS ref, c.channel || ':' || COALESCE(c.purpose, '') AS kind, t.status AS status, NULL AS mode, t.error AS error, t.receiver AS receiver, COALESCE(t.updated_at, c.created_at) AS at FROM member_campaign_targets t JOIN member_campaigns c ON c.id = t.campaign_id" }
];

// 상태를 다섯 갈래로
export function statusClass(status, mode) {
  const s = String(status || '').toLowerCase();
  if (mode === 'test') return 'test';
  if (/^(accepted|delivered|sent|success|done)$/.test(s)) return 'ok';
  if (/^(failed|error|rejected)$/.test(s)) return 'fail';
  if (s === 'unknown') return 'check';
  if (/^(queued|sending|pending|retry)$/.test(s)) return 'wait';
  return 'off';   // held · skipped · cancelled 등 보내지 않은 것
}
export const STATUS_LABEL = { ok: '보냄', fail: '실패', check: '결과 확인 필요', wait: '보내는 중·대기', off: '보내지 않음', test: '시험 발송' };

// 받는 사람은 가운데를 가려서만 보여 줍니다
export function maskReceiver(v) {
  const s = String(v || '').trim(); if (!s) return '';
  if (s.includes('*') || s.includes('•')) return s;
  if (s.includes('@')) { const [a, d] = s.split('@'); return (a.slice(0, 1) || '') + '***@' + d; }
  const d = s.replace(/\D/g, '');
  if (d.length >= 9) return d.slice(0, 3) + '-****-' + d.slice(-4);
  return s.length > 4 ? s.slice(0, 2) + '***' : '***';
}

// 알림 종류 이름 (템플릿 이름이 있으면 그 이름)
const KIND_NAMES = {
  invite: INVITE_TEMPLATE.name, contract: CONTRACT_TEMPLATE.name, admin_sms: '주차 결제 운영자 문자',
  guide: '이용 안내', portal: '예약 안내 링크', reminder: '이용 전 안내', feedback: FEEDBACK_TEMPLATE.name
};
export function kindName(source, kind) {
  const k = String(kind || '');
  if (source === 'guide' || source === 'transaction') { const base = k.split(':')[0]; if (JOURNEY_TEMPLATES[base]) return JOURNEY_TEMPLATES[base].name + (k.includes(':admin') ? ' (운영자)' : ''); }
  if (source === 'deposit' && DEPOSIT_TEMPLATES[k]) return DEPOSIT_TEMPLATES[k].name;
  if (source === 'parking' && PARKING_TEMPLATES[k]) return PARKING_TEMPLATES[k].name;
  if (source === 'host' && HOST_TEMPLATES[k]) return HOST_TEMPLATES[k].name;
  if (source === 'member') { const [ch, purpose] = k.split(':'); return ({ alimtalk: '알림톡', sms: '문자', email: '이메일' }[ch] || ch) + (purpose ? ' · ' + purpose : ''); }
  return KIND_NAMES[k] || k;
}

// 템플릿 게시판 — 코드에 있는 알림톡 원문 (관리자 확인용)
export function templates() {
  const out = [], add = (group, key, t, code) => { if (t && t.content) out.push({ group, key, name: t.name || key, code: t.code || code || '', content: t.content, buttons: (t.buttons || []).map(b => ({ name: b.name, link: b.linkMo || b.linkPc || '' })), sms: !!t.sms }); };
  for (const [k, t] of Object.entries(JOURNEY_TEMPLATES)) add('예약 확정·이용 안내', k, t);
  for (const [k, t] of Object.entries(DEPOSIT_TEMPLATES)) add('보증금', k, t, DEPOSIT_TEMPLATE_CODES[k]);
  for (const [k, t] of Object.entries(PARKING_TEMPLATES)) add('주차권', k, t);
  for (const [k, t] of Object.entries(HOST_TEMPLATES)) add('호스트', k, t);
  add('모임 초대장', 'invite', INVITE_TEMPLATE); add('대관 계약서', 'contract', CONTRACT_TEMPLATE);
  add('회원 안내', 'member', MEMBER_TEMPLATE); add('이용 후 의견', 'feedback', FEEDBACK_TEMPLATE);
  return out;
}

// 연결 상태 — 값은 돌려주지 않고 '있음/없음'만
export function connection(env) {
  const has = k => !!(env && String(env[k] || '').trim());
  const live = String((env && env.ALIGO_LIVE_ENABLED) || '').trim().toLowerCase();
  return [
    { key: 'ALIGO_RELAY_URL', label: '알림톡·문자 중계 서버 주소', ok: has('ALIGO_RELAY_URL') },
    { key: 'ALIGO_RELAY_SECRET', label: '중계 서버 비밀 열쇠', ok: has('ALIGO_RELAY_SECRET') },
    { key: 'ALIGO_SENDER_KEY', label: '카카오 발신 프로필 키', ok: has('ALIGO_SENDER_KEY') },
    { key: 'ALIGO_SENDER', label: '문자 발신 번호', ok: has('ALIGO_SENDER') },
    { key: 'ALIGO_LIVE_ENABLED', label: '실제 발송 켜짐', ok: ['1', 'true', 'on', 'yes'].includes(live) },
    { key: 'RESEND_API_KEY', label: '이메일 발송 열쇠', ok: has('RESEND_API_KEY') },
    { key: 'MAIL_FROM', label: '이메일 보내는 주소', ok: has('MAIL_FROM') }
  ];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const kstToday = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// 한국 날짜 하루의 시작을 UTC 'YYYY-MM-DD HH:MM:SS' 로 (기록 표의 시각은 UTC)
const utcStart = d => new Date(Date.parse(d + 'T00:00:00Z') - 9 * 36e5).toISOString().slice(0, 19).replace('T', ' ');

export async function notifyCenterAdmin({ env, url, method }) {
  if (method !== 'GET') return err('알림 센터는 조회만 할 수 있습니다.', 405, 'METHOD');
  const p = url.searchParams, today = kstToday();
  let to = DAY.test(p.get('to') || '') ? p.get('to') : today, from = DAY.test(p.get('from') || '') ? p.get('from') : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if (Date.parse(to) - Date.parse(from) > 366 * 864e5) from = addDays(to, -366);
  const source = SOURCES.some(s => s.id === p.get('source')) ? p.get('source') : '';
  const status = ['ok', 'fail', 'check', 'wait', 'off', 'test'].includes(p.get('status')) ? p.get('status') : '';
  const q = String(p.get('q') || '').trim().slice(0, 40).toLowerCase(), qDigits = q.replace(/\D/g, '');
  const lo = utcStart(from), hi = utcStart(addDays(to, 1));

  const items = [], summary = {}, missing = [];
  for (const s of SOURCES) {
    summary[s.id] = { label: s.label, view: s.view, total: 0, ok: 0, fail: 0, check: 0, wait: 0, off: 0, test: 0 };
    let rows = [];
    try {
      const r = await env.DB.prepare(`SELECT * FROM (${s.sql}) WHERE replace(substr(at, 1, 19), 'T', ' ') >= ? AND replace(substr(at, 1, 19), 'T', ' ') < ? ORDER BY at DESC LIMIT 500`).bind(lo, hi).all();
      rows = r.results || [];
    } catch { missing.push(s.id); continue; }
    for (const r of rows) {
      const cls = statusClass(r.status, r.mode);
      summary[s.id].total++; summary[s.id][cls]++;
      const receiver = maskReceiver(r.receiver), name = kindName(s.id, r.kind);
      items.push({ source: s.id, source_label: s.label, view: s.view, ref: r.ref || '', kind: r.kind || '', kind_name: name, status: r.status || '', cls, receiver, error: r.error ? String(r.error).slice(0, 300) : '', at: String(r.at || '').replace('T', ' ').slice(0, 19) });
    }
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const hit = x => !q || [x.ref, x.kind, x.kind_name, x.source_label, x.error].some(v => String(v).toLowerCase().includes(q)) || (qDigits.length >= 4 && x.receiver.replace(/\D/g, '').endsWith(qDigits.slice(-4)));
  const filtered = items.filter(x => (!source || x.source === source) && (!status || x.cls === status) && hit(x));
  const problems = items.filter(x => x.cls === 'fail' || x.cls === 'check').slice(0, 30);
  return json({ ok: true, from, to, source, status, q, total: filtered.length, items: filtered.slice(0, 300), summary, problems, missing,
    connection: connection(env), templates: templates(), labels: STATUS_LABEL }, 200, { 'cache-control': 'no-store' });
}
