// 모든 /api 요청 앞에서 한 번 실행됩니다. 데이터베이스에 필요한 표가 없으면 만들어 둡니다 (이미 있으면 그대로).
import {depositNoticeTick} from './_deposit_notifications.js';
import {parkingAdminSMSTick} from './_parking_admin_alerts.js';
import {guideTick} from './_guide_messages.js';
import { ensureSchema } from './_lib.js';
export async function onRequest(context) {
  try { await ensureSchema(context.env); } catch {}
  const response=await context.next();
  const path=new URL(context.request.url).pathname;
  const readOnlyPortal=/^\/api\/pay\/availability\/?$/.test(path)||/^\/api\/reservation-calendar\/?$/.test(path)||path.startsWith('/api/booking-portal/')||/^\/api\/admin\/bookings\/[^/]+\/portal-link/.test(path)||/^\/api\/admin\/guide-messages\/(portal-preview|portal-test|portal-template|portal-check-template)$/.test(path);
  const readOnlyReadiness=/^\/api\/admin\/booking-readiness\/?$/.test(path);
  if(typeof context.waitUntil==='function'&&!path.startsWith('/api/deposit-notifications/')&&!readOnlyPortal&&!readOnlyReadiness){
    context.waitUntil(depositNoticeTick(context.env).catch(()=>{}));
    context.waitUntil(guideTick(context.env).catch(()=>{}));
    context.waitUntil(parkingAdminSMSTick(context.env).catch(()=>{}));
  }
  return response;
}
