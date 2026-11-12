// 입점 호스트 플랫폼 공통 규칙 (2026-11-12)
//  · 입점 기준·공간 유형·지역·시설·본사 부가서비스·이용료 플랜 (화면용 사본: assets/js/data/platform.js — tests/hostplat.test.mjs 가 같은지 확인)
//  · 공간 정보 정리(cleanSpace) · 공개 정보(publicSpace) · 예상 금액(estimate) · 호스트 로그인 · 통계 집계
//  결제는 고객과 호스트가 직접 주고받습니다. 메가스팟은 결제 수수료를 받지 않고, 등록 기간에 따른 월 정액만 받습니다.
import { str, num, isDate, now, kstToday, getCookie, sha256, hasDb } from './_lib.js';
import { httpsUrl, phoneOk, timeOk, bounded, safeJson } from './_platform.js';
import { hmacToken, tokenEq } from './_confirm.js';
import { HOLIDAYS } from './_catalog.js';

export const PLATFORM = {
  // 입점 기준: 둘 중 하나만 맞아도 됩니다
  tiers: [
    { id: 'mega', label: '초대형 공간', people: 100, pyeong: 100 },
    { id: 'large', label: '대형 공간', people: 50, pyeong: 50 }
  ],
  maxTypes: 5,
  typeGroups: [
    { id: 'meeting', label: '모임공간', types: [['partyroom', '파티룸'], ['seminar', '세미나/워크숍'], ['conference', '컨퍼런스'], ['banquet', '연회장']] },
    { id: 'event', label: '행사공간', types: [['wedding', '스몰웨딩'], ['popup', '팝업스토어'], ['concert', '공연장'], ['theater', '극장'], ['expo', '박람회장']] },
    { id: 'store', label: '매장공간', types: [['cafe', '카페'], ['restaurant', '음식점'], ['bar', '주류바'], ['shop', '일반매장']] },
    { id: 'shoot', label: '촬영공간', types: [['studio', '스튜디오'], ['gallery', '갤러리'], ['broadcast', '방송촬영']] },
    { id: 'etc', label: '기타공간', types: [['practice', '연습실'], ['sports_in', '체육시설(실내)'], ['sports_out', '체육시설(실외)'], ['camp_in', '캠핑장(실내)'], ['camp_out', '캠핑장(실외)'], ['hall', '다목적홀']] }
  ],
  regions: [['seoul', '서울'], ['incheon', '인천'], ['gyeonggi', '경기'], ['etc', '그 외 지역']],
  facilities: [['projector', '빔프로젝터·대형 화면'], ['sound', '음향·스피커'], ['mic', '마이크'], ['wifi', '와이파이'], ['stage', '무대·단상'], ['lighting', '조명'],
    ['tables', '테이블·의자 제공'], ['kitchen', '주방·싱크대'], ['fridge', '냉장고'], ['aircon', '냉난방'], ['elevator', '엘리베이터'], ['parking', '주차 가능'],
    ['restroom', '내부 화장실'], ['waiting', '대기실·준비실'], ['outdoor', '야외·테라스'], ['loading', '화물 반입 동선'], ['accessible', '휠체어 접근'], ['pet', '반려동물 동반']],
  purposes: [['seminar', '세미나·강연'], ['workshop', '워크숍·팀빌딩'], ['conference', '컨퍼런스·포럼'], ['networking', '네트워킹·리셉션'], ['party', '송년회·단체 파티'], ['wedding', '스몰웨딩·기념행사'],
    ['popup', '팝업·전시·마켓'], ['show', '공연·상영'], ['shoot', '촬영'], ['class', '클래스·교육'], ['sports', '체육·레크리에이션'], ['etc', '기타']],
  // 메가스팟 본사가 직접 진행하는 부가서비스 — 모든 입점 공간 예약에 붙일 수 있습니다
  addons: [
    { id: 'buffet', label: '출장뷔페', desc: '인원에 맞춘 뷔페 코스를 행사장에 차려 드립니다.', link: '/catering/' },
    { id: 'catering', label: '케이터링', desc: '다과·핑거푸드·도시락처럼 가볍게 준비하는 식음료.', link: '/reception/' },
    { id: 'cocktail', label: '출장 칵테일', desc: '바텐더가 현장에서 칵테일 바를 운영합니다.', link: '/cocktail/' },
    { id: 'mc', label: '사회자·강연자 섭외', desc: '행사 성격에 맞는 사회자·강연자를 찾아 연결합니다.', link: '' },
    { id: 'manager', label: '현장 매니저', desc: '행사 당일 진행·동선·장비를 현장에서 챙깁니다.', link: '' },
    { id: 'design', label: '디자인·제작물', desc: '현수막·X배너·리플렛 등 행사 제작물을 만듭니다.', link: '' }
  ],
  // 입점 이용료 (등록 기간에 따른 월 정액 · 결제 수수료 없음)
  //  · 공간 한 곳 기준(한 호스트가 여러 공간을 등록하면 공간마다 따로) · 표시 금액은 부가세 별도
  //  · 중도 해지: 유료 기간 시작 전에는 전액, 시작한 뒤에는 남은 기간 금액의 50% 환불 (약관 제7조의6)
  freeMonths: 2,
  fee: { per: 'space', vat: 'excluded', vatRate: 10, refundRate: 50 },
  plans: [
    { id: 'm12', months: 12, monthly: 100000, daily: 3300 },
    { id: 'm6', months: 6, monthly: 150000, daily: 5000 },
    { id: 'm3', months: 3, monthly: 200000, daily: 6600 },
    { id: 'm1', months: 1, monthly: 250000, daily: 8300 }
  ],
  priceModes: [['hourly', '시간 대관'], ['package', '패키지'], ['daily', '하루 대관'], ['quote', '견적 문의']],
  optionUnits: ['건', '시간', '인', '개', '일'],
  payMethods: [['bank', '계좌이체'], ['card_link', '카드·간편결제 링크'], ['onsite', '현장 결제']],
  refundPresets: [
    ['standard', '표준 (이용 15일 전 100% · 8~14일 전 80% · 4~7일 전 50% · 3일 전~당일 환불 불가)'],
    ['flexible', '유연 (이용 7일 전 100% · 3~6일 전 50% · 2일 전~당일 환불 불가)'],
    ['custom', '직접 입력']
  ]
};
const ids = pairs => pairs.map(p => p[0]);
export const TYPE_LABEL = Object.fromEntries(PLATFORM.typeGroups.flatMap(g => g.types));
export const REGION_LABEL = Object.fromEntries(PLATFORM.regions);
export const FACILITY_LABEL = Object.fromEntries(PLATFORM.facilities);
export const PURPOSE_LABEL = Object.fromEntries(PLATFORM.purposes);
export const ADDON_LABEL = Object.fromEntries(PLATFORM.addons.map(a => [a.id, a.label]));
export const PLAN = Object.fromEntries(PLATFORM.plans.map(p => [p.id, p]));

export const SPACE_STATUS = { draft: '작성 중', review: '심사 대기', fix: '보완 요청', live: '공개 중', paused: '일시 중지', hidden: '숨김', rejected: '반려' };
export const BOOKING_STATUS = { new: '새 문의', quoted: '견적 안내', pending: '예약 대기', confirmed: '예약 확정', done: '이용 완료', cancelled: '취소', declined: '진행 불가' };
export const BOOKING_OPEN = ['new', 'quoted', 'pending', 'confirmed'];
export const ADDON_STATUS = { new: '접수', talking: '안내 중', confirmed: '확정', done: '완료', cancelled: '취소' };
export const PLANNING_STATUS = { new: '접수', planning: '기획 중', proposed: '제안 발송', won: '진행 확정', done: '완료', closed: '종료' };
export const BILLING_STATUS = { requested: '결제 대기', paid: '결제 완료', refunded: '해지·환불', cancelled: '취소' };
export const SPACE_REF = /^SP-\d{4}-[A-Z0-9]{4}$/;
export const BOOKING_CODE = /^HB-\d{4}-[A-Z0-9]{4}$/;
export const PHOTO_ID = /^[A-Za-z0-9_-]{16,40}$/;
export const MAX_PHOTOS = 12;
export const HOST_SESSION_DAYS = 30;

export function tierOf(capacity, area) {
  const c = +capacity || 0, a = +area || 0;
  for (const t of PLATFORM.tiers) if (c >= t.people || a >= t.pyeong) return t.id;
  return '';
}
export function addMonths(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last)); return dt.toISOString().slice(0, 10);
}
export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const won = v => { const n = num(v); return n === null || n < 0 ? null : Math.min(n, 999999999); };
const pos = (v, hi = 100000) => { const n = num(v); return n && n > 0 ? Math.min(n, hi) : null; };   // 0·빈칸은 '없음'
const text = (v, max) => str(v, max).replace(/\r\n?/g, '\n');
const pick = (v, list, max) => (Array.isArray(v) ? v : (v ? [v] : [])).map(x => str(x, 30)).filter((x, i, l) => list.includes(x) && l.indexOf(x) === i).slice(0, max);
function social(v, hosts) {   // SNS·채널 주소: https 이고 그 서비스 주소일 때만 받습니다
  const u = httpsUrl(v, 300); if (!u) return '';
  if (!hosts) return u;
  try { const h = new URL(u).hostname.replace(/^www\./, ''); return hosts.some(x => h === x || h.endsWith('.' + x)) ? u : ''; } catch { return ''; }
}

// 요금 정보 정리. 금액은 원 단위 정수.
export function cleanPrice(p) {
  p = p && typeof p === 'object' ? p : {};
  const modes = pick(p.modes, ids(PLATFORM.priceModes), 4);
  const o = { modes, vat: p.vat === 'excluded' ? 'excluded' : 'included', note: text(p.note, 600) };
  if (modes.includes('hourly')) { const h = p.hourly || {}; o.hourly = { weekday: won(h.weekday), weekend: won(h.weekend), min_hours: bounded(h.min_hours, 1, 24) || 1 }; if (o.hourly.weekday === null && o.hourly.weekend === null) return { error: '시간 대관 요금(평일 또는 주말)을 적어 주세요.' }; }
  if (modes.includes('package')) {
    o.packages = (Array.isArray(p.packages) ? p.packages : []).map(x => ({ name: str(x && x.name, 30), time: str(x && x.time, 40), weekday: won(x && x.weekday), weekend: won(x && x.weekend) }))
      .filter(x => x.name && (x.weekday !== null || x.weekend !== null)).slice(0, 6);
    if (!o.packages.length) return { error: '패키지 이름과 금액을 한 개 이상 적어 주세요.' };
  }
  if (modes.includes('daily')) { const d = p.daily || {}; o.daily = { weekday: won(d.weekday), weekend: won(d.weekend) }; if (o.daily.weekday === null && o.daily.weekend === null) return { error: '하루 대관 요금(평일 또는 주말)을 적어 주세요.' }; }
  o.base_people = pos(p.base_people); o.extra_per_person = won(p.extra_per_person); o.deposit = won(p.deposit);
  return o;
}
export function priceFrom(p) {
  if (!p) return null; const v = [];
  if (p.hourly) v.push(p.hourly.weekday, p.hourly.weekend);
  for (const k of p.packages || []) v.push(k.weekday, k.weekend);
  if (p.daily) v.push(p.daily.weekday, p.daily.weekend);
  const n = v.filter(x => x !== null && x !== undefined && x > 0);
  return n.length ? Math.min(...n) : null;
}
export function priceFromLabel(p) {   // 카드에 쓰는 '시간당 ○원부터' 문구의 기준
  if (!p) return ''; const hv = p.hourly ? [p.hourly.weekday, p.hourly.weekend].filter(x => x > 0) : [];
  if (hv.length) return 'hourly';
  if ((p.packages || []).length) return 'package';
  if (p.daily) return 'daily';
  return '';
}

// 호스트가 적은 공간 정보 정리. strict=true 이면 심사에 필요한 항목이 모두 있어야 합니다.
export function cleanSpace(d, { strict = false } = {}) {
  d = d && typeof d === 'object' ? d : {};
  const name = str(d.name, 60), region = ids(PLATFORM.regions).includes(d.region) ? d.region : '', address = str(d.address, 160);
  const capacity = pos(d.capacity), area = pos(d.area);
  const types = pick(d.types, Object.keys(TYPE_LABEL), PLATFORM.maxTypes);
  if (!name) return { error: '공간 이름을 적어 주세요.' };
  if (!region) return { error: '지역을 골라 주세요.' };
  if (!capacity && !area) return { error: '최대 인원이나 면적(평) 중 하나는 적어 주세요.' };
  const tier = tierOf(capacity, area);
  if (!tier) return { error: '메가스팟은 50명 이상 이용할 수 있거나 50평 이상인 공간만 입점할 수 있습니다.', code: 'TOO_SMALL' };
  if (!types.length) return { error: '공간 유형을 한 가지 이상 골라 주세요. (최대 5가지)' };
  const price = cleanPrice(d.price); if (price.error) return price;
  const c = d.contact || {}, b = d.booking || {}, pay = d.payment || {}, biz = d.biz || {}, lay = d.layouts || {}, park = d.parking || {};
  const data = {
    intro: text(d.intro, 3000), summary: str(d.summary, 80), address_detail: str(d.address_detail, 80), station: str(d.station, 80), floor: str(d.floor, 30),
    hours: str(d.hours, 120), ceiling: str(d.ceiling, 10).replace(/[^0-9.]/g, ''),
    layouts: { standing: pos(lay.standing), theater: pos(lay.theater), classroom: pos(lay.classroom), banquet: pos(lay.banquet) },
    parking: { count: bounded(park.count, 0, 100000), note: str(park.note, 120) },
    facilities: pick(d.facilities, ids(PLATFORM.facilities), 18),
    rules: { food: ['ok', 'limited', 'no'].includes((d.rules || {}).food) ? d.rules.food : '', alcohol: ['ok', 'no'].includes((d.rules || {}).alcohol) ? d.rules.alcohol : '', note: text((d.rules || {}).note, 1000) },
    price,
    options: (Array.isArray(d.options) ? d.options : []).map(x => ({ name: str(x && x.name, 40), price: won(x && x.price), unit: PLATFORM.optionUnits.includes(x && x.unit) ? x.unit : '건', note: str(x && x.note, 80) }))
      .filter(x => x.name && x.price !== null).slice(0, 12),
    refund: { preset: ids(PLATFORM.refundPresets).includes((d.refund || {}).preset) ? d.refund.preset : 'standard', text: text((d.refund || {}).text, 1000) },
    // 문의 받는 방식 — 연락처·SNS 공개는 호스트가 정합니다 (수수료가 없으니 숨길 이유가 없습니다)
    contact: { phone: phoneOk(c.phone), phone_public: !!c.phone_public, kakao: social(c.kakao, ['kakao.com']), instagram: social(c.instagram, ['instagram.com']), naver: social(c.naver, ['naver.com', 'naver.me']),
      youtube: social(c.youtube, ['youtube.com', 'youtu.be']), homepage: social(c.homepage) },
    booking: { lead_days: bounded(b.lead_days, 0, 365) || 0, reply: str(b.reply, 40), visit: b.visit !== false },
    // 결제는 고객과 호스트가 직접 — 받는 방법만 안내합니다
    payment: { methods: pick(pay.methods, ids(PLATFORM.payMethods), 3), bank: str(pay.bank, 30), account: str(pay.account, 40).replace(/[^0-9-]/g, ''), holder: str(pay.holder, 40), card_link: httpsUrl(pay.card_link, 300),
      deposit_pct: bounded(pay.deposit_pct, 0, 100), tax_invoice: !!pay.tax_invoice, note: str(pay.note, 300) },
    biz: { type: ['corp', 'personal', 'none'].includes(biz.type) ? biz.type : '', name: str(biz.name, 60), no: str(biz.no, 20).replace(/[^0-9-]/g, ''), ceo: str(biz.ceo, 40) }
  };
  if (strict) {
    if (!address) return { error: '공간 주소를 적어 주세요.' };
    if (!capacity) return { error: '최대 이용 인원을 적어 주세요.' };
    if (!area) return { error: '면적(평)을 적어 주세요.' };
    if (!price.modes.length) return { error: '요금 방식을 한 가지 이상 골라 주세요. 금액을 정하기 어렵다면 ‘견적 문의’를 고르세요.' };
    if (data.intro.length < 20) return { error: '공간 소개를 20자 이상 적어 주세요.' };
  }
  return { name, region, address, capacity, area, tier, types, price_from: priceFrom(price), data };
}

// ---------- 공개 정보 ----------
export function visibleSql(alias = 's') { return `${alias}.status = 'live' AND (COALESCE(${alias}.free_until, '') >= ? OR COALESCE(${alias}.paid_until, '') >= ?)`; }
export function listedUntil(row) { return [row.free_until || '', row.paid_until || ''].sort().pop() || ''; }
export function photoUrl(pid, thumb) { return '/api/venues/photo/' + pid + (thumb ? '?t=1' : ''); }
export function cardSpace(row, cover) {
  const d = safeJson(row.data), p = d.price || {};
  return { id: row.ref, name: row.name, region: row.region, region_label: REGION_LABEL[row.region] || '', address: shortAddress(row.address), capacity: row.capacity, area: row.area, tier: row.tier,
    types: safeArr(row.types), type_labels: safeArr(row.types).map(t => TYPE_LABEL[t] || t), summary: d.summary || '', price_from: row.price_from, price_basis: priceFromLabel(p), vat: p.vat || 'included',
    quote_only: !row.price_from, cover: cover ? photoUrl(cover, true) : '', facilities: (d.facilities || []).slice(0, 6), station: d.station || '' };
}
export function safeArr(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
// 목록에는 시·구까지만 보여 줍니다 (상세 주소는 상세 화면에서)
export function shortAddress(a) { const p = String(a || '').trim().split(/\s+/); return p.slice(0, p.length > 2 ? 3 : 2).join(' '); }
export function publicSpace(row, photos, host) {
  const d = safeJson(row.data), c = d.contact || {}, pay = d.payment || {};
  return { ...cardSpace(row, photos[0] && photos[0].pid), address_full: [row.address, d.address_detail].filter(Boolean).join(' '), floor: d.floor || '', intro: d.intro || '', hours: d.hours || '', ceiling: d.ceiling || '',
    layouts: d.layouts || {}, parking: d.parking || {}, facilities: d.facilities || [], facility_labels: (d.facilities || []).map(f => FACILITY_LABEL[f] || f), rules: d.rules || {}, price: d.price || {}, options: d.options || [],
    refund: d.refund || {}, booking: d.booking || {},
    // 전화번호는 호스트가 공개로 둔 경우에만 내려갑니다
    contact: { phone: c.phone_public ? c.phone : '', has_phone: !!(c.phone_public && c.phone), kakao: c.kakao || '', instagram: c.instagram || '', naver: c.naver || '', youtube: c.youtube || '', homepage: c.homepage || '' },
    payment: { methods: pay.methods || [], deposit_pct: pay.deposit_pct ?? null, tax_invoice: !!pay.tax_invoice },
    // 계약 상대방(호스트 사업자) 표시 — 통신판매중개 고지
    seller: { company: (d.biz && d.biz.name) || (host && host.company) || '', biz_no: (d.biz && d.biz.no) || (host && host.biz_no) || '', ceo: (d.biz && d.biz.ceo) || '' },
    photos: photos.map(p => ({ id: p.pid, src: photoUrl(p.pid), thumb: photoUrl(p.pid, true), w: p.w, h: p.h })) };
}

// ---------- 예상 금액 ----------
export function isWeekend(date) { const dow = new Date(date + 'T00:00:00Z').getUTCDay(); return dow === 0 || dow === 6 || Object.prototype.hasOwnProperty.call(HOLIDAYS, date); }
const hm = t => { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
// sel: { mode:'hourly'|'package'|'daily', date, start, end, pkg(번호), people, options:[{i(번호), qty}] }
export function estimate(d, sel) {
  const p = (d && d.price) || {}, lines = []; sel = sel || {};
  const weekend = isDate(sel.date) ? isWeekend(sel.date) : false, dayLabel = isDate(sel.date) ? (weekend ? '주말·공휴일' : '평일') : '';
  const rate = o => { if (!o) return null; const a = weekend ? o.weekend : o.weekday, b = weekend ? o.weekday : o.weekend; return a ?? b ?? null; };
  let hours = null, missing = '';
  if (sel.mode === 'hourly' && p.hourly) {
    const s = hm(sel.start), e = hm(sel.end); const r = rate(p.hourly);
    if (s === null || e === null) missing = '이용 시간을 고르면 금액이 계산됩니다.';
    else { let mins = e - s; if (mins <= 0) mins += 1440; hours = Math.ceil(mins / 60); const bill = Math.max(hours, p.hourly.min_hours || 1);
      if (r === null) missing = '이 날짜의 시간당 요금은 호스트가 견적으로 안내합니다.';
      else lines.push({ label: '공간 이용료', desc: `${dayLabel ? dayLabel + ' ' : ''}시간당 ${r.toLocaleString('ko-KR')}원 × ${bill}시간` + (bill > hours ? ` (최소 ${bill}시간)` : ''), amount: r * bill }); }
  } else if (sel.mode === 'package' && (p.packages || [])[+sel.pkg]) {
    const k = p.packages[+sel.pkg], r = rate(k);
    if (r === null) missing = '이 날짜의 패키지 요금은 호스트가 견적으로 안내합니다.';
    else lines.push({ label: '패키지 · ' + k.name, desc: [dayLabel, k.time].filter(Boolean).join(' · '), amount: r });
  } else if (sel.mode === 'daily' && p.daily) {
    const r = rate(p.daily);
    if (r === null) missing = '이 날짜의 하루 대관 요금은 호스트가 견적으로 안내합니다.';
    else lines.push({ label: '하루 대관', desc: dayLabel, amount: r });
  } else missing = '요금은 호스트가 견적으로 안내합니다.';
  const people = pos(sel.people);
  if (lines.length && people && p.base_people && p.extra_per_person && people > p.base_people)
    lines.push({ label: '인원 추가', desc: `기준 ${p.base_people}명 초과 ${people - p.base_people}명 × ${p.extra_per_person.toLocaleString('ko-KR')}원`, amount: (people - p.base_people) * p.extra_per_person });
  const picked = [];
  for (const o of Array.isArray(sel.options) ? sel.options.slice(0, 12) : []) {
    const opt = (d.options || [])[+o.i]; if (!opt) continue; const qty = pos(o.qty, 9999) || 1;
    picked.push({ name: opt.name, unit: opt.unit, price: opt.price, qty });
    if (lines.length) lines.push({ label: '옵션 · ' + opt.name, desc: `${opt.price.toLocaleString('ko-KR')}원 × ${qty}${opt.unit}`, amount: opt.price * qty });
  }
  if (!lines.length) return { ok: false, note: missing, options: picked, weekend, hours };
  const subtotal = lines.reduce((a, l) => a + l.amount, 0), vat = p.vat === 'excluded' ? Math.round(subtotal / 10) : 0;
  return { ok: true, lines, subtotal, vat, vat_mode: p.vat || 'included', total: subtotal + vat, deposit: p.deposit || 0, options: picked, weekend, hours, note: '호스트가 일정과 조건을 확인한 뒤 금액을 확정합니다.' };
}

// ---------- 호스트 로그인 (쿠키 ms_host · DB에는 토큰 해시만) ----------
export function hostCookies(token, days = HOST_SESSION_DAYS) {
  const age = days > 0 ? days * 86400 : 0;
  return [`ms_host=${token}; Path=/api/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`, `ms_host_in=${age ? 1 : ''}; Path=/; Max-Age=${age}; Secure; SameSite=Lax`];
}
export async function getHost(request, env) {
  const token = getCookie(request, 'ms_host'); if (!token || !hasDb(env)) return null;
  const row = await env.DB.prepare('SELECT h.* FROM host_sessions s JOIN hosts h ON h.id = s.host_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(await sha256(token), now()).first();
  return row && row.status === 'active' ? row : null;
}
// 메가스팟 회원 계정 ↔ 호스트 계정 연결 (member_hosts)
export function hostOfMember(env, memberId) { return env.DB.prepare('SELECT h.* FROM member_hosts l JOIN hosts h ON h.id = l.host_id WHERE l.member_id = ?').bind(memberId).first(); }
export function memberOfHost(env, hostId) { return env.DB.prepare('SELECT m.id, m.email, m.name, m.status FROM member_hosts l JOIN members m ON m.id = l.member_id WHERE l.host_id = ?').bind(hostId).first(); }
export function publicHost(h) { return { code: h.code, email: h.email, name: h.name, phone: h.phone, company: h.company || '', biz_no: h.biz_no || '', settings: safeJson(h.settings), created_at: h.created_at }; }

// ---------- 고객 예약 조회 링크 ----------
export async function bookingToken(env, code) { return code ? hmacToken(env, 'hostbooking:' + code) : ''; }
export async function bookingKeyOk(env, code, k) { const t = await bookingToken(env, code); return !!t && tokenEq(t, String(k || '')); }
export async function planningToken(env, ref) { return ref ? hmacToken(env, 'planning:' + ref) : ''; }
export async function planningKeyOk(env, ref, k) { const t = await planningToken(env, ref); return !!t && tokenEq(t, String(k || '')); }

// ---------- 노출·조회·연락 집계 (공간별 · 날짜별) ----------
export const STAT_FIELDS = ['imp', 'view', 'contact', 'sns', 'fav', 'inquiry'];
export async function bump(env, refs, field, n = 1) {
  if (!STAT_FIELDS.includes(field)) return; const day = kstToday();
  for (const ref of [].concat(refs).slice(0, 60)) {
    try { await env.DB.prepare(`INSERT INTO host_stats (space_ref, day, ${field}) VALUES (?, ?, ?) ON CONFLICT(space_ref, day) DO UPDATE SET ${field} = ${field} + excluded.${field}`).bind(ref, day, n).run(); } catch {}
  }
}
export { safeJson, phoneOk, timeOk, bounded, httpsUrl };
