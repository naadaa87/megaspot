-- Additive; does not enqueue or resend notices for existing bookings.
CREATE TABLE IF NOT EXISTS booking_contacts (
 booking_code TEXT PRIMARY KEY REFERENCES bookings(booking_code),
 phone2 TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL
);
