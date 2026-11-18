CREATE TRIGGER IF NOT EXISTS feedback_booking_completed AFTER UPDATE OF status ON bookings
WHEN OLD.status='confirmed' AND NEW.status='completed'
 AND NEW.space_id IN ('megaspot-gundae','megaspot-gundae-2')
 AND NOT EXISTS(SELECT 1 FROM transaction_notifications WHERE kind='booking_feedback' AND booking_code=NEW.booking_code)
 AND NOT EXISTS(SELECT 1 FROM booking_feedback WHERE booking_code=NEW.booking_code AND submitted_at IS NOT NULL)
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,booking_snapshot,occurred_at)
 VALUES('feedback-completed:'||NEW.booking_code,'booking_feedback','customer',NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),json_array(NEW.customer_name,NEW.phone,NEW.space_id,NEW.date),datetime('now'));
END;
