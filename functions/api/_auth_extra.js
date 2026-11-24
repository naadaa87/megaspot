// 회원 편의 기능 (2026-11-25) — 카카오 간편 로그인 · 비밀번호 재설정 메일 · 예약 직접 연결
//
//   GET  /api/auth/providers                 { kakao, reset_email }  — 켜져 있는 기능만 화면에 보여 주려고 씁니다
//   POST /api/auth/reset-request { email }   비밀번호 재설정 링크를 메일로 (가입 여부와 관계없이 같은 답)
//   POST /api/auth/reset { token, password } 새 비밀번호로 바꾸고 로그인
//   GET  /api/auth/kakao/start?next=/mypage/[&link=1]   카카오 로그인 화면으로 보냄
//   GET  /api/auth/kakao/callback            카카오에서 돌아오는 곳 — 연결된 회원이면 로그인, 처음이면 가입 마무리 화면으로
//   GET  /api/auth/kakao/pending?k=          가입 마무리 화면에 채울 이름·이메일
//   POST /api/auth/kakao/complete            약관 동의·연락처를 받아 회원 가입 + 카카오 연결
//   GET  /api/auth/social                    (로그인) 연결된 간편 로그인
//   POST /api/auth/link-booking { date | booking_code, phone_last4 }   (로그인) 이 회원 계정에 예약 연결
//
// 켜는 방법: Cloudflare 환경 변수 KAKAO_REST_API_KEY (선택 KAKAO_CLIENT_SECRET) — 카카오 개발자 콘솔의 Redirect URI 에
//            https://megaspot.kr/api/auth/kakao/callback 을 등록해야 합니다. 메일은 RESEND_API_KEY · MAIL_FROM 이 있어야 나갑니다.
// 예약·문의 자료는 바꾸지 않습니다(예약 연결은 member_booking_links 에만 저장).
import { json, err, str, now, log, hashPassword, randomToken, sha256, later, getCookie, sessionCookies, withCookies, isEmail, clientIp, getMember, tooMany, hit, SESSION_DAYS } from './_lib.js';
import { findByDate, validCode } from './_my_booking.js';

const KAUTH = 'https://kauth.kakao.com', KAPI = 'https://kapi.kakao.com';
export const kakaoReady = env => !!String((env && env.KAKAO_REST_API_KEY) || '').trim();
export const mailReady = env => !!(env && env.RESEND_API_KEY && /@/.test(env.MAIL_FROM || ''));
const PW_RULE = '비밀번호는 8자 이상, 영문과 숫자를 함께 넣어 주세요.';
const pwOk = pw => typeof pw === 'string' && pw.length >= 8 && pw.length <= 100 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
const safe = s => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
const safeNext = v => { const s = String(v || ''); return /^\/(?!\/)[A-Za-z0-9\-._~/?=&%#]*$/.test(s) && s.length < 200 ? s : '/mypage/'; };
const redirect = (to, cookies = []) => { const h = new Headers({ Location: to, 'cache-control': 'no-store' }); for (const c of cookies) h.append('Set-Cookie', c); return new Response(null, { status: 302, headers: h }); };
const STATE_COOKIE = 'ms_kstate';

async function startSession(env, request, memberId) {
  const token = randomToken(), t = now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, created_at, expires_at, ua) VALUES (?,?,?,?,?)').bind(await sha256(token), memberId, t, later(SESSION_DAYS), str(request.headers.get('user-agent'), 200)).run();
  await env.DB.prepare('UPDATE members SET last_login_at = ? WHERE id = ?').bind(t, memberId).run();
  return sessionCookies(token);
}
async function newToken(env, kind, memberId, data, minutes) {
  const token = randomToken(), t = now(), exp = new Date(Date.now() + minutes * 6e4).toISOString().slice(0, 19).replace('T', ' ');
  await env.DB.prepare('INSERT INTO auth_tokens (token_hash, kind, member_id, data, expires_at, created_at) VALUES (?,?,?,?,?,?)').bind(await sha256(token), kind, memberId || null, JSON.stringify(data || {}), exp, t).run();
  return token;
}
async function readToken(env, kind, token) {
  if (!token || String(token).length < 20) return null;
  const row = await env.DB.prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND kind = ?').bind(await sha256(String(token)), kind).first();
  if (!row || row.used_at || row.expires_at < now()) return null;
  return row;
}
const useToken = (env, row) => env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').bind(now(), row.token_hash).run();

async function sendResetMail(env, to, link) {
  const text = `메가스팟 비밀번호 재설정 안내\n\n아래 링크에서 새 비밀번호를 정해 주세요. 링크는 1시간 동안 한 번만 쓸 수 있습니다.\n${link}\n\n비밀번호 재설정을 요청하지 않으셨다면 이 메일을 무시해 주세요. 비밀번호는 바뀌지 않습니다.\n\n메가스팟 운영팀`;
  const html = `<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;font-size:15px;line-height:1.7;color:#1E2225"><p><b>메가스팟 비밀번호 재설정 안내</b></p><p>아래 단추를 눌러 새 비밀번호를 정해 주세요. 링크는 1시간 동안 한 번만 쓸 수 있습니다.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1F53D5;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">새 비밀번호 정하기</a></p><p style="color:#6B7178;font-size:13px">요청하지 않으셨다면 이 메일을 무시해 주세요. 비밀번호는 바뀌지 않습니다.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: '[메가스팟] 비밀번호 재설정 링크', text, html }) });
  return r.ok;
}

async function kakaoProfile(env, origin, code) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: env.KAKAO_REST_API_KEY, redirect_uri: origin + '/api/auth/kakao/callback', code });
  if (env.KAKAO_CLIENT_SECRET) body.set('client_secret', env.KAKAO_CLIENT_SECRET);
  const tr = await fetch(KAUTH + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, body });
  const tj = await tr.json().catch(() => ({}));
  if (!tr.ok || !tj.access_token) throw Object.assign(new Error('kakao token'), { step: 'token' });
  const ur = await fetch(KAPI + '/v2/user/me', { headers: { Authorization: 'Bearer ' + tj.access_token } });
  const u = await ur.json().catch(() => ({}));
  if (!ur.ok || !u.id) throw Object.assign(new Error('kakao user'), { step: 'user' });
  const acc = u.kakao_account || {}, prof = acc.profile || {};
  const email = acc.email && acc.is_email_valid !== false && acc.is_email_verified ? String(acc.email).toLowerCase() : '';
  return { sub: String(u.id), email, name: str(acc.name || prof.nickname || (u.properties && u.properties.nickname), 40) };
}

export async function authExtra({ request, env, path, method }) {
  const url = new URL(request.url), origin = url.origin;
  if (path === 'providers' && method === 'GET') return json({ ok: true, kakao: kakaoReady(env), reset_email: mailReady(env) }, 200, { 'cache-control': 'no-store' });

  // ---- 비밀번호 재설정 ----
  if (path === 'reset-request' && method === 'POST') {
    let d; try { d = await request.json(); } catch { return err('잘못된 요청 형식입니다.'); }
    const email = str(d.email, 120).toLowerCase(), ip = clientIp(request);
    if (!isEmail(email)) return err('가입한 이메일 주소를 확인해 주세요.');
    if (!mailReady(env)) return err('지금은 재설정 메일을 보낼 수 없습니다. 카카오톡으로 가입한 이메일·이름·휴대폰 번호를 보내 주시면 확인 후 도와드립니다.', 503, 'MAIL_OFF');
    if (await tooMany(env, 'reset:' + ip, 5, 60) || await tooMany(env, 'reset:' + email, 3, 60)) return err('재설정 요청이 많았습니다. 1시간 뒤 다시 시도해 주세요.', 429, 'RATE_LIMIT');
    await hit(env, 'reset:' + ip, 60); await hit(env, 'reset:' + email, 60);
    const m = await env.DB.prepare("SELECT id, email, status FROM members WHERE email = ?").bind(email).first();
    if (m && m.status === 'active') {
      const token = await newToken(env, 'reset', m.id, {}, 60);
      try { await sendResetMail(env, m.email, origin + '/login/reset/#t=' + token); await log(env, 'member.reset_requested', String(m.id), 'member', {}); } catch {}
    }
    return json({ ok: true, message: '가입된 이메일이면 재설정 링크를 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.' });
  }
  if (path === 'reset' && method === 'POST') {
    let d; try { d = await request.json(); } catch { return err('잘못된 요청 형식입니다.'); }
    if (!pwOk(d.password)) return err(PW_RULE);
    const row = await readToken(env, 'reset', str(d.token, 100));
    if (!row) return err('링크가 만료되었거나 이미 쓴 링크입니다. 재설정 메일을 다시 받아 주세요.', 400, 'BAD_TOKEN');
    await useToken(env, row);
    await env.DB.prepare('UPDATE members SET pw_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(d.password), now(), row.member_id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(row.member_id).run();
    await log(env, 'member.password_reset', String(row.member_id), 'member', {});
    return withCookies(json({ ok: true }), await startSession(env, request, row.member_id));
  }

  // ---- 카카오 ----
  if (path === 'kakao/start' && method === 'GET') {
    if (!kakaoReady(env)) return redirect('/login/?kakao=off');
    const state = randomToken().slice(0, 24), next = safeNext(url.searchParams.get('next')), link = url.searchParams.get('link') === '1' ? '1' : '0';
    const auth = KAUTH + '/oauth/authorize?' + new URLSearchParams({ client_id: env.KAKAO_REST_API_KEY, redirect_uri: origin + '/api/auth/kakao/callback', response_type: 'code', state }).toString();
    return redirect(auth, [`${STATE_COOKIE}=${state}.${link}.${encodeURIComponent(next)}; Path=/api/auth/kakao/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`]);
  }
  if (path === 'kakao/callback' && method === 'GET') {
    const clear = `${STATE_COOKIE}=; Path=/api/auth/kakao/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    if (!kakaoReady(env)) return redirect('/login/?kakao=off', [clear]);
    const raw = getCookie(request, STATE_COOKIE) || '', [state, link, nextEnc] = raw.split('.');
    const next = safeNext(decodeURIComponent(nextEnc || ''));
    if (url.searchParams.get('error')) return redirect('/login/?kakao=cancel', [clear]);
    if (!state || state !== url.searchParams.get('state') || !url.searchParams.get('code')) return redirect('/login/?kakao=fail', [clear]);
    let p; try { p = await kakaoProfile(env, origin, url.searchParams.get('code')); } catch { return redirect('/login/?kakao=fail', [clear]); }
    const me = await getMember(request, env);
    const linked = await env.DB.prepare("SELECT member_id FROM member_social WHERE provider = 'kakao' AND sub = ?").bind(p.sub).first();
    if (link === '1' && me) {   // 마이페이지에서 '카카오 연결'
      if (linked && linked.member_id !== me.id) return redirect('/mypage/?kakao=taken', [clear]);
      if (!linked) await env.DB.prepare('INSERT INTO member_social (provider, sub, member_id, created_at) VALUES (?,?,?,?)').bind('kakao', p.sub, me.id, now()).run();
      await log(env, 'member.social_linked', String(me.id), 'member', { provider: 'kakao' });
      return redirect('/mypage/?kakao=linked', [clear]);
    }
    let memberId = linked ? linked.member_id : null;
    if (!memberId && p.email) {   // 카카오에서 확인된 이메일과 같은 회원이 있으면 연결
      const m = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(p.email).first();
      if (m) { memberId = m.id; await env.DB.prepare('INSERT OR IGNORE INTO member_social (provider, sub, member_id, created_at) VALUES (?,?,?,?)').bind('kakao', p.sub, m.id, now()).run(); }
    }
    if (memberId) {
      const m = await env.DB.prepare('SELECT status FROM members WHERE id = ?').bind(memberId).first();
      if (!m || m.status !== 'active') return redirect('/login/?kakao=suspended', [clear]);
      return redirect(next, [clear, ...(await startSession(env, request, memberId))]);
    }
    const token = await newToken(env, 'social', null, { provider: 'kakao', sub: p.sub, email: p.email, name: p.name, next }, 30);
    return redirect('/signup/?kakao=1#k=' + token, [clear]);
  }
  if (path === 'kakao/pending' && method === 'GET') {
    const row = await readToken(env, 'social', str(url.searchParams.get('k'), 100));
    if (!row) return err('카카오 로그인 시간이 지났습니다. 다시 카카오로 시작해 주세요.', 400, 'BAD_TOKEN');
    const d = safe(row.data);
    return json({ ok: true, email: d.email || '', name: d.name || '' }, 200, { 'cache-control': 'no-store' });
  }
  if (path === 'kakao/complete' && method === 'POST') {
    let d; try { d = await request.json(); } catch { return err('잘못된 요청 형식입니다.'); }
    const row = await readToken(env, 'social', str(d.token, 100));
    if (!row) return err('카카오 로그인 시간이 지났습니다. 다시 카카오로 시작해 주세요.', 400, 'BAD_TOKEN');
    const pd = safe(row.data), email = str(d.email, 120).toLowerCase(), name = str(d.name, 40), phone = str(d.phone, 30).replace(/[^0-9-+]/g, ''), org = str(d.org, 80);
    if (!isEmail(email)) return err('이메일 주소를 확인해 주세요.');
    if (!name) return err('이름을 적어 주세요.');
    if (phone.replace(/\D/g, '').length < 9) return err('휴대폰 번호를 확인해 주세요.');
    if (!d.agree_terms || !d.agree_privacy) return err('이용약관과 개인정보 수집·이용에 동의해 주세요.');
    if (!d.agree_age) return err('만 14세 이상만 가입할 수 있습니다.');
    if (await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first()) return err('이미 가입된 이메일입니다. 그 계정으로 로그인한 뒤 마이페이지에서 ‘카카오 연결’을 눌러 주세요.', 409, 'EMAIL_TAKEN');
    if (await env.DB.prepare("SELECT 1 AS x FROM member_social WHERE provider = 'kakao' AND sub = ?").bind(pd.sub).first()) return err('이미 연결된 카카오 계정입니다. 카카오로 로그인해 주세요.', 409, 'LINKED');
    await useToken(env, row);
    const t = now();
    await env.DB.prepare('INSERT INTO members (email, name, phone, org, pw_hash, agree_marketing, agreed_at, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(email, name, phone, org, 'social$kakao', d.agree_marketing ? 1 : 0, t, 'active', t).run();   // 비밀번호 없음 — 재설정 메일로 정할 수 있음
    const m = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
    await env.DB.prepare('INSERT INTO member_social (provider, sub, member_id, created_at) VALUES (?,?,?,?)').bind('kakao', pd.sub, m.id, t).run();
    if (d.agree_marketing) await env.DB.prepare('INSERT INTO member_consent_log (member_id, value, source, created_at) VALUES (?,?,?,?)').bind(m.id, 1, 'signup-kakao', t).run();
    await log(env, 'member.created', String(m.id), 'member', { via: 'kakao', marketing: !!d.agree_marketing });
    return withCookies(json({ ok: true, next: safeNext(pd.next) }), await startSession(env, request, m.id));
  }

  // ---- 아래는 로그인한 회원만 ----
  if (!['social', 'link-booking'].includes(path)) return null;
  const me = await getMember(request, env);
  if (!me) return err('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED');
  if (path === 'social' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT provider, created_at FROM member_social WHERE member_id = ?').bind(me.id).all();
    const pw = await env.DB.prepare('SELECT pw_hash FROM members WHERE id = ?').bind(me.id).first();
    return json({ ok: true, kakao_ready: kakaoReady(env), reset_email: mailReady(env), password_set: !String((pw && pw.pw_hash) || '').startsWith('social$'), items: results || [] }, 200, { 'cache-control': 'no-store' });
  }
  if (path === 'link-booking' && method === 'POST') {
    let d; try { d = await request.json(); } catch { return err('잘못된 요청 형식입니다.'); }
    const last4 = str(d.phone_last4, 8).replace(/\D/g, ''), code = str(d.booking_code, 20).toUpperCase().replace(/\s+/g, ''), date = str(d.date, 10);
    if (last4.length !== 4 || (!validCode(code) && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return err('이용일(또는 예약번호)과 휴대폰 뒷 4자리를 확인해 주세요.');
    if (await tooMany(env, 'mlink:' + me.id, 10, 10)) return err('짧은 시간에 시도가 많았습니다. 10분 뒤 다시 시도해 주세요.', 429, 'TOO_MANY');
    await hit(env, 'mlink:' + me.id, 10);
    let codes = [];
    if (validCode(code)) { const b = await env.DB.prepare('SELECT booking_code, phone_last4 FROM bookings WHERE booking_code = ?').bind(code).first(); if (b && b.phone_last4 === last4) codes = [b.booking_code]; }
    else codes = (await findByDate(env, date, last4)).map(b => b.booking_code);
    if (!codes.length) return err('예약을 찾지 못했습니다. 이용일(또는 예약번호)과 예약자 휴대폰 뒷 4자리를 확인해 주세요.', 404, 'NOT_FOUND');
    for (const c of codes) await env.DB.prepare('INSERT OR IGNORE INTO member_booking_links (member_id, booking_code, created_at) VALUES (?,?,?)').bind(me.id, c, now()).run();
    await log(env, 'member.booking_linked', String(me.id), 'member', { count: codes.length });
    return json({ ok: true, linked: codes.length });
  }
  return null;
}
