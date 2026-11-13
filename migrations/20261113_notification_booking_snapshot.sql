-- Existing rows remain NULL; only new claims record their exact booking revision.
ALTER TABLE transaction_notifications ADD COLUMN booking_snapshot TEXT;
