// 행사 사례 공개 API (2026-11-25)
//   GET /api/cases            공개 중인 사례 목록
//   GET /api/cases/EC-…       사례 하나
// 주최 측 동의를 받아 공개한 사례만 내보냅니다. 동의한 사람·예약번호·운영 메모는 넣지 않습니다.
import { err, hasDb } from '../_lib.js';
import { casesPublic } from '../_event_cases.js';

export async function onRequestGet({ env, params }) {
  if (!hasDb(env)) return err('지금은 사례를 불러올 수 없습니다.', 503, 'NO_DB');
  const path = (params.path || []).join('/');
  if (path.includes('/')) return err('주소를 확인해 주세요.', 404, 'NOT_FOUND');
  try { return await casesPublic({ env, path }); }
  catch (e) { console.error('cases', e && e.message); return err('사례를 불러오지 못했습니다.', 500, 'CASES_ERROR'); }
}
