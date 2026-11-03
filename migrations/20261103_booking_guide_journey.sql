-- Existing reservations get a baseline only. Installing this migration never queues a send.
CREATE TABLE IF NOT EXISTS booking_guide_state (
 booking_code TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0,
 manual_sent TEXT,
 manual_revision INTEGER NOT NULL DEFAULT 0,
 needs_review INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO booking_guide_state(booking_code,manual_sent)
 SELECT b.booking_code,CASE WHEN NOT EXISTS (
  SELECT 1 FROM booking_guide_messages m JOIN bookings other ON other.booking_code=m.booking_code
  WHERE other.inquiry_ref=b.inquiry_ref AND m.mode='live' AND m.purpose='reservation-guide-v1' AND m.status='delivered'
 ) THEN NULLIF(CAST(json_extract(ic.checks,'$.guide_sent') AS TEXT),'0') END
 FROM bookings b LEFT JOIN inquiry_checks ic ON ic.ref=b.inquiry_ref;
CREATE TABLE IF NOT EXISTS booking_guide_events (
 booking_code TEXT NOT NULL,
 revision INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','handled','cancelled')),
 message_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(booking_code,revision)
);
CREATE INDEX IF NOT EXISTS guide_events_pending ON booking_guide_events(status,created_at);
CREATE TABLE IF NOT EXISTS booking_guide_lease(name TEXT PRIMARY KEY,until_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS guide_booking_created AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO booking_guide_state(booking_code,manual_sent)
 SELECT NEW.booking_code,CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE inquiry_ref=NEW.inquiry_ref AND booking_code<>NEW.booking_code)
 THEN NULLIF(CAST((SELECT json_extract(checks,'$.guide_sent') FROM inquiry_checks WHERE ref=NEW.inquiry_ref) AS TEXT),'0') END;
 INSERT OR IGNORE INTO booking_guide_events(booking_code,revision)
 SELECT NEW.booking_code,0 WHERE NEW.status='confirmed'
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='reservation_guide'),0)=1
 AND COALESCE((SELECT json_extract(value,'$.automatic') FROM settings WHERE key='reservation_guide'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS guide_booking_changed AFTER UPDATE OF customer_name,phone,space_id,date,start_h,end_h,slot ON bookings
WHEN NEW.customer_name IS NOT OLD.customer_name OR NEW.phone IS NOT OLD.phone OR NEW.space_id IS NOT OLD.space_id
 OR NEW.date IS NOT OLD.date OR NEW.start_h IS NOT OLD.start_h OR NEW.end_h IS NOT OLD.end_h
 OR ((NEW.start_h IS NULL OR NEW.end_h IS NULL) AND NEW.slot IS NOT OLD.slot)
BEGIN
 UPDATE booking_guide_state SET revision=revision+1,needs_review=1 WHERE booking_code=NEW.booking_code;
 UPDATE booking_guide_events SET status='cancelled' WHERE booking_code=NEW.booking_code AND status='pending';
 UPDATE booking_guide_messages SET status='cancelled',error='예약 변경 · 최신 내용으로 다시 미리보기해 주세요.',updated_at=datetime('now')
 WHERE booking_code=NEW.booking_code AND mode='live' AND status='queued'
 AND (purpose='reservation-guide-v1' OR purpose GLOB 'reservation-guide-v1:r[0-9]*');
END;
CREATE TRIGGER IF NOT EXISTS guide_booking_status AFTER UPDATE OF status ON bookings WHEN NEW.status IS NOT OLD.status BEGIN
 UPDATE booking_guide_events SET status='cancelled' WHERE booking_code=NEW.booking_code AND status='pending' AND NEW.status<>'confirmed';
 UPDATE booking_guide_messages SET status='cancelled',error='확정 예약이 아니므로 발송을 중지했습니다.',updated_at=datetime('now')
 WHERE booking_code=NEW.booking_code AND mode='live' AND status='queued' AND NEW.status<>'confirmed'
 AND (purpose='reservation-guide-v1' OR purpose GLOB 'reservation-guide-v1:r[0-9]*');
 INSERT INTO booking_guide_events(booking_code,revision)
 SELECT booking_code,revision FROM booking_guide_state WHERE booking_code=NEW.booking_code AND NEW.status='confirmed' AND needs_review=0
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='reservation_guide'),0)=1
 AND COALESCE((SELECT json_extract(value,'$.automatic') FROM settings WHERE key='reservation_guide'),0)=1
 ON CONFLICT(booking_code,revision) DO UPDATE SET status='pending' WHERE booking_guide_events.status='cancelled';
END;
-- A manual inquiry check applies only to bookings present at that moment, at their current revision.
-- A newly added sibling must never inherit an older inquiry check.
CREATE TRIGGER IF NOT EXISTS guide_manual_insert AFTER INSERT ON inquiry_checks
WHEN COALESCE(json_extract(NEW.checks,'$.guide_sent'),0)<>0 BEGIN
 UPDATE booking_guide_state SET manual_sent=CAST(json_extract(NEW.checks,'$.guide_sent') AS TEXT),manual_revision=revision
 WHERE booking_code IN (SELECT booking_code FROM bookings WHERE inquiry_ref=NEW.ref AND status<>'cancelled');
END;
CREATE TRIGGER IF NOT EXISTS guide_manual_update AFTER UPDATE OF checks ON inquiry_checks
WHEN json_extract(NEW.checks,'$.guide_sent') IS NOT json_extract(OLD.checks,'$.guide_sent') BEGIN
 UPDATE booking_guide_state SET manual_sent=NULLIF(CAST(json_extract(NEW.checks,'$.guide_sent') AS TEXT),'0'),manual_revision=revision
 WHERE booking_code IN (SELECT booking_code FROM bookings WHERE inquiry_ref=NEW.ref AND status<>'cancelled');
END;
CREATE TRIGGER IF NOT EXISTS guide_manual_delete AFTER DELETE ON inquiry_checks BEGIN
 UPDATE booking_guide_state SET manual_sent=NULL WHERE booking_code IN (SELECT booking_code FROM bookings WHERE inquiry_ref=OLD.ref);
END;
-- An unsent deposit notice must remain visible after an edit. It is never resent automatically.
CREATE TRIGGER IF NOT EXISTS booking_deposit_review AFTER UPDATE OF customer_name,phone,space_id,date,start_h,end_h,slot,confirm_doc ON bookings
WHEN NEW.customer_name IS NOT OLD.customer_name OR NEW.phone IS NOT OLD.phone OR NEW.space_id IS NOT OLD.space_id
 OR NEW.date IS NOT OLD.date OR NEW.start_h IS NOT OLD.start_h OR NEW.end_h IS NOT OLD.end_h
 OR ((NEW.start_h IS NULL OR NEW.end_h IS NULL) AND NEW.slot IS NOT OLD.slot)
 OR json_extract(NEW.confirm_doc,'$.deposit') IS NOT json_extract(OLD.confirm_doc,'$.deposit')
BEGIN
 UPDATE deposit_notifications SET status='review',error='예약 변경 · 최신 내용 확인 후 재안내가 필요합니다.',updated_at=datetime('now')
 WHERE booking_code=NEW.booking_code AND mode='live' AND kind IN ('payment','account') AND status IN ('queued','review')
 AND request_id IS NULL AND provider_mid IS NULL;
END;
