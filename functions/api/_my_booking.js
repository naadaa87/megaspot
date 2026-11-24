// 나의 예약확인 (2026-11-24) — 예약 고객이 받거나 찾아가던 화면들을 한 곳에서 보여 줍니다.
//
// 들어오는 문 세 가지
//   ① 예약번호 + 예약자 휴대폰 뒷 4자리   POST /api/my-booking/lookup
//   ② 예약확정서 링크 열쇠(c + k)          GET  /api/my-booking/view?c=&k=     (①의 결과로 받은 열쇠도 같음)
//   ③ 회원 로그인 — 내 예약 목록            GET  /api/my-booking/mine
// 셋 모두 예약확정서 조회와 같은 신뢰 수준입니다. 그래서 출입 방법(도어락·와이파이)과 환급 계좌 등록처럼
// 따로 보낸 전용 링크가 필요한 것은 여기서 열지 않고 '받은 예약 안내 링크에서'로 안내합니다.
//
// 이 모듈은 읽기만 합니다. 예약·문의·결제·계약서·초대장 표에 쓰지 않습니다.
import { json, err, str, kstToday, getMember } from './_lib.js';
import { SPACES, parseDoc, confirmToken, tokenEq } from './_confirm.js';
import { settlementFor } from './_settlement.js';
import { paymentSchedule } from './_booking_payment_schedule.js';
import { depositDueDate } from './_deposit_due.js';
import { refundBooking, refundDate, eventTime } from './_deposit_refunds.js';
import { links as inviteLinks, summarize as rsvpSummary } from './_invites.js';
import { linkOf as contractLink, STATUS as CONTRACT_STATUS } from './_contracts.js';
import { RENTAL_BANK, DEPOSIT_BANK, bankCopy } from './_business.js';

const STATUS = { confirmed: '예약 확정', completed: '이용 완료', cancelled: '취소된 예약', payment_review: '결제 확인 중' };
const SPACE_PAGE = { 'megaspot-gundae': '/spaces/megaspot-gundae/', 'megaspot-gundae-2': '/spaces/megaspot-gundae-2/' };
const money = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
const parse = s => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };

export const validCode = c => /^[A-Z0-9][A-Z0-9-]{3,19}$/.test(String(c || ''));

// 자정을 넘겨 시작하는 예약(전날 날짜 + 24시 이상)은 실제 날짜로 보여 줍니다.
export function realStart(date, startH) {
  const h = Number(startH);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(h) || h < 24) return { date, start_h: Number.isFinite(h) ? h : null, shifted: false };
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  return { date: d.toISOString().slice(0, 10), start_h: h - 24, shifted: true };
}

function depositAmount(b) {
  const d = parseDoc(b.confirm_doc) || {}, q = parse(b.quote_data);
  return money(b.deposit_amount) ? b.deposit_amount : money(d.deposit) ? d.deposit : money(q.deposit) ? q.deposit : 150000;
}

// 예약 한 건의 화면 내용 (읽기 전용)
export async function bookingView(env, code, { today = kstToday() } = {}) {
  const b = await refundBooking(env, code);
  if (!b) return null;
  const doc = parseDoc(b.confirm_doc);
  const live = ['confirmed', 'completed'].includes(b.status);
  const end = eventTime(b);
  const start = realStart(b.date, end ? end.hours[0] : b.start_h);
  const k = await confirmToken(env, b.booking_code);
  const out = {
    booking: {
      code: b.booking_code, space_id: b.space_id, space: spaceName(b.space_id), space_url: SPACE_PAGE[b.space_id] || '',
      date: b.date, start_date: start.date, after_midnight: start.shifted,
      start_h: end ? end.hours[0] : (b.start_h ?? null), end_h: end ? end.hours[1] : (b.end_h ?? null),
      headcount: b.headcount ?? null, status: b.status, status_label: STATUS[b.status] || b.status,
      ended: !!end && end.end <= Date.now(), days_left: daysBetween(today, start.date),
      name: b.customer_name ? String(b.customer_name).trim().slice(0, 1) + '○○' : ''
    },
    key: { c: b.booking_code, k },
    confirmation: { issued: !!(doc && doc.issued_at), needs_reissue: !!(doc && doc.food_needs_reissue), url: '/confirm/?c=' + encodeURIComponent(b.booking_code) + '&k=' + k },
    payment: null, deposit: null, contract: null, invite: null, review: null, food: null,
    links: {
      parking: '/parking/purchase/', parking_guide: '/parking/',
      rebook: '/inquiry/?' + new URLSearchParams({ ...(SPACE_PAGE[b.space_id] ? { space: b.space_id } : {}), ...(b.headcount ? { people: String(b.headcount) } : {}) }).toString(),
      food: '/catering/#food-compare', kit: '/kit/', play: '/play/', guide: '/guide/', help: '/help/'
    }
  };
  if (!live) return out;   // 취소·확인 중인 예약은 상태와 확정서 링크까지만

  // 결제 (확정서에서 금액을 숨긴 예약은 금액을 싣지 않습니다)
  const vis = await env.DB.prepare('SELECT amount_visible, confirmed_at, confirm_version FROM booking_journey_state WHERE booking_code = ?').bind(b.booking_code).first().catch(() => null);
  const showAmount = !(doc && doc.show_amount === false) && vis?.amount_visible !== 0;
  if (showAmount) {
    const s = await settlementFor(env, b.booking_code).catch(() => null), schedule = await paymentSchedule(env, b).catch(() => ({}));
    out.payment = { visible: true, total: s?.amount ?? null, paid: s?.net ?? null, balance: s?.balance ?? null, due_date: schedule?.due_date || '', complete: !!s && s.amount != null && s.balance === 0 };
    if (out.payment.balance > 0 && b.status !== 'completed') out.payment.bank = bankCopy(RENTAL_BANK);
  } else out.payment = { visible: false };

  // 보증금 (계좌 원문·마스킹 번호는 싣지 않습니다)
  if (b.space_id !== 'food-only') {
    const amount = depositAmount(b), returned = !!b.legacy_returned || b.state === 'completed';
    const dep = { method: b.deposit_method || '', amount: showAmount ? amount : null, paid: !!b.deposit_paid, returned,
      refund_date: b.settled_refund_date || refundDate(b), account_registered: !!b.account_cipher, due_date: null };
    if (end) dep.due_date = depositDueDate({ ...b, confirmed_day: vis?.confirm_version > 0 ? vis.confirmed_at?.slice(0, 10) : undefined });
    if (showAmount && amount > 0 && !dep.paid && !returned && b.deposit_method !== 'card' && !out.booking.ended) dep.bank = bankCopy(DEPOSIT_BANK);
    out.deposit = dep;
  }

  // 공간대관 계약서 — 가장 최근의 진행 중·완료 계약서
  try {
    const c = await env.DB.prepare("SELECT id, status, link_ver, signed_at FROM rental_contracts WHERE booking_code = ? AND status IN ('ready','signed') ORDER BY CASE status WHEN 'signed' THEN 0 ELSE 1 END, created_at DESC LIMIT 1").bind(b.booking_code).first();
    if (c) out.contract = { id: c.id, status: c.status, label: CONTRACT_STATUS[c.status] || c.status, signed_at: c.signed_at || null, url: await contractLink(env, c) };
  } catch {}

  // 모임 초대장
  try {
    const inv = await env.DB.prepare("SELECT id, code, status FROM invites WHERE booking_code = ? AND status = 'active'").bind(b.booking_code).first();
    if (inv) {
      const { results } = await env.DB.prepare('SELECT status, party, cars FROM invite_rsvps WHERE invite_id = ?').bind(inv.id).all();
      const l = await inviteLinks(env, inv), s = rsvpSummary(results || []);
      out.invite = { exists: true, public_url: l.public_url, manage_url: l.manage_url, screen_url: l.screen_url, rsvp: { yes: s.yes, maybe: s.maybe, no: s.no, people: s.people } };
    } else out.invite = { exists: false, create_url: '/invite/new/?b=' + encodeURIComponent(b.booking_code) };
  } catch { out.invite = { exists: false, create_url: '/invite/new/?b=' + encodeURIComponent(b.booking_code) }; }

  // 식음료 진행 (출장뷔페 주문 기록이 있으면 상태만)
  try {
    const { results } = await env.DB.prepare("SELECT status, people, meal_time FROM catering_orders WHERE booking_code = ? OR (inquiry_ref IS NOT NULL AND inquiry_ref = ?) ORDER BY id DESC LIMIT 3").bind(b.booking_code, b.inquiry_ref || '').all();
    const label = { pending: '상담 중', confirmed: '확정', cancelled: '취소' };
    if (results && results.length) out.food = results.map(r => ({ status: r.status, label: label[r.status] || r.status, people: r.people ?? null, meal_time: r.meal_time || '' }));
  } catch {}

  // 후기
  try {
    const r = await env.DB.prepare('SELECT status FROM reviews WHERE booking_code = ?').bind(b.booking_code).first();
    out.review = { written: !!r, status: r ? r.status : null, can_write: !r && b.status === 'completed' };
  } catch { out.review = { written: false, can_write: b.status === 'completed' }; }

  return out;
}

function daysBetween(a, b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b || '')) return null;
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

// 지금 할 일 — 화면 맨 위에 보여 줄 순서
export function nextSteps(v) {
  const out = [], b = v.booking;
  if (b.status === 'cancelled') return [{ key: 'cancelled', tone: 'muted', label: '취소된 예약입니다', desc: '취소·환불 내용은 예약확정서 링크나 운영팀 카카오톡으로 확인해 주세요.' }];
  if (b.status === 'payment_review') return [{ key: 'checking', tone: 'warn', label: '결제를 확인하고 있습니다', desc: '일정을 확인한 뒤 예약을 확정하고 안내드립니다.' }];
  if (v.contract && v.contract.status === 'ready') out.push({ key: 'contract', tone: 'todo', label: '공간대관 계약서 확인하기', desc: '내용을 확인하고 대관자 정보를 넣은 뒤 ‘확인하고 계약 완료’를 눌러 주세요.', href: v.contract.url });
  if (v.payment && v.payment.visible && v.payment.balance > 0 && b.status !== 'completed') out.push({ key: 'balance', tone: 'todo', label: '남은 이용료 ' + won(v.payment.balance) + ' 입금', desc: v.payment.due_date ? kdate(v.payment.due_date) + '까지 입금해 주세요.' : '입금 기한은 예약확정서를 확인해 주세요.' });
  if (v.deposit && v.deposit.amount > 0 && !v.deposit.paid && !v.deposit.returned && v.deposit.method !== 'card' && !b.ended) out.push({ key: 'deposit', tone: 'todo', label: '보증금 ' + won(v.deposit.amount) + ' 입금', desc: v.deposit.due_date ? kdate(v.deposit.due_date) + '까지 입금해 주세요.' : '이용일 전까지 입금해 주세요.' });
  if (!v.confirmation.issued) out.push({ key: 'confirm', tone: 'wait', label: '예약확정서 준비 중', desc: '발급되면 이 화면에서 바로 열 수 있습니다. 급하시면 카카오톡으로 요청해 주세요.' });
  if (!b.ended && v.invite && !v.invite.exists) out.push({ key: 'invite', tone: 'idea', label: '모임 초대장 만들기', desc: '날짜·장소·길찾기·주차 안내가 붙은 초대장을 무료로 만들어 참석자에게 보낼 수 있습니다.', href: v.invite.create_url });
  if (b.ended && v.deposit && v.deposit.paid && !v.deposit.returned && !v.deposit.account_registered && v.deposit.method !== 'card') out.push({ key: 'account', tone: 'todo', label: '보증금 환급 계좌 등록', desc: '카카오톡으로 받은 ‘환급 계좌 등록’ 링크에서 등록해 주세요. 링크가 없으면 카카오톡으로 말씀해 주세요.' });
  if (v.review && v.review.can_write) out.push({ key: 'review', tone: 'idea', label: '이용 후기 남기기', desc: '다음 주최자에게 실제 인원과 배치, 진행 경험을 알려 주세요.' });
  if (!out.length) out.push({ key: 'ok', tone: 'ok', label: b.ended ? '이용을 마쳤습니다' : '준비할 일이 모두 끝났습니다', desc: b.ended ? '다음 모임도 메가스팟에서 열어 보세요.' : '행사 날 뵙겠습니다. 궁금한 점은 카카오톡으로 편하게 물어봐 주세요.' });
  return out;
}
const won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
const spaceName = id => (SPACES[id] && SPACES[id].name) || (id === 'food-only' ? '출장 식음료' : id || '메가스팟');
const kdate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) return d || ''; const w = '일월화수목금토'[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]; return `${+m[2]}월 ${+m[3]}일(${w})`; };

export async function respondView(env, code) {
  const v = await bookingView(env, code);
  if (!v) return err('예약 정보를 찾을 수 없습니다. 예약번호와 휴대폰 뒷자리를 확인해 주세요.', 404, 'NOT_FOUND');
  return json({ ok: true, ...v, next: nextSteps(v) }, 200, NO_STORE);
}

// 회원이 연 문의·이용권 주문에 연결된 예약 (소유권은 로그인한 회원 번호로만 판단)
export async function memberBookings(env, memberId) {
  const { results } = await env.DB.prepare(`SELECT b.booking_code, b.space_id, b.date, b.start_h, b.end_h, b.headcount, b.status FROM bookings b
    WHERE b.inquiry_ref IN (SELECT ref FROM inquiries WHERE json_extract(data, '$.member_id') = ? AND status <> '삭제됨')
       OR b.booking_code IN (SELECT booking_code FROM orders WHERE member_id = ? AND booking_code IS NOT NULL)
    ORDER BY b.date DESC, b.start_h DESC LIMIT 60`).bind(memberId, memberId).all();
  const out = [];
  for (const b of results || []) {
    const s = realStart(b.date, b.start_h);
    out.push({ code: b.booking_code, space: spaceName(b.space_id), date: b.date, start_date: s.date, start_h: b.start_h, end_h: b.end_h, headcount: b.headcount, status: b.status, status_label: STATUS[b.status] || b.status, k: await confirmToken(env, b.booking_code) });
  }
  return out;
}

export async function keyOk(env, c, k) { return validCode(c) && !!k && tokenEq(String(k), await confirmToken(env, c)); }
export { NO_STORE, STATUS, getMember, str };
