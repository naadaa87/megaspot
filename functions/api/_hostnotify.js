// 호스트 문자 알림 — 새 문의 · 견적 수락 · 입금 알림 · 취소 · 고객 메시지 · 심사 결과 · 이용료 결제/환불 (2026-11-12)
//  · 받는 번호: 호스트센터 계정의 '알림 받을 휴대폰'. 계정에서 알림을 끄면 보내지 않습니다.
//  · 보내는 길: 알리고 고정 IP 연결 서버의 host/send (deploy/aligo-relay/server.mjs).
//    연결 서버에 이 경로가 올라가 있지 않거나 ALIGO_LIVE_ENABLED 가 꺼져 있으면 기록만 남고 문자는 나가지 않습니다.
//  · 같은 일은 한 번만 보냅니다(event_key). 응답이 불분명한 건은 다시 보내지 않습니다.
//  · 문자에는 고객 이름·연락처를 넣지 않습니다. 호스트센터에서 로그인한 뒤 확인합니다.
import { now, str } from './_lib.js';
import { safeJson } from './_platform.js';
import { aligoProvider, guidePhone } from './_guide_messages.js';

const RELAY = 'https://relay.naranhistory.com/megaspot/aligo';
const CENTER = 'https://megaspot.kr/host/center/';
const DAILY_LIMIT = 60;          // 호스트 한 명에게 하루에 보내는 문자 상한
const MESSAGE_GAP_MIN = 60;      // 같은 예약의 고객 메시지 알림은 한 시간에 한 번
export const HOST_NOTICE_HEAD = '[메가스팟 호스트 알림]';
export const HOST_NOTICE_KINDS = { inquiry: '새 문의', accepted: '견적 수락', paid_notice: '입금 알림', cancel: '취소', message: '고객 메시지', review: '심사 결과', billing: '이용료' };
export const HOST_NOTICE_STATUS = { queued: '대기', sending: '보내는 중', accepted: '발송', failed: '실패', unknown: '확인 필요', held: '발송 꺼짐', skipped: '건너뜀' };

const DOW = '일월화수목금토';
const changed = r => Number(r?.meta?.changes ?? r?.changes ?? 0);
const won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
function kday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
  return `${+m[2]}월 ${+m[3]}일(${DOW[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]})`;
}
function when(v) { return [v.date ? kday(v.date) : '날짜 미정', v.start && v.end ? v.start + '~' + v.end : (v.start || ''), v.people ? v.people + '명' : ''].filter(Boolean).join(' · '); }
const spaceName = v => '‘' + str(v.space, 40).replace(/[\r\n]+/g, ' ') + '’';
const hashOk = h => /^#[A-Za-z0-9=-]{1,40}$/.test(h) ? h : '';

// 문자 본문. 첫 줄과 마지막 줄(호스트센터 주소)은 연결 서버가 그대로 검사합니다.
export function hostNoticeText(kind, v = {}) {
  const sp = spaceName(v), booking = ['이용일 ' + when(v), '예약번호 ' + str(v.code, 20)];
  let lines, hash = v.code ? '#b=' + v.code : '';
  if (kind === 'inquiry') lines = [sp + ' 공간에 새 문의가 들어왔습니다.', ...booking, '호스트센터에서 내용을 확인하고 답해 주세요.'];
  else if (kind === 'accepted') lines = [sp + ' 고객이 견적을 수락했습니다.', ...booking, '결제가 확인되면 호스트센터에서 예약을 확정해 주세요.'];
  else if (kind === 'paid_notice') lines = [sp + ' 고객이 입금(결제)했다고 알려 왔습니다.', ...booking, '입금을 확인한 뒤 호스트센터에서 예약을 확정해 주세요.'];
  else if (kind === 'cancel') lines = v.requested ? [sp + ' 고객이 확정된 예약의 취소를 요청했습니다.', ...booking, '환불 규정을 확인하고 호스트센터에서 처리해 주세요.'] : [sp + ' 고객이 예약 요청을 취소했습니다.', ...booking];
  else if (kind === 'message') lines = [sp + ' 고객이 메시지를 남겼습니다.', ...booking, '호스트센터에서 확인하고 답해 주세요.'];
  else if (kind === 'review') {
    hash = v.result === 'fix' && v.ref ? '#space=' + v.ref : '#home';
    if (v.result === 'live') lines = [sp + ' 공간 심사가 끝나 검색에 공개되었습니다.', ...(v.free_until ? [v.free_until + '까지 무료로 등록됩니다.'] : []), '문의가 들어오면 이 번호로 알려 드립니다.'];
    else if (v.result === 'fix') lines = [sp + ' 공간에 보완 요청이 있습니다.', '호스트센터에서 내용을 확인하고 고친 뒤 다시 심사를 요청해 주세요.'];
    else if (v.result === 'rejected') lines = [sp + ' 공간 등록이 반려되었습니다.', '사유는 호스트센터에서 확인할 수 있습니다.'];
  } else if (kind === 'billing') {
    hash = '#billing';
    if (v.result === 'paid') lines = [sp + ' 이용료 결제가 확인되었습니다.', `등록 기간 ${v.from} ~ ${v.to} (${v.months}개월)`, `결제 금액 ${won(v.amount)} (부가세 포함)`];
    else if (v.result === 'refund') lines = [sp + ' 등록 해지와 환불 처리가 끝났습니다.', '환불 금액 ' + won(v.amount), '카드 취소나 입금이 반영되는 시점은 결제수단에 따라 며칠 걸릴 수 있습니다.'];
  }
  if (!lines) return '';
  return [HOST_NOTICE_HEAD, ...lines, CENTER + hashOk(hash)].join('\n');
}

export function hostNoticeLive(env) { return env.ALIGO_LIVE_ENABLED === 'true' && env.ALIGO_RELAY_URL === RELAY && String(env.ALIGO_RELAY_SECRET || '').length >= 32; }
function state(env, id, status, error = '', mid = null) {
  return env.DB.prepare('UPDATE host_notifications SET status = ?, error = ?, provider_mid = COALESCE(?, provider_mid), updated_at = ? WHERE id = ?').bind(status, str(error, 200), mid, now(), id).run();
}
async function dispatch(env, row) {
  if (!hostNoticeLive(env)) return state(env, row.id, 'held', '문자 발송 설정이 꺼져 있습니다.');
  const requestId = crypto.randomUUID();
  const claim = await env.DB.prepare("UPDATE host_notifications SET status = 'sending', request_id = ?, updated_at = ? WHERE id = ? AND status = 'queued'").bind(requestId, now(), row.id).run();
  if (!changed(claim)) return;
  try {
    const r = await aligoProvider(env, 'host/send', { receiver: row.receiver, msg: row.msg }, requestId);
    if (r?.result_code == null || !/^-?\d+$/.test(String(r.result_code))) return state(env, row.id, 'unknown', '문자 접수 결과를 확인해야 합니다.');
    if (Number(r.result_code) !== 1) return state(env, row.id, 'failed', '알리고 접수 거절 (' + Number(r.result_code) + ')');
    if (!/^\d{1,30}$/.test(String(r.msg_id || '')) || Number(r.success_cnt) !== 1 || Number(r.error_cnt) !== 0) return state(env, row.id, 'unknown', '문자 접수 결과를 확인해야 합니다.');
    return state(env, row.id, 'accepted', '', String(r.msg_id));
  } catch (e) {
    if (e && e.status === 400) return state(env, row.id, 'failed', '발송 서버가 요청을 받지 않았습니다. 호스트 알림 경로(host/send)가 적용됐는지 확인해 주세요.');
    if (e && [401, 403].includes(e.status)) return state(env, row.id, 'failed', '발송 서버가 요청을 거절했습니다 (' + e.status + ').');
    return state(env, row.id, 'unknown', '발송 응답을 받지 못했습니다. 다시 보내지 않습니다.');
  }
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
    const msg = hostNoticeText(kind, v); if (!msg || msg.length > 600) return null;
    const ref = str(v.code || v.ref || '', 40), t = now();
    if (kind === 'message') {   // 메시지가 이어질 때 문자가 쏟아지지 않게
      const last = await env.DB.prepare("SELECT 1 AS x FROM host_notifications WHERE host_id = ? AND kind = 'message' AND ref = ? AND created_at > datetime('now', ?)").bind(host.id, ref, `-${MESSAGE_GAP_MIN} minutes`).first();
      if (last) return null;
    }
    const eventKey = [kind, ref, str(key, 60) || (kind === 'message' ? t : '')].join(':');
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM host_notifications WHERE host_id = ? AND created_at > datetime('now', '-1 day')").bind(host.id).first();
    const over = (recent?.n || 0) >= DAILY_LIMIT;
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO host_notifications (host_id, kind, ref, event_key, receiver, msg, status, error, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(host.id, kind, ref, eventKey, receiver, msg, over ? 'skipped' : 'queued', over ? '하루 발송 한도를 넘었습니다.' : '', t, t).run();
    if (!changed(ins) || over) return null;
    const row = await env.DB.prepare('SELECT * FROM host_notifications WHERE event_key = ?').bind(eventKey).first();
    await dispatch(env, row);
    return row.id;
  } catch (e) { console.error('hostnotify', e && e.message); return null; }
}

// 본사 관리자 화면용 발송 기록 (받는 번호는 뒤 4자리만)
export async function hostNoticeList(env, { status = '', limit = 200 } = {}) {
  const where = status === 'attention' ? "WHERE n.status IN ('failed','unknown','held','skipped')" : status === 'sent' ? "WHERE n.status = 'accepted'" : '';
  const { results } = await env.DB.prepare(`SELECT n.id, n.kind, n.ref, n.status, n.error, n.msg, n.created_at, substr(n.receiver, -4) AS last4, h.name AS host_name, h.code AS host_code
    FROM host_notifications n JOIN hosts h ON h.id = n.host_id ${where} ORDER BY n.id DESC LIMIT ?`).bind(Math.max(1, Math.min(500, limit))).all();
  return (results || []).map(r => ({ id: r.id, kind: r.kind, kind_label: HOST_NOTICE_KINDS[r.kind] || r.kind, ref: r.ref, status: r.status, status_label: HOST_NOTICE_STATUS[r.status] || r.status, error: r.error || '',
    msg: r.msg, receiver_last4: r.last4, host_name: r.host_name, host_code: r.host_code, created_at: r.created_at }));
}
