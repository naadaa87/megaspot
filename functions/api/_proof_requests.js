// 증빙 요청 — 세금계산서 · 현금영수증 · 카드 영수증 · 견적서·거래명세서 (2026-11-25)
// 고객은 나의 예약확인에서 요청하고, 관리자 '증빙 요청' 메뉴에서 처리 완료로 바꿉니다.
// 예약·결제 자료는 읽기만 하고, 요청은 proof_requests 표에만 저장합니다.
import { json, err, str, now, uniqueRef, log, readJson } from './_lib.js';
import { SPACES } from './_confirm.js';

export const KINDS = { tax_invoice: '세금계산서', cash_receipt: '현금영수증', card_slip: '카드 영수증', quote: '견적서·거래명세서', other: '기타 증빙' };
export const STATUS = { requested: '접수', done: '처리 완료', cancelled: '취소' };
const safe = s => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
const bizOk = v => /^\d{3}-?\d{2}-?\d{5}$/.test(v);
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export function publicProof(r) {
  return { ref: r.ref, kind: r.kind, kind_label: KINDS[r.kind] || r.kind, status: r.status, status_label: STATUS[r.status] || r.status, admin_note: r.admin_note || '', created_at: r.created_at, done_at: r.done_at || '' };
}
export async function proofsFor(env, code) {
  try {
    const { results } = await env.DB.prepare('SELECT * FROM proof_requests WHERE booking_code = ? ORDER BY id DESC LIMIT 20').bind(code).all();
    return (results || []).map(publicProof);
  } catch { return []; }
}

// 고객 요청 (열쇠 확인은 부르는 쪽에서)
export async function createProof(env, code, d) {
  const kind = str(d.kind, 20);
  if (!KINDS[kind]) return { error: '필요한 증빙 종류를 골라 주세요.' };
  const data = { biz_no: str(d.biz_no, 20).replace(/[^0-9-]/g, ''), company: str(d.company, 60), ceo: str(d.ceo, 30), email: str(d.email, 120), cash_no: str(d.cash_no, 20).replace(/[^0-9-]/g, ''), note: str(d.note, 500) };
  if (kind === 'tax_invoice') {
    if (!bizOk(data.biz_no)) return { error: '사업자등록번호 10자리를 확인해 주세요.' };
    if (!data.company) return { error: '상호(회사 이름)를 적어 주세요.' };
    if (!emailOk(data.email)) return { error: '세금계산서를 받을 이메일을 확인해 주세요.' };
  }
  if (kind === 'cash_receipt' && !/^\d{10,13}$/.test(data.cash_no.replace(/-/g, ''))) return { error: '현금영수증 받을 휴대폰 번호나 사업자등록번호를 적어 주세요.' };
  if (['card_slip', 'quote', 'other'].includes(kind) && data.email && !emailOk(data.email)) return { error: '받을 이메일을 확인해 주세요.' };
  if (kind === 'other' && !data.note) return { error: '필요한 증빙을 적어 주세요.' };
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM proof_requests WHERE booking_code = ? AND status = 'requested'").bind(code).first();
  if ((open && open.n) >= 5) return { error: '처리 중인 요청이 많습니다. 처리된 뒤 다시 요청하시거나 카카오톡으로 문의해 주세요.' };
  const ref = await uniqueRef(env, 'proof_requests', 'ref', 'PR'), t = now();
  await env.DB.prepare('INSERT INTO proof_requests (ref, booking_code, kind, data, status, created_at) VALUES (?,?,?,?,?,?)').bind(ref, code, kind, JSON.stringify(data), 'requested', t).run();
  await log(env, 'proof.requested', code, 'customer', { ref, kind });
  return { items: await proofsFor(env, code) };
}

// 관리자 API: /api/admin/proof-requests…
export async function proofRequestsAdmin({ request, env, path, method, url }) {
  if (path === 'proof-requests' && method === 'GET') {
    const st = str(url.searchParams.get('status'), 12);
    const where = STATUS[st] ? 'WHERE p.status = ?' : '', bind = STATUS[st] ? [st] : [];
    const { results } = await env.DB.prepare(`SELECT p.*, b.space_id, b.date, b.customer_name FROM proof_requests p LEFT JOIN bookings b ON b.booking_code = p.booking_code ${where} ORDER BY CASE p.status WHEN 'requested' THEN 0 ELSE 1 END, p.id DESC LIMIT 300`).bind(...bind).all();
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM proof_requests WHERE status = 'requested'").first();
    return json({ ok: true, items: (results || []).map(r => ({ id: r.id, ...publicProof(r), booking_code: r.booking_code, space: (SPACES[r.space_id] && SPACES[r.space_id].name) || '', date: r.date || '', customer: r.customer_name || '', data: safe(r.data) })), counts: { requested: (c && c.n) || 0 }, kinds: KINDS, statuses: STATUS });
  }
  const m = path.match(/^proof-requests\/(\d+)$/);
  if (!m) return null;
  if (method !== 'PATCH') return err('허용되지 않은 요청입니다.', 405, 'METHOD');
  const row = await env.DB.prepare('SELECT * FROM proof_requests WHERE id = ?').bind(+m[1]).first();
  if (!row) return err('요청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
  let d; try { d = await readJson(request, 4096); } catch (e) { return err(e.message); }
  const st = str(d.status, 12);
  if (!STATUS[st]) return err('상태 값을 확인해 주세요.');
  const t = now(), note = d.admin_note !== undefined ? str(d.admin_note, 500) : (row.admin_note || '');
  await env.DB.prepare('UPDATE proof_requests SET status = ?, admin_note = ?, updated_at = ?, done_at = ? WHERE id = ?').bind(st, note || null, t, st === 'done' ? t : null, row.id).run();
  await log(env, 'proof.updated', row.booking_code, 'admin', { ref: row.ref, from: row.status, to: st });
  return json({ ok: true });
}
