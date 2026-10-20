// 운영자 API — 모든 경로는 X-Admin-Key 헤더 검증을 거칩니다.
import { json, err, hasDb, readJson, str, num, isDate, now, uniqueRef, log, hashPassword, requireAdmin, adminKeyOk, adminCookie,
  randomToken, sha256, later, getCookie, withCookies, clientIp, sameOrigin, tooMany, hit, clearHits, kstToday } from '../_lib.js';
import { cateringAdmin } from '../_catering.js';
// 운영 설정 (settings 표에 JSON으로 저장) — 공개 저장소·홈페이지 파일에 두지 않을 값은 관리자 화면에서 입력해 여기에 둡니다.
const SETTINGS = {
  catering: {   // 출장뷔페: 발주처 연락처와 1인 수수료, 발주처 코스 이름
    defaults: { markup: 5000, vendor_name: '', vendor_manager: '', vendor_phone: '', vendor_kakao: '', vendor_email: '', order_note: '',
      codes: { small: '소수 스페셜', basic: 'B코스', classic: 'C코스', deluxe: 'D코스', premium: 'E코스', signature: 'F코스', vip: '스페셜코스', partyA: '다과A', partyB: '다과B', galbi: '특선갈비탕' } },
    clean(v, def) {
      const o = { markup: Math.max(0, Math.min(100000, Math.round(num(v.markup) ?? def.markup))) };
      for (const k of ['vendor_name', 'vendor_manager', 'vendor_phone', 'vendor_kakao', 'vendor_email']) o[k] = str(v[k], 120);
      o.order_note = str(v.order_note, 1000);
      o.codes = {}; const c = (v.codes && typeof v.codes === 'object') ? v.codes : {};
      for (const k of Object.keys(def.codes)) o.codes[k] = str(c[k], 40) || def.codes[k];
      return o;
    } }
};
function settingsValue(key, raw) { const S = SETTINGS[key]; let v = {}; try { v = raw ? JSON.parse(raw) : {}; } catch {} return S.clean({ ...S.defaults, ...v, codes: { ...S.defaults.codes, ...(v.codes || {}) } }, S.defaults); }
const STATUSES = ['문의 접수', '조건 확인', '견적 발송', '결제 대기', '예약 확정', '이용 완료', '취소·환불'];
// 삭제한 문의는 지우지 않고 이 상태로 보관합니다(고객 DB 관리용). 목록·집계에서는 빠지고 '삭제된 문의'에서만 보입니다.
const DELETED = '삭제됨';
// 예약 대기(같은 날 아직 확정되지 않은 예약 문의) — 대기 순번은 data.wait_rank, 없으면 문의가 들어온 순서
const PENDING = "('문의 접수', '조건 확인', '견적 발송', '결제 대기')";
const WAIT_ORDER = "CASE WHEN json_extract(i.data, '$.wait_rank') IS NULL THEN 1 ELSE 0 END, CAST(json_extract(i.data, '$.wait_rank') AS INTEGER), i.created_at, i.ref";
async function waitList(env, date) {
  const { results } = await env.DB.prepare(`SELECT i.ref FROM inquiries i WHERE i.status IN ${PENDING} AND i.event_date = ?
    AND NOT EXISTS (SELECT 1 FROM bookings b2 WHERE b2.inquiry_ref = i.ref AND b2.status <> 'cancelled') ORDER BY ${WAIT_ORDER}`).bind(date).all();
  return (results || []).map(r => r.ref);
}
// 두 시간대가 겹치는지 (시간 정보가 없는 예약은 겹친다고 봅니다)
function overlaps(s1, e1, s2, e2) { if (s1 == null || e1 == null || s2 == null || e2 == null) return true; return s1 < e2 && s2 < e1; }
const OPEN = ['문의 접수', '조건 확인', '견적 발송', '결제 대기'];
// 문의 경로: 홈페이지 · 네이버 · 스페이스클라우드 · SNS · 카카오톡 · 전화 · 이메일 · 방문 · 기타(직접 입력은 channel_note)
const CHANNELS = ['web', 'naver', 'spacecloud', 'sns', 'kakao', 'phone', 'email', 'visit', 'other'];
const OPT_KEYS = ['manager', 'cleaning', 'disposable', 'banner', 'xbanner'];
function cleanOptions(o) {
  const out = {}; if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const k of OPT_KEYS) { const v = o[k]; if (!v) continue; out[k] = (typeof v === 'object') ? { count: Math.max(1, Math.min(10, num(v.count) || 1)), hours: Math.max(1, Math.min(24, num(v.hours) || 1)) } : true; }
  return out;
}
function hourOk(h) { h = num(h); return h !== null && h >= 7 && h <= 31 ? h : null; }
function hl(h) { return (h >= 24 ? '다음 날 ' : '') + String(h % 24).padStart(2, '0') + ':00'; }
function amountOk(v) { const n = num(v); return n !== null && n >= 0 && n <= 1e9 ? Math.round(n) : null; }
const CH_LABEL = { web: '홈페이지', naver: '네이버', spacecloud: '스페이스클라우드', sns: 'SNS', kakao: '카카오톡', phone: '전화', email: '이메일', visit: '방문', other: '기타' };
function chText(ch, note) { return (CH_LABEL[ch] || '기타') + (note ? ' · ' + note : ''); }
const SLOT_OF = { '10-17': 'pkg-day', '10-24': 'pkg-allday', '18-31': 'pkg-allnight' };
// 관리자가 등록한 문의의 '문의 원문' 요약 (등록·수정 때 다시 만듭니다)
function adminSummary(d) {
  const sh = d.start_h, eh = d.end_h;
  return ['[관리자 직접 등록 · ' + chText(d.channel, d.channel_note) + ']',
    '이름: ' + d.name, d.phone ? '연락처: ' + d.phone : '', d.email ? '이메일: ' + d.email : '',
    d.date ? '날짜: ' + d.date + (sh != null ? ' ' + hl(sh) + '–' + (eh != null ? hl(eh) : '') : (d.t_start ? ' ' + d.t_start + '–' + (d.t_end || '') : '')) : '',
    d.headcount ? '인원: ' + d.headcount + '명' : '',
    d.total != null ? '금액: ' + Number(d.total).toLocaleString('ko-KR') + '원 (' + (d.amount_mode === 'auto' ? '요금표 계산' : '직접 입력') + ')' + (d.amount_note ? ' · ' + d.amount_note : '') : '',
    d.message ? '내용: ' + d.message : ''].filter(Boolean).join('\n');
}
// 문의 삭제: 지우지 않고 '삭제됨' 상태로 보관합니다. 확정 예약·결제 완료 주문이 걸려 있으면 막습니다. 견적·예약·체크리스트 연결은 그대로 둬 복원하면 원래대로 돌아옵니다.
async function deleteInquiry(env, ref) {
  const row = await env.DB.prepare('SELECT ref, status, event_date, data, created_at FROM inquiries WHERE ref = ?').bind(ref).first();
  if (!row) return { ref, ok: false, code: 'NOT_FOUND', reason: '문의를 찾을 수 없습니다.' };
  if (row.status === DELETED) return { ref, ok: true, already: true };
  const bk0 = await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref = ? AND status = 'confirmed' LIMIT 1").bind(ref).first();
  if (bk0) return { ref, ok: false, code: 'HAS_BOOKING', reason: '확정 예약(' + bk0.booking_code + ')이 연결되어 있습니다. 예약 관리에서 예약을 먼저 취소해 주세요.' };
  const od0 = await env.DB.prepare("SELECT oid FROM orders WHERE inquiry_ref = ? AND status = 'paid' LIMIT 1").bind(ref).first();
  if (od0) return { ref, ok: false, code: 'HAS_ORDER', reason: '결제 완료된 주문(' + od0.oid + ')이 연결되어 있습니다. 주문·결제 탭에서 환불 기록을 먼저 남겨 주세요.' };
  const t = now();
  await env.DB.prepare("UPDATE inquiries SET status = ?, data = json_set(COALESCE(data, '{}'), '$.deleted_at', ?, '$.deleted_from', ?), updated_at = ? WHERE ref = ?").bind(DELETED, t, row.status, t, ref).run();
  await log(env, 'inquiry.deleted', ref, 'admin', { status: row.status });
  return { ref, ok: true };
}
// 삭제된 문의 복원: 삭제하기 전 상태로 되돌립니다.
async function restoreInquiry(env, ref) {
  const row = await env.DB.prepare('SELECT ref, status, data FROM inquiries WHERE ref = ?').bind(ref).first();
  if (!row) return { ref, ok: false, code: 'NOT_FOUND', reason: '문의를 찾을 수 없습니다.' };
  if (row.status !== DELETED) return { ref, ok: true, already: true };
  const d = safe(row.data), back = STATUSES.includes(d.deleted_from) ? d.deleted_from : '문의 접수';
  await env.DB.prepare("UPDATE inquiries SET status = ?, data = json_remove(COALESCE(data, '{}'), '$.deleted_at', '$.deleted_from'), updated_at = ? WHERE ref = ?").bind(back, now(), ref).run();
  await log(env, 'inquiry.restored', ref, 'admin', { status: back });
  return { ref, ok: true, status: back };
}
// 완전 삭제: '삭제된 문의'에 있는 건만 가능합니다(고객의 개인정보 삭제 요청·보유 기간 만료 때). 견적·지난 예약·주문 기록은 남긴 채 연결만 끊습니다.
async function purgeInquiry(env, ref) {
  const row = await env.DB.prepare('SELECT ref, status, event_date, data, created_at FROM inquiries WHERE ref = ?').bind(ref).first();
  if (!row) return { ref, ok: false, code: 'NOT_FOUND', reason: '문의를 찾을 수 없습니다.' };
  if (row.status !== DELETED) return { ref, ok: false, code: 'NOT_DELETED', reason: '먼저 삭제해 \'삭제된 문의\'로 옮긴 뒤 완전 삭제할 수 있습니다.' };
  const bk = await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref = ? AND status = 'confirmed' LIMIT 1").bind(ref).first();
  if (bk) return { ref, ok: false, code: 'HAS_BOOKING', reason: '확정 예약(' + bk.booking_code + ')이 연결되어 있습니다. 예약 관리에서 예약을 먼저 취소해 주세요.' };
  const od = await env.DB.prepare("SELECT oid FROM orders WHERE inquiry_ref = ? AND status = 'paid' LIMIT 1").bind(ref).first();
  if (od) return { ref, ok: false, code: 'HAS_ORDER', reason: '결제 완료된 주문(' + od.oid + ')이 연결되어 있습니다. 주문·결제 탭에서 환불 기록을 먼저 남겨 주세요.' };
  const stmts = [
    env.DB.prepare('UPDATE bookings SET inquiry_ref = NULL WHERE inquiry_ref = ?').bind(ref),
    env.DB.prepare('UPDATE quotes SET inquiry_ref = NULL WHERE inquiry_ref = ?').bind(ref),
    env.DB.prepare('UPDATE orders SET inquiry_ref = NULL WHERE inquiry_ref = ?').bind(ref),
    env.DB.prepare('DELETE FROM inquiry_checks WHERE ref = ?').bind(ref),
    env.DB.prepare('DELETE FROM inquiries WHERE ref = ?').bind(ref)
  ];
  if (typeof env.DB.batch === 'function') await env.DB.batch(stmts); else for (const st of stmts) await st.run();
  const d = safe(row.data);
  await log(env, 'inquiry.purged', ref, 'admin', { status: d.deleted_from || '', event_date: row.event_date, channel: d.channel || 'web', created_at: row.created_at });
  return { ref, ok: true };
}

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
      counts[DELETED] = await one('SELECT COUNT(*) AS n FROM inquiries WHERE status = ?', DELETED);
      const latestQuote = "(SELECT q.total FROM quotes q WHERE q.inquiry_ref = i.ref ORDER BY q.id DESC LIMIT 1)";
      const cols = `i.ref, i.status, i.name, i.phone, i.event_date, i.headcount, i.created_at, i.updated_at, json_extract(i.data, '$.purpose') AS purpose, json_extract(i.data, '$.inquiry_type') AS inquiry_type, json_extract(i.data, '$.channel') AS channel, json_extract(i.data, '$.channel_note') AS channel_note, json_extract(i.data, '$.reserve') AS reserve, json_extract(i.data, '$.total') AS est_total, json_extract(i.data, '$.catering.summary') AS catering, ${latestQuote} AS quote_total`;
      const out = {
        today, counts,
        upcoming_count: await one("SELECT COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ?", today, in14),
        reviews_pending: await one("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'"),
        members: await one('SELECT COUNT(*) AS n FROM members'), members_new: await one('SELECT COUNT(*) AS n FROM members WHERE created_at >= ?', ago7),
        hosts_new: await one('SELECT COUNT(*) AS n FROM host_applications WHERE created_at >= ?', ago7),
        todo: await all(`SELECT ${cols} FROM inquiries i WHERE i.status = '문의 접수' ORDER BY i.created_at ASC LIMIT 15`),
        followup: await all(`SELECT ${cols} FROM inquiries i WHERE i.status IN ('견적 발송', '결제 대기') AND COALESCE(i.updated_at, i.created_at) <= ? ORDER BY COALESCE(i.updated_at, i.created_at) ASC LIMIT 15`, ago2),
        soon: await all(`SELECT ${cols} FROM inquiries i WHERE i.status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기') AND i.event_date >= ? AND i.event_date <= ? ORDER BY i.event_date ASC LIMIT 15`, today, in14),
        upcoming: await all("SELECT booking_code, inquiry_ref, customer_name, phone, date, slot, headcount, memo, amount, start_h, end_h FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ? ORDER BY date ASC LIMIT 20", today, in14),
        month: {
          month,
          inquiries: await one("SELECT COUNT(*) AS n FROM inquiries WHERE status <> '삭제됨' AND substr(created_at, 1, 7) = ?", month),
          confirmed: await one("SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('예약 확정', '이용 완료') AND substr(event_date, 1, 7) = ?", month),
          confirmed_amount: await one(`SELECT COALESCE(SUM(${latestQuote}), 0) AS n FROM inquiries i WHERE i.status IN ('예약 확정', '이용 완료') AND substr(i.event_date, 1, 7) = ?`, month),
          quoted_amount: await one(`SELECT COALESCE(SUM(${latestQuote}), 0) AS n FROM inquiries i WHERE i.status IN ('견적 발송', '결제 대기') `),
          orders_paid: await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND test = 0 AND substr(paid_at, 1, 7) = ?", month),
          orders_amount: await one("SELECT COALESCE(SUM(price), 0) AS n FROM orders WHERE status = 'paid' AND test = 0 AND substr(paid_at, 1, 7) = ?", month),
        },
        orders_recent: await all("SELECT oid, title, event_date, price, buyer_name, status, test, paid_at, created_at FROM orders WHERE status IN ('paid','failed') ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 8"),
        orders_today_paid: await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND substr(paid_at, 1, 10) = ?", today)
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
      let wait = null;
      if (r.event_date && ['문의 접수', '조건 확인', '견적 발송', '결제 대기'].includes(r.status)) { const wl = await waitList(env, r.event_date); const no = wl.indexOf(r.ref) + 1; if (no) wait = { no, total: wl.length, date: r.event_date }; }
      return json({ ok: true, item: { ...r, data: safe(r.data) }, checks: safe(c && c.checks), quotes: (qs || []).map(q => ({ ...q, data: safe(q.data) })), bookings: bk || [], log: lg || [], wait });
    }
    if (path === 'inquiries' && method === 'POST') {
      // 카카오톡·전화·이메일·방문으로 받은 문의를 관리자가 직접 등록합니다.
      const d = await readJson(request);
      const name = str(d.name, 80), phone = str(d.phone, 30).replace(/[^0-9-+]/g, ''), email = str(d.email, 120);
      if (!name) return err('고객 이름을 적어 주세요.');
      const date = str(d.date, 10); if (date && !isDate(date)) return err('날짜를 확인해 주세요.');
      const channel = CHANNELS.includes(d.channel) ? d.channel : 'other';
      const channel_note = str(d.channel_note, 40);
      let start_h = hourOk(d.start_h), end_h = hourOk(d.end_h);
      if (start_h !== null && (end_h === null || end_h <= start_h)) end_h = null;
      if (start_h === null) end_h = null;
      const total = amountOk(d.total), amount_mode = d.amount_mode === 'manual' ? 'manual' : (d.amount_mode === 'auto' ? 'auto' : '');
      const data = { inquiry_type: ['event', 'regular', 'partner'].includes(d.inquiry_type) ? d.inquiry_type : 'event', space_id: 'megaspot-gundae', channel, channel_note,
        purpose: str(d.purpose, 40), date, start_h, end_h,
        t_start: start_h !== null ? hl(start_h).replace('다음 날 ', '') : str(d.t_start, 5), t_end: end_h !== null ? hl(end_h).replace('다음 날 ', '') : str(d.t_end, 5),
        slot: start_h !== null ? 'custom' : '', headcount: num(d.headcount), name, phone, email, regular: !!d.regular, options: cleanOptions(d.options),
        pkg: str(d.pkg, 20), total, amount_mode: total !== null ? (amount_mode || 'manual') : '', amount_note: str(d.amount_note, 200), estimate: str(d.estimate, 3000),
        org: str(d.org, 120), message: str(d.message, 2000), source: 'admin', summary: '' };
      data.summary = adminSummary(data);
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
      const st = str(url.searchParams.get('status'), 20), q = str(url.searchParams.get('q'), 60), ty = str(url.searchParams.get('type'), 20), ch = str(url.searchParams.get('ch'), 20);
      let sql = 'SELECT ref, space_id, status, name, phone, email, event_date, headcount, data, memo, created_at, updated_at, (SELECT q.total FROM quotes q WHERE q.inquiry_ref = inquiries.ref ORDER BY q.id DESC LIMIT 1) AS quote_total FROM inquiries WHERE 1=1'; const b = [];
      if (st === 'open') { sql += " AND status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기')"; } else if (st === 'deleted' || st === DELETED) { sql += ' AND status = ?'; b.push(DELETED); } else if (st) { sql += ' AND status = ?'; b.push(st); } else { sql += ' AND status <> ?'; b.push(DELETED); }
      if (['event', 'regular', 'partner'].includes(ty)) { sql += " AND COALESCE(json_extract(data, '$.inquiry_type'), 'event') = ?"; b.push(ty); }
      if (CHANNELS.includes(ch)) { sql += " AND COALESCE(json_extract(data, '$.channel'), 'web') = ?"; b.push(ch); }
      if (q) { sql += ' AND (name LIKE ? OR phone LIKE ? OR ref LIKE ? OR email LIKE ?)'; b.push('%' + q + '%', '%' + q + '%', '%' + q.toUpperCase() + '%', '%' + q + '%'); }
      sql += ' ORDER BY created_at DESC LIMIT 300';
      const { results } = await env.DB.prepare(sql).bind(...b).all();
      return json({ ok: true, items: (results || []).map(r => ({ ...r, data: safe(r.data) })) });
    }
    // 선택한 문의 여러 건 삭제
    if (path === 'inquiries/delete' && method === 'POST') {
      const d = await readJson(request);
      const refs = Array.from(new Set((Array.isArray(d.refs) ? d.refs : []).map(r => str(r, 20).toUpperCase()).filter(r => /^[A-Z0-9-]{4,20}$/.test(r)))).slice(0, 100);
      if (!refs.length) return err('삭제할 문의를 골라 주세요.');
      const results = []; for (const r of refs) results.push(await deleteInquiry(env, r));
      return json({ ok: true, deleted: results.filter(r => r.ok).map(r => r.ref), skipped: results.filter(r => !r.ok) });
    }
    // 선택한 삭제 문의 여러 건 복원
    if (path === 'inquiries/restore' && method === 'POST') {
      const d = await readJson(request);
      const refs = Array.from(new Set((Array.isArray(d.refs) ? d.refs : []).map(r => str(r, 20).toUpperCase()).filter(r => /^[A-Z0-9-]{4,20}$/.test(r)))).slice(0, 100);
      if (!refs.length) return err('복원할 문의를 골라 주세요.');
      const results = []; for (const r of refs) results.push(await restoreInquiry(env, r));
      return json({ ok: true, restored: results.filter(r => r.ok).map(r => r.ref), skipped: results.filter(r => !r.ok) });
    }
    const mRs = path.match(/^inquiries\/([A-Z0-9-]+)\/(restore|purge)$/);
    if (mRs && method === 'POST') {
      const r = mRs[2] === 'restore' ? await restoreInquiry(env, mRs[1]) : await purgeInquiry(env, mRs[1]);
      if (!r.ok) return err(r.reason, r.code === 'NOT_FOUND' ? 404 : 409, r.code);
      return json({ ok: true, ref: r.ref, status: r.status || '' });
    }
    const mInq = path.match(/^inquiries\/([A-Z0-9-]+)$/);
    if (mInq && method === 'DELETE') {
      const r = await deleteInquiry(env, mInq[1]);
      if (!r.ok) return err(r.reason, r.code === 'NOT_FOUND' ? 404 : 409, r.code);
      return json({ ok: true, ref: r.ref, kept: true });
    }
    if (mInq && method === 'PATCH') {
      const d = await readJson(request); const ref = mInq[1]; const sets = []; const b = [];
      if (d.edit) {
        // 문의 내용 수정 (고객 정보·행사 조건·금액). 고객이 보낸 원문 요약은 그대로 두고, 관리자 등록 건만 요약을 다시 만듭니다.
        const row = await env.DB.prepare('SELECT name, phone, email, event_date, headcount, data, memo FROM inquiries WHERE ref = ?').bind(ref).first();
        if (!row) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
        const data = safe(row.data);
        const name = str(d.name, 80), phone = str(d.phone, 30).replace(/[^0-9-+]/g, ''), email = str(d.email, 120);
        if (!name) return err('고객 이름을 적어 주세요.');
        const date = str(d.date, 10); if (date && !isDate(date)) return err('날짜를 확인해 주세요.');
        let start_h = hourOk(d.start_h), end_h = hourOk(d.end_h);
        if (start_h !== null && (end_h === null || end_h <= start_h)) end_h = null;
        if (start_h === null) end_h = null;
        const headcount = num(d.headcount);
        if (headcount !== null && (headcount < 1 || headcount > 1000)) return err('인원을 확인해 주세요.');
        const pick = o => ({ 경로: chText(o.channel || 'web', o.channel_note), 이름: o.name || '', 연락처: o.phone || '', 이메일: o.email || '', 이용일: o.date || '', 시간: o.start_h != null ? hl(o.start_h) + '–' + (o.end_h != null ? hl(o.end_h) : '') : (o.t_start ? o.t_start + '–' + (o.t_end || '') : ''), 인원: o.headcount || '', 목적: o.purpose || '', 금액: o.total != null ? o.total : '', 옵션: JSON.stringify(o.options || {}), 내용: o.message || '' });
        const before = pick({ ...data, name: data.name || row.name, phone: data.phone || row.phone, email: data.email || row.email, date: data.date || row.event_date, headcount: data.headcount || row.headcount });
        if ((date || '') !== (data.date || row.event_date || '')) { delete data.wait_rank; delete data.wait_rank_at; }   // 이용일이 바뀌면 그 날 대기 순번 맨 뒤로
        Object.assign(data, { name, phone, email, date, headcount, purpose: str(d.purpose, 40), options: cleanOptions(d.options), regular: !!d.regular, message: str(d.message, 2000) });
        if (['event', 'regular', 'partner'].includes(d.inquiry_type)) data.inquiry_type = d.inquiry_type;
        if (CHANNELS.includes(d.channel)) { data.channel = d.channel; data.channel_note = str(d.channel_note, 40); }
        if (start_h !== null) {
          Object.assign(data, { start_h, end_h, t_start: hl(start_h).replace('다음 날 ', ''), t_end: end_h !== null ? hl(end_h).replace('다음 날 ', '') : '' });
          if (!/^pkg-/.test(data.slot || '')) data.slot = 'custom';
        } else if (data.start_h != null) {
          // 시간을 '미정'으로 바꾼 경우
          Object.assign(data, { start_h: null, end_h: null, t_start: '', t_end: '', slot: '' });
        }
        const mode = ['auto', 'manual', 'none'].includes(d.amount_mode) ? d.amount_mode : 'keep';
        if (mode === 'auto' || mode === 'manual') {
          const t = amountOk(d.total); if (t === null) return err('금액을 확인해 주세요.');
          if (data.estimate && data.source !== 'admin' && !data.estimate_admin && !data.estimate_customer) data.estimate_customer = data.estimate;
          Object.assign(data, { total: t, amount_mode: mode, amount_note: str(d.amount_note, 200) });
          if (d.estimate !== undefined) { data.estimate = str(d.estimate, 3000); data.estimate_admin = true; data.pkg = str(d.pkg, 20); }
        } else if (mode === 'none') {
          Object.assign(data, { total: null, amount_mode: '', amount_note: '' });
        }
        if (data.source === 'admin') data.summary = adminSummary(data);
        data.edited_at = now();
        const after = pick(data);
        const changed = Object.keys(after).filter(k => String(after[k]) !== String(before[k]));
        const memo = d.memo !== undefined ? str(d.memo, 2000) : row.memo;
        await env.DB.prepare('UPDATE inquiries SET name = ?, phone = ?, email = ?, event_date = ?, headcount = ?, data = ?, memo = ?, updated_at = ? WHERE ref = ?')
          .bind(name, phone, email, date || null, headcount, JSON.stringify(data), memo, now(), ref).run();
        await log(env, 'inquiry.edited', ref, 'admin', { changed });
        return json({ ok: true, changed });
      }
      if (d.status !== undefined) { if (!STATUSES.includes(d.status)) return err('상태 값이 올바르지 않습니다.'); sets.push('status = ?'); b.push(d.status); }
      if (d.memo !== undefined) { sets.push('memo = ?'); b.push(str(d.memo, 2000)); }
      const jp = [], jb = [];   // data(JSON) 안의 값은 json_set 하나로 모아 바꿉니다(같은 칸을 두 번 SET 하면 앞의 것이 무시됨)
      if (d.total !== undefined) {
        const t = d.total === '' || d.total === null ? null : amountOk(d.total);
        if (d.total !== '' && d.total !== null && t === null) return err('금액을 확인해 주세요.');
        jp.push("'$.total', ?", "'$.amount_mode', ?", "'$.amount_note', ?"); jb.push(t, t === null ? '' : 'manual', str(d.amount_note, 200));
      }
      if (d.channel !== undefined) {
        if (!CHANNELS.includes(d.channel)) return err('문의 경로를 확인해 주세요.');
        const note = str(d.channel_note, 40);
        jp.push("'$.channel', ?", "'$.channel_note', ?"); jb.push(d.channel, note);
      }
      if (d.catering !== undefined) {   // 관리자 화면 '출장뷔페'에서 이 문의의 출장뷔페 구성을 저장 (null 이면 지움)
        const c = d.catering === null ? null : cateringAdmin(d.catering);
        if (d.catering !== null && !c) return err('출장뷔페 구성을 확인해 주세요.');
        jp.push("'$.catering', json(?)"); jb.push(JSON.stringify(c));
      }
      if (jp.length) { sets.push("data = json_set(COALESCE(data, '{}'), " + jp.join(', ') + ')'); b.push(...jb); }
      if (!sets.length) return err('변경할 내용이 없습니다.');
      sets.push('updated_at = ?'); b.push(now(), ref);
      await env.DB.prepare('UPDATE inquiries SET ' + sets.join(', ') + ' WHERE ref = ?').bind(...b).run();
      await log(env, 'inquiry.updated', ref, 'admin', d);
      return json({ ok: true });
    }

    // ---- 운영 설정 (출장뷔페 발주처·수수료 등) ----
    const mSet = path.match(/^settings\/([a-z_]+)$/);
    if (mSet && SETTINGS[mSet[1]]) {
      const key = mSet[1];
      if (method === 'GET') {
        const row = await env.DB.prepare('SELECT value, updated_at FROM settings WHERE key = ?').bind(key).first();
        return json({ ok: true, key, value: settingsValue(key, row && row.value), saved: !!row, updated_at: row ? row.updated_at : null });
      }
      if (method === 'PUT') {
        const d = await readJson(request); const v = SETTINGS[key].clean({ ...SETTINGS[key].defaults, ...(d.value || {}) }, SETTINGS[key].defaults);
        await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, JSON.stringify(v), now()).run();
        await log(env, 'settings.updated', key, 'admin', {});
        return json({ ok: true, key, value: v });
      }
    }

    // ---- 문의 경로별 집계 (문의 접수일 기준, 한국 시간) ----
    if (path === 'channels' && method === 'GET') {
      const from = str(url.searchParams.get('from'), 10), to = str(url.searchParams.get('to'), 10);
      if ((from && !isDate(from)) || (to && !isDate(to))) return err('기간을 확인해 주세요.');
      const f = from || '0000-01-01', t = to || '9999-12-31';
      const where = "date(created_at, '+9 hours') BETWEEN ? AND ? AND status <> '삭제됨'";
      const { results } = await env.DB.prepare(`SELECT COALESCE(json_extract(data, '$.channel'), 'web') AS ch, COUNT(*) AS n,
          SUM(CASE WHEN status IN ('예약 확정', '이용 완료') THEN 1 ELSE 0 END) AS won,
          SUM(CASE WHEN status = '취소·환불' THEN 1 ELSE 0 END) AS lost
        FROM inquiries WHERE ${where} GROUP BY ch`).bind(f, t).all();
      const { results: notes } = await env.DB.prepare(`SELECT COALESCE(json_extract(data, '$.channel'), 'web') AS ch, json_extract(data, '$.channel_note') AS note, COUNT(*) AS n
        FROM inquiries WHERE ${where} AND COALESCE(json_extract(data, '$.channel_note'), '') <> '' GROUP BY ch, note ORDER BY n DESC LIMIT 60`).bind(f, t).all();
      const { results: web } = await env.DB.prepare(`SELECT COALESCE(json_extract(data, '$.came_from.label'), '기록 없음') AS label, COUNT(*) AS n
        FROM inquiries WHERE ${where} AND COALESCE(json_extract(data, '$.channel'), 'web') = 'web' GROUP BY label ORDER BY n DESC LIMIT 20`).bind(f, t).all();
      const map = {}; (results || []).forEach(r => { map[r.ch] = r; });
      const items = CHANNELS.map(c => ({ channel: c, label: CH_LABEL[c], total: (map[c] || {}).n || 0, won: (map[c] || {}).won || 0, lost: (map[c] || {}).lost || 0,
        notes: (notes || []).filter(x => x.ch === c).map(x => ({ note: x.note, n: x.n })) }));
      const total = items.reduce((a, x) => a + x.total, 0), won = items.reduce((a, x) => a + x.won, 0);
      return json({ ok: true, from: f, to: t, total, won, items, web: web || [] });
    }

    // ---- 예약 문의 → 예약 확정 (한 번에: 예약 등록 + 달력 마감 + 문의 상태 '예약 확정') ----
    const mCf = path.match(/^inquiries\/([A-Z0-9-]+)\/confirm$/);
    if (mCf && method === 'POST') {
      const ref = mCf[1], d = await readJson(request);
      const row = await env.DB.prepare('SELECT ref, space_id, status, name, phone, event_date, headcount, data FROM inquiries WHERE ref = ?').bind(ref).first();
      if (!row) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (row.status === DELETED) return err('삭제된 문의입니다. 먼저 복원한 뒤 예약을 확정해 주세요.', 409, 'DELETED');
      const data = safe(row.data);
      const active = await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled' LIMIT 1").bind(ref).first();
      if (active) return err('이미 예약(' + active.booking_code + ')으로 확정된 문의입니다.', 409, 'ALREADY_BOOKED');
      const date = str(d.date, 10) || row.event_date || data.date || '';
      if (!isDate(date)) return err('이용일을 정해 주세요.');
      const phone = str(row.phone || data.phone, 30), digits = phone.replace(/\D/g, '');
      if (digits.length < 9) return err('연락처가 없어 예약을 확정할 수 없습니다. 문의 내용 수정에서 연락처를 넣어 주세요.', 400, 'NO_PHONE');
      let bs = hourOk(d.start_h), be = hourOk(d.end_h); if (bs === null || be === null || be <= bs) { bs = null; be = null; }
      const headcount = d.headcount !== undefined && d.headcount !== '' ? num(d.headcount) : (row.headcount ?? data.headcount ?? null);
      const amount = d.amount === '' || d.amount == null ? null : amountOk(d.amount);
      if (d.amount !== '' && d.amount != null && amount === null) return err('금액을 확인해 주세요.');
      const space_id = row.space_id && row.space_id !== 'request' ? row.space_id : 'megaspot-gundae';
      const { results: same } = await env.DB.prepare("SELECT booking_code, customer_name, start_h, end_h FROM bookings WHERE space_id = ? AND date = ? AND status = 'confirmed'").bind(space_id, date).all();
      // 같은 날 다른 팀 예약은 받을 수 있습니다. 시간이 겹치는 예약(시간 미정 포함)이 있을 때만 한 번 더 확인합니다.
      const clash = (same || []).filter(x => overlaps(bs, be, x.start_h, x.end_h));
      if (clash.length && !d.force) return json({ ok: false, error: bs === null ? '이 날짜에 이미 확정된 예약이 있습니다. 이용 시간을 정하거나, 시간이 겹치지 않는지 확인한 뒤 다시 확정해 주세요.' : '같은 날 이용 시간이 겹치는 확정 예약이 있습니다. 시간을 확인한 뒤 다시 확정해 주세요.', code: 'DATE_HAS_BOOKING', bookings: clash }, 409);
      const code = await uniqueRef(env, 'bookings', 'booking_code', 'MS');
      const slot = bs !== null ? (SLOT_OF[bs + '-' + be] || 'custom') : (/^pkg-/.test(data.slot || '') ? data.slot : 'custom');
      const memo = str(d.memo, 2000) || [data.amount_note || '', chText(data.channel || 'web', data.channel_note)].filter(Boolean).join(' · ');
      const stmts = [
        env.DB.prepare('INSERT INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, memo, status, amount, start_h, end_h, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(code, space_id, ref, str(row.name || data.name, 80) || '(이름 없음)', phone, digits.slice(-4), date, slot, headcount, memo, 'confirmed', amount, bs, be, now()),
        env.DB.prepare("UPDATE inquiries SET status = '예약 확정', event_date = ?, updated_at = ? WHERE ref = ?").bind(date, now(), ref)
      ];
      if (d.block_calendar === true) stmts.push(env.DB.prepare('INSERT INTO calendar_blocks (space_id, date, state, memo) VALUES (?,?,?,?) ON CONFLICT(space_id, date) DO UPDATE SET state = excluded.state, memo = excluded.memo').bind(space_id, date, 'full', '예약 ' + code));
      if (typeof env.DB.batch === 'function') await env.DB.batch(stmts); else for (const st of stmts) await st.run();
      await log(env, 'booking.created', code, 'admin', { space_id, date, from: ref });
      await log(env, 'inquiry.confirmed', ref, 'admin', { booking_code: code, date, amount });
      const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE event_date = ? AND ref <> ? AND status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기')").bind(date, ref).first();
      return json({ ok: true, booking_code: code, date, others: (others || {}).n || 0, same_day: (same || []).length });
    }

    // ---- 입점 ----
    if (path === 'hosts' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT ref, status, data, created_at FROM host_applications ORDER BY created_at DESC LIMIT 200').all();
      return json({ ok: true, items: (results || []).map(r => ({ ...r, data: safe(r.data) })) });
    }

    // ---- 예약 ----
    if (path === 'bookings' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT booking_code, space_id, inquiry_ref, customer_name, phone, date, slot, headcount, memo, status, amount, start_h, end_h, created_at FROM bookings ORDER BY date DESC, created_at DESC LIMIT 300').all();
      return json({ ok: true, items: results || [] });
    }
    if (path === 'bookings' && method === 'POST') {
      const d = await readJson(request);
      const space_id = str(d.space_id, 60) || 'megaspot-gundae', name = str(d.customer_name, 80), phone = str(d.phone, 30), date = str(d.date, 10);
      if (!name || !phone || !isDate(date)) return err('예약자·연락처·이용일을 확인해 주세요.');
      const digits = phone.replace(/\D/g, ''); if (digits.length < 9) return err('연락처 형식을 확인해 주세요.');
      const code = await uniqueRef(env, 'bookings', 'booking_code', 'MS');
      let bs = hourOk(d.start_h), be = hourOk(d.end_h); if (bs === null || be === null || be <= bs) { bs = null; be = null; }
      await env.DB.prepare('INSERT INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, memo, status, amount, start_h, end_h, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(code, space_id, str(d.inquiry_ref, 20).toUpperCase() || null, name, phone, digits.slice(-4), date, str(d.slot, 20) || 'custom', num(d.headcount), str(d.memo, 2000), 'confirmed', amountOk(d.amount), bs, be, now()).run();
      if (d.block_calendar) await env.DB.prepare('INSERT INTO calendar_blocks (space_id, date, state, memo) VALUES (?,?,?,?) ON CONFLICT(space_id, date) DO UPDATE SET state = excluded.state, memo = excluded.memo').bind(space_id, date, 'full', '예약 ' + code).run();
      if (d.inquiry_ref) await env.DB.prepare("UPDATE inquiries SET status = '예약 확정', updated_at = ? WHERE ref = ?").bind(now(), str(d.inquiry_ref, 20).toUpperCase()).run();
      await log(env, 'booking.created', code, 'admin', { space_id, date });
      return json({ ok: true, booking_code: code });
    }
    // 예약 목록 — 확정 예약(bookings)과 날짜가 정해진 미확정 문의·예약 신청을 날짜순으로 함께 돌려줍니다.
    // 같은 날 예약 대기 순번 저장: refs 순서대로 1, 2, 3… (목록에 없는 대기자는 기존 순서대로 뒤에 붙임)
    if (path === 'reservations/waitlist' && method === 'POST') {
      const d = await readJson(request), date = str(d.date, 10);
      if (!isDate(date)) return err('날짜를 확인해 주세요.');
      const refs = Array.from(new Set((Array.isArray(d.refs) ? d.refs : []).map(r => str(r, 20).toUpperCase()).filter(r => /^[A-Z0-9-]{4,20}$/.test(r)))).slice(0, 200);
      if (!refs.length) return err('순서를 정할 문의가 없습니다.');
      const cur = await waitList(env, date);
      const bad = refs.filter(r => !cur.includes(r));
      if (bad.length) return err('이 날짜의 예약 대기 목록이 바뀌었습니다. 새로고침한 뒤 다시 정해 주세요.', 409, 'STALE');
      const order = refs.concat(cur.filter(r => !refs.includes(r))), t = now();
      const stmts = order.map((r, i) => env.DB.prepare("UPDATE inquiries SET data = json_set(COALESCE(data, '{}'), '$.wait_rank', ?, '$.wait_rank_at', ?) WHERE ref = ?").bind(i + 1, t, r));
      if (typeof env.DB.batch === 'function') await env.DB.batch(stmts); else for (const st of stmts) await st.run();
      await log(env, 'waitlist.updated', date, 'admin', { date, count: order.length });
      return json({ ok: true, date, order });
    }
    if (path === 'reservations' && method === 'GET') {
      const from = str(url.searchParams.get('from'), 10), to = str(url.searchParams.get('to'), 10);
      if ((from && !isDate(from)) || (to && !isDate(to))) return err('기간을 확인해 주세요.');
      const f = from || '0000-01-01', t = to || '9999-12-31';
      const latestQ = "(SELECT q.total FROM quotes q WHERE q.inquiry_ref = b.inquiry_ref ORDER BY q.id DESC LIMIT 1)";
      const { results: bks } = await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.inquiry_ref, b.customer_name, b.phone, b.date, b.slot, b.headcount, b.memo, b.status, b.amount, b.start_h, b.end_h, b.created_at,
          o.oid AS order_oid, o.price AS order_price, o.status AS order_status, ${latestQ} AS quote_total,
          json_extract(i.data, '$.total') AS inq_total, json_extract(i.data, '$.start_h') AS inq_start, json_extract(i.data, '$.end_h') AS inq_end, json_extract(i.data, '$.purpose') AS purpose, json_extract(i.data, '$.channel') AS channel, json_extract(i.data, '$.channel_note') AS channel_note, json_extract(i.data, '$.family') AS family
        FROM bookings b LEFT JOIN orders o ON o.booking_code = b.booking_code LEFT JOIN inquiries i ON i.ref = b.inquiry_ref
        WHERE b.date BETWEEN ? AND ? ORDER BY b.date ASC, COALESCE(b.start_h, json_extract(i.data, '$.start_h'), 99) ASC LIMIT 1000`).bind(f, t).all();
      const iqQ = "(SELECT q.total FROM quotes q WHERE q.inquiry_ref = i.ref ORDER BY q.id DESC LIMIT 1)";
      const { results: pend } = await env.DB.prepare(`SELECT i.ref, i.status, i.name, i.phone, i.event_date, i.headcount, i.created_at, ${iqQ} AS quote_total,
          json_extract(i.data, '$.total') AS inq_total, json_extract(i.data, '$.start_h') AS start_h, json_extract(i.data, '$.end_h') AS end_h, json_extract(i.data, '$.t_start') AS t_start, json_extract(i.data, '$.t_end') AS t_end,
          json_extract(i.data, '$.slot') AS slot, json_extract(i.data, '$.reserve') AS reserve, json_extract(i.data, '$.purpose') AS purpose, json_extract(i.data, '$.channel') AS channel, json_extract(i.data, '$.channel_note') AS channel_note, json_extract(i.data, '$.inquiry_type') AS inquiry_type, json_extract(i.data, '$.family') AS family, json_extract(i.data, '$.wait_rank') AS wait_rank
        FROM inquiries i WHERE i.status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기') AND i.event_date BETWEEN ? AND ?
          AND NOT EXISTS (SELECT 1 FROM bookings b2 WHERE b2.inquiry_ref = i.ref AND b2.status <> 'cancelled')
        ORDER BY i.event_date ASC LIMIT 1000`).bind(f, t).all();
      const items = [];
      const jarr = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.slice(0, 4) : []; } catch { return []; } };
      for (const b of bks || []) items.push({ family: jarr(b.family), kind: 'booking', code: b.booking_code, ref: b.inquiry_ref, name: b.customer_name, phone: b.phone, date: b.date, slot: b.slot,
        start_h: b.start_h ?? b.inq_start ?? null, end_h: b.end_h ?? b.inq_end ?? null, headcount: b.headcount, memo: b.memo, status: b.status, purpose: b.purpose || '', channel: b.order_oid ? 'online' : (b.channel || (b.inquiry_ref ? 'web' : '')), channel_note: b.channel_note || '',
        amount: b.amount ?? (b.order_price && b.order_status !== 'failed' ? b.order_price : null) ?? b.quote_total ?? b.inq_total ?? null,
        amount_src: b.amount != null ? 'booking' : (b.order_price ? 'order' : (b.quote_total != null ? 'quote' : (b.inq_total != null ? 'estimate' : ''))), order: b.order_oid || '' });
      for (const p of pend || []) items.push({ family: jarr(p.family), kind: 'pending', code: '', ref: p.ref, name: p.name, phone: p.phone, date: p.event_date, slot: p.slot, start_h: p.start_h ?? null, end_h: p.end_h ?? null,
        t_start: p.t_start || '', t_end: p.t_end || '', headcount: p.headcount, status: p.status, reserve: !!p.reserve, purpose: p.purpose || '', channel: p.channel || 'web', channel_note: p.channel_note || '', inquiry_type: p.inquiry_type || 'event', wait_rank: p.wait_rank == null ? null : Number(p.wait_rank), created_at: p.created_at,
        amount: p.quote_total ?? p.inq_total ?? null, amount_src: p.quote_total != null ? 'quote' : (p.inq_total != null ? 'estimate' : '') });
      items.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : ((a.start_h ?? 99) - (b.start_h ?? 99)));
      const und = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기') AND (event_date IS NULL OR event_date = '')").first();
      return json({ ok: true, from: f, to: t, today: kstToday(), items, undated: (und || {}).n || 0 });
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
      let sql = "SELECT m.id, m.email, m.name, m.phone, m.org, m.agree_marketing, m.status, m.created_at, m.last_login_at, (SELECT COUNT(*) FROM inquiries i WHERE json_extract(i.data, '$.member_id') = m.id AND i.status <> '삭제됨') AS inquiry_count FROM members m"; const b = [];
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

    // ---- 주문·결제 ----
    if (path === 'orders' && method === 'GET') {
      const st = str(url.searchParams.get('status'), 20), q = str(url.searchParams.get('q'), 60);
      let sql = 'SELECT oid, product_id, title, event_date, people, price, buyer_name, buyer_phone, buyer_email, status, pay_method, tid, appl_at, result_msg, booking_code, inquiry_ref, member_id, memo, test, created_at, paid_at, updated_at FROM orders WHERE 1=1'; const b = [];
      if (st) { sql += ' AND status = ?'; b.push(st); }
      if (q) { sql += ' AND (oid LIKE ? OR buyer_name LIKE ? OR buyer_phone LIKE ? OR booking_code LIKE ?)'; b.push('%' + q.toUpperCase() + '%', '%' + q + '%', '%' + q + '%', '%' + q.toUpperCase() + '%'); }
      sql += ' ORDER BY created_at DESC LIMIT 300';
      const { results } = await env.DB.prepare(sql).bind(...b).all();
      return json({ ok: true, items: results || [] });
    }
    const mOrd = path.match(/^orders\/([A-Z0-9-]+)$/);
    if (mOrd && method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM orders WHERE oid = ?').bind(mOrd[1]).first();
      if (!row) return err('주문을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const { results: lg } = await env.DB.prepare('SELECT kind, actor, detail, created_at FROM event_log WHERE ref = ? ORDER BY id DESC LIMIT 20').bind(mOrd[1]).all();
      return json({ ok: true, item: { ...row, data: safe(row.data) }, log: lg || [] });
    }
    if (mOrd && method === 'PATCH') {
      // 환불·취소는 이니시스 상점관리자에서 실제 처리한 뒤 여기서 상태만 기록합니다.
      const d = await readJson(request); const oid = mOrd[1]; const sets = [], b = [];
      if (d.status !== undefined) {
        if (!['paid', 'cancelled', 'refunded'].includes(d.status)) return err('상태 값이 올바르지 않습니다.');
        sets.push('status = ?'); b.push(d.status);
        if (d.status !== 'paid') {
          const row = await env.DB.prepare('SELECT booking_code, event_date FROM orders WHERE oid = ?').bind(oid).first();
          if (row && row.booking_code) {
            await env.DB.prepare("UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE booking_code = ?").bind(now(), row.booking_code).run();
            await env.DB.prepare('DELETE FROM calendar_blocks WHERE memo = ?').bind('예약 ' + row.booking_code).run();
          }
        }
      }
      if (d.memo !== undefined) { sets.push('memo = ?'); b.push(str(d.memo, 1000)); }
      if (!sets.length) return err('변경할 내용이 없습니다.');
      sets.push('updated_at = ?'); b.push(now(), oid);
      await env.DB.prepare('UPDATE orders SET ' + sets.join(', ') + ' WHERE oid = ?').bind(...b).run();
      await log(env, 'order.updated', oid, 'admin', d);
      return json({ ok: true });
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
  } catch (e) { console.error('admin', e && e.message); return err('처리 중 오류가 발생했습니다. (' + String(e && e.message || '').slice(0, 120) + ')', 500, 'SERVER_ERROR'); }
}
function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
