BEGIN;

ALTER TABLE alsvid_v2.inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_source_type_check;
ALTER TABLE alsvid_v2.inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_type_check
  CHECK (source_type IN ('stock_movement','repair_stock_event','opening_balance','production_order_material'));

ALTER TABLE alsvid_v2.production_order_materials
  ADD COLUMN source_warehouse_uuid uuid REFERENCES alsvid_v2.warehouses(entity_uuid);

CREATE INDEX production_order_materials_source_warehouse_idx
  ON alsvid_v2.production_order_materials(source_warehouse_uuid)
  WHERE source_warehouse_uuid IS NOT NULL;

CREATE TABLE alsvid_v2.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
  warehouse_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouses(entity_uuid),
  quantity integer NOT NULL CHECK (quantity > 0),
  source_type text NOT NULL CHECK (source_type IN ('production_order','sales_order','repair','manual')),
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','released','consumed')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_by text,
  released_at timestamptz,
  consumed_by text,
  consumed_at timestamptz,
  note text NOT NULL DEFAULT '',
  CHECK (
    (status = 'reserved' AND released_by IS NULL AND released_at IS NULL AND consumed_by IS NULL AND consumed_at IS NULL)
    OR (status = 'released' AND released_by IS NOT NULL AND released_at IS NOT NULL AND consumed_by IS NULL AND consumed_at IS NULL)
    OR (status = 'consumed' AND released_by IS NULL AND released_at IS NULL AND consumed_by IS NOT NULL AND consumed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX inventory_reservations_active_source_uq
  ON alsvid_v2.inventory_reservations(source_type,source_id,sku_uuid,warehouse_uuid)
  WHERE status='reserved';
CREATE INDEX inventory_reservations_stock_idx
  ON alsvid_v2.inventory_reservations(sku_uuid,warehouse_uuid,status);

CREATE OR REPLACE VIEW alsvid_v2.inventory_available_balances AS
WITH on_hand AS (
  SELECT sku_uuid,warehouse_uuid,sum(quantity_delta)::bigint AS quantity
  FROM alsvid_v2.inventory_ledger
  GROUP BY sku_uuid,warehouse_uuid
), reserved AS (
  SELECT sku_uuid,warehouse_uuid,sum(quantity)::bigint AS quantity
  FROM alsvid_v2.inventory_reservations
  WHERE status='reserved'
  GROUP BY sku_uuid,warehouse_uuid
)
SELECT on_hand.sku_uuid,on_hand.warehouse_uuid,on_hand.quantity AS on_hand_quantity,
       COALESCE(reserved.quantity,0) AS reserved_quantity,
       on_hand.quantity-COALESCE(reserved.quantity,0) AS available_quantity
FROM on_hand LEFT JOIN reserved USING(sku_uuid,warehouse_uuid);

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
