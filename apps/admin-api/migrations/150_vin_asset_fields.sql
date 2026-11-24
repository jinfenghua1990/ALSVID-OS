-- P0 数据底座：VIN 主档补资产状态与当前库存位置。
-- 规格 §3.2：库存位置与物流状态必须分离；vin 全局唯一已由 vins_vin_key 保证。
-- asset_status 只表达"可用/预占/已出库/冻结"，物流状态由 tracking_events 表达。
BEGIN;

ALTER TABLE alsvid_v2.vins
  ADD COLUMN IF NOT EXISTS asset_status text NOT NULL DEFAULT '可用',
  ADD COLUMN IF NOT EXISTS current_warehouse_uuid uuid,
  ADD COLUMN IF NOT EXISTS asset_note text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alsvid_v2.vins'::regclass AND conname = 'vins_asset_status_check'
  ) THEN
    ALTER TABLE alsvid_v2.vins ADD CONSTRAINT vins_asset_status_check
      CHECK (asset_status IN ('可用', '预占', '已出库', '冻结'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alsvid_v2.vins'::regclass AND conname = 'vins_current_warehouse_fk'
  ) THEN
    ALTER TABLE alsvid_v2.vins ADD CONSTRAINT vins_current_warehouse_fk
      FOREIGN KEY (current_warehouse_uuid) REFERENCES alsvid_v2.warehouses(entity_uuid) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vins_asset_status_idx ON alsvid_v2.vins(asset_status);
CREATE INDEX IF NOT EXISTS vins_current_warehouse_idx ON alsvid_v2.vins(current_warehouse_uuid);

COMMIT;
