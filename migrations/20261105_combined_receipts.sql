-- One bank receipt, split into rental income and a separately refundable deposit.
CREATE TABLE IF NOT EXISTS booking_combined_receipts (
 booking_code TEXT NOT NULL,
 request_id TEXT NOT NULL,
 total INTEGER NOT NULL CHECK(total>0),
 fee INTEGER NOT NULL CHECK(fee>0),
 deposit INTEGER NOT NULL CHECK(deposit>0 AND total=fee+deposit),
 note TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(booking_code,request_id)
);

DROP TRIGGER IF EXISTS booking_deposit_review;
CREATE TRIGGER IF NOT EXISTS booking_deposit_review AFTER UPDATE OF customer_name,phone,space_id,date,start_h,end_h,slot,confirm_doc ON bookings
WHEN NEW.customer_name IS NOT OLD.customer_name OR NEW.phone IS NOT OLD.phone OR NEW.space_id IS NOT OLD.space_id
 OR NEW.date IS NOT OLD.date OR NEW.start_h IS NOT OLD.start_h OR NEW.end_h IS NOT OLD.end_h
 OR ((NEW.start_h IS NULL OR NEW.end_h IS NULL) AND NEW.slot IS NOT OLD.slot)
 OR COALESCE((SELECT amount FROM booking_refunds WHERE booking_code=NEW.booking_code),json_extract(NEW.confirm_doc,'$.deposit'),(SELECT json_extract(data,'$.deposit') FROM quotes WHERE inquiry_ref=NEW.inquiry_ref ORDER BY id DESC LIMIT 1),150000) IS NOT COALESCE((SELECT amount FROM booking_refunds WHERE booking_code=OLD.booking_code),json_extract(OLD.confirm_doc,'$.deposit'),(SELECT json_extract(data,'$.deposit') FROM quotes WHERE inquiry_ref=OLD.inquiry_ref ORDER BY id DESC LIMIT 1),150000)
BEGIN
 UPDATE deposit_notifications SET status='review',error='예약 변경 · 최신 내용 확인 후 재안내가 필요합니다.',updated_at=datetime('now')
 WHERE booking_code=NEW.booking_code AND mode='live' AND kind IN ('payment','account') AND status IN ('queued','review')
 AND request_id IS NULL AND provider_mid IS NULL;
END;
