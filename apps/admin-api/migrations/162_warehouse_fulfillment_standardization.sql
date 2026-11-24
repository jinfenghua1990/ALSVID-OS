BEGIN;

ALTER TABLE alsvid_v2.warehouses
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS province text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zip_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_types jsonb NOT NULL DEFAULT '["B2B"]'::jsonb,
  ADD COLUMN IF NOT EXISTS inventory_strategy text NOT NULL DEFAULT 'SHARED',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;

ALTER TABLE alsvid_v2.warehouses
  DROP CONSTRAINT IF EXISTS warehouses_inventory_strategy_check;
ALTER TABLE alsvid_v2.warehouses
  ADD CONSTRAINT warehouses_inventory_strategy_check
  CHECK (inventory_strategy IN ('SHARED', 'ISOLATED'));

ALTER TABLE alsvid_v2.warehouses
  DROP CONSTRAINT IF EXISTS warehouses_business_types_check;
ALTER TABLE alsvid_v2.warehouses
  ADD CONSTRAINT warehouses_business_types_check
  CHECK (jsonb_typeof(business_types) = 'array' AND business_types <@ '["B2B","B2C","RMA"]'::jsonb AND jsonb_array_length(business_types) > 0);

ALTER TABLE alsvid_v2.warehouses
  DROP CONSTRAINT IF EXISTS warehouses_priority_check;
ALTER TABLE alsvid_v2.warehouses
  ADD CONSTRAINT warehouses_priority_check CHECK (priority BETWEEN 1 AND 9999);

COMMIT;
