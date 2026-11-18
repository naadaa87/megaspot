-- Pending inquiries use a namespaced ledger owner, never a placeholder booking.
-- Confirmation moves ownership in place: entry IDs, timestamps, notes and revenue classification stay intact.
CREATE TABLE IF NOT EXISTS inquiry_payment_owners (
 inquiry_ref TEXT PRIMARY KEY,
 ledger_code TEXT NOT NULL UNIQUE,
 booking_code TEXT UNIQUE,
 created_at TEXT NOT NULL,
 linked_at TEXT
);
CREATE TRIGGER IF NOT EXISTS inquiry_payment_link AFTER INSERT ON bookings WHEN NEW.inquiry_ref IS NOT NULL
BEGIN
 UPDATE booking_payment_entries SET booking_code=NEW.booking_code WHERE booking_code=(SELECT ledger_code FROM inquiry_payment_owners WHERE inquiry_ref=NEW.inquiry_ref AND booking_code IS NULL);
 UPDATE booking_payment_revisions SET booking_code=NEW.booking_code WHERE booking_code=(SELECT ledger_code FROM inquiry_payment_owners WHERE inquiry_ref=NEW.inquiry_ref AND booking_code IS NULL);
 UPDATE reservation_payment_receipt_requests SET booking_code=NEW.booking_code WHERE booking_code=(SELECT ledger_code FROM inquiry_payment_owners WHERE inquiry_ref=NEW.inquiry_ref AND booking_code IS NULL);
 UPDATE orders SET booking_code=NEW.booking_code WHERE inquiry_ref=NEW.inquiry_ref AND booking_code IS NULL AND status IN ('paid','refunded') AND EXISTS(SELECT 1 FROM inquiry_payment_owners WHERE inquiry_ref=NEW.inquiry_ref AND booking_code IS NULL);
 UPDATE inquiry_payment_owners SET booking_code=NEW.booking_code,linked_at=datetime('now') WHERE inquiry_ref=NEW.inquiry_ref AND booking_code IS NULL;
 INSERT INTO reservation_payment_scopes_v2(target_type,target_ref,status,version,updated_at) SELECT 'booking',NEW.booking_code,CASE WHEN p.status IN ('fully_paid','venue_fully_paid') AND (NEW.amount IS NULL OR ((SELECT COALESCE(SUM(CASE WHEN kind='receipt' THEN amount ELSE -amount END),0) FROM booking_payment_current WHERE booking_code=NEW.booking_code AND state='active')+(SELECT COALESCE(SUM(o.price-CASE WHEN o.status='refunded' THEN o.price ELSE MIN(o.price,COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0)) END),0) FROM orders o WHERE o.booking_code=NEW.booking_code AND o.test=0 AND o.status IN ('paid','refunded')))<NEW.amount) THEN 'needs_review' ELSE p.status END,1,p.updated_at FROM reservation_payment_scopes_v2 p JOIN inquiry_payment_owners ip ON ip.inquiry_ref=p.target_ref AND ip.booking_code=NEW.booking_code WHERE p.target_type='inquiry' AND p.target_ref=NEW.inquiry_ref ON CONFLICT(target_type,target_ref) DO UPDATE SET status=excluded.status,version=CASE WHEN reservation_payment_scopes_v2.status<>excluded.status THEN reservation_payment_scopes_v2.version+1 ELSE reservation_payment_scopes_v2.version END;
 INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'inquiry.payment.linked',NEW.inquiry_ref,'admin',json_object('booking_code',NEW.booking_code),datetime('now') WHERE EXISTS(SELECT 1 FROM inquiry_payment_owners WHERE inquiry_ref=NEW.inquiry_ref AND booking_code=NEW.booking_code) AND EXISTS(SELECT 1 FROM booking_payment_entries WHERE booking_code=NEW.booking_code);
END;
