BEGIN;

ALTER TABLE alsvid_v2.production_orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMIT;
