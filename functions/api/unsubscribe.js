// 광고성 메시지 수신거부 — /unsubscribe/?m=회원번호&k=확인값 화면이 부릅니다 (2026-11-14)
//  링크의 확인값은 서버 비밀값으로 서명한 값이라, 링크를 받은 회원만 자기 수신 동의를 끌 수 있습니다. 로그인 없이 바로 처리합니다.
import { json, err, hasDb, readJson, now, log, sameOrigin, clientIp, tooMany, hit } from './_lib.js';
import { unsubOk } from './_membercrm.js';

export async function onRequestPost({ request, env }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  if (!sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'ORIGIN');
  const key = 'unsub:' + clientIp(request); if (await tooMany(env, key, 20, 10)) return err('잠시 후 다시 시도해 주세요.', 429, 'TOO_MANY');
  const d = await readJson(request), id = Number(d.m);
  if (!Number.isInteger(id) || id <= 0 || !(await unsubOk(env, id, d.k))) { await hit(env, key, 10); return err('수신거부 링크가 올바르지 않습니다. 받은 메시지의 링크를 다시 눌러 주세요.', 400, 'BAD_LINK'); }
  const m = await env.DB.prepare('SELECT id, agree_marketing FROM members WHERE id = ?').bind(id).first();
  if (!m) return err('회원 정보를 찾을 수 없습니다.', 404, 'NOT_FOUND');
  if (d.check) return json({ ok: true, subscribed: !!m.agree_marketing });
  if (m.agree_marketing) {
    const t = now();
    await env.DB.prepare('UPDATE members SET agree_marketing = 0, updated_at = ? WHERE id = ?').bind(t, id).run();
    await env.DB.prepare('INSERT INTO member_consent_log (member_id, value, source, created_at) VALUES (?,?,?,?)').bind(id, 0, 'unsubscribe_link', t).run();
    await log(env, 'member.unsubscribed', String(id), 'member', { via: 'link' });
  }
  return json({ ok: true, subscribed: false, at: now() });
}
export function onRequestGet() { return err('지원하지 않는 요청입니다.', 405, 'METHOD'); }
