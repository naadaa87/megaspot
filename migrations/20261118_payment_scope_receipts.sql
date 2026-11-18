-- Idempotency ledger for atomically recording a payment scope and cumulative receipt delta.
CREATE TABLE IF NOT EXISTS reservation_payment_receipt_requests (
 booking_code TEXT NOT NULL,
 request_id TEXT NOT NULL,
 status TEXT NOT NULL,
 received_total INTEGER NOT NULL CHECK(received_total>=0 AND received_total<=1000000000),
 added INTEGER NOT NULL CHECK(added>=0),
 note TEXT NOT NULL DEFAULT '',
 payment_revision INTEGER NOT NULL,
 settlement_revision TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(booking_code,request_id)
);
