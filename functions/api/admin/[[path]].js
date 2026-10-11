// 운영자 API — 모든 경로는 X-Admin-Key 헤더 검증을 거칩니다.
import { json, err, hasDb, readJson, str, num, isDate, now, uniqueRef, checkAdmin, log, hashPassword } from '../_lib.js';
const STATUSES = ['문의 접수', '조건 확인', '견적 발송', '결제 대기', '예약 확정', '이용 완료', '취소·환불'];

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const denied = checkAdmin(request, env); if (denied) return denied;
  const path = (params.path || []).join('/');
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  try {
    if (path === 'ping') return json({ ok: true });

    // ---- 문의 ----
    if (path === 'inquiries' && method === 'GET') {
      const st = str(url.searchParams.get('status'), 20), q = str(url.searchParams.get('q'), 60), ty = str(url.searchParams.get('type'), 20);
      let sql = 'SELECT ref, space_id, status, name, phone, email, event_date, headcount, data, memo, created_at, updated_at FROM inquiries WHERE 1=1'; const b = [];
      if (st) { sql += ' AND status = ?'; b.push(st); }
      if (['event', 'regular', 'partner'].includes(ty)) { sql += " AND COALESCE(json_extract(data, '$.inquiry_type'), 'event') = ?"; b.push(ty); }
      if (q) { sql += ' AND (name LIKE ? OR phone LIKE ? OR ref LIKE ?)'; b.push('%' + q + '%', '%' + q + '%', '%' + q.toUpperCase() + '%'); }
      sql += ' ORDER BY created_at DESC LIMIT 200';
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
        .bind(code, space_id, str(d.inquiry_ref, 20).toUpperCase() || null, name, phone, digits.slice(-4), date, str(d.slot, 10) || 'pm', num(d.headcount), str(d.memo, 2000), 'confirmed', now()).run();
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
