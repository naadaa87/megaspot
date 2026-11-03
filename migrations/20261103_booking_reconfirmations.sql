CREATE TABLE IF NOT EXISTS booking_reconfirmations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_code TEXT NOT NULL,
 request_id TEXT NOT NULL,
 signature TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 show_amount INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 processing_token TEXT NOT NULL,
 UNIQUE(booking_code,request_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_reconfirmations_code ON booking_reconfirmations(booking_code,id);
