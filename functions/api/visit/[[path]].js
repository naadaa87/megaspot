// 사전답사 신청 (2026-11-25)
//   GET  /api/visit/slots?space=megaspot-gundae|megaspot-gundae-2|both&from=YYYY-MM-DD&days=14   고를 수 있는 시간
//   POST /api/visit/request   { space, date, time, name, phone, people, purpose, event_date, headcount, memo, agree }
//   GET  /api/visit/view?ref=&k=        신청 내용과 주고받은 글
//   POST /api/visit/message { ref, k, body }
//   POST /api/visit/cancel  { ref, k, reason }
import { err, hasDb, sameOrigin } from '../_lib.js';
import { visitPublic } from '../_visit_self.js';

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('지금은 사전답사 신청을 받을 수 없습니다. 카카오톡이나 전화로 문의해 주세요.', 503, 'NO_DB');
  const method = request.method.toUpperCase(), url = new URL(request.url), path = (params.path || []).join('/');
  if (method !== 'GET' && method !== 'POST') return err('허용되지 않은 요청입니다.', 405, 'METHOD');
  if (method === 'POST' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN');
  try {
    return await visitPublic({ request, env, path, method, url });
  } catch (e) {
    console.error('visit', e && e.message);
    return err('처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500, 'VISIT_ERROR');
  }
}
