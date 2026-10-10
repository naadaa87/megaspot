// 문의 접수 — 행사 대관(event) · 정기·반복 모임(regular) · 제휴·협력·파트너(partner)
import { json, err, hasDb, readJson, str, num, isDate, now, uniqueRef, log } from './_lib.js';
const TYPES = ['event', 'regular', 'partner'];
export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
  if (d.website) return json({ ok: true, ref: 'MS-0000-SPAM' }); // 허니팟
  const inquiry_type = TYPES.includes(d.inquiry_type) ? d.inquiry_type : 'event';
  const name = str(d.name, 80), phone = str(d.phone, 30).replace(/[^0-9-+]/g, ''), email = str(d.email, 120);
  const space_id = str(d.space_id, 60) || (inquiry_type === 'partner' ? 'megaspot-gundae' : 'request');
  const purpose = str(d.purpose, 40), date = str(d.date, 10), message = str(d.message, 2000), org = str(d.org, 120);
  const headcount = num(d.headcount);
  if (!name || !phone) return err('이름과 연락처는 필수입니다.');
  if (phone.replace(/\D/g, '').length < 9) return err('연락처 형식을 확인해 주세요.');
  if (inquiry_type === 'event') {
    if (!isDate(date)) return err('희망 날짜를 확인해 주세요.');
    if (!purpose) return err('행사 목적을 선택해 주세요.');
  }
  if (inquiry_type === 'regular') {
    if (date && !isDate(date)) return err('첫 이용 희망일을 확인해 주세요.');
    if (!purpose) return err('모임 목적을 선택해 주세요.');
  }
  if (inquiry_type === 'partner') {
    if (!org) return err('회사·단체명을 적어 주세요.');
    if (!message) return err('제안 내용을 적어 주세요.');
  }
  if (!d.agree_privacy) return err('개인정보 수집·이용 동의가 필요합니다.');
  const data = {
    inquiry_type, space_id, purpose, date: isDate(date) ? date : '', date_alt: str(d.date_alt, 10), slot: str(d.slot, 10),
    t_setup: str(d.t_setup, 5), t_start: str(d.t_start, 5), t_end: str(d.t_end, 5), t_out: str(d.t_out, 5),
    headcount, staff: num(d.staff), layout: str(d.layout, 20), needs: Array.isArray(d.needs) ? d.needs.map(x => str(x, 20)).slice(0, 20) : [],
    food_fx: str(d.food_fx, 300), theme: str(d.theme, 200), region: str(d.region, 30), budget: str(d.budget, 20),
    repeat_cycle: str(d.repeat_cycle, 30), repeat_period: str(d.repeat_period, 30), repeat_days: str(d.repeat_days, 100),
    org, partner_kind: str(d.partner_kind, 40), estimate: str(d.estimate, 3000),
    docs: Array.isArray(d.docs) ? d.docs.map(x => str(x, 20)).slice(0, 5) : [], name, phone, email, contact_pref: str(d.contact_pref, 10),
    message, agree_marketing: !!d.agree_marketing, source: str(d.source, 200), summary: str(d.summary, 6000),
    ua: str(request.headers.get('user-agent'), 200)
  };
  try {
    const ref = await uniqueRef(env, 'inquiries', 'ref', 'MS');
    await env.DB.prepare('INSERT INTO inquiries (ref, space_id, status, name, phone, email, event_date, headcount, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(ref, space_id, '문의 접수', name, phone, email, data.date || null, headcount, JSON.stringify(data), now()).run();
    await log(env, 'inquiry.created', ref, 'customer', { inquiry_type, space_id, date: data.date, headcount });
    return json({ ok: true, ref });
  } catch (e) { return err('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. (' + (e.message || '') + ')', 500, 'DB_ERROR'); }
}
