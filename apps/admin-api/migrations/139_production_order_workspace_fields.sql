BEGIN;

-- postgres-service.js workspace queries reference these lifecycle/note columns.
-- They were introduced in code without a matching migration; add them safely.
ALTER TABLE alsvid_v2.production_orders
  ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS factory_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_completed_at timestamptz;

COMMIT;
