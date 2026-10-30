// 문의·예약 신청 접수 — 행사 대관(event) · 정기·반복 모임(regular) · 제휴·협력·파트너(partner)
// reserve:true 이면 '예약 신청'(금액 확인 → 신청)으로 들어온 건입니다. 모임 유형은 선택 사항입니다.
import { json, err, hasDb, readJson, str, num, isDate, now, uniqueRef, log, getMember, clientIp, tooMany, hit, kstToday, spaceOk, SPACE_OPENING } from './_lib.js';
import { cateringFrom } from './_catering.js';
import { cocktailFrom } from './_cocktail.js';
import { createVisit, timeOk } from './_visits.js';
const TYPES = ['event', 'regular', 'partner'];
// '함께 알아보기'로 받을 수 있는 패밀리 공간 (assets/js/site.js의 FAMILY_ASK와 같은 id)
export const FAMILY_ASK = ['socialfactory', 'playtion'];
// 홈페이지로 들어오기 직전 어디에 있었는지(검색·SNS·광고 링크)를 분류합니다. 브라우저가 보낸 referrer·utm 값만 쓰고 개인 식별 정보는 받지 않습니다.
const SRC_RULES = [
  // 패밀리 사이트에서 넘어온 경우 (관리자 화면에 '패밀리 · 브랜드명'으로 표시)
  [/socialfactory\.co\.kr/, 'family', '패밀리 · 소셜팩토리'], [/playtion\.kr/, 'family', '패밀리 · 플레이션'], [/ssople\.com/, 'family', '패밀리 · 쏘플파티룸'],
  [/hellomingle\.kr/, 'family', '패밀리 · 밍글'], [/choisijun\.com/, 'family', '패밀리 · 최시준'], [/coremood\.kr/, 'family', '패밀리 · 코어무드'],
  [/orbis-estate\.com/, 'family', '패밀리 · 오르비스'], [/vacancy\.co\.kr/, 'family', '패밀리 · 공백'], [/yeodeol\.kr/, 'family', '패밀리 · 여덟글자'],
  [/instagram|^ig$/, 'instagram', '인스타그램'], [/facebook|^fb$|fb\.com/, 'facebook', '페이스북'], [/youtube|youtu\.be/, 'youtube', '유튜브'], [/spacecloud/, 'spacecloud', '스페이스클라우드'],
  [/blog\.naver/, 'naver_blog', '네이버 블로그'], [/map\.naver|place\.naver|m\.place/, 'naver_place', '네이버 지도·플레이스'], [/naver/, 'naver', '네이버'], [/google/, 'google', '구글'], [/daum/, 'daum', '다음'],
  [/kakao/, 'kakao', '카카오'], [/bing/, 'bing', '빙'], [/threads|twitter|x\.com|t\.co/, 'sns', 'SNS']];
export function cameFrom(c) {
  if (!c || typeof c !== 'object') return null;
  const ref = str(c.ref, 300), us = str(c.utm_source, 60).toLowerCase();
  let host = ''; try { host = ref ? new URL(ref).hostname.replace(/^www\./, '') : ''; } catch {}
  const key = us || host;
  let src = key ? 'site' : 'direct', label = key ? '다른 사이트' : '직접 방문';
  for (const [re, id, lb] of SRC_RULES) if (re.test(key)) { src = id; label = lb; break; }
  return { src, label, host, utm_source: us, utm_medium: str(c.utm_medium, 60), utm_campaign: str(c.utm_campaign, 80), landing: str(c.landing, 200) };
}
export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
  if (d.website) return json({ ok: true, ref: 'MS-0000-SPAM' }); // 허니팟(사람은 채우지 않는 숨은 칸)
  // 같은 IP에서 10분에 8건 넘게 들어오면 잠시 막습니다(자동 입력 방지)
  const ipKey = 'inq:' + clientIp(request);
  try { if (await tooMany(env, ipKey, 8, 10)) return err('짧은 시간에 너무 많은 요청이 들어왔습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY'); } catch {}
  const inquiry_type = TYPES.includes(d.inquiry_type) ? d.inquiry_type : 'event';
  const name = str(d.name, 80), phone = str(d.phone, 30).replace(/[^0-9-+]/g, ''), email = str(d.email, 120);
  // 등록 공간(호스트 공간)에 대한 문의는 맞춤 공간 요청(request)으로 받고 어떤 공간인지 함께 남깁니다
  let listing = null;
  const lid = str(d.listing && d.listing.id, 20).toUpperCase();
  if (/^L-\d{4}-[A-Z0-9]{4}$/.test(lid)) {
    try { const l = await env.DB.prepare("SELECT slug, name FROM listings WHERE slug = ? AND status = 'published'").bind(lid).first(); if (l) listing = { id: l.slug, name: l.name }; } catch {}
  }
  if (listing) d.space_id = 'request';
  const space_id = str(d.space_id, 60) === 'request' ? 'request' : (str(d.space_id, 60) ? spaceOk(d.space_id) : (inquiry_type === 'partner' ? 'megaspot-gundae' : 'request'));
  const purpose = str(d.purpose, 40), date = str(d.date, 10), message = str(d.message, 2000), org = str(d.org, 120);
  const headcount = num(d.headcount);
  const reserve = !!d.reserve;
  if (!name || !phone) return err('이름과 연락처는 필수입니다.');
  if (phone.replace(/\D/g, '').length < 9) return err('연락처 형식을 확인해 주세요.');
  // 예약 신청은 이용일이 꼭 있어야 하고, 간단 문의는 이름·연락처만 있으면 받습니다(날짜·모임 유형은 선택).
  if (reserve && !isDate(date)) return err('이용 희망일을 확인해 주세요.');
  if (reserve && date < kstToday()) return err('지난 날짜는 신청할 수 없습니다. 이용일을 다시 골라 주세요.');
  if (reserve && SPACE_OPENING[space_id] && date && date < SPACE_OPENING[space_id]) return err('오픈 전 날짜입니다. ' + SPACE_OPENING[space_id].replace(/-/g, '. ') + ' 오픈일 이후 날짜로 신청해 주세요.', 400, 'BEFORE_OPENING');
  if (date && !isDate(date)) return err('희망일 형식을 확인해 주세요.');
  if (inquiry_type === 'partner') {
    if (!org) return err('회사·단체명을 적어 주세요.');
    if (!message) return err('제안 내용을 적어 주세요.');
  }
  if (!d.agree_privacy) return err('개인정보 수집·이용 동의가 필요합니다.');
  // '현장답사 먼저 하고 싶어요' — 희망 날짜·시간은 운영자가 연락해 확정합니다
  const vw = d.visit_wish && typeof d.visit_wish === 'object' && d.visit_wish.want ? d.visit_wish : null;
  const visit_wish = vw ? { date: str(vw.date, 10), time: timeOk(vw.time), people: num(vw.people), note: str(vw.note, 200) } : null;
  if (visit_wish && visit_wish.date && (!isDate(visit_wish.date) || visit_wish.date < kstToday())) return err('현장답사 희망 날짜를 확인해 주세요.');
  const data = {
    inquiry_type, reserve, channel: 'web', came_from: cameFrom(d.came_from), space_id, purpose, date: isDate(date) ? date : '', date_alt: str(d.date_alt, 10), slot: str(d.slot, 10),
    start_h: num(d.start_h), end_h: num(d.end_h), pkg: str(d.pkg, 20), total: num(d.total),
    options: (d.options && typeof d.options === 'object' && !Array.isArray(d.options)) ? Object.fromEntries(Object.entries(d.options).slice(0, 10).map(([k, v]) => [str(k, 20), (v && typeof v === 'object') ? { count: num(v.count), hours: num(v.hours) } : !!v])) : {},
    t_setup: str(d.t_setup, 5), t_start: str(d.t_start, 5), t_end: str(d.t_end, 5), t_out: str(d.t_out, 5),
    headcount, staff: num(d.staff), layout: str(d.layout, 20), needs: Array.isArray(d.needs) ? d.needs.map(x => str(x, 20)).slice(0, 20) : [],
    food_fx: str(d.food_fx, 300), theme: str(d.theme, 200), region: str(d.region, 30), budget: str(d.budget, 20),
    repeat_cycle: str(d.repeat_cycle, 30), repeat_period: str(d.repeat_period, 30), repeat_days: str(d.repeat_days, 100),
    org, partner_kind: str(d.partner_kind, 40), estimate: str(d.estimate, 3000),
    docs: Array.isArray(d.docs) ? d.docs.map(x => str(x, 20)).slice(0, 5) : [], name, phone, email, contact_pref: str(d.contact_pref, 10),
    family: [].concat(d.family || []).map(x => str(x, 20)).filter((x, i, a) => FAMILY_ASK.includes(x) && a.indexOf(x) === i).slice(0, 4),
    catering: cateringFrom(d.catering),
    cocktail: cocktailFrom(d.cocktail),
    listing,   // 등록 공간 문의일 때 { id, name }
    visit_wish,   // 현장답사 희망 { date, time, people, note }   // '출장뷔페도 함께 상담받기' (코스·인원·바베큐·생맥주 — 금액은 서버에서 다시 계산)
    message, agree_marketing: !!d.agree_marketing, source: str(d.source, 200), summary: str(d.summary, 6000),
    ua: str(request.headers.get('user-agent'), 200)
  };
  // 로그인한 회원이 보낸 문의는 회원 번호를 붙여 마이페이지에서 진행 상태를 볼 수 있게 합니다.
  try { const m = await getMember(request, env); if (m) { data.member_id = m.id; data.member_email = m.email; } } catch {}
  try {
    try { await hit(env, ipKey, 10); } catch {}
    const ref = await uniqueRef(env, 'inquiries', 'ref', 'MS');
    await env.DB.prepare('INSERT INTO inquiries (ref, space_id, status, name, phone, email, event_date, headcount, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(ref, space_id, '문의 접수', name, phone, email, data.date || null, headcount, JSON.stringify(data), now()).run();
    await log(env, reserve ? 'reserve.created' : 'inquiry.created', ref, data.member_id ? 'member:' + data.member_id : 'customer', { inquiry_type, space_id, date: data.date, headcount, total: data.total, catering: data.catering ? data.catering.total || true : undefined, cocktail: data.cocktail ? data.cocktail.cups : undefined, listing: listing ? listing.id : undefined });
    let visit = '';
    if (visit_wish) {
      try {
        const vr = await createVisit(env, { inquiry_ref: ref, date: visit_wish.date, time: '', name, phone, people: visit_wish.people, space_id: space_id === 'request' ? '' : space_id },
          { actor: 'customer', source: 'web', wish: { date: visit_wish.date, time: visit_wish.time, note: visit_wish.note } });
        if (vr.item) visit = vr.item.ref;
      } catch (e) { console.error('visit', e && e.message); }
    }
    return json({ ok: true, ref, member: !!data.member_id, visit });
  } catch (e) { console.error('inquiry', e && e.message); return err('저장 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 카카오톡으로 알려 주세요.', 500, 'DB_ERROR'); }
}
