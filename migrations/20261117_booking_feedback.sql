CREATE TABLE IF NOT EXISTS booking_feedback (
 booking_code TEXT PRIMARY KEY REFERENCES bookings(booking_code),
 token_hash TEXT NOT NULL UNIQUE, link_cipher TEXT NOT NULL, recipient_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL, rating INTEGER CHECK(rating BETWEEN 1 AND 5),
 categories TEXT, body TEXT, contact_requested INTEGER NOT NULL DEFAULT 0 CHECK(contact_requested IN (0,1)),
 consent_version TEXT, submitted_at TEXT,
 state TEXT NOT NULL DEFAULT 'unanswered' CHECK(state IN ('unanswered','received','reviewing','resolved')),
 note TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_booking_feedback_state ON booking_feedback(state, submitted_at);
