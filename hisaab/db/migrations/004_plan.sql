-- Phase 2: more detail on recurring items and goals.

ALTER TABLE recurring ADD COLUMN name TEXT NOT NULL DEFAULT '';         -- shown name, e.g. "Netflix"
ALTER TABLE recurring ADD COLUMN match_text TEXT NOT NULL DEFAULT '';   -- payee text used to spot payments
ALTER TABLE recurring ADD COLUMN last_paid TEXT;                         -- date of the last matched payment
ALTER TABLE recurring ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE recurring ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));

ALTER TABLE goals ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE goals ADD COLUMN starting_amount INTEGER NOT NULL DEFAULT 0;

-- Recurring suggestions the user dismissed, so they aren't suggested again.
CREATE TABLE recurring_dismissed (
  match_text TEXT PRIMARY KEY COLLATE NOCASE
);
