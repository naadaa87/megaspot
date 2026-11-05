// Use the very same calculator and fee bands as the public reception page.
import C from '../../assets/js/reception-calc.js';
import { str } from './_lib.js';

export function receptionAdmin(value,data,previous) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const calc=data?C.create(data):C;
  const status = value.status || 'pending';
  if (!['pending', 'confirmed', 'cancelled'].includes(status)) return null;
  if(calc.isActive(value.course)&&!calc.compatible(value.course,value.format)){
    // Existing mixed-format quotes retain their agreed amount, but cannot be newly constructed.
    if(previous&&previous.course===value.course&&previous.format===value.format&&(status==='cancelled'||Number(previous.people)===Number(value.people))){const preferences=calc.selection(value);if(!preferences)return null;return {...previous,menu_ids:preferences.menu_ids,menuNames:preferences.menuNames,budget_per_person:preferences.budget_per_person,request_note:preferences.request_note,status,by:'admin',note:str(value.note,500)};}
    return null;
  }
  const q = status === 'confirmed' ? calc.quote(value.people,value.format,value.course) : calc.selection({...value,course:value.course===undefined?'classic':value.course});
  if (!q || (status === 'confirmed' && !q.ok)) return null;
  const selected=calc.selection(value);if(String(q.course).startsWith('cf-')&&!selected)return null;
  return { ...q, ...(selected&&String(q.course).startsWith('cf-')?{menu_ids:selected.menu_ids,menuNames:selected.menuNames,budget_per_person:selected.budget_per_person,request_note:selected.request_note,provider:selected.provider,providerName:selected.providerName,catalog_version:selected.catalog_version}:{}), status, by: 'admin', note: str(value.note, 500), menuNote: selected?.menuNote||calc.data.menuNote,
    summary: q.total == null ? q.summary : `${q.courseName} ${q.people}명 · ${q.formatName} · 메뉴 ${calc.won(q.food)} + ${q.feeName} ${calc.won(q.fee)}`, tax_pending: false };
}

export function receptionExtra(extras,data,previous) {
  const rows = (Array.isArray(extras) ? extras : []).filter(x => x.kind === 'reception');
  if (!rows.length) return { amount: 0, reception: null };
  if (rows.length !== 1) return { error: '테이블·박스 케이터링은 견적에 한 번만 추가해 주세요.' };
  const raw=rows[0].reception,saved=previous?.reception,preserve=saved&&raw&&['course','people','format','status','note','vat_excluded','supply','vat','provider','menu_ids','budget_per_person','request_note'].every(k=>String(raw[k]??(k==='vat_excluded'?false:''))===String(saved[k]??(k==='vat_excluded'?false:'')))&&Number(rows[0].amount)===Number(saved.total);
  const reception = preserve?{...saved,...C.forDocument(saved)}:receptionAdmin(raw,data,saved);
  if (!reception || reception.status === 'cancelled' || Number(rows[0].amount) !== reception.total) return { error: '테이블·박스 케이터링의 구성과 금액을 다시 확인해 주세요.' };
  return { amount: reception.total, reception };
}

// Customers may leave the course/format undecided or request more than 300 meals.
// Never accept a submitted price or a customer-supplied confirmed/cancelled status.
export function receptionCustomer(value,data) {
  const calc=data?C.create(data):C;
  if(calc.data.activeCatalog&&value&&value.course!=='all'&&(!calc.isActive(value.course)||!calc.compatible(value.course,value.format)))return null;
  const selection = calc.selection(value&&value.course==='all'?{...value,course:'cf-custom'}:value);
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
  const keys = ['course', 'people', 'format', 'total', 'unitPrice', 'food', 'fee', 'supply', 'vat', 'vat_excluded', 'status', 'note', 'provider', 'menu_ids', 'budget_per_person', 'request_note'];
  return !previous || keys.some(key => String(previous[key] ?? '') !== String(next[key] ?? ''));
}
export function withoutReceptionItems(items) {
  return items.filter(line => !/^(?:예산 기준 · )?1인 예산 [\d,]+원 \d+명 · (?:다과박스|샌드위치 도시락|퓨전 도시락)/.test(line) && !/^(?:라이트|클래식|프리미엄|시그니처) \d+명 · (?:도시락|박스|테이블 세팅) 케이터링/.test(line));
}

export function receptionRevision(data) { return C.revision(data); }
export function syncReceptionInput(input, data, include) { return C.syncQuote(input, data, include); }
export function receptionConflict(expected, data) {
  return expected !== undefined && (expected === null || !Number.isInteger(Number(expected)) || Number(expected) !== receptionRevision(data));
}
