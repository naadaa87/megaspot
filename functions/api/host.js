// 호스트·파트너 신청 접수 — 입점 상담(host) · 공간 등록 신청(space) · 광고·제휴 문의(ad)
// 세 가지 모두 host_applications 표에 kind 로 나눠 저장하고, 관리자 화면 '입점·광고 신청'에서 함께 봅니다.
import { json, err, hasDb, readJson, str, now, uniqueRef, log, clientIp, tooMany, hit } from './_lib.js';
import { REGION_IDS, AD_SLOTS, httpsUrl } from './_platform.js';

const list = (v, max, len = 20) => (Array.isArray(v) ? v : (v ? [v] : [])).map(x => str(x, len)).filter(Boolean).slice(0, max);
const lines = (v, max, len = 300) => String(v || '').split(/\n/).map(x => str(x, len)).filter(Boolean).slice(0, max);

function hostData(d) {   // 입점 상담 (짧은 양식)
  const o = { space_name: str(d.space_name, 120), address: str(d.address, 200), area: str(d.area, 10), capacity: str(d.capacity, 10), space_type: str(d.space_type, 40),
    features: list(d.features, 10), role: str(d.role, 40), channels: str(d.channels, 200), name: str(d.name, 80), phone: str(d.phone, 30), email: str(d.email, 120),
    link: str(d.link, 300), message: str(d.message, 2000) };
  if (!o.space_name || !o.address || !o.name || !o.phone || !o.role) return { error: '필수 항목을 확인해 주세요.' };
  return o;
}
function spaceData(d) {  // 공간 등록 신청 (단계별 상세 양식)
  const o = {
    space_name: str(d.space_name, 120), address: str(d.address, 200), floor: str(d.floor, 40), region: REGION_IDS.includes(d.region) ? d.region : 'etc', station: str(d.station, 80),
    area: str(d.area, 10), area_event: str(d.area_event, 10), ceiling: str(d.ceiling, 10), space_type: str(d.space_type, 40),
    capacity: str(d.capacity, 10), cap_theater: str(d.cap_theater, 10), cap_class: str(d.cap_class, 10), cap_banquet: str(d.cap_banquet, 10), cap_standing: str(d.cap_standing, 10),
    features: list(d.features, 12), purposes: list(d.purposes, 12), themes: list(d.themes, 6), parking: str(d.parking, 120),
    hours: str(d.hours, 120), price_base: str(d.price_base, 200), price_note: str(d.price_note, 600), deposit: str(d.deposit, 100), cancel_policy: str(d.cancel_policy, 600), rules: str(d.rules, 800),
    photos: lines(d.photos, 10).map(u => httpsUrl(u)).filter(Boolean), floorplan: httpsUrl(d.floorplan, 300), intro: str(d.intro, 2000), available: str(d.available, 300),
    role: str(d.role, 40), operation: ['self', 'managed', 'undecided'].includes(d.operation) ? d.operation : 'undecided', channels: str(d.channels, 200),
    biz_type: str(d.biz_type, 20), biz_name: str(d.biz_name, 80), biz_no: str(d.biz_no, 20).replace(/[^0-9-]/g, ''),
    name: str(d.name, 80), phone: str(d.phone, 30), email: str(d.email, 120), link: str(d.link, 300), message: str(d.message, 2000)
  };
  if (!o.space_name || !o.address || !o.area || !o.capacity || !o.space_type) return { error: '공간 이름·주소·면적·최대 인원·공간 유형을 확인해 주세요.' };
  if (!o.role || !o.name || !o.phone) return { error: '운영 권한과 담당자 이름·연락처를 확인해 주세요.' };
  if (!d.agree_info) return { error: '입력한 정보가 사실과 같다는 확인이 필요합니다.' };
  return o;
}
function adData(d) {     // 광고·제휴 문의
  const o = { company: str(d.company, 80), name: str(d.name, 80), phone: str(d.phone, 30), email: str(d.email, 120), link: str(d.link, 300),
    slots: list(d.slots, 6, 30).filter(s => Object.prototype.hasOwnProperty.call(AD_SLOTS, s) || s === 'meetup' || s === 'etc'),
    goal: str(d.goal, 40), period: str(d.period, 100), budget: str(d.budget, 60), message: str(d.message, 2000) };
  if (!o.company || !o.name || !o.phone || !o.message) return { error: '회사·브랜드명, 담당자 이름·연락처, 문의 내용을 적어 주세요.' };
  return o;
}

export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
  if (d.website) return json({ ok: true, ref: 'HS-0000-SPAM' });   // 허니팟
  const ipKey = 'host:' + clientIp(request);
  try { if (await tooMany(env, ipKey, 5, 10)) return err('짧은 시간에 너무 많은 요청이 들어왔습니다. 잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY'); } catch {}
  const kind = ['space', 'ad'].includes(d.kind) ? d.kind : 'host';
  const data = kind === 'space' ? spaceData(d) : kind === 'ad' ? adData(d) : hostData(d);
  if (data.error) return err(data.error);
  if (String(data.phone || '').replace(/\D/g, '').length < 9) return err('연락처 형식을 확인해 주세요.');
  if (!d.agree_privacy) return err('개인정보 수집·이용 동의가 필요합니다.');
  data.kind = kind; data.agreed_at = now();
  try {
    try { await hit(env, ipKey, 10); } catch {}
    const ref = await uniqueRef(env, 'host_applications', 'ref', 'HS');
    await env.DB.prepare('INSERT INTO host_applications (ref, status, data, kind, created_at) VALUES (?,?,?,?,?)').bind(ref, '접수', JSON.stringify(data), kind, now()).run();
    await log(env, kind === 'ad' ? 'ad.inquiry' : kind === 'space' ? 'space.applied' : 'host.created', ref, kind, { name: data.space_name || data.company || '', kind });
    return json({ ok: true, ref, kind });
  } catch (e) { console.error('host', e && e.message); return err('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'DB_ERROR'); }
}
