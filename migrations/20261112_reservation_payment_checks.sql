-- Independent operator checklist; never writes payment amounts or sends notifications.
CREATE TABLE IF NOT EXISTS reservation_payment_checks (
 target_type TEXT NOT NULL CHECK(target_type IN ('booking','inquiry')),
 target_ref TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('unpaid','reservation_paid','balance_paid','fully_paid')),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(target_type,target_ref)
);
CREATE TRIGGER IF NOT EXISTS reservation_payment_inherit AFTER INSERT ON bookings WHEN NEW.inquiry_ref IS NOT NULL
BEGIN
 INSERT OR IGNORE INTO reservation_payment_checks(target_type,target_ref,status,version,updated_at)
 SELECT 'booking',NEW.booking_code,status,1,updated_at FROM reservation_payment_checks WHERE target_type='inquiry' AND target_ref=NEW.inquiry_ref;
END;
