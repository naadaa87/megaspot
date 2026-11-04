-- Payment notifications for staff are independent of customer Alimtalk settings.
CREATE TABLE IF NOT EXISTS admin_parking_payment_reads (
 oid TEXT PRIMARY KEY REFERENCES parking_orders(oid),
 read_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parking_admin_sms (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 oid TEXT REFERENCES parking_orders(oid),
 receiver TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'live' CHECK(mode IN ('live','test')),
 event_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'queued',
 request_id TEXT UNIQUE,
 provider_mid TEXT,
 config_hash TEXT,
 error TEXT NOT NULL DEFAULT '',
 occurred_at TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS parking_admin_sms_queue ON parking_admin_sms(status,id);
CREATE TRIGGER IF NOT EXISTS parking_admin_sms_paid AFTER UPDATE OF status ON orders
WHEN NEW.status='paid' AND OLD.status IN ('created','pending') AND NEW.test=0
 AND EXISTS(SELECT 1 FROM parking_orders WHERE oid=NEW.oid)
 AND COALESCE((SELECT json_extract(value,'$.enabled') FROM settings WHERE key='parking_admin_alerts'),0)=1
BEGIN
 INSERT OR IGNORE INTO parking_admin_sms(oid,receiver,event_key,occurred_at,config_hash)
 SELECT NEW.oid,j.value,NEW.oid||':paid:'||j.value,COALESCE(NEW.paid_at,datetime('now')),json_extract(s.value,'$.hash')
 FROM settings s,json_each(s.value,'$.phones') j WHERE s.key='parking_admin_alerts';
END;
