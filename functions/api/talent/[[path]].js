// 진행자 섭외 공개 API (2026-11-25)
//   GET  /api/talent              공개 중인 진행자 목록 (html=1 이면 카드 HTML 도 함께)
//   GET  /api/talent/<slug>       진행자 한 명 (html=1 이면 상세 HTML 도 함께)
//   GET  /api/talent/photo/<id>   관리자가 올린 프로필 사진
//   POST /api/talent/request      섭외 요청 접수
//   POST /api/talent/status       접수번호 + 휴대폰 뒷 4자리로 진행 상태 확인
// 진행자 연락처·출연료 기준·운영 메모는 어떤 응답에도 넣지 않습니다.
import { err, hasDb, sameOrigin } from '../_lib.js';
import { talentPublic } from '../_talent.js';
import { VIEW } from '../_talent_view.js';

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('지금은 진행자 정보를 불러올 수 없습니다.', 503, 'NO_DB');
  if (request.method !== 'GET' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'FORBIDDEN');
  const path = (params.path || []).join('/');
  try { return await talentPublic({ request, env, path }, VIEW); }
  catch (e) { console.error('talent', e && e.message); return err('요청을 처리하지 못했습니다. 잠시 뒤 다시 시도하거나 카카오톡으로 알려 주세요.', 500, 'TALENT_ERROR'); }
}
