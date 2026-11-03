// Use the very same calculator and fee bands as the public reception page.
import C from '../../assets/js/reception-calc.js';
import { str } from './_lib.js';

export function receptionAdmin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = value.status || 'pending';
  if (!['pending', 'confirmed', 'cancelled'].includes(status)) return null;
  const q = status === 'confirmed' ? C.quote(value.people,value.format,value.course) : C.selection({...value,course:value.course===undefined?'classic':value.course});
  if (!q || (status === 'confirmed' && !q.ok)) return null;
  return { ...q, status, by: 'admin', note: str(value.note, 500), menuNote: C.data.menuNote,
    summary: q.total == null ? q.summary : `${q.courseName} ${q.people}명 · ${q.formatName} · 메뉴 ${C.won(q.food)} + ${q.feeName} ${C.won(q.fee)}`, tax_pending: true };
}

export function receptionExtra(extras) {
  const rows = (Array.isArray(extras) ? extras : []).filter(x => x.kind === 'reception');
  if (!rows.length) return { amount: 0, reception: null };
  if (rows.length !== 1) return { error: '테이블·박스 케이터링은 견적에 한 번만 추가해 주세요.' };
  const reception = receptionAdmin(rows[0].reception);
  if (!reception || reception.status === 'cancelled' || Number(rows[0].amount) !== reception.total) return { error: '테이블·박스 케이터링의 구성과 금액을 다시 확인해 주세요.' };
  return { amount: reception.total, reception };
}

// Customers may leave the course/format undecided or request more than 300 meals.
// Never accept a submitted price or a customer-supplied confirmed/cancelled status.
export function receptionCustomer(value) {
  const selection = C.selection(value);
  return selection ? { ...selection, by: 'customer', status: 'pending' } : null;
}

export function receptionDocument(data, amount) {
  const selection = C.fromInquiry(data);
  if (!selection) return null;
  const snapshot = C.forDocument(selection);
  snapshot.included = snapshot.status !== 'cancelled' && snapshot.total !== null && Number(data.included_reception_amount) === snapshot.total && amount != null && Number(amount) >= snapshot.total;
  return snapshot;
}
export function receptionChanged(data, next) {
  const previous = C.fromInquiry(data);
  const keys = ['course', 'people', 'format', 'total', 'unitPrice', 'food', 'fee', 'status', 'note'];
  return !previous || keys.some(key => String(previous[key] ?? '') !== String(next[key] ?? ''));
}
export function withoutReceptionItems(items) {
  return items.filter(line => !/^(?:라이트|클래식|프리미엄|시그니처) \d+명 · (?:도시락|박스|테이블 세팅) 케이터링/.test(line));
}

export function receptionRevision(data) { return C.revision(data); }
export function syncReceptionInput(input, data, include) { return C.syncQuote(input, data, include); }
export function receptionConflict(expected, data) {
  return expected !== undefined && (expected === null || !Number.isInteger(Number(expected)) || Number(expected) !== receptionRevision(data));
}
