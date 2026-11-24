// 관리자가 코드를 넣어 쓰는 알림톡 템플릿 공통 처리 (2026-11-24)
//  모임 초대장(_invite_kakao.js)·공간대관 계약서(_contracts.js)가 같이 씁니다.
//  · 알리고에 spec.template 을 글자 그대로 등록 → 카카오 승인 → 관리자 화면에서 코드 저장 → 승인 확인 → 운영자 시험 발송 → '받았어요'
//  · 연결 서버(relay.naranhistory.com)는 허용 목록의 템플릿만 보내므로 승인 코드를 ALIGO_MEMBER_TEMPLATE_CODES 에 덧붙여야 합니다
//    (그 목록의 템플릿은 알림톡이 실패하면 같은 내용을 문자로 대신 보냅니다)
//  · 코드·본문·버튼·발신 프로필이 바뀌면 승인 확인과 시험 수신을 다시 해야 합니다
//  spec: { key(설정 이름), tag(서명 구분), template{name,content,buttons}, subject, table(보낸 기록 표), idCol(기록 표의 문서 번호 칸), noun(안내 문구용 이름) }
import { now, sha256, str } from './_lib.js';
import { aligoProvider, guidePhone } from './_guide_messages.js';
import { reviewCustomerTemplate, customerFallback } from './_customer_alimtalk.js';

const RELAY = 'https://relay.naranhistory.com/megaspot/aligo';
const parse = raw => { try { const o = JSON.parse(raw || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
async function getSetting(env, key) { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first(); return r ? r.value : null; }
const putSetting = (env, key, value) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, now()).run();
const delSetting = (env, key) => env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();

// 알리고 연결: 운영은 고정 IP 연결 서버, 개발·예전 방식은 알리고 직접 연결
export function transport(env) {
  if (env.ALIGO_RELAY_URL) return env.ALIGO_RELAY_URL === RELAY && String(env.ALIGO_RELAY_SECRET || '').length >= 32 && !!env.ALIGO_SENDER_KEY ? 'relay' : '';
  return env.ALIGO_API_KEY && env.ALIGO_USERID && env.ALIGO_SENDER_KEY && env.ALIGO_SENDER ? 'direct' : '';
}
export const liveAllowed = env => env.ALIGO_LIVE_ENABLED === 'true' && !!transport(env);
export const maskPhone = p => { const d = String(p || ''); return d.length >= 10 ? d.slice(0, 3) + '-****-' + d.slice(-4) : '****'; };
const fill = (text, v) => String(text).replace(/#\{([^}]+)\}/g, (_, k) => (v[k] != null ? String(v[k]) : '#{' + k + '}'));
export function renderTemplate(tpl, v) {
  const message = fill(tpl.content, v);
  const buttons = tpl.buttons.map(b => ({ name: b.name, linkType: b.linkType, linkMo: fill(b.linkMo, v), linkPc: fill(b.linkPc, v) }));
  return { message, buttons };
}
export const templateVars = tpl => [...new Set([...tpl.content.matchAll(/#\{([^}]+)\}/g), ...tpl.buttons.flatMap(b => [...b.linkMo.matchAll(/#\{([^}]+)\}/g)])].map(m => m[1]))];
const provider = env => (path, data, id) => aligoProvider(env, path, data, id);
const REVIEW_LABEL = { APR: '승인', REQ: '검수 중', REG: '등록됨(검수 요청 전)', REJ: '반려', missing: '알리고에서 찾을 수 없음' };

export function makeKakao(spec) {
  const READY_KEY = spec.key + ':ready', T = spec.template, noun = spec.noun || '알림톡';
  async function config(env) {
    const s = parse(await getSetting(env, spec.key));
    return { code: /^[A-Za-z0-9_-]{2,30}$/.test(s.code || '') ? s.code : '', enabled: s.enabled === true, tested: str(s.tested, 80) };
  }
  const writeConfig = (env, c) => putSetting(env, spec.key, JSON.stringify({ code: c.code || '', enabled: !!c.enabled, tested: c.tested || '' }));
  const sig = (env, code) => sha256(JSON.stringify([spec.tag, env.ALIGO_SENDER_KEY || '', code, T.content, T.buttons]));
  async function state(env) {
    const c = await config(env), s = c.code ? await sig(env, c.code) : '';
    const ready = String(await getSetting(env, READY_KEY) || '');
    const approved = !!s && (ready === s || ready === s + ':crlf');
    const tested = approved && c.tested === s, live = liveAllowed(env);
    return { code: c.code, enabled: c.enabled, approved, tested, live, transport: transport(env) || 'none',
      admin_ready: live && approved && tested, customer_ready: live && approved && tested && c.enabled };
  }
  async function save(env, d) {
    const c = await config(env), next = { ...c };
    if (d.code !== undefined) {
      const v = str(d.code, 30);
      if (v && !/^[A-Za-z0-9_-]{2,30}$/.test(v)) return { error: '템플릿 코드는 알리고에서 받은 영문·숫자 코드로 적어 주세요. (예: UN_1234)' };
      if (v !== c.code) { next.code = v; next.tested = ''; next.enabled = false; await delSetting(env, READY_KEY); }
    }
    if (d.enabled !== undefined) {
      const on = d.enabled === true;
      if (on) { const s = await state(env); if (!s.admin_ready) return { error: '승인 확인과 시험 수신을 마친 뒤에 켤 수 있습니다.' + (s.live ? '' : ' 서버의 알림톡 발송 설정(ALIGO_LIVE_ENABLED)도 확인해 주세요.') }; }
      next.enabled = on;
    }
    await writeConfig(env, next);
    return { ok: true };
  }
  async function check(env, send = provider(env)) {
    const c = await config(env);
    if (!c.code) return { ready: false, review: '', message: '알리고에서 받은 템플릿 코드를 먼저 저장해 주세요.' };
    if (!transport(env)) return { ready: false, review: '', message: '알리고 연결 설정이 없습니다. Cloudflare 환경 변수를 확인해 주세요.' };
    let r;
    try { r = await reviewCustomerTemplate(env, send, spec.key, { code: c.code, ...T }); }
    catch (e) {
      const blocked = e && e.status === 403;
      await delSetting(env, READY_KEY);
      return { ready: false, review: 'unavailable', message: blocked ? '연결 서버가 이 템플릿 코드를 막았습니다. 연결 서버 환경 변수 ALIGO_MEMBER_TEMPLATE_CODES 에 코드를 덧붙이고 다시 시작해 주세요.' : '알리고에서 승인 상태를 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.' };
    }
    const s = await sig(env, c.code);
    if (r.ready) await putSetting(env, READY_KEY, s + (String(r.template.templtContent || '').includes('\r\n') ? ':crlf' : ''));
    else await delSetting(env, READY_KEY);
    const label = REVIEW_LABEL[r.review] || r.review;
    return { ready: r.ready, review: r.review, review_label: label, matches: r.matches,
      message: r.ready ? '승인되었고 본문·버튼이 같습니다. 운영자 번호로 시험 발송해 보세요.'
        : r.review === 'missing' ? '알리고에서 이 코드를 찾지 못했습니다. 코드를 다시 확인해 주세요.'
        : !r.matches ? '알리고에 등록한 본문·버튼이 아래 내용과 다릅니다. 띄어쓰기와 줄바꿈까지 같게 등록해 주세요.'
        : '아직 카카오 승인 전입니다(' + label + '). 승인되면 다시 확인해 주세요.' };
  }
  async function approved(env, code) {
    const s = await sig(env, code), ready = String(await getSetting(env, READY_KEY) || '');
    if (ready === s) return { code, ...T };
    if (ready === s + ':crlf') return { code, ...T, content: T.content.replace(/\n/g, '\r\n') };
    return null;
  }
  // 한 번 보내기. vars: 템플릿 변수 값. actor: customer | host | admin | test
  async function send(env, { refId = null, bookingCode = null, receiver, name = '', vars, actor, test = false }, sender = provider(env)) {
    const phone = guidePhone(receiver);
    if (!phone) return { error: '카카오톡을 받을 휴대폰 번호를 확인해 주세요.', status: 400 };
    const s = await state(env);
    if (!s.live) return { error: '서버의 알림톡 발송이 꺼져 있습니다. 발송 설정을 확인해 주세요.', status: 409, code: 'KAKAO_OFF' };
    if (!test && !s.admin_ready) return { error: '카카오톡 ' + noun + ' 템플릿의 승인 확인과 시험 수신을 먼저 마쳐 주세요.', status: 409, code: 'KAKAO_OFF' };
    const tpl = await approved(env, s.code);
    if (!tpl) return { error: '카카오톡 ' + noun + ' 템플릿 승인 확인을 먼저 해 주세요.', status: 409, code: 'KAKAO_OFF' };
    const { message, buttons } = renderTemplate(tpl, vars);
    if (/#\{/.test(message) || buttons.some(b => /#\{/.test(b.linkMo))) return { error: noun + ' 안내에 빈 칸이 남아 보내지 않았습니다.', status: 500 };
    const at = now(), mask = maskPhone(phone), hash = await sha256((spec.hashTag || 'invite-receiver:') + phone);
    const ins = await env.DB.prepare(`INSERT INTO ${spec.table} (${spec.idCol}, booking_code, receiver_mask, receiver_hash, actor, status, created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(refId, bookingCode, mask, hash, actor, 'sending', at).run();
    const rowId = ins.meta?.last_row_id ?? ins.lastInsertRowid;
    const fallback = customerFallback(spec.subject, message.replace(/\r\n/g, '\n'), buttons);
    let status = 'unknown', error = '', mid = null;
    try {
      // 연결 서버는 발신 프로필·발신 번호·대체 문자 여부를 서버 값으로 정합니다. 알리고 직접 연결일 때만 아래 값이 쓰입니다.
      const r = await sender('alimtalk/send', { senderkey: env.ALIGO_SENDER_KEY, sender: env.ALIGO_SENDER, tpl_code: tpl.code, receiver_1: phone, recvname_1: str(name, 20), subject_1: spec.subject, message_1: message,
        button_1: JSON.stringify({ button: buttons }), failover: 'Y', fsubject_1: fallback.fsubject_1, fmessage_1: fallback.fmessage_1 }, crypto.randomUUID());
      if (r?.code == null || !/^-?\d+$/.test(String(r.code))) error = '접수 결과를 확인하지 못했습니다. 알리고 전송 내역을 확인해 주세요.';
      else if (Number(r.code) !== 0) { status = 'failed'; error = '알리고가 접수하지 않았습니다 (' + Number(r.code) + ').'; }
      else if (/^\d{1,30}$/.test(String(r.info?.mid || '')) && Number(r.info?.scnt) === 1 && Number(r.info?.fcnt || 0) === 0) { status = 'accepted'; mid = String(r.info.mid); }
      else error = '접수 결과를 확인하지 못했습니다. 알리고 전송 내역을 확인해 주세요.';
    } catch (e) {
      if ([400, 401, 403].includes(e && e.status)) { status = 'failed'; error = e.status === 403 ? '연결 서버가 이 템플릿을 막았습니다. 허용 목록을 확인해 주세요.' : '발송 서버가 요청을 거절했습니다 (' + e.status + ').'; }
      else error = '보낸 결과를 확인하지 못했습니다. 같은 메시지가 갈 수 있으니 알리고 전송 내역을 먼저 확인해 주세요.';
    }
    if (rowId != null) await env.DB.prepare(`UPDATE ${spec.table} SET status = ?, error = ?, provider_mid = ? WHERE id = ?`).bind(status, error, mid, Number(rowId)).run();
    else await env.DB.prepare(`UPDATE ${spec.table} SET status = ?, error = ?, provider_mid = ? WHERE id = (SELECT MAX(id) FROM ${spec.table} WHERE receiver_hash = ? AND status = 'sending')`).bind(status, error, mid, hash).run();
    if (status === 'failed') return { error: error || '보내지 못했습니다.', status: 502, code: 'SEND_FAILED', receiver: mask };
    return { ok: true, status, receiver: mask, note: error };
  }
  async function messages(env, refId, limit = 20) {
    const { results } = await env.DB.prepare(`SELECT receiver_mask, actor, status, error, created_at FROM ${spec.table} WHERE ${spec.idCol} = ? ORDER BY id DESC LIMIT ?`).bind(refId, limit).all();
    return results || [];
  }
  async function tests(env, limit = 5) {
    const { results } = await env.DB.prepare(`SELECT receiver_mask, status, error, created_at FROM ${spec.table} WHERE actor = 'test' ORDER BY id DESC LIMIT ?`).bind(limit).all();
    return results || [];
  }
  async function markTested(env) {
    const c = await config(env); if (!c.code) return { error: '템플릿 코드를 먼저 저장해 주세요.' };
    if (!(await approved(env, c.code))) return { error: '승인 확인을 먼저 통과해야 합니다.' };
    const sent = await env.DB.prepare(`SELECT 1 FROM ${spec.table} WHERE actor = 'test' AND status = 'accepted' AND created_at >= datetime('now', '-1 day') LIMIT 1`).first();
    if (!sent) return { error: '하루 안에 접수된 시험 발송이 없습니다. 시험 발송을 먼저 해 주세요.' };
    await writeConfig(env, { ...c, tested: await sig(env, c.code) });
    return { ok: true };
  }
  return { spec, config, state, save, check, send, messages, tests, markTested, sig,
    customer: async env => { try { return { ready: (await state(env)).customer_ready }; } catch { return { ready: false }; } } };
}
