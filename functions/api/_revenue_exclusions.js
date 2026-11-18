// These November 2026 reservations were identified as tests by the operator.
// Keep their original reservations, receipts and refunds intact; only reports omit them.
function testBookingSql(alias) {
  const edgeWhitespace='char(9)||char(10)||char(11)||char(12)||char(13)||char(32)||char(160)||char(12288)||char(65279)';
  return `(COALESCE(${alias}.date,'') BETWEEN '2026-11-01' AND '2026-11-30'
    AND trim(COALESCE(${alias}.customer_name,''),${edgeWhitespace}) IN ('최준원','최시준'))`;
}

export const revenueBookingIncludedSql=(alias='b')=>`NOT ${testBookingSql(alias)}`;

// Payments made before confirmation can retain only an inquiry reference. Match
// its event/space when available, and preserve receipts ambiguous with a real sibling.
// An explicit booking link takes precedence at the call site.
export function revenueInquiryIncludedSql({ref='i.ref',date='i.event_date',space='i.space_id'}={}) {
  const matches=alias=>`${alias}.inquiry_ref=${ref}
    AND (${date} IS NULL OR ${alias}.date=${date})
    AND (${space} IS NULL OR ${alias}.space_id=${space})`;
  return `NOT (EXISTS (SELECT 1 FROM bookings revenue_test
    WHERE ${matches('revenue_test')} AND ${testBookingSql('revenue_test')})
    AND NOT EXISTS (SELECT 1 FROM bookings revenue_real
      WHERE ${matches('revenue_real')} AND ${revenueBookingIncludedSql('revenue_real')}))`;
}
