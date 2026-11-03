-- Provider notices are deduplicated separately from effective refund accounting.
CREATE TABLE IF NOT EXISTS payapp_refund_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_key TEXT NOT NULL UNIQUE,
 oid TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('baseline','partial','full')),
 original_no TEXT NOT NULL,
 refund_no TEXT NOT NULL,
 raw_amount INTEGER NOT NULL CHECK(raw_amount>=0),
 effective_amount INTEGER NOT NULL CHECK(effective_amount>=0),
 state_changed INTEGER NOT NULL DEFAULT 0,
 fingerprint TEXT NOT NULL,
 processing_token TEXT NOT NULL,
 provider_at TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payapp_refund_events_oid ON payapp_refund_events(oid,created_at,event_key);
