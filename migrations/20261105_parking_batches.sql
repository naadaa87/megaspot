-- Preserve all existing rows and links while removing the old one-vehicle-per-payment foreign key.
CREATE TABLE IF NOT EXISTS parking_schema_versions(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL);
INSERT INTO parking_schema_versions VALUES('20261105_parking_batches',datetime('now'));
CREATE TABLE parking_migration_guard (violations INTEGER CHECK(violations=0));
INSERT INTO parking_migration_guard SELECT COUNT(*) FROM pragma_table_info('parking_orders') WHERE name='payment_oid';
PRAGMA defer_foreign_keys=ON;
DROP TRIGGER IF EXISTS parking_notify_paid;
DROP TRIGGER IF EXISTS parking_notify_arrival;
DROP TRIGGER IF EXISTS parking_notify_status;
DROP TRIGGER IF EXISTS parking_notify_cancel;
DROP TRIGGER IF EXISTS parking_notify_refund;
DROP TRIGGER IF EXISTS parking_admin_sms_paid;
CREATE TABLE IF NOT EXISTS parking_orders_new (
 oid TEXT PRIMARY KEY,
 payment_oid TEXT REFERENCES orders(oid),
 vehicle_price INTEGER CHECK(vehicle_price>0),
 plate TEXT NOT NULL,
 visit_date TEXT NOT NULL,
 ticket TEXT NOT NULL,
 hours INTEGER,
 daily_terms TEXT NOT NULL DEFAULT '',
 token_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'waiting',
 arrival_at TEXT,
 session_id INTEGER REFERENCES parking_sessions(id),
 free_hours INTEGER NOT NULL DEFAULT 0,
 paid_hours INTEGER NOT NULL DEFAULT 0,
 cost INTEGER,
 memo TEXT NOT NULL DEFAULT '',
 refund_requested_at TEXT,
 refund_reason TEXT,
 refund_reviewed_at TEXT,
 applied_at TEXT,
 updated_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
INSERT INTO parking_orders_new(oid,plate,visit_date,ticket,hours,daily_terms,token_hash,status,arrival_at,session_id,free_hours,paid_hours,cost,memo,refund_requested_at,refund_reason,refund_reviewed_at,applied_at,updated_at,created_at) SELECT oid,plate,visit_date,ticket,hours,daily_terms,token_hash,status,arrival_at,session_id,free_hours,paid_hours,cost,memo,refund_requested_at,refund_reason,refund_reviewed_at,applied_at,updated_at,created_at FROM parking_orders;
DROP TABLE parking_orders;
ALTER TABLE parking_orders_new RENAME TO parking_orders;
CREATE INDEX IF NOT EXISTS parking_orders_queue ON parking_orders(status,visit_date,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS parking_one_processing_per_entry ON parking_orders(session_id) WHERE status = 'processing';
CREATE TRIGGER IF NOT EXISTS parking_notify_paid AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status IN ('created','pending')
 AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 VALUES(NEW.oid,'paid',NEW.oid||':paid',COALESCE(NEW.paid_at,datetime('now')));
END;
CREATE TRIGGER IF NOT EXISTS parking_notify_arrival AFTER UPDATE OF arrival_at ON parking_orders
WHEN OLD.arrival_at IS NULL AND NEW.arrival_at IS NOT NULL
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 VALUES(NEW.oid,'arrival_received',NEW.oid||':arrival',NEW.arrival_at);
END;
CREATE TRIGGER IF NOT EXISTS parking_notify_status AFTER UPDATE OF status ON parking_orders
WHEN OLD.status<>NEW.status AND NEW.status IN ('applied','issue')
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 VALUES(NEW.oid,CASE NEW.status WHEN 'applied' THEN 'applied' ELSE 'issue' END,
 NEW.oid||':'||NEW.status||':'||NEW.updated_at,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS parking_notify_cancel AFTER UPDATE OF refund_requested_at ON parking_orders
WHEN NEW.refund_requested_at IS NOT NULL AND (OLD.refund_requested_at IS NULL OR OLD.refund_reviewed_at IS NOT NULL)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 VALUES(NEW.oid,'cancel_requested',NEW.oid||':cancel:'||NEW.refund_requested_at,NEW.refund_requested_at);
END;
CREATE TRIGGER IF NOT EXISTS parking_notify_refund AFTER INSERT ON payapp_refunds
WHEN EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at,payload)
 SELECT NEW.oid,CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid=NEW.oid)>=o.price THEN 'refunded' ELSE 'partially_refunded' END,
 'refund:'||NEW.mul_no,NEW.created_at,
 json_object('refund_amount',NEW.amount,'refunded_amount',MIN(o.price,(SELECT COALESCE(SUM(amount),0) FROM payapp_refunds WHERE oid=NEW.oid)))
 FROM orders o WHERE o.oid=NEW.oid;
END;
CREATE TRIGGER IF NOT EXISTS parking_admin_sms_paid AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status IN ('created','pending') AND NEW.test=0
 AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_admin_alerts'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_admin_sms(oid,receiver,event_key,occurred_at,config_hash)
 SELECT NEW.oid,j.value,NEW.oid||':paid:'||j.value,COALESCE(NEW.paid_at,datetime('now')),json_extract(s.value,'$.hash')
 FROM settings s,json_each(s.value,'$.phones') j WHERE s.key='parking_admin_alerts';
END;
-- One payment can contain independent parking registrations for up to ten vehicles.
CREATE TABLE IF NOT EXISTS parking_batches (oid TEXT PRIMARY KEY REFERENCES orders(oid),token_hash TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS parking_orders_payment ON parking_orders(payment_oid,created_at);
CREATE TRIGGER IF NOT EXISTS parking_batch_paid AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status IN ('created','pending') AND EXISTS(SELECT 1 FROM parking_batches WHERE oid=NEW.oid)
BEGIN
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at)
 SELECT p.oid,'paid',p.oid||':paid',COALESCE(NEW.paid_at,datetime('now')) FROM parking_orders p
 WHERE p.payment_oid=NEW.oid AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1;
 INSERT OR IGNORE INTO parking_admin_sms(oid,receiver,event_key,occurred_at,config_hash)
 SELECT p.oid,j.value,p.oid||':paid:'||j.value,COALESCE(NEW.paid_at,datetime('now')),json_extract(s.value,'$.hash')
 FROM parking_orders p,settings s,json_each(s.value,'$.phones') j WHERE p.payment_oid=NEW.oid AND NEW.test=0 AND s.key='parking_admin_alerts' AND json_extract(s.value,'$.enabled')=1;
END;
CREATE TRIGGER IF NOT EXISTS parking_batch_refund AFTER INSERT ON payapp_refunds
WHEN EXISTS(SELECT 1 FROM parking_batches WHERE oid=NEW.oid)
BEGIN
 UPDATE parking_orders SET status='issue',memo='통합 결제 취소 내역 확인 필요 · 등록 보류',updated_at=NEW.created_at
 WHERE payment_oid=NEW.oid AND status IN ('waiting','requested');
 INSERT OR IGNORE INTO parking_notifications(oid,kind,event_key,occurred_at,payload)
 SELECT p.oid,'refunded','refund:'||NEW.mul_no||':'||p.oid,NEW.created_at,json_object('refund_amount',p.vehicle_price,'refunded_amount',p.vehicle_price)
 FROM parking_orders p JOIN orders o ON o.oid=p.payment_oid WHERE p.payment_oid=NEW.oid
 AND (SELECT SUM(amount) FROM payapp_refunds WHERE oid=NEW.oid)>=o.price
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_alimtalk'),0)=1;
END;
-- SQLite's deferred counter retains the dropped-table references even after the
-- replacement restores every key. Check the actual graph before closing deferral.
INSERT INTO parking_migration_guard SELECT COUNT(*) FROM pragma_foreign_key_check;
DROP TABLE parking_migration_guard;
PRAGMA defer_foreign_keys=OFF;
