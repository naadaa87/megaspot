// 모임 초대장 카카오톡(알림톡) 보내기 (2026-11-24)
//  · 예약자 본인 번호(예약의 대표 연락처·추가 연락처)로만 보냅니다. 다른 번호로는 보낼 수 없습니다.
//  · 알리고에 아래 INVITE_TEMPLATE 을 글자 그대로 등록하고 카카오 승인을 받은 뒤, 관리자 → 모임 초대장 → 카카오톡 설정에서
//    템플릿 코드를 저장하고 '승인 확인' → '시험 발송'(운영자 번호로 받아 보기) → '받았어요'를 차례로 눌러야 보낼 수 있습니다.
//  · 연결 서버(relay.naranhistory.com)는 허용 목록에 있는 템플릿만 보내므로, 발급받은 코드를
//    연결 서버 환경 변수 ALIGO_MEMBER_TEMPLATE_CODES 에 쉼표로 덧붙이고 다시 시작해야 합니다(알림톡 실패 시 같은 내용 문자로 대신 보냄).
//  · 고객이 초대장 화면에서 직접 '카카오톡으로 받기'를 누르는 기능은 관리자가 따로 켜야 보입니다(기본 꺼짐).
//  · 보낸 기록(받는 번호는 가운데를 가림)은 invite_messages 에 남기고, 초대장을 지울 때 함께 지웁니다.
import { now, sha256, str } from './_lib.js';
import { aligoProvider, guidePhone } from './_guide_messages.js';
import { reviewCustomerTemplate, customerFallback } from './_customer_alimtalk.js';

export const SETTINGS_KEY = 'invite_alimtalk';
const READY_KEY = SETTINGS_KEY + ':ready';
const RELAY = 'https://relay.naranhistory.com/megaspot/aligo';
export const SUBJECT = '메가스팟 모임 초대장';
const VIEW = 'https://megaspot.kr/invite/#c=#{초대장코드}';
const MANAGE = 'https://megaspot.kr/invite/manage/#id=#{관리번호}&k=#{관리키}';
export const INVITE_TEMPLATE = {
  name: '메가스팟_모임초대장_v1',
  content: `[메가스팟 모임 초대장]

#{고객명}님, 예약하신 모임의 초대장이 준비되었습니다.

모임 이름: #{모임이름}
예약 공간: #{공간명}
이용 날짜: #{이용일}
이용 시간: #{이용시간}

'초대장 보기'에서 주소를 복사해 일행에게 보내 주세요.
PDF 저장, 내용 고치기, 참석 응답 확인은 '초대장 관리'에서 할 수 있습니다.
'초대장 관리'는 예약하신 분만 쓰는 화면이니 다른 분께 전달하지 마세요.`,
  buttons: [
    { name: '초대장 보기', linkType: 'WL', linkMo: VIEW, linkPc: VIEW },
    { name: '초대장 관리', linkType: 'WL', linkMo: MANAGE, linkPc: MANAGE }
  ]
};
export const TEMPLATE_VARS = ['고객명', '모임이름', '공간명', '이용일', '이용시간', '초대장코드', '관리번호', '관리키'];

const parse = raw => { try { const o = JSON.parse(raw || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
async function getSetting(env, key) { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first(); return r ? r.value : null; }
const putSetting = (env, key, value) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, now()).run();
const delSetting = (env, key) => env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();

export async function kakaoConfig(env) {
  const s = parse(await getSetting(env, SETTINGS_KEY));
  return { code: /^[A-Za-z0-9_-]{2,30}$/.test(s.code || '') ? s.code : '', enabled: s.enabled === true, tested: str(s.tested, 80) };
}
const writeConfig = (env, c) => putSetting(env, SETTINGS_KEY, JSON.stringify({ code: c.code || '', enabled: !!c.enabled, tested: c.tested || '' }));

// 알리고 연결: 운영은 고정 IP 연결 서버, 개발·예전 방식은 알리고 직접 연결
export function transport(env) {
  if (env.ALIGO_RELAY_URL) return env.ALIGO_RELAY_URL === RELAY && String(env.ALIGO_RELAY_SECRET || '').length >= 32 && !!env.ALIGO_SENDER_KEY ? 'relay' : '';
  return env.ALIGO_API_KEY && env.ALIGO_USERID && env.ALIGO_SENDER_KEY && env.ALIGO_SENDER ? 'direct' : '';
}
export const liveAllowed = env => env.ALIGO_LIVE_ENABLED === 'true' && !!transport(env);
// 템플릿 코드·본문·버튼·발신 프로필이 바뀌면 승인 확인과 시험 수신을 다시 해야 합니다
export const configSig = (env, code) => sha256(JSON.stringify(['invite-alimtalk-v1', env.ALIGO_SENDER_KEY || '', code, INVITE_TEMPLATE.content, INVITE_TEMPLATE.buttons]));

export async function kakaoState(env) {
  const c = await kakaoConfig(env), sig = c.code ? await configSig(env, c.code) : '';
  const ready = String(await getSetting(env, READY_KEY) || '');
  const approved = !!sig && (ready === sig || ready === sig + ':crlf');
  const tested = approved && c.tested === sig, live = liveAllowed(env);
  return { code: c.code, enabled: c.enabled, approved, tested, live, transport: transport(env) || 'none',
    admin_ready: live && approved && tested, customer_ready: live && approved && tested && c.enabled };
}
// 고객 화면에는 켜져 있는지만 알려 줍니다
export async function customerKakao(env) { try { return { ready: (await kakaoState(env)).customer_ready }; } catch { return { ready: false }; } }

export async function saveKakaoConfig(env, d) {
  const c = await kakaoConfig(env), next = { ...c };
  if (d.code !== undefined) {
    const v = str(d.code, 30);
    if (v && !/^[A-Za-z0-9_-]{2,30}$/.test(v)) return { error: '템플릿 코드는 알리고에서 받은 영문·숫자 코드로 적어 주세요. (예: UN_1234)' };
    if (v !== c.code) { next.code = v; next.tested = ''; next.enabled = false; await delSetting(env, READY_KEY); }
  }
  if (d.enabled !== undefined) {
    const on = d.enabled === true;
    if (on) { const s = await kakaoState(env); if (!s.admin_ready) return { error: '승인 확인과 시험 수신을 마친 뒤에 켤 수 있습니다.' + (s.live ? '' : ' 서버의 알림톡 발송 설정(ALIGO_LIVE_ENABLED)도 확인해 주세요.') }; }
    next.enabled = on;
  }
  await writeConfig(env, next);
  return { ok: true };
}

const provider = env => (path, data, id) => aligoProvider(env, path, data, id);
const REVIEW_LABEL = { APR: '승인', REQ: '검수 중', REG: '등록됨(검수 요청 전)', REJ: '반려', missing: '알리고에서 찾을 수 없음' };
// 알리고에 등록된 템플릿이 승인되었고 본문·버튼이 글자까지 같은지 확인합니다
export async function checkTemplate(env, send = provider(env)) {
  const c = await kakaoConfig(env);
  if (!c.code) return { ready: false, review: '', message: '알리고에서 받은 템플릿 코드를 먼저 저장해 주세요.' };
  if (!transport(env)) return { ready: false, review: '', message: '알리고 연결 설정이 없습니다. Cloudflare 환경 변수를 확인해 주세요.' };
  let r;
  try { r = await reviewCustomerTemplate(env, send, 'invite', { code: c.code, ...INVITE_TEMPLATE }); }
  catch (e) {
    const blocked = e && e.status === 403;
    await delSetting(env, READY_KEY);
    return { ready: false, review: 'unavailable', message: blocked ? '연결 서버가 이 템플릿 코드를 막았습니다. 연결 서버 환경 변수 ALIGO_MEMBER_TEMPLATE_CODES 에 코드를 덧붙이고 다시 시작해 주세요.' : '알리고에서 승인 상태를 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.' };
  }
  const sig = await configSig(env, c.code);
  if (r.ready) await putSetting(env, READY_KEY, sig + (String(r.template.templtContent || '').includes('\r\n') ? ':crlf' : ''));
  else await delSetting(env, READY_KEY);
  const label = REVIEW_LABEL[r.review] || r.review;
  return { ready: r.ready, review: r.review, review_label: label, matches: r.matches,
    message: r.ready ? '승인되었고 본문·버튼이 같습니다. 운영자 번호로 시험 발송해 보세요.'
      : r.review === 'missing' ? '알리고에서 이 코드를 찾지 못했습니다. 코드를 다시 확인해 주세요.'
      : !r.matches ? '알리고에 등록한 본문·버튼이 아래 내용과 다릅니다. 띄어쓰기와 줄바꿈까지 같게 등록해 주세요.'
      : '아직 카카오 승인 전입니다(' + label + '). 승인되면 다시 확인해 주세요.' };
}

// ---------- 내용 채우기 ----------
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export function dateLabel(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''); if (!m) return '';
  return `${+m[1]}년 ${+m[2]}월 ${+m[3]}일 (${WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]})`;
}
export function hourLabel(h) {
  h = Number(h); if (!Number.isFinite(h)) return '';
  const x = h % 24, s = String(Math.floor(x)).padStart(2, '0') + ':' + String(Math.round((x % 1) * 60)).padStart(2, '0');
  return h >= 24 ? '다음 날 ' + s : s;
}
export function timeLabel(s, e) { return s == null ? '예약 시간 기준' : hourLabel(s) + (e != null ? ' ~ ' + hourLabel(e) : ''); }
const fill = (text, v) => String(text).replace(/#\{([^}]+)\}/g, (_, k) => (v[k] != null ? String(v[k]) : '#{' + k + '}'));
export function renderInvite(tpl, v) {
  const message = fill(tpl.content, v);
  const buttons = tpl.buttons.map(b => ({ name: b.name, linkType: b.linkType, linkMo: fill(b.linkMo, v), linkPc: fill(b.linkPc, v) }));
  return { message, buttons };
}
export const maskPhone = p => { const d = String(p || ''); return d.length >= 10 ? d.slice(0, 3) + '-****-' + d.slice(-4) : '****'; };

async function approvedTemplate(env, code) {
  const sig = await configSig(env, code), ready = String(await getSetting(env, READY_KEY) || '');
  if (ready === sig) return { code, ...INVITE_TEMPLATE };
  if (ready === sig + ':crlf') return { code, ...INVITE_TEMPLATE, content: INVITE_TEMPLATE.content.replace(/\n/g, '\r\n') };
  return null;
}

// 한 번 보내기. vars: TEMPLATE_VARS 값. actor: customer | host | admin | test
export async function sendInviteKakao(env, { inviteId = null, bookingCode = null, receiver, name = '', vars, actor, test = false }, send = provider(env)) {
  const phone = guidePhone(receiver);
  if (!phone) return { error: '카카오톡을 받을 휴대폰 번호를 확인해 주세요.', status: 400 };
  const s = await kakaoState(env);
  if (!s.live) return { error: '서버의 알림톡 발송이 꺼져 있습니다. 발송 설정을 확인해 주세요.', status: 409, code: 'KAKAO_OFF' };
  if (!test && !s.admin_ready) return { error: '카카오톡 초대장 템플릿의 승인 확인과 시험 수신을 먼저 마쳐 주세요.', status: 409, code: 'KAKAO_OFF' };
  const tpl = await approvedTemplate(env, s.code);
  if (!tpl) return { error: '카카오톡 초대장 템플릿 승인 확인을 먼저 해 주세요.', status: 409, code: 'KAKAO_OFF' };
  const { message, buttons } = renderInvite(tpl, vars);
  if (/#\{/.test(message) || buttons.some(b => /#\{/.test(b.linkMo))) return { error: '초대장 안내에 빈 칸이 남아 보내지 않았습니다.', status: 500 };
  const at = now(), mask = maskPhone(phone), hash = await sha256('invite-receiver:' + phone);
  const ins = await env.DB.prepare('INSERT INTO invite_messages (invite_id, booking_code, receiver_mask, receiver_hash, actor, status, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(inviteId, bookingCode, mask, hash, actor, 'sending', at).run();
  const rowId = ins.meta?.last_row_id ?? ins.lastInsertRowid;
  const fallback = customerFallback(SUBJECT, message.replace(/\r\n/g, '\n'), buttons);
  let status = 'unknown', error = '', mid = null;
  try {
    // 연결 서버는 발신 프로필·발신 번호·대체 문자 여부를 서버 값으로 정합니다. 알리고 직접 연결일 때만 아래 값이 쓰입니다.
    const r = await send('alimtalk/send', { senderkey: env.ALIGO_SENDER_KEY, sender: env.ALIGO_SENDER, tpl_code: tpl.code, receiver_1: phone, recvname_1: str(name, 20), subject_1: SUBJECT, message_1: message,
      button_1: JSON.stringify({ button: buttons }), failover: 'Y', fsubject_1: fallback.fsubject_1, fmessage_1: fallback.fmessage_1 }, crypto.randomUUID());
    if (r?.code == null || !/^-?\d+$/.test(String(r.code))) error = '접수 결과를 확인하지 못했습니다. 알리고 전송 내역을 확인해 주세요.';
    else if (Number(r.code) !== 0) { status = 'failed'; error = '알리고가 접수하지 않았습니다 (' + Number(r.code) + ').'; }
    else if (/^\d{1,30}$/.test(String(r.info?.mid || '')) && Number(r.info?.scnt) === 1 && Number(r.info?.fcnt || 0) === 0) { status = 'accepted'; mid = String(r.info.mid); }
    else error = '접수 결과를 확인하지 못했습니다. 알리고 전송 내역을 확인해 주세요.';
  } catch (e) {
    if ([400, 401, 403].includes(e && e.status)) { status = 'failed'; error = e.status === 403 ? '연결 서버가 이 템플릿을 막았습니다. 허용 목록을 확인해 주세요.' : '발송 서버가 요청을 거절했습니다 (' + e.status + ').'; }
    else error = '보낸 결과를 확인하지 못했습니다. 같은 메시지가 갈 수 있으니 알리고 전송 내역을 먼저 확인해 주세요.';
  }
  if (rowId != null) await env.DB.prepare('UPDATE invite_messages SET status = ?, error = ?, provider_mid = ? WHERE id = ?').bind(status, error, mid, Number(rowId)).run();
  else await env.DB.prepare("UPDATE invite_messages SET status = ?, error = ?, provider_mid = ? WHERE id = (SELECT MAX(id) FROM invite_messages WHERE receiver_hash = ? AND status = 'sending')").bind(status, error, mid, hash).run();
  if (status === 'failed') return { error: error || '보내지 못했습니다.', status: 502, code: 'SEND_FAILED', receiver: mask };
  return { ok: true, status, receiver: mask, note: error };
}

export async function inviteMessages(env, inviteId, limit = 20) {
  const { results } = await env.DB.prepare('SELECT receiver_mask, actor, status, error, created_at FROM invite_messages WHERE invite_id = ? ORDER BY id DESC LIMIT ?').bind(inviteId, limit).all();
  return results || [];
}
// 운영자 시험 발송: 예시 초대장 주소로 보냅니다 (/invite/#c=sample 은 예시 초대장을 보여 줍니다)
export function sampleVars(date) {
  return { 고객명: '운영자 시험', 모임이름: '카카오톡 초대장 시험', 공간명: '메가스팟 건대 1호', 이용일: dateLabel(date), 이용시간: '18:00 ~ 22:00',
    초대장코드: 'sample', 관리번호: 'SAMPLE', 관리키: 'sample' };
}
export async function markTested(env) {
  const c = await kakaoConfig(env); if (!c.code) return { error: '템플릿 코드를 먼저 저장해 주세요.' };
  if (!(await approvedTemplate(env, c.code))) return { error: '승인 확인을 먼저 통과해야 합니다.' };
  const sent = await env.DB.prepare("SELECT 1 FROM invite_messages WHERE actor = 'test' AND status = 'accepted' AND created_at >= datetime('now', '-1 day') LIMIT 1").first();
  if (!sent) return { error: '하루 안에 접수된 시험 발송이 없습니다. 시험 발송을 먼저 해 주세요.' };
  await writeConfig(env, { ...c, tested: await configSig(env, c.code) });
  return { ok: true };
}
