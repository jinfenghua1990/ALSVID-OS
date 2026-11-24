-- P0 修复：库存盘点更正流水的库位台账记账
-- 145 号迁移用 CREATE OR REPLACE 重定义 record_inventory_location_ledger 时，
-- 遗漏了 130 号迁移里的 stocktake_correction 分支，导致 SKU 类盘点差异
-- 一律记到仓库默认库位，而非盘点计数行实际所在库位。
-- 后果：非默认库位的盘点余额算错，重复盘点会重复记账（仓库总量校验看不出来）。
-- 本迁移基于线上当前函数定义，仅补回该分支，其余逻辑保持不变。
-- 当前无历史错位流水（inventory_stocktake_counts 为空），无需数据修正。
BEGIN;

CREATE OR REPLACE FUNCTION alsvid_v2.record_inventory_location_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE location_id uuid; movement record;
BEGIN
  IF NEW.source_type='stock_movement' THEN
    SELECT kind,from_location_uuid,to_location_uuid INTO movement
    FROM alsvid_v2.stock_movements WHERE id=NEW.source_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'inventory movement source is missing' USING ERRCODE='23503'; END IF;
    IF movement.kind='调拨' AND NEW.line_no=1 THEN location_id:=movement.from_location_uuid;
    ELSE location_id:=movement.to_location_uuid; END IF;
  ELSIF NEW.source_type IN ('outbound_order','outbound_return') THEN
    SELECT location_uuid INTO location_id FROM alsvid_v2.inventory_outbound_orders WHERE id=NEW.source_id;
    IF location_id IS NULL THEN
      SELECT id INTO location_id FROM alsvid_v2.warehouse_locations
      WHERE warehouse_uuid=NEW.warehouse_uuid AND is_default AND status='启用';
    END IF;
  ELSIF NEW.source_type='stocktake_correction' THEN
    -- 盘点更正：按盘点计数行记录的库位记账（130 号迁移原有分支，145 号覆盖时丢失）
    SELECT location_uuid INTO location_id FROM alsvid_v2.inventory_stocktake_counts WHERE id=NEW.source_id::uuid;
    IF location_id IS NULL THEN RAISE EXCEPTION 'stocktake count source is missing' USING ERRCODE='23503'; END IF;
  ELSE
    SELECT id INTO location_id FROM alsvid_v2.warehouse_locations
    WHERE warehouse_uuid=NEW.warehouse_uuid AND is_default AND status='启用';
  END IF;
  IF location_id IS NULL THEN RAISE EXCEPTION 'inventory warehouse location is missing' USING ERRCODE='23503'; END IF;
  INSERT INTO alsvid_v2.inventory_location_ledger(
    inventory_ledger_uuid,location_uuid,sku_uuid,quantity_delta,source_type,source_id,line_no,created_at
  ) VALUES(NEW.id,location_id,NEW.sku_uuid,NEW.quantity_delta,NEW.source_type,NEW.source_id,NEW.line_no,NEW.created_at);
  RETURN NEW;
END $$;

COMMIT;
