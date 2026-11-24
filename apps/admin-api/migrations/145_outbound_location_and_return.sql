-- P0 修复：出库单支持来源库位 + 出库退回（红冲）
-- 1) 出库单记录来源库位，库存流水按指定库位记账（此前一律落默认库位）
-- 2) 新增出库退回，按原单明细反向记账（source_type='outbound_return'），支持部分退回
BEGIN;

-- 1) 来源库位
ALTER TABLE alsvid_v2.inventory_outbound_orders
  ADD COLUMN IF NOT EXISTS location_uuid uuid REFERENCES alsvid_v2.warehouse_locations(id),
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS return_reason text NOT NULL DEFAULT '' CHECK (length(return_reason) <= 500);

-- 2) 明细记录已退回数量
ALTER TABLE alsvid_v2.inventory_outbound_items
  ADD COLUMN IF NOT EXISTS returned_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE alsvid_v2.inventory_outbound_items
  DROP CONSTRAINT IF EXISTS inventory_outbound_items_returned_quantity_check;
ALTER TABLE alsvid_v2.inventory_outbound_items
  ADD CONSTRAINT inventory_outbound_items_returned_quantity_check
  CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);

-- 3) 出库单状态增加「已退回」（全部退回时）
ALTER TABLE alsvid_v2.inventory_outbound_orders
  DROP CONSTRAINT IF EXISTS inventory_outbound_orders_status_check;
ALTER TABLE alsvid_v2.inventory_outbound_orders
  ADD CONSTRAINT inventory_outbound_orders_status_check
  CHECK (status IN ('待出库','已完成','已取消','已退回'));

-- 4) 流水来源类型增加出库退回
ALTER TABLE alsvid_v2.inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_source_type_check;
ALTER TABLE alsvid_v2.inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_type_check
  CHECK (source_type IN (
    'stock_movement','repair_stock_event','opening_balance','production_order_material',
    'stocktake_correction','dealer_order_item','storefront_order_item',
    'storefront_return_receipt_item','storefront_return_restock','sales_order',
    'manual_adjustment','outbound_order','outbound_return'
  ));

-- 5) 库位账本触发器：出库相关流水按出库单指定库位记账
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
  ELSE
    SELECT id INTO location_id FROM alsvid_v2.warehouse_locations
    WHERE warehouse_uuid=NEW.warehouse_uuid AND is_default AND status='启用';
  END IF;
  IF location_id IS NULL THEN RAISE EXCEPTION 'inventory warehouse location is missing' USING ERRCODE='23503'; END IF;
  INSERT INTO alsvid_v2.inventory_location_ledger(
    inventory_ledger_uuid,location_uuid,sku_uuid,quantity_delta,source_type,source_id,line_no,created_at
  ) VALUES(NEW.id,location_id,NEW.sku_uuid,NEW.quantity_delta,NEW.source_type,NEW.source_id,NEW.line_no,NEW.created_at);
  RETURN NEW;
END;
$$;

COMMIT;
