// 모든 /api 요청 앞에서 한 번 실행됩니다. 데이터베이스에 필요한 표가 없으면 만들어 둡니다 (이미 있으면 그대로).
import { ensureSchema } from './_lib.js';
export async function onRequest(context) {
  try { await ensureSchema(context.env); } catch {}
  return context.next();
}
