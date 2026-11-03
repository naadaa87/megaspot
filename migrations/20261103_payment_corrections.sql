-- Corrections append history; original receipt/refund rows remain intact.
CREATE TABLE IF NOT EXISTS booking_payment_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_code TEXT NOT NULL,
 entry_id INTEGER NOT NULL REFERENCES booking_payment_entries(id),
 request_id TEXT NOT NULL,
 previous_version INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('correct','void')),
 kind TEXT NOT NULL CHECK(kind IN ('receipt','refund')),
 amount INTEGER NOT NULL CHECK(amount>0),
 note TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(booking_code,request_id),
 UNIQUE(entry_id,previous_version)
);
CREATE INDEX IF NOT EXISTS idx_payment_revisions_entry ON booking_payment_revisions(entry_id,id);
CREATE INDEX IF NOT EXISTS idx_payment_revisions_booking ON booking_payment_revisions(booking_code,id);
CREATE VIEW IF NOT EXISTS booking_payment_current AS
 SELECT e.id,e.booking_code,e.request_id,COALESCE(r.kind,e.kind) AS kind,
 COALESCE(r.amount,e.amount) AS amount,COALESCE(r.note,e.note) AS note,
 CASE WHEN r.action='void' THEN 'void' ELSE 'active' END AS state,
 COALESCE(r.id,0) AS version,e.created_at,COALESCE(r.created_at,e.created_at) AS updated_at,
 e.kind AS original_kind,e.amount AS original_amount,e.note AS original_note
 FROM booking_payment_entries e LEFT JOIN booking_payment_revisions r
 ON r.id=(SELECT MAX(latest.id) FROM booking_payment_revisions latest WHERE latest.entry_id=e.id);
