CREATE TABLE IF NOT EXISTS deposit_account_reminder_previews (
 id TEXT PRIMARY KEY,
 items TEXT NOT NULL,
 config_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deposit_account_notice_lookup ON deposit_notifications(booking_code,kind,mode,id);
