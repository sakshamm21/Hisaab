-- Phase 4: a log of every request sent to an AI provider, so you can see exactly what left the computer.
CREATE TABLE ai_requests (
  id         INTEGER PRIMARY KEY,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  provider   TEXT    NOT NULL,
  model      TEXT    NOT NULL,
  purpose    TEXT    NOT NULL,           -- chat | categorize | review | test
  payload    TEXT    NOT NULL,           -- the messages as sent (after masking)
  status     TEXT    NOT NULL DEFAULT 'ok'
);
CREATE INDEX ix_ai_requests_created ON ai_requests (created_at);
