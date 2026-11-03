CREATE TABLE IF NOT EXISTS booking_cancellation_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_code TEXT NOT NULL,
 request_id TEXT NOT NULL,
 previous_version INTEGER NOT NULL,
 processing_token TEXT NOT NULL,
 terms TEXT NOT NULL CHECK(json_valid(terms)),
 created_at TEXT NOT NULL,
 UNIQUE(booking_code,request_id)
);
CREATE INDEX IF NOT EXISTS idx_cancellation_revisions_booking ON booking_cancellation_revisions(booking_code,id);
CREATE TABLE IF NOT EXISTS booking_cancellation_state (
 booking_code TEXT PRIMARY KEY,
 revision INTEGER NOT NULL,
 document TEXT CHECK(document IS NULL OR json_valid(document))
);
