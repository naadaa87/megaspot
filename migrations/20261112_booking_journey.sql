-- Existing bookings are baselines; installation never sends old confirmation/paid notices.
CREATE TABLE IF NOT EXISTS booking_payment_schedule (
 booking_code TEXT PRIMARY KEY,
 due_date TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_journey_state (
 booking_code TEXT PRIMARY KEY,
 confirm_version INTEGER NOT NULL DEFAULT 0,
 confirmed_at TEXT,
 amount_visible INTEGER NOT NULL DEFAULT 1,
 paid_state INTEGER NOT NULL DEFAULT 1,
 paid_cycle INTEGER NOT NULL DEFAULT 0,
 checked_at TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO booking_journey_state(booking_code,confirmed_at,amount_visible)
 SELECT booking_code,created_at,CASE WHEN json_valid(confirm_doc) THEN COALESCE(json_extract(confirm_doc,'$.show_amount'),1) ELSE 1 END FROM bookings;
CREATE TRIGGER IF NOT EXISTS journey_booking_created AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO booking_journey_state(booking_code,confirm_version,confirmed_at,paid_state)
 VALUES(NEW.booking_code,CASE WHEN NEW.status='confirmed' THEN 1 ELSE 0 END,datetime('now','+9 hours'),0);
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at)
 SELECT 'journey-confirm:'||NEW.booking_code||':1','booking_confirmed','customer',NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),datetime('now')
 WHERE NEW.status='confirmed' AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='booking_journey'),0)=1;
END;
CREATE TRIGGER IF NOT EXISTS journey_booking_confirmed AFTER UPDATE OF status ON bookings
WHEN NEW.status='confirmed' AND OLD.status<>'confirmed' BEGIN
 UPDATE booking_journey_state SET confirm_version=confirm_version+1,confirmed_at=datetime('now','+9 hours'),paid_state=0 WHERE booking_code=NEW.booking_code;
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at)
 SELECT 'journey-confirm:'||NEW.booking_code||':'||confirm_version,'booking_confirmed','customer',NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),datetime('now')
 FROM booking_journey_state WHERE booking_code=NEW.booking_code AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='booking_journey'),0)=1;
END;

CREATE TRIGGER IF NOT EXISTS journey_amount_visibility AFTER UPDATE OF confirm_doc ON bookings
WHEN json_valid(NEW.confirm_doc) OR json_valid(OLD.confirm_doc) BEGIN
 UPDATE booking_journey_state SET amount_visible=CASE WHEN json_valid(NEW.confirm_doc) THEN COALESCE(json_extract(NEW.confirm_doc,'$.show_amount'),1) ELSE COALESCE(json_extract(OLD.confirm_doc,'$.show_amount'),1) END WHERE booking_code=NEW.booking_code;
END;
