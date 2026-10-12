-- Read-only queries for the production deployment owner.
-- Run against the actual production D1 database bound as DB.
-- Return both result sets together; do not replace absent history with [].
-- Coordinate with the maintainer so no new paid work changes these records
-- while the snapshot is exported and reconciled for staging.

SELECT id, limit_milli_usd, spent_milli_usd, reserved_milli_usd
FROM scrape_budgets
WHERE id = 'florida-phase1-2026-10-07';

SELECT id, budget_id, county, status, reserved_milli_usd, credits,
       spent_milli_usd, created_at, completed_at
FROM browser_runs
WHERE budget_id = 'florida-phase1-2026-10-07'
ORDER BY created_at, id;
