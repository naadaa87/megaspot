-- Additive only; existing orders, bookings and payment accounts remain intact.
-- Admin-created immutable payment descriptions; a link may have only one external payment attempt.
CREATE TABLE IF NOT EXISTS payment_links (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 request_fingerprint TEXT NOT NULL,
 token TEXT NOT NULL UNIQUE,
 token_hash TEXT NOT NULL UNIQUE,
 service TEXT NOT NULL CHECK(service IN ('rental','catering','other')),
 purpose TEXT NOT NULL CHECK(purpose IN ('deposit','balance','full')),
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1000 AND 100000000),
 event_date TEXT,space_id TEXT,headcount INTEGER,start_h INTEGER,end_h INTEGER,
 booking_code TEXT,booking_snapshot TEXT,
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 order_oid TEXT UNIQUE,
 attempt_state TEXT NOT NULL DEFAULT 'none',
 payurl TEXT,event_token TEXT,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_links_created ON payment_links(created_at);
