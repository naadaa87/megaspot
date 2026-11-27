// 모든 /api 요청 앞에서 한 번 실행됩니다. 데이터베이스에 필요한 표가 없으면 만들어 둡니다 (이미 있으면 그대로).
import {depositNoticeTick} from './_deposit_notifications.js';
import {parkingAdminSMSTick} from './_parking_admin_alerts.js';
import {guideTick} from './_guide_messages.js';
import {hostRenewalTick} from './_hostrenewal.js';
import { ensureSchema } from './_lib.js';
import { indexNowTick } from './_seo.js';
export async function onRequest(context) {
  try { await ensureSchema(context.env); } catch {}
  const response=await context.next();
  const path=new URL(context.request.url).pathname;
  if (path === "/api/internal/spacecloud-auto") return response;
  const readOnlyRevenue=/^\/api\/admin\/revenue(?:\/|$)/.test(path);
  const readOnlyPortal=path==='/api/feedback'||path.startsWith('/api/admin/feedback')||/^\/api\/pay\/availability\/?$/.test(path)||/^\/api\/reservation-calendar\/?$/.test(path)||path.startsWith('/api/booking-portal/')||path.startsWith('/api/my-booking/')||/^\/api\/admin\/bookings\/[^/]+\/portal-link/.test(path)||/^\/api\/admin\/guide-messages\/(portal-preview|portal-test|portal-template|portal-check-template)$/.test(path);
  const paymentLinks=path.startsWith('/api/payment-links/')||path==='/api/admin/payment-links'||path.startsWith('/api/admin/payment-links/');
  const readOnlyReadiness=/^\/api\/admin\/booking-readiness\/?$/.test(path);
  const readOnlyMemberInquiries=context.request.method==='GET'&&/^\/api\/auth\/inquiries\/?$/.test(path);
  const siteStats=path==='/api/stats';   // 방문 통계 수집은 페이지마다 들어오므로 예약 알림 확인을 붙이지 않습니다
  const kit=path.startsWith('/api/invites/')||path.startsWith('/api/community/photo/')||path.startsWith('/api/contracts/')||path.startsWith('/api/talent/photo/');   // 모임 키트 초대장·커뮤니티 사진은 여러 사람이 자주 열어 보므로 예약 알림 확인을 붙이지 않습니다
  if(typeof context.waitUntil==='function'&&!siteStats&&!kit&&!paymentLinks&&!path.startsWith('/api/deposit-notifications/')&&path!=='/api/admin/transaction-notifications'&&!readOnlyPortal&&!readOnlyReadiness&&!readOnlyMemberInquiries&&!readOnlyRevenue){
    context.waitUntil(depositNoticeTick(context.env).catch(()=>{}));
    context.waitUntil(guideTick(context.env).catch(()=>{}));
    context.waitUntil(parkingAdminSMSTick(context.env).catch(()=>{}));
    context.waitUntil(hostRenewalTick(context.env).catch(()=>{}));   // 입점 공간 무료 등록 종료 30일·7일 전 안내 (15분에 한 번 확인)
    context.waitUntil(indexNowTick(context.env,context.request).catch(()=>{}));   // sitemap.xml 이 바뀌면 네이버·빙에 새 주소 알림 (10분에 한 번만 확인)
  }
  return response;
}
