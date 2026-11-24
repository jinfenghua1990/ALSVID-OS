-- Reserve warehouse stock for dealer orders after quote acceptance.
BEGIN;

LOCK TABLE alsvid_v2.dealer_orders, alsvid_v2.dealer_order_items,
  alsvid_v2.production_order_materials, alsvid_v2.inventory_reservations
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.dealer_orders DROP CONSTRAINT dealer_orders_status_check;
ALTER TABLE alsvid_v2.dealer_orders ADD CONSTRAINT dealer_orders_status_check
  CHECK (status IN ('submitted','quoted','accepted','allocated','declined','rejected'));

CREATE TABLE alsvid_v2.dealer_order_allocations (
  item_id uuid PRIMARY KEY REFERENCES alsvid_v2.dealer_order_items(id),
  warehouse_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouses(entity_uuid),
  reservation_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.inventory_reservations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER inventory_reservations_immutable ON alsvid_v2.inventory_reservations;
DROP TRIGGER sync_inventory_reservation_source_uuid ON alsvid_v2.inventory_reservations;

ALTER TABLE alsvid_v2.inventory_reservations
  ADD COLUMN dealer_order_item_uuid uuid REFERENCES alsvid_v2.dealer_order_items(id);
UPDATE alsvid_v2.inventory_reservations r
SET dealer_order_item_uuid=i.id
FROM alsvid_v2.dealer_order_items i
WHERE r.source_type='sales_order' AND r.source_id=i.order_id::text||':'||i.id::text;

ALTER TABLE alsvid_v2.inventory_reservations
  DROP CONSTRAINT inventory_reservations_source_uuid_check,
  ADD CONSTRAINT inventory_reservations_source_uuid_check CHECK (
    (source_type='production_order' AND production_order_material_uuid IS NOT NULL
      AND dealer_order_item_uuid IS NULL)
    OR (source_type='sales_order' AND dealer_order_item_uuid IS NOT NULL
      AND production_order_material_uuid IS NULL)
    OR (source_type IN ('repair','manual') AND production_order_material_uuid IS NULL
      AND dealer_order_item_uuid IS NULL)
  );

CREATE OR REPLACE FUNCTION alsvid_v2.sync_inventory_reservation_source_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_uuid uuid;
BEGIN
  IF NEW.source_type='production_order' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.production_order_materials
    WHERE order_id||':'||id::text=NEW.source_id;
    IF expected_uuid IS NULL
       OR (NEW.production_order_material_uuid IS NOT NULL AND NEW.production_order_material_uuid<>expected_uuid)
       OR NEW.dealer_order_item_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation production material reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.production_order_material_uuid:=expected_uuid;
  ELSIF NEW.source_type='sales_order' THEN
    SELECT id INTO expected_uuid FROM alsvid_v2.dealer_order_items
    WHERE order_id::text||':'||id::text=NEW.source_id;
    IF expected_uuid IS NULL
       OR (NEW.dealer_order_item_uuid IS NOT NULL AND NEW.dealer_order_item_uuid<>expected_uuid)
       OR NEW.production_order_material_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation dealer order reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.dealer_order_item_uuid:=expected_uuid;
  ELSIF NEW.source_type IN ('repair','manual') THEN
    IF NEW.production_order_material_uuid IS NOT NULL OR NEW.dealer_order_item_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation source UUID does not match its type' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported inventory reservation source type' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_inventory_reservation_source_uuid
BEFORE INSERT OR UPDATE OF source_type,source_id,production_order_material_uuid,dealer_order_item_uuid
ON alsvid_v2.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_inventory_reservation_source_uuid();

CREATE OR REPLACE FUNCTION alsvid_v2.protect_inventory_reservation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'inventory reservation history is retained' USING ERRCODE='23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.sku_uuid IS DISTINCT FROM OLD.sku_uuid
     OR NEW.warehouse_uuid IS DISTINCT FROM OLD.warehouse_uuid
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.production_order_material_uuid IS DISTINCT FROM OLD.production_order_material_uuid
     OR NEW.dealer_order_item_uuid IS DISTINCT FROM OLD.dealer_order_item_uuid
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.status<>'reserved'
     OR NEW.status NOT IN ('released','consumed') THEN
    RAISE EXCEPTION 'only an active inventory reservation can transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_reservations_immutable
BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.protect_inventory_reservation();

COMMIT;
