// 관리 금액은 견적서·결제 내역과 구분합니다. null(미정)과 0원도 명시적인 수정입니다.
const total = i => `json_extract(${i}.data, '$.total')`;
// 이전 버전에서 수정한 금액도 변경 기록으로 식별합니다. 직접 등록한 최초 금액은
// 견적보다 우선하지 않고, 관리자가 이후에 수정·삭제한 금액만 우선합니다.
export function amountOverrideSql(i = 'i') {
  return `COALESCE(json_extract(${i}.data, '$.amount_override'), EXISTS (
    SELECT 1 FROM event_log l WHERE l.ref = ${i}.ref
      AND l.id > COALESCE((SELECT MAX(c.id) FROM event_log c WHERE c.ref = ${i}.ref AND c.kind = 'inquiry.confirmed'), 0) AND (
      (l.kind = 'inquiry.updated' AND json_type(l.detail, '$.total') IS NOT NULL) OR
      (l.kind = 'inquiry.edited' AND EXISTS (
        SELECT 1 FROM json_each(l.detail, '$.changed') WHERE value = '금액'))))) = 1`;
}
const quote = ref => `(SELECT q.total FROM quotes q WHERE q.inquiry_ref = ${ref} ORDER BY q.id DESC LIMIT 1)`;
const order = code => `(SELECT o.price FROM orders o WHERE o.booking_code = ${code} AND o.status <> 'failed' ORDER BY o.id DESC LIMIT 1)`;

export function inquiryAmountSql(i = 'i') {
  return `CASE WHEN ${amountOverrideSql(i)} THEN ${total(i)} ELSE COALESCE(
    (SELECT b.amount FROM bookings b WHERE b.inquiry_ref = ${i}.ref AND b.status <> 'cancelled' ORDER BY b.id DESC LIMIT 1),
    (SELECT ${order('b.booking_code')} FROM bookings b WHERE b.inquiry_ref = ${i}.ref AND b.status <> 'cancelled' ORDER BY b.id DESC LIMIT 1),
    ${quote(`${i}.ref`)}, ${total(i)}) END`;
}

export function bookingAmountSql(b = 'b') {
  return `(SELECT CASE WHEN ${amountOverrideSql('i')} THEN ${total('i')} ELSE COALESCE(
    ${b}.amount, ${order(`${b}.booking_code`)}, ${quote(`${b}.inquiry_ref`)}, ${total('i')}) END
    FROM (SELECT 1) LEFT JOIN inquiries i ON i.ref = ${b}.inquiry_ref)`;
}
