-- One definition of "what counts" for every report:
-- - transfers never count (moving money isn't spending)
-- - a split transaction counts through its parts, not itself
-- - rows marked "exclude from reports" don't count, and neither do the parts of an excluded split
CREATE INDEX ix_transactions_split_parent ON transactions (split_parent_id) WHERE split_parent_id IS NOT NULL;

CREATE VIEW report_tx AS
SELECT t.*
FROM transactions t
LEFT JOIN transactions p ON p.id = t.split_parent_id
WHERE t.transfer_id IS NULL
  AND t.exclude_from_reports = 0
  AND COALESCE(p.exclude_from_reports, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM transactions s WHERE s.split_parent_id = t.id);
