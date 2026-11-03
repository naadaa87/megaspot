CREATE TABLE IF NOT EXISTS booking_guide_messages (
  id TEXT PRIMARY KEY,
  booking_code TEXT,
  purpose TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live','test')),
  status TEXT NOT NULL CHECK (status IN ('queued','sending','accepted','unknown','delivered','failed','cancelled')),
  snapshot TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  provider_mid TEXT,
  provider_result TEXT,
  error TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS guide_messages_booking ON booking_guide_messages(booking_code,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS guide_messages_one_active ON booking_guide_messages(booking_code,purpose) WHERE mode='live' AND status IN ('queued','sending','accepted','unknown','delivered');
CREATE TABLE IF NOT EXISTS booking_guide_previews (id TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at INTEGER NOT NULL);
