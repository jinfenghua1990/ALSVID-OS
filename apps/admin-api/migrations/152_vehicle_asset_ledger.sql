-- P0 数据底座：VIN 级资产流水账。
-- 规格 §3.3：同一 VIN 允许多次合法流转，流水逐次新增；不删除、只冲正。
-- 与 SKU 级 inventory_ledger 并行，由同一业务事务双写；event_key 保证幂等。
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.vehicle_asset_ledger (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  event_key text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 1 AND 200),
  vin_uuid uuid NOT NULL REFERENCES alsvid_v2.vins(entity_uuid) ON DELETE RESTRICT,
  sku_uuid uuid REFERENCES alsvid_v2.skus(entity_uuid) ON DELETE RESTRICT,
  from_warehouse_uuid uuid REFERENCES alsvid_v2.warehouses(entity_uuid) ON DELETE RESTRICT,
  to_warehouse_uuid uuid REFERENCES alsvid_v2.warehouses(entity_uuid) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN (
    'VIRTUAL_IN', 'VIRTUAL_OUT', 'PHYSICAL_IN', 'PHYSICAL_OUT',
    'TRANSFER', 'RETURN_IN', 'RESERVE', 'RELEASE', 'ADJUST'
  )),
  source_type text NOT NULL CHECK (length(source_type) BETWEEN 1 AND 60),
  source_id text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (from_warehouse_uuid IS DISTINCT FROM to_warehouse_uuid),
  CHECK (substring(id::text, 15, 1) = '7' AND substring(id::text, 20, 1) IN ('8','9','a','b'))
);

CREATE INDEX IF NOT EXISTS vehicle_asset_ledger_timeline_idx
  ON alsvid_v2.vehicle_asset_ledger(vin_uuid, occurred_at, id);
CREATE INDEX IF NOT EXISTS vehicle_asset_ledger_source_idx
  ON alsvid_v2.vehicle_asset_ledger(source_type, source_id);
CREATE INDEX IF NOT EXISTS vehicle_asset_ledger_movement_idx
  ON alsvid_v2.vehicle_asset_ledger(movement_type, occurred_at);

COMMIT;
