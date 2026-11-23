CREATE TABLE IF NOT EXISTS food_quote_links (
  quote_no TEXT PRIMARY KEY REFERENCES quotes(quote_no),
  inquiry_ref TEXT NOT NULL REFERENCES inquiries(ref)
);
CREATE INDEX IF NOT EXISTS idx_food_quote_links_inquiry ON food_quote_links(inquiry_ref);
CREATE UNIQUE INDEX IF NOT EXISTS idx_food_inquiry_registration ON inquiries(json_extract(data,'$.food_event.registration_key'))
  WHERE space_id='food-only';

DROP TRIGGER IF EXISTS deposit_notice_booking_insert;
CREATE TRIGGER IF NOT EXISTS deposit_notice_booking_insert AFTER INSERT ON bookings WHEN NEW.space_id<>'food-only' AND NEW.status='confirmed' BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'payment',b.booking_code||':payment',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND (CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END)=0 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.payment') FROM settings WHERE key='deposit_alimtalk'),0)=1;
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'account',b.booking_code||':account',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='booking_journey'),0)=0 AND (CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END)<>0 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.account') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;

DROP TRIGGER IF EXISTS deposit_notice_booking_confirm;
CREATE TRIGGER IF NOT EXISTS deposit_notice_booking_confirm AFTER UPDATE OF status ON bookings WHEN NEW.space_id<>'food-only' AND NEW.status='confirmed' AND OLD.status<>'confirmed' BEGIN
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'payment',b.booking_code||':payment',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND (CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END)=0 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.payment') FROM settings WHERE key='deposit_alimtalk'),0)=1;
INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload) SELECT b.booking_code,'account',b.booking_code||':account',datetime('now'),json_object('name',b.customer_name,'phone',b.phone,'date',b.date,'space',b.space_id,'start',b.start_h,'end',b.end_h,'slot',b.slot,'completion',COALESCE(r.completion_id,''),'amount',COALESCE(r.amount,json_extract(b.confirm_doc,'$.deposit'),(SELECT json_extract(q.data,'$.deposit') FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1),150000),'deduction',COALESCE(r.deduction,0),'refund',r.paid_amount,'completed_at',r.completed_at) FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code WHERE b.booking_code=NEW.booking_code AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='booking_journey'),0)=0 AND (CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE((SELECT json_extract(checks,'$.guarantee_paid') FROM inquiry_checks WHERE ref=b.inquiry_ref),0) ELSE COALESCE((SELECT paid FROM booking_deposit_checks WHERE booking_code=b.booking_code),0) END)<>0 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='deposit_alimtalk'),0)=1 AND COALESCE((SELECT json_extract(value,'$.types.account') FROM settings WHERE key='deposit_alimtalk'),0)=1;
END;

DROP TRIGGER IF EXISTS guide_booking_created;
CREATE TRIGGER IF NOT EXISTS guide_booking_created AFTER INSERT ON bookings WHEN NEW.space_id<>'food-only' BEGIN
 INSERT OR IGNORE INTO booking_guide_state(booking_code,manual_sent)
 SELECT NEW.booking_code,CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE inquiry_ref=NEW.inquiry_ref AND booking_code<>NEW.booking_code)
 THEN NULLIF(CAST((SELECT json_extract(checks,'$.guide_sent') FROM inquiry_checks WHERE ref=NEW.inquiry_ref) AS TEXT),'0') END;
 INSERT OR IGNORE INTO booking_guide_events(booking_code,revision)
 SELECT NEW.booking_code,0 WHERE NEW.status='confirmed'
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='reservation_guide'),0)=1
 AND COALESCE((SELECT json_extract(value,'$.automatic') FROM settings WHERE key='reservation_guide'),0)=1;
END;

DROP TRIGGER IF EXISTS guide_booking_changed;
CREATE TRIGGER IF NOT EXISTS guide_booking_changed AFTER UPDATE OF customer_name,phone,space_id,date,start_h,end_h,slot ON bookings
WHEN NEW.space_id<>'food-only' AND (NEW.customer_name IS NOT OLD.customer_name OR NEW.phone IS NOT OLD.phone OR NEW.space_id IS NOT OLD.space_id
 OR NEW.date IS NOT OLD.date OR NEW.start_h IS NOT OLD.start_h OR NEW.end_h IS NOT OLD.end_h
 OR ((NEW.start_h IS NULL OR NEW.end_h IS NULL) AND NEW.slot IS NOT OLD.slot) )
BEGIN
 UPDATE booking_guide_state SET revision=revision+1,needs_review=1 WHERE booking_code=NEW.booking_code;
 UPDATE booking_guide_events SET status='cancelled' WHERE booking_code=NEW.booking_code AND status='pending';
 UPDATE booking_guide_messages SET status='cancelled',error='예약 변경 · 최신 내용으로 다시 미리보기해 주세요.',updated_at=datetime('now')
 WHERE booking_code=NEW.booking_code AND mode='live' AND status='queued'
 AND (purpose='reservation-guide-v1' OR purpose GLOB 'reservation-guide-v1:r[0-9]*');
END;

DROP TRIGGER IF EXISTS guide_booking_status;
CREATE TRIGGER IF NOT EXISTS guide_booking_status AFTER UPDATE OF status ON bookings WHEN NEW.space_id<>'food-only' AND NEW.status IS NOT OLD.status BEGIN
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

DROP TRIGGER IF EXISTS journey_booking_created;
CREATE TRIGGER IF NOT EXISTS journey_booking_created AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO booking_journey_state(booking_code,confirm_version,confirmed_at,paid_state)
 VALUES(NEW.booking_code,CASE WHEN NEW.status='confirmed' THEN 1 ELSE 0 END,datetime('now','+9 hours'),0);
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at)
 SELECT 'journey-confirm:'||NEW.booking_code||':1','booking_confirmed','customer',NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),datetime('now')
 WHERE NEW.space_id<>'food-only' AND NEW.status='confirmed' AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='booking_journey'),0)=1;
END;

DROP TRIGGER IF EXISTS journey_booking_confirmed;
CREATE TRIGGER IF NOT EXISTS journey_booking_confirmed AFTER UPDATE OF status ON bookings
WHEN NEW.status='confirmed' AND OLD.status<>'confirmed' BEGIN
 UPDATE booking_journey_state SET confirm_version=confirm_version+1,confirmed_at=datetime('now','+9 hours'),paid_state=0 WHERE booking_code=NEW.booking_code;
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at)
 SELECT 'journey-confirm:'||NEW.booking_code||':'||confirm_version,'booking_confirmed','customer',NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),datetime('now')
 FROM booking_journey_state WHERE NEW.space_id<>'food-only' AND booking_code=NEW.booking_code AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='booking_journey'),0)=1;
END;

DROP TRIGGER IF EXISTS transaction_notify_cancel;
CREATE TRIGGER IF NOT EXISTS transaction_notify_cancel AFTER UPDATE OF status ON bookings
WHEN NEW.space_id<>'food-only' AND NEW.status='cancelled' AND OLD.status IN ('confirmed','completed','payment_review')
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at)
 SELECT 'cancel:'||NEW.booking_code||':'||COALESCE(MAX(id),0),'booking_cancelled','customer',
 NEW.booking_code,NEW.booking_code,COALESCE(NEW.phone,''),COALESCE(NEW.updated_at,datetime('now'))
 FROM booking_reconfirmations WHERE booking_code=NEW.booking_code;
END;

DROP TRIGGER IF EXISTS transaction_notify_manual_refund;
CREATE TRIGGER IF NOT EXISTS transaction_notify_manual_refund AFTER INSERT ON booking_payment_entries
WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE booking_code=NEW.booking_code AND space_id='food-only') AND NEW.kind='refund' AND NEW.amount>0
BEGIN
 INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,amount,occurred_at)
 SELECT 'manual-refund:'||NEW.id,'rental_refund','customer',b.booking_code,b.booking_code,COALESCE(b.phone,''),NEW.amount,NEW.created_at
 FROM bookings b WHERE b.booking_code=NEW.booking_code;
END;
