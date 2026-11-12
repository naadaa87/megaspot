// 입점 이용료 온라인 결제(페이앱)의 서버 통보와 결제 후 돌아오는 주소
//   POST /api/hostpay/feedback   페이앱 → 서버 통보. 검증을 통과한 통보만 결제 완료·취소로 반영합니다 (_hostbilling.js)
//   GET|POST /api/hostpay/return?ref=BL-…   결제창에서 돌아올 때. 화면 이동만 하고 결제 상태는 바꾸지 않습니다.
import { err, hasDb } from '../_lib.js';
import { BILL_REF, billingFeedback, feedbackNotice } from '../_hostbilling.js';

export async function onRequest({ request, env, params }) {
  const path = (params.path || []).join('/'), method = request.method.toUpperCase();
  if (path === 'return' && ['GET', 'POST'].includes(method)) {
    const ref = new URL(request.url).searchParams.get('ref') || '';
    return Response.redirect(new URL('/host/center/' + (BILL_REF.test(ref) ? '?pay=' + ref : '') + '#billing', request.url).href, 303);
  }
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  if (path === 'feedback' && method === 'POST') {
    try { return await billingFeedback(request, env); }
    catch (e) { console.error('hostpay', e && e.message); return feedbackNotice('FAIL', 500); }
  }
  return err('경로를 찾을 수 없습니다.', 404, 'NOT_FOUND');
}
