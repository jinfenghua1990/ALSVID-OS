BEGIN;

ALTER TABLE alsvid_v2.warehouses
  ADD COLUMN IF NOT EXISTS country_region text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS warehouse_purpose text NOT NULL DEFAULT '普通仓',
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';

ALTER TABLE alsvid_v2.warehouses
  DROP CONSTRAINT IF EXISTS warehouses_warehouse_purpose_check;
ALTER TABLE alsvid_v2.warehouses
  ADD CONSTRAINT warehouses_warehouse_purpose_check
  CHECK (warehouse_purpose IN ('普通仓','B2C 仓'));

ALTER TABLE alsvid_v2.inventory_reservations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_order_no text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_channel_idempotency_uq
  ON alsvid_v2.inventory_reservations(channel,idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_reservations_external_order_idx
  ON alsvid_v2.inventory_reservations(channel,external_order_no,status);

ALTER TABLE alsvid_v2.inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_source_type_check;
ALTER TABLE alsvid_v2.inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_type_check
  CHECK (source_type IN ('stock_movement','repair_stock_event','opening_balance','production_order_material','sales_order'));

COMMIT;
