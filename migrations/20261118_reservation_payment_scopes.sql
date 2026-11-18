-- Preserve the original checklist as an archival source. New scopes never change receipts.
CREATE TABLE IF NOT EXISTS reservation_payment_scopes (
 target_type TEXT NOT NULL CHECK(target_type IN ('booking','inquiry')),
 target_ref TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('unpaid','reservation_paid','venue_paid','food_paid','fully_paid','partial_paid','needs_review')),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(target_type,target_ref)
);
INSERT OR IGNORE INTO reservation_payment_scopes(target_type,target_ref,status,version,updated_at)
SELECT target_type,target_ref,CASE WHEN status='balance_paid' THEN 'needs_review' ELSE status END,version,updated_at FROM reservation_payment_checks;
CREATE TRIGGER IF NOT EXISTS reservation_payment_scope_inherit AFTER INSERT ON bookings WHEN NEW.inquiry_ref IS NOT NULL
BEGIN
 INSERT OR IGNORE INTO reservation_payment_scopes(target_type,target_ref,status,version,updated_at)
 SELECT 'booking',NEW.booking_code,status,1,updated_at FROM reservation_payment_scopes WHERE target_type='inquiry' AND target_ref=NEW.inquiry_ref;
END;
