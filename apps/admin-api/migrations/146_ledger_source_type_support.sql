-- 修复：inventory_ledger 来源类型白名单未覆盖后续新增来源
-- 现状：sync_inventory_ledger_source_uuid()（049 版）只认 8 种来源，
-- 导致 sales_order / manual_adjustment / stocktake_correction / outbound_order / outbound_return
-- 写入流水时直接抛 "unsupported inventory ledger source type"。
-- 本迁移重建约束与触发器函数，保持原有引用强校验不变，新增「无专用引用列」来源分支。
BEGIN;

ALTER TABLE alsvid_v2.inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_source_uuid_check;

ALTER TABLE alsvid_v2.inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_uuid_check CHECK (
    (source_type='stock_movement' AND stock_movement_uuid IS NOT NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL AND storefront_return_receipt_item_uuid IS NULL AND storefront_return_restock_uuid IS NULL) OR
    (source_type='repair_stock_event' AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NOT NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL AND storefront_return_receipt_item_uuid IS NULL AND storefront_return_restock_uuid IS NULL) OR
    (source_type='production_order_material' AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NOT NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL AND storefront_return_receipt_item_uuid IS NULL AND storefront_return_restock_uuid IS NULL) OR
    (source_type='dealer_order_item' AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NOT NULL AND storefront_order_item_uuid IS NULL AND storefront_return_receipt_item_uuid IS NULL AND storefront_return_restock_uuid IS NULL) OR
    (source_type='storefront_order_item' AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NOT NULL AND storefront_return_receipt_item_uuid IS NULL AND storefront_return_restock_uuid IS NULL) OR
    (source_type='storefront_return_receipt_item' AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL AND storefront_return_receipt_item_uuid IS NOT NULL AND storefront_return_restock_uuid IS NULL) OR
    (source_type='storefront_return_restock' AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL AND storefront_return_receipt_item_uuid IS NULL AND storefront_return_restock_uuid IS NOT NULL) OR
    (source_type IN ('opening_balance','sales_order','manual_adjustment','stocktake_correction','outbound_order','outbound_return')
      AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL
      AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL
      AND storefront_return_receipt_item_uuid IS NULL AND storefront_return_restock_uuid IS NULL)
  );

CREATE OR REPLACE FUNCTION alsvid_v2.sync_inventory_ledger_source_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_uuid uuid;
BEGIN
  IF NEW.source_type='stock_movement' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.stock_movements WHERE id=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.stock_movement_uuid IS NOT NULL AND NEW.stock_movement_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory ledger stock movement reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.stock_movement_uuid:=expected_uuid;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=NULL;
    NEW.dealer_order_item_uuid:=NULL;
    NEW.storefront_order_item_uuid:=NULL;
    NEW.storefront_return_receipt_item_uuid:=NULL;
    NEW.storefront_return_restock_uuid:=NULL;
  ELSIF NEW.source_type='repair_stock_event' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.repair_stock_events WHERE id=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.repair_stock_event_uuid IS NOT NULL AND NEW.repair_stock_event_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory ledger repair event reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=expected_uuid;
    NEW.production_order_material_uuid:=NULL;
    NEW.dealer_order_item_uuid:=NULL;
    NEW.storefront_order_item_uuid:=NULL;
    NEW.storefront_return_receipt_item_uuid:=NULL;
    NEW.storefront_return_restock_uuid:=NULL;
  ELSIF NEW.source_type='production_order_material' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.production_order_materials WHERE order_id||':'||id::text=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.production_order_material_uuid IS NOT NULL AND NEW.production_order_material_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory ledger production material reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=expected_uuid;
    NEW.dealer_order_item_uuid:=NULL;
    NEW.storefront_order_item_uuid:=NULL;
    NEW.storefront_return_receipt_item_uuid:=NULL;
    NEW.storefront_return_restock_uuid:=NULL;
  ELSIF NEW.source_type='dealer_order_item' THEN
    SELECT id INTO expected_uuid FROM alsvid_v2.dealer_order_items WHERE id::text=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.dealer_order_item_uuid IS NOT NULL AND NEW.dealer_order_item_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'dealer order item reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.dealer_order_item_uuid:=expected_uuid;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=NULL;
    NEW.storefront_order_item_uuid:=NULL;
    NEW.storefront_return_receipt_item_uuid:=NULL;
    NEW.storefront_return_restock_uuid:=NULL;
  ELSIF NEW.source_type='storefront_order_item' THEN
    SELECT i.id INTO expected_uuid FROM alsvid_v2.storefront_order_items i JOIN alsvid_v2.storefront_order_allocations a ON a.item_id=i.id
    WHERE i.id::text=NEW.source_id AND i.sku_uuid=NEW.sku_uuid AND a.warehouse_uuid=NEW.warehouse_uuid AND NEW.quantity_delta=-i.quantity;
    IF expected_uuid IS NULL OR (NEW.storefront_order_item_uuid IS NOT NULL AND NEW.storefront_order_item_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'storefront order item reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.storefront_order_item_uuid:=expected_uuid;
    NEW.dealer_order_item_uuid:=NULL;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=NULL;
    NEW.storefront_return_receipt_item_uuid:=NULL;
    NEW.storefront_return_restock_uuid:=NULL;
  ELSIF NEW.source_type='storefront_return_receipt_item' THEN
    SELECT ri.id INTO expected_uuid FROM alsvid_v2.storefront_return_receipt_items ri JOIN alsvid_v2.storefront_return_items i ON i.id=ri.return_item_id JOIN alsvid_v2.storefront_order_items oi ON oi.id=i.order_item_id
    WHERE ri.id::text=NEW.source_id AND ri.disposition='restocked' AND ri.warehouse_uuid=NEW.warehouse_uuid AND oi.sku_uuid=NEW.sku_uuid AND NEW.quantity_delta=ri.quantity;
    IF expected_uuid IS NULL OR (NEW.storefront_return_receipt_item_uuid IS NOT NULL AND NEW.storefront_return_receipt_item_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'storefront return receipt item reference is invalid' USING ERRCODE='23503'; END IF;
    NEW.storefront_return_receipt_item_uuid:=expected_uuid;
    NEW.storefront_order_item_uuid:=NULL; NEW.dealer_order_item_uuid:=NULL; NEW.stock_movement_uuid:=NULL; NEW.repair_stock_event_uuid:=NULL; NEW.production_order_material_uuid:=NULL;
    NEW.storefront_return_restock_uuid:=NULL;
  ELSIF NEW.source_type='storefront_return_restock' THEN
    SELECT e.id INTO expected_uuid FROM alsvid_v2.storefront_return_restock_events e JOIN alsvid_v2.storefront_return_receipt_items ri ON ri.id=e.receipt_item_id JOIN alsvid_v2.storefront_return_items i ON i.id=ri.return_item_id JOIN alsvid_v2.storefront_order_items oi ON oi.id=i.order_item_id
    WHERE e.id::text=NEW.source_id AND ri.disposition='not_restocked' AND e.warehouse_uuid=NEW.warehouse_uuid AND oi.sku_uuid=NEW.sku_uuid AND NEW.quantity_delta=e.quantity;
    IF expected_uuid IS NULL OR (NEW.storefront_return_restock_uuid IS NOT NULL AND NEW.storefront_return_restock_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'storefront return restock reference is invalid' USING ERRCODE='23503'; END IF;
    NEW.storefront_return_restock_uuid:=expected_uuid;
    NEW.storefront_return_receipt_item_uuid:=NULL; NEW.storefront_order_item_uuid:=NULL; NEW.dealer_order_item_uuid:=NULL; NEW.stock_movement_uuid:=NULL; NEW.repair_stock_event_uuid:=NULL; NEW.production_order_material_uuid:=NULL;
  ELSIF NEW.source_type IN ('opening_balance','sales_order','manual_adjustment','stocktake_correction','outbound_order','outbound_return') THEN
    -- 这些来源以 source_id 文本直接追溯业务单据，不使用专用 uuid 引用列
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=NULL;
    NEW.dealer_order_item_uuid:=NULL;
    NEW.storefront_order_item_uuid:=NULL;
    NEW.storefront_return_receipt_item_uuid:=NULL;
    NEW.storefront_return_restock_uuid:=NULL;
  ELSE
    RAISE EXCEPTION 'unsupported inventory ledger source type' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
