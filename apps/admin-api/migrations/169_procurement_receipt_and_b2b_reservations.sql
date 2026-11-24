BEGIN;

ALTER TABLE alsvid_v2.procurement_receipts
  ADD COLUMN warehouse_uuid uuid REFERENCES alsvid_v2.warehouses(entity_uuid),
  ADD COLUMN location_uuid uuid REFERENCES alsvid_v2.warehouse_locations(id);

ALTER TABLE alsvid_v2.sales_orders
  DROP CONSTRAINT sales_orders_status_check,
  ADD CONSTRAINT sales_orders_status_check CHECK (status IN (
    'WAIT_WAREHOUSE_PICK','WAIT_PRODUCTION','IN_PRODUCTION','READY_TO_SHIP',
    'IN_TRANSIT','DELIVERED','COMPLETED','CANCELLED'
  ));

ALTER TABLE alsvid_v2.inventory_reservations
  DROP CONSTRAINT inventory_reservations_source_type_check,
  ADD COLUMN sales_order_uuid uuid REFERENCES alsvid_v2.sales_orders(id),
  ADD CONSTRAINT inventory_reservations_source_type_check
    CHECK (source_type IN ('production_order','sales_order','storefront_order','b2b_sales_order','repair','manual'));

DROP TRIGGER inventory_reservations_immutable ON alsvid_v2.inventory_reservations;
DROP TRIGGER sync_inventory_reservation_source_uuid ON alsvid_v2.inventory_reservations;

ALTER TABLE alsvid_v2.inventory_reservations
  DROP CONSTRAINT inventory_reservations_source_uuid_check,
  ADD CONSTRAINT inventory_reservations_source_uuid_check CHECK (
    (source_type='production_order' AND production_order_material_uuid IS NOT NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL AND sales_order_uuid IS NULL)
    OR (source_type='sales_order' AND dealer_order_item_uuid IS NOT NULL AND production_order_material_uuid IS NULL AND storefront_order_item_uuid IS NULL AND sales_order_uuid IS NULL)
    OR (source_type='storefront_order' AND storefront_order_item_uuid IS NOT NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND sales_order_uuid IS NULL)
    OR (source_type='b2b_sales_order' AND sales_order_uuid IS NOT NULL AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL)
    OR (source_type IN ('repair','manual') AND production_order_material_uuid IS NULL AND dealer_order_item_uuid IS NULL AND storefront_order_item_uuid IS NULL AND sales_order_uuid IS NULL)
  );
CREATE INDEX inventory_reservations_b2b_sales_order_idx
  ON alsvid_v2.inventory_reservations(sales_order_uuid,status)
  WHERE sales_order_uuid IS NOT NULL;

CREATE OR REPLACE FUNCTION alsvid_v2.sync_inventory_reservation_source_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_uuid uuid;
BEGIN
  IF NEW.source_type='production_order' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.production_order_materials
    WHERE order_id||':'||id::text=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.production_order_material_uuid IS NOT NULL AND NEW.production_order_material_uuid<>expected_uuid)
       OR NEW.dealer_order_item_uuid IS NOT NULL OR NEW.storefront_order_item_uuid IS NOT NULL OR NEW.sales_order_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation production material reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.production_order_material_uuid:=expected_uuid;
  ELSIF NEW.source_type='sales_order' THEN
    SELECT id INTO expected_uuid FROM alsvid_v2.dealer_order_items
    WHERE order_id::text||':'||id::text=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.dealer_order_item_uuid IS NOT NULL AND NEW.dealer_order_item_uuid<>expected_uuid)
       OR NEW.production_order_material_uuid IS NOT NULL OR NEW.storefront_order_item_uuid IS NOT NULL OR NEW.sales_order_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation dealer order reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.dealer_order_item_uuid:=expected_uuid;
  ELSIF NEW.source_type='storefront_order' THEN
    SELECT id INTO expected_uuid FROM alsvid_v2.storefront_order_items
    WHERE id::text=NEW.source_id AND sku_uuid=NEW.sku_uuid AND quantity=NEW.quantity;
    IF expected_uuid IS NULL OR (NEW.storefront_order_item_uuid IS NOT NULL AND NEW.storefront_order_item_uuid<>expected_uuid)
       OR NEW.production_order_material_uuid IS NOT NULL OR NEW.dealer_order_item_uuid IS NOT NULL OR NEW.sales_order_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation storefront order reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.storefront_order_item_uuid:=expected_uuid;
  ELSIF NEW.source_type='b2b_sales_order' THEN
    SELECT id INTO expected_uuid FROM alsvid_v2.sales_orders WHERE id::text=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.sales_order_uuid IS NOT NULL AND NEW.sales_order_uuid<>expected_uuid)
       OR NEW.production_order_material_uuid IS NOT NULL OR NEW.dealer_order_item_uuid IS NOT NULL OR NEW.storefront_order_item_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation B2B sales order reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.sales_order_uuid:=expected_uuid;
  ELSIF NEW.source_type IN ('repair','manual') THEN
    IF NEW.production_order_material_uuid IS NOT NULL OR NEW.dealer_order_item_uuid IS NOT NULL OR NEW.storefront_order_item_uuid IS NOT NULL OR NEW.sales_order_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation source UUID does not match its type' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported inventory reservation source type' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_inventory_reservation_source_uuid
BEFORE INSERT OR UPDATE OF source_type,source_id,production_order_material_uuid,dealer_order_item_uuid,storefront_order_item_uuid,sales_order_uuid
ON alsvid_v2.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_inventory_reservation_source_uuid();

CREATE OR REPLACE FUNCTION alsvid_v2.protect_inventory_reservation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'inventory reservation history is retained' USING ERRCODE='23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.sku_uuid IS DISTINCT FROM OLD.sku_uuid
     OR NEW.warehouse_uuid IS DISTINCT FROM OLD.warehouse_uuid OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.production_order_material_uuid IS DISTINCT FROM OLD.production_order_material_uuid
     OR NEW.dealer_order_item_uuid IS DISTINCT FROM OLD.dealer_order_item_uuid
     OR NEW.storefront_order_item_uuid IS DISTINCT FROM OLD.storefront_order_item_uuid
     OR NEW.sales_order_uuid IS DISTINCT FROM OLD.sales_order_uuid
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.status<>'reserved' OR NEW.status NOT IN ('released','consumed') THEN
    RAISE EXCEPTION 'only an active inventory reservation can transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_reservations_immutable
BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.protect_inventory_reservation();

COMMIT;
