// 호스트 입점 문의 접수
import { json, err, hasDb, readJson, str, now, uniqueRef, log } from './_lib.js';
export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  let d; try { d = await readJson(request); } catch (e) { return err(e.message); }
  const name = str(d.name, 80), phone = str(d.phone, 30), space_name = str(d.space_name, 120), address = str(d.address, 200), role = str(d.role, 40);
  if (!space_name || !address || !name || !phone || !role) return err('필수 항목을 확인해 주세요.');
  if (!d.agree_privacy) return err('개인정보 수집·이용 동의가 필요합니다.');
  const data = { space_name, address, area: str(d.area, 10), capacity: str(d.capacity, 10), space_type: str(d.space_type, 40), features: Array.isArray(d.features) ? d.features.map(x => str(x, 20)).slice(0, 10) : [], role, channels: str(d.channels, 200), name, phone, email: str(d.email, 120), link: str(d.link, 300), message: str(d.message, 2000) };
  try {
    const ref = await uniqueRef(env, 'host_applications', 'ref', 'HS');
    await env.DB.prepare('INSERT INTO host_applications (ref, status, data, created_at) VALUES (?,?,?,?)').bind(ref, '접수', JSON.stringify(data), now()).run();
    await log(env, 'host.created', ref, 'host', { space_name, address });
    return json({ ok: true, ref });
  } catch (e) { return err('저장 중 오류가 발생했습니다. (' + (e.message || '') + ')', 500, 'DB_ERROR'); }
}
