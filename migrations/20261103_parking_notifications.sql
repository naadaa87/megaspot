-- No backfill: triggers record only new transitions while the parking switch is on.
CREATE TABLE IF NOT EXISTS parking_notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 oid TEXT NOT NULL REFERENCES parking_orders(oid),
 kind TEXT NOT NULL,
 event_key TEXT NOT NULL UNIQUE,
 occurred_at TEXT NOT NULL,
 payload TEXT NOT NULL DEFAULT '{}',
 mode TEXT NOT NULL DEFAULT 'live',
 status TEXT NOT NULL DEFAULT 'queued',
 request_id TEXT UNIQUE,
 provider_mid TEXT,
 sms_mid TEXT,
 phone_hash TEXT,
 config_hash TEXT,
 error TEXT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parking_notifications_queue ON parking_notifications(status,id);
CREATE TABLE IF NOT EXISTS parking_notification_links (
 notification_id INTEGER PRIMARY KEY REFERENCES parking_notifications(id),
 oid TEXT NOT NULL REFERENCES parking_orders(oid),
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL
);
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
