// 공간대관 계약서 API (2026-11-24) — 설명은 functions/api/_contracts.js
//  고객 (링크 열쇠 필요)
//  GET  /api/contracts/view?id=&k=              계약서 · 서명 상태 · 운영자 도장 · 모임 초대장(예약이 있으면)
//  POST /api/contracts/sign   { id, k, renter, signer?, agree, signature? }   대관자 정보 확인 → '확인'으로 계약 완료 (한 번만)
//                              서명 그림은 선택입니다. 없으면 서명한 분 이름(기본: 대표자·담당자)이 전자 서명으로 들어갑니다.
//  POST /api/contracts/invite { id, k, data }   계약서 화면에서 모임 초대장 만들기 (확정 예약만, 예약 1건에 1장)
//  관리자 (/api/contracts/admin/*)
//  GET  list?status=&q=          계약서 목록           GET  sources?q=         불러올 예약·문의 찾기
//  GET  prefill?booking_code=|inquiry_ref=              GET  detail?id=         계약서 · 링크 · 보낸 기록
//  POST save { id?, data, inquiry_ref? }   POST void { id }   POST relink { id }   POST sent { id }(링크 복사·직접 전달 표시)
//  POST send { id, channel: kakao|email, receivers? }  GET/POST settings   POST seal { image }   GET/POST kakao { action }
import { json, err, hasDb, readJson, str, now, uniqueRef, log, clientIp, tooMany, hit, kstToday, sameOrigin, requireAdmin, getCookie, sha256 } from '../_lib.js';
import { STATUS, validId, keyOk, linkOf, linkKey, contractSettings, saveSettings, sealImage, saveSeal, pngError, cleanRenter, cleanContract, contractError, prefillFrom,
  publicContract, docHash, purgeContracts, kstTime, contractKakao, contractVars, sampleContractVars, CONTRACT_TEMPLATE, CONTRACT_SUBJECT, emailReady, contractEmail, sendEmail } from '../_contracts.js';
import { cleanInvite, inviteCode, links, parse, publicInvite, VENUES, LIVE_STATUS, shiftDate } from '../_invites.js';
import { customerKakao } from '../_invite_kakao.js';
import { bookingHourSql } from '../_booking_availability.js';
import { bookingContacts, contactPhones, mobilePhone, bookingPhone2Sql } from '../_contacts.js';
import { templateVars, maskPhone } from '../_custom_alimtalk.js';
import CD from '../../../assets/js/kit/contract-doc.js';

const tooManyErr = () => err('짧은 시간에 너무 많은 요청이 들어왔습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
async function limited(env, key, n, min) { try { if (await tooMany(env, key, n, min)) return true; await hit(env, key, min); } catch {} return false; }
const byId = (env, id) => env.DB.prepare('SELECT * FROM rental_contracts WHERE id = ?').bind(id).first();
const BK_SQL = `SELECT b.booking_code, b.space_id, b.customer_name, b.phone, b.phone_last4, b.date, b.headcount, b.status, b.amount, b.inquiry_ref, b.confirm_doc,
  ${bookingHourSql('b', 'i', 'start_h')} AS start_h, ${bookingHourSql('b', 'i', 'end_h')} AS end_h FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref`;
const booking = (env, code) => env.DB.prepare(BK_SQL + ' WHERE b.booking_code = ?').bind(code).first();
async function isAdmin(request, env) { try { return !!getCookie(request, 'ms_admin') && !(await requireAdmin(request, env)); } catch { return false; } }

// 링크로 연 계약서 (id · k 확인)
async function opened(env, request, id, k) {
  id = str(id, 20).toUpperCase(); k = str(k, 40);
  const ipKey = 'ct-open:' + clientIp(request);
  try { if (await tooMany(env, ipKey, 40, 10)) return { error: tooManyErr() }; } catch {}
  const row = validId(id) ? await byId(env, id) : null;
  if (!row || !(await keyOk(env, row, k))) { try { await hit(env, ipKey, 10); } catch {} return { error: err('계약서 링크가 올바르지 않거나 바뀌었습니다. 메가스팟에서 받은 최신 링크로 열어 주세요.', 403, 'BAD_LINK') }; }
  return { row };
}
async function inviteFor(env, row) {
  const code = parse(row.data).booking_code || row.booking_code;
  if (!code) return { available: false, reason: '예약이 확정되면 모임 초대장을 만들 수 있습니다.' };
  const bk = await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.date, ${bookingHourSql('b', 'i', 'start_h')} AS start_h, ${bookingHourSql('b', 'i', 'end_h')} AS end_h, b.headcount, b.status FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref WHERE b.booking_code = ?`).bind(code).first();
  if (!bk || !LIVE_STATUS.includes(bk.status) || !VENUES[bk.space_id]) return { available: false, reason: '예약이 확정되면 모임 초대장을 만들 수 있습니다.' };
  const inv = await env.DB.prepare('SELECT * FROM invites WHERE booking_code = ?').bind(code).first();
  if (!inv) return { available: bk.date >= kstToday(), reason: bk.date < kstToday() ? '지난 예약에는 새 초대장을 만들 수 없습니다.' : '', invite: null, booking: { date: bk.date, start_h: bk.start_h, end_h: bk.end_h, space_name: VENUES[bk.space_id].name } };
  const data = parse(inv.data);
  return { available: true, invite: publicInvite(inv, data, bk), title: data.title || '', ...(await links(env, inv)), kakao: await customerKakao(env) };
}

async function view(request, env, url) {
  const o = await opened(env, request, url.searchParams.get('id'), url.searchParams.get('k')); if (o.error) return o.error;
  let row = o.row;
  if (row.status === 'ready' && !row.viewed_at && !(await isAdmin(request, env))) {
    try { await env.DB.prepare('UPDATE rental_contracts SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL').bind(now(), row.id).run(); } catch {}
  }
  return json({ ok: true, contract: publicContract(row), seal: await sealImage(env), invite: row.status === 'void' ? null : await inviteFor(env, row) });
}

async function sign(request, env) {
  let d; try { d = await readJson(request, 240 * 1024); } catch (e) { return err(e.message); }
  const o = await opened(env, request, d.id, d.k); if (o.error) return o.error;
  const row = o.row;
  if (row.status === 'signed') return err('이미 서명을 마친 계약서입니다. 화면을 새로 열어 주세요.', 409, 'SIGNED');
  if (row.status !== 'ready') return err('취소된 계약서입니다. 메가스팟에 문의해 주세요.', 410, 'VOID');
  if (await limited(env, 'ct-sign:' + row.id, 10, 60)) return tooManyErr();
  const data = parse(row.data);
  if (data.booking_code) { const b = await env.DB.prepare('SELECT status FROM bookings WHERE booking_code = ?').bind(data.booking_code).first(); if (b && b.status === 'cancelled') return err('예약이 취소되어 서명할 수 없습니다. 메가스팟에 문의해 주세요.', 410, 'CANCELLED'); }
  const renter = cleanRenter({ ...data.renter, ...(d.renter || {}) });
  if (!renter.name) return err('대관자 상호·성명을 적어 주세요.');
  if (!renter.rep) return err('대표자·담당자 이름을 적어 주세요.');
  if (String(renter.phone).replace(/\D/g, '').length < 9) return err('대관자 연락처를 확인해 주세요.');
  if (renter.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(renter.email)) return err('이메일 주소를 확인해 주세요.');
  const signer = (str(d.signer, 30) || renter.rep).replace(/\s+/g, ' ').trim();
  if (signer.length < 2) return err('서명하는 분의 이름을 적어 주세요.');
  if (d.agree !== true) return err('계약 내용을 확인하고 동의해 주세요.');
  const signature = d.signature ? String(d.signature) : '';
  if (signature) { const bad = pngError(signature, 200000); if (bad) return err(bad); }
  const at = now(), hash = await docHash(row, renter, signer, at, signature);
  const r = await env.DB.prepare("UPDATE rental_contracts SET status = 'signed', renter = ?, signer = ?, signature = ?, signed_at = ?, signed_ip = ?, signed_ua = ?, doc_hash = ?, terms_version = ?, updated_at = ? WHERE id = ? AND status = 'ready' AND link_ver = ?")
    .bind(JSON.stringify(renter), signer, signature || null, at, clientIp(request).slice(0, 64), str(request.headers.get('user-agent'), 200), hash, CD.TERMS_VERSION, at, row.id, row.link_ver).run();
  if (!Number(r.meta?.changes ?? r.changes)) return err('계약서가 바뀌었습니다. 화면을 새로 열어 주세요.', 409, 'CHANGED');
  await log(env, 'contract.signed', row.booking_code || row.id, 'customer', { id: row.id });
  const fresh = await byId(env, row.id);
  return json({ ok: true, contract: publicContract(fresh) });
}

// 계약서 링크로 모임 초대장 만들기 (링크가 예약자 확인을 대신합니다)
async function makeInvite(request, env) {
  let d; try { d = await readJson(request, 24 * 1024); } catch (e) { return err(e.message); }
  const o = await opened(env, request, d.id, d.k); if (o.error) return o.error;
  if (o.row.status === 'void') return err('취소된 계약서입니다.', 410, 'VOID');
  const code = parse(o.row.data).booking_code || o.row.booking_code;
  const bk = code && await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.date, b.status FROM bookings b WHERE b.booking_code = ?`).bind(code).first();
  if (!bk || !LIVE_STATUS.includes(bk.status) || !VENUES[bk.space_id]) return err('예약이 확정되면 모임 초대장을 만들 수 있습니다.', 409, 'NOT_CONFIRMED');
  const old = await env.DB.prepare('SELECT * FROM invites WHERE booking_code = ?').bind(code).first();
  if (!old) {
    if (bk.date < kstToday()) return err('지난 예약에는 새 초대장을 만들 수 없습니다.', 409, 'PAST');
    if (await limited(env, 'ct-invite:' + o.row.id, 10, 60)) return tooManyErr();
    const data = cleanInvite(d.data || {}, bk.date); if (data.error) return err(data.error);
    const id = await uniqueRef(env, 'invites', 'id', 'IV');
    let ic = inviteCode();
    for (let i = 0; i < 4 && await env.DB.prepare('SELECT 1 FROM invites WHERE code = ?').bind(ic).first(); i++) ic = inviteCode();
    const ts = now();
    await env.DB.prepare('INSERT INTO invites (id, code, booking_code, space_id, event_date, data, play, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, ic, code, bk.space_id, bk.date, JSON.stringify(data), null, 'active', ts, ts).run();
    await log(env, 'invite.created', code, 'customer', { id, date: bk.date, from: 'contract' });
  }
  return json({ ok: true, invite: await inviteFor(env, o.row) });
}

// ---------- 관리자 ----------
async function list(env, url) {
  try { await purgeContracts(env); } catch {}
  const st = str(url.searchParams.get('status'), 10), q = str(url.searchParams.get('q'), 40).toLowerCase(), qd = q.replace(/\D/g, '');
  const { results } = await env.DB.prepare(`SELECT id, booking_code, inquiry_ref, status, data, renter, signer, signed_at, viewed_at, sent_at, event_date, created_at, updated_at,
      (SELECT MAX(m.created_at) FROM contract_messages m WHERE m.contract_id = rental_contracts.id AND m.status IN ('accepted','unknown')) AS last_kakao
    FROM rental_contracts ${STATUS[st] ? 'WHERE status = ?' : ''} ORDER BY CASE status WHEN 'ready' THEN 0 WHEN 'signed' THEN 1 ELSE 2 END, event_date DESC, created_at DESC LIMIT 300`).bind(...(STATUS[st] ? [st] : [])).all();
  let rows = (results || []).map(r => { const d = parse(r.data), rr = r.renter ? parse(r.renter) : d.renter || {}; return { id: r.id, status: r.status, status_label: STATUS[r.status], booking_code: d.booking_code || r.booking_code || '', inquiry_ref: r.inquiry_ref || '',
    renter: rr.name || '', rep: rr.rep || '', phone: rr.phone || '', space: CD.SPACES[d.space] || '', date: d.date || '', start: d.start || '', end: d.end || '', event: d.event || '', total: CD.totals(d.fee).total,
    viewed_at: r.viewed_at, sent_at: r.sent_at || r.last_kakao || null, signed_at: r.signed_at ? kstTime(r.signed_at) : '', signer: r.signer || '', created_at: r.created_at }; });
  if (q) rows = rows.filter(r => [r.id, r.booking_code, r.inquiry_ref, r.renter, r.rep, r.event].some(v => String(v).toLowerCase().includes(q)) || (qd.length >= 4 && r.phone.replace(/\D/g, '').includes(qd)));
  const counts = { ready: 0, signed: 0, void: 0 }; for (const r of results || []) if (counts[r.status] != null) counts[r.status]++;
  return json({ ok: true, items: rows, counts });
}
async function sources(env, url) {
  const q = str(url.searchParams.get('q'), 40), qd = q.replace(/\D/g, ''), today = kstToday();
  let bk, iq;
  if (!q) {
    bk = (await env.DB.prepare(BK_SQL + ` WHERE b.status IN ('confirmed','completed','payment_review') AND b.space_id IN ('megaspot-gundae','megaspot-gundae-2') AND b.date >= ? ORDER BY b.date, start_h LIMIT 40`).bind(shiftDate(today, -7)).all()).results;
    iq = (await env.DB.prepare(`SELECT ref, space_id, status, name, phone, email, event_date, headcount, data, created_at FROM inquiries WHERE created_at >= ? AND status NOT LIKE '%취소%' ORDER BY created_at DESC LIMIT 30`).bind(shiftDate(today, -45) + ' 00:00:00').all()).results;
  } else {
    const like = '%' + q + '%';
    bk = (await env.DB.prepare(BK_SQL + ` WHERE b.space_id IN ('megaspot-gundae','megaspot-gundae-2') AND (b.booking_code LIKE ? OR b.customer_name LIKE ? OR b.inquiry_ref LIKE ? OR (? <> '' AND REPLACE(b.phone,'-','') LIKE ?)) ORDER BY b.date DESC LIMIT 30`)
      .bind(like, like, like, qd.length >= 4 ? qd : '', '%' + qd + '%').all()).results;
    iq = (await env.DB.prepare(`SELECT ref, space_id, status, name, phone, email, event_date, headcount, data, created_at FROM inquiries WHERE ref LIKE ? OR name LIKE ? OR email LIKE ? OR (? <> '' AND REPLACE(phone,'-','') LIKE ?) ORDER BY created_at DESC LIMIT 30`)
      .bind(like, like, like, qd.length >= 4 ? qd : '', '%' + qd + '%').all()).results;
  }
  const taken = new Set(((await env.DB.prepare("SELECT booking_code FROM rental_contracts WHERE status <> 'void' AND booking_code IS NOT NULL").all()).results || []).map(r => r.booking_code));
  return json({ ok: true,
    bookings: (bk || []).map(b => ({ booking_code: b.booking_code, name: b.customer_name, phone: b.phone, space: CD.SPACES[b.space_id] || b.space_id, date: b.date, start_h: b.start_h, end_h: b.end_h, headcount: b.headcount, status: b.status, inquiry_ref: b.inquiry_ref || '', has_contract: taken.has(b.booking_code) })),
    inquiries: (iq || []).map(r => { const d = parse(r.data); return { ref: r.ref, name: r.name, phone: r.phone, space: CD.SPACES[r.space_id] || r.space_id, date: r.event_date || d.date || '', headcount: r.headcount, status: r.status, org: d.org || '', created_at: r.created_at }; }) });
}
async function prefill(env, url) {
  const code = str(url.searchParams.get('booking_code'), 20).toUpperCase(), ref = str(url.searchParams.get('inquiry_ref'), 20).toUpperCase(), settings = await contractSettings(env);
  let b = null, q = null;
  if (code) { b = await booking(env, code); if (!b) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND'); if (b.inquiry_ref) q = await env.DB.prepare('SELECT * FROM inquiries WHERE ref = ?').bind(b.inquiry_ref).first(); }
  else if (ref) { q = await env.DB.prepare('SELECT * FROM inquiries WHERE ref = ?').bind(ref).first(); if (!q) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    b = await env.DB.prepare(BK_SQL + " WHERE b.inquiry_ref = ? AND b.status <> 'cancelled' ORDER BY b.date LIMIT 1").bind(ref).first(); }
  const data = prefillFrom({ booking: b, inquiry: q, settings });
  if (!code && !ref) { data.fee.methods = settings.methods; data.fee.bank = settings.bank; data.fee.balance_days = settings.balance_days; }
  const active = data.booking_code ? await env.DB.prepare("SELECT id FROM rental_contracts WHERE booking_code = ? AND status <> 'void' LIMIT 1").bind(data.booking_code).first() : null;
  return json({ ok: true, data, inquiry_ref: (q && q.ref) || (b && b.inquiry_ref) || '', existing: active ? active.id : null });
}
async function detail(env, url) {
  const id = str(url.searchParams.get('id'), 20).toUpperCase(), row = validId(id) && await byId(env, id);
  if (!row) return err('계약서를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  const data = parse(row.data), recips = await receivers(env, row, data);
  return json({ ok: true, contract: { ...publicContract(row), signed_ip: row.signed_ip || '', signed_ua: row.signed_ua || '', inquiry_ref: row.inquiry_ref || '' }, link: await linkOf(env, row),
    messages: await contractKakao.messages(env, row.id), recipients: recips, email: { ready: emailReady(env), to: (publicContract(row).data.renter || {}).email || '' }, kakao: await contractKakao.state(env) });
}
// 카카오톡을 보낼 수 있는 번호: 예약의 대표·추가 연락처, 연결된 문의 연락처, 계약서의 대관자 연락처
async function receivers(env, row, data) {
  const out = [];
  const add = (p, label) => { const m = mobilePhone(p); if (m && !out.some(x => x.phone === m)) out.push({ phone: m, label }); };
  const code = data.booking_code || row.booking_code;
  if (code) { const c = await bookingContacts(env, code); if (c) { add(c.phone, '예약 대표 연락처'); add(c.phone2, '예약 추가 연락처'); } }
  if (row.inquiry_ref) { const q = await env.DB.prepare('SELECT phone FROM inquiries WHERE ref = ?').bind(row.inquiry_ref).first(); if (q) add(q.phone, '문의 연락처'); }
  add((data.renter || {}).phone, '계약서 대관자 연락처');
  return out;
}
async function save(request, env) {
  let d; try { d = await readJson(request, 32 * 1024); } catch (e) { return err(e.message); }
  const c = cleanContract(d.data); const bad = contractError(c); if (bad) return err(bad);
  const settings = await contractSettings(env), id = str(d.id, 20).toUpperCase(), ts = now();
  if (c.booking_code) {
    const b = await env.DB.prepare('SELECT booking_code FROM bookings WHERE booking_code = ?').bind(c.booking_code).first();
    if (!b) return err('예약번호 ' + c.booking_code + '을(를) 찾을 수 없습니다. 예약번호를 비우거나 바로 적어 주세요.', 404, 'NO_BOOKING');
    const dup = await env.DB.prepare("SELECT id FROM rental_contracts WHERE booking_code = ? AND status <> 'void' AND id <> ? LIMIT 1").bind(c.booking_code, id || '').first();
    if (dup) return err('이 예약에는 이미 계약서(' + dup.id + ')가 있습니다. 그 계약서를 고치거나 취소한 뒤 새로 만들어 주세요.', 409, 'DUPLICATE');
  }
  const full = { ...c, operator: settings.operator };
  if (id) {
    const row = validId(id) && await byId(env, id); if (!row) return err('계약서를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    if (row.status !== 'ready') return err(row.status === 'signed' ? '서명을 마친 계약서는 고칠 수 없습니다. 바꿀 내용이 있으면 취소하고 새로 만들어 주세요.' : '취소한 계약서는 고칠 수 없습니다.', 409, 'LOCKED');
    full.operator = parse(row.data).operator || settings.operator;
    await env.DB.prepare('UPDATE rental_contracts SET data = ?, booking_code = ?, event_date = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(full), c.booking_code || null, c.date, ts, id).run();
    await log(env, 'contract.updated', c.booking_code || id, 'admin', { id });
    return json({ ok: true, id, link: await linkOf(env, await byId(env, id)) });
  }
  const nid = await uniqueRef(env, 'rental_contracts', 'id', 'RC');
  const ref = str(d.inquiry_ref, 20).toUpperCase() || null;
  await env.DB.prepare('INSERT INTO rental_contracts (id, booking_code, inquiry_ref, status, link_ver, data, terms_version, event_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(nid, c.booking_code || null, ref, 'ready', 1, JSON.stringify(full), CD.TERMS_VERSION, c.date, ts, ts).run();
  await log(env, 'contract.created', c.booking_code || nid, 'admin', { id: nid });
  return json({ ok: true, id: nid, link: await linkOf(env, { id: nid, link_ver: 1 }) });
}
async function adminAction(request, env, action) {
  let d; try { d = await readJson(request, 8 * 1024); } catch (e) { return err(e.message); }
  const id = str(d.id, 20).toUpperCase(), row = validId(id) && await byId(env, id);
  if (!row) return err('계약서를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  if (action === 'void') {
    if (row.status === 'void') return json({ ok: true });
    await env.DB.prepare("UPDATE rental_contracts SET status = 'void', updated_at = ? WHERE id = ?").bind(now(), id).run();
    await log(env, 'contract.void', row.booking_code || id, 'admin', { id, was: row.status });
    return json({ ok: true });
  }
  if (action === 'relink') {
    if (row.status !== 'ready') return err('서명 대기 중인 계약서만 링크를 다시 만들 수 있습니다.', 409, 'LOCKED');
    await env.DB.prepare('UPDATE rental_contracts SET link_ver = link_ver + 1, viewed_at = NULL, sent_at = NULL, updated_at = ? WHERE id = ?').bind(now(), id).run();
    return json({ ok: true, link: await linkOf(env, await byId(env, id)) });
  }
  if (action === 'sent') { await env.DB.prepare('UPDATE rental_contracts SET sent_at = COALESCE(sent_at, ?) WHERE id = ?').bind(now(), id).run(); return json({ ok: true }); }
  if (action === 'send') {
    if (row.status !== 'ready') return err('서명 대기 중인 계약서만 보낼 수 있습니다.', 409, 'LOCKED');
    const data = parse(row.data), key = await linkKey(env, row.id, row.link_ver), url = 'https://megaspot.kr/contract/#id=' + row.id + '&k=' + key;
    if (d.channel === 'email') {
      const to = str(d.to, 80) || (data.renter || {}).email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || '')) return err('받는 사람 이메일 주소를 확인해 주세요.');
      if (!emailReady(env)) return err('이메일 발송 설정(RESEND_API_KEY·MAIL_FROM)이 없습니다. ‘메일 프로그램으로 보내기’를 써 주세요.', 409, 'EMAIL_OFF');
      if (await limited(env, 'ct-mail:' + id, 5, 60)) return tooManyErr();
      let r; try { r = await sendEmail(env, to, contractEmail(row, data, url)); } catch { r = { status: 'unknown', error: '이메일 응답을 확인할 수 없습니다.' }; }
      if (r.status === 'failed') return err(r.error, 502, 'SEND_FAILED');
      await env.DB.prepare('UPDATE rental_contracts SET sent_at = COALESCE(sent_at, ?) WHERE id = ?').bind(now(), id).run();
      await log(env, 'contract.email', row.booking_code || id, 'admin', { id, status: r.status });
      return json({ ok: true, results: [{ receiver: to.replace(/^(.).*(@.*)$/, '$1***$2'), status: r.status, note: r.error || '' }] });
    }
    const allowed = (await receivers(env, row, data)).map(x => x.phone);
    const want = [...new Set((Array.isArray(d.receivers) ? d.receivers : []).map(mobilePhone).filter(Boolean))];
    if (!want.length) return err('보낼 번호를 골라 주세요.');
    if (want.some(p => !allowed.includes(p))) return err('예약·문의·계약서에 등록된 번호로만 보낼 수 있습니다.', 403, 'NOT_CONTACT');
    const results = [];
    for (const phone of want) {
      const recent = await env.DB.prepare("SELECT 1 FROM contract_messages WHERE contract_id = ? AND receiver_hash = ? AND status IN ('sending','accepted','unknown') AND created_at >= datetime('now', '-2 minutes') LIMIT 1").bind(id, await sha256('contract-receiver:' + phone)).first();
      if (recent) { results.push({ receiver: maskPhone(phone), status: 'skipped', note: '2분 안에 이미 보냈습니다.' }); continue; }
      const r = await contractKakao.send(env, { refId: id, bookingCode: row.booking_code, receiver: phone, name: (data.renter || {}).rep || (data.renter || {}).name, vars: contractVars(row, data, key), actor: 'admin' });
      if (r.error && r.code === 'KAKAO_OFF') return err(r.error, 409, 'KAKAO_OFF');
      results.push(r.error ? { receiver: r.receiver || maskPhone(phone), status: 'failed', note: r.error } : { receiver: r.receiver, status: r.status, note: r.note || '' });
    }
    if (results.some(x => x.status === 'accepted' || x.status === 'unknown')) await env.DB.prepare('UPDATE rental_contracts SET sent_at = COALESCE(sent_at, ?) WHERE id = ?').bind(now(), id).run();
    await log(env, 'contract.kakao', row.booking_code || id, 'admin', { id, results: results.map(x => x.status) });
    return json({ ok: true, results, messages: await contractKakao.messages(env, id) });
  }
  return err('알 수 없는 요청입니다.');
}
async function settingsRoute(request, env, method) {
  if (method === 'POST') { let d; try { d = await readJson(request, 8 * 1024); } catch (e) { return err(e.message); } await saveSettings(env, d); }
  const seal = await sealImage(env);
  return json({ ok: true, ...(await contractSettings(env)), seal, defaults: { operator: CD.OPERATOR, bank: CD.BANK }, email: { ready: emailReady(env), from: env.MAIL_FROM || '' } });
}
async function sealRoute(request, env) {
  let d; try { d = await readJson(request, 240 * 1024); } catch (e) { return err(e.message); }
  const r = await saveSeal(env, d.image || ''); if (r.error) return err(r.error);
  return json({ ok: true, seal: await sealImage(env) });
}
async function kakaoRoute(request, env, method) {
  const K = contractKakao;
  const out = async extra => json({ ok: true, ...(await K.state(env)), template: { ...CONTRACT_TEMPLATE, subject: CONTRACT_SUBJECT, vars: templateVars(CONTRACT_TEMPLATE) }, relay_env: 'ALIGO_MEMBER_TEMPLATE_CODES', tests: await K.tests(env), ...(extra || {}) });
  if (method === 'GET') return out();
  let d; try { d = await readJson(request, 4 * 1024); } catch (e) { return err(e.message); }
  const a = str(d.action, 20);
  if (a === 'save') { const r = await K.save(env, { code: d.code }); return r.error ? err(r.error) : out(); }
  if (a === 'check') { const r = await K.check(env); return out({ check: r }); }
  if (a === 'confirm') { const r = await K.markTested(env); return r.error ? err(r.error, 409) : out(); }
  if (a === 'test') {
    const phone = mobilePhone(d.receiver); if (!phone) return err('시험 메시지를 받을 운영자 휴대폰 번호를 적어 주세요.');
    const st = await K.state(env);
    if (!st.live) return err('서버의 알림톡 발송이 꺼져 있습니다. 발송 설정을 확인해 주세요.', 409, 'KAKAO_OFF');
    if (!st.approved) return err('승인 확인을 먼저 통과해야 시험 발송을 할 수 있습니다.', 409, 'KAKAO_OFF');
    if (await tooMany(env, 'ct-kakao-test', 1, 1)) return err('시험 발송은 1분에 한 번만 할 수 있습니다.', 429, 'TOO_MANY');
    try { await hit(env, 'ct-kakao-test', 1); } catch {}
    const r = await K.send(env, { receiver: phone, name: '운영자', vars: sampleContractVars(), actor: 'test', test: true });
    if (r.error) return err(r.error, r.status || 400, r.code || 'SEND_FAILED');
    return out({ result: r });
  }
  return err('알 수 없는 요청입니다.');
}

async function admin(request, env, url, route, method) {
  const denied = await requireAdmin(request, env); if (denied) return denied;
  if (method === 'GET' && route === 'list') return list(env, url);
  if (method === 'GET' && route === 'sources') return sources(env, url);
  if (method === 'GET' && route === 'prefill') return prefill(env, url);
  if (method === 'GET' && route === 'detail') return detail(env, url);
  if (method === 'POST' && route === 'save') return save(request, env);
  if (method === 'POST' && ['void', 'relink', 'sent', 'send'].includes(route)) return adminAction(request, env, route);
  if (route === 'settings' && (method === 'GET' || method === 'POST')) return settingsRoute(request, env, method);
  if (method === 'POST' && route === 'seal') return sealRoute(request, env);
  if (route === 'kakao' && (method === 'GET' || method === 'POST')) return kakaoRoute(request, env, method);
  return err('찾을 수 없는 요청입니다.', 404, 'NOT_FOUND');
}

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const url = new URL(request.url), seg = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean), m = request.method;
  if (m === 'POST' && !sameOrigin(request)) return err('잘못된 요청입니다.', 403, 'ORIGIN');
  try {
    if (seg[0] === 'admin') return await admin(request, env, url, seg[1] || '', m);
    if (m === 'GET' && seg[0] === 'view') return await view(request, env, url);
    if (m === 'POST' && seg[0] === 'sign') return await sign(request, env);
    if (m === 'POST' && seg[0] === 'invite') return await makeInvite(request, env);
  } catch (e) {
    return err('처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER');
  }
  return err('찾을 수 없는 요청입니다.', 404, 'NOT_FOUND');
}
