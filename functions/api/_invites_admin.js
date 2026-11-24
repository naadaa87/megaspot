// 관리자 → 모임 초대장 (2026-11-24)
//  GET  /api/invites/admin/list?from=&to=&q=&has=all|with|without   다가오는 확정 예약과 초대장 현황
//  GET  /api/invites/admin/detail?booking_code=                       예약 1건의 초대장·연락처·보낸 기록
//  POST /api/invites/admin/create   { booking_code, data }            관리자가 대신 초대장 만들기 (예약 1건에 1장)
//  POST /api/invites/admin/send     { booking_code, receivers: [] }   예약자 번호로 카카오톡 보내기 (예약에 있는 번호만)
//  GET  /api/invites/admin/kakao                                      카카오톡 템플릿·승인·시험 상태
//  POST /api/invites/admin/kakao    { action: save | check | test | confirm | enable, ... }
import { json, err, readJson, str, isDate, kstToday, uniqueRef, log, now, requireAdmin, tooMany, hit, sha256 } from './_lib.js';
import { cleanInvite, inviteCode, links, parse, publicInvite, summarize, VENUES, LIVE_STATUS, shiftDate } from './_invites.js';
import { bookingHourSql } from './_booking_availability.js';
import { bookingPhone2Sql, bookingContacts, contactPhones, mobilePhone } from './_contacts.js';
import { kakaoState, saveKakaoConfig, checkTemplate, sendInviteKakao, inviteMessages, sampleVars, markTested, maskPhone, INVITE_TEMPLATE, TEMPLATE_VARS, SUBJECT } from './_invite_kakao.js';

const SPACE_IN = Object.keys(VENUES).map(() => '?').join(',');
const digits = v => String(v || '').replace(/\D/g, '');

async function list(env, url) {
  const today = kstToday();
  let from = str(url.searchParams.get('from'), 10), to = str(url.searchParams.get('to'), 10);
  if (!isDate(from)) from = today;
  if (!isDate(to) || to < from) to = shiftDate(from, 60);
  if (to > shiftDate(from, 370)) to = shiftDate(from, 370);
  const { results } = await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.customer_name, b.phone, b.date, b.headcount, b.status,
      ${bookingHourSql('b', 'i', 'start_h')} AS start_h, ${bookingHourSql('b', 'i', 'end_h')} AS end_h, ${bookingPhone2Sql()} AS phone2,
      v.id AS invite_id, v.code AS invite_code, v.data AS invite_data, v.created_at AS invite_created,
      (SELECT COUNT(*) FROM invite_rsvps r WHERE r.invite_id = v.id) AS rsvp_n,
      (SELECT COALESCE(SUM(r.party), 0) FROM invite_rsvps r WHERE r.invite_id = v.id AND r.status = 'yes') AS people,
      (SELECT MAX(m.created_at) FROM invite_messages m WHERE m.invite_id = v.id AND m.status IN ('accepted', 'unknown')) AS last_sent
    FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref LEFT JOIN invites v ON v.booking_code = b.booking_code
    WHERE b.status IN ('confirmed', 'completed') AND b.space_id IN (${SPACE_IN}) AND b.date BETWEEN ? AND ?
    ORDER BY b.date, start_h, b.booking_code LIMIT 400`).bind(...Object.keys(VENUES), from, to).all();
  const q = str(url.searchParams.get('q'), 40).toLowerCase(), qd = digits(q), has = str(url.searchParams.get('has'), 10);
  let rows = results || [];
  if (q) rows = rows.filter(r => r.booking_code.toLowerCase().includes(q) || String(r.customer_name || '').toLowerCase().includes(q)
    || (qd.length >= 4 && (digits(r.phone).includes(qd) || digits(r.phone2).includes(qd))) || (r.invite_data && String(parse(r.invite_data).title || '').toLowerCase().includes(q)));
  const all = rows;
  if (has === 'with') rows = rows.filter(r => r.invite_id); else if (has === 'without') rows = rows.filter(r => !r.invite_id);
  return json({ ok: true, from, to, today,
    counts: { total: all.length, with: all.filter(r => r.invite_id).length, sent: all.filter(r => r.last_sent).length },
    items: rows.map(r => ({ booking_code: r.booking_code, space_id: r.space_id, space_name: (VENUES[r.space_id] || {}).name || r.space_id,
      customer_name: r.customer_name, phone: r.phone, phone2: r.phone2 || '', date: r.date, start_h: r.start_h ?? null, end_h: r.end_h ?? null,
      headcount: r.headcount ?? null, status: r.status,
      invite: r.invite_id ? { id: r.invite_id, code: r.invite_code, title: parse(r.invite_data).title || '', created_at: r.invite_created,
        rsvp_n: r.rsvp_n || 0, people: r.people || 0, last_sent: r.last_sent || null } : null })) });
}

async function detail(env, url, H) {
  const code = str(url.searchParams.get('booking_code'), 20).toUpperCase();
  const c = code && await bookingContacts(env, code);
  if (!c) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const bk = await H.booking(env, code);
  const inv = await env.DB.prepare('SELECT * FROM invites WHERE booking_code = ?').bind(code).first();
  let invite = null;
  if (inv) {
    const data = parse(inv.data), live = await H.liveBooking(env, inv);
    const { results } = await env.DB.prepare('SELECT status, party, cars FROM invite_rsvps WHERE invite_id = ?').bind(inv.id).all();
    invite = { id: inv.id, code: inv.code, data, created_at: inv.created_at, updated_at: inv.updated_at, closed: !live,
      public: live ? publicInvite(inv, data, live) : null, summary: summarize(results || []), messages: await inviteMessages(env, inv.id), ...(await links(env, inv)) };
  }
  return json({ ok: true, booking: { ...H.bookingSummary(bk), status: bk.status, customer_name: c.customer_name, phone: c.phone, phone2: c.phone2 || '',
    recipients: contactPhones(c), live: LIVE_STATUS.includes(bk.status), past: bk.date < kstToday() }, invite, kakao: await kakaoState(env) });
}

async function create(request, env, H) {
  let d; try { d = await readJson(request, 24 * 1024); } catch (e) { return err(e.message); }
  const code = str(d.booking_code, 20).toUpperCase(), bk = code && await H.booking(env, code);
  if (!bk) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  if (!LIVE_STATUS.includes(bk.status)) return err('확정된 예약에만 초대장을 만들 수 있습니다.', 409, 'NOT_CONFIRMED');
  if (!VENUES[bk.space_id]) return err('메가스팟 건대 1호·2호 예약에만 초대장을 만들 수 있습니다.', 409, 'SPACE');
  const old = await env.DB.prepare('SELECT * FROM invites WHERE booking_code = ?').bind(code).first();
  if (old) return json({ ok: true, existing: true, id: old.id, ...(await links(env, old)) });
  if (bk.date < kstToday()) return err('이미 지난 예약에는 새 초대장을 만들 수 없습니다.', 409, 'PAST');
  const data = cleanInvite(d.data || {}, bk.date); if (data.error) return err(data.error);
  const id = await uniqueRef(env, 'invites', 'id', 'IV');
  let ic = inviteCode();
  for (let i = 0; i < 4 && await env.DB.prepare('SELECT 1 FROM invites WHERE code = ?').bind(ic).first(); i++) ic = inviteCode();
  const ts = now();
  await env.DB.prepare('INSERT INTO invites (id, code, booking_code, space_id, event_date, data, play, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, ic, code, bk.space_id, bk.date, JSON.stringify(data), null, 'active', ts, ts).run();
  await log(env, 'invite.created', code, 'admin', { id, date: bk.date });
  return json({ ok: true, id, ...(await links(env, { id, code: ic })) });
}

async function send(request, env, H) {
  let d; try { d = await readJson(request, 4 * 1024); } catch (e) { return err(e.message); }
  const code = str(d.booking_code, 20).toUpperCase(), c = code && await bookingContacts(env, code);
  if (!c) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const inv = await env.DB.prepare('SELECT * FROM invites WHERE booking_code = ?').bind(code).first();
  if (!inv) return err('초대장을 먼저 만들어 주세요.', 409, 'NO_INVITE');
  const bk = await H.liveBooking(env, inv); if (!bk) return err('예약이 취소되었거나 확정 상태가 아니어서 보낼 수 없습니다.', 410, 'CLOSED');
  const allowed = contactPhones(c);
  const want = [...new Set((Array.isArray(d.receivers) ? d.receivers : []).map(mobilePhone).filter(Boolean))];
  if (!want.length) return err('보낼 번호를 골라 주세요.');
  if (want.some(p => !allowed.includes(p))) return err('예약에 등록된 연락처로만 보낼 수 있습니다. 다른 분께는 초대장 주소를 직접 전해 주세요.', 403, 'NOT_CONTACT');
  const vars = await H.kakaoVars(env, inv, bk, c.customer_name), results = [];
  for (const phone of want) {
    // 두 번 누르는 실수로 같은 번호에 바로 또 가지 않게 합니다
    const recent = await env.DB.prepare("SELECT 1 FROM invite_messages WHERE invite_id = ? AND receiver_hash = ? AND status IN ('sending','accepted','unknown') AND created_at >= datetime('now', '-2 minutes') LIMIT 1")
      .bind(inv.id, await sha256('invite-receiver:' + phone)).first();
    if (recent) { results.push({ receiver: maskPhone(phone), status: 'skipped', note: '2분 안에 이미 보냈습니다.' }); continue; }
    const r = await sendInviteKakao(env, { inviteId: inv.id, bookingCode: code, receiver: phone, name: c.customer_name, vars, actor: 'admin' });
    if (r.error && r.code === 'KAKAO_OFF') return err(r.error, 409, 'KAKAO_OFF');
    results.push(r.error ? { receiver: r.receiver || '', status: 'failed', note: r.error } : { receiver: r.receiver, status: r.status, note: r.note || '' });
  }
  await log(env, 'invite.kakao', code, 'admin', { id: inv.id, results: results.map(x => x.status) });
  return json({ ok: true, results, messages: await inviteMessages(env, inv.id) });
}

async function kakaoGet(env) {
  const { results } = await env.DB.prepare("SELECT receiver_mask, status, error, created_at FROM invite_messages WHERE actor = 'test' ORDER BY id DESC LIMIT 5").all();
  return json({ ok: true, ...(await kakaoState(env)), template: { ...INVITE_TEMPLATE, subject: SUBJECT, vars: TEMPLATE_VARS }, relay_env: 'ALIGO_MEMBER_TEMPLATE_CODES', tests: results || [] });
}
async function kakaoPost(request, env) {
  let d; try { d = await readJson(request, 4 * 1024); } catch (e) { return err(e.message); }
  const a = str(d.action, 20);
  if (a === 'save') { const r = await saveKakaoConfig(env, { code: d.code }); return r.error ? err(r.error) : kakaoGet(env); }
  if (a === 'enable') { const r = await saveKakaoConfig(env, { enabled: d.enabled === true }); return r.error ? err(r.error, 409) : kakaoGet(env); }
  if (a === 'check') { const r = await checkTemplate(env); return json({ ok: true, check: r, ...(await kakaoState(env)) }); }
  if (a === 'confirm') { const r = await markTested(env); return r.error ? err(r.error, 409) : kakaoGet(env); }
  if (a === 'test') {
    const phone = mobilePhone(d.receiver); if (!phone) return err('시험 메시지를 받을 운영자 휴대폰 번호를 적어 주세요.');
    const st = await kakaoState(env);
    if (!st.live) return err('서버의 알림톡 발송이 꺼져 있습니다. 발송 설정을 확인해 주세요.', 409, 'KAKAO_OFF');
    if (!st.approved) return err('승인 확인을 먼저 통과해야 시험 발송을 할 수 있습니다.', 409, 'KAKAO_OFF');
    if (await tooMany(env, 'inv-kakao-test', 1, 1)) return err('시험 발송은 1분에 한 번만 할 수 있습니다.', 429, 'TOO_MANY');
    try { await hit(env, 'inv-kakao-test', 1); } catch {}
    const r = await sendInviteKakao(env, { receiver: phone, name: '운영자', vars: sampleVars(kstToday(14)), actor: 'test', test: true });
    if (r.error) return err(r.error, r.status || 400, r.code || 'SEND_FAILED');
    await log(env, 'invite.kakao_test', '', 'admin', { status: r.status });
    return json({ ok: true, result: r, ...(await kakaoState(env)) });
  }
  return err('알 수 없는 요청입니다.');
}

export async function inviteAdmin({ request, env, url, seg, method, helpers }) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const route = seg[0] || '';
  if (method === 'GET' && route === 'list') return list(env, url);
  if (method === 'GET' && route === 'detail') return detail(env, url, helpers);
  if (method === 'POST' && route === 'create') return create(request, env, helpers);
  if (method === 'POST' && route === 'send') return send(request, env, helpers);
  if (method === 'GET' && route === 'kakao') return kakaoGet(env);
  if (method === 'POST' && route === 'kakao') return kakaoPost(request, env);
  return err('찾을 수 없는 요청입니다.', 404, 'NOT_FOUND');
}
