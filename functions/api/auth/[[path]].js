// 회원 API — 가입·로그인·로그아웃·내 정보·비밀번호 변경·탈퇴·내 문의
//   POST  /api/auth/signup     가입 (바로 로그인 상태가 됨)
//   POST  /api/auth/login      로그인
//   POST  /api/auth/logout     로그아웃
//   GET   /api/auth/me         로그인한 회원 정보 (로그인 전이면 member: null)
//   PATCH /api/auth/me         이름·연락처·소속·마케팅 수신 동의 변경
//   POST  /api/auth/password   비밀번호 변경
//   POST  /api/auth/withdraw   회원 탈퇴 (비밀번호 확인)
//   GET   /api/auth/inquiries  회원으로 보낸 문의와 진행 상태
//   GET   /api/auth/orders     로그인한 회원 소유 주문·결제·환불 내역
import {
  json, err, hasDb, readJson, str, now, log, hashPassword, verifyPassword, randomToken, sha256, later,
  getCookie, sessionCookies, withCookies, isEmail, clientIp, sameOrigin, getMember, tooMany, hit, clearHits, SESSION_DAYS
} from '../_lib.js';

const PW_RULE = '비밀번호는 8자 이상, 영문과 숫자를 함께 넣어 주세요.';
function pwOk(pw) { return typeof pw === 'string' && pw.length >= 8 && pw.length <= 100 && /[A-Za-z]/.test(pw) && /\d/.test(pw); }
function cleanPhone(p) { return str(p, 30).replace(/[^0-9-+]/g, ''); }
function publicMember(m) { return m ? { email: m.email, name: m.name, phone: m.phone || '', org: m.org || '', agree_marketing: !!m.agree_marketing, created_at: m.created_at } : null; }

async function startSession(env, request, memberId) {
  const token = randomToken();
  const t = now();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t).run();
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, created_at, expires_at, ua) VALUES (?,?,?,?,?)')
    .bind(await sha256(token), memberId, t, later(SESSION_DAYS), str(request.headers.get('user-agent'), 200)).run();
  await env.DB.prepare('UPDATE members SET last_login_at = ? WHERE id = ?').bind(t, memberId).run();
  return sessionCookies(token);
}

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const path = (params.path || []).join('/');
  const method = request.method.toUpperCase();
  if (method !== 'GET') {
    if (!sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN');
    if (!(request.headers.get('content-type') || '').includes('application/json')) return err('잘못된 요청 형식입니다.', 415, 'BAD_TYPE');
  }
  try {
    // ---- 가입 ----
    if (path === 'signup' && method === 'POST') {
      const ip = clientIp(request);
      if (await tooMany(env, 'signup:' + ip, 10, 60)) return err('가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429, 'RATE_LIMIT');
      const d = await readJson(request);
      if (d.website) return json({ ok: true }); // 허니팟
      const email = str(d.email, 120).toLowerCase(), name = str(d.name, 40), phone = cleanPhone(d.phone), org = str(d.org, 80);
      if (!isEmail(email)) return err('이메일 주소를 확인해 주세요.');
      if (!pwOk(d.password)) return err(PW_RULE);
      if (!name) return err('이름을 적어 주세요.');
      if (phone.replace(/\D/g, '').length < 9) return err('휴대폰 번호를 확인해 주세요.');
      if (!d.agree_terms || !d.agree_privacy) return err('이용약관과 개인정보 수집·이용에 동의해 주세요.');
      if (!d.agree_age) return err('만 14세 이상만 가입할 수 있습니다.');
      await hit(env, 'signup:' + ip, 60);
      const exists = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
      if (exists) return err('이미 가입된 이메일입니다. 로그인해 주세요.', 409, 'EMAIL_TAKEN');
      const t = now();
      await env.DB.prepare('INSERT INTO members (email, name, phone, org, pw_hash, agree_marketing, agreed_at, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(email, name, phone, org, await hashPassword(d.password), d.agree_marketing ? 1 : 0, t, 'active', t).run();
      const m = await env.DB.prepare('SELECT id, email, name, phone, org, agree_marketing, created_at FROM members WHERE email = ?').bind(email).first();
      await log(env, 'member.created', String(m.id), 'member', { marketing: !!d.agree_marketing });
      if (d.agree_marketing) await env.DB.prepare('INSERT INTO member_consent_log (member_id, value, source, created_at) VALUES (?,?,?,?)').bind(m.id, 1, 'signup', t).run();
      return withCookies(json({ ok: true, member: publicMember(m) }), await startSession(env, request, m.id));
    }

    // ---- 로그인 ----
    if (path === 'login' && method === 'POST') {
      const d = await readJson(request);
      const email = str(d.email, 120).toLowerCase(), ip = clientIp(request);
      if (!isEmail(email) || !d.password) return err('이메일과 비밀번호를 입력해 주세요.');
      if (await tooMany(env, 'login:' + email, 8, 15) || await tooMany(env, 'loginip:' + ip, 30, 15))
        return err('로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도하거나, 비밀번호가 기억나지 않으면 문의해 주세요.', 429, 'RATE_LIMIT');
      const m = await env.DB.prepare('SELECT id, email, name, phone, org, agree_marketing, status, pw_hash, created_at FROM members WHERE email = ?').bind(email).first();
      const ok = m ? await verifyPassword(String(d.password), m.pw_hash) : (await hashPassword('timing-equalizer'), false);
      if (!ok) { await hit(env, 'login:' + email, 15); await hit(env, 'loginip:' + ip, 15); return err('이메일 또는 비밀번호가 올바르지 않습니다.', 401, 'BAD_LOGIN'); }
      if (m.status !== 'active') return err('이용이 제한된 계정입니다. 운영팀에 문의해 주세요.', 403, 'SUSPENDED');
      await clearHits(env, 'login:' + email);
      return withCookies(json({ ok: true, member: publicMember(m) }), await startSession(env, request, m.id));
    }

    // ---- 로그아웃 ----
    if (path === 'logout' && method === 'POST') {
      const token = getCookie(request, 'ms_session');
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      // 회원 계정으로 들어간 호스트센터도 함께 로그아웃합니다 (쿠키 모양은 _hostplat.js 의 hostCookies 와 같음)
      const hostToken = getCookie(request, 'ms_host');
      if (hostToken) await env.DB.prepare('DELETE FROM host_sessions WHERE token_hash = ?').bind(await sha256(hostToken)).run();
      return withCookies(json({ ok: true }), [...sessionCookies('', 0), ...(hostToken ? ['ms_host=; Path=/api/; Max-Age=0; HttpOnly; Secure; SameSite=Lax', 'ms_host_in=; Path=/; Max-Age=0; Secure; SameSite=Lax'] : [])]);
    }

    // 아래는 로그인한 회원만
    const me = await getMember(request, env);
    if (path === 'me' && method === 'GET') {
      const res = json({ ok: true, member: publicMember(me) });
      return me ? res : withCookies(res, sessionCookies('', 0)); // 만료된 표시 쿠키 정리
    }
    if (!me) return withCookies(err('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED'), sessionCookies('', 0));

    if (path === 'me' && method === 'PATCH') {
      const d = await readJson(request); const sets = [], b = [];
      if (d.name !== undefined) { const v = str(d.name, 40); if (!v) return err('이름을 적어 주세요.'); sets.push('name = ?'); b.push(v); }
      if (d.phone !== undefined) { const v = cleanPhone(d.phone); if (v.replace(/\D/g, '').length < 9) return err('휴대폰 번호를 확인해 주세요.'); sets.push('phone = ?'); b.push(v); }
      if (d.org !== undefined) { sets.push('org = ?'); b.push(str(d.org, 80)); }
      if (d.agree_marketing !== undefined) { sets.push('agree_marketing = ?'); b.push(d.agree_marketing ? 1 : 0); }
      if (!sets.length) return err('변경할 내용이 없습니다.');
      sets.push('updated_at = ?'); b.push(now(), me.id);
      await env.DB.prepare('UPDATE members SET ' + sets.join(', ') + ' WHERE id = ?').bind(...b).run();
      await log(env, 'member.updated', String(me.id), 'member', Object.keys(d));
      // 마케팅 수신 동의를 바꾸면 그 기록을 남깁니다 (관리자 '회원 관리'에서 확인 · 2026-11-14)
      if (d.agree_marketing !== undefined && !!d.agree_marketing !== !!me.agree_marketing) await env.DB.prepare('INSERT INTO member_consent_log (member_id, value, source, created_at) VALUES (?,?,?,?)').bind(me.id, d.agree_marketing ? 1 : 0, 'mypage', now()).run();
      const m = await env.DB.prepare('SELECT id, email, name, phone, org, agree_marketing, created_at FROM members WHERE id = ?').bind(me.id).first();
      return json({ ok: true, member: publicMember(m) });
    }

    if (path === 'password' && method === 'POST') {
      const d = await readJson(request);
      const row = await env.DB.prepare('SELECT pw_hash FROM members WHERE id = ?').bind(me.id).first();
      if (!(await verifyPassword(String(d.current || ''), row.pw_hash))) return err('지금 쓰는 비밀번호가 맞지 않습니다.', 401, 'BAD_PASSWORD');
      if (!pwOk(d.next)) return err(PW_RULE);
      await env.DB.prepare('UPDATE members SET pw_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(d.next), now(), me.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(me.id).run(); // 다른 기기 로그인도 모두 해제
      await log(env, 'member.password', String(me.id), 'member', '');
      return withCookies(json({ ok: true }), await startSession(env, request, me.id));
    }

    if (path === 'withdraw' && method === 'POST') {
      const d = await readJson(request);
      const row = await env.DB.prepare('SELECT pw_hash FROM members WHERE id = ?').bind(me.id).first();
      if (!(await verifyPassword(String(d.password || ''), row.pw_hash))) return err('비밀번호가 맞지 않습니다.', 401, 'BAD_PASSWORD');
      // 호스트로 등록한 회원은 공간·예약·이용료 정리가 필요해 바로 탈퇴하지 않습니다
      if (await env.DB.prepare('SELECT 1 AS x FROM member_hosts WHERE member_id = ?').bind(me.id).first())
        return err('호스트센터에 등록한 공간이 있어 바로 탈퇴할 수 없습니다. 진행 중인 예약과 이용료를 정리해야 하니 운영팀에 문의해 주세요.', 409, 'HOST_LINKED');
      await env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(me.id).run();
      await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(me.id).run();
      await log(env, 'member.withdrawn', String(me.id), 'member', '');
      return withCookies(json({ ok: true }), sessionCookies('', 0));
    }

    if (path === 'orders' && method === 'GET') {
      // 소유권은 검증된 세션의 member_id만 사용합니다. 이메일·전화·쿼리의 회원번호로 주문을 연결하지 않습니다.
      const { results } = await env.DB.prepare(`SELECT o.oid, o.product_id, o.title, o.event_date, o.people, o.price, o.status, o.booking_code, o.created_at, o.appl_at,b.status AS booking_status,
        COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid = o.oid), 0) AS refunded_amount
        FROM orders o LEFT JOIN bookings b ON b.booking_code=o.booking_code WHERE o.member_id = ? ORDER BY o.created_at DESC LIMIT 100`).bind(me.id).all();
      const items = (results || []).map(o => ({ oid: o.oid, product_id: o.product_id, title: o.title, date: o.event_date || '', people: o.people,
        price: o.price, status: o.status, booking_code: o.booking_code || '', booking_status:o.booking_status||null,created_at: o.created_at, paid_at: o.appl_at || '',
        refunded_amount: o.status === 'refunded' ? o.price : Math.min(o.price, o.refunded_amount || 0) }));
      return json({ ok: true, items });
    }

    if (path === 'inquiries' && method === 'GET') {
      // Status and confirmed booking must describe the same database snapshot.
      const { results } = await env.DB.prepare(`WITH member_inquiries AS (
        SELECT ref, space_id, status, event_date, headcount, data, created_at, updated_at
        FROM inquiries WHERE json_extract(data, '$.member_id')=? AND status<>'삭제됨'
        ORDER BY created_at DESC, ref DESC LIMIT 100
      )
      SELECT m.*,
        (SELECT json_group_array(json_object('code', b.booking_code, 'space_id', b.space_id, 'date', b.date,
          'start_h', b.start_h, 'end_h', b.end_h, 'headcount', b.headcount, 'status', b.status,
          'amount', CASE WHEN (CASE WHEN json_valid(b.confirm_doc) THEN json_type(b.confirm_doc, '$.show_amount') END)='false'
            THEN NULL ELSE b.amount END))
         FROM (SELECT booking_code, space_id, date, start_h, end_h, headcount, status, amount, confirm_doc
           FROM bookings WHERE inquiry_ref=m.ref AND status IN ('confirmed','completed')
           ORDER BY date,start_h,id) b) AS confirmed_bookings
      FROM member_inquiries m
      ORDER BY m.created_at DESC,m.ref DESC`).bind(me.id).all();
      const items = (results || []).map(r => {
        let d = {}; try { d = JSON.parse(r.data || '{}'); } catch {}
        return { ref: r.ref, space_id: r.space_id, status: r.status === '대기 취소' ? '문의 종료' : r.status, date: r.event_date || d.date || '', headcount: r.headcount, created_at: r.created_at, updated_at: r.updated_at,
          inquiry_type: d.inquiry_type || 'event', reserve: !!d.reserve, purpose: d.purpose || '', slot: d.slot || '', t_start: d.t_start || '', t_end: d.t_end || '', start_h: d.start_h ?? null, end_h: d.end_h ?? null, pkg: d.pkg || '', total: d.total || null, estimate: d.estimate ? String(d.estimate).slice(0, 600) : '',
          confirmed_bookings:JSON.parse(r.confirmed_bookings||'[]') };
      });
      return json({ ok: true, items });
    }

    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) { console.error('auth', e && e.message); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER_ERROR'); }
}
