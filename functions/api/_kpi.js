// 관리자 'KPI 지표' — GET /api/admin/kpi?from=YYYY-MM-DD&to=YYYY-MM-DD&space=
// 본사 관리자가 매출·예약률·이용 인원·취소율·대기 전환·부가서비스 이용률·홈페이지 방문·입점 플랫폼 지표를 한 화면에서 봅니다.
// 읽기만 하고 아무것도 바꾸지 않습니다. 지표마다 계산 기준은 화면(assets/js/pages/admin-kpi.js)의 ⓘ 설명과 같습니다.
//  · 매출: 매출 현황(_revenue.js)과 같은 수납·환불 기록을 씁니다. 이용일 기준은 day, 결제일 기준은 기록일(한국 날짜)로 묶습니다.
//    두 파일의 movements 정의가 달라지면 tests/admin-kpi.test.mjs 가 알려 줍니다.
//  · 예약률: 공간마다 하루 24시간 × 조회 일수를 분모로, 확정·이용 완료 예약이 차지한 시간을 분자로 씁니다(다음 날로 넘어가는 시간은 다음 날에 셉니다).
import {PRODUCTS} from './_catalog.js';
import {SPACES, SPACE_OPENING, err, isDate, json, kstToday} from './_lib.js';
import {refundAmountSql} from './_payapp_refund_history.js';
import {legacyPaymentSourceSql} from './_settlement.js';
import {bookingHourSql} from './_booking_availability.js';
import {SERVICE_DATA_SQL, reservationServices} from './_reservation_services.js';
import {ORDER_OF_BOOKING, orderBrief} from './_catering_orders.js';
import {PENDING_STATUSES_SQL} from './_reservation_waitlist.js';
import {SRC_RULES} from './inquiry.js';

const KEYS = Object.keys(SPACES);
const verificationIds = PRODUCTS.items.filter(p => p.kind === 'verification').map(p => p.id);
// 시간이 따로 없는 예약은 예약 구간의 기본 시간으로 계산합니다 (_guide_messages.js 와 같은 값).
const SLOT_HOURS = { 'pkg-day': [10,17], 'pkg-allday': [10,24], 'pkg-allnight': [18,31], morning:[7,12], day:[12,17], evening:[17,24], am:[9,13], pm:[13,18], ev:[18,23], ampm:[9,18], pmev:[14,23] };
const PENDING = ['문의 접수', '조건 확인', '견적 발송', '결제 대기'];
const MC_RE = /사회자|사회 진행|\bMC\b|엠씨|강사|강연|연사|진행자|아나운서/i;
const DESIGN_RE = /현수막|배너|디자인|포스터|리플렛|리플릿|브로슈어|인쇄|제작물|포토월|네임택|명찰/;
const MANAGER_RE = /현장 ?매니저|진행 ?스태프|행사 ?스태프/;
export const ADDONS = [
  ['buffet', '출장뷔페'], ['reception', '케이터링 (테이블·박스)'], ['cocktail', '출장 칵테일'],
  ['mc', 'MC·강사 섭외'], ['design', '현수막·디자인'], ['manager', '현장 매니저']];
export const SRC_LABEL = (() => {
  const m = { direct: '직접 방문', site: '다른 사이트', family: '패밀리 사이트' };
  for (const [, id, label] of SRC_RULES) if (!m[id]) m[id] = label;
  return m;
})();

// ---------- 날짜 계산 (YYYY-MM-DD 문자열, 한국 날짜) ----------
const DAY = 864e5;
const ms = d => Date.parse(d + 'T00:00:00Z');
const ymd = t => new Date(t).toISOString().slice(0, 10);
export const addDays = (d, n) => ymd(ms(d) + n * DAY);
const between = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const monthEnd = m => { const [y, mo] = m.split('-').map(Number); return ymd(Date.UTC(y, mo, 0)); };
const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
function days(from, to) { const out = []; for (let t = ms(from); t <= ms(to); t += DAY) out.push(ymd(t)); return out; }
// 조회 기간 바로 앞의 같은 길이 기간. 달 단위로 고른 기간이면 바로 앞 달(들)과 비교합니다.
export function previousPeriod(from, to) {
  const wholeMonths = from.endsWith('-01') && to === monthEnd(to.slice(0, 7));
  if (wholeMonths) {
    const n = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
    const start = addMonths(from.slice(0, 7), -n);
    return { from: start + '-01', to: addDays(from, -1) };
  }
  const len = between(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}
const kst = col => `date(${col},'+9 hours')`;
const safe = s => { if (s == null || s === '') return null; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch { return null; } };
const rate = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : null;
const ph = list => list.map(() => '?').join(',');

// ---------- 매출 (매출 현황과 같은 수납·환불 기록) ----------
function revenueSql(operationalBookingSql) {
  return `WITH
    online AS (
      SELECT o.oid,o.title,o.price,${refundAmountSql('o')} AS refund_total,
        COALESCE(o.paid_at,o.created_at) AS paid_at,o.paid_at IS NULL AS estimated_receipt,
        COALESCE((
          SELECT l.created_at FROM event_log l WHERE l.ref=o.oid AND
            (l.kind='order.refunded' OR (l.kind='order.updated' AND
              json_extract(CASE WHEN json_valid(l.detail) THEN l.detail END,'$.status')='refunded'))
          ORDER BY l.id DESC LIMIT 1
        ),o.updated_at,o.paid_at,o.created_at) AS legacy_refund_at,
        COALESCE(b.date,o.event_date,i.event_date) AS event_date,
        CASE WHEN o.product_id LIKE 'parking-%' THEN NULL
          ELSE COALESCE(b.space_id,i.space_id,CASE WHEN o.product_id LIKE 'pass-%' THEN '${KEYS[0]}' END)
        END AS space_id, b.booking_code, o.inquiry_ref
      FROM orders o
      LEFT JOIN bookings b ON b.booking_code=o.booking_code
      LEFT JOIN inquiries i ON i.ref=COALESCE(b.inquiry_ref,o.inquiry_ref)
      WHERE o.test=0 AND o.status IN ('paid','refunded') AND o.price>0
        AND o.product_id NOT IN (${ph(verificationIds)})
        AND ${operationalBookingSql} AND (b.booking_code IS NOT NULL OR i.status IS NOT ?)
    ),
    refund_rows AS (
      SELECT r.mul_no,r.oid,r.amount,r.created_at,
        SUM(r.amount) OVER (PARTITION BY r.oid ORDER BY r.created_at,r.mul_no) - r.amount AS previous
      FROM payapp_refunds r JOIN online o ON o.oid=r.oid
    ),
    manual AS (
      SELECT booking_code,kind,amount,created_at,'entry:'||id AS id,request_id='legacy-confirmation' AS estimated
      FROM booking_payment_current WHERE state='active'
      UNION ALL
      SELECT booking_code,'receipt',amount,created_at,'legacy:'||booking_code,1 FROM (${legacyPaymentSourceSql()})
    ),
    movements AS (
      SELECT m.id,b.space_id,b.date AS event_date,m.created_at AS occurred_at,'manual' AS source,m.kind,m.amount
      FROM manual m JOIN bookings b ON b.booking_code=m.booking_code WHERE ${operationalBookingSql}
      UNION ALL
      SELECT 'paid:'||oid,space_id,event_date,paid_at,'online','receipt',price FROM online
      UNION ALL
      SELECT 'refund:'||r.mul_no,o.space_id,o.event_date,r.created_at,'online','refund',MIN(r.amount,o.refund_total-r.previous)
      FROM refund_rows r JOIN online o ON o.oid=r.oid WHERE r.previous<o.refund_total
      UNION ALL
      SELECT 'legacy-refund:'||oid,space_id,event_date,legacy_refund_at,'online','refund',
        refund_total-COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0)
      FROM online o
    ),
    dated AS (
      SELECT *,event_date AS day,date(occurred_at,'+9 hours') AS recorded_day,
        CASE WHEN space_id IN (${ph(KEYS)}) THEN space_id ELSE 'unassigned' END AS branch
      FROM movements WHERE amount>0
    )
    SELECT 'event' AS basis,day AS d,branch,kind,source,SUM(amount) AS amount,COUNT(*) AS n
      FROM dated WHERE day BETWEEN ? AND ? GROUP BY day,branch,kind,source
    UNION ALL
    SELECT 'paid',recorded_day,branch,kind,source,SUM(amount),COUNT(*)
      FROM dated WHERE recorded_day BETWEEN ? AND ? GROUP BY recorded_day,branch,kind,source`;
}
const money = () => ({ received: 0, refunded: 0, net: 0, count: 0 });
function addMoney(t, r) { if (r.kind === 'refund') t.refunded += r.amount; else t.received += r.amount; t.net = t.received - t.refunded; t.count += r.n; }

// ---------- 예약 시간 · 예약률 ----------
function hoursOf(r) {
  let s = r.start_h == null ? null : Number(r.start_h), e = r.end_h == null ? null : Number(r.end_h);
  if (!(Number.isFinite(s) && Number.isFinite(e) && e > s)) { const h = SLOT_HOURS[r.slot] || SLOT_HOURS[r.inq_slot]; if (!h) return null; [s, e] = h; }
  s = Math.max(0, Math.floor(s)); e = Math.min(48, Math.ceil(e));
  return e > s ? [s, e] : null;
}
class Occupancy {
  constructor(lo, hi, keys) { this.lo = lo; this.hi = hi; this.n = between(lo, hi) + 1; this.keys = keys; this.map = Object.fromEntries(keys.map(k => [k, new Uint8Array(this.n * 24)])); }
  add(space, date, s, e) {
    const m = this.map[space]; if (!m) return;
    const base = between(this.lo, date) * 24;
    for (let h = s; h < e; h++) { const i = base + h; if (i >= 0 && i < m.length) m[i] = 1; }
  }
  open(space, date) { const o = SPACE_OPENING[space]; return !o || date >= o; }
  // 공간별 예약된 시간과 열려 있던 시간
  sum(from, to, keys = this.keys) {
    let booked = 0, capacity = 0;
    const a = Math.max(0, between(this.lo, from)), b = Math.min(this.n - 1, between(this.lo, to));
    for (const k of keys) for (let d = a; d <= b; d++) {
      const date = addDays(this.lo, d); if (!this.open(k, date)) continue;
      capacity += 24; const m = this.map[k]; for (let h = 0; h < 24; h++) booked += m[d * 24 + h];
    }
    return { booked, capacity, rate: rate(booked, capacity) };
  }
  // 날짜 × 시간 (값 = 그 시간에 예약된 공간 수)
  grid(from, to, keys) {
    return days(from, to).map(date => {
      const d = between(this.lo, date), open = keys.filter(k => this.open(k, date)).length;
      return { d: date, open, h: Array.from({ length: 24 }, (_, h) => keys.reduce((n, k) => n + (this.open(k, date) ? this.map[k][d * 24 + h] : 0), 0)) };
    });
  }
  // 요일(월~일) × 시간 예약률과 시간대별 예약률
  weekHour(from, to, keys) {
    const booked = Array.from({ length: 7 }, () => new Array(24).fill(0)), cap = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const date of days(from, to)) {
      const w = (new Date(ms(date)).getUTCDay() + 6) % 7, d = between(this.lo, date);
      for (const k of keys) { if (!this.open(k, date)) continue; for (let h = 0; h < 24; h++) { cap[w][h]++; booked[w][h] += this.map[k][d * 24 + h]; } }
    }
    const hours = Array.from({ length: 24 }, (_, h) => rate(booked.reduce((n, r) => n + r[h], 0), cap.reduce((n, r) => n + r[h], 0)));
    return { week: booked.map((row, w) => row.map((v, h) => rate(v, cap[w][h]))), hours };
  }
}

function addonState(r) {
  const out = {};
  const services = reservationServices(r.service_data, orderBrief(r.cat_ord));
  const food = { catering: 'buffet', reception: 'reception', cocktail: 'cocktail' };
  for (const s of services) { const k = food[s.kind]; if (k) out[k] = s.status === 'confirmed' ? 'used' : s.status === 'pending' ? 'asked' : ''; }
  const opts = safe(r.quote_opts) || {}, extras = (safe(r.quote_extras) || []).filter(x => x && typeof x === 'object'), options = safe(r.options) || {};
  const orders = String(r.addon_orders || '').split(',').filter(Boolean), label = x => String(x.label || '');
  const used = {
    design: !!(opts.banner || opts.xbanner || orders.includes('addon-banner') || orders.includes('addon-xbanner') || extras.some(x => DESIGN_RE.test(label(x)))),
    mc: extras.some(x => MC_RE.test(label(x))),
    manager: !!((opts.manager && opts.manager.on) || orders.includes('addon-manager') || extras.some(x => MANAGER_RE.test(label(x))))
  };
  const asked = { design: !!(options.banner || options.xbanner), mc: false, manager: !!options.manager };
  for (const k of ['design', 'mc', 'manager']) out[k] = used[k] ? 'used' : asked[k] ? 'asked' : '';
  return out;
}
const sizeBucket = n => n <= 30 ? '30명 이하' : n <= 50 ? '31~50명' : n <= 100 ? '51~100명' : n <= 150 ? '101~150명' : '151명 이상';
const SIZE_ORDER = ['30명 이하', '31~50명', '51~100명', '101~150명', '151명 이상'];

export async function kpiAdmin({ env, url, method, operationalBookingSql, archivedStatus }) {
  if (method !== 'GET') return err('지원하지 않는 요청입니다.', 405);
  const q = url.searchParams, today = kstToday(), month = today.slice(0, 7);
  const from = q.get('from') || month + '-01', to = q.get('to') || monthEnd(month), space = q.get('space') || '';
  if (!isDate(from) || !isDate(to) || from > to || between(from, to) > 365) return err('조회 기간을 확인해 주세요. 최대 366일까지 볼 수 있습니다.');
  if (space && !KEYS.includes(space)) return err('지점을 확인해 주세요.');
  const keys = space ? [space] : KEYS;
  const prev = previousPeriod(from, to);
  const trendMonths = Array.from({ length: 12 }, (_, i) => addMonths(to.slice(0, 7), i - 11));
  const trendFrom = trendMonths[0] + '-01', trendTo = monthEnd(trendMonths[11]);
  const lo = prev.from < trendFrom ? prev.from : trendFrom, hi = to > trendTo ? to : trendTo;
  const inRange = (d, a, b) => d && d >= a && d <= b;
  // 오늘이 들어 있는 기간이면 결제·방문·문의처럼 오늘까지만 쌓이는 지표는 지난 기간의 같은 시점까지와 비교합니다.
  const ongoing = from <= today && today <= to;
  const elapsed = ongoing ? { from: prev.from, to: addDays(prev.from, between(from, today)) < prev.to ? addDays(prev.from, between(from, today)) : prev.to } : prev;
  const out = { ok: true, from, to, space, today, prev, elapsed, ongoing, months: trendMonths, spaces: Object.fromEntries(keys.map(k => [k, SPACES[k]])), opening: SPACE_OPENING };
  const warn = [];
  const all = async (sql, args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];

  const [revRows, bookingRows, inquiryRows, waitingNow] = await Promise.all([
    all(revenueSql(operationalBookingSql), [...verificationIds, archivedStatus, ...KEYS, lo, hi, lo, hi]),
    all(`SELECT b.booking_code AS code,b.space_id,b.date,b.status,b.slot,COALESCE(b.headcount,i.headcount) AS people,
        ${bookingHourSql('b', 'i', 'start_h')} AS start_h,${bookingHourSql('b', 'i', 'end_h')} AS end_h,
        CASE WHEN json_valid(i.data) THEN json_extract(i.data,'$.slot') END AS inq_slot,
        CASE WHEN json_valid(i.data) THEN json_extract(i.data,'$.purpose') END AS purpose,
        CASE WHEN json_valid(i.data) THEN json_extract(i.data,'$.options') END AS options,
        CASE WHEN json_valid(i.data) THEN ${SERVICE_DATA_SQL} END AS service_data,
        ${ORDER_OF_BOOKING} AS cat_ord,
        (SELECT json_extract(q.data,'$.input.opts') FROM quotes q WHERE b.inquiry_ref IS NOT NULL AND q.inquiry_ref=b.inquiry_ref AND json_valid(q.data) ORDER BY q.id DESC LIMIT 1) AS quote_opts,
        (SELECT json_extract(q.data,'$.extras') FROM quotes q WHERE b.inquiry_ref IS NOT NULL AND q.inquiry_ref=b.inquiry_ref AND json_valid(q.data) ORDER BY q.id DESC LIMIT 1) AS quote_extras,
        (SELECT group_concat(o.product_id) FROM orders o WHERE o.booking_code=b.booking_code AND o.status='paid' AND o.test=0 AND o.product_id LIKE 'addon-%') AS addon_orders
      FROM bookings b LEFT JOIN inquiries i ON i.ref=b.inquiry_ref
      WHERE b.date BETWEEN ? AND ? AND b.space_id IN (${ph(keys)}) AND ${operationalBookingSql}`, [addDays(lo, -1), hi, ...keys]),
    all(`SELECT i.ref,i.space_id,i.status,i.event_date,${kst('i.created_at')} AS created_day,
        CASE WHEN json_valid(i.data) THEN json_extract(i.data,'$.inquiry_type') END AS type,
        CASE WHEN json_valid(i.data) THEN json_extract(i.data,'$.reserve') END AS reserve,
        CASE WHEN json_valid(i.data) THEN COALESCE(json_extract(i.data,'$.channel'),'web') ELSE 'web' END AS channel,
        CASE WHEN json_valid(i.data) THEN json_extract(i.data,'$.came_from.src') END AS src,
        EXISTS(SELECT 1 FROM quotes q WHERE q.inquiry_ref=i.ref) AS quoted,
        (SELECT COUNT(*) FROM bookings b WHERE b.inquiry_ref=i.ref) AS bk_all,
        (SELECT COUNT(*) FROM bookings b WHERE b.inquiry_ref=i.ref AND b.status<>'cancelled') AS bk_live,
        (SELECT COUNT(*) FROM bookings b WHERE b.inquiry_ref=i.ref AND b.status='completed') AS bk_done
      FROM inquiries i
      WHERE i.status<>? AND ((i.event_date BETWEEN ? AND ?) OR ${kst('i.created_at')} BETWEEN ? AND ?)`, [archivedStatus, lo, hi, lo, hi]),
    all(`SELECT i.event_date AS d,i.space_id,COUNT(*) AS n FROM inquiries i
      WHERE i.status IN ${PENDING_STATUSES_SQL} AND i.event_date>=? AND i.space_id IN (${ph(keys)})
        AND COALESCE(CASE WHEN json_valid(i.data) THEN json_extract(i.data,'$.inquiry_type') END,'')<>'partner'
        AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.inquiry_ref=i.ref AND b.status<>'cancelled')
      GROUP BY i.event_date,i.space_id`, [today, ...keys])
  ]);

  // ---------- 매출 ----------
  {
    const pick = (basis, a, b, branch) => { const t = money(); for (const r of revRows) if (r.basis === basis && inRange(r.d, a, b) && (branch ? r.branch === branch : (!space || r.branch === space))) addMoney(t, r); return t; };
    const daily = days(from, to).map(d => ({ d, event: 0, paid: 0 }));
    const idx = Object.fromEntries(daily.map((x, i) => [x.d, i])), mIdx = Object.fromEntries(trendMonths.map((m, i) => [m, i]));
    const monthly = trendMonths.map(m => ({ m, event: 0, paid: 0 }));
    const source = { online: 0, manual: 0 };
    for (const r of revRows) {
      if (space && r.branch !== space) continue;
      const v = r.kind === 'refund' ? -r.amount : r.amount;
      if (idx[r.d] != null) daily[idx[r.d]][r.basis] += v;
      const mi = mIdx[String(r.d || '').slice(0, 7)]; if (mi != null) monthly[mi][r.basis] += v;
      if (r.basis === 'event' && inRange(r.d, from, to)) source[r.source] = (source[r.source] || 0) + v;
    }
    const branches = Object.fromEntries([...keys, ...(space ? [] : ['unassigned'])].map(k => [k, { event: pick('event', from, to, k), paid: pick('paid', from, to, k) }]));
    out.revenue = { event: pick('event', from, to), paid: pick('paid', from, to), prev_event: pick('event', prev.from, prev.to), prev_paid: pick('paid', elapsed.from, elapsed.to), branches, daily, monthly, source };
  }

  // ---------- 예약률 · 이용 인원 · 취소율 · 부가서비스 ----------
  {
    const occ = new Occupancy(addDays(lo, -1), hi, keys);
    let noHours = 0;
    const active = r => r.status === 'confirmed' || r.status === 'completed';
    for (const r of bookingRows) {
      if (!active(r)) continue;
      const h = hoursOf(r);
      if (!h) { if (inRange(r.date, from, to)) noHours++; continue; }
      occ.add(r.space_id, r.date, h[0], h[1]);
    }
    const perSpace = Object.fromEntries(keys.map(k => [k, occ.sum(from, to, [k])]));
    const long = between(from, to) + 1 > 62;
    out.occupancy = {
      cur: occ.sum(from, to), prev: occ.sum(prev.from, prev.to), spaces: perSpace,
      monthly: trendMonths.map(m => ({ m, ...occ.sum(m + '-01', monthEnd(m)) })),
      grid: long ? null : occ.grid(from, to, keys),
      ...occ.weekHour(from, to, keys),
      no_hours: noHours
    };

    const period = (a, b) => bookingRows.filter(r => inRange(r.date, a, b));
    const cur = period(from, to), before = period(prev.from, prev.to);
    const peopleOf = list => { const a = list.filter(active); const known = a.filter(r => Number(r.people) > 0); const total = known.reduce((s, r) => s + Number(r.people), 0);
      return { bookings: a.length, people: total, avg: known.length ? Math.round(total / known.length) : null, missing: a.length - known.length }; };
    const sizes = Object.fromEntries(SIZE_ORDER.map(k => [k, 0])), purposes = {};
    for (const r of cur.filter(active)) { if (Number(r.people) > 0) sizes[sizeBucket(Number(r.people))]++; const p = r.purpose || 'none'; purposes[p] = (purposes[p] || 0) + 1; }
    const byMonth = trendMonths.map(m => ({ m, ...peopleOf(period(m + '-01', monthEnd(m))) }));
    const weekday = new Array(7).fill(0); for (const r of cur.filter(active)) weekday[(new Date(ms(r.date)).getUTCDay() + 6) % 7]++;
    out.people = { cur: peopleOf(cur), prev: peopleOf(before), monthly: byMonth, sizes, purposes, weekday,
      daily: days(from, to).map(d => { const l = cur.filter(r => r.date === d && active(r)); return { d, bookings: l.length, people: l.reduce((s, r) => s + (Number(r.people) || 0), 0) }; }) };

    const cancelOf = list => { const all = list.filter(r => ['confirmed', 'completed', 'cancelled', 'payment_review'].includes(r.status)); const c = all.filter(r => r.status === 'cancelled').length;
      return { total: all.length, cancelled: c, review: all.filter(r => r.status === 'payment_review').length, rate: rate(c, all.length) }; };
    out.cancel = { cur: cancelOf(cur), prev: cancelOf(before), monthly: trendMonths.map(m => ({ m, ...cancelOf(period(m + '-01', monthEnd(m))) })) };

    const addonOf = list => {
      const a = list.filter(active), res = Object.fromEntries(ADDONS.map(([k]) => [k, { used: 0, asked: 0 }]));
      for (const r of a) { const s = addonState(r); for (const [k] of ADDONS) { if (s[k] === 'used') res[k].used++; else if (s[k] === 'asked') res[k].asked++; } }
      for (const [k] of ADDONS) res[k].rate = rate(res[k].used, a.length);
      return { base: a.length, items: res };
    };
    out.addons = { labels: Object.fromEntries(ADDONS), cur: addonOf(cur), prev: addonOf(before),
      monthly: trendMonths.map(m => { const x = addonOf(period(m + '-01', monthEnd(m))); return { m, base: x.base, ...Object.fromEntries(ADDONS.map(([k]) => [k, x.items[k].rate])) }; }) };
  }

  // ---------- 대기 신청 → 확정 · 문의 단계 ----------
  {
    const ours = r => keys.includes(r.space_id) && r.type !== 'partner';
    const outcome = r => {
      if (r.bk_live > 0 || r.status === '예약 확정' || r.status === '이용 완료') return 'confirmed';
      if (r.bk_all > 0 || r.status === '취소·환불') return 'cancelled_after';
      if (r.status === '대기 취소') return 'wait_cancelled';
      if (PENDING.includes(r.status)) return 'pending';
      return 'other';
    };
    const waitOf = (a, b) => {
      const list = inquiryRows.filter(r => ours(r) && inRange(r.event_date, a, b));
      const c = { total: list.length, confirmed: 0, cancelled_after: 0, wait_cancelled: 0, pending: 0, other: 0 };
      for (const r of list) c[outcome(r)]++;
      // 같은 날짜·공간에 두 팀 이상 신청한 날
      const per = {}; for (const r of list) { const k = r.event_date + '|' + r.space_id; per[k] = (per[k] || 0) + 1; }
      c.contested_days = Object.values(per).filter(n => n > 1).length;
      c.rate = rate(c.confirmed, c.total); c.decided_rate = rate(c.confirmed, c.total - c.pending);
      return c;
    };
    const funnelOf = (a, b) => {
      const list = inquiryRows.filter(r => inRange(r.created_day, a, b) && (!space || r.space_id === space));
      const f = { inquiries: list.length, web: 0, reserve: 0, quoted: 0, confirmed: 0, completed: 0 };
      for (const r of list) {
        if (r.channel === 'web') f.web++;
        if (r.reserve) f.reserve++;
        const booked = r.bk_all > 0 || ['예약 확정', '이용 완료', '취소·환불'].includes(r.status);
        if (r.quoted || booked || ['견적 발송', '결제 대기'].includes(r.status)) f.quoted++;
        if (booked) f.confirmed++;
        if (r.bk_done > 0 || r.status === '이용 완료') f.completed++;
      }
      f.rate = rate(f.confirmed, f.inquiries);
      return f;
    };
    const sources = {};
    for (const r of inquiryRows) if (inRange(r.created_day, from, to) && (!space || r.space_id === space) && r.channel === 'web') { const k = r.src || 'unknown'; sources[k] = (sources[k] || 0) + 1; }
    const waitingDates = {}; for (const r of waitingNow) waitingDates[r.d + '|' + r.space_id] = (waitingDates[r.d + '|' + r.space_id] || 0) + r.n;
    out.wait = { cur: waitOf(from, to), prev: waitOf(prev.from, prev.to), monthly: trendMonths.map(m => ({ m, ...waitOf(m + '-01', monthEnd(m)) })),
      now: { waiting: waitingNow.reduce((s, r) => s + r.n, 0), dates: Object.keys(waitingDates).length, contested: Object.values(waitingDates).filter(n => n > 1).length } };
    out.funnel = { cur: funnelOf(from, to), prev: funnelOf(elapsed.from, elapsed.to), sources, source_labels: { ...SRC_LABEL, unknown: '기록 없음' } };
  }

  // ---------- 홈페이지 방문 ----------
  try {
    const range = [from, to], pr = [elapsed.from, elapsed.to];
    const totals = `SELECT COUNT(*) AS pv,COUNT(DISTINCT vid) AS uv,COUNT(DISTINCT sid) AS sessions,
      COUNT(DISTINCT CASE WHEN new_visitor=1 THEN vid END) AS new_uv,ROUND(AVG(CASE WHEN dwell>0 THEN dwell END)) AS page_dwell
      FROM web_hits WHERE day BETWEEN ? AND ?`;
    const sessions = `SELECT COUNT(*) AS n,SUM(CASE WHEN pages=1 THEN 1 ELSE 0 END) AS bounce,ROUND(AVG(dsum)) AS avg_dur,ROUND(AVG(pages),1) AS avg_pages
      FROM (SELECT sid,COUNT(*) AS pages,SUM(dwell) AS dsum FROM web_hits WHERE day BETWEEN ? AND ? GROUP BY sid)`;
    const [t, tp, s, sp, daily, pages, src, hosts, devices, hours, kinds, kindsPrev, links, inner, monthly, since] = await Promise.all([
      all(totals, range), all(totals, pr), all(sessions, range), all(sessions, pr),
      all('SELECT day AS d,COUNT(*) AS pv,COUNT(DISTINCT vid) AS uv,COUNT(DISTINCT sid) AS sessions FROM web_hits WHERE day BETWEEN ? AND ? GROUP BY day', range),
      all(`SELECT path,MAX(title) AS title,COUNT(*) AS pv,COUNT(DISTINCT vid) AS uv,ROUND(AVG(CASE WHEN dwell>0 THEN dwell END)) AS dwell,
          SUM(CASE WHEN src IS NOT NULL THEN 1 ELSE 0 END) AS entries
        FROM web_hits WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY pv DESC,path LIMIT 20`, range),
      all('SELECT src,COUNT(*) AS n FROM web_hits WHERE src IS NOT NULL AND day BETWEEN ? AND ? GROUP BY src ORDER BY n DESC', range),
      all('SELECT ref_host AS host,COUNT(*) AS n FROM web_hits WHERE ref_host IS NOT NULL AND day BETWEEN ? AND ? GROUP BY ref_host ORDER BY n DESC LIMIT 10', range),
      all('SELECT device,COUNT(DISTINCT sid) AS n FROM web_hits WHERE day BETWEEN ? AND ? GROUP BY device', range),
      all('SELECT hour,COUNT(*) AS n FROM web_hits WHERE day BETWEEN ? AND ? GROUP BY hour', range),
      all('SELECT kind,SUM(n) AS n FROM web_clicks WHERE day BETWEEN ? AND ? GROUP BY kind', range),
      all('SELECT kind,SUM(n) AS n FROM web_clicks WHERE day BETWEEN ? AND ? GROUP BY kind', pr),
      all(`SELECT kind,target,MAX(label) AS label,SUM(n) AS n FROM web_clicks WHERE day BETWEEN ? AND ? AND kind<>'internal'
        GROUP BY kind,target ORDER BY n DESC,target LIMIT 15`, range),
      all(`SELECT target,MAX(label) AS label,SUM(n) AS n FROM web_clicks WHERE day BETWEEN ? AND ? AND kind='internal'
        GROUP BY target ORDER BY n DESC,target LIMIT 10`, range),
      all('SELECT substr(day,1,7) AS m,COUNT(*) AS pv,COUNT(DISTINCT vid) AS uv,COUNT(DISTINCT sid) AS sessions FROM web_hits WHERE day BETWEEN ? AND ? GROUP BY m', [trendFrom, trendTo]),
      all('SELECT MIN(day) AS d FROM web_hits', [])
    ]);
    const sum = (rows) => Object.fromEntries(rows.map(r => [r.kind, r.n]));
    const hourArr = new Array(24).fill(0); for (const r of hours) if (r.hour >= 0 && r.hour < 24) hourArr[r.hour] = r.n;
    const dIdx = Object.fromEntries(daily.map(r => [r.d, r]));
    const mIdx = Object.fromEntries(monthly.map(r => [r.m, r]));
    const f = out.funnel.cur;
    out.web = {
      since: since[0] && since[0].d || null,
      cur: { ...t[0], ...s[0], bounce_rate: rate(s[0].bounce || 0, s[0].n || 0) }, prev: { ...tp[0], ...sp[0], bounce_rate: rate(sp[0].bounce || 0, sp[0].n || 0) },
      daily: days(from, to).map(d => ({ d, pv: dIdx[d] ? dIdx[d].pv : 0, uv: dIdx[d] ? dIdx[d].uv : 0, sessions: dIdx[d] ? dIdx[d].sessions : 0 })),
      monthly: trendMonths.map(m => ({ m, pv: mIdx[m] ? mIdx[m].pv : 0, uv: mIdx[m] ? mIdx[m].uv : 0, sessions: mIdx[m] ? mIdx[m].sessions : 0 })),
      pages, sources: src.map(r => ({ src: r.src, label: SRC_LABEL[r.src] || r.src, n: r.n })), hosts, devices: Object.fromEntries(devices.map(r => [r.device || 'desktop', r.n])),
      hours: hourArr, clicks: sum(kinds), clicks_prev: sum(kindsPrev), links, inner,
      inquiry_rate: rate(f.web, (s[0] && s[0].n) || 0)
    };
  } catch (e) { warn.push('web'); out.web = null; console.error('kpi web', e && e.message); }

  // ---------- 입점 플랫폼 (지점 선택과 상관없이 플랫폼 전체) ----------
  try {
    const r = [from, to];
    const [live, submitted, approved, hb, ao, pl, paid, refunded, stats] = await Promise.all([
      all("SELECT COUNT(*) AS n FROM host_spaces WHERE status='live'", []),
      all(`SELECT COUNT(*) AS n FROM host_spaces WHERE submitted_at IS NOT NULL AND ${kst('submitted_at')} BETWEEN ? AND ?`, r),
      all(`SELECT COUNT(*) AS n FROM host_spaces WHERE approved_at IS NOT NULL AND ${kst('approved_at')} BETWEEN ? AND ?`, r),
      all(`SELECT source,status,COUNT(*) AS n FROM host_bookings WHERE ${kst('created_at')} BETWEEN ? AND ? GROUP BY source,status`, r),
      all(`SELECT service,status,COUNT(*) AS n FROM hq_addons WHERE ${kst('created_at')} BETWEEN ? AND ? GROUP BY service,status`, r),
      all(`SELECT status,data FROM planning_requests WHERE ${kst('created_at')} BETWEEN ? AND ?`, r),
      all(`SELECT COALESCE(SUM(amount),0) AS amount,COUNT(*) AS n FROM host_billing WHERE paid_at IS NOT NULL AND status IN ('paid','refunded') AND ${kst('paid_at')} BETWEEN ? AND ?`, r),
      all(`SELECT COALESCE(SUM(refund_amount),0) AS amount,COUNT(*) AS n FROM host_billing_pay WHERE refunded_at IS NOT NULL AND ${kst('refunded_at')} BETWEEN ? AND ?`, r),
      all('SELECT COALESCE(SUM(view),0) AS view,COALESCE(SUM(contact),0) AS contact,COALESCE(SUM(inquiry),0) AS inquiry FROM host_stats WHERE day BETWEEN ? AND ?', r)
    ]);
    const bookings = { total: 0, web: 0, host: 0, confirmed: 0 };
    for (const x of hb) { bookings.total += x.n; if (x.source === 'web') bookings.web += x.n; else bookings.host += x.n; if (['confirmed', 'done'].includes(x.status)) bookings.confirmed += x.n; }
    const addons = {};
    for (const x of ao) { const a = addons[x.service] || (addons[x.service] = { asked: 0, confirmed: 0 }); a.asked += x.n; if (['confirmed', 'done'].includes(x.status)) a.confirmed += x.n; }
    const planning = { total: pl.length, won: 0, needs: {} };
    for (const x of pl) { if (['won', 'done'].includes(x.status)) planning.won++; const d = safe(x.data) || {}; for (const n of Array.isArray(d.needs) ? d.needs : []) planning.needs[n] = (planning.needs[n] || 0) + 1; }
    out.platform = { live: live[0].n, submitted: submitted[0].n, approved: approved[0].n, bookings, addons, planning,
      billing: { paid: paid[0].amount, paid_count: paid[0].n, refunded: refunded[0].amount, net: paid[0].amount - refunded[0].amount }, stats: stats[0] };
  } catch (e) { warn.push('platform'); out.platform = null; console.error('kpi platform', e && e.message); }

  out.warn = warn;
  return json(out, 200, { 'cache-control': 'no-store' });
}
