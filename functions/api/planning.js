// 행사 지원 요청 — "메가스팟에 맡겨 주세요" (날짜·인원·1인 예산과 필요한 항목만 남기면 본사가 공간·식음료·진행을 묶어 제안)
//   POST /api/planning            요청 접수 → 접수번호 PL-… 와 조회 링크
//   GET  /api/planning?ref=&k=    (또는 &p=휴대폰 뒷 4자리) 진행 상태·제안 요약 조회
import { json, err, hasDb, readJson, str, num, isDate, isEmail, now, kstToday, uniqueRef, log, clientIp, tooMany, hit } from './_lib.js';
import { phoneOk, last4 } from './_platform.js';
import { tokenEq } from './_confirm.js';
import { PLATFORM, PURPOSE_LABEL, REGION_LABEL, SPACE_REF, planningToken, planningKeyOk } from './_hostplat.js';
import { PLANNING_NEEDS, PLANNING_REF as REF, publicPlanning } from './_planning.js';

export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
  if (d.website) return json({ ok: true, ref: 'PL-0000-SPAM' });
  const key = 'planning:' + clientIp(request);
  try { if (await tooMany(env, key, 5, 10)) return err('짧은 시간에 너무 많은 요청이 들어왔습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY'); } catch {}
  const name = str(d.name, 40), phone = phoneOk(d.phone), email = str(d.email, 120).toLowerCase(), date = str(d.date, 10);
  if (!name) return err('이름을 적어 주세요.'); if (!phone) return err('연락처를 확인해 주세요.');
  if (email && !isEmail(email)) return err('이메일 형식을 확인해 주세요.');
  if (date && (!isDate(date) || date < kstToday())) return err('행사 날짜를 확인해 주세요.');
  const people = num(d.people) > 0 ? Math.min(num(d.people), 100000) : null, budget = num(d.budget_pp) > 0 ? Math.min(num(d.budget_pp), 100000000) : null;
  if (!people) return err('예상 인원을 적어 주세요.');
  if (!d.agree_privacy) return err('개인정보 수집·이용 동의가 필요합니다.');
  const needs = (Array.isArray(d.needs) ? d.needs : []).map(x => str(x, 20)).filter((x, i, l) => PLANNING_NEEDS[x] && l.indexOf(x) === i);
  if (!needs.length) return err('맡기고 싶은 항목을 한 가지 이상 골라 주세요.');
  const data = { purpose: PURPOSE_LABEL[d.purpose] ? d.purpose : '', needs, date_note: str(d.date_note, 80), hours: str(d.hours, 40), org: str(d.org, 60), space: SPACE_REF.test(d.space || '') || ['megaspot-gundae', 'megaspot-gundae-2'].includes(d.space) ? d.space : '',
    message: str(d.message, 2000), contact_pref: ['kakao', 'phone', 'email'].includes(d.contact_pref) ? d.contact_pref : 'phone', agreed_at: now() };
  try {
    try { await hit(env, key, 10); } catch {}
    const ref = await uniqueRef(env, 'planning_requests', 'ref', 'PL'), t = now();
    await env.DB.prepare('INSERT INTO planning_requests (ref, status, name, phone, phone_last4, email, event_date, people, budget_pp, region, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(ref, 'new', name, phone, last4(phone), email, date || null, people, budget, REGION_LABEL[d.region] ? d.region : '', JSON.stringify(data), t, t).run();
    await log(env, 'planning.created', ref, 'customer', { people, needs });
    return json({ ok: true, ref, k: await planningToken(env, ref) });
  } catch (e) { console.error('planning', e && e.message); return err('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'DB_ERROR'); }
}
export async function onRequestGet({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const q = new URL(request.url).searchParams, ref = str(q.get('ref'), 20).toUpperCase(), k = str(q.get('k'), 40), p = str(q.get('p'), 4);
  if (!REF.test(ref)) return err('접수번호를 확인해 주세요.', 404, 'NOT_FOUND');
  const row = await env.DB.prepare('SELECT * FROM planning_requests WHERE ref = ?').bind(ref).first();
  if (k) { if (!row || !(await planningKeyOk(env, ref, k))) return err('요청을 찾을 수 없습니다.', 404, 'NOT_FOUND'); }
  else {
    const key = 'plfind:' + clientIp(request);
    if (await tooMany(env, key, 12, 10)) return err('조회 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
    if (!row || !/^\d{4}$/.test(p) || !tokenEq(row.phone_last4 || '', p)) { await hit(env, key, 10); return err('접수번호 또는 휴대폰 뒷 4자리가 맞지 않습니다.', 404, 'NOT_FOUND'); }
  }
  return json({ ok: true, item: publicPlanning(row), needs: PLANNING_NEEDS, platform: { addons: PLATFORM.addons } });
}
