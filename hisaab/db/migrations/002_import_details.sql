-- Phase 1: remember who a transaction was with, and more about each import.

ALTER TABLE transactions ADD COLUMN is_person INTEGER NOT NULL DEFAULT 0;   -- paid to/from an individual
ALTER TABLE transactions ADD COLUMN reference TEXT NOT NULL DEFAULT '';     -- UPI / IMPS reference number

ALTER TABLE imports ADD COLUMN format TEXT NOT NULL DEFAULT '';
ALTER TABLE imports ADD COLUMN period_start TEXT;
ALTER TABLE imports ADD COLUMN period_end TEXT;

CREATE INDEX ix_transactions_import ON transactions (import_id);
CREATE INDEX ix_transactions_payee ON transactions (payee COLLATE NOCASE);
