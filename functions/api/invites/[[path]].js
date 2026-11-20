// 모임 키트 — 초대장 API (2026-11-21)
//  GET  /api/invites/view?c=코드                    참석자용 초대장
//  GET  /api/invites/rsvp?c=코드&t=내키              내가 보낸 응답 (고치기용)
//  POST /api/invites/rsvp                           참석 응답 보내기·고치기 { c, t, name, status, party, cars, answer, agree }
//  POST /api/invites/verify                         예약 확인 { booking_code, phone_last4 } → 예약 요약 + 이미 만든 초대장
//  POST /api/invites/create                         초대장 만들기 { booking_code, phone_last4, ...내용 }
//  GET  /api/invites/manage?id=&k=                  주최자 화면 (응답 명단)
//  POST /api/invites/manage                         주최자 화면 { id, k, action: update | remove | delete, ... }
//  GET  /api/invites/screen?id=&s=                  스크린 도구용 (행사 정보 · 참석 응답한 이름 · 준비 내용)
//  POST /api/invites/screen                         스크린 준비 내용 저장 { id, s, play }
import { json, err, hasDb, readJson, str, num, now, uniqueRef, log, clientIp, tooMany, hit, kstToday, sameOrigin, sha256 } from '../_lib.js';
import { inviteCode, keyOk, links, cleanInvite, cleanRsvp, cleanPlay, parse, publicInvite, summarize, purge, phaseOf, rsvpOpen,
  VENUES, MAX_RSVPS } from '../_invites.js';

const BK = 'booking_code, space_id, phone_last4, date, start_h, end_h, headcount, status';
const tooManyErr = () => err('짧은 시간에 너무 많은 요청이 들어왔습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
async function limited(env, key, n, min) { try { if (await tooMany(env, key, n, min)) return true; await hit(env, key, min); } catch {} return false; }
const booking = (env, code) => env.DB.prepare(`SELECT ${BK} FROM bookings WHERE booking_code = ?`).bind(code).first();
const inviteByCode = (env, code) => env.DB.prepare('SELECT * FROM invites WHERE code = ?').bind(code).first();
const inviteById = (env, id) => env.DB.prepare('SELECT * FROM invites WHERE id = ?').bind(id).first();
const LIVE = ['confirmed', 'completed'];

function bookingSummary(bk) {
  return { code: bk.booking_code, space_id: bk.space_id, space_name: (VENUES[bk.space_id] || {}).name || '메가스팟', date: bk.date,
    start_h: bk.start_h ?? null, end_h: bk.end_h ?? null, headcount: bk.headcount ?? null };
}
// 초대장이 가리키는 예약이 아직 살아 있는지 확인하고, 이용일이 바뀌었으면 보관 기간 계산용 날짜도 맞춥니다
async function liveBooking(env, inv) {
  const bk = await booking(env, inv.booking_code);
  if (!bk || !LIVE.includes(bk.status)) return null;
  if (bk.date !== inv.event_date || bk.space_id !== inv.space_id) {
    try { await env.DB.prepare('UPDATE invites SET event_date = ?, space_id = ? WHERE id = ?').bind(bk.date, bk.space_id, inv.id).run(); } catch {}
  }
  return bk;
}
async function checkBooking(env, request, d) {
  const code = str(d.booking_code, 20).toUpperCase(), last4 = str(d.phone_last4, 4).replace(/\D/g, '');
  if (!code || last4.length !== 4) return { error: err('예약번호와 예약자 휴대폰 뒷 4자리를 확인해 주세요.') };
  if (await limited(env, 'inv-verify:' + clientIp(request), 12, 10)) return { error: tooManyErr() };
  const bk = await booking(env, code);
  if (!bk || bk.phone_last4 !== last4) return { error: err('예약을 찾지 못했습니다. 예약번호와 예약자 휴대폰 뒷 4자리를 확인해 주세요.', 404, 'NOT_FOUND') };
  if (bk.status === 'cancelled') return { error: err('취소된 예약에는 초대장을 만들 수 없습니다.', 410, 'CANCELLED') };
  if (!LIVE.includes(bk.status)) return { error: err('예약이 확정된 뒤에 초대장을 만들 수 있습니다. 확정 안내를 받으신 뒤 다시 시도해 주세요.', 409, 'NOT_CONFIRMED') };
  return { bk };
}

async function view(env, url) {
  const code = str(url.searchParams.get('c'), 20).toLowerCase();
  if (!code) return err('초대장 주소를 다시 확인해 주세요.', 400, 'BAD_LINK');
  try { await purge(env); } catch {}
  const inv = await inviteByCode(env, code);
  if (!inv || inv.status !== 'active') return err('초대장을 찾을 수 없습니다. 주소가 바뀌었거나 보관 기간이 끝났을 수 있습니다.', 404, 'NOT_FOUND');
  const bk = await liveBooking(env, inv);
  if (!bk) return err('이 초대장은 더 이상 열 수 없습니다. 주최자에게 문의해 주세요.', 410, 'CLOSED');
  return json({ ok: true, invite: publicInvite(inv, parse(inv.data), bk) });
}

async function myRsvp(env, url) {
  const code = str(url.searchParams.get('c'), 20).toLowerCase(), t = str(url.searchParams.get('t'), 64);
  if (!code || t.length < 16) return json({ ok: true, mine: null });
  const inv = await inviteByCode(env, code); if (!inv) return json({ ok: true, mine: null });
  const r = await env.DB.prepare('SELECT name, status, party, cars, answer, updated_at, created_at FROM invite_rsvps WHERE invite_id = ? AND token_hash = ?').bind(inv.id, await sha256(t)).first();
  return json({ ok: true, mine: r || null });
}

async function rsvp(request, env) {
  let d; try { d = await readJson(request, 8 * 1024); } catch (e) { return err(e.message); }
  if (d.website) return json({ ok: true });
  const code = str(d.c, 20).toLowerCase(), t = str(d.t, 64);
  if (!code || t.length < 16) return err('초대장 주소를 다시 확인해 주세요.', 400, 'BAD_LINK');
  // 회사 사무실처럼 여러 사람이 같은 인터넷 주소로 응답하는 경우를 생각해 넉넉하게 둡니다
  if (await limited(env, 'inv-rsvp:' + code + ':' + clientIp(request), 150, 10)) return tooManyErr();
  const inv = await inviteByCode(env, code);
  if (!inv || inv.status !== 'active') return err('초대장을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const bk = await liveBooking(env, inv); if (!bk) return err('이 초대장은 더 이상 응답을 받지 않습니다.', 410, 'CLOSED');
  const data = parse(inv.data);
  if (!rsvpOpen(data, phaseOf(bk.date, bk.end_h))) return err('참석 응답을 받는 기간이 끝났습니다. 주최자에게 직접 알려 주세요.', 409, 'RSVP_CLOSED');
  if (!d.agree) return err('응답 내용을 주최자에게 전달하는 데 동의해 주세요.');
  const r = cleanRsvp(d, data); if (r.error) return err(r.error);
  const th = await sha256(t), ts = now();
  const prev = await env.DB.prepare('SELECT id FROM invite_rsvps WHERE invite_id = ? AND token_hash = ?').bind(inv.id, th).first();
  if (prev) {
    await env.DB.prepare('UPDATE invite_rsvps SET name = ?, status = ?, party = ?, cars = ?, answer = ?, updated_at = ? WHERE id = ?')
      .bind(r.name, r.status, r.party, r.cars, r.answer, ts, prev.id).run();
  } else {
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM invite_rsvps WHERE invite_id = ?').bind(inv.id).first();
    if ((c && c.n) >= MAX_RSVPS) return err('응답이 너무 많아 더 받을 수 없습니다. 주최자에게 직접 알려 주세요.', 409, 'FULL');
    await env.DB.prepare('INSERT INTO invite_rsvps (invite_id, token_hash, name, status, party, cars, answer, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(inv.id, th, r.name, r.status, r.party, r.cars, r.answer, ts, ts).run();
  }
  return json({ ok: true, mine: { ...r, updated_at: ts }, updated: !!prev });
}

async function verify(request, env) {
  let d; try { d = await readJson(request, 4 * 1024); } catch (e) { return err(e.message); }
  const c = await checkBooking(env, request, d); if (c.error) return c.error;
  const inv = await env.DB.prepare('SELECT * FROM invites WHERE booking_code = ?').bind(c.bk.booking_code).first();
  if (inv) return json({ ok: true, booking: bookingSummary(c.bk), existing: { id: inv.id, title: parse(inv.data).title || '', ...(await links(env, inv)) } });
  if (c.bk.date < kstToday()) return err('이미 지난 예약에는 새 초대장을 만들 수 없습니다.', 409, 'PAST');
  return json({ ok: true, booking: bookingSummary(c.bk), existing: null });
}

async function create(request, env) {
  let d; try { d = await readJson(request, 24 * 1024); } catch (e) { return err(e.message); }
  const c = await checkBooking(env, request, d); if (c.error) return c.error;
  const bk = c.bk;
  const old = await env.DB.prepare('SELECT * FROM invites WHERE booking_code = ?').bind(bk.booking_code).first();
  if (old) return json({ ok: true, existing: true, id: old.id, ...(await links(env, old)) });
  if (bk.date < kstToday()) return err('이미 지난 예약에는 새 초대장을 만들 수 없습니다.', 409, 'PAST');
  const data = cleanInvite(d, bk.date); if (data.error) return err(data.error);
  const id = await uniqueRef(env, 'invites', 'id', 'IV');
  let code = inviteCode();
  for (let i = 0; i < 4 && await inviteByCode(env, code); i++) code = inviteCode();
  const ts = now();
  await env.DB.prepare('INSERT INTO invites (id, code, booking_code, space_id, event_date, data, play, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, code, bk.booking_code, bk.space_id, bk.date, JSON.stringify(data), null, 'active', ts, ts).run();
  await log(env, 'invite.created', bk.booking_code, 'customer', { id, date: bk.date });
  return json({ ok: true, id, ...(await links(env, { id, code })) });
}

async function manageGet(env, url, request) {
  const id = str(url.searchParams.get('id'), 20).toUpperCase(), k = str(url.searchParams.get('k'), 40);
  const ipKey = 'inv-manage:' + clientIp(request);
  try { if (await tooMany(env, ipKey, 30, 10)) return tooManyErr(); } catch {}
  if (!(await keyOk(env, id, k))) { try { await hit(env, ipKey, 10); } catch {} return err('관리 링크가 올바르지 않습니다. 예약번호와 휴대폰 뒷 4자리로 다시 열어 주세요.', 403, 'BAD_KEY'); }
  try { await purge(env); } catch {}
  const inv = await inviteById(env, id);
  if (!inv) return err('초대장을 찾을 수 없습니다. 보관 기간이 끝났을 수 있습니다.', 404, 'NOT_FOUND');
  const bk = await liveBooking(env, inv);
  const data = parse(inv.data);
  const { results } = await env.DB.prepare('SELECT id, name, status, party, cars, answer, created_at, updated_at FROM invite_rsvps WHERE invite_id = ? ORDER BY created_at')
    .bind(inv.id).all();
  const rows = results || [];
  return json({ ok: true, id: inv.id, data, booking: bk ? bookingSummary(bk) : null, closed: !bk,
    invite: bk ? publicInvite(inv, data, bk) : null, rsvps: rows, summary: summarize(rows), ...(await links(env, inv)) });
}

async function managePost(request, env) {
  let d; try { d = await readJson(request, 24 * 1024); } catch (e) { return err(e.message); }
  const id = str(d.id, 20).toUpperCase();
  if (!(await keyOk(env, id, str(d.k, 40)))) return err('관리 링크가 올바르지 않습니다.', 403, 'BAD_KEY');
  const inv = await inviteById(env, id); if (!inv) return err('초대장을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const ts = now();
  if (d.action === 'update') {
    const bk = await liveBooking(env, inv); if (!bk) return err('예약이 취소되었거나 확인되지 않아 고칠 수 없습니다.', 410, 'CLOSED');
    const data = cleanInvite(d.data || {}, bk.date); if (data.error) return err(data.error);
    await env.DB.prepare('UPDATE invites SET data = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(data), ts, id).run();
    return json({ ok: true, data });
  }
  if (d.action === 'remove') {
    const rid = num(d.rsvp_id); if (!rid) return err('지울 응답을 골라 주세요.');
    await env.DB.prepare('DELETE FROM invite_rsvps WHERE id = ? AND invite_id = ?').bind(rid, id).run();
    return json({ ok: true });
  }
  if (d.action === 'delete') {
    await env.DB.prepare('DELETE FROM invite_rsvps WHERE invite_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM invites WHERE id = ?').bind(id).run();
    await log(env, 'invite.deleted', inv.booking_code, 'customer', { id });
    return json({ ok: true, deleted: true });
  }
  return err('알 수 없는 요청입니다.');
}

async function screenGet(env, url) {
  const id = str(url.searchParams.get('id'), 20).toUpperCase();
  if (!(await keyOk(env, id, str(url.searchParams.get('s'), 40), 'screen'))) return err('스크린 연결 주소가 올바르지 않습니다.', 403, 'BAD_KEY');
  const inv = await inviteById(env, id); if (!inv) return err('행사 정보를 찾을 수 없습니다. 보관 기간이 끝났을 수 있습니다.', 404, 'NOT_FOUND');
  const bk = await liveBooking(env, inv); if (!bk) return err('예약이 취소되었거나 확인되지 않습니다.', 410, 'CLOSED');
  const data = parse(inv.data);
  // 스크린에는 ‘참석’으로 응답한 이름만 넘깁니다 (인원·차량·답변은 넘기지 않음)
  const { results } = await env.DB.prepare("SELECT name, party FROM invite_rsvps WHERE invite_id = ? AND status = 'yes' ORDER BY created_at").bind(id).all();
  const rows = results || [];
  return json({ ok: true, id, invite: publicInvite(inv, data, bk), attendees: rows.map(r => r.name), people: rows.reduce((a, r) => a + (r.party || 0), 0),
    play: cleanPlay(parse(inv.play)), public_url: '/invite/?c=' + inv.code });
}

async function screenPost(request, env) {
  let d; try { d = await readJson(request, 72 * 1024); } catch (e) { return err(e.message); }
  const id = str(d.id, 20).toUpperCase();
  if (!(await keyOk(env, id, str(d.s, 40), 'screen'))) return err('스크린 연결 주소가 올바르지 않습니다.', 403, 'BAD_KEY');
  if (await limited(env, 'inv-screen:' + id, 120, 10)) return tooManyErr();
  const inv = await inviteById(env, id); if (!inv) return err('행사 정보를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const play = cleanPlay(d.play);
  const body = JSON.stringify(play);
  if (body.length > 64 * 1024) return err('준비 내용이 너무 많습니다. 문제 수를 줄여 주세요.');
  await env.DB.prepare('UPDATE invites SET play = ?, updated_at = ? WHERE id = ?').bind(body, now(), id).run();
  return json({ ok: true, play });
}

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const url = new URL(request.url);
  const seg = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean);
  const route = seg[0] || '', m = request.method;
  if (m === 'POST' && !sameOrigin(request)) return err('잘못된 요청입니다.', 403, 'ORIGIN');
  try {
    if (m === 'GET' && route === 'view') return await view(env, url);
    if (m === 'GET' && route === 'rsvp') return await myRsvp(env, url);
    if (m === 'POST' && route === 'rsvp') return await rsvp(request, env);
    if (m === 'POST' && route === 'verify') return await verify(request, env);
    if (m === 'POST' && route === 'create') return await create(request, env);
    if (m === 'GET' && route === 'manage') return await manageGet(env, url, request);
    if (m === 'POST' && route === 'manage') return await managePost(request, env);
    if (m === 'GET' && route === 'screen') return await screenGet(env, url);
    if (m === 'POST' && route === 'screen') return await screenPost(request, env);
  } catch (e) {
    return err('처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER');
  }
  return err('찾을 수 없는 요청입니다.', 404, 'NOT_FOUND');
}
