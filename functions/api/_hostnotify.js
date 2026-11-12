// 호스트 알림 — 새 문의 · 견적 수락 · 입금 알림 · 취소 · 고객 메시지 · 심사 결과 · 이용료 결제/환불 · 무료 등록 종료 안내 (2026-11-12)
//  · 받는 번호: 호스트센터 계정의 '알림 받을 휴대폰'. 계정에서 알림을 끄면 보내지 않습니다.
//  · 보내는 길: 알리고 고정 IP 연결 서버(deploy/aligo-relay/server.mjs).
//      ① 관리자 '호스트 알림 기록'에 알림톡 템플릿 코드를 넣고 '승인 확인'을 통과한 종류 → 카카오 알림톡(실패하면 알리고가 문자로 대신 보냄)
//      ② 그 밖에는 문자(LMS, 연결 서버 경로 host/send)
//    연결 서버가 아직 받지 않거나 ALIGO_LIVE_ENABLED 가 꺼져 있으면 기록만 남고, 48시간 안에 길이 열리면 한 번 더 보냅니다.
//  · 같은 일은 한 번만 보냅니다(event_key). 응답이 불분명한 건은 다시 보내지 않습니다.
//  · 알림에는 고객 이름·연락처를 넣지 않습니다. 호스트센터에서 로그인한 뒤 확인합니다.
import { now, str, sha256 } from './_lib.js';
import { safeJson } from './_platform.js';
import { aligoProvider, guidePhone } from './_guide_messages.js';

const RELAY = 'https://relay.naranhistory.com/megaspot/aligo';
const CENTER = 'https://megaspot.kr/host/center/';
const DAILY_LIMIT = 60;          // 호스트 한 명에게 하루에 보내는 알림 상한
const MESSAGE_GAP_MIN = 60;      // 같은 예약의 고객 메시지 알림은 한 시간에 한 번
const RETRY_HOURS = 48;          // 발송 길이 막혀 있던 알림은 이 시간 안에 길이 열리면 다시 보냅니다
const SUBJECT = '메가스팟 호스트 알림';
export const HOST_NOTICE_HEAD = '[메가스팟 호스트 알림]';
export const HOST_NOTICE_KINDS = { inquiry: '새 문의', accepted: '견적 수락', paid_notice: '입금 알림', cancel: '취소', message: '고객 메시지', review: '심사 결과', billing: '이용료', renewal: '등록 연장 안내' };
export const HOST_NOTICE_STATUS = { queued: '대기', sending: '보내는 중', accepted: '발송', failed: '실패', unknown: '확인 필요', held: '발송 꺼짐', skipped: '건너뜀' };
// 알림톡 버튼 (모든 호스트 알림 공통)
export const HOST_BUTTONS = [{ name: '호스트센터 열기', linkType: 'WL', linkTypeName: '웹링크', linkMo: CENTER, linkPc: CENTER }];

// 알림 원문. 알림톡 템플릿과 문자 본문이 같은 글을 씁니다(문자는 맨 아래에 호스트센터 주소를 붙입니다).
// 알리고에 템플릿을 등록할 때는 config/host-alimtalk.templates.json 의 본문(아래와 같은 글)을 그대로 씁니다.
const T = (name, ...lines) => ({ name, content: [HOST_NOTICE_HEAD, ...lines].join('\n') });
export const HOST_TEMPLATES = {
  inquiry: T('메가스팟_호스트_새문의_v1', '‘#{공간명}’ 공간에 새 문의가 들어왔습니다.', '이용일 #{이용일}', '예약번호 #{예약번호}', '호스트센터에서 내용을 확인하고 답해 주세요.'),
  accepted: T('메가스팟_호스트_견적수락_v1', '‘#{공간명}’ 고객이 견적을 수락했습니다.', '이용일 #{이용일}', '예약번호 #{예약번호}', '결제가 확인되면 호스트센터에서 예약을 확정해 주세요.'),
  paid_notice: T('메가스팟_호스트_입금알림_v1', '‘#{공간명}’ 고객이 입금(결제)했다고 알려 왔습니다.', '이용일 #{이용일}', '예약번호 #{예약번호}', '입금을 확인한 뒤 호스트센터에서 예약을 확정해 주세요.'),
  cancel: T('메가스팟_호스트_요청취소_v1', '‘#{공간명}’ 고객이 예약 요청을 취소했습니다.', '이용일 #{이용일}', '예약번호 #{예약번호}'),
  cancel_request: T('메가스팟_호스트_취소요청_v1', '‘#{공간명}’ 고객이 확정된 예약의 취소를 요청했습니다.', '이용일 #{이용일}', '예약번호 #{예약번호}', '환불 규정을 확인하고 호스트센터에서 처리해 주세요.'),
  message: T('메가스팟_호스트_고객메시지_v1', '‘#{공간명}’ 고객이 메시지를 남겼습니다.', '이용일 #{이용일}', '예약번호 #{예약번호}', '호스트센터에서 확인하고 답해 주세요.'),
  review_live: T('메가스팟_호스트_심사공개_v2', '‘#{공간명}’ 공간 심사가 끝나 검색에 공개되었습니다.', '등록 기간: #{등록종료일}까지', '문의가 들어오면 이 번호로 알려 드립니다.'),
  review_fix: T('메가스팟_호스트_심사보완_v1', '‘#{공간명}’ 공간에 보완 요청이 있습니다.', '호스트센터에서 내용을 확인하고 고친 뒤 다시 심사를 요청해 주세요.'),
  review_rejected: T('메가스팟_호스트_심사반려_v1', '‘#{공간명}’ 공간 등록이 반려되었습니다.', '사유는 호스트센터에서 확인할 수 있습니다.'),
  billing_paid: T('메가스팟_호스트_이용료결제_v1', '‘#{공간명}’ 이용료 결제가 확인되었습니다.', '등록 기간 #{시작일} ~ #{종료일} (#{개월}개월)', '결제 금액 #{금액}원 (부가세 포함)'),
  billing_refund: T('메가스팟_호스트_해지환불_v1', '‘#{공간명}’ 등록 해지와 환불 처리가 끝났습니다.', '환불 금액 #{금액}원', '카드 취소나 입금이 반영되는 시점은 결제수단에 따라 며칠 걸릴 수 있습니다.'),
  renew_d30: T('메가스팟_호스트_무료종료30일전_v1', '‘#{공간명}’ 무료 등록 기간이 #{종료일}에 끝납니다. (#{남은일수}일 남음)', '기간이 끝나기 전에 호스트센터 이용료 메뉴에서 등록 기간을 결제하면, 무료 기간이 끝난 다음 날부터 끊기지 않고 이어집니다.'),
  renew_d7: T('메가스팟_호스트_무료종료7일전_v1', '‘#{공간명}’ 무료 등록 기간이 #{종료일}에 끝납니다. (#{남은일수}일 남음)', '기간이 끝나면 공간이 검색과 상세 화면에서 내려가 새 문의를 받을 수 없습니다.', '계속 운영하려면 호스트센터 이용료 메뉴에서 등록 기간을 결제해 주세요.')
};

const DOW = '일월화수목금토';
const changed = r => Number(r?.meta?.changes ?? r?.changes ?? 0);
const won = n => Number(n || 0).toLocaleString('ko-KR');
function kday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
  return `${+m[2]}월 ${+m[3]}일(${DOW[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]})`;
}
function kdayFull(iso) { const m = /^(\d{4})-/.exec(iso || ''); return m ? `${m[1]}년 ${kday(iso)}` : ''; }
function when(v) { return [v.date ? kday(v.date) : '날짜 미정', v.start && v.end ? v.start + '~' + v.end : (v.start || ''), v.people ? v.people + '명' : ''].filter(Boolean).join(' · '); }
const hashOk = h => /^#[A-Za-z0-9=-]{1,40}$/.test(h) ? h : '';

// 알림 종류 + 내용 → 템플릿 · 변수 · 호스트센터 위치
export function hostNoticeParts(kind, v = {}) {
  const space = str(v.space, 40).replace(/[\r\n]+/g, ' '), booking = { 공간명: space, 이용일: when(v), 예약번호: str(v.code, 20) };
  let key = '', vars = { 공간명: space }, hash = v.code ? '#b=' + v.code : '';
  if (['inquiry', 'accepted', 'paid_notice', 'message'].includes(kind)) { key = kind; vars = booking; }
  else if (kind === 'cancel') { key = v.requested ? 'cancel_request' : 'cancel'; vars = booking; }
  else if (kind === 'review') { key = { live: 'review_live', fix: 'review_fix', rejected: 'review_rejected' }[v.result] || ''; hash = v.result === 'fix' && v.ref ? '#space=' + v.ref : '#home'; vars.등록종료일 = kdayFull(v.until); }
  else if (kind === 'billing') { key = { paid: 'billing_paid', refund: 'billing_refund' }[v.result] || ''; hash = '#billing'; Object.assign(vars, { 시작일: str(v.from, 10), 종료일: str(v.to, 10), 개월: String(v.months || ''), 금액: won(v.amount) }); }
  else if (kind === 'renewal') { key = { d30: 'renew_d30', d7: 'renew_d7' }[v.stage] || ''; hash = '#billing'; Object.assign(vars, { 종료일: kdayFull(v.end), 남은일수: String(Math.max(0, +v.left || 0)) }); }
  const t = HOST_TEMPLATES[key]; if (!t) return null;
  let missing = false;
  const content = t.content.replace(/#\{([^}]+)\}/g, (_, k) => { const x = vars[k]; if (x === undefined || x === null || x === '') missing = true; return x ?? ''; });
  if (missing || !space) return null;
  return { key, content, sms: content + '\n' + CENTER + hashOk(hash) };
}
// 문자 본문. 첫 줄과 마지막 줄(호스트센터 주소)은 연결 서버가 그대로 검사합니다.
export function hostNoticeText(kind, v = {}) { const p = hostNoticeParts(kind, v); return p ? p.sms : ''; }
// 저장된 문자 본문에서 템플릿과 알림톡 본문을 되찾습니다 (다시 보낼 때)
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = Object.entries(HOST_TEMPLATES).map(([key, t]) => [key, new RegExp('^' + t.content.split(/#\{[^}]+\}/).map(esc).join('[^\\n]+') + '$')]);
export function hostNoticeFromSms(msg) {
  const lines = String(msg || '').split('\n'); if (lines.length < 2 || !lines[lines.length - 1].startsWith(CENTER)) return null;
  const content = lines.slice(0, -1).join('\n'), hit = PATTERNS.find(([, re]) => re.test(content));
  return hit ? { key: hit[0], content, sms: msg } : null;
}

export function hostNoticeLive(env) { return env.ALIGO_LIVE_ENABLED === 'true' && env.ALIGO_RELAY_URL === RELAY && String(env.ALIGO_RELAY_SECRET || '').length >= 32; }

// ---------- 알림톡 템플릿 코드 (관리자 화면에서 넣고 '승인 확인') ----------
const CFG_KEY = 'host_alimtalk';
async function setting(env, key) { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first(); return r ? r.value : null; }
async function putSetting(env, key, value) {
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, now()).run();
}
export async function hostAlimtalkCodes(env) { const c = safeJson(await setting(env, CFG_KEY)); return c && typeof c.codes === 'object' && c.codes ? c.codes : {}; }
async function signature(env, key, code) { return sha256(JSON.stringify(['host-alimtalk-v1', env.ALIGO_SENDER_KEY || '', key, code, HOST_TEMPLATES[key].content, HOST_BUTTONS])); }
// 승인 확인을 통과했고 그 뒤 본문·코드가 바뀌지 않은 템플릿만 씁니다
async function readyTemplate(env, key) {
  const code = (await hostAlimtalkCodes(env))[key]; if (!code) return null;
  return (await setting(env, 'host_alimtalk_ready:' + key)) === await signature(env, key, code) ? code : null;
}
export async function saveHostAlimtalkCodes(env, codes) {
  const clean = {};
  for (const k of Object.keys(HOST_TEMPLATES)) { const c = str(codes && codes[k], 30); if (c) { if (!/^[A-Za-z0-9_-]{2,30}$/.test(c)) return { error: '템플릿 코드는 영문·숫자로 적어 주세요. (예: UN_1234)' }; clean[k] = c; } }
  await putSetting(env, CFG_KEY, JSON.stringify({ codes: clean }));
  return { ok: true, codes: clean };
}
const normalized = s => String(s || '').replace(/\r\n/g, '\n');
// 알리고에 등록된 템플릿이 승인됐고 본문·버튼이 이 코드와 같은지 확인합니다
export async function checkHostAlimtalk(env) {
  const codes = await hostAlimtalkCodes(env), out = [];
  for (const [key, t] of Object.entries(HOST_TEMPLATES)) {
    const code = codes[key]; if (!code) { out.push({ key, name: t.name, code: '', review: '', ready: false }); continue; }
    let item = { key, name: t.name, code, review: 'unavailable', matches: false, ready: false };
    try {
      const r = await aligoProvider(env, 'template/list', { tpl_code: code });
      const tp = Number(r?.code) === 0 ? (r.list || []).find(x => x.templtCode === code) : null;
      const b = tp ? (tp.buttons || []) : [];
      const matches = !!tp && normalized(tp.templtContent) === t.content && b.length === HOST_BUTTONS.length
        && HOST_BUTTONS.every((x, i) => x.name === b[i].name && x.linkType === b[i].linkType && x.linkMo === (b[i].linkMo || b[i].linkM) && x.linkPc === (b[i].linkPc || b[i].linkP));
      item = { ...item, review: tp ? tp.inspStatus || '' : 'missing', matches, ready: matches && tp.inspStatus === 'APR' && ['A', 'R'].includes(tp.status) };
    } catch { /* 연결 서버가 이 코드를 아직 허용하지 않거나 응답이 없음 */ }
    if (item.ready) await putSetting(env, 'host_alimtalk_ready:' + key, await signature(env, key, code));
    else await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind('host_alimtalk_ready:' + key).run();
    out.push(item);
  }
  return out;
}
export async function hostAlimtalkStatus(env) {
  const codes = await hostAlimtalkCodes(env), out = [];
  for (const [key, t] of Object.entries(HOST_TEMPLATES)) out.push({ key, name: t.name, content: t.content, code: codes[key] || '', ready: !!(await readyTemplate(env, key)) });
  return { live: hostNoticeLive(env), buttons: HOST_BUTTONS, items: out };
}

// ---------- 보내기 ----------
function state(env, id, status, error = '', mid = null) {
  return env.DB.prepare('UPDATE host_notifications SET status = ?, error = ?, provider_mid = COALESCE(?, provider_mid), updated_at = ? WHERE id = ?').bind(status, str(error, 200), mid, now(), id).run();
}
const PATH_CLOSED = '발송 서버가 이 알림을 아직 받지 않습니다. 연결 서버에 호스트 알림 경로(host/send)를 적용해 주세요.';
async function sendSms(env, row, requestId) {
  try {
    const r = await aligoProvider(env, 'host/send', { receiver: row.receiver, msg: row.msg }, requestId);
    if (r?.result_code == null || !/^-?\d+$/.test(String(r.result_code))) return state(env, row.id, 'unknown', '문자 접수 결과를 확인해야 합니다.');
    if (Number(r.result_code) !== 1) return state(env, row.id, 'failed', '알리고 접수 거절 (' + Number(r.result_code) + ')');
    if (!/^\d{1,30}$/.test(String(r.msg_id || '')) || Number(r.success_cnt) !== 1 || Number(r.error_cnt) !== 0) return state(env, row.id, 'unknown', '문자 접수 결과를 확인해야 합니다.');
    return state(env, row.id, 'accepted', '', String(r.msg_id));
  } catch (e) {
    if (e && e.status === 400) return state(env, row.id, 'failed', PATH_CLOSED);
    if (e && [401, 403].includes(e.status)) return state(env, row.id, 'failed', '발송 서버가 요청을 거절했습니다 (' + e.status + ').');
    return state(env, row.id, 'unknown', '발송 응답을 받지 못했습니다. 다시 보내지 않습니다.');
  }
}
async function dispatch(env, row, parts) {
  if (!hostNoticeLive(env)) return state(env, row.id, 'held', '문자·알림톡 발송 설정이 꺼져 있습니다.');
  const claim = await env.DB.prepare("UPDATE host_notifications SET status = 'sending', request_id = ?, updated_at = ? WHERE id = ? AND status = 'queued'").bind(crypto.randomUUID(), now(), row.id).run();
  if (!changed(claim)) return;
  const code = parts && await readyTemplate(env, parts.key);
  if (code) {
    try {
      const r = await aligoProvider(env, 'alimtalk/send', { tpl_code: code, receiver_1: row.receiver, subject_1: SUBJECT, message_1: parts.content, button_1: JSON.stringify({ button: HOST_BUTTONS }),
        fsubject_1: SUBJECT, fmessage_1: row.msg }, crypto.randomUUID());
      if (r?.code == null || !/^-?\d+$/.test(String(r.code))) return state(env, row.id, 'unknown', '알림톡 접수 결과를 확인해야 합니다.');
      if (Number(r.code) !== 0) return state(env, row.id, 'failed', '알리고 알림톡 접수 거절 (' + Number(r.code) + ')');
      if (!/^\d{1,30}$/.test(String(r.info?.mid || '')) || Number(r.info?.scnt) !== 1 || Number(r.info?.fcnt || 0) !== 0) return state(env, row.id, 'unknown', '알림톡 접수 결과를 확인해야 합니다.');
      return state(env, row.id, 'accepted', '', 'at:' + code + ':' + r.info.mid);
    } catch (e) {
      // 연결 서버가 요청을 검사 단계에서 거절한 경우(코드 미허용 등)에는 아무것도 나가지 않았으므로 문자로 보냅니다
      if (!(e && [400, 403].includes(e.status))) return state(env, row.id, 'unknown', '알림톡 응답을 받지 못했습니다. 다시 보내지 않습니다.');
    }
  }
  return sendSms(env, row, crypto.randomUUID());
}

// 호스트에게 알림 한 건. key 는 같은 예약에서 여러 번 생길 수 있는 일을 구분합니다(견적 번호 등).
// 실패해도 예약·결제 처리에는 영향을 주지 않습니다.
export async function notifyHost(env, hostId, kind, v = {}, key = '') {
  try {
    if (!HOST_NOTICE_KINDS[kind]) return null;
    const host = await env.DB.prepare('SELECT id, phone, settings, status FROM hosts WHERE id = ?').bind(hostId).first();
    if (!host || host.status !== 'active') return null;
    const st = safeJson(host.settings); if (st.notify_on === false) return null;
    const receiver = guidePhone(st.notify_phone) || guidePhone(host.phone); if (!receiver) return null;
    const parts = hostNoticeParts(kind, v); if (!parts || parts.sms.length > 600) return null;
    const ref = str(v.code || v.ref || '', 40), t = now();
    if (kind === 'message') {   // 메시지가 이어질 때 알림이 쏟아지지 않게
      const last = await env.DB.prepare("SELECT 1 AS x FROM host_notifications WHERE host_id = ? AND kind = 'message' AND ref = ? AND created_at > datetime('now', ?)").bind(host.id, ref, `-${MESSAGE_GAP_MIN} minutes`).first();
      if (last) return null;
    }
    const eventKey = [kind, ref, str(key, 60) || (kind === 'message' ? t : '')].join(':');
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM host_notifications WHERE host_id = ? AND created_at > datetime('now', '-1 day')").bind(host.id).first();
    const over = (recent?.n || 0) >= DAILY_LIMIT;
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO host_notifications (host_id, kind, ref, event_key, receiver, msg, status, error, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(host.id, kind, ref, eventKey, receiver, parts.sms, over ? 'skipped' : 'queued', over ? '하루 발송 한도를 넘었습니다.' : '', t, t).run();
    if (!changed(ins) || over) return null;
    const row = await env.DB.prepare('SELECT * FROM host_notifications WHERE event_key = ?').bind(eventKey).first();
    await dispatch(env, row, parts);
    return row.id;
  } catch (e) { console.error('hostnotify', e && e.message); return null; }
}

// 발송 길이 막혀 있던(설정 꺼짐 · 연결 서버 미적용) 알림을 길이 열린 뒤 한 번 더 보냅니다. 아무것도 나가지 않은 건만 다시 보냅니다.
export async function retryHeldNotices(env, limit = 10) {
  if (!hostNoticeLive(env)) return 0;
  const { results } = await env.DB.prepare(`SELECT * FROM host_notifications WHERE (status = 'held' OR (status = 'failed' AND error = ?)) AND created_at > datetime('now', ?) ORDER BY id LIMIT ?`)
    .bind(PATH_CLOSED, `-${RETRY_HOURS} hours`, limit).all();
  let n = 0;
  for (const row of results || []) {
    const r = await env.DB.prepare("UPDATE host_notifications SET status = 'queued', error = '', updated_at = ? WHERE id = ? AND status IN ('held','failed')").bind(now(), row.id).run();
    if (!changed(r)) continue;
    await dispatch(env, { ...row, status: 'queued' }, hostNoticeFromSms(row.msg)); n++;
  }
  return n;
}

// 본사 관리자 화면용 발송 기록 (받는 번호는 뒤 4자리만)
export async function hostNoticeList(env, { status = '', limit = 200 } = {}) {
  const where = status === 'attention' ? "WHERE n.status IN ('failed','unknown','held','skipped')" : status === 'sent' ? "WHERE n.status = 'accepted'" : '';
  const { results } = await env.DB.prepare(`SELECT n.id, n.kind, n.ref, n.status, n.error, n.msg, n.provider_mid, n.created_at, substr(n.receiver, -4) AS last4, h.name AS host_name, h.code AS host_code
    FROM host_notifications n JOIN hosts h ON h.id = n.host_id ${where} ORDER BY n.id DESC LIMIT ?`).bind(Math.max(1, Math.min(500, limit))).all();
  return (results || []).map(r => ({ id: r.id, kind: r.kind, kind_label: HOST_NOTICE_KINDS[r.kind] || r.kind, ref: r.ref, status: r.status, status_label: HOST_NOTICE_STATUS[r.status] || r.status, error: r.error || '',
    channel: /^at:/.test(r.provider_mid || '') ? '알림톡' : r.provider_mid ? '문자' : '', msg: r.msg, receiver_last4: r.last4, host_name: r.host_name, host_code: r.host_code, created_at: r.created_at }));
}
