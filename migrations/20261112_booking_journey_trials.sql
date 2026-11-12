
-- Operator delivery proof is isolated from real bookings, calendars, revenue and refunds.
CREATE TABLE IF NOT EXISTS booking_journey_trials (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL UNIQUE,
 link_cipher TEXT NOT NULL,
 payload TEXT NOT NULL,
 notification_id INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
