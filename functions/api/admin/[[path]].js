// 운영자 API — 모든 경로는 X-Admin-Key 헤더 검증을 거칩니다.
import { json, err, hasDb, readJson, str, num, isDate, now, uniqueRef, log, hashPassword, requireAdmin, adminKeyOk, adminCookie,
  randomToken, sha256, later, getCookie, withCookies, clientIp, sameOrigin, tooMany, hit, clearHits, kstToday } from '../_lib.js';
const STATUSES = ['문의 접수', '조건 확인', '견적 발송', '결제 대기', '예약 확정', '이용 완료', '취소·환불'];
const OPEN = ['문의 접수', '조건 확인', '견적 발송', '결제 대기'];
const CHANNELS = ['web', 'kakao', 'phone', 'email', 'visit', 'other'];

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const path = (params.path || []).join('/');
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  if (method !== 'GET' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN');

  // ---- 관리자 로그인·로그아웃 (로그인 확인 전에 처리) ----
  if (path === 'login' && method === 'POST') {
    if (!env.ADMIN_KEY) return err('Cloudflare에 ADMIN_KEY가 설정되어 있지 않습니다.', 503, 'NO_ADMIN_KEY');
    const ip = clientIp(request);
    if (await tooMany(env, 'adminlogin:' + ip, 8, 15)) return err('로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.', 429, 'RATE_LIMIT');
    let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
    if (!adminKeyOk(d.key, env)) { await hit(env, 'adminlogin:' + ip, 15); return err('관리자 비밀번호가 올바르지 않습니다.', 401, 'UNAUTHORIZED'); }
    await clearHits(env, 'adminlogin:' + ip);
    const hours = d.remember ? 24 * 7 : 12, token = randomToken(), t = now();
    await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(t).run();
    await env.DB.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at, ip) VALUES (?,?,?,?)').bind(await sha256(token), t, later(hours / 24), ip).run();
    await log(env, 'admin.login', '', 'admin', { ip });
    return withCookies(json({ ok: true, hours }), [adminCookie(token, hours)]);
  }
  if (path === 'logout' && method === 'POST') {
    const tok = getCookie(request, 'ms_admin');
    if (tok) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256(tok)).run();
    return withCookies(json({ ok: true }), [adminCookie('', 0)]);
  }

  const denied = await requireAdmin(request, env); if (denied) return denied;
  try {
    if (path === 'ping') return json({ ok: true });

    // ---- 대시보드: 오늘 확인할 것 ----
    if (path === 'dashboard' && method === 'GET') {
      const today = kstToday(), in14 = kstToday(14), ago2 = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
      const ago7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
      const month = today.slice(0, 7);
      const one = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0;
      const all = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).all()).results || []);
      const counts = {};
      for (const s of STATUSES) counts[s] = await one('SELECT COUNT(*) AS n FROM inquiries WHERE status = ?', s);
      const latestQuote = "(SELECT q.total FROM quotes q WHERE q.inquiry_ref = i.ref ORDER BY q.id DESC LIMIT 1)";
      const cols = `i.ref, i.status, i.name, i.phone, i.event_date, i.headcount, i.created_at, i.updated_at, json_extract(i.data, '$.purpose') AS purpose, json_extract(i.data, '$.inquiry_type') AS inquiry_type, json_extract(i.data, '$.channel') AS channel, ${latestQuote} AS quote_total`;
      const out = {
        today, counts,
        upcoming_count: await one("SELECT COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ?", today, in14),
        reviews_pending: await one("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'"),
        members: await one('SELECT COUNT(*) AS n FROM members'), members_new: await one('SELECT COUNT(*) AS n FROM members WHERE created_at >= ?', ago7),
        hosts_new: await one('SELECT COUNT(*) AS n FROM host_applications WHERE created_at >= ?', ago7),
        todo: await all(`SELECT ${cols} FROM inquiries i WHERE i.status = '문의 접수' ORDER BY i.created_at ASC LIMIT 15`),
        followup: await all(`SELECT ${cols} FROM inquiries i WHERE i.status IN ('견적 발송', '결제 대기') AND COALESCE(i.updated_at, i.created_at) <= ? ORDER BY COALESCE(i.updated_at, i.created_at) ASC LIMIT 15`, ago2),
        soon: await all(`SELECT ${cols} FROM inquiries i WHERE i.status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기') AND i.event_date >= ? AND i.event_date <= ? ORDER BY i.event_date ASC LIMIT 15`, today, in14),
        upcoming: await all("SELECT booking_code, inquiry_ref, customer_name, phone, date, slot, headcount, memo FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ? ORDER BY date ASC LIMIT 20", today, in14),
        month: {
          month,
          inquiries: await one("SELECT COUNT(*) AS n FROM inquiries WHERE substr(created_at, 1, 7) = ?", month),
          confirmed: await one("SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('예약 확정', '이용 완료') AND substr(event_date, 1, 7) = ?", month),
          confirmed_amount: await one(`SELECT COALESCE(SUM(${latestQuote}), 0) AS n FROM inquiries i WHERE i.status IN ('예약 확정', '이용 완료') AND substr(i.event_date, 1, 7) = ?`, month),
          quoted_amount: await one(`SELECT COALESCE(SUM(${latestQuote}), 0) AS n FROM inquiries i WHERE i.status IN ('견적 발송', '결제 대기') `),
        }
      };
      return json({ ok: true, ...out });
    }

    // ---- 문의 상세 · 직접 등록 · 체크리스트 ----
    const mDet = path.match(/^inquiries\/([A-Z0-9-]+)$/);
    if (mDet && method === 'GET') {
      const r = await env.DB.prepare('SELECT ref, space_id, status, name, phone, email, event_date, headcount, data, memo, created_at, updated_at FROM inquiries WHERE ref = ?').bind(mDet[1]).first();
      if (!r) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const c = await env.DB.prepare('SELECT checks FROM inquiry_checks WHERE ref = ?').bind(mDet[1]).first();
      const { results: qs } = await env.DB.prepare('SELECT quote_no, total, data, created_at FROM quotes WHERE inquiry_ref = ? ORDER BY id DESC LIMIT 20').bind(mDet[1]).all();
      const { results: bk } = await env.DB.prepare('SELECT booking_code, date, slot, status FROM bookings WHERE inquiry_ref = ? ORDER BY id DESC').bind(mDet[1]).all();
      const { results: lg } = await env.DB.prepare('SELECT kind, actor, detail, created_at FROM event_log WHERE ref = ? ORDER BY id DESC LIMIT 30').bind(mDet[1]).all();
      return json({ ok: true, item: { ...r, data: safe(r.data) }, checks: safe(c && c.checks), quotes: (qs || []).map(q => ({ ...q, data: safe(q.data) })), bookings: bk || [], log: lg || [] });
    }
    if (path === 'inquiries' && method === 'POST') {
      // 카카오톡·전화·이메일·방문으로 받은 문의를 관리자가 직접 등록합니다.
      const d = await readJson(request);
      const name = str(d.name, 80), phone = str(d.phone, 30).replace(/[^0-9-+]/g, ''), email = str(d.email, 120);
      if (!name) return err('고객 이름을 적어 주세요.');
      const date = str(d.date, 10); if (date && !isDate(date)) return err('날짜를 확인해 주세요.');
      const channel = CHANNELS.includes(d.channel) ? d.channel : 'other';
      const data = { inquiry_type: ['event', 'regular', 'partner'].includes(d.inquiry_type) ? d.inquiry_type : 'event', space_id: 'megaspot-gundae', channel,
        purpose: str(d.purpose, 40), date, t_start: str(d.t_start, 5), t_end: str(d.t_end, 5), headcount: num(d.headcount), name, phone, email,
        org: str(d.org, 120), message: str(d.message, 2000), source: 'admin', summary: '' };
      data.summary = ['[관리자 직접 등록 · ' + ({ kakao: '카카오톡', phone: '전화', email: '이메일', visit: '방문', web: '홈페이지', other: '기타' })[channel] + ']',
        '이름: ' + name, phone ? '연락처: ' + phone : '', email ? '이메일: ' + email : '', date ? '날짜: ' + date + (data.t_start ? ' ' + data.t_start + '–' + (data.t_end || '') : '') : '',
        data.headcount ? '인원: ' + data.headcount + '명' : '', data.message ? '내용: ' + data.message : ''].filter(Boolean).join('\n');
      const ref = await uniqueRef(env, 'inquiries', 'ref', 'MS');
      await env.DB.prepare('INSERT INTO inquiries (ref, space_id, status, name, phone, email, event_date, headcount, data, memo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(ref, 'megaspot-gundae', STATUSES.includes(d.status) ? d.status : '문의 접수', name, phone, email, date || null, data.headcount, JSON.stringify(data), str(d.memo, 2000), now()).run();
      await log(env, 'inquiry.created', ref, 'admin', { channel });
      return json({ ok: true, ref });
    }
    const mChk = path.match(/^inquiries\/([A-Z0-9-]+)\/checks$/);
    if (mChk && method === 'PUT') {
      const d = await readJson(request); const checks = {};
      for (const [k, v] of Object.entries(d.checks || {})) if (/^[a-z_]{1,30}$/.test(k)) checks[k] = v ? now() : false;
      await env.DB.prepare('INSERT INTO inquiry_checks (ref, checks, updated_at) VALUES (?,?,?) ON CONFLICT(ref) DO UPDATE SET checks = excluded.checks, updated_at = excluded.updated_at').bind(mChk[1], JSON.stringify(checks), now()).run();
      return json({ ok: true, checks });
    }

    // ---- 견적 저장·목록 ----
    if (path === 'quotes' && method === 'POST') {
      const d = await readJson(request, 128 * 1024);
      const total = num(d.total); if (total == null || total < 0) return err('견적 합계를 확인해 주세요.');
      const ref = str(d.inquiry_ref, 20).toUpperCase();
      if (ref) { const ex = await env.DB.prepare('SELECT 1 AS x FROM inquiries WHERE ref = ?').bind(ref).first(); if (!ex) return err('연결할 문의번호를 찾을 수 없습니다.'); }
      const quote_no = await uniqueRef(env, 'quotes', 'quote_no', 'Q');
      const data = d.data && typeof d.data === 'object' ? d.data : {};
      await env.DB.prepare('INSERT INTO quotes (quote_no, inquiry_ref, customer, event_date, total, data, created_at) VALUES (?,?,?,?,?,?,?)')
        .bind(quote_no, ref || null, str(d.customer, 120), isDate(str(d.event_date, 10)) ? str(d.event_date, 10) : null, total, JSON.stringify(data).slice(0, 100000), now()).run();
      if (ref && d.mark_sent) await env.DB.prepare("UPDATE inquiries SET status = '견적 발송', updated_at = ? WHERE ref = ? AND status IN ('문의 접수', '조건 확인')").bind(now(), ref).run();
      if (ref) await env.DB.prepare("UPDATE inquiries SET updated_at = ? WHERE ref = ?").bind(now(), ref).run();
      await log(env, 'quote.saved', ref || quote_no, 'admin', { quote_no, total });
      return json({ ok: true, quote_no });
    }
    if (path === 'quotes' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT quote_no, inquiry_ref, customer, event_date, total, data, created_at FROM quotes ORDER BY id DESC LIMIT 100').all();
      return json({ ok: true, items: (results || []).map(q => ({ ...q, data: safe(q.data) })) });
    }

    // ---- 문의 ----
    if (path === 'inquiries' && method === 'GET') {
      const st = str(url.searchParams.get('status'), 20), q = str(url.searchParams.get('q'), 60), ty = str(url.searchParams.get('type'), 20);
      let sql = 'SELECT ref, space_id, status, name, phone, email, event_date, headcount, data, memo, created_at, updated_at, (SELECT q.total FROM quotes q WHERE q.inquiry_ref = inquiries.ref ORDER BY q.id DESC LIMIT 1) AS quote_total FROM inquiries WHERE 1=1'; const b = [];
      if (st === 'open') { sql += " AND status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기')"; } else if (st) { sql += ' AND status = ?'; b.push(st); }
      if (['event', 'regular', 'partner'].includes(ty)) { sql += " AND COALESCE(json_extract(data, '$.inquiry_type'), 'event') = ?"; b.push(ty); }
      if (q) { sql += ' AND (name LIKE ? OR phone LIKE ? OR ref LIKE ? OR email LIKE ?)'; b.push('%' + q + '%', '%' + q + '%', '%' + q.toUpperCase() + '%', '%' + q + '%'); }
      sql += ' ORDER BY created_at DESC LIMIT 300';
      const { results } = await env.DB.prepare(sql).bind(...b).all();
      return json({ ok: true, items: (results || []).map(r => ({ ...r, data: safe(r.data) })) });
    }
    const mInq = path.match(/^inquiries\/([A-Z0-9-]+)$/);
    if (mInq && method === 'PATCH') {
      const d = await readJson(request); const ref = mInq[1]; const sets = []; const b = [];
      if (d.status !== undefined) { if (!STATUSES.includes(d.status)) return err('상태 값이 올바르지 않습니다.'); sets.push('status = ?'); b.push(d.status); }
      if (d.memo !== undefined) { sets.push('memo = ?'); b.push(str(d.memo, 2000)); }
      if (!sets.length) return err('변경할 내용이 없습니다.');
      sets.push('updated_at = ?'); b.push(now(), ref);
      await env.DB.prepare('UPDATE inquiries SET ' + sets.join(', ') + ' WHERE ref = ?').bind(...b).run();
      await log(env, 'inquiry.updated', ref, 'admin', d);
      return json({ ok: true });
    }

    // ---- 입점 ----
    if (path === 'hosts' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT ref, status, data, created_at FROM host_applications ORDER BY created_at DESC LIMIT 200').all();
      return json({ ok: true, items: (results || []).map(r => ({ ...r, data: safe(r.data) })) });
    }

    // ---- 예약 ----
    if (path === 'bookings' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT booking_code, space_id, inquiry_ref, customer_name, phone, date, slot, headcount, memo, status, created_at FROM bookings ORDER BY date DESC, created_at DESC LIMIT 300').all();
      return json({ ok: true, items: results || [] });
    }
    if (path === 'bookings' && method === 'POST') {
      const d = await readJson(request);
      const space_id = str(d.space_id, 60) || 'megaspot-gundae', name = str(d.customer_name, 80), phone = str(d.phone, 30), date = str(d.date, 10);
      if (!name || !phone || !isDate(date)) return err('예약자·연락처·이용일을 확인해 주세요.');
      const digits = phone.replace(/\D/g, ''); if (digits.length < 9) return err('연락처 형식을 확인해 주세요.');
      const code = await uniqueRef(env, 'bookings', 'booking_code', 'MS');
      await env.DB.prepare('INSERT INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, memo, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(code, space_id, str(d.inquiry_ref, 20).toUpperCase() || null, name, phone, digits.slice(-4), date, str(d.slot, 20) || 'custom', num(d.headcount), str(d.memo, 2000), 'confirmed', now()).run();
      if (d.block_calendar) await env.DB.prepare('INSERT INTO calendar_blocks (space_id, date, state, memo) VALUES (?,?,?,?) ON CONFLICT(space_id, date) DO UPDATE SET state = excluded.state, memo = excluded.memo').bind(space_id, date, 'full', '예약 ' + code).run();
      if (d.inquiry_ref) await env.DB.prepare("UPDATE inquiries SET status = '예약 확정', updated_at = ? WHERE ref = ?").bind(now(), str(d.inquiry_ref, 20).toUpperCase()).run();
      await log(env, 'booking.created', code, 'admin', { space_id, date });
      return json({ ok: true, booking_code: code });
    }
    const mBk = path.match(/^bookings\/([A-Z0-9-]+)$/);
    if (mBk && method === 'PATCH') {
      const d = await readJson(request); const code = mBk[1];
      if (!['confirmed', 'completed', 'cancelled'].includes(d.status)) return err('상태 값이 올바르지 않습니다.');
      await env.DB.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE booking_code = ?').bind(d.status, now(), code).run();
      if (d.status === 'completed') await env.DB.prepare("UPDATE inquiries SET status = '이용 완료', updated_at = ? WHERE ref = (SELECT inquiry_ref FROM bookings WHERE booking_code = ?)").bind(now(), code).run();
      if (d.status === 'cancelled') await env.DB.prepare("DELETE FROM calendar_blocks WHERE memo = ?").bind('예약 ' + code).run();
      await log(env, 'booking.updated', code, 'admin', d);
      return json({ ok: true });
    }

    // ---- 후기 ----
    if (path === 'reviews' && method === 'GET') {
      const st = str(url.searchParams.get('status'), 20);
      let sql = 'SELECT id, space_id, booking_code, author, rating, title, body, event_type, headcount, status, reply, created_at FROM reviews'; const b = [];
      if (st) { sql += ' WHERE status = ?'; b.push(st); }
      sql += ' ORDER BY created_at DESC LIMIT 200';
      const { results } = await env.DB.prepare(sql).bind(...b).all();
      return json({ ok: true, items: results || [] });
    }
    const mRv = path.match(/^reviews\/(\d+)$/);
    if (mRv && method === 'PATCH') {
      const d = await readJson(request); const id = +mRv[1];
      if (!['pending', 'approved', 'hidden'].includes(d.status)) return err('상태 값이 올바르지 않습니다.');
      await env.DB.prepare('UPDATE reviews SET status = ?, reply = ?, updated_at = ? WHERE id = ?').bind(d.status, str(d.reply, 1000), now(), id).run();
      await log(env, 'review.updated', String(id), 'admin', d);
      return json({ ok: true });
    }

    // ---- 회원 ----
    if (path === 'members' && method === 'GET') {
      const q = str(url.searchParams.get('q'), 60);
      let sql = "SELECT m.id, m.email, m.name, m.phone, m.org, m.agree_marketing, m.status, m.created_at, m.last_login_at, (SELECT COUNT(*) FROM inquiries i WHERE json_extract(i.data, '$.member_id') = m.id) AS inquiry_count FROM members m"; const b = [];
      if (q) { sql += ' WHERE m.email LIKE ? OR m.name LIKE ? OR m.phone LIKE ? OR m.org LIKE ?'; b.push(...Array(4).fill('%' + q + '%')); }
      sql += ' ORDER BY m.created_at DESC LIMIT 300';
      const { results } = await env.DB.prepare(sql).bind(...b).all();
      const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM members').first();
      return json({ ok: true, total: total ? total.n : 0, items: results || [] });
    }
    const mMem = path.match(/^members\/(\d+)$/);
    if (mMem && method === 'PATCH') {
      const d = await readJson(request); const id = +mMem[1];
      if (!['active', 'suspended'].includes(d.status)) return err('상태 값이 올바르지 않습니다.');
      await env.DB.prepare('UPDATE members SET status = ?, updated_at = ? WHERE id = ?').bind(d.status, now(), id).run();
      if (d.status === 'suspended') await env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(id).run();
      await log(env, 'member.status', String(id), 'admin', d);
      return json({ ok: true });
    }
    const mPw = path.match(/^members\/(\d+)\/reset-password$/);
    if (mPw && method === 'POST') {
      // 비밀번호를 잊은 회원에게 임시 비밀번호를 발급합니다. 본인 확인(가입 휴대폰·이메일) 후 전달하고, 로그인 뒤 바꾸도록 안내하세요.
      const id = +mPw[1];
      const row = await env.DB.prepare('SELECT id FROM members WHERE id = ?').bind(id).first();
      if (!row) return err('회원을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const A = 'abcdefghjkmnpqrstuvwxyz', N = '23456789'; const r = crypto.getRandomValues(new Uint8Array(10));
      let temp = ''; for (let i = 0; i < 10; i++) temp += (i < 6 ? A : N)[r[i] % (i < 6 ? A.length : N.length)];
      await env.DB.prepare('UPDATE members SET pw_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(temp), now(), id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(id).run();
      await log(env, 'member.reset_password', String(id), 'admin', '');
      return json({ ok: true, temp_password: temp });
    }

    // ---- 일정 ----
    if (path === 'calendar' && method === 'GET') {
      const { results } = await env.DB.prepare("SELECT space_id, date, state, memo FROM calendar_blocks WHERE date >= date('now','localtime') ORDER BY date ASC LIMIT 400").all();
      return json({ ok: true, items: results || [] });
    }
    if (path === 'calendar' && method === 'POST') {
      const d = await readJson(request); const space_id = str(d.space_id, 60) || 'megaspot-gundae', date = str(d.date, 10), state = str(d.state, 10);
      if (!isDate(date)) return err('날짜를 확인해 주세요.');
      if (state === 'open') { await env.DB.prepare('DELETE FROM calendar_blocks WHERE space_id = ? AND date = ?').bind(space_id, date).run(); }
      else if (['full', 'hold'].includes(state)) { await env.DB.prepare('INSERT INTO calendar_blocks (space_id, date, state, memo) VALUES (?,?,?,?) ON CONFLICT(space_id, date) DO UPDATE SET state = excluded.state, memo = excluded.memo').bind(space_id, date, state, str(d.memo, 200)).run(); }
      else return err('상태 값이 올바르지 않습니다.');
      await log(env, 'calendar.updated', space_id + ':' + date, 'admin', d);
      return json({ ok: true });
    }

    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) { return err('처리 중 오류가 발생했습니다. (' + (e.message || '') + ')', 500, 'SERVER_ERROR'); }
}
function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
