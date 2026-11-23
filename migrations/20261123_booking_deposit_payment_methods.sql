CREATE TABLE IF NOT EXISTS booking_deposit_methods (
 booking_code TEXT PRIMARY KEY REFERENCES bookings(booking_code),
 method TEXT NOT NULL CHECK(method IN ('bank','card')),
 merchant_userid TEXT,
 transaction_no TEXT,
 amount INTEGER,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 UNIQUE(merchant_userid,transaction_no),
 CHECK((merchant_userid IS NULL AND transaction_no IS NULL AND amount IS NULL)
    OR (method='card' AND merchant_userid IS NOT NULL AND transaction_no IS NOT NULL AND amount IS NOT NULL AND amount>0))
);

CREATE TABLE IF NOT EXISTS booking_deposit_card_cancellations (
 merchant_userid TEXT NOT NULL,
 transaction_no TEXT NOT NULL,
 cancellation_key TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0),
 created_at TEXT NOT NULL,
 PRIMARY KEY(merchant_userid,transaction_no,cancellation_key)
);
