// 행사 문의서 접수
import { json, err, hasDb, readJson, str, num, isDate, now, uniqueRef, log } from './_lib.js';
export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
  if (d.website) return json({ ok: true, ref: 'MS-0000-SPAM' }); // 허니팟
  const name = str(d.name, 80), phone = str(d.phone, 30).replace(/[^0-9-+]/g, ''), email = str(d.email, 120);
  const space_id = str(d.space_id, 60) || 'request', purpose = str(d.purpose, 40), date = str(d.date, 10);
  const headcount = num(d.headcount);
  if (!name || !phone) return err('이름과 연락처는 필수입니다.');
  if (phone.replace(/\D/g, '').length < 9) return err('연락처 형식을 확인해 주세요.');
  if (!isDate(date)) return err('희망 날짜를 확인해 주세요.');
  if (!purpose) return err('행사 목적을 선택해 주세요.');
  if (!d.agree_privacy) return err('개인정보 수집·이용 동의가 필요합니다.');
  const data = {
    space_id, purpose, date, date_alt: str(d.date_alt, 10), slot: str(d.slot, 10),
    t_setup: str(d.t_setup, 5), t_start: str(d.t_start, 5), t_end: str(d.t_end, 5), t_out: str(d.t_out, 5),
    headcount, staff: num(d.staff), layout: str(d.layout, 20), needs: Array.isArray(d.needs) ? d.needs.map(x => str(x, 20)).slice(0, 20) : [],
    food_fx: str(d.food_fx, 300), theme: str(d.theme, 200), region: str(d.region, 30), budget: str(d.budget, 20),
    docs: Array.isArray(d.docs) ? d.docs.map(x => str(x, 20)).slice(0, 5) : [], name, phone, email, contact_pref: str(d.contact_pref, 10),
    message: str(d.message, 2000), agree_marketing: !!d.agree_marketing, source: str(d.source, 200), summary: str(d.summary, 4000),
    ua: str(request.headers.get('user-agent'), 200)
  };
  try {
    const ref = await uniqueRef(env, 'inquiries', 'ref', 'MS');
    await env.DB.prepare('INSERT INTO inquiries (ref, space_id, status, name, phone, email, event_date, headcount, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(ref, space_id, '문의 접수', name, phone, email, date, headcount, JSON.stringify(data), now()).run();
    await log(env, 'inquiry.created', ref, 'customer', { space_id, date, headcount });
    return json({ ok: true, ref });
  } catch (e) { return err('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. (' + (e.message || '') + ')', 500, 'DB_ERROR'); }
}
