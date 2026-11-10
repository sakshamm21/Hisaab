-- Hisaab schema v1.
-- Money is stored as INTEGER in the smallest unit (paise). Negative = money out, positive = money in.
-- Dates are ISO text: YYYY-MM-DD.

CREATE TABLE accounts (
  id                   INTEGER PRIMARY KEY,
  name                 TEXT    NOT NULL,
  kind                 TEXT    NOT NULL
                       CHECK (kind IN ('bank', 'cash', 'credit_card', 'wallet', 'investment', 'loan')),
  currency             TEXT    NOT NULL DEFAULT 'INR',
  opening_balance      INTEGER NOT NULL DEFAULT 0,
  opening_date         TEXT    NOT NULL DEFAULT (date('now')),
  include_in_net_worth INTEGER NOT NULL DEFAULT 1,
  archived             INTEGER NOT NULL DEFAULT 0,
  sort                 INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE category_groups (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE,
  kind TEXT    NOT NULL CHECK (kind IN ('expense', 'income')),
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id       INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES category_groups (id) ON DELETE CASCADE,
  name     TEXT    NOT NULL,
  icon     TEXT    NOT NULL DEFAULT 'circle',
  color    TEXT    NOT NULL DEFAULT '#8b8693',
  bucket   TEXT    CHECK (bucket IN ('need', 'want', 'saving')),
  rollover INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (group_id, name)
);

CREATE TABLE import_presets (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE,
  column_map  TEXT    NOT NULL DEFAULT '{}',  -- JSON
  date_format TEXT    NOT NULL DEFAULT '%d/%m/%Y',
  amount_mode TEXT    NOT NULL DEFAULT 'debit_credit' CHECK (amount_mode IN ('signed', 'debit_credit')),
  skip_rows   INTEGER NOT NULL DEFAULT 0,
  delimiter   TEXT    NOT NULL DEFAULT ','
);

CREATE TABLE imports (
  id         INTEGER PRIMARY KEY,
  file_name  TEXT    NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  preset_id  INTEGER REFERENCES import_presets (id) ON DELETE SET NULL,
  rows       INTEGER NOT NULL DEFAULT 0,
  imported   INTEGER NOT NULL DEFAULT 0,
  skipped    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE recurring (
  id          INTEGER PRIMARY KEY,
  kind        TEXT    NOT NULL CHECK (kind IN ('bill', 'subscription', 'income')),
  payee       TEXT    NOT NULL,
  amount      INTEGER NOT NULL,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  account_id  INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  cadence     TEXT    NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'yearly')),
  interval    INTEGER NOT NULL DEFAULT 1,
  next_due    TEXT    NOT NULL,
  auto_post   INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE transactions (
  id                   INTEGER PRIMARY KEY,
  account_id           INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  date                 TEXT    NOT NULL,
  amount               INTEGER NOT NULL,
  payee                TEXT    NOT NULL DEFAULT '',
  raw_description      TEXT    NOT NULL DEFAULT '',
  category_id          INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  notes                TEXT    NOT NULL DEFAULT '',
  tags                 TEXT    NOT NULL DEFAULT '',          -- space-separated, e.g. "goa-trip wedding"
  status               TEXT    NOT NULL DEFAULT 'cleared' CHECK (status IN ('cleared', 'pending')),
  transfer_id          TEXT,                                  -- shared by the two rows of a transfer
  split_parent_id      INTEGER REFERENCES transactions (id) ON DELETE CASCADE,
  recurring_id         INTEGER REFERENCES recurring (id) ON DELETE SET NULL,
  import_id            INTEGER REFERENCES imports (id) ON DELETE SET NULL,
  fingerprint          TEXT,                                  -- for skipping duplicate imports
  reviewed             INTEGER NOT NULL DEFAULT 1,            -- 0 = waiting in the review inbox
  exclude_from_reports INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX ix_transactions_date         ON transactions (date);
CREATE INDEX ix_transactions_account_date ON transactions (account_id, date);
CREATE INDEX ix_transactions_category     ON transactions (category_id);
CREATE INDEX ix_transactions_transfer     ON transactions (transfer_id);
CREATE INDEX ix_transactions_reviewed     ON transactions (reviewed) WHERE reviewed = 0;
CREATE UNIQUE INDEX ux_transactions_fingerprint
  ON transactions (account_id, fingerprint) WHERE fingerprint IS NOT NULL;

CREATE TABLE budgets (
  month       TEXT    NOT NULL,  -- YYYY-MM (financial month)
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  PRIMARY KEY (month, category_id)
);

CREATE TABLE goals (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  target_amount INTEGER NOT NULL,
  target_date   TEXT,
  account_id    INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  icon          TEXT    NOT NULL DEFAULT 'target',
  color         TEXT    NOT NULL DEFAULT '#8b8693',
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE goal_entries (
  id      INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  date    TEXT    NOT NULL,
  amount  INTEGER NOT NULL
);

CREATE TABLE rules (
  id              INTEGER PRIMARY KEY,
  priority        INTEGER NOT NULL DEFAULT 100,
  field           TEXT    NOT NULL CHECK (field IN ('payee', 'description')),
  match           TEXT    NOT NULL CHECK (match IN ('contains', 'equals', 'regex')),
  pattern         TEXT    NOT NULL,
  set_category_id INTEGER REFERENCES categories (id) ON DELETE CASCADE,
  set_payee       TEXT,
  set_tags        TEXT
);

CREATE TABLE payee_memory (
  payee       TEXT    PRIMARY KEY COLLATE NOCASE,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  times_used  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE ai_messages (
  id         INTEGER PRIMARY KEY,
  thread_id  TEXT    NOT NULL,
  role       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  tool_calls TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_ai_messages_thread ON ai_messages (thread_id, id);
