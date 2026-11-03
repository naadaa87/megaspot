// Use the very same calculator and fee bands as the public reception page.
import C from '../../assets/js/reception-calc.js';
import { str } from './_lib.js';

export function receptionAdmin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const q = C.quote(value.people, value.format, value.course);
  if (!q.ok) return null;
  const status = value.status || 'pending';
  if (!['pending', 'confirmed', 'cancelled'].includes(status)) return null;
  return { ...q, status, by: 'admin', note: str(value.note, 500), menuNote: C.data.menuNote,
    summary: `${q.courseName} ${q.people}명 · ${q.formatName} · 메뉴 ${C.won(q.food)} + ${q.feeName} ${C.won(q.fee)}`, tax_pending: true };
}

export function receptionExtra(extras) {
  const rows = (Array.isArray(extras) ? extras : []).filter(x => x.kind === 'reception');
  if (!rows.length) return { amount: 0, reception: null };
  if (rows.length !== 1) return { error: '테이블·박스 케이터링은 견적에 한 번만 추가해 주세요.' };
  const reception = receptionAdmin(rows[0].reception);
  if (!reception || reception.status === 'cancelled' || Number(rows[0].amount) !== reception.total) return { error: '테이블·박스 케이터링의 구성과 금액을 다시 확인해 주세요.' };
  return { amount: reception.total, reception };
}
