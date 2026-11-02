-- Additive parking checkout and manual fulfillment. Existing orders/payments remain the payment ledger.
CREATE TABLE IF NOT EXISTS parking_sessions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id TEXT NOT NULL UNIQUE,
 plate TEXT NOT NULL,
 entry_at TEXT NOT NULL,
 free_external INTEGER NOT NULL DEFAULT 0,
 free_order TEXT,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parking_orders (
 oid TEXT PRIMARY KEY REFERENCES orders(oid),
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
CREATE INDEX IF NOT EXISTS parking_orders_queue ON parking_orders(status,visit_date,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS parking_one_processing_per_entry ON parking_orders(session_id) WHERE status = 'processing';
