BEGIN;
ALTER TABLE alsvid_v2.storefront_orders DROP CONSTRAINT storefront_orders_status_check;
ALTER TABLE alsvid_v2.storefront_orders ADD CONSTRAINT storefront_orders_status_check CHECK(status IN ('submitted','quoted','accepted','allocated','partially_paid','paid','shipped','declined','cancelled'));
CREATE TABLE alsvid_v2.storefront_order_shipments (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(), order_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.storefront_orders(id),
 carrier text NOT NULL CHECK(length(trim(carrier)) BETWEEN 1 AND 120), tracking_no text NOT NULL CHECK(length(trim(tracking_no)) BETWEEN 1 AND 120),
 shipped_by text NOT NULL, shipped_at timestamptz NOT NULL DEFAULT now(),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TRIGGER guard_storefront_order_shipments BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_order_shipments FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
ALTER TABLE alsvid_v2.inventory_ledger ADD COLUMN storefront_order_item_uuid uuid REFERENCES alsvid_v2.storefront_order_items(id);
ALTER TABLE alsvid_v2.inventory_ledger DROP CONSTRAINT inventory_ledger_source_type_check;
ALTER TABLE alsvid_v2.inventory_ledger ADD CONSTRAINT inventory_ledger_source_type_check CHECK(source_type IN ('stock_movement','repair_stock_event','opening_balance','production_order_material','dealer_order_item','storefront_order_item'));
ALTER TABLE alsvid_v2.inventory_ledger DROP CONSTRAINT inventory_ledger_source_uuid_check;
ALTER TABLE alsvid_v2.inventory_ledger ADD CONSTRAINT inventory_ledger_source_uuid_check CHECK (
 (source_type='stock_movement' AND stock_movement_uuid IS NOT NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL)
 OR (source_type='repair_stock_event' AND repair_stock_event_uuid IS NOT NULL AND stock_movement_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL)
 OR (source_type='production_order_material' AND production_order_material_uuid IS NOT NULL AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL)
 OR (source_type='opening_balance' AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL)
 OR (source_type='dealer_order_item' AND dealer_order_item_uuid IS NOT NULL AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND storefront_order_item_uuid IS NULL)
 OR (source_type='storefront_order_item' AND storefront_order_item_uuid IS NOT NULL AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL));
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
  ELSIF NEW.source_type='repair_stock_event' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.repair_stock_events WHERE id=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.repair_stock_event_uuid IS NOT NULL AND NEW.repair_stock_event_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory ledger repair event reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=expected_uuid;
    NEW.production_order_material_uuid:=NULL;
  ELSIF NEW.source_type='production_order_material' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.production_order_materials
    WHERE order_id||':'||id::text=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.production_order_material_uuid IS NOT NULL AND NEW.production_order_material_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory ledger production material reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=expected_uuid;
  ELSIF NEW.source_type='dealer_order_item' THEN
    SELECT id INTO expected_uuid FROM alsvid_v2.dealer_order_items WHERE id::text=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.dealer_order_item_uuid IS NOT NULL AND NEW.dealer_order_item_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'dealer order item reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.dealer_order_item_uuid:=expected_uuid;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=NULL;
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
  ELSIF NEW.source_type='opening_balance' THEN
    IF NEW.stock_movement_uuid IS NOT NULL OR NEW.repair_stock_event_uuid IS NOT NULL
       OR NEW.production_order_material_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'opening balance cannot reference a source record' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported inventory ledger source type' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
