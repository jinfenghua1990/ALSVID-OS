-- P0 修复：152 迁移中的流转方向 CHECK 写成了 IS DISTINCT FROM，
-- 当 from/to 都为 NULL（如 VIRTUAL_IN 无来源仓）时也返回 false，误拒合法记录。
-- 正确语义：只有两端都非空且相等时才拒绝。
BEGIN;

ALTER TABLE alsvid_v2.vehicle_asset_ledger DROP CONSTRAINT IF EXISTS vehicle_asset_ledger_check;
ALTER TABLE alsvid_v2.vehicle_asset_ledger DROP CONSTRAINT IF EXISTS vehicle_asset_ledger_warehouse_check;
ALTER TABLE alsvid_v2.vehicle_asset_ledger ADD CONSTRAINT vehicle_asset_ledger_warehouse_check
  CHECK (from_warehouse_uuid IS NULL
      OR to_warehouse_uuid IS NULL
      OR from_warehouse_uuid <> to_warehouse_uuid);

COMMIT;
