// 예약확정서 — 관리자가 발급한 확정서 내용(bookings.confirm_doc)을 정리하고, 고객용 링크 토큰을 만듭니다.
// 고객 화면(/confirm/)은 링크의 토큰(k) 또는 예약번호 + 휴대폰 뒷 4자리로만 열 수 있습니다.
import { str, num } from './_lib.js';

const enc = new TextEncoder();
export const PAY_STATUS = ['paid', 'deposit', 'onsite', 'pending'];   // 결제 완료 · 예약금 입금 · 현장 결제 · 결제 안내 예정
export const SPACES = {
  'megaspot-gundae': { name: '메가스팟 건대 1호', address: '서울특별시 광진구 화양동 10-1 한아름건물 2층', sub: '190평 개방형 홀 · 최대 200명 · 건대입구역 인근' },
  'megaspot-gundae-2': { name: '메가스팟 건대 2호', address: '서울특별시 광진구 화양동 10-1 한아름건물 2층 (1호 옆 호실)', sub: '400평 개방형 홀 · 최대 350명 · 건대입구역 인근 · 2026년 11월 13일 오픈' }
};

function b64url(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// 링크 토큰: 서버 비밀값(CONFIRM_SECRET, 없으면 ADMIN_KEY)으로 서명한 값의 앞 22자
// 예약확정서는 'confirm:예약번호', 모임 관리 링크는 'meetup:모임번호'를 서명합니다.
export async function hmacToken(env, msg) {
  const secret = String((env && (env.CONFIRM_SECRET || env.ADMIN_KEY)) || '');
  if (!secret || !msg) return '';
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return b64url(sig).slice(0, 22);
}
export async function confirmToken(env, code) { return code ? hmacToken(env, 'confirm:' + code) : ''; }
export function tokenEq(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export function maskPhone(p) {
  const x = String(p || '').replace(/\D/g, '');
  if (x.length < 8) return x ? '***' + x.slice(-2) : '';
  return x.slice(0, 3) + '-****-' + x.slice(-4);
}
const amt = v => { if (v === '' || v == null) return null; const n = num(v); return n !== null && n >= 0 && n <= 1e9 ? n : null; };

// 관리자 화면에서 보낸 확정서 설정값을 정리합니다 (모르는 값은 버림)
export function cleanDoc(d) {
  d = d && typeof d === 'object' ? d : {};
  const lines = (v, n, max) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => str(x, max)).filter(Boolean).slice(0, n);
  const refund = (Array.isArray(d.refund) ? d.refund : []).slice(0, 8).map(r => ({ k: str(r && r.k, 40), rate: Math.max(0, Math.min(1, Number(r && r.rate) || 0)) })).filter(r => r.k);
  return {
    customer: str(d.customer, 80), event: str(d.event, 80), time_note: str(d.time_note, 80),
    show_amount: d.show_amount !== false, amount: amt(d.amount), amount_note: str(d.amount_note, 40) || '부가세 포함',
    pay_status: PAY_STATUS.includes(d.pay_status) ? d.pay_status : 'paid', paid: amt(d.paid), deposit: amt(d.deposit),
    items: lines(d.items, 12, 90), refund, note: str(d.note, 500)
  };
}
export function parseDoc(raw) { if (!raw) return null; try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : null; } catch { return null; } }

// 고객 화면·확정서 그림에 쓰는 값 (연락처는 가운데를 가립니다)
export function publicDoc(row, doc) {
  const sp = SPACES[row.space_id] || { name: row.space_id || '메가스팟', address: '', sub: '' };
  const d = doc || {};
  return {
    code: row.booking_code, status: row.status, issued_at: d.issued_at || '', updated_at: d.updated_at || '', issue_no: d.issue_no || 0,
    customer: d.customer || row.customer_name || '', phone: maskPhone(row.phone),
    space: sp, date: row.date, start_h: row.start_h ?? null, end_h: row.end_h ?? null, slot: row.slot || '', headcount: row.headcount ?? null,
    event: d.event || '', time_note: d.time_note || '', show_amount: d.show_amount !== false, amount: d.amount ?? null, amount_note: d.amount_note || '부가세 포함',
    pay_status: d.pay_status || 'paid', paid: d.paid ?? null, deposit: d.deposit ?? null, items: d.items || [], refund: d.refund || [], note: d.note || ''
  };
}
