// 모든 /api 요청 앞에서 한 번 실행됩니다. 데이터베이스에 필요한 표가 없으면 만들어 둡니다 (이미 있으면 그대로).
import {depositNoticeTick} from './_deposit_notifications.js';
import { ensureSchema } from './_lib.js';
export async function onRequest(context) {
  try { await ensureSchema(context.env); } catch {}
  const response=await context.next();
  if(typeof context.waitUntil==='function'&&!new URL(context.request.url).pathname.startsWith('/api/deposit-notifications/'))context.waitUntil(depositNoticeTick(context.env).catch(()=>{}));
  return response;
}
