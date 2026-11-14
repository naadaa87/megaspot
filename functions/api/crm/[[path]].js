// 관리자 '회원 관리' API (관리자 로그인 필요 · 2026-11-14)
//   GET  /api/crm/members?q=&status=&mkt=&host=&from=&to=&act=&tag=&sort=&page=&size=     GET /api/crm/members/<번호>
//   PUT  /api/crm/members/<번호>/note {memo, tags}      PUT /api/crm/members/<번호>/consent {value}
//   GET  /api/crm/export?(같은 조건)                      — 엑셀(CSV) 내려받기, 내려받은 기록을 남깁니다
//   GET  /api/crm/settings · PUT /api/crm/settings · POST /api/crm/settings/kakao-check
//   POST /api/crm/preview · POST /api/crm/test · POST /api/crm/recipients (메일 프로그램용 주소) · POST /api/crm/campaigns · POST /api/crm/campaigns/<MC-…>/(send|stop)
//   GET  /api/crm/campaigns · GET /api/crm/campaigns/<MC-…>
// 이용 제한·임시 비밀번호 발급은 기존 /api/admin/members/* 를 그대로 씁니다.
import { json, err, hasDb, readJson, now, log, requireAdmin, sameOrigin } from '../_lib.js';
import { CHANNELS, PURPOSES, MEMBER_TAGS, MEMBER_TEMPLATE, listMembers, memberDetail, saveNote, setConsent, exportMembers, msgConfig, saveConfig, channelState, checkKakao,
  previewCampaign, createCampaign, recipientEmails, sendBatch, stopCampaign, testSend, campaignList, campaignTargets } from '../_membercrm.js';

const filters = q => Object.fromEntries(['q', 'status', 'mkt', 'host', 'from', 'to', 'act', 'tag', 'sort', 'page', 'size'].map(k => [k, q.get(k) || '']));
const fail = r => err(r.error, r.status || 400, r.code || 'ERR');

export async function onRequest({ request, env, params }) {
  if (!hasDb(env)) return err('데이터베이스가 연결되어 있지 않습니다.', 503, 'NO_DB');
  const denied = await requireAdmin(request, env); if (denied) return denied;
  const path = (params.path || []).join('/'), method = request.method, url = new URL(request.url);
  if (method !== 'GET' && !sameOrigin(request)) return err('허용되지 않은 요청입니다.', 403, 'ORIGIN');
  try {
    if (path === 'members' && method === 'GET') return json(await listMembers(env, filters(url.searchParams)));
    let m = path.match(/^members\/(\d{1,9})(?:\/(note|consent))?$/);
    if (m) {
      const id = +m[1];
      if (!m[2] && method === 'GET') { const d = await memberDetail(env, id); return d ? json({ ok: true, ...d, tags: MEMBER_TAGS }) : err('회원을 찾을 수 없습니다.', 404, 'NOT_FOUND'); }
      if (!(await env.DB.prepare('SELECT 1 AS x FROM members WHERE id = ?').bind(id).first())) return err('회원을 찾을 수 없습니다.', 404, 'NOT_FOUND');
      if (m[2] === 'note' && method === 'PUT') return json(await saveNote(env, id, await readJson(request)));
      if (m[2] === 'consent' && method === 'PUT') { const d = await readJson(request); await log(env, 'member.consent', String(id), 'admin', { value: !!d.value }); return json(await setConsent(env, id, !!d.value, 'admin')); }
    }
    if (path === 'export' && method === 'GET') {
      const r = await exportMembers(env, filters(url.searchParams));
      await log(env, 'member.export', '', 'admin', { count: r.count, filters: filters(url.searchParams) });
      return new Response(r.csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="megaspot-members-${now().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
    }
    if (path === 'settings' && method === 'GET') return json({ ok: true, config: await msgConfig(env), channels: await channelState(env), template: MEMBER_TEMPLATE, labels: { channels: CHANNELS, purposes: PURPOSES } });
    if (path === 'settings' && method === 'PUT') { const r = await saveConfig(env, await readJson(request)); return r.error ? fail(r) : json(r); }
    if (path === 'settings/kakao-check' && method === 'POST') return json({ ok: true, ...(await checkKakao(env)) });
    if (path === 'preview' && method === 'POST') { const r = await previewCampaign(env, await readJson(request, 256 * 1024)); return r.error ? fail(r) : json(r); }
    if (path === 'recipients' && method === 'POST') { const r = await recipientEmails(env, await readJson(request, 256 * 1024)); return r.error ? fail(r) : json(r); }
    if (path === 'test' && method === 'POST') { const r = await testSend(env, await readJson(request)); return r.error ? fail(r) : json(r); }
    if (path === 'campaigns' && method === 'POST') { const r = await createCampaign(env, await readJson(request, 256 * 1024)); return r.error ? fail(r) : json(r); }
    if (path === 'campaigns' && method === 'GET') return json({ ok: true, items: await campaignList(env) });
    m = path.match(/^campaigns\/(MC-\d{4}-[A-Z0-9]{4})(?:\/(send|stop))?$/);
    if (m) {
      if (!m[2] && method === 'GET') { const t = await campaignTargets(env, m[1]); return t ? json({ ok: true, items: t }) : err('보낸 기록을 찾을 수 없습니다.', 404, 'NOT_FOUND'); }
      if (m[2] === 'send' && method === 'POST') { const r = await sendBatch(env, m[1]); return r.error ? fail(r) : json(r); }
      if (m[2] === 'stop' && method === 'POST') { const r = await stopCampaign(env, m[1]); return r.error ? fail(r) : json(r); }
    }
    return err('지원하지 않는 요청입니다.', 404, 'NOT_FOUND');
  } catch (e) {
    if (e && /요청이 너무 큽니다|잘못된 요청 형식/.test(e.message || '')) return err(e.message);
    console.error('crm', e && e.message); return err('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500, 'SERVER');
  }
}
