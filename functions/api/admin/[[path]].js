import {bookingNotificationsAdmin} from '../_booking_notifications.js';
import {reservationPaymentAdmin,paymentChecksFor} from '../_reservation_payment_checks.js';
import {cleanPhone2,bookingPhone2Sql,saveBookingPhone2,contactsAdmin} from '../_contacts.js';
import {rankedWaitsSql,waitList,waitSummary} from '../_reservation_waitlist.js';
import {bookingHourSql,confirmedOccupancyFreeSql} from '../_booking_availability.js';
import Calculation from '../../../assets/js/quote-calculation.js';
import {reconfirmationAdmin,reconfirmBooking} from '../_reconfirmation.js';
import {bookingReadiness} from '../_booking_readiness.js';
import {revenueAdmin} from '../_revenue.js';
import {cancellationAdmin} from '../_cancellation.js';
import {refundAmountSql} from '../_payapp_refund_history.js';
import {S,preserveLegacyPayments,settlementFor,settlementsFor,settlementAdmin,settlementRevisionSql} from '../_settlement.js';
// 운영자 API — 모든 경로는 X-Admin-Key 헤더 검증을 거칩니다.
import { json, err, hasDb, readJson, str, num, isDate, now, uniqueRef, log, hashPassword, requireAdmin, adminKeyOk, adminCookie,
  randomToken, sha256, later, getCookie, withCookies, clientIp, sameOrigin, tooMany, hit, clearHits, kstToday, SPACES, spaceOk }
  from '../_lib.js';
import {readFoodPricing,adminFoodPricing,saveFoodPricing,foodPricingData} from '../_food_pricing.js';
import {readCocktailPricing,publicCocktailPricing,adminCocktailPricing,saveCocktailPricing} from '../_cocktail_pricing.js';
import { depositNoticeAdmin } from '../_deposit_notifications.js';
import {transactionNoticeAdmin} from '../_transaction_notifications.js';
import { refundAdmin } from '../_deposit_refunds.js';
import {paymentScheduleAdmin} from '../_booking_payment_schedule.js';
import { portalAdmin } from '../_booking_portal.js';
import { cateringAdmin } from '../_catering.js';
import { cleanDoc, parseDoc, publicDoc, confirmToken, confirmationConditions } from '../_confirm.js';
import { inquiryAmountSql, bookingAmountSql, amountOverrideSql } from '../_amounts.js';
import {F,foodExtras,updateFood,syncFoodInput,cocktailAdmin,stripFoodItems,confirmationFoodData,foodDocuments} from '../_food_services.js';
import { receptionAdmin, receptionExtra, receptionDocument, receptionChanged, withoutReceptionItems, receptionRevision, syncReceptionInput, receptionConflict } from '../_reception.js';
import { batch, bookingClashes, conflictResponse, linkedBookingChanges, bookingStatusStatements } from '../_admin_booking.js';
import { guideAdmin, confirmedGuide, guideSummary, guideInquiryChecks } from '../_guide_messages.js';
import { platformAdmin, platformCounts } from '../_platform_admin.js';   // 입점·공간 등록·광고 신청, 등록 공간, 모임, 배너 광고
import { visitsAdmin, createVisit, visitsForInquiry, visitCounts, timeOk } from '../_visits.js';   // 현장답사 일정
import { cateringOrdersAdmin, cateringCounts, cateringOrderFor, ORDER_OF_BOOKING, ORDER_OF_INQUIRY, orderBrief } from '../_catering_orders.js';   // 출장뷔페 진행 건 (대기·확정)
// 운영 설정 (settings 표에 JSON으로 저장) — 공개 저장소·홈페이지 파일에 두지 않을 값은 관리자 화면에서 입력해 여기에 둡니다.
const SETTINGS = {
  catering: {   // 출장뷔페: 발주처 연락처와 1인 수수료, 발주처 코스 이름
    defaults: { markup: 5000, vendor_name: '', vendor_manager: '', vendor_phone: '', vendor_kakao: '', vendor_email: '', order_note: '',
      codes: { basic: 'B코스', classic: 'C코스', deluxe: 'D코스', premium: 'E코스', signature: 'F코스', vip: '스페셜코스', partyA: '다과A', partyB: '다과B', galbi: '특선갈비탕' } },
    clean(v, def) {
      const o = { markup: Math.max(0, Math.min(100000, Math.round(num(v.markup) ?? def.markup))) };
      for (const k of ['vendor_name', 'vendor_manager', 'vendor_phone', 'vendor_kakao', 'vendor_email']) o[k] = str(v[k], 120);
      o.order_note = str(v.order_note, 1000);
      o.codes = {}; const c = (v.codes && typeof v.codes === 'object') ? v.codes : {};
      for (const k of Object.keys(def.codes)) o.codes[k] = str(c[k], 40) || def.codes[k];
      // Small packages use the Basic supplier code for both flat-rate tiers.
      o.codes.small = o.codes.basic;
      return o;
    } }
};
function settingsValue(key, raw) { const S = SETTINGS[key]; let v = {}; try { v = raw ? JSON.parse(raw) : {}; } catch {} return S.clean({ ...S.defaults, ...v, codes: { ...S.defaults.codes, ...(v.codes || {}) } }, S.defaults); }
const STATUSES = ['문의 접수', '조건 확인', '견적 발송', '결제 대기', '예약 확정', '이용 완료', '취소·환불', '대기 취소'];
// 삭제한 문의는 지우지 않고 이 상태로 보관합니다(고객 DB 관리용). 목록·집계에서는 빠지고 '삭제된 문의'에서만 보입니다.
const DELETED = '삭제됨';
// Archived inquiries retain their linked cancellation records in inquiry detail.
const OPERATIONAL_BOOKING_SQL = `NOT (b.status='cancelled' AND EXISTS (
  SELECT 1 FROM inquiries archived WHERE archived.ref=b.inquiry_ref AND archived.status='${DELETED}'
))`;
// 두 시간대가 겹치는지 (시간 정보가 없는 예약은 겹친다고 봅니다)
function overlaps(s1, e1, s2, e2) { if (s1 == null || e1 == null || s2 == null || e2 == null) return true; return s1 < e2 && s2 < e1; }
const OPEN = ['문의 접수', '조건 확인', '견적 발송', '결제 대기'];
function rejoinWaitQueue(data) {
  delete data.wait_rank;
  delete data.wait_rank_at;
  // A move or restore joins the end, even when another inquiry arrived in the same second.
  data.wait_restored_at = new Date().toISOString().slice(0, 23).replace('T', ' ');
}
async function inquiryWait(env, ref, snapshot) {
  const row = snapshot || await env.DB.prepare('SELECT event_date,space_id,status FROM inquiries WHERE ref=?').bind(ref).first();
  if (!row?.event_date || !OPEN.includes(row.status)) return null;
  return (await waitSummary(env, row.event_date, row.space_id, ref)).wait;
}
// 문의 경로: 홈페이지 · 네이버 · 스페이스클라우드 · SNS · 카카오톡 · 전화 · 이메일 · 방문 · 기타(직접 입력은 channel_note)
const CHANNELS = ['web', 'naver', 'spacecloud', 'sns', 'kakao', 'phone', 'email', 'visit', 'other'];
const OPT_KEYS = ['manager', 'cleaning', 'disposable', 'banner', 'xbanner'];
function cleanOptions(o) {
  const out = {}; if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const k of OPT_KEYS) { const v = o[k]; if (!v) continue; out[k] = (typeof v === 'object') ? { count: Math.max(1, Math.min(10, num(v.count) || 1)), hours: Math.max(1, Math.min(24, num(v.hours) || 1)) } : true; }
  return out;
}
function hourOk(h) { h = num(h); return h !== null && h >= 0 && h <= 47 ? h : null; }
function hl(h) { return (h >= 24 ? '다음 날 ' : '') + String(h % 24).padStart(2, '0') + ':00'; }
function amountOk(v) { const n = num(v); return n !== null && n >= 0 && n <= 1e9 ? Math.round(n) : null; }
const CH_LABEL = { web: '홈페이지', naver: '네이버', spacecloud: '스페이스클라우드', sns: 'SNS', kakao: '카카오톡', phone: '전화', email: '이메일', visit: '방문', other: '기타' };
function chText(ch, note) { return (CH_LABEL[ch] || '기타') + (note ? ' · ' + note : ''); }
const SLOT_OF = { '10-17': 'pkg-day', '10-24': 'pkg-allday', '18-31': 'pkg-allnight' };
// 관리자가 등록한 문의의 '문의 원문' 요약 (등록·수정 때 다시 만듭니다)
function adminSummary(d) {
  const sh = d.start_h, eh = d.end_h;
  return ['[관리자 직접 등록 · ' + chText(d.channel, d.channel_note) + ']',
    d.space_id && SPACES[d.space_id] ? '공간: ' + SPACES[d.space_id] : '',
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

export async function onRequest({ request, env, params, waitUntil }) {
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
    if(path==='revenue')return await revenueAdmin({env,url,method,operationalBookingSql:OPERATIONAL_BOOKING_SQL,archivedStatus:DELETED});
    if(path==='booking-readiness')return await bookingReadiness({env,url,method});
    if(/^bookings\/[A-Z0-9-]+\/portal-link(?:\/rotate)?$/.test(path))return await portalAdmin({env,request,url,path,method});
    if(method==='PATCH'&&/^inquiries\/[A-Z0-9-]+$/.test(path)){const v=await readJson(request.clone());if(v.total!==undefined&&v.total!==null&&v.total!==''&&amountOk(v.total)===null)return err('금액을 확인해 주세요.');}
    if(method!=='GET'&&/^(quotes$|inquiries\/|bookings(?:\/|$)|catering\/orders)/.test(path))await preserveLegacyPayments(env);
    if(/^bookings\/[A-Z0-9-]+\/reconfirm$/.test(path))return await reconfirmationAdmin({env,request,path,method,waitUntil});
    if(/^bookings\/[A-Z0-9-]+\/cancellation(?:\/document)?$/.test(path))return await cancellationAdmin({env,request,path,method,url});
    if(/^bookings\/[A-Z0-9-]+\/payment-schedule$/.test(path))return await paymentScheduleAdmin({env,request,path,method});
    if(/^bookings\/[A-Z0-9-]+\/settlement(?:\/entries\/\d+)?$/.test(path))return await settlementAdmin({env,request,path,method});
    if (/^(catering|reception)\/pricing$/.test(path)) {
      const service=path.split('/')[0];
      if(method==='GET')return json(adminFoodPricing(await readFoodPricing(env,service)),200,{'cache-control':'no-store'});
      if(method==='PUT'){try{const saved=await saveFoodPricing(env,service,await readJson(request));if(saved.conflict)return err('다른 화면에서 가격표가 변경됐습니다. 최신 가격표를 불러온 뒤 다시 저장해 주세요.',409,'PRICE_CONFLICT');if(!saved.unchanged)await log(env,service+'.pricing.updated',service+'_pricing','admin',{revision:saved.config.revision});return json(adminFoodPricing(saved.config),200,{'cache-control':'no-store'});}catch(e){return err(e.message||'가격표를 저장하지 못했습니다.',400,'INVALID_PRICING');}}
      return err('지원하지 않는 요청입니다.',405);
    }
    if (path === 'ping') return json({ ok: true });
    if (path === 'cocktail/pricing') {
      if(method==='GET')return json(adminCocktailPricing(await readCocktailPricing(env)),200,{'cache-control':'no-store'});
      if(method==='PUT'){
        try{const input=await readJson(request),saved=await saveCocktailPricing(env,input);if(saved.conflict)return err('다른 화면에서 가격표가 변경됐습니다. 최신 가격표를 불러온 뒤 다시 저장해 주세요.',409,'PRICE_CONFLICT');if(!saved.unchanged)await log(env,'cocktail.pricing.updated','cocktail_pricing','admin',{revision:saved.config.revision});return json(adminCocktailPricing(saved.config),200,{'cache-control':'no-store'});}
        catch(e){return err(e.message||'가격표를 저장하지 못했습니다.',400,'INVALID_PRICING');}
      }
      return err('지원하지 않는 요청입니다.',405);
    }
    if(path==='booking-notifications'||path.startsWith('booking-notifications/'))return await bookingNotificationsAdmin({env,request,url,path,method});
    if(path==='transaction-notifications')return await transactionNoticeAdmin(env,request);
    if(path==='deposit-notifications'||path.startsWith('deposit-notifications/'))return await depositNoticeAdmin({env,request,url,path,method});
    if (path === 'deposit-refunds' || path.startsWith('deposit-refunds/')) {
      try { return await refundAdmin({env,request,url,path,method}); }
      catch { return err('환급 정보를 처리하지 못했습니다. 새로고침 후 다시 시도해 주세요.',500,'REFUND_ERROR'); }
    }
    if (path.startsWith('guide-messages')) {
      try { return await guideAdmin({ env, request, url, path, method }); }
      catch (e) { return err(String(e?.message || '알림톡 처리 중 오류가 발생했습니다.').slice(0,300), 400, 'GUIDE_ERROR'); }
    }

    if (path === 'inquiry-notifications' && method === 'GET') {
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries i LEFT JOIN admin_inquiry_reads r ON r.ref = i.ref WHERE r.ref IS NULL AND i.status = '문의 접수'").first();
      const { results } = await env.DB.prepare("SELECT i.ref, i.name, i.event_date, i.status, i.created_at, i.space_id, json_extract(i.data, '$.channel') AS channel FROM inquiries i LEFT JOIN admin_inquiry_reads r ON r.ref = i.ref WHERE r.ref IS NULL AND i.status = '문의 접수' ORDER BY i.created_at DESC LIMIT 50").all();
      return json({ ok: true, count: count?.n || 0, items: results || [] });
    }
    const notificationRead = path.match(/^inquiry-notifications\/([A-Z0-9-]+)\/read$/);
    if (notificationRead && method === 'POST') {
      const ref = notificationRead[1];
      const item = await env.DB.prepare('SELECT ref FROM inquiries WHERE ref = ?').bind(ref).first();
      if (!item) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      await env.DB.prepare('INSERT INTO admin_inquiry_reads (ref, read_at) VALUES (?, ?) ON CONFLICT(ref) DO NOTHING').bind(ref, now()).run();
      return json({ ok: true });
    }

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
      const cols = `i.ref, i.status, i.name, i.phone, i.event_date, i.headcount, i.created_at, i.updated_at, json_extract(i.data, '$.purpose') AS purpose, json_extract(i.data, '$.inquiry_type') AS inquiry_type, json_extract(i.data, '$.channel') AS channel, json_extract(i.data, '$.channel_note') AS channel_note, json_extract(i.data, '$.reserve') AS reserve, json_extract(i.data, '$.total') AS est_total, json_extract(i.data, '$.catering.summary') AS catering, json_extract(i.data, '$.catering.status') AS catering_status, ${latestQuote} AS quote_total, ${inquiryAmountSql()} AS effective_amount`;
      const out = {
        today, counts,
        upcoming_count: await one("SELECT COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ?", today, in14),
        reviews_pending: await one("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'"),
        members: await one('SELECT COUNT(*) AS n FROM members'), members_new: await one('SELECT COUNT(*) AS n FROM members WHERE created_at >= ?', ago7),
        hosts_new: await one('SELECT COUNT(*) AS n FROM host_applications WHERE created_at >= ?', ago7),
        todo: await all(`SELECT ${cols} FROM inquiries i WHERE i.status = '문의 접수' ORDER BY i.created_at ASC LIMIT 15`),
        followup: await all(`SELECT ${cols} FROM inquiries i WHERE i.status IN ('견적 발송', '결제 대기') AND COALESCE(i.updated_at, i.created_at) <= ? ORDER BY COALESCE(i.updated_at, i.created_at) ASC LIMIT 15`, ago2),
        soon: await all(`SELECT ${cols} FROM inquiries i WHERE i.status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기') AND i.event_date >= ? AND i.event_date <= ? ORDER BY i.event_date ASC LIMIT 15`, today, in14),
        upcoming: await all(`SELECT booking_code, space_id, inquiry_ref, customer_name, phone, date, slot, headcount, memo, ${bookingAmountSql()} AS amount, start_h, end_h FROM bookings b WHERE status = 'confirmed' AND date >= ? AND date <= ? ORDER BY date ASC LIMIT 20`, today, in14),
        month: {
          month,
          inquiries: await one("SELECT COUNT(*) AS n FROM inquiries WHERE status <> '삭제됨' AND substr(created_at, 1, 7) = ?", month),
          confirmed: await one("SELECT COUNT(*) AS n FROM bookings WHERE status IN ('confirmed', 'completed') AND substr(date, 1, 7) = ?", month),
          confirmed_amount: await one(`SELECT COALESCE(SUM(${bookingAmountSql()}), 0) AS n FROM bookings b WHERE b.status IN ('confirmed', 'completed') AND substr(b.date, 1, 7) = ?`, month),
          quoted_amount: await one(`SELECT COALESCE(SUM(${inquiryAmountSql()}), 0) AS n FROM inquiries i WHERE i.status IN ('견적 발송', '결제 대기') `),
          orders_paid: await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND test = 0 AND substr(paid_at, 1, 7) = ?", month),
          orders_amount: await one("SELECT COALESCE(SUM(price - MIN(price, (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid = orders.oid))), 0) AS n FROM orders WHERE status = 'paid' AND test = 0 AND substr(paid_at, 1, 7) = ?", month),
        },
        orders_recent: await all("SELECT oid, title, event_date, price, buyer_name, status, test, paid_at, created_at FROM orders WHERE status IN ('paid','failed') ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 8"),
        orders_today_paid: await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND substr(paid_at, 1, 10) = ?", today),
        platform: await platformCounts(env),  // 모임 승인 대기 · 새 입점·광고 신청 · 공개 공간 · 게재 중 광고
        visits: await visitCounts(env),       // 현장답사: 조율 필요 · 오늘 · 7일 안 일정
        catering: await cateringCounts(env)   // 출장뷔페: 대기 · 확정 · 고객 요청만 있는 문의
      };
      return json({ ok: true, ...out });
    }

    // ---- 문의 상세 · 직접 등록 · 체크리스트 ----
    const mDet = path.match(/^inquiries\/([A-Z0-9-]+)$/);
    if (mDet && method === 'GET') {
      const r = await env.DB.prepare(`SELECT ref, space_id, status, name, phone, email, event_date, headcount, data, memo, created_at, updated_at, ${inquiryAmountSql()} AS effective_amount FROM inquiries i WHERE ref = ?`).bind(mDet[1]).first();
      if (!r) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const c = await env.DB.prepare('SELECT checks FROM inquiry_checks WHERE ref = ?').bind(mDet[1]).first();
      const { results: qs } = await env.DB.prepare('SELECT quote_no, total, data, created_at FROM quotes WHERE inquiry_ref = ? ORDER BY id DESC LIMIT 20').bind(mDet[1]).all();
      const { results: bk } = await env.DB.prepare("SELECT booking_code, date, slot, status, json_extract(confirm_doc, '$.issued_at') AS confirm_issued FROM bookings WHERE inquiry_ref = ? ORDER BY id DESC").bind(mDet[1]).all();
      const { results: lg } = await env.DB.prepare('SELECT kind, actor, detail, created_at FROM event_log WHERE ref = ? ORDER BY id DESC LIMIT 30').bind(mDet[1]).all();
      const wait = await inquiryWait(env, r.ref, r);
      const guides=await guideSummary(env,(bk || []).map(x=>x.booking_code)),settlements=await settlementsFor(env,(bk||[]).map(x=>x.booking_code));
      return json({ ok: true, item: { ...r, data: safe(r.data) }, checks: await guideInquiryChecks(env,mDet[1],safe(c && c.checks)), quotes: (qs || []).map(q => ({ ...q, data: safe(q.data) })), bookings: (bk || []).map(x=>({...x,settlement:settlements[x.booking_code],guide_status:guides[x.booking_code] || ''})), log: lg || [], wait, visits: await visitsForInquiry(env, mDet[1]), catering_order: await cateringOrderFor(env, mDet[1], '') });
    }
    if (path === 'inquiries' && method === 'POST') {
      // 카카오톡·전화·이메일·방문으로 받은 문의를 관리자가 직접 등록합니다.
      const d = await readJson(request);
      const name = str(d.name, 80), phone = str(d.phone, 30).replace(/[^0-9-+]/g, ''), email = str(d.email, 120);
      if (!name) return err('고객 이름을 적어 주세요.');
      let phone2;try{phone2=cleanPhone2(d.phone2===undefined?'':d.phone2,phone);}catch(e){return err(e.message);}
      const date = str(d.date, 10); if (date && !isDate(date)) return err('날짜를 확인해 주세요.');
      const channel = CHANNELS.includes(d.channel) ? d.channel : 'other';
      const channel_note = str(d.channel_note, 40);
      let start_h = hourOk(d.start_h), end_h = hourOk(d.end_h);
      if (start_h !== null && (end_h === null || end_h <= start_h)) end_h = null;
      if (start_h === null) end_h = null;
      const total = amountOk(d.total), amount_mode = d.amount_mode === 'manual' ? 'manual' : (d.amount_mode === 'auto' ? 'auto' : '');
      const space_id = spaceOk(d.space_id);
      const data = { inquiry_type: ['event', 'regular', 'partner'].includes(d.inquiry_type) ? d.inquiry_type : 'event', space_id, channel, channel_note,
        purpose: str(d.purpose, 40), date, start_h, end_h,
        t_start: start_h !== null ? hl(start_h).replace('다음 날 ', '') : str(d.t_start, 5), t_end: end_h !== null ? hl(end_h).replace('다음 날 ', '') : str(d.t_end, 5),
        slot: start_h !== null ? 'custom' : '', headcount: num(d.headcount), name, phone, phone2, email, regular: !!d.regular, options: cleanOptions(d.options), price_adjustment: d.price_adjustment || null,
        pkg: str(d.pkg, 20), total, amount_mode: total !== null ? (amount_mode || 'manual') : '', amount_note: str(d.amount_note, 200), estimate: str(d.estimate, 3000),
        org: str(d.org, 120), message: str(d.message, 2000), source: 'admin', summary: '' };
      data.summary = adminSummary(data);
      // 현장답사 일정을 함께 등록할 때는 문의를 저장하기 전에 날짜·시간부터 확인합니다
      const visit = d.visit && typeof d.visit === 'object' ? d.visit : null;
      if (visit) {
        if (str(visit.date, 10) && !isDate(str(visit.date, 10))) return err('현장답사 날짜를 확인해 주세요.');
        if (str(visit.time, 5) && !timeOk(visit.time)) return err('현장답사 시간을 확인해 주세요. (예: 14:00)');
      }
      const ref = await uniqueRef(env, 'inquiries', 'ref', 'MS');
      await env.DB.prepare('INSERT INTO inquiries (ref, space_id, status, name, phone, email, event_date, headcount, data, memo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(ref, space_id, STATUSES.includes(d.status) ? d.status : '문의 접수', name, phone, email, date || null, data.headcount, JSON.stringify(data), str(d.memo, 2000), now()).run();
      await log(env, 'inquiry.created', ref, 'admin', { channel, space_id, visit: visit ? true : undefined });
      if (visit) {
        const vr = await createVisit(env, { ...visit, inquiry_ref: ref, name: str(visit.name, 60) || name, phone: str(visit.phone, 30) || phone, space_id: visit.space_id || space_id }, { actor: 'admin', source: 'admin' });
        if (vr.error) return json({ ok: true, ref, visit_error: vr.error });
        return json({ ok: true, ref, visit: vr.item, clashes: vr.clashes });
      }
      return json({ ok: true, ref });
    }
    const mChk = path.match(/^inquiries\/([A-Z0-9-]+)\/checks$/);
    const mInquiryDeposit = path.match(/^inquiries\/([A-Z0-9-]+)\/deposit-paid$/);
    if (mInquiryDeposit && method === 'PUT') {
      const d = await readJson(request);
      if (typeof d.paid !== 'boolean') return err('보증금 입금 여부를 확인해 주세요.');
      const i = await env.DB.prepare('SELECT status FROM inquiries WHERE ref = ?').bind(mInquiryDeposit[1]).first();
      if (!i) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (['삭제됨', '대기 취소', '취소·환불'].includes(i.status)) return err('취소·삭제된 문의는 변경할 수 없습니다.');
      await env.DB.prepare("INSERT INTO inquiry_checks (ref, checks, updated_at) VALUES (?, json_object('guarantee_paid', json(?)), ?) ON CONFLICT(ref) DO UPDATE SET checks = json_set(inquiry_checks.checks, '$.guarantee_paid', json(?)), updated_at = excluded.updated_at")
        .bind(mInquiryDeposit[1], d.paid ? 'true' : 'false', now(), d.paid ? 'true' : 'false').run();
      await log(env, 'inquiry.deposit_paid', mInquiryDeposit[1], 'admin', { paid: d.paid });
      return json({ ok: true, paid: d.paid });
    }
    if (mChk && method === 'PUT') {
      const d = await readJson(request); const checks = {};
      const previous = await env.DB.prepare('SELECT checks FROM inquiry_checks WHERE ref = ?').bind(mChk[1]).first(), saved = safe(previous?.checks);
      const managed = await env.DB.prepare("SELECT r.state FROM bookings b LEFT JOIN booking_refunds r ON b.booking_code=r.booking_code WHERE b.inquiry_ref=? AND b.status<>'cancelled' AND EXISTS(SELECT 1 FROM bookings bx JOIN booking_refunds rx ON rx.booking_code=bx.booking_code WHERE bx.inquiry_ref=b.inquiry_ref)").bind(mChk[1]).all();
      if ((managed.results || []).length) {
        const completed = managed.results.every(r => r.state === 'completed');
        if (!!d.checks?.guarantee_returned !== completed) return err('보증금 환급 관리에서 송금 완료 여부를 확인해 주세요.',409,'REFUND_MANAGED');
      }
      for (const [k, v] of Object.entries(d.checks || {})) if (/^[a-z_]{1,30}$/.test(k)) checks[k] = v ? saved[k] || now() : false;
      // Only the explicitly changed guide checkbox may mark every currently linked booking.
      if(d.changed_check && d.changed_check!=='guide_sent' && saved.guide_sent!==undefined)checks.guide_sent=saved.guide_sent;
      const statements=[env.DB.prepare('INSERT INTO inquiry_checks (ref, checks, updated_at) VALUES (?,?,?) ON CONFLICT(ref) DO UPDATE SET checks = excluded.checks, updated_at = excluded.updated_at').bind(mChk[1], JSON.stringify(checks), now())];
      if(d.changed_check==='guide_sent')statements.push(env.DB.prepare("UPDATE booking_guide_state SET manual_sent=?,manual_revision=revision WHERE booking_code IN (SELECT booking_code FROM bookings WHERE inquiry_ref=? AND status<>'cancelled')").bind(d.checks?.guide_sent?now():null,mChk[1]));
      await batch(env,statements);
      return json({ ok: true, checks:await guideInquiryChecks(env,mChk[1],checks) });
    }

    // ---- 견적 저장·목록 ----
    if (path === 'quotes' && method === 'POST') {
      const d = await readJson(request, 128 * 1024);
      const total = amountOk(d.total); if (total == null) return err('견적 합계를 확인해 주세요.');
      const ref = str(d.inquiry_ref, 20).toUpperCase();
      const inquiry = ref ? await env.DB.prepare('SELECT * FROM inquiries WHERE ref = ?').bind(ref).first() : null;
      if (ref && !inquiry) return err('연결할 문의번호를 찾을 수 없습니다.');
      if (inquiry && [DELETED, '대기 취소'].includes(inquiry.status)) return err('삭제·대기 취소된 문의는 복원한 뒤 견적을 저장해 주세요.');
      const quote_no = await uniqueRef(env, 'quotes', 'quote_no', 'Q');
      const data = d.data && typeof d.data === 'object' ? d.data : {};
      const related=ref?(await env.DB.prepare('SELECT booking_code,status FROM bookings WHERE inquiry_ref=?').bind(ref).all()).results||[]:[];
      const cancelledQuote=related.length===1&&related[0].status==='cancelled'?(await settlementFor(env,related[0].booking_code)):null;
      if(cancelledQuote?.cancellation){
        if(d.settlement_revision!==undefined&&d.settlement_revision!==cancelledQuote.revision)return err('정산 내역이 변경됐습니다. 최신 내역을 확인한 뒤 견적을 다시 저장해 주세요.',409,'PAYMENT_CHANGED');
        data.settlement=cancelledQuote;data.cancellation_quote=true;
        const serialized=JSON.stringify(data);if(serialized.length>100000)return err('견적 내용이 너무 깁니다.');
        const saved=await env.DB.prepare(`INSERT INTO quotes(quote_no,inquiry_ref,customer,event_date,total,data,created_at) SELECT ?,?,?,?,?,?,? FROM bookings b WHERE booking_code=? AND status='cancelled' AND ${settlementRevisionSql()}=?`).bind(quote_no,ref,str(d.customer,120),inquiry.event_date,total,serialized,now(),related[0].booking_code,cancelledQuote.revision).run();
        if(!(saved.meta?.changes??saved.changes))return err('정산 내역이 변경됐습니다. 최신 내역을 확인한 뒤 견적을 다시 저장해 주세요.',409,'PAYMENT_CHANGED');
        await log(env,'quote.saved',ref,'admin',{quote_no,total,cancellation:true});return json({ok:true,quote_no,cancellation_quote:true});
      }
      const cocktailRates=publicCocktailPricing(await readCocktailPricing(env));
      const cateringData=foodPricingData('catering',await readFoodPricing(env,'catering')),receptionData=foodPricingData('reception',await readFoodPricing(env,'reception'));
      const food=foodExtras(data.extras,inquiry?safe(inquiry.data):null,cocktailRates.prices,cocktailRates.revision,cateringData);if(food.error)return err(food.error);
      const rec = receptionExtra(data.extras,receptionData,inquiry?safe(inquiry.data):null);
      if (rec.error) return err(rec.error);
      if (rec.amount+food.amount > total) return err('견적 합계가 케이터링 금액보다 작습니다. 추가 항목을 확인해 주세요.');
      const statements = [], input = data.input && typeof data.input === 'object' ? data.input : null;
      if(input)input.reception_request=inquiry&&input.receptionRequested?receptionDocument(safe(inquiry.data),total):null;
      if(rec.reception){
        data.extras=data.extras.map(x=>x.kind==='reception'?{...x,reception:rec.reception}:x);
        if(Array.isArray(input?.extras))input.extras=input.extras.map(x=>x.kind==='reception'?{...x,amount:rec.amount,reception:rec.reception}:x);
      }
      let invalidated = false, reception_revision = null;
      if (inquiry) {
        const old = safe(inquiry.data), updated = { ...old };
        if(receptionConflict(input?.reception_revision,old))return err('케이터링 구성이 다른 화면에서 변경됐습니다. 문의를 다시 불러와 저장해 주세요.',409,'RECEPTION_CHANGED');
        const date = isDate(str(d.event_date, 10)) ? str(d.event_date, 10) : inquiry.event_date;
        const space = input ? spaceOk(input.space || inquiry.space_id) : inquiry.space_id;
        const name = input ? str(d.customer, 80) || inquiry.name : inquiry.name;
        const phone = input ? str(input.phone, 30) : inquiry.phone, email = input ? str(input.email, 120) : inquiry.email;
        const people = input ? num(input.people) : inquiry.headcount;
        if (people !== null && (people < 1 || people > 1000)) return err('인원을 확인해 주세요.');
        let sh = input ? hourOk(input.start) : old.start_h ?? null, eh = input ? hourOk(input.end) : old.end_h ?? null;
        if (sh !== null && (eh === null || eh <= sh)) return err('시작·종료 시간을 확인해 주세요.');
        const catering=food.included.catering||0,cocktail=food.included.cocktail||0;
        Object.assign(updated, { total, amount_override: true, amount_mode: 'quote', amount_note: str(data.discountWhy, 200), included_catering_amount: catering, catering_in_quote: catering > 0 || !!(old.catering&&(old.catering.status==='cancelled'||old.catering.removed||!old.catering.total)&&(old.catering_in_quote||input?.cateringRequested)&&!input?.cateringExcluded), date, name, phone, email, headcount: people, space_id: space, start_h: sh, end_h: eh,
          t_start: sh === null ? '' : hl(sh).replace('다음 날 ', ''), t_end: eh === null ? '' : hl(eh).replace('다음 날 ', ''), quote_no, quote_input: input,
          price_adjustment: { type: input?.discType || 'none', value: num(input?.discVal) || 0, reason: str(data.discountWhy, 200), discount: amountOk(data.discount) || 0 } });
        // Keep the displayed calculation in step with the exact quote being saved.
        const calculation=Calculation.text({...data,space,date,people,total},{space,spaceName:SPACES[space]});
        if(calculation){
          if(old.estimate&&old.source!=='admin'&&!old.estimate_admin&&!old.estimate_customer)updated.estimate_customer=old.estimate;
          updated.estimate=calculation;updated.estimate_admin=true;updated.estimate_quote_no=quote_no;
        }
        updated.included_cocktail_amount=cocktail;
        updated.cocktail_in_quote=cocktail>0||!!(old.cocktail&&old.cocktail.status==='cancelled'&&(old.cocktail_in_quote||input?.cocktailRequested)&&!input?.cocktailExcluded);
        let foodsChanged=false;
        for(const kind of F.types){if(food.selections[kind])updated[kind]=food.selections[kind];foodsChanged=foodsChanged||F.key(kind,old[kind])!==F.key(kind,updated[kind])||(Number(old['included_'+kind+'_amount'])||0)!==(food.included[kind]||0)||!!old[kind+'_in_quote']!==!!updated[kind+'_in_quote'];}
        if(input&&Array.isArray(input.extras))for(const kind of F.types){if(food.selections[kind])input.extras=input.extras.map(x=>F.isRow(kind,x)?{...x,kind,amount:food.included[kind],[kind]:food.selections[kind]}:x);}
        updated.included_reception_amount = rec.amount;
        updated.reception_in_quote = rec.amount > 0 || !!(old.reception && (old.reception.status==='cancelled'||old.reception.total==null) && (old.reception_in_quote||input?.receptionRequested) && !input?.receptionExcluded);
        if (rec.reception) updated.reception = rec.reception;
        const recChanged=!!(rec.reception&&receptionChanged(old,rec.reception))||(Number(old.included_reception_amount)||0)!==rec.amount||!!old.reception_in_quote!==updated.reception_in_quote;
        reception_revision=receptionRevision(old)+(recChanged||foodsChanged?1:0);updated.reception_revision=reception_revision;
        if(input){Object.assign(input,syncFoodInput(syncReceptionInput(input,updated,updated.reception_in_quote),updated));updated.quote_input=input;}
        if (input) Object.assign(updated, { purpose: str(input.purpose, 40), regular: !!input.regular, options: cleanOptions({ ...input.opts, manager: input.opts?.manager?.on ? { count: input.opts.manager.count, hours: input.opts.manager.hours } : false }) });
        if ((date || '') !== (inquiry.event_date || '') || spaceOk(space) !== spaceOk(inquiry.space_id)) rejoinWaitQueue(updated);
        if (sh !== null) updated.slot = SLOT_OF[sh + '-' + eh] || 'custom';
        const sync = await linkedBookingChanges(env, ref, { space_id: space, name, phone, date, start_h: sh, end_h: eh, headcount: people, amount: total, document_changed: JSON.stringify(old.options||{})!==JSON.stringify(updated.options||{})||String(old.purpose||'')!==String(updated.purpose||'') });
        if (sync.error) return sync.error;
        invalidated = sync.invalidated; statements.push(...sync.statements);
        if(foodsChanged||(rec.reception && receptionChanged(old,rec.reception)) || (Number(old.included_reception_amount)||0)!==rec.amount){const issued=await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled' AND confirm_doc IS NOT NULL LIMIT 1").bind(ref).first();statements.push(env.DB.prepare("UPDATE bookings SET confirm_doc = NULL WHERE inquiry_ref = ? AND status <> 'cancelled'").bind(ref));invalidated=invalidated||!!issued;}
        if(food.selections.catering&&old.catering?.order_ref){const c=updated.catering;statements.push(env.DB.prepare('UPDATE catering_orders SET people=?,status=?,total=?,data=?,meal_time=?,updated_at=? WHERE ref=? AND inquiry_ref=?').bind(c.people,c.status,c.total,JSON.stringify(c),c.meal_time||'',now(),old.catering.order_ref,ref));}
        const status = d.mark_sent && ['문의 접수', '조건 확인'].includes(inquiry.status) ? '견적 발송' : inquiry.status;
        statements.push(env.DB.prepare('UPDATE inquiries SET space_id = ?, status = ?, name = ?, phone = ?, email = ?, event_date = ?, headcount = ?, data = ?, updated_at = ? WHERE ref = ?')
          .bind(space, status, name, phone, email || '', date, people, JSON.stringify(updated), now(), ref));
      }
      if(ref){const bks=await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref=? AND status<>'cancelled'").bind(ref).all();if(bks.results?.length===1){const payment=await settlementFor(env,bks.results[0].booking_code);data.settlement=S.calculate({...payment,amount:total});}else delete data.settlement;}else delete data.settlement;
      const serialized = JSON.stringify(data);
      if (serialized.length > 100000) return err('견적 내용이 너무 깁니다. 안내 메모나 추가 항목을 줄여 주세요.');
      statements.push(env.DB.prepare('INSERT INTO quotes (quote_no, inquiry_ref, customer, event_date, total, data, created_at) VALUES (?,?,?,?,?,?,?)')
        .bind(quote_no, ref || null, str(d.customer, 120), isDate(str(d.event_date, 10)) ? str(d.event_date, 10) : null, total, serialized, now()));
      await batch(env, statements);
      await log(env, 'quote.saved', ref || quote_no, 'admin', { quote_no, total });
      return json({ ok: true, quote_no, reception_revision, food_state:input?.food_state, confirm_doc_invalidated: invalidated });
    }
    if (path === 'quotes' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT quote_no, inquiry_ref, customer, event_date, total, data, created_at FROM quotes ORDER BY id DESC LIMIT 100').all();
      return json({ ok: true, items: (results || []).map(q => ({ ...q, data: safe(q.data) })) });
    }

    // ---- 문의 ----
    if (path === 'inquiries' && method === 'GET') {
      const st = str(url.searchParams.get('status'), 20), q = str(url.searchParams.get('q'), 60), ty = str(url.searchParams.get('type'), 20), ch = str(url.searchParams.get('ch'), 20);
      let sql = `SELECT ref, space_id, status, name, phone, email, event_date, headcount, data, memo, created_at, updated_at, (SELECT q.total FROM quotes q WHERE q.inquiry_ref = i.ref ORDER BY q.id DESC LIMIT 1) AS quote_total, ${inquiryAmountSql()} AS effective_amount,
        CASE WHEN json_type(i.data,'$.catering')='object' AND json_extract(i.data,'$.included_catering_amount') IS NULL THEN (
          SELECT COALESCE(SUM(MAX(0, CAST(json_extract(x.value,'$.amount') AS REAL))),0)
          FROM json_each((SELECT CASE WHEN json_valid(q.data) THEN json_extract(q.data,'$.extras') END FROM quotes q WHERE q.inquiry_ref=i.ref ORDER BY q.id DESC LIMIT 1)) x
          WHERE x.type='object' AND (json_extract(x.value,'$.kind')='catering' OR json_extract(x.value,'$.label') LIKE '출장뷔페 ·%')
        ) END AS legacy_quote_catering_amount FROM inquiries i WHERE 1=1`; const b = [];
      if (st === 'open') { sql += " AND status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기')"; } else if (st === 'deleted' || st === DELETED) { sql += ' AND status = ?'; b.push(DELETED); } else if (st) { sql += ' AND status = ?'; b.push(st); } else { sql += ' AND status <> ?'; b.push(DELETED); }
      if (['event', 'regular', 'partner'].includes(ty)) { sql += " AND COALESCE(json_extract(data, '$.inquiry_type'), 'event') = ?"; b.push(ty); }
      if (CHANNELS.includes(ch)) { sql += " AND COALESCE(json_extract(data, '$.channel'), 'web') = ?"; b.push(ch); }
      if (q) { sql += ' AND (name LIKE ? OR phone LIKE ? OR ref LIKE ? OR email LIKE ?)'; b.push('%' + q + '%', '%' + q + '%', '%' + q.toUpperCase() + '%', '%' + q + '%'); }
      const from = str(url.searchParams.get('from'), 10), to = str(url.searchParams.get('to'), 10), space = str(url.searchParams.get('space'), 60);
      if (from && isDate(from)) { sql += ' AND event_date >= ?'; b.push(from); }
      if (to && isDate(to)) { sql += ' AND event_date <= ?'; b.push(to); }
      if (SPACES[space]) { sql += ' AND space_id = ?'; b.push(space); }
      const page = Math.max(0, Math.min(100000, num(url.searchParams.get('page')) || 0));
      sql += ' ORDER BY created_at DESC, ref DESC LIMIT 301 OFFSET ?'; b.push(page * 300);
      const { results } = await env.DB.prepare(sql).bind(...b).all();
      return json({ ok: true, has_more: (results || []).length > 300, items: (results || []).slice(0, 300).map(r => ({ ...r, data: safe(r.data) })) });
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
    const mWait = path.match(/^inquiries\/([A-Z0-9-]+)\/wait-(cancel|restore)$/);
    if (mWait && method === 'POST') {
      const ref = mWait[1], cancel = mWait[2] === 'cancel';
      const row = await env.DB.prepare('SELECT status, data FROM inquiries WHERE ref = ?').bind(ref).first();
      if (!row) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (cancel ? !OPEN.includes(row.status) : row.status !== '대기 취소') return err('현재 상태에서는 대기를 변경할 수 없습니다.', 409, 'WAIT_STATUS');
      const active = await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled' LIMIT 1").bind(ref).first();
      if (active) return err('확정된 예약은 예약 취소 기능을 이용해 주세요.', 409, 'HAS_BOOKING');
      const data = safe(row.data), t = now(), status = cancel ? '대기 취소' : (OPEN.includes(data.wait_cancelled_from) ? data.wait_cancelled_from : '문의 접수');
      delete data.wait_rank; delete data.wait_rank_at;
      if (cancel) { data.wait_cancelled_from = row.status; data.wait_cancelled_at = t; }
      else { delete data.wait_cancelled_from; delete data.wait_cancelled_at; rejoinWaitQueue(data); }
      const result = await env.DB.prepare("UPDATE inquiries SET status = ?, data = ?, updated_at = ? WHERE ref = ? AND status = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled')").bind(status, JSON.stringify(data), t, ref, row.status, ref).run();
      if ((result.meta?.changes ?? result.changes) === 0) return err('상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.', 409, 'WAIT_STATUS');
      await log(env, cancel ? 'waitlist.cancelled' : 'waitlist.restored', ref, 'admin', { from: row.status, status });
      return json({ ok: true, ref, status, wait:cancel?null:await inquiryWait(env, ref) });
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
        const row = await env.DB.prepare('SELECT space_id, name, phone, email, event_date, headcount, data, memo FROM inquiries WHERE ref = ?').bind(ref).first();
        if (!row) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
        const data = safe(row.data);
        // 공간 변경(1호 ↔ 2호)은 아직 확정 예약이 없는 문의만 — 확정된 예약의 공간은 예약 관리에서 다룹니다
        let newSpace = row.space_id;
        if (d.space_id !== undefined && SPACES[str(d.space_id, 60)] && str(d.space_id, 60) !== row.space_id) {
          const booked = await env.DB.prepare("SELECT 1 FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled' LIMIT 1").bind(ref).first();
          if (booked) return err('확정된 예약이 있는 문의는 공간을 바꿀 수 없습니다. 예약을 취소한 뒤 다시 등록해 주세요.', 409, 'HAS_BOOKING');
          newSpace = str(d.space_id, 60);
        }
        const name = str(d.name, 80), phone = str(d.phone === undefined ? row.phone : d.phone, 30).replace(/[^0-9-+]/g, ''), email = str(d.email === undefined ? row.email : d.email, 120);
        if (!name) return err('고객 이름을 적어 주세요.');
        let phone2;try{phone2=cleanPhone2(d.phone2===undefined?data.phone2:d.phone2,phone);}catch(e){return err(e.message);}
        const date = str(d.date, 10); if (date && !isDate(date)) return err('날짜를 확인해 주세요.');
        let start_h = hourOk(d.start_h), end_h = hourOk(d.end_h);
        if (start_h !== null && (end_h === null || end_h <= start_h)) end_h = null;
        if (start_h === null) end_h = null;
        const headcount = d.headcount === undefined ? row.headcount : num(d.headcount);
        if (headcount !== null && (headcount < 1 || headcount > 1000)) return err('인원을 확인해 주세요.');
        const pick = o => ({ 공간: SPACES[o.space_id] || o.space_id || '', 경로: chText(o.channel || 'web', o.channel_note), 이름: o.name || '', 연락처: o.phone || '', 추가연락처: o.phone2 || '', 이메일: o.email || '', 이용일: o.date || '', 시간: o.start_h != null ? hl(o.start_h) + '–' + (o.end_h != null ? hl(o.end_h) : '') : (o.t_start ? o.t_start + '–' + (o.t_end || '') : ''), 인원: o.headcount || '', 목적: o.purpose || '', 금액: o.total != null ? o.total : '', 옵션: JSON.stringify(o.options || {}), 내용: o.message || '' });
        const before = pick({ ...data, space_id: row.space_id, name: data.name || row.name, phone: data.phone || row.phone, email: data.email || row.email, date: data.date || row.event_date, headcount: data.headcount || row.headcount });
        if ((date || '') !== (row.event_date || '') || spaceOk(newSpace) !== spaceOk(row.space_id)) rejoinWaitQueue(data);
        Object.assign(data, { name, phone, phone2, email, date, headcount, purpose: str(d.purpose, 40), options: cleanOptions(d.options), regular: !!d.regular, message: str(d.message, 2000) });
        if (newSpace !== row.space_id) data.space_id = newSpace;
        else if (SPACES[row.space_id]) data.space_id = row.space_id;
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
          Object.assign(data, { total: t, amount_override: true, amount_mode: mode, amount_note: str(d.amount_note, 200), included_catering_amount: 0, catering_in_quote: false, included_reception_amount: 0, reception_in_quote: false, included_cocktail_amount:0,cocktail_in_quote:false,price_adjustment: d.price_adjustment || null });
          if (d.estimate !== undefined) { data.estimate = str(d.estimate, 3000); data.estimate_admin = true; data.pkg = str(d.pkg, 20); }
        } else if (mode === 'none') {
          Object.assign(data, { total: null, amount_override: true, amount_mode: '', amount_note: '', included_catering_amount: 0, catering_in_quote: false, included_reception_amount: 0, reception_in_quote: false, included_cocktail_amount:0,cocktail_in_quote:false,price_adjustment: null });
        }
        if (data.source === 'admin') data.summary = adminSummary(data);
        data.edited_at = now();
        const after = pick(data);
        const changed = Object.keys(after).filter(k => String(after[k]) !== String(before[k]));
        const memo = d.memo !== undefined ? str(d.memo, 2000) : row.memo;
        const sync = await linkedBookingChanges(env, ref, { space_id: newSpace, name, phone, phone2, date, start_h: data.start_h ?? null, end_h: data.end_h ?? null, headcount, memo, document_changed: changed.some(key => key==='목적'||key==='옵션'),
          ...(mode === 'keep' ? {} : { amount: data.total }) });
        if (sync.error) return sync.error;
        await batch(env, [env.DB.prepare('UPDATE inquiries SET space_id = ?, name = ?, phone = ?, email = ?, event_date = ?, headcount = ?, data = ?, memo = ?, updated_at = ? WHERE ref = ?')
          .bind(newSpace, name, phone, email, date || null, headcount, JSON.stringify(data), memo, now(), ref), ...sync.statements]);
        await log(env, 'inquiry.edited', ref, 'admin', { changed });
        return json({ ok: true, changed, confirm_doc_invalidated: sync.invalidated });
      }
      if (d.status === '대기 취소') return err('일자별 예약의 대기 취소 버튼을 이용해 주세요.');
      const statusStatements = [], reconfirmed = []; let receptionResult=null;
      if (d.status !== undefined) {
        const { results: linked } = await env.DB.prepare("SELECT booking_code,status FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled'").bind(ref).all();
        if(['예약 확정','이용 완료'].includes(d.status)&&(linked||[]).some(b=>b.status==='payment_review'))return err('결제 후 일정 확인이 필요한 예약입니다. 예약 목록의 일정 확인 필요 항목에서 검토 후 확정해 주세요.',409,'BOOKING_REVIEW');
        if (d.status === '예약 확정' && !(linked || []).length) return err('예약 확정 버튼에서 일시·금액을 확인한 뒤 확정해 주세요.', 409, 'USE_CONFIRM');
        if ((linked || []).length && !['예약 확정', '이용 완료', '취소·환불'].includes(d.status)) return err('확정 예약은 취소 처리한 뒤 문의 상태를 변경해 주세요.', 409, 'HAS_BOOKING');
        const bookingStatus = { '예약 확정': 'confirmed', '이용 완료': 'completed', '취소·환불': 'cancelled' }[d.status];
        for (const booking of linked || []) { const update = await bookingStatusStatements(env, booking.booking_code, bookingStatus); statusStatements.push(...update.statements); if(bookingStatus==='confirmed' && update.previous!=='confirmed') reconfirmed.push(booking.booking_code); }
      }
      if (d.status !== undefined) { if (!STATUSES.includes(d.status)) return err('상태 값이 올바르지 않습니다.'); sets.push('status = ?'); b.push(d.status); }
      if (d.memo !== undefined) { sets.push('memo = ?'); b.push(str(d.memo, 2000)); }
      const jp = [], jb = [];   // data(JSON) 안의 값은 json_set 하나로 모아 바꿉니다(같은 칸을 두 번 SET 하면 앞의 것이 무시됨)
      if (d.total !== undefined) {
        const t = d.total === '' || d.total === null ? null : amountOk(d.total);
        if (d.total !== '' && d.total !== null && t === null) return err('금액을 확인해 주세요.');
        jp.push("'$.total', ?", "'$.amount_override', 1", "'$.amount_mode', ?", "'$.amount_note', ?", "'$.included_catering_amount', 0", "'$.catering_in_quote', json('false')", "'$.included_reception_amount', 0", "'$.reception_in_quote', json('false')", "'$.included_cocktail_amount', 0", "'$.cocktail_in_quote', json('false')", "'$.price_adjustment', null"); jb.push(t, t === null ? '' : 'manual', str(d.amount_note, 200));
        statusStatements.push(env.DB.prepare("UPDATE bookings SET amount = ?, confirm_doc = CASE WHEN amount IS NOT ? THEN NULL ELSE confirm_doc END, updated_at = ? WHERE inquiry_ref = ? AND status <> 'cancelled'").bind(t, t, now(), ref));
      }
      if (d.channel !== undefined) {
        if (!CHANNELS.includes(d.channel)) return err('문의 경로를 확인해 주세요.');
        const note = str(d.channel_note, 40);
        jp.push("'$.channel', ?", "'$.channel_note', ?"); jb.push(d.channel, note);
      }
      for(const kind of ['catering','cocktail'])if(d[kind]!==undefined){
        if(d.total!==undefined||d.reception!==undefined||(d.catering!==undefined&&d.cocktail!==undefined))return err('공간 금액과 식음료 구성은 각각 저장해 주세요.');
        const item=await env.DB.prepare(`SELECT status,data, ${inquiryAmountSql()} AS effective_amount FROM inquiries i WHERE ref=?`).bind(ref).first();if(!item)return err('문의를 찾을 수 없습니다.',404,'NOT_FOUND');
        if([DELETED,'대기 취소','취소·환불'].includes(item.status))return err('취소·삭제된 문의는 복원한 뒤 저장해 주세요.');
        const old=safe(item.data);if(receptionConflict(d.reception_revision,old))return err('식음료 구성이 변경됐습니다. 문의를 다시 불러와 주세요.',409,'RECEPTION_CHANGED');
        const cocktailRates=kind==='cocktail'?publicCocktailPricing(await readCocktailPricing(env)):null;
        let value=kind==='cocktail'?cocktailAdmin(d[kind],cocktailRates.prices,cocktailRates.revision):cateringAdmin(d[kind],foodPricingData('catering',await readFoodPricing(env,'catering')));if(d[kind]!==null&&!value)return err('식음료 구성을 확인해 주세요.');
        if(kind==='catering'&&value){value.status=d[kind].status||old.catering?.status||'pending';if(!['pending','confirmed','cancelled'].includes(value.status))return err('출장뷔페 상태를 확인해 주세요.');value.order_ref=old.catering?.order_ref||'';value.meal_time=d[kind].meal_time===undefined?(old.catering?.meal_time||''):str(d[kind].meal_time,20);}
        if(!value)value={...(old[kind]||{}),status:'cancelled',removed:true};
        const base={...old};if((Number(old['included_'+kind+'_amount'])>0||old[kind+'_in_quote'])&&item.effective_amount!=null)base.total=item.effective_amount;
        const result=updateFood(base,kind,value);for(const key of [kind,'total','amount_override','included_'+kind+'_amount','reception_revision','quote_input'])if(result.data[key]!==undefined){jp.push("'$."+key+"',json(?)");jb.push(JSON.stringify(result.data[key]));}
        if(old[kind+'_in_quote']||Number(old['included_'+kind+'_amount'])>0)statusStatements.push(env.DB.prepare("UPDATE bookings SET amount=?,updated_at=? WHERE inquiry_ref=? AND status<>'cancelled'").bind(result.data.total,now(),ref));
        if(result.changed)statusStatements.push(env.DB.prepare("UPDATE bookings SET confirm_doc=NULL,updated_at=? WHERE inquiry_ref=? AND status<>'cancelled'").bind(now(),ref));
        if(kind==='catering'&&value.order_ref)statusStatements.push(env.DB.prepare('UPDATE catering_orders SET people=?,status=?,total=?,data=?,meal_time=?,updated_at=? WHERE ref=? AND inquiry_ref=?').bind(value.people,value.status,value.total,JSON.stringify(value),value.meal_time||'',now(),value.order_ref,ref));
        receptionResult={reception_revision:result.data.reception_revision||0,[kind]:value};
      }
      if (d.reception !== undefined) {
        if (d.total !== undefined) return err('공간 금액과 케이터링 구성은 각각 저장해 주세요.');
        const item = await env.DB.prepare(`SELECT status, data, ${inquiryAmountSql()} AS effective_amount FROM inquiries i WHERE ref = ?`).bind(ref).first();
        if (!item) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
        if ([DELETED, '대기 취소', '취소·환불'].includes(item.status)) return err('취소·삭제된 문의는 복원한 뒤 저장해 주세요.');
        const reception = receptionAdmin(d.reception,foodPricingData('reception',await readFoodPricing(env,'reception')),safe(item.data).reception);
        if (!reception) return err('코스·제공 방식·인원과 가격 설정을 확인해 주세요. 맞춤 구성은 상담 후 확정합니다.');
        jp.push("'$.reception', json(?)"); jb.push(JSON.stringify(reception));
        const old = safe(item.data), included = Number(old.included_reception_amount) || 0;
        if(receptionConflict(d.reception_revision,old))return err('케이터링 구성이 다른 화면에서 변경됐습니다. 문의를 다시 불러와 주세요.',409,'RECEPTION_CHANGED');
        const revision=receptionRevision(old)+(receptionChanged(old,reception)?1:0);
        jp.push("'$.reception_revision', ?");jb.push(revision);
        receptionResult={reception_revision:revision,reception};
        let draft=null,currentAmount=item.effective_amount;
        if(old.quote_input){draft=syncFoodInput(syncReceptionInput(old.quote_input,{...old,reception,reception_revision:revision},included>0||!!old.reception_in_quote),{...old,reception,reception_revision:revision});jp.push("'$.quote_input', json(?)");jb.push(JSON.stringify(draft));}
        if(receptionChanged(old,reception))statusStatements.push(env.DB.prepare("UPDATE bookings SET confirm_doc = NULL, updated_at = ? WHERE inquiry_ref = ? AND status <> 'cancelled'").bind(now(),ref));
        if ((included > 0 || old.reception_in_quote) && item.effective_amount != null) {
          const next = reception.status === 'cancelled' || reception.total == null ? 0 : reception.total, amount = Math.max(0, item.effective_amount - included + next);
          currentAmount=amount;
          jp.push("'$.total', ?", "'$.amount_override', 1", "'$.included_reception_amount', ?"); jb.push(amount, next);
          statusStatements.push(env.DB.prepare("UPDATE bookings SET amount = ?, confirm_doc = CASE WHEN amount IS NOT ? THEN NULL ELSE confirm_doc END, updated_at = ? WHERE inquiry_ref = ? AND status <> 'cancelled'").bind(amount, amount, now(), ref));
        }
        if(draft&&old.amount_mode==='quote'&&old.quote_no){
          const saved=await env.DB.prepare('SELECT quote_no,data FROM quotes WHERE quote_no=? AND inquiry_ref=?').bind(old.quote_no,ref).first();
          const calculation=saved&&Calculation.inquiry({data:{...old,reception,quote_input:draft,total:currentAmount},effective_amount:currentAmount},[{...saved,data:safe(saved.data)}]).text;
          if(calculation){jp.push("'$.estimate', ?", "'$.estimate_admin', json('true')", "'$.estimate_quote_no', ?");jb.push(calculation,old.quote_no);}
        }
      }
      if (jp.length) { sets.push("data = json_set(COALESCE(data, '{}'), " + jp.join(', ') + ')'); b.push(...jb); }
      if (!sets.length) return err('변경할 내용이 없습니다.');
      sets.push('updated_at = ?'); b.push(now(), ref);
      if (d.memo !== undefined) statusStatements.push(env.DB.prepare("UPDATE bookings SET memo = ?, updated_at = ? WHERE inquiry_ref = ? AND status <> 'cancelled'").bind(str(d.memo, 2000), now(), ref));
      await batch(env, [env.DB.prepare('UPDATE inquiries SET ' + sets.join(', ') + ' WHERE ref = ?').bind(...b), ...statusStatements]);
      await log(env, 'inquiry.updated', ref, 'admin', d);
      for (const code of reconfirmed) await confirmedGuide(env, code, waitUntil);
      return json({ ok: true,...(receptionResult||{}),...(d.status===undefined?{}:{wait:await inquiryWait(env,ref)}) });
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
          SUM(CASE WHEN status IN ('취소·환불', '대기 취소') THEN 1 ELSE 0 END) AS lost
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
      const ref = mCf[1], d = await readJson(request), force = d.force === true;
      const row = await env.DB.prepare('SELECT ref, space_id, status, name, phone, event_date, headcount, data FROM inquiries WHERE ref = ?').bind(ref).first();
      if (!row) return err('문의를 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (row.status === '대기 취소') return err('대기 취소된 문의입니다. 대기를 복원한 뒤 확정해 주세요.', 409, 'WAIT_CANCELLED');
      if (row.status === DELETED) return err('삭제된 문의입니다. 먼저 복원한 뒤 예약을 확정해 주세요.', 409, 'DELETED');
      const data = safe(row.data);
      const active = await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled' LIMIT 1").bind(ref).first();
      if (active) return err('이미 예약(' + active.booking_code + ')으로 확정된 문의입니다.', 409, 'ALREADY_BOOKED');
      const previous=(await env.DB.prepare("SELECT booking_code,date,amount FROM bookings WHERE inquiry_ref=? AND status='cancelled' ORDER BY id DESC").bind(ref).all()).results||[];
      if(previous.length){const selected=d.reconfirm_booking_code?previous.find(b=>b.booking_code===d.reconfirm_booking_code):previous.length===1?previous[0]:null;if(!selected)return json({ok:false,code:'RECONFIRM_CHOOSE',error:'복원할 기존 예약을 선택해 주세요. 수납 기록은 선택한 예약에 유지됩니다.',bookings:previous},409);return reconfirmBooking(env,selected.booking_code,d,waitUntil,{legacy:d.expected_revision===undefined});}
      const date = str(d.date, 10) || row.event_date || data.date || '';
      if (!isDate(date)) return err('이용일을 정해 주세요.');
      const phone = str(row.phone || data.phone, 30), digits = phone.replace(/\D/g, '');
      if (digits.length < 9) return err('연락처가 없어 예약을 확정할 수 없습니다. 문의 내용 수정에서 연락처를 넣어 주세요.', 400, 'NO_PHONE');
      let phone2;try{phone2=cleanPhone2(d.phone2===undefined?data.phone2:d.phone2,phone);}catch(e){return err(e.message);}
      let bs = hourOk(d.start_h), be = hourOk(d.end_h); if (bs === null || be === null || be <= bs) { bs = null; be = null; }
      const headcount = d.headcount !== undefined && d.headcount !== '' ? num(d.headcount) : (row.headcount ?? data.headcount ?? null);
      const amount = d.amount === '' || d.amount == null ? null : amountOk(d.amount);
      if (d.amount !== '' && d.amount != null && amount === null) return err('금액을 확인해 주세요.');
      const space_id = row.space_id && row.space_id !== 'request' ? row.space_id : 'megaspot-gundae';
      const { results: same } = await env.DB.prepare(`SELECT b.booking_code,b.customer_name,b.date,
        ${bookingHourSql('b','i','start_h')} AS start_h,${bookingHourSql('b','i','end_h')} AS end_h
        FROM bookings b LEFT JOIN inquiries i ON i.ref=b.inquiry_ref
        WHERE b.space_id=? AND b.date BETWEEN date(?,'-1 day') AND date(?,'+1 day') AND b.status='confirmed'`).bind(space_id, date, date).all();
      // 날짜를 넘어 이어지는 예약까지 비교합니다. 시간이 미정이면 같은 이용일의 예약만 확인합니다.
      const clash = (same || []).filter(x => {
        if (bs === null || be === null || !Number.isInteger(x.start_h) || !Number.isInteger(x.end_h) || x.start_h < 0 || x.end_h > 48 || x.end_h <= x.start_h) return x.date === date;
        const offset = (Date.parse(x.date + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 36e5;
        return overlaps(bs, be, x.start_h + offset, x.end_h + offset);
      });
      if (clash.length && !force) return json({ ok: false, error: bs === null ? '이 날짜에 이미 확정된 예약이 있습니다. 이용 시간을 정하거나, 시간이 겹치지 않는지 확인한 뒤 다시 확정해 주세요.' : '이용 시간이 겹치는 확정 예약이 있습니다. 시간을 확인한 뒤 다시 확정해 주세요.', code: 'DATE_HAS_BOOKING', bookings: clash }, 409);
      const code = await uniqueRef(env, 'bookings', 'booking_code', 'MS');
      const slot = bs !== null ? (SLOT_OF[bs + '-' + be] || 'custom') : (/^pkg-/.test(data.slot || '') ? data.slot : 'custom');
      const memo = str(d.memo, 2000) || [data.amount_note || '', chText(data.channel || 'web', data.channel_note)].filter(Boolean).join(' · ');
      const occupancy = confirmedOccupancyFreeSql({space:'span.space_id',date:'span.date',start:'span.start_h',end:'span.end_h'});
      // A cancellation, move or concurrent confirmation may have committed after the initial read.
      const stmts = [
        env.DB.prepare(`INSERT INTO bookings (booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,slot,headcount,memo,status,amount,start_h,end_h,created_at)
          SELECT ?,span.space_id,i.ref,?,?,?,span.date,?,?,?,'confirmed',?,span.start_h,span.end_h,?
          FROM inquiries i CROSS JOIN (SELECT ? AS space_id,? AS date,? AS start_h,? AS end_h) span
          WHERE i.ref=? AND i.status=? AND i.space_id=? AND i.event_date IS ?
            AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.inquiry_ref=i.ref AND b.status<>'cancelled')
            AND (${force?'1':occupancy})`)
          .bind(code, str(row.name || data.name, 80) || '(이름 없음)', phone, digits.slice(-4), slot, headcount, memo, amount, now(), space_id, date, bs, be, ref, row.status, row.space_id, row.event_date),
        env.DB.prepare(`UPDATE inquiries SET status='예약 확정',event_date=?,headcount=?,data=json_set(data,'$.phone2',?,'$.date',?,'$.headcount',?,'$.start_h',?,'$.end_h',?,'$.t_start',?,'$.t_end',?,'$.total',?,'$.amount_override',json('true')),updated_at=?
          WHERE ref=? AND EXISTS(SELECT 1 FROM bookings WHERE booking_code=?)`)
          .bind(date, headcount, phone2, date, headcount, bs, be, bs === null ? '' : hl(bs).replace('다음 날 ', ''), be === null ? '' : hl(be).replace('다음 날 ', ''), amount, now(), ref, code)
      ];
      if (d.block_calendar === true) stmts.push(env.DB.prepare(`INSERT INTO calendar_blocks (space_id,date,state,memo)
        SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE booking_code=?)
        ON CONFLICT(space_id,date) DO UPDATE SET state=excluded.state,memo=excluded.memo`).bind(space_id, date, 'full', '예약 ' + code, code));
      const results = await batch(env, stmts);
      const changes = results?.[0]?.meta?.changes ?? results?.[0]?.changes;
      if (changes === 0 || (changes == null && !await env.DB.prepare('SELECT 1 FROM bookings WHERE booking_code=?').bind(code).first()))
        return err('문의 상태나 예약 현황이 변경되었습니다. 최신 내용을 확인한 뒤 다시 확정해 주세요.',409,'STALE');
      await log(env, 'booking.created', code, 'admin', { space_id, date, from: ref });
      await log(env, 'inquiry.confirmed', ref, 'admin', { booking_code: code, date, amount });
      await confirmedGuide(env, code, waitUntil);
      const others = await waitList(env, date, space_id);
      return json({ ok: true, booking_code: code, date, others: others.length, same_day: (same || []).length });
    }

    // ---- 예약 ----
    if (path === 'bookings' && method === 'GET') {
      const where = [OPERATIONAL_BOOKING_SQL], args = [];
      for (const [param, column, op] of [['from', 'date', '>='], ['to', 'date', '<='], ['space', 'space_id', '='], ['status', 'status', '=']]) {
        const value = str(url.searchParams.get(param), 60); if (value) { where.push('b.' + column + ' ' + op + ' ?'); args.push(value); }
      }
      const page = Math.max(0, Math.min(100000, num(url.searchParams.get('page')) || 0)); args.push(page * 300);
      const { results } = await env.DB.prepare(`SELECT booking_code, space_id, inquiry_ref, customer_name, phone, ${bookingPhone2Sql()} AS phone2, date, slot, headcount, memo, status, ${bookingAmountSql()} AS amount, start_h, end_h, created_at, json_extract(confirm_doc, '$.issued_at') AS confirm_issued,
        CASE WHEN b.inquiry_ref IS NOT NULL THEN (SELECT CASE WHEN json_extract(ic.checks, '$.guarantee_paid') IS NULL THEN NULL WHEN json_extract(ic.checks, '$.guarantee_paid') = 0 THEN 0 ELSE 1 END FROM inquiry_checks ic WHERE ic.ref = b.inquiry_ref)
             ELSE (SELECT dc.paid FROM booking_deposit_checks dc WHERE dc.booking_code = b.booking_code) END AS deposit_paid
        FROM bookings b ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC, created_at DESC, id DESC LIMIT 301 OFFSET ?`).bind(...args).all();
      const items=(results || []).slice(0,300), guides=await guideSummary(env,items.map(x=>x.booking_code)),settlements=await settlementsFor(env,items.map(x=>x.booking_code));
      return json({ ok: true, has_more: (results || []).length > 300, items: items.map(x=>({...x,settlement:settlements[x.booking_code],guide_status:guides[x.booking_code] || ''})) });
    }
    if (path === 'bookings' && method === 'POST') {
      const d = await readJson(request);
      const linkedRef = str(d.inquiry_ref, 20).toUpperCase();
      if (linkedRef) {
        const confirmRequest = new Request(url.origin + '/api/admin/inquiries/' + linkedRef + '/confirm', { method: 'POST', headers: request.headers,
          body: JSON.stringify({ date: d.date, start_h: d.start_h, end_h: d.end_h, headcount: d.headcount, amount: d.amount, memo: d.memo, phone2:d.phone2, block_calendar: d.block_calendar, force: d.force,reconfirm_booking_code:d.reconfirm_booking_code,expected_revision:d.expected_revision,request_id:d.request_id }) });
        return onRequest({ request: confirmRequest, env, params: { path: ['inquiries', linkedRef, 'confirm'] }, waitUntil });
      }
      const space_id = spaceOk(d.space_id), name = str(d.customer_name, 80), phone = str(d.phone, 30), date = str(d.date, 10);
      if (!name || !phone || !isDate(date)) return err('예약자·연락처·이용일을 확인해 주세요.');
      const digits = phone.replace(/\D/g, ''); if (digits.length < 9) return err('연락처 형식을 확인해 주세요.');
      let phone2;try{phone2=cleanPhone2(d.phone2,phone);}catch(e){return err(e.message);}
      const code = await uniqueRef(env, 'bookings', 'booking_code', 'MS');
      let bs = hourOk(d.start_h), be = hourOk(d.end_h); if (bs === null || be === null || be <= bs) { bs = null; be = null; }
      const clashes = await bookingClashes(env, space_id, date, bs, be);
      if (clashes.length && !d.force) return conflictResponse(clashes);
      if (d.amount !== '' && d.amount != null && amountOk(d.amount) === null) return err('금액을 확인해 주세요.');
      const statements = [env.DB.prepare('INSERT INTO bookings (booking_code, space_id, inquiry_ref, customer_name, phone, phone_last4, date, slot, headcount, memo, status, amount, start_h, end_h, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(code, space_id, null, name, phone, digits.slice(-4), date, str(d.slot, 20) || 'custom', num(d.headcount), str(d.memo, 2000), 'confirmed', amountOk(d.amount), bs, be, now())];
      statements.push(saveBookingPhone2(env,code,phone2));
      if (d.block_calendar) statements.push(env.DB.prepare('INSERT INTO calendar_blocks (space_id, date, state, memo) VALUES (?,?,?,?) ON CONFLICT(space_id, date) DO UPDATE SET state = excluded.state, memo = excluded.memo').bind(space_id, date, 'full', '예약 ' + code));
      await batch(env, statements);
      await log(env, 'booking.created', code, 'admin', { space_id, date });
      await confirmedGuide(env, code, waitUntil);
      return json({ ok: true, booking_code: code });
    }
    // 예약 목록 — 확정 예약(bookings)과 날짜가 정해진 미확정 문의·예약 신청을 날짜순으로 함께 돌려줍니다.
    // 같은 날 예약 대기 순번 저장: refs 순서대로 1, 2, 3… (목록에 없는 대기자는 기존 순서대로 뒤에 붙임)
    if (path === 'reservations/waitlist' && method === 'POST') {
      const d = await readJson(request), date = str(d.date, 10), space_id = spaceOk(d.space_id);
      if (!isDate(date)) return err('날짜를 확인해 주세요.');
      const refs = Array.from(new Set((Array.isArray(d.refs) ? d.refs : []).map(r => str(r, 20).toUpperCase()).filter(r => /^[A-Z0-9-]{4,20}$/.test(r)))).slice(0, 200);
      if (!refs.length) return err('순서를 정할 문의가 없습니다.');
      const cur = await waitList(env, date, space_id);
      const bad = refs.filter(r => !cur.includes(r));
      if (bad.length) return err('이 날짜의 예약 대기 목록이 바뀌었습니다. 새로고침한 뒤 다시 정해 주세요.', 409, 'STALE');
      const order = refs.concat(cur.filter(r => !refs.includes(r))), t = now();
      const stmts = order.map((r, i) => env.DB.prepare("UPDATE inquiries SET data = json_set(COALESCE(data, '{}'), '$.wait_rank', ?, '$.wait_rank_at', ?) WHERE ref = ?").bind(i + 1, t, r));
      if (typeof env.DB.batch === 'function') await env.DB.batch(stmts); else for (const st of stmts) await st.run();
      await log(env, 'waitlist.updated', date, 'admin', { date, space_id, count: order.length });
      return json({ ok: true, date, space_id, order });
    }
    if (path === 'reservations' && method === 'GET') {
      const from = str(url.searchParams.get('from'), 10), to = str(url.searchParams.get('to'), 10);
      if ((from && !isDate(from)) || (to && !isDate(to))) return err('기간을 확인해 주세요.');
      const f = from || '0000-01-01', t = to || '9999-12-31';
      const page = Math.max(0, Math.min(100000, num(url.searchParams.get('page')) || 0)), offset = page * 1000;
      const latestQ = "(SELECT q.total FROM quotes q WHERE q.inquiry_ref = b.inquiry_ref ORDER BY q.id DESC LIMIT 1)";
      const { results: bks } = await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.inquiry_ref, b.customer_name, b.phone, ${bookingPhone2Sql()} AS phone2, b.date, b.slot, b.headcount, CASE WHEN i.ref IS NOT NULL THEN COALESCE(i.memo, '') ELSE COALESCE(b.memo, '') END AS operation_memo, b.status, b.amount, b.start_h, b.end_h, b.created_at, json_extract(b.confirm_doc, '$.issued_at') AS confirm_issued,
          CASE WHEN b.inquiry_ref IS NOT NULL THEN (SELECT CASE WHEN json_extract(ic.checks, '$.guarantee_paid') IS NULL THEN NULL WHEN json_extract(ic.checks, '$.guarantee_paid') = 0 THEN 0 ELSE 1 END FROM inquiry_checks ic WHERE ic.ref = b.inquiry_ref)
               ELSE (SELECT dc.paid FROM booking_deposit_checks dc WHERE dc.booking_code = b.booking_code) END AS deposit_paid,
          o.oid AS order_oid, o.price AS order_price, o.status AS order_status, ${latestQ} AS quote_total,
          ${bookingAmountSql()} AS effective_amount, ${amountOverrideSql()} AS amount_override,
          json_extract(i.data, '$.total') AS inq_total, json_extract(i.data, '$.start_h') AS inq_start, json_extract(i.data, '$.end_h') AS inq_end, json_extract(i.data, '$.purpose') AS purpose, json_extract(i.data, '$.channel') AS channel, json_extract(i.data, '$.channel_note') AS channel_note, json_extract(i.data, '$.family') AS family,
          ${ORDER_OF_BOOKING} AS cat_ord, CASE WHEN COALESCE(json_extract(i.data, '$.catering.by'), '') <> 'admin' THEN json_extract(i.data, '$.catering.summary') END AS cat_req
        FROM bookings b LEFT JOIN orders o ON o.id = (SELECT ox.id FROM orders ox WHERE ox.booking_code = b.booking_code ORDER BY ox.id DESC LIMIT 1) LEFT JOIN inquiries i ON i.ref = b.inquiry_ref
        WHERE b.date BETWEEN ? AND ? AND ${OPERATIONAL_BOOKING_SQL}
        ORDER BY b.date ASC, COALESCE(b.start_h, json_extract(i.data, '$.start_h'), 99) ASC, b.id ASC LIMIT 1001 OFFSET ?`).bind(f, t, offset).all();
      const iqQ = "(SELECT q.total FROM quotes q WHERE q.inquiry_ref = i.ref ORDER BY q.id DESC LIMIT 1)";
      const { results: pend } = await env.DB.prepare(`WITH wait_queue AS (${rankedWaitsSql('i.event_date BETWEEN ? AND ?')})
        SELECT i.ref, i.space_id, i.status, i.name, i.phone, i.event_date, i.headcount, i.memo, i.created_at, (SELECT CASE WHEN json_extract(ic.checks, '$.guarantee_paid') IS NULL THEN NULL WHEN json_extract(ic.checks, '$.guarantee_paid') = 0 THEN 0 ELSE 1 END FROM inquiry_checks ic WHERE ic.ref = i.ref) AS deposit_paid, ${iqQ} AS quote_total, ${inquiryAmountSql()} AS effective_amount, ${amountOverrideSql()} AS amount_override,
          json_extract(i.data, '$.total') AS inq_total, json_extract(i.data, '$.start_h') AS start_h, json_extract(i.data, '$.end_h') AS end_h, json_extract(i.data, '$.t_start') AS t_start, json_extract(i.data, '$.t_end') AS t_end,
          json_extract(i.data, '$.slot') AS slot, json_extract(i.data, '$.reserve') AS reserve, json_extract(i.data, '$.purpose') AS purpose, json_extract(i.data, '$.channel') AS channel, json_extract(i.data, '$.channel_note') AS channel_note, json_extract(i.data, '$.inquiry_type') AS inquiry_type, json_extract(i.data, '$.family') AS family, json_extract(i.data, '$.wait_rank') AS wait_rank, json_extract(i.data, '$.wait_restored_at') AS wait_restored_at,
          ${ORDER_OF_INQUIRY} AS cat_ord, CASE WHEN COALESCE(json_extract(i.data, '$.catering.by'), '') <> 'admin' THEN json_extract(i.data, '$.catering.summary') END AS cat_req,
          w.no AS wait_no,w.total AS wait_total,w.space_id AS wait_space_id
        FROM inquiries i LEFT JOIN wait_queue w ON w.ref=i.ref
        WHERE i.event_date BETWEEN ? AND ? AND (w.ref IS NOT NULL OR (i.status='대기 취소'
          AND NOT EXISTS(SELECT 1 FROM bookings b2 WHERE b2.inquiry_ref=i.ref AND b2.status<>'cancelled')))
        ORDER BY i.event_date ASC, i.id ASC LIMIT 1001 OFFSET ?`).bind(f, t, f, t, offset).all();
      const items = [];
      const jarr = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.slice(0, 4) : []; } catch { return []; } };
      for (const b of (bks || []).slice(0, 1000)) items.push({ family: jarr(b.family), kind: 'booking', code: b.booking_code, space_id: b.space_id || '', ref: b.inquiry_ref, name: b.customer_name, phone: b.phone, phone2:b.phone2||'', date: b.date, slot: b.slot,
        start_h: b.start_h ?? b.inq_start ?? null, end_h: b.end_h ?? b.inq_end ?? null, headcount: b.headcount, memo: b.operation_memo, status: b.status, purpose: b.purpose || '', channel: b.order_oid ? 'online' : (b.channel || (b.inquiry_ref ? 'web' : '')), channel_note: b.channel_note || '',
        amount: b.effective_amount, deposit_paid: b.deposit_paid,
        confirm_issued: b.confirm_issued || '', amount_src: b.amount_override ? 'adjusted' : (b.amount != null ? 'booking' : (b.order_price != null && b.order_status !== 'failed' ? 'order' : (b.quote_total != null ? 'quote' : (b.inq_total != null ? 'estimate' : '')))), order: b.order_oid || '', catering: orderBrief(b.cat_ord), catering_req: b.cat_req || '' });
      for (const p of (pend || []).slice(0, 1000)) items.push({ family: jarr(p.family), kind: 'pending', code: '', ref: p.ref, space_id: p.space_id || '', name: p.name, phone: p.phone, date: p.event_date, slot: p.slot, start_h: p.start_h ?? null, end_h: p.end_h ?? null,
        t_start: p.t_start || '', t_end: p.t_end || '', headcount: p.headcount, memo: p.memo || '', status: p.status, reserve: !!p.reserve, purpose: p.purpose || '', channel: p.channel || 'web', channel_note: p.channel_note || '', inquiry_type: p.inquiry_type || 'event', wait_rank: p.wait_rank == null ? null : Number(p.wait_rank), created_at: p.created_at, wait_restored_at: p.wait_restored_at || '',
        wait: p.wait_no==null?null:{no:p.wait_no,total:p.wait_total,date:p.event_date,space_id:p.wait_space_id},
        amount: p.effective_amount, deposit_paid: p.deposit_paid, amount_src: p.amount_override ? 'adjusted' : (p.quote_total != null ? 'quote' : (p.inq_total != null ? 'estimate' : '')), catering: orderBrief(p.cat_ord), catering_req: p.cat_req || '' });
      const guides=await guideSummary(env,items.filter(x=>x.kind==='booking').map(x=>x.code));
      for(const item of items) if(item.kind==='booking') item.guide_status=guides[item.code] || '';
      const paymentChecks=await paymentChecksFor(env,items,await settlementsFor(env,items.filter(x=>x.kind==='booking').map(x=>x.code)));
      for(const item of items)Object.assign(item,paymentChecks[(item.kind==='booking'?'booking:'+item.code:'inquiry:'+item.ref)]);
      items.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : ((a.start_h ?? 99) - (b.start_h ?? 99)));
      const und = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('문의 접수', '조건 확인', '견적 발송', '결제 대기') AND (event_date IS NULL OR event_date = '')").first();
      // 같은 기간의 현장답사 (날짜 머리에 '현장답사 n건'으로 표시)
      const { results: vis } = await env.DB.prepare("SELECT id, ref, inquiry_ref, space_id, visit_date AS date, start_time AS time, duration, status, name FROM site_visits WHERE visit_date BETWEEN ? AND ? AND status IN ('requested','scheduled','done') ORDER BY visit_date, start_time LIMIT 500").bind(f, t).all();
      return json({ ok: true, has_more: (bks || []).length > 1000 || (pend || []).length > 1000, from: f, to: t, today: kstToday(), items, undated: (und || {}).n || 0, visits: vis || [] });
    }
    // ---- 예약확정서 (발급 내용 조회·저장, 고객용 링크) ----
    const mDeposit = path.match(/^bookings\/([A-Z0-9-]+)\/deposit-paid$/);
    if (mDeposit && method === 'PUT') {
      const d = await readJson(request);
      if (typeof d.paid !== 'boolean') return err('보증금 입금 여부를 확인해 주세요.');
      const b = await env.DB.prepare('SELECT inquiry_ref, status FROM bookings WHERE booking_code = ?').bind(mDeposit[1]).first();
      if (!b) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (b.status === 'cancelled') return err('취소된 예약은 변경할 수 없습니다.');
      if (b.inquiry_ref) {
        await env.DB.prepare("INSERT INTO inquiry_checks (ref, checks, updated_at) VALUES (?, json_object('guarantee_paid', json(?)), ?) ON CONFLICT(ref) DO UPDATE SET checks = json_set(inquiry_checks.checks, '$.guarantee_paid', json(?)), updated_at = excluded.updated_at")
          .bind(b.inquiry_ref, d.paid ? 'true' : 'false', now(), d.paid ? 'true' : 'false').run();
      } else {
        await env.DB.prepare('INSERT INTO booking_deposit_checks (booking_code, paid, updated_at) VALUES (?,?,?) ON CONFLICT(booking_code) DO UPDATE SET paid = excluded.paid, updated_at = excluded.updated_at')
          .bind(mDeposit[1], d.paid ? 1 : 0, now()).run();
      }
      await log(env, 'booking.deposit_paid', mDeposit[1], 'admin', { paid: d.paid });
      return json({ ok: true, paid: d.paid });
    }
    const mCd = path.match(/^bookings\/([A-Z0-9-]+)\/confirm-doc$/);
    if (mCd) {
      const code = mCd[1];
      const row = await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.inquiry_ref, b.customer_name, b.phone, ${bookingPhone2Sql()} AS phone2, b.date, b.slot, b.headcount, b.status, b.amount, b.start_h, b.end_h, b.confirm_doc, b.created_at,
          ${bookingAmountSql()} AS effective_amount, i.data AS idata, (SELECT o.status FROM orders o WHERE o.booking_code = b.booking_code ORDER BY o.id DESC LIMIT 1) AS order_status, (SELECT COALESCE(SUM(MAX(0,o.price-COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0))),0) FROM orders o WHERE o.booking_code=b.booking_code AND o.status='paid') AS paid_amount
        FROM bookings b LEFT JOIN inquiries i ON i.ref = b.inquiry_ref WHERE b.booking_code = ?`).bind(code).first();
      if (!row) return err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      // 고객 링크는 대표 주소로 만듭니다 (관리자가 *.pages.dev 로 들어와도 megaspot.kr 링크)
      const base = env.SITE_URL || (/\.pages\.dev$/.test(url.hostname) ? 'https://megaspot.kr' : url.origin);
      const k = await confirmToken(env, code), link = base + '/confirm/?c=' + encodeURIComponent(code) + '&k=' + k;
      const ord = await cateringOrderFor(env,row.inquiry_ref||'',code),foodData=await confirmationFoodData(env,row,ord);
      if (method === 'GET') {
        const idata = foodData;
        // Full saved buffet configuration is also available for direct bookings.
           // 출장뷔페 진행 건 (문의 없이 등록한 예약도)
        const cat = idata.catering || ord || null;
        const settlement=await settlementFor(env,code),pref=await env.DB.prepare('SELECT show_amount FROM booking_reconfirmations WHERE booking_code=? ORDER BY id DESC LIMIT 1').bind(code).first();
        const inq = { ref: row.inquiry_ref || '', name: idata.name || '', org: idata.org || '', purpose: idata.purpose || '', options: idata.options || {}, reception_revision:receptionRevision(idata), catering: cat, cocktail:idata.cocktail||null, reception: idata.reception || null, included_reception_amount: idata.included_reception_amount || 0,included_cocktail_amount:idata.included_cocktail_amount||0, t_start: idata.t_start || '', t_end: idata.t_end || '', start_h: idata.start_h ?? null, end_h: idata.end_h ?? null };
        const doc = parseDoc(row.confirm_doc), currentReception = receptionDocument(idata, row.effective_amount), currentFoods=foodDocuments({...idata,catering:cat},row.effective_amount);
        const needs_reissue = !!(doc?.issued_at && ((!Object.hasOwn(doc,'settlement')||doc.settlement.revision!==settlement.revision)||(currentReception&&!Object.hasOwn(doc,'reception'))||(currentFoods.length&&!Object.hasOwn(doc,'food_services'))));
        const previewDoc = {...(doc||{}),settlement:doc&&Object.hasOwn(doc,'settlement')?doc.settlement:settlement,reception:doc&&Object.hasOwn(doc,'reception')?doc.reception:currentReception,food_services:doc&&Object.hasOwn(doc,'food_services')?doc.food_services:currentFoods};
        if(needs_reissue)previewDoc.items=stripFoodItems(withoutReceptionItems(previewDoc.items||[]));
        return json({ ok: true, conditions_revision:confirmationConditions(row,idata), settlement, document_preferences:pref?{show_amount:!!pref.show_amount}:null, needs_reissue, reception:currentReception, food_services:currentFoods, booking: { code, space_id: row.space_id, name: row.customer_name, phone: row.phone, date: row.date, slot: row.slot, headcount: row.headcount, status: row.status, amount: row.effective_amount, start_h: row.start_h, end_h: row.end_h, order_status: row.order_status || '', paid_amount:settlement.net },
          inquiry: inq, doc, preview: publicDoc(row, previewDoc), link: doc && doc.issued_at ? link : '', token: k });
      }
      if (method === 'PUT') {
        if(row.status==='payment_review')return err('일정 확인 전에는 예약확정서를 발급할 수 없습니다.',409,'BOOKING_REVIEW');
        if (row.status === 'cancelled') return err('취소된 예약은 확정서를 발급할 수 없습니다.', 409, 'CANCELLED');
        const d = await readJson(request), prev = parseDoc(row.confirm_doc) || {}, t = now(), currentData=foodData;
        if(d.conditions_revision!==undefined&&d.conditions_revision!==confirmationConditions(row,currentData))return err('문의·예약 조건이 변경됐습니다. 최신 조건을 다시 불러와 확정서를 발급해 주세요.',409,'CONDITIONS_CHANGED');
        if(receptionConflict(d.reception_revision,currentData) || (d.reception_revision===undefined&&receptionRevision(currentData)>0&&Number(d.doc?.amount)!==row.effective_amount))return err('식음료 변경으로 확정서 조건이 달라졌습니다. 최신 예약을 다시 불러와 발급해 주세요.',409,'RECEPTION_CHANGED');
        const settlement=await settlementFor(env,code);
        if(d.settlement_revision!==undefined&&d.settlement_revision!==settlement.revision)return err('수납 내역이 변경됐습니다. 최신 금액으로 다시 발급해 주세요.',409,'PAYMENT_CHANGED');
        const doc = { ...cleanDoc(d.doc), issued_at: prev.issued_at || t, updated_at: t, issue_no: (prev.issue_no || 0) + 1 };
        doc.amount=row.effective_amount;doc.paid=settlement.net;doc.pay_status=settlement.status==='unpriced'?'pending':settlement.status;doc.settlement=settlement;
        doc.reception = receptionDocument(currentData,doc.amount);doc.food_services=foodDocuments(currentData,doc.amount);
        if(doc.food_services.length)doc.items=stripFoodItems(doc.items);
        if(doc.reception)doc.items=withoutReceptionItems(doc.items);
        await env.DB.prepare('UPDATE bookings SET confirm_doc = ?, updated_at = ? WHERE booking_code = ?').bind(JSON.stringify(doc), t, code).run();
        await log(env, prev.issued_at ? 'booking.confirm_doc.updated' : 'booking.confirm_doc.issued', code, 'admin', { issue_no: doc.issue_no });
        return json({ ok: true, doc, preview: publicDoc(row, doc), link });
      }
      return err('지원하지 않는 요청입니다.', 405, 'METHOD');
    }
    const paymentCheckResult=await reservationPaymentAdmin({env,request,path,method});if(paymentCheckResult)return paymentCheckResult;
    const contactResult=await contactsAdmin({env,request,path,method});if(contactResult)return contactResult;
    const mBk = path.match(/^bookings\/([A-Z0-9-]+)$/);
    if (mBk && method === 'PATCH') {
      const d = await readJson(request); const code = mBk[1];
      if (!['confirmed', 'completed', 'cancelled'].includes(d.status)) return err('상태 값이 올바르지 않습니다.');
      const current=await env.DB.prepare('SELECT status FROM bookings WHERE booking_code=?').bind(code).first();
      if(current?.status==='payment_review'&&d.status!=='cancelled'&&(d.status!=='confirmed'||d.confirm_review!==true))return err('결제 완료 건의 일정 검토 후 확정을 명시적으로 확인해 주세요.',409,'BOOKING_REVIEW');
      if(current?.status==='cancelled'&&d.status==='confirmed')return reconfirmBooking(env,code,d,waitUntil,{legacy:true});
      const update = await bookingStatusStatements(env, code, d.status); if (update.error) return update.error;
      await batch(env, update.statements);
      if(current?.status==='payment_review'&&d.status==='confirmed'&&(await env.DB.prepare('SELECT status FROM bookings WHERE booking_code=?').bind(code).first())?.status!=='confirmed')return err('예약 일정이 변경됐거나 다른 예약·마감과 겹칩니다. 최신 내용을 확인해 주세요. 예약 확정을 보류했습니다.',409,'DATE_HAS_BOOKING');
      await log(env, 'booking.updated', code, 'admin', d);
      if (update.ref) await log(env, 'booking.updated', update.ref, 'admin', { booking_code: code, status: d.status });
      if (d.status === 'confirmed' && update.previous !== 'confirmed') await confirmedGuide(env, code, waitUntil);
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
      let sql = `SELECT oid, product_id, title, event_date, people, price, buyer_name, buyer_phone, buyer_email, status, pay_method, tid, appl_at, result_msg, booking_code, (SELECT status FROM bookings WHERE booking_code=orders.booking_code) AS booking_status, inquiry_ref, member_id, memo, test, created_at, paid_at, updated_at, EXISTS (SELECT 1 FROM payapp_payments p WHERE p.oid = orders.oid) AS payapp, ${refundAmountSql('orders')} AS refunded_amount FROM orders WHERE 1=1`; const b = [];
      if (st) { sql += ' AND status = ?'; b.push(st); }
      if (q) { sql += ' AND (oid LIKE ? OR buyer_name LIKE ? OR buyer_phone LIKE ? OR booking_code LIKE ?)'; b.push('%' + q.toUpperCase() + '%', '%' + q + '%', '%' + q + '%', '%' + q.toUpperCase() + '%'); }
      sql += ' ORDER BY created_at DESC LIMIT 300';
      const { results } = await env.DB.prepare(sql).bind(...b).all();
      return json({ ok: true, items: results || [] });
    }
    const mOrd = path.match(/^orders\/([A-Z0-9-]+)$/);
    if (mOrd && method === 'GET') {
      const row = await env.DB.prepare(`SELECT *,${refundAmountSql('orders')} AS refunded_amount FROM orders WHERE oid = ?`).bind(mOrd[1]).first();
      if (!row) return err('주문을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      const { results: lg } = await env.DB.prepare('SELECT kind, actor, detail, created_at FROM event_log WHERE ref = ? ORDER BY id DESC LIMIT 20').bind(mOrd[1]).all();
      return json({ ok: true, item: { ...row, data: safe(row.data) }, log: lg || [] });
    }
    if (mOrd && method === 'PATCH') {
      // 기존 PG 주문만 수동 기록. 페이앱 주문 상태는 검증된 통보에서만 변경합니다.
      const d = await readJson(request); const oid = mOrd[1]; const sets = [], b = [], linkedStatements = [];
      if (d.status !== undefined) {
        const pa = await env.DB.prepare('SELECT oid FROM payapp_payments WHERE oid = ?').bind(oid).first();
        if (pa) return err('페이앱 판매자 관리자에서 취소해 주세요. 결과는 자동 반영됩니다.', 409, 'PAYAPP_MANAGED');
        if (!['paid', 'cancelled', 'refunded'].includes(d.status)) return err('상태 값이 올바르지 않습니다.');
        sets.push('status = ?'); b.push(d.status);
        if (d.status !== 'paid') {
          const row = await env.DB.prepare('SELECT booking_code, event_date FROM orders WHERE oid = ?').bind(oid).first();
          if (row && row.booking_code) {
            const update = await bookingStatusStatements(env, row.booking_code, 'cancelled');
            if (!update.error) linkedStatements.push(...update.statements);
          }
        }
      }
      if (d.memo !== undefined) { sets.push('memo = ?'); b.push(str(d.memo, 1000)); }
      if (!sets.length) return err('변경할 내용이 없습니다.');
      sets.push('updated_at = ?'); b.push(now(), oid);
      await batch(env, [env.DB.prepare('UPDATE orders SET ' + sets.join(', ') + ' WHERE oid = ?').bind(...b), ...linkedStatements]);
      await log(env, 'order.updated', oid, 'admin', d);
      return json({ ok: true });
    }

    // ---- 일정 ----
    if (path === 'calendar' && method === 'GET') {
      const from = str(url.searchParams.get('from'), 10), to = str(url.searchParams.get('to'), 10), space = str(url.searchParams.get('space'), 60);
      if ((from && !isDate(from)) || (to && !isDate(to))) return err('기간을 확인해 주세요.');
      const args = [from || '0000-01-01', to || '9999-12-31'];
      if (SPACES[space]) args.push(space);
      const { results } = await env.DB.prepare('SELECT space_id, date, state, memo FROM calendar_blocks WHERE date BETWEEN ? AND ?' + (SPACES[space] ? ' AND space_id = ?' : '') + ' ORDER BY date ASC').bind(...args).all();
      return json({ ok: true, items: results || [] });
    }
    if (path === 'calendar' && method === 'POST') {
      const d = await readJson(request); const space_id = spaceOk(d.space_id), date = str(d.date, 10), state = str(d.state, 10);
      if (!isDate(date)) return err('날짜를 확인해 주세요.');
      if (state === 'open') { await env.DB.prepare('DELETE FROM calendar_blocks WHERE space_id = ? AND date = ?').bind(space_id, date).run(); }
      else if (['full', 'hold'].includes(state)) { await env.DB.prepare('INSERT INTO calendar_blocks (space_id, date, state, memo) VALUES (?,?,?,?) ON CONFLICT(space_id, date) DO UPDATE SET state = excluded.state, memo = excluded.memo').bind(space_id, date, state, str(d.memo, 200)).run(); }
      else return err('상태 값이 올바르지 않습니다.');
      await log(env, 'calendar.updated', space_id + ':' + date, 'admin', d);
      return json({ ok: true });
    }

    const vs = await visitsAdmin(request, env, path, method, url); if (vs) return vs;
    const co = await cateringOrdersAdmin(request, env, path, method, url); if (co) return co;
    const pf = await platformAdmin(request, env, path, method, url); if (pf) return pf;

    return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  } catch (e) { console.error('admin', e && e.message); return err('처리 중 오류가 발생했습니다. (' + String(e && e.message || '').slice(0, 120) + ')', 500, 'SERVER_ERROR'); }
}
function safe(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
